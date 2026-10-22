# v0.3.0 handover after pass 3

Status of `patches/0.3.0/instructions.md`: **not finished** (its first line stays "# State: Not implemented" until pass 4 is done).
Branch: `claude/determined-wozniak-bbi5cf`.

## Decisions already made with the project owner (do not re-ask)

Recorded under "Answers" in `instructions.md`; see `HANDOVER-pass-1.md` for the details. In short:
- Starter Kawi/Mimu/Kantar at level 5 (confirmed).
- **License cap CHANGED: EXP beyond the cap is lost, no banked EXP.**
- Matchups are recorded per body trait.
- Scanner depth depends on license rank.
- `ASSESSMENT_RELAX_WEATHER` defaults to `true`.

## Done in pass 3 (the UI)

**Checks run:**
- `pnpm typecheck`: every package passes, `apps/web` included.
- `pnpm test:unit`: 295 passing.
- `pnpm test:integration`: 93 passing.
- `pnpm build`: web, editor and manager all build.
- `pnpm test:exercises`: only the open exercises fail (#1, #2, #10 to #13).
- **Playwright run** of the web flow at 390 x 844, fake geolocation 14.6518, 121.0444 (Sunbreak):
  - It covered: starter, radar, observe, battle, capture, party detail, registry, license, satchel, a lost battle (party HP set to 1 first), walking to East Research Gate, the POI sheet (pickup shows the exercise #14 note), the vet heal, and the license page at the station.
  - Every screen was checked for horizontal overflow: none.
  - The only console errors were blocked OSM tiles (sandbox) and the expected 401 from `/api/auth/me` before login.
  - The script lived in the session scratchpad. Recreate it if needed:
    - log in with `#username` and submit;
    - `getByRole("button", { name: /^battle$/i })` (face letters are `aria-hidden`);
    - Wildkin markers are `.maplibregl-marker` elements that contain `[data-role=art]`;
    - POI markers are labelled `"<name>, field station, in range"`.

**Fixed along the way (from the Playwright run):**
- The player marker covered the POI you stand on. It now has `pointer-events: none` and sits above the POI sign.
- POI name tags covered Wildkin. POI markers now have z-index 0, Wildkin 1, the player 2, and the POI tags ignore taps.
- The radar sheets' corner tag was clipped. `DialoguePanel` now scrolls an inner body (`bodyClassName`).

### Web (`apps/web`)

**`lib/api.ts`**
- The capture path is gone.
- `ApiError` carries `details`.
- New client calls: starter, battles (start, current, get, action), Wildkin detail, use item, vet, POI collect, licenses, assessment.

**`lib/queries.ts`**
- New hooks:
  - `useStarterOptions`, `useChooseStarter` (sets `needsStarter: false` in the state cache so the layout does not bounce back).
  - `useStartBattle`, `useBattle(id)`, `useCurrentBattle`.
  - `useBattleAction(battle)`: sends `{ turn, action }` and writes the battle into the cache. When `outcome` is set it invalidates party, Wildkin, inventory, state, registry and licenses. On `stale_turn` or `battle_over` it refetches the battle.
  - `useWildkin`, `useUseItem`, `useVisitVet`, `useCollectPoi`, `useLicenses`, `useTakeAssessment`.

**`components/field.tsx`**
- Shared pieces: `HpBar`, `ProgressBar`, `Chip`, `ConditionChip`, `DialoguePanel`, `BackLink`, `Panel`, `errorText`, `roughDuration`.

**Routes**
- New routes: `/play/starter`, `/play/battle/:battleId`, `/play/party/:wildkinId`, `/play/license`.
- `GameLayout` redirects to `/play/starter` when `state.needsStarter`.
- It shows a "Battle in progress / Return" banner whenever `activeBattleId` is set and you are not on the battle screen.
- There are five tabs: the label and its counter stack, so they fit at 390 px. The Satchel counter sums all capsules. The header says v0.3.

**Radar**
- `SpawnSheet.tsx`:
  - Observe, plus Battle (or Return when a battle is running).
  - The Battle button is disabled with a reason, in order: battle running, out of range, in battle, `battleLocked`, no usable Wildkin. The reasons come from `battleBlockedReason`.
  - After observing it shows the level, the hints, researcher EXP and the lead's EXP.
  - On `battle_in_progress` it navigates to `details.battleId`.
- `PoiSheet.tsx`: "Search for supplies" (once a day; a 501 explains exercise #14), "Visit the vet" (healed count plus the Wildkin that cannot be treated) and "Take an assessment" (a link to the License tab).
- `RadarMap.tsx`: POI markers and the "· In battle" tag.
- The header shows `habitatLocked`.

**Battle**
- `features/battle/BattlePage.tsx`: wild Wildkin at the top, yours at the bottom (mirrored), HP bars, status and trait chips.
- The Attack, Switch, Satchel and Escape menus. Satchel has a Trail Ration picker and the capsules.
- A replace-only party list when `awaiting === "replace"`.
- The log plays the events with a 900 ms delay. HP bars follow the events (`applyEvent`) and switch to the server view at the end.
- The end screen uses `BATTLE_END_LINES`, shows `expGained`, "Meet your new companion" after a capture, and "Back to radar".
- `battle-log.ts` turns events into field-note lines, including "Field note recorded: Plated is weak to Crush" and "...'s growth is held at your license cap". Unit-tested in `battle-log.test.ts`.

**Party**
- Rows show level, HP bar, condition chip, a Lead badge (`member.lead`), the restless reason and a Details link.
- `WildkinDetailPage.tsx`:
  - EXP bar, or "Held at license cap".
  - HP with a recovery estimate, or "Cannot be treated yet".
  - License needed, body traits with reasons, attacks.
  - The scanner table: hidden fields read "? Rank N".
  - Build, temperament, marking and genotype.
  - The capture record ("Entrusted by the rangers" for the starter).
  - "Use Trail Ration".
- `RenameForm.tsx` is unchanged (exercise #6).

**Registry**
- A "Field notes" section: category, each trait with weak to / resists or "?", a time-of-day and weather grid, and recorded phenotypes.
- Exercise #4's TODO now covers `statShape`, and the fallback JSON dump includes it.

**License**
- `LicensePage.tsx`: four cards with rank, cap, researcher EXP bar, checklist, "Take assessment" (`canTakeAssessment`, `blockedReason`), and the summary after a pass.
- **Exercise #15:** `AssessmentChecklist.tsx` has a `TODO(you)`; the fallback shows the plain labels.

**Satchel**
- Capsule icons, "Used in battle" on capsules, and "Use" on Trail Ration opens a Wildkin picker.

**Starter**
- Three cards (sprite, category, description, stat descriptors), a confirm dialog, then the radar.

### Editor (`apps/editor`)

- `src/lib/level-form.ts` (+ 17 tests) holds the helpers:
  - level parsing and range checks;
  - override toggle values;
  - band labels ("Lv 3-8");
  - license requirement select values to and from the requirement;
  - "Battle locked: needs Aquatic rank 3".
- `EncounterTableInspector.tsx`: "Wild levels" (min, max) that commits on blur, and a per-entry "Override levels" toggle. Each change is one undo step, and bad ranges show inline and are not committed.
- `HabitatInspector.tsx`: "License requirement" (None or category, plus rank 2 to 5), and table ranges in its table list.
- `PreviewPanel.tsx`: level bands per Wildkin, the lock note, and each entry's effective range.
- The Issues panel already showed the three new rules (message plus code).
- `packages/world/src/validation.ts` `schemaIssues` now sets `entityId` on `invalid-level-range` schema issues, so the panel can open the table (with a test).

### Manager (`apps/manager`)

- `@wildbound/world` is now a dependency (`pnpm-lock.yaml` updated).
- **Section 9 "Battle & genetics"** in `WildkinEditPage.tsx`:
  - Category and body traits (max 2, matchup hints).
  - `BaseStatsEditor`.
  - `AttacksEditor`.
  - `GenePoolEditor` (sliders, the Small/Typical/Large and Bold/Steady/Wary readouts, habitat-tag overrides, marking variant), in `BattleFields.tsx`.
- **Exercise #16:** `BaseStatsEditor.tsx` has a `TODO(you)`. The fallback has four inputs, Set/Clear (`baseStats` can be null), and the Zod error on submit.
- `GamePreview.tsx`: a "Battle & genetics" block with stat bars and descriptors, traits with weakness and resistance, attacks, and "Roll a sample" (a level 50 individual).
- The Dashboard has a "Battle-ready" card.
- `lib/wildkin-form.ts`:
  - completes older entries with the schema defaults;
  - percentage, override and marking helpers;
  - `baseStatsTotal`.
  - Tests are in `wildkin-form.test.ts` and `battle-preview.test.ts`.

### Exercises

`patches/0.3.0/EXERCISES.md`:
- #10 to #16, with their fallbacks.
- #3 retired.
- #1 now also unlocks the weather requirements (`ASSESSMENT_RELAX_WEATHER`).
- #4 now also holds the stat descriptors.
- #5 is marked done.

### Known gap (for pass 4)

The scanner rule says Temperament is only named from license rank 2. Two places name it at rank 1:
- The researcher EXP reason from `recordPhenotypes` in `apps/api/src/game/research-service.ts`, e.g. "Wary Kantar recorded".
- The Registry field notes' `phenotypes` list ("Bold seen", built from `fieldKnowledge`).

The fix:
- Keep recording, but word bold/wary records as "Temperament variant of Kantar recorded" / "Temperament variant seen" when the player's rank in that category is below `SCANNER_DEPTH.temperament`.
- Add an integration test.

## Exercise check

`HANDOVER-pass-1.md` describes it. Pass 3 did not touch the exercise functions or battle tests, so it was not re-run. Never commit the solutions.

---

## Not done: pass 4 prompt (lore, canon and documentation)

Copy everything below into a fresh session on branch `claude/determined-wozniak-bbi5cf`.

---

You are continuing WILDBOUND v0.3.0. First read:
- `patches/0.3.0/instructions.md` in full. Decisions are under "Answers". Decision 2 differs from the brief's recommendation: EXP beyond the license cap is lost and there is no banked EXP, so write no "Riverkin grew to level 24" and no banked-EXP rank-up anywhere in the docs or canon.
- Then `patches/0.3.0/HANDOVER-pass-1.md`, `HANDOVER-pass-2.md`, `HANDOVER-pass-3.md` and `EXERCISES.md`, for what exists.

Do not re-ask the decisions. Passes 1 to 3 delivered the code (shared contracts, world logic, migration, seed, API, web, editor, manager, exercises). Now do **pass 4: lore, canon documents and all documentation**, then close the version. Use parallel agents where it helps (canon `.docx` edits, docs pages, charts).

1. **Small API fix first** (the pass 3 "Known gap"): do not name Temperament phenotypes below license rank 2.
   - Places: the researcher EXP reason in `recordPhenotypes` and the Registry field notes `phenotypes`.
   - Keep recording; only the wording changes.
   - Add an integration test.
   - Run `pnpm test:integration`.
2. **Canon `.docx` edits** with the docx skill, exactly as the brief's "Lore and canon updates" section says:
   - Wildkin Bible v1.1 to v1.2:
     - shared combat constraints;
     - "Categories and body traits" with the matchup table and reasons;
     - "Individual variation";
     - a "Game data (PROPOSED)" block per species with the values from the seed;
     - the section 7 and 8 changes.
   - Biology and Ecology Reference v1.0 to v1.1:
     - 4.3 Individual variation;
     - the new "Capture, care and bonding" section;
     - the narrowed open question.
   - First Field Survey: the appendix "The Field License (PROPOSED for v0.3.0)", including the ranger entrusting the starter companion, first aid, vets and friendly-battle culture.
   - Use the ESTABLISHED/PROPOSED/TBD labels as the brief says.
   - Bump the file names and title pages, and delete the old version files.
   - Fix references: grep for `v1.1.docx` and `v1.0.docx` in docs and code.
   - Keep the file-name words `WILDBOUND_`, `Wildkin_Bible`, `First_Field_Survey` and `Biology_and_Ecology`, because `apps/api/src/manager/lore.ts` relies on them.
3. **`docs/lore/assistant-brief.md`:**
   - Measure its tokens before and after; keep it around 2,000.
   - Add the stat budget rule, the four categories, the five body traits with weakness and resistance, the six approaches, the placeholder-attack rule (1 to 2 attacks, power 30 to 60, approach matching the anatomy, PROPOSED), the genetics model in two sentences, the marking-variant rule (cosmetic, named after a visible difference, frequency 0.02 to 0.1), the capture and care paragraph, and the friendly-battle line.
4. **Glossary** (`docs/glossary.md`): every term listed in the brief's "Glossary" section.
5. **Docs**: every page in the brief's "Documentation" section:
   - `docs/README.md`: version v0.3.0, new pages.
   - `00-plain-english-overview.md`: the "what is finished" table.
   - `01-architecture.md`: the battle request lifecycle.
   - `02-world-model.md`.
   - `03-database.md`: every new table and column, the ER diagram.
   - `04-api-reference.md`: every new and removed endpoint with request and response shapes and error codes.
     - Errors carry `details`: `battle_in_progress` (`battleId`), `habitat_locked` (`requirement`), `assessment_incomplete` (`requirements`), `exp_too_low` (`exp`, `threshold`), `stale_turn` (`turn`).
     - `POST /spawns/:id/capture` is removed.
   - `05-map-editor.md`: the new inspector fields, the "every region needs an easy entry habitat" rule, the validation rules, and how to lock a habitat for testing.
   - `06-web-game.md`: starter, radar Battle button and POI sheet, battle screen, party detail, License tab, Satchel, battle banner.
   - `07-game-systems.md`: every formula and constant with worked examples, the "All tunable numbers" table, and the EXP split SQL by source for the last 7 days from `exp_events`.
   - `09-wildkin-and-content.md`: the five species' data.
   - `11-cookbook.md`: add an approach or body trait, add an item, add an assessment requirement type, tune EXP.
   - `12-exercises-and-roadmap.md`: #10 to #16, #3 retired, #4 and #1 notes, #5 done; mirror `patches/0.3.0/EXERCISES.md`.
   - `13-creature-manager.md`: section 9 and the publish rules (a hand-edited DB may need the battle fields before republishing).
   - Consider `docs/14-battles-and-research.md` if `07` grows too long.
6. **Charts:** in `docs/images/generate-charts.mjs`, add an EXP-per-level curve and a turn-order odds chart, then regenerate.
7. **READMEs:** the root `README.md`, `apps/*/README.md` and `packages/*/README.md`.
8. **Close the version:**
   - Bump the root `package.json` version to `0.3.0`, and the app/package versions if they follow it (check `apps/web/package.json`, which is still 0.2.0).
   - Run `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build` and `pnpm test:exercises` (only open exercises fail).
   - Then change the first line of `instructions.md` to "# State: Implemented".
   - Do not use em dashes anywhere.
9. Commit and push to `claude/determined-wozniak-bbi5cf`. Write `patches/0.3.0/HANDOVER-pass-4.md` summarising the pass, and say "Ready to clear".

## Environment notes for the next session

- **Local Postgres without Docker:**
  1. `apt-get update && apt-get install -y postgresql-16-postgis-3`
  2. `service postgresql start`
  3. `su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres'\" -c 'CREATE DATABASE wildbound' -c 'CREATE DATABASE wildbound_test'"` (the databases may already exist; then run the steps after it separately)
  4. `cp .env.example .env`
  5. `pnpm install`
  6. `pnpm db:migrate && pnpm db:migrate --test && pnpm db:seed --force --publish`
- The migration test creates and drops a scratch database `<test db>_migration`; the test DB user needs CREATEDB (the local `postgres` superuser has it).
- Run the API with `WEATHER_API_URL=off` (Open-Meteo is blocked in the sandbox). OSM tiles are blocked too, so the radar map has no basemap there.
- Integration tests: `npx vitest run --project integration`.
- **Playwright:** the global `playwright` module is at `/opt/node22/lib/node_modules/playwright`. Launch with `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`. The web dev server is on 5174 and the API on 4000.
