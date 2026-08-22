import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  X,
  Volume2,
  VolumeX,
  Headphones,
  Maximize2,
  BookOpen,
} from 'lucide-react';
import { usePlaylistStore } from '../../store/playlistStore';
import { usePodcastStore } from '../../store/podcastStore';
import { Lesson, PodcastEpisode } from '../../types';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../context/ToastContext';

interface BottomAudioBarProps {
  onOpenLesson?: (lessonId: string) => void;
  activeTab?: string;
  lessons?: Lesson[];
  selectedTargetLanguage?: string;
}

const SPEED_PRESETS = [0.8, 1.0, 1.2, 1.5, 2.0];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function BottomAudioBar({
  onOpenLesson,
  activeTab,
  lessons = [],
  selectedTargetLanguage,
}: BottomAudioBarProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const {
    queue,
    currentIndex,
    isPlaying,
    playbackRate,
    currentTime,
    duration,
    volume,
    isMuted,
    togglePlay,
    seekDelta,
    seek,
    setPlaybackRate,
    toggleMute,
    setVolume,
    expandPlayer,
    isOpen,
    closePlayer,
  } = usePlaylistStore();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  const currentTrack = queue[currentIndex] || null;

  // Check if current track matches a lesson already in the library
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

  // Hide floating bottom mini-player while not open, actively in reader tab, or queue is empty
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

  const cyclePlaybackRate = () => {
    const currentIdx = SPEED_PRESETS.indexOf(playbackRate);
    const nextIdx = (currentIdx + 1) % SPEED_PRESETS.length;
    setPlaybackRate(SPEED_PRESETS[nextIdx]);
  };

  const handleStudyClick = async () => {
    if (existingLesson) {
      onOpenLesson?.(existingLesson.id);
      return;
    }

    if (isImporting) return;
    setIsImporting(true);

    try {
      const activeLang =
        currentTrack.targetLanguage ||
        (selectedTargetLanguage && selectedTargetLanguage !== 'All' ? selectedTargetLanguage : 'es');
      const taskId = `podcast_bar_import_${currentTrack.guid || currentTrack.id}_${Date.now()}`;

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

  const effectiveDuration = duration > 0 ? duration : (currentTrack?.duration || 0);
  const progressPercent = effectiveDuration > 0 ? (seekValue / effectiveDuration) * 100 : 0;

  return (
    <div className="fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] sm:w-[calc(100%-4rem)] max-w-4xl pointer-events-auto animate-in slide-in-from-bottom-5 duration-300">
      <div className="shadow-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl px-3.5 py-2 sm:p-3 flex items-center justify-between gap-3 sm:gap-4 h-[64px] sm:h-[72px]">
        
        {/* ── 1. Left: Artwork + Titles (Fixed Compact Width) ─────────────── */}
        <div
          onClick={expandPlayer}
          className="flex items-center gap-2.5 min-w-0 max-w-[200px] sm:max-w-[230px] lg:max-w-[260px] shrink-0 cursor-pointer group select-none"
          title="Open Fullscreen Player"
        >
          {/* Cover Artwork (40x40 on mobile, 44x44 on tablet/desktop) */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center shrink-0 overflow-hidden shadow-xs relative">
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

          {/* Title & Show / Channel */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors leading-tight">
              {currentTrack.title}
            </span>
            <span className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-medium">
              {currentTrack.channelName || currentTrack.bookTitle || currentTrack.podcastTitle || t('podcasts.podcast', 'Podcast')}
            </span>
          </div>
        </div>

        {/* ── 2. Center: Controls & Wide Scrubber (Expands flex-1) ─────────── */}
        <div className="hidden sm:flex flex-col items-center justify-center flex-1 min-w-0 px-2 sm:px-4 gap-1">
          {/* Controls: -15s, Play/Pause, +30s */}
          <div className="flex items-center gap-3.5">
            {/* Rewind -15s */}
            <button
              type="button"
              onClick={() => seekDelta(-15)}
              className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer flex items-center justify-center relative active:scale-95"
              title="-15s"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.85.99-6.57 2.6L3 8" />
                <polyline points="3 3 3 8 8 8" />
              </svg>
              <span className="absolute text-[7px] font-bold font-mono">15</span>
            </button>

            {/* Play / Pause Teal Accent Circle */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-teal-500 hover:bg-teal-400 text-white flex items-center justify-center shadow-md hover:shadow-teal-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </button>

            {/* Forward +30s */}
            <button
              type="button"
              onClick={() => seekDelta(30)}
              className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer flex items-center justify-center relative active:scale-95"
              title="+30s"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.6L21 8" />
                <polyline points="21 3 21 8 16 8" />
              </svg>
              <span className="absolute text-[7px] font-bold font-mono">30</span>
            </button>
          </div>

          {/* Scrubber & Timings in one wide line */}
          <div className="flex items-center gap-2.5 sm:gap-3 w-full">
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 font-semibold shrink-0 min-w-[32px] text-left">
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
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-teal-500 focus:outline-none"
              />
              {/* Custom filled track highlight */}
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-teal-500 rounded-full pointer-events-none"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>

            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 font-semibold shrink-0 min-w-[32px] text-right">
              {formatTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* ── Mobile Play/Pause & Actions (< sm) ───────────────────────────── */}
        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="w-9 h-9 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={handleStudyClick}
            className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition cursor-pointer"
            title={t('podcasts.read_transcript_study', 'Read Transcript / Study')}
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const audio = document.getElementById('global-audio-element') as HTMLAudioElement;
              if (audio) {
                window.dispatchEvent(new CustomEvent("force-history-flush", { detail: { exactTime: audio.currentTime } }));
                audio.pause();
              }
              closePlayer();
            }}
            className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition cursor-pointer"
            title="Close Player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── 3. Right: Speed, Study, Volume, Fullscreen, Close (Shrink-0) ─── */}
        <div className="hidden sm:flex items-center justify-end gap-1.5 shrink-0">
          {/* Speed Preset Toggle */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] font-bold rounded-lg transition cursor-pointer active:scale-95 shadow-3xs"
            title={t('player.speed', 'Playback Speed')}
          >
            {playbackRate}x
          </button>

          {/* Read Transcript / Study Button */}
          <button
            type="button"
            onClick={handleStudyClick}
            disabled={isImporting}
            className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 shadow-3xs shrink-0"
            title={t('podcasts.read_transcript_study', 'Read Transcript / Study')}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('podcasts.study', 'Study')}</span>
          </button>

          {/* Volume / Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
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

          {/* Close Player (✕) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
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

      {/* On mobile (< sm): slim 2px progress bar under the card */}
      <div className="sm:hidden w-full px-3 -mt-1 relative pointer-events-none">
        <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-150"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
