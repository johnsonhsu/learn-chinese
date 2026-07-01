/**
 * User store for reading-english — per-word READING mastery stats in IndexedDB
 * (issue #69).
 *
 * ── STAT ISOLATION (the acceptance criterion) ──────────────────────────────────
 * This uses a DISTINCT IndexedDB database name (`learning-english-reading-user`)
 * from practice-english's SPELLING store (`learning-english-user`). Because the
 * two competencies live in physically separate IndexedDB databases, a reading
 * write can never key into (or double-count) a spelling row and vice-versa — the
 * isolation is at the storage layer, not a shared table with a discriminator
 * column. This mirrors how reading-chinese (#68) got its own `profileStatsReading`
 * store disjoint from writing's `profileStats`, but is architecturally cleaner
 * here because practice-english is already a self-contained word-based store.
 *
 * The RECORD SHAPE + mastery rule (≥3 of the last 4 attempts correct) are copied
 * from practice-english so the two English competencies are MEASURED identically —
 * they just never cross-contaminate.
 */

const USER_DB_NAME = 'learning-english-reading-user';
const USER_DB_VERSION = 1;
const PROFILE_STATS_STORE = 'profileStats';
const PROFILES_STORE = 'profiles';
const PREFS_STORE = 'prefs';

/** A word mastery record — `character` holds the English word being tracked. */
export type WordStatRecord = Record<string, unknown> & { character: string };

export interface Profile {
  id: number;
  name: string;
  createdAt: string;
}

function openUserDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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

export async function getProfileWordStats(profileId: number): Promise<WordStatRecord[]> {
  const db = await openUserDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILE_STATS_STORE, 'readonly');
    const idx = tx.objectStore(PROFILE_STATS_STORE).index('profileId');
    const req = idx.getAll(IDBKeyRange.only(profileId));
    req.onsuccess = () => resolve(req.result as WordStatRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function putProfileWordStats(profileId: number, records: WordStatRecord[]): Promise<void> {
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

/** The IndexedDB database name backing reading-english's per-word stats — exported
 *  so the stat-isolation test can assert it differs from practice-english's. */
export const READING_USER_DB_NAME = USER_DB_NAME;
