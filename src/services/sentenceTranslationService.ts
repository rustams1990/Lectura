import { translationsStore } from "../db";

// In-memory runtime cache: maps cacheKey (e.g. `lessonId` or `${sLang}_${tLang}`) -> { [sentenceText]: translation }
const memoryCache: Record<string, Record<string, string>> = {};
const pendingRequests: Record<string, Promise<Record<string, string>>> = {};

function getStoreKey(lessonId: string, sourceLang: string, targetLang: string): string {
  return `${lessonId}_${sourceLang.toLowerCase()}_${targetLang.toLowerCase()}`;
}

/**
 * Load cached translations for a lesson from IndexedDB into memory.
 */
export async function loadLessonTranslationsFromDb(
  lessonId: string,
  sourceLang: string,
  targetLang: string
): Promise<Record<string, string>> {
  const key = getStoreKey(lessonId, sourceLang, targetLang);
  if (memoryCache[key]) {
    return memoryCache[key];
  }

  try {
    const saved = await translationsStore.getItem<Record<string, string>>(key);
    if (saved && typeof saved === "object") {
      memoryCache[key] = saved;
      return saved;
    }
  } catch (err) {
    console.warn("[SentenceTranslation] Failed to load from IndexedDB:", err);
  }

  memoryCache[key] = {};
  return {};
}

/**
 * Get synchronously from memory cache if available.
 */
export function getCachedSentenceTranslation(
  lessonId: string,
  sourceLang: string,
  targetLang: string,
  sentence: string
): string | undefined {
  const key = getStoreKey(lessonId, sourceLang, targetLang);
  const clean = sentence.trim();
  return memoryCache[key]?.[clean];
}

/**
 * Batch request missing translations for a list of sentences on the current page.
 */
export async function fetchMissingSentenceTranslations(
  lessonId: string,
  sentences: string[],
  sourceLang: string,
  targetLang: string
): Promise<Record<string, string>> {
  const key = getStoreKey(lessonId, sourceLang, targetLang);
  if (!memoryCache[key]) {
    await loadLessonTranslationsFromDb(lessonId, sourceLang, targetLang);
  }

  const currentCache = memoryCache[key] || {};
  const missing = sentences
    .map((s) => s.trim())
    .filter((s) => s && !currentCache[s] && !/^\[IMG.*\]$/.test(s) && !/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(s));

  if (missing.length === 0) {
    return currentCache;
  }

  // Deduplicate and filter
  const uniqueMissing = Array.from(new Set(missing));
  const batchKey = `${key}_${uniqueMissing.sort().join("||")}`;

  if (pendingRequests[batchKey]) {
    return pendingRequests[batchKey];
  }

  const reqPromise = (async () => {
    try {
      const resp = await fetch("/api/translate-sentences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentences: uniqueMissing,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const newTranslations: Record<string, string> = data.translations || {};

        const updated = { ...memoryCache[key], ...newTranslations };
        memoryCache[key] = updated;

        // Persist to IndexedDB
        translationsStore.setItem(key, updated).catch((err) => {
          console.warn("[SentenceTranslation] Failed to save to IndexedDB:", err);
        });

        return updated;
      }
    } catch (err) {
      console.warn("[SentenceTranslation] Batch fetch failed:", err);
    } finally {
      delete pendingRequests[batchKey];
    }
    return memoryCache[key] || {};
  })();

  pendingRequests[batchKey] = reqPromise;
  return reqPromise;
}
