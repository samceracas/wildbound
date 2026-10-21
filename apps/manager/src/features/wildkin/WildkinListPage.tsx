import type { WildkinSummary } from "@wildbound/shared";
import { PencilIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRestoreWildkin, useWildkinList } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { formatRegistryNumber } from "@/lib/wildkin-form";
import { ErrorNotice, RarityBadge, StatusBadge, WildkinArt } from "./common";
import { DeleteWildkinDialog } from "./DeleteWildkinDialog";

const SHOW_DELETED_KEY = "wildbound.manager.showDeleted";

function readShowDeleted() {
  try {
    return localStorage.getItem(SHOW_DELETED_KEY) === "1";
  } catch {
    return false;
  }
}

export function WildkinListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(readShowDeleted);
  const list = useWildkinList(showDeleted ? "include" : "exclude");
  const restore = useRestoreWildkin();
  const [pendingDelete, setPendingDelete] = useState<WildkinSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(list.data?.wildkin ?? [])]
      .filter((w) => !q || w.name.toLowerCase().includes(q) || w.id.includes(q))
      .sort((a, b) => a.registryNumber - b.registryNumber);
  }, [list.data, search]);

  const toggleDeleted = (on: boolean) => {
    setShowDeleted(on);
    try {
      localStorage.setItem(SHOW_DELETED_KEY, on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Encyclopedia"
        title="Wildkin"
        actions={
          <Button asChild>
            <Link to="/wildkin/new">
              <PlusIcon /> Create
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 px-8 py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search by name"
            />
          </div>
          <Label className="cursor-pointer">
            <Switch checked={showDeleted} onCheckedChange={toggleDeleted} />
            Show deleted
          </Label>
          <span className="ml-auto text-xs text-faint">
            {list.data ? `${rows.length} of ${list.data.wildkin.length}` : null}
          </span>
        </div>

        <ErrorNotice error={list.error} title="Could not load Wildkin" />
        <ErrorNotice error={restore.error} />
        {notice ? <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-fg">{notice}</p> : null}

        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-panel-2/50 text-left text-xs text-muted">
              <tr>
                <th className="w-16 px-4 py-2.5 font-medium" aria-label="Icon" />
                <th className="w-24 px-2 py-2.5 font-medium">No.</th>
                <th className="px-2 py-2.5 font-medium">Name</th>
                <th className="px-2 py-2.5 font-medium">Classification</th>
                <th className="px-2 py-2.5 font-medium">Rarity</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const deleted = !!w.deletedAt;
                return (
                  <tr
                    key={w.id}
                    className={cn(
                      "cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2/50",
                      deleted && "opacity-60",
                    )}
                    onClick={() => !deleted && navigate(`/wildkin/${w.id}`)}
                  >
                    <td className="px-4 py-2">
                      <WildkinArt id={w.id} art={w.art} size={40} alt={`${w.name} icon`} />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-gold">{formatRegistryNumber(w.registryNumber)}</td>
                    <td className="px-2 py-2">
                      <div className="font-serif text-[15px] text-fg">{w.name}</div>
                      <div className="font-mono text-[11px] text-faint">{w.id}</div>
                    </td>
                    <td className="px-2 py-2 text-muted">{w.classification || <span className="text-faint">—</span>}</td>
                    <td className="px-2 py-2">
                      <RarityBadge rarity={w.rarity} />
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge entry={w} />
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {deleted ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={restore.isPending}
                              onClick={() =>
                                restore.mutate(w.id, {
                                  onSuccess: (e) =>
                                    setNotice(
                                      e.registryNumber !== w.registryNumber
                                        ? `${e.name} restored as ${formatRegistryNumber(e.registryNumber)} (${formatRegistryNumber(w.registryNumber)} is now used by another Wildkin).`
                                        : `${e.name} restored.`,
                                    ),
                                })
                              }
                            >
                              <RotateCcwIcon /> Restore
                            </Button>
                            <Button size="sm" variant="destructive-ghost" onClick={() => setPendingDelete(w)}>
                              <Trash2Icon /> Delete permanently
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button asChild size="sm" variant="ghost">
                              <Link to={`/wildkin/${w.id}`}>
                                <PencilIcon /> Edit
                              </Link>
                            </Button>
                            <Button size="sm" variant="destructive-ghost" onClick={() => setPendingDelete(w)}>
                              <Trash2Icon /> Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-faint">
                    {list.isPending
                      ? "Loading…"
                      : search
                        ? "No Wildkin match that name."
                        : "No Wildkin yet. Create the first entry."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteWildkinDialog wildkin={pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)} />
    </div>
  );
}
