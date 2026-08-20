import React, { useState, useRef, useEffect } from "react";
import { Bell, Loader2, CheckCircle2, XCircle, Clock, Zap, X, Trash2, BookOpen, Download } from "lucide-react";
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
    return t("whisper.duration_sec", "{{s}} сек", { s });
  }
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) {
    return rem > 0
      ? t("whisper.duration_min_sec", "{{m}} мин {{s}} сек", { m, s: rem })
      : t("whisper.duration_min", "{{m}} мин", { m });
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0
    ? t("whisper.duration_hr_min", "{{h}} ч {{m}} мин", { h, m: remM })
    : t("whisper.duration_hr", "{{h}} ч", { h });
}

export default function WhisperNotificationDropdown({ onOpenBook }: WhisperNotificationDropdownProps) {
  const { t } = useTranslation();
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

  // Determine active stage label
  const getStageLabel = () => {
    if (!activeItem) return "";
    switch (activeItem.status) {
      case "downloading_model":
        return t("whisper.stage_downloading_model", "Загрузка модели...");
      case "extracting_audio":
        return t("whisper.stage_extracting_audio", "Скачивание аудио...");
      case "transcribing":
        return t("whisper.stage_transcribing", "Расшифровка речи");
      default:
        return activeItem.stageText || "";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        id="btn-whisper-notifications"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
          totalActiveCount > 0
            ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 shadow-3xs"
            : "bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200/60 dark:border-zinc-800/80"
        }`}
        title={t("whisper.notifications_tooltip", "Уведомления")}
      >
        <Bell className={`w-4 h-4 ${totalActiveCount > 0 ? "animate-wiggle" : ""}`} />

        {/* Live Active Badge */}
        {totalActiveCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-black text-white shadow-xs animate-pulse">
            {totalActiveCount}
          </span>
        )}
      </button>

      {/* Dropdown Card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[90vw] max-w-xs sm:w-80 sm:max-w-none md:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 font-sans overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-emerald-600 dark:text-emerald-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  {t("whisper.tasks_title", "Уведомления")}
                </h4>
                <p className="text-[10px] text-zinc-400">
                  {totalActiveCount > 0
                    ? t("whisper.tasks_active_count", "{{active}} в процессе, {{queued}} в очереди", { active: activeItem ? 1 : 0, queued: queue.length })
                    : t("whisper.tasks_idle", "Нет активных задач")}
                </p>
              </div>
            </div>

            {completedTasks.length > 0 && (
              <button
                type="button"
                onClick={clearAllCompleted}
                className="text-[10px] text-zinc-400 hover:text-rose-500 font-bold transition flex items-center gap-1 cursor-pointer"
                title={t("whisper.clear_completed", "Очистить")}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t("whisper.clear_completed", "Очистить")}</span>
              </button>
            )}
          </div>

          {/* Active Job Card */}
          {activeItem && (
            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 rounded-xl space-y-2.5 shadow-2xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeItem.thumbnail ? (
                    <img src={activeItem.thumbnail} alt="Cover" className="w-11 h-8 object-cover rounded-lg shrink-0 border border-zinc-200/60 dark:border-zinc-800" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h5 className="text-xs font-black text-zinc-800 dark:text-zinc-100 truncate" title={activeItem.title}>
                      {activeItem.title}
                    </h5>
                    {activeItem.channelName && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {activeItem.channelAvatarUrl && (
                          <img src={activeItem.channelAvatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                        )}
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium truncate">{activeItem.channelName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-bold">
                      {activeItem.status === "downloading_model" ? (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Download className="w-2.5 h-2.5 animate-bounce" />
                          <span>{t("whisper.downloading_model_badge", "Загрузка модели...")}</span>
                        </span>
                      ) : activeItem.status === "extracting_audio" ? (
                        <span className="text-sky-600 dark:text-sky-400 flex items-center gap-1">
                          <Download className="w-2.5 h-2.5 animate-pulse" />
                          <span>{t("whisper.stage_extracting_audio", "Скачивание аудио...")}</span>
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
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
                  title={t("common.cancel", "Отменить")}
                  className="p-1 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Progress Bar & Time Remaining */}
              <div className="space-y-1">
                {/* Show progress bar when transcribing */}
                {activeItem.status === "transcribing" && (
                  <>
                    <div className="w-full h-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(4, activeItem.progress))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 font-mono font-bold">
                      <span>{Math.round(activeItem.progress)}%</span>
                      {activeItem.etaSeconds > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-sans">
                          {t("whisper.time_remaining", "осталось ~{{time}}", { time: formatDuration(activeItem.etaSeconds, t) })}
                        </span>
                      )}
                    </div>
                  </>
                )}

                {/* Extracting audio: indeterminate animation + hint */}
                {activeItem.status === "extracting_audio" && (
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-sky-100 dark:bg-sky-950/40 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-gradient-to-r from-sky-400 to-cyan-400 rounded-full animate-[slide_1.4s_ease-in-out_infinite]" />
                    </div>
                    <p className="text-[9px] text-zinc-400 text-right">
                      {t("whisper.extracting_hint", "Время зависит от длины видео...")}
                    </p>
                  </div>
                )}

                {/* Downloading model: indeterminate */}
                {activeItem.status === "downloading_model" && (
                  <div className="w-full h-2 bg-amber-100 dark:bg-amber-950/40 rounded-full overflow-hidden">
                    <div className="h-full w-1/2 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full animate-[slide_1.8s_ease-in-out_infinite]" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Queued Jobs List */}
          {queue.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 px-0.5">
                {t("whisper.queued_title", "В очереди ({{count}})", { count: queue.length })}
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
                {queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200 text-[11px]" title={item.title}>
                          {item.title}
                        </span>
                        {item.channelName && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.channelAvatarUrl && (
                              <img src={item.channelAvatarUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                            )}
                            <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium truncate">{item.channelName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelTask(item.id)}
                      title={t("common.cancel", "Отменить")}
                      className="p-1 text-zinc-400 hover:text-rose-500 rounded-md transition cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed History List */}
          {completedTasks.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 px-0.5">
                {t("whisper.completed_title", "Завершено")}
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
                {completedTasks.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                      item.status === "completed"
                        ? "bg-white dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 hover:border-teal-500/50 cursor-pointer"
                        : "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40"
                    }`}
                    onClick={() => {
                      if (item.status === "completed" && item.createdBookId && onOpenBook) {
                        onOpenBook(item.createdBookId);
                        setIsOpen(false);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate" title={item.title}>
                          {item.title}
                        </div>
                        {item.channelName && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.channelAvatarUrl && (
                              <img src={item.channelAvatarUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                            )}
                            <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium truncate">{item.channelName}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{item.model}</span>
                          {item.status === "completed" ? (
                            <span className="text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-0.5">
                              <BookOpen className="w-2.5 h-2.5" />
                              <span>{t("whisper.click_to_open", "Открыть книгу")}</span>
                            </span>
                          ) : (
                            <span className="text-rose-500 font-semibold truncate max-w-[200px]" title={item.error || item.stageText}>
                              {item.error || item.stageText || t("whisper.failed", "Ошибка")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearCompletedTask(item.id);
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasTasks && (
            <div className="py-6 text-center space-y-1.5">
              <div className="w-10 h-10 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                <Clock className="w-5 h-5 opacity-60" />
              </div>
              <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                {t("whisper.no_tasks", "Нет новых уведомлений")}
              </p>
              <p className="text-[10px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                {t("whisper.no_tasks_desc", "Здесь отображается прогресс фонового распознавания речи, загрузки медиа и системные задачи.")}
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
