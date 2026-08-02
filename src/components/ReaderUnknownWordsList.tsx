import React from "react";
import { Volume2, Check } from "lucide-react";
import { Lesson, VocabItem, WordStatus } from "../types";

interface ReaderUnknownWordsListProps {
  lesson: Lesson;
  vocab: Record<string, VocabItem>;
  activeWord: string | null;
  unknownSearchQuery: string;
  setUnknownSearchQuery: (val: string) => void;
  unknownSortMode: "alpha" | "appearance";
  setUnknownSortMode: (val: "alpha" | "appearance") => void;
  filteredUnknownWords: string[];
  getWordInfo: (cleanWord: string) => WordStatus | "known" | "ignored" | "new" | "learning";
  resolveWord: (w: string) => string;
  onWordClick: (word: string, context: string) => void;
  onMarkKnown: (word: string) => void;
  speakWord: (word: string) => void;
}

export default function ReaderUnknownWordsList({
  lesson,
  vocab,
  activeWord,
  unknownSearchQuery,
  setUnknownSearchQuery,
  unknownSortMode,
  setUnknownSortMode,
  filteredUnknownWords,
  getWordInfo,
  resolveWord,
  onWordClick,
  onMarkKnown,
  speakWord,
}: ReaderUnknownWordsListProps) {
  return (
    <div className="animate-in fade-in duration-200 space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-4 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/50 dark:border-zinc-800/60 shadow-xs">
        <div className="relative w-full sm:max-w-xs">
          <input
            type="text"
            placeholder="Поиск слов..."
            value={unknownSearchQuery}
            onChange={(e) => setUnknownSearchQuery(e.target.value)}
            className="w-full h-9 px-3.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 placeholder-zinc-400 dark:placeholder-zinc-650 transition-all font-sans"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Сортировка:</span>
          <select
            value={unknownSortMode}
            onChange={(e) => setUnknownSortMode(e.target.value as any)}
            className="text-xs font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-zinc-700 dark:text-zinc-300 cursor-pointer h-9 shadow-xs"
          >
            <option value="alpha">По алфавиту</option>
            <option value="appearance">По появлению</option>
          </select>
        </div>
      </div>

      {filteredUnknownWords.length === 0 ? (
        <div className="text-center py-16 bg-zinc-50/50 dark:bg-zinc-900/10 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Неизвестных слов не найдено.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUnknownWords.map((word) => {
            const status = getWordInfo(word);
            const key = resolveWord(word);
            const lang = lesson.targetLanguage.toLowerCase();
            const langKey = `${lang}_${key}`;
            const lq = vocab[langKey];
            const translation = lq ? lq.translation : "";
            const isSelected = activeWord?.toLowerCase() === word.toLowerCase() || activeWord?.toLowerCase() === key.toLowerCase();

            let badgeText = "New";
            let badgeColor = "bg-sky-100 text-sky-850 dark:bg-sky-950/40 dark:text-sky-350 border border-sky-200/50 dark:border-sky-900/40";
            if (status === "1") {
              badgeText = "L1";
              badgeColor = "bg-rose-100 text-rose-850 dark:bg-rose-950/40 dark:text-rose-350 border border-rose-200/50 dark:border-rose-900/40";
            } else if (status === "2") {
              badgeText = "L2";
              badgeColor = "bg-amber-105 text-amber-850 dark:bg-amber-950/40 dark:text-amber-350 border border-amber-200/50 dark:border-amber-900/40";
            } else if (status === "3" || (status as any) === "learning") {
              badgeText = "L3";
              badgeColor = "bg-emerald-100 text-emerald-850 dark:bg-emerald-950/40 dark:text-emerald-350 border border-emerald-200/50 dark:border-emerald-900/40";
            } else if (status === "4") {
              badgeText = "L4";
              badgeColor = "bg-blue-100 text-blue-850 dark:bg-blue-950/40 dark:text-blue-350 border border-blue-200/50 dark:border-blue-900/40";
            } else if (status === "5") {
              badgeText = "L5";
              badgeColor = "bg-purple-100 text-purple-850 dark:bg-purple-950/40 dark:text-purple-350 border border-purple-200/50 dark:border-purple-900/40";
            }

            const cardBorder = isSelected
              ? "border-teal-500 dark:border-teal-400 ring-2 ring-teal-500/25 shadow-md scale-102"
              : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xs";

            return (
              <div
                key={word}
                onClick={() => onWordClick(word, lesson.text)}
                className={`p-4 rounded-2xl bg-white dark:bg-zinc-950 border transition-all cursor-pointer flex flex-col justify-between gap-3 ${cardBorder}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 break-words hover:text-teal-600 dark:hover:text-teal-400">
                      {word}
                    </span>
                    {translation ? (
                      <p className="text-xs text-zinc-650 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed" title={translation}>
                        {translation}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400 dark:text-zinc-650 mt-1 italic">
                        Нет перевода
                      </p>
                    )}
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded leading-none shrink-0 ${badgeColor}`}>
                    {badgeText}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/50 pt-3 mt-1 shrink-0 font-sans">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakWord(word);
                    }}
                    className="p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-550 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer border border-zinc-200/50 dark:border-zinc-850"
                    title="Прослушать произношение"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkKnown(word);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/20 dark:hover:bg-teal-900/35 text-teal-700 dark:text-teal-400 text-[10px] font-black uppercase tracking-wider border border-teal-100/60 dark:border-teal-900/40 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Отметить как известное"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Знаю</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
