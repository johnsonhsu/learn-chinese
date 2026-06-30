/**
 * English TTS voice settings, managed from platform Settings. Shares localStorage
 * keys with modules/practice-english/src/speech.ts (the module RESOLVES the voice:
 * per-profile override → device default → auto-pick; here we just read/write them).
 *
 * DEMO ISOLATION (issue #48): both keys route through demoKey() so a voice picked
 * in the demo writes 'pe-en-voice[-u{id}]-demo', never the real key. speech.ts uses
 * the SAME demoKey() in the same page session, so the writer here and the resolver
 * there always agree on which key to read.
 */
import { demoKey } from '../offline/demo-key.js';

const DEVICE_KEY = demoKey('pe-en-voice');
const userKey = (id: number) => demoKey(`pe-en-voice-u${id}`);

// macOS "novelty"/legacy-robotic voices — never list these.
const JUNK = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Fred',
  'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Pipe Organ', 'Ralph',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical',
]);
const baseName = (v: SpeechSynthesisVoice) => v.name.replace(/\s*\(.*\)$/, '').trim();

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang) && !JUNK.has(baseName(v)));
}

export const getDeviceVoice = () => localStorage.getItem(DEVICE_KEY) ?? '';
export function setDeviceVoice(name: string) {
  if (name) localStorage.setItem(DEVICE_KEY, name);
  else localStorage.removeItem(DEVICE_KEY);
}
export const getUserVoice = (id: number) => localStorage.getItem(userKey(id)) ?? '';
export function setUserVoice(id: number, name: string) {
  if (name) localStorage.setItem(userKey(id), name);
  else localStorage.removeItem(userKey(id));
}

export function previewVoice(name: string, text = "Hello — let's practice English.") {
  const v = speechSynthesis.getVoices().find((x) => x.name === name);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = v?.lang ?? 'en-US';
  u.rate = 0.85;
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

export const voiceLabel = (v: SpeechSynthesisVoice) => `${baseName(v)} — ${v.lang}`;
