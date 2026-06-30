import { Router } from 'express';
import { getOrCreateProfile, getAllModuleSettings, setModuleSetting, createSession, createPracticeSentence, completePracticeSentence, initDatabase } from './db.js';
import { getCharacterStats as getPlatformCharacterStats, recordCharacterAttempt as recordPlatformCharacterAttempt } from '@shared/character-stats';

export const routes = Router();

// --- Profile (by platform userId) ---

routes.get('/profile', (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const profile = getOrCreateProfile(userId);
  res.json(profile);
});

// --- Admin: User character stats ---

routes.get('/admin/user-stats', (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const profile = getOrCreateProfile(userId);
  const userLevel = computeUserLevel(userId);
  res.json({
    profile: { assessedLevel: profile.assessedLevel, currentLevel: profile.currentLevel },
    level: userLevel,
    charStats: getPlatformCharacterStats(userId),
  });
});

// --- Admin: Module settings ---

routes.get('/admin/settings', (_req, res) => {
  res.json(getAllModuleSettings());
});

routes.patch('/admin/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    setModuleSetting(key, String(value));
  }
  // Clear rank cache when weight or model settings change
  if (req.body['rank_freq_weight'] || req.body['rank_level_weight'] || req.body['freq_model']) {
    clearRankCache();
  }
  res.json(getAllModuleSettings());
});

// --- Practice Session ---

import { computeCoverage, getRankedChars, clearRankCache, computeUserLevel, generateNextSentence, getTargetChars, getMasteryConfigPublic, computeTodayScore, computeRetention } from './word-selector.js';

// --- Practice Flow: one word at a time ---

routes.post('/practice/next', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const profile = getOrCreateProfile(userId);

  const result = generateNextSentence(userId);
  if (!result) return res.status(400).json({ error: 'No sentences available. Check the sentence bank.' });

  // Store in a session
  const session = createSession(profile.id, result.targetChar);
  const stored = createPracticeSentence(
    session.id, profile.id, null,
    result.text, {},
    result.targetChar,
  );

  res.json({
    sessionId: session.id,
    sentenceId: stored.id,
    text: result.text,
    definition: result.english || '',
    templatePattern: result.templatePattern,
    slotFills: result.slotFills,
    zhuyin: '',
    targetChar: result.targetChar,
    targetChars: result.targetChars,
    level: result.level,
    knownInLevel: result.knownInLevel,
    totalInLevel: result.totalInLevel,
    charRanks: result.charRanks,
    charZhuyin: result.charZhuyin,
    charMastery: result.charMastery,
    fluency: result.fluency,
    totalKnown: result.totalKnown,
    aboveLevelThreshold: parseInt(getAllModuleSettings()['above_level_threshold'] || '30'),
  });
});

// Record results for a sentence and individual chars
routes.post('/practice/result', (req, res) => {
  const { userId, sentenceId, durationMs, charResults } = req.body;
  if (!userId || !sentenceId || !charResults) return res.status(400).json({ error: 'userId, sentenceId, charResults required' });
  getOrCreateProfile(userId); // ensure module profile exists

  completePracticeSentence(sentenceId, { durationMs: durationMs || 0, completed: true, charResults });

  for (const cr of charResults) {
    if (cr.char && cr.result) {
      recordPlatformCharacterAttempt(userId, cr.char, {
        result: cr.result,
        failedStrokes: cr.failedStrokes || 0,
        hintUsed: cr.hintUsed || false,
        durationMs: cr.durationMs || 0,
      });
    }
  }

  const { level, knownInLevel, totalInLevel, fluency, totalKnown } = computeUserLevel(userId);
  res.json({ level, knownInLevel, totalInLevel, fluency, totalKnown });
});

// Get coverage stats
routes.get('/coverage', (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  getOrCreateProfile(userId); // ensure module profile exists
  res.json(computeCoverage(userId));
});

// --- Debug overlay ---

routes.get('/debug-info', (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  getOrCreateProfile(userId); // ensure module profile exists
  const { level, knownInLevel, totalInLevel, fluency, totalKnown } = computeUserLevel(userId);
  const ranked = getRankedChars();

  // Show gaps within level range
  const stats = getPlatformCharacterStats(userId);
  const writtenChars = new Set(
    stats.filter(s => s.timesPerfect > 0 || s.timesCorrect > 0).map(s => s.character),
  );

  const gaps: { char: string; rank: number }[] = [];
  for (let i = 0; i < Math.min(level + 8, ranked.length); i++) {
    if (!writtenChars.has(ranked[i].char)) {
      gaps.push({ char: ranked[i].char, rank: ranked[i].rank });
    }
  }

  const { chars: targetChars } = getTargetChars(userId);

  // Mastery for target chars
  const cfg = getMasteryConfigPublic();
  const statMap: Record<string, typeof stats[number]> = {};
  for (const s of stats) statMap[s.character] = s;
  const charMastery: Record<string, number> = {};
  for (const c of targetChars) {
    const stat = statMap[c];
    if (stat) {
      const today = computeTodayScore(stat, cfg);
      charMastery[c] = computeRetention(today, stat.lastSeen, cfg);
    } else {
      charMastery[c] = 0;
    }
  }

  res.json({
    level,
    knownInLevel,
    totalInLevel,
    fluency,
    totalKnown,
    totalRanked: ranked.length,
    targetChars,
    charMastery,
    gaps: gaps.slice(0, 12),
  });
});

// --- Public: Per-char mastery score ---

routes.get('/char-mastery', (req, res) => {
  const userId = Number(req.query.userId);
  const char = String(req.query.char || '');
  if (!userId || !char) return res.status(400).json({ error: 'userId and char required' });
  const rank = getRankedChars().find(r => r.char === char)?.rank ?? null;
  const stats = getPlatformCharacterStats(userId);
  const stat = stats.find(s => s.character === char);
  if (!stat) return res.json({ mastery: 0, rank });
  const cfg = getMasteryConfigPublic();
  const today = computeTodayScore(stat, cfg);
  const mastery = computeRetention(today, stat.lastSeen, cfg);
  res.json({ mastery, rank });
});

// --- Public: Module settings (for frontend) ---

routes.get('/settings', (_req, res) => {
  res.json(getAllModuleSettings());
});

export function initDb() {
  initDatabase();
}
