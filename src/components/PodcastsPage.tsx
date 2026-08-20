import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Rss, Loader2, Mic2, X, Radio, RefreshCw,
  ArrowUpDown, Filter, Sparkles, Plus,
} from "lucide-react";
import { usePodcastStore } from "../store/podcastStore";
import { usePlaylistStore } from "../store/playlistStore";
import { useToast } from "../context/ToastContext";
import { useWhisperQueue } from "../services/whisperQueueService";
import { Lesson, HistoryEntry, PodcastSubscription, PodcastSearchResult, PodcastTimelineEpisode } from "../types";
import PodcastChannelView, { EpisodeRow, getEpisodeLessonInfo } from "./PodcastChannelView";

// ── Language Normalization Helper ─────────────────────────────────────────────

function normalizeLanguageCode(lang?: string): string {
  if (!lang) return "es";
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

function parseDurationToSeconds(dur?: string | number | null): number {
  if (!dur) return 0;
  if (typeof dur === "number") return dur;
  if (!dur.includes(":")) return parseInt(dur, 10) || 0;
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// ── Podcast Card ──────────────────────────────────────────────────────────────

interface PodcastCardProps {
  title: string;
  subtitle: string;
  artworkUrl: string;
  genre?: string;
  trackCount?: number;
  isSubscribed?: boolean;
  onClick: () => void;
}

const PodcastCard: React.FC<PodcastCardProps> = ({
  title, subtitle, artworkUrl, genre, trackCount, isSubscribed, onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden hover:border-teal-400 dark:hover:border-teal-600 hover:shadow-md transition-all text-left group cursor-pointer"
    >
      <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
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
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 line-clamp-2 leading-snug">{title}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{subtitle}</p>
        {(genre || trackCount) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {genre && (
              <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full">
                {genre}
              </span>
            )}
            {trackCount ? (
              <span className="text-[10px] text-zinc-400">{trackCount} ep.</span>
            ) : null}
          </div>
        )}
      </div>
    </button>
  );
};

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

  // Tab: "subscriptions" | "timeline"
  const [activeTab, setActiveTab] = useState<"subscriptions" | "timeline">("subscriptions");

  // Timeline filters & sorting
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineSort, setTimelineSort] = useState<"newest" | "oldest" | "shortest" | "longest">("newest");
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<"all" | "in_progress" | "completed" | "unheard">("all");

  const {
    subscriptions, searchResults,
    timelineEpisodes, isTimelineLoading, fetchTimeline,
    isSearching, isLoadingSubscriptions,
    fetchSubscriptions, searchPodcasts, clearSearch,
    setCurrentPodcast, currentPodcast,
    importEpisode, importingEpisodes, importingStages, importedEpisodes,
  } = usePodcastStore();

  const { setQueue } = usePlaylistStore();
  const { registerCustomTask, updateCustomTask, completeCustomTask, failCustomTask } = useWhisperQueue();

  const [query, setQuery] = useState("");
  const [selectedSubLanguage, setSelectedSubLanguage] = useState<string>("all");
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchSubscriptions();
    fetchTimeline();
  }, [fetchSubscriptions, fetchTimeline]);

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

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!val.trim()) {
      clearSearch();
      return;
    }
    const t = setTimeout(() => searchPodcasts(val.trim()), 450);
    setSearchDebounce(t);
  }, [searchDebounce, searchPodcasts, clearSearch]);

  const handleClearSearch = useCallback(() => {
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
    const activeLang = (selectedTargetLanguage && selectedTargetLanguage !== "All")
      ? selectedTargetLanguage
      : ep.podcastLanguage || "es";
    setQueue(
      [{
        id: ep.guid,
        guid: ep.guid,
        title: ep.title,
        audioUrl: ep.audioUrl,
        bookTitle: ep.podcastTitle || "Podcast",
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
    const activeLang = (selectedTargetLanguage && selectedTargetLanguage !== "All")
      ? selectedTargetLanguage
      : ep.podcastLanguage || "es";

    const taskId = `podcast_import_${ep.guid}_${Date.now()}`;
    const cleanTitle = ep.title || "Podcast Episode";

    registerCustomTask(taskId, cleanTitle, t("podcasts.stage_importing", "Downloading & processing episode..."));

    try {
      updateCustomTask(taskId, 30, t("podcasts.stage_transcribing_whisper", "Speech recognition via Whisper..."));

      const lessonId = await importEpisode(
        ep,
        ep.podcastTitle || "Podcast",
        ep.podcastLanguage || "es",
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

  const normalizedTargetLang = (selectedTargetLanguage && selectedTargetLanguage !== "All")
    ? normalizeLanguageCode(selectedTargetLanguage)
    : null;

  const filteredTimeline = useMemo(() => {
    let list = [...timelineEpisodes];

    if (normalizedTargetLang) {
      list = list.filter(ep => {
        if (!ep.podcastLanguage) return true;
        return normalizeLanguageCode(ep.podcastLanguage) === normalizedTargetLang;
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 pb-3 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Mic2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
              {t("podcasts.title", "Podcasts")}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("podcasts.subtitle", "Listen and study with podcasts")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 w-full sm:w-auto p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 shadow-xs">
          <button
            onClick={() => setActiveTab("subscriptions")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "subscriptions"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            <Rss className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t("podcasts.tab_subscriptions", "Subscriptions")}</span>
            {subscriptions.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-zinc-200/70 dark:bg-zinc-700 text-[10px] rounded-full shrink-0">
                {subscriptions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "timeline"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t("podcasts.tab_latest_episodes", "Latest Episodes")}</span>
            {timelineEpisodes.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[10px] rounded-full font-bold shrink-0">
                {timelineEpisodes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 pt-3 shrink-0">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={activeTab === "subscriptions" ? query : timelineSearch}
            onChange={(e) => {
              if (activeTab === "subscriptions") {
                handleQueryChange(e.target.value);
              } else {
                setTimelineSearch(e.target.value);
              }
            }}
            placeholder={
              activeTab === "subscriptions"
                ? t("podcasts.search_placeholder", "Search podcasts by title or author…")
                : t("podcasts.search_timeline_placeholder", "Filter episodes by title, notes, or podcast…")
            }
            className="w-full pl-10 pr-9 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all shadow-2xs"
          />
          {(activeTab === "subscriptions" ? query : timelineSearch) && (
            <button
              onClick={() => {
                if (activeTab === "subscriptions") {
                  handleClearSearch();
                } else {
                  setTimelineSearch("");
                  searchInputRef.current?.focus();
                }
              }}
              className="absolute right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
        {activeTab === "subscriptions" && (
          <section className="space-y-4">
            
            {availableSubLanguages.length > 2 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
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
                          : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800"
                      }`}
                    >
                      <span>{flag}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                {t("podcasts.my_podcasts", "My Subscriptions")} ({filteredSubscriptions.length})
              </span>
              {isLoadingSubscriptions && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              )}
            </div>

            {isLoadingSubscriptions && subscriptions.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Mic2 className="w-7 h-7 opacity-40" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                    {t("podcasts.no_subscriptions", "No subscriptions yet")}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    {t("podcasts.no_subscriptions_hint", "Search for podcasts to get started")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 sm:gap-4">
                {filteredSubscriptions.map((sub) => (
                  <PodcastCard
                    key={sub.id}
                    title={sub.title}
                    subtitle={sub.author}
                    artworkUrl={sub.artworkUrl}
                    onClick={() => handleOpenPodcast(sub)}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => {
                    searchInputRef.current?.focus();
                  }}
                  className="group flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-teal-500 dark:hover:border-teal-600 bg-zinc-50/50 hover:bg-teal-50/20 dark:bg-zinc-900/30 dark:hover:bg-teal-950/20 transition-all cursor-pointer aspect-square text-center shadow-3xs hover:shadow-xs"
                >
                  <div className="w-9 h-9 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 border border-teal-200/60 dark:border-teal-800/60">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                    {t("podcasts.explore_podcasts", "Explore & Add")}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5">
                    {t("podcasts.search_itunes_rss", "Search iTunes / RSS")}
                  </span>
                </button>
              </div>
            )}

            {query.trim().length > 0 && (
              <div className="pt-6 border-t border-zinc-200/80 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    <span>{t("podcasts.search_results", "iTunes Catalog Results:")} "{query}"</span>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 sm:gap-4">
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

        {activeTab === "timeline" && (
          <section className="space-y-4">
            {/* Timeline Filter & Sort Toolbar */}
            <div className="flex items-center justify-between gap-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 flex-wrap">
              {/* Status Chips */}
              <div className="flex items-center p-0.5 bg-zinc-200/50 dark:bg-zinc-700/50 rounded-xl text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth max-w-full">
                <button
                  onClick={() => setTimelineStatusFilter("all")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                    timelineStatusFilter === "all"
                      ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {t("podcasts.filter_all", "All")}
                </button>
                <button
                  onClick={() => setTimelineStatusFilter("in_progress")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                    timelineStatusFilter === "in_progress"
                      ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {t("podcasts.filter_in_progress", "In Progress")}
                </button>
                <button
                  onClick={() => setTimelineStatusFilter("completed")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                    timelineStatusFilter === "completed"
                      ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {t("podcasts.filter_completed", "Completed")}
                </button>
                <button
                  onClick={() => setTimelineStatusFilter("unheard")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                    timelineStatusFilter === "unheard"
                      ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs font-bold"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {t("podcasts.filter_unheard", "New")}
                </button>
              </div>

              {/* Sort & Refresh controls */}
              <div className="flex items-center gap-2">
                {/* Sort Dropdown */}
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  <select
                    value={timelineSort}
                    onChange={(e) => setTimelineSort(e.target.value as any)}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-semibold cursor-pointer"
                  >
                    <option value="newest">{t("podcasts.sort_newest", "Newest First")}</option>
                    <option value="oldest">{t("podcasts.sort_oldest", "Oldest First")}</option>
                    <option value="shortest">{t("podcasts.sort_shortest", "Shortest First")}</option>
                    <option value="longest">{t("podcasts.sort_longest", "Longest First")}</option>
                  </select>
                </div>

                {/* Force Refresh Button */}
                <button
                  onClick={() => fetchTimeline(true)}
                  disabled={isTimelineLoading}
                  className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-teal-500 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-teal-600 transition-all cursor-pointer disabled:opacity-50"
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
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
                <Radio className="w-10 h-10 opacity-30" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    {t("podcasts.no_subscriptions", "No subscriptions yet")}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    {t("podcasts.subscribe_for_timeline", "Subscribe to podcasts to see their latest episodes here.")}
                  </p>
                </div>
              </div>
            ) : filteredTimeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
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
                {filteredTimeline.map((ep) => {
                  const lessonInfo = getEpisodeLessonInfo(ep, lessons, history, importedEpisodes);
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
                      showPodcastTitle={true}
                      onPlay={() => handlePlayTimelineEpisode(ep)}
                      onImport={() => handleImportTimelineEpisode(ep)}
                      onOpenLesson={onOpenLesson}
                      onToggleCompleteLesson={onToggleCompleteLesson}
                      onOpenPodcast={() => {
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
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Discover hint (only when no search and no subs) */}
        {!query.trim() && subscriptions.length === 0 && !isLoadingSubscriptions && (
          <section className="mt-2">
            <div className="rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/40 p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-teal-700 dark:text-teal-300">
                  {t("podcasts.tip_title", "Tip: Search by language")}
                </p>
                <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5 leading-relaxed">
                  {t("podcasts.tip_body", 'Try searching "Spanish daily" or "French news" to find language learning podcasts.')}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
