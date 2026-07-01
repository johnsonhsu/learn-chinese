/**
 * Local-first app context. Boots the on-device data layer (sql.js content +
 * IndexedDB user store), resolves the single local user and their prefs, and
 * exposes everything the app needs with NO server dependency at runtime.
 *
 * The server is optional: it's only used on the dev machine for admin/curation
 * and to produce the shipped data assets the client loads.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { OfflineDataLayer, type InitProgress } from './offline-data-layer.js';
import type { Profile } from './user-store.js';
import { isDemoMode, ensureDemoSeed } from './demo.js';
import { setOfflineLayer } from '../../../modules/writing-challenge/src/utils/api.js';
import { t } from '../i18n/index.ts';

export type Language = 'zh-TW' | 'en';
export type Theme = 'dark' | 'light';

export interface LocalUser {
  id: number;
  name: string;
  displayName: string;
}

interface OfflineState {
  isOffline: boolean;
  isReady: boolean;
  initError: string | null;
  dataLayer: OfflineDataLayer | null;
  user: LocalUser | null;
  profiles: Profile[];
  settings: { language: Language; theme: Theme; orientationLock?: '0' | '1' };
  strokeReady: boolean;
  refresh: () => Promise<void>;
  updateSettings: (_patch: Partial<{ language: Language; theme: Theme; orientationLock?: '0' | '1' }>) => Promise<void>;
  updateDisplayName: (_name: string) => Promise<void>;
  selectProfile: (_id: number) => Promise<void>;
  createProfile: (_name: string) => Promise<Profile>;
  deleteProfile: (_id: number) => Promise<void>;
  switchProfile: () => void;
  forceUpdate: () => Promise<void>;
  getLevers: () => { defaults: Record<string, string>; overrides: Record<string, string> } | null;
  getModulesConfig: () => Record<string, boolean> | null;
  getBankCoverage: () => ReturnType<OfflineDataLayer['getBankCoverage']> | null;
  getBankSentences: (_q?: string, _limit?: number) => ReturnType<OfflineDataLayer['getBankSentences']> | null;
  setLever: (key: string, value: string) => Promise<void>;
  resetLever: (key: string) => Promise<void>;
  resetAllLevers: () => Promise<void>;
}

const OfflineContext = createContext<OfflineState>({
  isOffline: false,
  isReady: false,
  initError: null,
  dataLayer: null,
  user: null,
  profiles: [],
  settings: { language: 'zh-TW', theme: 'dark' },
  strokeReady: false,
  refresh: async () => {},
  updateSettings: async () => {},
  updateDisplayName: async () => {},
  selectProfile: async () => {},
  createProfile: async () => ({ id: 0, name: '', createdAt: '' }),
  deleteProfile: async () => {},
  switchProfile: () => {},
  forceUpdate: async () => {},
  getLevers: () => null,
  getModulesConfig: () => null,
  getBankCoverage: () => null,
  getBankSentences: () => null,
  setLever: async () => {},
  resetLever: async () => {},
  resetAllLevers: async () => {},
});

export function useOffline(): OfflineState {
  return useContext(OfflineContext);
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [dataLayer, setDataLayer] = useState<OfflineDataLayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<{ language: Language; theme: Theme }>({ language: 'zh-TW', theme: 'dark' });
  const [strokeReady, setStrokeReady] = useState(false);
  const [showReadyToast, setShowReadyToast] = useState(false);
  // Asset-download progress, only set while a real download is happening (new
  // device or contentHash changed). Stays null on cached/instant loads so no
  // bar lingers — the gate just shows the brief "Preparing…" state.
  const [downloadProgress, setDownloadProgress] = useState<InitProgress | null>(null);

  // Boot the data layer once, then auto-select a profile so the app lands on
  // home without flashing the picker. This is the ONE-TIME init effect — it
  // must NOT react to `user`, or switching profiles would immediately re-select.
  useEffect(() => {
    const dl = new OfflineDataLayer();
    dl.initialize((p) => setDownloadProgress(p))
      .then(async () => {
        setOfflineLayer(dl);
        // Demo mode: reseed preset profiles into the isolated demo store before
        // resolving profiles. ensureDemoSeed deliberately leaves NO last-selected
        // profile (issue #27 — show the profile picker first as a demo), so the
        // resolveAutoProfileId step below returns null (>1 profile, no valid last)
        // and the picker shows. The real/installed app never seeds, so it keeps
        // its normal restore-last-profile behavior.
        if (isDemoMode()) await ensureDemoSeed(dl);
        setProfiles(await dl.listProfiles());
        setSettings(await dl.getSettingsPrefs());
        // Auto-select the last-used profile (or the sole profile). Multiple
        // profiles with no valid last → leave `user` null so the picker shows.
        // Zero profiles → null → WelcomePopup (unchanged).
        const autoId = await dl.resolveAutoProfileId();
        if (autoId != null) {
          await dl.setActiveProfile(autoId);
          setUser(dl.getLocalUser());
        }
        setDataLayer(dl);
        setIsReady(true);
        // Track when the offline stroke bundle finishes caching.
        dl.whenStrokeReady().then((ok) => {
          if (ok) { setStrokeReady(true); setShowReadyToast(true); }
        });
      })
      .catch((err) => {
        console.error('Local-first init failed:', err);
        setInitError(err instanceof Error ? err.message : String(err));
      });
    return () => { setOfflineLayer(null); };
  }, []);

  // Auto-hide the "ready offline" confirmation after a few seconds.
  useEffect(() => {
    if (!showReadyToast) return;
    const t = setTimeout(() => setShowReadyToast(false), 4000);
    return () => clearTimeout(t);
  }, [showReadyToast]);

  // Apply theme whenever it changes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Online/offline detection (purely informational — data is local).
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (dataLayer) await dataLayer.refreshFromServer();
  }, [dataLayer]);

  const updateSettings = useCallback(async (patch: Partial<{ language: Language; theme: Theme; orientationLock?: '0' | '1' }>) => {
    if (dataLayer) await dataLayer.updateSettingsPrefs(patch);
    setSettings((prev) => ({ ...prev, ...patch }));
  }, [dataLayer]);

  const updateDisplayName = useCallback(async (name: string) => {
    if (dataLayer) await dataLayer.updateSettingsPrefs({ displayName: name });
    setUser((prev) => (prev ? { ...prev, displayName: name, name } : prev));
    if (dataLayer) setProfiles(await dataLayer.listProfiles());
  }, [dataLayer]);

  const selectProfile = useCallback(async (id: number) => {
    if (!dataLayer) return;
    await dataLayer.setActiveProfile(id);
    setUser(dataLayer.getLocalUser());
  }, [dataLayer]);

  const createProfile = useCallback(async (name: string) => {
    if (!dataLayer) throw new Error('Not ready');
    const p = await dataLayer.createProfile(name);
    setProfiles(await dataLayer.listProfiles());
    return p;
  }, [dataLayer]);

  const deleteProfile = useCallback(async (id: number) => {
    if (!dataLayer) return;
    await dataLayer.deleteProfile(id);
    setProfiles(await dataLayer.listProfiles());
    setUser((prev) => (prev && prev.id === id ? null : prev));
  }, [dataLayer]);

  const switchProfile = useCallback(() => setUser(null), []);

  // Read-only mirror of the shipped module_config enabled flags (see offline-data-layer).
  const getModulesConfig = useCallback(() => dataLayer?.getModulesConfig() ?? null, [dataLayer]);

  // Read-only mirrors of the dev writing-challenge admin reads, sourced from the
  // baked bank (see offline-data-layer). Power the admin Bank tab on-device.
  const getBankCoverage = useCallback(() => dataLayer?.getBankCoverage() ?? null, [dataLayer]);
  const getBankSentences = useCallback(
    (q?: string, limit?: number) => dataLayer?.getBankSentences(q, limit) ?? null,
    [dataLayer],
  );

  // Levers: per-device overrides over the shipped defaults (see offline-data-layer).
  const getLevers = useCallback(() => dataLayer?.getLevers() ?? null, [dataLayer]);
  const setLever = useCallback(async (key: string, value: string) => {
    await dataLayer?.setLeverOverride(key, value);
  }, [dataLayer]);
  const resetLever = useCallback(async (key: string) => {
    await dataLayer?.resetLeverOverride(key);
  }, [dataLayer]);
  const resetAllLevers = useCallback(async () => {
    await dataLayer?.resetAllLeverOverrides();
  }, [dataLayer]);

  // Force a full app-shell refresh: clear the service-worker caches and
  // unregister it, then reload so the newest UI/assets are fetched fresh.
  // IndexedDB (profiles, progress, content) is untouched — nothing is lost.
  const forceUpdate = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.error('Force update failed:', e);
    }
    location.reload();
  }, []);

  return (
    <OfflineContext.Provider
      value={{ isOffline, isReady, initError, dataLayer, user, profiles, settings, strokeReady, refresh, updateSettings, updateDisplayName, selectProfile, createProfile, deleteProfile, switchProfile, forceUpdate, getLevers, getModulesConfig, getBankCoverage, getBankSentences, setLever, resetLever, resetAllLevers }}
    >
      {!isReady && !initError && (
        <LoadingGate progress={downloadProgress} lang={settings.language} />
      )}
      {initError && (
        <div className="loading" style={{ color: 'var(--error, #d32f2f)' }}>
          Couldn’t load app data: {initError}
        </div>
      )}
      {isReady && (
        <>
          {isOffline && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0,
              background: '#444', color: '#fff', textAlign: 'center',
              padding: '2px 8px', fontSize: '11px', zIndex: 9999,
            }}>
              offline
            </div>
          )}
          {/* Offline-readiness indicator: amber while the stroke bundle downloads,
              a brief green confirmation once it's safe to go offline. Localized
              inline via settings.language (LanguageContext is set by a child). */}
          {!strokeReady && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: '#8a6d00', color: '#fff', textAlign: 'center',
              padding: '4px 8px', fontSize: '12px', zIndex: 9999,
            }}>
              {settings.language === 'zh-TW'
                ? '⬇ 正在準備離線資料…請暫時保持連線'
                : '⬇ Preparing offline data… stay online a moment'}
            </div>
          )}
          {strokeReady && showReadyToast && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: '#2e7d32', color: '#fff', textAlign: 'center',
              padding: '4px 8px', fontSize: '12px', zIndex: 9999,
            }}>
              {settings.language === 'zh-TW' ? '✓ 已可離線練習' : '✓ Ready for offline'}
            </div>
          )}
          {children}
        </>
      )}
    </OfflineContext.Provider>
  );
}

/**
 * Initial-load gate with a download progress bar. Renders BEFORE the app's
 * LanguageContext exists, so text is localized inline via `t(key, lang)`.
 *
 *  - `progress === null` → cached/instant load: just the brief "Preparing…"
 *    label (no bar lingering).
 *  - real download, known total → determinate bar + "Downloading… {pct}%".
 *  - real download, unknown total (missing Content-Length) → indeterminate
 *    animated bar + plain "Downloading…".
 */
function LoadingGate({ progress, lang }: { progress: InitProgress | null; lang: Language }) {
  if (!progress) {
    return <div className="loading">{t('loading.preparing', lang)}</div>;
  }
  const determinate = progress.percent !== null;
  const label = determinate
    ? t('loading.downloadingPct', lang).replace('{pct}', String(progress.percent))
    : t('loading.downloading', lang);
  return (
    <div className="loading loading--download">
      <div className="dl-progress" role="progressbar"
        aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={determinate ? progress.percent! : undefined}
        aria-label={label}>
        <div className={`dl-progress__track${determinate ? '' : ' dl-progress__track--indeterminate'}`}>
          <div
            className="dl-progress__fill"
            style={determinate ? { width: `${progress.percent}%` } : undefined}
          />
        </div>
        <div className="dl-progress__label">{label}</div>
      </div>
    </div>
  );
}
