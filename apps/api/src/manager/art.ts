import type { ArtBalance, ArtKind, WildkinEntryData } from "@wildbound/shared";

/**
 * Wildkin art generation through the PixelLab HTTP API (v2). Uses the Pixen
 * model, the cheapest image model (1 generation per image), with a transparent
 * background. Tests pass a fake ArtGenerator.
 */

export interface ArtGenerator {
  readonly model: string;
  balance(): Promise<ArtBalance>;
  generate(args: { description: string; size: number; kind: ArtKind }): Promise<Uint8Array>;
}

export class ArtError extends Error {}

/** Generations each image costs on the subscription (Pixen). */
export const GENERATIONS_PER_IMAGE = 1;

/** Shared style so new Wildkin match the hand-made ones. */
const STYLE = "cute but naturalistic creature, readable silhouette, clean pixel art, soft shading, game creature art";

/**
 * Builds the PixelLab description from the encyclopedia entry: physical
 * description first (what it looks like), then the visual hook and design notes.
 */
export function artPrompt(entry: WildkinEntryData, kind: ArtKind, extra?: string): string {
  const look = [entry.physicalDescription || entry.identity, entry.visualHook && `Signature features: ${entry.visualHook}.`]
    .filter(Boolean)
    .join(" ");
  const framing =
    kind === "icon"
      ? "Registry icon: head and shoulders portrait, facing right, centered"
      : "Full body, side view facing right, standing, centered";
  const notes = entry.visualDesignNotes ? `Design notes: ${entry.visualDesignNotes}` : "";
  const text = [`${entry.name}, a ${entry.classification || "Wildkin creature"}.`, look, framing + ".", STYLE + ".", extra, notes]
    .filter(Boolean)
    .join(" ");
  // PixelLab descriptions work best short; keep the most important parts.
  return text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
}

/** True when the balance can pay for `images` generations. */
export function canAfford(balance: ArtBalance, images: number): boolean {
  if ((balance.generations ?? 0) >= images * GENERATIONS_PER_IMAGE) return true;
  // Pixen costs about $0.01-0.02 per image when paid with credits.
  return (balance.usd ?? 0) >= images * 0.02;
}

export class PixelLabArt implements ArtGenerator {
  readonly model = "pixellab/pixen";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.pixellab.ai/v2",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}`, ...init.headers },
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw new ArtError(`Could not reach PixelLab: ${(error as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as T & { detail?: unknown };
    if (!res.ok) {
      const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? "");
      throw new ArtError(`PixelLab returned ${res.status}: ${detail}`);
    }
    return body;
  }

  async balance(): Promise<ArtBalance> {
    const body = await this.call<{
      credits?: { usd?: number | null };
      usd?: number | null;
      subscription?: { generations?: number | null; status?: string } | null;
    }>("/balance");
    const active = body.subscription && body.subscription.status !== "inactive";
    return {
      generations: active ? (body.subscription?.generations ?? null) : null,
      usd: body.credits?.usd ?? body.usd ?? null,
    };
  }

  async generate(args: { description: string; size: number }): Promise<Uint8Array> {
    const body = await this.call<{ image?: { base64?: string } }>("/create-image-pixen", {
      method: "POST",
      body: JSON.stringify({
        description: args.description,
        image_size: { width: args.size, height: args.size },
        no_background: true,
        outline: "single color black outline",
        detail: "medium detail",
        view: "side",
        direction: "east",
      }),
    });
    const b64 = body.image?.base64?.replace(/^data:image\/\w+;base64,/, "");
    if (!b64) throw new ArtError("PixelLab returned no image");
    return Buffer.from(b64, "base64");
  }
}
