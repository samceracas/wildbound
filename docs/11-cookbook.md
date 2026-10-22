# 11 · Cookbook: how to change things

> **In plain English:** step-by-step recipes for the changes you're most likely to make, with the exact files to touch
> and a "what can break" list for each. Many content changes need **no code at all** (see the first table).

## Contents

- [Do I need to write code?](#do-i-need-to-write-code)
- [General workflow for any feature](#general-workflow-for-any-feature)
- [Add a new Wildkin](#add-a-new-wildkin)
- [Change a Wildkin's stats, text or spawn modifiers](#change-a-wildkins-stats-text-or-spawn-modifiers)
- [Retire (delete) a Wildkin](#retire-delete-a-wildkin)
- [Add a field to the Wildkin encyclopedia](#add-a-field-to-the-wildkin-encyclopedia)
- [Tune or switch off wandering](#tune-or-switch-off-wandering)
- [Add an inventory item](#add-an-inventory-item)
- [Tune a game rule](#tune-a-game-rule)
- [Add a weather state or time-of-day band](#add-a-weather-state-or-time-of-day-band)
- [Add a POI type](#add-a-poi-type)
- [Add an API endpoint](#add-an-api-endpoint)
- [Add a game screen (tab)](#add-a-game-screen-tab)
- [Add a field or entity to the world](#add-a-field-or-entity-to-the-world)
- [Add a player-data table](#add-a-player-data-table)
- [Add a world validation rule](#add-a-world-validation-rule)
- [Add an editor basemap](#add-an-editor-basemap)
- [Add a UI component (shadcn)](#add-a-ui-component-shadcn)
- [Impact map: what depends on what](#impact-map-what-depends-on-what)

## Do I need to write code?

| Change | Where | Code? |
|---|---|---|
| Move a boundary, add a habitat or POI | Map Editor → Save → Publish | No |
| Which Wildkin live in a habitat, weights, time/weather-only entries | Map Editor (encounter tables) | No |
| Wildkin description, rarity, modifiers, skills, movement style | Creature Manager → Save draft → Publish | No |
| A new Wildkin (entry, AI-assisted lore, art) | Creature Manager → Publish → Map Editor encounter table → Publish | No |
| Retire a Wildkin | Creature Manager → Delete (restorable) | No |
| Change the five *seed* Wildkin for fresh databases | `packages/db/seed/creatures.json` / `wildkin.json` → `pnpm db:seed` | Data only |
| Spawn radius, interact range, anti-cheat limits, wandering step | `GAME_RULES` | One constant |
| New item, weather state, POI type, endpoint, screen | See recipes | Yes |

## General workflow for any feature

```mermaid
flowchart LR
    s["1 · Schema<br/>packages/shared"] --> r["2 · Rules<br/>packages/world<br/>(+ unit tests)"] --> d["3 · DB<br/>schema.prisma + migration<br/>world-repo.ts"] --> a["4 · API<br/>route + service<br/>(+ integration test)"] --> c["5 · Clients<br/>api.ts · queries.ts · UI"] --> doc["6 · Docs<br/>docs/ + READMEs"]
```

Not every feature touches every layer, but follow this order: the schema change makes TypeScript point you to every
other place that needs updating. Finish with `pnpm typecheck && pnpm test && pnpm build`.

## Add a new Wildkin

Since v0.2.0 this needs **no code and no files**: everything happens in the
[Creature Manager](13-creature-manager.md) and the Map Editor.

```mermaid
flowchart LR
    a["Manager: New Wildkin"] --> b["AI assistant:<br/>describe the idea"] --> c["Review & edit<br/>the 8 sections"] --> d["Save draft"]
    d --> e["Generate sprites<br/>with PixelLab"] --> f["Publish"]
    f --> g["Map Editor:<br/>add to encounter tables"] --> h["Save · Validate · Publish"]
    h --> i["🦎 It spawns in the game"]
```

1. **Start the apps.** `pnpm dev` (or `pnpm dev:api` + `pnpm dev:manager` + `pnpm dev:editor`). For the AI helpers set
   `GROQ_API_KEY` and `PIXELLAB_API_KEY` in `.env` (optional).
2. **Create.** Manager → **New Wildkin**. The registry number is pre-filled with the next free one.
3. **Brainstorm (optional).** In the *AI field assistant* panel describe the idea, e.g. *"a shy moth that pollinates
   night-blooming vines by the creek"*, and press **Generate with AI**. The form fills in; read the notes (canon
   conflicts, overlaps with existing Wildkin) and the list of dropped fields.
4. **Review.** Go through the eight sections. Keep `TBD` where canon is undecided (rarity, activity), mark invented
   details as PROPOSED in *Canon status*, pick a **movement style** that matches the behaviour, and make sure the
   **Physical description** and **Visual hook** describe a readable silhouette (they drive the art). Required to publish:
   Name, Registry description (what players read), Habitat summary. Fields marked **IN GAME** reach the game; check
   them in the **In-game preview** on the right.
5. **Save draft.** The canonical id (e.g. `luntay`) is fixed from now on.
6. **Art.** **Generate sprites with PixelLab** → check the balance shown → generate icon (64 px) and sprite (128 px).
   Not happy? Improve the Appearance section or add extra direction and generate again (each image costs one
   generation).
7. **Publish.** The species is copied into `creatures`. It is not spawning yet: no habitat lists it.
8. **Place it.** Open (or focus) the Map Editor; the new species is in the Wildkin picker. Add it to one or more
   encounter tables with a weight (and conditions if needed), **Save draft**, **Validate**, **Publish**.
9. **Check.** In the editor's Test mode drop the player in that habitat: the new Wildkin is in *Available Wildkin*. In
   the game it appears on the radar and in the Registry (as a silhouette until observed).

**What can break / gotchas:**

- **Not in the editor's picker** → it is still a draft: Publish it in the manager.
- **Never spawns** → not in a *published* encounter table, or its conditions/spawn modifiers rule it out at this
  time/weather (×0).
- **Duplicate id or registry number** → the manager refuses (409); ids and numbers are shared with the seeded
  creatures.
- **No art** → the game shows a neutral "?" placeholder until you generate art; nothing breaks.
- **Tests that count the roster** (`registry.total`, 5 creatures) only use the seed data, so a species created in the
  manager does not affect them. Adding a sixth species to the *seed files* does (see below).

### Adding a Wildkin to the seed data (rare)

Only when the species should exist in every fresh database (and in tests):

1. Append it to `packages/db/seed/creatures.json` (game fields, incl. `movementStyle`) **and**
   `packages/db/seed/wildkin.json` (the full entry, validated by `WildkinEntryInputSchema`). Easiest: author it in the
   manager, then copy the values from `GET /api/manager/wildkin/<id>`.
2. Optionally add `apps/web/public/wildkin/icons/<id>.png` and `…/sprites/<id>.png` (imported into the DB by the seed,
   and the game's offline fallback).
3. `pnpm db:seed`. Update the tests that count the seed roster (`apps/api/test/game.test.ts`, `world.test.ts`), the
   charts (`node docs/images/generate-charts.mjs`, a new series colour in `SERIES`) and
   [09](09-wildkin-and-content.md).

## Change a Wildkin's stats, text or spawn modifiers

Open it in the Creature Manager, edit, **Save draft** (the game is unchanged; the entry shows *Published · edited*),
then **Publish**. Modifier values must be 0 to 10 (`SpawnModifiersSchema`); blank means ×1. The canonical id cannot be
changed (encounter entries, spawns, Registry and art reference it); create a new species instead.

> `pnpm db:seed` resets the five **seed** species' game fields from `creatures.json`. If you changed one of them in the
> manager, publish it again after seeding (or update the JSON too).

## Retire (delete) a Wildkin

Creature Manager → **Delete** (confirm). It is a soft delete: the species stops spawning immediately, disappears from
the editor's pickers and the manager list, and stays in the Registry/Party of players who already met it. **Restore**
undoes it (Wildkin list → *Show deleted*).

**What can break:** a published world whose encounter table still lists the species keeps working (the species just
never spawns), but the next editor **Publish** reports it as an unknown Wildkin. Remove the entry from the table (Save
still works, so you do not lose edits).

## Add a field to the Wildkin encyclopedia

- **Prose only (stays in the manager):** add it with a default to `WildkinEntryInputSchema`
  (`packages/shared/src/wildkin.ts`) and a field in the right section of
  `apps/manager/src/features/wildkin/WildkinEditPage.tsx`. No migration (it is stored in `wildkin_entries.content`).
  Add a line to `FIELD_GUIDE` in `apps/api/src/manager/assistant.ts` if the AI should fill it, and a label in
  `wildkin-form.ts` (`fieldLabel`).
- **A game field (reaches `creatures`):** all of the above, plus a column in `schema.prisma` + migration, the field in
  `CreatureDefinitionSchema` (`world.ts`), `creatureFromEntry` (`wildkin-repo.ts`), `listCreatures`/`upsertCreatures`
  (`world-repo.ts`), the seed `creatures.json`, and whatever uses it (`views.ts`, spawning…).

**What can break:** forgetting the default makes old entries fail to parse (`toEntry` validates `content` on every
read).

## Tune or switch off wandering

Wandering is experimental (see [07 · Wandering](07-game-systems.md#wandering-spawns-experimental)).

- **Per species:** change the movement style in the Creature Manager and publish.
- **Globally:** speeds and pause chances in `WANDER_PROFILES` / `INACTIVE_SPEED_FACTOR`
  (`packages/world/src/wandering.ts`); step interval and catch-up cap in `GAME_RULES.spawnWanderStepMs` /
  `spawnWanderMaxSteps`.
- **Off:** remove the `wanderSpawns(...)` call in `gameState()` (`apps/api/src/game/service.ts`), keeping the active
  spawns list as it was. The radar's walking animation then simply never triggers.

**What can break:** `wandering.test.ts` and the wandering case in `apps/api/test/game.test.ts` assert the current
behaviour; update them with the change.

## Add an inventory item

1. `packages/shared/src/game.ts` → add to `ITEMS` (`name`, `description`, `category`). `ItemIdSchema` updates itself.
2. Optional: add to `STARTER_INVENTORY` (only affects **new** players; existing players need a backfill, e.g. a
   one-off script with `db.inventoryItem.upsert` per player).
3. `apps/web/src/features/inventory/InventoryPage.tsx` → add an icon in `ICONS`; if it's a new `category`, add a filter
   in `CATEGORIES`.
4. If it does something, add an endpoint (recipe below) and a button.

**What can break:** nothing else; unknown item ids in the DB are silently skipped by `GET /inventory`.

## Tune a game rule

Edit `GAME_RULES` in `packages/shared/src/game.ts` (all values documented in
[07](07-game-systems.md#all-tunable-numbers)). The web app imports the same object (range ring, accuracy limit), so
both sides change together.

**What can break:** tests that assert specific distances or timings (`movement.test.ts`, `game.test.ts`); the web
heartbeat (30 s) must stay below `positionStaleMs`; charts in the docs (re-run the generator).

## Add a weather state or time-of-day band

Example: add `"snow"` weather.

1. `packages/shared/src/constants.ts` → add to `WEATHER`. Everything typed `Weather` now includes it.
2. `packages/world/src/weather.ts` → map WMO snow codes (71 to 77, 85 to 86) to `"snow"`; update `weather.exercise.test.ts`.
3. `apps/web/src/features/game/environment.tsx` → `WEATHER_LABEL` and the icon map (TypeScript errors until you do).
4. Optionally add `"snow"` modifiers to creatures in `creatures.json`.
5. The editor's condition chips, Test-panel select and modifier formatting iterate `WEATHER`, so they update themselves.
6. Stored JSON conditions remain valid (they never contained `snow`). No migration needed.

For a new **time band**, also change `timeOfDayForHour()` boundaries, `conditions.test.ts`, `TIME_LABEL`/icons in the
web app, and the time-of-day chart.

## Add a POI type

1. `POI_TYPES` in `packages/shared/src/constants.ts`.
2. `POI_ICONS` in `apps/editor/src/map/editor-map.ts` (else it falls back to "•").
3. Done: the DB column is plain text and the inspector lists `POI_TYPES`.

## Add an API endpoint

Example: `POST /api/game/items/trail-ration/use`.

1. **Contract** in `packages/shared/src/game.ts`:
   ```ts
   export const UseItemResponseSchema = z.object({ itemId: ItemIdSchema, quantityLeft: z.number().int() });
   export type UseItemResponse = z.infer<typeof UseItemResponseSchema>;
   ```
2. **Route** in `apps/api/src/routes/game.ts` (already behind `requirePlayer`):
   ```ts
   router.post("/items/:itemId/use", async (req, res) => {
     const { itemId } = parseOr400(z.object({ itemId: ItemIdSchema }), req.params, "Unknown item");
     const playerId = res.locals.player.id;                       // always scope by player
     const row = await db.$transaction(async (tx) => {
       const { count } = await tx.inventoryItem.updateMany({
         where: { playerId, itemId, quantity: { gt: 0 } },        // re-check inside the transaction
         data: { quantity: { decrement: 1 } },
       });
       if (count === 0) throw new HttpError(409, "none_left", "You have none left");
       return tx.inventoryItem.findUniqueOrThrow({ where: { playerId_itemId: { playerId, itemId } } });
     });
     res.json({ itemId, quantityLeft: row.quantity } satisfies UseItemResponse);
   });
   ```
   Logic that needs position/spawns goes in `game/service.ts`; pure rules in `@wildbound/world`.
3. **Client** `apps/web/src/lib/api.ts`: `useItem: (id: string) => request(UseItemResponseSchema, \`/api/game/items/${id}/use\`, post())`.
4. **Hook** `apps/web/src/lib/queries.ts`: a `useMutation` that invalidates `keys.inventory` on success.
5. **Test** in `apps/api/test/game.test.ts` with the `login()`/`report()` helpers.
6. **Docs:** add the row to [04 · API reference](04-api-reference.md).

For editor endpoints, use `apps/api/src/routes/editor.ts` (behind `requireEditor`), schemas in `shared/src/api.ts`, and
`apps/editor/src/lib/api.ts` + `queries.ts` (set `meta.errorMessage` for automatic toasts).

## Add a game screen (tab)

1. `apps/web/src/features/<name>/<Name>Page.tsx` → start with `<ScreenTitle title="…" />` inside
   `<div className="flex flex-1 flex-col gap-2.5 p-2.5">` like the other pages.
2. `apps/web/src/router.tsx` → add `{ path: "<name>", element: <NamePage /> }` under `/play`.
3. `GameLayout.tsx` → add a tab in `Tabs()` (the grid is `grid-cols-4`; change it to 5).
4. Data via a hook in `lib/queries.ts`.

The page inherits the session guard, pause overlay and polling automatically.

## Add a field or entity to the world

Example: add `ambience: string` to habitats.

```mermaid
flowchart TB
    a["shared/world.ts<br/>HabitatSchema.ambience"] --> b["prisma/schema.prisma<br/>+ migration"]
    b --> c["world-repo.ts<br/>loadWorld SELECT · saveDraft INSERT · publishDraft INSERT…SELECT · findSpatialContext"]
    c --> d["world/context.ts + shared/api.ts<br/>(only if WorldContext should expose it)"]
    a --> e["editor: world-edit.ts createHabitat default<br/>HabitatInspector pick + values + field"]
    a --> f["seed JSON (if required field)"]
```

1. Schema: add to `HabitatSchema` (give it `.default("")` to keep old JSON valid).
2. DB: column in `schema.prisma` → `migrate:new` → review SQL.
3. `world-repo.ts`: **four places** for a habitat column: `loadWorld` (SELECT + mapping), `saveDraft` (INSERT),
   `publishDraft` (the `INSERT … SELECT` copy), and `findSpatialContext` if resolution needs it. Forgetting the publish
   copy means the field is silently lost on publish.
4. Context: if players or the Test panel need it, add to `ResolvedHabitatSchema` and `assembleWorldContext`.
5. Editor: default value in `createHabitat`, `pick`/`values` + a `<TextField name="ambience">` in `HabitatInspector`.
6. Tests: a `world.test.ts` round trip (save → publish → resolve) catches missed copies.

A **new entity kind** (e.g. "spawn zones") follows the same path plus: a new array in `WorldDocumentSchema`, a new
table with `(id, stage)` keys and stage-aware FKs, integrity/validation rules, `EntityKind`/`Selection` and
create/update/delete/`entityExists` in `world-edit.ts`, a tree entry, an inspector, and map layers in `editor-map.ts`.

## Add a player-data table

1. Model in `schema.prisma` with `playerId` FK to `Player` **`onDelete: Cascade`**, `@@map("snake_case")`, `@map` columns.
2. `migrate:new`, add any CHECKs by hand, `pnpm db:migrate`.
3. Add the table to the `TRUNCATE` list in `packages/db/src/testing.ts` and the `DROP TABLE` list in
   `packages/db/src/scripts/reset.ts`.
4. Query it through Prisma, always with `where: { playerId }`.

## Add a world validation rule

`packages/world/src/validation.ts`:

- **Blocks saving?** Put it in `checkIntegrity` (structural problems only: broken references, duplicates).
- **Blocks publishing?** Push an `err({...})` in `validateWorld`.
- **Just advice?** Push a `warn({...})`.

Give it a stable kebab-case `code`, the right `entityType` and `entityId` (so the editor can highlight it), and a test
in `validation.test.ts`. The editor shows it automatically.

## Add an editor basemap

`apps/editor/src/map/basemaps.ts` → add an entry to `BASEMAPS` and its key to the `Basemap` type in `store.ts`. Prefer
key-free tile sources and include attribution. Inline raster styles (`raster(...)`) are more robust than remote style
URLs (see the known issue in [05](05-map-editor.md#the-map-controller-editor-mapts)).

## Add a UI component (shadcn)

```bash
cd apps/web     # or apps/editor
npx shadcn@latest add dialog
```

Components land in `src/components/ui/`. Restyle them with the design tokens (`bg-paper`, `text-ink`, `font-pixel`, …)
so they match the console look.

## Impact map: what depends on what

If you change the thing in the left column, check everything in the right column.

| Change | Also affects |
|---|---|
| A Zod schema in `shared` | API parsing (`parseOr400`), both clients' response parsing, DB mapping, seed JSON, tests |
| `GAME_RULES` | Server checks, radar ring and accuracy hint, tests, charts |
| `ITEMS` | Inventory endpoint, Satchel icons/filters, starter inventory |
| `creatures.json` / `wildkin.json` (seed) | Registry total, tests counting species, seed art import, charts |
| `WildkinEntryInputSchema` | Stored `content` of every entry (needs defaults), manager form, assistant `FIELD_GUIDE`/sanitizing, seed `wildkin.json` |
| `listCreatures` deleted filter | Spawning, editor pickers, save integrity, Registry/Party history |
| `/api/art/...` path (`wildkinArtPath`) | Game images and fallbacks, manager art panel, cache headers |
| `WEATHER` / `TIME_OF_DAY` | Weather mapping, web labels/icons, editor chips (auto), modifiers |
| A world DB column | `loadWorld`, `saveDraft`, `publishDraft`, maybe `findSpatialContext` |
| `assembleWorldContext` | Editor Test panel, game spawning, `context.test.ts`, integration tests |
| `checkMovement` | Every player's ability to play; `movement.test.ts`, `game.test.ts` |
| Route paths | `apps/web/src/lib/api.ts`, `apps/editor/src/lib/api.ts`, `apps/manager/src/lib/api.ts`, docs |
| `editor-map.ts` layers | Selection by click (`queryRenderedFeatures` layer ids), styles in `styles.css` |

Next: [12 · Exercises and roadmap](12-exercises-and-roadmap.md).
