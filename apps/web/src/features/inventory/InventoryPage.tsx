import { Backpack, BookMarked, Cookie, PackageOpen } from "lucide-react";
import { useState } from "react";
import type { CapturedWildkinView, InventoryItemView } from "@wildbound/shared";
import { ConditionChip, errorText, HpBar } from "@/components/field.tsx";
import { ScreenTitle } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { useInventory, useParty, useUseItem } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Backpack> = {
  "field-capsule": PackageOpen,
  "canopy-capsule": PackageOpen,
  "current-capsule": PackageOpen,
  "burrow-capsule": PackageOpen,
  "bloom-capsule": PackageOpen,
  "trail-ration": Cookie,
  "field-notebook": BookMarked,
};

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "capture", label: "Capture" },
  { id: "field", label: "Field" },
  { id: "key", label: "Key items" },
];

/**
 * The Satchel (inventory). Items are server-side; this page only reads them.
 * Layout: Stitch screen 4 "Satchel" (patches/0.1.0/mockups/4-inventory.html).
 */
export function InventoryPage() {
  const { data, isPending, error } = useInventory();
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = data?.items.filter((i) => category === "all" || i.category === category) ?? [];
  const selected = data?.items.find((i) => i.itemId === selectedId) ?? data?.items[0];
  const total = data?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-2.5">
      <ScreenTitle
        title="Field satchel"
        subtitle="Standard field issue pack"
        right={data && <span className="inset-panel shrink-0 px-2 py-0.5 font-pixel text-[8px] text-ink-muted">ITEMS: {total}</span>}
      />

      <div className="flex gap-1 overflow-x-auto pb-1 font-pixel text-[7px] uppercase" role="group" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "shrink-0 rounded-[3px] px-2 py-1.5",
              category === c.id
                ? "border-b-2 border-chassis-deep bg-deep-forest text-field-gold"
                : "border border-screen-edge bg-[#e4ddcc] text-deep-forest hover:bg-[#d8d0be]",
            )}
          >
            {category === c.id && "▶ "}
            {c.label}
          </button>
        ))}
      </div>

      {selected && <ItemDetail item={selected} />}

      <h2 className="flex items-center gap-1 px-1 font-pixel text-[7px] text-ink-muted uppercase">
        <span className="text-terracotta">▼</span> Inventory list
      </h2>
      {isPending && <p className="font-vt text-xl text-ink-muted">Unpacking…</p>}
      {error && <p className="font-vt text-xl text-terracotta">{error.message}</p>}
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.itemId}>
            <ItemRow item={item} selected={item.itemId === selected?.itemId} onSelect={() => setSelectedId(item.itemId)} />
          </li>
        ))}
      </ul>
      {data && items.length === 0 && <p className="font-vt text-xl text-ink-muted">Nothing in this pocket.</p>}
    </div>
  );
}

function ItemIcon({ itemId, className }: { itemId: string; className?: string }) {
  const Icon = ICONS[itemId] ?? Backpack;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded border-2 border-deep-forest bg-screen-inset text-primary-forest", className)}>
      <Icon className="size-1/2" aria-hidden />
    </span>
  );
}

function ItemDetail({ item }: { item: InventoryItemView }) {
  return (
    <section className="raised-panel flex gap-3 p-2.5" aria-live="polite">
      <ItemIcon itemId={item.itemId} className="size-16" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-pixel text-[9px] text-deep-forest uppercase">{item.name}</h3>
          <span className="rounded border border-success bg-success/15 px-1.5 py-0.5 font-pixel text-[7px] text-success">×{item.quantity} AVAIL</span>
        </div>
        <p className="inset-panel mt-1.5 bg-[#faf7ef] p-1.5 font-vt text-lg leading-5 text-ink">{item.description}</p>
        {item.category === "capture" && <p className="mt-1 font-pixel text-[7px] text-ink-muted uppercase">Used in battle</p>}
        {item.itemId === "trail-ration" && <RationPicker disabled={item.quantity === 0} />}
      </div>
    </section>
  );
}

/** "Use" on a Trail Ration: pick the Wildkin to feed. Restless Wildkin refuse treatment. */
function RationPicker({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const party = useParty();
  const use = useUseItem();
  const all = party.data ? [...party.data.party.filter((m): m is CapturedWildkinView => m !== null), ...party.data.storage] : [];
  const reason = (w: CapturedWildkinView) => (w.restless ? "Restless" : w.hpFraction >= 1 ? "Full strength" : null);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="rounded border-2 border-deep-forest bg-deep-forest px-2 py-1 font-pixel text-[7px] text-paper uppercase hover:bg-primary-forest disabled:opacity-50"
      >
        {open ? "Cancel" : "Use"}
      </button>
      {use.isSuccess && !open && <p className="mt-1 font-vt text-base leading-4 text-success">{use.data.wildkin.nickname ?? use.data.wildkin.speciesName} looks a little stronger.</p>}
      {use.error && <p className="mt-1 font-vt text-base leading-4 text-terracotta">{errorText(use.error)}</p>}
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1" aria-label="Choose a Wildkin">
          {all.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                disabled={reason(w) !== null || use.isPending}
                onClick={() => use.mutate({ itemId: "trail-ration", wildkinId: w.id }, { onSuccess: () => setOpen(false) })}
                className="flex w-full items-center gap-2 rounded border border-screen-edge bg-paper p-1 text-left hover:border-primary-forest disabled:opacity-60"
              >
                <WildkinImage creatureId={w.creatureId} className="pixelated size-7 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-pixel text-[7px] text-deep-forest uppercase">
                    {w.nickname ?? w.speciesName} Lv {w.level}
                  </span>
                  <HpBar fraction={w.hpFraction} className="mt-0.5" />
                </span>
                <ConditionChip condition={w.condition} />
              </button>
            </li>
          ))}
          {all.length === 0 && <li className="font-vt text-base text-ink-muted">No Wildkin to feed yet.</li>}
        </ul>
      )}
    </div>
  );
}

function ItemRow({ item, selected, onSelect }: { item: InventoryItemView; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border-2 px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-forest",
        selected ? "border-deep-forest bg-[#c8e6d6]" : "border-screen-edge bg-paper hover:border-primary-forest",
      )}
    >
      <ItemIcon itemId={item.itemId} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block font-pixel text-[8px] text-deep-forest uppercase">{item.name}</span>
        <span className="block truncate font-vt text-lg leading-5 text-ink-muted capitalize">{item.category}</span>
      </span>
      <span className="inset-panel shrink-0 px-1.5 py-0.5 font-pixel text-[8px] text-deep-forest">×{String(item.quantity).padStart(2, "0")}</span>
    </button>
  );
}
