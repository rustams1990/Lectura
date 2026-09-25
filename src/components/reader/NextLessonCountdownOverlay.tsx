import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Play, X, Trophy, BookOpen, FastForward } from "lucide-react";
import { Lesson } from "../../types";

interface NextLessonCountdownOverlayProps {
  isOpen: boolean;
  nextLesson: Lesson | null;
  isLastInPlaylist?: boolean;
  playlistTitle?: string;
  secondsRemaining: number;
  onPlayNow: () => void;
  onCancel: () => void;
  onBackToLibrary: () => void;
}

export const NextLessonCountdownOverlay: React.FC<NextLessonCountdownOverlayProps> = ({
  isOpen,
  nextLesson,
  isLastInPlaylist = false,
  playlistTitle,
  secondsRemaining,
  onPlayNow,
  onCancel,
  onBackToLibrary,
}) => {
  const { t } = useTranslation();

  // Escape key cancels countdown
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // Case 1: Playlist completed celebratory banner
  if (isLastInPlaylist) {
    return (
      <div className="fixed bottom-6 right-6 z-50 max-w-sm w-[92vw] sm:w-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-amber-500/30 rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
                {t("reader.binge_completed_title", "Playlist Completed! 🎉")}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 line-clamp-2">
                {playlistTitle
                  ? t("reader.binge_completed_desc", "You have finished all lessons in \"{{title}}\"!", { title: playlistTitle })
                  : t("reader.binge_completed_generic", "You have finished all lessons in this playlist!")}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 cursor-pointer rounded-lg transition"
              title={t("common.close", "Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onBackToLibrary}
              className="flex-1 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-97 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t("reader.back_to_library", "Back to Library")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: 5-Second Countdown to Next Lesson
  if (!nextLesson) return null;

  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / 5) * 100));

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-[92vw] sm:w-[360px] animate-in fade-in slide-in-from-bottom-4 duration-300 select-none">
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-teal-500/30 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 overflow-hidden relative">
        {/* Animated draining progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-teal-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Header / Next Up info */}
        <div className="flex items-start gap-3 pt-0.5">
          {nextLesson.coverUrl ? (
            <img
              src={nextLesson.coverUrl}
              alt=""
              className="w-12 h-12 object-cover rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0 shadow-3xs"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
              <FastForward className="w-6 h-6" />
            </div>
          )}

          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-600 dark:text-teal-400">
              <FastForward className="w-3 h-3" />
              <span>
                {t("reader.next_up_countdown", "Next up in {{seconds}}s...", {
                  seconds: secondsRemaining,
                })}
              </span>
            </div>
            <h4
              className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate mt-0.5"
              title={nextLesson.title}
            >
              {nextLesson.title}
            </h4>
            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
              {nextLesson.channelName || nextLesson.targetLanguage}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 cursor-pointer rounded-lg transition shrink-0"
            title={t("common.cancel", "Cancel")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            {t("common.cancel", "Cancel")}
          </button>

          <button
            type="button"
            onClick={onPlayNow}
            className="flex-1 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-97 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{t("reader.play_now", "Play Now")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NextLessonCountdownOverlay;
