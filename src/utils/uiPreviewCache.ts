/**
 * Lightweight Read-Only UI Preview Cache (lectura_ui_preview)
 * 
 * PURPOSE:
 * Provides instant visual rendering of language, variants, and summary counters
 * upon app start to eliminate UI flicker while server data is loading.
 * 
 * STRICT SECURITY & ARCHITECTURAL RULES:
 * 1. READ-ONLY FOR INITIAL UI RENDERING: Never send this cache to the server.
 * 2. NOT A DATABASE: Only stores 6 lightweight scalar/counter fields (no word lists, no books, no history).
 * 3. SERVER IS TRUTH: When server returns data, UI updates to server truth and updates this snapshot.
 */

export interface UIPreviewCache {
  selectedLanguage: string;
  selectedVariant?: string;
  activeBooksCount: number;
  archivedBooksCount: number;
  knownWordsCount: number;
  activeWordsCount: number;
}

const UI_PREVIEW_KEY = "lectura_ui_preview";

export function getUIPreviewCache(): UIPreviewCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(UI_PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        selectedLanguage: typeof parsed.selectedLanguage === "string" && parsed.selectedLanguage.trim() ? parsed.selectedLanguage.trim() : "All",
        selectedVariant: typeof parsed.selectedVariant === "string" ? parsed.selectedVariant.trim() : undefined,
        activeBooksCount: typeof parsed.activeBooksCount === "number" && parsed.activeBooksCount >= 0 ? parsed.activeBooksCount : 0,
        archivedBooksCount: typeof parsed.archivedBooksCount === "number" && parsed.archivedBooksCount >= 0 ? parsed.archivedBooksCount : 0,
        knownWordsCount: typeof parsed.knownWordsCount === "number" && parsed.knownWordsCount >= 0 ? parsed.knownWordsCount : 0,
        activeWordsCount: typeof parsed.activeWordsCount === "number" && parsed.activeWordsCount >= 0 ? parsed.activeWordsCount : 0,
      };
    }
  } catch (_) {}
  return null;
}

export function saveUIPreviewCache(data: Partial<UIPreviewCache>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getUIPreviewCache() || {
      selectedLanguage: "All",
      activeBooksCount: 0,
      archivedBooksCount: 0,
      knownWordsCount: 0,
      activeWordsCount: 0,
    };
    const updated: UIPreviewCache = {
      selectedLanguage: (typeof data.selectedLanguage === "string" && data.selectedLanguage.trim()) ? data.selectedLanguage.trim() : current.selectedLanguage,
      selectedVariant: data.selectedVariant !== undefined ? data.selectedVariant : current.selectedVariant,
      activeBooksCount: typeof data.activeBooksCount === "number" && data.activeBooksCount >= 0 ? data.activeBooksCount : current.activeBooksCount,
      archivedBooksCount: typeof data.archivedBooksCount === "number" && data.archivedBooksCount >= 0 ? data.archivedBooksCount : current.archivedBooksCount,
      knownWordsCount: typeof data.knownWordsCount === "number" && data.knownWordsCount >= 0 ? data.knownWordsCount : current.knownWordsCount,
      activeWordsCount: typeof data.activeWordsCount === "number" && data.activeWordsCount >= 0 ? data.activeWordsCount : current.activeWordsCount,
    };
    localStorage.setItem(UI_PREVIEW_KEY, JSON.stringify(updated));
  } catch (_) {}
}
