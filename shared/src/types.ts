/**
 * Shared types for the learning-chinese app.
 * DbQueryProvider abstracts database access so business logic
 * can run against better-sqlite3 (server) or sql.js / wa-sqlite (PWA).
 */

export interface DbQueryProvider {
  queryAll<T>(sql: string, params?: any[]): T[];
  queryOne<T>(sql: string, params?: any[]): T | undefined;
  run(sql: string, params?: any[]): { changes: number; lastId: number };
}

export interface RankedChar {
  char: string;
  rank: number;
  tocflLevel: string;
  freqRank: number;
  score: number;
}

export interface CharStat {
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

export interface TemplateRow {
  id: number;
  pattern: string;
  example: string;
  slots: string;
  difficulty: number;
  english: string;
  created_at: string;
}

export interface MergeFieldRow {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export type { MasteryConfig } from './mastery.js';
