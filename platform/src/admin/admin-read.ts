/**
 * Environment-aware admin READ accessor — the single source of truth for where
 * admin tabs get their read data, so the panels themselves never fork.
 *
 * The problem it solves: admin panels were written against DEV-only Express
 * routes (`/api/...`) that 404 on a released device. But the same read data is
 * baked into the shipped DBs and reachable through the offline data layer. We
 * do NOT want a dev copy and a device copy of each panel — any future change to
 * a tab's markup/logic must apply to both ends automatically.
 *
 * The fix: keep ONE panel and route ONLY its read calls through `useAdminRead`.
 *   - DEV (`import.meta.env.DEV`)  → the existing `/api` fetch, byte-for-byte.
 *   - on-device                    → the offline data layer, returning the SAME
 *                                     shape the server's JSON would have.
 * Because every panel keeps calling `read(path)` with the same paths and gets
 * the same shapes back, the divergence is confined to this one file. Other
 * admin tabs (Users / Dictionary / SQL) can adopt the same `read` later by
 * registering their read paths in the `offlineRead` map below.
 *
 * WRITES are deliberately NOT handled here — imports / generation / mutations
 * have no production route and stay DEV-only (gated on `mode === 'dev'` in the
 * panel). This accessor is read-only by design.
 */

import { useCallback } from 'react';
import { useOffline } from '../offline/offline-context.tsx';
import type { OfflineDataLayer } from '../offline/offline-data-layer.ts';

/** Where read data comes from for the current build. */
export type AdminReadMode = 'dev' | 'device';

/** A reader with the same call signature panels already used for `/api` reads. */
export type AdminRead = <T>(path: string) => Promise<T>;

/**
 * The DEV `/api` fetch, preserved exactly as the panels had it inline — including
 * surfacing the server's JSON `{ error }` message instead of a bare status code.
 */
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`);
  if (!r.ok) {
    const msg = await r
      .clone()
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => undefined);
    throw new Error(msg || `${r.status}`);
  }
  return r.json();
}

/**
 * On-device path → offline-data-layer result. Each entry MUST return the same
 * shape the matching Express route's JSON has (verified against the writing-
 * challenge admin routes). Add entries here as other tabs go on-device.
 */
function offlineRead(dl: OfflineDataLayer, path: string): unknown {
  // Split query string so `/foo?q=x&limit=1` matches the route by pathname.
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);

  switch (pathname) {
    case '/content/admin/char-coverage':
      return dl.getBankCoverage();
    case '/content/admin/bank-sentences': {
      const q = params.get('q') ?? '';
      const limitRaw = params.get('limit');
      const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
      return dl.getBankSentences(q, limit);
    }
    default:
      throw new Error(`No on-device read mapping for "${pathname}"`);
  }
}

/**
 * Returns `{ mode, read }`. Panels use `read(path)` for every read and branch
 * on `mode` only to hide DEV-only write affordances (Import, Generate, …).
 */
export function useAdminRead(): { mode: AdminReadMode; read: AdminRead } {
  const { dataLayer } = useOffline();
  const mode: AdminReadMode = import.meta.env.DEV ? 'dev' : 'device';

  const read = useCallback<AdminRead>(
    async <T,>(path: string): Promise<T> => {
      if (import.meta.env.DEV) return apiFetch<T>(path);
      if (!dataLayer) throw new Error('Offline data layer not ready');
      return offlineRead(dataLayer, path) as T;
    },
    [dataLayer],
  );

  return { mode, read };
}
