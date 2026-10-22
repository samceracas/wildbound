# v0.3.0 handover after pass 4

Status of `patches/0.3.0/instructions.md`: **implemented** (its first line is now "# State: Implemented").
Branch: `claude/determined-wozniak-bbi5cf`.

## Decisions (unchanged)

Recorded under "Answers" in `instructions.md`. Decision 2 differs from the brief: EXP beyond the license cap is lost, there is no banked EXP, and the docs and canon say so.

## Done in pass 4 (lore, canon and documentation)

### API fix (the pass 3 "Known gap")
- Temperament phenotypes are still recorded at every rank, but are only named from `SCANNER_DEPTH.temperament` (rank 2).
- `apps/api/src/game/research-service.ts`: `phenotypeWord(trait, creature, rank)`; `recordPhenotypes` takes `rank`. Below rank 2 the researcher EXP reason reads "Temperament variant of Kawi recorded".
- `apps/api/src/game/views.ts`: `FieldKnowledge.licenses`; below rank 2 the Registry field notes read "Temperament variant seen" (listed once).
- New integration test in `apps/api/test/battle.test.ts`; the capture test now expects "Temperament variant seen" at rank 1.

### Canon (`docs/*.docx`, edited in place with the docx skill)
- `WILDBOUND_Wildkin_Bible_v1.2.docx` (v1.1 deleted): shared combat constraints (budget 300), "Categories and body traits" with the matchup table, "Individual variation", a "Game data (PROPOSED)" block per species, section 7 and 8 changes.
- `WILDBOUND_Wildkin_Biology_and_Ecology_Reference_v1.1.docx` (v1.0 deleted): 4.3 Individual variation; new section 6 "Capture, Care, and Bonding" (later sections renumbered, so Open Questions is now section 16); bonding question narrowed.
- `WILDBOUND_The_First_Field_Survey_Source_of_Truth.docx`: "Appendix: The Field License (PROPOSED for v0.3.0)" with the ranger, the first-aid rule, the entrusted companion, friendly-battle culture and vets.
  - **Open canon conflict for the owner:** Chapter 5 calls Kawi Sam's first Wildkin ("Not borrowed. Not assigned. Found."). The appendix flags that Chapter 5 needs a deliberate revision if the appendix is accepted.
- No references to the old file names remain; the `lore.ts` file-name words are kept.

### Lore brief and docs
- `docs/lore/assistant-brief.md`: 1,491 to 2,095 tokens (cl100k). Stat budget, categories, body traits, approaches, placeholder-attack rule, genetics, marking rule, capture and care, friendly battles.
- Every page in the brief's "Documentation" section, plus `08-security.md` and `10-development-guide.md`. The new page `docs/14-battles-and-research.md` covers the battle engine, matchups, licenses, assessments and scanner depth; `07-game-systems.md` holds the formulas, "All tunable numbers" and the EXP split SQL.
- Charts: `exp-curve.svg` and `turn-order-odds.svg` from `docs/images/generate-charts.mjs` (it copies the L^3 curve and 20 per rank by hand; keep them in sync).
- Root, app and package READMEs; glossary (34 terms, alphabetical).
- Versions: root and every app/package `package.json` are 0.3.0.

### Checks
- `pnpm typecheck`: passes.
- `pnpm test:unit`: 295 passing.
- `pnpm test:integration`: 94 passing.
- `pnpm build`: passes.
- `pnpm test:exercises`: only the open exercises fail (#1, #2, #10 to #13).
- Relative links and anchors in all Markdown docs resolve. No em dashes in changed text files.

## Notes for the owner (found while documenting)
- While exercise #11 is open, `recordMatchups` can never be met, so no license can go past rank 2.
- While exercise #13 is open, the Wildkin detail page still shows a recovery estimate, although HP does not recover naturally yet (vets still heal).
- The `trapped` battle event and the `status` "inflicted" event exist in the contracts but are never sent in 0.3.0.

Ready to clear.
