import { useState, useEffect } from 'react';
import { ModuleScreen, Button } from '@platform/ui/index.ts';
import { LanguageContext, useT } from './i18n/index.ts';
import type { Language } from './i18n/index.ts';
import { OfflineProvider, useOffline } from './offline/offline-context.tsx';
import { initVoice } from './speech.ts';
import { ReadingPage } from './pages/ReadingPage.tsx';
import './App.css';

/**
 * Reading-english module (issue #69). The English analogue of reading-chinese:
 * same tap-to-reconstruct mechanics, but the learner rebuilds the ENGLISH
 * translation of a bank sentence by tapping WORD tiles in order from a shuffled
 * pool. Like practice-english it is fully self-contained — its own offline data
 * layer + an IndexedDB word store DISJOINT from practice-english's spelling store,
 * so reading progress never touches spelling progress. No HanziWriter is used.
 */
export default function App({ userId, language, onExit }: { userId: number; language: Language; onExit?: () => void }) {
  return (
    <OfflineProvider userId={userId}>
      <LanguageContext.Provider value={language}>
        <ReadingFlow userId={userId} onExit={onExit} />
      </LanguageContext.Provider>
    </OfflineProvider>
  );
}

function ReadingFlow({ userId, onExit }: { userId: number; onExit?: () => void }) {
  const [page, setPage] = useState<'landing' | 'practice'>('landing');
  useEffect(() => { initVoice(userId); }, [userId]);
  return page === 'practice'
    ? <ReadingPage onStop={() => setPage('landing')} />
    : <LandingPage onStart={() => setPage('practice')} onExit={onExit} />;
}

function LandingPage({ onStart, onExit }: { onStart: () => void; onExit?: () => void }) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [summary, setSummary] = useState<{ totalSeen: number; totalMastered: number } | null>(null);

  useEffect(() => {
    if (!dataLayer) return;
    const s = dataLayer.getSummary();
    setSummary({ totalSeen: s.totalSeen, totalMastered: s.totalMastered });
  }, [dataLayer]);

  return (
    <ModuleScreen
      title={t('reading.landingTitle')}
      onBack={onExit}
      backLabel={t('reading.back')}
      cardClassName="sp-landing-card"
    >
      {summary && (
        <div className="sp-landing-stats">
          <div className="sp-landing-stat sp-landing-stat-teal">
            <span className="sp-landing-stat-icon" aria-hidden="true">📗</span>
            <span className="sp-landing-stat-value">{summary.totalMastered}</span>
            <span className="sp-landing-stat-label">{t('reading.mastered')}</span>
          </div>
          <div className="sp-landing-stat sp-landing-stat-purple">
            <span className="sp-landing-stat-icon" aria-hidden="true">👁</span>
            <span className="sp-landing-stat-value">{summary.totalSeen}</span>
            <span className="sp-landing-stat-label">{t('reading.seen')}</span>
          </div>
        </div>
      )}

      <Button variant="primary" className="sp-landing-start" onClick={onStart}>
        {t('reading.startPractice')}
      </Button>
    </ModuleScreen>
  );
}
