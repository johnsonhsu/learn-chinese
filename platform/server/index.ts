import express from 'express';
import { createServer as createViteServer } from 'vite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, createReadStream, statSync } from 'fs';
import { initDatabase, getModuleEnabled, getAllPlatformSettings, setPlatformSetting, getPlatformDb, getAllDictionaries } from './db.js';
import { getCharacterStats, recordCharacterAttempt } from '@shared/character-stats';
import { userRoutes } from './users.js';
import { createAdminRoutes } from './admin.js';
import { contentAdminRoutes } from './content-admin.js';
import { loadModules } from './module-loader.js';
import type { ModuleManifest } from './module-loader.js';
import { feedbackRoutes } from './feedback-routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Feedback POST carries a downscaled screenshot data-URL (capped ~300KB client-
// side, ~700KB hard server cap), which exceeds express.json()'s 100KB default.
// Mount the SILOED feedback router with its own larger body parser BEFORE the
// global parser, so only this physically-separate store path accepts big bodies;
// every app/user/content route keeps the tight 100KB default.
app.use('/api/feedback', express.json({ limit: '1mb' }), feedbackRoutes);

app.use(express.json());

// Initialize platform database
initDatabase();

// Load modules
const modulesDir = join(__dirname, '..', '..', 'modules');
const modules = await loadModules(modulesDir);

for (const mod of modules) {
  mod.initDb();
  console.log(`Loaded module: ${mod.manifest.name} → ${mod.manifest.apiPrefix}`);
}

// Platform routes
app.use('/api/users', userRoutes);
app.use('/api/admin', createAdminRoutes(modules, modulesDir));
// Platform-owned curriculum content (bank CRUD + coverage/ranking + AI gen).
app.use('/api/content', contentAdminRoutes);

app.get('/api/platform-settings', (_req, res) => {
  res.json(getAllPlatformSettings());
});

app.patch('/api/platform-settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    setPlatformSetting(key, String(value));
  }
  res.json(getAllPlatformSettings());
});

// --- User Level ---

app.get('/api/user-level', (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const stats = getCharacterStats(userId);

  // isCharKnown: 3 of last 4 correct/perfect, min 3 attempts
  // Simplified version — doesn't include mastery/recency (those are module-level settings)
  const knownChars = new Set<string>();
  for (const s of stats) {
    const codes = s.recentResults.split(',').filter(Boolean);
    if (codes.length < 3) continue;
    const last4 = codes.slice(-4);
    const good = last4.filter((c: string) => c === 'P' || c === 'C').length;
    if (good >= 3) knownChars.add(s.character);
  }

  res.json({
    knownChars: knownChars.size,
    totalAttempted: stats.length,
  });
});

// --- Character Stats (shared across modules) ---

app.get('/api/character-stats', (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json(getCharacterStats(userId));
});

app.post('/api/character-stats/record', (req, res) => {
  const { userId, char, result, failedStrokes, hintUsed, durationMs } = req.body;
  if (!userId || !char || !result) return res.status(400).json({ error: 'userId, char, result required' });
  recordCharacterAttempt(userId, char, {
    result, failedStrokes: failedStrokes || 0, hintUsed: hintUsed || false, durationMs: durationMs || 0,
  });
  res.json({ ok: true });
});

// --- Dictionary browsing ---

app.get('/api/dictionaries', (_req, res) => {
  const db = getPlatformDb();
  const dicts = getAllDictionaries();
  const result = dicts.map(d => {
    const charCount = (db.prepare('SELECT COUNT(*) as n FROM dict_chars WHERE dictionary_id = ?').get(d.id) as any).n;
    const wordCount = (db.prepare('SELECT COUNT(*) as n FROM dict_words WHERE dictionary_id = ?').get(d.id) as any).n;
    const linkCount = (db.prepare('SELECT COUNT(*) as n FROM dict_char_words cw JOIN dict_chars c ON c.id = cw.char_id WHERE c.dictionary_id = ?').get(d.id) as any).n;
    const withStrokes = (db.prepare('SELECT COUNT(*) as n FROM dict_chars WHERE dictionary_id = ? AND stroke_count > 0').get(d.id) as any).n;
    return { ...d, charCount, wordCount, linkCount, withStrokes };
  });
  res.json(result);
});

app.get('/api/dictionaries/:id/chars', (req, res) => {
  const db = getPlatformDb();
  const dictId = Number(req.params.id);
  const q = String(req.query.q || '').trim();
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || 50;

  const tocflOnly = req.query.tocfl === '1';
  const tocflFilter = tocflOnly
    ? 'AND EXISTS (SELECT 1 FROM dict_char_metadata tocfl WHERE tocfl.char_id = c.id AND tocfl.key = \'tocfl_level\')'
    : '';

  let rows: any[];
  if (q) {
    rows = db.prepare(`
      SELECT c.id, c.character, c.stroke_count,
             GROUP_CONCAT(m.key || '=' || m.value, '|') as metadata,
             CAST(COALESCE(freq.value, '99999') AS INTEGER) as freq_rank
      FROM dict_chars c
      LEFT JOIN dict_char_metadata m ON m.char_id = c.id
      LEFT JOIN dict_char_metadata freq ON freq.char_id = c.id AND freq.key = 'freq_book_rank'
      WHERE c.dictionary_id = ?
        AND (c.character LIKE ? OR EXISTS (
          SELECT 1 FROM dict_char_metadata m2 WHERE m2.char_id = c.id AND m2.value LIKE ?
        ))
        ${tocflFilter}
      GROUP BY c.id
      ORDER BY freq_rank, c.character
      LIMIT ? OFFSET ?
    `).all(dictId, `%${q}%`, `%${q}%`, limit, offset);
  } else {
    rows = db.prepare(`
      SELECT c.id, c.character, c.stroke_count,
             GROUP_CONCAT(m.key || '=' || m.value, '|') as metadata,
             CAST(COALESCE(freq.value, '99999') AS INTEGER) as freq_rank
      FROM dict_chars c
      LEFT JOIN dict_char_metadata m ON m.char_id = c.id
      LEFT JOIN dict_char_metadata freq ON freq.char_id = c.id AND freq.key = 'freq_book_rank'
      WHERE c.dictionary_id = ?
        ${tocflFilter}
      GROUP BY c.id
      ORDER BY freq_rank, c.character
      LIMIT ? OFFSET ?
    `).all(dictId, limit, offset);
  }

  const chars = rows.map(r => {
    const meta: Record<string, string> = {};
    if (r.metadata) {
      for (const pair of r.metadata.split('|')) {
        const [k, ...v] = pair.split('=');
        meta[k] = v.join('=');
      }
    }
    return { id: r.id, character: r.character, strokeCount: r.stroke_count, ...meta };
  });

  res.json(chars);
});

app.get('/api/dictionaries/:id/words', (req, res) => {
  const db = getPlatformDb();
  const dictId = Number(req.params.id);
  const q = String(req.query.q || '').trim();
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || 50;

  const tocflOnly = req.query.tocfl === '1';
  const tocflFilter = tocflOnly ? "AND w.level_source = 'TOCFL'" : '';

  let rows: any[];
  if (q) {
    rows = db.prepare(`
      SELECT w.id, w.word, w.definition, w.grammar, w.level, w.level_source,
             p_zh.value as zhuyin, p_py.value as pinyin
      FROM dict_words w
      LEFT JOIN dict_word_pronunciations p_zh ON p_zh.word_id = w.id AND p_zh.type = 'zhuyin'
      LEFT JOIN dict_word_pronunciations p_py ON p_py.word_id = w.id AND p_py.type = 'pinyin'
      WHERE w.dictionary_id = ? AND (w.word LIKE ? OR w.definition LIKE ?)
      ${tocflFilter}
      ORDER BY w.level, w.word
      LIMIT ? OFFSET ?
    `).all(dictId, `%${q}%`, `%${q}%`, limit, offset);
  } else {
    rows = db.prepare(`
      SELECT w.id, w.word, w.definition, w.grammar, w.level, w.level_source,
             p_zh.value as zhuyin, p_py.value as pinyin
      FROM dict_words w
      LEFT JOIN dict_word_pronunciations p_zh ON p_zh.word_id = w.id AND p_zh.type = 'zhuyin'
      LEFT JOIN dict_word_pronunciations p_py ON p_py.word_id = w.id AND p_py.type = 'pinyin'
      WHERE w.dictionary_id = ?
      ${tocflFilter}
      ORDER BY w.level, w.word
      LIMIT ? OFFSET ?
    `).all(dictId, limit, offset);
  }

  res.json(rows);
});

app.get('/api/dictionaries/:id/char/:charId', (req, res) => {
  const db = getPlatformDb();
  const charId = Number(req.params.charId);

  const char = db.prepare('SELECT * FROM dict_chars WHERE id = ?').get(charId) as any;
  if (!char) return res.status(404).json({ error: 'not found' });

  const meta = db.prepare('SELECT key, value FROM dict_char_metadata WHERE char_id = ?').all(charId) as { key: string; value: string }[];
  const words = db.prepare(`
    SELECT w.word, w.definition, w.level, p.value as zhuyin
    FROM dict_char_words cw
    JOIN dict_words w ON w.id = cw.word_id
    LEFT JOIN dict_word_pronunciations p ON p.word_id = w.id AND p.type = 'zhuyin'
    WHERE cw.char_id = ?
    ORDER BY w.level, w.word
  `).all(charId) as any[];

  const metadata: Record<string, string> = {};
  for (const m of meta) metadata[m.key] = m.value;

  res.json({ id: char.id, character: char.character, strokeCount: char.stroke_count, metadata, words });
});

// --- Char ranks lookup ---

app.get('/api/char-ranks', (req, res) => {
  const db = getPlatformDb();
  const chars = String(req.query.chars || '').split(',').filter(Boolean);
  if (chars.length === 0) return res.json({});

  const ranks: Record<string, number> = {};
  const stmt = db.prepare(
    "SELECT value FROM dict_char_metadata WHERE char_id = (SELECT id FROM dict_chars WHERE character = ? AND dictionary_id = 1) AND key = 'freq_book_rank'"
  );
  for (const c of chars) {
    const row = stmt.get(c) as { value: string } | undefined;
    if (row) ranks[c] = parseInt(row.value);
  }
  res.json(ranks);
});

// Only return enabled modules to the frontend
app.get('/api/modules', (_req, res) => {
  const manifests: ModuleManifest[] = modules
    .filter(m => getModuleEnabled(m.manifest.name))
    .map(m => m.manifest);
  res.json(manifests);
});

// Module routes (always mounted — admin can still hit disabled module APIs)
for (const mod of modules) {
  app.use(mod.manifest.apiPrefix, mod.routes);
}

// --- Health check for offline detection ---

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// --- DB snapshot endpoints for offline PWA ---

app.get('/api/db-snapshot/:name', (req, res) => {
  const name = req.params.name;
  const dbPaths: Record<string, string> = {
    'platform': join(__dirname, '..', 'platform.db'),
    'content': join(__dirname, '..', 'content.db'),
    'writing-challenge': join(__dirname, '..', '..', 'modules', 'writing-challenge', 'writing-challenge.db'),
  };
  const dbPath = dbPaths[name];
  if (!dbPath) return res.status(404).json({ error: 'Unknown database' });

  try {
    const stat = statSync(dbPath);

    // Check If-Modified-Since
    const ifModified = req.headers['if-modified-since'];
    if (ifModified && new Date(ifModified) >= stat.mtime) {
      return res.status(304).end();
    }

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
    });

    createReadStream(dbPath).pipe(res);
  } catch (_e) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// --- Serve frontend ---
const PORT = 3000;
// Bind to loopback by default so the dev-only server (no auth on /api/admin/*)
// is not exposed on all interfaces / untrusted LANs. Override with SERVER_HOST
// (e.g. SERVER_HOST=0.0.0.0) only when you intentionally need remote access.
const HOST = process.env.SERVER_HOST || '127.0.0.1';
const isDev = process.env.NODE_ENV !== 'production';

async function start() {
  if (isDev) {
    const vite = await createViteServer({
      root: join(__dirname, '..'),
      server: { middlewareMode: true },
    });
    app.use(vite.middlewares);
  } else {
    const distPath = join(__dirname, '..', 'dist');
    if (existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://localhost:${PORT} (bound to ${HOST})`);
    console.log(`Modules loaded: ${modules.map(m => m.manifest.name).join(', ')}`);
  });
}

start();
