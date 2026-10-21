import type { Rarity, WildkinArtInfo, WildkinSummary } from "@wildbound/shared";
import { AlertTriangleIcon, PawPrintIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ApiRequestError, artUrl, type ApiIssue } from "@/lib/api";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, statusOf } from "@/lib/wildkin-form";

/** Generated art scaled up crisp, or a paw-print placeholder when there is none yet. */
export function WildkinArt({
  id,
  art,
  kind = "icon",
  size,
  className,
  alt = "",
}: {
  id: string;
  art: WildkinArtInfo;
  kind?: "icon" | "sprite";
  size: number;
  className?: string;
  alt?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = artUrl(id, kind, art.version);
  const has = (kind === "icon" ? art.icon : art.sprite) && broken !== src;
  return (
    <div
      className={cn("art-frame flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line", className)}
      style={{ width: size, height: size }}
    >
      {has ? (
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="pixelated size-full object-contain"
          onError={() => setBroken(src)}
        />
      ) : (
        <PawPrintIcon className="text-line-strong" style={{ width: size * 0.45, height: size * 0.45 }} />
      )}
    </div>
  );
}

const RARITY_VARIANT: Record<Rarity, "default" | "accent" | "gold" | "outline"> = {
  common: "default",
  uncommon: "accent",
  rare: "gold",
  TBD: "outline",
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <Badge variant={RARITY_VARIANT[rarity]}>{rarity === "TBD" ? "Rarity TBD" : rarity}</Badge>;
}

const STATUS_VARIANT = { draft: "warning", published: "accent", edited: "info", deleted: "danger" } as const;

export function StatusBadge({ entry }: { entry: Pick<WildkinSummary, "status" | "hasUnpublishedChanges" | "deletedAt"> }) {
  const s = statusOf(entry);
  return <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>;
}

export interface ErrorInfo {
  message: string;
  status?: number;
  code?: string;
  issues: ApiIssue[];
}

/** Plain, serialisable view of an error (ApiRequestError or anything thrown), e.g. for router state. */
export function asErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof ApiRequestError) {
    return { message: error.message, status: error.status, code: error.code, issues: error.issues };
  }
  if (error && typeof error === "object" && "message" in error) {
    const o = error as Partial<ErrorInfo>;
    return { message: String(o.message), status: o.status, code: o.code, issues: Array.isArray(o.issues) ? o.issues : [] };
  }
  return { message: String(error), issues: [] };
}

/** An API error as an inline notice, with its issue list (e.g. publish_incomplete) and an auth hint. */
export function ErrorNotice({ error, title, className }: { error: unknown; title?: string; className?: string }) {
  if (!error) return null;
  const e = asErrorInfo(error);
  const authHint = e.status === 401 || e.status === 403;
  return (
    <div role="alert" className={cn("rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm", className)}>
      <div className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0 space-y-1">
          {title ? <p className="font-medium text-danger">{title}</p> : null}
          <p className="text-fg/90">{e.message}</p>
          {e.issues.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-fg/80">
              {e.issues.map((i, n) => (
                <li key={n}>
                  {i.message}
                  {i.severity === "warning" ? <span className="ml-1 text-warning">(warning)</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {authHint ? (
            <p className="text-xs text-muted">Check the editor token in Settings (bottom of the sidebar).</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
