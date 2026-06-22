/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { Lesson } from "../types";
import { Play, Pause, RotateCcw, Volume2, FastForward } from "lucide-react";

interface AudioPlayerProps {
  lesson: Lesson;
  onAudioUpload: (audioUrl: string, base64: string | null) => void;
  onListeningTick: (seconds: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  seekToTime?: number | null;
}

export default function AudioPlayer({
  lesson,
  onAudioUpload,
  onListeningTick,
  onTimeUpdate,
  seekToTime
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Time tracker for listening stats
  const lastTickTimeRef = useRef<number | null>(null);

  // Effect to clean up current audio state on lesson change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
  }, [lesson.id]);

  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekToTime;
      setCurrentTime(seekToTime);
    }
  }, [seekToTime]);

  useEffect(() => {
    let tickInterval: NodeJS.Timeout;
    if (isPlaying) {
      lastTickTimeRef.current = Date.now();
      tickInterval = setInterval(() => {
        if (lastTickTimeRef.current) {
          const delta = (Date.now() - lastTickTimeRef.current) / 1000;
          onListeningTick(delta);
          lastTickTimeRef.current = Date.now();
        }
      }, 1000);
    } else {
      lastTickTimeRef.current = null;
    }

    return () => {
      clearInterval(tickInterval);
    };
  }, [isPlaying, onListeningTick]);

  // Audio elements event handlers
  const handlePlayPause = () => {
    if (!audioRef.current || !hasAudio) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Playback error:", err?.message || err);
      });
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      setCurrentTime(cur);
      if (onTimeUpdate) {
        onTimeUpdate(cur);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleSpeedToggle = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const newRate = rates[nextIdx];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const isValidUrl = (url: any): boolean => {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (
      trimmed === "" ||
      trimmed === "null" ||
      trimmed === "undefined" ||
      trimmed === "empty" ||
      trimmed === "null" ||
      trimmed.startsWith("null") ||
      trimmed.startsWith("undefined")
    ) {
      return false;
    }
    return true;
  };

  const hasAudio = isValidUrl(lesson.audioUrl) || isValidUrl(lesson.audioBase64);
  const audioSrc = isValidUrl(lesson.audioUrl)
    ? lesson.audioUrl!.trim()
    : (isValidUrl(lesson.audioBase64) ? `data:audio/mp3;base64,${lesson.audioBase64!.trim()}` : "");

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative bg-gradient-to-r from-teal-50/70 via-emerald-50/60 to-teal-50/80 dark:from-zinc-900/90 dark:via-zinc-950/90 dark:to-zinc-900/90 text-zinc-800 dark:text-zinc-100 rounded-2xl border border-teal-100/80 dark:border-zinc-800/80 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
      {/* Hidden natural HTML5 voice emitter */}
      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            console.error("Audio playback error occurred: The audio element failed to load or play.");
            setError("Playback error: The audio source could not be resolved. This often happens because browser blob URLs aren't preserved across page reloads. Please click 'Reset Audio File' to upload the file again or generate an AI speech narrator.");
            setIsPlaying(false);
          }}
          className="hidden"
          autoPlay={false}
        />
      )}

      {/* Narrative & Audio info */}
      <div className="flex items-center gap-4 w-full md:w-auto">
        <div className={`p-3.5 rounded-xl bg-teal-600/10 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-200/50 dark:border-teal-900/40 flex items-center justify-center ${isPlaying ? "animate-pulse" : ""}`}>
          <Volume2 className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-105">Аудиоплеер (Audio)</h4>
            {hasAudio && (
              <button
                onClick={() => {
                  onAudioUpload("", null);
                  setError(null);
                }}
                className="text-[10px] text-zinc-500 hover:text-red-500 font-semibold hover:underline"
                title="Reset or upload a different companion audio file"
              >
                (Сбросить / Reset)
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {hasAudio ? "Аудиофайл привязан и синхронизирован" : "Аудиодорожка к тексту пока не привязана"}
          </p>
        </div>
      </div>

      {/* Main player HUD */}
      {hasAudio ? (
        <div className="flex flex-col items-center gap-2 flex-grow max-w-lg w-full">
          {/* Timeline slider */}
          <div className="flex items-center gap-3 w-full text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.05"
              value={currentTime}
              onChange={handleAudioSeek}
              className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 accent-teal-600 cursor-pointer focus:outline-none"
            />
            <span>{formatTime(duration)}</span>
          </div>

          {/* Action cluster buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleReset}
              className="p-2 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
              title="Reset Audio"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>

            <button
              onClick={handlePlayPause}
              className="p-3.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-full transition-all shadow-md focus:outline-none cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={handleSpeedToggle}
              className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 dark:hover:text-white rounded-lg border border-zinc-200 dark:border-zinc-800 transition-colors inline-flex items-center gap-1.5"
              title="Playback speed"
            >
              <FastForward className="w-3.5 h-3.5" />
              {playbackRate}x
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-grow flex items-center justify-end text-right md:py-2.5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed max-w-lg">
            У этого урока нет озвучки. Вы можете сгенерировать ИИ-озвучку или загрузить аудиофайл в <span className="font-bold text-teal-600 dark:text-teal-400">окне редактирования урока</span> (кнопка карандаша в правом верхнем углу текста).
          </p>
        </div>
      )}

      {/* Error state HUD panel */}
      {error && (
        <div className="absolute top-2 right-2 bg-red-950/95 text-red-100 border border-red-800 p-3.5 text-xs rounded-xl max-w-sm shadow-xl z-50 backdrop-blur-sm space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div>
            <p className="font-bold text-red-300">Audio Playback Issue</p>
            <p className="opacity-90 mt-0.5 leading-relaxed">{error}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                onAudioUpload("", null);
                setError(null);
              }}
              className="px-2.5 py-1 bg-red-800 hover:bg-red-700 active:scale-95 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer"
            >
              Reset Audio File
            </button>
            <button
              onClick={() => setError(null)}
              className="px-2.5 py-1 bg-zinc-850 hover:bg-zinc-800 active:scale-95 text-zinc-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
