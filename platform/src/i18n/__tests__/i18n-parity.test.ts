import { describe, it, expect } from 'vitest';
import en from '../en.ts';
import zhTW from '../zh-TW.ts';

// i18n key parity (issue #20 Band A). zh-TW is the source-of-truth locale (the
// `t()` fallback chain ends at zh-TW); `en` must mirror it key-for-key, or an
// untranslated string ships to one locale as a raw key. Today both maps carry an
// identical key set — this guards that they STAY in lock-step as strings are
// added. Pure data: lives in the fast `test:unit` tier.

const enKeys = Object.keys(en).sort();
const zhKeys = Object.keys(zhTW).sort();

describe('i18n key parity (en ↔ zh-TW)', () => {
  it('en and zh-TW expose the identical set of keys', () => {
    const onlyInZh = zhKeys.filter((k) => !(k in en));
    const onlyInEn = enKeys.filter((k) => !(k in zhTW));
    // Surface the offending keys in the failure message, not just a count.
    expect({ onlyInEn, onlyInZh }).toEqual({ onlyInEn: [], onlyInZh: [] });
  });

  it('both maps have the same number of keys', () => {
    expect(enKeys.length).toBe(zhKeys.length);
  });

  it('every value is a non-empty string in both locales', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(typeof v, `en[${k}] should be a string`).toBe('string');
      expect((v as string).length, `en[${k}] should be non-empty`).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(zhTW)) {
      expect(typeof v, `zh-TW[${k}] should be a string`).toBe('string');
      expect((v as string).length, `zh-TW[${k}] should be non-empty`).toBeGreaterThan(0);
    }
  });
});
