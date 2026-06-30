import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LISTS_DIR = join(__dirname, '..', '..', '..', 'input-lists', 'writing-challenge');
const DATA_DIR = join(__dirname, '..', 'src', 'data');

function findLatestFile(prefix: string): string | null {
  const files = readdirSync(LISTS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.jsonl'))
    .sort()
    .reverse();
  return files[0] ? join(LISTS_DIR, files[0]) : null;
}

function readJsonl<T>(path: string): T[] {
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

// --- Characters ---
interface CharEntry {
  char: string;
  strokeCount?: number;
  gloss?: string;
  pinyinFrequencies?: { pinyin: string; count: number }[];
  components?: { character: string; type: string[]; hint?: string }[];
  hint?: string;
  sources?: string[];
  simpVariants?: string[];
  variantOf?: string;
  statistics?: {
    hskLevel?: number;
    movieCharRank?: number;
    bookCharRank?: number;
  };
}

interface CharOutput {
  strokeCount: number;
  gloss: string;
  pinyin: string;
  hint: string;
}

function buildCharacters() {
  const file = findLatestFile('dictionary_char');
  if (!file) { console.error('No character dictionary found'); process.exit(1); }
  console.log(`Reading characters from ${file}...`);

  const entries = readJsonl<CharEntry>(file);
  const chars: Record<string, CharOutput> = {};
  let count = 0;

  for (const e of entries) {
    if (!e.char || e.char.length !== 1) continue;
    // Skip ultra-rare chars with only unicode source
    if (e.sources?.length === 1 && e.sources[0] === 'unicode' && !e.gloss) continue;

    const pinyin = e.pinyinFrequencies?.[0]?.pinyin || '';
    chars[e.char] = {
      strokeCount: e.strokeCount || 0,
      gloss: e.gloss || '',
      pinyin,
      hint: e.hint || '',
    };
    count++;
  }

  writeFileSync(join(DATA_DIR, 'characters.json'), JSON.stringify(chars));
  console.log(`  → ${count} characters written`);
}

// --- Chars by level ---
interface CharsByLevelEntry {
  trad: string;
  pinyin: string;
  gloss: string;
  strokeCount: number;
  charRank: number;
}

function buildCharsByLevel() {
  const file = findLatestFile('dictionary_char');
  if (!file) { console.error('No character dictionary found'); process.exit(1); }
  console.log(`Building chars-by-level from ${file}...`);

  const entries = readJsonl<CharEntry>(file);

  // Load characters.json as metadata lookup (strokeCount, pinyin, gloss)
  const charMeta: Record<string, CharOutput> = JSON.parse(
    readFileSync(join(DATA_DIR, 'characters.json'), 'utf-8')
  );

  // Phase 1: build simp → best trad map
  // For each simplified char, find the best canonical Traditional form
  const simpToBestTrad = new Map<string, { trad: string; rank: number }>();
  const STROKE_SOURCES = new Set(['makemeahanzi', 'dong-chinese']);

  for (const e of entries) {
    if (!e.char || e.char.length !== 1) continue;
    if (e.variantOf) continue; // skip variant forms
    if (!e.simpVariants || e.simpVariants.length === 0) continue;
    if (!e.sources?.some(s => STROKE_SOURCES.has(s))) continue; // require stroke-order data

    const rank = Math.min(e.statistics?.movieCharRank ?? 999999, e.statistics?.bookCharRank ?? 999999);
    for (const simp of e.simpVariants) {
      const current = simpToBestTrad.get(simp);
      if (!current || rank < current.rank) {
        simpToBestTrad.set(simp, { trad: e.char, rank });
      }
    }
  }

  // Phase 2: collect final character set grouped by HSK level
  const levels: Record<string, Map<string, CharsByLevelEntry>> = {
    '1': new Map(), '2': new Map(), '3': new Map(),
    '4': new Map(), '5': new Map(), '6': new Map(),
  };
  let count = 0;

  for (const e of entries) {
    if (!e.char || e.char.length !== 1) continue;
    if (e.variantOf) continue; // skip variant forms
    const hsk = e.statistics?.hskLevel;
    if (!hsk || hsk < 1 || hsk > 6) continue;

    // Resolve to canonical Traditional form
    const bestTrad = simpToBestTrad.get(e.char);
    const canonical = bestTrad ? bestTrad.trad : e.char;

    const charRank = Math.min(
      e.statistics?.movieCharRank ?? 999999,
      e.statistics?.bookCharRank ?? 999999
    );

    const levelMap = levels[String(hsk)];
    const existing = levelMap.get(canonical);
    // If already present, keep the entry with the lower (better) HSK level
    if (existing && existing.charRank <= charRank) continue;

    // Phase 3: attach metadata from characters.json
    const meta = charMeta[canonical];
    levelMap.set(canonical, {
      trad: canonical,
      pinyin: meta?.pinyin || e.pinyinFrequencies?.[0]?.pinyin || '',
      gloss: meta?.gloss || e.gloss || '',
      strokeCount: meta?.strokeCount || e.strokeCount || 0,
      charRank,
    });
    count++;
  }

  // Phase 4: sort each level by charRank, write output
  const output: Record<string, CharsByLevelEntry[]> = {};
  for (const [level, map] of Object.entries(levels)) {
    output[level] = Array.from(map.values()).sort((a, b) => a.charRank - b.charRank);
  }

  writeFileSync(join(DATA_DIR, 'chars-by-level.json'), JSON.stringify(output));
  console.log(`  → ${count} characters written`);
  for (const [level, chars] of Object.entries(output)) {
    console.log(`    HSK ${level}: ${chars.length} chars  (top 3: ${chars.slice(0,3).map(c=>c.trad).join(' ')})`);
  }
}

// --- Words by level ---
interface WordEntry {
  simp: string;
  trad: string;
  items?: { pinyin?: string; definitions?: string[] }[];
  gloss?: string;
  statistics?: {
    hskLevel?: number;
    movieWordRank?: number;
    bookWordRank?: number;
  };
}

interface WordOutput {
  simp: string;
  trad: string;
  pinyin: string;
  gloss: string;
  frequency: number;
}

function buildWordsByLevel() {
  const file = findLatestFile('dictionary_word');
  if (!file) { console.error('No word dictionary found'); process.exit(1); }
  console.log(`Reading words from ${file}...`);

  const entries = readJsonl<WordEntry>(file);
  const levels: Record<string, WordOutput[]> = {
    '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], 'other': [],
  };
  let count = 0;

  for (const e of entries) {
    if (!e.trad) continue;
    const hsk = e.statistics?.hskLevel;
    const level = (hsk && hsk >= 1 && hsk <= 6) ? String(hsk) : 'other';
    const pinyin = e.items?.[0]?.pinyin || '';
    const gloss = e.gloss || e.items?.[0]?.definitions?.[0] || '';
    // Use movie rank as primary frequency (lower = more common)
    const movieRank = e.statistics?.movieWordRank || 999999;
    const bookRank = e.statistics?.bookWordRank || 999999;
    const frequency = Math.min(movieRank, bookRank);

    levels[level].push({ simp: e.simp, trad: e.trad, pinyin, gloss, frequency });
    count++;
  }

  // Sort each level by frequency (lower rank = more common = first)
  for (const level of Object.keys(levels)) {
    levels[level].sort((a, b) => a.frequency - b.frequency);
  }

  writeFileSync(join(DATA_DIR, 'words-by-level.json'), JSON.stringify(levels));

  console.log(`  → ${count} words written`);
  for (const [level, words] of Object.entries(levels)) {
    if (words.length > 0) {
      console.log(`    HSK ${level}: ${words.length} words`);
    }
  }
}

// --- Run ---
console.log('Building data...\n');
buildCharacters();
console.log('');
buildCharsByLevel();
console.log('');
buildWordsByLevel();
console.log('\nDone!');
