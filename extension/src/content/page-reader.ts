import { LecturaApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { ExtensionSettings, ExtMessage, WordMap } from '../types/index';
import { ArticleExtractor } from './article-extractor';
import { getSuggestedLemmas } from '../services/morphology';
import { isDomainDisabled } from '../services/domain-filter';
import { isWordToken, cleanWordForLookup, isNumericOrSymbolToken } from '../services/text-utils';

/**
 * Checks whether an element is an input, textarea, select, contenteditable or code editor
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  if (target.isContentEditable) return true;
  if (target.getAttribute('contenteditable') === 'true') return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, [role="textbox"]')) return true;
  return false;
}

/**
 * Cross-platform modifier key tester (supports Mac Command as Ctrl and Option as Alt)
 */
export function isModifierKeyPressed(e: MouseEvent | KeyboardEvent, key: 'alt' | 'ctrl' | 'shift' = 'alt'): boolean {
  if (key === 'alt') {
    return !!e.altKey;
  }
  if (key === 'ctrl') {
    return !!(e.ctrlKey || e.metaKey);
  }
  if (key === 'shift') {
    return !!e.shiftKey;
  }
  return false;
}

console.log('%c[LECTURA ACTIVE]', 'background: #0284c7; color: white; padding: 4px 8px; font-size: 14px; font-weight: bold; border-radius: 4px;', window.location.href);

/**
 * Dialect metadata definition per language
 */
export interface DialectInfo {
  code: string;
  label: string;
  name: string;
}

export const LANGUAGE_DIALECTS: Record<string, DialectInfo[]> = {
  es: [
    { code: 'es-MX', label: '🇲🇽 MX', name: 'Mexican Spanish' },
    { code: 'es-ES', label: '🇪🇸 ES', name: 'Castilian Spanish' },
    { code: 'es-US', label: '🇺🇸 US', name: 'US Spanish' },
    { code: 'es-AR', label: '🇦🇷 AR', name: 'Argentine Spanish' },
  ],
  en: [
    { code: 'en-US', label: '🇺🇸 US', name: 'American English' },
    { code: 'en-GB', label: '🇬🇧 UK', name: 'British English' },
    { code: 'en-AU', label: '🇦🇺 AU', name: 'Australian English' },
  ],
  fr: [
    { code: 'fr-FR', label: '🇫🇷 FR', name: 'French (France)' },
    { code: 'fr-CA', label: '🇨🇦 CA', name: 'French (Canada)' },
  ],
  pt: [
    { code: 'pt-BR', label: '🇧🇷 BR', name: 'Portuguese (Brazil)' },
    { code: 'pt-PT', label: '🇵🇹 PT', name: 'Portuguese (Portugal)' },
  ],
  de: [{ code: 'de-DE', label: '🇩🇪 DE', name: 'German' }],
  ru: [{ code: 'ru-RU', label: '🇷🇺 RU', name: 'Russian' }],
  it: [{ code: 'it-IT', label: '🇮🇹 IT', name: 'Italian' }],
  ja: [{ code: 'ja-JP', label: '🇯🇵 JP', name: 'Japanese' }],
  zh: [{ code: 'zh-CN', label: '🇨🇳 CN', name: 'Chinese (Mandarin)' }],
  ko: [{ code: 'ko-KR', label: '🇰🇷 KR', name: 'Korean' }],
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
  if (!rawWord) return '';
  return rawWord
    .trim()
    .replace(/^[\p{P}\s¿¡«"'(]+|[\p{P}\s?!.,:;"»')]+$/gu, '')
    .toLowerCase();
}

export function getDialectsForLanguage(lang: string): DialectInfo[] {
  const code = normalizeLangCode(lang);
  return LANGUAGE_DIALECTS[code] || [{ code: `${code}-${code.toUpperCase()}`, label: code.toUpperCase(), name: lang }];
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
 * Cascading language detection for YouTube and standard web pages
 */
export async function getEffectiveLanguage(sampleText?: string): Promise<string> {
  // 1. YouTube Mode: check active subtitle track or global track lang
  if (typeof window !== 'undefined' && window.location.hostname.includes('youtube.com')) {
    if ((window as any).__LECTURA_YT_TRACK_LANG__) {
      return (window as any).__LECTURA_YT_TRACK_LANG__.slice(0, 2).toLowerCase();
    }
    const ytPlayer = document.getElementById('movie_player') as any;
    if (ytPlayer && typeof ytPlayer.getOption === 'function') {
      try {
        const track = ytPlayer.getOption('captions', 'track');
        if (track?.languageCode) {
          return track.languageCode.slice(0, 2).toLowerCase();
        }
      } catch (_) {}
    }
  }

  // 2. Web Mode: check <html lang="..."> and <meta> tags
  if (typeof document !== 'undefined') {
    const htmlLang = (
      document.documentElement?.lang ||
      document.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:locale"]')?.getAttribute('content') ||
      document.querySelector('meta[name="language"]')?.getAttribute('content')
    )?.trim().toLowerCase();

    if (htmlLang && htmlLang.length >= 2) {
      const code = htmlLang.slice(0, 2);
      if (['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar', 'tr', 'pl', 'uk', 'nl', 'sv'].includes(code)) {
        return code;
      }
    }
  }

  // 3. Web Mode Fallback: Chrome i18n language detector
  if (sampleText && typeof chrome !== 'undefined' && chrome.i18n?.detectLanguage) {
    try {
      const detected = await new Promise<string>((resolve) => {
        chrome.i18n.detectLanguage(sampleText, (result) => {
          if (result && result.languages && result.languages.length > 0) {
            const top = result.languages[0];
            if (top && top.language && top.percentage >= 25 && top.language !== 'und') {
              resolve(top.language.slice(0, 2).toLowerCase());
              return;
            }
          }
          resolve('');
        });
      });
      if (detected) return detected;
    } catch (_) {}
  }

  return 'en';
}

/**
 * Detects whether the current page is the native Lectura application, disabled, or blacklisted
 */
export async function shouldSkipInjection(): Promise<boolean> {
  // 1. Check DOM meta / attribute signature of native Lectura application
  if (typeof document !== 'undefined') {
    const hasAppMeta = document.querySelector('meta[name="app-identifier"][content="lectura-core-app"]') !== null;
    if (hasAppMeta) return true;

    const hasRootAttr = document.querySelector('[data-app-identifier="lectura-core-app"]') !== null;
    if (hasRootAttr) return true;

    if ((window as any).__LECTURA_APP_IDENTIFIER__ === 'lectura-core-app') return true;
  }

  // 2. Check settings (isEnabled and domain blacklist/whitelist)
  try {
    const settings = await StorageService.getSettings();
    if (settings.isEnabled === false) {
      return true;
    }

    if (settings?.serverUrl) {
      const configuredOrigin = new URL(settings.serverUrl).origin;
      if (window.location.origin === configuredOrigin) {
        return true;
      }
    }

    if (isDomainDisabled(window.location.hostname, settings.disabledDomains || [], settings.domainFilterMode || 'blacklist')) {
      return true;
    }
  } catch (_) {}

  return false;
}

export class PageReader {
  private tooltipHost: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private tooltipElement: HTMLElement | null = null;
  private toastElement: HTMLElement | null = null;

  private apiClient: LecturaApiClient = new LecturaApiClient();
  private settings: ExtensionSettings | null = null;
  private cachedWordsByLang: Record<string, WordMap> = {};
  private cachedWordLinksByLang: Record<string, Record<string, string>> = {};
  private activeDialectByLang: Record<string, string> = {};
  private activeWord: string = '';
  private activeContextSentence: string = '';
  private activePopupLang: string = 'en';

  private isShiftDown: boolean = false;
  private hoverThrottleTimer: number | null = null;
  private static localTranslationCache = new Map<string, string>();

  constructor() {
    // Isolate YouTube overlay from general web reader
    if (window.location.hostname.includes('youtube.com')) {
      return;
    }
    this.init();
  }

  /**
   * Evaluates if the extension should actively capture words and display popups on the current page
   */
  public isExtensionActiveOnPage(): boolean {
    if (!this.settings) return true;
    if (this.settings.isEnabled === false) return false;
    if (!this.settings.enableInSituSelection) return false;
    if (isDomainDisabled(window.location.hostname, this.settings.disabledDomains || [], this.settings.domainFilterMode || 'blacklist')) {
      return false;
    }
    return true;
  }

  private async init() {
    if (await shouldSkipInjection()) {
      console.log('🛑 [Lectura Extension] Skipping extension injection on this page.');
      return;
    }

    console.log('[Lectura] Web reader active on:', window.location.href);
    this.settings = await StorageService.getSettings();
    if (!this.settings.enableInSituSelection) {
      return;
    }

    const lang = await getEffectiveLanguage();
    this.activePopupLang = lang;
    this.cachedWordsByLang[lang] = await StorageService.getCachedWords(lang);

    // Load word links / lemmas and stored dialect if present in storage
    try {
      const data = await chrome.storage.local.get([`lectura_word_links_${lang}`, `lectura_tts_dialect_${lang}`]);
      this.cachedWordLinksByLang[lang] = data[`lectura_word_links_${lang}`] || {};
      if (data[`lectura_tts_dialect_${lang}`]) {
        this.activeDialectByLang[lang] = data[`lectura_tts_dialect_${lang}`];
      }
    } catch (_) {}

    this.createShadowTooltip();
    this.setupShiftTracking();
    this.setupPointHoverListeners();
    this.setupKeyboardShortcuts();
    this.setupMessageListener();
  }

  private createShadowTooltip() {
    if (this.tooltipHost) return;

    this.tooltipHost = document.createElement('div');
    this.tooltipHost.id = 'lectura-reader-shadow-host';
    this.tooltipHost.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 2147483647;
      pointer-events: none;
    `;

    this.shadowRoot = this.tooltipHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .lectura-popup-wrapper,
      #lectura-popup-root {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      .lectura-word-card,
      .lectura-popup {
        position: fixed;
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
        max-width: 90vw;
        pointer-events: auto;
        font-size: 13px;
        line-height: 1.4;
        animation: cardPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 2147483647;
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
        animation: cardPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
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
      .lectura-context-text .highlight,
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
        animation: cardPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
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

      @keyframes cardPop {
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
        font-size: 20px;
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
      .lectura-card-lang-badge {
        background: rgba(14, 165, 233, 0.12);
        border: 1px solid rgba(14, 165, 233, 0.35);
        border-radius: 6px;
        color: #38bdf8;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 6px;
        line-height: 1;
      }
      .lectura-card-ipa {
        font-size: 12px;
        color: #94a3b8;
        font-style: italic;
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

      /* Translation & POS */
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

      /* Context Sentence */
      .lectura-card-context,
      .lectura-context-box {
        font-size: 12px;
        color: #94a3b8;
        margin-bottom: 10px;
        line-height: 1.35;
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-left: 3px solid #38bdf8 !important;
        padding: 10px 12px !important;
        border-radius: 10px !important;
      }
      .lectura-card-context .highlight,
      .lectura-card-context b {
        color: #38bdf8;
        font-weight: 700;
      }

      /* Lemma / Parent Linking Section */
      .lectura-card-lemma-section {
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 10px !important;
        padding: 6px 8px;
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
      .lectura-input,
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
      .status-btn.st-4, .lectura-btn-stage[data-status="4"] { border-color: #60a5fa; color: #60a5fa; }
      .status-btn.st-5, .lectura-btn-stage[data-status="5"] { border-color: #a78bfa; color: #a78bfa; }
      .status-btn.st-known, .lectura-btn-known { background: #059669; border-color: #10b981; color: white; }

      .status-btn.active, .lectura-btn.active {
        transform: scale(1.12);
        filter: brightness(1.2);
      }
      .status-btn.st-1.active, .lectura-btn-stage[data-status="1"].active { background: rgba(248, 113, 113, 0.25); box-shadow: 0 0 10px #f87171; }
      .status-btn.st-2.active, .lectura-btn-stage[data-status="2"].active { background: rgba(251, 191, 36, 0.25); box-shadow: 0 0 10px #fbbf24; }
      .status-btn.st-3.active, .lectura-btn-stage[data-status="3"].active { background: rgba(52, 211, 153, 0.25); box-shadow: 0 0 10px #34d399; }
      .status-btn.st-4.active, .lectura-btn-stage[data-status="4"].active { background: rgba(96, 165, 250, 0.25); box-shadow: 0 0 10px #60a5fa; }
      .status-btn.st-5.active, .lectura-btn-stage[data-status="5"].active { background: rgba(167, 139, 250, 0.25); box-shadow: 0 0 10px #a78bfa; }
      .status-btn.st-known.active, .lectura-btn-known.active { background: #059669; box-shadow: 0 0 12px #10b981; }
      .status-btn.st-0.active, .lectura-btn-ignore.active { background: rgba(239, 68, 68, 0.25); box-shadow: 0 0 10px #ef4444; }


      /* Quick Dictionary Links Bar */
      .lectura-card-dict-bar {
        display: flex;
        gap: 6px;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
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

      /* Toast */
      .lectura-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
        opacity: 0;
        transform: translateY(4px);
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        z-index: 2147483647;
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
    `;

    this.shadowRoot.appendChild(style);

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'lectura-word-card';
    this.tooltipElement.style.display = 'none';
    this.shadowRoot.appendChild(this.tooltipElement);

    this.toastElement = document.createElement('div');
    this.toastElement.className = 'lectura-toast';
    this.shadowRoot.appendChild(this.toastElement);

    document.documentElement.appendChild(this.tooltipHost);
  }

  private setupShiftTracking() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.isShiftDown = false;
    });
  }

  /**
   * Yomitan/Migaku style Point-to-Word extraction via caretRangeFromPoint / caretPositionFromPoint
   */
  private getWordAtPoint(x: number, y: number): { word: string; sentence: string; rect: DOMRect } | null {
    let range: Range | null = null;

    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(x, y);
      if (pos && pos.offsetNode) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

    const textNode = range.startContainer;
    const fullText = textNode.textContent || '';
    let offset = range.startOffset;

    if (offset > fullText.length) return null;

    // Unicode word boundary scan backwards and forwards
    let start = offset;
    while (start > 0 && /[\p{L}\p{N}_'-]/u.test(fullText[start - 1])) {
      start--;
    }

    let end = offset;
    while (end < fullText.length && /[\p{L}\p{N}_'-]/u.test(fullText[end])) {
      end++;
    }

    const word = fullText.slice(start, end).trim();
    if (!word || word.length < 1) return null;

    // Clean word bounds: skip pure punctuation, numbers, timestamps, currencies
    if (!/[\p{L}]/u.test(word) || !isWordToken(word)) return null;

    try {
      const wordRange = document.createRange();
      wordRange.setStart(textNode, start);
      wordRange.setEnd(textNode, end);
      const rect = wordRange.getBoundingClientRect();

      // Extract context sentence
      const sentenceRegex = /[^.!?\n\r]+[.!?]*/g;
      let sentence = fullText;
      let match;
      while ((match = sentenceRegex.exec(fullText)) !== null) {
        if (offset >= match.index && offset <= match.index + match[0].length) {
          sentence = match[0].trim();
          break;
        }
      }

      return { word, sentence, rect };
    } catch (_) {
      return null;
    }
  }

  private setupPointHoverListeners() {
    // 1. Click capture event listener (single-word lookup on modifier click)
    document.addEventListener('click', (e: MouseEvent) => {
      // Ignore clicks inside our tooltip
      if (this.tooltipHost && e.composedPath().includes(this.tooltipHost)) {
        return;
      }

      // Ignore clicks inside editable fields
      if (isEditableElement(e.target)) {
        return;
      }

      // If extension is disabled or blacklisted, hide and return
      if (!this.isExtensionActiveOnPage()) {
        this.hideWordPopup();
        return;
      }

      const modifier = this.settings?.modifierKey || 'alt';
      const isModifierActive = isModifierKeyPressed(e, modifier);
      const isShiftClick = e.shiftKey;

      if (isModifierActive || isShiftClick) {
        const pointData = this.getWordAtPoint(e.clientX, e.clientY);
        if (pointData) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Lectura] Found word on Modifier/Shift+Click:', pointData.word);
          this.showWordPopup(pointData.word, pointData.rect, pointData.sentence, false);
          return;
        }
      }

      // If clicked outside word without modifier and no text selected, hide tooltip
      if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
          const pointData = this.getWordAtPoint(e.clientX, e.clientY);
          if (!pointData) {
            this.hideWordPopup();
          }
        }
      }
    }, true);

    // 2. Mousemove for Yomitan/Migaku style Shift+Hover scanning
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isExtensionActiveOnPage()) {
        return;
      }

      // If modal/popup is currently open, completely block hover tooltips
      if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
        return;
      }

      // Ignore hovering over editable elements
      if (isEditableElement(e.target)) {
        return;
      }

      // Check if mouse is hovering over the open tooltip
      if (this.tooltipHost && e.composedPath().includes(this.tooltipHost)) {
        return;
      }

      if (this.hoverThrottleTimer) {
        window.clearTimeout(this.hoverThrottleTimer);
      }

      this.hoverThrottleTimer = window.setTimeout(() => {
        const modifier = this.settings?.modifierKey || 'alt';
        const isModifierActive = isModifierKeyPressed(e, modifier) || e.shiftKey || this.isShiftDown;

        if (isModifierActive) {
          if (this.tooltipElement && this.tooltipElement.style.display !== 'none') {
            return;
          }
          const res = this.getWordAtPoint(e.clientX, e.clientY);
          if (res) {
            if (res.word.toLowerCase() !== this.activeWord.toLowerCase() || !this.tooltipElement || this.tooltipElement.style.display === 'none') {
              console.log('[Lectura] Found word on Hover:', res.word);
              this.showWordPopup(res.word, res.rect, res.sentence, false);
            }
          }
        }
      }, 40);
    }, { passive: true });

    // 3. Selection capture (Single Word, Phrase & Idiom Lookup)
    document.addEventListener('mouseup', (e: MouseEvent) => {
      // Ignore mouseup inside our tooltip
      if (this.tooltipHost && e.composedPath().includes(this.tooltipHost)) {
        return;
      }

      // Ignore mouseup inside inputs, textareas, contenteditable elements
      if (isEditableElement(e.target)) {
        return;
      }

      if (!this.isExtensionActiveOnPage()) {
        this.hideWordPopup();
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }

      // Check if selection anchor is inside an editable element
      if (
        isEditableElement(selection.anchorNode?.parentElement) ||
        isEditableElement(selection.focusNode?.parentElement)
      ) {
        return;
      }

      // Modifier key check (if enabled in settings)
      if (this.settings?.onlyOnModifierKey) {
        const modifier = this.settings?.modifierKey || 'alt';
        const isModifierActive = isModifierKeyPressed(e, modifier);
        if (!isModifierActive) {
          // Normal text selection without modifier key -> do not open card
          return;
        }
        // Prevent default browser link navigation or download if Alt was pressed
        if (e.altKey && (e.target as HTMLElement)?.closest('a')) {
          e.preventDefault();
        }
      }

      const selectedText = selection.toString().trim();

      // If user selected valid text (word or phrase up to 12 words)
      if (selectedText && selectedText.length > 0) {
        const wordsCount = selectedText.split(/\s+/).length;
        if (wordsCount === 1) {
          if (!isWordToken(selectedText)) return;
        } else if (!/\p{L}/u.test(selectedText)) {
          // Selected multi-word range has no actual letters (e.g. "12 34 56" or "$10 - $20")
          return;
        }

        if (wordsCount <= 12) {
          try {
            const range = selection.getRangeAt(0);
            if (range) {
              const rect = range.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const fullSentence = range.startContainer.textContent?.trim() || selectedText;
                const isPhrase = wordsCount >= 2;
                console.log('🔗 [Lectura] Text selected:', selectedText, { isPhrase });
                this.showWordPopup(selectedText, rect, fullSentence, isPhrase);
              }
            }
          } catch (_) {}
        }
      }
    });
  }

  private hideWordPopup() {
    if (this.tooltipElement) {
      this.tooltipElement.style.display = 'none';
    }
    this.activeWord = '';
  }

  private setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.tooltipElement || this.tooltipElement.style.display === 'none' || !this.activeWord) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }

      const key = e.key.toUpperCase();

      // 1..5 -> Save learning stage (1-5)
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const transEl = this.tooltipElement.querySelector('.lectura-card-translation');
        const translationText = transEl?.textContent || '';
        this.saveWord(this.activeWord, translationText, e.key, this.activeContextSentence);
        this.hideWordPopup();
        return;
      }

      // K or Enter -> Mark Known
      if (key === 'K' || key === 'ENTER') {
        e.preventDefault();
        const transEl = this.tooltipElement.querySelector('.lectura-card-translation');
        const translationText = transEl?.textContent || '';
        this.saveWord(this.activeWord, translationText, 'known', this.activeContextSentence);
        this.hideWordPopup();
        return;
      }

      // 0, I, or Escape -> Mark Ignored / Close
      if (e.key === '0' || key === 'I' || key === 'ESCAPE') {
        e.preventDefault();
        if (e.key === '0' || key === 'I') {
          const transEl = this.tooltipElement.querySelector('.lectura-card-translation');
          const translationText = transEl?.textContent || '';
          this.saveWord(this.activeWord, translationText, 'ignored', this.activeContextSentence);
        }
        this.hideWordPopup();
        return;
      }
    }, { capture: true });
  }

  private highlightWordInContext(sentence: string, word: string): string {
    if (!sentence || !word) return sentence || '';
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return sentence.replace(regex, '<span class="highlight">$1</span>');
  }

  private formatTranslationHtml(text: string): string {
    if (!text) return '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    return lines
      .map((line) => {
        const posMatch = line.match(/^\(([a-zA-Z]+)\)\s*(.+)$/);
        if (posMatch) {
          return `<div class="lectura-pos-line"><span class="lectura-pos-tag">(${posMatch[1]})</span> <span class="lectura-pos-words">${posMatch[2]}</span></div>`;
        }
        return `<div class="lectura-def-line">${line}</div>`;
      })
      .join('');
  }

  /**
   * Fast Google Translate fallback fetcher with POS structured definitions and synonyms
   */
  private async fetchDirectTranslation(word: string, targetLang = 'ru', sourceLang?: string): Promise<{ translationText: string; baseRoot?: string }> {
    const clean = cleanWordForTranslation(word);
    if (!clean) return { translationText: '' };
    const currentLang = normalizeLangCode(sourceLang || this.currentArticleLanguage || this.settings?.targetLanguage || 'en');
    const sIso = currentLang.slice(0, 2).toLowerCase();
    const tIso = (targetLang || 'ru').slice(0, 2).toLowerCase();
    const cacheKey = `${sIso}:${clean}`;

    const haberForms = ['he', 'has', 'ha', 'hemos', 'habéis', 'han', 'había', 'habías', 'habíamos', 'habían', 'hube', 'hubo', 'hubieron', 'haya', 'hayas', 'hayamos', 'hayan', 'hay'];
    const detectedBaseRoot = sIso === 'es' && haberForms.includes(clean) ? 'haber' : '';

    if (PageReader.localTranslationCache.has(cacheKey)) {
      const cached = PageReader.localTranslationCache.get(cacheKey)!;
      if (cached && cached !== '—' && cached.toLowerCase() !== 'ха' && cached.toLowerCase() !== 'ha') {
        return { translationText: cached, baseRoot: detectedBaseRoot };
      }
    }

    // 1. Try background service worker
    try {
      const bgResponse: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'TRANSLATE_WORD',
            payload: { word: clean, sourceLang: sIso, targetLang: tIso },
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
        PageReader.localTranslationCache.set(cacheKey, bgResponse.translation);
        return { translationText: bgResponse.translation, baseRoot: detectedBaseRoot };
      }
    } catch (_) {}

    // 2. Direct fetch fallback
    try {
      const isMultiWord = clean.includes(' ');
      const dtParams = isMultiWord ? 'dt=t' : 'dt=t&dt=bd&dt=rm';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sIso}&tl=${tIso}&${dtParams}&q=${encodeURIComponent(clean)}`;
      const response = await fetch(url);
      if (!response.ok) return { translationText: '—', baseRoot: detectedBaseRoot };
      const data = await response.json();

      const nounTerms: string[] = [];
      const adjTerms: string[] = [];
      const otherTerms: string[] = [];

      // 1. Check for rich dictionary definition groups (data[1])
      if (data && data[1] && Array.isArray(data[1])) {
        for (const entry of data[1]) {
          const pos = (entry[0] || '').toLowerCase();
          if (entry && Array.isArray(entry[1])) {
            for (const term of entry[1]) {
              const cleanTerm = String(term).trim();
              if (
                cleanTerm && 
                cleanTerm.toLowerCase() !== clean && 
                cleanTerm.toLowerCase() !== 'ха' && 
                cleanTerm.toLowerCase() !== 'ha'
              ) {
                if (pos === 'noun' || pos.includes('noun') || pos.includes('существительное')) {
                  nounTerms.push(cleanTerm);
                } else if (pos === 'adjective' || pos.includes('adj') || pos.includes('прилагательное')) {
                  adjTerms.push(cleanTerm);
                } else {
                  otherTerms.push(cleanTerm);
                }
              }
            }
          }
        }
      }

      // 2. Primary machine translation
      const primary = data?.[0]?.[0]?.[0]?.trim() || '';

      // 3. Special handling for haber
      const variants: string[] = [primary, ...nounTerms, ...adjTerms, ...otherTerms].filter(Boolean);
      if (sIso === 'es' && haberForms.includes(clean)) {
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
        PageReader.localTranslationCache.set(cacheKey, translationText);
      }

      return { translationText, baseRoot: detectedBaseRoot };
    } catch (_) {
      if (sIso === 'es' && haberForms.includes(clean)) {
        return {
          translationText: 'иметь (вспом. глагол), быть, происходить',
          baseRoot: 'haber',
        };
      }
      return { translationText: '—', baseRoot: detectedBaseRoot };
    }
  }

  private getExternalDictUrls(word: string, languageNameOrCode: string) {
    const clean = encodeURIComponent(word.trim());
    const code = normalizeLangCode(languageNameOrCode);
    const langNames: Record<string, string> = {
      en: 'english', es: 'spanish', fr: 'french', de: 'german',
      it: 'italian', ru: 'russian', pt: 'portuguese', zh: 'chinese',
      ja: 'japanese', ko: 'korean', ar: 'arabic', tr: 'turkish',
    };
    const langName = langNames[code] || 'english';
    
    // Reverso pair
    const reversoPair = `${langName}-russian`;

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

    return {
      reverso: `https://context.reverso.net/translation/${reversoPair}/${clean}`,
      cambridge: `https://dictionary.cambridge.org/dictionary/${cambridgeDict}/${clean}`,
      wiktionary: `https://${wiktionaryLang}.wiktionary.org/wiki/${clean}`,
    };
  }

  private async showWordPopup(word: string, rect: DOMRect, contextSentence: string, isPhrase = false) {
    if (!this.tooltipElement) return;

    this.activeWord = word;
    this.activeContextSentence = contextSentence;

    const lower = word.toLowerCase();
    const currentLang = await getEffectiveLanguage(contextSentence || word);
    this.activePopupLang = currentLang;

    // Isolate vocabulary cache by language
    if (!this.cachedWordsByLang[currentLang]) {
      this.cachedWordsByLang[currentLang] = await StorageService.getCachedWords(currentLang);
    }
    const cachedWords = this.cachedWordsByLang[currentLang] || {};
    const cached = cachedWords[lower];
    const status = cached?.status || 'new';

    const isMultiWord = isPhrase || word.includes(' ');

    const langNames: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', ru: 'Russian', pt: 'Portuguese', zh: 'Chinese',
      ja: 'Japanese', ko: 'Korean', ar: 'Arabic', tr: 'Turkish',
    };
    const activeLang = langNames[currentLang] || currentLang.toUpperCase();
    
    // Resolve dialect per language
    const dialects = getDialectsForLanguage(currentLang);
    let activeDialectCode = this.activeDialectByLang[currentLang];
    if (!activeDialectCode) {
      if (this.settings?.ttsDialect && this.settings.ttsDialect.toLowerCase().startsWith(currentLang)) {
        activeDialectCode = this.settings.ttsDialect;
      } else {
        activeDialectCode = dialects[0].code;
      }
    }
    let currentDialect = resolveDialect(currentLang, activeDialectCode);
    const dialectLabel = currentDialect.label;
    
    if (!this.cachedWordLinksByLang[currentLang]) {
      this.cachedWordLinksByLang[currentLang] = {};
    }
    const existingParent = this.cachedWordLinksByLang[currentLang][lower] || '';
    const suggestedLemmas = getSuggestedLemmas(word, currentLang);
    const dictUrls = this.getExternalDictUrls(word, activeLang);

    const initialTransHtml = cached?.translation ? this.formatTranslationHtml(cached.translation) : 'Translating...';
    const translationLines = cached?.translation ? cached.translation.split('\n').map((l) => l.trim()).filter(Boolean) : [];
    const glassMainTranslation = translationLines[0] || (cached?.translation || 'Translating...');
    const glassSubDefinition = translationLines.slice(1).join('\n');

    const currentTheme = this.settings?.popupTheme || 'compact';
    this.tooltipElement.className = `lectura-word-card ${currentTheme}`;

    const statusToSlider: Record<string, number> = {
      '0': 0, 'ignored': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, 'known': 6, 'new': 1
    };
    const sliderToStatus: Record<number, string> = {
      0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: 'known'
    };
    const currentSliderVal = statusToSlider[status || 'new'] ?? 1;

    const highlightedContext = contextSentence ? this.highlightWordInContext(contextSentence, word) : '';

    if (currentTheme === 'glass' || currentTheme === 'calm_light') {
      this.tooltipElement.className = currentTheme === 'calm_light' 
        ? 'lectura-word-card theme-calm-light calm_light' 
        : 'lectura-word-card theme-glass-v2 glass';
      // THEME 3 (Modern Glass) & THEME 4 (Calm Light) Layout
      this.tooltipElement.innerHTML = `
        <!-- Верхний таб-бар -->
        <div class="glass-tabs-header">
          <div class="glass-tabs-list">
            <button type="button" class="glass-tab active" data-tab="meaning">Meaning</button>
            <button type="button" class="glass-tab" data-tab="definition">Definition</button>
            <button type="button" class="glass-tab" data-tab="usage">Usage</button>
            <button type="button" class="glass-tab" data-tab="dictionaries">Dicts</button>
            <button type="button" class="glass-tab" data-tab="baseroot">Root</button>
          </div>
          <button type="button" class="glass-btn-close lectura-card-close" title="Close (Esc)">✕</button>
        </div>

        <!-- Блок заголовка: Слово + Язык + Динамик -->
        <div class="glass-word-row">
          <h1 class="glass-word-title">${word}</h1>
          <div class="glass-word-meta">
            <span class="glass-lang-tag lectura-card-dialect-badge" title="Dialect: ${currentDialect.name}">${activeLang} | ${dialectLabel}</span>
            <button type="button" class="glass-btn-sound lectura-card-tts" title="Audio">🔊</button>
          </div>
        </div>

        <!-- Tab Pane: Meaning (активный по умолчанию) -->
        <div class="glass-tab-pane active" data-pane="meaning">
          <!-- Поле перевода на целевой язык книги -->
          <div class="translation-input-wrap" style="margin-bottom: 10px;">
            <input 
              type="text" 
              value="${glassMainTranslation}" 
              placeholder="Type a meaning for this form..."
              class="calm-meaning-input lectura-meaning-input"
              style="width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 10px; border: 1px solid rgba(226, 232, 240, 0.9); font-weight: 700; font-size: 14px; outline: none; background: #ffffff; color: #0f172a;"
            />
          </div>

          <!-- Полноразмерный блок примера использования на всю ширину карточки -->
          <div class="glass-example-card-full">
            <span class="glass-example-caption">Пример использования:</span>
            <p class="glass-example-phrase">${highlightedContext}</p>
          </div>
        </div>

        <!-- Tab Pane: Definition (Толковый словарь на языке оригинала) -->
        <div class="glass-tab-pane" data-pane="definition">
          <div class="glass-example-card-full">
            <span class="glass-example-caption">📖 Monolingual Definition (${activeLang}):</span>
            <p class="mono-def-text" style="margin: 4px 0 0 0; font-size: 13.5px; line-height: 1.5; color: #334155;">${glassSubDefinition || glassMainTranslation || 'No definition available.'}</p>
          </div>
        </div>

        <!-- Tab Pane: Usage -->
        <div class="glass-tab-pane" data-pane="usage">
          <div class="glass-example-card-full">
            <span class="glass-example-caption">📖 Context Sentence:</span>
            <div class="lectura-extended-pane-inner" style="margin-top: 4px;">
              ${contextSentence ? `“${highlightedContext}”` : 'No context sentence available.'}
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
                  placeholder="Base root (e.g. salir)..." 
                  class="calm-root-field lectura-lemma-input"
                  id="root-input-field"
                  value="${existingParent || ''}"
                  style="width: 100%; border: none; background: transparent; outline: none; font-size: 13px; color: #0f172a;"
                />
              </div>
              <button type="button" class="btn-link calm-btn-link lectura-lemma-btn-link" id="btn-link-root" style="background: #2563eb; color: #ffffff; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer;">Link</button>
            </div>

            <!-- Блок подсказок -->
            <div class="root-suggestions-row" id="suggestions-container" style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; font-size: 11px; ${suggestedLemmas.length > 0 ? '' : 'display: none;'}">
              <span class="suggestions-label" style="color: #64748b; font-weight: 600; letter-spacing: 0.3px;">💡 SUGGESTIONS:</span>
              <div class="suggestions-chips" style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${suggestedLemmas.map((sug) => `<button type="button" class="suggestion-chip lectura-lemma-chip" data-root="${sug}" data-lemma="${sug}" style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 600; cursor: pointer;">${sug}</button>`).join('')}
              </div>
            </div>

            <!-- Текущий сохраненный корень -->
            <div class="current-root-status" style="margin-top: 10px; font-size: 12px; color: #475569;">
              Current Base Root: <strong class="current-root-name" id="current-root-name" style="color: #0284c7; text-decoration: underline;">${existingParent || '—'}</strong>
            </div>
          </div>
        </div>

        <!-- Нижняя интерактивная капсула статусов (Segmented Bar) -->
        <div class="status-capsule-bar" style="margin-top: 10px;">
          <button type="button" class="cap-btn cap-ignore ${status === '0' || status === 'ignored' ? 'active' : ''}" data-status="0" title="Игнорировать">🚫</button>
          <button type="button" class="cap-btn cap-1 ${status === '1' ? 'active' : ''}" data-status="1" title="Hard (1)">1</button>
          <button type="button" class="cap-btn cap-2 ${status === '2' ? 'active' : ''}" data-status="2" title="Remembering (2)">2</button>
          <button type="button" class="cap-btn cap-3 ${status === '3' ? 'active' : ''}" data-status="3" title="Intermediate (3)">3</button>
          <button type="button" class="cap-btn cap-4 ${status === '4' ? 'active' : ''}" data-status="4" title="Advanced (4)">4</button>
          <button type="button" class="cap-btn cap-5 ${status === '5' ? 'active' : ''}" data-status="5" title="Mastered (5)">5</button>
          <button type="button" class="cap-btn cap-known ${status === 'known' ? 'active' : ''}" data-status="known" title="Знаю">✓</button>
        </div>
      `;
    } else if (currentTheme === 'extended') {
      this.tooltipElement.className = 'lectura-word-card extended';
      this.tooltipElement.innerHTML = `
        <!-- Top Tab Navigation Bar -->
        <div class="lectura-extended-tabs">
          <div class="lectura-tab-nav">
            <button type="button" class="lectura-tab-btn active" data-tab="definition">[ Definition ]</button>
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
              ${cached?.ipa ? `<span class="lectura-extended-ipa">[${cached.ipa}]</span>` : ''}
            </div>
            <div class="lectura-extended-badges">
              <button type="button" class="lectura-dialect-pill lectura-card-dialect-badge" title="Dialect: ${currentDialect.name}">${activeLang} | ${dialectLabel}</button>
              <button type="button" class="lectura-card-tts" title="Pronounce">🔊</button>
            </div>
          </div>

          <!-- Primary Translation & Secondary Synonyms -->
          <div class="lectura-card-translation">${initialTransHtml}</div>

          <!-- Context Block with Badges -->
          ${contextSentence ? `
            <div class="lectura-extended-context-block">
              <div class="lectura-context-title">Пример использования:</div>
              <div class="lectura-context-body">
                <div class="lectura-context-text">${highlightedContext}</div>
                <div class="lectura-status-badges-row">
                  <button class="status-btn st-0 ${status === '0' || status === 'ignored' ? 'active' : ''}" data-status="0" title="Ignore (0)">🚫</button>
                  <button class="status-btn st-1 ${status === '1' ? 'active' : ''}" data-status="1" title="Stage 1">1</button>
                  <button class="status-btn st-2 ${status === '2' ? 'active' : ''}" data-status="2" title="Stage 2">2</button>
                  <button class="status-btn st-3 ${status === '3' ? 'active' : ''}" data-status="3" title="Stage 3">3</button>
                  <button class="status-btn st-4 ${status === '4' ? 'active' : ''}" data-status="4" title="Stage 4">4</button>
                  <button class="status-btn st-5 ${status === '5' ? 'active' : ''}" data-status="5" title="Stage 5">5</button>
                  <button class="status-btn st-known ${status === 'known' ? 'active' : ''}" data-status="known" title="Known (K)">✔️</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Tab Pane: Usage (Context Examples) -->
        <div class="lectura-tab-pane" data-pane="usage">
          <div class="lectura-extended-context-block">
            <div class="lectura-context-title">📖 Sentence Context:</div>
            <div class="lectura-extended-pane-inner">
              ${contextSentence ? `“${highlightedContext}”` : 'No context sentence found for this selection.'}
            </div>
          </div>
        </div>

        <!-- Tab Pane: Etymology (Morphology & Base Roots) -->
        <div class="lectura-tab-pane" data-pane="etymology">
          <div class="lectura-extended-context-block">
            <div class="lectura-context-title">🌱 Base Root & Related Forms:</div>
            <div class="lectura-extended-pane-inner">
              Base Root: <b style="color: #38bdf8;">${existingParent || word}</b>
            </div>
          </div>
        </div>

        <!-- Tab Pane: Pronunciation -->
        <div class="lectura-tab-pane" data-pane="pronunciation">
          <div class="lectura-extended-context-block">
            <div class="lectura-context-title">🗣️ Phonetics & Dialect:</div>
            <div class="lectura-extended-pane-inner" style="display: flex; flex-direction: column; gap: 8px;">
              <div>Phonetic transcription: <b style="color: #38bdf8;">${cached?.ipa ? `[${cached.ipa}]` : `Standard ${activeLang}`}</b></div>
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
              <input type="text" class="lectura-lemma-input" placeholder="Base root (e.g. root)..." value="${existingParent}" />
              <button type="button" class="lectura-lemma-btn-link" title="Link to base root">Link</button>
            </div>
            <div class="lectura-card-dict-bar" style="margin-top: 0; padding-top: 0; border-top: none;">
              <button type="button" class="lectura-dict-btn" data-dict="cambridge">Cambridge ↗</button>
              <button type="button" class="lectura-dict-btn" data-dict="wiktionary">Wiktionary ↗</button>
            </div>
          </div>
        </div>
      `;
    } else {
      // Compact Theme layout
      this.tooltipElement.innerHTML = `
        <div class="lectura-card-header">
          <div class="lectura-card-header-left">
            <span class="lectura-card-word">${word}</span>
            <button class="lectura-card-tts" title="Pronounce">🔊</button>
            <button class="lectura-card-dialect-badge" title="Switch Dialect / Accent: ${currentDialect.name}">${dialectLabel}</button>
            <span class="lectura-card-lang-badge">${isMultiWord ? 'Phrase' : activeLang}</span>
            ${cached?.ipa ? `<span class="lectura-card-ipa">[${cached.ipa}]</span>` : ''}
          </div>
          <button class="lectura-card-close" title="Close">✕</button>
        </div>

        <div class="lectura-card-translation">${initialTransHtml}</div>

        ${contextSentence ? `
          <div class="lectura-card-context">
            “${highlightedContext}”
          </div>
        ` : ''}

        <!-- Lemma Linking Input (only for single words) -->
        ${!isMultiWord ? `
          <div class="lectura-card-lemma-section">
            <div class="lectura-lemma-input-row">
              <span class="lectura-lemma-icon">🔗</span>
              <input type="text" class="lectura-lemma-input" placeholder="Base root (e.g. root)..." value="${existingParent}" />
              <button type="button" class="lectura-lemma-btn-link" title="Link to base root">Link</button>
            </div>
          </div>
        ` : ''}

        <!-- Action buttons: 0, 1-5, Known -->
        <div class="lectura-card-actions">
          <button class="lectura-btn lectura-btn-ignore ${status === 'ignored' || status === '0' ? 'active' : ''}" data-status="0" title="Ignore (0)">🚫</button>
          <button class="lectura-btn lectura-btn-stage ${status === '1' ? 'active' : ''}" data-status="1" title="Stage 1">1</button>
          <button class="lectura-btn lectura-btn-stage ${status === '2' ? 'active' : ''}" data-status="2" title="Stage 2">2</button>
          <button class="lectura-btn lectura-btn-stage ${status === '3' ? 'active' : ''}" data-status="3" title="Stage 3">3</button>
          <button class="lectura-btn lectura-btn-stage ${status === '4' ? 'active' : ''}" data-status="4" title="Stage 4">4</button>
          <button class="lectura-btn lectura-btn-stage ${status === '5' ? 'active' : ''}" data-status="5" title="Stage 5">5</button>
          <button class="lectura-btn lectura-btn-known ${status === 'known' ? 'active' : ''}" data-status="known" title="Known (K)">✔️</button>
        </div>

        <!-- Quick External Dictionary Bar -->
        <div class="lectura-card-dict-bar">
          <button type="button" class="lectura-dict-btn" data-dict="reverso">Reverso</button>
          <button type="button" class="lectura-dict-btn" data-dict="cambridge">Cambridge</button>
          <button type="button" class="lectura-dict-btn" data-dict="wiktionary">Wiktionary</button>
        </div>
      `;
    }

    // Position tooltip fixed relative to viewport
    const popupWidth = (currentTheme === 'extended' || currentTheme === 'glass' || currentTheme === 'calm_light') ? 430 : 320;
    const estimatedHeight = 360;
    const gap = 8;
    const screenPadding = 16;

    let left = rect.left + (rect.width / 2) - (popupWidth / 2);
    left = Math.max(screenPadding, Math.min(left, window.innerWidth - popupWidth - screenPadding));

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    const isAbove = spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow;
    if (isAbove) {
      top = Math.max(screenPadding, rect.top - estimatedHeight - gap);
    } else {
      top = rect.bottom + gap;
    }

    this.tooltipElement.style.position = 'fixed';
    this.tooltipElement.style.top = `${top}px`;
    this.tooltipElement.style.left = `${left}px`;
    this.tooltipElement.style.display = 'block';

    if (isAbove) {
      requestAnimationFrame(() => {
        if (this.tooltipElement) {
          const actualH = this.tooltipElement.offsetHeight;
          if (actualH > 50) {
            this.tooltipElement.style.top = `${Math.max(screenPadding, rect.top - actualH - gap)}px`;
          }
        }
      });
    }

    // Tab switching for Extended and Glass themes
    this.tooltipElement.querySelectorAll('.lectura-tab-btn, .glass-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabName = tabBtn.getAttribute('data-tab');
        this.tooltipElement?.querySelectorAll('.lectura-tab-btn, .glass-tab').forEach((b) => b.classList.remove('active'));
        this.tooltipElement?.querySelectorAll('.lectura-tab-pane, .glass-tab-pane').forEach((p) => p.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetPane = this.tooltipElement?.querySelector(`.lectura-tab-pane[data-pane="${tabName}"], .glass-tab-pane[data-pane="${tabName}"]`);
        targetPane?.classList.add('active');
      });
    });

    // Rating Slider interaction (syncs with status buttons)
    const slider = this.tooltipElement.querySelector('.lectura-proficiency-slider, .glass-neon-slider') as HTMLInputElement | null;
    slider?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseInt(slider.value, 10);
      const targetStatus = sliderToStatus[val] || '1';
      this.tooltipElement?.querySelectorAll('[data-status]').forEach((btn) => {
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
      const transEl = this.tooltipElement?.querySelector('.lectura-card-translation') || this.tooltipElement?.querySelector('.glass-main-translation');
      const translationText = transEl?.textContent || '';
      await this.saveWord(word, translationText, targetStatus, contextSentence, isMultiWord);
      this.showToast(`Saved status: ${targetStatus}`, 'success');
    });

    // Close button listener
    this.tooltipElement.querySelectorAll('.lectura-card-close, .glass-btn-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.hideWordPopup();
      });
    });

    // Dialect click listener (cycles through language dialects e.g. MX -> ES -> US -> AR -> MX)
    this.tooltipElement.querySelectorAll('.lectura-card-dialect-badge, .lectura-dialect-pill, .glass-lang-tag').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentIndex = dialects.findIndex((d) => d.code === currentDialect.code);
        const nextIndex = (currentIndex + 1) % dialects.length;
        currentDialect = dialects[nextIndex];
        this.activeDialectByLang[currentLang] = currentDialect.code;
        const dialectEl = btn as HTMLElement;
        dialectEl.textContent = `${activeLang} | ${currentDialect.label}`;
        dialectEl.title = `Dialect: ${currentDialect.name} (${currentDialect.code})`;
        await chrome.storage.local.set({ [`lectura_tts_dialect_${currentLang}`]: currentDialect.code });
        this.showToast(`Dialect: ${currentDialect.name} (${currentDialect.label})`, 'info');
        this.playTts(word, currentDialect.code);
      });
    });

    // TTS pronunciation listener
    this.tooltipElement.querySelectorAll('.lectura-card-tts, .glass-btn-sound').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.playTts(word, currentDialect.code);
      });
    });

    // Lemma linking logic
    if (!isMultiWord) {
      const linkLemma = async (parentLemma: string) => {
        const cleanParent = parentLemma.trim().toLowerCase();
        if (!cleanParent || cleanParent === lower) return;

        try {
          if (!this.cachedWordLinksByLang[currentLang]) {
            this.cachedWordLinksByLang[currentLang] = {};
          }
          this.cachedWordLinksByLang[currentLang][lower] = cleanParent;
          await StorageService.saveWordLinks(currentLang, this.cachedWordLinksByLang[currentLang]);
          await this.apiClient.saveWordLink({
            wordFrom: word,
            wordTo: cleanParent,
            language: currentLang,
          });

          const currentRootEl = this.tooltipElement?.querySelector('.current-root-name, #current-root-name');
          if (currentRootEl) currentRootEl.textContent = cleanParent;

          const lemmaInput = this.tooltipElement?.querySelector('.lectura-lemma-input, #root-input-field') as HTMLInputElement | null;
          if (lemmaInput) lemmaInput.value = cleanParent;

          this.showToast(`✓ Linked "${word}" ➔ "${cleanParent}"`, 'success');
        } catch (err: any) {
          this.showToast(`Failed to link: ${err?.message || 'Error'}`, 'error');
        }
      };

      this.tooltipElement.querySelectorAll('.suggestion-chip, .lectura-lemma-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetLemma = chip.getAttribute('data-root') || chip.getAttribute('data-lemma') || chip.textContent?.trim() || '';
          if (targetLemma) {
            const lemmaInput = this.tooltipElement?.querySelector('.lectura-lemma-input, #root-input-field, .glass-root-input, .calm-root-field') as HTMLInputElement | null;
            if (lemmaInput) {
              lemmaInput.value = targetLemma;
              lemmaInput.focus();
            }
          }
        });
      });

      const linkBtn = this.tooltipElement.querySelector('.lectura-lemma-btn-link, #btn-link-root, .glass-link-btn');
      const lemmaInput = this.tooltipElement.querySelector('.lectura-lemma-input, #root-input-field, .glass-root-input') as HTMLInputElement | null;
      linkBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (lemmaInput?.value) linkLemma(lemmaInput.value);
      });
      lemmaInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (lemmaInput.value) linkLemma(lemmaInput.value);
        }
      });
    }

    // Status action buttons
    const buttons = this.tooltipElement.querySelectorAll('[data-status]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.getAttribute('data-status') || '1';
        const transEl = this.tooltipElement?.querySelector('.lectura-card-translation') || this.tooltipElement?.querySelector('.glass-main-translation');
        const translationText = transEl?.textContent || '';

        await this.saveWord(word, translationText, newStatus, contextSentence, isMultiWord);
        this.hideWordPopup();
      });
    });

    // External Dictionary buttons
    const dictButtons = this.tooltipElement.querySelectorAll('[data-dict], .glass-dict-btn');
    dictButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dict = btn.getAttribute('data-dict') || (btn.textContent?.toLowerCase().includes('cambridge') ? 'cambridge' : (btn.textContent?.toLowerCase().includes('wiktionary') ? 'wiktionary' : 'reverso'));
        const clean = encodeURIComponent(word.trim());
        let url = '';
        if (dict === 'reverso') {
          url = currentLang === 'es'
            ? `https://context.reverso.net/translation/spanish-russian/${clean}`
            : `https://context.reverso.net/translation/english-russian/${clean}`;
        } else if (dict === 'cambridge') {
          url = `https://dictionary.cambridge.org/dictionary/english/${clean}`;
        } else if (dict === 'wiktionary') {
          url = `https://${currentLang}.wiktionary.org/wiki/${clean}`;
        }
        if (url) {
          window.open(url, '_blank');
        }
      });
    });

    // Fetch live translation if not cached
    if (!cached?.translation || cached.translation.toLowerCase() === 'ха' || cached.translation.toLowerCase() === 'ha') {
      const nativeLang = (this.settings?.nativeLanguage || 'ru').slice(0, 2).toLowerCase();
      const { translationText, baseRoot } = await this.fetchDirectTranslation(word, nativeLang, currentLang);
      if (translationText && this.tooltipElement && this.activeWord.toLowerCase() === lower) {
        const transText = translationText || '— (нет данных)';
        const lines = transText.split('\n').map((l) => l.trim()).filter(Boolean);

        const meaningInput = this.tooltipElement.querySelector<HTMLInputElement>('.calm-meaning-input, .lectura-meaning-input');
        if (meaningInput && (!meaningInput.value || meaningInput.value.toLowerCase() === 'translating...')) {
          meaningInput.value = lines[0] || transText;
        }

        const transEl = this.tooltipElement.querySelector('.lectura-card-translation');
        if (transEl) {
          transEl.innerHTML = this.formatTranslationHtml(transText);
        }
        const glassMain = this.tooltipElement.querySelector('.glass-main-translation');
        const glassSub = this.tooltipElement.querySelector('.glass-sub-definition, .mono-def-text');
        if (glassMain) {
          glassMain.textContent = lines[0] || '';
          if (glassSub && (!glassSub.textContent || glassSub.textContent.includes('No definition'))) {
            glassSub.textContent = lines.slice(1).join('\n') || lines[0] || '';
          }
        }
      }
    }
  }

  private async playTts(word: string, langOrDialect = 'en-US') {
    const cleanWord = word.trim();
    if (!cleanWord) return;

    const lang = langOrDialect || 'en-US';

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
        const u = new SpeechSynthesisUtterance(cleanWord);
        u.lang = lang;
        
        // Find best matching voice for this exact dialect
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const match = voices.find(
            (v) =>
              v.lang.toLowerCase() === lang.toLowerCase() ||
              v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase()
          );
          if (match) {
            u.voice = match;
          }
        }
        window.speechSynthesis.speak(u);
      }
    } catch (_) {}
  }

  private async saveWord(word: string, translation: string, status: string, contextSentence: string, isPhrase = false) {
    try {
      const cleanLower = word.toLowerCase().trim();
      let translationToSave = translation?.trim() || '';

      const invalidPlaceholders = ['translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден'];
      if (invalidPlaceholders.includes(translationToSave.toLowerCase()) || translationToSave.toLowerCase() === cleanLower) {
        translationToSave = '';
      }

      const tags = ['web_reader_extension'];
      if (isPhrase || word.includes(' ')) {
        tags.push('phrase');
      }

      const currentLang = await getEffectiveLanguage(contextSentence || word) || this.activePopupLang || 'en';

      await this.apiClient.saveWord({
        word,
        lemma: cleanLower,
        translation: translationToSave,
        status,
        contextSentence,
        sentence: contextSentence,
        targetLanguage: currentLang,
        language_code: currentLang,
        language: currentLang,
        language_id: currentLang,
        source_url: window.location.href,
        is_phrase: isPhrase || word.includes(' '),
        tags,
      });

      if (!this.cachedWordsByLang[currentLang]) {
        this.cachedWordsByLang[currentLang] = {};
      }
      this.cachedWordsByLang[currentLang][cleanLower] = { status, translation: translationToSave };
      this.showToast(`Saved '${word}' (${status}) [${currentLang.toUpperCase()}]`, 'success');
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

  public applyPopupTheme(themeName: string) {
    const theme = (themeName || 'compact') as 'compact' | 'extended' | 'glass' | 'calm_light';
    if (this.settings) {
      this.settings.popupTheme = theme;
    }
    if (this.tooltipElement) {
      this.tooltipElement.classList.remove(
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
        this.tooltipElement.className = 'lectura-word-card theme-calm-light calm_light';
      } else if (theme === 'glass') {
        this.tooltipElement.className = 'lectura-word-card theme-glass-v2 glass';
      } else if (theme === 'extended') {
        this.tooltipElement.className = 'lectura-word-card extended theme-extended';
      } else {
        this.tooltipElement.className = 'lectura-word-card compact theme-compact';
      }
    }
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
      if (message.type === 'VOCABULARY_UPDATED') {
        StorageService.getSettings().then((freshSettings) => {
          this.settings = freshSettings;
          const studyLang = (message as any).language || freshSettings.targetLanguage;
          this.syncVocabulary(studyLang);
        });
      }
      if (message.type === 'UPDATE_POPUP_THEME' && (message as any).theme) {
        this.applyPopupTheme((message as any).theme);
      }
      if (message.type === 'UPDATE_UI_LANGUAGE' && (message as any).language) {
        if (this.settings) {
          this.settings.interfaceLanguage = (message as any).language;
        }
      }
      if (message.type === 'EXTRACT_ARTICLE') {
        try {
          const extracted = ArticleExtractor.extract(document);
          sendResponse({ success: true, article: extracted });
        } catch (err: any) {
          sendResponse({ success: false, error: err.message });
        }
      }
      return true;
    });

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'sync' || area === 'local') {
        this.settings = await StorageService.getSettings();

        // If extension disabled or site became blacklisted -> immediately close any active tooltip
        if (!this.isExtensionActiveOnPage()) {
          this.hideWordPopup();
        }

        if (changes.popupTheme || changes.popup_theme) {
          const newTheme = changes.popupTheme?.newValue || changes.popup_theme?.newValue || 'compact';
          this.applyPopupTheme(newTheme);
        }
        if (changes.interfaceLanguage) {
          if (this.settings) {
            this.settings.interfaceLanguage = changes.interfaceLanguage.newValue;
          }
        }
      }
    });
  }
}

// Initialize Page Reader
new PageReader();
