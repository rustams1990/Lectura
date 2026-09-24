import React, { useState, useMemo, useEffect, useRef } from "react";
import { Playlist, PlaylistItem, Lesson } from "../../types";
import {
  X,
  FolderInput,
  ListVideo,
  Plus,
  Check,
  Search,
  Copy,
  MoveRight,
  Sparkles,
  Layers,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { renderCircularFlag, getLanguageFlagEmoji } from "./PlaylistCard";
import { formatDuration } from "./PlaylistDetailView";
import { normalizeLanguage } from "../../utils";
import { getLocalizedLanguageName } from "../../utils/stringUtils";

interface MoveToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PlaylistItem[];
  sourcePlaylist: Playlist;
  playlists: Playlist[];
  lessons?: Lesson[];
  languageFlags?: Record<string, string>;
  onMoveItems: (
    items: PlaylistItem[],
    sourcePlaylistId: string,
    targetPlaylistId: string,
    mode: "move" | "copy"
  ) => void;
  onAddPlaylist?: (newPlaylist: Playlist) => void;
}

export const MoveToPlaylistModal: React.FC<MoveToPlaylistModalProps> = ({
  isOpen,
  onClose,
  items,
  sourcePlaylist,
  playlists = [],
  lessons = [],
  languageFlags = {},
  onMoveItems,
  onAddPlaylist,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [mode, setMode] = useState<"move" | "copy">("move");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // If item has its own lesson target language (e.g. English item in a Spanish playlist),
  // use the item's target language so it moves to a playlist of its own language!
  const itemMatchLesson = useMemo(() => {
    if (!items || items.length === 0 || !lessons || lessons.length === 0) return null;
    const first = items[0];
    return lessons.find((l) => (first.lessonId && l.id === first.lessonId) || (first.videoId && l.youtubeId === first.videoId));
  }, [items, lessons]);

  const sourceLang = normalizeLanguage(itemMatchLesson?.targetLanguage || sourcePlaylist.language || "English");
  const sourceLangNorm = sourceLang.toLowerCase();

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setIsCreatingNew(false);
      setNewTitle("");
      setMode("move");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isCreatingNew) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isCreatingNew]);

  // Filter available playlists (exclude the source playlist and strictly match same language)
  const availablePlaylists = useMemo(() => {
    return (playlists || []).filter((pl) => {
      if (pl.id === sourcePlaylist.id || pl.isArchived) return false;
      const plLangNorm = normalizeLanguage(pl.language || "").toLowerCase();
      return plLangNorm === sourceLangNorm;
    });
  }, [playlists, sourcePlaylist.id, sourceLangNorm]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery.trim()) return availablePlaylists;
    const q = searchQuery.toLowerCase().trim();
    return availablePlaylists.filter((pl) => pl.title.toLowerCase().includes(q));
  }, [availablePlaylists, searchQuery]);

  if (!isOpen || items.length === 0) return null;

  const isSingle = items.length === 1;
  const singleItem = items[0];

  const handleSelectTarget = (targetPlaylist: Playlist) => {
    onMoveItems(items, sourcePlaylist.id, targetPlaylist.id, mode);
    const targetTitle = targetPlaylist.title;
    if (mode === "move") {
      showToast(
        isSingle
          ? t("playlist.move_success_single", 'Видео перемещено в «{{title}}»', { title: targetTitle })
          : t("playlist.move_success_multi", '{{count}} видео перемещено в «{{title}}»', { count: items.length, title: targetTitle }),
        "success"
      );
    } else {
      showToast(
        isSingle
          ? t("playlist.copy_success_single", 'Видео скопировано в «{{title}}»', { title: targetTitle })
          : t("playlist.copy_success_multi", '{{count}} видео скопировано в «{{title}}»', { count: items.length, title: targetTitle }),
        "success"
      );
    }
    onClose();
  };

  const handleCreateAndMove = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const newPlaylistId = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newItems: PlaylistItem[] = items.map((it, idx) => ({
      ...it,
      id: `item_${it.lessonId || it.videoId || Date.now()}_${Date.now()}_${idx}`,
    }));

    const newPlaylist: Playlist = {
      id: newPlaylistId,
      title: trimmed,
      thumbnailUrl: items[0]?.thumbnailUrl || sourcePlaylist.thumbnailUrl || "",
      sourceType: "custom_collection",
      itemCount: newItems.length,
      language: sourceLang,
      items: newItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (typeof onAddPlaylist === "function") {
      onAddPlaylist(newPlaylist);
    }

    // Now execute move logic
    onMoveItems(items, sourcePlaylist.id, newPlaylistId, mode);

    showToast(
      mode === "move"
        ? t("playlist.created_and_moved", 'Плейлист «{{title}}» создан, видео перемещено!', { title: trimmed })
        : t("playlist.created_and_copied", 'Плейлист «{{title}}» создан, видео скопировано!', { title: trimmed }),
      "success"
    );
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150 font-sans"
      >
        {/* 1. Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200/80 dark:border-teal-800/80 shadow-xs shrink-0">
              <FolderInput className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
                  {isSingle
                    ? t("playlist.move_video_title", "Переместить видео")
                    : t("playlist.move_videos_title", "Переместить видео ({{count}})", { count: items.length })}
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60 shrink-0">
                  {renderCircularFlag(getLanguageFlagEmoji(sourcePlaylist.language || "en", languageFlags))}
                  <span>{getLocalizedLanguageName(sourceLang, i18n.language)}</span>
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[240px]">
                {t("playlist.from_playlist", "Из:")} <span className="font-semibold text-zinc-700 dark:text-zinc-300">{sourcePlaylist.title}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Target item preview card */}
        <div className="px-5 pt-3.5 pb-2">
          {isSingle ? (
            <div className="flex items-center gap-3 p-2 bg-zinc-50 dark:bg-zinc-850/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
              <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-zinc-950 shrink-0">
                <img
                  src={singleItem.thumbnailUrl || (singleItem.videoId ? `https://img.youtube.com/vi/${singleItem.videoId}/hqdefault.jpg` : "")}
                  alt={singleItem.title}
                  className="w-full h-full object-cover"
                />
                {singleItem.durationSeconds && singleItem.durationSeconds > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/85 text-white font-mono text-[8px] font-bold rounded">
                    {formatDuration(singleItem.durationSeconds)}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">
                {singleItem.title}
              </p>
            </div>
          ) : (
            <div className="p-2.5 bg-zinc-50 dark:bg-zinc-850/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {t("playlist.selected_count", "Выбрано: {{count}} видео", { count: items.length })}
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {items.reduce((acc, it) => acc + (it.durationSeconds || 0), 0) > 0 &&
                  formatDuration(items.reduce((acc, it) => acc + (it.durationSeconds || 0), 0))}
              </span>
            </div>
          )}
        </div>

        {/* 3. Action Mode Switcher: Move vs Copy */}
        <div className="px-5 pt-1 pb-2">
          <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("move")}
              className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === "move"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs font-extrabold"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <MoveRight className="w-3.5 h-3.5" />
              <span>{t("playlist.mode_move", "Переместить")}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("copy")}
              className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === "copy"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs font-extrabold"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{t("playlist.mode_copy", "Копировать")}</span>
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 px-1 text-center">
            {mode === "move"
              ? t("playlist.mode_move_hint", "Видео будет удалено из «{{title}}» и перенесено в выбранный плейлист.", { title: sourcePlaylist.title })
              : t("playlist.mode_copy_hint", "Видео останется в «{{title}}» и будет добавлено в выбранный плейлист.", { title: sourcePlaylist.title })}
          </p>
        </div>

        {/* 4. Search Filter Input */}
        {availablePlaylists.length > 4 && (
          <div className="px-5 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("playlist.search_playlist", "Поиск плейлиста...")}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
              />
            </div>
          </div>
        )}

        {/* 5. Destination Playlists List */}
        <div className="px-5 py-2 overflow-y-auto space-y-2 flex-1 max-h-60">
          {availablePlaylists.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <ListVideo className="w-8 h-8 text-zinc-400 mx-auto opacity-50" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {t("playlist.no_other_playlists_for_lang", "No other playlists for this language found")}
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {t("playlist.create_playlist_to_move_hint", "Create a new playlist below to move video here!")}
              </p>
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-zinc-400">
                {t("playlist.no_filter_matches", "Ничего не найдено.")}
              </p>
            </div>
          ) : (
            filteredPlaylists.map((pl) => {
              const flagEmoji = getLanguageFlagEmoji(pl.language, languageFlags);
              const alreadyHasAll = items.every((it) =>
                (pl.items || []).some(
                  (pi) =>
                    pi.id === it.id ||
                    (it.lessonId && pi.lessonId === it.lessonId) ||
                    (it.videoId && pi.videoId === it.videoId)
                )
              );

              return (
                <div
                  key={pl.id}
                  onClick={() => handleSelectTarget(pl)}
                  className="group/item p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-teal-400 dark:hover:border-teal-600 bg-white dark:bg-zinc-900 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-all flex items-center justify-between gap-3 cursor-pointer select-none active:scale-[0.99] shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Playlist Cover */}
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-200/60 dark:border-zinc-800/80">
                      {(pl.thumbnailUrl || pl.items?.[0]?.thumbnailUrl) ? (
                        <img
                          src={pl.thumbnailUrl || pl.items?.[0]?.thumbnailUrl}
                          alt={pl.title}
                          className="w-full h-full object-cover group-hover/item:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-100 dark:bg-zinc-800">
                          <ListVideo className="w-5 h-5 opacity-60" />
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover/item:text-teal-600 dark:group-hover/item:text-teal-400 transition-colors truncate">
                        {pl.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {renderCircularFlag(flagEmoji)}
                        <span className="capitalize">{pl.language}</span>
                        <span>•</span>
                        <span>{pl.itemCount || (pl.items ? pl.items.length : 0)} {t("playlist.videos_count", "видео")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Trailing indicator */}
                  <div className="shrink-0 flex items-center gap-2">
                    {alreadyHasAll ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/80 dark:border-zinc-700">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>{t("playlist.already_has_video", "Уже добавлен")}</span>
                      </span>
                    ) : (
                      <div className="w-7 h-7 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover/item:bg-teal-600 group-hover/item:text-white transition-all shadow-xs">
                        <MoveRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 6. Footer: Create New Playlist Option */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          {isCreatingNew ? (
            <form onSubmit={handleCreateAndMove} className="space-y-2.5">
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("playlist.new_playlist_name", "Название нового плейлиста...")}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-teal-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-zinc-900 dark:text-zinc-100 font-bold"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                >
                  {t("common.cancel", "Отмена")}
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer"
                >
                  {mode === "move"
                    ? t("playlist.create_and_move", "Создать и переместить")
                    : t("playlist.create_and_copy", "Создать и скопировать")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreatingNew(true)}
              className="w-full py-2.5 px-3 border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-teal-500 dark:hover:border-teal-400 rounded-2xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 flex items-center justify-center gap-2 transition cursor-pointer bg-white/50 dark:bg-zinc-800/40"
            >
              <Plus className="w-4 h-4" />
              <span>{t("playlist.create_new_and_move_btn", "Создать новый плейлист...")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MoveToPlaylistModal;
