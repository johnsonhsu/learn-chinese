# Learning Chinese

> 繁體中文: [README.zh-TW.md](./README.zh-TW.md)

> Living doc — kept current as the app changes. Refresh on significant changes/deploys.

A **local-first, offline-capable PWA** for learning Traditional Chinese the way
it's actually used in Taiwan (繁體中文 + zhuyin / bopomofo). Install it to your
home screen and practice with no account, no server, and no network — all your
progress lives on your device. Built as an npm-workspace monorepo and deployed as
static assets to Cloudflare Pages.

For the technical deep-dive see **[ARCHITECTURE.md](./ARCHITECTURE.md)**; for
building modules see **[modules/README.md](./modules/README.md)**.

---

## What it does — the four modules

The home screen is a grid of self-contained learning activities. You pick a
profile (multiple learners can share a device), then a module:

- **Writing Challenge** (✍️ `writing-challenge`) — the core. Handwriting / stroke
  practice on real Taiwan-Traditional sentences, with stroke-by-stroke validation
  (HanziWriter), zhuyin hints, and audio. The app picks *which* character you
  most need to drill and finds a natural sentence to drill it in (see "the smarts"
  below).
- **Word Sets** (📚 `word-sets`) — browse curated vocabulary categories with
  zhuyin/pinyin and TOCFL level, tap a word to hear it and practice writing it.
- **Practice English** (🔤 `practice-english`) — an English cloze spelling game
  (fill the missing letters) with an on-screen keyboard and audio.
- **Copybook** (📝 `copybook`) — bring-your-own-text verbatim writing practice:
  paste any text and write it character by character. Optionally **Generate** a
  fresh Taiwan-Traditional sentence with Gemini.

**Who it's for:** learners (and families/kids) studying Traditional Chinese for
Taiwan, who want focused handwriting practice driven by what they personally still
need, fully usable offline.

**The landing page.** Browser-tab visitors on the real domain first hit a
marketing/install **landing page** (`platform/src/LandingPage.tsx`, also forced
with `?landing`) whose whole job is to get the app installed to the home screen.
It's a bold, dark, navy (`#073464`) VCASS-style identity around the read+write
positioning, with an interactive **read-along coverage demo**: drag a slider to set
how many of the most-common characters you "know" and watch real Taiwan text light
up (with situation tabs and a paste-your-own option). See
[ARCHITECTURE.md §9](./ARCHITECTURE.md).

---

## The UI system

Every screen is built from a small **shared UI kit** (`platform/src/ui`) so the
whole app shares one look — a chunky, friendly **"cartoon-candy"** aesthetic
(cream panels, purple borders, pressable 3D candy buttons with a colored lip).

- `<Button variant="primary|secondary|ghost">` — the 3D candy button.
- `<ModuleScreen title onBack? children>` — the standard module main-screen shell
  (back pill + cream card + title). A module's landing is essentially
  `<ModuleScreen title onBack={onExit}>…<Button/>…</ModuleScreen>`.
- `<Card>` / `<BackButton>` — the cream panel, and the unified standalone back pill
  every module reuses.
- `<CharTile>` — the shared character tile (rank, level, mastery bar, recent-result
  dots, ribbon), reused across My Characters, "next up" chips, and word-set lists.

All colors/sizes/fonts are **CSS custom properties defined once** on `:root` in
`platform/src/index.css`; modules use `var(--token)` and never fork them. The
kit's stylesheet is imported once by `main.tsx`. Full details in
**[platform/src/ui/README.md](./platform/src/ui/README.md)**.

### Themes

On top of the kit there's a registry-driven **theming system**
(`platform/src/theme/`): **Default**, two premium skins — **Gold** (warm foil)
and **Silver** (cool platinum) — and three FREE skins, **Midnight** (墨夜, ink-dark
mode), **Sakura** (櫻花, blush light) and **Matcha** (抹茶, sage-green light). A theme
is one entry in the `themes.ts` registry; its look is a `body[data-theme="<id>"]`
block — inline in `index.css` (Gold/Silver) or a standalone `theme/theme-<id>.css`
file imported in `main.tsx` (Midnight/Sakura/Matcha). Default sets nothing — it
*is* the `:root` look. You can set a theme **for the whole device** in Device
Settings, or **per profile** in that profile's settings; the effective theme
resolves as `profileOverride ?? device ?? default`. The three new skins are free;
only Gold/Silver are premium and unlock **device-wide only** — by redeeming **code 9999** on the on-screen keypad
(`CodeEntry`) under the Device ID in Device Settings (`lc-unlocks`); there is no
per-profile unlock (a profile can only *override* among themes already unlocked on
the device). Once unlocked, the theme selectors list **only the available themes**
(locked premium skins aren't shown), and the Profile Picker shows a per-profile
crown only when that profile's *own* override is Gold/Silver. The chosen theme and
the unlock ride along in the JSON backup. (`8888` similarly unlocks the dev Admin
console.) Details: [ARCHITECTURE.md §5.5–5.6](./ARCHITECTURE.md).

---

## "The smarts" — what to practice next

The goal is **practicing characters, not sentences**: sentences are just a natural
vehicle for drilling the specific characters a learner needs. The selection logic
lives in `shared/src/sentence-generator.ts` (pure, runs identically on-device and
on the dev server) and works in two stages.

### 1. Pick WHICH character to drill (parity weighting)

From the learner's **target characters** (the unknown chars in a window around
their level — see `shared/src/char-knowledge.ts`), each candidate gets a weight
that blends:

- **need** — higher for low-mastery chars and never-seen chars
  (`parity_mastery_weight`), boosted if recently missed (`parity_miss_boost`,
  looking at the last few results). Need is **capped** (`parity_need_cap`) so
  nothing dominates.
- **recency / anti-starvation** — the staler a char (oldest `lastSeen`), the
  higher its recency multiplier (`parity_recency_cap`), so every target char
  eventually comes back around.

A weighted random pick chooses the char. The emphasis is **parity and coverage**
(drill everything you need) over variety.

### 2. Pick the best bank sentence containing that char

The app then scores every sentence in the bank that *contains* the chosen char
and picks the best fit (random tiebreak). Scoring is **positive-only** — it
rewards a sentence's *other* characters for:

- being in the target pool (`bank_pool_weight`),
- being already comfortable/known, i.e. at/below level (`bank_known_weight`),
- having a frequency rank **close** to the target char's
  (`bank_near_weight` / `bank_near_scale`).

There is **no penalty** for above-level or recently-seen chars — leaps and
repetition are welcome. If no target char has bank coverage, it falls back to the
highest-scoring sentence overall (anchored on its char closest to the learner's
level); the absolute last resort is the neediest char on its own.

### The sentence bank — the "brain"

Practice sentences come from a **curated bank** (the `bank_sentences` table,
~3,800 natural Taiwan-Traditional sentences, roughly 6–15 characters each).
Template / merge-field generation has been removed — the bank is the single source
of practice sentences. (Curation/fill workflow: `npm run analyze-bank`.)

The bank — along with the TOCFL word list — is **platform-owned curriculum**
living in its own `platform/content.db` (accessed via
`@shared/character-stats/content-db`), shipped to devices as `content.db`. It used
to live inside `writing-challenge.db`; it was extracted so every module is a pure
*consumer* of one shared curriculum. Per-profile progress stays separate. On
import (and via an offline scrub, `scripts/bank-fix.py`) every sentence is
**canonicalized to one Taiwan-Traditional form**: Simplified → Traditional, but
台 *and* 臺 are both preserved (never converted), and undrawable variant glyphs are
unified to their ranked, drawable form (汙→污, 秘→祕). See
[ARCHITECTURE.md §3.5](./ARCHITECTURE.md).

### Mastery, levels, and "known" — the tuning levers

All of this is governed by settings ("levers") with sensible defaults, editable
per-device in the advanced settings panel:

- **Character ranking** (`shared/src/char-ranker.ts`) — every TOCFL character is
  ranked by a blend of frequency rank and TOCFL level
  (`rank_freq_weight` / `rank_level_weight`, `freq_model`).
- **Mastery / retention** (`shared/src/mastery.ts`) — a 0–100 score from recent
  results (recency-weighted), overall accuracy, and current streak, then **decayed
  over time since last seen** (forgetting curve). Levers: `weight_recent`,
  `weight_overall`, `weight_streak`, `correct_weight`, `streak_cap`,
  `decay_per_day`, `decay_mode`.
- **"Known"** (`shared/src/char-knowledge.ts`) — a char is known when **all** of:
  (1) N of the last M attempts were correct/perfect, (2) retention ≥ threshold,
  (3) last good attempt within N days. Levers: `known_recent_*`,
  `known_retention_*`, `known_recency_*`.
- **Level & fluency** — level is the highest N where the learner knows ≥
  `level_known_pct`% of the first N ranked chars; fluency is a 0–100 RPG-style
  curve over total known chars.

### Gemini-powered "Generate" (copybook)

In **copybook**, learners can generate a fresh sentence instead of pasting their
own. It's a best-effort online convenience:

- **BYO key, per profile** — each profile can store its own Gemini API key
  (entered + testable in Settings); a Pages secret can also serve as a fallback.
- **Server-proxied** — the browser can't call Gemini directly (CORS / key
  exposure), so it goes through a Cloudflare Pages Function
  (`platform/functions/api/copybook/generate.ts`) that reuses the portable
  generator in `modules/copybook/server/gemini.ts`.
- **Traditional-only validation** — Gemini occasionally leaks Simplified
  characters, so every candidate is validated (Traditional-only, contains the
  target char, 6–15 Han chars) and retried up to 3× before giving up.

---

## Deployment

Deployed to **Cloudflare Pages** as static assets — no production server.

```bash
npm -w platform run deploy
# = npm run build (bake data + vite build)  &&  wrangler pages deploy dist
#   --project-name=learning-chinese
```

- **`build`** bakes the shipped DBs + `stroke-data.json` + `version.json`, then
  runs `vite build`. Every build stamps a **fresh per-deploy `version`** (and a
  separate data-only `contentHash`), so the in-app "new version available" banner
  fires on every deploy while devices only re-download the ~18 MB databases when
  the *data* actually changes. (See [ARCHITECTURE.md §4](./ARCHITECTURE.md).)
- **Gemini secret** (one-time, for copybook Generate in prod):

  ```bash
  npx wrangler pages secret put GEMINI_API_KEY --project-name=learning-chinese
  ```

  (BYO per-profile keys work without this; the secret is the shared fallback.)

---

## Running locally

```bash
npm install                  # installs all workspaces

npm run dev                  # Express + Vite dev server on http://localhost:3000
                             #   (full dev server: modules' APIs + admin UI)

npm run build                # bake data + vite build  (writes platform/dist)
npm -w platform run preview  # serve the production build (vite preview, :4173)
npm -w platform run bake:data  # re-bake shipped DBs / version.json only
```

The app is local-first, so most of it runs with no server at all — the dev server
(`:3000`) is mainly for admin/curation and producing the baked data.

**Optional extras:**

- **`.env` for Generate** — to use copybook's Generate locally without a BYO key,
  put `GEMINI_API_KEY=...` in a `.env` the dev server reads (the client BYO key
  takes precedence when present). `GEMINI_MODEL` optionally overrides the default
  `gemini-2.5-flash`.

---

## Repo map

| Path | What |
|------|------|
| `shared/` | `@shared/character-stats` — ranking, mastery, "known", selection (pure) |
| `platform/` | PWA shell, offline data layer, UI kit, admin, bake/deploy, Pages Functions |
| `modules/*` | the four learning activities (see [modules/README.md](./modules/README.md)) |
| `ARCHITECTURE.md` | technical architecture (monorepo, module system, data, deploy) |
| `platform/src/ui/README.md` | the shared UI kit reference |
