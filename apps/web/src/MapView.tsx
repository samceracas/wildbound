import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

/**
 * Minimal MapLibre setup: one raster basemap (OpenStreetMap, no API key),
 * zoom controls and a scale bar. Start here.
 *
 * Why a ref + useEffect: MapLibre owns a DOM node and its own render loop, so
 * we create it once after mount and destroy it on unmount. React never
 * re-renders the map itself.
 */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    const map = new maplibregl.Map({
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
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [121.03, 14.6], // [lng, lat]: Metro Manila
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    // React StrictMode runs effects twice in dev, so cleanup must fully tear down.
    return () => map.remove();
  }, []);

  return <div ref={container} className="map" />;
}
