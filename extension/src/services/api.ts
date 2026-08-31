import {
  ExtensionSettings,
  HealthCheckResponse,
  SaveLessonPayload,
  SaveWordPayload,
  WordMap,
  YouTubeActivityPayload,
} from '../types/index';
import { StorageService } from './storage';

export class LecturaApiClient {
  private settings?: ExtensionSettings;

  constructor(settings?: ExtensionSettings) {
    this.settings = settings;
  }

  private async getActiveSettings(): Promise<ExtensionSettings> {
    if (this.settings) return this.settings;
    return await StorageService.getSettings();
  }

  private buildHeaders(settings: ExtensionSettings): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (settings.selectedUserId && settings.selectedUserId.trim()) {
      headers['x-local-sync-user'] = settings.selectedUserId.trim();
    }

    if (settings.authToken && settings.authToken.trim()) {
      const clean = settings.authToken.trim();
      headers['Authorization'] = clean.startsWith('Bearer ') ? clean : `Bearer ${clean}`;
    }

    if (settings.syncKey && settings.syncKey.trim()) {
      headers['x-local-sync-key'] = settings.syncKey.trim();
    }

    return headers;
  }

  /**
   * Fetches registered user accounts from Lectura server
   */
  async getProfiles(): Promise<{ id: string; email: string; displayName: string }[]> {
    if (this.isContentScript()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PROFILES' }, (response) => {
          if (response?.success && response.data) {
            resolve(response.data);
          } else {
            resolve([]);
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/auth/profiles');
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const data = await response.json();
        return data.users || [];
      }
    } catch (_) {}
    return [];
  }

  private sanitizeUrl(baseUrl: string, path: string): string {
    const cleanBase = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  private isContentScript(): boolean {
    return typeof window !== 'undefined' && typeof chrome !== 'undefined' && !!chrome.runtime?.id && !location.protocol.startsWith('chrome-extension');
  }

  /**
   * Tests connection and health of the target Lectura instance
   */
  async checkHealth(): Promise<HealthCheckResponse> {
    if (this.isContentScript()) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Failed to connect'));
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/health');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err: any) {
      console.warn('[Lectura API] Health check unavailable:', err?.message || err);
      throw new Error(err.message || 'Failed to connect to Lectura server');
    }
  }

  /**
   * Validates current authenticated user session
   */
  async checkAuth(): Promise<{ user?: any; authenticated: boolean; error?: string }> {
    const settings = await this.getActiveSettings();
    if (!settings.authToken && !settings.syncKey) {
      return { authenticated: true };
    }

    const url = this.sanitizeUrl(settings.serverUrl, '/api/auth/me');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401) {
        return { authenticated: false, error: 'Unauthorized or token expired' };
      }

      if (!response.ok) {
        return { authenticated: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { user: data.user, authenticated: true };
    } catch (err: any) {
      return { authenticated: false, error: err.message || 'Connection error' };
    }
  }

  /**
   * Imports or creates a new lesson in Lectura
   */
  async saveLesson(payload: SaveLessonPayload): Promise<{ status: string; id: string; lesson: any }> {
    if (this.isContentScript()) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'SAVE_LESSON', payload }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Failed to save lesson'));
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/lessons');

    const bodyData = {
      ...payload,
      targetLanguage: payload.targetLanguage || settings.targetLanguage,
      translationLanguage: payload.translationLanguage || settings.nativeLanguage,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: JSON.stringify(bodyData),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err: any) {
      console.warn('[Lectura API] Save lesson failed:', err?.message || err);
      throw err;
    }
  }

  /**
   * Saves or updates a word / vocabulary entry
   */
  async saveWord(payload: SaveWordPayload): Promise<{ status: string; word: string; wordStatus: string; translation: string }> {
    if (this.isContentScript()) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'SAVE_WORD', payload }, async (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response?.success) {
            const settings = await this.getActiveSettings();
            const lang = payload.targetLanguage || payload.language_code || payload.language || settings.targetLanguage || 'en';
            await StorageService.updateCachedWord(lang, payload.word, {
              status: payload.status,
              translation: payload.translation,
              ipa: payload.ipa,
            });
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Failed to save word'));
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/words');

    const effectiveLang = payload.targetLanguage || payload.language_code || payload.language || settings.targetLanguage || 'en';
    const bodyData = {
      ...payload,
      targetLanguage: effectiveLang,
      language_code: effectiveLang,
      language: effectiveLang,
      language_id: effectiveLang,
      lemma: payload.lemma || payload.word,
      sentence: payload.sentence || payload.contextSentence || '',
      contextSentence: payload.contextSentence || payload.sentence || '',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: JSON.stringify(bodyData),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // Update local storage cache
      await StorageService.updateCachedWord(effectiveLang, payload.word, {
        status: payload.status,
        translation: payload.translation,
        ipa: payload.ipa,
      });

      return result;
    } catch (err: any) {
      console.warn('[Lectura API] Save word failed:', err?.message || err);
      throw err;
    }
  }

  /**
   * Fetches vocabulary map for the specified language
   */
  async getWords(lang?: string): Promise<{ words: any[]; map: WordMap; count?: number }> {
    if (this.isContentScript()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_WORDS', payload: { language: lang } }, (response) => {
          if (response?.success && response.data) {
            resolve(response.data);
          } else {
            StorageService.getCachedWords(lang || 'all').then((cached) => {
              resolve({ words: [], map: cached });
            });
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const targetLang = lang || settings.targetLanguage || '';
    const queryParam = targetLang ? `?lang=${encodeURIComponent(targetLang)}` : '';
    const url = this.sanitizeUrl(settings.serverUrl, `/api/words${queryParam}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.map) {
        await StorageService.setCachedWords(targetLang || 'en', data.map);
      }
      return data;
    } catch (err: any) {
      console.warn('[Lectura API] Fetch words failed, returning local cached version:', err?.message || err);
      const cached = await StorageService.getCachedWords(targetLang || 'en');
      return { words: [], map: cached };
    }
  }

  /**
   * Batch checks word statuses for a list of words, strictly scoped to the specified language
   */
  async getBatchWordStatuses(
    words: string[],
    language: string
  ): Promise<{ map: WordMap; count: number }> {
    if (!words || words.length === 0) {
      return { map: {}, count: 0 };
    }

    const effectiveLang = language || 'en';

    if (this.isContentScript()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'BATCH_WORD_STATUS', payload: { words, language: effectiveLang } },
          (response) => {
            if (response?.success && response.data?.map) {
              resolve(response.data);
            } else {
              StorageService.getCachedWords(effectiveLang).then((cached) => {
                const filtered: WordMap = {};
                for (const w of words) {
                  const lower = w.toLowerCase().trim();
                  if (cached[lower]) filtered[lower] = cached[lower];
                }
                resolve({ map: filtered, count: Object.keys(filtered).length });
              });
            }
          }
        );
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/words/batch-status');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: JSON.stringify({
          language: effectiveLang,
          language_code: effectiveLang,
          targetLanguage: effectiveLang,
          words,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.map) {
        const currentCache = await StorageService.getCachedWords(effectiveLang);
        await StorageService.setCachedWords(effectiveLang, { ...currentCache, ...data.map });
      }
      return { map: data.map || {}, count: data.count || 0 };
    } catch (err: any) {
      console.warn('[Lectura API] Batch lookup failed, using local cache:', err?.message || err);
      const cached = await StorageService.getCachedWords(effectiveLang);
      const filtered: WordMap = {};
      for (const w of words) {
        const lower = w.toLowerCase().trim();
        if (cached[lower]) filtered[lower] = cached[lower];
      }
      return { map: filtered, count: Object.keys(filtered).length };
    }
  }

  /**
   * Translates a single word or phrase via Lectura translate service (with service-worker routing & fallback)
   */
  async translateText(
    text: string,
    sourceLang?: string,
    targetLang?: string
  ): Promise<{ text: string; translation: string; sourceLang?: string; targetLang?: string }> {
    if (this.isContentScript()) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Translation timeout (5s)'));
        }, 5000);

        chrome.runtime.sendMessage(
          {
            type: 'TRANSLATE_TEXT',
            payload: { text, sourceLang, targetLang },
          },
          (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response?.success && response.data) {
              resolve(response.data);
            } else {
              reject(new Error(response?.error || 'Translation failed'));
            }
          }
        );
      });
    }

    const settings = await this.getActiveSettings();
    const sLang = sourceLang || settings.targetLanguage;
    const tLang = targetLang || settings.nativeLanguage;
    const url = this.sanitizeUrl(settings.serverUrl, '/api/translate');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: JSON.stringify({
          text,
          sourceLanguage: sLang,
          targetLanguage: tLang,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      console.warn('[Lectura API] Translation failed, fallback active:', err?.message || err);
      throw err;
    }
  }

  /**
   * Saves a parent/child word link (e.g. were -> be)
   */
  async saveWordLink(payload: { wordFrom: string; wordTo: string; language?: string }): Promise<any> {
    if (this.isContentScript()) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'SAVE_WORD_LINK', payload }, (response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (response?.success) resolve(response.data);
          else reject(new Error(response?.error || 'Failed to link word'));
        });
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/word-links');
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(settings),
      body: JSON.stringify({
        word_from: payload.wordFrom,
        word_to: payload.wordTo,
        language_code: payload.language || settings.targetLanguage,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  /**
   * Fetches word parent links dictionary for a target language
   */
  async getWordLinks(language?: string): Promise<Record<string, string>> {
    if (this.isContentScript()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_WORD_LINKS', payload: { language } }, (response) => {
          if (response?.success && response.data?.links) {
            resolve(response.data.links);
          } else {
            resolve({});
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const lang = language || settings.targetLanguage;
    const url = this.sanitizeUrl(settings.serverUrl, `/api/word-links?language=${encodeURIComponent(lang)}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        return data.links || {};
      }
    } catch (_) {}
    return {};
  }

  /**
   * Lemmatizes a word using Lectura morphology / AI lemmatizer
   */
  async lemmatizeWord(word: string, language?: string): Promise<string | null> {
    if (this.isContentScript()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'LEMMATIZE_WORD', payload: { word, language } }, (response) => {
          if (response?.success && response.data) {
            resolve(response.data);
          } else {
            resolve(null);
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const lang = language || settings.targetLanguage;
    const url = this.sanitizeUrl(settings.serverUrl, '/api/lemmatize-text');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: JSON.stringify({ words: [word], targetLanguage: lang }),
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.lemmas && data.lemmas[word.toLowerCase()]) {
          return data.lemmas[word.toLowerCase()];
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Logs media watch/listening activity to Lectura server
   */
  async logActivity(payload: YouTubeActivityPayload): Promise<{ success: boolean; loggedSeconds?: number; totalListeningSeconds?: number }> {
    if (this.isContentScript()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'LOG_YOUTUBE_ACTIVITY', payload }, (response) => {
          if (response?.success) {
            resolve(response.data || { success: true });
          } else {
            resolve({ success: false });
          }
        });
      });
    }

    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, '/api/history/track-activity');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(settings),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err: any) {
      console.warn('[LecturaApiClient] Failed to log activity to server:', err?.message || err);
    }
    return { success: false };
  }

  /**
   * Retrieves reading / listening activity history
   */
  async getActivityHistory(language?: string): Promise<{
    success: boolean;
    history: any[];
    userGoals?: { dailyGoalMinutes?: number; dailyGoalsByLanguage?: Record<string, number> };
    customFlags?: Record<string, string>;
  }> {
    const settings = await this.getActiveSettings();
    const langParam = language && language !== 'all' ? `?language=${encodeURIComponent(language)}` : '';
    const url = this.sanitizeUrl(settings.serverUrl, `/api/history${langParam}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          history: data.history || [],
          userGoals: data.userGoals,
          customFlags: data.customFlags,
        };
      }
    } catch (err: any) {
      console.warn('[LecturaApiClient] Failed to fetch activity history:', err?.message || err);
    }
    return { success: false, history: [] };
  }

  /**
   * Retrieves activity history logs for a specific day (YYYY-MM-DD)
   */
  async getDayActivity(dateStr: string, language?: string): Promise<{ success: boolean; logs: any[] }> {
    const settings = await this.getActiveSettings();
    const langParam = language && language !== 'all' ? `&language=${encodeURIComponent(language)}` : '';
    const url = this.sanitizeUrl(settings.serverUrl, `/api/activity/day?date=${encodeURIComponent(dateStr)}${langParam}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        return { success: true, logs: data.logs || [] };
      }
    } catch (err: any) {
      console.warn('[LecturaApiClient] Failed to fetch day activity:', err?.message || err);
    }
    return { success: false, logs: [] };
  }

  /**
   * Deletes a specific activity log entry
   */
  async deleteActivityLog(logId: string | number): Promise<{ success: boolean }> {
    const settings = await this.getActiveSettings();
    const url = this.sanitizeUrl(settings.serverUrl, `/api/activity/log/${encodeURIComponent(String(logId))}`);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(settings),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return { success: true };
      }
    } catch (err: any) {
      console.warn('[LecturaApiClient] Failed to delete activity log:', err?.message || err);
    }
    return { success: false };
  }
}
