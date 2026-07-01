/**
 * DEV Express routes for the SILOED feedback feature. Mirrors the PROD
 * Cloudflare Pages Functions (functions/api/feedback/*) so the whole flow —
 * public submit → admin triage — works locally against feedback.db with no
 * Cloudflare provisioning.
 *
 * Security model (identical contract in dev + prod):
 *   · POST   /api/feedback        — PUBLIC, validated + size-capped + rate-limited.
 *   · GET    /api/feedback        — admin-secret gated (list, ?status= filter).
 *   · GET    /api/feedback/:id/screenshot — admin-secret gated (image bytes).
 *   · PATCH  /api/feedback/:id    — admin-secret gated (set status).
 *
 * The admin secret is FEEDBACK_ADMIN_SECRET in the dev env (.env). When unset,
 * the read/update routes are CLOSED (403), never open — fail safe. No app/user
 * data is reachable from any of these routes.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  validateSubmission,
  isStatus,
  secretMatches,
  FEEDBACK_ADMIN_HEADER,
} from './feedback-shared.js';
import {
  insertFeedback,
  listFeedback,
  getFeedbackScreenshot,
  setFeedbackStatus,
  feedbackStatusCounts,
} from './feedback-db.js';
import { loadEnv } from '../../modules/copybook/server/env.ts';

export const feedbackRoutes = Router();

// --- Rate limiting (per-IP, sliding window) ---
// Naive in-memory limiter — fine for a single dev process. Prod uses a
// short-TTL KV/D1 counter (documented in the Pages Function). Caps abuse + bots.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10; // 10 submissions / minute / IP
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// --- Admin gate middleware ---
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  loadEnv();
  const expected = process.env.FEEDBACK_ADMIN_SECRET;
  // Header ONLY — never accept the secret via `?secret=` (it leaks into logs,
  // browser history, and Referer). Mirrors the prod Pages Functions contract.
  // Audit M2 / issue #55. (#59)
  const provided = req.headers[FEEDBACK_ADMIN_HEADER] as string | undefined;
  if (!secretMatches(provided, expected)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

// --- PUBLIC: submit ---
feedbackRoutes.post('/', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'too many submissions, slow down' });
    return;
  }
  const clean = validateSubmission(req.body);
  if ('error' in clean) {
    res.status(400).json(clean);
    return;
  }
  try {
    const id = insertFeedback(clean);
    res.json({ ok: true, id });
  } catch (e) {
    console.error('[feedback] insert failed:', e);
    res.status(500).json({ error: 'store failed' });
  }
});

// --- ADMIN: list ---
feedbackRoutes.get('/', requireAdmin, (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  res.json({ counts: feedbackStatusCounts(), items: listFeedback(status, limit) });
});

// --- ADMIN: one screenshot (image bytes, lazy-loaded by the triage thumbnail) ---
feedbackRoutes.get('/:id/screenshot', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dataUrl = Number.isFinite(id) ? getFeedbackScreenshot(id) : null;
  if (!dataUrl) {
    res.status(404).json({ error: 'no screenshot' });
    return;
  }
  const m = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) {
    res.status(404).json({ error: 'no screenshot' });
    return;
  }
  res.set('Content-Type', m[1]);
  res.send(Buffer.from(m[2], 'base64'));
});

// --- ADMIN: set status ---
feedbackRoutes.patch('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = (req.body as { status?: unknown })?.status;
  if (!Number.isFinite(id) || !isStatus(status)) {
    res.status(400).json({ error: 'valid id and status required' });
    return;
  }
  const ok = setFeedbackStatus(id, status);
  if (!ok) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ ok: true });
});
