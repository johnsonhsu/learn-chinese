/**
 * Migrate character_stats from writing-challenge module DB to platform DB.
 *
 * The module DB stores character_stats keyed by profile_id (module profile).
 * The platform DB stores character_stats keyed by user_id (platform user).
 * The module's profiles table maps profile_id → user_id.
 *
 * This script:
 * 1. Reads all character_stats rows from the module DB
 * 2. Looks up the user_id for each profile_id via the module's profiles table
 * 3. Inserts them into the platform's character_stats table (same columns, just profile_id → user_id)
 *
 * Usage: npx tsx platform/scripts/migrate-char-stats.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDbPath = join(__dirname, '..', 'platform.db');
const moduleDbPath = join(__dirname, '..', '..', 'modules', 'writing-challenge', 'writing-challenge.db');

const platformDb = new Database(platformDbPath);
platformDb.pragma('journal_mode = WAL');
platformDb.pragma('foreign_keys = ON');

const moduleDb = new Database(moduleDbPath, { readonly: true });

// Step 1: Build profile_id → user_id mapping from module's profiles table
const profiles = moduleDb.prepare('SELECT id, user_id FROM profiles WHERE user_id IS NOT NULL').all() as { id: number; user_id: number }[];
const profileToUser = new Map<number, number>();
for (const p of profiles) {
  profileToUser.set(p.id, p.user_id);
}

console.log(`Found ${profiles.length} profiles with user_id mappings:`);
for (const p of profiles) {
  console.log(`  profile_id=${p.id} → user_id=${p.user_id}`);
}

// Step 2: Read all character_stats from module DB
const moduleStats = moduleDb.prepare('SELECT * FROM character_stats').all() as Record<string, unknown>[];
console.log(`\nFound ${moduleStats.length} character_stats rows in module DB`);

// Step 3: Check platform DB is empty
const existingCount = (platformDb.prepare('SELECT COUNT(*) as cnt FROM character_stats').get() as { cnt: number }).cnt;
if (existingCount > 0) {
  console.log(`\nWARNING: Platform character_stats already has ${existingCount} rows.`);
  console.log('Skipping migration to avoid duplicates. Clear the table first if you want to re-run.');
  moduleDb.close();
  platformDb.close();
  process.exit(1);
}

// Step 4: Insert into platform DB, mapping profile_id → user_id
const insertStmt = platformDb.prepare(`
  INSERT INTO character_stats (
    user_id, character,
    times_seen, times_perfect, times_correct, times_incorrect, times_hint_used,
    streak_perfect, streak_correct, streak_incorrect,
    best_streak_perfect, best_streak_correct,
    first_seen, last_seen, last_perfect, last_correct, last_incorrect,
    fastest_ms, slowest_ms, total_ms,
    last_result, last_failed_strokes, last_hint_used,
    first_result, recent_results
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let migrated = 0;
let skipped = 0;

const insertAll = platformDb.transaction(() => {
  for (const row of moduleStats) {
    const profileId = row.profile_id as number;
    const userId = profileToUser.get(profileId);
    if (!userId) {
      console.log(`  Skipping profile_id=${profileId} character=${row.character} (no user_id mapping)`);
      skipped++;
      continue;
    }

    insertStmt.run(
      userId,
      row.character,
      row.times_seen,
      row.times_perfect,
      row.times_correct,
      row.times_incorrect,
      row.times_hint_used,
      row.streak_perfect,
      row.streak_correct,
      row.streak_incorrect,
      row.best_streak_perfect,
      row.best_streak_correct,
      row.first_seen,
      row.last_seen,
      row.last_perfect,
      row.last_correct,
      row.last_incorrect,
      row.fastest_ms,
      row.slowest_ms,
      row.total_ms,
      row.last_result,
      row.last_failed_strokes,
      row.last_hint_used,
      row.first_result,
      row.recent_results,
    );
    migrated++;
  }
});

insertAll();

console.log(`\nMigration complete:`);
console.log(`  Migrated: ${migrated} rows`);
console.log(`  Skipped:  ${skipped} rows (no user_id mapping)`);

// Verify
const finalCount = (platformDb.prepare('SELECT COUNT(*) as cnt FROM character_stats').get() as { cnt: number }).cnt;
console.log(`  Platform character_stats now has ${finalCount} rows`);

moduleDb.close();
platformDb.close();
