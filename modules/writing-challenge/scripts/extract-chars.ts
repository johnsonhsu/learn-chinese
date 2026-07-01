/**
 * Extract single-character entries with full data (HSK level, frequency, topWords)
 * from a dictionary_word JSONL file.
 *
 * Usage: npx tsx scripts/extract-chars.ts <path-to-dictionary-word.jsonl>
 *
 * Output: src/data/chars.json
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "src", "data", "base-chars.json");

interface TopWord {
  word: string;
  share: number;
  trad: string;
  gloss: string;
}

interface Statistics {
  hskLevel: number;
  movieWordCount?: number;
  movieWordCountPercent?: number;
  movieWordRank?: number;
  movieWordContexts?: number;
  movieWordContextsPercent?: number;
  bookWordCount?: number;
  bookWordCountPercent?: number;
  bookWordRank?: number;
  movieCharCount?: number;
  movieCharCountPercent?: number;
  movieCharRank?: number;
  movieCharContexts?: number;
  movieCharContextsPercent?: number;
  bookCharCount?: number;
  bookCharCountPercent?: number;
  bookCharRank?: number;
  topWords: TopWord[];
  pinyinFrequency?: number;
}

interface DictEntry {
  _id: string;
  simp: string;
  trad: string;
  items: {
    source: string;
    pinyin?: string;
    simpTrad?: string;
    definitions?: string[];
  }[];
  gloss: string;
  statistics: Statistics;
  pinyinSearchString: string;
}

interface ExtractedChar {
  char: string;
  simp: string;
  pinyin: string;
  gloss: string;
  hskLevel: number;
  frequency: {
    movieWordRank?: number;
    movieCharRank?: number;
    bookWordRank?: number;
    bookCharRank?: number;
  };
  topWords: TopWord[];
}

function extractChars(dictPath: string): ExtractedChar[] {
  const raw = readFileSync(dictPath, "utf-8");
  const lines = raw.split("\n").filter(Boolean);

  const chars: ExtractedChar[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const entry: DictEntry = JSON.parse(line);

    // Single character only
    if (!entry.trad || [...entry.trad].length !== 1) continue;

    // Must have frequency data (movieWordRank or bookWordRank)
    const stats = entry.statistics;
    if (!stats || (!stats.movieWordRank && !stats.bookWordRank)) continue;

    // Skip duplicates (keep first occurrence)
    if (seen.has(entry.trad)) continue;
    seen.add(entry.trad);

    // Extract primary pinyin from items
    const pinyinItem = entry.items?.find((i) => i.pinyin);
    const pinyin = pinyinItem?.pinyin || "";

    chars.push({
      char: entry.trad,
      simp: entry.simp,
      pinyin,
      gloss: entry.gloss || "",
      hskLevel: stats.hskLevel,
      frequency: {
        movieWordRank: stats.movieWordRank,
        movieCharRank: stats.movieCharRank,
        bookWordRank: stats.bookWordRank,
        bookCharRank: stats.bookCharRank,
      },
      topWords: stats.topWords || [],
    });
  }

  // Sort by book char rank (most frequent first), falling back to movie rank
  chars.sort((a, b) => {
    const aRank = a.frequency.bookCharRank || a.frequency.movieCharRank || 99999;
    const bRank = b.frequency.bookCharRank || b.frequency.movieCharRank || 99999;
    return aRank - bRank;
  });

  return chars;
}

function main() {
  const dictPath = process.argv[2];
  if (!dictPath) {
    console.log("Usage: npm run extract <path-to-dictionary-word.jsonl>");
    console.log("");
    console.log("Example:");
    console.log(
      "  npm run extract ../../input-lists/writing-challenge/dictionary_word_2025-12-27.jsonl",
    );
    console.log("");
    console.log("Extracts single-character entries with full data (HSK level, frequency,");
    console.log("topWords) and writes to src/data/base-chars.json");
    process.exit(1);
  }

  console.log(`Reading: ${dictPath}`);
  const chars = extractChars(dictPath);

  console.log(`Extracted: ${chars.size || chars.length} unique characters with full data`);

  // Summary by HSK level
  const byLevel: Record<number, number> = {};
  for (const c of chars) {
    byLevel[c.hskLevel] = (byLevel[c.hskLevel] || 0) + 1;
  }
  Object.keys(byLevel)
    .sort((a: string, b: string) => Number(a) - Number(b))
    .forEach((k) => {
      console.log(`  HSK ${k}: ${byLevel[Number(k)]} chars`);
    });

  // Top 20 most frequent
  console.log(`\nTop 20 by book frequency:`);
  chars.slice(0, 20).forEach((c, i) => {
    console.log(
      `  ${i + 1}. ${c.char} (${c.pinyin}) — ${c.gloss} [HSK ${c.hskLevel}, rank ${c.frequency.bookCharRank}]`,
    );
  });

  writeFileSync(OUTPUT_PATH, JSON.stringify(chars, null, 2), "utf-8");
  console.log(`\nWritten to: ${OUTPUT_PATH}`);
  console.log(`File size: ${(readFileSync(OUTPUT_PATH).length / 1024 / 1024).toFixed(1)} MB`);
}

main();
