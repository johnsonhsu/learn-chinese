/**
 * Export all admin-managed and user data from platform + module DBs to JSON files.
 *
 * Usage: npx tsx platform/scripts/export-data.ts
 *
 * Exports to: platform/scripts/exports/
 */

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = join(__dirname, 'exports');
mkdirSync(EXPORT_DIR, { recursive: true });

const platformDb = new Database(join(__dirname, '..', 'platform.db'), { readonly: true });
const wcDb = new Database(join(__dirname, '..', '..', 'modules', 'writing-challenge', 'writing-challenge.db'), { readonly: true });
const wsDb = new Database(join(__dirname, '..', '..', 'modules', 'word-sets', 'word-sets.db'), { readonly: true });

function exportTable(db: InstanceType<typeof Database>, table: string, filename: string) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  writeFileSync(join(EXPORT_DIR, filename), JSON.stringify(rows, null, 2));
  console.log(`  ${filename}: ${rows.length} rows`);
}

console.log('=== Platform DB ===');
exportTable(platformDb, 'users', 'platform-users.json');
exportTable(platformDb, 'user_settings', 'platform-user-settings.json');
exportTable(platformDb, 'platform_settings', 'platform-settings.json');
exportTable(platformDb, 'module_config', 'platform-module-config.json');
exportTable(platformDb, 'character_stats', 'platform-character-stats.json');

console.log('\n=== Writing Challenge DB ===');
exportTable(wcDb, 'profiles', 'wc-profiles.json');
exportTable(wcDb, 'module_settings', 'wc-module-settings.json');
exportTable(wcDb, 'practice_sessions', 'wc-practice-sessions.json');
exportTable(wcDb, 'practice_sentences', 'wc-practice-sentences.json');

console.log('\n=== Word Sets DB ===');
exportTable(wsDb, 'categories', 'ws-categories.json');
exportTable(wsDb, 'category_words', 'ws-category-words.json');

platformDb.close();
wcDb.close();
wsDb.close();

console.log(`\nExported to: ${EXPORT_DIR}`);
