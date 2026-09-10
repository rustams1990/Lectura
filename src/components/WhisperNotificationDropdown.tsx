import React, { useState, useRef, useEffect } from "react";
import { Bell, Loader2, Check, X, Trash2, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWhisperQueue } from "../services/whisperQueueService";

interface WhisperNotificationDropdownProps {
  onOpenBook?: (bookId: string) => void;
}

/** Formats seconds into a human-readable duration using active i18n translations */
function formatDuration(seconds: number, t: any): string {
  if (!seconds || seconds <= 0) return "";
  const s = Math.round(seconds);
  if (s < 60) {
    return t("whisper.duration_sec", "{{s}}s", { s });
  }
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) {
    return rem > 0
      ? t("whisper.duration_min_sec", "{{m}}m {{s}}s", { m, s: rem })
      : t("whisper.duration_min", "{{m}}m", { m });
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0
    ? t("whisper.duration_hr_min", "{{h}}h {{m}}m", { h, m: remM })
    : t("whisper.duration_hr", "{{h}}h", { h });
}

/** Formats item completed date */
function formatCompletedDate(timestamp?: number, lang?: string, t?: any): string {
  if (!timestamp) {
    return t ? t("whisper.recently", "Recently") : "Recently";
  }
  try {
    const d = new Date(timestamp);
    const dateStr = d.toLocaleDateString(lang && lang !== "auto" ? lang : undefined, {
      day: "numeric",
      month: "short",
    });
    return t ? t("whisper.read_on_date", "Read on {{date}}", { date: dateStr }) : `Read on ${dateStr}`;
  } catch (_) {
    return "Recently";
  }
}

export default function WhisperNotificationDropdown({ onOpenBook }: WhisperNotificationDropdownProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    queue,
    activeItem,
    completedTasks,
    totalActiveCount,
    cancelTask,
    clearCompletedTask,
    clearAllCompleted
  } = useWhisperQueue();

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasTasks = totalActiveCount > 0 || completedTasks.length > 0;
  const completedCount = completedTasks.length;

  // Dynamic subtitle text
  const getDynamicSubtitle = () => {
    if (completedCount === 0) {
      if (totalActiveCount > 0) {
        return activeItem
          ? t("whisper.tasks_active_count", "{{active}} in progress, {{queued}} queued", { active: 1, queued: queue.length })
          : t("whisper.tasks_idle", "No active tasks");
      }
      return t("whisper.no_completed_items", "You have no new completed items");
    }
    if (completedCount === 1) {
      return t("whisper.you_have_completed_one", "You have 1 new completed item");
    }
    return t("whisper.you_have_completed_items", "You have {{count}} new completed items", { count: completedCount });
  };

  // Determine active stage label
  const getStageLabel = () => {
    if (!activeItem) return "";
    switch (activeItem.status) {
      case "downloading_model":
        return t("whisper.stage_downloading_model", "Downloading model...");
      case "extracting_audio":
        return t("whisper.stage_extracting_audio", "Downloading audio...");
      case "transcribing":
        return t("whisper.stage_transcribing", "Transcribing speech");
      default:
        return activeItem.stageText || "";
    }
  };

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Bell Trigger Button (Consistent with Header Buttons) */}
      <button
        type="button"
        id="btn-whisper-notifications"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-3xs ${
          isOpen
            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-700"
            : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white border-zinc-200/60 dark:border-zinc-800/80"
        }`}
        title={t("whisper.notifications_tooltip", "Notifications")}
      >
        <Bell className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${totalActiveCount > 0 ? "animate-wiggle text-teal-600 dark:text-teal-400" : ""}`} />

        {/* Live Active Badge or Notification Dot */}
        {totalActiveCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-black text-white shadow-xs animate-pulse">
            {totalActiveCount}
          </span>
        ) : completedTasks.length > 0 ? (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white dark:ring-zinc-900" />
        ) : null}
      </button>

      {/* Flat Dropdown Card (Pixel-Matched to Photo) */}
      {isOpen && (
        <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-3xl shadow-xl z-50 p-5 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 font-sans">
          
          {/* Header Section */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base sm:text-[17px] font-bold text-zinc-950 dark:text-white tracking-tight leading-snug">
                {t("whisper.tasks_title", "Notifications")}
              </h3>
              <p className="text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 font-normal">
                {getDynamicSubtitle()}
              </p>
            </div>

            {completedTasks.length > 0 && (
              <button
                type="button"
                onClick={clearAllCompleted}
                className="flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-xs font-normal sm:font-medium text-zinc-800 dark:text-zinc-200 transition-colors shadow-2xs cursor-pointer shrink-0"
                title={t("whisper.clear_all", "Clear all")}
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                <span>{t("whisper.clear_all", "Clear all")}</span>
              </button>
            )}
          </div>

          {/* Divider Line */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/80 my-1" />

          {/* Active Job in Progress (Flat styled) */}
          {activeItem && (
            <div className="p-3 bg-zinc-100/90 dark:bg-zinc-800/60 rounded-xl space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeItem.thumbnail ? (
                    <img
                      src={activeItem.thumbnail}
                      alt="Cover"
                      className="w-10 h-7 object-cover rounded-lg shrink-0 border border-zinc-200/60 dark:border-zinc-700"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h5 className="text-xs sm:text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate" title={activeItem.title}>
                      {activeItem.title}
                    </h5>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal mt-0.5 flex items-center gap-1.5">
                      {activeItem.status === "downloading_model" ? (
                        <span className="flex items-center gap-1">
                          <Download className="w-2.5 h-2.5 animate-bounce" />
                          <span>{t("whisper.stage_downloading_model", "Downloading model...")}</span>
                        </span>
                      ) : activeItem.status === "extracting_audio" ? (
                        <span className="flex items-center gap-1">
                          <Download className="w-2.5 h-2.5 animate-pulse" />
                          <span>{t("whisper.stage_extracting_audio", "Downloading audio...")}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          <span>{getStageLabel()}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => cancelTask(activeItem!.id)}
                  title={t("common.cancel", "Cancel")}
                  className="p-1 text-zinc-400 hover:text-rose-500 rounded-md transition cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Progress Bar & ETA */}
              {activeItem.status === "transcribing" && (
                <div className="space-y-1">
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(100, Math.max(4, activeItem.progress))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                    <span>{Math.round(activeItem.progress)}%</span>
                    {activeItem.etaSeconds > 0 && (
                      <span>
                        {t("whisper.time_remaining", "~{{time}} remaining", { time: formatDuration(activeItem.etaSeconds, t) })}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Queued Jobs List */}
          {queue.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-normal text-zinc-600 dark:text-zinc-400 px-0.5">
                {t("whisper.queued_title", "In Queue ({{count}})", { count: queue.length })}
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
                {queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-zinc-100/90 dark:bg-zinc-800/60 rounded-xl flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200 text-xs" title={item.title}>
                        {item.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelTask(item.id)}
                      title={t("common.cancel", "Cancel")}
                      className="p-1 text-zinc-400 hover:text-rose-500 rounded-md transition cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Section (Flat List as in photo) */}
          {completedTasks.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-sm font-normal text-zinc-800 dark:text-zinc-200 px-0.5">
                {t("whisper.completed_title", "Completed")}
              </h4>

              <div className="max-h-64 overflow-y-auto space-y-2.5 pr-0.5 custom-scrollbar">
                {completedTasks.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.status === "completed" && item.createdBookId && onOpenBook) {
                        onOpenBook(item.createdBookId);
                        setIsOpen(false);
                      }
                    }}
                    className="w-full bg-[#f4f4f5] hover:bg-[#e4e4e7] dark:bg-zinc-800/60 dark:hover:bg-zinc-800 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 transition-colors duration-150 cursor-pointer group text-left"
                  >
                    {/* Left Green Checkmark Status Icon */}
                    <div className="w-7 h-7 rounded-full bg-[#dcfce7] dark:bg-emerald-950/70 text-[#16a34a] dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </div>

                    {/* Middle Content: Title and Secondary Metadata Line */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] sm:text-sm font-bold text-zinc-950 dark:text-white truncate transition-colors leading-tight"
                        title={item.title}
                      >
                        {item.title}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5 truncate leading-normal">
                        {formatCompletedDate(item.completedAt || item.createdAt, i18n.language, t)}
                      </div>
                    </div>

                    {/* Right Dismiss 'x' Icon */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearCompletedTask(item.id);
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition-colors cursor-pointer shrink-0"
                      title={t("common.dismiss", "Dismiss")}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasTasks && (
            <div className="py-6 text-center space-y-1">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t("whisper.no_tasks", "No new notifications")}
              </p>
              <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                {t("whisper.no_tasks_desc", "Progress of speech recognition, media extraction, and background tasks will appear here.")}
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
