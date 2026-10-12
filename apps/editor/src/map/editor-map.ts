import * as turf from "@turf/turf";
import maplibregl, { type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import type { AreaGeometry, Point, Position, WorldDocument } from "@wildbound/shared";
import { bboxOf, centroidOf } from "@wildbound/world";
import { useEditor } from "../store.ts";
import {
  createHabitat,
  createPoi,
  createRegion,
  editableRings,
  insertVertex,
  isSelfIntersecting,
  moveVertex,
  polygonFromVertices,
  regionAt,
  removeVertex,
  setGeometry,
  updatePoi,
  type Selection,
  type VertexRef,
} from "../world-edit.ts";
import { BASEMAPS, DEFAULT_VIEW } from "./basemaps.ts";

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features });

const COLORS = {
  region: "#f2b134",
  regionInactive: "#9aa0a6",
  habitat: "#35c47a",
  selected: "#ffffff",
  drawing: "#4cc3ff",
  player: "#ff5c8a",
};

const POI_ICONS: Record<string, string> = {
  gate: "⛩",
  trail: "🥾",
  landmark: "★",
  clearing: "☀",
  hollow: "◎",
  water: "💧",
  "research-station": "⚑",
  other: "•",
};

const SNAP_PX = 12;
const NUDGE_DEG = 0.00005; // ≈ 5.5 m at the equator

/**
 * Imperative MapLibre controller. Subscribes to the editor store directly so
 * map interactions never fight React render cycles. Owns: base map, world
 * layers, drawing, vertex handles, POI markers and the simulated player.
 */
export class EditorMap {
  readonly map: maplibregl.Map;
  private unsubscribe: () => void;
  private drawing: Position[] = [];
  private cursor: Position | null = null;
  private dragging = false;
  private handles: maplibregl.Marker[] = [];
  private poiMarkers = new Map<string, maplibregl.Marker>();
  private labels: maplibregl.Marker[] = [];
  private player: maplibregl.Marker | null = null;
  private hasFramedWorld = false;
  private resolveTimer: ReturnType<typeof setTimeout> | undefined;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    const s = useEditor.getState();
    this.map = new maplibregl.Map({
      container,
      style: BASEMAPS[s.basemap].style,
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    this.map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    this.map.on("style.load", () => {
      this.addLayers();
      this.syncSources();
    });
    this.map.on("click", (e) => this.onClick(e));
    this.map.on("dblclick", (e) => this.onDoubleClick(e));
    this.map.on("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("keydown", this.onKeyDown);

    this.unsubscribe = useEditor.subscribe((state, prev) => this.onStoreChange(state, prev));
    // Side panels open/close; keep the canvas sized to its container.
    this.resizeObserver = new ResizeObserver(() => this.map.resize());
    this.resizeObserver.observe(container);
    this.applyTool();
  }

  destroy() {
    this.unsubscribe();
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    clearTimeout(this.resolveTimer);
    this.map.remove();
  }

  // ---------------------------------------------------------------- store sync

  private onStoreChange(state: ReturnType<typeof useEditor.getState>, prev: ReturnType<typeof useEditor.getState>) {
    if (state.basemap !== prev.basemap) this.map.setStyle(BASEMAPS[state.basemap].style);
    if (state.tool !== prev.tool) this.applyTool();

    const worldChanged = state.world !== prev.world;
    const selectionChanged = state.selection !== prev.selection;
    if (worldChanged) {
      this.syncSources();
      this.syncLabels();
    }
    if (worldChanged || selectionChanged || state.tool !== prev.tool) {
      this.syncPoiMarkers();
      if (!this.dragging) this.syncHandles();
    }
    if (selectionChanged) this.syncSelectionFilters();
    if (state.preview.point !== prev.preview.point || state.preview.radius !== prev.preview.radius) this.syncPlayer();
    if (state.focusRequest !== prev.focusRequest && state.focusRequest) this.focus(state.focusRequest.selection);
    if (state.loaded && !prev.loaded && !this.hasFramedWorld) {
      this.hasFramedWorld = true;
      this.focus(null);
    }
  }

  private get state() {
    return useEditor.getState();
  }

  // ---------------------------------------------------------------- layers

  private addLayers() {
    const m = this.map;
    const empty = fc([]);
    for (const id of ["regions", "habitats", "drawing", "player-radius"]) {
      if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });
    }
    const add = (layer: maplibregl.LayerSpecification) => {
      if (!m.getLayer(layer.id)) m.addLayer(layer);
    };
    add({
      id: "region-fill",
      type: "fill",
      source: "regions",
      paint: {
        "fill-color": ["case", ["get", "active"], COLORS.region, COLORS.regionInactive],
        "fill-opacity": 0.08,
      },
    });
    add({
      id: "region-line",
      type: "line",
      source: "regions",
      paint: {
        "line-color": ["case", ["get", "active"], COLORS.region, COLORS.regionInactive],
        "line-width": 2.5,
        "line-dasharray": [3, 1.5],
      },
    });
    add({
      id: "habitat-fill",
      type: "fill",
      source: "habitats",
      paint: { "fill-color": COLORS.habitat, "fill-opacity": 0.22 },
    });
    add({
      id: "habitat-line",
      type: "line",
      source: "habitats",
      paint: { "line-color": COLORS.habitat, "line-width": 1.5 },
    });
    add({
      id: "region-selected",
      type: "line",
      source: "regions",
      filter: ["==", ["get", "id"], ""],
      paint: { "line-color": COLORS.selected, "line-width": 4 },
    });
    add({
      id: "habitat-selected-fill",
      type: "fill",
      source: "habitats",
      filter: ["==", ["get", "id"], ""],
      paint: { "fill-color": COLORS.habitat, "fill-opacity": 0.35 },
    });
    add({
      id: "habitat-selected",
      type: "line",
      source: "habitats",
      filter: ["==", ["get", "id"], ""],
      paint: { "line-color": COLORS.selected, "line-width": 3 },
    });
    add({
      id: "player-radius-fill",
      type: "fill",
      source: "player-radius",
      paint: { "fill-color": COLORS.player, "fill-opacity": 0.06 },
    });
    add({
      id: "player-radius-line",
      type: "line",
      source: "player-radius",
      paint: { "line-color": COLORS.player, "line-width": 1, "line-dasharray": [2, 2] },
    });
    add({
      id: "drawing-fill",
      type: "fill",
      source: "drawing",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": COLORS.drawing, "fill-opacity": 0.15 },
    });
    add({
      id: "drawing-line",
      type: "line",
      source: "drawing",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": COLORS.drawing, "line-width": 2, "line-dasharray": [2, 1] },
    });
    add({
      id: "drawing-vertex",
      type: "circle",
      source: "drawing",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["case", ["get", "first"], 6, 4],
        "circle-color": "#ffffff",
        "circle-stroke-color": COLORS.drawing,
        "circle-stroke-width": 2,
      },
    });
    this.syncSelectionFilters();
    this.syncDrawing();
    this.syncPlayer();
  }

  private setData(id: string, data: FC) {
    (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  private syncSources() {
    const { world } = this.state;
    this.setData(
      "regions",
      fc(world.regions.map((r) => ({ type: "Feature", geometry: r.geometry, properties: { id: r.id, active: r.active } }))),
    );
    this.setData(
      "habitats",
      fc(world.habitats.map((h) => ({ type: "Feature", geometry: h.geometry, properties: { id: h.id } }))),
    );
  }

  private syncSelectionFilters() {
    if (!this.map.getLayer("region-selected")) return;
    const sel = this.state.selection;
    const regionId = sel?.kind === "region" ? sel.id : "";
    const habitatId = sel?.kind === "habitat" ? sel.id : "";
    this.map.setFilter("region-selected", ["==", ["get", "id"], regionId]);
    this.map.setFilter("habitat-selected", ["==", ["get", "id"], habitatId]);
    this.map.setFilter("habitat-selected-fill", ["==", ["get", "id"], habitatId]);
  }

  private syncLabels() {
    for (const l of this.labels) l.remove();
    const { world } = this.state;
    const label = (text: string, at: Position, cls: string) => {
      const el = document.createElement("div");
      el.className = `wb-label ${cls}`;
      el.textContent = text;
      return new maplibregl.Marker({ element: el }).setLngLat(at as [number, number]).addTo(this.map);
    };
    this.labels = [
      ...world.habitats.map((h) => label(h.name, centroidOf(h.geometry), "habitat")),
      ...world.regions.map((r) => {
        // Label the region at its northern edge so it doesn't collide with habitat labels.
        const b = bboxOf([r.geometry])!;
        return label(r.name, [(b[0] + b[2]) / 2, b[3]], "region");
      }),
    ];
  }

  // ---------------------------------------------------------------- tools

  private applyTool() {
    const { tool } = this.state;
    this.drawing = [];
    this.cursor = null;
    this.syncDrawing();
    const drawingTool = tool === "draw-region" || tool === "draw-habitat";
    if (drawingTool) this.map.doubleClickZoom.disable();
    else this.map.doubleClickZoom.enable();
    this.map.getCanvas().style.cursor = tool === "select" ? "" : "crosshair";
  }

  private isMarkerEvent(e: MapMouseEvent) {
    return (e.originalEvent.target as HTMLElement | null)?.closest?.(".wb-marker") != null;
  }

  private onClick(e: MapMouseEvent) {
    if (this.isMarkerEvent(e)) return;
    const pos: Position = [e.lngLat.lng, e.lngLat.lat];
    const s = this.state;
    switch (s.tool) {
      case "select":
        return this.selectAt(e);
      case "draw-region":
      case "draw-habitat": {
        const first = this.drawing[0];
        if (first && this.drawing.length >= 3 && this.pixelDistance(first, e.point) < SNAP_PX) return this.finishDrawing();
        this.drawing.push(pos);
        return this.syncDrawing();
      }
      case "place-poi": {
        const region = regionAt(s.world, pos) ?? this.selectedRegion();
        if (!region) return s.notify("error", "Place POIs inside a region (draw a region first).");
        const { world, poi } = createPoi(s.world, region.id, pos);
        s.commit(world, { kind: "poi", id: poi.id });
        return s.notify("info", `Placed "${poi.name}" in ${region.name}. Click again to place another.`);
      }
      case "preview":
        s.setPreview({ point: pos });
        return void s.resolvePreview();
    }
  }

  private onDoubleClick(e: MapMouseEvent) {
    const tool = this.state.tool;
    if (tool === "draw-region" || tool === "draw-habitat") {
      e.preventDefault();
      this.finishDrawing();
    }
  }

  private onMouseMove(e: MapMouseEvent) {
    const tool = this.state.tool;
    if ((tool === "draw-region" || tool === "draw-habitat") && this.drawing.length > 0) {
      this.cursor = [e.lngLat.lng, e.lngLat.lat];
      this.syncDrawing();
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    const s = this.state;
    if (s.tool === "draw-region" || s.tool === "draw-habitat") {
      if (e.key === "Enter") {
        e.preventDefault();
        this.finishDrawing();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (this.drawing.length) {
          this.drawing = [];
          this.syncDrawing();
        } else s.setTool("select");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        this.drawing.pop();
        this.syncDrawing();
      }
      return;
    }
    if (s.tool === "preview" && s.preview.point && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = NUDGE_DEG * (e.shiftKey ? 5 : 1);
      const [lng, lat] = s.preview.point;
      const next: Position =
        e.key === "ArrowUp"
          ? [lng, lat + step]
          : e.key === "ArrowDown"
            ? [lng, lat - step]
            : e.key === "ArrowLeft"
              ? [lng - step, lat]
              : [lng + step, lat];
      s.setPreview({ point: next });
      clearTimeout(this.resolveTimer);
      this.resolveTimer = setTimeout(() => void this.state.resolvePreview(), 120);
    }
  };

  private selectAt(e: MapMouseEvent) {
    const s = this.state;
    const hits = this.map.queryRenderedFeatures(e.point, { layers: ["habitat-fill", "region-fill"] });
    const area = (g: AreaGeometry) => turf.area(g);
    const habitats = hits
      .filter((f) => f.layer.id === "habitat-fill")
      .map((f) => s.world.habitats.find((h) => h.id === f.properties?.id))
      .filter((h) => h !== undefined)
      .sort((a, b) => area(a.geometry) - area(b.geometry));
    const regions = hits
      .filter((f) => f.layer.id === "region-fill")
      .map((f) => s.world.regions.find((r) => r.id === f.properties?.id))
      .filter((r) => r !== undefined)
      .sort((a, b) => area(a.geometry) - area(b.geometry));

    // Click order: smallest habitat → (click again) its region.
    const candidates: Selection[] = [
      ...habitats.map((h) => ({ kind: "habitat" as const, id: h.id })),
      ...regions.map((r) => ({ kind: "region" as const, id: r.id })),
    ];
    if (candidates.length === 0) return s.select(null);
    const currentIndex = candidates.findIndex((c) => c.kind === s.selection?.kind && c.id === s.selection?.id);
    s.select(candidates[(currentIndex + 1) % candidates.length] ?? null);
  }

  private selectedRegion() {
    const { selection, world } = this.state;
    if (!selection) return undefined;
    if (selection.kind === "region") return world.regions.find((r) => r.id === selection.id);
    const owner =
      selection.kind === "habitat"
        ? world.habitats.find((h) => h.id === selection.id)
        : selection.kind === "poi"
          ? world.pois.find((p) => p.id === selection.id)
          : world.encounterTables.find((t) => t.id === selection.id);
    return owner ? world.regions.find((r) => r.id === owner.regionId) : undefined;
  }

  private pixelDistance(a: Position, p: { x: number; y: number }) {
    const q = this.map.project(a as [number, number]);
    return Math.hypot(q.x - p.x, q.y - p.y);
  }

  // ---------------------------------------------------------------- drawing

  private syncDrawing() {
    const pts = this.cursor ? [...this.drawing, this.cursor] : this.drawing;
    const features: GeoJSON.Feature[] = this.drawing.map((p, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p },
      properties: { first: i === 0 },
    }));
    if (pts.length >= 2) {
      features.push({ type: "Feature", geometry: { type: "LineString", coordinates: [...pts, ...(pts.length >= 3 ? [pts[0]!] : [])] }, properties: {} });
    }
    if (pts.length >= 3) {
      features.push({ type: "Feature", geometry: polygonFromVertices(pts), properties: {} });
    }
    this.setData("drawing", fc(features));
  }

  private finishDrawing() {
    const s = this.state;
    // Double-click adds near-duplicate vertices; collapse anything within a few pixels.
    const vertices = this.drawing.filter((p, i, all) => i === 0 || this.pixelDistance(all[i - 1]!, this.map.project(p as [number, number])) > 4);
    if (vertices.length < 3) {
      s.notify("error", "A boundary needs at least 3 points.");
      return;
    }
    if (isSelfIntersecting(vertices)) {
      s.notify("error", "That boundary crosses itself. Press Backspace to remove points, or Esc to restart.");
      return;
    }
    const polygon = polygonFromVertices(vertices);
    if (s.tool === "draw-region") {
      const { world, region } = createRegion(s.world, polygon);
      s.commit(world, { kind: "region", id: region.id });
      s.notify("success", `Created "${region.name}". Rename it in the inspector.`);
    } else {
      const parent = regionAt(s.world, centroidOf(polygon)) ?? this.selectedRegion() ?? s.world.regions[0];
      if (!parent) {
        s.notify("error", "Draw a region before adding habitats.");
        return;
      }
      const { world, habitat } = createHabitat(s.world, parent.id, polygon);
      s.commit(world, { kind: "habitat", id: habitat.id });
      s.notify("success", `Created "${habitat.name}" in ${parent.name}.`);
    }
    this.drawing = [];
    this.cursor = null;
    s.setTool("select");
  }

  // ---------------------------------------------------------------- vertex handles

  private selectedGeometry(): AreaGeometry | null {
    const { selection, world } = this.state;
    if (selection?.kind === "region") return world.regions.find((r) => r.id === selection.id)?.geometry ?? null;
    if (selection?.kind === "habitat") return world.habitats.find((h) => h.id === selection.id)?.geometry ?? null;
    return null;
  }

  private syncHandles() {
    for (const h of this.handles) h.remove();
    this.handles = [];
    const s = this.state;
    const geometry = this.selectedGeometry();
    if (s.tool !== "select" || !geometry || !s.selection) return;
    const selection = s.selection;

    editableRings(geometry).forEach((rings, part) =>
      rings.forEach((ring, ringIndex) =>
        ring.forEach((vertex, index) => {
          const ref: VertexRef = { part, ring: ringIndex, index };
          this.handles.push(this.vertexHandle(selection, vertex, ref, ring.length));
          const next = ring[(index + 1) % ring.length]!;
          this.handles.push(this.midpointHandle(selection, [(vertex[0] + next[0]) / 2, (vertex[1] + next[1]) / 2], ref));
        }),
      ),
    );
  }

  private currentGeometry(world: WorldDocument, sel: Selection): AreaGeometry | null {
    if (sel.kind === "region") return world.regions.find((r) => r.id === sel.id)?.geometry ?? null;
    if (sel.kind === "habitat") return world.habitats.find((h) => h.id === sel.id)?.geometry ?? null;
    return null;
  }

  private vertexHandle(sel: Selection, at: Position, ref: VertexRef, ringSize: number) {
    const el = document.createElement("div");
    el.className = "wb-marker wb-vertex";
    el.title = ringSize > 3 ? "Drag to move · right-click to delete" : "Drag to move";
    const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(at as [number, number]).addTo(this.map);
    marker.on("dragstart", () => {
      this.dragging = true;
      this.state.beginTransient();
    });
    marker.on("drag", () => {
      const { lng, lat } = marker.getLngLat();
      const s = this.state;
      const base = s.transientBase ?? s.world;
      const geom = this.currentGeometry(base, sel);
      if (geom) s.transient(setGeometry(base, sel, moveVertex(geom, ref, [lng, lat])));
    });
    marker.on("dragend", () => this.endDrag());
    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const s = this.state;
      const geom = this.currentGeometry(s.world, sel);
      if (!geom) return;
      if (ringSize <= 3) return s.notify("error", "A boundary needs at least 3 vertices.");
      s.commit(setGeometry(s.world, sel, removeVertex(geom, ref)));
    });
    return marker;
  }

  private midpointHandle(sel: Selection, at: Position, ref: VertexRef) {
    const el = document.createElement("div");
    el.className = "wb-marker wb-midpoint";
    el.title = "Drag to add a vertex";
    const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(at as [number, number]).addTo(this.map);
    let inserted: AreaGeometry | null = null;
    marker.on("dragstart", () => {
      this.dragging = true;
      const s = this.state;
      s.beginTransient();
      const geom = this.currentGeometry(s.world, sel);
      inserted = geom ? insertVertex(geom, ref, at) : null;
    });
    marker.on("drag", () => {
      if (!inserted) return;
      const { lng, lat } = marker.getLngLat();
      const s = this.state;
      const base = s.transientBase ?? s.world;
      s.transient(setGeometry(base, sel, moveVertex(inserted, { ...ref, index: ref.index + 1 }, [lng, lat])));
    });
    marker.on("dragend", () => this.endDrag());
    return marker;
  }

  private endDrag() {
    this.dragging = false;
    const s = this.state;
    const geom = s.selection ? this.currentGeometry(s.world, s.selection) : null;
    if (geom) {
      const selfIntersecting = editableRings(geom).some((rings) => rings.some((r) => isSelfIntersecting(r)));
      if (selfIntersecting) s.notify("error", "Boundary now crosses itself. Undo (Ctrl+Z) or fix the vertices before saving.");
    }
    s.endTransient();
    this.syncHandles();
  }

  // ---------------------------------------------------------------- POIs

  private syncPoiMarkers() {
    const s = this.state;
    const seen = new Set<string>();
    for (const poi of s.world.pois) {
      seen.add(poi.id);
      let marker = this.poiMarkers.get(poi.id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "wb-marker wb-poi";
        el.innerHTML = `<span class="wb-poi-icon"></span><span class="wb-poi-label"></span>`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (this.state.tool === "select" || this.state.tool === "place-poi") this.state.select({ kind: "poi", id: poi.id });
        });
        marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(poi.location.coordinates as [number, number]).addTo(this.map);
        marker.on("dragend", () => {
          const { lng, lat } = marker!.getLngLat();
          const st = this.state;
          const location: Point = { type: "Point", coordinates: [lng, lat] };
          st.commit(updatePoi(st.world, poi.id, { location }));
        });
        this.poiMarkers.set(poi.id, marker);
      }
      const el = marker.getElement();
      el.querySelector(".wb-poi-icon")!.textContent = POI_ICONS[poi.type] ?? "•";
      el.querySelector(".wb-poi-label")!.textContent = poi.name;
      const selected = s.selection?.kind === "poi" && s.selection.id === poi.id;
      el.classList.toggle("selected", selected);
      el.title = `${poi.name} (${poi.type})${selected ? " · drag to move" : ""}`;
      marker.setDraggable(selected && s.tool === "select");
      const [lng, lat] = poi.location.coordinates;
      const cur = marker.getLngLat();
      if (cur.lng !== lng || cur.lat !== lat) marker.setLngLat([lng, lat]);
    }
    for (const [id, marker] of this.poiMarkers) {
      if (!seen.has(id)) {
        marker.remove();
        this.poiMarkers.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- player / preview

  private syncPlayer() {
    const { point, radius } = this.state.preview;
    if (!point) {
      this.player?.remove();
      this.player = null;
      this.setData("player-radius", fc([]));
      return;
    }
    if (!this.player) {
      const el = document.createElement("div");
      el.className = "wb-marker wb-player";
      el.title = "Simulated player · drag to move (arrow keys in Test mode)";
      this.player = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(point as [number, number]).addTo(this.map);
      this.player.on("dragend", () => {
        const { lng, lat } = this.player!.getLngLat();
        this.state.setPreview({ point: [lng, lat] });
        void this.state.resolvePreview();
      });
    } else {
      this.player.setLngLat(point as [number, number]);
    }
    this.setData("player-radius", fc([turf.circle(point, radius / 1000, { steps: 64, units: "kilometers" })]));
  }

  // ---------------------------------------------------------------- camera

  private focus(selection: Selection | null) {
    const { world } = this.state;
    let geoms: (AreaGeometry | Point)[];
    if (!selection) {
      geoms = [...world.regions.map((r) => r.geometry), ...world.pois.map((p) => p.location)];
    } else if (selection.kind === "poi") {
      const poi = world.pois.find((p) => p.id === selection.id);
      if (poi) this.map.easeTo({ center: poi.location.coordinates as [number, number], zoom: Math.max(this.map.getZoom(), 17) });
      return;
    } else if (selection.kind === "encounterTable") {
      const t = world.encounterTables.find((x) => x.id === selection.id);
      const g = t?.habitatId
        ? world.habitats.find((h) => h.id === t.habitatId)?.geometry
        : world.regions.find((r) => r.id === t?.regionId)?.geometry;
      geoms = g ? [g] : [];
    } else {
      const g = this.currentGeometry(world, selection);
      geoms = g ? [g] : [];
    }
    const b = bboxOf(geoms);
    if (b) this.map.fitBounds(b, { padding: 80, maxZoom: 18, duration: 600 });
  }
}
