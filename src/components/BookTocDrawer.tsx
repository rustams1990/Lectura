import React, { useEffect, useState } from "react";
import { X, BookOpen, Search, Bookmark } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface TocEntry {
  title: string;
  pageIndex: number;
  chapterIndex: number;
  progressPercent: number;
}

interface BookTocDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tocEntries: TocEntry[];
  currentPageIdx: number;
  onSelectPage: (pageIndex: number) => void;
  totalPages: number;
  bookTitle?: string;
}

export const BookTocDrawer: React.FC<BookTocDrawerProps> = ({
  isOpen,
  onClose,
  tocEntries,
  currentPageIdx,
  onSelectPage,
  totalPages,
  bookTitle,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredEntries = searchQuery.trim()
    ? tocEntries.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : tocEntries;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Slide-over Drawer */}
      <div className="relative w-72 sm:w-84 max-w-[85vw] h-full bg-stone-50 dark:bg-zinc-900 shadow-2xl border-r border-stone-200 dark:border-zinc-800 p-5 sm:p-6 flex flex-col z-10 animate-in slide-in-from-left duration-300 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-stone-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-sm sm:text-base text-stone-800 dark:text-stone-100 truncate">
                {t("reader.toc", "Оглавление")}
              </h3>
              {bookTitle && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate max-w-[170px]">
                  {bookTitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title={t("common.close", "Закрыть")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search filter when multiple chapters */}
        {tocEntries.length > 8 && (
          <div className="relative mt-3">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("reader.search_chapters", "Поиск глав...")}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-800/80 border border-stone-200 dark:border-zinc-700/80 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        )}

        {/* Chapter List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mt-3.5 scrollbar-thin">
          {filteredEntries.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400">
              {t("reader.no_chapters_found", "Главы не найдены")}
            </div>
          ) : (
            filteredEntries.map((entry, idx) => {
              const originalIdx = tocEntries.findIndex(
                (e) => e.chapterIndex === entry.chapterIndex
              );
              const nextEntry =
                originalIdx >= 0 ? tocEntries[originalIdx + 1] : undefined;
              const isCurrent =
                currentPageIdx >= entry.pageIndex &&
                (!nextEntry || currentPageIdx < nextEntry.pageIndex);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onSelectPage(entry.pageIndex);
                    onClose();
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isCurrent
                      ? "text-sky-600 dark:text-sky-400 font-bold bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 shadow-xs"
                      : "text-stone-700 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Bookmark
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isCurrent
                          ? "fill-current text-sky-500"
                          : "text-stone-400 opacity-60"
                      }`}
                    />
                    <span className="font-serif text-xs truncate">
                      {entry.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] tabular-nums font-mono opacity-60">
                    <span>
                      {t("reader.page", "стр.")} {entry.pageIndex + 1}
                    </span>
                    {entry.progressPercent > 0 && (
                      <span>• {entry.progressPercent}%</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-between text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <span>
            {tocEntries.length} {t("reader.chapters_total", "глав")}
          </span>
          <span>
            {totalPages} {t("reader.pages_total", "страниц")}
          </span>
        </div>
      </div>
    </div>
  );
};
