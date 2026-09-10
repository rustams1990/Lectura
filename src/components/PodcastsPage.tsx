import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Rss, Loader2, Mic2, X, Radio, RefreshCw,
  ArrowUpDown, Filter, Plus, Play, Clock, Sparkles,
  Headphones, ChevronRight, ChevronLeft, CheckCircle2, Bookmark
} from "lucide-react";
import { usePodcastStore } from "../store/podcastStore";
import { usePlaylistStore } from "../store/playlistStore";
import { useToast } from "../context/ToastContext";
import { useWhisperQueue } from "../services/whisperQueueService";
import { Lesson, HistoryEntry, PodcastSubscription, PodcastSearchResult, PodcastTimelineEpisode } from "../types";
import PodcastChannelView, { EpisodeRow, getEpisodeLessonInfo, EpisodeLessonInfo, parseDurationToSeconds } from "./PodcastChannelView";
import { normalizeLanguage } from "../utils";

// ── Language Normalization Helper ─────────────────────────────────────────────

function normalizeLanguageCode(lang?: string): string {
  if (!lang) return "";
  const clean = lang.toLowerCase().trim();
  if (clean.startsWith("es") || clean === "spanish" || clean === "spa") return "es";
  if (clean.startsWith("en") || clean === "english" || clean === "eng") return "en";
  if (clean.startsWith("fr") || clean === "french" || clean === "fra") return "fr";
  if (clean.startsWith("de") || clean === "german" || clean === "deu") return "de";
  if (clean.startsWith("it") || clean === "italian" || clean === "ita") return "it";
  if (clean.startsWith("pt") || clean === "portuguese" || clean === "por") return "pt";
  if (clean.startsWith("ru") || clean === "russian" || clean === "rus") return "ru";
  if (clean.startsWith("zh") || clean === "chinese" || clean === "zho") return "zh";
  if (clean.startsWith("ja") || clean === "japanese" || clean === "jpn") return "ja";
  if (clean.startsWith("ko") || clean === "korean" || clean === "kor") return "ko";
  if (clean.startsWith("pl") || clean === "polish" || clean === "pol") return "pl";
  if (clean.startsWith("tr") || clean === "turkish" || clean === "tur") return "tr";
  if (clean.startsWith("uk") || clean === "ukrainian" || clean === "ukr") return "uk";
  return clean.slice(0, 2);
}

const LANGUAGE_META: Record<string, { label: string; flag: string }> = {
  es: { label: "Spanish", flag: "🇪🇸" },
  en: { label: "English", flag: "🇺🇸" },
  fr: { label: "French", flag: "🇫🇷" },
  de: { label: "German", flag: "🇩🇪" },
  it: { label: "Italian", flag: "🇮🇹" },
  pt: { label: "Portuguese", flag: "🇵🇹" },
  ru: { label: "Russian", flag: "🇷🇺" },
  zh: { label: "Chinese", flag: "🇨🇳" },
  ja: { label: "Japanese", flag: "🇯🇵" },
  ko: { label: "Korean", flag: "🇰🇷" },
  pl: { label: "Polish", flag: "🇵🇱" },
  tr: { label: "Turkish", flag: "🇹🇷" },
  uk: { label: "Ukrainian", flag: "🇺🇦" },
};

function formatSecondsCompact(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) {
    return `${m}m ${s}s`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

// ── Modern Upgraded Podcast Card ──────────────────────────────────────────────

interface PodcastCardProps {
  title: string;
  subtitle: string;
  artworkUrl: string;
  language?: string;
  genre?: string;
  trackCount?: number;
  isSubscribed?: boolean;
  onClick: () => void;
}

const PodcastCard = React.memo<PodcastCardProps>(({
  title, subtitle, artworkUrl, language, genre, trackCount, isSubscribed, onClick,
}) => {
  const langCode = normalizeLanguageCode(language);
  const langMeta = langCode ? LANGUAGE_META[langCode] : null;

  return (
    <button
      onClick={onClick}
      className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-2.5 hover:border-teal-500/50 dark:hover:border-teal-500/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 text-left group cursor-pointer relative w-full h-full"
    >
      <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-xl">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) {
                parent.classList.add("flex", "items-center", "justify-center");
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Rss className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
          </div>
        )}

        {/* Floating Language Badge */}
        {language && (
          <span className="absolute top-2 left-2 z-10 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm pointer-events-none">
            {langCode ? langCode.toUpperCase() : language.toUpperCase()}
          </span>
        )}

        {/* Floating Episode count badge */}
        {trackCount ? (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md text-[10px] font-semibold text-zinc-200 z-10 pointer-events-none">
            {trackCount} ep.
          </div>
        ) : null}

        {/* Hover play icon overlay */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>
      </div>

      <div className="pt-2.5 pb-2 px-1 flex flex-col justify-start w-full min-h-[64px]">
        <div>
          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            {title}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
            {subtitle}
          </p>
        </div>

        {genre && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-md font-medium truncate max-w-full">
              {genre}
            </span>
          </div>
        )}
      </div>
    </button>
  );
});

// ── Main Component ─────────────────────────────────────────────────────────────

interface PodcastsPageProps {
  lessons?: Lesson[];
  history?: HistoryEntry[];
  selectedTargetLanguage?: string;
  onOpenLesson?: (lessonId: string) => void;
  onToggleCompleteLesson?: (lessonId: string) => void;
}

export default function PodcastsPage({
  lessons = [],
  history = [],
  selectedTargetLanguage,
  onOpenLesson,
  onToggleCompleteLesson,
}: PodcastsPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tab: "overview" | "subscriptions" | "timeline"
  const [activeTab, setActiveTab] = useState<"overview" | "subscriptions" | "timeline">("overview");

  // Timeline filters & sorting
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineSort, setTimelineSort] = useState<"newest" | "oldest" | "shortest" | "longest">("newest");
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<"all" | "in_progress" | "completed" | "unheard">("all");
  const [timelineVisibleCount, setTimelineVisibleCount] = useState(25);

  const {
    subscriptions, searchResults,
    timelineEpisodes, isTimelineLoading, fetchTimeline,
    isSearching, isLoadingSubscriptions,
    fetchSubscriptions, searchPodcasts, clearSearch,
    setCurrentPodcast, currentPodcast,
    importEpisode, importingEpisodes, importingStages, importedEpisodes,
  } = usePodcastStore();

  const setQueue = usePlaylistStore(s => s.setQueue);
  const currentPlayingGuid = usePlaylistStore(useCallback(s => s.isPlaying ? (s.queue[s.currentIndex]?.guid || s.queue[s.currentIndex]?.id || null) : null, []));
  const { registerCustomTask, updateCustomTask, completeCustomTask, failCustomTask } = useWhisperQueue();

  const [query, setQuery] = useState("");
  const [selectedSubLanguage, setSelectedSubLanguage] = useState<string>("all");
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = useCallback(() => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  }, []);

  const handleScrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = direction === "left" ? -340 : 340;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    fetchTimeline();
  }, [fetchSubscriptions, fetchTimeline]);

  // Target language filter
  const normalizedTargetLang = (selectedTargetLanguage && selectedTargetLanguage !== "All")
    ? normalizeLanguageCode(selectedTargetLanguage)
    : null;

  const availableSubLanguages = useMemo(() => {
    const langs = new Set<string>();
    subscriptions.forEach((s) => {
      const code = normalizeLanguageCode(s.language);
      if (code) langs.add(code);
    });
    return ["all", ...Array.from(langs)];
  }, [subscriptions]);

  const podcastLatestDateMap = useMemo(() => {
    const map = new Map<string, number>();
    timelineEpisodes.forEach((ep) => {
      const key = ep.feedUrl || ep.podcastId;
      const ts = ep.pubDate ? new Date(ep.pubDate).getTime() : 0;
      if (key && ts > (map.get(key) || 0)) {
        map.set(key, ts);
      }
    });
    return map;
  }, [timelineEpisodes]);

  // Subscriptions filtering
  const filteredSubscriptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = subscriptions.filter((sub) => {
      const matchesQuery =
        !q ||
        sub.title.toLowerCase().includes(q) ||
        (sub.author && sub.author.toLowerCase().includes(q));

      const code = normalizeLanguageCode(sub.language);
      const matchesLang = selectedSubLanguage === "all" || code === selectedSubLanguage;

      return matchesQuery && matchesLang;
    });

    return list.sort((a, b) => {
      const dateA = podcastLatestDateMap.get(a.feedUrl) || podcastLatestDateMap.get(a.id) || 0;
      const dateB = podcastLatestDateMap.get(b.feedUrl) || podcastLatestDateMap.get(b.id) || 0;
      return dateB - dateA;
    });
  }, [subscriptions, query, selectedSubLanguage, podcastLatestDateMap]);

  // Continue Listening Resolution: find most recent uncompleted podcast episode from history
  const continueListeningItem = useMemo(() => {
    const podcastHistory = history.filter(h => {
      const isPodcast = h.lessonType === "podcast" || (h as any).audioUrl || (h as any).podcastTitle;
      const hasDuration = (h.durationSeconds || 0) > 0;
      const notCompleted = h.status !== "completed" && h.actionType !== "complete";
      return isPodcast && hasDuration && notCompleted;
    });

    if (podcastHistory.length === 0) return null;

    // Sort by timestamp desc
    podcastHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return podcastHistory[0];
  }, [history]);

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    const clean = val.trim();
    if (!clean) {
      clearSearch();
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      searchPodcasts(clean);
    }, 350);
  }, [searchPodcasts, clearSearch]);

  const handleClearSearch = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    setQuery("");
    clearSearch();
    searchInputRef.current?.focus();
  }, [clearSearch]);

  const handleOpenPodcast = useCallback((podcast: PodcastSubscription | PodcastSearchResult) => {
    setCurrentPodcast(podcast);
  }, [setCurrentPodcast]);

  const handleBack = useCallback(() => {
    setCurrentPodcast(null);
  }, [setCurrentPodcast]);

  const handlePlayTimelineEpisode = useCallback((ep: PodcastTimelineEpisode) => {
    const squareArtwork = ep.artworkUrl || ep.podcastArtwork || "";
    const activeLang = normalizeLanguage((selectedTargetLanguage && selectedTargetLanguage !== "All")
      ? selectedTargetLanguage
      : ep.podcastLanguage || "es");
    setQueue(
      [{
        id: ep.guid,
        guid: ep.guid,
        title: ep.title,
        audioUrl: ep.audioUrl,
        bookTitle: ep.podcastTitle || "Podcast",
        podcastTitle: ep.podcastTitle || "Podcast",
        coverUrl: squareArtwork,
        duration: ep.duration || undefined,
        lessonType: "podcast",
        channelName: ep.podcastAuthor || ep.podcastTitle || "Podcast",
        description: ep.description,
        pubDate: ep.pubDate,
        transcriptUrl: ep.transcriptUrl,
        hasTranscript: ep.hasTranscript,
        targetLanguage: activeLang,
      }],
      0,
      true
    );
  }, [setQueue, selectedTargetLanguage]);

  const handleImportTimelineEpisode = useCallback(async (ep: PodcastTimelineEpisode) => {
    const activeLang = normalizeLanguage((selectedTargetLanguage && selectedTargetLanguage !== "All")
      ? selectedTargetLanguage
      : ep.podcastLanguage || "es");

    const taskId = `podcast_import_${ep.guid}_${Date.now()}`;
    const cleanTitle = ep.title || "Podcast Episode";

    registerCustomTask({ id: taskId, title: cleanTitle, stageText: t("podcasts.stage_importing", "Downloading & processing episode...") });

    try {
      updateCustomTask(taskId, { progress: 30, stageText: t("podcasts.stage_transcribing_whisper", "Speech recognition via Whisper...") });

      const lessonId = await importEpisode(
        ep,
        ep.podcastTitle || "Podcast",
        activeLang,
        ep.artworkUrl || ep.podcastArtwork || "",
        activeLang,
        taskId
      );

      if (lessonId) {
        completeCustomTask(taskId);
        showToast(
          t("podcasts.episode_imported_toast", 'Episode "{{title}}" added to library', { title: ep.title }),
          "success",
          6000,
          onOpenLesson ? {
            label: t("podcasts.open_lesson", "Open lesson"),
            onClick: () => onOpenLesson(lessonId)
          } : undefined
        );
      } else {
        failCustomTask(taskId, "Import returned empty result");
        showToast(
          t("podcasts.episode_import_failed_toast", 'Failed to add episode "{{title}}": {{error}}', {
            title: ep.title,
            error: "Unknown error",
          }),
          "error"
        );
      }
    } catch (err: any) {
      failCustomTask(taskId, err.message || "Import failed");
      showToast(
        t("podcasts.episode_import_failed_toast", 'Failed to add episode "{{title}}": {{error}}', {
          title: ep.title,
          error: err.message || "Network error",
        }),
        "error"
      );
    }
  }, [selectedTargetLanguage, importEpisode, registerCustomTask, updateCustomTask, completeCustomTask, failCustomTask, showToast, t, onOpenLesson]);

  // Filtered timeline episodes
  const filteredTimeline = useMemo(() => {
    let list = [...timelineEpisodes];

    if (normalizedTargetLang) {
      list = list.filter(ep => {
        const epLang = normalizeLanguageCode(ep.podcastLanguage);
        if (!epLang) return true;
        return epLang === normalizedTargetLang;
      });
    }

    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase().trim();
      list = list.filter(ep =>
        ep.title?.toLowerCase().includes(q) ||
        ep.description?.toLowerCase().includes(q) ||
        ep.podcastTitle?.toLowerCase().includes(q)
      );
    }

    if (timelineStatusFilter === "in_progress") {
      list = list.filter(ep => getEpisodeLessonInfo(ep, lessons, history, importedEpisodes).status === "in_progress");
    } else if (timelineStatusFilter === "completed") {
      list = list.filter(ep => getEpisodeLessonInfo(ep, lessons, history, importedEpisodes).status === "completed");
    } else if (timelineStatusFilter === "unheard") {
      list = list.filter(ep => getEpisodeLessonInfo(ep, lessons, history, importedEpisodes).status === "not_in_library");
    }

    list.sort((a, b) => {
      if (timelineSort === "newest") {
        return (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0);
      }
      if (timelineSort === "oldest") {
        return (new Date(a.pubDate).getTime() || 0) - (new Date(b.pubDate).getTime() || 0);
      }
      if (timelineSort === "shortest") {
        return parseDurationToSeconds(a.duration) - parseDurationToSeconds(b.duration);
      }
      if (timelineSort === "longest") {
        return parseDurationToSeconds(b.duration) - parseDurationToSeconds(a.duration);
      }
      return 0;
    });

    return list;
  }, [timelineEpisodes, normalizedTargetLang, timelineSearch, timelineStatusFilter, timelineSort, lessons, history, importedEpisodes]);

  const visibleTimeline = useMemo(() => {
    return filteredTimeline.slice(0, activeTab === "overview" ? 10 : timelineVisibleCount);
  }, [filteredTimeline, timelineVisibleCount, activeTab]);

  const timelineLessonInfoMap = useMemo(() => {
    const map = new Map<string, EpisodeLessonInfo>();
    for (const ep of visibleTimeline) {
      map.set(ep.guid, getEpisodeLessonInfo(ep, lessons, history, importedEpisodes));
    }
    return map;
  }, [visibleTimeline, lessons, history, importedEpisodes]);

  const handleOpenPodcastFromTimeline = useCallback((ep: PodcastTimelineEpisode) => {
    const matchedSub = subscriptions.find(s => s.feedUrl === ep.feedUrl || s.id === ep.podcastId);
    if (matchedSub) {
      handleOpenPodcast(matchedSub);
    } else {
      handleOpenPodcast({
        title: ep.podcastTitle,
        author: ep.podcastAuthor || "",
        feedUrl: ep.feedUrl,
        artworkUrl: ep.podcastArtwork,
        language: ep.podcastLanguage,
      } as any);
    }
  }, [subscriptions, handleOpenPodcast]);

  if (currentPodcast) {
    return (
      <PodcastChannelView
        podcast={currentPodcast}
        onBack={handleBack}
        lessons={lessons}
        history={history}
        selectedTargetLanguage={selectedTargetLanguage}
        onOpenLesson={onOpenLesson}
        onToggleCompleteLesson={onToggleCompleteLesson}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden w-full max-w-full bg-zinc-50/50 dark:bg-zinc-950">
      <style>{`
        .podcast-carousel-scroll::-webkit-scrollbar,
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          background: transparent !important;
          -webkit-appearance: none !important;
        }
        .podcast-carousel-scroll,
        .no-scrollbar {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
      `}</style>
      {/* ── Top Clean Search & Filter Bar ────────────────────────────────────── */}
      <div className="px-3 sm:px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0 shadow-2xs w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 max-w-7xl mx-auto w-full min-w-0">
          {/* Back button if drilled into Subscriptions or Timeline */}
          {activeTab !== "overview" && (
            <button
              onClick={() => setActiveTab("overview")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-all cursor-pointer shadow-3xs shrink-0 self-start sm:self-center"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t("common.back_to_overview", "Back to Overview")}</span>
            </button>
          )}

          {/* Search Input */}
          <div className="relative flex items-center flex-1 max-w-md w-full min-w-0">
            <Search className="absolute left-3.5 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={activeTab === "timeline" ? timelineSearch : query}
              onChange={(e) => {
                if (activeTab === "timeline") {
                  setTimelineSearch(e.target.value);
                } else {
                  handleQueryChange(e.target.value);
                }
              }}
              placeholder={
                activeTab === "timeline"
                  ? t("podcasts.search_timeline_placeholder", "Filter episodes by title or podcast…")
                  : t("podcasts.search_placeholder", "Search podcasts or enter RSS feed URL…")
              }
              className="w-full pl-10 pr-9 py-2 bg-white dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all shadow-3xs"
            />
            {(activeTab === "timeline" ? timelineSearch : query) && (
              <button
                onClick={() => {
                  if (activeTab === "timeline") {
                    setTimelineSearch("");
                  } else {
                    handleClearSearch();
                  }
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Language filter chips */}
          {availableSubLanguages.length > 2 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
              <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mr-1 shrink-0">
                {t("library.language", "Language:")}
              </span>
              {availableSubLanguages.map((lang) => {
                const isAll = lang === "all";
                const meta = !isAll ? LANGUAGE_META[lang] : null;
                const label = isAll ? t("library.all", "All") : (meta?.label || lang.toUpperCase());
                const flag = meta?.flag || "🌐";
                const isSelected = selectedSubLanguage === lang;

                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setSelectedSubLanguage(lang)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                      isSelected
                        ? "bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-800 shadow-3xs"
                        : "bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-700"
                    }`}
                  >
                    <span>{flag}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Content Scroll Area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 sm:py-5 space-y-6 sm:space-y-8 max-w-7xl mx-auto w-full min-w-0">
        
        {/* ── SECTION 1: Continue Listening Hero Banner (Overview mode) ───────── */}
        {activeTab === "overview" && continueListeningItem && (
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-cyan-500/10 dark:from-teal-950/40 dark:via-zinc-900 dark:to-cyan-950/30 border border-teal-200/60 dark:border-teal-900/60 p-4 sm:p-5 shadow-sm w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0 w-full">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {continueListeningItem.coverUrl ? (
                  <img
                    src={continueListeningItem.coverUrl}
                    alt={continueListeningItem.lessonTitle}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shadow-md shrink-0 border border-black/10"
                  />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-teal-500 text-white flex items-center justify-center shadow-md shrink-0">
                    <Headphones className="w-7 h-7" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 min-w-0 overflow-hidden">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-700 dark:text-teal-300 uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {t("podcasts.continue_listening", "Continue Listening")}
                    </span>
                    {continueListeningItem.channelName && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate min-w-0">
                        • {continueListeningItem.channelName}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 truncate min-w-0">
                    {continueListeningItem.lessonTitle}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {formatSecondsCompact(continueListeningItem.durationSeconds || 0)} {t("history_page.listened", "listened")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => {
                    const matchedLesson = lessons.find(l => l.id === continueListeningItem.lessonId);
                    if (matchedLesson && onOpenLesson) {
                      onOpenLesson(matchedLesson.id);
                    } else {
                      const matchedEp = timelineEpisodes.find(ep => ep.guid === continueListeningItem.lessonId || ep.guid === continueListeningItem.id);
                      const audioUrl = continueListeningItem.audioUrl || matchedEp?.audioUrl || (continueListeningItem as any).sourceUrl;
                      if (audioUrl) {
                        const seekTarget = continueListeningItem.lastPosition || 0;
                        setQueue(
                          [{
                            id: continueListeningItem.lessonId || continueListeningItem.id,
                            guid: continueListeningItem.lessonId || continueListeningItem.id,
                            title: continueListeningItem.lessonTitle,
                            audioUrl: audioUrl,
                            bookTitle: continueListeningItem.channelName || continueListeningItem.podcastTitle || "Podcast",
                            podcastTitle: continueListeningItem.channelName || continueListeningItem.podcastTitle || "Podcast",
                            coverUrl: continueListeningItem.coverUrl || matchedEp?.artworkUrl || matchedEp?.podcastArtwork || "",
                            duration: continueListeningItem.durationSeconds || undefined,
                            lessonType: "podcast",
                            channelName: continueListeningItem.channelName || continueListeningItem.podcastTitle || "Podcast",
                            targetLanguage: continueListeningItem.targetLanguage || "es",
                          }],
                          0,
                          true
                        );
                        if (seekTarget > 0) {
                          setTimeout(() => {
                            usePlaylistStore.getState().seek(seekTarget);
                          }, 200);
                        }
                      }
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{t("reader.resume", "Resume")}</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── SECTION 2: My Channels / Subscriptions ──────────────────────────── */}
        {(activeTab === "overview" || activeTab === "subscriptions") && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  {t("podcasts.my_podcasts", "My Subscriptions")}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {filteredSubscriptions.length}
                </span>
              </div>

              {activeTab === "overview" && filteredSubscriptions.length > 6 && (
                <button
                  onClick={() => setActiveTab("subscriptions")}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{t("common.view_all", "View all")}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isLoadingSubscriptions && subscriptions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Mic2 className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                    {t("podcasts.no_subscriptions", "No subscriptions yet")}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {t("podcasts.no_subscriptions_hint", "Search iTunes catalog or enter an RSS feed to get started")}
                  </p>
                </div>
              </div>
            ) : activeTab === "overview" ? (
              <div className="relative group/carousel">
                {/* Scroll Left Button */}
                {canScrollLeft && (
                  <button
                    onClick={() => handleScrollCarousel("left")}
                    className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-lg border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 flex items-center justify-center transition-all opacity-0 group-hover/carousel:opacity-100 cursor-pointer active:scale-95 hover:scale-105"
                    title="Scroll left"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                {/* Scroll Right Button */}
                {canScrollRight && filteredSubscriptions.length > 3 && (
                  <button
                    onClick={() => handleScrollCarousel("right")}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-lg border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 flex items-center justify-center transition-all opacity-0 group-hover/carousel:opacity-100 cursor-pointer active:scale-95 hover:scale-105"
                    title="Scroll right"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}

                {/* Carousel Container */}
                <div
                  ref={carouselRef}
                  onScroll={checkScrollability}
                  className="podcast-carousel-scroll flex gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 scroll-smooth w-full min-w-0"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {filteredSubscriptions.map((sub) => (
                    <div key={sub.id} className="w-36 sm:w-44 shrink-0 flex min-w-0">
                      <PodcastCard
                        title={sub.title}
                        subtitle={sub.author}
                        artworkUrl={sub.artworkUrl}
                        language={sub.language}
                        onClick={() => handleOpenPodcast(sub)}
                      />
                    </div>
                  ))}

                  {/* Explore & Add Card */}
                  <div className="w-36 sm:w-44 shrink-0 flex">
                    <button
                      type="button"
                      onClick={() => {
                        searchInputRef.current?.focus();
                      }}
                      className="w-full group flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 border-dashed border-teal-300/70 dark:border-teal-800/70 hover:border-teal-500 dark:hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/50 dark:bg-teal-950/10 dark:hover:bg-teal-950/30 transition-all cursor-pointer aspect-square text-center shadow-3xs hover:shadow-md hover:-translate-y-0.5"
                    >
                      <div className="w-10 h-10 rounded-full bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                        <Plus className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                        {t("podcasts.explore_podcasts", "Explore & Add")}
                      </span>
                      <span className="text-[10px] text-zinc-400 mt-0.5">
                        {t("podcasts.search_itunes_rss", "iTunes / RSS")}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
                {filteredSubscriptions.map((sub) => (
                  <PodcastCard
                    key={sub.id}
                    title={sub.title}
                    subtitle={sub.author}
                    artworkUrl={sub.artworkUrl}
                    language={sub.language}
                    onClick={() => handleOpenPodcast(sub)}
                  />
                ))}

                {/* Explore & Add Card */}
                <button
                  type="button"
                  onClick={() => {
                    searchInputRef.current?.focus();
                  }}
                  className="group flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 border-dashed border-teal-300/70 dark:border-teal-800/70 hover:border-teal-500 dark:hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/50 dark:bg-teal-950/10 dark:hover:bg-teal-950/30 transition-all cursor-pointer aspect-square text-center shadow-3xs hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                    {t("podcasts.explore_podcasts", "Explore & Add")}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5">
                    {t("podcasts.search_itunes_rss", "iTunes / RSS")}
                  </span>
                </button>
              </div>
            )}

            {/* Catalog search results if query is active */}
            {query.trim().length > 0 && (
              <div className="pt-6 border-t border-zinc-200/80 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    <span>{t("podcasts.search_results", "Catalog Search Results:")} "{query}"</span>
                  </span>
                  {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />}
                </div>

                {isSearching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-zinc-400 gap-1 text-xs">
                    <p>{t("podcasts.no_results", "No extra podcasts found on iTunes")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
                    {searchResults.map((podcast) => (
                      <PodcastCard
                        key={podcast.collectionId}
                        title={podcast.title}
                        subtitle={podcast.artistName}
                        artworkUrl={podcast.artworkUrl600}
                        genre={podcast.primaryGenreName}
                        trackCount={podcast.trackCount}
                        onClick={() => handleOpenPodcast(podcast)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── SECTION 3: Latest Episodes Feed ─────────────────────────────────── */}
        {(activeTab === "overview" || activeTab === "timeline") && (
          <section className="space-y-4 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (activeTab === "overview") setActiveTab("timeline");
                  }}
                  className={`text-sm font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 ${
                    activeTab === "overview" ? "hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer" : ""
                  }`}
                >
                  <Radio className="w-4 h-4 text-teal-500" />
                  <span>{activeTab === "timeline" ? t("podcasts.all_episodes", "All Episodes") : t("podcasts.tab_latest_episodes", "Latest Episodes")}</span>
                </button>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  {filteredTimeline.length}
                </span>
              </div>

              {/* Status Chips & Sort Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                {activeTab === "overview" && filteredTimeline.length > 10 && (
                  <>
                    <button
                      onClick={() => setActiveTab("timeline")}
                      className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{t("common.view_all", "View all")} ({filteredTimeline.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800 mx-2" />
                  </>
                )}
                <div className="flex items-center p-0.5 bg-zinc-200/50 dark:bg-zinc-800 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setTimelineStatusFilter("all")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                      timelineStatusFilter === "all"
                        ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {t("podcasts.filter_all", "All")}
                  </button>
                  <button
                    onClick={() => setTimelineStatusFilter("in_progress")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                      timelineStatusFilter === "in_progress"
                        ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {t("podcasts.filter_in_progress", "In Progress")}
                  </button>
                  <button
                    onClick={() => setTimelineStatusFilter("unheard")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                      timelineStatusFilter === "unheard"
                        ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {t("podcasts.filter_unheard", "New")}
                  </button>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={timelineSort}
                    onChange={(e) => setTimelineSort(e.target.value as any)}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-semibold cursor-pointer shadow-3xs"
                  >
                    <option value="newest">{t("podcasts.sort_newest", "Newest")}</option>
                    <option value="oldest">{t("podcasts.sort_oldest", "Oldest")}</option>
                    <option value="shortest">{t("podcasts.sort_shortest", "Shortest")}</option>
                    <option value="longest">{t("podcasts.sort_longest", "Longest")}</option>
                  </select>
                </div>

                {/* Force Refresh Button */}
                <button
                  onClick={() => fetchTimeline(true)}
                  disabled={isTimelineLoading}
                  className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-teal-500 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-teal-600 transition-all cursor-pointer disabled:opacity-50 shadow-3xs"
                  title={t("podcasts.refresh_timeline", "Refresh timeline")}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTimelineLoading ? "animate-spin text-teal-500" : ""}`} />
                </button>
              </div>
            </div>

            {/* Timeline List Content */}
            {isTimelineLoading && timelineEpisodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
                <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
                <p className="text-xs font-semibold">{t("podcasts.loading_timeline", "Aggregating latest episodes…")}</p>
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
                <Radio className="w-8 h-8 opacity-30" />
                <p className="text-xs font-semibold">{t("podcasts.subscribe_for_timeline", "Subscribe to podcasts to see their latest episodes here.")}</p>
              </div>
            ) : filteredTimeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <Filter className="w-7 h-7 opacity-30" />
                <p className="text-xs font-semibold">{t("podcasts.no_matching_episodes", "No episodes match current filters")}</p>
                {(timelineSearch || timelineStatusFilter !== "all") && (
                  <button
                    onClick={() => {
                      setTimelineSearch("");
                      setTimelineStatusFilter("all");
                    }}
                    className="mt-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    {t("podcasts.reset_filters", "Reset filters")}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleTimeline.map((ep) => {
                  const lessonInfo = timelineLessonInfoMap.get(ep.guid) || getEpisodeLessonInfo(ep, lessons, history, importedEpisodes);
                  const isImporting = !!importingEpisodes[ep.guid];
                  const stage = importingStages[ep.guid] || null;

                  return (
                    <EpisodeRow
                      key={`${ep.podcastId || ep.feedUrl}_${ep.guid}`}
                      episode={ep}
                      podcastTitle={ep.podcastTitle || "Podcast"}
                      artworkUrl={ep.artworkUrl || ep.podcastArtwork || ""}
                      language={ep.podcastLanguage || "es"}
                      lessonInfo={lessonInfo}
                      isImporting={isImporting}
                      importStage={stage}
                      isPlaying={currentPlayingGuid === ep.guid}
                      showPodcastTitle={true}
                      onPlay={handlePlayTimelineEpisode}
                      onImport={handleImportTimelineEpisode}
                      onOpenLesson={onOpenLesson}
                      onToggleCompleteLesson={onToggleCompleteLesson}
                      onOpenPodcast={() => handleOpenPodcastFromTimeline(ep)}
                    />
                  );
                })}

                {activeTab === "overview" && filteredTimeline.length > 10 && (
                  <div className="flex justify-center pt-2 pb-4">
                    <button
                      onClick={() => setActiveTab("timeline")}
                      className="px-6 py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-teal-600 dark:text-teal-400 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-all shadow-3xs cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{t("podcasts.show_all_episodes", "Show all episodes")} ({filteredTimeline.length})</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {activeTab === "timeline" && timelineVisibleCount < filteredTimeline.length && (
                  <div className="flex justify-center pt-3 pb-6">
                    <button
                      onClick={() => setTimelineVisibleCount(c => c + 25)}
                      className="px-6 py-2.5 bg-white hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-all shadow-3xs cursor-pointer active:scale-95"
                    >
                      {t("podcasts.load_more", "Show more")} ({filteredTimeline.length - timelineVisibleCount})
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
