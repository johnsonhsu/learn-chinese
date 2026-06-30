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
 * The localStorage key to actually use for `base`: `<base>-demo` in a demo
 * session, `base` unchanged otherwise. A real/installed instance NEVER sees the
 * suffix, so demo reads/writes can never touch the real key. Safe for dynamic
 * per-profile bases too (`lc-theme-u1` → `lc-theme-u1-demo`).
 */
export function demoKey(base: string): string {
  return isDemoMode() ? `${base}${DEMO_SUFFIX}` : base;
}

/**
 * Clear every demo-scoped localStorage key (those ending in `-demo`). A NO-OP
 * outside demo mode, so it can never wipe a real installed instance's keys even
 * on the same origin. Called from ensureDemoSeed on each demo load to make all
 * demo-namespaced state (unlocks, themes, voices, gemini key, copybook, auto-skip)
 * always-fresh — the localStorage analogue of reseeding the demo IndexedDB jar.
 */
export function resetDemoKeys(): void {
  if (!isDemoMode()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(DEMO_SUFFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* storage blocked — nothing persisted to clear */
  }
}
