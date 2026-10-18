import { Compass, MapPinOff, ShieldCheck } from "lucide-react";
import { Navigate } from "react-router";
import { Shell, Wordmark } from "@/components/layout/Shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useLocation } from "./LocationProvider.tsx";

/**
 * Step 2 of 2: location sharing. The game is never reachable without it:
 * once the first fix arrives we move on to the radar automatically.
 */
export function LocationGatePage() {
  const { status, start } = useLocation();
  if (status === "active") return <Navigate to="/play" replace />;

  return (
    <Shell>
      <header className="bg-deep-forest px-6 pt-10 pb-8">
        <Wordmark />
        <h1 className="text-display mt-8 text-paper">Share your location</h1>
        <p className="mt-3 text-paper/75">
          Wildbound maps where you are to a habitat in the Field Registry. Wildkin only appear around your real position.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-6 py-8">
        <Reason icon={<Compass className="size-5" />} title="Find nearby Wildkin">
          Your habitat, local weather and time of day decide which species can appear.
        </Reason>
        <Reason icon={<ShieldCheck className="size-5" />} title="Checked on the server">
          Positions are verified for plausible movement. Jumping across the map pauses your survey.
        </Reason>

        <StatusNote status={status} />

        <div className="mt-auto flex flex-col gap-3">
          <Button size="lg" onClick={start} disabled={status === "acquiring" || status === "unsupported"}>
            {status === "acquiring" ? "Waiting for GPS…" : status === "denied" ? "Try again" : "Allow location sharing"}
          </Button>
          <p className="text-center text-xs text-ink-muted">Step 2 of 2 · Location stays on while you play</p>
        </div>
      </div>
    </Shell>
  );
}

function Reason({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-muted-paper bg-paper p-4">
      <div className="mt-0.5 text-primary-forest">{icon}</div>
      <div>
        <p className="text-label-lg text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

function StatusNote({ status }: { status: ReturnType<typeof useLocation>["status"] }) {
  const text =
    status === "denied"
      ? "Location is blocked for this site. Allow it in your browser's site settings, then try again."
      : status === "unsupported"
        ? "This browser cannot share location here. Open the game over HTTPS (or localhost) in a modern browser."
        : status === "unavailable"
          ? "Location is allowed but no GPS fix is arriving yet. Check that location services are on."
          : null;
  if (!text) return null;
  return (
    <p className="flex gap-2 rounded-md bg-terracotta/10 px-3 py-2 text-sm text-terracotta">
      <MapPinOff className="mt-0.5 size-4 shrink-0" />
      {text}
    </p>
  );
}
