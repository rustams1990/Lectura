/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, memo } from "react";
import { Lesson, LessonType, VocabItem, AppStats, ReaderSettings } from "../types";
import { Search, BookOpen, Plus, Trash2, BookMarked, Sparkles, Filter, Archive, Check, Pencil, Pin, RefreshCw, TrendingUp, Lightbulb, Flame, ArrowRight, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { ICON_MAP, getCategoryIcon, getCategoryDisplayName } from "./ImportLessonForm";
import { normalizeContraction, safeLocalStorageSetItem, FLAG_EMOJI_TO_CODE } from "../utils";
import { segmentSentenceTokens } from "../tokenizer";
import { useTranslation } from "react-i18next";

export function getDifficultyBadgeStyles(level: string) {
  const lvl = (level || "").toUpperCase();
  if (lvl.startsWith("A1")) {
    return "border-emerald-500/30 text-emerald-400 dark:text-emerald-300 bg-emerald-500/10";
  }
  if (lvl.startsWith("A2")) {
    return "border-teal-500/30 text-teal-400 dark:text-teal-300 bg-teal-500/10";
  }
  if (lvl.startsWith("B1")) {
    return "border-cyan-500/30 text-cyan-450 dark:text-cyan-300 bg-cyan-500/10";
  }
  if (lvl.startsWith("B2")) {
    return "border-blue-500/30 text-blue-400 dark:text-blue-300 bg-blue-500/10";
  }
  if (lvl.startsWith("C1")) {
    return "border-indigo-500/30 text-indigo-450 dark:text-indigo-300 bg-indigo-500/10";
  }
  if (lvl.startsWith("C2")) {
    return "border-violet-500/30 text-violet-450 dark:text-violet-300 bg-violet-500/10";
  }
  return "border-zinc-500/30 text-zinc-400 dark:text-zinc-300 bg-zinc-500/10";
}

interface LibraryHomeProps {
  lessons: Lesson[];
  lessonTypes: LessonType[];
  onSelectLesson: (id: string) => void;
  onOpenImportForm: () => void;
  onDeleteLesson: (id: string, e: React.MouseEvent) => void;
  onToggleArchiveLesson: (id: string, e: React.MouseEvent) => void;
  onTogglePinLesson: (id: string, e: React.MouseEvent) => void;
  onEditLesson: (lesson: Lesson, e: React.MouseEvent) => void;
  stats: AppStats;
  vocab: Record<string, any>;
  wordLinks: Record<string, string>;
  languageFlags: Record<string, string>;
  settings?: ReaderSettings;
  isLoading?: boolean;
}

function calculateBookStats(lesson: Lesson, vocab: Record<string, VocabItem>, wordLinks: Record<string, string>) {
  if (typeof lesson.text !== "string") {
    return { knownPct: 0, unknownPct: 100, knownCount: 0, unknownCount: 0, uniqueKnownCount: 0, uniqueUnknownCount: 0, uniqueTotal: 0, total: 0, knownVocabularyPct: 0, unknownVocabularyPct: 100 };
  }
  const cleanText = lesson.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ");
  const tokens = segmentSentenceTokens(cleanText, lesson.targetLanguage || "spanish");
  const processedWords = tokens.filter(t => t.isWord && t.clean).map(t => t.clean);

  if (processedWords.length === 0) {
    return { knownPct: 0, unknownPct: 100, knownCount: 0, unknownCount: 0, uniqueKnownCount: 0, uniqueUnknownCount: 0, uniqueTotal: 0, total: 0, knownVocabularyPct: 0, unknownVocabularyPct: 100 };
  }

  let knownCount = 0;
  let unknownCount = 0;
  const lang = (lesson.targetLanguage || "spanish").toLowerCase();

  const uniqueUnknownWords = new Set<string>();
  const uniqueKnownWords = new Set<string>();
  const uniqueTotalWords = new Set<string>();

  processedWords.forEach(word => {
    const key = word.toLowerCase();
    const langKey = `${lang}_${key}`;
    const resolvedKey = (wordLinks[langKey] || wordLinks[key] || key).replace(/^[a-zA-Z]+_/, "");
    const langKeyForResolved = `${lang}_${resolvedKey}`;
    
    let item = vocab[langKeyForResolved] || vocab[resolvedKey];
    
    if (!item) {
      const normalized = normalizeContraction(resolvedKey, lang);
      if (normalized !== resolvedKey) {
        const normLangKey = `${lang}_${normalized}`;
        item = vocab[normLangKey] || vocab[normalized];
      }
    }

    uniqueTotalWords.add(resolvedKey);
    if (item && (item.status === "known" || item.status === "ignored")) {
      knownCount++;
      uniqueKnownWords.add(resolvedKey);
    } else {
      unknownCount++;
      uniqueUnknownWords.add(resolvedKey);
    }
  });

  const total = processedWords.length;
  const knownPct = Math.round((knownCount / total) * 100);

  const uniqueUnknownCount = Array.from(uniqueUnknownWords).filter(w => !uniqueKnownWords.has(w)).length;
  const uniqueKnownCount = uniqueKnownWords.size;
  const uniqueTotal = uniqueTotalWords.size;

  const uniqueTotalLemmas = uniqueKnownCount + uniqueUnknownCount;
  const knownVocabularyPct = uniqueTotalLemmas > 0 ? Math.round((uniqueKnownCount / uniqueTotalLemmas) * 100) : 0;
  const unknownVocabularyPct = 100 - knownVocabularyPct;

  return {
    knownPct,
    unknownPct: 100 - knownPct,
    knownCount,
    unknownCount,
    uniqueKnownCount,
    uniqueUnknownCount,
    uniqueTotal,
    total,
    knownVocabularyPct,
    unknownVocabularyPct
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
  if (l.includes("swed") || l.includes("se")) {
    return {
      gradient: "from-blue-600 via-sky-500 to-yellow-400",
      accent: "bg-blue-100 text-blue-950 dark:bg-blue-950/45 dark:text-blue-300",
      emoji: "🇸🇪",
      character: "Å",
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
  lessonTypes,
  onSelectLesson,
  onOpenImportForm,
  onDeleteLesson,
  onToggleArchiveLesson,
  onTogglePinLesson,
  onEditLesson,
  stats,
  vocab,
  wordLinks,
  languageFlags,
  settings,
  isLoading = false,
}: LibraryHomeProps) {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("All");
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

  // Smart Banner Dashboard state & helpers
  const [isBannerCollapsed, setIsBannerCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("vocab_clone_hero_collapsed") === "true";
  });

  const toggleBannerCollapse = () => {
    setIsBannerCollapsed(prev => {
      const next = !prev;
      safeLocalStorageSetItem("vocab_clone_hero_collapsed", String(next));
      return next;
    });
  };

  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * 8));
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("vocab_clone_daily_word_goal");
    return saved ? parseInt(saved, 10) : 5;
  });

  const LANGUAGE_TIPS = [
    t('library.tip_1', "Подключайте слух: слушайте озвучку одновременно с чтением — это активирует слуховую кору мозга."),
    t('library.tip_2', "Не зубрите слова отдельно: запоминайте их в контексте фраз. Мозг обожает контекстуальные связи!"),
    t('library.tip_3', "Интервальное повторение: возвращайтесь к сложным словам через 1 день, затем через 3 и 7 дней."),
    t('library.tip_4', "Лингво-совет: Читайте вслух те предложения, где встретили новые слова, чтобы тренировать артикуляцию."),
    t('library.tip_5', "Разгадывайте корни: у многих языков есть схожие латинские или общие корни. Ищите аналогии для запоминания!"),
    t('library.tip_6', "Метод активного чтения: не бойтесь новых слов! Ваша цель — перевести их в статус 'изучаемых' и читать дальше."),
    t('library.tip_7', "Короткие сессии рулят: 15 минут увлекательного чтения каждый день эффективнее, чем 2 часа раз в неделю."),
    t('library.tip_8', "Понимайте суть: не обязательно переводить каждое слово. Учитесь догадываться в контексте!")
  ];

  const handleCycleGoal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const goals = [5, 10, 15, 25, 50, 100];
    const currentIndex = goals.indexOf(dailyGoal);
    const nextIndex = (currentIndex + 1) % goals.length;
    const nextGoal = goals[nextIndex === -1 ? 0 : nextIndex];
    setDailyGoal(nextGoal);
    safeLocalStorageSetItem("vocab_clone_daily_word_goal", nextGoal.toString());
  };

  const handleNextTip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTipIndex((prev) => (prev + 1) % LANGUAGE_TIPS.length);
  };

  const lastOpenedLessonId = useMemo(() => {
    return localStorage.getItem("vocab_clone_last_active_lesson_id") || null;
  }, []);

  const resumeLesson = useMemo(() => {
    if (lessons.length === 0) return null;
    const last = lessons.find((l) => l.id === lastOpenedLessonId && !l.isArchived);
    if (last) return last;
    return lessons.find((l) => !l.isArchived) || null;
  }, [lessons, lastOpenedLessonId]);

  const resumeLessonStats = useMemo(() => {
    if (!resumeLesson || typeof resumeLesson.text !== "string") return null;
    const rawParts = resumeLesson.text.split(/\s+/);
    const processedWords = rawParts.map(part => {
      if (!part) return "";
      const clean = part.replace(/^[^\w\p{L}]+|[^\w\p{L}]+$/gu, "").toLowerCase();
      const isNumericOrTimestamp = (str: string): boolean => {
        if (/\d/.test(str)) {
          if (/\d+:\d+/.test(str)) return true;
          if (/^\d+([.,%/-]\d+)*%?$/.test(str)) return true;
          if (/^\d+[a-zA-Z]+$/.test(str)) return true;
          if (!/\p{L}/u.test(str)) return true;
        }
        return false;
      };
      if (clean.length > 0 && !/^\d+$/.test(clean) && !isNumericOrTimestamp(clean)) {
        return clean;
      }
      return "";
    }).filter(w => w.length > 0);

    if (processedWords.length === 0) return { knownPct: 0, rawCount: 0 };

    let knownCount = 0;
    const lang = (resumeLesson.targetLanguage || "spanish").toLowerCase();

    processedWords.forEach(word => {
      const key = word.toLowerCase();
      const langKey = `${lang}_${key}`;
      const resolvedKey = (wordLinks[langKey] || wordLinks[key] || key).replace(/^[a-zA-Z]+_/, "");
      const langKeyForResolved = `${lang}_${resolvedKey}`;
      let item = vocab[langKeyForResolved] || vocab[resolvedKey];
      
      // Contraction status inheritance
      if (!item) {
        const normalized = normalizeContraction(resolvedKey, lang);
        if (normalized !== resolvedKey) {
          const normLangKey = `${lang}_${normalized}`;
          item = vocab[normLangKey] || vocab[normalized];
        }
      }

      if (item && (item.status === "known" || item.status === "ignored")) {
        knownCount++;
      }
    });

    return {
      knownPct: Math.round((knownCount / processedWords.length) * 100),
      rawCount: processedWords.length
    };
  }, [resumeLesson, vocab, wordLinks]);

  const todayCreatedCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startTs = todayStart.getTime();

    return Object.values(vocab).filter((item: any) => {
      return item && item.createdAt && item.createdAt >= startTs;
    }).length;
  }, [vocab]);

  const [booksPerRow, setBooksPerRow] = useState<number>(() => {
    const saved = localStorage.getItem("vocab_books_per_row");
    return saved ? parseInt(saved, 10) : 4;
  });

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

  // If the selected language is no longer available in the current view, reset to "All"
  React.useEffect(() => {
    if (selectedLanguage !== "All" && !availableLanguages.includes(selectedLanguage)) {
      setSelectedLanguage("All");
    }
  }, [availableLanguages, selectedLanguage]);

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

      const matchesSearch =
        lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lesson.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lesson.targetLanguage.toLowerCase().includes(searchQuery.toLowerCase());

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

      return matchesArchive && matchesSearch && matchesLanguage && matchesType && matchesLessonType;
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

  // Active counts
  const activeCount = lessons.filter(l => !l.isArchived).length;
  const archivedCount = lessons.filter(l => l.isArchived).length;

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

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLanguage, filterType, selectedLessonType, showArchived]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
      
      {/* Visual welcome bookshelf header */}
      {isBannerCollapsed ? (
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-r dark:from-emerald-950 dark:via-teal-950 dark:to-zinc-950 px-4 py-2.5 text-zinc-800 dark:text-white flex items-center justify-between border border-zinc-200/80 dark:border-teal-800/30 shadow-xs dark:shadow-md transition-all">
          <div className="flex items-center gap-3 text-xs font-bold truncate">
            <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-amber-300 border border-teal-200/60 dark:border-teal-800/40">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="truncate text-zinc-800 dark:text-white font-extrabold">{t('library.smart_bookshelf', 'Your Smart Bookshelf')}</span>
            <div className="hidden sm:flex items-center gap-2.5 text-[11px] text-zinc-500 dark:text-teal-200 ml-2 font-medium">
              <span>• {t('library.total', 'Total:')} <strong className="text-zinc-800 dark:text-white font-bold">{lessons.length}</strong></span>
              <span>• {t('library.active', 'Active:')} <strong className="text-teal-700 dark:text-amber-300 font-bold">{activeCount}</strong></span>
              <span>• {t('library.archived', 'Archived:')} <strong className="text-zinc-600 dark:text-teal-300 font-bold">{archivedCount}</strong></span>
            </div>
          </div>
          <button
            onClick={toggleBannerCollapse}
            className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-600 dark:text-teal-200 hover:text-zinc-900 dark:hover:text-white px-3 py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/20 active:scale-95 transition cursor-pointer shrink-0 border border-zinc-200/80 dark:border-white/10"
            title={t('library.expand_banner', 'Expand library banner')}
          >
            <span>{t('library.expand', 'Expand')}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-900 to-zinc-950 dark:from-emerald-950 dark:via-teal-950 dark:to-zinc-950 p-4 sm:p-6 text-white shadow-lg flex flex-col justify-between border border-teal-700/40 dark:border-teal-800/20">
          
          {/* Ambient floating elements */}
          <div className="absolute right-0 top-0 opacity-10 translate-x-10 -translate-y-10 transform scale-150 select-none pointer-events-none">
            <BookMarked className="w-96 h-96" />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch relative z-10 w-full">
            
            {/* Column 1: Info & Welcome Narrative */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/60 text-xs font-semibold tracking-wide text-white border border-teal-800/30 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                    <span>{t('library.smart_bookshelf', 'Your Smart Bookshelf')}</span>
                  </div>
                  
                  <button
                    onClick={toggleBannerCollapse}
                    className="flex items-center gap-1 text-[11px] font-bold text-teal-200 hover:text-white px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition cursor-pointer shrink-0 border border-white/10"
                    title={t('library.collapse_banner', 'Collapse library banner')}
                  >
                    <span>{t('library.collapse', 'Collapse')}</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h2 className="text-xl sm:text-3xl font-black tracking-tight mt-2 max-w-xl leading-tight text-white drop-shadow-sm">
                  {t('library.hero_title', 'What story will you learn today?')}
                </h2>
                <p className="text-xs sm:text-sm font-medium text-teal-100 max-w-md mt-1.5 opacity-95 leading-relaxed font-sans hidden sm:block">
                  {t('library.hero_subtitle', 'Interactive reading method: tap on any unfamiliar words, download translations and listen to audio!')}
                </p>
              </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 sm:mt-6 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">{t('library.total', 'Total books:')}</span>
                <span className="text-xs font-bold bg-white/15 px-2.5 py-0.5 rounded-md text-white">{lessons.length}</span>
              </div>
              
              <div className="h-4 w-px bg-white/15 hidden sm:block"></div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">{t('library.active', 'Active:')}</span>
                <span className="text-xs font-bold text-amber-300 bg-teal-950/40 px-2 py-0.5 rounded-md border border-teal-800/20">{activeCount}</span>
              </div>

              <div className="h-4 w-px bg-white/15 hidden sm:block"></div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">{t('library.archived', 'Archived:')}</span>
                <span className="text-xs font-bold text-teal-300 bg-teal-950/40 px-2 py-0.5 rounded-md border border-teal-800/20">{archivedCount}</span>
              </div>
            </div>
          </div>

          {/* Column 2: Compact Interactive Widget Panel */}
          <div className="lg:col-span-5 xl:col-span-4 bg-teal-950/50 backdrop-blur-xl rounded-2xl p-4.5 border border-teal-800/30 flex flex-col justify-between space-y-4 shadow-inner">
            
            {/* Daily word goal item */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-widest text-teal-200">
                <span className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>{t('library.progress_today', 'Progress for today')}</span>
                </span>
                <button
                  onClick={handleCycleGoal}
                  className="cursor-pointer text-[9px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 active:scale-95 px-2 py-0.5 rounded-md transition-all text-amber-200 border border-white/10 select-none"
                  title={t('library.goal_title', 'Click to set daily limit')}
                >
                  {t('library.goal', 'Goal:')} {dailyGoal} {t('library.words', 'words')}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-white">
                  {t('library.new_words', 'New words:')} <strong className="font-extrabold text-amber-300">{todayCreatedCount}</strong> {t('library.of', 'of')} {dailyGoal}
                </span>
                <span className="font-bold text-teal-100 font-mono text-[10px]">
                  {Math.round(Math.min(100, (todayCreatedCount / dailyGoal) * 100))}%
                </span>
              </div>

              {/* Goal progress slider */}
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, (todayCreatedCount / dailyGoal) * 100)}%` }}
                  className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-500"
                />
              </div>

              {todayCreatedCount >= dailyGoal ? (
                <p className="text-[9px] text-amber-300 font-black animate-pulse flex items-center gap-1">
                  {t("library.goal_achieved", "🎉 Great achievement! Daily goal completed!")}
                </p>
              ) : (
                <p className="text-[9px] text-teal-100/80 font-medium leading-none">
                  {t("library.more_words_needed", "Mark {{count}} more words to finish your daily goal.", { count: dailyGoal - todayCreatedCount })}
                </p>
              )}
            </div>

            {/* Resume last Book info */}
            {resumeLesson ? (
              <div className="border-t border-white/10 pt-3 flex flex-col space-y-2">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-teal-200 flex items-center gap-1 select-none">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-300" />
                  <span>{t("library.continue_reading", "CONTINUE READING")}</span>
                </span>
                
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    {renderCircularFlag(getLanguageFlagEmoji(resumeLesson.targetLanguage, languageFlags))}
                    <div className="overflow-hidden">
                      <h4 className="text-xs font-black truncate text-white" title={resumeLesson.title}>
                        {resumeLesson.title}
                      </h4>
                      <p className="text-[9px] text-teal-200 select-none">
                        {t("library.understood", "Understood:")} <strong className="font-extrabold text-emerald-300">{resumeLessonStats?.knownPct}%</strong>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectLesson(resumeLesson.id)}
                    className="cursor-pointer px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-950/25 border border-emerald-600 flex items-center gap-1 select-none shrink-0"
                  >
                    <span>{t("library.start", "Start")}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : null}

            {/* Tip of the day widget */}
            <div className="border-t border-white/10 pt-3 flex items-start gap-1.5 text-[10px] select-none">
              <div className="p-1 bg-amber-400/20 rounded-md shrink-0">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-teal-200 uppercase tracking-widest text-[8px]">{t("library.tip_of_day", "TIP OF THE DAY")}</span>
                  <button
                    onClick={handleNextTip}
                    className="text-white/80 hover:text-amber-300 active:scale-90 p-0.5 tracking-normal cursor-pointer transition-all shrink-0"
                    title={t("library.change_tip", "Change tip")}
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                  </button>
                </div>
                <p className="text-teal-100/90 italic font-medium leading-tight">
                  "{LANGUAGE_TIPS[tipIndex]}"
                </p>
              </div>
            </div>

          </div>

        </div>
      </div>
      )}

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

      {/* Advanced Search & Filtering Console */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          
          {/* Main search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400/85 w-4 h-4" />
            <input
              type="text"
              id="library-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("library.search_placeholder", "Search by title or content...")}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* Filtering buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === "all"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {t('library.all_sources', 'All Sources')}
            </button>
            <button
              onClick={() => setFilterType("builtin")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === "builtin"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {t('library.builtin', 'Built-in')}
            </button>
            <button
              onClick={() => setFilterType("custom")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === "custom"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {t('library.imported', 'Imported')}
            </button>

            {/* Sort dropdown */}
            <div className="relative flex items-center">
              <select
                id="library-sort-select"
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                title={t("library.sort_title_attr", "Sort books")}
                className={`pl-3 pr-7 py-1.5 text-xs font-bold rounded-lg transition-all appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/30 ${
                  sortBy !== "pinned"
                    ? "bg-teal-600 text-white border-teal-700 shadow-xs"
                    : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <option value="pinned">{t('library.sort_pinned', '📌 Pinned')}</option>
                <option value="newest">{t('library.sort_newest', '🕐 Newest first')}</option>
                <option value="oldest">{t('library.sort_oldest', '📅 Oldest first')}</option>
                <option value="title">{t('library.sort_title', '🔤 Title A-Z')}</option>
                <option value="title_desc">{t('library.sort_title_desc', '🔤 Title Z-A')}</option>
                <option value="comprehension_high">{t('library.sort_comp_high', '📊 Comprehension: high')}</option>
                <option value="comprehension_low">{t('library.sort_comp_low', '📊 Comprehension: low')}</option>
                <option value="length_short">{t('library.sort_short', '📖 Short')}</option>
                <option value="length_long">{t('library.sort_long', '📖 Long')}</option>
              </select>
              {/* Custom chevron icon for the select */}
              <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${
                sortBy !== "pinned" ? "text-white" : "text-zinc-400"
              }`}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </div>

            {!showArchived && (
              <button
                type="button"
                onClick={onOpenImportForm}
                className="ml-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 active:scale-97 text-white font-black text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-sm shadow-teal-100/30 dark:shadow-none"
              >
                <Plus className="w-4 h-4" />
                {t('library.create_book', 'Create book')}
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Language Filter Chips Row */}
        {availableLanguages.length > 2 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center gap-2">
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> {t("library.languages", "Languages:")}
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {availableLanguages.map((lang) => {
                const isActive = selectedLanguage === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => setSelectedLanguage(lang)}
                    className={`flex items-center gap-2 pl-1.5 pr-3.5 py-1 rounded-full text-[11px] font-extrabold transition-all border ${
                      isActive
                        ? "bg-white text-teal-700 border-teal-300 dark:bg-zinc-900 dark:text-teal-400 dark:border-teal-800 shadow-sm"
                        : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border-transparent"
                    }`}
                  >
                    {lang === "All" ? (
                      <>
                        {renderCircularFlag("🌍", true)}
                        <span>{t("library.all_languages", "All languages")}</span>
                      </>
                    ) : (
                      <>
                        {renderCircularFlag(getLanguageFlagEmoji(lang, languageFlags))}
                        <span>{lang}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dynamic Category Filter chips row */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center gap-2">
          <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mr-1 animate-pulse">
            <Filter className="w-3 h-3" /> {t("library.categories", "Categories:")}
          </span>
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setSelectedLessonType("All")}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer border ${
                selectedLessonType === "All"
                  ? "bg-teal-50/95 text-teal-700 border-teal-300 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-900 shadow-xs"
                  : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 border-transparent"
              }`}
            >
              🔍 {t("library.all", "All")}
            </button>

            {lessonTypes.map((type) => {
              const IconComponent = getCategoryIcon(type.icon, type.name);
              const isSelected = selectedLessonType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedLessonType(type.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer border ${
                    isSelected
                      ? "bg-teal-50/95 text-teal-700 border-teal-300 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-900 shadow-xs"
                      : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 border-transparent"
                  }`}
                >
                  <IconComponent className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>{getCategoryDisplayName(type.id, type.name, t)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Books per row setting / Grid Column Selector */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              📐 {t("library.grid_view", "Grid view:")}
            </span>
            <span className="text-xs text-zinc-500 font-medium">{t("library.books_per_row_label", "Books per row")}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl shrink-0 border border-zinc-200/50 dark:border-zinc-800/50">
            {[2, 3, 4, 5, 6].map((num) => {
              const isActive = booksPerRow === num;
              return (
                <button
                  type="button"
                  key={num}
                  onClick={() => handleBooksPerRowChange(num)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {num} {i18n.language.startsWith("en") ? (num === 1 ? t("library.books_count", "book") : t("library.books_count_plural", "books")) : (num >= 2 && num <= 4 ? t("library.books_ru_234", "книги") : t("library.books_ru_many", "книг"))}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Visual Book Grid */}
      {isLoading ? (
        <div className={`grid ${gridColsClass} gap-6 md:gap-8`}>
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
      ) : filteredLessons.length > 0 ? (
        <>
          <div className={`grid ${gridColsClass} gap-6 md:gap-8`}>
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
                  className={`relative aspect-video bg-gradient-to-br ${cover.gradient} p-4 text-white flex flex-col justify-between overflow-hidden select-none bg-cover bg-center`}
                  style={lesson.coverUrl ? { backgroundImage: `url("${lesson.coverUrl}")` } : undefined}
                >
                  {/* Overlay shadow for text contrast when using images */}
                  {lesson.coverUrl && (
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-900/40 to-transparent z-0"></div>
                  )}

                  {/* Spine inner shade overlay */}
                  <div className="absolute left-1.5 top-0 bottom-0 w-3 bg-gradient-to-r from-black/25 via-black/10 to-transparent"></div>
                  
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
                        <span className="truncate">{lesson.targetLanguage}</span>
                      </span>
                      {lesson.difficulty && (
                        <span 
                          className={`text-[9px] font-extrabold leading-none px-2 py-1 rounded-full border border-white/10 flex items-center justify-center shadow-xs cursor-default select-none shrink-0 ${
                            getDifficultyBadgeStyles(lesson.difficulty)
                          }`}
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
                            title={`Словарный запас: ${bookStats.knownVocabularyPct}% (Изучено: ${bookStats.uniqueKnownCount} уникальных лемм из ${bookStats.uniqueKnownCount + bookStats.uniqueUnknownCount})`}
                          />
                          <div 
                            style={{ width: `${bookStats.unknownVocabularyPct}%` }}
                            className="bg-sky-400 h-full transition-all duration-300 cursor-help"
                            title={`Новых слов: ${bookStats.unknownVocabularyPct}% (Новых: ${bookStats.uniqueUnknownCount} уникальных лемм из ${bookStats.uniqueKnownCount + bookStats.uniqueUnknownCount})`}
                          />
                        </>
                      ) : (
                        <>
                          <div 
                            style={{ width: `${bookStats.knownPct}%` }}
                            className="bg-emerald-500 h-full transition-all duration-300 cursor-help"
                            title={`Понимание: ${bookStats.knownPct}% (Известно слов: ${bookStats.knownCount} из ${bookStats.total}, уникальных: ${bookStats.uniqueKnownCount} из ${bookStats.uniqueTotal})`}
                          />
                          <div 
                            style={{ width: `${bookStats.unknownPct}%` }}
                            className="bg-sky-400 h-full transition-all duration-300 cursor-help"
                            title={`Непонимание: ${bookStats.unknownPct}% (Неизвестно слов: ${bookStats.unknownCount} из ${bookStats.total}, уникальных: ${bookStats.uniqueUnknownCount} из ${bookStats.uniqueTotal})`}
                          />
                        </>
                      )}
                    </div>

                    {settings?.showDetailedVocabularyStats !== false ? (
                      <div className="flex justify-between items-start text-[9px] font-extrabold font-sans">
                        <div className="flex flex-col text-left">
                          <span 
                            title={`Известные слова во фрагменте: ${bookStats.knownCount} вхождений (${bookStats.uniqueKnownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                            className="text-emerald-500 hover:underline cursor-help animate-none"
                          >
                            {t("library.understood_stat", "Understood:")} {bookStats.knownPct}% ({bookStats.knownCount} {t("library.words", "words")})
                          </span>
                          <span 
                            title={`Процент уникального словаря: ${bookStats.knownVocabularyPct}% (${bookStats.uniqueKnownCount} уникальных лемм)`}
                            className="text-emerald-500 dark:text-emerald-400 hover:underline cursor-help animate-none mt-0.5"
                          >
                            • {t("library.vocab_stat", "Vocabulary:")} {bookStats.knownVocabularyPct}% ({bookStats.uniqueKnownCount} {t("library.unique", "unique")})
                          </span>
                        </div>
                        <div className="flex flex-col text-right animate-none">
                          <span 
                            title={`Неизвестные или новые слова во фрагменте: ${bookStats.unknownCount} вхождений (${bookStats.uniqueUnknownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                            className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none"
                          >
                            {t("library.not_understood", "Not Understood:")} {bookStats.unknownPct}% ({bookStats.unknownCount} {t("library.words", "words")})
                          </span>
                          <span 
                            title={`Процент незнакомых уникальных лемм: ${bookStats.unknownVocabularyPct}% (${bookStats.uniqueUnknownCount} уникальных лемм)`}
                            className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none mt-0.5"
                          >
                            • {t("library.new_stat", "New:")} {bookStats.unknownVocabularyPct}% ({bookStats.uniqueUnknownCount} {t("library.unique", "unique")})
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center text-[9px] font-extrabold font-sans">
                        <span 
                          title={`Известные слова во фрагменте: ${bookStats.knownCount} вхождений (${bookStats.uniqueKnownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                          className="text-emerald-500 hover:underline cursor-help animate-none"
                        >
                          {t("library.understood_stat", "Understood:")} {bookStats.knownPct}%
                        </span>
                        <span 
                          title={`Неизвестные или новые слова во фрагменте: ${bookStats.unknownCount} вхождений (${bookStats.uniqueUnknownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                          className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none"
                        >
                          {t("library.not_understood", "Not Understood:")} {bookStats.unknownPct}%
                        </span>
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

                  {/* Actions buttons row */}
                  <div className="flex gap-2 items-center pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      id={`book-read-btn-${lesson.id}`}
                      onClick={() => onSelectLesson(lesson.id)}
                      className="flex-1 py-2 bg-zinc-100 hover:bg-teal-600 dark:bg-zinc-800 group-hover:bg-teal-600 group-hover:text-white dark:group-hover:bg-teal-600 font-extrabold text-xs rounded-xl text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-98"
                    >
                      <BookOpen className="w-3.5 h-3.5" />{t("library.read_btn", "Read")}</button>

                    {/* Archive / Restore Button */}
                    <button
                      type="button"
                      id={`book-archive-btn-${lesson.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchiveLesson(lesson.id, e);
                      }}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-xl transition-all"
                      title={lesson.isArchived ? t("library.restore_tooltip", "Restore to bookshelf") : t("library.archive_tooltip", "Move to archive")}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit Book Button */}
                    <button
                      type="button"
                      id={`book-edit-btn-${lesson.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditLesson(lesson, e);
                      }}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-xl transition-all"
                      title={t("library.edit_tooltip", "Edit book")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Show delete if custom */}
                    {!lesson.isBuiltIn && (
                      <button
                        type="button"
                        id={`book-delete-btn-${lesson.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLessonId(lesson.id);
                        }}
                        className="p-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-zinc-400 hover:text-red-500 rounded-xl transition-all hover:border-red-200"
                        title={t("library.delete_tooltip", "Delete book")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
                setSelectedLanguage("All");
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

    </div>
  );
}

export default memo(LibraryHome);
