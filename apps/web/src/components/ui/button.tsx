import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Field Registry buttons: 44px tall, 10px radius, label-lg type (DESIGN.md). */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-label-lg whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary-forest text-paper hover:bg-deep-forest",
        secondary: "bg-deep-forest text-paper hover:bg-forest-slate",
        outline: "border border-muted-paper bg-transparent text-primary-forest hover:bg-warm-paper",
        ghost: "text-primary-forest hover:bg-warm-paper",
        destructive: "bg-terracotta text-paper hover:bg-terracotta/90",
        gold: "bg-field-gold text-ink hover:bg-field-gold/90",
        link: "text-primary-forest underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
