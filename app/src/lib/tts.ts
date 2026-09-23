// Korean text-to-speech through the browser's built-in voices.
let voices: SpeechSynthesisVoice[] = [];

function refresh() {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'));
}

if (typeof speechSynthesis !== 'undefined') {
  refresh();
  speechSynthesis.addEventListener?.('voiceschanged', refresh);
}

export const ttsSupported = () => typeof speechSynthesis !== 'undefined';
export const koreanVoices = () => {
  refresh();
  return voices;
};

export function speak(text: string, voiceURI?: string | null, rate = 0.9) {
  if (!ttsSupported()) return;
  refresh();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = rate;
  const v = voices.find((x) => x.voiceURI === voiceURI) ?? voices[0];
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
