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
  wordCardMode: initialMode,
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
