import { Router } from 'express';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  getAllUsers, getUser, deleteUser, getSettings,
  getAllModuleConfig, setModuleEnabled,
  runQuery, getDbPath,
} from './db.js';
import type { LoadedModule } from './module-loader.js';

export function createAdminRoutes(modules: LoadedModule[], modulesDir: string) {
  const adminRoutes = Router();

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

  // List available databases
  adminRoutes.get('/databases', (_req, res) => {
    const dbs: { name: string; path: string }[] = [];

    // Platform DB
    dbs.push({ name: 'platform', path: getDbPath() });

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
    const { dbPath } = req.body;
    if (!dbPath) return res.status(400).json({ error: 'dbPath required' });
    const result = runQuery(dbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    res.json(result);
  });

  // Run a query
  adminRoutes.post('/sql/query', (req, res) => {
    const { dbPath, sql } = req.body;
    if (!dbPath || !sql) return res.status(400).json({ error: 'dbPath and sql required' });
    const result = runQuery(dbPath, sql);
    res.json(result);
  });

  return adminRoutes;
}
