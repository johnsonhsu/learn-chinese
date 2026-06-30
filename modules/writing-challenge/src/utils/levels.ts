import charsByLevel from '../data/chars-by-level.json';

export interface CharData {
  trad: string;
  pinyin: string;
  gloss: string;
  strokeCount: number;
  charRank: number;
}

const data = charsByLevel as Record<string, CharData[]>;

export const LEVELS = ['1', '2', '3', '4', '5', '6'] as const;

export function getCharsForLevel(level: string): CharData[] {
  return data[level] || [];
}

export function getLevelCount(level: string): number {
  return (data[level] || []).length;
}

export function getLevelSummary(): { level: string; count: number }[] {
  return LEVELS.map(level => ({
    level,
    count: getLevelCount(level),
  }));
}

export function getCharAt(level: string, index: number): CharData | null {
  const chars = data[level];
  if (!chars || index < 0 || index >= chars.length) return null;
  return chars[index];
}
