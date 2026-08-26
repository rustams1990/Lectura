import { useState, useEffect } from "react";

export interface WhisperQueueItem {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  sourceType: "youtube" | "podcast" | "file";
  model: string;
  language?: string;
  threads?: number;
  vad?: boolean;
  thumbnail?: string;
  status: "queued" | "downloading_model" | "extracting_audio" | "transcribing" | "completed" | "error" | "cancelled";
  progress: number;
  currentTime: number;
  totalDuration: number;
  etaSeconds: number;
  stageText: string;
  channelName?: string;
  channelAvatarUrl?: string;
  createdBookId?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface WhisperTelemetry {
  cpu: {
    cores: number;
    model: string;
  };
  ram: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    percent: number;
  };
  model: {
    status: string;
    isLoaded: boolean;
    currentModel: string | null;
    idleRemainingSeconds: number;
    idleTimeoutSeconds: number;
  };
}

function getActiveWhisperUserId(): string {
  try {
    const savedUserStr = localStorage.getItem("vocab_clone_local_user");
    const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
    return savedUser?.uid || savedUser?.email || "default";
  } catch {
    return "default";
  }
}

function getWhisperStorageKey(): string {
  const uid = getActiveWhisperUserId();
  return `lectura_whisper_completed_tasks_${uid}`;
}

class WhisperQueueService {
  private queue: WhisperQueueItem[] = [];
  private activeItem: WhisperQueueItem | null = null;
  private completedTasks: WhisperQueueItem[] = [];
  private listeners: Set<() => void> = new Set();
  private eventSource: EventSource | null = null;
  private retryTimeout: any = null;
  private customProgressIntervals: Map<string, any> = new Map();

  constructor() {
    this.loadCompletedHistory();
    this.initSse();
    if (typeof window !== "undefined") {
      window.addEventListener("lectura:user_logout", () => this.reloadForUser());
      window.addEventListener("lectura:user_login", () => this.reloadForUser());
    }
  }

  public reloadForUser() {
    this.loadCompletedHistory();
    this.notify();
  }

  private loadCompletedHistory() {
    try {
      // Remove legacy unscoped key to prevent cross-account leaks
      localStorage.removeItem("lectura_whisper_completed_tasks");
      
      const key = getWhisperStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const currentUid = getActiveWhisperUserId();
          this.completedTasks = parsed.filter(t => !t.userId || t.userId === currentUid || currentUid === "default");
        } else {
          this.completedTasks = [];
        }
      } else {
        this.completedTasks = [];
      }
    } catch (_) {
      this.completedTasks = [];
    }
  }

  private saveCompletedHistory() {
    try {
      const key = getWhisperStorageKey();
      // Keep up to 20 completed items in history
      const trimmed = this.completedTasks.slice(0, 20);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch (_) {}
  }

  public playGentleChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now);
      osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5

      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);
    } catch (_) {}
  }

  private initSse() {
    if (typeof window === "undefined") return;

    try {
      if (this.eventSource) {
        this.eventSource.close();
      }

      this.eventSource = new EventSource("/api/whisper/events");

      this.eventSource.addEventListener("init", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.queue = data.queue || [];
          this.activeItem = data.activeItem || null;
          this.notify();
        } catch (_) {}
      });

      this.eventSource.addEventListener("queue_update", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.queue = data.queue || [];
          this.activeItem = data.activeItem || null;
          this.notify();
        } catch (_) {}
      });

      this.eventSource.addEventListener("progress", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (this.activeItem && this.activeItem.id === data.id) {
            this.activeItem = { ...this.activeItem, ...data };
            this.notify();
          }
        } catch (_) {}
      });

      this.eventSource.addEventListener("task_completed", (e: MessageEvent) => {
        try {
          const item = JSON.parse(e.data);
          // Add to completed history
          this.completedTasks = [item, ...this.completedTasks.filter(t => t.id !== item.id)];
          this.saveCompletedHistory();
          this.playGentleChime();
          this.notify();
        } catch (_) {}
      });

      this.eventSource.addEventListener("task_error", (e: MessageEvent) => {
        try {
          const item = JSON.parse(e.data);
          this.completedTasks = [item, ...this.completedTasks.filter(t => t.id !== item.id)];
          this.saveCompletedHistory();
          this.notify();
        } catch (_) {}
      });

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Auto-reconnect after 3s
        if (!this.retryTimeout) {
          this.retryTimeout = setTimeout(() => {
            this.retryTimeout = null;
            this.initSse();
          }, 3000);
        }
      };
    } catch (_) {}
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public getState() {
    const currentUid = getActiveWhisperUserId();
    const userQueue = this.queue.filter((t) => !t.userId || t.userId === currentUid || currentUid === "default");
    const userActiveItem =
      this.activeItem && (!this.activeItem.userId || this.activeItem.userId === currentUid || currentUid === "default")
        ? this.activeItem
        : null;
    const userCompleted = this.completedTasks.filter((t) => !t.userId || t.userId === currentUid || currentUid === "default");
    return {
      queue: userQueue,
      activeItem: userActiveItem,
      completedTasks: userCompleted,
      totalActiveCount: (userActiveItem ? 1 : 0) + userQueue.length,
    };
  }

  public async enqueueTask(payload: FormData | Record<string, any>): Promise<WhisperQueueItem> {
    const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
    const currentUid = getActiveWhisperUserId();
    if (isFormData) {
      if (!(payload as FormData).has("userId")) (payload as FormData).append("userId", currentUid);
    } else {
      if (!(payload as Record<string, any>).userId) (payload as Record<string, any>).userId = currentUid;
    }
    const res = await fetch("/api/whisper/queue", {
      method: "POST",
      headers: isFormData ? undefined : { "Content-Type": "application/json" },
      body: isFormData ? payload : JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to queue task" }));
      throw new Error(err.error || "Failed to queue task");
    }
    const data = await res.json();
    return data.item;
  }

  public async cancelTask(id: string): Promise<boolean> {
    const timer = this.customProgressIntervals.get(id);
    if (timer) {
      clearInterval(timer);
      this.customProgressIntervals.delete(id);
    }

    // Immediately remove from activeItem or queue and notify UI
    if (this.activeItem && this.activeItem.id === id) {
      this.activeItem = this.queue.shift() || null;
      this.notify();
    } else {
      const idx = this.queue.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.queue.splice(idx, 1);
        this.notify();
      }
    }

    try {
      const res = await fetch("/api/whisper/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return res.ok;
    } catch (_) {
      return true;
    }
  }

  public clearCompletedTask(id: string) {
    this.completedTasks = this.completedTasks.filter(t => t.id !== id);
    this.saveCompletedHistory();
    this.notify();
  }

  public clearAllCompleted() {
    this.completedTasks = [];
    this.saveCompletedHistory();
    this.notify();
  }

  public registerCustomTask(item: Partial<WhisperQueueItem> & { id: string; title: string }): WhisperQueueItem {
    const currentUid = getActiveWhisperUserId();
    const newItem: WhisperQueueItem = {
      id: item.id,
      userId: item.userId || currentUid || "default",
      title: item.title,
      sourceType: item.sourceType || "podcast",
      model: item.model || "base",
      status: item.status || "transcribing",
      progress: item.progress || 5,
      currentTime: 0,
      totalDuration: 0,
      etaSeconds: 0,
      stageText: item.stageText || "Распознавание речи через Whisper...",
      thumbnail: item.thumbnail,
      channelName: item.channelName,
      createdAt: Date.now(),
      startedAt: Date.now(),
      ...item,
    };
    if (!this.activeItem) {
      this.activeItem = newItem;
    } else {
      this.queue.push(newItem);
    }

    // Start a smooth background progress incrementer for custom jobs
    if (typeof window !== "undefined") {
      const timer = setInterval(() => {
        if (this.activeItem && this.activeItem.id === newItem.id) {
          if (this.activeItem.progress < 85) {
            const step = this.activeItem.progress < 30 ? 2 : (this.activeItem.progress < 60 ? 1.5 : 0.8);
            this.activeItem = {
              ...this.activeItem,
              progress: Math.min(88, Math.round((this.activeItem.progress + step) * 10) / 10),
            };
            this.notify();
          }
        }
      }, 700);
      this.customProgressIntervals.set(newItem.id, timer);
    }

    this.notify();
    return newItem;
  }

  public updateCustomTask(id: string, updates: Partial<WhisperQueueItem>) {
    if (this.activeItem && this.activeItem.id === id) {
      this.activeItem = { ...this.activeItem, ...updates };
      this.notify();
    } else {
      const idx = this.queue.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.queue[idx] = { ...this.queue[idx], ...updates };
        this.notify();
      }
    }
  }

  public completeCustomTask(id: string, lessonId?: string) {
    const timer = this.customProgressIntervals.get(id);
    if (timer) {
      clearInterval(timer);
      this.customProgressIntervals.delete(id);
    }

    let targetItem: WhisperQueueItem | null = null;
    if (this.activeItem && this.activeItem.id === id) {
      targetItem = this.activeItem;
      this.activeItem = this.queue.shift() || null;
    } else {
      const idx = this.queue.findIndex(t => t.id === id);
      if (idx !== -1) {
        targetItem = this.queue.splice(idx, 1)[0];
      }
    }

    if (targetItem) {
      const currentUid = getActiveWhisperUserId();
      const completed: WhisperQueueItem = {
        ...targetItem,
        userId: targetItem.userId || currentUid || "default",
        status: "completed",
        progress: 100,
        completedAt: Date.now(),
        stageText: "Завершено",
        createdBookId: lessonId || targetItem.createdBookId,
      };
      this.completedTasks = [completed, ...this.completedTasks.filter(t => t.id !== id)];
      this.saveCompletedHistory();
      this.playGentleChime();
      this.notify();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lectura:refresh_lessons"));
      }
    }
  }

  public failCustomTask(id: string, errorMessage?: string) {
    const timer = this.customProgressIntervals.get(id);
    if (timer) {
      clearInterval(timer);
      this.customProgressIntervals.delete(id);
    }

    let targetItem: WhisperQueueItem | null = null;
    if (this.activeItem && this.activeItem.id === id) {
      targetItem = this.activeItem;
      this.activeItem = this.queue.shift() || null;
    } else {
      const idx = this.queue.findIndex(t => t.id === id);
      if (idx !== -1) {
        targetItem = this.queue.splice(idx, 1)[0];
      }
    }

    if (targetItem) {
      const currentUid = getActiveWhisperUserId();
      const failed: WhisperQueueItem = {
        ...targetItem,
        userId: targetItem.userId || currentUid || "default",
        status: "error",
        error: errorMessage || "Import failed",
        completedAt: Date.now(),
        stageText: "Ошибка",
      };
      this.completedTasks = [failed, ...this.completedTasks.filter(t => t.id !== id)];
      this.saveCompletedHistory();
      this.notify();
    }
  }
}

export const whisperQueueService = new WhisperQueueService();

export function useWhisperQueue() {
  const [state, setState] = useState(() => whisperQueueService.getState());

  useEffect(() => {
    return whisperQueueService.subscribe(() => {
      setState(whisperQueueService.getState());
    });
  }, []);

  return {
    ...state,
    enqueueTask: whisperQueueService.enqueueTask.bind(whisperQueueService),
    cancelTask: whisperQueueService.cancelTask.bind(whisperQueueService),
    clearCompletedTask: whisperQueueService.clearCompletedTask.bind(whisperQueueService),
    clearAllCompleted: whisperQueueService.clearAllCompleted.bind(whisperQueueService),
    registerCustomTask: whisperQueueService.registerCustomTask.bind(whisperQueueService),
    updateCustomTask: whisperQueueService.updateCustomTask.bind(whisperQueueService),
    completeCustomTask: whisperQueueService.completeCustomTask.bind(whisperQueueService),
    failCustomTask: whisperQueueService.failCustomTask.bind(whisperQueueService),
  };
}
