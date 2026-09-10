import React, { useState, useMemo } from "react";
import { Playlist, PlaylistItem, Lesson } from "../../types";
import { X, Youtube, BookOpen, Plus, Search, Check, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { resolveApiUrl } from "../../utils/apiConfig";
import { getLessonEffectiveDuration } from "../../utils/durationUtils";

interface AddMediaToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist;
  lessons: Lesson[];
  onUpdatePlaylist: (updated: Playlist) => void;
  onAddOrUpdateLesson?: (lesson: Lesson) => void;
}

export const AddMediaToPlaylistModal: React.FC<AddMediaToPlaylistModalProps> = ({
  isOpen,
  onClose,
  playlist,
  lessons,
  onUpdatePlaylist,
  onAddOrUpdateLesson,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"youtube" | "library">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isLoadingYt, setIsLoadingYt] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

  const items = playlist.items || [];

  // Extract YouTube ID helper
  const extractYouTubeId = (url: string): string | null => {
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  // Add YouTube video to playlist
  const handleAddYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      showToast(t("import.err_invalid_url", "Please provide a valid YouTube video URL or ID"), "error");
      return;
    }

    const alreadyExists = items.some((it) => it.videoId === videoId);
    if (alreadyExists) {
      showToast(t("playlist.already_in_playlist", "This video is already in the playlist"), "warning");
      return;
    }

    setIsLoadingYt(true);
    try {
      // Attempt to fetch video info from subtitles endpoint
      const res = await fetch(resolveApiUrl("/api/youtube-subtitles"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          targetLanguage: playlist.language || "english",
          uiLang: i18n.language,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const title = data.title || `YouTube Video (${videoId})`;
      const durationSeconds = data.youtubeDuration || 0;
      const thumbnailUrl = data.coverUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const lessonId = `yt_${videoId}_${Date.now()}`;

      // Create new lesson if subtitle text was retrieved
      if (data.text && typeof onAddOrUpdateLesson === "function") {
        const newLesson: Lesson = {
          id: lessonId,
          title,
          text: data.text,
          coverUrl: thumbnailUrl,
          youtubeId: videoId,
          youtubeDuration: durationSeconds || null,
          targetLanguage: playlist.language || "english",
          translationLanguage: "russian",
          lessonType: "youtube",
          playlistId: playlist.id,
          createdAt: Date.now(),
          channelName: playlist.channelTitle || data.channelName || null,
          channelAvatarUrl: data.channelAvatarUrl || null,
        };
        onAddOrUpdateLesson(newLesson);
      }

      const newItem: PlaylistItem = {
        id: `item_${videoId}_${Date.now()}`,
        lessonId: data.text ? lessonId : undefined,
        videoId,
        title,
        durationSeconds,
        thumbnailUrl,
        transcriptLoaded: !!(data.text && data.text.length > 20),
      };

      const updatedItems = [...items, newItem];
      onUpdatePlaylist({
        ...playlist,
        items: updatedItems,
        itemCount: updatedItems.length,
        updatedAt: new Date().toISOString(),
      });

      showToast(t("playlist.added_to_playlist", "Added to playlist!"), "success");
      setYoutubeUrl("");
      onClose();
    } catch (err: any) {
      // Fallback: Add with basic YouTube metadata
      const newItem: PlaylistItem = {
        id: `item_${videoId}_${Date.now()}`,
        videoId,
        title: `YouTube Video (${videoId})`,
        durationSeconds: 0,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        transcriptLoaded: false,
      };

      const updatedItems = [...items, newItem];
      onUpdatePlaylist({
        ...playlist,
        items: updatedItems,
        itemCount: updatedItems.length,
        updatedAt: new Date().toISOString(),
      });

      showToast(t("playlist.added_to_playlist", "Added to playlist!"), "success");
      setYoutubeUrl("");
      onClose();
    } finally {
      setIsLoadingYt(false);
    }
  };

  // Toggle existing library lesson inclusion
  const handleToggleLibraryLesson = (lesson: Lesson) => {
    const isAlreadyIn = items.some(
      (it) => it.lessonId === lesson.id || (lesson.youtubeId && it.videoId === lesson.youtubeId)
    );

    let updatedItems: PlaylistItem[];
    if (isAlreadyIn) {
      updatedItems = items.filter(
        (it) => it.lessonId !== lesson.id && (!lesson.youtubeId || it.videoId !== lesson.youtubeId)
      );
      showToast(t("playlist.removed_from_playlist", "Removed from playlist"), "info");
    } else {
      const effectiveDuration = getLessonEffectiveDuration(lesson);
      const newItem: PlaylistItem = {
        id: `item_${lesson.id}_${Date.now()}`,
        lessonId: lesson.id,
        title: lesson.title,
        videoId: lesson.youtubeId || null,
        durationSeconds: effectiveDuration || lesson.youtubeDuration || 0,
        thumbnailUrl: lesson.coverUrl || (lesson.youtubeId ? `https://i.ytimg.com/vi/${lesson.youtubeId}/hqdefault.jpg` : ""),
        transcriptLoaded: !!(lesson.text && lesson.text.length > 20),
      };
      updatedItems = [...items, newItem];
      showToast(t("playlist.added_to_playlist", "Added to playlist!"), "success");
    }

    onUpdatePlaylist({
      ...playlist,
      items: updatedItems,
      itemCount: updatedItems.length,
      updatedAt: new Date().toISOString(),
    });

    if (typeof onAddOrUpdateLesson === "function") {
      onAddOrUpdateLesson({
        ...lesson,
        playlistId: isAlreadyIn ? undefined : playlist.id,
      });
    }
  };

  // Filter lessons from library
  const filteredLibraryLessons = useMemo(() => {
    let list = lessons;
    // Prefer matching language first
    if (playlist.language) {
      const plLang = playlist.language.toLowerCase();
      list = list.filter((l) => (l.targetLanguage || "").toLowerCase() === plLang || !l.targetLanguage);
    }
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase().trim();
      list = list.filter((l) => l.title.toLowerCase().includes(q));
    }
    return list;
  }, [lessons, playlist.language, librarySearch]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t("playlist.add_materials_title", "Add to Playlist")}
              </h3>
              <p className="text-[11px] text-zinc-500 truncate max-w-[260px]">
                {playlist.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-1 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <button
            type="button"
            onClick={() => setActiveTab("youtube")}
            className={`pb-2 text-xs font-extrabold flex items-center gap-1.5 transition-all border-b-2 cursor-pointer ${
              activeTab === "youtube"
                ? "text-teal-600 dark:text-teal-400 border-teal-600 dark:border-teal-400"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border-transparent"
            }`}
          >
            <Youtube className="w-3.5 h-3.5" />
            <span>{t("playlist.tab_youtube_url", "YouTube URL")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={`pb-2 text-xs font-extrabold flex items-center gap-1.5 transition-all border-b-2 cursor-pointer ${
              activeTab === "library"
                ? "text-teal-600 dark:text-teal-400 border-teal-600 dark:border-teal-400"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border-transparent"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t("playlist.tab_from_library", "From Library")}</span>
          </button>
        </div>

        {/* Tab 1: YouTube URL */}
        {activeTab === "youtube" && (
          <form onSubmit={handleAddYouTube} className="p-5 space-y-4 flex-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                {t("playlist.enter_yt_url", "YouTube Video URL or ID")}
              </label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                autoFocus
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t("playlist.yt_add_hint", "Paste any YouTube link to add it to this playlist collection.")}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="submit"
                disabled={isLoadingYt || !youtubeUrl.trim()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-teal-600/20 cursor-pointer"
              >
                {isLoadingYt ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>{isLoadingYt ? t("common.loading", "Loading...") : t("playlist.add_video_btn", "Add Video")}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: From Library */}
        {activeTab === "library" && (
          <div className="p-4 flex-1 flex flex-col min-h-0 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder={t("library.search_placeholder", "Search lessons in library...")}
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Lessons List */}
            <div className="overflow-y-auto space-y-1.5 flex-1 pr-1">
              {filteredLibraryLessons.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-500 dark:text-zinc-400">
                  {t("library.no_books_found", "No materials found.")}
                </div>
              ) : (
                filteredLibraryLessons.map((lesson) => {
                  const isIncluded = items.some(
                    (it) => it.lessonId === lesson.id || (lesson.youtubeId && it.videoId === lesson.youtubeId)
                  );

                  return (
                    <div
                      key={lesson.id}
                      onClick={() => handleToggleLibraryLesson(lesson)}
                      className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                        isIncluded
                          ? "bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 shadow-xs"
                          : "bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 border-zinc-200/60 dark:border-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800 relative">
                          <img
                            src={lesson.coverUrl || ""}
                            alt={lesson.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {lesson.title}
                          </h4>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {lesson.targetLanguage} • {lesson.lessonType || "material"}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                          isIncluded
                            ? "bg-teal-600 text-white"
                            : "border border-zinc-300 dark:border-zinc-700 text-transparent"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
              >
                {t("common.done", "Done")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default AddMediaToPlaylistModal;
