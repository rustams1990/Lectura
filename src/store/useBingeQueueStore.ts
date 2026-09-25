import { create } from "zustand";
import { Lesson } from "../types";

export interface BingeQueueContext {
  type: "playlist" | "library";
  playlistId?: string;
  playlistTitle?: string;
  lessonIds: string[];
}

export interface BingeCountdownState {
  active: boolean;
  nextLesson: Lesson | null;
  isLastInPlaylist: boolean;
  playlistTitle?: string;
  secondsRemaining: number;
}

interface BingeQueueStore {
  queueContext: BingeQueueContext | null;
  countdownState: BingeCountdownState;
  autoplayBlocked: boolean;

  setQueueContext: (context: BingeQueueContext) => void;
  clearQueueContext: () => void;
  startCountdown: (nextLesson: Lesson, onTriggerNext: () => void) => void;
  triggerImmediate: () => void;
  showPlaylistCompleted: (playlistTitle?: string) => void;
  cancelCountdown: () => void;
  setAutoplayBlocked: (blocked: boolean) => void;
}

let countdownIntervalId: any = null;
let pendingTriggerNext: (() => void) | null = null;

export const useBingeQueueStore = create<BingeQueueStore>((set, get) => ({
  queueContext: null,
  autoplayBlocked: false,
  countdownState: {
    active: false,
    nextLesson: null,
    isLastInPlaylist: false,
    secondsRemaining: 5,
  },

  setQueueContext: (context) => set({ queueContext: context }),
  clearQueueContext: () => set({ queueContext: null }),
  setAutoplayBlocked: (blocked) => set({ autoplayBlocked: blocked }),

  startCountdown: (nextLesson, onTriggerNext) => {
    // Clear any previous running timer
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    pendingTriggerNext = onTriggerNext;

    set({
      countdownState: {
        active: true,
        nextLesson,
        isLastInPlaylist: false,
        secondsRemaining: 5,
      },
    });

    countdownIntervalId = setInterval(() => {
      const current = get().countdownState;
      if (!current.active) {
        if (countdownIntervalId) clearInterval(countdownIntervalId);
        countdownIntervalId = null;
        pendingTriggerNext = null;
        return;
      }

      if (current.secondsRemaining <= 1) {
        if (countdownIntervalId) clearInterval(countdownIntervalId);
        countdownIntervalId = null;
        const cb = pendingTriggerNext;
        pendingTriggerNext = null;

        set({
          countdownState: {
            active: false,
            nextLesson: null,
            isLastInPlaylist: false,
            secondsRemaining: 0,
          },
        });

        // Trigger transition to next lesson
        if (cb) cb();
      } else {
        set({
          countdownState: {
            ...current,
            secondsRemaining: current.secondsRemaining - 1,
          },
        });
      }
    }, 1000);
  },

  triggerImmediate: () => {
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    const cb = pendingTriggerNext;
    pendingTriggerNext = null;

    set({
      countdownState: {
        active: false,
        nextLesson: null,
        isLastInPlaylist: false,
        secondsRemaining: 0,
      },
    });

    if (cb) cb();
  },

  showPlaylistCompleted: (playlistTitle) => {
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    pendingTriggerNext = null;

    set({
      countdownState: {
        active: true,
        nextLesson: null,
        isLastInPlaylist: true,
        playlistTitle,
        secondsRemaining: 0,
      },
    });
  },

  cancelCountdown: () => {
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    pendingTriggerNext = null;

    set({
      countdownState: {
        active: false,
        nextLesson: null,
        isLastInPlaylist: false,
        secondsRemaining: 0,
      },
    });
  },
}));
