/**
 * DEMO MODE — a public "try it" experience with preset profiles + progress.
 *
 * Reached via `?demo` (use `/?app&demo` so the app boots instead of the landing
 * page). Two things make it safe and self-contained:
 *
 *  1. ISOLATED STORAGE. In demo mode user-store opens a SEPARATE IndexedDB
 *     (`learning-chinese-user-demo`), so seeding/eviction here can NEVER touch a
 *     real (installed) user's progress — even on the same origin. That's why
 *     "always reset the demo" is safe, where blindly evicting shared storage
 *     would not be.
 *  2. VERSION STAMP. `__demoVersion` gates reseeding: a returning visitor on the
 *     current version keeps their session; bump DEMO_VERSION (or change the seed)
 *     and every visitor is reseeded onto the new canonical demo. This is the
 *     "version check" — reliable, current demo state with no risk.
 *
 * The data is synthesized at runtime from the shipped char ranking (no bundled
 * dataset to maintain): a couple of profiles with a band of "known" chars.
 */
import { getPref, setPref } from './user-store.js';
import type { OfflineDataLayer } from './offline-data-layer.js';

/** True when the URL carries `?demo` (decided once; the param persists for the session). */
export function isDemoMode(): boolean {
  try {
    return new URLSearchParams(location.search).has('demo');
  } catch {
    return false;
  }
}

// Bump to force every demo visitor onto a fresh, current dataset.
const DEMO_VERSION = '1';

// Preset profiles: name + how many of the top-ranked chars to mark "known".
// Order matters — the LAST one is auto-selected on boot (setActiveProfile stamps
// lastProfileId), so the demo lands in the Beginner profile.
const PRESETS: { name: string; known: number }[] = [
  { name: 'Demo · Intermediate', known: 700 },
  { name: 'Demo · Beginner', known: 120 },
];

/**
 * Ensure the demo store holds the current canonical demo data. No-op if already
 * seeded at this version; otherwise wipes the (isolated) demo store and reseeds.
 * MUST be called only in demo mode, after dataLayer.initialize().
 */
export async function ensureDemoSeed(dl: OfflineDataLayer): Promise<void> {
  if ((await getPref<string>('__demoVersion')) === DEMO_VERSION) return;

  // Reset to canonical state. Safe: demo mode uses an isolated IndexedDB, so this
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
