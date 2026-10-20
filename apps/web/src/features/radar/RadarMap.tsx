import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef } from "react";
import { GAME_RULES, type SpawnView } from "@wildbound/shared";
import { PLAYER_HEAD, wildkinArtFallback, wildkinIcon } from "@/lib/assets.ts";

interface Props {
  player: { lat: number; lng: number } | null;
  spawns: SpawnView[];
  selectedId: string | null;
  onSelect: (spawn: SpawnView) => void;
  /** Text on the tag above a marker (the name once observed, else the registry number). */
  labelFor: (spawn: SpawnView) => string;
}

const RANGE_SOURCE = "interact-range";
/** How long a marker takes to walk to a spawn's new position (polls are 10 s apart). */
const WALK_MS = 2200;
/** Fade in/out time for spawns that appear or wander off. */
const FADE_MS = 350;

type LngLat = { lat: number; lng: number };

/** One spawn marker plus its walk animation state. */
interface SpawnMarker {
  marker: maplibregl.Marker;
  /** Latest server data for this spawn (the click handler reads it). */
  spawn: SpawnView;
  /** Where the walk started, where it ends, and when it started (performance.now()). */
  from: LngLat;
  to: LngLat;
  start: number;
  /** Still has frames to draw (the rAF loop parks it at `to` when done). */
  walking: boolean;
  /** Icon mirrored (walking left; the art faces right). */
  facingLeft: boolean;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Where a marker is drawn at time `now`. */
function positionAt(sm: SpawnMarker, now: number): LngLat {
  const t = Math.min(1, Math.max(0, (now - sm.start) / WALK_MS));
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
export function RadarMap({ player, spawns, selectedId, onSelect, labelFor }: Props) {
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
      const p = positionAt(sm, now);
      sm.marker.setLngLat([p.lng, p.lat]);
      if (now - sm.start < WALK_MS) moving = true;
      else sm.walking = false; // drawn exactly at `to`
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
        sm = { marker, spawn: s, from: target, to: target, start: now - WALK_MS, walking: false, facingLeft: false };
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
          sm.start = now;
          sm.walking = true;
          startWalk = true;
        } else {
          sm.start = now - WALK_MS;
          sm.walking = false;
          sm.marker.setLngLat([target.lng, target.lat]);
        }
      }
      sm.spawn = s;
      const el = sm.marker.getElement();
      const label = labelFor(s);
      const selected = s.id === selectedId;
      el.setAttribute("aria-label", `${label}${s.inRange ? ", in range" : ""}`);
      const tag = el.querySelector<HTMLElement>("[data-role=tag]");
      const icon = el.querySelector<HTMLElement>("[data-role=icon]");
      const art = el.querySelector<HTMLElement>("[data-role=art]");
      if (tag) {
        tag.textContent = label;
        tag.className = [
          "whitespace-nowrap rounded border border-white/30 px-1.5 py-0.5 font-pixel text-[7px] shadow-md",
          selected ? "bg-field-gold text-ink" : s.inRange ? "bg-primary-forest text-paper" : "bg-moss text-paper",
        ].join(" ");
      }
      if (icon) {
        icon.className = [
          "size-11 rounded-full border-2 bg-paper/90 p-0.5 shadow-md transition-transform",
          selected ? "scale-125 border-field-gold" : s.inRange ? "border-primary-forest" : "border-white",
        ].join(" ");
      }
      // Mirror the art itself (not the ring, which carries the selection scale) to face the walk.
      if (art) art.style.transform = sm.facingLeft ? "scaleX(-1)" : "";
    }
    if (startWalk && walkFrame.current === null) walkFrame.current = requestAnimationFrame(walk);
  }, [spawns, selectedId, labelFor, walk]);

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
