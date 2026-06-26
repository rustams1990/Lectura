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

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
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
    ar: "ar-SA"
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
    if (lower.startsWith("c'")) return lower.slice(2);
    if (lower.startsWith("s'")) return lower.slice(2);
    if (lower.startsWith("n'")) return lower.slice(2);
    if (lower.startsWith("m'")) return lower.slice(2);
    if (lower.startsWith("t'")) return lower.slice(2);
    if (lower.startsWith("qu'")) return lower.slice(3);
  }

  return lower;
}



