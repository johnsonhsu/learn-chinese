/**
 * Bundled stroke-order data for offline writing practice.
 *
 * hanzi-writer needs each character's stroke data to draw AND grade strokes.
 * Online it can pull from a CDN, but offline that fails — so we ship one bundle
 * (baked into /data/stroke-data.json), cache it in IndexedDB, and serve lookups
 * from an in-memory map. WritingCanvas's charDataLoader consults this first.
 */

import { loadDb, downloadAndStoreDb } from './db-store.js';

const STORE_KEY = 'stroke-data';

let strokeMap: Map<string, unknown> | null = null;

/** Synchronous lookup for charDataLoader; null until the bundle has loaded. */
export function getBundledStrokeData(char: string): unknown | null {
  return strokeMap?.get(char) ?? null;
}

export function isStrokeDataReady(): boolean {
  return strokeMap !== null;
}

/**
 * Load the stroke bundle into memory. Uses the IndexedDB cache when present;
 * (re)downloads when missing or when a new content version shipped. Safe to run
 * in the background — charDataLoader falls back to CDN until it's ready.
 */
export async function loadStrokeData(opts: { version: string | null; forceDownload: boolean }): Promise<void> {
  let bytes = await loadDb(STORE_KEY);
  if (!bytes || opts.forceDownload) {
    const bust = opts.version ? `?v=${opts.version}` : '';
    bytes = await downloadAndStoreDb(STORE_KEY, `/data/stroke-data.json${bust}`);
  }
  const text = new TextDecoder().decode(bytes);
  const obj = JSON.parse(text) as Record<string, unknown>;
  strokeMap = new Map(Object.entries(obj));
}
