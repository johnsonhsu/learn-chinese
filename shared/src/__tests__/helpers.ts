/** Shared test fixtures + utilities for the shared/src suites. */
import type { CharStat, RankedChar, DbQueryProvider } from '../types.js';

/** A fully-populated CharStat with zeroed defaults; override what a test cares about. */
export function makeStat(p: Partial<CharStat> & { character: string }): CharStat {
  return {
    // `character` (required on the param) is supplied by the `...p` spread below,
    // along with any other overrides; these zeroed fields are just the defaults.
    timesSeen: 0,
    timesPerfect: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    timesHintUsed: 0,
    streakPerfect: 0,
    streakCorrect: 0,
    streakIncorrect: 0,
    bestStreakPerfect: 0,
    bestStreakCorrect: 0,
    firstSeen: '',
    lastSeen: '',
    lastPerfect: '',
    lastCorrect: '',
    lastIncorrect: '',
    fastestMs: 0,
    slowestMs: 0,
    totalMs: 0,
    avgMs: 0,
    lastResult: '',
    lastFailedStrokes: 0,
    lastHintUsed: 0,
    firstResult: '',
    recentResults: '',
    ...p,
  };
}

/** A "known" stat: 4 recent perfects, seen today — passes all isCharKnown gates. */
export function knownStat(character: string, lastSeen: string): CharStat {
  return makeStat({
    character,
    timesSeen: 4,
    timesPerfect: 4,
    streakPerfect: 4,
    streakCorrect: 4,
    recentResults: 'P,P,P,P',
    lastSeen,
    lastPerfect: lastSeen,
  });
}

export function rankedChar(char: string, rank: number, tocflLevel = '第1級'): RankedChar {
  return { char, rank, tocflLevel, freqRank: rank, score: rank };
}

/** A DbQueryProvider whose queryAll returns a fixed row set (ranker tests) and
 *  whose queryOne is configurable. Defaults are empty so callers that don't care
 *  about the DB (e.g. the generator's zhuyin assembly) get harmless empties. */
export function fakeDb(opts: {
  all?: unknown[];
  one?: unknown;
} = {}): DbQueryProvider {
  return {
    queryAll: <T>() => (opts.all ?? []) as T[],
    queryOne: <T>() => (opts.one as T | undefined) ?? undefined,
    run: () => ({ changes: 0, lastId: 0 }),
  };
}

/** Deterministic PRNG (mulberry32) for replacing Math.random in coverage tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
