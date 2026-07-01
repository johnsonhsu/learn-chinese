import { useEffect } from 'react';

export function useOrientationLock(orientationLock: '0' | '1' | undefined) {
  useEffect(() => {
    if (orientationLock !== '1') return;
    const safeScreen = screen as unknown as { orientation?: { lock: (o: string) => Promise<void>; unlock: () => void } };
    if (safeScreen?.orientation?.lock) {
      safeScreen.orientation.lock('portrait').catch(() => {});
    }
  }, [orientationLock]);
}
