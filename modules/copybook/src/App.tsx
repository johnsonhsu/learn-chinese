import { useState } from 'react';
import { InputPage } from './pages/InputPage.tsx';
import { PracticePage } from './pages/PracticePage.tsx';
import { LanguageContext, type Language } from './i18n/index.ts';
import './App.css';

export default function App({ userId, language, onExit }: {
  userId: number;
  language: Language;
  // Back is module-owned now: the input screen's <ModuleScreen> back uses this to
  // exit the module to home; the writing screen's own back returns to the input.
  onExit?: () => void;
}) {
  // The verbatim text to write. null = on the input screen.
  const [text, setText] = useState<string | null>(null);

  return (
    <LanguageContext.Provider value={language}>
      <div className="cc-root">
        {text != null ? (
          <PracticePage
            userId={userId}
            text={text}
            onChangeText={() => setText(null)}
          />
        ) : (
          <InputPage
            userId={userId}
            onStart={t => setText(t)}
            onExit={onExit}
          />
        )}
      </div>
    </LanguageContext.Provider>
  );
}
