import { create } from 'zustand';
import { ReaderSettings, DateFormatOption, TimeFormatOption, FirstDayOfWeekOption } from '../types';

interface SettingsState {
  settings: ReaderSettings;
  dateFormat: DateFormatOption;
  timeFormat: TimeFormatOption;
  firstDayOfWeek: FirstDayOfWeekOption;

  // Actions
  setSettings: (newSettings: Partial<ReaderSettings>) => void;
  getSettings: () => ReaderSettings;
}

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
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  dateFormat: 'auto',
  timeFormat: 'auto',
  firstDayOfWeek: 'auto',

  setSettings: (newSettings: Partial<ReaderSettings>) => {
    set((state) => {
      const merged = { ...state.settings, ...newSettings };
      return {
        settings: merged,
        dateFormat: merged.dateFormat || 'auto',
        timeFormat: merged.timeFormat || 'auto',
        firstDayOfWeek: merged.firstDayOfWeek || 'auto',
      };
    });
  },

  getSettings: () => get().settings,
}));
