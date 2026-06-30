# CLAUDE.md — orientation for AI coding sessions

Read this first. It's the distilled "don't re-learn it" guide for this repo. Authoritative
deep docs: **[ARCHITECTURE.md](./ARCHITECTURE.md)** (esp. §4.5 testing/CI, §4.6 demo) and
**[README.md](./README.md)** — keep those current (see *Conventions*).

## What this is

A **local-first PWA for learning Traditional Chinese (Taiwan focus, zhuyin not pinyin)**.
Monorepo, React 19 + Vite, ships as static assets to **Cloudflare Pages**
(`learnchinese.hsu.mobi`). **No runtime server** — curriculum ships baked into the client
(sql.js + IndexedDB); a dev-only Express server exists for admin/curation. Per-profile
progress lives entirely on-device in IndexedDB.

## Repo map

| Path | What |
|------|------|
| `shared/` | `@shared/character-stats` — **the smarts**, PURE logic: `mastery`, `char-ranker`, `char-knowledge`, `sentence-generator`, `zhuyin`, `content-db` (the importer; only this one uses better-sqlite3/opencc). |
| `platform/` | The app. `App.tsx`, `offline/` (data layer, `user-store`, `demo`), `theme/`, `ui/` (shared kit), `scripts/bake-data.ts`, `server/` (**dev-only** Express :3000). |
| `modules/` | Lazy-loaded modules: `writing-challenge`, `word-sets`, `practice-english`, `copybook`, `my-characters`. |
| `scripts/` | Python analysis + `bank-fix.py` (glyph scrub), `seed-dbs.ts`. |
| `test/` | Cross-language fixtures + the one pytest (`test_glyph_canon.py`). |
| `seed/` | Committed, scrubbed, content-only DBs so CI can build (see *Data*). |

## Daily commands

```bash
npm run dev                  # Express + Vite dev server on :3000 (admin/curation + client)
npm test                     # all Vitest
npm run test:unit            # fast units (shared/ + platform/src)
npm run test:data            # data-integrity gate (run AFTER a bake)
npm -w platform run bake:data   # re-bake shipped DBs + version.json (NO deploy)
npm run seed:dbs             # regenerate committed seed DBs after a content change
pytest test/test_glyph_canon.py # Python glyph-parity (needs: pip install opencc pytest)
```

You're authorized to restart the dev server when needed: `lsof -ti:3000 | xargs kill; npm run dev` (background).

## Deploy = GitHub Actions, automatic, NEVER manual

- **Merge to `master` → production** (CI builds + gates + `wrangler pages deploy`). **PR → preview** with the URL commented on the PR. There is **no** manual deploy step.
- The Pages project is **direct-upload** (no Git connection); its **production branch is `learning-chinese`, NOT `master`**. The workflow (`.github/workflows/ci.yml`) deploys `--branch=learning-chinese` on a master push (→ prod) and `--branch=<PR head>` on a PR (→ preview). Don't "fix" this to `master`.
- The **data-integrity gate (`test:data`) blocks every deploy** — bad content/code can't ship.
- A local PostToolUse hook in `.claude/settings.local.json` used to deploy `dist` to **prod** on any `npm run build` — it has been **removed** (CI owns deploys now). That file is machine-local + gitignored, so a fresh clone never has it. To verify a build without deploying, `npm -w platform run bake:data` and/or `npx vite build` (in `platform/`).
- **Issue + PR templates** live in `.github/` (PR #9): a Markdown issue chooser (bug / feature / content / performance + `config.yml`) and a PR template whose checklist mirrors the gates + cardinal rules. ⚠️ `gh pr create --body` **overrides** the PR template — so when opening a PR from the CLI, fill those sections in yourself (type, the test/living-docs/content checklists, cardinal-rule ticks).

## Testing (3 tiers)

1. **Engine units** (`shared/src/__tests__`): `sentence-generator` (the **binding** invariant + seeded-RNG coverage), `mastery`, `char-knowledge`, `char-ranker`, `zhuyin`. Fake `DbQueryProvider`; `vi.setSystemTime` for time; seeded `Math.random`.
2. **Glyph-canonicalization parity**: `canonicalizeTW()` (TS, `content-db.ts`) vs `bank-fix.py canon()` (Python) against ONE golden fixture `test/fixtures/glyph-canon.json` — they MUST agree.
3. **Data-integrity gate** (`platform/test/data-integrity.test.ts`, run on baked output): no Simplified/undrawable glyphs, referential, **no personal data**, offline stroke coverage (with a documented `STROKE_ALLOWLIST`).

## Data model + changing content

- `content.db` (**committed**, platform-owned): `bank_sentences`, `tocfl_words`, `char_words` — THE curriculum.
- `platform.db` (dictionary; gitignored) → committed scrubbed **`seed/platform.db`**. `writing-challenge.db` (module_settings; gitignored) → **`seed/writing-challenge.db`**. `word-sets.db` committed. CI builds from working DB if present, else the seed.
- **To change curriculum**: edit via the dev admin → `npm run seed:dbs` → commit `content.db` + `seed/*` → PR. The gate re-verifies.
- **Privacy**: `bake-data.ts` scrubs personal rows from snapshots. NEVER ship profiles/stats (a leak in the writing-challenge snapshot was the reason the gate exists).

## CARDINAL RULES — do not break

1. **台 (U+53F0) and 臺 (U+81FA): NEVER convert, either direction.** Both are valid Taiwan forms. (A blanket `臺→台` once destroyed the user's data — they were adamant.) They're shielded across the OpenCC pass.
2. **`canonicalizeTW` and `bank-fix.py canon()` MUST stay in sync** (golden-fixture test enforces). `VARIANT_MAP` (汙→污, 秘→祕…) lives in BOTH.
3. **Sentence selection's goal is practicing the target CHARS, not sentences.** Selection is **binding** — the chosen char MUST appear in the result; never silently substitute an easier one. Favor parity/coverage over variety.
4. **HanziWriter leaks 2 global document listeners per `create()`.** REUSE one writer via `setCharacter()`/`quizSession`; **never remount `WritingCanvas` per character or via a per-char `key`.**
5. **Stroke data**: bundled from `hanzi-writer-data` + hand-made Taiwan overrides in `platform/public/stroke-data/` (committed). Chars no dataset covers (currently 溼/痠/嬤/嚐/綑) are in the gate's allowlist; source new ones from **animCJK** (`graphicsZhHant.txt`), then drop them from the allowlist.

## Theme + demo

- **Theme** (`platform/src/theme/`): registry in `themes.ts`. `DEFAULT_THEME_ID` = the default *selection* (currently `indigo`); `ROOT_THEME_ID` = the bare `:root` "Paper" look (`default`) which REMOVES `body[data-theme]`. Apply via `applyThemeToBody`. Resolution: `profileOverride ?? device ?? default`; premium themes gated by a device unlock.
- **Demo "try it"** (`platform/src/offline/demo.ts`): visit **`/?app&demo`**. `?app` skips the marketing landing; `?demo` opens an ISOLATED IndexedDB (`learning-chinese-user-demo`) and seeds preset profiles at runtime. A `__demoVersion` stamp gates reseeding — **bump `DEMO_VERSION` to refresh the demo for everyone**. Storage is isolated so eviction never touches a real user.

## Environment gotchas

- A **stale invalid `GITHUB_TOKEN` env var** shadows the `gh`/`git` keyring login. Prefix git/gh commands with `GITHUB_TOKEN= GH_TOKEN=` so they use the keyring.
- **Network commands** (`wrangler`, `gh`, internet `curl`) need the sandbox disabled (`dangerouslyDisableSandbox: true`).
- macOS: no `timeout` binary; `cd` inside a compound command may prompt for permission.

## Conventions

- **LIVING DOCS**: when you change architecture / deploy / the UI kit / the smarts, update **README.md + ARCHITECTURE.md AND their zh-TW siblings** (`README.zh-TW.md`, `architecture.zh-TW.md`), which are cross-linked.
- **User working style**: concise + direct; wants to discuss the *why* before building; prefers configurable settings over hardcoded values; **manually curates content** (don't trust LLM output into the bank); pushes back and expects you to. Don't agree just to agree.
- Match surrounding code style; the shared UI kit (`platform/src/ui`) is composed by modules — don't fork tokens per-module.

## Working agreement — issues as specs

Substantive work flows through GitHub issues, not ad-hoc edits. The loop: **intake → triage → refine to Ready → execute → PR → review → merge (auto-deploy)**.

- **Roles — the main session is a DISPATCHER, not a worker** (and not the investigator/spec-writer). On a new request it does **not** read code, root-cause, spec, or implement. It hands the raw report to a background **intake agent** that runs the whole chain — investigate → root-cause → write the Definition-of-Ready spec → recommend the fix → create the Ready issue → dispatch a worker (→ PR) — then returns to the user fast and relays the ticket # + PR link. **Workers** implement one issue each. The human gate is **PR review** (never auto-merge); per-issue confirmation is not required — the agent chain is autonomous.
- **Trivial vs tracked.** Only substantive work becomes an issue; trivial ops (one-off tooling, lookups, git housekeeping) are done inline, not filed.
- **File via the `🤖 Task (agent-ready spec)` template** (`.github/ISSUE_TEMPLATE/task.md`). `gh issue create` does **not** auto-apply templates — reproduce the spec sections in the body yourself.
- **Definition of Ready** (label `status:ready`): Goal, testable acceptance criteria, affected files, applicable cardinal-rule constraints, a test/verification plan, and out-of-scope — all filled, so a cold future session can execute without re-discovery. Missing detail → `status:needs-info`; discuss here or in issue comments.
- **Labels (labels-only tracking):** type = `bug`/`enhancement`/`content`/`performance`; status = `status:{triage,needs-info,ready,in-progress,in-review,blocked}` (done = closed); optional `priority:p0–p2`.
- **Execute:** "work on #NN" → branch `claude/issue-NN-slug` → implement → run the gates → open a PR that `Closes #NN`, fill the PR template, set the issue `status:in-review`. Trace chain: issue → branch → PR → commit (`Co-Authored-By: Claude`) → preview → merge → prod.
- **Automation:** manual handoff for now. Tier-1 (`anthropics/claude-code-action`, `@claude`/label-triggered) is **not installed** — adding it needs the Claude GitHub App + `ANTHROPIC_API_KEY` secret.

## Current state (2026-06-30)

- Merged to `master` (prod live via the auto-deploy-on-merge pipeline): **tests + CI/CD** (#1), **demo mode** (#2), this **orientation guide** (#3), and the **theme + landing overhaul** (#4). #4 shipped the new default theme **Indigo**, the landing menu/dock, the char-tile **status frame** (`CharTile`'s `.char-tile::after` ring — the old corner pip is gone), and the `content.db` recovery noted below. The theme-resolution test landed with it.
- **Open PR (#6)**: a landing menu/bar refinement — bar always opaque, the wordmark appears on dock (no fly/shrink), distinct frosted scrim when the menu opens.
- **Merged (#9)**: issue + PR templates under `.github/` (bug/feature/content/perf chooser + PR template). The **issue-as-spec workflow** (the `🤖 Task` template + the *Working agreement* section above) follows here; type/status/priority labels already exist on the repo.
- `content.db` carries **~11,200 bank sentences** (`npm run analyze-bank` reports remaining gaps).
- ⚠️ **`content.db` was once committed CORRUPT** (no binary gitattribute → `integrity_check` failed at build). It was recovered with `sqlite3 platform/content.db ".recover"`, and **`.gitattributes` now marks `*.db binary`**. So: don't blind-`git checkout platform/content.db` (you can restore a bad blob over a good working copy), `.recover` it if it's ever reported "malformed", and never commit a `.db` while the dev server still holds it open (WAL).
