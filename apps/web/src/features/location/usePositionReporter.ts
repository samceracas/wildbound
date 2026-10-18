import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { PositionResponse } from "@wildbound/shared";
import { api } from "@/lib/api.ts";
import { keys } from "@/lib/queries.ts";
import type { Fix } from "./LocationProvider.tsx";

/** Send at most one report per interval unless the player moved further than this. */
const MIN_INTERVAL_MS = 4_000;
const MIN_MOVE_M = 8;
/**
 * Browsers often stop calling watchPosition while the device is still, but the
 * server only treats a position as current for GAME_RULES.positionStaleMs.
 * Re-sending the last fix keeps a stationary player playable.
 */
const HEARTBEAT_MS = 30_000;

const roughMeters = (a: Fix, b: Fix) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/**
 * Forwards GPS fixes to the server, which decides whether they are plausible.
 * Returns the server's latest answer so the UI can explain a rejected fix.
 */
export function usePositionReporter(fix: Fix | null, enabled: boolean): PositionResponse | null {
  const qc = useQueryClient();
  const [last, setLast] = useState<PositionResponse | null>(null);
  const sent = useRef<{ fix: Fix; at: number } | null>(null);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setBeat((b) => b + 1), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !fix) return;
    const prev = sent.current;
    const heartbeatDue = !prev || Date.now() - prev.at >= HEARTBEAT_MS;
    if (prev && !heartbeatDue && Date.now() - prev.at < MIN_INTERVAL_MS && roughMeters(prev.fix, fix) < MIN_MOVE_M) return;
    if (prev && !heartbeatDue && prev.fix === fix) return;
    sent.current = { fix, at: Date.now() };

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void api
      .reportPosition({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, clientTime: fix.timestamp, timeZone })
      .then((res) => {
        setLast(res);
        if (res.verdict === "accepted" || res.verdict === "first-fix") void qc.invalidateQueries({ queryKey: keys.state });
      })
      .catch(() => {
        // Network hiccup: the next fix retries.
        sent.current = null;
      });
  }, [enabled, fix, qc, beat]);

  return last;
}
