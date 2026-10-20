# @wildbound/editor

> Detailed documentation: [docs/05-map-editor.md](../../docs/05-map-editor.md).

The WILDBOUND **Map Editor**: an internal developer tool for authoring the world on top of real geography. It is a small game-world authoring tool with geographic capabilities, not a GIS application.

## What it does

- Draw, reshape and delete **regions** and **habitats** (polygons) on a MapLibre map.
- Place and move **points of interest**.
- Author **encounter tables**: pick Wildkin, set weights, and add time-of-day and weather conditions.
- **Save draft**, **Validate**, and **Publish**.
- **Test mode**: drop a simulated player and see the exact context the API resolves (`/api/editor/resolve`, token required), for the draft or the published world, under any time of day and weather. Players cannot do this: the game only resolves their server-tracked position. The Available Wildkin list also runs the result through `applySpawnModifiers` from `@wildbound/world` (exercise #2), so it shows the odds after species spawn modifiers; until that exercise is done it shows raw weights and a hint.
- The encounter-table inspector shows each Wildkin's species spawn modifiers (e.g. `rain ×0.5 · night ×0.1`).

## Tech

Same stack as `apps/web` where it overlaps:

- React 19, Vite 7, TypeScript, **Tailwind CSS 4** (`@tailwindcss/vite`, design tokens in `@theme` in `src/styles.css`, `@` alias to `src/`, shadcn `components.json` ready for `npx shadcn add`)
- **TanStack Query 5** for server state: the saved draft, creatures, publish status, validation report and Test-mode resolve results
- **Zustand 5** for local editing state only: the world being edited, selection, tool, undo/redo history, UI flags
- **react-hook-form 7 + zodResolver** for the inspectors, validated with the `@wildbound/shared` schemas
- MapLibre GL JS 5, Turf.js 7 (client-side geometry helpers), `@wildbound/world` (the same validation, condition and spawning rules as the server)

## Layout

```
src/
  main.tsx, App.tsx        Entry (QueryClientProvider), layout, first load and keyboard shortcuts
  store.ts                 Zustand store: edited world, selection, tool, history, Test-panel inputs, toasts
  lib/
    api.ts                 Typed API client (Zod-validated responses, bearer token)
    queries.ts             Query keys, queries (world, report, resolve) and mutations (save, validate, publish) with invalidation
    query-client.ts        QueryClient; central error handling (401 opens the token dialog, toasts)
    spawn-preview.ts       Pure helpers: format spawn modifiers, preview odds through applySpawnModifiers
    utils.ts               cn() (clsx + tailwind-merge, aware of the custom tokens)
  world-edit.ts            Pure, immutable edit operations (create, update, cascade delete, vertex edits)
  world-edit.test.ts       Unit tests for those operations
  map/
    editor-map.ts          Imperative MapLibre controller: layers, drawing, vertex handles, POIs, player
    basemaps.ts            Key-free basemaps
    MapView.tsx            Mounts the controller
  components/
    ui.tsx                 Button, Input, Select, Textarea, Tag, Pill, Bar (Tailwind primitives)
    fields.tsx             react-hook-form fields (TextField, SlugField, SelectField, TagsField, ConditionsField, ...)
    legacy-fields.tsx      Old controlled inputs, used only by PoiInspector until exercise #9 is done
    Toolbar, Sidebar, PreviewPanel, IssuesPanel, Overlays
  inspectors/              Region, Habitat, POI and EncounterTable inspectors
  styles.css               Tailwind import, @theme tokens, styles for the map's imperative DOM markers
```

Design notes:

- **The map is imperative, the UI is React.** `editor-map.ts` subscribes to the store directly so map interactions never fight React render cycles.
- **Edits are pure functions** in `world-edit.ts`, so they are unit-testable and every edit is one undo step. Dragging a vertex is a single undo step through `beginTransient`/`endTransient`.
- **No world data in components.** Everything shown comes from the API.
- **Server state vs editing state.** The first successful `GET /api/editor/world` fills the Zustand store; after that the store owns the edited world. Save and Publish invalidate the world and resolve queries (so status and Test results refresh), but never overwrite local edits. **Reload** is the explicit way to discard edits and load the saved draft again.
- **Forms commit into the store.** Each inspector is a `useForm({ resolver: zodResolver(schema.pick(...)), values })`. Text fields commit on blur/Enter, selects, toggles, tags and chips on change: the form is validated, and only changed fields are written to the store as one undo step. Undo/redo changes the store, `values` changes, and the form resets to it. Invalid input shows the schema's message and is not committed. `HabitatInspector` is the reference; `PoiInspector` is left as exercise #9 (see `patches/0.1.0/EXERCISES.md`).
- The editor keeps edits local until **Save draft**. **Validate** checks the unsaved state on the server without saving.

## Tools and shortcuts

| Tool | Key | Use |
|---|---|---|
| Select | `V` | Click a habitat (click again to select its region) or a POI. Drag handles to reshape. Right-click a vertex to delete it |
| Region | `R` | Click points; double-click, Enter or click the first point to finish. Backspace removes the last point, Esc cancels |
| Habitat | `H` | Same; the habitat is assigned to the region containing it |
| POI | `P` | Click inside a region to place; stays active |
| Test | `T` | Click to drop the player; drag it or use arrow keys (Shift for bigger steps) |

`Ctrl+S` save, `Ctrl+Z` undo, `Ctrl+Shift+Z` or `Ctrl+Y` redo, `Delete` delete selection, `Esc` back to Select.

## Configuration

Read from the repo-root `.env`: `VITE_API_URL` and `VITE_EDITOR_TOKEN` (must match the API's `EDITOR_TOKEN`). If the token is wrong the editor shows a prompt and remembers the value in local storage.

## Scripts

```bash
pnpm dev:editor                          # http://localhost:5173
pnpm --filter @wildbound/editor build
pnpm --filter @wildbound/editor typecheck
pnpm test:unit                            # includes src/**/*.test.ts
```
