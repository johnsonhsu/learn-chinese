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

  it('honors a non-default level_known_pct threshold (a lower bar raises level)', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'].map((c, i) => rankedChar(c, i + 1));
    const stats = ['A', 'B', 'C'].map((c) => knownStat(c, NOW)); // 3 of 5 known
    // At 60%: n=5 needs ceil(5*0.6)=3 known — satisfied — so the whole list clears.
    expect(computeUserLevel(ranked, stats, { level_known_pct: '60' }).level).toBe(5);
    // (Same inputs at the default 80% only reach level 3 — asserted above.)
  });

  it('level DROPS when fewer chars are known (decay out of "known")', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'].map((c, i) => rankedChar(c, i + 1));
    const three = ['A', 'B', 'C'].map((c) => knownStat(c, NOW));
    const two = ['A', 'B'].map((c) => knownStat(c, NOW)); // C decayed out
    expect(computeUserLevel(ranked, three, {}).level).toBe(3);
    // ceil(3*0.8)=3 > 2 known ⇒ can't hold level 3; ceil(2*0.8)=2 ⇒ falls to 2.
    expect(computeUserLevel(ranked, two, {}).level).toBe(2);
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

  // A 20-char corpus so the level+5 floor and the lookback window are exercised
  // away from the level-0 / list-end edges the cases above cover.
  const ranked20 = Array.from({ length: 20 }, (_, i) => rankedChar(String(i + 1), i + 1));

  it('applies the level+5 lookahead floor at a non-zero level', () => {
    // First 4 chars known ⇒ level 5; level*1.05=5.25 < level+5=10, so the +5
    // floor wins: aheadEnd=10, window = the unknown 5..10.
    const stats = ['1', '2', '3', '4'].map((c) => knownStat(c, NOW));
    const r = getTargetChars(ranked20, stats, {});
    expect(r.level).toBe(5);
    expect(r.chars).toEqual(['5', '6', '7', '8', '9', '10']);
  });

  it('target_include_gaps pulls below-level unknown chars; disabling it drops them', () => {
    // Known 1–8 and 10 ⇒ level 11, behindStart 10. Char 9 (rank 9) is an unknown
    // BELOW the window start — a "gap". It appears only when gaps are included.
    const known = ['1', '2', '3', '4', '5', '6', '7', '8', '10'].map((c) => knownStat(c, NOW));
    const withGaps = getTargetChars(ranked20, known, {});
    const noGaps = getTargetChars(ranked20, known, { target_include_gaps: 'false' });
    expect(withGaps.level).toBe(11);
    expect(withGaps.chars).toContain('9'); // the below-level gap is pulled back in
    expect(withGaps.chars).toEqual(['9', '11', '12', '13', '14', '15', '16']);
    expect(noGaps.chars).not.toContain('9'); // gap dropped when disabled
    expect(noGaps.chars).toEqual(['11', '12', '13', '14', '15', '16']);
  });
});
