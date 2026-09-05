import { create } from "zustand";
import { ReaderSettings, WordCardMode } from "../types";
import { resolveEffectiveReaderSettings } from "../utils/readerSettingsUtils";

export const FONT_SIZE_CSS: Record<string, string> = {
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
};

export const LINE_HEIGHT_CSS: Record<string, string> = {
  normal: "1.65",
  relaxed: "1.8",
  loose: "1.95",
  "extra-loose": "2.15",
};

export const BADGE_LINE_HEIGHT_CSS: Record<string, string> = {
  normal: "2.2",
  relaxed: "2.3",
  loose: "2.4",
  "extra-loose": "2.5",
};

export const FONT_FAMILY_CSS: Record<string, string> = {
  sans: 'var(--font-sans, "Inter", ui-sans-serif, system-ui, sans-serif)',
  serif: 'var(--font-serif, "Lora", "Merriweather", "Literata", Georgia, serif)',
  mono: 'var(--font-mono, "JetBrains Mono", ui-monospace, monospace)',
};

export interface AppearanceState {
  isBook: boolean;
  fontSize: ReaderSettings["fontSize"];
  fontFamily: ReaderSettings["fontFamily"];
  lineHeight: ReaderSettings["lineHeight"];
  maxWidth: ReaderSettings["maxWidth"];
  readerTheme: ReaderSettings["readerTheme"];
  readerViewStyle: "badges" | "text";
  wordCardMode: WordCardMode;

  // Actions
  setIsBook: (isBook: boolean) => void;
  setFontSize: (fontSize: ReaderSettings["fontSize"], isBook?: boolean) => void;
  setFontFamily: (fontFamily: ReaderSettings["fontFamily"], isBook?: boolean) => void;
  setLineHeight: (lineHeight: ReaderSettings["lineHeight"], isBook?: boolean) => void;
  setMaxWidth: (maxWidth: ReaderSettings["maxWidth"], isBook?: boolean) => void;
  setReaderTheme: (readerTheme: ReaderSettings["readerTheme"], isBook?: boolean) => void;
  setReaderViewStyle: (readerViewStyle: "badges" | "text", isBook?: boolean) => void;
  setWordCardMode: (wordCardMode: WordCardMode, isBook?: boolean) => void;
  initFromSettings: (settings?: Partial<ReaderSettings>, isBook?: boolean) => void;
}

let syncTimeout: any = null;
let pendingSettingsPatch: Partial<ReaderSettings> = {};
let registeredOnUpdateCallback: ((patch: Partial<ReaderSettings>) => void) | null = null;

export function registerAppearanceSyncCallback(cb: (patch: Partial<ReaderSettings>) => void) {
  registeredOnUpdateCallback = cb;
}

export function debounceAppearanceSync(patch: Partial<ReaderSettings>, delayMs = 350) {
  pendingSettingsPatch = { ...pendingSettingsPatch, ...patch };
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    if (registeredOnUpdateCallback && Object.keys(pendingSettingsPatch).length > 0) {
      registeredOnUpdateCallback(pendingSettingsPatch);
      pendingSettingsPatch = {};
    }
  }, delayMs);
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  isBook: false,
  fontSize: "lg",
  fontFamily: "sans",
  lineHeight: "loose",
  maxWidth: "wide",
  readerTheme: "default",
  readerViewStyle: "badges",
  wordCardMode: "floating",

  setIsBook: (isBook) => set({ isBook }),

  setFontSize: (fontSize, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_font_size" : "lectura_reader_font_size", fontSize || "lg");
    } catch (_) {}
    set({ fontSize });
  },

  setFontFamily: (fontFamily, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_font_family" : "lectura_font_family", fontFamily || "sans");
    } catch (_) {}
    set({ fontFamily });
  },

  setLineHeight: (lineHeight, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_line_height" : "lectura_line_height", lineHeight || "loose");
    } catch (_) {}
    set({ lineHeight });
  },

  setMaxWidth: (maxWidth, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_text_width" : "lectura_reader_text_width", maxWidth || "wide");
    } catch (_) {}
    set({ maxWidth });
  },

  setReaderTheme: (readerTheme, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_reader_theme" : "lectura_reader_theme", readerTheme || "default");
    } catch (_) {}
    set({ readerTheme });
  },

  setReaderViewStyle: (readerViewStyle, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_reader_view_style" : "lectura_reader_view_style", readerViewStyle);
    } catch (_) {}
    set({ readerViewStyle });
  },

  setWordCardMode: (wordCardMode, isBookParam) => {
    const book = isBookParam ?? get().isBook;
    try {
      localStorage.setItem(book ? "lectura_book_word_card_mode" : "lectura_word_card_mode", wordCardMode);
    } catch (_) {}
    set({ wordCardMode });
  },

  initFromSettings: (settings, isBook = false) => {
    if (!settings) return;
    const resolved = resolveEffectiveReaderSettings(settings as ReaderSettings, isBook);
    set({
      isBook,
      fontFamily: resolved.fontFamily || (isBook ? "serif" : "sans"),
      readerViewStyle: (resolved.readerViewStyle as "badges" | "text") || (isBook ? "text" : "badges"),
      fontSize: resolved.fontSize || "lg",
      lineHeight: resolved.lineHeight || "loose",
      maxWidth: resolved.maxWidth || "wide",
      readerTheme: resolved.readerTheme || "default",
      wordCardMode: (resolved.wordCardMode as WordCardMode) || "floating",
    });
  },
}));
