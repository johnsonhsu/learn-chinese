import { Router } from 'express';
import { existsSync, realpathSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getAllUsers, getUser, deleteUser, getSettings,
  getAllModuleConfig, setModuleEnabled,
  runQuery, getDbPath,
} from './db.js';
import type { LoadedModule } from './module-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a path to its canonical absolute form, following symlinks where the
 * file exists. Defeats `..`/symlink tricks so the allowlist below can't be
 * escaped. Falls back to a plain resolve() for paths that don't exist yet.
 */
function canonical(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

export function createAdminRoutes(modules: LoadedModule[], modulesDir: string) {
  const adminRoutes = Router();

  // Allowlist of the known project DBs the SQL browser may open. The dev SQL
  // endpoints run caller-supplied SQL (readonly, SELECT/PRAGMA/WITH-only — see
  // db.ts runQuery), but `dbPath` was previously arbitrary, letting a caller
  // read ANY SQLite file the dev process could reach. Confine it to these.
  // Built from the same sources as GET /databases plus content.db (the
  // platform-owned curriculum), all canonicalized so symlinks/`..` can't escape.
  function allowedDbPaths(): Set<string> {
    const paths = [
      getDbPath(),                                      // platform.db
      join(__dirname, '..', 'content.db'),              // content.db (curriculum)
      ...modules.map(m => join(modulesDir, m.manifest.name, m.manifest.dbFile)),
    ];
    return new Set(paths.map(canonical));
  }

  /** Returns the canonical path if dbPath is allowlisted, else null. */
  function resolveAllowedDbPath(dbPath: unknown): string | null {
    if (typeof dbPath !== 'string' || !dbPath) return null;
    const target = canonical(dbPath);
    return allowedDbPaths().has(target) ? target : null;
  }

  // --- Users ---

  adminRoutes.get('/users', (_req, res) => {
    const users = getAllUsers().map(u => ({
      ...u,
      settings: getSettings(u.id),
    }));
    res.json(users);
  });

  adminRoutes.delete('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const user = getUser(id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    deleteUser(id);
    res.json({ ok: true });
  });

  // --- Modules ---

  adminRoutes.get('/modules', (_req, res) => {
    const config = getAllModuleConfig();
    const result = modules.map(m => ({
      ...m.manifest,
      enabled: config[m.manifest.name] ?? true,
    }));
    res.json(result);
  });

  adminRoutes.patch('/modules/:name', (req, res) => {
    const { name } = req.params;
    const mod = modules.find(m => m.manifest.name === name);
    if (!mod) return res.status(404).json({ error: 'Module not found' });
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' });
    setModuleEnabled(name, enabled);
    const config = getAllModuleConfig();
    res.json({ ...mod.manifest, enabled: config[name] ?? true });
  });

  // --- SQL Browser ---

  // List available databases (mirrors the SQL-browser allowlist)
  adminRoutes.get('/databases', (_req, res) => {
    const dbs: { name: string; path: string }[] = [];

    // Platform DB
    dbs.push({ name: 'platform', path: getDbPath() });

    // Content (curriculum) DB
    const contentPath = join(__dirname, '..', 'content.db');
    if (existsSync(contentPath)) {
      dbs.push({ name: 'content', path: contentPath });
    }

    // Module DBs
    for (const mod of modules) {
      const dbPath = join(modulesDir, mod.manifest.name, mod.manifest.dbFile);
      if (existsSync(dbPath)) {
        dbs.push({ name: mod.manifest.name, path: dbPath });
      }
    }

    res.json(dbs);
  });

  // Get tables for a database
  adminRoutes.post('/sql/tables', (req, res) => {
    const dbPath = resolveAllowedDbPath(req.body?.dbPath);
    if (!dbPath) return res.status(400).json({ error: 'dbPath must be one of the known project databases' });
    const result = runQuery(dbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    res.json(result);
  });

  // Run a query
  adminRoutes.post('/sql/query', (req, res) => {
    const dbPath = resolveAllowedDbPath(req.body?.dbPath);
    const { sql } = req.body ?? {};
    if (!dbPath) return res.status(400).json({ error: 'dbPath must be one of the known project databases' });
    if (!sql) return res.status(400).json({ error: 'sql required' });
    const result = runQuery(dbPath, sql);
    res.json(result);
  });

  return adminRoutes;
}
