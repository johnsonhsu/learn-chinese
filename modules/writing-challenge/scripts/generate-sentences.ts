/**
 * Generate HSK practice sentences via Ollama.
 *
 * Usage: npx tsx modules/writing-challenge/scripts/generate-sentences.ts
 *
 * Requires local Ollama runtime; see docs/local-llm-setup.md.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

interface WordData {
  simp: string;
  trad: string;
  pinyin: string;
  gloss: string;
  frequency: number;
}

interface Sentence {
  trad: string;
  pinyin: string;
  english: string;
}

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5:7b";

async function generate(prompt: string): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.7 },
    }),
  });
  const data = await res.json();
  return data.response;
}

function getTopWords(level: string, count: number): WordData[] {
  const words: Record<string, WordData[]> = JSON.parse(
    readFileSync(join(DATA_DIR, "words-by-level.json"), "utf-8"),
  );
  return (words[level] || []).slice(0, count);
}

async function generateSentencesForLevel(level: string, count: number): Promise<Sentence[]> {
  const words = getTopWords(level, 80);
  const wordList = words.map((w) => `${w.trad}(${w.gloss})`).join(", ");

  const prompt = `You are a Chinese language teacher creating practice sentences for HSK level ${level} students.

Generate exactly ${count} simple sentences in Traditional Chinese (繁體中文) using ONLY words from this vocabulary list:
${wordList}

Rules:
- Use Traditional Chinese characters (繁體), NOT Simplified (简体)
- Each sentence should be 4-10 characters long
- Sentences must be grammatically correct and natural
- Progress from very simple to slightly more complex
- Include common daily life topics

Output ONLY a JSON array, no other text. Each item must have exactly these fields:
[{"trad": "他是學生", "pinyin": "tā shì xuéshēng", "english": "He is a student"}, ...]

JSON array:`;

  console.log(`  Generating ${count} sentences for HSK ${level}...`);
  const response = await generate(prompt);

  // Extract JSON from response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse response for level ${level}`);
    console.error(`  Response: ${response.slice(0, 200)}`);
    return [];
  }

  try {
    const sentences: Sentence[] = JSON.parse(jsonMatch[0]);
    // Validate
    return sentences.filter((s) => s.trad && s.pinyin && s.english);
  } catch (e) {
    console.error(`  JSON parse error for level ${level}: ${e}`);
    return [];
  }
}

async function main() {
  console.log("Generating sentences using Ollama (qwen2.5:7b)...\n");

  const allSentences: Record<string, Sentence[]> = {};

  for (const level of ["1", "2", "3", "4", "5", "6"]) {
    const count = level <= "2" ? 30 : level <= "4" ? 25 : 20;
    const sentences = await generateSentencesForLevel(level, count);
    allSentences[level] = sentences;
    console.log(`  → HSK ${level}: ${sentences.length} sentences\n`);
  }

  const outPath = join(DATA_DIR, "sentences.json");
  writeFileSync(outPath, JSON.stringify(allSentences, null, 2));
  console.log(`Done! Written to ${outPath}`);

  // Print sample
  for (const [level, sentences] of Object.entries(allSentences)) {
    if (sentences.length > 0) {
      console.log(`\n  HSK ${level} sample: ${sentences[0].trad} (${sentences[0].english})`);
    }
  }
}

main().catch(console.error);
