/**
 * Shared CURRICULUM CONTENT accessor — the single source of truth for the
 * platform-owned `content.db` (bank_sentences, tocfl_words, char_words).
 *
 * Content used to live inside the writing-challenge module DB; it's now
 * platform-owned so every module (writing-challenge, practice-english, …) is a
 * pure consumer. The dev Express server reads/writes the bank through here; the
 * baked snapshot ships to devices via bake-data.ts.
 *
 * Per-profile progress is NOT here — it lives in platform.db + the on-device
 * IndexedDB user-store and is untouched by this module.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as OpenCC from 'opencc-js';

// Auto-convert imported sentences to Taiwan-standard Traditional (cn → tw) so
// Simplified leakage from generators (e.g. qwen) can never enter the bank.
const toTraditionalTW = OpenCC.Converter({ from: 'cn', to: 'tw' });

// Drawable-glyph variant unification. The LLM/corpus emits these variant forms, but
// only the mapped form is in the char ranking AND has hanzi-writer stroke data — the
// app literally can't draw the variant (e.g. 汙 U+6C59 has no stroke data; 污 U+6C61
// does, ranked 809). Pure orthographic variants only — NEVER 台/臺, which are
// intentionally distinct and are shielded across the OpenCC pass below.
const VARIANT_MAP: Record<string, string> = { '汙': '污', '秘': '祕' };

/**
 * Taiwan-Traditional canonical form: Simplified->Traditional while preserving 台 AND
 * 臺 EXACTLY (OpenCC forces 台->臺, so shield both behind private-use sentinels across
 * the pass, then restore), then unify undrawable variant glyphs. Mirrors the scrub in
 * scripts/bank-fix.py so import and offline-scrub agree on one canonical form.
 */
export function canonicalizeTW(raw: string): string {
  // Shield 台/臺 behind private-use sentinels so OpenCC can't touch either (it would
  // force 台->臺); both are valid Taiwan forms we preserve verbatim. Then unify the
  // undrawable variant glyphs (汙->污 etc).
  const T1 = String.fromCharCode(0xE000), T2 = String.fromCharCode(0xE001);
  let s = toTraditionalTW(raw.split('台').join(T1).split('臺').join(T2))
    .split(T1).join('台').split(T2).join('臺');
  for (const [k, v] of Object.entries(VARIANT_MAP)) s = s.split(k).join(v);
  return s;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DB_PATH = join(__dirname, '..', '..', 'platform', 'content.db');

let db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!db) {
    db = new Database(CONTENT_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createSchema(db);
  }
  return db;
}

/** Idempotently ensure the content tables exist (matches content.db schema). */
function createSchema(d: InstanceType<typeof Database>) {
  d.exec(`
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
      grammar TEXT DEFAULT '',
      UNIQUE(word, level)
    )
  `);
  d.exec(`
    CREATE TABLE IF NOT EXISTS char_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character TEXT NOT NULL,
      word_id INTEGER NOT NULL,
      UNIQUE(character, word_id),
      FOREIGN KEY (word_id) REFERENCES tocfl_words(id) ON DELETE CASCADE
    )
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_char_words_char ON char_words(character)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_char_words_word ON char_words(word_id)');
  d.exec(`
    CREATE TABLE IF NOT EXISTS bank_sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence TEXT NOT NULL UNIQUE,
      english TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

/** Raw handle, for the rare caller that needs ad-hoc content queries. */
export function getContentDb(): InstanceType<typeof Database> {
  return getDb();
}

// --- Sentence bank (curated pool) ---

export function addBankSentences(
  rows: { sentence: string; english: string }[],
): { added: number; updated: number; skipped: number } {
  const d = getDb();
  const find = d.prepare('SELECT english FROM bank_sentences WHERE sentence = ?');
  const ins = d.prepare('INSERT INTO bank_sentences (sentence, english) VALUES (?, ?)');
  const upd = d.prepare('UPDATE bank_sentences SET english = ? WHERE sentence = ?');
  let added = 0, updated = 0;
  const tx = d.transaction((rs: { sentence: string; english: string }[]) => {
    for (const r of rs) {
      // Canonicalize on the way in: Simplified->Traditional, but 台/臺 are BOTH
      // valid Taiwan forms and are NEVER converted (shielded in canonicalizeTW);
      // only genuine Simplified + undrawable variant glyphs (汙->污 etc) change.
      const s = canonicalizeTW((r.sentence || '').trim());
      if (!s) continue;
      const e = (r.english || '').trim();
      const existing = find.get(s) as { english: string } | undefined;
      if (!existing) { ins.run(s, e); added++; }
      // Re-dump fills a blank English; never overwrites an existing translation.
      else if (e && !(existing.english || '').trim()) { upd.run(e, s); updated++; }
    }
  });
  tx(rows);
  return { added, updated, skipped: rows.length - added - updated };
}

export function getBankSentenceCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM bank_sentences').get() as { c: number }).c;
}

export function getAllBankSentences(): { id: number; sentence: string; english: string }[] {
  return getDb().prepare('SELECT id, sentence, english FROM bank_sentences ORDER BY id').all() as {
    id: number; sentence: string; english: string;
  }[];
}

export function deleteAllBankSentences(): void {
  getDb().prepare('DELETE FROM bank_sentences').run();
}

export function searchBankSentences(q: string, limit: number): { id: number; sentence: string; english: string }[] {
  const d = getDb();
  const lim = Math.max(1, Math.min(50000, limit || 200));
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    return d.prepare(
      'SELECT id, sentence, english FROM bank_sentences WHERE sentence LIKE ? OR english LIKE ? ORDER BY id DESC LIMIT ?',
    ).all(like, like, lim) as { id: number; sentence: string; english: string }[];
  }
  return d.prepare('SELECT id, sentence, english FROM bank_sentences ORDER BY id DESC LIMIT ?').all(lim) as {
    id: number; sentence: string; english: string;
  }[];
}

export function updateBankSentence(id: number, sentence: string, english: string): boolean {
  const s = (sentence || '').trim();
  if (!s) return false;
  return getDb().prepare('UPDATE bank_sentences SET sentence = ?, english = ? WHERE id = ?')
    .run(s, (english || '').trim(), id).changes > 0;
}

export function deleteBankSentence(id: number): void {
  getDb().prepare('DELETE FROM bank_sentences WHERE id = ?').run(id);
}

export function deleteBankSentences(ids: number[]): void {
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  getDb().prepare(`DELETE FROM bank_sentences WHERE id IN (${ph})`).run(...ids);
}

/** "Server default" = the bank baked into the shipped app (last `npm run bake:data`). */
export function restoreBankFromBaked(): { total: number; error?: string } {
  const d = getDb();
  const bakedPath = join(__dirname, '..', '..', 'platform', 'public', 'data', 'content.db');
  let src: InstanceType<typeof Database> | null = null;
  try {
    src = new Database(bakedPath, { readonly: true });
    const rows = src.prepare('SELECT sentence, english FROM bank_sentences').all() as { sentence: string; english: string }[];
    const tx = d.transaction(() => {
      d.prepare('DELETE FROM bank_sentences').run();
      const ins = d.prepare('INSERT OR IGNORE INTO bank_sentences (sentence, english) VALUES (?, ?)');
      for (const r of rows) ins.run(r.sentence, r.english || '');
    });
    tx();
    return { total: getBankSentenceCount() };
  } catch (e) {
    return { total: getBankSentenceCount(), error: (e as Error).message };
  } finally {
    src?.close();
  }
}

// --- TOCFL words / char index ---

const TOCFL_LEVEL_ORDER = ['第1級', '第1*級', '第2級', '第2*級', '第3級', '第3*級', '第4級', '第4*級', '第5級', '第6級', '第7級'];
const HAN_RE = /[一-鿿㐀-䶿]/;

export interface TocflWordRow {
  word: string;
  level: string;
}

/** All TOCFL words (word + level) — used for coverage + per-char level maps. */
export function getTocflWords(): TocflWordRow[] {
  return getDb().prepare('SELECT word, level FROM tocfl_words').all() as TocflWordRow[];
}

/** Per-character TOCFL level (lowest level the char appears at). */
export function getCharTocflLevels(): Record<string, string> {
  const levelRank: Record<string, number> = {};
  TOCFL_LEVEL_ORDER.forEach((l, i) => { levelRank[l] = i; });
  const rows = getTocflWords();
  const out: Record<string, string> = {};
  for (const { word, level } of rows) {
    for (const c of word) {
      if (HAN_RE.test(c)) {
        if (!out[c] || (levelRank[level] ?? 99) < (levelRank[out[c]] ?? 99)) out[c] = level;
      }
    }
  }
  return out;
}

/** Single-character zhuyin from tocfl_words (LENGTH(word) = 1), or '' if none. */
export function getCharZhuyin(char: string): string {
  const row = getDb().prepare(
    'SELECT zhuyin FROM tocfl_words WHERE word = ? AND LENGTH(word) = 1',
  ).get(char) as { zhuyin: string } | undefined;
  return row?.zhuyin || '';
}
