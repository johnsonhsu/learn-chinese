/**
 * Algorithmically generate sentences from a character set using word dictionary + templates.
 *
 * Usage: npx tsx scripts/generate-sentences-algo.ts [count]
 * Default: 30 sentences
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORD_DICT_PATH = join(__dirname, '..', 'input-lists', 'writing-challenge', 'dictionary_word_2025-12-27.jsonl');
const BASE_CHARS_PATH = join(__dirname, '..', 'modules', 'writing-challenge', 'src', 'data', 'base-chars.json');

const CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// --- Load data ---

interface DictWord {
  trad: string;
  gloss: string;
  pos?: string; // part of speech if available
}

function loadValidWords(charSet: Set<string>): DictWord[] {
  const lines = readFileSync(WORD_DICT_PATH, 'utf-8').split('\n').filter(Boolean);
  const seen = new Set<string>();
  const words: DictWord[] = [];

  for (const line of lines) {
    const entry = JSON.parse(line);
    const trad: string = entry.trad || '';
    if (seen.has(trad)) continue;

    const wordChars = [...trad].filter(c => CHAR_RE.test(c));
    if (wordChars.length < 1 || wordChars.length > 4) continue;
    if (!wordChars.every(c => charSet.has(c))) continue;

    seen.add(trad);
    words.push({
      trad,
      gloss: entry.gloss || '',
    });
  }
  return words;
}

// --- Categorize words ---

interface WordBank {
  pronouns: string[];
  nouns: string[];
  verbs: string[];
  adjectives: string[];
  adverbs: string[];
  particles: string[];
  locations: string[];
  timeWords: string[];
  phrases: string[];     // 3-4 char compounds
  allWords: DictWord[];
}

function categorize(words: DictWord[]): WordBank {
  const bank: WordBank = {
    pronouns: [], nouns: [], verbs: [], adjectives: [], adverbs: [],
    particles: [], locations: [], timeWords: [], phrases: [], allWords: words,
  };

  // Manual categorization based on known words from our set
  const cats: Record<string, string[]> = {
    pronouns: ['我', '你', '他', '她', '我們', '你們', '他們', '她們', '大家', '人家', '這', '這個', '那', '那個'],
    verbs: ['是', '有', '沒有', '要', '去', '來', '看', '說', '聽', '吃', '喝', '做', '喜歡', '到', '出', '會', '出來', '出去', '上來', '下去', '上去', '下來', '上學', '看書', '吃飯', '喝水', '做到', '說到', '對不對', '聽說'],
    nouns: ['人', '家', '朋友', '學校', '東西', '水', '飯', '書', '天', '地', '國', '中國', '大家', '人家', '中飯', '下水', '地下水', '一個人', '一家人', '中國人'],
    adjectives: ['大', '好', '很', '多', '對'],
    adverbs: ['不', '沒', '也', '都', '就', '很', '現在', '一'],
    particles: ['的', '了', '個', '們', '和', '在', '對'],
    locations: ['家', '學校', '裡', '上', '下', '這裡', '那裡', '家裡', '學校裡'],
    timeWords: ['今天', '現在', '上個', '下個'],
  };

  for (const [cat, list] of Object.entries(cats)) {
    (bank as Record<string, string[]>)[cat] = list.filter(w =>
      words.some(dw => dw.trad === w)
    );
  }

  // Phrases: 3-4 char words
  bank.phrases = words.filter(w => w.trad.length >= 3).map(w => w.trad);

  return bank;
}

// --- Sentence templates ---

type Template = (b: WordBank) => string | null;

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] || '';
}

function pickExcluding(arr: string[], exclude: Set<string>): string {
  const filtered = arr.filter(w => !exclude.has(w));
  return filtered[Math.floor(Math.random() * filtered.length)] || pick(arr);
}

const templates: Template[] = [
  // Subject + Verb + Object
  (b) => `${pick(b.pronouns)}${pick(['要', '去', '會', '喜歡'])}${pick(['吃飯', '喝水', '看書', '上學'])}`,
  // Subject + 在 + Location + Verb
  (b) => `${pick(b.pronouns)}在${pick(b.locations)}${pick(['看書', '吃飯', '喝水'])}`,
  // Subject + 很 + Adjective
  (b) => `${pick(b.pronouns)}${pick(['很', '不'])}喜歡${pick(['吃飯', '喝水', '看書', '這個'])}`,
  // Subject + 沒 + Verb
  (b) => `${pick(b.pronouns)}沒有${pick(['去', '來', '吃飯', '看書', '喝水'])}`,
  // Time + Subject + Verb
  (b) => `${pick(b.timeWords)}${pick(b.pronouns)}要去${pick(b.locations)}`,
  // Subject + 說 + clause
  (b) => `${pick(b.pronouns)}說${pick(b.pronouns)}${pick(['要去', '不在', '很好', '喜歡'])}`,
  // Subject + Verb + 了
  (b) => `${pick(b.pronouns)}${pick(['吃', '喝', '看', '聽', '去', '來', '到'])}了`,
  // Location + 有 + Noun
  (b) => `${pick(b.locations)}有${pick(['人', '水', '書', '飯', '東西', '朋友'])}`,
  // Subject + 和 + Subject + Verb
  (b) => `${pick(b.pronouns)}和${pick(['朋友', '大家', '他們'])}${pick(['一起', ''])}${pick(['去', '吃飯', '看書', '喝水'])}`,
  // Subject + 就 + Verb + 了
  (b) => `${pick(b.pronouns)}就${pick(['去', '來', '到', '出去', '出來'])}了`,
  // 是不是 question
  (b) => `${pick(b.pronouns)}是不是${pick(['要去', '喜歡', '在家', '在學校'])}`,
  // Subject + 都 + Verb
  (b) => `${pick(b.pronouns)}都${pick(['要', '會', '喜歡', '在'])}${pick(['吃飯', '看書', '喝水', '這裡'])}`,
  // 這/那 + 個 + Noun + 很 + Adj
  (b) => `${pick(['這個', '那個'])}${pick(['人', '東西', '地'])}${pick(['很大', '很好', '不對'])}`,
  // 對 + Subject + 來說
  (b) => `對${pick(b.pronouns)}來說${pick(['這個', '學校', '東西'])}${pick(['很好', '很大', '不對'])}`,
  // Longer: Time + Subject + 在 + Location + Verb + Object
  (b) => `${pick(b.timeWords)}${pick(b.pronouns)}在${pick(b.locations)}${pick(['吃飯', '看書', '喝水'])}`,
  // Subject + 不要 + Verb
  (b) => `${pick(b.pronouns)}不要${pick(['去', '吃', '喝', '看', '說', '出去'])}了`,
  // 一 + Verb + 就 + Verb
  (b) => `${pick(b.pronouns)}一${pick(['來', '到', '看', '說', '吃'])}就${pick(['去', '走', '出去', '喜歡'])}了`,
  // Subject + 也 + Verb
  (b) => `${pick(b.pronouns)}也要${pick(['去', '來', '吃飯', '看書', '喝水'])}`,
  // 有的...有的
  (b) => `有的人喜歡${pick(['吃飯', '看書', '喝水'])}`,
  // Phrase-based
  (b) => {
    const p = pick(b.phrases);
    return p ? p : null;
  },
];

function generateSentence(bank: WordBank): string | null {
  const template = templates[Math.floor(Math.random() * templates.length)];
  const result = template(bank);
  if (!result) return null;

  // Count Chinese chars
  const chars = [...result].filter(c => CHAR_RE.test(c));
  if (chars.length < 4 || chars.length > 13) return null;

  return result;
}

// --- Main ---

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

const targetCount = parseInt(process.argv[2] || '30');
const charSetStr = '我你他她的是在有不沒和很也都要去來看說聽吃喝做喜歡人家朋友學校東西水飯書今天現上下裡們一了這個中大國地到就出齣會對';
const charSet = new Set([...charSetStr]);

console.log(`Character set: ${charSet.size} unique chars`);
console.log('Loading word dictionary...');

const validWords = loadValidWords(charSet);
console.log(`Valid words: ${validWords.length}`);

const bank = categorize(validWords);
console.log(`Pronouns: ${bank.pronouns.length}, Verbs: ${bank.verbs.length}, Nouns: ${bank.nouns.length}`);
console.log(`Phrases: ${bank.phrases.length}\n`);

const baseChars: BaseChar[] = JSON.parse(readFileSync(BASE_CHARS_PATH, 'utf-8'));
const charLevelMap = buildCharLevelMap(baseChars);

const sentences: string[] = [];
const seen = new Set<string>();
let attempts = 0;

while (sentences.length < targetCount && attempts < targetCount * 20) {
  attempts++;
  const s = generateSentence(bank);
  if (!s || seen.has(s)) continue;
  seen.add(s);
  sentences.push(s);
}

console.log(`Generated ${sentences.length} sentences (${attempts} attempts)\n`);

for (let i = 0; i < sentences.length; i++) {
  const s = sentences[i];
  const chars = [...s].filter(c => CHAR_RE.test(c));
  const inSet = chars.filter(c => charSet.has(c));
  const outOfSet = chars.filter(c => !charSet.has(c));
  const pct = Math.round((inSet.length / chars.length) * 100);

  let outDetail = '';
  if (outOfSet.length > 0) {
    outDetail = ' OUT: ' + outOfSet.map(c => `${c}(${charLevelMap[c] || '?'})`).join(' ');
  }

  console.log(`${String(i + 1).padStart(2)}. ${s}  [${chars.length} chars, ${pct}% in-set${outDetail}]`);
}

// Summary
const allChars = sentences.flatMap(s => [...s].filter(c => CHAR_RE.test(c)));
const allIn = allChars.filter(c => charSet.has(c));
console.log(`\n--- Summary ---`);
console.log(`Total chars: ${allChars.length}, In-set: ${allIn.length} (${Math.round(allIn.length / allChars.length * 100)}%)`);

// Unique chars used from our set
const usedFromSet = new Set(allIn);
console.log(`Unique chars from set used: ${usedFromSet.size}/${charSet.size}`);
