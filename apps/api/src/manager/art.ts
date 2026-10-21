import type { ArtBalance, ArtKind, MovementStyleName, WildkinEntryData } from "@wildbound/shared";

/**
 * Wildkin art generation through the PixelLab HTTP API (v2). Uses the Pixen
 * model, the cheapest image model (1 generation per image), with a transparent
 * background. Tests pass a fake ArtGenerator.
 */

export interface ArtGenerator {
  readonly model: string;
  balance(): Promise<ArtBalance>;
  /** `signal` aborts the request (the manager page was closed). */
  generate(args: { description: string; size: number; kind: ArtKind; signal?: AbortSignal }): Promise<Uint8Array>;
}

export class ArtError extends Error {}

/** Generations each image costs on the subscription (Pixen). */
export const GENERATIONS_PER_IMAGE = 1;

/** Shared style so new Wildkin match the hand-made ones. */
const STYLE = "cute but naturalistic creature, readable silhouette, clean pixel art, soft shading, game creature art";

/** Words that describe the body rather than the head; their phrases are left out of icon prompts. */
const BODY_WORDS =
  /\b(body|bodies|bodied|torso|legs?|legged|feet|foot|paws?|claws?|tails?|wings?|winged|flanks?|sides|back|belly|segments?|segmented|plates|limbs?|hind|swimming|sized|smaller|larger|long|elongated|thick)\b/i;

/**
 * Keeps the parts of a description that can describe a face (colors, eyes,
 * ears, beak, markings…) and drops the ones about the body, tail or legs.
 * Splits on sentences, commas and "and"/"with".
 */
export function faceDetails(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|,\s*|\s+(?:and|with)\s+/i)
    .map((p) => p.trim().replace(/^(?:and|with)\s+/i, "").replace(/[.;]+$/, ""))
    .filter((p) => p && !BODY_WORDS.test(p))
    .join(", ");
}

/**
 * Pose ideas per movement style. Each sprite generation picks one at random
 * (plus a random seed), so regenerating gives a different pose every time.
 */
export const SPRITE_POSES: Record<MovementStyleName, readonly string[]> = {
  still: ["resting calmly", "sitting upright", "curled up but watchful", "standing still with its head raised", "grooming itself"],
  skulker: ["crouched low to the ground", "peeking out cautiously", "frozen mid-step, listening", "slinking forward", "sniffing the air nervously"],
  forager: ["head lowered, foraging", "sniffing the ground", "sitting and nibbling food", "mid-stride, walking slowly", "pausing to look around"],
  roamer: ["striding forward", "trotting with purpose", "standing tall, looking ahead", "mid-step, glancing back", "pushing forward powerfully"],
  darter: ["mid-hop", "poised to dart away", "just landing", "tilting its head curiously", "springing upward"],
};
const ANY_POSES = ["stretching", "looking back over its shoulder", "alert, ears or crest raised", "relaxed idle stance"];

/** Picks a pose for `style`, never `avoid` (the pose of the sprite being replaced). */
export function pickPose(style: MovementStyleName, random: () => number = Math.random, avoid?: string | null): string {
  const pool = [...SPRITE_POSES[style], ...ANY_POSES].filter((p) => p !== avoid);
  return pool[Math.floor(random() * pool.length)] ?? pool[0]!;
}

/** The "Pose: …" a sprite prompt asked for, or null. */
export function poseOf(prompt: string | null | undefined): string | null {
  return prompt?.match(/Pose: ([^.]+)\./)?.[1] ?? null;
}

/**
 * Builds the PixelLab description from the encyclopedia entry.
 *
 * - icon:   a headshot (face only, cropped at the neck), front-facing, like the
 *           hand-made Registry icons. Only face-related details of the physical
 *           description are passed (see faceDetails), so the model does not drift
 *           to a full body.
 * - sprite: the whole body in side view, in a pose picked at random for the
 *           species' movement style (never the pose of the sprite it replaces),
 *           from the physical description, visual hook and design notes. No
 *           scenery, so sprites sit cleanly on the radar.
 */
export function artPrompt(
  entry: WildkinEntryData,
  kind: ArtKind,
  extra?: string,
  opts: { random?: () => number; previousPrompt?: string | null } = {},
): string {
  const subject = `${entry.name}, a ${entry.classification || "Wildkin creature"}`;
  const look = entry.physicalDescription || entry.identity;
  let parts: (string | undefined)[];
  if (kind === "icon") {
    const face = faceDetails([look, entry.visualHook].filter(Boolean).join(". "));
    parts = [
      `Headshot of ${subject}: extreme close-up of the face only, cropped at the neck, eyes filling the image, front view.`,
      "Only the head is visible: no body, no legs, no tail.",
      face && `Head colors and details: ${face}.`,
      `${STYLE}, game icon.`,
      extra,
    ];
  } else {
    const pose = pickPose(entry.movementStyle, opts.random, poseOf(opts.previousPrompt));
    parts = [
      `Full body of ${subject}, side view facing right, whole creature visible, centered.`,
      `Pose: ${pose}.`,
      "Creature only: no background scenery, no branches, no ground, no props.",
      look,
      entry.visualHook && `Signature features: ${entry.visualHook}.`,
      `${STYLE}.`,
      extra,
      entry.visualDesignNotes && `Design notes: ${entry.visualDesignNotes}`,
    ];
  }
  const text = parts.filter(Boolean).join(" ");
  // PixelLab descriptions work best short; keep the most important parts (framing and pose come first).
  return text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
}

/** PixelLab camera settings per kind: a front-facing face icon, a side-view body sprite. */
export const ART_CAMERA: Record<ArtKind, { view: "side"; direction: "south" | "east" }> = {
  icon: { view: "side", direction: "south" },
  sprite: { view: "side", direction: "east" },
};

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
        signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
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

  async generate(args: { description: string; size: number; kind: ArtKind; signal?: AbortSignal }): Promise<Uint8Array> {
    const body = await this.call<{ image?: { base64?: string } }>("/create-image-pixen", {
      method: "POST",
      signal: args.signal,
      body: JSON.stringify({
        description: args.description,
        image_size: { width: args.size, height: args.size },
        no_background: true,
        outline: "single color black outline",
        detail: "medium detail",
        ...ART_CAMERA[args.kind],
        // A fresh seed every time, so regenerating never repeats the same image.
        seed: Math.floor(Math.random() * 2_147_483_647),
      }),
    });
    const b64 = body.image?.base64?.replace(/^data:image\/\w+;base64,/, "");
    if (!b64) throw new ArtError("PixelLab returned no image");
    return Buffer.from(b64, "base64");
  }
}
