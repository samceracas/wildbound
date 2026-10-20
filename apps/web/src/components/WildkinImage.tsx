import type { ImgHTMLAttributes } from "react";
import { wildkinArtFallback, wildkinIcon, wildkinSprite, type WildkinArtKind } from "@/lib/assets.ts";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  creatureId: string;
  kind?: WildkinArtKind;
}

/** Wildkin art from the API, falling back to the static PNG and then a neutral placeholder. */
export function WildkinImage({ creatureId, kind = "icon", alt = "", ...rest }: Props) {
  return (
    <img
      // Remount per creature so a previous fallback state never sticks to a new id.
      key={`${creatureId}:${kind}`}
      src={kind === "icon" ? wildkinIcon(creatureId) : wildkinSprite(creatureId)}
      alt={alt}
      onError={(e) => wildkinArtFallback(e.currentTarget, creatureId, kind)}
      {...rest}
    />
  );
}
