import type { ReactNode } from "react";
import { Link } from "react-router";
import type { WildkinCondition } from "@wildbound/shared";
import { FaceLetter } from "@/components/layout/Shell.tsx";
import { ApiError } from "@/lib/api.ts";
import { cn } from "@/lib/utils";

/**
 * Small building blocks shared by the v0.3.0 screens (battle, party detail,
 * license, starter): bars, chips and the dialogue panel the radar sheets use.
 */

/** HP as a bar, never numbers. Green, gold below half, terracotta below a fifth. */
export function HpBar({ fraction, className, label = "HP" }: { fraction: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  const tone = fraction > 0.5 ? "bg-success" : fraction > 0.2 ? "bg-field-gold" : "bg-terracotta";
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="font-pixel text-[7px] text-ink-muted">{label}</span>
      <div
        className="inset-panel h-2 flex-1 overflow-hidden"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={cn("h-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A thin progress bar (EXP, researcher EXP). */
export function ProgressBar({ value, max, className, tone = "bg-sky" }: { value: number; max: number; className?: string; tone?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 100;
  return (
    <div className={cn("inset-panel h-1.5 overflow-hidden", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small pixel-font chip. */
export function Chip({ children, tone = "default", className }: { children: ReactNode; tone?: keyof typeof CHIP_TONES; className?: string }) {
  return (
    <span className={cn("inline-block rounded border px-1.5 py-0.5 font-pixel text-[7px] leading-3 uppercase", CHIP_TONES[tone], className)}>
      {children}
    </span>
  );
}

const CHIP_TONES = {
  default: "border-screen-edge bg-screen-inset text-ink-muted",
  ok: "border-success bg-success/15 text-success",
  warn: "border-field-gold bg-field-gold/30 text-ink",
  alert: "border-terracotta bg-terracotta/15 text-terracotta",
  dark: "border-deep-forest bg-deep-forest text-field-gold",
  water: "border-water bg-water/15 text-deep-forest",
} as const;

const CONDITION: Record<WildkinCondition, { label: string; tone: keyof typeof CHIP_TONES }> = {
  healthy: { label: "Healthy", tone: "ok" },
  injured: { label: "Injured", tone: "warn" },
  fainted: { label: "Fainted", tone: "alert" },
  restless: { label: "Restless", tone: "dark" },
};

export function ConditionChip({ condition }: { condition: WildkinCondition }) {
  const c = CONDITION[condition];
  return <Chip tone={c.tone}>{c.label}</Chip>;
}

/**
 * The dialogue panel used by the radar sheets and the battle log (Stitch radar screen).
 * `bodyClassName` styles the inner body, e.g. to scroll it: the panel itself must not
 * clip, or the corner tag disappears.
 */
export function DialoguePanel({
  tag,
  children,
  className,
  bodyClassName,
  ...props
}: React.ComponentProps<"div"> & { tag?: string; bodyClassName?: string }) {
  return (
    <div
      className={cn("relative flex flex-col rounded-md border-4 border-deep-forest bg-paper shadow-[3px_3px_0_var(--primary-forest)]", className)}
      {...props}
    >
      {tag && (
        <span className="absolute -top-2.5 left-3 z-10 rounded-sm bg-deep-forest px-1.5 py-0.5 font-pixel text-[7px] text-led">{tag}</span>
      )}
      <div className={cn("min-h-0 p-3 pt-4", bodyClassName)}>{children}</div>
    </div>
  );
}

/** "(B) Back to ..." link used at the top of detail screens. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1 rounded border-2 border-deep-forest bg-paper px-2 py-1 font-pixel text-[8px] text-deep-forest uppercase hover:bg-deep-forest hover:text-paper"
    >
      <FaceLetter face="B" className="size-4 text-[7px]" /> {children}
    </Link>
  );
}

/** Small titled box on paper. */
export function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border border-screen-edge bg-paper p-2.5", className)}>
      <h2 className="mb-1.5 font-pixel text-[7px] text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Player-facing text for an API error. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong";
}

/** "about 3 h", "about 20 min". */
export function roughDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `about ${min} min`;
  const h = Math.round(min / 60);
  return `about ${h} h`;
}
