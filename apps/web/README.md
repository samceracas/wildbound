# @wildbound/web

> Detailed documentation: [docs/06-web-game.md](../../docs/06-web-game.md).

The WILDBOUND game: username login → location sharing → starter Wildkin → radar (with wandering Wildkin and POIs), wild battles with capture, Registry, Satchel, Party (with a detail page per Wildkin) and License. Mobile-first (designed at 390px), styled as a handheld "field nav" console after the six Stitch mockups in [`patches/0.1.0/mockups/`](../../patches/0.1.0/mockups/) (`1-login` … `6-party`, each as `.html` + `.png`), using the "Field Registry" design tokens.

Parts are intentionally unfinished: look for `TODO(you)` (see [`patches/0.1.0/EXERCISES.md`](../../patches/0.1.0/EXERCISES.md) and [`patches/0.3.0/EXERCISES.md`](../../patches/0.3.0/EXERCISES.md)). In this app: #4 (captured-only Registry section, now with the stat shape descriptors), #6 (rename form), #8 (rearrange the party) and #15 (assessment checklist with progress).

## Stack

React 19, Vite 7, React Router 7, TanStack Query 5, react-hook-form + `@hookform/resolvers/zod`, Tailwind CSS 4 + shadcn/ui (new-york), lucide icons, MapLibre GL JS 5, `@wildbound/shared` for every request/response schema.

## Layout

```
src/
  main.tsx                 QueryClientProvider → LocationProvider → RouterProvider
  router.tsx               / (login) → /location → /play/* ; guards send you back a step when needed.
                           /play/starter, /play/battle/:battleId, /play/party/:wildkinId, /play/license are new in v0.3.0
  styles.css               Field Registry tokens (deep forest, warm paper, ink, …) mapped onto shadcn variables,
                           plus console tokens (chassis, lcd, screen) and pieces (.scanlines, .inset-panel, .raised-panel)
  lib/
    api.ts                 Typed fetch client; every response is parsed with Zod; ApiError(status, code, details)
    queries.ts             TanStack Query keys + hooks (useMe, useGameState, useObserve, useStarterOptions, useChooseStarter,
                           useStartBattle, useBattle, useCurrentBattle, useBattleAction, useWildkin, useUseItem, useVisitVet,
                           useCollectPoi, useLicenses, useTakeAssessment, …)
    assets.ts              Wildkin art URLs (API first), the API → static → placeholder fallback, registry number formatting
  components/
    ui/                    shadcn components restyled to the design system (button, badge, card, input)
    WildkinImage.tsx       <img> for Wildkin art with the fallback chain
    layout/Shell.tsx       Console chassis (Shell), LcdScreen, ConsoleButton (A/B face buttons), Led, ScreenTitle
    field.tsx              Shared field pieces: HpBar, ProgressBar, Chip, ConditionChip, DialoguePanel, BackLink, Panel,
                           errorText, roughDuration
  features/
    auth/                  LoginPage (react-hook-form + zod), RequireSession
    location/              LocationProvider (watchPosition + Permissions API), LocationGatePage, usePositionReporter
    game/                  GameLayout (console header, PWR/GPS/weather/time strip, five cartridge tabs, starter redirect,
                           "Battle in progress" banner, pause overlay), useClock, weather/time icons
    starter/               StarterPage (choose Kawi, Mimu or Kantar at level 5)
    radar/                 RadarMap (MapLibre markers that walk/flip/fade, POI signs, "In battle" tag), RadarPage,
                           SpawnSheet (Observe / Battle with the reason it is disabled, level and hints, "It wandered off."),
                           PoiSheet (search for supplies, vet, assessment link)
    battle/                BattlePage (wild and active Wildkin, Attack / Switch / Satchel / Escape, replace list, log, end
                           screens), battle-log.ts (events → field-note lines, + tests)
    registry/              RegistryPage (index roster with silhouettes + filters), RegistryDetailPage (dossier card, field notes,
                           captured-only section: exercise #4)
    inventory/             InventoryPage ("Satchel": capsules "Used in battle", Trail Ration "Use" with a Wildkin picker)
    party/                 PartyPage (level, HP, condition, Lead badge; exercise #8), WildkinDetailPage, RenameForm (exercise #6)
    license/               LicensePage (four category cards, "Take assessment"), AssessmentChecklist (exercise #15)
public/
  player/head.png          PixelLab player head (map marker)
  wildkin/icons/*.png      PixelLab face icons (64px) of the seed species: fallback, and imported into the DB by the seed
  wildkin/sprites/*.png    PixelLab full sprites (128px), same
```

## How the pieces fit

- **Sessions.** Vite proxies `/api` to the API (`vite.config.ts`), so requests are same-origin and the httpOnly `wb_session` cookie is first-party. Override the target with `API_PROXY_TARGET`.
- **Location.** `LocationProvider` owns one `watchPosition` for the whole app and listens to permission changes. `status === "active"` is the only playable state; anything else shows the "Survey paused" overlay.
- **Position reports.** `usePositionReporter` sends fixes to `POST /api/game/position` (throttled, plus a 30 s heartbeat while still). The server decides whether to accept them; the radar shows where the *server* thinks you are.
- **Radar.** `useGameState` polls `/api/game/state` every 10 s. Markers are MapLibre `Marker`s synced in effects; the map itself is created once.
- **Wandering (experimental since v0.2.0, kept in v0.3.0).** Spawns move on the server between polls. The radar walks each marker to its new position after its own random delay and for a distance-based time, so Wildkin do not move in sync (one `requestAnimationFrame` loop), mirrors the icon when it walks left, fades markers in and out, and shows "It wandered off." when the selected spawn disappears. Respects `prefers-reduced-motion`.
- **Registry.** Fields the player has not unlocked arrive as `null` from the API; unknown species render as CSS silhouettes.
- **Battles.** The server resolves every turn. `useBattleAction(battle)` sends `{ turn, action }`, writes the returned battle into the cache, and when an outcome is set invalidates party, Wildkin, inventory, state, registry and licenses; on `stale_turn` or `battle_over` it refetches. `BattlePage` plays the returned events one by one (900 ms apart) as field-note lines (`battle-log.ts`) and moves the HP bars with them, then switches to the server's view. The game never shows raw stat numbers: HP is a bar, stats are words and grades.
- **Hidden details.** What the player may see about their own Wildkin depends on their license rank in its category (scanner depth); hidden fields arrive as `null` and render as "? Rank N".
- **Fonts.** Press Start 2P (console labels) and VT323 (dot-matrix body text) come from Google Fonts with Inter/Noto Serif (`index.html`), exposed as `font-pixel` and `font-vt`.
- **Forms.** Use the shared Zod schema as the resolver so client and server validation match (see `LoginPage`).

## Run

```bash
pnpm dev:api        # the game needs the API
pnpm dev:web        # http://localhost:5174
pnpm --filter @wildbound/web build
```

Geolocation needs `https://` or `localhost`. To play on a desktop, use Chrome devtools → *More tools → Sensors* and set a location inside a published region (e.g. `14.6518, 121.0444` in the seeded Mabunyi world). Move in small steps.

## Art

Wildkin art is served by the API from the database: `wildkinIcon(id)` / `wildkinSprite(id)` return `/api/art/wildkin/<id>/icon.png` / `sprite.png` (through the Vite proxy). If that fails the image falls back to the static PNG in `public/wildkin/`, then to a neutral "?" placeholder (`wildkinArtFallback`, used by `<WildkinImage>` and the radar markers). So a Wildkin created and illustrated in the Creature Manager shows up without a rebuild.

The seed icons, sprites and the player head were generated with PixelLab (Pixen model, the cheapest option) from the descriptions in the Wildkin Bible (now `docs/WILDBOUND_Wildkin_Bible_v1.2.docx`). No new art was made for v0.3.0: the battle screen reuses the 128 px sprites (mirrored for your side), and marking variants show as a text badge. They are placeholders until approved, as the Bible requires. The Kantar sprite was regenerated in v0.1.0 pass 2 so its pale side markings read clearly. New art is generated in the Creature Manager ([docs/13](../../docs/13-creature-manager.md#pixellab-art)).
