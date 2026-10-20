# Glossary

Terms used across WILDBOUND and this documentation. **Game** terms are part of the fiction; **tech** terms are about
the software.

| Term | Kind | Meaning |
|---|---|---|
| **Activity pattern** | game | When a species is active: diurnal (day), nocturnal (night), crepuscular (dawn/dusk), cathemeral (any time), sheltering by day, seasonal, TBD |
| **AI assistant** | tech | The Creature Manager's helper that turns a one-line idea into a filled-in Wildkin entry, using a Groq language model that is given the canon documents. Suggestions are reviewed before saving. See [13](13-creature-manager.md#ai-assistant) |
| **Anti-teleport** | game/tech | Server checks that reject impossible GPS jumps. See [07](07-game-systems.md#anti-teleport-movement-checks) |
| **API** | tech | The server program (`apps/api`) and the set of web addresses ("endpoints") it answers |
| **Basemap** | tech | The real-world map drawn underneath (streets, satellite). Decoration only |
| **Biome tags** | game | Labels on a region (`tropical-forest`, `urban-park`) |
| **Canon** | game | Officially decided facts about the world. Marked ESTABLISHED, PROPOSED or TBD in the Wildkin Bible |
| **Capture** | game | Catching a Wildkin with a Field Capsule. Unlocks rarity, activity and skills; adds it to your Party (exercise #3) |
| **Conditions / condition rules** | game | Time-of-day and weather lists on habitats, tables and entries. Empty = any |
| **CORS** | tech | Browser rule controlling which websites may call an API. The editor and manager need it; the game avoids it via the proxy |
| **Creature** | tech | A species' **game data** (`creatures` table): what the editor, spawning and the Registry use. Written by Publish in the Creature Manager (or the seed) |
| **Creature Manager** | tech | The app (`apps/manager`, port 5175) for writing, publishing and illustrating Wildkin. See [13](13-creature-manager.md) |
| **Draft** | tech | The work-in-progress copy of the world (Map Editor), or a Wildkin entry not yet published (Creature Manager). Players never see drafts |
| **Encounter table** | game | A weighted list of Wildkin for a habitat (or a whole region) |
| **Encyclopedia entry (Wildkin entry)** | game/tech | The full Wildkin Bible record for one species in the Creature Manager (`wildkin_entries`): prose, tags, notes and game fields. Only its game fields reach the game, when published |
| **Endpoint** | tech | One API address + method, e.g. `GET /api/game/state` |
| **Environment** | game | Current time of day + weather (+ tags) at a position |
| **Exercise** | project | A deliberately unfinished feature marked `TODO(you)` |
| **Field Capsule** | game | Item spent on each capture attempt. New players get 10 |
| **GeoJSON** | tech | Standard JSON format for map shapes. Coordinates are `[longitude, latitude]` |
| **Groq** | tech | Hosted LLM service (OpenAI-compatible) used by the AI assistant. Needs `GROQ_API_KEY`; has a free tier with rate limits |
| **Habitat** | game | An area inside a region with its own character and encounter tables |
| **Heartbeat** | tech | The game re-sending your last GPS fix every 30 s so a still player stays "current" |
| **Integration test** | tech | A test that runs the real API against a real database |
| **Interact radius** | game | 60 m: how close you must be to observe or capture |
| **Lore context** | tech | The text of the canon `.docx` files sent with each AI assistant request (up to `LORE_MAX_CHARS`), Bible first |
| **Migration** | tech | A versioned SQL script that changes the database structure |
| **Monorepo** | tech | One repository containing several programs and libraries |
| **Movement style** | game | How a species' spawns wander on the radar: `still`, `skulker`, `forager`, `roamer` or `darter`. Set per species in the Creature Manager |
| **Observe** | game | Studying a Wildkin. Unlocks its basic Registry entry |
| **Party** | game | Up to six captured Wildkin that travel with you; the rest are in storage |
| **PixelLab** | tech | AI pixel-art service. The Creature Manager uses its cheapest model (Pixen) to draw 64 px icons and 128 px sprites, checking the credit balance first. Needs `PIXELLAB_API_KEY` |
| **POI (point of interest)** | game | A named spot in a region (gate, trail, creek…) |
| **PostGIS** | tech | PostgreSQL extension for geographic shapes and distances |
| **Prisma** | tech | The TypeScript library used to talk to the database |
| **Publish** | tech | Map Editor: validate the draft and copy it to the published world players see. Creature Manager: copy an entry's game fields into `creatures` |
| **Published** | tech | The live copy of the world |
| **Radar** | game | The map screen showing you and nearby Wildkin |
| **Region** | game | A named WILDBOUND area drawn over a real place (Mabunyi Nature Reserve) |
| **Registry** | game | The field guide of all species (like a Pokédex). Entries are unknown, observed or captured |
| **Registry number** | game | A species' number, shown as "No. 001" |
| **Resolve** | tech | Turning a coordinate into a `WorldContext` (region, habitat, Wildkin…) |
| **Satchel** | game | The inventory screen |
| **Schema (Zod)** | tech | A definition of a data shape that can check data at runtime and produce a TypeScript type |
| **Seed** | tech | Starting data loaded into the database (5 Wildkin with their encyclopedia entries and art, the Mabunyi world) |
| **Session / cookie** | tech | How the server remembers you're logged in (`wb_session`) |
| **Slug** | tech | A URL-safe id like `forest-edge` |
| **Soft delete** | tech | Marking a row deleted (`deleted_at`) instead of removing it. A soft-deleted Wildkin stops spawning but stays in players' Registry, and can be restored |
| **Spawn** | game | One Wildkin placed by the server near one player, for up to 10 minutes (less if it wanders off) |
| **Spawn modifiers** | game | Per-species multipliers on encounter weight by weather and time of day |
| **SRID 4326 / WGS84** | tech | The standard latitude/longitude coordinate system (as used by GPS) |
| **Stage** | tech | `draft` or `published`; part of every world row's key |
| **Strike** | game/tech | One rejected impossible jump; three in a row lock you for 2 minutes |
| **TanStack Query** | tech | Library that fetches, caches and refreshes server data in the React apps |
| **Test mode** | tech | Editor tool to drop a simulated player and see the resolved context |
| **Turf** | tech | JavaScript geometry library (areas, overlaps) used for validation and drawing |
| **Visual hook** | game | The one or two features players remember a Wildkin by (e.g. Kawi's rust breast and long tail). Feeds the art prompt |
| **Wandering** | game | Spawns moving a few meters every 10 s according to their movement style; one that walks out of the 120 m spawn radius is gone. Experimental in v0.2.0. See [07](07-game-systems.md#wandering-spawns-experimental) |
| **Weight** | game | A number 1–1000 saying how common an entry is relative to others in its table |
| **Wildkin** | game | The creatures of WILDBOUND: a distinct biological lineage, not ordinary animals |
| **WMO code** | tech | International weather code returned by Open-Meteo (0 = clear sky, 95 = thunderstorm…) |
| **WorldContext** | tech | The answer to "what is here?": region, habitat, POIs, tables, available Wildkin, environment |
| **WorldDocument** | tech | The whole authorable world: regions, habitats, POIs, encounter tables |
| **Zustand** | tech | Small state library holding the editor's in-progress edits and undo history |
