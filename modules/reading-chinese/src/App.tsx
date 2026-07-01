import { useState, useEffect } from 'react';
import { speak } from '@platform/utils/speech.ts';
import { useOffline } from '@platform/offline/offline-context.tsx';
import { ModuleScreen, Button, CharTile } from '@platform/ui/index.ts';
import { demoKey } from '@platform/offline/demo-key.ts';
import { LanguageContext, useT } from './i18n/index.ts';
import type { Language } from './i18n/index.ts';
import { ReadingPage } from './pages/ReadingPage.tsx';
import './App.css';

/**
 * Reading-chinese module (issue #65). Mirrors writing-challenge's shape — an
 * English-prompt + audio + in-order sentence flow — but REPLACES the HanziWriter
 * writing pad with a shuffled pool of tappable char tiles. Progress is tracked in
 * a SEPARATE reading stat track on the offline layer, so writing mastery is never
 * touched. No HanziWriter/WritingCanvas is instantiated here at all.
 */
export default function App({ userId, language, onExit }: { userId: number; language: Language; onExit?: () => void }) {
  const [page, setPage] = useState<'landing' | 'practice'>('landing');
  return (
    <LanguageContext.Provider value={language}>
      {page === 'practice' ? (
        <ReadingPage
          userId={userId}
          onStop={() => setPage('landing')}
        />
      ) : (
        <LandingPage onStart={() => setPage('practice')} onExit={onExit} />
      )}
    </LanguageContext.Provider>
  );
}

function LandingPage({ onStart, onExit }: { onStart: () => void; onExit?: () => void }) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [info, setInfo] = useState<{ fluency: number; totalKnown: number; level: number; aboveThreshold: number; targetChars: string[]; charRanks: Record<string, number>; charMastery: Record<string, number> } | null>(null);

  // Mirrors writing-challenge's auto-skip toggle, but under a reading-specific key
  // (demo-isolated via demoKey) so reading + writing toggles never bleed.
  const autoSkipKey = demoKey('reading_auto_skip');
  const [autoSkip, setAutoSkip] = useState(() => localStorage.getItem(autoSkipKey) === 'true');
  const toggleAutoSkip = () => {
    const next = !autoSkip;
    setAutoSkip(next);
    localStorage.setItem(autoSkipKey, next ? 'true' : 'false');
  };

  useEffect(() => {
    if (!dataLayer) return;
    try {
      // Reading-track landing stats (distinct from the writing fluency banner).
      const d = dataLayer.getReadingDebugInfo();
      if (d) {
        const settings = dataLayer.getModuleSettings();
        const threshold = parseInt(settings['above_level_threshold'] || '30');
        const ranks: Record<string, number> = {};
        for (const r of dataLayer.getCharRanking()) ranks[r.char] = r.rank;
        setInfo({ fluency: d.fluency || 0, totalKnown: d.totalKnown || 0, level: d.level || 0, aboveThreshold: threshold, targetChars: d.targetChars || [], charRanks: ranks, charMastery: d.charMastery || {} });
      }
    } catch (e) { console.error('Reading debug-info failed:', e); }
  }, [dataLayer]);

  return (
    <ModuleScreen
      title={t('reading.landingTitle')}
      onBack={onExit}
      backLabel={t('reading.back')}
      cardClassName="sp-landing-card"
    >
      {info && (
        <div className="sp-landing-stats">
          <div className="sp-landing-stat sp-landing-stat-teal">
            <span className="sp-landing-stat-icon" aria-hidden="true">📖</span>
            <span className="sp-landing-stat-value">{info.fluency}</span>
            <span className="sp-landing-stat-label">{t('reading.fluency')}</span>
          </div>
          <div className="sp-landing-stat sp-landing-stat-purple">
            <span className="sp-landing-stat-icon" aria-hidden="true">字</span>
            <span className="sp-landing-stat-value">{info.totalKnown}</span>
            <span className="sp-landing-stat-label">{t('reading.chars')}</span>
          </div>
          <div className="sp-landing-stat sp-landing-stat-gold">
            <span className="sp-landing-stat-icon" aria-hidden="true">⭐</span>
            <span className="sp-landing-stat-value">{info.level}</span>
            <span className="sp-landing-stat-label">{t('reading.level')}</span>
          </div>
        </div>
      )}

      <Button variant="primary" className="sp-landing-start" onClick={onStart}>
        {t('reading.startPractice')}
      </Button>

      <div className="sp-landing-autoskip">
        <button
          className={`sp-autoskip-toggle${autoSkip ? ' active' : ''}`}
          onClick={toggleAutoSkip}
          title="Auto-skip chars above your level"
        >
          {t('reading.autoSkip')} {autoSkip ? t('reading.on') : t('reading.off')}
        </button>
      </div>

      {info && info.targetChars.length > 0 && (
        <div className="sp-landing-targets">
          <div className="sp-landing-targets-label">{t('reading.targetChars')}</div>
          <div className="sp-landing-targets-chars">
            {info.targetChars.map((c, i) => {
              const rank = info.charRanks[c] || 0;
              const cat = rank === 0 ? 'target' : rank > info.level + info.aboveThreshold ? 'above' : rank <= info.level ? 'below' : 'target';
              const mastery = info.charMastery[c] || 0;
              return (
                <CharTile
                  key={i}
                  char={c}
                  rank={rank}
                  mastery={mastery}
                  ribbon={cat}
                  size="sm"
                  ariaLabel={t('reading.practiceChar').replace('{char}', c)}
                  onActivate={() => speak(c)}
                />
              );
            })}
          </div>
        </div>
      )}
    </ModuleScreen>
  );
}
