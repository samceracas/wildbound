import { Backpack, BookMarked, Cookie, PackageOpen } from "lucide-react";
import type { InventoryItemView } from "@wildbound/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { useInventory } from "@/lib/queries.ts";

const ICONS: Record<string, typeof Backpack> = {
  "field-capsule": PackageOpen,
  "trail-ration": Cookie,
  "field-notebook": BookMarked,
};

/** The Satchel (inventory). Items are server-side; this page only reads them. */
export function InventoryPage() {
  const { data, isPending, error } = useInventory();
  return (
    <div className="flex-1 px-4 py-5">
      <h1 className="text-headline-lg text-ink">Satchel</h1>
      {isPending && <p className="mt-6 text-ink-muted">Unpacking…</p>}
      {error && <p className="mt-6 text-terracotta">{error.message}</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {data?.items.map((item) => (
          <li key={item.itemId}>
            <ItemRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemRow({ item }: { item: InventoryItemView }) {
  const Icon = ICONS[item.itemId] ?? Backpack;
  return (
    <div className="flex items-start gap-4 rounded-lg border border-muted-paper bg-paper p-4">
      <div className="rounded-md bg-warm-paper p-2 text-primary-forest">
        <Icon className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-serif text-lg text-ink">{item.name}</p>
          <span className="text-headline-md text-ink">×{item.quantity}</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
        <Badge className="mt-2">{item.category}</Badge>
      </div>
    </div>
  );
}
