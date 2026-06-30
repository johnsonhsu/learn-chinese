let zhVoice: SpeechSynthesisVoice | null = null;

function findChineseVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang === 'zh-TW') ||
    voices.find(v => v.lang.startsWith('zh')) ||
    null
  );
}

export function initVoice(): Promise<void> {
  return new Promise(resolve => {
    zhVoice = findChineseVoice();
    if (zhVoice) { resolve(); return; }
    speechSynthesis.onvoiceschanged = () => {
      zhVoice = findChineseVoice();
      resolve();
    };
    setTimeout(resolve, 2000);
  });
}

export function speak(text: string) {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = 0.8;
  if (zhVoice) utterance.voice = zhVoice;
  speechSynthesis.speak(utterance);
}
