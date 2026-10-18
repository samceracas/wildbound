import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Mobile-first frame: the deep-forest shell with a warm-paper workspace,
 * centred at phone width on larger screens (the Stitch screens are 390px wide).
 */
export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-full justify-center bg-deep-forest">
      <div className={cn("relative flex min-h-dvh w-full max-w-[480px] flex-col bg-warm-paper", className)}>{children}</div>
    </div>
  );
}

/** Small "WILDBOUND" mark used on setup screens. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src="/player/head.png" alt="" className="pixelated size-8" />
      <span className="text-label-md text-paper">Wildbound · Field Registry</span>
    </div>
  );
}
