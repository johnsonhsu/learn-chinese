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
 *     stamp is written for diagnostics rather than gating reseed.
 *
 * The data is synthesized at runtime from the shipped char ranking (no bundled
 * dataset to maintain): a couple of profiles with a band of "known" chars.
 */
import { setPref } from './user-store.js';
import type { OfflineDataLayer } from './offline-data-layer.js';

// Re-exported so existing imports (`offline-context`, etc.) keep working while
// the predicate itself lives in one dependency-free place.
export { isDemoMode } from './demo-mode.js';

// Identity of the canonical preset seed. Always-fresh means every load reseeds,
// so this no longer gates the reset — it's stamped for diagnostics and bumped
// when the preset definition itself changes.
const DEMO_VERSION = '1';

// Preset profiles: name + how many of the top-ranked chars to mark "known".
// Order matters — the LAST one is auto-selected on boot (setActiveProfile stamps
// lastProfileId), so the demo lands in the Beginner profile.
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

  const ranked = dl.getCharRanking().map((c) => c.char); // index 0 = rank 1
  for (const preset of PRESETS) {
    const p = await dl.createProfile(preset.name);
    await dl.setActiveProfile(p.id);
    await dl.seedKnownFromPlacement(ranked.slice(0, preset.known));
    await setPref(`placementDone:${p.id}`, true); // skip the placement eval in the demo
  }

  await setPref('__demoVersion', DEMO_VERSION);
}
