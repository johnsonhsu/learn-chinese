/**
 * Import admin-managed and user data from JSON exports back into DBs.
 * Run AFTER the DBs have been initialized (server started once, or initDatabase called).
 *
 * Usage: npx tsx platform/scripts/import-data.ts
 *
 * Reads from: platform/scripts/exports/
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = join(__dirname, 'exports');

const platformDb = new Database(join(__dirname, '..', 'platform.db'));
const wcDb = new Database(join(__dirname, '..', '..', 'modules', 'writing-challenge', 'writing-challenge.db'));
const wsDb = new Database(join(__dirname, '..', '..', 'modules', 'word-sets', 'word-sets.db'));

platformDb.pragma('journal_mode = WAL');
wcDb.pragma('journal_mode = WAL');
wsDb.pragma('journal_mode = WAL');

function loadJson(filename: string): Record<string, unknown>[] {
  const path = join(EXPORT_DIR, filename);
  if (!existsSync(path)) { console.log(`  SKIP ${filename} (not found)`); return []; }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function importTable(db: InstanceType<typeof Database>, table: string, filename: string, clearFirst = true) {
  const rows = loadJson(filename);
  if (rows.length === 0) return;

  if (clearFirst) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(',');
  const insert = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);

  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run(...columns.map(c => row[c]));
    }
  });
  tx();
  console.log(`  ${filename}: ${rows.length} rows → ${table}`);
}

console.log('=== Platform DB ===');
importTable(platformDb, 'users', 'platform-users.json');
importTable(platformDb, 'user_settings', 'platform-user-settings.json');
importTable(platformDb, 'platform_settings', 'platform-settings.json');
importTable(platformDb, 'module_config', 'platform-module-config.json');
importTable(platformDb, 'character_stats', 'platform-character-stats.json');

console.log('\n=== Writing Challenge DB ===');
importTable(wcDb, 'profiles', 'wc-profiles.json');
importTable(wcDb, 'module_settings', 'wc-module-settings.json');
importTable(wcDb, 'practice_sessions', 'wc-practice-sessions.json');
importTable(wcDb, 'practice_sentences', 'wc-practice-sentences.json');

console.log('\n=== Word Sets DB ===');
importTable(wsDb, 'categories', 'ws-categories.json');
importTable(wsDb, 'category_words', 'ws-category-words.json');

platformDb.close();
wcDb.close();
wsDb.close();

console.log('\nImport complete.');
