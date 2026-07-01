/**
 * Entry for the STANDALONE, UNLINKED feedback-triage surface (issue #59).
 *
 * WHY THIS EXISTS — decoupling. This is a second Vite build entry (see
 * `feedback-admin.html` + `rollupOptions.input` in `vite.config.ts`) emitted into
 * the same `dist` and shipped by the same `pages deploy dist`. It is reachable ONLY
 * by direct URL (`/feedback-admin.html`, or the `/feedback-admin` rewrite in
 * `public/_redirects`) and has **no UI navigation** to or from the main learning
 * app in either direction: this file imports NOTHING from `App`, mounts only the
 * reused `FeedbackPanel`, and renders no link back to the app. The app, in turn,
 * never links here.
 *
 * READ PATH / SILOING. It reuses the EXISTING admin-gated, feedback-siloed Pages
 * Functions through the reused `FeedbackPanel` component — `GET /api/feedback`
 * (list + status filter + counts), `PATCH /api/feedback/:id` (set status), and
 * `GET /api/feedback/:id/screenshot` (image bytes). Those Functions bind ONLY the
 * feedback D1/R2 + `FEEDBACK_ADMIN_SECRET`; no app/user/content binding is
 * reachable. Auth is HEADER-ONLY (`x-feedback-admin-secret`, entered at runtime and
 * kept in localStorage by the panel) — the secret is never baked into this bundle
 * and never travels as a `?secret=` URL param (see #55 / PR #60).
 *
 * DELIBERATELY NOT A PWA PAGE. No service-worker registration, no manifest, no
 * offline shell, and no app-shell/theme CSS. It is excluded from the app's SW
 * precache (`workbox.globIgnores` in `vite.config.ts`) and served `no-store`
 * (`public/_headers`), so it never enters the installed app's cache or bundle.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FeedbackTriage } from './feedback-admin/FeedbackTriage.tsx';
import './feedback-admin.css';

function FeedbackAdmin() {
  return (
    <div className="fa-shell">
      <header className="fa-header">
        <h1>Feedback triage</h1>
        <span className="fa-sub">production · siloed store · admin only</span>
      </header>
      <FeedbackTriage />
    </div>
  );
}

createRoot(document.getElementById('feedback-admin-root')!).render(
  <StrictMode>
    <FeedbackAdmin />
  </StrictMode>,
);
