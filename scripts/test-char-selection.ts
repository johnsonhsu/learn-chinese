/**
 * Test the character selection algorithm for sentence generation.
 *
 * Usage: npx tsx scripts/test-char-selection.ts [curriculumPosition] [lookahead]
 *
 * Defaults: position=1.0, lookahead=0.2
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_CHARS_PATH = join(__dirname, '..', 'modules', 'writing-challenge', 'src', 'data', 'base-chars.json');

interface BaseChar {
  char: string;
  hskLevel: number;
  frequency: { bookCharRank?: number; movieCharRank?: number };
}

interface CharStat {
  character: string;
  timesSeen: number;
  timesPerfect: number;
  timesCorrect: number;
  timesIncorrect: number;
  recentResults: string;
}

interface SelectionInput {
  curriculumPosition: number;
  lookahead: number;
  seedChars: string[];
  charStats: CharStat[];
}

function buildCharLevelMap(data: BaseChar[]): Record<string, number> {
  const byLevel: Record<number, BaseChar[]> = {};
  for (const c of data) (byLevel[c.hskLevel] ||= []).push(c);
  for (const level of Object.keys(byLevel)) {
    byLevel[Number(level)].sort((a, b) => {
      const aRank = a.frequency.bookCharRank || a.frequency.movieCharRank || 99999;
      const bRank = b.frequency.bookCharRank || b.frequency.movieCharRank || 99999;
      return aRank - bRank;
    });
  }
  const map: Record<string, number> = {};
  for (const [levelStr, chars] of Object.entries(byLevel)) {
    const level = Number(levelStr);
    const count = chars.length;
    for (let i = 0; i < count; i++) {
      const fraction = count > 1 ? Math.log(i + 1) / Math.log(count) : 0;
      map[chars[i].char] = Math.round((level + fraction * 0.99) * 100) / 100;
    }
  }
  return map;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function selectCharsForSentenceGeneration(
  input: SelectionInput,
  charLevelMap: Record<string, number>,
): { chars: string[]; breakdown: Record<string, string[]> } {
  const { curriculumPosition, lookahead, seedChars, charStats } = input;
  const selected = new Set<string>();
  const breakdown: Record<string, string[]> = {};

  const addChars = (label: string, chars: string[]) => {
    breakdown[label] = chars;
    for (const c of chars) selected.add(c);
  };

  const allChars = Object.entries(charLevelMap)
    .map(([char, level]) => ({ char, level }))
    .sort((a, b) => a.level - b.level);

  // 1. Seed chars
  addChars('seed', seedChars.filter(c => charLevelMap[c] !== undefined));

  // 2. Lookahead — minimum 30 chars or configured distance
  const MIN_LOOKAHEAD_CHARS = 30;
  const aheadChars = allChars.filter(c => c.level >= curriculumPosition);
  let effectiveLookahead = lookahead;
  const byDistance = aheadChars.filter(c => c.level < curriculumPosition + lookahead);
  if (byDistance.length < MIN_LOOKAHEAD_CHARS && aheadChars.length > 0) {
    const target = aheadChars.slice(0, MIN_LOOKAHEAD_CHARS);
    if (target.length > 0) {
      effectiveLookahead = Math.max(lookahead, target[target.length - 1].level - curriculumPosition + 0.01);
    }
  }
  const lookaheadChars = aheadChars
    .filter(c => c.level < curriculumPosition + effectiveLookahead)
    .map(c => c.char);
  addChars('lookahead', lookaheadChars);

  // 3. Mastered chars (ever perfected or corrected)
  const masteredChars = charStats
    .filter(s => s.timesPerfect > 0 || s.timesCorrect > 0)
    .map(s => s.character);
  addChars('mastered', masteredChars);

  // 4. Exposed but not mastered — split into thirds
  const exposedNotMastered = charStats
    .filter(s => s.timesSeen > 0 && s.timesPerfect === 0 && s.timesCorrect === 0);

  if (exposedNotMastered.length > 0) {
    const sorted = [...exposedNotMastered].sort((a, b) => {
      const aRate = (a.timesPerfect + a.timesCorrect) / a.timesSeen;
      const bRate = (b.timesPerfect + b.timesCorrect) / b.timesSeen;
      return aRate - bRate;
    });
    const third = Math.ceil(sorted.length / 3);
    const low = sorted.slice(0, third);
    const mid = sorted.slice(third, third * 2);
    const high = sorted.slice(third * 2);
    addChars('struggle_low', pickRandom(low.map(s => s.character), 2));
    addChars('struggle_mid', pickRandom(mid.map(s => s.character), 2));
    addChars('struggle_high', pickRandom(high.map(s => s.character), 2));
  }

  // 5. Random 20 from lower in current level
  const currentIntLevel = Math.floor(curriculumPosition);
  const lowerInLevel = allChars
    .filter(c => c.level >= currentIntLevel && c.level < curriculumPosition)
    .filter(c => !selected.has(c.char))
    .map(c => c.char);
  addChars('lower_in_level', pickRandom(lowerInLevel, 20));

  // 6. Random 1 char from each lower level
  const lowerLevels: Record<number, string[]> = {};
  for (const c of allChars) {
    const intLevel = Math.floor(c.level);
    if (intLevel < currentIntLevel && intLevel >= 1 && !selected.has(c.char)) {
      (lowerLevels[intLevel] ||= []).push(c.char);
    }
  }
  const fromLowerLevels: string[] = [];
  for (const [, chars] of Object.entries(lowerLevels).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    fromLowerLevels.push(...pickRandom(chars, 1));
  }
  addChars('lower_levels', fromLowerLevels);

  return { chars: [...selected], breakdown };
}

function printResult(label: string, input: SelectionInput, charLevelMap: Record<string, number>) {
  console.log(`\n=== ${label} ===`);
  console.log(`Position: ${input.curriculumPosition}, Lookahead: ${input.lookahead}`);
  console.log(`Seed: ${input.seedChars.length}, Stats: ${input.charStats.length}\n`);

  const { chars, breakdown } = selectCharsForSentenceGeneration(input, charLevelMap);

  for (const [cat, charList] of Object.entries(breakdown)) {
    if (charList.length === 0) continue;
    const detail = charList.map(c => `${c}(${charLevelMap[c]})`).join(' ');
    console.log(`${cat} (${charList.length}): ${detail}`);
  }
  console.log(`\nTotal unique: ${chars.length}`);
  console.log(chars.join(''));
}

// --- Main ---

const data: BaseChar[] = JSON.parse(readFileSync(BASE_CHARS_PATH, 'utf-8'));
const charLevelMap = buildCharLevelMap(data);
const seedChars = [...'我你他她的是在有不沒和很也都要去來看說聽吃喝做喜歡人家朋友學校東西水飯書今天現上下裡們'];

const position = parseFloat(process.argv[2] || '1.0');
const lookahead = parseFloat(process.argv[3] || '0.2');

// New user
printResult('New user (no stats)', {
  curriculumPosition: position,
  lookahead,
  seedChars,
  charStats: [],
}, charLevelMap);

// TestBot — assessed at 3.5, position 3.5, real stats from simulation
const testBotStats: CharStat[] = [
  { character: '結', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '誤', timesSeen: 2, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 1, recentResults: 'P,I' },
  { character: '論', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '假', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '導', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '致', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '設', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '錯', timesSeen: 2, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I,P' },
  { character: '了', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '嗎', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '今', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '你', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '吃', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '天', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '飽', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '書', timesSeen: 2, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 1, recentResults: 'C,I' },
  { character: '看', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '上', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '劃', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '我', timesSeen: 3, timesPerfect: 2, timesCorrect: 1, timesIncorrect: 0, recentResults: 'P,C,P' },
  { character: '晚', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '計', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '作', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '業', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '中', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '在', timesSeen: 2, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 1, recentResults: 'C,I' },
  { character: '寫', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '文', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '現', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '很', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '有', timesSeen: 1, timesPerfect: 0, timesCorrect: 1, timesIncorrect: 0, recentResults: 'C' },
  { character: '本', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '趣', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '這', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
  { character: '得', timesSeen: 1, timesPerfect: 1, timesCorrect: 0, timesIncorrect: 0, recentResults: 'P' },
  { character: '覺', timesSeen: 1, timesPerfect: 0, timesCorrect: 0, timesIncorrect: 1, recentResults: 'I' },
];

printResult('TestBot (assessed 3.5, 36 chars)', {
  curriculumPosition: 3.5,
  lookahead,
  seedChars,
  charStats: testBotStats,
}, charLevelMap);
