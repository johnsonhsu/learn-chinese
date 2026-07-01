import { useEffect } from 'react';

const PORTRAIT_CLASS = 'lock-portrait';

export function useOrientationLock(orientationLock: '0' | '1' | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (orientationLock === '1') root.classList.add(PORTRAIT_CLASS);
    else root.classList.remove(PORTRAIT_CLASS);

    const safeScreen = screen as unknown as { orientation?: { lock: (o: string) => Promise<void>; unlock: () => void } };
    if (orientationLock !== '1') {
      try { safeScreen?.orientation?.unlock?.(); } catch {}
      return;
    }
    if (safeScreen?.orientation?.lock) {
      safeScreen.orientation.lock('portrait').catch(() => {});
    }
    return () => {
      try { safeScreen?.orientation?.unlock?.(); } catch {}
    };
  }, [orientationLock]);
}
