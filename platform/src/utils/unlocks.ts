/**
 * Code-gated feature unlocks. A DEVICE-level (not per-profile) persisted set of
 * unlocked feature keys, living in localStorage right next to the device id, so
 * unlocks are shared across every profile on this device and survive reloads.
 *
 * Features are unlocked by redeeming a short numeric code. CODE_FEATURES is the
 * single, extensible source of truth mapping each code to what it grants — AND,
 * for codes that belong to a series, the prerequisite feature that must already
 * be unlocked before the code is accepted.
 *
 * TWO-TIER, PREREQUISITE-CHAINED SCHEME (issue #40). Each series opens with a
 * SEPARATE prerequisite flag that reveals nothing on its own; the feature codes
 * grant the actual reveals and are rejected until the prerequisite is present:
 *   PREMIUM series
 *     · 9000 → grants 'premium-prereq' (PREREQUISITE; reveals nothing alone).
 *     · 9900 → grants 'theme-silver', REQUIRES 'premium-prereq' first.
 *     · 9901 → grants 'theme-gold',   REQUIRES 'premium-prereq' first.
 *   ADMIN series (analogous)
 *     · 8000 → grants 'admin-prereq' (PREREQUISITE; reveals nothing alone).
 *     · 8001 → grants 'admin', REQUIRES 'admin-prereq' first (this is the
 *              admin-menu reveal that the retired code 8888 used to do).
 *
 * Why a SEPARATE prerequisite flag (not the blanket 'premium')? Two acceptance
 * criteria would otherwise collide: "9000 alone reveals nothing" vs. "a device
 * that already STORED 'premium' keeps its premium themes". So 9000 grants a
 * distinct 'premium-prereq', and the legacy blanket 'premium' key is honored
 * ONLY for back-compat (pre-stored devices / restored backups), never minted.
 *
 * REMOVED codes: the old flat 9999 ('premium', ungated BOTH foils) and 8888
 * ('admin') no longer redeem. BACK-COMPAT: devices that already STORED 'premium'
 * or 'admin' keep working — the legacy 'premium' still ungates both foils (see
 * theme-store.isThemeAvailable), and 'admin' still drives the admin gate.
 *
 * DEMO ISOLATION (issue #48): unlocks are localStorage, NOT in the demo IndexedDB
 * jar, so without namespacing a code redeemed in the demo would write the REAL
 * device's 'lc-unlocks' (and demo would READ real unlocks) — a data-safety leak.
 * The key routes through demoKey(): in a demo session it is 'lc-unlocks-demo',
 * read/written in isolation and reset each demo load (resetDemoKeys); the real
 * installed instance keeps 'lc-unlocks' untouched. Locked in at module load like
 * theme-store's device-theme key — isDemoMode() is memoized for the page session.
 */
import { demoKey, UNLOCKS_BASE_KEY } from '../offline/demo-key.js';

// Shared base name so the demo unlocks key that resetDemoKeys() PRESERVES (issue
// #63 — an in-session unlock survives the always-fresh reset) can never drift from
// the key we actually read/write here.
const UNLOCKS_KEY = demoKey(UNLOCKS_BASE_KEY);

/**
 * What redeeming a single code does. `grant` is the feature key it adds to the
 * device set; `requires`, when present, is the prerequisite feature key that
 * MUST already be unlocked or the code is rejected (the prerequisite-missing
 * outcome) and nothing is granted. Prerequisite codes (9000/8000) have no
 * `requires` and grant a flag that reveals nothing on its own.
 */
export interface CodeDef {
  grant: string;
  requires?: string;
}

/**
 * code → definition. The only place codes are defined. Looking a code up here is
 * how redeemCode decides what (if anything) a code grants, and whether its
 * prerequisite is satisfied.
 */
export const CODE_FEATURES: Record<string, CodeDef> = {
  // — Premium series —
  '9000': { grant: 'premium-prereq' },                          // prerequisite — reveals nothing alone
  '9900': { grant: 'theme-silver', requires: 'premium-prereq' },
  '9901': { grant: 'theme-gold', requires: 'premium-prereq' },
  // — Admin series —
  '8000': { grant: 'admin-prereq' },                            // prerequisite — reveals nothing alone
  '8001': { grant: 'admin', requires: 'admin-prereq' },
};

/** The set of feature keys unlocked on this device. Empty when unset / blocked. */
export function getUnlockedFeatures(): string[] {
  try {
    const raw = localStorage.getItem(UNLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return []; // storage blocked or malformed — nothing unlocked
  }
}

/** Whether a given feature key has been unlocked on this device. */
export function isFeatureUnlocked(key: string): boolean {
  return getUnlockedFeatures().includes(key);
}

/**
 * Replace/merge the unlocked-feature set (used by backup restore). De-duplicates
 * with the currently-persisted set so a restore never drops existing unlocks.
 */
export function setUnlockedFeatures(keys: string[]): void {
  try {
    const merged = Array.from(new Set([...getUnlockedFeatures(), ...keys]));
    localStorage.setItem(UNLOCKS_KEY, JSON.stringify(merged));
  } catch {
    /* storage blocked — set simply won't persist this session */
  }
}

/**
 * The outcome of redeeming a code, as a discriminated union so callers can tell
 * the three cases apart for logic/tests:
 *   · 'granted'              — code valid + prerequisite met; `feature` was added.
 *   · 'prerequisite-missing' — code valid but its prerequisite isn't unlocked yet;
 *                              nothing granted. `required` is the missing feature.
 *   · 'unknown'              — code not in CODE_FEATURES; nothing granted.
 *
 * NOTE — security by obscurity (issue #40 revision): the keypad deliberately
 * renders 'prerequisite-missing' EXACTLY like 'unknown' (the generic "Invalid
 * code" ❌), so a valid-but-locked code entered before its prerequisite is
 * indistinguishable from a genuinely invalid code — no hint that the code is
 * real or that a prerequisite exists. The status is still distinguished HERE
 * (and in tests) so the gating logic stays explicit; only the user-facing
 * message is identical. Both grant nothing.
 */
export type RedeemResult =
  | { status: 'granted'; feature: string }
  | { status: 'prerequisite-missing'; required: string }
  | { status: 'unknown' };

/**
 * Redeem a code. Looks it up in CODE_FEATURES; if it has an unmet prerequisite
 * the redemption is rejected ('prerequisite-missing') and nothing changes.
 * Otherwise the granted feature is added to the persisted device set and
 * returned ('granted'). Unknown codes return 'unknown' and change nothing.
 */
export function redeemCode(code: string): RedeemResult {
  const def = CODE_FEATURES[code];
  if (!def) return { status: 'unknown' };
  if (def.requires && !isFeatureUnlocked(def.requires)) {
    return { status: 'prerequisite-missing', required: def.requires };
  }
  setUnlockedFeatures([def.grant]);
  return { status: 'granted', feature: def.grant };
}
