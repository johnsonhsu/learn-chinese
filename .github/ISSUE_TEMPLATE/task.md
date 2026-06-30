---
name: 🤖 Task (agent-ready spec)
about: A work item specified well enough for a future Claude session to execute cold and open a PR
title: "[Task] "
labels: "status:triage"
---

<!--
This is the SPEC a future Claude session reads to do the work — and the basis for its PR.
It is "Ready" (label status:ready) only when every section below is filled; until then it
stays status:triage / status:needs-info. Also add a type label (bug / enhancement / content
/ performance) and a priority (priority:p0–p2). gh issue create does NOT auto-apply this
template — reproduce these sections in the body when filing from the CLI.
-->

## Goal (the why)
<!-- The problem or desired outcome — NOT the solution. -->

## Acceptance criteria
<!-- Testable checklist. The PR is done when all of these are true. -->
- [ ]
- [ ]

## Affected area / files
<!-- Concrete pointers: module, file, function. e.g. platform/src/theme/themes.ts -->

## Constraints / cardinal rules in play
<!-- Tick any that apply — these are the traps a cold session must respect. -->
- [ ] 台 (U+53F0) / 臺 (U+81FA) stay unconverted in both directions
- [ ] `canonicalizeTW` (TS) ↔ `bank-fix.py canon()` must stay in sync
- [ ] Sentence selection stays **binding** (the target char appears in the result)
- [ ] Reuse one HanziWriter — no per-character `WritingCanvas` remount
- [ ] Do **not** run `npm run build` locally (auto-deploy hook); verify with `vite build` / `bake:data`
- [ ] Content change → `npm run seed:dbs`, commit `content.db` + `seed/*`
- [ ] Architecture/deploy/UI-kit/engine change → update living docs (README + ARCHITECTURE + `zh-TW`)
- [ ] Other:

## Test / verification plan
<!-- Which gate proves it: npm run test:unit, test:data, pytest glyph-parity, manual check on the PR preview URL… -->

## Out of scope
<!-- Explicit non-goals so the PR doesn't sprawl. -->

## Notes / context
<!-- Links, prior discussion, screenshots, related issues. -->
