/**
 * DEMO-AWARE localStorage KEY NAMESPACING — one place that applies the `-demo`
 * suffix so EVERY settable localStorage channel is isolated in demo mode by
 * construction, instead of each store re-implementing the device-theme trick.
 *
 * THE LEAK THIS CLOSES (issue #48). Demo mode (`isDemoMode()`, demo-mode.ts) opens
 * an isolated IndexedDB jar, so everything kept in the jar resets each demo load
 * and never touches a real user. But localStorage keys are NOT jar-scoped: without
 * namespacing, a demo visitor's unlock code, theme, English voice, Gemini key,
 * copybook text, or auto-skip toggle would be READ FROM and WRITTEN TO the REAL
 * installed instance on the same origin — and because demo profile ids collide
 * with real ones (1, 2, …), per-profile demo writes land on the real user's keys.
 * That's a data-safety breach (a visitor could silently change the real device's
 * unlocks or overwrite a real API key), hence p1.
 *
 * THE FIX. Every settable key routes its base name through {@link demoKey}: in a
 * demo session it reads/writes the `<base>-demo` variant ONLY, never the real key;
 * in a real/installed session it uses the base name unchanged. The device theme
 * (`lc-gold-mode` → `lc-gold-mode-demo`, PR #31) is the precedent this generalizes.
 *
 * The choice is locked in at module load — `isDemoMode()` is memoized and fixed for
 * the page session, mirroring user-store.ts's jar choice and theme-store.ts. Stores
 * may either call `demoKey()` per access or capture it once at their module load;
 * either is consistent because the predicate never changes mid-session.
 *
 * RESET. {@link resetDemoKeys} wipes ALL `-demo`-suffixed localStorage keys; called
 * from ensureDemoSeed on every demo load so demo-scoped state is always-fresh (issue
 * #27), matching the IndexedDB reseed. Because it keys off the `-demo` suffix it
 * covers the dynamic per-profile keys (`lc-theme-u1-demo`, …) and any future
 * namespaced key without enumerating them.
 */
import { isDemoMode } from './demo-mode.js';

/** Suffix that marks the isolated demo variant of a localStorage key. */
export const DEMO_SUFFIX = '-demo';

/**
 * Base names of localStorage keys whose demo variant is a DELIBERATE in-session
 * USER ACTION that must SURVIVE the always-fresh demo reset — they are preserved
 * by {@link resetDemoKeys} (issue #63).
 *
 * WHY (issue #63 — the unlock kick-out). The always-fresh reset wipes demo
 * progress + cosmetic demo state on every demo load, but a demo load also happens
 * on the SW auto-reload that a navigation triggers in demo mode (useAppUpdate.ts:
 * onNeedRefresh → updateServiceWorker(true)). So a code the visitor just redeemed
 * (`lc-unlocks-demo`) would be wiped out from under them mid-session: the admin /
 * premium reveal vanishes, and re-entering a chained code (e.g. 8001 after its
 * 8000 prereq was wiped) is rejected as "Invalid code". An unlock is an explicit
 * user action, not seeded progress — it must persist across the reset.
 *
 * Isolation is unchanged: these are still the `-demo` variants, never the real
 * `lc-unlocks` key (#48), and `resetDemoKeys` is a no-op outside demo. A genuinely
 * fresh demo visit (no prior demo unlock on this browser) still starts with the
 * key absent → nothing unlocked. {@link unlocks} imports UNLOCKS_BASE_KEY from here
 * so the preserved name can never drift from the key it actually writes.
 */
export const UNLOCKS_BASE_KEY = 'lc-unlocks';
const PRESERVED_DEMO_KEYS = new Set([`${UNLOCKS_BASE_KEY}${DEMO_SUFFIX}`]);

/**
 * The localStorage key to actually use for `base`: `<base>-demo` in a demo
 * session, `base` unchanged otherwise. A real/installed instance NEVER sees the
 * suffix, so demo reads/writes can never touch the real key. Safe for dynamic
 * per-profile bases too (`lc-theme-u1` → `lc-theme-u1-demo`).
 */
export function demoKey(base: string): string {
  return isDemoMode() ? `${base}${DEMO_SUFFIX}` : base;
}

/**
 * Clear every demo-scoped localStorage key (those ending in `-demo`), EXCEPT the
 * {@link PRESERVED_DEMO_KEYS} (a code unlock the visitor made this session — see
 * issue #63). A NO-OP outside demo mode, so it can never wipe a real installed
 * instance's keys even on the same origin. Called from ensureDemoSeed on each demo
 * load to make demo-namespaced state (themes, voices, gemini key, copybook,
 * auto-skip) always-fresh — the localStorage analogue of reseeding the demo
 * IndexedDB jar. Unlocks are intentionally exempt so the always-fresh reset (which
 * also fires on the demo SW auto-reload) never kicks the user out of a feature
 * they just unlocked.
 */
export function resetDemoKeys(): void {
  if (!isDemoMode()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(DEMO_SUFFIX) && !PRESERVED_DEMO_KEYS.has(k)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* storage blocked — nothing persisted to clear */
  }
}
