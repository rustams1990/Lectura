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

export function sanitizePhraseText(text: string): string {
  if (!text) return "";
  // Удаляем знаки препинания по краям и внутри, но СОХРАНЯЕМ одиночные пробелы между словами
  return text
    .replace(/[^\p{L}\p{N}\s'-]/gu, "") // Оставляем буквы, цифры, дефисы и ПРОБЕЛЫ
    .replace(/\s+/g, " ")               // Схлопываем множественные пробелы в один
    .trim();
}

export function extractSelectedWordText(data: SelectedWordData | string | null | undefined): string | null {
  if (!data) return null;
  if (typeof data === "string") return sanitizePhraseText(data) || data.trim() || null;
  const raw = data.cleanText || data.text || null;
  return raw ? sanitizePhraseText(raw) || raw.trim() : null;
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
      const clean = sanitizePhraseText(word) || word.trim();
      set({
        selectedWord: {
          text: word.trim(),
          cleanText: clean,
          contextSentence: contextSentence || "",
        },
      });
      return;
    }
    const clean = sanitizePhraseText(word.cleanText || word.text || "") || (word.cleanText || word.text || "").trim();
    set({
      selectedWord: {
        ...word,
        text: word.text ? word.text.trim() : clean,
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
    const clean = sanitizePhraseText(phrase) || phrase.trim();
    set({
      selectedWord: {
        text: phrase.trim(),
        cleanText: clean,
        contextSentence: contextSentence || "",
      },
    });
  },
}));
