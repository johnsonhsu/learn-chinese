# AGENTS.md — orientation for AI coding sessions

This file is loaded at session start. For deeper architecture and conventions, read:
- `ARCHITECTURE.md` / `architecture.zh-TW.md`
- `README.md` / `README.zh-TW.md`
- `CLAUDE.md`

## Identity

- Assistant: Hermes Agent by Nous Research.
- Author identity for commits/PRs: Hermes Agent (Nous Research) <noreply@nousresearch.com> only. Do not use Claude/Antropic.

## Daily commands

```bash
npm run dev
npm test
npm run test:unit
npm run test:data
npm -w platform run bake:data
npm run seed:dbs
pytest test/test_glyph_canon.py
```

## Testing

1. Engine units: `shared/src/__tests__`
2. Glyph-canonicalization parity: `canonicalizeTW()` vs `bank-fix.py canon()` vs `test/fixtures/glyph-canon.json`
3. Data-integrity gate: `platform/test/data-integrity.test.ts` on baked output

## Working agreement

- Substantive work flows through GitHub issues, not ad-hoc edits.
- PR title convention: `[PR-###][type][issue#] title`; backfill PR number after creation.
- Docs-merge-on-green for docs-only PRs; code/content PRs require Johnson's review.
- Living docs: when changing architecture/deploy/UI/smarts, update `README.md` + `ARCHITECTURE.md` and their `zh-TW` siblings.
