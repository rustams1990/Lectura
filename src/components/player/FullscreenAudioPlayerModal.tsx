import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  ListMusic,
  ChevronDown,
  BookOpen,
  Headphones,
  Download,
  Loader2,
} from 'lucide-react';
import { usePlaylistStore, RepeatMode } from '../../store/playlistStore';
import { usePodcastStore } from '../../store/podcastStore';
import { useToast } from '../../context/ToastContext';
import { Lesson, PodcastEpisode } from '../../types';
import { useTranslation } from 'react-i18next';

interface FullscreenAudioPlayerModalProps {
  lessons?: Lesson[];
  selectedTargetLanguage?: string;
  onOpenLesson?: (lessonId: string) => void;
}

const SPEED_PRESETS = [0.8, 1.0, 1.2, 1.5, 2.0];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function FullscreenAudioPlayerModal({
  lessons = [],
  selectedTargetLanguage,
  onOpenLesson,
}: FullscreenAudioPlayerModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const {
    queue,
    currentIndex,
    isPlaying,
    repeatMode,
    playbackRate,
    currentTime,
    duration,
    isExpanded,
    collapsePlayer,
    togglePlay,
    playNext,
    playPrev,
    seekDelta,
    seek,
    setPlaybackRate,
    setRepeatMode,
    setShowQueueModal,
  } = usePlaylistStore();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const currentTrack = queue[currentIndex] || null;

  // Check if current track corresponds to an imported lesson in user's library
  const existingLesson = useMemo(() => {
    if (!currentTrack || !lessons || lessons.length === 0) return null;
    return (
      lessons.find((l) => l.id === currentTrack.id) ||
      lessons.find((l) => Boolean(currentTrack.guid && l.id === currentTrack.guid)) ||
      lessons.find((l) => Boolean(currentTrack.guid && (l as any).podcastGuid === currentTrack.guid)) ||
      lessons.find(
        (l) =>
          Boolean(
            currentTrack.audioUrl &&
              l.audioUrl &&
              (l.audioUrl === currentTrack.audioUrl ||
                l.audioUrl.includes(currentTrack.audioUrl) ||
                currentTrack.audioUrl.includes(l.audioUrl))
          )
      ) ||
      null
    );
  }, [currentTrack, lessons]);

  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(currentTime);
    }
  }, [currentTime, isSeeking]);

  // Extract vibrant dominant color from cover image for Apple Podcasts-style gradient
  useEffect(() => {
    if (!currentTrack?.coverUrl) {
      setDominantColor(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = currentTrack.coverUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 12;
        canvas.height = 12;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 12, 12);
          const data = ctx.getImageData(0, 0, 12, 12).data;
          let r = 0,
            g = 0,
            b = 0,
            count = 0;
          for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            // Ignore extreme pure blacks or stark whites
            if (brightness > 25 && brightness < 230) {
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
              count++;
            }
          }
          if (count > 0) {
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            setDominantColor(`rgb(${r}, ${g}, ${b})`);
          }
        }
      } catch {
        // Fallback gracefully on CORS restrictions
      }
    };
  }, [currentTrack?.coverUrl]);

  // Handle ESC key to collapse
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        collapsePlayer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, collapsePlayer]);

  if (!currentTrack) {
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

  // Dynamic Action: Open existing lesson OR import streaming episode and open reader
  const handleActionClick = async () => {
    if (existingLesson) {
      collapsePlayer();
      onOpenLesson?.(existingLesson.id);
      return;
    }

    // It's a streaming podcast episode not yet in library
    if (isImporting) return;
    setIsImporting(true);

    try {
      const activeLang =
        currentTrack.targetLanguage ||
        (selectedTargetLanguage && selectedTargetLanguage !== 'All' ? selectedTargetLanguage : 'es');
      const taskId = `podcast_player_import_${currentTrack.guid || currentTrack.id}_${Date.now()}`;

      const epObj: PodcastEpisode = {
        guid: currentTrack.guid || currentTrack.id,
        title: currentTrack.title,
        audioUrl: currentTrack.audioUrl,
        originalAudioUrl: currentTrack.audioUrl,
        artworkUrl: currentTrack.coverUrl || '',
        description: currentTrack.description || '',
        duration: currentTrack.duration ?? null,
        pubDate: currentTrack.pubDate || new Date().toISOString(),
        transcriptUrl: currentTrack.transcriptUrl || '',
        hasTranscript: currentTrack.hasTranscript || false,
        fileSize: null,
      };

      const newLessonId = await usePodcastStore.getState().importEpisode(
        epObj,
        currentTrack.bookTitle || currentTrack.channelName || 'Podcast',
        activeLang,
        currentTrack.coverUrl || '',
        activeLang,
        taskId
      );

      if (newLessonId) {
        showToast(
          t('podcasts.episode_imported_toast', 'Episode "{{title}}" added to library', { title: currentTrack.title }),
          'success'
        );
        collapsePlayer();
        onOpenLesson?.(newLessonId);
      } else {
        showToast(
          t('podcasts.episode_import_failed_toast', 'Failed to create lesson: {{error}}', {
            title: currentTrack.title,
            error: 'Could not generate lesson',
          }),
          'error'
        );
      }
    } catch (err: any) {
      console.error('Failed to import episode from player:', err);
      showToast(
        t('podcasts.episode_import_failed_toast', 'Failed to create lesson: {{error}}', {
          title: currentTrack.title,
          error: err.message || 'Error',
        }),
        'error'
      );
    } finally {
      setIsImporting(false);
    }
  };

  // Touch swipe-down gesture to collapse
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchEndY - touchStartY.current;
      if (deltaY > 80) {
        collapsePlayer();
      }
      touchStartY.current = null;
    }
  };

  const progressPercent = duration > 0 ? (seekValue / duration) * 100 : 0;
  const remainingTime = Math.max(0, duration - seekValue);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={
        dominantColor
          ? {
              background: `linear-gradient(180deg, ${dominantColor} 0%, rgba(20, 20, 24, 0.94) 55%, #09090b 100%)`,
            }
          : undefined
      }
      className={`fixed inset-0 z-50 flex flex-col justify-between bg-zinc-950 text-white px-5 sm:px-8 pt-[max(1rem,env(safe-area-inset-top,16px))] pb-[max(1.5rem,env(safe-area-inset-bottom,24px))] pl-[max(1.25rem,env(safe-area-inset-left,16px))] pr-[max(1.25rem,env(safe-area-inset-right,16px))] transition-all duration-300 ease-out overflow-y-auto overscroll-contain select-none ${
        isExpanded ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      {/* Dynamic blurred ambient glow from cover */}
      {currentTrack.coverUrl && (
        <div
          className="absolute inset-0 opacity-30 dark:opacity-35 blur-3xl pointer-events-none -z-10 scale-125 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${currentTrack.coverUrl})` }}
        />
      )}

      {/* ── 1. Top Bar / Drag Handle ──────────────────────────────────── */}
      <div className="w-full flex items-center justify-between pt-1 sm:pt-2 shrink-0">
        <button
          type="button"
          onClick={collapsePlayer}
          className="p-2 -ml-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95 cursor-pointer"
          title="Collapse Player"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div
          className="flex flex-col items-center cursor-pointer group px-4 py-1 max-w-[65%]"
          onClick={collapsePlayer}
        >
          <div className="w-12 h-1.5 bg-white/30 group-hover:bg-white/50 rounded-full mb-1.5 transition-all" />
          <span className="text-[11px] font-semibold text-white/70 group-hover:text-white/90 uppercase tracking-wider transition-colors truncate max-w-full text-center">
            {currentTrack.bookTitle || currentTrack.channelName || t('player.now_playing', 'Now Playing')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowQueueModal(true)}
          className="p-2 -mr-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95 cursor-pointer relative"
          title={t('player.queue', 'Play Queue')}
        >
          <ListMusic className="w-5 h-5" />
          {queue.length > 1 && (
            <span className="absolute top-1 right-1 bg-teal-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center font-mono shadow-xs">
              {queue.length}
            </span>
          )}
        </button>
      </div>

      {/* ── 2. Large Cover Art in Center ──────────────────────────────── */}
      <div className="flex items-center justify-center my-auto py-4 sm:py-6 shrink min-h-0">
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 max-w-[72vw] max-h-[72vw] rounded-3xl overflow-hidden shadow-2xl bg-zinc-900/80 border border-white/15 flex items-center justify-center group backdrop-blur-md">
          {currentTrack.coverUrl ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-teal-950 to-zinc-900 flex flex-col items-center justify-center text-teal-400 gap-3">
              <Headphones className="w-20 h-20 opacity-80" />
            </div>
          )}

          {/* Track counter badge in corner */}
          <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] font-mono font-bold text-white/90 border border-white/10 shadow-xs">
            {currentIndex + 1} / {queue.length}
          </div>
        </div>
      </div>

      {/* ── 3. Bottom Controls Container ─────────────────────────────── */}
      <div className="w-full max-w-md mx-auto flex flex-col shrink-0 pb-2">
        {/* Track Title & Subtitle + Dynamic Action Button */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-teal-400 line-clamp-1 mb-1 uppercase tracking-wider">
              {currentTrack.bookTitle || currentTrack.channelName || t('player.audio_lesson', 'Lesson Audio')}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-white line-clamp-2 leading-snug drop-shadow-xs">
              {currentTrack.title}
            </h2>
          </div>

          {onOpenLesson && (
            <button
              type="button"
              onClick={handleActionClick}
              disabled={isImporting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs backdrop-blur-sm active:scale-95 ${
                existingLesson
                  ? 'bg-white/10 hover:bg-teal-600 text-white/90 hover:text-white border border-white/15 hover:border-teal-500'
                  : isImporting
                  ? 'bg-teal-500/30 text-teal-300 border border-teal-500/50 cursor-wait animate-pulse'
                  : 'bg-teal-600 hover:bg-teal-500 text-white border border-teal-400/50 shadow-md hover:shadow-teal-600/30'
              }`}
              title={
                existingLesson
                  ? t('podcasts.open_lesson', 'Open lesson')
                  : t('podcasts.import_and_open', 'Import & Open lesson')
              }
            >
              {isImporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : existingLesson ? (
                <BookOpen className="w-3.5 h-3.5" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {isImporting
                  ? t('podcasts.importing', 'Creating…')
                  : existingLesson
                  ? t('podcasts.open_lesson', 'Open lesson')
                  : t('podcasts.import_and_open', 'Import & Open')}
              </span>
            </button>
          )}
        </div>

        {/* ── 4. Progress Bar & Timestamps ─────────────────────────────── */}
        <div className="space-y-1.5 mb-6">
          <div className="relative flex items-center py-2 group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={seekValue}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={handleSliderChange}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer accent-teal-400 focus:outline-none"
            />
            {/* Custom filled track highlight */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-2 bg-teal-400 rounded-full pointer-events-none"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-white/70 font-mono font-medium px-0.5">
            <span>{formatTime(seekValue)}</span>
            <span>-{formatTime(remainingTime)}</span>
          </div>
        </div>

        {/* ── 5. Main Playback Controls ────────────────────────────────── */}
        <div className="flex items-center justify-between px-2 sm:px-4 mb-5">
          {/* Speed Preset Button */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="text-xs font-mono font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-xl transition cursor-pointer active:scale-95 min-w-[42px] text-center backdrop-blur-sm"
            title={t('player.speed', 'Playback Speed')}
          >
            {playbackRate}x
          </button>

          {/* Previous Track */}
          <button
            type="button"
            onClick={playPrev}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition active:scale-95 cursor-pointer"
            title="Previous Track"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Rewind 15s (Symmetric circular SVG) */}
          <button
            type="button"
            onClick={() => seekDelta(-15)}
            className="relative flex items-center justify-center p-2 text-white/85 hover:text-white hover:bg-white/10 rounded-full transition active:scale-95 cursor-pointer"
            title="-15s"
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.85.99-6.57 2.6L3 8" />
              <polyline points="3 3 3 8 8 8" />
            </svg>
            <span className="absolute text-[9px] font-bold font-mono mt-0.5">15</span>
          </button>

          {/* Hero Play / Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
            ) : (
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
            )}
          </button>

          {/* Forward 30s (Symmetric circular SVG) */}
          <button
            type="button"
            onClick={() => seekDelta(30)}
            className="relative flex items-center justify-center p-2 text-white/85 hover:text-white hover:bg-white/10 rounded-full transition active:scale-95 cursor-pointer"
            title="+30s"
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.6L21 8" />
              <polyline points="21 3 21 8 16 8" />
            </svg>
            <span className="absolute text-[9px] font-bold font-mono mt-0.5">30</span>
          </button>

          {/* Next Track */}
          <button
            type="button"
            onClick={playNext}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition active:scale-95 cursor-pointer"
            title="Next Track"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Repeat Mode */}
          <button
            type="button"
            onClick={cycleRepeatMode}
            className={`p-2 rounded-full transition cursor-pointer active:scale-95 ${
              repeatMode !== 'off'
                ? 'bg-teal-500/20 text-teal-400 font-bold'
                : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
            title={
              repeatMode === 'one'
                ? t('player.repeat_one', 'Repeat One')
                : repeatMode === 'all'
                ? t('player.repeat_all', 'Repeat All')
                : t('player.repeat_off', 'Repeat Off')
            }
          >
            {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
