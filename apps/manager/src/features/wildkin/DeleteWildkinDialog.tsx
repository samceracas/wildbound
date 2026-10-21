import { AlertTriangleIcon, ArchiveIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDeleteWildkin, useWildkinUsage } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { formatRegistryNumber } from "@/lib/wildkin-form";
import { ErrorNotice } from "./common";

type Mode = "soft" | "permanent";

/**
 * Delete a Wildkin: move it to the deleted list (restorable), or delete it
 * permanently. Both free its registry number. A permanent delete first shows
 * what else goes with it (encounter-table entries, players' records) and must
 * be confirmed with a checkbox.
 */
export function DeleteWildkinDialog({
  wildkin,
  onOpenChange,
  onDeleted,
}: {
  /** The Wildkin to delete; null closes the dialog. */
  wildkin: { id: string; name: string; registryNumber: number; deletedAt: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (mode: Mode) => void;
}) {
  const alreadyDeleted = !!wildkin?.deletedAt;
  const [mode, setMode] = useState<Mode>("soft");
  const [understood, setUnderstood] = useState(false);
  const del = useDeleteWildkin();
  const usage = useWildkinUsage(wildkin && mode === "permanent" ? wildkin.id : null);

  // Fresh state every time the dialog opens.
  useEffect(() => {
    if (!wildkin) return;
    setMode(wildkin.deletedAt ? "permanent" : "soft");
    setUnderstood(false);
    del.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wildkin?.id]);

  const u = usage.data;
  const consequences = u
    ? [
        u.encounterEntries.draft + u.encounterEntries.published > 0 &&
          `${u.encounterEntries.draft} draft and ${u.encounterEntries.published} published encounter-table entr${u.encounterEntries.draft + u.encounterEntries.published === 1 ? "y" : "ies"}`,
        u.registryEntries > 0 && `${u.registryEntries} player Registry record${u.registryEntries === 1 ? "" : "s"}`,
        u.capturedWildkin > 0 && `${u.capturedWildkin} captured Wildkin in players' parties or storage`,
        u.activeSpawns > 0 && `${u.activeSpawns} active spawn${u.activeSpawns === 1 ? "" : "s"}`,
      ].filter((x): x is string => typeof x === "string")
    : [];

  const confirm = () => {
    if (!wildkin) return;
    del.mutate(
      { id: wildkin.id, permanent: mode === "permanent" },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDeleted?.(mode);
        },
      },
    );
  };

  const canConfirm = mode === "soft" || (understood && usage.isSuccess);

  return (
    <AlertDialog open={!!wildkin} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {wildkin?.name || wildkin?.id}
            {wildkin ? <span className="ml-2 font-mono text-sm text-muted">{formatRegistryNumber(wildkin.registryNumber)}</span> : null}
          </AlertDialogTitle>
          <AlertDialogDescription>Either way its registry number becomes free for a new Wildkin.</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2" role="radiogroup">
          {!alreadyDeleted ? (
            <Choice
              selected={mode === "soft"}
              onSelect={() => setMode("soft")}
              icon={<ArchiveIcon className="size-4" />}
              title="Move to deleted"
              text="Hidden from the list and the game (it stops spawning; players keep it in their Registry). Restore it any time from “Show deleted”."
            />
          ) : null}
          <Choice
            selected={mode === "permanent"}
            onSelect={() => setMode("permanent")}
            icon={<Trash2Icon className="size-4" />}
            title="Delete permanently"
            text="Erases the encyclopedia entry, its art and its game data for good. This cannot be undone."
            danger
          />
        </div>

        {mode === "permanent" ? (
          <div className="space-y-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            {usage.isPending ? (
              <p className="flex items-center gap-2 text-muted">
                <Loader2Icon className="size-4 animate-spin" /> Checking what uses this Wildkin…
              </p>
            ) : usage.error ? (
              <ErrorNotice error={usage.error} />
            ) : consequences.length ? (
              <div>
                <p className="flex items-center gap-2 font-medium text-danger">
                  <AlertTriangleIcon className="size-4" /> Also removed:
                </p>
                <ul className="mt-1 list-disc pl-6 text-muted">
                  {consequences.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted">Nothing else uses it: no encounter tables, Registry records or captures.</p>
            )}
            <Label className="cursor-pointer text-sm text-fg">
              <Checkbox checked={understood} onCheckedChange={(c) => setUnderstood(c === true)} />I understand this
              cannot be undone
            </Label>
          </div>
        ) : null}

        <ErrorNotice error={del.error} title="Could not delete" />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!canConfirm || del.isPending} onClick={confirm}>
            {del.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            {mode === "permanent" ? "Delete permanently" : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Choice({
  selected,
  onSelect,
  icon,
  title,
  text,
  danger,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full gap-3 rounded-md border p-3 text-left transition-colors",
        selected ? (danger ? "border-danger bg-danger/10" : "border-accent bg-accent/10") : "border-line hover:bg-panel-2",
      )}
    >
      <span className={cn("mt-0.5", danger ? "text-danger" : "text-accent")}>{icon}</span>
      <span>
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}
