import React from "react";
import { AppStats } from "../types";
import { Headphones, CheckCircle2, Bookmark } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatsWidgetProps {
  stats: AppStats;
  selectedLanguage?: string;
  onlyPatterns?: boolean;
  onToggleOnlyPatterns?: () => void;
}

export default function StatsWidget({ stats, selectedLanguage, onlyPatterns, onToggleOnlyPatterns }: StatsWidgetProps) {
  const { t } = useTranslation();
  const formatTime = (totalSeconds: number) => {
    if (!totalSeconds || totalSeconds <= 0) return `0${t('stats.seconds_short', 'с')}`;
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    if (hrs > 0) {
      return mins > 0 ? `${hrs}${t('stats.hours_short', 'ч')} ${mins}${t('stats.minutes_short', 'мин')}` : `${hrs}${t('stats.hours_short', 'ч')}`;
    }
    if (mins > 0) {
      return secs > 0 ? `${mins}${t('stats.minutes_short', 'мин')} ${secs}${t('stats.seconds_short', 'с')}` : `${mins}${t('stats.minutes_short', 'мин')}`;
    }
    return `${secs}${t('stats.seconds_short', 'с')}`;
  };

  const todaySecs = stats.todayListeningSeconds || 0;
  const totalSecs = stats.listeningSeconds || 0;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 font-sans select-none">
      {/* Listening Card */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-2.5 sm:p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1 sm:gap-4 transition-all hover:scale-[1.01]">
        <div className="hidden sm:flex p-3 rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 shrink-0">
          <Headphones className="w-5 h-5 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1 w-full">
          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-wider block truncate">
            <span className="sm:hidden">{t('stats.listening_short', 'Listen')}</span>
            <span className="hidden sm:inline">{t('stats.listening_today', 'Listening Time (Today)')}</span>
          </span>
          <div className="flex items-baseline justify-center sm:justify-start gap-1 sm:gap-2 flex-wrap mt-0.5">
            <span className="text-sm sm:text-xl font-black text-zinc-900 dark:text-zinc-100">
              {formatTime(todaySecs)}
            </span>
            {totalSecs > 0 && (
              <span className="hidden sm:inline text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                ({t('stats.total_label', 'total:')} {formatTime(totalSecs)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Learning Status */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-2.5 sm:p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1 sm:gap-4 transition-all hover:scale-[1.01]">
        <div className="hidden sm:flex p-3 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
          <Bookmark className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1 w-full">
          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-wider block truncate">
            <span className="sm:hidden">{t('stats.learning_words_short', 'Active')}</span>
            <span className="hidden sm:inline">{t('stats.learning_words', 'Active Words (Learning)')}</span>
          </span>
          <span className="text-sm sm:text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5 block">
            {stats.wordsLearningCount}
          </span>
        </div>
      </div>

      {/* Known Words */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-2.5 sm:p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1 sm:gap-4 transition-all hover:scale-[1.01]">
        <div className="hidden sm:flex p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1 w-full">
          <div className="flex items-center justify-center sm:justify-between gap-1">
            <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-wider block truncate">
              <span className="sm:hidden">{t('stats.known_words_short', 'Known')}</span>
              <span className="hidden sm:inline">{t('stats.known_words', 'Known Words (Vocabulary)')}</span>
            </span>

            {onToggleOnlyPatterns && (
              <button
                type="button"
                onClick={onToggleOnlyPatterns}
                className={`hidden sm:inline-flex px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border items-center gap-1 select-none cursor-pointer shrink-0 ${
                  onlyPatterns
                    ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/50 dark:border-teal-800 dark:text-teal-400 font-extrabold shadow-2xs"
                    : "bg-white border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
                title={onlyPatterns ? t('stats.mode_parents_title', 'Counting parent words only') : t('stats.mode_all_title', 'Counting all word forms')}
              >
                <span>{onlyPatterns ? "🔗" : "🔤"}</span>
                <span>{onlyPatterns ? t('stats.parents_only', 'Parents Only') : t('stats.all_words', 'All Forms')}</span>
              </button>
            )}
          </div>
          <span className="text-sm sm:text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5 block">
            {stats.wordsKnownCount}
          </span>
        </div>
      </div>
    </div>
  );
}
