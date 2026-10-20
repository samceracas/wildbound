# @wildbound/manager

> Detailed documentation: [docs/13-creature-manager.md](../../docs/13-creature-manager.md).

The WILDBOUND Creature Manager: an encyclopedia-style admin tool for writing Wildkin entries (the Wildkin Bible, but editable), drafting and publishing them into the game's `creatures` table, brainstorming them with an AI assistant that knows the Wildbound canon, and generating their pixel art with PixelLab. Dark "field research" theme, desktop-first.

## Stack

React 19, Vite 7, React Router 7, TanStack Query 5, react-hook-form + `@hookform/resolvers/zod`, Tailwind CSS 4 + shadcn/ui (new-york, restyled dark), radix-ui, lucide icons, `@wildbound/shared` for every request/response schema (`packages/shared/src/wildkin.ts`).

## Run

```bash
pnpm dev:api        # the manager talks to the API
pnpm dev:manager    # http://localhost:5175  (or: pnpm --filter @wildbound/manager dev; also part of `pnpm dev`)
pnpm --filter @wildbound/manager build    # or pnpm build:manager (also part of `pnpm build`)
pnpm --filter @wildbound/manager typecheck
pnpm test:unit      # includes src/lib/wildkin-form.test.ts
```

### Environment (repo-root `.env`)

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | manager | Where the Vite server proxies `/api` (default `http://localhost:4000`; `API_PROXY_TARGET` overrides it). |
| `VITE_MANAGER_API_URL` | manager | Optional: call an API on another origin directly (needs CORS) instead of through the proxy. |
| `VITE_EDITOR_TOKEN` | manager | Default editor token. Can be overridden in **Settings** (sidebar); stored in localStorage `wildbound.editorToken`, shared with the editor. |
| `GROQ_API_KEY` | API | Enables the AI assistant. Without it the "Generate with AI" button is disabled with a hint. |
| `GROQ_MODEL` | API | Optional Groq model override (default `llama-3.3-70b-versatile`; any Groq chat model with JSON mode). |
| `LORE_SOURCE` | API | `brief` (default): the condensed `docs/lore/assistant-brief.md` (~3,300 tokens per request in total). `full`: the canon `.docx` files (~9,300 tokens, too big for Groq's free tier). |
| `LORE_MAX_CHARS` | API | Upper bound on lore characters per assist request (default 30000; matters for `full`). |
| `PIXELLAB_API_KEY` | API | Enables PixelLab art generation. Without it the art button is disabled with a hint. |

The manager calls `/api/...` on its own origin and the Vite dev/preview server proxies it to the API (like the game), so `CORS_ORIGINS` does not need `:5175`. Restart the API after changing any API-side key; the sidebar shows whether the AI assistant and PixelLab art are on (`GET /api/manager/config`).

## Pages

- **`/` Dashboard.** Stat cards (total, published, drafts, unpublished changes, with art, deleted), rarity breakdown, next registry number, recently edited entries. Cards are a list (`STAT_CARDS` in `DashboardPage.tsx`), so adding one is a one-liner.
- **`/wildkin` List.** Icon, `No. 001`, name, classification, rarity and status badges. Search by name, "Show deleted" toggle, Edit, Delete (confirm → soft delete) and Restore.
- **`/wildkin/new`, `/wildkin/:id` Entry.** The Bible entry as eight sections (Identity, Habitat, Diet & temperament, Activity & rarity, Appearance, Behaviour, Ecology & field, Game), with selects for every enumerated property, a habitat-tag combobox (suggested tags + custom slugs), free tag inputs, list editors for open questions and skills, and 0–10 spawn-modifier boxes (blank = 1). The canonical ID is derived from the name on new entries until edited and is immutable afterwards. Leaving with unsaved changes asks first.

## Draft → publish

Entries live in their own table. **Save draft** creates/updates the entry only. **Publish** saves, then copies the entry's game fields (marked **IN GAME** on the form: id, registry number, name, registry description, habitat tags and summary, rarity, activity pattern, spawn modifiers, skills, movement style) into the `creatures` table that the editor and game read; the **In-game preview** panel shows how they look in the game's Registry, list and radar. Publishing requires `name`, `registryDescription` and `habitatSummary` (marked `*`); the API answers `publish_incomplete` with an issue list, shown in the action bar. Editing a published entry marks it **Published · edited** until you publish again. **Delete** offers two choices: **Move to deleted** (soft delete of the entry and its creature: the species stops spawning and leaves the editor's pickers, players who met it keep it in their Registry; restore it from the list with "Show deleted") or **Delete permanently** (erases the entry, its art, the creature and everything referencing it, after showing what that is). Both free the registry number for a new Wildkin.

**Art generation runs in the background.** The generate dialog can be minimized into a dock at the bottom right, so you can keep using other pages; the dock shows progress, then the result. Closing or reloading the tab cancels running generations (the API stops the PixelLab calls and saves nothing).

## AI assist

The panel at the top of the entry page sends your idea plus the current (valid, non-empty) form values to `POST /api/manager/assist`. The API prompts Groq with the Wildbound docs as context and validates the answer; the suggestion is merged into the form (marked dirty, nothing is saved), with the assistant's notes (canon conflicts, overlaps with existing Wildkin) and any dropped fields shown below. The registry number is never suggested; the id is only taken on a new entry whose id you have not typed yourself. The API builds the prompt from the canon documents in `docs/` (Bible > First Field Survey > Biology & Ecology, trimmed to `LORE_MAX_CHARS`), the existing roster and your form values; see the docs for details.

## PixelLab art

**Generate sprites with PixelLab** first fetches the balance (`GET /api/manager/art/balance`) and confirms the cost ("This uses 2 generations; you have N left"). Pick icon (64px) and/or sprite (128px) and optional extra direction. Art is generated from the **saved** entry (physical description, visual hook, design notes), so unsaved changes are saved as a draft first; new entries must be saved before generating. The PNGs are stored in the database (`wildkin_art`, replacing the previous image of that kind), served publicly by the API at `/api/art/wildkin/<id>/<kind>.png` (`wildkinArtPath`, with `?v=<version>` for cache busting) and drawn with `image-rendering: pixelated`. The game uses the same URLs, so new art appears there without a rebuild. A balance too low for the request answers 402 (`insufficient_credits`); each Pixen image costs one generation.

## Layout

```
src/
  main.tsx                 QueryClientProvider → TooltipProvider → RouterProvider
  router.tsx               / · /wildkin · /wildkin/new · /wildkin/:id
  styles.css               Dark field-research tokens (canvas, panel, line, accent, gold, …)
  lib/
    api.ts                 Bearer-token fetch client, Zod-validated; ApiRequestError(status, code, issues)
    queries.ts             Query keys + hooks; mutations invalidate stats, lists and the entry
    wildkin-form.ts        Pure form helpers (slugify, defaults, suggestion merge, spawn modifiers, status) + tests
  components/
    ui/                    shadcn-style components (button, input, textarea, select, dialog, alert-dialog, popover, …)
    layout/                AppLayout (sidebar, PageHeader), TokenSettings
  features/
    dashboard/             DashboardPage
    wildkin/               WildkinListPage, WildkinEditPage, AssistPanel, ArtPanel, fields, common (badges, art, errors)
```
