import { useState } from "react";
import { PARTY_SIZE, type CapturedWildkinView } from "@wildbound/shared";
import { Link } from "react-router";
import { ConditionChip, HpBar } from "@/components/field.tsx";
import { ScreenTitle } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { registryNo } from "@/lib/assets.ts";
import { useParty } from "@/lib/queries.ts";
import { RenameForm } from "./RenameForm.tsx";

/**
 * Party (6 slots) and storage.
 * Layout: Stitch screen 6 "Party" (patches/0.1.0/mockups/6-party.html): the lead
 * Wildkin in a large card, the other slots as rows, empty slots dashed.
 *
 * TODO(you), stretch: let the player move Wildkin between storage and party slots.
 * The API side is a TODO too (PUT /api/game/party). Build the new `slots` array
 * (6 entries, id or null), call `api.updateParty({ slots })` in a useMutation,
 * and invalidate `keys.party` on success.
 */
export function PartyPage() {
  const { data, isPending, error } = useParty();
  const [renaming, setRenaming] = useState<CapturedWildkinView | null>(null);
  const filled = data?.party.filter(Boolean).length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-2.5">
      <ScreenTitle
        title="Field party summary"
        subtitle="Ready for encounter & registry survey"
        right={
          data && (
            <span className="shrink-0 rounded bg-deep-forest px-2 py-1 font-pixel text-[7px] text-[#a8f1d8]">
              {filled} / {PARTY_SIZE} EQUIPPED
            </span>
          )
        }
      />
      {isPending && <p className="font-vt text-xl text-ink-muted">Calling your companions…</p>}
      {error && <p className="font-vt text-xl text-terracotta">{error.message}</p>}

      {data && (
        <>
          <ol className="flex flex-col gap-2">
            {data.party.map((member, slot) => (
              <li key={slot}>
                {!member ? (
                  <EmptySlot slot={slot} />
                ) : slot === 0 ? (
                  <LeadCard member={member} onRename={() => setRenaming(member)} />
                ) : (
                  <MemberRow member={member} slot={slot} onRename={() => setRenaming(member)} />
                )}
              </li>
            ))}
          </ol>

          <h2 className="mt-1 px-1 font-pixel text-[7px] text-ink-muted uppercase">
            <span className="text-terracotta">▼</span> Storage · {data.storage.length}
          </h2>
          {data.storage.length === 0 ? (
            <p className="px-1 font-vt text-lg leading-5 text-ink-muted">
              Captured Wildkin beyond your six party slots rest here. Capture something first!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.storage.map((m) => (
                <li key={m.id}>
                  <MemberRow member={m} onRename={() => setRenaming(m)} />
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

function RenameButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border-2 border-deep-forest bg-paper px-2 py-1 font-pixel text-[7px] text-deep-forest uppercase hover:bg-deep-forest hover:text-paper"
    >
      Rename
    </button>
  );
}

function DetailsLink({ id }: { id: string }) {
  return (
    <Link
      to={`/play/party/${id}`}
      className="rounded border-2 border-deep-forest bg-deep-forest px-2 py-1 font-pixel text-[7px] text-paper uppercase hover:bg-primary-forest"
    >
      Details
    </Link>
  );
}

function LeadCard({ member, onRename }: { member: CapturedWildkinView; onRename: () => void }) {
  return (
    <div className="relative rounded-lg border-2 border-deep-forest bg-screen-panel p-2.5 shadow-[0_2px_0_#183f36]">
      {member.lead && (
        <span className="absolute -top-px right-2 rounded-b bg-deep-forest px-2 py-0.5 font-pixel text-[7px] text-field-gold">● LEAD</span>
      )}
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center rounded-md border-2 border-deep-forest bg-screen-inset p-1">
          <WildkinImage creatureId={member.creatureId} className="pixelated size-16" />
          <span className="mt-1 font-pixel text-[7px] text-ink-muted">{registryNo(member.registryNumber)}</span>
        </div>
        <div className="min-w-0 flex-1 pt-2">
          <Link to={`/play/party/${member.id}`} className="block truncate font-pixel text-[12px] leading-4 text-deep-forest uppercase hover:underline">
            {member.nickname ?? member.speciesName} <span className="text-[9px] text-primary-forest">Lv {member.level}</span>
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="inline-block rounded bg-moss px-1.5 py-0.5 font-pixel text-[7px] text-paper uppercase">{member.speciesName}</span>
            <ConditionChip condition={member.condition} />
            {member.marking && <span className="inline-block rounded bg-field-gold px-1.5 py-0.5 font-pixel text-[7px] text-ink uppercase">{member.marking}</span>}
          </div>
          <HpBar fraction={member.hpFraction} className="mt-1.5" />
          {member.restlessReason && <p className="mt-1 font-vt text-base leading-4 text-ink-muted">Restless. {member.restlessReason}</p>}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <DetailsLink id={member.id} />
        <RenameButton onClick={onRename} />
      </div>
    </div>
  );
}

function MemberRow({ member, slot, onRename }: { member: CapturedWildkinView; slot?: number; onRename: () => void }) {
  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-screen-edge bg-paper p-2">
      {slot !== undefined && (
        <span className="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-deep-forest font-pixel text-[7px] text-paper">
          {slot + 1}
        </span>
      )}
      <WildkinImage creatureId={member.creatureId} className="pixelated size-11 shrink-0 rounded-md border border-screen-edge bg-screen-inset" />
      <Link to={`/play/party/${member.id}`} className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-primary-forest">
        <p className="truncate font-pixel text-[9px] text-deep-forest uppercase">
          {member.nickname ?? member.speciesName} <span className="text-primary-forest">Lv {member.level}</span>
          {member.lead && <span className="ml-1 rounded-sm bg-deep-forest px-1 text-[6px] text-field-gold">LEAD</span>}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <HpBar fraction={member.hpFraction} className="flex-1" />
          <ConditionChip condition={member.condition} />
        </div>
        <p className="truncate font-vt text-base leading-4 text-ink-muted">
          {member.restlessReason ? `Restless. ${member.restlessReason}` : member.nickname ? member.speciesName : "No nickname"}
        </p>
      </Link>
      <RenameButton onClick={onRename} />
    </div>
  );
}

function EmptySlot({ slot }: { slot: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-screen-edge bg-screen-inset/40 p-2">
      <span className="flex size-9 items-center justify-center rounded-md border-2 border-dashed border-screen-edge font-pixel text-[9px] text-ink-muted">
        {slot + 1}
      </span>
      <span className="font-pixel text-[8px] text-ink-muted uppercase">+ Empty slot</span>
    </div>
  );
}
