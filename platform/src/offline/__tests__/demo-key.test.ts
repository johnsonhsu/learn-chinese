// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The shared demo-aware localStorage key accessor (issue #48). demoKey() is the
 * ONE place the `-demo` suffix is applied, so every settable store is isolated in
 * demo mode by construction. The branch is chosen by the memoized isDemoMode(),
 * fixed at module load — so each branch is exercised by mocking the predicate and
 * re-importing the module fresh (mirrors theme-store-demo.test.ts).
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../demo-mode.js');
});

/** Re-import demo-key with isDemoMode() pinned to `demo`. */
async function loadDemoKey(demo: boolean) {
  vi.resetModules();
  vi.doMock('../demo-mode.js', () => ({ isDemoMode: () => demo }));
  return await import('../demo-key.js');
}

describe('demoKey — REAL (non-demo) path', () => {
  it('returns the base key unchanged (the real instance never sees the suffix)', async () => {
    const { demoKey } = await loadDemoKey(false);
    expect(demoKey('lc-unlocks')).toBe('lc-unlocks');
    expect(demoKey('lc-theme-u1')).toBe('lc-theme-u1');
    expect(demoKey('pe-en-voice')).toBe('pe-en-voice');
  });

  it('resetDemoKeys() is a NO-OP outside demo — real keys (incl. any -demo) survive', async () => {
    const { resetDemoKeys } = await loadDemoKey(false);
    localStorage.setItem('lc-unlocks', JSON.stringify(['premium-prereq']));
    localStorage.setItem('some-stray-demo', 'x'); // even a stray -demo key is left alone outside demo
    resetDemoKeys();
    expect(localStorage.getItem('lc-unlocks')).toBe(JSON.stringify(['premium-prereq']));
    expect(localStorage.getItem('some-stray-demo')).toBe('x');
  });
});

describe('demoKey — DEMO path', () => {
  it('suffixes every base key with -demo (static + dynamic per-profile)', async () => {
    const { demoKey } = await loadDemoKey(true);
    expect(demoKey('lc-unlocks')).toBe('lc-unlocks-demo');
    expect(demoKey('lc-theme-u1')).toBe('lc-theme-u1-demo');
    expect(demoKey('lc-gemini-key-u2')).toBe('lc-gemini-key-u2-demo');
    expect(demoKey('copybook:3')).toBe('copybook:3-demo');
  });

  it('resetDemoKeys() clears the cosmetic/progress -demo keys but leaves real keys byte-identical', async () => {
    const { resetDemoKeys } = await loadDemoKey(true);
    // Real instance's keys (no suffix) — must be untouched.
    localStorage.setItem('lc-unlocks', JSON.stringify(['premium-prereq', 'theme-gold']));
    localStorage.setItem('lc-theme-u1', 'gold');
    localStorage.setItem('pe-en-voice', 'Samantha');
    localStorage.setItem('lc-gemini-key-u1', 'real-secret-key');
    const realBefore = {
      unlocks: localStorage.getItem('lc-unlocks'),
      theme: localStorage.getItem('lc-theme-u1'),
      voice: localStorage.getItem('pe-en-voice'),
      gemini: localStorage.getItem('lc-gemini-key-u1'),
    };
    // Demo-scoped state accrued during the session.
    localStorage.setItem('lc-theme-u1-demo', 'silver');
    localStorage.setItem('pe-en-voice-demo', 'Daniel');
    localStorage.setItem('lc-gemini-key-u1-demo', 'demo-secret');
    localStorage.setItem('wc_auto_skip-demo', 'true');

    resetDemoKeys();

    // Every cosmetic/progress -demo key gone.
    expect(localStorage.getItem('lc-theme-u1-demo')).toBeNull();
    expect(localStorage.getItem('pe-en-voice-demo')).toBeNull();
    expect(localStorage.getItem('lc-gemini-key-u1-demo')).toBeNull();
    expect(localStorage.getItem('wc_auto_skip-demo')).toBeNull();
    // Real keys byte-identical.
    expect(localStorage.getItem('lc-unlocks')).toBe(realBefore.unlocks);
    expect(localStorage.getItem('lc-theme-u1')).toBe(realBefore.theme);
    expect(localStorage.getItem('pe-en-voice')).toBe(realBefore.voice);
    expect(localStorage.getItem('lc-gemini-key-u1')).toBe(realBefore.gemini);
  });

  it('resetDemoKeys() PRESERVES the demo unlocks key — an in-session unlock survives the always-fresh reset (issue #63)', async () => {
    const { resetDemoKeys, UNLOCKS_BASE_KEY, DEMO_SUFFIX } = await loadDemoKey(true);
    const demoUnlocksKey = `${UNLOCKS_BASE_KEY}${DEMO_SUFFIX}`; // 'lc-unlocks-demo'
    // A code unlock the visitor just made this session, plus cosmetic demo state.
    localStorage.setItem(demoUnlocksKey, JSON.stringify(['admin-prereq', 'admin']));
    localStorage.setItem('lc-theme-u1-demo', 'silver');

    resetDemoKeys(); // the SW auto-reload / ensureDemoSeed path

    // Unlock survives → the user is NOT kicked out of admin.
    expect(localStorage.getItem(demoUnlocksKey)).toBe(JSON.stringify(['admin-prereq', 'admin']));
    // Cosmetic demo state still resets (always-fresh otherwise unchanged).
    expect(localStorage.getItem('lc-theme-u1-demo')).toBeNull();
  });
});
