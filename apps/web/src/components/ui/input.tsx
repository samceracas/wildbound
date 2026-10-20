import * as React from "react";

import { cn } from "@/lib/utils";

/** 44px text input on paper with a muted-paper border; focus turns the border forest green (no glow). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-muted-paper bg-paper px-3 text-base text-ink outline-none placeholder:text-ink-muted",
        "focus-visible:border-primary-forest disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-terracotta",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
