// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * DEMO ISOLATION of the DEVICE theme (issue #27 demo-by-default, PR #31 revision).
 *
 * The device theme is the one bit of theme state that lives in localStorage, NOT
 * in the demo IndexedDB jar the always-fresh reset wipes. So it must be:
 *   · DEMO-SCOPED — in demo mode it reads/writes an isolated `lc-gold-mode-demo`
 *     key, NEVER the real `lc-gold-mode` (which is also the installed PWA's theme
 *     on the same origin — clobbering it would wipe a real user's choice).
 *   · RESET each demo load — resetDemoDeviceTheme() clears only the demo key.
 *
 * DEVICE_THEME_KEY is decided once at module load from isDemoMode(), so each
 * branch is exercised by mocking the predicate and re-importing the module fresh.
 */

const REAL_KEY = 'lc-gold-mode';
const DEMO_KEY = 'lc-gold-mode-demo';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../offline/demo-mode.js');
});

/** Re-import theme-store with isDemoMode() pinned to `demo`. */
async function loadThemeStore(demo: boolean) {
  vi.resetModules();
  vi.doMock('../../offline/demo-mode.js', () => ({ isDemoMode: () => demo }));
  return await import('../theme-store.js');
}

describe('device theme — REAL (installed PWA / non-demo) path', () => {
  it('persists under the historical lc-gold-mode key, not the demo key', async () => {
    const ts = await loadThemeStore(false);
    ts.setDeviceTheme('midnight');
    expect(localStorage.getItem(REAL_KEY)).toBe('midnight');
    expect(localStorage.getItem(DEMO_KEY)).toBeNull();
    expect(ts.getDeviceTheme()).toBe('midnight');
  });

  it('resetDemoDeviceTheme() is a NO-OP outside demo — the real theme survives', async () => {
    const ts = await loadThemeStore(false);
    ts.setDeviceTheme('midnight');
    ts.resetDemoDeviceTheme();
    expect(localStorage.getItem(REAL_KEY)).toBe('midnight'); // untouched
    expect(ts.getDeviceTheme()).toBe('midnight');
  });
});

describe('device theme — DEMO path', () => {
  it('reads/writes the isolated demo key, never the real lc-gold-mode', async () => {
    const ts = await loadThemeStore(true);
    ts.setDeviceTheme('midnight');
    expect(localStorage.getItem(DEMO_KEY)).toBe('midnight');
    expect(localStorage.getItem(REAL_KEY)).toBeNull();
    expect(ts.getDeviceTheme()).toBe('midnight');
  });

  it('a real lc-gold-mode set by the installed PWA is NOT read or overwritten in demo', async () => {
    // Simulate the installed PWA having chosen 'gold' under the real key.
    localStorage.setItem(REAL_KEY, 'gold');
    const ts = await loadThemeStore(true);
    // Demo ignores the real key entirely → falls back to the default selection.
    expect(ts.getDeviceTheme()).not.toBe('gold');
    // Writing in demo must not touch the real key.
    ts.setDeviceTheme('sakura');
    expect(localStorage.getItem(REAL_KEY)).toBe('gold'); // preserved
    expect(localStorage.getItem(DEMO_KEY)).toBe('sakura');
  });

  it('resetDemoDeviceTheme() clears the demo key but leaves the real one intact', async () => {
    localStorage.setItem(REAL_KEY, 'gold'); // the installed PWA's real choice
    const ts = await loadThemeStore(true);
    ts.setDeviceTheme('midnight'); // demo-only selection
    expect(localStorage.getItem(DEMO_KEY)).toBe('midnight');

    ts.resetDemoDeviceTheme();
    expect(localStorage.getItem(DEMO_KEY)).toBeNull(); // demo reset → default
    expect(localStorage.getItem(REAL_KEY)).toBe('gold'); // real PWA theme protected
  });
});
