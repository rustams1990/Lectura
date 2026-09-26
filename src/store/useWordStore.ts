import { create } from "zustand";

export interface SelectedWordData {
  text: string;
  cleanText: string;
  contextSentence?: string;
  status?: number | string;
  translation?: string;
  audioUrl?: string;
  timestamp?: string;
}

/**
 * Normalizes English possessive suffix ('s / ’s) at the end of a word/token.
 * E.g. "Oz's" -> "Oz", "Rapz’s" -> "Rapz".
 * If the token consists only of the apostrophe and 's' (e.g. "'s" or "’s"),
 * ensures it does not become an empty string.
 */
export function normalizePossessiveSuffix(token: string): string {
  if (!token) return "";
  const trimmed = token.trim();
  if (trimmed === "'s" || trimmed === "’s") return trimmed;
  const cleanTrail = trimmed.replace(/[.,;:!?”"')»\]]+$/g, "");
  const stripped = cleanTrail.replace(/['’]s$/i, "");
  return stripped.trim() ? stripped.trim() : trimmed;
}

export function sanitizePhraseText(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed === "'s" || trimmed === "’s") return trimmed;

  // 1. Strip trailing English possessive suffix 's / ’s first if present
  let sanitized = normalizePossessiveSuffix(trimmed);
  // 2. Remove non-letter/digit punctuation while preserving spaces, hyphens and both straight & curly apostrophes
  sanitized = sanitized
    .replace(/[^\p{L}\p{N}\s'-’]/gu, "") // Keep letters, numbers, spaces, hyphens, and apostrophes
    .replace(/\s+/g, " ")                // Collapse multiple whitespace
    .trim();
  sanitized = sanitized.replace(/^['’"-]+|['’"-]+$/g, "").trim();
  return sanitized || trimmed;
}

export function extractSelectedWordText(data: SelectedWordData | string | null | undefined): string | null {
  if (!data) return null;
  if (typeof data === "string") return normalizePossessiveSuffix(sanitizePhraseText(data) || data.trim()) || null;
  const raw = data.cleanText || data.text || null;
  return raw ? normalizePossessiveSuffix(sanitizePhraseText(raw) || raw.trim()) || null : null;
}

interface WordStoreState {
  selectedWord: SelectedWordData | null;
  setSelectedWord: (word: SelectedWordData | string | null, contextSentence?: string) => void;
  setSelectedPhrase: (phrase: string, contextSentence?: string) => void;
}

export const useWordStore = create<WordStoreState>((set) => ({
  selectedWord: null,
  setSelectedWord: (word, contextSentence) => {
    if (!word) {
      set({ selectedWord: null });
      return;
    }
    if (typeof word === "string") {
      const clean = normalizePossessiveSuffix(sanitizePhraseText(word) || word.trim());
      set({
        selectedWord: {
          text: clean,
          cleanText: clean,
          contextSentence: contextSentence || "",
        },
      });
      return;
    }
    const clean = normalizePossessiveSuffix(
      sanitizePhraseText(word.cleanText || word.text || "") || (word.cleanText || word.text || "").trim()
    );
    set({
      selectedWord: {
        ...word,
        text: clean,
        cleanText: clean,
        contextSentence: word.contextSentence || contextSentence || "",
      },
    });
  },
  setSelectedPhrase: (phrase, contextSentence) => {
    if (!phrase) {
      set({ selectedWord: null });
      return;
    }
    const clean = normalizePossessiveSuffix(sanitizePhraseText(phrase) || phrase.trim());
    set({
      selectedWord: {
        text: phrase.trim(),
        cleanText: clean,
        contextSentence: contextSentence || "",
      },
    });
  },
}));
