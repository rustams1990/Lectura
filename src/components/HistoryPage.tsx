/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, memo } from "react";
import { HistoryEntry, Lesson, ReaderSettings, ActivitySourceMode, CustomActivityCategory } from "../types";
import { 
  History, 
  Search, 
  BookOpen, 
  Headphones, 
  CheckCircle2, 
  Trash2, 
  Pencil, 
  Plus, 
  Clock, 
  Calendar, 
  MessageSquare, 
  Sparkles, 
  ArrowRight, 
  X, 
  Check, 
  Globe, 
  FileText,
  Tag,
  Target,
  Flame,
  Play,
  Radio,
  Tv,
  Mic,
  Volume2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PieChart,
  Activity
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCategoryIcon } from "./ImportLessonForm";
import { formatDateTime, resolveLocale } from "../utils/dateUtils";
import { formatAppDate, formatAppDateTime, formatAppTime } from "../utils/dateFormatter";
import { AppDatePicker } from "./common/AppDatePicker";

const ITEMS_PER_PAGE = 10;

const getPageNumbers = (current: number, total: number) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
};

const ACTIVITY_LANGUAGES = [
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
  { code: "kk", name: "Kazakh", native: "Қазақша", flag: "🇰🇿" }
];

const ACTIVITY_CATEGORIES: Array<{
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

interface HistoryPageProps {
  history: HistoryEntry[];
  lessons: Lesson[];
  onOpenLesson: (lessonId: string) => void;
  onUpdateHistory: (updatedHistory: HistoryEntry[]) => void;
  readerSettings: ReaderSettings;
  onUpdateSettings: (newSettings: ReaderSettings) => void;
}

function HistoryPage({
  history,
  lessons,
  onOpenLesson,
  onUpdateHistory,
  readerSettings,
  onUpdateSettings,
}: HistoryPageProps) {
  const { t, i18n } = useTranslation();
  const [filterType, setFilterType] = useState<"all" | "read" | "listen" | "complete">("all");
  const [selectedPeriod, setSelectedPeriod] = useState<"all" | "today" | "yesterday" | "last7" | "thisMonth" | "custom">("all");
  const [customDate, setCustomDate] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [channelsLimit, setChannelsLimit] = useState<number | "all">(5);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedPeriod, customDate, selectedLanguage, selectedMonth, searchQuery, selectedTag]);

  const availableTags = useMemo(() => {
    const tagsSet = new Set<string>();
    history.forEach((h) => {
      if (h.tags) {
        h.tags.forEach((t) => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet).sort();
  }, [history]);

  // Helper to reliably resolve a history item's target language
  const getItemLanguage = React.useCallback((item: HistoryEntry): string => {
    if (!item) return "Spanish";
    const lesson = lessons.find((l) => l.id === item.lessonId);
    if (lesson && lesson.targetLanguage && lesson.targetLanguage.trim()) {
      return lesson.targetLanguage.trim();
    }
    if (item.targetLanguage && item.targetLanguage.trim()) {
      return item.targetLanguage.trim();
    }
    return "Spanish";
  }, [lessons]);

  // Extract unique available target languages present in history
  const availableLanguages = useMemo(() => {
    const langsSet = new Set<string>();
    history.forEach((h) => {
      const lang = getItemLanguage(h);
      if (lang) langsSet.add(lang);
    });
    return Array.from(langsSet).sort();
  }, [history, getItemLanguage]);

  // Extract unique available months from history (e.g. ["2026-07", "2026-06"])
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    history.forEach((h) => {
      if (h.timestamp) {
        const d = new Date(h.timestamp);
        if (!isNaN(d.getTime())) {
          monthsSet.add(d.toISOString().slice(0, 7));
        }
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [history]);

  const [selectedChannel, setSelectedChannel] = useState<string>("all");

  // Month navigation helpers
  const formatMonthName = (monthKey: string) => {
    if (monthKey === "all") return t('history_page.all_months', "All Time");
    try {
      const [year, month] = monthKey.split("-");
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      return d.toLocaleDateString(resolveLocale(i18n.language), { month: "long", year: "numeric" });
    } catch {
      return monthKey;
    }
  };

  // Modal states for Editing / Creating History Entry
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form states for Modal
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
  const [formTime, setFormTime] = useState("12:00");
  const [formTags, setFormTags] = useState("");

  // Populate form when editing an entry
  const startEditEntry = (entry: HistoryEntry) => {
    setEditingEntry(entry);
    const isCustom = entry.mode === "custom" || entry.lessonId === "custom" || !lessons.some((l) => l.id === entry.lessonId);
    setFormMode(isCustom ? "custom" : "library");
    setFormCategory(entry.category || "video");
    setFormLessonId(entry.lessonId);
    setFormCustomTitle(entry.customTitle || entry.lessonTitle);
    setFormLanguage(entry.targetLanguage || "Spanish");
    setFormActionType(entry.actionType || "read");
    setFormStatus((entry.status === "completed" || entry.actionType === "complete") ? "completed" : "in_progress");
    setFormMinutes(Math.round((entry.durationSeconds || 0) / 60).toString());
    setFormNotes(entry.notes || "");
    setFormTags(entry.tags ? entry.tags.join(", ") : "");

    const d = new Date(entry.timestamp);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setFormDateOnly(`${yyyy}-${mm}-${dd}`);
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      setFormTime(`${hh}:${min}`);
    } else {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setFormDateOnly(`${yyyy}-${mm}-${dd}`);
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setFormTime(`${hh}:${min}`);
    }
  };

  // Reset form when opening create modal
  const startCreateEntry = () => {
    setEditingEntry(null);
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

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    setFormDateOnly(`${yyyy}-${mm}-${dd}`);
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    setFormTime(`${hh}:${min}`);
    setIsCreateModalOpen(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const durationSeconds = Math.max(0, (parseInt(formMinutes, 10) || 0) * 60);

    let title = "";
    let targetLang = "Spanish";
    let coverUrl: string | null = null;
    let lessonType = "article";
    let channelName: string | null = null;
    let channelAvatarUrl: string | null = null;
    let lessonId = "custom";

    if (formMode === "library") {
      const selectedLesson = lessons.find((l) => l.id === formLessonId);
      title = selectedLesson ? selectedLesson.title : (formCustomTitle.trim() || t('history_page.lesson_default_short', "Lesson"));
      targetLang = selectedLesson ? selectedLesson.targetLanguage : (formLanguage || "Spanish");
      coverUrl = selectedLesson ? selectedLesson.coverUrl : null;
      lessonType = selectedLesson ? (selectedLesson.lessonType || "article") : "article";
      channelName = selectedLesson ? (selectedLesson.channelName || null) : null;
      channelAvatarUrl = selectedLesson ? (selectedLesson.channelAvatarUrl || null) : null;
      lessonId = formLessonId || "custom";
    } else {
      // Custom Activity
      title = formCustomTitle.trim() || t('history_page.custom_activity_default', "Custom Activity");
      targetLang = formLanguage || "Spanish";
      lessonId = "custom";
      lessonType = formCategory;
      channelName = null;
      channelAvatarUrl = null;
    }

    let timestamp = new Date().toISOString();
    if (formDateOnly) {
      const timeStr = formTime && formTime.includes(":") ? formTime : "00:00";
      const parsed = new Date(`${formDateOnly}T${timeStr}:00`);
      if (!isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    }

    const parsedTags = formTags.split(",").map(t => t.trim()).filter(Boolean);

    if (editingEntry) {
      // Update existing entry
      const updated = history.map((h) =>
        h.id === editingEntry.id
          ? {
              ...h,
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
              mode: formMode,
              category: formMode === "custom" ? formCategory : undefined,
              customTitle: formMode === "custom" ? title : undefined,
            }
          : h
      );
      onUpdateHistory(updated);
      setEditingEntry(null);
    } else {
      // Create new entry
      const newEntry: HistoryEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
        mode: formMode,
        category: formMode === "custom" ? formCategory : undefined,
        customTitle: formMode === "custom" ? title : undefined,
      };
      onUpdateHistory([newEntry, ...history]);
      setIsCreateModalOpen(false);
    }
  };

  const handleDeleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('history_page.confirm_delete', "Are you sure you want to delete this record from history?"))) {
      onUpdateHistory(history.filter((h) => h.id !== id));
    }
  };

  // Deduplicated base history (merges duplicate read/listen entries within 30 minutes)
  const deduplicatedHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const sorted = [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const merged: HistoryEntry[] = [];

    for (const item of sorted) {
      const lesson = lessons.find((l) => l.id === item.lessonId);
      const savedProg = localStorage.getItem(`vocab_progress_${item.lessonId}`);
      let isProg100 = false;
      if (savedProg) {
        try {
          const parsed = JSON.parse(savedProg);
          const val = typeof parsed === "number" ? parsed : (parsed && typeof parsed === "object" && parsed.progress !== undefined) ? parseFloat(parsed.progress) : parseFloat(savedProg);
          isProg100 = !isNaN(val) && val >= 100;
        } catch (_) {
          isProg100 = parseFloat(savedProg) >= 100;
        }
      }
      const isLessonDone =
        item.status === "completed" ||
        item.actionType === "complete" ||
        isProg100 ||
        (lesson && ((lesson as any).isCompleted || (lesson as any).readCount > 0 || (lesson as any).progress >= 100));

      const isAudioOrVideoLesson =
        (lesson && (!!lesson.youtubeId || !!lesson.audioUrl || !!lesson.audioBase64 || lesson.lessonType === "podcast" || lesson.lessonType === "youtube" || lesson.lessonType === "audio")) ||
        item.lessonType === "youtube" ||
        item.lessonType === "podcast" ||
        item.lessonType === "audio" ||
        item.actionType === "listen";

      const isCustomActivity = item.mode === "custom" || item.lessonId === "custom" || !lesson;

      const itemWithStatus: HistoryEntry = {
        ...item,
        actionType: item.actionType || (isAudioOrVideoLesson ? "listen" : "read"),
        status: isLessonDone ? "completed" : (item.status || "in_progress"),
      };

      const existingIdx = merged.findIndex((m) => {
        if (isCustomActivity) {
          return (
            m.id === item.id ||
            (m.lessonId === "custom" &&
              m.customTitle === item.customTitle &&
              m.category === item.category &&
              m.actionType === item.actionType &&
              Math.abs(new Date(m.timestamp).getTime() - new Date(item.timestamp).getTime()) < 30 * 60 * 1000)
          );
        }
        return (
          m.lessonId === item.lessonId &&
          m.actionType === item.actionType &&
          Math.abs(new Date(m.timestamp).getTime() - new Date(item.timestamp).getTime()) < 30 * 60 * 1000
        );
      });

      if (existingIdx !== -1) {
        const existing = merged[existingIdx];
        const isCompleted =
          existing.status === "completed" ||
          itemWithStatus.status === "completed" ||
          existing.actionType === "complete" ||
          itemWithStatus.actionType === "complete";

        merged[existingIdx] = {
          ...existing,
          actionType: item.actionType || existing.actionType,
          status: isCompleted ? "completed" : (existing.status || "in_progress"),
          durationSeconds: Math.max(existing.durationSeconds || 0, itemWithStatus.durationSeconds || 0),
          notes: existing.notes || itemWithStatus.notes,
          tags: existing.tags || itemWithStatus.tags,
        };
      } else {
        merged.push(itemWithStatus);
      }
    }
    return merged;
  }, [history, lessons]);

  // Aggregate stats scoped to selected period, language & month
  const scopedHistory = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString("en-CA");
    const currentMonthKey = new Date().toISOString().slice(0, 7);

    return deduplicatedHistory.filter((item) => {
      // Filter by language
      if (selectedLanguage !== "all") {
        const itemLang = getItemLanguage(item);
        if (itemLang.toLowerCase() !== selectedLanguage.toLowerCase()) {
          return false;
        }
      }

      // Filter by tag
      if (selectedTag !== "all") {
        if (!item.tags || !item.tags.includes(selectedTag)) {
          return false;
        }
      }

      // Filter by month selector if set
      if (selectedMonth !== "all") {
        try {
          const itemMonthKey = new Date(item.timestamp).toISOString().slice(0, 7);
          if (itemMonthKey !== selectedMonth) return false;
        } catch {
          return false;
        }
      }

      // Filter by Period / Day
      if (selectedPeriod === "today") {
        const itemDateStr = new Date(item.timestamp).toLocaleDateString("en-CA");
        return itemDateStr === todayStr;
      }
      if (selectedPeriod === "yesterday") {
        const itemDateStr = new Date(item.timestamp).toLocaleDateString("en-CA");
        return itemDateStr === yesterdayStr;
      }
      if (selectedPeriod === "last7") {
        const itemTime = new Date(item.timestamp).getTime() || 0;
        return Date.now() - itemTime <= 7 * 24 * 3600 * 1000;
      }
      if (selectedPeriod === "thisMonth") {
        const itemMonthKey = new Date(item.timestamp).toISOString().slice(0, 7);
        return itemMonthKey === currentMonthKey;
      }
      if (selectedPeriod === "custom" && customDate) {
        const itemDateStr = new Date(item.timestamp).toLocaleDateString("en-CA");
        return itemDateStr === customDate;
      }

      return true;
    });
  }, [deduplicatedHistory, selectedPeriod, customDate, selectedLanguage, selectedMonth, selectedTag, getItemLanguage]);

  // Goals and Streaks logic
  const isGlobalGoal = selectedLanguage === "all";
  const activeGoalMinutes = useMemo(() => {
    if (isGlobalGoal) {
      const goals = readerSettings?.dailyGoalsByLanguage;
      if (goals && Object.keys(goals).length > 0) {
        const sum = Object.values(goals).reduce((acc, g) => acc + (Number(g) || 0), 0);
        if (sum > 0) return sum;
      }
      return readerSettings?.dailyGoalMinutes ?? 15;
    }

    // Specific language
    const goals = readerSettings?.dailyGoalsByLanguage || {};
    const match = Object.entries(goals).find(([k]) => k.toLowerCase() === selectedLanguage.toLowerCase());
    if (match && typeof match[1] === "number") {
      return match[1];
    }
    return readerSettings?.dailyGoalMinutes ?? 15;
  }, [isGlobalGoal, selectedLanguage, readerSettings?.dailyGoalsByLanguage, readerSettings?.dailyGoalMinutes]);
  
  const { currentStreak, todayMinutes, isGoalMetToday } = useMemo(() => {
    if (!history || history.length === 0 || activeGoalMinutes === 0) {
       return { currentStreak: 0, todayMinutes: 0, isGoalMetToday: false };
    }
    
    // Aggregate seconds per day
    const dayTotalsSecs: Record<string, number> = {};
    deduplicatedHistory.forEach(item => {
      const itemLang = getItemLanguage(item);
      if (!isGlobalGoal && itemLang.toLowerCase() !== selectedLanguage.toLowerCase()) return;
      if (!item.durationSeconds) return;
      const d = new Date(item.timestamp);
      if (isNaN(d.getTime())) return;
      const dateStr = d.toLocaleDateString("en-CA");
      dayTotalsSecs[dateStr] = (dayTotalsSecs[dateStr] || 0) + (item.durationSeconds || 0);
    });

    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA");
    const todaySecs = dayTotalsSecs[todayStr] || 0;
    const todayMins = Math.floor(todaySecs / 60);
    const targetGoalSecs = activeGoalMinutes * 60;
    const metToday = todaySecs >= targetGoalSecs;

    let streak = 0;
    let checkDate = new Date();
    if (!metToday) {
       checkDate.setDate(checkDate.getDate() - 1);
       const yestStr = checkDate.toLocaleDateString("en-CA");
       if (!dayTotalsSecs[yestStr] || dayTotalsSecs[yestStr] < targetGoalSecs) {
         return { currentStreak: 0, todayMinutes: todayMins, isGoalMetToday: metToday };
       }
    }

    while (true) {
       const dStr = checkDate.toLocaleDateString("en-CA");
       if ((dayTotalsSecs[dStr] || 0) >= targetGoalSecs) {
         streak++;
         checkDate.setDate(checkDate.getDate() - 1);
       } else {
         break;
       }
    }

    return { currentStreak: streak, todayMinutes: todayMins, isGoalMetToday: metToday };
  }, [deduplicatedHistory, activeGoalMinutes, isGlobalGoal, selectedLanguage, getItemLanguage]);

  // Dynamic Goal Progress according to selected period filter
  const goalPeriodStats = useMemo(() => {
    const isSingleDay = selectedPeriod === "today" || selectedPeriod === "yesterday" || (selectedPeriod === "custom" && !!customDate);

    if (isSingleDay) {
      const selectedDaySeconds = scopedHistory.reduce((acc, r) => acc + (r.durationSeconds || 0), 0);
      const selectedDayMinutes = Math.floor(selectedDaySeconds / 60);
      const isMet = activeGoalMinutes > 0 && selectedDaySeconds >= activeGoalMinutes * 60;
      const percent = activeGoalMinutes > 0 ? Math.min(100, (selectedDayMinutes / activeGoalMinutes) * 100) : 0;

      let label = t('history_page.today', "Today");
      if (selectedPeriod === "yesterday") label = t('history_page.yesterday', "Yesterday");
      else if (selectedPeriod === "custom" && customDate) label = customDate;

      return {
        isSingleDay: true,
        minutes: selectedDayMinutes,
        isGoalMet: isMet,
        percent,
        progressText: `${label}: ${selectedDayMinutes} / ${activeGoalMinutes} min`,
      };
    }

    // For multi-day ranges (All Time, Last 7 Days, This Month, etc.):
    const percent = activeGoalMinutes > 0 ? Math.min(100, (todayMinutes / activeGoalMinutes) * 100) : 0;
    return {
      isSingleDay: false,
      minutes: todayMinutes,
      isGoalMet: isGoalMetToday,
      percent,
      progressText: `${t('history_page.today', 'Today')}: ${todayMinutes} / ${activeGoalMinutes} min`,
    };
  }, [selectedPeriod, customDate, scopedHistory, activeGoalMinutes, todayMinutes, isGoalMetToday, t]);

  // Language Analytics
  const languageStats = useMemo(() => {
    const stats: Record<string, { duration: number; percent: number; color: string }> = {};
    let total = 0;
    
    scopedHistory.forEach(item => {
      if (!item.durationSeconds) return;
      const lang = getItemLanguage(item);
      stats[lang] = stats[lang] || { duration: 0, percent: 0, color: "" };
      stats[lang].duration += item.durationSeconds;
      total += item.durationSeconds;
    });

    if (total === 0) return [];
    
    const colors = ["bg-sky-500", "bg-indigo-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500"];
    
    return Object.entries(stats)
      .sort((a, b) => b[1].duration - a[1].duration)
      .map(([lang, data], i) => ({
        lang,
        duration: data.duration,
        percent: (data.duration / total) * 100,
        color: colors[i % colors.length]
      }));
  }, [scopedHistory, getItemLanguage]);

  // Activity Breakdown Stats (for Donut Chart)
  const activityBreakdown = useMemo(() => {
    let listeningSec = 0;
    let grammarSec = 0;
    let readingSec = 0;
    let speakingSec = 0;

    scopedHistory.forEach((item) => {
      const dur = item.durationSeconds || 0;
      const actionType = (item.actionType || "").toLowerCase();
      const category = (item.category || "").toLowerCase();
      const lesson = lessons.find((l) => l.id === item.lessonId);
      const lessonType = (item.lessonType || lesson?.lessonType || "").toLowerCase();

      if (actionType === "study" || actionType === "grammar" || category === "grammar") {
        grammarSec += dur;
      } else if (actionType === "speak" || actionType === "speaking" || category === "speaking") {
        speakingSec += dur;
      } else if (
        actionType === "listen" ||
        actionType === "listening" ||
        category === "podcast" ||
        category === "video" ||
        lessonType === "podcast" ||
        lessonType === "youtube" ||
        lessonType === "audio" ||
        !!lesson?.audioUrl ||
        !!lesson?.youtubeId
      ) {
        listeningSec += dur;
      } else {
        readingSec += dur;
      }
    });

    const total = listeningSec + grammarSec + readingSec + speakingSec;

    const items = [
      {
        id: "listening",
        label: t('history_page.activity_listening', 'Listening'),
        seconds: listeningSec,
        percent: total > 0 ? (listeningSec / total) * 100 : 0,
        colorHex: "#8b5cf6",
        badgeBg: "bg-purple-500",
        textColor: "text-purple-600 dark:text-purple-400"
      },
      {
        id: "grammar",
        label: t('history_page.activity_grammar', 'Grammar / Study'),
        seconds: grammarSec,
        percent: total > 0 ? (grammarSec / total) * 100 : 0,
        colorHex: "#10b981",
        badgeBg: "bg-emerald-500",
        textColor: "text-emerald-600 dark:text-emerald-400"
      },
      {
        id: "reading",
        label: t('history_page.activity_reading', 'Reading'),
        seconds: readingSec,
        percent: total > 0 ? (readingSec / total) * 100 : 0,
        colorHex: "#3b82f6",
        badgeBg: "bg-blue-500",
        textColor: "text-blue-600 dark:text-blue-400"
      },
      {
        id: "speaking",
        label: t('history_page.activity_speaking', 'Speaking'),
        seconds: speakingSec,
        percent: total > 0 ? (speakingSec / total) * 100 : 0,
        colorHex: "#f59e0b",
        badgeBg: "bg-amber-500",
        textColor: "text-amber-600 dark:text-amber-400"
      },
    ].filter(i => i.seconds > 0);

    return {
      totalSeconds: total,
      items,
    };
  }, [scopedHistory, lessons, t]);

  // Channel / Source Analytics
  const channelStats = useMemo(() => {
    // 1. Build author avatar directory with strict YouTube avatar priority
    const authorAvatarMap = new Map<string, string>();
    lessons.forEach((l) => {
      if (l.channelName) {
        const key = l.channelName.trim().toLowerCase();
        // Priority 1: Explicit YouTube / channel author portrait
        if (l.channelAvatarUrl) {
          authorAvatarMap.set(key, l.channelAvatarUrl);
        } else if (!authorAvatarMap.has(key) && (l.youtubeId || l.lessonType === "youtube") && l.coverUrl) {
          // Priority 2: YouTube lesson cover
          authorAvatarMap.set(key, l.coverUrl);
        } else if (!authorAvatarMap.has(key) && l.coverUrl) {
          // Priority 3: Fallback cover
          authorAvatarMap.set(key, l.coverUrl);
        }
      }
    });

    const channelMap: Record<
      string,
      {
        name: string;
        avatarUrl?: string | null;
        durationSeconds: number;
        lessonIds: Set<string>;
        sessionCount: number;
      }
    > = {};

    let totalDuration = 0;

    scopedHistory.forEach((item) => {
      const lesson = lessons.find((l) => l.id === item.lessonId);
      let rawName: string | null =
        lesson?.channelName?.trim() ||
        item.channelName?.trim() ||
        null;

      // If channel name is missing, attempt to extract author from title formats (e.g. "Author - Title" or "Title | Author")
      if (!rawName) {
        const titleToParse = item.lessonTitle || lesson?.title || "";
        if (titleToParse.includes(" - ")) {
          const parts = titleToParse.split(" - ");
          if (parts[0].trim().length > 1 && parts[0].trim().length < 40) {
            rawName = parts[0].trim();
          }
        } else if (titleToParse.includes(" | ")) {
          const parts = titleToParse.split(" | ");
          const lastPart = parts[parts.length - 1].trim();
          if (lastPart.length > 1 && lastPart.length < 40) {
            rawName = lastPart;
          }
        }
      }

      // If still not identified, show individual video title so items don't get lumped together into a generic bucket
      if (!rawName) {
        rawName = item.lessonTitle || lesson?.title || t("history_page.unknown_author", "Unknown Author");
      }

      if (!rawName) return;

      const trimmedName = rawName.trim();
      const normKey = trimmedName.toLowerCase();

      // Prioritize round author portrait from YouTube directory
      const avatarUrl =
        authorAvatarMap.get(normKey) ||
        lesson?.channelAvatarUrl ||
        item.channelAvatarUrl ||
        lesson?.coverUrl ||
        item.coverUrl ||
        null;

      if (!channelMap[normKey]) {
        channelMap[normKey] = {
          name: trimmedName,
          avatarUrl,
          durationSeconds: 0,
          lessonIds: new Set<string>(),
          sessionCount: 0,
        };
      } else {
        // Keep best display name (prefer explicit channelName over fallback title)
        if (lesson?.channelName && channelMap[normKey].name !== lesson.channelName.trim()) {
          channelMap[normKey].name = lesson.channelName.trim();
        }
        // Always prioritize YouTube avatar if directory has one
        if (authorAvatarMap.has(normKey)) {
          channelMap[normKey].avatarUrl = authorAvatarMap.get(normKey);
        } else if (!channelMap[normKey].avatarUrl && avatarUrl) {
          channelMap[normKey].avatarUrl = avatarUrl;
        }
      }

      const dur = item.durationSeconds || 0;
      channelMap[normKey].durationSeconds += dur;
      channelMap[normKey].sessionCount += 1;
      if (item.lessonId) {
        channelMap[normKey].lessonIds.add(item.lessonId);
      }
      totalDuration += dur;
    });

    const list = Object.values(channelMap).map((ch) => ({
      name: ch.name,
      avatarUrl: ch.avatarUrl,
      durationSeconds: ch.durationSeconds,
      videoCount: ch.lessonIds.size || ch.sessionCount,
      sharePercent: totalDuration > 0 ? (ch.durationSeconds / totalDuration) * 100 : 0,
    }));

    return list.sort((a, b) => b.durationSeconds - a.durationSeconds);
  }, [scopedHistory, lessons, t]);

  const [isChannelsExpanded, setIsChannelsExpanded] = useState(false);

  const displayedChannels = useMemo(() => {
    if (isChannelsExpanded) return channelStats;
    return channelStats.slice(0, 3);
  }, [channelStats, isChannelsExpanded]);

  // Dynamic card title
  const timeCardTitle = useMemo(() => {
    let periodLabel = t('history_page.period_all', "Total Time");
    if (selectedPeriod === "today") periodLabel = t('history_page.period_today', "Today's Time");
    else if (selectedPeriod === "yesterday") periodLabel = t('history_page.period_yesterday', "Yesterday's Time");
    else if (selectedPeriod === "last7") periodLabel = t('history_page.period_last7', "Last 7 Days Time");
    else if (selectedPeriod === "thisMonth") periodLabel = t('history_page.period_this_month', "This Month's Time");
    else if (selectedPeriod === "custom" && customDate) periodLabel = t('history_page.period_custom', "Time for {{date}}", { date: customDate });
    else if (selectedMonth !== "all") periodLabel = t('history_page.period_month', "Time for {{month}}", { month: formatMonthName(selectedMonth) });

    if (selectedLanguage !== "all") {
      return `${periodLabel} (${selectedLanguage})`;
    }
    return periodLabel;
  }, [selectedPeriod, customDate, selectedMonth, selectedLanguage]);

  // Filter & Sort entries (NEWEST FIRST: descending timestamp)
  const filteredHistory = useMemo(() => {
    const list = scopedHistory.filter((item) => {
      const isCompleted = item.status === "completed" || item.actionType === "complete";
      if (filterType === "read" && item.actionType === "listen") {
        return false;
      }
      if (filterType === "listen" && item.actionType !== "listen") {
        return false;
      }
      if (filterType === "complete" && !isCompleted) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.lessonTitle.toLowerCase().includes(q);
        const matchesNote = (item.notes || "").toLowerCase().includes(q);
        const matchesLang = getItemLanguage(item).toLowerCase().includes(q);
        const matchedLesson = lessons.find((l) => l.id === item.lessonId);
        const matchesChannel =
          (item.channelName || "").toLowerCase().includes(q) ||
          (matchedLesson?.channelName || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesNote && !matchesLang && !matchesChannel) return false;
      }
      return true;
    });

    // SORT DESCENDING (Latest timestamp at top e.g. July 28 > July 27)
    return [...list].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });
  }, [scopedHistory, filterType, searchQuery, getItemLanguage, lessons]);

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedHistory = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredHistory.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredHistory, safeCurrentPage]);

  // Group paginated items by date
  const groupedHistory = useMemo(() => {
    const groups: { dateKey: string; items: HistoryEntry[] }[] = [];
    let currentKey = "";
    let currentItems: HistoryEntry[] = [];

    paginatedHistory.forEach((item) => {
      let key = "";
      try {
        const d = new Date(item.timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diffDays = Math.round((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          key = t("history_page.today", "Today");
        } else if (diffDays === 1) {
          key = t("history_page.yesterday", "Yesterday");
        } else {
          key = d.toLocaleDateString(i18n.language || "en-US", { day: "numeric", month: "short", year: "numeric" });
        }
      } catch {
        key = item.timestamp;
      }

      if (key !== currentKey) {
        if (currentItems.length > 0) {
          groups.push({ dateKey: currentKey, items: currentItems });
        }
        currentKey = key;
        currentItems = [item];
      } else {
        currentItems.push(item);
      }
    });

    if (currentItems.length > 0) {
      groups.push({ dateKey: currentKey, items: currentItems });
    }

    return groups;
  }, [paginatedHistory, t, i18n.language]);

  const totalSeconds = useMemo(() => {
    return scopedHistory.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
  }, [scopedHistory]);

  const readCount = useMemo(() => scopedHistory.filter((h) => h.actionType !== "listen").length, [scopedHistory]);
  const listenCount = useMemo(() => scopedHistory.filter((h) => h.actionType === "listen").length, [scopedHistory]);
  const completeCount = useMemo(() => scopedHistory.filter((h) => h.status === "completed" || h.actionType === "complete").length, [scopedHistory]);

  const formatDuration = (secs: number) => {
    if (!secs || secs <= 0) return `0${t('history_page.sec_short', 's')}`;
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (hrs > 0) return `${hrs}${t('history_page.hr_short', 'h')} ${mins}${t('history_page.min_short', 'min')}`;
    if (mins > 0) return `${mins}${t('history_page.min_short', 'min')} ${s > 0 ? `${s}${t('history_page.sec_short', 's')}` : ""}`;
    return `${s}${t('history_page.sec_short', 's')}`;
  };

  const formatDate = (isoStr: string) => {
    try {
      return formatAppDateTime(isoStr);
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12 animate-in fade-in duration-200 font-sans">
      {/* Top Header with Compact Action Bar & Global Dashboard Filters */}
      <div className="flex flex-col gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {t('history_page.title', 'Activity History')}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('history_page.subtitle', 'Complete log of your read lessons, listened podcasts, and completed materials.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={startCreateEntry}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-97"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('history_page.add_entry', 'Add Record')}</span>
            </button>
          </div>
        </div>

        {/* Global Dashboard Filters Bar: [All Languages], [All Time], [All Months], [All Tags] */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Language Selector */}
          {availableLanguages.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-3xs flex-1 sm:flex-none min-w-[130px]">
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer w-full"
              >
                <option value="all">{t('history_page.all_langs', '🌐 All Languages')}</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    🗣️ {lang}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Period Selector */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-3xs flex-1 sm:flex-none min-w-[140px]">
            <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <select
              value={selectedPeriod}
              onChange={(e) => {
                const val = e.target.value as any;
                setSelectedPeriod(val);
                if (val !== "all" && val !== "custom") {
                  setSelectedMonth("all");
                }
              }}
              className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer w-full"
            >
              <option value="all">{t('history_page.all_time', '🗓️ All Time')}</option>
              <option value="today">{t('history_page.today', '🔥 Today')}</option>
              <option value="yesterday">{t('history_page.yesterday', '⏳ Yesterday')}</option>
              <option value="last7">{t('history_page.last7', '📅 Last 7 Days')}</option>
              <option value="thisMonth">{t('history_page.this_month', '📆 This Month')}</option>
              <option value="custom">{t('history_page.custom_date', '📅 Choose Date...')}</option>
            </select>
          </div>

          {/* Custom Date Input */}
          {selectedPeriod === "custom" && (
            <AppDatePicker
              value={customDate}
              onChange={setCustomDate}
              allowClear
              placeholder={t('history_page.custom_date_ph', 'Choose date...')}
              className="flex-1 sm:flex-none min-w-[130px]"
              inputClassName="py-1.5"
            />
          )}

          {/* Month Selector */}
          {selectedPeriod === "all" && availableMonths.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-3xs flex-1 sm:flex-none min-w-[130px]">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer w-full"
              >
                <option value="all">{t('history_page.all_months_opt', 'All Months')}</option>
                {availableMonths.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    📅 {formatMonthName(mKey)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tags Selector */}
          {availableTags.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-3xs flex-1 sm:flex-none min-w-[120px]">
              <Tag className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer w-full"
              >
                <option value="all">{t('history_page.all_tags', '🏷️ All Tags')}</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reset Global Filters button */}
          {(selectedPeriod !== "all" || selectedLanguage !== "all" || selectedMonth !== "all" || customDate !== "" || selectedTag !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSelectedPeriod("all");
                setSelectedLanguage("all");
                setSelectedMonth("all");
                setCustomDate("");
                setSelectedTag("all");
              }}
              className="px-2.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/50 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              title={t('history_page.reset', 'Reset filters')}
            >
              <X className="w-3.5 h-3.5" />
              <span>{t('history_page.reset', 'Reset')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Unified Analytics Summary Bar (3 compact widgets) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Time & Sessions Widget */}
        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 flex flex-col justify-between shadow-3xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">
              {timeCardTitle}
            </span>
            <div className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-zinc-900 dark:text-zinc-100 mb-2">
            {formatDuration(totalSeconds)}
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <span className="flex items-center gap-1" title={t('history_page.reading_sessions', 'Reading')}>
              <BookOpen className="w-3 h-3 text-emerald-500" />
              <span>{readCount}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1" title={t('history_page.listenings', 'Listenings')}>
              <Headphones className="w-3 h-3 text-purple-500" />
              <span>{listenCount}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1" title={t('history_page.completed_count', 'Completed')}>
              <CheckCircle2 className="w-3 h-3 text-amber-500" />
              <span>{completeCount}</span>
            </span>
          </div>
        </div>

        {/* 2. Daily Goal Widget */}
        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 flex flex-col justify-between shadow-3xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">
                {isGlobalGoal 
                  ? t('history_page.total_daily_goal', "TOTAL DAILY GOAL:") 
                  : t('history_page.lang_goal_colon', "GOAL ({{lang}}):", { lang: selectedLanguage.toUpperCase() })}
              </span>
              {isGlobalGoal ? (
                <span 
                  className="bg-zinc-100 dark:bg-zinc-800 rounded-md text-[11px] font-bold text-zinc-700 dark:text-zinc-300 py-0.5 px-2 text-center select-none"
                  title={t('history_page.total_goal_hint', 'Total combined daily goal for all languages')}
                >
                  {activeGoalMinutes} <span className="text-[10px] text-zinc-400 font-bold">{t('history_page.min_short', 'min')}</span>
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={activeGoalMinutes}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      const currentGoals = readerSettings?.dailyGoalsByLanguage || {};
                      const existingKey = Object.keys(currentGoals).find(k => k.toLowerCase() === selectedLanguage.toLowerCase()) || selectedLanguage;
                      onUpdateSettings({
                        ...readerSettings,
                        dailyGoalsByLanguage: {
                          ...currentGoals,
                          [existingKey]: val
                        }
                      });
                    }}
                    className="bg-zinc-100 dark:bg-zinc-800 rounded-md text-[11px] font-bold text-zinc-700 dark:text-zinc-300 py-0.5 px-1.5 w-12 text-center outline-none focus:ring-1 focus:ring-teal-500"
                    title={t('history_page.goal_zero_hint', 'Enter 0 to disable')}
                  />
                  <span className="text-[10px] text-zinc-400 font-bold">{t('history_page.min_short', 'min')}</span>
                </div>
              )}
            </div>
            <div className={`p-1.5 rounded-lg ${activeGoalMinutes > 0 ? (goalPeriodStats.isGoalMet ? 'bg-orange-50 text-orange-500 dark:bg-orange-950/40' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800') : 'bg-zinc-100 text-zinc-300'}`}>
              <Flame className={`w-3.5 h-3.5 ${activeGoalMinutes > 0 && goalPeriodStats.isGoalMet ? 'animate-pulse' : ''}`} />
            </div>
          </div>

          <div className="my-1.5">
            <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden w-full relative">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${goalPeriodStats.isGoalMet ? 'bg-gradient-to-r from-orange-400 to-rose-500' : 'bg-teal-500'}`}
                style={{ width: `${goalPeriodStats.percent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <span className="text-zinc-500 dark:text-zinc-400">
              {goalPeriodStats.progressText}
            </span>
            <span className={`text-xs ${currentStreak > 0 ? 'text-orange-500 font-black' : 'text-zinc-400'}`}>
              {currentStreak > 0 ? `🔥 ${currentStreak}d` : t('history_page.no_streak', 'No streak yet')}
            </span>
          </div>
        </div>

        {/* 3. Activity Breakdown Widget (Donut Chart) */}
        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 flex flex-col justify-between shadow-3xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">
              {t('history_page.activity_breakdown', 'Activity Breakdown')}
            </span>
            <div className="p-1.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
              <PieChart className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center gap-3 my-auto py-1">
            {/* SVG Donut Chart with Center Text */}
            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="36"
                  className="text-zinc-100 dark:text-zinc-800/80 stroke-current"
                  strokeWidth="13"
                  fill="transparent"
                />
                {/* Segments */}
                {activityBreakdown.totalSeconds > 0 ? (
                  activityBreakdown.items.map((seg, idx) => {
                    const prevPercent = activityBreakdown.items.slice(0, idx).reduce((sum, p) => sum + p.percent, 0);
                    const circumference = 2 * Math.PI * 36; // ~226.195
                    const dashArray = `${(seg.percent * circumference) / 100} ${circumference}`;
                    const dashOffset = -((prevPercent * circumference) / 100);

                    return (
                      <circle
                        key={seg.id}
                        cx="50"
                        cy="50"
                        r="36"
                        stroke={seg.colorHex}
                        strokeWidth="13"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-700"
                      />
                    );
                  })
                ) : null}
              </svg>

              {/* Minimalist Center Icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Activity className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
              </div>
            </div>

            {/* Legend Column */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              {activityBreakdown.items.length > 0 ? (
                activityBreakdown.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-[10.5px] font-bold text-zinc-700 dark:text-zinc-200">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.colorHex }} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">
                      <span>{formatDuration(item.seconds)}</span>
                      <span className="text-zinc-400 dark:text-zinc-500">({Math.round(item.percent)}%)</span>
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-zinc-400 text-xs italic">{t('history_page.no_activity', 'No activity in period')}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <span className="text-zinc-500 dark:text-zinc-400">
              {activityBreakdown.items.length} {t('history_page.activity_types_count', 'activity types')}
            </span>
            <span className="text-zinc-400 text-[10px] uppercase tracking-wider font-extrabold">
              {t('history_page.period_breakdown', 'Period split')}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Channels & Sources Analytics Section */}
      {channelStats.length > 0 && (
        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 space-y-3 shadow-3xs">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-lg">
                <Radio className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t('history_page.channels_title', 'Channels')}
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              {t('history_page.total_sources', 'Total sources: {{count}}', { count: channelStats.length })}
            </span>
          </div>

          {/* Compact Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/80 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  <th className="pb-2 font-bold">{t('history_page.col_source', 'Source')}</th>
                  <th className="pb-2 font-bold text-center sm:text-left">{t('history_page.col_time', 'Time')}</th>
                  <th className="pb-2 font-bold text-center">{t('history_page.col_videos', 'Videos')}</th>
                  <th className="pb-2 font-bold text-right pr-2 min-w-[100px]">{t('history_page.col_share', 'Share')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
                {displayedChannels.map((channel) => (
                  <tr
                    key={channel.name}
                    onClick={() => setSearchQuery(channel.name)}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                    title={t('history_page.filter_by_channel', 'Click to filter history by this channel')}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        {channel.avatarUrl ? (
                          <img
                            src={channel.avatarUrl}
                            alt={channel.name}
                            className="w-7 h-7 rounded-full object-cover shrink-0 border border-zinc-200 dark:border-zinc-700 shadow-3xs"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-3xs">
                            {channel.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors block truncate max-w-[200px]">
                            {channel.name}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center sm:text-left font-mono font-bold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                      {formatDuration(channel.durationSeconds)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {channel.videoCount}
                    </td>
                    <td className="py-2.5 pl-2 pr-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="w-20 sm:w-28 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(3, channel.sharePercent)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400">
                          {channel.sharePercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Show more / Show less toggle */}
          {channelStats.length > 3 && (
            <button
              type="button"
              onClick={() => setIsChannelsExpanded(prev => !prev)}
              className="w-full py-1.5 text-center text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-xl transition-colors cursor-pointer border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center gap-1"
            >
              <span>{isChannelsExpanded ? t("history_page.show_less", "Show less") : t("history_page.show_all_sources", "Show all ({{count}})", { count: channelStats.length })}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isChannelsExpanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* Search & Content Type Tabs Panel */}
      <div className="bg-white dark:bg-zinc-900/60 p-2 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 shadow-3xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Type Tabs */}
        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 w-full md:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              filterType === "all"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {t('history_page.filter_all_count', 'All ({{count}})', { count: deduplicatedHistory.length })}
          </button>

          <button
            type="button"
            onClick={() => setFilterType("read")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              filterType === "read"
                ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t('history_page.filter_reading_count', 'Reading ({{count}})', { count: readCount })}
          </button>

          <button
            type="button"
            onClick={() => setFilterType("listen")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              filterType === "listen"
                ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            {t('history_page.filter_audio_count', 'Audio ({{count}})', { count: listenCount })}
          </button>

          <button
            type="button"
            onClick={() => setFilterType("complete")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              filterType === "complete"
                ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('history_page.filter_completed_count', 'Completed ({{count}})', { count: completeCount })}
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('history_page.search_placeholder', 'Search history...')}
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200/80 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>


      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white dark:bg-zinc-900/40 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="w-12 h-12 mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
            {t('history_page.empty_history', 'History is empty')}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {searchQuery
              ? t('history_page.no_results', "No results found for your search query.")
              : t('history_page.empty_desc', "When you read or listen to lessons, your chronological activity history will appear here.")}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedHistory.map((group) => (
            <div key={group.dateKey} className="space-y-2.5">
              {/* Date Group Header */}
              <div className="flex items-center gap-2 px-1 pt-1">
                <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  {group.dateKey}
                </span>
                <div className="flex-1 h-px bg-zinc-200/70 dark:bg-zinc-800" />
              </div>

              {/* Entries in group */}
              <div className="space-y-2.5">
                {group.items.map((item) => {
                  const matchedLesson = lessons.find((l) => l.id === item.lessonId);
                  const isCustom = item.mode === "custom" || item.lessonId === "custom" || !matchedLesson;
                  const isCompleted = item.status === "completed" || item.actionType === "complete";
                  const displayTitle = item.customTitle || item.lessonTitle;

                  // Universal Badge mapping based on actionType & category
                  const badge = (() => {
                    const actionType = (item.actionType || "").toLowerCase();
                    const category = (item.category || "").toLowerCase();
                    const lessonType = (item.lessonType || matchedLesson?.lessonType || "").toLowerCase();

                    if (actionType === "study" || actionType === "grammar" || category === "grammar") {
                      return {
                        label: t('history_page.activity_grammar', 'GRAMMAR'),
                        Icon: FileText,
                        color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                      };
                    }

                    if (actionType === "speak" || actionType === "speaking" || category === "speaking") {
                      return {
                        label: t('history_page.activity_speaking', 'SPEAKING'),
                        Icon: MessageSquare,
                        color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                      };
                    }

                    if (actionType === "read" || actionType === "reading" || category === "book" || lessonType === "book" || lessonType === "article") {
                      return {
                        label: t('history_page.activity_reading', 'READING'),
                        Icon: BookOpen,
                        color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900"
                      };
                    }

                    if (actionType === "complete" || actionType === "completed") {
                      return {
                        label: t('history_page.status_completed', 'COMPLETED'),
                        Icon: CheckCircle2,
                        color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                      };
                    }

                    if (
                      actionType === "listen" ||
                      actionType === "listening" ||
                      category === "podcast" ||
                      category === "video" ||
                      lessonType === "podcast" ||
                      lessonType === "youtube" ||
                      lessonType === "audio" ||
                      !!matchedLesson?.audioUrl ||
                      !!matchedLesson?.youtubeId
                    ) {
                      return {
                        label: t('history_page.activity_listening', 'LISTENING'),
                        Icon: Headphones,
                        color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900"
                      };
                    }

                    return {
                      label: t('history_page.activity_reading', 'READING'),
                      Icon: BookOpen,
                      color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900"
                    };
                  })();

                  const BadgeIcon = badge.Icon;

                  return (
                    <div
                      key={item.id}
                      onClick={() => matchedLesson && onOpenLesson(matchedLesson.id)}
                      className={`group relative p-3 sm:p-3.5 bg-white dark:bg-zinc-900/70 hover:bg-teal-50/20 dark:hover:bg-zinc-800/60 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs hover:shadow-xs hover:border-teal-300 dark:hover:border-teal-800 ${
                        matchedLesson ? "cursor-pointer" : ""
                      }`}
                    >
                      {/* Left side: Cover + Title + Details */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Thumbnail Cover / Category Icon */}
                        <div className="w-14 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-zinc-200/60 dark:border-zinc-700/60 shadow-3xs">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={displayTitle}
                              className="w-full h-full object-cover"
                            />
                          ) : item.category === "video" ? (
                            <div className="w-full h-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center">
                              <Tv className="w-4 h-4 text-rose-500" />
                            </div>
                          ) : item.category === "podcast" ? (
                            <div className="w-full h-full bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center">
                              <Headphones className="w-4 h-4 text-purple-500" />
                            </div>
                          ) : item.category === "book" ? (
                            <div className="w-full h-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                              <BookOpen className="w-4 h-4 text-emerald-500" />
                            </div>
                          ) : item.category === "grammar" || item.actionType === "study" ? (
                            <div className="w-full h-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-emerald-500" />
                            </div>
                          ) : item.category === "speaking" || item.actionType === "speak" ? (
                            <div className="w-full h-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                              <MessageSquare className="w-4 h-4 text-amber-500" />
                            </div>
                          ) : item.actionType === "listen" ? (
                            <div className="w-full h-full bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center">
                              <Headphones className="w-4 h-4 text-purple-500" />
                            </div>
                          ) : (
                            <div className="w-full h-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                              <BookOpen className="w-4 h-4 text-blue-500" />
                            </div>
                          )}
                        </div>

                        {/* Text details */}
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider flex items-center gap-1 ${badge.color}`}>
                              <BadgeIcon className="w-2.5 h-2.5" />
                              {badge.label}
                            </span>

                            {isCustom && item.category && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700">
                                <span>{t(`history_page.cat_${item.category}`, item.category)}</span>
                              </span>
                            )}

                            {isCompleted && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>{t('history_page.status_completed', 'Completed')}</span>
                              </span>
                            )}

                            <span className="text-[9px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                              {getItemLanguage(item)}
                            </span>

                            <span className="text-[10px] text-zinc-400">
                              {formatDate(item.timestamp)}
                            </span>

                            {(item.channelName || matchedLesson?.channelName) && (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-900/50 flex items-center gap-1">
                                {(item.channelAvatarUrl || matchedLesson?.channelAvatarUrl) ? (
                                  <img
                                    src={item.channelAvatarUrl || matchedLesson?.channelAvatarUrl || ""}
                                    alt=""
                                    className="w-3 h-3 rounded-full object-cover shrink-0"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <Radio className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span className="truncate max-w-[120px]">{item.channelName || matchedLesson?.channelName}</span>
                              </span>
                            )}
                            
                            {item.tags && item.tags.length > 0 && item.tags.map(t => (
                              <span key={t} className="text-[9px] font-bold text-teal-700 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-400 px-1.5 py-0.5 rounded border border-teal-100 dark:border-teal-900/50 flex items-center gap-1">
                                <Tag className="w-2 h-2" />
                                {t}
                              </span>
                            ))}
                          </div>

                          <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {displayTitle}
                          </h4>

                          {/* Duration & Notes */}
                          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                            {item.durationSeconds ? (
                              <span className="flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400">
                                <Clock className="w-2.5 h-2.5" />
                                {formatDuration(item.durationSeconds)}
                              </span>
                            ) : null}

                            {item.notes ? (
                              <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 italic">
                                <MessageSquare className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                <span className="truncate max-w-md">"{item.notes}"</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Right side buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800/80 pt-1.5 sm:pt-0 justify-end">
                        {/* Edit button (visible on hover) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditEntry(item);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-all cursor-pointer"
                          title={t('history_page.edit_entry', 'Edit history record')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete button (visible on hover) */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteEntry(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all cursor-pointer"
                          title={t('history_page.delete_entry', 'Delete from history')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Primary single action button: Resume / Open */}
                        {matchedLesson && item.status === "in_progress" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLesson(matchedLesson.id);
                            }}
                            className="px-3 py-1.5 bg-zinc-100 hover:bg-teal-50 dark:bg-zinc-800 dark:hover:bg-teal-950/40 text-zinc-800 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 text-xs font-bold rounded-xl border border-zinc-200/80 dark:border-zinc-700 hover:border-teal-200 dark:hover:border-teal-800 flex items-center gap-1.5 shadow-3xs transition-all active:scale-97 cursor-pointer"
                            title={t('history_page.continue_lesson', 'Resume lesson')}
                          >
                            <Play className="w-3 h-3 fill-current text-teal-600 dark:text-teal-400" />
                            <span>{t('history_page.resume', 'Resume')}</span>
                          </button>
                        ) : matchedLesson ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLesson(matchedLesson.id);
                            }}
                            className="px-3 py-1.5 bg-zinc-100 hover:bg-teal-50 dark:bg-zinc-800 dark:hover:bg-teal-950/40 text-zinc-800 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 text-xs font-bold rounded-xl border border-zinc-200/80 dark:border-zinc-700 hover:border-teal-200 dark:hover:border-teal-800 flex items-center gap-1.5 shadow-3xs transition-all active:scale-97 cursor-pointer"
                          >
                            <BookOpen className="w-3 h-3 text-zinc-500 group-hover:text-teal-600" />
                            <span>{t('history_page.open', 'Open')}</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 font-semibold">
                {t('history_page.showing_items', 'Showing {{start}}-{{end}} of {{total}} records', {
                  start: (safeCurrentPage - 1) * ITEMS_PER_PAGE + 1,
                  end: Math.min(safeCurrentPage * ITEMS_PER_PAGE, filteredHistory.length),
                  total: filteredHistory.length,
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all font-bold text-xs shadow-3xs cursor-pointer active:scale-95 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{t('history_page.back', 'Back')}</span>
                </button>

                <div className="flex items-center gap-1">
                  {getPageNumbers(safeCurrentPage, totalPages).map((page, idx) => {
                    if (page === "...") {
                      return (
                        <span key={`dots-${idx}`} className="px-2 text-xs text-zinc-400 font-bold select-none">
                          ...
                        </span>
                      );
                    }
                    const pageNum = page as number;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          safeCurrentPage === pageNum
                            ? "bg-teal-600 text-white shadow-md border-transparent font-black"
                            : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all font-bold text-xs shadow-3xs cursor-pointer active:scale-95 flex items-center gap-1"
                >
                  <span>{t('history_page.next', 'Next')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal for Editing / Adding History Record */}
      {(editingEntry || isCreateModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90dvh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 font-sans">
            
            {/* 1. Fixed Modal Header */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  {editingEntry ? t('history_page.edit_entry_title', "Edit History Entry") : t('history_page.add_entry_title', "Add New Record")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEntry(null);
                  setIsCreateModalOpen(false);
                }}
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
                      const chName = currentSelected?.channelName || (editingEntry?.lessonId === formLessonId ? editingEntry?.channelName : null);
                      const chAvatar = currentSelected?.channelAvatarUrl || (editingEntry?.lessonId === formLessonId ? editingEntry?.channelAvatarUrl : null);
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
                      {t('history_page.time_label', 'Time')}
                    </label>
                    <input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold font-mono"
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
                  onClick={() => {
                    setEditingEntry(null);
                    setIsCreateModalOpen(false);
                  }}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  {t('history_page.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  {t('history_page.save', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(HistoryPage);
