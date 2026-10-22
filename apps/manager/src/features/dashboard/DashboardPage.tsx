import { RARITIES, type Rarity } from "@wildbound/shared";
import {
  ArchiveIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  FilePenLineIcon,
  ImageIcon,
  PencilLineIcon,
  PlusIcon,
  SwordsIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorNotice, RarityBadge, StatusBadge, WildkinArt } from "@/features/wildkin/common";
import { useStats, useWildkinList } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { formatRegistryNumber } from "@/lib/wildkin-form";

/** One number on the dashboard. Add new cards to STAT_CARDS as the stats grow. */
interface StatCardDef {
  key: "total" | "published" | "drafts" | "unpublishedChanges" | "deleted" | "withArt" | "battleReady";
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  to?: string;
}

const STAT_CARDS: StatCardDef[] = [
  { key: "total", label: "Wildkin", hint: "Entries in the encyclopedia", icon: BookOpenIcon, tone: "text-fg", to: "/wildkin" },
  { key: "published", label: "Published", hint: "Live in the creatures table", icon: CheckCircle2Icon, tone: "text-accent" },
  { key: "drafts", label: "Drafts", hint: "Never published", icon: FilePenLineIcon, tone: "text-warning" },
  { key: "unpublishedChanges", label: "Unpublished changes", hint: "Edited since last publish", icon: PencilLineIcon, tone: "text-info" },
  {
    key: "battleReady",
    label: "Battle-ready",
    hint: "Published with category, traits, stats and attacks",
    icon: SwordsIcon,
    tone: "text-accent",
  },
  { key: "withArt", label: "With art", hint: "Have a PixelLab icon", icon: ImageIcon, tone: "text-gold" },
  { key: "deleted", label: "Deleted", hint: "Soft-deleted, restorable", icon: ArchiveIcon, tone: "text-danger" },
];

function StatCard({ def, value }: { def: StatCardDef; value: ReactNode }) {
  const Icon = def.icon;
  const body = (
    <Card className={cn("h-full p-5 transition-colors", def.to && "hover:border-line-strong hover:bg-panel-2/40")}>
      <div className="flex items-center justify-between text-muted">
        <span className="text-xs font-medium tracking-wide uppercase">{def.label}</span>
        <Icon className={cn("size-4", def.tone)} />
      </div>
      <div className={cn("mt-3 font-serif text-4xl tabular-nums", def.tone)}>{value}</div>
      <p className="mt-1 text-xs text-faint">{def.hint}</p>
    </Card>
  );
  return def.to ? <Link to={def.to}>{body}</Link> : body;
}

const RARITY_BAR: Record<Rarity, string> = {
  common: "bg-muted",
  uncommon: "bg-accent",
  rare: "bg-gold",
  TBD: "bg-line-strong",
};

export function DashboardPage() {
  const stats = useStats();
  const list = useWildkinList("exclude");
  const s = stats.data;
  const maxRarity = s ? Math.max(1, ...Object.values(s.byRarity)) : 1;
  const recent = [...(list.data?.wildkin ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <div>
      <PageHeader
        kicker="Field research"
        title="Dashboard"
        actions={
          <Button asChild>
            <Link to="/wildkin/new">
              <PlusIcon /> New Wildkin
            </Link>
          </Button>
        }
      />
      <div className="space-y-6 px-8 py-6">
        <ErrorNotice error={stats.error} title="Could not load stats" />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {STAT_CARDS.map((def) => (
            <StatCard key={def.key} def={def} value={s ? s[def.key] : stats.isPending ? "…" : "–"} />
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Rarity</CardTitle>
              <CardDescription>Non-deleted entries by rarity band. Rarity is not strength.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {RARITIES.map((r) => {
                const n = s?.byRarity[r] ?? 0;
                return (
                  <div key={r} className="grid grid-cols-[88px_1fr_32px] items-center gap-3 text-sm">
                    <RarityBadge rarity={r} />
                    <div className="h-2 overflow-hidden rounded-full bg-field">
                      <div className={cn("h-full rounded-full", RARITY_BAR[r])} style={{ width: `${(n / maxRarity) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-muted">{n}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next registry number</CardTitle>
              <CardDescription>Assigned to the next new Wildkin (editable on the form).</CardDescription>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-4">
              <span className="font-mono text-4xl text-gold">{s ? formatRegistryNumber(s.nextRegistryNumber) : "…"}</span>
              <Button asChild variant="outline" size="sm">
                <Link to="/wildkin/new">
                  <PlusIcon /> New Wildkin
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recently edited</CardTitle>
              <CardDescription>Latest changes across the encyclopedia.</CardDescription>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-faint">{list.isPending ? "Loading…" : "No Wildkin yet."}</p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {recent.map((w) => (
                    <li key={w.id}>
                      <Link to={`/wildkin/${w.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-panel-2">
                        <WildkinArt id={w.id} art={w.art} size={28} />
                        <span className="font-mono text-xs text-muted">{formatRegistryNumber(w.registryNumber)}</span>
                        <span className="min-w-0 flex-1 truncate">{w.name}</span>
                        <StatusBadge entry={w} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
