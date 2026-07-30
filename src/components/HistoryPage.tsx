/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, memo } from "react";
import { HistoryEntry, Lesson } from "../types";
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
  FileText
} from "lucide-react";
import { getCategoryIcon } from "./ImportLessonForm";

interface HistoryPageProps {
  history: HistoryEntry[];
  lessons: Lesson[];
  onOpenLesson: (lessonId: string) => void;
  onUpdateHistory: (updatedHistory: HistoryEntry[]) => void;
}

function HistoryPage({
  history,
  lessons,
  onOpenLesson,
  onUpdateHistory,
}: HistoryPageProps) {
  const [filterType, setFilterType] = useState<"all" | "read" | "listen" | "complete">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  const formatMonthName = (monthKey: string) => {
    if (monthKey === "all") return "Все месяцы";
    try {
      const [year, month] = monthKey.split("-");
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const monthName = d.toLocaleString("ru-RU", { month: "long", year: "numeric" });
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
    } catch {
      return monthKey;
    }
  };

  // Modal states for Editing / Creating History Entry
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form states for Modal
  const [formLessonId, setFormLessonId] = useState("");
  const [formCustomTitle, setFormCustomTitle] = useState("");
  const [formActionType, setFormActionType] = useState<"read" | "listen">("read");
  const [formStatus, setFormStatus] = useState<"in_progress" | "completed">("in_progress");
  const [formMinutes, setFormMinutes] = useState("10");
  const [formNotes, setFormNotes] = useState("");
  const [formDateOnly, setFormDateOnly] = useState("");
  const [formHour24, setFormHour24] = useState("12");
  const [formMinute, setFormMinute] = useState("00");

  // Populate form when editing an entry
  const startEditEntry = (entry: HistoryEntry) => {
    setEditingEntry(entry);
    setFormLessonId(entry.lessonId);
    setFormCustomTitle(entry.lessonTitle);
    setFormActionType(entry.actionType === "listen" ? "listen" : "read");
    setFormStatus((entry.status === "completed" || entry.actionType === "complete") ? "completed" : "in_progress");
    setFormMinutes(Math.round((entry.durationSeconds || 0) / 60).toString());
    setFormNotes(entry.notes || "");

    const d = new Date(entry.timestamp);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setFormDateOnly(`${yyyy}-${mm}-${dd}`);
      setFormHour24(String(d.getHours()).padStart(2, "0"));
      setFormMinute(String(d.getMinutes()).padStart(2, "0"));
    } else {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setFormDateOnly(`${yyyy}-${mm}-${dd}`);
      setFormHour24(String(now.getHours()).padStart(2, "0"));
      setFormMinute(String(now.getMinutes()).padStart(2, "0"));
    }
  };

  // Reset form when opening create modal
  const startCreateEntry = () => {
    setEditingEntry(null);
    setFormLessonId(lessons[0]?.id || "");
    setFormCustomTitle(lessons[0]?.title || "Занятие");
    setFormActionType("read");
    setFormStatus("in_progress");
    setFormMinutes("15");
    setFormNotes("");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    setFormDateOnly(`${yyyy}-${mm}-${dd}`);
    setFormHour24(String(now.getHours()).padStart(2, "0"));
    setFormMinute(String(now.getMinutes()).padStart(2, "0"));
    setIsCreateModalOpen(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const durationSeconds = Math.max(0, (parseInt(formMinutes, 10) || 0) * 60);
    const selectedLesson = lessons.find((l) => l.id === formLessonId);
    const title = selectedLesson ? selectedLesson.title : (formCustomTitle || "Урок");
    const targetLang = selectedLesson ? selectedLesson.targetLanguage : "Spanish";
    const coverUrl = selectedLesson ? selectedLesson.coverUrl : null;
    const lessonType = selectedLesson ? selectedLesson.lessonType : "article";

    let timestamp = new Date().toISOString();
    if (formDateOnly) {
      const parsed = new Date(`${formDateOnly}T${formHour24 || "00"}:${formMinute || "00"}:00`);
      if (!isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    }

    if (editingEntry) {
      // Update existing entry
      const updated = history.map((h) =>
        h.id === editingEntry.id
          ? {
              ...h,
              lessonId: formLessonId || h.lessonId,
              lessonTitle: title,
              targetLanguage: targetLang,
              coverUrl,
              lessonType,
              actionType: formActionType,
              status: formStatus,
              durationSeconds,
              notes: formNotes.trim(),
              timestamp,
            }
          : h
      );
      onUpdateHistory(updated);
      setEditingEntry(null);
    } else {
      // Create new entry
      const newEntry: HistoryEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        lessonId: formLessonId || "custom",
        lessonTitle: title,
        targetLanguage: targetLang,
        coverUrl,
        lessonType,
        actionType: formActionType,
        status: formStatus,
        durationSeconds,
        notes: formNotes.trim(),
        timestamp,
      };
      onUpdateHistory([newEntry, ...history]);
      setIsCreateModalOpen(false);
    }
  };

  const handleDeleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Удалить эту запись из истории?")) {
      onUpdateHistory(history.filter((h) => h.id !== id));
    }
  };

  const handleClearAll = () => {
    if (confirm("Вы уверены, что хотите полностью очистить всю историю активности?")) {
      onUpdateHistory([]);
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
      const isProg100 = savedProg ? parseFloat(savedProg) >= 100 : false;
      const isLessonDone =
        item.status === "completed" ||
        item.actionType === "complete" ||
        isProg100 ||
        (lesson && ((lesson as any).isCompleted || (lesson as any).readCount > 0 || (lesson as any).progress >= 100));

      const itemWithStatus: HistoryEntry = {
        ...item,
        status: isLessonDone ? "completed" : (item.status || "in_progress"),
      };

      const existingIdx = merged.findIndex(
        (m) =>
          m.lessonId === item.lessonId &&
          Math.abs(new Date(m.timestamp).getTime() - new Date(item.timestamp).getTime()) < 30 * 60 * 1000
      );

      if (existingIdx !== -1) {
        const existing = merged[existingIdx];
        const isListening = existing.actionType === "listen" || itemWithStatus.actionType === "listen";
        const isCompleted =
          existing.status === "completed" ||
          itemWithStatus.status === "completed" ||
          existing.actionType === "complete" ||
          itemWithStatus.actionType === "complete";

        merged[existingIdx] = {
          ...existing,
          actionType: isListening ? "listen" : (existing.actionType === "complete" ? "read" : existing.actionType),
          status: isCompleted ? "completed" : (existing.status || "in_progress"),
          durationSeconds: Math.max(existing.durationSeconds || 0, itemWithStatus.durationSeconds || 0),
          notes: existing.notes || itemWithStatus.notes,
        };
      } else {
        merged.push(itemWithStatus);
      }
    }
    return merged;
  }, [history, lessons]);

  // Filter & Sort entries (NEWEST FIRST: descending timestamp)
  const filteredHistory = useMemo(() => {
    const list = deduplicatedHistory.filter((item) => {
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
      if (selectedMonth !== "all") {
        try {
          const itemMonthKey = new Date(item.timestamp).toISOString().slice(0, 7);
          if (itemMonthKey !== selectedMonth) return false;
        } catch {}
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.lessonTitle.toLowerCase().includes(q);
        const matchesNote = (item.notes || "").toLowerCase().includes(q);
        const matchesLang = item.targetLanguage.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNote && !matchesLang) return false;
      }
      return true;
    });

    // SORT DESCENDING (Latest timestamp at top e.g. July 28 > July 27)
    return [...list].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });
  }, [deduplicatedHistory, filterType, selectedMonth, searchQuery]);

  // Aggregate stats scoped to selected month
  const scopedHistory = useMemo(() => {
    if (selectedMonth === "all") return deduplicatedHistory;
    return deduplicatedHistory.filter((item) => {
      try {
        return new Date(item.timestamp).toISOString().slice(0, 7) === selectedMonth;
      } catch {
        return false;
      }
    });
  }, [deduplicatedHistory, selectedMonth]);

  const totalSeconds = useMemo(() => {
    return scopedHistory.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
  }, [scopedHistory]);

  const readCount = useMemo(() => scopedHistory.filter((h) => h.actionType !== "listen").length, [scopedHistory]);
  const listenCount = useMemo(() => scopedHistory.filter((h) => h.actionType === "listen").length, [scopedHistory]);
  const completeCount = useMemo(() => scopedHistory.filter((h) => h.status === "completed" || h.actionType === "complete").length, [scopedHistory]);

  const formatDuration = (secs: number) => {
    if (!secs || secs <= 0) return "0с";
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (hrs > 0) return `${hrs}ч ${mins}мин`;
    if (mins > 0) return `${mins}мин ${s > 0 ? `${s}с` : ""}`;
    return `${s}с`;
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-200 font-sans">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-sky-700 p-6 rounded-3xl text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
              <History className="w-5 h-5 text-white animate-spin-slow" />
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">
              История активности (Reading & Listening History)
            </h2>
          </div>
          <p className="text-xs text-teal-50 max-w-xl font-medium leading-relaxed">
            Полный журнал ваших прочитанных уроков, прослушанных подкастов и завершённых материалов. Вы можете редактировать любые записи и заметки.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={startCreateEntry}
            className="px-4 py-2.5 bg-white text-teal-700 hover:bg-teal-50 font-black text-xs rounded-2xl flex items-center gap-2 shadow-sm hover:shadow-md cursor-pointer transition-all active:scale-97"
          >
            <Plus className="w-4 h-4" />
            Добавить запись
          </button>
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 backdrop-blur-md border border-white/20 transition-all cursor-pointer"
              title="Очистить всю историю"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <div className="p-3 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-xl">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block truncate">
              {selectedMonth === "all" ? "Всего времени" : `Время за ${formatMonthName(selectedMonth)}`}
            </span>
            <span className="text-base font-extrabold text-zinc-800 dark:text-zinc-100">
              {formatDuration(totalSeconds)}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
              Сессий чтения
            </span>
            <span className="text-base font-extrabold text-zinc-800 dark:text-zinc-100">
              {readCount}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <Headphones className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
              Прослушиваний
            </span>
            <span className="text-base font-extrabold text-zinc-800 dark:text-zinc-100">
              {listenCount}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
              Завершено
            </span>
            <span className="text-base font-extrabold text-zinc-800 dark:text-zinc-100">
              {completeCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filters & Search Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        {/* Filter buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              filterType === "all"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200 dark:border-zinc-800"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            Все ({history.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterType("read")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              filterType === "read"
                ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs border border-zinc-200 dark:border-zinc-800"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            Чтение ({readCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType("listen")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              filterType === "listen"
                ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs border border-zinc-200 dark:border-zinc-800"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-purple-500" />
            Аудио ({listenCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType("complete")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              filterType === "complete"
                ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-xs border border-zinc-200 dark:border-zinc-800"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
            Завершено ({completeCount})
          </button>
        </div>

        {/* Right side: Month Selector & Search Input */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-3xs">
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer"
              >
                <option value="all">🗓️ Все месяцы ({history.length})</option>
                {availableMonths.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    📅 {formatMonthName(mKey)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по заголовку или заметке..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white dark:bg-zinc-900/40 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="w-12 h-12 mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
            История пуста
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {searchQuery
              ? "По вашему запросу ничего не найдено."
              : "Когда вы читаете или слушаете уроки, здесь появляется хронологическая история ваших занятий."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((item) => {
            const matchedLesson = lessons.find((l) => l.id === item.lessonId);
            const isCompleted = item.status === "completed" || item.actionType === "complete";
            const isListening = item.actionType === "listen";

            const typeBadgeColor = isListening
              ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900"
              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";

            return (
              <div
                key={item.id}
                onClick={() => matchedLesson && onOpenLesson(matchedLesson.id)}
                className="group relative p-4 bg-white dark:bg-zinc-900/70 hover:bg-teal-50/20 dark:hover:bg-zinc-800/60 rounded-2xl border border-zinc-100 dark:border-zinc-800 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-3xs hover:shadow-xs hover:border-teal-200 dark:hover:border-teal-900/50"
              >
                {/* Left side: Cover + Title + Details */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Thumbnail Cover */}
                  <div className="w-16 h-11 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-zinc-200/60 dark:border-zinc-700/60 shadow-3xs">
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt={item.lessonTitle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileText className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>

                  {/* Text details */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider flex items-center gap-1 ${typeBadgeColor}`}>
                        {isListening ? <Headphones className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                        {isListening ? "Прослушивание" : "Чтение"}
                      </span>

                      {isCompleted && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                          <CheckCircle2 className="w-3 h-3" />
                          Завершено
                        </span>
                      )}

                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                        {item.targetLanguage}
                      </span>

                      <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {formatDate(item.timestamp)}
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {item.lessonTitle}
                    </h4>

                    {/* Duration & Notes */}
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      {item.durationSeconds ? (
                        <span className="flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400">
                          <Clock className="w-3 h-3" />
                          {formatDuration(item.durationSeconds)}
                        </span>
                      ) : null}

                      {item.notes ? (
                        <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 italic">
                          <MessageSquare className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="truncate max-w-md">"{item.notes}"</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right side buttons */}
                <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800/80 pt-2 sm:pt-0 justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditEntry(item);
                    }}
                    className="p-2 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl transition-colors cursor-pointer"
                    title="Редактировать запись истории"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteEntry(item.id, e)}
                    className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                    title="Удалить из истории"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {matchedLesson && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLesson(matchedLesson.id);
                      }}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-2xs transition-all active:scale-97 cursor-pointer"
                    >
                      <span>Открыть</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Editing / Adding History Record */}
      {(editingEntry || isCreateModalOpen) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  {editingEntry ? "Редактировать запись истории" : "Добавить новую запись"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEntry(null);
                  setIsCreateModalOpen(false);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              {/* Lesson Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  Выберите урок
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
                      {l.title} ({l.targetLanguage})
                    </option>
                  ))}
                  <option value="custom">-- Произвольный урок / Своё название --</option>
                </select>
              </div>

              {/* Custom Title if selected */}
              {formLessonId === "custom" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Название занятия / Урока
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomTitle}
                    onChange={(e) => setFormCustomTitle(e.target.value)}
                    placeholder="Введите название урока или подкаста..."
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                  />
                </div>
              )}

              {/* Action Type & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Тип активности
                  </label>
                  <select
                    value={formActionType}
                    onChange={(e) => setFormActionType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                  >
                    <option value="read">📖 Чтение (Reading)</option>
                    <option value="listen">🎧 Прослушивание (Listening)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Статус урока
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                  >
                    <option value="in_progress">⏳ В процессе (In Progress)</option>
                    <option value="completed">✅ Завершено (Completed)</option>
                  </select>
                </div>
              </div>

              {/* Duration & Date & 24h Time */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Длительность (Минуты)
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
                    Дата
                  </label>
                  <input
                    type="date"
                    value={formDateOnly}
                    onChange={(e) => setFormDateOnly(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Время 24ч (Ч : М)
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={formHour24}
                      onChange={(e) => setFormHour24(e.target.value)}
                      className="w-full px-1.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold cursor-pointer text-center"
                    >
                      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                        <option key={h} value={h}>
                          {h} ч
                        </option>
                      ))}
                    </select>

                    <span className="font-extrabold text-zinc-400 text-xs">:</span>

                    <select
                      value={formMinute}
                      onChange={(e) => setFormMinute(e.target.value)}
                      className="w-full px-1.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold cursor-pointer text-center"
                    >
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
                        <option key={m} value={m}>
                          {m} м
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Optional Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                  Личные заметки / Комментарий к сессии
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Добавьте свои впечатления, прогресс или заметки..."
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-sans"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingEntry(null);
                    setIsCreateModalOpen(false);
                  }}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Сохранить
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
