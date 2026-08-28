import { create } from 'zustand';
import { ReaderSettings, DateFormatOption, TimeFormatOption, FirstDayOfWeekOption, WordCardMode, DEFAULT_TOOLBAR_VISIBILITY } from '../types';

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
    if (saved === 'full-inspector' || saved === 'calm-sheet') {
      return saved as WordCardMode;
    }
  }
  return 'full-inspector';
};

const initialMode = getInitialWordCardMode();

const defaultSettings: ReaderSettings = {
  fontSize: 'base',
  lineHeight: 'relaxed',
  fontFamily: 'sans',
  bookFontFamily: 'serif',
  readerTheme: 'default',
  maxWidth: 'wide',
  pageSize: 'auto',
  sentenceSpacing: 'normal',
  segmentSpacing: 'normal',
  ttsEngine: 'google',
  autoPunctuationSplit: true,
  wordHighlight: true,
  idiomHighlightStyle: 'underline',
  aiProvider: 'gemini',
  dailyGoalMinutes: 15,
  dateFormat: 'auto',
  timeFormat: 'auto',
  firstDayOfWeek: 'auto',
  readerViewStyle: 'badges',
  bookReaderViewStyle: 'text',
  wordCardMode: initialMode,
  bookWordCardMode: 'calm-sheet',
  showTimestamps: true,
  cjkWordSpacing: false,
  showDetailedVocabularyStats: false,
  toolbarVisibility: DEFAULT_TOOLBAR_VISIBILITY,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  wordCardMode: initialMode,
  dateFormat: 'auto',
  timeFormat: 'auto',
  firstDayOfWeek: 'auto',

  setWordCardMode: (mode: WordCardMode) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('lectura_word_card_mode', mode);
    }
    set((state) => ({
      wordCardMode: mode,
      settings: { ...state.settings, wordCardMode: mode },
    }));
  },

  setSettings: (newSettings: Partial<ReaderSettings>) => {
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
