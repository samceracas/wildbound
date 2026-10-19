import type { ComponentProps } from "react";
import { cn } from "@/lib/utils.ts";

/** Shared look of text inputs, selects and textareas. */
export const controlClass =
  "w-full min-w-0 rounded-control border border-line bg-canvas px-2 py-1.5 focus:outline-2 focus:-outline-offset-1 focus:outline-accent/60 aria-invalid:border-danger";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(controlClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={3} className={cn(controlClass, "resize-y", className)} {...props} />;
}

const BUTTON_VARIANTS = {
  default: "bg-panel-2",
  primary: "border-accent bg-accent font-semibold text-accent-ink",
  ghost: "border-transparent bg-transparent enabled:hover:bg-panel-2",
  danger: "text-danger",
  "ghost-danger": "border-transparent bg-transparent text-danger enabled:hover:bg-panel-2",
} as const;

export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_VARIANTS; size?: "default" | "small" }) {
  return (
    <button
      type={type}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-control border border-line px-2.5 py-[5px] enabled:hover:border-muted disabled:cursor-default disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        size === "small" && "px-[7px] py-0.5 text-label",
        className,
      )}
      {...props}
    />
  );
}

/** Underlined text button used for cross-links (tree, issues, inspectors). */
export function LinkButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer border-0 bg-transparent p-0 text-left text-fg underline decoration-line underline-offset-[3px] hover:decoration-accent",
        className,
      )}
      {...props}
    />
  );
}

/** Small uppercase panel heading (old h2). */
export function PanelTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("mb-2 text-tiny font-bold uppercase tracking-[0.08em] text-muted", className)} {...props} />;
}

/** Inspector sub-heading (old h4). */
export function SubTitle({ className, ...props }: ComponentProps<"h4">) {
  return <h4 className={cn("mt-3.5 mb-1.5 text-label font-bold uppercase tracking-[0.06em] text-muted", className)} {...props} />;
}

export function Tag({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-1.5 py-px text-meta", className)}
      {...props}
    />
  );
}

export function Pill({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("rounded-full bg-info/18 px-2 py-px text-meta text-info", className)} {...props} />;
}

/** Thin proportion bar (encounter shares, preview probabilities). */
export function Bar({ value, className, title }: { value: number; className?: string; title?: string }) {
  return (
    <div className={cn("h-[5px] flex-1 overflow-hidden rounded-[3px] bg-canvas", className)} title={title}>
      <span className="block h-full bg-accent" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
