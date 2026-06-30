/**
 * User store — the ONLY device-writable data. Kept separate from the shipped,
 * read-only content DBs so app/content updates never wipe practice progress.
 *
 * Multi-profile (v2):
 *  - profiles:     one record per local profile { id, name, createdAt }
 *  - profileStats: character_stats rows, keyed by [profileId, character]
 *  - prefs:        global key/value (theme, language, migration flags)
 *  - charStats:    LEGACY v1 single-profile store, kept read-only for migration
 */

// Demo mode uses a SEPARATE IndexedDB so preset demo data and any eviction/reseed
// can never touch a real (installed) user's progress, even on the same origin.
// `isDemoMode()` is the single source of truth (see demo-mode.ts): it covers the
// explicit `?demo` link AND a public browser `?app` load on the deployed host
// (issue #27 demo-by-default). The installed PWA (standalone) and dev/LAN hosts
// are NOT demo, so they keep the real `learning-chinese-user` jar.
import { isDemoMode } from './demo-mode.js';
const USER_DB_NAME = isDemoMode() ? 'learning-chinese-user-demo' : 'learning-chinese-user';
const USER_DB_VERSION = 2;
const LEGACY_STATS_STORE = 'charStats';
const PROFILE_STATS_STORE = 'profileStats';
const PROFILES_STORE = 'profiles';
const PREFS_STORE = 'prefs';

/** A raw character_stats row (snake_case, mirrors the SQLite schema). */
export type CharStatRecord = Record<string, unknown> & { character: string };

export interface Profile {
  id: number;
  name: string;
  createdAt: string;
}

// Memoize a single open connection. Every store helper used to open (and never
// close) a fresh IDBDatabase per call — on hot paths (recordAttempt → putProfileCharStats,
// getPref/setPref) those connections accumulate. We cache the open promise and reuse it.
let dbPromise: Promise<IDBDatabase> | null = null;

function openUserDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(USER_DB_NAME, USER_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PREFS_STORE)) db.createObjectStore(PREFS_STORE);
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PROFILE_STATS_STORE)) {
        const s = db.createObjectStore(PROFILE_STATS_STORE, { keyPath: ['profileId', 'character'] });
        s.createIndex('profileId', 'profileId', { unique: false });
      }
      // Legacy 'charStats' (v1) is intentionally left intact for migration.
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab/connection triggers an upgrade, close ours and drop the
      // cache so we don't block the upgrade and so the next call reopens cleanly.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      // A connection that closes unexpectedly must not stay cached.
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  // Don't leave a rejected promise cached — let the next call retry the open.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

// --- Profiles ---

export async function listProfiles(): Promise<Profile[]> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE, 'readonly');
    const req = tx.objectStore(PROFILES_STORE).getAll();
    req.onsuccess = () => resolve((req.result as Profile[]).sort((a, b) => a.id - b.id));
    req.onerror = () => reject(req.error);
  });
}

export async function putProfile(profile: Profile): Promise<void> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE, 'readwrite');
    tx.objectStore(PROFILES_STORE).put(profile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Create a new profile with an auto-assigned id. */
export async function createProfile(name: string): Promise<Profile> {
  // Monotonic IDs that NEVER reuse a deleted profile's number — otherwise stale
  // per-profile prefs (e.g. placementDone:<id>) would leak onto a recreated profile
  // and, for instance, skip its placement eval.
  const existing = await listProfiles();
  const maxExisting = existing.reduce((m, p) => Math.max(m, p.id), 0);
  const lastIssued = (await getPref<number>('__lastProfileId')) ?? 0;
  const id = Math.max(maxExisting, lastIssued) + 1;
  await setPref('__lastProfileId', id);
  const profile: Profile = { id, name, createdAt: new Date().toISOString() };
  await putProfile(profile);
  return profile;
}

export async function deleteProfile(id: number): Promise<void> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROFILES_STORE, PROFILE_STATS_STORE], 'readwrite');
    tx.objectStore(PROFILES_STORE).delete(id);
    // Delete that profile's stats via the profileId index.
    const idx = tx.objectStore(PROFILE_STATS_STORE).index('profileId');
    const cur = idx.openCursor(IDBKeyRange.only(id));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { c.delete(); c.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Per-profile character stats ---

export async function getProfileCharStats(profileId: number): Promise<CharStatRecord[]> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILE_STATS_STORE, 'readonly');
    const idx = tx.objectStore(PROFILE_STATS_STORE).index('profileId');
    const req = idx.getAll(IDBKeyRange.only(profileId));
    req.onsuccess = () => resolve(req.result as CharStatRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function countProfileCharStats(profileId: number): Promise<number> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILE_STATS_STORE, 'readonly');
    const idx = tx.objectStore(PROFILE_STATS_STORE).index('profileId');
    const req = idx.count(IDBKeyRange.only(profileId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Upsert character records for a profile (profileId is stamped onto each). */
export async function putProfileCharStats(profileId: number, records: CharStatRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILE_STATS_STORE, 'readwrite');
    const store = tx.objectStore(PROFILE_STATS_STORE);
    for (const r of records) store.put({ ...r, profileId });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read the legacy v1 single-profile stats (keyed by character), for migration. */
export async function getLegacyCharStats(): Promise<CharStatRecord[]> {
  const db = await openUserDb();
  if (!db.objectStoreNames.contains(LEGACY_STATS_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEGACY_STATS_STORE, 'readonly');
    const req = tx.objectStore(LEGACY_STATS_STORE).getAll();
    req.onsuccess = () => resolve(req.result as CharStatRecord[]);
    req.onerror = () => reject(req.error);
  });
}

// --- Global prefs ---

export async function getPref<T = string>(key: string): Promise<T | null> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PREFS_STORE, 'readonly');
    const req = tx.objectStore(PREFS_STORE).get(key);
    req.onsuccess = () => resolve((req.result ?? null) as T | null);
    req.onerror = () => reject(req.error);
  });
}

export async function setPref(key: string, value: unknown): Promise<void> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PREFS_STORE, 'readwrite');
    tx.objectStore(PREFS_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePref(key: string): Promise<void> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PREFS_STORE, 'readwrite');
    tx.objectStore(PREFS_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPrefKeys(): Promise<string[]> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PREFS_STORE, 'readonly');
    const req = tx.objectStore(PREFS_STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

/** Dump all prefs (key → value), for backup export. */
export async function getAllPrefs(): Promise<Record<string, unknown>> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PREFS_STORE, 'readonly');
    const store = tx.objectStore(PREFS_STORE);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    tx.oncomplete = () => {
      const out: Record<string, unknown> = {};
      const keys = keysReq.result as IDBValidKey[];
      const vals = valsReq.result as unknown[];
      keys.forEach((k, i) => { out[String(k)] = vals[i]; });
      resolve(out);
    };
    tx.onerror = () => reject(tx.error);
  });
}
