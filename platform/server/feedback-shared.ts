/**
 * Portable feedback validation + shaping — shared by the DEV Express routes
 * (feedback-routes.ts) and the PROD Cloudflare Pages Functions
 * (functions/api/feedback/*). No Node or Worker imports here, so both runtimes
 * can use it (mirrors the modules/copybook/server/gemini.ts portable-helper
 * pattern). Pure functions only; the runtimes own storage + transport.
 *
 * SILOING NOTE: nothing in this module knows about app/user/content data. It
 * only validates the public submission and the screenshot. The feedback store
 * is physically separate (its own SQLite file in dev, its own D1+R2 in prod);
 * see ARCHITECTURE.md → "Feedback (siloed)".
 */

/** Allowed top-level categories. Anything else is rejected. */
export const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'content', 'confusing', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Allowed lifecycle statuses for triage (the admin PATCH target). */
export const FEEDBACK_STATUSES = ['new', 'triaged', 'in-progress', 'resolved', 'wontfix'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// --- Hard size caps (defense against abuse + storage bloat) ---
export const MAX_MESSAGE_LEN = 4000;
export const MAX_OPTION_LEN = 40;
export const MAX_SCREEN_LEN = 80;
export const MAX_UA_LEN = 400;
export const MAX_VERSION_LEN = 80;
export const MAX_CONTEXT_BYTES = 8 * 1024; // serialized context JSON
/** Screenshot data-URL cap. The client targets ~300KB; we allow some slack but
 *  reject anything that looks like an upload attack. ~700KB of base64 ≈ 512KB raw. */
export const MAX_SCREENSHOT_CHARS = 700 * 1024;

/** The validated, storage-ready feedback record (minus id/created_at/status,
 *  which the store assigns). `screenshot` is a data: URL or null. */
export interface CleanFeedback {
  category: FeedbackCategory;
  option: string;
  message: string;
  screen: string;
  contextJson: string;
  screenshot: string | null;
  ua: string;
  appVersion: string;
  profileId: number | null;
}

export interface ValidationError {
  error: string;
}

function isCategory(v: unknown): v is FeedbackCategory {
  return typeof v === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
}

export function isStatus(v: unknown): v is FeedbackStatus {
  return typeof v === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(v);
}

function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Validate + normalize a raw POST body into a CleanFeedback, or return
 * `{ error }`. Required: a known `category` and a non-empty `message`. Every
 * field is size-capped. The screenshot is accepted only if it's a plausible
 * image data URL within the cap; otherwise it's dropped (graceful — never an error).
 */
export function validateSubmission(raw: unknown): CleanFeedback | ValidationError {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (!isCategory(body.category)) {
    return { error: 'invalid category' };
  }
  const message = clampStr(body.message, MAX_MESSAGE_LEN).trim();
  if (!message) {
    return { error: 'message required' };
  }

  // Context: accept either a pre-serialized string or an object; re-serialize so
  // we control the stored shape, and enforce the byte cap.
  let contextJson = '';
  const ctx = body.context;
  if (typeof ctx === 'string') {
    contextJson = ctx.slice(0, MAX_CONTEXT_BYTES);
  } else if (ctx && typeof ctx === 'object') {
    try {
      contextJson = JSON.stringify(ctx).slice(0, MAX_CONTEXT_BYTES);
    } catch {
      contextJson = '';
    }
  }

  // Screenshot: only keep a string that looks like an image data URL and fits
  // the cap. Anything else → null (submission still succeeds).
  let screenshot: string | null = null;
  const shot = body.screenshot;
  if (
    typeof shot === 'string' &&
    shot.length <= MAX_SCREENSHOT_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,/.test(shot)
  ) {
    screenshot = shot;
  }

  let profileId: number | null = null;
  if (typeof body.profileId === 'number' && Number.isFinite(body.profileId)) {
    profileId = Math.trunc(body.profileId);
  }

  return {
    category: body.category,
    option: clampStr(body.option, MAX_OPTION_LEN).trim(),
    message,
    screen: clampStr(body.screen, MAX_SCREEN_LEN).trim(),
    contextJson,
    screenshot,
    ua: clampStr(body.ua, MAX_UA_LEN),
    appVersion: clampStr(body.appVersion, MAX_VERSION_LEN),
    profileId,
  };
}

/**
 * Constant-time-ish comparison for the admin secret. Avoids leaking length via
 * early-exit on the common path; good enough for a low-value shared secret.
 */
export function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!expected) return false; // no secret configured → reads are CLOSED, never open
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const FEEDBACK_ADMIN_HEADER = 'x-feedback-admin-secret';
