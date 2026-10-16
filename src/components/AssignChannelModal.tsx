import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Lesson, HistoryEntry, Playlist, ReaderSettings, ChannelPreset } from '../types';
import { resolveApiUrl } from '../utils/apiConfig';
import { buildSyncHeaders } from '../utils/syncAuth';
import { useToast } from '../context/ToastContext';
import { useSettingsStore } from '../store/settingsStore';
import { getFrequentlyUsedTags } from '../utils/tagColors';
import { X, Search, Check, CheckSquare, Square, Loader2, Tv, ListVideo, Tag, Trash2, Sparkles, Plus } from 'lucide-react';

interface AssignChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetChannelName?: string | null;
  initialSelectedId?: string | null;
  lessons: Lesson[];
  history: HistoryEntry[];
  playlists?: Playlist[];
  settings?: ReaderSettings;
  onUpdateSettings?: (newSettingsOrFn: React.SetStateAction<ReaderSettings> | ReaderSettings) => void;
  onUpdateLessons?: (updatedLessons: Lesson[]) => void;
  onUpdateHistory?: (updatedHistory: HistoryEntry[]) => void;
}

export default function AssignChannelModal({
  isOpen,
  onClose,
  targetChannelName,
  initialSelectedId,
  lessons,
  history,
  playlists = [],
  settings,
  onUpdateSettings,
  onUpdateLessons,
  onUpdateHistory,
}: AssignChannelModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const isUnknownTarget = useMemo(() => {
    return (
      !targetChannelName ||
      targetChannelName === '__unknown__' ||
      targetChannelName === t('history_page.unknown_youtube_channel', 'Unknown YouTube Channel') ||
      targetChannelName === 'Unknown YouTube Channel' ||
      targetChannelName === 'Неизвестный YouTube канал'
    );
  }, [targetChannelName, t]);

  const [newChannelName, setNewChannelName] = useState<string>(() => {
    return (!isUnknownTarget && targetChannelName) ? targetChannelName : '';
  });
  const [newChannelUrl, setNewChannelUrl] = useState<string>('');
  const [newChannelAvatarUrl, setNewChannelAvatarUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(() => {
    return initialSelectedId ? new Set([initialSelectedId]) : new Set();
  });
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState<boolean>(isUnknownTarget);

  const channelKey = newChannelName.trim().toLowerCase();
  const activeSettings = settings || useSettingsStore((s) => s.settings);
  const currentPreset = channelKey ? activeSettings?.channelPresets?.[channelKey] : undefined;

  const [presetPlaylistId, setPresetPlaylistId] = useState<string>('none');
  const [presetPrimaryTag, setPresetPrimaryTag] = useState<string | null>(null);
  const [presetTags, setPresetTags] = useState<string[]>([]);
  const [newPresetTagInput, setNewPresetTagInput] = useState<string>('');
  const [isPresetModified, setIsPresetModified] = useState<boolean>(false);
  const [showPresetSection, setShowPresetSection] = useState<boolean>(false);

  React.useEffect(() => {
    if (currentPreset) {
      setPresetPlaylistId(currentPreset.defaultPlaylistId || 'none');
      setPresetPrimaryTag(currentPreset.defaultPrimaryTag || null);
      setPresetTags(Array.isArray(currentPreset.defaultTags) ? [...currentPreset.defaultTags] : []);
      setIsPresetModified(false);
      setShowPresetSection(true);
    } else {
      setPresetPlaylistId('none');
      setPresetPrimaryTag(null);
      setPresetTags([]);
      setIsPresetModified(false);
      setShowPresetSection(false);
    }
  }, [channelKey, activeSettings?.channelPresets]);

  const availableTags = useMemo(() => {
    return getFrequentlyUsedTags(lessons, playlists, history, 30);
  }, [lessons, playlists, history]);

  const handleSaveChannelPreset = () => {
    if (!newChannelName.trim()) return;
    const chKey = newChannelName.trim().toLowerCase();
    const newPreset: ChannelPreset = {
      channelName: newChannelName.trim(),
      channelUrl: newChannelUrl.trim() || null,
      channelAvatarUrl: newChannelAvatarUrl || null,
      defaultPlaylistId: presetPlaylistId !== 'none' ? presetPlaylistId : null,
      defaultPrimaryTag: presetPrimaryTag,
      defaultTags: presetTags,
      updatedAt: Date.now(),
    };
    const updatedPresets = {
      ...(activeSettings?.channelPresets || {}),
      [chKey]: newPreset,
    };
    if (onUpdateSettings) {
      onUpdateSettings((prev) => ({ ...prev, channelPresets: updatedPresets }));
    } else {
      useSettingsStore.getState().setSettings({ channelPresets: updatedPresets });
    }
    setIsPresetModified(false);
    setShowPresetSection(true);
    showToast(t('channel_preset.saved_toast', 'Настройки по умолчанию для канала сохранены'), 'success');
  };

  const handleDeleteChannelPreset = () => {
    if (!newChannelName.trim()) return;
    const chKey = newChannelName.trim().toLowerCase();
    const updatedPresets = { ...(activeSettings?.channelPresets || {}) };
    delete updatedPresets[chKey];
    if (onUpdateSettings) {
      onUpdateSettings((prev) => ({ ...prev, channelPresets: updatedPresets }));
    } else {
      useSettingsStore.getState().setSettings({ channelPresets: updatedPresets });
    }
    setPresetPlaylistId('none');
    setPresetPrimaryTag(null);
    setPresetTags([]);
    setIsPresetModified(false);
    setShowPresetSection(false);
    showToast(t('channel_preset.deleted_toast', 'Правило по умолчанию для канала удалено'), 'info');
  };

  const handleAddPresetTag = (tagToAdd?: string) => {
    const raw = (tagToAdd !== undefined ? tagToAdd : newPresetTagInput).trim().replace(/^#+/, '');
    if (!raw) return;
    if (!presetTags.some((t) => t.toLowerCase() === raw.toLowerCase())) {
      const next = [...presetTags, raw];
      setPresetTags(next);
      if (!presetPrimaryTag) setPresetPrimaryTag(raw);
      setIsPresetModified(true);
    }
    setNewPresetTagInput('');
  };

  const handleRemovePresetTag = (tagToRemove: string) => {
    const next = presetTags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase());
    setPresetTags(next);
    if (presetPrimaryTag?.toLowerCase() === tagToRemove.toLowerCase()) {
      setPresetPrimaryTag(next.length > 0 ? next[0] : null);
    }
    setIsPresetModified(true);
  };

  const handleTogglePrimaryPresetTag = (tag: string) => {
    if (presetPrimaryTag?.toLowerCase() === tag.toLowerCase()) {
      setPresetPrimaryTag(null);
    } else {
      setPresetPrimaryTag(tag);
    }
    setIsPresetModified(true);
  };

  // Existing channels from the entire library & history for quick suggestions
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

    history.forEach((h) => {
      const name = h.channelName?.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name,
            avatarUrl: h.channelAvatarUrl || null,
            channelUrl: (h as any).channelUrl || null,
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lessons, history]);

  // If opening for a known target channel, preload its avatar & URL
  React.useEffect(() => {
    if (!isUnknownTarget && targetChannelName) {
      setNewChannelName(targetChannelName);
      const match = existingChannels.find((c) => c.name.toLowerCase() === targetChannelName.toLowerCase());
      if (match) {
        if (match.avatarUrl) setNewChannelAvatarUrl(match.avatarUrl);
        if (match.channelUrl) setNewChannelUrl(match.channelUrl);
      }
    }
  }, [targetChannelName, isUnknownTarget, existingChannels]);

  // Aggregate items to display from both lessons and history
  const relevantLessons = useMemo(() => {
    const map = new Map<string, {
      id: string;
      lessonId: string;
      title: string;
      coverUrl?: string | null;
      channelName?: string | null;
      channelAvatarUrl?: string | null;
      targetLanguage?: string | null;
      youtubeId?: string | null;
    }>();

    // 1. Add from lessons
    lessons.forEach((l) => {
      map.set(l.id, {
        id: l.id,
        lessonId: l.id,
        title: l.title,
        coverUrl: l.coverUrl,
        channelName: l.channelName || (l as any).channelTitle || null,
        channelAvatarUrl: l.channelAvatarUrl || null,
        targetLanguage: l.targetLanguage,
        youtubeId: l.youtubeId || null,
      });
    });

    // 2. Add from history (catches any history entries where lessonId is custom or not in lessons)
    history.forEach((h) => {
      const key = h.lessonId && h.lessonId !== 'custom' ? h.lessonId : h.id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          lessonId: h.lessonId || h.id,
          title: h.lessonTitle,
          coverUrl: h.coverUrl,
          channelName: h.channelName || null,
          channelAvatarUrl: h.channelAvatarUrl || null,
          targetLanguage: h.targetLanguage,
          youtubeId: null,
        });
      } else {
        // If existing item in map didn't have channelName but history has it
        const cur = map.get(key)!;
        if (!cur.channelName && h.channelName) {
          cur.channelName = h.channelName;
          cur.channelAvatarUrl = h.channelAvatarUrl || cur.channelAvatarUrl;
        }
      }
    });

    let list = Array.from(map.values());

    // Filter by unassigned or target channel
    if (showOnlyUnassigned) {
      list = list.filter((item) => !item.channelName?.trim());
    } else if (!isUnknownTarget && targetChannelName) {
      list = list.filter((item) => {
        const ch = (item.channelName || '').toLowerCase();
        return ch === targetChannelName.toLowerCase() || !ch;
      });
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter((item) => {
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const chMatch = (item.channelName || '').toLowerCase().includes(q);
        return titleMatch || chMatch;
      });
    }

    return list;
  }, [lessons, history, targetChannelName, isUnknownTarget, showOnlyUnassigned, searchFilter]);

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
    if (!url) {
      showToast(t('import.channel_url_required', 'Please enter YouTube channel link'), 'error');
      return;
    }
    setIsResolving(true);
    try {
      const res = await fetch(resolveApiUrl('/api/youtube/channel-info'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          channelUrl: url,
          channelName: newChannelName || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        const title = data.title || data.channelName;
        const avatar = data.avatar || data.channelAvatarUrl;
        const cleanUrl = data.channelUrl || url;

        if (title) setNewChannelName(title);
        if (avatar) setNewChannelAvatarUrl(avatar);
        if (cleanUrl) setNewChannelUrl(cleanUrl);

        showToast(
          t('import.channel_found', 'Channel found successfully: {{name}}', { name: title || 'YouTube' }),
          'success'
        );
      } else {
        showToast(
          data.error || t('import.channel_not_found', 'Could not find YouTube channel information. Check the link.'),
          'error'
        );
      }
    } catch (e: any) {
      console.error('Failed to resolve channel:', e);
      showToast(
        t('import.channel_resolve_error', 'Error contacting server to search for channel.'),
        'error'
      );
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

  const handleSaveBatch = async () => {
    if (!newChannelName.trim() || selectedLessonIds.size === 0 || isSavingBatch) return;

    const trimmedName = newChannelName.trim();
    const avatar = newChannelAvatarUrl || null;
    const chUrl = newChannelUrl.trim() || null;

    setIsSavingBatch(true);
    try {
      const headers = buildSyncHeaders({ "Content-Type": "application/json" });

      // 1. Direct atomic write to SQLite on server for both lessons and history
      const res = await fetch(resolveApiUrl("/api/history/assign-channel"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          lessonIds: Array.from(selectedLessonIds),
          historyIds: Array.from(selectedLessonIds),
          channelName: trimmedName,
          channelAvatarUrl: avatar,
          channelUrl: chUrl,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      // 2. Update Lessons
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

      // 3. Update History
      const updatedHistory = history.map((h) => {
        const isMatch =
          selectedLessonIds.has(h.lessonId) ||
          selectedLessonIds.has(h.id) ||
          (h.lessonTitle && relevantLessons.some((rl) => selectedLessonIds.has(rl.id) && rl.title === h.lessonTitle));

        if (isMatch) {
          return {
            ...h,
            channelName: trimmedName,
            channelAvatarUrl: avatar || h.channelAvatarUrl,
            channelUrl: chUrl || (h as any).channelUrl || undefined,
          };
        }
        return h;
      });

      onUpdateHistory?.(updatedHistory);

      if (isPresetModified && trimmedName) {
        handleSaveChannelPreset();
      }

      showToast(t('history_page.batch_saved', 'Channel successfully assigned to selected videos'), 'success');
      onClose();
    } catch (err: any) {
      console.error("Batch save error:", err);
      showToast(t('history_page.batch_save_error', 'Error saving to server: ') + (err.message || ''), 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const isAllSelected = relevantLessons.length > 0 && selectedLessonIds.size === relevantLessons.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150">
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
                placeholder={t('import.channel_name_placeholder', 'Channel or author name')}
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

          {/* Channel Default Preset Section */}
          {newChannelName.trim() && (
            <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/80">
              {!showPresetSection && !currentPreset ? (
                <button
                  type="button"
                  onClick={() => setShowPresetSection(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('channel_preset.configure_btn', 'Настроить дефолтный плейлист и теги для канала')}</span>
                </button>
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-[11px] font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wider">
                        {t('channel_preset.section_title', 'Плейлист и теги по умолчанию')}
                      </span>
                      {currentPreset && (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                          {t('common.active', 'Активно')}
                        </span>
                      )}
                    </div>
                    {currentPreset && (
                      <button
                        type="button"
                        onClick={handleDeleteChannelPreset}
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 cursor-pointer transition"
                        title={t('channel_preset.remove_preset_btn', 'Удалить правило')}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{t('channel_preset.remove_preset_btn', 'Удалить правило')}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Playlist selector */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <ListVideo className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        {t('channel_preset.default_playlist', 'Плейлист по умолчанию')}
                      </label>
                      <select
                        value={presetPlaylistId}
                        onChange={(e) => {
                          setPresetPlaylistId(e.target.value);
                          setIsPresetModified(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="none">{t('channel_preset.none_playlist', 'Без плейлиста (напрямую в библиотеку)')}</option>
                        {(playlists || []).map((pl) => (
                          <option key={pl.id} value={pl.id}>
                            📁 {pl.title} ({pl.itemCount || pl.items?.length || 0})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Add tag input */}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        {t('channel_preset.default_tags', 'Теги по умолчанию')}
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newPresetTagInput}
                          onChange={(e) => setNewPresetTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPresetTag();
                            }
                          }}
                          placeholder="e.g. LanguageLearning"
                          className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPresetTag()}
                          disabled={!newPresetTagInput.trim()}
                          className="px-2.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl transition cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Preset tag chips */}
                  {presetTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {presetTags.map((t) => {
                        const isPrimary = presetPrimaryTag?.toLowerCase() === t.toLowerCase();
                        return (
                          <span
                            key={t}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${
                              isPrimary
                                ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300'
                                : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <span>#{t}</span>
                            <button
                              type="button"
                              onClick={() => handleTogglePrimaryPresetTag(t)}
                              className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                              title={isPrimary ? 'Primary (click to unset)' : 'Click to make Primary'}
                            >
                              {isPrimary ? '★' : '☆'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePresetTag(t)}
                              className="text-zinc-400 hover:text-red-500 cursor-pointer text-xs leading-none"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick tag suggestions if preset has no tags */}
                  {presetTags.length === 0 && availableTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center pt-0.5">
                      <span className="text-[10px] text-zinc-400">Частые:</span>
                      {availableTags.slice(0, 5).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleAddPresetTag(t)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 transition cursor-pointer"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Save Preset Button */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveChannelPreset}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                        isPresetModified
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('channel_preset.save_preset_btn', 'Сохранить настройки канала')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
            disabled={!newChannelName.trim() || selectedLessonIds.size === 0 || isSavingBatch}
            className="px-5 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
          >
            {isSavingBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('app.saving', 'Saving...')}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {t('history_page.apply_to_selected_btn', 'Apply to selected ({{count}})', {
                    count: selectedLessonIds.size,
                  })}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
