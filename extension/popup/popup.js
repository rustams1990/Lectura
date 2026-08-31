(() => {
  // extension/src/services/storage.ts
  var DEFAULT_SETTINGS = {
    serverUrl: "http://localhost:3000",
    authToken: "",
    syncKey: "",
    selectedUserId: "",
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
        chrome.storage.local.get([key], (res) => {
          resolve(res[key] || {});
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
        chrome.storage.local.set({ [key]: words }, () => resolve());
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
      if (settings.selectedUserId && settings.selectedUserId.trim()) {
        headers["x-local-sync-user"] = settings.selectedUserId.trim();
      }
      if (settings.authToken && settings.authToken.trim()) {
        const clean = settings.authToken.trim();
        headers["Authorization"] = clean.startsWith("Bearer ") ? clean : `Bearer ${clean}`;
      }
      if (settings.syncKey && settings.syncKey.trim()) {
        headers["x-local-sync-key"] = settings.syncKey.trim();
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
      const url = this.sanitizeUrl(settings.serverUrl, "/api/history/log");
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
      const langParam = language && language !== "all" ? `&language=${encodeURIComponent(language)}` : "";
      const url = this.sanitizeUrl(settings.serverUrl, `/api/activity/day?date=${encodeURIComponent(dateStr)}${langParam}`);
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
      tab_connection: "Connection & Sync",
      tab_youtube: "YouTube Overlay",
      tab_webreader: "Web Page Tooltip",
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
      tab_connection: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F",
      tab_youtube: "YouTube \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044B",
      tab_webreader: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430\u0445",
      tab_filters: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B \u0441\u0430\u0439\u0442\u043E\u0432",
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
      tab_connection: "Conexi\xF3n y sincronizaci\xF3n",
      tab_youtube: "Subt\xEDtulos de YouTube",
      tab_webreader: "Lector de p\xE1ginas web",
      tab_filters: "Filtros de sitios",
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

  // extension/src/services/domain-filter.ts
  function normalizeDomain(raw) {
    if (!raw) return "";
    let clean = raw.trim().toLowerCase();
    clean = clean.replace(/^https?:\/\//i, "");
    clean = clean.replace(/[\/?#].*$/, "");
    clean = clean.replace(/:\d+$/, "");
    clean = clean.replace(/^\*\./, "");
    clean = clean.replace(/^\.+|\.+$/g, "").trim();
    return clean;
  }
  function isDomainMatch(hostname, pattern) {
    const normHost = normalizeDomain(hostname);
    const normPattern = normalizeDomain(pattern);
    if (!normHost || !normPattern) return false;
    if (normHost === normPattern) return true;
    if (normHost.endsWith("." + normPattern)) return true;
    return false;
  }
  function isDomainDisabled(hostname, domainList = [], mode = "blacklist") {
    if (!hostname) return false;
    const validDomains = (domainList || []).map(normalizeDomain).filter(Boolean);
    if (validDomains.length === 0) {
      return false;
    }
    const isMatched = validDomains.some((pattern) => isDomainMatch(hostname, pattern));
    if (mode === "whitelist") {
      return !isMatched;
    }
    return isMatched;
  }

  // extension/src/popup/popup.ts
  var LECTURA_LANGUAGES_MAP = {
    en: { code: "en", name: "English", flag: "\u{1F1FA}\u{1F1F8}" },
    es: { code: "es", name: "Spanish", flag: "\u{1F1EA}\u{1F1F8}" },
    ru: { code: "ru", name: "Russian", flag: "\u{1F1F7}\u{1F1FA}" },
    fr: { code: "fr", name: "French", flag: "\u{1F1EB}\u{1F1F7}" },
    de: { code: "de", name: "German", flag: "\u{1F1E9}\u{1F1EA}" },
    pt: { code: "pt", name: "Portuguese", flag: "\u{1F1F5}\u{1F1F9}" },
    it: { code: "it", name: "Italian", flag: "\u{1F1EE}\u{1F1F9}" },
    uk: { code: "uk", name: "Ukrainian", flag: "\u{1F1FA}\u{1F1E6}" },
    kk: { code: "kk", name: "Kazakh", flag: "\u{1F1F0}\u{1F1FF}" },
    zh: { code: "zh", name: "Chinese", flag: "\u{1F1E8}\u{1F1F3}" },
    ja: { code: "ja", name: "Japanese", flag: "\u{1F1EF}\u{1F1F5}" },
    ko: { code: "ko", name: "Korean", flag: "\u{1F1F0}\u{1F1F7}" },
    tr: { code: "tr", name: "Turkish", flag: "\u{1F1F9}\u{1F1F7}" },
    pl: { code: "pl", name: "Polish", flag: "\u{1F1F5}\u{1F1F1}" },
    sv: { code: "sv", name: "Swedish", flag: "\u{1F1F8}\u{1F1EA}" },
    nl: { code: "nl", name: "Dutch", flag: "\u{1F1F3}\u{1F1F1}" },
    ar: { code: "ar", name: "Arabic", flag: "\u{1F1F8}\u{1F1E6}" },
    he: { code: "he", name: "Hebrew", flag: "\u{1F1EE}\u{1F1F1}" },
    hi: { code: "hi", name: "Hindi", flag: "\u{1F1EE}\u{1F1F3}" },
    fa: { code: "fa", name: "Persian", flag: "\u{1F1EE}\u{1F1F7}" },
    el: { code: "el", name: "Greek", flag: "\u{1F1EC}\u{1F1F7}" }
  };
  var LANGUAGE_ALIASES = {
    sp: "es",
    spa: "es",
    spanish: "es",
    esp: "es",
    espanol: "es",
    espa\u00F1ol: "es",
    eng: "en",
    english: "en",
    rus: "ru",
    russian: "ru",
    ger: "de",
    deu: "de",
    german: "de",
    deutsch: "de",
    fra: "fr",
    fre: "fr",
    french: "fr",
    por: "pt",
    portuguese: "pt",
    ita: "it",
    italian: "it",
    ukr: "uk",
    ukrainian: "uk",
    kaz: "kk",
    kazakh: "kk",
    chi: "zh",
    zho: "zh",
    chinese: "zh",
    jpn: "ja",
    japanese: "ja",
    kor: "ko",
    korean: "ko",
    tur: "tr",
    turkish: "tr",
    pol: "pl",
    polish: "pl",
    swe: "sv",
    swedish: "sv",
    dut: "nl",
    nld: "nl",
    dutch: "nl",
    ara: "ar",
    arabic: "ar"
  };
  function normalizeLanguageCode(rawCode) {
    if (!rawCode) return "en";
    const raw = rawCode.toLowerCase().trim();
    if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw];
    const clean = raw.replace(/[-_].*$/, "");
    if (LANGUAGE_ALIASES[clean]) return LANGUAGE_ALIASES[clean];
    if (LECTURA_LANGUAGES_MAP[clean]) return clean;
    return clean.slice(0, 2);
  }
  var DEFAULT_LANGUAGE_FLAGS = {
    en: "us",
    es: "es",
    ru: "ru",
    pt: "br",
    it: "it",
    fr: "fr",
    de: "de",
    uk: "ua",
    ua: "ua",
    kk: "kz",
    zh: "cn",
    ja: "jp",
    ko: "kr",
    ar: "sa",
    tr: "tr",
    pl: "pl",
    sv: "se",
    nl: "nl",
    he: "il",
    hi: "in",
    fa: "ir",
    el: "gr"
  };
  var LANGUAGE_NAMES = {
    en: "English",
    es: "Spanish",
    ru: "Russian",
    pt: "Portuguese",
    it: "Italian",
    fr: "French",
    de: "German",
    uk: "Ukrainian",
    ua: "Ukrainian",
    kk: "Kazakh",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    ar: "Arabic",
    tr: "Turkish",
    pl: "Polish",
    sv: "Swedish",
    nl: "Dutch",
    he: "Hebrew",
    hi: "Hindi",
    fa: "Persian",
    el: "Greek"
  };
  var FLAG_EMOJI_TO_CODE = {
    "\u{1F1FA}\u{1F1F8}": "us",
    "\u{1F1E8}\u{1F1E6}": "ca",
    "\u{1F1F2}\u{1F1FD}": "mx",
    "\u{1F1E8}\u{1F1F4}": "co",
    "\u{1F1E6}\u{1F1F7}": "ar",
    "\u{1F1E8}\u{1F1F1}": "cl",
    "\u{1F1F5}\u{1F1EA}": "pe",
    "\u{1F1FB}\u{1F1EA}": "ve",
    "\u{1F1EA}\u{1F1E8}": "ec",
    "\u{1F1EC}\u{1F1F9}": "gt",
    "\u{1F1E8}\u{1F1FA}": "cu",
    "\u{1F1E9}\u{1F1F4}": "do",
    "\u{1F1ED}\u{1F1F3}": "hn",
    "\u{1F1F5}\u{1F1FE}": "py",
    "\u{1F1F8}\u{1F1FB}": "sv",
    "\u{1F1F3}\u{1F1EE}": "ni",
    "\u{1F1E8}\u{1F1F7}": "cr",
    "\u{1F1F5}\u{1F1E6}": "pa",
    "\u{1F1FA}\u{1F1FE}": "uy",
    "\u{1F1E7}\u{1F1F4}": "bo",
    "\u{1F1E7}\u{1F1F7}": "br",
    "\u{1F1EF}\u{1F1F2}": "jm",
    "\u{1F1ED}\u{1F1F9}": "ht",
    "\u{1F1F8}\u{1F1F7}": "sr",
    "\u{1F1EC}\u{1F1E7}": "gb",
    "\u{1F1EA}\u{1F1F8}": "es",
    "\u{1F1E9}\u{1F1EA}": "de",
    "\u{1F1E6}\u{1F1F9}": "at",
    "\u{1F1E8}\u{1F1ED}": "ch",
    "\u{1F1EB}\u{1F1F7}": "fr",
    "\u{1F1F7}\u{1F1FA}": "ru",
    "\u{1F1EE}\u{1F1F9}": "it",
    "\u{1F1F5}\u{1F1F9}": "pt",
    "\u{1F1FA}\u{1F1E6}": "ua",
    "\u{1F1F5}\u{1F1F1}": "pl",
    "\u{1F1F8}\u{1F1EA}": "se",
    "\u{1F1F3}\u{1F1F1}": "nl",
    "\u{1F1E7}\u{1F1EA}": "be",
    "\u{1F1EC}\u{1F1F7}": "gr",
    "\u{1F1EE}\u{1F1EA}": "ie",
    "\u{1F1E7}\u{1F1FE}": "by",
    "\u{1F1EF}\u{1F1F5}": "jp",
    "\u{1F1E8}\u{1F1F3}": "cn",
    "\u{1F1F9}\u{1F1FC}": "tw",
    "\u{1F1F0}\u{1F1F7}": "kr",
    "\u{1F1F0}\u{1F1F5}": "kp",
    "\u{1F1F9}\u{1F1F7}": "tr",
    "\u{1F1F8}\u{1F1E6}": "sa",
    "\u{1F1E6}\u{1F1EA}": "ae",
    "\u{1F1EA}\u{1F1EC}": "eg",
    "\u{1F1EE}\u{1F1F7}": "ir",
    "\u{1F1EE}\u{1F1F1}": "il",
    "\u{1F1EE}\u{1F1F3}": "in",
    "\u{1F1F0}\u{1F1FF}": "kz",
    "\u{1F1E6}\u{1F1FA}": "au",
    "\u{1F1F3}\u{1F1FF}": "nz",
    "\u{1F1FB}\u{1F1F3}": "vn"
  };
  function getLanguageFlagCode(langCode, userFlags = {}) {
    const norm = normalizeLanguageCode(langCode);
    const rawLower = (langCode || "").toLowerCase().trim();
    let customVal = userFlags[norm] || userFlags[rawLower];
    if (!customVal && userFlags && typeof userFlags === "object") {
      for (const [k, v] of Object.entries(userFlags)) {
        if (normalizeLanguageCode(k) === norm && v) {
          customVal = v;
          break;
        }
      }
    }
    if (customVal && typeof customVal === "string") {
      const trimmed = customVal.trim();
      if (FLAG_EMOJI_TO_CODE[trimmed]) {
        return FLAG_EMOJI_TO_CODE[trimmed].toLowerCase();
      }
      if (/^[a-zA-Z]{2,3}$/.test(trimmed)) {
        return trimmed.toLowerCase();
      }
    }
    const defaults = {
      en: "us",
      es: "es",
      ru: "ru",
      pt: "br",
      it: "it",
      fr: "fr",
      de: "de",
      uk: "ua",
      ua: "ua",
      kk: "kz",
      zh: "cn",
      ja: "jp",
      ko: "kr",
      ar: "sa",
      tr: "tr",
      pl: "pl",
      sv: "se",
      nl: "nl",
      he: "il",
      hi: "in",
      fa: "ir",
      el: "gr"
    };
    return defaults[norm] || norm || "us";
  }
  function getFlagImageUrl(flagCode) {
    const code = (flagCode || "us").toLowerCase().trim();
    return `https://flagcdn.com/w40/${code}.png`;
  }
  function getLanguageFlagUrl(langCode, userCustomFlags = {}) {
    const flagCode = getLanguageFlagCode(langCode, userCustomFlags);
    return getFlagImageUrl(flagCode);
  }
  function getLanguageDisplay(code, userCustomFlags) {
    const normCode = normalizeLanguageCode(code);
    const base = LECTURA_LANGUAGES_MAP[normCode] || {
      code: normCode,
      name: LANGUAGE_NAMES[normCode] || (code.length > 2 ? code.charAt(0).toUpperCase() + code.slice(1) : normCode.toUpperCase()),
      flag: "\u{1F310}"
    };
    if (userCustomFlags && userCustomFlags[normCode]) {
      return { ...base, flag: userCustomFlags[normCode] };
    }
    return base;
  }
  var PopupController = class {
    constructor() {
      this.activeHostname = "";
      this.currentSubtitleBgColor = "rgba(0, 0, 0, 0.45)";
      this.currentSubtitleMode = "underline";
      this.currentCalendarYear = (/* @__PURE__ */ new Date()).getFullYear();
      this.currentCalendarMonth = (/* @__PURE__ */ new Date()).getMonth();
      // 0-indexed (0 = Jan, 7 = Aug)
      this.selectedDateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      this.selectedActivityLang = "all";
      this.activityHistoryCache = [];
      this.userCustomFlagsCache = {};
      this.currentUiLang = "en";
      this.userGoalsCache = {
        dailyGoalMinutes: 15,
        dailyGoalsByLanguage: {}
      };
      this.apiClient = new LecturaApiClient();
      document.addEventListener("DOMContentLoaded", () => this.init());
    }
    async init() {
      this.masterPowerCard = document.getElementById("masterPowerCard");
      this.globalEnabledToggle = document.getElementById("globalEnabledToggle");
      this.powerStatusDot = document.getElementById("powerStatusDot");
      this.powerStatusTitle = document.getElementById("powerStatusTitle");
      this.powerStatusDesc = document.getElementById("powerStatusDesc");
      this.currentTabDomain = document.getElementById("currentTabDomain");
      this.btnToggleSiteBlacklist = document.getElementById("btnToggleSiteBlacklist");
      this.serverUrlInput = document.getElementById("serverUrl");
      this.authTokenInput = document.getElementById("authToken");
      this.interfaceLanguageSelect = document.getElementById("interfaceLanguage");
      this.userProfileSelect = document.getElementById("userProfileSelect");
      this.targetLanguageSelect = document.getElementById("targetLanguage");
      this.ttsDialectSelect = document.getElementById("ttsDialect");
      this.studyLangFlagImg = document.getElementById("studyLangFlagImg");
      this.subSizeSelect = document.getElementById("subSizeSelect");
      this.subFontSizeInput = document.getElementById("subFontSize");
      this.subFontSizeValue = document.getElementById("subFontSizeValue");
      this.subBgColorPicker = document.getElementById("subBgColorPicker");
      this.dualSubsCheck = document.getElementById("dualSubsCheck");
      this.pauseOnWordClickCheck = document.getElementById("pauseOnWordClickCheck");
      this.enableYoutubeOverlayCheck = document.getElementById("enableYoutubeOverlayCheck");
      this.trackListeningActivityCheck = document.getElementById("trackListeningActivityCheck");
      this.popupThemeSelect = document.getElementById("popupThemeSelect");
      this.connectionBadge = document.getElementById("connectionBadge");
      this.statusAlert = document.getElementById("statusAlert");
      this.btnTestConnection = document.getElementById("btnTestConnection");
      this.btnSaveConfig = document.getElementById("btnSaveConfig");
      this.btnImportPage = document.getElementById("btnImportPage");
      this.btnOpenLectura = document.getElementById("btnOpenLectura");
      this.btnSyncWords = document.getElementById("btnSyncWords");
      this.btnOptions = document.getElementById("btnOptions");
      this.btnModeUnderline = document.getElementById("btnModeUnderline");
      this.btnModeColor = document.getElementById("btnModeColor");
      this.tabBtnSettings = document.getElementById("tabBtnSettings");
      this.tabBtnActivity = document.getElementById("tabBtnActivity");
      this.tabContentSettings = document.getElementById("tabContentSettings");
      this.tabContentActivity = document.getElementById("tabContentActivity");
      this.activityLangPillsContainer = document.getElementById("activityLangPills");
      this.statWeek = document.getElementById("statWeek");
      this.statMonth = document.getElementById("statMonth");
      this.statLangsCount = document.getElementById("statLangsCount");
      this.prevMonthBtn = document.getElementById("prevMonthBtn");
      this.nextMonthBtn = document.getElementById("nextMonthBtn");
      this.currentMonthYearLabel = document.getElementById("currentMonthYearLabel");
      this.calendarDaysGrid = document.getElementById("calendarDaysGrid");
      this.calendarGoalBadge = document.getElementById("calendarGoalBadge");
      this.selectedDateLabel = document.getElementById("selectedDateLabel");
      this.dayLogsContainer = document.getElementById("dayLogsContainer");
      this.bindEvents();
      await this.loadSettings();
      await this.detectActiveTabDomain();
      await this.loadProfiles();
      await this.testConnection(false);
      chrome.storage.local.get(["activePopupTab"], (res) => {
        if (res.activePopupTab === "activity") {
          this.switchTab("activity");
        }
      });
    }
    updateStudyLanguageFlag(langCode) {
      if (!this.studyLangFlagImg) return;
      const flagUrl = getLanguageFlagUrl(langCode, this.userCustomFlagsCache);
      this.studyLangFlagImg.src = flagUrl;
    }
    bindEvents() {
      if (this.btnTestConnection) {
        this.btnTestConnection.addEventListener("click", async () => {
          await this.loadProfiles();
          await this.testConnection(true);
        });
      }
      if (this.btnSaveConfig) {
        this.btnSaveConfig.addEventListener("click", () => this.saveConfig());
      }
      if (this.btnImportPage) {
        this.btnImportPage.addEventListener("click", () => this.importCurrentPage());
      }
      if (this.btnOpenLectura) {
        this.btnOpenLectura.addEventListener("click", () => this.openLecturaApp());
      }
      if (this.btnSyncWords) {
        this.btnSyncWords.addEventListener("click", () => this.syncWords());
      }
      if (this.btnOptions) {
        this.btnOptions.addEventListener("click", () => {
          chrome.runtime.openOptionsPage();
        });
      }
      if (this.targetLanguageSelect) {
        this.targetLanguageSelect.addEventListener("change", async () => {
          const lang = this.targetLanguageSelect.value;
          await StorageService.saveSettings({ targetLanguage: lang });
          this.updateStudyLanguageFlag(lang);
          try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "UPDATE_TARGET_LANGUAGE",
                  language: lang
                }).catch(() => {
                });
              }
            }
          } catch (_) {
          }
        });
      }
      if (this.btnModeUnderline) {
        this.btnModeUnderline.addEventListener("click", () => this.setSubtitleMode("underline"));
      }
      if (this.btnModeColor) {
        this.btnModeColor.addEventListener("click", () => this.setSubtitleMode("color"));
      }
      if (this.interfaceLanguageSelect) {
        this.interfaceLanguageSelect.addEventListener("change", async () => {
          const lang = this.interfaceLanguageSelect?.value || "en";
          this.currentUiLang = lang;
          await StorageService.saveSettings({ interfaceLanguage: lang });
          applyI18nToDOM(document, lang);
          this.renderLanguageFilters();
          this.renderCalendar();
          this.loadDayLogs(this.selectedDateStr);
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
      if (this.userProfileSelect) {
        this.userProfileSelect.addEventListener("change", async () => {
          const selectedUserId = this.userProfileSelect?.value;
          if (selectedUserId) {
            await StorageService.saveSettings({ selectedUserId });
          }
        });
      }
      if (this.subSizeSelect) {
        this.subSizeSelect.addEventListener("change", async () => {
          const sizePreset = this.subSizeSelect?.value || "md";
          await StorageService.saveSettings({ subtitleSizePreset: sizePreset });
          chrome.storage.local.set({ sub_size_preset: sizePreset });
        });
      }
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
      if (this.enableYoutubeOverlayCheck) {
        this.enableYoutubeOverlayCheck.addEventListener("change", async () => {
          const enabled = this.enableYoutubeOverlayCheck.checked;
          await StorageService.saveSettings({ enableYoutubeOverlay: enabled });
          chrome.storage.local.set({ enableYoutubeOverlay: enabled });
          try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "UPDATE_YOUTUBE_OVERLAY_ENABLED",
                  enabled
                }).catch(() => {
                });
              }
            }
          } catch (_) {
          }
        });
      }
      if (this.trackListeningActivityCheck) {
        this.trackListeningActivityCheck.addEventListener("change", async () => {
          const enabled = this.trackListeningActivityCheck.checked;
          await StorageService.saveSettings({ trackListeningActivity: enabled });
          chrome.storage.local.set({ trackListeningActivity: enabled });
          try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "UPDATE_TRACK_ACTIVITY_ENABLED",
                  enabled
                }).catch(() => {
                });
              }
            }
          } catch (_) {
          }
        });
      }
      this.dualSubsCheck.addEventListener("change", async () => {
        const enabled = this.dualSubsCheck.checked;
        await StorageService.saveSettings({ enableDualSubtitles: enabled });
        chrome.storage.local.set({ dual_subs: enabled });
      });
      if (this.subFontSizeInput) {
        this.subFontSizeInput.addEventListener("input", () => {
          const val = parseInt(this.subFontSizeInput.value, 10) || 22;
          if (this.subFontSizeValue) {
            this.subFontSizeValue.textContent = `${val}px`;
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
      this.pauseOnWordClickCheck.addEventListener("change", async () => {
        const enabled = this.pauseOnWordClickCheck.checked;
        await StorageService.saveSettings({ pauseOnWordClick: enabled });
      });
      if (this.globalEnabledToggle) {
        this.globalEnabledToggle.addEventListener("change", async () => {
          const isEnabled = this.globalEnabledToggle.checked;
          await StorageService.saveSettings({ isEnabled });
          this.updatePowerSwitchUI(isEnabled);
        });
      }
      if (this.btnToggleSiteBlacklist) {
        this.btnToggleSiteBlacklist.addEventListener("click", async () => {
          if (!this.activeHostname) return;
          const settings = await StorageService.getSettings();
          const domains = [...settings.disabledDomains || []];
          const isCurrentlyDisabled = isDomainDisabled(this.activeHostname, domains, settings.domainFilterMode || "blacklist");
          if (isCurrentlyDisabled) {
            const norm = normalizeDomain(this.activeHostname);
            const filtered = domains.filter((d) => normalizeDomain(d) !== norm);
            await StorageService.saveSettings({ disabledDomains: filtered });
          } else {
            const norm = normalizeDomain(this.activeHostname);
            if (!domains.some((d) => normalizeDomain(d) === norm)) {
              domains.push(norm);
            }
            await StorageService.saveSettings({ disabledDomains: domains });
          }
          await this.updateSiteToggleUI();
        });
      }
      this.tabBtnSettings?.addEventListener("click", () => this.switchTab("settings"));
      this.tabBtnActivity?.addEventListener("click", () => this.switchTab("activity"));
      this.prevMonthBtn?.addEventListener("click", () => {
        this.currentCalendarMonth--;
        if (this.currentCalendarMonth < 0) {
          this.currentCalendarMonth = 11;
          this.currentCalendarYear--;
        }
        this.renderCalendar();
        this.renderSummaryStats();
      });
      this.nextMonthBtn?.addEventListener("click", () => {
        this.currentCalendarMonth++;
        if (this.currentCalendarMonth > 11) {
          this.currentCalendarMonth = 0;
          this.currentCalendarYear++;
        }
        this.renderCalendar();
        this.renderSummaryStats();
      });
      this.activityLangPillsContainer?.addEventListener("click", (e) => {
        const btn = e.target.closest(".lang-pill");
        if (!btn) return;
        const lang = btn.dataset.lang || "all";
        this.selectedActivityLang = lang;
        this.renderLanguageFilters();
        this.renderCalendar();
        this.renderSummaryStats();
        this.loadDayLogs(this.selectedDateStr);
      });
      this.calendarDaysGrid?.addEventListener("click", (e) => {
        const cell = e.target.closest(".cal-day-cell");
        if (!cell || !cell.dataset.date) return;
        this.selectedDateStr = cell.dataset.date;
        this.calendarDaysGrid.querySelectorAll(".cal-day-cell").forEach((c) => c.classList.remove("selected-day"));
        cell.classList.add("selected-day");
        this.loadDayLogs(this.selectedDateStr);
      });
      this.dayLogsContainer?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".delete-log-btn");
        if (!btn || !btn.dataset.id) return;
        const logId = btn.dataset.id;
        await this.handleDeleteActivityLog(logId, this.selectedDateStr);
      });
    }
    switchTab(activeTab) {
      if (activeTab === "settings") {
        this.tabContentSettings?.classList.remove("hidden");
        this.tabContentActivity?.classList.add("hidden");
        this.tabBtnSettings?.classList.add("active");
        this.tabBtnActivity?.classList.remove("active");
      } else {
        this.tabContentActivity?.classList.remove("hidden");
        this.tabContentSettings?.classList.add("hidden");
        this.tabBtnActivity?.classList.add("active");
        this.tabBtnSettings?.classList.remove("active");
        this.loadActivityHistory();
        this.loadDayLogs(this.selectedDateStr);
      }
      chrome.storage.local.set({ activePopupTab: activeTab });
    }
    async loadActivityHistory() {
      try {
        const res = await this.apiClient.getActivityHistory();
        if (res.success) {
          if (Array.isArray(res.history)) {
            this.activityHistoryCache = res.history;
          }
          if (res.userGoals) {
            this.userGoalsCache = res.userGoals;
          }
          if (res.customFlags) {
            this.userCustomFlagsCache = { ...this.userCustomFlagsCache, ...res.customFlags };
            chrome.storage.local.set({ userCustomFlags: this.userCustomFlagsCache });
          }
        }
      } catch (_) {
      }
      this.renderLanguageFilters();
      this.renderCalendar();
      this.renderSummaryStats();
    }
    getTargetGoalMinutes(langCode) {
      if (langCode === "all") {
        const goals2 = this.userGoalsCache?.dailyGoalsByLanguage;
        if (goals2 && Object.keys(goals2).length > 0) {
          const sum = Object.values(goals2).reduce((acc, g) => acc + (Number(g) || 0), 0);
          if (sum > 0) return sum;
        }
        return this.userGoalsCache?.dailyGoalMinutes || 60;
      }
      const goals = this.userGoalsCache?.dailyGoalsByLanguage || {};
      const normLang = normalizeLanguageCode(langCode);
      const langMeta = LECTURA_LANGUAGES_MAP[normLang];
      for (const [k, v] of Object.entries(goals)) {
        const normK = normalizeLanguageCode(k);
        if (normK === normLang || langMeta && k.toLowerCase() === langMeta.name.toLowerCase()) {
          if (typeof v === "number" && v > 0) return v;
        }
      }
      return this.userGoalsCache?.dailyGoalMinutes || 15;
    }
    renderLanguageFilters() {
      if (!this.activityLangPillsContainer) return;
      const langMinutesMap = {};
      for (const item of this.activityHistoryCache) {
        const code = normalizeLanguageCode(item.targetLanguage || "en");
        const sec = Number(item.durationSeconds) || 0;
        langMinutesMap[code] = (langMinutesMap[code] || 0) + Math.round(sec / 60);
      }
      const activeLangCodes = Object.keys(langMinutesMap).filter((code) => langMinutesMap[code] > 0);
      if (this.selectedActivityLang !== "all" && !activeLangCodes.includes(this.selectedActivityLang)) {
        this.selectedActivityLang = "all";
      }
      const overallLabel = t("overall", this.currentUiLang);
      let html = `
      <button type="button" class="lang-pill ${this.selectedActivityLang === "all" ? "active" : ""}" data-lang="all">
        <span class="text-base">\u{1F310}</span>
        <span class="font-semibold text-xs">${overallLabel}</span>
      </button>
    `;
      for (const code of activeLangCodes) {
        const name = LANGUAGE_NAMES[code] || LECTURA_LANGUAGES_MAP[code]?.name || code.toUpperCase();
        const flagUrl = getLanguageFlagUrl(code, this.userCustomFlagsCache);
        const isSel = this.selectedActivityLang === code ? "active" : "";
        html += `
        <button type="button" class="lang-pill ${isSel}" data-lang="${code}">
          <img src="${flagUrl}" alt="${name}" class="w-4 h-4 rounded-full object-cover shadow-xs" />
          <span class="font-semibold text-xs">${name}</span>
        </button>
      `;
      }
      this.activityLangPillsContainer.innerHTML = html;
    }
    renderCalendar() {
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];
      if (this.currentMonthYearLabel) {
        this.currentMonthYearLabel.textContent = `${monthNames[this.currentCalendarMonth]} ${this.currentCalendarYear}`;
      }
      const targetGoalMinutes = this.getTargetGoalMinutes(this.selectedActivityLang);
      if (this.calendarGoalBadge) {
        const goalLabel = t("goal_per_day", this.currentUiLang);
        this.calendarGoalBadge.textContent = `${goalLabel}: ${targetGoalMinutes} m/day`;
      }
      if (!this.calendarDaysGrid) return;
      this.calendarDaysGrid.innerHTML = "";
      const year = this.currentCalendarYear;
      const month = this.currentCalendarMonth;
      const firstDayDate = new Date(year, month, 1);
      const startingDay = (firstDayDate.getDay() + 6) % 7;
      const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();
      const today = /* @__PURE__ */ new Date();
      const isCurrentMonthAndYear = today.getFullYear() === year && today.getMonth() === month;
      const todayDate = today.getDate();
      const dailySecondsMap = {};
      for (const item of this.activityHistoryCache) {
        const itemCode = normalizeLanguageCode(item.targetLanguage || "en");
        if (this.selectedActivityLang !== "all" && itemCode !== this.selectedActivityLang) {
          continue;
        }
        if (!item.timestamp) continue;
        const d = new Date(item.timestamp);
        if (d.getFullYear() === year && d.getMonth() === month) {
          const dayNum = d.getDate();
          dailySecondsMap[dayNum] = (dailySecondsMap[dayNum] || 0) + (Number(item.durationSeconds) || 0);
        }
      }
      for (let i = startingDay - 1; i >= 0; i--) {
        const prevDay = prevMonthDays - i;
        const prevMonthIdx = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prevDateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, "0")}-${String(prevDay).padStart(2, "0")}`;
        const cell = document.createElement("div");
        cell.className = "cal-day-cell other-month";
        cell.dataset.date = prevDateStr;
        if (this.selectedDateStr === prevDateStr) cell.classList.add("selected-day");
        cell.textContent = String(prevDay);
        this.calendarDaysGrid.appendChild(cell);
      }
      for (let day = 1; day <= totalDaysInMonth; day++) {
        const cell = document.createElement("div");
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        cell.dataset.date = dateStr;
        const totalSec = dailySecondsMap[day] || 0;
        const totalMin = Math.round(totalSec / 60);
        const isToday = isCurrentMonthAndYear && day === todayDate;
        const isSelected = this.selectedDateStr === dateStr;
        if (totalMin > 0) {
          const isGoalReached = totalMin >= targetGoalMinutes;
          const statusClass = isGoalReached ? "cal-day-completed" : "cal-day-partial";
          cell.className = `cal-day-cell ${statusClass}${isToday ? " cal-day-today today" : ""}${isSelected ? " selected-day" : ""}`;
          const timeLabel = totalMin < 60 ? `${totalMin}m` : `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
          cell.innerHTML = `
          <span class="day-num">${day}</span>
          <span class="day-time">${timeLabel}</span>
        `;
        } else {
          cell.className = `cal-day-cell cal-day-empty inactive${isToday ? " cal-day-today today" : ""}${isSelected ? " selected-day" : ""}`;
          cell.textContent = String(day);
        }
        this.calendarDaysGrid.appendChild(cell);
      }
      const totalRendered = startingDay + totalDaysInMonth;
      const remaining = (7 - totalRendered % 7) % 7;
      for (let day = 1; day <= remaining; day++) {
        const nextMonthIdx = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        const nextDateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const cell = document.createElement("div");
        cell.className = "cal-day-cell other-month";
        cell.dataset.date = nextDateStr;
        if (this.selectedDateStr === nextDateStr) cell.classList.add("selected-day");
        cell.textContent = String(day);
        this.calendarDaysGrid.appendChild(cell);
      }
    }
    async loadDayLogs(dateStr) {
      if (!this.dayLogsContainer) return;
      if (this.selectedDateLabel) {
        try {
          const parts = dateStr.split("-");
          if (parts.length === 3) {
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            this.selectedDateLabel.textContent = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          } else {
            this.selectedDateLabel.textContent = dateStr;
          }
        } catch (_) {
          this.selectedDateLabel.textContent = dateStr;
        }
      }
      try {
        const res = await this.apiClient.getDayActivity(dateStr, this.selectedActivityLang);
        if (res.success && Array.isArray(res.logs) && res.logs.length > 0) {
          let html = "";
          for (const log of res.logs) {
            const normCode = normalizeLanguageCode(log.language);
            const name = LANGUAGE_NAMES[normCode] || LECTURA_LANGUAGES_MAP[normCode]?.name || normCode.toUpperCase();
            const flagUrl = getLanguageFlagUrl(log.language, this.userCustomFlagsCache);
            const safeTitle = (log.title || "YouTube Video").replace(/"/g, "&quot;");
            const safeChannel = (log.channel || "YouTube").replace(/"/g, "&quot;");
            const safeSource = (log.source || "YouTube").replace(/"/g, "&quot;");
            html += `
            <div class="history-item">
              <div class="history-item-content">
                <div class="history-item-header">
                  <a href="${log.url || "#"}" target="_blank" class="history-item-title" title="${safeTitle}">
                    ${safeTitle}
                  </a>
                  <span class="history-item-minutes">${log.minutes} m</span>
                </div>
                <div class="history-item-meta">
                  <span class="inline-flex items-center gap-1.5">
                    <img src="${flagUrl}" alt="${name}" class="w-3.5 h-3.5 rounded-full object-cover shadow-xs inline-block" />
                    <span>${name}</span>
                  </span>
                  <span>\u2022</span>
                  <span>${safeSource}</span>
                  <span>\u2022</span>
                  <span class="truncate">${safeChannel}</span>
                </div>
              </div>
              <button type="button" class="delete-log-btn" data-id="${log.id}" title="${t("delete_entry", this.currentUiLang)}">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          `;
          }
          this.dayLogsContainer.innerHTML = html;
        } else {
          this.dayLogsContainer.innerHTML = `<div class="day-logs-empty">${t("no_activity_day", this.currentUiLang)}</div>`;
        }
      } catch (err) {
        this.dayLogsContainer.innerHTML = `<div class="day-logs-empty">${t("failed_load_day_activity", this.currentUiLang)}</div>`;
      }
    }
    async handleDeleteActivityLog(logId, dateStr) {
      const confirmed = window.confirm(t("confirm_delete_log", this.currentUiLang));
      if (!confirmed) return;
      try {
        const res = await this.apiClient.deleteActivityLog(logId);
        if (res.success) {
          await this.loadDayLogs(dateStr);
          await this.loadActivityHistory();
        } else {
          alert(t("failed_delete_log", this.currentUiLang));
        }
      } catch (err) {
        console.error("Failed to delete log:", err);
        alert(t("failed_delete_log", this.currentUiLang));
      }
    }
    renderSummaryStats() {
      const filtered = this.activityHistoryCache.filter((item) => {
        if (this.selectedActivityLang === "all") return true;
        const code = normalizeLanguageCode(item.targetLanguage || "en");
        return code === this.selectedActivityLang;
      });
      const activeLangs = new Set(
        this.activityHistoryCache.filter((h) => (Number(h.durationSeconds) || 0) > 0).map((h) => normalizeLanguageCode(h.targetLanguage || "en"))
      );
      if (this.statLangsCount) {
        this.statLangsCount.textContent = String(Math.max(1, activeLangs.size));
      }
      const now = /* @__PURE__ */ new Date();
      const dayOfWeek = (now.getDay() + 6) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
      const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1e3);
      let weekSeconds = 0;
      let monthSeconds = 0;
      const currentYear = this.currentCalendarYear;
      const currentMonth = this.currentCalendarMonth;
      for (const item of filtered) {
        if (!item.timestamp) continue;
        const d = new Date(item.timestamp);
        const sec = Number(item.durationSeconds) || 0;
        if (d >= monday && d < sunday) {
          weekSeconds += sec;
        }
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          monthSeconds += sec;
        }
      }
      if (this.statWeek) {
        const weekMin = Math.round(weekSeconds / 60);
        this.statWeek.textContent = weekMin < 60 ? `${weekMin} m` : `${Math.floor(weekMin / 60)} h ${weekMin % 60} m`;
      }
      if (this.statMonth) {
        const monthMin = Math.round(monthSeconds / 60);
        this.statMonth.textContent = monthMin < 60 ? `${monthMin} m` : `${Math.floor(monthMin / 60)} h ${monthMin % 60} m`;
      }
    }
    applyBgColor(color) {
      this.currentSubtitleBgColor = color;
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
    async setSubtitleMode(mode) {
      this.currentSubtitleMode = mode;
      this.updateModeButtonsUI(mode);
      await StorageService.saveSettings({ subtitleHighlightMode: mode });
    }
    updateModeButtonsUI(mode) {
      if (mode === "underline") {
        this.btnModeUnderline.classList.add("active");
        this.btnModeColor.classList.remove("active");
      } else {
        this.btnModeColor.classList.add("active");
        this.btnModeUnderline.classList.remove("active");
      }
    }
    async loadSettings() {
      const settings = await StorageService.getSettings();
      if (this.serverUrlInput) {
        this.serverUrlInput.value = settings.serverUrl || "http://localhost:3000";
      }
      if (this.authTokenInput) {
        this.authTokenInput.value = settings.authToken || "";
      }
      if (this.targetLanguageSelect) {
        this.targetLanguageSelect.value = settings.targetLanguage || "es";
        this.updateStudyLanguageFlag(this.targetLanguageSelect.value);
      }
      if (this.interfaceLanguageSelect) {
        this.interfaceLanguageSelect.value = settings.interfaceLanguage || "en";
      }
      if (this.ttsDialectSelect) {
        this.ttsDialectSelect.value = settings.ttsDialect || "en-US";
      }
      if (this.subSizeSelect) {
        this.subSizeSelect.value = settings.subtitleSizePreset || "md";
      }
      if (this.subFontSizeInput) {
        const size = settings.subtitleFontSize || 22;
        this.subFontSizeInput.value = String(size);
        if (this.subFontSizeValue) {
          this.subFontSizeValue.textContent = `${size}px`;
        }
      }
      this.currentSubtitleBgColor = settings.subtitleBgColor || "rgba(0, 0, 0, 0.45)";
      if (this.popupThemeSelect) {
        this.popupThemeSelect.value = settings.popupTheme || "glass";
      }
      if (this.enableYoutubeOverlayCheck) {
        this.enableYoutubeOverlayCheck.checked = settings.enableYoutubeOverlay ?? true;
      }
      if (this.trackListeningActivityCheck) {
        this.trackListeningActivityCheck.checked = settings.trackListeningActivity ?? true;
      }
      if (this.dualSubsCheck) {
        this.dualSubsCheck.checked = settings.enableDualSubtitles ?? false;
      }
      if (this.pauseOnWordClickCheck) {
        this.pauseOnWordClickCheck.checked = settings.pauseOnWordClick ?? false;
      }
      this.currentSubtitleMode = settings.subtitleHighlightMode || "underline";
      this.updateModeButtonsUI(this.currentSubtitleMode);
      const isEnabled = settings.isEnabled !== false;
      if (this.globalEnabledToggle) {
        this.globalEnabledToggle.checked = isEnabled;
      }
      this.updatePowerSwitchUI(isEnabled);
      this.currentUiLang = settings.interfaceLanguage || "en";
      applyI18nToDOM(document, this.currentUiLang);
      chrome.storage.local.get(["userCustomFlags", "userProfile", "lecturaServerSettings"], (res) => {
        const storedFlags = res.userCustomFlags || res.userProfile?.languageFlags || res.lecturaServerSettings?.languageFlags || {};
        if (storedFlags && typeof storedFlags === "object") {
          this.userCustomFlagsCache = { ...this.userCustomFlagsCache, ...storedFlags };
          if (this.targetLanguageSelect) {
            this.updateStudyLanguageFlag(this.targetLanguageSelect.value);
          }
        }
      });
      await this.updateSiteToggleUI();
    }
    updatePowerSwitchUI(isEnabled) {
      if (!this.masterPowerCard) return;
      if (isEnabled) {
        this.masterPowerCard.classList.remove("disabled");
        if (this.powerStatusDot) this.powerStatusDot.classList.add("active");
        if (this.powerStatusTitle) {
          this.powerStatusTitle.textContent = t("ext_enabled", this.currentUiLang) || "Lectura Active";
        }
        if (this.powerStatusDesc) {
          this.powerStatusDesc.textContent = t("ext_enabled_desc", this.currentUiLang) || "Translating & capturing vocabulary";
        }
      } else {
        this.masterPowerCard.classList.add("disabled");
        if (this.powerStatusDot) this.powerStatusDot.classList.remove("active");
        if (this.powerStatusTitle) {
          this.powerStatusTitle.textContent = t("ext_disabled", this.currentUiLang) || "Lectura Paused";
        }
        if (this.powerStatusDesc) {
          this.powerStatusDesc.textContent = t("ext_disabled_desc", this.currentUiLang) || "All translations and overlays paused";
        }
      }
    }
    async detectActiveTabDomain() {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
          const urlObj = new URL(activeTab.url);
          if (urlObj.protocol.startsWith("http")) {
            this.activeHostname = urlObj.hostname;
            if (this.currentTabDomain) {
              this.currentTabDomain.textContent = this.activeHostname;
            }
            await this.updateSiteToggleUI();
            return;
          }
        }
      } catch (_) {
      }
      this.activeHostname = "";
      if (this.currentTabDomain) {
        this.currentTabDomain.textContent = "Current tab";
      }
    }
    async updateSiteToggleUI() {
      if (!this.btnToggleSiteBlacklist) return;
      if (!this.activeHostname) {
        this.btnToggleSiteBlacklist.style.display = "none";
        return;
      }
      this.btnToggleSiteBlacklist.style.display = "";
      const settings = await StorageService.getSettings();
      const isSiteDisabled = isDomainDisabled(
        this.activeHostname,
        settings.disabledDomains || [],
        settings.domainFilterMode || "blacklist"
      );
      if (isSiteDisabled) {
        this.btnToggleSiteBlacklist.classList.add("is-disabled-site");
        this.btnToggleSiteBlacklist.textContent = t("enable_on_site", this.currentUiLang) || "Enable on this site";
        this.btnToggleSiteBlacklist.title = "Enable Lectura on " + this.activeHostname;
      } else {
        this.btnToggleSiteBlacklist.classList.remove("is-disabled-site");
        this.btnToggleSiteBlacklist.textContent = t("disable_on_site", this.currentUiLang) || "Disable on this site";
        this.btnToggleSiteBlacklist.title = "Disable Lectura on " + this.activeHostname;
      }
    }
    async loadProfiles() {
      if (!this.userProfileSelect) return;
      try {
        const settings = await StorageService.getSettings();
        const currentUrl = (this.serverUrlInput?.value?.trim() || settings.serverUrl || "http://localhost:3000").replace(/\/+$/, "");
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
      const sizePreset = this.subSizeSelect?.value || "md";
      return {
        serverUrl: this.serverUrlInput ? this.serverUrlInput.value.trim().replace(/\/+$/, "") : void 0,
        authToken: this.authTokenInput ? this.authTokenInput.value.trim() : void 0,
        selectedUserId: this.userProfileSelect ? this.userProfileSelect.value : void 0,
        targetLanguage: this.targetLanguageSelect ? this.targetLanguageSelect.value : "es",
        ttsDialect: this.ttsDialectSelect ? this.ttsDialectSelect.value : "en-US",
        subtitleSizePreset: sizePreset,
        subtitleFontSize: parseInt(this.subFontSizeInput?.value || "22", 10) || 22,
        subtitleBgColor: this.currentSubtitleBgColor || "rgba(0, 0, 0, 0.45)",
        enableDualSubtitles: this.dualSubsCheck ? this.dualSubsCheck.checked : false,
        pauseOnWordClick: this.pauseOnWordClickCheck ? this.pauseOnWordClickCheck.checked : false,
        subtitleHighlightMode: this.currentSubtitleMode,
        interfaceLanguage: this.interfaceLanguageSelect?.value || "en",
        popupTheme: this.popupThemeSelect?.value || "glass"
      };
    }
    async saveConfig() {
      const newSettings = this.getFormSettings();
      await StorageService.saveSettings(newSettings);
      chrome.storage.local.set({
        dual_subs: newSettings.enableDualSubtitles ?? false,
        sub_size_preset: newSettings.subtitleSizePreset || "md",
        popup_theme: newSettings.popupTheme || "glass",
        subtitleBgColor: newSettings.subtitleBgColor || "rgba(0, 0, 0, 0.45)"
      });
      this.showAlert("Settings & Profile saved successfully!", "success");
      await this.syncWords();
    }
    async testConnection(showUserFeedback = true) {
      if (this.connectionBadge) {
        this.connectionBadge.textContent = "Checking...";
        this.connectionBadge.className = "ext-status-badge badge-checking";
      }
      if (this.btnTestConnection) {
        this.btnTestConnection.disabled = true;
      }
      try {
        const formSettings = this.getFormSettings();
        const settings = await StorageService.getSettings();
        const testClient = new LecturaApiClient({
          serverUrl: formSettings.serverUrl || settings.serverUrl || "http://localhost:3000",
          authToken: formSettings.authToken || settings.authToken || "",
          selectedUserId: formSettings.selectedUserId || settings.selectedUserId || "",
          syncKey: "",
          targetLanguage: formSettings.targetLanguage || settings.targetLanguage || "es",
          nativeLanguage: "ru",
          enableYoutubeOverlay: true,
          enableInSituSelection: true,
          highlightKnownWords: false,
          autoPauseOnHover: true,
          subtitleFontSize: 22,
          subtitleBgOpacity: 75,
          subtitleHighlightMode: formSettings.subtitleHighlightMode || "underline"
        });
        const health = await testClient.checkHealth();
        const versionStr = health.version ? `v${health.version}` : "Online";
        const userStr = health.userId ? ` \u2022 User: ${health.userId}` : "";
        if (this.connectionBadge) {
          this.connectionBadge.textContent = `Connected (${versionStr})`;
          this.connectionBadge.className = "ext-status-badge badge-connected";
        }
        if (showUserFeedback) {
          this.showAlert(`Connected to Lectura! (${versionStr}${userStr})`, "success");
        }
      } catch (err) {
        if (this.connectionBadge) {
          this.connectionBadge.textContent = "Disconnected";
          this.connectionBadge.className = "ext-status-badge badge-disconnected";
        }
        if (showUserFeedback) {
          this.showAlert(`Connection failed: ${err.message || "Cannot reach server"}`, "error");
        }
      } finally {
        if (this.btnTestConnection) {
          this.btnTestConnection.disabled = false;
        }
      }
    }
    async importCurrentPage() {
      this.btnImportPage.disabled = true;
      this.btnImportPage.innerHTML = `<span class="btn-icon">\u23F3</span> ${t("importing", this.currentUiLang)}`;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error("No active browser tab found");
        }
        chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_ARTICLE" }, async (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            this.showAlert(
              "Could not extract article text from this page. Try refreshing the tab.",
              "error"
            );
            this.resetImportButton();
            return;
          }
          const article = response.article;
          if (!article.content || article.content.trim().length < 20) {
            this.showAlert("Page content is too short or empty to import.", "error");
            this.resetImportButton();
            return;
          }
          try {
            const settings = await StorageService.getSettings();
            const isMedia = /youtube\.com|youtu\.be/i.test(tab.url || "") || /\.(mp3|m4a|wav|ogg|aac|flac|mp4|webm|m3u8)(\?.*)?$/i.test(tab.url || "");
            const saveRes = await this.apiClient.saveLesson({
              title: article.title,
              content: article.content,
              sourceUrl: article.sourceUrl || tab.url,
              coverUrl: article.leadImageUrl,
              author: article.author,
              targetLanguage: article.language !== "auto" ? article.language : settings.targetLanguage,
              lessonType: isMedia ? "video" : "article",
              audioUrl: isMedia ? tab.url || null : null,
              audio_url: isMedia ? tab.url || null : null
            });
            this.showAlert(`Lesson "${article.title}" saved to Lectura!`, "success");
            this.btnImportPage.innerHTML = `<span class="btn-icon">\u2705</span> ${t("imported", this.currentUiLang)}`;
          } catch (err) {
            this.showAlert(`Failed to import lesson: ${err.message || "Server error"}`, "error");
            this.resetImportButton();
          }
        });
      } catch (err) {
        this.showAlert(`Import error: ${err.message}`, "error");
        this.resetImportButton();
      }
    }
    resetImportButton() {
      this.btnImportPage.disabled = false;
      this.btnImportPage.innerHTML = `<span class="btn-icon">\u{1F4E5}</span> ${t("import_video_page", this.currentUiLang)}`;
    }
    async openLecturaApp() {
      const settings = await StorageService.getSettings();
      const url = settings.serverUrl || "http://localhost:3000";
      chrome.tabs.create({ url });
    }
    async syncWords() {
      this.btnSyncWords.disabled = true;
      this.btnSyncWords.innerHTML = `<span class="btn-icon">\u23F3</span> ${t("syncing", this.currentUiLang)}`;
      try {
        const settings = await StorageService.getSettings();
        const res = await this.apiClient.getWords(settings.targetLanguage);
        this.showAlert(`Synced ${res.count || 0} vocabulary words for ${settings.targetLanguage}!`, "success");
      } catch (err) {
        this.showAlert(`Word sync failed: ${err.message}`, "error");
      } finally {
        this.btnSyncWords.disabled = false;
        this.btnSyncWords.innerHTML = `<span class="btn-icon">\u{1F504}</span> ${t("sync_words", this.currentUiLang)}`;
      }
    }
    showAlert(message, type) {
      this.statusAlert.textContent = message;
      this.statusAlert.className = `ext-alert alert-${type}`;
      setTimeout(() => {
        if (this.statusAlert.textContent === message) {
          this.statusAlert.className = "ext-alert hidden";
        }
      }, 4500);
    }
  };
  new PopupController();
})();
