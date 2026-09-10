(() => {
  // extension/src/services/storage.ts
  var DEFAULT_SETTINGS = {
    serverUrl: "http://localhost:3000",
    authToken: "",
    syncKey: "",
    selectedUserId: "",
    selectedUserEmail: "",
    targetLanguage: "en",
    nativeLanguage: "ru",
    enableYoutubeOverlay: true,
    trackListeningActivity: true,
    enableDualSubtitles: false,
    subtitleSizePreset: "md",
    captureVideoSnapshot: false,
    pauseOnWordClick: false,
    enableInSituSelection: true,
    highlightKnownWords: false,
    autoPauseOnHover: true,
    subtitleFontSize: 22,
    subtitleBgOpacity: 75,
    subtitleBgColor: "rgba(0, 0, 0, 0.45)",
    subtitleHighlightMode: "color",
    ttsDialect: "en-US",
    popupTheme: "glass",
    interfaceLanguage: "en",
    isEnabled: true,
    onlyOnModifierKey: false,
    modifierKey: "alt",
    disabledDomains: ["chatgpt.com", "claude.ai", "gemini.google.com"],
    domainFilterMode: "blacklist"
  };
  function normalizeLangKey(lang) {
    if (!lang) return "en";
    const l = lang.trim().toLowerCase();
    if (l.startsWith("es") || l.includes("span")) return "es";
    if (l.startsWith("en") || l.includes("engl")) return "en";
    if (l.startsWith("fr") || l.includes("fren")) return "fr";
    if (l.startsWith("de") || l.includes("germ")) return "de";
    if (l.startsWith("ru") || l.includes("russ")) return "ru";
    if (l.startsWith("it") || l.includes("ital")) return "it";
    if (l.startsWith("pt") || l.includes("port")) return "pt";
    if (l.startsWith("zh") || l.includes("chin")) return "zh";
    if (l.startsWith("ja") || l.includes("jap")) return "ja";
    if (l.startsWith("ko") || l.includes("kore")) return "ko";
    return l.slice(0, 2);
  }
  var StorageService = class {
    /**
     * Cleans up legacy mixed-language caches to ensure pure isolation for homonyms
     */
    static async purgeLegacyCaches() {
      return new Promise((resolve) => {
        chrome.storage.local.remove(
          ["words_cache", "lectura_words_cache", "cached_words_all", "cached_words_undefined", "cached_words_null"],
          () => resolve()
        );
      });
    }
    /**
     * Retrieves user settings with fallback defaults
     */
    static async getSettings() {
      return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_SETTINGS, (localItems) => {
          chrome.storage.sync.get(DEFAULT_SETTINGS, (syncItems) => {
            const merged = {
              ...DEFAULT_SETTINGS,
              ...syncItems || {},
              ...localItems || {}
            };
            resolve(merged);
          });
        });
      });
    }
    /**
     * Saves settings to sync and local storage
     */
    static async saveSettings(settings) {
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
    static async getCachedWords(lang) {
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
    static async setCachedWords(lang, words) {
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
    static async updateCachedWord(lang, word, item) {
      const langKey = normalizeLangKey(lang);
      const words = await this.getCachedWords(langKey);
      words[word.toLowerCase().trim()] = item;
      await this.setCachedWords(langKey, words);
    }
  };

  // extension/src/services/api.ts
  var LecturaApiClient = class {
    constructor(settings) {
      this.settings = settings;
    }
    async getActiveSettings() {
      if (this.settings) return this.settings;
      return await StorageService.getSettings();
    }
    buildHeaders(settings) {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      const userId = (settings.selectedUserId || "").trim();
      const userEmail = (settings.selectedUserEmail || "").trim();
      if (userId) {
        headers["x-local-sync-user"] = userId;
        headers["X-User-Id"] = userId;
        if (userId.includes("@") && !userEmail) {
          headers["X-User-Email"] = userId;
        }
      }
      if (userEmail) {
        headers["X-User-Email"] = userEmail;
        if (!headers["x-local-sync-user"]) {
          headers["x-local-sync-user"] = userEmail;
        }
      }
      if (settings.authToken && settings.authToken.trim()) {
        const clean = settings.authToken.trim();
        headers["Authorization"] = clean.startsWith("Bearer ") ? clean : `Bearer ${clean}`;
      }
      if (settings.syncKey && settings.syncKey.trim()) {
        headers["x-local-sync-key"] = settings.syncKey.trim();
        headers["X-Local-Sync-Key"] = settings.syncKey.trim();
      }
      return headers;
    }
    /**
     * Fetches registered user accounts from Lectura server
     */
    async getProfiles() {
      if (this.isContentScript()) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_PROFILES" }, (response) => {
            if (response?.success && response.data) {
              resolve(response.data);
            } else {
              resolve([]);
            }
          });
        });
      }
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, "/api/auth/profiles");
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(4e3)
        });
        if (response.ok) {
          const data = await response.json();
          return data.users || [];
        }
      } catch (_) {
      }
      return [];
    }
    sanitizeUrl(baseUrl, path) {
      const cleanBase = (baseUrl || "http://localhost:3000").replace(/\/+$/, "");
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      return `${cleanBase}${cleanPath}`;
    }
    isContentScript() {
      return typeof window !== "undefined" && typeof chrome !== "undefined" && !!chrome.runtime?.id && !location.protocol.startsWith("chrome-extension");
    }
    /**
     * Tests connection and health of the target Lectura instance
     */
    async checkHealth() {
      if (this.isContentScript()) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "CHECK_HEALTH" }, (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response?.success) {
              resolve(response.data);
            } else {
              reject(new Error(response?.error || "Failed to connect"));
            }
          });
        });
      }
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, "/api/health");
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(5e3)
        });
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        return await response.json();
      } catch (err) {
        console.warn("[Lectura API] Health check unavailable:", err?.message || err);
        throw new Error(err.message || "Failed to connect to Lectura server");
      }
    }
    /**
     * Validates current authenticated user session
     */
    async checkAuth() {
      const settings = await this.getActiveSettings();
      if (!settings.authToken && !settings.syncKey) {
        return { authenticated: true };
      }
      const url = this.sanitizeUrl(settings.serverUrl, "/api/auth/me");
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(5e3)
        });
        if (response.status === 401) {
          return { authenticated: false, error: "Unauthorized or token expired" };
        }
        if (!response.ok) {
          return { authenticated: false, error: `HTTP ${response.status}` };
        }
        const data = await response.json();
        return { user: data.user, authenticated: true };
      } catch (err) {
        return { authenticated: false, error: err.message || "Connection error" };
      }
    }
    /**
     * Imports or creates a new lesson in Lectura
     */
    async saveLesson(payload) {
      if (this.isContentScript()) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "SAVE_LESSON", payload }, (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response?.success) {
              resolve(response.data);
            } else {
              reject(new Error(response?.error || "Failed to save lesson"));
            }
          });
        });
      }
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, "/api/lessons");
      const bodyData = {
        ...payload,
        targetLanguage: payload.targetLanguage || settings.targetLanguage,
        translationLanguage: payload.translationLanguage || settings.nativeLanguage
      };
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(settings),
          body: JSON.stringify(bodyData),
          signal: AbortSignal.timeout(1e4)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
      } catch (err) {
        console.warn("[Lectura API] Save lesson failed:", err?.message || err);
        throw err;
      }
    }
    /**
     * Saves or updates a word / vocabulary entry
     */
    async saveWord(payload) {
      if (this.isContentScript()) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "SAVE_WORD", payload }, async (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response?.success) {
              const settings2 = await this.getActiveSettings();
              const lang = payload.targetLanguage || payload.language_code || payload.language || settings2.targetLanguage || "en";
              await StorageService.updateCachedWord(lang, payload.word, {
                status: payload.status,
                translation: payload.translation,
                ipa: payload.ipa
              });
              resolve(response.data);
            } else {
              reject(new Error(response?.error || "Failed to save word"));
            }
          });
        });
      }
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, "/api/words");
      const effectiveLang = payload.targetLanguage || payload.language_code || payload.language || settings.targetLanguage || "en";
      const bodyData = {
        ...payload,
        targetLanguage: effectiveLang,
        language_code: effectiveLang,
        language: effectiveLang,
        language_id: effectiveLang,
        lemma: payload.lemma || payload.word,
        sentence: payload.sentence || payload.contextSentence || "",
        contextSentence: payload.contextSentence || payload.sentence || ""
      };
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(settings),
          body: JSON.stringify(bodyData),
          signal: AbortSignal.timeout(8e3)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        const result = await response.json();
        await StorageService.updateCachedWord(effectiveLang, payload.word, {
          status: payload.status,
          translation: payload.translation,
          ipa: payload.ipa
        });
        return result;
      } catch (err) {
        console.warn("[Lectura API] Save word failed:", err?.message || err);
        throw err;
      }
    }
    /**
     * Fetches vocabulary map for the specified language
     */
    async getWords(lang) {
      if (this.isContentScript()) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_WORDS", payload: { language: lang } }, (response) => {
            if (response?.success && response.data) {
              resolve(response.data);
            } else {
              StorageService.getCachedWords(lang || "all").then((cached) => {
                resolve({ words: [], map: cached });
              });
            }
          });
        });
      }
      const settings = await this.getActiveSettings();
      const targetLang = lang || settings.targetLanguage || "";
      const queryParam = targetLang ? `?lang=${encodeURIComponent(targetLang)}` : "";
      const url = this.sanitizeUrl(settings.serverUrl, `/api/words${queryParam}`);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(8e3)
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.map) {
          await StorageService.setCachedWords(targetLang || "en", data.map);
        }
        return data;
      } catch (err) {
        console.warn("[Lectura API] Fetch words failed, returning local cached version:", err?.message || err);
        const cached = await StorageService.getCachedWords(targetLang || "en");
        return { words: [], map: cached };
      }
    }
    /**
     * Batch checks word statuses for a list of words, strictly scoped to the specified language
     */
    async getBatchWordStatuses(words, language) {
      if (!words || words.length === 0) {
        return { map: {}, count: 0 };
      }
      const effectiveLang = language || "en";
      if (this.isContentScript()) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "BATCH_WORD_STATUS", payload: { words, language: effectiveLang } },
            (response) => {
              if (response?.success && response.data?.map) {
                resolve(response.data);
              } else {
                StorageService.getCachedWords(effectiveLang).then((cached) => {
                  const filtered = {};
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
      const url = this.sanitizeUrl(settings.serverUrl, "/api/words/batch-status");
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(settings),
          body: JSON.stringify({
            language: effectiveLang,
            language_code: effectiveLang,
            targetLanguage: effectiveLang,
            words
          }),
          signal: AbortSignal.timeout(8e3)
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
      } catch (err) {
        console.warn("[Lectura API] Batch lookup failed, using local cache:", err?.message || err);
        const cached = await StorageService.getCachedWords(effectiveLang);
        const filtered = {};
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
    async translateText(text, sourceLang, targetLang) {
      if (this.isContentScript()) {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Translation timeout (5s)"));
          }, 5e3);
          chrome.runtime.sendMessage(
            {
              type: "TRANSLATE_TEXT",
              payload: { text, sourceLang, targetLang }
            },
            (response) => {
              clearTimeout(timeoutId);
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              if (response?.success && response.data) {
                resolve(response.data);
              } else {
                reject(new Error(response?.error || "Translation failed"));
              }
            }
          );
        });
      }
      const settings = await this.getActiveSettings();
      const sLang = sourceLang || settings.targetLanguage;
      const tLang = targetLang || settings.nativeLanguage;
      const url = this.sanitizeUrl(settings.serverUrl, "/api/translate");
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(settings),
          body: JSON.stringify({
            text,
            sourceLanguage: sLang,
            targetLanguage: tLang
          }),
          signal: AbortSignal.timeout(8e3)
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (err) {
        console.warn("[Lectura API] Translation failed, fallback active:", err?.message || err);
        throw err;
      }
    }
    /**
     * Saves a parent/child word link (e.g. were -> be)
     */
    async saveWordLink(payload) {
      if (this.isContentScript()) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "SAVE_WORD_LINK", payload }, (response2) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (response2?.success) resolve(response2.data);
            else reject(new Error(response2?.error || "Failed to link word"));
          });
        });
      }
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, "/api/word-links");
      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(settings),
        body: JSON.stringify({
          word_from: payload.wordFrom,
          word_to: payload.wordTo,
          language_code: payload.language || settings.targetLanguage
        }),
        signal: AbortSignal.timeout(6e3)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }
    /**
     * Fetches word parent links dictionary for a target language
     */
    async getWordLinks(language) {
      if (this.isContentScript()) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_WORD_LINKS", payload: { language } }, (response) => {
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
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(5e3)
        });
        if (response.ok) {
          const data = await response.json();
          return data.links || {};
        }
      } catch (_) {
      }
      return {};
    }
    /**
     * Lemmatizes a word using Lectura morphology / AI lemmatizer
     */
    async lemmatizeWord(word, language) {
      if (this.isContentScript()) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "LEMMATIZE_WORD", payload: { word, language } }, (response) => {
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
      const url = this.sanitizeUrl(settings.serverUrl, "/api/lemmatize-text");
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(settings),
          body: JSON.stringify({ words: [word], targetLanguage: lang }),
          signal: AbortSignal.timeout(4e3)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.lemmas && data.lemmas[word.toLowerCase()]) {
            return data.lemmas[word.toLowerCase()];
          }
        }
      } catch (_) {
      }
      return null;
    }
    /**
     * Logs media watch/listening activity to Lectura server
     */
    async logActivity(payload) {
      if (this.isContentScript()) {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "LOG_YOUTUBE_ACTIVITY", payload }, (response) => {
            if (response?.success) {
              resolve(response.data || { success: true });
            } else {
              resolve({ success: false });
            }
          });
        });
      }
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, "/api/history/track-activity");
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(settings),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5e3)
        });
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        console.warn("[LecturaApiClient] Failed to log activity to server:", err?.message || err);
      }
      return { success: false };
    }
    /**
     * Retrieves reading / listening activity history
     */
    async getActivityHistory(language) {
      const settings = await this.getActiveSettings();
      const langParam = language && language !== "all" ? `?language=${encodeURIComponent(language)}` : "";
      const url = this.sanitizeUrl(settings.serverUrl, `/api/history${langParam}`);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(5e3)
        });
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            history: data.history || [],
            userGoals: data.userGoals,
            customFlags: data.customFlags
          };
        }
      } catch (err) {
        console.warn("[LecturaApiClient] Failed to fetch activity history:", err?.message || err);
      }
      return { success: false, history: [] };
    }
    /**
     * Retrieves activity history logs for a specific day (YYYY-MM-DD)
     */
    async getDayActivity(dateStr, language) {
      const settings = await this.getActiveSettings();
      const langParam = language && language !== "all" && language !== "overall" ? `&language=${encodeURIComponent(language)}` : "";
      const tzParam = `&tzOffset=${(/* @__PURE__ */ new Date()).getTimezoneOffset()}`;
      const url = this.sanitizeUrl(settings.serverUrl, `/api/activity/day?date=${encodeURIComponent(dateStr)}${langParam}${tzParam}`);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(5e3)
        });
        if (response.ok) {
          const data = await response.json();
          return { success: true, logs: data.logs || [] };
        }
      } catch (err) {
        console.warn("[LecturaApiClient] Failed to fetch day activity:", err?.message || err);
      }
      return { success: false, logs: [] };
    }
    /**
     * Deletes a specific activity log entry
     */
    async deleteActivityLog(logId) {
      const settings = await this.getActiveSettings();
      const url = this.sanitizeUrl(settings.serverUrl, `/api/activity/log/${encodeURIComponent(String(logId))}`);
      try {
        const response = await fetch(url, {
          method: "DELETE",
          headers: this.buildHeaders(settings),
          signal: AbortSignal.timeout(5e3)
        });
        if (response.ok) {
          return { success: true };
        }
      } catch (err) {
        console.warn("[LecturaApiClient] Failed to delete activity log:", err?.message || err);
      }
      return { success: false };
    }
  };

  // extension/src/services/i18n.ts
  var EXTENSION_TRANSLATIONS = {
    en: {
      // Brand & Header
      settings_title: "Lectura Extension Settings",
      settings_subtitle: "Configure connectivity, YouTube interactive overlays, and in-situ reading preferences",
      checking_connection: "Checking...",
      connected: "Connected",
      disconnected: "Disconnected",
      server_unreachable: "Server Unreachable",
      test_connection: "Test",
      test_connection_full: "Test Connection",
      save_config: "Save",
      save_all_changes: "Save All Changes",
      all_settings_saved: "All settings saved successfully!",
      // Tabs
      tab_settings: "\u2699\uFE0F Settings",
      tab_activity: "\u{1F4CA} Activity",
      tab_connection: "Connection",
      tab_youtube: "YouTube",
      tab_webreader: "Web Reader",
      tab_filters: "Site Filters",
      settings_auto_sync: "Settings auto-sync with active tabs",
      // Sections
      section_connection: "Connection & Authentication",
      section_connection_desc: "Specify your local or remote Lectura server URL and access credentials.",
      section_subtitles: "YouTube Interactive Subtitles Overlay",
      section_subtitles_desc: "Interactive tokenized captions with hotkeys, hover dictionary, and pause controls on YouTube videos.",
      section_reader: "Web Page Word Lookup & Selection",
      section_reader_desc: "Instant word translation and SRS vocabulary saving across arbitrary websites.",
      // Form fields
      server_url: "Server URL",
      server_url_hint: "Include protocol and port (e.g., http://localhost:3000 or https://lectura.yourdomain.com).",
      target_profile: "Profile / Account",
      target_profile_hint: "Select which Lectura account receives vocabulary and lesson imports.",
      default_profile: "\u{1F310} Default Profile (Single User / Guest)",
      auth_token: "Auth Token / Sync Key (Optional)",
      auth_token_full: "Authorization Token (Bearer)",
      auth_token_hint: "Required only if your Lectura server has authentication enabled.",
      sync_key: "Local Sync Key (Fallback)",
      sync_key_hint: "Matches LOCAL_SYNC_KEY on your server.",
      study_lang: "Study Language",
      translate_to: "Translation / Native Language",
      tts_dialect: "TTS Engine & Dialect",
      ui_language: "Interface Language",
      word_popup_theme: "Word Popup Theme",
      subtitle_style: "Subtitle Highlight Style",
      style_underline: "_ Underline",
      style_color: "\u{1F3A8} Color",
      subtitle_size: "Subtitle Size",
      subtitle_size_full: "Subtitle Size Preset",
      subtitle_font_size: "Subtitle Font Size (px)",
      subtitle_bg_color: "Subtitle Background Color",
      size_sm: "Small (16px \u2014 Compact)",
      size_md: "Medium (21px \u2014 Default)",
      size_lg: "Large (27px \u2014 Fullscreen / 4K)",
      // Themes
      theme_glass: "\u2728 Modern Glass (Neon)",
      theme_calm_light: "\u{1F33F} Calm Light (Pastel)",
      theme_extended: "\u{1F4DA} Extended (Dictionary)",
      theme_compact: "\u26A1 Compact (Minimal)",
      // Power & Master Toggle
      ext_enabled: "Lectura Active",
      ext_enabled_desc: "Translating & capturing vocabulary",
      ext_disabled: "Lectura Paused",
      ext_disabled_desc: "All translations and overlays paused",
      disable_on_site: "Disable on this site",
      enable_on_site: "Enable on this site",
      site_disabled_badge: "Disabled on site",
      // Toggles
      enable_yt_overlay: "Enable YouTube Overlay",
      enable_yt_overlay_hint: "Show interactive subtitles",
      track_listening_activity: "Track Listening Activity",
      track_listening_hint: "Record watch time in calendar",
      enable_overlay: "Enable YouTube Interactive Overlay",
      enable_overlay_desc: "Renders clickable word tokens over video subtitles and enables interactive learning.",
      enable_dual_subs: "Dual Subtitles",
      enable_dual_subs_desc: "Displays a translated full sentence below original captions (toggle with B or E).",
      dual_subs_hint: "Hotkeys: [B] or [E]",
      capture_snapshot: "Capture Video Frame Snapshot on Word Save",
      capture_snapshot_desc: "Automatically saves a frame screenshot with every saved word/phrase to provide visual context in Lectura.",
      pause_on_click: "Pause Video on Word Click",
      pause_on_click_desc: "Automatically pause video playback when clicking a subtitle word or phrase.",
      enable_insitu: "Enable In-Situ Word Tooltip",
      enable_insitu_desc: "Shows floating translation card when selecting text or double-clicking a word on any web page.",
      only_on_modifier: "Require Modifier Key for Popups",
      only_on_modifier_desc: "Only show word/phrase translation popup when selecting text while holding a modifier key.",
      modifier_key: "Modifier Key",
      modifier_key_hint: "Hold this key while selecting text to open the translation card.",
      modifier_alt: "Alt (Option on macOS) \u2014 Recommended",
      modifier_shift: "Shift",
      modifier_ctrl: "Ctrl (Command on macOS)",
      highlight_learned: "Highlight Learned Vocabulary Words",
      highlight_learned_desc: "Color-codes words on web pages based on your Lectura learning progress (1-5, Known).",
      // Domain Rules Section
      section_domain_rules: "Website Filtering & Exclusions",
      section_domain_rules_desc: "Control which websites Lectura operates on or automatically ignores.",
      filter_mode: "Filter Mode",
      mode_blacklist: "Blacklist (Disable on listed sites)",
      mode_whitelist: "Whitelist (Enable ONLY on listed sites)",
      domains_list: "Domains List (one per line)",
      domains_list_hint: "e.g. chatgpt.com, gemini.google.com, claude.ai. Subdomains are automatically included.",
      // Quick Actions
      import_video_page: "\u{1F4E5} Import Current Video / Page",
      open_app: "\u{1F680} Open App",
      sync_words: "\u{1F504} Sync Words",
      syncing: "Syncing...",
      synced_words: "Synced vocabulary words!",
      importing: "Parsing Article...",
      saving_to_lectura: "Saving to Lectura...",
      imported: "Imported!",
      // Activity & History
      day_history: "Day History",
      click_day_hint: "Click a day in calendar",
      delete_entry: "Delete entry",
      confirm_delete_log: "Delete this video viewing entry from history?",
      failed_delete_log: "Failed to delete log entry",
      no_activity_day: "No activity recorded for this day",
      failed_load_day_activity: "Failed to load day activity",
      goal_per_day: "Goal",
      overall: "Overall",
      stat_week: "WEEK",
      stat_month: "MONTH",
      stat_languages: "LANGUAGES",
      // Overlay Card & Tooltips
      tab_meaning: "Meaning",
      tab_definition: "Definition",
      tab_usage: "Usage",
      tab_dicts: "Dicts",
      tab_root: "Root",
      status_ignored: "Ignored",
      status_new: "New",
      status_learning: "Learning",
      status_known: "Known",
      btn_listen: "Listen",
      btn_reverso: "Reverso",
      btn_cambridge: "Cambridge",
      btn_wiktionary: "Wiktionary",
      btn_link: "Link",
      btn_unlink: "Unlink",
      base_root_placeholder: "Base root (e.g. salir)...",
      custom_meaning_placeholder: "Custom translation / meaning...",
      suggestions_label: "SUGGESTIONS",
      translating: "Translating...",
      replaying_cue: "Replaying cue",
      prev_cue: "Previous cue",
      next_cue: "Next cue",
      dual_subs_toast: "Dual Subtitles"
    },
    ru: {
      // Brand & Header
      settings_title: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F Lectura",
      settings_subtitle: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F, \u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432 YouTube \u0438 \u0432\u0435\u0431-\u0440\u0438\u0434\u0435\u0440\u0430",
      checking_connection: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430...",
      connected: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
      disconnected: "\u041E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
      server_unreachable: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D",
      test_connection: "\u0422\u0435\u0441\u0442",
      test_connection_full: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0432\u044F\u0437\u044C",
      save_config: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
      save_all_changes: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0432\u0441\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
      all_settings_saved: "\u0412\u0441\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B!",
      // Tabs
      tab_settings: "\u2699\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
      tab_activity: "\u{1F4CA} \u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C",
      tab_connection: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
      tab_youtube: "YouTube",
      tab_webreader: "\u0412\u0435\u0431-\u0440\u0438\u0434\u0435\u0440",
      tab_filters: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
      settings_auto_sync: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u0441 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u043C\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0430\u043C\u0438",
      // Sections
      section_connection: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F",
      section_connection_desc: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0435\u0440\u0430 Lectura \u0438 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u0430.",
      section_subtitles: "\u0418\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B YouTube",
      section_subtitles_desc: "\u041A\u043B\u0438\u043A\u0430\u0431\u0435\u043B\u044C\u043D\u044B\u0435 \u0441\u043B\u043E\u0432\u0430 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432 \u0441 \u0431\u044B\u0441\u0442\u0440\u044B\u043C\u0438 \u043A\u043B\u0430\u0432\u0438\u0448\u0430\u043C\u0438, \u0432\u0441\u043F\u043B\u044B\u0432\u0430\u044E\u0449\u0438\u043C \u0441\u043B\u043E\u0432\u0430\u0440\u0435\u043C \u0438 \u0430\u0432\u0442\u043E\u043F\u0430\u0443\u0437\u043E\u0439.",
      section_reader: "\u0412\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0441\u043B\u043E\u0432 \u043D\u0430 \u0432\u0435\u0431-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430\u0445",
      section_reader_desc: "\u041C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u043B\u043E\u0432 \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 SRS \u043D\u0430 \u043B\u044E\u0431\u044B\u0445 \u0441\u0430\u0439\u0442\u0430\u0445.",
      // Form fields
      server_url: "\u0410\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
      server_url_hint: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0438 \u043F\u043E\u0440\u0442 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, http://localhost:3000 \u0438\u043B\u0438 https://lectura.yourdomain.com).",
      target_profile: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C / \u0410\u043A\u043A\u0430\u0443\u043D\u0442",
      target_profile_hint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C Lectura, \u0432 \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0431\u0443\u0434\u0443\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C\u0441\u044F \u0441\u043B\u043E\u0432\u0430 \u0438 \u0443\u0440\u043E\u043A\u0438.",
      default_profile: "\u{1F310} \u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C (\u0413\u043E\u0441\u0442\u044C)",
      auth_token: "\u0422\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 (\u041E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)",
      auth_token_full: "\u0422\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 (Bearer)",
      auth_token_hint: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 Lectura \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F.",
      sync_key: "\u041A\u043B\u044E\u0447 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438 (Fallback)",
      sync_key_hint: "\u0421\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 LOCAL_SYNC_KEY \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.",
      study_lang: "\u0418\u0437\u0443\u0447\u0430\u0435\u043C\u044B\u0439 \u044F\u0437\u044B\u043A",
      translate_to: "\u042F\u0437\u044B\u043A \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430",
      tts_dialect: "\u0414\u0432\u0438\u0436\u043E\u043A \u043E\u0437\u0432\u0443\u0447\u043A\u0438 \u0438 \u0430\u043A\u0446\u0435\u043D\u0442",
      ui_language: "\u042F\u0437\u044B\u043A \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430",
      word_popup_theme: "\u0422\u0435\u043C\u0430 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u0441\u043B\u043E\u0432\u0430",
      subtitle_style: "\u0421\u0442\u0438\u043B\u044C \u043F\u043E\u0434\u0441\u0432\u0435\u0442\u043A\u0438 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432",
      style_underline: "_ \u041F\u043E\u0434\u0447\u0435\u0440\u043A\u0438\u0432\u0430\u043D\u0438\u0435",
      style_color: "\u{1F3A8} \u0426\u0432\u0435\u0442 \u0442\u0435\u043A\u0441\u0442\u0430",
      subtitle_size: "\u0420\u0430\u0437\u043C\u0435\u0440 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432",
      subtitle_size_full: "\u0420\u0430\u0437\u043C\u0435\u0440 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432",
      subtitle_font_size: "\u0420\u0430\u0437\u043C\u0435\u0440 \u0448\u0440\u0438\u0444\u0442\u0430 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432 (px)",
      subtitle_bg_color: "\u0426\u0432\u0435\u0442 \u0444\u043E\u043D\u0430 \u043F\u043B\u0430\u0448\u043A\u0438",
      size_sm: "\u041C\u0435\u043B\u043A\u0438\u0439 (16px \u2014 \u041E\u043A\u043E\u043D\u043D\u044B\u0439)",
      size_md: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 (21px \u2014 \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442)",
      size_lg: "\u041A\u0440\u0443\u043F\u043D\u044B\u0439 (27px \u2014 \u041F\u043E\u043B\u043D\u043E\u044D\u043A\u0440\u0430\u043D\u043D\u044B\u0439)",
      // Themes
      theme_glass: "\u2728 Modern Glass (\u041D\u0435\u043E\u043D)",
      theme_calm_light: "\u{1F33F} Calm Light (\u0421\u0432\u0435\u0442\u043B\u0430\u044F \u043F\u0430\u0441\u0442\u0435\u043B\u044C)",
      theme_extended: "\u{1F4DA} Extended (\u0421\u043B\u043E\u0432\u0430\u0440\u043D\u044B\u0439)",
      theme_compact: "\u26A1 Compact (\u041C\u0438\u043D\u0438)",
      // Power & Master Toggle
      ext_enabled: "Lectura \u0430\u043A\u0442\u0438\u0432\u043D\u0430",
      ext_enabled_desc: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u0438 \u0437\u0430\u0445\u0432\u0430\u0442 \u0441\u043B\u043E\u0432 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B",
      ext_disabled: "Lectura \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430",
      ext_disabled_desc: "\u0412\u0441\u0435 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u044B \u0438 \u043E\u0432\u0435\u0440\u043B\u0435\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B",
      disable_on_site: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043D\u0430 \u044D\u0442\u043E\u043C \u0441\u0430\u0439\u0442\u0435",
      enable_on_site: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043D\u0430 \u044D\u0442\u043E\u043C \u0441\u0430\u0439\u0442\u0435",
      site_disabled_badge: "\u041E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043D\u0430 \u0441\u0430\u0439\u0442\u0435",
      // Toggles
      enable_yt_overlay: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B YouTube",
      enable_yt_overlay_hint: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B",
      track_listening_activity: "\u0423\u0447\u0435\u0442 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430",
      track_listening_hint: "\u0417\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C",
      enable_overlay: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043E\u0432\u0435\u0440\u043B\u0435\u0439 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432 YouTube",
      enable_overlay_desc: "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u0442 \u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u043A\u043B\u0438\u043A\u0430\u0431\u0435\u043B\u044C\u043D\u044B\u0435 \u0441\u043B\u043E\u0432\u0430 \u043F\u043E\u0432\u0435\u0440\u0445 \u0432\u0438\u0434\u0435\u043E \u0438 \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435.",
      enable_dual_subs: "\u0414\u0432\u043E\u0439\u043D\u044B\u0435 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B",
      enable_dual_subs_desc: "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u0442 \u0441\u0442\u0440\u043E\u043A\u0443 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043F\u043E\u0434 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u043C\u0438 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u0430\u043C\u0438 (\u043A\u043B\u0430\u0432\u0438\u0448\u0430 B \u0438\u043B\u0438 E).",
      dual_subs_hint: "\u0413\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438: [B] \u0438\u043B\u0438 [E]",
      capture_snapshot: "\u0421\u043D\u0438\u043C\u043E\u043A \u043A\u0430\u0434\u0440\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u0441\u043B\u043E\u0432\u0430",
      capture_snapshot_desc: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442 \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442 \u043A\u0430\u0434\u0440\u0430 \u0434\u043B\u044F \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430 \u0432 Lectura.",
      pause_on_click: "\u041F\u0430\u0443\u0437\u0430 \u0432\u0438\u0434\u0435\u043E \u043F\u0440\u0438 \u043A\u043B\u0438\u043A\u0435 \u043D\u0430 \u0441\u043B\u043E\u0432\u043E",
      pause_on_click_desc: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0432\u0438\u0434\u0435\u043E \u043D\u0430 \u043F\u0430\u0443\u0437\u0443 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0438 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u0441\u043B\u043E\u0432\u0430.",
      enable_insitu: "\u0412\u0441\u043F\u043B\u044B\u0432\u0430\u044E\u0449\u0438\u0439 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u043D\u0430 \u0432\u0435\u0431-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430\u0445",
      enable_insitu_desc: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043F\u043B\u0430\u0432\u0430\u044E\u0449\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430 \u043F\u0440\u0438 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u0442\u0435\u043A\u0441\u0442\u0430 \u0438\u043B\u0438 \u0434\u0432\u043E\u0439\u043D\u043E\u043C \u043A\u043B\u0438\u043A\u0435.",
      only_on_modifier: "\u041E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 \u0437\u0430\u0436\u0430\u0442\u043E\u0439 \u043A\u043B\u0430\u0432\u0438\u0448\u0435",
      only_on_modifier_desc: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430 \u0422\u041E\u041B\u042C\u041A\u041E \u0435\u0441\u043B\u0438 \u0442\u0435\u043A\u0441\u0442 \u0432\u044B\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F \u0441 \u0437\u0430\u0436\u0430\u0442\u043E\u0439 \u043A\u043B\u0430\u0432\u0438\u0448\u0435\u0439 (Alt / Shift / Ctrl).",
      modifier_key: "\u041A\u043B\u0430\u0432\u0438\u0448\u0430-\u043C\u043E\u0434\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440",
      modifier_key_hint: "\u0417\u0430\u0436\u043C\u0438\u0442\u0435 \u044D\u0442\u0443 \u043A\u043B\u0430\u0432\u0438\u0448\u0443 \u043F\u0440\u0438 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u0442\u0435\u043A\u0441\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430.",
      modifier_alt: "Alt (Option \u043D\u0430 macOS) \u2014 \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F",
      modifier_shift: "Shift",
      modifier_ctrl: "Ctrl (Command \u043D\u0430 macOS)",
      highlight_learned: "\u041F\u043E\u0434\u0441\u0432\u0435\u0442\u043A\u0430 \u0438\u0437\u0443\u0447\u0435\u043D\u043D\u044B\u0445 \u0441\u043B\u043E\u0432 \u043D\u0430 \u0441\u0430\u0439\u0442\u0430\u0445",
      highlight_learned_desc: "\u041E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442 \u0441\u043B\u043E\u0432\u0430 \u043D\u0430 \u0432\u0435\u0431-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430\u0445 \u0432 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0438 \u0441 \u0432\u0430\u0448\u0438\u043C \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441\u043E\u043C (1-5, \u0418\u0437\u0443\u0447\u0435\u043D\u043E).",
      // Domain Rules Section
      section_domain_rules: "\u0427\u0435\u0440\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u0438 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0441\u0430\u0439\u0442\u043E\u0432",
      section_domain_rules_desc: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u0430\u0439\u0442\u044B, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0438\u043B\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0430\u0442\u044C\u0441\u044F.",
      filter_mode: "\u0420\u0435\u0436\u0438\u043C \u0444\u0438\u043B\u044C\u0442\u0440\u0430",
      mode_blacklist: "\u0427\u0435\u0440\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A (\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u0441\u0430\u0439\u0442\u0430\u0445)",
      mode_whitelist: "\u0411\u0435\u043B\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A (\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0422\u041E\u041B\u042C\u041A\u041E \u043D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u0441\u0430\u0439\u0442\u0430\u0445)",
      domains_list: "\u0421\u043F\u0438\u0441\u043E\u043A \u0434\u043E\u043C\u0435\u043D\u043E\u0432 (\u043F\u043E \u043E\u0434\u043D\u043E\u043C\u0443 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443)",
      domains_list_hint: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, chatgpt.com, gemini.google.com, claude.ai. \u041F\u043E\u0434\u0434\u043E\u043C\u0435\u043D\u044B \u043E\u0442\u043A\u043B\u044E\u0447\u0430\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
      // Quick Actions
      import_video_page: "\u{1F4E5} \u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 / \u0432\u0438\u0434\u0435\u043E",
      open_app: "\u{1F680} \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
      sync_words: "\u{1F504} \u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
      syncing: "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F...",
      synced_words: "\u0421\u043B\u043E\u0432\u0430 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u044B!",
      importing: "\u0427\u0442\u0435\u043D\u0438\u0435 \u0441\u0442\u0430\u0442\u044C\u0438...",
      saving_to_lectura: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0432 Lectura...",
      imported: "\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E!",
      // Activity & History
      day_history: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0437\u0430 \u0434\u0435\u043D\u044C",
      click_day_hint: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u0434\u0435\u043D\u044C \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u0435",
      delete_entry: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C",
      confirm_delete_log: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0443 \u0437\u0430\u043F\u0438\u0441\u044C \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u0432\u0438\u0434\u0435\u043E \u0438\u0437 \u0438\u0441\u0442\u043E\u0440\u0438\u0438?",
      failed_delete_log: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C",
      no_activity_day: "\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438 \u0437\u0430 \u044D\u0442\u043E\u0442 \u0434\u0435\u043D\u044C",
      failed_load_day_activity: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C \u0437\u0430 \u0434\u0435\u043D\u044C",
      goal_per_day: "\u0426\u0435\u043B\u044C",
      overall: "\u0412\u0441\u0435\u0433\u043E",
      stat_week: "\u041D\u0415\u0414\u0415\u041B\u042F",
      stat_month: "\u041C\u0415\u0421\u042F\u0426",
      stat_languages: "\u042F\u0417\u042B\u041A\u0418",
      // Overlay Card & Tooltips
      tab_meaning: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434",
      tab_definition: "\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435",
      tab_usage: "\u041F\u0440\u0438\u043C\u0435\u0440\u044B",
      tab_dicts: "\u0421\u043B\u043E\u0432\u0430\u0440\u0438",
      tab_root: "\u041A\u043E\u0440\u0435\u043D\u044C",
      status_ignored: "\u0418\u0433\u043D\u043E\u0440",
      status_new: "\u041D\u043E\u0432\u043E\u0435",
      status_learning: "\u0423\u0447\u0443",
      status_known: "\u0417\u043D\u0430\u044E",
      btn_listen: "\u0421\u043B\u0443\u0448\u0430\u0442\u044C",
      btn_reverso: "Reverso",
      btn_cambridge: "Cambridge",
      btn_wiktionary: "Wiktionary",
      btn_link: "\u0421\u0432\u044F\u0437\u0430\u0442\u044C",
      btn_unlink: "\u041E\u0442\u0432\u044F\u0437\u0430\u0442\u044C",
      base_root_placeholder: "\u041D\u0430\u0447\u0430\u043B\u044C\u043D\u0430\u044F \u0444\u043E\u0440\u043C\u0430 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, salir)...",
      custom_meaning_placeholder: "\u0421\u0432\u043E\u0439 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 / \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435...",
      suggestions_label: "\u041F\u041E\u0414\u0421\u041A\u0410\u0417\u041A\u0418",
      translating: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434...",
      replaying_cue: "\u041F\u043E\u0432\u0442\u043E\u0440 \u0444\u0440\u0430\u0437\u044B",
      prev_cue: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u0444\u0440\u0430\u0437\u0430",
      next_cue: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u0444\u0440\u0430\u0437\u0430",
      dual_subs_toast: "\u0414\u0432\u043E\u0439\u043D\u044B\u0435 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B"
    },
    es: {
      // Brand & Header
      settings_title: "Ajustes de la extensi\xF3n Lectura",
      settings_subtitle: "Configura la conectividad, subt\xEDtulos interactivos de YouTube y lector web",
      checking_connection: "Comprobando...",
      connected: "Conectado",
      disconnected: "Desconectado",
      server_unreachable: "Servidor no disponible",
      test_connection: "Probar",
      test_connection_full: "Probar conexi\xF3n",
      save_config: "Guardar",
      save_all_changes: "Guardar todos los cambios",
      all_settings_saved: "\xA1Todos los ajustes se han guardado con \xE9xito!",
      // Tabs
      tab_settings: "\u2699\uFE0F Ajustes",
      tab_activity: "\u{1F4CA} Actividad",
      tab_connection: "Conexi\xF3n",
      tab_youtube: "YouTube",
      tab_webreader: "Lector web",
      tab_filters: "Filtros",
      settings_auto_sync: "Los ajustes se sincronizan autom\xE1ticamente con las pesta\xF1as",
      // Sections
      section_connection: "Conexi\xF3n y Autenticaci\xF3n",
      section_connection_desc: "Especifica la URL del servidor Lectura y las credenciales de acceso.",
      section_subtitles: "Subt\xEDtulos interactivos de YouTube",
      section_subtitles_desc: "Subt\xEDtulos interactivos con atajos, diccionario emergente y controles de pausa en YouTube.",
      section_reader: "B\xFAsqueda y selecci\xF3n de palabras",
      section_reader_desc: "Traducci\xF3n instant\xE1nea y guardado de vocabulario SRS en cualquier p\xE1gina web.",
      // Form fields
      server_url: "URL del servidor",
      server_url_hint: "Incluye protocolo y puerto (p. ej. http://localhost:3000 o https://lectura.tudominio.com).",
      target_profile: "Perfil / Cuenta",
      target_profile_hint: "Selecciona qu\xE9 cuenta de Lectura recibe las palabras y lecciones importadas.",
      default_profile: "\u{1F310} Perfil predeterminado (Invitado)",
      auth_token: "Token de autorizaci\xF3n (Opcional)",
      auth_token_full: "Token de autorizaci\xF3n (Bearer)",
      auth_token_hint: "Requerido solo si tu servidor Lectura tiene autenticaci\xF3n habilitada.",
      sync_key: "Clave de sincronizaci\xF3n local",
      sync_key_hint: "Coincide con LOCAL_SYNC_KEY en tu servidor.",
      study_lang: "Idioma de estudio",
      translate_to: "Idioma de traducci\xF3n",
      tts_dialect: "Motor de voz y acento",
      ui_language: "Idioma de la interfaz",
      word_popup_theme: "Tema de la tarjeta",
      subtitle_style: "Estilo de resaltado de subt\xEDtulos",
      style_underline: "_ Subrayado",
      style_color: "\u{1F3A8} Color",
      subtitle_size: "Tama\xF1o de subt\xEDtulos",
      subtitle_size_full: "Tama\xF1o de subt\xEDtulos",
      subtitle_font_size: "Tama\xF1o de fuente de subt\xEDtulos (px)",
      subtitle_bg_color: "Color de fondo de subt\xEDtulos",
      size_sm: "Peque\xF1o (16px \u2014 Compacto)",
      size_md: "Medio (21px \u2014 Est\xE1ndar)",
      size_lg: "Grande (27px \u2014 Pantalla completa)",
      // Themes
      theme_glass: "\u2728 Modern Glass (Ne\xF3n)",
      theme_calm_light: "\u{1F33F} Calm Light (Pastel)",
      theme_extended: "\u{1F4DA} Extended (Diccionario)",
      theme_compact: "\u26A1 Compact (M\xEDnimo)",
      // Power & Master Toggle
      ext_enabled: "Lectura activa",
      ext_enabled_desc: "Traducci\xF3n y captura de palabras activas",
      ext_disabled: "Lectura pausada",
      ext_disabled_desc: "Todas las traducciones y superposiciones desactivadas",
      disable_on_site: "Desactivar en este sitio",
      enable_on_site: "Activar en este sitio",
      site_disabled_badge: "Desactivado en sitio",
      // Toggles
      enable_yt_overlay: "Activar subt\xEDtulos de YouTube",
      enable_yt_overlay_hint: "Mostrar subt\xEDtulos interactivos",
      track_listening_activity: "Registrar tiempo de escucha",
      track_listening_hint: "Guardar tiempo en el calendario",
      enable_overlay: "Activar superposici\xF3n de YouTube",
      enable_overlay_desc: "Muestra palabras interactivas sobre los subt\xEDtulos del video y habilita el aprendizaje.",
      enable_dual_subs: "Subt\xEDtulos dobles",
      enable_dual_subs_desc: "Muestra la traducci\xF3n completa debajo de los subt\xEDtulos originales (tecla B o E).",
      dual_subs_hint: "Atajos: [B] o [E]",
      capture_snapshot: "Capturar fotograma al guardar palabra",
      capture_snapshot_desc: "Guarda autom\xE1ticamente una captura de pantalla para dar contexto visual en Lectura.",
      pause_on_click: "Pausar video al hacer clic en palabra",
      pause_on_click_desc: "Pausa autom\xE1ticamente el video al hacer clic en una palabra o frase de los subt\xEDtulos.",
      enable_insitu: "Activar tooltip en p\xE1ginas web",
      enable_insitu_desc: "Muestra una tarjeta de traducci\xF3n al seleccionar texto o hacer doble clic en cualquier p\xE1gina.",
      only_on_modifier: "Abrir tarjeta solo con tecla modificadora",
      only_on_modifier_desc: "Mostrar tarjeta de traducci\xF3n solo al seleccionar texto manteniendo presionada una tecla modificadora.",
      modifier_key: "Tecla modificadora",
      modifier_key_hint: "Mant\xE9n presionada esta tecla al seleccionar texto para abrir la tarjeta de traducci\xF3n.",
      modifier_alt: "Alt (Option en macOS) \u2014 Recomendado",
      modifier_shift: "Shift",
      modifier_ctrl: "Ctrl (Command en macOS)",
      highlight_learned: "Resaltar vocabulario aprendido",
      highlight_learned_desc: "Colorea las palabras en la web seg\xFAn tu progreso en Lectura (1-5, Aprendida).",
      // Domain Rules Section
      section_domain_rules: "Filtrado de sitios web y exclusiones",
      section_domain_rules_desc: "Controla en qu\xE9 sitios web opera Lectura o en cu\xE1les se desactiva autom\xE1ticamente.",
      filter_mode: "Modo de filtro",
      mode_blacklist: "Lista negra (Desactivar en sitios indicados)",
      mode_whitelist: "Lista blanca (Activar SOLO en sitios indicados)",
      domains_list: "Lista de dominios (uno por l\xEDnea)",
      domains_list_hint: "p. ej. chatgpt.com, gemini.google.com, claude.ai. Los subdominios se incluyen autom\xE1ticamente.",
      // Quick Actions
      import_video_page: "\u{1F4E5} Importar p\xE1gina / video actual",
      open_app: "\u{1F680} Abrir aplicaci\xF3n",
      sync_words: "\u{1F504} Sincronizar palabras",
      syncing: "Sincronizando...",
      synced_words: "\xA1Vocabulario sincronizado con \xE9xito!",
      importing: "Analizando art\xEDculo...",
      saving_to_lectura: "Guardando en Lectura...",
      imported: "\xA1Importado!",
      // Activity & History
      day_history: "Historial del d\xEDa",
      click_day_hint: "Haz clic en un d\xEDa del calendario",
      delete_entry: "Eliminar registro",
      confirm_delete_log: "\xBFEliminar este registro de video del historial?",
      failed_delete_log: "Error al eliminar el registro",
      no_activity_day: "No hay actividad registrada para este d\xEDa",
      failed_load_day_activity: "Error al cargar la actividad del d\xEDa",
      goal_per_day: "Meta",
      overall: "Total",
      stat_week: "SEMANA",
      stat_month: "MES",
      stat_languages: "IDIOMAS",
      // Overlay Card & Tooltips
      tab_meaning: "Significado",
      tab_definition: "Definici\xF3n",
      tab_usage: "Uso",
      tab_dicts: "Diccs",
      tab_root: "Ra\xEDz",
      status_ignored: "Ignorado",
      status_new: "Nuevo",
      status_learning: "Aprendiendo",
      status_known: "Conocido",
      btn_listen: "Escuchar",
      btn_reverso: "Reverso",
      btn_cambridge: "Cambridge",
      btn_wiktionary: "Wiktionary",
      btn_link: "Vincular",
      btn_unlink: "Desvincular",
      base_root_placeholder: "Ra\xEDz base (p. ej. salir)...",
      custom_meaning_placeholder: "Traducci\xF3n / significado personalizado...",
      suggestions_label: "SUGERENCIAS",
      translating: "Traduciendo...",
      replaying_cue: "Repitiendo frase",
      prev_cue: "Frase anterior",
      next_cue: "Frase siguiente",
      dual_subs_toast: "Subt\xEDtulos dobles"
    }
  };
  function t(key, lang = "en") {
    const norm = (lang || "en").toLowerCase().slice(0, 2);
    const currentDict = EXTENSION_TRANSLATIONS[norm] || EXTENSION_TRANSLATIONS.en;
    return currentDict[key] || EXTENSION_TRANSLATIONS.en[key] || key;
  }
  function applyI18nToDOM(root = document, lang = "en") {
    const elements = root.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.dataset.i18n;
      if (key) {
        const translated = t(key, lang);
        if (el.tagName === "INPUT" && el.type === "text") {
          el.placeholder = translated;
        } else {
          el.textContent = translated;
        }
      }
    });
    const placeholders = root.querySelectorAll("[data-i18n-placeholder]");
    placeholders.forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (key) {
        el.placeholder = t(key, lang);
      }
    });
    const titles = root.querySelectorAll("[data-i18n-title]");
    titles.forEach((el) => {
      const key = el.dataset.i18nTitle;
      if (key) {
        el.title = t(key, lang);
      }
    });
  }

  // extension/src/options/options.ts
  var OptionsController = class {
    constructor() {
      this.currentSubtitleBgColor = "rgba(15, 23, 42, 0.90)";
      this.activeTab = "youtube";
      this.apiClient = new LecturaApiClient();
      document.addEventListener("DOMContentLoaded", () => this.init());
    }
    async init() {
      this.serverUrlInput = document.getElementById("serverUrl");
      this.authTokenInput = document.getElementById("authToken");
      this.syncKeyInput = document.getElementById("syncKey");
      this.userProfileSelect = document.getElementById("userProfileSelect");
      this.interfaceLanguageSelect = document.getElementById("interfaceLanguage");
      this.targetLanguageSelect = document.getElementById("targetLanguage");
      this.nativeLanguageSelect = document.getElementById("nativeLanguage");
      this.ttsDialectSelect = document.getElementById("ttsDialect");
      this.enableYoutubeOverlayCheck = document.getElementById("enableYoutubeOverlay");
      this.enableDualSubtitlesCheck = document.getElementById("enableDualSubtitles");
      this.captureVideoSnapshotCheck = document.getElementById("captureVideoSnapshot");
      this.pauseOnWordClickCheck = document.getElementById("pauseOnWordClick");
      this.subtitleSizePresetSelect = document.getElementById("subtitleSizePreset");
      this.autoPauseOnHoverCheck = document.getElementById("autoPauseOnHover");
      this.subtitleFontSizeInput = document.getElementById("subtitleFontSize");
      this.subtitleFontSizeValue = document.getElementById("subtitleFontSizeValue");
      this.subBgColorPicker = document.getElementById("subBgColorPicker");
      this.subBgColorValue = document.getElementById("subBgColorValue");
      this.subtitleBgOpacityInput = document.getElementById("subtitleBgOpacity");
      this.subtitleHighlightModeSelect = document.getElementById("subtitleHighlightMode");
      this.popupThemeSelect = document.getElementById("popupTheme");
      this.enableInSituSelectionCheck = document.getElementById("enableInSituSelection");
      this.onlyOnModifierKeyCheck = document.getElementById("onlyOnModifierKey");
      this.modifierKeySelect = document.getElementById("modifierKeySelect");
      this.domainFilterModeSelect = document.getElementById("domainFilterMode");
      this.disabledDomainsTextarea = document.getElementById("disabledDomainsText");
      this.highlightKnownWordsCheck = document.getElementById("highlightKnownWords");
      this.serverStatusBadge = document.getElementById("serverStatus");
      this.saveNotification = document.getElementById("saveNotification");
      this.btnTest = document.getElementById("btnTest");
      this.btnSave = document.getElementById("btnSave");
      this.setupTabs();
      this.bindEvents();
      await this.loadSettings();
      await this.loadProfiles();
      await this.testConnection();
    }
    setupTabs() {
      const savedTab = localStorage.getItem("lectura_options_tab");
      if (savedTab && ["connection", "youtube", "webreader", "filters"].includes(savedTab)) {
        this.activeTab = savedTab;
      }
      this.switchTab(this.activeTab);
      document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const tab = e.currentTarget.dataset.tab;
          if (tab) {
            this.switchTab(tab);
          }
        });
      });
    }
    switchTab(tab) {
      this.activeTab = tab;
      try {
        localStorage.setItem("lectura_options_tab", tab);
      } catch (_) {
      }
      document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
        const isTarget = btn.dataset.tab === tab;
        btn.classList.toggle("active", isTarget);
        btn.setAttribute("aria-selected", isTarget ? "true" : "false");
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        const isTarget = panel.dataset.tabPanel === tab;
        panel.classList.toggle("active", isTarget);
        panel.style.display = isTarget ? "flex" : "none";
      });
    }
    applyBgColor(color) {
      this.currentSubtitleBgColor = color;
      if (this.subBgColorValue) {
        this.subBgColorValue.textContent = color;
      }
      chrome.storage.local.set({ subtitleBgColor: color });
      document.documentElement.style.setProperty("--lectura-sub-bg-color", color);
      try {
        chrome.tabs.query({}).then((tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "UPDATE_SUB_BG_COLOR",
                color
              }).catch(() => {
              });
            }
          }
        }).catch(() => {
        });
      } catch (_) {
      }
    }
    bindEvents() {
      this.btnTest.addEventListener("click", async () => {
        await this.loadProfiles();
        await this.testConnection();
      });
      this.btnSave.addEventListener("click", () => this.saveSettings());
      if (this.subtitleFontSizeInput) {
        this.subtitleFontSizeInput.addEventListener("input", () => {
          const val = parseInt(this.subtitleFontSizeInput.value, 10) || 22;
          if (this.subtitleFontSizeValue) {
            this.subtitleFontSizeValue.textContent = `${val}px`;
          }
          chrome.storage.local.set({ subtitleFontSize: val });
          document.documentElement.style.setProperty("--lectura-sub-font-size", `${val}px`);
          try {
            chrome.tabs.query({}).then((tabs) => {
              for (const tab of tabs) {
                if (tab.id) {
                  chrome.tabs.sendMessage(tab.id, {
                    type: "UPDATE_SUB_FONT_SIZE",
                    size: val
                  }).catch(() => {
                  });
                }
              }
            }).catch(() => {
            });
          } catch (_) {
          }
        });
      }
      document.querySelectorAll(".sub-bg-preset-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const color = e.currentTarget.dataset.color;
          if (color) {
            this.applyBgColor(color);
          }
        });
      });
      if (this.subBgColorPicker) {
        this.subBgColorPicker.addEventListener("input", (e) => {
          const hex = e.target.value;
          this.applyBgColor(`${hex}E6`);
        });
      }
      if (this.interfaceLanguageSelect) {
        this.interfaceLanguageSelect.addEventListener("change", async () => {
          const lang = this.interfaceLanguageSelect.value || "en";
          await StorageService.saveSettings({ interfaceLanguage: lang });
          applyI18nToDOM(document, lang);
          try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "UPDATE_UI_LANGUAGE",
                  language: lang
                }).catch(() => {
                });
              }
            }
          } catch (_) {
          }
        });
      }
      if (this.popupThemeSelect) {
        this.popupThemeSelect.addEventListener("change", async () => {
          const theme = this.popupThemeSelect.value || "compact";
          await StorageService.saveSettings({ popupTheme: theme });
          await chrome.storage.local.set({ popup_theme: theme, popupTheme: theme });
          try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "UPDATE_POPUP_THEME",
                  theme
                }).catch(() => {
                });
              }
            }
          } catch (_) {
          }
        });
      }
    }
    async loadSettings() {
      const settings = await StorageService.getSettings();
      this.serverUrlInput.value = settings.serverUrl || "http://localhost:3000";
      this.authTokenInput.value = settings.authToken || "";
      this.syncKeyInput.value = settings.syncKey || "";
      if (this.interfaceLanguageSelect) {
        this.interfaceLanguageSelect.value = settings.interfaceLanguage || "en";
      }
      this.targetLanguageSelect.value = settings.targetLanguage || "es";
      this.nativeLanguageSelect.value = settings.nativeLanguage || "ru";
      if (this.ttsDialectSelect) {
        this.ttsDialectSelect.value = settings.ttsDialect || "en-US";
      }
      this.enableYoutubeOverlayCheck.checked = settings.enableYoutubeOverlay ?? true;
      if (this.enableDualSubtitlesCheck) {
        this.enableDualSubtitlesCheck.checked = settings.enableDualSubtitles ?? false;
      }
      if (this.captureVideoSnapshotCheck) {
        this.captureVideoSnapshotCheck.checked = settings.captureVideoSnapshot ?? false;
      }
      if (this.pauseOnWordClickCheck) {
        this.pauseOnWordClickCheck.checked = settings.pauseOnWordClick ?? false;
      }
      if (this.subtitleSizePresetSelect) {
        this.subtitleSizePresetSelect.value = settings.subtitleSizePreset || "md";
      }
      if (this.popupThemeSelect) {
        this.popupThemeSelect.value = settings.popupTheme || "glass";
      }
      if (this.autoPauseOnHoverCheck) {
        this.autoPauseOnHoverCheck.checked = settings.autoPauseOnHover ?? true;
      }
      if (this.subtitleFontSizeInput) {
        const size = settings.subtitleFontSize || 22;
        this.subtitleFontSizeInput.value = String(size);
        if (this.subtitleFontSizeValue) {
          this.subtitleFontSizeValue.textContent = `${size}px`;
        }
      }
      this.currentSubtitleBgColor = settings.subtitleBgColor || "rgba(0, 0, 0, 0.45)";
      if (this.subBgColorValue) {
        this.subBgColorValue.textContent = this.currentSubtitleBgColor;
      }
      if (this.subtitleBgOpacityInput) {
        this.subtitleBgOpacityInput.value = String(settings.subtitleBgOpacity ?? 75);
      }
      this.subtitleHighlightModeSelect.value = settings.subtitleHighlightMode || "underline";
      this.enableInSituSelectionCheck.checked = settings.enableInSituSelection ?? true;
      if (this.onlyOnModifierKeyCheck) {
        this.onlyOnModifierKeyCheck.checked = settings.onlyOnModifierKey ?? false;
      }
      if (this.modifierKeySelect) {
        this.modifierKeySelect.value = settings.modifierKey || "alt";
      }
      if (this.domainFilterModeSelect) {
        this.domainFilterModeSelect.value = settings.domainFilterMode || "blacklist";
      }
      if (this.disabledDomainsTextarea) {
        const defaultDomains = ["chatgpt.com", "claude.ai", "gemini.google.com"];
        this.disabledDomainsTextarea.value = (settings.disabledDomains || defaultDomains).join("\n");
      }
      this.highlightKnownWordsCheck.checked = settings.highlightKnownWords ?? false;
      applyI18nToDOM(document, settings.interfaceLanguage || "en");
    }
    async loadProfiles() {
      try {
        const currentUrl = this.serverUrlInput.value.trim().replace(/\/+$/, "") || "http://localhost:3000";
        const settings = await StorageService.getSettings();
        const client = new LecturaApiClient({ ...settings, serverUrl: currentUrl });
        const profiles = await client.getProfiles();
        const savedUserId = settings.selectedUserId || "";
        this.userProfileSelect.innerHTML = "";
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "default";
        defaultOpt.textContent = "\u{1F310} Default Profile (Single User / Guest)";
        this.userProfileSelect.appendChild(defaultOpt);
        if (profiles && profiles.length > 0) {
          for (const p of profiles) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.dataset.email = p.email || "";
            opt.textContent = `\u{1F464} ${p.displayName} (${p.email || p.id})`;
            if (p.id === savedUserId || p.email === savedUserId) {
              opt.selected = true;
            }
            this.userProfileSelect.appendChild(opt);
          }
        }
        if (savedUserId && savedUserId !== "default") {
          this.userProfileSelect.value = savedUserId;
        }
      } catch (_) {
      }
    }
    getFormSettings() {
      const sizePreset = this.subtitleSizePresetSelect?.value || "md";
      const rawDomains = (this.disabledDomainsTextarea?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
      const selectedOption = this.userProfileSelect?.selectedOptions?.[0];
      const selectedEmail = selectedOption?.dataset?.email || "";
      return {
        serverUrl: this.serverUrlInput.value.trim().replace(/\/+$/, ""),
        authToken: this.authTokenInput.value.trim(),
        syncKey: this.syncKeyInput.value.trim(),
        selectedUserId: this.userProfileSelect.value,
        selectedUserEmail: selectedEmail,
        targetLanguage: this.targetLanguageSelect.value,
        nativeLanguage: this.nativeLanguageSelect.value,
        ttsDialect: this.ttsDialectSelect ? this.ttsDialectSelect.value : "en-US",
        interfaceLanguage: this.interfaceLanguageSelect?.value || "en",
        popupTheme: this.popupThemeSelect?.value || "glass",
        enableYoutubeOverlay: this.enableYoutubeOverlayCheck.checked,
        enableDualSubtitles: this.enableDualSubtitlesCheck ? this.enableDualSubtitlesCheck.checked : false,
        captureVideoSnapshot: this.captureVideoSnapshotCheck ? this.captureVideoSnapshotCheck.checked : false,
        pauseOnWordClick: this.pauseOnWordClickCheck ? this.pauseOnWordClickCheck.checked : false,
        subtitleSizePreset: sizePreset,
        autoPauseOnHover: this.autoPauseOnHoverCheck ? this.autoPauseOnHoverCheck.checked : true,
        subtitleFontSize: parseInt(this.subtitleFontSizeInput?.value || "22", 10) || 22,
        subtitleBgOpacity: parseInt(this.subtitleBgOpacityInput?.value || "75", 10) || 75,
        subtitleBgColor: this.currentSubtitleBgColor || "rgba(15, 23, 42, 0.90)",
        subtitleHighlightMode: this.subtitleHighlightModeSelect.value || "underline",
        enableInSituSelection: this.enableInSituSelectionCheck.checked,
        onlyOnModifierKey: this.onlyOnModifierKeyCheck ? this.onlyOnModifierKeyCheck.checked : false,
        modifierKey: this.modifierKeySelect?.value || "alt",
        domainFilterMode: this.domainFilterModeSelect?.value || "blacklist",
        disabledDomains: rawDomains,
        highlightKnownWords: this.highlightKnownWordsCheck.checked
      };
    }
    async refreshVocabularyCache(settings) {
      try {
        const client = new LecturaApiClient(settings);
        const studyLang = settings.targetLanguage || "en";
        const wordData = await client.getWords(studyLang);
        if (wordData?.map) {
          await StorageService.setCachedWords(studyLang, wordData.map);
        }
        if (typeof chrome !== "undefined" && chrome.tabs?.query) {
          chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { type: "VOCABULARY_UPDATED", language: studyLang }).catch(() => {
                });
              }
            }
          });
        }
        return wordData;
      } catch (err) {
        console.warn("[OptionsController] refreshVocabularyCache failed:", err);
        return null;
      }
    }
    async saveSettings() {
      this.btnSave.disabled = true;
      try {
        const settings = this.getFormSettings();
        await StorageService.saveSettings(settings);
        chrome.storage.local.set({
          dual_subs: settings.enableDualSubtitles ?? false,
          sub_size_preset: settings.subtitleSizePreset || "md",
          popup_theme: settings.popupTheme || "glass"
        });
        const wordData = await this.refreshVocabularyCache(settings);
        const countMsg = wordData?.count ? ` (${wordData.count} words synced)` : "";
        this.showNotification(`All settings saved successfully!${countMsg}`, "success");
        await this.testConnection();
      } catch (err) {
        this.showNotification(`Failed to save settings: ${err.message}`, "error");
      } finally {
        this.btnSave.disabled = false;
      }
    }
    async testConnection() {
      this.serverStatusBadge.textContent = "Testing connection...";
      this.serverStatusBadge.className = "badge";
      try {
        const settings = this.getFormSettings();
        const testClient = new LecturaApiClient(settings);
        const health = await testClient.checkHealth();
        const wordData = await this.refreshVocabularyCache(settings);
        const version = health.version ? `v${health.version}` : "Online";
        const wordCount = wordData?.count !== void 0 ? ` \u2022 ${wordData.count} words` : "";
        this.serverStatusBadge.textContent = `Connected (${version}${wordCount})`;
        this.serverStatusBadge.className = "badge badge-success";
      } catch (err) {
        this.serverStatusBadge.textContent = "Server Unreachable";
        this.serverStatusBadge.className = "badge badge-error";
      }
    }
    showNotification(msg, type) {
      this.saveNotification.textContent = msg;
      this.saveNotification.className = `save-status ${type}`;
      setTimeout(() => {
        if (this.saveNotification.textContent === msg) {
          this.saveNotification.textContent = "";
        }
      }, 4e3);
    }
  };
  new OptionsController();
})();
