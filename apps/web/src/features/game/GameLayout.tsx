import { BookOpen, Backpack, LogOut, MapPinOff, Radar, Users } from "lucide-react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router";
import type { GameStateResponse } from "@wildbound/shared";
import { Shell } from "@/components/layout/Shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useGameState, useLogout, useMe } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { useLocation } from "../location/LocationProvider.tsx";
import { usePositionReporter } from "../location/usePositionReporter.ts";
import { TIME_LABEL, TimeIcon, WEATHER_LABEL, WeatherIcon } from "./environment.tsx";
import { formatClock, useClock } from "./useClock.ts";

/**
 * Everything behind the two setup steps. Owns position reporting and the
 * "paused" state: if location sharing stops, the whole game is covered until
 * it comes back (the player is never kicked out, just paused).
 */
export function GameLayout() {
  const me = useMe();
  const { status, fix, start } = useLocation();
  const playable = status === "active";
  const serverPosition = usePositionReporter(fix, playable);
  const state = useGameState(playable);

  if (!me.data) return <Navigate to="/" replace />;
  // Never reached the game with location on: go back to the location step.
  if (!fix) return <Navigate to="/location" replace />;

  const lockedUntil = state.data?.lockedUntil ?? serverPosition?.lockedUntil ?? null;
  return (
    // Fixed viewport height: the radar map fills the space between the bars; other pages scroll inside <main>.
    <Shell className="h-dvh min-h-0 overflow-hidden">
      <StatusBar state={state.data} />
      {serverPosition?.verdict === "too-fast" && (
        <Banner>That GPS jump looked impossible, so it was ignored. Keep moving normally.</Banner>
      )}
      {lockedUntil && (
        <Banner>
          Survey paused until {formatClock(new Date(lockedUntil))}: too many impossible jumps in a row.
        </Banner>
      )}

      <main
        className={cn("relative flex min-h-0 flex-1 flex-col overflow-y-auto", !playable && "pointer-events-none select-none blur-[1px]")}
      >
        <Outlet />
      </main>
      <BottomNav />

      {!playable && <PausedOverlay status={status} onRetry={start} />}
    </Shell>
  );
}

function StatusBar({ state: data }: { state: GameStateResponse | undefined }) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const env = data?.environment;
  const now = useClock();

  return (
    <header className="z-20 bg-deep-forest px-4 pt-3 pb-3 text-paper">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-label-md text-paper/60">Researcher</p>
          <p className="truncate font-serif text-lg">{me.data?.displayName}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-paper hover:bg-forest-slate"
          aria-label="Log out"
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
        >
          <LogOut />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Chip>
          {env && <TimeIcon timeOfDay={env.timeOfDay} className="size-4" />}
          {formatClock(now, env?.timeZone)}
          {env && <span className="text-paper/70">· {TIME_LABEL[env.timeOfDay]}</span>}
        </Chip>
        {env && (
          <Chip title={env.weatherSource === "fallback" ? "Live weather unavailable" : undefined}>
            <WeatherIcon weather={env.weather} className="size-4" />
            {WEATHER_LABEL[env.weather]}
            {env.temperatureC !== null && <span className="text-paper/70">· {Math.round(env.temperatureC)}°C</span>}
          </Chip>
        )}
        <Chip>{data?.habitat?.name ?? data?.region?.name ?? "Outside the surveyed area"}</Chip>
      </div>
    </header>
  );
}

const Chip = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <span title={title} className="inline-flex items-center gap-1.5 rounded-full bg-forest-slate px-2.5 py-1">
    {children}
  </span>
);

const Banner = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-field-gold px-4 py-2 text-sm text-ink">{children}</div>
);

const NAV = [
  { to: "/play", label: "Radar", icon: Radar, end: true },
  { to: "/play/registry", label: "Registry", icon: BookOpen },
  { to: "/play/satchel", label: "Satchel", icon: Backpack },
  { to: "/play/party", label: "Party", icon: Users },
];

function BottomNav() {
  return (
    <nav className="z-20 grid grid-cols-4 bg-deep-forest px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-1 rounded-md py-2 text-label-md normal-case",
              isActive ? "bg-primary-forest text-paper" : "text-paper/70 hover:text-paper",
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function PausedOverlay({ status, onRetry }: { status: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-deep-forest/70 p-6" role="alertdialog" aria-modal>
      <div className="w-full max-w-sm rounded-lg border border-muted-paper bg-paper p-6 shadow-card">
        <MapPinOff className="size-8 text-terracotta" />
        <h2 className="text-headline-md mt-3 text-ink">Survey paused</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {status === "denied"
            ? "Location sharing was turned off. Turn it back on in your browser's site settings to keep playing."
            : "We lost your GPS signal. The survey resumes as soon as a location fix arrives."}
        </p>
        <Button className="mt-5 w-full" onClick={onRetry}>
          Turn location back on
        </Button>
      </div>
    </div>
  );
}
