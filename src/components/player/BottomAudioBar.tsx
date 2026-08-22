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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-4xl z-50 pointer-events-auto animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-3 px-4 flex flex-col w-full">
        
        {/* ── ВЕРХНИЙ РЯД: Контролы ────────────────────────────────────────── */}
        <div className="flex items-center justify-between w-full gap-2">
          {/* Слева: инфо */}
          <div
            onClick={expandPlayer}
            className="flex items-center gap-3 min-w-0 max-w-[200px] sm:max-w-[240px] cursor-pointer group select-none"
            title="Open Fullscreen Player"
          >
            {currentTrack.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 group-hover:scale-105 transition duration-200 shadow-xs"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 flex items-center justify-center flex-shrink-0">
                <Headphones className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
            )}
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-semibold truncate text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {currentTrack.title}
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {currentTrack.channelName || currentTrack.bookTitle || currentTrack.podcastTitle || t('podcasts.podcast', 'Podcast')}
              </p>
            </div>
          </div>

          {/* По центру: кнопки воспроизведения */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Rewind -15s */}
            <button
              type="button"
              onClick={() => seekDelta(-15)}
              className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer p-1 active:scale-95"
              title="-15s"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.85.99-6.57 2.6L3 8" />
                <polyline points="3 3 3 8 8 8" />
              </svg>
            </button>

            {/* Play/Pause Accent Button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer flex-shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white ml-0.5" />
              )}
            </button>

            {/* Forward +30s */}
            <button
              type="button"
              onClick={() => seekDelta(30)}
              className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer p-1 active:scale-95"
              title="+30s"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.6L21 8" />
                <polyline points="21 3 21 8 16 8" />
              </svg>
            </button>
          </div>

          {/* Справа: инструменты */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Speed */}
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className="px-2 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 transition cursor-pointer active:scale-95"
              title={t('player.speed', 'Playback Speed')}
            >
              {playbackRate}x
            </button>

            {/* Study / Transcript */}
            <button
              type="button"
              onClick={handleStudyClick}
              disabled={isImporting}
              className="p-1.5 text-teal-600 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-300 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/60 transition cursor-pointer active:scale-95 flex items-center gap-1"
              title={t('podcasts.read_transcript_study', 'Read Transcript / Study')}
            >
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-bold hidden md:inline">{t('podcasts.study', 'Study')}</span>
            </button>

            {/* Volume */}
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition cursor-pointer hidden sm:block"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Expand Fullscreen */}
            <button
              type="button"
              onClick={expandPlayer}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition cursor-pointer"
              title="Fullscreen Player"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Close */}
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
              className="p-1.5 text-slate-400 hover:text-red-500 transition cursor-pointer"
              title="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── НИЖНИЙ РЯД: Полноразмерный ползунок НА ВСЮ ШИРИНУ ─────────────── */}
        <div className="flex items-center gap-3 w-full mt-2 pt-1 border-t border-slate-100 dark:border-zinc-800/60 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
          <span className="shrink-0 select-none min-w-[32px] text-left">
            {formatTime(seekValue)}
          </span>

          <div className="relative flex-1 h-3 flex items-center cursor-pointer group">
            {/* Background Track */}
            <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-teal-600 rounded-full transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>

            {/* Moving Thumb Indicator */}
            <div
              className="absolute -translate-x-1/2 w-3.5 h-3.5 bg-teal-600 border-2 border-white dark:border-zinc-900 rounded-full shadow pointer-events-none transition-transform group-hover:scale-125"
              style={{ left: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />

            {/* Transparent Native Range Input for seamless click/drag */}
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
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>

          <span className="shrink-0 select-none min-w-[32px] text-right">
            {formatTime(effectiveDuration)}
          </span>
        </div>

      </div>
    </div>
  );
}
