import React, { memo, useState, useEffect, useRef } from "react";
import { Lesson, ReaderSettings, Playlist } from "../../types";
import { Trash2, Pin, Headphones, BookOpen, MoreVertical, Pencil, ListVideo, Archive, ArchiveRestore } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getLocalizedLanguageName } from "../../utils/stringUtils";
import { getCategoryIcon, getCategoryDisplayName } from "../ImportLessonForm";
import { isValidAudioUrl } from "../../store/playlistStore";

export interface BookStats {
  knownPct: number;
  unknownPct: number;
  knownCount: number;
  unknownCount: number;
  ignoredCount: number;
  uniqueKnownCount: number;
  uniqueUnknownCount: number;
  uniqueIgnoredCount: number;
  uniqueTotal: number;
  total: number;
  eligibleTokens: number;
  eligibleLemmas: number;
  knownVocabularyPct: number;
  unknownVocabularyPct: number;
}

export interface CoverPreset {
  gradient: string;
  accent: string;
  emoji: string;
  character: string;
}

interface BookCardProps {
  lesson: Lesson;
  bookStats: BookStats;
  isVocabAvailable: boolean;
  cover: CoverPreset;
  languageFlags: Record<string, string>;
  settings?: ReaderSettings;
  booksPerRow: number;
  isDeleting: boolean;
  isMenuOpen: boolean;
  lessonTypes?: Array<{ id: string; name: string; icon?: string }>;
  playlists?: Playlist[];
  wordCount: number;
  readTime: number;
  youtubeDurationVal: number | null;
  effectiveAudioDuration: number | null;
  renderCircularFlag: (flagEmoji: string, isAll?: boolean) => React.ReactNode;
  getLanguageFlagEmoji: (lang: string, customFlags?: Record<string, string>) => string;
  formatDuration: (seconds: number) => string;
  onSelectLesson: (id: string) => void;
  onDeleteLesson: (id: string, e: React.MouseEvent) => void;
  onToggleArchiveLesson: (id: string, e: React.MouseEvent) => void;
  onTogglePinLesson: (id: string, e: React.MouseEvent) => void;
  onEditLesson: (lesson: Lesson, e: React.MouseEvent) => void;
  onOpenPlaylistModal?: (lesson: Lesson) => void;
  onPlaySingleLesson?: (lesson: Lesson) => void;
  onSetDeletingLessonId: (id: string | null) => void;
  onToggleMenu: (id: string | null) => void;
}

export const BookCard: React.FC<BookCardProps> = memo(({
  lesson,
  bookStats,
  isVocabAvailable,
  cover,
  languageFlags,
  settings,
  booksPerRow,
  isDeleting,
  isMenuOpen,
  lessonTypes = [],
  playlists = [],
  wordCount,
  readTime,
  youtubeDurationVal,
  effectiveAudioDuration,
  renderCircularFlag,
  getLanguageFlagEmoji,
  formatDuration,
  onSelectLesson,
  onDeleteLesson,
  onToggleArchiveLesson,
  onTogglePinLesson,
  onEditLesson,
  onOpenPlaylistModal,
  onPlaySingleLesson,
  onSetDeletingLessonId,
  onToggleMenu,
}) => {
  const { t, i18n } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(lesson.coverUrl || null);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggleMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onToggleMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, onToggleMenu]);

  // Sync image source if lesson.coverUrl changes
  useEffect(() => {
    setImgSrc(lesson.coverUrl || null);
  }, [lesson.coverUrl]);

  const isYoutube = !!lesson.youtubeId || lesson.lessonType === "youtube";
  const hasAudio = !!(lesson.audioUrl || lesson.audioBase64);
  const isVideo = isYoutube || lesson.lessonType === "video" || (lesson as any).sourceType === "video" || (lesson as any).sourceType === "youtube";
  const isAudioMedia = !isVideo && (hasAudio || lesson.lessonType === "podcast" || lesson.lessonType === "audio" || (lesson as any).sourceType === "podcast" || (lesson as any).sourceType === "audio");
  const isMedia = isVideo || isAudioMedia;
  const isBook = !isMedia && (lesson.lessonType === "book" || !lesson.lessonType);
  const lType = lesson.lessonType || (isVideo ? "youtube" : hasAudio ? "podcast" : "book");
  const typeInfo = lessonTypes.find((t) => t.id === lType);
  const catLabel = getCategoryDisplayName(typeInfo?.id || lType, typeInfo?.name, t);
  const IconComponent = getCategoryIcon(typeInfo?.icon || (isVideo ? "youtube" : hasAudio ? "podcast" : "book"), catLabel);

  const isTitleBelowCover = (settings?.cardTitlePosition || "below_cover") === "below_cover";

  // Media durations
  const videoDuration = isVideo ? (youtubeDurationVal || (lesson as any).duration || (lesson as any).youtubeDuration || null) : null;
  const audioDuration = isAudioMedia ? (effectiveAudioDuration || (lesson as any).audioDuration || null) : null;

  // Video progress (playback percentage)
  const videoProgress = (() => {
    if (!isVideo) return 0;
    if (typeof (lesson as any).videoProgress === "number" && (lesson as any).videoProgress > 0) {
      return (lesson as any).videoProgress;
    }
    if (typeof (lesson as any).videoProgress === "string" && parseFloat((lesson as any).videoProgress) > 0) {
      return parseFloat((lesson as any).videoProgress);
    }
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(`youtube_progress_${lesson.id}`) : null;
    if (stored) {
      const val = parseFloat(stored);
      return isNaN(val) ? 0 : val;
    }
    return 0;
  })();

  const formatEstimatedReadTime = (words: number): string => {
    if (!words || words <= 0) return "";
    const totalMinutes = Math.max(1, Math.round(words / 160));
    const isRu = i18n.language?.startsWith("ru");
    if (totalMinutes < 60) {
      return `~${totalMinutes} ${isRu ? "мин" : "min"}`;
    }
    const hours = (totalMinutes / 60).toFixed(1).replace(/\.0$/, "");
    return `~${hours} ${isRu ? "ч" : "h"}`;
  };

  return (
    <div
      id={`book-card-${lesson.id}`}
      onClick={() => onSelectLesson(lesson.id)}
      className={`group relative bg-white dark:bg-zinc-900 rounded-2xl border ${
        lesson.pinned
          ? "border-amber-400 dark:border-amber-500/55 shadow-sm shadow-amber-100/10 ring-1 ring-amber-400/20"
          : "border-zinc-200 dark:border-zinc-800"
      } hover:border-teal-200 dark:hover:border-teal-950 shadow-xs hover:shadow-xl dark:shadow-none hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden`}
    >
      {/* Book spine decorative border (only for books) */}
      {isBook && (
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-black/20 via-transparent to-black/20 z-10 pointer-events-none" />
      )}

      {/* Delete Confirmation Overlay */}
      {isDeleting && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="absolute inset-0 bg-zinc-950/95 z-50 p-4 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150 text-white font-sans text-left"
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
                onSetDeletingLessonId(null);
              }}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 active:scale-97 text-white font-black text-[11px] rounded-xl transition-all cursor-pointer shadow-md"
            >
              {t("library.confirm_delete", "Yes, delete")}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetDeletingLessonId(null);
              }}
              className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-97 text-zinc-300 border border-zinc-700/60 font-black text-[11px] rounded-xl transition-all cursor-pointer"
            >
              {t("library.cancel", "Cancel")}
            </button>
          </div>
        </div>
      )}
      
      {/* Book Cover Banner */}
      <div 
        className={`relative aspect-video ${imgSrc ? 'bg-zinc-950' : `bg-gradient-to-br ${cover.gradient}`} p-3 sm:p-3.5 text-white flex flex-col justify-between overflow-hidden select-none`}
      >
        {/* Cover image (single crisp image with async decoding and fallback on error) */}
        {imgSrc && (
          <>
            {/* Atmospheric ambient backdrop for portrait book covers */}
            {!isYoutube && (
              <img
                src={imgSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-40 z-0 select-none pointer-events-none brightness-75"
              />
            )}
            <img 
              src={imgSrc} 
              alt="" 
              decoding="async"
              className={`absolute inset-0 w-full h-full ${
                isYoutube || lesson.lessonType === 'article' || lesson.lessonType === 'website' 
                  ? 'object-cover' 
                  : 'object-contain'
              } z-0 select-none pointer-events-none drop-shadow-xl transition-transform duration-300 group-hover:scale-105`}
              onError={() => {
                if (imgSrc.includes("/maxresdefault.jpg")) {
                  setImgSrc(imgSrc.replace("/maxresdefault.jpg", "/sddefault.jpg"));
                } else if (imgSrc.includes("/sddefault.jpg")) {
                  setImgSrc(imgSrc.replace("/sddefault.jpg", "/hqdefault.jpg"));
                }
              }}
            />
          </>
        )}

        {/* Optional dark overlay shadow for text contrast (only when in on_cover mode) */}
        {imgSrc && !isTitleBelowCover && settings?.dimBookCovers && (
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-900/30 to-zinc-950/30 z-[1] pointer-events-none" />
        )}

        {/* Subtle bottom gradient only for title contrast when dimming is disabled (only on_cover mode) */}
        {imgSrc && !isTitleBelowCover && !settings?.dimBookCovers && (
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/65 via-black/25 to-transparent z-[1] pointer-events-none" />
        )}

        {/* Spine inner shade overlay (only for books) */}
        {isBook && (
          <div className="absolute left-1.5 top-0 bottom-0 w-3 bg-gradient-to-r from-black/25 via-black/10 to-transparent z-[2] pointer-events-none" />
        )}
        
        {/* Decorative background monogram text (when no image) */}
        {!imgSrc && (
          <div className="absolute right-2 bottom-0 text-7xl font-black text-white/10 transform translate-x-2 translate-y-3 pointer-events-none select-none font-serif">
             {cover.character}
          </div>
        )}

        {/* Top line cover overlay: Clean & Minimal in below_cover mode */}
        {isTitleBelowCover ? (
          <div className="flex items-center justify-between z-10 w-full animate-in fade-in duration-200">
            <div>
              {lesson.isArchived && (
                <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-amber-500/90 text-white rounded-md backdrop-blur-xs shadow-xs">
                  {t("common.archived", "Archived")}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePinLesson(lesson.id, e);
              }}
              className={`p-1.5 rounded-lg transition-all border leading-none cursor-pointer flex items-center justify-center ${
                lesson.pinned
                  ? "bg-amber-500 text-white border-amber-400 font-extrabold shadow-sm scale-110"
                  : "bg-black/60 text-zinc-300 border-white/10 hover:bg-black/80 hover:text-white hover:scale-110 opacity-0 group-hover:opacity-100"
              }`}
              title={lesson.pinned ? t("library.unpin_book", "Unpin Book") : t("library.pin_book", "Pin Book")}
            >
              <Pin className={`w-3 h-3 ${lesson.pinned ? "fill-white" : ""}`} />
            </button>
          </div>
        ) : (
          /* Legacy On-Cover Top Info */
          <div className="flex items-center justify-between z-10 w-full animate-in fade-in duration-200">
            <div className="flex items-center gap-1.5 max-w-[65%]">
              <span className="flex items-center gap-1.5 text-[10px] font-black leading-none bg-black/65 pl-1.5 pr-2.5 py-1 rounded-full border border-white/10 truncate shadow-xs">
                {renderCircularFlag(getLanguageFlagEmoji(lesson.targetLanguage, languageFlags))}
                <span className="truncate">{getLocalizedLanguageName(lesson.targetLanguage, i18n.language)}</span>
              </span>
              {lesson.difficulty && (
                <span 
                  className="text-[9.5px] font-black leading-none px-2 py-1 rounded-full bg-black/65 text-white border border-white/10 flex items-center justify-center shadow-xs cursor-default select-none shrink-0"
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
                className={`p-1 rounded-lg transition-all border leading-none cursor-pointer flex items-center justify-center ${
                  lesson.pinned
                    ? "bg-amber-500 text-white border-amber-400 font-extrabold shadow-sm hover:bg-amber-600 scale-110"
                    : "bg-black/60 text-zinc-300 border-white/10 hover:bg-black/80 hover:text-white hover:scale-110"
                }`}
                title={lesson.pinned ? "Открепить книгу (Unpin Book)" : "Закрепить книгу (Pin Book)"}
              >
                <Pin className={`w-3 h-3 ${lesson.pinned ? "fill-white" : ""}`} />
              </button>
              <span className="text-[10px] font-black leading-none bg-black/65 px-2 py-1.5 rounded-lg flex items-center gap-1 select-none text-zinc-100 border border-white/10 shadow-xs">
                <IconComponent className="w-3 h-3 text-teal-300" />
                <span>{catLabel}</span>
              </span>
            </div>
          </div>
        )}

        {/* Bottom Banner Area: Duration Badge (below_cover mode) or Title (on_cover mode) */}
        {isTitleBelowCover ? (
          <div className="z-10 mt-auto flex items-center justify-end">
            {isVideo && videoDuration ? (
              <span className="px-1.5 py-0.5 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono font-bold rounded-md shadow-xs border border-white/10">
                {formatDuration(videoDuration)}
              </span>
            ) : isAudioMedia && audioDuration ? (
              <span className="px-1.5 py-0.5 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono font-bold rounded-md shadow-xs border border-white/10">
                🎧 {formatDuration(audioDuration)}
              </span>
            ) : isBook && wordCount > 0 ? (
              <span className="px-1.5 py-0.5 bg-black/80 backdrop-blur-xs text-zinc-200 text-[10px] font-medium rounded-md shadow-xs border border-white/10 flex items-center gap-1">
                <span>⏱️</span>
                <span>{formatEstimatedReadTime(wordCount)}</span>
              </span>
            ) : null}
          </div>
        ) : (
          /* Legacy Big Cover Title */
          <div className="z-10 mt-auto">
            <h3 className="text-sm font-black line-clamp-3 tracking-tight leading-snug drop-shadow-md group-hover:text-teal-300 transition-colors">
              {lesson.title}
            </h3>
          </div>
        )}

        {/* YouTube / Video Red Progress Bar (only for video materials) */}
        {isVideo && videoDuration && videoDuration > 0 && videoProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700/80 z-10 overflow-hidden pointer-events-none">
            <div 
              className="h-full bg-red-600 transition-all" 
              style={{ width: `${Math.min(100, (videoProgress / videoDuration) * 100)}%` }} 
            />
          </div>
        )}
      </div>

      {/* Details Section */}
      <div className={`${booksPerRow >= 5 ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'} flex-auto flex flex-col justify-between`}>
        
        {/* Header Info & Title (when isTitleBelowCover is true) */}
        {isTitleBelowCover && (
          <div className="space-y-1.5">
            {/* Badges row: Language, Difficulty, Source, Word Count */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold leading-none bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1 rounded-md border border-zinc-200/60 dark:border-zinc-700/60 shadow-3xs truncate">
                {renderCircularFlag(getLanguageFlagEmoji(lesson.targetLanguage, languageFlags))}
                <span className="truncate">{getLocalizedLanguageName(lesson.targetLanguage, i18n.language)}</span>
              </span>

              {lesson.difficulty && (
                <span 
                  className="text-[9.5px] font-bold leading-none px-1.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60 shadow-3xs cursor-default select-none shrink-0"
                  title={lesson.difficultyExplanation || `Difficulty: ${lesson.difficulty}`}
                >
                  {lesson.difficulty}
                </span>
              )}

              <span className="text-[10px] font-bold leading-none bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md flex items-center gap-1 select-none text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60 shadow-3xs">
                <IconComponent className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>{catLabel}</span>
              </span>

              <span className="text-[10px] font-bold leading-none bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-1 rounded-md flex items-center gap-1 select-none border border-zinc-200/60 dark:border-zinc-700/60 shadow-3xs">
                <span>📚 {wordCount} {t("library.words", "words")}</span>
              </span>
            </div>

            {/* Prominent, Clean Title with High Contrast */}
            <h3
              className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug tracking-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
              title={lesson.title}
            >
              {lesson.title}
            </h3>
          </div>
        )}

        <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950/20 p-2 rounded-xl border border-zinc-200/50 dark:border-zinc-800/30 select-none">
          <div className="flex justify-between items-center text-[9px] uppercase font-black tracking-widest text-zinc-400">
            <span>{settings?.mainStatsMetric === "vocabulary" ? t("library.stat_vocab", "Vocabulary") : t("library.comprehension_caps", "Comprehension")}</span>
            <span className="text-zinc-600 dark:text-zinc-300 font-extrabold">
              {isVocabAvailable ? `${settings?.mainStatsMetric === "vocabulary" ? bookStats.knownVocabularyPct : bookStats.knownPct}%` : "--%"}
            </span>
          </div>

          {/* Proportional dual progress bar */}
          <div className="h-1.5 w-full rounded-full bg-sky-500/20 flex overflow-hidden">
            {!isVocabAvailable ? (
              <div className="h-full w-full bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse rounded-full" />
            ) : settings?.mainStatsMetric === "vocabulary" ? (
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

          {Boolean(settings?.showDetailedVocabularyStats) ? (
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

        {/* Legacy Word count and duration (only in on_cover mode) */}
        {!isTitleBelowCover && (
          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500">
            <span className="flex items-center gap-1">
              📚 {wordCount} {t("library.words", "words")}
            </span>
            {isVideo && videoDuration ? (
              <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400" title={t("library.yt_duration", "YouTube Video Duration")}>
                ⏱️ {formatDuration(videoDuration)}
              </span>
            ) : isAudioMedia && audioDuration ? (
              <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400" title={t("library.audio_duration", "Audio Duration")}>
                🎧 {formatDuration(audioDuration)}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400" title={t("library.read_time", "Estimated Read Time")}>
                ⏱️ {formatEstimatedReadTime(wordCount)}
              </span>
            )}
          </div>
        )}

        {/* Actions row: Neutral Read Button + 3-dots Menu */}
        <div className="flex gap-2 items-center pt-1 border-t border-zinc-100 dark:border-zinc-800">
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
          <div className="relative font-sans" ref={menuRef}>
            <button
              type="button"
              id={`book-menu-btn-${lesson.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu(isMenuOpen ? null : lesson.id);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                isMenuOpen
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600"
                  : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200/60 dark:border-zinc-700/60"
              }`}
              title={t("common.more_actions", "More actions")}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-full mb-1.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 min-w-[175px] animate-in fade-in zoom-in-95 duration-100 space-y-0.5"
              >
                {/* Quick Play Audio option */}
                {isValidAudioUrl(lesson.audioUrl, lesson.audioBase64, lesson.youtubeId, lesson.localVideoUrl) && onPlaySingleLesson && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMenu(null);
                      onPlaySingleLesson(lesson);
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
                    onToggleMenu(null);
                    onEditLesson(lesson, e);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{t('library.edit_tooltip', 'Edit book')}</span>
                </button>

                {/* Add to playlist */}
                {playlists && playlists.length > 0 && onOpenPlaylistModal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMenu(null);
                      onOpenPlaylistModal(lesson);
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
                    onToggleMenu(null);
                    onToggleArchiveLesson(lesson.id, e);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {lesson.isArchived ? (
                    <>
                      <ArchiveRestore className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t('library.unarchive_btn', 'Restore from archive')}</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{t('library.archive_btn', 'Archive book')}</span>
                    </>
                  )}
                </button>

                {/* Delete book */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMenu(null);
                    onSetDeletingLessonId(lesson.id);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('library.delete_btn', 'Delete book')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
