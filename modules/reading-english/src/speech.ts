import { demoKey } from '@platform/offline/demo-key.ts';

/**
 * English speech for reading-english (issue #69) — adapted from practice-english's
 * speech.ts. It speaks the ENGLISH answer with an English voice (NOT the Chinese
 * platform speech util).
 *
 * VOICE PREFS: it reads the SAME demoKey-scoped keys practice-english uses
 * (`pe-en-voice` / `pe-en-voice-u<id>`), so the English voice a learner picks in
 * one English module carries to the other on the same device — a single shared
 * "which English voice" preference rather than two competing ones. (These are UI
 * voice prefs in localStorage, not the isolated per-word reading STATS.)
 */

let enVoice: SpeechSynthesisVoice | null = null;

const DEVICE_KEY = demoKey('pe-en-voice');                  // device-wide default
const userKey = (id: number) => demoKey(`pe-en-voice-u${id}`); // per-profile override

// macOS "novelty"/legacy-robotic voices — never auto-pick these.
const JUNK = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Fred',
  'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Pipe Organ', 'Ralph',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical',
]);
const PREFERRED = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Zira'];

function baseName(v: SpeechSynthesisVoice): string {
  return v.name.replace(/\s*\(.*\)$/, '').trim();
}
function byName(name: string | null): SpeechSynthesisVoice | null {
  if (!name) return null;
  return speechSynthesis.getVoices().find((v) => v.name === name) ?? null;
}

function getEnglishVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang) && !JUNK.has(baseName(v)));
}

function autoPick(): SpeechSynthesisVoice | null {
  const en = getEnglishVoices();
  for (const name of PREFERRED) {
    const v = en.find((x) => x.name === name || baseName(x) === name);
    if (v) return v;
  }
  return en.find((v) => v.lang === 'en-US') || en[0] ||
    speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang)) || null;
}

/** Resolve the active voice for a profile: per-user override → device default → auto-pick. */
function applyVoice(userId?: number): void {
  const u = userId != null ? byName(localStorage.getItem(userKey(userId))) : null;
  enVoice = u || byName(localStorage.getItem(DEVICE_KEY)) || autoPick();
}

export function initVoice(userId?: number): Promise<void> {
  return new Promise((resolve) => {
    applyVoice(userId);
    if (enVoice) { resolve(); return; }
    speechSynthesis.onvoiceschanged = () => { applyVoice(userId); resolve(); };
    setTimeout(resolve, 2000);
  });
}

export function speak(text: string) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = enVoice?.lang ?? 'en-US';
  u.rate = 0.85;
  if (enVoice) u.voice = enVoice;
  speechSynthesis.speak(u);
}
