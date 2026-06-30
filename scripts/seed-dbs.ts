/**
 * Produce COMMITTED, content-only seed copies of the source DBs that carry
 * personal data, so CI can build the app reproducibly without the working DBs
 * (which stay local + gitignored, holding the dev profile's progress).
 *
 *   platform.db          → seed/platform.db          (dictionary only; users/stats stripped)
 *   writing-challenge.db → seed/writing-challenge.db (module_settings only)
 *
 * content.db and word-sets.db are already pure content and are committed at their
 * working paths — no seed needed. The scrub here MIRRORS bake-data.ts, which
 * re-applies it on the snapshot (idempotent), so working-DB and seed builds match.
 *
 * Run: npm run seed:dbs   (then commit the seed/ changes)
 */
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const seedDir = join(repoRoot, 'seed');

interface Spec {
  working: string;
  out: string;
  scrub: (db: InstanceType<typeof Database>) => void;
}

const specs: Spec[] = [
  {
    working: join(repoRoot, 'platform', 'platform.db'),
    out: join(seedDir, 'platform.db'),
    scrub: (db) => {
      for (const t of ['character_stats', 'users', 'user_settings']) {
        try { db.exec(`DELETE FROM ${t};`); } catch { /* table absent */ }
      }
    },
  },
  {
    working: join(repoRoot, 'modules', 'writing-challenge', 'writing-challenge.db'),
    out: join(seedDir, 'writing-challenge.db'),
    scrub: (db) => {
      // Curriculum content lives in content.db now — drop the stale module copies.
      for (const t of ['bank_sentences', 'char_words', 'tocfl_words']) {
        try { db.exec(`DROP TABLE IF EXISTS ${t};`); } catch { /* skip */ }
      }
      // Strip every personal/dev row — ship module_settings only.
      for (const t of [
        'profiles', 'character_stats', 'user_settings',
        'practice_sessions', 'practice_sentences', 'session_history',
        'active_lessons', 'lesson_history', 'activity_log',
      ]) {
        try { db.exec(`DELETE FROM ${t};`); } catch { /* table absent */ }
      }
    },
  },
];

async function main() {
  mkdirSync(seedDir, { recursive: true });
  for (const { working, out, scrub } of specs) {
    if (!existsSync(working)) {
      throw new Error(`working DB not found: ${working} — run on the machine that has it`);
    }
    for (const ext of ['', '-wal', '-shm']) if (existsSync(out + ext)) rmSync(out + ext);

    // Consistent snapshot (incl. WAL) via the online backup API, then scrub.
    const src = new Database(working, { readonly: true });
    await src.backup(out);
    src.close();

    const db = new Database(out);
    scrub(db);
    db.exec('VACUUM;');
    const integ = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    db.close();
    if (integ !== 'ok') throw new Error(`seed ${out} failed integrity_check: ${integ}`);
    console.log(`seeded ${out.replace(repoRoot + '/', '')}`);
  }
  console.log('done — commit the seed/ changes');
}

main().catch((e) => { console.error(e); process.exit(1); });
