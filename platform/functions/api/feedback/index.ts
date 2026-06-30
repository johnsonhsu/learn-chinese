/**
 * Cloudflare Pages Functions — PROD endpoints for the SILOED feedback feature.
 * Route base: /api/feedback
 *
 *   · onRequestPost  — PUBLIC submit. Validated + size-capped (shared helper) +
 *                      rate-limited, stored in the dedicated D1 `feedback` DB,
 *                      with the screenshot in R2 (key feedback/<id>.<ext>).
 *   · onRequestGet   — ADMIN list (?status= filter), gated by FEEDBACK_ADMIN_SECRET.
 *
 * SILOING: the bindings here are a SEPARATE D1 database (FEEDBACK_DB) and a
 * SEPARATE R2 bucket (FEEDBACK_R2), provisioned distinctly from the app's data.
 * No app/user/content binding is present on this Function, so app data is
 * physically unreachable from the feedback endpoints. See ARCHITECTURE.md →
 * "Feedback (siloed)" and migrations/0001_init.sql for the schema.
 *
 * This file lives outside platform/tsconfig's include, so `tsc`/vite ignore it;
 * wrangler compiles it at deploy time (same pattern as functions/api/copybook).
 *
 * Provisioning (one-time, by the account owner — NOT done here):
 *   npx wrangler d1 create feedback
 *   npx wrangler d1 execute feedback --remote --file=platform/functions/migrations/0001_init.sql
 *   npx wrangler r2 bucket create learning-chinese-feedback
 *   npx wrangler pages secret put FEEDBACK_ADMIN_SECRET --project-name=learning-chinese
 *   # + add the D1 binding `FEEDBACK_DB` and R2 binding `FEEDBACK_R2` to the
 *   #   Pages project (Settings → Functions → bindings), then redeploy.
 */
import {
  validateSubmission,
  secretMatches,
  FEEDBACK_ADMIN_HEADER,
} from '../../../server/feedback-shared.ts';

interface D1Result {
  meta?: { last_row_id?: number };
}
interface D1PreparedStatement {
  bind(...vals: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = unknown>(col?: string): Promise<T | null>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface R2Bucket {
  put(key: string, value: ArrayBuffer | string): Promise<unknown>;
}

interface Env {
  FEEDBACK_DB: D1Database;
  FEEDBACK_R2?: R2Bucket;
  FEEDBACK_ADMIN_SECRET?: string;
}

// --- Rate limit: per-IP, 60s window, via a tiny D1 table. Best-effort; a failure
// to record never blocks a legitimate submission. ---
const RATE_MAX = 10;
async function rateLimited(db: D1Database, ip: string): Promise<boolean> {
  try {
    const since = Date.now() - 60_000;
    await db.prepare('DELETE FROM rate_hits WHERE ts < ?1').bind(since).run();
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE ip = ?1')
      .bind(ip)
      .first<{ n: number }>();
    const n = (row as { n?: number } | null)?.n ?? 0;
    if (n >= RATE_MAX) return true;
    await db.prepare('INSERT INTO rate_hits (ip, ts) VALUES (?1, ?2)').bind(ip, Date.now()).run();
    return false;
  } catch {
    return false; // rate table missing / transient error → don't block
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  if (await rateLimited(env.FEEDBACK_DB, ip)) {
    return Response.json({ error: 'too many submissions, slow down' }, { status: 429 });
  }

  const raw = await request.json().catch(() => ({}));
  const clean = validateSubmission(raw);
  if ('error' in clean) {
    return Response.json(clean, { status: 400 });
  }

  try {
    // Insert the row first (no screenshot column populated yet) to get the id.
    const ins = await env.FEEDBACK_DB.prepare(
      `INSERT INTO feedback (category, option, message, screen, context_json, ua, app_version, profile_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(
        clean.category,
        clean.option,
        clean.message,
        clean.screen,
        clean.contextJson,
        clean.ua,
        clean.appVersion,
        clean.profileId,
      )
      .run();
    const id = ins.meta?.last_row_id;

    // Stash the screenshot in R2 (NOT inline in D1 — keeps rows small). Record
    // the R2 key on the row. If R2 isn't bound, the feedback still stores fine.
    if (id != null && clean.screenshot && env.FEEDBACK_R2) {
      const m = /^data:image\/(png|jpeg|webp);base64,(.*)$/s.exec(clean.screenshot);
      if (m) {
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        const key = `feedback/${id}.${ext}`;
        await env.FEEDBACK_R2.put(key, bytes.buffer);
        await env.FEEDBACK_DB.prepare('UPDATE feedback SET screenshot_key = ?1 WHERE id = ?2')
          .bind(key, id)
          .run();
      }
    }

    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: 'store failed', detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const { request, env } = context;
  const url = new URL(request.url);
  // Header ONLY — never accept the secret via `?secret=` (it leaks into CF/access
  // logs, browser history, and any Referer on subsequent navigations/asset loads).
  const provided = request.headers.get(FEEDBACK_ADMIN_HEADER) || undefined;
  if (!secretMatches(provided, env.FEEDBACK_ADMIN_SECRET)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const status = url.searchParams.get('status') || '';
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200), 500);

  const base = `
    SELECT id, created_at, category, option, message, screen, context_json, ua, app_version, profile_id, status,
           (screenshot_key IS NOT NULL AND screenshot_key != '') AS has_screenshot
    FROM feedback`;
  const items = status
    ? (await env.FEEDBACK_DB.prepare(`${base} WHERE status = ?1 ORDER BY id DESC LIMIT ?2`).bind(status, limit).all()).results
    : (await env.FEEDBACK_DB.prepare(`${base} ORDER BY id DESC LIMIT ?1`).bind(limit).all()).results;

  const countRows = (
    await env.FEEDBACK_DB.prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').all<{
      status: string;
      n: number;
    }>()
  ).results;
  const counts: Record<string, number> = {};
  for (const r of countRows) counts[r.status] = r.n;

  return Response.json({ counts, items });
}
