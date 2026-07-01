/**
 * Cloudflare Pages Function — ADMIN screenshot fetch for one feedback row.
 * Route: GET /api/feedback/:id/screenshot  (gated by FEEDBACK_ADMIN_SECRET).
 *
 * Looks up the row's screenshot_key in the dedicated D1 `feedback` DB, then
 * streams the image bytes from the dedicated R2 bucket (FEEDBACK_R2). SILOED:
 * only feedback bindings are present. Mirrors the dev Express screenshot route.
 *
 * Outside platform/tsconfig's include — wrangler compiles at deploy time.
 */
import { secretMatches, FEEDBACK_ADMIN_HEADER } from "../../../../server/feedback-shared.ts";

interface D1PreparedStatement {
  bind(..._vals: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
}
interface D1Database {
  prepare(_sql: string): D1PreparedStatement;
}
interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}
interface R2Bucket {
  get(_key: string): Promise<R2ObjectBody | null>;
}
interface Env {
  FEEDBACK_DB: D1Database;
  FEEDBACK_R2?: R2Bucket;
  FEEDBACK_ADMIN_SECRET?: string;
}

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: { id: string };
}) {
  const { request, env, params } = context;
  // Header ONLY — never accept the secret via `?secret=` (it would land in
  // CF/access logs, browser history, and any Referer). The standalone triage
  // surface fetches this image WITH the `x-feedback-admin-secret` header and
  // renders an object-URL, so the secret never appears in an `<img src>`.
  // Audit M2 / issue #55. (#59)
  const provided = request.headers.get(FEEDBACK_ADMIN_HEADER) || undefined;
  if (!secretMatches(provided, env.FEEDBACK_ADMIN_SECRET)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || !env.FEEDBACK_R2) {
    return Response.json({ error: "no screenshot" }, { status: 404 });
  }

  const row = await env.FEEDBACK_DB.prepare("SELECT screenshot_key FROM feedback WHERE id = ?1")
    .bind(id)
    .first<{ screenshot_key: string | null }>();
  const rowKey = (row as { screenshot_key?: string | null } | null)?.screenshot_key;
  if (!rowKey) {
    return Response.json({ error: "no screenshot" }, { status: 404 });
  }

  const obj = await env.FEEDBACK_R2.get(rowKey);
  if (!obj) {
    return Response.json({ error: "no screenshot" }, { status: 404 });
  }
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg" },
  });
}
