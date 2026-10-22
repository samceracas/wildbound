# Glossary

Terms used across WILDBOUND and this documentation. **Game** terms are part of the fiction; **tech** terms are about
the software.

| Term | Kind | Meaning |
|---|---|---|
| **Activity pattern** | game | When a species is active: diurnal (day), nocturnal (night), crepuscular (dawn/dusk), cathemeral (any time), sheltering by day, seasonal, TBD |
| **AI assistant** | tech | The Creature Manager's helper that turns a one-line idea into a filled-in Wildkin entry, using a Groq language model that is given the canon documents. Suggestions are reviewed before saving. See [13](13-creature-manager.md#ai-assistant) |
| **Allele** | game/tech | One of the two versions of a gene an individual carries (one from each parent): `S`/`L` for Build, `B`/`W` for Temperament, `+`/`m` for Marking. A species' gene pool sets the odds of each |
| **Anti-teleport** | game/tech | Server checks that reject impossible GPS jumps. See [07](07-game-systems.md#anti-teleport-movement-checks) |
| **API** | tech | The server program (`apps/api`) and the set of web addresses ("endpoints") it answers |
| **Approach** | game | How an attack does its damage: Strike (always neutral), Pierce, Crush, Surge, Toxin or Spore. Each attack has exactly one |
| **Art job** | tech | A PixelLab generation in the Creature Manager that keeps running while you use other pages (minimized into the dock); closing the tab cancels it |
| **Assessment** | game | The checklist of real fieldwork (observe species, times of day and weathers, capture, win battles, record matchups and phenotypes, visit habitats) a player completes for a license rank-up, taken at a field station. Requirements are clamped to what the current world makes possible; `ASSESSMENT_RELAX_WEATHER` clamps weather ones to 1 while exercise #1 is open |
| **Basemap** | tech | The real-world map drawn underneath (streets, satellite). Decoration only |
| **Biome tags** | game | Labels on a region (`tropical-forest`, `urban-park`) |
| **Body trait** | game | Anatomy that resists or is vulnerable to certain attack approaches: Plated, Feathered, Soft-bodied, Leafy, Slick. A species has 1 or 2. See Matchup |
| **Build** | game | An inherited trait (gene alleles S/L): Small (HP ×0.9, Speed ×1.1), Typical, or Large (HP ×1.1, Defense ×1.05, Speed ×0.9). Visible to an observer ("Larger than typical") |
| **Canon** | game | Officially decided facts about the world. Marked ESTABLISHED, PROPOSED or TBD in the Wildkin Bible |
| **Capture** | game | Catching a Wildkin by throwing a capsule **during a wild battle**, after weakening it (Wildkin are feral and resist a capsule while they still have the strength). Missing HP raises the chance most; a fainted Wildkin cannot be captured. Adds it to your Party (or storage) with its level, genome and current HP, and unlocks rarity, activity and skills in the Registry. Since v0.3.0; the old exercise #3 capture route is retired. See [14](14-battles-and-research.md) |
| **Category** | game | The group a species belongs to by how it lives: Aerial, Aquatic, Terrestrial or Verdant. Decides which Field Registry license covers it. Required to publish |
| **Category capsule** | game | A capsule that adds +0.15 to the capture chance on Wildkin of one category: Canopy (Aerial), Current (Aquatic), Burrow (Terrestrial), Bloom (Verdant). Works on any Wildkin, the bonus only on a match |
| **Conditions / condition rules** | game | Time-of-day and weather lists on habitats, tables and entries. Empty = any |
| **CORS** | tech | Browser rule controlling which websites may call an API. The editor needs it; the game and the Creature Manager avoid it via their Vite proxies |
| **Creature** | tech | A species' **game data** (`creatures` table): what the editor, spawning and the Registry use. Written by Publish in the Creature Manager (or the seed) |
| **Creature Manager** | tech | The app (`apps/manager`, port 5175) for writing, publishing and illustrating Wildkin. See [13](13-creature-manager.md) |
| **Daily pickup** | game | Searching a POI for supplies, once per player per POI per day: Field Capsules, sometimes a Trail Ration or a category capsule matching the POI type. Exercise #14 (answers 501 until built) |
| **Draft** | tech | The work-in-progress copy of the world (Map Editor), or a Wildkin entry not yet published (Creature Manager). Players never see drafts |
| **Encounter table** | game | A weighted list of Wildkin for a habitat (or a whole region) |
| **Encyclopedia entry (Wildkin entry)** | game/tech | The full Wildkin Bible record for one species in the Creature Manager (`wildkin_entries`): prose, tags, notes and game fields. Only its game fields reach the game, when published |
| **Endpoint** | tech | One API address + method, e.g. `GET /api/game/state` |
| **Environment** | game | Current time of day + weather (+ tags) at a position |
| **Exercise** | project | A deliberately unfinished feature marked `TODO(you)` |
| **EXP** | game | Experience a Wildkin gains from battles (the largest source), walking with the lead, observation, exploration and captures, with daily caps. Cumulative: level L needs L³ EXP in total. Every gain is logged in `exp_events`. See [07](07-game-systems.md) |
| **Faint** | game | A Wildkin at 0 HP withdraws from the fight exhausted (bouts never aim to kill). It cannot battle until it recovers above 0. A fainted wild Wildkin retreats and cannot be captured |
| **Field Capsule** | game | The basic capture item: spent on each capture attempt in a battle, no bonus. New players get 10 (plus 3 Trail Rations); more come from daily pickups and license rank-ups. See also Category capsule |
| **Field Registry license** | game | The player's research license: one per category, each with its own rank (1 to 5) and researcher EXP. Sets the obedience cap, the scanner depth and access to license-locked habitats. See [14](14-battles-and-research.md) |
| **Field station** | game | A POI of type `research-station` or `gate` (East Research Gate in the seed world). Has a vet and is where assessments are taken |
| **First aid** | game | The care every injured or fainted Wildkin receives after a bout before it rests in its capsule, where it recovers slowly (natural recovery). Restless Wildkin cannot receive it |
| **Genotype** | game/tech | The pair of alleles an individual carries per gene, e.g. Build `SL`. Stored in the `genome` JSON; shown to the player from license rank 4 (so hidden carriers become visible) |
| **GeoJSON** | tech | Standard JSON format for map shapes. Coordinates are `[longitude, latitude]` |
| **Groq** | tech | Hosted LLM service (OpenAI-compatible) used by the AI assistant. Needs `GROQ_API_KEY`; has a free tier with rate limits |
| **Habitat** | game | An area inside a region with its own character and encounter tables |
| **Heartbeat** | tech | The game re-sending your last GPS fix every 30 s so a still player stays "current" |
| **In game (field marker)** | tech | Creature Manager chip on the fields that publishing copies into the game (`GAME_FIELDS`); unmarked fields are encyclopedia only |
| **Integration test** | tech | A test that runs the real API against a real database |
| **Interact radius** | game | 60 m: how close you must be to observe or battle a spawn, search a POI, visit a vet or take an assessment |
| **Lead Wildkin** | game | The Wildkin in party slot 0, or if it cannot battle (fainted or restless) the first party member by slot that can. It starts every battle and collects walking, observation, exploration and capture EXP |
| **Level** | game | 1 to 100; for a captured Wildkin the level *is* the bond. Wild Wildkin get a level from their encounter table's range and keep it when captured. Shown as a number |
| **License rank** | game | A license's level, 1 to 5; everyone starts at rank 1 in all four categories. Rank-up needs researcher EXP (600, 2,000, 5,000, 12,000 for ranks 2 to 5) **and** a passed assessment, and grants 5 category capsules and 3 Field Capsules. A habitat can require a rank to battle and capture there (license-locked habitat) |
| **Lore context** | tech | The lore sent with each AI assistant request: by default the condensed `docs/lore/assistant-brief.md`; with `LORE_SOURCE=full` the canon `.docx` files (up to `LORE_MAX_CHARS`), Bible first |
| **Marking** | game | A rare, inherited, purely cosmetic variant of a species (e.g. Kantar's "Banded"), shown when both alleles are `m`. Named after a visible difference; frequency per allele usually 0.02 to 0.1 (at most 0.2). Shown as a text badge (no variant art yet) |
| **Matchup** | game | How an attack's approach fares against a body trait: weak (×1.5) or resists (×0.67), multiplied for two traits. Plated: weak to Crush, resists Pierce. Feathered: Surge / Crush. Soft-bodied: Pierce / Spore. Leafy: Toxin / Surge. Slick: Toxin / Pierce. Hidden until discovered in battle, then recorded per body trait in the Registry (first record: researcher EXP). See [14](14-battles-and-research.md) |
| **Migration** | tech | A versioned SQL script that changes the database structure |
| **Monorepo** | tech | One repository containing several programs and libraries |
| **Movement style** | game | How a species' spawns wander on the radar: `still`, `skulker`, `forager`, `roamer` or `darter`. Set per species in the Creature Manager |
| **Natural recovery** | game | Slow healing in the capsule after first aid: empty to full in 8 hours, computed lazily when HP is read (exercise #13). Frozen while restless |
| **Obedience cap** | game | The highest level a license covers: rank × 20 (20, 40, 60, 80, 100). A Wildkin at the cap stops gaining EXP (anything beyond is lost) until the license ranks up |
| **Observe** | game | Studying a Wildkin. Unlocks its basic Registry entry, reveals the spawn's level and visible traits (Build, marking, Temperament from license rank 2), earns researcher EXP and the lead's observation EXP, and raises the capture chance in a later battle |
| **Party** | game | Up to six captured Wildkin that travel with you (slots 0 to 5); the rest are in storage. Slot 0 is the lead Wildkin |
| **Phenotype** | game | The trait an individual shows, derived from its genotype: Small/Typical/Large, Bold/Steady/Wary, marked or not. Never stored, always derived. The Registry records the phenotypes you have seen (researcher EXP) |
| **PixelLab** | tech | AI pixel-art service. The Creature Manager uses its cheapest model (Pixen) to draw 64 px icons and 128 px sprites, checking the credit balance first. Needs `PIXELLAB_API_KEY` |
| **Placeholder attack** | game | One of a species' 1 or 2 simple attacks (name, approach, power 30 to 60) used until the 0.4.0 skill system replaces them. Separate from the Registry's proposed skills; PROPOSED canon. A species with none falls back to "Lunge" |
| **POI (point of interest)** | game | A named spot in a region (gate, trail, creek…) |
| **PostGIS** | tech | PostgreSQL extension for geographic shapes and distances |
| **Prisma** | tech | The TypeScript library used to talk to the database |
| **Publish** | tech | Map Editor: validate the draft and copy it to the published world players see. Creature Manager: copy an entry's game fields into `creatures` |
| **Published** | tech | The live copy of the world |
| **Radar** | game | The map screen showing you and nearby Wildkin |
| **Region** | game | A named WILDBOUND area drawn over a real place (Mabunyi Nature Reserve) |
| **Registry** | game | The field guide of all species (like a Pokédex). Entries are unknown, observed or captured. Observed species gain field notes: category, body traits with recorded matchups, when and in which weather you saw them, and recorded phenotypes |
| **Registry description** | content | The text players read in a species' Registry entry after observing it (`creatures.description`). Written in the Creature Manager (`registryDescription`), separate from the encyclopedia's identity line |
| **Registry number** | game | A species' number, shown as "No. 001" |
| **Researcher EXP** | game | The player's EXP per license category, earned by learning (observing, recording conditions, matchups and phenotypes, capturing, visiting habitats), never by battling. Needed for license rank-ups |
| **Resolve** | tech | Turning a coordinate into a `WorldContext` (region, habitat, Wildkin…) |
| **Rested bonus** | game | One rested charge per 2 hours since your last battle EXP (up to 10). Each won battle spends one and doubles that battle's EXP |
| **Restless** | game | A Wildkin captured above its license's obedience cap. It travels with you and still gains EXP (up to the top of its own license band), but will not battle and cannot be healed (its HP stays frozen) until the license is earned: "Needs Aquatic rank 2 to cooperate." |
| **Satchel** | game | The inventory screen |
| **Scanner depth** | game | How much you see about your own Wildkin, by your license rank in its category: rank 1 level, HP, category, traits, stat shape, Build, marking; rank 2 adds Temperament and stat grades; rank 3 vigor; rank 4 and 5 the genotype. Hidden details are sent as `null` |
| **Schema (Zod)** | tech | A definition of a data shape that can check data at runtime and produce a TypeScript type |
| **Seed** | tech | Starting data loaded into the database (5 Wildkin with their encyclopedia entries and art, the Mabunyi world) |
| **Session / cookie** | tech | How the server remembers you're logged in (`wb_session`) |
| **Slug** | tech | A URL-safe id like `forest-edge` |
| **Soft delete** | tech | Marking a row deleted (`deleted_at`) instead of removing it. A soft-deleted Wildkin stops spawning but stays in players' Registry, frees its registry number, and can be restored. The Creature Manager also offers **permanent delete**, which erases it and everything referencing it |
| **Spawn** | game | One Wildkin placed by the server near one player, for up to 10 minutes (less if it wanders off). Since v0.3.0 each spawn is an individual with a level, genome and vigor. A spawn in a battle (`in_battle`) is frozen: it neither expires nor wanders until the battle ends |
| **Spawn modifiers** | game | Per-species multipliers on encounter weight by weather and time of day |
| **SRID 4326 / WGS84** | tech | The standard latitude/longitude coordinate system (as used by GPS) |
| **Stage** | tech | `draft` or `published`; part of every world row's key |
| **Stat budget** | game | The fixed total of a species' four base stats: every species' HP, Attack, Defense and Speed add up to exactly 300 (`STAT_BUDGET`), so rarity never means strength. The Creature Manager refuses to publish a species that breaks it. See [13](13-creature-manager.md#section-9-battle--genetics) |
| **Stat shape** | game | How a species spreads its stat budget over HP, Attack, Defense and Speed (e.g. Kawi: high Speed, low Defense), shaped by anatomy and behaviour. Players see it as words per stat: Signature strength, Solid, Modest, Weak point |
| **Status** | game | A battle condition: Asleep, Stunned, Numbed, Entangled or Exhausted, each with its effect, duration and a capture bonus. The framework exists, but nothing inflicts a status until 0.4.0 |
| **Strike** | game/tech | One rejected impossible jump; three in a row lock you for 2 minutes |
| **TanStack Query** | tech | Library that fetches, caches and refreshes server data in the React apps |
| **Temperament** | game | An inherited trait (gene alleles B/W): Bold (Attack ×1.1, Defense ×0.9), Steady, or Wary (Speed ×1.1, Attack ×0.9). Named for the player only from license rank 2 ("Holds its ground" / "Keeps its distance") |
| **Test mode** | tech | Editor tool to drop a simulated player and see the resolved context |
| **Turf** | tech | JavaScript geometry library (areas, overlaps) used for validation and drawing |
| **Vet** | game | Treats every non-restless Wildkin you own (party and storage) to full, instantly and for free, at a field station within 60 m |
| **Vigor** | game | An individual's condition per stat, 0 to 5 (a +0% to +5% bonus), rolled at spawn and **not** inherited. Shown as words (Frail, Slight, Average, Sound, Robust, Exceptional) from license rank 3 |
| **Visual hook** | game | The one or two features players remember a Wildkin by (e.g. Kawi's rust breast and long tail). Feeds the art prompt |
| **Wandering** | game | Spawns moving a few meters every 5–15 s (each on its own rhythm) according to their movement style; one that walks out of the 120 m spawn radius is gone. Experimental since v0.2.0, kept as it is in v0.3.0 (a spawn in a battle stops wandering). See [07](07-game-systems.md#wandering-spawns-experimental) |
| **Weight** | game | A number 1–1000 saying how common an entry is relative to others in its table |
| **Wild battle** | game | A turn-based battle between your active Wildkin and a wild spawn, resolved on the server, one per player at a time. Each turn: attack, switch, use an item, throw a capsule or escape. Ends won, captured, lost, escaped or abandoned (10 min idle). Losing costs nothing but your party's HP. See [14](14-battles-and-research.md) |
| **Wildkin** | game | The creatures of WILDBOUND: a distinct biological lineage, not ordinary animals |
| **WMO code** | tech | International weather code returned by Open-Meteo (0 = clear sky, 95 = thunderstorm…) |
| **WorldContext** | tech | The answer to "what is here?": region, habitat, POIs, tables, available Wildkin, environment |
| **WorldDocument** | tech | The whole authorable world: regions, habitats, POIs, encounter tables |
| **Zustand** | tech | Small state library holding the editor's in-progress edits and undo history |
