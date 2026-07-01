// Content-DB cache for reading-english. Uses its OWN IndexedDB jar name
// (`learning-english-reading-dbs`) so its cache is isolated from practice-english's
// `learning-english-dbs`. Both jars hold a copy of the shared read-only
// `content.db`; the CACHE isolation matters only for eviction hygiene — the
// per-user PROGRESS isolation lives in user-store.ts (a distinct jar too).
const DB_STORE_NAME = 'learning-english-reading-dbs';
const DB_VERSION = 1;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_STORE_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('databases');
      req.result.createObjectStore('metadata');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeDb(name: string, data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(['databases', 'metadata'], 'readwrite');
    tx.objectStore('databases').put(data, name);
    tx.objectStore('metadata').put(
      { name, updatedAt: new Date().toISOString(), size: data.byteLength },
      name,
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDb(name: string): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('databases', 'readonly');
    const req = tx.objectStore('databases').get(name);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function downloadAndStoreDb(name: string, url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download DB: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  await storeDb(name, data);
  return data;
}

const CONTENT_VERSION_KEY = '__contentVersion';

export async function getContentVersion(): Promise<string | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('metadata', 'readonly');
    const req = tx.objectStore('metadata').get(CONTENT_VERSION_KEY);
    req.onsuccess = () => resolve((req.result as string) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function setContentVersion(version: string): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put(version, CONTENT_VERSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
