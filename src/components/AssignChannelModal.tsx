import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Lesson, HistoryEntry } from '../types';
import { resolveApiUrl } from '../utils/apiConfig';
import { X, Search, Check, CheckSquare, Square, Loader2, Tv } from 'lucide-react';

interface AssignChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetChannelName?: string | null;
  lessons: Lesson[];
  history: HistoryEntry[];
  onUpdateLessons?: (updatedLessons: Lesson[]) => void;
  onUpdateHistory?: (updatedHistory: HistoryEntry[]) => void;
}

export default function AssignChannelModal({
  isOpen,
  onClose,
  targetChannelName,
  lessons,
  history,
  onUpdateLessons,
  onUpdateHistory,
}: AssignChannelModalProps) {
  const { t } = useTranslation();

  const [newChannelName, setNewChannelName] = useState<string>('');
  const [newChannelUrl, setNewChannelUrl] = useState<string>('');
  const [newChannelAvatarUrl, setNewChannelAvatarUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState<boolean>(true);

  // Existing channels from the entire library for quick suggestions
  const existingChannels = useMemo(() => {
    const map = new Map<string, { name: string; avatarUrl?: string | null; channelUrl?: string | null }>();
    lessons.forEach((l) => {
      const name = l.channelName?.trim() || (l as any).channelTitle?.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name,
            avatarUrl: l.channelAvatarUrl || null,
            channelUrl: l.channelUrl || null,
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lessons]);

  // Lessons to display in modal
  const relevantLessons = useMemo(() => {
    const isUnknownTarget =
      !targetChannelName ||
      targetChannelName === '__unknown__' ||
      targetChannelName === t('history_page.unknown_youtube_channel', 'Unknown YouTube Channel') ||
      targetChannelName === 'Unknown YouTube Channel' ||
      targetChannelName === 'Неизвестный YouTube канал';

    return lessons.filter((l) => {
      const isYtOrVideo = l.youtubeId || l.lessonType === 'youtube' || l.coverUrl?.includes('youtube');
      const hasChannel = Boolean(l.channelName?.trim() || (l as any).channelTitle?.trim());

      if (showOnlyUnassigned && hasChannel) return false;

      if (!isUnknownTarget && targetChannelName) {
        const ch = (l.channelName || (l as any).channelTitle || '').toLowerCase();
        if (ch !== targetChannelName.toLowerCase() && hasChannel) return false;
      }

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const titleMatch = (l.title || '').toLowerCase().includes(q);
        const chMatch = (l.channelName || (l as any).channelTitle || '').toLowerCase().includes(q);
        return titleMatch || chMatch;
      }

      return isYtOrVideo;
    });
  }, [lessons, targetChannelName, showOnlyUnassigned, searchFilter, t]);

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (selectedLessonIds.size === relevantLessons.length) {
      setSelectedLessonIds(new Set());
    } else {
      setSelectedLessonIds(new Set(relevantLessons.map((l) => l.id)));
    }
  };

  const toggleSelectLesson = (id: string) => {
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResolveChannel = async (overrideUrl?: string) => {
    const url = (overrideUrl !== undefined ? overrideUrl : newChannelUrl).trim();
    if (!url) return;
    setIsResolving(true);
    try {
      const res = await fetch(resolveApiUrl('/api/youtube/resolve-channel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: url,
          channelName: newChannelName || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.channelName) setNewChannelName(data.channelName);
        if (data.channelAvatarUrl) setNewChannelAvatarUrl(data.channelAvatarUrl);
        if (data.channelUrl) setNewChannelUrl(data.channelUrl);
      }
    } catch (e) {
      console.error('Failed to resolve channel:', e);
    } finally {
      setIsResolving(false);
    }
  };

  const handlePickExistingChannel = (chName: string) => {
    setNewChannelName(chName);
    const match = existingChannels.find((c) => c.name.toLowerCase() === chName.trim().toLowerCase());
    if (match) {
      if (match.avatarUrl) setNewChannelAvatarUrl(match.avatarUrl);
      if (match.channelUrl) setNewChannelUrl(match.channelUrl);
    }
  };

  const handleSaveBatch = () => {
    if (!newChannelName.trim() || selectedLessonIds.size === 0) return;

    const trimmedName = newChannelName.trim();
    const avatar = newChannelAvatarUrl || null;
    const chUrl = newChannelUrl.trim() || null;

    // 1. Update Lessons
    const updatedLessons = lessons.map((l) => {
      if (selectedLessonIds.has(l.id)) {
        return {
          ...l,
          channelName: trimmedName,
          channelTitle: trimmedName,
          channelAvatarUrl: avatar || l.channelAvatarUrl,
          channelUrl: chUrl || l.channelUrl,
        };
      }
      return l;
    });

    onUpdateLessons?.(updatedLessons);

    // 2. Update History
    const updatedHistory = history.map((h) => {
      if (selectedLessonIds.has(h.lessonId)) {
        return {
          ...h,
          channelName: trimmedName,
          channelAvatarUrl: avatar || h.channelAvatarUrl,
        };
      }
      return h;
    });

    onUpdateHistory?.(updatedHistory);

    onClose();
  };

  const isAllSelected = relevantLessons.length > 0 && selectedLessonIds.size === relevantLessons.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900 dark:text-white">
                {t('history_page.assign_modal_title', 'Assign Channel to Videos')}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('history_page.assign_modal_desc', 'Select videos and link them to an official YouTube channel and avatar.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Channel Assignment Form Card */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200/70 dark:border-zinc-800 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">
              {t('history_page.target_channel_heading', 'Target Channel Details')}
            </span>
            {newChannelAvatarUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={newChannelAvatarUrl}
                  alt={newChannelName || 'Avatar'}
                  className="w-6 h-6 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shadow-xs"
                />
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{newChannelName}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                {t('import.channel_name_label', 'Channel / Author Name')}
              </label>
              <input
                type="text"
                list="modal-existing-channels"
                value={newChannelName}
                onChange={(e) => handlePickExistingChannel(e.target.value)}
                placeholder={t('import.channel_name_placeholder', 'e.g. Andrea la Mexicana, Mr Salas')}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <datalist id="modal-existing-channels">
                {existingChannels.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                {t('import.channel_url_label', 'Channel URL (YouTube)')}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newChannelUrl}
                  onChange={(e) => setNewChannelUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleResolveChannel();
                    }
                  }}
                  placeholder="https://youtube.com/@Channel"
                  className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleResolveChannel()}
                  disabled={isResolving || !newChannelUrl.trim()}
                  className="px-3 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl transition flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>{t('import.resolve_channel_btn', 'Find')}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Video Filter & Selection Bar */}
        <div className="p-3 px-5 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-amber-600 dark:hover:text-amber-400 transition cursor-pointer"
            >
              {isAllSelected ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
              <span>{isAllSelected ? t('common.deselect_all', 'Deselect all') : t('common.select_all', 'Select all')}</span>
            </button>
            <span className="text-[11px] font-bold text-zinc-400">
              ({selectedLessonIds.size} / {relevantLessons.length} {t('history_page.videos_selected', 'selected')})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={t('history_page.filter_videos_placeholder', 'Search video title...')}
                className="pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-amber-500 w-44 sm:w-56"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowOnlyUnassigned(!showOnlyUnassigned)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
                showOnlyUnassigned
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {showOnlyUnassigned ? t('history_page.only_unassigned', 'Unassigned only') : t('history_page.all_videos', 'All videos')}
            </button>
          </div>
        </div>

        {/* Video List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {relevantLessons.length === 0 ? (
            <div className="text-center py-10 text-zinc-400 text-xs italic">
              {t('history_page.no_videos_match', 'No videos match the criteria')}
            </div>
          ) : (
            relevantLessons.map((lesson) => {
              const isSelected = selectedLessonIds.has(lesson.id);
              const currentCh = lesson.channelName || (lesson as any).channelTitle;

              return (
                <div
                  key={lesson.id}
                  onClick={() => toggleSelectLesson(lesson.id)}
                  className={`pt-2 first:pt-0 flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                    isSelected ? 'bg-amber-50/60 dark:bg-amber-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className="shrink-0 text-amber-600">
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-zinc-400" />}
                    </div>

                    {lesson.coverUrl ? (
                      <img
                        src={lesson.coverUrl}
                        alt=""
                        className="w-12 h-8 rounded-lg object-cover shrink-0 border border-zinc-200 dark:border-zinc-800"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-12 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-xs">
                        🎬
                      </div>
                    )}

                    <div className="min-w-0">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                        {lesson.title}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                        {currentCh ? (
                          <span className="text-teal-600 dark:text-teal-400 font-semibold">{currentCh}</span>
                        ) : (
                          <span className="text-rose-500 font-semibold">{t('history_page.no_channel_tag', 'No channel')}</span>
                        )}
                        {lesson.targetLanguage && <span>• {lesson.targetLanguage.toUpperCase()}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
          >
            {t('common.cancel', 'Cancel')}
          </button>

          <button
            type="button"
            onClick={handleSaveBatch}
            disabled={!newChannelName.trim() || selectedLessonIds.size === 0}
            className="px-5 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {t('history_page.apply_to_selected_btn', 'Apply to selected ({{count}})', {
                count: selectedLessonIds.size,
              })}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
