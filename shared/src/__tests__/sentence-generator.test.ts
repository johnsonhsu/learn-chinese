import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateNextSentence, pickWeighted, type GenerateNextSentenceParams } from '../sentence-generator.js';
import { fakeDb, rankedChar, seededRandom } from './helpers.js';

function params(o: Partial<GenerateNextSentenceParams> = {}): GenerateNextSentenceParams {
  const targetChars = o.targetChars ?? ['好'];
  const base: GenerateNextSentenceParams = {
    platformDb: fakeDb(),
    contentDb: fakeDb(),
    rankedChars: targetChars.map((c, i) => rankedChar(c, (i + 1) * 100)),
    targetChars,
    level: 50,
    knownInLevel: 0,
    totalInLevel: 0,
    fluency: 0,
    totalKnown: 0,
    stats: [],
    settings: {},
    bankSentences: [],
  };
  return { ...base, ...o, targetChars };
}

describe('pickWeighted', () => {
  it('returns undefined for an empty list', () => {
    expect(pickWeighted([], [])).toBeUndefined();
  });

  it('never returns a zero-weight item when a positive-weight one exists', () => {
    const rnd = seededRandom(1);
    const spy = vi.spyOn(Math, 'random').mockImplementation(rnd);
    for (let i = 0; i < 50; i++) expect(pickWeighted(['a', 'b'], [1, 0])).toBe('a');
    spy.mockRestore();
  });

  it('falls back to the first item when all weights are zero', () => {
    expect(pickWeighted(['a', 'b'], [0, 0])).toBe('a');
  });
});

describe('generateNextSentence', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null when there are no target chars', () => {
    expect(generateNextSentence(params({ targetChars: [] }))).toBeNull();
  });

  it('binds the chosen target char to a bank sentence that contains it', () => {
    const r = generateNextSentence(params({
      targetChars: ['好'],
      bankSentences: [{ sentence: '你好嗎', english: 'How are you?' }],
    }));
    expect(r).not.toBeNull();
    expect(r!.targetChar).toBe('好');
    expect(r!.text).toContain('好');
    expect(r!.english).toBe('How are you?');
  });

  it('BINDING: the returned targetChar always appears in the returned text', () => {
    const chars = ['好', '吃', '喝', '看', '說', '寫', '學', '走'];
    const bank = ['我很好', '我吃飯', '我喝水', '我看書', '我說話', '我寫字', '我學中文', '我走路']
      .map((s) => ({ sentence: s, english: '' }));
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(7));
    for (let i = 0; i < 100; i++) {
      const r = generateNextSentence(params({ targetChars: chars, bankSentences: bank }));
      expect(r).not.toBeNull();
      expect(r!.text).toContain(r!.targetChar);
    }
  });

  it('COVERAGE/PARITY: every bank-covered target char gets surfaced over many draws', () => {
    const chars = ['好', '吃', '喝', '看', '說', '寫', '學', '走'];
    const bank = ['我很好', '我吃飯', '我喝水', '我看書', '我說話', '我寫字', '我學中文', '我走路']
      .map((s) => ({ sentence: s, english: '' }));
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(99));
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = generateNextSentence(params({ targetChars: chars, bankSentences: bank }));
      seen.add(r!.targetChar);
    }
    expect(seen.size).toBe(chars.length); // nothing starved
  });

  it('falls back to single-char practice when the bank is empty', () => {
    const r = generateNextSentence(params({ targetChars: ['好'], bankSentences: [] }));
    expect(r).not.toBeNull();
    expect(r!.text).toBe('好'); // the lone target char, never null
    expect(r!.targetChar).toBe('好');
  });

  it('uses the best whole sentence when no target char has bank coverage', () => {
    const r = generateNextSentence(params({
      targetChars: ['驫'], // not in any bank sentence
      bankSentences: [{ sentence: '我喜歡這個', english: 'I like this' }],
    }));
    expect(r).not.toBeNull();
    expect(r!.text).toBe('我喜歡這個'); // a real sentence, not the lone char
    expect(r!.text).toContain(r!.targetChar); // anchored on one of its chars
  });

  it('allows a repeat rather than failing when exclusion would empty the pool', () => {
    const r = generateNextSentence(params({
      targetChars: ['好'],
      bankSentences: [{ sentence: '你好', english: '' }],
      excludeSentences: ['你好'], // the only candidate is excluded
    }));
    expect(r).not.toBeNull();
    expect(r!.text).toContain('好');
  });

  it('prefers a non-excluded sentence when one is available', () => {
    const r = generateNextSentence(params({
      targetChars: ['好'],
      bankSentences: [
        { sentence: '你好', english: 'a' },
        { sentence: '好的', english: 'b' },
      ],
      excludeSentences: ['你好'],
    }));
    expect(r!.text).toBe('好的');
  });

  // SCORING — which bank sentence wins among several that all contain the target
  // char. The generator rewards sentences that ALSO carry pool chars (other target
  // chars) and rank-near chars; above-level/unknown chars earn nothing. This backs
  // CARDINAL RULE 3 (relevance/coverage) at the scoring layer, complementing the
  // binding/coverage invariants above. `scoreSentence` is an inner closure, so we
  // assert it behaviorally through the public generator with a seeded RNG.
  it('SCORING: a pool-overlapping, rank-near sentence beats an unrelated one', () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(3));
    const r = generateNextSentence(params({
      targetChars: ['好', '吃'],
      // Explicit ranks: 好/吃 are nearby target-pool chars; 龘/靐 are far, above-level.
      rankedChars: [
        rankedChar('好', 100), rankedChar('吃', 150),
        rankedChar('龘', 99999), rankedChar('靐', 99998),
      ],
      level: 50,
      bankSentences: [
        { sentence: '好吃', english: 'tasty' },     // shares pool char 吃, near rank → high score
        { sentence: '好龘靐', english: 'noise' },     // only far, above-level chars → ~0 score
      ],
    }));
    expect(r).not.toBeNull();
    // The chosen char must still be bound into the result (never substituted).
    expect(r!.text).toContain(r!.targetChar);
    // When 好 is the chosen target, the higher-scoring 好吃 must win over 好龘靐.
    if (r!.targetChar === '好') expect(r!.text).toBe('好吃');
  });

  it('SCORING: deterministic winner regardless of candidate shuffle (strict-max)', () => {
    // Run across several seeds: the high-score sentence wins every time when 好 is
    // chosen — the internal random tiebreak never demotes a strictly-better score.
    for (const seed of [1, 2, 5, 11, 42]) {
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
      const r = generateNextSentence(params({
        targetChars: ['好'], // single target → 好 is always the chosen char
        rankedChars: [
          rankedChar('好', 100), rankedChar('吃', 150),
          rankedChar('龘', 99999), rankedChar('靐', 99998),
        ],
        level: 50,
        bankSentences: [
          { sentence: '好龘靐', english: 'noise' },
          { sentence: '好吃', english: 'tasty' },
        ],
      }));
      expect(r!.text).toBe('好吃');
      vi.restoreAllMocks();
    }
  });

  // DISAMBIG ROUND-TRIP — the pronoun homophone hint (他/她/它) must actually reach
  // the assembled charZhuyin via buildResult, not merely exist in the raw map.
  it('DISAMBIG: the 他/她/它 hint is appended to the assembled zhuyin', () => {
    const r = generateNextSentence(params({
      targetChars: ['他'],
      bankSentences: [{ sentence: '他好', english: 'he is well' }],
      // contentDb.tocfl_words supplies single-char zhuyin (fakeDb returns these for
      // every queryAll on contentDb — only the 他/好 rows are consumed here).
      contentDb: fakeDb({ all: [
        { word: '他', zhuyin: 'ㄊㄚ' },
        { word: '好', zhuyin: 'ㄏㄠˇ' },
      ] }),
    }));
    expect(r).not.toBeNull();
    expect(r!.text).toContain('他');
    expect(r!.charZhuyin['他']).toBe('ㄊㄚ(HE)'); // hint wired through buildResult
    expect(r!.charZhuyin['好']).toBe('ㄏㄠˇ');     // non-homophone: no hint appended
  });
});
