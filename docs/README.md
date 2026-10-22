# WILDBOUND documentation

This folder explains how the whole WILDBOUND monorepo works, so you can change it or add features without reading every
source file first. Each page starts with a plain-English summary, then goes into the technical detail.

> **Version covered:** v0.3.0 (Map Editor, Creature Manager, API and the playable web game).
> New in v0.3.0: **stats, genetics, levels and EXP, wild battles, capture through battle, healing and Field Registry
> licenses**. Every species has a stat shape (HP, Attack, Defense, Speed summing to 300), a category, body traits,
> placeholder attacks and a gene pool, authored in the [Creature Manager](13-creature-manager.md#section-9-battle--genetics).
> Each wild Wildkin is an individual with a level, genome and vigor. Players start with a level 5 companion, weaken
> Wildkin in turn-based battles before capturing them, heal through first aid and vets, and earn license ranks through
> researcher EXP and assessments at field stations. See [14 · Battles and research](14-battles-and-research.md).
> Seven new exercises (#10 to #16); exercise #3 is retired.
> Earlier: v0.2.0 added the Creature Manager, Wildkin art served from the database and wandering spawns.
> When code and docs disagree, the code wins. Please fix the doc in the same change.

## Where to start

| You are… | Read these, in order |
|---|---|
| **Not a programmer** (designer, writer, producer, curious) | [00 · WILDBOUND in plain English](00-plain-english-overview.md) → [09 · Wildkin and world content](09-wildkin-and-content.md) → [13 · Creature Manager](13-creature-manager.md) → [Glossary](glossary.md) |
| **Creating or editing Wildkin** | [13 · Creature Manager](13-creature-manager.md) → [09 · Wildkin and world content](09-wildkin-and-content.md) → [11 · Cookbook: add a Wildkin](11-cookbook.md#add-a-new-wildkin) |
| **A developer new to the repo** | [00](00-plain-english-overview.md) → [01 · Architecture](01-architecture.md) → [10 · Development guide](10-development-guide.md) → [11 · Cookbook](11-cookbook.md) |
| **Changing game rules** (spawning, wandering, weather, anti-cheat) | [07 · Game systems](07-game-systems.md) → [08 · Security model](08-security.md) |
| **Changing battles, EXP or licenses** | [14 · Battles and research](14-battles-and-research.md) → [07 · Game systems](07-game-systems.md) → [11 · Cookbook](11-cookbook.md) |
| **Changing data or the database** | [02 · World model](02-world-model.md) → [03 · Database](03-database.md) |
| **Working on a screen** | [05 · Map Editor](05-map-editor.md), [06 · Web game](06-web-game.md) or [13 · Creature Manager](13-creature-manager.md) |
| **Calling the API** | [04 · API reference](04-api-reference.md) |
| **Implementing the exercises** | [12 · Exercises and roadmap](12-exercises-and-roadmap.md) |

## All pages

| # | Page | What it covers |
|---|---|---|
| 00 | [WILDBOUND in plain English](00-plain-english-overview.md) | What the game is, the four apps, how a Wildkin ends up on your screen. No code. |
| 01 | [Architecture](01-architecture.md) | Monorepo layout, package dependencies, runtime topology, tech stack and why, request lifecycle, design principles |
| 02 | [World model and data contract](02-world-model.md) | Regions, habitats, POIs, encounter tables, conditions, creatures; draft vs published; the shared Zod schemas |
| 03 | [Database](03-database.md) | Entity-relationship diagram, every table (incl. the Wildkin encyclopedia and art), PostGIS, migrations, seed, save/publish transactions, how to change the schema |
| 04 | [API reference](04-api-reference.md) | Every endpoint (game, editor, Creature Manager, public art) with request/response shapes, auth, status codes, error handling, examples |
| 05 | [Map Editor](05-map-editor.md) | Editor architecture: Zustand store, undo/redo, the imperative map controller, inspectors and forms, Test mode, Wildkin from the manager |
| 06 | [Web game](06-web-game.md) | Screen flow, routing guards, location tracking, position reporting, radar (walking markers, POIs), starter, battle screen, Registry, Satchel, Party and Wildkin details, License tab, visual design system, Wildkin art loading |
| 07 | [Game systems](07-game-systems.md) | Coordinate resolution, encounter math, spawning lifecycle, wild levels, wandering spawns, time and weather, anti-teleport, Registry unlocking, stats, genetics, levels and EXP, every tunable number |
| 08 | [Security model](08-security.md) | Threat model, editor token, player sessions, server authority, known gaps before going public |
| 09 | [Wildkin and world content](09-wildkin-and-content.md) | The five Wildkin (with their stats, categories, body traits, attacks and gene pools), spawn modifiers, movement styles, the Mabunyi seed world, art, game canon documents |
| 10 | [Development guide](10-development-guide.md) | Setup, environment variables, scripts, testing strategy, conventions, troubleshooting |
| 11 | [Cookbook: how to change things](11-cookbook.md) | Step-by-step recipes (add a Wildkin, an item, an endpoint, a screen, a column…) with "what can break" checklists |
| 12 | [Exercises and roadmap](12-exercises-and-roadmap.md) | The deliberately unfinished `TODO(you)` parts, how to verify each, and what is planned next |
| 13 | [Creature Manager](13-creature-manager.md) | The Wildkin encyclopedia app: pages, the "Battle & genetics" section, encyclopedia vs creatures, draft/publish/soft delete, AI assistant (Groq), PixelLab art, troubleshooting |
| 14 | [Battles and research](14-battles-and-research.md) | The battle engine (turns, damage, matchups, statuses, capture), healing, Field Registry licenses, researcher EXP, assessments, scanner depth |
| – | [Glossary](glossary.md) | Every WILDBOUND and technical term in one place |

## Images

- `images/charts/*.svg`: charts generated from the seed data by [`images/generate-charts.mjs`](images/generate-charts.mjs).
  Re-run `node docs/images/generate-charts.mjs` after changing `packages/db/seed/*.json` or the rules they illustrate.
- `images/screenshots/*.png`: screenshots of the running editor and game (v0.1.0, offline, so the base map is blank)
  and of the Creature Manager (`manager-*.png`, v0.2.0, 1400 × 900).
- The original UI mockups live in [`patches/0.1.0/mockups/`](../patches/0.1.0/mockups/). Wildkin art lives in the
  database (served at `/api/art/wildkin/<id>/<icon|sprite>.png`); the seed copies are in
  [`apps/web/public/`](../apps/web/public/).

Diagrams are written in [Mermaid](https://mermaid.js.org/), which GitHub, GitLab and most Markdown editors (VS Code with
a Mermaid extension, Obsidian) render as pictures.

## Other documentation in the repo

| File | What |
|---|---|
| [`/README.md`](../README.md) | Project summary and quick start |
| `apps/*/README.md`, `packages/*/README.md` | Short per-package READMEs (layout, scripts) |
| [`patches/0.1.0/`](../patches/0.1.0/) | The v0.1.0 brief (`instructions.md`), handover notes, `EXERCISES.md`, mockups and `DESIGN.md` |
| [`patches/0.2.0/`](../patches/0.2.0/) | The v0.2.0 brief (Creature Manager, wandering) |
| [`patches/0.3.0/`](../patches/0.3.0/) | The v0.3.0 brief (stats, genetics, battles, capture, licenses; decisions under "Answers"), handover notes and `EXERCISES.md` |
| `docs/WILDBOUND_*.docx` (this folder) | Game canon (Word): [`WILDBOUND_Wildkin_Bible_v1.2.docx`](WILDBOUND_Wildkin_Bible_v1.2.docx), [`WILDBOUND_The_First_Field_Survey_Source_of_Truth.docx`](WILDBOUND_The_First_Field_Survey_Source_of_Truth.docx), [`WILDBOUND_Wildkin_Biology_and_Ecology_Reference_v1.1.docx`](WILDBOUND_Wildkin_Biology_and_Ecology_Reference_v1.1.docx). The Creature Manager AI assistant reads them with `LORE_SOURCE=full` |
| [`docs/lore/assistant-brief.md`](lore/assistant-brief.md) | The condensed canon (about 2,000 tokens) the AI assistant reads by default |
