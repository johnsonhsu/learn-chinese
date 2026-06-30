import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const modulesDir = resolve(__dirname, '../modules');
const moduleAliases: Record<string, string> = {};

// Bake the content version (hash of the shipped data, bumped by build:data) into
// the bundle. Referencing it in code makes the JS change whenever CONTENT changes,
// so the service worker's update detection — and the "new version" banner — fires
// on data-only releases (new sentences), not just code changes.
let contentVersion = 'dev';
try {
  const vp = resolve(__dirname, 'public/data/version.json');
  if (existsSync(vp)) contentVersion = JSON.parse(readFileSync(vp, 'utf-8')).version || 'dev';
} catch { /* no baked data yet — fine in dev */ }

// DEV-ONLY: surface the feedback admin secret to the in-app triage panel
// (src/admin/FeedbackPanel.tsx) so it can authenticate its read/update calls to
// the dev Express routes without the developer hand-typing the secret. Read from
// the same .env files the server loader uses (repo-root + platform/). This is
// injected ONLY for `vite dev` below (the build branch leaves it undefined), so
// the secret never lands in a production bundle.
function readFeedbackAdminSecret(): string {
  for (const p of [resolve(__dirname, '../.env'), resolve(__dirname, '.env')]) {
    try {
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, 'utf-8').split('\n')) {
        const m = /^\s*FEEDBACK_ADMIN_SECRET\s*=\s*(.*)\s*$/.exec(line);
        if (m) {
          let v = m[1].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (v) return v;
        }
      }
    } catch { /* best-effort */ }
  }
  return '';
}

if (existsSync(modulesDir)) {
  for (const dir of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const srcIndex = resolve(modulesDir, dir.name, 'src', 'index.ts');
    if (existsSync(srcIndex)) {
      moduleAliases[`@modules/${dir.name}`] = srcIndex;
    }
  }
}

export default defineConfig(({ command }) => ({
  define: {
    __CONTENT_VERSION__: JSON.stringify(contentVersion),
    // Dev triage panel auth: real secret on `vite dev`, empty string on build so
    // a production bundle never carries it. The panel treats '' as "no secret".
    __FEEDBACK_ADMIN_SECRET__: JSON.stringify(command === 'serve' ? readFeedbackAdminSecret() : ''),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not autoUpdate): the SW waits instead of swapping silently, so we
      // can show a "new version available" banner and let the user apply it.
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
        'apple-touch-icon.png',
        'favicon.png',
      ],
      manifest: false, // we use our own manifest.json in public/
      workbox: {
        // Precache the app shell + the bundled sql.js wasm so it works offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,wasm}'],
        // The ~18MB shipped DBs are cached in IndexedDB by the data layer, not here.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          // Note: /data/* (DBs + stroke bundle) is cached in IndexedDB by the
          // data layer, so it's intentionally NOT cached again here.
          {
            // Cache HanziWriter char data from CDN (online fallback for any
            // char not in the offline bundle).
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/hanzi-writer-data/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hanzi-writer-data',
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@platform': resolve(__dirname, 'src'),
      ...moduleAliases,
    },
  },
  server: {
    proxy: {},
  },
}));
