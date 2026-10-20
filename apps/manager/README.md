# @wildbound/manager

The WILDBOUND Creature Manager: an encyclopedia-style admin tool for writing Wildkin entries (the Wildkin Bible, but editable), drafting and publishing them into the game's `creatures` table, brainstorming them with an AI assistant that knows the Wildbound canon, and generating their pixel art with PixelLab. Dark "field research" theme, desktop-first.

## Stack

React 19, Vite 7, React Router 7, TanStack Query 5, react-hook-form + `@hookform/resolvers/zod`, Tailwind CSS 4 + shadcn/ui (new-york, restyled dark), radix-ui, lucide icons, `@wildbound/shared` for every request/response schema (`packages/shared/src/wildkin.ts`).

## Run

```bash
pnpm dev:api        # the manager talks to the API
pnpm dev:manager    # http://localhost:5175  (or: pnpm --filter @wildbound/manager dev)
pnpm --filter @wildbound/manager build
```

### Environment (repo-root `.env`)

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | manager | API base URL (default `http://localhost:4000`). Called directly with CORS, like the Map Editor. |
| `VITE_EDITOR_TOKEN` | manager | Default editor token. Can be overridden in **Settings** (sidebar); stored in localStorage `wildbound.editorToken`, shared with the editor. |
| `GROQ_API_KEY` | API | Enables the AI assistant. Without it the "Generate with AI" button is disabled with a hint. |
| `GROQ_MODEL` | API | Optional Groq model override. |
| `PIXELLAB_API_KEY` | API | Enables PixelLab art generation. Without it the art button is disabled with a hint. |

`http://localhost:5175` must be in the API's allowed CORS origins.

## Pages

- **`/` Dashboard.** Stat cards (total, published, drafts, unpublished changes, with art, deleted), rarity breakdown, next registry number, recently edited entries. Cards are a list (`STAT_CARDS` in `DashboardPage.tsx`), so adding one is a one-liner.
- **`/wildkin` List.** Icon, `No. 001`, name, classification, rarity and status badges. Search by name, "Show deleted" toggle, Edit, Delete (confirm → soft delete) and Restore.
- **`/wildkin/new`, `/wildkin/:id` Entry.** The Bible entry as eight sections (Identity, Habitat, Diet & temperament, Activity & rarity, Appearance, Behaviour, Ecology & field, Game), with selects for every enumerated property, a habitat-tag combobox (suggested tags + custom slugs), free tag inputs, list editors for open questions and skills, and 0–10 spawn-modifier boxes (blank = 1). The canonical ID is derived from the name on new entries until edited and is immutable afterwards. Leaving with unsaved changes asks first.

## Draft → publish

Entries live in their own table. **Save draft** creates/updates the entry only. **Publish** saves, then copies the entry's game fields (id, registry number, name, description, habitat tags and summary, rarity, activity pattern, spawn modifiers, skills, movement style) into the `creatures` table that the editor and game read. Publishing requires `name`, `identity`, `physicalDescription` and `habitatSummary` (marked `*`); the API answers `publish_incomplete` with an issue list, shown in the action bar. Editing a published entry marks it **Published · edited** until you publish again. Delete is a soft delete; restore it from the list.

## AI assist

The panel at the top of the entry page sends your idea plus the current (valid, non-empty) form values to `POST /api/manager/assist`. The API prompts Groq with the Wildbound docs as context and validates the answer; the suggestion is merged into the form (marked dirty, nothing is saved), with the assistant's notes (canon conflicts, overlaps with existing Wildkin) and any dropped fields shown below. On edit pages the id and registry number are never overwritten.

## PixelLab art

**Generate sprites with PixelLab** first fetches the balance (`GET /api/manager/art/balance`) and confirms the cost ("This uses 2 generations; you have N left"). Pick icon (64px) and/or sprite (128px) and optional extra direction. Art is generated from the **saved** entry (physical description, visual hook, design notes), so unsaved changes are saved as a draft first; new entries must be saved before generating. Images are served publicly by the API (`wildkinArtPath`) and drawn with `image-rendering: pixelated`.

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
