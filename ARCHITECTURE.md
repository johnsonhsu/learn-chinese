# Architecture

> 繁體中文: [architecture.zh-TW.md](./architecture.zh-TW.md)

> Living doc — kept current as the app changes. Refresh on significant changes/deploys.

This is the technical architecture of the Learning Chinese PWA: an offline-first,
local-first Traditional-Chinese (Taiwan / zhuyin-bopomofo) practice app that ships
as static assets to Cloudflare Pages. There is **no runtime server** in
production — the deployed app is the built front-end plus a couple of Cloudflare
Pages Functions for the Gemini proxy. A local Express server exists only on the
dev machine, for development, admin/curation, and producing the shipped data.

---

## 1. Monorepo layout

npm workspaces (`workspaces: ["shared", "platform", "modules/*"]`):

```
learning-chinese/
├── shared/                 @shared/character-stats — pure cross-cutting logic
│   └── src/
│       ├── index.ts            Node DB access (better-sqlite3) for the dev server
│       ├── content-db.ts       platform-owned CURRICULUM CONTENT accessor (content.db) — §3.5
│       ├── mastery.ts          mastery / retention scoring (pure, no Node)
│       ├── char-ranker.ts      frequency+TOCFL char ranking (pure)
│       ├── char-knowledge.ts   "known" criteria, level, target-char window (pure)
│       ├── sentence-generator.ts  parity char selection + bank-sentence scoring (pure)
│       ├── zhuyin.ts           pinyin→zhuyin conversion + disambiguation
│       └── types.ts            DbQueryProvider, RankedChar, CharStat, …
│
├── platform/               the host app (PWA shell, offline layer, UI kit, admin)
│   ├── src/
│   │   ├── App.tsx             module system, screen routing, settings, theme apply
│   │   ├── main.tsx            React entry; imports the UI kit stylesheet once
│   │   ├── index.css           canonical :root design tokens + global styles + theme blocks
│   │   ├── LandingPage.tsx     marketing/install landing (?landing) — §9
│   │   ├── LandingReadData.ts  ranking + situation paragraphs for the landing read-along
│   │   ├── theme/              theme registry + resolution/storage — §5.5
│   │   ├── ui/                 the shared UI kit (@platform/ui) — see ui/README.md
│   │   ├── offline/            local-first data layer (sql.js + IndexedDB)
│   │   ├── admin/              curation panels (dev-only, or admin-code unlocked — §8)
│   │   ├── components/         shared cross-module widgets (PracticeModal, CodeEntry, ThemeSelect, …)
│   │   ├── i18n/               platform-level en / zh-TW strings
│   │   └── utils/              speech, voices, device-id, geminiKey, unlocks (code-gated features)
│   ├── functions/api/copybook/ Cloudflare Pages Functions (Gemini proxy)
│   ├── scripts/bake-data.ts    bake shipped DBs + version.json
│   ├── server/index.ts         dev-only Express + Vite middleware server (:3000)
│   ├── server/content-admin.ts dev-only content/bank curation routes (/api/content) — §8.4
│   ├── vite.config.ts          build, PWA, module aliases, __CONTENT_VERSION__
│   ├── platform.db             canonical platform SQLite (dictionary, stats schema)
│   ├── content.db              canonical CURRICULUM content (bank_sentences, tocfl_words, char_words)
│   └── public/data/            baked output: *.db, stroke-data.json, version.json
│
└── modules/                self-contained learning activities
    ├── writing-challenge/      handwriting / stroke practice on bank sentences
    ├── word-sets/              vocabulary categories
    ├── practice-english/       English cloze spelling game
    ├── copybook/               bring-your-own-text verbatim writing + Gemini gen
    ├── my-characters/          per-character progress dashboard (stats table + tile grid)
    ├── reading-chinese/        reading comprehension: tap chars in order to rebuild a sentence
    └── reading-english/        English reading: tap words in order to rebuild a sentence's translation
```

Each module is its own workspace with `module.json`, `src/` (front-end), and
optionally `server/` (dev-only Express routes). The `shared` package is consumed
both by the Node dev server (via `src/index.ts`, which opens `platform.db` with
better-sqlite3) and by the browser (via the pure sub-path exports like
`@shared/character-stats/mastery`, which carry no Node dependencies).

### Path aliases

- `@platform/*` → `platform/src/*` (e.g. `@platform/ui/index.ts`,
  `@platform/offline/offline-context.tsx`, `@platform/components/...`). Wired in
  `platform/vite.config.ts` and `platform/tsconfig.app.json`.
- `@modules/<name>` → `modules/<name>/src/index.ts` (auto-discovered in
  `vite.config.ts` by scanning `../modules/*/src/index.ts`).
- `@shared/character-stats` and its sub-paths → the `shared` package's `exports`
  map (`./mastery`, `./types`, `./char-ranker`, `./char-knowledge`,
  `./sentence-generator`, `./zhuyin`, `./content-db`).

---

## 2. The module system

Modules are discovered and wired up **entirely at build time** — there is no
server round-trip to learn what modules exist.

### `module.json` manifest

Each module ships a manifest, e.g. `modules/writing-challenge/module.json`:

```json
{
  "name": "writing-challenge",
  "displayName": "Writing Challenge",
  "displayNameZh": "寫字挑戰",
  "icon": "✍️",
  "apiPrefix": "/api/writing-challenge",
  "dbFile": "writing-challenge.db",
  "order": 1
}
```

| Field           | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `name`          | stable id; matches the folder, used for glob/registry keys     |
| `displayName`   | English label on the home grid                                 |
| `displayNameZh` | Traditional-Chinese label                                      |
| `icon`          | emoji shown on the module card                                 |
| `apiPrefix`     | where the dev server mounts this module's Express routes       |
| `dbFile`        | (optional) the module's own SQLite file, baked for offline use |
| `order`         | sort order on the home screen                                  |

`practice-english`, `copybook`, `my-characters`, `reading-chinese`, and
`reading-english` omit `dbFile` (they read the shared bank / on-device progress and
have no shipped DB of their own).

### Front-end auto-discovery (`platform/src/App.tsx`)

The platform finds modules with two `import.meta.glob` calls:

```ts
// Lazy React components — the module's runtime entry.
const moduleImports = import.meta.glob<ModuleExport>("../../modules/*/src/index.ts");

// Manifests — read eagerly at build time, no server needed.
const manifestModules = import.meta.glob("../../modules/*/module.json", { eager: true });
```

Manifests are filtered against an explicit allow-set and sorted by `order`:

```ts
const OFFLINE_READY_MODULES = new Set([
  "writing-challenge",
  "word-sets",
  "practice-english",
  "copybook",
  "my-characters",
  "reading-chinese",
  "reading-english",
]);
```

Only modules in this set appear on the home screen. It's an inclusion list of
fully-on-device modules — **not** a back-button exclusion list (see §5).

### Runtime entry: `src/index.ts` default export

Each module's `src/index.ts` default-exports a React component receiving
`ModuleProps`:

```ts
interface ModuleProps {
  userId: number; // the active profile id
  language: Language; // 'zh-TW' | 'en' — UI language, owned by the platform
  onExit?: () => void; // return to the home / module picker
}
```

`App.tsx` lazy-loads the chosen module and renders it inside an app shell:

```tsx
<div className={`app-shell app-shell--${activeModule}`}>
  <ModuleComponent userId={user.id} language={language} onExit={onBack} />
</div>
```

The platform threads its exit handler in as `onExit`. It does **not** draw a back
button or maintain any per-module exclusion list — back is module-owned (§5).

### Server side (dev only): `server/index.ts` `routes`

When the dev Express server boots, `platform/server/module-loader.ts` scans
`modules/*`, reads each `module.json`, dynamically imports `server/index.ts`, and
collects `{ manifest, routes, initDb }`. Each module's `routes` (an Express
`Router`) is mounted at its `apiPrefix`, and `initDb()` is called once at startup:

```ts
for (const mod of modules) {
  app.use(mod.manifest.apiPrefix, mod.routes);
}
```

A module's server contract is therefore: `export const routes = Router()` and
`export function initDb() {…}`. In production these routes do not run; a module
that needs an online capability uses a Cloudflare Pages Function instead (§6).

---

## 3. Local-first data

The deployed app runs **entirely client-side**. All practice happens against
SQLite databases loaded into the browser with [sql.js](https://github.com/sql-js/sql.js)
(WASM), while per-device user progress lives in IndexedDB.

```
                 build time                          runtime (browser)
  canonical DBs ──bake-data.ts──▶ public/data/*.db ──fetch──▶ IndexedDB cache
  (platform.db,                   + version.json              │
   *.db per module)                                           ▼
                                                       sql.js (WASM) in memory
                                                              │
                                  DbQueryProvider ◀───────────┘
                                       │
        @shared/character-stats (ranker, knowledge, mastery, generator)
                                       │
                                  React UI
```

### sql.js + `DbQueryProvider`

`platform/src/offline/sql-db.ts` initializes sql.js (the WASM is bundled with the
app via `sql.js/dist/sql-wasm.wasm?url`, so it works fully offline — no CDN) and
wraps a `Database` in a `DbQueryProvider` — the small `queryAll / queryOne / run`
interface (`shared/src/types.ts`) shared by **both** the browser (sql.js) and the
dev server (better-sqlite3). All the pure shared logic is written against this
interface, so the same ranking / selection code runs identically in both places.

### The offline data layer

`platform/src/offline/offline-data-layer.ts` (`OfflineDataLayer`) is the heart of
the runtime. On `initialize()` it:

1. Boots sql.js.
2. Loads the four shipped DBs (`platform`, `content`, `writing-challenge`,
   `word-sets`) — from IndexedDB if cached, else downloads them from
   `/data/<name>.db` and stores them (`db-store.ts`). The curriculum content
   (`bank_sentences`, `tocfl_words`, `char_words`) lives in **`content.db`** (§3.5),
   not in the writing-challenge module DB.
3. Loads the offline stroke-data bundle (`stroke-data.ts`).
4. Resolves the single local device user and exposes profiles, char stats,
   rankings, levers (settings), level, target chars, and `generateNextSentence`.

`OfflineProvider` / `useOffline` (`offline-context.tsx`) wrap this and expose it
to the whole app, rendering nothing until `isReady`.

#### Per-character SKILL tracks — writing vs reading (issue #65)

Character progress is tracked **per skill**, not globally. Reading comprehension
is a distinct competency from writing — a learner can recognize a character
without being able to write it — so the two record into **separate stat tracks**
that never cross-contaminate:

- **Writing** (the historical default) → SQLite `character_stats` + IndexedDB
  store `profileStats`.
- **Reading** (the `reading-chinese` module) → SQLite `character_stats_reading` +
  IndexedDB store `profileStatsReading`.

**English competencies** are tracked by the two self-contained English modules, each
in its OWN IndexedDB database (never the platform char-stats tables):

- **Spelling** (the `practice-english` module) → per-word store in IndexedDB
  `learning-english-user`.
- **Reading English** (the `reading-english` module) → per-word store in a DISJOINT
  IndexedDB `learning-english-reading-user`. Same per-word record shape + mastery
  rule (≥3 of last 4 correct) as spelling, but a separate database so a reading
  session never mutates spelling stats and vice-versa (guarded by
  `reading-english-stat-isolation.test.ts`).

The data layer threads a `skill` through its stat plumbing: `getNextReadingSentence`
/ `submitReadingResult` / `getReadingDebugInfo` mirror the writing methods but read
and write only the reading table/store. On profile switch both tracks are replayed
into their own in-memory tables. The **pure engine is unchanged** — `computeUserLevel`,
`getTargetChars`, and `computeMastery` are `CharStat[]`-in, so each skill just feeds
them its own slice; `char-ranker` is frequency-based and shared. The IndexedDB
`profileStatsReading` store was added as a purely **additive** `USER_DB_VERSION`
bump (2 → 3) — no risky re-keying of existing writing progress. The tap-to-
reconstruct pool/shuffle/tap logic itself is pure and lives in
`@shared/character-stats/reading`.

### Stroke rendering — `WritingCanvas` + hanzi-writer (do NOT remount per char)

`components/WritingCanvas.tsx` renders the offline stroke data with
[hanzi-writer](https://github.com/chanind/hanzi-writer). **hanzi-writer has no
`destroy()`, and every `HanziWriter.create()` permanently leaks two global
`document` listeners** (`mouseup`/`touchend`). So the canvas creates each
`HanziWriter` **once** and drives character changes imperatively via
`writer.setCharacter()` + re-`quiz()` on the persistent instance:

- **Gotcha: do NOT remount `WritingCanvas` via a per-character React `key`.** The
  old per-character `key` remount (in the practice pages / `PracticeModal`) was
  removed because it re-ran `create()` — leaking a listener pair on **every**
  character advance. The create effect now keys only off structural config
  (size / mode / leniency), and cleanup calls `cancelQuiz()` so abandoned quizzes'
  leaked global listeners no-op instead of hijacking the live canvas.
- A new **`quizSession`** prop lets the parent request a fresh quiz of the _same_
  glyph (a must-repeat after a fail, or a duplicate consecutive character) — cases
  a plain `character` diff would miss — without recreating the writer.
- **Exception:** `PlacementTest.tsx` intentionally keeps its `key={seq}` remount.
  That seam re-runs the placement page's mount effect to fetch the next item and
  reset page state (PracticePage-level work with no imperative reload hook), and it
  fires once **per item** (~10× in one-time onboarding, not per character), so the
  writer churn is negligible.

### Per-device storage

- **Content** (dictionary, sentence bank, TOCFL words, word sets, stroke data):
  read-only, shipped, cached in IndexedDB database `learning-chinese-dbs` → object
  store `databases`. The cached content version is tracked in the `metadata` store.
- **User data** (profiles, per-char stats, prefs, lever overrides): per-device,
  never uploaded. The baked `platform.db` snapshot is **scrubbed** of all personal
  rows at bake time (§4) so a fresh install starts blank; existing devices keep
  their own progress in IndexedDB.
- Backup/restore is a manual JSON export/import (`offline/backup.ts`), with
  selective per-profile restore in Device Settings. The backup also carries
  device-level feature unlocks and the theme state (§5.5), so the chosen look and
  any premium unlock travel with the account.

#### Connection hygiene (memory-leak fixes)

Both IndexedDB stores and the in-memory sql.js heaps are long-lived and easy to
leak — these are deliberate fixes, not incidental:

- **One pooled `IDBDatabase` per store.** `offline/user-store.ts` and
  `offline/db-store.ts` each **memoize a single open connection** (a cached
  `dbPromise`) and reuse it across every helper. Previously each call opened — and
  never closed — a fresh `IDBDatabase`, so hot paths (`recordAttempt` →
  `putProfileCharStats`, `getPref`/`setPref`) accumulated open connections. The
  cache is dropped on `onversionchange` (after `close()`, so a same-origin upgrade
  isn't blocked) and on `onclose`, and a rejected open is never cached, so the next
  call reopens cleanly.
- **sql.js close-before-reopen.** `OfflineDataLayer.refreshFromServer()` now
  **`.close()`s the old `platform`/`module`/`content` `Database`s before reopening**
  them on the refreshed bytes. Each `openDatabase` allocates a fresh ~18 MB WASM
  heap, so reassigning without closing leaked the previous heaps on every
  content refresh.

> **Cloud sync is PLANNED, not built.** Today the only cross-device transfer is the
> manual JSON backup/restore above. There is an offline mutation queue
> (`offline/sync-queue.ts`) scaffolded for a future sync, but no server endpoint
> consumes it and nothing uploads user data in production.

---

## 3.5 Curriculum content — platform-owned `content.db`

The **curriculum content** — the practice sentence bank (`bank_sentences`), the
TOCFL word list (`tocfl_words`), and its per-character index (`char_words`) — is
**platform-owned**, living in its own canonical DB **`platform/content.db`**.
It used to live inside `modules/writing-challenge/writing-challenge.db`; it was
extracted so every module is a pure _consumer_ of one shared curriculum
(writing-challenge drills it, practice-english reads it for cloze, the dev admin
curates it).

## 3.6 Marketing screenshots / Playwright

`platform` includes a small Playwright screenshot harness for marketing visuals.
This is **not** an integration/e2e gate on module code; it’s a file-local capture
tool for landing, styleguide, and app-home marketing assets.

- Config: `platform/playwright.config.ts`
- TypeScript config: `platform/tsconfig.playwright.json`
- Screenshot specs: `platform/scripts/marketing-screenshots/marketing.spec.ts`
- Outputs: `platform/public/marketing/` — PNGs and `*.meta.json`, ignored by the app at runtime and not part of shipped data unless explicitly included

- **The accessor** is `shared/src/content-db.ts`, exported as
  `@shared/character-stats/content-db`. It opens `content.db` with
  better-sqlite3 (Node side only — dev server + scripts), idempotently ensures the
  schema, and exposes the bank CRUD (`addBankSentences`, `getAllBankSentences`,
  `searchBankSentences`, `updateBankSentence`, `deleteBankSentence(s)`,
  `restoreBankFromBaked`, …) plus the TOCFL helpers (`getTocflWords`,
  `getCharTocflLevels`, `getCharZhuyin`).
- **Consumers:** the dev content-admin routes (`platform/server/content-admin.ts`,
  §8.4) and the writing-challenge dev server (`server/word-selector.ts`,
  `import-tocfl.ts`, `tag-grammar.ts`) all read/write content **only** through this
  accessor or by opening `content.db` directly — never the module DB.
- **Shipping:** the bake (§4) snapshots `content.db` to `/data/content.db`; the
  offline data layer loads it as the `content` DB. The **writing-challenge snapshot
  is stripped** of `bank_sentences`, `char_words`, and `tocfl_words` (it now carries
  only its own `module_settings` + dev-only per-profile tables).
- **Progress stays separate.** Per-profile progress (char stats, settings, lever
  overrides) is **not** here — it lives in `platform.db` + the on-device IndexedDB
  user-store and is untouched by content extraction.

### Glyph normalization — one canonical Taiwan-Traditional form

Both the **on-import** path (`content-db.ts` `canonicalizeTW()`, run by
`addBankSentences`) and the **offline scrub** (`scripts/bank-fix.py` `canon()`)
share the _same_ normalization so the bank only ever stores one canonical glyph
per character:

1. **Simplified → Traditional (Taiwan standard)** via OpenCC (`cn`→`tw` in JS,
   `s2tw` in Python), so Simplified leakage from generators can never enter the
   bank.
2. **台 and 臺 are BOTH preserved — never converted.** OpenCC would force 台→臺,
   so both are shielded behind private-use sentinels (`U+E000` / `U+E001`) across
   the OpenCC pass and restored verbatim afterward. Both are valid Taiwan forms.
3. **Undrawable variant glyphs are unified to their ranked + drawable canonical
   form** via a shared `VARIANT_MAP` (`汙→污`, `祕←秘`): the variant is in neither
   the char ranking nor the hanzi-writer stroke data, so the app literally cannot
   draw it — it is folded into the canonical form that _is_ ranked and drawable.

`bank-fix.py` additionally collapses rows that collide after canonicalization
(deleting the duplicate), is idempotent, backs up the DB first, and reports counts
only. It runs against `platform/content.db`.

---

## 4. Bake / deploy data pipeline

`platform/scripts/bake-data.ts` (run via `npm -w platform run bake:data`, and
automatically as the first half of `build`) produces the shipped content:

1. **Snapshot DBs** — for each source (`platform.db`, **`content.db`**,
   `writing-challenge.db`, `word-sets.db`) it uses better-sqlite3's online
   `backup()` API (so WAL content is included and the snapshot is consistent even
   while the dev server is running) into `public/data/<name>.db`.
2. **Scrub the platform snapshot** — deletes `character_stats`,
   `character_stats_reading` (the reading skill track, §on skill tracks), `users`,
   and `user_settings`, then `VACUUM`s, so the deployed app ships **content only**,
   never anyone's progress.
3. **Strip content from the writing-challenge snapshot** — drops
   `bank_sentences`, `char_words`, and `tocfl_words` then `VACUUM`s, because that
   curriculum is platform-owned and ships in `content.db` (§3.5). The module DB then
   carries only its own `module_settings` (+ dev-only per-profile tables); old
   cached module DBs simply go stale and re-download on the next `contentHash`.
4. **Bake stroke data** — builds `public/data/stroke-data.json`, a single bundle
   mapping every dictionary char → its hanzi-writer stroke data, applying local
   Taiwan stroke-variant overrides from `public/stroke-data/`. This is what makes
   handwriting practice work offline.
5. **Write `version.json`** with two distinct fingerprints:

```jsonc
{
  "version":     "<sha256(contentHash + builtAt)>",  // per-BUILD, always unique
  "contentHash": "<sha256 of the per-file hashes>",   // data-only fingerprint
  "files":       { "platform": { size, hash }, … },
  "builtAt":     "<ISO timestamp>"
}
```

### `version` vs `contentHash` — why two

- **`contentHash`** changes **only when the baked data changes**. The offline
  layer gates the (~18 MB) DB re-download on `contentHash` — so a code-only deploy
  does **not** force every device to re-download databases. Old `version.json`
  files without `contentHash` fall back to `version`.
- **`version`** folds a fresh build timestamp into the content hash, so **every**
  build/deploy gets a distinct value — even when data and code are unchanged. This
  is what `vite.config.ts` bakes into the bundle as the `__CONTENT_VERSION__`
  global, and what the device-vs-server compare + the Settings "update available"
  display read. Referencing it in the JS makes the bundle byte-change on any
  deploy, so the service worker's update detection (and the "new version" banner)
  fires correctly.

```
                bake-data.ts
                     │
       ┌─────────────┼──────────────────┐
       ▼             ▼                   ▼
  contentHash    version           __CONTENT_VERSION__ (vite define)
  (data only)    (per build)             │
       │             │                    └── baked into JS bundle
       ▼             ▼                        → SW update banner fires per deploy
  gates DB      device-vs-server
  re-download   compare + Settings display
```

The PWA service worker (`vite-plugin-pwa`, `registerType: 'prompt'`) precaches the
app shell + the sql.js WASM and **waits** rather than swapping silently, so the
app can show a "new version available" banner. The `/data/*` assets are
intentionally **not** Workbox-cached (the data layer manages them in IndexedDB);
`/data/version.json` is uncached so liveness/version pokes hit the network.

---

## 4.5 Testing & CI/CD

Tests are **Vitest** (TypeScript, root `vitest.config.ts`) plus **one pytest** for the
Python glyph scrub. Scripts: `npm test` (all), `npm run test:unit`
(`shared/` + `platform/src/`, fast), `npm run test:data` (the deploy gate). Three tiers:

- **Pure-logic units (`shared/src/__tests__`)** — the engine: `sentence-generator`
  (the **binding** invariant — the chosen target char always appears in the returned
  text — plus seeded-RNG parity/coverage), `mastery`, `char-knowledge`, `char-ranker`,
  `zhuyin`. `DbQueryProvider` is faked in-memory; `Date.now()` is controlled with
  `vi.setSystemTime`; RNG with a seeded `Math.random` stub.
- **Glyph-canonicalization parity** — `canonicalizeTW()` (the TS importer, exported
  from `content-db.ts`) and `bank-fix.py canon()` are two implementations of one rule
  that **must agree**. Both run against a single shared golden fixture
  (`test/fixtures/glyph-canon.json`): 台/臺 preserved both directions, `VARIANT_MAP`
  unification, Simplified→Traditional, idempotency. `bank-fix.py`'s destructive pass is
  guarded under `__main__` so the test can import `canon()`; the Python test
  `pytest.importorskip("opencc")`s so it's a no-op locally without opencc.
- **Data-integrity deploy gate (`platform/test/data-integrity.test.ts`)** — runs against
  the **baked** `platform/public/data/*` (what ships): SQLite `integrity_check`; the bank
  has no Simplified/undrawable glyphs (`canon(s) === s`) and is referentially sound; the
  snapshots carry **no personal data** (`platform.db` users/stats scrubbed,
  `writing-challenge.db` is `module_settings`-only); and every curriculum char used in the
  bank has bundled stroke data (offline-drawable), with a small, documented allowlist for
  chars no open dataset covers. See §3.5 / the glyph-normalization notes.

**Test discipline — a contributor responsibility.** The gate above protects _shipped data_,
but it can't catch an engine regression. So on **any** change, evaluate whether tests need to
be added or updated and record that test impact in the issue spec / PR; new engine logic or a
fixed bug lands with its guarding unit/parity test in the same PR. Keeping the suite a
well-oiled machine is the contributor's job — not something the deploy gate backstops.

**CI/CD — `.github/workflows/ci.yml`.** One job on `pull_request` and `push: master`:
`npm ci` → unit tests → Python parity (`pip install opencc pytest`) → **type-check
(`tsc`)** → **lint (`eslint . --max-warnings=0`, BLOCKING)** → `npm run build -w platform`
→ **data-integrity gate** → **dependency-audit gate** (`npm audit --omit=dev
--audit-level=high`) → `cloudflare/wrangler-action` deploy → (PRs only) a sticky comment
with the preview + `/?app&demo` URLs. A failing step aborts before the deploy, so bad
content/code can never ship. **Lint is a hard gate** (as of the #86/#103–#108 baseline
sweep): the tree is at zero errors, so any new lint error or stale `eslint-disable`
directive fails CI — keep it green. eslint config lives in the root `eslint.config.js`
(flat config; the TS-aware `@typescript-eslint/no-unused-vars` with `^_` ignore patterns,
`no-explicit-any`, `react-hooks/rules-of-hooks`); a Husky `pre-commit` hook runs
`lint-staged` (`eslint --fix` + `prettier`) on staged `*.{ts,tsx}`.

Cloudflare decides preview-vs-production by comparing the deploy `--branch` to the
project's **production branch**, which on this _direct-upload_ (no Git-connection) Pages
project is **`learning-chinese`** — NOT `master`. So the workflow passes
`--branch=learning-chinese` on a `master` push (→ **production**, `learnchinese.hsu.mobi`)
and `--branch=<PR head>` on a PR (→ a **preview** with its own
`<branch>.learning-chinese-3g0.pages.dev` URL). Same build + gate both times — production
just mirrors the preview flow. **One-time setup:** repo secrets `CLOUDFLARE_API_TOKEN`
(Pages:Edit) + `CLOUDFLARE_ACCOUNT_ID`, and the CF project's production branch set to
`learning-chinese`. (Token caveat: a non-ASCII char pasted into the token secret makes
wrangler fail with a `ByteString` header error before any network call — regenerate +
re-paste clean.)

**Reproducible builds + seeds.** `bake-data.ts` reads each working DB if present, else a
committed content-only **seed** (`seed/platform.db`, `seed/writing-challenge.db`) so CI
can build without the gitignored working DBs (which hold the dev profile's progress).
`npm run seed:dbs` regenerates the seeds, applying the same personal-data scrub `bake`
does. `content.db` and `word-sets.db` are pure content, committed at their working paths;
`platform/public/stroke-data/` (hand-made Taiwan stroke overrides 為/說/齣…) is committed
too, so CI bakes them in. There is **no** local auto-deploy — deploys happen only through CI.

**Redeploying on a change** (no manual deploy — open a PR, eyeball its preview, merge):

- **Code change** → PR → preview → merge to `master` → production. Automatic.
- **Curriculum/content change** (edit `content.db` via the dev admin, or rebuild a module
  DB): ALSO run **`npm run seed:dbs`** and commit the refreshed `seed/*.db` + `content.db`,
  so CI builds the new content. The gate re-checks glyphs / stroke coverage / privacy.
- **New stroke override**: drop `<char>.json` in `platform/public/stroke-data/`; the next
  bake bundles it — then remove that char from the gate's `STROKE_ALLOWLIST` so coverage is
  enforced going forward.
- **Demo dataset change**: bump `DEMO_VERSION` in `platform/src/offline/demo.ts` (or change
  the seed) so every returning demo visitor reseeds onto the new data.

## 4.6 Demo / "try-it" mode

`/?app&demo` boots the real local-first app pre-seeded with preset profiles — a no-install
public trial (the marketing site links here). `?app` forces the app past the landing page
(`shouldShowLanding` in `App.tsx`); `?demo` (read in `platform/src/offline/demo.ts`) does two
things:

1. **Isolated storage.** IndexedDB is per-**origin** (not per-path), so a `?demo` on the
   real domain would otherwise share — and could clobber — an installed user's data.
   Instead `user-store.ts` opens a SEPARATE DB, `learning-chinese-user-demo`, when `?demo`
   is present. Seeding/eviction there can never touch a real user.
2. **Seed + version-check.** `ensureDemoSeed()` (called from `OfflineProvider` right after
   `dataLayer.initialize()`) synthesizes Beginner (~120 known chars) + Intermediate (~700)
   profiles at runtime from the char ranking (`getCharRanking` + `seedKnownFromPlacement`),
   stamped with a `__demoVersion` pref. A returning visitor on the current version keeps
   their session; bumping `DEMO_VERSION` reseeds everyone onto the new canonical demo. No
   bundled dataset to maintain. (A bare `/?demo` or `/try` would need a one-line
   `shouldShowLanding` change or a `_redirects` rule — deliberately deferred; not
   needed while `?app&demo` covers the demo entry.)

**Device gate — mobile/touch only (#66).** The demo is a mobile PWA experience (install +
touch UI), so a **desktop** visitor on a demo path is gated OUT and shown an "open it on
your phone" QR panel instead of a broken mouse-driven demo. The gate is a **separate**
predicate from `evaluateDemoMode` so jar isolation is unchanged: a desktop demo visitor is
STILL a demo session (isolated `-demo` jar) — the app just doesn't BOOT the demo for them,
and is therefore never routed onto the real `learning-chinese-user` jar. `demo-mode.ts`
exports `isDemoDeviceAllowed(DeviceEnv)` (pure — `pointer: coarse` OR `hover: none` OR
`ontouchstart`/`maxTouchPoints > 0`; capability detection, **not** UA sniffing) and the
memoized `isDemoDeviceGated()` = `isDemoMode() && !isDemoDeviceAllowedNow()`. `App.tsx`
renders the lazy `DemoGate` (QR from the tiny dependency-free encoder in `utils/qr.ts`,
lazily loaded so it never touches the app shell) instead of `<AppInner>` when gated. The
real/installed app, dev/LAN hosts, and `?landing` are NEVER gated. **Client-side only** —
static Pages has no runtime server to enforce a device gate; this is a browser capability
check. The in-app **landing** (`LandingPage.tsx`) links to the demo (`?app&demo`, en + zh-TW)
via a "Try the live demo" CTA under the read-along notebook; on desktop that link lands on
the QR fallback rather than a dead end.

**Device-gate override for desktop testing (`?nodevicegate`, #76).** To make the demo
reviewable on desktop — especially from PR preview deployments — a URL query param
`?nodevicegate` bypasses the device gate. When present, `isDemoDeviceAllowed()` returns
`true`, so `isDemoDeviceGated()` is `false` and `<DemoGate>` is skipped. The PR preview
comment also appends `${prBase}/?app&demo&nodevicegate` so reviewers can click straight
into the desktop-bypassed demo. This is explicitly **not a security control**: it only
lets a desktop visitor enter the already-isolated demo jar, so prod exposure is fine.

---

## 5. UI kit (`platform/src/ui`)

The shared design primitives every module composes instead of re-implementing the
"cartoon-candy" look. See **`platform/src/ui/README.md`** for the full details;
in brief:

- `<Button variant="primary|secondary|ghost">` — the 3D candy button.
- `<ModuleScreen title onBack? backLabel? children>` — the standard module
  MAIN-screen shell (back pill + cream card + title). The back pill renders
  **only when `onBack` is given**.
- `<Card>` — the cream-panel look outside a full screen.
- `<BackButton>` — the **unified** standalone back pill for non-main screens
  (one component every module reuses instead of bespoke back buttons).
- `<CharTile>` — the shared character tile (rank/level/mastery bar/recent-result
  dots/ribbon), reused by My Characters, the "next up" chips, and word-set lists;
  also themed (§5.5).
- Barrel: `import { Button, ModuleScreen, Card, BackButton, CharTile } from '@platform/ui/index.ts'`.

**Design tokens are a single source of truth**: all colors/sizes/fonts are CSS
custom properties on `:root` in `platform/src/index.css` (cream surfaces
`#FFF8E0`, purple borders `#5A1A96`, deep-teal `--bg`, `--font`, `--radius`,
`--shadow3d`, etc.). Modules use `var(--token)` and must not fork or re-declare
them. The kit's stylesheet `ui-kit.css` is imported **once** by `main.tsx`;
modules never import it. Its selectors are `.app-shell`-prefixed so they survive a
module's scoped CSS reset.

**Back is module-owned.** The platform passes `onExit` and draws no back button
itself; each screen decides whether to show a back (by passing `onBack` to
`<ModuleScreen>` or rendering `<BackButton>`). There is no platform back-button
exclusion list.

---

## 5.5 Theming (`platform/src/theme`)

A registry-driven theming system layers an optional alternate skin over the
default look. **13 themes ship today** (`theme/themes.ts`), organized into picker
groups (#129): **default** (Indigo — the default _selection_ — and Paper, the
token-less `:root` baseline), **dark** (Midnight, Outer Space), **soft/seasonal**
(Sakura, Matcha, Jungle), **retro** (90s, 80s Motiv), **Disney** (Boyish, Girlish),
and **foil** — the two premium skins **Gold** (warm foil) and **Silver** (cool
platinum). Adding another is a single registry entry.

- **The contract + catalogue** is `theme/themes.ts`: a `THEME_TOKENS` allow-list
  (the named CSS custom properties a theme may set — backgrounds, foil family,
  tile face/frame/glyph, button family, text family/scale/weight, and the
  module-selection `arrangement`) plus the `THEMES` registry (`id`, `name`,
  `premium`, `arrangement`, `group`). **Paper** (registry id `default`) sets no
  tokens — the `:root` editorial values stand in, so that baseline look is
  byte-identical to pre-theming; **Indigo** is the default _selection_.
- **Token values live in CSS**, not the registry: each non-default theme is a
  `body[data-theme="<id>"] { … }` block — either inline in `index.css` (Gold/Silver)
  or in a standalone `theme/theme-<id>.css` file imported in `main.tsx`
  (Midnight/Sakura/Matcha), which keeps the larger free skins out of the global
  stylesheet while still winning the cascade (imported after `index.css`). Either
  way it is purely additive over the default look and scoped behind the
  `data-theme` attribute so it can never leak into it. The cascade,
  `::before/::after`, media queries, and animations all work natively.
- **Application** (`App.tsx`): the effective theme id is written to a single
  `<body data-theme="<id>">` attribute (removed entirely for `default`). This
  **replaced the old ad-hoc `data-premium` overlay** (and the one-anointed-device
  `isGoldDevice()` / `GOLD_DEVICE_ID` gate) — both are gone.
- **Resolution + storage** (`theme/theme-store.ts`): two levels mirroring how
  English-voice selection works —
  - **Device theme** — one selection for the whole device (`localStorage`
    `lc-gold-mode`, reused from the legacy key so existing devices keep their
    pick), shared by every profile.
  - **Profile override** — optional per-profile selection
    (`localStorage` `lc-theme-u<id>`); `null`/absent → inherit the device theme.
  - **Effective theme = `profileOverride ?? deviceTheme ?? 'default'`**
    (`resolveEffectiveTheme`), with a safety net: if the resolved theme is premium
    but premium isn't unlocked **on this device**, it falls back to `default` (so a
    revoked unlock or a restored backup never renders a gated look the user can't
    reach).
- **Premium gating.** Gold/Silver are the **only** `premium: true` themes; each
  unlocks **independently** via its **own per-theme code** (§5.6 below) at the
  **device level only** — `utils/unlocks.ts` `lc-unlocks`, redeemed under the Device
  ID in Device Settings, applying to every profile. Both are **gated behind a
  premium prerequisite** (code `9000`): redeem `9000` first, then **`9900` → Silver**
  and/or **`9901` → Gold** (each theme entry carries an `unlockFeature` key — Silver
  ← `theme-silver`, Gold ← `theme-gold`). `9000` alone reveals **nothing**; a `99xx`
  code entered before `9000` is **rejected as an ordinary invalid code** (generic
  "Invalid code", no hint it's real — see §5.6). _Back-compat:_
  a device that stored the legacy blanket `premium` feature (retired code `9999`)
  keeps **both** foils. Midnight/Sakura/Matcha are `premium: false`, so they are
  always available — no code required. A theme may also carry a **seasonal gate**
  (`availableMonths`, 1-based): **Christmas** is only selectable Nov–Jan — out of
  season it is hidden and any stored selection falls back to `default` through the
  same `isThemeAvailable()` / `resolveEffectiveTheme` path as a locked foil (issue
  #128). There is **no per-profile unlock**: a profile
  can only _override_ the theme among themes already available device-wide
  (`isThemeAvailable()` is per-theme; `isDevicePremiumUnlocked()` is the coarse
  "any foil" signal, in `theme-store.ts`). The theme selectors
  (`components/ThemeSelect.tsx`) therefore list **only the AVAILABLE themes** —
  Default plus the three free skins always, plus Silver once `9900` is redeemed and
  Gold once `9901` is, **independently**; locked premium skins are **not shown at
  all** (no lock badge, no redeem-on-select). The **Profile
  Picker** shows a per-profile crown (`👑` gold / `♔` silver) only when that
  profile's _own_ override is Gold/Silver — a profile that merely inherits a premium
  _device_ theme (no override) gets none.
- **Backup.** Theme state — the device theme and per-profile overrides — is
  serialized into the JSON backup (`exportThemeState` / `importThemeState`) so the
  chosen look travels with the account. The device premium unlock travels in the
  backup's feature-unlock set (`lc-unlocks`), merged additively on restore (never
  dropped). On restore, the safety net in `resolveEffectiveTheme` means a premium
  selection without its unlock simply falls back to `default`.

### Orientation & landscape (issue #130)

The app is **portrait-first** but **adapts to landscape**. Every landscape rule
is gated behind `@media (orientation: landscape)`, so **portrait stays
pixel-identical**. In landscape the centered columns widen (home / profile /
settings / onboarding — see the "Landscape support" block in
`platform/src/index.css`) and the writing pad is fit to the short landscape
height (the canvas already CSS-scales to its wrapper — the same path a narrow
portrait phone uses — so stroke-input coordinate mapping is unaffected;
`modules/writing-challenge/src/App.css`). Reading modules and the char/word
grids are already fluid (`--content-width` + `auto-fill`), so they use the
extra width without bespoke rules.

**Orientation policy (`platform/src/hooks/useOrientationLock.ts`).** The
**Lock-to-portrait** setting is the single source of truth:

- **Lock OFF (default):** the app follows the device — portrait, or the new
  landscape layouts.
- **Lock ON:** the user explicitly chose portrait. iOS/iPadOS web cannot force
  OS orientation, so a full-screen rotate overlay (`.rotate-overlay`, gated by
  `html.lock-portrait`) blocks landscape with a "rotate back" message. Its
  **dismiss** turns the lock off through the real store
  (`window.__setPortraitLock` → `updateSettings`, demo-jar isolated) — not
  `localStorage` (that was the old no-op bug, issue #112).

The overlay is deliberately **kept** (not deleted): it is the honest fallback
for users who opted into portrait — reconciling the parent epic's "remove the
overlay" note with the shipped Lock-to-portrait feature (#98).

---

## 5.6 Code-entry keypad (`platform/src/components/CodeEntry.tsx`)

A reusable on-screen **4-digit numeric keypad** for redeeming short feature codes.
It renders a 0–9 pad (plus backspace) and a 4-slot progress indicator, auto-submits
the moment the 4th digit lands, then shows an **auto-dismissing results modal**
(~2.2s, tap also closes). Physical keyboard input works too (0–9 / Backspace /
Escape).

The keypad is **provider-agnostic** — it doesn't know what a code means. The caller
passes `onSubmit(code)`, which redeems the code in its own scope and returns a
**discriminated `CodeResult`** — `{ status: 'granted', feature }`,
`{ status: 'prerequisite-missing', required }`, or `{ status: 'unknown' }`. The
keypad maps each `granted` feature to its own localized success message + emoji
and, on `granted`, fires `onUnlocked(feature)`. **`prerequisite-missing` and
`unknown` render identically** — the generic "Invalid code" ❌ — by design
(security by obscurity): a valid-but-locked code (e.g. `9900` before `9000`) is
indistinguishable from a genuinely invalid one, leaking **no hint** that the code
is real or that a prerequisite exists. Both grant nothing.

Codes live in one place, `utils/unlocks.ts` `CODE_FEATURES`, as a **two-tier,
prerequisite-chained** scheme. Each series opens with a **prerequisite** code that
grants a flag revealing _nothing on its own_; the feature codes are **rejected
until that prerequisite is present** (granting nothing — and, in the keypad,
shown as a plain "Invalid code", see below):

- **Premium series** — **`9000`** grants `premium-prereq` (prerequisite, reveals
  nothing); **`9900`** → `theme-silver` (Silver) and **`9901`** → `theme-gold`
  (Gold), each requiring `9000` first (else prerequisite-missing). Unlocks the
  Gold/Silver themes, independently (§5.5).
- **Admin series** — **`8000`** grants `admin-prereq` (prerequisite, reveals
  nothing); **`8001`** → `admin`, requiring `8000` first. `8001` is the admin-menu
  reveal that the **retired `8888`** used to do (§8).
- **Removed:** `9999` (old blanket premium) and `8888` no longer redeem. _Back-compat:_
  devices that already stored `premium` keep both foils; devices that stored `admin`
  keep the Admin menu — the gates honor those keys directly.

`redeemCode` distinguishes the three outcomes (granted / prerequisite-missing /
unknown) for the gating logic, but **the keypad renders `prerequisite-missing`
identically to `unknown`** — the generic "Invalid code" — so a valid-but-locked
code gives **no hint** it's real or that a prerequisite exists (security by
obscurity, issue #40 revision). Used by **Device Settings** (device-scope redeem
via `redeemCode`, → `lc-unlocks`) and by the theme unlock flow.

---

## 6. Cloudflare Pages Functions — the Gemini proxy

The only server-side code in production. The copybook module's "Generate" button
needs to call Gemini, which the browser cannot do directly (CORS) and which must
not expose the key. Two Pages Functions live in `platform/functions/api/copybook/`:

- `generate.ts` → `POST /api/copybook/generate` — generates one validated
  Taiwan-Traditional sentence.
- `test-key.ts` → `POST /api/copybook/test-key` — probes whether a user-supplied
  Gemini key is valid (a free models-list GET; no generate quota spent).

Both **reuse the same portable helper** `modules/copybook/server/gemini.ts`
(dependency-free, uses global `fetch`), which also backs the dev Express route in
`modules/copybook/server/index.ts`. No logic is duplicated.

```
browser (copybook "Generate")
   │  POST /api/copybook/generate  { targetChar, knownChars, level, rankCeiling, apiKey? }
   ▼
Cloudflare Pages Function (functions/api/copybook/generate.ts)
   │  apiKey = client BYO key  ||  env.GEMINI_API_KEY (encrypted Pages secret)
   ▼
modules/copybook/server/gemini.ts → Google Gemini generateContent
   │  validate: Traditional-only (reject Simplified leaks), contains target char,
   │  6–15 Han chars; retry up to 3×
   ▼
{ sentence } | { error }
```

The key is BYO per-profile (sent transiently in the request, stored only on the
device) and/or the Pages secret `GEMINI_API_KEY`. Keys are used for the single
request and never logged or persisted server-side. These functions live outside
`platform/tsconfig`'s include, so `tsc`/vite ignore them; wrangler compiles them
at deploy time. The default model is `gemini-2.5-flash` (overridable via
`GEMINI_MODEL`).

---

## 6.5 Feedback (siloed)

> 中文版：[architecture.zh-TW.md「6.5 意見回饋（siloed）」](./architecture.zh-TW.md)

The in-app feedback feature lets a user file a categorized report from anywhere in
the app and gives the owner a triage view. Its single most important property is
that it is **siloed**: the production endpoints are bound to a **dedicated D1
database and R2 bucket that hold only feedback**, and **no app / user / content
binding is present on the Function**, so app data is _physically_ unreachable from
the feedback code path. The dev mirror is siloed the same way (its own SQLite
file). Nothing about the feature shares a connection, a file, or a code path with
`platform.db` / `content.db` / the on-device user store.

### The widget (`platform/src/FeedbackWidget.tsx`)

A global floating 💬 button, bottom-right, mounted **once in the app shell**
(`App.tsx`) so it is present across the app. It is intentionally **not** on the
marketing landing page. It opens a dialog with: a **category** (`bug` /
`suggestion` / `content` / `confusing` / `other`), a **severity** segment
(`low` / `medium` / `high`), a free-text **message** (capped at 4000 chars), and
an **include-screenshot** checkbox.

- **Online-only.** Feedback submission needs the network; the send button is
  disabled offline (an `online`/`offline` listener tracks `navigator.onLine`).
- **Lazy screenshot pipeline.** The DOM-to-image library (`html-to-image`) is
  **dynamically imported only when a screenshot is actually captured**, so it never
  enters the offline app-shell critical path or precache. Capture renders
  `document.body` to a downscaled JPEG (longest side ~900px-equivalent via
  `pixelRatio`, starting at quality 0.7) and **steps quality down until it is under
  a ~300 KB target**; if it still cannot fit it is dropped gracefully (feedback
  still sends — a missing screenshot is never an error).
- **No-PII context.** Alongside the message the widget captures only non-personal
  context: the current **screen** (`body[data-screen]`), the active **module**, the
  app **version** (`__CONTENT_VERSION__`), the **numeric profile id**, **theme**,
  **language**, **viewport** size, **online** state, **user-agent**, and a
  **timestamp**. No display name, no learning stats, no characters/sentences — app
  and user data are never sent beyond the numeric profile id.

### Production API — Cloudflare Pages Functions (`platform/functions/api/feedback/`)

| Route                                                 | Method  | Audience   | What                                                                                                                                                                        |
| ----------------------------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/feedback` (`index.ts`)                          | `POST`  | **public** | Submit. Validated + size-capped (shared helper) + per-IP rate-limited; row stored in D1, screenshot bytes in R2 (key `feedback/<id>.<ext>`), the row keeps only the R2 key. |
| `/api/feedback` (`index.ts`)                          | `GET`   | **admin**  | List for triage (`?status=` filter, `?limit=`), plus per-status counts. Screenshots are omitted from the list payload.                                                      |
| `/api/feedback/:id` (`[id].ts`)                       | `PATCH` | **admin**  | Set one row's lifecycle status (`new` / `triaged` / `in-progress` / `resolved` / `wontfix`).                                                                                |
| `/api/feedback/:id/screenshot` (`[id]/screenshot.ts`) | `GET`   | **admin**  | Stream the row's screenshot image bytes from R2.                                                                                                                            |

Like the Gemini proxy, these live outside `platform/tsconfig`'s include (so
`tsc`/vite ignore them) and wrangler compiles them at deploy time.

- **Why siloed.** The submit/admin Functions declare **only** the `FEEDBACK_DB`
  (D1) and `FEEDBACK_R2` (R2) bindings plus the `FEEDBACK_ADMIN_SECRET`. There is
  no binding to any app database, so the feedback endpoints cannot read or write
  app/user/content data even in principle — siloing is enforced by the absence of a
  binding, not by convention. Screenshots live in R2 (not inline in D1) to keep
  rows small; if R2 is not bound the feedback still stores fine.
- **Per-IP rate limiting.** The POST handler is rate-limited per `cf-connecting-ip`
  using a small `rate_hits` D1 table (60-second sliding window, swept on each POST;
  over the cap → HTTP 429). It is **best-effort** — a missing rate table or a
  transient error never blocks a legitimate submission.
- **Admin gating.** The `GET` / `PATCH` / screenshot routes are gated by a shared
  secret (`FEEDBACK_ADMIN_SECRET`), supplied as the `x-feedback-admin-secret`
  **header only** — never a `?secret=` URL param (that would leak the secret into
  CF/access logs, browser history, and any `Referer`; audit **M2 / #55**). The
  triage surface fetches screenshot bytes with that header and renders an object-URL
  (revoked on unmount), so the secret never appears in an `<img src>`. Compared
  constant-time-ish. If the secret is unset the read/update routes are **closed
  (403), never open** — fail-safe.
- **Validation contract** is the portable helper `platform/server/feedback-shared.ts`
  (no Node/Worker imports, used by both runtimes — same pattern as the copybook
  Gemini helper). It enforces a known category + non-empty message, hard size caps
  on every field, an 8 KB cap on the serialized context JSON, and accepts a
  screenshot only if it looks like an `image/(png|jpeg|webp)` data URL within the
  cap (otherwise dropped, never an error).

### Schema (`platform/functions/migrations/0001_init.sql`)

The D1 migration creates a single `feedback` table (`id`, `created_at`, `category`,
`option`, `message`, `screen`, `context_json`, `screenshot_key` → the R2 key or
`NULL`, `ua`, `app_version`, `profile_id` → numeric only, `status`) plus status /
created-at indexes, and the `rate_hits` ledger table. The dev mirror builds the
same shape (with an inline `screenshot` column instead of an R2 key).

### Standalone triage surface (`/feedback-admin`, issue #59)

Feedback triage is a **standalone, unlinked surface**, deliberately **decoupled**
from the main learning app — it is the owner's private triage console, not part of
the learner PWA. It is the **sole** feedback-admin surface (it **superseded** the
former in-app admin-console `feedback` tab, which was removed).

- **Its own build entry / URL.** A second Vite HTML entry
  (`platform/feedback-admin.html` + `platform/src/feedback-admin.tsx`, wired via
  `rollupOptions.input` in `platform/vite.config.ts`) is emitted into the **same
  `dist`** and ships with the **same `pages deploy dist`**. It is reachable **only by
  direct URL** at the clean path **`/feedback-admin`** — Cloudflare Pages' built-in
  clean-URL handling serves the static `feedback-admin.html` at that extensionless
  path (and 308-redirects the explicit `/feedback-admin.html` → `/feedback-admin`),
  exactly like it serves `index.html` at `/`, so **no `_redirects` rule is needed**.
  ⚠️ A custom `/feedback-admin → /feedback-admin.html 200` rewrite must **not** be
  added: it collides with the clean-URL layer to form an infinite 308 loop
  (`ERR_TOO_MANY_REDIRECTS`) — the bug fixed in PR #67; `platform/public/_redirects`
  carries a comment warning against re-adding it. It is `noindex`/`no-store`
  (`platform/public/_headers`).
- **No UI navigation, either direction.** The entry imports **nothing** from `App`,
  mounts only the triage component (`platform/src/feedback-admin/FeedbackTriage.tsx`),
  and links nowhere back into the app; the app never links to it. Verified: the
  built `index.html` contains zero references to the feedback-admin entry.
- **Not a PWA page.** No manifest, no service-worker registration, no offline shell,
  no app-shell/theme CSS (it uses a tiny self-contained
  `platform/src/feedback-admin.css`). Its own HTML + entry JS/CSS are **excluded from
  the app's SW precache** (`workbox.globIgnores` in `vite.config.ts`; the entry gets
  a stable `feedback-admin-entry.js` name so the glob can target it). It is not
  pulled into the app bundle.
- **Prod read path, reused endpoints.** The owner enters the admin secret once; **Unlock
  PROBES the server** (`GET /api/feedback?limit=1` with the header) and only stores the
  secret in `localStorage` on a `200` — a `403` shows a clear inline cause instead of
  silently storing it and then bouncing back to "locked" on the first list/patch/screenshot
  call. Because the endpoint returns an **indistinguishable `403`** whether the secret is
  _wrong_ or simply _not configured on this deployment_, the unlock error names both — the
  latter is the **expected state on PR PREVIEW deploys**, where `FEEDBACK_ADMIN_SECRET` is
  bound only in the Pages project's **production** environment (see the provisioning runbook
  below). A `403` that arrives _after_ unlock (rotated/absent secret) re-locks the surface
  with the same message. The secret is entered at runtime and **never baked into the
  bundle**. The surface then reads the **existing** admin-gated, feedback-siloed endpoints —
  `GET /api/feedback` (list + `?status=` filter + counts), `PATCH /api/feedback/:id`
  (set status), and `GET /api/feedback/:id/screenshot` (image bytes) — sending the
  secret as the **`x-feedback-admin-secret` header only**. It shows feedback
  newest-first with **filter chips by status** (and counts), inline **status
  changes**, a per-row **no-PII context** line, and lazy-loaded **screenshot
  thumbnails** (header-fetched, rendered as object-URLs; click to enlarge). Nothing
  app/user/content-related is reachable from it — siloing is preserved because the
  Functions bind only the feedback D1/R2 + the secret.

### Dev Express mirror (`platform/server/feedback-*.ts`)

So the whole submit → triage flow works locally with **zero Cloudflare
provisioning**, the dev Express server (§7) mirrors the prod contract exactly:

- `feedback-routes.ts` — the same four routes (`POST` public; `GET` / `PATCH` /
  `:id/screenshot` admin-gated by `FEEDBACK_ADMIN_SECRET` from the dev `.env`,
  **header-only** — no `?secret=`, matching prod), the same validation, and an
  in-memory per-IP rate limiter. In dev the same standalone `/feedback-admin` entry
  is served by Vite (the app's `:3000` server) and hits these routes.
- `feedback-db.ts` — a **separate** `better-sqlite3` connection to
  `platform/feedback.db`, physically distinct from `platform.db` / `content.db`.
  No app code imports this module; it is the dev twin of the prod D1 database.
- `feedback-shared.ts` — the shared validation/secret helper (above), used by both
  dev and prod.

### Provisioning runbook (one-time, prod — by the account owner)

The siloed D1 / R2 / secret / Pages bindings are **not** created by the deploy
pipeline; they are a one-time manual setup. (Until they exist, the prod feedback
endpoints have nothing to bind to; the dev mirror needs none of this.)

```bash
# 1. Create the dedicated D1 database (holds ONLY feedback).
npx wrangler d1 create feedback

# 2. Apply the schema to it (creates the feedback + rate_hits tables).
npx wrangler d1 execute feedback --remote \
  --file=platform/functions/migrations/0001_init.sql

# 3. Create the dedicated R2 bucket for screenshots.
npx wrangler r2 bucket create learning-chinese-feedback

# 4. Set the admin secret (any random string; gates the read/triage routes).
#    NOTE: `pages secret put` targets the PRODUCTION environment only.
npx wrangler pages secret put FEEDBACK_ADMIN_SECRET --project-name=learning-chinese
```

Then, in the Pages project (**Settings → Functions → bindings**), add the **D1
binding `FEEDBACK_DB`** (→ the `feedback` database) and the **R2 binding
`FEEDBACK_R2`** (→ the `learning-chinese-feedback` bucket), and **redeploy**. The
bindings are deliberately limited to those two plus the secret — that absence is
what makes the feature siloed.

> ⚠️ **Preview vs Production.** Cloudflare Pages keeps **separate** secrets/bindings for
> the **Production** and **Preview** environments. `wrangler pages secret put` (step 4)
> writes the **Production** secret only, so on **PR preview** deploys
> `FEEDBACK_ADMIN_SECRET` is **unset** and every `/api/feedback*` call returns `403`
> regardless of what secret you type (fail-closed) — the `/feedback-admin` console will
> report exactly that on Unlock. This is expected and harmless (the console works on
> **prod**, where the secret is bound). To _also_ exercise triage on previews, add
> `FEEDBACK_ADMIN_SECRET` (and the `FEEDBACK_DB`/`FEEDBACK_R2` bindings) to the Pages
> project's **Preview** environment in the dashboard.

### Preview provisioning (issue #78)

One-time owner action: provision a **dedicated preview feedback stack** and bind
it only to the **Preview** environment. Cloudflare Pages shares one Preview
config across all non-production branches, so every PR preview automatically
uses these resources — while staying **isolated from production**:

```bash
# 1. Dedicated preview D1 database.
npx wrangler d1 create feedback-preview

# 2. Apply the same prod schema to the preview database.
npx wrangler d1 execute feedback-preview --remote \
  --file=platform/functions/migrations/0001_init.sql

# 3. Dedicated preview R2 bucket for screenshots.
npx wrangler r2 bucket create learning-chinese-feedback-preview

# 4. Distinct preview admin secret (not the production value).
# NOTE: `pages secret put` targets Production by default.
# Create the preview secret via the Pages dashboard Preview environment
# settings, or the preview-aware wrangler equivalent; verify it lands on
# Preview, not Production.
```

Then, in the Pages project (**Settings → Functions → Bindings → Preview
environment**), bind only:

- `FEEDBACK_DB` → `feedback-preview`
- `FEEDBACK_R2` → `learning-chinese-feedback-preview`

**Prod must stay untouched.** Preview and production must **not** share D1,
R2, or `FEEDBACK_ADMIN_SECRET`. Binding preview resources to Preview only
keeps preview test data out of production and prevents a leaked preview
secret from reaching production.

**Redeploy after binding attaches.** Bindings take effect on the next preview
deploy, so push a commit or reopen a PR. Verify with:

- submit feedback on a preview URL → row exists in `feedback-preview`
- `/feedback-admin` on a preview URL with the preview secret → `200`
- production `feedback` row count unchanged after preview testing

---

## 7. Dev server (development only)

`platform/server/index.ts` runs an Express server (`:3000`) with Vite in
middleware mode. It loads module servers, serves the shared platform routes
(dictionary browse, char stats, char ranks, DB snapshots for the PWA), and powers
the admin/curation UI. **None of this runs in production** — it exists to develop
the app and to produce/curate the data that gets baked and shipped.

### 7.1 Standalone Sentence Bank admin (`platform/server/bank-admin.ts`) — issue #49

The `:3000` server restarts/hot-reloads constantly while iterating on app/server
code, which takes the **Sentence Bank admin** down with it and interrupts curation
(importing AI batches, the gap-fill prompt loop, the multi-run batch auto-fill,
browsing coverage). `bank-admin.ts` is a **separate, dev-only Express process** on
its own port (`BANK_ADMIN_PORT`, default **3100**) that serves **only** the Sentence
Bank admin, so curation survives `:3000` bounces. Start it with `npm run dev:bank-admin`.

It reuses the exact same pieces as `:3000` — no fork:

- mounts `contentAdminRoutes` (`server/content-admin.ts`, §8.4) at `/api/content` —
  the full bank CRUD + coverage/ranking/TOCFL-levels + AI generation;
- mounts the copybook module's `routes` at `/api/copybook` for the Gemini
  key-validation probe (`POST /api/copybook/test-key`) the Prompt tab uses;
- serves a tiny standalone Vite entry (`bank-admin.html` → `src/bank-admin-main.tsx`)
  that renders just `<SentenceBankPanel />` (all six tabs + the View-all modal +
  per-char detail). It uses `appType: 'custom'` so Vite doesn't auto-serve the full
  app's `index.html`; the UI is served on the **same origin** as `/api/content/*` so
  the panel's same-origin `fetch('/api'+path)` resolves. In dev, `useAdminRead` takes
  its `/api` read path and never touches the offline data layer, so **no
  `OfflineProvider`** (no sql.js / IndexedDB boot) is needed.

**Concurrency (Option 1).** Both servers open `content.db` read-write in WAL. WAL
permits concurrent readers + a single writer across processes; `getDb()` in
`shared/src/content-db.ts` also sets `PRAGMA busy_timeout = 5000`, so a momentary
write-lock RETRIES instead of throwing `SQLITE_BUSY` — ample for the single-curator
workload. Edits land in the same `content.db`, so the normal curate → `npm run
seed:dbs` → commit flow is unchanged. The existing footgun extends: **stop BOTH
servers (or ensure neither is mid-write) before committing `content.db`** — never
commit a `.db` while a server holds it open (WAL).

**Security.** Dev-only; binds **`127.0.0.1` (localhost) by default**, NOT `0.0.0.0`,
so the unauthenticated admin/AI routes are not exposed on the LAN. Never deployed.

---

## 8. Admin & device settings

There are two distinct settings surfaces, reached from different screens and with
different audiences:

- **Device Settings** — the account-wide / device-wide screen on the pre-profile
  launch screen. Always available, ships in production.
- **Admin console** — the curation/debugging back office. Talks to the dev Express
  server's `/api/admin/*`, `/api/content/*`, and module routes, which **do not
  exist** in the production (Pages-only) deployment. Its entry button renders under
  `import.meta.env.DEV` **or** when the `admin` feature has been unlocked (codes
  `8000` then `8001`, §5.6 — `8001` is what the retired `8888` did) — so it can be
  opened on a production build, but the routes it drives only resolve against the
  dev server.

### 8.1 Device Settings (`DeviceSettings` in `platform/src/App.tsx`)

Reached by the gear button on the **Profile Picker** (and on the first-run
`WelcomePopup` when there are no profiles yet) — i.e. _before_ a profile is
chosen, because everything here is device- or account-level rather than
per-profile. Back returns to the picker. Sections, top to bottom:

| Section                                      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Notes / gating                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**                                 | App UI language toggle (`繁體中文` / `English`). Writes account `settings.language`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Always shown.                                                                                                                                                              |
| **Orientation** (`settings.orientationLock`) | **Lock to portrait** toggle. **Off by default** — the app adapts to landscape (§5.5 → _Orientation & landscape_). When on, best-effort locks via the Screen Orientation API; since iOS/iPadOS web can't force OS orientation, a full-screen "rotate back to portrait" overlay blocks landscape (its dismiss turns the lock off).                                                                                                                                                                                                                                                                                                   | Always shown.                                                                                                                                                              |
| **Theme** (`settings.theme`)                 | **Device-level** theme selector (`ThemeSelect`, scope=`device`) — the default look for every profile. Default is free; **Gold/Silver are premium** and each is listed **only after** its own code is redeemed device-wide (premium prerequisite `9000`, then `9900` → Silver / `9901` → Gold, under the Device ID below) — locked skins aren't shown here at all. Persists via `setDeviceTheme` → `localStorage` `lc-gold-mode`.                                                                                                                                                                                                   | Always shown, on every device. Resolution + storage: §5.5. (Replaced the old gold-device-only "Premium" toggle.)                                                           |
| **Backup & Restore**                         | **Back up now** exports a JSON of all profiles + prefs + theme state + unlocks (`exportBackup`). **Restore from file** parses a backup (`parseBackup`) and opens a modal for **selective** per-profile restore plus an optional "include prefs" toggle (`importBackupSelective`); reloads on success.                                                                                                                                                                                                                                                                                                                              | User data is per-device and never uploaded (§3); this manual JSON file is the only transfer path.                                                                          |
| **App version** (`settings.update`)          | **Update app now** clears caches + reloads (`onForceUpdate`), enabled only when the origin is reachable (a no-store `GET /data/version.json` poke; disabled offline, with a Retry link). Shows **Device version** (`__CONTENT_VERSION__`, baked at build), **Server version** (from the same poke) with an up-to-date / update-available note, and the **Device ID** (read-or-create UUID in `localStorage` `lc-device-id`; tap to copy — for support). Also holds the **Enter code** link → the `CodeEntry` keypad (§5.6) for redeeming the admin (`8000`→`8001`) and premium (`9000`→`9900`/`9901`) code series at device scope. | Versions are truncated to 8 chars for display. See §4 for `version` vs `contentHash`.                                                                                      |
| **Advanced settings** (`settings.advanced`)  | **Writing Challenge** → opens the **Levers** panel (§8.2). **Practice English** → opens the device **English voice** panel (§8.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | These two are always shown.                                                                                                                                                |
| _(gated buttons)_                            | **UI Components** → the Styleguide (dev-only). **Admin** → the Admin console (§8.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Styleguide renders only under `import.meta.env.DEV`; **Admin** renders under `import.meta.env.DEV` **or** when the `admin` feature is unlocked (codes `8000` then `8001`). |

Note: the **per-profile** settings screen (`AppSettings`, reached from the home
screen once a profile is active) is separate and holds display name, a per-profile
**Theme** override (`ThemeSelect`, scope=`profile`, with a "use device" inherit
option), that profile's English voice override, the per-profile **Gemini API key**
field + **Test** button (probes the key via `POST /api/copybook/test-key` — the
proxy, since the browser can't call Gemini directly; key stored only on-device in
`localStorage` `lc-gemini-key-u<id>`), and "Retake placement".

### 8.2 Levers panel (`platform/src/LeversPanel.tsx`)

The in-app, on-device twin of the writing-challenge engine settings the Mac admin
exposes. Shipped (Mac-baked) values are the defaults; edits here are stored as
**per-device overrides** (`offline-data-layer.setLeverOverride`) that persist
across content updates and ride along in backups. Each overridden lever shows a
badge + reset (↺); "Reset all" restores defaults. Only **live** levers are shown,
grouped: **Character selection** (parity_*), **Ranking** (`freq_model`,
`rank_freq_weight`), **Level & targets** (`level_known_pct`, `target_*`,
`above_level_threshold`), **"Known" criteria** (`known_*`), **Mastery scoring**
(`weight_*`, `correct_weight`, `streak_cap`, `decay_*`), and **Stroke
recognition** (`stroke_leniency`, `strokes_per_fail`). Also reachable as a
power-user escape hatch from the placement test's gear (Back returns to the test).

### 8.3 English voice panel (`platform/src/EnglishVoicePanel.tsx`)

Sets the **device-wide default** Web-Speech voice for the Practice-English module
(`getDeviceVoice` / `setDeviceVoice`, with preview). Each profile can override it
in their own per-profile settings.

### 8.4 Admin console (`platform/src/admin/AdminPage.tsx`) — dev-server backed

Opened from the Admin button in Device Settings (shown under `import.meta.env.DEV`
or once the `admin` feature is unlocked via codes `8000` then `8001`). All the routes it calls
are served by the **dev Express server only**, so even on a code-unlocked
production build the panels have no backend to talk to. A header **Debug Overlay**
toggle (gear) reads/writes the platform setting `debug_overlay` via
`/api/platform-settings`. Note the content/curation routes now live under
`/api/content/admin/*` (platform-owned content, §3.5 / §8.4-routes), while
per-profile/module routes stay under `/api/writing-challenge/*`. Five top-level
tabs:

| Tab                                     | Shows / does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Data & dev API                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Users** (`UsersPanel`)                | Lists device profiles (id, name, language, theme, created); delete a user (confirm). Click a row → detail with an **Overview** tab and a **Stroke Practice** tab: per-character mastery table (rank, TOCFL level, today/retention score bars, seen, P/C/I, streaks, avg ms, recent-result dots), sortable; plus level/totals summary.                                                                                                                                                                                                                                                                                                         | `/api/admin/users`, `DELETE /api/admin/users/:id`; detail pulls `/api/writing-challenge/admin/user-stats`, `/settings`, `/debug-info` (per-profile/module) plus `/api/content/admin/char-tocfl-levels` and `/api/content/admin/char-ranking` (platform content). Scores computed client-side via `@shared/character-stats/mastery`. |
| **Modules** (`ModulesPanel`)            | Enable/disable each installed module (toggle); click a module → its own admin (Stroke Practice or Word Sets; others show "No settings").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `/api/admin/modules`, `PATCH /api/admin/modules/:name`.                                                                                                                                                                                                                                                                             |
| **Dictionary** (`DictionaryPanel`)      | Browse imported dictionaries (char/word/link/stroke counts). Drill into a dict: **Chars** (grid w/ stroke count + TOCFL, animated + static hanzi-writer preview on click, sorted by **Frequency** or **Blended** rank), **Words** (table), **TOCFL only** filter, search, pagination.                                                                                                                                                                                                                                                                                                                                                         | `/api/dictionaries`, `…/chars`, `…/words`, `…/char/:id`; blended sort uses `/api/content/admin/char-ranking`.                                                                                                                                                                                                                       |
| **SQL** (`SqlBrowser`)                  | Raw SQL browser over the platform DB + each module DB. Sidebar lists DBs and tables (click a table → `SELECT * … LIMIT 50`); textarea runs arbitrary SQL (Cmd/Ctrl+Enter); results or error shown.                                                                                                                                                                                                                                                                                                                                                                                                                                            | `/api/admin/databases`, `POST /api/admin/sql/tables`, `POST /api/admin/sql/query`. **Arbitrary SQL against local dev DBs** — another reason this is dev-only.                                                                                                                                                                       |
| **Sentence Bank** (`SentenceBankPanel`) | Coverage dashboard for the platform-owned sentence bank (`content.db`, §3.5) against the ranked char list. Sub-tabs: **Summary** (good/neutral/needs-attention health cards w/ clickable gap chars), **Bands** (P1–P6 coverage bars), **Grid** (per-char coverage heat grid), **Gaps** (under-target table), **Prompt** (builds a gap-filling generation prompt — adjustable count / chars-to-target / char-pool — to copy out, **plus a "Generate with Gemini" button**), **Import** (paste `中文 \| English` pairs; client pre-filters ≤6-CJK sentences; reports added/filled/skipped — and the server canonicalizes each on import, §3.5). | `/api/content/admin/char-coverage`, `…/bank-sentences` (GET/POST). **"Generate with Gemini" → `POST /api/content/admin/ai-generate`, which exists only on the dev server** and needs `GEMINI_API_KEY` in the dev `.env` (or a per-profile key saved in `localStorage`, picked up as a BYO fallback).                                |

The module-level admin screens are: **Stroke Practice** (`StrokePracticeAdmin`) —
the full writing-challenge engine settings (stroke recognition, the mastery
scoring formula + weights, "known" criteria, word selection / ranking, target
words, parity selection) **plus an embedded full Sentence-Bank editor**
(`SentenceBankEditor`: dump/import-file/export, restore shipped default, clear all,
inline edit + bulk-delete grid, and a character-coverage modal). And **Word Sets**
(`WordSetsAdmin`) — create/delete vocabulary categories and add words to them via
dictionary search or manual entry, with drag-free up/down reordering.

> **Dev vs prod, in one line:** Device Settings, the Levers panel, and the English
> voice panel ship and run in production. The Admin console's _button_ can be opened
> in production (dev build, or the `8000`+`8001` admin unlock), but the routes behind it —
> `/api/admin/*`, `/api/writing-challenge/admin/*`, `/api/content/admin/*` (the
> platform-owned content/bank curation), `/api/dictionaries`, and
> `/api/platform-settings` — are served **only by the dev Express server** (§7), so
> the console is non-functional without it; in production only the copybook Gemini
> Pages Functions (§6) exist server-side.

---

## 9. Marketing / install landing (`platform/src/LandingPage.tsx`)

A standalone marketing page shown **only to browser-tab visitors on the real
domain** — its single job is to drive a PWA install so setup happens in the
installed (standalone) app where on-device data persists correctly.
`shouldShowLanding()` in `App.tsx` routes to it: `?landing` forces it, `?app`
forces the real app, and otherwise it shows on non-dev hosts when **not** running
standalone. It's pure presentation — no data layer, no offline boot — and is
lazy-loaded so it never weighs on the app shell.

- **Visual identity** — a bold, dark **VCASS-style** treatment: a deep **navy
  field (`#073464`)**, warm cream text, one bronze/gold accent, a single bright
  full-bleed band, and heavy uppercase display type. The hero states the app's
  **read + write** positioning plainly (寫 / 讀 米字格 cells).
- **The read-along coverage demo** — the centerpiece: a lined notebook holding a
  real Taiwan paragraph that "writes itself in" on scroll. A coverage slider sets
  how many of the most-common characters you "know"; the live frequency ranking
  (`LandingReadData.ts` — `RANKED` chars in frequency order) lights up the
  readable characters and shows a % coverage. **Situation tabs** (school / bank /
  shopping / doctor / news / restaurant) swap the paragraph, and a **Custom** tab
  lets visitors paste their own Traditional text to check against the level.
- **Fonts.** The paperpad renders its Chinese in a handwritten Brush 楷 face — the
  **LXGW WenKai TC web font** (jsDelivr, unicode-range-subset slices) with a
  system-Kaiti fallback. Web fonts are fine _here_ because the landing is online;
  the offline app shell deliberately does **not** depend on a web font.
- **Install flow** — captures `beforeinstallprompt` (Chrome/Android/desktop) and
  fires `prompt()` from the CTA; iOS Safari (no such event) is sniffed and routed
  to the manual Share → Add to Home Screen steps, so the CTA is never dead.
