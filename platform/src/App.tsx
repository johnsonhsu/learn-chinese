import {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  type ComponentType,
} from "react";
import { useOrientationLock } from "./hooks/useOrientationLock.ts";
import { LanguageContext, useT } from "./i18n/index.ts";
import type { Language } from "./i18n/index.ts";
import { DebugProvider, useDebug } from "./DebugOverlay.tsx";
import { VoiceSelect } from "./components/VoiceSelect.tsx";
import { getUserVoice, setUserVoice, previewVoice } from "./utils/voices.ts";
import { getUserGeminiKey, setUserGeminiKey } from "./utils/geminiKey.ts";
import { getDeviceId } from "./utils/device-id.ts";
import { isFeatureUnlocked, redeemCode } from "./utils/unlocks.ts";
import { ThemeSelect } from "./components/ThemeSelect.tsx";
import { CodeEntry } from "./components/CodeEntry.tsx";
import {
  getDeviceTheme,
  setDeviceTheme,
  getProfileTheme,
  setProfileTheme,
  resolveEffectiveTheme,
  applyThemeToBody,
} from "./theme/theme-store.ts";
import { getTheme } from "./theme/themes.ts";
import UpdateBanner from "./UpdateBanner.tsx";
import DemoBadge from "./DemoBadge.tsx";
import { useAppUpdate } from "./useAppUpdate.ts";
import { OfflineProvider, useOffline } from "./offline/offline-context.tsx";
import { isDemoDeviceGated } from "./offline/demo-mode.ts";
import {
  exportBackup,
  parseBackup,
  importBackupSelective,
  type BackupSummary,
} from "./offline/backup.ts";

const AdminPage = lazy(() => import("./admin/AdminPage.tsx"));
const FeedbackWidget = lazy(() => import("./FeedbackWidget.tsx"));
const LeversPanel = lazy(() => import("./LeversPanel.tsx"));
const EnglishVoicePanel = lazy(() => import("./EnglishVoicePanel.tsx"));
const Onboarding = lazy(() => import("./Onboarding.tsx"));
const WelcomePopup = lazy(() => import("./WelcomePopup.tsx"));
const LandingPage = lazy(() => import("./LandingPage.tsx"));
const Styleguide = lazy(() => import("./Styleguide.tsx"));
const LandscapePreview = lazy(() => import("./LandscapePreview.tsx"));
const DevNotes = lazy(() => import("./DevNotes.tsx"));
const DemoGate = lazy(() => import("./DemoGate.tsx"));

interface ModuleManifest {
  name: string;
  displayName: string;
  displayNameZh: string;
  icon: string;
  apiPrefix: string;
  order: number;
}

interface User {
  id: number;
  name: string;
  displayName: string;
}

interface UserSettings {
  language: Language;
  theme: "dark" | "light";
  orientationLock?: "0" | "1";
}

interface ModuleProps {
  userId: number;
  language: Language;
  onExit?: () => void;
}

interface ModuleExport {
  default: ComponentType<ModuleProps>;
}

const moduleImports = import.meta.glob<ModuleExport>("../../modules/*/src/index.ts");

function moduleNameFromPath(path: string): string {
  const match = path.match(/modules\/([^/]+)\/src\/index\.ts$/);
  return match ? match[1] : "";
}

const moduleLazyComponents: Record<
  string,
  React.LazyExoticComponent<ComponentType<ModuleProps>>
> = {};
for (const [path, importFn] of Object.entries(moduleImports)) {
  const name = moduleNameFromPath(path);
  if (name) {
    moduleLazyComponents[name] = lazy(importFn);
  }
}

// Module manifests read at build time from each module's module.json — no
// server needed. Filter to modules that work fully on-device (v1: writing-challenge).
const OFFLINE_READY_MODULES = new Set([
  "writing-challenge",
  "word-sets",
  "practice-english",
  "copybook",
  "my-characters",
  "reading-chinese",
  "reading-english",
]);
const manifestModules = import.meta.glob<{ default: ModuleManifest } | ModuleManifest>(
  "../../modules/*/module.json",
  { eager: true },
);

function loadModuleManifests(): ModuleManifest[] {
  const out: ModuleManifest[] = [];
  for (const mod of Object.values(manifestModules)) {
    const m = ("default" in mod ? mod.default : mod) as ModuleManifest;
    if (m?.name && OFFLINE_READY_MODULES.has(m.name)) out.push(m);
  }
  return out.sort((a, b) => a.order - b.order);
}

// On the real deployed domain, browser-tab visitors get the marketing/landing
// page; the actual app only runs once installed (standalone) so on-device data
// lands in the standalone storage jar. Dev hosts, LAN, preview + standalone bypass.
function shouldShowLanding(): boolean {
  // Overrides for previewing/escaping: ?landing forces it, ?app forces the app.
  const params = new URLSearchParams(location.search);
  if (params.has("app")) return false;
  if (params.has("landing")) return true;
  const host = location.hostname;
  const isDevHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /\.local$/.test(host);
  const standalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return !isDevHost && !standalone;
}

// Dev/reference entry: `?ui` is the styleguide's OWN distinct URL (mirrors the
// `?landing`/`?app` query-param pattern). It is deliberately NOT linked from
// anywhere in the app UI — reachable only by visiting `/?ui` directly.
function shouldShowStyleguide(): boolean {
  return new URLSearchParams(location.search).has("ui");
}

// `?devnotes` is the dev-notes HUB — an internal index of reference pages
// (UI components, landscape design, growth ideas). Same query-param pattern as
// `?ui`; deliberately unlinked from the app, reachable only by direct URL.
function shouldShowDevnotes(): boolean {
  return new URLSearchParams(location.search).has("devnotes");
}

export default function App() {
  if (shouldShowStyleguide()) {
    // `?ui=landscape` is a distinct sub-page of the styleguide (the landscape
    // redesign reference, epic #152); bare `?ui` shows the component gallery.
    const uiPage = new URLSearchParams(location.search).get("ui");
    return (
      <Suspense fallback={<div className="loading" />}>
        {uiPage === "landscape" ? <LandscapePreview /> : <Styleguide />}
      </Suspense>
    );
  }
  if (shouldShowDevnotes()) {
    // Bare `?devnotes` shows the hub; `?devnotes=<slug>` (e.g. ideas) is a sub-page.
    return (
      <Suspense fallback={<div className="loading" />}>
        <DevNotes />
      </Suspense>
    );
  }
  if (shouldShowLanding()) {
    return (
      <Suspense fallback={<div className="loading" />}>
        <LandingPage />
      </Suspense>
    );
  }
  // Demo device gate (issue #66): a DESKTOP visitor who reaches a demo path is
  // gated OUT of the mobile-only demo and handed a "open it on your phone" QR
  // instead of booting a mobile-on-mouse session. This is checked BEFORE
  // <OfflineProvider>/<AppInner> so the demo never seeds or opens a session for a
  // gated device. It only fires for a DEMO session on a non-touch device — the
  // real/installed app, dev/LAN, and `?landing` are never gated (see
  // isDemoDeviceGated / evaluateDemoMode in demo-mode.ts).
  if (isDemoDeviceGated()) {
    return (
      <Suspense fallback={<div className="loading" />}>
        <DemoGate />
      </Suspense>
    );
  }
  return (
    <DebugProvider>
      <OfflineProvider>
        <AppInner />
      </OfflineProvider>
    </DebugProvider>
  );
}

function AppInner() {
  const {
    isReady,
    user,
    profiles,
    settings,
    updateSettings,
    updateDisplayName,
    switchProfile,
    forceUpdate,
    dataLayer,
  } = useOffline();
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [placementNeeded, setPlacementNeeded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLevers, setShowLevers] = useState(false);
  const [showEnglishVoice, setShowEnglishVoice] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  // THEME state. The effective theme = profileOverride ?? deviceTheme ?? default
  // (see theme-store). It depends on the active profile AND the device/profile
  // selections; `themeBump` forces a re-resolve after a selector writes a change.
  const [themeBump, setThemeBump] = useState(0);
  const bumpTheme = useCallback(() => setThemeBump((n) => n + 1), []);
  const effectiveTheme = useMemo(
    () => resolveEffectiveTheme(user ? user.id : null),
    // user.id + themeBump are the inputs; resolveEffectiveTheme reads storage.
    [user, themeBump],
  );
  const modules = useMemo(() => loadModuleManifests(), []);
  // The active theme's module-selection arrangement (grid/list) — read by the
  // home screen so a theme can re-arrange tiles without touching layout code.
  const arrangement = useMemo(() => getTheme(effectiveTheme).arrangement, [effectiveTheme]);

  // App-level escape hatch for the iOS portrait-lock fallback overlay.
  useEffect(() => {
    const w = window as unknown as { __setPortraitLock?: (_v: "0" | "1") => void };
    w.__setPortraitLock = (val: "0" | "1") => {
      updateSettings({ orientationLock: val }).catch(() => {});
    };
    return () => {
      try {
        delete w.__setPortraitLock;
      } catch {}
    };
  }, [updateSettings]);

  // Single app-level SW registration; drives the "new version" banner + lets us
  // force a re-check on demand (see the navigation-keyed effect below).
  const { needRefresh, setNeedRefresh, updateServiceWorker, checkForUpdate } = useAppUpdate();

  // Apply a pending update from the banner. updateServiceWorker(true) posts
  // SKIP_WAITING to the waiting SW and reloads on 'controllerchange' — but in an
  // iOS standalone PWA that event is unreliable, so the tap can look like it did
  // nothing. Force a reload as a fallback: by the time it fires the new SW has
  // activated and serves the new assets. If controllerchange already reloaded,
  // this timer is discarded along with the old page (no double reload).
  const applyUpdate = useCallback(async () => {
    try {
      await updateServiceWorker(true);
    } catch {
      /* SW may be absent in dev */
    }
    window.setTimeout(() => window.location.reload(), 2500);
  }, [updateServiceWorker]);

  // Return to the launch picker from a clean state.
  const handleSwitchProfile = () => {
    setActiveModule(null);
    setShowSettings(false);
    switchProfile();
  };

  // A freshly-created (zero-stats) profile gets the one-time onboarding picker
  // (new / learning / native). `needsPlacement` is the same gate as before; the
  // picker replaces the old char-by-char placement TEST.
  useEffect(() => {
    if (!user || !dataLayer) {
      setPlacementNeeded(false);
      return;
    }
    let cancelled = false;
    dataLayer.needsPlacement().then((need) => {
      if (!cancelled) setPlacementNeeded(need);
    });
    return () => {
      cancelled = true;
    };
  }, [user, dataLayer]);

  // Tab title follows the chosen language.
  useEffect(() => {
    document.title = settings.language === "zh-TW" ? "學中文" : "Learn Chinese";
  }, [settings.language]);

  // Which screen the user is on. Drives both the per-screen background color and
  // the navigation-based "new version" check.
  const screen = useMemo<string>(() => {
    if (!user) {
      return showAdmin || showLevers || showEnglishVoice || showDeviceSettings
        ? "settings"
        : "profile";
    }
    // Onboarding / placement renders on its OWN screen value (not 'home') so it
    // never inherits the home/profile premium shell — placement must look normal.
    if (placementNeeded) return showLevers ? "settings" : "placement";
    if (showSettings) return "settings";
    // My Characters now mounts as a module (activeModule === 'my-characters'),
    // but keeps its own indigo background — so it must be checked before the
    // generic activeModule → 'writing' fallback below.
    if (activeModule === "my-characters") return "mychars";
    if (activeModule === "word-sets") return "wordsets";
    if (activeModule) return "writing";
    return "home";
  }, [
    user,
    activeModule,
    showSettings,
    showAdmin,
    showLevers,
    showEnglishVoice,
    showDeviceSettings,
    placementNeeded,
  ]);

  // Per-screen background color (the design uses a different hue per screen).
  useEffect(() => {
    document.body.dataset.screen = screen;
  }, [screen]);

  // THEME hook: a single data-attribute on <body> behind which all theme CSS is
  // scoped (body[data-theme="<id>"] …). 'default' is the no-theme look — its
  // tokens come from :root, so the attribute is REMOVED (not set to "default")
  // when default is active, keeping the cascade byte-identical to pre-theming.
  useEffect(() => {
    applyThemeToBody(effectiveTheme);
  }, [effectiveTheme]);

  useOrientationLock(settings.orientationLock, settings.language);

  // Check for a new app version every time the user LANDS on the profile-picker
  // or module-selection (home) screen. Keying the effect on `screen` means it
  // fires once per entry to those screens (not continuously) — these are the
  // most-visited screens, so they replace the old once-at-launch check.
  useEffect(() => {
    if (screen === "profile" || screen === "home") checkForUpdate();
  }, [screen, checkForUpdate]);

  // Provider renders "Preparing…" until the on-device data layer is ready.
  if (!isReady) return null;

  // Always pick a profile on launch (and whenever the user switches). Device-
  // level settings (backup, app update, admin) live on this pre-profile screen.
  if (!user) {
    return (
      <LanguageContext.Provider value={settings.language}>
        <UpdateBanner
          needRefresh={needRefresh}
          onUpdate={applyUpdate}
          onDismiss={() => setNeedRefresh(false)}
        />
        <DemoBadge />
        {/* Settings panels take precedence so the WelcomePopup gear (0-profile
            first run) and the ProfilePicker gear both reach them. */}
        {showAdmin ? (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <AdminPage onBack={() => setShowAdmin(false)} />
          </Suspense>
        ) : showLevers ? (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <LeversPanel onBack={() => setShowLevers(false)} />
          </Suspense>
        ) : showEnglishVoice ? (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <EnglishVoicePanel onBack={() => setShowEnglishVoice(false)} />
          </Suspense>
        ) : showDeviceSettings ? (
          <DeviceSettings
            settings={settings}
            onUpdateSettings={updateSettings}
            onForceUpdate={forceUpdate}
            onOpenAdmin={() => setShowAdmin(true)}
            onOpenLevers={() => setShowLevers(true)}
            onOpenEnglishVoice={() => setShowEnglishVoice(true)}
            onBack={() => setShowDeviceSettings(false)}
            deviceTheme={getDeviceTheme()}
            onSetDeviceTheme={(id) => {
              setDeviceTheme(id);
              bumpTheme();
            }}
          />
        ) : profiles.length === 0 ? (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <WelcomePopup onOpenSettings={() => setShowDeviceSettings(true)} />
          </Suspense>
        ) : (
          <ProfilePicker onOpenDeviceSettings={() => setShowDeviceSettings(true)} />
        )}
        {/* Global feedback widget — present across the app (not the landing).
            Lazy + online-only; profile id is null on the pre-profile screen. */}
        <Suspense fallback={null}>
          <FeedbackWidget profileId={null} />
        </Suspense>
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={settings.language}>
      <UpdateBanner
        needRefresh={needRefresh}
        onUpdate={applyUpdate}
        onDismiss={() => setNeedRefresh(false)}
      />
      <DemoBadge />
      {placementNeeded ? (
        // Power-user escape hatch: the onboarding gear opens the levers that
        // govern char ranking/selection without leaving onboarding (placementNeeded
        // stays true), so Back lands right back on the picker.
        showLevers ? (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <LeversPanel onBack={() => setShowLevers(false)} />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <Onboarding
              onDone={() => setPlacementNeeded(false)}
              onOpenSettings={() => setShowLevers(true)}
            />
          </Suspense>
        )
      ) : showSettings ? (
        <AppSettings
          user={user}
          onUpdateDisplayName={updateDisplayName}
          onRetakePlacement={() => {
            setShowSettings(false);
            setPlacementNeeded(true);
          }}
          onBack={() => setShowSettings(false)}
          onThemeChange={bumpTheme}
        />
      ) : activeModule ? (
        <ActiveModuleView
          modules={modules}
          activeModule={activeModule}
          user={user}
          language={settings.language}
          onBack={() => setActiveModule(null)}
        />
      ) : (
        <WelcomePage
          modules={modules}
          user={user}
          arrangement={arrangement}
          onSelectModule={setActiveModule}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCharStats={() => setActiveModule("my-characters")}
          onSwitchProfile={handleSwitchProfile}
        />
      )}
      {/* Global feedback widget — present across every in-app screen (not the
          landing). Lazy + online-only; carries the numeric profile id only. */}
      <Suspense fallback={null}>
        <FeedbackWidget profileId={user.id} />
      </Suspense>
    </LanguageContext.Provider>
  );
}

// --- Profile Picker (always shown on launch) ---

function ProfilePicker({ onOpenDeviceSettings }: { onOpenDeviceSettings: () => void }) {
  const t = useT();
  const { profiles, selectProfile, createProfile, deleteProfile } = useOffline();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  // Inline delete confirm: first tap arms a row (✕→✓), second tap deletes.
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const confirmTimer = useRef<number | undefined>(undefined);
  const armDelete = (id: number) => {
    setConfirmId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmId(null), 3000);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const p = await createProfile(name);
    await selectProfile(p.id);
    setBusy(false);
  };

  return (
    <div className="user-picker">
      <div className="user-picker-bar">
        <div className="welcome-actions">
          {profiles.length > 0 && (
            <button
              className="icon-btn"
              onClick={() => {
                setManage((m) => !m);
                setConfirmId(null);
              }}
              title={t("profile.manage")}
              aria-label={t("profile.manage")}
            >
              {manage ? "✓" : "✎"}
            </button>
          )}
          <button
            className="icon-btn"
            onClick={onOpenDeviceSettings}
            title={t("settings.title")}
            aria-label={t("settings.title")}
          >
            &#9881;
          </button>
        </div>
      </div>

      <div className="user-picker-hero">
        <h1>{t("app.title")}</h1>
        <p className="welcome-subtitle">{t("app.tagline")}</p>
      </div>

      <div className="user-picker-body">
        <p className="user-picker-prompt">{t("profile.whoPracticing")}</p>

        {profiles.length > 0 && (
          <div className="user-list">
            {profiles.map((p) => (
              <div key={p.id} className="user-btn-row">
                <button className="user-btn" disabled={busy} onClick={() => selectProfile(p.id)}>
                  {(() => {
                    // Crown is strictly per-profile: only a profile whose OWN theme
                    // override is gold/silver gets the emblem. A profile that merely
                    // inherits a gold/silver device theme (no override) shows none.
                    const override = getProfileTheme(p.id);
                    if (override !== "gold" && override !== "silver") return null;
                    return (
                      <span className="user-btn__crown" aria-hidden>
                        {override === "gold" ? "👑" : "♔"}
                      </span>
                    );
                  })()}
                  <span className="user-btn__name">{p.name}</span>
                  {!manage && (
                    <span className="user-btn__chevron" aria-hidden>
                      ›
                    </span>
                  )}
                </button>
                {manage && (
                  <button
                    className={`user-delete-btn${confirmId === p.id ? " confirm" : ""}`}
                    title={confirmId === p.id ? t("profile.deleteConfirm") : t("profile.delete")}
                    onClick={async () => {
                      if (confirmId === p.id) {
                        if (confirmTimer.current) clearTimeout(confirmTimer.current);
                        setConfirmId(null);
                        await deleteProfile(p.id);
                      } else {
                        armDelete(p.id);
                      }
                    }}
                  >
                    {confirmId === p.id ? "✓" : "✕"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="user-create">
          <input
            type="text"
            placeholder={t("profile.newPlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button onClick={handleCreate} disabled={busy || !newName.trim()}>
            {t("profile.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Active Module View ---

function ActiveModuleView({
  activeModule,
  user,
  language,
  onBack,
}: {
  modules: ModuleManifest[];
  activeModule: string;
  user: User;
  language: Language;
  onBack: () => void;
}) {
  const t = useT();
  const ModuleComponent = moduleLazyComponents[activeModule];

  if (!ModuleComponent) {
    onBack();
    return null;
  }

  return (
    <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
      <div className={`app-shell app-shell--${activeModule}`}>
        {/* Back visibility is owned entirely by the modules now: each screen
            decides whether to show a back by passing onBack to <ModuleScreen> or
            rendering <BackButton>. The platform just threads its exit handler in
            as `onExit`; there is no platform-drawn back and no exclusion list. */}
        <ModuleComponent userId={user.id} language={language} onExit={onBack} />
      </div>
    </Suspense>
  );
}

// --- Welcome Page ---

function WelcomePage({
  modules,
  user,
  arrangement,
  onSelectModule,
  onOpenSettings,
  onOpenCharStats,
  onSwitchProfile,
}: {
  modules: ModuleManifest[];
  user: User;
  // Module-selection layout variant from the active theme (grid is the default
  // look; a theme may request 'list'). Drives a class on .module-list.
  arrangement: "grid" | "list";
  onSelectModule: (_name: string) => void;
  onOpenSettings: () => void;
  onOpenCharStats: () => void;
  onSwitchProfile: () => void;
}) {
  const t = useT();
  const lang = useContext(LanguageContext);
  const debug = useDebug();
  const { dataLayer } = useOffline();
  const [userLevel, setUserLevel] = useState<{
    level: number;
    knownCount: number;
    fluency: number;
  } | null>(null);
  // The home activity grid shows the learning activities only; My Characters is
  // a loadable module but is reached from the fluency banner, so exclude it here.
  const gridModules = useMemo(() => modules.filter((m) => m.name !== "my-characters"), [modules]);

  useEffect(() => {
    if (!dataLayer) return;
    const di = dataLayer.getDebugInfo();
    const stats = dataLayer.getCharacterStatsList();
    const ms = dataLayer.getModuleSettings();
    const known = stats.filter((s) => isCharKnownClient(s as CharStat, ms)).length;
    setUserLevel({ level: di?.level || 0, knownCount: known, fluency: di?.fluency || 0 });
  }, [user.id, dataLayer]);

  // Push debug info
  useEffect(() => {
    const lines: { label: string; value: string }[] = [
      { label: "User", value: `${user.displayName} (id:${user.id})` },
    ];
    if (userLevel) {
      lines.push({ label: "Level", value: String(userLevel.level) });
      lines.push({ label: "Known", value: `${userLevel.knownCount} chars` });
    }
    debug.setLines(lines);
  }, [user, userLevel, debug]);

  return (
    <div className="welcome">
      <div className="welcome-header">
        <h1>{t("app.title")}</h1>
        <div className="welcome-actions">
          <button className="icon-btn" onClick={onOpenSettings} title={t("settings.title")}>
            &#9881;
          </button>
          <button className="user-badge" onClick={onSwitchProfile}>
            {user.displayName} &#9662;
          </button>
        </div>
      </div>
      {userLevel && (
        <div className="welcome-level" onClick={onOpenCharStats} style={{ cursor: "pointer" }}>
          {lang === "zh-TW" ? "流利度" : "Fluency"} {userLevel.fluency} — {userLevel.knownCount}{" "}
          {lang === "zh-TW" ? "個字" : "chars known"} ›
        </div>
      )}
      <p>{t("app.chooseModule")}</p>
      <div className={`module-list module-list--${arrangement}`}>
        {/* My Characters is a loadable module, but it's launched from the
            fluency banner above — not the activity grid — so it's filtered out
            here to keep the home screen to its 4 activity cards. */}
        {gridModules.map((m) => (
          <button
            key={m.name}
            className={`module-card module-card--${m.name}`}
            onClick={() => onSelectModule(m.name)}
          >
            <span className="module-icon">{m.icon}</span>
            <span className="module-name">
              {lang === "zh-TW" ? m.displayNameZh : m.displayName}
            </span>
          </button>
        ))}
        {gridModules.length === 0 && <p className="empty">{t("app.noModules")}</p>}
      </div>
    </div>
  );
}

// --- My Chars Page ---

interface CharStat {
  character: string;
  timesSeen: number;
  timesPerfect: number;
  timesCorrect: number;
  timesIncorrect: number;
  streakCorrect: number;
  bestStreakCorrect: number;
  lastSeen: string;
  lastPerfect: string;
  lastCorrect: string;
  lastResult: string;
  avgMs: number;
  recentResults: string;
}

// Mastery — single source of truth from shared package (pure, no node deps).
// Used by isCharKnownClient below to derive the home fluency banner's known
// count. (The My Characters screen's mastery/score/color helpers moved with it
// into modules/my-characters.)
import {
  computeMastery as sharedComputeMastery,
  masteryConfigFromSettings,
} from "@shared/character-stats/mastery";

function isCharKnownClient(s: CharStat, settings: Record<string, string>): boolean {
  // Condition 1: recent accuracy
  if (settings["known_recent_enabled"] !== "false") {
    const needed = parseInt(settings["known_recent_good"] || "3");
    const window = parseInt(settings["known_recent_window"] || "4");
    const codes = s.recentResults.split(",").filter((c) => c && c !== "S"); // exclude skips
    if (codes.length < needed) return false;
    const lastN = codes.slice(-window);
    if (lastN.filter((c) => c === "P" || c === "C").length < needed) return false;
  }
  // Condition 2: retention (uses shared mastery)
  if (settings["known_retention_enabled"] !== "false") {
    const retMin = parseInt(settings["known_retention_min"] || "80");
    if (s.timesSeen === 0) return false;
    const ret = sharedComputeMastery(s, masteryConfigFromSettings(settings));
    if (ret < retMin) return false;
  }
  // Condition 3: recency
  if (settings["known_recency_enabled"] !== "false") {
    const maxDays = parseInt(settings["known_recency_days"] || "30");
    const lastGood = s.lastPerfect > s.lastCorrect ? s.lastPerfect : s.lastCorrect;
    if (!lastGood) return false;
    const days = Math.floor((Date.now() - new Date(lastGood).getTime()) / 86400000);
    if (days > maxDays) return false;
  }
  return true;
}

// --- Profile Settings (per-profile: name + language) ---

function AppSettings({
  user,
  onUpdateDisplayName,
  onRetakePlacement,
  onBack,
  onThemeChange,
}: {
  user: User;
  onUpdateDisplayName: (_name: string) => Promise<void>;
  onRetakePlacement: () => void;
  onBack: () => void;
  // Bump the app-level effective-theme resolution after a per-profile override
  // change, so the new look applies immediately on Back (no reload).
  onThemeChange: () => void;
}) {
  const t = useT();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  // Per-profile theme override. '' = inherit the device theme (the default).
  const [profileTheme, setProfileThemeState] = useState(() => getProfileTheme(user.id) ?? "");
  const [userVoice, setUserVoiceState] = useState(getUserVoice(user.id));
  const [geminiKey, setGeminiKeyState] = useState(getUserGeminiKey(user.id));
  // Transient validity probe for the typed key. 'idle' renders nothing.
  type KeyTestStatus = "idle" | "testing" | "valid" | "invalid" | "rate_limited" | "error";
  const [keyTest, setKeyTest] = useState<KeyTestStatus>("idle");

  // Probe the CURRENT value of the key input (test what's typed) via the proxy —
  // the browser can't call Gemini directly (CORS). The key is sent transiently
  // and never logged.
  const handleTestKey = async () => {
    const apiKey = geminiKey.trim();
    if (!apiKey) return;
    setKeyTest("testing");
    try {
      const res = await fetch("/api/copybook/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) {
        setKeyTest("error");
        return;
      }
      const data = (await res.json()) as { reason?: string };
      setKeyTest(
        data.reason === "ok"
          ? "valid"
          : data.reason === "invalid"
            ? "invalid"
            : data.reason === "rate_limited"
              ? "rate_limited"
              : "error",
      );
    } catch {
      setKeyTest("error");
    }
  };

  const keyTestLabel =
    keyTest === "valid"
      ? t("settings.geminiKeyValid")
      : keyTest === "invalid"
        ? t("settings.geminiKeyInvalid")
        : keyTest === "rate_limited"
          ? t("settings.geminiKeyRateLimited")
          : keyTest === "error"
            ? t("settings.geminiKeyTestError")
            : "";

  const handleSaveName = async () => {
    const name = displayName.trim();
    if (!name || name === user.displayName) return;
    setSaving(true);
    await onUpdateDisplayName(name);
    setSaving(false);
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          {t("app.back")}
        </button>
        <h2>{t("settings.title")}</h2>
      </div>

      <div className="settings-section">
        <h3>{t("settings.displayName")}</h3>
        <div className="settings-name-row">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
          />
          {saving && <span className="settings-saving">{t("settings.saving")}</span>}
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("settings.theme")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          {t("settings.themeProfileHint")}
        </p>
        <ThemeSelect
          value={profileTheme}
          scope="profile"
          profileId={user.id}
          inheritLabel={t("settings.themeUseDevice")}
          onChange={(id) => {
            setProfileThemeState(id);
            setProfileTheme(user.id, id || null);
            onThemeChange();
          }}
        />
      </div>

      <div className="settings-section">
        <h3>{t("settings.modEnglish")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          {t("settings.voiceProfileHint")}
        </p>
        <VoiceSelect
          value={userVoice}
          inheritLabel={t("settings.voiceUseDevice")}
          onChange={(name) => {
            setUserVoiceState(name);
            setUserVoice(user.id, name);
            if (name) previewVoice(name);
          }}
        />
      </div>

      <div className="settings-section">
        <h3>{t("settings.geminiKey")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          {t("settings.geminiKeyHint")}
        </p>
        <div className="settings-name-row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("settings.geminiKeyPlaceholder")}
            value={geminiKey}
            onChange={(e) => {
              setGeminiKeyState(e.target.value);
              setUserGeminiKey(user.id, e.target.value);
              // Editing the key invalidates any prior result; clear it.
              setKeyTest("idle");
            }}
          />
          <button
            className="lever-pill"
            style={{ flex: "0 0 auto" }}
            onClick={handleTestKey}
            disabled={!geminiKey.trim() || keyTest === "testing"}
          >
            {keyTest === "testing" ? t("settings.geminiKeyTesting") : t("settings.geminiKeyTest")}
          </button>
        </div>
        {keyTestLabel && (
          <p className="settings-saving" style={{ marginTop: 8 }}>
            {keyTestLabel}
          </p>
        )}
      </div>

      <div className="settings-section">
        <button className="settings-option" onClick={onRetakePlacement}>
          {t("placement.retake")}
        </button>
      </div>
    </div>
  );
}

// --- Device Settings (account-wide: backup, app update, admin) ---

function DeviceSettings({
  settings,
  onUpdateSettings,
  onForceUpdate,
  onOpenAdmin,
  onOpenLevers,
  onOpenEnglishVoice,
  onBack,
  deviceTheme,
  onSetDeviceTheme,
}: {
  settings: UserSettings;
  onUpdateSettings: (_patch: Partial<UserSettings>) => Promise<void>;
  onForceUpdate: () => Promise<void>;
  onOpenAdmin: () => void;
  onOpenLevers: () => void;
  onOpenEnglishVoice: () => void;
  onBack: () => void;
  // Device-level theme — the default for every profile (each profile can
  // override). Free Default + code-gated Gold/Silver; the selector handles the
  // redeem flow inline.
  deviceTheme: string;
  onSetDeviceTheme: (_id: string) => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState("");
  // Selective restore: choosing a file opens a modal to pick profiles / prefs.
  const [restoreSummary, setRestoreSummary] = useState<BackupSummary | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [includePrefs, setIncludePrefs] = useState(true);
  const [importing, setImporting] = useState(false);
  // Code-unlock modal: a 4-digit code (entered on the {@link CodeEntry} keypad)
  // redeems device-level feature unlocks (e.g. premium / admin). `unlockBump` is
  // bumped on a successful redeem so the gated sections (which re-read
  // isFeatureUnlocked) re-render immediately, without a reload.
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [unlockBump, setUnlockBump] = useState(0);
  const adminUnlocked = useMemo(() => isFeatureUnlocked("admin"), [unlockBump]);
  // Local mirror of the device theme so the selector reflects the choice
  // instantly within this panel; the parent persists + re-resolves via onSet.
  const [themeValue, setThemeValue] = useState(deviceTheme);
  // Liveliness poke: only allow "Update app now" when the origin is reachable.
  // The update clears caches + reloads, so doing it offline would brick the app
  // shell. /data/version.json is neither precached nor runtime-cached, so this
  // fetch goes straight to the network (throws offline, resolves online).
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  // The content/build version baked into the currently-running app (build-time
  // global defined in vite.config.ts). Compared against the server's version below
  // so the user can see whether an update is available.
  const deviceVersion = __CONTENT_VERSION__;
  // The version the deployment currently serves, captured from the same
  // /data/version.json poke that drives serverReachable (no extra fetch). null
  // when offline / unreachable / not yet checked.
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  // Stable per-device id (read-or-create, persisted in localStorage) for support.
  const deviceId = useMemo(() => getDeviceId(), []);
  const [deviceIdCopied, setDeviceIdCopied] = useState(false);
  const copyDeviceId = useCallback(() => {
    navigator.clipboard
      ?.writeText(deviceId)
      .then(() => {
        setDeviceIdCopied(true);
        setTimeout(() => setDeviceIdCopied(false), 1500);
      })
      .catch(() => {});
  }, [deviceId]);
  const checkServer = useCallback(async () => {
    setServerReachable(null);
    if (!navigator.onLine) {
      setServerReachable(false);
      setServerVersion(null);
      return;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`/data/version.json?_ping=${Date.now()}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      setServerReachable(res.ok);
      if (res.ok) {
        try {
          const data = await res.json();
          setServerVersion(typeof data?.version === "string" ? data.version : null);
        } catch {
          setServerVersion(null);
        }
      } else {
        setServerVersion(null);
      }
    } catch {
      setServerReachable(false);
      setServerVersion(null);
    }
  }, []);
  useEffect(() => {
    checkServer();
    const onOnline = () => checkServer();
    const onOffline = () => {
      setServerReachable(false);
      setServerVersion(null);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [checkServer]);

  const handleBackup = async () => {
    setBackupMsg("");
    try {
      await exportBackup();
    } catch (e) {
      setBackupMsg((e as Error).message || "Backup failed");
    }
  };

  // Pick a file → parse + preview; the modal performs the actual import.
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBackupMsg("");
    try {
      const summary = await parseBackup(f);
      setPendingFile(f);
      setRestoreSummary(summary);
      setSelectedIds(new Set(summary.profiles.map((p) => p.id)));
      setIncludePrefs(summary.hasPrefs);
    } catch (err) {
      setBackupMsg((err as Error).message || "Restore failed");
    }
  };

  const allSelected = restoreSummary ? selectedIds.size === restoreSummary.profiles.length : false;
  const canImport = selectedIds.size > 0 || (includePrefs && !!restoreSummary?.hasPrefs);
  const toggleId = (id: number) =>
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => {
    if (!restoreSummary) return;
    setSelectedIds(allSelected ? new Set() : new Set(restoreSummary.profiles.map((p) => p.id)));
  };
  const cancelRestore = () => {
    if (!importing) {
      setRestoreSummary(null);
      setPendingFile(null);
    }
  };
  // Long content hashes are truncated to the first 8 chars for display.
  const shortVersion = (v: string) => (v.length > 8 ? v.slice(0, 8) : v);
  const handleConfirmImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    try {
      await importBackupSelective(pendingFile, { profileIds: [...selectedIds], includePrefs });
      setRestoreSummary(null);
      setPendingFile(null);
      setBackupMsg(t("backup.restored"));
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      setImporting(false);
      setRestoreSummary(null);
      setBackupMsg((err as Error).message || "Restore failed");
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          {t("app.back")}
        </button>
        <h2>{t("settings.title")}</h2>
      </div>

      <div className="settings-section">
        <h3>{t("settings.language")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {t("settings.languageHint")}
        </p>
        <div className="settings-options">
          <button
            className={`settings-option${settings.language === "zh-TW" ? " active" : ""}`}
            onClick={() => onUpdateSettings({ language: "zh-TW" })}
          >
            繁體中文
          </button>
          <button
            className={`settings-option${settings.language === "en" ? " active" : ""}`}
            onClick={() => onUpdateSettings({ language: "en" })}
          >
            English
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("settings.theme")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {t("settings.themeDeviceHint")}
        </p>
        <ThemeSelect
          value={themeValue}
          scope="device"
          refreshKey={unlockBump}
          onChange={(id) => {
            setThemeValue(id);
            onSetDeviceTheme(id);
          }}
        />
      </div>

      <div className="settings-section">
        <h3>{t("settings.orientation")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {t("settings.orientationLockHint")}
        </p>
        <button
          className={`settings-option${settings.orientationLock === "1" ? " active" : ""}`}
          onClick={() =>
            onUpdateSettings({ orientationLock: settings.orientationLock === "1" ? "0" : "1" })
          }
        >
          {t("settings.orientationLock")}
        </button>
      </div>

      <div className="settings-section">
        <h3>{t("backup.title")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {backupMsg || t("backup.hint")}
        </p>
        <button className="settings-option" onClick={handleBackup}>
          {t("backup.now")}
        </button>
        <button
          className="settings-option"
          style={{ marginTop: 8 }}
          onClick={() => fileRef.current?.click()}
        >
          {t("backup.restore")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleRestoreFile}
        />
      </div>

      <div className="settings-section">
        <h3>{t("settings.update")}</h3>
        <p className="settings-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {serverReachable === null
            ? t("settings.updateChecking")
            : serverReachable === false
              ? t("settings.updateOffline")
              : t("settings.updateHint")}
          {serverReachable === false && (
            <>
              {" · "}
              <button className="lever-link" onClick={checkServer}>
                {t("settings.updateRetry")}
              </button>
            </>
          )}
        </p>
        <button
          className="settings-option"
          onClick={onForceUpdate}
          disabled={serverReachable !== true}
        >
          {t("settings.updateNow")}
        </button>
        <p className="settings-hint" style={{ marginTop: 14, marginBottom: 0 }}>
          {t("settings.deviceVersion")}: {shortVersion(deviceVersion)}
        </p>
        <p className="settings-hint" style={{ marginTop: 4, marginBottom: 0 }}>
          {t("settings.serverVersion")}:{" "}
          {serverVersion === null ? t("settings.versionUnavailable") : shortVersion(serverVersion)}
          {serverVersion !== null && (
            <>
              {" · "}
              {serverVersion === deviceVersion
                ? t("settings.versionUpToDate")
                : t("settings.versionUpdateAvailable")}
            </>
          )}
        </p>
        <p
          className="settings-hint"
          style={{ marginTop: 4, marginBottom: 0, cursor: "pointer" }}
          onClick={copyDeviceId}
          title={t("settings.deviceId")}
        >
          {t("settings.deviceId")}: <span style={{ userSelect: "all" }}>{deviceId}</span>
          {deviceIdCopied && <> · {t("settings.deviceIdCopied")}</>}
        </p>
        <p className="settings-hint" style={{ marginTop: 4, marginBottom: 0 }}>
          <button className="lever-link" onClick={() => setShowCodeModal(true)}>
            {t("settings.enterCode")}
          </button>
        </p>
      </div>

      <div className="settings-section">
        <h3>{t("settings.advanced")}</h3>
        <button className="settings-option" onClick={onOpenLevers}>
          {t("settings.modWriting")}
        </button>
        <button className="settings-option" style={{ marginTop: 8 }} onClick={onOpenEnglishVoice}>
          {t("settings.modEnglish")}
        </button>
        {(import.meta.env.DEV || adminUnlocked) && (
          <button className="settings-logout" style={{ marginTop: 8 }} onClick={onOpenAdmin}>
            {t("settings.admin")}
          </button>
        )}
      </div>

      {restoreSummary && (
        <div className="restore-overlay" onClick={cancelRestore}>
          <div className="restore-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("backup.selectTitle")}</h3>
            <p className="settings-hint" style={{ marginTop: 0 }}>
              {t("backup.exportedAt")} {new Date(restoreSummary.exportedAt).toLocaleDateString()}
            </p>
            <label className="restore-row restore-row--all">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span>{t("backup.importAll")}</span>
            </label>
            {restoreSummary.profiles.map((p) => (
              <label className="restore-row" key={p.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleId(p.id)}
                />
                <span className="restore-row__name">{p.name}</span>
                <span className="restore-row__count">
                  {p.charCount} {t("backup.charsUnit")}
                </span>
              </label>
            ))}
            {restoreSummary.hasPrefs && (
              <label className="restore-row">
                <input
                  type="checkbox"
                  checked={includePrefs}
                  onChange={(e) => setIncludePrefs(e.target.checked)}
                />
                <span>{t("backup.includePrefs")}</span>
              </label>
            )}
            <p className="settings-hint">{t("backup.prefsHint")}</p>
            <div className="restore-actions">
              <button className="lever-pill" onClick={cancelRestore} disabled={importing}>
                {t("backup.cancel")}
              </button>
              <button
                className="lever-pill active"
                onClick={handleConfirmImport}
                disabled={importing || !canImport}
              >
                {importing ? t("backup.importing") : t("backup.import")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCodeModal && (
        <CodeEntry
          // Device scope: redeem at device level. redeemCode returns the
          // granted / prerequisite-missing / unknown outcome — structurally a
          // CodeResult, so it maps straight through.
          onSubmit={(code) => redeemCode(code)}
          // A granted code → re-render gated sections immediately (no reload).
          onUnlocked={() => setUnlockBump((n) => n + 1)}
          onClose={() => setShowCodeModal(false)}
        />
      )}
    </div>
  );
}
