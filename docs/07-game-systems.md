# 07 · Game systems

> **In plain English:** this page explains the rules of the game: how the server works out which habitat you're in,
> how it picks which Wildkin appear, how time and weather change the odds, how spawned Wildkin wander around, how it
> spots fake GPS jumps, and how the Registry fills in. Since v0.3.0 it also covers the creature systems: how a Wildkin's
> stats come from its species, its genes and its condition, how levels and EXP work (and where EXP comes from), how
> wild levels are chosen, and how Wildkin heal. Each section starts with the idea, then shows the exact formula, a
> worked example and where the code lives.

Almost every rule here is a **pure function in `packages/world`** (no database, no network), tested in
`packages/world/src/*.test.ts`. The numbers live in one constant object each in `packages/shared` (`GAME_RULES`,
`EXP_RULES`, `BATTLE_RULES`, `RESEARCH_RULES`), so tuning after play-testing never touches logic. The API's
`apps/api/src/game/*.ts` glues them to the database.

**Battles, matchups, capture, licenses, assessments and scanner depth** have their own page:
[14 · Battles and research](14-battles-and-research.md).

## Contents

- [Coordinate resolution](#coordinate-resolution)
- [Encounter math](#encounter-math)
- [Time of day](#time-of-day)
- [Weather](#weather)
- [Spawn modifiers](#spawn-modifiers)
- [Spawning lifecycle](#spawning-lifecycle)
- [Wandering spawns (experimental)](#wandering-spawns-experimental)
- [Anti-teleport (movement checks)](#anti-teleport-movement-checks)
- [Acting on a spawn: Observe and Battle](#acting-on-a-spawn-observe-and-battle)
- [Registry unlocking](#registry-unlocking)
- [Stats](#stats)
- [Genetics](#genetics)
- [Levels and EXP](#levels-and-exp)
  - [License cap clamp](#license-cap-clamp)
  - [Wildkin EXP sources](#wildkin-exp-sources)
  - [Daily caps, rested bonus and day keys](#daily-caps-rested-bonus-and-day-keys)
  - [EXP log and the split by source](#exp-log-and-the-split-by-source)
- [Wild levels](#wild-levels)
- [Healing](#healing)
- [Inventory, items and daily pickups](#inventory-items-and-daily-pickups)
- [Party, lead and starter](#party-lead-and-starter)
- [World validation](#world-validation)
- [All tunable numbers](#all-tunable-numbers)

## Coordinate resolution

*"I'm at this GPS point. What part of the WILDBOUND world is that?"*

```mermaid
flowchart TD
    P["(lat, lng) + stage + environment"] --> R{"PostGIS: active region<br/>covering the point?"}
    R -- none --> EMPTY["Empty context<br/>(region null, no Wildkin): still a valid answer"]
    R -- "one or more" --> R2["pick the smallest by area"]
    R2 --> H{"habitat of that region<br/>covering the point?"}
    H -- none --> NOH["habitat = null<br/>(only region-wide tables apply)"]
    H -- "one or more" --> H2["pick the smallest by area"]
    H2 --> HG{"habitat.conditionRules<br/>match environment?"}
    NOH --> TABLES
    HG -- yes --> OPEN["habitat tables open"]
    HG -- no --> CLOSED["habitat tables closed"]
    OPEN --> TABLES["Evaluate tables:<br/>habitat tables (sorted by name, id)<br/>then region-wide tables"]
    CLOSED --> TABLES
    TABLES --> E["each table: active ∧ table conditions ⇒ applicable<br/>each entry: applicable ∧ entry conditions ⇒ available"]
    E --> C["combineAvailableWildkin:<br/>sum weights per creature → probabilities<br/>(each entry keeps its level band)"]
    R2 --> POIS["POIs of the region within radius<br/>(nearest first, ≤ 25)"]
    C --> CTX["WorldContext"]
    POIS --> CTX
```

| Step | Code |
|---|---|
| Spatial lookups (region, habitat, POIs, candidate tables) | `findSpatialContext()` in `packages/db/src/world-repo.ts` |
| Environment default (time from zone, weather default clear) | `resolveWorldContext()` in `apps/api/src/resolve.ts` |
| Rules and assembly | `assembleWorldContext()` in `packages/world/src/context.ts` |
| Table evaluation | `evaluateEncounterTable()` in `packages/world/src/encounters.ts` |
| Merge across tables | `combineAvailableWildkin()` |

Why "smallest wins": a small habitat drawn inside a bigger one is the more specific place (a pond inside a forest).

Since v0.3.0 the resolved habitat also carries its `licenseRequirement` (see
[14 · License-locked habitats](14-battles-and-research.md#license-locked-habitats)).

## Encounter math

*"Which Wildkin can appear here, and how likely is each?"*

Weights are relative. Within one table, an available entry's probability is its weight divided by the sum of available
weights in that table. Across tables, weights for the same creature are **summed** and normalized.

**Worked example** (Sunbreak Clearing from the seed world):

| Entry | Weight | Entry conditions | Day | Night |
|---|---:|---|---|---|
| Lumae | 60 | dawn, day | ✅ 60 | ❌ |
| Kawi | 25 | any | ✅ 25 | ✅ 25 |
| Kantar | 15 | any | ✅ 15 | ✅ 15 |
| **Total available** | | | **100** | **40** |
| Probabilities | | | Lumae 60 %, Kawi 25 %, Kantar 15 % | Kawi 62.5 %, Kantar 37.5 % |

The night column is exactly what the editor's Test panel shows in
[the Test mode screenshot](05-map-editor.md#test-mode).

Then a creature is **rolled**:

```ts
// rollEncounter(candidates, random) in packages/world/src/encounters.ts
total = Σ weight; threshold = random() × total
walk the list subtracting weights; the first one that takes threshold below 0 wins
```

`seededRandom(seed)` (mulberry32) gives reproducible rolls for tests and previews.

Charts of the seed world's odds: [09 · Wildkin and world content](09-wildkin-and-content.md#who-spawns-where).

## Time of day

![Time-of-day bands](images/charts/time-of-day-bands.svg)

| Band | Local hours |
|---|---|
| dawn | 05:00 to 06:59 |
| day | 07:00 to 16:59 |
| dusk | 17:00 to 18:59 |
| night | 19:00 to 04:59 |

- `timeOfDayForHour(h)` and `timeOfDayAt(date, timeZone)` in `packages/world/src/conditions.ts` (uses
  `Intl.DateTimeFormat` with `hourCycle: "h23"`).
- **Game:** the time zone is the location's own (from Open-Meteo `timezone=auto`), else the zone the browser reported
  with the position, else `WORLD_TIMEZONE`. The server clock is used, never the client's.
- **Editor preview:** `timeOfDay` can be forced; otherwise current hour in `WORLD_TIMEZONE`.
- The status strip in the game shows the device's clock formatted in the server-reported zone.

## Weather

```mermaid
sequenceDiagram
    participant S as gameState / environmentAt
    participant W as OpenMeteoWeather
    participant O as api.open-meteo.com
    S->>W: current(lat, lng)
    alt cached (same ~1 km cell, < 10 min)
        W-->>S: cached conditions
    else
        W->>O: GET ?latitude&longitude&current=weather_code,temperature_2m&timezone=auto (4 s timeout)
        O-->>W: { timezone, current: { weather_code, temperature_2m } }
        W->>W: weatherFromWmoCode(code)  ← exercise #1
        W-->>S: { weather, temperatureC, timeZone, source: "live" }
    end
    Note over W: any failure → { weather: "clear", source: "fallback" }
```

- Cache key is `lat.toFixed(2),lng.toFixed(2)` (a cell roughly 1.1 km across); TTL 10 min, kept in process memory.
- **Exercise #1:** `weatherFromWmoCode()` in `packages/world/src/weather.ts` currently always returns `"clear"`.
  Intended mapping:

| WMO code(s) | WILDBOUND weather |
|---|---|
| 0, 1 | clear |
| 2, 3 | cloudy |
| 45, 48 | fog |
| 51 to 57 drizzle, 61 to 67 rain, 71 to 77 snow, 80 to 82 showers, 85 to 86 snow showers | rain |
| 95, 96, 99 | storm |
| anything else | cloudy |

- `WEATHER_API_URL=off` → `StaticWeather` (always clear) for offline development. Tests use `StaticWeather` with any
  weather they need.
- While exercise #1 is open the weather is always `clear`, so license assessments that ask for several weathers are
  clamped to 1 by `ASSESSMENT_RELAX_WEATHER=true` (see
  [14 · Assessments](14-battles-and-research.md#assessments)).

## Spawn modifiers

Encounter **conditions** are yes/no ("only at night"). **Spawn modifiers** are per-species multipliers that make a
Wildkin more or less common in each weather and time band:

```
effectiveWeight = weight × weather[env.weather] × timeOfDay[env.timeOfDay]     (missing key = ×1; 0 removes it)
```

![Spawn modifiers heatmap](images/charts/spawn-modifiers-heatmap.svg)

**Exercise #2:** `applySpawnModifiers()` in `packages/world/src/spawning.ts` currently returns the weights unchanged,
so weather and time only act through encounter-table conditions. Tests: `spawning.exercise.test.ts`. The modifiers are
applied **only when spawning** (`planSpawns`) and in the editor's Test preview, not in `/resolve`'s
`availableWildkin`. (Assessment clamping does read them: a species whose modifier is 0 in a weather can never be
observed in it.)

## Spawning lifecycle

*"Where do Wildkin come from and where do they go?"* Spawns are created lazily: every `GET /api/game/state` (the radar
polls every 10 s) runs one "tick" for that player.

```mermaid
flowchart TD
    start["GET /api/game/state"] --> bat["settleActiveBattle:<br/>end an idle (10 min) or walked-away battle"]
    bat --> pos{"tracked position exists,<br/>≤ 2 min old, not locked?<br/>(canAct)"}
    pos -- no --> empty["respond: environment/region/habitat null, spawns []"]
    pos -- yes --> env["environmentAt: weather + time zone → timeOfDay"]
    env --> ctx["resolveWorldContext(position, stage=published, env)"]
    ctx --> visit["habitat resolved? recordHabitatVisit<br/>(researcher EXP + lead exploration EXP, once a day)"]
    visit --> exp["UPDATE spawns SET status='expired'<br/>WHERE active AND expires_at ≤ now"]
    exp --> far["active spawns > 240 m away (2 × spawnRadius)<br/>→ status='fled'"]
    far --> wan["wanderSpawns: move each remaining active spawn<br/>(species deleted or left 120 m → 'fled')"]
    wan --> reg{"context.region?"}
    reg -- no --> out
    reg -- yes --> plan["planSpawns:<br/>slots = min(6, active + 2) − active<br/>pool = applySpawnModifiers(availableWildkin minus deleted species)<br/>for each slot: rollEncounter + rollLevel + randomPointNear(120 m)"]
    plan --> ins["INSERT spawns (creature, level, genome, vigor, lat/lng,<br/>region, habitat, timeOfDay, weather, expires = now + 10 min)"]
    ins --> out["respond with SpawnView[] (distance, inRange ≤ 60 m, observed,<br/>level + hints after observing, inBattle, battleLocked), POIs ≤ 300 m"]
```

```mermaid
stateDiagram-v2
    [*] --> active: planSpawns (server)
    active --> active: observed (observed_at set, stays active)
    active --> expired: 10 min passed
    active --> active: wandered a few meters
    active --> fled: player > 240 m away
    active --> fled: wandered out of the 120 m spawn radius
    active --> fled: species deleted in the Creature Manager
    active --> in_battle: POST /spawns/:id/battle
    in_battle --> captured: capsule succeeded
    in_battle --> fled: won, escaped, abandoned
    in_battle --> active: lost (fresh 10 min TTL)
    expired --> [*]
    fled --> [*]
    captured --> [*]
```

Notes:

- **At most 2 new spawns per tick** (`MAX_NEW_SPAWNS_PER_TICK` in `service.ts`), so a cleared area refills gradually.
- `randomPointNear` places points uniformly in a disc (`r = R·√u`) using a flat-earth approximation, fine at 120 m.
- Spawns belong to **one player**; two players standing together see different spawns.
- Spawn rows are never deleted; old ones stay with their final status (useful for analytics; prune later if needed).
- **Deleted species never spawn.** `availableWildkin` is filtered against the live creature list (soft-deleted
  species are not in it), even when a published encounter table still names them.
- Every new spawn gets a **level** ([Wild levels](#wild-levels)), a **genome** rolled with the spawn habitat's tags and
  a **vigor** roll ([Genetics](#genetics)), all on the server.
- An `in_battle` spawn is frozen: it is never expired, fled or wandered while the battle runs
  ([14 · Spawns during battle](14-battles-and-research.md#spawns-during-battle)).

## Wandering spawns (experimental)

> ⚠️ **Experimental (v0.2.0, kept unchanged in v0.3.0).** Wandering was added so the radar feels alive. It may be tuned
> or removed after play-testing. Everything is in one pure module plus one function in the API, so it is easy to switch
> off (see the end of this section). The only v0.3.0 change: a spawn in a battle stops wandering.

*"Wildkin shouldn't stand still like pins on a map."* On every radar poll the server moves each active spawn a little,
like an animal going about its business: it keeps a rough heading with some drift, stops now and then, and its speed
depends on its species.

**Where:** `wanderStep()` / `wander()` in `packages/world/src/wandering.ts` (pure, tested in `wandering.test.ts`),
called by `wanderSpawns()` in `apps/api/src/game/service.ts`.

### How one step works

```mermaid
flowchart TD
    s["spawn: lat, lng, heading (null = pick a random one)"] --> p{"random() &lt; pauseChance?"}
    p -- yes --> stay["stay put (keep heading)"]
    p -- no --> t["turn: heading ± random × maxTurn"]
    t --> sp["speed = profile.speedMps × (active period ? 1 : 0.35)"]
    sp --> d["distance = speed × 10 s × (0.5 to 1.5)"]
    d --> mv["offsetMeters(position, heading, distance)"]
```

The **movement style** is a field of the species (`creatures.movement_style`, chosen in the
[Creature Manager](13-creature-manager.md), default `forager`). Its profile (`WANDER_PROFILES`):

| Style | Feels like | Speed while moving | Pause chance per step | Max turn per step | Typical drift per minute* |
|---|---|---:|---:|---:|---:|
| `still` | rooted, resting, hiding | 0.05 m/s | 85 % | 180° | < 1 m |
| `skulker` | short cautious moves, long pauses | 0.35 m/s | 60 % | 120° | ~8 m |
| `forager` | slow meandering | 0.4 m/s | 35 % | 90° | ~15 m |
| `roamer` | steady travel in one general direction | 0.7 m/s | 20 % | 36° | ~35 m |
| `darter` | quick bursts with frequent stops | 1.2 m/s | 50 % | 180° | ~35 m |

\* Total path length over 6 steps in the active period; the straight-line displacement is smaller because of turns.

**Activity period.** Outside the times its `activityPattern` counts as active, a Wildkin moves at **35 %** of its
speed (`INACTIVE_SPEED_FACTOR`), so a nocturnal species found at noon mostly dozes:

| Activity pattern | Active at |
|---|---|
| `diurnal` | dawn, day |
| `nocturnal`, `sheltering_by_day` | dusk, night |
| `crepuscular` | dawn, dusk |
| `cathemeral`, `seasonal`, `TBD` | always |

Seed species: Kawi `darter`, Mimu `skulker`, Lumae `forager`, Kantar `skulker`, Riverkin `roamer`.

### How it is driven by the poll

```
each step lasts its own random time: spawnWanderStepMs (10 s) × 0.5 to 1.5   → 5 to 15 s
steps    = as many steps as fit into (now − spawn.moved_at), at most spawnWanderMaxSteps (6)
moved_at = moved_at + time those steps took   (keeps the leftover, so slow polling doesn't slow Wildkin)
           or now, when the 6-step cap was hit (a player back from a break doesn't see Wildkin teleport)
new spawn: moved_at = now − random × 10 s     (a random phase, so spawns created together don't step together)
```

**No lockstep.** Because every step has its own length and every spawn its own phase, a poll usually finds that some
Wildkin took a step and others did not, and the radar then starts each walk at its own moment (below). Wildkin move
on their own instead of all at once on the poll tick.

- After each step, if the spawn is more than `spawnRadiusM` (**120 m**) from the player's tracked position, it stops
  and is marked `fled` ("it wandered off"). The older 240 m "player walked away" rule still runs first.
- A spawn whose species has been soft-deleted is marked `fled` without moving.
- `heading` is stored on the spawn so the next poll continues the same general direction.
- All randomness goes through `deps.random`, so tests with `seededRandom()` are deterministic.

### What the player sees

The radar animates the server's positions: each marker waits its **own random delay** after a poll before walking
and walks for a time that depends on the distance (short hops are quick, long treks slower), so markers set off and
stop at different moments. They face the direction they walk, fade in and out, and "It wandered off." appears when
the selected Wildkin leaves. Details in
[06 · Radar](06-web-game.md#radar).

### Tuning or switching it off

- Speeds and pause chances: `WANDER_PROFILES` and `INACTIVE_SPEED_FACTOR` in `packages/world/src/wandering.ts`.
- Step length and catch-up cap: `GAME_RULES.spawnWanderStepMs` / `spawnWanderMaxSteps` in
  `packages/shared/src/game.ts`; how much each step's length varies: `STEP_JITTER` (0.5 = ±50 %) in `wandering.ts`.
- On-screen walk: `WALK_MIN_MS` / `WALK_MAX_MS`, `WALK_PACE_MPS` and `WALK_WINDOW_MS` in
  `apps/web/src/features/radar/RadarMap.tsx`.
- Per species: change its movement style in the Creature Manager and publish.
- To disable it entirely, skip the `wanderSpawns(...)` call in `gameState()` (keep the active spawns as they are) or
  give every species the `still` style. The database columns (`heading`, `moved_at`) are harmless if unused.

## Anti-teleport (movement checks)

*"Is this new GPS position believable given the last one?"* `checkMovement()` in `packages/world/src/movement.ts`,
called by `reportPosition()` in `apps/api/src/game/service.ts`.

```
allowed = maxSpeedMps (40) × elapsedSeconds  +  previous.accuracy  +  new.accuracy  +  jitterSlack (25 m)
accept if haversineDistance(previous, new) ≤ allowed
elapsed uses the SERVER clock; the client's timestamp is ignored
```

![Anti-teleport allowance](images/charts/anti-teleport-allowance.svg)

```mermaid
flowchart TD
    rep["POST /api/game/position {lat, lng, accuracy}"] --> L{"lockedUntil > now?"}
    L -- yes --> LOCKED["verdict: locked<br/>(nothing stored)"]
    L -- no --> A{"accuracy > 200 m?"}
    A -- yes --> LOW["verdict: low-accuracy<br/>(ignored, no strike)"]
    A -- no --> F{"previous position?"}
    F -- none --> FIRST["verdict: first-fix<br/>store, strikes = 0"]
    F -- yes --> D{"distance ≤ allowed?"}
    D -- yes --> OK["verdict: accepted<br/>store, strikes = 0<br/>walking meter (v0.3.0)"]
    D -- no --> S["strikes + 1<br/>keep old position"]
    S --> S3{"strikes ≥ 3?"}
    S3 -- no --> FAST["verdict: too-fast"]
    S3 -- yes --> LOCK["verdict: locked<br/>lockedUntil = now + 2 min"]
```

**Worked example:** last accepted fix 10 s ago at ±10 m; new fix ±10 m.
Allowed = 40 × 10 + 10 + 10 + 25 = **445 m**. Walking 14 m: accepted. Jumping 3 km: rejected, strike 1.

| Situation | Effect |
|---|---|
| Accepted move | strikes reset to 0, `lastSeenAt` updated, the segment feeds the [walking meter](#wildkin-exp-sources) |
| 3 rejected jumps in a row | locked 2 min (radar shows "Survey paused until …") |
| Locked | every report ignored until the lock expires; `canAct` false |
| Position older than 2 min | `canAct` false: no spawns, no actions (the web client heartbeats every 30 s to prevent this) |

Limits are plausibility checks, not proof: see [08 · Security](08-security.md#what-the-anti-cheat-does-not-stop).

## Acting on a spawn: Observe and Battle

Both go through `loadActionableSpawn(deps, playerId, spawnId)`:

```mermaid
flowchart LR
    a["canAct(tracked)?"] -- no --> e1["409 location_unavailable"]
    a -- yes --> b["spawn with id AND playerId?"]
    b -- no --> e2["404 not_found"]
    b -- yes --> ib["status in_battle?"]
    ib -- yes --> e5["409 in_battle"]
    ib -- no --> c["status active AND not expired?"]
    c -- no --> e3["410 gone"]
    c -- yes --> d["distance(tracked, spawn) ≤ 60 m?"]
    d -- no --> e4["409 out_of_range"]
    d -- yes --> ok["✅ proceed"]
```

**Observe** (`observeSpawn` in `apps/api/src/game/research-service.ts`), one transaction:

1. Upserts `registry_entries` (create, or `times_observed + 1`) and sets `spawns.observed_at` (first time only).
2. Reveals the spawn's **level** and its **hints** (Build, marking, and from license rank 2 Temperament; see
   [14 · Scanner depth](14-battles-and-research.md#scanner-depth)).
3. Records new times of day and weathers for the species (`condition_records`) and visible phenotypes
   (`phenotype_records`), and grants **researcher EXP** for the observation and each new record.
4. Grants the lead its **observation EXP** (once per species per day, 5 per day).

It returns the Registry view, `firstObservation`, the updated spawn, the researcher EXP gains and the lead's EXP.
Observing first also adds +0.10 to the capture chance later.

**Battle** (`POST /spawns/:id/battle`): capture now happens **inside a battle**, after weakening the Wildkin. The old
`POST /spawns/:id/capture` route and exercise #3 are retired. Everything about battles is in
[14 · Battles and research](14-battles-and-research.md).

## Registry unlocking

`registryView(creature, entry, knowledge)` in `apps/api/src/game/views.ts`:

```mermaid
stateDiagram-v2
    direction LR
    unknown: unknown, number + silhouette
    observed: observed, + name, description, habitat, field notes
    captured: captured, + rarity, activity pattern, skills, stat shape
    [*] --> unknown
    unknown --> observed: Observe
    observed --> captured: Capture (in a battle)
    unknown --> captured: Capture (also counts as observed)
```

Status is derived: no row = unknown; row with `first_captured_at` = captured; otherwise observed. Locked fields are
sent as `null`, so a player can't read them from the network tab.

Since v0.3.0 an observed species also has **field notes**: its category and body traits, for each trait the recorded
weakness and resistance or "?", the times of day and weathers it was observed in, and the phenotypes recorded ("Large
seen", "Banded markings seen"; Temperament only named from rank 2). A captured species also gets its **stat shape**
descriptors (shown inside exercise #4's captured-only section).

## Stats

*"Every species has the same total of base stats. Rarity is not strength."* A Wildkin has four stats: **HP, Attack,
Defense, Speed**. No fifth stat.

### Species stat shape

Each species has base stats `{ hp, atk, def, spd }`, integers 10 to 150 (`BASE_STAT_MIN`, `BASE_STAT_MAX`), that must
add up to exactly **`STAT_BUDGET = 300`** (`BaseStatsSchema` refuses anything else, so the Creature Manager cannot
publish such a species). A species whose stats are not authored yet battles with `FALLBACK_BASE_STATS` (75 each).
The five seed species are in [09 · Wildkin and world content](09-wildkin-and-content.md#battle-data-proposed).

### Individual stats at a level

```
hp    = round( (floor(base.hp × 2 × level / 100) + level + 10) × traitMod.hp × (1 + vigor.hp / 100) )
other = round( (floor(base.X  × 2 × level / 100) + 5)          × traitMod.X  × (1 + vigor.X  / 100) )
```

- `level` is 1 to 100. At level 50 a stat is about `base + 5`; at level 100 about `2 × base + 5`.
- `traitMod` comes from the phenotype ([Genetics](#genetics)); missing keys are 1.
- `vigor` is 0 to 5 per stat (a +0 % to +5 % bonus).
- Every stat is at least 1.
- Code: `computeStats` in `packages/world/src/stats.ts`, `individualStats(base, level, genome, vigor)` in `genetics.ts`.

**Worked examples** (Typical, Steady, vigor 0):

| Wildkin | Level | HP | ATK | DEF | SPD |
|---|---:|---|---|---|---|
| Kawi (65 / 75 / 50 / 110) | 5 | `floor(6.5) + 5 + 10` = **21** | `floor(7.5) + 5` = **12** | `5 + 5` = **10** | `floor(11) + 5` = **16** |
| Mimu (70 / 50 / 80 / 100) | 5 | 22 | 10 | 13 | 15 |
| Kantar (70 / 90 / 95 / 45) | 5 | 22 | 14 | 14 | 9 |
| Kantar | 50 | `70 + 50 + 10` = **130** | 95 | 100 | 50 |

With traits and vigor: a level 50 Kantar that is **Large and Wary** with vigor 2 everywhere has HP
`round(130 × 1.10 × 1.02)` = 146, ATK `round(95 × 0.90 × 1.02)` = 87, DEF `round(100 × 1.05 × 1.02)` = 107 and SPD
`round(50 × 0.99 × 1.02)` = 50 (Large and Wary both touch Speed: `0.90 × 1.10 = 0.99`).

When the level rises, stats are recomputed and current HP rises by the same amount max HP rose (a level-up never heals
more than that and never reduces HP). Example: a level 5 Kawi at 10 / 21 HP reaches level 6, max HP becomes
`floor(7.8) + 6 + 10` = 23, so it now has 12 / 23.

### What the player sees: descriptors, grades and vigor words

The player never sees raw stat numbers. The API sends words instead (HP is a bar, levels are numbers).

**Species shape descriptor** per stat, from the base value (`STAT_DESCRIPTORS`, `statDescriptor`):

| Base | Descriptor |
|---|---|
| 100 or more | Signature strength |
| 80 to 99 | Solid |
| 60 to 79 | Modest |
| below 60 | Weak point |

**Individual grade** per stat, from `m = traitMod × (1 + vigor / 100)` (`STAT_GRADES`, `statGrade`; shown from license
rank 2):

| m | Grade |
|---|---|
| below 0.95 | Low |
| 0.95 to 0.999 | Fair |
| 1.00 to 1.039 | Typical |
| 1.04 to 1.099 | Strong |
| 1.10 or more | Exceptional |

What that means in practice:

| Trait modifier on the stat | Example | Grade by vigor 0, 1, 2, 3, 4, 5 |
|---|---|---|
| × 1.10 | Bold ATK, Small or Wary SPD, Large HP | Exceptional at every vigor |
| × 1.05 | Large DEF | Strong ×5, then Exceptional at vigor 5 |
| × 1.00 | no trait | Typical ×4, then Strong at vigor 4 and 5 |
| × 0.99 | Large and Wary SPD | Fair, Fair, then Typical |
| × 0.945 | Large and Bold DEF | Low at vigor 0, then Fair |
| × 0.90 | Small HP, Bold DEF, Wary ATK | Low at every vigor |

**Vigor words** (0 to 5, `VIGOR_WORDS`, shown from license rank 3): Frail, Slight, Average, Sound, Robust, Exceptional.

## Genetics

*"Individuals inherit traits from their parents; extremes are rarer because they need the same variant from both."*
Code: `packages/world/src/genetics.ts`; constants in `packages/shared/src/battle.ts`.

### Genome and phenotype

Every individual has three genes (loci) with two alleles each:

| Gene | Alleles | Genotype → phenotype | Effect |
|---|---|---|---|
| Build | `S`, `L` | SS = Small, SL = Typical, LL = Large | Small: HP × 0.90, SPD × 1.10. Large: HP × 1.10, DEF × 1.05, SPD × 0.90 |
| Temperament | `B`, `W` | BB = Bold, BW = Steady, WW = Wary | Bold: ATK × 1.10, DEF × 0.90. Wary: SPD × 1.10, ATK × 0.90 |
| Marking | `+`, `m` | `mm` = the species' marking variant is expressed, anything else = normal | Cosmetic only, no stat effect |

- Trait modifiers multiply across genes (`traitModifiers`, `TRAIT_MODIFIERS`): a Large, Wary individual has SPD
  `0.90 × 1.10 = 0.99`.
- The genome is stored as JSON, for example `{ "build": ["S","L"], "temperament": ["W","W"], "marking": ["+","+"] }`
  (`spawns.genome`, `captured_wildkin.genome`). The phenotype is derived on read (`phenotype(genome)`), never stored.
- Rows migrated from v0.2.0 got `TYPICAL_GENOME` (SL, BW, ++).
- **Vigor** is stored separately (`{ hp, atk, def, spd }`, each 0 to 5, `rollVigor`: `floor(random() × 6)`). It is
  **not inherited**: it reflects how the individual developed. Migrated rows got `AVERAGE_VIGOR` (2 everywhere).

### Gene pool and `rollGenome`

Each species has a gene pool (authored in the Creature Manager, published to `creatures.gene_pool`):

```ts
GenePool = {
  build:       { pAllele /* chance each allele is L */, byHabitatTag: { tag, pAllele }[] },
  temperament: { pAllele /* chance each allele is W */, byHabitatTag: { tag, pAllele }[] },
  marking: { name /* "Banded" */, description, frequency /* 0 to 0.2, chance each allele is m */ } | null,
}
```

`rollGenome(pool, habitatTags, random)` runs on the server when a spawn is created:

1. **Build:** walk `byHabitatTag` **in authored order**; the first entry whose `tag` is in the spawn habitat's
   `habitatTags` gives `p`, otherwise `pAllele` (`alleleChance`). Roll each allele: `random() < p ? "L" : "S"`.
2. **Temperament:** the same with `W` and `B`.
3. **Marking:** a `null` pool gives `["+","+"]`; otherwise each allele is `m` with probability `frequency`.
4. A spawn with no habitat (region-wide tables only) and the starter use the defaults (`habitatTags = []`).

**Frequencies.** With allele chance `p`: the second-allele form (Large, Wary) is `p²`, the typical form `2p(1 − p)`,
the first-allele form (Small, Bold) `(1 − p)²`.

| p | Large / Wary | Typical / Steady | Small / Bold | Seed example |
|---:|---:|---:|---:|---|
| 0.30 | 9 % | 42 % | 49 % | Mimu Build |
| 0.40 | 16 % | 48 % | 36 % | Kawi Build and Temperament, Riverkin Temperament |
| 0.50 | 25 % | 50 % | 25 % | the default; Lumae Temperament |
| 0.60 | 36 % | 48 % | 16 % | Kantar in `forest-floor` habitats (Forest Edge), Lumae in `sunny` ones (Sunbreak Clearing), Kantar Temperament |
| 0.65 | 42 % | 46 % | 12 % | Riverkin in `deep-pool` habitats (none in the seed world) |
| 0.70 | 49 % | 42 % | 9 % | Mimu Temperament |
| 0.75 | 56 % | 38 % | 6 % | Kantar in `mature-woodland` (the Bible's "larger individuals deeper in mature woodland") |

A marking frequency of 0.05 expresses in `0.05² = 0.25 %` of individuals (1 in 400): rare, collectible and harmless to
balance. Carriers (`+m`) look normal; only scanner depth 4 shows them.

**Breeding groundwork.** `inheritGenome(parentA, parentB, random)` (each parent passes one random allele per locus)
exists with unit tests, but nothing calls it: breeding is deferred.

## Levels and EXP

*"The level is the bond."* Levels run 1 to 100. A captured Wildkin stores its **total EXP** (`captured_wildkin.exp`)
and its `level` (kept in sync, for queries). Code: `packages/world/src/levels.ts` and `exp.ts`.

```
totalExpForLevel(L) = L === 1 ? 0 : L³        (level 100 = 1,000,000 EXP)
levelForExp(exp)    = the largest L in 1..100 with totalExpForLevel(L) <= exp
nextLevelGap(L)     = totalExpForLevel(L + 1) − totalExpForLevel(L)   (0 at level 100)
```

![EXP curve](images/charts/exp-curve.svg)

| From level | To | EXP needed (`nextLevelGap`) | Total EXP at the start |
|---:|---:|---:|---:|
| 1 | 2 | 8 | 0 |
| 5 | 6 | 91 | 125 |
| 20 (rank 1 cap) | 21 | 1,261 | 8,000 |
| 40 (rank 2 cap) | 41 | 4,921 | 64,000 |
| 50 | 51 | 7,651 | 125,000 |
| 99 | 100 | 29,701 | 970,299 |

- A Wildkin captured at level `L` starts with `totalExpForLevel(L)` EXP (the starter: level 5, 125 EXP).
- The EXP bar on the party detail page is `levelProgress(exp, level)`: EXP into the level out of `nextLevelGap`.
- Wildkin at level 100 receive no EXP and nothing is logged.

### License cap clamp

A Wildkin can only grow as far as your Field Registry license for its category allows: the **obedience cap** is
`rank × 20` (20, 40, 60, 80, 100). **A Wildkin at its cap stops gaining EXP; anything beyond the cap is lost.**
There is no banked EXP and no level-up at rank-up: after a rank-up it simply starts gaining again from where it
stopped.

`applyExpGain(current, amount, cap)` clamps EXP to `totalExpForLevel(cap)`:

| Case | Result |
|---|---|
| Below the cap, the gain stays below it | EXP added, level from `levelForExp`, everything logged |
| The gain crosses the cap | The Wildkin reaches the cap; the rest is discarded; the logged `amount` is what was actually gained; `heldAtCap: true` |
| Already at the cap | Nothing gained, **no `exp_events` row**; the battle's `exp` event still says `heldAtCap` ("Kawi's growth is held at your license cap") |

**Worked example:** a level 19 Kawi with 7,900 EXP (level 20 starts at 8,000), Aerial rank 1 (cap 20), wins 300 EXP.
It gains **100**, reaches level 20, the other 200 are lost and the party detail page shows "Held at license cap". Its
next win gains 0. Once the Aerial license reaches rank 2 the cap is 40 and it earns EXP again.

**Restless Wildkin** (captured *above* the cap, see
[14 · Restless](14-battles-and-research.md#ranks-the-obedience-cap-and-restless-wildkin)) still gain EXP, up to the
top of their own license band: the API always passes `expCapFor(level, obedienceCap(rank))` as the cap, which is the
license cap normally and `obedienceCap(rankForLevel(level))` for a restless one. A level 25 Riverkin caught with Aquatic
rank 1 can grow to 40 (the rank 2 cap), so it never needs an even higher rank to cooperate.

### Wildkin EXP sources

All amounts are placeholders meant to be tuned after play-testing; they live in `EXP_RULES`
(`packages/shared/src/battle.ts`). Amounts are rounded down with a minimum of 1 (except at the cap: 0 and no event).

| Source (`exp_events.source`) | Who gets it | Amount | Cap |
|---|---|---|---|
| `battle` | The Wildkin that was active when the wild Wildkin fainted or was captured | `floor(60 × L_opp / 7 × gap)`, `gap = clamp(L_opp / L_self, 0.2, 1.5)` | none (battles are limited by spawns) |
| `battle-shared` | Every other non-fainted party member (restless ones included) | 50 % of the `battle` amount, or **75 %** (catch-up) if its level is 5 or more below the active Wildkin's | none |
| `walking` | The lead | 1 % of the lead's `nextLevelGap` per full 100 m walked | 30 units a day (3 km) |
| `observation` | The lead | 3 % of `nextLevelGap` for the first observation of each species per day | 5 per day |
| `exploration` | The lead | 5 % of `nextLevelGap` for the first visit of each habitat per day | 5 per day |
| `capture` | The lead | 10 % of `nextLevelGap` per successful capture | none |

Functions: `battleExp`, `sharedBattleExp`, `walkingExp`, `observationExp`, `explorationExp`, `captureExp`,
`levelGapFactor` in `packages/world/src/exp.ts`. The battle sources are awarded by `awardBattleExp` in
`battle-service.ts`, the others where the action happens (`reportPosition`, `observeSpawn`, `recordHabitatVisit`,
`captureWildkin`), always through `grantWildkinExp` in `apps/api/src/game/wildkin.ts`.

**Battle EXP worked examples** (`L_self` is the active Wildkin's level at the start of the battle):

| Active | Beats | gap | Amount | Others in the party |
|---:|---:|---:|---:|---|
| level 5 | level 5 | 1.0 | `60 × 5 / 7` = **42** | 21 each (50 %), or 31 (75 %) for a member 5+ levels below the active one |
| level 5 | level 7 | 1.4 | `60 × 7 / 7 × 1.4` = **84** | 42 |
| level 5 | level 12 (a Silayan Riverkin) | 1.5 (capped from 2.4) | **154** | 77 |
| level 30 | level 5 | 0.2 (capped from 0.17) | `60 × 5 / 7 × 0.2` = **8** | 4 |
| level 20 | level 20 | 1.0 | **171** | 85 |

Gap scaling is what makes beating much weaker Wildkin worth very little.

**Lead-share sources** at three lead levels:

| Lead level | `nextLevelGap` | walking per 100 m | observation | exploration | capture |
|---:|---:|---:|---:|---:|---:|
| 5 | 91 | 1 | 2 | 4 | 9 |
| 20 | 1,261 | 12 | 37 | 63 | 126 |
| 50 | 7,651 | 76 | 229 | 382 | 765 |

So a level 20 lead can earn at most 360 a day from walking, 185 from observation and 315 from exploration.

**Walking** is measured in `reportPosition` (`walk` in `apps/api/src/game/service.ts`, `advanceWalkMeter` in
`exp.ts`): the distance between two consecutive **accepted** fixes, **counting only segments slower than 3 m/s** (so
driving earns nothing). A per-player meter (`players.walk_meter_m`, `walk_meter_day`) runs for the day; each time it
passes a full 100 m the lead gets one unit, and the meter itself is the 30-unit cap (one `walking` event per report,
`meta.units`). A new day starts a fresh meter.

**Target split** (a design goal to check after play-testing, not a rule in the code): battles about 40 %, walking
about 25 %, observation and exploration about 20 %, captures about 15 %. Use the [SQL below](#exp-log-and-the-split-by-source)
to compare.

### Daily caps, rested bonus and day keys

- **Daily caps** are counted from `exp_events` (`countToday`: count by player, source and day key), so there is no
  counter table. Observation: no earlier `observation` event today with `meta.creatureId` of this species, and fewer
  than 5 today. Exploration: the habitat visit is the first today (`habitat_visits` primary key) and fewer than 5
  `exploration` events today. A gain that is clamped to 0 at the cap logs nothing, so it does not use up the cap.
- **Rested bonus.** One rested charge per **2 hours** since the player's last `battle` EXP (or since the account was
  created), up to **10** charges. Each won or captured battle spends one charge and **doubles** that battle's `battle`
  and `battle-shared` amounts (`meta.rested: true`). Stored as `players.rested_charges` and `last_battle_exp_at`,
  computed lazily by `restedCharges(stored, since, now)`; every won battle sets `last_battle_exp_at = now`.
  Example: a new player's first win 5 hours after signing up has 2 charges, so that win and the next one are doubled.
- **Day keys.** Every daily rule uses the player's local date, `dayKey(date, timeZone)` = `"YYYY-MM-DD"`, in their
  time zone (`player_positions.time_zone`, else `WORLD_TIMEZONE`; `playerDayKey` in `apps/api/src/game/common.ts`). An
  unknown zone falls back to the UTC date. Example: 00:30 on 22 October in Manila is 16:30 UTC on the 21st, and the
  day key is `2026-10-22`. Daily pickups and habitat visits use the same key.

### EXP log and the split by source

**Every** EXP gain, Wildkin or researcher, is one row in `exp_events`:

| Column | Meaning |
|---|---|
| `player_id` | whose EXP |
| `track` | `wildkin` or `researcher` (CHECK) |
| `captured_wildkin_id` | the Wildkin (Wildkin track), else null |
| `category` | the license category (researcher track), else null |
| `source` | `WILDKIN_EXP_SOURCES` or `RESEARCHER_EXP_SOURCES` |
| `amount` | what was actually gained, always above 0 (CHECK) |
| `day_key` | the player's local day |
| `created_at` | when |
| `meta` | JSON, e.g. `{ "battleId": "…", "opponentLevel": 7, "rested": true, "newLevel": 8 }` |

Index: `(player_id, day_key, source)`. Researcher sources are listed in
[14 · Researcher EXP](14-battles-and-research.md#researcher-exp).

**The split of EXP by source for the last 7 days**, as a percentage of each track (run it with
`psql postgres://postgres:postgres@localhost:5432/wildbound` or `docker compose exec db psql -U postgres wildbound`):

```sql
SELECT track,
       source,
       SUM(amount)                                                                 AS exp,
       COUNT(*)                                                                    AS events,
       ROUND(100.0 * SUM(amount) / SUM(SUM(amount)) OVER (PARTITION BY track), 1) AS pct_of_track
FROM exp_events
WHERE created_at >= now() - interval '7 days'
GROUP BY track, source
ORDER BY track, exp DESC;
```

The Wildkin track grouped like the target split:

```sql
SELECT CASE source
         WHEN 'battle'        THEN 'battles'
         WHEN 'battle-shared' THEN 'battles'
         WHEN 'observation'   THEN 'observation + exploration'
         WHEN 'exploration'   THEN 'observation + exploration'
         ELSE source
       END                                                       AS target_group,
       SUM(amount)                                               AS exp,
       ROUND(100.0 * SUM(amount) / SUM(SUM(amount)) OVER (), 1) AS pct
FROM exp_events
WHERE track = 'wildkin'
  AND created_at >= now() - interval '7 days'
GROUP BY 1
ORDER BY exp DESC;
```

Add `AND player_id = '…'` for one player, or group by `day_key` instead of filtering on `created_at` to see players'
local days.

## Wild levels

*"Players are pushed to observe in areas that are too strong for them until they level up."*

**Authoring** (Map Editor, see [05](05-map-editor.md)):

- Every encounter table has `minLevel` and `maxLevel` (1 to 100, `minLevel <= maxLevel`; new tables default to 1 to
  10, `DEFAULT_WILD_LEVELS`).
- Every entry may override with its own `minLevel` and `maxLevel` (both set or both null). The **effective range** of
  an entry is its override, else its table's range (`effectiveLevelRange`).
- Validation (`packages/world/src/validation.ts`, plus database CHECKs):

| Rule (`code`) | Severity |
|---|---|
| `invalid-level-range`: min > max, outside 1 to 100, or only one override bound set | blocks saving (schema) |
| `level-range-crosses-band`: an effective range crosses a license band (levels 1 to 20, 21 to 40, ...; for example 18 to 24) | warning |
| `region-without-entry-habitat`: an active region where no habitat has an active table with an entry starting at level 10 or below (`ENTRY_HABITAT_MAX_LEVEL`) | warning |

Design rule: **every region needs an easy entry habitat**, because players do not choose where they live.

**Resolution.** Each available Wildkin carries `levelBands: { minLevel, maxLevel, weight }[]`, one band per available
entry for it across the applicable tables. `planSpawns` rolls the creature first, then `rollLevel(bands, random)` picks
one band by weight and a level uniformly in `[minLevel, maxLevel]`. The level is stored on the spawn
(`spawns.level`), shown after observing, and a captured Wildkin **keeps** it.

**Seed world:** Forest Edge 2 to 6, Sunbreak Clearing 3 to 8, Silayan Creekside 4 to 10 with Riverkin overridden to 5
to 12. All are within license rank 1 (cap 20), so a new player can battle everything in Mabunyi.

## Healing

*"Everything you weaken, you treat."*

### HP storage and natural recovery

`captured_wildkin` stores `current_hp` and `hp_updated_at`; the real HP is computed when read (the same lazy pattern
as wandering's `moved_at`), by `currentHp(row, maxHp, now, restless)` in `packages/world/src/recovery.ts`:

```
restless: hp = current_hp                                                   (frozen: no first aid)
else:     hp = min(maxHp, floor(current_hp + maxHp × (now − hp_updated_at) / NATURAL_RECOVERY_FULL_MS))
```

`BATTLE_RULES.naturalRecoveryFullMs` = **8 hours** from empty to full. Example: a Kantar with 22 max HP that fainted
(0 HP) two hours ago has `floor(22 × 2 / 8)` = 5 HP. The detail page's "Fully recovered in about …" is
`msUntilFull(hp, maxHp)`.

> **Exercise #13:** `currentHp` currently returns the stored HP, so there is no natural recovery yet; vets and Trail
> Rations still heal.

`current_hp` and `hp_updated_at = now` are written whenever HP changes: every battle turn, a Trail Ration, a vet, a
level-up (HP rises by the max-HP increase), so recovery always continues from the last write. When a rank-up makes a
restless Wildkin cooperate, its `hp_updated_at` is reset to now in the same transaction, so it does not heal
retroactively for the time it was frozen.

A Wildkin at 0 HP is **fainted**: it cannot battle until it recovers above 0. A party with nobody usable is refused a
battle with 409 `no_usable_wildkin` ("Your party needs rest: visit a vet or let first aid work").

### Vets

- **Field stations** are POIs of type `research-station` or `gate` (`FIELD_STATION_TYPES`; East Research Gate in the
  seed world).
- `POST /api/game/stations/:poiId/heal` (`visitVet` in `care-service.ts`): you must be within `interactRadiusM` (60 m)
  of the POI, by the server-side position and the published world. It heals **every** non-restless Wildkin you own
  (party and storage) to full, instantly and for free.
- Restless Wildkin are listed in the response as untreated: "Cannot be treated yet: needs Aquatic rank 2".
- Refusals: 404 (no such POI), 409 `not_a_station`, `out_of_range`, `battle_in_progress`, `location_unavailable`.
- Walking to a station is the cost of losing a battle; natural recovery means nobody is ever hard-stuck.

### Trail Ration

Heals `max(1, floor(maxHp × 0.25))` (`BATTLE_RULES.trailRationHeal`), never above max HP. In a battle it is the
`item` action (uses the turn); outside, `POST /api/game/items/trail-ration/use { wildkinId }` (`useItem`). Not usable
on restless Wildkin (409 `restless`); other refusals: `full_hp`, `no_items`, `battle_in_progress` (outside a running
battle). Only Trail Rations can be used this way (400 for other items).

## Inventory, items and daily pickups

- Items are defined in code (`ITEMS` in `packages/shared/src/game.ts`); the DB only stores `(player, item, quantity)`.
  New players get `STARTER_INVENTORY` (10 Field Capsules, 3 Trail Rations, the Field Notebook) inside the login upsert.
- Quantities can't go negative (DB CHECK), which also protects against races. Items are spent with a conditional
  `updateMany ... quantity > 0` inside the action's transaction.
- **Stack cap:** at most `ITEM_STACK_MAX` = 30 of one item. Grants above it are truncated and the response says so
  (`grantItems` in `care-service.ts`).
- There is no currency and no shop. Items come from the starter inventory, [rank-up grants](14-battles-and-research.md#rank-up-grants)
  and daily pickups.

| Id | Name | Category | Use |
|---|---|---|---|
| `field-capsule` | Field Capsule | capture | Any Wildkin, no bonus |
| `canopy-capsule` | Canopy Capsule | capture | +0.15 capture chance on Aerial Wildkin |
| `current-capsule` | Current Capsule | capture | +0.15 on Aquatic |
| `burrow-capsule` | Burrow Capsule | capture | +0.15 on Terrestrial |
| `bloom-capsule` | Bloom Capsule | capture | +0.15 on Verdant |
| `trail-ration` | Trail Ration | field | Heals 25 % of max HP |
| `field-notebook` | Field Notebook | key | Flavour (your research ledger) |

Every capture item is spent on the attempt, success or not.

**Daily POI pickups.** Any POI can be searched once per player per day (`poi_pickups`, keyed by player, POI and day
key) within 60 m. The loot roll is pure, `rollPickup(poiType, random)` in `packages/world/src/pickups.ts`
(`PICKUP_RULES`):

| Roll | Chance | Loot |
|---|---:|---|
| always | 100 % | 2 Field Capsules |
| extra capsule | 50 % | +1 Field Capsule |
| ration | 30 % | 1 Trail Ration |
| category capsule | 15 % | 1 by POI type: `water` → Current, `clearing` → Bloom, `hollow` → Burrow, `trail` → Canopy, other types → none |

> **Exercise #14:** the route `POST /api/game/pois/:poiId/collect` still returns 501; the radar's POI sheet says
> searching is not built yet. `rollPickup` is finished.

## Party, lead and starter

- Party = `captured_wildkin.party_slot` 0 to 5; `NULL` = storage. The unique `(player_id, party_slot)` index means
  rearranging must clear slots first, then assign (exercise #7 explains this). A new capture goes to the first free
  slot, else storage.
- **The lead** is party slot 0 if it can battle (HP above 0 and not restless), else the first party member by slot
  that can (`pickLead` in the engine, `leadOf` in `wildkin.ts`). Battles start with the lead, and walking,
  observation, exploration and capture EXP go to it. Until exercise #7 (rearranging) is done, slot order is capture
  order.
- **Starter.** A player with no captured Wildkin is sent to `/play/starter` and chooses Kawi, Mimu or Kantar
  (`STARTER_SPECIES`) at level 5 (`STARTER_LEVEL`): genome rolled with the default gene pool odds (no habitat), vigor
  rolled, full HP, party slot 0. `POST /api/game/starter` refuses with 409 `already_has_wildkin` once the player owns
  any Wildkin.

## World validation

Two levels, both in `packages/world/src/validation.ts`:

| Level | Function | Blocks | Rules |
|---|---|---|---|
| Schema | `schemaIssues(input)` | saving (400) | Zod: shapes, slugs, closed rings, ≥ 3 distinct vertices, weight range, coordinate range, limits, level ranges |
| Integrity | `checkIntegrity(doc, creatureIds)` | saving (400) | duplicate ids; duplicate region slugs (world) / habitat & POI slugs (per region); missing parent region/habitat; table's habitat in another region; unknown Wildkin; duplicate entry ids; self-intersecting boundaries |
| Publish | `validateWorld(doc, creatureIds)` = integrity + the rows below | publishing (409) when any **error** | see below |

| Rule (`code`) | Severity |
|---|---|
| `habitat-outside-region`: more than 50 % of a habitat outside its region | error |
| `poi-outside-region` | error |
| `empty-encounter-table`: active table with no entries | error |
| `habitat-partially-outside-region`: more than 1 % outside | warning |
| `habitats-overlap`: overlap > 1 m² in the same region (smaller wins) | warning |
| `region-without-habitats` | warning |
| `habitat-without-encounters` | warning |
| `duplicate-creature-entry`: same Wildkin twice in a table | warning |
| `no-active-region` | warning |
| `level-range-crosses-band`, `region-without-entry-habitat` | warning (see [Wild levels](#wild-levels)) |

Geometry checks use Turf (`isSimpleArea`, `fractionOutside`, `overlapSquareMeters`, `pointInArea`), with a 1 m²
tolerance for digitizing noise. The database's `ST_IsValid` CHECK is the final backstop.

## All tunable numbers

Every number below is a constant, so changing it is a one-line edit. `shared/` is `packages/shared/src/`, `world/` is
`packages/world/src/`, `api/` is `apps/api/src/`.

### `GAME_RULES` and other world constants

| Constant object | Key | Value | Meaning | File |
|---|---|---|---|---|
| `GAME_RULES` | `spawnRadiusM` | 120 m | Spawns are placed within this distance; battles end `escaped` beyond it; "fled" distance is 2× this | `shared/game.ts` |
| `GAME_RULES` | `interactRadiusM` | 60 m | Observe, battle, vets, assessments, pickups need this distance | `shared/game.ts` |
| `GAME_RULES` | `poiRadiusM` | 300 m | POIs listed on the radar (v0.3.0) | `shared/game.ts` |
| `GAME_RULES` | `maxActiveSpawns` | 6 | Most Wildkin on the radar at once | `shared/game.ts` |
| `GAME_RULES` | `spawnTtlMs` | 10 min | Spawn lifetime (also the fresh TTL after a lost battle) | `shared/game.ts` |
| `GAME_RULES` | `spawnWanderStepMs` | 10 s | One wandering step per interval | `shared/game.ts` |
| `GAME_RULES` | `spawnWanderMaxSteps` | 6 | Catch-up steps after a gap between polls | `shared/game.ts` |
| `GAME_RULES` | `maxSpeedMps` | 40 m/s | Anti-teleport speed limit | `shared/game.ts` |
| `GAME_RULES` | `maxAccuracyM` | 200 m | Fixes worse than this are ignored | `shared/game.ts` |
| `GAME_RULES` | `jitterSlackM` | 25 m | GPS wobble always allowed | `shared/game.ts` |
| `GAME_RULES` | `strikesBeforeLock` | 3 | Rejected jumps before a lock | `shared/game.ts` |
| `GAME_RULES` | `lockMs` | 2 min | Lockout | `shared/game.ts` |
| `GAME_RULES` | `positionStaleMs` | 2 min | How long a position counts as current (keep above the 30 s heartbeat) | `shared/game.ts` |
| `GAME_RULES` | `sessionTtlMs` | 30 days | Login lifetime | `shared/game.ts` |
| `ITEM_STACK_MAX` | | 30 | Most of one item; grants above it are truncated | `shared/game.ts` |
| `STARTER_INVENTORY` | | 10 Field Capsules, 3 Trail Rations, 1 Field Notebook | New players' items | `shared/game.ts` |
| `STARTER_SPECIES`, `STARTER_LEVEL` | | Kawi, Mimu, Kantar; 5 | The ranger's gift | `shared/game.ts` |
| `FIELD_STATION_TYPES` | | `research-station`, `gate` | POI types with a vet and assessments | `shared/game.ts` |
| `DEFAULT_WILD_LEVELS` | | 1 to 10 | Wild levels of a new encounter table | `shared/world.ts` |
| `ENTRY_HABITAT_MAX_LEVEL` | | 10 | "Easy entry habitat" threshold for `region-without-entry-habitat` | `world/validation.ts` |
| `WANDER_PROFILES`, `INACTIVE_SPEED_FACTOR`, `STEP_JITTER` | | see [Wandering](#wandering-spawns-experimental) | Wandering speeds and pauses | `world/wandering.ts` |
| `MAX_NEW_SPAWNS_PER_TICK` | | 2 | Refill speed | `api/game/service.ts` |
| Weather cache | | 10 min, 0.01° cells | Fewer Open-Meteo calls, staler weather | `api/weather.ts` |
| Radar poll | | 10 s | Refill speed, load | `apps/web/src/lib/queries.ts` |
| Report throttle / heartbeat | | 4 s or 8 m / 30 s | Position reports | `apps/web/.../usePositionReporter.ts` |
| Time-of-day boundaries | | 5 / 7 / 17 / 19 h | Bands | `world/conditions.ts` |
| Habitat outside thresholds | | 50 % error, 1 % warning | Validation | `world/validation.ts` |
| POI radius default / max / limit | | 300 m / 5000 m / 25 | `/resolve` POI lookup | `shared/constants.ts` |
| `ASSESSMENT_RELAX_WEATHER` (env) | | `true` | Clamp weather assessment requirements to 1 while exercise #1 is open | `api/config.ts`, `.env.example` |

### Stats and genetics

| Constant object | Key | Value | Meaning | File |
|---|---|---|---|---|
| `STAT_BUDGET` | | 300 | Sum of every species' base stats | `shared/battle.ts` |
| `BASE_STAT_MIN`, `BASE_STAT_MAX` | | 10, 150 | Range of one base stat | `shared/battle.ts` |
| `STAT_DESCRIPTORS` | | 100 / 80 / 60 / 0 | Signature strength / Solid / Modest / Weak point | `shared/battle.ts` |
| `STAT_GRADES` | | 1.10 / 1.04 / 1.00 / 0.95 / 0 | Exceptional / Strong / Typical / Fair / Low | `shared/battle.ts` |
| `VIGOR_MAX`, `VIGOR_WORDS` | | 5; Frail to Exceptional | Vigor range and words | `shared/battle.ts` |
| `TRAIT_MODIFIERS` | `build.small` | HP 0.90, SPD 1.10 | Small | `shared/battle.ts` |
| `TRAIT_MODIFIERS` | `build.large` | HP 1.10, DEF 1.05, SPD 0.90 | Large | `shared/battle.ts` |
| `TRAIT_MODIFIERS` | `temperament.bold` | ATK 1.10, DEF 0.90 | Bold | `shared/battle.ts` |
| `TRAIT_MODIFIERS` | `temperament.wary` | SPD 1.10, ATK 0.90 | Wary | `shared/battle.ts` |
| `DEFAULT_GENE_POOL` | | build 0.5, temperament 0.5, no marking | Gene pool of a new species | `shared/battle.ts` |
| `MARKING_FREQUENCY_MAX` | | 0.2 | Highest marking allele frequency | `shared/battle.ts` |
| `FALLBACK_BASE_STATS` | | 75 / 75 / 75 / 75 | Stats of a species without authored base stats | `world/genetics.ts` |
| `LEVEL_MIN`, `LEVEL_MAX` | | 1, 100 | Level range | `shared/battle.ts` |

### `EXP_RULES` (Wildkin EXP)

| Constant object | Key | Value | Meaning | File |
|---|---|---|---|---|
| `EXP_RULES` | `battleBase`, `battleDivisor` | 60, 7 | `battle = floor(60 × L_opp / 7 × gap)` | `shared/battle.ts` |
| `EXP_RULES` | `gapMin`, `gapMax` | 0.2, 1.5 | `gap = clamp(L_opp / L_self, 0.2, 1.5)` | `shared/battle.ts` |
| `EXP_RULES` | `sharedShare` | 0.5 | `battle-shared` share | `shared/battle.ts` |
| `EXP_RULES` | `catchUpShare`, `catchUpLevelGap` | 0.75, 5 | Catch-up share for members 5+ levels below the active Wildkin | `shared/battle.ts` |
| `EXP_RULES` | `walkingShare`, `walkingUnitM`, `walkingUnitsPerDay` | 0.01, 100 m, 30 | 1 % of `nextLevelGap` per 100 m, 3 km a day | `shared/battle.ts` |
| `EXP_RULES` | `walkingMaxSpeedMps` | 3 m/s | Only slower segments count | `shared/battle.ts` |
| `EXP_RULES` | `observationShare`, `observationsPerDay` | 0.03, 5 | Observation EXP | `shared/battle.ts` |
| `EXP_RULES` | `explorationShare`, `explorationsPerDay` | 0.05, 5 | Exploration EXP | `shared/battle.ts` |
| `EXP_RULES` | `captureShare` | 0.1 | Capture EXP | `shared/battle.ts` |
| `EXP_RULES` | `restedChargeMs`, `restedMaxCharges` | 2 h, 10 | Rested charges (the DB CHECK `players_rested_charges_range` also says 0 to 10) | `shared/battle.ts` |
| `EXP_RULES` | `restedMultiplier` | 2 | Rested battles double battle EXP | `shared/battle.ts` |

### `BATTLE_RULES`, matchups, attacks and statuses

| Constant object | Key | Value | Meaning | File |
|---|---|---|---|---|
| `BATTLE_RULES` | `turnOrderExponent` | 1 | `k` in `SPD_A^k / (SPD_A^k + SPD_B^k)`; raise to 2 if Speed matters too little | `shared/battle.ts` |
| `BATTLE_RULES` | `escapeBase`, `escapeSpeedWeight`, `escapePerAttempt`, `escapeMax` | 0.20, 0.60, 0.10, 0.95 | Escape chance | `shared/battle.ts` |
| `BATTLE_RULES` | `dodgeMax`, `dodgeWeight` | 0.10, 0.20 | Dodge chance | `shared/battle.ts` |
| `BATTLE_RULES` | `damageRandomMin`, `damageRandomMax` | 0.85, 1.00 | Damage random factor | `shared/battle.ts` |
| `BATTLE_RULES` | `captureMax` | 0.95 | Capture chance cap | `shared/battle.ts` |
| `BATTLE_RULES` | `captureRarityBase` | common 0.25, uncommon 0.15, rare 0.08, TBD 0.20 | Base capture chance | `shared/battle.ts` |
| `BATTLE_RULES` | `captureObservedBonus` | 0.10 | Observed before the battle | `shared/battle.ts` |
| `BATTLE_RULES` | `captureHpWeight` | 0.45 | Weight of missing HP | `shared/battle.ts` |
| `BATTLE_RULES` | `categoryCapsuleBonus` | 0.15 | Category capsule on a match | `shared/battle.ts` |
| `BATTLE_RULES` | `idleTimeoutMs` | 10 min | Idle battles are abandoned | `shared/battle.ts` |
| `BATTLE_RULES` | `trailRationHeal` | 0.25 | Share of max HP a Trail Ration heals | `shared/battle.ts` |
| `BATTLE_RULES` | `naturalRecoveryFullMs` | 8 h | Natural recovery, empty to full | `shared/battle.ts` |
| `MATCHUP_WEAK`, `MATCHUP_RESIST` | | 1.5, 0.67 | Matchup multipliers | `shared/battle.ts` |
| `MATCHUPS` | per body trait | see [14 · Matchups](14-battles-and-research.md#matchups) | Weak, resist, reason, field-note lines | `shared/battle.ts` |
| `ATTACK_POWER_MIN`, `ATTACK_POWER_MAX`, `MAX_ATTACKS` | | 30, 60, 2 | Placeholder attacks | `shared/battle.ts` |
| `POWER_WORDS` | | 50 Heavy / 40 Moderate / 0 Light | Power shown as a word | `shared/battle.ts` |
| `FALLBACK_ATTACK` | | Lunge, strike, 35 | Attack of a species without one | `world/battle/engine.ts` |
| `STATUS_RULES` | `asleep` | 1 to 3 turns, skip 100 %, +0.20 | Cannot attack | `shared/battle.ts` |
| `STATUS_RULES` | `stunned` | 1 turn, skip 100 %, +0.15 | Cannot attack | `shared/battle.ts` |
| `STATUS_RULES` | `entangled` | 2 to 4 turns, trapped, +0.15 | Cannot switch or escape | `shared/battle.ts` |
| `STATUS_RULES` | `numbed` | 2 to 4 turns, skip 25 %, +0.10 | May lose its attack | `shared/battle.ts` |
| `STATUS_RULES` | `exhausted` | 3 turns, ATK × 0.75, +0.10 | Weaker attacks | `shared/battle.ts` |

### `RESEARCH_RULES`, licenses and pickups

| Constant object | Key | Value | Meaning | File |
|---|---|---|---|---|
| `RESEARCH_RULES` | `levelsPerRank` | 20 | Obedience cap = rank × 20 | `shared/research.ts` |
| `RESEARCH_RULES` | `rankThresholds` | 2: 600, 3: 2,000, 4: 5,000, 5: 12,000 | Cumulative researcher EXP to take each assessment | `shared/research.ts` |
| `RESEARCH_RULES` | `firstObservation`, `repeatObservation`, `repeatObservationsPerSpeciesPerDay` | 100, 10, 5 | Observation researcher EXP | `shared/research.ts` |
| `RESEARCH_RULES` | `firstCapture`, `repeatCapture` | 150, 20 | Capture researcher EXP | `shared/research.ts` |
| `RESEARCH_RULES` | `conditionRecord` | 30 | New time of day or weather for a species | `shared/research.ts` |
| `RESEARCH_RULES` | `matchupRecord` | 50 | New body trait and approach pair | `shared/research.ts` |
| `RESEARCH_RULES` | `phenotypeRecord`, `markingRecord` | 40, 200 | New phenotype / marking variant | `shared/research.ts` |
| `RESEARCH_RULES` | `habitatFirstVisit`, `habitatDailyVisit` | 50, 10 | Habitat visits (split by category) | `shared/research.ts` |
| `RESEARCH_RULES` | `grantCategoryCapsules`, `grantFieldCapsules` | 5, 3 | Rank-up grants | `shared/research.ts` |
| `LICENSE_MIN_RANK`, `LICENSE_MAX_RANK` | | 1, 5 | License ranks | `shared/research.ts` |
| `SCANNER_DEPTH` | | build 1, temperament 2, grades 2, vigor 3, genotype 4 | Rank at which each detail is shown | `shared/research.ts` |
| `ASSESSMENTS` | | see [14 · Assessments](14-battles-and-research.md#assessments) | Rank-up checklists | `shared/research.ts` |
| `PICKUP_RULES` | `fieldCapsules`, `extraFieldCapsuleChance`, `trailRationChance`, `categoryCapsuleChance` | 2, 0.5, 0.3, 0.15 | Daily POI pickup loot | `world/pickups.ts` |
| `PICKUP_CATEGORY_CAPSULE` | | water, clearing, hollow, trail | POI type → category capsule | `world/pickups.ts` |

Changing a value in `packages/shared` affects client and server at once (the web app imports `GAME_RULES` to draw the
range ring and accuracy limit). Re-run `pnpm test` (several tests assert these numbers) and regenerate the charts
(`node docs/images/generate-charts.mjs`) if you change the movement formula, the EXP curve or the turn-order
exponent. Recipes: [11 · Tune EXP](11-cookbook.md#tune-exp) and [11 · Tune a game rule](11-cookbook.md#tune-a-game-rule).

Next: [08 · Security model](08-security.md).
