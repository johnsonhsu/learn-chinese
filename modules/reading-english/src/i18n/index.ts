import { createContext, useContext } from 'react';
import zhTW from './zh-TW.ts';
import en from './en.ts';

export type Language = 'en' | 'zh-TW';
type TranslationKey = keyof typeof zhTW;

const translations: Record<Language, Record<string, string>> = {
  'zh-TW': zhTW,
  'en': en,
};

export function t(key: TranslationKey, lang: Language): string {
  return translations[lang]?.[key] || translations['zh-TW'][key] || key;
}

export const LanguageContext = createContext<Language>('zh-TW');

export function useT() {
  const lang = useContext(LanguageContext);
  return (key: TranslationKey) => t(key, lang);
}
