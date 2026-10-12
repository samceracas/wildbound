import type { StyleSpecification } from "maplibre-gl";
import type { Basemap } from "../store.ts";

const raster = (tiles: string, attribution: string, maxzoom = 19): StyleSpecification => ({
  version: 8,
  sources: { base: { type: "raster", tiles: [tiles], tileSize: 256, attribution, maxzoom } },
  layers: [{ id: "base", type: "raster", source: "base" }],
});

/** Key-free base maps. These show geographic truth only; they are never the game map. */
export const BASEMAPS: Record<Basemap, { label: string; style: string | StyleSpecification }> = {
  streets: {
    label: "Streets",
    style: (import.meta.env.VITE_MAP_STYLE as string | undefined) ?? "https://tiles.openfreemap.org/styles/liberty",
  },
  osm: {
    label: "OSM",
    style: raster(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    ),
  },
  satellite: {
    label: "Satellite",
    style: raster(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      "Imagery © Esri, Maxar, Earthstar Geographics",
    ),
  },
};

/** Initial view when the world is empty: Metro Manila (NCR). Not world data. */
export const DEFAULT_VIEW = { center: [121.03, 14.6] as [number, number], zoom: 11 };
