import React, { useState, useMemo } from 'react';
import { usePlaylistStore, PlaylistItem } from '../../store/playlistStore';
import {
  X,
  Play,
  Pause,
  Trash2,
  ListMusic,
  Volume2,
  Headphones,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Video,
  Radio,
  BookOpen,
  Sparkles,
  Info,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function QueueModal() {
  const { t } = useTranslation();
  const {
    queue,
    currentIndex,
    isPlaying,
    showQueueModal,
    setShowQueueModal,
    playTrackAtIndex,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    togglePlay,
    preferAudioOnly,
    togglePreferAudioOnly,
  } = usePlaylistStore();

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Remaining duration from current track to end of queue
  const remainingMinutes = useMemo(() => {
    if (queue.length === 0) return 0;
    let totalSec = 0;
    for (let i = currentIndex; i < queue.length; i++) {
      totalSec += queue[i]?.duration || 0;
    }
    return Math.round(totalSec / 60);
  }, [queue, currentIndex]);

  const currentTrack = queue[currentIndex] || null;
  const upcomingTracks = queue.slice(currentIndex + 1);
  const previousTracks = queue.slice(0, currentIndex);

  const getMediaBadge = (item: PlaylistItem) => {
    if (item.youtubeId || item.lessonType === 'youtube') {
      return {
        label: preferAudioOnly ? t('player.audio_only_badge', 'YouTube (Audio)') : 'YouTube',
        icon: preferAudioOnly ? Headphones : Video,
        color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50',
      };
    }
    if (item.lessonType === 'podcast' || item.guid || item.podcastTitle) {
      return {
        label: t('player.badge_podcast', 'Podcast'),
        icon: Radio,
        color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/50',
      };
    }
    return {
      label: t('player.badge_audio', 'Audio'),
      icon: BookOpen,
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50',
    };
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) {
      setDragOverIdx(null);
      setDropPosition(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'before' : 'after';

    setDragOverIdx(index);
    setDropPosition(pos);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      setDropPosition(null);
      return;
    }

    let finalTarget = targetIndex;
    if (dropPosition === 'after' && draggedIdx < targetIndex) {
      finalTarget = targetIndex;
    } else if (dropPosition === 'after') {
      finalTarget = targetIndex + 1;
    } else if (dropPosition === 'before' && draggedIdx > targetIndex) {
      finalTarget = targetIndex;
    } else if (dropPosition === 'before') {
      finalTarget = Math.max(0, targetIndex - 1);
    }

    reorderQueue(draggedIdx, finalTarget);
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDropPosition(null);
  };

  const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= queue.length) return;
    reorderQueue(fromIndex, toIndex);
  };

  if (!showQueueModal) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={() => setShowQueueModal(false)}
      />

      {/* Drawer Container (Slide-over from right on desktop, bottom sheet on mobile) */}
      <div
        className="fixed top-0 bottom-0 right-0 z-50 w-full sm:w-[440px] max-w-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800 transition-transform duration-200 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-drawer-title"
      >
        {/* Mobile Drag Indicator Handle */}
        <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto my-2.5 sm:hidden shrink-0" />

        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/60 rounded-xl text-teal-600 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/60 shrink-0">
              <ListMusic className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="queue-drawer-title"
                className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 truncate"
              >
                <span>{t('player.up_next_drawer', 'Мини-очередь «Далее»')}</span>
                <span className="text-[11px] px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded-full font-mono font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                  {queue.length}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-500 font-medium truncate mt-0.5">
                {remainingMinutes > 0
                  ? t('player.queue_remaining_time', 'Осталось примерно {{minutes}} мин', { minutes: remainingMinutes })
                  : t('player.queue_subtitle', 'Непрерывный фоновый плейлист')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {queue.length > 0 && (
              <button
                type="button"
                onClick={clearQueue}
                className="text-[11px] font-bold text-zinc-400 hover:text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                title={t('player.clear_queue', 'Очистить всё')}
              >
                {t('player.clear_queue', 'Очистить')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowQueueModal(false)}
              className="p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Закрыть шторку"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Audio-Only Mode Switch Banner (YouTube background playback) */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent dark:from-teal-950/40 dark:via-zinc-900 dark:to-transparent border-b border-teal-500/20 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Headphones className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block truncate">
                {t('player.audio_only', 'Только аудио (фоновый режим)')}
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate">
                {t('player.audio_only_tooltip', 'Экономит трафик, батарею и воспроизводит при выключенном экране')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePreferAudioOnly}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 border ${
              preferAudioOnly
                ? 'bg-teal-600 text-white border-teal-500 shadow-xs'
                : 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700'
            }`}
          >
            {preferAudioOnly ? 'ВКЛ' : 'ВЫКЛ'}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {queue.length === 0 ? (
            /* Empty Queue State */
            <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
                <ListMusic className="w-8 h-8 opacity-60" />
              </div>
              <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">
                {t('player.empty_queue_title', 'Очередь воспроизведения пуста')}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
                {t(
                  'player.empty_queue_desc',
                  'Добавляйте аудиоуроки, подкасты и YouTube-видео в очередь для непрерывного прослушивания'
                )}
              </p>
            </div>
          ) : (
            <>
              {/* 1. NOW PLAYING CARD */}
              {currentTrack && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-wider uppercase text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('player.now_playing', 'Сейчас играет')}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-400">
                      #{currentIndex + 1} {t('common.of', 'of')} {queue.length}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-gradient-to-r from-teal-500/10 to-teal-500/5 dark:from-teal-950/40 dark:to-zinc-900 border border-teal-500/30 shadow-xs flex items-center gap-3 group">
                    {/* Thumbnail with equalizer animation */}
                    <div className="relative w-12 h-12 rounded-xl bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 border border-teal-500/30 shadow-xs">
                      {currentTrack.coverUrl ? (
                        <img
                          src={currentTrack.coverUrl}
                          alt={currentTrack.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-teal-600 dark:text-teal-400">
                          <Headphones className="w-6 h-6" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        {isPlaying ? (
                          <div className="flex items-end gap-0.5 h-3.5">
                            <span className="w-1 bg-teal-300 rounded-full animate-bounce [animation-delay:-0.3s] h-3" />
                            <span className="w-1 bg-teal-300 rounded-full animate-bounce [animation-delay:-0.15s] h-full" />
                            <span className="w-1 bg-teal-300 rounded-full animate-bounce h-2" />
                          </div>
                        ) : (
                          <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Title & Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {(() => {
                          const badge = getMediaBadge(currentTrack);
                          const IconComp = badge.icon;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${badge.color}`}
                            >
                              <IconComp className="w-2.5 h-2.5" />
                              <span>{badge.label}</span>
                            </span>
                          );
                        })()}
                        {currentTrack.duration ? (
                          <span className="text-[10px] font-mono text-zinc-400">
                            {formatDuration(currentTrack.duration)}
                          </span>
                        ) : null}
                      </div>

                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate leading-snug">
                        {currentTrack.title}
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {currentTrack.bookTitle ||
                          currentTrack.channelName ||
                          currentTrack.podcastTitle ||
                          t('player.single_track', 'Аудиоурок')}
                      </p>
                    </div>

                    {/* Play/Pause Button */}
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="w-8 h-8 rounded-full bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer transition active:scale-95"
                      title={isPlaying ? t('player.pause', 'Pause') : t('player.play', 'Play')}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-white" />
                      ) : (
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 2. UP NEXT LIST */}
              <div className="space-y-2 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <span>{t('player.up_next', 'Далее')}</span>
                    <span className="px-1.5 py-0.2 bg-zinc-200 dark:bg-zinc-800 rounded-md font-mono text-[10px] text-zinc-700 dark:text-zinc-300">
                      {upcomingTracks.length}
                    </span>
                  </span>
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <GripVertical className="w-3 h-3 text-zinc-400" />
                    <span>{t('player.drag_to_reorder', 'Перетаскивайте для изменения')}</span>
                  </span>
                </div>

                {upcomingTracks.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic py-3 text-center bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    {t('player.no_upcoming', 'Конец очереди. Добавьте новые треки!')}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {upcomingTracks.map((track, relativeIdx) => {
                      const absoluteIdx = currentIndex + 1 + relativeIdx;
                      const isDragged = draggedIdx === absoluteIdx;
                      const isDragOver = dragOverIdx === absoluteIdx;
                      const badge = getMediaBadge(track);
                      const IconComp = badge.icon;

                      return (
                        <div
                          key={`${track.id}-${absoluteIdx}`}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, absoluteIdx)}
                          onDragOver={(e) => handleDragOver(e, absoluteIdx)}
                          onDrop={(e) => handleDrop(e, absoluteIdx)}
                          onDragEnd={handleDragEnd}
                          onClick={() => playTrackAtIndex(absoluteIdx)}
                          className={`relative flex items-center justify-between p-2 rounded-xl transition gap-2 group cursor-pointer border select-none ${
                            isDragged
                              ? 'opacity-40 border-dashed border-teal-500 bg-teal-50/20'
                              : 'bg-white dark:bg-zinc-900/90 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 border-zinc-200/70 dark:border-zinc-800'
                          }`}
                        >
                          {/* Drop indicator lines */}
                          {isDragOver && dropPosition === 'before' && (
                            <div className="absolute -top-1 inset-x-0 h-0.5 bg-teal-500 rounded-full z-10 shadow-xs pointer-events-none" />
                          )}
                          {isDragOver && dropPosition === 'after' && (
                            <div className="absolute -bottom-1 inset-x-0 h-0.5 bg-teal-500 rounded-full z-10 shadow-xs pointer-events-none" />
                          )}

                          {/* Drag Handle & Order Controls */}
                          <div
                            className="flex items-center gap-0.5 shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div
                              className="p-1 cursor-grab active:cursor-grabbing hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
                              title={t('player.drag_to_reorder', 'Перетащите')}
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            {/* Quick move buttons */}
                            <div className="flex flex-col -space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => moveItem(absoluteIdx, 'up')}
                                className="p-0.5 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer"
                                title={t('player.move_up', 'Выше')}
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveItem(absoluteIdx, 'down')}
                                className="p-0.5 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer"
                                title={t('player.move_down', 'Ниже')}
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Thumbnail with Fallback */}
                          <div className="relative w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                            {track.coverUrl ? (
                              <img
                                src={track.coverUrl}
                                alt={track.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                            ) : (
                              <Headphones className="w-4 h-4 text-zinc-400" />
                            )}
                          </div>

                          {/* Title & Metadata */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-extrabold border ${badge.color}`}
                              >
                                <IconComp className="w-2 h-2" />
                                <span>{badge.label}</span>
                              </span>
                              {track.duration ? (
                                <span className="text-[9.5px] font-mono text-zinc-400">
                                  {formatDuration(track.duration)}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate mt-0.5 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {track.title}
                            </span>
                            <span className="text-[10px] text-zinc-400 truncate font-medium">
                              {track.bookTitle ||
                                track.channelName ||
                                track.podcastTitle ||
                                t('player.single_track', 'Аудиоурок')}
                            </span>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(absoluteIdx);
                            }}
                            className="p-1.5 text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer opacity-80 group-hover:opacity-100 shrink-0"
                            title={t('player.remove_from_queue', 'Удалить из очереди')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. PREVIOUSLY PLAYED (Collapsible) */}
              {previousTracks.length > 0 && (
                <div className="space-y-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full flex items-center justify-between text-[11px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 py-1 transition cursor-pointer"
                  >
                    <span className="uppercase tracking-wider">
                      {t('player.previously_played', 'Ранее воспроизведено')} ({previousTracks.length})
                    </span>
                    <span className="text-xs">{showHistory ? '▲' : '▼'}</span>
                  </button>

                  {showHistory && (
                    <div className="space-y-1 opacity-70">
                      {previousTracks.map((track, idx) => (
                        <div
                          key={`prev-${track.id}-${idx}`}
                          onClick={() => playTrackAtIndex(idx)}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition gap-2.5 cursor-pointer border border-transparent"
                        >
                          <span className="text-[10px] font-mono text-zinc-400 w-4 text-center shrink-0">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0 flex-1 truncate">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate block">
                              {track.title}
                            </span>
                            <span className="text-[10px] text-zinc-400 truncate block">
                              {track.bookTitle || track.channelName}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(idx);
                            }}
                            className="p-1 text-zinc-300 hover:text-red-500 rounded cursor-pointer"
                            title="Удалить"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
