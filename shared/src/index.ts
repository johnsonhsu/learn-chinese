/**
 * Shared character stats — single source of truth for character knowledge.
 * All modules import from here. Data lives in platform.db.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DB_PATH = join(__dirname, '..', '..', 'platform', 'platform.db');

let db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!db) {
    db = new Database(PLATFORM_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// --- Types ---

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
  totalMs: number;
  avgMs: number;
  lastResult: string;
  lastFailedStrokes: number;
  lastHintUsed: number;
  firstResult: string;
  recentResults: string;
}

export interface CharAttempt {
  result: 'perfect' | 'correct' | 'incorrect' | 'skip';
  failedStrokes: number;
  hintUsed: boolean;
  durationMs: number;
}

// Re-export pure mastery functions from the no-deps mastery module
export { computeTodayScore, computeRetention, computeMastery, masteryConfigFromSettings, DEFAULT_MASTERY_CONFIG, type MasteryConfig } from './mastery.js';

// --- Internal types ---

interface CharStatRow {
  id: number;
  user_id: number;
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
    totalMs: r.total_ms,
    avgMs: r.times_seen > 0 ? Math.round(r.total_ms / r.times_seen) : 0,
    lastResult: r.last_result,
    lastFailedStrokes: r.last_failed_strokes,
    lastHintUsed: r.last_hint_used,
    firstResult: r.first_result,
    recentResults: r.recent_results,
  };
}

// --- Public API ---

export function getCharacterStats(userId: number): CharacterStat[] {
  const rows = getDb().prepare(
    'SELECT * FROM character_stats WHERE user_id = ? ORDER BY last_seen DESC'
  ).all(userId) as CharStatRow[];
  return rows.map(rowToCharStat);
}

export function recordCharacterAttempt(userId: number, char: string, attempt: CharAttempt) {
  const db = getDb();
  const now = new Date().toISOString();
  const { result, failedStrokes, hintUsed, durationMs } = attempt;
  const resultCode = result === 'perfect' ? 'P' : result === 'correct' ? 'C' : result === 'skip' ? 'S' : 'I';

  const existing = db.prepare(
    'SELECT * FROM character_stats WHERE user_id = ? AND character = ?'
  ).get(userId, char) as CharStatRow | undefined;

  if (existing) {
    const isSkip = result === 'skip';
    const streakPerfect = isSkip ? existing.streak_perfect : (result === 'perfect' ? existing.streak_perfect + 1 : 0);
    const streakCorrect = isSkip ? existing.streak_correct : (result !== 'incorrect' ? existing.streak_correct + 1 : 0);
    const streakIncorrect = isSkip ? existing.streak_incorrect : (result === 'incorrect' ? existing.streak_incorrect + 1 : 0);
    const bestStreakPerfect = Math.max(existing.best_streak_perfect, streakPerfect);
    const bestStreakCorrect = Math.max(existing.best_streak_correct, streakCorrect);

    const fastestMs = durationMs > 0
      ? (existing.fastest_ms === 0 ? durationMs : Math.min(existing.fastest_ms, durationMs))
      : existing.fastest_ms;
    const slowestMs = durationMs > 0 ? Math.max(existing.slowest_ms, durationMs) : existing.slowest_ms;
    const addMs = durationMs > 0 ? durationMs : 0;

    const recent = (existing.recent_results ? existing.recent_results + ',' : '') + resultCode;
    const recentTrimmed = recent.split(',').slice(-10).join(',');

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
      WHERE user_id = ? AND character = ?
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
      userId, char,
    );
  } else {
    db.prepare(`
      INSERT INTO character_stats (
        user_id, character,
        times_seen, times_perfect, times_correct, times_incorrect, times_hint_used,
        streak_perfect, streak_correct, streak_incorrect,
        best_streak_perfect, best_streak_correct,
        first_seen, last_seen, last_perfect, last_correct, last_incorrect,
        fastest_ms, slowest_ms, total_ms,
        last_result, last_failed_strokes, last_hint_used,
        first_result, recent_results
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, char,
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
}
