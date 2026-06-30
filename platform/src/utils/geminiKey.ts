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
 */
const userKey = (id: number) => `lc-gemini-key-u${id}`;

export const getUserGeminiKey = (id: number) => localStorage.getItem(userKey(id)) ?? '';

export function setUserGeminiKey(id: number, key: string) {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(userKey(id), trimmed);
  else localStorage.removeItem(userKey(id));
}
