/**
 * Bake shipped data assets for the server-optional (local-first) app.
 *
 * Snapshots the canonical SQLite DBs into platform/public/data/ as read-only
 * "content" the client loads into sql.js, plus a version.json stamp so the
 * client knows when to replace its cached copy (without touching user data).
 *
 * Uses better-sqlite3's online backup API so WAL contents are included and the
 * snapshot is consistent even if the dev server is running.
 *
 * Run: npm run bake:data   (from repo root or platform/)
 */
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dirname, '..');
const repoRoot = join(platformRoot, '..');
const outDir = join(platformRoot, 'public', 'data');

const seedDir = join(repoRoot, 'seed');

interface Source {
  /** asset name the client fetches: /data/<name>.db */
  name: string;
  src: string;
  /** Committed content-only fallback used when `src` is absent — i.e. CI, which
   *  has no working DB. Produced by `npm run seed:dbs`. The personal-data scrub
   *  below still runs, so working-DB and seed builds yield the same snapshot. */
  seed?: string;
}

const sources: Source[] = [
  { name: 'platform', src: join(platformRoot, 'platform.db'), seed: join(seedDir, 'platform.db') },
  // Platform-owned curriculum content (bank_sentences, tocfl_words, char_words).
  { name: 'content', src: join(platformRoot, 'content.db') },
  { name: 'writing-challenge', src: join(repoRoot, 'modules', 'writing-challenge', 'writing-challenge.db'), seed: join(seedDir, 'writing-challenge.db') },
  { name: 'word-sets', src: join(repoRoot, 'modules', 'word-sets', 'word-sets.db') },
];

/** Working DB if present (local dev), else the committed content-only seed (CI). */
function resolveSource(src: string, seed?: string): string {
  if (existsSync(src)) return src;
  if (seed && existsSync(seed)) return seed;
  throw new Error(`Source DB not found: ${src}${seed ? ` (and no seed at ${seed})` : ''}`);
}

// Build one stroke-data.json bundle (char -> hanzi-writer data) for every
// dictionary character we have stroke data for, applying local Taiwan overrides.
// This is what makes writing practice work fully offline.
function bakeStrokeData(): { size: number; hash: string } {
  const hwCandidates = [
    join(repoRoot, 'node_modules', 'hanzi-writer-data'),
    join(platformRoot, 'node_modules', 'hanzi-writer-data'),
  ];
  const hwDir = hwCandidates.find((p) => existsSync(p));
  if (!hwDir) throw new Error('hanzi-writer-data not installed (npm i -w platform -D hanzi-writer-data)');

  const db = new Database(resolveSource(join(platformRoot, 'platform.db'), join(seedDir, 'platform.db')), { readonly: true });
  const chars = (db.prepare('SELECT character FROM dict_chars WHERE dictionary_id = 1').all() as { character: string }[])
    .map((r) => r.character);
  db.close();

  const bundle: Record<string, unknown> = {};
  let missing = 0;
  for (const ch of chars) {
    const f = join(hwDir, `${ch}.json`);
    if (!existsSync(f)) { missing++; continue; }
    try { bundle[ch] = JSON.parse(readFileSync(f, 'utf-8')); } catch { missing++; }
  }

  // Local overrides (e.g., Taiwan stroke variants 為, 說) win.
  const overrideDir = join(platformRoot, 'public', 'stroke-data');
  if (existsSync(overrideDir)) {
    for (const fn of readdirSync(overrideDir)) {
      if (!fn.endsWith('.json')) continue;
      const ch = fn.slice(0, -5);
      try { bundle[ch] = JSON.parse(readFileSync(join(overrideDir, fn), 'utf-8')); } catch { /* skip */ }
    }
  }

  const dest = join(outDir, 'stroke-data.json');
  const text = JSON.stringify(bundle);
  writeFileSync(dest, text);
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  console.log(`baked stroke-data.json  ${Object.keys(bundle).length} chars (${missing} missing)  ${(text.length / 1e6).toFixed(1)}MB  ${hash}`);
  return { size: text.length, hash };
}

async function bake(): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const files: Record<string, { size: number; hash: string }> = {};

  for (const { name, src, seed } of sources) {
    const source = resolveSource(src, seed);
    if (source !== src) console.log(`  using seed for ${name} (no working DB)`);
    const dest = join(outDir, `${name}.db`);
    // Clean any stale snapshot first so backup() writes fresh.
    if (existsSync(dest)) rmSync(dest);

    const db = new Database(source, { readonly: true });
    await db.backup(dest); // consistent snapshot incl. WAL
    db.close();

    // The deployed app ships CONTENT only — never anyone's profile or progress.
    // Strip personal rows from the platform snapshot so fresh installs start
    // blank (existing devices keep their own progress in the IndexedDB store).
    if (name === 'platform') {
      const sdb = new Database(dest);
      // character_stats_reading is the reading-skill track (issue #65) — same
      // personal-data risk as character_stats, so scrub it too.
      for (const tbl of ['character_stats', 'character_stats_reading', 'users', 'user_settings']) {
        try { sdb.exec(`DELETE FROM ${tbl};`); } catch { /* table absent — skip */ }
      }
      sdb.exec('VACUUM;');
      sdb.close();
    }

    // The curriculum content (bank_sentences, tocfl_words, char_words) is
    // platform-owned now and ships in content.db. Drop those tables from the
    // writing-challenge snapshot so the module DB carries only its own
    // module_settings + (dev-only) per-profile tables. Old cached module DBs
    // just go stale — installs re-download on the next contentHash change.
    if (name === 'writing-challenge') {
      const sdb = new Database(dest);
      // Curriculum content moved to content.db — drop the module's stale copies.
      for (const tbl of ['bank_sentences', 'char_words', 'tocfl_words']) {
        try { sdb.exec(`DROP TABLE IF EXISTS ${tbl};`); } catch { /* skip */ }
      }
      // Strip ALL personal/dev rows — the device keeps its own progress in the
      // IndexedDB user-store, so the module snapshot ships module_settings only.
      // (Without this, the dev profiles/sessions/stats leaked into production.)
      for (const tbl of [
        'profiles', 'character_stats', 'user_settings',
        'practice_sessions', 'practice_sentences', 'session_history',
        'active_lessons', 'lesson_history', 'activity_log',
      ]) {
        try { sdb.exec(`DELETE FROM ${tbl};`); } catch { /* table absent — skip */ }
      }
      sdb.exec('VACUUM;');
      sdb.close();
    }

    const buf = readFileSync(dest);
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    files[name] = { size: buf.byteLength, hash };
    console.log(`baked ${name}.db  ${(buf.byteLength / 1e6).toFixed(1)}MB  ${hash}`);
  }

  files['stroke-data'] = bakeStrokeData();

  // Stable content fingerprint: hash of the per-file hashes. Changes only when the
  // baked DATA changes. Kept as its own field so consumers that want pure-content
  // identity (and to detect data-only changes) still have it.
  const contentHash = createHash('sha256')
    .update(Object.entries(files).map(([n, f]) => `${n}:${f.hash}`).join('|'))
    .digest('hex')
    .slice(0, 16);

  // Per-build version: fold a fresh build timestamp into the content hash so EVERY
  // build/deploy gets a distinct `version` — even when the data (and code) are
  // unchanged. This is what the device-vs-server compare and the settings display
  // read, so a code-only deploy now correctly reads as "update available".
  // Same 16-hex-char shape as before, so the 8-char short-truncate still looks right.
  const builtAt = new Date().toISOString();
  const version = createHash('sha256')
    .update(`${contentHash}|${builtAt}`)
    .digest('hex')
    .slice(0, 16);

  writeFileSync(
    join(outDir, 'version.json'),
    JSON.stringify({ version, contentHash, files, builtAt }, null, 2),
  );
  console.log(`build version: ${version}  (content ${contentHash})`);
}

bake().catch((err) => {
  console.error(err);
  process.exit(1);
});
