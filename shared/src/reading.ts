/**
 * Reading-comprehension flow — pure logic, no Node / React dependencies
 * (issue #65). The reading-chinese module reconstructs a sentence by tapping its
 * characters IN ORDER from a shuffled pool of the sentence's own chars. Keeping
 * the tile-pool build, the auto-skip filter and the tap state-machine here (as
 * pure functions) makes them unit-testable in the fast engine tier and keeps the
 * module UI thin.
 *
 * NOTE: this is deliberately independent of the writing/stroke flow — there is no
 * HanziWriter here. It shares the sentence engine (BINDING selection) upstream;
 * this file is purely about turning one chosen sentence into a tap exercise.
 */

/** CJK ideograph test — same range the writing flow uses to split a sentence. */
const HAN = /[一-鿿㐀-䶿]/;

/** The ordered CJK characters of a sentence (punctuation/latin stripped). */
export function sentenceChars(text: string): string[] {
  return [...text].filter((c) => HAN.test(c));
}

/**
 * Is a char "above level" (hard / skippable)? IDENTICAL predicate to
 * writing-challenge: rank strictly greater than level + threshold. Chars with no
 * rank (0) are treated as in-target (never auto-skipped).
 */
export function isAboveLevel(
  char: string,
  charRanks: Record<string, number>,
  level: number,
  aboveLevelThreshold: number,
): boolean {
  const rank = charRanks[char] || 0;
  return rank > level + aboveLevelThreshold;
}

export interface ReadingSlot {
  /** The character the learner must tap for this slot. */
  char: string;
  /** True when auto-skip resolved this slot for the learner (hard char, ON). A
   *  skipped slot is recorded as a `skip` attempt and never needs a tap. */
  autoSkipped: boolean;
}

export interface ReadingPool {
  /** The sentence's chars in order, each flagged if it was auto-skipped. The UI
   *  advances through these; auto-skipped slots are pre-resolved. */
  slots: ReadingSlot[];
  /** The shuffled tiles the learner taps — the NON-auto-skipped chars only, in a
   *  deterministic (seedable) shuffled order. No distractors: exactly the chars
   *  the learner still has to place, so every tile is used exactly once. */
  tiles: string[];
}

/**
 * Deterministic Fisher–Yates shuffle driven by an injectable RNG (default
 * Math.random). Tests pass a seeded RNG so the order is reproducible. Returns a
 * new array; the input is not mutated.
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
 * Build the tap-to-reconstruct pool for one sentence.
 *
 * - `slots` is the full ordered char list; when `autoSkip` is ON, any char the
 *   writing-challenge predicate would skip (`rank > level + threshold`) is
 *   flagged `autoSkipped` (the UI pre-resolves it as a `skip` and advances past
 *   it, exactly as writing-challenge does).
 * - `tiles` is the shuffled set of the chars the learner MUST still tap (i.e. the
 *   non-auto-skipped chars). With auto-skip OFF, that's every char of the
 *   sentence. There are NO distractor chars beyond the sentence's own.
 *
 * A duplicate char in the sentence yields a duplicate tile (one tile consumed per
 * occurrence), so the pool always has exactly one tile per unresolved slot.
 */
export function buildReadingPool(params: {
  text: string;
  charRanks: Record<string, number>;
  level: number;
  aboveLevelThreshold: number;
  autoSkip: boolean;
  rng?: () => number;
}): ReadingPool {
  const { text, charRanks, level, aboveLevelThreshold, autoSkip, rng } = params;
  const chars = sentenceChars(text);
  const slots: ReadingSlot[] = chars.map((char) => ({
    char,
    autoSkipped: autoSkip && isAboveLevel(char, charRanks, level, aboveLevelThreshold),
  }));
  const needed = slots.filter((s) => !s.autoSkipped).map((s) => s.char);
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
 * machine, pure and total:
 *
 * - CORRECT (tapped char === the current expected slot's char): consume exactly
 *   one matching tile, advance past this slot AND any following auto-skipped
 *   slots (they need no tap), and report `done` when no unresolved slot remains.
 * - WRONG (any other char): the pool and index are UNCHANGED and `done` is false
 *   — the UI shows the incorrect-feedback shake and waits for another tap.
 *
 * `index` is the current expected slot (callers start at the first non-auto-
 * skipped slot). `tiles` is the current remaining pool.
 */
export function tapTile(
  slots: ReadingSlot[],
  index: number,
  tiles: string[],
  tapped: string,
): ReadingTapResult {
  const expected = slots[index]?.char;
  if (tapped !== expected) {
    return { outcome: 'wrong', nextIndex: index, tiles, done: false };
  }
  // Consume ONE matching tile (handles duplicate chars correctly).
  const consumeAt = tiles.indexOf(tapped);
  const remaining = consumeAt >= 0 ? [...tiles.slice(0, consumeAt), ...tiles.slice(consumeAt + 1)] : tiles;
  // Advance past this slot and any consecutive auto-skipped slots (no tap needed).
  let next = index + 1;
  while (next < slots.length && slots[next].autoSkipped) next++;
  return { outcome: 'correct', nextIndex: next, tiles: remaining, done: next >= slots.length };
}

/** The starting slot index: the first non-auto-skipped slot (auto-skip may
 *  resolve a run of leading hard chars). Returns slots.length when every slot is
 *  auto-resolved (the session is immediately complete). */
export function firstUnresolvedIndex(slots: ReadingSlot[]): number {
  let i = 0;
  while (i < slots.length && slots[i].autoSkipped) i++;
  return i;
}
