import React, { useState, useEffect } from "react";
import {
  X,
  History,
  BookOpen,
  Sparkles,
  Radio,
  Tv,
  Loader2,
  Headphones,
  FileText,
  MessageSquare,
  Check,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { HistoryEntry, Lesson, ActivitySourceMode, CustomActivityCategory } from "../types";
import { resolveApiUrl } from "../utils/apiConfig";
import { generateHistoryId } from "../utils";
import { useToast } from "../context/ToastContext";
import { AppDatePicker } from "./common/AppDatePicker";
import { AppTimePicker } from "./common/AppTimePicker";

export const ACTIVITY_LANGUAGES = [
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "en", name: "English", native: "English", flag: "🇬🇧" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "ru", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "tr", name: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "uk", name: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "sv", name: "Swedish", native: "Svenska", flag: "🇸🇪" },
  { code: "el", name: "Greek", native: "Ελληνικά", flag: "🇬🇷" },
  { code: "cs", name: "Czech", native: "Čeština", flag: "🇨🇿" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "kk", name: "Kazakh", native: "Қазақша", flag: "🇰🇿" },
];

export const ACTIVITY_CATEGORIES: Array<{
  id: CustomActivityCategory;
  labelKey: string;
  defaultLabel: string;
  icon: any;
  color: string;
  defaultActionType: "read" | "listen" | "study" | "speak";
}> = [
  { id: "video", labelKey: "history_page.cat_video", defaultLabel: "Video (YouTube, Netflix)", icon: Tv, color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50", defaultActionType: "listen" },
  { id: "podcast", labelKey: "history_page.cat_podcast", defaultLabel: "Podcast / Audio", icon: Headphones, color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/50", defaultActionType: "listen" },
  { id: "book", labelKey: "history_page.cat_book", defaultLabel: "Book / Reading", icon: BookOpen, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50", defaultActionType: "read" },
  { id: "grammar", labelKey: "history_page.cat_grammar", defaultLabel: "Grammar / Exercises", icon: FileText, color: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/50", defaultActionType: "study" },
  { id: "speaking", labelKey: "history_page.cat_speaking", defaultLabel: "Speaking / Tutor", icon: MessageSquare, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50", defaultActionType: "speak" },
  { id: "other", labelKey: "history_page.cat_other", defaultLabel: "Other Activity", icon: Sparkles, color: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/50", defaultActionType: "read" },
];

export interface EditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: HistoryEntry | null;
  lessons: Lesson[];
  history: HistoryEntry[];
  existingChannels: Array<{ name: string; avatarUrl?: string | null; channelUrl?: string | null }>;
  selectedLanguage: string;
  onUpdateHistory: (updatedHistory: HistoryEntry[], deletedIds?: string[]) => void;
  onUpdateLessons?: (updatedLessons: Lesson[]) => void;
}

export const EditHistoryModal: React.FC<EditHistoryModalProps> = ({
  isOpen,
  onClose,
  entry,
  lessons,
  history,
  existingChannels,
  selectedLanguage,
  onUpdateHistory,
  onUpdateLessons,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [formMode, setFormMode] = useState<ActivitySourceMode>("library");
  const [formCategory, setFormCategory] = useState<CustomActivityCategory>("video");
  const [formLessonId, setFormLessonId] = useState("");
  const [formCustomTitle, setFormCustomTitle] = useState("");
  const [formLanguage, setFormLanguage] = useState("Spanish");
  const [formActionType, setFormActionType] = useState<"read" | "listen" | "complete" | "study" | "speak">("read");
  const [formStatus, setFormStatus] = useState<"in_progress" | "completed">("in_progress");
  const [formMinutes, setFormMinutes] = useState("10");
  const [formNotes, setFormNotes] = useState("");
  const [formDateOnly, setFormDateOnly] = useState("");
  const [formTime, setFormTime] = useState("00:00");
  const [formTags, setFormTags] = useState("");
  const [formChannelName, setFormChannelName] = useState("");
  const [formChannelUrl, setFormChannelUrl] = useState("");
  const [formChannelAvatarUrl, setFormChannelAvatarUrl] = useState<string | null>(null);
  const [isResolvingFormChannel, setIsResolvingFormChannel] = useState(false);
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  // Sync form state whenever modal opens or entry changes
  useEffect(() => {
    if (!isOpen) return;

    if (entry) {
      const isCustom = entry.mode === "custom" || entry.lessonId === "custom" || !lessons.some((l) => l.id === entry.lessonId);
      const matchedLesson = lessons.find((l) => l.id === entry.lessonId);
      setFormMode(isCustom ? "custom" : "library");
      setFormCategory(entry.category || "video");
      setFormLessonId(entry.lessonId);
      setFormCustomTitle(entry.customTitle || entry.lessonTitle || "");
      setFormLanguage(entry.targetLanguage || "Spanish");
      setFormActionType(entry.actionType || "read");
      setFormStatus((entry.status === "completed" || entry.actionType === "complete") ? "completed" : "in_progress");
      setFormMinutes(Math.round((entry.durationSeconds || 0) / 60).toString());
      setFormNotes(entry.notes || "");
      setFormTags(entry.tags ? entry.tags.join(", ") : "");
      setFormChannelName(entry.channelName || matchedLesson?.channelName || (matchedLesson as any)?.channelTitle || "");
      setFormChannelUrl((entry as any).channelUrl || matchedLesson?.channelUrl || "");
      setFormChannelAvatarUrl(entry.channelAvatarUrl || matchedLesson?.channelAvatarUrl || null);

      const rawTime = entry.timestamp || (entry as any).createdAt || (entry as any).date;
      if (rawTime) {
        const d = new Date(rawTime);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          setFormDateOnly(`${yyyy}-${mm}-${dd}`);
          const hh = String(d.getHours()).padStart(2, "0");
          const min = String(d.getMinutes()).padStart(2, "0");
          setFormTime(`${hh}:${min}`);
        } else {
          setFormTime("00:00");
        }
      } else {
        setFormTime("00:00");
      }
    } else {
      // Create new entry defaults
      setFormMode("library");
      setFormCategory("video");
      setFormLessonId(lessons[0]?.id || "");
      setFormCustomTitle("");
      const defaultLang = selectedLanguage !== "all" ? selectedLanguage : (lessons[0]?.targetLanguage || "Spanish");
      setFormLanguage(defaultLang);
      setFormActionType("read");
      setFormStatus("in_progress");
      setFormMinutes("15");
      setFormNotes("");
      setFormTags("");
      setFormChannelName("");
      setFormChannelUrl("");
      setFormChannelAvatarUrl(null);

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setFormDateOnly(`${yyyy}-${mm}-${dd}`);
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setFormTime(`${hh}:${min}`);
    }
  }, [isOpen, entry, lessons, selectedLanguage]);

  const handleResolveFormChannel = async () => {
    const rawUrl = formChannelUrl.trim();
    if (!rawUrl) {
      showToast(t('import.channel_url_required', 'Пожалуйста, введите ссылку на YouTube канал'), 'error');
      return;
    }
    setIsResolvingFormChannel(true);
    try {
      const res = await fetch(resolveApiUrl('/api/youtube/channel-info'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: rawUrl,
          channelUrl: rawUrl,
          channelName: formChannelName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        const title = data.title || data.channelName;
        const avatar = data.avatar || data.channelAvatarUrl;
        const cleanUrl = data.channelUrl || rawUrl;

        if (title) setFormChannelName(title);
        if (avatar) setFormChannelAvatarUrl(avatar);
        if (cleanUrl) setFormChannelUrl(cleanUrl);

        showToast(
          t('import.channel_found', 'Канал успешно найден: {{name}}', { name: title || 'YouTube' }),
          'success'
        );
      } else {
        showToast(
          data.error || t('import.channel_not_found', 'Не удалось найти информацию о YouTube канале. Проверьте ссылку.'),
          'error'
        );
      }
    } catch (err: any) {
      console.error('Failed to resolve channel:', err);
      showToast(
        t('import.channel_resolve_error', 'Ошибка при обращении к серверу для поиска канала.'),
        'error'
      );
    } finally {
      setIsResolvingFormChannel(false);
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingEntry) return;

    const durationSeconds = Math.max(0, (parseInt(formMinutes, 10) || 0) * 60);
    if (durationSeconds <= 0) {
      showToast(t('history_page.invalid_duration', 'Время активности должно быть больше 0'), 'error');
      return;
    }

    let title = "";
    let targetLang = "Spanish";
    let coverUrl: string | null = null;
    let lessonType = "article";
    let channelName: string | null = null;
    let channelAvatarUrl: string | null = null;
    let lessonId = "custom";

    let updatedLessons: Lesson[] | null = null;

    if (formMode === "library") {
      const selectedLesson = lessons.find((l) => l.id === formLessonId);
      title = selectedLesson ? selectedLesson.title : (formCustomTitle.trim() || t('history_page.lesson_default_short', "Lesson"));
      targetLang = selectedLesson ? selectedLesson.targetLanguage : (formLanguage || "Spanish");
      coverUrl = selectedLesson ? selectedLesson.coverUrl : null;
      lessonType = selectedLesson ? (selectedLesson.lessonType || "article") : "article";
      channelName = formChannelName.trim() || (selectedLesson ? selectedLesson.channelName || null : null);
      channelAvatarUrl = formChannelAvatarUrl || (selectedLesson ? selectedLesson.channelAvatarUrl || null : null);
      lessonId = formLessonId || "custom";

      if (selectedLesson) {
        updatedLessons = lessons.map((l) =>
          l.id === selectedLesson.id
            ? {
                ...l,
                channelName: channelName,
                channelTitle: channelName,
                channelAvatarUrl: channelAvatarUrl,
                channelUrl: formChannelUrl.trim() || l.channelUrl,
              }
            : l
        );
      }
    } else {
      // Custom Activity
      title = formCustomTitle.trim() || t('history_page.custom_activity_default', "Custom Activity");
      targetLang = formLanguage || "Spanish";
      lessonId = entry ? (entry.lessonId || "custom") : "custom";
      lessonType = formCategory;
      channelName = formChannelName.trim() || null;
      channelAvatarUrl = formChannelAvatarUrl || null;
      if (entry && !coverUrl) {
        coverUrl = entry.coverUrl || null;
      }
    }

    let timestamp = new Date().toISOString();
    if (formDateOnly) {
      const timeStr = formTime && formTime.includes(":") ? formTime : "00:00";
      const parsed = new Date(`${formDateOnly}T${timeStr}:00`);
      if (!isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    }

    const parsedTags = formTags.split(",").map((t) => t.trim()).filter(Boolean);

    setIsSavingEntry(true);
    try {
      const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
      const savedUserStr = localStorage.getItem("vocab_clone_local_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-local-sync-key": "4815a16a23a42a",
        "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default",
      };
      if (savedToken) headers["Authorization"] = `Bearer ${savedToken}`;

      if (entry) {
        const realLessonId = lessonId !== "custom" ? lessonId : entry.lessonId;
        const hasChannelChange = channelName !== null && channelName !== undefined && channelName.trim() !== "";
        const preservedCoverUrl = coverUrl || entry.coverUrl || null;

        const updated = history.map((h) => {
          if (h.id === entry.id) {
            return {
              ...h,
              lessonId,
              lessonTitle: title,
              targetLanguage: targetLang,
              coverUrl: preservedCoverUrl,
              lessonType,
              actionType: formActionType,
              status: formStatus,
              durationSeconds,
              notes: formNotes.trim(),
              tags: parsedTags,
              timestamp,
              channelName,
              channelAvatarUrl,
              channelUrl: formChannelUrl.trim() || (h as any).channelUrl || undefined,
              mode: formMode,
              category: formMode === "custom" ? formCategory : undefined,
              customTitle: formMode === "custom" ? title : undefined,
            };
          }

          if (hasChannelChange && realLessonId && realLessonId !== "custom" && h.lessonId === realLessonId) {
            return {
              ...h,
              channelName,
              channelAvatarUrl,
              channelUrl: formChannelUrl.trim() || (h as any).channelUrl || undefined,
              coverUrl: h.coverUrl || preservedCoverUrl,
            };
          }

          return h;
        });

        // 1. Direct atomic write to SQLite on server for history
        const histRes = await fetch(resolveApiUrl(`/api/history/${entry.id}`), {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            lessonId,
            lessonTitle: title,
            targetLanguage: targetLang,
            coverUrl: preservedCoverUrl,
            lessonType,
            actionType: formActionType,
            status: formStatus,
            durationSeconds,
            notes: formNotes.trim(),
            tags: parsedTags,
            timestamp,
            channelName,
            channelAvatarUrl,
            channelUrl: formChannelUrl.trim() || undefined,
            mode: formMode,
            category: formMode === "custom" ? formCategory : undefined,
            customTitle: formMode === "custom" ? title : undefined,
          }),
        });

        if (!histRes.ok) {
          throw new Error(`Server returned ${histRes.status}`);
        }

        // 2. Also patch the lesson if linked
        if (realLessonId && realLessonId !== "custom") {
          await fetch(resolveApiUrl(`/api/lessons/${realLessonId}`), {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              channelTitle: channelName,
              channelName: channelName,
              channelAvatar: channelAvatarUrl,
              channelAvatarUrl: channelAvatarUrl,
              channelUrl: formChannelUrl.trim() || undefined,
            }),
          }).catch((e) => console.warn("Failed to patch lesson:", e));
        }

        onUpdateHistory(updated);
        if (updatedLessons && onUpdateLessons) {
          onUpdateLessons(updatedLessons);
        }

        showToast(t('history_page.entry_saved', 'Запись успешно сохранена'), 'success');
        onClose();
      } else {
        const generatedId = generateHistoryId({
          durationSeconds,
          actionType: formActionType,
          source: "HistoryPage.handleSaveEntry",
        });

        if (!generatedId) {
          showToast(t('history_page.invalid_duration', 'Время активности должно быть больше 0'), 'error');
          setIsSavingEntry(false);
          return;
        }

        const newEntry: HistoryEntry = {
          id: generatedId,
          lessonId,
          lessonTitle: title,
          targetLanguage: targetLang,
          coverUrl,
          lessonType,
          actionType: formActionType,
          status: formStatus,
          durationSeconds,
          notes: formNotes.trim(),
          tags: parsedTags,
          timestamp,
          channelName,
          channelAvatarUrl,
          channelUrl: formChannelUrl.trim() || undefined,
          mode: formMode,
          category: formMode === "custom" ? formCategory : undefined,
          customTitle: formMode === "custom" ? title : undefined,
        };

        const createRes = await fetch(resolveApiUrl(`/api/history/${newEntry.id}`), {
          method: "PATCH",
          headers,
          body: JSON.stringify(newEntry),
        });

        if (!createRes.ok) {
          throw new Error(`Server returned ${createRes.status}`);
        }

        if (lessonId && lessonId !== "custom") {
          await fetch(resolveApiUrl(`/api/lessons/${lessonId}`), {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              channelTitle: channelName,
              channelName: channelName,
              channelAvatar: channelAvatarUrl,
              channelAvatarUrl: channelAvatarUrl,
              channelUrl: formChannelUrl.trim() || undefined,
            }),
          }).catch((e) => console.warn("Failed to patch lesson channel:", e));
        }

        const updated = [newEntry, ...history];
        onUpdateHistory(updated);
        if (updatedLessons && onUpdateLessons) {
          onUpdateLessons(updatedLessons);
        }

        showToast(t('history_page.entry_created', 'Новая запись добавлена'), 'success');
        onClose();
      }
    } catch (err: any) {
      console.error("Failed to save history entry:", err);
      showToast(t('history_page.save_error', 'Не удалось сохранить запись'), 'error');
    } finally {
      setIsSavingEntry(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 font-sans">
        {/* 1. Fixed Modal Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              {entry ? t('history_page.edit_entry_title', "Edit History Entry") : t('history_page.add_entry_title', "Add New Record")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Form with scrollable body and fixed footer */}
        <form onSubmit={handleSaveEntry} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {/* Mode Switcher: Library Lesson vs Custom Activity */}
            <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl gap-1 border border-zinc-200/60 dark:border-zinc-700/60 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setFormMode("library");
                  if (!formLessonId && lessons.length > 0) {
                    setFormLessonId(lessons[0].id);
                    setFormCustomTitle(lessons[0].title);
                  }
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  formMode === "library"
                    ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/80 dark:border-zinc-700"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{t('history_page.mode_library', 'Library Lesson')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormMode("custom");
                  if (formActionType === "read" && formCategory === "video") {
                    setFormActionType("listen");
                  }
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  formMode === "custom"
                    ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/80 dark:border-zinc-700"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('history_page.mode_custom', 'Custom Activity')}</span>
              </button>
            </div>

            {/* Mode: Library Lesson */}
            {formMode === "library" ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.select_lesson', 'Select Lesson')}
                </label>
                <select
                  value={formLessonId}
                  onChange={(e) => {
                    setFormLessonId(e.target.value);
                    const l = lessons.find((item) => item.id === e.target.value);
                    if (l) setFormCustomTitle(l.title);
                  }}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                >
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.channelName ? `[${l.channelName}] ` : ""}{l.title} ({l.targetLanguage})
                    </option>
                  ))}
                  <option value="custom">{t('history_page.custom_lesson', '-- Custom Lesson / Custom Name --')}</option>
                </select>

                {/* Selected Lesson Channel Badge */}
                {(() => {
                  const currentSelected = lessons.find((l) => l.id === formLessonId);
                  const chName = currentSelected?.channelName || (entry?.lessonId === formLessonId ? entry?.channelName : null);
                  const chAvatar = currentSelected?.channelAvatarUrl || (entry?.lessonId === formLessonId ? entry?.channelAvatarUrl : null);
                  if (!chName) return null;
                  return (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 px-2.5 py-1 rounded-lg border border-amber-200/60 dark:border-amber-900/50 flex items-center gap-2 shadow-3xs">
                        {chAvatar ? (
                          <img
                            src={chAvatar}
                            alt=""
                            className="w-4 h-4 rounded-full object-cover shrink-0 border border-amber-300 dark:border-amber-700"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <Radio className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{chName}</span>
                      </span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Mode: Custom External Activity */
              <div className="space-y-3">
                {/* Custom Title Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    {t('history_page.activity_title', 'Activity Title')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomTitle}
                    onChange={(e) => setFormCustomTitle(e.target.value)}
                    placeholder={t('history_page.activity_title_placeholder', 'e.g. Netflix: Dark S01E01, Paper Book: El Quijote...')}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                  />
                </div>

                {/* Language Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    {t('history_page.language_select', 'Target Language')}
                  </label>
                  <select
                    value={formLanguage}
                    onChange={(e) => setFormLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                  >
                    {ACTIVITY_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.name}>
                        {lang.flag} {lang.name} ({lang.native})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category / Source Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    {t('history_page.activity_category', 'Category / Source')}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ACTIVITY_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isSelected = formCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setFormCategory(cat.id);
                            setFormActionType(cat.defaultActionType);
                          }}
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? "bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-700 dark:text-teal-300 font-bold shadow-xs ring-1 ring-teal-500/30"
                              : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cat.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] truncate leading-tight">
                            {t(cat.labelKey, cat.defaultLabel)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Custom Title if selected in library mode */}
            {formMode === "library" && formLessonId === "custom" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.lesson_name', 'Lesson / Activity Name')}
                </label>
                <input
                  type="text"
                  required
                  value={formCustomTitle}
                  onChange={(e) => setFormCustomTitle(e.target.value)}
                  placeholder={t('history_page.lesson_name_placeholder', 'Enter lesson or podcast name...')}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                />
              </div>
            )}

            {/* Channel / Author Section */}
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                    {t('import.channel', 'Channel / Author')}
                  </span>
                </div>
                {formChannelAvatarUrl && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src={formChannelAvatarUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                    />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">
                      {formChannelName}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    {t('import.channel_name_label', 'Channel / Author Name')}
                  </label>
                  <input
                    type="text"
                    list="modal-history-channels"
                    value={formChannelName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormChannelName(val);
                      const match = existingChannels.find((c) => c.name.toLowerCase() === val.trim().toLowerCase());
                      if (match) {
                        if (match.avatarUrl) setFormChannelAvatarUrl(match.avatarUrl);
                        if (match.channelUrl) setFormChannelUrl(match.channelUrl);
                      }
                    }}
                    placeholder={t('import.channel_name_placeholder', 'e.g. Andrea la Mexicana, Mr Salas')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-semibold"
                  />
                  <datalist id="modal-history-channels">
                    {existingChannels.map((c) => (
                      <option key={c.name} value={c.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    {t('import.channel_url_label', 'Channel URL (YouTube)')}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={formChannelUrl}
                      onChange={(e) => setFormChannelUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleResolveFormChannel();
                        }
                      }}
                      placeholder="https://youtube.com/@Channel"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveFormChannel()}
                      disabled={isResolvingFormChannel || !formChannelUrl.trim()}
                      className="px-2.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {isResolvingFormChannel ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <span>{t('import.resolve_channel_btn', 'Find')}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Type & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.activity_type', 'Activity Type')}
                </label>
                <select
                  value={formActionType}
                  onChange={(e) => setFormActionType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                >
                  <option value="read">{t('history_page.type_reading', '📖 Reading')}</option>
                  <option value="listen">{t('history_page.type_listening', '🎧 Listening')}</option>
                  <option value="study">{t('history_page.type_study', '✍️ Study / Grammar')}</option>
                  <option value="speak">{t('history_page.type_speaking', '🗣️ Speaking')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.lesson_status', 'Lesson Status')}
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                >
                  <option value="in_progress">{t('history_page.status_in_progress', '⏳ In Progress')}</option>
                  <option value="completed">{t('history_page.status_completed', '✅ Completed')}</option>
                </select>
              </div>
            </div>

            {/* Duration & Date & 24h Time */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.duration_mins', 'Duration (Minutes)')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={formMinutes}
                  onChange={(e) => setFormMinutes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.date_label', 'Date')}
                </label>
                <AppDatePicker
                  value={formDateOnly}
                  onChange={setFormDateOnly}
                  className="w-full"
                  inputClassName="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  {t('history_page.time_label', '24h Time (H : M)')}
                </label>
                <AppTimePicker
                  value={formTime}
                  onChange={setFormTime}
                  placeholder="14:30"
                  className="w-full"
                  inputClassName="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 font-semibold"
                />
              </div>
            </div>

            {/* Optional Notes & Tags */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                {t('history_page.personal_notes', 'Personal Notes / Session Comments')}
              </label>
              <textarea
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={t('history_page.notes_placeholder', 'Add your impressions, progress, or notes...')}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                {t('history_page.tags_label', 'Tags (comma separated)')}
              </label>
              <input
                type="text"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder={t('history_page.tags_placeholder', 'E.g.: Grammar, Podcast, Vocabulary')}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-sans"
              />
            </div>
          </div>

          {/* 3. Fixed Modal Footer */}
          <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-850/80 backdrop-blur-xs flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {t('history_page.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSavingEntry}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              {isSavingEntry ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('app.saving', 'Сохранение...')}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('history_page.save', 'Save')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditHistoryModal;
