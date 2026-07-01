export { default } from './App.tsx';
// Shared with the copybook module: the polished char-by-char writing screen.
// The platform's module glob only consumes `.default`, so this named export is
// safe (it does not register a second module).
export { PracticePage } from './pages/PracticePage.tsx';
// Re-exported so consumers can drive the shared PracticePage's i18n (it reads
// writing-challenge's own LanguageContext, distinct from the consumer's).
export { LanguageContext as WCLanguageContext } from './i18n/index.ts';
export type { NextSentenceResponse, SentenceResultResponse, CharAttemptResult, CharResult } from './utils/api.ts';
