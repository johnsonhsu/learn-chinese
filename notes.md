# Project Lint Notes — issue #79

Status: scaffold complete, manual completion paused
- ESLint flat config: `eslint.config.js` (config imports successfully)
- Prettier config: `.prettierrc` / `.prettierignore`
- Root scripts: `npm run lint`, `npm run lint:fix`, `npm run format:check`
- Pre-commit scaffold: `.husky/pre-commit` + `lint-staged` in `package.json`
- Branch: `claude/issue-79-linter-setup` from current `master`

Why not merged yet
- `npm run lint` is failing repo-wide; this instance is not completing issue #79.
- It leaves unintended errors in existing source files across `platform/`, `modules/`, `shared/`, and `scripts/`.
- Next step needs manual review to either:
  - run `npm run lint:fix` where safe, then hand-fix remaining errors, or
  - keep v1 narrow and switch lint config to `warn`/`off` for now.

Verification
- `node -e "require('./eslint.config.js')"` passes, so the config itself is loadable.
- Repo-wide `npm run lint` still fails with 131 errors; merge is blocked.

Note: package-lock.json was reset to avoid unrelated churn.