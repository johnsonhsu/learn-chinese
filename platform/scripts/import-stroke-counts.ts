/**
 * Import stroke counts from hanzi-writer-data CDN into dict_chars.
 *
 * Fetches character JSON from jsdelivr, extracts strokes.length.
 * Batches requests to avoid rate limiting.
 *
 * Usage: npx tsx platform/scripts/import-stroke-counts.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'platform.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1';
const BATCH_SIZE = 50;
const DELAY_MS = 200;

// Get all chars that need stroke counts
const chars = db.prepare(
  'SELECT id, character FROM dict_chars WHERE stroke_count = 0 OR stroke_count IS NULL'
).all() as { id: number; character: string }[];

console.log(`${chars.length} characters need stroke counts`);

const update = db.prepare('UPDATE dict_chars SET stroke_count = ? WHERE id = ?');

async function fetchStrokeCount(char: string): Promise<number | null> {
  try {
    const url = `${CDN_BASE}/${encodeURIComponent(char)}.json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as { strokes: string[] };
    return data.strokes.length;
  } catch {
    return null;
  }
}

async function processBatch(batch: { id: number; character: string }[]): Promise<number> {
  const results = await Promise.all(
    batch.map(async ({ id, character }) => {
      const count = await fetchStrokeCount(character);
      return { id, character, count };
    })
  );

  let updated = 0;
  for (const { id, count } of results) {
    if (count !== null) {
      update.run(count, id);
      updated++;
    } else {
      // Store as -1 to indicate "no data" so we don't retry
      update.run(-1, id);
    }
  }
  return updated;
}

async function main() {
  let total = 0;
  let found = 0;

  for (let i = 0; i < chars.length; i += BATCH_SIZE) {
    const batch = chars.slice(i, i + BATCH_SIZE);
    const updated = await processBatch(batch);
    total += batch.length;
    found += updated;

    const pct = Math.round(total / chars.length * 100);
    process.stdout.write(`\r  ${total}/${chars.length} (${pct}%) — ${found} found`);

    if (i + BATCH_SIZE < chars.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n\nDone. ${found} stroke counts imported, ${total - found} not found.`);

  // Stats
  const withStrokes = (db.prepare('SELECT COUNT(*) as n FROM dict_chars WHERE stroke_count > 0').get() as { n: number }).n;
  const without = (db.prepare('SELECT COUNT(*) as n FROM dict_chars WHERE stroke_count <= 0').get() as { n: number }).n;
  console.log(`Characters with stroke data: ${withStrokes}`);
  console.log(`Characters without: ${without}`);

  db.close();
}

main();
