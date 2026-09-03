/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type WordStatus = "new" | "1" | "2" | "3" | "4" | "5" | "known" | "ignored";

export interface ExampleSentence {
  text: string;
  translation: string;
}

export interface VocabItem {
  word: string;
  translation: string;
  definition?: string; // Dictionary definition in the target language (stored at the lemma/parent level)
  ipa: string;
  grammar: string;
  contextRelation: string;
  status: WordStatus;
  examples: ExampleSentence[];
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
  imageUrl?: string | null;
  spellingCorrectCount?: number;
  spellingIncorrectCount?: number;
  spellingAccentCount?: number;
  lastSpelledCorrectly?: boolean | null;
  lastSpelledWithAccentError?: boolean | null;
  spellingExclude?: boolean | null;
  // SRS Fields
  srsNextReview?: number;
  srsInterval?: number;
  srsEaseFactor?: number;
  srsRepetitions?: number;
}

export interface Lesson {
  id: string;
  title: string;
  text: string;
  audioUrl?: string | null;
  audioBase64?: string | null;
  targetLanguage: string;
  translationLanguage: string;
  isBuiltIn?: boolean;
  isArchived?: boolean;
  coverUrl?: string | null;
  youtubeId?: string | null;
  localVideoUrl?: string | null;
  youtubeDuration?: number | null;
  audioDuration?: number | null;
  duration?: number | string | null;
  durationSeconds?: number | null;
  wordCount?: number | null;
  sourceType?: string | null;
  lessonType?: string; // e.g. "youtube" | "book" | "article" or custom string
  pinned?: boolean;
  translationText?: string | null;
  sentenceTranslations?: Record<string, string>;
  detectedPhrases?: Record<string, { translation: string; explanation: string; type?: string }>;
  text_lemmas?: Record<string, string>;
  difficulty?: string | null;
  difficultyExplanation?: string | null;
  createdAt?: number;
  wordTimestamps?: Array<{ w: string; s: number; e: number }> | null;
  channelName?: string | null;
  channelTitle?: string | null;
  channelAvatarUrl?: string | null;
  channelUrl?: string | null;
  author?: string | null;
  playlistId?: string | null;
  images?: Record<string, string>;
  audioProgress?: number;
  audio_progress?: number;
  audio_progress_updated_at?: number;
}

export interface PlaylistItem {
  id: string;
  lessonId?: string;
  videoId?: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  publishedAt?: string;
  transcriptLoaded: boolean;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  sourceType: 'youtube_playlist' | 'podcast_show' | 'custom_collection';
  externalUrl?: string;
  channelTitle?: string;
  itemCount: number;
  language: string; // 'es', 'en' etc.
  items: PlaylistItem[];
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonType {
  id: string;
  name: string;
  icon: string; // e.g. "youtube" | "book" | "article" | "music" | "heart" | "star" | "smile" | "compass" | "type"
}

export interface AppStats {
  listeningSeconds: number;
  todayListeningSeconds: number;
  wordsKnownCount: number;
  wordsLearningCount: number;
}

export interface LanguageListeningStat {
  language: string;
  todaySeconds: number;
  totalSeconds: number;
}

export interface AIProfile {
  id: string;
  name: string;               // e.g. "Gemini Основной", "Gemini Резерв", "Groq Llama-3"
  provider: 'gemini' | 'openai' | 'groq' | 'ollama' | 'custom';
  apiKey: string;
  model?: string;             // e.g. "gemini-2.0-flash", "gpt-4o-mini", "llama-3.3-70b-versatile"
  baseUrl?: string;           // e.g. "http://localhost:11434/api/generate" or custom OpenAI base url
  isEnabled: boolean;
  priority: number;           // 1, 2, 3...
}

export interface IgnoreCategorySettings {
  gaming: boolean;
  tech_brands: boolean;
  music: boolean;
  cinema: boolean;
  brands: boolean;
  names_cities: boolean;
  anglicisms: boolean;
}

export interface ReaderToolbarVisibility {
  showAiHub: boolean;        // default: false
  showTranslation: boolean;  // default: false
  showFocusMode: boolean;    // default: true
  showPlayPairs: boolean;    // default: false
  showUnknownOnly: boolean;  // default: true
  showVideoToggle: boolean;  // default: true
  showDisplayMode: boolean;  // default: true (Badges / Book)
  showWidthToggle: boolean;  // default: true (Standard / Wide / Full)
  showTimestampsToggle: boolean; // default: true
}

export const DEFAULT_TOOLBAR_VISIBILITY: ReaderToolbarVisibility = {
  showAiHub: false,
  showTranslation: false,
  showFocusMode: true,
  showPlayPairs: false,
  showUnknownOnly: true,
  showVideoToggle: true,
  showDisplayMode: true,
  showWidthToggle: true,
  showTimestampsToggle: true,
};

export interface ReaderSettings {
  showTimestamps?: boolean;
  cjkWordSpacing?: boolean;
  fontSize: "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
  lineHeight: "normal" | "relaxed" | "loose" | "extra-loose";
  fontFamily: "sans" | "serif" | "mono";
  readerTheme: "default" | "cream" | "sepia" | "slate";
  maxWidth: "narrow" | "medium" | "wide";
  pageSize?: "auto" | "all" | "p1" | "p2" | "p3" | "p5" | "p10" | "p15" | "p20" | "w50" | "w100" | "w250" | "w500" | "w1000" | "s5" | "s10" | "s20" | "s30" | "c250" | "c500" | "c1000" | "c2000";
  sentenceSpacing?: "normal" | "spaced" | "wide" | "newline" | "double-newline";
  segmentSpacing?: "compact" | "normal" | "relaxed" | "loose";
  ttsEngine?: "browser" | "gemini" | "google" | "kokoro" | "local_tts";
  ttsLocale?: string; // BCP-47 locale for Google TTS, e.g. "en-US", "en-GB", "es-MX"
  ttsLocales?: Record<string, string>; // Maps language code (e.g. "es", "en") to specific BCP-47 locale
  localTtsUrl?: string; // Local TTS server endpoint (e.g. http://localhost:8880/v1/audio/speech)
  localTtsVoice?: string; // Voice name for Kokoro/Local TTS (e.g. af_sarah, am_adam, bf_emma)
  localTtsVoices?: Record<string, string>; // Maps language code (e.g. "es", "fr", "en") to specific local TTS voice
  wordHighlight?: boolean;
  autoPunctuationSplit?: boolean;
  idiomHighlightStyle?: "badge" | "underline" | "icon" | "hover";
  aiProvider?: "gemini" | "local";
  geminiApiKey?: string;
  localAiUrl?: string;
  localAiModel?: string;
  aiProfiles?: AIProfile[];
  showDetailedVocabularyStats?: boolean;
  mainStatsMetric?: "comprehension" | "vocabulary";
  showProgressBar?: boolean;
  showSentenceTranslations?: boolean;
  dailyGoalMinutes?: number; // 0 means disabled, used as global fallback
  dailyGoalsByLanguage?: Record<string, number>; // Maps language code (e.g. "Spanish") to goal minutes
  onlyPatterns?: boolean; // When true, stats & known words count use Parents Only (lemmas) grouping
  vocabularyCountingMode?: "parents_only" | "all_forms";
  dimBookCovers?: boolean;
  cardTitlePosition?: "below_cover" | "on_cover";
  whisperModel?: "tiny" | "base" | "small" | "medium";
  whisperThreads?: number;
  whisperVad?: boolean;
  showWhisperMiniTelemetry?: boolean;
  ignoreCategories?: IgnoreCategorySettings;
  dateFormat?: DateFormatOption;
  timeFormat?: TimeFormatOption;
  firstDayOfWeek?: FirstDayOfWeekOption;
  defaultVideoViewMode?: "focus" | "floating" | "off"; // Default view mode for YouTube & video lessons on mobile/tablet
  readerViewStyle?: "badges" | "text"; // standard lessons display mode (default "badges")
  bookReaderViewStyle?: "badges" | "text"; // book lessons display mode (default "text")
  bookFontFamily?: "sans" | "serif" | "mono"; // book lessons font family (default "serif")
  wordCardMode?: WordCardMode; // "full-inspector" or "calm-sheet" (for standard/video lessons, default "full-inspector")
  bookWordCardMode?: WordCardMode; // specific override for book mode (default "calm-sheet")
  toolbarVisibility?: Partial<ReaderToolbarVisibility>;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: "base",
  lineHeight: "relaxed",
  fontFamily: "sans",
  bookFontFamily: "serif",
  readerTheme: "default",
  maxWidth: "wide",
  pageSize: "auto",
  sentenceSpacing: "normal",
  segmentSpacing: "normal",
  ttsEngine: "google",
  ttsLocale: "en-US",
  autoPunctuationSplit: true,
  wordHighlight: true,
  idiomHighlightStyle: "underline",
  aiProvider: "gemini",
  geminiApiKey: "",
  localAiUrl: "http://localhost:11434/api/generate",
  localAiModel: "phi3.5",
  showDetailedVocabularyStats: false,
  mainStatsMetric: "comprehension",
  showProgressBar: true,
  showSentenceTranslations: false,
  dimBookCovers: false,
  cardTitlePosition: "below_cover",
  onlyPatterns: true,
  vocabularyCountingMode: "parents_only",
  dailyGoalMinutes: 15,
  dateFormat: "auto",
  timeFormat: "auto",
  firstDayOfWeek: "auto",
  defaultVideoViewMode: "focus",
  readerViewStyle: "badges",
  bookReaderViewStyle: "text",
  wordCardMode: "full-inspector",
  bookWordCardMode: "calm-sheet",
  showTimestamps: true,
  cjkWordSpacing: false,
  toolbarVisibility: DEFAULT_TOOLBAR_VISIBILITY,
};

export type WordCardViewType = 'inspector' | 'floating' | 'sheet';
export type WordCardMode = 'full-inspector' | 'calm-sheet' | 'inspector' | 'floating' | 'sheet' | 'bottom-sheet';

export function normalizeWordCardView(mode?: string | null): WordCardViewType {
  if (!mode) return 'floating';
  if (mode === 'inspector' || mode === 'full-inspector') return 'inspector';
  if (mode === 'sheet' || mode === 'bottom-sheet') return 'sheet';
  return 'floating';
}

export type DateFormatOption = 'auto' | 'DD/MM/YYYY' | 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormatOption = 'auto' | '12h' | '24h';
export type FirstDayOfWeekOption = 'auto' | 'monday' | 'sunday';

export interface DictionaryItem {
  id: string;
  name: string;
  urlTemplate: string;
  displayType: "popup" | "new_tab" | "window_popup";
  enabled?: boolean;
  order?: number;
}

export type Dictionary = DictionaryItem;

export interface TabDictionaryPreferences {
  meaning: DictionaryItem[];
  definition: DictionaryItem[];
}

export type UserDictionaryPreferences = Record<string, TabDictionaryPreferences>;

export type ActivitySourceMode = 'library' | 'custom';
export type CustomActivityCategory = 'video' | 'podcast' | 'book' | 'grammar' | 'speaking' | 'other';

export interface HistoryEntry {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonType?: string;
  coverUrl?: string | null;
  targetLanguage: string;
  timestamp: string; // ISO string date
  actionType: "read" | "listen" | "complete" | "study" | "speak";
  status?: "in_progress" | "completed";
  durationSeconds?: number;
  duration?: number;
  notes?: string;
  tags?: string[];
  channelName?: string | null;
  channelAvatarUrl?: string | null;
  channelUrl?: string | null;
  mode?: ActivitySourceMode;
  category?: CustomActivityCategory;
  customTitle?: string;
  // Streaming podcast & media fields
  audioUrl?: string | null;
  podcastTitle?: string | null;
  guid?: string | null;
  youtubeId?: string | null;
  lastPosition?: number;
}

export interface BackupSettings {
  enabled: boolean;
  intervalHours: number;
  maxKeep: number;
  lastBackupTime: string | null;
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  createdAt: number;
  isAuto: boolean;
  type: "auto" | "manual" | "pre-restore" | "custom";
  exportDate?: string;
  lessonsCount?: number;
  wordsCount?: number;
  username?: string;
}

// ── Podcast Module Types ────────────────────────────────────────────────────

export interface PodcastSubscription {
  id: string;
  title: string;
  author: string;
  feedUrl: string;
  artworkUrl: string;
  language: string;
  createdAt: number;
}

export interface PodcastSearchResult {
  collectionId: number;
  title: string;
  artistName: string;
  feedUrl: string;
  artworkUrl600: string;
  primaryGenreName: string;
  trackCount: number;
}

export interface PodcastEpisode {
  guid: string;
  title: string;
  pubDate: string;
  duration: number | null;
  description: string;
  audioUrl: string;
  originalAudioUrl: string;
  transcriptUrl: string;
  transcriptType?: 'vtt' | 'srt' | 'json' | 'text' | null;
  hasTranscript?: boolean;
  artworkUrl: string;
  fileSize: number | null;
}

export interface PodcastFeedMeta {
  title: string;
  description: string;
  language: string;
  artworkUrl: string;
  author: string;
  link: string;
}

export interface PodcastTimelineEpisode extends PodcastEpisode {
  podcastId?: string;
  podcastTitle: string;
  podcastArtwork: string;
  podcastAuthor?: string;
  podcastLanguage?: string;
  feedUrl: string;
}

export function isVideoLesson(lesson?: Lesson | null): boolean {
  if (!lesson) return false;
  const l = lesson as any;
  if (l.lessonType === "book" || l.sourceType === "book" || l.sourceType === "article" || l.lessonType === "article") {
    return false;
  }
  return Boolean(
    l.sourceType === "video" ||
    l.sourceType === "youtube" ||
    l.lessonType === "video" ||
    l.lessonType === "youtube" ||
    l.youtubeId ||
    l.videoUrl ||
    l.localVideoUrl
  );
}
