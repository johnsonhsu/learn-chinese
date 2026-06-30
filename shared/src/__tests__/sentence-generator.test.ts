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
});
