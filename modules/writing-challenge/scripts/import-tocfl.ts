/**
 * Import TOCFL word list CSV into the module database.
 *
 * Usage: npx tsx scripts/import-tocfl.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, '..', '..', '..', 'input-lists', 'writing-challenge', 'tocfl-wordlist.csv');
// tocfl_words + char_words are platform-owned curriculum content now (content.db).
const DB_PATH = join(__dirname, '..', '..', '..', 'platform', 'content.db');

// Parse CSV with quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

const raw = readFileSync(CSV_PATH, 'utf-8');
const lines = raw.split('\n').filter(Boolean);

console.log(`Reading ${lines.length} lines from TOCFL CSV`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS tocfl_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    tier TEXT DEFAULT '',
    level TEXT DEFAULT '',
    category TEXT DEFAULT '',
    written_freq REAL DEFAULT 0,
    spoken_freq REAL DEFAULT 0,
    zhuyin TEXT DEFAULT '',
    pinyin TEXT DEFAULT '',
    definition TEXT DEFAULT '',
    UNIQUE(word, level)
  )
`);

// Clear existing
const existing = db.prepare('SELECT COUNT(*) as c FROM tocfl_words').get() as { c: number };
if (existing.c > 0) {
  console.log(`Clearing ${existing.c} existing rows`);
  db.exec('DELETE FROM tocfl_words');
}

const insert = db.prepare(`
  INSERT OR IGNORE INTO tocfl_words (word, tier, level, category, written_freq, spoken_freq, zhuyin, pinyin, definition)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((rows: string[][]) => {
  for (const fields of rows) {
    // CSV columns: index, 序號, 詞語, 等別, 級別, 情境, 書面字頻, 口語字頻, 簡編本系統號, 參考注音, 參考漢語拼音, definition
    if (fields.length < 12) continue;
    const word = fields[2].trim();
    const tier = fields[3].trim();
    const level = fields[4].trim();
    const category = fields[5].trim();
    const writtenFreq = parseFloat(fields[6]) || 0;
    const spokenFreq = parseFloat(fields[7]) || 0;
    const zhuyin = fields[9].trim();
    const pinyin = fields[10].trim();
    const definition = fields[11].trim();

    if (!word) continue;
    insert.run(word, tier, level, category, writtenFreq, spokenFreq, zhuyin, pinyin, definition);
  }
});

const rows = lines.map(parseCSVLine);
insertMany(rows);

// Stats
const total = (db.prepare('SELECT COUNT(*) as c FROM tocfl_words').get() as { c: number }).c;
console.log(`Imported ${total} words`);

const byLevel = db.prepare('SELECT level, COUNT(*) as c FROM tocfl_words GROUP BY level ORDER BY level').all() as { level: string; c: number }[];
console.log('\nBy level:');
for (const { level, c } of byLevel) console.log(`  ${level}: ${c}`);

const byTier = db.prepare('SELECT tier, COUNT(*) as c FROM tocfl_words GROUP BY tier ORDER BY tier').all() as { tier: string; c: number }[];
console.log('\nBy tier:');
for (const { tier, c } of byTier) console.log(`  ${tier}: ${c}`);

const byCat = db.prepare("SELECT category, COUNT(*) as c FROM tocfl_words WHERE category != '' AND category != '?' GROUP BY category ORDER BY c DESC").all() as { category: string; c: number }[];
console.log('\nBy category:');
for (const { category, c } of byCat) console.log(`  ${category}: ${c}`);

// Build char-word index
console.log('\nBuilding char-word index...');
db.exec(`
  CREATE TABLE IF NOT EXISTS char_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character TEXT NOT NULL,
    word_id INTEGER NOT NULL,
    UNIQUE(character, word_id),
    FOREIGN KEY (word_id) REFERENCES tocfl_words(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_char_words_char ON char_words(character)');
db.exec('CREATE INDEX IF NOT EXISTS idx_char_words_word ON char_words(word_id)');
db.exec('DELETE FROM char_words');
const allWords = db.prepare('SELECT id, word FROM tocfl_words').all() as { id: number; word: string }[];
const insertCW = db.prepare('INSERT OR IGNORE INTO char_words (character, word_id) VALUES (?, ?)');
const buildIndex = db.transaction(() => {
  for (const w of allWords) {
    const word = w.word.split('/')[0];
    for (const c of word) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)) {
        insertCW.run(c, w.id);
      }
    }
  }
});
buildIndex();
const cwCount = (db.prepare('SELECT COUNT(*) as c FROM char_words').get() as { c: number }).c;
const uniqueChars = (db.prepare('SELECT COUNT(DISTINCT character) as c FROM char_words').get() as { c: number }).c;
console.log(`  ${cwCount} char-word pairs, ${uniqueChars} unique chars`);

db.close();
