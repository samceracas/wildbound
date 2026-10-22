import { useParams } from "react-router";
import { APPROACH_NAMES, BODY_TRAIT_NAMES, CATEGORY_NAMES, MATCHUPS, type WildkinDetail } from "@wildbound/shared";
import { BackLink, Chip, ConditionChip, errorText, HpBar, Panel, ProgressBar, roughDuration } from "@/components/field.tsx";
import { ConsoleButton } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { registryNo } from "@/lib/assets.ts";
import { useInventory, useUseItem, useWildkin } from "@/lib/queries.ts";
import { TIME_LABEL, WEATHER_LABEL } from "../game/environment.tsx";

/**
 * One captured Wildkin in detail. What the scanner shows (grades, vigor,
 * genotype) depends on the player's license rank in its category; the server
 * sends hidden fields as null.
 */
export function WildkinDetailPage() {
  const { wildkinId = "" } = useParams();
  const { data: w, isPending, error } = useWildkin(wildkinId);

  if (isPending) return <p className="p-4 font-vt text-xl text-ink-muted">Opening the capsule log…</p>;
  if (!w) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <BackLink to="/play/party">Back to party</BackLink>
        <p className="font-vt text-xl text-terracotta">{error ? errorText(error) : "Not found."}</p>
      </div>
    );
  }

  return (
    <article className="flex flex-1 flex-col gap-2.5 p-2.5">
      <BackLink to="/play/party">Back to party</BackLink>

      <section className="raised-panel flex gap-3 p-2.5">
        <div className="flex shrink-0 flex-col items-center rounded-md border-2 border-deep-forest bg-screen-inset p-1">
          <WildkinImage creatureId={w.creatureId} kind="sprite" alt={w.speciesName} className="pixelated size-24" />
          <span className="font-pixel text-[7px] text-ink-muted">{registryNo(w.registryNumber)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-pixel text-[11px] leading-4 text-deep-forest uppercase">{w.nickname ?? w.speciesName}</h1>
          <p className="font-vt text-lg leading-5 text-ink-muted">{w.nickname ? w.speciesName : "No nickname"}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip tone="dark">Lv {w.level}</Chip>
            <ConditionChip condition={w.condition} />
            {w.lead && <Chip tone="warn">Lead</Chip>}
            {w.marking && <Chip tone="water">{w.marking} markings</Chip>}
          </div>
          <div className="mt-2">
            {w.exp.heldAtCap ? (
              <p className="font-pixel text-[7px] text-terracotta uppercase">Held at license cap</p>
            ) : w.exp.levelSize > 0 ? (
              <>
                <p className="font-pixel text-[7px] text-ink-muted uppercase">EXP to level {w.level + 1}</p>
                <ProgressBar value={w.exp.intoLevel} max={w.exp.levelSize} className="mt-0.5" />
              </>
            ) : (
              <p className="font-pixel text-[7px] text-ink-muted uppercase">Fully grown</p>
            )}
          </div>
          <HpBar fraction={w.hpFraction} className="mt-2" />
          <p className="mt-0.5 font-vt text-base leading-4 text-ink-muted">{recoveryText(w)}</p>
        </div>
      </section>

      {w.restlessReason && (
        <p className="rounded-md border-2 border-deep-forest bg-deep-forest px-2.5 py-1.5 font-vt text-lg leading-5 text-paper">
          Restless. {w.restlessReason} It travels with you but will not battle or accept treatment.
        </p>
      )}

      <TrailRation wildkin={w} />

      <Panel title="Field Registry license">
        <p className="font-vt text-lg leading-5 text-ink">
          {w.category === "TBD" ? "Category not yet recorded" : CATEGORY_NAMES[w.category]} · needs {w.licenseNeeded} · your rank{" "}
          {w.scannerRank}
        </p>
      </Panel>

      <Panel title="Body traits">
        <ul className="flex flex-col gap-1 font-vt text-lg leading-5 text-ink">
          {w.bodyTraits.map((t) => (
            <li key={t}>
              <b className="font-pixel text-[8px] text-deep-forest uppercase">{BODY_TRAIT_NAMES[t]}</b>{" "}
              <span className="text-ink-muted">{MATCHUPS[t].reason}</span>
            </li>
          ))}
          {w.bodyTraits.length === 0 && <li className="text-ink-muted">Not yet recorded.</li>}
        </ul>
      </Panel>

      <Panel title="Attacks">
        <ul className="flex flex-col gap-1.5">
          {w.attacks.map((a) => (
            <li key={a.index}>
              <p className="font-pixel text-[8px] text-deep-forest uppercase">
                {a.name} <span className="text-primary-forest">· {APPROACH_NAMES[a.approach]} · {a.powerWord}</span>
              </p>
              {a.description && <p className="font-vt text-base leading-4 text-ink-muted">{a.description}</p>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Scanner">
        <table className="w-full font-vt text-base leading-5 text-ink">
          <thead className="font-pixel text-[6px] text-ink-muted uppercase">
            <tr>
              <th className="text-left font-normal">Stat</th>
              <th className="text-left font-normal">Shape</th>
              <th className="text-left font-normal">Grade</th>
              <th className="text-left font-normal">Vigor</th>
            </tr>
          </thead>
          <tbody>
            {w.stats.map((s) => (
              <tr key={s.stat}>
                <td>{s.stat}</td>
                <td>{s.descriptor}</td>
                <td>{s.grade ?? <Hidden rank={2} />}</td>
                <td>{s.vigor ?? <Hidden rank={3} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 font-vt text-base leading-5 text-ink">
          <dt className="text-ink-muted">Build</dt>
          <dd>{w.build}</dd>
          <dt className="text-ink-muted">Temperament</dt>
          <dd>{w.temperament ?? <Hidden rank={2} />}</dd>
          <dt className="text-ink-muted">Marking</dt>
          <dd>{w.marking ?? "Typical"}</dd>
          <dt className="text-ink-muted">Genotype</dt>
          <dd>{w.genotype ? `Build ${w.genotype.build} · Temperament ${w.genotype.temperament} · Marking ${w.genotype.marking}` : <Hidden rank={4} />}</dd>
        </dl>
        <p className="mt-1 font-vt text-base leading-4 text-ink-muted">Higher license ranks reveal more on the scanner.</p>
      </Panel>

      <Panel title="Capture record">
        <p className="font-vt text-lg leading-5 text-ink">{caughtText(w)}</p>
      </Panel>
    </article>
  );
}

/** A field the scanner hides until the given license rank. */
const Hidden = ({ rank }: { rank: number }) => <span className="whitespace-nowrap text-ink-muted">? Rank {rank}</span>;

function recoveryText(w: WildkinDetail): string {
  if (w.cannotBeTreated) return "Cannot be treated yet.";
  if (w.recoveryMs === null) return "At full strength.";
  return `Fully recovered in ${roughDuration(w.recoveryMs)}.`;
}

function caughtText(w: WildkinDetail): string {
  const date = new Date(w.caught.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const where = w.caught.habitatName ? `Caught at ${w.caught.habitatName}` : "Entrusted by the rangers";
  const level = w.caught.level !== null ? `, level ${w.caught.level}` : "";
  const when = [w.caught.timeOfDay && TIME_LABEL[w.caught.timeOfDay], w.caught.weather && WEATHER_LABEL[w.caught.weather]].filter(Boolean).join(", ");
  return `${where} on ${date}${level}${when ? ` (${when})` : ""}.`;
}

function TrailRation({ wildkin: w }: { wildkin: WildkinDetail }) {
  const inventory = useInventory();
  const use = useUseItem();
  const left = inventory.data?.items.find((i) => i.itemId === "trail-ration")?.quantity ?? 0;
  const reason = w.restless ? "Restless Wildkin refuse treatment." : w.hpFraction >= 1 ? "Already at full strength." : left === 0 ? "No Trail Rations left." : null;
  return (
    <div className="flex flex-col gap-1">
      <ConsoleButton
        face="Y"
        className="px-3 py-2.5"
        disabled={reason !== null || use.isPending}
        onClick={() => use.mutate({ itemId: "trail-ration", wildkinId: w.id })}
        trailing={`×${left}`}
      >
        Use Trail Ration
      </ConsoleButton>
      <p className="px-1 font-vt text-base leading-4 text-ink-muted" aria-live="polite">
        {use.error ? errorText(use.error) : use.isSuccess ? "It ate the ration and looks a little stronger." : reason}
      </p>
    </div>
  );
}
