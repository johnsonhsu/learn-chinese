import { Router } from 'express';
import { loadEnv } from './env.ts';
import { generateSentence, testKey, GeminiError, type GenerateSeed } from './gemini.ts';

export const routes = Router();

// POST /api/copybook/generate
// Body: { targetChar: string, knownChars?: string[], level?: number, rankCeiling?: number }
// Response (200): { sentence: string }
// Response (4xx/5xx): { error: string }  — e.g. 503 "Gemini key not configured"
//
// Best-effort online convenience: generates ONE natural Taiwan-Traditional
// sentence (seeded by the client's on-device level/known/target signals) for the
// user to copy verbatim into the copybook. The Gemini call + Traditional-only
// validation live in the portable ./gemini helper so the same logic can back a
// Cloudflare Pages Function in prod (see PROD note below).
routes.post('/generate', async (req, res) => {
  loadEnv();

  const body = (req.body ?? {}) as Partial<GenerateSeed> & { apiKey?: unknown };
  const targetChar = typeof body.targetChar === 'string' ? body.targetChar.trim() : '';
  if (!targetChar) {
    return res.status(400).json({ error: 'targetChar required' });
  }

  // BYO-key: a per-profile Gemini key sent by the client wins; else the
  // server/device key. Used transiently for THIS request only — never persisted
  // or logged.
  const clientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const apiKey = clientKey || process.env.GEMINI_API_KEY;

  const seed: GenerateSeed = {
    targetChar,
    knownChars: Array.isArray(body.knownChars)
      ? body.knownChars.filter((c): c is string => typeof c === 'string')
      : [],
    level: typeof body.level === 'number' ? body.level : undefined,
    rankCeiling: typeof body.rankCeiling === 'number' ? body.rankCeiling : undefined,
  };

  try {
    const result = await generateSentence(seed, {
      apiKey,
      model: process.env.GEMINI_MODEL, // optional override; helper defaults to a free Flash model
    });
    res.json(result);
  } catch (e) {
    if (e instanceof GeminiError) {
      return res.status(e.status).json({ error: e.message });
    }
    // Never crash the server on an unexpected failure.
    console.error('[copybook/generate] unexpected error:', e);
    res.status(500).json({ error: 'Sentence generation failed' });
  }
});

// POST /api/copybook/test-key
// Body: { apiKey: string }
// Response (200): { valid: boolean, reason: 'ok'|'invalid'|'rate_limited'|'error' }
// Response (400): { error: 'apiKey required' }
//
// Tests the CLIENT-PROVIDED key (the one the user just typed in Settings) via a
// free models-list probe — no generate quota burned. The key is used transiently
// for this one request only — never persisted or logged.
routes.post('/test-key', async (req, res) => {
  const body = (req.body ?? {}) as { apiKey?: unknown };
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return res.status(400).json({ error: 'apiKey required' });
  }

  try {
    const result = await testKey(apiKey);
    res.json(result);
  } catch (e) {
    // testKey is total (never throws), but stay defensive — never log the key.
    console.error('[copybook/test-key] unexpected error');
    void e;
    res.status(500).json({ valid: false, reason: 'error' });
  }
});

export function initDb() {}

// PROD: the app deploys to Cloudflare Pages as static assets (no Express server),
// so to enable this button in production add a Pages Function that reuses the same
// portable helper, e.g. functions/api/copybook/generate.ts:
//
//   import { generateSentence, GeminiError } from '../../../modules/copybook/server/gemini';
//   export const onRequestPost: PagesFunction<{ GEMINI_API_KEY: string; GEMINI_MODEL?: string }> =
//     async ({ request, env }) => {
//       const body = await request.json();
//       try {
//         const result = await generateSentence(body, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
//         return Response.json(result);
//       } catch (e) {
//         const status = e instanceof GeminiError ? e.status : 500;
//         return Response.json({ error: (e as Error).message }, { status });
//       }
//     };
//
// (Set GEMINI_API_KEY as a Pages env var / secret. The helper uses global fetch,
//  which Workers/Pages provide, so it runs unchanged in that runtime.)
