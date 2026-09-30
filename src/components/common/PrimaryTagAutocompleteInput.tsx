/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, Plus, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getTagColor } from "../../utils/tagColors";

export interface PrimaryTagAutocompleteInputProps {
  value: string | null;
  onChange: (val: string | null) => void;
  availableTags: string[];
  placeholder?: string;
  disabled?: boolean;
}

export const PrimaryTagAutocompleteInput: React.FC<PrimaryTagAutocompleteInputProps> = ({
  value,
  onChange,
  availableTags = [],
  placeholder,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(value || "");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal input value when external prop changes
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const cleanQuery = inputValue.trim().replace(/^#+/, "").toLowerCase();

  // Filter available tags that match query
  const filteredSuggestions = useMemo(() => {
    if (!cleanQuery) {
      return availableTags.slice(0, 8);
    }

    return availableTags
      .filter((t) => t.toLowerCase().includes(cleanQuery))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(cleanQuery);
        const bStarts = b.toLowerCase().startsWith(cleanQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  }, [cleanQuery, availableTags]);

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
    let clean = tagName.trim().replace(/^#+/, "").trim();
    if (!clean) return;
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    setInputValue(clean);
    onChange(clean);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    setInputValue("");
    onChange(null);
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
      } else if (inputValue.trim()) {
        handleSelect(inputValue.trim());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold pointer-events-none">
          #
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          disabled={disabled}
          onChange={(e) => {
            const nextVal = e.target.value;
            setInputValue(nextVal);
            onChange(nextVal.replace(/^#+/, "").trim() || null);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t("history_page.tags_placeholder", "E.g.: Spanish, Grammar, Podcast")}
          className="w-full pl-7 pr-8 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder-zinc-400 transition"
        />

        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded cursor-pointer transition"
            title={t("common.clear", "Clear")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Floating Autocomplete Popover */}
      {isOpen && (filteredSuggestions.length > 0 || (!exactMatchExists && cleanQuery)) && (
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
              const isCurrentSelected = value && value.toLowerCase() === tag.toLowerCase();

              const lowerTag = tag.toLowerCase();
              const matchPos = cleanQuery ? lowerTag.indexOf(cleanQuery) : -1;
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
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${color.bg}`} />
                    <span>
                      #{before}
                      {cleanQuery && matchPos >= 0 ? (
                        <strong className="text-teal-600 dark:text-teal-400 underline font-black">
                          {match}
                        </strong>
                      ) : (
                        match
                      )}
                      {after}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isCurrentSelected && (
                      <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    )}
                    <span className="text-[10px] text-zinc-400 font-normal">
                      {t("tags.existing_tag", "Existing")}
                    </span>
                  </div>
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
