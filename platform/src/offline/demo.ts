/**
 * DEMO MODE — a public "try it" experience with preset profiles + progress.
 *
 * Reached via `?demo` (any host) OR — since issue #27 (demo-by-default) — a
 * public browser `?app` load on the deployed host. `isDemoMode()` (in
 * demo-mode.ts) is the single source of truth. Two things make it safe and
 * self-contained:
 *
 *  1. ISOLATED STORAGE. In demo mode user-store opens a SEPARATE IndexedDB
 *     (`learning-chinese-user-demo`), so seeding/eviction here can NEVER touch a
 *     real (installed) user's progress — even on the same origin. That's why
 *     "always reset the demo" is safe, where blindly evicting shared storage
 *     would not be.
 *  2. ALWAYS-FRESH (issue #27). The demo resets to the canonical preset state on
 *     EVERY load: in-session practice accrues and shows normally, but a refresh
 *     wipes it. `DEMO_VERSION` remains the identity of the canonical seed (bump
 *     it when the preset itself changes); the reset is unconditional now, so the
 *     stamp is written for diagnostics rather than gating reseed. The reset also
 *     covers theme state: per-profile overrides live in the demo jar and reset
 *     with it, and the DEVICE theme (a localStorage key, NOT in the jar) is reset
 *     via resetDemoDeviceTheme() — which clears only the isolated demo key, never
 *     the installed PWA's real 'lc-gold-mode'.
 *
 * The data is synthesized at runtime from the shipped char ranking (no bundled
 * dataset to maintain): a couple of profiles with a band of "known" chars.
 */
import { setPref, deletePref } from './user-store.js';
import { resetDemoDeviceTheme } from '../theme/theme-store.js';
import type { OfflineDataLayer } from './offline-data-layer.js';

// Re-exported so existing imports (`offline-context`, etc.) keep working while
// the predicate itself lives in one dependency-free place.
export { isDemoMode } from './demo-mode.js';

// Identity of the canonical preset seed. Always-fresh means every load reseeds,
// so this no longer gates the reset — it's stamped for diagnostics and bumped
// when the preset definition itself changes.
const DEMO_VERSION = '1';

// Preset profiles: name + how many of the top-ranked chars to mark "known".
// setActiveProfile is called per preset only to SCOPE the seeded char-stats to
// each profile id (seedKnownFromPlacement writes against the active userId); the
// trailing lastProfileId stamp it leaves is cleared at the end of ensureDemoSeed
// so the demo lands on the profile PICKER (issue #27 — show profile selection
// first as a demo), NOT auto-entered into a profile. Order is now cosmetic.
const PRESETS: { name: string; known: number }[] = [
  { name: 'Demo · Intermediate', known: 700 },
  { name: 'Demo · Beginner', known: 120 },
];

/**
 * Reset the (isolated) demo store to the canonical preset state. Always-fresh
 * (issue #27): this runs on EVERY demo load — a refresh wipes in-session
 * progress and reseeds, so visitors always start from the same clean demo and
 * never persist changes. Safe because demo mode uses a SEPARATE IndexedDB
 * (`learning-chinese-user-demo`); the real `learning-chinese-user` jar is never
 * touched. MUST be called only in demo mode, after dataLayer.initialize().
 */
export async function ensureDemoSeed(dl: OfflineDataLayer): Promise<void> {
  // Wipe to canonical state. Safe: demo mode uses an isolated IndexedDB, so this
  // only ever clears demo profiles (incl. any default profile init seeded).
  for (const p of await dl.listProfiles()) await dl.deleteProfile(p.id);

  // Reset the DEVICE theme too — it lives in a localStorage key (the isolated
  // demo key in demo mode), NOT in the jar deleteProfile just cleared, so it
  // would otherwise survive the refresh. Touches only the demo key; the real
  // installed-PWA theme is untouched.
  resetDemoDeviceTheme();

  const ranked = dl.getCharRanking().map((c) => c.char); // index 0 = rank 1
  for (const preset of PRESETS) {
    const p = await dl.createProfile(preset.name);
    await dl.setActiveProfile(p.id); // scope the seeded stats to THIS profile id
    await dl.seedKnownFromPlacement(ranked.slice(0, preset.known));
    await setPref(`placementDone:${p.id}`, true); // skip the placement eval in the demo
  }

  // Land on the profile PICKER, not a profile (issue #27 — a deliberate demo-only
  // divergence to showcase profile selection first). setActiveProfile above left
  // lastProfileId pointing at the final preset; clear it so resolveAutoProfileId
  // returns null with >1 profile → the picker shows. The real/installed app keeps
  // its normal restore-last-profile behavior (it never runs this seed).
  await deletePref('lastProfileId');

  await setPref('__demoVersion', DEMO_VERSION);
}
