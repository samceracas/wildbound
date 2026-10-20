import { ART_KINDS, ART_SIZES, type ArtKind, type GenerateArtResponse, type WildkinEntry } from "@wildbound/shared";
import { ImageIcon, Loader2Icon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { useArtBalance, useGenerateArt, useManagerConfig } from "@/lib/queries";
import { ErrorNotice, WildkinArt } from "./common";

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Current icon (64px) and sprite (128px), scaled up pixelated, plus the PixelLab
 * generator. Art is generated from the SAVED entry, so `ensureSaved` saves the
 * draft first when the form has unsaved changes (it returns false when saving failed).
 */
export function ArtPanel({
  entry,
  dirty,
  ensureSaved,
}: {
  entry: WildkinEntry | null;
  dirty: boolean;
  ensureSaved: () => Promise<boolean>;
}) {
  const config = useManagerConfig();
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState<ArtKind[]>([...ART_KINDS]);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [lastResult, setLastResult] = useState<GenerateArtResponse | null>(null);
  const balance = useArtBalance(open);
  const generate = useGenerateArt();
  const [saving, setSaving] = useState(false);

  const enabled = config.data?.art.enabled ?? false;
  const deleted = !!entry?.deletedAt;
  const canOpen = !!entry && enabled && !deleted;
  const cost = kinds.length;
  const gens = balance.data?.generations ?? null;
  const usd = balance.data?.usd ?? null;
  const notEnough = gens !== null && gens < cost && (usd === null || usd <= 0);

  const toggleKind = (k: ArtKind, on: boolean) =>
    setKinds((ks) => (on ? [...new Set([...ks, k])] : ks.filter((x) => x !== k)).sort() as ArtKind[]);

  const run = async () => {
    if (!entry) return;
    if (dirty) {
      setSaving(true);
      const ok = await ensureSaved().finally(() => setSaving(false));
      if (!ok) return;
    }
    generate.mutate(
      { id: entry.id, body: { kinds, extraPrompt: extraPrompt.trim() || undefined } },
      {
        onSuccess: (res) => {
          setLastResult(res);
          setOpen(false);
        },
      },
    );
  };

  const art = entry?.art ?? { icon: false, sprite: false, version: null };
  const id = entry?.id ?? "new";

  return (
    <section className="rounded-lg border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <ImageIcon className="size-4 text-gold" />
        <h2 className="font-serif text-base whitespace-nowrap">Field sketches</h2>
        <span className="ml-auto text-right text-xs text-faint">PixelLab · shown at 2×</span>
      </header>
      <div className="space-y-4 p-5">
        {/* Integer (2×) scaling keeps the pixels square. */}
        <div className="flex flex-wrap items-end gap-4">
          <figure className="space-y-1.5">
            <WildkinArt id={id} art={art} kind="sprite" size={ART_SIZES.sprite * 2} alt="Sprite" />
            <figcaption className="text-xs text-faint">Sprite · {ART_SIZES.sprite}px</figcaption>
          </figure>
          <figure className="space-y-1.5">
            <WildkinArt id={id} art={art} kind="icon" size={ART_SIZES.icon * 2} alt="Icon" />
            <figcaption className="text-xs text-faint">Icon · {ART_SIZES.icon}px</figcaption>
          </figure>
        </div>

        <div className="space-y-2">
          <Button variant="gold" disabled={!canOpen || generate.isPending} onClick={() => setOpen(true)}>
            {generate.isPending ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
            {generate.isPending ? "Generating…" : "Generate sprites with PixelLab"}
          </Button>
          {!entry ? (
            <p className="text-xs text-faint">Save the draft first; art is generated from the saved entry.</p>
          ) : deleted ? (
            <p className="text-xs text-faint">Restore this Wildkin to generate art.</p>
          ) : !enabled && config.isSuccess ? (
            <p className="text-xs text-warning">Art generation is off. Set PIXELLAB_API_KEY in .env and restart the API.</p>
          ) : dirty ? (
            <p className="text-xs text-faint">Unsaved changes will be saved as a draft before generating.</p>
          ) : (
            <p className="text-xs text-faint">Built from the physical description, visual hook and design notes.</p>
          )}
        </div>

        <ErrorNotice
          error={open ? null : generate.error}
          title={
            generate.error instanceof ApiRequestError && generate.error.code === "insufficient_credits"
              ? "Not enough PixelLab credits"
              : "Art generation failed"
          }
        />

        {lastResult ? (
          <details className="rounded-md border border-line bg-field/60 p-3 text-xs text-muted">
            <summary className="cursor-pointer text-fg">
              Generated {lastResult.generated.join(" + ")}
              {lastResult.balanceAfter?.generations != null
                ? ` · ${lastResult.balanceAfter.generations} generations left`
                : lastResult.balanceAfter?.usd != null
                  ? ` · ${fmtUsd(lastResult.balanceAfter.usd)} left`
                  : ""}
            </summary>
            <dl className="mt-2 space-y-2">
              {Object.entries(lastResult.prompts).map(([k, p]) => (
                <div key={k}>
                  <dt className="font-mono text-faint">{k}</dt>
                  <dd className="whitespace-pre-wrap">{p}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate art with PixelLab</DialogTitle>
            <DialogDescription>
              {balance.isPending ? (
                "Checking your PixelLab balance…"
              ) : balance.error ? (
                "Could not check the balance."
              ) : (
                <>
                  This uses {cost} generation{cost === 1 ? "" : "s"}
                  {gens !== null ? (
                    <>
                      ; you have <span className="font-medium text-fg">{gens}</span> left
                    </>
                  ) : null}
                  {usd !== null ? (
                    <>
                      {gens !== null ? " (plus " : "; credits: "}
                      <span className="font-medium text-fg">{fmtUsd(usd)}</span>
                      {gens !== null ? " credits)" : ""}
                    </>
                  ) : null}
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <ErrorNotice error={balance.error} />

          <div className="space-y-4">
            <div className="flex gap-6">
              {ART_KINDS.map((k) => (
                <Label key={k} className="cursor-pointer text-sm text-fg capitalize">
                  <Checkbox checked={kinds.includes(k)} onCheckedChange={(c) => toggleKind(k, c === true)} />
                  {k} <span className="text-xs text-faint">({ART_SIZES[k]}px)</span>
                </Label>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-extra">Extra direction (optional)</Label>
              <Textarea
                id="art-extra"
                className="min-h-16"
                maxLength={500}
                placeholder="e.g. facing left, muted greens, show the glowing tail tip"
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
              />
            </div>
            {dirty ? <p className="text-xs text-warning">Your unsaved changes will be saved as a draft first.</p> : null}
            {notEnough ? <p className="text-xs text-danger">Not enough generations left for this request.</p> : null}
          </div>

          <ErrorNotice error={generate.error} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={kinds.length === 0 || balance.isPending || notEnough || generate.isPending || saving}
              onClick={() => void run()}
            >
              {generate.isPending || saving ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
              {saving ? "Saving…" : generate.isPending ? "Generating…" : `Generate ${kinds.join(" + ") || "…"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
