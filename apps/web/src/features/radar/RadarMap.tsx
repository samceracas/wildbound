import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { GAME_RULES, type SpawnView } from "@wildbound/shared";
import { PLAYER_HEAD, wildkinIcon } from "@/lib/assets.ts";

interface Props {
  player: { lat: number; lng: number } | null;
  spawns: SpawnView[];
  selectedId: string | null;
  onSelect: (spawn: SpawnView) => void;
  /** Text on the tag above a marker (the name once observed, else the registry number). */
  labelFor: (spawn: SpawnView) => string;
}

const RANGE_SOURCE = "interact-range";

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
function spawnElement(src: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "flex flex-col items-center gap-1 outline-none";
  const tag = document.createElement("span");
  tag.dataset.role = "tag";
  const icon = markerElement(src, "");
  icon.dataset.role = "icon";
  icon.tabIndex = -1;
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
  const spawnMarkers = useRef(new Map<string, maplibregl.Marker>());
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

  // Spawn markers: add new, move existing, remove gone.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const live = new Set(spawns.map((s) => s.id));
    for (const [id, marker] of spawnMarkers.current) {
      if (!live.has(id)) {
        marker.remove();
        spawnMarkers.current.delete(id);
      }
    }
    for (const s of spawns) {
      let marker = spawnMarkers.current.get(s.id);
      if (!marker) {
        const el = spawnElement(wildkinIcon(s.creatureId));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(s);
        });
        marker = new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m);
        spawnMarkers.current.set(s.id, marker);
      }
      const el = marker.getElement();
      const label = labelFor(s);
      const selected = s.id === selectedId;
      el.setAttribute("aria-label", `${label}${s.inRange ? ", in range" : ""}`);
      const tag = el.querySelector<HTMLElement>("[data-role=tag]");
      const icon = el.querySelector<HTMLElement>("[data-role=icon]");
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
    }
  }, [spawns, selectedId, labelFor]);

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
