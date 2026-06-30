/**
 * Code-gated feature unlocks. A DEVICE-level (not per-profile) persisted set of
 * unlocked feature keys, living in localStorage right next to the device id, so
 * unlocks are shared across every profile on this device and survive reloads.
 *
 * Features are unlocked by redeeming a short numeric code. CODE_FEATURES is the
 * single, extensible source of truth mapping each code to the feature it grants;
 * add a new `'CODE': 'feature'` pair here to mint a new unlock.
 */
const UNLOCKS_KEY = 'lc-unlocks';

/**
 * code → feature key. The only place codes are defined. Looking a code up here is
 * how redeemCode decides what (if anything) a code grants.
 */
export const CODE_FEATURES: Record<string, string> = {
  '9999': 'premium',
  '8888': 'admin',
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
 * Redeem a code. If it maps to a feature in CODE_FEATURES, add that feature to
 * the persisted set and return the feature key. Otherwise return null and change
 * nothing.
 */
export function redeemCode(code: string): string | null {
  const feature = CODE_FEATURES[code];
  if (!feature) return null;
  setUnlockedFeatures([feature]);
  return feature;
}
