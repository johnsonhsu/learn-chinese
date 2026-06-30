/**
 * First-run welcome (shown when a device has zero profiles). Collects the
 * learner's name + UI language, then creates and selects the first profile.
 * Strings come from the shared i18n table; the language toggle updates the app
 * language pref immediately, so the copy switches live before "Get started".
 */
import { useState } from 'react';
import { useOffline } from './offline/offline-context.tsx';
import { t as translate } from './i18n/index.ts';

export default function WelcomePopup({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { createProfile, selectProfile, updateSettings, settings } = useOffline();
  // Drive the toggle off the real app language so it persists immediately — that
  // way the settings gear (and the whole app) reflect the choice before "Start".
  const lang = settings.language;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const tr = (key: Parameters<typeof translate>[0]) => translate(key, lang);

  const start = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const p = await createProfile(n);
      await selectProfile(p.id);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="welcome-popup-overlay">
      <button
        className="icon-btn welcome-popup-gear"
        onClick={onOpenSettings}
        title={tr('settings.title')}
        aria-label={tr('settings.title')}
      >
        &#9881;
      </button>
      <div className="welcome-popup">
        <div className="welcome-popup-hero">
          <h1>{tr('app.title')}</h1>
          <p className="welcome-popup-tagline">{tr('app.tagline')}</p>
        </div>
        <div className="welcome-popup-langs">
          <button className={`seg-btn${lang === 'zh-TW' ? ' active' : ''}`} onClick={() => updateSettings({ language: 'zh-TW' })}>繁體中文</button>
          <button className={`seg-btn${lang === 'en' ? ' active' : ''}`} onClick={() => updateSettings({ language: 'en' })}>English</button>
        </div>
        <label className="welcome-popup-field">
          <span className="welcome-popup-label">{tr('welcome.namePrompt')}</span>
          <input
            className="welcome-popup-input"
            type="text"
            value={name}
            placeholder={tr('welcome.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            autoFocus
          />
        </label>
        <button className="welcome-popup-start" onClick={start} disabled={!name.trim() || busy}>
          {tr('welcome.start')}
        </button>
      </div>
    </div>
  );
}
