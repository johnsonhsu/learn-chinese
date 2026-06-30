import { ModuleScreen, Button } from '@platform/ui/index.ts';
import { useOffline } from '../offline/offline-context.js';
import { useT } from '../i18n/index.js';

interface Props {
  onStart: () => void;
  /** Exit the module back to home — drives the <ModuleScreen> back pill. */
  onExit?: () => void;
}

export default function LandingPage({ onStart, onExit }: Props) {
  const t = useT();
  const { dataLayer } = useOffline();
  const summary = dataLayer?.getSummary();

  return (
    // Shared module main-screen shell: renders the back pill (only because we
    // pass onBack) + the cream `.module-tile` card + the localized title (the
    // module name, shown in the single chosen UI language). The bespoke stat
    // chips below stay module-specific.
    <ModuleScreen
      title={t('home.title')}
      onBack={onExit}
      backLabel={t('app.back')}
    >
      {summary && (
        <div className="landing-stats">
          <div className="landing-stat">
            <span className="landing-stat-value">{summary.totalMastered}</span>
            <span className="landing-stat-label">{t('home.mastered')}</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">{summary.totalSeen}</span>
            <span className="landing-stat-label">{t('home.words')} {t('home.seen')}</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">{summary.totalSentences}</span>
            <span className="landing-stat-label">{t('home.sentences')}</span>
          </div>
        </div>
      )}

      <Button variant="primary" className="landing-start" onClick={onStart}>
        {t('home.start')}
      </Button>
    </ModuleScreen>
  );
}
