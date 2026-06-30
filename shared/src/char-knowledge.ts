/**
 * Character knowledge computation — pure functions, no Node dependencies.
 * Determines whether a character is "known" and computes user level.
 */

import type { RankedChar, CharStat } from './types.js';
import { computeTodayScore, computeRetention, masteryConfigFromSettings } from './mastery.js';

/**
 * A char is "known" when ALL three conditions are met:
 * 1. At least N of last M attempts are correct/perfect (min N attempts)
 * 2. Mastery retention score >= threshold
 * 3. Last correct/perfect within N days
 */
export function isCharKnown(
  stat: { recentResults: string; timesSeen: number; timesPerfect: number; timesCorrect: number; streakCorrect: number; lastSeen: string; lastPerfect: string; lastCorrect: string },
  settings: Record<string, string>,
): boolean {
  // Condition 1: N of last M attempts correct/perfect (skips excluded)
  if (settings['known_recent_enabled'] !== 'false') {
    const needed = parseInt(settings['known_recent_good'] || '3');
    const window = parseInt(settings['known_recent_window'] || '4');
    const codes = stat.recentResults.split(',').filter(c => c && c !== 'S'); // exclude skips
    if (codes.length < needed) return false;
    const lastN = codes.slice(-window);
    const good = lastN.filter(c => c === 'P' || c === 'C').length;
    if (good < needed) return false;
  }

  // Condition 2: retention >= threshold
  if (settings['known_retention_enabled'] !== 'false') {
    const retentionMin = parseInt(settings['known_retention_min'] || '80');
    const cfg = masteryConfigFromSettings(settings);
    const today = computeTodayScore(stat, cfg);
    const retention = computeRetention(today, stat.lastSeen, cfg);
    if (retention < retentionMin) return false;
  }

  // Condition 3: last correct/perfect within N days
  if (settings['known_recency_enabled'] !== 'false') {
    const recencyDays = parseInt(settings['known_recency_days'] || '30');
    const lastGood = stat.lastPerfect > stat.lastCorrect ? stat.lastPerfect : stat.lastCorrect;
    if (!lastGood) return false;
    const daysSinceGood = Math.floor((Date.now() - new Date(lastGood).getTime()) / 86400000);
    if (daysSinceGood > recencyDays) return false;
  }

  return true;
}

/**
 * Level = highest N where user knows >= threshold% of the first N ranked chars.
 */
export function computeUserLevel(
  rankedChars: RankedChar[],
  stats: CharStat[],
  settings: Record<string, string>,
): { level: number; knownInLevel: number; totalInLevel: number; fluency: number; totalKnown: number; totalRanked: number } {
  const levelThreshold = parseInt(settings['level_known_pct'] || '80') / 100;
  const knownChars = new Set<string>();
  for (const s of stats) {
    if (isCharKnown(s, settings)) knownChars.add(s.character);
  }

  let level = 0;
  let known = 0;
  for (let i = 0; i < rankedChars.length; i++) {
    if (knownChars.has(rankedChars[i].char)) known++;
    const n = i + 1;
    if (known >= Math.ceil(n * levelThreshold)) {
      level = n;
    }
  }

  // Progress toward next level
  const nextN = level + 1;
  let knownInNext = 0;
  for (let i = 0; i < Math.min(nextN, rankedChars.length); i++) {
    if (knownChars.has(rankedChars[i].char)) knownInNext++;
  }
  const needed = Math.ceil(nextN * levelThreshold);

  // Fluency (0-100): RPG-style curve based on total known chars
  const totalKnown = knownChars.size;
  const totalRanked = rankedChars.length;
  const fluency = Math.min(100, Math.floor(100 * Math.sqrt(totalKnown / totalRanked)));

  return { level, knownInLevel: knownInNext, totalInLevel: needed, fluency, totalKnown, totalRanked };
}

/**
 * Collect chars from N% behind level to M% ahead that are not yet known.
 */
export function getTargetChars(
  rankedChars: RankedChar[],
  stats: CharStat[],
  settings: Record<string, string>,
): { chars: string[]; level: number; knownInLevel: number; totalInLevel: number; fluency: number; totalKnown: number } {
  const lookbackPct = parseInt(settings['target_lookback_pct'] || '2') / 100;
  const lookaheadPct = parseInt(settings['target_lookahead_pct'] || '5') / 100;

  const knownChars = new Set<string>();
  for (const s of stats) {
    if (isCharKnown(s, settings)) knownChars.add(s.character);
  }

  const { level, knownInLevel, totalInLevel, fluency, totalKnown } = computeUserLevel(rankedChars, stats, settings);

  const includeGaps = settings['target_include_gaps'] !== 'false';

  const behindStart = Math.max(0, Math.floor(level * (1 - lookbackPct)));
  const aheadEnd = Math.min(rankedChars.length, Math.ceil(Math.max(level * (1 + lookaheadPct), level + 5)));

  const targets: string[] = [];

  // Include all below-level unknown chars (gaps) if enabled
  if (includeGaps) {
    for (let i = 0; i < behindStart; i++) {
      if (!knownChars.has(rankedChars[i].char)) {
        targets.push(rankedChars[i].char);
      }
    }
  }

  // Standard window: lookback % to lookahead %
  for (let i = behindStart; i < aheadEnd; i++) {
    if (!knownChars.has(rankedChars[i].char)) {
      targets.push(rankedChars[i].char);
    }
  }

  return { chars: targets, level, knownInLevel, totalInLevel, fluency, totalKnown };
}
