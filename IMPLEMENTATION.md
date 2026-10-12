# WILDBOUND — Map Editor POC Technical Design Document
## Claude Implementation Context

> **READ THIS FIRST**
>
> This document is the implementation specification for the first proof-of-concept of **WILDBOUND**, a location-aware 2D creature-collecting field research game.
>
> The immediate goal is **not** to build the whole game. The immediate goal is to build the **Map Editor + location/world-resolution foundation** that will later feed the playable Phaser field.
>
> Treat the Map Editor as an internal developer tool. It is the authoring foundation for the game world, not the final player-facing game map.

---

## 1. What WILDBOUND Is

WILDBOUND is a creature-collecting and field-research game built around the idea that the player's real-world location determines what part of the fictional WILDBOUND world they are currently exploring.

The intended player experience combines three ideas:

- **Location-aware exploration** — the player's geographic position determines their current WILDBOUND region and habitat.
- **Classic top-down 2D exploration** — the eventual field screen should feel like a small, readable game world rather than a conventional GIS/map application.
- **Field research and creature discovery** — Wildkin appear in the environment, can be observed or studied through encounters, and are recorded in the Registry.

The game should feel like a coherent creature-collecting adventure rather than a map utility.

The project deliberately avoids requiring a large open world, large narrative campaign, or enormous creature roster for the first version. The world should be built incrementally, starting with one field area and a small number of Wildkin.

### Core conceptual loop

```text
Real-world location
        ↓
WILDBOUND region
        ↓
Habitat
        ↓
Environmental conditions
        ↓
Encounter table
        ↓
Wildkin encounter
        ↓
Observation or Battle
        ↓
Registry knowledge
```

The first implementation does not need to implement every step of that loop. The Map Editor POC exists to make the **location → region → habitat → encounter rules** portion authorable and testable.

---

## 2. Why the Map Editor Exists

The Map Editor is an internal authoring tool used by the developer to define how real geography becomes the WILDBOUND world.

It allows the developer to:

1. View the real geographic area.
2. Define WILDBOUND regions using geographic boundaries.
3. Define habitats inside those regions.
4. Place points of interest.
5. Associate habitats with encounter tables.
6. Configure environmental/time conditions.
7. Save work as a draft.
8. Publish valid world data.
9. Test which region/habitat a coordinate resolves to.
10. Preview the resulting world context before the Phaser field renderer exists.

The editor therefore sits between **geographic truth** and **gameplay truth**.

It should not become a general-purpose GIS product. The UX should be focused on the small set of operations required to author WILDBOUND content quickly.

---

## 3. The Three Representations of the World

Keep these representations separate.

### A. Real World

This is geographic truth:

- latitude
- longitude
- geographic boundaries
- real roads, waterways, landforms, etc.

This layer is represented by geographic data and ultimately stored/queryable through PostGIS.

### B. WILDBOUND World Context

This is the game's authored interpretation of geography:

- `WorldRegion`
- `Habitat`
- `PointOfInterest`
- `EncounterTable`
- environmental conditions
- time/weather rules
- Wildkin availability

This is the layer the Map Editor primarily authors.

### C. Phaser Presentation

This is the eventual playable representation:

- terrain tiles
- trees
- grass
- paths
- rocks
- water
- player sprite
- Wildkin sprites
- movement
- camera
- collisions
- interaction effects

The geographic map is **not** intended to become the final player-facing map.

Instead:

```text
Real geography
      ↓
WILDBOUND world interpretation
      ↓
Phaser 2D presentation
```

This separation is important. Do not build the POC in a way that couples geographic rendering directly to the eventual visual tilemap.

---

## 4. First Test World: Mabunyi Nature Reserve

The first proof-of-concept world should use the opening WILDBOUND setting already established by the project.

### Region

**Mabunyi Nature Reserve**

The fictional WILDBOUND location is mapped to a designated NCR geographic area. The real-world geography is an implementation layer; the player-facing fiction remains WILDBOUND.

### Initial points of interest

The opening area includes:

- East Research Gate
- Zigzag Forest Trail
- Sunbreak
- Root Hollow
- Fern Hollow
- Creek Trail
- Silayan Creek

### Initial Wildkin

The first field contains:

- Kawi
- Mimu
- Lumae
- Kantar
- Riverkin

Their initial ecological associations are:

| Wildkin | Environment |
|---|---|
| Kawi | canopy / woodland edges |
| Mimu | forest floor / leaf litter / moss |
| Lumae | sunny flowering clearings |
| Kantar | rocks / fallen branches / sheltered surfaces |
| Riverkin | freshwater |

The POC does not need to implement the full creature system. These creatures primarily provide concrete test data for encounter authoring and location resolution.

---

## 5. What Claude Is Building Now

The immediate deliverable is a **working Map Editor POC** plus enough backend/world logic to prove that authored geographic data can be resolved into WILDBOUND gameplay context.

The POC should demonstrate this complete developer workflow:

```text
Open Editor
   ↓
View geographic area
   ↓
Create Mabunyi region
   ↓
Draw/edit region boundary
   ↓
Create habitats
   ↓
Place POIs
   ↓
Assign encounter tables
   ↓
Save draft
   ↓
Validate
   ↓
Publish
   ↓
Enter a test coordinate
   ↓
Resolve coordinate
   ↓
Return WILDBOUND region + habitat + applicable encounter rules
```

If this works cleanly, the project has a usable foundation for the future Phaser field.

---

## 6. What the Map Editor Should Feel Like

The editor should feel like a **small game-world authoring tool with geographic capabilities**, not an enterprise GIS application.

Prioritize:

- fast authoring
- obvious controls
- visual feedback
- inspectable data
- simple validation
- easy test/preview
- minimal configuration

A reasonable conceptual layout is:

```text
┌───────────────────────────────────────────────────────────────┐
│ WILDBOUND MAP EDITOR                         Draft / Publish │
├───────────────┬───────────────────────────────────────────────┤
│ WORLD         │                                               │
│               │                                               │
│ Regions       │             Geographic Map                    │
│ Habitats      │                                               │
│ POIs          │        [region polygons]                      │
│ Encounters    │        [habitat polygons]                     │
│               │        [POI markers]                           │
│               │                                               │
│               │                                               │
├───────────────┴───────────────────────────────────────────────┤
│ Selected object / properties / validation                     │
└───────────────────────────────────────────────────────────────┘
```

The exact visual design can evolve. The information architecture matters more than pixel-perfect styling.

---

## 7. Relationship to the Future Phaser Field

The Map Editor is not a replacement for Phaser.

The eventual architecture is:

```text
                 ┌──────────────────┐
                 │  Real Location    │
                 │   lat / lon       │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ PostGIS / World  │
                 │ Spatial Resolver │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ WILDBOUND World  │
                 │ Region / Habitat │
                 │ Conditions       │
                 │ Encounters       │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ Phaser Field     │
                 │ 2D Presentation  │
                 └──────────────────┘
```

The POC should therefore expose clean world-context APIs rather than embedding game rendering logic into the editor.

The future Phaser client should be able to ask something conceptually like:

```text
"What WILDBOUND world context applies to coordinate X?"
```

and receive structured data such as:

```text
region
habitat
POIs
environmental conditions
encounter table
available Wildkin
```

---

## 8. Geographic Map vs. Game Map

This distinction is critical.

The geographic editor may show actual roads, boundaries, waterways, and satellite/map features.

The eventual player-facing field should instead look like a **stylized top-down WILDBOUND environment**.

For example:

```text
Real map
    ↓
"this coordinate is inside forest habitat near creek"
    ↓
WILDBOUND world context
    ↓
Phaser
    ↓
trees + grass + creek + path + Wildkin
```

Do not implement the POC as if every geographic feature must become a literal Phaser tile.

The authored world model should provide the semantic information required for the presentation layer.

---

## 9. Procedural / AI-Assisted Visual World Generation

The long-term project may use procedural rules and AI-assisted asset production to help turn geographic/ecological information into a consistent 2D visual world.

For example:

```text
geographic/ecological features
          ↓
terrain classification
          ↓
WILDBOUND visual rules
          ↓
tile / decoration selection
          ↓
Phaser field
```

AI may be useful for producing or iterating on:

- tile variants
- creature sprites
- environmental decoration
- visual asset concepts

However:

**AI should not be the authoritative source of geographic truth.**

The POC should therefore keep geography, world rules, and presentation separate.

Runtime AI generation is out of scope.

---

## 10. Scope Discipline

This is a solo-developer project.

The implementation should favor:

- reusable systems
- small data models
- explicit schemas
- modular code
- deterministic behavior
- testable APIs
- minimal content authoring burden

Do not add systems simply because they might be useful later.

Specifically, the Map Editor POC does **not** need to implement:

- full player authentication
- full creature collection
- complete Registry UI
- complete battle system
- inventory
- progression
- social features
- live GPS
- mobile app packaging
- procedural world generation
- AI runtime services
- complete Phaser gameplay

Those systems can consume the foundation later.

---

## Map Editor & Location-Aware Field Prototype — v1.0

## 1. Purpose

This TDD defines the first WILDBOUND technical milestone: a developer-facing World & Field Editor. The editor is the priority because later location-aware gameplay depends on authored geographic regions, habitats, POIs, encounter rules, and previewable world data.

The proof of concept succeeds when a developer can open a real geographic map, author a WILDBOUND region, draw habitats, place POIs, configure Wildkin encounter rules, save/reopen the data, resolve a simulated player coordinate, and preview the resulting world context.


## 2. Source Basis and Scope

This TDD follows the current location-aware WILDBOUND GDD: React + TypeScript + Vite for the frontend; Node.js + TypeScript with Fastify/NestJS for the backend; PostgreSQL with geospatial support; Drizzle/Prisma; Zod; Vitest; and a world model based on WorldRegion, Habitat, PointOfInterest, and EncounterTable.

The GDD also calls for a developer Map Editor that can draw/edit region polygons, create regions, place POIs, assign habitats and encounter tables, configure unlocks, save drafts, publish, and preview as a player.

This TDD narrows that larger design to the Map Editor proof of concept. Full Phaser exploration, live GPS, battles, Registry progression, accounts, and AI runtime generation are deferred.


## 3. Recommended Stack

- Editor UI: React + TypeScript + Vite.
- Geographic map: MapLibre GL JS.
- Polygon editing: Terra Draw or another MapLibre-compatible drawing library; use a small custom interaction layer if it materially reduces complexity.
- Backend: Node.js + TypeScript + Fastify.
- Database: PostgreSQL + PostGIS.
- Database access: Drizzle ORM.
- Validation: Zod.
- Client geometry utilities: Turf.js where useful; authoritative spatial queries remain in PostGIS.
- Shared contracts: TypeScript + Zod schemas shared between editor and API.
- Testing: Vitest plus API/database integration tests.
- Workspace: pnpm monorepo.
- Later field renderer: Phaser 3 + TypeScript, integrated into the React application.
- Geographic interchange: GeoJSON.

## 4. Architecture

React owns the editor UI and later the player-facing web application.

MapLibre renders the authoritative real-world geographic layer inside the editor.

Fastify exposes world-authoring and world-resolution APIs.

PostgreSQL + PostGIS stores geographic geometry and game-world relationships.

Phaser is a later presentation layer for the 2D field. It consumes the same authored world context rather than maintaining a second world model.

Geographic truth and visual presentation must remain separate: PostGIS says where something is; WILDBOUND rules say what it means; Phaser later decides how it looks.


## 5. Core Data Model

- WorldRegion: id, slug, name, description, geometry, biomeTags, unlockCondition, storyStateRequirements, active.
- Habitat: id, regionId, name, geometry, habitatTags, conditionRules.
- PointOfInterest: id, regionId, name, coordinates, type, interactionId, unlockCondition.
- EncounterTable: id, name, regionId/habitatId, entries, conditionRules, active.
- EncounterEntry: creatureId, weight, optional availability/condition constraints.
- CreatureDefinition: id, name, and the minimum fields needed for encounter selection. Seed Kawi, Mimu, Lumae, Kantar, and Riverkin for the POC.
- Publication state: draft/published status. Full version history is deferred.

## 6. Geometry Rules

- Store geographic geometry in PostGIS using an explicitly documented spatial reference, with WGS84 longitude/latitude as the initial convention.
- WorldRegion is a polygon or multipolygon.
- Habitat is a polygon associated with a parent region.
- POI is a geographic point associated with a region.
- The editor should warn or reject when habitat geometry is clearly outside its parent region.
- Do not use pixel coordinates as the geographic source of truth.

## 7. Map Editor UX

- Primary layout: large central MapLibre map, left inspector/sidebar, compact top toolbar, and a small action/status area.
- Core tools: select, create region polygon, edit polygon vertices, create habitat polygon, edit habitat, place POI, edit POI, delete/archive, save draft, publish, preview.
- Region inspector: name, slug, description, tags, active state, child habitats, POIs.
- Habitat inspector: name, habitat tags, condition rules, encounter table, parent region.
- POI inspector: name, type, coordinates, interaction identifier, unlock condition, description.
- Map styling should clearly distinguish region boundaries, habitat boundaries, POIs, selected objects, and simulated player position.

## 8. POC Workflow

1. Open World Editor.
2. Load the real geographic base map.
3. Create Mabunyi Nature Reserve as a test WorldRegion.
4. Draw its real geographic boundary.
5. Create a Forest Edge habitat and draw its polygon.
6. Create East Research Gate, Sunbreak, Root Hollow, Fern Hollow, and Silayan Creek as POIs.
7. Create a Forest Edge encounter table and assign Kawi, Mimu, and Kantar with simple weights.
8. Save the draft, reload it, and confirm all geometry and data persist.
9. Enter a simulated coordinate and resolve it through the API.
10. Display the resolved region, habitat, nearby POIs, and encounter table in a preview panel.
11. Publish the world data.
12. Confirm published data remains resolvable independently of draft edits.

## 9. Location Resolution API

- Implement a minimal endpoint such as GET /api/world/resolve?lat={lat}&lng={lng}.
- Validate latitude/longitude with Zod.
- Use PostGIS point-in-polygon to find the active published WorldRegion.
- Resolve the containing Habitat.
- Return nearby POIs.
- Return the applicable EncounterTable and environmental context identifiers.
- If no region matches, return a normal empty world-context response rather than a server error.
- Support simulated coordinates so development never depends on browser GPS.

## 10. Encounter Authoring

- Encounter tables are data, not React hardcoding.
- The POC editor should allow selecting a Wildkin and assigning a weight.
- Support a small structured condition model even if the first UI exposes only time-of-day, weather, and active/inactive.
- Spawn timers, despawn timers, movement, observation, and battle are deferred to the Phaser field.

## 11. Preview

Preview is a first-class POC requirement.

Select or enter a simulated coordinate and show the world context resolved from that coordinate.

The preview should demonstrate that changing coordinates can change region/habitat/POI/encounter results without code changes.

Later, the same preview entry point should launch Phaser using the exact same world context.


## 12. Draft and Publish

Editable draft data must be distinguishable from published player-facing data.

For the POC, a simple publication state or draft/published records are sufficient.

Publishing must validate required relationships before published data becomes available to the resolver.


## 13. Validation and Security

- Reject invalid geometry and malformed coordinates.
- Require habitat parent region and POI region relationships.
- Require encounter tables to contain valid CreatureDefinition references.
- Reject duplicate slugs within their scope.
- Validate editor payloads both client-side and server-side.
- Protect the editor with developer/admin authorization. Do not expose publish functionality to ordinary players.
- Server is authoritative for published world data.

## 14. Testing

- Unit tests: geometry validation, slug validation, encounter weighting, condition parsing, response schemas.
- Integration tests: create region → habitat → POI → encounter table → resolve coordinate.
- Database tests: point-in-polygon resolution, habitat resolution, nearby POI query, draft/published isolation.
- Manual acceptance: author a real Mabunyi test region, reload it, resolve at least three simulated coordinates, and verify expected contexts.

## 15. Definition of Done

- MapLibre geographic map loads.
- Developer can draw/edit/delete a WorldRegion.
- Developer can draw/edit/delete a Habitat.
- Developer can place/edit/delete POIs.
- Data persists through Fastify + PostGIS.
- At least one encounter table can be authored.
- Five opening Wildkin are available as encounter choices.
- Simulated coordinates resolve to region and habitat.
- Nearby POIs and encounter table are returned.
- Drafts can be saved and reopened.
- Published data is distinguishable from draft data.
- Preview displays resolved world context.
- Core editor behavior has automated tests.
- The schema is directly consumable by the future Phaser field.

## 16. Implementation Order for Claude

- Milestone 1 — Bootstrap pnpm workspace, React/Vite editor, Fastify API, shared TypeScript/Zod package, Drizzle, and PostgreSQL/PostGIS development environment.
- Milestone 2 — Create migrations for WorldRegion, Habitat, PointOfInterest, CreatureDefinition, EncounterTable, EncounterEntry, and publication state.
- Milestone 3 — Build MapLibre editor shell, sidebar, selection, and save/load.
- Milestone 4 — Implement region polygon creation/editing/deletion and persistence.
- Milestone 5 — Implement habitat polygons and containment validation.
- Milestone 6 — Implement POI placement/editing and nearby display.
- Milestone 7 — Implement encounter table authoring and Wildkin selection.
- Milestone 8 — Implement simulated coordinate resolution using PostGIS.
- Milestone 9 — Implement preview mode.
- Milestone 10 — Implement publish flow and acceptance tests.
- Do not begin Phaser field exploration until the Map Editor Definition of Done is met.

## 17. Repository Structure

- apps/web — React player application and later Phaser integration.
- apps/editor — Map Editor during the POC; it may later merge into the main web app.
- apps/api — Fastify API.
- packages/shared — shared types and Zod schemas.
- packages/world — world resolution and encounter/domain logic.
- packages/db — Drizzle schema, migrations, database access.
- packages/game — later battle/game systems.
- packages/assets — tile, creature, and effect asset metadata.

## 18. Claude Implementation Rules

- Treat this TDD and the current WILDBOUND GDD as the source of truth for this milestone.
- Do not jump ahead to Phaser until the Map Editor POC is complete.
- Do not create a second world model for Phaser.
- Do not hardcode Mabunyi geometry or encounter rules inside UI components; seed them as data.
- Keep world resolution and game rules independent from React components.
- Prefer simple, maintainable solutions appropriate for a solo developer.
- Do not add GIS/AI infrastructure without a concrete POC requirement.
- Use simulated coordinates throughout development; live browser geolocation is a later adapter.
- AI-assisted visual generation is a content-production tool, not a runtime dependency.
- Keep the application runnable after every milestone.

## 19. Deferred

- Phaser field exploration and movement.
- Live browser geolocation.
- GPS smoothing/accuracy behavior.
- Wildkin spawn/despawn timing and movement.
- Observation and battle flows.
- Registry progression.
- Full assignments/story progression.
- AI-generated procedural map construction.
- Production tile generation pipeline.
- Offline/PWA.
- Social and multiplayer systems.

## 20. First Proof Scenario

Use one real-world test area as Mabunyi Nature Reserve. Author one region, three habitats, five POIs, and one or two encounter tables. Seed Kawi, Mimu, Lumae, Kantar, and Riverkin.

Use a developer-controlled simulated coordinate to move the player between habitat polygons. The API must return the correct WILDBOUND context without any code changes.

The POC is successful when authored geographic data drives a deterministic location resolver and that same data is ready to be consumed by the future Phaser field.

