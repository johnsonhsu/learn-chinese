/**
 * Lightweight .env loader (no dependency).
 *
 * `dotenv` is not installed, so we parse a local `.env` file by hand at startup
 * and copy any keys that aren't already in process.env. This means a developer
 * can drop GEMINI_API_KEY into a local `.env` (at the repo root or platform/) and
 * the copybook /generate route picks it up regardless of who launches the server.
 *
 * Real environment variables always win over the file (we never overwrite them),
 * so production secrets set via the host are untouched.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let loaded = false;

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load .env files (repo root + platform/) into process.env without clobbering
 * any value that is already set. Idempotent.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const here = dirname(fileURLToPath(import.meta.url)); // modules/copybook/server
  const candidates = [
    join(here, '..', '..', '..', '.env'), // repo root
    join(here, '..', '..', '..', 'platform', '.env'), // platform/.env
  ];

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const parsed = parseEnv(readFileSync(path, 'utf-8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      // Best-effort: a malformed/unreadable .env must never crash the server.
    }
  }
}
