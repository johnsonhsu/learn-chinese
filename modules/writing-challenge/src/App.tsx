import { useState, useEffect } from 'react';
import { getProfile, getModuleSettings } from './utils/api.ts';
import type { ProfileData } from './utils/api.ts';
import { PracticeModal } from '@platform/components/PracticeModal.tsx';
import { speak } from '@platform/utils/speech.ts';
import { useOffline } from '@platform/offline/offline-context.tsx';
import { ModuleScreen, Button, CharTile } from '@platform/ui/index.ts';
import { LanguageContext, useT } from './i18n/index.ts';
import type { Language } from './i18n/index.ts';
import { PracticePage } from './pages/PracticePage.tsx';
import './App.css';

// The platform NO LONGER draws a "← Back" for writing-challenge (it's excluded
// from ActiveModuleView's `.module-back`), so we own the back ourselves: the
// landing shows the big pill (below), and the practice screen shows a COMPACT
// back arrow (top-left, inline with auto-skip/refresh) whose onStop returns
// here to the landing. The done screen's "Stop" still handles leaving.
export default function App({ userId, language, onExit }: { userId: number; language: Language; onExit?: () => void }) {
  const { dataLayer } = useOffline();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [moduleSettings, setModuleSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<'landing' | 'practice'>('landing');
  const loadProfile = () => {
    setLoading(true);
    // Local-first: settings come from the on-device content; assessment is a
    // server-only flow, so use a minimal profile that lands straight in practice.
    if (dataLayer) {
      setModuleSettings(dataLayer.getModuleSettings());
      setProfile({ id: userId, currentLevel: 0, assessedLevel: 0, curriculumPosition: 0, knownWords: [], stats: { totalPracticed: 0, streakDays: 0, lastPracticeDate: '' } } as ProfileData);
      setLoading(false);
      return;
    }
    Promise.all([getProfile(userId), getModuleSettings()])
      .then(([p, ms]) => { setProfile(p); setModuleSettings(ms); })
      .catch(() => {
        try {
          const cached = localStorage.getItem('lc-cached-settings');
          if (cached) setModuleSettings(JSON.parse(cached));
        } catch { /* ignore */ }
        setProfile({ id: userId, currentLevel: 0, assessedLevel: 0, curriculumPosition: 0, knownWords: [], stats: { totalPracticed: 0, streakDays: 0, lastPracticeDate: '' } } as ProfileData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadProfile, [userId, dataLayer]);

  const leniency = parseFloat(moduleSettings['stroke_leniency'] || '1.0');
  const strokesPerFail = parseInt(moduleSettings['strokes_per_fail'] || '3', 10);

  return (
    <LanguageContext.Provider value={language}>
      {loading ? (
        <LoadingView />
      ) : !profile ? (
        <LoadingView />
      ) : page === 'practice' ? (
        <PracticePage
          userId={userId}
          leniency={leniency}
          strokesPerFail={strokesPerFail}
          // Compact back arrow (top-left, shares the row with auto-skip/refresh).
          // Its onStop returns to this module's main screen (LandingPage).
          showBack={true}
          onStop={() => { loadProfile(); setPage('landing'); }}
        />
      ) : (
        <LandingPage
          userId={userId}
          onStart={() => setPage('practice')}
          onExit={onExit}
        />
      )}
    </LanguageContext.Provider>
  );
}

function LandingPage({ userId, onStart, onExit }: { userId: number; onStart: () => void; onExit?: () => void }) {
  const t = useT();
  const [info, setInfo] = useState<{ fluency: number; totalKnown: number; level: number; aboveThreshold: number; targetChars: string[]; charRanks: Record<string, number>; charMastery: Record<string, number> } | null>(null);
  const [practiceChar, setPracticeChar] = useState<string | null>(null);
  // Mirrors the in-practice auto-skip toggle (shared `wc_auto_skip` localStorage key).
  const [autoSkip, setAutoSkip] = useState(() => localStorage.getItem('wc_auto_skip') === 'true');

  const toggleAutoSkip = () => {
    const next = !autoSkip;
    setAutoSkip(next);
    localStorage.setItem('wc_auto_skip', next ? 'true' : 'false');
  };

  const { dataLayer, isOffline } = useOffline();

  useEffect(() => {
    const loadFromServer = () => Promise.all([
      fetch(`/api/writing-challenge/debug-info?userId=${userId}`).then(r => r.ok ? r.json() : null),
      fetch('/api/content/admin/char-ranking').then(r => r.ok ? r.json() : []),
      fetch('/api/writing-challenge/settings').then(r => r.ok ? r.json() : {}),
    ]).then(([d, ranking, settings]) => {
      if (!d) throw new Error('No data');
      const ranks: Record<string, number> = {};
      if (Array.isArray(ranking)) for (const r of ranking) ranks[r.char] = r.rank;
      const threshold = parseInt((settings as Record<string, string>)['above_level_threshold'] || '30');
      setInfo({ fluency: d.fluency || 0, totalKnown: d.totalKnown || 0, level: d.level || 0, aboveThreshold: threshold, targetChars: d.targetChars || [], charRanks: ranks, charMastery: d.charMastery || {} });
      // Cache for offline
      try { localStorage.setItem('lc-cached-settings', JSON.stringify(settings)); } catch { /* ignore */ }
    });

    const loadFromOffline = () => {
      if (!dataLayer) return;
      try {
        const d = dataLayer.getDebugInfo();
        if (d) {
          const settings = dataLayer.getModuleSettings();
          const threshold = parseInt(settings['above_level_threshold'] || '30');
          const ranks: Record<string, number> = {};
          for (const r of dataLayer.getCharRanking()) ranks[r.char] = r.rank;
          setInfo({ fluency: d.fluency || 0, totalKnown: d.totalKnown || 0, level: d.level || 0, aboveThreshold: threshold, targetChars: d.targetChars || [], charRanks: ranks, charMastery: d.charMastery || {} });
        }
      } catch (e) { console.error('Offline debug-info failed:', e); }
    };

    // Local-first: use the on-device data layer whenever it's ready.
    if (dataLayer) {
      loadFromOffline();
    } else {
      loadFromServer().catch(() => loadFromOffline());
    }
  }, [userId, dataLayer, isOffline]);

  return (
    // Shared module main-screen shell: renders the back pill (only because we
    // pass onBack) + the cream `.module-tile` card + the localized title. Back
    // lives ONLY here on the landing — the platform no longer renders it for this
    // module, and the practice + done screens stay back-less.
    <ModuleScreen
      title={t('practice.landingTitle')}
      onBack={onExit}
      backLabel={t('practice.back')}
      cardClassName="sp-landing-card"
    >
      {info && (
        <div className="sp-landing-stats">
          <div className="sp-landing-stat sp-landing-stat-teal">
            <span className="sp-landing-stat-icon" aria-hidden="true">💧</span>
            <span className="sp-landing-stat-value">{info.fluency}</span>
            <span className="sp-landing-stat-label">{t('practice.fluency')}</span>
          </div>
          <div className="sp-landing-stat sp-landing-stat-purple">
            <span className="sp-landing-stat-icon" aria-hidden="true">字</span>
            <span className="sp-landing-stat-value">{info.totalKnown}</span>
            <span className="sp-landing-stat-label">{t('practice.chars')}</span>
          </div>
          <div className="sp-landing-stat sp-landing-stat-gold">
            <span className="sp-landing-stat-icon" aria-hidden="true">⭐</span>
            <span className="sp-landing-stat-value">{info.level}</span>
            <span className="sp-landing-stat-label">{t('practice.level')}</span>
          </div>
        </div>
      )}

      <Button variant="primary" className="sp-landing-start" onClick={onStart}>
        {t('practice.startPractice')}
      </Button>

      <div className="sp-landing-autoskip">
        {/* Module-specific toggle (shared with the practice screen via the
            `.sp-autoskip-toggle` styles + the `wc_auto_skip` key); kept bespoke
            because its active=green state and sizing are module-specific, not a
            common kit pattern. Only the primary action moved to the kit. */}
        <button
          className={`sp-autoskip-toggle${autoSkip ? ' active' : ''}`}
          onClick={toggleAutoSkip}
          title="Auto-skip chars above your level"
        >
          {t('practice.autoSkip')} {autoSkip ? t('practice.on') : t('practice.off')}
        </button>
      </div>

      {info && info.targetChars.length > 0 && (
        <div className="sp-landing-targets">
          <div className="sp-landing-targets-label">{t('practice.targetChars')}</div>
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
                  ariaLabel={t('practice.practiceChar').replace('{char}', c)}
                  onActivate={() => { speak(c); setPracticeChar(c); }}
                />
              );
            })}
          </div>
        </div>
      )}

      {practiceChar && (
        <PracticeModal
          character={practiceChar}
          userId={userId}
          onClose={() => setPracticeChar(null)}
        />
      )}
    </ModuleScreen>
  );
}

function LoadingView() {
  const t = useT();
  return <div className="sp-page-empty">{t('assessment.preparing')}</div>;
}
