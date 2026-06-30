import { describe, it, expect } from 'vitest';
import { stripTone, pinyinToZhuyin, DISAMBIG } from '../zhuyin.js';

describe('stripTone', () => {
  it('extracts the tone from a diacritic and lowercases the base', () => {
    expect(stripTone('hǎo')).toEqual({ base: 'hao', tone: 3 });
    expect(stripTone('shì')).toEqual({ base: 'shi', tone: 4 });
  });

  it('returns tone 0 when there is no diacritic', () => {
    expect(stripTone('shi')).toEqual({ base: 'shi', tone: 0 });
  });

  it('maps ü diacritics onto the ü base', () => {
    expect(stripTone('nǚ')).toEqual({ base: 'nü', tone: 3 });
  });
});

describe('pinyinToZhuyin', () => {
  it('converts syllables and appends the tone mark', () => {
    expect(pinyinToZhuyin('hǎo')).toBe('ㄏㄠˇ');
    expect(pinyinToZhuyin('xué')).toBe('ㄒㄩㄝˊ');
    expect(pinyinToZhuyin('zhōng')).toBe('ㄓㄨㄥ'); // tone 1 -> no mark
    expect(pinyinToZhuyin('wén')).toBe('ㄨㄣˊ');
  });

  it('handles the retroflex/sibilant whole syllables (no medial)', () => {
    expect(pinyinToZhuyin('shì')).toBe('ㄕˋ');
    expect(pinyinToZhuyin('rì')).toBe('ㄖˋ');
    expect(pinyinToZhuyin('zi')).toBe('ㄗ');
  });

  it('returns the input unchanged for an unknown syllable', () => {
    expect(pinyinToZhuyin('qqq')).toBe('qqq');
  });

  it('trims surrounding whitespace before converting', () => {
    expect(pinyinToZhuyin('  hǎo  ')).toBe('ㄏㄠˇ');
  });
});

describe('DISAMBIG', () => {
  it('carries the pronoun homophone hints used by the generator', () => {
    expect(DISAMBIG['她']).toBe('SHE');
    expect(DISAMBIG['他']).toBe('HE');
    expect(DISAMBIG['它']).toBe('IT');
  });
});
