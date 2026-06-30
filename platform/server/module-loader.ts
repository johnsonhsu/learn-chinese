import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Router } from 'express';

export interface ModuleManifest {
  name: string;
  displayName: string;
  displayNameZh: string;
  icon: string;
  apiPrefix: string;
  dbFile: string;
  order: number;
}

export interface LoadedModule {
  manifest: ModuleManifest;
  routes: Router;
  initDb: () => void;
}

export async function loadModules(modulesDir: string): Promise<LoadedModule[]> {
  const modules: LoadedModule[] = [];

  if (!existsSync(modulesDir)) return modules;

  const dirs = readdirSync(modulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const manifestPath = join(modulesDir, dir.name, 'module.json');
    if (!existsSync(manifestPath)) continue;

    const manifest: ModuleManifest = JSON.parse(
      readFileSync(manifestPath, 'utf-8')
    );

    const serverEntry = join(modulesDir, dir.name, 'server', 'index.ts');
    if (!existsSync(serverEntry)) continue;

    const mod = await import(serverEntry);
    modules.push({
      manifest,
      routes: mod.routes,
      initDb: mod.initDb,
    });
  }

  return modules.sort((a, b) => a.manifest.order - b.manifest.order);
}
