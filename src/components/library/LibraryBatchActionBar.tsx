import React from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquare,
  Square,
  Tag,
  Star,
  FolderInput,
  Archive,
  RotateCcw,
  X,
  Loader2,
} from "lucide-react";

interface LibraryBatchActionBarProps {
  selectedCount: number;
  totalVisibleCount: number;
  isAllSelected: boolean;
  isArchivedView: boolean;
  onToggleSelectAll: () => void;
  onOpenAddTag: () => void;
  onOpenSetPrimaryTag: () => void;
  onOpenMovePlaylist: () => void;
  onBatchArchive: (archive: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const LibraryBatchActionBar: React.FC<LibraryBatchActionBarProps> = ({
  selectedCount,
  totalVisibleCount,
  isAllSelected,
  isArchivedView,
  onToggleSelectAll,
  onOpenAddTag,
  onOpenSetPrimaryTag,
  onOpenMovePlaylist,
  onBatchArchive,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-4xl w-[96vw] sm:w-auto animate-in fade-in slide-in-from-bottom-5 duration-200 select-none">
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 sm:p-2.5 flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2.5 flex-wrap sm:flex-nowrap">
        
        {/* Selected Counter & Select All */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="px-2.5 py-1 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 rounded-xl flex items-center gap-1.5 text-xs font-bold text-teal-800 dark:text-teal-300 shrink-0">
            <CheckSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>
              {t("library.selected_count", "{{count}} selected", {
                count: selectedCount,
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleSelectAll}
            className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            title={isAllSelected ? t("common.deselect_all", "Deselect All") : t("common.select_all", "Select All")}
          >
            {isAllSelected ? (
              <>
                <Square className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">{t("common.deselect_all", "Deselect All")}</span>
              </>
            ) : (
              <>
                <CheckSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span className="hidden sm:inline">{t("common.select_all", "Select All")} ({totalVisibleCount})</span>
              </>
            )}
          </button>
        </div>

        <div className="hidden sm:block h-5 w-px bg-zinc-200 dark:border-zinc-800 shrink-0" />

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          {/* Add Tag */}
          <button
            type="button"
            disabled={selectedCount === 0 || isLoading}
            onClick={onOpenAddTag}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            title={t("tags.add_tag", "Add Tag")}
          >
            <Tag className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden md:inline">{t("tags.add_tag", "Add Tag")}</span>
          </button>

          {/* Set Primary Topic */}
          <button
            type="button"
            disabled={selectedCount === 0 || isLoading}
            onClick={onOpenSetPrimaryTag}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            title={t("tags.set_primary_topic", "Set Primary Topic")}
          >
            <Star className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden md:inline">{t("tags.set_primary_topic", "Primary Topic")}</span>
          </button>

          {/* Move to Playlist */}
          <button
            type="button"
            disabled={selectedCount === 0 || isLoading}
            onClick={onOpenMovePlaylist}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            title={t("playlist.move_to_playlist", "Move to Playlist")}
          >
            <FolderInput className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden md:inline">{t("playlist.playlist", "Playlist")}</span>
          </button>

          {/* Archive / Unarchive */}
          <button
            type="button"
            disabled={selectedCount === 0 || isLoading}
            onClick={() => onBatchArchive(!isArchivedView)}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            title={isArchivedView ? t("common.unarchive", "Restore from archive") : t("common.archive", "Move to archive")}
          >
            {isArchivedView ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span className="hidden md:inline">{t("common.unarchive", "Restore")}</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span className="hidden md:inline">{t("common.archive", "Archive")}</span>
              </>
            )}
          </button>
        </div>

        <div className="hidden sm:block h-5 w-px bg-zinc-200 dark:border-zinc-800 shrink-0" />

        {/* Cancel button */}
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 sm:px-2 sm:py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
          title={t("common.cancel", "Cancel selection (Esc)")}
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("common.cancel", "Cancel")}</span>
          <kbd className="hidden lg:inline text-[9px] font-mono text-zinc-400 dark:text-zinc-500 px-1 py-0.2 bg-zinc-100 dark:bg-zinc-800 rounded">
            Esc
          </kbd>
        </button>

        {isLoading && (
          <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400 shrink-0" />
        )}
      </div>
    </div>
  );
};
