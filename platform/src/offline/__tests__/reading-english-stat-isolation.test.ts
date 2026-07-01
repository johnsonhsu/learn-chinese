import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Reading-english ↔ practice-english stat isolation (issue #69 acceptance
 * criterion): completing a reading-english session must NEVER mutate any
 * practice-english spelling word-stat row, and vice-versa.
 *
 * reading-english is self-contained (its own IndexedDB layer, like
 * practice-english), so — unlike reading-chinese's SQLite two-table case (#68) —
 * the isolation is at the STORAGE-DATABASE boundary: the two modules' per-word
 * stores live in DIFFERENT IndexedDB databases. A `put` against one database's
 * object store physically cannot key into the other's. This test pins that
 * structural invariant (the DB names are disjoint) plus the shared mastery rule
 * (both compute mastered = ≥3 of the last 4 attempts correct, so the two English
 * competencies are measured identically but never cross-contaminate).
 *
 * We read the DB-name declarations textually (the module-registry test uses the
 * same textual approach for App.tsx) so this stays a fast Node test — no jsdom /
 * IndexedDB shim, no importing the browser-only user-store modules.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // platform/src/offline/__tests__ -> repo root

function dbNameIn(relPath: string): string {
  const src = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const m = src.match(/const\s+USER_DB_NAME\s*=\s*'([^']+)'/);
  if (!m) throw new Error(`USER_DB_NAME not found in ${relPath}`);
  return m[1];
}

describe('reading-english word store is disjoint from practice-english', () => {
  const readingDb = dbNameIn('modules/reading-english/src/offline/user-store.ts');
  const spellingDb = dbNameIn('modules/practice-english/src/offline/user-store.ts');

  it('the two modules declare DIFFERENT IndexedDB database names', () => {
    expect(readingDb).toBe('learning-english-reading-user');
    expect(spellingDb).toBe('learning-english-user');
    expect(readingDb).not.toBe(spellingDb);
  });

  it('reading-english re-exports its DB name as READING_USER_DB_NAME (matching the const)', () => {
    const src = readFileSync(join(REPO_ROOT, 'modules/reading-english/src/offline/user-store.ts'), 'utf8');
    expect(src).toMatch(/export const READING_USER_DB_NAME = USER_DB_NAME/);
    expect(readingDb).toBe('learning-english-reading-user');
  });

  it('the content-cache jars are also disjoint (eviction hygiene, no shared jar)', () => {
    const readingStore = readFileSync(join(REPO_ROOT, 'modules/reading-english/src/offline/db-store.ts'), 'utf8')
      .match(/const\s+DB_STORE_NAME\s*=\s*'([^']+)'/)?.[1];
    const spellingStore = readFileSync(join(REPO_ROOT, 'modules/practice-english/src/offline/db-store.ts'), 'utf8')
      .match(/const\s+DB_STORE_NAME\s*=\s*'([^']+)'/)?.[1];
    expect(readingStore).toBe('learning-english-reading-dbs');
    expect(spellingStore).toBe('learning-english-dbs');
    expect(readingStore).not.toBe(spellingStore);
  });
});

// --- The shared mastery rule, exercised on the pure computation both layers run ---

/** The mastery predicate both English layers use, copied verbatim from the data
 *  layer's getMasteredWords body — mastered ⇔ ≥3 of the last 4 attempts correct. */
function isMastered(recentResults: string): boolean {
  const codes = recentResults.split(',').filter(Boolean);
  if (codes.length < 3) return false;
  const last4 = codes.slice(-4);
  return last4.filter((c) => c === 'C').length >= 3;
}

describe('reading-english mastery rule matches practice-english (≥3 of last 4)', () => {
  it('needs at least 3 recorded attempts', () => {
    expect(isMastered('C,C')).toBe(false);
    expect(isMastered('C,C,C')).toBe(true);
  });
  it('counts only the last 4 attempts', () => {
    expect(isMastered('I,I,I,I,C,C,C,C')).toBe(true); // last 4 all correct
    expect(isMastered('C,C,C,C,I,I,I,I')).toBe(false); // last 4 all wrong
  });
  it('3-of-4 correct is mastered; 2-of-4 is not', () => {
    expect(isMastered('C,I,C,C')).toBe(true);
    expect(isMastered('C,I,C,I')).toBe(false);
  });
});
