/**
 * Word-tokenization + sentence selection for reading-english (issue #69).
 *
 * A round = ONE full sentence. The Chinese is the prompt; the English answer is
 * reconstructed by tapping its WORDS in order from a shuffled pool. This mirrors
 * practice-english's tokenizer exactly (a "word" = a run of letters with optional
 * inner apostrophes/hyphens, e.g. "don't", "well-known"); the two English
 * competencies (spell vs read) tokenize identically so a word is the same unit in
 * both — they just never share a stat store (see offline/user-store.ts).
 */

/**
 * A "word" token is any run of letters with optional inner apostrophes/hyphens;
 * everything else is a literal separator. `tokenizeSentence` keeps separators so
 * a UI could re-render the original text; `practiceWords` is the ordered,
 * lowercased word list the tap engine consumes.
 */
export interface SentenceToken {
  isWord: boolean;
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

/** All words in a sentence, in order, lowercased (for tap-matching + mastery tracking). */
export function practiceWords(english: string): string[] {
  return tokenizeSentence(english).filter((t) => t.isWord).map((t) => t.text.toLowerCase());
}

export interface Sentence {
  id: number;
  chinese: string;
  english: string;
}

export interface ReadingQuestion {
  sentenceId: number;
  chinese: string;
  english: string;
  /** The sentence's words in order, lowercased (one per reconstruct slot). */
  words: string[];
}

/** Build the ReadingQuestion for a sentence (null if it has no words). */
export function buildQuestion(s: Sentence): ReadingQuestion | null {
  const words = practiceWords(s.english);
  if (words.length === 0) return null;
  return { sentenceId: s.id, chinese: s.chinese, english: s.english, words };
}

/**
 * Select the next sentence to READ from the bank — the English analogue of the
 * BINDING char-selection (cardinal rule #3 is a Chinese-char rule; reading-english
 * uses practice-english's unmastered-first heuristic instead). Priority: sentences
 * containing the most words the reader hasn't mastered yet (from reading-english's
 * OWN per-word store), while avoiding recently-seen sentences.
 */
export function selectNextSentence(
  sentences: Sentence[],
  masteredWords: Set<string>,
  recentSentenceIds: number[],
): ReadingQuestion | null {
  if (sentences.length === 0) return null;

  const recentSet = new Set(recentSentenceIds.slice(-10));

  const scored = sentences.map((s) => {
    const words = practiceWords(s.english);
    const unmastered = words.filter((w) => !masteredWords.has(w)).length;
    return { s, score: unmastered };
  });

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
