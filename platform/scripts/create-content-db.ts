/**
 * One-off dev script: extract the shared CURRICULUM CONTENT tables
 * (bank_sentences, tocfl_words, char_words) out of the writing-challenge module
 * DB into a platform-owned content.db.
 *
 * Content is platform-owned now; writing-challenge becomes a pure consumer. This
 * copies the three tables verbatim (schema + rows) via ATTACH + CREATE/INSERT…
 * SELECT, then verifies row counts match the source.
 *
 * Usage: npx tsx platform/scripts/create-content-db.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dirname, '..');
const repoRoot = join(platformRoot, '..');
const SRC = join(repoRoot, 'modules', 'writing-challenge', 'writing-challenge.db');
const DEST = join(platformRoot, 'content.db');

if (!existsSync(SRC)) {
  console.error(`Source DB not found: ${SRC}`);
  process.exit(1);
}

// Fresh content.db each run.
for (const f of [DEST, `${DEST}-wal`, `${DEST}-shm`]) {
  if (existsSync(f)) rmSync(f);
}

const TABLES = ['tocfl_words', 'char_words', 'bank_sentences'] as const;

const db = new Database(DEST);
db.pragma('journal_mode = WAL');
db.prepare('ATTACH ? AS src').run(SRC);

const expected: Record<string, number> = {};
for (const t of TABLES) {
  expected[t] = (db.prepare(`SELECT COUNT(*) AS c FROM src.${t}`).get() as { c: number }).c;
}

// Recreate each table from the source schema, then copy all rows. Doing it in
// dependency order (tocfl_words before char_words FK) inside one transaction.
const copy = db.transaction(() => {
  for (const t of TABLES) {
    const ddl = (db.prepare(
      `SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?`,
    ).get(t) as { sql: string }).sql;
    db.exec(ddl);
    db.exec(`INSERT INTO ${t} SELECT * FROM src.${t}`);
    // Copy any indexes defined on the table too.
    const idxs = db.prepare(
      `SELECT sql FROM src.sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
    ).all(t) as { sql: string }[];
    for (const { sql } of idxs) db.exec(sql);
  }
});
copy();

db.prepare('DETACH src').run();

let ok = true;
console.log('--- row-count verification ---');
for (const t of TABLES) {
  const got = (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
  const match = got === expected[t];
  ok = ok && match;
  console.log(`  ${t}: ${got} / ${expected[t]} ${match ? 'OK' : 'MISMATCH'}`);
}

db.close();

console.log(ok ? `\nWrote ${DEST}` : '\nROW COUNT MISMATCH — aborting');
if (!ok) process.exit(1);
