/**
 * DEV-only SILOED feedback store.
 *
 * A SEPARATE better-sqlite3 connection to platform/feedback.db — physically
 * distinct from platform.db (server/db.ts) and content.db. Nothing here imports
 * or references the app/user/content databases, and no app code imports this
 * module: the feedback store and app data never share a connection, a file, or
 * a code path. This is the dev mirror of the prod D1 `feedback` database.
 *
 * The whole submit → triage flow works locally against this file with zero
 * Cloudflare provisioning.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CleanFeedback, FeedbackStatus } from './feedback-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_DB_PATH = join(__dirname, '..', 'feedback.db');

let db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (db) return db;
  db = new Database(FEEDBACK_DB_PATH);
  db.pragma('journal_mode = WAL');
  // Schema mirrors the prod D1 migration (functions migrations/0001_init.sql).
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      category TEXT NOT NULL,
      option TEXT DEFAULT '',
      message TEXT NOT NULL,
      screen TEXT DEFAULT '',
      context_json TEXT DEFAULT '',
      screenshot TEXT,
      ua TEXT DEFAULT '',
      app_version TEXT DEFAULT '',
      profile_id INTEGER,
      status TEXT NOT NULL DEFAULT 'new'
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)`);
  return db;
}

/** Insert a validated submission. Returns the new row id. */
export function insertFeedback(f: CleanFeedback): number {
  const r = getDb()
    .prepare(
      `INSERT INTO feedback (category, option, message, screen, context_json, screenshot, ua, app_version, profile_id)
       VALUES (@category, @option, @message, @screen, @contextJson, @screenshot, @ua, @appVersion, @profileId)`,
    )
    .run({
      category: f.category,
      option: f.option,
      message: f.message,
      screen: f.screen,
      contextJson: f.contextJson,
      screenshot: f.screenshot,
      ua: f.ua,
      appVersion: f.appVersion,
      profileId: f.profileId,
    });
  return Number(r.lastInsertRowid);
}

/** A list row: every column EXCEPT the (potentially large) screenshot, plus a
 *  boolean-ish flag of whether a screenshot exists. */
export interface FeedbackListRow {
  id: number;
  created_at: string;
  category: string;
  option: string;
  message: string;
  screen: string;
  context_json: string;
  ua: string;
  app_version: string;
  profile_id: number | null;
  status: string;
  has_screenshot: number;
}

/**
 * List feedback for triage, newest first. Optional status filter; screenshots
 * are omitted from the list (fetched per-row via getFeedbackScreenshot) to keep
 * the list payload small.
 */
export function listFeedback(status?: string, limit = 200): FeedbackListRow[] {
  const lim = Number.isFinite(limit) ? Math.min(Math.max(1, limit), 500) : 200;
  const base = `
    SELECT id, created_at, category, option, message, screen, context_json, ua, app_version, profile_id, status,
           (screenshot IS NOT NULL AND screenshot != '') AS has_screenshot
    FROM feedback`;
  if (status) {
    return getDb()
      .prepare(`${base} WHERE status = ? ORDER BY id DESC LIMIT ?`)
      .all(status, lim) as FeedbackListRow[];
  }
  return getDb().prepare(`${base} ORDER BY id DESC LIMIT ?`).all(lim) as FeedbackListRow[];
}

/** Fetch just the screenshot data URL for one row (lazy thumbnail loading). */
export function getFeedbackScreenshot(id: number): string | null {
  const row = getDb().prepare('SELECT screenshot FROM feedback WHERE id = ?').get(id) as
    | { screenshot: string | null }
    | undefined;
  return row?.screenshot ?? null;
}

/** Update one row's status. Returns true if a row was changed. */
export function setFeedbackStatus(id: number, status: FeedbackStatus): boolean {
  const r = getDb().prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);
  return r.changes > 0;
}

/** Counts per status, for the triage filter chips. */
export function feedbackStatusCounts(): Record<string, number> {
  const rows = getDb().prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').all() as {
    status: string;
    n: number;
  }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}
