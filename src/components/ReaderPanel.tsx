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
} from "lucide-react";
import { getDifficultyBadgeStyles } from "./LibraryHome";
import { useReaderHistory } from "../hooks/useReaderHistory";
import { TooltipPortal } from "./TooltipPortal";
import ReaderUnknownWordsList from "./ReaderUnknownWordsList";
import { Lesson, VocabItem, WordStatus, ReaderSettings, HistoryEntry } from "../types";
import { segmentSentenceTokens } from "../tokenizer";
import { useReaderPagination, TextSegment, parseTimestampToSeconds, splitIntoSentences } from "../hooks/useReaderPagination";
import { useTranslation } from "react-i18next";
import { ignoreListManager } from "../services/ignoreListService";
import { compareWords } from "../utils/stringUtils";
import { loadLessonTranslationsFromDb, fetchMissingSentenceTranslations } from "../services/sentenceTranslationService";
import { useUIStore } from "../store/uiStore";
import { useSettingsStore } from "../store/settingsStore";

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
  onEditClick?: () => void;
  currentYoutubeTime?: number | null;
  onTimestampClick?: (seconds: number) => void;
  showOnlyUnknown?: boolean;
  history?: HistoryEntry[];
  onUpdateHistory?: (updatedHistory: HistoryEntry[]) => void;
  /** When true, hides the title/badges/status header (used in Focus Mode) */
  hideMeta?: boolean;
  onToggleTranslations?: () => void;
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
    container: "bg-[#faf9f6] dark:bg-zinc-900 text-[#292524] dark:text-zinc-200 border-stone-200/70 dark:border-zinc-800/80 shadow-md",
    barBg: "bg-transparent",
    pillBg: "bg-transparent text-[#292524] dark:text-zinc-200",
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
    subBadgeBg: "bg-slate-200/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300",
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

  // ── Badges / Tiles Mode (Original with colored background pills) ────
  const baseRounding = isPhrase ? "rounded px-1" : "rounded-md px-1 py-[1.5px]";

  if (status === "ignored" || status === "known") {
    return `hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 text-inherit cursor-pointer ${baseRounding} transition-colors font-normal`;
  }

  if (status === "1") {
    const borderClass = hasIdiomUnderline ? "" : "border-b-2 border-[#f3a4b0] dark:border-rose-500/80";
    return `bg-[#f3a4b0]/45 dark:bg-rose-950/60 hover:bg-[#f3a4b0]/70 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "2") {
    const borderClass = hasIdiomUnderline ? "" : "border-b-2 border-[#f0d46d] dark:border-amber-400/80";
    return `bg-[#f0d46d]/45 dark:bg-amber-950/60 hover:bg-[#f0d46d]/70 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "3" || (status as any) === "learning") {
    const borderClass = hasIdiomUnderline ? "" : "border-b-2 border-[#a6d896] dark:border-emerald-400/80";
    return `bg-[#a6d896]/45 dark:bg-emerald-950/60 hover:bg-[#a6d896]/70 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 ${baseRounding} font-medium ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "4") {
    const borderClass = hasIdiomUnderline ? "" : "border-b-2 border-[#204bf4] dark:border-blue-400/80";
    return `bg-[#99bce8] dark:bg-blue-950/60 hover:bg-[#86b0e3] dark:hover:bg-blue-900/60 text-blue-950 dark:text-blue-300 ${baseRounding} font-semibold ${borderClass} cursor-pointer transition-colors`;
  }

  if (status === "5") {
    const borderClass = hasIdiomUnderline ? "" : "border-b-2 border-[#a882dd] dark:border-purple-400/80";
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
  onEditClick,
  currentYoutubeTime,
  onTimestampClick,
  showOnlyUnknown = false,
  history,
  onUpdateHistory,
  hideMeta = false,
  onToggleTranslations,
}: ReaderPanelProps) {
  const { t } = useTranslation();
  const {
    isFocusMode,
    setIsFocusMode,
    setShowMatchPairsModal,
    showOnlyUnknown: storeShowOnlyUnknown,
    setShowOnlyUnknown: storeSetShowOnlyUnknown,
    showYoutubePlayer,
    setShowYoutubePlayer,
  } = useUIStore();
  const { wordCardMode: storeCardMode } = useSettingsStore();
  const wordCardMode = settings?.wordCardMode || storeCardMode || "full-inspector";
  const isCalmSheet = wordCardMode === "calm-sheet";
  const isFloatingModalOpen = isCalmSheet && Boolean(activeWord);

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
    () => lesson.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " "),
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

  const [isPageSelectOpen, setIsPageSelectOpen] = useState(false);
  const pageSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageSelectRef.current && !pageSelectRef.current.contains(e.target as Node)) {
        setIsPageSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if text is mostly East Asian (at least 30% CJK characters)
  const isCjk = useMemo(() => {
    if (!textForSearch) return false;
    const cjkChars = (textForSearch.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const totalChars = textForSearch.replace(/\s/g, '').length;
    return totalChars > 0 && (cjkChars / totalChars) > 0.3;
  }, [textForSearch]);

  const activeSettings = useMemo<Required<ReaderSettings>>(() => {
    return {
      fontSize: settings?.fontSize || "lg",
      lineHeight: settings?.lineHeight || "loose",
      fontFamily: settings?.fontFamily || "sans",
      readerTheme: settings?.readerTheme || "default",
      maxWidth: settings?.maxWidth || "wide",
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
      readerViewStyle: settings?.readerViewStyle || "badges",
    };
  }, [settings]);

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
    hasTimestamps
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

  // Handle multi-word text drag selection (phrases & idioms)
  const handleTextSelection = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection) return;
    const selectedText = selection.toString().replace(/\s+/g, " ").trim();
    
    // Validate bounds
    if (!selectedText) return;
    if (selectedText.length <= 1 && !isCjk) return;
    if (selectedText.length > 1000) return;
    
    // For spaced languages, single-word selections are handled directly by token click.
    // If it's a multi-word drag, let's catch it!
    const wordCount = selectedText.split(/\s+/).filter(Boolean).length;
    if (!isCjk && wordCount <= 1) {
      return; 
    }

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
        associatedSentence = sentences.find((s) => s.includes(selectedText)) || fullPara;
      }
    }

    onWordClick(selectedText, associatedSentence.trim() || selectedText);
  };

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
    const cleanText = lesson.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ");
    
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

  const handleWordSelect = (e: React.MouseEvent | undefined, rawToken: string, cleanWord: string, fullPara: string) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const key = resolveWord(cleanWord);
    const sentences = splitIntoSentences(fullPara, isCjk);
    const associatedSentence = sentences.find((s) => s.includes(rawToken)) || fullPara;
    setHoveredWordObj(null);
    setHoveredWordId(null, isCjk);
    const targetEl = (e?.currentTarget as HTMLElement) || null;
    onWordClick(cleanWord, associatedSentence.trim(), targetEl);
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

  const currentTheme = themeMap[activeSettings.readerTheme] || themeMap.default;
  const isMediaLesson = !!lesson.youtubeId || lesson.lessonType === "youtube" || lesson.lessonType === "podcast" || !!lesson.audioUrl || !!(lesson as any).audioFile || !!(lesson as any).audio;

  return (
    <div id="reader-top" className={`relative rounded-3xl ${hideMeta ? "border shadow-md p-6 sm:p-10 space-y-4 sm:space-y-6" : "border shadow-sm p-3.5 sm:p-6 lg:p-8 space-y-3 sm:space-y-6"} transition-colors duration-200 overflow-hidden ${currentTheme.container}`}>
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
              {activeSettings.toolbarVisibility?.showTranslation !== false && (
                <button
                  type="button"
                  onClick={onToggleTranslations}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    activeSettings.showSentenceTranslations
                      ? "text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-400/10 border border-teal-500/30 shadow-3xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5"
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
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                  title={t("reader.focus_btn", "Режим фокуса")}
                >
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* 3. Play: Match Pairs */}
              {activeSettings.toolbarVisibility?.showPlayPairs !== false && (
                <button
                  type="button"
                  onClick={() => setShowMatchPairsModal(true)}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                  title={t("reader.unknown_btn_title", "Только неизвестные слова")}
                >
                  {(storeShowOnlyUnknown || showOnlyUnknown) ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              )}

              {/* 5. Video */}
              {activeSettings.toolbarVisibility?.showVideoToggle !== false && lesson.youtubeId && (
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
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                  title={t("reader.video_btn_title", "Видео")}
                >
                  <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}
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
        onMouseUp={handleTextSelection}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`prose max-w-none space-y-5 text-left antialiased tracking-normal leading-relaxed ${fontFamilyMap[activeSettings.fontFamily]} ${fontSizeMap[activeSettings.fontSize]} ${lineHeightMap[activeSettings.lineHeight]} ${widthMap[activeSettings.maxWidth]}`}
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
          const globalSegmentIdx = segments.indexOf(seg);
          const isSegmentActive = globalSegmentIdx === activeSegmentIndex && activeSegmentIndex >= 0;

          // Check if we should split by sentence
          const sentenceStrings = (activeSettings.sentenceSpacing && activeSettings.sentenceSpacing !== "normal")
            ? splitIntoSentences(seg.text, isCjk)
            : [seg.text];

          // Precalculate total words in this segment for word-by-word highlight
          const segmentWordCount = (() => {
            if (!activeSettings.wordHighlight || !isSegmentActive) return 0;
            let count = 0;
            sentenceStrings.forEach((sentText, isCjk) => {
              const tokens = segmentSentenceTokens(sentText, lesson.targetLanguage);
              count += tokens.filter((t) => t.isWord).length;
            });
            return count;
          })();
          let wordRenderCount = 0;

          // Check if this segment represents an inline image placeholder
          const isImage = /^\[IMG(?:_REF)?:/.test(seg.text) && seg.text.endsWith("]");
          if (isImage) {
            try {
              const payload = seg.text.startsWith("[IMG_REF:")
                ? seg.text.substring(9, seg.text.length - 1)
                : seg.text.substring(5, seg.text.length - 1);
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
                const resolved = lessonImagesMap?.[dataUrl];
                if (!resolved) return null;
                dataUrl = resolved;
              } else if (seg.text.startsWith("[IMG_REF:")) {
                return null;
              }

              if (!dataUrl.startsWith("data:image/")) return null;

              const containerStyle: React.CSSProperties = {
                maxWidth: "100%",
                margin: "1.5rem auto",
                display: "flex",
                justifyContent: "center",
                flexDirection: "column",
                alignItems: "center",
              };

              const imgStyle: React.CSSProperties = {
                maxHeight: "450px",
                objectFit: "contain",
              };

              if (width) {
                imgStyle.width = width.match(/^\d+$/) ? `${width}px` : width;
              } else {
                imgStyle.width = "auto";
              }

              if (height) {
                imgStyle.height = height.match(/^\d+$/) ? `${height}px` : height;
              } else {
                imgStyle.height = "auto";
              }

              return (
                <div 
                  key={pIdx} 
                  style={containerStyle} 
                  className="my-6 p-2 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-800/40 shadow-xs flex flex-col items-center select-none"
                >
                  <img 
                    src={dataUrl} 
                    style={imgStyle} 
                    className="rounded-xl shadow-xs max-w-full" 
                    alt={t('reader.illustration', 'Illustration')} 
                    referrerPolicy="no-referrer"
                    id={`pdf-epub-img-${pIdx}`}
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

            while (tIdx < tokens.length) {
              const tok = tokens[tIdx];

              if (!tok.isWord) {
                elements.push(<span key={`nonword-${tIdx}`} className="opacity-95">{tok.raw}</span>);
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

                const isPhraseSelected = activeWord?.toLowerCase() === matchedPhrase.phrase.toLowerCase();

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

                const status = matchedPhrase.vocabItem.status;
                let styleClass = "";

                if (isTextMode) {
                  const textColorClass =
                    status === "1" ? "text-rose-600 dark:text-rose-400 font-semibold" :
                    status === "2" ? "text-amber-600 dark:text-amber-400 font-semibold" :
                    (status === "3" || (status as any) === "learning") ? "text-emerald-600 dark:text-emerald-400 font-medium" :
                    status === "4" ? "text-blue-600 dark:text-blue-400 font-semibold" :
                    status === "5" ? "text-purple-600 dark:text-purple-400 font-semibold" :
                    (status === "ignored" || status === "known") ? "text-inherit font-normal" :
                    "text-sky-600 dark:text-sky-400 font-medium";

                  styleClass = `${textColorClass} border-b-2 border-dashed ${getPhraseBorderColorClass(status)} hover:underline cursor-pointer transition-colors`;
                  if (showOnlyUnknown && unknownViewMode === "text" && (status === "ignored" || status === "known")) {
                    styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2px] hover:blur-none hover:opacity-100 duration-300`;
                  }
                  if (isPhraseActive) {
                    styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-amber-500 font-bold bg-amber-500/15 dark:bg-amber-500/25 rounded-xs px-0.5`;
                  } else if (isPhraseSelected) {
                    styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-teal-500 font-bold bg-teal-500/15 dark:bg-teal-500/25 rounded-xs px-0.5`;
                  }
                } else {
                  const borderClass = `border-b-2 border-dashed ${getPhraseBorderColorClass(status)}`;

                  if (status === "ignored" || status === "known") {
                    styleClass = `hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 text-inherit cursor-pointer rounded px-1 transition-colors font-normal ${borderClass}`;
                    if (showOnlyUnknown && unknownViewMode === "text") {
                      styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2px] hover:blur-none hover:opacity-100 duration-300`;
                    }
                  } else if (status === "1") {
                    styleClass = `bg-[#f3a4b0]/45 dark:bg-rose-950/60 hover:bg-[#f3a4b0]/70 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-300 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "2") {
                    styleClass = `bg-[#f0d46d]/45 dark:bg-amber-950/60 hover:bg-[#f0d46d]/70 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "3" || (status as any) === "learning") {
                    styleClass = `bg-[#a6d896]/45 dark:bg-emerald-950/60 hover:bg-[#a6d896]/70 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 rounded px-1.5 font-medium ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "4") {
                    styleClass = `bg-[#99bce8] dark:bg-blue-950/60 hover:bg-[#86b0e3] dark:hover:bg-blue-900/60 text-blue-950 dark:text-blue-300 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                  } else if (status === "5") {
                    styleClass = `bg-[#c5aee2] dark:bg-purple-950/60 hover:bg-[#b096d2] dark:hover:bg-purple-900/60 text-purple-950 dark:text-purple-300 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                  }

                  if (isPhraseActive) {
                    styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold scale-103 shadow-md duration-150`;
                  } else if (isPhraseSelected) {
                    styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 scale-102 duration-150`;
                  }
                }

                const wordId = `phrase-${matchedPhrase.phrase}-${tIdx}-${sIdx}-${pIdx}`;

                elements.push(
                  <span key={tIdx} className={`inline-flex items-baseline relative ${hoveredWordId === wordId ? "z-50" : ""}`} spellCheck={false}>
                    {prefix && <span className="opacity-80 select-none">{prefix}</span>}
                    <button
                      id={`word-phrase-${matchedPhrase.phrase}-${tIdx}`}
                      onClick={(e) => handleWordSelect(e, matchedPhrase.phrase, matchedPhrase.phrase, sentText)}
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
                      className={`${styleClass} ${isTextMode ? "inline" : "inline-block"} select-text font-inherit`}
                      style={{ outline: "none" }}
                      spellCheck={false}
                    >
                      {phraseDisplay}
                    </button>
                    {suffix && <span className="opacity-80 select-none">{suffix}</span>}
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

                const isPhraseSelected = activeWord?.toLowerCase() === matchedDetected.phrase.toLowerCase();

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
                  styleClass = "bg-purple-100/70 border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800 text-purple-950 dark:text-purple-300 font-semibold hover:bg-purple-200/80 dark:hover:bg-purple-900/50 cursor-pointer rounded-lg px-1.5 py-0.5 mx-0.5 transition-all";
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
                  styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold scale-103 shadow-md duration-150`;
                } else if (isPhraseSelected) {
                  styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 scale-102 duration-150`;
                }

                const wordId = `detected-${matchedDetected.phrase}-${tIdx}-${sIdx}-${pIdx}`;

                elements.push(
                  <span key={tIdx} className={`inline-flex items-baseline relative ${hoveredWordId === wordId ? "z-50" : ""}`} spellCheck={false}>
                    {prefix && <span className="opacity-80 select-none">{prefix}</span>}
                    <button
                      id={`word-detected-${matchedDetected.phrase}-${tIdx}`}
                      onClick={(e) => handleWordSelect(e, matchedDetected.phrase, matchedDetected.phrase, sentText)}
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
                      className={`${styleClass} inline-flex items-center select-text font-inherit`}
                      style={{ outline: "none" }}
                      spellCheck={false}
                    >
                      {idiomStyle === "badge" ? (
                        <span>{phraseDisplay}</span>
                      ) : (
                        phraseTokens.map((tok, tokIdx) => {
                          if (!tok.isWord) {
                            return <span key={tokIdx} className="opacity-95">{tok.raw}</span>;
                          }
                          const wordStatus = getWordInfo(tok.clean);
                          const resolvedCleanWord = resolveWord(tok.clean);
                          const isWordActive = activeWord?.toLowerCase() === tok.clean.toLowerCase() || activeWord?.toLowerCase() === resolvedCleanWord.toLowerCase();
                          
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
                    </button>
                    {suffix && <span className="opacity-80 select-none">{suffix}</span>}
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
              const isActive = activeWord?.toLowerCase() === cleanWord.toLowerCase() || activeWord?.toLowerCase() === resolvedCleanWord.toLowerCase();

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

              if (isTextMode) {
                if (isWordActive) {
                  styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-amber-500 font-bold bg-amber-500/15 dark:bg-amber-500/25 rounded-xs px-0.5`;
                } else if (isActive) {
                  styleClass = `${styleClass} underline decoration-2 underline-offset-4 decoration-teal-500 font-bold bg-teal-500/15 dark:bg-teal-500/25 rounded-xs px-0.5`;
                }
              } else {
                if (isWordActive) {
                  styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold scale-105 shadow-md duration-150`;
                } else if (isActive) {
                  styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-2 dark:ring-offset-zinc-950 scale-103 duration-150`;
                }
              }

              const wordContent = isCjk ? rawString : (
                prefix.length > 0 || suffix.length > 0
                  ? rawString.substring(prefix.length, rawString.length - suffix.length)
                  : rawString
              );

              const wordId = `${cleanWord}-${tIdx}-${sIdx}-${pIdx}`;

              elements.push(
                <span key={tIdx} className={`inline-flex items-baseline relative ${isTextMode ? "" : "my-[2px] py-[0.5px]"} ${hoveredWordId === wordId ? "z-50" : ""}`} spellCheck={false}>
                  {prefix && <span className="opacity-80 select-none">{prefix}</span>}
                  <button
                    type="button"
                    id={`word-${cleanWord}-${tIdx}`}
                    onClick={(e) => handleWordSelect(e, rawString, cleanWord, sentText)}
                    onMouseEnter={(e) => {
                      if (isFloatingModalOpen) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredWordId(wordId);

                      const cleanWordLower = cleanWord.toLowerCase();
                      const lang = lesson.targetLanguage.toLowerCase();
                      const exactVocab = vocab[`${lang}_${cleanWordLower}`] || vocab[cleanWordLower];
                      const key = resolveWord(cleanWord);
                      const langKey = `${lang}_${key}`;
                      const parentVocab = vocab[langKey] || vocab[key];
                      const lq = exactVocab || parentVocab;
                      
                      const showBelow = rect.bottom < window.innerHeight - 280;
                      const posY = showBelow ? rect.bottom + 6 : rect.top - 6;

                      if (lq) {
                        const rawBaseWord = wordLinks[`${lang}_${cleanWordLower}`] || (wordLinks[cleanWordLower] ? wordLinks[cleanWordLower] : "");
                        const baseWord = rawBaseWord ? rawBaseWord.replace(/^[a-zA-Z]+_/, "") : "";

                        // Resolve definition: own entry first, then parent entry
                        const resolvedDefinition: string =
                          exactVocab?.definition ||
                          (parentVocab && parentVocab !== exactVocab ? parentVocab.definition : undefined) ||
                          "";
                        
                        setHoveredWordObj({
                          word: cleanWord,
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
                    className={`${styleClass} inline-block select-text font-inherit`}
                    style={{ outline: "none" }}
                    spellCheck={false}
                  >
                    {wordContent}
                  </button>
                  {suffix && <span className="opacity-80 select-none">{suffix}</span>}
                </span>
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
                    <div className="original-text leading-relaxed text-inherit font-inherit select-text">
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
            // Render beautiful unified line-by-line subtitle transcript layout exactly like screenshot 1
            return (
              <div 
                key={pIdx} 
                id={`segment-row-${globalSegmentIdx}`}
                className={`reader-line-item relative hover:z-20 flex items-baseline gap-3 px-3 sm:px-4 border-l-[3.5px] rounded-r-2xl transition-all duration-300 ${getSegmentSpacingClass()} ${
                  isSegmentActive 
                    ? "bg-amber-500/8 dark:bg-amber-500/5 border-amber-500 shadow-xs scale-[1.008]" 
                    : "border-transparent hover:bg-zinc-100/30 dark:hover:bg-zinc-800/10"
                }`}
              >
                <div className="w-12 sm:w-16 shrink-0 select-none text-left">
                  {seg.timestamp ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (onTimestampClick) {
                          const secs = parseTimestampToSeconds(seg.timestamp);
                          onTimestampClick(secs);
                        }
                      }}
                      className={`text-xs sm:text-sm font-semibold font-mono tracking-tight transition-all cursor-pointer rounded-md px-1.5 py-0.5 hover:scale-105 active:scale-95 inline-block ${
                        isSegmentActive
                          ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-950 shadow-xs font-bold"
                          : "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/45"
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
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-left antialiased text-inherit selection:bg-teal-200 dark:selection:bg-teal-900 text-sm sm:text-base">
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
            const isChapterHeading = isBook && /^(?:(?:Chapter|Глава|Section|Часть|Part)\s+[0-9IVXLCDM]+|[IVXLCDM]+\.?|PROLOGUE|EPILOGUE|ПРЕДИСЛОВИЕ|ЭПИЛОГ)$/i.test(trimmedText);

            const indentClass = (!hasTimestamps && !activeSettings.showSentenceTranslations && isBook && !isFirstParagraph && !isChapterHeading)
              ? "indent-6"
              : (isBook && (isFirstParagraph || isChapterHeading) ? "indent-0" : "");

            return (
              <p 
                key={pIdx} 
                id={`segment-row-${globalSegmentIdx}`}
                className={`reader-line-item paragraph-block ${isBook ? "book-paragraph" : ""} ${isChapterHeading ? "text-center font-bold text-lg sm:text-xl py-4 tracking-wider uppercase opacity-90" : "text-left"} relative hover:z-20 antialiased selection:bg-teal-200 dark:selection:bg-teal-900 transition-all duration-300 rounded-lg ${getBookParagraphSpacingClass()} ${indentClass} ${
                  isSegmentActive
                    ? "bg-amber-500/8 dark:bg-amber-500/5 border-l-[3px] border-amber-500 pl-3.5 scale-[1.005] py-2"
                    : "border-l-0 pl-0 py-0"
                }`}
                style={isBook ? { textAlign: isChapterHeading ? "center" : "left", textIndent: (isFirstParagraph || isChapterHeading) ? "0" : "1.5rem" } : undefined}
              >
                {renderParagraphContent()}
              </p>
            );
          }
        })}

        {/* Active saved Phrases and Idioms shelf */}
        {activePhrasesInLesson.length > 0 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 mt-6 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 block">
              {t('reader.saved_phrases_title', 'Saved Phrases in Chapter')} ({activePhrasesInLesson.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {activePhrasesInLesson.map((phrase, pIdx) => {
                const details = phrasesMap[phrase.toLowerCase()];
                if (!details) return null;
                const isSaved = (userPhrases || []).includes(phrase.toLowerCase());
                return (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => onWordClick && onWordClick(phrase, details.targetWord || phrase)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-teal-500/10 dark:bg-teal-400/10 text-teal-800 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/20 dark:hover:bg-teal-400/20 transition-all cursor-pointer select-none"
                    title={details.meaning}
                  >
                    <span>{isSaved ? `📖 ${phrase}` : `✨ ${phrase}`}</span>
                    <span className="text-[8px] opacity-75 font-normal px-1 rounded-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 uppercase tracking-wider">
                      {getPhraseTypeLabel(details.type, t).toLowerCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Auto-detected Phrases and Idioms shelf */}
        {lesson.detectedPhrases && Object.keys(lesson.detectedPhrases).length > 0 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 mt-4 space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
              {t('reader.ai_detected_idioms', 'AI Detected Idioms')} ({Object.keys(lesson.detectedPhrases).length})
            </h4>
            <div className="flex flex-wrap gap-1.5 animate-in fade-in duration-200">
              {Object.entries(lesson.detectedPhrases).map(([phrase, details]) => {
                const key = resolveWord(phrase);
                const lang = lesson.targetLanguage.toLowerCase();
                const langKey = `${lang}_${key}`;
                const isSaved = !!(vocab[langKey] || vocab[key]);

                return (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => onWordClick(phrase, lesson.text)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shrink-0 active:scale-97 hover:brightness-95 ${
                      isSaved
                        ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/10 dark:text-amber-400"
                        : "border border-purple-200 bg-purple-55 text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-400"
                    }`}
                    title={`[${getPhraseTypeLabel(details.type, t)}] ${details.translation}: ${details.explanation}`}
                  >
                    <span>{isSaved ? `📖 ${phrase}` : `✨ ${phrase}`}</span>
                    <span className="text-[8px] opacity-75 font-normal px-1 rounded-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 uppercase tracking-wider">
                      {getPhraseTypeLabel(details.type, t).toLowerCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Beautiful Pagination HUD bar custom control */}
        {pages.length > 1 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className={`border-t ${currentTheme.divider} pt-5 mt-6 space-y-4`}>
            {/* Quick jump timeline slider row (non-book or when many pages) */}
            {lesson.lessonType !== "book" && (
              <div className={`flex items-center justify-between gap-3 ${currentTheme.barBg} p-2.5 rounded-xl`}>
                <span className={`text-[10px] font-black uppercase tracking-wider ${currentTheme.subText} shrink-0`}>
                  {t('reader.fast_jump', 'Fast Jump:')}
                </span>
                <div className="flex-grow flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                  {pages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        navigateToPage(i);
                      }}
                      className={`min-w-[28px] h-7 px-1.5 text-[10px] font-black font-mono rounded-lg transition-all cursor-pointer ${
                        i === clampedPageIdx
                          ? "bg-teal-600 text-white shadow-sm ring-1 ring-teal-400 scale-105"
                          : `${currentTheme.pillBg} hover:opacity-80`
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lesson.lessonType === "book" ? (
              /* Immersive Book Mode Paginator */
              <div className="flex items-center justify-between gap-2 max-w-sm mx-auto py-2 select-none">
                <button
                  type="button"
                  id="reader-prev-page-btn"
                  disabled={clampedPageIdx === 0}
                  onClick={() => {
                    navigateToPage(Math.max(0, clampedPageIdx - 1));
                  }}
                  className={`px-4 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 ${currentTheme.subText} hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-full text-xs font-serif font-medium transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer`}
                >
                  ‹ {t('reader.prev_page', 'Предыдущая')}
                </button>

                <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ${currentTheme.pillBg} text-xs font-serif`}>
                  <span className={`${currentTheme.subText}`}>
                    {t('reader.page', 'Страница')}
                  </span>
                  <div className="relative" ref={pageSelectRef}>
                    <button
                      type="button"
                      id="page-jump-select-btn"
                      onClick={() => setIsPageSelectOpen(!isPageSelectOpen)}
                      className={`flex items-center gap-0.5 font-bold font-mono ${currentTheme.activeText} hover:opacity-80 transition-opacity cursor-pointer`}
                    >
                      <span>{clampedPageIdx + 1}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isPageSelectOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isPageSelectOpen && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-28 max-h-56 overflow-y-auto bg-stone-50 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl shadow-xl z-[9999] py-1 text-center font-serif text-xs">
                        {pages.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              navigateToPage(i);
                              setIsPageSelectOpen(false);
                            }}
                            className={`w-full px-2 py-1.5 text-center transition-colors cursor-pointer ${
                              i === clampedPageIdx
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold"
                                : "text-stone-700 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                          >
                            {t('reader.page', 'Стр.')} {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`${currentTheme.subText}`}>
                    {t('reader.of', 'из')} {pages.length}
                  </span>
                </div>

                <button
                  type="button"
                  id="reader-next-page-btn"
                  disabled={clampedPageIdx === pages.length - 1}
                  onClick={() => {
                    navigateToPage(Math.min(pages.length - 1, clampedPageIdx + 1));
                  }}
                  className={`px-4 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 ${currentTheme.subText} hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-full text-xs font-serif font-medium transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer`}
                >
                  {t('reader.next_page', 'Следующая')} ›
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  type="button"
                  id="reader-prev-page-btn"
                  disabled={clampedPageIdx === 0}
                  onClick={() => {
                    navigateToPage(Math.max(0, clampedPageIdx - 1));
                  }}
                  className={`w-full sm:w-auto px-4 py-2 bg-transparent border ${currentTheme.divider} ${currentTheme.subText} hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black transition-all active:scale-98 flex items-center justify-center gap-1.5`}
                >
                  ← {t('reader.prev_page', 'Prev')}
                </button>

                <div className={`flex items-center gap-1.5 bg-transparent px-3 py-1.5 rounded-xl border ${currentTheme.divider}`}>
                  <span className={`text-xs font-mono font-bold tracking-tight ${currentTheme.subText}`}>
                    {t('reader.page', 'Page')}
                  </span>
                  <div className="relative" ref={pageSelectRef}>
                    <button
                      type="button"
                      id="page-jump-select-btn"
                      onClick={() => setIsPageSelectOpen(!isPageSelectOpen)}
                      className="flex items-center gap-0.5 text-xs font-mono font-bold text-teal-600 dark:text-teal-400 bg-transparent px-1 py-0.5 rounded cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                    >
                      <span>{clampedPageIdx + 1}</span>
                      <ChevronDown className={`w-3 h-3 text-teal-600 dark:text-teal-400 transition-transform ${isPageSelectOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isPageSelectOpen && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-20 max-h-48 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-[9999] py-1 text-center font-mono text-xs">
                        {pages.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              navigateToPage(i);
                              setIsPageSelectOpen(false);
                            }}
                            className={`w-full px-2 py-1 text-center transition-colors cursor-pointer ${
                              i === clampedPageIdx
                                ? "bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 font-bold"
                                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-mono font-bold tracking-tight ${currentTheme.subText} opacity-80`}>
                    {t('reader.of', 'of')} {pages.length}
                  </span>
                  <button
                    type="button"
                    title={t('reader.reset_p1', 'Reset to Page 1')}
                    onClick={() => {
                      navigateToPage(0); safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, "0");
                    }}
                    className={`p-1 hover:bg-black/10 dark:hover:bg-white/10 ${currentTheme.subText} opacity-70 hover:opacity-100 rounded-md transition cursor-pointer ml-1`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  id="reader-next-page-btn"
                  disabled={clampedPageIdx === pages.length - 1}
                  onClick={() => {
                    navigateToPage(Math.min(pages.length - 1, clampedPageIdx + 1));
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black transition-all active:scale-98 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {t('reader.next_page', 'Next')} →
                </button>
              </div>
            )}
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
                <div className="text-[10px] italic text-zinc-500 dark:text-zinc-400 leading-snug break-words bg-teal-50/40 dark:bg-teal-950/20 px-2 py-1.5 rounded-lg border border-teal-100/40 dark:border-teal-900/30">
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
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal italic px-1">
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
                <div className="text-[10px] italic text-zinc-500 dark:text-zinc-400 leading-snug break-words bg-teal-50/40 dark:bg-teal-950/20 px-2 py-1.5 rounded-lg border border-teal-100/40 dark:border-teal-900/30">
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
    </div>
  );
}

export default memo(ReaderPanel);
