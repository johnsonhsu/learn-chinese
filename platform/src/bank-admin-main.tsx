/**
 * Standalone, DEV-ONLY React entry for the Sentence Bank admin (issue #49).
 *
 * Rendered by bank-admin.html, which is served by server/bank-admin.ts on its own
 * port — decoupled from the :3000 app server so curation survives :3000 restarts.
 *
 * It mounts ONLY <SentenceBankPanel /> (all six tabs + the View-all modal + the
 * per-char detail panel). No <OfflineProvider>: the panel's reads go through
 * useAdminRead(), which under `import.meta.env.DEV` (always true here, since this
 * is served by `vite dev`) uses the same-origin `/api` fetch and NEVER touches the
 * offline data layer — so useOffline()'s default context value is sufficient and
 * no heavy on-device boot (sql.js / IndexedDB / stroke bundle) happens.
 *
 * CSS: index.css carries every `.sba-*` / `.admin-*` rule the panel uses; the
 * ui-kit + theme stylesheets supply the CSS custom properties those rules read
 * (--bg, --text-muted, --accent, …). data-theme is set so those vars resolve.
 *
 * This file is only ever loaded via bank-admin.html (a standalone Vite entry under
 * `vite dev`); it is not referenced by the app and never ships to production.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SentenceBankPanel } from './admin/SentenceBankPanel.tsx';
import './index.css';
import './ui/ui-kit.css';
import './theme/theme-indigo.css';

// Resolve the panel's CSS custom properties (the :root token set lives in
// index.css; data-theme just selects the default look).
document.documentElement.setAttribute('data-theme', 'light');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="admin-page admin-console" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px' }}>
      <div className="admin-header">
        <h2>Sentence Bank — standalone (dev)</h2>
      </div>
      <div className="admin-content">
        <SentenceBankPanel />
      </div>
    </div>
  </StrictMode>,
);
