// Kurdish Sorani Voice AI Engine for Supermarket POS
// Supports number-to-Kurdish conversion, vocal announcements, phonetic tuning for Arabic/Persian engines, and cashier voice assistant queries

export function numberToKurdishWords(num: number): string {
  const safe = Math.round(Number.isFinite(num) ? num : 0);
  if (safe === 0) return 'سفر';
  if (safe < 0) return `سالب ${numberToKurdishWords(Math.abs(safe))}`;

  const ones = ['', 'یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'شەش', 'حەوت', 'هەشت', 'نۆ'];
  const teens = ['دە', 'یازدە', 'دوازدە', 'سیازدە', 'چواردە', 'پازدە', 'شازدە', 'حەڤدە', 'هەژدە', 'نۆزدە'];
  const tens = ['', '', 'بیست', 'سی', 'چل', 'پەنجا', 'شەست', 'حەفتا', 'هەشتا', 'نەوەد'];
  const hundreds = ['', 'سەد', 'دووسەد', 'سێسەد', 'چوارسەد', 'پێنجسەد', 'شەشسەد', 'حەوتسەد', 'هەشتسەد', 'نۆسەد'];

  function convertChunk(n: number): string {
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    if (h > 0) parts.push(hundreds[h]);

    if (remainder >= 10 && remainder < 20) {
      parts.push(teens[remainder - 10]);
    } else {
      const t = Math.floor(remainder / 10);
      const o = remainder % 10;
      if (t > 0) parts.push(tens[t]);
      if (o > 0) parts.push(ones[o]);
    }
    return parts.join(' و ');
  }

  const millions = Math.floor(safe / 1000000);
  const thousands = Math.floor((safe % 1000000) / 1000);
  const rem = safe % 1000;

  const chunks: string[] = [];
  if (millions > 0) {
    chunks.push(`${convertChunk(millions)} ملیۆن`);
  }
  if (thousands > 0) {
    if (thousands === 1) {
      chunks.push('هەزار');
    } else {
      chunks.push(`${convertChunk(thousands)} هەزار`);
    }
  }
  if (rem > 0) {
    chunks.push(convertChunk(rem));
  }

  return chunks.join(' و ');
}

// Converts Kurdish Sorani text into Arabic/Persian synthesizer-compatible phonemes
// so standard OS voice engines pronounce Kurdish words naturally
export function kurdishToSpeechPhonetics(text: string, voiceLang = 'ar'): string {
  if (!text) return '';
  const langLower = (voiceLang || '').toLowerCase();

  // If native Kurdish voice pack is present, keep original
  if (langLower.startsWith('ku') || langLower.startsWith('ckb')) {
    return text;
  }

  let s = text;

  // Common Supermarket Kurdish phrases
  s = s.replace(/کۆی گشتی/g, 'كوي كشتي');
  s = s.replace(/سوپاس بۆ سەردانەکەتان بۆ کانی چنار/g, 'سوباس بو سَردانَكَتان بو كاني شنار');
  s = s.replace(/سوپاس بۆ سەردانەکەتان/g, 'سوباس بو سَردانَكَتان');
  s = s.replace(/بەخێربێن/g, 'بَخيربين');
  s = s.replace(/شێفتی نوێ کرایەوە/g, 'شيفتي نوي كرايَوَه');
  s = s.replace(/سەبەتەی کڕیار هەڵگیرا/g, 'سَبَتَي كريار هَلگيرا');
  s = s.replace(/ئەم بارکۆدە نەدۆزرایەوە/g, 'اَم باركودَه نَدوزرايَوَه');
  s = s.replace(/دینار/g, 'دينار');

  // Common Kurdish numbers
  s = s.replace(/پێنج/g, 'بينتش');
  s = s.replace(/چوار/g, 'تشوار');
  s = s.replace(/سێسەد/g, 'سيسَد');
  s = s.replace(/دووسەد/g, 'دوسَد');
  s = s.replace(/سەد/g, 'سَد');
  s = s.replace(/هەزار/g, 'هَزار');
  s = s.replace(/ملیۆن/g, 'مليون');
  s = s.replace(/شەش/g, 'شَش');
  s = s.replace(/حەوت/g, 'حَوت');
  s = s.replace(/هەشت/g, 'هَشت');
  s = s.replace(/نۆ/g, 'نو');
  s = s.replace(/نۆزدە/g, 'نوزدَه');
  s = s.replace(/هەژدە/g, 'هَجدَه');
  s = s.replace(/حەڤدە/g, 'حَڤدَه');
  s = s.replace(/شازدە/g, 'شازدَه');
  s = s.replace(/پازدە/g, 'بازدَه');
  s = s.replace(/چواردە/g, 'تشواردَه');
  s = s.replace(/سیازدە/g, 'سيازدَه');
  s = s.replace(/دوازدە/g, 'دوازدَه');
  s = s.replace(/یازدە/g, 'يازدَه');
  s = s.replace(/دە/g, 'دَه');
  s = s.replace(/بیست/g, 'بيست');
  s = s.replace(/سی/g, 'سي');
  s = s.replace(/چل/g, 'تِشل');
  s = s.replace(/پەنجا/g, 'بَنجا');
  s = s.replace(/شەست/g, 'شَست');
  s = s.replace(/حەفتا/g, 'حَفتا');
  s = s.replace(/هەشتا/g, 'هَشتا');
  s = s.replace(/نەوەد/g, 'نَوَد');

  // If using Arabic synthesizer, map unsupported Kurdish letters
  if (langLower.startsWith('ar') || !langLower.startsWith('fa')) {
    s = s
      .replace(/پ/g, 'ب')
      .replace(/چ/g, 'تش')
      .replace(/ژ/g, 'ج')
      .replace(/گ/g, 'ك')
      .replace(/ڤ/g, 'ف')
      .replace(/ڵ/g, 'ل')
      .replace(/ڕ/g, 'ر')
      .replace(/ۆ/g, 'و')
      .replace(/ێ/g, 'ي')
      .replace(/ە/g, 'ه');
  }

  return s;
}

export interface VoiceEngineSettings {
  enabled: boolean;
  announceCheckout: boolean;
  announceScan: boolean;
  announceAlerts: boolean;
  rate: number; // 0.8 - 1.2
  volume: number; // 0.1 - 1.0
  volumeBoost: number; // 1.0 - 2.5 (gain boost)
  selectedVoiceURI: string;
  phoneticMode: boolean;
}

const DEFAULT_SETTINGS: VoiceEngineSettings = {
  enabled: true,
  announceCheckout: true,
  announceScan: false,
  announceAlerts: true,
  rate: 0.9,
  volume: 1.0,
  volumeBoost: 1.8, // 180% boosted volume by default
  selectedVoiceURI: '',
  phoneticMode: true
};

let currentSettings: VoiceEngineSettings = (() => {
  try {
    const saved = localStorage.getItem('kanichnar_voice_ai_settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (_e) {}
  return DEFAULT_SETTINGS;
})();

export function getVoiceSettings(): VoiceEngineSettings {
  return { ...currentSettings };
}

export function updateVoiceSettings(newSettings: Partial<VoiceEngineSettings>): VoiceEngineSettings {
  currentSettings = { ...currentSettings, ...newSettings };
  try {
    localStorage.setItem('kanichnar_voice_ai_settings', JSON.stringify(currentSettings));
  } catch (_e) {}
  return currentSettings;
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

export function selectBestVoice(): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  if (voices.length === 0) return null;

  // 1. If user explicitly selected a voice in settings
  if (currentSettings.selectedVoiceURI) {
    const userVoice = voices.find(v => v.voiceURI === currentSettings.selectedVoiceURI || v.name === currentSettings.selectedVoiceURI);
    if (userVoice) return userVoice;
  }

  // 2. Kurdish voice if present
  const kurdish = voices.find(
    v => v.lang.startsWith('ku') || v.lang.startsWith('ckb') || v.name.toLowerCase().includes('kurdish')
  );
  if (kurdish) return kurdish;

  // 3. Arabic voices (ar-IQ, ar-SA, ar-EG, etc.) - widely supported and clear
  const arabicIq = voices.find(v => v.lang.toLowerCase() === 'ar-iq');
  if (arabicIq) return arabicIq;

  const arabic = voices.find(v => v.lang.toLowerCase().startsWith('ar'));
  if (arabic) return arabic;

  // 4. Persian (fa-IR)
  const persian = voices.find(v => v.lang.toLowerCase().startsWith('fa'));
  if (persian) return persian;

  // 5. Default voice
  return voices.find(v => v.default) || voices[0] || null;
}

export function speakKurdishText(text: string, priority = false): boolean {
  if (!currentSettings.enabled && !priority) return false;
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;

  try {
    if (priority) {
      window.speechSynthesis.cancel();
    }

    const chosenVoice = selectBestVoice();
    const voiceLang = chosenVoice?.lang || 'ar-SA';

    // Adapt text phonetically if enabled
    const textToSpeak = currentSettings.phoneticMode
      ? kurdishToSpeechPhonetics(text, voiceLang)
      : text;

    const utter = new SpeechSynthesisUtterance(textToSpeak);
    utter.rate = currentSettings.rate;
    utter.volume = currentSettings.volume;
    utter.pitch = 1.0;

    // CRITICAL: Explicitly set language so browser does not fall back to English en-US
    utter.lang = voiceLang.startsWith('ar') || voiceLang.startsWith('fa') || voiceLang.startsWith('ku') ? voiceLang : 'ar-SA';

    if (chosenVoice) {
      utter.voice = chosenVoice;
    }

    window.speechSynthesis.speak(utter);
    return true;
  } catch (_e) {
    return false;
  }
}

// Custom Audio Recording Storage for Human Kurdish Voice
export type CustomAudioKey = 'checkout' | 'welcome' | 'park' | 'barcode_error';

export const DEFAULT_OFFICIAL_CHECKOUT_AUDIO = '/audio/checkout_kani_chnar.wav';
export const DEFAULT_OFFICIAL_WELCOME_AUDIO = '/audio/welcome_kani_chnar.wav';

export function getCustomVoice(key: CustomAudioKey): string | null {
  try {
    const saved = localStorage.getItem(`kanichnar_audio_${key}`);
    if (saved === 'disabled') return null;
    if (saved) return saved;
  } catch (_e) {}

  // Built-in studio Kurdish voices for supermarket
  if (key === 'checkout') {
    return DEFAULT_OFFICIAL_CHECKOUT_AUDIO;
  }
  if (key === 'welcome') {
    return DEFAULT_OFFICIAL_WELCOME_AUDIO;
  }
  return null;
}

export function saveCustomVoice(key: CustomAudioKey, dataUrl: string): void {
  try {
    localStorage.setItem(`kanichnar_audio_${key}`, dataUrl);
  } catch (_e) {}
}

export function removeCustomVoice(key: CustomAudioKey): void {
  try {
    if (key === 'checkout' || key === 'welcome') {
      localStorage.setItem(`kanichnar_audio_${key}`, 'disabled');
    } else {
      localStorage.removeItem(`kanichnar_audio_${key}`);
    }
  } catch (_e) {}
}

export function resetToDefaultVoice(key: CustomAudioKey): void {
  try {
    localStorage.removeItem(`kanichnar_audio_${key}`);
  } catch (_e) {}
}

export function playAudioDataUrl(dataUrl: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const audio = new Audio(dataUrl);
      audio.volume = 1.0;

      // Apply Gain Boost via Web Audio API if boost > 1.0
      const boostLevel = currentSettings.volumeBoost || 1.8;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && boostLevel > 1.0) {
        try {
          const ctx = new AudioCtx();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();
          gainNode.gain.value = boostLevel;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
        } catch (_e) {
          // Fallback to normal playback if media element source fails
        }
      }

      audio.onended = () => resolve(true);
      audio.onerror = () => {
        // Fallback for dev / preview environments
        if (dataUrl === DEFAULT_OFFICIAL_CHECKOUT_AUDIO) {
          const fallback = new Audio('/assets/aistudio/tts-gen-1793570545858_2166deb0.wav');
          fallback.onended = () => resolve(true);
          fallback.onerror = () => resolve(false);
          fallback.play().catch(() => resolve(false));
        } else if (dataUrl === DEFAULT_OFFICIAL_WELCOME_AUDIO) {
          const fallback = new Audio('/assets/aistudio/tts-gen-1793571237162_f8f8ae19.wav');
          fallback.onended = () => resolve(true);
          fallback.onerror = () => resolve(false);
          fallback.play().catch(() => resolve(false));
        } else {
          resolve(false);
        }
      };
      audio.play().catch(() => resolve(false));
    } catch (_e) {
      resolve(false);
    }
  });
}

// Higher-level Supermarket Voice Announcements
export const KurdishVoiceAnnouncer = {
  async announceCheckout(totalAmount: number) {
    if (!currentSettings.announceCheckout) return;

    // 1. If store recorded their own natural human Kurdish voice, play it first!
    const customAudio = getCustomVoice('checkout');
    if (customAudio) {
      await playAudioDataUrl(customAudio);
      return;
    }

    // 2. Otherwise announce with speech synthesis
    const words = numberToKurdishWords(totalAmount);
    const message = `کۆی گشتی: ${words} دینار. سوپاس بۆ سەردانەکەتان بۆ کانی چنار`;
    speakKurdishText(message);
  },

  async announceShiftOpened(cashierName: string) {
    if (!currentSettings.announceAlerts) return;
    const customAudio = getCustomVoice('welcome');
    if (customAudio) {
      await playAudioDataUrl(customAudio);
      return;
    }
    speakKurdishText(`بەخێربێن کاک ${cashierName}، شێفتی نوێ کرایەوە`);
  },

  async announceBarcodeNotFound() {
    if (!currentSettings.announceAlerts) return;
    const customAudio = getCustomVoice('barcode_error');
    if (customAudio) {
      await playAudioDataUrl(customAudio);
      return;
    }
    speakKurdishText('ئەم بارکۆدە نەدۆزرایەوە');
  },

  async announceParkedCart() {
    const customAudio = getCustomVoice('park');
    if (customAudio) {
      await playAudioDataUrl(customAudio);
      return;
    }
    speakKurdishText('سەبەتەی کڕیار هەڵگیرا');
  },

  announceRestoredCart() {
    speakKurdishText('سەبەتەی هەڵگیراو گەڕێنرایەوە');
  },

  announceSection(sectionTitle: string) {
    if (!currentSettings.announceAlerts) return;
    speakKurdishText(`بەشی ${sectionTitle}`);
  },

  announceProductAdded(productName: string) {
    if (!currentSettings.announceAlerts) return;
    speakKurdishText(`کاڵای ${productName} بە سەرکەوتوویی تۆمارکرا`);
  },

  announceDebtRepaid(customerName: string, amount: number) {
    if (!currentSettings.announceAlerts) return;
    const words = numberToKurdishWords(amount);
    speakKurdishText(`وەرگرتنەوەی قەرزی ${customerName} بە بڕی ${words} دینار تۆمارکرا`);
  },

  announceExpenseAdded(amount: number) {
    if (!currentSettings.announceAlerts) return;
    const words = numberToKurdishWords(amount);
    speakKurdishText(`خەرجی بە بڕی ${words} دینار تۆمارکرا`);
  },

  announceBackupSuccess() {
    if (!currentSettings.announceAlerts) return;
    speakKurdishText('فایلی یەدەگی داتابەیس بە سەرکەوتوویی داگیرا');
  },

  announceShiftClosed(cashTotal: number) {
    if (!currentSettings.announceAlerts) return;
    const words = numberToKurdishWords(cashTotal);
    speakKurdishText(`شێفتی کاشێر داخرا. کۆی نەختینەی سندووق: ${words} دینار`);
  },

  announceCustom(text: string) {
    speakKurdishText(text, true);
  }
};
