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
  ipa: string;
  grammar: string;
  contextRelation: string;
  status: WordStatus;
  examples: ExampleSentence[];
  createdAt: number;
  tags?: string[];
  imageUrl?: string | null;
  spellingCorrectCount?: number;
  spellingIncorrectCount?: number;
  spellingAccentCount?: number;
  lastSpelledCorrectly?: boolean | null;
  lastSpelledWithAccentError?: boolean | null;
  spellingExclude?: boolean | null;
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
  youtubeDuration?: number | null;
  audioDuration?: number | null;
  lessonType?: string; // e.g. "youtube" | "book" | "article" or custom string
  pinned?: boolean;
  translationText?: string | null;
  detectedPhrases?: Record<string, { translation: string; explanation: string; type?: string }>;
  difficulty?: string | null;
  difficultyExplanation?: string | null;
  createdAt?: number;
}

export interface LessonType {
  id: string;
  name: string;
  icon: string; // e.g. "youtube" | "book" | "article" | "music" | "heart" | "star" | "smile" | "compass" | "type"
}

export interface AppStats {
  listeningSeconds: number;
  wordsKnownCount: number;
  wordsLearningCount: number;
}

export interface ReaderSettings {
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
  idiomHighlightStyle?: "badge" | "underline" | "icon" | "hover";
  aiProvider?: "gemini" | "local";
  localAiUrl?: string;
  localAiModel?: string;
  showDetailedVocabularyStats?: boolean;
  mainStatsMetric?: "comprehension" | "vocabulary";
  showProgressBar?: boolean;
  dailyGoalMinutes?: number; // 0 means disabled
}

export interface Dictionary {
  id: string;
  name: string;
  urlTemplate: string;
  displayType: "popup" | "new_tab" | "window_popup";
}

export interface HistoryEntry {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonType?: string;
  coverUrl?: string | null;
  targetLanguage: string;
  timestamp: string; // ISO string date
  actionType: "read" | "listen" | "complete";
  status?: "in_progress" | "completed";
  durationSeconds?: number;
  notes?: string;
  tags?: string[];
}

