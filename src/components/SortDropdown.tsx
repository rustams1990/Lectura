import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface SortOption {
  value: string;
  label: string;
  icon: string;
}

export interface SortDropdownProps {
  currentSort: string;
  onSelectSort: (sortValue: string) => void;
  selectedLessonType?: string;
  className?: string;
}

const stripLeadingEmoji = (str: string): string => {
  return (str || "").replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "").trim();
};

export const SortDropdown: React.FC<SortDropdownProps> = ({
  currentSort,
  onSelectSort,
  selectedLessonType,
  className = "",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isMedia = selectedLessonType === "youtube" || selectedLessonType === "podcast";

  const sortOptions: SortOption[] = useMemo(
    () => [
      { value: "pinned", label: stripLeadingEmoji(t("library.sort_pinned", "Pinned")), icon: "📌" },
      { value: "newest", label: stripLeadingEmoji(t("library.sort_newest", "Newest first")), icon: "🕐" },
      { value: "oldest", label: stripLeadingEmoji(t("library.sort_oldest", "Oldest first")), icon: "📅" },
      { value: "title", label: stripLeadingEmoji(t("library.sort_title", "Title A-Z")), icon: "🔤" },
      { value: "title_desc", label: stripLeadingEmoji(t("library.sort_title_desc", "Title Z-A")), icon: "🔤" },
      { value: "comprehension_high", label: stripLeadingEmoji(t("library.sort_comp_high", "Comprehension: high")), icon: "📊" },
      { value: "comprehension_low", label: stripLeadingEmoji(t("library.sort_comp_low", "Comprehension: low")), icon: "📊" },
      {
        value: "length_short",
        label: stripLeadingEmoji(isMedia ? t("library.sort_short_media", "Short") : t("library.sort_short", "Short")),
        icon: isMedia ? "⏱️" : "📖",
      },
      {
        value: "length_long",
        label: stripLeadingEmoji(isMedia ? t("library.sort_long_media", "Long") : t("library.sort_long", "Long")),
        icon: isMedia ? "⏱️" : "📖",
      },
    ],
    [t, isMedia]
  );

  const activeOption = useMemo(() => {
    return sortOptions.find((opt) => opt.value === currentSort) || sortOptions[0];
  }, [sortOptions, currentSort]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative flex items-center font-sans ${className}`} ref={dropdownRef}>
      {/* Trigger Button - Neutral style matching "All Sources" */}
      <button
        type="button"
        id="library-sort-select-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        title={t("library.sort_title_attr", "Sort books")}
        aria-expanded={isOpen}
        className="pl-2.5 pr-7 py-1.5 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex items-center gap-1.5 cursor-pointer relative shadow-3xs"
      >
        <span className="text-xs shrink-0">{activeOption.icon}</span>
        <span className="truncate max-w-[90px] sm:max-w-[120px]">{activeOption.label}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-52 sm:w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1.5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
          {sortOptions.map((option) => {
            const isSelected = currentSort === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelectSort(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-medium text-left transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs shrink-0">{option.icon}</span>
                  <span className="truncate">{option.label}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SortDropdown;
