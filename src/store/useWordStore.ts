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

interface WordStoreState {
  selectedWord: SelectedWordData | null;
  setSelectedWord: (word: SelectedWordData | null) => void;
}

export const useWordStore = create<WordStoreState>((set) => ({
  selectedWord: null,
  setSelectedWord: (word) => set({ selectedWord: word }),
}));
