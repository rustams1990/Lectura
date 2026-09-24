import React, { useState, useMemo, useEffect, useRef } from "react";
import { Playlist, PlaylistItem, Lesson } from "../../types";
import {
  X,
  Star,
  Check,
  Search,
  RotateCcw,
  ListVideo,
  Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { formatDuration } from "./PlaylistDetailView";

interface SelectPlaylistCoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist;
  lessons?: Lesson[];
  onUpdatePlaylist: (updated: Playlist) => void;
}

export const SelectPlaylistCoverModal: React.FC<SelectPlaylistCoverModalProps> = ({
  isOpen,
  onClose,
  playlist,
  lessons = [],
  onUpdatePlaylist,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => playlist.items || [], [playlist.items]);

  // Determine current active cover item ID
  const activeCoverItemId = useMemo(() => {
    if (playlist.primaryItemId && items.some((it) => it.id === playlist.primaryItemId)) {
      return playlist.primaryItemId;
    }
    // Default to the first item if no explicit primaryItemId is set
    return items[0]?.id || null;
  }, [playlist.primaryItemId, items]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((it) => it.title.toLowerCase().includes(q));
  }, [items, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectCover = (item: PlaylistItem) => {
    const matchedLesson = (item.lessonId ? lessons.find((l) => l.id === item.lessonId) : null) ||
      (item.videoId ? lessons.find((l) => l.youtubeId === item.videoId) : null);

    const chosenThumbnail =
      item.thumbnailUrl ||
      matchedLesson?.coverUrl ||
      (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : "") ||
      playlist.thumbnailUrl;

    onUpdatePlaylist({
      ...playlist,
      primaryItemId: item.id,
      thumbnailUrl: chosenThumbnail,
      updatedAt: new Date().toISOString(),
    });

    showToast(t("playlist.cover_updated", "Обложка плейлиста обновлена!"), "success");
    onClose();
  };

  const handleResetToDefault = () => {
    const firstItem = items[0];
    const matchedLesson = firstItem
      ? (firstItem.lessonId ? lessons.find((l) => l.id === firstItem.lessonId) : null) ||
        (firstItem.videoId ? lessons.find((l) => l.youtubeId === firstItem.videoId) : null)
      : null;

    const defaultThumbnail = firstItem
      ? firstItem.thumbnailUrl ||
        matchedLesson?.coverUrl ||
        (firstItem.videoId ? `https://img.youtube.com/vi/${firstItem.videoId}/hqdefault.jpg` : "")
      : "";

    onUpdatePlaylist({
      ...playlist,
      primaryItemId: undefined,
      thumbnailUrl: defaultThumbnail || playlist.thumbnailUrl,
      updatedAt: new Date().toISOString(),
    });

    showToast(t("playlist.cover_updated", "Обложка плейлиста обновлена!"), "success");
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-xs">
              <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                {t("playlist.choose_cover_title", "Главное видео для обложки")}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t("playlist.choose_cover_desc", "Выберите видео, которое будет отображаться на обложке плейлиста.")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Reset Bar */}
        <div className="px-4 sm:px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-zinc-50/70 dark:bg-zinc-900/60">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("playlist.filter_search_placeholder", "Фильтр видео по названию...")}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all shadow-3xs"
            />
          </div>

          {playlist.primaryItemId && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-3 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-3xs"
              title={t("playlist.reset_default_cover", "По умолчанию (первое видео)")}
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
              <span>{t("playlist.reset_default_cover", "По умолчанию (первое видео)")}</span>
            </button>
          )}
        </div>

        {/* Grid of Episodes */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-400">
              <ListVideo className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-medium">
                {t("playlist.no_filter_matches", "Нет видео, соответствующих фильтру.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredItems.map((item, idx) => {
                const isCurrentCover = item.id === activeCoverItemId;
                const matchedLesson = (item.lessonId ? lessons.find((l) => l.id === item.lessonId) : null) ||
                  (item.videoId ? lessons.find((l) => l.youtubeId === item.videoId) : null);
                const thumb = item.thumbnailUrl ||
                  matchedLesson?.coverUrl ||
                  (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : "");

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectCover(item)}
                    className={`relative p-3 rounded-2xl border text-left flex gap-3 transition-all cursor-pointer group ${
                      isCurrentCover
                        ? "bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30"
                        : "bg-white dark:bg-zinc-850 border-zinc-200 dark:border-zinc-800 hover:border-amber-400 dark:hover:border-amber-500/50 hover:shadow-md"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-24 h-15 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-700/50 shadow-3xs">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.src.includes("/maxresdefault.jpg")) {
                              target.src = target.src.replace("/maxresdefault.jpg", "/hqdefault.jpg");
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500">
                          <ListVideo className="w-6 h-6" />
                        </div>
                      )}

                      {item.durationSeconds > 0 && (
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/85 text-white font-mono text-[8.5px] font-bold rounded">
                          {formatDuration(item.durationSeconds)}
                        </span>
                      )}

                      {isCurrentCover && (
                        <div className="absolute top-1 left-1 p-0.5 bg-amber-500 text-white rounded-md shadow-xs">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          {isCurrentCover ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-3xs">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span>{t("playlist.cover_badge", "Обложка")}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-zinc-400 font-bold">
                              #{items.findIndex((it) => it.id === item.id) + 1}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {item.title}
                        </h4>
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[10.5px] text-zinc-400">
                        {item.durationSeconds > 0 ? (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(item.durationSeconds)}</span>
                          </span>
                        ) : <span />}

                        <span className="text-amber-600 dark:text-amber-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity text-[11px]">
                          {isCurrentCover ? "" : t("playlist.set_as_cover", "Выбрать")}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
          >
            {t("common.close", "Закрыть")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectPlaylistCoverModal;
