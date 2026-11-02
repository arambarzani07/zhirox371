import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import {
  speakKurdishText,
  getVoiceSettings,
  updateVoiceSettings,
  VoiceEngineSettings,
  numberToKurdishWords,
  getAvailableVoices,
  CustomAudioKey,
  getCustomVoice,
  saveCustomVoice,
  removeCustomVoice,
  resetToDefaultVoice,
  DEFAULT_OFFICIAL_CHECKOUT_AUDIO,
  DEFAULT_OFFICIAL_WELCOME_AUDIO,
  playAudioDataUrl
} from '../utils/kurdishVoiceEngine';

interface Props {
  onClose?: () => void;
  embedded?: boolean;
}

interface AudioPhraseConfig {
  key: CustomAudioKey;
  title: string;
  recommendedText: string;
  description: string;
}

const PHRASES: AudioPhraseConfig[] = [
  {
    key: 'checkout',
    title: 'تەواوکردنی فرۆشتن و پسووڵە بۆ کڕیار',
    recommendedText: '«سوپاس بۆ سەردانەکەتان بۆ سوپەرمارکێتی کانی چنار، ڕۆژێکی شاد»',
    description: 'لە کاتی بڕینی پسووڵەدا ڕاستەوخۆ دەنگەکە بۆ کڕیار لێدەدرێتەوە'
  },
  {
    key: 'welcome',
    title: 'بەخێرهاتنی دەستپێکی شێفت',
    recommendedText: '«بەخێربێن بۆ سوپەرمارکێتی کانی چنار، هیوای کارێکی سەرکەوتوو»',
    description: 'لە کاتی کردنەوەی سندووق و دەستپێکی شێفتی نوێ لێدەدرێتەوە'
  },
  {
    key: 'park',
    title: 'هەڵگرتنی کاتیی سەبەتە (Park Cart)',
    recommendedText: '«سەبەتەی کڕیار بە کاتی هەڵگیرا»',
    description: 'کاتێک کڕیار شتێکی لەبیرچووە و کاتی سەبەتەکەی هەڵدەگیرێت'
  },
  {
    key: 'barcode_error',
    title: 'ئاگاداری هەڵەی بارکۆد',
    recommendedText: '«ئەم بارکۆدە لە سیستمدا نەدۆزرایەوە»',
    description: 'لە کاتی سکانکردنی بارکۆدێکی هەڵە یان نەناسراو لێدەدرێتەوە'
  }
];

export const KurdishVoiceAssistantModal: React.FC<Props> = ({ onClose, embedded = false }) => {
  const { products, receipts, currentShift, customers, navigateTo } = useApp();
  const [activeTab, setActiveTab] = useState<'studio' | 'ask' | 'settings'>('studio');
  const [queryInput, setQueryInput] = useState('');
  const [responseMessage, setResponseMessage] = useState<string | null>(
    'بەخێربێیت! دەتوانیت بە دەنگ یان بە نووسین پرسیار لەسەر نرخ، کۆگا، داهات و کڕیاران بکەیت، یان بڵێیت «بچۆ بۆ ...» بۆ گواستنەوەی خێرا.'
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [settings, setSettings] = useState<VoiceEngineSettings>(getVoiceSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Studio Audio Recording state
  const [customAudios, setCustomAudios] = useState<Record<CustomAudioKey, string | null>>({
    checkout: getCustomVoice('checkout'),
    welcome: getCustomVoice('welcome'),
    park: getCustomVoice('park'),
    barcode_error: getCustomVoice('barcode_error')
  });

  const [recordingKey, setRecordingKey] = useState<CustomAudioKey | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<CustomAudioKey | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const updateVoiceList = () => {
      const v = getAvailableVoices();
      setVoices(v);
    };

    updateVoiceList();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoiceList;
    }
  }, []);

  const samplePrompts = [
    'کۆی فرۆشتنی شێفتی ئێستا چەندە؟',
    'چەند کاڵا کەمبووە لە کۆگا؟',
    'پڕفرۆشترین کاڵای ئەمڕۆ کامەیە؟',
    'نرخی برنجی کوردی چەندە؟',
    'کۆی قەرزی ماوە لای کڕیاران چەندە؟',
    'بچۆ بۆ کۆگا',
    'بچۆ بۆ کەتەلۆگ',
    'بچۆ بۆ ڕاپۆرتەکان'
  ];

  const handleAsk = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    let answer = '';

    // Navigation Voice Commands
    if (q.includes('بچۆ بۆ کۆگا') || q.includes('بەشی کۆگا')) {
      navigateTo('stock');
      answer = 'گواسترایەوە بۆ بەشی کۆگا و کۆنتڕۆڵی کۆست';
    } else if (q.includes('بچۆ بۆ کەتەلۆگ') || q.includes('بەشی کەتەلۆگ') || q.includes('کاڵاکان')) {
      navigateTo('products');
      answer = 'گواسترایەوە بۆ بەشی کەتەلۆگی کاڵاکان';
    } else if (q.includes('بچۆ بۆ کاشێر') || q.includes('فرۆشتنی نوێ')) {
      navigateTo('pos');
      answer = 'گواسترایەوە بۆ شاشەی کاشێر و فرۆشتن';
    } else if (q.includes('بچۆ بۆ کڕیاران') || q.includes('بەشی کڕیاران')) {
      navigateTo('customers');
      answer = 'گواسترایەوە بۆ بەشی دەفتەری کڕیاران و قەرز';
    } else if (q.includes('بچۆ بۆ دابینکەران') || q.includes('بەشی دابینکەران')) {
      navigateTo('suppliers');
      answer = 'گواسترایەوە بۆ بەشی دابینکەران و کڕین';
    } else if (q.includes('بچۆ بۆ ڕاپۆرتەکان') || q.includes('بەشی ڕاپۆرتەکان')) {
      navigateTo('reports');
      answer = 'گواسترایەوە بۆ بەشی ڕاپۆرتەکان و شیکاریی قازانج';
    } else if (q.includes('بچۆ بۆ دارایی') || q.includes('خەرجی')) {
      navigateTo('finance');
      answer = 'گواسترایەوە بۆ بەشی دارایی، شێفت و خەرجییەکان';
    } else if (q.includes('بچۆ بۆ ئۆفەر') || q.includes('داشکاندن')) {
      navigateTo('offers');
      answer = 'گواسترایەوە بۆ بەشی ئۆفەر و داشکاندنەکان';
    } else if (q.includes('بچۆ بۆ سەرەتا') || q.includes('ماڵەوە')) {
      navigateTo('home');
      answer = 'گواسترایەوە بۆ شاشەی سەرەتایی سوپەرمارکێت';
    } else if (q.includes('فرۆشتن') || q.includes('داهات') || q.includes('شێفت')) {
      const totalSales = currentShift.cashSales + currentShift.debtSales;
      const words = numberToKurdishWords(totalSales);
      answer = `کۆی گشتی فرۆشتنی ئەم شێفتە بریتییە لە ${words} دینار، کە ${money(currentShift.cashSales)} بە نەختینە بووە و ${money(currentShift.debtSales)} بە قەرز بووە.`;
    } else if (q.includes('کەمبوو') || q.includes('کۆگا')) {
      const lowStock = products.filter(p => p.stock <= (p.min_stock || 10));
      if (lowStock.length === 0) {
        answer = 'هەموو کاڵاکان لە کۆگادا بە تەواوی بەردەستن و هیچ کاڵایەک نەگەیشتووەتە سنووری کەمبوونەوە.';
      } else {
        const names = lowStock.slice(0, 3).map(p => `${p.name} (${p.stock} دانە)`).join('، ');
        answer = `لە ئێستادا ${lowStock.length} کاڵا لە کۆگا کەمە، لەوانە: ${names}.`;
      }
    } else if (q.includes('پڕفرۆش') || q.includes('باشترین')) {
      const salesMap: Record<string, { name: string; qty: number }> = {};
      receipts.forEach(r => {
        r.items.forEach(it => {
          if (!salesMap[it.productId]) salesMap[it.productId] = { name: it.name, qty: 0 };
          salesMap[it.productId].qty += it.qty;
        });
      });
      const sorted = Object.values(salesMap).sort((a, b) => b.qty - a.qty);
      if (sorted.length > 0) {
        answer = `پڕفرۆشترین کاڵای ئێستا بریتییە لە «${sorted[0].name}» بە فرۆشتنی ${sorted[0].qty} دانە.`;
      } else {
        answer = 'هێشتا هیچ فرۆشتنێک لەم شێفتەدا تۆمار نەکراوە.';
      }
    } else if (q.includes('قەرز') || q.includes('کڕیار')) {
      const totalDebt = customers.reduce((sum, c) => sum + c.balanceDebt, 0);
      const debtorCount = customers.filter(c => c.balanceDebt > 0).length;
      answer = `کۆی گشتی قەرزی ماوە لای کڕیاران ${numberToKurdishWords(totalDebt)} دینارە، لەسەر ئەستۆی ${debtorCount} کڕیار.`;
    } else {
      const matchedProd = products.find(p => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
      if (matchedProd) {
        answer = `نرخی «${matchedProd.name}» ${money(matchedProd.unit_sale_price_iqd)}ـە، و بڕی ${matchedProd.stock} دانە لە ناو کۆگادا بەردەستە.`;
      } else {
        answer = `ببورە، زانیاری تایبەت بە «${query}» نەدۆزرایەوە. دەتوانیت ناوی کاڵا یان یەکێک لە پرسیارە خێراکان هەڵبژێریت.`;
      }
    }

    setResponseMessage(answer);
    setQueryInput('');
    setIsSpeaking(true);
    speakKurdishText(answer, true);
    setTimeout(() => setIsSpeaking(false), 4000);
  };

  const handleTestSpeech = () => {
    const testPhrase = 'کۆی گشتی: بیست و پێنج هەزار و پێنجسەد دینار. سوپاس بۆ سەردانەکەتان بۆ کانی چنار.';
    speakKurdishText(testPhrase, true);
  };

  const handleToggleSetting = (key: keyof VoiceEngineSettings) => {
    const updated = updateVoiceSettings({ [key]: !settings[key] });
    setSettings(updated);
  };

  const handleRateChange = (rate: number) => {
    const updated = updateVoiceSettings({ rate });
    setSettings(updated);
  };

  const handleVoiceChange = (voiceURI: string) => {
    const updated = updateVoiceSettings({ selectedVoiceURI: voiceURI });
    setSettings(updated);
  };

  const handleVolumeBoostChange = (volumeBoost: number) => {
    const updated = updateVoiceSettings({ volumeBoost });
    setSettings(updated);
  };

  // Studio Audio Recording Handlers
  const handleStartRecording = async (key: CustomAudioKey) => {
    try {
      setRecordError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          saveCustomVoice(key, base64Data);
          setCustomAudios(prev => ({ ...prev, [key]: base64Data }));
          setRecordingKey(null);
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingKey(key);
    } catch (_err) {
      setRecordError('تکایە ڕێگە بدە بە مایکرۆفۆن بۆ ئەوەی دەنگەکەت تۆمار بکات.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);

  const handlePlayCustomAudio = async (key: CustomAudioKey) => {
    const audioData = customAudios[key];
    if (!audioData) return;
    setPlayingKey(key);
    await playAudioDataUrl(audioData);
    setPlayingKey(null);
  };

  const handleDeleteCustomAudio = (key: CustomAudioKey) => {
    removeCustomVoice(key);
    setCustomAudios(prev => ({ ...prev, [key]: null }));
    setUploadSuccessMsg('دەنگەکە سڕایەوە.');
    setTimeout(() => setUploadSuccessMsg(null), 3000);
  };

  const handleResetToDefault = (key: CustomAudioKey) => {
    resetToDefaultVoice(key);
    setCustomAudios(prev => ({ ...prev, [key]: getCustomVoice(key) }));
    setUploadSuccessMsg('گەڕێنرایەوە بۆ دەنگی فەرمیی ستۆدیۆیی کانی چنار!');
    setTimeout(() => setUploadSuccessMsg(null), 3000);
  };

  const handleFileUpload = (key: CustomAudioKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const base64 = evt.target?.result as string;
      if (base64) {
        saveCustomVoice(key, base64);
        setCustomAudios(prev => ({ ...prev, [key]: base64 }));
        setUploadSuccessMsg('فایلی دەنگ بە سەرکەوتوویی بارکرا و چالاک کرا!');
        setTimeout(() => setUploadSuccessMsg(null), 4000);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const studioCard = (
    <div
      id="kurdish-voice-studio-panel"
      style={{
        background: '#ffffff',
        borderRadius: embedded ? '12px' : '16px',
        border: embedded ? '1px solid #cbd6e2' : 'none',
        boxShadow: embedded ? '0 4px 14px rgba(15, 23, 42, 0.06)' : '0 25px 50px rgba(0, 0, 0, 0.35)',
        maxWidth: embedded ? '100%' : '680px',
        width: '100%',
        height: embedded ? '100%' : undefined,
        maxHeight: embedded ? '100%' : '94vh',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        direction: 'rtl'
      }}
    >
      {/* Studio Header */}
      <div
        style={{
          padding: embedded ? '12px 16px' : '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🎙️</span>
          <div>
            <strong style={{ fontSize: '14.5px', display: 'block' }}>
              ستۆدیۆی دەنگی کوردی — سوپەرمارکێتی کانی چنار
            </strong>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              تۆمارکردنی دەنگی مرۆڤی ڕاستەقینە یان خوێندنەوەی دەنگی
            </span>
          </div>
        </div>
        {!embedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        )}
      </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              borderBottom: activeTab === 'studio' ? '2.5px solid #16a34a' : 'none',
              background: activeTab === 'studio' ? '#ffffff' : 'transparent',
              fontWeight: 800,
              fontSize: '13px',
              color: activeTab === 'studio' ? '#16a34a' : '#64748b',
              cursor: 'pointer'
            }}
          >
            🔴 تۆمارکردنی دەنگی کوردی (تایبەت و ڕەوان)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ask')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              borderBottom: activeTab === 'ask' ? '2.5px solid #1e3a8a' : 'none',
              background: activeTab === 'ask' ? '#ffffff' : 'transparent',
              fontWeight: 800,
              fontSize: '13px',
              color: activeTab === 'ask' ? '#1e3a8a' : '#64748b',
              cursor: 'pointer'
            }}
          >
            🗣️ پرسیاری دەنگیی کاشێر
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              borderBottom: activeTab === 'settings' ? '2.5px solid #1e3a8a' : 'none',
              background: activeTab === 'settings' ? '#ffffff' : 'transparent',
              fontWeight: 800,
              fontSize: '13px',
              color: activeTab === 'settings' ? '#1e3a8a' : '#64748b',
              cursor: 'pointer'
            }}
          >
            ⚙️ ڕێکخستنی دەنگ
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: STUDIO VOICE RECORDER (AUTHENTIC KURDISH) */}
          {activeTab === 'studio' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '24px' }}>✨</span>
                <div style={{ fontSize: '12px', color: '#166534', lineHeight: 1.6 }}>
                  <strong>چارەسەری پێشکەوتووی دەنگ:</strong> لەبەر ئەوەی بێژەری ڕۆبۆتیی ناو وێبگەڕەکان دەنگی کوردییان تیادا نییە، لێرە دەتوانیت بە مایکرۆفۆنی مۆبایلەکەت یان کۆمپیوتەرەکەت بە دەنگی خۆت (یان دەنگی کەسێکی تر) بە کوردییەکی ڕەوان و شیرین ڕستەکان تۆمار بکەیت تا لە هەموو فرۆشتنێکدا بە دەنگی مرۆڤی کوردی قسە بکات!
                </div>
              </div>

              {uploadSuccessMsg && (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', color: '#166534', fontSize: '12.5px', fontWeight: 800 }}>
                  ✅ {uploadSuccessMsg}
                </div>
              )}

              {recordError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#991b1b', fontSize: '12px', fontWeight: 800 }}>
                  ⚠️ {recordError}
                </div>
              )}

              <div style={{ display: 'grid', gap: '14px' }}>
                {PHRASES.map(p => {
                  const hasCustom = Boolean(customAudios[p.key]);
                  const isRecordingThis = recordingKey === p.key;
                  const isPlayingThis = playingKey === p.key;

                  return (
                    <div
                      key={p.key}
                      style={{
                        background: '#ffffff',
                        border: `1.5px solid ${isRecordingThis ? '#ef4444' : hasCustom ? '#86efac' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        padding: '14px 16px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        display: 'grid',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{p.title}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{p.description}</div>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: hasCustom ? '#dcfce7' : '#f1f5f9',
                            color: hasCustom ? '#15803d' : '#64748b'
                          }}
                        >
                          {hasCustom
                            ? customAudios[p.key] === DEFAULT_OFFICIAL_CHECKOUT_AUDIO || customAudios[p.key] === DEFAULT_OFFICIAL_WELCOME_AUDIO
                              ? '⭐ دەنگی ستۆدیۆیی فەرمی'
                              : '🟢 دەنگی تۆمارکراوی تایبەت'
                            : '⚪ دەنگی ئاسایی'}
                        </span>
                      </div>

                      <div
                        style={{
                          background: '#f8fafc',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px dashed #cbd5e1',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#334155'
                        }}
                      >
                        ڕستەی پێشنیارکراو بۆ خوێندنەوە: <span style={{ color: '#1e3a8a' }}>{p.recommendedText}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {isRecordingThis ? (
                          <button
                            type="button"
                            onClick={handleStopRecording}
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '7px 16px',
                              fontSize: '12.5px',
                              fontWeight: 900,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              animation: 'pulse 1.5s infinite'
                            }}
                          >
                            ⏹️ ڕاگرتن و پاشەکەوتکردن
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartRecording(p.key)}
                            style={{
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '7px 14px',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            🎤 تۆمارکردنی دەنگ
                          </button>
                        )}

                        {hasCustom && (
                          <>
                            <button
                              type="button"
                              onClick={() => handlePlayCustomAudio(p.key)}
                              disabled={isPlayingThis}
                              style={{
                                background: '#eff6ff',
                                color: '#1e3a8a',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                padding: '7px 14px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {isPlayingThis ? '🔊 لێدەدرێت...' : '▶️ لێدانەوەی دەنگ'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteCustomAudio(p.key)}
                              style={{
                                background: '#fff',
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12px',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              🗑️ سڕینەوە
                            </button>

                            {(p.key === 'checkout' || p.key === 'welcome') &&
                             customAudios[p.key] !== (p.key === 'checkout' ? DEFAULT_OFFICIAL_CHECKOUT_AUDIO : DEFAULT_OFFICIAL_WELCOME_AUDIO) && (
                              <button
                                type="button"
                                onClick={() => handleResetToDefault(p.key)}
                                style={{
                                  background: '#f0fdf4',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '8px',
                                  padding: '7px 12px',
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                              >
                                🔄 دەنگی فەرمیی کانی چنار
                              </button>
                            )}
                          </>
                        )}

                        <label
                          style={{
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '7px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          📁 بارکردنی فایل
                          <input
                            type="file"
                            accept="audio/*"
                            style={{ display: 'none' }}
                            onChange={e => handleFileUpload(p.key, e)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: AI VOICE ASSISTANT QUERIES */}
          {activeTab === 'ask' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div
                style={{
                  background: isSpeaking ? '#eff6ff' : '#f8fafc',
                  border: `1.5px solid ${isSpeaking ? '#3b82f6' : '#e2e8f0'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '24px' }}>{isSpeaking ? '🔊' : '💬'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, marginBottom: '4px' }}>
                    وەڵامی دەنگیی سیستم بە کوردی سۆرانی:
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.6 }}>
                    {responseMessage}
                  </div>
                </div>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleAsk(queryInput);
                }}
                style={{ display: 'flex', gap: '8px' }}
              >
                <input
                  type="text"
                  value={queryInput}
                  onChange={e => setQueryInput(e.target.value)}
                  placeholder="پرسیارەکەت بنووسە یان یەکێک لە خوارەوە هەڵبژێرە..."
                  style={{
                    flex: 1,
                    height: '42px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    padding: '0 12px',
                    fontSize: '13px',
                    fontWeight: 700
                  }}
                />
                <button
                  type="submit"
                  className="primary"
                  style={{ height: '42px', padding: '0 16px', fontWeight: 800 }}
                >
                  پرسیار بکە
                </button>
              </form>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>
                  پرسیارە باوەکانی کاشێر:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {samplePrompts.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAsk(p)}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '20px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#1e3a8a',
                        cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === 'settings' && (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 800, fontSize: '12.5px', color: '#1e293b' }}>
                  دەنگی خوێنەرەوە (Synthesizer Voice):
                  <select
                    value={settings.selectedVoiceURI}
                    onChange={e => handleVoiceChange(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: '#fff'
                    }}
                  >
                    <option value="">خۆکار (Auto: پێشنیارکراوی کوردی/عەرەبی بۆ سۆرانی)</option>
                    {voices.map(v => {
                      const isRecommended =
                        v.lang.startsWith('ar') ||
                        v.lang.startsWith('fa') ||
                        v.lang.startsWith('ku') ||
                        v.lang.startsWith('ckb');
                      return (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {isRecommended ? '⭐ ' : ''}{v.name} ({v.lang})
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div>
                  <strong style={{ fontSize: '13px', display: 'block' }}>
                    خوێندنەوەی دەنگیی کۆی پسووڵە بۆ کڕیار
                  </strong>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    کاتی تەواوکردنی فرۆشتن بە دەنگی کوردی ڕابگەیەنێت
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.announceCheckout}
                  onChange={() => handleToggleSetting('announceCheckout')}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div>
                  <strong style={{ fontSize: '13px', display: 'block' }}>دەنگی هۆشدارییەکانی کۆگا و بارکۆد</strong>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    خوێندنەوەی دەنگی بۆ بارکۆدی هەڵە یان کەمبوونەوەی کاڵا
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.announceAlerts}
                  onChange={() => handleToggleSetting('announceAlerts')}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </div>

              {/* Volume Amplification Boost */}
              <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e3a8a', marginBottom: '4px' }}>
                  🔊 بەرزی و بەهێزیی دەنگ (Volume Amplification Boost):
                </div>
                <div style={{ fontSize: '11px', color: '#3b82f6', marginBottom: '8px' }}>
                  زۆرکردنی بڕی دەنگ لە ڕێگەی بزوێنەری ئۆدیۆی نێوخۆیی (Web Audio Gain)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {[
                    { label: '100% ئاسایی', val: 1.0 },
                    { label: '150% بەهێز', val: 1.5 },
                    { label: '180% بەرز', val: 1.8 },
                    { label: '220% بەهێزترین', val: 2.2 }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => handleVolumeBoostChange(opt.val)}
                      style={{
                        padding: '7px 4px',
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        background: Math.abs((settings.volumeBoost || 1.8) - opt.val) < 0.1 ? '#1e3a8a' : '#ffffff',
                        color: Math.abs((settings.volumeBoost || 1.8) - opt.val) < 0.1 ? '#ffffff' : '#1e3a8a',
                        fontWeight: 900,
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="secondary"
                onClick={handleTestSpeech}
                style={{ padding: '11px', fontWeight: 800, fontSize: '13px', background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}
              >
                🔊 تاقیکردنەوەی دەنگی بێژەر
              </button>
            </div>
          )}
        </div>
    </div>
  );

  if (embedded) {
    return studioCard;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      {studioCard}
    </div>
  );
};
