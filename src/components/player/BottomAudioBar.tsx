import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  FastForward,
  Repeat,
  Repeat1,
  ListMusic,
  X,
  Volume2,
  VolumeX,
  Headphones,
  Maximize2,
} from 'lucide-react';
import { usePlaylistStore, RepeatMode } from '../../store/playlistStore';
import { useTranslation } from 'react-i18next';

interface BottomAudioBarProps {
  onOpenLesson?: (lessonId: string) => void;
  activeTab?: string;
}

const SPEED_PRESETS = [0.8, 1.0, 1.2, 1.5, 2.0];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function BottomAudioBar({ onOpenLesson, activeTab }: BottomAudioBarProps) {
  const { t } = useTranslation();
  const {
    queue,
    currentIndex,
    isPlaying,
    repeatMode,
    playbackRate,
    currentTime,
    duration,
    togglePlay,
    playNext,
    playPrev,
    seekDelta,
    seek,
    setPlaybackRate,
    setRepeatMode,
    clearQueue,
    setShowQueueModal,
    expandPlayer,
    isOpen,
    closePlayer,
  } = usePlaylistStore();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const currentTrack = queue[currentIndex] || null;

  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(currentTime);
    }
  }, [currentTime, isSeeking]);

  // Hide the global floating bottom mini-player while not open, actively in the lesson reader view, or queue is empty
  if (!isOpen || activeTab === 'read' || queue.length === 0 || !currentTrack) {
    return null;
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(Number(e.target.value));
  };

  const handleSliderCommit = () => {
    setIsSeeking(false);
    seek(seekValue);
  };

  const cycleRepeatMode = () => {
    const nextMode: Record<RepeatMode, RepeatMode> = {
      off: 'all',
      all: 'one',
      one: 'off',
    };
    setRepeatMode(nextMode[repeatMode]);
  };

  const cyclePlaybackRate = () => {
    const currentIdx = SPEED_PRESETS.indexOf(playbackRate);
    const nextIdx = (currentIdx + 1) % SPEED_PRESETS.length;
    setPlaybackRate(SPEED_PRESETS[nextIdx]);
  };

  const effectiveDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (seekValue / effectiveDuration) * 100 : 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-2 sm:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none animate-in slide-in-from-bottom-5 duration-300">
      <div className="max-w-4xl mx-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl shadow-2xl p-2.5 sm:p-3.5 pointer-events-auto flex flex-col gap-2">
        
        {/* Main Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Left: Track Info & Cover */}
          <div
            onClick={expandPlayer}
            className="flex items-center gap-2.5 min-w-0 flex-1 sm:max-w-[280px] cursor-pointer group"
            title="Expand Fullscreen Player"
          >
            {/* Thumbnail */}
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 flex items-center justify-center shrink-0 overflow-hidden shadow-xs relative">
              {currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                />
              ) : (
                <Headphones className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              )}
            </div>

            {/* Title / Subtitle */}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-black text-zinc-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors leading-tight">
                {currentTrack.title}
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-medium flex items-center gap-1.5">
                {currentTrack.bookTitle && <span className="truncate">{currentTrack.bookTitle}</span>}
                {currentTrack.channelName && !currentTrack.bookTitle && <span className="truncate">{currentTrack.channelName}</span>}
                <span className="text-zinc-400">•</span>
                <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                  {currentIndex + 1}/{queue.length}
                </span>
              </span>
            </div>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Previous Track */}
            <button
              type="button"
              onClick={playPrev}
              className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
              title="Previous Track"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Rewind 10s */}
            <button
              type="button"
              onClick={() => seekDelta(-10)}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer hidden xs:flex items-center justify-center"
              title="-10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Play / Pause Main Button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>

            {/* Forward 10s */}
            <button
              type="button"
              onClick={() => seekDelta(10)}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer hidden xs:flex items-center justify-center"
              title="+10s"
            >
              <FastForward className="w-4 h-4" />
            </button>

            {/* Next Track */}
            <button
              type="button"
              onClick={playNext}
              className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
              title="Next Track"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Extra Controls (Speed, Repeat, Queue, Dismiss) */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Speed Selector */}
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-mono text-[11px] font-bold rounded-lg transition cursor-pointer"
              title={t('player.speed', 'Playback Speed')}
            >
              {playbackRate}x
            </button>

            {/* Repeat Toggle */}
            <button
              type="button"
              onClick={cycleRepeatMode}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                repeatMode !== 'off'
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-bold'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={
                repeatMode === 'one'
                  ? t('player.repeat_one', 'Repeat One')
                  : repeatMode === 'all'
                  ? t('player.repeat_all', 'Repeat All')
                  : t('player.repeat_off', 'Repeat Off')
              }
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>

            {/* Queue Toggle */}
            <button
              type="button"
              onClick={() => setShowQueueModal(true)}
              className="p-1.5 text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer relative"
              title={t('player.queue', 'Play Queue')}
            >
              <ListMusic className="w-4 h-4" />
              {queue.length > 1 && (
                <span className="absolute -top-1 -right-1 bg-teal-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center font-mono">
                  {queue.length}
                </span>
              )}
            </button>

            {/* Expand Fullscreen Player */}
            <button
              type="button"
              onClick={expandPlayer}
              className="p-1.5 text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
              title="Fullscreen Player"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Close / Dismiss Player */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Explicitly stop playback before closing
                const audio = document.getElementById('global-audio-element') as HTMLAudioElement;
                if (audio) {
                  window.dispatchEvent(new CustomEvent("force-history-flush", { detail: { exactTime: audio.currentTime } }));
                  audio.pause();
                }
                closePlayer();
              }}
              className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition cursor-pointer"
              title="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar & Timestamps Row */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 font-bold shrink-0 min-w-[32px]">
            {formatTime(seekValue)}
          </span>

          <div className="relative flex-1 flex items-center group py-1">
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              step={0.1}
              value={seekValue}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={handleSliderChange}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-teal-600 focus:outline-none"
            />
            {/* Custom filled track highlight */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-teal-500 rounded-full pointer-events-none"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>

          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 font-bold shrink-0 min-w-[32px] text-right">
            {formatTime(effectiveDuration)}
          </span>
        </div>

      </div>
    </div>
  );
}
