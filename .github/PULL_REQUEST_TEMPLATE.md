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

## Preview
<!-- CI posts a preview URL on this PR. Note anything specific to test there. -->

## Screenshots
<!-- Before/after for UI changes. -->
