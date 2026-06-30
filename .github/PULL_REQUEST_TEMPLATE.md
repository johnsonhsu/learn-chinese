<!--
Deploy is automatic: this PR builds a Cloudflare Pages PREVIEW (URL gets posted below by CI);
merging to master ships PRODUCTION through the same build + gates. No manual deploy step.
-->

## What & why
<!-- Summary of the change and the motivation. Link issues, e.g. "Closes #12". -->

## Type
- [ ] Bug fix
- [ ] Feature
- [ ] Content / curriculum
- [ ] Refactor / chore
- [ ] Docs

## Checklist
- [ ] `npm test` passes locally
- [ ] Did **not** run `npm run build` locally (auto-deploy hook footgun) — verified with `vite build` / `bake:data` instead
- [ ] **Living docs** updated if architecture / deploy / UI kit / engine changed (README + ARCHITECTURE **and** their `zh-TW` siblings)

### If this changes content (sentences / words / glyphs)
- [ ] Edited via the dev admin, then ran `npm run seed:dbs`
- [ ] Committed `content.db` + `seed/*`
- [ ] Data-integrity gate (`npm run test:data`) passes on the baked output
- [ ] No personal data in any snapshot (profiles / stats scrubbed)

### Cardinal rules (tick any that apply)
- [ ] 台 (U+53F0) / 臺 (U+81FA) left unconverted in both directions
- [ ] `canonicalizeTW` (TS) and `bank-fix.py canon()` kept in sync (golden-fixture test passes)
- [ ] Sentence selection stays **binding** — the target char appears in the result
- [ ] No new per-character `WritingCanvas` remount (reused one HanziWriter via `setCharacter()` / `quizSession`)

## Verification
<!-- Required on every PR (incl. docs-only — they merge on green with no human review). -->

**How I verified** — the checks actually run for THIS change:
- [ ] `npm run test:unit` (always)
- [ ] `npm run test:data` (+ `npm run seed:dbs`) — if content / a DB changed
- [ ] `pytest test/test_glyph_canon.py` — if glyphs / `canonicalizeTW` / `bank-fix.py canon()` changed
- [ ] `npx vite build` to confirm the build — **never** `npm run build` (auto-deploy footgun)
- [ ] Visual check on the **preview URL** (CI posts it below) for UI / theme changes — name the route + what you looked at, e.g. `?ui` (Styleguide) and/or `?app&demo`, which themes / elements
<!-- Note the result of each (e.g. "test:unit → 89/89 green; vite build clean"). -->

**How to verify (reviewer)** — a concrete reproduction on this PR's preview (the "Review: …" one-liner pattern):
<!-- Route + themes/elements + expected result, e.g.
     Review: open <preview>/?app&demo → Settings → Theme dropdown; under Indigo the
     hovered row is a faint accent wash, not a solid gold bar. -->

**Test impact** — added / updated / none-needed (and why):
<!-- e.g. "+7 cases in demo-mode.test.ts" · "CSS-only, no engine change — none needed". -->

**Screenshots** (UI changes): before / after.
<!-- Paste below. -->
