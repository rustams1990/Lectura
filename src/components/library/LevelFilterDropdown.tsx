/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { BarChart2, ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export type DifficultyGroup = "all" | "a1-a2" | "b1-b2" | "c1-c2";

export interface LevelFilterDropdownProps {
  selectedDifficulty: DifficultyGroup;
  onSelectDifficulty: (difficulty: DifficultyGroup) => void;
  levelCounts?: Record<DifficultyGroup, number>;
  className?: string;
}

interface LevelOption {
  id: DifficultyGroup;
  labelKey: string;
  defaultLabel: string;
  shortLabel: string;
  dotColor: string;
  textColor: string;
}

const LEVEL_OPTIONS: LevelOption[] = [
  {
    id: "all",
    labelKey: "library.all_levels",
    defaultLabel: "All Levels",
    shortLabel: "All Levels",
    dotColor: "bg-zinc-400",
    textColor: "text-zinc-700 dark:text-zinc-300",
  },
  {
    id: "a1-a2",
    labelKey: "library.level_beginner",
    defaultLabel: "A1–A2 (Beginner)",
    shortLabel: "A1–A2",
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "b1-b2",
    labelKey: "library.level_intermediate",
    defaultLabel: "B1–B2 (Intermediate)",
    shortLabel: "B1–B2",
    dotColor: "bg-amber-500",
    textColor: "text-amber-700 dark:text-amber-300",
  },
  {
    id: "c1-c2",
    labelKey: "library.level_advanced",
    defaultLabel: "C1–C2 (Advanced)",
    shortLabel: "C1–C2",
    dotColor: "bg-rose-500",
    textColor: "text-rose-700 dark:text-rose-300",
  },
];

export const LevelFilterDropdown: React.FC<LevelFilterDropdownProps> = ({
  selectedDifficulty,
  onSelectDifficulty,
  levelCounts,
  className = "",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const isSelected = selectedDifficulty !== "all";
  const currentOption = LEVEL_OPTIONS.find((opt) => opt.id === selectedDifficulty) || LEVEL_OPTIONS[0];

  return (
    <div className={`relative inline-block text-left font-sans ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border select-none ${
          isSelected
            ? "bg-indigo-50/80 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700 shadow-3xs ring-1 ring-indigo-500/20"
            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
        }`}
        title={t("library.filter_by_level", "Filter by level")}
      >
        {isSelected ? (
          <span className={`w-2 h-2 rounded-full ${currentOption.dotColor} shrink-0`} />
        ) : (
          <BarChart2 className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
        )}
        <span className="truncate max-w-[110px]">
          {isSelected ? currentOption.shortLabel : t("library.all_levels", "All Levels")}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-indigo-600 dark:text-indigo-400" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-56 max-w-[90vw] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="py-1">
            {LEVEL_OPTIONS.map((opt) => {
              const isItemActive = selectedDifficulty === opt.id;
              const count = levelCounts?.[opt.id] ?? 0;

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSelectDifficulty(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors cursor-pointer ${
                    isItemActive
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.id !== "all" ? (
                      <span className={`w-2 h-2 rounded-full ${opt.dotColor} shrink-0`} />
                    ) : (
                      <BarChart2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span className="truncate">{t(opt.labelKey, opt.defaultLabel)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {opt.id !== "all" && count > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                        {count}
                      </span>
                    )}
                    {isItemActive && (
                      <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LevelFilterDropdown;
