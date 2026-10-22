import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { CATEGORY_NAMES, type StarterOption, type StarterRequest } from "@wildbound/shared";
import { Chip, DialoguePanel, errorText } from "@/components/field.tsx";
import { ConsoleButton, ScreenTitle } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { registryNo } from "@/lib/assets.ts";
import { useChooseStarter, useGameState, useStarterOptions } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

/**
 * A new license holder chooses a Registry-raised companion from the ranger at
 * East Research Gate (Kawi, Mimu or Kantar at level 5). Capture needs a
 * battle, and a battle needs a Wildkin, so nobody starts empty-handed.
 */
export function StarterPage() {
  const options = useStarterOptions();
  const state = useGameState(true);
  const choose = useChooseStarter();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<StarterOption | null>(null);

  // Already has Wildkin: nothing to choose.
  if (state.data && !state.data.needsStarter && !choose.isSuccess) return <Navigate to="/play" replace />;

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-2.5">
      <ScreenTitle title="Choose a companion" subtitle={`Raised by the rangers · level ${options.data?.level ?? 5}`} />
      <p className="font-vt text-lg leading-5 text-ink">
        The ranger at East Research Gate entrusts every new license holder with a Wildkin that grew up around the station. Choose
        the one you will survey with.
      </p>
      {options.isPending && <p className="font-vt text-xl text-ink-muted">Calling the ranger…</p>}
      {options.error && <p className="font-vt text-xl text-terracotta">{errorText(options.error)}</p>}

      <ul className="flex flex-col gap-2">
        {options.data?.options.map((o) => (
          <li key={o.creatureId}>
            <button
              type="button"
              onClick={() => setPicked(o)}
              aria-pressed={picked?.creatureId === o.creatureId}
              className={cn(
                "flex w-full gap-3 rounded-lg border-2 bg-paper p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-forest",
                picked?.creatureId === o.creatureId ? "border-field-gold bg-screen-panel" : "border-screen-edge hover:border-primary-forest",
              )}
            >
              <div className="flex shrink-0 flex-col items-center rounded-md border-2 border-deep-forest bg-screen-inset p-1">
                <WildkinImage creatureId={o.creatureId} kind="sprite" alt={o.name} className="pixelated size-20" />
                <span className="font-pixel text-[6px] text-ink-muted">{registryNo(o.registryNumber)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-pixel text-[11px] text-deep-forest uppercase">{o.name}</p>
                <Chip className="mt-1">{o.category === "TBD" ? "Unclassified" : CATEGORY_NAMES[o.category]}</Chip>
                <p className="mt-1 line-clamp-3 font-vt text-base leading-4 text-ink">{o.description}</p>
                <ul className="mt-1 grid grid-cols-2 gap-x-2 font-vt text-sm leading-4 text-ink-muted">
                  {o.statShape.map((s) => (
                    <li key={s.stat} className="truncate">
                      {s.stat}: {s.descriptor}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {picked && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-deep-forest/60 p-3 sm:items-center" role="dialog" aria-modal aria-label="Confirm">
          <DialoguePanel tag="CONFIRM" className="w-full max-w-[400px]">
            <p className="font-vt text-xl leading-6 text-ink">
              Set out with <b>{picked.name}</b>? This choice is for keeps.
            </p>
            {choose.error && <p className="mt-1 font-vt text-lg text-terracotta">{errorText(choose.error)}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ConsoleButton face="B" className="px-3 py-2.5" onClick={() => setPicked(null)} disabled={choose.isPending}>
                Back
              </ConsoleButton>
              <ConsoleButton
                face="A"
                className="px-3 py-2.5"
                disabled={choose.isPending}
                onClick={() =>
                  choose.mutate({ creatureId: picked.creatureId as StarterRequest["creatureId"] }, { onSuccess: () => navigate("/play", { replace: true }) })
                }
              >
                Confirm
              </ConsoleButton>
            </div>
          </DialoguePanel>
        </div>
      )}
    </div>
  );
}
