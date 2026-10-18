# @wildbound/editor

The WILDBOUND **Map Editor**: an internal developer tool for authoring the world on top of real geography. It is a small game-world authoring tool with geographic capabilities, not a GIS application.

## What it does

- Draw, reshape and delete **regions** and **habitats** (polygons) on a MapLibre map.
- Place and move **points of interest**.
- Author **encounter tables**: pick Wildkin, set weights, and add time-of-day and weather conditions.
- **Save draft**, **Validate**, and **Publish**.
- **Test mode**: drop a simulated player and see the exact context the API resolves (`/api/editor/resolve`, token required), for the draft or the published world, under any time of day and weather. Players cannot do this: the game only resolves their server-tracked position.

## Tech

React 19, Vite 7, TypeScript, MapLibre GL JS 5, Zustand 5 (state and undo/redo), Turf.js 7 (client-side geometry helpers), `@wildbound/shared` (schemas), `@wildbound/world` (the same validation and condition rules as the server).

## Layout

```
src/
  main.tsx, App.tsx        Entry, layout and keyboard shortcuts
  api.ts                   Typed API client (Zod-validated responses, bearer token)
  store.ts                 Zustand store: world, selection, tool, history, draft/publish actions, preview
  world-edit.ts            Pure, immutable edit operations (create, update, cascade delete, vertex edits)
  world-edit.test.ts       Unit tests for those operations
  map/
    editor-map.ts          Imperative MapLibre controller: layers, drawing, vertex handles, POIs, player
    basemaps.ts            Key-free basemaps
    MapView.tsx            Mounts the controller
  components/              Toolbar, Sidebar, PreviewPanel, IssuesPanel, form fields, overlays
  inspectors/              Region, Habitat, POI and EncounterTable inspectors
  styles.css
```

Design notes:

- **The map is imperative, the UI is React.** `editor-map.ts` subscribes to the store directly so map interactions never fight React render cycles.
- **Edits are pure functions** in `world-edit.ts`, so they are unit-testable and every edit is one undo step. Dragging a vertex is a single undo step through `beginTransient`/`endTransient`.
- **No world data in components.** Everything shown comes from the API.
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
```
