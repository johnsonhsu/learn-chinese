/**
 * Per-profile "bring your own" Gemini API key, managed from platform Settings.
 *
 * Stored per-profile in localStorage (keyed by user id), mirroring the per-user
 * English voice override in ./voices.ts. The copybook "Generate" flow reads the
 * CURRENT profile's key and, when set, sends it to the /api/copybook/generate
 * proxy so the user can use their own key + quota — overriding the server key,
 * and working even when no server key is configured. Empty = unset (the proxy
 * falls back to the server/device key).
 *
 * SECURITY: this is the user's own secret, entered on their own device. Never
 * log it. The proxy uses the client-sent key transiently for that one request
 * and never persists it server-side.
 *
 * DEMO ISOLATION (issue #48): the key is doubly sensitive in demo — without
 * namespacing, the demo's profile-id collision (demo profile 1 vs real profile 1)
 * would let the demo READ a real user's stored API key, or OVERWRITE it. Routing
 * through demoKey() means demo touches only 'lc-gemini-key-u{id}-demo'; the real
 * secret is never read or written. Reset each demo load via resetDemoKeys.
 */
import { demoKey } from '../offline/demo-key.js';

const userKey = (id: number) => demoKey(`lc-gemini-key-u${id}`);

export const getUserGeminiKey = (id: number) => localStorage.getItem(userKey(id)) ?? '';

export function setUserGeminiKey(id: number, key: string) {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(userKey(id), trimmed);
  else localStorage.removeItem(userKey(id));
}
