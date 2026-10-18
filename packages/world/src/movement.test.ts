import { describe, expect, it } from "vitest";
import { GAME_RULES } from "@wildbound/shared";
import { canAct, checkMovement, distanceMeters, type TrackedPosition } from "./movement.ts";

const t0 = new Date("2026-10-18T10:00:00Z");
const after = (s: number) => new Date(t0.getTime() + s * 1000);
const tracked = (over: Partial<TrackedPosition> = {}): TrackedPosition => ({
  lat: 14.65,
  lng: 121.04,
  accuracyM: 10,
  recordedAt: t0,
  strikes: 0,
  lockedUntil: null,
  ...over,
});
/** Point `meters` north of the tracked position. */
const north = (meters: number) => ({ lat: 14.65 + meters / 111_195, lng: 121.04, accuracyM: 10 });

describe("distanceMeters", () => {
  it("measures about 111 km per degree of latitude", () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });
  it("is zero for identical points", () => {
    expect(distanceMeters({ lat: 14.65, lng: 121.04 }, { lat: 14.65, lng: 121.04 })).toBe(0);
  });
});

describe("checkMovement", () => {
  it("accepts the first fix", () => {
    const d = checkMovement(null, north(0), t0);
    expect(d.verdict).toBe("first-fix");
    expect(d.next?.recordedAt).toEqual(t0);
  });

  it("accepts walking speed and resets strikes", () => {
    const d = checkMovement(tracked({ strikes: 2 }), north(60), after(60));
    expect(d.verdict).toBe("accepted");
    expect(d.next?.strikes).toBe(0);
  });

  it("allows GPS jitter even with no elapsed time", () => {
    expect(checkMovement(tracked(), north(40), t0).verdict).toBe("accepted");
  });

  it("rejects a teleport and keeps the old position", () => {
    const d = checkMovement(tracked(), north(5_000), after(10));
    expect(d.verdict).toBe("too-fast");
    expect(d.next?.lat).toBe(14.65);
    expect(d.next?.strikes).toBe(1);
  });

  it("locks the player after repeated teleports", () => {
    const d = checkMovement(tracked({ strikes: GAME_RULES.strikesBeforeLock - 1 }), north(5_000), after(10));
    expect(d.verdict).toBe("locked");
    expect(d.next?.lockedUntil?.getTime()).toBe(after(10).getTime() + GAME_RULES.lockMs);
  });

  it("ignores reports while locked", () => {
    const d = checkMovement(tracked({ lockedUntil: after(60) }), north(1), after(30));
    expect(d).toEqual({ verdict: "locked", next: null });
  });

  it("ignores low-accuracy fixes without a strike", () => {
    const d = checkMovement(tracked(), { ...north(10), accuracyM: GAME_RULES.maxAccuracyM + 1 }, after(5));
    expect(d).toEqual({ verdict: "low-accuracy", next: null });
  });
});

describe("canAct", () => {
  it("requires a fresh, unlocked position", () => {
    expect(canAct(null, t0)).toBe(false);
    expect(canAct(tracked(), after(10))).toBe(true);
    expect(canAct(tracked(), after(GAME_RULES.positionStaleMs / 1000 + 1))).toBe(false);
    expect(canAct(tracked({ lockedUntil: after(60) }), after(10))).toBe(false);
  });
});
