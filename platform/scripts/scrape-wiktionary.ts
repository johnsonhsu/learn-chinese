/**
 * Scrape Wiktionary Mandarin Frequency Lists (1-10,000)
 * and import into platform dictionary.
 *
 * - Adds new words not in TOCFL
 * - Adds wiktionary_freq_rank metadata to chars
 * - Adds pinyin pronunciation to words
 *
 * Usage: npx tsx platform/scripts/scrape-wiktionary.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'platform.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const PAGES = [
  '1-1000', '1001-2000', '2001-3000', '3001-4000', '4001-5000',
  '5001-6000', '6001-7000', '7001-8000', '8001-9000', '9001-10000',
];

interface WordEntry {
  rank: number;
  traditional: string;
  simplified: string;
  pinyin: string;
  meaning: string;
}

async function scrapePage(range: string): Promise<WordEntry[]> {
  const url = `https://en.wiktionary.org/wiki/Appendix:Mandarin_Frequency_lists/${range}`;
  console.log(`  Fetching ${range}...`);
  const resp = await fetch(url);
  const html = await resp.text();

  // Extract all Hant entries from the entire page (not just first table, since nested tables break regex)
  const table = html;

  // Parse by finding all Hant spans (one per entry) and extracting surrounding data
  const entries: WordEntry[] = [];
  const startRank = parseInt(range.split('-')[0]);

  // Find all data rows by splitting on <tr> that contain <td>
  const rows = table.split(/<tr>/);

  for (const row of rows) {
    // Must have Hant span (data row, not header)
    const tradMatch = row.match(/class="Hant"[^>]*><a[^>]*>([^<]+)<\/a>/);
    if (!tradMatch) continue;

    const simpMatch = row.match(/class="Hans"[^>]*><a[^>]*>([^<]+)<\/a>/);
    const pinyinMatch = row.match(/class="Latn"[^>]*><a[^>]*>([^<]+)<\/a>/);

    // Meaning is in the last <td> — extract text, strip nested tables/audio/style
    const tds = row.split(/<\/td>/);
    let meaning = '';
    if (tds.length >= 4) {
      meaning = tds[3]
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
        .replace(/<table[\s\S]*?<\/table>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const traditional = tradMatch[1];
    const simplified = simpMatch?.[1] || traditional;
    const pinyin = pinyinMatch?.[1] || '';

    entries.push({
      rank: startRank + entries.length,
      traditional,
      simplified,
      pinyin,
      meaning,
    });
  }

  console.log(`    Found ${entries.length} entries`);
  return entries;
}

async function main() {
  // Get dictionary ID
  const dict = db.prepare('SELECT id FROM dictionaries WHERE code = ?').get('zh-TW') as { id: number } | undefined;
  if (!dict) { console.error('No zh-TW dictionary found. Run import-dictionary.ts first.'); process.exit(1); }
  const dictId = dict.id;

  // Scrape all pages
  const allEntries: WordEntry[] = [];
  for (const range of PAGES) {
    const entries = await scrapePage(range);
    allEntries.push(...entries);
    // Be polite to Wiktionary
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nTotal scraped: ${allEntries.length} words`);

  // Import into dictionary
  const insertWord = db.prepare(
    'INSERT OR IGNORE INTO dict_words (dictionary_id, word, definition, grammar, level, level_source) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const getWordId = db.prepare('SELECT id FROM dict_words WHERE dictionary_id = ? AND word = ? LIMIT 1');
  const insertPron = db.prepare('INSERT OR REPLACE INTO dict_word_pronunciations (word_id, type, value) VALUES (?, ?, ?)');
  const insertChar = db.prepare('INSERT OR IGNORE INTO dict_chars (dictionary_id, character) VALUES (?, ?)');
  const getCharId = db.prepare('SELECT id FROM dict_chars WHERE dictionary_id = ? AND character = ?');
  const insertCharWord = db.prepare('INSERT OR IGNORE INTO dict_char_words (char_id, word_id) VALUES (?, ?)');
  const insertMeta = db.prepare('INSERT OR REPLACE INTO dict_char_metadata (char_id, key, value) VALUES (?, ?, ?)');

  let newWords = 0;
  let existingWords = 0;
  let newChars = 0;
  let newLinks = 0;
  let newProns = 0;

  const tx = db.transaction(() => {
    for (const entry of allEntries) {
      // Try to find existing word
      let wordRow = getWordId.get(dictId, entry.traditional) as { id: number } | undefined;

      if (!wordRow) {
        // Insert new word with wiktionary as source
        insertWord.run(dictId, entry.traditional, entry.meaning, '', `freq_${entry.rank}`, 'wiktionary');
        wordRow = getWordId.get(dictId, entry.traditional) as { id: number } | undefined;
        if (wordRow) newWords++;
      } else {
        existingWords++;
      }

      if (!wordRow) continue;

      // Add pinyin pronunciation
      if (entry.pinyin) {
        insertPron.run(wordRow.id, 'pinyin', entry.pinyin);
        newProns++;
      }

      // Ensure chars exist and link them
      for (const c of entry.traditional) {
        if (!/[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)) continue;

        let charRow = getCharId.get(dictId, c) as { id: number } | undefined;
        if (!charRow) {
          insertChar.run(dictId, c);
          charRow = getCharId.get(dictId, c) as { id: number };
          newChars++;
        }

        // Add wiktionary frequency rank to char metadata (use lowest rank seen)
        const existingRank = db.prepare(
          "SELECT value FROM dict_char_metadata WHERE char_id = ? AND key = 'wiktionary_freq_rank'"
        ).get(charRow.id) as { value: string } | undefined;

        if (!existingRank || entry.rank < parseInt(existingRank.value)) {
          insertMeta.run(charRow.id, 'wiktionary_freq_rank', String(entry.rank));
        }

        insertCharWord.run(charRow.id, wordRow.id);
        newLinks++;
      }
    }
  });

  tx();

  console.log('\n--- Import Summary ---');
  console.log(`New words added: ${newWords}`);
  console.log(`Existing words (already in TOCFL): ${existingWords}`);
  console.log(`New chars added: ${newChars}`);
  console.log(`Char-word links added: ${newLinks}`);
  console.log(`Pronunciations added/updated: ${newProns}`);

  // Stats
  const totalWords = (db.prepare('SELECT COUNT(*) as n FROM dict_words WHERE dictionary_id = ?').get(dictId) as { n: number }).n;
  const totalChars = (db.prepare('SELECT COUNT(*) as n FROM dict_chars WHERE dictionary_id = ?').get(dictId) as { n: number }).n;
  const wiktWords = (db.prepare("SELECT COUNT(*) as n FROM dict_words WHERE dictionary_id = ? AND level_source = 'wiktionary'").get(dictId) as { n: number }).n;

  console.log(`\nTotal dictionary words: ${totalWords} (${wiktWords} from wiktionary)`);
  console.log(`Total dictionary chars: ${totalChars}`);

  db.close();
  console.log('Done.');
}

main();
