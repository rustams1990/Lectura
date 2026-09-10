import React from 'react';
import { usePlaylistStore } from '../../store/playlistStore';
import { X, Play, Pause, Trash2, ListMusic, Volume2, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  } = usePlaylistStore();

  if (!showQueueModal || queue.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 transition-opacity duration-150"
        onClick={() => setShowQueueModal(false)}
      />

      {/* Modal Container */}
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-xl flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-xl text-teal-600 dark:text-teal-400">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span>{t('player.queue_title', 'Play Queue')}</span>
                <span className="text-[11px] px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded-full font-mono font-bold text-zinc-600 dark:text-zinc-300">
                  {queue.length}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                {t('player.queue_subtitle', 'Continuous hands-free playback list')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearQueue}
              className="text-[11px] font-bold text-zinc-400 hover:text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
            >
              {t('player.clear_queue', 'Clear all')}
            </button>
            <button
              type="button"
              onClick={() => setShowQueueModal(false)}
              className="p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tracks List */}
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1 divide-y divide-zinc-100 dark:divide-zinc-800/40">
          {queue.map((track, idx) => {
            const isCurrent = idx === currentIndex;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`flex items-center justify-between p-2.5 rounded-2xl transition gap-3 group cursor-pointer ${
                  isCurrent
                    ? 'bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/80 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 border border-transparent'
                }`}
                onClick={() => playTrackAtIndex(idx)}
              >
                {/* Index / Play indicator & Thumbnail */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="relative w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden shadow-3xs">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Headphones className="w-4 h-4 text-zinc-400" />
                    )}
                    {isCurrent && (
                      <div className="absolute inset-0 bg-teal-600/75 flex items-center justify-center text-white">
                        {isPlaying ? (
                          <Volume2 className="w-4 h-4 animate-pulse" />
                        ) : (
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Title & Info */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className={`text-xs font-bold truncate leading-tight ${
                        isCurrent
                          ? 'text-teal-900 dark:text-teal-200 font-black'
                          : 'text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {idx + 1}. {track.title}
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5 font-medium">
                      {track.bookTitle || track.channelName || t('player.single_track', 'Audio lesson')}
                    </span>
                  </div>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(idx);
                  }}
                  className="p-1.5 text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer opacity-80 group-hover:opacity-100"
                  title="Remove from queue"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
