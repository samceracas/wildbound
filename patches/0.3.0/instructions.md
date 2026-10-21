# State: Not implemented
# Overview
Version 0.3.0 adds the core of WILDBOUND's creature systems: **stats, genetics, levels and EXP, wild battles, capture through battle, healing, and Field Registry licenses**. It turns the Wildkin from Registry entries into individuals the player raises, battles with and studies.

This brief was written from a design session with the project owner. The reader of this file has **no other context**, so everything needed is written down here: the design decisions, the exact formulas and constants, the content for the five existing Wildkin, the lore and canon changes, and the technical changes per package and app. Read the whole file before starting, then read `docs/README.md` and the pages it points to for how the monorepo works today (v0.2.0).

What WILDBOUND is, in one paragraph: a location-aware creature-collecting and field-research game. The player's real GPS position decides which fictional region and habitat they are in, and live weather and local time decide which **Wildkin** (the game's creatures) appear on a radar. The player **observes** Wildkin to fill a **Registry** (like a Pokédex) and **captures** them into a **Party** of six. The monorepo has four apps: a Map Editor (`apps/editor`), a Creature Manager (`apps/manager`), the player web game (`apps/web`) and an Express + Prisma API (`apps/api`), plus shared packages (`packages/shared` for Zod contracts, `packages/world` for pure game rules, `packages/db` for Prisma, migrations and seed data). The creative canon lives in `docs/WILDBOUND_*.docx` and `docs/lore/assistant-brief.md`.

What is **in** 0.3.0:
- Species stat shapes (HP, Attack, Defense, Speed) with an equal stat budget for every species.
- Individual genetics: two inherited genes with alleles (Build, Temperament), one cosmetic Marking gene, and a non-inherited per-stat Vigor roll. The groundwork for breeding, which itself is deferred.
- Levels 1 to 100 (the level *is* the bond), an EXP curve, multiple EXP sources with anti-grind rules, and an EXP log.
- Level ranges for wild Wildkin, authored per encounter table (with per-entry overrides) in the Map Editor.
- Pokémon-style, turn-based, server-authoritative **wild battles** with one active Wildkin per side. Capture now happens inside a battle, after weakening the Wildkin.
- **Placeholder attacks** (one or two per species) so damage, matchups and capture work. The real skill system comes in 0.4.0.
- Matchups between attack **approaches** and species **body traits**, hidden until discovered in battle and recorded in the Registry.
- A **status framework** (Asleep, Stunned, Numbed, Entangled, Exhausted) with its effects and capture bonus, but nothing inflicts statuses yet.
- First aid and slow natural recovery, instant free healing by vets at field stations.
- **Field Registry licenses**: one per Wildkin category (Aerial, Aquatic, Terrestrial, Verdant), five ranks, researcher EXP, rank-up assessments, an obedience level cap, restless Wildkin, license-locked habitats, category capsules.
- A currency-free item supply: daily POI pickups and license rank-up grants.
- Lore and canon updates for all of the above.
- New "fill in the blanks" exercises (`TODO(you)`) for the project owner, like v0.1.0.

What is **out** of 0.3.0 (do not build): the skill system (learning, effect vocabulary, passives, PP or cooldowns), NPC friendly battles, battles against other players, currency and shops, breeding, evolutions, minigames, bond descriptors, Temperament-driven wild AI, tracking or longer observe range from licenses, the Phaser field view. See [Deferred](#deferred-do-not-build-in-030).

Wandering spawns (experimental in 0.2.0) are **kept as they are**. The only change is that a spawn in a battle stops wandering and stops expiring (see [Spawns during battle](#spawns-during-battle)).

# Open decisions (confirm before implementing)
These gaps were not settled in the design session. Each has a recommended default, which this brief uses everywhere. **Ask the project owner to confirm or change them before starting**, as the implementation notes require.

1. **Starter Wildkin.** Capture now needs a battle, and a battle needs a Wildkin, so a brand-new player could never capture anything. *Recommended:* the first time a player with no captured Wildkin enters `/play`, they choose one of **Kawi, Mimu or Kantar at level 5** on a new starter screen. Lore (PROPOSED): the ranger at East Research Gate entrusts each new license holder with a Registry-raised Wildkin that grew up around the rangers. Existing players with no Wildkin see the same screen.
2. **What happens when a Wildkin reaches its license cap.** The obedience cap is `rank × 20`. If a Wildkin kept leveling past the cap it would turn restless by itself, which punishes the player for battling. *Recommended:* **EXP keeps accumulating, but the level is held at the cap.** When the license ranks up, the Wildkin immediately levels up to whatever its banked EXP allows (up to the new cap). Only Wildkin *captured* above the cap are restless.
3. **Matchup discoveries are recorded per body trait, not per species.** Learning "Plated is weak to Crush" applies to every Plated species. *Recommended:* per trait.
4. **Scanner depth.** *Recommended:* how much the player sees about a captured individual (stat grades, vigor, genotype) depends on their license rank in its category (see [Scanner depth](#scanner-depth)). It is view filtering only and gives license ranks a visible meaning in 0.3.0.
5. **Weather-based assessment requirements vs. exercise #1.** Exercise #1 (`weatherFromWmoCode`) is still unimplemented, so live weather is always `clear` and "observe in 3 different weather conditions" is impossible. *Recommended:* add an env flag `ASSESSMENT_RELAX_WEATHER` (default `true` while exercise #1 is open) that clamps weather requirements to 1. Document it in the exercise.

## Answers (confirmed by the project owner, 2026-10-21)
1. **Starter Wildkin: confirmed as recommended.** Kawi, Mimu or Kantar at level 5 on `/play/starter`; the ranger lore goes into the First Field Survey appendix.
2. **License cap: CHANGED. A Wildkin at its license cap stops gaining EXP; anything beyond the cap is lost.** EXP is clamped to `totalExpForLevel(cap)`: a gain that would cross the cap raises the Wildkin to the cap and the rest is discarded (the logged `amount` is what was actually gained). A Wildkin already at the cap gains nothing and no event is logged. After a license rank-up it simply starts gaining EXP again from where it stopped (there is no banked EXP to level from). Only Wildkin *captured* above the cap are restless; they still "receive EXP normally", up to the top of their own license band (a restless level 25 Wildkin can grow to 40, the rank 2 cap; `expCapFor` in `packages/world/src/levels.ts`). Everywhere this brief says "held at the cap" or "banked EXP", read it this way.
3. **Matchups per body trait: confirmed.**
4. **Scanner depth by license rank: confirmed.**
5. **`ASSESSMENT_RELAX_WEATHER` flag (default `true`): confirmed.**

# Design decisions (summary)
Short list of everything decided. The sections after this one give the full detail.

- **Stats:** HP, Attack, Defense, Speed. No fifth stat. Every species has the same total of base stats (`STAT_BUDGET = 300`). Rarity is not strength.
- **Genetics:** Build (S/L alleles) and Temperament (B/W alleles), each with tradeoffs; a recessive cosmetic Marking; allele odds can vary by habitat tag; rolled on the server at spawn time. Vigor: per-stat 0 to 5, not inherited.
- **Display:** the player sees grades and descriptions, never raw stat numbers. Levels are shown as numbers. HP is a bar.
- **Breeding:** deferred (to be announced). The allele model is the groundwork.
- **Battles:** turn-based, one active Wildkin per side. Friendly battles are a normal, respected part of the world (lore now, NPC battles in 0.4.0).
- **Capture:** the Wildkin must be weakened first, because Wildkin are feral before they bond. Missing HP raises the capture chance most; statuses raise it slightly less.
- **Turn order:** a weighted coin flip on Speed. Faster has better odds, never certainty.
- **Speed** also drives escape and dodge. Status recovery is not a Speed job (it will be a defensive trait later).
- **Switching** costs your turn. Sending in a replacement after a faint is free.
- **Losing:** running out of usable Wildkin is a loss. Losing the party is the only cost (no money, no EXP penalty).
- **Healing:** every injured or fainted Wildkin gets first aid and heals slowly in its capsule. Vets at physical field-station POIs heal instantly and for free. Wildkin above your license cannot be treated at all; they stay at their HP until the license is earned.
- **Levels:** 1 to 100. The level is the bond. No bond descriptors for now. "Feral" is story flavour only (no disobedience mechanic).
- **EXP:** battles are the largest source (about 40%) but not by a huge margin; also walking with the lead Wildkin, observation and exploration, and captures. Daily caps, diminishing returns, a rested bonus, shared and catch-up EXP. Every gain is logged with its source.
- **Matchups:** discovered in battle, recorded in the Registry, rewarded with researcher EXP the first time.
- **Wild levels:** each encounter table has a level range, entries can override it. Wild Wildkin keep their level when captured. Players are pushed to observe in areas that are too strong for them until they level up.
- **Licenses:** one per category, 5 ranks, obedience cap `rank × 20`, everyone starts at rank 1. Above the cap a Wildkin is **restless**: it travels with you and gains EXP but will not battle and cannot be healed. Rank-ups need researcher EXP **and** an assessment taken at a field station. Researcher EXP comes from learning (observing, recording, exploring), not from battling.
- **License unlocks in 0.3.0:** obedience cap, category capsules, battle and capture in license-locked habitats, scanner depth.
- **Items without currency:** daily POI pickups and rank-up grants. Currency and shops are deferred until a complementary system is designed.

# Lore and canon updates
The canon is authoritative (`docs/WILDBOUND_Wildkin_Bible_v1.1.docx` first, then `WILDBOUND_The_First_Field_Survey_Source_of_Truth.docx`, then `WILDBOUND_Wildkin_Biology_and_Ecology_Reference_v1.0.docx`). The Bible labels every fact `ESTABLISHED`, `PROPOSED` or `TBD`. Use these labels as follows in 0.3.0:

- **System rules decided by the project owner are ESTABLISHED:** the four core stats and equal budget, the genetics model, level as bond, battle and capture rules, licenses, first aid, vets, friendly battles as a cultural norm.
- **Per-species numbers and names introduced here are PROPOSED:** base stats, categories, body traits, placeholder attacks, gene frequencies, marking variant names.
- **Anything not decided stays TBD or an open question.** Do not invent a resolution for the ancient biological influence, the cause of the habitat changes, cross-species breeding or the limits of Wildkin intelligence.

Edit the `.docx` files with the docx skill. Bump the version in each changed file's name and title page (`Wildkin_Bible_v1.2`, `Biology_and_Ecology_Reference_v1.1`; the First Field Survey keeps its name). **Keep the `WILDBOUND_` prefix and the words `Wildkin_Bible`, `First_Field_Survey`, `Biology_and_Ecology` in the file names**: `apps/api/src/manager/lore.ts` uses them to order the files for `LORE_SOURCE=full`. Delete the old version files after the new ones exist, and fix any references to the old names in docs and code (grep for `v1.1.docx` and `v1.0.docx`).

## Wildkin Bible (v1.1 → v1.2)
Section 5 "Game Design Reference" today says species battle details stay TBD until the shared battle system is stable. Update it:

- **Shared combat constraints:** keep "Core stats: HP, Attack, Defense, and Speed" and add: every species has the same base-stat budget (300), so rarity never means strength (ESTABLISHED). Keep "four battle skills from a reusable effect vocabulary" and "one simple passive", and note the skill system arrives in 0.4.0; until then each species has one or two placeholder attacks (PROPOSED, replaced by skills).
- **New subsection "Categories and body traits"** (ESTABLISHED as a system): categories group Wildkin by how they live and decide which Field Registry license covers them (Aerial, Aquatic, Terrestrial, Verdant); body traits describe anatomy that resists or is vulnerable to certain attack approaches (Plated, Feathered, Soft-bodied, Leafy, Slick). Include the matchup table from [Matchups](#matchups-approaches-and-body-traits) with its one-line biological reasons.
- **New subsection "Individual variation"** (ESTABLISHED as a system): Build and Temperament are inherited traits, each with a tradeoff; markings are a rare cosmetic inherited variation; vigor is an individual's condition and is not inherited. Kantar's established size variation ("larger individuals deeper in mature woodland") is the model example.
- **Each of the five species entries** gets a short "Game data (PROPOSED)" block: category, body trait, base stats, placeholder attacks, gene notes, marking variant name. Use the values in [Content for the five Wildkin](#content-for-the-five-wildkin). Replace "Battle role, stats, passive, skills, and field ability are TBD" with "Stats, category and body traits PROPOSED (v1.2); passive, skills and field ability TBD (skill system in 0.4.0)."
- **Section 7 "Open Questions and Pending Decisions":** remove "Define gameplay role ... only after the core battle and field-interaction systems are stable" and replace it with "Define each species' four skills and passive once the 0.4.0 skill system exists."
- **Section 8** keeps its rule that the engine consumes structured data, not prose. Add that the game data block mirrors the Creature Manager fields.

## Wildkin Biology and Ecology Reference (v1.0 → v1.1)
- **Section 4 "Genetics and Reproduction"**, add "4.3 Individual variation" (ESTABLISHED): within a species, individuals inherit traits from their parents. The Registry currently recognises two trait pairs that affect how an individual performs (Build: smaller or larger than typical; Temperament: bolder or warier than typical) and rare inherited marking variants that do not. Extremes are rarer than the typical form because they need the same variant from both parents. Local conditions shape which variants are common in a population (larger Kantar in mature woodland). Vigor (how healthy and well developed an individual is) is condition, not inheritance. Detailed reproduction and cross-species compatibility stay open questions; the existing compatibility rules (4.1) are unchanged.
- **New section "Capture, care and bonding"** (ESTABLISHED), answering part of the open question "How do capture, care, training, and bonding work mechanically and ethically": a wild Wildkin is feral toward humans and will not accept a capsule while it has the strength to resist; researchers weaken it in a controlled bout first. Capture is not affection; the bond grows with time and shared experience, and a growing bond is what lets a Wildkin learn and develop (the level). Every injured or exhausted Wildkin receives first aid before it is placed in a capsule, where it recovers slowly; vets treat Wildkin faster. A researcher who lacks the knowledge for a Wildkin (the license) cannot safely treat or direct it: such a Wildkin is restless, travels with the researcher, but does not cooperate. Bouts never aim to kill; a Wildkin that faints has withdrawn from the fight exhausted.
- **Section 15 "Open Questions"**: keep the bonding question but narrow it to "the limits of bonding, intelligence and communication, and the ethics of keeping Wildkin long term". Keep every other open question as is.

## The First Field Survey
Do not rewrite the book. Add a short appendix "Appendix: The Field License (PROPOSED for v0.3.0)" that describes, in the book's voice:
- Sam's new Field Registry license is rank 1 in all four categories (Aerial, Aquatic, Terrestrial, Verdant). Each category is its own field of knowledge, because canopy birds, creek swimmers, ground dwellers and plant-bound Wildkin live by different rules. Higher ranks are earned through **assessments** at East Research Gate, a checklist of real fieldwork rather than a written test.
- The ranger issues a first-aid kit and explains the rule: everything you weaken, you treat. And a Wildkin your license cannot cover will not trust you to treat or direct it.
- The ranger entrusts Sam with a Registry-raised companion (only if open decision 1 is confirmed).
- **Friendly battles** are part of everyday life across the region, the way a combat sport can be a way of life in some real cultures: children spar their Wildkin in the settlement plaza, and some people make their living on sparring circuits. It is one path among many and fieldwork remains Sam's. (Circuits and NPC opponents arrive in 0.4.0.)
- Vets work out of field stations such as East Research Gate and treat any Wildkin a researcher is licensed for, free of charge.

## `docs/lore/assistant-brief.md`
This is the condensed canon sent to the Creature Manager's AI assistant. Update it so the assistant fills the new fields sensibly:
- In "Design standards", replace "Species battle details stay TBD until systems stabilise" with the stat budget rule (four stats summing to exactly 300, shaped by anatomy and behaviour, rarity never adds strength), the four categories, the five body traits with their weakness and resistance, the six attack approaches, and the placeholder-attack rule (one or two attacks, power 30 to 60, approach matching the anatomy, mark them PROPOSED).
- Add the genetics model in two sentences and the marking-variant rule (cosmetic only, name it after a visible difference, frequency 0.02 to 0.1).
- Add the capture and care paragraph (feral, first aid, licenses, restless) and the friendly-battle culture line.
- Keep it short: the brief must stay around 2,000 tokens for Groq's free tier. Measure it before and after.

## Glossary (`docs/glossary.md`)
Add: Stat budget, Stat shape, Body trait, Approach, Matchup, Category, Field Registry license, License rank, Assessment, Obedience cap, Restless, Build, Temperament, Marking, Allele, Genotype, Phenotype, Vigor, Level, EXP, Researcher EXP, Rested bonus, Lead Wildkin, Wild battle, Faint, First aid, Natural recovery, Vet, Field station, Daily pickup, Category capsule, Placeholder attack, Status, Scanner depth.

# Game systems
Everything in this section is **pure logic in `packages/world`** (no database, no network, no React) with unit tests, following the existing pattern (`encounters.ts`, `wandering.ts`). All randomness goes through an injected `random: () => number` so tests can use `seededRandom()`. Constants go in `packages/shared` so the web app, editor, manager and API agree on them (like `GAME_RULES`).

Suggested new files:

| File | What |
|---|---|
| `packages/shared/src/battle.ts` | Vocabularies, constants and Zod schemas for stats, genetics, attacks, matchups, statuses, battle views and actions |
| `packages/shared/src/research.ts` | Categories, licenses, assessments, researcher EXP constants and schemas |
| `packages/world/src/stats.ts` | Stat formulas, grades and descriptors |
| `packages/world/src/genetics.ts` | Genome and vigor rolls, phenotypes, trait modifiers |
| `packages/world/src/levels.ts` | EXP curve, level from EXP, license cap clamp |
| `packages/world/src/exp.ts` | EXP yields, caps, rested bonus, sharing |
| `packages/world/src/battle/matchups.ts` | Matchup multiplier and field-note lines |
| `packages/world/src/battle/turn-order.ts` | Weighted turn order, escape, dodge |
| `packages/world/src/battle/damage.ts` | Damage formula |
| `packages/world/src/battle/statuses.ts` | Status effects and ticking |
| `packages/world/src/battle/capture.ts` | In-battle capture chance (replaces `capture.ts`) |
| `packages/world/src/battle/engine.ts` | `resolveTurn(state, action, deps)` |
| `packages/world/src/recovery.ts` | Natural recovery (lazy HP) |
| `packages/world/src/research.ts` | Researcher EXP, assessment progress, achievable conditions |
| `packages/world/src/pickups.ts` | Daily POI pickup rolls |

Re-export everything from the two packages' `index.ts`. Delete `packages/world/src/capture.ts` once nothing imports it (its rules are superseded).

## Stats
### Species stat shape
Each species has base stats `{ hp, atk, def, spd }`, integers 10 to 150, and **the four must add up to exactly `STAT_BUDGET = 300`**. This is how "rarity is not strength" is enforced: the Creature Manager refuses to publish a species whose stats do not sum to 300.

### Individual stats at a level
```
hp    = round( (floor(base.hp  × 2 × level / 100) + level + 10) × traitMod.hp  × (1 + vigor.hp  / 100) )
other = round( (floor(base.X   × 2 × level / 100) + 5)          × traitMod.X   × (1 + vigor.X   / 100) )
```
- `level` is 1 to 100. At level 50 a stat is about `base + 5`; at level 100 about `2 × base + 5`.
- `traitMod` comes from the phenotype (see [Genetics](#genetics)); missing keys are 1.
- `vigor` is 0 to 5 per stat (a +0% to +5% bonus).
- Minimum 1 for every stat.

Worked examples (no traits, no vigor): Kawi level 5 has HP `floor(6.5) + 5 + 10 = 21` and Speed `floor(11) + 5 = 16`. Kantar level 50 has HP `70 + 50 + 10 = 130`.

### What the player sees (grades, not numbers)
The player never sees raw stat numbers. The API sends grades and descriptions instead.

**Species shape descriptor** per stat (from the base value, shown in the Registry after capture and on Wildkin details):

| Base | Descriptor |
|---|---|
| 100 or more | Signature strength |
| 80 to 99 | Solid |
| 60 to 79 | Modest |
| below 60 | Weak point |

**Individual grade** per stat, from `m = traitMod × (1 + vigor / 100)`:

| m | Grade |
|---|---|
| below 0.95 | Low |
| 0.95 to 0.999 | Fair |
| 1.00 to 1.039 | Typical |
| 1.04 to 1.099 | Strong |
| 1.10 or more | Exceptional |

**Vigor words** (0 to 5): Frail, Slight, Average, Sound, Robust, Exceptional.

HP is shown as a bar (fraction of max HP), with no numbers. Levels are shown as numbers.

## Genetics
### Genome
Each individual Wildkin has a genome with three loci, two alleles each:

| Gene | Alleles | Genotype → phenotype | Effect |
|---|---|---|---|
| Build | `S`, `L` | SS = Small, SL = Typical, LL = Large | Small: HP ×0.90, SPD ×1.10. Large: HP ×1.10, DEF ×1.05, SPD ×0.90 |
| Temperament | `B`, `W` | BB = Bold, BW = Steady, WW = Wary | Bold: ATK ×1.10, DEF ×0.90. Wary: SPD ×1.10, ATK ×0.90 |
| Marking | `+`, `m` | `mm` = the species' marking variant is expressed, anything else = normal | Cosmetic only. No stat effect |

Trait modifiers multiply: a Large, Wary individual has SPD `0.90 × 1.10 = 0.99`. Store the genome as JSON, for example `{ "build": ["S","L"], "temperament": ["W","W"], "marking": ["+","+"] }`. Derive the phenotype on read; never store it.

**Vigor** is stored separately as `{ "hp": 0..5, "atk": 0..5, "def": 0..5, "spd": 0..5 }`, each rolled uniformly. It is **not inherited** (it reflects how the individual developed).

### Species gene pool
Each species defines its gene pool (authored in the Creature Manager, published to `creatures.gene_pool`):

```ts
GenePool = {
  build:       { pAllele: number /* 0..1, chance each allele is L */, byHabitatTag: { tag: Slug, pAllele: number }[] },
  temperament: { pAllele: number /* 0..1, chance each allele is W */, byHabitatTag: { tag: Slug, pAllele: number }[] },
  marking: { name: string /* e.g. "Banded" */, description: string, frequency: number /* 0..0.2, chance each allele is m */ } | null,
}
```

### Rolling a genome (`rollGenome(pool, habitatTags, random)`)
- For Build: walk `byHabitatTag` **in authored order**; the first entry whose `tag` is in the spawn habitat's `habitatTags` gives `p`. Otherwise use `pAllele`. Roll each of the two alleles independently: `random() < p ? "L" : "S"`.
- Temperament works the same way with `W` and `B`.
- Marking: `null` pool → `["+","+"]`. Otherwise each allele is `m` with probability `frequency`.
- A spawn with no habitat (region-wide tables only) uses the defaults.
- `rollVigor(random)`: four integers `floor(random() × 6)`.

With `p = 0.5`, a quarter of individuals are Small, half Typical, a quarter Large. With `p = 0.75` (a habitat override), Large becomes `0.75² ≈ 56%`. A marking frequency of 0.05 expresses in `0.05² = 0.25%` of individuals: rare, collectible, and harmless to balance.

### Breeding groundwork
Breeding is **deferred**. Write `inheritGenome(parentA, parentB, random)` anyway (each parent passes one random allele per locus) with unit tests, but nothing calls it. Do not add breeding UI, routes or tables.

## Levels and EXP
### Curve
```
totalExpForLevel(L) = L === 1 ? 0 : L³        (level 100 = 1,000,000 EXP)
levelForExp(exp)    = the largest L in 1..100 with totalExpForLevel(L) <= exp
nextLevelGap(L)     = totalExpForLevel(L + 1) - totalExpForLevel(L)   (0 at level 100)
```
Examples: level 5 → 6 needs 91 EXP; 20 → 21 needs 1,261; 50 → 51 needs 7,651.

A captured Wildkin stores its **total EXP**. Its level is `min(levelForExp(exp), licenseCap)` (open decision 2). Store `level` as a column too (for queries and indexes) and keep it in sync whenever EXP or license rank changes. A Wildkin captured at level L starts with `totalExpForLevel(L)` EXP.

When the level rises, recompute stats and raise current HP by the same amount max HP rose (a level-up never heals more than that, never reduces HP).

### The lead Wildkin
The **lead** is the Wildkin in party slot 0. If slot 0 is empty, restless or fainted, the lead is the first party slot (by slot order) holding a usable Wildkin. Battles start with the lead. Note: exercise #7 (rearranging the party) is still open, so until it is done the lead is simply the earliest-captured Wildkin in the party.

### Wildkin EXP sources
All amounts are placeholders meant to be tuned after play-testing. Keep them in one exported constant object, `EXP_RULES`, in `packages/shared/src/battle.ts`.

| Source (`exp_events.source`) | Who gets it | Amount | Cap |
|---|---|---|---|
| `battle` | The Wildkin that was active when the wild Wildkin fainted or was captured | `floor(60 × L_opp / 7 × gap)`, with `gap = clamp(L_opp / L_self, 0.2, 1.5)` | none (battles are limited by spawns) |
| `battle-shared` | Every other non-fainted party member | 50% of the `battle` amount, or 75% if its level is 5 or more below the lead's | none |
| `walking` | The lead | 1% of the lead's `nextLevelGap` per 100 m walked | 30 units per day (3 km) |
| `observation` | The lead | 3% of `nextLevelGap` for the first observation of each species per day | 5 per day |
| `exploration` | The lead | 5% of `nextLevelGap` for the first visit of each habitat per day | 5 per day |
| `capture` | The lead | 10% of `nextLevelGap` per successful capture | none |

- Amounts are rounded down, minimum 1 (except when the cap is reached: then 0 and no event).
- **Gap scaling** makes beating much weaker Wildkin give very little: a level 30 beating a level 5 gets `60 × 5 / 7 × 0.2 = 8`.
- **Walking** is measured from accepted position reports (`reportPosition`): the distance between consecutive accepted fixes, **counting only segments slower than 3 m/s** (so driving does not farm EXP). Keep a running per-player meter for the day and award one unit per full 100 m.
- **Rested bonus:** a player gains one rested charge per 2 hours since their last `battle` EXP, up to 10 charges. Each won battle (fainted or captured wild Wildkin) spends one charge and **doubles** that battle's `battle` and `battle-shared` amounts. Store `rested_charges` and `last_battle_exp_at` on the player and compute lazily.
- **Day boundaries** use the player's local date in their time zone (`player_positions.time_zone`, else `WORLD_TIMEZONE`): `dayKey = "YYYY-MM-DD"`.
- Restless Wildkin receive EXP normally (they travel with you).
- Wildkin at level 100 receive no EXP (log nothing).
- **Target split** (a design goal to check after play-testing, not a rule to code): battles about 40%, walking about 25%, observation and exploration about 20%, captures about 15%.

### EXP log
Log **every** EXP gain, Wildkin or researcher, in one `exp_events` table: `player_id`, `track` (`wildkin` or `researcher`), `captured_wildkin_id` (nullable), `category` (nullable, researcher track), `source`, `amount`, `day_key`, `created_at`, `meta` (JSON, e.g. `{ "rested": true, "opponentLevel": 7 }`). Daily caps are computed from this table (`sum/count by player, source, day_key`), so there is no separate counter table. Add a short SQL snippet to `docs/07-game-systems.md` that shows the split of EXP by source for the last 7 days.

## Wild levels
### Authoring
- Every encounter table gets `minLevel` and `maxLevel` (integers 1 to 100, `minLevel <= maxLevel`). Default for new tables in the editor: 1 to 10.
- Every encounter entry may override with its own `minLevel` and `maxLevel` (both set or both null). The **effective range** of an entry is its override, else its table's range.
- Validation (`packages/world/src/validation.ts` and Zod):

| Rule (`code`) | Severity |
|---|---|
| `invalid-level-range`: min > max, or outside 1 to 100, or only one override bound set | blocks saving (schema) |
| `level-range-crosses-band`: an effective range crosses a license band boundary (a multiple of 20, e.g. 18 to 24) | warning |
| `region-without-entry-habitat`: an active region where no habitat has an active table whose `minLevel <= 10` | warning |

- Design rule for authors (put it in `docs/05-map-editor.md`): **every region needs an easy entry habitat**, because players do not choose where they live; difficulty should rise *within* a region, not between neighbourhoods.

### Resolution
- `ResolvedEncounterEntry` gains `minLevel` and `maxLevel` (effective).
- `AvailableWildkin` gains `levelBands: { minLevel, maxLevel, weight }[]`: one band per available entry for that creature across applicable tables (the same creature can come from several tables with different ranges).
- `planSpawns` returns `level` on each `PlannedSpawn`: after rolling the creature, pick one of its `levelBands` by weight, then a level uniformly in `[minLevel, maxLevel]`.
- The editor's Test panel shows each available Wildkin's level range(s).

### Seed world levels
In `packages/db/seed/mabunyi.world.json`: Forest Edge Encounters 2 to 6, Sunbreak Clearing Encounters 3 to 8, Silayan Creekside Encounters 4 to 10, with the Riverkin entry overridden to 5 to 12. All within license rank 1 (cap 20), so a new player can battle everything in Mabunyi.

## Content for the five Wildkin
All values are **PROPOSED**. Put them in `packages/db/seed/creatures.json` (game fields) and `packages/db/seed/wildkin.json` (encyclopedia entries), and mirror them in the Bible v1.2 game data blocks.

### Categories, body traits and stats
| Wildkin | Category | Body trait | HP | ATK | DEF | SPD | Total |
|---|---|---|---:|---:|---:|---:|---:|
| Kawi | aerial | feathered | 65 | 75 | 50 | 110 | 300 |
| Mimu | terrestrial | soft-bodied | 70 | 50 | 80 | 100 | 300 |
| Lumae | verdant | leafy | 100 | 50 | 80 | 70 | 300 |
| Kantar | terrestrial | plated | 70 | 90 | 95 | 45 | 300 |
| Riverkin | aquatic | slick | 85 | 80 | 60 | 75 | 300 |

Reasons (for the Bible): Kawi is a quick, curious darter; Mimu is a small, cautious hider; Lumae is a sturdy plant-bound indicator species; Kantar is an armoured predator of small creatures that prefers retreat; Riverkin is a strong, steady swimmer.

### Placeholder attacks
One or two per species. `power` is 30 to 60. These are **not skills**: they are replaced by the 0.4.0 skill system. Keep them separate from the existing `skills` field (which stays as the Registry's proposed skill list).

| Wildkin | Attack 1 | Attack 2 |
|---|---|---|
| Kawi | Peck (pierce, 40) | Wing Buffet (strike, 35) |
| Mimu | Nibble (pierce, 35) | Scurry Strike (strike, 40) |
| Lumae | Spore Puff (spore, 40) | Leaf Shove (strike, 35) |
| Kantar | Venom Nip (toxin, 40) | Plate Slam (crush, 40) |
| Riverkin | Splash Surge (surge, 40) | Tail Slap (crush, 35) |

Kantar's toxin is a defensive biological adaptation (the Biology doc's own example of a centipede-like Wildkin with a defensive toxin). Keep the Bible's note: no real-world hazard implication.

### Gene pools
| Wildkin | Build p(L) | Build habitat overrides | Temperament p(W) | Marking variant (frequency) |
|---|---:|---|---:|---|
| Kawi | 0.40 | none | 0.40 | Pale-tailed: pale tips on the long tail feathers (0.05) |
| Mimu | 0.30 | none | 0.70 | Moss-backed: a greener stripe along the back (0.05) |
| Lumae | 0.50 | `sunny`: 0.60 | 0.50 | Twin-bloom: two dorsal flowers instead of one (0.05) |
| Kantar | 0.50 | `mature-woodland`: 0.75, `forest-floor`: 0.60 | 0.60 | Banded: the pale side markings join into full bands (0.05) |
| Riverkin | 0.50 | `deep-pool`: 0.65 | 0.40 | Deep-shimmer: a darker, blue-green shimmer (0.05) |

Kantar's override encodes the Bible's established "larger individuals deeper in mature woodland". Add `mature-woodland` and `deep-pool` to `SUGGESTED_HABITAT_TAGS` in `packages/shared/src/constants.ts`. No new art is generated for marking variants in 0.3.0; the UI shows the variant as a text badge.

## Matchups (approaches and body traits)
### Vocabularies
```
APPROACHES  = ["strike", "pierce", "crush", "surge", "toxin", "spore"]      // strike is always neutral
BODY_TRAITS = ["plated", "feathered", "soft-bodied", "leafy", "slick"]
```
A species has **1 or 2** body traits. Each attack has exactly one approach.

### Matchup table
| Body trait | Weak to (×1.5) | Resists (×0.67) | Reason |
|---|---|---|---|
| plated | crush | pierce | Armour deflects points but cracks under blunt force |
| feathered | surge | crush | Soaked feathers weigh it down; light and hard to pin |
| soft-bodied | pierce | spore | No protection; lives among leaf-litter spores and molds |
| leafy | toxin | surge | Toxins wilt it; water feeds it |
| slick | toxin | pierce | Absorbs through its skin; points glance off |

- `MATCHUP_WEAK = 1.5`, `MATCHUP_RESIST = 0.67`. With two traits, multiply both factors.
- **Field-note lines** for battle text, per trait and effect (put them in the shared table so the UI and docs agree). Examples: plated weak "The plates cracked under the blow.", plated resist "The point glanced off its plates.", feathered weak "Its soaked feathers dragged it down.", feathered resist "It rode the impact on light wings.", soft-bodied weak "It had nothing to shield it.", soft-bodied resist "It shrugged off the spores, as at home as in the leaf litter.", leafy weak "Its leaves curled and wilted.", leafy resist "It drank the water in.", slick weak "Its skin drew the toxin in.", slick resist "The point slid off its slick hide."

### Discovery
- Matchups are **hidden** until discovered. When an attack hits a target with a weakness or resistance, the server records `(player, bodyTrait, approach, effect)` in `matchup_records` (open decision 3: per trait). Neutral hits are not recorded.
- The **first** record of a pair grants researcher EXP to the target species' category (see [Researcher EXP](#researcher-exp)) and appears in the battle log ("Field note recorded: Plated is weak to Crush").
- The Registry shows, for each observed species, its body traits and for each trait the recorded weakness/resistance or "?" if not yet recorded.

## Battles
### Model
- **Server-authoritative and turn-based over HTTP.** The client sends one action per turn; the server resolves the whole turn (the player's action and the wild Wildkin's action) and returns the new battle view plus a list of events for the UI to play back.
- **One active Wildkin per side.** Only wild battles exist in 0.3.0 (NPC friendly battles come in 0.4.0, but design the engine so a second trainer side can be added without rewriting it).
- **One active battle per player.**
- The engine is a pure function: `resolveTurn(state: BattleState, action: BattleAction, deps: { random }) => { state, events }`. The API loads the state, calls it, persists the result in one transaction.

### Starting a battle
`POST /api/game/spawns/:id/battle`. Guards, in order:
1. The usual `loadActionableSpawn` checks: the player can act (fresh position, not locked), the spawn is theirs, active, not expired, within `interactRadiusM` (60 m).
2. No other active battle for this player (409 `battle_in_progress`, with the existing battle's id).
3. The spawn's habitat is not license-locked for this player (409 `habitat_locked`, with the required category and rank). See [License-locked habitats](#license-locked-habitats).
4. The player has at least one **usable** Wildkin in the party: not fainted (current HP > 0) and not restless (409 `no_usable_wildkin`).

Then: set the spawn's status to `in_battle`, create the battle with the wild side built from the spawn (species, level, genome, vigor, full HP, attacks, body traits) and the player's lead as the active Wildkin.

### Each turn: actions
| Action | Shape | Notes |
|---|---|---|
| `attack` | `{ type: "attack", attackIndex }` | One of the active Wildkin's placeholder attacks |
| `switch` | `{ type: "switch", wildkinId }` | To a usable party member. **Uses the turn** |
| `item` | `{ type: "item", itemId: "trail-ration", wildkinId }` | Heals 25% of max HP. Uses the turn. Not on restless Wildkin |
| `capsule` | `{ type: "capsule", itemId }` | Any capsule item. Uses the turn. Wild battles only |
| `escape` | `{ type: "escape" }` | Wild battles only. Uses the turn |
| `replace` | `{ type: "replace", wildkinId }` | Only allowed (and required) right after the player's active Wildkin fainted. **Free**: no wild action follows |

Every action request carries `turn` (the turn number the client saw). The server applies it only if it matches the current turn (`updateMany ... where turn = expected`), so double taps cannot act twice.

### Turn resolution order
1. **Validate** the action (legal for the current state, the item is in the inventory, the target Wildkin is usable).
2. **Priority phase:** the player's `switch`, `item`, `capsule` or `escape` resolves now, before any attack.
   - `capsule`: spend the item, roll capture (see [Capture](#capture)). Success ends the battle (`captured`). Failure: "It broke free!", the battle continues and the wild Wildkin takes its turn.
   - `escape`: roll escape (see [Speed](#speed-turn-order-escape-and-dodge)). Success ends the battle (`escaped`). Failure increases `escapeAttempts`.
3. **Status check** for each side about to attack (see [Statuses](#statuses-framework-only)): Asleep, Stunned or Numbed may cancel that side's attack.
4. **Attack phase:** if both sides attack, the order is a weighted roll on Speed. If only the wild side attacks (the player used a priority action), it simply attacks. Each attack: dodge roll, damage, matchup line, matchup record. A Wildkin that faints before its turn does not attack.
5. **Faint handling:**
   - Wild faints: the battle ends `won`. The wild Wildkin "retreats" (spawn becomes `fled`). It **cannot be captured** once fainted, so the player must weaken without knocking it out (Pokémon rule). EXP is awarded.
   - Player's active faints: if another usable party member exists, the battle waits for a `replace` action; otherwise the battle ends `lost`.
6. **End of turn:** status durations tick down. Increment `turn`.

### Wild behaviour
The wild Wildkin picks one of its attacks uniformly at random each turn. It never switches, uses items or flees in 0.3.0. (Temperament-driven behaviour is a 0.4.0 idea.)

### Damage
```
base   = floor( floor( floor(2 × L_att / 5 + 2) × power × ATK_att / DEF_def ) / 50 ) + 2
damage = max(1, floor( base × matchup × randomFactor ))      randomFactor uniform in [0.85, 1.00]
```
Worked example: level 5 Kawi (ATK 12) uses Peck (pierce, 40) on a level 5 Mimu (DEF 13, 22 HP, soft-bodied): `floor(floor(4 × 40 × 12 / 13) / 50) + 2 = floor(147 / 50) + 2 = 4`, then ×1.5 for the weakness = about 5 to 6. So Mimu falls in about 4 hits, which leaves room to weaken it and throw a capsule.

No critical hits in 0.3.0.

### Speed: turn order, escape and dodge
```
P(A attacks first) = SPD_A^k / (SPD_A^k + SPD_B^k)        k = TURN_ORDER_EXPONENT = 1
```
Re-rolled every turn. Equal speed is 50%; twice as fast is 67%; level 5 Kawi (16) vs. Kantar (9) is 64%. If play-testing shows Speed matters too little, raise `k` to 2. Reserve a `priority` flag on attacks for the 0.4.0 skill system (no placeholder attack has it).

```
escape = min(0.95, 0.20 + SPD_self / (SPD_self + SPD_wild) × 0.60 + 0.10 × escapeAttempts)
dodge  = defender faster ? min(0.10, (SPD_def − SPD_att) / SPD_def × 0.20) : 0
```
The +10% per failed escape means a slow Wildkin is never trapped forever. Keep dodge capped low: getting dodged is less fun than hitting.

### Statuses (framework only)
Build the full framework, but **nothing inflicts a status in 0.3.0** (skills will, in 0.4.0). Unit-test every status by putting it on a battle state directly.

| Status | Effect | Duration | Capture bonus |
|---|---|---|---:|
| asleep | Cannot attack | 1 to 3 turns | +0.20 |
| stunned | Cannot attack | 1 turn | +0.15 |
| entangled | Cannot switch or escape | 2 to 4 turns | +0.15 |
| numbed | 25% chance each turn to lose its attack | 2 to 4 turns | +0.10 |
| exhausted | ATK ×0.75 | 3 turns | +0.10 |

One status at a time per Wildkin. Statuses end when the battle ends. Speed does not shorten statuses (status recovery will be a defensive trait later).

### Capture
```
chance = min(0.95, rarityBase + observedBonus + 0.45 × (1 − hp / maxHp) + statusBonus + capsuleBonus)
```
| Part | Value |
|---|---|
| `rarityBase` | common 0.25, uncommon 0.15, rare 0.08, TBD 0.20 |
| `observedBonus` | 0.10 if this spawn was observed before the battle (`spawns.observed_at` set), else 0. Keeps "observation precedes capture" |
| HP part | up to 0.45 at near-zero HP |
| `statusBonus` | from the status table above (always below the HP part's maximum) |
| `capsuleBonus` | 0.15 if a category capsule matches the wild species' category, else 0 |

Worked examples: an observed common at 20% HP with a basic capsule `0.25 + 0.10 + 0.36 = 71%`; a full-HP common, not observed `25%`.

- No explicit level term: higher-level Wildkin already resist capture by being harder to weaken.
- The chance is **never sent to the client**.
- On success, in one transaction: spend the capsule; end the battle `captured`; spawn → `captured`; create the `captured_wildkin` row (species, level, genome, vigor, its current HP from the battle, total EXP for its level, the habitat and time it was caught; first free party slot 0 to 5, else storage); upsert the Registry entry (as in the old exercise #3: `firstCapturedAt`, `timesCaptured + 1`); award battle EXP, capture EXP and researcher EXP; record the phenotype (see [Researcher EXP](#researcher-exp)).
- A Wildkin captured above the player's license cap is **restless** immediately (see [Licenses](#field-registry-licenses)).

### Battle end
| Outcome | When | Effects |
|---|---|---|
| `won` | Wild fainted | Spawn `fled`; battle EXP (+ shared), rested charge spent |
| `captured` | Capsule succeeded | As above (Capture), plus battle EXP as for a win |
| `lost` | No usable party member left | Spawn back to `active` with a fresh TTL (it stays wild). No other cost |
| `escaped` | Escape succeeded, **or** the player moved more than `spawnRadiusM` (120 m) from the spawn during the battle | Spawn `fled` |
| `abandoned` | No action for `BATTLE_IDLE_TIMEOUT_MS = 10 min` | Spawn `fled`. Checked lazily whenever the battle or game state is read |

After **every** outcome, all of the player's party HP changes are already persisted (HP is written back every turn; see [Healing](#healing)).

### Spawns during battle
- Add `in_battle` to the `spawn_status` enum.
- `gameState` expires, flees and wanders only `active` spawns, so an `in_battle` spawn is naturally frozen: no TTL expiry, no wandering, no "player walked away" rule. The radar still shows it, marked "In battle".
- When the battle ends, the spawn moves to its final status from the table above.
- Abandoned battles release the spawn (see above) so a spawn can never be held forever.

### Battle view (what the client sees)
- Wild side: species id, name (always shown in battle, even if not yet observed: the player is looking at it), registry number, **level**, HP fraction (0 to 1), status, body traits. **Never** its exact stats, genome or vigor.
- Player side: the active Wildkin and every party member's id, name or nickname, level, HP fraction, status, usable/restless/fainted flags, and the active Wildkin's attacks (name, approach, power as a word: 30 to 39 "Light", 40 to 49 "Moderate", 50 to 60 "Heavy").
- `turn`, `awaiting` (`action` or `replace`), `outcome` (null while active), inventory counts for usable items.
- Events for playback: `attack` (side, attack name, approach, dodged, damage as an HP-fraction change, effect `weak`/`resist`/null, field-note line), `status`, `switch`, `replace`, `faint`, `capsule` (success or "broke free"), `escape`, `item`, `matchup-recorded`, `exp` (Wildkin id, amount, new level if it leveled up, "held at license cap" flag), `researcher-exp`, `battle-end`.

## Healing
### HP storage (lazy recovery)
`captured_wildkin` stores `current_hp` and `hp_updated_at`. The current HP is computed when read, the same lazy pattern as wandering's `moved_at`:
```
if restless: hp = current_hp                                     (frozen: they cannot receive first aid)
else:        hp = min(maxHp, current_hp + maxHp × (now − hp_updated_at) / NATURAL_RECOVERY_FULL_MS)
```
`NATURAL_RECOVERY_FULL_MS = 8 hours` (empty to full). "Every injured and fainted Wildkin is given first aid and heals real slowly." Write `current_hp` and `hp_updated_at = now` whenever HP changes (battle turn, item, vet, level-up) so recovery always continues from the last write.

When a license rank-up turns restless Wildkin into usable ones, set their `hp_updated_at = now` in the same transaction, so they do not retroactively heal for the time they were restless.

A Wildkin at 0 HP is **fainted**: it cannot battle until it recovers above 0 (natural recovery or a vet).

### Vets
- **Field stations** are POIs of type `research-station` or `gate` (East Research Gate in the seed world is one).
- `POST /api/game/stations/:poiId/heal`: the player must be within `interactRadiusM` of the POI (server-side position, published world). Heals **every** non-restless Wildkin the player owns (party and storage) to full, instantly, for free. Restless Wildkin are listed in the response as "cannot be treated yet: needs Aquatic rank 2".
- Walking to a station is the cost of losing a battle; natural recovery means nobody is ever hard-stuck.

### Trail Rations
`trail-ration` becomes usable: heals 25% of max HP, in battle (uses the turn) or from the Party/Satchel screen (`POST /api/game/items/trail-ration/use { wildkinId }`). Not usable on restless Wildkin. Update its description in `ITEMS`.

## Field Registry licenses
### Categories
```
CATEGORIES = ["aerial", "aquatic", "terrestrial", "verdant"]
```
Display names: Aerial, Aquatic, Terrestrial, Verdant. Each species has exactly one category (required to publish).

### Ranks and the obedience cap
- One license per category per player, ranks **1 to 5**. Every player starts at **rank 1 in all four** (create the rows at login for new players; backfill existing players in the migration).
- **Obedience cap** = `rank × 20` (20, 40, 60, 80, 100).
- A captured Wildkin whose level is **above** the cap of its category's license is **restless**:
  - it can be in the party, travels with the player and gains EXP;
  - it **cannot be the active Wildkin** in battle (not the lead, not a switch or replace target);
  - it **cannot be healed** (no first aid, no vet, no Trail Ration): its HP stays frozen;
  - the UI explains why ("Restless. Needs Aquatic rank 2 to cooperate.").
- Wildkin at or below the cap are never restless. With open decision 2, owned Wildkin never *become* restless by leveling; their level is held at the cap.

### Researcher EXP
Researcher EXP is earned by **learning**, never by battling, and always goes to one category (the category of the species involved). Amounts in `RESEARCH_RULES` in `packages/shared/src/research.ts`:

| Source | Amount | Notes |
|---|---:|---|
| `first-observation` | 100 | First ever observation of a species |
| `repeat-observation` | 10 | Up to 5 per species per day |
| `first-capture` | 150 | First capture of a species |
| `repeat-capture` | 20 | |
| `condition-record` | 30 | First observation of a species in a time of day it was never observed in before; same for each new weather. Tracked in `condition_records` |
| `matchup-record` | 50 | First record of a trait/approach pair. Goes to the target's category |
| `phenotype-record` | 40 | First time the player observes or captures a species showing Small, Large, Bold or Wary. 200 for a marking variant. Tracked in `phenotype_records` |
| `habitat-first-visit` | 50 | First visit ever to a habitat. Split between categories by the share of each category's weight in that habitat's available encounters (at the time of the visit) |
| `habitat-daily-visit` | 10 | First visit to a habitat each day, split the same way |

Habitat visits are recorded during the `gameState` tick when the context resolves a habitat (`habitat_visits` table keyed by player, habitat, day). Note the visible phenotypes: Build, Temperament and Marking are **visible to an observer** (size, behaviour, pattern), so observation can record them, even though the UI only names Temperament from license rank 2 (see [Scanner depth](#scanner-depth)).

Rank thresholds (cumulative researcher EXP per category): rank 2 = 600, rank 3 = 2,000, rank 4 = 5,000, rank 5 = 12,000.

### Assessments
Reaching the EXP threshold is not enough: the player takes the next rank's **assessment** at a field station. An assessment is a checklist of real fieldwork, defined as **data** (a typed constant `ASSESSMENTS` in `packages/shared/src/research.ts`, like `ITEMS`), never bespoke code per assessment.

Requirement types (all counted per player, for species of the license's category, from the existing tables):

| Type | Counts | Source |
|---|---|---|
| `observeDistinctSpecies` | distinct species observed | `registry_entries` |
| `observeTimesOfDay` | distinct times of day with at least one observation | `condition_records` |
| `observeWeathers` | distinct weathers with at least one observation | `condition_records` |
| `captureCount` | captures | `registry_entries.times_captured` |
| `winBattles` | wild battles `won` or `captured` | `battles` |
| `recordMatchups` | matchup records for body traits carried by the category's species | `matchup_records` |
| `recordPhenotypes` | distinct phenotype records | `phenotype_records` |
| `visitHabitats` | distinct habitats visited where the category's species appear in the published world | `habitat_visits` |

**Clamping:** with only five species, "observe 3 distinct Aquatic species" is impossible (only Riverkin is Aquatic). Every requirement's count is clamped to what is **achievable** in the current published world and creature list: published species of the category, times of day and weathers in which any of them can spawn (an available table entry and a spawn modifier above 0), matchup pairs that exist for their traits (2 per trait), phenotypes (4 per species, not counting markings), habitats where they appear. Compute this in `packages/world/src/research.ts` (`achievableAssessmentLimits(world, creatures, category)`). Weather requirements are additionally clamped to 1 while `ASSESSMENT_RELAX_WEATHER=true` (open decision 5).

Assessment template, the same for every category in 0.3.0:

| Rank-up | Requirements |
|---|---|
| 1 → 2 | observeDistinctSpecies 2, observeTimesOfDay 2, captureCount 1 |
| 2 → 3 | recordMatchups 2, observeWeathers 3, winBattles 5, captureCount 3 |
| 3 → 4 | recordPhenotypes 2, observeTimesOfDay 4, winBattles 15, visitHabitats 3 |
| 4 → 5 | recordMatchups 4, recordPhenotypes 4, observeWeathers 5, winBattles 30, captureCount 10 |

`POST /api/game/licenses/:category/assessment`: the player must be within `interactRadiusM` of a field station; the category's researcher EXP must meet the threshold; every requirement must be met (409 `assessment_incomplete` with the progress otherwise). On success, in one transaction: rank + 1; record `assessment_completions`; grant the rank-up items; re-evaluate restless Wildkin of that category (set `hp_updated_at = now` for those no longer restless, and level up Wildkin whose banked EXP now allows it, up to the new cap); return the new license view and a summary ("3 Wildkin are no longer restless", "Riverkin grew to level 24").

### Rank-up grants
On every rank-up: 5 category capsules of that category and 3 Field Capsules.

### License-locked habitats
- Habitats get an optional `licenseRequirement: { category, rank } | null`, authored in the Map Editor's Habitat inspector, published like every other habitat field.
- In a locked habitat, for a player below the requirement: spawns still appear and can be **observed** (that is how the player earns the license), but **battle and capture are refused** (409 `habitat_locked`), and the radar shows "Restricted research zone: Aquatic rank 3".
- The seed world has no locked habitats. Mention in the docs how to lock one for testing.

### Scanner depth
How much the player sees about **their own captured** Wildkin depends on their rank in its category (open decision 4):

| Rank | Shown |
|---|---|
| 1 | Level, HP, category, body traits, species shape descriptors, Build phenotype, marking variant |
| 2 | + Temperament phenotype and individual stat grades |
| 3 | + Vigor words |
| 4 and 5 | + Genotype (both alleles per gene, so hidden carriers become visible; useful once breeding exists) |

For **wild** spawns, observing reveals the level, a Build hint ("Larger than typical" / "Smaller than typical", nothing for Typical), a marking hint ("Banded markings"), and from rank 2 a Temperament hint ("Holds its ground" / "Keeps its distance"). The server filters this; hidden fields are sent as `null`, never hidden in CSS.

## Items and daily pickups
### New items (`ITEMS` in `packages/shared/src/game.ts`)
| Id | Name | Category | Use |
|---|---|---|---|
| `field-capsule` | Field Capsule | capture | Any Wildkin, no bonus (existing) |
| `canopy-capsule` | Canopy Capsule | capture | +0.15 capture chance on Aerial Wildkin |
| `current-capsule` | Current Capsule | capture | +0.15 on Aquatic |
| `burrow-capsule` | Burrow Capsule | capture | +0.15 on Terrestrial |
| `bloom-capsule` | Bloom Capsule | capture | +0.15 on Verdant |
| `trail-ration` | Trail Ration | field | Heals 25% max HP (now usable) |

Category capsules work on any Wildkin; they only add the bonus on a match. Every capture item is spent on the attempt. Inventory cap: **30 per item** (`ITEM_STACK_MAX`); pickups and grants above the cap are truncated (and the response says so). Write item descriptions in the field-research voice.

### Daily POI pickups
- Any POI can be searched **once per player per day** (`poi_pickups` keyed by player, POI, day key).
- `POST /api/game/pois/:poiId/collect`: within `interactRadiusM` of the POI (server-side position, published world).
- Loot roll (`rollPickup(poiType, random)`, pure): 2 Field Capsules, plus 1 more with 50%; 1 Trail Ration with 30%; 1 category capsule with 15% by POI type: `water` → current, `clearing` → bloom, `hollow` → burrow, `trail` → canopy, other types → none.
- This is exercise #14 (see [Exercises](#exercises-fill-in-the-blanks)).

## Starter Wildkin
(Only if open decision 1 is confirmed.) A player with no captured Wildkin is redirected from `/play` to `/play/starter`: choose Kawi, Mimu or Kantar at level 5 (rolled genome with the defaults, rolled vigor, full HP, party slot 0). `POST /api/game/starter { creatureId }` refuses if the player already owns any Wildkin. The species list is a constant (`STARTER_SPECIES`) so it can change later.

# Wildbound creature manager
The Creature Manager (`apps/manager`) authors species and publishes their game fields into `creatures`.

- **Schema** (`packages/shared/src/wildkin.ts`, `WildkinEntryInputSchema`): add `category` (enum or `"TBD"`, default `"TBD"`), `bodyTraits` (array of 1 to 2 `BODY_TRAITS`, default `[]`), `baseStats` (`{ hp, atk, def, spd }` or `null`, default `null`), `attacks` (array of 0 to 2 `{ name, approach, power, description, canon }`, default `[]`), `genePool` (default: build 0.5 / temperament 0.5 with no overrides, marking `null`).
- Add all five to `GAME_FIELDS` (published into `creatures`) and extend `CreatureDefinitionSchema` and `listCreatures` to match.
- **Publishing now requires** (extend `PUBLISH_REQUIRED_FIELDS` / `publishIssues`): a category other than TBD, at least one body trait, `baseStats` set and summing to exactly 300, at least one attack. Existing published species are covered by the seed update; a database whose species were edited by hand may need them filled in before republishing (say so in the docs).
- **Form**: add a section 9 "Battle & genetics" to `WildkinEditPage.tsx` (after section 8 "Game"), using the existing field components (`EnumSelect`, `Field`, `Section`):
  - Category (select), body traits (multi-select, max 2).
  - Base stats: four number inputs with a **live budget counter** ("240 / 300, 60 left") that turns red when the total is not 300. The counter is exercise #16; ship the four plain inputs plus the Zod error on submit.
  - Attacks editor (like `SkillsEditor`): name, approach (select), power (30 to 60), description, canon (established/proposed). Max 2.
  - Gene pool editor: Build p(L) and Temperament p(W) as sliders 0 to 1 with a readout of the resulting Small/Typical/Large and Bold/Steady/Wary percentages (`p²`, `2p(1−p)`, `(1−p)²`), each with a habitat-tag override list (reuse the habitat tag input); marking variant (name, description, frequency 0 to 0.2, or none).
- **Game preview panel** (`GamePreview.tsx`): show the stat shape as bars with the shape descriptors, the category and body traits with their weakness/resistance, and a "Roll a sample" button that rolls one level 50 individual locally (the shared pure functions) and shows its phenotype, grades and stats. Raw numbers are fine here: this is an authoring tool, not the game.
- **AI assistant**: `WildkinSuggestionSchema` is derived from the input schema, so the new fields become suggestible automatically. Update the assistant's system prompt (`apps/api/src/manager/assistant.ts`) and the lore brief so it: sums stats to exactly 300 from the creature's anatomy and behaviour, picks a category and 1 to 2 body traits consistent with its anatomy, proposes 1 to 2 placeholder attacks with matching approaches, marks them `proposed`, never makes rarity mean strength, and leaves the gene pool at defaults unless the concept clearly implies a variation. The API must drop a suggested `baseStats` that does not sum to 300 (like it drops other invalid fields).
- **Dashboard**: add a "Battle-ready" stat card (published species with category, traits, stats and attacks) to `STAT_CARDS` and `WildkinStatsSchema`.

# Wildbound editor
The Map Editor (`apps/editor`).

- **Encounter table inspector** (`EncounterTableInspector.tsx`): add a "Wild levels" field pair (min, max) for the table, and per entry an optional "Override levels" toggle revealing min/max. Both use react-hook-form like the rest of the inspector; each commit is one undo step.
- **Habitat inspector** (`HabitatInspector.tsx`): add "License requirement": None, or category select + rank select (2 to 5; rank 1 is everyone).
- **Shared schemas** (`packages/shared/src/world.ts`): `EncounterTableSchema` gains `minLevel`, `maxLevel`; `EncounterEntrySchema` gains nullable `minLevel`, `maxLevel`; `HabitatSchema` gains `licenseRequirement`. Defaults for older draft documents without these fields: table 1 to 10, entry null, habitat null.
- **Validation**: the three level rules from [Wild levels](#wild-levels) in `validation.ts`, shown in the Issues panel like the others.
- **Test panel** (`PreviewPanel.tsx`): show each available Wildkin's level range(s) and, for a locked habitat, "Battle locked: needs Aquatic rank 3".
- **DB persistence** (`packages/db/src/world-repo.ts`): save, load and publish the new columns (draft → published copy SQL included).
- Exercise #9 (`PoiInspector` on react-hook-form) stays as is.

# Wildbound app
The player web game (`apps/web`). Keep the existing handheld "field nav" console look (Press Start 2P + VT323 fonts, chassis, paper screen, design tokens in the Tailwind theme). Every new screen must work at **390 × 844** without horizontal scroll.

## Navigation
- Add a fifth tab, **License**, to `GameLayout.tsx` (`grid-cols-5`; check the labels still fit at 390 px; shorten to icons plus short labels if not).
- New routes: `/play/starter`, `/play/battle/:battleId`, `/play/party/:wildkinId`, `/play/license`.
- If the game state reports an active battle, show a "Battle in progress: return" banner on every tab.

## Radar
- The spawn sheet's **Capture** button becomes **Battle**. Disabled with a reason when: out of range, habitat locked ("Restricted research zone: Aquatic rank 3"), no usable Wildkin ("Your party needs rest: visit a vet or let first aid work"), or a battle is already running.
- After observing, the sheet shows the level and the hints from [Scanner depth](#scanner-depth).
- `in_battle` spawns show an "In battle" marker.
- **POI markers** (new): POIs within 300 m from the game state. Tapping one opens a sheet with: "Search for supplies" (once a day, shows what was found or "Already searched today"), and for field stations "Visit the vet" and "Take an assessment" (links to the License tab with the station in range).
- Remove the old capture code path and the `TODO(you)` hint text about capture (`RadarPage.tsx`).

## Battle screen (`/play/battle/:battleId`)
- Wild Wildkin at the top (sprite, name, level, HP bar, status chip, body trait chips), the player's active Wildkin at the bottom (sprite mirrored, name, level, HP bar, status). Reuse the 128 px sprites; no new art.
- Action menu as four console buttons: **Attack** (lists attacks with approach and the power word), **Switch** (party list; restless and fainted members disabled with the reason), **Satchel** (Trail Ration, capsules with counts), **Escape**.
- When awaiting a replacement, only the party list is shown ("Choose who goes next").
- A battle log in the field-note voice that plays the server's events in order with short delays: attack lines, matchup field notes, "Field note recorded: Plated is weak to Crush", "It broke free!", EXP and level-ups ("Kawi grew to level 7", "Kawi's growth is held at your license cap").
- End screens: **Won** ("The wild Kawi retreated into the canopy."), **Captured** ("Kawi was given first aid and settled into the capsule."), **Lost** ("Your Wildkin are exhausted. They have been given first aid; a vet at a field station can treat them faster."), **Escaped**, **Abandoned**. Each shows EXP gained per Wildkin and a "Back to radar" button.
- Use TanStack Query: `useBattle(id)` and a `useBattleAction()` mutation that sends `{ turn, action }` and updates the cache from the response; invalidate party, inventory, registry and game state when the battle ends.

## Party
- Rows show level, HP bar, status chip (Healthy / Injured / Fainted / Restless) and a "Lead" badge for slot 0.
- New detail page `/play/party/:wildkinId`: sprite, nickname (the existing rename form, exercise #6, stays a `TODO(you)` if still open), species, level with an EXP bar to the next level ("Held at license cap" when applicable), HP bar with a recovery estimate ("Fully recovered in about 3 h", "Cannot be treated yet" for restless), category and the license needed, body traits, attacks, stat descriptors and grades, Build/Temperament/Marking/Vigor/genotype by scanner depth, "Caught at Sunbreak Clearing on 12 Oct, level 6", and a "Use Trail Ration" button.
- Exercises #7 and #8 (rearranging the party) stay open.

## Registry
- Observed species gain a **Field notes** section: category, body traits, per trait the recorded weakness/resistance or "?", a small grid of times of day and weathers in which the player has observed it, and the phenotypes recorded ("Large seen", "Banded markings seen").
- Captured species additionally show the species shape descriptors (exercise #4, the captured-only section, stays open; put the descriptors inside it so they show up once the exercise is done, and say so in the exercise text).

## License (`/play/license`)
- Four cards, one per category: rank (1 to 5), obedience cap, researcher EXP bar to the next threshold, and the next assessment's checklist with progress per requirement ("Observe in 3 weathers: 1/3").
- "Take assessment" is enabled when the EXP threshold and checklist are met **and** the player is at a field station; otherwise the button explains what is missing ("Go to a field station such as East Research Gate").
- Rendering the checklist with progress is exercise #15; ship a plain list of requirement labels with a working button.

## Satchel
- Shows the new items. "Use" on Trail Ration opens a Wildkin picker. Capsules say "Used in battle".

## Starter (`/play/starter`)
- (Only if open decision 1 is confirmed.) Three cards with sprite, name, category, short Registry description and stat descriptors. Confirm dialog, then into the radar.

# API
All under `/api/game`, all behind `requirePlayer`, all checked against the **server-side** position. Request and response schemas live in `packages/shared` and are reused on both sides.

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/state` | Existing radar state, plus: spawn `level` and hints (after observe), `inBattle` flag, `battleLocked` reason, `pois` (within 300 m, distance, inRange, `services`: `pickup`, `vet`, `assessment`, `pickedUpToday`), `activeBattleId` | |
| POST | `/starter` | Choose the starter (decision 1) | 409 `already_has_wildkin` |
| POST | `/spawns/:id/battle` | Start a wild battle | 409 `battle_in_progress`, `habitat_locked`, `no_usable_wildkin`, `out_of_range` |
| GET | `/battles/current` | The active battle or 404 | |
| GET | `/battles/:id` | Battle view (any outcome, own battles only) | 404 |
| POST | `/battles/:id/actions` | `{ turn, action }` → `{ battle, events }` | 409 `stale_turn`, `invalid_action`, `battle_over` |
| GET | `/party` | Extended views (level, HP fraction, status flags, lead) | |
| GET | `/wildkin/:id` | Wildkin detail (scanner depth applied) | 404 |
| POST | `/items/:itemId/use` | `{ wildkinId }` (Trail Ration) | 409 `restless`, `no_items`, `full_hp` |
| POST | `/stations/:poiId/heal` | Vet | 409 `not_a_station`, `out_of_range` |
| POST | `/pois/:poiId/collect` | Daily pickup (exercise #14) | 409 `already_collected`, `out_of_range` |
| GET | `/licenses` | Four license views with progress | |
| POST | `/licenses/:category/assessment` | Take the next assessment | 409 `not_at_station`, `exp_too_low`, `assessment_incomplete`, `max_rank` |
| GET | `/registry` | Existing, plus field notes per observed species | |

- **Remove** `POST /spawns/:id/capture` (capture now happens through battle actions). Remove exercise #3 from the code comments and docs ("superseded by battle capture in 0.3.0").
- `POST /spawns/:id/observe` additionally records condition and phenotype records and awards researcher EXP and the lead's observation EXP, all in its existing transaction.
- `reportPosition` additionally updates the walking meter and awards walking EXP to the lead.
- `gameState` additionally records habitat visits (researcher EXP, lead exploration EXP), ends abandoned battles, and rolls `level`, `genome` and `vigor` for new spawns (`rollGenome` with the spawn habitat's tags).
- The login upsert creates the four license rows for new players.
- Put the battle logic in `apps/api/src/game/battle-service.ts` and the research logic in `apps/api/src/game/research-service.ts`; keep `routes/game.ts` thin. Reuse `loadActionableSpawn`.
- Every write that touches several rows is one Prisma interactive transaction, and every "only once" rule (daily pickup, first records, assessment completion, one active battle) is backed by a **unique constraint**, not just a check, so concurrent requests cannot double-award.

# Database
One new migration `packages/db/prisma/migrations/5_battle_system/migration.sql` plus the matching `schema.prisma` changes. Write CHECK constraints and partial unique indexes by hand in the SQL (Prisma cannot express them), as the existing migrations do.

| Table | Change |
|---|---|
| `creatures` | `category text not null default 'TBD'`, `body_traits text[] not null default '{}'`, `base_stats jsonb` (null = not set), `attacks jsonb not null default '[]'`, `gene_pool jsonb not null default` the default pool |
| `encounter_tables` | `min_level int not null default 1`, `max_level int not null default 10`, CHECK `1 <= min_level <= max_level <= 100` |
| `encounter_entries` | `min_level int`, `max_level int`, CHECK both null or `1 <= min <= max <= 100` |
| `habitats` | `license_requirement jsonb` (null = none) |
| `spawn_status` enum | add `in_battle` |
| `spawns` | `level int not null default 5`, `genome jsonb not null default` a typical genome, `vigor jsonb not null default` all 2. Expire all currently `active` spawns in the migration (they predate genetics) |
| `captured_wildkin` | `level int not null default 5`, `exp int not null default 125`, `genome jsonb`, `vigor jsonb`, `current_hp int not null`, `hp_updated_at timestamptz not null default now()`, `caught_level int`, `caught_habitat_id uuid`, `caught_at_time_of_day text`, `caught_at_weather text`. Backfill existing rows: level 5, typical genome, vigor 2, full HP for their species at level 5 (compute in the migration script or a one-off seed step) |
| `players` | `rested_charges int not null default 0`, `last_battle_exp_at timestamptz`, `walk_meter_m real not null default 0`, `walk_meter_day text` |
| `battles` (new) | `id uuid pk`, `player_id`, `spawn_id`, `kind text` (`wild`), `status` enum (`active`, `won`, `lost`, `captured`, `escaped`, `abandoned`), `turn int`, `state jsonb`, `created_at`, `updated_at`. Partial unique index: one `active` battle per player |
| `researcher_licenses` (new) | `player_id`, `category`, `rank int` CHECK 1 to 5, `exp int`; pk `(player_id, category)`. Backfill rank 1 for every existing player |
| `assessment_completions` (new) | pk `(player_id, category, rank)`, `completed_at` |
| `exp_events` (new) | see [EXP log](#exp-log); index `(player_id, day_key, source)` |
| `matchup_records` (new) | pk `(player_id, body_trait, approach)`, `effect`, `recorded_at` |
| `condition_records` (new) | pk `(player_id, creature_id, kind, value)` (`kind` is `time_of_day` or `weather`), `recorded_at` |
| `phenotype_records` (new) | pk `(player_id, creature_id, trait)` (`small`, `large`, `bold`, `wary`, `marking`), `recorded_at` |
| `habitat_visits` (new) | pk `(player_id, habitat_id, day_key)`, `first_ever bool`, `visited_at` |
| `poi_pickups` (new) | pk `(player_id, poi_id, day_key)`, `items jsonb`, `collected_at` |

- Seed (`packages/db/seed/*.json`, `packages/db/src/seed-data.ts`): the five species get category, traits, stats, attacks and gene pools; the Mabunyi tables get level ranges. `pnpm db:seed --force --publish` must produce a playable world.
- `pnpm db:reset` must drop the new tables too.
- Update `packages/db/src/testing.ts` helpers so integration tests can create players with licenses, captured Wildkin at a given level/HP, and battles in a given state.

# Exercises (fill in the blanks)
Like v0.1.0, some parts are deliberately left as `TODO(you)` for the project owner to implement by hand, to practise React, Node.js, Express, Prisma, TanStack Query, react-hook-form, Zod and Tailwind. For each one:
- Write step-by-step instructions in a `TODO(you)` comment right where the code goes, with hints and pointers to a finished example nearby.
- Ship a **working fallback** so the game runs while the exercise is open, and say in the UI or docs what is missing.
- Pure-logic exercises get a `*.exercise.test.ts` (run by `pnpm test:exercises`, excluded from `pnpm test:unit`). API exercises get an integration test that **expects 501** for now, with a comment on what to assert once implemented.
- List them in a new `patches/0.3.0/EXERCISES.md` (same format as `patches/0.1.0/EXERCISES.md`) and in `docs/12-exercises-and-roadmap.md`, continuing the numbering.

| # | Exercise | Where | Practises | Fallback until done |
|---|---|---|---|---|
| 10 | Weighted turn order `attackOrder(spdA, spdB, random)` and `escapeChance` | `packages/world/src/battle/turn-order.ts` | Pure TS, probability | Faster always goes first (ties: player); escape is a flat 50% |
| 11 | Matchup multiplier `matchupMultiplier(approach, traits)` | `packages/world/src/battle/matchups.ts` | Lookup tables, `reduce` | Returns 1 (no weaknesses, so nothing to discover yet) |
| 12 | In-battle capture chance `battleCaptureChance(...)` | `packages/world/src/battle/capture.ts` | Pure TS, clamping | `rarityBase + observedBonus` only (capture still possible) |
| 13 | Lazy natural recovery `currentHp(row, maxHp, now, restless)` | `packages/world/src/recovery.ts` | Dates, pure functions | Returns the stored HP (no natural recovery; vets still heal) |
| 14 | Daily POI pickup route | `apps/api/src/routes/game.ts` → `POST /pois/:poiId/collect` | Express, Prisma interactive transactions, compound unique keys, `increment` with a cap | 501; the radar sheet explains it is not built yet (players still get the starter inventory and rank-up grants) |
| 15 | Assessment checklist with progress | `apps/web/src/features/license/AssessmentChecklist.tsx` | React, TanStack Query data, Tailwind tokens | Plain list of requirement labels; the button still works |
| 16 | Live stat budget counter | `apps/manager/src/features/wildkin/BaseStatsEditor.tsx` | react-hook-form `useWatch`, Zod refinements | Four inputs; the budget error appears on submit |

Also:
- **Retire exercise #3** (capture): superseded by battle capture. Remove its `TODO(you)`, its 501 test and its UI hint; mark it retired in both exercise lists.
- Exercises #1, #2, #4, #6, #7, #8 and #9 stay open and unchanged (update their text where 0.3.0 changes the surrounding code, for example #4's section now also holds stat descriptors, and #1 now also unlocks weather assessment requirements).
- Implement everything else in this brief **completely**; only the seven listed parts are left open.

# Deferred (do not build in 0.3.0)
- **0.4.0:** the skill system (four skills per species from the reusable effect vocabulary, passives, learning by level, limited uses), status sources, NPC friendly battles and sparring circuits, Temperament-driven wild behaviour, research assignments, field techniques.
- **Later (to be announced):** currency and shops (only once a complementary system is designed), breeding (the allele groundwork exists), evolutions, minigames at POIs (via `interactionId`), bond descriptors, license-based tracking and longer observe range, attractants, player-vs-player battles, marking-variant art, the Phaser field view.
- Do not add placeholder UI for deferred features.

# Testing
- **Unit (`packages/world`, `packages/shared`)**, with `seededRandom`: stat formula and grades; genome and vigor rolls (habitat override order, frequencies over many seeded rolls within a tolerance), phenotypes, `inheritGenome`; EXP curve and level from EXP, cap clamping; every EXP source and cap, gap scaling, rested bonus, shared and catch-up EXP; level bands and level rolls in `planSpawns`; validation rules for level ranges; damage formula against the worked example; dodge; every status effect and duration; turn resolution order (priority actions before attacks, a fainted Wildkin does not attack, replace is free, wild faint ends the battle and blocks capture); capture formula against the worked examples; recovery; researcher EXP and the habitat split; assessment progress and clamping (with five species, every 0.3.0 assessment must be completable for every category); pickup loot by POI type. Exercise functions are tested in `*.exercise.test.ts` only.
- **Integration (`apps/api/test`, `packages/db/test`)** against real PostGIS: the migration on a database with old data (backfills); start a battle (every guard), play turns to `won`, `captured`, `lost`, `escaped`; stale-turn double submit; abandoned battle release; spawn frozen while in battle; capture creates the Wildkin with genome, level and HP and updates the Registry; EXP events written with the right sources and caps; restless rules (cannot battle, cannot be healed, unfrozen by a rank-up with `hp_updated_at` reset); vet range and healing; assessment success and every failure code; license-locked habitat (observe allowed, battle refused); Creature Manager publish rules (stats must sum to 300); editor save/publish of level ranges and license requirements; the starter flow.
- **Manager and editor unit tests** for the new form helpers.
- Run `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, and `pnpm test:exercises` (only the open exercises may fail). Then a Playwright run of the web flow at 390 × 844 with a fake geolocation of `14.6518, 121.0444` (the Sunbreak POI): starter → radar → observe → battle → capture → party detail → license, plus a lost battle and a vet visit at East Research Gate.

# Documentation
Update, as the earlier versions did:
- `docs/README.md` (version covered: v0.3.0, new pages), `00-plain-english-overview.md` (battles, capture, licenses, healing in plain English; the "what is finished" table), `01-architecture.md` (new modules, the battle request lifecycle), `02-world-model.md` (level ranges, license requirements, new creature fields), `03-database.md` (every new table and column, the ER diagram), `04-api-reference.md` (every new and removed endpoint with shapes and errors), `05-map-editor.md` (new inspector fields, the "easy entry habitat" design rule, validation), `06-web-game.md` (new screens and flows), `07-game-systems.md` (every formula and constant from this brief, with worked examples, plus the "All tunable numbers" table and the EXP split SQL), `09-wildkin-and-content.md` (the five species' new data), `11-cookbook.md` (recipes: add an attack approach or body trait, add an item, add an assessment requirement type, tune EXP), `12-exercises-and-roadmap.md`, `13-creature-manager.md` (section 9, publish rules), `glossary.md`.
- Consider a new page `docs/14-battles-and-research.md` for the battle engine, licenses and assessments if `07` grows too long.
- Charts (`docs/images/generate-charts.mjs`): add an EXP-per-level curve and a turn-order odds chart, then regenerate.
- Root `README.md`, `apps/*/README.md`, `packages/*/README.md`.
- Bump the version to `0.3.0` in the root `package.json`.
- The canon documents and lore brief as described in [Lore and canon updates](#lore-and-canon-updates).

# Implementation notes
- Update this file state to "Implemented" when all of the requirements listed above are implemented.
- **Ask the questions in [Open decisions](#open-decisions-confirm-before-implementing) first**, and any other questions before implementing if things are not clear. Record the answers in this file before starting.
- Update the necessary documentations, especially the ones in the `docs` folder and all README files.
- If this requires multiple passes, don't update yet the state of this file.
  - After every pass, create the handover files just within this folder (`patches/0.3.0/HANDOVER-pass-N.md`) and add in the necessary implementation details as a prompt to be executed on a clear session. If ready to clear, say "Ready to clear".
  - A sensible pass split: (1) shared contracts, pure `packages/world` logic and its tests, migration and seed; (2) API services, routes and integration tests; (3) web, editor and manager UI, exercises, Playwright check; (4) lore, canon documents and all documentation.
- Use multiple agents in parallel to delegate certain tasks (for example: pure world logic, the migration and seed, manager UI, editor UI, web UI, canon document edits).
- Keep every formula constant in one exported object (`GAME_RULES`, `EXP_RULES`, `BATTLE_RULES`, `RESEARCH_RULES`) so tuning after play-testing never touches logic.
- Never trust the client: battle outcomes, rolls, EXP, capture and positions are computed on the server. Hidden information (wild stats, genome, vigor, capture chance, unrecorded matchups, fields above the player's scanner depth) is sent as `null` or not at all.
- Keep the existing code style: Zod contracts in `packages/shared`, pure rules in `packages/world`, thin Express routes, TanStack Query hooks in `lib/queries.ts`, react-hook-form with `zodResolver`, Tailwind tokens instead of raw colours.
- No new art is needed in this version. If you decide some art is necessary, use the cheapest available PixelLab algorithm and always check the remaining credits before doing the generation.
- Do not use em dashes in any written text (docs, UI copy, canon edits, comments).
