import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef } from "react";
import { FIELD_STATION_TYPES, GAME_RULES, type PoiView, type SpawnView } from "@wildbound/shared";
import { PLAYER_HEAD, wildkinArtFallback, wildkinIcon } from "@/lib/assets.ts";

interface Props {
  player: { lat: number; lng: number } | null;
  spawns: SpawnView[];
  selectedId: string | null;
  onSelect: (spawn: SpawnView) => void;
  /** Text on the tag above a marker (the name once observed, else the registry number). */
  labelFor: (spawn: SpawnView) => string;
  /** Points of interest within reach (supplies, field stations). */
  pois: PoiView[];
  selectedPoiId: string | null;
  onSelectPoi: (poi: PoiView) => void;
}

const isStation = (poi: PoiView) => (FIELD_STATION_TYPES as readonly string[]).includes(poi.type);

/** POI marker: a square pixel sign ("+" for a field station, a crate mark for supplies) with its name. */
function poiElement(): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "flex flex-col items-center gap-0.5 outline-none";
  // Below Wildkin markers: a sighting always wins a tap over a POI.
  el.style.zIndex = "0";
  const sign = document.createElement("span");
  sign.dataset.role = "sign";
  const tag = document.createElement("span");
  tag.dataset.role = "tag";
  el.append(sign, tag);
  return el;
}

const RANGE_SOURCE = "interact-range";
/**
 * Walk timing. Polls are 10 s apart and bring every spawn's new position at
 * once, so each marker waits its own random delay before walking, and walks for
 * a time that depends on the distance (a short hop is quick, a long trek takes
 * longer). That way Wildkin set off and stop at different moments instead of
 * moving in lockstep.
 */
const WALK_MIN_MS = 900;
const WALK_MAX_MS = 3600;
/** Pace used to turn distance into walk time (meters per second on screen). */
const WALK_PACE_MPS = 1.2;
/** Latest moment a walk may start after a poll, so it ends before the next one. */
const WALK_WINDOW_MS = 9000;
/** Fade in/out time for spawns that appear or wander off. */
const FADE_MS = 350;

type LngLat = { lat: number; lng: number };

/** One spawn marker plus its walk animation state. */
interface SpawnMarker {
  marker: maplibregl.Marker;
  /** Latest server data for this spawn (the click handler reads it). */
  spawn: SpawnView;
  /** Where the walk started, where it ends, when it starts (performance.now(), may be in the future) and how long it takes. */
  from: LngLat;
  to: LngLat;
  start: number;
  duration: number;
  /** Still has frames to draw (the rAF loop parks it at `to` when done). */
  walking: boolean;
  /** Icon mirrored (walking left; the art faces right). Applied when the walk actually starts. */
  facingLeft: boolean;
}

/** Rough ground distance in meters between two points (small distances). */
function metersBetween(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** This walk's own duration and start delay (see WALK_* above). */
function planWalk(from: LngLat, to: LngLat): { delay: number; duration: number } {
  const duration = Math.min(WALK_MAX_MS, Math.max(WALK_MIN_MS, (metersBetween(from, to) / WALK_PACE_MPS) * 1000));
  return { delay: Math.random() * Math.max(0, WALK_WINDOW_MS - duration), duration };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Where a marker is drawn at time `now`. */
function positionAt(sm: SpawnMarker, now: number): LngLat {
  const t = Math.min(1, Math.max(0, (now - sm.start) / sm.duration));
  if (t >= 1) return sm.to;
  const k = easeInOut(t);
  return { lat: sm.from.lat + (sm.to.lat - sm.from.lat) * k, lng: sm.from.lng + (sm.to.lng - sm.from.lng) * k };
}

/** Circle polygon (approximate) of `radiusM` around a point, for the interact range ring. */
function circle(center: { lat: number; lng: number }, radiusM: number, steps = 48) {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([
      center.lng + (radiusM * Math.sin(a)) / (111_320 * Math.cos((center.lat * Math.PI) / 180)),
      center.lat + (radiusM * Math.cos(a)) / 111_320,
    ]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
}

function markerElement(src: string, className: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.className = "pixelated size-full";
  el.append(img);
  return el;
}

/** Spawn marker: a pixel-font tag above a round icon (Stitch radar screen). */
function spawnElement(creatureId: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "flex flex-col items-center gap-1 outline-none";
  el.style.zIndex = "1";
  // Fades in once added (see the spawn effect); maplibre owns `transform`, so only opacity is animated here.
  el.style.opacity = "0";
  el.style.transition = `opacity ${FADE_MS}ms ease-out`;
  const tag = document.createElement("span");
  tag.dataset.role = "tag";
  const icon = markerElement(wildkinIcon(creatureId), "");
  icon.dataset.role = "icon";
  icon.tabIndex = -1;
  const img = icon.querySelector("img");
  if (img) {
    img.dataset.role = "art";
    img.style.transition = "transform 150ms ease-out";
    img.addEventListener("error", () => wildkinArtFallback(img, creatureId, "icon"));
  }
  el.append(tag, icon);
  return el;
}

/**
 * Adds the interact-range overlay if it is missing. Returns false while the map
 * cannot take sources yet. Deliberately not gated on isStyleLoaded(): that stays
 * false until every tile source has loaded, which can take long (or never
 * happen when the tile server is unreachable).
 */
function ensureRangeOverlay(m: maplibregl.Map): boolean {
  if (m.getSource(RANGE_SOURCE)) return true;
  try {
    m.addSource(RANGE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  } catch {
    return false; // style JSON not parsed yet; a later map event retries
  }
  m.addLayer({ id: "range-fill", type: "fill", source: RANGE_SOURCE, paint: { "fill-color": "#1F6B57", "fill-opacity": 0.08 } });
  m.addLayer({
    id: "range-line",
    type: "line",
    source: RANGE_SOURCE,
    paint: { "line-color": "#1F6B57", "line-width": 1.5, "line-dasharray": [2, 2] },
  });
  return true;
}

/**
 * The radar. MapLibre is imperative, so the map is created once and markers are
 * synced in effects (React never re-renders the map itself).
 */
export function RadarMap({ player, spawns, selectedId, onSelect, labelFor, pois, selectedPoiId, onSelectPoi }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const playerMarker = useRef<maplibregl.Marker | null>(null);
  const spawnMarkers = useRef(new Map<string, SpawnMarker>());
  /** Markers fading out after their spawn left the list, with their removal timers. */
  const leaving = useRef(new Map<maplibregl.Marker, number>());
  const walkFrame = useRef<number | null>(null);
  const centered = useRef(false);
  /** Latest range ring to show, and whether the map still needs it. Survives map (re)creation. */
  const range = useRef<ReturnType<typeof circle> | null>(null);
  const rangeDirty = useRef(false);
  const syncRange = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const poiMarkers = useRef(new Map<string, { marker: maplibregl.Marker; poi: PoiView }>());
  const onSelectPoiRef = useRef(onSelectPoi);
  onSelectPoiRef.current = onSelectPoi;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          // Pale survey-green "LCD" under a washed-out basemap, so the pixel art reads first.
          { id: "paper", type: "background", paint: { "background-color": "#DBE8D8" } },
          { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.8, "raster-opacity": 0.6 } },
        ],
      },
      center: [121.04, 14.65],
      zoom: 17,
      maxZoom: 19,
      minZoom: 14,
      attributionControl: { compact: true },
    });
    // Push the pending range ring as soon as the map can take it. A freshly mounted
    // map (e.g. after switching tabs) is not ready during the first effects, and
    // which of these events comes first depends on timing, so listen to all of them.
    const sync = () => {
      if (!rangeDirty.current || !range.current || !ensureRangeOverlay(m)) return;
      (m.getSource(RANGE_SOURCE) as maplibregl.GeoJSONSource).setData(range.current);
      rangeDirty.current = false;
    };
    syncRange.current = sync;
    for (const event of ["styledata", "sourcedata", "load", "idle"] as const) m.on(event, sync);
    map.current = m;
    return () => {
      syncRange.current = () => {};
      rangeDirty.current = true; // the next map needs the ring again
      if (walkFrame.current !== null) cancelAnimationFrame(walkFrame.current);
      walkFrame.current = null;
      for (const timer of leaving.current.values()) clearTimeout(timer);
      leaving.current.clear();
      m.remove();
      map.current = null;
      playerMarker.current = null;
      spawnMarkers.current.clear();
      poiMarkers.current.clear();
      centered.current = false;
    };
  }, []);

  // Player marker + interact range ring.
  useEffect(() => {
    const m = map.current;
    if (!m || !player) return;
    if (!playerMarker.current) {
      const el = markerElement(PLAYER_HEAD, "size-12 drop-shadow-[0_2px_0_rgba(24,63,54,0.6)]");
      el.setAttribute("aria-label", "You");
      // Drawn above POI signs so standing on one never hides you, but taps go
      // through to the POI underneath (your own marker does nothing when tapped).
      el.style.zIndex = "2";
      el.style.pointerEvents = "none";
      playerMarker.current = new maplibregl.Marker({ element: el }).setLngLat([player.lng, player.lat]).addTo(m);
    } else {
      playerMarker.current.setLngLat([player.lng, player.lat]);
    }
    if (!centered.current) {
      m.jumpTo({ center: [player.lng, player.lat] });
      centered.current = true;
    }
    range.current = circle(player, GAME_RULES.interactRadiusM);
    rangeDirty.current = true;
    syncRange.current();
  }, [player]);

  /** Advances every walking marker one frame; keeps itself scheduled while any is still moving. */
  const walk = useCallback(() => {
    walkFrame.current = null;
    const now = performance.now();
    let moving = false;
    for (const sm of spawnMarkers.current.values()) {
      if (!sm.walking) continue;
      moving = true;
      if (now < sm.start) continue; // still waiting for its own moment to set off
      const art = sm.marker.getElement().querySelector<HTMLElement>("[data-role=art]");
      if (art) art.style.transform = sm.facingLeft ? "scaleX(-1)" : "";
      const p = positionAt(sm, now);
      sm.marker.setLngLat([p.lng, p.lat]);
      if (now - sm.start >= sm.duration) sm.walking = false; // drawn exactly at `to`
    }
    if (moving) walkFrame.current = requestAnimationFrame(walk);
  }, []);

  // Spawn markers: fade in new, walk existing to their new position, fade out gone.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const live = new Set(spawns.map((s) => s.id));
    for (const [id, sm] of spawnMarkers.current) {
      if (live.has(id)) continue;
      spawnMarkers.current.delete(id);
      const el = sm.marker.getElement();
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      const marker = sm.marker;
      leaving.current.set(
        marker,
        window.setTimeout(() => {
          marker.remove();
          leaving.current.delete(marker);
        }, FADE_MS),
      );
    }
    const now = performance.now();
    const animate = !reducedMotion();
    let startWalk = false;
    for (const s of spawns) {
      let sm = spawnMarkers.current.get(s.id);
      const target = { lat: s.lat, lng: s.lng };
      if (!sm) {
        const el = spawnElement(s.creatureId);
        const id = s.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const current = spawnMarkers.current.get(id);
          if (current) onSelectRef.current(current.spawn);
        });
        const marker = new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m);
        sm = { marker, spawn: s, from: target, to: target, start: now, duration: WALK_MIN_MS, walking: false, facingLeft: false };
        spawnMarkers.current.set(s.id, sm);
        // Next frame, so the browser has painted opacity 0 and the transition runs.
        requestAnimationFrame(() => {
          el.style.opacity = "1";
        });
      } else if (sm.to.lat !== target.lat || sm.to.lng !== target.lng) {
        // It wandered: walk from wherever it is drawn now (possibly mid-walk) to the new spot.
        const here = positionAt(sm, now);
        const dLng = target.lng - here.lng;
        if (Math.abs(dLng) > 1e-7) sm.facingLeft = dLng < 0;
        sm.from = here;
        sm.to = target;
        if (animate) {
          const { delay, duration } = planWalk(here, target);
          sm.start = now + delay;
          sm.duration = duration;
          sm.walking = true;
          startWalk = true;
        } else {
          sm.start = now;
          sm.duration = WALK_MIN_MS;
          sm.walking = false;
          sm.marker.setLngLat([target.lng, target.lat]);
        }
      }
      sm.spawn = s;
      const el = sm.marker.getElement();
      const label = labelFor(s);
      const selected = s.id === selectedId;
      el.setAttribute("aria-label", `${label}${s.inBattle ? ", in battle" : ""}${s.inRange ? ", in range" : ""}`);
      const tag = el.querySelector<HTMLElement>("[data-role=tag]");
      const icon = el.querySelector<HTMLElement>("[data-role=icon]");
      const art = el.querySelector<HTMLElement>("[data-role=art]");
      if (tag) {
        tag.textContent = label;
        tag.className = [
          "whitespace-nowrap rounded border border-white/30 px-1.5 py-0.5 font-pixel text-[7px] shadow-md",
          selected ? "bg-field-gold text-ink" : s.inBattle ? "bg-terracotta text-paper" : s.inRange ? "bg-primary-forest text-paper" : "bg-moss text-paper",
        ].join(" ");
        // A spawn in a battle is frozen in place; say so on its tag.
        if (s.inBattle) tag.textContent = `${label} · In battle`;
      }
      if (icon) {
        icon.className = [
          "size-11 rounded-full border-2 bg-paper/90 p-0.5 shadow-md transition-transform",
          selected ? "scale-125 border-field-gold" : s.inRange ? "border-primary-forest" : "border-white",
        ].join(" ");
      }
      // Mirror the art itself (not the ring, which carries the selection scale) to face the walk;
      // a marker still waiting to set off keeps facing the way it went last (the walk loop turns it).
      if (art && !(sm.walking && performance.now() < sm.start)) art.style.transform = sm.facingLeft ? "scaleX(-1)" : "";
    }
    if (startWalk && walkFrame.current === null) walkFrame.current = requestAnimationFrame(walk);
  }, [spawns, selectedId, labelFor, walk]);

  // POI markers: they never move, so just add, update and remove.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const live = new Set(pois.map((p) => p.id));
    for (const [id, pm] of poiMarkers.current) {
      if (live.has(id)) continue;
      pm.marker.remove();
      poiMarkers.current.delete(id);
    }
    for (const p of pois) {
      let pm = poiMarkers.current.get(p.id);
      if (!pm) {
        const el = poiElement();
        const id = p.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const current = poiMarkers.current.get(id);
          if (current) onSelectPoiRef.current(current.poi);
        });
        pm = { marker: new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m), poi: p };
        poiMarkers.current.set(p.id, pm);
      }
      pm.poi = p;
      pm.marker.setLngLat([p.lng, p.lat]);
      const el = pm.marker.getElement();
      const selected = p.id === selectedPoiId;
      const station = isStation(p);
      el.setAttribute("aria-label", `${p.name}${station ? ", field station" : ""}${p.inRange ? ", in range" : ""}`);
      const sign = el.querySelector<HTMLElement>("[data-role=sign]");
      const tag = el.querySelector<HTMLElement>("[data-role=tag]");
      if (sign) {
        sign.textContent = station ? "+" : "▣";
        sign.className = [
          "flex size-7 items-center justify-center rounded-[3px] border-2 font-pixel text-[11px] shadow-md transition-transform",
          station ? "bg-paper text-terracotta" : "bg-field-gold text-deep-forest",
          selected ? "scale-125 border-field-gold" : p.inRange ? "border-primary-forest" : "border-deep-forest/60",
          p.pickedUpToday && !station ? "opacity-60" : "",
        ].join(" ");
      }
      if (tag) {
        tag.textContent = p.name;
        tag.className = "pointer-events-none max-w-28 truncate rounded bg-deep-forest/80 px-1 py-px font-pixel text-[6px] text-paper";
      }
    }
  }, [pois, selectedPoiId]);

  const recenter = () => {
    if (map.current && player) map.current.easeTo({ center: [player.lng, player.lat], zoom: 17 });
  };

  return (
    <div className="absolute inset-0">
      {/* maplibre-gl.css forces position:relative on the container, so size it explicitly. */}
      <div ref={container} className="h-full w-full" />
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <MapButton label="Zoom in" onClick={() => map.current?.zoomIn()}>
          +
        </MapButton>
        <MapButton label="Zoom out" onClick={() => map.current?.zoomOut()}>
          −
        </MapButton>
        <MapButton label="Recenter on you" onClick={recenter} active>
          ◎
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        "flex size-9 items-center justify-center rounded-md border-2 border-deep-forest font-pixel text-[12px] shadow-[2px_2px_0_rgb(24_63_54/0.5)] outline-none focus-visible:ring-2 focus-visible:ring-field-gold active:translate-y-px " +
        (active ? "bg-primary-forest text-paper" : "bg-paper text-deep-forest")
      }
    >
      {children}
    </button>
  );
}
