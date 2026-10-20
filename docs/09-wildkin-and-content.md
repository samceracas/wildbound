# 09 · Wildkin and world content

> **In plain English:** this page is about the *content* of the game rather than the code: the five Wildkin, where
> they live, how time and weather change how often you meet them, the sample nature reserve the game ships with, the
> artwork, and the story documents that are the source of truth for all of it.

## Contents

- [The opening five Wildkin](#the-opening-five-wildkin)
- [Spawn modifiers](#spawn-modifiers)
- [The Mabunyi seed world](#the-mabunyi-seed-world)
- [Who spawns where](#who-spawns-where)
- [Art](#art)
- [Canon documents and authority](#canon-documents-and-authority)
- [Editing content](#editing-content)

## The opening five Wildkin

Data: [`packages/db/seed/creatures.json`](../packages/db/seed/creatures.json). Descriptions come from the Wildkin
Bible; skills are all marked `proposed` (not yet approved canon).

| No. | Icon | Sprite | Wildkin | Lives in | Rarity | Activity | Skills (proposed) |
|---:|:-:|:-:|---|---|---|---|---|
| 001 | <img src="../apps/web/public/wildkin/icons/kawi.png" width="48" alt="Kawi icon"> | <img src="../apps/web/public/wildkin/sprites/kawi.png" width="80" alt="Kawi sprite"> | **Kawi** — curious canopy bird, rust breast, expressive tail | Forest canopy, bright woodland edges | common | diurnal | Branch Hop, Curious Tilt |
| 002 | <img src="../apps/web/public/wildkin/icons/mimu.png" width="48" alt="Mimu icon"> | <img src="../apps/web/public/wildkin/sprites/mimu.png" width="80" alt="Mimu sprite"> | **Mimu** — cautious green-brown forest mouse | Leaf litter, moss, roots, undergrowth | common | crepuscular | Leaf Litter Hide, Seed Cache |
| 003 | <img src="../apps/web/public/wildkin/icons/lumae.png" width="48" alt="Lumae icon"> | <img src="../apps/web/public/wildkin/sprites/lumae.png" width="80" alt="Lumae sprite"> | **Lumae** — leaf-bodied quadruped with a dorsal flower; sign of a healthy clearing | Sunny clearings with flowering plants | TBD | diurnal | Bloom, Petal Veil |
| 004 | <img src="../apps/web/public/wildkin/icons/kantar.png" width="48" alt="Kantar icon"> | <img src="../apps/web/public/wildkin/sprites/kantar.png" width="80" alt="Kantar sprite"> | **Kantar** — segmented, armoured, pale side markings | Under rocks, fallen branches, damp floor | common | sheltering by day | Plate Curl, Quick Retreat |
| 005 | <img src="../apps/web/public/wildkin/icons/riverkin.png" width="48" alt="Riverkin icon"> | <img src="../apps/web/public/wildkin/sprites/riverkin.png" width="80" alt="Riverkin sprite"> | **Riverkin** — compact freshwater swimmer with a shimmering surface | Flowing water, shaded banks, pools | TBD | crepuscular | Tail Surge, Cool Shade |

Each creature also has `habitatAffinity` tags (e.g. Kawi: `canopy, woodland-edge, forest-edge`). They are
informational today; encounter tables decide where a Wildkin actually appears.

## Spawn modifiers

How time and weather scale each Wildkin's encounter weight (×1 = unchanged, ×0 = never). These take effect once
exercise #2 (`applySpawnModifiers`) is implemented.

![Spawn modifiers heatmap](images/charts/spawn-modifiers-heatmap.svg)

| Wildkin | dawn | day | dusk | night | clear | cloudy | rain | storm | fog |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Kawi | 1.3 | 1.5 | 1 | 0.1 | 1.2 | 1 | 0.5 | **0** | 0.7 |
| Mimu | 2 | 0.5 | 2 | 1 | 1 | 1.2 | 0.8 | 0.2 | 1.3 |
| Lumae | 0.8 | 1.6 | 0.6 | **0** | 1.5 | 0.8 | 0.3 | **0** | 0.5 |
| Kantar | 0.8 | 0.3 | 1.5 | 2 | 0.8 | 1 | 1.4 | 0.6 | 1.2 |
| Riverkin | 1.8 | 0.8 | 1.8 | 0.6 | 0.9 | 1.1 | 1.5 | 1.2 | 1.2 |

The values follow each species' activity pattern: the diurnal bird and flower Wildkin fade at night and in storms;
the crepuscular Mimu and Riverkin peak at dawn and dusk; Kantar, which shelters by day, comes out at night and in rain.

## The Mabunyi seed world

Data: [`packages/db/seed/mabunyi.world.json`](../packages/db/seed/mabunyi.world.json). Loaded with
`pnpm db:seed` (draft) or `pnpm db:seed --publish`.

![Seed world map](images/charts/seed-world-map.svg)

| Kind | Items |
|---|---|
| Region | **Mabunyi Nature Reserve** (`mabunyi-nature-reserve`), biome tags `tropical-forest, urban-park`. Placeholder boundary near Ninoy Aquino Parks and Wildlife Center, Quezon City |
| Habitats | **Forest Edge** (`forest-edge, canopy, forest-floor, leaf-litter`), **Sunbreak Clearing** (`clearing, flowering, sunny`), **Silayan Creekside** (`freshwater, creek, riparian, rocky`). No habitat-level conditions |
| POIs | East Research Gate (gate), Zigzag Forest Trail (trail), Sunbreak (clearing), Root Hollow (hollow), Fern Hollow (hollow), Creek Trail (trail), Silayan Creek (water) |
| Encounter tables | One per habitat (below). No region-wide table |

| Table | Entries (weight, conditions) |
|---|---|
| Forest Edge Encounters | Kawi 40 · Mimu 35 · Kantar 25 |
| Sunbreak Clearing Encounters | Lumae 60 (dawn/day only) · Kawi 25 · Kantar 15 |
| Silayan Creekside Encounters | Riverkin 60 · Kantar 25 · Mimu 15 (rain/cloudy only) |

A good test coordinate is **`14.6518, 121.0444`** (the Sunbreak POI, inside Sunbreak Clearing).

> The real-world location is an implementation detail. The fiction calls it "Mabunyi Nature Reserve". Redraw the
> boundary over your real area in the editor (Satellite basemap, select the region, drag vertices); the world lives in
> data, not code.

## Who spawns where

Share of spawns rolled in each habitat, computed from the seed data by the same rules the server uses.

![Encounter odds per habitat](images/charts/encounter-odds.svg)

| Scenario | Habitat | Kawi | Mimu | Lumae | Kantar | Riverkin |
|---|---|---:|---:|---:|---:|---:|
| Day · clear (tables only, as v0.1.0 ships) | Forest Edge | 40% | 35% | – | 25% | – |
| Day · clear (tables only) | Sunbreak Clearing | 25% | – | 60% | 15% | – |
| Day · clear (tables only) | Silayan Creekside | – | – | – | 29% | 71% |
| Day · clear (with modifiers, after exercise #2) | Forest Edge | 75% | 18% | – | 6% | – |
| Day · clear (with modifiers) | Sunbreak Clearing | 23% | – | 75% | 2% | – |
| Day · clear (with modifiers) | Silayan Creekside | – | – | – | 12% | 88% |
| Night · rain (with modifiers, after exercise #2) | Forest Edge | 2% | 28% | – | 70% | – |
| Night · rain (with modifiers) | Sunbreak Clearing | 3% | – | – | 97% | – |
| Night · rain (with modifiers) | Silayan Creekside | – | 9% | – | 51% | 40% |

How to read it: in Silayan Creekside on a clear day Mimu never appears (its entry requires rain or cloud), and at night
in rain Kantar dominates almost everywhere. Note that until exercise #1 (weather mapping) is done, the live weather is
always "clear".

## Art

| Asset | Size | Path | Generated with |
|---|---|---|---|
| Wildkin face icons | 64 px | `apps/web/public/wildkin/icons/<id>.png` | PixelLab (Pixen model) |
| Wildkin sprites | 128 px | `apps/web/public/wildkin/sprites/<id>.png` | PixelLab (Kantar regenerated in pass 2 for its pale side markings) |
| Player head | – | `apps/web/public/player/head.png` | PixelLab |
| UI mockups | 6 screens | `patches/0.1.0/mockups/*.png/.html` | Google Stitch ("Wildbound Design System") |

Rules from the project brief and the Bible:

- Art is **placeholder until approved** against the Wildkin Bible.
- AI tools produce art **offline**; they are never a runtime dependency and never the source of geographic truth.
- File names must equal the creature `id`.
- The repo's `.mcp.json` configures the PixelLab MCP server (needs `PIXELLAB_API_KEY`) for AI-assisted generation.
  The brief asks to use the cheapest model and check the credit balance before generating.

`packages/assets` is reserved for future tile/creature/effect metadata for the Phaser field.

## Canon documents and authority

[`documents/`](../documents/) holds the creative canon (Word files):

| Document | What it is |
|---|---|
| `WILDBOUND_Wildkin_Bible_v1.1.docx` | **Canonical species reference.** Appearance, behaviour, habitat, activity, rarity, art direction for each Wildkin. Labels every fact `ESTABLISHED`, `PROPOSED` or `TBD` |
| `WILDBOUND_The_First_Field_Survey_Source_of_Truth.docx` | The story of the opening, written as a book: Sam returns to Luntian settlement at the edge of Mabunyi Forest Reserve, receives a Field Registry assignment, and finds Wildkin appearing outside their recorded habitats |
| `WILDBOUND_Wildkin_Biology_and_Ecology_Reference_v1.0.docx` | Worldbuilding rules: Wildkin are a distinct biological lineage (shared genetic signature, an unresolved ancient origin), reproduction, ecology |

Authority order (from the Bible): the Bible for species canon, then the First Field Survey, then other references.
Design rules from these documents that the code follows:

- Wildkin are living species with ecology, **not** disposable battle units. **Observation precedes capture**
  (observing first raises capture chance).
- **Rarity is not strength.**
- Content is **data-driven**: a new species should reuse existing fields and systems.
- `TBD` values stay `TBD` in data (`rarity: "TBD"`, `activityPattern: "TBD"`); do not let tools invent them.
- A Wildkin appearing outside its habitat is a story clue (future feature).

## Editing content

| Want to… | Do this |
|---|---|
| Change where Wildkin appear, weights, conditions | In the **Map Editor** (no code). Save, validate, publish |
| Change a Wildkin's text, rarity, modifiers or skills | Edit `packages/db/seed/creatures.json`, run `pnpm db:seed` (upserts creatures; keeps your draft) |
| Add a new Wildkin | [Cookbook: add a Wildkin](11-cookbook.md#add-a-new-wildkin) |
| Replace the sample world | Edit `mabunyi.world.json` and `pnpm db:seed --force [--publish]`, or draw it in the editor |
| Refresh the charts on this page | `node docs/images/generate-charts.mjs` |

Next: [10 · Development guide](10-development-guide.md).
