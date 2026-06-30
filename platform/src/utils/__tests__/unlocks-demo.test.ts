// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * DEMO ISOLATION of UNLOCKS (issue #48 — the primary, p1 leak).
 *
 * Unlocks live in localStorage ('lc-unlocks'), NOT in the demo IndexedDB jar, so
 * without namespacing a code redeemed in the demo would write the REAL device's
 * key and demo would READ the real device's unlocks. UNLOCKS_KEY now routes
 * through demoKey() and is locked in at module load (isDemoMode() is memoized), so
 * the branch is exercised by mocking the predicate and re-importing fresh — same
 * shape as theme-store-demo.test.ts.
 */

const REAL_KEY = 'lc-unlocks';
const DEMO_KEY = 'lc-unlocks-demo';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../offline/demo-mode.js');
});

/** Re-import unlocks with isDemoMode() (the dep of demo-key) pinned to `demo`. */
async function loadUnlocks(demo: boolean) {
  vi.resetModules();
  vi.doMock('../../offline/demo-mode.js', () => ({ isDemoMode: () => demo }));
  return await import('../unlocks.js');
}

describe('unlocks — REAL (installed / non-demo) path', () => {
  it('redeeming writes the real lc-unlocks key, not the demo key', async () => {
    const u = await loadUnlocks(false);
    expect(u.redeemCode('9000')).toEqual({ status: 'granted', feature: 'premium-prereq' });
    expect(localStorage.getItem(REAL_KEY)).toBe(JSON.stringify(['premium-prereq']));
    expect(localStorage.getItem(DEMO_KEY)).toBeNull();
  });
});

describe('unlocks — DEMO path', () => {
  it('redeeming a code in demo writes ONLY lc-unlocks-demo, never the real key', async () => {
    const u = await loadUnlocks(true);
    u.redeemCode('9000');
    u.redeemCode('9901'); // theme-gold (requires premium-prereq)
    const demoSet = JSON.parse(localStorage.getItem(DEMO_KEY)!);
    expect(demoSet).toContain('premium-prereq');
    expect(demoSet).toContain('theme-gold');
    expect(localStorage.getItem(REAL_KEY)).toBeNull(); // real device untouched
  });

  it('demo does NOT read the real device unlocks — a real premium device shows nothing unlocked in demo', async () => {
    // The installed PWA has redeemed premium under the real key.
    localStorage.setItem(REAL_KEY, JSON.stringify(['premium-prereq', 'theme-gold']));
    const u = await loadUnlocks(true);
    expect(u.getUnlockedFeatures()).toEqual([]); // ignores the real key entirely
    expect(u.isFeatureUnlocked('theme-gold')).toBe(false);
  });

  it("a real user's unlocks are byte-identical before and after a demo redeem (no write-back, no id leak)", async () => {
    const realValue = JSON.stringify(['premium-prereq', 'theme-silver', 'admin-prereq', 'admin']);
    localStorage.setItem(REAL_KEY, realValue);
    const u = await loadUnlocks(true);
    // Demo visitor redeems the full premium + admin chain.
    u.redeemCode('9000');
    u.redeemCode('9900');
    u.redeemCode('8000');
    u.redeemCode('8001');
    // Real key untouched; everything landed on the demo key.
    expect(localStorage.getItem(REAL_KEY)).toBe(realValue);
    const demoSet = JSON.parse(localStorage.getItem(DEMO_KEY)!);
    expect(demoSet.sort()).toEqual(['admin', 'admin-prereq', 'premium-prereq', 'theme-silver']);
  });
});
