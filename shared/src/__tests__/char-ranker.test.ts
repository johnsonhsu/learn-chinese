import { describe, it, expect } from 'vitest';
import { getRankedChars } from '../char-ranker.js';
import { fakeDb } from './helpers.js';
import type { DbQueryProvider } from '../types.js';

interface Row {
  character: string;
  book_rank: number | null;
  movie_rank: number | null;
  taiwan_rank: number | null;
  tocfl_level: string;
}

const ROWS: Row[] = [
  { character: 'A', book_rank: 1, movie_rank: null, taiwan_rank: null, tocfl_level: '第1級' },
  { character: 'B', book_rank: 2, movie_rank: null, taiwan_rank: null, tocfl_level: '第1級' },
  { character: 'C', book_rank: null, movie_rank: null, taiwan_rank: 5, tocfl_level: '第2級' },
  { character: 'D', book_rank: null, movie_rank: 3, taiwan_rank: null, tocfl_level: '第3級' },
  { character: 'E', book_rank: null, movie_rank: null, taiwan_rank: null, tocfl_level: '第1級' }, // no freq -> dropped
];

const db = (): DbQueryProvider => fakeDb({ all: ROWS });

const rankOf = (r: ReturnType<typeof getRankedChars>, c: string) => r.find((x) => x.char === c)?.rank;

describe('getRankedChars', () => {
  it('drops chars with no frequency rank in any model', () => {
    const r = getRankedChars(db(), {});
    expect(r.map((x) => x.char).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('book model: primaries first (by book rank), then fallbacks blended with level', () => {
    const r = getRankedChars(db(), { freq_model: 'book' });
    expect(rankOf(r, 'A')).toBe(1);
    expect(rankOf(r, 'B')).toBe(2);
    expect(rankOf(r, 'D')).toBe(3); // movie-fallback, lower level beats C's higher level
    expect(rankOf(r, 'C')).toBe(4);
  });

  it('taiwan model promotes the taiwan-ranked char to a primary', () => {
    const r = getRankedChars(db(), { freq_model: 'taiwan' });
    expect(rankOf(r, 'C')).toBe(1); // was rank 4 under the book model
  });

  it('assigns a dense 1..N ranking', () => {
    const r = getRankedChars(db(), {});
    expect(r.map((x) => x.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});
