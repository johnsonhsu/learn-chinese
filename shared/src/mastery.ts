/**
 * Mastery / Retention computation — single source of truth.
 * Pure functions, no Node dependencies. Safe to import from client and server.
 */

export interface MasteryConfig {
  correctWeight: number;
  weightRecent: number;
  weightOverall: number;
  weightStreak: number;
  streakCap: number;
  decayPerDay: number;
  decayMode: 'flat' | 'scaled';
}

export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
  correctWeight: 0.6,
  weightRecent: 50,
  weightOverall: 30,
  weightStreak: 20,
  streakCap: 5,
  decayPerDay: 1,
  decayMode: 'scaled',
};

export function masteryConfigFromSettings(s: Record<string, string>): MasteryConfig {
  return {
    correctWeight: parseFloat(s['correct_weight'] || '0.6'),
    weightRecent: parseInt(s['weight_recent'] || '50'),
    weightOverall: parseInt(s['weight_overall'] || '30'),
    weightStreak: parseInt(s['weight_streak'] || '20'),
    streakCap: parseInt(s['streak_cap'] || '5'),
    decayPerDay: parseFloat(s['decay_per_day'] || '1'),
    decayMode: (s['decay_mode'] || 'scaled') as 'flat' | 'scaled',
  };
}

interface MasteryStat {
  timesSeen: number;
  timesPerfect: number;
  timesCorrect: number;
  streakCorrect: number;
  recentResults: string;
  lastSeen: string;
}

export function computeTodayScore(stat: MasteryStat, cfg: MasteryConfig): number {
  if (stat.timesSeen === 0) return 0;
  const allSkips = (stat.recentResults || '').split(',').every(c => !c || c === 'S');
  if (stat.timesPerfect === 0 && stat.timesCorrect === 0 && allSkips) return 0;

  const codes = (stat.recentResults || '').split(',').filter(c => c && c !== 'S');
  const recentScores = codes.map(r => r === 'P' ? 1 : r === 'C' ? cfg.correctWeight : 0);
  let recentScore = 0;
  if (recentScores.length > 0) {
    let wSum = 0, wTotal = 0;
    for (let i = 0; i < recentScores.length; i++) {
      const w = i + 1;
      wSum += recentScores[i] * w;
      wTotal += w;
    }
    recentScore = wSum / wTotal;
  }

  const realAttempts = stat.timesPerfect + stat.timesCorrect + ((stat.timesSeen - stat.timesPerfect - stat.timesCorrect) > 0 ? (stat.timesSeen - stat.timesPerfect - stat.timesCorrect) : 0);
  const realSeen = realAttempts > 0 ? realAttempts : 1;
  const overallScore = (stat.timesPerfect + stat.timesCorrect * cfg.correctWeight) / realSeen;
  const streakScore = Math.min(stat.streakCorrect / cfg.streakCap, 1);

  return Math.round(recentScore * cfg.weightRecent + overallScore * cfg.weightOverall + streakScore * cfg.weightStreak);
}

export function computeRetention(todayScore: number, lastSeen: string, cfg: MasteryConfig): number {
  if (!lastSeen) return todayScore;
  const days = Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000));
  if (days === 0) return todayScore;
  const rate = cfg.decayMode === 'scaled'
    ? (cfg.decayPerDay / 100) * (1 - todayScore / 200)
    : cfg.decayPerDay / 100;
  return Math.max(0, Math.min(100, Math.round(todayScore * Math.pow(1 - rate, days))));
}

export function computeMastery(stat: MasteryStat | undefined, cfg: MasteryConfig): number {
  if (!stat) return 0;
  const today = computeTodayScore(stat, cfg);
  return computeRetention(today, stat.lastSeen, cfg);
}
