import { ExtensionSettings, WordMap } from '../types/index';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  serverUrl: 'http://localhost:3000',
  authToken: '',
  syncKey: '',
  selectedUserId: '',
  selectedUserEmail: '',
  targetLanguage: 'en',
  nativeLanguage: 'ru',
  enableYoutubeOverlay: true,
  trackListeningActivity: true,
  enableDualSubtitles: false,
  subtitleSizePreset: 'md',
  captureVideoSnapshot: false,
  pauseOnWordClick: false,
  enableInSituSelection: true,
  highlightKnownWords: false,
  autoPauseOnHover: true,
  subtitleFontSize: 22,
  subtitleBgOpacity: 75,
  subtitleBgColor: 'rgba(0, 0, 0, 0.45)',
  subtitleHighlightMode: 'color',
  ttsDialect: 'en-US',
  popupTheme: 'glass',
  interfaceLanguage: 'en',
  isEnabled: true,
  onlyOnModifierKey: false,
  modifierKey: 'alt',
  disabledDomains: ['chatgpt.com', 'claude.ai', 'gemini.google.com'],
  domainFilterMode: 'blacklist',
};

export function normalizeLangKey(lang?: string): string {
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

export class StorageService {
  /**
   * Cleans up legacy mixed-language caches to ensure pure isolation for homonyms
   */
  static async purgeLegacyCaches(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(
        ['words_cache', 'lectura_words_cache', 'cached_words_all', 'cached_words_undefined', 'cached_words_null'],
        () => resolve()
      );
    });
  }

  /**
   * Retrieves user settings with fallback defaults
   */
  static async getSettings(): Promise<ExtensionSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, (localItems) => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (syncItems) => {
          const merged = {
            ...DEFAULT_SETTINGS,
            ...(syncItems || {}),
            ...(localItems || {}),
          };
          resolve(merged);
        });
      });
    });
  }

  /**
   * Saves settings to sync and local storage
   */
  static async saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(settings, () => {
        chrome.storage.sync.set(settings, () => {
          resolve();
        });
      });
    });
  }

  /**
   * Gets cached dictionary map strictly scoped by language
   */
  static async getCachedWords(lang: string): Promise<WordMap> {
    const langKey = normalizeLangKey(lang);
    return new Promise((resolve) => {
      const key = `cached_words_${langKey}`;
      const vocabCacheKey = `vocab_cache_${langKey}`;
      chrome.storage.local.get([key, vocabCacheKey], (res) => {
        resolve(res[key] || res[vocabCacheKey] || {});
      });
    });
  }

  /**
   * Updates cached dictionary map in local storage strictly scoped by language
   */
  static async setCachedWords(lang: string, words: WordMap): Promise<void> {
    const langKey = normalizeLangKey(lang);
    return new Promise((resolve) => {
      const key = `cached_words_${langKey}`;
      const vocabCacheKey = `vocab_cache_${langKey}`;
      chrome.storage.local.set({ [key]: words, [vocabCacheKey]: words }, () => resolve());
    });
  }

  /**
   * Caches or updates a single word entry in local storage strictly scoped by language
   */
  static async updateCachedWord(lang: string, word: string, item: { status: string; translation: string; ipa?: string }): Promise<void> {
    const langKey = normalizeLangKey(lang);
    const words = await this.getCachedWords(langKey);
    words[word.toLowerCase().trim()] = item;
    await this.setCachedWords(langKey, words);
  }
}
