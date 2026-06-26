/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Lesson, LessonType, AppStats, ReaderSettings } from "../types";
import { Search, BookOpen, Plus, Trash2, BookMarked, Sparkles, Filter, Archive, Check, Pencil, Pin, RefreshCw, TrendingUp, Lightbulb, Flame, ArrowRight, Loader2 } from "lucide-react";
import { ICON_MAP, getCategoryIcon } from "./ImportLessonForm";

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
  // Fallbacks for other languages
  return {
    gradient: "from-teal-600 via-teal-700 to-slate-800",
    accent: "bg-teal-100 text-teal-950 dark:bg-teal-950/40 dark:text-teal-300",
    emoji: "📖",
    character: "A",
  };
};

// Map flag emoji to ISO 3166-1 alpha-2 country code for image-based rendering
const FLAG_EMOJI_TO_CODE: Record<string, string> = {
  "🇺🇸": "us", "🇬🇧": "gb", "🇪🇸": "es", "🇲🇽": "mx", "🇨🇴": "co", "🇦🇷": "ar",
  "🇨🇱": "cl", "🇵🇪": "pe", "🇻🇪": "ve", "🇩🇪": "de", "🇦🇹": "at", "🇨🇭": "ch",
  "🇫🇷": "fr", "🇨🇦": "ca", "🇷🇺": "ru", "🇯🇵": "jp", "🇮🇹": "it", "🇵🇹": "pt",
  "🇧🇷": "br", "🇨🇳": "cn", "🇹🇼": "tw", "🇰🇷": "kr", "🇹🇷": "tr", "🇸🇦": "sa",
  "🇪🇬": "eg", "🇮🇳": "in", "🇺🇦": "ua", "🇵🇱": "pl", "🇸🇪": "se", "🇳🇱": "nl",
  "🇧🇪": "be", "🇬🇷": "gr", "🇮🇪": "ie",
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

export default function LibraryHome({
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
}: LibraryHomeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("All");
  const [filterType, setFilterType] = useState<"all" | "builtin" | "custom">("all");
  const [selectedLessonType, setSelectedLessonType] = useState<string>("All");
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Smart Banner Dashboard state & helpers
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * 8));
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("vocab_clone_daily_word_goal");
    return saved ? parseInt(saved, 10) : 5;
  });

  const LANGUAGE_TIPS = [
    "Подключайте слух: слушайте озвучку одновременно с чтением — это активирует слуховую кору мозга.",
    "Не зубрите слова отдельно: запоминайте их в контексте фраз. Мозг обожает контекстуальные связи!",
    "Интервальное повторение: возвращайтесь к сложным словам через 1 день, затем через 3 и 7 дней.",
    "Лингво-совет: Читайте вслух те предложения, где встретили новые слова, чтобы тренировать артикуляцию.",
    "Разгадывайте корни: у многих языков есть схожие латинские или общие корни. Ищите аналогии для запоминания!",
    "Метод активного чтения: не бойтесь новых слов! Ваша цель — перевести их в статус 'изучаемых' и читать дальше.",
    "Короткие сессии рулят: 15 минут увлекательного чтения каждый день эффективнее, чем 2 часа раз в неделю.",
    "Понимайте суть: не обязательно переводить каждое слово. Учитесь догадываться в контексте!"
  ];

  const handleCycleGoal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const goals = [5, 10, 15, 25, 50, 100];
    const currentIndex = goals.indexOf(dailyGoal);
    const nextIndex = (currentIndex + 1) % goals.length;
    const nextGoal = goals[nextIndex === -1 ? 0 : nextIndex];
    setDailyGoal(nextGoal);
    localStorage.setItem("vocab_clone_daily_word_goal", nextGoal.toString());
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
      const item = vocab[langKeyForResolved] || vocab[resolvedKey];
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
    localStorage.setItem("vocab_books_per_row", cols.toString());
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

    // Pinned books always go first. Maintain original order otherwise.
    return [...list].sort((a, b) => {
      const aPinned = !!a.pinned;
      const bPinned = !!b.pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [lessons, searchQuery, selectedLanguage, filterType, selectedLessonType, showArchived]);

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

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLanguage, filterType, selectedLessonType, showArchived]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
      
      {/* Visual welcome bookshelf header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-teal-900 to-zinc-950 p-6 sm:p-8 text-white shadow-xl shadow-teal-950/40 min-h-[240px] flex flex-col justify-between border border-teal-800/20">
        
        {/* Ambient floating elements */}
        <div className="absolute right-0 top-0 opacity-10 translate-x-10 -translate-y-10 transform scale-150 select-none pointer-events-none">
          <BookMarked className="w-96 h-96" />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch relative z-10 w-full">
          
          {/* Column 1: Info & Welcome Narrative */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between space-y-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/60 text-xs font-semibold tracking-wide text-white border border-teal-800/30 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>Ваша умная библиотека / Smart Bookshelf</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight mt-3 max-w-xl leading-tight text-white drop-shadow-sm">
                Какую историю вы изучите сегодня?
              </h2>
              <p className="text-xs sm:text-sm font-medium text-teal-100 max-w-md mt-2 opacity-95 leading-relaxed font-sans">
                Интерактивный метод чтения: нажимайте на любые незнакомые слова, скачивайте переводы и слушайте озвучку!
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 sm:mt-6 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Всего книг:</span>
                <span className="text-xs font-bold bg-white/15 px-2.5 py-0.5 rounded-md text-white">{lessons.length}</span>
              </div>
              
              <div className="h-4 w-px bg-white/15 hidden sm:block"></div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Активных:</span>
                <span className="text-xs font-bold text-amber-300 bg-teal-950/40 px-2 py-0.5 rounded-md border border-teal-800/20">{activeCount}</span>
              </div>

              <div className="h-4 w-px bg-white/15 hidden sm:block"></div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">В архиве:</span>
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
                  <span>Прогресс за сегодня</span>
                </span>
                <button
                  onClick={handleCycleGoal}
                  className="cursor-pointer text-[9px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 active:scale-95 px-2 py-0.5 rounded-md transition-all text-amber-200 border border-white/10 select-none"
                  title="Нажмите для настройки дневного лимита"
                >
                  Цель: {dailyGoal} слов
                </button>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-white">
                  Новых слов: <strong className="font-extrabold text-amber-300">{todayCreatedCount}</strong> из {dailyGoal}
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
                  🎉 Великое достижение! Дневная цель выполнена!
                </p>
              ) : (
                <p className="text-[9px] text-teal-100/80 font-medium leading-none">
                  Разметьте ещё {dailyGoal - todayCreatedCount} слов для завершения сегодняшней нормы.
                </p>
              )}
            </div>

            {/* Resume last Book info */}
            {resumeLesson ? (
              <div className="border-t border-white/10 pt-3 flex flex-col space-y-2">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-teal-200 flex items-center gap-1 select-none">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Продолжить чтение</span>
                </span>
                
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    {renderCircularFlag(languageFlags[resumeLesson.targetLanguage.toLowerCase()] || getLanguageCoverPreset(resumeLesson.targetLanguage).emoji)}
                    <div className="overflow-hidden">
                      <h4 className="text-xs font-black truncate text-white" title={resumeLesson.title}>
                        {resumeLesson.title}
                      </h4>
                      <p className="text-[9px] text-teal-200 select-none">
                        Понятно: <strong className="font-extrabold text-emerald-300">{resumeLessonStats?.knownPct}%</strong>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectLesson(resumeLesson.id)}
                    className="cursor-pointer px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-950/25 border border-emerald-600 flex items-center gap-1 select-none shrink-0"
                  >
                    <span>Старт</span>
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
                  <span className="font-extrabold text-teal-200 uppercase tracking-widest text-[8px]">Совет дня</span>
                  <button
                    onClick={handleNextTip}
                    className="text-white/80 hover:text-amber-300 active:scale-90 p-0.5 tracking-normal cursor-pointer transition-all shrink-0"
                    title="Сменить совет"
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
          Активные книги ({activeCount})
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
          📁 Архив ({archivedCount})
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
              placeholder="Поиск по названию или тексту... (Search books...)"
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
              Все источники
            </button>
            <button
              onClick={() => setFilterType("builtin")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === "builtin"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              Встроенные
            </button>
            <button
              onClick={() => setFilterType("custom")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterType === "custom"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                  : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              Импортированные
            </button>

            {!showArchived && (
              <button
                type="button"
                onClick={onOpenImportForm}
                className="ml-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 active:scale-97 text-white font-black text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-sm shadow-teal-100/30 dark:shadow-none"
              >
                <Plus className="w-4 h-4" />
                Создать книгу
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Language Filter Chips Row */}
        {availableLanguages.length > 2 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center gap-2">
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Языки:
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
                        <span>Все языки (All)</span>
                      </>
                    ) : (
                      <>
                        {renderCircularFlag(languageFlags[lang.toLowerCase()] || getLanguageCoverPreset(lang).emoji)}
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
            <Filter className="w-3 h-3" /> Категории:
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
              🔍 Все
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
                  <span>{type.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Books per row setting / Grid Column Selector */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              📐 Вид сетки:
            </span>
            <span className="text-xs text-zinc-500 font-medium">Количество книг в ряду</span>
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
                  {num} {num === 2 || num === 3 || num === 4 ? "книги" : "книг"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Visual Book Grid */}
      {filteredLessons.length > 0 ? (
        <>
          <div className={`grid ${gridColsClass} gap-6 md:gap-8`}>
            {paginatedLessons.map((lesson) => {
              const cover = getLanguageCoverPreset(lesson.targetLanguage);
            const wordCount = getWordCount(lesson.text || "");
            const readTime = getReadingTime(lesson.text || "");

            const bookStats = (() => {
              if (typeof lesson.text !== "string") {
                return { knownPct: 0, unknownPct: 100, knownCount: 0, unknownCount: 0, uniqueKnownCount: 0, uniqueUnknownCount: 0, uniqueTotal: 0, total: 0, knownVocabularyPct: 0, unknownVocabularyPct: 100 };
              }
              const rawParts = lesson.text.split(/\s+/);
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
                const isNumeric = /^\d+$/.test(clean) || isNumericOrTimestamp(clean);
                if (clean.length > 0 && !isNumeric) {
                  return clean;
                }
                return "";
              }).filter(w => w.length > 0);

              if (processedWords.length === 0) {
                return { knownPct: 0, unknownPct: 100, knownCount: 0, unknownCount: 0, uniqueKnownCount: 0, uniqueUnknownCount: 0, uniqueTotal: 0, total: 0, knownVocabularyPct: 0, unknownVocabularyPct: 100 };
              }

              let knownCount = 0;
              let unknownCount = 0;
              const lang = (lesson.targetLanguage || "spanish").toLowerCase();

              const uniqueUnknownWords = new Set<string>();
              const uniqueKnownWords = new Set<string>();
              const uniqueTotalWords = new Set<string>();

              // Track counts
              processedWords.forEach(word => {
                const key = word.toLowerCase();
                const langKey = `${lang}_${key}`;
                 const resolvedKey = (wordLinks[langKey] || wordLinks[key] || key).replace(/^[a-zA-Z]+_/, "");
                const langKeyForResolved = `${lang}_${resolvedKey}`;
                
                const item = vocab[langKeyForResolved] || vocab[resolvedKey];
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
            })();

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
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-linear-to-b from-black/20 via-transparent to-black/20 z-10"></div>

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
                        <h4 className="text-xs font-black uppercase tracking-wider text-rose-400">Удалить книгу?</h4>
                        <p className="text-[11px] text-zinc-300 leading-normal font-sans">
                          Все сохранённые слова и прогресс для книги <strong className="text-zinc-100 font-bold font-serif italic">"{lesson.title}"</strong> будут безвозвратно удалены.
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
                        className="flex-1 py-2 bg-red-650 hover:bg-red-600 active:scale-97 text-white font-black text-[11px] rounded-xl transition-all cursor-pointer shadow-md"
                      >
                        Да, удалить
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLessonId(null);
                        }}
                        className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-97 text-zinc-300 border border-zinc-700/60 font-black text-[11px] rounded-xl transition-all cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Book Cover Banner */}
                <div 
                  className={`relative aspect-video bg-linear-to-br ${cover.gradient} p-4 text-white flex flex-col justify-between overflow-hidden select-none bg-cover bg-center`}
                  style={lesson.coverUrl ? { backgroundImage: `url("${lesson.coverUrl}")` } : undefined}
                >
                  {/* Overlay shadow for text contrast when using images */}
                  {lesson.coverUrl && (
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-900/40 to-transparent z-0"></div>
                  )}

                  {/* Spine inner shade overlay */}
                  <div className="absolute left-1.5 top-0 bottom-0 w-3 bg-linear-to-r from-black/25 via-black/10 to-transparent"></div>
                  
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
                        {renderCircularFlag(languageFlags[lesson.targetLanguage.toLowerCase()] || cover.emoji)}
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
                        const lType = lesson.lessonType || "book";
                        const typeInfo = lessonTypes.find((t) => t.id === lType);
                        const IconComponent = getCategoryIcon(typeInfo?.icon || "book", typeInfo?.name || "Книга");
                        return (
                          <span className="text-[10px] font-black leading-none bg-black/40 backdrop-blur-md px-2 py-1.5 rounded-lg flex items-center gap-1 select-none text-zinc-100 border border-white/5">
                            <IconComponent className="w-3 h-3 text-teal-300" />
                            <span>{typeInfo?.name || "Книга"}</span>
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
                <div className={`${booksPerRow >= 5 ? 'p-2.5 space-y-2' : 'p-4 space-y-4'} flex-auto flex flex-col justify-between`}>
                  {booksPerRow < 5 && (
                  <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-200/40 dark:border-zinc-800/50">
                    <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">Фрагмент текста</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 italic font-serif">
                       "{lesson.text}"
                    </p>
                  </div>
                  )}

                  <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950/20 p-2 rounded-xl border border-zinc-200/50 dark:border-zinc-800/30 select-none">
                    <div className="flex justify-between items-center text-[9px] uppercase font-black tracking-widest text-zinc-400">
                      <span>{settings?.mainStatsMetric === "vocabulary" ? "Словарный запас (Vocabulary)" : "Понимание (Comprehension)"}</span>
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
                            Понятно: {bookStats.knownPct}% ({bookStats.knownCount} слов)
                          </span>
                          <span 
                            title={`Процент уникального словаря: ${bookStats.knownVocabularyPct}% (${bookStats.uniqueKnownCount} уникальных лемм)`}
                            className="text-emerald-500 dark:text-emerald-400 hover:underline cursor-help animate-none mt-0.5"
                          >
                            • Словарь: {bookStats.knownVocabularyPct}% ({bookStats.uniqueKnownCount} уник.)
                          </span>
                        </div>
                        <div className="flex flex-col text-right animate-none">
                          <span 
                            title={`Неизвестные или новые слова во фрагменте: ${bookStats.unknownCount} вхождений (${bookStats.uniqueUnknownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                            className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none"
                          >
                            Непонятно: {bookStats.unknownPct}% ({bookStats.unknownCount} слов)
                          </span>
                          <span 
                            title={`Процент незнакомых уникальных лемм: ${bookStats.unknownVocabularyPct}% (${bookStats.uniqueUnknownCount} уникальных лемм)`}
                            className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none mt-0.5"
                          >
                            • Новых: {bookStats.unknownVocabularyPct}% ({bookStats.uniqueUnknownCount} уник.)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center text-[9px] font-extrabold font-sans">
                        <span 
                          title={`Известные слова во фрагменте: ${bookStats.knownCount} вхождений (${bookStats.uniqueKnownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                          className="text-emerald-500 hover:underline cursor-help animate-none"
                        >
                          Понятно: {bookStats.knownPct}%
                        </span>
                        <span 
                          title={`Неизвестные или новые слова во фрагменте: ${bookStats.unknownCount} вхождений (${bookStats.uniqueUnknownCount} уникальных слов из ${bookStats.uniqueTotal})`}
                          className="text-sky-500 dark:text-sky-400 hover:underline cursor-help animate-none"
                        >
                          Непонятно: {bookStats.unknownPct}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500">
                    <span className="flex items-center gap-1">
                      📚 {wordCount} слов
                    </span>
                    <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400">
                      ⏱️ ~{readTime} мин
                    </span>
                  </div>

                  {/* Actions buttons row */}
                  <div className="flex gap-2 items-center pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      id={`book-read-btn-${lesson.id}`}
                      onClick={() => onSelectLesson(lesson.id)}
                      className="flex-1 py-2 bg-zinc-100 hover:bg-teal-600 dark:bg-zinc-800 group-hover:bg-teal-600 group-hover:text-white dark:group-hover:bg-teal-600 font-extrabold text-xs rounded-xl text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-98"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Читать
                    </button>

                    {/* Archive / Restore Button */}
                    <button
                      type="button"
                      id={`book-archive-btn-${lesson.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchiveLesson(lesson.id, e);
                      }}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-xl transition-all"
                      title={lesson.isArchived ? "Вернуть на книжную полку" : "Переместить в архив"}
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
                      title="Редактировать книгу"
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
                        title="Удалить книгу"
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
              <div className="p-4 rounded-full bg-linear-to-tr from-teal-500 to-emerald-50 dark:from-zinc-800 dark:to-zinc-900 text-teal-600 dark:text-zinc-400 group-hover:scale-110 shadow-sm transition-all duration-300">
                <Plus className="w-6 h-6" />
              </div>
              <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-300 uppercase tracking-widest mt-4">
                Добавить книгу
              </h4>
              <p className="text-[11px] text-zinc-500 max-w-xs mt-1.5 leading-normal">
                Скачайте субтитры с YouTube или вставьте любой text с обложкой!
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
            >
              Назад
            </button>
            
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
              >
                Вперед
              </button>
            </div>
          )}
        </>
      ) : (
        /* Styled empty search state */
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center rounded-2xl space-y-4 max-w-xl mx-auto shadow-sm">
          <BookOpen className="w-12 h-12 text-zinc-300 mx-auto" aria-hidden="true" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest">
            {showArchived ? "Архив пуст" : "Книги не найдены"}
          </h3>
          <p className="text-xs text-zinc-500 leading-normal max-w-md mx-auto">
            {showArchived 
              ? "У вас нет архивированных книг. Вы можете временно заархиверовать любую книгу, нажав на иконку папки на карточке книги."
              : `Не удалось найти книги с ключевым словом "${searchQuery}". Попробуйте изменить фильтры или добавьте новую книгу.`}
          </p>
          <div className="flex gap-2.5 items-center justify-center pt-2">
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedLanguage("All");
                setFilterType("all");
              }}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Сбросить поиск
            </button>
            {!showArchived && (
              <button
                onClick={onOpenImportForm}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                Импортировать книгу
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
