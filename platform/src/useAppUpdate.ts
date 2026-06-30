/**
 * Single, app-level service-worker registration. vite-plugin-pwa (Workbox)
 * fingerprints every asset on each build; the SW detects a new precache
 * manifest and flips `needRefresh`. registerType is 'prompt', so the new SW
 * waits until the user applies it (via the UpdateBanner).
 *
 * We capture the SW `registration` so the app can FORCE a re-check on demand
 * (`checkForUpdate`) — that's how we drive the "new version" check off
 * navigation (entering profile/home screens) instead of relying on the
 * browser's once-at-launch check at registration time.
 *
 * IMPORTANT: useRegisterSW() must be called EXACTLY ONCE in the app (React
 * hooks rules + avoid duplicate SW registration). This hook is that one place.
 */
import { useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface AppUpdate {
  needRefresh: boolean;
  setNeedRefresh: (v: boolean) => void;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  /** Force the browser to re-check for a new SW; flips needRefresh if found. */
  checkForUpdate: () => void;
}

export function useAppUpdate(): AppUpdate {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration;
    },
  });

  const checkForUpdate = useCallback(() => {
    // Guard: registration may not exist yet (or at all, e.g. dev without SW).
    registrationRef.current?.update();
  }, []);

  return { needRefresh, setNeedRefresh, updateServiceWorker, checkForUpdate };
}
