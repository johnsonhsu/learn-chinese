import { createContext, useContext } from 'react';
import zhTW from './zh-TW.ts';
import en from './en.ts';

export type Language = 'en' | 'zh-TW';
type TranslationKey = keyof typeof zhTW;

const translations: Record<Language, Record<TranslationKey, string>> = {
  'zh-TW': zhTW,
  'en': en,
};

export const LanguageContext = createContext<Language>('zh-TW');

export function useT() {
  const lang = useContext(LanguageContext);
  return (key: TranslationKey): string => translations[lang]?.[key] || translations['en'][key] || key;
}
