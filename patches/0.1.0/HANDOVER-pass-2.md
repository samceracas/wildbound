# v0.1.0 handover after pass 2

Status of `patches/0.1.0/instructions.md`: **Implemented**. The `TODO(you)` exercises are left unimplemented on purpose
(see `EXERCISES.md`). No further pass is needed. This file records what pass 2 did.

Branch: `claude/admiring-turing-t5pc39`.

## Done in pass 2

1. **Stitch mockups.** The Google hosts were reachable this time. All six screens are in `mockups/` as
   `1-login` … `6-party` (`.html` + `.png`). Stitch's own captures are 429px wide; the Login and Location captures are
   blank, so use the `.html` for those. (`cdn.tailwindcss.com` is blocked in the sandbox; the HTML was rendered for
   comparison by compiling its inline Tailwind config locally.)
2. **Web restyle to match the mockups** (`apps/web`). Handheld "field nav" console: chassis, LCD setup screens, console
   header + PWR/GPS/weather/time strip, cartridge tabs with live counters, paper screen with scanlines, A/B face
   buttons, Press Start 2P + VT323 fonts. The changes per screen:
   - **Radar:** a sector header and zoom/recenter buttons. Markers have name tags (a registry number until observed),
     and Observe/Capture open in a dialogue panel.
   - **Registry:** a roster with filters and a progress bar, and a dossier detail card.
   - **Satchel:** a category filter and an item detail panel.
   - **Party:** the lead card, numbered rows and empty slots.

   Logic, routes and exercises are unchanged. The mockups' placeholder content (Pokémon-style names, stats) was not copied.
3. **Editor stack** (`apps/editor`). The look is the same as before (checked with before/after Playwright screenshots).
   - **Styling:** Tailwind CSS 4 with the old design as `@theme` tokens.
   - **Server state:** TanStack Query for load/save/validate/publish/resolve (`src/lib/queries.ts`).
   - **Zustand:** keeps only the local editing state.
   - **Forms:** the Region, Habitat and EncounterTable inspectors use react-hook-form + zodResolver with the shared
     schemas. Each commit is one undo step.
   - **New exercise #9:** `PoiInspector` is left for you.
   - **Improvements:** spawn modifiers are shown per Wildkin in the encounter-table inspector. The Test panel runs
     `applySpawnModifiers`; until exercise #2 is done it shows raw weights and a hint.
4. **Art.** Kantar sprite regenerated once with PixelLab Pixen 128×128 (now with readable pale side markings).
   1 generation used; 183 left of the 2000/cycle allowance (resets 2026-10-21).
5. **Docs.**
   - The root, `apps/web` and `apps/editor` READMEs are updated.
   - `mockups/DESIGN.md` lists the screen files.
   - `EXERCISES.md` has row #9.

## Verified

`pnpm typecheck`, `pnpm test:unit` (108), `pnpm test:integration` (36), `pnpm build` (editor + web): all pass.
Playwright run of the web flow at 390×844 with a fake geolocation of `14.6518, 121.0444`.

## If you continue later

- Start with the exercises in `EXERCISES.md` (suggested order there).
- Environment notes from `HANDOVER-pass-1.md` still apply (local Postgres + PostGIS, `WEATHER_API_URL=off` in the
  sandbox).
