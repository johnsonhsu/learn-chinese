import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Module-set sync guard (issue #20 Band B / regression guard for #36).
//
// The set of learning modules is asserted in THREE independent places that must
// agree, or one drifts silently (exactly what #36 hit — `my-characters` shipped
// but fell out of the docs):
//   1. on disk — one folder per module under `modules/`, each with a module.json
//      whose `name` is the canonical id;
//   2. the runtime allow-list `OFFLINE_READY_MODULES` in platform/src/App.tsx
//      (only listed names are surfaced on the home grid);
//   3. the docs, which claim a specific count ("the five existing modules").
//
// App.tsx uses `import.meta.glob` + JSX, so it can't be imported into this Node
// test; the registry Set is a flat string literal, so we parse it textually —
// which is precisely the line we want to pin.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..'); // platform/src/__tests__ -> repo root
const MODULES_DIR = join(REPO_ROOT, 'modules');
const APP_TSX = join(REPO_ROOT, 'platform', 'src', 'App.tsx');

/** Module ids from each `modules/<dir>/module.json` `name` field (ground truth). */
function moduleNamesOnDisk(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(MODULES_DIR)) {
    const dir = join(MODULES_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;
    let manifestRaw: string;
    try {
      manifestRaw = readFileSync(join(dir, 'module.json'), 'utf8');
    } catch {
      continue; // a non-module folder (e.g. shared README) — skip
    }
    const name = (JSON.parse(manifestRaw) as { name?: string }).name;
    if (name) names.push(name);
  }
  return names.sort();
}

/** The names inside the FIRST `OFFLINE_READY_MODULES` Set literal in `src`. */
function parseRegistry(src: string): string[] {
  const m = src.match(/OFFLINE_READY_MODULES\s*=\s*new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error('OFFLINE_READY_MODULES Set literal not found');
  return [...m[1].matchAll(/'([^']+)'/g)].map((g) => g[1]).sort();
}

/** The runtime allow-list parsed straight out of App.tsx (the source of truth). */
function registryNames(): string[] {
  return parseRegistry(readFileSync(APP_TSX, 'utf8'));
}

describe('module set stays in sync (disk ↔ registry ↔ docs)', () => {
  const disk = moduleNamesOnDisk();

  it('every module folder on disk is allow-listed in OFFLINE_READY_MODULES', () => {
    expect(registryNames()).toEqual(disk);
  });

  it('there are no registry entries without a matching module folder', () => {
    // (Same assertion from the other direction — makes a one-sided drift obvious.)
    const registry = registryNames();
    const orphans = registry.filter((n) => !disk.includes(n));
    expect(orphans).toEqual([]);
  });

  it('the prose docs state the same module count as ships (currently five)', () => {
    const COUNT_WORD: Record<number, string> = {
      4: 'four', 5: 'five', 6: 'six', 7: 'seven',
    };
    const word = COUNT_WORD[disk.length];
    expect(word, `no count-word mapping for ${disk.length} modules`).toBeDefined();

    // README and the modules README state the count in prose ("the five modules" /
    // "the five existing modules"). ARCHITECTURE.md enumerates them in its layout
    // tree + a code snippet instead — that snippet is checked separately below.
    for (const rel of ['README.md', 'modules/README.md']) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8').toLowerCase();
      expect(
        text.includes(`${word} module`) || text.includes(`${word} existing module`),
        `${rel} should describe ${word} modules`,
      ).toBe(true);
    }
  });

  it('the OFFLINE_READY_MODULES code snippet in the docs matches the real registry', () => {
    // ARCHITECTURE.md and modules/README.md each embed a verbatim copy of the
    // registry line; this is exactly the kind of copy that silently rots (#36).
    const registry = registryNames();
    for (const rel of ['ARCHITECTURE.md', 'modules/README.md']) {
      const docNames = parseRegistry(readFileSync(join(REPO_ROOT, rel), 'utf8'));
      expect(docNames, `${rel} OFFLINE_READY_MODULES snippet is stale`).toEqual(registry);
    }
  });
});
