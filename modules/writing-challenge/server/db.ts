import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'writing-challenge.db');
let db: InstanceType<typeof Database>;

export function initDatabase() {
  if (db) return;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
}

function createSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    name TEXT UNIQUE NOT NULL,
    current_level INTEGER DEFAULT 1,
    assessed_level REAL DEFAULT -1,
    curriculum_position REAL DEFAULT 0,
    known_words TEXT DEFAULT '[]',
    completed_chars TEXT DEFAULT '[]',
    completed_words TEXT DEFAULT '[]',
    total_practiced INTEGER DEFAULT 0,
    total_quiz_passed INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_practice_date TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS character_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    character TEXT NOT NULL,

    -- counts
    times_seen INTEGER DEFAULT 0,
    times_perfect INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    times_incorrect INTEGER DEFAULT 0,
    times_hint_used INTEGER DEFAULT 0,

    -- streaks
    streak_perfect INTEGER DEFAULT 0,
    streak_correct INTEGER DEFAULT 0,
    streak_incorrect INTEGER DEFAULT 0,
    best_streak_perfect INTEGER DEFAULT 0,
    best_streak_correct INTEGER DEFAULT 0,

    -- timestamps
    first_seen TEXT DEFAULT '',
    last_seen TEXT DEFAULT '',
    last_perfect TEXT DEFAULT '',
    last_correct TEXT DEFAULT '',
    last_incorrect TEXT DEFAULT '',

    -- timing (milliseconds)
    fastest_ms INTEGER DEFAULT 0,
    slowest_ms INTEGER DEFAULT 0,
    total_ms INTEGER DEFAULT 0,

    -- last encounter
    last_result TEXT DEFAULT '',
    last_failed_strokes INTEGER DEFAULT 0,
    last_hint_used INTEGER DEFAULT 0,

    -- first encounter
    first_result TEXT DEFAULT '',

    -- regression detection (last 10 results: P/C/I)
    recent_results TEXT DEFAULT '',

    UNIQUE(profile_id, character),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS lesson_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    sentences TEXT DEFAULT '[]',
    results TEXT DEFAULT '[]',
    new_words TEXT DEFAULT '[]',
    summary TEXT DEFAULT '{}',
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    profile_id INTEGER PRIMARY KEY,
    session_size INTEGER DEFAULT 5,
    language TEXT DEFAULT 'zh-TW',
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);
try { db.exec(`ALTER TABLE user_settings ADD COLUMN language TEXT DEFAULT 'zh-TW'`); } catch { /* exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS active_lessons (
    profile_id INTEGER PRIMARY KEY,
    lesson_data TEXT NOT NULL,
    sentence_index INTEGER DEFAULT 0,
    char_index INTEGER DEFAULT 0,
    char_results TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    activity_type TEXT NOT NULL DEFAULT 'lesson',
    started_at TEXT,
    completed_at TEXT DEFAULT (datetime('now')),
    duration_seconds INTEGER,
    char_results TEXT DEFAULT '[]',
    new_words TEXT DEFAULT '[]',
    summary TEXT DEFAULT '{}',
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS module_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Default module settings
const defaults: Record<string, string> = {
  'stroke_leniency': '1.0',
  'strokes_per_fail': '3',
  'correct_weight': '0.6',
  'weight_recent': '50',
  'weight_overall': '30',
  'weight_streak': '20',
  'streak_cap': '5',
  'decay_per_day': '1',
  'decay_mode': 'scaled',
  'rank_freq_weight': '60',
  'rank_level_weight': '40',
  'max_word_level': '',
  'freq_model': 'book',
  'above_level_threshold': '30',
  'target_lookback_pct': '2',
  'target_lookahead_pct': '5',
  'target_include_gaps': 'true',
  'known_recent_enabled': 'true',
  'known_recent_good': '3',
  'known_recent_window': '4',
  'known_retention_enabled': 'true',
  'known_retention_min': '80',
  'known_recency_enabled': 'true',
  'known_recency_days': '30',
  'level_known_pct': '80',
  // Char-selection parity (read by sentence-generator; previously unseeded).
  'parity_need_cap': '4',
  'parity_recency_cap': '3',
  'parity_mastery_weight': '1.5',
  'parity_miss_boost': '1',
  'weight_incorrect_count': '5',
};
for (const [key, value] of Object.entries(defaults)) {
  db.prepare('INSERT OR IGNORE INTO module_settings (key, value) VALUES (?, ?)').run(key, value);
}

// Curriculum content (bank_sentences, tocfl_words, char_words) is platform-owned
// now and lives in platform/content.db — accessed via @shared/character-stats/
// content-db. This module DB carries only its own settings + per-profile tables.

db.exec(`
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,

    -- target
    target_word TEXT NOT NULL,
    associated_words TEXT DEFAULT '[]',

    -- timing
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,

    -- content
    sentences_shown INTEGER DEFAULT 0,
    chars_written INTEGER DEFAULT 0,
    unique_chars INTEGER DEFAULT 0,
    new_chars INTEGER DEFAULT 0,
    review_chars INTEGER DEFAULT 0,

    -- quality
    perfect_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    perfect_rate REAL DEFAULT 0,
    hit_skip_constraint INTEGER DEFAULT 0,

    -- progression snapshot (after session)
    tocfl_coverage TEXT DEFAULT '{}',
    movie_coverage REAL DEFAULT 0,
    book_coverage REAL DEFAULT 0,
    new_chars_unlocked TEXT DEFAULT '[]',
    new_words_unlocked TEXT DEFAULT '[]',
    chars_regressed TEXT DEFAULT '[]',

    -- status
    status TEXT DEFAULT 'active',

    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS practice_sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    profile_id INTEGER NOT NULL,

    -- content
    template_id INTEGER,
    sentence_text TEXT NOT NULL,
    slot_fills TEXT DEFAULT '{}',
    target_word TEXT DEFAULT '',

    -- timing
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,

    -- result
    completed INTEGER DEFAULT 0,
    abandoned INTEGER DEFAULT 0,
    chars_in_sentence INTEGER DEFAULT 0,
    perfect_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,

    -- per-char detail
    char_results TEXT DEFAULT '[]',

    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,

    -- aggregates (cross-session patterns)
    session_date TEXT DEFAULT (date('now')),
    sessions_count INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    words_learned INTEGER DEFAULT 0,
    chars_practiced INTEGER DEFAULT 0,
    avg_perfect_rate REAL DEFAULT 0,

    UNIQUE(profile_id, session_date),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
`);

// Migrate existing lesson_history into activity_log (one-time)
try {
  db.exec(`
    INSERT OR IGNORE INTO activity_log (profile_id, activity_type, started_at, completed_at, char_results, new_words, summary)
    SELECT profile_id, 'lesson', started_at, started_at, results, new_words, summary
    FROM lesson_history
  `);
} catch { /* lesson_history may not exist */ }


// Migrate existing profiles (add new columns if missing)
try { db.exec(`ALTER TABLE profiles ADD COLUMN assessed_level REAL DEFAULT -1`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE profiles ADD COLUMN known_words TEXT DEFAULT '[]'`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE profiles ADD COLUMN user_id INTEGER UNIQUE`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE profiles ADD COLUMN curriculum_position REAL DEFAULT 0`); } catch { /* already exists */ }
}

// --- Types ---
export interface ProfileRow {
  id: number;
  user_id: number | null;
  name: string;
  current_level: number;
  assessed_level: number;
  curriculum_position: number;
  known_words: string;
  completed_chars: string;
  completed_words: string;
  total_practiced: number;
  total_quiz_passed: number;
  streak_days: number;
  last_practice_date: string;
  created_at: string;
}

export interface ProfileData {
  id: number;
  name: string;
  currentLevel: number;
  assessedLevel: number;
  curriculumPosition: number;
  knownWords: string[];
  completedChars: string[];
  completedWords: string[];
  stats: {
    totalPracticed: number;
    totalQuizPassed: number;
    streakDays: number;
    lastPracticeDate: string;
  };
  createdAt: string;
}

export type CharResult = 'perfect' | 'correct' | 'incorrect' | 'skip';

export interface CharacterStat {
  character: string;
  timesSeen: number;
  timesPerfect: number;
  timesCorrect: number;
  timesIncorrect: number;
  timesHintUsed: number;
  streakPerfect: number;
  streakCorrect: number;
  streakIncorrect: number;
  bestStreakPerfect: number;
  bestStreakCorrect: number;
  firstSeen: string;
  lastSeen: string;
  lastPerfect: string;
  lastCorrect: string;
  lastIncorrect: string;
  fastestMs: number;
  slowestMs: number;
  avgMs: number;
  lastResult: CharResult | '';
  lastFailedStrokes: number;
  lastHintUsed: boolean;
  firstResult: CharResult | '';
  recentResults: string;
}

function rowToProfile(row: ProfileRow): ProfileData {
  return {
    id: row.id,
    name: row.name,
    currentLevel: row.current_level,
    assessedLevel: row.assessed_level,
    curriculumPosition: row.curriculum_position || 0,
    knownWords: JSON.parse(row.known_words || '[]'),
    completedChars: JSON.parse(row.completed_chars),
    completedWords: JSON.parse(row.completed_words),
    stats: {
      totalPracticed: row.total_practiced,
      totalQuizPassed: row.total_quiz_passed,
      streakDays: row.streak_days,
      lastPracticeDate: row.last_practice_date,
    },
    createdAt: row.created_at,
  };
}

// --- Profile CRUD ---
export function getAllProfiles(): ProfileData[] {
  return (db.prepare('SELECT * FROM profiles ORDER BY name').all() as ProfileRow[]).map(rowToProfile);
}

export function getProfile(id: number): ProfileData | null {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function getProfileByName(name: string): ProfileData | null {
  const row = db.prepare('SELECT * FROM profiles WHERE name = ?').get(name) as ProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function createProfile(name: string): ProfileData {
  const result = db.prepare('INSERT INTO profiles (name) VALUES (?)').run(name);
  const id = result.lastInsertRowid as number;
  db.prepare('INSERT INTO user_settings (profile_id) VALUES (?)').run(id);
  return getProfile(id)!;
}

export function getOrCreateProfile(userId: number): ProfileData {
  const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as ProfileRow | undefined;
  if (row) return rowToProfile(row);
  const result = db.prepare('INSERT INTO profiles (user_id, name) VALUES (?, ?)').run(userId, `user_${userId}`);
  const id = result.lastInsertRowid as number;
  db.prepare('INSERT OR IGNORE INTO user_settings (profile_id) VALUES (?)').run(id);
  return getProfile(id)!;
}

export function updateProfile(id: number, updates: Record<string, unknown>) {
  const columnMap: Record<string, string> = {
    name: 'name', currentLevel: 'current_level', assessedLevel: 'assessed_level', curriculumPosition: 'curriculum_position',
    knownWords: 'known_words', completedChars: 'completed_chars',
    completedWords: 'completed_words', totalPracticed: 'total_practiced',
    totalQuizPassed: 'total_quiz_passed', streakDays: 'streak_days',
    lastPracticeDate: 'last_practice_date',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(updates)) {
    const col = columnMap[key];
    if (!col) continue;
    sets.push(`${col} = ?`);
    values.push(Array.isArray(val) ? JSON.stringify(val) : val);
  }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteProfile(id: number) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

// --- Character Stats ---

interface CharStatRow {
  character: string;
  times_seen: number;
  times_perfect: number;
  times_correct: number;
  times_incorrect: number;
  times_hint_used: number;
  streak_perfect: number;
  streak_correct: number;
  streak_incorrect: number;
  best_streak_perfect: number;
  best_streak_correct: number;
  first_seen: string;
  last_seen: string;
  last_perfect: string;
  last_correct: string;
  last_incorrect: string;
  fastest_ms: number;
  slowest_ms: number;
  total_ms: number;
  last_result: string;
  last_failed_strokes: number;
  last_hint_used: number;
  first_result: string;
  recent_results: string;
}

function rowToCharStat(r: CharStatRow): CharacterStat {
  return {
    character: r.character,
    timesSeen: r.times_seen,
    timesPerfect: r.times_perfect,
    timesCorrect: r.times_correct,
    timesIncorrect: r.times_incorrect,
    timesHintUsed: r.times_hint_used,
    streakPerfect: r.streak_perfect,
    streakCorrect: r.streak_correct,
    streakIncorrect: r.streak_incorrect,
    bestStreakPerfect: r.best_streak_perfect,
    bestStreakCorrect: r.best_streak_correct,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    lastPerfect: r.last_perfect,
    lastCorrect: r.last_correct,
    lastIncorrect: r.last_incorrect,
    fastestMs: r.fastest_ms,
    slowestMs: r.slowest_ms,
    avgMs: r.times_seen > 0 ? Math.round(r.total_ms / r.times_seen) : 0,
    lastResult: (r.last_result || '') as CharResult | '',
    lastFailedStrokes: r.last_failed_strokes,
    lastHintUsed: r.last_hint_used === 1,
    firstResult: (r.first_result || '') as CharResult | '',
    recentResults: r.recent_results || '',
  };
}

export function getCharacterStats(profileId: number): CharacterStat[] {
  const rows = db.prepare(
    'SELECT * FROM character_stats WHERE profile_id = ? ORDER BY last_seen DESC'
  ).all(profileId) as CharStatRow[];
  return rows.map(rowToCharStat);
}

export function getCharacterStat(profileId: number, char: string): CharacterStat | null {
  const r = db.prepare(
    'SELECT * FROM character_stats WHERE profile_id = ? AND character = ?'
  ).get(profileId, char) as CharStatRow | undefined;
  return r ? rowToCharStat(r) : null;
}

export interface CharAttempt {
  result: CharResult;
  failedStrokes: number;
  hintUsed: boolean;
  durationMs: number;
}

export function recordCharacterAttempt(profileId: number, char: string, attempt: CharAttempt) {
  const now = new Date().toISOString();
  const { result, failedStrokes, hintUsed, durationMs } = attempt;
  const resultCode = result === 'perfect' ? 'P' : result === 'correct' ? 'C' : 'I';

  const existing = db.prepare(
    'SELECT * FROM character_stats WHERE profile_id = ? AND character = ?'
  ).get(profileId, char) as CharStatRow | undefined;

  if (existing) {
    // Streaks
    const streakPerfect = result === 'perfect' ? existing.streak_perfect + 1 : 0;
    const streakCorrect = result !== 'incorrect' ? existing.streak_correct + 1 : 0;
    const streakIncorrect = result === 'incorrect' ? existing.streak_incorrect + 1 : 0;
    const bestStreakPerfect = Math.max(existing.best_streak_perfect, streakPerfect);
    const bestStreakCorrect = Math.max(existing.best_streak_correct, streakCorrect);

    // Timing (skip if durationMs === 0, i.e. skipped chars)
    const fastestMs = durationMs > 0
      ? (existing.fastest_ms === 0 ? durationMs : Math.min(existing.fastest_ms, durationMs))
      : existing.fastest_ms;
    const slowestMs = durationMs > 0 ? Math.max(existing.slowest_ms, durationMs) : existing.slowest_ms;
    const addMs = durationMs > 0 ? durationMs : 0;

    // Recent results (keep last 10)
    const recent = (existing.recent_results ? existing.recent_results + ',' : '') + resultCode;
    const recentArr = recent.split(',');
    const recentTrimmed = recentArr.slice(-10).join(',');

    db.prepare(`
      UPDATE character_stats SET
        times_seen = times_seen + 1,
        times_perfect = times_perfect + ?,
        times_correct = times_correct + ?,
        times_incorrect = times_incorrect + ?,
        times_hint_used = times_hint_used + ?,
        streak_perfect = ?, streak_correct = ?, streak_incorrect = ?,
        best_streak_perfect = ?, best_streak_correct = ?,
        last_seen = ?,
        last_perfect = CASE WHEN ? = 'perfect' THEN ? ELSE last_perfect END,
        last_correct = CASE WHEN ? != 'incorrect' THEN ? ELSE last_correct END,
        last_incorrect = CASE WHEN ? = 'incorrect' THEN ? ELSE last_incorrect END,
        fastest_ms = ?, slowest_ms = ?, total_ms = total_ms + ?,
        last_result = ?, last_failed_strokes = ?, last_hint_used = ?,
        recent_results = ?
      WHERE profile_id = ? AND character = ?
    `).run(
      result === 'perfect' ? 1 : 0,
      result === 'correct' ? 1 : 0,
      result === 'incorrect' ? 1 : 0,
      hintUsed ? 1 : 0,
      streakPerfect, streakCorrect, streakIncorrect,
      bestStreakPerfect, bestStreakCorrect,
      now,
      result, now,
      result, now,
      result, now,
      fastestMs, slowestMs, addMs,
      result, failedStrokes, hintUsed ? 1 : 0,
      recentTrimmed,
      profileId, char,
    );
  } else {
    db.prepare(`
      INSERT INTO character_stats (
        profile_id, character,
        times_seen, times_perfect, times_correct, times_incorrect, times_hint_used,
        streak_perfect, streak_correct, streak_incorrect,
        best_streak_perfect, best_streak_correct,
        first_seen, last_seen, last_perfect, last_correct, last_incorrect,
        fastest_ms, slowest_ms, total_ms,
        last_result, last_failed_strokes, last_hint_used,
        first_result, recent_results
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profileId, char,
      result === 'perfect' ? 1 : 0,
      result === 'correct' ? 1 : 0,
      result === 'incorrect' ? 1 : 0,
      hintUsed ? 1 : 0,
      result === 'perfect' ? 1 : 0,
      result !== 'incorrect' ? 1 : 0,
      result === 'incorrect' ? 1 : 0,
      result === 'perfect' ? 1 : 0,
      result !== 'incorrect' ? 1 : 0,
      now, now,
      result === 'perfect' ? now : '',
      result !== 'incorrect' ? now : '',
      result === 'incorrect' ? now : '',
      durationMs > 0 ? durationMs : 0, durationMs > 0 ? durationMs : 0, durationMs > 0 ? durationMs : 0,
      result, failedStrokes, hintUsed ? 1 : 0,
      result, resultCode,
    );
  }

  // Update profile streak
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) as ProfileRow | undefined;
  if (row) {
    const today = now.slice(0, 10);
    let streak = row.streak_days;
    if (row.last_practice_date !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = row.last_practice_date === yesterday ? streak + 1 : 1;
    }
    db.prepare(`UPDATE profiles SET total_practiced = total_practiced + 1, streak_days = ?, last_practice_date = ? WHERE id = ?`)
      .run(streak, today, profileId);
  }
}


// --- User Settings ---
export interface UserSettings {
  sessionSize: number;
  language: 'en' | 'zh-TW';
}

export function getSettings(profileId: number): UserSettings {
  const row = db.prepare('SELECT * FROM user_settings WHERE profile_id = ?').get(profileId) as { session_size: number; language: string } | undefined;
  return {
    sessionSize: row?.session_size || 5,
    language: (row?.language as 'en' | 'zh-TW') || 'zh-TW',
  };
}

export function updateSettings(profileId: number, settings: Partial<UserSettings>) {
  const current = getSettings(profileId);
  const sessionSize = settings.sessionSize ?? current.sessionSize;
  const language = settings.language ?? current.language;
  db.prepare(`
    INSERT INTO user_settings (profile_id, session_size, language) VALUES (?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET session_size = ?, language = ?
  `).run(profileId, sessionSize, language, sessionSize, language);
}

// --- Activity Log ---
export interface ActivityLogEntry {
  id: number;
  profileId: number;
  activityType: string;
  startedAt: string | null;
  completedAt: string;
  durationSeconds: number | null;
  charResults: { char: string; mistakes: number }[];
  newWords: string[];
  summary: Record<string, unknown>;
}

export function saveActivityLog(
  profileId: number,
  activityType: string,
  startedAt: string | null,
  charResults: { char: string; mistakes: number }[],
  newWords: string[],
  summary: unknown,
) {
  const completedAt = new Date().toISOString();
  const durationSeconds = startedAt
    ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    : null;
  db.prepare(`
    INSERT INTO activity_log (profile_id, activity_type, started_at, completed_at, duration_seconds, char_results, new_words, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(profileId, activityType, startedAt, completedAt, durationSeconds, JSON.stringify(charResults), JSON.stringify(newWords), JSON.stringify(summary));
}

export function getActivityLog(profileId: number, limit = 50): ActivityLogEntry[] {
  const rows = db.prepare(
    'SELECT * FROM activity_log WHERE profile_id = ? ORDER BY completed_at DESC LIMIT ?'
  ).all(profileId, limit) as {
    id: number; profile_id: number; activity_type: string; started_at: string | null;
    completed_at: string; duration_seconds: number | null; char_results: string; new_words: string; summary: string;
  }[];
  return rows.map(r => ({
    id: r.id,
    profileId: r.profile_id,
    activityType: r.activity_type,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationSeconds: r.duration_seconds,
    charResults: JSON.parse(r.char_results || '[]'),
    newWords: JSON.parse(r.new_words || '[]'),
    summary: JSON.parse(r.summary || '{}'),
  }));
}

export function addKnownWords(profileId: number, words: string[]) {
  const row = db.prepare('SELECT known_words FROM profiles WHERE id = ?').get(profileId) as { known_words: string } | undefined;
  if (!row) return;
  const known: string[] = JSON.parse(row.known_words || '[]');
  for (const w of words) {
    if (!known.includes(w)) known.push(w);
  }
  db.prepare('UPDATE profiles SET known_words = ? WHERE id = ?').run(JSON.stringify(known), profileId);
}

// --- Active Lessons ---
export interface ActiveLessonState {
  lessonData: { lessonId: number; sentences: unknown[]; newWords: string[] };
  sentenceIndex: number;
  charIndex: number;
  charResults: { char: string; mistakes: number }[];
}

export function getActiveLesson(profileId: number): ActiveLessonState | null {
  const row = db.prepare('SELECT * FROM active_lessons WHERE profile_id = ?').get(profileId) as {
    lesson_data: string; sentence_index: number; char_index: number; char_results: string;
  } | undefined;
  if (!row) return null;
  return {
    lessonData: JSON.parse(row.lesson_data),
    sentenceIndex: row.sentence_index,
    charIndex: row.char_index,
    charResults: JSON.parse(row.char_results),
  };
}

export function saveActiveLesson(profileId: number, state: ActiveLessonState) {
  db.prepare(`
    INSERT INTO active_lessons (profile_id, lesson_data, sentence_index, char_index, char_results)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      lesson_data = ?, sentence_index = ?, char_index = ?, char_results = ?
  `).run(
    profileId,
    JSON.stringify(state.lessonData), state.sentenceIndex, state.charIndex, JSON.stringify(state.charResults),
    JSON.stringify(state.lessonData), state.sentenceIndex, state.charIndex, JSON.stringify(state.charResults),
  );
}

export function clearActiveLesson(profileId: number) {
  db.prepare('DELETE FROM active_lessons WHERE profile_id = ?').run(profileId);
}

export function getActiveLessonStartedAt(profileId: number): string | null {
  const row = db.prepare('SELECT created_at FROM active_lessons WHERE profile_id = ?').get(profileId) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export function getDb() { return db; }

// --- Module Settings ---

export function getModuleSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM module_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setModuleSetting(key: string, value: string) {
  db.prepare('INSERT INTO module_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

export function getAllModuleSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM module_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

// --- Practice Sessions ---

export interface PracticeSessionRow {
  id: number;
  profile_id: number;
  target_word: string;
  associated_words: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  sentences_shown: number;
  chars_written: number;
  unique_chars: number;
  new_chars: number;
  review_chars: number;
  perfect_count: number;
  correct_count: number;
  incorrect_count: number;
  perfect_rate: number;
  hit_skip_constraint: number;
  tocfl_coverage: string;
  movie_coverage: number;
  book_coverage: number;
  new_chars_unlocked: string;
  new_words_unlocked: string;
  chars_regressed: string;
  status: string;
}

export function createSession(profileId: number, targetWord: string): PracticeSessionRow {
  const result = db.prepare(
    'INSERT INTO practice_sessions (profile_id, target_word) VALUES (?, ?)'
  ).run(profileId, targetWord);
  return db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(result.lastInsertRowid) as PracticeSessionRow;
}

export function getActiveSession(profileId: number): PracticeSessionRow | null {
  return db.prepare(
    "SELECT * FROM practice_sessions WHERE profile_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
  ).get(profileId) as PracticeSessionRow | undefined || null;
}

export function updateSession(id: number, updates: Partial<PracticeSessionRow>) {
  const allowed = [
    'associated_words', 'completed_at', 'duration_ms', 'sentences_shown',
    'chars_written', 'unique_chars', 'new_chars', 'review_chars',
    'perfect_count', 'correct_count', 'incorrect_count', 'perfect_rate',
    'hit_skip_constraint', 'tocfl_coverage', 'movie_coverage', 'book_coverage',
    'new_chars_unlocked', 'new_words_unlocked', 'chars_regressed', 'status',
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(updates)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = ?`);
    values.push(typeof val === 'object' ? JSON.stringify(val) : val);
  }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE practice_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function getSessionHistory(profileId: number, limit = 50): PracticeSessionRow[] {
  return db.prepare(
    "SELECT * FROM practice_sessions WHERE profile_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT ?"
  ).all(profileId, limit) as PracticeSessionRow[];
}

// --- Practice Sentences ---

export interface PracticeSentenceRow {
  id: number;
  session_id: number;
  profile_id: number;
  template_id: number | null;
  sentence_text: string;
  slot_fills: string;
  target_word: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  completed: number;
  abandoned: number;
  chars_in_sentence: number;
  perfect_count: number;
  correct_count: number;
  incorrect_count: number;
  char_results: string;
}

export function createPracticeSentence(
  sessionId: number, profileId: number, templateId: number | null,
  sentenceText: string, slotFills: Record<string, string>, targetWord: string
): PracticeSentenceRow {
  const result = db.prepare(`
    INSERT INTO practice_sentences (session_id, profile_id, template_id, sentence_text, slot_fills, target_word, chars_in_sentence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId, profileId, templateId, sentenceText, JSON.stringify(slotFills), targetWord,
    [...sentenceText].filter(c => /[\u4e00-\u9fff]/.test(c)).length,
  );
  return db.prepare('SELECT * FROM practice_sentences WHERE id = ?').get(result.lastInsertRowid) as PracticeSentenceRow;
}

export function completePracticeSentence(
  id: number,
  results: { durationMs: number; completed: boolean; charResults: { char: string; result: string }[] }
) {
  const perfect = results.charResults.filter(r => r.result === 'perfect').length;
  const correct = results.charResults.filter(r => r.result === 'correct').length;
  const incorrect = results.charResults.filter(r => r.result === 'incorrect').length;

  db.prepare(`
    UPDATE practice_sentences SET
      completed_at = datetime('now'), duration_ms = ?,
      completed = ?, abandoned = ?,
      perfect_count = ?, correct_count = ?, incorrect_count = ?,
      char_results = ?
    WHERE id = ?
  `).run(
    results.durationMs,
    results.completed ? 1 : 0, results.completed ? 0 : 1,
    perfect, correct, incorrect,
    JSON.stringify(results.charResults),
    id,
  );
}

export function getSessionSentences(sessionId: number): PracticeSentenceRow[] {
  return db.prepare('SELECT * FROM practice_sentences WHERE session_id = ? ORDER BY id').all(sessionId) as PracticeSentenceRow[];
}

// --- Session History (daily aggregates) ---

export function updateDailyHistory(profileId: number, session: PracticeSessionRow) {
  const date = (session.completed_at || session.started_at).slice(0, 10);
  db.prepare(`
    INSERT INTO session_history (profile_id, session_date, sessions_count, total_duration_ms, words_learned, chars_practiced, avg_perfect_rate)
    VALUES (?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(profile_id, session_date) DO UPDATE SET
      sessions_count = sessions_count + 1,
      total_duration_ms = total_duration_ms + ?,
      words_learned = words_learned + ?,
      chars_practiced = chars_practiced + ?,
      avg_perfect_rate = (avg_perfect_rate * sessions_count + ?) / (sessions_count + 1)
  `).run(
    profileId, date,
    session.duration_ms,
    JSON.parse(session.new_words_unlocked || '[]').length,
    session.chars_written,
    session.perfect_rate,
    session.duration_ms,
    JSON.parse(session.new_words_unlocked || '[]').length,
    session.chars_written,
    session.perfect_rate,
  );
}

export function getDailyHistory(profileId: number, days = 30): { session_date: string; sessions_count: number; total_duration_ms: number; words_learned: number; chars_practiced: number; avg_perfect_rate: number }[] {
  return db.prepare(
    'SELECT * FROM session_history WHERE profile_id = ? ORDER BY session_date DESC LIMIT ?'
  ).all(profileId, days) as any[];
}
