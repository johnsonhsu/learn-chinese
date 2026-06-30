/**
 * Import dictionary data into platform DB.
 *
 * Sources:
 *   - base-chars.json (10,262 chars with frequency data)
 *   - TOCFL word list from module DB (14,396 words with levels, grammar, pronunciations)
 *
 * Creates zh-TW dictionary with:
 *   - dict_chars + metadata (frequency ranks, HSK level, pinyin, gloss)
 *   - dict_words + pronunciations (zhuyin, pinyin)
 *   - dict_char_words junction
 *
 * Usage: npx tsx platform/scripts/import-dictionary.ts
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDbPath = join(__dirname, '..', 'platform.db');
// Curriculum content (tocfl_words) is platform-owned now — read it from content.db.
const contentDbPath = join(__dirname, '..', 'content.db');
const baseCharsPath = join(__dirname, '..', '..', 'modules', 'writing-challenge', 'src', 'data', 'base-chars.json');

// Open platform DB (will create tables if initDatabase was called)
const db = new Database(platformDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Open content DB (read-only, source of TOCFL data)
const contentDb = new Database(contentDbPath, { readonly: true });

// --- Ensure schema exists ---
// (In case script is run before server starts)
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dictionaries'").get();
if (!tables) {
  console.error('Platform DB schema not initialized. Start the server once first, or run initDatabase().');
  process.exit(1);
}

// --- Create dictionary ---
console.log('Creating zh-TW dictionary...');
db.prepare('INSERT OR IGNORE INTO dictionaries (code, name) VALUES (?, ?)').run('zh-TW', 'Traditional Chinese');
const dict = db.prepare('SELECT id FROM dictionaries WHERE code = ?').get('zh-TW') as { id: number };
const dictId = dict.id;
console.log(`Dictionary ID: ${dictId}`);

// --- Import chars from base-chars.json ---
console.log('\nImporting characters from base-chars.json...');
const baseChars = JSON.parse(readFileSync(baseCharsPath, 'utf-8')) as {
  char: string;
  simp: string;
  pinyin: string;
  gloss: string;
  hskLevel: number;
  frequency: {
    movieWordRank?: number;
    movieCharRank?: number;
    bookWordRank?: number;
    bookCharRank?: number;
  };
}[];

const insertChar = db.prepare('INSERT OR IGNORE INTO dict_chars (dictionary_id, character) VALUES (?, ?)');
const insertMeta = db.prepare('INSERT OR REPLACE INTO dict_char_metadata (char_id, key, value) VALUES (?, ?, ?)');
const getCharId = db.prepare('SELECT id FROM dict_chars WHERE dictionary_id = ? AND character = ?');

const charInsertTx = db.transaction(() => {
  let count = 0;
  for (const c of baseChars) {
    insertChar.run(dictId, c.char);
    const row = getCharId.get(dictId, c.char) as { id: number };
    const charId = row.id;

    // Frequency metadata
    if (c.frequency.bookCharRank) insertMeta.run(charId, 'freq_book_rank', String(c.frequency.bookCharRank));
    if (c.frequency.movieCharRank) insertMeta.run(charId, 'freq_movie_rank', String(c.frequency.movieCharRank));
    if (c.frequency.bookWordRank) insertMeta.run(charId, 'freq_book_word_rank', String(c.frequency.bookWordRank));
    if (c.frequency.movieWordRank) insertMeta.run(charId, 'freq_movie_word_rank', String(c.frequency.movieWordRank));

    // Other metadata
    if (c.hskLevel) insertMeta.run(charId, 'hsk_level', String(c.hskLevel));
    if (c.pinyin) insertMeta.run(charId, 'pinyin', c.pinyin);
    if (c.gloss) insertMeta.run(charId, 'gloss', c.gloss);
    if (c.simp && c.simp !== c.char) insertMeta.run(charId, 'simplified', c.simp);

    count++;
  }
  console.log(`  Inserted ${count} characters`);
});
charInsertTx();

// --- Import words from TOCFL ---
console.log('\nImporting words from TOCFL...');
const tocflWords = contentDb.prepare(
  'SELECT word, tier, level, category, written_freq, spoken_freq, zhuyin, pinyin, definition, grammar FROM tocfl_words'
).all() as {
  word: string; tier: string; level: string; category: string;
  written_freq: number; spoken_freq: number;
  zhuyin: string; pinyin: string; definition: string; grammar: string;
}[];

const insertWord = db.prepare(
  'INSERT OR IGNORE INTO dict_words (dictionary_id, word, definition, grammar, level, level_source) VALUES (?, ?, ?, ?, ?, ?)'
);
const getWordId = db.prepare('SELECT id FROM dict_words WHERE dictionary_id = ? AND word = ? AND level = ?');
const insertPron = db.prepare('INSERT OR REPLACE INTO dict_word_pronunciations (word_id, type, value) VALUES (?, ?, ?)');
const insertCharWord = db.prepare('INSERT OR IGNORE INTO dict_char_words (char_id, word_id) VALUES (?, ?)');

const wordInsertTx = db.transaction(() => {
  let wordCount = 0;
  let pronCount = 0;
  let linkCount = 0;

  for (const w of tocflWords) {
    insertWord.run(dictId, w.word, w.definition, w.grammar, w.level, 'TOCFL');
    const row = getWordId.get(dictId, w.word, w.level) as { id: number } | undefined;
    if (!row) continue;
    const wordId = row.id;
    wordCount++;

    // Pronunciations
    if (w.zhuyin) { insertPron.run(wordId, 'zhuyin', w.zhuyin); pronCount++; }
    if (w.pinyin) { insertPron.run(wordId, 'pinyin', w.pinyin); pronCount++; }

    // Char-word links
    const word = w.word.split('/')[0];
    for (const c of word) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)) {
        const charRow = getCharId.get(dictId, c) as { id: number } | undefined;
        if (charRow) {
          insertCharWord.run(charRow.id, wordId);
          linkCount++;
        } else {
          // Char not in base-chars.json — insert it
          insertChar.run(dictId, c);
          const newChar = getCharId.get(dictId, c) as { id: number };
          insertCharWord.run(newChar.id, wordId);
          linkCount++;
        }
      }
    }
  }

  console.log(`  Inserted ${wordCount} words`);
  console.log(`  Inserted ${pronCount} pronunciations`);
  console.log(`  Inserted ${linkCount} char-word links`);
});
wordInsertTx();

// --- Also add TOCFL level as char metadata ---
console.log('\nComputing TOCFL char levels...');
const tocflLevelOrder = ['第1級','第1*級','第2級','第2*級','第3級','第3*級','第4級','第4*級','第5級','第6級','第7級'];
const levelRank: Record<string, number> = {};
tocflLevelOrder.forEach((l, i) => levelRank[l] = i);

const charTocfl: Record<string, string> = {};
for (const w of tocflWords) {
  const word = w.word.split('/')[0];
  for (const c of word) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)) {
      if (!charTocfl[c] || (levelRank[w.level] ?? 99) < (levelRank[charTocfl[c]] ?? 99)) {
        charTocfl[c] = w.level;
      }
    }
  }
}

const tocflMetaTx = db.transaction(() => {
  let count = 0;
  for (const [char, level] of Object.entries(charTocfl)) {
    const row = getCharId.get(dictId, char) as { id: number } | undefined;
    if (row) {
      insertMeta.run(row.id, 'tocfl_level', level);
      count++;
    }
  }
  console.log(`  Tagged ${count} chars with TOCFL levels`);
});
tocflMetaTx();

// --- Summary ---
const charCount = (db.prepare('SELECT COUNT(*) as n FROM dict_chars WHERE dictionary_id = ?').get(dictId) as { n: number }).n;
const wordCount = (db.prepare('SELECT COUNT(*) as n FROM dict_words WHERE dictionary_id = ?').get(dictId) as { n: number }).n;
const linkCount = (db.prepare('SELECT COUNT(*) as n FROM dict_char_words').get() as { n: number }).n;
const pronCount = (db.prepare('SELECT COUNT(*) as n FROM dict_word_pronunciations').get() as { n: number }).n;

console.log('\n--- Summary ---');
console.log(`Dictionary: zh-TW (id=${dictId})`);
console.log(`Characters: ${charCount}`);
console.log(`Words: ${wordCount}`);
console.log(`Char-word links: ${linkCount}`);
console.log(`Pronunciations: ${pronCount}`);

db.close();
contentDb.close();
console.log('\nDone.');
