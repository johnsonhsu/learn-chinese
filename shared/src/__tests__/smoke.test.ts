import { describe, it, expect } from 'vitest';
// Exercise the `.js`-extension import chain end to end: sentence-generator
// internally imports mastery.js + zhuyin.js + types.js. If this resolves and
// runs, every internal import in shared/src resolves under Vitest.
import { pinyinToZhuyin } from '../zhuyin.js';
import { computeMastery, DEFAULT_MASTERY_CONFIG } from '../mastery.js';
import { pickWeighted } from '../sentence-generator.js';

describe('harness smoke', () => {
  it('resolves the .js-extension import chain', () => {
    expect(pinyinToZhuyin('hǎo')).toBe('ㄏㄠˇ');
    expect(computeMastery(undefined, DEFAULT_MASTERY_CONFIG)).toBe(0);
    expect(pickWeighted([], [])).toBeUndefined();
  });
});
