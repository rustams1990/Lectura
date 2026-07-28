import { HistoryEntry } from "./types";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts seconds to MM:SS format
 * @param seconds - Time in seconds
 * @returns Formatted time string (e.g., "1:30" for 90 seconds)
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Safely parses a Response as JSON after verifying that the Content-Type header
 * is indeed application/json. If the server returned HTML (like a 404 falling back
 * to index.html in Vite), this prevents the "Unexpected token '<'" crash and
 * yields a clear, informative error instead.
 */
export async function safeJsonParse(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type");
  
  if (!contentType || !contentType.includes("application/json")) {
    let text = "";
    try {
      text = await response.text();
    } catch (_) {
      // Ignored
    }
    
    console.error("Non-JSON response received. Status:", response.status, "Content-Type:", contentType, "Sample text:", text.substring(0, 300));
    
    if (text.trim().startsWith("<")) {
      throw new Error(`Сервер вернул HTML-страницу (возможно, 404 или ошибка шлюза) вместо JSON. Статус: ${response.status}`);
    } else {
      throw new Error(`Ожидался JSON, но получен ${contentType || "неизвестный формат"}. Статус: ${response.status}`);
    }
  }

  try {
    return await response.json();
  } catch (err: any) {
    console.error("Failed to parse valid JSON payload:", err);
    throw new Error(`Ошибка декодирования JSON: ${err.message || err}`);
  }
}

const DB_NAME = "TtsCacheDB";
const STORE_NAME = "audioCache";
const DB_VERSION = 1;

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb(): Promise<IDBDatabase> {
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      cachedDbPromise = null;
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
  return cachedDbPromise;
}

export async function getTtsAudioFromCache(key: string): Promise<Blob | null> {
  try {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (err) {
    console.warn("IndexedDB read error:", err);
    return null;
  }
}

export async function saveTtsAudioToCache(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openCacheDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("IndexedDB write error:", err);
  }
}

export const FLAG_EMOJI_TO_CODE: Record<string, string> = {
  // North America / South America / Caribbean
  "🇺🇸": "us", "🇨🇦": "ca", "🇲🇽": "mx", "🇨🇴": "co", "🇦🇷": "ar", "🇨🇱": "cl",
  "🇵🇪": "pe", "🇻🇪": "ve", "🇪🇨": "ec", "🇬🇹": "gt", "🇨🇺": "cu", "🇩🇴": "do",
  "🇭🇳": "hn", "🇵🇾": "py", "🇸🇻": "sv", "🇳🇮": "ni", "🇨🇷": "cr", "🇵🇦": "pa",
  "🇺🇾": "uy", "🇧🇴": "bo", "🇧🇷": "br", "🇯🇲": "jm", "🇭🇹": "ht", "🇸🇷": "sr",
  
  // Europe
  "🇬🇧": "gb", "🇪🇸": "es", "🇩🇪": "de", "🇦🇹": "at", "🇨🇭": "ch",
  "🇫🇷": "fr", "🇷🇺": "ru", "🇮🇹": "it", "🇵🇹": "pt", "🇺🇦": "ua", "🇵🇱": "pl",
  "🇸🇪": "se", "🇳🇱": "nl", "🇧🇪": "be", "🇬🇷": "gr", "🇮🇪": "ie", "🇧🇾": "by",
  "🇸🇲": "sm", "🇻🇦": "va", "🇲🇨": "mc", "🇱🇮": "li", "🇱🇺": "lu", "🇫🇮": "fi",
  "🇨🇾": "cy",

  // Asia / Middle East / Pacific
  "🇯🇵": "jp", "🇨🇳": "cn", "🇹🇼": "tw", "🇰🇷": "kr", "🇰🇵": "kp", "🇹🇷": "tr",
  "🇸🇦": "sa", "🇦🇪": "ae", "🇪🇬": "eg", "🇮🇶": "iq", "🇯🇴": "jo", "🇱🇧": "lb",
  "🇲🇦": "ma", "🇩🇿": "dz", "🇹🇳": "tn", "🇶🇦": "qa", "🇰🇼": "kw", "🇴🇲": "om",
  "🇧🇭": "bh", "🇮🇳": "in", "🇰🇿": "kz", "🇰🇬": "kg", "🇦🇺": "au", "🇳🇿": "nz",
  "🇸🇬": "sg", "🇲🇴": "mo", "🇭🇰": "hk", "🇹🇱": "tl",

  // Africa
  "🇿🇦": "za", "🇸🇳": "sn", "🇨🇮": "ci", "🇨🇲": "cm", "🇲🇬": "mg", "🇨🇩": "cd",
  "🇦🇴": "ao", "🇲🇿": "mz", "🇨🇻": "cv", "🇬🇼": "gw", "🇸🇹": "st", "🇪🇶": "gq"
};

export function getLanguageCode(languageName: string): string {
  const norm = (languageName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "английский") return "en";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "испанский") return "es";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "французский") return "fr";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "немецкий") return "de";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "итальянский") return "it";
  if (norm.startsWith("ru") || norm === "русский") return "ru";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "португальский") return "pt";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "турецкий") return "tr";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "японский") return "ja";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "китайский") return "zh";
  if (norm.startsWith("ar") || norm === "арабский") return "ar";
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "украинский" || norm === "українська" || norm === "український") return "uk";
  if (norm.startsWith("kk") || norm.startsWith("kaz") || norm === "казахский" || norm === "қазақша" || norm === "қазақ тілі") return "kk";
  if (norm.length >= 2 && /^[a-z]+$/.test(norm.substring(0, 2))) {
    return norm.substring(0, 2);
  }
  return "en";
}

export function getBCP47LanguageTag(languageName: string): string {
  const code = getLanguageCode(languageName);
  const tags: Record<string, string> = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
    ru: "ru-RU",
    pt: "pt-BR",
    tr: "tr-TR",
    ja: "ja-JP",
    zh: "zh-CN",
    ar: "ar-SA",
    uk: "uk-UA",
    kk: "kk-KZ"
  };
  return tags[code] || `${code}-${code.toUpperCase()}`;
}

export const TTS_LOCALE_DESCRIPTIONS: Record<string, string> = {
  "en-US": "American English",
  "en-GB": "British English",
  "en-AU": "Australian English",
  "en-CA": "Canadian English",
  "en-IN": "Indian English",
  "es-US": "Mexican Spanish",
  "es-ES": "Spanish (Spain)",
  "es-AR": "Argentine Spanish",
  "pt-BR": "Brazilian Portuguese",
  "pt-PT": "European Portuguese",
  "fr-FR": "French (France)",
  "fr-CA": "French (Canada)",
  "zh-CN": "Mandarin Chinese (China)",
  "zh-TW": "Mandarin Chinese (Taiwan)",
  "de-DE": "German",
  "it-IT": "Italian",
  "ru-RU": "Russian",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
  "tr-TR": "Turkish",
  "ar-SA": "Arabic",
  "uk-UA": "Ukrainian",
  "kk-KZ": "Kazakh (Kazakhstan)",
};

export function getEffectiveTtsLocale(languageName: string, settings?: any): string {
  const baseLangCode = getLanguageCode(languageName); // e.g. "en", "es"
  
  // 1. Check if there's a language-specific locale chosen in readerSettings
  if (settings?.ttsLocales?.[baseLangCode]) {
    return settings.ttsLocales[baseLangCode];
  }
  
  // 2. Otherwise, check if the global ttsLocale matches the language base
  const savedLocale = settings?.ttsLocale || "";
  const savedLangBase = savedLocale.split("-")[0].toLowerCase();
  if (savedLocale && savedLangBase === baseLangCode) {
    return savedLocale;
  }
  
  // 3. Fallback to default BCP-47 locale for this language
  return getBCP47LanguageTag(languageName);
}

export function getLanguageNameWithDialect(languageName: string, settings?: any): string {
  const locale = getEffectiveTtsLocale(languageName, settings);
  const desc = TTS_LOCALE_DESCRIPTIONS[locale];
  return desc || languageName;
}

export function getEffectiveLocalTtsVoice(languageName: string, settings?: any): string {
  const baseLangCode = getLanguageCode(languageName); // e.g. "es", "en", "fr"

  // 1. Check if there is an explicit voice override for this specific language in settings
  if (settings?.localTtsVoices?.[baseLangCode]) {
    return settings.localTtsVoices[baseLangCode];
  }

  // Default native Kokoro / Piper voice mapping per language
  const DEFAULT_LANG_VOICES: Record<string, string> = {
    es: "ef_dora",    // Spanish (Kokoro: ef_dora / em_alex)
    fr: "ff_siwis",   // French
    it: "it_sara",    // Italian
    de: "de_de",      // German
    ja: "jf_alpha",   // Japanese
    zh: "zf_xiaobei", // Chinese
    pt: "pf_dora",    // Portuguese
    ru: "ru_dmitri",  // Russian
    hi: "hf_alpha",   // Hindi
    en: settings?.localTtsVoice || "af_sarah", // English
  };

  if (baseLangCode !== "en" && DEFAULT_LANG_VOICES[baseLangCode]) {
    return DEFAULT_LANG_VOICES[baseLangCode];
  }

  return settings?.localTtsVoice || DEFAULT_LANG_VOICES[baseLangCode] || "af_sarah";
}

/**
 * Safely writes to localStorage wrapping it in a try-catch to prevent crashes if quota is exceeded
 */
export function safeLocalStorageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.error(`Failed to save key "${key}" to localStorage (possibly quota exceeded):`, err);
  }
}

/**
 * Strips heavy fields (like audioBase64) from lessons before saving to browser localStorage fallback
 * to prevent exceeding the browser 5MB storage quota.
 */
export function sanitizeLessonsForLocalStorage(lessons: any[]): string {
  if (!Array.isArray(lessons)) return "[]";
  const sanitized = lessons.map(l => {
    if (!l) return l;
    const { audioBase64, ...rest } = l;
    return rest;
  });
  return JSON.stringify(sanitized);
}

/**
 * Normalizes contractions and possessives to their base forms for status inheritance
 */
export function normalizeContraction(w: string, targetLanguage: string): string {
  if (!w) return "";
  let lower = w.toLowerCase().replace(/’/g, "'").trim();
  const langCode = getLanguageCode(targetLanguage);

  if (langCode === "en") {
    // Strip trailing apostrophe (plural possessive, e.g. users')
    if (lower.endsWith("'")) {
      lower = lower.slice(0, -1);
    }
    // Strip possessive/contraction suffixes (excluding negations like 't)
    if (lower.endsWith("'s")) return lower.slice(0, -2);
    if (lower.endsWith("'ve")) return lower.slice(0, -3);
    if (lower.endsWith("'re")) return lower.slice(0, -3);
    if (lower.endsWith("'m")) return lower.slice(0, -2);
    if (lower.endsWith("'ll")) return lower.slice(0, -3);
    if (lower.endsWith("'d")) return lower.slice(0, -2);
  } else if (langCode === "fr") {
    if (lower.startsWith("l'")) return lower.slice(2);
    if (lower.startsWith("d'")) return lower.slice(2);
    if (lower.startsWith("j'")) return lower.slice(2);
    if (lower.startsWith("qu'")) return lower.slice(3);
  }

  return lower;
}

export function normalizeLanguagePrefixedKey(key: string): string {
  let k = key;
  while (k.match(/^([a-zA-Z]+)_\1_/i)) {
    k = k.replace(/^([a-zA-Z]+)_\1_/i, "$1_");
  }
  return k;
}

export function normalizeVocabRecord(record: Record<string, any> | any[] | undefined): Record<string, any> {
  if (!record || typeof record !== "object") return {};
  const normalized: Record<string, any> = {};

  const entries = Array.isArray(record)
    ? record.map((val, idx) => [String(idx), val] as [string, any])
    : Object.entries(record);

  for (const [key, value] of entries) {
    if (!value || typeof value !== "object") continue;

    const isNumericKey = /^\d+$/.test(key);

    let lang = "";
    if (!isNumericKey) {
      const parts = key.split("_");
      if (parts.length > 1) {
        lang = parts[0].toLowerCase();
      }
    }

    if (!lang) {
      const valLang = value.language_code || value.language || value.targetLanguage;
      if (typeof valLang === "string") {
        lang = valLang.toLowerCase();
      }
    }

    if (!lang) {
      lang = "english";
    }

    const rawWord = typeof value.word === "string" ? value.word : "";
    const cleanWord = rawWord.replace(/^[a-zA-Z]+_/, "");
    if (!cleanWord) continue;

    const cleanKey = `${lang}_${cleanWord.toLowerCase()}`;

    let cleanStatus = "known";
    const rawStatus = typeof value.status === "string"
      ? value.status
      : typeof value.status === "number"
        ? String(value.status)
        : "";

    if (rawStatus === "1" || rawStatus === "2" || rawStatus === "3" || rawStatus === "4" || rawStatus === "5" || rawStatus === "known" || rawStatus === "ignored" || rawStatus === "new") {
      cleanStatus = rawStatus;
    } else if (rawStatus === "learning") {
      cleanStatus = "1";
    } else {
      cleanStatus = "known";
    }

    normalized[cleanKey] = {
      word: cleanWord,
      translation: typeof value.translation === "string" ? value.translation : "",
      grammar: typeof value.grammar === "string" ? value.grammar : "",
      ipa: typeof value.ipa === "string" ? value.ipa : "",
      contextRelation: typeof value.contextRelation === "string" ? value.contextRelation : "",
      status: cleanStatus,
      createdAt: typeof value.createdAt === "number" && !isNaN(value.createdAt) ? value.createdAt : Date.now(),
      tags: Array.isArray(value.tags) ? value.tags.filter((t: any) => typeof t === "string") : [],
      examples: Array.isArray(value.examples) ? value.examples : [],
      imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
      spellingCorrectCount: typeof value.spellingCorrectCount === "number" ? value.spellingCorrectCount : 0,
      spellingIncorrectCount: typeof value.spellingIncorrectCount === "number" ? value.spellingIncorrectCount : 0,
      spellingAccentCount: typeof value.spellingAccentCount === "number" ? value.spellingAccentCount : 0,
      lastSpelledCorrectly: value.lastSpelledCorrectly !== undefined ? (value.lastSpelledCorrectly === true ? true : (value.lastSpelledCorrectly === false ? false : null)) : null,
      lastSpelledWithAccentError: !!value.lastSpelledWithAccentError,
      spellingExclude: !!value.spellingExclude,
    };
  }
  return normalized;
}

export function normalizeWordLinksRecord(record: Record<string, string> | undefined): Record<string, string> {
  if (!record || typeof record !== "object") return {};
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof key !== "string" || typeof val !== "string") continue;
    const cleanKey = normalizeLanguagePrefixedKey(key);
    const cleanVal = normalizeLanguagePrefixedKey(val);
    normalized[cleanKey] = cleanVal;
  }
  return normalized;
}

export function dedupeHistory(entries: HistoryEntry[] | undefined): HistoryEntry[] {
  if (!entries || !Array.isArray(entries) || entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
  const merged: HistoryEntry[] = [];

  for (const item of sorted) {
    if (!item || !item.id || !item.lessonId) continue;
    const itemTime = new Date(item.timestamp).getTime() || 0;

    const existingIdx = merged.findIndex(
      (m) =>
        m.lessonId === item.lessonId &&
        Math.abs((new Date(m.timestamp).getTime() || 0) - itemTime) < 30 * 60 * 1000
    );

    if (existingIdx !== -1) {
      const existing = merged[existingIdx];
      const isListening = existing.actionType === "listen" || item.actionType === "listen";
      const isCompleted =
        existing.status === "completed" ||
        item.status === "completed" ||
        existing.actionType === "complete" ||
        item.actionType === "complete";

      merged[existingIdx] = {
        ...existing,
        actionType: isListening ? "listen" : (existing.actionType === "complete" ? "read" : existing.actionType),
        status: isCompleted ? "completed" : (existing.status || "in_progress"),
        durationSeconds: Math.max(existing.durationSeconds || 0, item.durationSeconds || 0),
        notes: existing.notes || item.notes,
        coverUrl: existing.coverUrl || item.coverUrl,
        lessonTitle: existing.lessonTitle || item.lessonTitle,
      };
    } else {
      merged.push({
        ...item,
        actionType: item.actionType === "complete" ? "read" : item.actionType,
        status: (item.status === "completed" || item.actionType === "complete") ? "completed" : (item.status || "in_progress"),
      });
    }
  }

  return merged;
}




