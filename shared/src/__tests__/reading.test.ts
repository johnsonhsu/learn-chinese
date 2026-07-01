import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  sentenceChars, isAboveLevel, shuffle, buildReadingPool, tapTile, firstUnresolvedIndex,
} from '../reading.js';
import { generateNextSentence } from '../sentence-generator.js';
import { fakeDb, rankedChar, seededRandom } from './helpers.js';

describe('sentenceChars', () => {
  it('keeps only CJK ideographs, in order', () => {
    expect(sentenceChars('我很好！Hi 嗎?')).toEqual(['我', '很', '好', '嗎']);
  });
});

describe('isAboveLevel', () => {
  it('is true only when rank strictly exceeds level + threshold', () => {
    const ranks = { 高: 200, 低: 40 };
    expect(isAboveLevel('高', ranks, 50, 30)).toBe(true);   // 200 > 80
    expect(isAboveLevel('低', ranks, 50, 30)).toBe(false);  // 40 <= 80
  });
  it('treats an unranked (0) char as in-target (never above)', () => {
    expect(isAboveLevel('x', {}, 0, 30)).toBe(false);
  });
});

describe('shuffle', () => {
  it('is a permutation — same multiset, nothing added or dropped', () => {
    const src = ['我', '很', '好', '嗎'];
    const out = shuffle(src, seededRandom(3));
    expect([...out].sort()).toEqual([...src].sort());
    expect(out.length).toBe(src.length);
  });
  it('does not mutate its input', () => {
    const src = ['a', 'b', 'c'];
    shuffle(src, seededRandom(1));
    expect(src).toEqual(['a', 'b', 'c']);
  });
  it('is deterministic for a given seed', () => {
    const src = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffle(src, seededRandom(42))).toEqual(shuffle(src, seededRandom(42)));
  });
});

describe('buildReadingPool', () => {
  const base = { charRanks: {}, level: 50, aboveLevelThreshold: 30, rng: seededRandom(7) };

  it('auto-skip OFF: tiles = ALL the sentence chars (shuffled), no extras, no skips', () => {
    const pool = buildReadingPool({ text: '我很好', autoSkip: false, ...base });
    expect(pool.slots.map((s) => s.char)).toEqual(['我', '很', '好']);
    expect(pool.slots.every((s) => !s.autoSkipped)).toBe(true);
    // Tiles are exactly the sentence's own chars — no distractors added.
    expect([...pool.tiles].sort()).toEqual(['好', '很', '我'].sort());
    expect(pool.tiles.length).toBe(3);
  });

  it('auto-skip ON: hard chars are flagged + OMITTED from the tile pool', () => {
    // 難 is above level (rank 999 > 50+30); 我/好 are in-target.
    const pool = buildReadingPool({
      text: '我難好',
      charRanks: { 我: 10, 難: 999, 好: 20 },
      level: 50, aboveLevelThreshold: 30, autoSkip: true, rng: seededRandom(7),
    });
    expect(pool.slots.map((s) => [s.char, s.autoSkipped])).toEqual([
      ['我', false], ['難', true], ['好', false],
    ]);
    // Only the two in-target chars are tappable — the hard char is NOT a tile.
    expect([...pool.tiles].sort()).toEqual(['好', '我'].sort());
    expect(pool.tiles).not.toContain('難');
  });

  it('duplicate chars yield duplicate tiles (one per occurrence)', () => {
    const pool = buildReadingPool({ text: '好好', autoSkip: false, ...base });
    expect(pool.tiles).toEqual(['好', '好']);
  });
});

describe('firstUnresolvedIndex', () => {
  it('skips a run of leading auto-skipped slots', () => {
    const slots = [
      { char: 'a', autoSkipped: true },
      { char: 'b', autoSkipped: true },
      { char: 'c', autoSkipped: false },
    ];
    expect(firstUnresolvedIndex(slots)).toBe(2);
  });
  it('returns slots.length when everything is auto-resolved', () => {
    const slots = [{ char: 'a', autoSkipped: true }];
    expect(firstUnresolvedIndex(slots)).toBe(1);
  });
});

describe('tapTile — the tap state machine', () => {
  const slots = [
    { char: '我', autoSkipped: false },
    { char: '很', autoSkipped: false },
    { char: '好', autoSkipped: false },
  ];

  it('CORRECT tap consumes exactly one matching tile and advances the slot', () => {
    const r = tapTile(slots, 0, ['很', '我', '好'], '我');
    expect(r.outcome).toBe('correct');
    expect(r.nextIndex).toBe(1);
    expect(r.tiles).toEqual(['很', '好']); // the tapped 我 is removed
    expect(r.done).toBe(false);
  });

  it('WRONG tap does NOT advance and does NOT consume any tile', () => {
    const tiles = ['很', '我', '好'];
    const r = tapTile(slots, 0, tiles, '好'); // expected 我, tapped 好
    expect(r.outcome).toBe('wrong');
    expect(r.nextIndex).toBe(0);      // unchanged
    expect(r.tiles).toBe(tiles);      // same array, nothing consumed
    expect(r.done).toBe(false);
  });

  it('reports done once the last slot is correctly tapped', () => {
    const r = tapTile(slots, 2, ['好'], '好');
    expect(r.outcome).toBe('correct');
    expect(r.tiles).toEqual([]);
    expect(r.done).toBe(true);
  });

  it('advances PAST following auto-skipped slots on a correct tap', () => {
    const withSkip = [
      { char: '我', autoSkipped: false },
      { char: '難', autoSkipped: true },
      { char: '好', autoSkipped: false },
    ];
    const r = tapTile(withSkip, 0, ['好', '我'], '我');
    expect(r.nextIndex).toBe(2); // jumped over the auto-skipped 難 at index 1
    expect(r.done).toBe(false);
  });

  it('a correct tap on the char before a trailing auto-skip run completes the session', () => {
    const trailingSkip = [
      { char: '我', autoSkipped: false },
      { char: '難', autoSkipped: true },
    ];
    const r = tapTile(trailingSkip, 0, ['我'], '我');
    expect(r.nextIndex).toBe(2);
    expect(r.done).toBe(true);
  });

  it('duplicate chars: the FIRST matching tile is consumed, one per slot', () => {
    const dup = [{ char: '好', autoSkipped: false }, { char: '好', autoSkipped: false }];
    const r1 = tapTile(dup, 0, ['好', '好'], '好');
    expect(r1.tiles).toEqual(['好']);
    const r2 = tapTile(dup, 1, r1.tiles, '好');
    expect(r2.tiles).toEqual([]);
    expect(r2.done).toBe(true);
  });
});

describe('reading flow reuses the BINDING generator', () => {
  afterEach(() => vi.restoreAllMocks());

  // The reading module feeds its own (reading-track) target chars to the SAME
  // generator; the binding invariant (chosen char appears in the sentence) is the
  // shared engine's — assert it holds when driven with a reading target set, then
  // that the whole chosen sentence becomes a reconstruct-able pool.
  it('the chosen target char always appears; the pool reconstructs the sentence', () => {
    const chars = ['好', '吃', '喝', '看'];
    const bank = ['我很好', '我吃飯', '我喝水', '我看書'].map((s) => ({ sentence: s, english: '' }));
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(11));
    for (let i = 0; i < 50; i++) {
      const r = generateNextSentence({
        platformDb: fakeDb(),
        contentDb: fakeDb(),
        rankedChars: chars.map((c, i2) => rankedChar(c, (i2 + 1) * 100)),
        targetChars: chars,
        level: 50, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0,
        stats: [], settings: {}, bankSentences: bank,
      });
      expect(r).not.toBeNull();
      expect(r!.text).toContain(r!.targetChar); // BINDING (cardinal rule #3)

      const pool = buildReadingPool({
        text: r!.text, charRanks: r!.charRanks, level: r!.level,
        aboveLevelThreshold: 30, autoSkip: false, rng: seededRandom(i),
      });
      // The pool is exactly the sentence's chars — reconstructable, no extras.
      expect([...pool.tiles].sort()).toEqual(sentenceChars(r!.text).sort());
      // And the target char is placeable from the pool.
      expect(pool.tiles).toContain(r!.targetChar);
    }
  });
});
