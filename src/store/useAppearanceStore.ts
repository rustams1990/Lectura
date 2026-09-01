import { create } from "zustand";
import { ReaderSettings } from "../types";

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
  fontSize: ReaderSettings["fontSize"];
  fontFamily: ReaderSettings["fontFamily"];
  lineHeight: ReaderSettings["lineHeight"];
  maxWidth: ReaderSettings["maxWidth"];
  readerTheme: ReaderSettings["readerTheme"];
  readerViewStyle: "badges" | "text";

  // Actions
  setFontSize: (fontSize: ReaderSettings["fontSize"]) => void;
  setFontFamily: (fontFamily: ReaderSettings["fontFamily"]) => void;
  setLineHeight: (lineHeight: ReaderSettings["lineHeight"]) => void;
  setMaxWidth: (maxWidth: ReaderSettings["maxWidth"]) => void;
  setReaderTheme: (readerTheme: ReaderSettings["readerTheme"]) => void;
  setReaderViewStyle: (readerViewStyle: "badges" | "text") => void;
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

export const useAppearanceStore = create<AppearanceState>((set) => ({
  fontSize: "lg",
  fontFamily: "sans",
  lineHeight: "loose",
  maxWidth: "wide",
  readerTheme: "default",
  readerViewStyle: "badges",

  setFontSize: (fontSize) => {
    try {
      localStorage.setItem("lectura_reader_font_size", fontSize || "lg");
    } catch (_) {}
    set({ fontSize });
  },

  setFontFamily: (fontFamily) => {
    try {
      localStorage.setItem("lectura_font_family", fontFamily || "sans");
    } catch (_) {}
    set({ fontFamily });
  },

  setLineHeight: (lineHeight) => {
    try {
      localStorage.setItem("lectura_line_height", lineHeight || "loose");
    } catch (_) {}
    set({ lineHeight });
  },

  setMaxWidth: (maxWidth) => {
    try {
      localStorage.setItem("lectura_reader_text_width", maxWidth || "wide");
    } catch (_) {}
    set({ maxWidth });
  },

  setReaderTheme: (readerTheme) => {
    try {
      localStorage.setItem("lectura_reader_theme", readerTheme || "default");
    } catch (_) {}
    set({ readerTheme });
  },

  setReaderViewStyle: (readerViewStyle) => {
    try {
      localStorage.setItem("lectura_reader_view_style", readerViewStyle);
    } catch (_) {}
    set({ readerViewStyle });
  },

  initFromSettings: (settings, isBook = false) => {
    if (!settings) return;
    set((state) => {
      const nextFont = isBook
        ? (settings.bookFontFamily || "serif")
        : (settings.fontFamily || "sans");
      const nextStyle = isBook
        ? (settings.bookReaderViewStyle || "text")
        : (settings.readerViewStyle || "badges");
      const nextSize = settings.fontSize || state.fontSize || "lg";
      const nextLine = settings.lineHeight || state.lineHeight || "loose";
      const nextWidth = settings.maxWidth || state.maxWidth || "wide";
      const nextTheme = settings.readerTheme || state.readerTheme || "default";

      return {
        fontFamily: nextFont,
        readerViewStyle: nextStyle,
        fontSize: nextSize,
        lineHeight: nextLine,
        maxWidth: nextWidth,
        readerTheme: nextTheme,
      };
    });
  },
}));
