import { useState, useEffect } from "react";

export interface WhisperQueueItem {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  sourceType: "youtube" | "file";
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

class WhisperQueueService {
  private queue: WhisperQueueItem[] = [];
  private activeItem: WhisperQueueItem | null = null;
  private completedTasks: WhisperQueueItem[] = [];
  private listeners: Set<() => void> = new Set();
  private eventSource: EventSource | null = null;
  private retryTimeout: any = null;

  constructor() {
    this.loadCompletedHistory();
    this.initSse();
  }

  private loadCompletedHistory() {
    try {
      const saved = localStorage.getItem("lectura_whisper_completed_tasks");
      if (saved) {
        this.completedTasks = JSON.parse(saved);
      }
    } catch (_) {}
  }

  private saveCompletedHistory() {
    try {
      // Keep up to 20 completed items in history
      const trimmed = this.completedTasks.slice(0, 20);
      localStorage.setItem("lectura_whisper_completed_tasks", JSON.stringify(trimmed));
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
    return {
      queue: this.queue,
      activeItem: this.activeItem,
      completedTasks: this.completedTasks,
      totalActiveCount: (this.activeItem ? 1 : 0) + this.queue.length,
    };
  }

  public async enqueueTask(payload: FormData | Record<string, any>): Promise<WhisperQueueItem> {
    const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
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
    const res = await fetch("/api/whisper/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.ok;
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
  };
}
