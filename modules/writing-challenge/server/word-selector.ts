/**
 * Word Selection Algorithm — thin server wrapper.
 *
 * All business logic lives in @shared/character-stats/... modules.
 * This file:
 *  1. Creates DbQueryProvider wrappers around better-sqlite3
 *  2. Reads data from DB (settings, templates, merge fields, stats)
 *  3. Calls the shared pure functions
 *  4. Maintains the cache for ranked chars
 *  5. Exports the same public API as before
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { getAllModuleSettings } from './db.js';
import { getAllBankSentences } from '@shared/character-stats/content-db';
import { getCharacterStats as getPlatformCharacterStats, computeTodayScore as sharedComputeTodayScore, computeRetention as sharedComputeRetention, masteryConfigFromSettings, type MasteryConfig as SharedMasteryConfig } from '@shared/character-stats';
import type { DbQueryProvider, RankedChar, CharStat } from '@shared/character-stats/types';
import { getRankedChars as getRankedCharsShared } from '@shared/character-stats/char-ranker';
import { isCharKnown as isCharKnownShared, getTargetChars as getTargetCharsShared } from '@shared/character-stats/char-knowledge';
import { computeUserLevel as computeUserLevelShared } from '@shared/character-stats/char-knowledge';
import { generateNextSentence as generateNextSentenceShared } from '@shared/character-stats/sentence-generator';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- DbQueryProvider wrapper for better-sqlite3 ---

function betterSqliteProvider(db: InstanceType<typeof Database>): DbQueryProvider {
  return {
    queryAll: <T>(sql: string, params?: unknown[]) => db.prepare(sql).all(...(params || [])) as T[],
    queryOne: <T>(sql: string, params?: unknown[]) => db.prepare(sql).get(...(params || [])) as T | undefined,
    run: (sql: string, params?: unknown[]) => {
      const r = db.prepare(sql).run(...(params || []));
      return { changes: r.changes, lastId: Number(r.lastInsertRowid) };
    },
  };
}

// Curriculum content (tocfl_words) is platform-owned now (content.db); open it
// read-only for per-char zhuyin + TOCFL coverage.
const CONTENT_DB_PATH = join(__dirname, '..', '..', '..', 'platform', 'content.db');
function withContentDb<T>(fn: (db: InstanceType<typeof Database>) => T): T {
  const cdb = new Database(CONTENT_DB_PATH, { readonly: true });
  try { return fn(cdb); } finally { cdb.close(); }
}

// --- Char Ranking (cached) ---

let rankedCharsCache: RankedChar[] | null = null;

export function getRankedChars(): RankedChar[] {
  if (rankedCharsCache) return rankedCharsCache;

  const settings = getAllModuleSettings();
  const pdb = new Database(join(__dirname, '..', '..', '..', 'platform', 'platform.db'), { readonly: true });
  try {
    rankedCharsCache = getRankedCharsShared(betterSqliteProvider(pdb), settings);
  } finally {
    pdb.close();
  }
  return rankedCharsCache;
}

export function clearRankCache() {
  rankedCharsCache = null;
}

// --- Mastery Computation ---

type MasteryConfig = SharedMasteryConfig;

function getMasteryConfig(): MasteryConfig {
  return masteryConfigFromSettings(getAllModuleSettings());
}

export function getMasteryConfigPublic(): MasteryConfig {
  return getMasteryConfig();
}

// Re-export shared functions so existing callers keep working
export const computeTodayScore = sharedComputeTodayScore;
export const computeRetention = sharedComputeRetention;

// --- Char Knowledge ---

export function isCharKnown(stat: { recentResults: string; timesSeen: number; timesPerfect: number; timesCorrect: number; streakCorrect: number; lastSeen: string; lastPerfect: string; lastCorrect: string }): boolean {
  const settings = getAllModuleSettings();
  return isCharKnownShared(stat, settings);
}

// --- User Level ---

export function computeUserLevel(userId: number): { level: number; knownInLevel: number; totalInLevel: number; fluency: number; totalKnown: number; totalRanked: number } {
  const ranked = getRankedChars();
  const settings = getAllModuleSettings();
  const stats = getPlatformCharacterStats(userId) as CharStat[];
  return computeUserLevelShared(ranked, stats, settings);
}

// --- Target Chars ---

export function getTargetChars(userId: number): { chars: string[]; level: number; knownInLevel: number; totalInLevel: number; fluency: number; totalKnown: number } {
  const ranked = getRankedChars();
  const settings = getAllModuleSettings();
  const stats = getPlatformCharacterStats(userId) as CharStat[];
  return getTargetCharsShared(ranked, stats, settings);
}

// --- Next Sentence (practice flow) ---

export function generateNextSentence(userId: number): {
  text: string;
  english: string;
  templatePattern: string;
  slotFills: { name: string; value: string }[];
  targetChar: string;
  targetChars: string[];
  level: number;
  knownInLevel: number;
  totalInLevel: number;
  fluency: number;
  totalKnown: number;
  charRanks: Record<string, number>;
  charZhuyin: Record<string, string>;
  charMastery: Record<string, number>;
} | null {
  const ranked = getRankedChars();
  const settings = getAllModuleSettings();
  const stats = getPlatformCharacterStats(userId) as CharStat[];
  // Cut over to the sentence bank: the curated corpus is the only source.
  const bankSentences = getAllBankSentences().map((b) => ({ sentence: b.sentence, english: b.english }));

  const { chars: targetChars, level, knownInLevel, totalInLevel, fluency, totalKnown } = getTargetCharsShared(ranked, stats, settings);

  const pdb = new Database(join(__dirname, '..', '..', '..', 'platform', 'platform.db'), { readonly: true });
  const cdb = new Database(CONTENT_DB_PATH, { readonly: true });
  try {
    return generateNextSentenceShared({
      platformDb: betterSqliteProvider(pdb),
      contentDb: betterSqliteProvider(cdb),
      rankedChars: ranked,
      targetChars,
      level,
      knownInLevel,
      totalInLevel,
      fluency,
      totalKnown,
      stats,
      settings,
      bankSentences,
    });
  } finally {
    pdb.close();
    cdb.close();
  }
}

// --- Coverage ---

export function computeCoverage(userId: number): {
  tocfl: Record<string, { total: number; known: number; pct: number }>;
  moviePct: number;
  bookPct: number;
  totalCharsKnown: number;
  totalWordsUnlocked: number;
} {
  const stats = getPlatformCharacterStats(userId);
  const settings = getAllModuleSettings();
  const knownChars = new Set(
    stats.filter(s => isCharKnownShared(s, settings)).map(s => s.character),
  );

  const tocflLevels = ['第1級', '第1*級', '第2級', '第2*級', '第3級', '第3*級', '第4級', '第4*級', '第5級', '第6級', '第7級'];
  const tocflWords = withContentDb((cdb) =>
    cdb.prepare('SELECT word, level FROM tocfl_words').all() as { word: string; level: string }[],
  );

  const byLevel: Record<string, { total: number; known: number }> = {};
  for (const l of tocflLevels) byLevel[l] = { total: 0, known: 0 };

  let totalWordsUnlocked = 0;
  for (const w of tocflWords) {
    const word = w.word.split('/')[0];
    const chars = [...word].filter(c => /[\u4e00-\u9fff]/.test(c));
    if (chars.length === 0) continue;
    if (byLevel[w.level]) byLevel[w.level].total++;
    if (chars.every(c => knownChars.has(c))) {
      if (byLevel[w.level]) byLevel[w.level].known++;
      totalWordsUnlocked++;
    }
  }

  const tocfl: Record<string, { total: number; known: number; pct: number }> = {};
  for (const [l, v] of Object.entries(byLevel)) {
    tocfl[l] = { ...v, pct: v.total > 0 ? Math.round(v.known / v.total * 100) : 0 };
  }

  // Movie/book coverage weighted by inverse rank
  const baseChars = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', 'base-chars.json'), 'utf-8'));
  let totalMovieW = 0, knownMovieW = 0, totalBookW = 0, knownBookW = 0;
  for (const c of baseChars) {
    const mw = c.frequency?.movieCharRank ? 1 / c.frequency.movieCharRank : 0;
    const bw = c.frequency?.bookCharRank ? 1 / c.frequency.bookCharRank : 0;
    totalMovieW += mw;
    totalBookW += bw;
    if (knownChars.has(c.char)) {
      knownMovieW += mw;
      knownBookW += bw;
    }
  }

  return {
    tocfl,
    moviePct: totalMovieW > 0 ? Math.round(knownMovieW / totalMovieW * 100) : 0,
    bookPct: totalBookW > 0 ? Math.round(knownBookW / totalBookW * 100) : 0,
    totalCharsKnown: knownChars.size,
    totalWordsUnlocked,
  };
}
