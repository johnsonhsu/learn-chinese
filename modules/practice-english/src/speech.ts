let enVoice: SpeechSynthesisVoice | null = null;

const DEVICE_KEY = 'pe-en-voice';                  // device-wide default
const userKey = (id: number) => `pe-en-voice-u${id}`; // per-profile override

// macOS "novelty"/legacy-robotic voices — never auto-pick or list these.
const JUNK = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Fred',
  'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Pipe Organ', 'Ralph',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical',
]);
// Known-good defaults across platforms (macOS / Chrome / Windows).
const PREFERRED = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Zira'];

function baseName(v: SpeechSynthesisVoice): string {
  return v.name.replace(/\s*\(.*\)$/, '').trim();
}
function byName(name: string | null): SpeechSynthesisVoice | null {
  if (!name) return null;
  return speechSynthesis.getVoices().find((v) => v.name === name) ?? null;
}

/** English voices worth offering (junk filtered out). */
export function getEnglishVoices(): SpeechSynthesisVoice[] {
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

// --- settings (device default + per-profile override) ---
export function getDeviceVoiceName(): string | null { return localStorage.getItem(DEVICE_KEY); }
export function getUserVoiceName(userId: number): string | null { return localStorage.getItem(userKey(userId)); }
export function setDeviceVoice(name: string): void { localStorage.setItem(DEVICE_KEY, name); }
export function setUserVoice(userId: number, name: string): void {
  if (name) localStorage.setItem(userKey(userId), name);
  else localStorage.removeItem(userKey(userId)); // '' clears the override → fall back to device
}

/** Resolve the active voice for a profile: per-user override → device default → auto-pick. */
export function applyVoice(userId?: number): void {
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
  speakWith(enVoice, text);
}
/** Preview a specific voice by name (without changing the active voice). */
export function preview(name: string, text: string) {
  speakWith(byName(name), text);
}

function speakWith(voice: SpeechSynthesisVoice | null, text: string) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? 'en-US';
  u.rate = 0.85;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
