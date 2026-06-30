/**
 * THEME STORAGE + RESOLUTION.
 *
 * Two levels, mirroring how English-voice selection already works:
 *   · DEVICE theme  — one selection for the whole device (localStorage), shared
 *                     by every profile. Generalizes the legacy 'lc-gold-mode'.
 *   · PROFILE override — optional per-profile selection (localStorage, keyed by
 *                     profile id). null/absent → "use device theme".
 *
 * EFFECTIVE THEME = profileOverride ?? deviceTheme ?? 'default'. The resolved id
 * is what AppInner writes to `body[data-theme]`; index.css does the rest.
 *
 * Premium gating: each premium theme (theme.premium) is selectable only once its
 * OWN unlock feature is present at the DEVICE level (utils/unlocks 'lc-unlocks' →
 * all profiles): Silver ← 9900, Gold ← 9901, both gated behind the 9000 premium
 * prerequisite. There is no per-profile unlock — unlocks are device-wide (entered
 * under the Device ID in Settings). A per-profile theme OVERRIDE can still pick
 * among themes that are available device-wide. BACK-COMPAT: a device that stored
 * the legacy blanket 'premium' feature (retired code 9999) keeps BOTH foils.
 */

import {
  THEMES, getTheme, isThemeId, DEFAULT_THEME_ID, ROOT_THEME_ID, PREMIUM_FEATURE,
  type Theme,
} from './themes.js';
import { isFeatureUnlocked, setUnlockedFeatures } from '../utils/unlocks.js';
import { isDemoMode } from '../offline/demo-mode.js';

// Device-level theme selection. Reuses the historical localStorage key so an
// existing gold/silver device keeps its selection across the theme refactor.
//
// DEMO ISOLATION (issue #27 demo-by-default): the device theme is the ONE bit of
// theme state that lives in localStorage, NOT in the demo IndexedDB jar that the
// always-fresh reset wipes — so without isolation a theme picked in the demo
// would survive a refresh (and, worse, a shared key would let the demo overwrite
// the INSTALLED PWA's real theme on the same origin). Mirror user-store's jar
// choice: in demo mode the device theme reads/writes a SEPARATE `-demo` key,
// reset on each demo load (see resetDemoDeviceTheme); the real installed/non-demo
// path keeps using the historical 'lc-gold-mode' untouched. Decided once at
// module load — isDemoMode() is memoized and fixed for the page session.
const REAL_DEVICE_THEME_KEY = 'lc-gold-mode';
const DEMO_DEVICE_THEME_KEY = 'lc-gold-mode-demo';
const DEVICE_THEME_KEY = isDemoMode() ? DEMO_DEVICE_THEME_KEY : REAL_DEVICE_THEME_KEY;
// Per-profile theme override, keyed by profile id. Empty/absent → use device.
const profileThemeKey = (profileId: number) => `lc-theme-u${profileId}`;

// ── Device theme ────────────────────────────────────────────────────────────

/** The device-level theme id, defaulting to 'default' when unset/legacy/unknown.
 *  Legacy values 'gold'/'silver' map straight through (same ids); 'off' (the old
 *  premium-off sentinel) and anything unknown resolve to 'default'. */
export function getDeviceTheme(): string {
  try {
    const v = localStorage.getItem(DEVICE_THEME_KEY);
    return isThemeId(v) ? (v as string) : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

/** Set the device-level theme. 'default' clears the key (no stored value). */
export function setDeviceTheme(id: string): void {
  try {
    if (!isThemeId(id) || id === DEFAULT_THEME_ID) localStorage.removeItem(DEVICE_THEME_KEY);
    else localStorage.setItem(DEVICE_THEME_KEY, id);
  } catch {
    /* storage blocked — selection simply won't persist this session */
  }
}

/**
 * Reset the DEMO device theme to the default selection (always-fresh, issue #27).
 * Clears ONLY the isolated `lc-gold-mode-demo` key, so a theme picked while trying
 * the demo is wiped on the next demo load — matching how the demo IndexedDB jar is
 * reseeded. The real installed PWA's 'lc-gold-mode' is NEVER touched, even on the
 * same origin. Called from ensureDemoSeed; a no-op (and never writes the real key)
 * outside demo mode. Keep this paired with demo.ts's reset.
 */
export function resetDemoDeviceTheme(): void {
  if (!isDemoMode()) return;
  try {
    localStorage.removeItem(DEMO_DEVICE_THEME_KEY);
  } catch {
    /* storage blocked — nothing persisted to clear */
  }
}

// ── Per-profile override ──────────────────────────────────────────────────────

/** The profile's theme override, or null when it inherits the device theme. */
export function getProfileTheme(profileId: number): string | null {
  try {
    const v = localStorage.getItem(profileThemeKey(profileId));
    return isThemeId(v) ? (v as string) : null;
  } catch {
    return null;
  }
}

/** Set a profile's theme override. Pass null/'' to clear (→ inherit device). */
export function setProfileTheme(profileId: number, id: string | null): void {
  try {
    if (!id || !isThemeId(id)) localStorage.removeItem(profileThemeKey(profileId));
    else localStorage.setItem(profileThemeKey(profileId), id);
  } catch {
    /* storage blocked */
  }
}

// ── Gating + resolution ───────────────────────────────────────────────────────

/**
 * Whether ANY premium foil is unlocked on this device — true if the legacy
 * blanket 'premium' feature is stored (retired code 9999, back-compat) OR either
 * per-theme foil key is. Kept (and re-exported) for callers that want a coarse
 * "is this device premium at all" signal; per-theme gating lives in
 * isThemeAvailable. Unlocks are DEVICE-LEVEL only — there is no per-profile
 * unlock; a profile can only OVERRIDE among themes available device-wide.
 */
export function isDevicePremiumUnlocked(): boolean {
  if (isFeatureUnlocked(PREMIUM_FEATURE)) return true;
  return THEMES.some((th) => th.premium && th.unlockFeature != null && isFeatureUnlocked(th.unlockFeature));
}

/**
 * Is `theme` selectable? Free themes always are. A premium theme is available
 * when EITHER its own per-theme unlock feature is present (Silver ← 9900,
 * Gold ← 9901) OR — for back-compat — the device stored the legacy blanket
 * 'premium' feature (retired code 9999), which ungated both foils at once. The
 * selectors use this to list ONLY available themes — locked premium themes are
 * not shown at all.
 */
export function isThemeAvailable(theme: Theme): boolean {
  if (!theme.premium) return true;
  // Legacy blanket unlock ungates every premium theme.
  if (isFeatureUnlocked(PREMIUM_FEATURE)) return true;
  // Otherwise it needs its own per-theme key.
  return theme.unlockFeature != null && isFeatureUnlocked(theme.unlockFeature);
}

/**
 * EFFECTIVE THEME id for a profile: profileOverride ?? deviceTheme ?? 'default',
 * with a safety net — if the resolved theme is premium but premium is NOT
 * unlocked on this device (e.g. an unlock was revoked, or a backup carried a
 * selection without the unlock), fall back to 'default' so the UI never renders
 * a gated look the user can't otherwise reach.
 */
export function resolveEffectiveTheme(profileId: number | null): string {
  const override = profileId != null ? getProfileTheme(profileId) : null;
  const chosenId = override ?? getDeviceTheme();
  const theme = getTheme(chosenId);
  if (theme.premium && !isThemeAvailable(theme)) {
    return DEFAULT_THEME_ID;
  }
  return theme.id;
}

/**
 * Apply an effective theme id to the DOM. The ROOT theme (the editorial "Paper"
 * look, id 'default') REMOVES `body[data-theme]` — its tokens come from :root, so
 * the cascade stays byte-identical to pre-theming. EVERY other id (including the
 * default selection, Indigo) sets the attribute, behind which all theme CSS is
 * scoped. Keyed on ROOT_THEME_ID, not DEFAULT_THEME_ID, so the default selection
 * can itself be a real applied theme. AppInner drives this from a useEffect on
 * the resolved theme — keep the component calling this rather than re-inlining.
 */
export function applyThemeToBody(effectiveTheme: string, body: HTMLElement = document.body): void {
  if (effectiveTheme === ROOT_THEME_ID) delete body.dataset.theme;
  else body.dataset.theme = effectiveTheme;
}

// ── Backup serialization ──────────────────────────────────────────────────────

/** Snapshot of all theme-related localStorage, for the settings backup. */
export interface ThemeBackup {
  /** Device-level theme id ('default' when unset). */
  device: string;
  /** Per-profile overrides, keyed by profile id (only profiles with an override). */
  profileThemes: Record<number, string>;
  /**
   * LEGACY: per-profile premium-unlock sets, keyed by profile id. Premium is now
   * device-level only, so this is never written. Still accepted on import (an old
   * backup carrying a per-profile premium is promoted to the device unlock) and
   * kept on the type for backward-compatible parsing.
   */
  profileUnlocks?: Record<number, string[]>;
}

/** Gather the theme state for `profileIds` (device theme is always included). */
export function exportThemeState(profileIds: number[]): ThemeBackup {
  const profileThemes: Record<number, string> = {};
  for (const id of profileIds) {
    const th = getProfileTheme(id);
    if (th) profileThemes[id] = th;
  }
  return { device: getDeviceTheme(), profileThemes };
}

/**
 * Restore theme state from a backup. The device theme + per-profile overrides
 * are applied directly. Legacy per-profile unlocks are promoted to the
 * device-level unlock (premium is now device-wide), via setUnlockedFeatures so
 * existing device unlocks are never dropped. A legacy backup carrying the
 * blanket 'premium' feature is restored verbatim and keeps BOTH foils available
 * (isThemeAvailable honors that key for back-compat — see the removal of 9999).
 */
export function importThemeState(state: ThemeBackup | undefined): void {
  if (!state) return;
  if (typeof state.device === 'string') setDeviceTheme(state.device);
  for (const [idStr, themeId] of Object.entries(state.profileThemes || {})) {
    setProfileTheme(Number(idStr), typeof themeId === 'string' ? themeId : null);
  }
  // Promote any legacy per-profile unlock to the device-level set.
  const legacyFeatures = Object.values(state.profileUnlocks || {})
    .flat()
    .filter((v): v is string => typeof v === 'string');
  if (legacyFeatures.length) setUnlockedFeatures(Array.from(new Set(legacyFeatures)));
}

/** Re-export the catalogue for selector convenience. */
export { THEMES, getTheme };
