// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * DEMO ISOLATION of the per-profile settable secrets/settings (issue #48):
 * English voices (device + per-profile) and the per-profile Gemini API key. These
 * are localStorage, not in the demo jar, and — critically — the per-profile keys
 * are profile-id-keyed, while demo profile ids COLLIDE with real ones (1, 2, …).
 * Without namespacing a demo write to profile 1 would land on the real user's
 * profile 1. Both modules route their keys through demoKey(), locked at module
 * load, so each branch is exercised by mocking isDemoMode() and re-importing.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../offline/demo-mode.js');
});

async function load(demo: boolean) {
  vi.resetModules();
  vi.doMock('../../offline/demo-mode.js', () => ({ isDemoMode: () => demo }));
  const voices = await import('../voices.js');
  const gemini = await import('../geminiKey.js');
  return { voices, gemini };
}

describe('English voices — REAL path', () => {
  it('writes the real pe-en-voice keys, not the demo keys', async () => {
    const { voices } = await load(false);
    voices.setDeviceVoice('Samantha');
    voices.setUserVoice(1, 'Daniel');
    expect(localStorage.getItem('pe-en-voice')).toBe('Samantha');
    expect(localStorage.getItem('pe-en-voice-u1')).toBe('Daniel');
    expect(localStorage.getItem('pe-en-voice-demo')).toBeNull();
    expect(localStorage.getItem('pe-en-voice-u1-demo')).toBeNull();
  });
});

describe('English voices — DEMO path', () => {
  it('reads/writes ONLY the -demo keys; a real per-profile voice survives unchanged', async () => {
    // Real user's profile-1 voice.
    localStorage.setItem('pe-en-voice-u1', 'RealUserVoice');
    localStorage.setItem('pe-en-voice', 'RealDeviceVoice');
    const { voices } = await load(true);
    // Demo ignores the real key (profile-id collision would otherwise leak it).
    expect(voices.getUserVoice(1)).toBe('');
    expect(voices.getDeviceVoice()).toBe('');
    // Demo writes only the -demo variants.
    voices.setUserVoice(1, 'DemoVoice');
    voices.setDeviceVoice('DemoDeviceVoice');
    expect(localStorage.getItem('pe-en-voice-u1-demo')).toBe('DemoVoice');
    expect(localStorage.getItem('pe-en-voice-demo')).toBe('DemoDeviceVoice');
    // Real keys byte-identical.
    expect(localStorage.getItem('pe-en-voice-u1')).toBe('RealUserVoice');
    expect(localStorage.getItem('pe-en-voice')).toBe('RealDeviceVoice');
  });
});

describe('Gemini key (per-profile secret) — REAL path', () => {
  it('writes the real lc-gemini-key key', async () => {
    const { gemini } = await load(false);
    gemini.setUserGeminiKey(1, 'sk-real-123');
    expect(localStorage.getItem('lc-gemini-key-u1')).toBe('sk-real-123');
    expect(localStorage.getItem('lc-gemini-key-u1-demo')).toBeNull();
  });
});

describe('Gemini key (per-profile secret) — DEMO path', () => {
  it('NEVER reads or overwrites the real user secret (the privacy leak)', async () => {
    localStorage.setItem('lc-gemini-key-u1', 'sk-REAL-USER-SECRET');
    const { gemini } = await load(true);
    // Demo must not read the real secret despite the profile-id collision.
    expect(gemini.getUserGeminiKey(1)).toBe('');
    // Demo writes its own -demo key; real secret byte-identical.
    gemini.setUserGeminiKey(1, 'sk-demo-throwaway');
    expect(localStorage.getItem('lc-gemini-key-u1-demo')).toBe('sk-demo-throwaway');
    expect(localStorage.getItem('lc-gemini-key-u1')).toBe('sk-REAL-USER-SECRET');
  });
});
