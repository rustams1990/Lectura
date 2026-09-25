import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, FolderInput, Check } from "lucide-react";
import { Playlist } from "../../types";

interface BatchPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  playlists: Playlist[];
  targetLanguage?: string;
  onSubmit: (playlistId: string | null) => void;
  isLoading?: boolean;
}

export const BatchPlaylistModal: React.FC<BatchPlaylistModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  playlists,
  targetLanguage,
  onSubmit,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [selectedPlId, setSelectedPlId] = useState<string>("none");

  if (!isOpen) return null;

  // Filter playlists by current target language if specified
  const filteredPlaylists = targetLanguage
    ? playlists.filter(
        (p) =>
          !p.language ||
          p.language.toLowerCase() === targetLanguage.toLowerCase()
      )
    : playlists;

  const handleSubmit = () => {
    onSubmit(selectedPlId === "none" ? null : selectedPlId);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              <FolderInput className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t("playlist.batch_move_title", "Assign to Playlist")}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {t("tags.batch_target_info", "Applying to {{count}} selected items", {
                  count: selectedCount,
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
            {t("playlist.select_playlist_label", "Playlist / Collection")}
          </label>

          <select
            value={selectedPlId}
            onChange={(e) => setSelectedPlId(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer"
          >
            <option value="none">
              🚫 {t("playlist.remove_from_playlist", "Remove from playlist (Direct to library)")}
            </option>
            {filteredPlaylists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                📁 {pl.title} ({pl.itemCount || pl.items?.length || 0}{" "}
                {t("playlist.videos", "videos")})
              </option>
            ))}
          </select>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-3 bg-zinc-50/80 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleSubmit}
            className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t("common.save", "Apply")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
