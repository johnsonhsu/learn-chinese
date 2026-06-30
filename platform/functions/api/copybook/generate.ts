/**
 * Cloudflare Pages Function — PROD proxy for the copybook "Generate" button.
 *
 * Route: POST /api/copybook/generate  (mirrors the dev Express route in
 * modules/copybook/server/index.ts). It REUSES the same generator logic
 * (modules/copybook/server/gemini.ts) — no duplication — but reads the API key
 * from the Pages environment (an encrypted secret) instead of process.env.
 *
 * Set the secret once (never commit the key):
 *   npx wrangler pages secret put GEMINI_API_KEY --project-name=learning-chinese
 *
 * This file lives outside platform/tsconfig's include, so `tsc`/vite ignore it;
 * wrangler compiles it at deploy time.
 */
import { generateSentence, GeminiError } from '../../../../modules/copybook/server/gemini.ts';

interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetChar?: string;
      knownChars?: string[];
      level?: number;
      rankCeiling?: number;
      apiKey?: string;
    };
    if (!body.targetChar) {
      return Response.json({ error: 'targetChar required' }, { status: 400 });
    }
    // BYO-key: a per-profile Gemini key sent by the client wins; else the Pages
    // secret. Used transiently for THIS request only — never persisted or logged.
    const clientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiKey = clientKey || env.GEMINI_API_KEY;
    const result = await generateSentence(
      {
        targetChar: body.targetChar,
        knownChars: body.knownChars,
        level: body.level,
        rankCeiling: body.rankCeiling,
      },
      { apiKey, model: env.GEMINI_MODEL },
    );
    return Response.json(result);
  } catch (e) {
    if (e instanceof GeminiError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
