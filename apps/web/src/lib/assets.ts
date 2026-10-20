import { wildkinArtPath } from "@wildbound/shared";

export type WildkinArtKind = "icon" | "sprite";

/**
 * Wildkin art is served from the database by the API (`/api/art/wildkin/<id>/<kind>.png`),
 * so creatures made in the creature manager show up without a web rebuild.
 * The PixelLab placeholder PNGs in /public stay as a fallback for the seeded species.
 */
export const wildkinIcon = (creatureId: string) => wildkinArtPath(creatureId, "icon");
export const wildkinSprite = (creatureId: string) => wildkinArtPath(creatureId, "sprite");
/** The old static copy in /public (seeded species only). */
export const wildkinStaticArt = (creatureId: string, kind: WildkinArtKind) =>
  `/wildkin/${kind === "icon" ? "icons" : "sprites"}/${creatureId}.png`;

/** Neutral pixel blob with a "?" for art that could not be loaded anywhere. */
export const WILDKIN_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
      `<path fill="#9aa596" d="M5 3h6v1h1v1h1v6h-1v1h-1v1H5v-1H4v-1H3V5h1V4h1z"/>` +
      `<path fill="#f1f4ec" d="M7 5h2v1h1v2H9v1H8v1H7V8h1V7h1V6H7v1H6V6h1zM7 11h1v1H7z"/>` +
      `</svg>`,
  );

/**
 * `onerror` step for a Wildkin <img>: API art → static /public art → placeholder.
 * Works for both React (`onError`) and plain DOM images (radar markers).
 */
export function wildkinArtFallback(img: HTMLImageElement, creatureId: string, kind: WildkinArtKind) {
  const step = img.dataset.fallback;
  if (!step) {
    img.dataset.fallback = "static";
    img.src = wildkinStaticArt(creatureId, kind);
  } else if (step === "static") {
    img.dataset.fallback = "placeholder";
    img.src = WILDKIN_PLACEHOLDER;
  }
}

export const PLAYER_HEAD = "/player/head.png";

export const registryNo = (n: number) => `No. ${String(n).padStart(3, "0")}`;
