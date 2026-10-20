import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The handheld "Field Nav" chassis every screen sits in (Stitch mockups 1–6 in
 * patches/0.1.0/mockups). Full-bleed on phones, a 430px device on larger screens.
 */
export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-full justify-center bg-chassis-deep">
      <div
        className={cn(
          "relative flex min-h-dvh w-full max-w-[430px] flex-col border-x border-chassis-edge/60 bg-chassis px-2.5 pt-2.5 pb-3",
          className,
        )}
      >
        <span aria-hidden className="screw top-2 left-3" />
        <span aria-hidden className="screw top-2 right-3" />
        {children}
      </div>
    </div>
  );
}

/** Small "WILDBOUND" mark: the player head in a round badge. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-10 items-center justify-center rounded-full border-2 border-deep-forest bg-paper", className)}>
      <img src="/player/head.png" alt="" className="pixelated size-8" />
    </div>
  );
}

/** A status LED. */
export function Led({ on = true, color = "bg-led", className }: { on?: boolean; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        on ? `${color} shadow-[0_0_5px_currentColor]` : "bg-locked/60",
        className,
      )}
    />
  );
}

/** The light-green dot-matrix screen used on the setup screens (login, location). */
export function LcdScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="rounded-xl border-4 border-chassis-deep bg-[#88ad88] p-2 shadow-[inset_0_4px_10px_rgb(0_0_0/0.6)]">
      <div className={cn("scanlines rounded-lg border-2 border-lcd-edge bg-lcd p-3 text-lcd-ink", className)}>{children}</div>
    </div>
  );
}

/**
 * Chunky console button with a round face letter, e.g. (A) ALLOW LOCATION ►.
 * "a" is the primary action, "b" the secondary one.
 */
export function ConsoleButton({
  face,
  children,
  trailing,
  className,
  ...props
}: React.ComponentProps<"button"> & { face: "A" | "B" | "X" | "Y"; trailing?: ReactNode }) {
  const primary = face === "A";
  return (
    <button
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-xl border-b-4 px-4 py-3 font-pixel text-[10px] tracking-wide uppercase transition-transform outline-none",
        "focus-visible:ring-2 focus-visible:ring-field-gold active:translate-y-0.5 active:border-b-2 disabled:pointer-events-none disabled:opacity-50",
        primary
          ? "border-chassis-deep bg-gradient-to-b from-[#2b7c62] to-[#124234] text-[#e8fff6]"
          : "border-chassis-deep bg-gradient-to-b from-[#253e36] to-[#142621] text-[#a1beba]",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2 text-left">
        <FaceLetter face={face} />
        <span className="leading-4">{children}</span>
      </span>
      {trailing && <span className={primary ? "text-[#48ff9f]" : "text-[#7d9b97]"}>{trailing}</span>}
    </button>
  );
}

const FACE_COLORS = { A: "bg-[#48ff9f] text-[#093220]", B: "bg-[#c95f50] text-white", X: "bg-field-gold text-ink", Y: "bg-sky text-ink" };

export function FaceLetter({ face, className }: { face: keyof typeof FACE_COLORS; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-6 shrink-0 items-center justify-center rounded-full font-pixel text-[10px] shadow-inner", FACE_COLORS[face], className)}
    >
      {face}
    </span>
  );
}

/** "▶ TITLE" header used at the top of each game screen, with optional content on the right. */
export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-1.5">
        <span aria-hidden className="mt-px flex size-3.5 shrink-0 items-center justify-center rounded-[2px] bg-primary-forest font-pixel text-[7px] text-field-gold">
          ▶
        </span>
        <div className="min-w-0">
          <h1 className="font-pixel text-[10px] leading-4 tracking-wide text-deep-forest uppercase">{title}</h1>
          {subtitle && <p className="mt-0.5 font-pixel text-[7px] leading-3 text-ink-muted uppercase">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}
