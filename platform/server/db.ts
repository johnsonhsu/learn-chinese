import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'platform.db');

let db: InstanceType<typeof Database>;

export function initDatabase() {
  if (db) return;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      language TEXT DEFAULT 'zh-TW',
      theme TEXT DEFAULT 'dark',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare("INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)").run('debug_overlay', 'false');

  db.exec(`
    CREATE TABLE IF NOT EXISTS module_config (
      name TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1
    )
  `);

  // --- Dictionary ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS dictionaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dict_chars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dictionary_id INTEGER NOT NULL,
      character TEXT NOT NULL,
      stroke_count INTEGER DEFAULT 0,
      UNIQUE(dictionary_id, character),
      FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dict_char_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(char_id, key),
      FOREIGN KEY (char_id) REFERENCES dict_chars(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dict_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dictionary_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      definition TEXT DEFAULT '',
      grammar TEXT DEFAULT '',
      level TEXT DEFAULT '',
      level_source TEXT DEFAULT '',
      UNIQUE(dictionary_id, word, level),
      FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dict_word_pronunciations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(word_id, type),
      FOREIGN KEY (word_id) REFERENCES dict_words(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dict_char_words (
      char_id INTEGER NOT NULL,
      word_id INTEGER NOT NULL,
      PRIMARY KEY (char_id, word_id),
      FOREIGN KEY (char_id) REFERENCES dict_chars(id) ON DELETE CASCADE,
      FOREIGN KEY (word_id) REFERENCES dict_words(id) ON DELETE CASCADE
    )
  `);

  // --- Character Stats (shared across modules) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS character_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      character TEXT NOT NULL,
      times_seen INTEGER DEFAULT 0,
      times_perfect INTEGER DEFAULT 0,
      times_correct INTEGER DEFAULT 0,
      times_incorrect INTEGER DEFAULT 0,
      times_hint_used INTEGER DEFAULT 0,
      streak_perfect INTEGER DEFAULT 0,
      streak_correct INTEGER DEFAULT 0,
      streak_incorrect INTEGER DEFAULT 0,
      best_streak_perfect INTEGER DEFAULT 0,
      best_streak_correct INTEGER DEFAULT 0,
      first_seen TEXT DEFAULT '',
      last_seen TEXT DEFAULT '',
      last_perfect TEXT DEFAULT '',
      last_correct TEXT DEFAULT '',
      last_incorrect TEXT DEFAULT '',
      fastest_ms INTEGER DEFAULT 0,
      slowest_ms INTEGER DEFAULT 0,
      total_ms INTEGER DEFAULT 0,
      last_result TEXT DEFAULT '',
      last_failed_strokes INTEGER DEFAULT 0,
      last_hint_used INTEGER DEFAULT 0,
      first_result TEXT DEFAULT '',
      recent_results TEXT DEFAULT '',
      UNIQUE(user_id, character),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_char_stats_user ON character_stats(user_id)`);

  // Indexes for dictionary lookups
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dict_chars_dict ON dict_chars(dictionary_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dict_words_dict ON dict_words(dictionary_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dict_char_words_char ON dict_char_words(char_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dict_char_words_word ON dict_char_words(word_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dict_char_meta_char ON dict_char_metadata(char_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dict_word_pron_word ON dict_word_pronunciations(word_id)`);
}

// --- Module Config ---

export function getModuleEnabled(name: string): boolean {
  const row = db.prepare('SELECT enabled FROM module_config WHERE name = ?').get(name) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true; // enabled by default
}

export function setModuleEnabled(name: string, enabled: boolean) {
  db.prepare(`
    INSERT INTO module_config (name, enabled) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET enabled = ?
  `).run(name, enabled ? 1 : 0, enabled ? 1 : 0);
}

export function getAllModuleConfig(): Record<string, boolean> {
  const rows = db.prepare('SELECT name, enabled FROM module_config').all() as { name: string; enabled: number }[];
  const config: Record<string, boolean> = {};
  for (const r of rows) config[r.name] = r.enabled === 1;
  return config;
}

// --- SQL Browser ---

export function runQuery(dbPath: string, sql: string): { columns: string[]; rows: unknown[][]; rowCount: number } | { error: string } {
  try {
    const conn = new Database(dbPath, { readonly: true });
    conn.pragma('journal_mode = WAL');
    const stmt = conn.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA') || sql.trim().toUpperCase().startsWith('WITH')) {
      const results = stmt.all() as Record<string, unknown>[];
      const columns = results.length > 0 ? Object.keys(results[0]) : [];
      const rows = results.map(r => columns.map(c => r[c]));
      conn.close();
      return { columns, rows, rowCount: results.length };
    }
    conn.close();
    return { error: 'Only SELECT, PRAGMA, and WITH queries allowed' };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function getDbPath() {
  return DB_PATH;
}

// --- Types ---

export interface User {
  id: number;
  name: string;
  displayName: string;
  createdAt: string;
}

export interface UserSettings {
  language: 'en' | 'zh-TW';
  theme: 'dark' | 'light';
}

interface UserRow {
  id: number;
  name: string;
  display_name: string;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    createdAt: row.created_at,
  };
}

// --- User CRUD ---

export function getAllUsers(): User[] {
  return (db.prepare('SELECT * FROM users ORDER BY name').all() as UserRow[]).map(rowToUser);
}

export function getUser(id: number): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByName(name: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE name = ?').get(name) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function createUser(name: string): User {
  const result = db.prepare('INSERT INTO users (name, display_name) VALUES (?, ?)').run(name, name);
  const id = result.lastInsertRowid as number;
  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(id);
  return getUser(id)!;
}

export function updateUser(id: number, updates: { displayName?: string }) {
  if (updates.displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(updates.displayName, id);
  }
}

export function deleteUser(id: number) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// --- Settings ---

export function getSettings(userId: number): UserSettings {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as
    { language: string; theme: string } | undefined;
  return {
    language: (row?.language as UserSettings['language']) || 'zh-TW',
    theme: (row?.theme as UserSettings['theme']) || 'dark',
  };
}

export function updateSettings(userId: number, settings: Partial<UserSettings>) {
  const current = getSettings(userId);
  const language = settings.language ?? current.language;
  const theme = settings.theme ?? current.theme;
  db.prepare(`
    INSERT INTO user_settings (user_id, language, theme) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET language = ?, theme = ?
  `).run(userId, language, theme, language, theme);
}

// --- Platform Settings ---

export function getPlatformSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setPlatformSetting(key: string, value: string) {
  db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

export function getAllPlatformSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM platform_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

// --- Dictionary ---

export function getPlatformDb() {
  return db;
}

export function getOrCreateDictionary(code: string, name: string): number {
  const existing = db.prepare('SELECT id FROM dictionaries WHERE code = ?').get(code) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare('INSERT INTO dictionaries (code, name) VALUES (?, ?)').run(code, name);
  return result.lastInsertRowid as number;
}

export function getDictionary(code: string): { id: number; code: string; name: string } | null {
  return db.prepare('SELECT * FROM dictionaries WHERE code = ?').get(code) as { id: number; code: string; name: string } | null;
}

export function getAllDictionaries(): { id: number; code: string; name: string }[] {
  return db.prepare('SELECT * FROM dictionaries ORDER BY code').all() as { id: number; code: string; name: string }[];
}

// --- Character Stats: now in @shared/character-stats ---
// Table schema remains in initDatabase(). Functions moved to shared package.
