import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeTodayScore,
  computeRetention,
  computeMastery,
  masteryConfigFromSettings,
  DEFAULT_MASTERY_CONFIG,
  type MasteryConfig,
} from '../mastery.js';
import { makeStat } from './helpers.js';

const cfg = DEFAULT_MASTERY_CONFIG;

describe('masteryConfigFromSettings', () => {
  it('falls back to the documented defaults on empty settings', () => {
    expect(masteryConfigFromSettings({})).toEqual(DEFAULT_MASTERY_CONFIG);
  });

  it('parses overrides', () => {
    const c = masteryConfigFromSettings({
      correct_weight: '0.8',
      weight_recent: '40',
      decay_mode: 'flat',
    });
    expect(c.correctWeight).toBe(0.8);
    expect(c.weightRecent).toBe(40);
    expect(c.decayMode).toBe('flat');
  });
});

describe('computeTodayScore', () => {
  it('is 0 for a never-seen char', () => {
    expect(computeTodayScore(makeStat({ character: '一' }), cfg)).toBe(0);
  });

  it('is 0 when the only history is skips', () => {
    const s = makeStat({ character: '一', timesSeen: 2, recentResults: 'S,S' });
    expect(computeTodayScore(s, cfg)).toBe(0);
  });

  it('rewards a perfect history (recent + overall + streak)', () => {
    const s = makeStat({
      character: '一',
      timesSeen: 3,
      timesPerfect: 3,
      streakCorrect: 3,
      recentResults: 'P,P,P',
    });
    // recent=1*50 + overall=1*30 + streak=(3/5)*20=12  => 92
    expect(computeTodayScore(s, cfg)).toBe(92);
  });

  it('weights a single "correct" by correctWeight (0.6)', () => {
    const s = makeStat({
      character: '一',
      timesSeen: 1,
      timesCorrect: 1,
      streakCorrect: 1,
      recentResults: 'C',
    });
    // recent=0.6*50 + overall=0.6*30 + streak=(1/5)*20=4 => 52
    expect(computeTodayScore(s, cfg)).toBe(52);
  });

  it('is 0 for a lone incorrect attempt', () => {
    const s = makeStat({ character: '一', timesSeen: 1, recentResults: 'I' });
    expect(computeTodayScore(s, cfg)).toBe(0);
  });

  it('weights more-recent results higher than older ones', () => {
    const improving = makeStat({ character: '一', timesSeen: 2, timesPerfect: 1, timesIncorrect: 1, recentResults: 'I,P' });
    const declining = makeStat({ character: '一', timesSeen: 2, timesPerfect: 1, timesIncorrect: 1, recentResults: 'P,I' });
    expect(computeTodayScore(improving, cfg)).toBeGreaterThan(computeTodayScore(declining, cfg));
  });
});

describe('computeRetention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const flat: MasteryConfig = { ...cfg, decayMode: 'flat', decayPerDay: 1 };

  it('returns the score unchanged with no lastSeen', () => {
    expect(computeRetention(80, '', cfg)).toBe(80);
  });

  it('does not decay on the same day', () => {
    expect(computeRetention(80, '2026-06-30T01:00:00Z', cfg)).toBe(80);
  });

  it('applies flat per-day decay', () => {
    expect(computeRetention(100, '2026-06-29T12:00:00Z', flat)).toBe(99); // 1 day
    expect(computeRetention(100, '2026-06-28T12:00:00Z', flat)).toBe(98); // 2 days
  });

  it('scaled mode decays a high score more slowly than flat', () => {
    const scaled: MasteryConfig = { ...cfg, decayMode: 'scaled', decayPerDay: 1 };
    const days10 = '2026-06-20T12:00:00Z';
    expect(computeRetention(90, days10, scaled)).toBeGreaterThan(computeRetention(90, days10, flat));
  });

  it('clamps to [0, 100]', () => {
    const r = computeRetention(100, '2025-06-30T12:00:00Z', flat); // ~365 days
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

describe('computeMastery', () => {
  it('is 0 for an undefined stat', () => {
    expect(computeMastery(undefined, cfg)).toBe(0);
  });
});
