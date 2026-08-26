import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resolveServerUrl } from '../utils/mobileServerBridge';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaylistItem {
  id: string;
  title: string;
  bookTitle?: string;
  audioUrl: string;
  audioBase64?: string | null;
  youtubeId?: string | null;
  localVideoUrl?: string | null;
  duration?: number;
  text?: string;
  coverUrl?: string | null;
  targetLanguage?: string;
  lessonType?: string;
  channelName?: string | null;
  podcastTitle?: string | null;
  guid?: string;
  description?: string;
  pubDate?: string;
  transcriptUrl?: string;
  hasTranscript?: boolean;
}

export function isValidAudioUrl(
  url?: string | null,
  base64?: string | null,
  youtubeId?: string | null,
  localVideoUrl?: string | null
): boolean {
  if (base64 && typeof base64 === 'string' && base64.trim().length > 50) return true;
  if (localVideoUrl && typeof localVideoUrl === 'string' && localVideoUrl.trim().length > 0) return true;
  if (youtubeId && typeof youtubeId === 'string' && youtubeId.trim().length === 11) return true;
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (
    trimmed === '' ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === 'empty' ||
    trimmed.startsWith('null') ||
    trimmed.startsWith('undefined')
  ) {
    return false;
  }
  return true;
}

export function resolveAudioSrc(
  rawUrl?: string | null,
  base64?: string | null,
  youtubeId?: string | null,
  localVideoUrl?: string | null,
  lessonId?: string
): string {
  let src = (rawUrl || '').trim();
  if (!src && base64) {
    src = base64.startsWith('data:') ? base64 : `data:audio/mp3;base64,${base64}`;
  }
  if (!src && localVideoUrl && typeof localVideoUrl === 'string' && localVideoUrl.trim() !== '') {
    src = localVideoUrl.trim();
  }
  if (!src && youtubeId && typeof youtubeId === 'string' && youtubeId.trim().length === 11) {
    src = `/api/media/youtube-stream/${youtubeId.trim()}${lessonId ? `?lessonId=${lessonId}` : ''}`;
  }
  if (src.startsWith('/api/audio-files/')) {
    src = src.replace('/api/audio-files/', '/api/audio-stream/').replace(/\.(mp3|m4a|aac|ogg|wav|webm)$/i, '');
  }
  return resolveServerUrl(src);
}

interface PlaylistState {
  queue: PlaylistItem[];
  currentIndex: number;
  isPlaying: boolean;
  repeatMode: RepeatMode;
  playbackRate: number;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  showQueueModal: boolean;
  isExpanded: boolean;
  isOpen: boolean;
  seekTarget: number | null;

  // Actions
  setQueue: (items: PlaylistItem[], startIndex?: number, autoPlay?: boolean) => { count: number; started: boolean };
  addToQueue: (item: PlaylistItem) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playTrackAtIndex: (index: number) => void;
  playNext: () => void;
  playPrev: () => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  expandPlayer: () => void;
  collapsePlayer: () => void;
  setIsExpanded: (expanded: boolean) => void;
  setIsOpen: (isOpen: boolean) => void;
  closePlayer: () => void;
  seek: (time: number) => void;
  seekDelta: (deltaSeconds: number) => void;
  clearSeekTarget: () => void;
  setPlaybackRate: (rate: number) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setShowQueueModal: (show: boolean) => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      queue: [],
      currentIndex: 0,
      isPlaying: false,
      repeatMode: 'off',
      playbackRate: 1.0,
      currentTime: 0,
      duration: 0,
      volume: 1.0,
      isMuted: false,
      showQueueModal: false,
      isExpanded: false,
      isOpen: false,
      seekTarget: null,

      expandPlayer: () => set({ isExpanded: true, isOpen: true }),
      collapsePlayer: () => set({ isExpanded: false }),
      setIsExpanded: (isExpanded: boolean) => set({ isExpanded }),
      setIsOpen: (isOpen: boolean) => set({ isOpen }),
      closePlayer: () => set({ isOpen: false, isPlaying: false, isExpanded: false, showQueueModal: false }),

      setQueue: (items: PlaylistItem[], startIndex = 0, autoPlay = true) => {
        // Filter only items with valid audio / video streams
        const validItems = items.filter((item) =>
          isValidAudioUrl(item.audioUrl, item.audioBase64, item.youtubeId, item.localVideoUrl)
        );
        if (validItems.length === 0) {
          return { count: 0, started: false };
        }

        const safeIndex = Math.max(0, Math.min(startIndex, validItems.length - 1));
        const initialDuration = validItems[safeIndex]?.duration || 0;
        set({
          queue: validItems,
          currentIndex: safeIndex,
          isPlaying: autoPlay,
          isOpen: true,
          currentTime: 0,
          duration: initialDuration,
          seekTarget: null,
        });

        return { count: validItems.length, started: autoPlay };
      },

      addToQueue: (item: PlaylistItem) => {
        if (!isValidAudioUrl(item.audioUrl, item.audioBase64, item.youtubeId, item.localVideoUrl)) return;
        const currentQueue = get().queue;
        const exists = currentQueue.some((i) => i.id === item.id);
        if (!exists) {
          set({ queue: [...currentQueue, item] });
        }
      },

      removeFromQueue: (index: number) => {
        const { queue, currentIndex, isPlaying } = get();
        if (index < 0 || index >= queue.length) return;

        const nextQueue = queue.filter((_, i) => i !== index);
        if (nextQueue.length === 0) {
          set({ queue: [], currentIndex: 0, isPlaying: false, currentTime: 0, duration: 0, isOpen: false, isExpanded: false });
          return;
        }

        let nextIndex = currentIndex;
        if (index < currentIndex) {
          nextIndex = currentIndex - 1;
        } else if (index === currentIndex) {
          nextIndex = Math.min(currentIndex, nextQueue.length - 1);
        }

        set({
          queue: nextQueue,
          currentIndex: nextIndex,
          currentTime: index === currentIndex ? 0 : get().currentTime,
          isPlaying: index === currentIndex ? isPlaying : isPlaying,
        });
      },

      clearQueue: () => {
        set({ queue: [], currentIndex: 0, isPlaying: false, currentTime: 0, duration: 0, isExpanded: false, isOpen: false, showQueueModal: false });
      },

      playTrackAtIndex: (index: number) => {
        const { queue } = get();
        if (index < 0 || index >= queue.length) return;
        set({
          currentIndex: index,
          isPlaying: true,
          isOpen: true,
          currentTime: 0,
          duration: 0,
          seekTarget: null,
        });
      },

      playNext: () => {
        const { queue, currentIndex, repeatMode } = get();
        if (queue.length === 0) return;

        if (repeatMode === 'one') {
          // Restart current track
          set({ currentTime: 0, seekTarget: 0, isPlaying: true });
          return;
        }

        if (currentIndex + 1 < queue.length) {
          set({
            currentIndex: currentIndex + 1,
            currentTime: 0,
            duration: 0,
            seekTarget: 0,
            isPlaying: true,
          });
        } else if (repeatMode === 'all') {
          // Loop back to beginning
          set({
            currentIndex: 0,
            currentTime: 0,
            duration: 0,
            seekTarget: 0,
            isPlaying: true,
          });
        } else {
          // End of queue in repeat 'off' mode
          set({ isPlaying: false });
        }
      },

      playPrev: () => {
        const { queue, currentIndex, currentTime } = get();
        if (queue.length === 0) return;

        // If played more than 3 seconds, restart current track
        if (currentTime > 3) {
          set({ currentTime: 0, seekTarget: 0, isPlaying: true });
          return;
        }

        if (currentIndex > 0) {
          set({
            currentIndex: currentIndex - 1,
            currentTime: 0,
            duration: 0,
            seekTarget: 0,
            isPlaying: true,
          });
        } else {
          set({ currentTime: 0, seekTarget: 0, isPlaying: true });
        }
      },

      togglePlay: () => {
        const { queue, isPlaying } = get();
        if (queue.length === 0) return;
        set({ isPlaying: !isPlaying });
      },

      setIsPlaying: (playing: boolean) => {
        set({ isPlaying: playing });
      },

      seek: (time: number) => {
        const safeTime = Math.max(0, time);
        set({ currentTime: safeTime, seekTarget: safeTime });
      },

      seekDelta: (deltaSeconds: number) => {
        const { currentTime, duration } = get();
        const target = Math.max(0, Math.min(duration || Infinity, currentTime + deltaSeconds));
        set({ currentTime: target, seekTarget: target });
      },

      clearSeekTarget: () => {
        set({ seekTarget: null });
      },

      setPlaybackRate: (rate: number) => {
        set({ playbackRate: rate });
      },

      setRepeatMode: (mode: RepeatMode) => {
        set({ repeatMode: mode });
      },

      setVolume: (vol: number) => {
        const safeVol = Math.max(0, Math.min(1, vol));
        set({ volume: safeVol, isMuted: safeVol === 0 });
      },

      toggleMute: () => {
        set((state) => ({ isMuted: !state.isMuted }));
      },

      setCurrentTime: (time: number) => {
        set({ currentTime: time });
      },

      setDuration: (duration: number) => {
        set({ duration: duration });
      },

      setShowQueueModal: (show: boolean) => {
        set({ showQueueModal: show });
      },

      reorderQueue: (startIndex: number, endIndex: number) => {
        const { queue, currentIndex } = get();
        if (startIndex === endIndex) return;
        const currentItem = queue[currentIndex];
        const nextQueue = Array.from(queue);
        const [removed] = nextQueue.splice(startIndex, 1);
        nextQueue.splice(endIndex, 0, removed);

        const newCurrentIndex = nextQueue.findIndex((i) => i.id === currentItem?.id);
        set({
          queue: nextQueue,
          currentIndex: newCurrentIndex >= 0 ? newCurrentIndex : currentIndex,
        });
      },
    }),
    {
      name: 'lectura_playlist_state',
      partialize: (state) => ({
        playbackRate: state.playbackRate,
        repeatMode: state.repeatMode,
        volume: state.volume,
      }),
      // Guarantee that on initial page load / refresh isPlaying and player UI start as closed/false
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isPlaying = false;
          state.isOpen = false;
          state.isExpanded = false;
          state.showQueueModal = false;
          state.seekTarget = null;
        }
      },
    }
  )
);
