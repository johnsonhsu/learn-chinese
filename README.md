# Learning Chinese

> 繁體中文: [README.zh-TW.md](./README.zh-TW.md)

> Living doc — kept current as the app changes. Refresh on significant changes/deploys.

A **local-first, offline-capable PWA** for learning Traditional Chinese the way
it's actually used in Taiwan (繁體中文 + zhuyin / bopomofo). Install it to your
home screen and practice with no account, no server, and no network — all your
progress lives on your device. Built as an npm-workspace monorepo and deployed as
static assets to Cloudflare Pages. The installed app defaults to **portrait**, and
Device Settings includes **Lock to portrait** for devices that keep rotating
during practice.

For the technical deep-dive see **[ARCHITECTURE.md](./ARCHITECTURE.md)**; for
building modules see **[modules/README.md](./modules/README.md)**.

---

## What it does — the seven modules

The home screen is a grid of self-contained learning activities. You pick a
profile (multiple learners can share a device), then a module:

- **Writing Challenge** (✍️ `writing-challenge`) — the core. Handwriting / stroke
  practice on real Taiwan-Traditional sentences, with stroke-by-stroke validation
  (HanziWriter), zhuyin hints, and audio. The app picks _which_ character you
  most need to drill and finds a natural sentence to drill it in (see "the smarts"
  below).
- **Word Sets** (📚 `word-sets`) — browse curated vocabulary categories with
  zhuyin/pinyin and TOCFL level, tap a word to hear it and practice writing it.
- **Practice English** (🔤 `practice-english`) — an English cloze spelling game
  (fill the missing letters) with an on-screen keyboard and audio.
- **Copybook** (📝 `copybook`) — bring-your-own-text verbatim writing practice:
  paste any text and write it character by character. Optionally **Generate** a
  fresh Taiwan-Traditional sentence with Gemini.
- **My Characters** (📊 `my-characters`) — your personal progress dashboard: every
  character you've practiced as a stats table and a tile grid (mastery / retention
  scores, known vs learning), with a tap-to-practice drill.
- **Reading Chinese** (📖 `reading-chinese`) — reading-comprehension practice:
  hear a sentence + see its English, then reconstruct it by tapping its characters
  **in order** from a shuffled pool of the sentence's own chars (no writing pad).
  Reading is tracked as a **separate per-character skill** from writing — you can
  recognize a character without yet being able to write it — so reading mastery is
  computed independently of writing mastery.
- **Reading English** (📗 `reading-english`) — the English analogue of Reading
  Chinese: hear a bank sentence's English + see its Chinese prompt, then reconstruct
  the English translation by tapping its **words in order** from a shuffled pool of
  the sentence's own words (no keyboard). Reading is tracked as a **separate
  per-word skill** from the Practice-English spelling stats — you can read a word
  you can't yet spell — in its own on-device store, so the two never cross-contaminate.

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
and three FREE skins, **Midnight** (墨夜, ink-dark mode), **Sakura** (櫻花, blush light), **Matcha** (抹茶, sage-green light), and **80s Motiv** (八零動力, neon chrome). A theme
is one entry in the `themes.ts` registry; its look is a `body[data-theme="<id>"]`
block — inline in `index.css` (Gold/Silver) or a standalone `theme/theme-<id>.css`
file imported in `main.tsx` (Midnight/Sakura/Matcha/80s Motiv/retro). Default sets nothing — it
_is_ the `:root` look. You can set a theme **for the whole device** in Device
Settings, or **per profile** in that profile's settings; the effective theme
resolves as `profileOverride ?? device ?? default`. The four new skins are free;
only Gold/Silver are premium and unlock **device-wide only**, each by its **own
code** behind a premium **prerequisite** — redeem **`9000`** first (grants the
prerequisite, reveals nothing), then **`9900`** → Silver and/or **`9901`** → Gold,
**independently**, on the on-screen keypad (`CodeEntry`) under the Device ID in
Device Settings (`lc-unlocks`). A `99xx` code entered before `9000` is **rejected
as an ordinary invalid code** — the same generic "Invalid code" an unknown code
gets, with **no hint** that the code is real or that a prerequisite exists. There is no per-profile
unlock (a profile can only _override_ among themes already unlocked on the device).
Once unlocked, the theme selectors list **only the available themes** (locked
premium skins aren't shown), and the Profile Picker shows a per-profile crown only
when that profile's _own_ override is Gold/Silver. The chosen theme and the unlocks
ride along in the JSON backup. (The dev Admin console unlocks analogously: **`8000`**
prerequisite then **`8001`** to reveal it. The old blanket `9999`/`8888` codes are
**removed**, but devices that already redeemed them keep their unlocks.) Details:
[ARCHITECTURE.md §5.5–5.6](./ARCHITECTURE.md).

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

The app then scores every sentence in the bank that _contains_ the chosen char
and picks the best fit (random tiebreak). Scoring is **positive-only** — it
rewards a sentence's _other_ characters for:

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
_consumer_ of one shared curriculum. Per-profile progress stays separate. On
import (and via an offline scrub, `scripts/bank-fix.py`) every sentence is
**canonicalized to one Taiwan-Traditional form**: Simplified → Traditional, but
台 _and_ 臺 are both preserved (never converted), and undrawable variant glyphs are
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

## Testing

Vitest (TS) + pytest (the one Python parity test). Run on every PR and **gate every deploy** (see [ARCHITECTURE.md §4.5](./ARCHITECTURE.md)).

```bash
npm test           # everything
npm run test:unit  # fast unit tests (shared/ engine + platform/src/)
npm run test:data  # data-integrity gate — run after a bake; checks the shipped artifacts
pytest test/test_glyph_canon.py    # Python side of glyph-parity (needs: pip install opencc pytest)
```

- **Engine** — sentence selection (target char is _binding_, parity/coverage), mastery/retention, "known"/level, char ranking, zhuyin.
- **Glyph-canonicalization parity** — the TS importer (`canonicalizeTW`) and the Python scrub (`bank-fix.py canon()`) are checked against one shared golden fixture (`test/fixtures/glyph-canon.json`) so they can't drift: 台/臺 preserved, variant unification (汙→污…), Simplified→Traditional.
- **Data-integrity gate** — the shipped DBs carry no Simplified/undrawable glyphs, are referentially sound, contain **no personal data**, and every curriculum char used in the bank is drawable offline.
- _(A theme-resolution suite — selection, premium gating, per-profile override, `body[data-theme]` apply — is written and lands with the theme refactor it depends on.)_

**Test discipline.** Treat the suite as a well-oiled machine: on **any** change, decide whether tests need to be added or updated and state that test impact in the issue/PR. The data-integrity gate blocks deploys on bad content automatically, but **unit + parity coverage is the contributor's job** — new engine logic or a fixed bug ships with its guarding test in the same PR.

**Verification on every PR.** The PR template's **Verification** section is required on **every** PR (including docs-only ones, which merge on green with no human review). Record both _how I verified_ — the checks actually run for this change (`npm run test:unit` always; `test:data`/`seed:dbs` for content; the glyph-parity pytest for glyphs; `npx vite build`, never `npm run build`; a named visual check on the preview's `?ui` Styleguide / `?app&demo` for UI/theme work) — and _how to verify (reviewer)_: a concrete preview reproduction (route + themes/elements + expected result), the "Review: …" one-liner our PRs already carry.

## Marketing screenshots

A small Playwright harness in `platform/` captures marketing/build images.
It is **not** an app integration test and is **not** wired into CI yet.

- Config: `platform/playwright.config.ts`
- Specs: `platform/scripts/marketing-screenshots/marketing.spec.ts`
- Outputs: `platform/public/marketing/` (`landing.png`, `styleguide.png`, plus `*.meta.json`)
- Run: `cd platform && npx playwright test --project=desktop`
- When: run manually when marketing assets need refreshing; no deploy step, no app-code change.

## Deployment

Deployed to **Cloudflare Pages** as static assets — no production server. **Deploys are CI-driven** (`.github/workflows/ci.yml`) and gated on the tests + data-integrity check:

- **Pull request → preview.** CI builds from the committed seeds, runs the gate, deploys a Cloudflare Pages **preview**, and comments its URLs on the PR — including the demo link `…/?app&demo`.
- **Merge to `master` → production.** Identical build + gate. The Pages project is _direct-upload_ with production branch **`learning-chinese`** (not `master`), so the workflow deploys `--branch=learning-chinese` on a master push (→ `learnchinese.hsu.mobi`) and `--branch=<PR head>` on a PR (→ preview).
- **One-time setup:** repo secrets `CLOUDFLARE_API_TOKEN` (Pages:Edit) + `CLOUDFLARE_ACCOUNT_ID`, and the CF project's production branch set to `learning-chinese`.
- **Docs-merge-on-green.** A **documentation-only** PR (README / ARCHITECTURE / CLAUDE.md / `.github/` templates — no source, DB, or workflow changes) may be **merged automatically once CI is green**, with no human-review step. **Code and content (curriculum) PRs still need a review** before merge.

**Shipping a change** — there's no manual deploy; open a PR, eyeball its preview, merge:

**PR-title convention** — title PRs `[PR-###][<type>][<issue#>] <title>` (e.g. `[PR-016][bug][14] Stroke-result fail + above-level read red`) so the PR list stays scannable and each PR ties to its type and issue at a glance. `[PR-###]` is the PR number zero-padded to 3 digits; `[<type>]` is the issue type label (`bug` / `enhancement` / `content` / `performance`); `[<issue#>]` is the linked issue (omit the bracket if there's none); `<title>` is concise. Because the PR number only exists after creation, **backfill `[PR-###]` right after `gh pr create`** with `gh pr edit <n> --title …`.

| Change                             | Steps                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Code                               | PR → preview → merge to `master`. Automatic.                                                                 |
| Content (`content.db` / module DB) | also `npm run seed:dbs`, commit `seed/*.db` + `content.db` → PR. The gate re-checks glyphs/coverage/privacy. |
| Stroke override                    | add `platform/public/stroke-data/<char>.json`; drop that char from the gate's `STROKE_ALLOWLIST`.            |
| Demo data                          | bump `DEMO_VERSION` in `platform/src/offline/demo.ts`.                                                       |

Reproducible builds: the working `platform.db` / `writing-challenge.db` hold local progress and stay out of git; CI builds from scrubbed, content-only **`seed/`** DBs. Local builds **no longer auto-deploy**. Manual escape hatch (deploys a _preview_):

```bash
npm run build --workspace=platform
npx wrangler pages deploy platform/dist --project-name=learning-chinese --branch=<your-branch>
```

**Try it (no install):** `learnchinese.hsu.mobi/?app&demo` boots the app pre-loaded with demo profiles, in an isolated demo storage jar (see [ARCHITECTURE.md §4.6](./ARCHITECTURE.md)). The demo is **mobile/touch-only** — on desktop it's gated (a client capability check, not UA sniffing) and shows an "open it on your phone" QR panel instead; the real/installed app is never gated. The in-app landing links the demo via a "Try the live demo" CTA (en + zh-TW).

- **`build`** bakes the shipped DBs + `stroke-data.json` + `version.json`, then
  runs `vite build`. Every build stamps a **fresh per-deploy `version`** (and a
  separate data-only `contentHash`), so the in-app "new version available" banner
  fires on every deploy while devices only re-download the ~18 MB databases when
  the _data_ actually changes. (See [ARCHITECTURE.md §4](./ARCHITECTURE.md).)
- **Gemini secret** (one-time, for copybook Generate in prod):

  ```bash
  npx wrangler pages secret put GEMINI_API_KEY --project-name=learning-chinese
  ```

  (BYO per-profile keys work without this; the secret is the shared fallback.)

- **Feedback feature** (the in-app 💬 widget) is **siloed** — a dedicated D1 + R2 +
  admin secret with no app/user/content binding. Its one-time provisioning runbook
  (`wrangler d1 create` / migration / `r2 bucket create` / `pages secret put
FEEDBACK_ADMIN_SECRET` / add Pages bindings → redeploy) lives in
  [ARCHITECTURE.md §6.5](./ARCHITECTURE.md).

---

## Running locally

```bash
npm install                  # installs all workspaces

npm run dev                  # Express + Vite dev server on http://localhost:3000
                             #   (full dev server: modules' APIs + admin UI)

npm run dev:bank-admin       # standalone Sentence Bank admin on http://localhost:3100
                             #   (dev-only, localhost-only; own process so curation
                             #    survives :3000 restarts. Port: BANK_ADMIN_PORT)

npm run build                # bake data + vite build  (writes platform/dist)
npm -w platform run preview  # serve the production build (vite preview, :4173)
npm -w platform run bake:data  # re-bake shipped DBs / version.json only
```

The app is local-first, so most of it runs with no server at all — the dev server
(`:3000`) is mainly for admin/curation and producing the baked data.

For long curation sessions, run the **standalone Sentence Bank admin**
(`npm run dev:bank-admin`, default `:3100`) in its own process: it serves only the
Sentence Bank tab (with all its sub-tabs) and reads/writes the same `content.db`, so
restarting `:3000` while iterating on code doesn't interrupt importing/browsing.
Both servers can run at once (`content.db` is WAL + a `busy_timeout`, so concurrent
access is safe). It binds localhost only and never ships to production. Stop both
servers before committing `content.db` (don't commit it while a server holds it open).

**Optional extras:**

- **`.env` for Generate** — to use copybook's Generate locally without a BYO key,
  put `GEMINI_API_KEY=...` in a `.env` the dev server reads (the client BYO key
  takes precedence when present). `GEMINI_MODEL` optionally overrides the default
  `gemini-2.5-flash`.
- **Local LLM scripts** — a few dev-only sentence-generation scripts use a local
  Ollama runtime instead of cloud AI. See [`docs/local-llm-setup.md`](./docs/local-llm-setup.md).

---

## Repo map

| Path                        | What                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `shared/`                   | `@shared/character-stats` — ranking, mastery, "known", selection (pure)     |
| `platform/`                 | PWA shell, offline data layer, UI kit, admin, bake/deploy, Pages Functions  |
| `modules/*`                 | the five learning activities (see [modules/README.md](./modules/README.md)) |
| `ARCHITECTURE.md`           | technical architecture (monorepo, module system, data, deploy)              |
| `platform/src/ui/README.md` | the shared UI kit reference                                                 |
