import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { OfflineDataLayer } from './offline-data-layer.js';

export type Language = 'zh-TW' | 'en';

interface OfflineState {
  isReady: boolean;
  dataLayer: OfflineDataLayer | null;
  userId: number;
}

const OfflineContext = createContext<OfflineState>({ isReady: false, dataLayer: null, userId: 0 });

export function useOffline(): OfflineState {
  return useContext(OfflineContext);
}

/**
 * Module-mode provider. The PLATFORM owns profiles, language and the shell — here
 * we just spin up the data layer for the given platform `userId`, read the shared
 * bank (/data/content.db) and track this profile's English-word mastery.
 */
export function OfflineProvider({ userId, children }: { userId: number; children: ReactNode }) {
  const [dataLayer, setDataLayer] = useState<OfflineDataLayer | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const dl = new OfflineDataLayer();
    dl.initialize()
      .then(async () => {
        await dl.setActiveProfile(userId);
        if (cancelled) return;
        setDataLayer(dl);
        setIsReady(true);
      })
      .catch((err) => console.error('practice-english init failed:', err));
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <OfflineContext.Provider value={{ isReady, dataLayer, userId }}>
      {isReady ? children : <div className="loading">…</div>}
    </OfflineContext.Provider>
  );
}
