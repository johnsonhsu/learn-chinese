import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isCharKnown, computeUserLevel, getTargetChars } from '../char-knowledge.js';
import { makeStat, knownStat, rankedChar } from './helpers.js';

const NOW = '2026-06-30T12:00:00Z';

describe('isCharKnown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it('is true when all three gates pass', () => {
    expect(isCharKnown(knownStat('好', NOW), {})).toBe(true);
  });

  it('condition 1: needs N-of-window recent good attempts', () => {
    const s = makeStat({ character: '好', timesSeen: 2, timesPerfect: 2, recentResults: 'P,P', lastSeen: NOW, lastPerfect: NOW });
    expect(isCharKnown(s, {})).toBe(false); // only 2 codes, needs 3
    expect(isCharKnown(s, { known_recent_enabled: 'false' })).toBe(true); // gate disabled
  });

  it('condition 2: needs retention >= threshold', () => {
    const onlyCond2 = { known_recent_enabled: 'false', known_recency_enabled: 'false' };
    const low = makeStat({ character: '好', timesSeen: 4, timesIncorrect: 4, recentResults: 'I,I,I,I', lastSeen: NOW });
    expect(isCharKnown(low, onlyCond2)).toBe(false);
    expect(isCharKnown(knownStat('好', NOW), onlyCond2)).toBe(true);
  });

  it('condition 3: needs a good result within the recency window', () => {
    const onlyCond3 = { known_recent_enabled: 'false', known_retention_enabled: 'false' };
    const stale = makeStat({ character: '好', timesSeen: 4, timesPerfect: 4, recentResults: 'P,P,P,P', lastPerfect: '2026-05-15T12:00:00Z' }); // ~46 days
    expect(isCharKnown(stale, onlyCond3)).toBe(false);
    expect(isCharKnown(stale, { ...onlyCond3, known_recency_days: '90' })).toBe(true);
  });
});

describe('computeUserLevel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it('level = highest N where known >= ceil(N * threshold)', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'].map((c, i) => rankedChar(c, i + 1));
    const stats = ['A', 'B', 'C'].map((c) => knownStat(c, NOW)); // D,E unknown
    const r = computeUserLevel(ranked, stats, {});
    expect(r.level).toBe(3);
    expect(r.knownInLevel).toBe(3);
    expect(r.totalInLevel).toBe(4); // ceil(4 * 0.8)
    expect(r.totalKnown).toBe(3);
    expect(r.totalRanked).toBe(5);
    expect(r.fluency).toBe(77); // floor(100 * sqrt(3/5))
  });
});

describe('getTargetChars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  const ranked = Array.from({ length: 10 }, (_, i) => rankedChar(String(i + 1), i + 1));

  it('returns the level..level+5 window of unknown chars at level 0', () => {
    const r = getTargetChars(ranked, [], {});
    expect(r.level).toBe(0);
    expect(r.chars).toEqual(['1', '2', '3', '4', '5']); // aheadEnd = level+5 floor
  });

  it('never includes an already-known char', () => {
    const stats = [knownStat('1', NOW)];
    const r = getTargetChars(ranked, stats, {});
    expect(r.chars).not.toContain('1');
    expect(r.chars.every((c) => c !== '1')).toBe(true);
  });
});
