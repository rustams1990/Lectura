import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Play, Plus, Check, Loader2, Rss, Clock, Calendar,
  FileText, AlertCircle, RefreshCw, Bell, BellOff, Mic, Search,
  ArrowUpDown, MoreVertical, Copy, ExternalLink, X, Filter, CheckCircle2,
  BookOpen, CheckCheck, RotateCcw,
} from "lucide-react";
import { usePodcastStore } from "../store/podcastStore";
import { usePlaylistStore } from "../store/playlistStore";
import { Lesson, HistoryEntry, PodcastSubscription, PodcastSearchResult, PodcastEpisode } from "../types";
import { useToast } from "../context/ToastContext";
import { whisperQueueService } from "../services/whisperQueueService";
import { formatAppDate } from "../utils/dateFormatter";
import { normalizeLanguage } from "../utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

export const parseDurationToSeconds = (dur?: string | number | null): number => {
  if (!dur) return 0;
  if (typeof dur === "number") return dur;
  const str = String(dur).trim();
  if (!str.includes(":")) return parseInt(str, 10) || 0;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPubDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return formatAppDate(dateStr);
  } catch {
    return dateStr;
  }
}

// ── Lesson Matching & Progress Status ──────────────────────────────────────────

export type EpisodeProgressStatus = "completed" | "in_progress" | "in_library" | "not_in_library";

export interface EpisodeLessonInfo {
  lesson?: Lesson;
  status: EpisodeProgressStatus;
  durationSeconds?: number;
}

export function getEpisodeLessonInfo(
  episode: PodcastEpisode,
  lessons: Lesson[],
  history: HistoryEntry[],
  importedEpisodes: Record<string, string>
): EpisodeLessonInfo {
  const epAudio = episode.audioUrl ? episode.audioUrl.trim().toLowerCase() : "";
  const epTitle = episode.title ? episode.title.trim().toLowerCase() : "";
  const importedLessonId = importedEpisodes[episode.guid];

  const matched = lessons.find(l => {
    if (importedLessonId && l.id === importedLessonId) return true;
    if (epAudio && l.audioUrl) {
      const lAudio = l.audioUrl.trim().toLowerCase();
      if (lAudio === epAudio || lAudio.endsWith(epAudio.split("/").pop() || "")) return true;
    }
    if (epTitle && l.title && l.title.trim().toLowerCase() === epTitle) return true;
    return false;
  });

  if (!matched) {
    if (importedLessonId) {
      return { status: "in_library" };
    }
    return { status: "not_in_library" };
  }

  // Check history entries for completion/progress
  const entries = history.filter(h => h.lessonId === matched.id);
  const isCompleted = entries.some(h => h.status === "completed" || h.actionType === "complete");
  if (isCompleted) {
    const totalSecs = entries.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
    return { lesson: matched, status: "completed", durationSeconds: totalSecs };
  }

  const isInProgress = entries.some(h => h.status === "in_progress" || (h.durationSeconds && h.durationSeconds > 0));
  if (isInProgress) {
    const totalSecs = entries.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
    return { lesson: matched, status: "in_progress", durationSeconds: totalSecs };
  }

  return { lesson: matched, status: "in_library" };
}

// ── Episode Action Dropdown Menu ──────────────────────────────────────────────

interface EpisodeMenuProps {
  episode: PodcastEpisode;
  matchedLesson?: Lesson;
  status: EpisodeProgressStatus;
  onCopyAudioLink: () => void;
  onCopyTranscriptLink?: () => void;
  onOpenLesson?: (lessonId: string) => void;
  onToggleCompleteLesson?: (lessonId: string) => void;
}

const EpisodeMenu: React.FC<EpisodeMenuProps> = ({
  episode, matchedLesson, status,
  onCopyAudioLink, onCopyTranscriptLink, onOpenLesson, onToggleCompleteLesson,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(o => !o)}
        className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        title={t("podcasts.more_actions", "More actions")}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs font-semibold">
          {matchedLesson && onOpenLesson && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenLesson(matchedLesson.id);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{t("podcasts.open_lesson", "Открыть урок")}</span>
            </button>
          )}

          {matchedLesson && onToggleCompleteLesson && (
            <button
              onClick={() => {
                setIsOpen(false);
                onToggleCompleteLesson(matchedLesson.id);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {status === "completed" ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t("podcasts.mark_as_uncompleted", "Сбросить статус")}</span>
                </>
              ) : (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t("podcasts.mark_as_completed", "Отметить как завершённый")}</span>
                </>
              )}
            </button>
          )}

          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

          <button
            onClick={() => {
              setIsOpen(false);
              onCopyAudioLink();
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
            <span>{t("podcasts.copy_audio_link", "Copy audio link")}</span>
          </button>

          {episode.transcriptUrl && onCopyTranscriptLink && (
            <button
              onClick={() => {
                setIsOpen(false);
                onCopyTranscriptLink();
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span>{t("podcasts.copy_transcript_link", "Copy transcript link")}</span>
            </button>
          )}

          {episode.audioUrl && (
            <a
              href={episode.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              <span>{t("podcasts.open_direct_audio", "Open in new tab")}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export interface EpisodeRowProps {
  episode: PodcastEpisode;
  podcastTitle: string;
  artworkUrl: string;
  language: string;
  lessonInfo: EpisodeLessonInfo;
  isImporting: boolean;
  importStage?: "downloading" | "transcribing" | null;
  showPodcastTitle?: boolean;
  onPlay: (ep: PodcastEpisode) => void;
  onImport: (ep: PodcastEpisode) => void;
  onOpenLesson?: (lessonId: string) => void;
  onToggleCompleteLesson?: (lessonId: string) => void;
  onOpenPodcast?: () => void;
}

export const EpisodeRow: React.FC<EpisodeRowProps> = ({
  episode, podcastTitle, artworkUrl, language, lessonInfo,
  isImporting, importStage, showPodcastTitle, onPlay, onImport, onOpenLesson, onToggleCompleteLesson, onOpenPodcast,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const status = lessonInfo.status;
  const isImported = status !== "not_in_library";

  const handleCopyAudio = useCallback(() => {
    if (episode.audioUrl) {
      navigator.clipboard.writeText(episode.audioUrl);
      showToast(t("podcasts.link_copied", "Audio link copied to clipboard!"), "success");
    }
  }, [episode.audioUrl, showToast, t]);

  const handleCopyTranscript = useCallback(() => {
    if (episode.transcriptUrl) {
      navigator.clipboard.writeText(episode.transcriptUrl);
      showToast(t("podcasts.link_copied", "Transcript link copied to clipboard!"), "success");
    }
  }, [episode.transcriptUrl, showToast, t]);

  return (
    <div className="group bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-3.5 mb-3 space-y-3 hover:border-teal-500/40 dark:hover:border-teal-500/30 hover:shadow-md transition-all">
      {/* 1. Top Row: Cover + Title + Menu */}
      <div className="flex items-start gap-3">
        <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-zinc-100 dark:bg-zinc-800 shadow-3xs">
          {(episode.artworkUrl || artworkUrl) ? (
            <img
              src={episode.artworkUrl || artworkUrl}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400">
              <Rss className="w-6 h-6" />
            </div>
          )}

          {/* Quick Play overlay on image hover */}
          <button
            onClick={() => onPlay(episode)}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white cursor-pointer"
            title={t("podcasts.listen", "Listen")}
          >
            <Play className="w-5 h-5 fill-white drop-shadow-md" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          {showPodcastTitle && podcastTitle && (
            <button
              onClick={onOpenPodcast}
              className={`text-[11px] font-bold text-teal-600 dark:text-teal-400 truncate block mb-0.5 text-left ${onOpenPodcast ? "hover:underline cursor-pointer" : ""}`}
            >
              {podcastTitle}
            </button>
          )}

          <button
            className="text-left w-full cursor-pointer focus:outline-none"
            onClick={() => setExpanded(e => !e)}
          >
            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {episode.title}
            </h4>

            {episode.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1 leading-relaxed">
                {episode.description.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim()}
              </p>
            )}
          </button>
        </div>

        {/* 3-dots Menu button */}
        <div className="shrink-0">
          <EpisodeMenu
            episode={episode}
            matchedLesson={lessonInfo.lesson}
            status={status}
            onCopyAudioLink={handleCopyAudio}
            onCopyTranscriptLink={episode.transcriptUrl ? handleCopyTranscript : undefined}
            onOpenLesson={onOpenLesson}
            onToggleCompleteLesson={onToggleCompleteLesson}
          />
        </div>
      </div>

      {/* 2. Bottom Row: Metadata (Date • Duration • Badges) on left, Action buttons on right */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 gap-2 flex-wrap sm:flex-nowrap">
        {/* Left: Metadata */}
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-medium flex-wrap">
          {episode.pubDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-400" />
              <span>{formatPubDate(episode.pubDate)}</span>
            </span>
          )}
          {episode.duration && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-400" />
                <span>{formatDuration(episode.duration)}</span>
              </span>
            </>
          )}

          {/* Dynamic Status Badge */}
          {status === "completed" && (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20 shadow-3xs" title={t("podcasts.status_completed", "Завершено")}>
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>{t("podcasts.status_completed", "Completed")}</span>
              </span>
            </>
          )}
          {status === "in_progress" && (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/20 shadow-3xs" title={t("podcasts.status_in_progress", "В процессе")}>
                <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>{t("podcasts.status_in_progress", "In Progress")}</span>
              </span>
            </>
          )}
          {status === "in_library" && (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800 shadow-3xs" title={t("podcasts.in_library", "В библиотеке")}>
                <CheckCircle2 className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>{t("podcasts.in_library", "In Library")}</span>
              </span>
            </>
          )}

          {/* Transcript badge (desktop) */}
          {(episode.hasTranscript || episode.transcriptUrl) && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800" title={t("podcasts.full_transcript", "Полный интерактивный транскрипт")}>
              <FileText className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400" />
              <span>{t("podcasts.transcript", "Transcript")}</span>
            </span>
          )}
        </div>

        {/* Right: Actions (Play + Open / Add) */}
        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          <button
            onClick={() => onPlay(episode)}
            className="w-8 h-8 rounded-full bg-teal-600 hover:bg-teal-500 active:scale-95 text-white flex items-center justify-center shadow-sm hover:shadow-teal-600/30 transition-all cursor-pointer"
            title={t("podcasts.listen", "Listen")}
          >
            <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
          </button>

          {status === "completed" ? (
            <button
              onClick={() => onOpenLesson && lessonInfo.lesson && onOpenLesson(lessonInfo.lesson.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all shadow-3xs bg-zinc-50 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-800 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-400 border border-zinc-200/80 dark:border-zinc-700 hover:border-emerald-200 dark:hover:border-emerald-800 cursor-pointer active:scale-95"
              title={t("podcasts.open_lesson", "Open lesson")}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{t("podcasts.open_lesson", "Open lesson")}</span>
            </button>
          ) : status === "in_progress" ? (
            <button
              onClick={() => onOpenLesson && lessonInfo.lesson && onOpenLesson(lessonInfo.lesson.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all shadow-3xs bg-zinc-50 dark:bg-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-zinc-800 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 border border-zinc-200/80 dark:border-zinc-700 hover:border-teal-200 dark:hover:border-teal-800 cursor-pointer active:scale-95"
              title={t("podcasts.continue_lesson", "Continue lesson")}
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{t("podcasts.continue_action", "Continue")}</span>
            </button>
          ) : status === "in_library" ? (
            <button
              onClick={() => onOpenLesson && lessonInfo.lesson && onOpenLesson(lessonInfo.lesson.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all shadow-3xs bg-zinc-50 dark:bg-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-zinc-800 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 border border-zinc-200/80 dark:border-zinc-700 hover:border-teal-200 dark:hover:border-teal-800 cursor-pointer active:scale-95"
              title={t("podcasts.open_lesson", "Open lesson")}
            >
              <BookOpen className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              <span>{t("podcasts.open_lesson", "Open lesson")}</span>
            </button>
          ) : (
            <button
              onClick={() => onImport(episode)}
              disabled={isImporting}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all shadow-3xs ${
                isImporting
                  ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 cursor-wait animate-pulse"
                  : "bg-zinc-50 dark:bg-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-zinc-700 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 border border-zinc-200 dark:border-zinc-700 hover:border-teal-200 dark:hover:border-teal-800 cursor-pointer active:scale-95"
              }`}
              title={t("podcasts.import_to_library", "Add to Library")}
            >
              {isImporting ? (
                importStage === "transcribing" ? (
                  <Mic className="w-3.5 h-3.5 animate-bounce text-teal-600 dark:text-teal-400" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                )
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>
                {isImporting
                  ? (importStage === "transcribing"
                      ? t("podcasts.import_transcribing", "Whisper…")
                      : t("podcasts.import_downloading", "Downloading…"))
                  : t("podcasts.import_to_library", "+ Add")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded full description */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 animate-in fade-in duration-150 space-y-2">
          {!episode.hasTranscript && !episode.transcriptUrl && (
            <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2 leading-relaxed">
              <span className="shrink-0 text-xs mt-0.5">💡</span>
              <span>
                {t("podcasts.no_transcript_notice", "У этого выпуска нет готового файла транскрипта в RSS. При импорте аудиофайл будет автоматически распознан через встроенный Whisper (STT) для создания интерактивного урока с таймкодами.")}
              </span>
            </div>
          )}
          {episode.description && (
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {episode.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

interface PodcastChannelViewProps {
  podcast: PodcastSubscription | PodcastSearchResult;
  lessons?: Lesson[];
  history?: HistoryEntry[];
  selectedTargetLanguage?: string;
  onBack: () => void;
  onOpenLesson?: (lessonId: string) => void;
  onToggleCompleteLesson?: (lessonId: string) => void;
}

export default function PodcastChannelView({
  podcast, lessons = [], history = [], selectedTargetLanguage, onBack, onOpenLesson, onToggleCompleteLesson,
}: PodcastChannelViewProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const isSearchResult = "collectionId" in podcast;
  const feedUrl = podcast.feedUrl;
  const title = podcast.title;
  const artworkUrl = isSearchResult
    ? (podcast as PodcastSearchResult).artworkUrl600
    : (podcast as PodcastSubscription).artworkUrl;
  const author = isSearchResult
    ? (podcast as PodcastSearchResult).artistName
    : (podcast as PodcastSubscription).author;

  const {
    subscriptions, currentFeedMeta, currentFeedEpisodes,
    isFeedLoading, isSubscribing,
    fetchFeed, subscribe, unsubscribe,
    importEpisode, importingEpisodes, importingStages, importedEpisodes,
  } = usePodcastStore();

  const { setQueue } = usePlaylistStore();

  // Control bar states: Search, Duration/Date Sorting, Status Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "shortest" | "longest">("newest");
  const [filterStatus, setFilterStatus] = useState<"all" | "in_progress" | "completed" | "unheard">("all");

  const isSubscribed = subscriptions.some(s => s.feedUrl === feedUrl);
  const subscriptionId = subscriptions.find(s => s.feedUrl === feedUrl)?.id;

  // Load feed on mount
  useEffect(() => {
    if (feedUrl) fetchFeed(feedUrl);
  }, [feedUrl, fetchFeed]);

  // Client-side filtering & sorting via useMemo
  const filteredEpisodes = useMemo(() => {
    let list = [...currentFeedEpisodes];

    // 1. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(ep =>
        (ep.title && ep.title.toLowerCase().includes(q)) ||
        (ep.description && ep.description.toLowerCase().includes(q))
      );
    }

    // 2. Status Filter: all | in_progress | completed | unheard
    if (filterStatus === "in_progress") {
      list = list.filter(ep => {
        const info = getEpisodeLessonInfo(ep, lessons, history, importedEpisodes);
        return info.status === "in_progress";
      });
    } else if (filterStatus === "completed") {
      list = list.filter(ep => {
        const info = getEpisodeLessonInfo(ep, lessons, history, importedEpisodes);
        return info.status === "completed";
      });
    } else if (filterStatus === "unheard") {
      list = list.filter(ep => {
        const info = getEpisodeLessonInfo(ep, lessons, history, importedEpisodes);
        return info.status === "not_in_library";
      });
    }

    // 3. Sorting (Date or Duration)
    list.sort((a, b) => {
      if (sortBy === "shortest") {
        return parseDurationToSeconds(a.duration) - parseDurationToSeconds(b.duration);
      }
      if (sortBy === "longest") {
        return parseDurationToSeconds(b.duration) - parseDurationToSeconds(a.duration);
      }
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      if (sortBy === "oldest") {
        return dateA - dateB;
      }
      return dateB - dateA;
    });

    return list;
  }, [currentFeedEpisodes, searchQuery, filterStatus, sortBy, lessons, history, importedEpisodes]);

  const handleSubscribeToggle = useCallback(async () => {
    if (isSubscribed && subscriptionId) {
      await unsubscribe(subscriptionId);
      showToast(t("podcasts.unsubscribed", "Unsubscribed"), "info");
    } else {
      const result = await subscribe(podcast);
      if (result) showToast(t("podcasts.subscribed", "Subscribed!"), "success");
    }
  }, [isSubscribed, subscriptionId, subscribe, unsubscribe, podcast, showToast, t]);

  const handlePlay = useCallback((episode: PodcastEpisode) => {
    // Strictly use the square show/episode artwork for MediaSession and Android lock screen
    const squareArtwork = episode.artworkUrl || artworkUrl || currentFeedMeta?.artworkUrl || "";
    const activeLang = normalizeLanguage((selectedTargetLanguage && selectedTargetLanguage !== "All")
      ? selectedTargetLanguage
      : currentFeedMeta?.language || "es");
    setQueue(
      [{
        id: episode.guid,
        guid: episode.guid,
        title: episode.title,
        audioUrl: episode.audioUrl,
        bookTitle: title,
        podcastTitle: title,
        coverUrl: squareArtwork,
        duration: episode.duration || undefined,
        lessonType: "podcast",
        channelName: author || title,
        description: episode.description,
        pubDate: episode.pubDate,
        transcriptUrl: episode.transcriptUrl,
        hasTranscript: episode.hasTranscript,
        targetLanguage: activeLang,
      }],
      0,
      true
    );
  }, [setQueue, title, artworkUrl, currentFeedMeta, author, selectedTargetLanguage]);

  // Integrated Whisper import with Background Job and Toast Action
  const handleImport = useCallback(async (episode: PodcastEpisode) => {
    const activeLang = normalizeLanguage((selectedTargetLanguage && selectedTargetLanguage !== "All")
      ? selectedTargetLanguage
      : (currentFeedMeta?.language || "es"));

    const isWhisperNeeded = !episode.hasTranscript && !episode.transcriptUrl;
    const taskId = `podcast_task_${episode.guid}_${Date.now()}`;

    // 1. Register Background Task in Whisper Notification Manager
    whisperQueueService.registerCustomTask({
      id: taskId,
      title: `${t("podcasts.transcribing_prefix", "Транскрибация:")} ${episode.title}`,
      sourceType: "podcast",
      status: "transcribing",
      thumbnail: episode.artworkUrl || artworkUrl,
      channelName: title || author,
      stageText: isWhisperNeeded
        ? t("podcasts.stage_transcribing_whisper", "Распознавание речи через Whisper...")
        : t("podcasts.stage_importing", "Скачивание и обработка эпизода..."),
    });

    showToast(
      isWhisperNeeded
        ? t("podcasts.import_whisper_started", "Скачивание и распознавание через Whisper...")
        : t("podcasts.import_in_progress", "Импорт выпуска..."),
      "info"
    );

    try {
      const lessonId = await importEpisode(episode, title, activeLang, artworkUrl, activeLang, taskId);
      if (lessonId) {
        // 2. Complete Background Task
        whisperQueueService.completeCustomTask(taskId, lessonId);

        // 3. Show Success Toast with interactive "Open" button
        showToast(
          t("podcasts.episode_imported_toast", 'Эпизод "{{title}}" успешно добавлен в библиотеку', { title: episode.title }),
          "success",
          6000,
          onOpenLesson ? {
            label: t("podcasts.open_lesson", "Открыть"),
            onClick: () => onOpenLesson(lessonId),
          } : undefined
        );
      } else {
        throw new Error(t("podcasts.import_error", "Failed to import episode"));
      }
    } catch (err: any) {
      const errorMsg = err?.message || t("podcasts.import_error", "Failed to import episode");
      whisperQueueService.failCustomTask(taskId, errorMsg);
      showToast(
        t("podcasts.episode_import_failed_toast", 'Ошибка при добавлении выпуска "{{title}}": {{error}}', { title: episode.title, error: errorMsg }),
        "error",
        5000
      );
    }
  }, [importEpisode, title, artworkUrl, author, currentFeedMeta, selectedTargetLanguage, showToast, t, onOpenLesson]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 truncate flex-1">
          {t("podcasts.episodes", "Episodes")}
        </h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Channel hero */}
        <div className="flex items-start gap-4 p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt={title}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-md shrink-0 bg-zinc-100 dark:bg-zinc-800"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
              <Rss className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="font-black text-base sm:text-lg text-zinc-900 dark:text-white leading-snug">
              {title}
            </h1>
            {author && (
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">{author}</p>
            )}
            {currentFeedMeta?.description && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                {currentFeedMeta.description}
              </p>
            )}

            <button
              onClick={handleSubscribeToggle}
              disabled={isSubscribing}
              className={`mt-2.5 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs active:scale-95 ${
                isSubscribed
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-zinc-200 dark:border-zinc-700"
                  : "bg-teal-600 hover:bg-teal-700 text-white"
              }`}
            >
              {isSubscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isSubscribed ? (
                <BellOff className="w-3.5 h-3.5" />
              ) : (
                <Bell className="w-3.5 h-3.5" />
              )}
              {isSubscribed
                ? t("podcasts.unsubscribe", "Unsubscribe")
                : t("podcasts.subscribe", "Subscribe")}
            </button>
          </div>
        </div>

        {/* Control Bar: Search + Duration Sorting + Dynamic Status Filter Chips */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3 bg-white dark:bg-zinc-950">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("podcasts.search_episodes_placeholder", "Поиск по выпускам…")}
                className="w-full pl-9 pr-8 py-2 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown: Newest / Oldest / Shortest / Longest */}
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              <span className="text-[11px] font-bold text-zinc-400 hidden sm:inline">
                {t("podcasts.sort", "Сортировка")}:
              </span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "shortest" | "longest")}
                  className="appearance-none bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-3xs"
                >
                  <option value="newest">{t("podcasts.sort_newest", "Сначала новые")}</option>
                  <option value="oldest">{t("podcasts.sort_oldest", "Сначала старые")}</option>
                  <option value="shortest">{t("podcasts.sort_shortest", "Сначала короткие")}</option>
                  <option value="longest">{t("podcasts.sort_longest", "Сначала длинные")}</option>
                </select>
                <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Dynamic Status Filter Chips: All | In Progress | Completed | Unheard / New */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full scroll-smooth">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs shrink-0 whitespace-nowrap ${
                filterStatus === "all"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800/70 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80"
              }`}
            >
              {t("podcasts.filter_all", "Все")} ({currentFeedEpisodes.length})
            </button>

            <button
              onClick={() => setFilterStatus("in_progress")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs flex items-center gap-1 shrink-0 whitespace-nowrap ${
                filterStatus === "in_progress"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800/70 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80"
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{t("podcasts.filter_in_progress", "В процессе")}</span>
            </button>

            <button
              onClick={() => setFilterStatus("completed")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs flex items-center gap-1 shrink-0 whitespace-nowrap ${
                filterStatus === "completed"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80"
              }`}
            >
              <Check className="w-3 h-3" />
              <span>{t("podcasts.filter_completed", "Завершено")}</span>
            </button>

            <button
              onClick={() => setFilterStatus("unheard")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs shrink-0 whitespace-nowrap ${
                filterStatus === "unheard"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800/70 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80"
              }`}
            >
              {t("podcasts.filter_unheard", "Новые")}
            </button>
          </div>
        </div>

        {/* Episodes List */}
        <div className="p-4">
          {isFeedLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
              <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
              <p className="text-sm">{t("podcasts.loading_feed", "Loading episodes…")}</p>
            </div>
          ) : currentFeedEpisodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
              <AlertCircle className="w-7 h-7" />
              <p className="text-sm">{t("podcasts.no_episodes", "No episodes found")}</p>
              <button
                onClick={() => fetchFeed(feedUrl)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("podcasts.retry", "Try again")}
              </button>
            </div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
              <Filter className="w-7 h-7 opacity-30" />
              <p className="text-sm font-semibold">{t("podcasts.no_matching_episodes", "Нет выпусков, соответствующих фильтрам")}</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="px-3 py-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl transition-colors cursor-pointer"
              >
                {t("podcasts.reset_filters", "Сбросить фильтры")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                <span>
                  {t("podcasts.episodes_count", "{{count}} episodes", { count: filteredEpisodes.length })}
                </span>
                {filteredEpisodes.length !== currentFeedEpisodes.length && (
                  <span className="text-[10px] lowercase text-zinc-400">
                    ({t("podcasts.total_count", "из {{total}}", { total: currentFeedEpisodes.length })})
                  </span>
                )}
              </div>

              {filteredEpisodes.map(episode => {
                const lessonInfo = getEpisodeLessonInfo(episode, lessons, history, importedEpisodes);
                return (
                  <EpisodeRow
                    key={episode.guid}
                    episode={episode}
                    podcastTitle={title}
                    artworkUrl={artworkUrl}
                    language={currentFeedMeta?.language || "es"}
                    lessonInfo={lessonInfo}
                    isImporting={Boolean(importingEpisodes[episode.guid])}
                    importStage={importingStages[episode.guid]}
                    onPlay={handlePlay}
                    onImport={handleImport}
                    onOpenLesson={onOpenLesson}
                    onToggleCompleteLesson={onToggleCompleteLesson}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
