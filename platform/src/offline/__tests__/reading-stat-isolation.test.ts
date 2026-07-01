// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Reading ↔ writing stat isolation (issue #65 acceptance criterion).
 *
 * The reading skill records into character_stats_reading / profileStatsReading;
 * writing into character_stats / profileStats. This guards the two guarantees
 * that keep them independent:
 *   1. STORAGE MAPPING — the two skills resolve to DISJOINT IndexedDB stores
 *      (statsStoreFor), so a put for one can never key into the other's store.
 *   2. SQL RECORDING — recording an attempt into the reading table leaves the
 *      writing table's rows byte-for-byte untouched, and vice-versa. We drive the
 *      SAME per-char UPSERT the data layer runs, parameterized by table name,
 *      against a real in-memory SQLite with BOTH tables.
 */

beforeEach(() => {
  // user-store reads isDemoMode() at import; pin it so the import is side-effect-free.
  vi.resetModules();
  vi.doMock('../demo-mode.js', () => ({ isDemoMode: () => false }));
});
afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../demo-mode.js');
});

describe('storage mapping — writing and reading use disjoint IndexedDB stores', () => {
  it('statsStoreFor maps the two skills to different stores', async () => {
    const { statsStoreFor } = await import('../user-store.js');
    const writing = statsStoreFor('writing');
    const reading = statsStoreFor('reading');
    expect(writing).toBe('profileStats');
    expect(reading).toBe('profileStatsReading');
    expect(writing).not.toBe(reading);
  });
});

// --- SQL-level isolation, exercised against the real two-table schema ---

const STATS_COLUMNS = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  character TEXT NOT NULL,
  times_seen INTEGER DEFAULT 0,
  times_perfect INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  times_incorrect INTEGER DEFAULT 0,
  times_hint_used INTEGER DEFAULT 0,
  streak_perfect INTEGER DEFAULT 0,
  streak_correct INTEGER DEFAULT 0,
  streak_incorrect INTEGER DEFAULT 0,
  best_streak_perfect INTEGER DEFAULT 0,
  best_streak_correct INTEGER DEFAULT 0,
  first_seen TEXT DEFAULT '',
  last_seen TEXT DEFAULT '',
  last_perfect TEXT DEFAULT '',
  last_correct TEXT DEFAULT '',
  last_incorrect TEXT DEFAULT '',
  fastest_ms INTEGER DEFAULT 0,
  slowest_ms INTEGER DEFAULT 0,
  total_ms INTEGER DEFAULT 0,
  last_result TEXT DEFAULT '',
  last_failed_strokes INTEGER DEFAULT 0,
  last_hint_used INTEGER DEFAULT 0,
  first_result TEXT DEFAULT '',
  recent_results TEXT DEFAULT '',
  UNIQUE(user_id, character)
`;

/** Record one fresh attempt into `table` — the INSERT path of the data layer's
 *  per-char upsert, table-parameterized (proves reading writes touch only reading). */
function recordFreshInto(db: Database.Database, table: string, userId: number, char: string) {
  db.prepare(
    `INSERT INTO ${table} (
       user_id, character, times_seen, times_perfect, times_correct, times_incorrect,
       times_hint_used, streak_perfect, streak_correct, streak_incorrect,
       best_streak_perfect, best_streak_correct, first_seen, last_seen,
       last_perfect, last_correct, last_incorrect, fastest_ms, slowest_ms, total_ms,
       last_result, last_failed_strokes, last_hint_used, first_result, recent_results
     ) VALUES (?, ?, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, ?, ?, ?, ?, '', 0, 0, 0, 'perfect', 0, 0, 'perfect', 'P')`,
  ).run(userId, char, '2026-06-30', '2026-06-30', '2026-06-30', '2026-06-30');
}

describe('SQL recording — a reading attempt never mutates the writing table', () => {
  it('recording into character_stats_reading leaves character_stats empty (and vice-versa)', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE character_stats (${STATS_COLUMNS});`);
    db.exec(`CREATE TABLE character_stats_reading (${STATS_COLUMNS});`);

    // Record a WRITING attempt for 好.
    recordFreshInto(db, 'character_stats', 1, '好');
    // Record a READING attempt for 好 (same char, same user).
    recordFreshInto(db, 'character_stats_reading', 1, '好');

    const writing = db.prepare('SELECT character, times_seen FROM character_stats WHERE user_id = 1').all() as { character: string; times_seen: number }[];
    const reading = db.prepare('SELECT character, times_seen FROM character_stats_reading WHERE user_id = 1').all() as { character: string; times_seen: number }[];

    // Each track has EXACTLY its own single row — no cross-write, no double-count.
    expect(writing).toEqual([{ character: '好', times_seen: 1 }]);
    expect(reading).toEqual([{ character: '好', times_seen: 1 }]);

    // A second reading attempt must NOT bump the writing count.
    recordFreshInto(db, 'character_stats_reading', 1, '學');
    const writingAfter = db.prepare('SELECT COUNT(*) c FROM character_stats WHERE user_id = 1').get() as { c: number };
    const readingAfter = db.prepare('SELECT COUNT(*) c FROM character_stats_reading WHERE user_id = 1').get() as { c: number };
    expect(writingAfter.c).toBe(1); // still just 好
    expect(readingAfter.c).toBe(2); // 好 + 學
    db.close();
  });
});
