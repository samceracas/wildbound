import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type LocationStatus =
  /** Browser has no geolocation API (or the page is not a secure context). */
  | "unsupported"
  /** Permission not decided yet; the user must press "Allow". */
  | "prompt"
  /** Permission granted and waiting for the first fix. */
  | "acquiring"
  /** Receiving fixes. The only status in which the game is playable. */
  | "active"
  /** The user blocked location (in the prompt or later in browser settings). */
  | "denied"
  /** Location is allowed but no fix is coming (GPS off, timeout). */
  | "unavailable";

export interface Fix {
  lat: number;
  lng: number;
  /** Meters (68% confidence radius). */
  accuracy: number;
  /** Device time of the fix (ms). */
  timestamp: number;
}

interface LocationState {
  status: LocationStatus;
  fix: Fix | null;
  /** Starts watching; triggers the browser permission prompt if needed. */
  start: () => void;
}

const LocationContext = createContext<LocationState | null>(null);

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 };

/**
 * Owns the browser geolocation watch for the whole app, so it survives page
 * changes. Also listens to the Permissions API: if the player turns location
 * off mid-game, `status` flips to "denied" and the game pauses (GameLayout).
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator && window.isSecureContext;
  const [status, setStatus] = useState<LocationStatus>(supported ? "prompt" : "unsupported");
  const [fix, setFix] = useState<Fix | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (!supported || watchId.current !== null) return;
    setStatus((s) => (s === "active" ? s : "acquiring"));
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp });
        setStatus("active");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stop();
          setStatus("denied");
        } else {
          setStatus("unavailable"); // keep watching; a later fix flips back to active
        }
      },
      WATCH_OPTIONS,
    );
  }, [stop, supported]);

  // Follow permission changes (e.g. the player revokes access in site settings).
  useEffect(() => {
    if (!supported || !navigator.permissions) return;
    let permission: PermissionStatus | undefined;
    const onChange = () => {
      if (!permission) return;
      if (permission.state === "denied") {
        stop();
        setStatus("denied");
      } else if (permission.state === "granted") {
        start();
      } else {
        stop();
        setStatus("prompt");
      }
    };
    void navigator.permissions.query({ name: "geolocation" }).then((p) => {
      permission = p;
      p.addEventListener("change", onChange);
      // Already granted on a previous visit: start silently.
      if (p.state === "granted") start();
      if (p.state === "denied") setStatus("denied");
    });
    return () => permission?.removeEventListener("change", onChange);
  }, [start, stop, supported]);

  useEffect(() => stop, [stop]);

  const value = useMemo(() => ({ status, fix, start }), [status, fix, start]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}
