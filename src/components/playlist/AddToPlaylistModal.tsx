import React from "react";
import { Playlist, PlaylistItem, Lesson } from "../../types";
import { X, ListVideo, Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { renderCircularFlag, getLanguageFlagEmoji } from "./PlaylistCard";

interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: Lesson;
  playlists: Playlist[];
  languageFlags?: Record<string, string>;
  onUpdatePlaylist: (updated: Playlist) => void;
  onAddOrUpdateLesson?: (lesson: Lesson) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  isOpen,
  onClose,
  lesson,
  playlists = [],
  languageFlags = {},
  onUpdatePlaylist,
  onAddOrUpdateLesson,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSelectPlaylist = (playlist: Playlist) => {
    const isAlreadyIn = playlist.items?.some(
      (it) => it.lessonId === lesson.id || (lesson.youtubeId && it.videoId === lesson.youtubeId)
    );

    let updatedItems: PlaylistItem[];
    if (isAlreadyIn) {
      // Remove from playlist
      updatedItems = (playlist.items || []).filter(
        (it) => it.lessonId !== lesson.id && (!lesson.youtubeId || it.videoId !== lesson.youtubeId)
      );
      showToast(t("playlist.removed_from_playlist", "Removed from playlist"), "info");
    } else {
      // Add to playlist
      const newItem: PlaylistItem = {
        id: `item_${lesson.id}_${Date.now()}`,
        lessonId: lesson.id,
        title: lesson.title,
        videoId: lesson.youtubeId || null,
        durationSeconds: lesson.youtubeDuration || 0,
        thumbnailUrl: lesson.coverUrl || "",
        transcriptLoaded: !!(lesson.text && lesson.text.length > 20),
      };
      updatedItems = [...(playlist.items || []), newItem];
      showToast(t("playlist.added_to_playlist", "Added to playlist!"), "success");
    }

    const updatedPlaylist: Playlist = {
      ...playlist,
      items: updatedItems,
      itemCount: updatedItems.length,
      updatedAt: new Date().toISOString(),
    };

    onUpdatePlaylist(updatedPlaylist);

    if (typeof onAddOrUpdateLesson === "function") {
      onAddOrUpdateLesson({
        ...lesson,
        playlistId: isAlreadyIn ? undefined : playlist.id,
      });
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <ListVideo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t("playlist.add_to_playlist", "Add to playlist")}
              </h3>
              <p className="text-[11px] text-zinc-500 truncate max-w-[240px]">
                {lesson.title}
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

        {/* Playlists List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {playlists.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <ListVideo className="w-8 h-8 text-zinc-400 mx-auto opacity-50" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {t("playlist.no_playlists_yet", "You have no playlists yet.")}
              </p>
            </div>
          ) : (
            playlists.map((pl) => {
              const isIncluded = pl.items?.some(
                (it) => it.lessonId === lesson.id || (lesson.youtubeId && it.videoId === lesson.youtubeId)
              );

              return (
                <div
                  key={pl.id}
                  onClick={() => handleSelectPlaylist(pl)}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                    isIncluded
                      ? "bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 shadow-xs"
                      : "bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 border-zinc-200/60 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800 relative">
                      <img
                        src={pl.thumbnailUrl || (pl.items?.[0]?.thumbnailUrl) || ""}
                        alt={pl.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {pl.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                        <span>{renderCircularFlag(getLanguageFlagEmoji(pl.language, languageFlags))}</span>
                        <span>{pl.items?.length || 0} {t("playlist.episodes_list", "episodes")}</span>
                      </div>
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
          >
            {t("common.done", "Done")}
          </button>
        </div>
      </div>
    </div>
  );
};
export default AddToPlaylistModal;
