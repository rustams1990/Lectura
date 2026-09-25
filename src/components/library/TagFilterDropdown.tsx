/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Tag, ChevronDown, Check, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getTagColor } from "../../utils/tagColors";

export interface TagFilterDropdownProps {
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  availableTags: string[];
  tagCounts?: Map<string, number>;
  className?: string;
}

export const TagFilterDropdown: React.FC<TagFilterDropdownProps> = ({
  selectedTag,
  onSelectTag,
  availableTags,
  tagCounts,
  className = "",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input on open if present
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const isSelected = selectedTag !== "all";

  // Filter tags by search inside dropdown
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return availableTags;
    const q = searchQuery.toLowerCase().trim().replace(/^#+/, "");
    return availableTags.filter((tag) => tag.toLowerCase().includes(q));
  }, [availableTags, searchQuery]);

  const selectedColor = isSelected ? getTagColor(selectedTag) : null;

  return (
    <div className={`relative inline-block text-left font-sans ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border select-none ${
          isSelected
            ? "bg-teal-50/80 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-700 shadow-3xs ring-1 ring-teal-500/20"
            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
        }`}
        title={t("library.filter_by_tag", "Filter by tag")}
      >
        {isSelected && selectedColor ? (
          <span className={`w-2 h-2 rounded-full ${selectedColor.bg} shrink-0`} />
        ) : (
          <Tag className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
        )}
        <span className="truncate max-w-[120px]">
          {isSelected ? `#${selectedTag}` : t("library.all_tags", "All Tags")}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-teal-600 dark:text-teal-400" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-60 max-w-[90vw] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Internal search if more than 5 tags */}
          {availableTags.length > 5 && (
            <div className="px-2.5 pb-2 pt-1 border-b border-zinc-100 dark:border-zinc-800">
              <div className="relative">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("library.search_tags", "Search tags...")}
                  className="w-full pl-7 pr-6 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-lg border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-teal-500 text-[11px]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 rounded"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1">
            {/* Option: All Tags */}
            <button
              type="button"
              onClick={() => {
                onSelectTag("all");
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors cursor-pointer ${
                selectedTag === "all"
                  ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{t("library.all_tags", "All Tags")}</span>
              </div>
              {selectedTag === "all" && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
            </button>

            {/* List of available tags */}
            {filteredTags.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-zinc-400 italic text-center">
                {t("library.no_tags_found", "No tags found")}
              </div>
            ) : (
              filteredTags.map((tag) => {
                const color = getTagColor(tag);
                const isItemActive = selectedTag.toLowerCase() === tag.toLowerCase();
                const count = tagCounts?.get(tag.toLowerCase()) ?? 0;

                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onSelectTag(tag);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isItemActive
                        ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${color.bg} shrink-0`} />
                      <span className="truncate">#{tag}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {count > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                          {count}
                        </span>
                      )}
                      {isItemActive && (
                        <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagFilterDropdown;
