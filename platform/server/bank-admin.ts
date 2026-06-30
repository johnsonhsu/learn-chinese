/**
 * STANDALONE, DEV-ONLY server for the Sentence Bank admin (issue #49).
 *
 * Why this exists: the main dev server on :3000 (`server/index.ts`,
 * `tsx watch server/index.ts`) restarts/hot-reloads constantly while iterating on
 * app/server code, and the Sentence Bank admin goes down with it — interrupting
 * curation (importing AI batches, the gap-fill prompt loop, the multi-run batch
 * auto-fill, browsing coverage). This is a SEPARATE process on its OWN port that
 * serves ONLY the Sentence Bank admin, so when :3000 bounces, curation keeps
 * running here.
 *
 * It reuses the exact same pieces as :3000 — no fork:
 *   - `contentAdminRoutes` (server/content-admin.ts) mounted at /api/content —
 *     the full bank CRUD + coverage/ranking/TOCFL-levels + AI generation.
 *   - the copybook module's `routes` mounted at /api/copybook — for the Gemini
 *     key-validation probe (POST /api/copybook/test-key) the Prompt tab uses.
 *   - the same Vite middleware-mode setup as :3000, but pointed at a tiny
 *     standalone HTML entry (bank-admin.html → bank-admin-main.tsx) that renders
 *     just <SentenceBankPanel />. The UI is served on the SAME ORIGIN as
 *     /api/content/* so the panel's same-origin `fetch('/api'+path)` works.
 *
 * Concurrency (issue #49, Option 1 — chosen by the maintainer): BOTH servers open
 * content.db read-write in WAL. WAL permits concurrent readers + a single writer
 * across processes; `getDb()` in shared/src/content-db.ts now also sets
 * `PRAGMA busy_timeout = 5000`, so a momentary write-lock RETRIES instead of
 * throwing SQLITE_BUSY. Edits made here land in the same content.db, so the normal
 * curate → `npm run seed:dbs` → commit flow is unchanged. FOOTGUN (unchanged):
 * never commit content.db while a server holds it open (WAL) — with two servers,
 * stop BOTH (or ensure neither is mid-write) before committing the DB.
 *
 * SECURITY: dev-only. Binds 127.0.0.1 (localhost) by default — NOT 0.0.0.0 — so
 * the unauthenticated admin/AI routes are not exposed on the LAN. Never deployed;
 * prod is a static PWA with no runtime server.
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { contentAdminRoutes } from './content-admin.js';
import { routes as copybookRoutes } from '../../modules/copybook/server/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dirname, '..');

// Configurable port, DEFAULT 3100 (deliberately NOT 3000 — that's the main app
// server). Override with BANK_ADMIN_PORT to dodge any local clash.
const PORT = Number(process.env.BANK_ADMIN_PORT) || 3100;
// Localhost-only by default (dev-only tool; don't expose unauth'd admin/SQL/AI on
// the LAN). Override with BANK_ADMIN_HOST only if you know what you're doing.
const HOST = process.env.BANK_ADMIN_HOST || '127.0.0.1';

const app = express();
app.use(express.json());

// The Sentence Bank routes (bank CRUD, coverage, ranking, TOCFL levels, AI gen),
// same router :3000 mounts. Backed by the shared content.db accessor.
app.use('/api/content', contentAdminRoutes);
// Copybook routes provide POST /api/copybook/test-key (the Gemini key probe the
// Prompt tab calls); without it the Generate affordance would just degrade.
app.use('/api/copybook', copybookRoutes);

// Health check (parity with :3000; handy for "is the bank server up?").
app.get('/api/health', (_req, res) => res.json({ ok: true, server: 'bank-admin' }));

async function start() {
  // Vite in middleware mode, scoped to the bank-admin HTML entry. Serving the
  // React UI here (same origin as /api/content/*) is what makes the panel's
  // same-origin `fetch('/api'+path)` reads/writes resolve. `import.meta.env.DEV`
  // is true under `vite dev`, so the panel takes its dev (/api) read path and
  // never touches the offline data layer — no OfflineProvider needed.
  // appType: 'custom' — Vite handles module/asset transforms + HMR but does NOT
  // auto-serve any index.html. That leaves OUR fallback (below) in control of
  // which HTML is served, so we serve bank-admin.html (the bank-only entry) and
  // never the full app's index.html.
  const vite = await createViteServer({
    root: platformRoot,
    appType: 'custom',
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);

  // SPA fallback: serve the standalone bank-admin entry for any non-/api route,
  // transformed by Vite (so HMR + the React plugin apply). We DON'T fall through
  // to index.html (the full app) — this server hosts only the bank admin.
  app.use(/^(?!\/api\/).*/, async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const template = await vite.transformIndexHtml(
        url,
        readFileSync(join(platformRoot, 'bank-admin.html'), 'utf-8'),
      );
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(PORT, HOST, () => {
    console.log(`\n  Sentence Bank admin (standalone, dev-only)`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  Reads/writes the SAME content.db as :3000 (WAL + busy_timeout).`);
    console.log(`  Survives :3000 restarts — separate process, separate port.\n`);
  });
}

start();
