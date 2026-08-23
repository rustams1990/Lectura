/**
 * Lectura Extension Type Definitions
 */

export type WordStatus = 'new' | '1' | '2' | '3' | '4' | '5' | 'known' | 'ignored';

export interface ExtensionSettings {
  serverUrl: string;
  authToken: string;
  syncKey: string;
  selectedUserId?: string;
  targetLanguage: string;
  nativeLanguage: string;
  enableYoutubeOverlay: boolean;
  enableDualSubtitles?: boolean;
  subtitleSizePreset?: 'sm' | 'md' | 'lg';
  captureVideoSnapshot?: boolean;
  pauseOnWordClick?: boolean;
  enableInSituSelection: boolean;
  highlightKnownWords: boolean;
  autoPauseOnHover: boolean;
  subtitleFontSize: number;
  subtitleBgOpacity: number;
  subtitleHighlightMode: 'underline' | 'color';
  ttsDialect?: string;
  popupTheme?: 'compact' | 'extended' | 'glass' | 'calm_light';
  interfaceLanguage?: 'en' | 'ru' | 'es';
}

export interface WordMapItem {
  status: WordStatus | string;
  translation: string;
  ipa?: string;
}

export type WordMap = Record<string, WordMapItem>;

export interface SaveWordPayload {
  word: string;
  lemma?: string;
  translation: string;
  definition?: string;
  ipa?: string;
  grammar?: string;
  contextRelation?: string;
  status: WordStatus | string;
  contextSentence?: string;
  sentence?: string;
  contextTranslation?: string;
  targetLanguage?: string;
  language_code?: string;
  language?: string;
  language_id?: string;
  source_url?: string;
  is_phrase?: boolean;
  tags?: string[];
  imageUrl?: string;
}

export interface SaveLessonPayload {
  id?: string;
  title: string;
  content: string;
  text?: string;
  sourceUrl?: string;
  coverUrl?: string;
  targetLanguage: string;
  translationLanguage?: string;
  lessonType?: string;
  author?: string;
}

export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface HealthCheckResponse {
  status: string;
  version?: string;
  uptime?: number;
  timestamp?: number;
}

export interface ExtMessage {
  type:
    | 'CHECK_HEALTH'
    | 'SAVE_LESSON'
    | 'SAVE_WORD'
    | 'GET_WORD_STATUS'
    | 'GET_CACHED_WORDS'
    | 'TRANSLATE_TEXT'
    | 'EXTRACT_ARTICLE'
    | 'OPEN_OPTIONS';
  payload?: any;
}
