import type { ReactNode } from "react";
import { BookOpenIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";

import { Button } from "@/components/ui/button";
import { useManagerConfig } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { TokenSettings } from "./TokenSettings";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboardIcon, end: true },
  { to: "/wildkin", label: "Wildkin", icon: BookOpenIcon, end: false },
];

function ServiceDot({ label, on }: { label: string; on: boolean | undefined }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className={cn("size-1.5 rounded-full", on === undefined ? "bg-faint" : on ? "bg-accent" : "bg-warning")} />
      {label}
      <span className="ml-auto text-faint">{on === undefined ? "…" : on ? "on" : "off"}</span>
    </div>
  );
}

export function AppLayout() {
  const config = useManagerConfig();
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
        <Link to="/" className="block border-b border-line px-5 py-4">
          <div className="font-mono text-[11px] font-semibold tracking-[0.25em] text-accent">WILDBOUND</div>
          <div className="font-serif text-[15px] text-fg">Creature Manager</div>
        </Link>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel-2/60 hover:text-fg",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
          <Button asChild size="sm" variant="secondary" className="mt-3 justify-start">
            <Link to="/wildkin/new">
              <PlusIcon /> New Wildkin
            </Link>
          </Button>
        </nav>
        <div className="mt-auto space-y-3 border-t border-line p-3">
          <div className="space-y-1.5 px-2">
            <ServiceDot label="AI assistant" on={config.data?.assistant.enabled} />
            <ServiceDot label="PixelLab art" on={config.data?.art.enabled} />
          </div>
          <TokenSettings />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

/** Page header used by every page. */
export function PageHeader({
  kicker,
  title,
  actions,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-8 pt-7 pb-5">
      <div className="min-w-0">
        {kicker ? <div className="mb-1 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">{kicker}</div> : null}
        <h1 className="font-serif text-2xl text-fg">{title}</h1>
        {children}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
