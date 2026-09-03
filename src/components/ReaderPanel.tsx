/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef, memo } from "react";
import { formatTime, normalizeContraction, safeLocalStorageSetItem } from "../utils";
import {
  Sparkles,
  Loader2,
  Volume2,
  Check,
  BookOpen,
  Eye,
  EyeOff,
  List,
  AlignLeft,
  RotateCcw,
  Clock,
  CheckCircle2,
  Plus,
  X,
  Calendar,
  MessageSquare,
  ChevronDown,
  Pencil,
  Languages,
  Maximize2,
  Gamepad2,
  Tv,
  ChevronLeft,
} from "lucide-react";
import { getDifficultyBadgeStyles } from "./LibraryHome";
import { useReaderHistory } from "../hooks/useReaderHistory";
import { TooltipPortal } from "./TooltipPortal";
import ReaderUnknownWordsList from "./ReaderUnknownWordsList";
import TextSettingsControls from "./TextSettingsControls";
import { Lesson, VocabItem, WordStatus, ReaderSettings, HistoryEntry, DEFAULT_TOOLBAR_VISIBILITY } from "../types";
import { segmentSentenceTokens, cleanWordForLookup, isNumericOrRoman } from "../tokenizer";
import { useReaderPagination, TextSegment, parseTimestampToSeconds, splitIntoSentences } from "../hooks/useReaderPagination";
import { useTranslation } from "react-i18next";
import { ignoreListManager } from "../services/ignoreListService";
import { compareWords } from "../utils/stringUtils";
import { loadLessonTranslationsFromDb, fetchMissingSentenceTranslations } from "../services/sentenceTranslationService";
import { BookTocDrawer } from "./BookTocDrawer";
import { useWordStore, SelectedWordData, extractSelectedWordText, sanitizePhraseText } from "../store/useWordStore";
import { useUIStore } from "../store/uiStore";
import { useSettingsStore } from "../store/settingsStore";
import WordToken from "./WordToken";
import { useAppearanceStore, FONT_SIZE_CSS, LINE_HEIGHT_CSS, BADGE_LINE_HEIGHT_CSS, FONT_FAMILY_CSS } from "../store/useAppearanceStore";

const getLangCode = (lang?: string): string => {
  if (!lang) return "EN";
  const l = lang.trim().toLowerCase();
  if (l.startsWith("en") || l === "english" || l === "английский") return "EN";
  if (l.startsWith("ru") || l === "russian" || l === "русский") return "RU";
  if (l.startsWith("es") || l === "spanish" || l === "испанский") return "ES";
  if (l.startsWith("fr") || l === "french" || l === "французский") return "FR";
  if (l.startsWith("de") || l === "german" || l === "немецкий") return "DE";
  if (l.startsWith("it") || l === "italian" || l === "итальянский") return "IT";
  if (l.startsWith("pt") || l === "portuguese" || l === "португальский") return "PT";
  if (l.startsWith("zh") || l === "chinese" || l === "китайский") return "ZH";
  if (l.startsWith("ja") || l === "japanese" || l === "японский") return "JA";
  if (l.startsWith("ko") || l === "korean" || l === "корейский") return "KO";
  if (l.startsWith("ar") || l === "arabic" || l === "арабский") return "AR";
  if (l.startsWith("tr") || l === "turkish" || l === "турецкий") return "TR";
  return lang.slice(0, 2).toUpperCase();
};

interface ReaderPanelProps {
  key?: string;
  lesson: Lesson;
  lessonImagesMap?: Record<string, string>;
  vocab: Record<string, VocabItem>;
  activeWord: string | null;
  wordLinks: Record<string, string>;
  onWordClick: (word: string, context: string, targetEl?: HTMLElement | null) => void;
  onMarkKnown: (word: string) => void;
  settings?: ReaderSettings;
  onUpdateSettings?: (settings: ReaderSettings) => void;
  onEditClick?: () => void;
  currentYoutubeTime?: number | null;
  onTimestampClick?: (seconds: number) => void;
  showOnlyUnknown?: boolean;
  history?: HistoryEntry[];
  onUpdateHistory?: (updatedHistory: HistoryEntry[]) => void;
  /** When true, hides the title/badges/status header (used in Focus Mode) */
  hideMeta?: boolean;
  onToggleTranslations?: () => void;
  onClearSelection?: () => void;
}

const fontSizeMap = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

const lineHeightMap = {
  normal: "leading-[1.65]",
  relaxed: "leading-[1.8]",
  loose: "leading-[1.95]",
  "extra-loose": "leading-[2.15]",
};

const badgeLineHeightMap = {
  normal: "leading-[2.2]",
  relaxed: "leading-[2.3]",
  loose: "leading-[2.4]",
  "extra-loose": "leading-[2.5]",
};

const fontFamilyMap = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

interface ReaderThemeStyles {
  container: string;
  barBg: string;
  pillBg: string;
  subBadgeBg: string;
  divider: string;
  subText: string;
  selectBg: string;
}

const themeMap: Record<string, ReaderThemeStyles> = {
  default: {
    container: "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200 border-stone-200/70 dark:border-zinc-800/80 shadow-sm",
    barBg: "bg-transparent",
    pillBg: "bg-transparent text-zinc-900 dark:text-zinc-200",
    subBadgeBg: "bg-stone-100/70 dark:bg-zinc-800/60 text-stone-700 dark:text-zinc-300",
    selectBg: "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 border-stone-200 dark:border-zinc-700",
    divider: "border-stone-200/80 dark:border-zinc-800/80",
    subText: "text-stone-600 dark:text-zinc-300",
  },
  cream: {
    container: "bg-[#fcf8f2] dark:bg-zinc-900 text-[#3b2b1a] dark:text-zinc-200 border-[#f3e9d8] dark:border-zinc-800/80",
    barBg: "bg-transparent",
    pillBg: "bg-transparent text-[#3b2b1a] dark:text-zinc-200",
    subBadgeBg: "bg-[#f4e8d3] dark:bg-zinc-800/60 text-[#4a3622] dark:text-zinc-300",
    selectBg: "bg-[#fcf8f2] dark:bg-zinc-800 text-teal-700 dark:text-teal-400 border-[#e8d7bb] dark:border-zinc-700",
    divider: "border-[#eddcb9] dark:border-zinc-800/80",
    subText: "text-[#4a3622] dark:text-zinc-400",
  },
  sepia: {
    container: "bg-[#f7f4eb] dark:bg-zinc-900 text-[#2c2a29] dark:text-zinc-200 border-[#e5dec9] dark:border-zinc-800/80",
    barBg: "bg-transparent",
    pillBg: "bg-transparent text-[#2c2a29] dark:text-zinc-200",
    subBadgeBg: "bg-[#efe9dc] dark:bg-zinc-800/60 text-[#4d4843] dark:text-zinc-300",
    selectBg: "bg-[#f7f4eb] dark:bg-zinc-800 text-teal-800 dark:text-teal-400 border-[#e5dec9] dark:border-zinc-700",
    divider: "border-[#e5dec9] dark:border-zinc-800/80",
    subText: "text-[#5a544e] dark:text-zinc-400",
  },
  slate: {
    container: "bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-800",
    barBg: "bg-transparent",
    pillBg: "bg-transparent text-slate-800 dark:text-slate-100",
    subBadgeBg: "bg-slate-200/70 dark:bg-slate-800/70 text-slate-700 dark:bg-slate-300",
    selectBg: "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 border-slate-300 dark:border-slate-700",
    divider: "border-slate-200 dark:border-slate-800",
    subText: "text-slate-700 dark:text-slate-300",
  },
};

const widthMap = {
  narrow: "max-w-xl mx-auto",
  medium: "max-w-3xl mx-auto",
  wide: "max-w-5xl mx-auto",
};

const getWordStatusClass = (
  status: string,
  _theme: string = "default",
  _hasWordLink: boolean = false,
  isPhrase: boolean = false,
  hasIdiomUnderline: boolean = false,
  readerViewStyle: "badges" | "text" = "badges"
): string => {
  if (readerViewStyle === "text") {
    // ── Book / Clean Text Mode (No background pill, color on font) ──────
    if (status === "ignored" || status === "known") {
      return "text-inherit hover:underline underline-offset-2 cursor-pointer font-normal transition-colors";
    }
    if (status === "1") {
      return "text-rose-600 dark:text-rose-400 hover:underline underline-offset-2 font-semibold cursor-pointer transition-colors";
    }
    if (status === "2") {
      return "text-amber-600 dark:text-amber-400 hover:underline underline-offset-2 font-semibold cursor-pointer transition-colors";
    }
    if (status === "3" || (status as any) === "learning") {
      return "text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-2 font-medium cursor-pointer transition-colors";
    }
    if (status === "4") {
      return "text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 font-semibold cursor-pointer transition-colors";
    }
    if (status === "5") {
      return "text-purple-600 dark:text-purple-400 hover:underline underline-offset-2 font-semibold cursor-pointer transition-colors";
    }
    // Status 0 / default (New / Unknown word)
    return "text-sky-600 dark:text-sky-400 hover:underline underline-offset-2 font-medium cursor-pointer transition-colors";
  }

  // ── Badges / Tiles Mode (Compact, neat LingQ style) ────
  const baseRounding = "rounded-[3px] py-0.5 leading-tight";

  if (status === "ignored" || status === "known") {
    return `hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50 text-inherit cursor-pointer ${baseRounding} transition-colors font-normal`;
  }

  if (status === "1") {
    const borderClass = hasIdiomUnderline ? "" : "border-b border-[#f3a4b0] dark:border-rose-500/80";
    return `bg-[#f3a4b0]/45 dark:bg-rose-950/60 hover:bg-[#f3a4b0]/70 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "2") {
    const borderClass = hasIdiomUnderline ? "" : "border-b border-[#f0d46d] dark:border-amber-400/80";
    return `bg-[#f0d46d]/45 dark:bg-amber-950/60 hover:bg-[#f0d46d]/70 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "3" || (status as any) === "learning") {
    const borderClass = hasIdiomUnderline ? "" : "border-b border-[#a6d896] dark:border-emerald-400/80";
    return `bg-[#a6d896]/45 dark:bg-emerald-950/60 hover:bg-[#a6d896]/70 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 ${baseRounding} font-medium ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "4") {
    const borderClass = hasIdiomUnderline ? "" : "border-b border-[#204bf4] dark:border-blue-400/80";
    return `bg-[#99bce8] dark:bg-blue-950/60 hover:bg-[#86b0e3] dark:hover:bg-blue-900/60 text-blue-950 dark:text-blue-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "5") {
    const borderClass = hasIdiomUnderline ? "" : "border-b border-[#a882dd] dark:border-purple-400/80";
    return `bg-[#c5aee2] dark:bg-purple-950/60 hover:bg-[#b096d2] dark:hover:bg-purple-900/60 text-purple-950 dark:text-purple-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  // Status 0 / default (New / Unknown word)
  return `bg-[#cbeeff] dark:bg-sky-950/70 hover:bg-[#addbff] dark:hover:bg-sky-900/60 text-sky-900 dark:text-sky-300 ${baseRounding} cursor-pointer transition-colors`;
};

const getPhraseTypeLabel = (type: string | undefined, t: any) => {
  if (!type) return t('reader.phrase_idiom', 'Idiom');
  switch (type.toLowerCase()) {
    case "phrasal_verb": return t('reader.phrase_verb', 'Phrasal Verb');
    case "idiom": return t('reader.phrase_idiom', 'Idiom');
    case "saying": return t('reader.phrase_saying', 'Saying / Proverb');
    case "set_expression": return t('reader.phrase_set', 'Set Expression');
    default: return t('reader.phrase_idiom', 'Idiom');
  }
};

const normalizeTranslationSemicolons = (text: string): string => {
  if (!text) return "";
  // 1. Replace semicolons that separate different part of speech definitions with double newlines (\n\n)
  let result = text.replace(/;\s*(\((?:noun|verb|adj|adjective|adv|adverb|pronoun|prep|conjunction|interjection|participle|article)[^)]*\))/gi, "\n\n$1");
  // 2. Replace remaining internal semicolons within a single meaning block with a space
  result = result.replace(/;\s*/g, " ");
  return result.trim();
};

function ReaderPanel({
  lesson,
  lessonImagesMap,
  vocab,
  activeWord,
  wordLinks,
  onWordClick,
  onMarkKnown,
  settings,
  onUpdateSettings,
  onEditClick,
  currentYoutubeTime,
  onTimestampClick,
  showOnlyUnknown = false,
  history,
  onUpdateHistory,
  hideMeta = false,
  onToggleTranslations,
  onClearSelection,
}: ReaderPanelProps) {
  const { t } = useTranslation();

  const handleBackgroundClick = (e: React.MouseEvent) => {
    // If text was selected by the user, NEVER clear the selection!
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    const target = e.target as HTMLElement;
    if (
      target.closest('[data-token]') || 
      target.closest('.reader-word-token') || 
      target.closest('.unknown-word-card') || 
      target.closest('[role="button"]') ||
      target.closest('.word-explainer') || 
      target.closest('.modal-content') ||
      target.closest('button') || 
      target.closest('a')
    ) {
      return;
    }
    useWordStore.getState().setSelectedWord(null);
    onClearSelection?.();
  };

  const {
    isFocusMode,
    setIsFocusMode,
    setActiveTab,
    setShowMatchPairsModal,
    showOnlyUnknown: storeShowOnlyUnknown,
    setShowOnlyUnknown: storeSetShowOnlyUnknown,
    showYoutubePlayer,
    setShowYoutubePlayer,
    bookDisplayMode,
    setBookDisplayMode,
    bookReaderView,
    setBookReaderView,
  } = useUIStore();
  const isBookLesson = lesson.lessonType === "book";
  const isBookFocus = isBookLesson && (bookReaderView === "focus" || bookDisplayMode === "book");
  const storeFontSize = useSettingsStore((s) => s.fontSize);
  const storeCardMode = useSettingsStore((s) => s.wordCardMode);
  
  const wordCardMode = isBookLesson
    ? (settings?.bookWordCardMode || settings?.wordCardMode || storeCardMode || "floating")
    : (settings?.wordCardMode || storeCardMode || "floating");
  const isCalmSheet = wordCardMode === "calm-sheet" || wordCardMode === "floating";
  const storeSelectedWord = useWordStore((state) => state.selectedWord);
  const currentActiveWord = extractSelectedWordText(storeSelectedWord) || activeWord;
  const isFloatingModalOpen = isCalmSheet && Boolean(currentActiveWord);

  const [unknownViewMode, setUnknownViewMode] = useState<"text" | "list">("text");
  const [unknownSearchQuery, setUnknownSearchQuery] = useState("");
  const [unknownSortMode, setUnknownSortMode] = useState<"alpha" | "appearance">("alpha");

  // Status & Reading Time Management States
  const {
    isCustomTimeModalOpen,
    setIsCustomTimeModalOpen,
    customMinutesInput,
    setCustomMinutesInput,
    customNotesInput,
    setCustomNotesInput,
    toastMessage,
    currentStatus,
    totalLoggedSeconds,
    formatLoggedDuration,
    handleToggleStatus,
    handleAddMinutes,
    handleSaveCustomTime,
  } = useReaderHistory({ lesson, history, onUpdateHistory });

  const textForSearch = useMemo(
    () => lesson.text
      .replace(/\[(?:\[LECTURA_)?IMG(?:_REF)?:[^\]]+\]/gi, " ")
      .replace(/^##\s+(.+?)\s+##\s*$/gm, "$1")
      .replace(/^#\s+(.+?)\s+#\s*$/gm, "$1")
      .replace(/^\[(?:CAPTION:?|caption\]?)\s*[^\]\n]*(?:\])?/gim, ""),
    [lesson.text]
  );

  // Tooltip/popup states for hover over patterns/timestamps
  const [hoveredWordId, setHoveredWordId] = useState<string | null>(null);

  // Popup states for word hover translations & tags (Requirement 3)
  const [hoveredWordObj, setHoveredWordObj] = useState<{
    word: string;
    parentWord?: string;
    translation: string;
    definition?: string;
    tags?: string[];
    grammar?: string;
    imageUrl?: string | null;
    x: number;
    y: number;
    position?: "above" | "below";
    phraseText?: string;
    phraseTranslation?: string;
    phraseDefinition?: string;
    phraseStatus?: WordStatus;
    phraseTags?: string[];
    detectedPhraseText?: string;
    detectedPhraseTranslation?: string;
    detectedPhraseExplanation?: string;
    detectedPhraseType?: string;
  } | null>(null);

  // Check if text is mostly East Asian (at least 30% CJK characters)
  const isCjk = useMemo(() => {
    if (!textForSearch) return false;
    const cjkChars = (textForSearch.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const totalChars = textForSearch.replace(/\s/g, '').length;
    return totalChars > 0 && (cjkChars / totalChars) > 0.3;
  }, [textForSearch]);

  const appearance = useAppearanceStore();

  useEffect(() => {
    useAppearanceStore.getState().initFromSettings(settings, lesson.lessonType === "book");
  }, [settings, lesson.lessonType]);

  const activeSettings = useMemo(() => {
    const isBook = lesson.lessonType === "book";
    return {
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      fontFamily: appearance.fontFamily,
      readerTheme: appearance.readerTheme,
      maxWidth: appearance.maxWidth,
      pageSize: settings?.pageSize || "auto",
      sentenceSpacing: settings?.sentenceSpacing || "normal",
      segmentSpacing: settings?.segmentSpacing || "normal",
      ttsEngine: settings?.ttsEngine || "google",
      ttsLocale: settings?.ttsLocale || "",
      ttsLocales: settings?.ttsLocales || {},
      localTtsUrl: settings?.localTtsUrl || "http://localhost:8880/v1/audio/speech",
      localTtsVoice: settings?.localTtsVoice || "af_sarah",
      wordHighlight: settings?.wordHighlight !== false,
      autoPunctuationSplit: settings?.autoPunctuationSplit !== false,
      idiomHighlightStyle: settings?.idiomHighlightStyle || "badge",
      showProgressBar: settings?.showProgressBar !== false,
      showSentenceTranslations: !!settings?.showSentenceTranslations,
      showTimestamps: settings?.showTimestamps === undefined ? true : (settings?.showTimestamps === "false" ? false : Boolean(settings?.showTimestamps)),
      cjkWordSpacing: !!settings?.cjkWordSpacing,
      readerViewStyle: appearance.readerViewStyle,
      wordCardMode: isBook ? (settings?.bookWordCardMode || "calm-sheet") : (settings?.wordCardMode || "full-inspector"),
      bookWordCardMode: settings?.bookWordCardMode || "calm-sheet",
      bookReaderViewStyle: appearance.readerViewStyle,
      bookFontFamily: appearance.fontFamily,
      toolbarVisibility: settings?.toolbarVisibility,
    };
  }, [settings, lesson.lessonType, appearance]);

  const {
    segments,
    pages,
    currentPageIdx,
    setCurrentPageIdx,
    clampedPageIdx,
    activeSegmentsForPage,
    activeSegmentIndex,
    handleTouchStart,
    handleTouchEnd,
    navigateToPage,
    hasTimestamps,
    tocEntries
  } = useReaderPagination({
    lesson,
    isCjk,
    pageSize: activeSettings.pageSize,
    autoPunctuationSplit: activeSettings.autoPunctuationSplit,
    currentYoutubeTime,
    activeWord,
    onWordClick
  });

  const isTextMode = activeSettings.readerViewStyle === "text";
  const [isTocOpen, setIsTocOpen] = useState(false);

  useEffect(() => {
    const handleToggleToc = () => setIsTocOpen((prev) => !prev);
    window.addEventListener("toggle-book-toc", handleToggleToc);
    return () => window.removeEventListener("toggle-book-toc", handleToggleToc);
  }, []);

  // State for parallel sentence translations on the current page
  const [sentenceTranslationsMap, setSentenceTranslationsMap] = useState<Record<string, string>>({});
  const [isTranslatingSentences, setIsTranslatingSentences] = useState(false);

  // Lazy load/batch-fetch sentence translations when showSentenceTranslations is enabled
  useEffect(() => {
    if (!activeSettings.showSentenceTranslations) return;

    let isSubscribed = true;
    const targetLang = lesson.translationLanguage || "Russian";
    const srcLang = lesson.targetLanguage;

    // 1. Load existing from DB cache immediately
    loadLessonTranslationsFromDb(lesson.id, srcLang, targetLang).then((cached) => {
      if (isSubscribed && cached) {
        setSentenceTranslationsMap((prev) => ({ ...prev, ...cached }));
      }
    });

    // 2. Extract unique sentences on current page
    const pageSentences: string[] = [];
    activeSegmentsForPage.forEach((seg) => {
      const sentenceStrings = (activeSettings.sentenceSpacing && activeSettings.sentenceSpacing !== "normal")
        ? splitIntoSentences(seg.text, isCjk)
        : [seg.text];

      sentenceStrings.forEach((s) => {
        const clean = s.trim();
        if (clean && !/^\[IMG.*\]$/.test(clean) && !/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(clean)) {
          pageSentences.push(clean);
        }
      });
    });

    if (pageSentences.length > 0) {
      setIsTranslatingSentences(true);
      fetchMissingSentenceTranslations(lesson.id, pageSentences, srcLang, targetLang)
        .then((updated) => {
          if (isSubscribed && updated) {
            setSentenceTranslationsMap((prev) => ({ ...prev, ...updated }));
          }
        })
        .finally(() => {
          if (isSubscribed) setIsTranslatingSentences(false);
        });
    }

    return () => {
      isSubscribed = false;
    };
  }, [
    activeSettings.showSentenceTranslations,
    activeSettings.sentenceSpacing,
    activeSegmentsForPage,
    lesson.id,
    lesson.targetLanguage,
    lesson.translationLanguage,
    isCjk,
  ]);

  // Compute active saved multi-word phrases/idioms in active target language inside this text
  const activePhrasesInLesson = useMemo(() => {
    const lang = lesson.targetLanguage.toLowerCase();
    const lessonTextLower = textForSearch.toLowerCase();
    
    return Object.keys(vocab)
      .filter((key) => {
        const parts = key.split("_");
        if (parts.length <= 1) return false;
        
        // Ensure language matched
        if (parts[0] !== lang) return false;
        
        const originalWord = key.substring(parts[0].length + 1);
        
        // Multi-word phrase containing a space, and present in lesson text
        return originalWord.includes(" ") && lessonTextLower.includes(originalWord);
      })
      .map((key) => vocab[key]);
  }, [vocab, textForSearch, lesson.targetLanguage]);

  // Check if active page is a dedication, cover, or title page
  const isDedicationOrTitlePage = useMemo(() => {
    if (lesson.lessonType !== "book" || activeSegmentsForPage.length === 0) return false;
    
    let totalWords = 0;
    let hasImage = false;
    for (const seg of activeSegmentsForPage) {
      if (/^\[IMG(?:_REF)?:/.test(seg.text.trim())) {
        hasImage = true;
      } else {
        totalWords += seg.text.split(/\s+/).filter(Boolean).length;
      }
    }

    const fullPageText = activeSegmentsForPage.map(s => s.text).join(" ").trim();
    
    // Check dedication keywords
    const isDedicationKeyword = /^(?:for\b|to\b|i\s+started\s+this\s+for|dedicated\s+to|dedication|in\s+memory\s+of|посвящается|для\b|посвящение)/i.test(fullPageText);
    
    if (hasImage && totalWords <= 30) return true;
    if (totalWords > 0 && totalWords <= 70 && (isDedicationKeyword || activeSegmentsForPage.length <= 3)) return true;
    return false;
  }, [activeSegmentsForPage, lesson.lessonType]);

  // Precompute tokens and phrase matches for the active segments on this page
  const { allPageTokens, pagePhraseMatches, pageDetectedMatches, sentenceTokenRanges } = useMemo(() => {
    // 1. Tokenize everything on the page first, keeping track of segment index (pIdx) and sentence index (sIdx)
    const allPageTokens: {
      raw: string;
      clean: string;
      isWord: boolean;
      segIdx: number;
      sIdx: number;
      localIdx: number;
      globalIdx: number;
    }[] = [];

    const sentenceTokenRanges: {
      segIdx: number;
      sIdx: number;
      startIdx: number;
      endIdx: number;
    }[] = [];

    let globalIdx = 0;

    activeSegmentsForPage.forEach((seg, segIdx) => {
      const trimmed = seg.text.trim();
      // Never tokenize image placeholders or captions as page words!
      if (/^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(trimmed) || /^\[(?:CAPTION:?|caption)/i.test(trimmed)) {
        return;
      }


      const sentenceStrings = (activeSettings.sentenceSpacing && activeSettings.sentenceSpacing !== "normal")
        ? splitIntoSentences(seg.text, isCjk)
        : [seg.text];

      sentenceStrings.forEach((sentText, sIdx) => {
        const tokens = segmentSentenceTokens(sentText, lesson.targetLanguage);

        const startIdx = globalIdx;
        tokens.forEach((t, localIdx) => {
          allPageTokens.push({
            ...t,
            segIdx: segIdx,
            sIdx: sIdx,
            localIdx: localIdx,
            globalIdx: globalIdx,
          });
          globalIdx++;
        });
        const endIdx = globalIdx - 1;
        sentenceTokenRanges.push({
          segIdx: segIdx,
          sIdx: sIdx,
          startIdx,
          endIdx,
        });
      });
    });

    // 2. Perform phrase matching on the flat list of word tokens
    const wordTokens = allPageTokens.filter(t => t.isWord);
    const pagePhraseMatches: { phrase: string; vocabItem: VocabItem; tokenIndices: number[] }[] = [];
    const pageDetectedMatches: { phrase: string; translation: string; explanation: string; type?: string; tokenIndices: number[] }[] = [];
    const lang = lesson.targetLanguage.toLowerCase();
    const detectedPhrases = lesson.detectedPhrases || {};

    let wIdx = 0;
    while (wIdx < wordTokens.length) {
      let matched = false;
      
      // Try matching user-saved phrase first (takes priority)
      for (let len = Math.min(10, wordTokens.length - wIdx); len >= 2; len--) {
        const candidateWords = wordTokens.slice(wIdx, wIdx + len).map((t) => t.clean);
        const candidatePhrase = candidateWords.join(" ");
        const langKey = `${lang}_${candidatePhrase}`;
        const lq = vocab[langKey] || vocab[candidatePhrase];
        if (lq) {
          const matchedTokenIndices = wordTokens.slice(wIdx, wIdx + len).map((t) => t.globalIdx);
          pagePhraseMatches.push({
            phrase: candidatePhrase,
            vocabItem: lq,
            tokenIndices: matchedTokenIndices,
          });
          wIdx += len;
          matched = true;
          break;
        }
      }
      
      if (matched) continue;
      
      // Try matching auto-detected phrase
      for (let len = Math.min(10, wordTokens.length - wIdx); len >= 2; len--) {
        const candidateWords = wordTokens.slice(wIdx, wIdx + len).map((t) => t.clean);
        const candidatePhrase = candidateWords.join(" ");
        const cleanCandidate = candidatePhrase.toLowerCase();
        const details = detectedPhrases[cleanCandidate] || detectedPhrases[candidatePhrase];
        if (details) {
          const matchedTokenIndices = wordTokens.slice(wIdx, wIdx + len).map((t) => t.globalIdx);
          pageDetectedMatches.push({
            phrase: candidatePhrase,
            translation: details.translation,
            explanation: details.explanation,
            type: details.type,
            tokenIndices: matchedTokenIndices,
          });
          wIdx += len;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        wIdx++;
      }
    }

    return { allPageTokens, pagePhraseMatches, pageDetectedMatches, sentenceTokenRanges };
  }, [activeSegmentsForPage, vocab, lesson, isCjk, activeSettings.sentenceSpacing]);

  // Handle text drag selection (words, phrases & idioms)
  const handleTextSelection = (e?: React.MouseEvent | Event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    let rawSelected = selection.toString().replace(/\s+/g, " ").trim();
    if (!rawSelected || rawSelected.length > 1000) return;

    // If selection covers multiple [data-token] spans, reconstruct with explicit spaces
    if (selection.rangeCount > 0) {
      try {
        const range = selection.getRangeAt(0);
        const container = document.createElement("div");
        container.appendChild(range.cloneContents());
        const tokens = container.querySelectorAll("[data-token]");
        if (tokens.length > 1) {
          const tokenWords = Array.from(tokens).map((t) => t.textContent?.trim()).filter(Boolean);
          if (tokenWords.length > 1) {
            rawSelected = tokenWords.join(" ");
          }
        }
      } catch (err) {
        // Fallback to rawSelected from selection.toString()
      }
    }

    // Strip leading and trailing punctuation/quotes/brackets while preserving spaces
    const cleanPhrase = sanitizePhraseText(rawSelected) || rawSelected;
    if (!cleanPhrase) return;

    // Attempt to locate containing sentence paragraph for rich context relationship
    let associatedSentence = "";
    const anchorNode = selection.anchorNode;
    if (anchorNode) {
      let currentEl: HTMLElement | null = anchorNode.parentElement;
      while (
        currentEl && 
        !currentEl.classList.contains("paragraph-block") && 
        currentEl.tagName !== "P" &&
        !currentEl.classList.contains("prose")
      ) {
        currentEl = currentEl.parentElement;
      }
      if (currentEl) {
        const fullPara = currentEl.textContent || "";
        const sentences = splitIntoSentences(fullPara, isCjk);
        associatedSentence = sentences.find((s) => s.includes(cleanPhrase) || s.includes(rawSelected)) || fullPara;
      }
    }

    const context = (associatedSentence.trim() || cleanPhrase).replace(/\s+/g, " ");

    const wordPayload: SelectedWordData = {
      text: rawSelected,
      cleanText: cleanPhrase,
      contextSentence: context,
      status: getWordInfo(cleanPhrase),
    };

    useWordStore.getState().setSelectedWord(wordPayload);
    onWordClick(cleanPhrase, context, null);
  };

  // Global document mouseup listener to catch text selection anywhere inside reader
  useEffect(() => {
    const handleDocMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (!text) return;

      const readerRoot = document.getElementById("reader-top");
      if (!readerRoot) return;

      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      if (
        (anchor && readerRoot.contains(anchor)) ||
        (focus && readerRoot.contains(focus))
      ) {
        handleTextSelection();
      }
    };

    document.addEventListener("mouseup", handleDocMouseUp);
    return () => document.removeEventListener("mouseup", handleDocMouseUp);
  }, [lesson.targetLanguage, isCjk]);

  // Resolve lemma or alias base words, e.g. zorros -> zorro
  const resolveWord = (w: string) => {
    const lower = w.toLowerCase();
    const lang = lesson.targetLanguage.toLowerCase();
    const langKey = `${lang}_${lower}`;
    const resolved = wordLinks[langKey] || lower;
    return resolved.replace(/^[a-zA-Z]+_/, "");
  };

  // Handle single word styling/status checking
  const getWordInfo = (cleanWord: string) => {
    const key = resolveWord(cleanWord);
    const lang = lesson.targetLanguage.toLowerCase();
    const langKey = `${lang}_${key}`;
    const lq = vocab[langKey];
    if (lq) {
      return lq.status;
    }

    // Inherit status from base word if contraction/possessive base is known
    const normalized = normalizeContraction(key, lang);
    if (normalized !== key) {
      const normLangKey = `${lang}_${normalized}`;
      const normLq = vocab[normLangKey];
      if (normLq) {
        return normLq.status;
      }
    }

    // Check system auto-ignore lists (Gaming, Tech Brands, Names/Cities, Anglicisms)
    const autoIgnore = ignoreListManager.checkAutoIgnore(key, settings, lesson.targetLanguage);
    if (autoIgnore.isIgnored) {
      return "ignored";
    }

    return "new"; // defaults to blue 'new'
  };

  const speakWord = (word: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      
      const targetLang = lesson.targetLanguage.toLowerCase();
      let locale = "en-US";
      if (targetLang.includes("span")) locale = "es-ES";
      else if (targetLang.includes("fren") || targetLang.includes("fran")) locale = "fr-FR";
      else if (targetLang.includes("germ") || targetLang.includes("deut")) locale = "de-DE";
      else if (targetLang.includes("ital")) locale = "it-IT";
      else if (targetLang.includes("russ")) locale = "ru-RU";
      else if (targetLang.includes("chin") || targetLang.includes("zh")) locale = "zh-CN";
      else if (targetLang.includes("ja")) locale = "ja-JP";
      else if (targetLang.includes("ko")) locale = "ko-KR";
      else if (targetLang.includes("por")) locale = "pt-PT";
      
      utterance.lang = locale;
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => v.lang.toLowerCase().replace("_", "-").startsWith(locale.split("-")[0]));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const allUnknownWords = useMemo(() => {
    const cleanText = lesson.text
      .replace(/\[(?:\[LECTURA_)?IMG(?:_REF)?:[^\]]+\]/gi, " ")
      .replace(/^##\s+(.+?)\s+##\s*$/gm, "$1")
      .replace(/^#\s+(.+?)\s+#\s*$/gm, "$1")
      .replace(/^\[(?:CAPTION:?|caption\]?)\s*[^\]\n]*(?:\])?/gim, "");
    
    const tokens = segmentSentenceTokens(cleanText, lesson.targetLanguage);
    const candidates = tokens.filter((t) => t.isWord && t.clean).map((t) => t.clean) as string[];

    const uniqueCandidates = Array.from(new Set(candidates));
    
    const result = uniqueCandidates.filter(word => {
      if (!word) return false;
      const status = getWordInfo(word);
      return status !== "known" && status !== "ignored";
    });

    if (unknownSortMode === "alpha") {
      return [...result].sort((a, b) => compareWords(a, b, lesson.targetLanguage || "spanish", "asc"));
    }
    return result;
  }, [lesson.text, lesson.targetLanguage, vocab, wordLinks, isCjk, unknownSortMode]);

  const filteredUnknownWords = useMemo(() => {
    if (!unknownSearchQuery.trim()) return allUnknownWords;
    const query = unknownSearchQuery.toLowerCase().trim();
    return allUnknownWords.filter(w => w.toLowerCase().includes(query));
  }, [allUnknownWords, unknownSearchQuery]);

  const getPhraseBorderColorClass = (status: WordStatus) => {
    switch (status) {
      case "1": return "border-[#f3a4b0] dark:border-rose-400";
      case "2": return "border-[#f0d46d] dark:border-amber-400";
      case "3":
      case "learning" as any:
        return "border-[#a6d896] dark:border-emerald-400";
      case "4": return "border-[#204bf4] dark:border-blue-400";
      case "5": return "border-[#a882dd] dark:border-purple-400";
      case "known": return "border-zinc-400 dark:border-zinc-500";
      case "ignored": return "border-zinc-400/70 dark:border-zinc-600/70";
      default: return "border-sky-300 dark:border-sky-500";
    }
  };

  const getPhraseTextColorClass = (status: WordStatus) => {
    switch (status) {
      case "0":
      case "new" as any:
        return "text-rose-600 dark:text-rose-400";
      case "1":
        return "text-rose-600 dark:text-rose-400";
      case "2":
        return "text-amber-700 dark:text-amber-400";
      case "3":
      case "learning" as any:
        return "text-emerald-700 dark:text-emerald-400";
      case "4":
        return "text-blue-700 dark:text-blue-400";
      case "5":
        return "text-purple-700 dark:text-purple-400";
      case "known":
        return "text-zinc-600 dark:text-zinc-400";
      case "ignored":
        return "text-zinc-400/80 dark:text-zinc-500/80";
      default:
        return "text-teal-700 dark:text-teal-400";
    }
  };

  const handleWordSelect = (e: React.MouseEvent | undefined, rawToken: string, cleanWord: string, fullPara: string) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    // If the user just completed a text drag selection, do not override the phrase with the clicked token
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
      return;
    }

    const isMultiWord = cleanWord.trim().includes(" ");
    const resolvedClean = isMultiWord
      ? (sanitizePhraseText(cleanWord) || cleanWord.trim())
      : (cleanWordForLookup(cleanWord) || cleanWord);
    const key = resolveWord(resolvedClean);
    const sentences = splitIntoSentences(fullPara, isCjk);
    const associatedSentence = sentences.find((s) => s.includes(rawToken)) || fullPara;
    setHoveredWordObj(null);
    setHoveredWordId(null, isCjk);
    const targetEl = (e?.currentTarget as HTMLElement) || null;

    const wordPayload: SelectedWordData = {
      text: rawToken,
      cleanText: resolvedClean,
      contextSentence: associatedSentence.trim() || rawToken,
      status: getWordInfo(cleanWord),
    };
    useWordStore.getState().setSelectedWord(wordPayload);

    onWordClick(resolvedClean, associatedSentence.trim(), targetEl);
  };

  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const totalPagesCount = pages.length || 1;
    const validPageIdx = Math.min(Math.max(0, currentPageIdx), totalPagesCount - 1);
    const pageWeight = 100 / totalPagesCount;
    const baseProgress = (validPageIdx / totalPagesCount) * 100;

    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      let currentRatio = 0;
      if (totalHeight > 0) {
        currentRatio = Math.min(1, Math.max(0, window.scrollY / totalHeight));
      }
      const totalBookPct = Math.min(100, Math.max(0, Math.round(baseProgress + currentRatio * pageWeight)));
      setScrollProgress(totalBookPct);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [currentPageIdx, pages.length]);

  // Reader background cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up when leaving reader to Library / other views
    };
  }, [activeSettings.readerTheme]);

  const currentTheme = themeMap[activeSettings.readerTheme] || themeMap.default;
  const isMediaLesson = !!lesson.youtubeId || lesson.lessonType === "youtube" || lesson.lessonType === "podcast" || !!lesson.audioUrl || !!(lesson as any).audioFile || !!(lesson as any).audio;

  return (
    <div 
      id="reader-top" 
      onClick={handleBackgroundClick}
      className={`reader-container book-page-sheet relative w-full max-w-none lg:max-w-none ${
        hideMeta 
          ? "rounded-none lg:rounded-3xl border-0 lg:border shadow-none lg:shadow-md px-4 py-3 lg:px-10 lg:pt-4 lg:pb-6 min-h-screen lg:min-h-[70vh] flex flex-col justify-between" 
          : "rounded-none lg:rounded-3xl border-0 lg:border shadow-none lg:shadow-sm px-4 py-3 lg:p-8 space-y-3 lg:space-y-6"
      } transition-colors duration-200 overflow-hidden ${currentTheme.container}`}
    >
      <div id="reader-top-anchor" className="h-0 pointer-events-none" />
      {/* Top Reading Progress Line */}
      {activeSettings.showProgressBar && !lesson.youtubeId && !currentYoutubeTime && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-200/50 dark:bg-zinc-800/50">
          <div 
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-150" 
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      )}

      {/* Static Header for Book Focus Mode */}
      {lesson.lessonType === "book" && isBookFocus && (
        <header className="flex items-center justify-between py-2 mb-4 border-b border-stone-200/60 dark:border-zinc-800/60 select-none text-xs text-stone-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => {
              setActiveTab("library");
              window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            }}
            className="hover:text-stone-800 dark:hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer font-medium"
            title={t('reader.library_btn', 'Library')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{t('reader.library_btn', 'Library')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("toggle-book-toc"));
              }}
              className="px-2.5 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 hover:text-stone-800 dark:hover:text-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
              title={t('reader.toc', 'Table of Contents')}
            >
              <span>📑 {t('reader.chapters', 'Chapters')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const nextView = isBookFocus ? "study" : "focus";
                setBookReaderView(nextView);
                if (onUpdateSettings) {
                  if (nextView === "study") {
                    onUpdateSettings({
                      ...settings,
                      readerViewStyle: "badges",
                    });
                  } else {
                    onUpdateSettings({
                      ...settings,
                      bookReaderViewStyle: "text",
                      bookFontFamily: "serif",
                    });
                  }
                }
              }}
              className="px-2.5 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/60 transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
              title={isBookFocus ? t('reader.switch_to_study', 'Switch to Study Mode (Full Inspector)') : t('reader.switch_to_book', 'Switch to Book Focus')}
            >
              <span>{isBookFocus ? "🎓 " + t('reader.study_mode_short', 'Study') : "📖 " + t('reader.book_mode_short', 'Book')}</span>
            </button>
            <TextSettingsControls
              settings={activeSettings}
              onUpdateSettings={onUpdateSettings || (() => {})}
              compact={false}
              lessonType={lesson.lessonType}
            />
          </div>
        </header>
      )}

      {/* Title / status — hidden in Focus Mode via hideMeta prop */}
      {!hideMeta && (
        <div className={`pb-2.5 sm:pb-3.5 border-b ${currentTheme.divider} flex items-center justify-end lg:justify-between gap-3 min-w-0`}>
          {/* Main Lesson Title (Truncated on long titles, hidden on mobile/tablet to avoid duplication with video header, shown on PC) */}
          <h1 
            className="hidden lg:block text-lg sm:text-xl md:text-2xl font-bold tracking-tight truncate max-w-[60%] sm:max-w-[70%] md:max-w-[75%] min-w-0"
            title={lesson.title}
          >
            {lesson.title}
          </h1>

          {/* Right: Action Icons (mobile) + Status Switcher (In Progress / Completed) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 5 Reader Action Icons (visible only on mobile/tablet, hidden on desktop) */}
            <div className="flex lg:hidden items-center gap-0.5 sm:gap-1 shrink-0">
              {/* 1. Translation Toggle */}
              {activeSettings.toolbarVisibility?.showTranslation === true && (
                <button
                  type="button"
                  onClick={onToggleTranslations}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    activeSettings.showSentenceTranslations
                      ? "text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10 border border-teal-500/30 shadow-3xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  title={activeSettings.showSentenceTranslations ? t("reader.hide_translations_title", "Скрыть перевод предложений (T)") : t("reader.show_translations_title", "Показать перевод предложений (T)")}
                >
                  <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* 2. Focus Mode */}
              {activeSettings.toolbarVisibility?.showFocusMode !== false && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isFocusMode) {
                      setShowYoutubePlayer(true);
                    }
                    setIsFocusMode(!isFocusMode);
                  }}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    isFocusMode
                      ? "text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10 border border-teal-500/30 shadow-3xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  title={t("reader.focus_btn", "Режим фокуса")}
                >
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* 3. Play: Match Pairs */}
              {activeSettings.toolbarVisibility?.showPlayPairs === true && (
                <button
                  type="button"
                  onClick={() => setShowMatchPairsModal(true)}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title={t("reader.pairs_btn_title", "Игра: Пары")}
                >
                  <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* 4. Unknown Only */}
              {activeSettings.toolbarVisibility?.showUnknownOnly !== false && (
                <button
                  type="button"
                  onClick={() => (onWordClick ? storeSetShowOnlyUnknown(!storeShowOnlyUnknown) : null)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    storeShowOnlyUnknown || showOnlyUnknown
                      ? "text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10 border border-amber-500/30 shadow-3xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  title={t("reader.unknown_btn_title", "Только неизвестные слова")}
                >
                  {(storeShowOnlyUnknown || showOnlyUnknown) ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              )}

              {/* 5. Video */}
              {activeSettings.toolbarVisibility?.showVideoToggle !== false && !isBookLesson && lesson.sourceType !== 'book' && lesson.sourceType !== 'article' && Boolean(lesson.youtubeId || (lesson as any).localVideoUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
                    if (isMobileOrTablet) {
                      if (isFocusMode && showYoutubePlayer) {
                        setShowYoutubePlayer(false);
                      } else {
                        setIsFocusMode(true);
                        setShowYoutubePlayer(true);
                      }
                    } else {
                      setShowYoutubePlayer(!showYoutubePlayer);
                    }
                  }}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    (showYoutubePlayer && !isFocusMode) || (isFocusMode && showYoutubePlayer)
                      ? "text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10 border border-teal-500/30 shadow-3xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  title={t("reader.video_btn_title", "Видео")}
                >
                  <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* 6. Timestamps */}
              {activeSettings.toolbarVisibility?.showTimestampsToggle !== false && hasTimestamps && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings?.({
                      ...settings,
                      showTimestamps: activeSettings.showTimestamps === false ? true : false,
                    })
                  }
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    activeSettings.showTimestamps !== false
                      ? "text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10 border border-teal-500/30 shadow-3xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  title={
                    activeSettings.showTimestamps !== false
                      ? t("reader.hide_timestamps_title", "Скрыть временные метки")
                      : t("reader.show_timestamps_title", "Показать временные метки")
                  }
                >
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* 7. Text Settings (AA) */}
              <TextSettingsControls
                settings={activeSettings}
                onUpdateSettings={onUpdateSettings || (() => {})}
                compact={false}
                lessonType={lesson.lessonType}
              />
            </div>

            {/* Status Switcher (In Progress / Completed) */}
            <button
              type="button"
              onClick={() => handleToggleStatus("in_progress")}
              className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-black rounded-lg flex items-center gap-1 transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                currentStatus === "in_progress"
                  ? "bg-teal-600 text-white shadow-xs"
                  : `${currentTheme.subText} hover:bg-black/5 dark:hover:bg-white/5 border border-zinc-200/50 dark:border-zinc-800/50`
              }`}
              title={t('reader.status_in_progress_title', 'Set status: In Progress')}
            >
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>{t('reader.status_in_progress', 'In Progress')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleStatus("completed")}
              className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-black rounded-lg flex items-center gap-1 transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                currentStatus === "completed"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : `${currentTheme.subText} hover:bg-black/5 dark:hover:bg-white/5 border border-zinc-200/50 dark:border-zinc-800/50`
              }`}
              title={t('reader.status_completed_title', 'Set status: Completed')}
            >
              <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>{t('reader.status_completed', 'Completed')}</span>
            </button>
          </div>
        </div>
      )} {/* end !hideMeta */}

      {showOnlyUnknown && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-zinc-850 dark:text-zinc-200 animate-in fade-in duration-200 font-sans">
          <span className="text-xs font-black flex items-center gap-1.5 uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse animate-duration-1000" />
            {t('reader.unknown_count', 'Unknown words in chapter: ')}{allUnknownWords.length}
          </span>
          <div className={`flex items-center gap-1 ${currentTheme.pillBg} p-1 rounded-xl shrink-0`}>
            <button
              type="button"
              onClick={() => setUnknownViewMode("text")}
              className={`h-7 px-3 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                unknownViewMode === "text"
                  ? "bg-amber-500 text-white shadow-xs"
                  : `${currentTheme.subText} hover:text-zinc-900 dark:hover:text-zinc-100`
              }`}
            >
              <AlignLeft className="w-3 h-3" />
              <span>{t('reader.view_in_context', 'In Context')}</span>
            </button>
            <button
              type="button"
              onClick={() => setUnknownViewMode("list")}
              className={`h-7 px-3 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                unknownViewMode === "list"
                  ? "bg-amber-500 text-white shadow-xs"
                  : `${currentTheme.subText} hover:text-zinc-900 dark:hover:text-zinc-100`
              }`}
            >
              <List className="w-3 h-3" />
              <span>{t('reader.view_list', 'List')} ({allUnknownWords.length})</span>
            </button>
          </div>
        </div>
      )}

      <div 
        key={`page-content-${clampedPageIdx}`}
        onMouseUp={handleTextSelection}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`reader-text-container prose max-w-none antialiased tracking-normal flex-1 w-full mode-${appearance.readerViewStyle} font-${appearance.fontFamily} theme-${appearance.readerTheme} ${
          isDedicationOrTitlePage
            ? "flex flex-col items-center justify-center text-center my-auto min-h-[60vh] py-8 space-y-4"
            : "space-y-5 text-left"
        } ${fontFamilyMap[appearance.fontFamily]} ${fontSizeMap[appearance.fontSize]} ${(isTextMode ? lineHeightMap : badgeLineHeightMap)[appearance.lineHeight]} ${widthMap[appearance.maxWidth]}`}
        style={{
          "--reader-font-size": FONT_SIZE_CSS[appearance.fontSize] || "1.125rem",
          "--reader-line-height": (isTextMode ? LINE_HEIGHT_CSS : BADGE_LINE_HEIGHT_CSS)[appearance.lineHeight] || "1.95",
          "--reader-font-family": FONT_FAMILY_CSS[appearance.fontFamily] || "inherit",
        } as React.CSSProperties}
      >
        {showOnlyUnknown && unknownViewMode === "list" && (
          <ReaderUnknownWordsList
            lesson={lesson}
            vocab={vocab}
            activeWord={activeWord}
            unknownSearchQuery={unknownSearchQuery}
            setUnknownSearchQuery={setUnknownSearchQuery}
            unknownSortMode={unknownSortMode}
            setUnknownSortMode={setUnknownSortMode}
            filteredUnknownWords={filteredUnknownWords}
            getWordInfo={getWordInfo}
            resolveWord={resolveWord}
            onWordClick={onWordClick}
            onMarkKnown={onMarkKnown}
            speakWord={speakWord}
          />
        )}

        {!(showOnlyUnknown && unknownViewMode === "list") && activeSegmentsForPage.map((seg, pIdx) => {
          if (!seg || !seg.text || seg.text.trim().length === 0) return null;
          const globalSegmentIdx = segments.indexOf(seg);
          const isSegmentActive = globalSegmentIdx === activeSegmentIndex && activeSegmentIndex >= 0;

          // Check if we should split by sentence with synchronous normalization
          const sentenceStrings = (activeSettings.sentenceSpacing && activeSettings.sentenceSpacing !== "normal")
            ? splitIntoSentences(seg.text, isCjk)
            : [seg.text];

          // Check if this segment represents an inline image placeholder or caption
          const trimmedSegText = seg.text.trim();

          // 1. Проверка на картинку
          if ((trimmedSegText.startsWith('[IMG:') && trimmedSegText.endsWith(']')) || trimmedSegText.startsWith('__LECTURA_IMG__:')) {
            const src = trimmedSegText.startsWith('__LECTURA_IMG__:')
              ? trimmedSegText.replace('__LECTURA_IMG__:', '').trim()
              : trimmedSegText.slice(5, -1).trim();

            // Проверяем, есть ли подпись сразу за картинкой
            let nextCaptionText = '';
            const nextSeg = activeSegmentsForPage[pIdx + 1];
            if (nextSeg && nextSeg.text) {
              const nextTrimmed = nextSeg.text.trim();
              if (nextTrimmed.startsWith('[CAPTION:') && nextTrimmed.endsWith(']')) {
                nextCaptionText = nextTrimmed.slice(9, -1).trim();
              } else if (nextTrimmed.startsWith('__LECTURA_CAP__:')) {
                nextCaptionText = nextTrimmed.replace('__LECTURA_CAP__:', '').trim();
              }
            }

            return (
              <figure key={pIdx} className="my-6 mx-auto max-w-xl flex flex-col items-start clear-both w-full">
                <img
                  src={src}
                  alt={t('reader.illustration', 'Illustration')}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  id={`pdf-epub-img-${pIdx}`}
                  className="w-full h-auto rounded-xl shadow-md border border-neutral-200 dark:border-neutral-800 object-contain bg-neutral-900"
                  onError={(e) => {
                    const el = e.currentTarget;
                    el.style.display = "none";
                    const parent = el.parentElement;
                    if (parent) parent.style.display = "none";
                  }}
                />
                {nextCaptionText && (
                  <figcaption className="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1.5 text-center select-none w-full">
                    {nextCaptionText.replace(/^image caption[:,]?\s*/i, '').trim()}
                  </figcaption>
                )}
              </figure>
            );
          }

          // 2. Проверка на подпись к картинке
          if ((trimmedSegText.startsWith('[CAPTION:') && trimmedSegText.endsWith(']')) || trimmedSegText.startsWith('__LECTURA_CAP__:')) {
            // Если предыдущий сегмент уже был картинкой, подпись уже отрендерена внутри <figure>!
            const prevSeg = activeSegmentsForPage[pIdx - 1];
            if (prevSeg && prevSeg.text) {
              const prevTrimmed = prevSeg.text.trim();
              if (prevTrimmed.startsWith('[IMG:') || prevTrimmed.startsWith('__LECTURA_IMG__:')) {
                return null;
              }
            }

            const rawCaption = trimmedSegText.startsWith('__LECTURA_CAP__:')
              ? trimmedSegText.replace('__LECTURA_CAP__:', '').trim()
              : trimmedSegText.slice(9, -1).trim();
            const caption = rawCaption.replace(/^image caption[:,]?\s*/i, '').trim();
            return (
              <figure key={pIdx} id={`segment-row-${globalSegmentIdx}`} className="my-2 mx-auto max-w-xl flex flex-col items-center clear-both w-full">
                <figcaption className="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1.5 text-center select-none w-full">
                  {caption}
                </figcaption>
              </figure>
            );
          }

          // Precalculate total words in this segment for word-by-word highlight
          const segmentWordCount = (() => {
            if (!activeSettings.wordHighlight || !isSegmentActive) return 0;
            let count = 0;
            sentenceStrings.forEach((sentText) => {
              const tokens = segmentSentenceTokens(sentText, lesson.targetLanguage);
              count += tokens.filter((t) => t.isWord).length;
            });
            return count;
          })();
          let wordRenderCount = 0;



          // Legacy strict check for EPUB/PDF [IMG_REF:...]
          const isLegacyImage = /^\[IMG(?:_REF)?:/.test(trimmedSegText) && trimmedSegText.endsWith("]");
          if (isLegacyImage) {
            try {
              const payload = trimmedSegText.startsWith("[IMG_REF:")
                ? trimmedSegText.substring(9, trimmedSegText.length - 1)
                : trimmedSegText.substring(5, trimmedSegText.length - 1);
              const pipeIdx = payload.indexOf("|");
              const lastPipeIdx = payload.lastIndexOf("|");
              let dataUrl = payload;
              let width = "";
              let height = "";
              if (pipeIdx !== -1) {
                dataUrl = payload.substring(0, pipeIdx);
                if (lastPipeIdx !== pipeIdx) {
                  width = payload.substring(pipeIdx + 1, lastPipeIdx);
                  height = payload.substring(lastPipeIdx + 1);
                } else {
                  width = payload.substring(pipeIdx + 1);
                }
              }

              if (dataUrl.startsWith("epub_img_") || !dataUrl.startsWith("data:")) {
                const resolved = lessonImagesMap?.[dataUrl] || (lesson as any).images?.[dataUrl] || (lesson as any).media?.images?.[dataUrl];
                if (resolved) {
                  dataUrl = resolved;
                } else if (dataUrl.startsWith("epub_img_")) {
                  console.warn("[ReaderPanel] Could not resolve image ID:", dataUrl, "in lesson images");
                  return null;
                }
              } else if (trimmedSegText.startsWith("[IMG_REF:")) {
                return null;
              }

              // Normalize host: replace http://localhost:... or http://127.0.0.1:... with current window.location.origin
              if (typeof dataUrl === "string" && typeof window !== "undefined" && window.location?.origin) {
                dataUrl = dataUrl.replace(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, window.location.origin);
              }

              if (!dataUrl || (!dataUrl.startsWith("data:image/") && !dataUrl.startsWith("http://") && !dataUrl.startsWith("https://") && !dataUrl.startsWith("/"))) {
                return null;
              }

              return (
                <div
                  key={pIdx}
                  className="my-6 flex flex-col items-center justify-center w-full reader-image-container"
                >
                  <img
                    src={dataUrl}
                    alt={t('reader.illustration', 'Illustration')}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    id={`pdf-epub-img-${pIdx}`}
                    className="w-full max-w-2xl h-auto max-h-[500px] object-contain rounded-xl shadow-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900"
                    onError={(e) => {
                      // Hide broken images cleanly instead of showing white rectangle
                      const el = e.currentTarget;
                      el.style.display = "none";
                      const parent = el.parentElement;
                      if (parent) parent.style.display = "none";
                    }}
                  />
                </div>
              );
            } catch (err) {
              console.error("Failed to render inline image segment:", err);
              return null;
            }
          }




          const getSentenceSpacingClass = (spacing?: string) => {
            switch (spacing) {
              case "spaced":
                return "inline-block mr-4 md:mr-6";
              case "wide":
                return "inline-block mr-8 md:mr-12";
              case "newline":
                return "block mb-2 last:mb-0";
              case "double-newline":
                return "block mb-5 last:mb-0";
              default:
                return "inline";
            }
          };

          const renderSentenceTokens = (sentText: string, sIdx: number) => {
            const range = sentenceTokenRanges.find((r) => r.segIdx === pIdx && r.sIdx === sIdx);
            if (!range) return [];
            const tokens = allPageTokens.slice(range.startIdx, range.endIdx + 1);

            // Map page-level phrase matches to sentence-local token indices
            const phraseMatches: { phrase: string; vocabItem: VocabItem; tokenIndices: number[] }[] = [];
            const detectedMatches: { phrase: string; translation: string; explanation: string; type?: string; tokenIndices: number[] }[] = [];

            pagePhraseMatches.forEach((m) => {
              const sentenceIndices = m.tokenIndices.filter((idx) => idx >= range.startIdx && idx <= range.endIdx);
              if (sentenceIndices.length > 0) {
                const localIndices = sentenceIndices.map((idx) => idx - range.startIdx);
                phraseMatches.push({
                  phrase: m.phrase,
                  vocabItem: m.vocabItem,
                  tokenIndices: localIndices,
                });
              }
            });

            pageDetectedMatches.forEach((m) => {
              const sentenceIndices = m.tokenIndices.filter((idx) => idx >= range.startIdx && idx <= range.endIdx);
              if (sentenceIndices.length > 0) {
                const localIndices = sentenceIndices.map((idx) => idx - range.startIdx);
                detectedMatches.push({
                  phrase: m.phrase,
                  translation: m.translation,
                  explanation: m.explanation,
                  type: m.type,
                  tokenIndices: localIndices,
                });
              }
            });

            const elements: React.ReactNode[] = [];
            let tIdx = 0;

            const handlePhraseMouseEnter = (
              e: React.MouseEvent,
              rect: DOMRect,
              detectedMatch: typeof detectedMatches[0] | null,
              phraseMatch: typeof phraseMatches[0] | null
            ) => {
              if (isFloatingModalOpen) return;
              const showBelow = rect.bottom < window.innerHeight - 280;
              const posY = showBelow ? rect.bottom + 6 : rect.top - 6;
              
              if (phraseMatch) {
                setHoveredWordObj({
                  word: phraseMatch.phrase,
                  translation: "",
                  x: rect.left + rect.width / 2,
                  y: posY,
                  position: showBelow ? "below" : "above",
                  phraseText: phraseMatch.phrase,
                  phraseTranslation: phraseMatch.vocabItem.translation,
                  phraseDefinition: phraseMatch.vocabItem.definition,
                  phraseStatus: phraseMatch.vocabItem.status,
                  phraseTags: phraseMatch.vocabItem.tags,
                });
              } else if (detectedMatch) {
                setHoveredWordObj({
                  word: detectedMatch.phrase,
                  translation: "",
                  x: rect.left + rect.width / 2,
                  y: posY,
                  position: showBelow ? "below" : "above",
                  detectedPhraseText: detectedMatch.phrase,
                  detectedPhraseTranslation: detectedMatch.translation,
                  detectedPhraseExplanation: detectedMatch.explanation,
                  detectedPhraseType: detectedMatch.type,
                });
              }
            };

            const isPunctuationToken = (tok: any) => {
              return !tok.isWord && /^[.,!?:;…»\)'"”\u2019\u201d\u2026\[\]\(\)\{\}«“、。！？]+$/.test(tok.raw.trim());
            };

            const getCjkSpacingClass = (lastIdx: number) => {
              if (!isCjk || !activeSettings.cjkWordSpacing) return "";
              const nextTok = lastIdx + 1 < tokens.length ? tokens[lastIdx + 1] : null;
              if (nextTok) {
                // If next token is punctuation, no spacing
                if (isPunctuationToken(nextTok)) return "";
                // If next token is whitespace, no extra spacing needed
                if (!nextTok.isWord && /^\s+$/.test(nextTok.raw)) return "";
              }
              return "mr-[0.2em]";
            };

            // Identify if the active multi-word phrase is present in this sentence
            const activePhraseTokenRange: { start: number; end: number } | null = (() => {
              if (!currentActiveWord || !currentActiveWord.trim().includes(" ")) return null;
              const targetWords = currentActiveWord.toLowerCase().trim().split(/\s+/).filter(Boolean);
              if (targetWords.length <= 1) return null;

              for (let i = 0; i < tokens.length; i++) {
                // Phrase MUST start strictly on a word token matching targetWords[0]
                if (!tokens[i].isWord) continue;
                const firstWordClean = (tokens[i].clean || tokens[i].raw).toLowerCase();
                if (firstWordClean !== targetWords[0]) continue;

                let match = true;
                let wordCount = 1;
                let j = i + 1;
                let lastWordIdx = i;

                while (j < tokens.length && wordCount < targetWords.length) {
                  const t = tokens[j];
                  if (t.isWord) {
                    const tokClean = (t.clean || t.raw).toLowerCase();
                    if (tokClean !== targetWords[wordCount]) {
                      match = false;
                      break;
                    }
                    wordCount++;
                    lastWordIdx = j;
                  }
                  j++;
                }

                if (match && wordCount === targetWords.length) {
                  return { start: i, end: lastWordIdx };
                }
              }
              return null;
            })();

            while (tIdx < tokens.length) {
              const tok = tokens[tIdx];

              if (!tok.isWord) {
                // If this token is whitespace and next token is closing punctuation, skip whitespace so punctuation glues to previous word
                if (/^\s+$/.test(tok.raw) && tIdx + 1 < tokens.length && !tokens[tIdx + 1].isWord) {
                  const nextRaw = tokens[tIdx + 1].raw.trim();
                  const isClosingPunct = /^[.,!?:;…»\)'"”\u2019\u201d\u2026\]\}]+$/.test(nextRaw) && !/^[“«„‘(\[{<]+$/.test(nextRaw);
                  if (isClosingPunct) {
                    tIdx++;
                    continue;
                  }
                }
                const isPunct = /^[^\p{L}\p{N}\s]+$/u.test(tok.raw.trim());
                if (isPunct) {
                  const nextTok = tIdx + 1 < tokens.length ? tokens[tIdx + 1] : null;
                  const hasSpaceAfter = nextTok && /^\s+$/.test(nextTok.raw);
                  const isOpeningQuoteOrBracket = /[“«„‘(\[{<"']$/.test(tok.raw.trim());
                  elements.push(
                    <span 
                      key={`punct-${tIdx}`} 
                      className={`text-inherit opacity-95 inline whitespace-nowrap ml-0 ${hasSpaceAfter || isOpeningQuoteOrBracket ? "" : "mr-1.5"}`}
                    >
                      {tok.raw.trim()}
                    </span>
                  );
                  tIdx++;
                  continue;
                }
                const isEnglish = lesson.targetLanguage.toLowerCase().startsWith("en") || lesson.targetLanguage.toLowerCase() === "english" || lesson.targetLanguage.toLowerCase() === "английский";
                const isNum = isNumericOrRoman(tok.raw, isEnglish);
                const isWhitespace = /^\s+$/.test(tok.raw);

                if (isWhitespace) {
                  const isInActivePhrase = activePhraseTokenRange !== null && 
                    tIdx > activePhraseTokenRange.start && 
                    tIdx < activePhraseTokenRange.end;

                  elements.push(
                    <span 
                      key={`space-${tIdx}`} 
                      className={`select-text transition-colors ${
                        isInActivePhrase 
                          ? `bg-emerald-300/80 dark:bg-emerald-500/40 text-neutral-900 dark:text-neutral-100 ${isTextMode ? "inline" : "inline-block my-0.5 py-0.5 align-middle leading-tight"}` 
                          : "opacity-95 inline"
                      }`}
                    >
                      {tok.raw}
                    </span>
                  );
                  tIdx++;
                  continue;
                }

                elements.push(
                  <span 
                    key={`nonword-${tIdx}`} 
                    className={isNum ? "text-inherit opacity-95 inline" : "opacity-95 inline"}
                  >
                    {tok.raw}
                  </span>
                );
                tIdx++;
                continue;
              }

              // Check if this token starts a user-saved phrase match (takes priority)
              const matchedPhrase = phraseMatches.find((m) => m.tokenIndices[0] === tIdx);
              const matchedDetected = detectedMatches.find((m) => m.tokenIndices[0] === tIdx);

              if (matchedPhrase) {
                const startIndex = matchedPhrase.tokenIndices[0];
                const endIndex = matchedPhrase.tokenIndices[matchedPhrase.tokenIndices.length - 1];
                const phraseTokens = tokens.slice(startIndex, endIndex + 1);

                // Increment word render count for the words in this phrase
                let isPhraseActive = false;
                phraseTokens.forEach((t) => {
                  if (t.isWord) {
                    const currentWordIdx = wordRenderCount;
                    wordRenderCount++;

                    if (
                      activeSettings.wordHighlight &&
                      isSegmentActive &&
                      currentYoutubeTime !== null &&
                      currentYoutubeTime !== undefined &&
                      segmentWordCount > 0
                    ) {
                      const segmentStartTime = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : 0;
                      let segmentEndTime = segmentStartTime + 10;
                      for (let i = globalSegmentIdx + 1; i < segments.length; i++) {
                        if (segments[i].timestamp) {
                          segmentEndTime = parseTimestampToSeconds(segments[i].timestamp!);
                          break;
                        }
                      }
                      const segmentDuration = Math.max(0.1, segmentEndTime - segmentStartTime);
                      const wordDuration = segmentDuration / segmentWordCount;
                      const wordStart = segmentStartTime + currentWordIdx * wordDuration;
                      const wordEnd = segmentStartTime + (currentWordIdx + 1) * wordDuration;

                      if (currentYoutubeTime >= wordStart && currentYoutubeTime < wordEnd) {
                        isPhraseActive = true;
                      }
                    }
                  }
                });

                const firstTok = phraseTokens[0];
                const lastTok = phraseTokens[phraseTokens.length - 1];
                let prefix = "";
                let suffix = "";
                if (firstTok) {
                  const cleanedAt = firstTok.raw.toLowerCase().indexOf(firstTok.clean);
                  if (cleanedAt > 0) prefix = firstTok.raw.substring(0, cleanedAt);
                }
                if (lastTok && lastTok.clean) {
                  const cleanedAt = lastTok.raw.toLowerCase().indexOf(lastTok.clean);
                  if (cleanedAt >= 0) {
                    const end = cleanedAt + lastTok.clean.length;
                    if (end < lastTok.raw.length) suffix = lastTok.raw.substring(end);
                  }
                }

                const phraseDisplay = phraseTokens.map((t, idx) => {
                  let text = t.raw;
                  if (idx === 0) text = text.substring(prefix.length);
                  if (idx === phraseTokens.length - 1) text = text.substring(0, text.length - suffix.length);
                  return text;
                }).join("");

                const isPhraseSelected = currentActiveWord?.toLowerCase() === matchedPhrase.phrase.toLowerCase();
                const status = matchedPhrase.vocabItem.status;

                let styleClass = "";
                const borderClass = `border-b-2 border-dashed ${getPhraseBorderColorClass(status)}`;

                if (isTextMode) {
                  const textColorClass = getPhraseTextColorClass(status);
                  styleClass = `${textColorClass} border-b-2 border-dashed ${getPhraseBorderColorClass(status)} hover:underline cursor-pointer transition-colors`;
                  if (isPhraseActive) {
                    styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-bold bg-amber-500/15 rounded px-0.5`;
                  } else if (isPhraseSelected) {
                    styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 font-bold bg-teal-500/15 rounded px-0.5`;
                  }
                } else {
                  if (status === "0" || (status as any) === "new") {
                    styleClass = `bg-[#f8b4be]/45 dark:bg-rose-950/60 hover:bg-[#f8b4be]/70 dark:hover:bg-rose-900/60 text-rose-950 dark:text-rose-300 rounded-[3px] px-1 py-0.5 leading-tight font-medium ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "1") {
                    styleClass = `bg-[#f3a4b0]/45 dark:bg-rose-950/60 hover:bg-[#f3a4b0]/70 dark:hover:bg-rose-900/60 text-rose-950 dark:text-rose-300 rounded-[3px] px-1 py-0.5 leading-tight font-medium ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "2") {
                    styleClass = `bg-[#f0d46d]/45 dark:bg-amber-950/60 hover:bg-[#f0d46d]/70 dark:hover:bg-amber-900/60 text-amber-950 dark:text-amber-300 rounded-[3px] px-1 py-0.5 leading-tight font-medium ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "3" || (status as any) === "learning") {
                    styleClass = `bg-[#a6d896]/45 dark:bg-emerald-950/60 hover:bg-[#a6d896]/70 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 rounded-[3px] px-1 py-0.5 leading-tight font-medium ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "4") {
                    styleClass = `bg-[#99bce8] dark:bg-blue-950/60 hover:bg-[#86b0e3] dark:hover:bg-blue-900/60 text-blue-950 dark:text-blue-300 rounded-[3px] px-1 py-0.5 leading-tight font-semibold ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "5") {
                    styleClass = `bg-[#c5aee2] dark:bg-purple-950/60 hover:bg-[#b096d2] dark:hover:bg-purple-900/60 text-purple-950 dark:text-purple-300 rounded-[3px] px-1 py-0.5 leading-tight font-semibold ${borderClass} cursor-pointer transition-colors`;
                  }

                  if (isPhraseActive) {
                    styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold shadow-sm`;
                  } else if (isPhraseSelected) {
                    styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 shadow-sm`;
                  }
                }

                const wordId = `phrase-${matchedPhrase.phrase}-${tIdx}-${sIdx}-${pIdx}`;
                const phrasePaddingClass = isTextMode ? "" : `${prefix ? "pl-0.5" : "pl-1"} ${suffix ? "pr-0.5" : "pr-1"}`;

                elements.push(
                  <span key={tIdx} className={`inline whitespace-nowrap relative ${hoveredWordId === wordId ? "z-50" : ""} ${getCjkSpacingClass(endIndex)}`} spellCheck={false}>
                    {prefix && <span className="inline text-inherit select-none pointer-events-none opacity-95 mr-0">{prefix}</span>}
                    <span
                      role="button"
                      tabIndex={0}
                      id={`word-phrase-${matchedPhrase.phrase}-${tIdx}`}
                      data-token={matchedPhrase.phrase}
                      onClick={(e) => handleWordSelect(e, matchedPhrase.phrase, matchedPhrase.phrase, sentText)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleWordSelect(e as any, matchedPhrase.phrase, matchedPhrase.phrase, sentText);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (isFloatingModalOpen) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredWordId(wordId);
                        handlePhraseMouseEnter(e, rect, null, matchedPhrase);
                      }}
                      onMouseLeave={() => {
                        setHoveredWordId(null);
                        setHoveredWordObj(null);
                      }}
                      className={`reader-word-token ${styleClass} ${phrasePaddingClass} ${isTextMode ? "inline" : "inline-block my-0.5"} cursor-pointer select-text text-[length:inherit]`}
                      style={{ outline: "none" }}
                      spellCheck={false}
                    >
                      {phraseDisplay}
                    </span>
                    {suffix && <span className="inline text-inherit select-none pointer-events-none opacity-95 ml-0">{suffix}</span>}
                  </span>
                );

                tIdx = endIndex + 1;
                continue;
              }

              if (matchedDetected) {
                const startIndex = matchedDetected.tokenIndices[0];
                const endIndex = matchedDetected.tokenIndices[matchedDetected.tokenIndices.length - 1];
                const phraseTokens = tokens.slice(startIndex, endIndex + 1);

                // Increment word render count for the words in this phrase
                let isPhraseActive = false;
                phraseTokens.forEach((t) => {
                  if (t.isWord) {
                    const currentWordIdx = wordRenderCount;
                    wordRenderCount++;

                    if (
                      activeSettings.wordHighlight &&
                      isSegmentActive &&
                      currentYoutubeTime !== null &&
                      currentYoutubeTime !== undefined &&
                      segmentWordCount > 0
                    ) {
                      const segmentStartTime = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : 0;
                      let segmentEndTime = segmentStartTime + 10;
                      for (let i = globalSegmentIdx + 1; i < segments.length; i++) {
                        if (segments[i].timestamp) {
                          segmentEndTime = parseTimestampToSeconds(segments[i].timestamp!);
                          break;
                        }
                      }
                      const segmentDuration = Math.max(0.1, segmentEndTime - segmentStartTime);
                      const wordDuration = segmentDuration / segmentWordCount;
                      const wordStart = segmentStartTime + currentWordIdx * wordDuration;
                      const wordEnd = segmentStartTime + (currentWordIdx + 1) * wordDuration;

                      if (currentYoutubeTime >= wordStart && currentYoutubeTime < wordEnd) {
                        isPhraseActive = true;
                      }
                    }
                  }
                });

                const isPhraseSelected = currentActiveWord?.toLowerCase() === matchedDetected.phrase.toLowerCase();

                // Build clean phrase display
                let prefix = "";
                let suffix = "";
                const firstTok = phraseTokens[0];
                const lastTok = phraseTokens[phraseTokens.length - 1];

                const firstClean = firstTok.clean;
                const firstRaw = firstTok.raw;
                const cleanedAtStartIdx = firstRaw.toLowerCase().indexOf(firstClean);
                if (cleanedAtStartIdx > 0) {
                  prefix = firstRaw.substring(0, cleanedAtStartIdx);
                }

                const lastClean = lastTok.clean;
                const lastRaw = lastTok.raw;
                const lastCleanedStartIdx = lastRaw.toLowerCase().indexOf(lastClean);
                if (lastCleanedStartIdx >= 0) {
                  const cleanedAtEndIdx = lastCleanedStartIdx + lastClean.length;
                  if (cleanedAtEndIdx < lastRaw.length) {
                    suffix = lastRaw.substring(cleanedAtEndIdx);
                  }
                }

                let phraseDisplay = "";
                if (phraseTokens.length === 1) {
                  phraseDisplay = firstClean;
                } else {
                  const middleRaw = phraseTokens.slice(1, -1).map(t => t.raw).join("");
                  const firstWordPortion = cleanedAtStartIdx >= 0 ? firstRaw.substring(cleanedAtStartIdx) : firstRaw;
                  const lastWordPortion = lastCleanedStartIdx >= 0 ? lastRaw.substring(0, lastCleanedStartIdx + lastClean.length) : lastRaw;
                  phraseDisplay = firstWordPortion + middleRaw + lastWordPortion;
                }

                const idiomStyle = activeSettings.idiomHighlightStyle || "badge";
                let styleClass = "";
                let isIconStyle = false;

                if (idiomStyle === "badge") {
                  styleClass = "bg-purple-100/70 border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800 text-purple-950 dark:text-purple-300 font-semibold hover:bg-purple-200/80 dark:hover:bg-purple-900/50 cursor-pointer rounded-[3px] px-1 py-0.5 mx-[0.5px] transition-all";
                } else if (idiomStyle === "underline") {
                  styleClass = "border-b-2 border-dotted border-purple-500 dark:border-purple-400 pb-[3px] cursor-pointer rounded px-0.5 transition-all";
                } else if (idiomStyle === "icon") {
                  isIconStyle = true;
                  styleClass = "cursor-pointer rounded px-0.5 transition-all";
                } else if (idiomStyle === "hover") {
                  styleClass = "border-b-2 border-transparent hover:border-dotted hover:border-purple-500 pb-[3px] cursor-pointer rounded px-0.5 transition-all duration-150";
                }

                const phraseKey = resolveWord(matchedDetected.phrase);
                const phraseLang = lesson.targetLanguage.toLowerCase();
                const phraseLangKey = `${phraseLang}_${phraseKey}`;
                const isPhraseSaved = !!(vocab[phraseLangKey] || vocab[phraseKey]);
                const phraseStatus = isPhraseSaved ? (vocab[phraseLangKey] || vocab[phraseKey]).status : "new";
                const isPhraseKnown = phraseStatus === "known" || phraseStatus === "ignored";

                if (showOnlyUnknown && unknownViewMode === "text" && isPhraseKnown) {
                  styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2px] hover:blur-none hover:opacity-100 duration-300`;
                }

                if (isPhraseActive) {
                  styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold shadow-sm`;
                } else if (isPhraseSelected) {
                  styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 shadow-sm`;
                }

                const wordId = `detected-${matchedDetected.phrase}-${tIdx}-${sIdx}-${pIdx}`;

                elements.push(
                  <span key={tIdx} className="inline whitespace-nowrap relative" spellCheck={false}>
                    {prefix && <span className="inline text-inherit select-none pointer-events-none opacity-90 mr-0">{prefix}</span>}
                    <span
                      role="button"
                      tabIndex={0}
                      id={`word-detected-${matchedDetected.phrase}-${tIdx}`}
                      data-token={matchedDetected.phrase}
                      onClick={(e) => handleWordSelect(e, matchedDetected.phrase, matchedDetected.phrase, sentText)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleWordSelect(e as any, matchedDetected.phrase, matchedDetected.phrase, sentText);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (isFloatingModalOpen) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredWordId(wordId);
                        handlePhraseMouseEnter(e, rect, matchedDetected, null);
                      }}
                      onMouseLeave={() => {
                        setHoveredWordId(null);
                        setHoveredWordObj(null);
                      }}
                      className={`reader-word-token ${styleClass} inline-flex items-center cursor-pointer select-text text-[length:inherit]`}
                      style={{ outline: "none" }}
                      spellCheck={false}
                    >
                      {idiomStyle === "badge" ? (
                        <span>{phraseDisplay}</span>
                      ) : (
                        phraseTokens.map((tok, tokIdx) => {
                          if (!tok.isWord) {
                            return <span key={tokIdx} className="opacity-95 select-text inline">{tok.raw}</span>;
                          }
                          const wordStatus = getWordInfo(tok.clean);
                          const resolvedCleanWord = resolveWord(tok.clean);
                          const isWordActive = currentActiveWord?.toLowerCase() === tok.clean.toLowerCase() || currentActiveWord?.toLowerCase() === resolvedCleanWord.toLowerCase();
                          
                          const hasIdiomUnderline = idiomStyle === "underline" || idiomStyle === "hover";
                          let tokenStyleClass = getWordStatusClass(wordStatus, activeSettings.readerTheme, false, true, hasIdiomUnderline);
                          
                          if (isWordActive) {
                            tokenStyleClass = `${tokenStyleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-2 dark:ring-offset-zinc-950 scale-103 duration-150`;
                          }

                          let displayText = tok.raw;
                          if (tokIdx === 0) {
                            displayText = tok.raw.substring(prefix.length);
                          }
                          if (tokIdx === phraseTokens.length - 1) {
                            displayText = tok.raw.substring(0, tok.raw.length - suffix.length);
                          }
                          
                          return (
                            <span key={tokIdx} className={`${tokenStyleClass} inline-block`}>
                              {displayText}
                            </span>
                          );
                        })
                      )}
                      {isIconStyle && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-0.5 text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full font-bold shadow-xs select-none animate-pulse" title="Идиома (ИИ)">
                          ✨
                        </span>
                      )}
                    </span>
                    {suffix && <span className="inline text-inherit select-none pointer-events-none opacity-95 ml-0">{suffix}</span>}
                  </span>
                );

                tIdx = endIndex + 1;
                continue;
              }

              // Normal single word rendering
              const currentWordIdx = wordRenderCount;
              wordRenderCount++;

              const rawString = tok.raw;
              const cleanWord = tok.clean;

              let prefix = "";
              let suffix = "";
              if (!isCjk) {
                const cleanedAtStartIdx = rawString.toLowerCase().indexOf(cleanWord);
                if (cleanedAtStartIdx >= 0) {
                  if (cleanedAtStartIdx > 0) {
                    prefix = rawString.substring(0, cleanedAtStartIdx);
                  }
                  const cleanedAtEndIdx = cleanedAtStartIdx + cleanWord.length;
                  if (cleanedAtEndIdx < rawString.length) {
                    suffix = rawString.substring(cleanedAtEndIdx);
                  }
                }
              }

              const status = getWordInfo(cleanWord);
              const resolvedCleanWord = resolveWord(cleanWord);
              const isSingleActive = currentActiveWord?.toLowerCase() === cleanWord.toLowerCase() || currentActiveWord?.toLowerCase() === resolvedCleanWord.toLowerCase();
              const isInSelectedPhrase = activePhraseTokenRange !== null && tIdx >= activePhraseTokenRange.start && tIdx <= activePhraseTokenRange.end;
              const isActive = isSingleActive || isInSelectedPhrase;

              let isWordActive = false;
              if (
                activeSettings.wordHighlight &&
                isSegmentActive &&
                currentYoutubeTime !== null &&
                currentYoutubeTime !== undefined &&
                segmentWordCount > 0
              ) {
                const segmentStartTime = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : 0;
                let segmentEndTime = segmentStartTime + 10;
                for (let i = globalSegmentIdx + 1; i < segments.length; i++) {
                  if (segments[i].timestamp) {
                    segmentEndTime = parseTimestampToSeconds(segments[i].timestamp!);
                    break;
                  }
                }
                const segmentDuration = Math.max(0.1, segmentEndTime - segmentStartTime);
                const wordDuration = segmentDuration / segmentWordCount;
                const wordStart = segmentStartTime + currentWordIdx * wordDuration;
                const wordEnd = segmentStartTime + (currentWordIdx + 1) * wordDuration;

                isWordActive = currentYoutubeTime >= wordStart && currentYoutubeTime < wordEnd;
              }

              const lang = lesson.targetLanguage.toLowerCase();
              const hasWordLink = !!wordLinks[`${lang}_${cleanWord.toLowerCase()}`];

              let styleClass = getWordStatusClass(status, activeSettings.readerTheme, hasWordLink, false, false, activeSettings.readerViewStyle);
              if ((status === "ignored" || status === "known") && showOnlyUnknown && unknownViewMode === "text") {
                styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2.5px] hover:blur-none hover:opacity-100 duration-300`;
              }

              const isFirstInPhrase = activePhraseTokenRange !== null && tIdx === activePhraseTokenRange.start;
              const isLastInPhrase = activePhraseTokenRange !== null && tIdx === activePhraseTokenRange.end;

              if (isInSelectedPhrase) {
                const phraseRounding = isFirstInPhrase && isLastInPhrase
                  ? "rounded-md"
                  : isFirstInPhrase
                  ? "rounded-l-md rounded-r-none"
                  : isLastInPhrase
                  ? "rounded-r-md rounded-l-none"
                  : "rounded-none";

                // In Badges mode, completely replace any underlying status background & border so phrase is 100% unified
                styleClass = `bg-emerald-300/80 dark:bg-emerald-500/40 text-neutral-900 dark:text-neutral-100 ${phraseRounding} py-0.5 leading-tight transition-colors border-0 border-transparent shadow-none`;
              } else if (isTextMode) {
                if (isWordActive) {
                  styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-amber-500 font-bold bg-amber-500/15 dark:bg-amber-500/25 rounded-xs px-0.5`;
                } else if (isActive) {
                  styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-teal-500 font-bold bg-teal-500/15 dark:bg-teal-500/25 rounded-xs px-0.5`;
                }
              } else {
                if (isWordActive) {
                  styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold shadow-sm`;
                } else if (isActive) {
                  styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 shadow-sm`;
                }
              }

              const wordContent = isCjk ? rawString : (
                prefix.length > 0 || suffix.length > 0
                  ? rawString.substring(prefix.length, rawString.length - suffix.length)
                  : rawString
              );

              const wordId = `${cleanWord}-${tIdx}-${sIdx}-${pIdx}`;

              const paddingClass = isTextMode
                ? ""
                : isInSelectedPhrase
                ? `${isFirstInPhrase ? "pl-1.5" : "pl-0.5"} ${isLastInPhrase ? "pr-1.5" : "pr-0.5"}`
                : `${prefix ? "pl-0.5" : "pl-1"} ${suffix ? "pr-0.5" : "pr-1"}`;

              elements.push(
                <WordToken
                  key={tIdx}
                  wordId={wordId}
                  cleanWord={cleanWord}
                  rawString={rawString}
                  wordContent={wordContent}
                  prefix={prefix}
                  suffix={suffix}
                  status={status || "0"}
                  isActive={isActive}
                  isInSelectedPhrase={isInSelectedPhrase}
                  isFirstInPhrase={isFirstInPhrase}
                  isLastInPhrase={isLastInPhrase}
                  isWordActive={isWordActive}
                  hasWordLink={hasWordLink}
                  isHovered={hoveredWordId === wordId}
                  isTextMode={isTextMode}
                  showOnlyUnknown={showOnlyUnknown}
                  unknownViewMode={unknownViewMode}
                  cjkSpacingClass={getCjkSpacingClass(tIdx)}
                  readerTheme={appearance.readerTheme}
                  onSelect={(e, r, c) => handleWordSelect(e, r, c, sentText)}
                  onKeyDown={(e, r, c) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleWordSelect(e as any, r, c, sentText);
                    }
                  }}
                  onMouseEnter={(e, wid, cWord) => {
                    if (isFloatingModalOpen) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredWordId(wid);

                    const cleanWordLower = cWord.toLowerCase();
                    const lang = lesson.targetLanguage.toLowerCase();
                    const exactVocab = vocab[`${lang}_${cleanWordLower}`] || vocab[cleanWordLower];
                    const key = resolveWord(cWord);
                    const langKey = `${lang}_${key}`;
                    const parentVocab = vocab[langKey] || vocab[key];
                    const lq = exactVocab || parentVocab;
                    
                    const showBelow = rect.bottom < window.innerHeight - 280;
                    const posY = showBelow ? rect.bottom + 6 : rect.top - 6;

                    if (lq) {
                      const rawBaseWord = wordLinks[`${lang}_${cleanWordLower}`] || (wordLinks[cleanWordLower] ? wordLinks[cleanWordLower] : "");
                      const baseWord = rawBaseWord ? rawBaseWord.replace(/^[a-zA-Z]+_/, "") : "";

                      const resolvedDefinition: string =
                        exactVocab?.definition ||
                        (parentVocab && parentVocab !== exactVocab ? parentVocab.definition : undefined) ||
                        "";
                      
                      setHoveredWordObj({
                        word: cWord,
                        parentWord: (baseWord && baseWord.toLowerCase() !== cleanWordLower) ? baseWord : undefined,
                        translation: lq.translation,
                        definition: resolvedDefinition || undefined,
                        tags: lq.tags,
                        grammar: lq.grammar,
                        imageUrl: lq.imageUrl || undefined,
                        x: rect.left + rect.width / 2,
                        y: posY,
                        position: showBelow ? "below" : "above",
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredWordId(null);
                    setHoveredWordObj(null);
                  }}
                />
              );

              tIdx++;
            }

            return elements;
          };

          const renderParagraphContent = () => {
            if (activeSettings.showSentenceTranslations) {
              return sentenceStrings.map((sentText, sIdx) => {
                const cleanSent = sentText.trim();
                const trans = sentenceTranslationsMap[cleanSent] || lesson.sentenceTranslations?.[cleanSent];
                return (
                  <div key={sIdx} className="sentence-block mb-3.5 last:mb-0 space-y-0.5 select-text text-left">
                    <div className="original-text leading-relaxed text-inherit text-[length:inherit] select-text">
                      {renderSentenceTokens(sentText, sIdx)}
                    </div>
                    {trans ? (
                      <p className="translation-text text-xs sm:text-sm text-zinc-500/90 dark:text-zinc-400/85 font-normal leading-snug select-text mt-0.5 tracking-normal">
                        {trans}
                      </p>
                    ) : isTranslatingSentences ? (
                      <span className="inline-block text-[11px] text-zinc-400/60 dark:text-zinc-500/60 italic animate-pulse">
                        ···
                      </span>
                    ) : null}
                  </div>
                );
              });
            }

            return sentenceStrings.map((sentText, sIdx) => {
              const spacingClass = getSentenceSpacingClass(activeSettings.sentenceSpacing);
              return (
                <span key={sIdx} className={spacingClass} spellCheck={false}>
                  {renderSentenceTokens(sentText, sIdx)}
                </span>
              );
            });
          };

          const getSegmentSpacingClass = () => {
            switch (activeSettings.segmentSpacing) {
              case "compact": return "py-0.5 my-0.5";
              case "relaxed": return "py-4 my-2";
              case "loose": return "py-6 my-4";
              case "normal":
              default: return "py-2 my-1";
            }
          };

          const getBookParagraphSpacingClass = () => {
            switch (activeSettings.segmentSpacing) {
              case "compact": return "mb-2 mt-0";
              case "relaxed": return "mb-8 mt-4";
              case "loose": return "mb-12 mt-6";
              case "normal":
              default: return "mb-5 mt-2";
            }
          };

          if (hasTimestamps) {
            const showTs = activeSettings.showTimestamps === undefined ? true : (activeSettings.showTimestamps === "false" ? false : Boolean(activeSettings.showTimestamps));
            // Render beautiful unified line-by-line subtitle transcript layout
            return (
              <div 
                key={pIdx} 
                id={`segment-row-${globalSegmentIdx}`}
                onClick={(e) => {
                  if (!showTs && seg.timestamp && onTimestampClick) {
                    const target = e.target as HTMLElement;
                    if (!target.closest('button') && !target.closest('[role="button"]') && window.getSelection()?.toString().length === 0) {
                      const secs = parseTimestampToSeconds(seg.timestamp);
                      onTimestampClick(secs);
                    }
                  }
                }}
                className={`reader-line-item relative hover:z-20 flex items-baseline ${showTs ? "gap-3 px-3 sm:px-4" : "gap-0 px-2 sm:px-3"} border-l-[3.5px] rounded-r-2xl transition-colors duration-150 ${getSegmentSpacingClass()} ${
                  isSegmentActive 
                    ? "bg-amber-500/8 dark:bg-amber-500/5 border-amber-500 shadow-xs scale-[1.008]" 
                    : "border-transparent hover:bg-zinc-100/30 dark:hover:bg-zinc-800/10"
                } ${!showTs && seg.timestamp ? "cursor-pointer" : ""}`}
              >
                {showTs && (
                  <div className="w-12 sm:w-16 shrink-0 select-none text-left pt-0.5">
                    {seg.timestamp ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (onTimestampClick) {
                            const secs = parseTimestampToSeconds(seg.timestamp);
                            onTimestampClick(secs);
                          }
                        }}
                        className={`font-mono text-xs px-1.5 py-0.5 rounded transition-colors select-none tracking-tight inline-block cursor-pointer ${
                          isSegmentActive
                            ? "text-amber-800 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/40 font-semibold"
                            : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/40 font-normal"
                        }`}
                        title={t('reader.click_to_seek', 'Click to seek video to this timestamp')}
                      >
                        {formatTime(parseTimestampToSeconds(seg.timestamp))}
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-zinc-300 dark:text-zinc-700 select-none">
                        ··
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0 w-full pl-0">
                  <p className="m-0 text-left antialiased text-inherit selection:bg-teal-200 dark:selection:bg-teal-900 w-full">
                    {renderParagraphContent()}
                  </p>
                </div>
              </div>
            );
          } else {
            // Render classic clean book block paragraphs
            const isFirstParagraph = pIdx === 0;
            const isBook = lesson.lessonType === "book";
            const trimmedText = seg.text.trim();

            // ── Article headings (from Readability web import) ─────────────────────
            // ## Heading text ##  →  h2-style (major section)
            // # Heading text #    →  h3-style (sub-section)
            const h2Match = trimmedText.match(/^##\s+(.+?)\s+##$/);
            const h3Match = !h2Match && trimmedText.match(/^#\s+(.+?)\s+#$/);

            if (h2Match || h3Match) {
              const headingInnerText = (h2Match ? h2Match[1] : h3Match![1]).trim();
              const isH2 = Boolean(h2Match);

              // Tokenize the heading text directly so words are clickable
              const headingTokens = segmentSentenceTokens(headingInnerText, lesson.targetLanguage);
              const headingWordNodes = headingTokens.map((tok, tIdx) => {
                if (!tok.isWord) {
                  return <span key={tIdx} className="opacity-90 select-text inline">{tok.raw}</span>;
                }
                const wordKey = `${lesson.targetLanguage.toLowerCase()}_${tok.clean}`;
                const vocabItem = tok.clean ? (vocab[wordKey] || vocab[tok.clean]) : undefined;
                const status = vocabItem?.status;
                // known → muted; 1-5 (learning stages) → amber; new/ignored → default
                const knownClass = status === "known" ? "opacity-60" : (status && ["1","2","3","4","5"].includes(status)) ? "text-amber-600 dark:text-amber-400" : "";
                return (
                  <span
                    key={tIdx}
                    className={`cursor-pointer hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded px-0.5 transition-colors duration-75 select-text inline ${knownClass}`}
                    onClick={() => tok.clean && onWordClick(tok.clean, tok.raw)}
                  >
                    {tok.raw}
                  </span>
                );
              });

              const HeadingTag = isH2 ? "h2" : "h3";
              const headingClass = isH2
                ? "text-xl font-bold mt-8 mb-2 leading-snug tracking-tight text-zinc-900 dark:text-zinc-100 antialiased article-heading-h2"
                : "text-lg font-semibold mt-6 mb-1.5 leading-snug tracking-tight text-zinc-800 dark:text-zinc-200 antialiased article-heading-h3";
              return (
                <HeadingTag
                  key={pIdx}
                  id={`segment-row-${globalSegmentIdx}`}
                  className={headingClass}
                  style={{ textIndent: 0 }}
                >
                  {headingWordNodes}
                </HeadingTag>
              );
            }

            // ── Figure captions from web articles ──────────────────────────────────
            // [CAPTION:Some caption text] or [caption] Some caption text
            const captionMatch = trimmedText.match(/^\[(?:CAPTION:?|caption\])\s*(.+?)(?:\])?$/i);
            if (captionMatch) {
              const captionText = captionMatch[1]
                .replace(/\]$/, "")
                .replace(/^image caption[:,]?\s*/i, "")
                .trim();
              return (
                <figure 
                  key={pIdx}
                  id={`segment-row-${globalSegmentIdx}`}
                  className="my-2 mx-auto max-w-xl flex flex-col items-center clear-both w-full"
                  style={{ textIndent: 0 }}
                >
                  <figcaption className="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1.5 text-center select-none w-full">
                    {captionText}
                  </figcaption>
                </figure>
              );
            }

            const isIntroductionHeading = isBook && /^(?:INTRODUCTION|PREFACE|PROLOGUE|EPILOGUE|ПРЕДИСЛОВИЕ|ВВЕДЕНИЕ|ЭПИЛОГ|DEDICATION|ПОСВЯЩЕНИЕ)$/i.test(trimmedText);
            const bookTitle = (lesson.title || "").trim();

            let strippedHeadingText = trimmedText;
            if (bookTitle && strippedHeadingText.toLowerCase().startsWith(bookTitle.toLowerCase())) {
              strippedHeadingText = strippedHeadingText.substring(bookTitle.length).trim().replace(/^[-:—.\s]+/, "");
            }

            const isChapterHeading = isBook && (
              isIntroductionHeading ||
              /^(?:(?:Chapter|Глава|Section|Часть|Part)\s+[0-9IVXLCDM\w]+|[IVXLCDM]+\.?|CONTENTS)$/i.test(trimmedText) ||
              /^(?:(?:Chapter|Глава|Section|Часть|Part)\s+[0-9IVXLCDM\w]+|[IVXLCDM]+\.?|CONTENTS)$/i.test(strippedHeadingText) ||
              (trimmedText.length < 60 && /^(?:Chapter|Глава|Part|Часть|Section|[IVXLCDM]+\b)/i.test(trimmedText)) ||
              (strippedHeadingText.length < 60 && /^(?:Chapter|Глава|Part|Часть|Section|[IVXLCDM]+\b)/i.test(strippedHeadingText))
            );

            if (isIntroductionHeading) {
              return (
                <h2 
                  key={pIdx} 
                  id={`segment-row-${globalSegmentIdx}`}
                  className="text-center font-bold tracking-widest text-xl my-6 uppercase text-stone-800 dark:text-stone-100 font-serif antialiased select-text"
                  style={{ textIndent: 0 }}
                >
                  {trimmedText}
                </h2>
              );
            }

            if (isChapterHeading) {
              return (
                <h2 
                  key={pIdx} 
                  id={`segment-row-${globalSegmentIdx}`}
                  className="text-center text-2xl font-serif font-bold text-stone-800 dark:text-stone-100 tracking-wider my-6 antialiased select-text"
                  style={{ textIndent: 0 }}
                >
                  {trimmedText}
                </h2>
              );
            }

            if (isDedicationOrTitlePage) {
              return (
                <p 
                  key={pIdx} 
                  id={`segment-row-${globalSegmentIdx}`}
                  className="italic text-stone-600 dark:text-stone-300 font-serif text-lg leading-relaxed text-center my-3 antialiased select-text max-w-xl mx-auto"
                  style={{ textIndent: 0 }}
                >
                  {renderParagraphContent()}
                </p>
              );
            }

            const indentClass = (!hasTimestamps && !activeSettings.showSentenceTranslations && isBook && !isFirstParagraph)
              ? "indent-6"
              : (isBook && isFirstParagraph ? "indent-0" : "");

            return (
              <p 
                key={pIdx} 
                id={`segment-row-${globalSegmentIdx}`}
                className={`reader-line-item paragraph-block ${isBook ? "book-paragraph" : ""} text-left relative hover:z-20 antialiased selection:bg-teal-200 dark:selection:bg-teal-900 transition-colors duration-150 rounded-lg ${getBookParagraphSpacingClass()} ${indentClass} ${
                  isSegmentActive
                    ? "bg-amber-500/8 dark:bg-amber-500/5 border-l-[3px] border-amber-500 pl-3.5 scale-[1.005] py-2"
                    : "border-l-0 pl-0 py-0"
                }`}
                style={isBook ? { textAlign: "left", textIndent: isFirstParagraph ? "0" : "1.5rem" } : undefined}
              >
                {renderParagraphContent()}
              </p>
            );
          }
        })}


        {/* Нижняя чистая панель навигации по страницам */}
        {pages.length > 1 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className={lesson.lessonType === "book" ? "mt-auto w-full select-none" : "mt-6 select-none"}>
            <div className="flex items-center justify-between pt-6 border-t border-neutral-200/60 dark:border-neutral-800/60 select-none">
              <button
                type="button"
                id="reader-prev-page-btn"
                onClick={() => {
                  navigateToPage(Math.max(0, clampedPageIdx - 1));
                  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                }}
                disabled={clampedPageIdx === 0}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                ← {t('reader.prev_page', 'Previous')}
              </button>

              {/* Компактный дропдаун/индикатор текущей страницы */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/60 text-xs text-neutral-600 dark:text-neutral-300 font-sans">
                <span>{t('reader.page', 'Page')}</span>
                <select
                  value={clampedPageIdx + 1}
                  onChange={(e) => {
                    navigateToPage(Number(e.target.value) - 1);
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                  }}
                  className="bg-transparent font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer focus:outline-none"
                >
                  {Array.from({ length: pages.length }, (_, i) => i + 1).map((page) => (
                    <option key={page} value={page} className="dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200">
                      {page}
                    </option>
                  ))}
                </select>
                <span>{t('reader.of', 'of')} {pages.length}</span>
              </div>

              <button
                type="button"
                id="reader-next-page-btn"
                onClick={() => {
                  if (clampedPageIdx >= pages.length - 1) {
                    handleToggleStatus("completed");
                  } else {
                    navigateToPage(clampedPageIdx + 1);
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                  }
                }}
                disabled={clampedPageIdx === pages.length - 1 && currentStatus === "completed"}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors border cursor-pointer ${
                  clampedPageIdx === pages.length - 1
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-850"
                }`}
              >
                {clampedPageIdx >= pages.length - 1 ? t('reader.complete_btn', 'Complete ✓') : `${t('reader.next_page', 'Next')} →`}
              </button>
            </div>
          </div>
        )}

        {lesson.translationText && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/80 pt-5 mt-6">
            <details className="group select-text">
              <summary className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 hover:text-teal-700 cursor-pointer list-none select-none">
                <span className="transition-transform duration-200 group-open:rotate-90 inline-block">▶</span>
                <span>{t('reader.show_full_trans', 'Show story translation')}</span>
              </summary>
              <div className="mt-4 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-100 dark:border-zinc-800/40 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 space-y-4 antialiased whitespace-pre-line font-medium select-text">
                {lesson.translationText}
              </div>
            </details>
          </div>
        )}
      </div>

      {!isFloatingModalOpen && hoveredWordObj && (
        <TooltipPortal
          x={hoveredWordObj.x}
          y={hoveredWordObj.y}
          position={hoveredWordObj.position || "above"}
        >
          {hoveredWordObj.phraseText ? (
            <div className="flex flex-col gap-1.5 pb-1">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/60 pb-1.5">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 capitalize truncate">
                    📖 {hoveredWordObj.phraseText}
                  </span>
                </div>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded leading-none shrink-0 ${
                  hoveredWordObj.phraseStatus === "1" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-100/50 dark:border-rose-900/40" :
                  hoveredWordObj.phraseStatus === "2" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/40" :
                  hoveredWordObj.phraseStatus === "3" || (hoveredWordObj.phraseStatus as any) === "learning" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/40" :
                  hoveredWordObj.phraseStatus === "4" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/40" :
                  hoveredWordObj.phraseStatus === "5" ? "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-100/50 dark:border-purple-900/40" :
                  "bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}>
                  Status: {hoveredWordObj.phraseStatus || "new"}
                </span>
              </div>
              {hoveredWordObj.phraseDefinition && (
                <div className="text-[10px] italic text-zinc-500 dark:text-zinc-400 leading-snug break-words whitespace-pre-wrap bg-teal-50/40 dark:bg-teal-950/20 px-2 py-1.5 rounded-lg border border-teal-100/40 dark:border-teal-900/30">
                  <span className="not-italic mr-1 opacity-60">📖</span>{hoveredWordObj.phraseDefinition}
                </div>
              )}
              {(() => {
                const rawTrans = (hoveredWordObj.phraseTranslation || "").trim();
                const isValidTrans = rawTrans && rawTrans !== "Pending translation" && !rawTrans.startsWith("[");
                if (isValidTrans) {
                  return (
                    <div className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug break-words whitespace-pre-wrap font-semibold bg-amber-500/5 dark:bg-amber-400/5 p-2 rounded-lg border border-amber-500/15 dark:border-amber-400/15">
                      {normalizeTranslationSemicolons(rawTrans)}
                    </div>
                  );
                }
                if (!hoveredWordObj.phraseDefinition) {
                  return (
                    <div className="text-[10.5px] italic text-zinc-400 dark:text-zinc-500 leading-snug px-1 pb-0.5">
                      {t('reader.no_translation_yet', '— No translation yet')}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ) : null}

          {hoveredWordObj.detectedPhraseText ? (
            <div className="flex flex-col gap-1.5 pb-1">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/60 pb-1.5">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-extrabold text-purple-600 dark:text-purple-400 capitalize truncate">
                    ✨ {hoveredWordObj.detectedPhraseText}
                  </span>
                </div>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded leading-none shrink-0 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-100/50 dark:border-purple-900/40 animate-pulse">
                  {getPhraseTypeLabel(hoveredWordObj.detectedPhraseType, t)} (AI)
                </span>
              </div>
              {hoveredWordObj.detectedPhraseTranslation && (
                <div className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug break-words whitespace-pre-wrap font-semibold bg-purple-500/5 dark:bg-purple-400/5 p-2 rounded-lg border border-purple-500/15 dark:border-purple-400/15">
                  {normalizeTranslationSemicolons(hoveredWordObj.detectedPhraseTranslation)}
                </div>
              )}
              {hoveredWordObj.detectedPhraseExplanation && (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal italic px-1 break-words whitespace-pre-wrap">
                  {hoveredWordObj.detectedPhraseExplanation}
                </div>
              )}
            </div>
          ) : null}

          {hoveredWordObj.word ? (
            <div className={`flex flex-col gap-1.5 ${(hoveredWordObj.phraseText || hoveredWordObj.detectedPhraseText) ? "mt-1 pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-800/80" : ""}`}>
              <div className="flex items-center justify-between gap-2 pb-1.5">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 capitalize truncate">
                    {hoveredWordObj.word}
                  </span>
                  {hoveredWordObj.parentWord && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium lowercase italic">
                      ({hoveredWordObj.parentWord})
                    </span>
                  )}
                </div>
                
                {((hoveredWordObj.tags && hoveredWordObj.tags.length > 0) || hoveredWordObj.grammar) && (
                  <div className="flex gap-1 shrink-0">
                    {hoveredWordObj.tags && hoveredWordObj.tags.length > 0 ? (
                      hoveredWordObj.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-extrabold px-1.5 py-0.5 rounded border border-teal-100/50 dark:border-teal-900/40 leading-none"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-[9px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-extrabold px-1.5 py-0.5 rounded border border-teal-100/50 dark:border-teal-900/40 leading-none">
                        {hoveredWordObj.grammar}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {hoveredWordObj.imageUrl && (
                <div className="w-full max-h-40 min-h-[96px] overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950 flex items-center justify-center p-1 shrink-0">
                  <img
                    src={hoveredWordObj.imageUrl}
                    alt={hoveredWordObj.word}
                    className="max-h-36 max-w-full w-auto h-auto object-contain rounded-md"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              {hoveredWordObj.definition && (
                <div className="text-[10px] italic text-zinc-500 dark:text-zinc-400 leading-snug break-words whitespace-pre-wrap bg-teal-50/40 dark:bg-teal-950/20 px-2 py-1.5 rounded-lg border border-teal-100/40 dark:border-teal-900/30">
                  <span className="not-italic mr-1 opacity-60">📖</span>{hoveredWordObj.definition}
                </div>
              )}

              {(() => {
                const rawTrans = (hoveredWordObj.translation || "").trim();
                const isValidTrans = rawTrans && rawTrans !== "Pending translation" && !rawTrans.startsWith("[");
                if (isValidTrans) {
                  return (
                    <div className="text-[11px] text-zinc-650 dark:text-zinc-300 leading-snug break-words whitespace-pre-wrap font-medium">
                      {normalizeTranslationSemicolons(rawTrans)}
                    </div>
                  );
                }
                // If there is neither a definition nor a valid translation, render a subtle localized hint
                if (!hoveredWordObj.definition) {
                  return (
                    <div className="text-[10.5px] italic text-zinc-400 dark:text-zinc-500 leading-snug">
                      {t('reader.no_translation_yet', '— No translation yet')}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ) : null}
        </TooltipPortal>
      )}

      {/* Toast Notification for Status/Time updates */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-zinc-700 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200 font-sans">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal for adding custom reading time */}
      {isCustomTimeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  {t('reader.add_reading_time', 'Add Reading Time')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomTimeModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomTime} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('reader.minutes_count', 'Number of minutes')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="600"
                  required
                  value={customMinutesInput}
                  onChange={(e) => setCustomMinutesInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('reader.note_optional', 'Note (optional)')}
                </label>
                <input
                  type="text"
                  placeholder={t('reader.note_placeholder', 'E.g.: Chapter 3...')}
                  value={customNotesInput}
                  onChange={(e) => setCustomNotesInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomTimeModalOpen(false)}
                  className="px-3 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-xl transition-colors cursor-pointer"
                >
                  {t('reader.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-97 cursor-pointer"
                >
                  {t('reader.add_to_history', 'Add to History')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table of Contents Drawer */}
      <BookTocDrawer
        isOpen={isTocOpen}
        onClose={() => setIsTocOpen(false)}
        tocEntries={tocEntries}
        currentPageIdx={clampedPageIdx}
        onSelectPage={(pageIdx) => {
          navigateToPage(pageIdx);
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }}
        totalPages={pages.length}
        bookTitle={lesson.title}
      />
    </div>
  );
}

export default memo(ReaderPanel);
