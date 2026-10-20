import { MapPinOff, Navigation } from "lucide-react";
import { Navigate, useNavigate } from "react-router";
import { ConsoleButton, LcdScreen, Led, Shell } from "@/components/layout/Shell.tsx";
import { useLogout } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { useLocation, type LocationStatus } from "./LocationProvider.tsx";

/**
 * Step 2 of 2: location sharing. The game is never reachable without it:
 * once the first fix arrives we move on to the radar automatically.
 * Layout: Stitch screen 2 "Location Permission" (patches/0.1.0/mockups/2-location.html).
 */
export function LocationGatePage() {
  const { status, start } = useLocation();
  const logout = useLogout();
  const navigate = useNavigate();
  if (status === "active") return <Navigate to="/play" replace />;

  const tracking = status === "acquiring";
  return (
    <Shell>
      <div className="mt-2 mb-3 flex items-center justify-between px-3 font-pixel text-[7px] tracking-wider uppercase">
        <span className="text-chassis-text">WB-01 // Field unit</span>
        <span className="flex items-center gap-2 text-chassis-text">
          Power <Led className="size-2" />
        </span>
      </div>

      <LcdScreen>
        <div className="mb-3 flex items-center justify-between border-b-2 border-lcd-edge pb-1.5 font-pixel text-[8px]">
          <span className="rounded-sm bg-lcd-edge px-2 py-1 text-lcd">FIELD TERMINAL</span>
          <span>SATELLITE LINK</span>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative flex size-20 items-center justify-center rounded-full border-4 border-[#33583b] bg-[#d0e5c1] shadow-[inset_0_2px_4px_rgb(0_0_0/0.25)]">
            <span aria-hidden className="absolute inset-1 rounded-full border border-dashed border-[#618a6a]" />
            <span
              className={cn(
                "relative flex size-11 items-center justify-center rounded-full border-2 border-[#7fc897] bg-[#1e4a35]",
                tracking && "animate-pulse",
              )}
            >
              <Navigation className="size-6 text-[#55ffa2]" aria-hidden />
            </span>
            <span className="absolute right-2 bottom-1 font-pixel text-[6px]">GPS</span>
          </div>
          <h1 className="mt-3 font-pixel text-[13px] leading-5 tracking-tight">Enable location?</h1>
          <p className="mt-1 border border-lcd-edge bg-[#c3deb2] px-2 py-0.5 font-pixel text-[8px]">
            [ TRACKER MODE: {tracking ? "SEARCHING" : "OFF"} ]
          </p>
        </div>

        <div className="relative mt-5 rounded-md border-4 border-[#143224] bg-[#f8fbf4] p-2.5 pt-3 shadow-[2px_2px_0_#27533c]">
          <span className="absolute -top-2.5 left-3 rounded-sm bg-[#143224] px-1.5 py-0.5 font-pixel text-[7px] text-[#86efac]">DIALOGUE</span>
          <p className="font-vt text-[21px] leading-[22px] tracking-wide">
            Wildbound maps your real position to a habitat in the Field Registry. Your local weather and time of day decide which Wildkin appear.
          </p>
          <p className="mt-2 font-vt text-lg leading-5 text-lcd-ink/70">
            Positions are checked on the server: impossible jumps pause your survey.
          </p>
        </div>

        <StatusLine status={status} />
      </LcdScreen>

      <div className="mt-4 flex flex-col gap-2.5">
        <ConsoleButton face="A" onClick={start} disabled={tracking || status === "unsupported"} trailing="►">
          {tracking ? "Waiting for GPS…" : status === "denied" ? "Try again" : "Allow location"}
        </ConsoleButton>
        <ConsoleButton
          face="B"
          trailing="ESC"
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
        >
          Switch researcher
        </ConsoleButton>
      </div>
      <p className="mt-3 text-center font-pixel text-[7px] tracking-widest text-chassis-text uppercase">
        Step 2 of 2 · location stays on while you play
      </p>
    </Shell>
  );
}

function StatusLine({ status }: { status: LocationStatus }) {
  const problem =
    status === "denied"
      ? "Location is blocked for this site. Allow it in your browser's site settings, then try again."
      : status === "unsupported"
        ? "This browser cannot share location here. Open the game over HTTPS (or localhost) in a modern browser."
        : status === "unavailable"
          ? "Location is allowed but no GPS fix is arriving yet. Check that location services are on."
          : null;
  if (!problem) {
    return (
      <p className="mt-3 text-center font-pixel text-[7px] leading-3 text-[#2b563b]">
        {status === "acquiring" ? "GPS: ACQUIRING SATELLITES…" : "GPS READY: AWAITING PERMISSION"}
      </p>
    );
  }
  return (
    <p role="alert" className="mt-3 flex gap-2 border-2 border-terracotta bg-terracotta/10 px-2 py-1 font-vt text-lg leading-5 text-terracotta">
      <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      {problem}
    </p>
  );
}
