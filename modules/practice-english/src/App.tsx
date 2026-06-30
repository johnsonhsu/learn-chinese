import { useState, useEffect, lazy, Suspense } from 'react';
import { LanguageContext } from './i18n/index.ts';
import { OfflineProvider, type Language } from './offline/offline-context.tsx';
import { initVoice } from './speech.ts';
import './index.css';

const LandingPage = lazy(() => import('./pages/LandingPage.tsx'));
const PracticePage = lazy(() => import('./pages/PracticePage.tsx'));

/**
 * Practice-English module. The platform owns profiles + language; back/exit is
 * now module-owned — we thread `onExit` to the landing (its <ModuleScreen> back)
 * and to the in-game screen (a <BackButton>). We just run the cloze practice
 * flow for the given profile, reading the shared sentence bank.
 */
export default function App({ userId, language, onExit }: { userId: number; language: Language; onExit?: () => void }) {
  return (
    <OfflineProvider userId={userId}>
      <LanguageContext.Provider value={language}>
        <PracticeFlow userId={userId} onExit={onExit} />
      </LanguageContext.Provider>
    </OfflineProvider>
  );
}

function PracticeFlow({ userId, onExit }: { userId: number; onExit?: () => void }) {
  const [practicing, setPracticing] = useState(false);
  useEffect(() => { initVoice(userId); }, [userId]);
  return (
    <Suspense fallback={<div className="loading">…</div>}>
      {practicing ? (
        <div className="pe-screen pe-screen--practice">
          <PracticePage onDone={() => setPracticing(false)} />
        </div>
      ) : (
        <div className="pe-screen pe-screen--home">
          <LandingPage onStart={() => setPracticing(true)} onExit={onExit} />
        </div>
      )}
    </Suspense>
  );
}
