# @wildbound/web

The player-facing web app. For now it is a **learning space**: a small, working React + Vite + MapLibre project, bootstrapped so you can build on it yourself. It is intentionally minimal.

Later this app will host the Phaser 3 field, which draws a stylized top-down 2D world from the same world context the editor previews. Phaser is **not** set up yet (see the [root README](../../README.md#scope-and-roadmap)).

## What is here

```
apps/web/
  index.html          Vite entry
  vite.config.ts      Port 5174, Tailwind plugin, "@" alias, reads VITE_* from the repo-root .env
  tsconfig.json       Extends the shared strict base config, adds the "@/*" path
  components.json     shadcn CLI config (new-york style, neutral base, lucide icons)
  src/
    main.tsx          React root, QueryClientProvider and devtools
    App.tsx           Published-world summary card (shadcn) over the map
    MapView.tsx       The MapLibre setup: OSM raster basemap, zoom controls, scale bar
    api.ts            Typed, Zod-validated helpers for the API (fetchPublishedWorld, resolveCoordinate)
    queries.ts        TanStack Query hooks and query keys (usePublishedWorld, useWorldContext)
    styles.css        Tailwind import and the shadcn theme tokens (light and dark)
    lib/
      utils.ts        cn(): class merging helper used by every shadcn component
      query-client.ts The shared QueryClient and its defaults
    components/ui/    shadcn components (button, card, badge so far)
```

When it is running you should see an OpenStreetMap basemap centered on Metro Manila and a card with badges such as `v1`, `1 regions`, `3 habitats`, `7 POIs`. That summary proves the full pipeline works: editor, publish, API, this app.

## Tech stack

| Package | Why |
|---|---|
| `react`, `react-dom` 19 | UI |
| `vite` 7, `@vitejs/plugin-react` | Dev server and build |
| `maplibre-gl` 5 | The map (open source, no API key) |
| `@wildbound/shared` | Zod schemas and types for the API responses (workspace package) |
| `zod` | Needed by the shared schemas |
| `typescript` | Type checking (`pnpm typecheck`) |
| `tailwindcss` 4, `@tailwindcss/vite` | Styling. No `tailwind.config`; the theme lives in `src/styles.css` |
| shadcn (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`) | Component library. Components are copied into `src/components/ui` and are yours to edit |
| `@tanstack/react-query` 5 (+ devtools) | Server state: fetching, caching, loading and error states |

No router or client state library yet. Add them when a real need shows up.

### Adding shadcn components

```bash
cd apps/web
pnpm dlx shadcn@latest add dialog select tabs
```

`components.json` already points the CLI at `src/styles.css` and the `@/components/ui` alias.

### Adding data fetching

Put the raw call in `src/api.ts` (Zod-parsed), then wrap it in a hook in `src/queries.ts` with a key from `queryKeys`. Components use the hook and never call `fetch` directly.

## Run it

From the repo root, with the database and API running (see the [root Quick start](../../README.md#quick-start)):

```bash
pnpm db:seed --publish                 # puts a published sample world in the database
pnpm dev:api                           # API on :4000 (separate terminal)
pnpm dev:web                           # this app on :5174
```

Open http://localhost:5174. If the label says "Nothing published yet", publish from the editor or run `pnpm db:seed --publish`.

## Configuration

Read from the repo-root `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | API base URL |

The API allows this app's origin through `CORS_ORIGINS` (default includes `http://localhost:5174`). The editor token is **not** used here; every endpoint this app calls is public.

## The data this app reads

Two public endpoints, both already wrapped in `src/api.ts`:

- `GET /api/world/published` returns `{ version, publishedAt, world, creatures }`. `world` has `regions`, `habitats`, `pois` and `encounterTables`, all as GeoJSON geometry in `[lng, lat]` order.
- `GET /api/world/resolve?lat&lng` returns the WILDBOUND context for one coordinate: region, habitat, nearby POIs and available Wildkin. Optional `timeOfDay`, `weather` and `radius` let you simulate conditions.

The shapes are defined once in `packages/shared`, so TypeScript and Zod agree with the API.

## Learning path (suggested exercises)

Each step is small and builds on the last. Do them in `MapView.tsx` unless noted. UI pieces can use the shadcn components.

1. **Understand the setup.** Read `MapView.tsx`. Why is the map created in `useEffect` with a ref? What happens in StrictMode, and why does cleanup call `map.remove()`?
2. **Change the view.** Edit `center` and `zoom`. Add `maxBounds`. Try `pitch` and `bearing`.
3. **React to events.** Add `map.on("click", e => ...)` and log `e.lngLat`. Show the coordinate in the status label.
4. **Add a GeoJSON source and a layer.** Inside `map.on("load", ...)`, call `addSource` with a hard-coded polygon, then `addLayer` with a `fill` and a `line` layer. Learn the difference between a *source* (data) and a *layer* (styling).
5. **Draw the published world.** Pass the fetched `world` into `MapView` as a prop. Build GeoJSON `FeatureCollection`s from `regions` and `habitats` and add one source and layer per kind. Update with `source.setData(...)` when the prop changes instead of recreating the map.
6. **Style by data.** Use data-driven expressions, for example `["get", "name"]` or `["case", ...]`, to color habitats differently.
7. **Add markers or a circle layer for POIs.** Compare `maplibregl.Marker` (DOM, easy, fine for tens) with a `circle` layer (GPU, scales to thousands).
8. **Use the resolver.** On click, pass `{ lat, lng }` to the `useWorldContext` hook and render the region, habitat, Wildkin and nearby POIs in a panel. Handle the "outside every region" case, which is a normal empty response.
9. **Simulate conditions.** Add selects for time of day and weather and watch `availableWildkin` change without any code changes to the API.
10. **Fit the view to the data.** Compute the bounds of the published world and call `map.fitBounds`.
11. **Simulate a player.** Add a draggable marker that re-resolves on `dragend`. This is the shape the future live-GPS adapter will take.
12. **Prepare for Phaser.** Design a small hook such as `useWorldContext(position)` that returns a `WorldContext`. The Phaser field will consume exactly that, never raw map data.

Useful references: [MapLibre GL JS docs](https://maplibre.org/maplibre-gl-js/docs/), the [Style Specification](https://maplibre.org/maplibre-style-spec/), and the finished editor in `apps/editor/src/map/editor-map.ts` for a larger MapLibre example (drawing, vertex handles, markers).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev:web` | Dev server on http://localhost:5174 |
| `pnpm --filter @wildbound/web build` | Type check and production build into `dist/` |
| `pnpm --filter @wildbound/web preview` | Serve the production build |
| `pnpm --filter @wildbound/web typecheck` | Type check only |

## Ground rules for this app

- Do not create a second world model. Use the types from `@wildbound/shared`.
- Keep game rules out of React components. Rules live in `packages/world` and the API.
- Use simulated coordinates while developing. Live geolocation comes later as an adapter.
- The real map is geographic truth, not the game's final look.
