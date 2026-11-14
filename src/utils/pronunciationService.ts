/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hybrid Pronunciation Assessment & Voice Comparison Engine (Lingopie-style)
 * - Real-time Web Speech API recognition + in-memory MediaRecorder for "Compare My Voice"
 * - Automatic server-side Whisper fallback (/api/whisper/pronounce) when browser SpeechRecognition is unavailable
 * - Word-by-word alignment & phonetic/Levenshtein scoring (Green / Yellow / Red)
 */

export type WordPronunciationStatus = 'good' | 'fair' | 'poor';

export interface WordPronunciationResult {
  raw: string;
  word: string;
  clean: string;
  spokenMatch?: string;
  spokenWord?: string;
  similarity: number; // 0..100
  status: WordPronunciationStatus;
}

export interface PronunciationEvaluation {
  targetText: string;
  spokenText: string;
  transcript: string;
  overallScore: number; // 0..100
  words: WordPronunciationResult[];
  audioBlobUrl?: string | null;
}

let lastRecordedBlobUrl: string | null = null;

export function revokeLastRecordedAudio() {
  if (lastRecordedBlobUrl) {
    try {
      URL.revokeObjectURL(lastRecordedBlobUrl);
    } catch (_) {}
    lastRecordedBlobUrl = null;
  }
}

export function normalizeForSpeechCompare(text: string, stripAccents = true): string {
  if (!text) return '';
  let s = text
    .toLowerCase()
    .replace(/['’`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripAccents) {
    // Preserve ё->е in Cyrillic before NFD strip
    s = s.replace(/ё/g, 'е').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return s;
}

/**
 * Character-level Levenshtein similarity between two normalized words (0..1)
 */
export function computeWordSimilarity(targetWord: string, spokenWord: string): number {
  const aExact = normalizeForSpeechCompare(targetWord, false);
  const bExact = normalizeForSpeechCompare(spokenWord, false);
  if (!aExact && !bExact) return 1;
  if (!aExact || !bExact) return 0;
  if (aExact === bExact) return 1;

  const a = normalizeForSpeechCompare(targetWord, true);
  const b = normalizeForSpeechCompare(spokenWord, true);
  if (a === b) return 0.96; // Only diacritic difference

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const dist = dp[m][n];
  const maxLen = Math.max(m, n);
  return Math.max(0, (maxLen - dist) / maxLen);
}

/**
 * Evaluates spoken transcript against target word/sentence and produces word-by-word coloring
 */
export function evaluatePronunciation(
  targetText: string,
  spokenText: string,
  acousticConfidence?: number,
  audioBlobUrl?: string | null
): PronunciationEvaluation {
  const rawTokens = (targetText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const spokenWords = normalizeForSpeechCompare(spokenText || '', false)
    .split(/\s+/)
    .filter(Boolean);

  if (rawTokens.length === 0) {
    return {
      targetText,
      spokenText,
      transcript: spokenText,
      overallScore: 0,
      words: [],
      audioBlobUrl,
    };
  }

  if (spokenWords.length === 0) {
    return {
      targetText,
      spokenText: '',
      transcript: '',
      overallScore: 0,
      words: rawTokens.map((raw) => ({
        raw,
        word: raw,
        clean: normalizeForSpeechCompare(raw, false),
        similarity: 0,
        status: 'poor',
      })),
      audioBlobUrl,
    };
  }

  // Align target tokens with spoken words using window search / DP so skipped or extra words don't shift the whole sentence
  const results: WordPronunciationResult[] = [];
  let spokenCursor = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i];
    const clean = normalizeForSpeechCompare(raw, false);
    if (!clean) {
      results.push({ raw, word: raw, clean: raw, similarity: 100, status: 'good' });
      continue;
    }

    let bestSim = 0;
    let bestIdx = -1;
    const searchStart = Math.max(0, spokenCursor - 1);
    const searchEnd = Math.min(spokenWords.length - 1, spokenCursor + 3);

    for (let j = searchStart; j <= searchEnd; j++) {
      const sim = computeWordSimilarity(clean, spokenWords[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1 && bestSim >= 0.45) {
      spokenCursor = bestIdx + 1;
    }

    const simPct = Math.round(bestSim * 100);
    const status: WordPronunciationStatus = simPct >= 80 ? 'good' : simPct >= 50 ? 'fair' : 'poor';
    const matched = bestIdx !== -1 ? spokenWords[bestIdx] : undefined;

    results.push({
      raw,
      word: raw,
      clean,
      spokenMatch: matched,
      spokenWord: matched,
      similarity: simPct,
      status,
    });
  }

  const avgWordScore =
    results.reduce((sum, w) => sum + w.similarity, 0) / Math.max(1, results.length);

  // Blend word similarity (85%) with acoustic confidence if available (15%)
  const confBoost =
    typeof acousticConfidence === 'number' && acousticConfidence > 0
      ? Math.min(100, Math.round(acousticConfidence * 100))
      : avgWordScore;

  const overallScore = Math.min(
    100,
    Math.max(0, Math.round(avgWordScore * 0.88 + confBoost * 0.12))
  );

  return {
    targetText,
    spokenText,
    transcript: spokenText,
    overallScore,
    words: results,
    audioBlobUrl,
  };
}

export function resolveSpeechLocale(languageOrLocale: string): string {
  const raw = (languageOrLocale || 'en').trim();
  if (/^[a-z]{2,3}-[A-Z]{2,4}$/.test(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.startsWith('es') || lower.includes('spanish') || lower.includes('испан')) return 'es-MX';
  if (lower.startsWith('en') || lower.includes('english') || lower.includes('англ')) return 'en-US';
  if (lower.startsWith('fr') || lower.includes('french') || lower.includes('франц')) return 'fr-FR';
  if (lower.startsWith('de') || lower.includes('german') || lower.includes('нем')) return 'de-DE';
  if (lower.startsWith('it') || lower.includes('italian') || lower.includes('итал')) return 'it-IT';
  if (lower.startsWith('pt') || lower.includes('portug') || lower.includes('португ')) return 'pt-BR';
  if (lower.startsWith('ru') || lower.includes('russian') || lower.includes('рус')) return 'ru-RU';
  if (lower.startsWith('uk') || lower.includes('ukrain') || lower.includes('укр')) return 'uk-UA';
  if (lower.startsWith('ja') || lower.includes('japan') || lower.includes('япон')) return 'ja-JP';
  if (lower.startsWith('zh') || lower.includes('chin') || lower.includes('кит')) return 'zh-CN';
  if (lower.startsWith('ko') || lower.includes('korean') || lower.includes('кор')) return 'ko-KR';
  if (lower.startsWith('tr') || lower.includes('turk') || lower.includes('тур')) return 'tr-TR';
  if (lower.startsWith('ar') || lower.includes('arab') || lower.includes('араб')) return 'ar-SA';
  if (lower.startsWith('pl') || lower.includes('polish') || lower.includes('польск')) return 'pl-PL';
  return 'en-US';
}

export interface PronunciationSessionCallbacks {
  onInterim?: (interimText: string) => void;
  onEvaluating?: () => void;
  onResult: (evaluation: PronunciationEvaluation) => void;
  onError?: (errorMsg: string) => void;
  onStateChange?: (state: 'listening' | 'processing' | 'idle') => void;
}

function formatMicrophoneError(err: any, uiLang = 'en'): string {
  const isRu = uiLang.toLowerCase().startsWith('ru');
  const isUk = uiLang.toLowerCase().startsWith('uk');
  const errName = String(err?.name || '');

  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
    if (isRu) return 'Микрофон не найден. Подключите или включите микрофон в настройках Windows.';
    if (isUk) return 'Мікрофон не знайдено. Підключіть або увімкніть мікрофон у налаштуваннях системи.';
    return 'No microphone found. Please connect or enable a microphone in your system settings.';
  }

  if (errName === 'NotReadableError' || errName === 'TrackStartError') {
    if (isRu) return 'Микрофон занят другой программой или отключён в настройках конфиденциальности Windows.';
    if (isUk) return 'Мікрофон зайнятий іншою програмою або вимкнений у налаштуваннях конфіденційності.';
    return 'Microphone is busy or blocked by Windows privacy settings.';
  }

  if (isRu) {
    return 'Доступ к микрофону запрещён для этого сайта. Нажмите на значок слева от адресной строки браузера и разрешите доступ к микрофону.';
  }
  if (isUk) {
    return 'Доступ до мікрофона заборонено для цього сайту. Натисніть на значок біля адресного рядка браузера та дозвольте мікрофон.';
  }
  return 'Microphone access is blocked for this site. Click the site settings icon in the address bar and allow Microphone.';
}

export class PronunciationRecorderSession {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recognition: any = null;
  private isStopped = false;
  private finalSpokenText = '';
  private interimSpokenText = '';
  private bestConfidence = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private speechRecognitionFailed = false;
  private serverBaseUrl: string;
  private uiLanguage: string;

  constructor(
    private targetText: string,
    private languageOrLocale: string,
    private callbacks: PronunciationSessionCallbacks,
    serverBaseUrl = '',
    uiLanguage = 'en'
  ) {
    this.serverBaseUrl = serverBaseUrl.replace(/\/+$/, '');
    this.uiLanguage = uiLanguage || 'en';
  }

  public async start(): Promise<void> {
    this.isStopped = false;
    this.finalSpokenText = '';
    this.interimSpokenText = '';
    this.bestConfidence = 0;
    this.audioChunks = [];
    this.speechRecognitionFailed = false;

    this.callbacks.onStateChange?.('listening');

    // 1. Start microphone MediaRecorder for "Compare My Voice" playback (and Whisper fallback)
    try {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (_) {
        // Fallback to plain audio constraint if specific constraints fail on user's hardware
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.audioChunks.push(ev.data);
        }
      };
      this.mediaRecorder.start(100);
    } catch (micErr: any) {
      this.callbacks.onStateChange?.('idle');
      this.callbacks.onError?.(formatMicrophoneError(micErr, this.uiLanguage));
      return;
    }

    // 2. Start Web Speech API recognition in parallel if available
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const wordCount = this.targetText.trim().split(/\s+/).length;
    const maxListenMs = Math.min(14000, Math.max(4500, wordCount * 1100 + 2500));

    this.maxDurationTimer = setTimeout(() => {
      this.stop();
    }, maxListenMs);

    if (SpeechRecognitionCtor) {
      try {
        const rec = new SpeechRecognitionCtor();
        this.recognition = rec;
        rec.lang = resolveSpeechLocale(this.languageOrLocale);
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 3;

        rec.onresult = (event: any) => {
          if (this.isStopped) return;
          let interim = '';
          let finalStr = '';

          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            // Check alternatives to see if any matches target phrase better (helps with homophones)
            let chosenTranscript = res[0]?.transcript || '';
            let chosenConf = res[0]?.confidence || 0;
            let bestAltSim = computeWordSimilarity(this.targetText, chosenTranscript);

            for (let a = 1; a < res.length; a++) {
              const altTranscript = res[a]?.transcript || '';
              const altSim = computeWordSimilarity(this.targetText, altTranscript);
              if (altSim > bestAltSim + 0.05) {
                bestAltSim = altSim;
                chosenTranscript = altTranscript;
                chosenConf = res[a]?.confidence || chosenConf;
              }
            }

            if (res.isFinal) {
              finalStr += ' ' + chosenTranscript;
              if (chosenConf > this.bestConfidence) {
                this.bestConfidence = chosenConf;
              }
            } else {
              interim += ' ' + chosenTranscript;
            }
          }

          if (finalStr.trim()) {
            this.finalSpokenText = finalStr.trim();
          }
          this.interimSpokenText = (this.finalSpokenText + ' ' + interim).trim();
          this.callbacks.onInterim?.(this.interimSpokenText);

          // Auto-stop shortly after user finishes speaking the target number of words
          const spokenCount = this.interimSpokenText.split(/\s+/).filter(Boolean).length;
          if (this.silenceTimer) clearTimeout(this.silenceTimer);
          const waitMs = spokenCount >= wordCount ? 750 : 1600;
          this.silenceTimer = setTimeout(() => {
            this.stop();
          }, waitMs);
        };

        rec.onerror = (ev: any) => {
          const errCode = ev?.error || '';
          if (errCode === 'network' || errCode === 'service-not-allowed' || errCode === 'not-allowed') {
            this.speechRecognitionFailed = true;
          }
        };

        rec.start();
      } catch (_) {
        this.speechRecognitionFailed = true;
      }
    } else {
      this.speechRecognitionFailed = true;
    }
  }

  public async stop(): Promise<void> {
    if (this.isStopped) return;
    this.isStopped = true;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    try {
      this.recognition?.stop();
    } catch (_) {}

    this.callbacks.onStateChange?.('processing');
    this.callbacks.onEvaluating?.();

    const audioBlob = await new Promise<Blob | null>((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(this.audioChunks.length > 0 ? new Blob(this.audioChunks, { type: 'audio/webm' }) : null);
        return;
      }
      this.mediaRecorder.onstop = () => {
        resolve(this.audioChunks.length > 0 ? new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' }) : null);
      };
      try {
        this.mediaRecorder.stop();
      } catch (_) {
        resolve(null);
      }
    });

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      this.mediaStream = null;
    }

    let blobUrl: string | null = null;
    if (audioBlob && audioBlob.size > 0) {
      revokeLastRecordedAudio();
      blobUrl = URL.createObjectURL(audioBlob);
      lastRecordedBlobUrl = blobUrl;
    }

    let spoken = (this.finalSpokenText || this.interimSpokenText).trim();

    // Fallback to Lectura Whisper server endpoint if browser Web Speech API returned nothing or failed
    if (!spoken && audioBlob && audioBlob.size > 200) {
      try {
        const base64Audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        if (base64Audio) {
          const endpoint = `${this.serverBaseUrl}/api/whisper/pronounce`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64Audio,
              language: resolveSpeechLocale(this.languageOrLocale).split('-')[0],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.transcript) {
              spoken = String(data.transcript).trim();
            }
          }
        }
      } catch (_) {}
    }

    this.callbacks.onStateChange?.('idle');

    const evaluation = evaluatePronunciation(
      this.targetText,
      spoken,
      this.bestConfidence || undefined,
      blobUrl
    );
    this.callbacks.onResult(evaluation);
  }
}
