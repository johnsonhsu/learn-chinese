/**
 * User store for learnenglish — profiles + word mastery stats in IndexedDB.
 * Keeps user progress separate from the shipped content DB.
 */

const USER_DB_NAME = 'learning-english-user';
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

export async function createProfile(name: string): Promise<Profile> {
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
