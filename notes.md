# Issue #79 — linter/format/pipeline scaffold (PR #85)

Status: submitted as PR for manual completion
- Open PR: https://github.com/johnsonhsu/learn-chinese/pull/85
- ESLint flat config: `eslint.config.js`
- Prettier config: `.prettierrc` / `.prettierignore`
- Root scripts: `npm run lint`, `npm run lint:fix`, `npm run format:check`
- Pre-commit scaffold: `.husky/pre-commit` + `lint-staged` in `package.json`
- CI: lint as non-blocking report, then build/deploy continue
- Branch: `claude/issue-79-linter-setup`

Why manual completion before merge
- `npm run lint` reveals real pre-existing rule violations across `platform/`, `modules/`, `shared/`, and `scripts/`.
- Auto-fix can’t resolve all of them; the rest need ownership decisions.
- This PR establishes the tooling/plumbing cleanly; the cleanup pass should be a follow-up commit after deciding scope.

Verification so far
- `node -e "require('./eslint.config.js')"` passes.
- `npm test`: 222 passed.
- `npm run typecheck`: passed.

Next actions
- Decide narrow-vs-wide baseline for this repo.
- Hand-fix or scope-warn the remaining lint reports.
- Then merge PR #85.