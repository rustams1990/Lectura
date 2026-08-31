import React, { useState, useMemo, memo, useRef, useEffect, useCallback } from "react";
import { Lesson, LessonType, VocabItem, AppStats, ReaderSettings, HistoryEntry, LanguageListeningStat, Playlist } from "../types";
import { Search, BookOpen, Plus, Trash2, BookMarked, Sparkles, Filter, Archive, Check, Pencil, Pin, RefreshCw, TrendingUp, Lightbulb, Flame, ArrowRight, Loader2, ChevronUp, ChevronDown, Headphones, LayoutGrid, X, MoreVertical, ListVideo } from "lucide-react";
import { ICON_MAP, getCategoryIcon, getCategoryDisplayName } from "./ImportLessonForm";
import { normalizeContraction, safeLocalStorageSetItem, FLAG_EMOJI_TO_CODE, dedupeHistory, getUIPreviewCache, saveUIPreviewCache, normalizeLanguage } from "../utils";
import { getLocalizedLanguageName } from "../utils/stringUtils";
import { segmentSentenceTokens } from "../tokenizer";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { usePlaylistStore, PlaylistItem, isValidAudioUrl } from "../store/playlistStore";
import StatsWidget from "./StatsWidget";
import { ignoreListManager } from "../services/ignoreListService";
import PlaylistCard from "./playlist/PlaylistCard";
import AddToPlaylistModal from "./playlist/AddToPlaylistModal";
import { BookCard, BookStats, CoverPreset } from "./library/BookCard";

export function getDifficultyBadgeStyles(_level?: string) {
  // Clean, unified, high-contrast style matching the language pill
  return "bg-black/65 text-white font-black border border-white/10 shadow-xs";
}

const tokensCache = new Map<string, { tokens: ReturnType<typeof segmentSentenceTokens>; length: number; snippet: string }>();

export function getCachedTokens(lessonId: string, cleanText: string, lang: string) {
  const entry = tokensCache.get(lessonId);
  const textLength = cleanText.length;
  const snippet = cleanText.slice(0, 50);
  if (entry && entry.length === textLength && entry.snippet === snippet) {
    return entry.tokens;
  }
  const tokens = segmentSentenceTokens(cleanText, lang);
  tokensCache.set(lessonId, { tokens, length: textLength, snippet });
  if (tokensCache.size > 500) {
    const firstKey = tokensCache.keys().next().value;
    if (firstKey) tokensCache.delete(firstKey);
  }
  return tokens;
}

interface BookStatsCacheEntry {
  stats: BookStats;
  vocabRef: Record<string, VocabItem>;
  wordLinksRef: Record<string, string>;
  textLength: number;
  textSnippet: string;
  lang: string;
}

const statsCache = new Map<string, BookStatsCacheEntry>();

export function getCachedBookStats(lesson: Lesson, vocab: Record<string, VocabItem>, wordLinks: Record<string, string>): BookStats {
  if (!lesson || !lesson.id || typeof lesson.text !== "string") {
    return calculateBookStats(lesson, vocab, wordLinks);
  }

  const cacheKey = lesson.id;
  const entry = statsCache.get(cacheKey);
  const lang = (lesson.targetLanguage || "spanish").toLowerCase();
  const textLength = lesson.text.length;
  const textSnippet = lesson.text.slice(0, 50);

  if (
    entry &&
    entry.vocabRef === vocab &&
    entry.wordLinksRef === wordLinks &&
    entry.textLength === textLength &&
    entry.textSnippet === textSnippet &&
    entry.lang === lang
  ) {
    return entry.stats;
  }

  const computed = calculateBookStats(lesson, vocab, wordLinks);
  statsCache.set(cacheKey, {
    stats: computed,
    vocabRef: vocab,
    wordLinksRef: wordLinks,
    textLength,
    textSnippet,
    lang,
  });

  if (statsCache.size > 500) {
    const firstKey = statsCache.keys().next().value;
    if (firstKey) statsCache.delete(firstKey);
  }

  return computed;
}

interface LibraryHomeProps {
  lessons: Lesson[];
  playlists?: Playlist[];
  lessonTypes: LessonType[];
  onSelectLesson: (id: string) => void;
  onSelectPlaylist?: (id: string) => void;
  onDeletePlaylist?: (id: string, e: React.MouseEvent) => void;
  onToggleArchivePlaylist?: (id: string, e: React.MouseEvent) => void;
  onPlayAllPlaylist?: (playlist: Playlist, e: React.MouseEvent) => void;
  onUpdatePlaylist?: (updated: Playlist) => void;
  onAddOrUpdateLesson?: (lesson: Lesson) => void;
  onOpenImportForm: () => void;
  onDeleteLesson: (id: string, e: React.MouseEvent) => void;
  onToggleArchiveLesson: (id: string, e: React.MouseEvent) => void;
  onTogglePinLesson: (id: string, e: React.MouseEvent) => void;
  onEditLesson: (lesson: Lesson, e: React.MouseEvent) => void;
  stats: AppStats;
  vocab: Record<string, any>;
  wordLinks: Record<string, string>;
  languageFlags: Record<string, string>;
  history?: HistoryEntry[];
  selectedTargetLanguage?: string;
  onSelectTargetLanguage?: (lang: string) => void;
  settings?: ReaderSettings;
  onUpdateSettings?: (newSettings: ReaderSettings) => void;
  isLoading?: boolean;
}

export function calculateBookStats(lesson: Lesson, vocab: Record<string, VocabItem>, wordLinks: Record<string, string>): BookStats {
  const zero: BookStats = { knownPct: 0, unknownPct: 100, knownCount: 0, unknownCount: 0, ignoredCount: 0, uniqueKnownCount: 0, uniqueUnknownCount: 0, uniqueIgnoredCount: 0, uniqueTotal: 0, total: 0, eligibleTokens: 0, eligibleLemmas: 0, knownVocabularyPct: 0, unknownVocabularyPct: 100 };
  if (typeof lesson.text !== "string") return zero;

  const cleanText = lesson.text.replace(/\[(?:\[LECTURA_)?IMG(?:_REF)?:[^\]]+\]/gi, " ");
  const lang = (lesson.targetLanguage || "spanish").toLowerCase();
  const tokens = getCachedTokens(lesson.id || cleanText.slice(0, 30), cleanText, lesson.targetLanguage || "spanish");
  const processedWords = tokens.filter(t => t.isWord && t.clean).map(t => t.clean);

  if (processedWords.length === 0) return zero;

  let knownCount = 0;
  let unknownCount = 0;
  let ignoredCount = 0;

  const uniqueKnownWords   = new Set<string>();
  const uniqueUnknownWords = new Set<string>();
  const uniqueIgnoredWords = new Set<string>();
  const uniqueTotalWords   = new Set<string>();

  processedWords.forEach(word => {
    const key = word.toLowerCase();
    const langKey = `${lang}_${key}`;
    const resolvedKey = (wordLinks[langKey] || wordLinks[key] || key).replace(/^[a-zA-Z]+_/, "");
    const langKeyForResolved = `${lang}_${resolvedKey}`;

    let item = vocab[langKeyForResolved] || vocab[resolvedKey];

    if (!item) {
      const normalized = normalizeContraction(resolvedKey, lang);
      if (normalized !== resolvedKey) {
        item = vocab[`${lang}_${normalized}`] || vocab[normalized];
      }
    }

    uniqueTotalWords.add(resolvedKey);

    const isManuallyIgnored = !!(item && item.status === "ignored");
    const isAutoIgnored     = !item && ignoreListManager.checkAutoIgnore(resolvedKey, undefined, lang).isIgnored;
    const isIgnored         = isManuallyIgnored || isAutoIgnored;

    if (isIgnored) {
      // Excluded from both numerator and denominator
      ignoredCount++;
      uniqueIgnoredWords.add(resolvedKey);
    } else if (item && item.status === "known") {
      knownCount++;
      uniqueKnownWords.add(resolvedKey);
    } else {
      unknownCount++;
      uniqueUnknownWords.add(resolvedKey);
    }
  });

  const total          = processedWords.length;
  // Eligible = everything that is not ignored
  const eligibleTokens = total - ignoredCount;
  const eligibleLemmas = uniqueKnownWords.size + uniqueUnknownWords.size; // mutual-exclusive sets

  const knownPct           = eligibleTokens > 0 ? Math.round((knownCount  / eligibleTokens) * 100) : 0;
  const knownVocabularyPct = eligibleLemmas  > 0 ? Math.round((uniqueKnownWords.size / eligibleLemmas)  * 100) : 0;

  return {
    knownPct,
    unknownPct:           100 - knownPct,
    knownCount,
    unknownCount,
    ignoredCount,
    uniqueKnownCount:     uniqueKnownWords.size,
    uniqueUnknownCount:   uniqueUnknownWords.size,
    uniqueIgnoredCount:   uniqueIgnoredWords.size,
    uniqueTotal:          uniqueTotalWords.size,
    total,
    eligibleTokens,
    eligibleLemmas,
    knownVocabularyPct,
    unknownVocabularyPct: 100 - knownVocabularyPct,
  };
}

// Map language to a spectacular cover style
const getLanguageCoverPreset = (lang: string) => {
  const l = lang.toLowerCase();
  if (l.includes("span")) {
    return {
      gradient: "from-amber-600 via-orange-600 to-rose-700",
      accent: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      emoji: "🇪🇸",
      character: "Ñ",
    };
  }
  if (l.includes("engl") || l.includes("eng")) {
    return {
      gradient: "from-indigo-600 via-blue-600 to-sky-800",
      accent: "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
      emoji: "🇬🇧",
      character: "E",
    };
  }
  if (l.includes("fren")) {
    return {
      gradient: "from-sky-600 via-teal-600 to-slate-800",
      accent: "bg-teal-100 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200",
      emoji: "🇫🇷",
      character: "Ç",
    };
  }
  if (l.includes("germ")) {
    return {
      gradient: "from-zinc-800 via-stone-800 to-amber-600",
      accent: "bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-300",
      emoji: "🇩🇪",
      character: "ß",
    };
  }
  if (l.includes("jap")) {
    return {
      gradient: "from-red-600 via-pink-600 to-rose-700",
      accent: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
      emoji: "🇯🇵",
      character: "あ",
    };
  }
  if (l.includes("russ")) {
    return {
      gradient: "from-cyan-600 via-teal-600 to-slate-800",
      accent: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200",
      emoji: "🇷🇺",
      character: "Д",
    };
  }
  if (l.includes("ital")) {
    return {
      gradient: "from-emerald-600 via-teal-600 to-teal-800",
      accent: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/45 dark:text-emerald-300",
      emoji: "🇮🇹",
      character: "é",
    };
  }
  if (l.includes("ukra")) {
    return {
      gradient: "from-blue-600 via-sky-500 to-yellow-500",
      accent: "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
      emoji: "🇺🇦",
      character: "Ї",
    };
  }
  if (l.includes("kaza") || l.includes("қаза")) {
    return {
      gradient: "from-sky-500 via-sky-400 to-amber-400",
      accent: "bg-sky-100 text-sky-950 dark:bg-sky-950/45 dark:text-sky-300",
      emoji: "🇰🇿",
      character: "Қ",
    };
  }
  if (l.includes("port")) {
    return {
      gradient: "from-emerald-700 via-teal-700 to-red-600",
      accent: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/45 dark:text-emerald-300",
      emoji: "🇵🇹",
      character: "P",
    };
  }
  if (l.includes("chin") || l.includes("zh")) {
    return {
      gradient: "from-red-600 via-amber-600 to-red-800",
      accent: "bg-red-100 text-red-950 dark:bg-red-950/45 dark:text-red-300",
      emoji: "🇨🇳",
      character: "字",
    };
  }
  if (l.includes("kore") || l.includes("ko")) {
    return {
      gradient: "from-blue-600 via-slate-700 to-red-600",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇰🇷",
      character: "한",
    };
  }
  if (l.includes("turk") || l.includes("tr")) {
    return {
      gradient: "from-red-600 via-rose-700 to-red-900",
      accent: "bg-red-100 text-red-950 dark:bg-red-950/45 dark:text-red-300",
      emoji: "🇹🇷",
      character: "Ğ",
    };
  }
  if (l.includes("arab") || l.includes("ar")) {
    return {
      gradient: "from-emerald-700 via-green-800 to-amber-600",
      accent: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/45 dark:text-emerald-300",
      emoji: "🇸🇦",
      character: "ع",
    };
  }
  if (l.includes("dutc") || l.includes("nl")) {
    return {
      gradient: "from-orange-500 via-amber-600 to-blue-700",
      accent: "bg-orange-100 text-orange-950 dark:bg-orange-950/45 dark:text-orange-300",
      emoji: "🇳🇱",
      character: "IJ",
    };
  }
  if (l.includes("poli") || l.includes("pl")) {
    return {
      gradient: "from-red-600 via-rose-600 to-slate-200",
      accent: "bg-red-100 text-red-950 dark:bg-red-950/45 dark:text-red-300",
      emoji: "🇵🇱",
      character: "Ł",
    };
  }
  if (l === "se" || l === "sv" || l.includes("swed") || l.includes("svenska") || l.includes("шведский")) {
    return {
      gradient: "from-blue-600 via-sky-500 to-yellow-400",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇸🇪",
      character: "Å",
    };
  }
  if (l === "hi" || l.includes("hind") || l.includes("хинди") || l.includes("हिन्दी")) {
    return {
      gradient: "from-orange-600 via-amber-600 to-emerald-700",
      accent: "bg-orange-100 text-orange-950 dark:bg-orange-950/45 dark:text-orange-300",
      emoji: "🇮🇳",
      character: "अ",
    };
  }
  if (l === "el" || l.includes("gree") || l.includes("греческий") || l.includes("ελλην")) {
    return {
      gradient: "from-blue-600 via-sky-600 to-blue-800",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇬🇷",
      character: "Ω",
    };
  }
  if (l === "he" || l.includes("hebr") || l.includes("иврит") || l.includes("עברית")) {
    return {
      gradient: "from-blue-600 via-sky-500 to-slate-200",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇮🇱",
      character: "א",
    };
  }
  if (l === "fi" || l.includes("finn") || l.includes("суоми") || l.includes("финский") || l.includes("suomi")) {
    return {
      gradient: "from-blue-700 via-sky-600 to-slate-100",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇫🇮",
      character: "Ä",
    };
  }
  if (l === "hu" || l.includes("hung") || l.includes("magyar") || l.includes("венгерский")) {
    return {
      gradient: "from-emerald-600 via-slate-100 to-red-600",
      accent: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/45 dark:text-emerald-300",
      emoji: "🇭🇺",
      character: "Gy",
    };
  }
  if (l === "cs" || l === "cz" || l.includes("cze") || l.includes("чешский") || l.includes("češ")) {
    return {
      gradient: "from-blue-600 via-slate-100 to-red-600",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇨🇿",
      character: "Ř",
    };
  }
  if (l === "ro" || l.includes("roma") || l.includes("румынский") || l.includes("român")) {
    return {
      gradient: "from-blue-700 via-amber-500 to-red-600",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇷🇴",
      character: "Ș",
    };
  }
  if (l === "vi" || l === "vn" || l.includes("viet") || l.includes("вьетнамский") || l.includes("tiếng việt")) {
    return {
      gradient: "from-red-600 via-amber-500 to-red-700",
      accent: "bg-red-100 text-red-950 dark:bg-red-950/45 dark:text-red-300",
      emoji: "🇻🇳",
      character: "Đ",
    };
  }
  if (l === "fa" || l.includes("pers") || l.includes("fars") || l.includes("персидский") || l.includes("фарси") || l.includes("فارسی")) {
    return {
      gradient: "from-emerald-700 via-green-600 to-red-600",
      accent: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/45 dark:text-emerald-300",
      emoji: "🇮🇷",
      character: "پ",
    };
  }
  // Fallbacks for other languages
  return {
    gradient: "from-teal-600 via-teal-700 to-slate-800",
    accent: "bg-teal-100 text-teal-950 dark:bg-teal-950/40 dark:text-teal-300",
    emoji: "📖",
    character: "A",
  };
};


export const getLanguageFlagEmoji = (lang: string, customFlags?: Record<string, string>) => {
  if (!lang) return "📖";
  const langLower = lang.toLowerCase().trim();
  const custom = customFlags ? customFlags[langLower] : undefined;
  if (custom && custom !== "📖") {
    return custom;
  }
  const preset = getLanguageCoverPreset(lang);
  return preset.emoji;
};

export const renderCircularFlag = (flagEmoji: string, isAll = false) => {
  const countryCode = FLAG_EMOJI_TO_CODE[flagEmoji];
  if (!isAll && countryCode) {
    return (
      <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center select-none shrink-0 shadow-xs border border-zinc-200/80 dark:border-zinc-700/80">
        <img
          src={`https://flagcdn.com/w40/${countryCode}.png`}
          srcSet={`https://flagcdn.com/w80/${countryCode}.png 2x`}
          alt={countryCode.toUpperCase()}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }
  return (
    <span className="w-5 h-5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 overflow-hidden inline-flex items-center justify-center text-[11px] leading-none select-none shrink-0 shadow-xs">
      <span className={`${isAll ? "scale-[1.1]" : "scale-[1.45]"} origin-center inline-block`}>
        {isAll ? "🌐" : flagEmoji}
      </span>
    </span>
  );
};

function LibraryHome({
  lessons,
  playlists = [],
  lessonTypes,
  onSelectLesson,
  onSelectPlaylist,
  onDeletePlaylist,
  onToggleArchivePlaylist,
  onPlayAllPlaylist,
  onUpdatePlaylist,
  onAddOrUpdateLesson,
  onOpenImportForm,
  onDeleteLesson,
  onToggleArchiveLesson,
  onTogglePinLesson,
  onEditLesson,
  stats,
  vocab,
  wordLinks,
  languageFlags,
  history = [],
  selectedTargetLanguage = "All",
  onSelectTargetLanguage,
  settings,
  onUpdateSettings,
  isLoading = false,
}: LibraryHomeProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { setQueue } = usePlaylistStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [playlistModalLesson, setPlaylistModalLesson] = useState<Lesson | null>(null);
  const selectedLanguage = selectedTargetLanguage;

  // Dynamic statistics calculation for selected target language
  const languageAwareStats = useMemo<AppStats>(() => {
    const vocabKeys = Object.keys(vocab || {});
    // Instant UI preview fallback when vocab is not yet loaded from server:
    if (vocabKeys.length === 0) {
      const preview = getUIPreviewCache();
      if (preview && (preview.knownWordsCount > 0 || preview.activeWordsCount > 0)) {
        return {
          listeningSeconds: 0,
          todayListeningSeconds: 0,
          wordsKnownCount: preview.knownWordsCount,
          wordsLearningCount: preview.activeWordsCount,
        };
      }
    }

    const selectedLangLower = selectedLanguage !== "All" ? selectedLanguage.toLowerCase() : null;
    const onlyParents = settings?.onlyPatterns !== false;

    let known = 0;
    let learning = 0;

    if (onlyParents && wordLinks) {
      const parentGroups = new Map<string, string[]>();
      Object.entries(vocab || {}).forEach(([key, lq]) => {
        if (!lq || typeof lq !== "object") return;
        if (!lq.word) return;
        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0].toLowerCase() : "spanish";
        if (selectedLangLower && itemLang !== selectedLangLower) return;

        const wordLower = lq.word.toLowerCase();
        const keyWithLang = `${itemLang}_${wordLower}`;
        let targetKey = wordLinks[keyWithLang] || wordLinks[wordLower] || wordLinks[key];
        let depth = 0;
        while (depth < 5 && targetKey && wordLinks[targetKey]) {
          targetKey = wordLinks[targetKey];
          depth++;
        }

        let parentWord = wordLower;
        if (targetKey && typeof targetKey === "string") {
          const underscoreIdx = targetKey.indexOf("_");
          parentWord = underscoreIdx !== -1 ? targetKey.substring(underscoreIdx + 1).toLowerCase() : targetKey.toLowerCase();
        }

        const parentGroupKey = `${itemLang}_${parentWord}`;
        if (!parentGroups.has(parentGroupKey)) {
          parentGroups.set(parentGroupKey, []);
        }
        parentGroups.get(parentGroupKey)!.push(lq.status || "new");
      });

      parentGroups.forEach((statuses) => {
        const getStatusWeight = (status: string) => {
          switch (status) {
            case "known": return 6;
            case "5": return 5;
            case "4": return 4;
            case "3": case "learning": return 3;
            case "2": return 2;
            case "1": return 1;
            case "ignored": return 0;
            default: return 0;
          }
        };

        let highestStatus = "ignored";
        let maxWeight = -1;
        statuses.forEach((st) => {
          const w = getStatusWeight(st);
          if (w > maxWeight) {
            maxWeight = w;
            highestStatus = st;
          }
        });

        if (highestStatus === "known") {
          known++;
        } else if (["1", "2", "3", "4", "5", "learning"].includes(highestStatus)) {
          learning++;
        }
      });
    } else {
      const vocabValues = Object.entries(vocab || {}).filter(([key, lq]) => {
        if (!lq) return false;
        if (!selectedLangLower) return true;
        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0].toLowerCase() : "spanish";
        return itemLang === selectedLangLower;
      }).map(([_, lq]) => lq as VocabItem);

      known = vocabValues.filter((l) => l && l.status === "known").length;
      learning = vocabValues.filter((l) =>
        l && l.status && ["1", "2", "3", "4", "5", "learning"].includes(l.status)
      ).length;
    }

    // Helper to check if ISO timestamp is today
    const isToday = (isoDateStr?: string) => {
      if (!isoDateStr) return false;
      try {
        const d = new Date(isoDateStr);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      } catch {
        return false;
      }
    };

    // Helper to get exact target language for history entry
    const getHistoryItemLanguage = (item: HistoryEntry): string => {
      if (item.targetLanguage && typeof item.targetLanguage === "string" && item.targetLanguage.trim()) {
        return item.targetLanguage.trim().toLowerCase();
      }
      if (item.lessonId) {
        const foundLesson = lessons.find((l) => l.id === item.lessonId);
        if (foundLesson && foundLesson.targetLanguage) {
          return foundLesson.targetLanguage.trim().toLowerCase();
        }
      }
      return "spanish";
    };

    const dedupedHist = dedupeHistory(history || []);
    const langHist = selectedLangLower
      ? dedupedHist.filter((item) => getHistoryItemLanguage(item) === selectedLangLower)
      : dedupedHist;

    const totalListeningSeconds = langHist
      .filter((item) => item.actionType === "listen" || item.category === "podcast" || item.category === "video")
      .reduce((acc, item) => acc + (item.durationSeconds || 0), 0);

    const todayListeningSeconds = langHist
      .filter((item) => (item.actionType === "listen" || item.category === "podcast" || item.category === "video") && isToday(item.timestamp))
      .reduce((acc, item) => acc + (item.durationSeconds || 0), 0);

    return {
      listeningSeconds: Math.round(totalListeningSeconds),
      todayListeningSeconds: Math.round(todayListeningSeconds),
      wordsKnownCount: known,
      wordsLearningCount: learning,
    };
  }, [vocab, history, lessons, selectedLanguage, settings?.onlyPatterns, wordLinks]);

  // Per-language listening breakdown calculation
  const perLanguageListeningStats = useMemo<LanguageListeningStat[]>(() => {
    const dedupedHist = dedupeHistory(history || []);
    const map = new Map<string, { todaySeconds: number; totalSeconds: number }>();

    const isToday = (isoDateStr?: string) => {
      if (!isoDateStr) return false;
      try {
        const d = new Date(isoDateStr);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      } catch {
        return false;
      }
    };

    dedupedHist.forEach((item) => {
      const isListening = item.actionType === "listen" || item.category === "podcast" || item.category === "video";
      if (!isListening || !item.durationSeconds) return;
      const rawLang = item.targetLanguage || "Spanish";
      const langKey = rawLang.charAt(0).toUpperCase() + rawLang.slice(1).toLowerCase();

      const existing = map.get(langKey) || { todaySeconds: 0, totalSeconds: 0 };
      existing.totalSeconds += item.durationSeconds;
      if (isToday(item.timestamp)) {
        existing.todaySeconds += item.durationSeconds;
      }
      map.set(langKey, existing);
    });

    return Array.from(map.entries()).map(([language, data]) => ({
      language,
      todaySeconds: Math.round(data.todaySeconds),
      totalSeconds: Math.round(data.totalSeconds),
    }));
  }, [history]);
  const [filterType, setFilterType] = useState<"all" | "builtin" | "custom">("all");
  const [selectedLessonType, setSelectedLessonType] = useState<string>("All");
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<string>(() => {
    return localStorage.getItem("vocab_library_sort") || "pinned";
  });

  const handleSortChange = (value: string) => {
    setSortBy(value);
    safeLocalStorageSetItem("vocab_library_sort", value);
  };



  const [booksPerRow, setBooksPerRow] = useState<number>(() => {
    const saved = localStorage.getItem("vocab_books_per_row");
    return saved ? parseInt(saved, 10) : 5;
  });
  const [isGridDropdownOpen, setIsGridDropdownOpen] = useState(false);
  const gridDropdownRef = useRef<HTMLDivElement>(null);

  const [openMenuLessonId, setOpenMenuLessonId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gridDropdownRef.current && !gridDropdownRef.current.contains(event.target as Node)) {
        setIsGridDropdownOpen(false);
      }
      if (openMenuLessonId && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuLessonId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuLessonId]);

  const handleBooksPerRowChange = (cols: number) => {
    setBooksPerRow(cols);
    safeLocalStorageSetItem("vocab_books_per_row", cols.toString());
  };

  const gridColsClass = useMemo(() => {
    switch (booksPerRow) {
      case 2:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2";
      case 3:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3";
      case 4:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
      case 5:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
      case 6:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
      default:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
    }
  }, [booksPerRow]);

  // Dynamically analyze languages present in the library under current view
  const availableLanguages = useMemo(() => {
    const list = new Set<string>();
    lessons.forEach((l) => {
      const isBookArchived = !!l.isArchived;
      const matchesArchive = showArchived ? isBookArchived : !isBookArchived;

      const matchesType =
        filterType === "all" ||
        (filterType === "builtin" && l.isBuiltIn) ||
        (filterType === "custom" && !l.isBuiltIn);

      const matchesLessonType =
        selectedLessonType === "All" ||
        l.lessonType === selectedLessonType ||
        (selectedLessonType === "book" && !l.lessonType);

      if (matchesArchive && matchesType && matchesLessonType && l.targetLanguage) {
        list.add(normalizeLanguage(l.targetLanguage));
      }
    });
    return ["All", ...Array.from(list)];
  }, [lessons, showArchived, filterType, selectedLessonType]);



  // Compute word counts and display estimates
  const getWordCount = (text: string) => {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  };

  const getReadingTime = (text: string) => {
    const wc = getWordCount(text);
    return Math.max(1, Math.round(wc / 120)); // ~120 words per minute for learners
  };

  const getYoutubeDurationFromText = (text: string): number | null => {
    if (!text) return null;
    const lines = text.split("\n");
    const timestampRegex = /^\[?((?:\d{1,2}:){1,2}\d{2}|\d+(?:h|m|s))\]?\s*/i;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      const match = trimmed.match(timestampRegex);
      if (match) {
        const ts = match[1].replace(/[\[\]]/g, "");
        let seconds = 0;
        const clean = ts.trim().toLowerCase();
        if (clean.endsWith("s") || clean.endsWith("m") || clean.endsWith("h")) {
          const hMatch = clean.match(/(\d+)h/);
          const mMatch = clean.match(/(\d+)m/);
          const sMatch = clean.match(/(\d+)s/);
          if (hMatch) seconds += parseInt(hMatch[1], 10) * 3600;
          if (mMatch) seconds += parseInt(mMatch[1], 10) * 60;
          if (sMatch) seconds += parseInt(sMatch[1], 10);
        } else {
          const parts = clean.split(":");
          if (parts.length === 2) {
            seconds += parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
          } else if (parts.length === 3) {
            seconds += parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
          }
        }
        if (seconds > 0) {
          return seconds + 5;
        }
      }
    }
    return null;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMaxTimestampInText = (text: string): number | null => {
    if (!text) return null;
    const matches = Array.from(text.matchAll(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/g));
    if (!matches || matches.length === 0) return null;
    let maxSec = 0;
    for (const m of matches) {
      let sec = 0;
      if (m[3]) {
        sec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
      } else {
        sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      }
      if (sec > maxSec) maxSec = sec;
    }
    return maxSec > 0 ? maxSec : null;
  };

  // Filter lessons based on search, type, and archive state
  const filteredLessons = useMemo(() => {
    const list = lessons.filter((lesson) => {
      // Check archive matching: if we click "active schema", show only non-archived books
      const isBookArchived = !!lesson.isArchived;
      const matchesArchive = showArchived ? isBookArchived : !isBookArchived;

      // Do not clutter the main shelf with child lessons of a playlist unless searching or filtered
      const notHiddenByPlaylist = !lesson.playlistId || searchQuery.trim().length > 0 || (selectedLessonType !== "All" && selectedLessonType !== "playlist");

      const matchesSearch =
        lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lesson.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        normalizeLanguage(lesson.targetLanguage).toLowerCase().includes(searchQuery.toLowerCase()) ||
        getLocalizedLanguageName(normalizeLanguage(lesson.targetLanguage), i18n.language).toLowerCase().includes(searchQuery.toLowerCase());

      const matchesLanguage =
        !selectedLanguage ||
        selectedLanguage.toLowerCase() === "all" ||
        normalizeLanguage(lesson.targetLanguage).toLowerCase() === normalizeLanguage(selectedLanguage).toLowerCase() ||
        getLocalizedLanguageName(normalizeLanguage(lesson.targetLanguage), "en").toLowerCase() === normalizeLanguage(selectedLanguage).toLowerCase();

      const matchesType =
        filterType === "all" ||
        (filterType === "builtin" && lesson.isBuiltIn) ||
        (filterType === "custom" && !lesson.isBuiltIn);

      const matchesLessonType =
        selectedLessonType === "All" ||
        lesson.lessonType === selectedLessonType ||
        (selectedLessonType === "book" && !lesson.lessonType); // default undefined type to "book"

      return matchesArchive && notHiddenByPlaylist && matchesSearch && matchesLanguage && matchesType && matchesLessonType;
    });

    // Sort: pinned always float to top, then apply the chosen sort key.
    const lessonsLength = lessons.length;
    const getEffectiveTimestamp = (l: Lesson) => {
      if (typeof l.createdAt === "number" && !isNaN(l.createdAt)) {
        return l.createdAt;
      }
      const parsedId = parseInt(l.id, 10);
      if (!isNaN(parsedId) && parsedId > 1000000000000) {
        return parsedId;
      }
      // Index 0 in lessons array is newest, index length-1 is oldest
      const idx = lessons.indexOf(l);
      return idx !== -1 ? (lessonsLength - idx) * 1000 : 0;
    };

    return [...list].sort((a, b) => {
      // Pinned books always come first regardless of sort
      const aPinned = !!a.pinned;
      const bPinned = !!b.pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (sortBy === "title") {
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }
      if (sortBy === "title_desc") {
        return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
      }
      if (sortBy === "comprehension_high") {
        const sA = getCachedBookStats(a, vocab, wordLinks);
        const sB = getCachedBookStats(b, vocab, wordLinks);
        return sB.knownPct - sA.knownPct;
      }
      if (sortBy === "comprehension_low") {
        const sA = getCachedBookStats(a, vocab, wordLinks);
        const sB = getCachedBookStats(b, vocab, wordLinks);
        return sA.knownPct - sB.knownPct;
      }
      if (sortBy === "length_short") {
        return getWordCount(a.text || "") - getWordCount(b.text || "");
      }
      if (sortBy === "length_long") {
        return getWordCount(b.text || "") - getWordCount(a.text || "");
      }
      if (sortBy === "oldest") {
        // Oldest first = lower timestamp first
        return getEffectiveTimestamp(a) - getEffectiveTimestamp(b);
      }
      // default "pinned" / "newest": Newest first = higher timestamp first
      return getEffectiveTimestamp(b) - getEffectiveTimestamp(a);
    });
  }, [lessons, searchQuery, selectedLanguage, filterType, selectedLessonType, showArchived, sortBy, vocab, wordLinks]);

  // Filter playlists
  const filteredPlaylists = useMemo(() => {
    return (playlists || []).filter((pl) => {
      const isPlArchived = !!pl.isArchived;
      const matchesArchive = showArchived ? isPlArchived : !isPlArchived;
      if (!matchesArchive) return false;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        pl.title.toLowerCase().includes(q) ||
        (pl.channelTitle && pl.channelTitle.toLowerCase().includes(q)) ||
        pl.language.toLowerCase().includes(q) ||
        getLocalizedLanguageName(pl.language, i18n.language).toLowerCase().includes(q);

      const matchesLanguage =
        selectedLanguage === "All" ||
        pl.language.toLowerCase() === selectedLanguage.toLowerCase() ||
        getLocalizedLanguageName(pl.language, "en").toLowerCase() === selectedLanguage.toLowerCase();

      const matchesLessonType =
        selectedLessonType === "All" ||
        selectedLessonType === "playlist" ||
        (selectedLessonType === "youtube" && pl.sourceType === "youtube_playlist");

      return matchesSearch && matchesLanguage && matchesLessonType;
    });
  }, [playlists, searchQuery, selectedLanguage, selectedLessonType, showArchived, i18n.language]);

  // Active/Archived counts respecting current selectedLanguage filter
  const isAllLanguage = !selectedLanguage || selectedLanguage.toLowerCase() === "all";

  const matchesLanguageFilter = (itemLang?: string) => {
    if (isAllLanguage) return true;
    if (!itemLang) return false;
    const l = itemLang.toLowerCase();
    const sel = selectedLanguage.toLowerCase();
    return l === sel || getLocalizedLanguageName(l, "en").toLowerCase() === sel;
  };

  const rawActiveCount = useMemo(() => {
    const activeLessons = lessons.filter(
      (l) => !l.isArchived && matchesLanguageFilter(l.targetLanguage || (l as any).language)
    ).length;
    const activePlaylists = (playlists || []).filter(
      (p) => !p.isArchived && matchesLanguageFilter(p.language || (p as any).targetLanguage)
    ).length;
    return activeLessons + activePlaylists;
  }, [lessons, playlists, selectedLanguage]);

  const rawArchivedCount = useMemo(() => {
    const archivedLessons = lessons.filter(
      (l) => l.isArchived && matchesLanguageFilter(l.targetLanguage || (l as any).language)
    ).length;
    const archivedPlaylists = (playlists || []).filter(
      (p) => p.isArchived && matchesLanguageFilter(p.language || (p as any).targetLanguage)
    ).length;
    return archivedLessons + archivedPlaylists;
  }, [lessons, playlists, selectedLanguage]);

  const totalActiveBooksCount = useMemo(() => {
    return lessons.filter((l) => !l.isArchived).length + (playlists || []).filter((p) => !p.isArchived).length;
  }, [lessons, playlists]);

  const totalArchivedBooksCount = useMemo(() => {
    return lessons.filter((l) => l.isArchived).length + (playlists || []).filter((p) => p.isArchived).length;
  }, [lessons, playlists]);

  const preview = getUIPreviewCache();
  const isDataAvailable = lessons.length > 0 || (playlists && playlists.length > 0) || Object.keys(vocab || {}).length > 0;

  const activeCount = (!isDataAvailable && preview && preview.activeBooksCount > 0 && isAllLanguage)
    ? preview.activeBooksCount
    : rawActiveCount;

  const archivedCount = (!isDataAvailable && preview && preview.archivedBooksCount > 0 && isAllLanguage)
    ? preview.archivedBooksCount
    : rawArchivedCount;

  // Persist latest visual snapshot for future instant first renders
  useEffect(() => {
    if (isDataAvailable) {
      const flagVariant = languageFlags[selectedLanguage.toLowerCase()] || undefined;
      saveUIPreviewCache({
        selectedLanguage,
        selectedVariant: flagVariant,
        activeBooksCount: rawActiveCount,
        archivedBooksCount: rawArchivedCount,
        knownWordsCount: languageAwareStats.wordsKnownCount,
        activeWordsCount: languageAwareStats.wordsLearningCount,
      });
    }
  }, [isDataAvailable, selectedLanguage, languageFlags, rawActiveCount, rawArchivedCount, languageAwareStats.wordsKnownCount, languageAwareStats.wordsLearningCount]);

  // Pagination logic
  // Установим пока 4 книги на страницу (позже можно вернуть 15), чтобы вы могли увидеть кнопки.
  const ITEMS_PER_PAGE = 15; 
  const totalPages = Math.ceil(filteredLessons.length / ITEMS_PER_PAGE);
  const paginatedLessons = filteredLessons.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const isVocabAvailable = Boolean(vocab && Object.keys(vocab).length > 0);
  const computedStatsMap = useMemo(() => {
    const map = new Map<string, BookStats>();
    if (isVocabAvailable) {
      paginatedLessons.forEach((lesson) => {
        map.set(lesson.id, getCachedBookStats(lesson, vocab, wordLinks));
      });
    }
    return map;
  }, [paginatedLessons, vocab, wordLinks, isVocabAvailable]);

  const handlePlayAllFiltered = () => {
    const candidateItems: PlaylistItem[] = filteredLessons
      .filter((l) => isValidAudioUrl(l.audioUrl, l.audioBase64, l.youtubeId, l.localVideoUrl))
      .map((l) => ({
        id: l.id,
        title: l.title,
        bookTitle: l.title,
        audioUrl: l.audioUrl || l.localVideoUrl || '',
        audioBase64: l.audioBase64,
        youtubeId: l.youtubeId,
        localVideoUrl: l.localVideoUrl,
        coverUrl: l.coverUrl,
        targetLanguage: l.targetLanguage,
        lessonType: l.lessonType,
        channelName: l.channelName,
      }));

    if (candidateItems.length === 0) {
      showToast(t('player.no_audio_available', 'No audio materials available for playback'), 'warning');
      return;
    }

    const res = setQueue(candidateItems, 0, true);
    if (res.started && res.count > 0) {
      showToast(t('player.started_playlist', 'Playing {{count}} tracks in queue', { count: res.count }), 'success');
    }
  };

  const handlePlaySingleLesson = (lesson: Lesson) => {
    if (!isValidAudioUrl(lesson.audioUrl, lesson.audioBase64, lesson.youtubeId, lesson.localVideoUrl)) {
      showToast(t('player.no_audio_available', 'No audio materials available for playback'), 'warning');
      return;
    }

    const item: PlaylistItem = {
      id: lesson.id,
      title: lesson.title,
      bookTitle: lesson.title,
      audioUrl: lesson.audioUrl || lesson.localVideoUrl || '',
      audioBase64: lesson.audioBase64,
      youtubeId: lesson.youtubeId,
      localVideoUrl: lesson.localVideoUrl,
      coverUrl: lesson.coverUrl,
      targetLanguage: lesson.targetLanguage,
      lessonType: lesson.lessonType,
      channelName: lesson.channelName,
    };

    setQueue([item], 0, true);
    showToast(t('player.now_playing', 'Now playing: {{title}}', { title: lesson.title }), 'success');
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLanguage, filterType, selectedLessonType, showArchived]);

  return (
    <div className="library-container w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <StatsWidget
        stats={languageAwareStats}
        selectedLanguage={selectedLanguage}
        onlyPatterns={settings?.onlyPatterns !== false}
      />


      {/* Main Shelves Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-px">
        <button
          onClick={() => setShowArchived(false)}
          className={`pb-3 px-2 text-sm font-black uppercase tracking-wider transition-all relative ${
            !showArchived
              ? "text-teal-600 dark:text-teal-400 font-extrabold"
              : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          }`}
        >
          {t('library.active_books_tab', 'ACTIVE BOOKS ({{count}})', { count: activeCount })}
          {!showArchived && (
            <span className="absolute bottom-0 left-0 right-0 h-1 bg-teal-600 dark:bg-teal-400 rounded-t-lg" />
          )}
        </button>

        <button
          onClick={() => setShowArchived(true)}
          className={`pb-3 px-2 text-sm font-black uppercase tracking-wider transition-all relative flex items-center gap-1.5 ${
            showArchived
              ? "text-teal-600 dark:text-teal-400 font-extrabold"
              : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          }`}
        >
          📁 {t('library.archive_books_tab', 'ARCHIVED ({{count}})', { count: archivedCount })}
          {showArchived && (
            <span className="absolute bottom-0 left-0 right-0 h-1 bg-teal-600 dark:bg-teal-400 rounded-t-lg" />
          )}
        </button>
      </div>

      {/* Unified Search & Control Console */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-2.5 sm:p-3 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        
        {/* Left: Search input + Create Button Group */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[140px] lg:max-w-xs xl:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-3.5 h-3.5" />
            <input
              type="text"
              id="library-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("library.search_placeholder", "Search by title or content...")}
              className="w-full pl-8 pr-7 py-1.5 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all placeholder:text-zinc-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition-colors cursor-pointer"
                title={t("common.clear", "Clear")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!showArchived && (
            <button
              type="button"
              onClick={onOpenImportForm}
              className="px-3 sm:px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 active:scale-97 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-sm shadow-teal-600/20 shrink-0"
              title={t('library.create_book', 'Create book')}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('library.create_book', 'Create book')}</span>
            </button>
          )}
        </div>

        {/* Center: Dynamic Category Filter chips (All, YouTube, Podcast, Book) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1 scroll-smooth">
          <button
            type="button"
            onClick={() => setSelectedLessonType("All")}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap border ${
              selectedLessonType === "All"
                ? "bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-800 shadow-3xs"
                : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800"
            }`}
          >
            <span>{t("library.all", "All")}</span>
          </button>

          {playlists.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedLessonType("playlist")}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap border ${
                selectedLessonType === "playlist"
                  ? "bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-800 shadow-3xs"
                  : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800"
              }`}
            >
              <ListVideo className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>{t("playlist.playlists", "Playlists")} ({playlists.length})</span>
            </button>
          )}

          {lessonTypes.map((type) => {
            const IconComponent = getCategoryIcon(type.icon, type.name);
            const isSelected = selectedLessonType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedLessonType(type.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap border ${
                  isSelected
                    ? "bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-800 shadow-3xs"
                    : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800"
                }`}
              >
                <IconComponent className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>{getCategoryDisplayName(type.id, type.name, t)}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Actions, Sort, Grid Columns & Play All */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap sm:flex-nowrap">
          {/* Source Filter dropdown */}
          <div className="relative flex items-center font-sans">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="pl-2.5 pr-6 py-1.5 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all appearance-none cursor-pointer focus:outline-none"
            >
              <option value="all">{t('library.all_sources', 'All Sources')}</option>
              <option value="builtin">{t('library.builtin', 'Built-in')}</option>
              <option value="custom">{t('library.imported', 'Imported')}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          </div>

          {/* Sort dropdown */}
          <div className="relative flex items-center font-sans">
            <select
              id="library-sort-select"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              title={t("library.sort_title_attr", "Sort books")}
              className={`pl-2.5 pr-6 py-1.5 text-xs font-bold rounded-xl transition-all appearance-none cursor-pointer focus:outline-none ${
                sortBy !== "pinned"
                  ? "bg-teal-600 text-white border-teal-700 shadow-3xs"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <option value="pinned">{t('library.sort_pinned', '📌 Pinned')}</option>
              <option value="newest">{t('library.sort_newest', '🕐 Newest first')}</option>
              <option value="oldest">{t('library.sort_oldest', '📅 Oldest first')}</option>
              <option value="title">{t('library.sort_title', '🔤 Title A-Z')}</option>
              <option value="title_desc">{t('library.sort_title_desc', '🔤 Title Z-A')}</option>
              <option value="comprehension_high">{t('library.sort_comp_high', '📊 Comp: High')}</option>
              <option value="comprehension_low">{t('library.sort_comp_low', '📊 Comp: Low')}</option>
              <option value="length_short">{t('library.sort_short', '📖 Short')}</option>
              <option value="length_long">{t('library.sort_long', '📖 Long')}</option>
            </select>
            <ChevronDown className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${sortBy !== "pinned" ? "text-white" : "text-zinc-400"}`} />
          </div>

          {/* Compact Grid Columns dropdown (Desktop only: hidden on mobile) */}
          <div className="hidden sm:block relative font-sans" ref={gridDropdownRef}>
            <button
              type="button"
              onClick={() => setIsGridDropdownOpen(!isGridDropdownOpen)}
              className="p-1.5 px-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all flex items-center gap-1 cursor-pointer"
              title={t("library.grid_view", "Grid view (columns)")}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-bold font-mono">{booksPerRow}</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isGridDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {isGridDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 min-w-[130px] animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t("library.books_per_row_label", "Books per row")}
                </div>
                {[2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      handleBooksPerRowChange(num);
                      setIsGridDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      booksPerRow === num
                        ? "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span>{num} {i18n.language.startsWith("ru") ? (num >= 2 && num <= 4 ? t("library.books_ru_234", "книги") : t("library.books_ru_many", "книг")) : (num === 1 ? t("library.books_count", "book") : t("library.books_count_plural", "books"))}</span>
                    {booksPerRow === num && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!showArchived && (
            <button
              type="button"
              onClick={handlePlayAllFiltered}
              className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 active:scale-97 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
              title={t('player.play_all_title', 'Play all audio lessons continuously')}
            >
              <Headphones className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span className="hidden sm:inline">{t('player.play_all', 'Play All')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Visual Book Grid */}
      {isLoading ? (
        <div className={`grid ${gridColsClass} gap-3 sm:gap-6 md:gap-8`}>
          {Array.from({ length: booksPerRow * 2 }).map((_, idx) => (
            <div key={idx} className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-4 space-y-4 animate-pulse shadow-sm">
              <div className="w-full h-40 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-2xl" />
              <div className="space-y-2">
                <div className="h-4 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-lg w-3/4" />
                <div className="h-3 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-lg w-1/2" />
              </div>
              <div className="h-9 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (filteredLessons.length > 0 || filteredPlaylists.length > 0) ? (
        <>
          <div className={`grid ${gridColsClass} gap-3 sm:gap-6 md:gap-8`}>
            {/* Playlists Cards */}
            {currentPage === 1 && filteredPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                lessons={lessons}
                history={history}
                onSelectPlaylist={(id) => onSelectPlaylist ? onSelectPlaylist(id) : undefined}
                onDeletePlaylist={onDeletePlaylist}
                onToggleArchive={onToggleArchivePlaylist}
                onPlayAllPlaylist={onPlayAllPlaylist}
                languageFlags={languageFlags}
                settings={settings}
              />
            ))}

            {paginatedLessons.map((lesson) => {
              const cover = getLanguageCoverPreset(lesson.targetLanguage);
              const wordCount = getWordCount(lesson.text || "");
              const readTime = getReadingTime(lesson.text || "");
              const isYoutube = !!lesson.youtubeId || lesson.lessonType === "youtube";
              const youtubeDurationVal = isYoutube ? (lesson.youtubeDuration || getYoutubeDurationFromText(lesson.text || "")) : null;
              const hasAudio = Boolean(lesson.audioUrl || lesson.audioBase64 || lesson.lessonType === "audio" || lesson.lessonType === "podcast");
              const effectiveAudioDuration = lesson.audioDuration || (hasAudio ? getMaxTimestampInText(lesson.text) : null);
              const bookStats = computedStatsMap.get(lesson.id) || getCachedBookStats(lesson, vocab, wordLinks);

              return (
                <BookCard
                  key={lesson.id}
                  lesson={lesson}
                  bookStats={bookStats}
                  isVocabAvailable={isVocabAvailable}
                  cover={cover}
                  languageFlags={languageFlags}
                  settings={settings}
                  booksPerRow={booksPerRow}
                  isDeleting={deletingLessonId === lesson.id}
                  isMenuOpen={openMenuLessonId === lesson.id}
                  lessonTypes={lessonTypes}
                  playlists={playlists}
                  wordCount={wordCount}
                  readTime={readTime}
                  youtubeDurationVal={youtubeDurationVal}
                  effectiveAudioDuration={effectiveAudioDuration}
                  renderCircularFlag={renderCircularFlag}
                  getLanguageFlagEmoji={getLanguageFlagEmoji}
                  formatDuration={formatDuration}
                  onSelectLesson={onSelectLesson}
                  onDeleteLesson={onDeleteLesson}
                  onToggleArchiveLesson={onToggleArchiveLesson}
                  onTogglePinLesson={onTogglePinLesson}
                  onEditLesson={onEditLesson}
                  onOpenPlaylistModal={setPlaylistModalLesson}
                  onPlaySingleLesson={handlePlaySingleLesson}
                  onSetDeletingLessonId={setDeletingLessonId}
                  onToggleMenu={setOpenMenuLessonId}
                />
              );
            })}

          {/* Quick placeholder block for adding new books */}
          {!showArchived && currentPage === totalPages && (
            <div
              onClick={onOpenImportForm}
              className="group min-h-[300px] rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-teal-400 dark:hover:border-teal-900 bg-zinc-50/30 hover:bg-teal-50/5 dark:bg-transparent dark:hover:bg-zinc-900/10 cursor-pointer flex flex-col items-center justify-center p-6 text-center transition-all duration-200"
            >
              <div className="p-4 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-50 dark:from-zinc-800 dark:to-zinc-900 text-teal-600 dark:text-zinc-400 group-hover:scale-110 shadow-sm transition-all duration-300">
                <Plus className="w-6 h-6" />
              </div>
              <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-300 uppercase tracking-widest mt-4">{t("library.add_book", "Add book")}</h4>
              <p className="text-[11px] text-zinc-500 max-w-xs mt-1.5 leading-normal">
                {t("library.add_book_desc", "Download YouTube subtitles or paste any text with a cover!")}
              </p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-bold text-xs shadow-sm cursor-pointer"
            >{t("library.back", "Back")}</button>
            
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    currentPage === page
                      ? "bg-teal-600 text-white shadow-md border-transparent"
                      : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-bold text-xs shadow-sm cursor-pointer"
              >{t("library.next", "Next")}</button>
            </div>
          )}
        </>
      ) : showArchived ? (
        totalArchivedBooksCount === 0 ? (
          /* Styled empty archive state */
          <div className="bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/60 dark:border-zinc-800 p-8 sm:p-12 text-center rounded-2xl space-y-4 max-w-xl mx-auto shadow-sm animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto">
              <Archive className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest">
                {t("library.empty_archive", "Archive is empty")}
              </h3>
              <p className="text-xs text-zinc-500 leading-normal max-w-md mx-auto">
                {t("library.empty_archive_desc", "You have no archived books.")}
              </p>
            </div>
          </div>
        ) : (
          /* Styled empty search in archive state */
          <div className="bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/60 dark:border-zinc-800 p-8 sm:p-12 text-center rounded-2xl space-y-4 max-w-xl mx-auto shadow-sm animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto">
              <Search className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest">
                {t("library.no_books_found", "No books found")}
              </h3>
              <p className="text-xs text-zinc-500 leading-normal max-w-md mx-auto">
                {t("library.no_books_desc", "No books found matching search query.")}
              </p>
            </div>
            <div className="flex gap-2.5 items-center justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  onSelectTargetLanguage?.("All");
                  setFilterType("all");
                  setSelectedLessonType("All");
                }}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                {t("library.reset_search", "Reset search")}
              </button>
            </div>
          </div>
        )
      ) : totalActiveBooksCount === 0 ? (
        /* Scenario 1: Library is completely empty (new user) */
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white/70 dark:bg-zinc-900/70 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm max-w-xl mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center text-teal-600 dark:text-teal-400 shadow-inner">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
              {t("library.welcome_title", "Welcome to your Library!")}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-md mx-auto leading-normal">
              {t("library.welcome_desc", "Start by importing a YouTube video, adding a podcast, or creating your first reading lesson.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onOpenImportForm}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-97 text-white font-medium rounded-xl text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t("library.import_content", "Import Content")}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Scenario 2: Nothing found matching active search / filter */
        <div className="bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/60 dark:border-zinc-800 p-8 sm:p-12 text-center rounded-2xl space-y-4 max-w-xl mx-auto shadow-sm animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto">
            <Search className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest">
              {t("library.no_books_found", "No books found")}
            </h3>
            <p className="text-xs text-zinc-500 leading-normal max-w-md mx-auto">
              {t("library.no_books_desc", "No lessons match your active search query or filter.")}
            </p>
          </div>
          <div className="flex gap-2.5 items-center justify-center pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                onSelectTargetLanguage?.("All");
                setFilterType("all");
                setSelectedLessonType("All");
              }}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
            >
              {t("library.reset_search", "Reset search")}
            </button>
            <button
              type="button"
              onClick={onOpenImportForm}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              {t("library.import_book", "Import book")}
            </button>
          </div>
        </div>
      )}

      {/* Add to Playlist Modal */}
      {playlistModalLesson && (
        <AddToPlaylistModal
          isOpen={!!playlistModalLesson}
          onClose={() => setPlaylistModalLesson(null)}
          lesson={playlistModalLesson}
          playlists={playlists || []}
          languageFlags={languageFlags}
          onUpdatePlaylist={onUpdatePlaylist || (() => {})}
          onAddOrUpdateLesson={onAddOrUpdateLesson}
        />
      )}

    </div>
  );
}

export default memo(LibraryHome);
