# CLAUDE.md — orientation for AI coding sessions

Read this first. It's the distilled "don't re-learn it" guide for this repo. Authoritative
deep docs: **[ARCHITECTURE.md](./ARCHITECTURE.md)** (esp. §4.5 testing/CI, §4.6 demo) and
**[README.md](./README.md)** — keep those current (see _Conventions_).

## What this is

A **local-first PWA for learning Traditional Chinese (Taiwan focus, zhuyin not pinyin)**.
Monorepo, React 19 + Vite, ships as static assets to **Cloudflare Pages**
(`learnchinese.hsu.mobi`). **No runtime server** — curriculum ships baked into the client
(sql.js + IndexedDB); a dev-only Express server exists for admin/curation. Per-profile
progress lives entirely on-device in IndexedDB.

## Repo map

| Path        | What                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/`   | `@shared/character-stats` — **the smarts**, PURE logic: `mastery`, `char-ranker`, `char-knowledge`, `sentence-generator`, `zhuyin`, `content-db` (the importer; only this one uses better-sqlite3/opencc). |
| `platform/` | The app. `App.tsx`, `offline/` (data layer, `user-store`, `demo`), `theme/`, `ui/` (shared kit), `scripts/bake-data.ts`, `server/` (**dev-only** Express :3000).                                           |
| `modules/`  | Lazy-loaded modules: `writing-challenge`, `word-sets`, `practice-english`, `copybook`, `my-characters`, `reading-chinese`, `reading-english`.                                                              |
| `scripts/`  | Python analysis + `bank-fix.py` (glyph scrub), `seed-dbs.ts`.                                                                                                                                              |
| `test/`     | Cross-language fixtures + the one pytest (`test_glyph_canon.py`).                                                                                                                                          |
| `seed/`     | Committed, scrubbed, content-only DBs so CI can build (see _Data_).                                                                                                                                        |

## Daily commands

```bash
npm run dev                  # Express + Vite dev server on :3000 (admin/curation + client)
npm run dev:bank-admin       # STANDALONE Sentence Bank admin, own port (BANK_ADMIN_PORT, default 3100), localhost-only — survives :3000 restarts (issue #49)
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
- **Docs-merge-on-green.** A **documentation-only** PR (`CLAUDE.md` / `README*` / `ARCHITECTURE*` / `.github/` templates — no `src`/`.db`/workflow changes) may be **merged automatically once CI is green** — no human-review gate. **Code and content (curriculum) PRs still require Johnson's review** before merge. This is a narrow, explicit exception to the _Working agreement_'s "PR review is the human gate".
- A local PostToolUse hook in `.claude/settings.local.json` used to deploy `dist` to **prod** on any `npm run build` — it has been **removed** (CI owns deploys now). That file is machine-local + gitignored, so a fresh clone never has it. To verify a build without deploying, `npm -w platform run bake:data` and/or `npx vite build` (in `platform/`).
- **Issue + PR templates** live in `.github/` (PR #9): a Markdown issue chooser (bug / feature / content / performance + `config.yml`) and a PR template whose checklist mirrors the gates + cardinal rules. ⚠️ `gh pr create --body` **overrides** the PR template — so when opening a PR from the CLI, fill those sections in yourself (type, the test/living-docs/content checklists, cardinal-rule ticks).

## Testing (3 tiers)

1. **Engine units** (`shared/src/__tests__`): `sentence-generator` (the **binding** invariant + seeded-RNG coverage), `mastery`, `char-knowledge`, `char-ranker`, `zhuyin`. Fake `DbQueryProvider`; `vi.setSystemTime` for time; seeded `Math.random`.
2. **Glyph-canonicalization parity**: `canonicalizeTW()` (TS, `content-db.ts`) vs `bank-fix.py canon()` (Python) against ONE golden fixture `test/fixtures/glyph-canon.json` — they MUST agree.
3. **Data-integrity gate** (`platform/test/data-integrity.test.ts`, run on baked output): no Simplified/undrawable glyphs, referential, **no personal data**, offline stroke coverage (with a documented `STROKE_ALLOWLIST`).

**Test discipline — keep the suite a well-oiled machine.** On ANY change, evaluate whether
tests need to be added or updated, and say so: an issue spec / PR should state its **test
impact** (new test, updated test, or "none — and why"). The data-integrity gate already blocks
deploys on bad content, but **unit + parity coverage is the contributor's responsibility** —
the gate won't catch an engine regression. New engine logic or a fixed bug → add the guarding
test in the same PR.

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

- **Theme** (`platform/src/theme/`): registry in `themes.ts`. `DEFAULT_THEME_ID` = the default _selection_ (currently `indigo`); `ROOT_THEME_ID` = the bare `:root` "Paper" look (`default`) which REMOVES `body[data-theme]`. Apply via `applyThemeToBody`. Resolution: `profileOverride ?? device ?? default`; premium themes gated by a device unlock.
- **Demo "try it"** (`platform/src/offline/demo.ts`): visit **`/?app&demo`**. `?app` skips the marketing landing; `?demo` opens an ISOLATED IndexedDB (`learning-chinese-user-demo`) and seeds preset profiles at runtime. A `__demoVersion` stamp gates reseeding — **bump `DEMO_VERSION` to refresh the demo for everyone**. Storage is isolated so eviction never touches a real user.
- **Demo device gate** (`platform/src/offline/demo-mode.ts`, #66): the demo is **mobile/touch-only**. `isDemoDeviceGated()` = `isDemoMode() && !isDemoDeviceAllowedNow()`; the device check (`isDemoDeviceAllowed(DeviceEnv)`) is **capability detection, NOT UA sniffing** (`pointer: coarse` / `hover: none` / touch). It's a **separate predicate from `evaluateDemoMode`** on purpose — a gated desktop demo visitor is still a demo session (isolated `-demo` jar, so never the real jar); `App.tsx` just renders the lazy **`DemoGate`** ("open on your phone" + QR from the dependency-free `utils/qr.ts`) instead of booting `<AppInner>`. Real/installed app, dev/LAN, `?landing` are **never** gated. Client-side only (static Pages). The landing (`LandingPage.tsx`) links the demo (`?app&demo`, en + zh-TW).
- **Demo device-gate override** (`?nodevicegate`, #76): a client-side testing escape hatch. When present, the device gate treats the session as allowed, so the demo/app boots on desktop — including PR previews. This does NOT weaken the gate for normal visitors; without the param, desktop still sees `DemoGate`. The CI preview comment exposes `${prBase}/?app&demo&nodevicegate` so reviewers can click straight into the desktop-bypassed demo.

## Environment gotchas

- A **stale invalid `GITHUB_TOKEN` env var** shadows the `gh`/`git` keyring login. Prefix git/gh commands with `GITHUB_TOKEN= GH_TOKEN=` so they use the keyring.
- **Network commands** (`wrangler`, `gh`, internet `curl`) need the sandbox disabled (`dangerouslyDisableSandbox: true`).
- macOS: no `timeout` binary; `cd` inside a compound command may prompt for permission.

## Conventions

- **LIVING DOCS**: when you change architecture / deploy / the UI kit / the smarts, update **README.md + ARCHITECTURE.md AND their zh-TW siblings** (`README.zh-TW.md`, `architecture.zh-TW.md`), which are cross-linked.
- **User working style**: concise + direct; wants to discuss the _why_ before building; prefers configurable settings over hardcoded values; **manually curates content** (don't trust LLM output into the bank); pushes back and expects you to. Don't agree just to agree.
- Match surrounding code style; the shared UI kit (`platform/src/ui`) is composed by modules — don't fork tokens per-module.

## Working agreement — issues as specs

Substantive work flows through GitHub issues, not ad-hoc edits. The loop: **intake → triage → refine to Ready → execute → PR → review → merge (auto-deploy)**.

- **Roles — the main session is a DISPATCHER, not a worker** (and not the investigator/spec-writer). On a new request it does **not** read code, root-cause, spec, or implement. It hands the raw report to a background **intake agent** that runs the whole chain — investigate → root-cause → write the Definition-of-Ready spec → recommend the fix → create the Ready issue → dispatch a worker (→ PR) — then returns to the user fast and relays the ticket # + PR link. **Workers** implement one issue each. The human gate is **PR review** (never auto-merge) — **except documentation-only PRs, which merge on green** (see _Deploy → Docs-merge-on-green_); per-issue confirmation is not required — the agent chain is autonomous.
- **Trivial vs tracked.** Only substantive work becomes an issue; trivial ops (one-off tooling, lookups, git housekeeping) are done inline, not filed.
- **File via the `🤖 Task (agent-ready spec)` template** (`.github/ISSUE_TEMPLATE/task.md`). `gh issue create` does **not** auto-apply templates — reproduce the spec sections in the body yourself.
- **Definition of Ready** (label `status:ready`): The bar isn't "every section filled" — it's "fleshed out so a **cold, separate agent can execute near-mechanically**." The author is almost never the implementer, so the more concrete the spec, the less the next agent must re-discover. That means: concrete Goal, testable acceptance criteria, **affected files as file:line pointers plus the recommended approach/fix** (not just "which files"), applicable cardinal-rule constraints, a test/verification plan, and out-of-scope — **all filled**. Any open ambiguity must be decided in the spec, or explicitly parked at `status:needs-info`; **never leave it implicit** for the executor to guess. Missing detail → `status:needs-info`; discuss here or in issue comments.
- **Labels (labels-only tracking):** type = `bug`/`enhancement`/`content`/`performance`; status = `status:{triage,needs-info,ready,in-progress,in-review,blocked}` (done = closed); optional `priority:p0–p2`; **action signals** = `dispatch` (on an issue) / `merge` (on a PR) — see _Action-signal labels_ below.
- **Execute:** "work on #NN" → branch `claude/issue-NN-slug` → implement → run the gates → open a PR that `Closes #NN`, fill the PR template, set the issue `status:in-review`. Trace chain: issue → branch → PR → commit (`Co-Authored-By: Claude`) → preview → merge → prod.
- **Branch chatter log:** on starting work for a branch, create a temporary `chatter.md` in the repo **parent folder** and keep it updated as a running handoff log: what was just done, what's incomplete, what failed and why, what to do next, key decisions, and any command/output needed to resume quickly.
- **Verification is mandatory on every PR** (the PR template's _Verification_ section — yes, including docs-only PRs, which merge on green with no human review). Record both **how I verified** (the checks actually run for THIS change — `test:unit` always; `test:data`/`seed:dbs` for content; glyph-parity pytest for glyphs; `npx vite build`, never `npm run build`; a named visual check on the preview's `?ui`/`?app&demo` for UI/theme work) and **how to verify (reviewer)** (a concrete preview reproduction — route + themes/elements + expected result, the "Review: …" one-liner our PRs already use). State the **test impact** (added / updated / none-and-why), per _Test discipline_.
- **PR-title convention:** `[PR-###][<type>][<issue#>] <title>` — e.g. `[PR-016][bug][14] Stroke-result fail + above-level read red`. `[PR-###]` is the PR number zero-padded to 3 digits; `[<type>]` is the issue type label (`bug`/`enhancement`/`content`/`performance`); `[<issue#>]` is the linked issue (omit the bracket if none); `<title>` is concise. Makes the PR list scannable and ties PR↔type↔issue at a glance. The PR number only exists after creation, so **backfill `[PR-###]` right after `gh pr create`** with `gh pr edit <n> --title …`.
- **Workflow convention:** before starting work on an issue, **pull the latest `master`**, then create your feature branch from that fresh `master` checkout—not from older local history.
- **PR description convention:** **always link the related issue** in the PR description, e.g. `Closes #NN` or `Related to #NN`, so the work is traceable back to its requirement.
- **Automation:** manual handoff for now. Tier-1 (`anthropics/claude-code-action`, `@claude`/label-triggered) is **not installed** — adding it needs the Claude GitHub App + `ANTHROPIC_API_KEY` secret.

### Action-signal labels + the reconcile cue

Johnson drives the dispatcher through **GitHub-native signals**, not just chat. Two labels are the go/ship buttons; **`reconcile`** is the cue to act on them.

- **`dispatch` (blue, on an issue)** = Johnson's go-signal "take this on next." On the **reconcile** cue, the dispatcher pulls `dispatch`-labeled issues, assigns them to free agent slots (**≤2, one per clone**) in **priority order** (`p0 > p1 > p2`, then lowest issue #), and **removes the label** as it dispatches (issue → `status:in-progress`). If a `dispatch`-tagged issue isn't yet specced, run intake to spec it first (or `status:needs-info` + ask). **`status:ready` alone does NOT auto-dispatch** — parked issues (de-queued spikes, tracking hubs) stay put; `dispatch` is the explicit go.
- **`merge` (green, on a PR)** = Johnson's "ship it." On reconcile, the dispatcher merges it when CI is green (rebasing if it's fallen behind master), then the linked issue closes. PR review remains the human gate — the label is how Johnson (who can't self-"Approve" agent-authored PRs) signals approval.
- **Post-merge/close artifact sweep.** Merging or closing a PR isn't done until its downstream artifacts are reconciled — `Closes #N` only auto-closes the ONE linked issue. On every merge/close, also check + update: **subsumed/superseded issues** the PR resolved but didn't `Closes` (folded-in scope — close with a pointer to the PR); **tracking/hub/epic issues** whose last child just landed (close); **dependent open PRs** that share files (rebase — they can flip to conflicting once the first lands); **consumed action-signal labels** (remove the `merge`/`dispatch` label, flip stale `status:*`); and **ops/provisioning follow-through** a merged feature needs (e.g. Cloudflare D1/R2 bindings, secrets, a redeploy — flag it; the feature won't work until it's done). On a **close without merge**, the linked issue does NOT auto-close — decide its fate (back to `status:ready`/`needs-info`, or close if superseded).
- **The `reconcile` cue.** Johnson reviews/acts in GitHub (tags `dispatch`/`merge`, comments change-requests, files/decides issues) and then says "reconcile" — the dispatcher pulls **LIVE GitHub state** and acts on what's **RECORDED** there (labels/comments/issues), **never on unstated intent**.
- **Full loop:** raw idea → _(intake specs to `status:ready`)_ → Johnson tags `dispatch` → worker → PR → Johnson reviews + tags `merge` → dispatcher merges → prod. Johnson can still say "dispatch N" / "merge N" in chat; the labels are the GitHub-native equivalent.

## Current state (2026-07-01)

- **Prod is live** via the auto-deploy-on-merge pipeline. **`master` is now branch-protected**: no direct pushes (a PR is required, `enforce_admins` on — so it applies to Johnson too), and the CI job **`verify-and-deploy` must be green to merge**. Everything routes through a PR; force-push/branch-delete are blocked.
- **Modules (7).** Beyond `writing-challenge` / `word-sets` / `practice-english` / `copybook` / `my-characters`, two reading modules shipped: **`reading-chinese`** (its own reading stat track, #68) and **`reading-english`** (tap-to-reconstruct word tiles, #73).
- **Themes.** Default is **Indigo**; added **80s Motiv** (#81) and **90s/Retro OS** (#91), plus dark-theme legibility fixes. The landing menu/dock and the CharTile **status-frame** ring (`.char-tile::after`, the old corner pip is gone) are in.
- **Demo mode** matured: demo-by-default on public `?app` (#31), full localStorage isolation (#52), a **mobile/touch device-gate** with the `?nodevicegate` desktop-preview override (#70, #82), and realistic/varied seed data (#95). Details in _Theme + demo_ above.
- **Feedback.** A siloed feedback feature + a standalone secret-gated **`/feedback-admin`** triage surface decoupled from the app (#67); the preview-feedback provisioning runbook is in ARCHITECTURE §6.5 (#102). ⚠️ **Ops follow-through**: the feedback backend needs its Cloudflare bindings/secrets provisioned per §6.5 before it works in prod.
- **Security & tooling.** Baseline security headers + CSP via Pages `_headers` (#58), a **blocking dependency-audit gate** (prod-runtime, high+, #61), a hardened dev Express server (127.0.0.1 bind + SQL `dbPath` allowlist, #62), a standalone dev-only Sentence Bank admin on its own port (#53), a **`tsc` type-check gate** (#42), and a **linter** wired into CI (#85). The _Working agreement_ above (dispatch/merge action-signal labels, the reconcile cue, the artifact sweep, the `investigate` issue type) is now fully implemented.
- **Landscape support** (#130 epic): portrait-first but now **adapts to landscape** — all rules gated behind `@media (orientation: landscape)` so portrait is pixel-identical (`platform/src/index.css` "Landscape support" block + `modules/writing-challenge/src/App.css`). **Orientation policy:** Lock-to-portrait OFF (default) → app follows the device; ON → the rotate overlay blocks landscape (its dismiss now routes through `window.__setPortraitLock`, fixing #112). The overlay is kept (not deleted) as the honest fallback for users who chose portrait. Full write-up: ARCHITECTURE §5.5 → _Orientation & landscape_.
- **In flight:** p1 bug **#97** (`npm run build` only works when uncommitted `input-list/writing-challenge/` files are present) is open; the lint pipeline **#86** is in-progress (per-area subtasks #103–#108); theme spike **#45** is `dispatch`-labeled and queued.
- `content.db` carries **~11,200 bank sentences** (`npm run analyze-bank` reports remaining gaps).
- ⚠️ **`content.db` was once committed CORRUPT** (no binary gitattribute → `integrity_check` failed at build). It was recovered with `sqlite3 platform/content.db ".recover"`, and **`.gitattributes` now marks `*.db binary`**. So: don't blind-`git checkout platform/content.db` (you can restore a bad blob over a good working copy), `.recover` it if it's ever reported "malformed", and never commit a `.db` while the dev server still holds it open (WAL).
