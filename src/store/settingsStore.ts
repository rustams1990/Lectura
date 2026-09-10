import { create } from 'zustand';
import { ReaderSettings, DateFormatOption, TimeFormatOption, FirstDayOfWeekOption, WordCardMode, DEFAULT_TOOLBAR_VISIBILITY, DEFAULT_READER_SETTINGS } from '../types';

export type { WordCardMode };

interface SettingsState {
  settings: ReaderSettings;
  wordCardMode: WordCardMode;
  dateFormat: DateFormatOption;
  timeFormat: TimeFormatOption;
  firstDayOfWeek: FirstDayOfWeekOption;

  // Actions
  setWordCardMode: (mode: WordCardMode) => void;
  setSettings: (newSettings: Partial<ReaderSettings>) => void;
  getSettings: () => ReaderSettings;
}

const getInitialWordCardMode = (): WordCardMode => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem('lectura_word_card_mode');
    if (saved && (saved === 'inspector' || saved === 'full-inspector' || saved === 'floating' || saved === 'calm-sheet' || saved === 'sheet' || saved === 'bottom-sheet')) {
      return saved as WordCardMode;
    }
  }
  return 'floating';
};

const initialMode = getInitialWordCardMode();

const defaultSettings: ReaderSettings = {
  ...DEFAULT_READER_SETTINGS,
  wordCardMode: initialMode,
};

export let lastSettingsLocalMutationTime = 0;

export function markSettingsLocallyMutated() {
  lastSettingsLocalMutationTime = Date.now();
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  wordCardMode: initialMode,
  dateFormat: 'auto',
  timeFormat: 'auto',
  firstDayOfWeek: 'auto',

  setWordCardMode: (mode: WordCardMode) => {
    markSettingsLocallyMutated();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('lectura_word_card_mode', mode);
    }
    set((state) => ({
      wordCardMode: mode,
      settings: { ...state.settings, wordCardMode: mode },
    }));
  },

  setSettings: (newSettings: Partial<ReaderSettings>) => {
    markSettingsLocallyMutated();
    set((state) => {
      const merged = { ...state.settings, ...newSettings };
      const mode = (newSettings.wordCardMode || merged.wordCardMode || state.wordCardMode) as WordCardMode;
      if (newSettings.wordCardMode && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_word_card_mode', newSettings.wordCardMode);
      }
      if (newSettings.bookWordCardMode && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_word_card_mode', newSettings.bookWordCardMode);
      }
      if (newSettings.readerViewStyle && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_reader_view_style', newSettings.readerViewStyle);
      }
      if (newSettings.bookReaderViewStyle && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_reader_view_style', newSettings.bookReaderViewStyle);
      }
      if (newSettings.fontFamily && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_font_family', newSettings.fontFamily);
      }
      if (newSettings.bookFontFamily && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_font_family', newSettings.bookFontFamily);
      }
      if (newSettings.fontSize && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_reader_font_size', newSettings.fontSize);
      }
      if (newSettings.bookFontSize && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_font_size', newSettings.bookFontSize);
      }
      if (newSettings.lineHeight && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_line_height', newSettings.lineHeight);
      }
      if (newSettings.bookLineHeight && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_line_height', newSettings.bookLineHeight);
      }
      if (newSettings.maxWidth && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_reader_typography_width', newSettings.maxWidth);
      }
      if (newSettings.bookMaxWidth && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_text_width', newSettings.bookMaxWidth);
      }
      if (newSettings.readerTheme && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_reader_theme', newSettings.readerTheme);
      }
      if (newSettings.bookReaderTheme && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_book_reader_theme', newSettings.bookReaderTheme);
      }
      if (newSettings.showTimestamps !== undefined && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('lectura_show_timestamps', String(newSettings.showTimestamps));
      }
      return {
        settings: merged,
        wordCardMode: mode,
        dateFormat: merged.dateFormat || 'auto',
        timeFormat: merged.timeFormat || 'auto',
        firstDayOfWeek: merged.firstDayOfWeek || 'auto',
      };
    });
  },

  getSettings: () => get().settings,
}));
