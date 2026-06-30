/**
 * Spelling mechanic for practice-english.
 *
 * A round = ONE full sentence. The Chinese is the prompt; the English answer is
 * rendered as a row of blanks (one blank per word). The learner spells each word
 * letter-by-letter. Every word is tested (incl. short ones like "is/a/the");
 * pure-punctuation tokens are kept rendered but not spelled.
 */

/**
 * Stop words are no longer used to *exclude* words from practice (we now test
 * every word), but the set is kept exported because it documents the common
 * function-word vocabulary and may be useful for weighting/analytics.
 */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'and', 'in', 'that', 'it', 'for', 'on', 'with', 'as', 'at',
  'by', 'from', 'or', 'but', 'not', 'his', 'her', 'their', 'our', 'my',
  'your', 'its', 'this', 'these', 'those', 'they', 'we', 'i', 'he', 'she',
  'him', 'them', 'us', 'who', 'which', 'what', 'when', 'where', 'how',
  'if', 'so', 'than', 'then', 'too', 'very', 'just', 'even', 'still',
]);

/**
 * Split a sentence into ordered tokens, keeping punctuation/whitespace so the
 * answer can be re-rendered with blanks between the original separators.
 *
 * A "word" token is any run of letters with optional inner apostrophes/hyphens
 * (e.g. "don't", "well-known"). Everything else is a literal separator token.
 */
export interface SentenceToken {
  /** true → a spellable word (gets a blank); false → literal text (rendered as-is). */
  isWord: boolean;
  /** Original text of the token (the word as written, or the punctuation/space). */
  text: string;
}

/** Matches a word: a letter, then any letters / inner ' or - that are followed by a letter. */
const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

export function tokenizeSentence(english: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  let last = 0;
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(english)) !== null) {
    if (m.index > last) tokens.push({ isWord: false, text: english.slice(last, m.index) });
    tokens.push({ isWord: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < english.length) tokens.push({ isWord: false, text: english.slice(last) });
  return tokens;
}

/** All spellable words in a sentence, in order, lowercased (for mastery tracking). */
export function practiceWords(english: string): string[] {
  return tokenizeSentence(english).filter((t) => t.isWord).map((t) => t.text.toLowerCase());
}

export interface Sentence {
  id: number;
  chinese: string;
  english: string;
}

/** A blank to spell: the answer word plus its lowercase key for mastery. */
export interface SpellWord {
  /** The word exactly as it appears in the sentence (preserves any capitalization). */
  text: string;
  /** Lowercased word, used as the mastery key and for case-insensitive matching. */
  key: string;
}

export interface SpellQuestion {
  sentenceId: number;
  chinese: string;
  english: string;
  /** Ordered tokens for rendering (words become blanks, separators render literally). */
  tokens: SentenceToken[];
  /** Just the spellable words, in order (one per blank). */
  words: SpellWord[];
}

/** Build the full SpellQuestion for a sentence. */
export function buildQuestion(s: Sentence): SpellQuestion | null {
  const tokens = tokenizeSentence(s.english);
  const words: SpellWord[] = tokens
    .filter((t) => t.isWord)
    .map((t) => ({ text: t.text, key: t.text.toLowerCase() }));
  if (words.length === 0) return null;
  return { sentenceId: s.id, chinese: s.chinese, english: s.english, tokens, words };
}

/**
 * Select the next sentence to practice from the bank.
 * Priority: sentences containing the most words the user hasn't mastered yet,
 * while avoiding recently-seen sentences.
 */
export function selectNextSentence(
  sentences: Sentence[],
  masteredWords: Set<string>,
  recentSentenceIds: number[],
): SpellQuestion | null {
  if (sentences.length === 0) return null;

  const recentSet = new Set(recentSentenceIds.slice(-10));

  // Score each sentence by how many unmastered words it contains.
  const scored = sentences.map((s) => {
    const words = practiceWords(s.english);
    const unmastered = words.filter((w) => !masteredWords.has(w)).length;
    return { s, score: unmastered };
  });

  // Sort: prefer more unmastered words; push recently-seen sentences down.
  const sorted = [...scored].sort((a, b) => {
    const aAdj = a.score - (recentSet.has(a.s.id) ? 100 : 0);
    const bAdj = b.score - (recentSet.has(b.s.id) ? 100 : 0);
    return bAdj - aAdj;
  });

  for (const { s } of sorted) {
    const q = buildQuestion(s);
    if (q) return q;
  }
  return null;
}
