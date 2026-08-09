import React from "react";
import { AppStats } from "../types";
import { Headphones, CheckCircle2, Bookmark } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatsWidgetProps {
  stats: AppStats;
  selectedLanguage?: string;
}

export default function StatsWidget({ stats, selectedLanguage }: StatsWidgetProps) {
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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-sans">
      {/* Listening Card */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center gap-4 transition-all hover:scale-[1.01]">
        <div className="p-3 rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 shrink-0">
          <Headphones className="w-5 h-5 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-wider block truncate">
            {t('stats.listening_today', 'LISTENING TIME (TODAY)')}
          </span>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">
              {formatTime(todaySecs)}
            </span>
            {totalSecs > 0 && (
              <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                ({t('stats.total_label', 'total:')} {formatTime(totalSecs)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Learning Status */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center gap-4 transition-all hover:scale-[1.01]">
        <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
          <Bookmark className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-wider block truncate">
            {t('stats.learning_words', 'Active Words (Learning)')}
          </span>
          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5 block">
            {stats.wordsLearningCount}
          </span>
        </div>
      </div>

      {/* Known Words */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center gap-4 transition-all hover:scale-[1.01]">
        <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-black tracking-wider block truncate">
            {t('stats.known_words', 'Known Words (Vocabulary)')}
          </span>
          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5 block">
            {stats.wordsKnownCount}
          </span>
        </div>
      </div>
    </div>
  );
}
