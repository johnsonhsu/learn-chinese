/**
 * Offline sync queue — stores write operations in IndexedDB
 * for later replay when the device comes back online.
 */

const SYNC_DB_NAME = 'learning-chinese-sync';
const SYNC_DB_VERSION = 1;
const STORE_NAME = 'queue';

export interface SyncEntry {
  id: string;
  timestamp: string;
  type: 'character_attempt' | 'report_sentence';
  payload: unknown;
  status: 'pending' | 'synced' | 'failed';
  retries: number;
}

function openSyncDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSync(type: SyncEntry['type'], payload: unknown): Promise<void> {
  const db = await openSyncDb();
  const entry: SyncEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    payload,
    status: 'pending',
    retries: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingEntries(): Promise<SyncEntry[]> {
  const db = await openSyncDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const idx = tx.objectStore(STORE_NAME).index('status');
    const req = idx.getAll('pending');
    req.onsuccess = () => resolve(req.result as SyncEntry[]);
    req.onerror = () => reject(req.error);
  });
}

export async function markSynced(id: string): Promise<void> {
  const db = await openSyncDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as SyncEntry | undefined;
      if (entry) {
        entry.status = 'synced';
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openSyncDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const idx = tx.objectStore(STORE_NAME).index('status');
    const req = idx.count('pending');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const SYNC_ENDPOINTS: Record<SyncEntry['type'], string> = {
  character_attempt: '/character-stats/record',
  report_sentence: '/writing-challenge/report-sentence',
};

export async function syncAll(apiBase: string): Promise<{ synced: number; failed: number }> {
  const entries = await getPendingEntries();
  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    const url = `${apiBase}${SYNC_ENDPOINTS[entry.type] ?? ''}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.payload),
      });
      if (res.ok) {
        await markSynced(entry.id);
        synced++;
      } else {
        await incrementRetry(entry.id);
        failed++;
      }
    } catch {
      await incrementRetry(entry.id);
      failed++;
    }
  }

  return { synced, failed };
}

async function incrementRetry(id: string): Promise<void> {
  const db = await openSyncDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as SyncEntry | undefined;
      if (entry) {
        entry.retries++;
        if (entry.retries >= 10) entry.status = 'failed';
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
