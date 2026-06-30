import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canonicalizeTW } from '../content-db.js';

// Golden fixtures shared with the Python scrub's parity test
// (test/test_glyph_canon.py). canonicalizeTW() and bank-fix.py's canon() are two
// implementations of the same rule and MUST agree — both run against this file.
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, '../../../test/fixtures/glyph-canon.json'), 'utf-8'),
) as { input: string; expected: string; note: string }[];

describe('canonicalizeTW — golden fixtures', () => {
  it.each(fixtures)('$note', ({ input, expected }) => {
    expect(canonicalizeTW(input)).toBe(expected);
  });
});

describe('canonicalizeTW — invariants', () => {
  it('preserves both 台 and 臺, never converting either direction', () => {
    expect(canonicalizeTW('台')).toBe('台');
    expect(canonicalizeTW('臺')).toBe('臺');
    expect(canonicalizeTW('台灣臺灣')).toBe('台灣臺灣');
  });

  it('is idempotent (re-running on canonical output is a no-op)', () => {
    for (const { input } of fixtures) {
      const once = canonicalizeTW(input);
      expect(canonicalizeTW(once)).toBe(once);
    }
  });
});
