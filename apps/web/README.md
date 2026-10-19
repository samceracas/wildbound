# @wildbound/web

The WILDBOUND game: username login → location sharing → radar, Registry, Satchel and Party. Mobile-first (designed at 390px), styled as a handheld "field nav" console after the six Stitch mockups in [`patches/0.1.0/mockups/`](../../patches/0.1.0/mockups/) (`1-login` … `6-party`, each as `.html` + `.png`), using the "Field Registry" design tokens.

Parts are intentionally unfinished: look for `TODO(you)` (see [`patches/0.1.0/EXERCISES.md`](../../patches/0.1.0/EXERCISES.md)).

## Stack

React 19, Vite 7, React Router 7, TanStack Query 5, react-hook-form + `@hookform/resolvers/zod`, Tailwind CSS 4 + shadcn/ui (new-york), lucide icons, MapLibre GL JS 5, `@wildbound/shared` for every request/response schema.

## Layout

```
src/
  main.tsx                 QueryClientProvider → LocationProvider → RouterProvider
  router.tsx               / (login) → /location → /play/* ; guards send you back a step when needed
  styles.css               Field Registry tokens (deep forest, warm paper, ink, …) mapped onto shadcn variables,
                           plus console tokens (chassis, lcd, screen) and pieces (.scanlines, .inset-panel, .raised-panel)
  lib/
    api.ts                 Typed fetch client; every response is parsed with Zod; ApiError(status, code)
    queries.ts             TanStack Query keys + hooks (useMe, useGameState, useObserve, useCapture, …)
    assets.ts              Icon/sprite URLs, registry number formatting
  components/
    ui/                    shadcn components restyled to the design system (button, badge, card, input)
    layout/Shell.tsx       Console chassis (Shell), LcdScreen, ConsoleButton (A/B face buttons), Led, ScreenTitle
  features/
    auth/                  LoginPage (react-hook-form + zod), RequireSession
    location/              LocationProvider (watchPosition + Permissions API), LocationGatePage, usePositionReporter
    game/                  GameLayout (console header, PWR/GPS/weather/time strip, cartridge tabs, pause overlay), useClock, weather/time icons
    radar/                 RadarMap (MapLibre markers), RadarPage (Observe / Capture sheet)
    registry/              RegistryPage (index roster with silhouettes + filters), RegistryDetailPage (dossier card)
    inventory/             InventoryPage ("Satchel")
    party/                 PartyPage, RenameForm (exercise)
public/
  player/head.png          PixelLab player head (map marker)
  wildkin/icons/*.png      PixelLab face icons (64px)
  wildkin/sprites/*.png    PixelLab full sprites (128px)
```

## How the pieces fit

- **Sessions.** Vite proxies `/api` to the API (`vite.config.ts`), so requests are same-origin and the httpOnly `wb_session` cookie is first-party. Override the target with `API_PROXY_TARGET`.
- **Location.** `LocationProvider` owns one `watchPosition` for the whole app and listens to permission changes. `status === "active"` is the only playable state; anything else shows the "Survey paused" overlay.
- **Position reports.** `usePositionReporter` sends fixes to `POST /api/game/position` (throttled, plus a 30 s heartbeat while still). The server decides whether to accept them; the radar shows where the *server* thinks you are.
- **Radar.** `useGameState` polls `/api/game/state` every 10 s. Markers are MapLibre `Marker`s synced in effects; the map itself is created once.
- **Registry.** Fields the player has not unlocked arrive as `null` from the API; unknown species render as CSS silhouettes.
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

Icons, sprites and the player head were generated with PixelLab (Pixen model, the cheapest option) from the descriptions in `documents/WILDBOUND_Wildkin_Bible_v1.1.docx`. They are placeholders until approved, as the Bible requires. The Kantar sprite was regenerated in v0.1.0 pass 2 so its pale side markings read clearly.
