/**
 * Cloudflare Pages Function — PROD proxy for the Settings "Test" button that
 * checks whether a user-supplied Gemini API key is valid.
 *
 * Route: POST /api/copybook/test-key  (mirrors the dev Express route in
 * modules/copybook/server/index.ts). It REUSES the same portable helper
 * (modules/copybook/server/gemini.ts → testKey) — no duplication.
 *
 * Unlike generate.ts, this ALWAYS tests the client-provided key (the one the
 * user just typed) rather than any server secret: there's no point validating
 * the device key here. The key is used transiently for this one request only —
 * never persisted or logged.
 *
 * This file lives outside platform/tsconfig's include, so `tsc`/vite ignore it;
 * wrangler compiles it at deploy time.
 */
import { testKey } from '../../../../modules/copybook/server/gemini.ts';

interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request } = context;
  try {
    const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) {
      return Response.json({ error: 'apiKey required' }, { status: 400 });
    }
    const result = await testKey(apiKey);
    return Response.json(result);
  } catch {
    // testKey is total (never throws), but stay defensive — never log the key.
    return Response.json({ valid: false, reason: 'error' }, { status: 500 });
  }
}
