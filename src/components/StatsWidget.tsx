/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AppStats } from "../types";
import { Headphones, CheckCircle2, Bookmark, Award } from "lucide-react";

interface StatsWidgetProps {
  stats: AppStats;
}

export default function StatsWidget({ stats }: StatsWidgetProps) {
  const formatTime = (totalSeconds: number) => {
    if (!totalSeconds || totalSeconds <= 0) return "0с";
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    if (hrs > 0) {
      return mins > 0 ? `${hrs}ч ${mins}мин` : `${hrs}ч`;
    }
    if (mins > 0) {
      return secs > 0 ? `${mins}мин ${secs}с` : `${mins}мин`;
    }
    return `${secs}с`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Listening Card */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center gap-4 transition-all hover:scale-[1.01]">
        <div className="p-3 rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
          <Headphones className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <span className="text-xs text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-wider block">
            Listening Time
          </span>
          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">
            {formatTime(stats.listeningSeconds)}
          </span>
        </div>
      </div>

      {/* Learning Status */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center gap-4 transition-all hover:scale-[1.01]">
        <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
          <Bookmark className="w-5 h-5" />
        </div>
        <div>
          <span className="text-xs text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-wider block">
            Active Words (Learning)
          </span>
          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">
            {stats.wordsLearningCount}
          </span>
        </div>
      </div>

      {/* Known Words */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center gap-4 transition-all hover:scale-[1.01]">
        <div className="p-3 rounded-xl bg-emerald-100 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 animate-none">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <span className="text-xs text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-wider block">
            Known Words (Vocabulary)
          </span>
          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">
            {stats.wordsKnownCount}
          </span>
        </div>
      </div>
    </div>
  );
}
