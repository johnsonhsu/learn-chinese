# Writing Challenge (✍️)

> Living doc — kept current as the app changes. Refresh on significant changes/deploys.

The flagship module: stroke-by-stroke **handwriting practice** on real
Taiwan-Traditional sentences. It asks the platform's offline data layer what
character the learner most needs to drill next (the parity char-selection smarts),
gets a natural bank sentence containing that character, and renders it for
character-by-character writing with HanziWriter validation, zhuyin hints, and
audio. It was the **first module migrated onto the shared UI kit**.

See also: [../README.md](../README.md) (the module contract + how to add one),
[../../ARCHITECTURE.md](../../ARCHITECTURE.md) (the module system, "the smarts",
the bake pipeline), and [../../platform/src/ui/README.md](../../platform/src/ui/README.md)
(the UI kit).

---

## Front-end (`src/`)

- `src/index.ts` — the module's default export (`export { default } from './App.tsx'`),
  plus a named re-export of `PracticePage` that **copybook reuses** as its writing
  screen.
- `src/App.tsx` — the landing screen (`<ModuleScreen>` + `<Button>`) ↔ the practice
  flow.
- `src/pages/PracticePage.tsx` — the polished char-by-char writing screen (the
  shared one copybook re-exports).
- `src/components/WritingCanvas.tsx` — the HanziWriter integration (stroke-by-stroke
  quiz, leniency, fail handling).
- `src/components/` — the module's own widgets (`CharacterDisplay`, `AudioButton`,
  `MenuBar`, `ListManager`).
- `src/i18n/` — module-local `en.ts` / `zh-TW.ts`, driven by the `language` prop.
- `src/utils/` — `speech`, `zhuyin`, `levels`, `profile`, and a dev-only `api.ts`
  server fallback.

The module reads on-device data (char stats, rankings, the next sentence) through
`useOffline()` (`@platform/offline`) — no server in production. The character
ranking, mastery scoring, "known" criteria, and parity sentence selection are all
**platform/shared logic** (`@shared/character-stats/*`); the module just renders
what the data layer hands it. Back is **module-owned** (`<ModuleScreen onBack>` on
the main screen, `<BackButton>` deeper) — the platform draws no back button.

---

## Curriculum content is **not** the module's anymore

The practice content — the sentence bank (`bank_sentences`), the TOCFL word list
(`tocfl_words`), and its per-character index (`char_words`) — used to live inside
`writing-challenge.db`. It was **extracted to platform-owned `platform/content.db`**
so every module is a pure *consumer* of one shared curriculum (writing-challenge
drills it, practice-english reads it for cloze, copybook is unrelated, the dev
admin curates it). See [../../ARCHITECTURE.md §3.5](../../ARCHITECTURE.md).

- The dev server reads/writes that content **only** through
  `@shared/character-stats/content-db` (or by opening `content.db` directly) —
  never its own DB. Curation happens via the platform's `/api/content/admin/*`
  routes, not this module's routes.
- **`writing-challenge.db` still ships**, but it now carries **only** its own
  `module_settings` (+ dev-only per-profile tables). The bank / TOCFL tables are
  **stripped at bake time** and ship in `content.db` instead; an old cached module
  DB just goes stale and re-downloads on the next `contentHash`.

---

## Server (`server/`) — dev only

These Express routes run **only** under the dev server (`npm run dev`); in
production Cloudflare Pages serves static assets and these routes do not exist.

- `server/index.ts` — the module's `routes` (an Express `Router`) + `initDb()`,
  mounted at `apiPrefix` `/api/writing-challenge`. Per-profile / per-module
  endpoints: profile, char stats, module settings, the per-profile admin
  (`/admin/*`).
- `server/db.ts` — opens the module DB (`module_settings` + dev per-profile tables);
  curriculum reads go through `@shared/character-stats/content-db`.
- `server/word-selector.ts`, `server/zhuyin-server.ts` — dev-time word selection
  and zhuyin helpers (the selector reads curriculum from `content.db`).
- `server/../scripts/` — dev-time data tooling (`import-tocfl.ts`,
  `tag-grammar.ts`, `extract-chars.ts`, `generate-sentences.ts`, `build-data.ts`):
  all read/write curriculum through the shared `content-db` accessor.

The module's own admin UI surface (the full writing-challenge engine settings +
the embedded Sentence-Bank editor) lives on the platform side
(`platform/src/admin/`, `StrokePracticeAdmin`); see
[../../ARCHITECTURE.md §8.4](../../ARCHITECTURE.md).
