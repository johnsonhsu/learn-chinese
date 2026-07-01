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
- **Spec bar / Definition of Ready:** the canonical wording lives in `CLAUDE.md` under _Working agreement — issues as specs_; use that as the source of truth, do not duplicate it locally.
- PR title convention: `[PR-###][type][issue#] title`; backfill PR number after creation.
- Docs-merge-on-green for docs-only PRs; code/content PRs require Johnson's review.
- Living docs: when changing architecture/deploy/UI/smarts, update `README.md` + `ARCHITECTURE.md` and their `zh-TW` siblings.

## PR content / description

Use the standard body from `.github/PULL_REQUEST_TEMPLATE.md` for every PR:

- **What & why** — short summary + motivation; link issues, e.g. `Closes #12`.
- **Type** — Bug fix / Feature / Content / curriculum / Refactor / chore / Docs.
- **Checklist**
  - `npm test` passes locally
  - Did **not** run `npm run build` locally (auto-deploy hook footgun) — verified with `vite build` / `bake:data` instead
  - Living docs updated if architecture/deploy/UI kit/engine changed
- **Verification**
  - How I verified — the checks actually run for THIS change (`test:unit`, `test:data`/`seed:dbs`, `pytest test/test_glyph_canon.py`, `vite build`, preview visual check)
  - How to verify (reviewer) — concrete “Review:” one-liner pattern for preview URL + route + expected result
  - Test impact — added / updated / none-needed
  - Screenshots for UI changes: before / after

## Branch chatter log

- On starting work for a branch, create a temporary `chatter.md` in the repo **parent folder**.
- Use it as a running log for the next session on this branch: what was just done, what's incomplete, what failed and why, what to do next, key decisions, and any command output needed to resume quickly.
- Keep entries concise; include `file:line` pointers when useful.
