/**
 * Test sentence generation with a character set via Ollama.
 *
 * Usage: npx tsx scripts/test-sentence-gen.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_CHARS_PATH = join(__dirname, '..', 'modules', 'writing-challenge', 'src', 'data', 'base-chars.json');
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'kenneth85/llama-3-taiwan';

interface BaseChar {
  char: string;
  hskLevel: number;
  frequency: { bookCharRank?: number; movieCharRank?: number };
}

// Build effective level map
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

const CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

async function callOllama(prompt: string): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.8, num_predict: 6000 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.response || '';
}

interface Sentence {
  trad: string;
  english: string;
}

async function generateSentences(charSet: string[], count: number): Promise<Sentence[]> {
  const charList = charSet.join('');

  const prompt = `你是台灣人。用以下的字來寫${count}個繁體中文句子，每句4到13個中文字（不算標點符號）。

可以用的字：${charList}

盡量只用上面的字。每句要自然、口語。

回覆JSON array，每個物件有trad和english兩個欄位。`;

  console.log('Calling Ollama...');
  const response = await callOllama(prompt);
  console.log(`Response: ${response.length} chars\n`);

  // Try JSON first
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]).filter((s: Sentence) => s.trad && s.english);
      if (parsed.length > 0) return parsed;
    } catch { /* fall through to numbered list parsing */ }
  }

  // Parse numbered list: "1. 句子" or "1.句子"
  const lines = response.split('\n');
  const sentences: Sentence[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+[\.\、\s]+(.+)/);
    if (!match) continue;
    const text = match[1].trim();
    // Extract Chinese characters
    const chinese = [...text].filter(c => CHAR_RE.test(c) || /[，。！？、]/.test(c)).join('');
    if (chinese.length >= 4) {
      sentences.push({ trad: chinese, english: '' });
    }
  }
  return sentences;
}

// --- Main ---

const data: BaseChar[] = JSON.parse(readFileSync(BASE_CHARS_PATH, 'utf-8'));
const charLevelMap = buildCharLevelMap(data);

// The 57 chars from new user test
const charSet = [...'我你他她的是在有不沒和很也都要去來看說聽吃喝做喜歡人家朋友學校東西水飯書今天現上下裡們一了這個中大國地到就出齣會也你對'];
const unique = [...new Set(charSet)];
const charSetLookup = new Set(unique);

console.log(`Character set: ${unique.length} unique chars`);
console.log(unique.join(''));
console.log('');

const allSentences: Sentence[] = [];
let attempt = 0;

while (allSentences.length < 30 && attempt < 5) {
  attempt++;
  const remaining = 30 - allSentences.length;
  console.log(`--- Attempt ${attempt} (need ${remaining} more) ---`);
  const batch = await generateSentences(unique, remaining);
  console.log(`Got ${batch.length} sentences\n`);

  for (const s of batch) {
    const chars = [...s.trad].filter(c => CHAR_RE.test(c));
    if (chars.length < 4 || chars.length > 13) continue;
    // Deduplicate
    if (allSentences.some(existing => existing.trad === s.trad)) continue;
    allSentences.push(s);
  }
}

console.log(`\n=== Results: ${allSentences.length} sentences ===\n`);

for (let i = 0; i < allSentences.length; i++) {
  const s = allSentences[i];
  const chars = [...s.trad].filter(c => CHAR_RE.test(c));
  const inSet = chars.filter(c => charSetLookup.has(c));
  const outOfSet = chars.filter(c => !charSetLookup.has(c));

  const pct = Math.round((inSet.length / chars.length) * 100);

  let outDetail = '';
  if (outOfSet.length > 0) {
    outDetail = '  OUT: ' + outOfSet.map(c => {
      const lvl = charLevelMap[c];
      if (!lvl) return `${c}(?)`;
      return `${c}(${lvl})`;
    }).join(' ');
  }

  console.log(`${String(i + 1).padStart(2)}. ${s.trad}`);
  console.log(`    ${s.english}`);
  console.log(`    ${chars.length} chars, ${inSet.length} in set (${pct}%), ${outOfSet.length} out${outDetail}`);
  console.log('');
}

// Summary
const allCharsUsed = allSentences.flatMap(s => [...s.trad].filter(c => CHAR_RE.test(c)));
const allOut = allCharsUsed.filter(c => !charSetLookup.has(c));
const uniqueOut = [...new Set(allOut)];
console.log(`--- Summary ---`);
console.log(`Total chars used: ${allCharsUsed.length}`);
console.log(`In set: ${allCharsUsed.length - allOut.length} (${Math.round((1 - allOut.length / allCharsUsed.length) * 100)}%)`);
console.log(`Out of set: ${allOut.length} total, ${uniqueOut.length} unique`);
if (uniqueOut.length > 0) {
  console.log(`Out chars: ${uniqueOut.map(c => `${c}(${charLevelMap[c] || '?'})`).join(' ')}`);
}
