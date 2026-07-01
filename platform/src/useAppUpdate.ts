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
import { isDemoMode } from './offline/demo-mode.ts';

export interface AppUpdate {
  needRefresh: boolean;
  setNeedRefresh: (_v: boolean) => void;
  updateServiceWorker: (_reloadPage?: boolean) => Promise<void>;
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
    // ALWAYS-LATEST on the demo path (issue #27 (A)). For a real (installed/dev)
    // session the SW stays `registerType: 'prompt'` — `needRefresh` flips and the
    // UpdateBanner lets the user apply it (unchanged). For a demo session we
    // instead auto-apply the waiting SW immediately (skipWaiting + reload on
    // controllerchange), so a browser `?app`/`?demo` visitor never sits on a
    // stale bundle and the reload doubles as the always-fresh reset. The real
    // store and the installed-PWA prompt flow are untouched.
    onNeedRefresh() {
      if (isDemoMode()) void updateServiceWorkerRef.current?.(true);
    },
  });

  // updateServiceWorker is referenced inside onNeedRefresh, which is captured at
  // registration time (before the binding above is assigned). A ref breaks that
  // ordering so the callback always sees the live updater.
  const updateServiceWorkerRef = useRef(updateServiceWorker);
  updateServiceWorkerRef.current = updateServiceWorker;

  const checkForUpdate = useCallback(() => {
    // Guard: registration may not exist yet (or at all, e.g. dev without SW).
    registrationRef.current?.update();
  }, []);

  return { needRefresh, setNeedRefresh, updateServiceWorker, checkForUpdate };
}
