/**
 * Sentence selection — pure business logic, no Node dependencies.
 *
 * CUT OVER TO THE SENTENCE BANK: practice sentences come from the curated bank
 * (bank_sentences), not template generation. Selection is BINDING on a character
 * (parity weighting picks WHICH char to practice), then we pick the best bank
 * sentence that CONTAINS that char, scored by how well its other chars fit the
 * learner (in target pool + rank proximity; no penalty for above-level or recent).
 *
 * Template/merge-field generation has been removed.
 */

import type { DbQueryProvider, RankedChar, CharStat } from './types.js';
import { computeTodayScore, computeRetention, masteryConfigFromSettings } from './mastery.js';
import { pinyinToZhuyin, DISAMBIG } from './zhuyin.js';

const HAN = /[一-鿿]/;

// --- Helpers ---

export function pickWeighted<T>(items: T[], weights: number[]): T | undefined {
  if (items.length === 0) return undefined;
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- Types ---

export interface BankSentence {
  sentence: string;
  english: string;
}

export interface NextSentenceResult {
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
}

export interface GenerateNextSentenceParams {
  platformDb: DbQueryProvider;
  /** Curriculum content (tocfl_words for per-char zhuyin). Was the module DB;
   *  content is platform-owned now (content.db). */
  contentDb: DbQueryProvider;
  rankedChars: RankedChar[];
  targetChars: string[];
  level: number;
  knownInLevel: number;
  totalInLevel: number;
  fluency: number;
  totalKnown: number;
  stats: CharStat[];
  settings: Record<string, string>;
  /** The curated practice corpus — the single source of sentences. */
  bankSentences: BankSentence[];
  /** Recently-shown sentence texts to avoid repeating back-to-back. Excluded from
   *  candidate pools when picking the next sentence — UNLESS excluding them would
   *  leave no candidate for the chosen target char (then a repeat is allowed
   *  rather than failing). Kept per-session/in-memory by the caller. */
  excludeSentences?: string[];
}

// --- Main ---

export function generateNextSentence(params: GenerateNextSentenceParams): NextSentenceResult | null {
  const {
    platformDb,
    contentDb,
    rankedChars,
    targetChars,
    level,
    knownInLevel,
    totalInLevel,
    fluency,
    totalKnown,
    stats,
    settings,
    bankSentences,
    excludeSentences = [],
  } = params;

  if (targetChars.length === 0) return null;

  const rankMap = new Map(rankedChars.map(c => [c.char, c.rank]));
  const targetSet = new Set(targetChars);
  const excludeSet = new Set(excludeSentences);
  const masteryCfg = masteryConfigFromSettings(settings);

  const statsByChar: Record<string, CharStat> = {};
  for (const s of stats) statsByChar[s.character] = s;

  // --- Char selection weighting: bounded need x anti-starvation recency ---
  // Picks WHICH target char to practice. The goal is to practice every target
  // char, so weights are bounded (nothing starves) and stale chars rise back up.
  const needCap = parseFloat(settings['parity_need_cap'] || '4');
  const recencyCap = parseFloat(settings['parity_recency_cap'] || '3');
  const masteryNeedWeight = parseFloat(settings['parity_mastery_weight'] || '1.5');
  const missBoost = parseFloat(settings['parity_miss_boost'] || '1');
  const missWindow = parseInt(settings['weight_incorrect_count'] || '5');

  const lastSeenOf = (c: string) => statsByChar[c]?.lastSeen || ''; // '' => stalest
  const byStaleness = [...targetChars].sort((a, b) => lastSeenOf(a).localeCompare(lastSeenOf(b)));
  const recencyRank: Record<string, number> = {};
  byStaleness.forEach((c, i) => { recencyRank[c] = i; });
  const recencyDenom = Math.max(1, targetChars.length - 1);

  const weightOf = new Map<string, number>();
  targetChars.forEach(char => {
    const stat = statsByChar[char];
    let need = 1.0;
    if (stat) {
      const today = computeTodayScore(stat, masteryCfg);
      const mastery = computeRetention(today, stat.lastSeen, masteryCfg); // 0..100
      need += masteryNeedWeight * (1 - mastery / 100);
      const recent = stat.recentResults.split(',').slice(-missWindow);
      if (recent.some(r => r === 'I')) need += missBoost;
    } else {
      need += masteryNeedWeight; // never seen => maximum need
    }
    need = Math.min(need, needCap);

    const rrank = recencyRank[char] ?? 0;
    const recency = 1 + (recencyCap - 1) * (1 - rrank / recencyDenom);
    weightOf.set(char, Math.max(need * recency, 0.01));
  });

  // --- Bank index: target char -> bank sentences that CONTAIN it (hard filter) ---
  const byChar: Record<string, BankSentence[]> = {};
  for (const b of bankSentences) {
    const uniq = new Set([...b.sentence].filter(c => HAN.test(c)));
    for (const c of uniq) if (targetSet.has(c)) (byChar[c] ||= []).push(b);
  }

  // --- Sentence scoring (positive-only) ---
  // For a candidate containing target char T: reward other chars that are in the
  // target pool, mildly reward already-known chars, and reward chars whose rank is
  // CLOSE to T's. No penalty for above-level (leaps welcome) or recent (repetition welcome).
  const wPool = parseFloat(settings['bank_pool_weight'] || '3');
  const wKnown = parseFloat(settings['bank_known_weight'] || '1');
  const wNear = parseFloat(settings['bank_near_weight'] || '2');
  const nearScale = Math.max(1, parseFloat(settings['bank_near_scale'] || '400'));

  function scoreSentence(text: string, targetChar: string): number {
    const tRank = rankMap.get(targetChar) ?? 99999;
    const others = [...new Set([...text].filter(c => HAN.test(c)))].filter(c => c !== targetChar);
    let score = 0;
    for (const c of others) {
      const cRank = rankMap.get(c) ?? 99999;
      if (targetSet.has(c)) score += wPool;
      else if (cRank <= level) score += wKnown; // comfortable/known — fine
      // above-level chars: no bonus, no penalty
      score += wNear / (1 + Math.abs(cRank - tRank) / nearScale);
    }
    return score;
  }

  // --- Per-char rank/mastery/zhuyin assembly (shared by sentence + solo paths) ---
  function buildResult(
    text: string,
    english: string,
    chosenChar: string,
  ): NextSentenceResult {
    const uniq = [...new Set([...text].filter(c => HAN.test(c)))];

    const charRanks: Record<string, number> = {};
    const charMastery: Record<string, number> = {};
    for (const c of uniq) {
      charRanks[c] = rankMap.get(c) || 0;
      const stat = statsByChar[c];
      charMastery[c] = stat
        ? computeRetention(computeTodayScore(stat, masteryCfg), stat.lastSeen, masteryCfg)
        : 0;
    }

    const charZhuyin: Record<string, string> = {};
    if (uniq.length > 0) {
      const ph = uniq.map(() => '?').join(',');
      const rows = contentDb.queryAll<{ word: string; zhuyin: string }>(
        `SELECT word, zhuyin FROM tocfl_words WHERE word IN (${ph}) AND LENGTH(word) = 1`,
        uniq,
      );
      for (const r of rows) {
        if (!r.zhuyin || charZhuyin[r.word]) continue;
        const hint = DISAMBIG[r.word];
        charZhuyin[r.word] = hint ? `${r.zhuyin}(${hint})` : r.zhuyin;
      }
      const missing = uniq.filter(c => !charZhuyin[c]);
      if (missing.length > 0) {
        const ph2 = missing.map(() => '?').join(',');
        const pyRows = platformDb.queryAll<{ character: string; pinyin: string }>(
          `SELECT c.character, m.value as pinyin
           FROM dict_chars c
           JOIN dict_char_metadata m ON m.char_id = c.id
           WHERE c.dictionary_id = 1 AND m.key = 'pinyin' AND c.character IN (${ph2})`,
          missing,
        );
        for (const r of pyRows) {
          if (!r.pinyin) continue;
          const py = r.pinyin.split(/[,\s\/]/)[0].trim();
          const zh = pinyinToZhuyin(py);
          if (zh && zh !== py) {
            const hint = DISAMBIG[r.character];
            charZhuyin[r.character] = hint ? `${zh}(${hint})` : zh;
          }
        }
      }
    }

    return {
      text, english, templatePattern: '', slotFills: [],
      targetChar: chosenChar, targetChars,
      level, knownInLevel, totalInLevel, fluency, totalKnown,
      charRanks, charZhuyin, charMastery,
    };
  }

  // Best-scoring bank sentence containing `targetChar` (random tiebreak for variety).
  // Excludes recently-shown sentences so a reload/next won't repeat the last few.
  // FALLBACK: if excluding the recent ones leaves no candidate (e.g. the char
  // appears in only one bank sentence), allow the repeat rather than returning null.
  function pickBankSentenceFor(targetChar: string): NextSentenceResult | null {
    const all = byChar[targetChar];
    if (!all || all.length === 0) return null;
    const fresh = all.filter(b => !excludeSet.has(b.sentence));
    const cands = fresh.length > 0 ? fresh : all;
    let best: BankSentence | null = null;
    let bestScore = -Infinity;
    for (const b of [...cands].sort(() => Math.random() - 0.5)) {
      const s = scoreSentence(b.sentence, targetChar);
      if (s > bestScore) { bestScore = s; best = b; }
    }
    return best ? buildResult(best.sentence, best.english, targetChar) : null;
  }

  // Best-effort single-char gloss for the solo fallback.
  function singleCharGloss(char: string): string {
    try {
      const row = platformDb.queryOne<{ definition: string }>(
        `SELECT definition FROM dict_words WHERE dictionary_id = 1 AND word = ? ORDER BY LENGTH(word) LIMIT 1`,
        [char],
      );
      return row?.definition ? row.definition.split(/[,;(]/)[0].trim() : '';
    } catch { return ''; }
  }

  // --- Selection ---
  // Prefer target chars that HAVE bank coverage (so a real sentence is shown),
  // weighted by parity need.
  const withBank = targetChars.filter(c => byChar[c]?.length);
  if (withBank.length > 0) {
    const chosen = pickWeighted(withBank, withBank.map(c => weightOf.get(c) ?? 0.01)) ?? withBank[0];
    const res = pickBankSentenceFor(chosen);
    if (res) return res;
  }

  // No target char is covered by the bank → pick the HIGHEST-SCORING sentence
  // overall, anchored on its char closest to the learner's level (the most
  // relevant char to practice). Still a real sentence, never a lone character.
  if (bankSentences.length > 0) {
    // Prefer non-recent sentences; fall back to the full pool if exclusion empties it.
    const fresh = bankSentences.filter(b => !excludeSet.has(b.sentence));
    const pool = fresh.length > 0 ? fresh : bankSentences;
    let best: BankSentence | null = null;
    let bestScore = -Infinity;
    let bestAnchor = '';
    for (const b of pool) {
      const chars = [...new Set([...b.sentence].filter(c => HAN.test(c)))];
      if (chars.length === 0) continue;
      let anchor = chars[0];
      let anchorDist = Infinity;
      for (const c of chars) {
        const dist = Math.abs((rankMap.get(c) ?? 99999) - level);
        if (dist < anchorDist) { anchorDist = dist; anchor = c; }
      }
      const score = scoreSentence(b.sentence, anchor);
      if (score > bestScore) { bestScore = score; best = b; bestAnchor = anchor; }
    }
    if (best) return buildResult(best.sentence, best.english, bestAnchor);
  }

  // Absolute last resort (bank empty): practice the neediest target char solo.
  const solo = pickWeighted(targetChars, targetChars.map(c => weightOf.get(c) ?? 0.01)) ?? targetChars[0];
  return buildResult(solo, singleCharGloss(solo), solo);
}
