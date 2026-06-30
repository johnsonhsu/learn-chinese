import { createContext, useContext } from 'react';
import zhTW from './zh-TW.ts';
import en from './en.ts';

export type Language = 'en' | 'zh-TW';
type TranslationKey = keyof typeof zhTW;
type Vars = Record<string, string | number>;

const translations: Record<Language, Record<string, string>> = {
  'zh-TW': zhTW,
  'en': en,
};

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function t(key: TranslationKey, lang: Language, vars?: Vars): string {
  const s = translations[lang]?.[key] || translations['zh-TW'][key] || key;
  return interpolate(s, vars);
}

export const LanguageContext = createContext<Language>('zh-TW');

export function useT() {
  const lang = useContext(LanguageContext);
  return (key: TranslationKey, vars?: Vars) => t(key, lang, vars);
}
