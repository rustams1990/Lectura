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
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { parseTimestampToSeconds } from "../hooks/useReaderPagination";
import { usePlaylistStore } from "../store/playlistStore";

const SPEED_PRESETS = [0.5, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0];

interface AudioPlayerBarProps {
  onAudioUpload: (audioUrl: string, base64: string | null) => void;
  onListeningTick: (seconds: number) => void;
  onAudioEnded?: () => void;
}

export default function AudioPlayerBar({
  onAudioUpload,
  onListeningTick,
  onAudioEnded,
}: AudioPlayerBarProps) {
  const { t } = useTranslation();
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekToTime;
      setCurrentTime(seekToTime);
      setSeekToTime(null);
    }
  }, [seekToTime, setCurrentTime, setSeekToTime]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    let tickInterval: NodeJS.Timeout;
    if (isPlaying) {
      // Track audio-time delta using audioRef.currentTime so playback speed is accounted for
      let lastAudioTime = audioRef.current?.currentTime ?? null;
      tickInterval = setInterval(() => {
        if (audioRef.current && lastAudioTime !== null) {
          const nowAudioTime = audioRef.current.currentTime;
          const delta = nowAudioTime - lastAudioTime;
          // Positive delta means audio advanced (skip negative from seeks or reloads)
          if (delta > 0 && delta < 10) {
            onListeningTick(delta);
          }
          lastAudioTime = nowAudioTime;
        } else if (audioRef.current) {
          lastAudioTime = audioRef.current.currentTime;
        }
      }, 1000);
    }

    return () => {
      clearInterval(tickInterval);
    };
  }, [isPlaying, onListeningTick]);

  if (!activeLesson) return null;

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

  const hasAudio = isValidUrl(activeLesson.audioUrl) || isValidUrl(activeLesson.audioBase64);
  const rawAudioSrc = isValidUrl(activeLesson.audioUrl)
    ? activeLesson.audioUrl!.trim()
    : (isValidUrl(activeLesson.audioBase64) 
        ? (activeLesson.audioBase64!.trim().startsWith("data:") ? activeLesson.audioBase64!.trim() : `data:audio/mp3;base64,${activeLesson.audioBase64!.trim()}`)
        : "");

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
    if (!audioRef.current || !hasAudio) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // If global playlist is active, pause it to prevent double sound
      if (usePlaylistStore.getState().isPlaying) {
        usePlaylistStore.getState().setIsPlaying(false);
      }
      audioRef.current.play().catch((err) => {
        console.error("Playback error:", err?.message || err);
      });
      setIsPlaying(true);
    }
  };

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

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration) {
      const durSec = Math.round(audioRef.current.duration);
      setDuration(durSec);
      if (activeLesson && activeLesson.audioDuration !== durSec) {
        activeLesson.audioDuration = durSec;
      }
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleSkipSeconds = useCallback((delta: number) => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const target = Math.max(0, Math.min(duration || Infinity, cur + delta));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  }, [duration, setCurrentTime]);

  const handlePrevSentence = useCallback(() => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    if (allTimestamps.length === 0) { handleSkipSeconds(-5); return; }
    let target = 0;
    for (let i = allTimestamps.length - 1; i >= 0; i--) {
      if (allTimestamps[i] < cur - 1.2) { target = allTimestamps[i]; break; }
    }
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  }, [allTimestamps, handleSkipSeconds, setCurrentTime]);

  const handleNextSentence = useCallback(() => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    if (allTimestamps.length === 0) { handleSkipSeconds(5); return; }
    let target = duration || cur + 5;
    for (let i = 0; i < allTimestamps.length; i++) {
      if (allTimestamps[i] > cur + 0.4) { target = allTimestamps[i]; break; }
    }
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  }, [allTimestamps, duration, handleSkipSeconds, setCurrentTime]);

  const handleSpeedToggle = () => {
    const curIdx = SPEED_PRESETS.findIndex((r) => Math.abs(r - playbackRate) < 0.05);
    const nextIdx = (curIdx + 1) % SPEED_PRESETS.length;
    const newRate = SPEED_PRESETS[nextIdx];
    setPlaybackRate(newRate);
    if (audioRef.current) audioRef.current.playbackRate = newRate;
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

  return (
    <div className="sticky top-0 z-30 bg-white dark:bg-zinc-950 pt-2 pb-1.5 -mx-1 px-1">
      <div className="bg-white/98 dark:bg-zinc-900/98 backdrop-blur-sm rounded-2xl border border-zinc-200/80 dark:border-zinc-800/90 shadow-md hover:shadow-lg transition-shadow p-3 sm:p-3.5 text-zinc-800 dark:text-zinc-100 font-sans">
      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => {
            setIsPlaying(false);
            if (onAudioEnded) onAudioEnded();
          }}
          onError={() => {
            console.error("Audio playback error occurred");
            setError(t("reader.playback_error_desc", "Playback error: The audio source could not be resolved. Please click 'Reset Audio File' to re-upload."));
            setIsPlaying(false);
          }}
          className="hidden"
          autoPlay={false}
        />
      )}

      <div className="flex flex-col lg:flex-row items-center gap-3 lg:gap-4">

        {/* ── Left: Lesson badge + trash ─────────────────────────────────── */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto shrink-0 min-w-0">
          <div className={`w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 ${isPlaying ? "animate-pulse" : ""}`}>
            <Headphones className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1 lg:max-w-[200px] xl:max-w-[260px]">
            <span className="text-[10px] uppercase font-black tracking-wider text-teal-600 dark:text-teal-400">
              {t("reader.audio_track", "Audio Track")}
            </span>
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate" title={activeLesson.title}>
              {activeLesson.title || t("reader.audio_player", "Audio Player")}
            </p>
          </div>
          {hasAudio && (
            <button
              type="button"
              onClick={() => { onAudioUpload("", null); setError(null); }}
              className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0 ml-auto lg:ml-0"
              title={t("reader.reset_audio_tooltip", "Remove audio track")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Center: Transport + Progress Bar ───────────────────────────── */}
        <div className="flex flex-col items-center gap-2 w-full lg:flex-1 min-w-0">
          {/* Transport row */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Prev Sentence */}
            <button type="button" onClick={handlePrevSentence}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95 cursor-pointer"
              title={t("reader.prev_sentence", "Previous sentence")}>
              <SkipBack className="w-4 h-4" />
            </button>

            {/* ↺ 5s */}
            <button type="button" onClick={() => handleSkipSeconds(-5)}
              className="px-2 py-1 text-[11px] font-bold tabular-nums text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95 inline-flex items-center gap-0.5 cursor-pointer"
              title={t("reader.skip_back_5s", "Rewind 5 seconds")}>
              <RotateCcw className="w-3 h-3" /><span>5s</span>
            </button>

            {/* Play / Pause hero button */}
            <button type="button" onClick={handlePlayPause}
              className="w-10 h-10 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white rounded-full shadow-md hover:shadow-teal-500/30 flex items-center justify-center transition-all cursor-pointer shrink-0"
              title={isPlaying ? t("reader.pause", "Pause") : t("reader.play", "Play")}>
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            {/* 5s ↻ */}
            <button type="button" onClick={() => handleSkipSeconds(5)}
              className="px-2 py-1 text-[11px] font-bold tabular-nums text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95 inline-flex items-center gap-0.5 cursor-pointer"
              title={t("reader.skip_forward_5s", "Forward 5 seconds")}>
              <span>5s</span><RotateCcw className="w-3 h-3 -scale-x-100" />
            </button>

            {/* Next Sentence */}
            <button type="button" onClick={handleNextSentence}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95 cursor-pointer"
              title={t("reader.next_sentence", "Next sentence")}>
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Progress slider */}
          <div className="flex items-center gap-2 w-full text-[11px] font-mono font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
            <span className="w-8 text-right shrink-0">{formatTime(currentTime)}</span>
            <input
              type="range" min="0" max={duration || 100} step="0.05" value={currentTime}
              onChange={handleAudioSeek}
              aria-label={t("reader.audio_track_label", "Lesson audio track")}
              aria-valuemin={0} aria-valuemax={Math.round(duration || 100)} aria-valuenow={Math.round(currentTime)}
              className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 accent-teal-600 cursor-pointer focus:outline-none"
            />
            <span className="w-8 shrink-0">{formatTime(duration)}</span>
          </div>
        </div>

        {/* ── Right: Immersion tools (Loop, Speed, Volume) ───────────────── */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 justify-end w-full lg:w-auto">
          {/* Sentence Loop */}
          <button type="button" onClick={() => setIsSentenceLoop(!isSentenceLoop)}
            className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              isSentenceLoop
                ? "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-300 border-teal-300 dark:border-teal-700 shadow-xs"
                : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-700"
            }`}
            title={t("reader.sentence_loop", "Sentence loop mode — replays the current sentence on repeat")}>
            <Repeat1 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[11px]">{t("reader.sentence_loop_short", "Loop")}</span>
          </button>

          {/* Speed */}
          <button type="button" onClick={handleSpeedToggle}
            className="px-2.5 py-1.5 text-xs font-bold bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-all inline-flex items-center gap-1 cursor-pointer"
            title={t("reader.playback_speed", "Playback speed")}>
            <FastForward className="w-3 h-3 text-zinc-400" />
            <span className="font-mono text-[11px]">{playbackRate}x</span>
          </button>

          {/* Volume popover */}
          <div className="relative flex items-center" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}>
            <button type="button" onClick={() => setIsMuted(!isMuted)}
              className="p-2 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              title={t("reader.volume", "Volume")}>
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" />
                : volume < 0.5 ? <Volume1 className="w-4 h-4" />
                : <Volume2 className="w-4 h-4" />}
            </button>
            {showVolumeSlider && (
              <div className="absolute right-0 bottom-full mb-2 p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-lg z-50 flex items-center w-28 animate-in fade-in zoom-in-95 duration-100">
                <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 accent-teal-600 cursor-pointer"
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
