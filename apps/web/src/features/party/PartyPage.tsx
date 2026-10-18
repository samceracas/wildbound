import { useState } from "react";
import type { CapturedWildkinView } from "@wildbound/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { registryNo, wildkinIcon } from "@/lib/assets.ts";
import { useParty } from "@/lib/queries.ts";
import { RenameForm } from "./RenameForm.tsx";

/**
 * Party (6 slots) and storage.
 *
 * TODO(you), stretch: let the player move Wildkin between storage and party slots.
 * The API side is a TODO too (PUT /api/game/party). Build the new `slots` array
 * (6 entries, id or null), call `api.updateParty({ slots })` in a useMutation,
 * and invalidate `keys.party` on success.
 */
export function PartyPage() {
  const { data, isPending, error } = useParty();
  const [renaming, setRenaming] = useState<CapturedWildkinView | null>(null);

  return (
    <div className="flex-1 px-4 py-5">
      <h1 className="text-headline-lg text-ink">Party</h1>
      {isPending && <p className="mt-6 text-ink-muted">Calling your companions…</p>}
      {error && <p className="mt-6 text-terracotta">{error.message}</p>}

      {data && (
        <>
          <ol className="mt-4 grid grid-cols-2 gap-3">
            {data.party.map((member, slot) => (
              <li key={slot}>
                {member ? (
                  <MemberCard member={member} onRename={() => setRenaming(member)} />
                ) : (
                  <div className="flex h-full min-h-32 items-center justify-center rounded-lg border border-dashed border-muted-paper text-sm text-ink-muted">
                    Slot {slot + 1} · empty
                  </div>
                )}
              </li>
            ))}
          </ol>

          <h2 className="text-label-md mt-6 text-ink-muted">Storage · {data.storage.length}</h2>
          {data.storage.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              Captured Wildkin beyond your six party slots rest here. Capture something first!
            </p>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-3">
              {data.storage.map((m) => (
                <li key={m.id}>
                  <MemberCard member={m} onRename={() => setRenaming(m)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {renaming && <RenameForm wildkin={renaming} onDone={() => setRenaming(null)} />}
    </div>
  );
}

function MemberCard({ member, onRename }: { member: CapturedWildkinView; onRename: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-muted-paper bg-paper p-3 text-center">
      <img src={wildkinIcon(member.creatureId)} alt="" className="pixelated size-16" />
      <p className="truncate font-serif text-lg text-ink">{member.nickname ?? member.speciesName}</p>
      <Badge>{registryNo(member.registryNumber)}</Badge>
      <Button variant="outline" size="sm" className="mt-1 w-full" onClick={onRename}>
        Rename
      </Button>
    </div>
  );
}
