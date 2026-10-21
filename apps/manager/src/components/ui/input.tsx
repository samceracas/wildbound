import * as React from "react";

import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full min-w-0 rounded-md border border-line bg-field px-3 text-sm text-fg outline-none transition-colors placeholder:text-faint focus-visible:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldBase, "h-9", className)} {...props} />;
}

export { Input };
