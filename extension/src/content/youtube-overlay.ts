import { LecturaApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { ExtensionSettings, SubtitleCue, WordMap, WordMapItem, YouTubeActivityPayload } from '../types/index';
import { getSuggestedLemmas } from '../services/morphology';
import { t } from '../services/i18n';
import { isWordToken, cleanWordForLookup, isNumericOrSymbolToken, generateUUID, normalizeContraction, normalizeApostrophes } from '../services/text-utils';
import { ignoreListManager, getLocalizedIgnoreBadge, type AutoIgnoreResult } from '../services/ignore';
import { initYouTubeTracker, extractPrimaryYouTubeChannel } from './youtube-tracker';

export { generateUUID, extractPrimaryYouTubeChannel };

// 0) Initialize dedicated YouTube Lifecycle & Watch Time Tracker
initYouTubeTracker();

/**
 * Instantly initializes subtitle appearance CSS variables on DOM / Shadow host
 */
export function initSubtitleAppearance() {
  chrome.storage.local.get(['subtitleFontSize', 'subtitleBgColor'], (res) => {
    if (res.subtitleFontSize) {
      document.documentElement.style.setProperty('--lectura-sub-font-size', `${res.subtitleFontSize}px`);
      const host = document.getElementById('lectura-yt-shadow-host');
      if (host) host.style.setProperty('--lectura-sub-font-size', `${res.subtitleFontSize}px`);
      const subBox = host?.shadowRoot?.getElementById('lectura-subtitles-overlay');
      if (subBox) subBox.style.setProperty('--lectura-sub-font-size', `${res.subtitleFontSize}px`);
    }
    if (res.subtitleBgColor) {
      document.documentElement.style.setProperty('--lectura-sub-bg-color', res.subtitleBgColor);
      const host = document.getElementById('lectura-yt-shadow-host');
      if (host) host.style.setProperty('--lectura-sub-bg-color', res.subtitleBgColor);
      const subBox = host?.shadowRoot?.getElementById('lectura-subtitles-overlay');
      if (subBox) subBox.style.setProperty('--lectura-sub-bg-color', res.subtitleBgColor);
    }
  });
}

// 1) Run immediately upon content script execution
initSubtitleAppearance();

// 2) Run upon YouTube SPA navigation
window.addEventListener('yt-navigate-finish', () => {
  initSubtitleAppearance();
});

/**
 * Removes internal stutter/repeated phrases within a single caption string (e.g. "If you If you" -> "If you")
 */
export function removeInternalRepeats(text: string): string {
  if (!text) return '';
  return text
    .replace(/\b([\p{L}\p{N}'’\-]+)\s+\1\b/giu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merges two subtitle texts eliminating overlapping prefix/suffix words (Subtitle Cue De-overlapping)
 */
export function mergeSubtitleCuesCleanly(prevText: string, newText: string): string {
  const cleanPrev = (prevText || '').trim().replace(/\s+/g, ' ');
  const cleanNew = (newText || '').trim().replace(/\s+/g, ' ');

  if (!cleanPrev) return removeInternalRepeats(cleanNew);
  if (!cleanNew) return removeInternalRepeats(cleanPrev);

  // If new text already contains or starts with prev text (rolling ASR)
  if (cleanNew.toLowerCase().startsWith(cleanPrev.toLowerCase())) {
    return removeInternalRepeats(cleanNew);
  }

  // If prev text already ends with new text
  if (cleanPrev.toLowerCase().endsWith(cleanNew.toLowerCase())) {
    return removeInternalRepeats(cleanPrev);
  }

  // Search for overlap between the end of prev and start of new
  const prevWords = cleanPrev.split(/\s+/);
  const newWords = cleanNew.split(/\s+/);

  const maxOverlap = Math.min(prevWords.length, newWords.length);

  for (let len = maxOverlap; len > 0; len--) {
    const prevSlice = prevWords.slice(prevWords.length - len).join(' ');
    const newSlice = newWords.slice(0, len).join(' ');

    if (prevSlice.toLowerCase() === newSlice.toLowerCase()) {
      // Overlap found: take prev + remaining unique slice of new
      const merged = [...prevWords, ...newWords.slice(len)].join(' ');
      return removeInternalRepeats(merged);
    }
  }

  return removeInternalRepeats(`${cleanPrev} ${cleanNew}`);
}

/**
 * Deduplicates an array of visual segment strings (from DOM or caption events)
 */
export function deduplicateSubtitleSegments(segments: string[]): string {
  if (!segments || segments.length === 0) return '';

  const cleanSegments = segments
    .map((s) => (s || '').trim().replace(/\s+/g, ' '))
    .filter((s) => s.length > 0);

  if (cleanSegments.length === 0) return '';
  if (cleanSegments.length === 1) return removeInternalRepeats(cleanSegments[0]);

  let merged = cleanSegments[0];
  for (let i = 1; i < cleanSegments.length; i++) {
    merged = mergeSubtitleCuesCleanly(merged, cleanSegments[i]);
  }

  return removeInternalRepeats(merged);
}

/**
 * Extracts and deduplicates the active cue text at the given playback time
 */
export function getActiveCueText(cues: SubtitleCue[], currentTime: number): string {
  if (!cues || cues.length === 0) return '';
  const currentCue = cues.find((c) => currentTime >= c.startTime && currentTime <= c.endTime);
  if (!currentCue) return '';
  return removeInternalRepeats(currentCue.text);
}

export interface CaptionWord {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface CleanSentence {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

export interface StaticSubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface StaticSubtitleBlock {
  id: number;
  startTime: number;
  endTime: number;
  fullText: string;
  words: StaticSubtitleWord[];
}

export interface MergedSubtitleSentence {
  start: number;
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

/**
 * Extracts ALL words across all events into a single continuous stream with no gaps or lost tokens
 */
export function extractAllWordsFromEvents(events: any[]): CaptionWord[] {
  const allWords: CaptionWord[] = [];
  if (!Array.isArray(events) || events.length === 0) return allWords;

  for (const ev of events) {
    if (!ev || !ev.segs || !Array.isArray(ev.segs)) continue;
    const eventStartSec = (ev.tStartMs || 0) / 1000;
    const eventDurSec = (ev.dDurationMs || 1000) / 1000;

    for (const seg of ev.segs) {
      const txt = seg?.utf8;
      if (!txt || txt === '\n' || txt === '\r\n') continue;

      const offsetSec = (seg.tOffsetMs || 0) / 1000;
      const start = eventStartSec + offsetSec;
      const end = start + Math.max(0.4, eventDurSec);

      // Split into individual words while preserving all punctuation
      const tokens = txt.trim().split(/\s+/);
      for (const token of tokens) {
        if (token) {
          allWords.push({ text: token, start, end });
        }
      }
    }
  }

  return allWords;
}

/**
 * Normalizes punctuation: glues standalone punctuation tokens to the previous word
 */
export function normalizeCaptionTokens(tokens: CaptionWord[]): CaptionWord[] {
  const clean: CaptionWord[] = [];
  for (const t of tokens) {
    const text = t.text.trim();
    if (/^[.,!?;:]+$/.test(text) && clean.length > 0) {
      // Приклеиваем знак к предыдущему слову
      clean[clean.length - 1].text += text;
      clean[clean.length - 1].end = Math.max(clean[clean.length - 1].end, t.end);
    } else if (text) {
      clean.push({ ...t, text });
    }
  }
  return clean;
}

/**
 * Losslessly chunks the continuous word stream into wide reference blocks (24-28 words)
 * Guarantees that EVERY word belongs to a sentence block and ZERO words are dropped.
 */
export function buildSentencesWithoutLoss(words: CaptionWord[]): CleanSentence[] {
  const normalized = normalizeCaptionTokens(words);
  const blocks: CleanSentence[] = [];
  if (!normalized || normalized.length === 0) return blocks;

  let currentWords: CaptionWord[] = [];
  let blockIdCounter = 1;

  for (let i = 0; i < normalized.length; i++) {
    currentWords.push(normalized[i]);

    const isFullLength = currentWords.length >= 24;
    const isPunctuationBoundary = /[.!?]$/.test(normalized[i].text) && currentWords.length >= 20;
    const isLast = i === normalized.length - 1;

    // Close block when 22-26 words accumulated
    if (isFullLength || isPunctuationBoundary || isLast) {
      const start = currentWords[0].start;
      const end = currentWords[currentWords.length - 1].end + 0.15;
      const fullText = currentWords.map((cw) => cw.text).join(' ').replace(/\s+/g, ' ').trim();

      if (fullText) {
        blocks.push({
          id: blockIdCounter++,
          start,
          end: Math.max(end, start + 1.6),
          text: fullText,
          words: [...currentWords],
        });
      }
      currentWords = [];
    }
  }

  // Safety flush: if any words remained, add them as a final block
  if (currentWords.length > 0) {
    const start = currentWords[0].start;
    const end = currentWords[currentWords.length - 1].end + 0.15;
    const fullText = currentWords.map((cw) => cw.text).join(' ').replace(/\s+/g, ' ').trim();
    if (fullText) {
      blocks.push({
        id: blockIdCounter++,
        start,
        end: Math.max(end, start + 1.6),
        text: fullText,
        words: [...currentWords],
      });
    }
  }

  return blocks;
}

/**
 * Strict timing finalizer: ensures that the end time of the current block NEVER overlaps
 * or exceeds the start time of the subsequent block.
 */
export function finalizeSubtitleBlockTimings(blocks: CleanSentence[]): CleanSentence[] {
  for (let i = 0; i < blocks.length - 1; i++) {
    const curr = blocks[i];
    const next = blocks[i + 1];

    // Current block MUST end exactly when the next block starts (e.g. at 0:06)
    if (curr.end > next.start) {
      curr.end = next.start;
    }
  }
  return blocks;
}

/**
 * Strict sentence splitting for official YouTube JSON3 events track (Lossless)
 */
export function parseJson3IntoCleanSentences(events: any[]): CleanSentence[] {
  const words = extractAllWordsFromEvents(events);
  const blocks = buildSentencesWithoutLoss(words);
  return finalizeSubtitleBlockTimings(blocks);
}

/**
 * Strict sentence splitting for XML/srv1 timedtext tracks (Lossless)
 */
export function parseXmlIntoCleanSentences(xmlString: string): CleanSentence[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const textNodes = doc.querySelectorAll('text');
    const allWords: CaptionWord[] = [];

    textNodes.forEach((node) => {
      const start = parseFloat(node.getAttribute('start') || '0');
      const dur = parseFloat(node.getAttribute('dur') || '3');
      const rawText = (node.textContent || '').trim();
      if (!rawText) return;

      const tokens = rawText.split(/\s+/);
      const step = dur / Math.max(1, tokens.length);

      tokens.forEach((token, idx) => {
        if (token) {
          allWords.push({
            text: token,
            start: start + idx * step,
            end: start + (idx + 1) * step + 0.4,
          });
        }
      });
    });

    const blocks = buildSentencesWithoutLoss(allWords);
    return finalizeSubtitleBlockTimings(blocks);
  } catch (_) {
    return [];
  }
}

/**
 * Parses full YouTube TimedText data (JSON3 or XML) and pre-segments into full static 2-line sentence blocks
 */
export function parseTimedTextData(data: string | any): StaticSubtitleBlock[] {
  const sentences = typeof data === 'string' && !data.trim().startsWith('{')
    ? parseXmlIntoCleanSentences(data)
    : parseJson3IntoCleanSentences(typeof data === 'object' ? data.events : (JSON.parse(data || '{}').events || []));

  return sentences.map((s) => ({
    id: s.id,
    startTime: s.start,
    endTime: s.end,
    fullText: s.text,
    words: s.text.split(/\s+/).map((w, idx) => ({
      word: w,
      start: s.start + idx * 0.25,
      end: s.start + (idx + 1) * 0.25,
    })),
  }));
}

/**
 * Groups short rapid ASR cues into cohesive 2-line logical sentences/clauses
 */
export function groupCuesIntoSentences(rawCues: SubtitleCue[]): MergedSubtitleSentence[] {
  const sentences: MergedSubtitleSentence[] = [];
  let currentGroup: SubtitleCue[] = [];

  for (let i = 0; i < rawCues.length; i++) {
    const cue = rawCues[i];
    currentGroup.push(cue);

    const fullText = currentGroup.map((c) => c.text.trim()).join(' ');
    const cleanedText = removeInternalRepeats(fullText);
    const hasPunctuationEnd = /[.!?]$/.test(cleanedText.trim());
    const isTooLong = cleanedText.length > 90 || cleanedText.split(/\s+/).length >= 18;
    const isLast = i === rawCues.length - 1;

    // Закрываем блок, если предложение закончилось точкой или накопилось достаточно слов для 2 строк
    if (hasPunctuationEnd || isTooLong || isLast) {
      sentences.push({
        start: currentGroup[0].startTime,
        end: currentGroup[currentGroup.length - 1].endTime,
        text: cleanedText,
      });
      currentGroup = [];
    }
  }

  return sentences;
}

export interface DialectInfo {
  code: string;
  label: string;
  name: string;
}

export const LANGUAGE_DIALECTS: Record<string, DialectInfo[]> = {
  es: [
    { code: 'es-MX', label: 'MX', name: 'Mexican Spanish' },
    { code: 'es-ES', label: 'ES', name: 'Castilian Spanish' },
    { code: 'es-US', label: 'US', name: 'US Spanish' },
    { code: 'es-AR', label: 'AR', name: 'Argentine Spanish' },
  ],
  en: [
    { code: 'en-US', label: 'US', name: 'American English' },
    { code: 'en-GB', label: 'UK', name: 'British English' },
    { code: 'en-AU', label: 'AU', name: 'Australian English' },
  ],
  fr: [
    { code: 'fr-FR', label: 'FR', name: 'French (France)' },
    { code: 'fr-CA', label: 'CA', name: 'French (Canada)' },
  ],
  pt: [
    { code: 'pt-BR', label: 'BR', name: 'Portuguese (Brazil)' },
    { code: 'pt-PT', label: 'PT', name: 'Portuguese (Portugal)' },
  ],
  de: [{ code: 'de-DE', label: 'DE', name: 'German' }],
  ru: [{ code: 'ru-RU', label: 'RU', name: 'Russian' }],
  it: [{ code: 'it-IT', label: 'IT', name: 'Italian' }],
  ja: [{ code: 'ja-JP', label: 'JP', name: 'Japanese' }],
  zh: [{ code: 'zh-CN', label: 'CN', name: 'Chinese (Mandarin)' }],
  ko: [{ code: 'ko-KR', label: 'KR', name: 'Korean' }],
};

export function normalizeLangCode(lang?: string): string {
  if (!lang) return 'en';
  const l = lang.trim().toLowerCase();
  if (l.startsWith('es') || l.includes('span')) return 'es';
  if (l.startsWith('en') || l.includes('engl')) return 'en';
  if (l.startsWith('fr') || l.includes('fren')) return 'fr';
  if (l.startsWith('de') || l.includes('germ')) return 'de';
  if (l.startsWith('ru') || l.includes('russ')) return 'ru';
  if (l.startsWith('it') || l.includes('ital')) return 'it';
  if (l.startsWith('pt') || l.includes('port')) return 'pt';
  if (l.startsWith('zh') || l.includes('chin')) return 'zh';
  if (l.startsWith('ja') || l.includes('jap')) return 'ja';
  if (l.startsWith('ko') || l.includes('kore')) return 'ko';
  return l.slice(0, 2);
}

/**
 * Cleans punctuation from edges of words while strictly preserving all accents and diacritics (á, é, í, ó, ú, ñ, ü, etc.)
 */
export function cleanWordForTranslation(rawWord: string): string {
  return cleanWordForLookup(rawWord);
}

export function getDialectsForLanguage(lang: string): DialectInfo[] {
  const code = normalizeLangCode(lang);
  return LANGUAGE_DIALECTS[code] || [{ code: `${code}-${code.toUpperCase()}`, label: code.toUpperCase(), name: lang }];
}

export function getLanguageDisplayName(code: string): string {
  const langMap: Record<string, string> = {
    es: 'Spanish',
    en: 'English',
    fr: 'French',
    de: 'German',
    ru: 'Russian',
    it: 'Italian',
    pt: 'Portuguese',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    tr: 'Turkish',
  };
  const clean = normalizeLangCode(code);
  return langMap[clean] || (code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Spanish');
}

export function resolveDialect(lang: string, preferredDialect?: string): DialectInfo {
  const dialects = getDialectsForLanguage(lang);
  const code = normalizeLangCode(lang);
  if (preferredDialect && preferredDialect.toLowerCase().startsWith(code)) {
    const found = dialects.find((d) => d.code.toLowerCase() === preferredDialect.toLowerCase());
    if (found) return found;
  }
  return dialects[0];
}

/**
 * Detects whether the current page is the native Lectura application and should skip injection
 */
export async function shouldSkipInjection(): Promise<boolean> {
  if (typeof document !== 'undefined') {
    const hasAppMeta = document.querySelector('meta[name="app-identifier"][content="lectura-core-app"]') !== null;
    if (hasAppMeta) return true;

    const hasRootAttr = document.querySelector('[data-app-identifier="lectura-core-app"]') !== null;
    if (hasRootAttr) return true;

    if ((window as any).__LECTURA_APP_IDENTIFIER__ === 'lectura-core-app') return true;
  }

  try {
    const settings = await StorageService.getSettings();
    if (settings?.serverUrl) {
      const configuredOrigin = new URL(settings.serverUrl).origin;
      if (window.location.origin === configuredOrigin) {
        return true;
      }
    }
  } catch (_) {}

  return false;
}

class YouTubeLecturaOverlay {
  private videoElement: HTMLVideoElement | null = null;
  private playerContainer: HTMLElement | null = null;
  private overlayContainer: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private subtitleBox: HTMLElement | null = null;
  private popupCard: HTMLElement | null = null;
  private toastElement: HTMLElement | null = null;

  private currentVideoId: string = '';
  private currentUrl: string = '';
  private isInitialized: boolean = false;
  private activeCues: SubtitleCue[] = [];
  private currentCueIndex: number = -1;
  private currentSubtitleText: string = '';

  private apiClient: LecturaApiClient = new LecturaApiClient();
  private settings: ExtensionSettings | null = null;
  private cachedWordsByLang: Record<string, WordMap> = {};
  private cachedWordLinksByLang: Record<string, Record<string, string>> = {};
  private activeDialectByLang: Record<string, string> = {};
  private mutationObserver: MutationObserver | null = null;
  private timeUpdateHandler: (() => void) | null = null;

  // Multi-word phrase selection & Selection Lock
  private isPhraseSelecting: boolean = false;
  private startTokenIndex: number | null = null;
  private selectedTokens: HTMLElement[] = [];
  private isShiftDown: boolean = false;
  private hasDraggedMultiple: boolean = false;

  // Mini Hover Tooltip (Language Reactor Style)
  private hoverTooltip: HTMLElement | null = null;
  private hoverTimeoutId: number | null = null;

  // Subtitle size preset state: 'sm' | 'md' | 'lg'
  private currentSizePreset: 'sm' | 'md' | 'lg' = 'md';

  // Dual Subtitles state (default OFF unless user enabled)
  private enableDualSubtitles: boolean = false;

  // Language Reactor / Trancy style enhancements: Auto-Pause [Q], Blur Mode [H], Transcript Sidebar [T]
  private autoPauseAfterSubtitle: boolean = false;
  private autoPausedSentenceIndex: number = -1;
  private subtitleBlurMode: 'off' | 'translation' | 'both' = 'off';
  private showTranscriptSidebar: boolean = false;
  private sidebarHost: HTMLElement | null = null;
  private sidebarShadowRoot: ShadowRoot | null = null;
  private transcriptPanel: HTMLElement | null = null;
  private playerFloatingToggle: HTMLElement | null = null;
  private transcriptSearchQuery: string = '';

  // AbortController for in-flight translation requests
  private translationAbortController: AbortController | null = null;

  // YouTube Watch Time & Activity Tracking (Listening History)
  private activeWatchSeconds: number = 0;
  private watchTimer: number | null = null;
  private hasActivityListeners: boolean = false;
  private hasStorageListener: boolean = false;

  // Full Static Sentence Display State (Track Pre-fetching & Strict Sentence Splitting)
  public preparsedSentences: CleanSentence[] = [];
  public currentSentenceIndex: number = -1;
  private isLoadingSubtitles: boolean = false;
  private subtitleLoadAttempts: number = 0;
  private lastSubtitleAttemptTime: number = 0;
  private hasGlobalOverlayListeners: boolean = false;
  private isSubMouseDown: boolean = false;
  private subDragStartIndex: number | null = null;
  private lastTickTime: number = 0;
  private animFrameId: number | null = null;
  private staticSubtitleBlocks: StaticSubtitleBlock[] = [];
  private activeBlockId: number | null = null;

  constructor() {
    this.setupShiftTracking();
    this.setupClickOutsideListener();
    this.init();
  }

  private async init() {
    if (await shouldSkipInjection()) {
      console.log('🛑 [Lectura Extension] Detected native Lectura application. Skipping extension injection.');
      return;
    }

    // Purge legacy mixed-language caches on startup to guarantee pure isolation
    await StorageService.purgeLegacyCaches();

    // Attach network interceptor for YouTube /api/timedtext requests
    this.setupTimedTextNetworkInterceptor();

    this.settings = await StorageService.getSettings();

    // Listen for live storage & runtime messages (including EXTRACT_ARTICLE and re-enabling overlay)
    this.setupStorageListener();

    if (this.settings.isEnabled === false || !this.settings.enableYoutubeOverlay) {
      console.log('[Lectura YT] YouTube overlay is disabled in settings.');
      return;
    }
    this.updateSubtitleContainerMode(this.settings.subtitleHighlightMode || 'color');
    this.applySubtitleFontSize(this.settings.subtitleFontSize || 22);
    this.applySubtitleBgColor(this.settings.subtitleBgColor || 'rgba(0, 0, 0, 0.45)');

    // Clear any corrupt/legacy position keys from previous sessions
    chrome.storage.local.remove([
      'lectura_subtitle_pos',
      'subtitles_custom_pos',
      'subtitle_pos',
      'customSubtitlesPos',
    ]);

    // Restore saved size preset, dual subtitles, auto-pause, blur mode, and transcript sidebar preferences
    this.autoPauseAfterSubtitle = Boolean(this.settings.autoPauseAfterSubtitle);
    this.subtitleBlurMode = (this.settings.subtitleBlurMode as 'off' | 'translation' | 'both') || 'off';
    this.showTranscriptSidebar = Boolean(this.settings.showTranscriptSidebar);

    chrome.storage.local.get(
      ['sub_size_preset', 'dual_subs', 'autoPauseAfterSubtitle', 'subtitleBlurMode', 'showTranscriptSidebar'],
      (res) => {
        const saved = res.sub_size_preset;
        if (saved && ['sm', 'md', 'lg'].includes(saved)) {
          this.applySizePreset(saved as 'sm' | 'md' | 'lg', false);
        } else {
          this.applySizePreset('md', false);
        }

        if (typeof res.dual_subs === 'boolean') {
          this.enableDualSubtitles = res.dual_subs;
        }
        if (typeof res.autoPauseAfterSubtitle === 'boolean') {
          this.autoPauseAfterSubtitle = res.autoPauseAfterSubtitle;
        }
        if (res.subtitleBlurMode && ['off', 'translation', 'both'].includes(res.subtitleBlurMode)) {
          this.subtitleBlurMode = res.subtitleBlurMode;
        }
        if (typeof res.showTranscriptSidebar === 'boolean') {
          this.showTranscriptSidebar = res.showTranscriptSidebar;
        }
      }
    );

    const initialLang = this.getEffectiveLang();
    this.cachedWordsByLang[initialLang] = await StorageService.getCachedWords(initialLang);

    // Sync fresh dictionary & word links from Lectura server in background
    this.syncVocabulary(initialLang);

    // Listen for SPA navigation events on YouTube
    this.setupSpaNavigation();

    // Setup global hotkeys
    this.setupKeyboardShortcuts();

    // Check current page
    this.handleUrlChange();
  }

  public applySubtitleFontSize(fontSizePx: number) {
    if (this.settings) {
      this.settings.subtitleFontSize = fontSizePx;
    }
    if (this.overlayContainer) {
      this.overlayContainer.style.setProperty('--lectura-sub-font-size', `${fontSizePx}px`);
    }
    if (this.subtitleBox) {
      this.subtitleBox.style.setProperty('--lectura-sub-font-size', `${fontSizePx}px`);
    }
    if (this.shadowRoot?.host instanceof HTMLElement) {
      this.shadowRoot.host.style.setProperty('--lectura-sub-font-size', `${fontSizePx}px`);
    }
    document.documentElement.style.setProperty('--lectura-sub-font-size', `${fontSizePx}px`);
  }

  public applySubtitleBgColor(color: string) {
    if (this.settings) {
      this.settings.subtitleBgColor = color;
    }
    if (this.overlayContainer) {
      this.overlayContainer.style.setProperty('--lectura-sub-bg-color', color);
    }
    if (this.subtitleBox) {
      this.subtitleBox.style.setProperty('--lectura-sub-bg-color', color);
    }
    if (this.shadowRoot?.host instanceof HTMLElement) {
      this.shadowRoot.host.style.setProperty('--lectura-sub-bg-color', color);
    }
    document.documentElement.style.setProperty('--lectura-sub-bg-color', color);
  }

  /**
   * Listens for live configuration changes from Popup or Options page
   */
  private setupStorageListener() {
    if (this.hasStorageListener) return;
    this.hasStorageListener = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' || area === 'local') {
        if (changes.subtitleHighlightMode) {
          const newMode = (changes.subtitleHighlightMode.newValue || 'underline') as 'underline' | 'color';
          if (this.settings) this.settings.subtitleHighlightMode = newMode;
          this.updateSubtitleContainerMode(newMode);
        }
        if (changes.subtitleFontSize) {
          const newSize = changes.subtitleFontSize.newValue;
          if (newSize) {
            this.applySubtitleFontSize(newSize);
          }
        }
        if (changes.subtitleBgColor) {
          const newColor = changes.subtitleBgColor.newValue;
          if (newColor) {
            this.applySubtitleBgColor(newColor);
          }
        }
        if (changes.dual_subs !== undefined || changes.enableDualSubtitles !== undefined) {
          const newDualVal = changes.dual_subs?.newValue ?? changes.enableDualSubtitles?.newValue;
          if (typeof newDualVal === 'boolean') {
            this.enableDualSubtitles = newDualVal;
            const transEl = this.subtitleBox?.querySelector<HTMLElement>('.lectura-sub-translation');
            if (transEl) {
              transEl.style.display = this.enableDualSubtitles ? 'block' : 'none';
              if (this.enableDualSubtitles && !transEl.textContent && this.currentSubtitleText) {
                this.fetchFullSentenceTranslation(this.currentSubtitleText).then((trans) => {
                  if (trans && transEl.parentElement) transEl.textContent = trans;
                });
              }
            }
          }
        }
        if (changes.isEnabled !== undefined) {
          const isEnabled = changes.isEnabled.newValue !== false;
          if (this.settings) this.settings.isEnabled = isEnabled;
          if (this.overlayContainer) {
            this.overlayContainer.style.display = (isEnabled && this.settings?.enableYoutubeOverlay !== false) ? '' : 'none';
          }
          if (this.popupCard && !isEnabled) {
            this.popupCard.style.display = 'none';
          }
          this.syncTranscriptPlacement();
        }
        if (changes.sub_size_preset || changes.subtitleSizePreset) {
          const newPreset = (changes.sub_size_preset?.newValue || changes.subtitleSizePreset?.newValue) as 'sm' | 'md' | 'lg';
          if (newPreset && ['sm', 'md', 'lg'].includes(newPreset)) {
            this.applySizePreset(newPreset, false);
          }
        }
        if (changes.subtitleFontSize || changes.subtitleBgOpacity) {
          StorageService.getSettings().then((s) => {
            this.settings = s;
            if (this.shadowRoot) {
              const styleEl = this.shadowRoot.querySelector('style');
              if (styleEl) styleEl.textContent = this.getShadowStyles();
            }
          });
        }
        if (changes.targetLanguage) {
          StorageService.getSettings().then((s) => {
            this.settings = s;
            this.syncVocabulary();
          });
        }
        if (changes.ttsDialect) {
          if (this.settings) {
            this.settings.ttsDialect = changes.ttsDialect.newValue;
          }
        }
        if (changes.popupTheme || changes.popup_theme) {
          const newTheme = changes.popupTheme?.newValue || changes.popup_theme?.newValue || 'compact';
          this.applyPopupTheme(newTheme);
        }
      }
    });

    // Listen for direct theme, language, and video extraction messages from Popup and Options pages
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'EXTRACT_ARTICLE') {
        (async () => {
          try {
            const videoId = this.extractVideoId(window.location.href) || this.currentVideoId;
            if (!videoId) {
              sendResponse({ success: false, error: 'Please open a YouTube video page (/watch or /shorts) to import.' });
              return;
            }

            if (!this.preparsedSentences || this.preparsedSentences.length === 0) {
              await this.loadFullVideoSubtitles(videoId);
            }

            const titleEl = document.querySelector<HTMLElement>(
              'ytd-watch-metadata h1 yt-formatted-string, #title h1 yt-formatted-string, h1.ytd-watch-metadata'
            );
            const rawTitle = (titleEl?.textContent || document.title || '').replace(/\s*-\s*YouTube$/i, '').trim() || 'YouTube Video';
            const channelName = extractPrimaryYouTubeChannel() || 'YouTube';
            const langCode = this.getEffectiveLang();

            const transcriptText = (this.preparsedSentences || [])
              .filter((s) => s.text && s.text.trim())
              .map((s) => `${Math.floor(s.start || 0)}s\t${s.text.trim().replace(/\s+/g, ' ')}`)
              .join('\n');

            const avatarImg = document.querySelector<HTMLImageElement>(
              'ytd-watch-metadata #owner #avatar img, #upload-info #avatar img, ytd-video-owner-renderer #avatar img'
            );
            const channelAvatarUrl = avatarImg?.src || undefined;
            const duration =
              this.videoElement?.duration && isFinite(this.videoElement.duration) && this.videoElement.duration > 0
                ? Math.round(this.videoElement.duration)
                : undefined;

            const words = transcriptText.replace(/^\d+s\t/gm, '').split(/\s+/).filter(Boolean);
            sendResponse({
              success: true,
              article: {
                title: rawTitle,
                content: transcriptText,
                excerpt: transcriptText.slice(0, 200),
                author: channelName,
                channelAvatarUrl,
                duration,
                sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
                leadImageUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                language: langCode,
                wordCount: words.length,
                lessonType: 'youtube',
                sourceType: 'youtube',
                youtubeId: videoId,
              },
            });
          } catch (err: any) {
            sendResponse({ success: false, error: err?.message || 'Failed to extract YouTube video' });
          }
        })();
        return true;
      }
      if (message.type === 'VOCABULARY_UPDATED') {
        StorageService.getSettings().then((freshSettings) => {
          this.settings = freshSettings;
          const studyLang = message.language || freshSettings.targetLanguage;
          this.syncVocabulary(studyLang).then(() => {
            if (this.currentSubtitleText) {
              this.renderSubtitleTokens(this.currentSubtitleText);
            }
          });
        });
      }
      if (message.type === 'UPDATE_POPUP_THEME' && message.theme) {
        this.applyPopupTheme(message.theme);
      }
      if (message.type === 'UPDATE_UI_LANGUAGE' && message.language) {
        if (this.settings) {
          this.settings.interfaceLanguage = message.language;
        }
        if (this.activeWordData && this.popupCard && this.popupCard.style.display !== 'none') {
          this.showWordCard(this.activeWordData.word, this.activeWordData.contextSentence, this.activeWordData.targetToken);
        }
      }
      if (message.type === 'UPDATE_SUB_FONT_SIZE' && message.size) {
        this.applySubtitleFontSize(message.size);
      }
      if (message.type === 'UPDATE_SUB_BG_COLOR' && message.color) {
        this.applySubtitleBgColor(message.color);
      }
      if (message.type === 'UPDATE_YOUTUBE_OVERLAY_ENABLED') {
        if (this.settings) {
          this.settings.enableYoutubeOverlay = !!message.enabled;
        }
        if (this.overlayContainer) {
          this.overlayContainer.style.display = message.enabled ? '' : 'none';
          this.syncTranscriptPlacement();
        } else if (message.enabled) {
          this.init();
        }
      }
      if (message.type === 'UPDATE_TRACK_ACTIVITY_ENABLED') {
        if (this.settings) {
          this.settings.trackListeningActivity = !!message.enabled;
        }
      }
    });
  }

  /**
   * Instantly applies theme styling to the active or upcoming word popup card
   */
  public applyPopupTheme(themeName: string) {
    const theme = (themeName || 'compact') as 'compact' | 'extended' | 'glass' | 'calm_light';
    if (this.settings) {
      this.settings.popupTheme = theme;
    }
    if (this.popupCard) {
      // If word popup is currently visible, re-render immediately in the new theme layout
      if (this.activeWordData && this.popupCard.style.display !== 'none') {
        this.showWordCard(this.activeWordData.word, this.activeWordData.contextSentence, this.activeWordData.targetToken);
      } else {
        this.popupCard.classList.remove(
          'compact',
          'extended',
          'glass',
          'calm_light',
          'theme-compact',
          'theme-extended',
          'theme-glass-v2',
          'theme-calm-light'
        );
        if (theme === 'calm_light') {
          this.popupCard.className = 'lectura-word-card theme-calm-light calm_light';
        } else if (theme === 'glass') {
          this.popupCard.className = 'lectura-word-card theme-glass-v2 glass';
        } else if (theme === 'extended') {
          this.popupCard.className = 'lectura-word-card extended theme-extended';
        } else {
          this.popupCard.className = 'lectura-word-card compact theme-compact';
        }
      }
    }
  }

  private updateSubtitleContainerMode(mode: 'underline' | 'color') {
    if (!this.subtitleBox) return;
    this.subtitleBox.classList.remove('sub-mode--underline', 'sub-mode--color');
    this.subtitleBox.classList.add(mode === 'color' ? 'sub-mode--color' : 'sub-mode--underline');
  }

  private setupSpaNavigation() {
    document.addEventListener('yt-navigate-finish', () => {
      this.handleUrlChange();
    });

    window.addEventListener('popstate', () => {
      this.handleUrlChange();
    });

    setInterval(() => {
      if (window.location.href !== this.currentUrl) {
        this.handleUrlChange();
      }
    }, 1000);
  }

  private extractVideoId(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v') || '';
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || '';
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || '';
      }
    } catch (_) {}
    return '';
  }

  private handleUrlChange() {
    const newUrl = window.location.href;
    const newVideoId = this.extractVideoId(newUrl);

    if (newUrl === this.currentUrl && newVideoId === this.currentVideoId && this.isInitialized) {
      return;
    }

    this.currentUrl = newUrl;
    this.currentVideoId = newVideoId;
    (window as any).__LECTURA_ACTIVE_LANG__ = null;
    (window as any).__LECTURA_YT_TRACK_LANG__ = null;
    this.videoSessionLanguage = '';

    this.resetState();

    if (!newVideoId) {
      return;
    }

    this.waitForPlayerAndInit();
  }

  private setupShiftTracking() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.isShiftDown = false;
    });
    window.addEventListener('blur', () => {
      this.isShiftDown = false;
    });
  }

  private setupClickOutsideListener() {
    document.addEventListener('click', (e) => {
      if (this.popupCard && this.popupCard.style.display !== 'none') {
        const path = e.composedPath();
        const clickedInsideOverlay = this.overlayContainer ? path.includes(this.overlayContainer) : false;
        const clickedInsideCard = this.popupCard ? path.includes(this.popupCard) : false;
        const clickedInsideSubtitles = this.subtitleBox ? path.includes(this.subtitleBox) : false;
        const clickedInsideTranscript = this.sidebarHost ? path.includes(this.sidebarHost) : false;
        if (!clickedInsideOverlay && !clickedInsideCard && !clickedInsideSubtitles && !clickedInsideTranscript) {
          this.closeWordCard();
        }
      }
    });
  }

  private resetState() {
    if (this.activeWatchSeconds > 0) {
      this.flushActivityToLectura();
    }

    this.preparsedSentences = [];
    this.currentSentenceIndex = -1;
    this.isLoadingSubtitles = false;
    this.subtitleLoadAttempts = 0;
    this.lastSubtitleAttemptTime = 0;
    this.isSubMouseDown = false;
    this.subDragStartIndex = null;
    this.activeCues = [];
    this.currentCueIndex = -1;
    this.currentSubtitleText = '';
    this.staticSubtitleBlocks = [];
    this.activeBlockId = null;
    this.isPhraseSelecting = false;
    this.startTokenIndex = null;
    this.selectedTokens = [];

    if (this.subtitleBox) {
      this.subtitleBox.innerHTML = '';
      this.subtitleBox.style.display = 'none';
    }
    if (this.popupCard) {
      this.popupCard.style.display = 'none';
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.videoElement && this.timeUpdateHandler) {
      this.videoElement.removeEventListener('timeupdate', this.timeUpdateHandler);
      this.timeUpdateHandler = null;
    }
  }

  private waitForPlayerAndInit(retries = 0) {
    if (retries > 30) {
      console.warn('[Lectura YT] Could not find YouTube video player.');
      return;
    }

    const player = document.querySelector('#movie_player, .html5-video-player') as HTMLElement;
    const video = document.querySelector('video.html5-main-video, #movie_player video') as HTMLVideoElement;

    if (player && video) {
      this.playerContainer = player;
      this.videoElement = video;
      this.buildOverlay();
      this.hideNativeCaptions();
      this.loadFullVideoSubtitles(this.currentVideoId);
      this.setupTimeListener();
      this.setupActivityTracking();
      this.isInitialized = true;
    } else {
      setTimeout(() => this.waitForPlayerAndInit(retries + 1), 300);
    }
  }

  /**
   * Activity tracking is handled by the dedicated YouTubeTracker lifecycle module
   */
  private setupActivityTracking() {
    // Managed comprehensively by youtube-tracker.ts
  }

  /**
   * Flushes accumulated watch seconds to Lectura server (delegated to youtube-tracker)
   */
  private async flushActivityToLectura() {
    // Delegated to youtube-tracker.ts
  }

  /**
   * Constructs isolated Shadow DOM overlay above player
   */
  private buildOverlay() {
    if (this.overlayContainer && this.overlayContainer.parentElement) {
      this.overlayContainer.remove();
    }

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'lectura-yt-shadow-host';
    this.overlayContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;

    this.shadowRoot = this.overlayContainer.attachShadow({ mode: 'open' });

    // Styles for Shadow DOM
    const styleEl = document.createElement('style');
    styleEl.textContent = this.getShadowStyles();
    this.shadowRoot.appendChild(styleEl);

    // Subtitle Container
    this.subtitleBox = document.createElement('div');
    this.subtitleBox.id = 'lectura-subtitles-overlay';
    this.subtitleBox.className = 'lectura-subtitles-container';
    this.updateSubtitleContainerMode(this.settings?.subtitleHighlightMode || 'color');
    this.applySizePreset(this.currentSizePreset, false);

    // Apply saved appearance immediately upon overlay creation
    const currentFontSize = this.settings?.subtitleFontSize || 22;
    const currentBgColor = this.settings?.subtitleBgColor || 'rgba(0, 0, 0, 0.45)';
    this.applySubtitleFontSize(currentFontSize);
    this.applySubtitleBgColor(currentBgColor);

    chrome.storage.local.get(['subtitleFontSize', 'subtitleBgColor'], (res) => {
      if (res.subtitleFontSize) this.applySubtitleFontSize(res.subtitleFontSize);
      if (res.subtitleBgColor) this.applySubtitleBgColor(res.subtitleBgColor);
    });

    this.subtitleBox.style.display = 'none';
    this.shadowRoot.appendChild(this.subtitleBox);

    // Mini Hover Tooltip (Language Reactor Style)
    this.hoverTooltip = document.createElement('div');
    this.hoverTooltip.className = 'lectura-hover-tooltip';
    this.hoverTooltip.style.display = 'none';
    this.shadowRoot.appendChild(this.hoverTooltip);

    // Word Card Popup
    this.popupCard = document.createElement('div');
    this.popupCard.className = 'lectura-word-card';
    this.popupCard.style.display = 'none';
    this.shadowRoot.appendChild(this.popupCard);

    // Toast Container
    this.toastElement = document.createElement('div');
    this.toastElement.className = 'lectura-toast';
    this.shadowRoot.appendChild(this.toastElement);

    // Top-Right Unified Control & Transcript Pill (auto-hides with YouTube player controls)
    this.playerFloatingToggle = document.createElement('div');
    this.playerFloatingToggle.className = 'lectura-player-top-pill';
    this.playerFloatingToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      const action = btn?.dataset.action || 'transcript';
      if (action === 'prev') this.jumpToPreviousCue();
      else if (action === 'replay') this.replayCurrentCue();
      else if (action === 'next') this.jumpToNextCue();
      else if (action === 'autopause') this.toggleAutoPauseAfterSubtitle();
      else if (action === 'blur') this.cycleSubtitleBlurMode();
      else if (action === 'transcript') this.toggleTranscriptSidebar();
    });
    this.shadowRoot.appendChild(this.playerFloatingToggle);

    // Interactive Side Transcript Panel (Docked in YouTube's right column #secondary so it never covers the video)
    if (this.sidebarHost && this.sidebarHost.parentElement) {
      this.sidebarHost.remove();
    }
    this.sidebarHost = document.createElement('div');
    this.sidebarHost.id = 'lectura-yt-sidebar-host';
    this.sidebarShadowRoot = this.sidebarHost.attachShadow({ mode: 'open' });
    const sidebarStyleEl = document.createElement('style');
    sidebarStyleEl.textContent = this.getShadowStyles();
    this.sidebarShadowRoot.appendChild(sidebarStyleEl);

    this.transcriptPanel = document.createElement('div');
    this.transcriptPanel.className = 'lectura-transcript-sidebar';
    this.transcriptPanel.style.display = this.showTranscriptSidebar ? 'flex' : 'none';
    this.transcriptPanel.addEventListener('click', (e) => e.stopPropagation());
    this.transcriptPanel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.sidebarShadowRoot.appendChild(this.transcriptPanel);
    this.syncTranscriptPlacement();
    this.updateFloatingPillAndTranscript();

    // Multi-token Mouse Drag Selection on Subtitle Box
    this.subtitleBox.addEventListener('mousedown', (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.lectura-token, .lectura-word-token') as HTMLElement | null;
      if (!target) return;
      this.isSubMouseDown = true;
      this.hasDraggedMultiple = false;
      this.subDragStartIndex = parseInt(target.dataset.tokenIndex || '-1', 10);
    });

    this.subtitleBox.addEventListener('mouseover', (e: MouseEvent) => {
      if (!this.isSubMouseDown || this.subDragStartIndex === null || this.subDragStartIndex === -1) return;
      const target = (e.target as HTMLElement)?.closest?.('.lectura-token, .lectura-word-token') as HTMLElement | null;
      if (!target) return;
      const currentIdx = parseInt(target.dataset.tokenIndex || '-1', 10);
      if (currentIdx === -1) return;

      if (currentIdx !== this.subDragStartIndex) {
        this.hasDraggedMultiple = true;
        const allTokens = Array.from(this.subtitleBox?.querySelectorAll<HTMLElement>('.lectura-token, .lectura-word-token') || []);
        const minIdx = Math.min(this.subDragStartIndex, currentIdx);
        const maxIdx = Math.max(this.subDragStartIndex, currentIdx);

        allTokens.forEach((t) => {
          const idx = parseInt(t.dataset.tokenIndex || '-1', 10);
          if (idx >= minIdx && idx <= maxIdx) {
            t.classList.add('lectura-token--selected');
          } else {
            t.classList.remove('lectura-token--selected');
          }
        });
      }
    });

    this.playerContainer?.appendChild(this.overlayContainer);

    if (!this.hasGlobalOverlayListeners) {
      this.hasGlobalOverlayListeners = true;

      window.addEventListener('mouseup', (e: MouseEvent) => {
        if (!this.isSubMouseDown) return;
        this.isSubMouseDown = false;
        const dragStartIndex = this.subDragStartIndex;

        if (this.hasDraggedMultiple && dragStartIndex !== null) {
          const target = (e.target as HTMLElement)?.closest?.('.lectura-token, .lectura-word-token') as HTMLElement | null;
          const allTokens = Array.from(this.subtitleBox?.querySelectorAll<HTMLElement>('.lectura-token, .lectura-word-token') || []);
          const endIdx = target ? parseInt(target.dataset.tokenIndex || '-1', 10) : -1;
          const validEndIdx = endIdx !== -1 ? endIdx : dragStartIndex;
          const minIdx = Math.min(dragStartIndex, validEndIdx);
          const maxIdx = Math.max(dragStartIndex, validEndIdx);

          if (minIdx !== maxIdx) {
            if (this.settings?.pauseOnWordClick && this.videoElement && !this.videoElement.paused) {
              this.videoElement.pause();
            }
            this.selectedTokens = allTokens.filter((t) => {
              const idx = parseInt(t.dataset.tokenIndex || '-1', 10);
              return idx >= minIdx && idx <= maxIdx;
            });
            this.selectedTokens.forEach((t) => t.classList.add('lectura-token--selected'));
            const phraseText = this.selectedTokens.map((t) => t.textContent?.trim() || '').join(' ').trim();
            this.startTokenIndex = dragStartIndex;
            this.isPhraseSelecting = true;
            this.showWordCard(phraseText, this.currentSubtitleText, this.selectedTokens[0]);
          }
        }
        this.subDragStartIndex = null;
      });

      const ensureOverlayAnchor = () => {
        const player = (document.querySelector('#movie_player, .html5-video-player') as HTMLElement) || this.playerContainer;
        if (player && this.overlayContainer && !player.contains(this.overlayContainer)) {
          this.playerContainer = player;
          player.appendChild(this.overlayContainer);
        }
        this.syncTranscriptPlacement();
      };
      document.addEventListener('fullscreenchange', ensureOverlayAnchor);
      window.addEventListener('resize', ensureOverlayAnchor);
      document.addEventListener('yt-action', (ev: any) => {
        const actionName = ev?.detail?.actionName || '';
        if (!actionName || actionName.includes('theater') || actionName.includes('fullscreen') || actionName.includes('size')) {
          setTimeout(() => this.syncTranscriptPlacement(), 150);
        }
      });
    }
  }

  private applySizePreset(preset: 'sm' | 'md' | 'lg', showToast = true) {
    this.currentSizePreset = preset;
    if (this.subtitleBox) {
      this.subtitleBox.classList.remove('sub-size-sm', 'sub-size-md', 'sub-size-lg');
      this.subtitleBox.classList.add(`sub-size-${preset}`);
    }
    chrome.storage.local.set({ sub_size_preset: preset });
    if (showToast) {
      const labels: Record<string, string> = {
        sm: 'Size: S (16px)',
        md: 'Size: M (21px)',
        lg: 'Size: L (27px)',
      };
      this.showToast(labels[preset] || `Size: ${preset.toUpperCase()}`);
    }
  }

  private getShadowStyles(): string {
    return `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #ffffff;
        --lectura-sub-font-size: 22px;
        --lectura-sub-bg-color: rgba(0, 0, 0, 0.45);
      }
      /* ОБЫЧНЫЙ РЕЖИМ (В ОКНЕ) */
      #lectura-subtitles-overlay,
      .lectura-subtitles-container {
        position: absolute !important;
        bottom: 72px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: auto !important;
        max-width: 94% !important;
        z-index: 99999999 !important;
        pointer-events: none !important;
        display: flex !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        user-select: none !important;
        overflow: visible !important;
        transition: bottom 0.2s ease, top 0.2s ease, font-size 0.15s ease;
      }

      .lectura-sub-box,
      .lectura-subtitles-box {
        pointer-events: auto !important;
        width: fit-content !important;
        max-width: 100% !important;
        background: var(--lectura-sub-bg-color, rgba(0, 0, 0, 0.45)) !important;
        backdrop-filter: blur(5px) !important;
        -webkit-backdrop-filter: blur(5px) !important;
        border-radius: 6px !important;
        padding: 6px 16px !important;
        box-sizing: border-box !important;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35) !important;
        text-align: center !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      .lectura-sub-line,
      .lectura-sub-box,
      .lectura-subtitles-box,
      .lectura-subtitles-box p {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: var(--lectura-sub-current-font-size, var(--lectura-sub-font-size, 22px)) !important;
        font-weight: 700 !important;
        line-height: 1.45 !important;
        color: #ffffff !important;           /* СТРОГО БЕЛЫЙ ЦВЕТ ДЛЯ ПУНКТУАЦИИ И ТЕКСТА */
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        white-space: nowrap !important; /* Ровно 1 или 2 аккуратные строки, без сползания отдельных слов */
        text-align: center !important;
      }

      /* Знаки препинания снаружи и внутри токенов */
      .lectura-punct,
      .punct {
        color: #ffffff !important;
        text-decoration: none !important;
        white-space: nowrap !important;
        display: inline !important;
      }

      /* Цветные слова по статусам */
      .lectura-word-token,
      .lectura-token {
        display: inline !important;
        cursor: pointer !important;
        padding: 0 2px !important;
        margin: 0 1px !important;
        font-weight: 700 !important;
        border-radius: 3px !important;
        transition: background 0.12s ease, color 0.12s ease !important;
      }

      .lectura-word-token:hover,
      .lectura-token:hover {
        background: rgba(255, 255, 255, 0.25) !important;
      }

      /* Выделение нескольких слов (Shift + Click / Мышь для идиом и фразовых глаголов) */
      .lectura-word-token.lectura-token--selected,
      .lectura-token.lectura-token--selected {
        background: rgba(14, 165, 233, 0.45) !important;
        color: #ffffff !important;
        border-radius: 4px !important;
        outline: 2px solid #38bdf8 !important;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.6) !important;
      }

      /* ПОЛНОЭКРАННЫЙ РЕЖИМ (.ytp-fullscreen) */
      :host-context(.ytp-fullscreen) #lectura-subtitles-overlay,
      :host-context(.ytp-fullscreen) .lectura-subtitles-container,
      .ytp-fullscreen #lectura-subtitles-overlay,
      .ytp-fullscreen .lectura-subtitles-container {
        bottom: 96px !important;
        max-width: 90% !important;          /* Даем достаточно ширины, чтобы строчки не ломались */
        width: auto !important;
      }

      :host-context(.ytp-fullscreen) .lectura-sub-box,
      :host-context(.ytp-fullscreen) .lectura-subtitles-box,
      .ytp-fullscreen .lectura-sub-box,
      .ytp-fullscreen .lectura-subtitles-box {
        padding: 12px 30px !important;
      }

      :host-context(.ytp-fullscreen) .lectura-sub-line,
      :host-context(.ytp-fullscreen) .sub-line,
      .ytp-fullscreen .lectura-sub-line,
      .ytp-fullscreen .sub-line {
        /* В полноэкранном режиме увеличиваем шрифт пропорционально выбранному значению */
        font-size: var(--lectura-sub-current-font-size, calc(var(--lectura-sub-font-size, 22px) * 1.18)) !important;
        line-height: 1.45 !important;
        white-space: nowrap !important;
      }

      .punct {
        white-space: nowrap !important;
        display: inline !important;
      }

      /* Если включена вторая строка перевода */
      .lectura-subtitles-translation,
      .lectura-sub-translation {
        font-size: 16px !important;
        font-weight: 500 !important;
        color: #cbd5e1 !important;
        margin-top: 6px !important;
        line-height: 1.35 !important;
        text-align: center !important;
        white-space: normal !important;
        word-break: normal !important;
        user-select: none !important;
        transition: opacity 0.15s ease !important;
        display: block !important;
      }

      /* Пресет Small (для оконного режима / маленьких экранов) */
      .lectura-subtitles-container.sub-size-sm {
        min-width: 380px !important;
        max-width: 86% !important;
        bottom: 48px !important;
      }
      .lectura-subtitles-container.sub-size-sm .lectura-line {
        font-size: 16px !important;
        padding: 7px 16px !important;
        border-radius: 10px !important;
      }

      /* Пресет Medium (стандарт по умолчанию) */
      .lectura-subtitles-container.sub-size-md {
        min-width: 480px !important;
        max-width: 82% !important;
        bottom: 54px !important;
      }
      .lectura-subtitles-container.sub-size-md .lectura-line {
        font-size: 20px !important;
        padding: 10px 20px !important;
        border-radius: 12px !important;
      }

      /* Пресет Large (для Fullscreen / 2K / 4K мониторов) */
      .lectura-subtitles-container.sub-size-lg {
        min-width: 560px !important;
        max-width: 80% !important;
        bottom: 64px !important;
      }
      .lectura-subtitles-container.sub-size-lg .lectura-line {
        font-size: 26px !important;
        padding: 12px 26px !important;
        border-radius: 14px !important;
      }

      /* Убираем лишние внешние отступы у слов */
      .lectura-subtitles-container span {
        line-height: inherit;
      }

      .lectura-subtitles-container .punct {
        white-space: nowrap !important;
        display: inline !important;
      }

      /* Пресет позиции: Снизу (дефолт) */
      .lectura-subtitles-container.pos-bottom,
      .lectura-subtitles-container:not(.pos-top) {
        left: 50% !important;
        top: auto !important;
        right: auto !important;
        transform: translateX(-50%) !important;
      }

      /* Пресет позиции: Сверху */
      .lectura-subtitles-container.pos-top {
        left: 50% !important;
        top: 24px !important;
        bottom: auto !important;
        right: auto !important;
        transform: translateX(-50%) !important;
      }

      /* Dual Subtitles Translation Line */
      .lectura-sub-translation {
        color: #94a3b8;
        font-size: 0.78em;
        font-weight: 500;
        margin-top: 6px;
        line-height: 1.25;
        text-align: center;
        white-space: normal;
        word-break: normal;
        user-select: none;
        transition: opacity 0.15s ease;
      }

      /* ==========================================================
         ОБЩАЯ БАЗА ДЛЯ ВСЕХ ТОКЕНОВ СУБТИТРОВ
         ========================================================== */
      .lectura-token,
      .lectura-sub-word {
        display: inline-block !important;
        margin: 0 2px !important;
        cursor: pointer !important;
        border-radius: 4px !important;
        padding: 0 2px !important;
        transition: all 0.12s ease !important;
        font-weight: 600;
        background: transparent;
      }
      .lectura-token:hover,
      .lectura-sub-word:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        color: #38bdf8 !important;
      }

      /* ==========================================================
         РЕЖИМ 1: ЦВЕТНЫЕ СЛОВА (Colored Text)
         ========================================================== */
      .sub-mode--color .lectura-token,
      .sub-mode--color .lectura-word-token {
        text-decoration: none !important;
        border-bottom: none !important;
      }
      .sub-mode--color .lectura-token.status-new,
      .sub-mode--color .lectura-word-token.status-new,
      .lectura-token.status-new {
        color: #38bdf8 !important; /* Голубой / Новый (New) */
      }
      .sub-mode--color .lectura-token.status-1,
      .sub-mode--color .lectura-word-token.status-1,
      .lectura-token.status-1 {
        color: #fb7185 !important; /* Розовый (Stage 1) */
      }
      .sub-mode--color .lectura-token.status-2,
      .sub-mode--color .lectura-word-token.status-2,
      .lectura-token.status-2 {
        color: #facc15 !important; /* Желтый / Янтарный (Stage 2) */
      }
      .sub-mode--color .lectura-token.status-3,
      .sub-mode--color .lectura-token.status-learning,
      .sub-mode--color .lectura-word-token.status-3,
      .sub-mode--color .lectura-word-token.status-learning,
      .lectura-token.status-3,
      .lectura-token.status-learning {
        color: #34d399 !important; /* Зеленый / Изумрудный (Stage 3) */
      }
      .sub-mode--color .lectura-token.status-4,
      .sub-mode--color .lectura-word-token.status-4,
      .lectura-token.status-4 {
        color: #204bf4 !important; /* Насыщенный синий (Stage 4) */
      }
      .sub-mode--color .lectura-token.status-5,
      .sub-mode--color .lectura-word-token.status-5,
      .lectura-token.status-5 {
        color: #c084fc !important; /* Фиолетовый (Stage 5) */
      }
      .sub-mode--color .lectura-token.status-known,
      .sub-mode--color .lectura-word-token.status-known,
      .lectura-token.status-known,
      .sub-mode--color .lectura-token.status-ignored,
      .sub-mode--color .lectura-word-token.status-ignored,
      .lectura-token.status-ignored,
      .sub-mode--color .lectura-token.status-0,
      .sub-mode--color .lectura-word-token.status-0,
      .lectura-token.status-0 {
        color: #ffffff !important; /* Чистый белый без рамок и подсветок */
        background: transparent !important;
        border: none !important;
        text-decoration: none !important;
        opacity: 1 !important;
      }

      /* ==========================================================
         РЕЖИМ 2: ПОДЧЕРКИВАНИЕ СНИЗУ (Underline)
         Все буквы белые с тенью, статус кодируется линией Lectura
         ========================================================== */
      .sub-mode--underline .lectura-token,
      .sub-mode--underline .lectura-word-token,
      .highlight-style-underline .lectura-token,
      .highlight-style-underline .lectura-word-token {
        color: #ffffff !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.8) !important;
        text-decoration-skip-ink: none !important;
        -webkit-text-decoration-skip-ink: none !important;
        text-underline-offset: 4px !important;
        text-decoration-thickness: 2.5px !important;
      }
      .sub-mode--underline .lectura-token.status-new,
      .sub-mode--underline .lectura-word-token.status-new {
        text-decoration: underline !important;
        text-decoration-color: #38bdf8 !important; /* Голубая линия (Новый) */
      }
      .sub-mode--underline .lectura-token.status-1,
      .sub-mode--underline .lectura-word-token.status-1 {
        text-decoration: underline !important;
        text-decoration-color: #fb7185 !important; /* Розовая линия (1) */
      }
      .sub-mode--underline .lectura-token.status-2,
      .sub-mode--underline .lectura-word-token.status-2 {
        text-decoration: underline !important;
        text-decoration-color: #facc15 !important; /* Желтая линия (2) */
      }
      .sub-mode--underline .lectura-token.status-3,
      .sub-mode--underline .lectura-token.status-learning,
      .sub-mode--underline .lectura-word-token.status-3,
      .sub-mode--underline .lectura-word-token.status-learning {
        text-decoration: underline !important;
        text-decoration-color: #34d399 !important; /* Зеленая линия (3) */
      }
      .sub-mode--underline .lectura-token.status-4,
      .sub-mode--underline .lectura-word-token.status-4 {
        text-decoration: underline !important;
        text-decoration-color: #204bf4 !important; /* Насыщенная синяя линия (4) */
      }
      .sub-mode--underline .lectura-token.status-5,
      .sub-mode--underline .lectura-word-token.status-5 {
        text-decoration: underline !important;
        text-decoration-color: #c084fc !important; /* Фиолетовая линия (5) */
      }
      .sub-mode--underline .lectura-token.status-known,
      .sub-mode--underline .lectura-word-token.status-known,
      .sub-mode--underline .lectura-token.status-ignored,
      .sub-mode--underline .lectura-word-token.status-ignored,
      .sub-mode--underline .lectura-token.status-0,
      .sub-mode--underline .lectura-word-token.status-0 {
        text-decoration: none !important; /* Без подчеркивания (Known & Ignored) */
        color: #ffffff !important;
        background: transparent !important;
        border: none !important;
        opacity: 1 !important;
      }

      /* Нейтральный текст без токенизации (цифры, знаки валют, спецсимволы) */
      .lectura-sub-static {
        color: #ffffff !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.8) !important;
        cursor: default;
        user-select: text;
        display: inline-block;
        padding: 0 1px;
      }

      /* Mini Hover Tooltip (Language Reactor Style) */
      .lectura-hover-tooltip {
        position: fixed;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 140px;
        max-width: 220px;
        padding: 10px 14px 8px 14px;
        background: #0284c7; /* Плотный, контрастный синий цвет как в LR */
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
        z-index: 999999;
        pointer-events: none;
        user-select: none;
        text-align: center;
        gap: 2px;
        transition: opacity 0.12s ease-out, transform 0.12s ease-out;
        opacity: 0;
        transform: translateY(4px);
      }
      .lectura-hover-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-width: 6px;
        border-style: solid;
        border-color: #0284c7 transparent transparent transparent;
      }
      .lectura-hover-tooltip.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .lectura-hover-tooltip .translation-item {
        color: #ffffff;
        font-size: 15px; /* Увеличенный комфортный размер шрифта */
        font-weight: 600;
        line-height: 1.25;
        letter-spacing: 0.01em;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      /* Тонкая полоска статуса внизу карточки */
      .lectura-hover-tooltip .status-bar-track {
        width: 42px;
        height: 3px;
        background: rgba(0, 0, 0, 0.25);
        border-radius: 2px;
        margin-top: 6px;
        overflow: hidden;
      }
      .lectura-hover-tooltip .status-bar-fill {
        height: 100%;
        width: 100%;
        border-radius: 2px;
      }

      .lectura-popup-wrapper,
      #lectura-popup-root {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      .lectura-popup-container,
      .lectura-word-card,
      .lectura-popup {
        position: absolute;
        background: radial-gradient(
          120% 120% at 50% 0%, 
          rgba(30, 27, 75, 0.75) 0%, 
          rgba(15, 23, 42, 0.88) 100%
        );
        backdrop-filter: blur(24px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.14) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.28) !important;
        border-radius: 18px !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7) !important;
        color: #f8fafc !important;
        padding: 16px;
        width: 320px;
        pointer-events: auto !important;
        z-index: 2147483647 !important;
        animation: cardFadeIn 0.15s ease-out;
        overflow: visible !important;
        box-sizing: border-box;
      }
      .lectura-word-card.compact,
      .lectura-popup.compact {
        width: 320px !important;
        padding: 16px !important;
      }
      .lectura-word-card.extended,
      .lectura-popup.extended {
        width: 460px !important;
        max-width: 95vw !important;
        padding: 16px !important;
      }

      /* EXTENDED THEME SPECIFIC STYLES */
      .lectura-extended-container {
        display: flex;
        flex-direction: column;
      }
      .lectura-extended-tabs {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .lectura-tab-nav {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .lectura-tab-btn {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
      }
      .lectura-tab-btn:hover {
        color: #ffffff;
      }
      .lectura-tab-btn.active {
        color: #ffffff;
        border-bottom: 2px solid #38bdf8;
        text-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
      }
      .lectura-tab-pane {
        display: none;
      }
      .lectura-tab-pane.active {
        display: block;
        animation: cardFadeIn 0.15s ease-out;
      }

      /* Extended Header */
      .lectura-extended-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .lectura-word-title-group {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .lectura-extended-word {
        font-size: 26px;
        font-family: "Georgia", "Times New Roman", serif;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: -0.5px;
        line-height: 1.1;
        margin: 0;
      }
      .lectura-extended-ipa {
        font-size: 12px;
        color: #94a3b8;
        font-style: italic;
      }
      .lectura-extended-badges {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .lectura-dialect-pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        color: #e2e8f0;
        padding: 4px 10px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .lectura-dialect-pill:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: #38bdf8;
        color: #38bdf8;
      }

      /* Extended Context Block */
      .lectura-extended-context-block {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 10px 12px;
        margin-bottom: 12px;
      }
      .lectura-context-title {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        margin-bottom: 6px;
      }
      .lectura-context-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .lectura-context-text {
        font-size: 12.5px;
        line-height: 1.4;
        color: #cbd5e1;
      }
      .lectura-context-text b,
      .lectura-context-text .highlight-token {
        color: #38bdf8;
        font-weight: 700;
      }
      .lectura-status-badges-row {
        display: flex;
        gap: 5px;
        justify-content: flex-end;
        align-items: center;
        margin-top: 4px;
      }

      /* Extended Bottom Grid */
      .lectura-extended-bottom-grid {
        display: grid;
        grid-template-columns: 1fr 1.3fr;
        gap: 10px;
        margin-top: 4px;
      }
      .lectura-proficiency-card {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .lectura-proficiency-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }
      .lectura-rating-label {
        font-size: 12px;
        font-weight: 700;
        color: #e2e8f0;
      }
      .lectura-proficiency-slider {
        -webkit-appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 6px;
        background: linear-gradient(90deg, #f87171 0%, #fbbf24 30%, #34d399 70%, #10b981 100%);
        outline: none;
        cursor: pointer;
        margin: 6px 0;
      }
      .lectura-proficiency-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.8), 0 2px 4px rgba(0,0,0,0.5);
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .lectura-proficiency-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }
      .lectura-proficiency-sub {
        font-size: 10.5px;
        color: #64748b;
      }
      .lectura-extended-tools-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .lectura-extended-pane-inner {
        padding: 6px 0 12px 0;
        font-size: 12.5px;
        color: #cbd5e1;
        line-height: 1.4;
      }

      /* ============================================================ */
      /* THEME 3: GLASS V2 (Современный макет / Неон)                  */
      /* ============================================================ */
      .lectura-word-card.glass,
      .lectura-popup.glass,
      .theme-glass-v2 {
        width: 460px !important;
        max-width: 95vw !important;
        background: radial-gradient(130% 120% at 50% 0%, rgba(30, 27, 75, 0.8) 0%, rgba(13, 17, 28, 0.92) 100%) !important;
        backdrop-filter: blur(24px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.14) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.25) !important;
        border-radius: 18px !important;
        padding: 14px 18px !important;
        box-shadow: 0 25px 50px -10px rgba(0, 0, 0, 0.75) !important;
        color: #f8fafc !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }
      .glass-tabs-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 6px;
        margin-bottom: 12px;
      }
      .glass-tabs-list {
        display: flex;
        gap: 10px;
      }
      .glass-tab {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.45);
        font-size: 11px;
        cursor: pointer;
        padding: 2px 4px;
        border-bottom: 2px solid transparent;
        transition: all 0.15s ease;
      }
      .glass-tab:hover {
        color: #fff;
      }
      .glass-tab.active {
        color: #fff;
        border-bottom: 2px solid #fff;
        font-weight: 600;
      }
      .glass-tab-pane {
        display: none;
      }
      .glass-tab-pane.active {
        display: block;
        animation: cardFadeIn 0.15s ease-out;
      }
      .glass-tab[data-tab="ai"], .lectura-tab-btn[data-tab="ai"] {
        color: #38bdf8 !important;
      }
      .glass-tab[data-tab="ai"]:hover, .lectura-tab-btn[data-tab="ai"]:hover {
        color: #7dd3fc !important;
      }
      .glass-tab[data-tab="ai"].active, .lectura-tab-btn[data-tab="ai"].active {
        color: #38bdf8 !important;
        border-bottom-color: #38bdf8 !important;
        font-weight: 700;
      }
      .theme-calm-light .glass-tab[data-tab="ai"] {
        color: #0284c7 !important;
      }
      .theme-calm-light .glass-tab[data-tab="ai"]:hover {
        color: #0369a1 !important;
      }
      .theme-calm-light .glass-tab[data-tab="ai"].active {
        color: #0284c7 !important;
        border-bottom-color: #0284c7 !important;
        font-weight: 700;
      }
      .ai-explainer-card {
        padding: 12px 14px;
        border-radius: 12px;
      }
      .theme-glass-v2 .ai-explainer-card {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(56, 189, 248, 0.25);
        color: #f1f5f9;
      }
      .theme-calm-light .ai-explainer-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        color: #0f172a;
      }
      .ai-relation-text {
        font-size: 13px;
        line-height: 1.55;
        margin: 0 0 10px 0;
        white-space: pre-line;
      }
      .theme-glass-v2 .ai-relation-text {
        color: #e2e8f0;
      }
      .theme-calm-light .ai-relation-text {
        color: #1e293b;
      }
      .theme-glass-v2 .ai-explainer-header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
      }
      .theme-calm-light .ai-explainer-header {
        border-bottom: 1px solid rgba(226, 232, 240, 0.8) !important;
      }
      .theme-glass-v2 .ai-examples-container {
        border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
      }
      .theme-calm-light .ai-examples-container {
        border-top: 1px solid rgba(226, 232, 240, 0.8) !important;
      }
      .theme-glass-v2 .ai-grammar-badge {
        background: rgba(56, 189, 248, 0.15) !important;
        border: 1px solid rgba(56, 189, 248, 0.4) !important;
        color: #38bdf8 !important;
      }
      .glass-btn-close {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 50%;
        width: 24px;
        height: 24px;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        transition: all 0.15s ease;
      }
      .glass-btn-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.18);
      }
      .glass-word-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .glass-word-title {
        font-family: "Georgia", "Playfair Display", serif;
        font-size: 28px;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
        letter-spacing: -0.5px;
        line-height: 1.1;
      }
      .glass-word-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .glass-lang-tag {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 600;
        color: #e2e8f0;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .glass-lang-tag:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #38bdf8;
      }
      .glass-btn-sound {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        line-height: 1;
        padding: 2px 4px;
        transition: transform 0.15s ease;
      }
      .glass-btn-sound:hover {
        transform: scale(1.15);
      }
      .glass-translations-block {
        margin-bottom: 12px;
      }
      .glass-main-translation {
        font-size: 15.5px;
        font-weight: 600;
        color: #f1f5f9;
        line-height: 1.35;
      }
      .glass-sub-definition {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 3px;
        line-height: 1.35;
      }
      .glass-example-card-full {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 10px 14px;
        margin-bottom: 14px;
        width: 100%;
        box-sizing: border-box;
      }
      .glass-example-caption {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.5);
        display: block;
        margin-bottom: 4px;
      }
      .glass-example-phrase {
        margin: 0;
        font-size: 13px;
        line-height: 1.4;
        color: #e2e8f0;
      }
      .glass-example-phrase b,
      .glass-example-phrase .highlight,
      .glass-example-phrase .highlight-token {
        color: #38bdf8;
        font-weight: 700;
      }
      /* Единая интерактивная капсула статусов (Segmented Bar) */
      .status-capsule-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 22px;
        padding: 3px;
        box-sizing: border-box;
        gap: 2px;
      }

      /* Базовое нейтральное состояние для всех кнопок */
      .cap-btn {
        flex: 1;
        height: 30px;
        background: transparent;
        border: none;
        border-radius: 18px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 0;
        line-height: 1;
      }

      /* Индивидуальная подсветка при Hover и Active */

      /* 🚫 Игнор */
      .cap-btn.cap-ignore:hover,
      .cap-btn.cap-ignore.active {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
      }

      /* 1 - Hard */
      .cap-btn.cap-1:hover,
      .cap-btn.cap-1.active {
        background: rgba(248, 113, 113, 0.15);
        color: #f87171;
        box-shadow: 0 0 12px rgba(248, 113, 113, 0.3);
      }

      /* 2 - Remembering */
      .cap-btn.cap-2:hover,
      .cap-btn.cap-2.active {
        background: rgba(251, 191, 36, 0.15);
        color: #fbbf24;
        box-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
      }

      /* 3 - Intermediate */
      .cap-btn.cap-3:hover,
      .cap-btn.cap-3.active {
        background: rgba(52, 211, 153, 0.15);
        color: #34d399;
        box-shadow: 0 0 12px rgba(52, 211, 153, 0.3);
      }

      /* 4 - Advanced */
      .cap-btn.cap-4:hover,
      .cap-btn.cap-4.active {
        background: rgba(96, 165, 250, 0.15);
        color: #60a5fa;
        box-shadow: 0 0 12px rgba(96, 165, 250, 0.3);
      }

      /* 5 - Mastered */
      .cap-btn.cap-5:hover,
      .cap-btn.cap-5.active {
        background: rgba(167, 139, 250, 0.15);
        color: #a78bfa;
        box-shadow: 0 0 12px rgba(167, 139, 250, 0.3);
      }

      /* ✓ Уже знаю */
      .cap-btn.cap-known:hover,
      .cap-btn.cap-known.active {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
        box-shadow: 0 0 14px rgba(16, 185, 129, 0.35);
      }

      .glass-dict-grid {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      .glass-dict-grid .glass-dict-btn {
        flex: 1;
        text-align: center;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .glass-dict-grid .glass-dict-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.4);
      }

      .glass-actions-panel {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .glass-root-input-wrap {
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 4px 8px;
      }
      .glass-root-input {
        background: none;
        border: none;
        color: #fff;
        font-size: 12.5px;
        flex: 1;
        outline: none;
        padding: 4px;
      }
      .glass-link-btn {
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        padding: 5px 12px;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .glass-link-btn:hover {
        background: #1d4ed8;
      }
      .glass-dict-buttons {
        display: flex;
        gap: 6px;
      }
      .glass-dict-btn {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 4px 6px;
        font-size: 11px;
        color: #cbd5e1;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .glass-dict-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }

      /* ============================================================ */
      /* THEME 4: CALM LIGHT (Светлая тема / Пастель)                */
      /* ============================================================ */
      .lectura-word-card.calm_light,
      .lectura-word-card.theme-calm-light,
      .lectura-popup.theme-calm-light,
      .theme-calm-light {
        width: 440px !important;
        max-width: 95vw !important;
        background: rgba(248, 250, 252, 0.94) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgba(226, 232, 240, 0.9) !important;
        border-radius: 18px !important;
        padding: 14px 18px !important;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.12),
                    0 0 1px 1px rgba(0, 0, 0, 0.05) !important;
        color: #0f172a !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }

      /* Верхние табы */
      .theme-calm-light .glass-tabs-header {
        border-bottom: 1px solid rgba(226, 232, 240, 0.8) !important;
      }
      .theme-calm-light .glass-tab {
        color: #64748b !important;
      }
      .theme-calm-light .glass-tab:hover {
        color: #0f172a !important;
      }
      .theme-calm-light .glass-tab.active {
        color: #0f172a !important;
        border-bottom: 2px solid #0f172a !important;
        font-weight: 700 !important;
      }
      .theme-calm-light .glass-btn-close {
        color: #94a3b8 !important;
        background: rgba(0, 0, 0, 0.04) !important;
        border: 1px solid #e2e8f0 !important;
      }
      .theme-calm-light .glass-btn-close:hover {
        color: #0f172a !important;
        background: rgba(0, 0, 0, 0.08) !important;
      }

      /* Заголовок слова и бейджи */
      .theme-calm-light .glass-word-title {
        font-family: "Georgia", serif !important;
        font-size: 26px !important;
        font-weight: 800 !important;
        color: #09090b !important;
      }
      .theme-calm-light .glass-lang-tag {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        color: #334155 !important;
        font-weight: 600 !important;
      }
      .theme-calm-light .glass-lang-tag:hover {
        background: #f8fafc !important;
        color: #0284c7 !important;
      }
      .theme-calm-light .glass-btn-sound {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        padding: 3px 6px !important;
        cursor: pointer !important;
      }

      /* Перевод */
      .theme-calm-light .glass-main-translation {
        color: #1e293b !important;
        font-size: 16px !important;
        font-weight: 600 !important;
      }
      .theme-calm-light .glass-sub-definition {
        color: #64748b !important;
      }

      /* Блок примера использования */
      .theme-calm-light .glass-example-card-full {
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        padding: 10px 14px !important;
      }
      .theme-calm-light .glass-example-caption {
        color: #64748b !important;
        font-size: 11px !important;
        font-weight: 600 !important;
      }
      .theme-calm-light .glass-example-phrase {
        color: #1e293b !important;
        font-size: 13.5px !important;
      }
      .theme-calm-light .glass-example-phrase b,
      .theme-calm-light .glass-example-phrase .highlight,
      .theme-calm-light .glass-example-phrase .highlight-token,
      .theme-calm-light .glass-example-phrase .target-word {
        color: #0284c7 !important;
        font-weight: 700 !important;
      }

      /* Стили поля ввода корня (Root Tab) */
      .root-input-box {
        background-color: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        box-shadow: none !important;
      }
      .calm-root-field,
      #root-input-field,
      .lectura-lemma-input {
        background-color: #ffffff !important;
        color: #0f172a !important;
        outline: none !important;
        cursor: text !important;
      }
      .calm-root-field::placeholder,
      #root-input-field::placeholder,
      .lectura-lemma-input::placeholder {
        color: #94a3b8 !important;
        font-weight: 400 !important;
      }
      .calm-root-field:disabled,
      #root-input-field:disabled,
      .calm-root-field[readonly],
      #root-input-field[readonly] {
        background-color: #ffffff !important;
        color: #0f172a !important;
      }

      /* Нижняя панель статусов */
      .theme-calm-light .status-capsule-bar {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 24px !important;
        padding: 4px 6px !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
      }

      .theme-calm-light .cap-btn {
        color: #475569 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
      }

      .theme-calm-light .cap-btn:hover {
        background: #f1f5f9 !important;
        color: #0f172a !important;
      }

      /* Активный мягкий бейдж для каждого статуса */
      .theme-calm-light .cap-btn.cap-ignore:hover,
      .theme-calm-light .cap-btn.cap-ignore.active {
        background: #fee2e2 !important;
        color: #b91c1c !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      .theme-calm-light .cap-btn.cap-1:hover,
      .theme-calm-light .cap-btn.cap-1.active {
        background: #fee2e2 !important;
        color: #ef4444 !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      .theme-calm-light .cap-btn.cap-2:hover,
      .theme-calm-light .cap-btn.cap-2.active {
        background: #fef3c7 !important;
        color: #d97706 !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      .theme-calm-light .cap-btn.cap-3:hover,
      .theme-calm-light .cap-btn.cap-3.active {
        background: #dcfce7 !important; /* Мягкий пастельный зеленый */
        color: #15803d !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      .theme-calm-light .cap-btn.cap-4:hover,
      .theme-calm-light .cap-btn.cap-4.active {
        background: #e0f2fe !important;
        color: #0369a1 !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      .theme-calm-light .cap-btn.cap-5:hover,
      .theme-calm-light .cap-btn.cap-5.active {
        background: #f3e8ff !important;
        color: #7e22ce !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      .theme-calm-light .cap-btn.cap-known:hover,
      .theme-calm-light .cap-btn.cap-known.active {
        background: #d1fae5 !important;
        color: #047857 !important;
        border-radius: 18px !important;
        box-shadow: none !important;
        font-weight: 700 !important;
      }

      /* Дополнительные табы (Словари и Базовый корень) */
      .theme-calm-light .glass-dict-btn {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        color: #334155 !important;
      }
      .theme-calm-light .glass-dict-btn:hover {
        background: #f8fafc !important;
        color: #0284c7 !important;
        border-color: #0284c7 !important;
      }
      .theme-calm-light .glass-root-input-wrap {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
      }
      .theme-calm-light .glass-root-input {
        color: #0f172a !important;
      }
      .theme-calm-light .lectura-extended-pane-inner {
        color: #334155 !important;
      }
      .theme-calm-light .lectura-lemma-chip {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        color: #0284c7 !important;
      }

      @keyframes cardFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      .lectura-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .lectura-card-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .lectura-card-word {
        font-size: 18px;
        font-weight: 700;
        color: #38bdf8;
      }
      .lectura-card-tts {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        color: #f8fafc;
        font-size: 13px;
        cursor: pointer;
        padding: 3px 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        line-height: 1;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .lectura-card-tts:hover {
        background: #3b82f6;
        border-color: #60a5fa;
        color: #ffffff;
        transform: scale(1.08);
      }
      .lectura-card-dialect-badge {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #e2e8f0;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        padding: 3px 6px;
        display: inline-flex;
        align-items: center;
        transition: all 0.15s ease;
        line-height: 1;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .lectura-card-dialect-badge:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: #38bdf8;
        color: #38bdf8;
        transform: scale(1.06);
      }
      .lectura-card-ipa {
        font-size: 12px;
        color: #94a3b8;
        font-style: italic;
        margin-left: 2px;
      }
      .lectura-card-lemma {
        font-size: 11px;
        color: #64748b;
        margin-left: 2px;
      }
      .lectura-card-close {
        background: none;
        border: none;
        color: #64748b;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        transition: color 0.15s ease;
      }
      .lectura-card-close:hover { color: #f8fafc; }
      .lectura-card-translation {
        font-size: 15.5px !important;
        font-weight: 600 !important;
        color: #f8fafc !important;
        margin-bottom: 10px;
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        padding: 9px 12px;
        border-radius: 10px;
        min-height: 20px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .lectura-pos-line {
        margin-bottom: 5px;
        line-height: 1.35;
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      .lectura-pos-line:last-child {
        margin-bottom: 0;
      }
      .lectura-pos-tag {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        font-style: italic;
        background: transparent;
        padding: 0;
        margin: 0;
        flex-shrink: 0;
      }
      .lectura-pos-words {
        color: #f8fafc;
        font-size: 15.5px;
        font-weight: 600;
      }
      .lectura-def-line {
        font-size: 15.5px;
        font-weight: 600;
        color: #f8fafc;
        line-height: 1.4;
      }
      .lectura-card-context,
      .lectura-context-box {
        font-size: 12px;
        color: #94a3b8;
        margin-bottom: 8px;
        line-height: 1.35;
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-left: 3px solid #38bdf8 !important;
        border-radius: 10px !important;
        padding: 10px 12px !important;
      }
      .lectura-card-context b,
      .lectura-card-context .highlight-token {
        color: #38bdf8;
        font-weight: 700;
      }

      /* Tatoeba Examples Section (Language Reactor Style) */
      .lectura-card-tatoeba-section {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 8px 10px;
        margin-bottom: 10px;
      }
      .lectura-tatoeba-header {
        display: flex;
        align-items: center;
        margin-bottom: 6px;
      }
      .lectura-tatoeba-title {
        font-size: 10px;
        font-weight: 700;
        color: #34d399; /* Greenish accent as requested */
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .lectura-tatoeba-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .lectura-tatoeba-item {
        font-size: 12px;
        line-height: 1.35;
        border-left: 2px solid #10b981;
        padding-left: 8px;
      }
      .lectura-tatoeba-src {
        color: #e2e8f0;
      }
      .lectura-tatoeba-src .highlight-token,
      .lectura-tatoeba-src b {
        color: #38bdf8;
        font-weight: 700;
      }
      .lectura-tatoeba-tgt {
        color: #94a3b8;
        font-size: 11px;
        margin-top: 2px;
      }

      /* Quick Dictionary Links Bar */
      .lectura-card-dict-bar {
        display: flex;
        gap: 6px;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .lectura-input, 
      .lectura-dict-btn {
        flex: 1;
        text-align: center;
        background: rgba(255, 255, 255, 0.06) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        color: #f1f5f9 !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        font-size: 11px;
        font-weight: 600;
        padding: 5px 8px;
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s ease !important;
      }
      .lectura-dict-btn:hover {
        background: rgba(255, 255, 255, 0.12) !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
        transform: translateY(-1px);
      }

      /* Lemma / Parent Linking Section */
      .lectura-card-lemma-section {
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 10px !important;
        padding: 8px 10px;
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .lectura-lemma-input-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .lectura-lemma-icon {
        font-size: 13px;
        color: #94a3b8;
      }
      .lectura-lemma-input {
        flex: 1;
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 10px !important;
        color: #f1f5f9 !important;
        font-size: 12px;
        padding: 6px 10px;
        outline: none;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        transition: all 0.2s ease !important;
      }
      .lectura-lemma-input:focus {
        border-color: #38bdf8 !important;
        background: rgba(0, 0, 0, 0.5) !important;
      }
      .lectura-lemma-btn-link {
        background: #2563eb;
        border: none;
        border-radius: 8px;
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        padding: 6px 12px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .lectura-lemma-btn-link:hover {
        background: #1d4ed8;
        transform: translateY(-1px);
      }
      .lectura-lemma-chips,
      .lectura-lemma-suggestions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 11px;
      }
      .lectura-lemma-chip,
      .lectura-suggestion-chip {
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: 12px;
        color: #38bdf8;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .lectura-lemma-chip:hover,
      .lectura-suggestion-chip:hover {
        background: rgba(56, 189, 248, 0.25);
        border-color: #38bdf8;
        transform: scale(1.05);
      }
      .lectura-lemma-current-link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #34d399;
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.25);
        border-radius: 4px;
        padding: 3px 6px;
      }
      .lectura-parent-status-badge {
        font-size: 10px;
        font-weight: 700;
        color: #38bdf8;
      }

      /* Stylish Round Status Buttons (1-5, ignore, known) */
      .lectura-card-actions {
        display: flex;
        gap: 6px;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
      }
      .status-btn,
      .lectura-btn {
        width: 32px;
        height: 32px;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-weight: 600;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        padding: 0;
      }
      .status-btn:hover,
      .lectura-btn:hover {
        transform: scale(1.12);
        background: rgba(255, 255, 255, 0.12);
      }
      .status-btn.st-0, .lectura-btn-ignore { border-color: rgba(239, 68, 68, 0.4); color: #f87171; background: rgba(239, 68, 68, 0.08); }
      .status-btn.st-1, .lectura-btn-stage[data-status="1"] { border-color: #f87171; color: #f87171; }
      .status-btn.st-2, .lectura-btn-stage[data-status="2"] { border-color: #fbbf24; color: #fbbf24; }
      .status-btn.st-3, .lectura-btn-stage[data-status="3"] { border-color: #34d399; color: #34d399; }
      .status-btn.st-4, .lectura-btn-stage[data-status="4"] { border-color: #204bf4; color: #204bf4; }
      .status-btn.st-5, .lectura-btn-stage[data-status="5"] { border-color: #c084fc; color: #c084fc; }
      .status-btn.st-known, .lectura-btn-known { background: #059669; border-color: #10b981; color: white; }

      .status-btn.active, .lectura-btn.active {
        transform: scale(1.12);
        filter: brightness(1.2);
      }
      .status-btn.st-1.active, .lectura-btn-stage[data-status="1"].active { background: rgba(248, 113, 113, 0.25); box-shadow: 0 0 10px #f87171; }
      .status-btn.st-2.active, .lectura-btn-stage[data-status="2"].active { background: rgba(251, 191, 36, 0.25); box-shadow: 0 0 10px #fbbf24; }
      .status-btn.st-3.active, .lectura-btn-stage[data-status="3"].active { background: rgba(52, 211, 153, 0.25); box-shadow: 0 0 10px #34d399; }
      .status-btn.st-4.active, .lectura-btn-stage[data-status="4"].active { background: rgba(32, 75, 244, 0.25); box-shadow: 0 0 10px #204bf4; }
      .status-btn.st-5.active, .lectura-btn-stage[data-status="5"].active { background: rgba(192, 132, 252, 0.25); box-shadow: 0 0 10px #c084fc; }
      .status-btn.st-known.active, .lectura-btn-known.active { background: #059669; box-shadow: 0 0 12px #10b981; }
      .status-btn.st-0.active, .lectura-btn-ignore.active { background: rgba(239, 68, 68, 0.25); box-shadow: 0 0 10px #ef4444; }

      /* Toast (positioned neatly below the top-right control bar so it never overlaps buttons) */
      .lectura-toast {
        position: absolute;
        top: 52px;
        right: 16px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        z-index: 150;
      }
      .lectura-toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      .lectura-toast.toast-error {
        background: rgba(220, 38, 38, 0.92) !important;
        border-color: rgba(239, 68, 68, 0.6) !important;
      }
      .lectura-toast.toast-success {
        background: rgba(13, 148, 136, 0.92) !important;
        border-color: rgba(45, 212, 191, 0.4) !important;
      }

      /* ==========================================================
         BLUR MODE (Listening Practice — unblurs on hover)
         ========================================================== */
      .lectura-sub-box.blur-mode-translation .lectura-sub-translation {
        filter: blur(6px);
        opacity: 0.65;
        transition: filter 0.18s ease, opacity 0.18s ease;
      }
      .lectura-sub-box.blur-mode-translation:hover .lectura-sub-translation {
        filter: none;
        opacity: 1;
      }
      .lectura-sub-box.blur-mode-both .lectura-sub-line,
      .lectura-sub-box.blur-mode-both .lectura-sub-translation {
        filter: blur(7px);
        opacity: 0.7;
        transition: filter 0.18s ease, opacity 0.18s ease;
      }
      .lectura-sub-box.blur-mode-both:hover .lectura-sub-line,
      .lectura-sub-box.blur-mode-both:hover .lectura-sub-translation {
        filter: none;
        opacity: 1;
      }

      /* ==========================================================
         SUBTITLE HOVER MICRO-TOOLBAR
         ========================================================== */
      .lectura-sub-box {
        position: relative !important;
      }
      .lectura-sub-toolbar {
        position: absolute;
        top: -30px;
        right: 4px;
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 3px 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
        opacity: 0;
        pointer-events: none;
        transform: translateY(4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        z-index: 20;
      }
      .lectura-sub-box:hover .lectura-sub-toolbar {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .lectura-sub-tool-btn {
        background: transparent;
        border: none;
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 999px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        line-height: 1.2;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .lectura-sub-tool-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
      }
      .lectura-sub-tool-btn.active {
        background: rgba(56, 189, 248, 0.22);
        color: #38bdf8;
      }

      /* ==========================================================
         TOP-RIGHT UNIFIED PLAYER CONTROL & TRANSCRIPT BAR
         ========================================================== */
      .lectura-player-top-pill {
        position: absolute;
        top: 14px;
        right: 16px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 4px 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.86);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #f8fafc;
        font-size: 12px;
        font-weight: 700;
        pointer-events: auto;
        z-index: 120;
        opacity: 0.9;
        transition: opacity 0.22s ease, transform 0.18s ease, border-color 0.18s ease;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      }
      /* Auto-hide pill when YouTube player controls auto-hide so video is 100% clean */
      :host-context(.ytp-autohide) .lectura-player-top-pill {
        opacity: 0;
        pointer-events: none;
      }
      .lectura-player-top-pill:hover {
        opacity: 1;
        border-color: rgba(56, 189, 248, 0.55);
        background: rgba(15, 23, 42, 0.96);
      }
      .lectura-top-pill-divider {
        width: 1px;
        height: 14px;
        background: rgba(255, 255, 255, 0.16);
        margin: 0 2px;
      }
      .lectura-player-top-pill .comp-badge {
        color: #34d399;
        font-weight: 800;
        margin-left: 2px;
      }

      /* ==========================================================
         INTERACTIVE SIDE TRANSCRIPT PANEL (Docked Outside Video)
         Adaptive to YouTube Dark (#181818) & Light (#ffffff) Themes
         ========================================================== */
      .lectura-transcript-sidebar {
        position: relative;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        background: #181818;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.28);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        z-index: 130;
        overflow: hidden;
        color: #f1f1f1;
        transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      }
      .lectura-transcript-sidebar.theme-yt-light {
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.1);
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
        color: #0f172a;
      }
      .lectura-transcript-sidebar.docked-in-player {
        border-radius: 0;
        border-top: none;
        border-right: none;
        border-bottom: none;
        border-left: 1px solid rgba(255, 255, 255, 0.12);
      }
      .lectura-transcript-header {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #212121;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-header {
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }
      .lectura-transcript-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .lectura-transcript-title {
        font-size: 13px;
        font-weight: 700;
        color: #f1f1f1;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-title {
        color: #0f172a;
      }
      .lectura-transcript-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .lectura-transcript-ctrl-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #cbd5e1;
        border-radius: 6px;
        padding: 3px 7px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .lectura-transcript-ctrl-btn:hover {
        background: rgba(255, 255, 255, 0.16);
        color: #ffffff;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-ctrl-btn {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #475569;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-ctrl-btn:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .lectura-transcript-ctrl-btn.active {
        background: rgba(56, 189, 248, 0.2) !important;
        border-color: rgba(56, 189, 248, 0.5) !important;
        color: #38bdf8 !important;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-ctrl-btn.active {
        background: rgba(2, 132, 199, 0.12) !important;
        border-color: rgba(2, 132, 199, 0.4) !important;
        color: #0284c7 !important;
      }
      .lectura-transcript-search {
        width: 100%;
        box-sizing: border-box;
        background: #121212;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 6px 10px;
        color: #f1f1f1;
        font-size: 12px;
        outline: none;
        transition: border-color 0.15s ease;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-search {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #0f172a;
      }
      .lectura-transcript-search:focus {
        border-color: #38bdf8;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-search:focus {
        border-color: #0284c7;
      }
      .lectura-transcript-list {
        flex: 1;
        overflow-y: auto;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
      }
      .lectura-transcript-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.12s ease;
        border-left: 3px solid transparent;
      }
      .lectura-transcript-row:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-row:hover {
        background: #f1f5f9;
      }
      .lectura-transcript-row.active-cue {
        background: rgba(56, 189, 248, 0.14);
        border-left-color: #38bdf8;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-row.active-cue {
        background: rgba(2, 132, 199, 0.1);
        border-left-color: #0284c7;
      }
      .lectura-transcript-time {
        font-size: 11px;
        font-family: monospace;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        padding: 2px 5px;
        border-radius: 4px;
        flex-shrink: 0;
        margin-top: 1px;
        user-select: none;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-time {
        color: #0284c7;
        background: rgba(2, 132, 199, 0.1);
      }
      .lectura-transcript-text {
        font-size: 13px;
        line-height: 1.5;
        color: #e2e8f0;
        flex: 1;
        word-break: break-word;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-text {
        color: #334155;
      }
      .lectura-transcript-row.active-cue .lectura-transcript-text {
        color: #ffffff;
        font-weight: 500;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-row.active-cue .lectura-transcript-text {
        color: #0f172a;
        font-weight: 500;
      }
      .lectura-transcript-speaker {
        color: #38bdf8;
        font-weight: 700;
        margin-right: 3px;
        opacity: 0.85;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-speaker {
        color: #0284c7;
      }
      /* Interactive Word Tokens inside Transcript Sidebar */
      .lectura-transcript-word {
        cursor: pointer;
        border-radius: 3px;
        padding: 0 1px;
        transition: background-color 0.12s ease, color 0.12s ease;
        text-decoration-skip-ink: none;
        -webkit-text-decoration-skip-ink: none;
        text-underline-offset: 3px;
        text-decoration-thickness: 2px;
      }
      .lectura-transcript-word:hover,
      .lectura-transcript-word.lectura-token--selected {
        background: rgba(56, 189, 248, 0.22);
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-word:hover,
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-word.lectura-token--selected {
        background: rgba(2, 132, 199, 0.16);
      }
      /* Underline mode (default) in Transcript Sidebar */
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-new {
        text-decoration: underline;
        text-decoration-color: rgba(56, 189, 248, 0.75);
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--underline .lectura-transcript-word.status-new {
        text-decoration-color: rgba(2, 132, 199, 0.65);
      }
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-1 {
        text-decoration: underline;
        text-decoration-color: #fb7185;
      }
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-2 {
        text-decoration: underline;
        text-decoration-color: #facc15;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--underline .lectura-transcript-word.status-2 {
        text-decoration-color: #eab308;
      }
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-3,
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-learning {
        text-decoration: underline;
        text-decoration-color: #34d399;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--underline .lectura-transcript-word.status-3,
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--underline .lectura-transcript-word.status-learning {
        text-decoration-color: #10b981;
      }
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-4 {
        text-decoration: underline;
        text-decoration-color: #3b82f6;
      }
      .lectura-transcript-sidebar.sub-mode--underline .lectura-transcript-word.status-5 {
        text-decoration: underline;
        text-decoration-color: #c084fc;
      }
      /* Color mode in Transcript Sidebar */
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-new {
        color: #38bdf8;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-new {
        color: #0284c7;
      }
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-1 {
        color: #fb7185;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-1 {
        color: #e11d48;
      }
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-2 {
        color: #facc15;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-2 {
        color: #ca8a04;
      }
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-3,
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-learning {
        color: #34d399;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-3,
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-learning {
        color: #059669;
      }
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-4 {
        color: #60a5fa;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-4 {
        color: #2563eb;
      }
      .lectura-transcript-sidebar.sub-mode--color .lectura-transcript-word.status-5 {
        color: #c084fc;
      }
      .lectura-transcript-sidebar.theme-yt-light.sub-mode--color .lectura-transcript-word.status-5 {
        color: #9333ea;
      }
      /* Segmented Tab Bar in Transcript Header (Text vs Video Words) */
      .lectura-transcript-tabs {
        display: inline-flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 2px;
        gap: 2px;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-transcript-tabs {
        background: #e2e8f0;
        border-color: #cbd5e1;
      }
      .lectura-ttab-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 11.5px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-ttab-btn {
        color: #475569;
      }
      .lectura-ttab-btn:hover {
        color: #f1f5f9;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-ttab-btn:hover {
        color: #0f172a;
      }
      .lectura-ttab-btn.active {
        background: #38bdf8;
        color: #0f172a !important;
        font-weight: 700;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-ttab-btn.active {
        background: #ffffff;
        color: #0284c7 !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      /* Sub-filter pills for Video Words tab */
      .lectura-vword-filter-bar {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .lectura-vword-fbtn {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.09);
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 6px;
        border-radius: 6px;
        cursor: pointer;
        text-align: center;
        transition: all 0.12s ease;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-vword-fbtn {
        background: #ffffff;
        border-color: #e2e8f0;
        color: #64748b;
      }
      .lectura-vword-fbtn.active {
        background: rgba(56, 189, 248, 0.16);
        border-color: rgba(56, 189, 248, 0.45);
        color: #38bdf8;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-vword-fbtn.active {
        background: rgba(2, 132, 199, 0.1);
        border-color: rgba(2, 132, 199, 0.4);
        color: #0284c7;
      }
      /* Video Word Row */
      .lectura-vword-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        transition: background 0.12s ease;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-vword-row {
        border-bottom-color: #f1f5f9;
      }
      .lectura-vword-row:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-vword-row:hover {
        background: #f8fafc;
      }
      .lectura-vword-main {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        flex: 1;
      }
      .lectura-vword-info {
        display: flex;
        align-items: baseline;
        gap: 6px;
        min-width: 0;
        flex: 1;
        flex-wrap: wrap;
      }
      .lectura-vword-info .lectura-transcript-word {
        font-size: 13.5px;
        font-weight: 600;
      }
      .lectura-vword-count {
        font-size: 10.5px;
        color: #64748b;
        font-weight: 600;
      }
      .lectura-vword-trans {
        font-size: 12px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 135px;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-vword-trans {
        color: #64748b;
      }
      .lectura-vword-actions {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-shrink: 0;
      }
      .lectura-vword-act {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #cbd5e1;
        border-radius: 5px;
        width: 22px;
        height: 22px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.12s ease;
      }
      .lectura-transcript-sidebar.theme-yt-light .lectura-vword-act {
        background: #ffffff;
        border-color: #cbd5e1;
        color: #475569;
      }
      .lectura-vword-act.act-learn:hover,
      .lectura-vword-act.act-learn.active {
        background: rgba(251, 113, 133, 0.2);
        border-color: #fb7185;
        color: #fb7185;
      }
      .lectura-vword-act.act-known:hover {
        background: rgba(16, 185, 129, 0.22);
        border-color: #10b981;
        color: #10b981;
      }
      .lectura-vword-act.act-ignore:hover {
        background: rgba(148, 163, 184, 0.22);
        border-color: #94a3b8;
        color: #94a3b8;
      }
    `;
  }

  private videoSessionLanguage: string = '';

  /**
   * Injects lightweight network interceptor into the main YouTube page context
   * to catch /api/timedtext network requests and extract exact ISO language code ('es', 'fr', 'en', 'pt', etc.)
   */
  private setupTimedTextNetworkInterceptor() {
    // 1. Listen for custom events dispatched from the main page context
    window.addEventListener('LECTURA_TIMEDTEXT_LANG', (event: any) => {
      const lang = event?.detail?.lang;
      if (lang) {
        const clean = normalizeLangCode(lang);
        console.log('🎯 [Lectura] Active Subtitle Language detected from Network Event:', clean);
        if (clean && clean !== this.videoSessionLanguage) {
          (window as any).__LECTURA_ACTIVE_LANG__ = clean;
          (window as any).__LECTURA_YT_TRACK_LANG__ = clean;
          this.videoSessionLanguage = clean;
          this.currentDetectedLanguage = getLanguageDisplayName(clean);
          this.syncVocabulary(clean);
        }
      }
    });

    // 1b. Listen for pre-segmented TimedText full track payload from MAIN world
    window.addEventListener('LECTURA_TIMEDTEXT_DATA', (event: any) => {
      const { lang, text } = event?.detail || {};
      if (text && typeof text === 'string') {
        try {
          let sentences: CleanSentence[] = [];
          const trimmed = text.trim();
          if (trimmed.startsWith('{')) {
            const parsed = JSON.parse(trimmed);
            if (parsed && Array.isArray(parsed.events)) {
              sentences = parseJson3IntoCleanSentences(parsed.events);
            }
          } else if (trimmed.startsWith('<')) {
            sentences = parseXmlIntoCleanSentences(trimmed);
          }
          if (sentences.length > 0) {
            this.preparsedSentences = sentences;
            this.currentSentenceIndex = -1;
            this.autoPausedSentenceIndex = -1;
            console.log(`✅ [Lectura Subtitles] Loaded ${sentences.length} sentences from intercepted TimedText (${lang || 'active track'})`);
            this.updateFloatingPillAndTranscript();
            if (this.videoElement) {
              this.updateSubtitleOverlay(this.videoElement.currentTime);
            }
          }
        } catch (_) {}

        const blocks = parseTimedTextData(text);
        if (blocks.length > 0) {
          this.staticSubtitleBlocks = blocks;
        }
      }
    });

    // 1c. Listen for captionTracks metadata bridged from MAIN world player
    window.addEventListener('LECTURA_CAPTION_TRACKS', (event: any) => {
      const { videoId, tracks } = event?.detail || {};
      if (Array.isArray(tracks) && tracks.length > 0) {
        (window as any).__LECTURA_BRIDGED_TRACKS__ = { videoId, tracks };

        // Identify best language: user's target language if present, else the video's default/first track
        const target = normalizeLangCode(this.settings?.targetLanguage || '');
        const matched =
          tracks.find((t: any) => normalizeLangCode(t.languageCode) === target) ||
          tracks.find((t: any) => t.isDefault) ||
          tracks[0];

        if (matched && matched.languageCode) {
          const detectedLang = normalizeLangCode(matched.languageCode);
          if (detectedLang && detectedLang !== this.videoSessionLanguage) {
            console.log('🎯 [Lectura] Active Subtitle Language resolved from captionTracks:', detectedLang);
            (window as any).__LECTURA_ACTIVE_LANG__ = detectedLang;
            (window as any).__LECTURA_YT_TRACK_LANG__ = detectedLang;
            this.videoSessionLanguage = detectedLang;
            this.currentDetectedLanguage = getLanguageDisplayName(detectedLang);
            this.syncVocabulary(detectedLang);
          }
        }

        if (
          (!this.preparsedSentences || this.preparsedSentences.length === 0) &&
          this.currentVideoId &&
          !this.isLoadingSubtitles
        ) {
          this.loadFullVideoSubtitles(this.currentVideoId, this.videoSessionLanguage);
        }
      }
    });

    // 2. Observe Resource Timing entries directly in content script for timedtext URLs
    try {
      if (typeof window !== 'undefined' && window.PerformanceObserver) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name && entry.name.includes('/api/timedtext')) {
              try {
                const parsed = new URL(entry.name);
                const langParam = parsed.searchParams.get('lang') || parsed.searchParams.get('tlang');
                if (langParam) {
                  const clean = normalizeLangCode(langParam);
                  if (clean && clean !== this.videoSessionLanguage) {
                    console.log('🎯 [Lectura] Active Subtitle Language detected from PerformanceObserver:', clean);
                    (window as any).__LECTURA_ACTIVE_LANG__ = clean;
                    (window as any).__LECTURA_YT_TRACK_LANG__ = clean;
                    this.videoSessionLanguage = clean;
                    this.currentDetectedLanguage = getLanguageDisplayName(clean);
                    this.syncVocabulary(clean);
                  }
                }
                if (
                  this.currentVideoId &&
                  entry.name.includes(`v=${this.currentVideoId}`) &&
                  (!this.preparsedSentences || this.preparsedSentences.length === 0) &&
                  !this.isLoadingSubtitles
                ) {
                  this.loadFullVideoSubtitles(this.currentVideoId);
                }
              } catch (_) {}
            }
          }
        });
        observer.observe({ entryTypes: ['resource'] });
      }
    } catch (_) {}

    // 3. Inject lightweight fetch/XHR hook into page context
    try {
      const scriptId = 'lectura-network-interceptor';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.textContent = `
          (function() {
            function notifyTimedText(lang, url, text) {
              if (lang) {
                try {
                  window.dispatchEvent(new CustomEvent('LECTURA_TIMEDTEXT_LANG', { detail: { lang: lang } }));
                } catch (_) {}
              }
              if (text) {
                try {
                  window.dispatchEvent(new CustomEvent('LECTURA_TIMEDTEXT_DATA', { detail: { lang: lang, url: url, text: text } }));
                } catch (_) {}
              }
            }

            // Intercept fetch
            const origFetch = window.fetch;
            window.fetch = async function(...args) {
              const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
              const res = await origFetch.apply(this, args);
              if (url && typeof url === 'string' && url.includes('/api/timedtext')) {
                try {
                  const parsed = new URL(url, window.location.origin);
                  const lang = parsed.searchParams.get('lang') || parsed.searchParams.get('tlang');
                  const clone = res.clone();
                  clone.text().then(text => {
                    notifyTimedText(lang, url, text);
                  }).catch(() => notifyTimedText(lang, url, null));
                } catch (_) {}
              }
              return res;
            };

            // Intercept XMLHttpRequest
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              if (url && typeof url === 'string' && url.includes('/api/timedtext')) {
                try {
                  const parsed = new URL(url, window.location.origin);
                  const lang = parsed.searchParams.get('lang') || parsed.searchParams.get('tlang');
                  this.addEventListener('load', function() {
                    notifyTimedText(lang, url, this.responseText);
                  });
                } catch (_) {}
              }
              return origOpen.apply(this, arguments);
            };
            // Bridge captionTracks from MAIN world (movie_player.getPlayerResponse / ytInitialPlayerResponse)
            function bridgePlayerCaptionTracks(forceEnableCC) {
              try {
                const player = document.getElementById('movie_player');
                const pResp = (player && typeof player.getPlayerResponse === 'function' && player.getPlayerResponse()) || window.ytInitialPlayerResponse;
                const videoId = pResp && pResp.videoDetails && pResp.videoDetails.videoId;
                const tracks = pResp && pResp.captions && pResp.captions.playerCaptionsTracklistRenderer && pResp.captions.playerCaptionsTracklistRenderer.captionTracks;
                if (Array.isArray(tracks) && tracks.length > 0) {
                  window.dispatchEvent(new CustomEvent('LECTURA_CAPTION_TRACKS', {
                    detail: {
                      videoId: videoId || '',
                      tracks: tracks.map(t => ({
                        baseUrl: t.baseUrl,
                        languageCode: t.languageCode,
                        kind: t.kind
                      }))
                    }
                  }));
                }
                // Ensure YouTube's caption module is active so signed timedtext requests fire if needed
                if (forceEnableCC && player) {
                  if (typeof player.loadModule === 'function') {
                    player.loadModule('captions');
                  }
                  const ccBtn = document.querySelector('.ytp-subtitles-button');
                  if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
                    ccBtn.click();
                  }
                }
              } catch (_) {}
            }

            window.addEventListener('LECTURA_REQUEST_CAPTIONS', function(ev) {
              const forceCC = ev && ev.detail && ev.detail.forceEnableCC;
              bridgePlayerCaptionTracks(forceCC);
            });
            window.addEventListener('yt-navigate-finish', function() {
              setTimeout(function() { bridgePlayerCaptionTracks(false); }, 300);
            });
            setTimeout(function() { bridgePlayerCaptionTracks(false); }, 150);
          })();
        `;
        (document.head || document.documentElement).appendChild(script);
      } else {
        window.dispatchEvent(new CustomEvent('LECTURA_REQUEST_CAPTIONS', { detail: { forceEnableCC: false } }));
      }
    } catch (_) {}
  }

  /**
   * Single Source of Truth for YouTube video language session
   */
  private resolveVideoLanguage(): string {
    if ((window as any).__LECTURA_ACTIVE_LANG__) {
      const code = (window as any).__LECTURA_ACTIVE_LANG__;
      this.videoSessionLanguage = code;
      this.currentDetectedLanguage = getLanguageDisplayName(code);
      return code;
    }

    // 1. Bridged tracks from MAIN world
    try {
      const bridged = (window as any).__LECTURA_BRIDGED_TRACKS__;
      if (bridged && Array.isArray(bridged.tracks) && bridged.tracks.length > 0) {
        const target = normalizeLangCode(this.settings?.targetLanguage || '');
        const matched =
          bridged.tracks.find((t: any) => normalizeLangCode(t.languageCode) === target) ||
          bridged.tracks.find((t: any) => t.isDefault) ||
          bridged.tracks[0];
        if (matched?.languageCode) {
          const code = normalizeLangCode(matched.languageCode);
          (window as any).__LECTURA_ACTIVE_LANG__ = code;
          (window as any).__LECTURA_YT_TRACK_LANG__ = code;
          this.videoSessionLanguage = code;
          this.currentDetectedLanguage = getLanguageDisplayName(code);
          return code;
        }
      }
    } catch (_) {}

    // 2. Resource Timing entries check
    try {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      for (let i = entries.length - 1; i >= Math.max(0, entries.length - 15); i--) {
        const entry = entries[i];
        if (entry.name && entry.name.includes('/api/timedtext')) {
          const parsed = new URL(entry.name);
          const langParam = parsed.searchParams.get('lang') || parsed.searchParams.get('tlang');
          if (langParam) {
            const code = normalizeLangCode(langParam);
            (window as any).__LECTURA_ACTIVE_LANG__ = code;
            (window as any).__LECTURA_YT_TRACK_LANG__ = code;
            this.videoSessionLanguage = code;
            this.currentDetectedLanguage = getLanguageDisplayName(code);
            return code;
          }
        }
      }
    } catch (_) {}

    // 3. Scan document.scripts for captionTracks
    try {
      for (const s of Array.from(document.scripts)) {
        const text = s.textContent || '';
        if (!text.includes('captionTracks')) continue;
        const m = text.match(/"captionTracks":\s*(\[\{.*?\}\])/);
        if (m && m[1]) {
          const tracks = JSON.parse(m[1]);
          if (Array.isArray(tracks) && tracks.length > 0) {
            const target = normalizeLangCode(this.settings?.targetLanguage || '');
            const matched =
              tracks.find((t: any) => normalizeLangCode(t.languageCode) === target) ||
              tracks.find((t: any) => t.isDefault) ||
              tracks[0];
            if (matched?.languageCode) {
              const code = normalizeLangCode(matched.languageCode);
              (window as any).__LECTURA_ACTIVE_LANG__ = code;
              (window as any).__LECTURA_YT_TRACK_LANG__ = code;
              this.videoSessionLanguage = code;
              this.currentDetectedLanguage = getLanguageDisplayName(code);
              return code;
            }
          }
        }
      }
    } catch (_) {}

    // 4. Fallback to settings target language
    const fallback = normalizeLangCode(this.settings?.targetLanguage || 'en');
    this.videoSessionLanguage = fallback;
    this.currentDetectedLanguage = getLanguageDisplayName(fallback);
    return fallback;
  }

  private getEffectiveLang(): string {
    if ((window as any).__LECTURA_ACTIVE_LANG__) {
      return (window as any).__LECTURA_ACTIVE_LANG__;
    }
    if (this.videoSessionLanguage) {
      return this.videoSessionLanguage;
    }
    return this.resolveVideoLanguage();
  }

  private async syncVocabulary(specificLang?: string) {
    if (!this.settings) return;
    const lang = normalizeLangCode(specificLang || this.getEffectiveLang());
    try {
      const localCached = await StorageService.getCachedWords(lang);
      if (localCached && Object.keys(localCached).length > 0) {
        this.cachedWordsByLang[lang] = localCached;
      }
      const res = await this.apiClient.getWords(lang);
      if (res && res.map) {
        this.cachedWordsByLang[lang] = { ...(this.cachedWordsByLang[lang] || {}), ...res.map };
      }
      const links = await this.apiClient.getWordLinks(lang);
      if (links && typeof links === 'object') {
        this.cachedWordLinksByLang[lang] = { ...(this.cachedWordLinksByLang[lang] || {}), ...links };
      }
      if (this.currentSubtitleText) {
        this.renderSubtitleTokens(this.currentSubtitleText);
      }
      this.updateFloatingPillAndTranscript();
    } catch (_) {}
  }

  public async loadFullVideoSubtitles(videoId: string, targetLang?: string): Promise<boolean> {
    if (!videoId || this.isLoadingSubtitles) return false;
    this.isLoadingSubtitles = true;
    this.subtitleLoadAttempts++;
    this.lastSubtitleAttemptTime = Date.now();

    try {
      const lang = normalizeLangCode(targetLang || this.getEffectiveLang() || 'en');

      // Ask MAIN world bridge to publish captionTracks from movie_player
      try {
        window.dispatchEvent(new CustomEvent('LECTURA_REQUEST_CAPTIONS', { detail: { forceEnableCC: false } }));
      } catch (_) {}

      const findSignedTimedTextUrl = (): string | null => {
        try {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            if (entry.name && entry.name.includes('/api/timedtext') && entry.name.includes(`v=${videoId}`)) {
              return entry.name;
            }
          }
        } catch (_) {}
        return null;
      };

      const tryFetchAndParseTrackUrl = async (candidateUrl: string): Promise<boolean> => {
        try {
          const finalUrl = candidateUrl.includes('fmt=') ? candidateUrl : `${candidateUrl}&fmt=json3`;
          const res = await fetch(finalUrl);
          if (!res.ok) return false;
          const rawBody = await res.text();
          if (!rawBody || !rawBody.trim()) return false;

          const trimmed = rawBody.trim();
          let sentences: CleanSentence[] = [];
          if (trimmed.startsWith('{')) {
            const data = JSON.parse(trimmed);
            if (data && Array.isArray(data.events)) {
              sentences = parseJson3IntoCleanSentences(data.events);
            }
          } else if (trimmed.startsWith('<')) {
            sentences = parseXmlIntoCleanSentences(trimmed);
          }

          if (sentences.length > 0) {
            this.preparsedSentences = sentences;
            this.currentSentenceIndex = -1;
            this.autoPausedSentenceIndex = -1;
            console.log(`✅ [Lectura Subtitles] Pre-segmented ${sentences.length} clean strict sentences for ${lang}!`);
            this.updateFloatingPillAndTranscript();
            if (this.videoElement) {
              this.updateSubtitleOverlay(this.videoElement.currentTime);
            }
            return true;
          }
        } catch (err) {
          console.warn('⚠️ [Lectura Subtitles] Candidate track fetch failed:', err);
        }
        return false;
      };

      // 1. Priority 1: Signed /api/timedtext URL from performance ResourceTiming (includes YouTube POT token!)
      let signedUrl = findSignedTimedTextUrl();
      if (!signedUrl) {
        // Ensure YouTube's CC button is enabled directly from content script DOM or MAIN world
        try {
          window.dispatchEvent(new CustomEvent('LECTURA_REQUEST_CAPTIONS', { detail: { forceEnableCC: true } }));
          const ccBtn = document.querySelector<HTMLElement>('.ytp-subtitles-button');
          if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
            ccBtn.click();
          }
          await new Promise((r) => setTimeout(r, 450));
          signedUrl = findSignedTimedTextUrl();
        } catch (_) {}
      }

      if (signedUrl && (await tryFetchAndParseTrackUrl(signedUrl))) {
        return true;
      }

      // 2. Priority 2: Bridged / Player captionTracks URLs
      const candidateUrls: string[] = [];

      try {
        const bridged = (window as any).__LECTURA_BRIDGED_TRACKS__;
        if (bridged && Array.isArray(bridged.tracks) && bridged.tracks.length > 0 && (!bridged.videoId || bridged.videoId === videoId)) {
          const matchingTrack =
            bridged.tracks.find((t: any) => normalizeLangCode(t.languageCode) === lang) ||
            bridged.tracks.find((t: any) => t.isDefault) ||
            bridged.tracks[0];
          if (matchingTrack?.baseUrl) candidateUrls.push(matchingTrack.baseUrl);
        }
      } catch (_) {}

      try {
        for (const s of Array.from(document.scripts)) {
          const text = s.textContent || '';
          if (!text.includes('captionTracks')) continue;
          const m = text.match(/"captionTracks":\s*(\[\{.*?\}\])/);
          if (m && m[1]) {
            const tracks = JSON.parse(m[1]);
            if (Array.isArray(tracks) && tracks.length > 0) {
              const matchingTrack =
                tracks.find((t: any) => normalizeLangCode(t.languageCode) === lang) ||
                tracks.find((t: any) => t.isDefault) ||
                tracks[0];
              if (matchingTrack?.baseUrl) candidateUrls.push(matchingTrack.baseUrl);
            }
          }
        }
      } catch (_) {}

      for (const url of candidateUrls) {
        if (await tryFetchAndParseTrackUrl(url)) {
          return true;
        }
      }

      // 3. Priority 3: Fetch official subtitles via Lectura backend (/api/youtube-subtitles)
      // Guarantees subtitles work even when YouTube blocks browser-side timedtext fetches via POT/CSP
      try {
        let serverSub = await this.apiClient.fetchYoutubeSubtitles(videoId, lang).catch(() => null);
        if ((!serverSub || !serverSub.text || serverSub.isFallback) && lang !== 'en') {
          serverSub = await this.apiClient.fetchYoutubeSubtitles(videoId, 'English').catch(() => null);
        }

        if (serverSub && serverSub.text && !serverSub.isFallback) {
          const rawLines = serverSub.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const parsedFromServer: CleanSentence[] = [];
          for (let i = 0; i < rawLines.length; i++) {
            const m = rawLines[i].match(/^(\d+(?:\.\d+)?)s\t(.+)$/);
            if (m) {
              const startSec = parseFloat(m[1]);
              const textPart = m[2].trim();
              if (textPart) {
                parsedFromServer.push({
                  id: parsedFromServer.length,
                  start: startSec,
                  end: startSec + 5,
                  text: textPart,
                });
              }
            }
          }
          // Refine end times from next cue's start time
          for (let i = 0; i < parsedFromServer.length; i++) {
            if (i + 1 < parsedFromServer.length) {
              parsedFromServer[i].end = Math.max(
                parsedFromServer[i].start + 0.8,
                Math.min(parsedFromServer[i + 1].start, parsedFromServer[i].start + 8)
              );
            }
          }
          if (parsedFromServer.length > 0) {
            this.preparsedSentences = parsedFromServer;
            this.currentSentenceIndex = -1;
            this.autoPausedSentenceIndex = -1;
            console.log(`✅ [Lectura Subtitles] Loaded ${parsedFromServer.length} sentences via Lectura Server for ${lang}!`);
            this.updateFloatingPillAndTranscript();
            if (this.videoElement) {
              this.updateSubtitleOverlay(this.videoElement.currentTime);
            }
            return true;
          }
        }
      } catch (srvErr) {
        console.warn('⚠️ [Lectura Subtitles] Server subtitle fallback skipped:', srvErr);
      }

      // Fallback: ask MAIN world to activate YouTube's caption module once
      if ((!this.preparsedSentences || this.preparsedSentences.length === 0) && this.subtitleLoadAttempts <= 1) {
        try {
          window.dispatchEvent(new CustomEvent('LECTURA_REQUEST_CAPTIONS', { detail: { forceEnableCC: true } }));
        } catch (_) {}
      }

      return false;
    } finally {
      this.isLoadingSubtitles = false;
    }
  }

  private hideNativeCaptions() {
    const existingStyle = document.getElementById('lectura-hide-yt-captions');
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = 'lectura-hide-yt-captions';
      style.textContent = `
        .ytp-caption-window-bottom,
        .caption-window,
        .ytp-caption-segment,
        .caption-visual-line {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  private currentDetectedLanguage: string = 'Spanish';

  private static readonly ENGLISH_IRREGULARS: Record<string, string> = {
    am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    has: 'have', had: 'have', having: 'have',
    does: 'do', did: 'do', done: 'do', doing: 'do',
    went: 'go', gone: 'go', goes: 'go', going: 'go',
    see: 'see', saw: 'see', seen: 'see', seeing: 'see', sees: 'see',
    took: 'take', taken: 'take', taking: 'take', takes: 'take',
    gave: 'give', given: 'give', giving: 'give', gives: 'give',
    came: 'come', coming: 'come', comes: 'come',
    made: 'make', making: 'make', makes: 'make',
    said: 'say', saying: 'say', says: 'say',
    thought: 'think', thinking: 'think', thinks: 'think',
    got: 'get', gotten: 'get', getting: 'get', gets: 'get',
    knew: 'know', known: 'know', knowing: 'know', knows: 'know',
    told: 'tell', telling: 'tell', tells: 'tell',
    felt: 'feel', feeling: 'feel', feels: 'feel',
    found: 'find', finding: 'find', finds: 'find',
    left: 'leave', leaving: 'leave', leaves: 'leave',
    brought: 'bring', bringing: 'bring', brings: 'bring',
    bought: 'buy', buying: 'buy', buys: 'buy',
    caught: 'catch', catching: 'catch', catches: 'catch',
    taught: 'teach', teaching: 'teach', teaches: 'teach',
    began: 'begin', begun: 'begin', beginning: 'begin', begins: 'begin',
    spoke: 'speak', spoken: 'speak', speaking: 'speak', speaks: 'speak',
    wrote: 'write', written: 'write', writing: 'write', writes: 'write',
    drove: 'drive', driven: 'drive', driving: 'drive', drives: 'drive',
    ran: 'run', running: 'run', runs: 'run',
    broke: 'break', broken: 'break', breaking: 'break', breaks: 'break',
    chose: 'choose', chosen: 'choose', choosing: 'choose', chooses: 'choose',
    fell: 'fall', fallen: 'fall', falling: 'fall', falls: 'fall',
    flew: 'fly', flown: 'fly', flying: 'fly', flies: 'fly',
    forgot: 'forget', forgotten: 'forget', forgetting: 'forget', forgets: 'forget',
    froze: 'freeze', frozen: 'freeze', freezing: 'freeze', freezes: 'freeze',
    grew: 'grow', grown: 'grow', growing: 'grow', grows: 'grow',
    held: 'hold', holding: 'hold', holds: 'hold',
    hid: 'hide', hidden: 'hide', hiding: 'hide', hides: 'hide',
    lost: 'lose', losing: 'lose', loses: 'lose',
    met: 'meet', meeting: 'meet', meets: 'meet',
    paid: 'pay', paying: 'pay', pays: 'pay',
    rode: 'ride', ridden: 'ride', riding: 'ride', rides: 'ride',
    rose: 'rise', risen: 'rise', rising: 'rise', rises: 'rise',
    shook: 'shake', shaken: 'shake', shaking: 'shake', shakes: 'shake',
    shot: 'shoot', shooting: 'shoot', shoots: 'shoot',
    sang: 'sing', sung: 'sing', singing: 'sing', sings: 'sing',
    sat: 'sit', sitting: 'sit', sits: 'sit',
    slept: 'sleep', sleeping: 'sleep', sleeps: 'sleep',
    spent: 'spend', spending: 'spend', spends: 'spend',
    stood: 'stand', standing: 'stand', stands: 'stand',
    stole: 'steal', stolen: 'steal', stealing: 'steal', steals: 'steal',
    swam: 'swim', swum: 'swim', swimming: 'swim', swims: 'swim',
    threw: 'throw', thrown: 'throw', throwing: 'throw', throws: 'throw',
    understood: 'understand', understanding: 'understand', understands: 'understand',
    wore: 'wear', worn: 'wear', wearing: 'wear', wears: 'wear',
    won: 'win', winning: 'win', wins: 'win',
    woke: 'wake', woken: 'wake', waking: 'wake', wakes: 'wake',
    better: 'good', best: 'good',
    worse: 'bad', worst: 'bad',
    more: 'much', most: 'much',
    less: 'little', least: 'little',
    children: 'child',
    people: 'person',
    men: 'man',
    women: 'woman',
    teeth: 'tooth',
    feet: 'foot',
    mice: 'mouse',
  };

  private static readonly SPANISH_IRREGULARS: Record<string, string> = {
    he: 'haber', has: 'haber', ha: 'haber', hemos: 'haber', habéis: 'haber', han: 'haber',
    había: 'haber', habías: 'haber', habíamos: 'haber', habían: 'haber',
    hube: 'haber', hubo: 'haber', hubieron: 'haber',
    haya: 'haber', hayas: 'haber', hayamos: 'haber', hayan: 'haber', hay: 'haber',
    fui: 'ser', fue: 'ser', fueron: 'ser', era: 'ser', eras: 'ser', eran: 'ser', es: 'ser', son: 'ser', somos: 'ser',
    estoy: 'estar', estás: 'estar', está: 'estar', estamos: 'estar', están: 'estar', estuve: 'estar', estuvo: 'estar', estuvieron: 'estar',
    tengo: 'tener', tienes: 'tener', tiene: 'tener', tenemos: 'tener', tienen: 'tener', tuve: 'tener', tuvo: 'tener', tuvieron: 'tener',
    hago: 'hacer', haces: 'hacer', hace: 'hacer', hacemos: 'hacer', hacen: 'hacer', hice: 'hacer', hizo: 'hacer', hicieron: 'hacer',
    puedo: 'poder', puedes: 'poder', puede: 'poder', podemos: 'poder', pueden: 'poder', pude: 'poder', pudo: 'poder',
    digo: 'decir', dices: 'decir', dice: 'decir', decimos: 'decir', dicen: 'decir', dije: 'decir', dijo: 'decir',
    voy: 'ir', vas: 'ir', va: 'ir', vamos: 'ir', van: 'ir',
    veo: 'ver', ves: 'ver', ve: 'ver', vemos: 'ver', ven: 'ver', vi: 'ver', vio: 'ver',
    sé: 'saber', sabes: 'saber', sabe: 'saber', sabemos: 'saber', saben: 'saber', supe: 'saber', supo: 'saber',
    hablando: 'hablar', hablado: 'hablar',
    comiendo: 'comer', comido: 'comer',
    viviendo: 'vivir', vivido: 'vivir',
  };

  /**
   * Smart Lemma and word info lookup (strictly scoped to active language)
   */
  private lookupWordInfo(word: string): {
    status: string;
    translation?: string;
    ipa?: string;
    lemma?: string;
    isAutoIgnored?: boolean;
    ignoreCategory?: string;
    ignoreBadge?: string;
    ignoreIcon?: string;
    ignoreCategoryId?: string | null;
  } {
    const rawLower = cleanWordForTranslation(word);
    if (!rawLower) return { status: 'new' };
    const lower = normalizeApostrophes(rawLower);

    const lang = this.getEffectiveLang();
    const langLower = lang.toLowerCase();
    const cachedWords = this.cachedWordsByLang[lang] || {};
    const cachedLinks = this.cachedWordLinksByLang[lang] || {};

    const normalizeStatusValue = (raw: any): string => {
      if (raw === undefined || raw === null) return 'new';
      const s = String(raw).toLowerCase().trim();
      if (['ignored', 'ignore', '0'].includes(s)) return 'ignored';
      if (['known', 'known_completely', 'well_known', '5'].includes(s)) return 'known';
      if (['1', '2', '3', '4'].includes(s)) return s;
      if (s === 'hard') return '2';
      if (s === 'remembering') return '3';
      if (s === 'almost_known') return '4';
      if (s === 'learning') return '1';
      return s || 'new';
    };

    // 1. Check explicit user parent-child link first if parent has a saved status (e.g. offices -> office)
    const parentRoot = cachedLinks[lower] || cachedLinks[rawLower];
    if (parentRoot && parentRoot !== lower && cachedWords[parentRoot]) {
      const parentItem = cachedWords[parentRoot];
      const parentStatus = normalizeStatusValue(parentItem.status !== undefined && parentItem.status !== null ? parentItem.status : 'new');
      if (parentStatus !== 'new') {
        const ownTranslation = (cachedWords[lower] || cachedWords[rawLower])?.translation;
        return {
          ...parentItem,
          translation: ownTranslation || parentItem.translation,
          status: parentStatus,
          lemma: parentRoot,
        };
      }
    }

    // 2. Direct match in language dictionary (only if status is not a transient 'new' translation cache entry)
    if (cachedWords[lower] || cachedWords[rawLower]) {
      const item = cachedWords[lower] || cachedWords[rawLower];
      const rawStatus = item.status !== undefined && item.status !== null ? item.status : 'new';
      const normalizedStatus = normalizeStatusValue(rawStatus);
      if (normalizedStatus !== 'new') {
        return { ...item, status: normalizedStatus, lemma: parentRoot || lower };
      }
    }

    // 3. Contraction normalization (e.g. let's -> let, user's -> user, don't -> do, can't -> can)
    const base = normalizeContraction(lower, lang);
    if (base && base !== lower) {
      if (cachedWords[base]) {
        const item = cachedWords[base];
        const rawStatus = item.status !== undefined && item.status !== null ? item.status : 'new';
        const normalizedStatus = normalizeStatusValue(rawStatus);
        if (normalizedStatus !== 'new') {
          return { ...item, status: normalizedStatus, lemma: base };
        }
      }
      if (cachedLinks[base] && cachedWords[cachedLinks[base]]) {
        const item = cachedWords[cachedLinks[base]];
        const rawStatus = item.status !== undefined && item.status !== null ? item.status : 'new';
        const normalizedStatus = normalizeStatusValue(rawStatus);
        if (normalizedStatus !== 'new') {
          return { ...item, status: normalizedStatus, lemma: cachedLinks[base] };
        }
      }
    }

    if (parentRoot && parentRoot !== lower) {
      return { status: 'new', lemma: parentRoot };
    }

    // 4. Dictionary-based irregular lemma lookup
    let parentLemma = '';
    if (langLower.startsWith('en') && YouTubeLecturaOverlay.ENGLISH_IRREGULARS[lower]) {
      parentLemma = YouTubeLecturaOverlay.ENGLISH_IRREGULARS[lower];
    } else if (langLower.startsWith('es') && YouTubeLecturaOverlay.SPANISH_IRREGULARS[lower]) {
      parentLemma = YouTubeLecturaOverlay.SPANISH_IRREGULARS[lower];
    }

    if (!parentLemma && base && base !== lower) {
      if (langLower.startsWith('en') && YouTubeLecturaOverlay.ENGLISH_IRREGULARS[base]) {
        parentLemma = YouTubeLecturaOverlay.ENGLISH_IRREGULARS[base];
      }
    }

    if (parentLemma && parentLemma !== lower) {
      if (cachedWords[parentLemma]) {
        const item = cachedWords[parentLemma];
        const rawStatus = item.status !== undefined && item.status !== null ? item.status : 'new';
        const normalizedStatus = normalizeStatusValue(rawStatus);
        return { ...item, status: normalizedStatus, lemma: parentLemma };
      }
      return { status: 'new', lemma: parentLemma };
    }

    // 5. System Auto-Ignore lists (e.g. Hannah -> Cities & Names, Tech brands, Gaming, etc.)
    // Only applied if word was NOT explicitly added by user in vocabulary
    let autoRes = ignoreListManager.checkAutoIgnore(lower, undefined, lang);
    let matchedIgnored = lower;
    if (!autoRes.isIgnored && base && base !== lower) {
      autoRes = ignoreListManager.checkAutoIgnore(base, undefined, lang);
      matchedIgnored = base;
    }

    if (autoRes.isIgnored) {
      const badgeMeta = getLocalizedIgnoreBadge(autoRes, this.settings?.interfaceLanguage || 'en');
      return {
        status: 'ignored',
        isAutoIgnored: true,
        ignoreCategory: autoRes.categoryLabelEn,
        ignoreBadge: badgeMeta.label,
        ignoreIcon: badgeMeta.icon,
        ignoreCategoryId: autoRes.categoryId,
        lemma: matchedIgnored !== lower ? matchedIgnored : lower,
      };
    }

    return { status: 'new', lemma: base !== lower ? base : undefined };
  }

  /**
   * Generates morphological parent root lemma suggestions for a word
   */
  private getSuggestedLemmas(word: string, lang: string): string[] {
    if (!word) return [];
    const lower = normalizeApostrophes(word.trim().toLowerCase());
    if (lower.length <= 1) return [];

    const langCode = normalizeLangCode(lang);
    const cachedLinks = this.cachedWordLinksByLang[langCode] || {};
    const suggestions: string[] = [];

    // 1. Contraction base suggestion (e.g. let for let's)
    const base = normalizeContraction(lower, langCode);
    if (base && base !== lower) {
      suggestions.push(base);
    }

    if (cachedLinks[lower]) {
      suggestions.push(cachedLinks[lower]);
    }
    if (base && cachedLinks[base]) {
      suggestions.push(cachedLinks[base]);
    }

    if (langCode === 'en' && YouTubeLecturaOverlay.ENGLISH_IRREGULARS[lower]) {
      suggestions.push(YouTubeLecturaOverlay.ENGLISH_IRREGULARS[lower]);
    }
    if (langCode === 'en' && base && YouTubeLecturaOverlay.ENGLISH_IRREGULARS[base]) {
      suggestions.push(YouTubeLecturaOverlay.ENGLISH_IRREGULARS[base]);
    }

    if (langCode === 'es' && YouTubeLecturaOverlay.SPANISH_IRREGULARS[lower]) {
      suggestions.push(YouTubeLecturaOverlay.SPANISH_IRREGULARS[lower]);
    }

    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const s of suggestions) {
      const clean = s.trim().toLowerCase();
      if (clean && clean !== lower && !seen.has(clean)) {
        seen.add(clean);
        filtered.push(clean);
      }
    }
    return filtered.slice(0, 4);
  }

  private renderSubtitleTokens(text: string) {
    if (!this.subtitleBox) return;

    const cleanedText = removeInternalRepeats(text.replace(/\s*>>+\s*/g, ' ').trim());
    if (!cleanedText) {
      this.subtitleBox.innerHTML = '';
      this.subtitleBox.style.display = 'none';
      return;
    }

    this.subtitleBox.innerHTML = '';

    const words = cleanedText.split(/\s+/).filter(Boolean);
    const boxEl = document.createElement('div');
    boxEl.className = 'lectura-sub-box';

    let tokenIndexCounter = 0;

    const renderSingleSubWordToken = (tokPart: string, parentEl: HTMLElement) => {
      const isPurePunct = /^[^\p{L}\p{N}\s]+$/u.test(tokPart);
      if (isPurePunct) {
        if (parentEl.lastChild && parentEl.lastChild.nodeType === Node.TEXT_NODE && parentEl.lastChild.textContent === ' ') {
          parentEl.removeChild(parentEl.lastChild);
        }
        const punctSpan = document.createElement('span');
        punctSpan.className = 'punct';
        punctSpan.textContent = tokPart;
        parentEl.appendChild(punctSpan);
        return;
      }

      const match = tokPart.match(/^([\p{P}\s¿¡«"'(]*)([\p{L}\p{N}'-]+)([\p{P}\s?!.,:;"»')]*)$/u) ||
        tokPart.match(/^([^a-zA-ZÀ-ÿ0-9_'-]*)([a-zA-ZÀ-ÿ0-9_'-]+)([^a-zA-ZÀ-ÿ0-9_'-]*)$/);

      if (match) {
        const leadingPunct = match[1];
        const coreWord = match[2];
        const trailingPunct = match[3];

        if (leadingPunct) {
          const leadSpan = document.createElement('span');
          leadSpan.className = 'punct';
          leadSpan.textContent = leadingPunct;
          parentEl.appendChild(leadSpan);
        }

        const isEnglish = this.getEffectiveLang().toLowerCase().startsWith('en');
        if (!isWordToken(coreWord, isEnglish)) {
          const staticSpan = document.createElement('span');
          staticSpan.className = 'lectura-sub-static';
          staticSpan.textContent = coreWord;
          parentEl.appendChild(staticSpan);

          if (trailingPunct) {
            const trailSpan = document.createElement('span');
            trailSpan.className = 'punct';
            trailSpan.textContent = trailingPunct;
            parentEl.appendChild(trailSpan);
          }
          return;
        }

        const span = document.createElement('span');
        span.className = 'lectura-word-token lectura-token';
        span.textContent = coreWord;
        span.dataset.word = coreWord.toLowerCase();
        span.dataset.coreWord = coreWord;
        span.dataset.tokenIndex = String(tokenIndexCounter++);

        const wordInfo = this.lookupWordInfo(coreWord);
        span.classList.add(`status-${wordInfo.status}`);
        if (wordInfo.status === 'ignored' || wordInfo.status === '0') {
          span.classList.add('status-ignored', 'status-0');
        } else if (wordInfo.status === 'known') {
          span.classList.add('status-known');
        }

        span.addEventListener('mouseenter', () => {
          this.showHoverTooltip(span, coreWord);
        });

        span.addEventListener('mouseleave', () => {
          this.hideHoverTooltip();
        });

        span.addEventListener('click', (e) => {
          if (this.hasDraggedMultiple) {
            this.hasDraggedMultiple = false;
            return;
          }

          if (this.hoverTimeoutId) {
            window.clearTimeout(this.hoverTimeoutId);
            this.hoverTimeoutId = null;
          }
          this.hideHoverTooltip();
          e.stopPropagation();
          if (this.settings?.pauseOnWordClick && this.videoElement && !this.videoElement.paused) {
            this.videoElement.pause();
          }

          const allTokens = Array.from(this.subtitleBox?.querySelectorAll<HTMLElement>('.lectura-token, .lectura-word-token') || []);
          const clickedIdx = parseInt(span.dataset.tokenIndex || '0', 10);
          const isShift = Boolean(e.shiftKey || this.isShiftDown);

          if (isShift && this.startTokenIndex !== null && allTokens.length > 0) {
            const minIdx = Math.min(this.startTokenIndex, clickedIdx);
            const maxIdx = Math.max(this.startTokenIndex, clickedIdx);

            allTokens.forEach((t) => t.classList.remove('lectura-token--selected'));

            this.selectedTokens = allTokens.filter((t) => {
              const idx = parseInt(t.dataset.tokenIndex || '-1', 10);
              return idx >= minIdx && idx <= maxIdx;
            });
            this.selectedTokens.forEach((t) => t.classList.add('lectura-token--selected'));

            const phraseText = this.selectedTokens.map((t) => t.textContent?.trim() || '').join(' ').trim();
            this.isPhraseSelecting = true;
            this.showWordCard(phraseText, text, this.selectedTokens[0]);
          } else {
            allTokens.forEach((t) => t.classList.remove('lectura-token--selected'));
            span.classList.add('lectura-token--selected');
            this.selectedTokens = [span];
            this.startTokenIndex = clickedIdx;
            this.isPhraseSelecting = true;
            this.showWordCard(coreWord, text, span);
          }
        });

        parentEl.appendChild(span);

        if (trailingPunct) {
          const trailSpan = document.createElement('span');
          trailSpan.className = 'punct';
          trailSpan.textContent = trailingPunct;
          parentEl.appendChild(trailSpan);
        }
      } else {
        parentEl.appendChild(document.createTextNode(tokPart));
      }
    };

    const renderWordToken = (token: string, parentEl: HTMLElement, isLastInLine: boolean) => {
      // Split fused words and punctuation without spaces (e.g. Decir,"No, dije,“Momento, correctamente.”Y)
      const subTokens = token.match(/([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\p{L}\p{N}\s]+)/gu) || [token];
      for (const sub of subTokens) {
        renderSingleSubWordToken(sub, parentEl);
      }

      // Single space between words
      if (!isLastInLine) {
        parentEl.appendChild(document.createTextNode(' '));
      }
    };

    // Adaptive 1-line or balanced 2-line layout with auto-scaling font size
    const isFullscreen =
      document.fullscreenElement !== null ||
      this.playerContainer?.classList.contains('ytp-fullscreen') ||
      document.querySelector('.html5-video-player')?.classList.contains('ytp-fullscreen');

    const playerEl = (document.querySelector('#movie_player, .html5-video-player') as HTMLElement) || this.playerContainer;
    const playerWidth = playerEl?.clientWidth || window.innerWidth;
    const baseFontSize = this.settings?.subtitleFontSize || 22;
    const targetFontSize = isFullscreen ? baseFontSize * 1.18 : baseFontSize;

    // Single line for short phrases, balanced 2 lines for standard/longer text
    const totalChars = words.reduce((acc, w) => acc + w.length, 0) + (words.length - 1);
    let line1Words: string[] = [];
    let line2Words: string[] = [];

    if (words.length <= 4 || totalChars <= 38) {
      line1Words = words;
    } else {
      // Balance into exactly 2 lines by character count so both lines look even
      const targetHalf = totalChars / 2;
      let currentChars = 0;
      let bestSplitIndex = 1;
      let minDiff = Infinity;

      for (let i = 0; i < words.length - 1; i++) {
        currentChars += words[i].length + (i > 0 ? 1 : 0);
        const diff = Math.abs(currentChars - targetHalf);
        if (diff < minDiff) {
          minDiff = diff;
          bestSplitIndex = i + 1;
        }
      }
      line1Words = words.slice(0, bestSplitIndex);
      line2Words = words.slice(bestSplitIndex);
    }

    const line1Chars = line1Words.reduce((acc, w) => acc + w.length, 0) + Math.max(0, line1Words.length - 1);
    const line2Chars = line2Words.reduce((acc, w) => acc + w.length, 0) + Math.max(0, line2Words.length - 1);
    const maxLineChars = Math.max(line1Chars, line2Chars);

    // Available width for subtitle box inside player (with 92% width and box padding)
    const availableWidth = Math.max(280, playerWidth * (isFullscreen ? 0.90 : 0.92) - 36);

    // Approximate char width is ~0.56 of font size in bold sans-serif
    const neededWidth = maxLineChars * (targetFontSize * 0.56);
    let effectiveFontSize = targetFontSize;
    if (neededWidth > availableWidth && maxLineChars > 0) {
      const scaledSize = Math.floor(availableWidth / (maxLineChars * 0.56));
      // Clamp between min readable 14px and targetFontSize
      effectiveFontSize = Math.max(14, Math.min(targetFontSize, scaledSize));
    }

    boxEl.style.setProperty('--lectura-sub-current-font-size', `${effectiveFontSize}px`);

    if (this.subtitleBlurMode === 'translation') {
      boxEl.classList.add('blur-mode-translation');
    } else if (this.subtitleBlurMode === 'both') {
      boxEl.classList.add('blur-mode-both');
    }

    const line1Div = document.createElement('div');
    line1Div.className = 'lectura-sub-line';
    for (let i = 0; i < line1Words.length; i++) {
      renderWordToken(line1Words[i], line1Div, i === line1Words.length - 1);
    }
    boxEl.appendChild(line1Div);

    if (line2Words.length > 0) {
      const line2Div = document.createElement('div');
      line2Div.className = 'lectura-sub-line';
      for (let i = 0; i < line2Words.length; i++) {
        renderWordToken(line2Words[i], line2Div, i === line2Words.length - 1);
      }
      boxEl.appendChild(line2Div);
    }

    // Dual Subtitles translation line
    const transDiv = document.createElement('div');
    transDiv.className = 'lectura-sub-translation';
    transDiv.style.display = this.enableDualSubtitles ? 'block' : 'none';
    boxEl.appendChild(transDiv);

    if (this.enableDualSubtitles) {
      this.fetchFullSentenceTranslation(text).then((trans) => {
        if (trans && this.currentSubtitleText === text && transDiv.parentElement) {
          transDiv.textContent = trans;
        }
      });
    }

    this.subtitleBox.appendChild(boxEl);
    this.subtitleBox.style.display = 'flex';
  }

  private static fullSentenceCache = new Map<string, string>();

  /**
   * Fetches full sentence translation for Dual Subtitles mode
   */
  private async fetchFullSentenceTranslation(text: string): Promise<string> {
    const clean = text.trim();
    if (!clean) return '';
    const sIso = normalizeLangCode(this.getEffectiveLang());
    const nativeLang = (this.settings?.nativeLanguage || 'ru').slice(0, 2).toLowerCase();
    const cacheKey = `${sIso}:${clean}`;
    if (YouTubeLecturaOverlay.fullSentenceCache.has(cacheKey)) {
      return YouTubeLecturaOverlay.fullSentenceCache.get(cacheKey)!;
    }
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sIso}&tl=${encodeURIComponent(nativeLang)}&dt=t&q=${encodeURIComponent(clean)}`;
      const response = await fetch(url);
      if (!response.ok) return '';
      const data = await response.json();
      if (data && data[0] && Array.isArray(data[0])) {
        const translated = data[0].map((item: any) => item[0]).filter(Boolean).join(' ').trim();
        if (translated) {
          YouTubeLecturaOverlay.fullSentenceCache.set(cacheKey, translated);
          return translated;
        }
      }
    } catch (_) {}
    return '';
  }

  /**
   * Toggles visibility of Dual Subtitles (second translation line)
   */
  private toggleDualSubtitles() {
    this.enableDualSubtitles = !this.enableDualSubtitles;
    chrome.storage.local.set({ dual_subs: this.enableDualSubtitles });
    const transEl = this.subtitleBox?.querySelector<HTMLElement>('.lectura-sub-translation');
    if (transEl) {
      transEl.style.display = this.enableDualSubtitles ? 'block' : 'none';
      if (this.enableDualSubtitles && !transEl.textContent && this.currentSubtitleText) {
        this.fetchFullSentenceTranslation(this.currentSubtitleText).then((trans) => {
          if (trans && transEl.parentElement) transEl.textContent = trans;
        });
      }
    }
    this.showToast(`Dual Subtitles: ${this.enableDualSubtitles ? 'ON' : 'OFF'}`);
  }

  /**
   * Toggles Auto-Pause at the end of each subtitle sentence [Q]
   */
  private toggleAutoPauseAfterSubtitle() {
    this.autoPauseAfterSubtitle = !this.autoPauseAfterSubtitle;
    this.autoPausedSentenceIndex = -1;
    if (this.settings) this.settings.autoPauseAfterSubtitle = this.autoPauseAfterSubtitle;
    chrome.storage.local.set({ autoPauseAfterSubtitle: this.autoPauseAfterSubtitle });
    const uiLang = this.settings?.interfaceLanguage || 'en';
    this.showToast(t(this.autoPauseAfterSubtitle ? 'auto_pause_on' : 'auto_pause_off', uiLang));
    this.updateFloatingPillAndTranscript();
    if (this.currentSubtitleText) {
      this.renderSubtitleTokens(this.currentSubtitleText);
    }
  }

  /**
   * Cycles Blur Mode for listening practice: off -> translation -> both -> off [H]
   */
  private cycleSubtitleBlurMode() {
    const order: Array<'off' | 'translation' | 'both'> = ['off', 'translation', 'both'];
    const idx = order.indexOf(this.subtitleBlurMode);
    this.subtitleBlurMode = order[(idx + 1) % order.length];
    if (this.settings) this.settings.subtitleBlurMode = this.subtitleBlurMode;
    chrome.storage.local.set({ subtitleBlurMode: this.subtitleBlurMode });
    const uiLang = this.settings?.interfaceLanguage || 'en';
    const keyMap: Record<'off' | 'translation' | 'both', string> = {
      off: 'blur_mode_off',
      translation: 'blur_mode_trans',
      both: 'blur_mode_both',
    };
    this.showToast(t(keyMap[this.subtitleBlurMode], uiLang));
    this.updateFloatingPillAndTranscript();
    if (this.currentSubtitleText) {
      this.renderSubtitleTokens(this.currentSubtitleText);
    }
  }

  /**
   * Toggles the Interactive Side Transcript Panel [T]
   */
  private toggleTranscriptSidebar() {
    this.showTranscriptSidebar = !this.showTranscriptSidebar;
    if (this.settings) this.settings.showTranscriptSidebar = this.showTranscriptSidebar;
    chrome.storage.local.set({ showTranscriptSidebar: this.showTranscriptSidebar });
    if (this.transcriptPanel) {
      this.transcriptPanel.style.display = this.showTranscriptSidebar ? 'flex' : 'none';
    }
    this.syncTranscriptPlacement();
    this.updateFloatingPillAndTranscript();
    if (this.showTranscriptSidebar) {
      this.highlightActiveTranscriptCue(this.currentSentenceIndex);
    }
  }

  /**
   * Docks the Transcript Sidebar into YouTube's right column (#secondary-inner / #secondary) in standard view,
   * or docks it beside the video in Theater / Fullscreen mode by shrinking the video container width so it NEVER covers the video.
   */
  private syncTranscriptPlacement(retries = 0) {
    if (!this.sidebarHost || !this.transcriptPanel) return;

    const player = (document.querySelector('#movie_player, .html5-video-player') as HTMLElement) || this.playerContainer;

    // Ensure global CSS rule for side-by-side layout in Theater/Fullscreen modes
    if (!document.getElementById('lectura-dock-layout-style') && document.head) {
      const dockStyle = document.createElement('style');
      dockStyle.id = 'lectura-dock-layout-style';
      dockStyle.textContent = `
        #movie_player.lectura-with-docked-sidebar .html5-video-container {
          width: calc(100% - 350px) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 100% !important;
        }
        #movie_player.lectura-with-docked-sidebar video.html5-main-video {
          width: 100% !important;
          height: 100% !important;
          left: 0 !important;
          top: 0 !important;
          object-fit: contain !important;
        }
        #movie_player.lectura-with-docked-sidebar .ytp-chrome-bottom {
          width: calc(100% - 374px) !important;
          left: 12px !important;
        }
        #movie_player.lectura-with-docked-sidebar #lectura-yt-shadow-host {
          width: calc(100% - 350px) !important;
        }
      `;
      document.head.appendChild(dockStyle);
    }

    if (!this.showTranscriptSidebar || this.settings?.isEnabled === false || this.settings?.enableYoutubeOverlay === false) {
      this.sidebarHost.style.display = 'none';
      this.transcriptPanel.style.display = 'none';
      player?.classList.remove('lectura-with-docked-sidebar');
      return;
    }

    this.transcriptPanel.style.display = 'flex';

    const isFullscreen = !!document.fullscreenElement || !!player?.classList.contains('ytp-fullscreen');
    const isTheater = !!document.querySelector('ytd-watch-flexy[theater]');

    if (isFullscreen || isTheater) {
      // Only in Fullscreen or Theater mode: dock on right edge of player & shrink video container to left
      if (player) {
        player.classList.add('lectura-with-docked-sidebar');
        this.transcriptPanel.classList.add('docked-in-player');
        if (this.sidebarHost.parentElement !== player) {
          player.appendChild(this.sidebarHost);
        }
        this.sidebarHost.style.cssText = `
          display: block;
          position: absolute;
          top: 0;
          right: 0;
          width: 350px;
          height: 100%;
          z-index: 1001;
        `;
      }
      return;
    }

    // Standard windowed mode: NEVER shrink #movie_player; dock strictly inside YouTube's right column (#secondary)
    player?.classList.remove('lectura-with-docked-sidebar');
    this.transcriptPanel.classList.remove('docked-in-player');

    const secondaryTarget = (
      document.querySelector('ytd-watch-flexy #secondary #secondary-inner') ||
      document.querySelector('ytd-watch-flexy #secondary') ||
      document.querySelector('#secondary-inner') ||
      document.querySelector('#secondary')
    ) as HTMLElement | null;

    const playerRect = player?.getBoundingClientRect();
    const secondaryRect = secondaryTarget?.getBoundingClientRect();

    if (secondaryTarget && secondaryRect && secondaryRect.width >= 200) {
      if (secondaryTarget.firstElementChild !== this.sidebarHost) {
        secondaryTarget.prepend(this.sidebarHost);
      }
      const panelHeight = Math.max(400, Math.min(680, Math.round(playerRect?.height || 500)));
      this.sidebarHost.style.cssText = `
        display: block;
        position: relative;
        width: 100%;
        height: ${panelHeight}px;
        margin-bottom: 16px;
        z-index: 10;
      `;
    } else {
      // YouTube's #secondary column is still hydrating (skeleton phase on initial load) — wait until ready (bounded retries)
      this.sidebarHost.style.display = 'none';
      if (retries < 10) {
        window.setTimeout(() => this.syncTranscriptPlacement(retries + 1), 350);
      }
    }
  }

  private formatCueTimestamp(sec: number): string {
    const total = Math.max(0, Math.floor(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Calculates video vocabulary comprehension percentage (% of known/ignored words vs new/learning)
   */
  private computeVideoComprehension(): { knownPct: number; newCount: number; learningCount: number } {
    if (!this.preparsedSentences || this.preparsedSentences.length === 0) {
      return { knownPct: 100, newCount: 0, learningCount: 0 };
    }
    const uniqueWords = new Set<string>();
    const isEn = this.getEffectiveLang().toLowerCase().startsWith('en');
    for (const s of this.preparsedSentences) {
      const tokens = s.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
      for (const tok of tokens) {
        if (isWordToken(tok, isEn)) {
          uniqueWords.add(tok.toLowerCase());
        }
      }
    }
    if (uniqueWords.size === 0) {
      return { knownPct: 100, newCount: 0, learningCount: 0 };
    }
    let knownOrIgnored = 0;
    let newCount = 0;
    let learningCount = 0;
    for (const w of uniqueWords) {
      const info = this.lookupWordInfo(w);
      if (info.status === 'known' || info.status === 'ignored' || info.status === '0' || info.status === '5') {
        knownOrIgnored++;
      } else if (['1', '2', '3', '4', 'learning'].includes(info.status)) {
        learningCount++;
      } else {
        newCount++;
      }
    }
    const knownPct = Math.round((knownOrIgnored / uniqueWords.size) * 100);
    return { knownPct, newCount, learningCount };
  }

  private updateFloatingPillAndTranscript() {
    if (this.playerFloatingToggle) {
      const uiLang = this.settings?.interfaceLanguage || 'en';
      const hasSubs = this.preparsedSentences && this.preparsedSentences.length > 0;
      const comp = hasSubs ? this.computeVideoComprehension() : null;
      const compHtml = comp
        ? `<span class="comp-badge" title="${t('comprehension_label', uiLang)}: ${comp.knownPct}% (${comp.newCount} new, ${comp.learningCount} learning)">${comp.knownPct}%</span>`
        : '';

      this.playerFloatingToggle.innerHTML = `
        <button type="button" class="lectura-sub-tool-btn" data-action="prev" title="${t('prev_cue', uiLang)} [A]">⏮</button>
        <button type="button" class="lectura-sub-tool-btn" data-action="replay" title="${t('replaying_cue', uiLang)} [S]">🔁</button>
        <button type="button" class="lectura-sub-tool-btn" data-action="next" title="${t('next_cue', uiLang)} [D]">⏭</button>
        <span class="lectura-top-pill-divider"></span>
        <button type="button" class="lectura-sub-tool-btn ${this.autoPauseAfterSubtitle ? 'active' : ''}" data-action="autopause" title="${t('auto_pause_sub_hint', uiLang)}">⏸ Q</button>
        <button type="button" class="lectura-sub-tool-btn ${this.subtitleBlurMode !== 'off' ? 'active' : ''}" data-action="blur" title="Blur Mode [H]">👁 H</button>
        <span class="lectura-top-pill-divider"></span>
        <button type="button" class="lectura-sub-tool-btn ${this.showTranscriptSidebar ? 'active' : ''}" data-action="transcript" title="${t('transcript_panel', uiLang)} [T]">
          <span>📜 ${t('transcript_panel', uiLang)}</span>
          ${compHtml}
        </button>
      `;
    }
    if (this.showTranscriptSidebar) {
      this.syncTranscriptPlacement();
      this.renderTranscriptSidebar();
    }
  }

  private ytThemeObserverInitialized = false;

  private syncTranscriptThemeClass() {
    if (!this.transcriptPanel) return;
    const isDockedInPlayer = this.transcriptPanel.classList.contains('docked-in-player');
    const isYtDark = document.documentElement.hasAttribute('dark') || isDockedInPlayer;
    this.transcriptPanel.classList.toggle('theme-yt-light', !isYtDark);
    this.transcriptPanel.classList.toggle('theme-yt-dark', isYtDark);

    const isColorMode = this.settings?.subtitleHighlightStyle === 'color';
    this.transcriptPanel.classList.toggle('sub-mode--color', isColorMode);
    this.transcriptPanel.classList.toggle('sub-mode--underline', !isColorMode);

    if (!this.ytThemeObserverInitialized && document.documentElement) {
      this.ytThemeObserverInitialized = true;
      const obs = new MutationObserver(() => this.syncTranscriptThemeClass());
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
    }
  }

  /**
   * Re-evaluates vocabulary status classes on all currently rendered tokens in the subtitle overlay and right transcript sidebar
   */
  private refreshAllVisibleWordTokens() {
    if (this.subtitleBox) {
      this.subtitleBox.querySelectorAll<HTMLElement>('.lectura-token, .lectura-word-token').forEach((el) => {
        const w = el.dataset.coreWord || el.dataset.word || el.textContent?.trim() || '';
        if (!w) return;
        const info = this.lookupWordInfo(w);
        const isSelected = el.classList.contains('lectura-token--selected');
        const statusCls =
          info.status === 'ignored' || info.status === '0'
            ? 'status-ignored status-0'
            : info.status === 'known'
              ? 'status-known'
              : `status-${info.status}`;
        el.className = `lectura-word-token lectura-token ${statusCls}${isSelected ? ' lectura-token--selected' : ''}`;
      });
    }

    if (this.transcriptPanel) {
      this.transcriptPanel.querySelectorAll<HTMLElement>('.lectura-transcript-word').forEach((el) => {
        const w = el.dataset.coreWord || el.dataset.word || el.textContent?.trim() || '';
        if (!w) return;
        const info = this.lookupWordInfo(w);
        const isSelected = el.classList.contains('lectura-token--selected');
        const statusCls =
          info.status === 'ignored' || info.status === '0'
            ? 'status-ignored status-0'
            : info.status === 'known'
              ? 'status-known'
              : `status-${info.status}`;
        el.className = `lectura-transcript-word ${statusCls}${isSelected ? ' lectura-token--selected' : ''}`;
      });
    }
  }

  private renderTranscriptTextTokens(rawText: string): string {
    const cleanText = rawText.replace(/\s*(?:>>+|›)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const isEnglish = this.getEffectiveLang().toLowerCase().startsWith('en');
    const parts = cleanText.match(/([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\p{L}\p{N}\s]+|\s+)/gu) || [cleanText];

    let html = '';
    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        html += part;
        continue;
      }
      if (isWordToken(part, isEnglish)) {
        const wordInfo = this.lookupWordInfo(part);
        const statusClass =
          wordInfo.status === 'ignored' || wordInfo.status === '0'
            ? 'status-ignored status-0'
            : `status-${wordInfo.status}`;
        const escWord = this.escapeHtml(part);
        const escLower = this.escapeHtml(part.toLowerCase());
        html += `<span class="lectura-transcript-word ${statusClass}" data-word="${escLower}" data-core-word="${escWord}">${escWord}</span>`;
      } else {
        html += this.escapeHtml(part);
      }
    }
    return html;
  }

  private transcriptActiveTab: 'text' | 'words' = 'text';
  private transcriptWordsFilter: 'all' | 'new' | 'learning' = 'all';

  private renderTranscriptRowsHtml(query: string): string {
    const uiLang = this.settings?.interfaceLanguage || 'en';
    const rows = (this.preparsedSentences || [])
      .map((s, idx) => {
        if (query && !s.text.toLowerCase().includes(query)) return '';
        const isActive = idx === this.currentSentenceIndex;
        return `
          <div class="lectura-transcript-row ${isActive ? 'active-cue' : ''}" data-cue-idx="${idx}">
            <span class="lectura-transcript-time" title="Seek to ${this.formatCueTimestamp(s.start)}">${this.formatCueTimestamp(s.start)}</span>
            <span class="lectura-transcript-text">${this.renderTranscriptTextTokens(s.text)}</span>
          </div>
        `;
      })
      .filter(Boolean)
      .join('');
    return rows || `<div style="padding: 18px 10px; text-align: center; color: #94a3b8; font-size: 12px;">${t('transcript_empty', uiLang)}</div>`;
  }

  private renderTranscriptWordsHtml(query: string): string {
    const uiLang = this.settings?.interfaceLanguage || 'en';
    const lang = this.getEffectiveLang();
    const isEn = lang.toLowerCase().startsWith('en');

    const wordMap = new Map<
      string,
      {
        word: string;
        lower: string;
        status: string;
        translation: string;
        count: number;
        cueIdx: number;
        start: number;
        sentence: string;
      }
    >();

    for (let idx = 0; idx < (this.preparsedSentences || []).length; idx++) {
      const s = this.preparsedSentences[idx];
      const tokens = s.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
      for (const tok of tokens) {
        if (!isWordToken(tok, isEn)) continue;
        const lower = tok.toLowerCase();
        const existing = wordMap.get(lower);
        if (existing) {
          existing.count++;
          continue;
        }
        const info = this.lookupWordInfo(lower);
        if (info.status === 'known' || info.status === 'ignored' || info.status === '0' || info.status === '5') {
          continue;
        }
        const rawTrans =
          this.cachedWordsByLang[lang]?.[lower]?.translation?.trim() ||
          info.translation?.trim() ||
          YouTubeLecturaOverlay.localTranslationCache.get(`${lang}:${lower}`) ||
          '';
        const cleanTrans =
          rawTrans && !['[known]', '[ignored]', '[импорт с датой]', '—', '...'].includes(rawTrans.toLowerCase())
            ? rawTrans.split('\n')[0].replace(/^\([a-zA-Z]+\)\s*/, '').trim()
            : '';

        wordMap.set(lower, {
          word: tok,
          lower,
          status: info.status,
          translation: cleanTrans,
          count: 1,
          cueIdx: idx,
          start: s.start,
          sentence: s.text.replace(/\s*(?:>>+|›)\s*/g, ' ').trim(),
        });
      }
    }

    const items = Array.from(wordMap.values()).filter((item) => {
      if (this.transcriptWordsFilter === 'new' && item.status !== 'new') return false;
      if (this.transcriptWordsFilter === 'learning' && item.status === 'new') return false;
      if (query && !item.lower.includes(query) && !item.translation.toLowerCase().includes(query)) return false;
      return true;
    });

    if (items.length === 0) {
      return `<div style="padding: 18px 10px; text-align: center; color: #94a3b8; font-size: 12px;">${t('transcript_no_words', uiLang)}</div>`;
    }

    return items
      .map((item) => {
        const isLearning = ['1', '2', '3', '4', 'learning'].includes(item.status);
        return `
          <div class="lectura-vword-row" data-cue-idx="${item.cueIdx}" data-vword="${this.escapeHtml(item.word)}">
            <div class="lectura-vword-main">
              <span class="lectura-transcript-time" data-seek-cue="${item.cueIdx}" title="Seek to ${this.formatCueTimestamp(item.start)}">${this.formatCueTimestamp(item.start)}</span>
              <div class="lectura-vword-info">
                <span class="lectura-transcript-word status-${item.status}" data-word="${this.escapeHtml(item.lower)}" data-core-word="${this.escapeHtml(item.word)}">${this.escapeHtml(item.word)}</span>
                ${item.count > 1 ? `<span class="lectura-vword-count">×${item.count}</span>` : ''}
                ${item.translation ? `<span class="lectura-vword-trans" title="${this.escapeHtml(item.translation)}">${this.escapeHtml(item.translation)}</span>` : ''}
              </div>
            </div>
            <div class="lectura-vword-actions">
              <button type="button" class="lectura-vword-act act-learn ${isLearning ? 'active' : ''}" data-vwact="1" title="${t('status_learning', uiLang)} (1)">1</button>
              <button type="button" class="lectura-vword-act act-known" data-vwact="known" title="${t('status_known', uiLang)} (K)">✓</button>
              <button type="button" class="lectura-vword-act act-ignore" data-vwact="ignored" title="${t('status_ignored', uiLang)} (0)">🚫</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private renderTranscriptSidebar() {
    if (!this.transcriptPanel) return;
    this.syncTranscriptThemeClass();
    const uiLang = this.settings?.interfaceLanguage || 'en';
    const comp = this.computeVideoComprehension();
    const totalStudyWords = comp.newCount + comp.learningCount;
    const query = this.transcriptSearchQuery.trim().toLowerCase();
    const prevListEl = this.transcriptPanel.querySelector<HTMLElement>('.lectura-transcript-list');
    const prevScrollTop = prevListEl ? prevListEl.scrollTop : null;

    const filterBarHtml =
      this.transcriptActiveTab === 'words'
        ? `
        <div class="lectura-vword-filter-bar">
          <button type="button" class="lectura-vword-fbtn ${this.transcriptWordsFilter === 'all' ? 'active' : ''}" data-wfilter="all">${t('transcript_filter_all', uiLang)} (${totalStudyWords})</button>
          <button type="button" class="lectura-vword-fbtn ${this.transcriptWordsFilter === 'new' ? 'active' : ''}" data-wfilter="new">${t('transcript_filter_new', uiLang)} (${comp.newCount})</button>
          <button type="button" class="lectura-vword-fbtn ${this.transcriptWordsFilter === 'learning' ? 'active' : ''}" data-wfilter="learning">${t('transcript_filter_learning', uiLang)} (${comp.learningCount})</button>
        </div>
      `
        : '';

    const listContentHtml =
      this.transcriptActiveTab === 'words' ? this.renderTranscriptWordsHtml(query) : this.renderTranscriptRowsHtml(query);

    this.transcriptPanel.innerHTML = `
      <div class="lectura-transcript-header">
        <div class="lectura-transcript-title-row">
          <div class="lectura-transcript-title">
            <div class="lectura-transcript-tabs">
              <button type="button" class="lectura-ttab-btn ${this.transcriptActiveTab === 'text' ? 'active' : ''}" data-ttab="text">
                📜 ${t('transcript_panel', uiLang)}
              </button>
              <button type="button" class="lectura-ttab-btn ${this.transcriptActiveTab === 'words' ? 'active' : ''}" data-ttab="words">
                📊 ${t('transcript_words_tab', uiLang)} (${totalStudyWords})
              </button>
            </div>
            <span style="font-size: 11px; color: #10b981; background: rgba(16, 185, 129, 0.14); padding: 1px 6px; border-radius: 999px; font-weight: 700;">
              ${comp.knownPct}%
            </span>
          </div>
          <div class="lectura-transcript-controls">
            <button type="button" class="lectura-transcript-ctrl-btn ${this.autoPauseAfterSubtitle ? 'active' : ''}" data-tctrl="autopause" title="${t('auto_pause_sub_hint', uiLang)}">⏸ Q</button>
            <button type="button" class="lectura-transcript-ctrl-btn ${this.subtitleBlurMode !== 'off' ? 'active' : ''}" data-tctrl="blur" title="Blur Mode [H]">👁 H</button>
            <button type="button" class="lectura-transcript-ctrl-btn" data-tctrl="close" title="Close">✕</button>
          </div>
        </div>
        <input type="text" class="lectura-transcript-search" placeholder="${t('transcript_search', uiLang)}" value="${this.escapeHtml(this.transcriptSearchQuery)}" />
        ${filterBarHtml}
      </div>
      <div class="lectura-transcript-list">
        ${listContentHtml}
      </div>
    `;

    // Bind tab switcher buttons (Text vs Video Words)
    this.transcriptPanel.querySelectorAll<HTMLElement>('[data-ttab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = btn.dataset.ttab as 'text' | 'words';
        if (tab && tab !== this.transcriptActiveTab) {
          this.transcriptActiveTab = tab;
          this.renderTranscriptSidebar();
        }
      });
    });

    // Bind sub-filter buttons inside Words tab
    this.transcriptPanel.querySelectorAll<HTMLElement>('[data-wfilter]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wf = btn.dataset.wfilter as 'all' | 'new' | 'learning';
        if (wf && wf !== this.transcriptWordsFilter) {
          this.transcriptWordsFilter = wf;
          this.renderTranscriptSidebar();
        }
      });
    });

    // Bind header control buttons
    this.transcriptPanel.querySelectorAll<HTMLElement>('[data-tctrl]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ctrl = btn.dataset.tctrl;
        if (ctrl === 'autopause') this.toggleAutoPauseAfterSubtitle();
        else if (ctrl === 'blur') this.cycleSubtitleBlurMode();
        else if (ctrl === 'close') this.toggleTranscriptSidebar();
      });
    });

    // Bind search input
    const searchInput = this.transcriptPanel.querySelector<HTMLInputElement>('.lectura-transcript-search');
    searchInput?.addEventListener('input', (e) => {
      e.stopPropagation();
      this.transcriptSearchQuery = searchInput.value;
      const listEl = this.transcriptPanel?.querySelector<HTMLElement>('.lectura-transcript-list');
      if (listEl) {
        const q = this.transcriptSearchQuery.trim().toLowerCase();
        listEl.innerHTML =
          this.transcriptActiveTab === 'words' ? this.renderTranscriptWordsHtml(q) : this.renderTranscriptRowsHtml(q);
      }
    });

    // Delegated hover & click on transcript words and rows
    const listEl = this.transcriptPanel.querySelector<HTMLElement>('.lectura-transcript-list');
    if (listEl) {
      if (prevScrollTop !== null && prevScrollTop > 0) {
        listEl.scrollTop = prevScrollTop;
      } else if (this.transcriptActiveTab === 'text' && this.currentSentenceIndex >= 0) {
        this.highlightActiveTranscriptCue(this.currentSentenceIndex);
      }

      listEl.addEventListener('scroll', () => {
        this.hideHoverTooltip();
      }, { passive: true });

      listEl.addEventListener('mouseover', (e) => {
        const wordEl = (e.target as HTMLElement).closest<HTMLElement>('.lectura-transcript-word');
        if (wordEl) {
          const coreWord = wordEl.dataset.coreWord || wordEl.textContent?.trim() || '';
          if (coreWord) this.showHoverTooltip(wordEl, coreWord);
        }
      });

      listEl.addEventListener('mouseout', (e) => {
        const wordEl = (e.target as HTMLElement).closest<HTMLElement>('.lectura-transcript-word');
        if (wordEl) {
          this.hideHoverTooltip();
        }
      });

      listEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;

        // A) Quick 1-click status button in Video Words tab (1 / ✓ Known / 🚫 Ignore)
        const actBtn = target.closest<HTMLElement>('[data-vwact]');
        if (actBtn) {
          const newStatus = actBtn.dataset.vwact || 'known';
          const vrow = actBtn.closest<HTMLElement>('.lectura-vword-row');
          const vword = vrow?.dataset.vword || '';
          const cueIdx = parseInt(vrow?.dataset.cueIdx || '-1', 10);
          const sentenceObj = cueIdx >= 0 && cueIdx < this.preparsedSentences.length ? this.preparsedSentences[cueIdx] : null;
          if (vword) {
            this.hideHoverTooltip();
            const langCode = this.getEffectiveLang();
            const nativeLang = this.settings?.nativeLanguage || 'Russian';
            let trans =
              this.cachedWordsByLang[langCode]?.[vword.toLowerCase()]?.translation ||
              YouTubeLecturaOverlay.localTranslationCache.get(`${langCode}:${vword.toLowerCase()}`) ||
              '';
            if (!trans && newStatus === '1') {
              try {
                const res = await this.fetchDirectTranslation(vword, nativeLang, langCode);
                trans = res.translationText || '';
              } catch (_) {}
            }
            await this.saveWordToLectura(
              vword,
              trans,
              newStatus,
              sentenceObj ? sentenceObj.text.replace(/\s*(?:>>+|›)\s*/g, ' ').trim() : ''
            );
          }
          return;
        }

        const row = target.closest<HTMLElement>('.lectura-transcript-row, .lectura-vword-row');
        if (!row) return;
        const idx = parseInt(row.dataset.cueIdx || '-1', 10);
        const sentenceObj = idx >= 0 && idx < this.preparsedSentences.length ? this.preparsedSentences[idx] : null;

        // B) Clicking a word token inside the transcript or words tab opens its word lookup card
        const wordEl = target.closest<HTMLElement>('.lectura-transcript-word');
        if (wordEl && sentenceObj) {
          this.hideHoverTooltip();
          if (this.settings?.pauseOnWordClick && this.videoElement && !this.videoElement.paused) {
            this.videoElement.pause();
          }
          listEl.querySelectorAll('.lectura-token--selected').forEach((el) => el.classList.remove('lectura-token--selected'));
          wordEl.classList.add('lectura-token--selected');
          this.selectedTokens = [wordEl];
          const coreWord = wordEl.dataset.coreWord || wordEl.textContent?.trim() || '';
          if (coreWord) {
            this.showWordCard(coreWord, sentenceObj.text.replace(/\s*(?:>>+|›)\s*/g, ' ').trim(), wordEl);
          }
          return;
        }

        // C) Clicking the timestamp or row background seeks the video to that cue
        if (sentenceObj && this.videoElement) {
          this.autoPausedSentenceIndex = -1;
          this.videoElement.currentTime = Math.max(0, sentenceObj.start + 0.01);
          this.updateSubtitleOverlay(this.videoElement.currentTime);
        }
      });
    }
  }

  private highlightActiveTranscriptCue(activeIndex: number) {
    if (!this.transcriptPanel || !this.showTranscriptSidebar) return;
    const listEl = this.transcriptPanel.querySelector<HTMLElement>('.lectura-transcript-list');
    const rows = this.transcriptPanel.querySelectorAll<HTMLElement>('.lectura-transcript-row');
    rows.forEach((r) => {
      const idx = parseInt(r.dataset.cueIdx || '-1', 10);
      if (idx === activeIndex) {
        r.classList.add('active-cue');
        if (listEl) {
          const targetTop = r.offsetTop - listEl.clientHeight / 2 + r.clientHeight / 2;
          listEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
      } else {
        r.classList.remove('active-cue');
      }
    });
  }

  private static aiExplanationCache = new Map<string, any>();
  private static localDefinitionCache = new Map<string, string>();
  private activeWordData: { word: string; contextSentence: string; targetToken?: HTMLElement; grammar?: string; contextRelation?: string } | null = null;

  /**
   * Closes the active word/phrase card and unlocks subtitles
   */
  private closeWordCard() {
    this.hideHoverTooltip();
    if (this.translationAbortController) {
      this.translationAbortController.abort();
      this.translationAbortController = null;
    }
    if (this.popupCard) this.popupCard.style.display = 'none';
    this.activeWordData = null;
    this.isPhraseSelecting = false;
    this.startTokenIndex = null;
    if (this.selectedTokens.length > 0) {
      this.selectedTokens.forEach((t) => t.classList.remove('lectura-token--selected'));
      this.selectedTokens = [];
    }

    // Resume video playback when closing the modal card
    if (this.videoElement && this.videoElement.paused) {
      this.videoElement.play().catch(() => {});
    }
  }

  /**
   * Shows compact floating hover tooltip above hovered subtitle token (Language Reactor style)
   */
  private showHoverTooltip(token: HTMLElement, word: string) {
    if (!this.hoverTooltip || !token) return;
    // Don't show hover tooltip if full word card is currently open
    if (this.popupCard && this.popupCard.style.display !== 'none') {
      this.hideHoverTooltip();
      return;
    }

    const cleanWord = cleanWordForTranslation(word);
    if (!cleanWord) return;

    const wordInfo = this.lookupWordInfo(cleanWord);
    const nativeLang = this.settings?.nativeLanguage || 'Russian';

    const getStatusColor = (status: string) => {
      switch (status) {
        case '1': return '#fb7185';
        case '2': return '#facc15';
        case '3': return '#34d399';
        case '4': return '#204bf4';
        case '5': return '#c084fc';
        case 'known': return '#10b981';
        case 'ignored': return '#64748b';
        default: return '#38bdf8';
      }
    };
    const barColor = getStatusColor(wordInfo.status);

    const renderTooltipDom = (translationText: string) => {
      if (!this.hoverTooltip) return;
      const items: string[] = [];

      if (translationText && translationText !== '—' && translationText !== '...' && translationText !== 'Перевод не найден') {
        const lines = translationText.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const cleanLine = line.replace(/^\([a-zA-Z]+\)\s*/, '').trim();
          const parts = cleanLine.split(',').map((p) => p.trim()).filter(Boolean);
          for (const p of parts) {
            if (p && p.toLowerCase() !== cleanWord && !items.some((item) => item.toLowerCase() === p.toLowerCase())) {
              items.push(p);
              if (items.length >= 4) break;
            }
          }
          if (items.length >= 4) break;
        }
      }

      let contentHtml = '';
      if (items.length > 0) {
        contentHtml = items.map((item) => `<div class="translation-item">${item}</div>`).join('');
      } else if (translationText === '...') {
        contentHtml = `<div class="translation-item" style="opacity: 0.5; letter-spacing: 2px;">...</div>`;
      } else {
        contentHtml = `<div class="translation-item" style="opacity: 0.6;">—</div>`;
      }

      this.hoverTooltip.innerHTML = `
        ${contentHtml}
        <div class="status-bar-track">
          <div class="status-bar-fill" style="background: ${barColor};"></div>
        </div>
      `;

      const isFromTranscript = Boolean(this.transcriptPanel && this.transcriptPanel.contains(token));
      if (isFromTranscript && this.sidebarShadowRoot) {
        if (this.hoverTooltip.parentNode !== this.sidebarShadowRoot) {
          this.sidebarShadowRoot.appendChild(this.hoverTooltip);
        }
      } else if (this.shadowRoot) {
        if (this.hoverTooltip.parentNode !== this.shadowRoot) {
          this.shadowRoot.appendChild(this.hoverTooltip);
        }
      }

      this.hoverTooltip.style.display = 'flex';

      // Position tooltip strictly above hovered token
      const tokenRect = token.getBoundingClientRect();
      const tooltipRect = this.hoverTooltip.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width || 140;

      if (isFromTranscript && this.sidebarHost) {
        const hostRect = this.sidebarHost.getBoundingClientRect();
        let leftRel = (tokenRect.left - hostRect.left) + (tokenRect.width / 2) - (tooltipWidth / 2);
        leftRel = Math.max(8, Math.min(leftRel, hostRect.width - tooltipWidth - 8));
        const bottomRel = Math.max(8, (hostRect.bottom - tokenRect.top) + 10);

        this.hoverTooltip.style.position = 'absolute';
        this.hoverTooltip.style.left = `${Math.round(leftRel)}px`;
        this.hoverTooltip.style.bottom = `${Math.round(bottomRel)}px`;
        this.hoverTooltip.style.top = 'auto';
      } else {
        let left = tokenRect.left + tokenRect.width / 2 - tooltipWidth / 2;
        if (left < 10) left = 10;
        if (left + tooltipWidth > window.innerWidth - 10) {
          left = window.innerWidth - tooltipWidth - 10;
        }

        const isFromSubtitleBox = Boolean(this.subtitleBox && this.subtitleBox.contains(token));
        const targetTop = (isFromSubtitleBox && this.subtitleBox) ? Math.min(tokenRect.top, this.subtitleBox.getBoundingClientRect().top) : tokenRect.top;
        const bottomOffset = window.innerHeight - targetTop + 14;

        this.hoverTooltip.style.position = 'fixed';
        this.hoverTooltip.style.left = `${left}px`;
        this.hoverTooltip.style.bottom = `${bottomOffset}px`;
        this.hoverTooltip.style.top = 'auto';
      }

      requestAnimationFrame(() => {
        this.hoverTooltip?.classList.add('visible');
      });
    };

    // 1. Instant check for auto-ignored word
    if (wordInfo.isAutoIgnored) {
      renderTooltipDom(`${wordInfo.ignoreIcon || '🚫'} ${wordInfo.ignoreBadge || 'Ignored'}`);
      return;
    }

    // 2. Instant check from user vocabulary first (custom Lectura translation ALWAYS takes top priority), then session cache
    const lang = this.getEffectiveLang();
    const cacheKey = `${lang}:${cleanWord}`;
    const baseWord = normalizeContraction(cleanWord, lang);
    const baseCacheKey = `${lang}:${baseWord}`;

    const isSystemPlaceholder = (val?: string): boolean => {
      if (!val) return true;
      const v = val.trim().toLowerCase();
      if (!v || v === cleanWord) return true;
      const placeholders = [
        '...', 'translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден',
        '[ignored]', '[known]', '[импорт с датой]', 'ignored', 'known', 'ха', 'ха-ха', 'ha', 'ha-ha',
      ];
      return placeholders.includes(v);
    };

    const userSavedTrans =
      this.cachedWordsByLang[lang]?.[cleanWord]?.translation?.trim() ||
      wordInfo.translation?.trim() ||
      (baseWord && baseWord !== cleanWord ? this.cachedWordsByLang[lang]?.[baseWord]?.translation?.trim() : '') ||
      '';

    let cachedTrans = !isSystemPlaceholder(userSavedTrans)
      ? userSavedTrans
      : YouTubeLecturaOverlay.localTranslationCache.get(cacheKey) ||
        (baseWord && baseWord !== cleanWord ? YouTubeLecturaOverlay.localTranslationCache.get(baseCacheKey) || '' : '');

    if (cachedTrans && !isSystemPlaceholder(cachedTrans)) {
      renderTooltipDom(cachedTrans);
      return;
    }

    // 3. Not in cache (or only had system placeholder like [Known]): show loading dots and fetch dictionary translation
    this.hoverTooltip.dataset.hoveredWord = cleanWord;
    renderTooltipDom('...');

    this.fetchDirectTranslation(cleanWord, nativeLang, lang)
      .then((res) => {
        if (res.translationText && res.translationText !== '—') {
          const existing = this.cachedWordsByLang[lang]?.[cleanWord]?.translation;
          if (this.cachedWordsByLang[lang]?.[cleanWord] && isSystemPlaceholder(existing)) {
            this.cachedWordsByLang[lang][cleanWord].translation = res.translationText;
          }
          if (this.hoverTooltip && this.hoverTooltip.dataset.hoveredWord === cleanWord && this.hoverTooltip.style.display !== 'none') {
            renderTooltipDom(res.translationText);
          }
        }
      })
      .catch(() => {});
  }

  /**
   * Hides the compact hover tooltip
   */
  private hideHoverTooltip() {
    if (this.hoverTimeoutId) {
      window.clearTimeout(this.hoverTimeoutId);
      this.hoverTimeoutId = null;
    }
    if (this.hoverTooltip) {
      this.hoverTooltip.classList.remove('visible');
      this.hoverTooltip.style.display = 'none';
      this.hoverTooltip.dataset.hoveredWord = '';
    }
  }

  private static localTranslationCache = new Map<string, string>();

  /**
   * Fast, autonomous, 100% direct translation fetcher bypassing service-worker messages completely.
   */
  private async fetchDirectTranslation(text: string, targetLang: string = 'ru', sourceLang?: string): Promise<{ translationText: string; baseRoot?: string }> {
    const cleanWord = cleanWordForTranslation(text);
    if (!cleanWord) return { translationText: '' };

    const sIso = normalizeLangCode(sourceLang || this.getEffectiveLang());
    const tIso = (targetLang || 'ru').slice(0, 2).toLowerCase();
    const cacheKey = `${sIso}:${cleanWord}`;

    const haberForms = ['he', 'has', 'ha', 'hemos', 'habéis', 'han', 'había', 'habías', 'habíamos', 'habían', 'hube', 'hubo', 'hubieron', 'haya', 'hayas', 'hayamos', 'hayan', 'hay'];
    const detectedBaseRoot = sIso === 'es' && haberForms.includes(cleanWord) ? 'haber' : 
      (sIso === 'es' && YouTubeLecturaOverlay.SPANISH_IRREGULARS[cleanWord] ? YouTubeLecturaOverlay.SPANISH_IRREGULARS[cleanWord] : 
      (sIso === 'en' && YouTubeLecturaOverlay.ENGLISH_IRREGULARS[cleanWord] ? YouTubeLecturaOverlay.ENGLISH_IRREGULARS[cleanWord] : ''));

    if (YouTubeLecturaOverlay.localTranslationCache.has(cacheKey)) {
      const cached = YouTubeLecturaOverlay.localTranslationCache.get(cacheKey)!;
      if (cached && cached !== '—' && cached.toLowerCase() !== 'ха' && cached.toLowerCase() !== 'ha') {
        return { translationText: cached, baseRoot: detectedBaseRoot };
      }
    }

    // 1. Direct fast fetch (~20-40ms directly over HTTP/2)
    try {
      const isMultiWord = cleanWord.includes(' ');
      const dtParams = isMultiWord ? 'dt=t' : 'dt=t&dt=bd&dt=rm';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sIso}&tl=${tIso}&${dtParams}&q=${encodeURIComponent(cleanWord)}`;
      
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const data = await response.json();
        const variants: string[] = [];

        // Собираем варианты из словарного блока (data[1])
        if (data && data[1] && Array.isArray(data[1])) {
          for (const entry of data[1]) {
            if (entry && Array.isArray(entry[1])) {
              for (const term of entry[1]) {
                const cleanTerm = String(term).trim();
                if (
                  cleanTerm && 
                  cleanTerm.toLowerCase() !== cleanWord && 
                  cleanTerm.toLowerCase() !== 'ха' && 
                  cleanTerm.toLowerCase() !== 'ha' &&
                  !variants.some((v) => v.toLowerCase() === cleanTerm.toLowerCase())
                ) {
                  variants.push(cleanTerm);
                }
              }
            }
          }
        }

        // Добавляем основной машинный перевод
        const primary = data?.[0]?.[0]?.[0]?.trim() || '';
        if (
          primary && 
          primary.toLowerCase() !== cleanWord && 
          primary.toLowerCase() !== 'ха' && 
          primary.toLowerCase() !== 'ha' &&
          !variants.some((v) => v.toLowerCase() === primary.toLowerCase())
        ) {
          variants.unshift(primary);
        }

        if (sIso === 'es' && haberForms.includes(cleanWord)) {
          variants.unshift('иметь (вспом. глагол)', 'быть', 'происходить');
        }

        const seen = new Set<string>();
        const uniqueVariants: string[] = [];
        for (const v of variants) {
          const lower = v.toLowerCase().trim();
          if (lower && !seen.has(lower) && lower !== 'ха' && lower !== 'ha') {
            seen.add(lower);
            uniqueVariants.push(v.trim());
          }
        }

        const translationText = uniqueVariants.length > 0 
          ? uniqueVariants.slice(0, 5).join(', ') 
          : (primary && primary.toLowerCase() !== 'ха' && primary.toLowerCase() !== 'ha' ? primary : '—');

        if (translationText && translationText !== '—') {
          YouTubeLecturaOverlay.localTranslationCache.set(cacheKey, translationText);
          return {
            translationText,
            baseRoot: detectedBaseRoot,
          };
        }
      }
    } catch (_) {}

    // 2. Background service worker fallback
    try {
      const bgResponse: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'TRANSLATE_WORD',
            payload: { word: cleanWord, sourceLang: sIso, targetLang: tIso },
          },
          (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              resolve(null);
            } else {
              resolve(response);
            }
          }
        );
      });

      if (bgResponse?.translation && bgResponse.translation !== '—') {
        YouTubeLecturaOverlay.localTranslationCache.set(cacheKey, bgResponse.translation);
        return { translationText: bgResponse.translation, baseRoot: detectedBaseRoot };
      }
    } catch (_) {}

    if (sIso === 'es' && haberForms.includes(cleanWord)) {
      return {
        translationText: 'иметь (вспом. глагол), быть, происходить',
        baseRoot: 'haber',
      };
    }
    return { translationText: '—', baseRoot: detectedBaseRoot };
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Fetches localized explanatory definition in target translation language
   */
  private async fetchLocalizedDefinition(word: string, targetLanguage: string, translationLanguage: string, context: string): Promise<string> {
    const langCode = this.getEffectiveLang();
    const cleanLower = cleanWordForTranslation(word);
    const cacheKey = `${langCode}:${cleanLower}:${translationLanguage}`;

    if (YouTubeLecturaOverlay.localDefinitionCache.has(cacheKey)) {
      const cached = YouTubeLecturaOverlay.localDefinitionCache.get(cacheKey)!;
      const defEl = this.popupCard?.querySelector('.mono-def-text');
      if (defEl) defEl.textContent = cached;
      return cached;
    }

    try {
      let defText = '';
      try {
        const dictRes = await this.apiClient.getDictionaryExplain({
          word: cleanLower,
          targetLanguage,
          translationLanguage,
          context,
        });
        if (dictRes?.translation) {
          defText = dictRes.translation;
        }
      } catch (_) {}

      if (!defText) {
        const cachedWord = (this.cachedWordsByLang[langCode] || {})[cleanLower];
        if (cachedWord?.translation) {
          const lines = cachedWord.translation.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            defText = lines.slice(1).join('\n');
          }
        }
      }

      if (defText && targetLanguage.toLowerCase() !== translationLanguage.toLowerCase()) {
        try {
          const trans = await this.apiClient.translateText(defText, langCode, translationLanguage);
          if (trans?.translation) {
            defText = trans.translation;
          }
        } catch (_) {}
      }

      if (defText) {
        YouTubeLecturaOverlay.localDefinitionCache.set(cacheKey, defText);
        const defEl = this.popupCard?.querySelector('.mono-def-text');
        if (defEl && this.activeWordData?.word.toLowerCase() === word.toLowerCase()) {
          defEl.textContent = defText;
        }
      }
      return defText;
    } catch (err) {
      console.warn('[Lectura Overlay] fetchLocalizedDefinition failed:', err);
      return '';
    }
  }

  /**
   * Fetches context and grammatical breakdown from AI (/api/explain)
   */
  private async fetchAiBreakdown(word: string, contextSentence: string, force = false): Promise<void> {
    if (!this.popupCard) return;
    const cleanWord = word.trim();
    if (!cleanWord) return;

    const langCode = this.getEffectiveLang();
    const activeLang = getLanguageDisplayName(langCode);
    const nativeLang = this.settings?.nativeLanguage || 'Russian';
    const cacheKey = `${langCode}:${cleanWord.toLowerCase()}:${(contextSentence || '').toLowerCase().trim()}`;

    const loadingBox = this.popupCard.querySelector<HTMLElement>('.ai-loading-box');
    const emptyBox = this.popupCard.querySelector<HTMLElement>('.ai-empty-box');
    const errorBox = this.popupCard.querySelector<HTMLElement>('.ai-error-box');
    const contentBox = this.popupCard.querySelector<HTMLElement>('.ai-content-box');
    const errorText = this.popupCard.querySelector<HTMLElement>('.ai-error-text');
    const grammarBadge = this.popupCard.querySelector<HTMLElement>('.ai-grammar-badge');
    const relationText = this.popupCard.querySelector<HTMLElement>('.ai-relation-text');
    const examplesContainer = this.popupCard.querySelector<HTMLElement>('.ai-examples-container');
    const examplesList = this.popupCard.querySelector<HTMLElement>('.ai-examples-list');

    const renderAiData = (data: any) => {
      if (emptyBox) emptyBox.style.display = 'none';
      if (loadingBox) loadingBox.style.display = 'none';
      if (errorBox) errorBox.style.display = 'none';
      if (contentBox) contentBox.style.display = 'block';

      if (grammarBadge) {
        if (data.grammar) {
          grammarBadge.textContent = data.grammar;
          grammarBadge.style.display = 'inline-block';
        } else {
          grammarBadge.style.display = 'none';
        }
      }

      if (relationText) {
        relationText.textContent = data.contextRelation || data.translation || 'No context explanation available.';
      }

      if (this.activeWordData) {
        this.activeWordData.grammar = data.grammar;
        this.activeWordData.contextRelation = data.contextRelation;
      }

      if (examplesContainer && examplesList) {
        if (Array.isArray(data.examples) && data.examples.length > 0) {
          examplesList.innerHTML = data.examples.map((ex: any) => `
            <div style="font-size: 12px; color: #334155; border-left: 2px solid #0284c7; padding-left: 8px; margin-bottom: 4px;">
              <div style="font-weight: 600; color: #0f172a;">${this.escapeHtml(ex.text || '')}</div>
              ${ex.translation ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${this.escapeHtml(ex.translation)}</div>` : ''}
            </div>
          `).join('');
          examplesContainer.style.display = 'block';
        } else {
          examplesContainer.style.display = 'none';
        }
      }

      if (data.translation) {
        const meaningInput = this.popupCard?.querySelector<HTMLInputElement>('.calm-meaning-input, .lectura-meaning-input');
        if (meaningInput && (!meaningInput.value || meaningInput.value.toLowerCase().includes('translating') || meaningInput.value === '—')) {
          meaningInput.value = data.translation;
        }
      }
    };

    if (!force && YouTubeLecturaOverlay.aiExplanationCache.has(cacheKey)) {
      renderAiData(YouTubeLecturaOverlay.aiExplanationCache.get(cacheKey));
      return;
    }

    if (emptyBox) emptyBox.style.display = 'none';
    if (errorBox) errorBox.style.display = 'none';
    if (contentBox) contentBox.style.display = 'none';
    if (loadingBox) loadingBox.style.display = 'block';

    try {
      const result = await this.apiClient.explainWithAi({
        word: cleanWord,
        context: contextSentence || cleanWord,
        targetLanguage: activeLang,
        translationLanguage: nativeLang,
      });

      if (result && (result.contextRelation || result.translation || result.grammar)) {
        YouTubeLecturaOverlay.aiExplanationCache.set(cacheKey, result);
        renderAiData(result);
      } else {
        throw new Error(result?.error || 'No AI explanation returned');
      }
    } catch (err: any) {
      if (loadingBox) loadingBox.style.display = 'none';
      if (contentBox) contentBox.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        if (errorText) errorText.textContent = err?.message || 'Failed to fetch AI breakdown. Check server connection.';
      }
    }
  }

  private static tatoebaCache = new Map<string, Array<{ source: string; target: string }>>();

  /**
   * Fetches 2-3 short, clean example sentences from Tatoeba (proxied via service worker to avoid CORS)
   */
  private async fetchTatoebaExamples(word: string, sourceLang: string, targetLang: string): Promise<Array<{ source: string; target: string }>> {
    const clean = word.trim().toLowerCase();
    if (!clean || clean.length < 2) return [];

    if (YouTubeLecturaOverlay.tatoebaCache.has(clean)) {
      return YouTubeLecturaOverlay.tatoebaCache.get(clean)!;
    }

    try {
      const pairs = await this.apiClient.fetchTatoebaExamples(clean, sourceLang, targetLang);
      if (pairs && pairs.length > 0) {
        YouTubeLecturaOverlay.tatoebaCache.set(clean, pairs);
        return pairs;
      }
    } catch (e) {
      console.warn('[Tatoeba Error]', e);
    }

    return [];
  }

  /**
   * Highlights target word in context sentence
   */
  private highlightWordInContext(sentence: string, word: string): string {
    if (!sentence || !word) return sentence || '';
    const cleanWord = word.trim();
    if (!cleanWord) return sentence;

    const escaped = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRegex = new RegExp(`\\b(${escaped})\\b`, 'gi');
    if (wordBoundaryRegex.test(sentence)) {
      return sentence.replace(wordBoundaryRegex, '<span class="highlight-token">$1</span>');
    }
    const looseRegex = new RegExp(`(${escaped})`, 'gi');
    return sentence.replace(looseRegex, '<span class="highlight-token">$1</span>');
  }

  /**
   * Generates external dictionary URLs (Language Reactor style)
   */
  private getExternalDictUrls(word: string, targetLang: string, nativeLang?: string) {
    const clean = encodeURIComponent(word.trim());
    const code = normalizeLangCode(targetLang);
    const langName = getLanguageDisplayName(code).toLowerCase();

    // Resolve native/translation language for Reverso pair
    const langMap: Record<string, string> = {
      en: 'english', es: 'spanish', fr: 'french', de: 'german',
      it: 'italian', ru: 'russian', pt: 'portuguese', zh: 'chinese',
      ja: 'japanese', ko: 'korean', ar: 'arabic', tr: 'turkish',
    };
    const nativeCode = normalizeLangCode(nativeLang || 'russian');
    const nativeName = langMap[nativeCode] || nativeLang?.toLowerCase() || 'russian';

    // Cambridge dictionary code
    let cambridgeDict = 'english';
    if (code === 'es') cambridgeDict = 'spanish-english';
    else if (code === 'fr') cambridgeDict = 'french-english';
    else if (code === 'de') cambridgeDict = 'german-english';
    else if (code === 'it') cambridgeDict = 'italian-english';
    else if (code === 'pt') cambridgeDict = 'portuguese-english';
    else if (code === 'ru') cambridgeDict = 'russian-english';
    else if (code === 'ja') cambridgeDict = 'japanese-english';

    // Wiktionary subdomain
    const wiktionaryLang = code;

    // If study language == native language, show definition instead of translation
    const reversoUrl = (langName === nativeName)
      ? `https://dictionary.reverso.net/${langName}-definition/${clean}`
      : `https://context.reverso.net/translation/${langName}-${nativeName}/${clean}`;

    return {
      reverso: reversoUrl,
      cambridge: `https://dictionary.cambridge.org/dictionary/${cambridgeDict}/${clean}`,
      wiktionary: `https://${wiktionaryLang}.wiktionary.org/wiki/${clean}`,
    };
  }

  /**
   * Formats multi-line Part-of-Speech definitions for popup card
   */
  private formatTranslationHtml(text: string): string {
    if (!text) return '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    return lines
      .map((line) => {
        const posMatch = line.match(/^\(([a-zA-Z]+)\)\s*(.+)$/);
        if (posMatch) {
          return `<div class="lectura-pos-line"><span class="lectura-pos-tag">(${posMatch[1]})</span><span class="lectura-pos-words">${posMatch[2]}</span></div>`;
        }
        return `<div class="lectura-def-line">${line}</div>`;
      })
      .join('');
  }

  /**
   * Shows floating word/phrase card positioned directly above the clicked token
   */
  private async showWordCard(word: string, contextSentence: string, targetToken?: HTMLElement) {
    try {
      if (!this.popupCard) return;
      const player = (document.querySelector('#movie_player, .html5-video-player') as HTMLElement) || this.playerContainer;
      if (player) {
        this.playerContainer = player;
        if (this.overlayContainer && !player.contains(this.overlayContainer)) {
          player.appendChild(this.overlayContainer);
        }
      }
      if (!this.playerContainer) return;

      this.activeWordData = { word, contextSentence, targetToken };
    const langCode = this.getEffectiveLang();
    const activeLang = getLanguageDisplayName(langCode);
    const nativeLang = this.settings?.nativeLanguage || 'Russian';
    const destLangName = getLanguageDisplayName(nativeLang);

    const wordInfo = this.lookupWordInfo(word);
    const lemmaDisplay = wordInfo.lemma && wordInfo.lemma !== word.toLowerCase() ? `(${wordInfo.lemma})` : '';

    const dialects = getDialectsForLanguage(langCode);
    let activeDialectCode = this.activeDialectByLang[langCode] || (this.settings?.ttsDialect?.toLowerCase().startsWith(langCode) ? this.settings.ttsDialect : dialects[0].code);
    let currentDialect = resolveDialect(langCode, activeDialectCode);
    const dialectLabel = currentDialect.label;
    const suggestedLemmas = getSuggestedLemmas(word, langCode);
    const cachedLinks = this.cachedWordLinksByLang[langCode] || {};
    const cachedWords = this.cachedWordsByLang[langCode] || {};
    const cleanLower = cleanWordForTranslation(word);
    const cachedLocalizedDef = YouTubeLecturaOverlay.localDefinitionCache.get(`${langCode}:${cleanLower}:${nativeLang}`);
    const baseWord = normalizeContraction(cleanLower, langCode);
    const existingParent = cachedLinks[cleanLower] || 
      (baseWord && cachedLinks[baseWord] ? cachedLinks[baseWord] : (wordInfo.lemma && wordInfo.lemma !== cleanLower ? wordInfo.lemma : ''));
    
    // Check user's custom translation from Lectura first, then session auto-translation cache
    const invalidPlaceholders = [
      '...', 'translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден',
      '[ignored]', '[known]', '[импорт с датой]', 'ignored', 'known', 'ха', 'ха-ха', 'ha', 'ha-ha'
    ];
    const isPlaceholder = (val?: string): boolean => {
      if (!val) return true;
      const v = val.trim().toLowerCase();
      return !v || v === cleanLower || invalidPlaceholders.includes(v);
    };

    const userSavedTrans =
      cachedWords[cleanLower]?.translation?.trim() ||
      wordInfo.translation?.trim() ||
      (baseWord && baseWord !== cleanLower ? cachedWords[baseWord]?.translation?.trim() : '') ||
      '';

    let rawTranslation = !isPlaceholder(userSavedTrans)
      ? userSavedTrans
      : YouTubeLecturaOverlay.localTranslationCache.get(`${langCode}:${cleanLower}`) ||
        (baseWord && baseWord !== cleanLower ? YouTubeLecturaOverlay.localTranslationCache.get(`${langCode}:${baseWord}`) || '' : '');

    if (isPlaceholder(rawTranslation)) {
      rawTranslation = '';
    }
    const readyTranslation = rawTranslation;

    const uiLang = this.settings?.interfaceLanguage || 'en';
    const highlightedContext = this.highlightWordInContext(contextSentence, word);
    const dictUrls = this.getExternalDictUrls(word, activeLang, this.settings?.nativeLanguage);
    const initialTranslationHtml = readyTranslation ? this.formatTranslationHtml(readyTranslation) : t('translating', uiLang);
    const translationLines = readyTranslation ? readyTranslation.split('\n').map((l) => l.trim()).filter(Boolean) : [];
    const glassMainTranslation = translationLines[0] || (readyTranslation || t('translating', uiLang));
    const glassSubDefinition = translationLines.slice(1).join('\n');

    const currentTheme = this.settings?.popupTheme === 'calm_light' ? 'calm_light' : 'glass';
    this.popupCard.className = `lectura-word-card ${currentTheme}`;

    const statusToSlider: Record<string, number> = {
      '0': 0, 'ignored': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, 'known': 6, 'new': 1
    };
    const sliderToStatus: Record<number, string> = {
      0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: 'known'
    };
    const currentSliderVal = statusToSlider[wordInfo.status || 'new'] ?? 1;

    if (currentTheme === 'glass' || currentTheme === 'calm_light') {
      this.popupCard.className = currentTheme === 'calm_light' 
        ? 'lectura-word-card theme-calm-light calm_light' 
        : 'lectura-word-card theme-glass-v2 glass';
      // THEME 3 (Modern Glass) & THEME 4 (Calm Light) Layout
      this.popupCard.innerHTML = `
        <!-- Top Tab Bar -->
        <div class="glass-tabs-header">
          <div class="glass-tabs-list">
            <button type="button" class="glass-tab active" data-tab="meaning">${t('tab_meaning', uiLang)}</button>
            <button type="button" class="glass-tab" data-tab="ai">✨ AI</button>
            <button type="button" class="glass-tab" data-tab="definition">${t('tab_definition', uiLang)}</button>
            <button type="button" class="glass-tab" data-tab="usage">${t('tab_usage', uiLang)}</button>
            <button type="button" class="glass-tab" data-tab="dictionaries">${t('tab_dicts', uiLang)}</button>
            <button type="button" class="glass-tab" data-tab="baseroot">${t('tab_root', uiLang)}</button>
          </div>
          <button type="button" class="glass-btn-close lectura-card-close" title="Close (Esc)">✕</button>
        </div>

        <!-- Header: Word + Language + Speaker -->
        <div class="glass-word-row">
          <h1 class="glass-word-title">${word}</h1>
          <div class="glass-word-meta">
            ${wordInfo.isAutoIgnored ? `
              <span class="lectura-ignore-badge" title="${wordInfo.ignoreBadge || 'Ignored'}" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.5); color: #d97706;">
                <span>${wordInfo.ignoreIcon || '🏙️'}</span>
                <span>${wordInfo.ignoreBadge || 'Ignore: ' + wordInfo.ignoreCategory}</span>
              </span>
            ` : ''}
            <span class="glass-lang-tag lectura-card-dialect-badge" title="Dialect: ${currentDialect.name} (${currentDialect.code})">${activeLang} | ${dialectLabel}</span>
            <button type="button" class="glass-btn-sound lectura-card-tts" title="Audio">🔊</button>
          </div>
        </div>

        <!-- Tab Pane: Meaning -->
        <div class="glass-tab-pane active" data-pane="meaning">
          <!-- Translation Input -->
          <div class="translation-input-wrap" style="margin-bottom: 10px;">
            <input 
              type="text" 
              value="${glassMainTranslation}" 
              placeholder="${t('custom_meaning_placeholder', uiLang)}"
              class="calm-meaning-input lectura-meaning-input"
              style="width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 10px; border: 1px solid rgba(226, 232, 240, 0.9); font-weight: 700; font-size: 14px; outline: none; background: #ffffff; color: #0f172a;"
            />
          </div>

          <!-- Usage Context -->
          <div class="glass-example-card-full">
            <span class="glass-example-caption">${t('tab_usage', uiLang)}:</span>
            <p class="glass-example-phrase">${highlightedContext}</p>
          </div>
        </div>

        <!-- Tab Pane: AI Breakdown -->
        <div class="glass-tab-pane" data-pane="ai">
          <div class="glass-example-card-full ai-explainer-card">
            <div class="ai-explainer-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #0284c7;">
                <span>✨</span>
                <span>AI Context & Grammar Breakdown</span>
                <span class="ai-grammar-badge" style="display: none; padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1;"></span>
              </div>
              <button type="button" class="ai-btn-refresh" title="Regenerate AI explanation" style="background: none; border: none; cursor: pointer; font-size: 13px; color: #64748b; padding: 2px 4px; border-radius: 4px;">🔄</button>
            </div>

            <!-- AI Loading State -->
            <div class="ai-loading-box" style="display: none; padding: 12px 4px;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #0284c7; font-weight: 600;">
                <span class="ai-spinner" style="display: inline-block;">⏳</span>
                <span>AI is analyzing context & grammar...</span>
              </div>
              <div style="margin-top: 8px; height: 8px; border-radius: 4px; background: rgba(226, 232, 240, 0.8); width: 90%;"></div>
              <div style="margin-top: 6px; height: 8px; border-radius: 4px; background: rgba(226, 232, 240, 0.6); width: 70%;"></div>
            </div>

            <!-- AI Error State -->
            <div class="ai-error-box" style="display: none; padding: 8px 0; text-align: center;">
              <p class="ai-error-text" style="font-size: 12px; color: #ef4444; margin-bottom: 6px;"></p>
              <button type="button" class="ai-btn-retry" style="background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; border-radius: 6px; padding: 3px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer;">Retry</button>
            </div>

            <!-- AI Content View -->
            <div class="ai-content-box" style="display: none;">
              <p class="ai-relation-text" style="font-size: 13px; line-height: 1.55; margin: 0 0 8px 0; white-space: pre-line;"></p>
              
              <div class="ai-examples-container" style="display: none; padding-top: 6px;">
                <span style="font-size: 11px; font-weight: 700; color: #64748b; display: block; margin-bottom: 4px;">📚 Context Examples:</span>
                <div class="ai-examples-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
              </div>
            </div>

            <!-- AI Initial Empty State -->
            <div class="ai-empty-box" style="text-align: center; padding: 12px 6px;">
              <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
                Get in-depth grammatical nuances, idiom origins, and contextual meaning from AI.
              </p>
              <button type="button" class="ai-btn-fetch" style="background: linear-gradient(135deg, #0284c7, #4f46e5); color: white; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);">
                <span>✨</span>
                <span>Explain with AI</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Tab Pane: Definition -->
        <div class="glass-tab-pane" data-pane="definition">
          <div class="glass-example-card-full">
            <span class="glass-example-caption">📖 ${uiLang === 'ru' ? 'Определение' : 'Definition'} (${destLangName}):</span>
            <p class="mono-def-text" style="margin: 4px 0 0 0; font-size: 13.5px; line-height: 1.5; color: #334155;">${cachedLocalizedDef || glassSubDefinition || glassMainTranslation || 'No definition available.'}</p>
          </div>
        </div>

        <!-- Tab Pane: Usage -->
        <div class="glass-tab-pane" data-pane="usage">
          <div class="glass-example-card-full">
            <span class="glass-example-caption">📚 Examples (Tatoeba) & Context:</span>
            <div class="lectura-tatoeba-list" style="margin-top: 6px;">
              <div class="lectura-extended-pane-inner">Loading examples from Tatoeba...</div>
            </div>
          </div>
        </div>

        <!-- Tab Pane: Dictionaries -->
        <div class="glass-tab-pane" data-pane="dictionaries">
          <div class="glass-example-card-full">
            <span class="glass-example-caption">📖 External Dictionaries:</span>
            <div class="glass-dict-grid">
              <a href="${dictUrls.cambridge}" target="_blank" rel="noopener noreferrer" class="glass-dict-btn">Cambridge ↗</a>
              <a href="${dictUrls.wiktionary}" target="_blank" rel="noopener noreferrer" class="glass-dict-btn">Wiktionary ↗</a>
              <a href="${dictUrls.reverso}" target="_blank" rel="noopener noreferrer" class="glass-dict-btn">Reverso ↗</a>
            </div>
          </div>
        </div>

        <!-- Tab Pane: Base Root -->
        <div class="glass-tab-pane" data-pane="baseroot">
          <div class="root-card-inner glass-example-card-full" style="padding: 12px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div class="root-header-label" style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>🌱</span> Base Root & Morphology:
            </div>

            <div class="root-input-action-row" style="display: flex; gap: 8px; margin-bottom: 10px;">
              <div class="root-input-box" style="flex: 1; display: flex; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 4px 8px; gap: 6px;">
                <span>🔗</span>
                <input 
                  type="text" 
                  placeholder="${t('base_root_placeholder', uiLang)}" 
                  class="calm-root-field lectura-lemma-input"
                  id="root-input-field"
                  value="${existingParent || ''}"
                  style="width: 100%; border: none; background: transparent; outline: none; font-size: 13px; color: #0f172a;"
                />
              </div>
              <button type="button" class="btn-link calm-btn-link lectura-lemma-btn-link" id="btn-link-root" style="background: #2563eb; color: #ffffff; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer;">${t('btn_link', uiLang)}</button>
            </div>

            <!-- Suggestions -->
            <div class="root-suggestions-row" id="suggestions-container" style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; font-size: 11px; ${suggestedLemmas.length > 0 ? '' : 'display: none;'}">
              <span class="suggestions-label" style="color: #64748b; font-weight: 600; letter-spacing: 0.3px;">💡 ${t('suggestions_label', uiLang)}:</span>
              <div class="suggestions-chips" style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${suggestedLemmas.map((sug) => `<button type="button" class="suggestion-chip lectura-lemma-chip" data-root="${sug}" data-lemma="${sug}" style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 600; cursor: pointer;">${sug}</button>`).join('')}
              </div>
            </div>

            <!-- Current Linked Root -->
            <div class="current-root-status" style="margin-top: 10px; font-size: 12px; color: #475569;">
              Current Base Root: <strong class="current-root-name" id="current-root-name" style="color: #0284c7; text-decoration: underline;">${existingParent || '—'}</strong>
            </div>
          </div>
        </div>

        <!-- Segmented Status Capsule Bar -->
        <div class="status-capsule-bar" style="margin-top: 10px;">
          <button type="button" class="cap-btn cap-ignore ${wordInfo.status === '0' || wordInfo.status === 'ignored' ? 'active' : ''}" data-status="0" title="${t('status_ignored', uiLang)} (0)">🚫</button>
          <button type="button" class="cap-btn cap-1 ${wordInfo.status === '1' ? 'active' : ''}" data-status="1" title="Hard (1)">1</button>
          <button type="button" class="cap-btn cap-2 ${wordInfo.status === '2' ? 'active' : ''}" data-status="2" title="Remembering (2)">2</button>
          <button type="button" class="cap-btn cap-3 ${wordInfo.status === '3' ? 'active' : ''}" data-status="3" title="Intermediate (3)">3</button>
          <button type="button" class="cap-btn cap-4 ${wordInfo.status === '4' ? 'active' : ''}" data-status="4" title="Advanced (4)">4</button>
          <button type="button" class="cap-btn cap-5 ${wordInfo.status === '5' ? 'active' : ''}" data-status="5" title="Mastered (5)">5</button>
          <button type="button" class="cap-btn cap-known ${wordInfo.status === 'known' ? 'active' : ''}" data-status="known" title="${t('status_known', uiLang)} (K)">✓</button>
        </div>
        </div>
      `;
    } else if (currentTheme === 'extended') {
      this.popupCard.className = 'lectura-word-card extended';
      this.popupCard.innerHTML = `
        <!-- Top Tab Navigation Bar -->
        <div class="lectura-extended-tabs">
          <div class="lectura-tab-nav">
            <button type="button" class="lectura-tab-btn active" data-tab="definition">[ Definition (${destLangName}) ]</button>
            <button type="button" class="lectura-tab-btn" data-tab="ai">[ ✨ AI ]</button>
            <button type="button" class="lectura-tab-btn" data-tab="usage">[ Usage ]</button>
            <button type="button" class="lectura-tab-btn" data-tab="etymology">[ Etymology ]</button>
            <button type="button" class="lectura-tab-btn" data-tab="pronunciation">[ Pronunciation ]</button>
          </div>
          <button type="button" class="lectura-card-close" title="Close (Esc)">✕</button>
        </div>

          <!-- Tab Pane: Definition -->
          <div class="lectura-tab-pane active" data-pane="definition">
            <div class="lectura-extended-header">
              <div class="lectura-word-title-group">
                <h2 class="lectura-extended-word">${word}</h2>
                ${wordInfo.ipa ? `<span class="lectura-extended-ipa">[${wordInfo.ipa}]</span>` : ''}
              </div>
              <div class="lectura-extended-badges">
                ${wordInfo.isAutoIgnored ? `
                  <button type="button" class="lectura-dialect-pill" style="border-color: rgba(245, 158, 11, 0.5); color: #d97706; background: rgba(245, 158, 11, 0.12); font-weight: 700;">
                    ${wordInfo.ignoreIcon || '🏙️'} ${wordInfo.ignoreBadge || 'Ignore: ' + wordInfo.ignoreCategory}
                  </button>
                ` : ''}
                <button type="button" class="lectura-dialect-pill lectura-card-dialect-badge" title="Dialect: ${currentDialect.name} (${currentDialect.code})">${activeLang} | ${dialectLabel}</button>
                <button type="button" class="lectura-card-tts" title="Pronounce">🔊</button>
              </div>
            </div>

            <!-- Primary Translation & Secondary Synonyms -->
            <div class="lectura-card-translation">${initialTranslationHtml}</div>

            <!-- Context Block with Badges -->
            <div class="lectura-extended-context-block">
              <div class="lectura-context-title">Пример использования:</div>
              <div class="lectura-context-body">
                <div class="lectura-context-text">${highlightedContext}</div>
                <div class="lectura-status-badges-row">
                  <button class="status-btn st-0 ${wordInfo.status === '0' || wordInfo.status === 'ignored' ? 'active' : ''}" data-status="0" title="Ignore (0)">🚫</button>
                  <button class="status-btn st-1 ${wordInfo.status === '1' ? 'active' : ''}" data-status="1" title="Stage 1">1</button>
                  <button class="status-btn st-2 ${wordInfo.status === '2' ? 'active' : ''}" data-status="2" title="Stage 2">2</button>
                  <button class="status-btn st-3 ${wordInfo.status === '3' ? 'active' : ''}" data-status="3" title="Stage 3">3</button>
                  <button class="status-btn st-4 ${wordInfo.status === '4' ? 'active' : ''}" data-status="4" title="Stage 4">4</button>
                  <button class="status-btn st-5 ${wordInfo.status === '5' ? 'active' : ''}" data-status="5" title="Stage 5">5</button>
                  <button class="status-btn st-known ${wordInfo.status === 'known' ? 'active' : ''}" data-status="known" title="Known (K)">✔️</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab Pane: AI Explanation -->
          <div class="lectura-tab-pane" data-pane="ai">
            <div class="ai-explainer-card">
              <div class="ai-explainer-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #38bdf8;">
                  <span>✨</span>
                  <span>AI Context & Grammar Breakdown</span>
                  <span class="ai-grammar-badge" style="display: none; padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8;"></span>
                </div>
                <button type="button" class="ai-btn-refresh" title="Regenerate AI explanation" style="background: none; border: none; cursor: pointer; font-size: 13px; color: #94a3b8; padding: 2px 4px; border-radius: 4px;">🔄</button>
              </div>

              <!-- AI Loading State -->
              <div class="ai-loading-box" style="display: none; padding: 12px 4px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #38bdf8; font-weight: 600;">
                  <span class="ai-spinner" style="display: inline-block;">⏳</span>
                  <span>AI is analyzing context & grammar...</span>
                </div>
                <div style="margin-top: 8px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.1); width: 90%;"></div>
                <div style="margin-top: 6px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); width: 70%;"></div>
              </div>

              <!-- AI Error State -->
              <div class="ai-error-box" style="display: none; padding: 8px 0; text-align: center;">
                <p class="ai-error-text" style="font-size: 12px; color: #f87171; margin-bottom: 6px;"></p>
                <button type="button" class="ai-btn-retry" style="background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 6px; padding: 3px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer;">Retry</button>
              </div>

              <!-- AI Content View -->
              <div class="ai-content-box" style="display: none;">
                <p class="ai-relation-text" style="font-size: 13px; line-height: 1.55; color: #e2e8f0; margin: 0 0 8px 0; white-space: pre-line;"></p>
                
                <div class="ai-examples-container" style="display: none; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                  <span style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">📚 Context Examples:</span>
                  <div class="ai-examples-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
                </div>
              </div>

              <!-- AI Initial Empty State -->
              <div class="ai-empty-box" style="text-align: center; padding: 12px 6px;">
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">
                  Get in-depth grammatical nuances, idiom origins, and contextual meaning from AI.
                </p>
                <button type="button" class="ai-btn-fetch" style="background: linear-gradient(135deg, #0284c7, #4f46e5); color: white; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);">
                  <span>✨</span>
                  <span>Explain with AI</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Tab Pane: Usage (Tatoeba Examples) -->
          <div class="lectura-tab-pane" data-pane="usage">
            <div class="lectura-card-tatoeba-section" style="margin-bottom: 12px;">
              <div class="lectura-tatoeba-title">📚 Examples (Tatoeba)</div>
              <div class="lectura-tatoeba-list">
                <div class="lectura-extended-pane-inner">Loading examples from Tatoeba...</div>
              </div>
            </div>
          </div>

          <!-- Tab Pane: Etymology (Morphology & Base Roots) -->
          <div class="lectura-tab-pane" data-pane="etymology">
            <div class="lectura-extended-context-block">
              <div class="lectura-context-title">🌱 Base Root & Related Forms:</div>
              <div class="lectura-extended-pane-inner">
                Base Root: <b style="color: #38bdf8;">${existingParent || word}</b>
                ${
                  suggestedLemmas.length > 0
                    ? `
                  <div class="lectura-lemma-chips" style="margin-top: 8px;">
                    ${suggestedLemmas.map((lem) => `<button type="button" class="lectura-lemma-chip" data-lemma="${lem}">${lem}</button>`).join('')}
                  </div>
                `
                    : ''
                }
              </div>
            </div>
          </div>

          <!-- Tab Pane: Pronunciation -->
          <div class="lectura-tab-pane" data-pane="pronunciation">
            <div class="lectura-extended-context-block">
              <div class="lectura-context-title">🗣️ Phonetics & Dialect:</div>
              <div class="lectura-extended-pane-inner" style="display: flex; flex-direction: column; gap: 8px;">
                <div>Phonetic transcription: <b style="color: #38bdf8;">${wordInfo.ipa ? `[${wordInfo.ipa}]` : `Standard ${activeLang}`}</b></div>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                  <button type="button" class="lectura-btn lectura-card-tts" style="flex: 1; border-radius: 8px; padding: 6px 10px;">🔊 Play Voice</button>
                  <button type="button" class="lectura-btn lectura-card-dialect-badge" style="flex: 1; border-radius: 8px; padding: 6px 10px;">Switch: ${currentDialect.label}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Row: Rating Slider + Base Root & Dict Links -->
          <div class="lectura-extended-bottom-grid">
            <div class="lectura-proficiency-card">
              <div class="lectura-proficiency-header">
                <span class="lectura-rating-label">Rating</span>
                <input type="range" class="lectura-proficiency-slider" min="0" max="6" value="${currentSliderVal}" />
              </div>
              <div class="lectura-proficiency-sub">Proficiency</div>
            </div>

            <div class="lectura-extended-tools-card">
              <div class="lectura-lemma-input-row">
                <span class="lectura-lemma-icon">🔗</span>
                <input type="text" class="lectura-lemma-input" placeholder="Base root (e.g. ${suggestedLemmas[0] || 'root'})..." value="${existingParent}" />
                <button type="button" class="lectura-lemma-btn-link" title="Link to base root">Link</button>
              </div>
              <div class="lectura-card-dict-bar" style="margin-top: 0; padding-top: 0; border-top: none;">
                <a href="${dictUrls.cambridge}" target="_blank" rel="noopener noreferrer" class="lectura-dict-btn" title="Open Cambridge">Cambridge ↗</a>
                <a href="${dictUrls.wiktionary}" target="_blank" rel="noopener noreferrer" class="lectura-dict-btn" title="Open Wiktionary">Wiktionary ↗</a>
              </div>
            </div>
          </div>
        `;
      } else {
      // Compact Theme layout
      this.popupCard.innerHTML = `
        <div class="lectura-card-header">
          <div class="lectura-card-header-left">
            <span class="lectura-card-word">${word}</span>
            <button class="lectura-card-tts" title="Pronounce">🔊</button>
            <button type="button" class="lectura-card-ai-btn" title="Explain with AI" style="background: linear-gradient(135deg, #0284c7, #4f46e5); color: white; border: none; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 4px;">✨ AI</button>
            <button class="lectura-card-dialect-badge" title="Dialect: ${currentDialect.name} (${currentDialect.code})">${dialectLabel}</button>
            ${wordInfo.isAutoIgnored ? `
              <span class="lectura-ignore-badge" title="${wordInfo.ignoreBadge || 'Ignored'}" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 9999px; font-size: 10px; font-weight: 700; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.5); color: #f59e0b; margin-left: 4px;">
                <span>${wordInfo.ignoreIcon || '🏙️'}</span>
                <span>${wordInfo.ignoreBadge || 'Ignore: ' + wordInfo.ignoreCategory}</span>
              </span>
            ` : ''}
            ${lemmaDisplay ? `<span class="lectura-card-lemma">${lemmaDisplay}</span>` : ''}
            <span class="lectura-card-ipa">${wordInfo.ipa ? `[${wordInfo.ipa}]` : ''}</span>
            <span class="lectura-card-lang" style="font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 2px 6px; border-radius: 4px; color: #38bdf8;">${activeLang}</span>
          </div>
          <button class="lectura-card-close" title="Close (Esc)">✕</button>
        </div>
        <div class="lectura-card-translation">${initialTranslationHtml}</div>

        <!-- Compact AI Breakdown Drawer -->
        <div class="compact-ai-box" style="display: none; margin: 8px 0;">
          <div class="ai-explainer-card" style="padding: 10px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px;">
            <div class="ai-explainer-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #38bdf8;">
                <span>✨ AI Breakdown</span>
                <span class="ai-grammar-badge" style="display: none; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8;"></span>
              </div>
              <button type="button" class="ai-btn-refresh" title="Regenerate" style="background: none; border: none; cursor: pointer; font-size: 12px; color: #94a3b8;">🔄</button>
            </div>
            <div class="ai-loading-box" style="display: none; padding: 8px 2px; font-size: 11px; color: #38bdf8;">
              <span class="ai-spinner">⏳</span> AI is analyzing context & grammar...
            </div>
            <div class="ai-error-box" style="display: none; padding: 6px 0; text-align: center;">
              <p class="ai-error-text" style="font-size: 11px; color: #f87171; margin-bottom: 4px;"></p>
              <button type="button" class="ai-btn-retry" style="background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 4px; padding: 2px 8px; font-size: 10.5px;">Retry</button>
            </div>
            <div class="ai-content-box" style="display: none;">
              <p class="ai-relation-text" style="font-size: 12px; line-height: 1.45; color: #e2e8f0; margin: 0 0 6px 0; white-space: pre-line;"></p>
              <div class="ai-examples-container" style="display: none; padding-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div class="ai-examples-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
              </div>
            </div>
            <div class="ai-empty-box" style="text-align: center; padding: 6px 2px;">
              <button type="button" class="ai-btn-fetch" style="background: linear-gradient(135deg, #0284c7, #4f46e5); color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">✨ Explain with AI</button>
            </div>
          </div>
        </div>

        <div class="lectura-card-context">“${highlightedContext}”</div>

        <!-- Tatoeba Examples Section (Language Reactor Style) -->
        <div class="lectura-card-tatoeba-section" style="display: none;">
          <div class="lectura-tatoeba-title">📚 Examples (Tatoeba)</div>
          <div class="lectura-tatoeba-list"></div>
        </div>

        <!-- Lemma Selection / Linking Section -->
        <div class="lectura-card-lemma-section">
          <div class="lectura-lemma-input-row">
            <span class="lectura-lemma-icon">🔗</span>
            <input type="text" class="lectura-lemma-input" placeholder="Base root (e.g. ${suggestedLemmas[0] || 'root'})..." value="${existingParent}" />
            <button type="button" class="lectura-lemma-btn-link" title="Link to base root">Link</button>
          </div>
          ${
            suggestedLemmas.length > 0
              ? `
            <div class="lectura-lemma-chips">
              ${suggestedLemmas.map((lem) => `<button type="button" class="lectura-lemma-chip" data-lemma="${lem}">${lem}</button>`).join('')}
            </div>
          `
              : ''
          }
        </div>

        <!-- Learning Status 1-5 & Known Buttons -->
        <div class="lectura-card-actions">
          <button class="lectura-btn lectura-btn-ignore ${wordInfo.status === '0' || wordInfo.status === 'ignored' ? 'active' : ''}" data-status="0" title="Ignore (0)">🚫</button>
          <button class="lectura-btn lectura-btn-stage ${wordInfo.status === '1' ? 'active' : ''}" data-status="1" title="Learning Stage 1 (1)">1</button>
          <button class="lectura-btn lectura-btn-stage ${wordInfo.status === '2' ? 'active' : ''}" data-status="2" title="Learning Stage 2 (2)">2</button>
          <button class="lectura-btn lectura-btn-stage ${wordInfo.status === '3' ? 'active' : ''}" data-status="3" title="Learning Stage 3 (3)">3</button>
          <button class="lectura-btn lectura-btn-stage ${wordInfo.status === '4' ? 'active' : ''}" data-status="4" title="Learning Stage 4 (4)">4</button>
          <button class="lectura-btn lectura-btn-stage ${wordInfo.status === '5' ? 'active' : ''}" data-status="5" title="Learning Stage 5 (5)">5</button>
          <button class="lectura-btn lectura-btn-known ${wordInfo.status === 'known' ? 'active' : ''}" data-status="known" title="Mark Known (K)">✔️</button>
        </div>

        <!-- Quick External Dictionaries Bar -->
        <div class="lectura-card-dict-bar">
          <a href="${dictUrls.cambridge}" target="_blank" rel="noopener noreferrer" class="lectura-dict-btn" title="Open Cambridge Dictionary">Cambridge ↗</a>
          <a href="${dictUrls.wiktionary}" target="_blank" rel="noopener noreferrer" class="lectura-dict-btn" title="Open Wiktionary">Wiktionary ↗</a>
        </div>
      `;
    }

    // Display first to allow DOM dimensions measurement, then position accurately
    this.popupCard.style.display = 'block';
    this.positionPopupCard(targetToken);

    // Tab switching for Extended and Glass themes
    this.popupCard.querySelectorAll('.lectura-tab-btn, .glass-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabName = tabBtn.getAttribute('data-tab');
        this.popupCard?.querySelectorAll('.lectura-tab-btn, .glass-tab').forEach((b) => b.classList.remove('active'));
        this.popupCard?.querySelectorAll('.lectura-tab-pane, .glass-tab-pane').forEach((p) => p.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetPane = this.popupCard?.querySelector(`.lectura-tab-pane[data-pane="${tabName}"], .glass-tab-pane[data-pane="${tabName}"]`);
        targetPane?.classList.add('active');

        if (tabName === 'ai') {
          this.fetchAiBreakdown(word, contextSentence);
        } else if (tabName === 'definition') {
          this.fetchLocalizedDefinition(word, activeLang, nativeLang, contextSentence);
        }
      });
    });

    // AI Explainer Interactive Buttons
    this.popupCard.querySelectorAll('.ai-btn-fetch, .ai-btn-retry').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fetchAiBreakdown(word, contextSentence, true);
      });
    });

    this.popupCard.querySelectorAll('.ai-btn-refresh').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fetchAiBreakdown(word, contextSentence, true);
      });
    });

    // Compact AI Button & Drawer Toggle
    const compactAiBtn = this.popupCard.querySelector('.lectura-card-ai-btn');
    compactAiBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const compactAiBox = this.popupCard?.querySelector<HTMLElement>('.compact-ai-box');
      if (compactAiBox) {
        compactAiBox.style.display = compactAiBox.style.display === 'none' ? 'block' : 'none';
        if (compactAiBox.style.display === 'block') {
          this.fetchAiBreakdown(word, contextSentence);
        }
      }
    });

    // Multi-word phrase or phrasal verb auto-prefetch
    if (word.trim().includes(' ') || this.isPhraseSelecting) {
      this.fetchAiBreakdown(word, contextSentence);
    }

    // Rating Slider interaction (syncs with status buttons)
    const slider = this.popupCard.querySelector('.lectura-proficiency-slider, .glass-neon-slider') as HTMLInputElement | null;
    slider?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseInt(slider.value, 10);
      const targetStatus = sliderToStatus[val] || '1';
      this.popupCard?.querySelectorAll('[data-status]').forEach((btn) => {
        if (btn.getAttribute('data-status') === targetStatus) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });

    slider?.addEventListener('change', async (e) => {
      e.stopPropagation();
      const val = parseInt(slider.value, 10);
      const targetStatus = sliderToStatus[val] || '1';
      const translationText = this.getCurrentPopupTranslation(word);
      await this.saveWordToLectura(word, translationText, targetStatus, contextSentence);
      this.showToast(`Saved status: ${targetStatus}`, 'success');
    });

    // Close button
    this.popupCard.querySelectorAll('.lectura-card-close, .glass-btn-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.closeWordCard();
      });
    });

    // Lemma linking logic
    const linkLemma = async (parentLemma: string) => {
      const cleanParent = parentLemma.trim().toLowerCase();
      if (!cleanParent || cleanParent === word.toLowerCase()) return;

      try {
        const linkRes = await this.apiClient.saveWordLink({
          wordFrom: word,
          wordTo: cleanParent,
          language: activeLang,
        });

        if (!this.cachedWordLinksByLang[langCode]) {
          this.cachedWordLinksByLang[langCode] = {};
        }
        this.cachedWordLinksByLang[langCode][word.toLowerCase()] = cleanParent;

        // If parent has a known status, inherit it immediately across ALL occurrences in subtitles & transcript
        const rawInherited = linkRes?.parentStatus ?? (this.cachedWordsByLang[langCode] || {})[cleanParent]?.status;
        if (rawInherited !== undefined && rawInherited !== null) {
          const s = String(rawInherited).toLowerCase().trim();
          const inheritedStatus = ['known', 'known_completely', 'well_known', '5'].includes(s)
            ? 'known'
            : ['ignored', 'ignore', '0'].includes(s)
              ? 'ignored'
              : s;

          if (!this.cachedWordsByLang[langCode]) {
            this.cachedWordsByLang[langCode] = {};
          }
          const transToKeep =
            readyTranslation ||
            (this.cachedWordsByLang[langCode] || {})[word.toLowerCase()]?.translation ||
            (this.cachedWordsByLang[langCode] || {})[cleanParent]?.translation ||
            '';

          this.cachedWordsByLang[langCode][word.toLowerCase()] = {
            status: inheritedStatus,
            translation: transToKeep,
          };
          if (!this.cachedWordsByLang[langCode][cleanParent]) {
            this.cachedWordsByLang[langCode][cleanParent] = {
              status: inheritedStatus,
              translation: transToKeep,
            };
          }
          await StorageService.updateCachedWord(langCode, word.toLowerCase(), {
            status: inheritedStatus,
            translation: transToKeep,
          });

          // Highlight active status button in open popup card
          this.popupCard?.querySelectorAll('[data-status]').forEach((btn) => {
            const btnStatus = btn.getAttribute('data-status');
            btn.classList.toggle(
              'active',
              btnStatus === inheritedStatus || (inheritedStatus === 'ignored' && btnStatus === '0')
            );
          });
        }

        this.refreshAllVisibleWordTokens();
        this.updateFloatingPillAndTranscript();

        const currentRootEl = this.popupCard?.querySelector('.current-root-name, #current-root-name');
        if (currentRootEl) currentRootEl.textContent = cleanParent;

        const lemmaInput = this.popupCard?.querySelector('.lectura-lemma-input, #root-input-field') as HTMLInputElement | null;
        if (lemmaInput) lemmaInput.value = cleanParent;

        this.showToast(`✓ Linked "${word}" ➔ "${cleanParent}"`, 'success');
      } catch (err: any) {
        this.showToast(`Failed to link: ${err?.message || 'Error'}`, 'error');
      }
    };

    // Suggestion chips click: fill input and focus
    this.popupCard.querySelectorAll('.lectura-suggestion-chip, .lectura-lemma-chip, .suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLemma = chip.getAttribute('data-root') || chip.getAttribute('data-lemma') || chip.textContent?.trim() || '';
        if (targetLemma) {
          const input = this.popupCard?.querySelector('.lectura-lemma-input, #root-input-field, .glass-root-input, .calm-root-field') as HTMLInputElement | null;
          if (input) {
            input.value = targetLemma;
            input.focus();
          }
        }
      });
    });

    // Link button click
    this.popupCard.querySelectorAll('.lectura-lemma-btn-link, #btn-link-root, .glass-link-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = this.popupCard?.querySelector('.lectura-lemma-input, #root-input-field, .glass-root-input, .calm-root-field') as HTMLInputElement | null;
        if (input?.value) linkLemma(input.value);
      });
    });

    // Enter key in lemma input
    const lemmaInput = this.popupCard.querySelector('.lectura-lemma-input, #root-input-field, .glass-root-input, .calm-root-field') as HTMLInputElement | null;
    lemmaInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (lemmaInput.value) linkLemma(lemmaInput.value);
      }
    });

    // TTS button next to word
    this.popupCard.querySelectorAll('.lectura-card-tts, .glass-btn-sound').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playTts(word, currentDialect.code);
      });
    });

    // Dialect switcher button (cycles through language dialects e.g. MX -> ES -> US -> AR -> MX)
    this.popupCard.querySelectorAll('.lectura-card-dialect-badge, .lectura-dialect-pill, .glass-lang-tag').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentIndex = dialects.findIndex((d) => d.code === currentDialect.code);
        const nextIndex = (currentIndex + 1) % dialects.length;
        currentDialect = dialects[nextIndex];
        this.activeDialectByLang[langCode] = currentDialect.code;
        if (this.settings) this.settings.ttsDialect = currentDialect.code;
        await StorageService.saveSettings({ ttsDialect: currentDialect.code });
        await chrome.storage.local.set({ [`lectura_tts_dialect_${langCode}`]: currentDialect.code });

        const dialectEl = btn as HTMLElement;
        dialectEl.textContent = `${activeLang} | ${currentDialect.label}`;
        dialectEl.title = `Dialect: ${currentDialect.name} (${currentDialect.code})`;

        this.showToast(`Dialect: ${currentDialect.name} (${currentDialect.label})`);
        this.playTts(word, currentDialect.code);
      });
    });

    // Status Buttons
    const buttons = this.popupCard.querySelectorAll('[data-status]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.getAttribute('data-status') || '1';
        const translationText = this.getCurrentPopupTranslation(word);

        await this.saveWordToLectura(word, translationText, newStatus, contextSentence);
        this.closeWordCard();
      });
    });

    // Save custom meaning when pressing Enter in meaning input
    const meaningInputEl = this.popupCard.querySelector<HTMLInputElement>('.calm-meaning-input, .lectura-meaning-input');
    meaningInputEl?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const customTrans = meaningInputEl.value.trim();
        const activeStatusBtn = this.popupCard?.querySelector('[data-status].active');
        const statusToSave =
          activeStatusBtn?.getAttribute('data-status') ||
          (wordInfo.status && wordInfo.status !== 'new' && wordInfo.status !== '0' ? wordInfo.status : '1');
        await this.saveWordToLectura(word, customTrans, statusToSave, contextSentence);
        this.closeWordCard();
      }
    });

    console.log('[Lectura Debug] Word clicked:', word);

    // Fetch and guarantee translation display
    if (!readyTranslation) {
      console.log('[Lectura Debug] Translation request starting for:', word);
      this.fetchDirectTranslation(word, nativeLang, langCode)
        .then(({ translationText, baseRoot }) => {
          console.log('[Lectura Debug] Translation response received:', { translationText, baseRoot });
          if (this.popupCard && this.activeWordData?.word.toLowerCase() === word.toLowerCase()) {
            const transText = translationText || '— (нет данных)';
            const lines = transText.split('\n').map((l) => l.trim()).filter(Boolean);

            // 1. Calm Light meaning input
            const meaningInput = this.popupCard.querySelector<HTMLInputElement>('.calm-meaning-input, .lectura-meaning-input');
            if (meaningInput && (!meaningInput.value || meaningInput.value.toLowerCase() === 'translating...')) {
              meaningInput.value = lines[0] || transText;
            }

            // 2. Compact translation element
            const transEl = this.popupCard.querySelector('.lectura-card-translation');
            if (transEl) {
              transEl.innerHTML = this.formatTranslationHtml(transText);
            }

            // 3. Glass / Extended main translation & sub definition
            const glassMain = this.popupCard.querySelector('.glass-main-translation');
            const glassSub = this.popupCard.querySelector('.glass-sub-definition, .mono-def-text');
            if (glassMain) {
              glassMain.textContent = lines[0] || '';
              if (glassSub && (!glassSub.textContent || glassSub.textContent.includes('No definition'))) {
                glassSub.textContent = lines.slice(1).join('\n') || lines[0] || '';
              }
            }
          }
          if (translationText && translationText !== '—') {
            const lower = word.toLowerCase();
            if (!this.cachedWordsByLang[langCode]) {
              this.cachedWordsByLang[langCode] = {};
            }
            this.cachedWordsByLang[langCode][lower] = {
              status: this.cachedWordsByLang[langCode][lower]?.status || 'new',
              translation: translationText,
            };
            YouTubeLecturaOverlay.localTranslationCache.set(`${langCode}:${lower}`, translationText);
          }
        })
        .catch((err) => {
          console.warn('[Lectura Debug] Translation error caught:', err);
          if (this.popupCard && this.activeWordData?.word.toLowerCase() === word.toLowerCase()) {
            const meaningInput = this.popupCard.querySelector<HTMLInputElement>('.calm-meaning-input, .lectura-meaning-input');
            if (meaningInput && meaningInput.value.toLowerCase() === 'translating...') {
              meaningInput.value = '— (нет данных)';
            }
            const transEl = this.popupCard.querySelector('.lectura-card-translation');
            if (transEl) {
              transEl.innerHTML = '— (нет данных)';
            }
          }
        });
    }

    // Fetch Tatoeba example sentences asynchronously
    if (!word.includes(' ')) {
      this.fetchTatoebaExamples(word, activeLang, nativeLang)
        .then((examples) => {
          if (this.popupCard && this.activeWordData?.word.toLowerCase() === word.toLowerCase()) {
            const tatoebaSection = this.popupCard.querySelector('.lectura-card-tatoeba-section') as HTMLElement | null;
            const listEls = this.popupCard.querySelectorAll('.lectura-tatoeba-list');

            if (examples && examples.length > 0) {
              const html = examples
                .map(
                  (ex) => `
                  <div class="lectura-tatoeba-item">
                    <div class="lectura-tatoeba-src">${this.highlightWordInContext(ex.source, word)}</div>
                    ${ex.target ? `<div class="lectura-tatoeba-tgt">${this.escapeHtml(ex.target)}</div>` : ''}
                  </div>
                `
                )
                .join('');

              listEls.forEach((el) => {
                el.innerHTML = html;
              });
              if (tatoebaSection) {
                tatoebaSection.style.display = 'block';
              }
            } else {
              listEls.forEach((el) => {
                el.innerHTML = `<div class="lectura-extended-pane-inner" style="color: #94a3b8; font-style: italic; padding: 4px 0;">No Tatoeba examples found for "${this.escapeHtml(word)}".</div>`;
              });
            }
          }
        })
        .catch(() => {
          if (this.popupCard && this.activeWordData?.word.toLowerCase() === word.toLowerCase()) {
            const listEls = this.popupCard.querySelectorAll('.lectura-tatoeba-list');
            listEls.forEach((el) => {
              el.innerHTML = `<div class="lectura-extended-pane-inner" style="color: #94a3b8; font-style: italic; padding: 4px 0;">Could not load Tatoeba examples.</div>`;
            });
          }
        });
    }
    } catch (err) {
      console.error('[Lectura Extension] Failed to render popup:', err);
    }
  }

  /**
   * Calculates coordinates to place popup card cleanly above the entire subtitle container
   */
  private positionPopupCard(targetToken?: HTMLElement) {
    if (!this.popupCard) return;

    this.popupCard.style.display = 'block';
    this.popupCard.style.visibility = 'visible';
    this.popupCard.style.opacity = '1';
    this.popupCard.style.zIndex = '2147483647';
    this.popupCard.style.pointerEvents = 'auto';

    const player = (document.querySelector('#movie_player, .html5-video-player') as HTMLElement) || this.playerContainer;
    if (player) {
      this.playerContainer = player;
      if (this.overlayContainer && !player.contains(this.overlayContainer)) {
        player.appendChild(this.overlayContainer);
      }
    }

    const popupWidth = this.popupCard.offsetWidth || 440;
    const popupHeight = this.popupCard.offsetHeight || 390;

    if (targetToken && this.playerContainer) {
      const isFromSubtitleBox = Boolean(this.subtitleBox && this.subtitleBox.contains(targetToken));
      const tokenRect = targetToken.getBoundingClientRect();
      const containerRect = (isFromSubtitleBox && this.subtitleBox) ? this.subtitleBox.getBoundingClientRect() : tokenRect;
      // Use overlayContainer rect so docked sidebar width (350px in Fullscreen/Theater) is excluded!
      const boundsRect = this.overlayContainer ? this.overlayContainer.getBoundingClientRect() : this.playerContainer.getBoundingClientRect();

      // Горизонталь: центрируем относительно кликнутого слова внутри видимой области видео (слева от боковой панели)
      const tokenCenterRel = (tokenRect.left - boundsRect.left) + (tokenRect.width / 2);
      let leftRel = tokenCenterRel - (popupWidth / 2);
      leftRel = Math.max(16, Math.min(leftRel, boundsRect.width - popupWidth - 16));

      // Вертикаль: над блоком субтитров (или напротив строки транскрипта, но строго внутри верхней и нижней границ видео)
      let bottomRel = Math.max(16, (boundsRect.bottom - containerRect.top) + 12);
      if (!isFromSubtitleBox) {
        const desiredBottom = (boundsRect.bottom - tokenRect.top) - (popupHeight / 2);
        bottomRel = Math.max(72, desiredBottom);
      }
      const maxBottomRel = Math.max(16, boundsRect.height - popupHeight - 54);
      bottomRel = Math.min(bottomRel, maxBottomRel);

      this.popupCard.style.position = 'absolute';
      this.popupCard.style.left = `${Math.round(leftRel)}px`;
      this.popupCard.style.bottom = `${Math.round(bottomRel)}px`;
      this.popupCard.style.top = 'auto';
      this.popupCard.style.right = 'auto';
      this.popupCard.style.transform = 'none';
    } else if (this.playerContainer) {
      // Fallback center inside player
      this.popupCard.style.position = 'absolute';
      this.popupCard.style.top = 'auto';
      this.popupCard.style.bottom = '120px';
      this.popupCard.style.left = '50%';
      this.popupCard.style.transform = 'translateX(-50%)';
      this.popupCard.style.right = 'auto';
    }
  }

  private getTtsLanguageCode(preferredCode?: string): string {
    if (preferredCode) return preferredCode;
    const raw = (this.currentDetectedLanguage || this.settings?.targetLanguage || 'en').toLowerCase().trim();
    const langCode = normalizeLangCode(raw);
    const dialect = resolveDialect(langCode, this.activeDialectByLang[langCode] || this.settings?.ttsDialect);
    return dialect.code;
  }

  private async playTts(word: string, preferredDialect?: string) {
    const lang = this.getTtsLanguageCode(preferredDialect);
    const cleanWord = word.trim();
    if (!cleanWord) return;

    // 1. Try Google Translate TTS proxy via Lectura server (same voice as Lectura)
    try {
      const serverUrl = (this.settings?.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
      const audioUrl = `${serverUrl}/api/google-tts?text=${encodeURIComponent(cleanWord)}&lang=${lang}`;
      const audio = new Audio(audioUrl);
      await audio.play();
      return;
    } catch (_) {
      // 2. Direct Google Translate TTS endpoint fallback
      try {
        const directUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(cleanWord)}`;
        const audio = new Audio(directUrl);
        await audio.play();
        return;
      } catch (_) {}
    }

    // 3. Fallback to Web Speech API
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanWord);
        utterance.lang = lang;
        window.speechSynthesis.speak(utterance);
      }
    } catch (_) {}
  }

  /**
   * Captures a compressed JPEG snapshot from the current video frame
   */
  private captureVideoSnapshot(): string | undefined {
    if (this.settings && this.settings.captureVideoSnapshot === false) return undefined;
    if (!this.videoElement || this.videoElement.readyState < 2) return undefined;
    try {
      const video = this.videoElement;
      const canvas = document.createElement('canvas');
      const targetWidth = Math.min(480, video.videoWidth || 480);
      const scale = targetWidth / (video.videoWidth || 480);
      const targetHeight = Math.round((video.videoHeight || 270) * scale);

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('[Lectura Snapshot Error]:', e);
      return undefined;
    }
  }

  private getCurrentPopupTranslation(word?: string): string {
    if (!this.popupCard) return '';
    const meaningInput = this.popupCard.querySelector<HTMLInputElement>('.calm-meaning-input, .lectura-meaning-input');
    if (meaningInput && meaningInput.value.trim()) {
      return meaningInput.value.trim();
    }
    const transEl = this.popupCard.querySelector('.lectura-card-translation, .glass-main-translation');
    if (transEl && transEl.textContent?.trim()) {
      return transEl.textContent.trim();
    }
    if (word) {
      const cleanLower = cleanWordForTranslation(word);
      const lang = this.getEffectiveLang();
      return (
        YouTubeLecturaOverlay.localTranslationCache.get(`${lang}:${cleanLower}`) ||
        YouTubeLecturaOverlay.localTranslationCache.get(cleanLower) ||
        ''
      );
    }
    return '';
  }

  private async saveWordToLectura(word: string, translation: string, status: string, contextSentence: string) {
    try {
      const cleanLower = word.toLowerCase().trim();
      let translationToSave = translation?.trim() || '';

      // Strict validation: NEVER save loader or placeholder texts as translation
      const invalidPlaceholders = [
        'translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден',
        '[known]', '[ignored]', '[импорт с датой]', 'known', 'ignored',
      ];
      if (
        invalidPlaceholders.includes(translationToSave.toLowerCase()) ||
        (translationToSave.startsWith('[') && translationToSave.endsWith(']')) ||
        translationToSave.toLowerCase() === cleanLower
      ) {
        translationToSave = '';
      }

      let targetLang = this.getEffectiveLang();
      const activeLang = getLanguageDisplayName(targetLang);

      // If translationToSave is empty, check session translation cache (language-scoped first, then plain fallback)
      if (!translationToSave) {
        translationToSave =
          YouTubeLecturaOverlay.localTranslationCache.get(`${targetLang}:${cleanLower}`) ||
          YouTubeLecturaOverlay.localTranslationCache.get(cleanLower) ||
          (this.cachedWordsByLang[targetLang] || {})[cleanLower]?.translation ||
          '';
      }

      const isMultiWord = word.trim().includes(' ');
      const snapshotImage = this.captureVideoSnapshot();
      const activeSentenceObj =
        this.currentSentenceIndex >= 0 && this.currentSentenceIndex < this.preparsedSentences.length
          ? this.preparsedSentences[this.currentSentenceIndex]
          : undefined;

      await this.apiClient.saveWord({
        word,
        lemma: cleanLower,
        translation: translationToSave,
        grammar: this.activeWordData?.grammar,
        contextRelation: this.activeWordData?.contextRelation,
        status,
        contextSentence,
        sentence: contextSentence,
        targetLanguage: targetLang,
        language_code: targetLang,
        language: activeLang,
        language_id: activeLang,
        source_url: window.location.href,
        is_phrase: isMultiWord,
        imageUrl: snapshotImage,
        youtubeId: this.currentVideoId || undefined,
        cueStart: activeSentenceObj ? Math.round(activeSentenceObj.start * 100) / 100 : undefined,
        cueEnd: activeSentenceObj ? Math.round(activeSentenceObj.end * 100) / 100 : undefined,
        tags: isMultiWord ? ['phrase', 'youtube_extension'] : ['youtube_extension'],
      });

      // Update local cache strictly for this language (including any linked root / sibling forms)
      if (!this.cachedWordsByLang[targetLang]) {
        this.cachedWordsByLang[targetLang] = {};
      }
      this.cachedWordsByLang[targetLang][cleanLower] = { status, translation: translationToSave };
      if (translationToSave) {
        YouTubeLecturaOverlay.localTranslationCache.set(`${targetLang}:${cleanLower}`, translationToSave);
      }
      await StorageService.updateCachedWord(targetLang, cleanLower, { status, translation: translationToSave });

      const linkedParent = this.cachedWordLinksByLang[targetLang]?.[cleanLower];
      if (linkedParent && linkedParent !== cleanLower) {
        const parentTrans = this.cachedWordsByLang[targetLang][linkedParent]?.translation || translationToSave;
        this.cachedWordsByLang[targetLang][linkedParent] = { status, translation: parentTrans };
        await StorageService.updateCachedWord(targetLang, linkedParent, { status, translation: parentTrans });
      }
      const linksMap = this.cachedWordLinksByLang[targetLang] || {};
      const rootKey = linkedParent || cleanLower;
      for (const [childWord, parentWord] of Object.entries(linksMap)) {
        if (parentWord === rootKey && childWord !== cleanLower) {
          const childTrans = this.cachedWordsByLang[targetLang][childWord]?.translation || translationToSave;
          this.cachedWordsByLang[targetLang][childWord] = { status, translation: childTrans };
          await StorageService.updateCachedWord(targetLang, childWord, { status, translation: childTrans });
        }
      }

      this.refreshAllVisibleWordTokens();
      this.updateFloatingPillAndTranscript();
    } catch (err: any) {
      this.showToast(`Failed to save: ${err.message || 'Server error'}`, 'error');
    }
  }

  private toastTimeoutId: number | null = null;

  private showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    if (!this.toastElement) return;
    if (this.toastTimeoutId) {
      window.clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
    this.toastElement.textContent = message;
    this.toastElement.className = 'lectura-toast';
    if (type === 'error') {
      this.toastElement.classList.add('toast-error');
    } else if (type === 'success') {
      this.toastElement.classList.add('toast-success');
    }
    this.toastElement.classList.add('show');
    this.toastTimeoutId = window.setTimeout(() => {
      this.toastElement?.classList.remove('show');
      this.toastTimeoutId = null;
    }, 2800);
  }

  /**
   * Timeline-driven Atomic Subtitle Renderer (Strict Full Sentence Display)
   * If inside the same sentence (newIndex === currentSentenceIndex), DOES NOTHING to DOM!
   */
  public updateSubtitleOverlay(currentTime: number) {
    const isPopupOpen = Boolean(this.popupCard && this.popupCard.style.display !== 'none');
    if (this.isPhraseSelecting || this.isShiftDown || isPopupOpen) {
      return;
    }

    if (!this.preparsedSentences || this.preparsedSentences.length === 0) {
      if (
        this.currentVideoId &&
        !this.isLoadingSubtitles &&
        this.subtitleLoadAttempts < 5 &&
        Date.now() - this.lastSubtitleAttemptTime > 2500
      ) {
        this.loadFullVideoSubtitles(this.currentVideoId);
      }

      // Ensure YouTube CC button is activated so YouTube streams signed captions
      const ccBtn = document.querySelector<HTMLElement>('.ytp-subtitles-button');
      if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
        try {
          ccBtn.click();
        } catch (_) {}
      }

      // Live DOM caption fallback while full subtitle track is loading
      const domSegments = Array.from(document.querySelectorAll<HTMLElement>('.ytp-caption-segment'))
        .map((el) => el.textContent?.trim() || '')
        .filter(Boolean);
      const domText = deduplicateSubtitleSegments(domSegments);
      if (domText && domText !== this.currentSubtitleText) {
        this.currentSubtitleText = domText;
        this.renderSubtitleTokens(domText);
      } else if (!domText && this.currentSubtitleText) {
        this.currentSubtitleText = '';
        if (this.subtitleBox && this.subtitleBox.style.display !== 'none') {
          this.subtitleBox.style.display = 'none';
          this.subtitleBox.innerHTML = '';
        }
      }
      return;
    }

    // Fast O(1) check: if currentTime is still within the currently displayed sentence
    if (this.currentSentenceIndex >= 0 && this.currentSentenceIndex < this.preparsedSentences.length) {
      const curSent = this.preparsedSentences[this.currentSentenceIndex];
      const nextSent = this.preparsedSentences[this.currentSentenceIndex + 1];
      const effectiveEnd = nextSent ? Math.min(curSent.end, nextSent.start) : curSent.end;

      // Auto-Pause at end of current sentence (Language Reactor style [Q])
      if (
        this.autoPauseAfterSubtitle &&
        this.videoElement &&
        !this.videoElement.paused &&
        this.autoPausedSentenceIndex !== this.currentSentenceIndex &&
        currentTime >= curSent.start + 0.15 &&
        currentTime >= effectiveEnd - 0.14
      ) {
        this.autoPausedSentenceIndex = this.currentSentenceIndex;
        this.videoElement.pause();
        return;
      }

      if (currentTime >= curSent.start && currentTime < effectiveEnd) {
        return;
      }
    }

    // Find sentence index for the exact currentTime (with strict next block start precedence)
    const newIndex = this.preparsedSentences.findIndex((s, idx) => {
      const next = this.preparsedSentences[idx + 1];
      const effectiveEnd = next ? Math.min(s.end, next.start) : s.end;
      return currentTime >= s.start && currentTime < effectiveEnd;
    });

    // 1. If inside the SAME sentence — DO NOTHING TO THE DOM!
    // Text remains 100% static and stable!
    if (newIndex === this.currentSentenceIndex) {
      return;
    }

    this.currentSentenceIndex = newIndex;
    this.highlightActiveTranscriptCue(newIndex);

    // 2. If between sentences or past end — hide box
    if (newIndex === -1) {
      if (this.subtitleBox && this.subtitleBox.style.display !== 'none') {
        this.subtitleBox.style.display = 'none';
        this.subtitleBox.innerHTML = '';
      }
      return;
    }

    // 3. New sentence: ATOMIC SINGLE-SHOT RENDER OF THE COMPLETE SENTENCE
    const sentence = this.preparsedSentences[newIndex];
    this.currentSubtitleText = sentence.text;
    this.renderSubtitleTokens(sentence.text);
  }

  private setupTimeListener() {
    if (!this.videoElement) return;

    // Throttled synchronization loop (~22 Hz / every 45ms instead of 60-144 FPS) to keep CPU near 0%
    const tick = (now: number) => {
      if (this.videoElement && !this.videoElement.paused && !this.videoElement.ended) {
        if (now - this.lastTickTime >= 45) {
          this.lastTickTime = now;
          this.updateSubtitleOverlay(this.videoElement.currentTime);
        }
        this.animFrameId = requestAnimationFrame(tick);
      } else {
        this.animFrameId = null;
      }
    };

    const startLoop = () => {
      if (!this.animFrameId) {
        this.animFrameId = requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
    };

    this.videoElement.addEventListener('play', startLoop);
    this.videoElement.addEventListener('playing', startLoop);
    this.videoElement.addEventListener('pause', stopLoop);
    this.videoElement.addEventListener('ended', stopLoop);

    this.videoElement.addEventListener('seeked', () => {
      if (this.videoElement) {
        this.updateSubtitleOverlay(this.videoElement.currentTime);
      }
    });

    this.videoElement.addEventListener('seeking', () => {
      if (this.videoElement) {
        this.updateSubtitleOverlay(this.videoElement.currentTime);
      }
    });

    this.timeUpdateHandler = () => {
      if (this.videoElement) {
        this.updateSubtitleOverlay(this.videoElement.currentTime);
      }
    };
    this.videoElement.addEventListener('timeupdate', this.timeUpdateHandler);

    if (!this.videoElement.paused) {
      startLoop();
    }
  }

  private setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.settings?.isEnabled === false || this.settings?.enableYoutubeOverlay === false) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
        e.composedPath().some((el: any) => el && ((el as HTMLElement).isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes((el as HTMLElement).tagName)))
      ) {
        return;
      }

      // Never intercept browser/system shortcuts with Ctrl or Cmd (Meta)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      const key = e.key.toUpperCase();

      // Only allow Alt+T when Alt is held down
      if (e.altKey && key !== 'T') {
        return;
      }

      // 1. Hotkeys when word popup card is open
      if (this.popupCard && this.popupCard.style.display !== 'none' && this.activeWordData && !e.altKey) {
        // Space -> close popup and resume video playback
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          this.closeWordCard();
          if (this.videoElement && this.videoElement.paused) {
            this.videoElement.play();
          }
          return;
        }

        // 1..5 -> select corresponding level (1-5) and close
        if (['1', '2', '3', '4', '5'].includes(e.key)) {
          e.preventDefault();
          const translationText = this.getCurrentPopupTranslation(this.activeWordData.word);
          this.saveWordToLectura(this.activeWordData.word, translationText, e.key, this.activeWordData.contextSentence);
          this.closeWordCard();
          return;
        }

        // 0, I, or Escape -> mark as Ignore (🚫) / close
        if (e.key === '0' || key === 'I' || key === 'ESCAPE') {
          e.preventDefault();
          if (e.key === '0' || key === 'I') {
            const translationText = this.getCurrentPopupTranslation(this.activeWordData.word);
            this.saveWordToLectura(this.activeWordData.word, translationText, 'ignored', this.activeWordData.contextSentence);
          }
          this.closeWordCard();
          return;
        }

        // Enter or K -> mark as Known (✔️) and close
        if (key === 'ENTER' || key === 'K') {
          e.preventDefault();
          const translationText = this.getCurrentPopupTranslation(this.activeWordData.word);
          this.saveWordToLectura(this.activeWordData.word, translationText, 'known', this.activeWordData.contextSentence);
          this.closeWordCard();
          return;
        }
      }

      if (!this.videoElement || !this.currentVideoId) return;

      // 2. Subtitle size preset switching ([ and ])
      if (!e.altKey && (e.key === '[' || e.code === 'BracketLeft')) {
        e.preventDefault();
        const next = this.currentSizePreset === 'lg' ? 'md' : (this.currentSizePreset === 'md' ? 'sm' : 'sm');
        this.applySizePreset(next, true);
        return;
      }
      if (!e.altKey && (e.key === ']' || e.code === 'BracketRight')) {
        e.preventDefault();
        const next = this.currentSizePreset === 'sm' ? 'md' : (this.currentSizePreset === 'md' ? 'lg' : 'lg');
        this.applySizePreset(next, true);
        return;
      }

      // 3. Toggle Dual Subtitles (B for Bilingual, E, or Alt+T)
      if ((!e.altKey && (key === 'B' || key === 'E')) || (e.altKey && key === 'T')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.toggleDualSubtitles();
        return;
      }

      if (e.altKey) return;

      // 3b. Auto-Pause after subtitle [Q], Blur mode [H], Side Transcript Panel [T]
      if (key === 'Q') {
        e.preventDefault();
        this.toggleAutoPauseAfterSubtitle();
        return;
      }
      if (key === 'H') {
        e.preventDefault();
        this.cycleSubtitleBlurMode();
        return;
      }
      if (key === 'T') {
        e.preventDefault();
        this.toggleTranscriptSidebar();
        return;
      }

      // 4. Navigation hotkeys (A, S, D)
      if (key === 'A') {
        e.preventDefault();
        this.jumpToPreviousCue();
      } else if (key === 'D') {
        e.preventDefault();
        this.jumpToNextCue();
      } else if (key === 'S') {
        e.preventDefault();
        this.replayCurrentCue();
      }
    }, { capture: true });
  }

  private jumpToPreviousCue() {
    if (!this.videoElement) return;
    const currentTime = this.videoElement.currentTime;
    const uiLang = this.settings?.interfaceLanguage || 'en';

    if (this.preparsedSentences && this.preparsedSentences.length > 0) {
      let targetIdx = -1;
      for (let i = this.preparsedSentences.length - 1; i >= 0; i--) {
        if (this.preparsedSentences[i].start < currentTime - 0.6) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx !== -1) {
        this.videoElement.currentTime = Math.max(0, this.preparsedSentences[targetIdx].start + 0.01);
        this.updateSubtitleOverlay(this.videoElement.currentTime);
        this.showToast(t('prev_cue', uiLang));
        return;
      }
    }

    if (this.activeCues.length > 0) {
      for (let i = this.activeCues.length - 1; i >= 0; i--) {
        if (this.activeCues[i].startTime < currentTime - 0.5) {
          this.currentCueIndex = i;
          this.videoElement.currentTime = Math.max(0, this.activeCues[i].startTime);
          this.showToast(t('prev_cue', uiLang));
          return;
        }
      }
    }

    this.videoElement.currentTime = Math.max(0, currentTime - 3);
    this.showToast(t('prev_cue', uiLang));
  }

  private jumpToNextCue() {
    if (!this.videoElement) return;
    const currentTime = this.videoElement.currentTime;
    const uiLang = this.settings?.interfaceLanguage || 'en';

    if (this.preparsedSentences && this.preparsedSentences.length > 0) {
      let targetIdx = -1;
      for (let i = 0; i < this.preparsedSentences.length; i++) {
        if (this.preparsedSentences[i].start > currentTime + 0.3) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx !== -1) {
        this.videoElement.currentTime = this.preparsedSentences[targetIdx].start + 0.01;
        this.updateSubtitleOverlay(this.videoElement.currentTime);
        this.showToast(t('next_cue', uiLang));
        return;
      }
    }

    if (this.activeCues.length > 0) {
      for (let i = 0; i < this.activeCues.length; i++) {
        if (this.activeCues[i].startTime > currentTime + 0.5) {
          this.currentCueIndex = i;
          this.videoElement.currentTime = this.activeCues[i].startTime;
          this.showToast(t('next_cue', uiLang));
          return;
        }
      }
    }

    this.videoElement.currentTime = currentTime + 3;
    this.showToast(t('next_cue', uiLang));
  }

  private replayCurrentCue() {
    if (!this.videoElement) return;
    const currentTime = this.videoElement.currentTime;
    const uiLang = this.settings?.interfaceLanguage || 'en';

    if (this.preparsedSentences && this.preparsedSentences.length > 0) {
      const currentSent =
        this.currentSentenceIndex >= 0 && this.currentSentenceIndex < this.preparsedSentences.length
          ? this.preparsedSentences[this.currentSentenceIndex]
          : this.preparsedSentences.find((s) => currentTime >= s.start && currentTime <= s.end + 1.5);
      if (currentSent) {
        this.videoElement.currentTime = Math.max(0, currentSent.start + 0.01);
        if (this.videoElement.paused) {
          this.videoElement.play().catch(() => {});
        }
        this.updateSubtitleOverlay(this.videoElement.currentTime);
        this.showToast(t('replaying_cue', uiLang));
        return;
      }
    }

    const currentCue = this.activeCues[this.currentCueIndex];
    if (currentCue && Math.abs(currentCue.startTime - currentTime) < 10) {
      this.videoElement.currentTime = Math.max(0, currentCue.startTime);
    } else {
      this.videoElement.currentTime = Math.max(0, currentTime - 3);
    }
    this.showToast(t('replaying_cue', uiLang));
  }
}

new YouTubeLecturaOverlay();
