import React, { useState, useMemo, memo, useRef, useEffect } from "react";
import { Lesson, LessonType, VocabItem, AppStats, ReaderSettings, HistoryEntry, LanguageListeningStat, Playlist } from "../types";
import { Search, BookOpen, Plus, Trash2, BookMarked, Sparkles, Filter, Archive, Check, Pencil, Pin, RefreshCw, TrendingUp, Lightbulb, Flame, ArrowRight, Loader2, ChevronUp, ChevronDown, Headphones, LayoutGrid, X, MoreVertical, ListVideo } from "lucide-react";
import { ICON_MAP, getCategoryIcon, getCategoryDisplayName } from "./ImportLessonForm";
import { normalizeContraction, safeLocalStorageSetItem, FLAG_EMOJI_TO_CODE, dedupeHistory } from "../utils";
import { getLocalizedLanguageName } from "../utils/stringUtils";
import { segmentSentenceTokens } from "../tokenizer";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { usePlaylistStore, PlaylistItem, isValidAudioUrl } from "../store/playlistStore";
import StatsWidget from "./StatsWidget";
import { ignoreListManager } from "../services/ignoreListService";
import PlaylistCard from "./playlist/PlaylistCard";
import AddToPlaylistModal from "./playlist/AddToPlaylistModal";

export function getDifficultyBadgeStyles(_level?: string) {
  // Clean, unified, high-contrast style matching the language pill with backdrop-blur
  return "bg-black/50 backdrop-blur-md text-white font-black border border-white/10 shadow-xs";
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

export function calculateBookStats(lesson: Lesson, vocab: Record<string, VocabItem>, wordLinks: Record<string, string>) {
  const zero = { knownPct: 0, unknownPct: 100, knownCount: 0, unknownCount: 0, ignoredCount: 0, uniqueKnownCount: 0, uniqueUnknownCount: 0, uniqueIgnoredCount: 0, uniqueTotal: 0, total: 0, eligibleTokens: 0, eligibleLemmas: 0, knownVocabularyPct: 0, unknownVocabularyPct: 100 };
  if (typeof lesson.text !== "string") return zero;

  const cleanText = lesson.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ");
  const tokens = segmentSentenceTokens(cleanText, lesson.targetLanguage || "spanish");
  const processedWords = tokens.filter(t => t.isWord && t.clean).map(t => t.clean);

  if (processedWords.length === 0) return zero;

  let knownCount = 0;
  let unknownCount = 0;
  let ignoredCount = 0;
  const lang = (lesson.targetLanguage || "spanish").toLowerCase();

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
    const selectedLangLower = selectedLanguage !== "All" ? selectedLanguage.toLowerCase() : null;
    const onlyParents = !!settings?.onlyPatterns;

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
    return saved ? parseInt(saved, 10) : 4;
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
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5";
      case 6:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
      default:
        return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
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
        list.add(l.targetLanguage);
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
        lesson.targetLanguage.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getLocalizedLanguageName(lesson.targetLanguage, i18n.language).toLowerCase().includes(searchQuery.toLowerCase());

      const matchesLanguage =
        selectedLanguage === "All" || lesson.targetLanguage === selectedLanguage;

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
        const sA = calculateBookStats(a, vocab, wordLinks);
        const sB = calculateBookStats(b, vocab, wordLinks);
        return sB.knownPct - sA.knownPct;
      }
      if (sortBy === "comprehension_low") {
        const sA = calculateBookStats(a, vocab, wordLinks);
        const sB = calculateBookStats(b, vocab, wordLinks);
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

  // Active counts
  const activeCount = lessons.filter(l => !l.isArchived).length + (playlists || []).filter(p => !p.isArchived).length;
  const archivedCount = lessons.filter(l => l.isArchived).length + (playlists || []).filter(p => p.isArchived).length;

  // Pagination logic
  // Установим пока 4 книги на страницу (позже можно вернуть 15), чтобы вы могли увидеть кнопки.
  const ITEMS_PER_PAGE = 15; 
  const totalPages = Math.ceil(filteredLessons.length / ITEMS_PER_PAGE);
  const paginatedLessons = filteredLessons.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const computedStatsMap = useMemo(() => {
    const map = new Map<string, any>();
    paginatedLessons.forEach((lesson) => {
      map.set(lesson.id, calculateBookStats(lesson, vocab, wordLinks));
    });
    return map;
  }, [paginatedLessons, vocab, wordLinks]);

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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <StatsWidget
        stats={languageAwareStats}
        selectedLanguage={selectedLanguage}
        onlyPatterns={!!settings?.onlyPatterns}
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

            const bookStats = computedStatsMap.get(lesson.id) || calculateBookStats(lesson, vocab, wordLinks);

            return (
              <div
                id={`book-card-${lesson.id}`}
                key={lesson.id}
                onClick={() => onSelectLesson(lesson.id)}
                className={`group relative bg-white dark:bg-zinc-900 rounded-2xl border ${
                  lesson.pinned
                    ? "border-amber-400 dark:border-amber-500/55 shadow-sm shadow-amber-100/10 ring-1 ring-amber-400/20"
                    : "border-zinc-200 dark:border-zinc-800"
                } hover:border-teal-200 dark:hover:border-teal-950 shadow-xs hover:shadow-xl dark:shadow-none hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden`}
              >
                {/* Book spine decorative border */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-black/20 via-transparent to-black/20 z-10"></div>

                {deletingLessonId === lesson.id && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md z-50 p-4 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150 text-white font-sans text-left"
                  >
                    <div className="flex flex-col items-center justify-center flex-1 text-center space-y-3">
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 shadow-inner">
                        <Trash2 className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="space-y-1.5 px-1">
                        <h4 className="text-xs font-black uppercase tracking-wider text-rose-400">{t("library.delete_book_title", "Delete book?")}</h4>
                        <p className="text-[11px] text-zinc-300 leading-normal font-sans">
                          {t("library.delete_book_confirm", "All saved words and progress for this book will be permanently deleted.")} <strong className="text-zinc-100 font-bold font-serif italic">"{lesson.title}"</strong>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLesson(lesson.id, e);
                          setDeletingLessonId(null);
                        }}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 active:scale-97 text-white font-black text-[11px] rounded-xl transition-all cursor-pointer shadow-md"
                      >{t("library.confirm_delete", "Yes, delete")}</button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLessonId(null);
                        }}
                        className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-97 text-zinc-300 border border-zinc-700/60 font-black text-[11px] rounded-xl transition-all cursor-pointer"
                      >{t("library.cancel", "Cancel")}</button>
                    </div>
                  </div>
                )}
                
                {/* Book Cover Banner */}
                <div 
                  className={`relative aspect-video ${lesson.coverUrl ? 'bg-zinc-950' : `bg-gradient-to-br ${cover.gradient}`} p-4 text-white flex flex-col justify-between overflow-hidden select-none`}
                >
                  {/* Ambient blurred backdrop for cover images */}
                  {lesson.coverUrl && (
                    <img 
                      src={lesson.coverUrl} 
                      alt="" 
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 select-none pointer-events-none"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("/maxresdefault.jpg")) {
                          target.src = target.src.replace("/maxresdefault.jpg", "/sddefault.jpg");
                        } else if (target.src.includes("/sddefault.jpg")) {
                          target.src = target.src.replace("/sddefault.jpg", "/hqdefault.jpg");
                        }
                      }}
                    />
                  )}

                  {/* Sharp image: 'article' fills completely (object-cover) without letterbox gaps, other types preserve aspect ratio (object-contain) */}
                  {lesson.coverUrl && (
                    <img 
                      src={lesson.coverUrl} 
                      alt="" 
                      className={`absolute inset-0 w-full h-full ${lesson.lessonType === 'article' || lesson.lessonType === 'website' ? 'object-cover' : 'object-contain'} z-0 select-none pointer-events-none drop-shadow-md`}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("/maxresdefault.jpg")) {
                          target.src = target.src.replace("/maxresdefault.jpg", "/sddefault.jpg");
                        } else if (target.src.includes("/sddefault.jpg")) {
                          target.src = target.src.replace("/sddefault.jpg", "/hqdefault.jpg");
                        }
                      }}
                    />
                  )}

                  {/* Optional dark overlay shadow for text contrast when enabled in settings */}
                  {lesson.coverUrl && settings?.dimBookCovers && (
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-900/30 to-zinc-950/30 z-[1] pointer-events-none"></div>
                  )}

                  {/* Subtle bottom gradient only for title contrast when dimming is disabled (default) */}
                  {lesson.coverUrl && !settings?.dimBookCovers && (
                    <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/65 via-black/25 to-transparent z-[1] pointer-events-none"></div>
                  )}

                  {/* Spine inner shade overlay */}
                  <div className="absolute left-1.5 top-0 bottom-0 w-3 bg-gradient-to-r from-black/25 via-black/10 to-transparent z-[2] pointer-events-none"></div>
                  
                  {/* Decorative background monogram text (only shown on gradients) */}
                  {!lesson.coverUrl && (
                    <div className="absolute right-2 bottom-0 text-7xl font-black text-white/10 transform translate-x-2 translate-y-3 pointer-events-none select-none font-serif">
                       {cover.character}
                    </div>
                  )}

                  {/* Top line cover info */}
                  <div className="flex items-center justify-between z-10 w-full animate-in fade-in duration-300">
                    <div className="flex items-center gap-1.5 max-w-[65%]">
                      <span className="flex items-center gap-1.5 text-[10px] font-black leading-none bg-black/45 backdrop-blur-md pl-1.5 pr-2.5 py-1 rounded-full border border-white/5 truncate">
                        {renderCircularFlag(getLanguageFlagEmoji(lesson.targetLanguage, languageFlags))}
                        <span className="truncate">{getLocalizedLanguageName(lesson.targetLanguage, i18n.language)}</span>
                      </span>
                      {lesson.difficulty && (
                        <span 
                          className="text-[9.5px] font-black leading-none px-2 py-1 rounded-full bg-black/50 backdrop-blur-md text-white border border-white/10 flex items-center justify-center shadow-xs cursor-default select-none shrink-0"
                          title={lesson.difficultyExplanation || `Уровень сложности: ${lesson.difficulty}`}
                        >
                          {lesson.difficulty}
                        </span>
                      )}

                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePinLesson(lesson.id, e);
                        }}
                        className={`p-1 rounded-lg backdrop-blur-md transition-all border leading-none cursor-pointer flex items-center justify-center ${
                          lesson.pinned
                            ? "bg-amber-500 text-white border-amber-400 font-extrabold shadow-sm hover:bg-amber-600 scale-110"
                            : "bg-black/40 text-zinc-300 border-white/10 hover:bg-black/60 hover:text-white hover:scale-110"
                        }`}
                        title={lesson.pinned ? "Открепить книгу (Unpin Book)" : "Закрепить книгу (Pin Book)"}
                      >
                        <Pin className={`w-3 h-3 ${lesson.pinned ? "fill-white" : ""}`} />
                      </button>
                      {(() => {
                        // If lessonType explicitly set, use it.
                        // If not set but lesson has audio → infer "podcast".
                        // Otherwise fall back to "book".
                        const hasAudio = !!(lesson.audioUrl || lesson.audioBase64);
                        const lType = lesson.lessonType || (hasAudio ? "podcast" : "book");
                        const typeInfo = lessonTypes.find((t) => t.id === lType);
                        const catLabel = getCategoryDisplayName(typeInfo?.id || lType, typeInfo?.name, t);
                        const IconComponent = getCategoryIcon(typeInfo?.icon || (hasAudio ? "podcast" : "book"), catLabel);
                        return (
                          <span className="text-[10px] font-black leading-none bg-black/40 backdrop-blur-md px-2 py-1.5 rounded-lg flex items-center gap-1 select-none text-zinc-100 border border-white/5">
                            <IconComponent className="w-3 h-3 text-teal-300" />
                            <span>{catLabel}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Big Cover Title */}
                  <div className="z-10 mt-auto">
                    <h3 className="text-sm font-black line-clamp-3 tracking-tight leading-snug drop-shadow-md group-hover:text-teal-300 transition-colors">
                      {lesson.title}
                    </h3>
                  </div>
                </div>

                {/* Details Section */}
                <div className={`${booksPerRow >= 5 ? 'p-2.5 space-y-2' : 'p-4 space-y-3'} flex-auto flex flex-col justify-between`}>

                  <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950/20 p-2 rounded-xl border border-zinc-200/50 dark:border-zinc-800/30 select-none">
                    <div className="flex justify-between items-center text-[9px] uppercase font-black tracking-widest text-zinc-400">
                      <span>{settings?.mainStatsMetric === "vocabulary" ? t("library.stat_vocab", "Vocabulary") : t("library.comprehension_caps", "Comprehension")}</span>
                      <span className="text-zinc-600 dark:text-zinc-300 font-extrabold">
                        {settings?.mainStatsMetric === "vocabulary" ? bookStats.knownVocabularyPct : bookStats.knownPct}%
                      </span>
                    </div>

                    {/* Proportional dual progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-sky-500/20 flex overflow-hidden">
                      {settings?.mainStatsMetric === "vocabulary" ? (
                        <>
                          <div 
                            style={{ width: `${bookStats.knownVocabularyPct}%` }}
                            className="bg-emerald-500 h-full transition-all duration-300 cursor-help"
                            title={`Словарный запас: ${bookStats.knownVocabularyPct}% (Изучено: ${bookStats.uniqueKnownCount} лемм из ${bookStats.eligibleLemmas} подлежащих изучению)`}
                          />
                          <div 
                            style={{ width: `${bookStats.unknownVocabularyPct}%` }}
                            className="bg-sky-400 h-full transition-all duration-300 cursor-help"
                            title={`Новых слов: ${bookStats.unknownVocabularyPct}% (${bookStats.uniqueUnknownCount} новых лемм из ${bookStats.eligibleLemmas})`}
                          />
                        </>
                      ) : (
                        <>
                          <div 
                            style={{ width: `${bookStats.knownPct}%` }}
                            className="bg-emerald-500 h-full transition-all duration-300 cursor-help"
                            title={`Понимание: ${bookStats.knownPct}% (Известно: ${bookStats.knownCount} из ${bookStats.eligibleTokens} подлежащих изучению токенов)`}
                          />
                          <div 
                            style={{ width: `${bookStats.unknownPct}%` }}
                            className="bg-sky-400 h-full transition-all duration-300 cursor-help"
                            title={`Непонимание: ${bookStats.unknownPct}% (Неизвестно: ${bookStats.unknownCount} из ${bookStats.eligibleTokens} токенов)`}
                          />
                        </>
                      )}
                    </div>

                    {settings?.showDetailedVocabularyStats !== false ? (
                      <div className="flex flex-col gap-0.5 text-[9px] font-extrabold font-sans">
                        <div className="flex justify-between items-center">
                          <span 
                            title={`Известные слова: ${bookStats.knownCount} вхождений (${bookStats.uniqueKnownCount} уникальных лемм из ${bookStats.eligibleLemmas} подлежащих изучению)`}
                            className="text-emerald-500 hover:underline cursor-help"
                          >
                            {t("library.understood_stat", "Understood:")} {bookStats.knownPct}% ({bookStats.knownCount} / {bookStats.eligibleTokens} {t("library.words", "words")})
                          </span>
                          <span 
                            title={`Неизвестные слова: ${bookStats.unknownCount} вхождений (${bookStats.uniqueUnknownCount} уникальных лемм)`}
                            className="text-sky-500 dark:text-sky-400 hover:underline cursor-help"
                          >
                            {t("library.not_understood", "Not Understood:")} {bookStats.unknownPct}% ({bookStats.unknownCount} {t("library.words", "words")})
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span 
                            title={`Уникальные изученные леммы: ${bookStats.uniqueKnownCount} из ${bookStats.eligibleLemmas} подлежащих изучению`}
                            className="text-emerald-500 dark:text-emerald-400 hover:underline cursor-help"
                          >
                            • {t("library.vocab_stat", "Vocabulary:")} {bookStats.knownVocabularyPct}% ({bookStats.uniqueKnownCount} / {bookStats.eligibleLemmas} {t("library.unique", "unique")})
                          </span>
                          <span 
                            title={`Новые уникальные леммы: ${bookStats.uniqueUnknownCount} из ${bookStats.eligibleLemmas}`}
                            className="text-sky-500 dark:text-sky-400 hover:underline cursor-help"
                          >
                            • {t("library.new_stat", "New:")} {bookStats.unknownVocabularyPct}% ({bookStats.uniqueUnknownCount} {t("library.unique", "unique")})
                          </span>
                        </div>
                        {bookStats.ignoredCount > 0 && (
                          <div className="flex justify-end">
                            <span 
                              title={`Пропущено как шум/имена: ${bookStats.ignoredCount} токенов, ${bookStats.uniqueIgnoredCount} уникальных лемм. Не входят в расчёт понимания.`}
                              className="text-zinc-400 dark:text-zinc-600 hover:underline cursor-help"
                            >
                              • {t("library.ignored_stat", "Ignored:")} {bookStats.ignoredCount} ({bookStats.uniqueIgnoredCount} {t("library.unique", "unique")})
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex justify-between items-center text-[9px] font-extrabold font-sans">
                        {settings?.mainStatsMetric === "vocabulary" ? (
                          <>
                            <span 
                              title={`Известные слова: ${bookStats.knownCount} из ${bookStats.eligibleTokens} подлежащих изучению`}
                              className="text-emerald-500 hover:underline cursor-help animate-none"
                            >
                              {t("library.understood_stat", "Understood:")} {bookStats.knownPct}%
                            </span>
                            <span 
                              title={`Неизвестные слова: ${bookStats.unknownCount} из ${bookStats.eligibleTokens} токенов`}
                              className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none"
                            >
                              {t("library.not_understood", "Not Understood:")} {bookStats.unknownPct}%
                            </span>
                          </>
                        ) : (
                          <>
                            <span 
                              title={`Словарный запас: ${bookStats.knownVocabularyPct}% (${bookStats.uniqueKnownCount} лемм из ${bookStats.eligibleLemmas} подлежащих изучению)`}
                              className="text-emerald-500 hover:underline cursor-help animate-none"
                            >
                              {t("library.vocab_stat", "Vocabulary:")} {bookStats.knownVocabularyPct}%
                            </span>
                            <span 
                              title={`Новых слов: ${bookStats.unknownVocabularyPct}% (${bookStats.uniqueUnknownCount} новых уникальных лемм)`}
                              className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none"
                            >
                              {t("library.new_stat", "New:")} {bookStats.unknownVocabularyPct}%
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {(() => {
                    const effectiveAudioDuration = lesson.audioDuration || getMaxTimestampInText(lesson.text);
                    return (
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500">
                        <span className="flex items-center gap-1">
                          📚 {wordCount} {t("library.words", "words")}
                        </span>
                        {isYoutube && youtubeDurationVal ? (
                          <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400" title={t("library.yt_duration", "YouTube Video Duration")}>
                            ⏱️ {formatDuration(youtubeDurationVal)}
                          </span>
                        ) : effectiveAudioDuration ? (
                          <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400" title={t("library.audio_duration", "Audio Duration")}>
                            ⏱️ {formatDuration(effectiveAudioDuration)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400" title={t("library.read_time", "Estimated Read Time")}>
                            ⏱️ ~{readTime} {t("library.min", "min")}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Actions row: Neutral Read Button + 3-dots Menu */}
                  <div className="flex gap-2 items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      id={`book-read-btn-${lesson.id}`}
                      onClick={() => onSelectLesson(lesson.id)}
                      className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-98 text-zinc-800 dark:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 font-bold text-xs rounded-xl shadow-3xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                      <span>{bookStats.knownPct > 0 || bookStats.uniqueKnownCount > 0 ? t("library.continue_btn", "Continue") : t("library.read_btn", "Read")}</span>
                    </button>

                    {/* Secondary Actions 3-dots Menu */}
                    <div className="relative font-sans" ref={openMenuLessonId === lesson.id ? menuRef : null}>
                      <button
                        type="button"
                        id={`book-menu-btn-${lesson.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuLessonId(openMenuLessonId === lesson.id ? null : lesson.id);
                        }}
                        className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                          openMenuLessonId === lesson.id
                            ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600"
                            : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200/60 dark:border-zinc-700/60"
                        }`}
                        title={t("common.more_actions", "More actions")}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openMenuLessonId === lesson.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-full mb-1.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 min-w-[175px] animate-in fade-in zoom-in-95 duration-100 space-y-0.5"
                        >
                          {/* Quick Play Audio option */}
                          {isValidAudioUrl(lesson.audioUrl, lesson.audioBase64, lesson.youtubeId, lesson.localVideoUrl) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuLessonId(null);
                                handlePlaySingleLesson(lesson);
                              }}
                              className="w-full px-2.5 py-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Headphones className="w-3.5 h-3.5" />
                              <span>{t('player.play_now', 'Play audio')}</span>
                            </button>
                          )}

                          {/* Edit book */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuLessonId(null);
                              onEditLesson(lesson, e);
                            }}
                            className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{t('library.edit_tooltip', 'Edit book')}</span>
                          </button>

                          {/* Add to playlist */}
                          {playlists && playlists.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuLessonId(null);
                                setPlaylistModalLesson(lesson);
                              }}
                              className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <ListVideo className="w-3.5 h-3.5 text-zinc-400" />
                              <span>{t('playlist.add_to_playlist_action', 'Add to playlist...')}</span>
                            </button>
                          )}

                          {/* Archive / Restore */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuLessonId(null);
                              onToggleArchiveLesson(lesson.id, e);
                            }}
                            className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{lesson.isArchived ? t("library.restore_tooltip", "Restore to bookshelf") : t("library.archive_tooltip", "Move to archive")}</span>
                          </button>

                          <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuLessonId(null);
                              setDeletingLessonId(lesson.id);
                            }}
                            className="w-full px-2.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            <span>{t('library.delete_tooltip', 'Delete book')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
      ) : (
        /* Styled empty search state */
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center rounded-2xl space-y-4 max-w-xl mx-auto shadow-sm">
          <BookOpen className="w-12 h-12 text-zinc-300 mx-auto" aria-hidden="true" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest">
            {showArchived ? t("library.empty_archive", "Archive is empty") : t("library.no_books_found", "No books found")}
          </h3>
          <p className="text-xs text-zinc-500 leading-normal max-w-md mx-auto">
            {showArchived 
              ? t("library.empty_archive_desc", "You have no archived books.")
              : t("library.no_books_desc", "No books found matching search query.")}
          </p>
          <div className="flex gap-2.5 items-center justify-center pt-2">
            <button
              onClick={() => {
                setSearchQuery("");
                onSelectTargetLanguage?.("All");
                setFilterType("all");
              }}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors"
            >{t("library.reset_search", "Reset search")}</button>
            {!showArchived && (
              <button
                onClick={onOpenImportForm}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >{t("library.import_book", "Import book")}</button>
            )}
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
