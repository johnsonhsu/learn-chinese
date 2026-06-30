/**
 * Stable per-device (per-install) identifier, used for support / debugging to
 * pinpoint a specific install. It is independent of which profile is selected:
 * one ID for the whole device, persisted in localStorage. Read-or-create —
 * generated once on first access, then reused on every subsequent launch.
 */
const DEVICE_ID_KEY = 'lc-device-id';

// NOTE: the per-device premium-skin selection (formerly getPremiumMode /
// setPremiumMode here, on the 'lc-gold-mode' key) has been generalized into the
// THEME system — see theme/theme-store.ts (getDeviceTheme / setDeviceTheme),
// which reuses the same 'lc-gold-mode' localStorage key so existing selections
// carry over. Theme gating lives in theme-store + utils/unlocks.

function generateId(): string {
  // crypto.randomUUID is the preferred source; guard it since older WebViews
  // and non-secure contexts may not expose it, then fall back to random hex.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (e.g. blocked) — return a non-persisted id so the
    // UI still renders rather than throwing.
    return generateId();
  }
}
