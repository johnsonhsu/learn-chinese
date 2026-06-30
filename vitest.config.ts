import { defineConfig } from 'vitest/config';

// Single root config for the whole monorepo. Tests are plain Node (no DOM):
// pure logic in shared/src and a data-integrity gate that opens SQLite via
// better-sqlite3. The shared sources import each other with explicit `.js`
// extensions (NodeNext style); Vite's resolver maps those onto the `.ts`
// source, so no path rewriting is needed here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.backup-*/**'],
  },
});
