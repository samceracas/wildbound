import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { GAME_RULES, type SpawnView } from "@wildbound/shared";
import { PLAYER_HEAD, wildkinIcon } from "@/lib/assets.ts";

interface Props {
  player: { lat: number; lng: number } | null;
  spawns: SpawnView[];
  selectedId: string | null;
  onSelect: (spawn: SpawnView) => void;
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

/**
 * The radar. MapLibre is imperative, so the map is created once and markers are
 * synced in effects (React never re-renders the map itself).
 */
export function RadarMap({ player, spawns, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const playerMarker = useRef<maplibregl.Marker | null>(null);
  const spawnMarkers = useRef(new Map<string, maplibregl.Marker>());
  const centered = useRef(false);
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
          { id: "paper", type: "background", paint: { "background-color": "#F6F0E3" } },
          // Muted basemap so the pixel art reads first.
          { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.55, "raster-opacity": 0.85 } },
        ],
      },
      center: [121.04, 14.65],
      zoom: 17,
      maxZoom: 19,
      minZoom: 14,
      attributionControl: { compact: true },
    });
    m.on("load", () => {
      m.addSource(RANGE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "range-fill", type: "fill", source: RANGE_SOURCE, paint: { "fill-color": "#1F6B57", "fill-opacity": 0.08 } });
      m.addLayer({
        id: "range-line",
        type: "line",
        source: RANGE_SOURCE,
        paint: { "line-color": "#1F6B57", "line-width": 1.5, "line-dasharray": [2, 2] },
      });
    });
    map.current = m;
    return () => {
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
    const ring = () => (m.getSource(RANGE_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(circle(player, GAME_RULES.interactRadiusM));
    if (m.isStyleLoaded()) ring();
    else m.once("load", ring);
    if (!centered.current) {
      m.jumpTo({ center: [player.lng, player.lat] });
      centered.current = true;
    }
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
        const el = markerElement(wildkinIcon(s.creatureId), "");
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(s);
        });
        marker = new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m);
        spawnMarkers.current.set(s.id, marker);
      }
      const el = marker.getElement();
      el.setAttribute("aria-label", `Wildkin No. ${s.registryNumber}${s.inRange ? ", in range" : ""}`);
      el.className = [
        "size-12 rounded-full border-2 bg-paper/90 p-0.5 transition-transform",
        s.id === selectedId ? "scale-125 border-field-gold" : s.inRange ? "border-primary-forest" : "border-muted-paper",
      ].join(" ");
    }
  }, [spawns, selectedId]);

  const recenter = () => {
    if (map.current && player) map.current.easeTo({ center: [player.lng, player.lat], zoom: 17 });
  };

  return (
    <div className="absolute inset-0">
      {/* maplibre-gl.css forces position:relative on the container, so size it explicitly. */}
      <div ref={container} className="h-full w-full" />
      <button
        type="button"
        onClick={recenter}
        className="absolute top-3 right-3 z-10 rounded-md border border-muted-paper bg-paper px-3 py-2 text-label-lg text-primary-forest shadow-card"
      >
        Recenter
      </button>
    </div>
  );
}
