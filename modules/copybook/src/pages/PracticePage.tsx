import { useContext, useMemo } from 'react';
import { useOffline } from '@platform/offline/offline-context.tsx';
import {
  PracticePage as WritingPracticePage,
  WCLanguageContext,
} from '@modules/writing-challenge';
import { LanguageContext } from '../i18n/index.ts';
import {
  makeProvideSession,
  makeSubmitSession,
  type SessionDataLayer,
} from '../utils/session.ts';

const AUTO_SKIP_KEY = 'copybook:auto-skip';

// Thin adapter: copybook renders the EXACT writing-challenge practice screen,
// just fed the user's entered text verbatim instead of a bank sentence.
// Finishing a session ("Stop" on the done screen, or the back button) routes
// back to the InputPage via `onChangeText`.
export function PracticePage({ userId, text, onChangeText }: {
  userId: number;
  text: string;
  onChangeText: () => void;
}) {
  const language = useContext(LanguageContext);
  const { dataLayer } = useOffline();
  const layer = dataLayer as unknown as SessionDataLayer | null;

  const settings = useMemo(() => dataLayer?.getModuleSettings() ?? {}, [dataLayer]);
  const leniency = parseFloat(settings['stroke_leniency'] || '1.0');
  const strokesPerFail = parseInt(settings['strokes_per_fail'] || '3', 10);

  const provideSession = useMemo(() => makeProvideSession(layer, text), [layer, text]);
  const submitSession = useMemo(() => makeSubmitSession(layer), [layer]);

  return (
    // The shared component reads writing-challenge's own LanguageContext for its
    // i18n; feed it copybook's current language so its labels match.
    <WCLanguageContext.Provider value={language}>
      <WritingPracticePage
        userId={userId}
        leniency={leniency}
        strokesPerFail={strokesPerFail}
        provideSession={provideSession}
        submitSession={submitSession}
        autoSkipKey={AUTO_SKIP_KEY}
        // The platform no longer draws a module back, so the writing screen owns
        // its own: showBack=true renders the compact top-left back arrow (shared
        // `.module-back--sm`) whose click → onStop → returns to the copybook input.
        showBack={true}
        // Back / "Stop" on the done screen returns to the input screen.
        onStop={onChangeText}
      />
    </WCLanguageContext.Provider>
  );
}
