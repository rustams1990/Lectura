import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useLesson } from "../context/LessonContext";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Volume1,
  VolumeX,
  FastForward,
  SkipBack,
  SkipForward,
  Repeat1,
  Headphones,
  Languages,
  Maximize2,
  Gamepad2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { parseTimestampToSeconds } from "../hooks/useReaderPagination";
import { usePlaylistStore } from "../store/playlistStore";
import { ReaderSettings } from "../types";

const SPEED_PRESETS = [0.5, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0];

interface AudioPlayerBarProps {
  onAudioUpload?: (audioUrl: string, base64: string | null) => void;
  onListeningTick?: (seconds: number, forceFlush?: boolean, exactTime?: number) => void;
  onAudioEnded?: () => void;
  readerTheme?: ReaderSettings["readerTheme"];
  showSentenceTranslations?: boolean;
  onToggleSentenceTranslations?: () => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onOpenMatchPairs?: () => void;
  showOnlyUnknown?: boolean;
  onToggleShowOnlyUnknown?: () => void;
}

interface AudioPlayerThemeStyles {
  stickyWrapper: string;
  container: string;
  badge: string;
  badgeText: string;
  titleText: string;
  subText: string;
  buttonBg: string;
  sliderTrack: string;
  divider: string;
}

const audioThemeMap: Record<string, AudioPlayerThemeStyles> = {
  default: {
    stickyWrapper: "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-stone-200/70 dark:border-zinc-800/80 shadow-xs",
    container: "text-zinc-800 dark:text-zinc-100",
    badge: "bg-transparent text-teal-600 dark:text-teal-400 border-0",
    badgeText: "text-teal-600 dark:text-teal-400",
    titleText: "text-zinc-800 dark:text-zinc-200",
    subText: "text-zinc-500 dark:text-zinc-400",
    buttonBg: "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60",
    sliderTrack: "bg-zinc-200 dark:bg-zinc-700",
    divider: "border-stone-200/80 dark:border-zinc-800/80",
  },
  cream: {
    stickyWrapper: "bg-[#fcf8f2] dark:bg-zinc-900 border border-[#f3e9d8] dark:border-zinc-800/80 shadow-xs",
    container: "text-[#3b2b1a] dark:text-zinc-200",
    badge: "bg-transparent text-teal-700 dark:text-teal-400 border-0",
    badgeText: "text-[#523d26] dark:text-teal-400",
    titleText: "text-[#3b2b1a] dark:text-zinc-200",
    subText: "text-[#6b553e] dark:text-zinc-400",
    buttonBg: "hover:bg-black/5 dark:hover:bg-white/10 text-[#3b2b1a] dark:text-zinc-200 border border-[#e8d7bb] dark:border-white/10",
    sliderTrack: "bg-[#e8d8be] dark:bg-zinc-700",
    divider: "border-[#eddcb9]/80 dark:border-zinc-800",
  },
  sepia: {
    stickyWrapper: "bg-[#f7f4eb] dark:bg-zinc-900 border border-[#e5dec9] dark:border-zinc-800/80 shadow-xs",
    container: "text-[#2c2a29] dark:text-zinc-200",
    badge: "bg-transparent text-teal-800 dark:text-teal-400 border-0",
    badgeText: "text-[#5a544e] dark:text-teal-400",
    titleText: "text-[#2c2a29] dark:text-zinc-200",
    subText: "text-[#5a544e] dark:text-zinc-400",
    buttonBg: "hover:bg-black/5 dark:hover:bg-white/10 text-[#2c2a29] dark:text-zinc-200 border border-[#e5dec9] dark:border-white/10",
    sliderTrack: "bg-[#e5dec9] dark:bg-zinc-700",
    divider: "border-[#e5dec9]/80 dark:border-zinc-800",
  },
  slate: {
    stickyWrapper: "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs",
    container: "text-slate-800 dark:text-slate-100",
    badge: "bg-transparent text-teal-600 dark:text-teal-400 border-0",
    badgeText: "text-slate-700 dark:text-teal-400",
    titleText: "text-slate-800 dark:text-slate-100",
    subText: "text-slate-600 dark:text-slate-400",
    buttonBg: "hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700",
    sliderTrack: "bg-slate-200 dark:bg-slate-700",
    divider: "border-slate-200 dark:border-slate-800",
  },
};

export default function AudioPlayerBar({
  onAudioUpload,
  onListeningTick,
  onAudioEnded,
  readerTheme = "default",
  showSentenceTranslations,
  onToggleSentenceTranslations,
  isFocusMode,
  onToggleFocusMode,
  onOpenMatchPairs,
  showOnlyUnknown,
  onToggleShowOnlyUnknown,
}: AudioPlayerBarProps) {
  const { t } = useTranslation();
  const themeStyles = audioThemeMap[readerTheme] || audioThemeMap.default;
  const {
    activeLesson,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    playbackRate,
    setPlaybackRate,
    seekToTime,
    setSeekToTime,
  } = useLesson();

  const {
    queue: playlistQueue,
    currentIndex: playlistIndex,
    isPlaying: playlistIsPlaying,
    currentTime: playlistCurrentTime,
    duration: playlistDuration,
    playbackRate: playlistPlaybackRate,
    togglePlay: playlistTogglePlay,
    seek: playlistSeek,
    seekDelta: playlistSeekDelta,
    setPlaybackRate: playlistSetPlaybackRate,
  } = usePlaylistStore();

  const isGlobalPlayingThisLesson = useMemo(() => {
    const currentTrack = playlistQueue[playlistIndex];
    if (!currentTrack || !activeLesson) return false;
    return (
      currentTrack.id === activeLesson.id ||
      Boolean(activeLesson.title && currentTrack.title && activeLesson.title.trim().toLowerCase() === currentTrack.title.trim().toLowerCase()) ||
      Boolean(currentTrack.guid && (activeLesson.id === currentTrack.guid || (activeLesson as any).podcastGuid === currentTrack.guid)) ||
      Boolean(activeLesson.audioUrl && currentTrack.audioUrl && (
        activeLesson.audioUrl === currentTrack.audioUrl ||
        currentTrack.audioUrl.includes(activeLesson.audioUrl) ||
        activeLesson.audioUrl.includes(currentTrack.audioUrl)
      ))
    );
  }, [playlistQueue, playlistIndex, activeLesson]);

  const effectiveIsPlaying = isGlobalPlayingThisLesson ? playlistIsPlaying : isPlaying;
  const effectiveCurrentTime = isGlobalPlayingThisLesson ? playlistCurrentTime : currentTime;
  const effectiveDuration = isGlobalPlayingThisLesson ? (playlistDuration || duration) : duration;
  const effectivePlaybackRate = isGlobalPlayingThisLesson ? playlistPlaybackRate : playbackRate;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAudioPosRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isSentenceLoop, setIsSentenceLoop] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("lectura_audio_volume");
      return saved !== null ? Number(saved) : 1;
    } catch { return 1; }
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false);

  const isValidUrl = (url: any): boolean => {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (
      trimmed === "" ||
      trimmed === "null" ||
      trimmed === "undefined" ||
      trimmed === "empty" ||
      trimmed.startsWith("null") ||
      trimmed.startsWith("undefined")
    ) {
      return false;
    }
    return true;
  };

  const hasAudio = Boolean(
    activeLesson &&
    (isValidUrl(activeLesson.audioUrl) || isValidUrl(activeLesson.audioBase64))
  );
  const rawAudioSrc = activeLesson
    ? (isValidUrl(activeLesson.audioUrl)
        ? activeLesson.audioUrl!.trim()
        : (isValidUrl(activeLesson.audioBase64) 
            ? (activeLesson.audioBase64!.trim().startsWith("data:") ? activeLesson.audioBase64!.trim() : `data:audio/mp3;base64,${activeLesson.audioBase64!.trim()}`)
            : ""))
    : "";

  // Transform /api/audio-files/name.mp3 to /api/audio-stream/name to bypass download manager extensions
  const audioSrc = useMemo(() => {
    if (!rawAudioSrc) return "";
    if (rawAudioSrc.startsWith("/api/audio-files/")) {
      return rawAudioSrc
        .replace("/api/audio-files/", "/api/audio-stream/")
        .replace(/\.(mp3|m4a|aac|ogg|wav|webm)$/i, "");
    }
    return rawAudioSrc;
  }, [rawAudioSrc]);

  const sessionStartRef = useRef<number>(0);
  const targetSeekTimeRef = useRef<number | null>(null);

  const currentLessonIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeLesson?.id && activeLesson.id !== currentLessonIdRef.current) {
      currentLessonIdRef.current = activeLesson.id;
      const initialPos = Number(activeLesson.audioProgress) || 0;
      if (initialPos > 0) {
        targetSeekTimeRef.current = initialPos;
        setCurrentTime(initialPos);
        if (audioRef.current) {
          try {
            audioRef.current.currentTime = initialPos;
          } catch (_) {}
        }
      } else {
        targetSeekTimeRef.current = null;
        setCurrentTime(0);
      }
    }
  }, [activeLesson?.id, setCurrentTime]);

  const applyTargetSeek = useCallback(() => {
    if (targetSeekTimeRef.current !== null && audioRef.current) {
      const targetTime = targetSeekTimeRef.current;
      targetSeekTimeRef.current = null;
      try {
        audioRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
      } catch (_) {}
    }
  }, [setCurrentTime]);

  const saveCurrentProgress = useCallback((exactTime?: number) => {
    const lessonId = activeLesson?.id;
    if (!lessonId) return;
    const timeToSave = exactTime !== undefined ? exactTime : (audioRef.current?.currentTime ?? currentTime);
    if (timeToSave < 0 || isNaN(timeToSave)) return;
    fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: timeToSave, audioProgress: timeToSave, clientUpdatedAt: Date.now(), updatedAt: Date.now() }),
      keepalive: true
    }).catch(() => {});
  }, [activeLesson?.id, currentTime]);

  // Focus & Visibility Re-sync: Sync playback position from remote server when tab gains focus
  useEffect(() => {
    const missingLessonsCache = (window as any).__missingLessonsCache || ((window as any).__missingLessonsCache = new Set<string>());
    const handleFocusSync = async () => {
      const lessonId = activeLesson?.id;
      // If audio is currently playing, unmounted or known 404 - DO NOT touch position
      if (isPlaying || !lessonId || !audioRef.current || missingLessonsCache.has(lessonId)) return;

      try {
        const res = await fetch(`/api/lessons/${lessonId}`);
        if (res.status === 404) {
          missingLessonsCache.add(lessonId);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const remoteTime = Number(data?.audio_progress ?? data?.audioProgress);
        if (!isNaN(remoteTime) && remoteTime >= 0) {
          const localTime = audioRef.current.currentTime || 0;
          if (Math.abs(localTime - remoteTime) > 2) {
            audioRef.current.currentTime = remoteTime;
            setCurrentTime(remoteTime);
          }
        }
      } catch (_) {
        // silent fail
      }
    };

    window.addEventListener('focus', handleFocusSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocusSync();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeLesson?.id, isPlaying, setCurrentTime]);

  const flushPendingListeningTime = useCallback((exactTime?: number) => {
    const cur = exactTime !== undefined ? exactTime : (audioRef.current?.currentTime ?? currentTime);

    if (cur !== undefined && cur > 0) {
      saveCurrentProgress(cur);
    }

    if (sessionStartRef.current > 0) {
      const elapsedSec = Math.round((Date.now() - sessionStartRef.current) / 1000);
      sessionStartRef.current = 0;
      if (elapsedSec >= 3 && elapsedSec <= 7200) {
        const delta = elapsedSec * (effectivePlaybackRate || 1);
        onListeningTick?.(delta, true, cur);
      } else if (cur !== undefined) {
        onListeningTick?.(0, true, cur);
      }
    } else if (cur !== undefined) {
      onListeningTick?.(0, true, cur);
    }
    
    if (cur !== undefined) {
      window.dispatchEvent(new CustomEvent("force-history-flush", { detail: { exactTime: cur, source: "bar" } }));
    }
  }, [currentTime, effectivePlaybackRate, onListeningTick, saveCurrentProgress]);

  const flushPendingListeningTimeRef = useRef(flushPendingListeningTime);
  useEffect(() => {
    flushPendingListeningTimeRef.current = flushPendingListeningTime;
  }, [flushPendingListeningTime]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingListeningTimeRef.current();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingListeningTimeRef.current();
    };
  }, []);

  // Extract all timestamp markers from lesson text for smart sentence navigation & loop
  const allTimestamps = useMemo(() => {
    if (!activeLesson?.text) return [];
    const text = activeLesson.text;
    const matches: number[] = [];
    const regex = /(?:^|\s)\[?(\d{1,2}:(?:\d{2}:)?\d{2}|\d+s)\]?/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const sec = parseTimestampToSeconds(match[1]);
      if (!isNaN(sec) && !matches.includes(sec)) matches.push(sec);
    }
    return matches.sort((a, b) => a - b);
  }, [activeLesson?.text]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    setCurrentTime(cur);



    // Sentence loop mode: when audio crosses into next sentence, jump back to current sentence start
    if (isSentenceLoop && allTimestamps.length > 0) {
      let segStart = 0;
      let segEnd = duration || Infinity;
      for (let i = 0; i < allTimestamps.length; i++) {
        if (allTimestamps[i] <= cur + 0.1) {
          segStart = allTimestamps[i];
          segEnd = i + 1 < allTimestamps.length ? allTimestamps[i + 1] : (duration || Infinity);
        }
      }
      if (segEnd < Infinity && cur >= segEnd - 0.2 && segEnd > segStart) {
        audioRef.current.currentTime = segStart;
        setCurrentTime(segStart);
      }
    }
  };

  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined) {
      targetSeekTimeRef.current = null;
      if (activeLesson) {
        activeLesson.audioProgress = seekToTime;
      }
      if (isGlobalPlayingThisLesson) {
        playlistSeek(seekToTime);
      } else if (audioRef.current) {
        audioRef.current.currentTime = seekToTime;
        if (!audioRef.current.paused) {
          sessionStartRef.current = Date.now();
        }
        setCurrentTime(seekToTime);
        flushPendingListeningTime(seekToTime);
        onListeningTick?.(0, true, seekToTime);
      }
      setSeekToTime(null);
    }
  }, [seekToTime, activeLesson, isGlobalPlayingThisLesson, playlistSeek, setCurrentTime, setSeekToTime, flushPendingListeningTime, onListeningTick]);

  useEffect(() => {
    if (!isGlobalPlayingThisLesson && audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [isGlobalPlayingThisLesson, playbackRate]);

  // (Tick tracking is now handled natively in handleTimeUpdate)
  useEffect(() => {
    return () => {
      if (audioRef.current && isPlaying && !isGlobalPlayingThisLesson) {
        window.dispatchEvent(new CustomEvent("force-history-flush", { detail: { exactTime: audioRef.current.currentTime } }));
      }
    };
  }, [isPlaying, isGlobalPlayingThisLesson]);

  // Add volume sync effect
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Stop local audio if global playlist starts playing
  useEffect(() => {
    const unsub = usePlaylistStore.subscribe((state, prevState) => {
      if (state.isPlaying && !prevState.isPlaying && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    });
    return () => unsub();
  }, [setIsPlaying]);

  const handlePlayPause = () => {
    if (isGlobalPlayingThisLesson) {
      playlistTogglePlay();
      return;
    }
    if (!audioRef.current || !hasAudio) return;
    if (isPlaying) {
      const cur = audioRef.current.currentTime ?? currentTime;
      flushPendingListeningTime(cur);
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (usePlaylistStore.getState().isPlaying) {
        usePlaylistStore.getState().setIsPlaying(false);
      }
      const audio = audioRef.current;
      applyTargetSeek();
      const expectedTime = currentTime;
      if (expectedTime > 0 && Math.abs(audio.currentTime - expectedTime) > 0.5) {
        try {
          audio.currentTime = expectedTime;
        } catch (_) {}
      }
      const cur = audio.currentTime;
      sessionStartRef.current = Date.now();
      setCurrentTime(cur);
      window.dispatchEvent(new CustomEvent("media-play-start", { detail: { trackId: activeLesson?.id, guid: (activeLesson as any)?.guid } }));
      audio.play().catch((err) => {
        console.error("Playback error:", err?.message || err);
      });
      setIsPlaying(true);
    }
  };


  // Sentence loop effect for global player mode
  useEffect(() => {
    if (isGlobalPlayingThisLesson && isSentenceLoop && allTimestamps.length > 0) {
      const cur = playlistCurrentTime;
      const dur = playlistDuration || duration || Infinity;
      let segStart = 0;
      let segEnd = dur;
      for (let i = 0; i < allTimestamps.length; i++) {
        if (allTimestamps[i] <= cur + 0.1) {
          segStart = allTimestamps[i];
          segEnd = i + 1 < allTimestamps.length ? allTimestamps[i + 1] : dur;
        }
      }
      if (segEnd < Infinity && cur >= segEnd - 0.2 && segEnd > segStart) {
        playlistSeek(segStart);
      }
    }
  }, [isGlobalPlayingThisLesson, isSentenceLoop, allTimestamps, playlistCurrentTime, playlistDuration, duration, playlistSeek]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      if (audioRef.current.duration) {
        const durSec = Math.round(audioRef.current.duration);
        setDuration(durSec);
        if (activeLesson && activeLesson.audioDuration !== durSec) {
          activeLesson.audioDuration = durSec;
        }
      }
      applyTargetSeek();
    }
  };

  const handleCanPlay = () => {
    applyTargetSeek();
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    targetSeekTimeRef.current = null;
    if (activeLesson) {
      activeLesson.audioProgress = val;
    }
    if (isGlobalPlayingThisLesson) {
      playlistSeek(val);
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      lastAudioPosRef.current = val;
      setCurrentTime(val);
      flushPendingListeningTime(val);
      onListeningTick?.(0, true, val);
    }
  };

  const handleSkipSeconds = useCallback((delta: number) => {
    targetSeekTimeRef.current = null;
    if (isGlobalPlayingThisLesson) {
      playlistSeekDelta(delta);
      return;
    }
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const target = Math.max(0, Math.min(duration || Infinity, cur + delta));
    if (activeLesson) {
      activeLesson.audioProgress = target;
    }
    audioRef.current.currentTime = target;
    lastAudioPosRef.current = target;
    setCurrentTime(target);
    flushPendingListeningTime(target);
    onListeningTick?.(0, true, target);
  }, [activeLesson, isGlobalPlayingThisLesson, playlistSeekDelta, duration, setCurrentTime, flushPendingListeningTime, onListeningTick]);

  const handlePrevSentence = useCallback(() => {
    targetSeekTimeRef.current = null;
    const cur = isGlobalPlayingThisLesson ? playlistCurrentTime : (audioRef.current?.currentTime ?? currentTime);
    if (allTimestamps.length === 0) { handleSkipSeconds(-5); return; }
    let target = 0;
    for (let i = allTimestamps.length - 1; i >= 0; i--) {
      if (allTimestamps[i] < cur - 1.2) { target = allTimestamps[i]; break; }
    }
    if (isGlobalPlayingThisLesson) {
      playlistSeek(target);
    } else if (audioRef.current) {
      audioRef.current.currentTime = target;
      lastAudioPosRef.current = target;
      setCurrentTime(target);
      flushPendingListeningTime(target);
      onListeningTick?.(0, true, target);
    }
  }, [allTimestamps, handleSkipSeconds, isGlobalPlayingThisLesson, playlistCurrentTime, playlistSeek, currentTime, setCurrentTime, flushPendingListeningTime, onListeningTick]);

  const handleNextSentence = useCallback(() => {
    targetSeekTimeRef.current = null;
    const cur = isGlobalPlayingThisLesson ? playlistCurrentTime : (audioRef.current?.currentTime ?? currentTime);
    const dur = effectiveDuration;
    if (allTimestamps.length === 0) { handleSkipSeconds(5); return; }
    let target = dur || cur + 5;
    for (let i = 0; i < allTimestamps.length; i++) {
      if (allTimestamps[i] > cur + 0.4) { target = allTimestamps[i]; break; }
    }
    if (isGlobalPlayingThisLesson) {
      playlistSeek(target);
    } else if (audioRef.current) {
      audioRef.current.currentTime = target;
      lastAudioPosRef.current = target;
      setCurrentTime(target);
      flushPendingListeningTime(target);
      onListeningTick?.(0, true, target);
    }
  }, [allTimestamps, effectiveDuration, handleSkipSeconds, isGlobalPlayingThisLesson, playlistCurrentTime, playlistSeek, currentTime, setCurrentTime, flushPendingListeningTime, onListeningTick]);

  const handleSpeedToggle = () => {
    const curRate = effectivePlaybackRate;
    const curIdx = SPEED_PRESETS.findIndex((r) => Math.abs(r - curRate) < 0.05);
    const nextIdx = (curIdx + 1) % SPEED_PRESETS.length;
    const newRate = SPEED_PRESETS[nextIdx];
    if (isGlobalPlayingThisLesson) {
      playlistSetPlaybackRate(newRate);
    } else {
      setPlaybackRate(newRate);
      if (audioRef.current) audioRef.current.playbackRate = newRate;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) setIsMuted(false);
    try { localStorage.setItem("lectura_audio_volume", String(val)); } catch {}
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time < 0) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!activeLesson || !hasAudio) {
    return null;
  }

  return (
    <div className={`sticky top-0 z-20 ${themeStyles.stickyWrapper} py-2.5 sm:py-3 px-3.5 sm:px-5 rounded-2xl transition-colors w-full mb-3`}>
      <div className={`${themeStyles.container} transition-colors py-0.5 px-0.5 font-sans`}>
      {!isGlobalPlayingThisLesson && hasAudio && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onCanPlay={handleCanPlay}
          onPlay={() => {
            sessionStartRef.current = Date.now();
            if (audioRef.current) {
              const expectedTime = currentTime;
              if (expectedTime > 0 && Math.abs(audioRef.current.currentTime - expectedTime) > 0.5) {
                try {
                  audioRef.current.currentTime = expectedTime;
                } catch (_) {}
              }
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onPlaying={() => {
            sessionStartRef.current = Date.now();
            if (audioRef.current) {
              const expectedTime = currentTime;
              if (expectedTime > 0 && Math.abs(audioRef.current.currentTime - expectedTime) > 0.5) {
                try {
                  audioRef.current.currentTime = expectedTime;
                } catch (_) {}
              }
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPause={() => {
            setIsPlaying(false);
            if (audioRef.current) {
              flushPendingListeningTime(audioRef.current.currentTime);
            }
          }}
          onSeeked={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              flushPendingListeningTime(cur);
              if (!audioRef.current.paused) {
                sessionStartRef.current = Date.now();
              }
              setCurrentTime(cur);
              onListeningTick?.(0, true, cur);
            }
          }}
          onEnded={() => {
            if (audioRef.current) {
              flushPendingListeningTime(audioRef.current.currentTime);
            }
            setIsPlaying(false);
            if (activeLesson?.id) {
              saveCurrentProgress(0);
            }
            if (onAudioEnded) onAudioEnded();
          }}
          onError={() => {
            console.error("Audio playback error occurred");
            setError(t("reader.playback_error_desc", "Playback error: The audio source could not be resolved. Please click 'Reset Audio File' to re-upload."));
            setIsPlaying(false);
          }}
          className="hidden"
          autoPlay={false}
          preload="metadata"
        />
      )}

      {/* ── Mobile Layout (Ultra-compact < 65px total height) ── */}
      <div className="flex flex-col lg:hidden space-y-1.5 min-w-0">
        {/* Top line: Truncated Title + Reader Actions + Sentence Loop + Speed Badge */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <Headphones className={`w-3.5 h-3.5 shrink-0 ${effectiveIsPlaying ? "text-teal-600 dark:text-teal-400 animate-pulse" : "text-zinc-400"}`} />
            <p className={`text-xs font-medium truncate max-w-[180px] sm:max-w-xs md:max-w-md ${themeStyles.titleText}`} title={activeLesson.title}>
              {activeLesson.title || t("reader.audio_player", "Audio Player")}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Sentence Loop Toggle */}
            <button
              type="button"
              onClick={() => setIsSentenceLoop(!isSentenceLoop)}
              className={`p-1 shrink-0 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                isSentenceLoop
                  ? "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-300 border-teal-300 dark:border-teal-700 shadow-3xs"
                  : "text-zinc-500 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60 hover:bg-black/5 dark:hover:bg-white/5"
              }`}
              title={t("reader.sentence_loop", "Sentence loop mode")}
            >
              <Repeat1 className="w-3 h-3" />
            </button>

            {/* Speed Badge */}
            <button
              type="button"
              onClick={handleSpeedToggle}
              className="px-1.5 py-0.5 shrink-0 text-[10px] font-mono font-bold border border-zinc-200/80 dark:border-zinc-700/80 rounded-md hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-zinc-700 dark:text-zinc-300 transition-colors"
              title={t("reader.playback_speed", "Playback speed")}
            >
              {effectivePlaybackRate}x
            </button>
          </div>
        </div>

        {/* Bottom line: Play/Pause + Rewind/Forward + Slider + Timestamps */}
        <div className="flex items-center gap-2">
          {/* Compact Play Button */}
          <button
            type="button"
            onClick={handlePlayPause}
            className="w-8 h-8 rounded-full bg-teal-600 hover:bg-teal-500 active:scale-95 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-xs transition-all"
            title={effectiveIsPlaying ? t("reader.pause", "Pause") : t("reader.play", "Play")}
          >
            {effectiveIsPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>

          {/* -5s Rewind */}
          <button
            type="button"
            onClick={() => handleSkipSeconds(-5)}
            className="w-6 h-6 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-transform"
            title={t("reader.skip_back_5s", "Rewind 5 seconds")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* +5s Forward */}
          <button
            type="button"
            onClick={() => handleSkipSeconds(5)}
            className="w-6 h-6 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-transform"
            title={t("reader.skip_forward_5s", "Forward 5 seconds")}
          >
            <RotateCcw className="w-3.5 h-3.5 -scale-x-100" />
          </button>

          {/* Progress Slider */}
          <input
            type="range"
            min="0"
            max={effectiveDuration || 100}
            step="0.05"
            value={effectiveCurrentTime}
            onChange={handleAudioSeek}
            aria-label={t("reader.audio_track_label", "Lesson audio track")}
            className={`h-1 flex-1 rounded-full ${themeStyles.sliderTrack} accent-teal-600 dark:accent-teal-500 cursor-pointer focus:outline-none`}
          />

          {/* Timestamp */}
          <span className={`text-[10px] ${themeStyles.subText} whitespace-nowrap font-mono tabular-nums shrink-0`}>
            {formatTime(effectiveCurrentTime)} / {formatTime(effectiveDuration)}
          </span>
        </div>
      </div>

      {/* ── Desktop Layout (lg:flex) ── */}
      <div className="hidden lg:flex items-center gap-4">

        {/* ── Left: Lesson title ─────────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className={`w-7 h-7 ${themeStyles.badge} flex items-center justify-center shrink-0 ${effectiveIsPlaying ? "animate-pulse" : ""}`}>
            <Headphones className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 max-w-[180px] xl:max-w-[260px] overflow-hidden">
            <p className={`text-xs font-bold truncate ${themeStyles.titleText}`} title={activeLesson.title}>
              {activeLesson.title || t("reader.audio_player", "Audio Player")}
            </p>
          </div>
        </div>

        {/* ── Center: Transport + Progress Bar ───────────────────────────── */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {/* Transport row */}
          <div className="flex items-center gap-2">
            {/* Prev Sentence */}
            <button type="button" onClick={handlePrevSentence}
              className="p-1.5 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all active:scale-95 cursor-pointer"
              title={t("reader.prev_sentence", "Previous sentence")}>
              <SkipBack className="w-4 h-4" />
            </button>

            {/* ↺ 5s */}
            <button type="button" onClick={() => handleSkipSeconds(-5)}
              className={`px-2 py-1 text-[11px] font-bold tabular-nums rounded-xl transition-all active:scale-95 inline-flex items-center gap-0.5 cursor-pointer ${themeStyles.buttonBg}`}
              title={t("reader.skip_back_5s", "Rewind 5 seconds")}>
              <RotateCcw className="w-3 h-3" /><span>5s</span>
            </button>

            {/* Play / Pause hero button */}
            <button type="button" onClick={handlePlayPause}
              className="w-10 h-10 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white rounded-full shadow-md hover:shadow-teal-500/30 flex items-center justify-center transition-all cursor-pointer shrink-0"
              title={effectiveIsPlaying ? t("reader.pause", "Pause") : t("reader.play", "Play")}>
              {effectiveIsPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            {/* 5s ↻ */}
            <button type="button" onClick={() => handleSkipSeconds(5)}
              className={`px-2 py-1 text-[11px] font-bold tabular-nums rounded-xl transition-all active:scale-95 inline-flex items-center gap-0.5 cursor-pointer ${themeStyles.buttonBg}`}
              title={t("reader.skip_forward_5s", "Forward 5 seconds")}>
              <span>5s</span><RotateCcw className="w-3 h-3 -scale-x-100" />
            </button>

            {/* Next Sentence */}
            <button type="button" onClick={handleNextSentence}
              className="p-1.5 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all active:scale-95 cursor-pointer"
              title={t("reader.next_sentence", "Next sentence")}>
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Progress slider */}
          <div className="flex items-center gap-2 w-full text-[11px] font-mono font-semibold tabular-nums">
            <span className={`w-8 text-right shrink-0 ${themeStyles.subText}`}>{formatTime(effectiveCurrentTime)}</span>
            <input
              type="range" min="0" max={effectiveDuration || 100} step="0.05" value={effectiveCurrentTime}
              onChange={handleAudioSeek}
              aria-label={t("reader.audio_track_label", "Lesson audio track")}
              aria-valuemin={0} aria-valuemax={Math.round(effectiveDuration || 100)} aria-valuenow={Math.round(effectiveCurrentTime)}
              className={`flex-1 h-1.5 rounded-full ${themeStyles.sliderTrack} accent-teal-600 dark:accent-teal-500 cursor-pointer focus:outline-none`}
            />
            <span className={`w-8 shrink-0 ${themeStyles.subText}`}>{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* ── Right: Immersion tools (Loop, Speed, Volume) ───────────────── */}
        <div className="flex items-center gap-2 shrink-0 justify-end">
          {/* Sentence Loop */}
          <button type="button" onClick={() => setIsSentenceLoop(!isSentenceLoop)}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              isSentenceLoop
                ? "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-300 border border-teal-300 dark:border-teal-700 shadow-xs"
                : themeStyles.buttonBg
            }`}
            title={t("reader.sentence_loop", "Sentence loop mode — replays the current sentence on repeat")}>
            <Repeat1 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[11px]">{t("reader.sentence_loop_short", "Loop")}</span>
          </button>

          {/* Speed */}
          <button type="button" onClick={handleSpeedToggle}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer ${themeStyles.buttonBg}`}
            title={t("reader.playback_speed", "Playback speed")}>
            <FastForward className="w-3 h-3 opacity-60" />
            <span className="font-mono text-[11px]">{effectivePlaybackRate}x</span>
          </button>

          {/* Volume popover */}
          <div className="relative flex items-center" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}>
            <button type="button" onClick={() => setIsMuted(!isMuted)}
              className="p-2 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title={t("reader.volume", "Volume")}>
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" />
                : volume < 0.5 ? <Volume1 className="w-4 h-4" />
                : <Volume2 className="w-4 h-4" />}
            </button>
            {showVolumeSlider && (
              <div className={`absolute right-0 bottom-full mb-2 p-2 ${themeStyles.container} border border-black/5 dark:border-white/10 rounded-xl shadow-lg z-50 flex items-center w-28 animate-in fade-in zoom-in-95 duration-100`}>
                <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className={`w-full h-1.5 rounded-full ${themeStyles.sliderTrack} accent-teal-600 dark:accent-teal-500 cursor-pointer`}
                  title={`${Math.round((isMuted ? 0 : volume) * 100)}%`} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="mt-2.5 bg-red-950/95 text-red-100 border border-red-800 p-3 text-xs rounded-xl space-y-2 animate-in fade-in duration-150">
          <div>
            <p className="font-bold text-red-300">{t("reader.audio_playback_issue", "Audio Playback Issue")}</p>
            <p className="opacity-90 mt-0.5 leading-relaxed">{error}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { onAudioUpload("", null); setError(null); }}
              className="px-2.5 py-1 bg-red-800 hover:bg-red-700 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer">
              {t("reader.reset_audio_file", "Reset Audio File")}
            </button>
            <button onClick={() => setError(null)}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer">
              {t("reader.dismiss", "Dismiss")}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
