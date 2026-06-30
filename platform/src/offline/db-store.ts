const DB_STORE_NAME = 'learning-chinese-dbs';
const DB_VERSION = 1;

// Memoize a single open connection and reuse it. Every helper here used to open
// (and never close) a new IDBDatabase per call; cache the open promise instead so
// connections don't accumulate.
let dbPromise: Promise<IDBDatabase> | null = null;

function openIDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_STORE_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('databases');
      req.result.createObjectStore('metadata');
    };
    req.onsuccess = () => {
      const db = req.result;
      // Close + drop the cache if another connection triggers an upgrade, so we
      // don't block it; reopen cleanly on the next call.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  // Don't cache a rejected promise — allow the next call to retry the open.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function storeDb(
  name: string,
  data: Uint8Array,
): Promise<void> {
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

/**
 * Per-download progress report. `total` is the Content-Length when the server
 * sends it; `null` means it's unknown (→ render an indeterminate bar). `loaded`
 * is the running byte count. `done` is set on the final report for this file.
 */
export interface DownloadProgress {
  loaded: number;
  total: number | null;
  done: boolean;
}

export async function downloadAndStoreDb(
  name: string,
  url: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download DB: ${response.status}`);

  const lenHeader = response.headers.get('Content-Length');
  // Missing Content-Length (e.g. chunked/compressed responses) → indeterminate.
  const total = lenHeader ? Number(lenHeader) || null : null;

  let data: Uint8Array;
  // Stream the body so we can count bytes as they arrive and report progress.
  // Fall back to arrayBuffer() if streaming isn't available (older runtimes).
  if (onProgress && response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    onProgress({ loaded: 0, total, done: false });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress({ loaded, total, done: false });
      }
    }
    // Concatenate the streamed chunks into one buffer.
    const size = chunks.reduce((n, c) => n + c.byteLength, 0);
    data = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) { data.set(c, offset); offset += c.byteLength; }
    onProgress({ loaded: size, total: total ?? size, done: true });
  } else {
    const buffer = await response.arrayBuffer();
    data = new Uint8Array(buffer);
    onProgress?.({ loaded: data.byteLength, total: data.byteLength, done: true });
  }

  await storeDb(name, data);
  return data;
}

export async function getDbMetadata(
  name: string,
): Promise<{ updatedAt: string; size: number } | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('metadata', 'readonly');
    const req = tx.objectStore('metadata').get(name);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// --- Content version (which shipped data snapshot is cached) ---

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
