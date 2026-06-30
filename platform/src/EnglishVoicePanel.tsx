import { useState } from 'react';
import { useT } from './i18n/index.ts';
import { VoiceSelect } from './components/VoiceSelect.tsx';
import { getDeviceVoice, setDeviceVoice, previewVoice } from './utils/voices.ts';

/** Practice-English module settings: the DEVICE-wide default English voice.
 *  (Each profile can override this in their own profile settings.) */
export default function EnglishVoicePanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [voice, setVoice] = useState(getDeviceVoice());

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>{t('app.back')}</button>
        <h2>{t('settings.modEnglish')}</h2>
      </div>
      <div className="settings-section">
        <h3>{t('settings.voiceDevice')}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 12 }}>{t('settings.voiceDeviceHint')}</p>
        <VoiceSelect
          value={voice}
          inheritLabel={t('settings.voiceAuto')}
          onChange={(name) => { setVoice(name); setDeviceVoice(name); if (name) previewVoice(name); }}
        />
      </div>
    </div>
  );
}
