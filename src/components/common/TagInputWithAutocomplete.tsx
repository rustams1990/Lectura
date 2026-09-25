/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Plus, Tag, Check, Search, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getTagColor } from "../../utils/tagColors";

interface TagInputWithAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onAddTag: (tagName: string) => void;
  availableTags: string[];
  currentTags: string[];
  placeholder?: string;
  disabled?: boolean;
}

export const TagInputWithAutocomplete: React.FC<TagInputWithAutocompleteProps> = ({
  value,
  onChange,
  onAddTag,
  availableTags = [],
  currentTags = [],
  placeholder,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanQuery = value.trim().replace(/^#+/, "").toLowerCase();

  // Filter available tags that match query and aren't already added
  const filteredSuggestions = useMemo(() => {
    if (!cleanQuery) return [];
    const currentLower = new Set(currentTags.map((t) => t.toLowerCase()));
    
    // Sort: startsWith matches first, then contains
    return availableTags
      .filter((t) => {
        const lower = t.toLowerCase();
        return !currentLower.has(lower) && lower.includes(cleanQuery);
      })
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(cleanQuery);
        const bStarts = b.toLowerCase().startsWith(cleanQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  }, [cleanQuery, availableTags, currentTags]);

  const exactMatchExists = useMemo(() => {
    if (!cleanQuery) return false;
    return availableTags.some((t) => t.toLowerCase() === cleanQuery);
  }, [cleanQuery, availableTags]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    if (filteredSuggestions.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [filteredSuggestions]);

  const handleSelect = (tagName: string) => {
    onAddTag(tagName);
    onChange("");
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && filteredSuggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      const maxIndex = filteredSuggestions.length + (!exactMatchExists && cleanQuery ? 1 : 0) - 1;
      setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const maxIndex = filteredSuggestions.length + (!exactMatchExists && cleanQuery ? 1 : 0) - 1;
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
        handleSelect(filteredSuggestions[highlightedIndex]);
      } else if (isOpen && !exactMatchExists && cleanQuery && highlightedIndex === filteredSuggestions.length) {
        handleSelect(cleanQuery);
      } else if (value.trim()) {
        handleSelect(value.trim());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold pointer-events-none">
            #
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => {
              onChange(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (cleanQuery) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || t("tags.input_placeholder", "e.g.: Gaming, Tech, Vocabulary...")}
            className="w-full pl-7 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder-zinc-400 transition"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (value.trim()) {
              handleSelect(value.trim());
            }
          }}
          disabled={disabled || !value.trim()}
          className="px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center gap-1 transition shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("tags.add_tag", "Add")}</span>
        </button>
      </div>

      {/* Floating Autocomplete Popover */}
      {isOpen && cleanQuery && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Search className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>{t("tags.autocomplete_title", "Matching tags")}</span>
            </span>
            <span>{filteredSuggestions.length} {t("tags.found", "found")}</span>
          </div>

          <div className="max-h-52 overflow-y-auto p-1 space-y-0.5">
            {filteredSuggestions.map((tag, idx) => {
              const color = getTagColor(tag);
              const isHighlighted = highlightedIndex === idx;

              // Highlight matched substring
              const lowerTag = tag.toLowerCase();
              const matchPos = lowerTag.indexOf(cleanQuery);
              const before = matchPos >= 0 ? tag.slice(0, matchPos) : "";
              const match = matchPos >= 0 ? tag.slice(matchPos, matchPos + cleanQuery.length) : tag;
              const after = matchPos >= 0 ? tag.slice(matchPos + cleanQuery.length) : "";

              return (
                <div
                  key={tag}
                  onClick={() => handleSelect(tag)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    isHighlighted
                      ? "bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-100"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${color.bg}`}
                    />
                    <span>
                      #{before}
                      <strong className="text-teal-600 dark:text-teal-400 underline font-black">
                        {match}
                      </strong>
                      {after}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-normal">
                    {t("tags.existing_tag", "Existing")}
                  </span>
                </div>
              );
            })}

            {/* Create new tag option if not exact match */}
            {!exactMatchExists && cleanQuery && (
              <div
                onClick={() => handleSelect(cleanQuery)}
                onMouseEnter={() => setHighlightedIndex(filteredSuggestions.length)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition border-t border-dashed border-zinc-100 dark:border-zinc-800 ${
                  highlightedIndex === filteredSuggestions.length
                    ? "bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-100"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-teal-700 dark:text-teal-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>
                    {t("tags.create_new_tag", "Create new tag")}: <strong className="font-extrabold text-teal-600 dark:text-teal-400">#{cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1)}</strong>
                  </span>
                </div>
                <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400 px-1.5 py-0.5 bg-teal-100/60 dark:bg-teal-900/40 rounded">
                  Enter ↵
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
