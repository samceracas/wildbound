import { useState } from "react";
import { CATEGORY_CAPSULES, ITEMS, type AssessmentResponse, type LicenseView } from "@wildbound/shared";
import { Chip, DialoguePanel, errorText, ProgressBar } from "@/components/field.tsx";
import { ConsoleButton, ScreenTitle } from "@/components/layout/Shell.tsx";
import { useLicenses, useTakeAssessment } from "@/lib/queries.ts";
import { AssessmentChecklist } from "./AssessmentChecklist.tsx";

/**
 * Field Registry licenses: one card per category with the rank, the obedience
 * cap, researcher EXP toward the next rank and the next assessment's checklist.
 * Assessments are taken at a field station (East Research Gate in Mabunyi).
 */
export function LicensePage() {
  const { data, isPending, error } = useLicenses();
  const [result, setResult] = useState<AssessmentResponse | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-2.5">
      <ScreenTitle
        title="Field Registry license"
        subtitle={data?.station ? `At ${data.station.name}` : "Assessments at a field station"}
      />
      {isPending && <p className="font-vt text-xl text-ink-muted">Checking your credentials…</p>}
      {error && <p className="font-vt text-xl text-terracotta">{error.message}</p>}

      {result && (
        <DialoguePanel tag="ASSESSMENT PASSED">
          <p className="font-pixel text-[9px] text-deep-forest uppercase">
            {result.license.name} rank {result.license.rank}
          </p>
          <ul className="mt-1 font-vt text-lg leading-5 text-ink">
            {result.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-2 rounded border-2 border-deep-forest px-2 py-1 font-pixel text-[7px] text-deep-forest uppercase hover:bg-deep-forest hover:text-paper"
          >
            Close
          </button>
        </DialoguePanel>
      )}

      {data?.licenses.map((l) => <LicenseCard key={l.category} license={l} onPassed={setResult} />)}
    </div>
  );
}

function LicenseCard({ license: l, onPassed }: { license: LicenseView; onPassed: (r: AssessmentResponse) => void }) {
  const take = useTakeAssessment();
  const capsule = ITEMS[CATEGORY_CAPSULES[l.category]].name;
  return (
    <section className="raised-panel flex flex-col gap-1.5 p-2.5" aria-label={`${l.name} license`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-[10px] text-deep-forest uppercase">{l.name}</h2>
        <div className="flex gap-1">
          <Chip tone="dark">Rank {l.rank}</Chip>
          <Chip>Cap Lv {l.obedienceCap}</Chip>
        </div>
      </div>

      <div>
        <div className="flex justify-between font-pixel text-[6px] text-ink-muted uppercase">
          <span>Researcher EXP</span>
          <span>{l.nextThreshold === null ? `${l.exp} (max rank)` : `${l.exp} / ${l.nextThreshold}`}</span>
        </div>
        <ProgressBar value={l.exp - l.currentThreshold} max={(l.nextThreshold ?? l.exp) - l.currentThreshold} className="mt-0.5" />
      </div>

      {l.nextRank !== null ? (
        <>
          <h3 className="font-pixel text-[7px] text-ink-muted uppercase">Rank {l.nextRank} assessment</h3>
          <AssessmentChecklist requirements={l.requirements} />
          <ConsoleButton
            face="A"
            className="mt-1 px-3 py-2.5"
            disabled={!l.canTakeAssessment || take.isPending}
            onClick={() => take.mutate(l.category, { onSuccess: onPassed })}
          >
            Take assessment
          </ConsoleButton>
          {!l.canTakeAssessment && l.blockedReason && <p className="font-vt text-base leading-4 text-ink-muted">{l.blockedReason}</p>}
          {take.error && <p className="font-vt text-base leading-4 text-terracotta">{errorText(take.error)}</p>}
        </>
      ) : (
        <p className="font-vt text-lg leading-5 text-success">Highest rank. Every {l.name} Wildkin trusts your care.</p>
      )}
      <p className="font-vt text-base leading-4 text-ink-muted">Each rank-up grants {capsule}s and Field Capsules.</p>
    </section>
  );
}
