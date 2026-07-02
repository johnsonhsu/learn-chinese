import { describe, it, expect } from "vitest";
import {
  shuffle,
  buildReadingPool,
  tapTile,
  firstUnresolvedIndex,
} from "../../../../modules/reading-english/src/reading.ts";
import {
  practiceWords,
  selectNextSentence,
  recordRecentSentenceId,
  type Sentence,
} from "../../../../modules/reading-english/src/cloze.ts";

/**
 * Reading-english tap engine tests — the English-word analogue of
 * shared/src/__tests__/reading.test.ts (reading-chinese, #65). Lives in
 * platform/src so the fast `test:unit` tier (shared/ + platform/src) — which is
 * what CI runs — covers it, exactly as reading-chinese's isolation test does.
 *
 * Same invariants as the Chinese engine: deterministic no-distractor shuffle,
 * auto-skip filtering, and a total tap state machine (consume-on-correct,
 * no-advance-on-wrong). The unit is a WORD and the skip predicate is MASTERY-based
 * (a `masteredWords` set) rather than frequency-based.
 */

// Deterministic LCG RNG for reproducible shuffles (mirrors the shared test helper).
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("reading-english: practiceWords (tokenizer the pool is built on)", () => {
  it("splits into ordered lowercased words, dropping punctuation", () => {
    expect(practiceWords("The cat sat!")).toEqual(["the", "cat", "sat"]);
  });
  it("keeps inner apostrophes and hyphens as one word", () => {
    expect(practiceWords("It's well-known.")).toEqual(["it's", "well-known"]);
  });
});

describe("reading-english: shuffle", () => {
  it("is a permutation — same multiset, nothing added or dropped", () => {
    const src = ["the", "cat", "sat", "down"];
    const out = shuffle(src, seededRandom(3));
    expect([...out].sort()).toEqual([...src].sort());
    expect(out.length).toBe(src.length);
  });
  it("does not mutate its input", () => {
    const src = ["a", "b", "c"];
    shuffle(src, seededRandom(1));
    expect(src).toEqual(["a", "b", "c"]);
  });
  it("is deterministic for a given seed", () => {
    const src = ["a", "b", "c", "d", "e"];
    expect(shuffle(src, seededRandom(42))).toEqual(shuffle(src, seededRandom(42)));
  });
});

describe("reading-english: buildReadingPool", () => {
  const base = { masteredWords: new Set<string>(), rng: seededRandom(7) };

  it("auto-skip OFF: tiles = ALL the sentence words (shuffled), no extras, no skips", () => {
    const pool = buildReadingPool({ english: "The cat sat", autoSkip: false, ...base });
    expect(pool.slots.map((s) => s.word)).toEqual(["the", "cat", "sat"]);
    expect(pool.slots.every((s) => !s.autoSkipped)).toBe(true);
    expect([...pool.tiles].sort()).toEqual(["cat", "sat", "the"].sort());
    expect(pool.tiles.length).toBe(3);
  });

  it("auto-skip ON: MASTERED words are flagged + OMITTED from the tile pool", () => {
    const pool = buildReadingPool({
      english: "The cat sat",
      masteredWords: new Set(["the"]),
      autoSkip: true,
      rng: seededRandom(7),
    });
    expect(pool.slots.map((s) => [s.word, s.autoSkipped])).toEqual([
      ["the", true],
      ["cat", false],
      ["sat", false],
    ]);
    expect([...pool.tiles].sort()).toEqual(["cat", "sat"].sort());
    expect(pool.tiles).not.toContain("the");
  });

  it("auto-skip OFF shows mastered words too (toggle governs, not mastery alone)", () => {
    const pool = buildReadingPool({
      english: "The cat sat",
      masteredWords: new Set(["the", "cat", "sat"]),
      autoSkip: false,
      rng: seededRandom(7),
    });
    expect(pool.slots.every((s) => !s.autoSkipped)).toBe(true);
    expect(pool.tiles.length).toBe(3);
  });

  it("duplicate words yield duplicate tiles (one per occurrence)", () => {
    const pool = buildReadingPool({ english: "go go go", autoSkip: false, ...base });
    expect(pool.tiles.length).toBe(3);
    expect(pool.tiles.every((w) => w === "go")).toBe(true);
  });
});

describe("reading-english: firstUnresolvedIndex", () => {
  it("skips a run of leading auto-skipped slots", () => {
    const slots = [
      { word: "the", autoSkipped: true },
      { word: "a", autoSkipped: true },
      { word: "cat", autoSkipped: false },
    ];
    expect(firstUnresolvedIndex(slots)).toBe(2);
  });
  it("returns slots.length when everything is auto-resolved", () => {
    const slots = [{ word: "the", autoSkipped: true }];
    expect(firstUnresolvedIndex(slots)).toBe(1);
  });
});

describe("reading-english: tapTile — the tap state machine", () => {
  const slots = [
    { word: "the", autoSkipped: false },
    { word: "cat", autoSkipped: false },
    { word: "sat", autoSkipped: false },
  ];

  it("CORRECT tap consumes exactly one matching tile and advances the slot", () => {
    const r = tapTile(slots, 0, ["cat", "the", "sat"], "the");
    expect(r.outcome).toBe("correct");
    expect(r.nextIndex).toBe(1);
    expect(r.tiles).toEqual(["cat", "sat"]);
    expect(r.done).toBe(false);
  });

  it("WRONG tap does NOT advance and does NOT consume any tile", () => {
    const tiles = ["cat", "the", "sat"];
    const r = tapTile(slots, 0, tiles, "sat");
    expect(r.outcome).toBe("wrong");
    expect(r.nextIndex).toBe(0);
    expect(r.tiles).toBe(tiles);
    expect(r.done).toBe(false);
  });

  it("reports done once the last slot is correctly tapped", () => {
    const r = tapTile(slots, 2, ["sat"], "sat");
    expect(r.outcome).toBe("correct");
    expect(r.tiles).toEqual([]);
    expect(r.done).toBe(true);
  });

  it("advances PAST following auto-skipped slots on a correct tap", () => {
    const withSkip = [
      { word: "the", autoSkipped: false },
      { word: "a", autoSkipped: true },
      { word: "cat", autoSkipped: false },
    ];
    const r = tapTile(withSkip, 0, ["cat", "the"], "the");
    expect(r.nextIndex).toBe(2);
    expect(r.done).toBe(false);
  });

  it("a correct tap on the word before a trailing auto-skip run completes the session", () => {
    const trailingSkip = [
      { word: "cat", autoSkipped: false },
      { word: "the", autoSkipped: true },
    ];
    const r = tapTile(trailingSkip, 0, ["cat"], "cat");
    expect(r.nextIndex).toBe(2);
    expect(r.done).toBe(true);
  });

  it("duplicate words: one matching tile is consumed per slot", () => {
    const dup = [
      { word: "go", autoSkipped: false },
      { word: "go", autoSkipped: false },
    ];
    const r1 = tapTile(dup, 0, ["go", "go"], "go");
    expect(r1.tiles).toEqual(["go"]);
    const r2 = tapTile(dup, 1, r1.tiles, "go");
    expect(r2.tiles).toEqual([]);
    expect(r2.done).toBe(true);
  });
});

describe("reading-english: selectNextSentence + pool reconstructs the sentence", () => {
  const bank: Sentence[] = [
    { id: 1, chinese: "貓坐下", english: "The cat sat down" },
    { id: 2, chinese: "狗跑", english: "The dog runs" },
  ];

  it("prefers the sentence with the most UNMASTERED words", () => {
    const q = selectNextSentence(bank, new Set(["the", "dog", "runs"]), []);
    expect(q?.sentenceId).toBe(1);
  });

  it("the chosen sentence reconstructs from its own word tiles (no extras)", () => {
    const q = selectNextSentence(bank, new Set(), [])!;
    const pool = buildReadingPool({
      english: q.english,
      masteredWords: new Set(),
      autoSkip: false,
      rng: seededRandom(1),
    });
    expect([...pool.tiles].sort()).toEqual(practiceWords(q.english).sort());
  });

  it("auto-skip ON, EVERY word mastered → all slots skipped, no tiles (Defect A guard condition)", () => {
    const pool = buildReadingPool({
      english: "The cat sat",
      masteredWords: new Set(["the", "cat", "sat"]),
      autoSkip: true,
      rng: seededRandom(7),
    });
    expect(pool.slots.every((s) => s.autoSkipped)).toBe(true);
    expect(pool.tiles).toEqual([]);
    // The exact condition ReadingPage's auto-complete guard fires on:
    expect(pool.slots.length > 0 && firstUnresolvedIndex(pool.slots) >= pool.slots.length).toBe(
      true,
    );
  });
});

describe("reading-english: recordRecentSentenceId (per-sentence recency dedupe — Defect B)", () => {
  it("records a brand-new id", () => {
    expect(recordRecentSentenceId([1, 2], 3)).toEqual([1, 2, 3]);
  });
  it("a per-word submit loop for ONE sentence records the id ONCE, not N times", () => {
    let r: number[] = [];
    for (let i = 0; i < 10; i++) r = recordRecentSentenceId(r, 7); // 10-word sentence
    expect(r).toEqual([7]);
  });
  it("keeps DISTINCT recent sentences (window no longer collapses to ~1)", () => {
    let r: number[] = [];
    for (const id of [1, 1, 1, 2, 2, 3, 3, 3, 3]) r = recordRecentSentenceId(r, id);
    expect(r).toEqual([1, 2, 3]);
  });
  it("caps the list at 30, keeping the most recent", () => {
    let r: number[] = [];
    for (let i = 0; i < 40; i++) r = recordRecentSentenceId(r, i);
    expect(r.length).toBe(30);
    expect(r.at(-1)).toBe(39);
    expect(r[0]).toBe(10);
  });
  it("does not mutate its input", () => {
    const src = [1, 2];
    recordRecentSentenceId(src, 3);
    expect(src).toEqual([1, 2]);
  });
});
