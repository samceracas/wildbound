import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Pills (DESIGN.md "Badges & Chips"): rounded-full, 6px 10px, label-md. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-1.5 text-label-md whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-muted-paper text-forest-slate",
        moss: "bg-moss/20 text-forest-slate",
        leaf: "bg-leaf/25 text-forest-slate",
        water: "bg-water/20 text-deep-forest",
        sky: "bg-sky/30 text-deep-forest",
        gold: "bg-field-gold text-ink",
        dark: "bg-deep-forest text-paper",
        alert: "bg-terracotta text-paper",
        outline: "border border-muted-paper text-ink-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
