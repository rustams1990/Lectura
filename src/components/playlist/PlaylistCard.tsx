import React, { useState, useMemo, useRef, useEffect } from "react";
import { Playlist, Lesson, HistoryEntry, ReaderSettings } from "../../types";
import { ListVideo, Trash2, Headphones, MoreVertical, Play, Archive, ArchiveRestore } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FLAG_EMOJI_TO_CODE } from "../../utils";
import { getLocalizedLanguageName } from "../../utils/stringUtils";
import { getItemEffectiveDuration } from "../../utils/durationUtils";

export function renderCircularFlag(flagEmoji: string) {
  const code = FLAG_EMOJI_TO_CODE[flagEmoji];
  if (code) {
    return (
      <img
        src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${code.toUpperCase()}.svg`}
        alt={flagEmoji}
        className="w-3.5 h-3.5 rounded-full object-cover shrink-0 shadow-2xs inline-block"
      />
    );
  }
  return <span className="inline-block text-xs leading-none">{flagEmoji}</span>;
}

export function getLanguageFlagEmoji(lang: string, languageFlags: Record<string, string>): string {
  const l = (lang || "").toLowerCase();
  if (languageFlags[l]) return languageFlags[l];
  if (l.includes("span") || l === "es") return "🇪🇸";
  if (l.includes("engl") || l === "en") return "🇬🇧";
  if (l.includes("fren") || l === "fr") return "🇫🇷";
  if (l.includes("germ") || l === "de") return "🇩🇪";
  if (l.includes("jap") || l === "ja") return "🇯🇵";
  if (l.includes("russ") || l === "ru") return "🇷🇺";
  if (l.includes("ital") || l === "it") return "🇮🇹";
  if (l.includes("ukra") || l === "uk") return "🇺🇦";
  if (l.includes("kaza") || l === "kk") return "🇰🇿";
  if (l.includes("port") || l === "pt") return "🇵🇹";
  if (l.includes("chin") || l === "zh") return "🇨🇳";
  if (l.includes("kore") || l === "ko") return "🇰🇷";
  if (l.includes("turk") || l === "tr") return "🇹🇷";
  if (l.includes("pol") || l === "pl") return "🇵🇱";
  if (l.includes("czech") || l === "cs") return "🇨🇿";
  return "🌐";
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface PlaylistCardProps {
  playlist: Playlist;
  lessons?: Lesson[];
  history?: HistoryEntry[];
  onSelectPlaylist: (id: string) => void;
  onDeletePlaylist?: (id: string, e: React.MouseEvent) => void;
  onToggleArchive?: (id: string, e: React.MouseEvent) => void;
  onPlayAllPlaylist?: (playlist: Playlist, e: React.MouseEvent) => void;
  languageFlags?: Record<string, string>;
  settings?: ReaderSettings;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  lessons = [],
  history = [],
  onSelectPlaylist,
  onDeletePlaylist,
  onToggleArchive,
  onPlayAllPlaylist,
  languageFlags = {},
  settings,
}) => {
  const { t, i18n } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
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
  }, [isMenuOpen]);

  const items = playlist.items || [];
  const itemCount = playlist.itemCount || items.length;
  const flag = getLanguageFlagEmoji(playlist.language, languageFlags);
  const localizedLang = getLocalizedLanguageName(playlist.language, i18n.language);

  // Total duration calculation
  const totalSeconds = useMemo(() => {
    return items.reduce((acc, item) => {
      const lesson = (item.lessonId ? lessons.find((l) => l.id === item.lessonId) : undefined) ||
                     (item.videoId ? lessons.find((l) => l.youtubeId === item.videoId) : undefined);
      return acc + getItemEffectiveDuration(item, lesson);
    }, 0);
  }, [items, lessons]);

  // Calculate completed count
  const completedCount = useMemo(() => {
    if (items.length === 0) return 0;
    return items.filter((item) => {
      let lesson = item.lessonId ? lessons.find((l) => l.id === item.lessonId) : undefined;
      if (!lesson && item.videoId) {
        lesson = lessons.find((l) => l.youtubeId === item.videoId);
      }
      if (!lesson) return false;
      return history.some(
        (h) => h.lessonId === lesson!.id && (h.status === "completed" || h.actionType === "complete" || h.progressPercent === 100)
      );
    }).length;
  }, [items, lessons, history]);

  const progressPercent = itemCount > 0 ? Math.round((completedCount / itemCount) * 100) : 0;

  return (
    <div
      onClick={() => onSelectPlaylist(playlist.id)}
      className="group relative bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-teal-400 dark:hover:border-teal-500/50 shadow-xs hover:shadow-xl dark:shadow-none hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Visual multi-layered stacked card shadow header */}
      <div className="absolute -top-1.5 inset-x-3 h-2 bg-zinc-300 dark:bg-zinc-700/60 rounded-t-xl opacity-60 group-hover:opacity-100 transition-opacity z-0 pointer-events-none" />
      <div className="absolute -top-3 inset-x-6 h-2 bg-zinc-200 dark:bg-zinc-800/80 rounded-t-xl opacity-40 group-hover:opacity-80 transition-opacity z-0 pointer-events-none" />

      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md z-50 p-4 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150 text-white font-sans text-left"
        >
          <div className="flex flex-col items-center justify-center flex-1 text-center space-y-3">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 shadow-inner">
              <Trash2 className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5 px-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-400">
                {t("playlist.delete_title", "Delete Playlist?")}
              </h4>
              <p className="text-[11px] text-zinc-300 leading-normal font-sans">
                {t("playlist.delete_confirm", "Are you sure you want to delete playlist")} <strong className="text-zinc-100 font-bold font-serif italic">"{playlist.title}"</strong>?
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onDeletePlaylist) onDeletePlaylist(playlist.id, e);
                setShowDeleteConfirm(false);
              }}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 active:scale-97 text-white font-black text-[11px] rounded-xl transition-all cursor-pointer shadow-md"
            >
              {t("library.confirm_delete", "Yes, delete")}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
              className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-97 text-zinc-300 border border-zinc-700/60 font-black text-[11px] rounded-xl transition-all cursor-pointer"
            >
              {t("library.cancel", "Cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Playlist Stacked Cover Banner */}
      <div className="relative aspect-video bg-zinc-950 p-3 text-white flex flex-col justify-between overflow-hidden">
        {/* Crisp cover image */}
        {playlist.thumbnailUrl ? (
          <img
            src={playlist.thumbnailUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover z-0 select-none pointer-events-none transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src.includes("/maxresdefault.jpg")) {
                target.src = target.src.replace("/maxresdefault.jpg", "/hqdefault.jpg");
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-teal-800 via-indigo-900 to-zinc-900 flex items-center justify-center">
            <ListVideo className="w-12 h-12 text-white/30" />
          </div>
        )}

        {/* Optional dim overlay only if dimBookCovers setting is enabled */}
        {settings?.dimBookCovers && (
          <div className="absolute inset-0 bg-black/40 z-[1] pointer-events-none" />
        )}

        {/* Top line: Language Pill & Badges */}
        <div className="flex items-center justify-between z-10 w-full">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-black leading-none bg-black/60 backdrop-blur-md pl-1.5 pr-2.5 py-1 rounded-full border border-white/10 text-white shadow-xs">
              {renderCircularFlag(flag)}
              <span className="truncate max-w-[90px]">{localizedLang}</span>
            </span>
            {playlist.isArchived && (
              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-amber-500/90 backdrop-blur-md text-white rounded shadow-xs">
                {t("common.archived", "Archived")}
              </span>
            )}
          </div>
        </div>

        {/* Bottom line in cover: Type Badge (left) & Videos Count Badge (right) */}
        <div className="z-10 mt-auto flex items-center justify-between w-full">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-teal-600/95 backdrop-blur-md text-white rounded-md shadow-xs">
            <ListVideo className="w-2.5 h-2.5" />
            {playlist.sourceType === "youtube_playlist" ? "YouTube Playlist" : t("playlist.collection", "Collection")}
          </span>

          <div className="px-2 py-0.5 bg-black/75 backdrop-blur-md rounded-md text-white font-mono text-[10px] font-bold flex items-center gap-1 border border-white/10 shadow-xs">
            <ListVideo className="w-3 h-3 text-white/90" />
            <span>{itemCount}</span>
          </div>
        </div>
      </div>

      {/* Card Body Details */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3
            title={playlist.title}
            className="font-bold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
          >
            {playlist.title}
          </h3>

          {playlist.channelTitle && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-1 truncate">
              {playlist.channelTitle}
            </p>
          )}
        </div>

        {/* Progress & Meta section matching lesson card styling */}
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold text-zinc-500 dark:text-zinc-400">
              <span>{t("playlist.completed_label", "Completed:")} {completedCount} / {itemCount}</span>
              <span className="text-teal-600 dark:text-teal-400 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Meta line: Episodes count + Duration */}
          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500">
            <span className="flex items-center gap-1">
              <ListVideo className="w-3 h-3 text-zinc-400" />
              {itemCount} {t("playlist.videos_count", "videos")}
            </span>
            {totalSeconds > 0 && (
              <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400">
                ⏱️ {formatDuration(totalSeconds)}
              </span>
            )}
          </div>
        </div>

        {/* Actions row: Neutral Open Playlist Button + 3-dots Menu */}
        <div className="flex gap-2 items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onSelectPlaylist(playlist.id)}
            className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-98 text-zinc-800 dark:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 font-bold text-xs rounded-xl shadow-3xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current text-zinc-600 dark:text-zinc-400" />
            <span>{completedCount > 0 ? t("playlist.continue_btn", "Continue") : t("playlist.open_playlist_btn", "Open Playlist")}</span>
          </button>

          {/* Secondary Actions 3-dots Menu */}
          <div className="relative font-sans" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
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
                {/* Play All audio queue */}
                {onPlayAllPlaylist && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onPlayAllPlaylist(playlist, e);
                    }}
                    className="w-full px-2.5 py-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>{t("player.play_all", "Play All")}</span>
                  </button>
                )}

                {/* Archive / Restore */}
                {onToggleArchive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onToggleArchive(playlist.id, e);
                    }}
                    className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{playlist.isArchived ? t("library.restore_tooltip", "Restore to bookshelf") : t("library.archive_tooltip", "Move to archive")}</span>
                  </button>
                )}

                <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />

                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full px-2.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span>{t("playlist.delete", "Delete playlist")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaylistCard;
