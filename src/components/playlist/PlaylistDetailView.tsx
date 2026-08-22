import React, { useState, useMemo } from "react";
import { Playlist, PlaylistItem, Lesson, ReaderSettings, HistoryEntry, VocabItem } from "../../types";
import {
  ArrowLeft, Play, BookOpen, Headphones, Trash2, CheckCircle2,
  Clock, ExternalLink, Loader2, Sparkles, AlertCircle, Share2,
  ListVideo, RefreshCw, Archive, ArchiveRestore, ArrowUpDown, Search, ChevronDown, Plus, CheckSquare, Square, Check
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { resolveApiUrl } from "../../utils/apiConfig";
import { renderCircularFlag, getLanguageFlagEmoji } from "./PlaylistCard";
import { getLocalizedLanguageName } from "../../utils/stringUtils";
import { usePlaylistStore } from "../../store/playlistStore";
import { lessonsStore } from "../../db";
import { calculateBookStats, getCachedBookStats } from "../LibraryHome";
import AddMediaToPlaylistModal from "./AddMediaToPlaylistModal";

export type PlaylistSortOption = 
  | 'default'       // Исходный порядок плейлиста (по порядку добавления / #1, #2...)
  | 'duration_asc'  // По длительности: сначала короткие
  | 'duration_desc' // По длительности: сначала длинные
  | 'title_asc'     // По названию: А - Я (A - Z)
  | 'title_desc'    // По названию: Я - А (Z - A)
  | 'status';       // По статусу: сначала In Progress / New, потом Completed

export type PlaylistStatusFilter = 'all' | 'new' | 'in_progress' | 'completed';

interface PlaylistDetailViewProps {
  playlist: Playlist;
  lessons: Lesson[];
  history?: HistoryEntry[];
  vocab?: Record<string, any>;
  wordLinks?: Record<string, string>;
  onBack: () => void;
  onOpenLesson?: (lessonId: string) => void;
  onSelectLesson?: (lessonId: string) => void;
  onPlayQueue?: (items: any[], startIndex?: number) => void;
  onUpdatePlaylist: (updated: Playlist) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onToggleArchive?: (playlistId: string) => void;
  onAddOrUpdateLesson?: (lesson: Lesson) => void;
  onAddLessonToLibrary?: (lesson: Lesson) => void;
  languageFlags?: Record<string, string>;
  settings?: ReaderSettings;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatTotalDuration(seconds: number, t: any): string {
  if (seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h} ${t("common.hours_short", "h")} ${m} ${t("common.minutes_short", "m")}`;
  }
  return `${m} ${t("common.minutes_short", "m")}`;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlist,
  lessons,
  history = [],
  vocab = {},
  wordLinks = {},
  onBack,
  onOpenLesson,
  onSelectLesson,
  onPlayQueue,
  onUpdatePlaylist,
  onDeletePlaylist,
  onToggleArchive,
  onAddOrUpdateLesson,
  onAddLessonToLibrary,
  languageFlags = {},
  settings,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [newVideosFound, setNewVideosFound] = useState<PlaylistItem[] | null>(null);
  const [selectedNewVideoIds, setSelectedNewVideoIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<PlaylistSortOption>("default");
  const [statusFilter, setStatusFilter] = useState<PlaylistStatusFilter>("all");
  const [filterQuery, setFilterQuery] = useState("");
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const items = playlist.items || [];
  const totalSeconds = items.reduce((acc, item) => acc + (item.durationSeconds || 0), 0);
  const localizedLang = getLocalizedLanguageName(playlist.language, i18n.language);
  const flag = getLanguageFlagEmoji(playlist.language, languageFlags);

  // Find associated lessons in the user library for each playlist item
  const getItemLesson = (item: PlaylistItem): Lesson | undefined => {
    if (item.lessonId) {
      const match = lessons.find((l) => l.id === item.lessonId);
      if (match) return match;
    }
    if (item.videoId) {
      const match = lessons.find((l) => l.youtubeId === item.videoId);
      if (match) return match;
    }
    return undefined;
  };

  // Check completion status from history
  const isItemCompleted = (item: PlaylistItem): boolean => {
    const lesson = getItemLesson(item);
    if (!lesson) return false;
    return history.some((h) => h.lessonId === lesson.id && (h.status === "completed" || h.actionType === "complete" || h.progressPercent === 100));
  };

  // Get item status (completed | in_progress | new)
  const getItemStatus = (item: PlaylistItem): "completed" | "in_progress" | "new" => {
    if (isItemCompleted(item)) return "completed";
    const lesson = getItemLesson(item);
    let videoProgressSec = 0;
    if (lesson) {
      const storedYtProg = localStorage.getItem(`youtube_progress_${lesson.id}`);
      if (storedYtProg) {
        videoProgressSec = parseFloat(storedYtProg) || 0;
      }
    }
    const durationSec = item.durationSeconds || lesson?.youtubeDuration || 0;
    let progressPercent = 0;
    if (durationSec > 0 && videoProgressSec > 0) {
      progressPercent = Math.min(100, Math.round((videoProgressSec / durationSec) * 100));
    }
    if (progressPercent > 2 || history.some((h) => h.lessonId === lesson?.id)) {
      return "in_progress";
    }
    return "new";
  };

  // Calculate counts per status
  const statusCounts = useMemo(() => {
    let newCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;

    items.forEach((it) => {
      const status = getItemStatus(it);
      if (status === "completed") completedCount++;
      else if (status === "in_progress") inProgressCount++;
      else newCount++;
    });

    return {
      all: items.length,
      new: newCount,
      in_progress: inProgressCount,
      completed: completedCount,
    };
  }, [items, lessons, history]);

  // Pending items without loaded subtitles
  const pendingItems = useMemo(() => {
    return items.filter((item) => {
      const lesson = getItemLesson(item);
      const hasSubtitles = item.transcriptLoaded || (lesson && lesson.text && lesson.text.length > 50 && !lesson.text.includes("Субтитры отсутствуют"));
      return !hasSubtitles && !!item.videoId;
    });
  }, [items, lessons]);

  // Compute sorted and filtered list of episodes
  const sortedAndFilteredItems = useMemo(() => {
    let result = [...items];

    // 1. Text filter
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim();
      result = result.filter((it) => it.title.toLowerCase().includes(q));
    }

    // 2. Status filter
    if (statusFilter !== "all") {
      result = result.filter((it) => getItemStatus(it) === statusFilter);
    }

    // 3. Sorting
    if (sortOption === "duration_asc") {
      result.sort((a, b) => (a.durationSeconds || 0) - (b.durationSeconds || 0));
    } else if (sortOption === "duration_desc") {
      result.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
    } else if (sortOption === "title_asc") {
      result.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    } else if (sortOption === "title_desc") {
      result.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
    } else if (sortOption === "status") {
      result.sort((a, b) => {
        const aCompleted = isItemCompleted(a) ? 1 : 0;
        const bCompleted = isItemCompleted(b) ? 1 : 0;
        if (aCompleted !== bCompleted) {
          return aCompleted - bCompleted; // Uncompleted (0) first, Completed (1) last
        }
        return 0;
      });
    }

    return result;
  }, [items, sortOption, filterQuery, statusFilter, lessons, history]);

  // Helper to open lesson
  const openLessonSafe = (lessonId: string) => {
    if (typeof onOpenLesson === "function") {
      onOpenLesson(lessonId);
    } else if (typeof onSelectLesson === "function") {
      onSelectLesson(lessonId);
    }
  };

  // Helper to add or update lesson safely
  const addOrUpdateLessonSafe = async (lesson: Lesson) => {
    if (typeof onAddOrUpdateLesson === "function") {
      await onAddOrUpdateLesson(lesson);
    } else if (typeof onAddLessonToLibrary === "function") {
      await onAddLessonToLibrary(lesson);
    } else {
      try {
        const cached = (await lessonsStore.getItem<Lesson[]>("lessons")) || [];
        const exists = cached.some((l) => l.id === lesson.id);
        const nextList = exists
          ? cached.map((l) => (l.id === lesson.id ? { ...l, ...lesson } : l))
          : [lesson, ...cached];
        await lessonsStore.setItem("lessons", nextList);
      } catch (e) {
        console.error("Direct fallback to lessonsStore failed:", e);
      }
    }
  };

  // Dedicated single-item subtitle fetcher
  const loadSubtitlesForItem = async (item: PlaylistItem): Promise<string | null> => {
    let existingLesson = getItemLesson(item);

    if (existingLesson && existingLesson.text && existingLesson.text.trim().length > 0 && !existingLesson.text.includes("Субтитры отсутствуют")) {
      return existingLesson.id;
    }

    if (!item.videoId) return null;

    const videoUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
    const apiUrl = resolveApiUrl("/api/youtube-subtitles");
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: videoUrl,
        targetLanguage: playlist.language || "English",
        uiLang: i18n.language,
      }),
    });

    const data = await res.json();
    if (!res.ok && !data.text) {
      throw new Error(data.error || `Failed to fetch YouTube subtitles for ${item.title}`);
    }

    const lessonId = existingLesson ? existingLesson.id : `yt_${item.videoId}_${Date.now()}`;
    const newLesson: Lesson = {
      id: lessonId,
      title: item.title || data.title || "YouTube Video",
      text: data.text || item.title,
      coverUrl: item.thumbnailUrl || data.coverUrl || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
      youtubeId: item.videoId,
      youtubeDuration: item.durationSeconds || data.youtubeDuration || null,
      targetLanguage: playlist.language || "english",
      translationLanguage: "russian",
      lessonType: "youtube",
      playlistId: playlist.id,
      createdAt: Date.now(),
      channelName: playlist.channelTitle || data.channelName || null,
      channelAvatarUrl: data.channelAvatarUrl || null,
    };

    await addOrUpdateLessonSafe(newLesson);
    return lessonId;
  };

  // Mass sequential subtitle downloading
  const handleDownloadAllSubtitles = async () => {
    if (pendingItems.length === 0 || isBulkDownloading) return;

    setIsBulkDownloading(true);
    setBulkProgress({ current: 0, total: pendingItems.length });

    let currentPlaylistItems = [...playlist.items];
    let successfulCount = 0;

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      setBulkProgress({ current: i + 1, total: pendingItems.length });

      try {
        const lessonId = await loadSubtitlesForItem(item);
        if (lessonId) {
          successfulCount++;
          currentPlaylistItems = currentPlaylistItems.map((it) =>
            it.id === item.id ? { ...it, lessonId, transcriptLoaded: true } : it
          );
          onUpdatePlaylist({
            ...playlist,
            items: currentPlaylistItems,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`Failed to load subtitles for video ${item.videoId}:`, err);
      }
    }

    setIsBulkDownloading(false);
    if (successfulCount > 0) {
      showToast(
        t("playlist.bulk_download_done", "Successfully downloaded subtitles for {{count}} videos!", { count: successfulCount }),
        "success"
      );
    } else {
      showToast(t("playlist.bulk_download_none", "No new subtitles could be downloaded."), "warning");
    }
  };

  // Check for newly released videos on YouTube
  const handleCheckPlaylistUpdates = async () => {
    if (!playlist.externalUrl && playlist.sourceType !== "youtube_playlist") {
      showToast(t("playlist.sync_not_supported", "Sync is only available for YouTube playlists"), "warning");
      return;
    }

    setIsCheckingUpdates(true);
    try {
      showToast(t("playlist.sync_checking", "Checking YouTube for new videos..."), "info");
      const apiUrl = resolveApiUrl("/api/youtube-playlist");
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: playlist.externalUrl || `https://www.youtube.com/playlist?list=${playlist.id}`,
          targetLanguage: playlist.language || "english",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch playlist updates");
      }

      const fetchedItems: PlaylistItem[] = data.items || [];
      const existingVideoIds = new Set(
        (playlist.items || [])
          .map((it) => it.videoId)
          .filter(Boolean)
      );

      const newItems = fetchedItems.filter(
        (it) => it.videoId && !existingVideoIds.has(it.videoId)
      );

      if (newItems.length === 0) {
        showToast(t("playlist.sync_up_to_date", "✓ Playlist is up to date (no new videos found)"), "success");
      } else {
        setNewVideosFound(newItems);
        setSelectedNewVideoIds(new Set(newItems.map((it) => it.id)));
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      showToast(err.message || t("playlist.sync_error", "Failed to check for updates"), "error");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  // Confirm adding newly discovered videos from sync
  const handleConfirmAddNewVideos = () => {
    if (!newVideosFound) return;
    const selectedToAdd = newVideosFound.filter((it) => selectedNewVideoIds.has(it.id));
    if (selectedToAdd.length === 0) {
      setNewVideosFound(null);
      return;
    }

    const updatedItems = [...(playlist.items || []), ...selectedToAdd];
    onUpdatePlaylist({
      ...playlist,
      items: updatedItems,
      itemCount: updatedItems.length,
      updatedAt: new Date().toISOString(),
    });

    showToast(
      t("playlist.sync_added_count", "Added {{count}} new videos to playlist!", {
        count: selectedToAdd.length,
      }),
      "success"
    );
    setNewVideosFound(null);
  };

  // Open item in interactive reader / player, lazy loading subtitles if needed
  const handleOpenItem = async (item: PlaylistItem) => {
    setLoadingItemId(item.id);
    try {
      let existingLesson = getItemLesson(item);

      if (existingLesson && existingLesson.text && existingLesson.text.trim().length > 0 && !existingLesson.text.includes("Субтитры отсутствуют")) {
        openLessonSafe(existingLesson.id);
        return;
      }

      // If YouTube video, lazily fetch subtitles via API
      if (item.videoId) {
        showToast(t("playlist.loading_subtitles", "Fetching subtitles for video..."), "info");
        const lessonId = await loadSubtitlesForItem(item);
        if (lessonId) {
          const updatedItems = items.map((it) =>
            it.id === item.id ? { ...it, lessonId, transcriptLoaded: true } : it
          );
          onUpdatePlaylist({
            ...playlist,
            items: updatedItems,
            updatedAt: new Date().toISOString(),
          });
          openLessonSafe(lessonId);
          showToast(t("playlist.subtitles_ready", "Video lesson ready!"), "success");
        } else {
          showToast(t("playlist.no_content", "Material text not available"), "error");
        }
      } else if (existingLesson) {
        openLessonSafe(existingLesson.id);
      } else {
        showToast(t("playlist.no_content", "Material text not available"), "error");
      }
    } catch (err: any) {
      console.error("Error opening playlist item:", err);
      showToast(err.message || t("playlist.error_opening", "Failed to open video"), "error");
    } finally {
      setLoadingItemId(null);
    }
  };

  // Play All: Starts audio queue from first uncompleted track
  const handlePlayAll = () => {
    if (items.length === 0) {
      showToast(t("playlist.empty_playlist", "This playlist is empty"), "warning");
      return;
    }

    const queueCandidates = items.map((it) => {
      const lesson = getItemLesson(it);
      return {
        id: lesson ? lesson.id : `yt_temp_${it.videoId || it.id}`,
        title: it.title,
        bookTitle: playlist.title,
        audioUrl: lesson?.audioUrl || "",
        youtubeId: it.videoId || lesson?.youtubeId || null,
        duration: it.durationSeconds || lesson?.youtubeDuration || undefined,
        coverUrl: it.thumbnailUrl || playlist.thumbnailUrl,
        targetLanguage: playlist.language,
        lessonType: "youtube",
        channelName: playlist.channelTitle,
      };
    });

    // Find first uncompleted index
    let startIndex = 0;
    const firstUnwatched = items.findIndex((it) => !isItemCompleted(it));
    if (firstUnwatched !== -1) {
      startIndex = firstUnwatched;
    }

    if (typeof onPlayQueue === "function") {
      onPlayQueue(queueCandidates, startIndex);
    } else {
      usePlaylistStore.getState().setQueue(queueCandidates, startIndex, true);
    }
    showToast(t("player.started_playlist", "Playing {{count}} tracks in queue", { count: items.length }), "success");
  };

  // Remove individual episode from playlist
  const handleRemoveEpisode = (itemId: string) => {
    const updatedItems = items.filter((it) => it.id !== itemId);
    onUpdatePlaylist({
      ...playlist,
      items: updatedItems,
      itemCount: updatedItems.length,
      updatedAt: new Date().toISOString(),
    });
    showToast(t("playlist.episode_removed", "Video removed from playlist"), "success");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-3xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("common.back_to_library", "Back to Library")}</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Check updates / Sync button for YouTube playlists */}
          {(playlist.sourceType === "youtube_playlist" || playlist.externalUrl) && (
            <button
              type="button"
              disabled={isCheckingUpdates}
              onClick={handleCheckPlaylistUpdates}
              className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-colors cursor-pointer border border-zinc-200/80 dark:border-zinc-700/80 disabled:opacity-60"
              title={t("playlist.sync_btn_tooltip", "Check YouTube for new videos")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? "animate-spin text-teal-600 dark:text-teal-400" : ""}`} />
              <span className="hidden sm:inline">{isCheckingUpdates ? t("playlist.sync_checking_btn", "Checking...") : t("playlist.sync_btn", "Sync")}</span>
            </button>
          )}

          {/* Archive / Unarchive Action */}
          <button
            type="button"
            onClick={() => {
              onToggleArchive?.(playlist.id);
              showToast(
                playlist.isArchived
                  ? t("library.unarchived_toast", "Restored from archive")
                  : t("library.archived_toast", "Moved to archive"),
                "info"
              );
            }}
            className={`inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer border ${
              playlist.isArchived
                ? "bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-700/80"
            }`}
            title={playlist.isArchived ? t("common.unarchive", "Unarchive") : t("common.archive", "Archive")}
          >
            {playlist.isArchived ? (
              <>
                <ArchiveRestore className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.unarchive", "Unarchive")}</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.archive", "Archive")}</span>
              </>
            )}
          </button>

          {playlist.externalUrl && (
            <a
              href={playlist.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title={t("playlist.open_youtube", "Open on YouTube")}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-2 text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
            title={t("playlist.delete", "Delete playlist")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-zinc-900 dark:text-zinc-100">
                  {t("playlist.delete_title", "Delete Playlist?")}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("playlist.delete_subtitle", "This will remove the playlist container from your library.")}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onDeletePlaylist(playlist.id);
                  setShowDeleteModal(false);
                  onBack();
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
              >
                {t("library.confirm_delete", "Yes, delete")}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                {t("library.cancel", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Videos Found (Diff Checker Sync) Modal */}
      {newVideosFound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-2xl">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                    {t("playlist.sync_modal_title", "New Videos Found")} ({newVideosFound.length})
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("playlist.sync_modal_subtitle", "The following new videos were found in this YouTube playlist:")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewVideosFound(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Select All / Deselect All */}
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400 px-1">
              <span>{t("playlist.selected_count", "Selected: {{count}} / {{total}}", { count: selectedNewVideoIds.size, total: newVideosFound.length })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedNewVideoIds(new Set(newVideosFound.map((v) => v.id)))}
                  className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  {t("common.select_all", "Select all")}
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSelectedNewVideoIds(new Set())}
                  className="text-zinc-500 hover:underline cursor-pointer"
                >
                  {t("common.deselect_all", "Deselect all")}
                </button>
              </div>
            </div>

            {/* Video List */}
            <div className="overflow-y-auto space-y-2 flex-1 pr-1 max-h-[50vh]">
              {newVideosFound.map((item) => {
                const isSelected = selectedNewVideoIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedNewVideoIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                      isSelected
                        ? "bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 shadow-xs"
                        : "bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 border-zinc-200/60 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-16 aspect-video rounded-lg overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800 relative">
                        <img
                          src={item.thumbnailUrl || ""}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        {item.durationSeconds ? (
                          <div className="absolute bottom-1 right-1 px-1 py-0.2 text-[9px] font-mono font-bold bg-black/80 text-white rounded">
                            {formatDuration(item.durationSeconds)}
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.title}
                        </h4>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 ${
                        isSelected
                          ? "bg-teal-600 text-white"
                          : "border border-zinc-300 dark:border-zinc-700 text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setNewVideosFound(null)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                disabled={selectedNewVideoIds.size === 0}
                onClick={handleConfirmAddNewVideos}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-teal-600/20"
              >
                {t("playlist.sync_add_btn", "Add to Playlist ({{count}})", { count: selectedNewVideoIds.size })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Media / Video to Playlist Modal */}
      {showAddMediaModal && (
        <AddMediaToPlaylistModal
          isOpen={showAddMediaModal}
          onClose={() => setShowAddMediaModal(false)}
          playlist={playlist}
          lessons={lessons}
          onUpdatePlaylist={onUpdatePlaylist}
          onAddOrUpdateLesson={onAddOrUpdateLesson}
        />
      )}

      {/* 2-Column YouTube Layout */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        
        {/* Left Column (Sticky Sidebar Header - YouTube Proportional Width) */}
        <div className="w-full lg:w-[350px] xl:w-[380px] shrink-0 lg:sticky lg:top-20 space-y-4">
          <div className="bg-gradient-to-b from-zinc-100/90 via-zinc-100/50 to-zinc-50 dark:from-zinc-800/90 dark:via-zinc-900/80 dark:to-zinc-950 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-5 space-y-4 shadow-sm backdrop-blur-sm">
            {/* Big Playlist Cover Art (Full Width 16:9 Aspect Ratio) */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-zinc-950 shadow-md border border-zinc-800/80 group">
              {playlist.thumbnailUrl ? (
                <img
                  src={playlist.thumbnailUrl}
                  alt={playlist.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.includes("/maxresdefault.jpg")) {
                      target.src = target.src.replace("/maxresdefault.jpg", "/hqdefault.jpg");
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-800 to-indigo-900">
                  <ListVideo className="w-14 h-14 text-white/40" />
                </div>
              )}

              {/* Bottom right track count badge */}
              <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-black/80 backdrop-blur-md rounded-lg text-white font-mono text-xs font-bold flex items-center gap-1.5 border border-white/10 shadow-sm">
                <ListVideo className="w-3.5 h-3.5" />
                <span>{items.length}</span>
              </div>
            </div>

            {/* Title & Channel Details */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-zinc-200/80 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full text-zinc-800 dark:text-zinc-200">
                  {renderCircularFlag(flag)}
                  <span>{localizedLang}</span>
                </span>
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                  {playlist.sourceType === "youtube_playlist" ? "YouTube Playlist" : t("playlist.custom", "Collection")}
                </span>
                {playlist.isArchived && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 rounded-md border border-amber-300 dark:border-amber-800">
                    {t("common.archived", "Archived")}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white leading-tight tracking-tight">
                {playlist.title}
              </h1>

              {playlist.channelTitle && (
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {playlist.channelTitle}
                </p>
              )}

              {/* Aggregate Meta Stats */}
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal flex items-center gap-2">
                <span>{items.length} {t("playlist.videos_count", "videos")}</span>
                {totalSeconds > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatTotalDuration(totalSeconds, t)}</span>
                  </>
                )}
              </div>

              {/* Total Playlist Completion Progress */}
              {items.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    <span>{t("playlist.progress_label", "Progress")}</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">
                      {statusCounts.completed} / {items.length} {t("playlist.completed_short", "completed")} ({items.length > 0 ? Math.round((statusCounts.completed / items.length) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200/80 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${items.length > 0 ? Math.round((statusCounts.completed / items.length) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {playlist.description && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed pt-1">
                  {playlist.description}
                </p>
              )}
            </div>

            {/* Actions: ▶ Play All */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handlePlayAll}
                className="w-full py-3 px-5 bg-teal-600 hover:bg-teal-500 active:scale-98 text-white font-bold text-sm rounded-full flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-teal-600/20"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t("player.play_all", "Play All")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (Videos / Episodes List with Sorting & Search) */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header toolbar with counter, search input, and sort dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <span>{t("playlist.episodes_list", "Videos / Episodes")}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
                  {sortedAndFilteredItems.length}{filterQuery.trim() ? ` / ${items.length}` : ""}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Add video shortcut button */}
              <button
                type="button"
                onClick={() => setShowAddMediaModal(true)}
                className="w-9 h-9 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 transition-all cursor-pointer shrink-0"
                title={t("playlist.add_media_btn", "Add video / lesson")}
              >
                <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="hidden sm:inline">{t("playlist.add_btn_short", "Add")}</span>
              </button>
              {/* Bulk Subtitles Download Button */}
              {pendingItems.length > 0 ? (
                <button
                  type="button"
                  disabled={isBulkDownloading}
                  onClick={handleDownloadAllSubtitles}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs shrink-0 ${
                    isBulkDownloading
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse cursor-wait"
                      : "bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-300/60 dark:border-teal-700/60"
                  }`}
                  title={
                    isBulkDownloading
                      ? `${t("playlist.downloading_bulk", "Downloading subtitles")} (${bulkProgress.current}/${bulkProgress.total})`
                      : t("playlist.download_all_tooltip", "Download subtitles sequentially for all pending videos")
                  }
                >
                  {isBulkDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                      <span>
                        {t("playlist.bulk_progress", "Downloading: {{current}} / {{total}}...", {
                          current: bulkProgress.current,
                          total: bulkProgress.total,
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>
                        {t("playlist.download_all_btn", "Download All Subtitles ({{count}})", { count: pendingItems.length })}
                      </span>
                    </>
                  )}
                </button>
              ) : null}

              {/* Filter search input (flex-1 min-w-0 for mobile responsive scaling) */}
              <div className="relative flex-1 min-w-0 sm:w-48 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={t("playlist.filter_search_placeholder", "Filter videos...")}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                />
              </div>

              {/* Sort dropdown (compact icon button on mobile, full select on desktop) */}
              <div className="relative shrink-0">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as PlaylistSortOption)}
                  className="w-9 h-9 sm:w-auto appearance-none pl-2.5 pr-2.5 sm:pl-7 sm:pr-7 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-transparent sm:text-zinc-800 dark:sm:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 rounded-xl cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors"
                  title={t("playlist.sort_title", "Sort order")}
                >
                  <option value="default" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_default", "Default order")}</option>
                  <option value="duration_asc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_duration_asc", "Shortest first")}</option>
                  <option value="duration_desc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_duration_desc", "Longest first")}</option>
                  <option value="title_asc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_title_asc", "Title (A - Z)")}</option>
                  <option value="title_desc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_title_desc", "Title (Z - A)")}</option>
                  <option value="status" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_status", "Incomplete first")}</option>
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 absolute left-1/2 -translate-x-1/2 sm:left-2 sm:translate-x-0 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
                <ChevronDown className="hidden sm:block w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Status Filter Chips Row (Horizontal Scroll with touch smooth and w-full) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full scroll-smooth">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "all"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.all", "All")}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                statusFilter === "all"
                  ? "bg-white/20 text-white"
                  : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
              }`}>
                {statusCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("new")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "new"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.new", "New")}</span>
              {statusCounts.new > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  statusFilter === "new"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {statusCounts.new}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("in_progress")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "in_progress"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.in_progress", "In Progress")}</span>
              {statusCounts.in_progress > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  statusFilter === "in_progress"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {statusCounts.in_progress}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("completed")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "completed"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.completed", "Completed")}</span>
              {statusCounts.completed > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  statusFilter === "completed"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {statusCounts.completed}
                </span>
              )}
            </button>
          </div>

          {/* Episode Cards List */}
          {sortedAndFilteredItems.length === 0 ? (
            <div className="p-8 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 text-center space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {filterQuery.trim()
                  ? t("playlist.no_filter_matches", "No videos found matching your filter.")
                  : statusFilter !== "all"
                  ? t("playlist.no_status_matches", "No videos in this category.")
                  : t("playlist.empty_playlist", "This playlist is empty.")}
              </p>
              {(filterQuery.trim() || statusFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterQuery("");
                    setStatusFilter("all");
                  }}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  {t("playlist.clear_filter", "Clear filter")}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedAndFilteredItems.map((item) => {
                const originalIndex = items.findIndex((it) => it.id === item.id) + 1;
                const lesson = getItemLesson(item);
                const isCompleted = isItemCompleted(item);
                const isLoading = loadingItemId === item.id;
                const hasSubtitles = item.transcriptLoaded || (lesson && lesson.text && lesson.text.length > 50);

                // Calculate playback/reading progress
                let videoProgressSec = 0;
                if (lesson) {
                  const storedYtProg = localStorage.getItem(`youtube_progress_${lesson.id}`);
                  if (storedYtProg) {
                    videoProgressSec = parseFloat(storedYtProg) || 0;
                  }
                }
                const durationSec = item.durationSeconds || lesson?.youtubeDuration || 0;
                let progressPercent = 0;
                if (durationSec > 0 && videoProgressSec > 0) {
                  progressPercent = Math.min(100, Math.round((videoProgressSec / durationSec) * 100));
                }
                const isInProgress = !isCompleted && (progressPercent > 2 || history.some((h) => h.lessonId === lesson?.id));

                // Calculate word counts & comprehension stats
                const hasLessonText = !!(lesson && lesson.text && lesson.text.length > 20);
                const rawWordCount = hasLessonText ? lesson!.text.split(/\s+/).filter(Boolean).length : null;
                const formattedWordCount = rawWordCount !== null ? (rawWordCount >= 1000 ? `${(rawWordCount / 1000).toFixed(1).replace('.0', '')}k` : `${rawWordCount}`) : null;
                const bookStats = (hasLessonText && vocab && wordLinks) ? getCachedBookStats(lesson!, vocab, wordLinks) : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleOpenItem(item)}
                    className={`group p-2.5 sm:p-3 rounded-2xl border transition-all duration-150 flex items-center gap-3 cursor-pointer active:scale-[0.99] select-none ${
                      isCompleted
                        ? "bg-zinc-50/70 dark:bg-zinc-900/40 border-zinc-200/60 dark:border-zinc-800/60 opacity-85"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-md"
                    }`}
                  >
                    {/* Track Original Index number (Desktop only) */}
                    <span
                      title={`#${originalIndex}`}
                      className="w-5 text-center text-xs font-mono font-bold text-zinc-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0 hidden sm:inline-block"
                    >
                      #{originalIndex}
                    </span>

                    {/* Video Thumbnail (Fixed 24/28 width, compact aspect-video) */}
                    <div className="relative w-24 sm:w-28 h-[58px] sm:h-[68px] rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800">
                      <img
                        src={item.thumbnailUrl || (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : "")}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src.includes("/maxresdefault.jpg")) {
                            target.src = target.src.replace("/maxresdefault.jpg", "/hqdefault.jpg");
                          }
                        }}
                      />
                      {item.durationSeconds > 0 && (
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.2 bg-black/85 text-white font-mono text-[9px] font-bold rounded">
                          {formatDuration(item.durationSeconds)}
                        </span>
                      )}

                      {isCompleted && (
                        <div className="absolute inset-0 bg-teal-900/50 backdrop-blur-3xs flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-teal-300" />
                        </div>
                      )}

                      {/* In Progress Mini Progress Bar */}
                      {isInProgress && progressPercent > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 overflow-hidden">
                          <div style={{ width: `${progressPercent}%` }} className="h-full bg-teal-400 rounded-full transition-all" />
                        </div>
                      )}
                    </div>

                    {/* Right: Title & 1-row metadata */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-2 leading-snug">
                        {item.title}
                      </h3>

                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500 dark:text-zinc-400 leading-none">
                        {/* Status Badge: Completed vs In Progress vs New */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>{t("common.completed", "Completed")}</span>
                          </span>
                        ) : isInProgress ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800/80">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{t("common.in_progress", "In Progress")}{progressPercent > 0 ? ` (${progressPercent}%)` : ""}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50">
                            <span>{t("common.new", "New")}</span>
                          </span>
                        )}

                        {/* Difficulty Badge */}
                        {lesson?.difficulty && (
                          <span
                            className="text-[9.5px] font-black leading-none px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 shrink-0"
                            title={lesson.difficultyExplanation || `Difficulty: ${lesson.difficulty}`}
                          >
                            {lesson.difficulty}
                          </span>
                        )}

                        {/* Word count & comprehension */}
                        {hasLessonText ? (
                          <>
                            {formattedWordCount && (
                              <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400 font-medium">
                                <span>•</span>
                                <span>📚 {formattedWordCount} {t("library.words", "words")}</span>
                              </span>
                            )}

                            {bookStats && (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                <span>•</span>
                                <span>{bookStats.knownPct}% {t("library.understood_stat", "understood")}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-400 dark:text-zinc-500 font-medium text-[10.5px]">
                            <span>•</span>
                            <Sparkles className="w-2.5 h-2.5 text-teal-500/70" />
                            <span>{t("playlist.lazy_subs", "Subtitles on demand")}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Trailing Loader / Delete Button */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isLoading && (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400 mr-1" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveEpisode(item.id);
                        }}
                        title={t("playlist.remove_video", "Remove from playlist")}
                        className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaylistDetailView;
