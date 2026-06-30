/**
 * Character ranking algorithm — pure function, no Node dependencies.
 * Ranks all TOCFL characters by a blended score of frequency + level.
 */

import type { DbQueryProvider, RankedChar } from './types.js';

interface CharRow {
  character: string;
  book_rank: number | null;
  movie_rank: number | null;
  taiwan_rank: number | null;
  tocfl_level: string;
}

interface CharData {
  char: string;
  freqRank: number;
  tocflLevel: string;
  isPrimary: boolean;
}

const CHAR_RANK_SQL = `
  SELECT c.character,
         MAX(CASE WHEN m.key = 'freq_book_rank' THEN CAST(m.value AS INTEGER) END) as book_rank,
         MAX(CASE WHEN m.key = 'freq_movie_rank' THEN CAST(m.value AS INTEGER) END) as movie_rank,
         MAX(CASE WHEN m.key = 'wiktionary_freq_rank' THEN CAST(m.value AS INTEGER) END) as taiwan_rank,
         MAX(CASE WHEN m.key = 'tocfl_level' THEN m.value END) as tocfl_level
  FROM dict_chars c
  JOIN dict_char_metadata m ON m.char_id = c.id
  WHERE c.dictionary_id = 1
  GROUP BY c.id
  HAVING tocfl_level IS NOT NULL
`;

const TOCFL_LEVEL_ORDER = ['第1級', '第1*級', '第2級', '第2*級', '第3級', '第3*級', '第4級', '第4*級', '第5級', '第6級', '第7級'];

export function getRankedChars(platformDb: DbQueryProvider, settings: Record<string, string>): RankedChar[] {
  const freqWeight = parseInt(settings['rank_freq_weight'] || '60');
  const levelWeight = parseInt(settings['rank_level_weight'] || '40');
  const freqModel = settings['freq_model'] || 'book'; // 'book' or 'taiwan'

  const charRows = platformDb.queryAll<CharRow>(CHAR_RANK_SQL);

  const levelRankMap: Record<string, number> = {};
  TOCFL_LEVEL_ORDER.forEach((l, i) => levelRankMap[l] = i);
  const maxLevelRank = TOCFL_LEVEL_ORDER.length;

  const primaryKey = freqModel === 'taiwan' ? 'taiwan_rank' : 'book_rank';
  const fallbackKey = freqModel === 'taiwan' ? 'book_rank' : 'taiwan_rank';

  const primaryChars: CharData[] = [];
  const fallbackChars: CharData[] = [];

  for (const row of charRows) {
    const primary = row[primaryKey as keyof CharRow] as number | null;
    const fallback = row[fallbackKey as keyof CharRow] as number | null;
    const movieFallback = row.movie_rank;

    if (primary) {
      primaryChars.push({ char: row.character, freqRank: primary, tocflLevel: row.tocfl_level, isPrimary: true });
    } else if (fallback) {
      fallbackChars.push({ char: row.character, freqRank: fallback, tocflLevel: row.tocfl_level, isPrimary: false });
    } else if (movieFallback) {
      fallbackChars.push({ char: row.character, freqRank: movieFallback, tocflLevel: row.tocfl_level, isPrimary: false });
    }
  }

  primaryChars.sort((a, b) => a.freqRank - b.freqRank);
  fallbackChars.sort((a, b) => a.freqRank - b.freqRank);

  const allChars = [...primaryChars, ...fallbackChars];

  const scored: RankedChar[] = [];
  for (let i = 0; i < allChars.length; i++) {
    const c = allChars[i];
    const groupIdx = c.isPrimary
      ? primaryChars.indexOf(c)
      : primaryChars.length + fallbackChars.indexOf(c);
    const maxIdx = allChars.length;
    const freqNorm = groupIdx / maxIdx;
    const levelNorm = (levelRankMap[c.tocflLevel] ?? maxLevelRank) / maxLevelRank;
    const score = freqNorm * freqWeight + levelNorm * levelWeight;
    scored.push({ char: c.char, rank: 0, tocflLevel: c.tocflLevel, freqRank: c.freqRank, score });
  }

  scored.sort((a, b) => a.score - b.score);
  scored.forEach((c, i) => c.rank = i + 1);

  return scored;
}
