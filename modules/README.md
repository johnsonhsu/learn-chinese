# Modules

> 繁體中文: [README.zh-TW.md](./README.zh-TW.md)

> Living doc — kept current as the app changes. Refresh on significant changes/deploys.

A **module** is a self-contained learning activity that the platform discovers,
lists on the home screen, and mounts. Modules share the platform's profiles,
language, UI kit, and on-device data layer; they don't manage any of that
themselves. This doc covers the five existing modules, the module contract, and
how to add a new one.

See also: [../ARCHITECTURE.md](../ARCHITECTURE.md) (the module system end-to-end)
and [../platform/src/ui/README.md](../platform/src/ui/README.md) (the UI kit).

---

## The five existing modules

### writing-challenge (✍️) — `modules/writing-challenge/`
The flagship. Stroke-by-stroke handwriting practice on bank sentences, driven by
the parity char-selection smarts (it asks the offline data layer what to practice
next, then renders a sentence to write). It's the most built-out module and was the
**first migrated onto the shared UI kit**.
- `src/App.tsx` — landing (`<ModuleScreen>` + `<Button>`) ↔ practice flow.
- `src/pages/PracticePage.tsx` — the polished char-by-char writing screen (also
  re-exported and reused by copybook).
- `src/components/WritingCanvas.tsx` — HanziWriter integration.
- `server/` (dev only) — per-profile / per-module routes (profile, char stats,
  module settings). The **curriculum content is no longer the module's** — the
  sentence bank, TOCFL words, and `char_words` are **platform-owned** in
  `platform/content.db` (curated via the platform's `/api/content/admin/*` routes;
  see [../ARCHITECTURE.md §3.5](../ARCHITECTURE.md)). The module's dev server reads
  that content through `@shared/character-stats/content-db`, never its own DB.
- Ships `writing-challenge.db`, but it now carries **only** its own
  `module_settings` (+ dev-only per-profile tables) — the bank / TOCFL tables are
  stripped at bake time and ship in `content.db` instead.

### word-sets (📚) — `modules/word-sets/`
Browse curated vocabulary categories; tap a word for audio + writing practice.
- `src/App.tsx`, `src/pages/CategoryGrid.tsx`, `src/pages/WordList.tsx`.
- Reads on-device content via `useOffline()` (`@platform/offline`), with a server
  fallback (`src/utils/api.ts`) for the dev environment.
- `server/` (dev only) — category + word CRUD for the admin UI.
- Ships `word-sets.db`, baked for offline.

### practice-english (🔤) — `modules/practice-english/`
English cloze spelling game (fill missing letters) with an on-screen keyboard and
audio.
- `src/App.tsx`, `src/pages/LandingPage.tsx`, `src/pages/PracticePage.tsx`.
- `src/cloze.ts` — the blank-the-letters logic; `src/components/Keyboard.tsx`.
- Has its **own** lightweight `src/offline/` provider (reads the shared
  platform-owned curriculum in `content.db`); no shipped DB of its own, no server
  routes.

### copybook (📝) — `modules/copybook/`
Bring-your-own-text verbatim writing; paste any text and write it, or **Generate**
a Taiwan-Traditional sentence with Gemini.
- `src/App.tsx`, `src/pages/InputPage.tsx`, `src/pages/PracticePage.tsx`.
- Reuses writing-challenge's `PracticePage` for the writing screen.
- `server/gemini.ts` — the **portable** Gemini generator + validator (Traditional-
  only). Backs both the dev Express route (`server/index.ts`) and the prod
  Cloudflare Pages Functions (`platform/functions/api/copybook/`).
- No shipped DB.

### my-characters (📊) — `modules/my-characters/`
Your personal progress dashboard. Shows every character you've practiced as a
stats table and a tile grid (mastery / retention scores, known vs learning),
with a tap-to-practice drill.
- `src/App.tsx` — the stats-table ↔ grid views, with `<CharTile>` and the shared
  `<PracticeModal>`.
- Reads on-device char stats + rankings via `useOffline()` (`@platform/offline`)
  and scores them with the shared mastery engine (`@shared/character-stats/mastery`).
- No shipped DB, no server routes — pure consumer of on-device progress.

---

## The module contract

### 1. `module.json` (required)

```json
{
  "name": "my-module",
  "displayName": "My Module",
  "displayNameZh": "我的模組",
  "icon": "🎯",
  "apiPrefix": "/api/my-module",
  "dbFile": "my-module.db",
  "order": 5
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | stable id = folder name; used as the registry/glob key |
| `displayName` / `displayNameZh` | yes | home-screen labels (EN / 繁中) |
| `icon` | yes | emoji on the module card |
| `apiPrefix` | yes | dev-server mount point for `server/` routes |
| `dbFile` | only if you ship a DB | add it to the bake `sources` list too (see below) |
| `order` | yes | home-screen sort order |

### 2. `src/index.ts` — default export (required)

The platform's glob consumes `src/index.ts`'s **default export**, which must be a
React component taking `ModuleProps`:

```ts
interface ModuleProps {
  userId: number;       // active profile id
  language: Language;   // 'zh-TW' | 'en' — UI language, owned by the platform
  onExit?: () => void;  // call to return to the home / module picker
}
```

```ts
// modules/my-module/src/index.ts
export { default } from './App.tsx';
```

Extra named exports are fine (writing-challenge exports its shared `PracticePage`)
— only `.default` registers the module.

### 3. `server/index.ts` — `routes` + `initDb` (optional, dev only)

If your module needs dev-time server routes (e.g. for the admin/curation UI):

```ts
import { Router } from 'express';
export const routes = Router();
routes.get('/something', (_req, res) => res.json({ ok: true }));
export function initDb() { /* migrations / seeding, called once at boot */ }
```

The dev server's module-loader mounts `routes` at your `apiPrefix` and calls
`initDb()` on startup. **These routes do not exist in production** (Cloudflare
Pages serves static assets only). If you need an online capability in prod, add a
Cloudflare Pages Function under `platform/functions/api/<module>/…` — and reuse
the same portable helper your dev route uses, as copybook does (see
[../ARCHITECTURE.md §6](../ARCHITECTURE.md)).

### 4. Using the platform's facilities

- **UI kit** — `import { Button, ModuleScreen, Card, BackButton, CharTile } from '@platform/ui/index.ts'`.
  Don't import the kit's CSS (it's loaded once by the platform). Use `var(--token)`
  for styling; never fork the design tokens. Components inherit the active theme
  (§5.5) automatically — don't theme by hand. Details:
  [../platform/src/ui/README.md](../platform/src/ui/README.md).
- **Offline data** — `import { useOffline } from '@platform/offline/offline-context.tsx'`
  to read on-device content (char stats, rankings, word sets, next sentence) with
  no server. (writing-challenge and word-sets both do this.)
- **Shared widgets** — e.g. `@platform/components/PracticeModal.tsx`,
  `@platform/utils/speech.ts`.
- **i18n** — keep a module-local `src/i18n/` (`en.ts` / `zh-TW.ts`) driven by the
  `language` prop, mirroring the existing modules.

### 5. Registering for the home screen

The platform only lists modules in the allow-set in `platform/src/App.tsx`:

```ts
const OFFLINE_READY_MODULES = new Set(['writing-challenge', 'word-sets', 'practice-english', 'copybook', 'my-characters']);
```

Add your module's `name` here once it works fully on-device.

---

## How to add a new module — recipe

1. **Scaffold** `modules/<name>/` as a workspace:
   ```
   modules/<name>/
   ├── module.json
   ├── package.json        (name it, set "type": "module")
   ├── tsconfig.json
   └── src/
       ├── index.ts        export { default } from './App.tsx'
       ├── App.tsx
       └── i18n/           en.ts, zh-TW.ts, index.ts
   ```

2. **Write `module.json`** (table above). Pick the next `order`, a unique `name`
   and `apiPrefix`, and an `icon`.

3. **Build the main screen** with the kit. Per
   [../platform/src/ui/README.md](../platform/src/ui/README.md), a landing is:
   ```tsx
   import { ModuleScreen, Button } from '@platform/ui/index.ts';

   export default function App({ userId, language, onExit }: {
     userId: number; language: Language; onExit?: () => void;
   }) {
     return (
       <LanguageContext.Provider value={language}>
         <ModuleScreen title={t('module.name')} onBack={onExit}>
           {/* module-specific content */}
           <Button variant="primary" onClick={onStart}>{t('module.start')}</Button>
         </ModuleScreen>
       </LanguageContext.Provider>
     );
   }
   ```
   Back is **module-owned**: pass `onExit` to `<ModuleScreen onBack>` on the main
   screen; on deeper screens render a `<BackButton>` (or none). The platform draws
   no back button for you. Keep bespoke widgets (canvases, custom toggles) custom —
   only common patterns belong in the kit.

4. **Read on-device data** via `useOffline()` if you need char stats / next
   sentence / word sets. Read `language` from props for UI text.

5. *(optional)* **Add a server route** — create `server/index.ts` exporting
   `routes` (an Express `Router`) and `initDb()` for the dev environment. For a
   prod online feature, add a Pages Function under
   `platform/functions/api/<name>/` reusing a portable helper.

6. *(optional)* **Ship a DB** — if your module needs its own content DB, set
   `dbFile` in `module.json`, place `<name>.db` in your module folder, and add it
   to the `sources` array in `platform/scripts/bake-data.ts` (and load it in the
   offline data layer) so it bakes into `public/data/` and is cached offline.

7. **Register** the module's `name` in `OFFLINE_READY_MODULES` in
   `platform/src/App.tsx`. It now appears on the home screen.
