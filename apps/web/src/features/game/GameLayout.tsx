import { LogOut, MapPinOff } from "lucide-react";
import { Link, NavLink, Navigate, Outlet, useLocation as useRoute, useNavigate } from "react-router";
import { CAPSULE_ITEM_IDS, PARTY_SIZE, type GameStateResponse } from "@wildbound/shared";
import { ConsoleButton, Led, Shell } from "@/components/layout/Shell.tsx";
import { useGameState, useInventory, useLogout, useMe, useParty, useRegistry } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { useLocation, type LocationStatus } from "../location/LocationProvider.tsx";
import { usePositionReporter } from "../location/usePositionReporter.ts";
import { TIME_LABEL, TimeIcon, WEATHER_LABEL, WeatherIcon } from "./environment.tsx";
import { formatClock, useClock } from "./useClock.ts";

/**
 * Everything behind the two setup steps. Owns position reporting and the
 * "paused" state: if location sharing stops, the whole game is covered until
 * it comes back (the player is never kicked out, just paused).
 *
 * Layout: the handheld console from Stitch screens 3–6 (chassis header, status
 * strip, cartridge tabs, then the paper screen with the current page).
 */
export function GameLayout() {
  const me = useMe();
  const { status, fix, start } = useLocation();
  const playable = status === "active";
  const serverPosition = usePositionReporter(fix, playable);
  const state = useGameState(playable);
  const { pathname } = useRoute();

  if (!me.data) return <Navigate to="/" replace />;
  // Never reached the game with location on: go back to the location step.
  if (!fix) return <Navigate to="/location" replace />;
  // A new license holder chooses a starter before anything else (a battle needs a Wildkin).
  if (state.data?.needsStarter && pathname !== "/play/starter") return <Navigate to="/play/starter" replace />;

  const activeBattleId = state.data?.activeBattleId ?? null;
  const onBattleScreen = pathname.startsWith("/play/battle/");

  const lockedUntil = state.data?.lockedUntil ?? serverPosition?.lockedUntil ?? null;
  return (
    // Fixed viewport height: the radar map fills the screen; other pages scroll inside <main>.
    <Shell className="h-dvh min-h-0 overflow-hidden">
      <ConsoleHeader />
      <StatusStrip state={state.data} status={status} />
      <Tabs />

      <div className="scanlines relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-2xl rounded-tr-2xl border border-screen-edge bg-screen shadow-[inset_0_0_12px_rgb(0_0_0/0.2)]">
        {serverPosition?.verdict === "too-fast" && (
          <Banner>That GPS jump looked impossible, so it was ignored. Keep moving normally.</Banner>
        )}
        {lockedUntil && (
          <Banner>Survey paused until {formatClock(new Date(lockedUntil))}: too many impossible jumps in a row.</Banner>
        )}
        {activeBattleId && !onBattleScreen && (
          <Banner>
            <Link to={`/play/battle/${activeBattleId}`} className="flex items-center justify-between gap-2">
              <span>Battle in progress</span>
              <span className="font-pixel text-[8px] uppercase underline">Return ►</span>
            </Link>
          </Banner>
        )}
        <main
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-y-auto text-ink",
            !playable && "pointer-events-none blur-[1px] select-none",
          )}
        >
          <Outlet />
        </main>
      </div>

      <p className="mt-2 flex justify-between px-2 font-pixel text-[7px] tracking-wider text-chassis-text uppercase">
        <span>[WB-01 field unit]</span>
        <span>{state.data?.region?.name ?? "Unsurveyed"}</span>
      </p>

      {!playable && <PausedOverlay status={status} onRetry={start} />}
    </Shell>
  );
}

function ConsoleHeader() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <header className="flex items-center justify-between gap-2 px-2 pt-2 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded border-2 border-[#337a63] bg-[#102c23] font-pixel text-[10px] text-field-gold">
          ★
        </span>
        <div className="min-w-0">
          <p className="font-pixel text-[9px] leading-tight tracking-widest text-[#a8f1d8] uppercase">Wildbound nav</p>
          <p className="font-vt text-sm leading-none tracking-wider text-chassis-text uppercase">Mabunyi cartography · v0.3</p>
        </div>
      </div>
      <button
        type="button"
        title="Log out"
        className="flex min-w-0 items-center gap-1.5 rounded border border-chassis-edge bg-chassis-deep px-2 py-1 font-pixel text-[8px] text-[#a8f1d8] uppercase hover:border-field-gold"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
      >
        <Led />
        <span className="truncate">{me.data?.displayName}</span>
        <LogOut className="size-3 shrink-0" aria-label="Log out" />
      </button>
    </header>
  );
}

/** PWR / GPS / weather / local time, all live. */
function StatusStrip({ state: data, status }: { state: GameStateResponse | undefined; status: LocationStatus }) {
  const env = data?.environment;
  const now = useClock();
  return (
    <div className="mx-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-[#1b3d32] bg-chassis-deep px-2 py-1.5 font-pixel text-[7px] uppercase shadow-inner">
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1 text-[#52937e]">
          <Led /> PWR
        </span>
        <span className={cn("flex items-center gap-1", status === "active" ? "text-field-gold" : "text-terracotta")}>
          <Led on={status === "active"} color="bg-field-gold" /> GPS: {status === "active" ? "ON" : "OFF"}
        </span>
      </div>
      <div className="flex items-center gap-2 text-paper/90">
        {env && (
          <span className="flex items-center gap-1" title={env.weatherSource === "fallback" ? "Live weather unavailable" : undefined}>
            <WeatherIcon weather={env.weather} className="size-3 text-field-gold" />
            {WEATHER_LABEL[env.weather]}
            {env.temperatureC !== null && ` · ${Math.round(env.temperatureC)}°C`}
          </span>
        )}
        <span className="flex items-center gap-1 text-chassis-text">
          {env && <TimeIcon timeOfDay={env.timeOfDay} className="size-3" />}
          {env && `${TIME_LABEL[env.timeOfDay]} · `}
          {formatClock(now, env?.timeZone)}
        </span>
      </div>
    </div>
  );
}

/** Cartridge-style tabs with live counters (Registry seen, capsules left, party size). */
function Tabs() {
  const registry = useRegistry();
  const inventory = useInventory();
  const party = useParty();
  const capsuleIds: readonly string[] = CAPSULE_ITEM_IDS;
  const capsules = inventory.data?.items.filter((i) => capsuleIds.includes(i.itemId)).reduce((n, i) => n + i.quantity, 0);
  const partyCount = party.data?.party.filter(Boolean).length;
  const tabs = [
    { to: "/play", label: "Radar", end: true, count: undefined },
    { to: "/play/registry", label: "Registry", count: registry.data?.observedCount },
    { to: "/play/satchel", label: "Satchel", count: capsules },
    { to: "/play/party", label: "Party", count: partyCount === undefined ? undefined : `${partyCount}/${PARTY_SIZE}` },
    { to: "/play/license", label: "License", count: undefined },
  ];
  return (
    <nav className="mt-2 grid grid-cols-5 gap-0.5 px-0.5" aria-label="Game screens">
      {tabs.map(({ to, label, end, count }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-t-md px-0.5 py-1.5 font-pixel text-[7px] uppercase outline-none focus-visible:ring-2 focus-visible:ring-field-gold",
              isActive
                ? "border-t-2 border-field-gold bg-screen text-deep-forest"
                : "border-x border-t border-chassis-edge bg-chassis-deep/70 text-[#7fc4ad] hover:text-paper",
            )
          }
        >
          {({ isActive }) => (
            // Five tabs at 390 px: the label and its counter stack so neither is cut off.
            <>
              <span className="max-w-full truncate">{label}</span>
              <span className={cn("h-2.5 leading-[10px]", isActive ? "text-primary-forest" : "text-field-gold")}>
                {count ?? (isActive ? "▲" : "")}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

const Banner = ({ children }: { children: React.ReactNode }) => (
  <div role="status" className="border-b-2 border-[#b08a3a] bg-field-gold px-3 py-1.5 font-vt text-lg leading-5 text-ink">
    {children}
  </div>
);

function PausedOverlay({ status, onRetry }: { status: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-chassis-deep/75 p-6" role="alertdialog" aria-modal aria-labelledby="paused-title">
      <div className="relative w-full max-w-sm rounded-md border-4 border-[#143224] bg-[#f8fbf4] p-4 pt-5 shadow-[3px_3px_0_#27533c]">
        <span className="absolute -top-2.5 left-3 rounded-sm bg-[#143224] px-1.5 py-0.5 font-pixel text-[7px] text-[#86efac]">SIGNAL LOST</span>
        <MapPinOff className="size-7 text-terracotta" aria-hidden />
        <h2 id="paused-title" className="mt-2 font-pixel text-[12px] text-lcd-ink">
          Survey paused
        </h2>
        <p className="mt-2 font-vt text-xl leading-6 text-lcd-ink">
          {status === "denied"
            ? "Location sharing was turned off. Turn it back on in your browser's site settings to keep playing."
            : "We lost your GPS signal. The survey resumes as soon as a location fix arrives."}
        </p>
        <ConsoleButton face="A" className="mt-4" onClick={onRetry} trailing="►">
          Turn location back on
        </ConsoleButton>
      </div>
    </div>
  );
}
