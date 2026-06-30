/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />

declare const __CONTENT_VERSION__: string;
/** Feedback admin secret for the dev triage panel. Real value under `vite dev`,
 *  empty string in production builds (see vite.config.ts). */
declare const __FEEDBACK_ADMIN_SECRET__: string;
