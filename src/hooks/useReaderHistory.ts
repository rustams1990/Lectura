import React, { useState, useMemo } from "react";
import { HistoryEntry, Lesson } from "../types";
import { safeLocalStorageSetItem } from "../utils";

interface UseReaderHistoryProps {
  lesson: Lesson;
  history?: HistoryEntry[];
  onUpdateHistory?: (history: HistoryEntry[]) => void;
}

export function useReaderHistory({ lesson, history, onUpdateHistory }: UseReaderHistoryProps) {
  const [isCustomTimeModalOpen, setIsCustomTimeModalOpen] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState("15");
  const [customNotesInput, setCustomNotesInput] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const currentStatus: "in_progress" | "completed" = useMemo(() => {
    const savedProg = localStorage.getItem(`vocab_progress_${lesson.id}`);
    const isProg100 = savedProg ? parseFloat(savedProg) >= 100 : false;
    const histEntry = (history || []).find((h) => h.lessonId === lesson.id);
    if (isProg100 || histEntry?.status === "completed" || histEntry?.actionType === "complete") {
      return "completed";
    }
    return "in_progress";
  }, [history, lesson.id]);

  const totalLoggedSeconds = useMemo(() => {
    return (history || [])
      .filter((h) => h.lessonId === lesson.id)
      .reduce((sum, h) => sum + (h.durationSeconds || 0), 0);
  }, [history, lesson.id]);

  const formatLoggedDuration = (secs: number) => {
    if (!secs || secs <= 0) return "0м";
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hrs > 0) return `${hrs}ч ${mins > 0 ? `${mins}м` : ""}`;
    return `${mins}м`;
  };

  const isAudioOrVideoLesson = useMemo(() => {
    return !!(
      lesson.youtubeId ||
      lesson.audioUrl ||
      lesson.audioBase64 ||
      lesson.lessonType === "podcast" ||
      lesson.lessonType === "youtube" ||
      lesson.lessonType === "audio"
    );
  }, [lesson]);

  const handleToggleStatus = (newStatus: "in_progress" | "completed") => {
    if (newStatus === "completed") {
      safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, "100");
    } else {
      const currentProg = localStorage.getItem(`vocab_progress_${lesson.id}`);
      if (currentProg && parseFloat(currentProg) >= 100) {
        safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, "50");
      }
    }

    if (onUpdateHistory) {
      const now = new Date().toISOString();
      const existingIdx = (history || []).findIndex((h) => h.lessonId === lesson.id);

      let updated: HistoryEntry[];
      if (existingIdx !== -1) {
        updated = [...(history || [])];
        updated[existingIdx] = {
          ...updated[existingIdx],
          status: newStatus,
          actionType: isAudioOrVideoLesson ? "listen" : (newStatus === "completed" ? "complete" : updated[existingIdx].actionType),
          timestamp: now,
        };
      } else {
        const newEntry: HistoryEntry = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonType: lesson.lessonType || "article",
          coverUrl: lesson.coverUrl || null,
          targetLanguage: lesson.targetLanguage,
          timestamp: now,
          actionType: isAudioOrVideoLesson ? "listen" : (newStatus === "completed" ? "complete" : "read"),
          status: newStatus,
          durationSeconds: 0,
        };
        updated = [newEntry, ...(history || [])];
      }
      onUpdateHistory(updated);
    }

    showToast(newStatus === "completed" ? "✅ Статус изменён на 'Завершено'" : "⏳ Статус изменён на 'В процессе'");
  };

  const handleAddMinutes = (addedMinutes: number, notes?: string) => {
    if (addedMinutes <= 0) return;
    const addedSeconds = addedMinutes * 60;
    const now = new Date().toISOString();

    if (onUpdateHistory) {
      const existingIdx = (history || []).findIndex(
        (h) => h.lessonId === lesson.id && Date.now() - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000
      );

      let updated: HistoryEntry[];
      if (existingIdx !== -1) {
        updated = [...(history || [])];
        const existing = updated[existingIdx];
        updated[existingIdx] = {
          ...existing,
          timestamp: now,
          actionType: isAudioOrVideoLesson ? "listen" : existing.actionType,
          durationSeconds: (existing.durationSeconds || 0) + addedSeconds,
          notes: notes ? (existing.notes ? `${existing.notes}; ${notes}` : notes) : existing.notes,
        };
      } else {
        const newEntry: HistoryEntry = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonType: lesson.lessonType || "article",
          coverUrl: lesson.coverUrl || null,
          targetLanguage: lesson.targetLanguage,
          timestamp: now,
          actionType: isAudioOrVideoLesson ? "listen" : "read",
          status: currentStatus,
          durationSeconds: addedSeconds,
          notes: notes || undefined,
        };
        updated = [newEntry, ...(history || [])];
      }
      onUpdateHistory(updated);
    }

    showToast(`⏱️ Добавлено +${addedMinutes} мин в историю!`);
  };

  const handleSaveCustomTime = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(customMinutesInput, 10) || 0;
    if (mins > 0) {
      handleAddMinutes(mins, customNotesInput.trim());
    }
    setIsCustomTimeModalOpen(false);
    setCustomNotesInput("");
  };

  return {
    isCustomTimeModalOpen,
    setIsCustomTimeModalOpen,
    customMinutesInput,
    setCustomMinutesInput,
    customNotesInput,
    setCustomNotesInput,
    toastMessage,
    currentStatus,
    totalLoggedSeconds,
    formatLoggedDuration,
    handleToggleStatus,
    handleAddMinutes,
    handleSaveCustomTime,
  };
}
