import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'word-sets.db');

let db: InstanceType<typeof Database>;

export function initDatabase() {
  if (db) return;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_zh TEXT NOT NULL,
      name_en TEXT NOT NULL,
      icon TEXT DEFAULT '',
      color TEXT DEFAULT '#4a90d9',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS category_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      definition TEXT DEFAULT '',
      zhuyin TEXT DEFAULT '',
      pinyin TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      UNIQUE(category_id, word),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_cat_words_cat ON category_words(category_id)`);
}

export function getDb() { return db; }

// --- Categories ---

export interface Category {
  id: number;
  nameZh: string;
  nameEn: string;
  icon: string;
  color: string;
  sortOrder: number;
  wordCount: number;
}

export function getAllCategories(): Category[] {
  const rows = db.prepare(`
    SELECT c.*, COUNT(cw.id) as word_count
    FROM categories c
    LEFT JOIN category_words cw ON cw.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order, c.name_en
  `).all() as Array<{
    id: number; name_zh: string; name_en: string; icon: string;
    color: string; sort_order: number; word_count: number;
  }>;
  return rows.map(r => ({
    id: r.id,
    nameZh: r.name_zh,
    nameEn: r.name_en,
    icon: r.icon,
    color: r.color,
    sortOrder: r.sort_order,
    wordCount: r.word_count,
  }));
}

export function createCategory(nameZh: string, nameEn: string, icon: string, color: string): Category {
  const result = db.prepare(
    'INSERT INTO categories (name_zh, name_en, icon, color) VALUES (?, ?, ?, ?)'
  ).run(nameZh, nameEn, icon, color);
  return getAllCategories().find(c => c.id === result.lastInsertRowid)!;
}

export function updateCategory(id: number, updates: Partial<{ nameZh: string; nameEn: string; icon: string; color: string; sortOrder: number }>) {
  if (updates.nameZh !== undefined) db.prepare('UPDATE categories SET name_zh = ? WHERE id = ?').run(updates.nameZh, id);
  if (updates.nameEn !== undefined) db.prepare('UPDATE categories SET name_en = ? WHERE id = ?').run(updates.nameEn, id);
  if (updates.icon !== undefined) db.prepare('UPDATE categories SET icon = ? WHERE id = ?').run(updates.icon, id);
  if (updates.color !== undefined) db.prepare('UPDATE categories SET color = ? WHERE id = ?').run(updates.color, id);
  if (updates.sortOrder !== undefined) db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(updates.sortOrder, id);
}

export function deleteCategory(id: number) {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

// --- Category Words ---

export interface CategoryWord {
  id: number;
  categoryId: number;
  word: string;
  definition: string;
  zhuyin: string;
  pinyin: string;
  sortOrder: number;
}

export function getCategoryWords(categoryId: number): CategoryWord[] {
  const rows = db.prepare(
    'SELECT * FROM category_words WHERE category_id = ? ORDER BY sort_order, word'
  ).all(categoryId) as Array<{
    id: number; category_id: number; word: string; definition: string;
    zhuyin: string; pinyin: string; sort_order: number;
  }>;
  return rows.map(r => ({
    id: r.id,
    categoryId: r.category_id,
    word: r.word,
    definition: r.definition,
    zhuyin: r.zhuyin,
    pinyin: r.pinyin,
    sortOrder: r.sort_order,
  }));
}

export function addWordToCategory(categoryId: number, word: string, definition: string, zhuyin: string, pinyin: string) {
  db.prepare(
    'INSERT OR IGNORE INTO category_words (category_id, word, definition, zhuyin, pinyin) VALUES (?, ?, ?, ?, ?)'
  ).run(categoryId, word, definition, zhuyin, pinyin);
}

export function removeWordFromCategory(categoryId: number, wordId: number) {
  db.prepare('DELETE FROM category_words WHERE id = ? AND category_id = ?').run(wordId, categoryId);
}

export function reorderCategoryWords(categoryId: number, wordIds: number[]) {
  const update = db.prepare('UPDATE category_words SET sort_order = ? WHERE id = ? AND category_id = ?');
  const tx = db.transaction(() => {
    wordIds.forEach((id, i) => update.run(i, id, categoryId));
  });
  tx();
}
