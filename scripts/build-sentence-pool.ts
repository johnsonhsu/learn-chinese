/**
 * Generate a sentence pool from Ollama — no constraints, just natural conversation.
 * Split into sentences, deduplicate, analyze char levels.
 *
 * Usage: npx tsx scripts/build-sentence-pool.ts [rounds]
 * Default: 10 rounds
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_CHARS_PATH = join(__dirname, '..', 'modules', 'writing-challenge', 'src', 'data', 'base-chars.json');
const OUTPUT_PATH = join(__dirname, '..', 'modules', 'writing-challenge', 'sentence-pool.json');
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'kenneth85/llama-3-taiwan';

const CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

const prompts = [
  '寫一段300字的日常對話',
  '寫一段朋友之間聊天的對話，大概300字',
  '寫一段家人吃晚餐的對話',
  '寫一段在學校上課的對話',
  '寫一段去市場買東西的對話',
  '寫一段同事在辦公室聊天',
  '寫一段週末出去玩的對話',
  '寫一段看醫生的對話',
  '寫一段搭公車的對話',
  '寫一段在餐廳點餐的對話',
  '寫一段兩個鄰居聊天的對話',
  '寫一段接小孩放學的對話',
  '寫一段運動完休息的對話',
  '寫一段在圖書館的對話',
  '寫一段逛夜市的對話',
  '寫一段討論天氣的對話',
  '寫一段準備考試的對話',
  '寫一段旅行計畫的對話',
  '寫一段生日派對的對話',
  '寫一段搬新家的對話',
];

interface BaseChar {
  char: string;
  hskLevel: number;
  frequency: { bookCharRank?: number; movieCharRank?: number };
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

async function callOllama(prompt: string): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, prompt, stream: false,
      options: { temperature: 0.9, num_predict: 2000 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  return (await res.json()).response || '';
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/[。！？\n]+/)
    .map(s => {
      // Remove speaker labels like "A:" "B:" "甲：" etc
      let cleaned = s.replace(/^[A-Z\u4e00-\u9fff][:：]\s*/, '').trim();
      // Keep only Chinese chars and Chinese punctuation
      const chars = [...cleaned].filter(c => CHAR_RE.test(c) || /[，、]/.test(c));
      return chars.join('');
    })
    .filter(s => {
      const charCount = [...s].filter(c => CHAR_RE.test(c)).length;
      return charCount >= 4 && charCount <= 13;
    });
}

interface PoolSentence {
  trad: string;
  charCount: number;
  avgLevel: number;
  maxLevel: number;
  chars: { char: string; level: number }[];
}

// --- Main ---

const rounds = parseInt(process.argv[2] || '10');
const baseChars: BaseChar[] = JSON.parse(readFileSync(BASE_CHARS_PATH, 'utf-8'));
const charLevelMap = buildCharLevelMap(baseChars);

// Load existing pool
let pool: PoolSentence[] = [];
if (existsSync(OUTPUT_PATH)) {
  pool = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
  console.log(`Existing pool: ${pool.length} sentences`);
}
const seen = new Set(pool.map(s => s.trad));

console.log(`Running ${rounds} rounds with ${MODEL}\n`);

for (let i = 0; i < rounds; i++) {
  const prompt = prompts[i % prompts.length];
  console.log(`Round ${i + 1}/${rounds}: "${prompt}"`);

  try {
    const response = await callOllama(prompt);
    const sentences = splitIntoSentences(response);

    let added = 0;
    for (const trad of sentences) {
      if (seen.has(trad)) continue;
      seen.add(trad);

      const chars = [...trad].filter(c => CHAR_RE.test(c));
      const charData = chars.map(c => ({ char: c, level: charLevelMap[c] || 0 }));
      const levels = charData.map(c => c.level).filter(l => l > 0);

      pool.push({
        trad,
        charCount: chars.length,
        avgLevel: levels.length > 0 ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length * 100) / 100 : 0,
        maxLevel: levels.length > 0 ? Math.max(...levels) : 0,
        chars: charData,
      });
      added++;
    }
    console.log(`  ${sentences.length} sentences found, ${added} new (pool: ${pool.length})`);
  } catch (e) {
    console.log(`  Error: ${(e as Error).message}`);
  }
}

// Sort by avg level
pool.sort((a, b) => a.avgLevel - b.avgLevel);

// Save
writeFileSync(OUTPUT_PATH, JSON.stringify(pool, null, 2));
console.log(`\nSaved ${pool.length} sentences to ${OUTPUT_PATH}`);

// Stats
console.log('\n=== POOL STATS ===');
const buckets: Record<string, number> = {};
for (const s of pool) {
  const bucket = Math.floor(s.avgLevel).toString();
  buckets[bucket] = (buckets[bucket] || 0) + 1;
}
console.log('By avg HSK level:');
for (const [level, count] of Object.entries(buckets).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  HSK ${level}: ${count} sentences`);
}

// Unique chars
const allChars = new Set(pool.flatMap(s => s.chars.map(c => c.char)));
console.log(`\nUnique chars: ${allChars.size}`);

// Show some examples from each level
console.log('\n=== SAMPLES ===');
for (let level = 1; level <= 4; level++) {
  const levelSentences = pool.filter(s => s.avgLevel >= level && s.avgLevel < level + 1);
  console.log(`\nHSK ${level} range (${levelSentences.length} sentences):`);
  for (const s of levelSentences.slice(0, 5)) {
    console.log(`  [avg=${s.avgLevel} max=${s.maxLevel} ${s.charCount}c] ${s.trad}`);
  }
}
