/**
 * Cloudflare Pages Function — ADMIN status update for one feedback row.
 * Route: PATCH /api/feedback/:id  (gated by FEEDBACK_ADMIN_SECRET).
 *
 * SILOED: operates only on the dedicated D1 `feedback` DB (FEEDBACK_DB binding).
 * No app/user/content data is reachable. Mirrors the dev Express PATCH route.
 *
 * Outside platform/tsconfig's include — wrangler compiles at deploy time.
 */
import { secretMatches, isStatus, FEEDBACK_ADMIN_HEADER } from '../../../server/feedback-shared.ts';

interface D1Result {
  meta?: { changes?: number };
}
interface D1PreparedStatement {
  bind(...vals: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface Env {
  FEEDBACK_DB: D1Database;
  FEEDBACK_ADMIN_SECRET?: string;
}

export async function onRequestPatch(context: {
  request: Request;
  env: Env;
  params: { id: string };
}) {
  const { request, env, params } = context;
  const provided = request.headers.get(FEEDBACK_ADMIN_HEADER) || undefined;
  if (!secretMatches(provided, env.FEEDBACK_ADMIN_SECRET)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  if (!Number.isFinite(id) || !isStatus(body.status)) {
    return Response.json({ error: 'valid id and status required' }, { status: 400 });
  }

  const r = await env.FEEDBACK_DB.prepare('UPDATE feedback SET status = ?1 WHERE id = ?2')
    .bind(body.status, id)
    .run();
  if (!r.meta?.changes) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
