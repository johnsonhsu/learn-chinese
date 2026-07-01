/**
 * Reading-comprehension flow for ENGLISH words — pure logic, no Node / React
 * dependencies (issue #69). This is the English analogue of the reading-chinese
 * tap-to-reconstruct engine (`shared/src/reading.ts` from #65). The learner
 * reconstructs a sentence by tapping its WORDS IN ORDER from a shuffled pool of
 * the sentence's own words; tiles are consumed as used.
 *
 * It mirrors the reading-chinese engine's exact invariants — a slot list, a
 * shuffled no-distractor tile pool, and a total tap state-machine — but the unit
 * is an English word (not a CJK char) and the auto-skip predicate is MASTERY-based
 * (a word the reader has already mastered, from reading-english's own per-word
 * store) rather than frequency-based. Kept as a thin module-local mirror (rather
 * than reaching into the CJK-specific `sentenceChars`/`isAboveLevel` of the shared
 * file) so the two engines stay independent and each is unit-tested in isolation.
 *
 * NOTE: there is no HanziWriter here — this is tap-only, exactly like
 * reading-chinese.
 */

import { practiceWords } from './cloze.ts';

export interface ReadingSlot {
  /** The word the learner must tap for this slot (lowercased key). */
  word: string;
  /** True when auto-skip resolved this slot for the learner (a mastered word, ON).
   *  A skipped slot is recorded as a `skip` attempt and never needs a tap. */
  autoSkipped: boolean;
}

export interface ReadingPool {
  /** The sentence's words in order, each flagged if it was auto-skipped. The UI
   *  advances through these; auto-skipped slots are pre-resolved. */
  slots: ReadingSlot[];
  /** The shuffled tiles the learner taps — the NON-auto-skipped words only, in a
   *  deterministic (seedable) shuffled order. No distractors: exactly the words
   *  the learner still has to place, so every tile is used exactly once. */
  tiles: string[];
}

/**
 * Deterministic Fisher–Yates shuffle driven by an injectable RNG (default
 * Math.random). Tests pass a seeded RNG so the order is reproducible. Returns a
 * new array; the input is not mutated. (Identical to reading-chinese's shuffle.)
 */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build the tap-to-reconstruct pool for one English sentence.
 *
 * - `slots` is the full ordered word list (via practiceWords: lowercased,
 *   punctuation/whitespace stripped); when `autoSkip` is ON, any word in
 *   `masteredWords` is flagged `autoSkipped` (the UI pre-resolves it as a `skip`
 *   and advances past it).
 * - `tiles` is the shuffled set of the words the learner MUST still tap (i.e. the
 *   non-auto-skipped words). With auto-skip OFF, that's every word of the
 *   sentence. There are NO distractor words beyond the sentence's own.
 *
 * A duplicate word in the sentence yields a duplicate tile (one tile consumed per
 * occurrence), so the pool always has exactly one tile per unresolved slot.
 */
export function buildReadingPool(params: {
  english: string;
  masteredWords: Set<string>;
  autoSkip: boolean;
  rng?: () => number;
}): ReadingPool {
  const { english, masteredWords, autoSkip, rng } = params;
  const words = practiceWords(english);
  const slots: ReadingSlot[] = words.map((word) => ({
    word,
    autoSkipped: autoSkip && masteredWords.has(word),
  }));
  const needed = slots.filter((s) => !s.autoSkipped).map((s) => s.word);
  return { slots, tiles: shuffle(needed, rng) };
}

export type ReadingTapOutcome = 'correct' | 'wrong';

export interface ReadingTapResult {
  outcome: ReadingTapOutcome;
  /** Next expected slot index after this tap (unchanged on a wrong tap). */
  nextIndex: number;
  /** The tiles remaining after this tap. On a correct tap the ONE matching tile
   *  is consumed (removed); on a wrong tap the pool is unchanged. */
  tiles: string[];
  /** True once every non-auto-skipped slot has been correctly tapped. */
  done: boolean;
}

/**
 * Apply a tile tap against the current reconstruction state — the tap state
 * machine, pure and total (mirrors reading-chinese's `tapTile`):
 *
 * - CORRECT (tapped word === the current expected slot's word): consume exactly
 *   one matching tile, advance past this slot AND any following auto-skipped slots
 *   (they need no tap), and report `done` when no unresolved slot remains.
 * - WRONG (any other word): the pool and index are UNCHANGED and `done` is false
 *   — the UI shows the incorrect-feedback shake and waits for another tap.
 */
export function tapTile(
  slots: ReadingSlot[],
  index: number,
  tiles: string[],
  tapped: string,
): ReadingTapResult {
  const expected = slots[index]?.word;
  if (tapped !== expected) {
    return { outcome: 'wrong', nextIndex: index, tiles, done: false };
  }
  // Consume ONE matching tile (handles duplicate words correctly).
  const consumeAt = tiles.indexOf(tapped);
  const remaining = consumeAt >= 0 ? [...tiles.slice(0, consumeAt), ...tiles.slice(consumeAt + 1)] : tiles;
  // Advance past this slot and any consecutive auto-skipped slots (no tap needed).
  let next = index + 1;
  while (next < slots.length && slots[next].autoSkipped) next++;
  return { outcome: 'correct', nextIndex: next, tiles: remaining, done: next >= slots.length };
}

/** The starting slot index: the first non-auto-skipped slot (auto-skip may
 *  resolve a run of leading mastered words). Returns slots.length when every slot
 *  is auto-resolved (the session is immediately complete). */
export function firstUnresolvedIndex(slots: ReadingSlot[]): number {
  let i = 0;
  while (i < slots.length && slots[i].autoSkipped) i++;
  return i;
}
