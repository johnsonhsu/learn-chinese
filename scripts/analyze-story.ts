/**
 * Analyze a story/dialogue for sentence building potential and TOCFL/HSK coverage.
 * Reads from stdin.
 *
 * Usage: cat story.txt | npx tsx scripts/analyze-story.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_CHARS_PATH = join(__dirname, '..', 'modules', 'writing-challenge', 'src', 'data', 'base-chars.json');
// tocfl_words is platform-owned curriculum content now (content.db).
const DB_PATH = join(__dirname, '..', 'platform', 'content.db');

const baseChars = JSON.parse(readFileSync(BASE_CHARS_PATH, 'utf-8'));
const db = new Database(DB_PATH);

// Build HSK level map
const byLevel: Record<number, typeof baseChars> = {};
for (const c of baseChars) (byLevel[c.hskLevel] ||= []).push(c);
for (const level of Object.keys(byLevel)) {
  byLevel[Number(level)].sort((a: { frequency: { bookCharRank?: number; movieCharRank?: number } }, b: { frequency: { bookCharRank?: number; movieCharRank?: number } }) => {
    const ar = a.frequency.bookCharRank || a.frequency.movieCharRank || 99999;
    const br = b.frequency.bookCharRank || b.frequency.movieCharRank || 99999;
    return ar - br;
  });
}
const charLevel: Record<string, number> = {};
for (const [levelStr, chars] of Object.entries(byLevel)) {
  const level = Number(levelStr);
  const count = (chars as unknown[]).length;
  for (let i = 0; i < count; i++) {
    const frac = count > 1 ? Math.log(i + 1) / Math.log(count) : 0;
    charLevel[(chars as { char: string }[])[i].char] = Math.round((level + frac * 0.99) * 100) / 100;
  }
}

// TOCFL word lookup
const tocflWords = db.prepare('SELECT word, level, grammar, category, definition FROM tocfl_words').all() as { word: string; level: string; grammar: string; category: string; definition: string }[];
const tocflLookup: Record<string, typeof tocflWords[0]> = {};
for (const w of tocflWords) {
  for (const variant of w.word.split('/')) {
    if (!tocflLookup[variant]) tocflLookup[variant] = w;
  }
}

// Read story from stdin
const story = readFileSync('/dev/stdin', 'utf-8');

// Extract sentences — split on punctuation and newlines
const sentences = story
  .split(/[。！？；\n]+/)
  .map(s => s.replace(/[（）「」《》——]/g, '').replace(/^[A-Za-z\s*:：]+/, '').trim())
  .filter(s => {
    const chars = [...s].filter(c => /[\u4e00-\u9fff]/.test(c));
    return chars.length >= 3;
  });

// All chars
const charFreq: Record<string, number> = {};
let totalChars = 0;
for (const s of sentences) {
  for (const c of s) {
    if (/[\u4e00-\u9fff]/.test(c)) {
      charFreq[c] = (charFreq[c] || 0) + 1;
      totalChars++;
    }
  }
}
const uniqueChars = Object.keys(charFreq);

// HSK distribution
const hskDist: Record<number, number> = {};
let noHsk = 0;
for (const c of uniqueChars) {
  const lvl = Math.floor(charLevel[c] || 0);
  if (lvl === 0) noHsk++;
  else hskDist[lvl] = (hskDist[lvl] || 0) + 1;
}

console.log('=== OVERVIEW ===');
console.log('Sentences:', sentences.length);
console.log('Total char occurrences:', totalChars);
console.log('Unique chars:', uniqueChars.length);

console.log('\n=== CHAR HSK DISTRIBUTION ===');
for (const [l, c] of Object.entries(hskDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  HSK ${l}: ${c} chars`);
}
console.log(`  No HSK: ${noHsk} chars`);

// Find TOCFL words in text
const fullText = sentences.join('');
const foundTocfl: Record<string, { word: string; level: string; grammar: string; count: number }> = {};
for (const w of tocflWords) {
  for (const variant of w.word.split('/')) {
    if (variant.length >= 2 && fullText.includes(variant)) {
      if (!foundTocfl[variant]) {
        foundTocfl[variant] = { word: variant, level: w.level, grammar: w.grammar, count: 0 };
      }
      let idx = 0;
      while ((idx = fullText.indexOf(variant, idx)) !== -1) {
        foundTocfl[variant].count++;
        idx += variant.length;
      }
    }
  }
}

const tocflFound = Object.values(foundTocfl);
const tocflDist: Record<string, number> = {};
const tocflGrammar: Record<string, number> = {};
for (const w of tocflFound) {
  tocflDist[w.level] = (tocflDist[w.level] || 0) + 1;
  if (w.grammar) tocflGrammar[w.grammar] = (tocflGrammar[w.grammar] || 0) + 1;
}

console.log('\n=== TOCFL WORDS FOUND ===');
console.log('Unique TOCFL words in text:', tocflFound.length);
console.log('\nBy TOCFL level:');
for (const [l, c] of Object.entries(tocflDist).sort()) console.log(`  ${l}: ${c}`);
console.log('\nBy grammar:');
for (const [g, c] of Object.entries(tocflGrammar).sort((a, b) => b[1] - a[1])) console.log(`  ${g}: ${c}`);

// Top TOCFL words by frequency
console.log('\nTop 30 TOCFL words by occurrence:');
const topTocfl = tocflFound.sort((a, b) => b.count - a.count).slice(0, 30);
for (const w of topTocfl) {
  console.log(`  ${w.word.padEnd(8)} ${String(w.count).padStart(3)}x  ${w.level.padEnd(5)} ${w.grammar}`);
}

// Template candidates (4-13 chars)
const templateCandidates = sentences
  .map(s => {
    const chars = [...s].filter(c => /[\u4e00-\u9fff]/.test(c));
    const levels = chars.map(c => charLevel[c] || 0).filter(l => l > 0);
    const avg = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
    return { text: s, charCount: chars.length, avg: Math.round(avg * 100) / 100 };
  })
  .filter(s => s.charCount >= 4 && s.charCount <= 13)
  .sort((a, b) => a.avg - b.avg);

console.log(`\n=== TEMPLATE CANDIDATES (4-13 chars): ${templateCandidates.length} ===`);
for (const s of templateCandidates) {
  console.log(`  [${s.charCount}c avg=${s.avg}] ${s.text}`);
}

db.close();
