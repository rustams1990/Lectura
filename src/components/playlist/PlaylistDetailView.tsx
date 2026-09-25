import React, { useState, useMemo, useEffect, useRef } from "react";
import { Playlist, PlaylistItem, Lesson, ReaderSettings, HistoryEntry, VocabItem } from "../../types";
import {
  ArrowLeft, Play, BookOpen, Headphones, Trash2, CheckCircle2,
  Clock, ExternalLink, Loader2, Sparkles, AlertCircle, Share2,
  ListVideo, RefreshCw, Archive, ArchiveRestore, ArrowUpDown, Search, ChevronDown, Plus, CheckSquare, Square, Check,
  FolderInput, X, Pencil, Star, GripVertical, BarChart2, Tag, Filter
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { resolveApiUrl } from "../../utils/apiConfig";
import { renderCircularFlag, getLanguageFlagEmoji } from "./PlaylistCard";
import { getLocalizedLanguageName } from "../../utils/stringUtils";
import { getItemEffectiveDuration } from "../../utils/durationUtils";
import { normalizeContraction } from "../../utils";
import { ignoreListManager } from "../../services/ignoreListService";
import { usePlaylistStore } from "../../store/playlistStore";
import { useBingeQueueStore } from "../../store/useBingeQueueStore";
import { lessonsStore } from "../../db";
import { calculateBookStats, getCachedBookStats, getCachedTokens } from "../LibraryHome";
import AddMediaToPlaylistModal from "./AddMediaToPlaylistModal";
import MoveToPlaylistModal from "./MoveToPlaylistModal";
import SelectPlaylistCoverModal from "./SelectPlaylistCoverModal";
import PlaylistTagsModal from "./PlaylistTagsModal";
import LevelFilterDropdown, { DifficultyGroup } from "../library/LevelFilterDropdown";
import TagFilterDropdown from "../library/TagFilterDropdown";
import { classifyDifficulty } from "../../utils/playlistDifficultyUtils";
import { getTagColor, getAllKnownTags } from "../../utils/tagColors";

export type PlaylistSortOption = 
  | 'default'       // Исходный порядок плейлиста (по порядку добавления / #1, #2...)
  | 'duration_asc'  // По длительности: сначала короткие
  | 'duration_desc' // По длительности: сначала длинные
  | 'title_asc'     // По названию: А - Я (A - Z)
  | 'title_desc'    // По названию: Я - А (Z - A)
  | 'status';       // По статусу: сначала In Progress / New, потом Completed

export type PlaylistStatusFilter = 'all' | 'new' | 'in_progress' | 'completed';

interface PlaylistDetailViewProps {
  playlist: Playlist;
  lessons: Lesson[];
  playlists?: Playlist[];
  history?: HistoryEntry[];
  vocab?: Record<string, any>;
  wordLinks?: Record<string, string>;
  initialDifficultyFilter?: DifficultyGroup;
  initialTagFilter?: string;
  onBack: () => void;
  onOpenLesson?: (lessonId: string) => void;
  onSelectLesson?: (lessonId: string) => void;
  onPlayQueue?: (items: any[], startIndex?: number) => void;
  onUpdatePlaylist: (updated: Playlist) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onMovePlaylistItem?: (
    items: PlaylistItem[],
    sourcePlaylistId: string,
    targetPlaylistId: string,
    mode: "move" | "copy"
  ) => void;
  onAddPlaylist?: (newPlaylist: Playlist) => void;
  onToggleArchive?: (playlistId: string) => void;
  onAddOrUpdateLesson?: (lesson: Lesson) => void;
  onAddLessonToLibrary?: (lesson: Lesson) => void;
  onEditLesson?: (lesson: Lesson) => void;
  languageFlags?: Record<string, string>;
  settings?: ReaderSettings;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatTotalDuration(seconds: number, t: any): string {
  if (seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h} ${t("common.hours_short", "h")} ${m} ${t("common.minutes_short", "m")}`;
  }
  return `${m} ${t("common.minutes_short", "m")}`;
}

export function formatWordCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace('.0', '')}k`;
  }
  return `${count}`;
}

export interface PlaylistAggregateStats {
  hasAnyText: boolean;
  lessonsWithTextCount: number;
  totalItemsCount: number;
  totalWords: number;
  uniqueTotalWords: number;
  eligibleTokens: number;
  knownTokens: number;
  unknownTokens: number;
  knownPct: number;
  unknownPct: number;
  eligibleLemmas: number;
  uniqueKnownCount: number;
  uniqueUnknownCount: number;
  knownVocabularyPct: number;
  unknownVocabularyPct: number;
  difficultyLabel?: string;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlist,
  lessons,
  playlists = [],
  history = [],
  vocab = {},
  wordLinks = {},
  initialDifficultyFilter,
  initialTagFilter,
  onBack,
  onOpenLesson,
  onSelectLesson,
  onPlayQueue,
  onUpdatePlaylist,
  onDeletePlaylist,
  onMovePlaylistItem,
  onAddPlaylist,
  onToggleArchive,
  onAddOrUpdateLesson,
  onAddLessonToLibrary,
  onEditLesson,
  languageFlags = {},
  settings,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [moveModalItems, setMoveModalItems] = useState<PlaylistItem[] | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [newVideosFound, setNewVideosFound] = useState<PlaylistItem[] | null>(null);
  const [selectedNewVideoIds, setSelectedNewVideoIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<PlaylistSortOption>("default");
  const [statusFilter, setStatusFilter] = useState<PlaylistStatusFilter>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyGroup>(
    initialDifficultyFilter && initialDifficultyFilter !== "all" ? initialDifficultyFilter : "all"
  );
  const [selectedTag, setSelectedTag] = useState<string>(
    initialTagFilter && initialTagFilter !== "all" ? initialTagFilter : "all"
  );

  useEffect(() => {
    if (initialDifficultyFilter && initialDifficultyFilter !== "all") {
      setSelectedDifficulty(initialDifficultyFilter);
    } else if (initialDifficultyFilter === "all") {
      setSelectedDifficulty("all");
    }
  }, [initialDifficultyFilter]);

  useEffect(() => {
    if (initialTagFilter && initialTagFilter !== "all") {
      setSelectedTag(initialTagFilter);
    } else if (initialTagFilter === "all") {
      setSelectedTag("all");
    }
  }, [initialTagFilter]);

  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState(playlist.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingTitleValue(playlist.title);
  }, [playlist.title]);

  useEffect(() => {
    if (isEditingTitle) {
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 50);
    }
  }, [isEditingTitle]);

  const handleSaveTitle = () => {
    const trimmed = editingTitleValue.trim();
    if (!trimmed) {
      showToast(t("playlist.title_cannot_be_empty", "Title cannot be empty"), "error");
      return;
    }
    if (trimmed !== playlist.title) {
      const updated: Playlist = {
        ...playlist,
        title: trimmed,
        updatedAt: new Date().toISOString(),
      };
      onUpdatePlaylist(updated);
      showToast(t("playlist.renamed_success", "Playlist renamed to \"{{title}}\"", { title: trimmed }), "success");
    }
    setIsEditingTitle(false);
  };

  const items = playlist.items || [];
  const localizedLang = getLocalizedLanguageName(playlist.language, i18n.language);
  const flag = getLanguageFlagEmoji(playlist.language, languageFlags);

  // Find associated lessons in the user library for each playlist item
  const getItemLesson = (item: PlaylistItem): Lesson | undefined => {
    if (item.lessonId) {
      const match = lessons.find((l) => l.id === item.lessonId);
      if (match) return match;
    }
    if (item.videoId) {
      const match = lessons.find((l) => l.youtubeId === item.videoId);
      if (match) return match;
    }
    return undefined;
  };

  // Aggregated vocabulary, comprehension & difficulty statistics across the playlist
  const playlistAggregateStats = useMemo<PlaylistAggregateStats>(() => {
    let lessonsWithTextCount = 0;
    let totalWords = 0;
    let knownTokens = 0;
    let unknownTokens = 0;
    let ignoredTokens = 0;

    const uniqueKnownWords = new Set<string>();
    const uniqueUnknownWords = new Set<string>();
    const uniqueIgnoredWords = new Set<string>();
    const uniqueTotalWords = new Set<string>();
    const difficulties: string[] = [];

    const defaultLang = (playlist.language || "spanish").toLowerCase();

    for (const item of items) {
      const lesson = getItemLesson(item);
      if (lesson?.difficulty) {
        difficulties.push(lesson.difficulty.trim().toUpperCase());
      }

      if (!lesson || !lesson.text || lesson.text.length <= 20) {
        continue;
      }

      lessonsWithTextCount++;
      const cleanText = lesson.text.replace(/\[(?:\[LECTURA_)?IMG(?:_REF)?:[^\]]+\]/gi, " ");
      const lang = (lesson.targetLanguage || defaultLang).toLowerCase();
      const tokens = getCachedTokens(lesson.id || cleanText.slice(0, 30), cleanText, lesson.targetLanguage || defaultLang);
      const processedWords = tokens.filter((t) => t.isWord && t.clean).map((t) => t.clean as string);

      for (const word of processedWords) {
        totalWords++;
        const key = word.toLowerCase();
        const langKey = `${lang}_${key}`;
        const resolvedKey = (wordLinks[langKey] || wordLinks[key] || key).replace(/^[a-zA-Z]+_/, "");
        const langKeyForResolved = `${lang}_${resolvedKey}`;

        let vItem = vocab[langKeyForResolved] || vocab[resolvedKey];
        if (!vItem) {
          const normalized = normalizeContraction(resolvedKey, lang);
          if (normalized !== resolvedKey) {
            vItem = vocab[`${lang}_${normalized}`] || vocab[normalized];
          }
        }

        uniqueTotalWords.add(resolvedKey);

        const isManuallyIgnored = !!(vItem && vItem.status === "ignored");
        const isAutoIgnored = !vItem && ignoreListManager.checkAutoIgnore(resolvedKey, undefined, lang).isIgnored;
        const isIgnored = isManuallyIgnored || isAutoIgnored;

        if (isIgnored) {
          ignoredTokens++;
          uniqueIgnoredWords.add(resolvedKey);
        } else if (vItem && vItem.status === "known") {
          knownTokens++;
          uniqueKnownWords.add(resolvedKey);
        } else {
          unknownTokens++;
          uniqueUnknownWords.add(resolvedKey);
        }
      }
    }

    const eligibleTokens = totalWords - ignoredTokens;
    const eligibleLemmas = uniqueKnownWords.size + uniqueUnknownWords.size;
    const knownPct = eligibleTokens > 0 ? Math.round((knownTokens / eligibleTokens) * 100) : 0;
    const unknownPct = 100 - knownPct;
    const knownVocabularyPct = eligibleLemmas > 0 ? Math.round((uniqueKnownWords.size / eligibleLemmas) * 100) : 0;
    const unknownVocabularyPct = 100 - knownVocabularyPct;

    let difficultyLabel: string | undefined = undefined;
    if (difficulties.length > 0) {
      const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const sortedDiffs = [...new Set(difficulties)].sort((a, b) => {
        const idxA = CEFR_ORDER.indexOf(a);
        const idxB = CEFR_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });
      if (sortedDiffs.length === 1) {
        difficultyLabel = sortedDiffs[0];
      } else {
        difficultyLabel = `${sortedDiffs[0]} – ${sortedDiffs[sortedDiffs.length - 1]}`;
      }
    }

    return {
      hasAnyText: lessonsWithTextCount > 0,
      lessonsWithTextCount,
      totalItemsCount: items.length,
      totalWords,
      uniqueTotalWords: uniqueTotalWords.size,
      eligibleTokens,
      knownTokens,
      unknownTokens,
      knownPct,
      unknownPct,
      eligibleLemmas,
      uniqueKnownCount: uniqueKnownWords.size,
      uniqueUnknownCount: uniqueUnknownWords.size,
      knownVocabularyPct,
      unknownVocabularyPct,
      difficultyLabel,
    };
  }, [items, lessons, vocab, wordLinks, playlist.language]);

  // Active cover item based on primaryItemId or first item
  const activeCoverItem = useMemo(() => {
    if (playlist.primaryItemId) {
      const found = items.find((it) => it.id === playlist.primaryItemId);
      if (found) return found;
    }
    return items[0] || null;
  }, [playlist.primaryItemId, items]);

  const effectiveThumbnailUrl = useMemo(() => {
    const matchedCoverLesson = activeCoverItem ? getItemLesson(activeCoverItem) : null;
    return (
      activeCoverItem?.thumbnailUrl ||
      matchedCoverLesson?.coverUrl ||
      (activeCoverItem?.videoId ? `https://img.youtube.com/vi/${activeCoverItem.videoId}/hqdefault.jpg` : null) ||
      playlist.thumbnailUrl ||
      ""
    );
  }, [activeCoverItem, playlist.thumbnailUrl, lessons]);

  const handleSetCoverItem = (item: PlaylistItem) => {
    const matchedLesson = getItemLesson(item);
    const chosenThumbnail =
      item.thumbnailUrl ||
      matchedLesson?.coverUrl ||
      (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : "") ||
      playlist.thumbnailUrl;

    onUpdatePlaylist({
      ...playlist,
      primaryItemId: item.id,
      thumbnailUrl: chosenThumbnail,
      updatedAt: new Date().toISOString(),
    });
    showToast(t("playlist.cover_updated", "Обложка плейлиста обновлена!"), "success");
  };

  // Drag and drop reordering
  const handleReorderItems = (sourceId: string, targetId: string, position: "before" | "after") => {
    if (sourceId === targetId) return;

    const sourceIndex = items.findIndex((it) => it.id === sourceId);
    const targetIndex = items.findIndex((it) => it.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const reordered = [...items];
    const [movedItem] = reordered.splice(sourceIndex, 1);

    // Recalculate target index after removing movedItem
    let newTargetIndex = reordered.findIndex((it) => it.id === targetId);
    if (position === "after") {
      newTargetIndex += 1;
    }

    reordered.splice(newTargetIndex, 0, movedItem);

    // Switch to default order so user sees their new custom order immediately
    if (sortOption !== "default") {
      setSortOption("default");
    }

    // If no explicit primaryItemId was set, ensure thumbnailUrl stays updated if the first item changed
    let nextThumbnail = playlist.thumbnailUrl;
    if (!playlist.primaryItemId && reordered.length > 0) {
      const firstItem = reordered[0];
      const matchedLesson = getItemLesson(firstItem);
      nextThumbnail = firstItem.thumbnailUrl || matchedLesson?.coverUrl || (firstItem.videoId ? `https://img.youtube.com/vi/${firstItem.videoId}/hqdefault.jpg` : "") || playlist.thumbnailUrl;
    }

    onUpdatePlaylist({
      ...playlist,
      items: reordered,
      thumbnailUrl: nextThumbnail,
      updatedAt: new Date().toISOString(),
    });

    showToast(t("playlist.order_updated", "Порядок видео обновлен!"), "success");
  };

  const totalSeconds = useMemo(() => {
    return items.reduce((acc, item) => {
      const lesson = getItemLesson(item);
      return acc + getItemEffectiveDuration(item, lesson);
    }, 0);
  }, [items, lessons]);

  // Auto-heal missing durationSeconds for playlist items
  useEffect(() => {
    if (!playlist.items || playlist.items.length === 0 || !lessons || lessons.length === 0) return;
    let hasChanges = false;
    const updatedItems = playlist.items.map((item) => {
      if (!item.durationSeconds || item.durationSeconds <= 0) {
        const lesson = getItemLesson(item);
        const dur = getItemEffectiveDuration(item, lesson);
        if (dur > 0) {
          hasChanges = true;
          return { ...item, durationSeconds: dur };
        }
      }
      return item;
    });
    if (hasChanges) {
      onUpdatePlaylist({
        ...playlist,
        items: updatedItems,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [playlist.id, lessons]);

  // Helper to parse stored video progress safely
  const parseVideoProgress = (raw: string | null): number => {
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number") return parsed > 2 ? Math.floor(parsed) : 0;
      if (parsed && typeof parsed === "object" && parsed.progress !== undefined) {
        const p = parseFloat(parsed.progress);
        return !isNaN(p) && p > 2 ? Math.floor(p) : 0;
      }
    } catch (_) {}
    const num = parseFloat(raw);
    return !isNaN(num) && num > 2 ? Math.floor(num) : 0;
  };

  const getItemVideoProgress = (item: PlaylistItem, lesson?: Lesson): number => {
    const targetLessonId = lesson?.id || item.lessonId;
    const targetVideoId = lesson?.youtubeId || item.videoId;
    let sec = 0;
    if (targetLessonId) {
      sec = parseVideoProgress(localStorage.getItem(`youtube_progress_${targetLessonId}`));
    }
    if (sec <= 0 && targetVideoId) {
      sec = parseVideoProgress(localStorage.getItem(`youtube_progress_${targetVideoId}`));
    }
    return sec;
  };

  // Check completion status from history and localStorage
  const isItemCompleted = (item: PlaylistItem): boolean => {
    const lesson = getItemLesson(item);
    const targetLessonId = lesson?.id || item.lessonId;
    const targetVideoId = lesson?.youtubeId || item.videoId;
    const itemTitle = (item.title || lesson?.title || "").trim().toLowerCase();

    // 1. Direct completion marker in localStorage (set by handleMediaEnded)
    if (targetLessonId && localStorage.getItem(`vocab_progress_${targetLessonId}`) === "100") {
      return true;
    }
    if (targetVideoId && localStorage.getItem(`vocab_progress_${targetVideoId}`) === "100") {
      return true;
    }

    // 2. Playback progress >= 95% of duration
    const durationSec = getItemEffectiveDuration(item, lesson);
    const progSec = getItemVideoProgress(item, lesson);
    if (durationSec > 10 && progSec > 0 && progSec >= durationSec * 0.95) {
      return true;
    }

    // 3. Match against reading/listening history entries
    return history.some((h) => {
      const match =
        (targetLessonId && (h.lessonId === targetLessonId || h.id === targetLessonId)) ||
        (targetVideoId && (h.guid === targetVideoId || h.youtubeId === targetVideoId || h.lessonId === targetVideoId || h.lessonId === `youtube_${targetVideoId}`)) ||
        (itemTitle && h.lessonTitle && h.lessonTitle.trim().toLowerCase() === itemTitle);

      if (!match) return false;
      return (
        h.status === "completed" ||
        h.actionType === "complete" ||
        (h.progressPercent !== undefined && h.progressPercent >= 95)
      );
    });
  };

  // Get item status (completed | in_progress | new)
  const getItemStatus = (item: PlaylistItem): "completed" | "in_progress" | "new" => {
    if (isItemCompleted(item)) return "completed";
    const lesson = getItemLesson(item);
    const targetLessonId = lesson?.id || item.lessonId;
    const targetVideoId = lesson?.youtubeId || item.videoId;
    const itemTitle = (item.title || lesson?.title || "").trim().toLowerCase();

    const videoProgressSec = getItemVideoProgress(item, lesson);
    const durationSec = getItemEffectiveDuration(item, lesson);
    let progressPercent = 0;
    if (durationSec > 0 && videoProgressSec > 0) {
      progressPercent = Math.min(100, Math.round((videoProgressSec / durationSec) * 100));
    }
    if (progressPercent >= 95) {
      return "completed";
    }

    const hasHistoryActivity = history.some((h) => {
      const match =
        (targetLessonId && (h.lessonId === targetLessonId || h.id === targetLessonId)) ||
        (targetVideoId && (h.guid === targetVideoId || h.youtubeId === targetVideoId || h.lessonId === targetVideoId || h.lessonId === `youtube_${targetVideoId}`)) ||
        (itemTitle && h.lessonTitle && h.lessonTitle.trim().toLowerCase() === itemTitle);
      return Boolean(match);
    });

    if (progressPercent > 2 || hasHistoryActivity) {
      return "in_progress";
    }
    return "new";
  };

  // Calculate counts per status
  const statusCounts = useMemo(() => {
    let newCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;

    items.forEach((it) => {
      const status = getItemStatus(it);
      if (status === "completed") completedCount++;
      else if (status === "in_progress") inProgressCount++;
      else newCount++;
    });

    return {
      all: items.length,
      new: newCount,
      in_progress: inProgressCount,
      completed: completedCount,
    };
  }, [items, lessons, history]);

  // Pending items without loaded subtitles
  const pendingItems = useMemo(() => {
    return items.filter((item) => {
      const lesson = getItemLesson(item);
      const hasSubtitles = item.transcriptLoaded || (lesson && lesson.text && lesson.text.length > 50 && !lesson.text.includes("Субтитры отсутствуют"));
      return !hasSubtitles && !!item.videoId;
    });
  }, [items, lessons]);

  // Level counts across playlist items
  const levelCounts = useMemo<Record<DifficultyGroup, number>>(() => {
    const counts: Record<DifficultyGroup, number> = {
      all: items.length,
      "a1-a2": 0,
      "b1-b2": 0,
      "c1-c2": 0,
    };
    items.forEach((it) => {
      const lesson = getItemLesson(it);
      if (!lesson || !lesson.difficulty) return;
      const group = classifyDifficulty(lesson.difficulty);
      if (group) counts[group]++;
    });
    return counts;
  }, [items, lessons]);

  // Dynamically extract all unique user tags across playlist items and the playlist itself
  const availablePlaylistTags = useMemo(() => {
    const map = new Map<string, string>();
    const addTag = (raw?: string | null) => {
      if (!raw || typeof raw !== "string") return;
      const clean = raw.trim().replace(/^#+/, "").trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (lower === "youtube" || lower === "extension") return;
      if (!map.has(lower)) {
        const canonical =
          clean.length > 1 && clean[0] === clean[0].toLowerCase() && clean[1] === clean[1].toLowerCase()
            ? clean.charAt(0).toUpperCase() + clean.slice(1)
            : clean;
        map.set(lower, canonical);
      }
    };

    if (initialTagFilter && initialTagFilter !== "all") {
      addTag(initialTagFilter);
    }
    if (selectedTag && selectedTag !== "all") {
      addTag(selectedTag);
    }

    addTag(playlist.primaryTag);
    if (Array.isArray(playlist.tags)) playlist.tags.forEach(addTag);

    items.forEach((it) => {
      const lesson = getItemLesson(it);
      if (lesson) {
        addTag(lesson.primaryTag);
        if (Array.isArray(lesson.tags)) lesson.tags.forEach(addTag);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [playlist, items, lessons, initialTagFilter, selectedTag]);

  // Count how many items in this playlist match each tag
  const playlistTagCounts = useMemo(() => {
    const counts = new Map<string, number>();

    items.forEach((it) => {
      const lesson = getItemLesson(it);
      if (!lesson) return;

      const seen = new Set<string>();
      const add = (raw?: string | null) => {
        if (!raw || typeof raw !== "string") return;
        const clean = raw.trim().replace(/^#+/, "").trim().toLowerCase();
        if (!clean || clean === "youtube" || clean === "extension" || seen.has(clean)) return;
        seen.add(clean);
        counts.set(clean, (counts.get(clean) || 0) + 1);
      };

      add(lesson.primaryTag);
      if (Array.isArray(lesson.tags)) lesson.tags.forEach(add);
    });

    const addPlaylistTag = (raw?: string | null) => {
      if (!raw || typeof raw !== "string") return;
      const clean = raw.trim().replace(/^#+/, "").trim().toLowerCase();
      if (!clean || clean === "youtube" || clean === "extension") return;
      if (!counts.has(clean)) {
        counts.set(clean, items.length);
      }
    };
    addPlaylistTag(playlist.primaryTag);
    if (Array.isArray(playlist.tags)) playlist.tags.forEach(addPlaylistTag);

    return counts;
  }, [items, lessons, playlist]);

  // Compute sorted and filtered list of episodes
  const sortedAndFilteredItems = useMemo(() => {
    let result = [...items];

    // 1. Status filter
    if (statusFilter !== "all") {
      result = result.filter((it) => getItemStatus(it) === statusFilter);
    }

    // 2. Difficulty level filter
    if (selectedDifficulty !== "all") {
      result = result.filter((it) => {
        const lesson = getItemLesson(it);
        if (!lesson || !lesson.difficulty) return false;
        return classifyDifficulty(lesson.difficulty) === selectedDifficulty;
      });
    }

    // 3. Tag filter
    if (selectedTag !== "all") {
      const cleanTag = selectedTag.trim().replace(/^#+/, "").toLowerCase();
      const hasAnyItemWithTag = items.some((it) => {
        const lesson = getItemLesson(it);
        if (!lesson) return false;
        return (
          (lesson.primaryTag && lesson.primaryTag.trim().replace(/^#+/, "").toLowerCase() === cleanTag) ||
          (Array.isArray(lesson.tags) && lesson.tags.some(t => t.trim().replace(/^#+/, "").toLowerCase() === cleanTag))
        );
      });

      result = result.filter((it) => {
        const lesson = getItemLesson(it);
        if (hasAnyItemWithTag) {
          if (!lesson) return false;
          return (
            (lesson.primaryTag && lesson.primaryTag.trim().replace(/^#+/, "").toLowerCase() === cleanTag) ||
            (Array.isArray(lesson.tags) && lesson.tags.some(t => t.trim().replace(/^#+/, "").toLowerCase() === cleanTag))
          );
        } else {
          const playlistHasTag =
            (playlist.primaryTag && playlist.primaryTag.trim().replace(/^#+/, "").toLowerCase() === cleanTag) ||
            (Array.isArray(playlist.tags) && playlist.tags.some(t => t.trim().replace(/^#+/, "").toLowerCase() === cleanTag));
          return playlistHasTag;
        }
      });
    }

    // 4. Sorting
    if (sortOption === "duration_asc") {
      result.sort((a, b) => getItemEffectiveDuration(a, getItemLesson(a)) - getItemEffectiveDuration(b, getItemLesson(b)));
    } else if (sortOption === "duration_desc") {
      result.sort((a, b) => getItemEffectiveDuration(b, getItemLesson(b)) - getItemEffectiveDuration(a, getItemLesson(a)));
    } else if (sortOption === "title_asc") {
      result.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    } else if (sortOption === "title_desc") {
      result.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
    } else if (sortOption === "status") {
      result.sort((a, b) => {
        const aCompleted = isItemCompleted(a) ? 1 : 0;
        const bCompleted = isItemCompleted(b) ? 1 : 0;
        if (aCompleted !== bCompleted) {
          return aCompleted - bCompleted; // Uncompleted (0) first, Completed (1) last
        }
        return 0;
      });
    }

    return result;
  }, [items, sortOption, statusFilter, selectedDifficulty, selectedTag, lessons, history, playlist]);

  // Helper to open lesson
  const openLessonSafe = (lessonId: string) => {
    useBingeQueueStore.getState().setQueueContext({
      type: "playlist",
      playlistId: playlist.id,
      playlistTitle: playlist.title,
      lessonIds: sortedAndFilteredItems
        .map((it) => it.lessonId || (lessons.find((l) => it.videoId && l.youtubeId === it.videoId)?.id) || "")
        .filter(Boolean),
    });
    if (typeof onOpenLesson === "function") {
      onOpenLesson(lessonId);
    } else if (typeof onSelectLesson === "function") {
      onSelectLesson(lessonId);
    }
  };

  // Helper to add or update lesson safely
  const addOrUpdateLessonSafe = async (lesson: Lesson) => {
    if (typeof onAddOrUpdateLesson === "function") {
      await onAddOrUpdateLesson(lesson);
    } else if (typeof onAddLessonToLibrary === "function") {
      await onAddLessonToLibrary(lesson);
    } else {
      try {
        const cached = (await lessonsStore.getItem<Lesson[]>("lessons")) || [];
        const exists = cached.some((l) => l.id === lesson.id);
        const nextList = exists
          ? cached.map((l) => (l.id === lesson.id ? { ...l, ...lesson } : l))
          : [lesson, ...cached];
        await lessonsStore.setItem("lessons", nextList);
      } catch (e) {
        console.error("Direct fallback to lessonsStore failed:", e);
      }
    }
  };

  // Dedicated single-item subtitle fetcher
  const loadSubtitlesForItem = async (item: PlaylistItem): Promise<string | null> => {
    let existingLesson = getItemLesson(item);

    if (existingLesson && existingLesson.text && existingLesson.text.trim().length > 0 && !existingLesson.text.includes("Субтитры отсутствуют")) {
      return existingLesson.id;
    }

    if (!item.videoId) return null;

    const videoUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
    const apiUrl = resolveApiUrl("/api/youtube-subtitles");
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: videoUrl,
        targetLanguage: playlist.language || "English",
        uiLang: i18n.language,
      }),
    });

    const data = await res.json();
    if (!res.ok && !data.text) {
      throw new Error(data.error || `Failed to fetch YouTube subtitles for ${item.title}`);
    }

    const lessonId = existingLesson ? existingLesson.id : `yt_${item.videoId}_${Date.now()}`;
    const newLesson: Lesson = {
      id: lessonId,
      title: item.title || data.title || "YouTube Video",
      text: data.text || item.title,
      coverUrl: item.thumbnailUrl || data.coverUrl || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
      youtubeId: item.videoId,
      youtubeDuration: item.durationSeconds || data.youtubeDuration || null,
      targetLanguage: playlist.language || "english",
      translationLanguage: "russian",
      lessonType: "youtube",
      playlistId: playlist.id,
      createdAt: Date.now(),
      channelName: playlist.channelTitle || data.channelName || null,
      channelAvatarUrl: data.channelAvatarUrl || null,
    };

    await addOrUpdateLessonSafe(newLesson);
    return lessonId;
  };

  // Mass sequential subtitle downloading
  const handleDownloadAllSubtitles = async () => {
    if (pendingItems.length === 0 || isBulkDownloading) return;

    setIsBulkDownloading(true);
    setBulkProgress({ current: 0, total: pendingItems.length });

    let currentPlaylistItems = [...playlist.items];
    let successfulCount = 0;

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      setBulkProgress({ current: i + 1, total: pendingItems.length });

      try {
        const lessonId = await loadSubtitlesForItem(item);
        if (lessonId) {
          successfulCount++;
          currentPlaylistItems = currentPlaylistItems.map((it) =>
            it.id === item.id ? { ...it, lessonId, transcriptLoaded: true } : it
          );
          onUpdatePlaylist({
            ...playlist,
            items: currentPlaylistItems,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`Failed to load subtitles for video ${item.videoId}:`, err);
      }
    }

    setIsBulkDownloading(false);
    if (successfulCount > 0) {
      showToast(
        t("playlist.bulk_download_done", "Successfully downloaded subtitles for {{count}} videos!", { count: successfulCount }),
        "success"
      );
    } else {
      showToast(t("playlist.bulk_download_none", "No new subtitles could be downloaded."), "warning");
    }
  };

  // Check for newly released videos on YouTube
  const handleCheckPlaylistUpdates = async () => {
    if (!playlist.externalUrl && playlist.sourceType !== "youtube_playlist") {
      showToast(t("playlist.sync_not_supported", "Sync is only available for YouTube playlists"), "warning");
      return;
    }

    setIsCheckingUpdates(true);
    try {
      showToast(t("playlist.sync_checking", "Checking YouTube for new videos..."), "info");
      const apiUrl = resolveApiUrl("/api/youtube-playlist");
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: playlist.externalUrl || `https://www.youtube.com/playlist?list=${playlist.id}`,
          targetLanguage: playlist.language || "english",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch playlist updates");
      }

      const fetchedItems: PlaylistItem[] = data.items || [];
      const existingVideoIds = new Set(
        (playlist.items || [])
          .map((it) => it.videoId)
          .filter(Boolean)
      );

      const newItems = fetchedItems.filter(
        (it) => it.videoId && !existingVideoIds.has(it.videoId)
      );

      if (newItems.length === 0) {
        showToast(t("playlist.sync_up_to_date", "✓ Playlist is up to date (no new videos found)"), "success");
      } else {
        setNewVideosFound(newItems);
        setSelectedNewVideoIds(new Set(newItems.map((it) => it.id)));
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      showToast(err.message || t("playlist.sync_error", "Failed to check for updates"), "error");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  // Confirm adding newly discovered videos from sync
  const handleConfirmAddNewVideos = () => {
    if (!newVideosFound) return;
    const selectedToAdd = newVideosFound.filter((it) => selectedNewVideoIds.has(it.id));
    if (selectedToAdd.length === 0) {
      setNewVideosFound(null);
      return;
    }

    const updatedItems = [...(playlist.items || []), ...selectedToAdd];
    onUpdatePlaylist({
      ...playlist,
      items: updatedItems,
      itemCount: updatedItems.length,
      updatedAt: new Date().toISOString(),
    });

    showToast(
      t("playlist.sync_added_count", "Added {{count}} new videos to playlist!", {
        count: selectedToAdd.length,
      }),
      "success"
    );
    setNewVideosFound(null);
  };

  // Open item in interactive reader / player, lazy loading subtitles if needed
  const handleOpenItem = async (item: PlaylistItem) => {
    setLoadingItemId(item.id);
    try {
      let existingLesson = getItemLesson(item);

      if (existingLesson && existingLesson.text && existingLesson.text.trim().length > 0 && !existingLesson.text.includes("Субтитры отсутствуют")) {
        openLessonSafe(existingLesson.id);
        return;
      }

      // If YouTube video, lazily fetch subtitles via API
      if (item.videoId) {
        showToast(t("playlist.loading_subtitles", "Fetching subtitles for video..."), "info");
        const lessonId = await loadSubtitlesForItem(item);
        if (lessonId) {
          const updatedItems = items.map((it) =>
            it.id === item.id ? { ...it, lessonId, transcriptLoaded: true } : it
          );
          onUpdatePlaylist({
            ...playlist,
            items: updatedItems,
            updatedAt: new Date().toISOString(),
          });
          openLessonSafe(lessonId);
          showToast(t("playlist.subtitles_ready", "Video lesson ready!"), "success");
        } else {
          showToast(t("playlist.no_content", "Material text not available"), "error");
        }
      } else if (existingLesson) {
        openLessonSafe(existingLesson.id);
      } else {
        showToast(t("playlist.no_content", "Material text not available"), "error");
      }
    } catch (err: any) {
      console.error("Error opening playlist item:", err);
      showToast(err.message || t("playlist.error_opening", "Failed to open video"), "error");
    } finally {
      setLoadingItemId(null);
    }
  };

  // Play All: Starts audio queue from first uncompleted track
  const handlePlayAll = () => {
    if (items.length === 0) {
      showToast(t("playlist.empty_playlist", "This playlist is empty"), "warning");
      return;
    }

    const queueCandidates = items.map((it) => {
      const lesson = getItemLesson(it);
      return {
        id: lesson ? lesson.id : `yt_temp_${it.videoId || it.id}`,
        title: it.title,
        bookTitle: playlist.title,
        audioUrl: lesson?.audioUrl || "",
        youtubeId: it.videoId || lesson?.youtubeId || null,
        duration: it.durationSeconds || lesson?.youtubeDuration || undefined,
        coverUrl: it.thumbnailUrl || playlist.thumbnailUrl,
        targetLanguage: playlist.language,
        lessonType: "youtube",
        channelName: playlist.channelTitle,
      };
    });

    // Find first uncompleted index
    let startIndex = 0;
    const firstUnwatched = items.findIndex((it) => !isItemCompleted(it));
    if (firstUnwatched !== -1) {
      startIndex = firstUnwatched;
    }

    if (typeof onPlayQueue === "function") {
      onPlayQueue(queueCandidates, startIndex);
    } else {
      usePlaylistStore.getState().setQueue(queueCandidates, startIndex, true);
    }
    showToast(t("player.started_playlist", "Playing {{count}} tracks in queue", { count: items.length }), "success");
  };

  // Remove individual episode from playlist
  const handleRemoveEpisode = (itemId: string) => {
    const itemToRemove = items.find((it) => it.id === itemId);
    const updatedItems = items.filter((it) => it.id !== itemId);
    const isRemovingPrimary = playlist.primaryItemId === itemId;
    const nextPrimaryItem = isRemovingPrimary
      ? updatedItems[0]
      : (playlist.primaryItemId ? updatedItems.find((it) => it.id === playlist.primaryItemId) : updatedItems[0]);
    const nextLesson = nextPrimaryItem ? getItemLesson(nextPrimaryItem) : null;
    const nextThumbnail = nextPrimaryItem
      ? (nextPrimaryItem.thumbnailUrl || nextLesson?.coverUrl || (nextPrimaryItem.videoId ? `https://img.youtube.com/vi/${nextPrimaryItem.videoId}/hqdefault.jpg` : "") || playlist.thumbnailUrl)
      : "";

    onUpdatePlaylist({
      ...playlist,
      items: updatedItems,
      itemCount: updatedItems.length,
      primaryItemId: isRemovingPrimary ? (updatedItems[0]?.id || undefined) : playlist.primaryItemId,
      thumbnailUrl: isRemovingPrimary ? nextThumbnail : playlist.thumbnailUrl,
      updatedAt: new Date().toISOString(),
    });
    if (itemToRemove && typeof onAddOrUpdateLesson === "function") {
      const matchLesson = lessons.find(
        (l) => (itemToRemove.lessonId && l.id === itemToRemove.lessonId) || (itemToRemove.videoId && l.youtubeId === itemToRemove.videoId)
      );
      if (matchLesson && matchLesson.playlistId === playlist.id) {
        onAddOrUpdateLesson({
          ...matchLesson,
          playlistId: undefined,
        });
      }
    }
    showToast(t("playlist.episode_removed", "Video removed from playlist"), "success");
  };

  // Selection & Move helpers
  const toggleSelectItem = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItemIds.size === sortedAndFilteredItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(sortedAndFilteredItems.map((it) => it.id)));
    }
  };

  const handleBatchMove = () => {
    const selectedItems = items.filter((it) => selectedItemIds.has(it.id));
    if (selectedItems.length === 0) return;
    setMoveModalItems(selectedItems);
  };

  const handleBatchDelete = () => {
    if (selectedItemIds.size === 0) return;
    const deletedItems = items.filter((it) => selectedItemIds.has(it.id));
    const remainingItems = items.filter((it) => !selectedItemIds.has(it.id));
    const isRemovingPrimary = playlist.primaryItemId ? selectedItemIds.has(playlist.primaryItemId) : false;
    const nextPrimaryItem = isRemovingPrimary
      ? remainingItems[0]
      : (playlist.primaryItemId ? remainingItems.find((it) => it.id === playlist.primaryItemId) : remainingItems[0]);
    const nextLesson = nextPrimaryItem ? getItemLesson(nextPrimaryItem) : null;
    const nextThumbnail = nextPrimaryItem
      ? (nextPrimaryItem.thumbnailUrl || nextLesson?.coverUrl || (nextPrimaryItem.videoId ? `https://img.youtube.com/vi/${nextPrimaryItem.videoId}/hqdefault.jpg` : "") || playlist.thumbnailUrl)
      : "";

    onUpdatePlaylist({
      ...playlist,
      items: remainingItems,
      itemCount: remainingItems.length,
      primaryItemId: isRemovingPrimary ? (remainingItems[0]?.id || undefined) : playlist.primaryItemId,
      thumbnailUrl: isRemovingPrimary ? nextThumbnail : playlist.thumbnailUrl,
      updatedAt: new Date().toISOString(),
    });
    if (typeof onAddOrUpdateLesson === "function") {
      deletedItems.forEach((deletedItem) => {
        const matchLesson = lessons.find(
          (l) => (deletedItem.lessonId && l.id === deletedItem.lessonId) || (deletedItem.videoId && l.youtubeId === deletedItem.videoId)
        );
        if (matchLesson && matchLesson.playlistId === playlist.id) {
          onAddOrUpdateLesson({
            ...matchLesson,
            playlistId: undefined,
          });
        }
      });
    }
    showToast(
      t("playlist.batch_deleted", "Removed {{count}} videos from playlist", {
        count: selectedItemIds.size,
      }),
      "success"
    );
    setSelectedItemIds(new Set());
    setIsSelectMode(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-3xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("common.back_to_library", "Back to Library")}</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Check updates / Sync button for YouTube playlists */}
          {(playlist.sourceType === "youtube_playlist" || playlist.externalUrl) && (
            <button
              type="button"
              disabled={isCheckingUpdates}
              onClick={handleCheckPlaylistUpdates}
              className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-colors cursor-pointer border border-zinc-200/80 dark:border-zinc-700/80 disabled:opacity-60"
              title={t("playlist.sync_btn_tooltip", "Check YouTube for new videos")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? "animate-spin text-teal-600 dark:text-teal-400" : ""}`} />
              <span className="hidden sm:inline">{isCheckingUpdates ? t("playlist.sync_checking_btn", "Checking...") : t("playlist.sync_btn", "Sync")}</span>
            </button>
          )}

          {/* Archive / Unarchive Action */}
          <button
            type="button"
            onClick={() => {
              onToggleArchive?.(playlist.id);
              showToast(
                playlist.isArchived
                  ? t("library.unarchived_toast", "Restored from archive")
                  : t("library.archived_toast", "Moved to archive"),
                "info"
              );
            }}
            className={`inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer border ${
              playlist.isArchived
                ? "bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-700/80"
            }`}
            title={playlist.isArchived ? t("common.unarchive", "Unarchive") : t("common.archive", "Archive")}
          >
            {playlist.isArchived ? (
              <>
                <ArchiveRestore className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.unarchive", "Unarchive")}</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.archive", "Archive")}</span>
              </>
            )}
          </button>

          {playlist.externalUrl && (
            <a
              href={playlist.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title={t("playlist.open_youtube", "Open on YouTube")}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-2 text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
            title={t("playlist.delete", "Delete playlist")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-zinc-900 dark:text-zinc-100">
                  {t("playlist.delete_title", "Delete Playlist?")}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("playlist.delete_subtitle", "This will remove the playlist container from your library.")}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onDeletePlaylist(playlist.id);
                  setShowDeleteModal(false);
                  onBack();
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
              >
                {t("library.confirm_delete", "Yes, delete")}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                {t("library.cancel", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Videos Found (Diff Checker Sync) Modal */}
      {newVideosFound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-2xl">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                    {t("playlist.sync_modal_title", "New Videos Found")} ({newVideosFound.length})
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("playlist.sync_modal_subtitle", "The following new videos were found in this YouTube playlist:")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewVideosFound(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Select All / Deselect All */}
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400 px-1">
              <span>{t("playlist.selected_count", "Selected: {{count}} / {{total}}", { count: selectedNewVideoIds.size, total: newVideosFound.length })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedNewVideoIds(new Set(newVideosFound.map((v) => v.id)))}
                  className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  {t("common.select_all", "Select all")}
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSelectedNewVideoIds(new Set())}
                  className="text-zinc-500 hover:underline cursor-pointer"
                >
                  {t("common.deselect_all", "Deselect all")}
                </button>
              </div>
            </div>

            {/* Video List */}
            <div className="overflow-y-auto space-y-2 flex-1 pr-1 max-h-[50vh]">
              {newVideosFound.map((item) => {
                const isSelected = selectedNewVideoIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedNewVideoIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                      isSelected
                        ? "bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 shadow-xs"
                        : "bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 border-zinc-200/60 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-16 aspect-video rounded-lg overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800 relative">
                        <img
                          src={item.thumbnailUrl || ""}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        {(() => {
                          const dur = getItemEffectiveDuration(item, getItemLesson(item));
                          return dur > 0 ? (
                            <div className="absolute bottom-1 right-1 px-1 py-0.2 text-[9px] font-mono font-bold bg-black/80 text-white rounded">
                              {formatDuration(dur)}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.title}
                        </h4>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 ${
                        isSelected
                          ? "bg-teal-600 text-white"
                          : "border border-zinc-300 dark:border-zinc-700 text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setNewVideosFound(null)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                disabled={selectedNewVideoIds.size === 0}
                onClick={handleConfirmAddNewVideos}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-teal-600/20"
              >
                {t("playlist.sync_add_btn", "Add to Playlist ({{count}})", { count: selectedNewVideoIds.size })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Media / Video to Playlist Modal */}
      {showAddMediaModal && (
        <AddMediaToPlaylistModal
          isOpen={showAddMediaModal}
          onClose={() => setShowAddMediaModal(false)}
          playlist={playlist}
          lessons={lessons}
          onUpdatePlaylist={onUpdatePlaylist}
          onAddOrUpdateLesson={onAddOrUpdateLesson}
        />
      )}

      {/* 2-Column YouTube Layout */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        
        {/* Left Column (Sticky Sidebar Header - YouTube Proportional Width) */}
        <div className="w-full lg:w-[350px] xl:w-[380px] shrink-0 lg:sticky lg:top-20 space-y-4">
          <div className="bg-gradient-to-b from-zinc-100 via-zinc-100/90 to-zinc-50 dark:from-zinc-850 dark:via-zinc-900 dark:to-zinc-950 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 p-5 space-y-4 shadow-sm">
            {/* Big Playlist Cover Art (Full Width 16:9 Aspect Ratio) */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-zinc-950 shadow-md border border-zinc-800/80 group">
              {effectiveThumbnailUrl ? (
                <img
                  src={effectiveThumbnailUrl}
                  alt={playlist.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.includes("/maxresdefault.jpg")) {
                      target.src = target.src.replace("/maxresdefault.jpg", "/hqdefault.jpg");
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-800 to-indigo-900">
                  <ListVideo className="w-14 h-14 text-white/40" />
                </div>
              )}

              {/* Quick Change Cover button on hover */}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCoverPicker(true)}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-black/75 hover:bg-black/90 backdrop-blur-md rounded-xl text-white text-[11px] font-bold flex items-center gap-1.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md active:scale-95 z-10"
                  title={t("playlist.choose_cover", "Выбрать обложку")}
                >
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>{t("playlist.cover_badge", "Обложка")}</span>
                </button>
              )}

              {/* Bottom right track count badge */}
              <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-black/90 rounded-lg text-white font-mono text-xs font-bold flex items-center gap-1.5 border border-white/10 shadow-sm z-10">
                <ListVideo className="w-3.5 h-3.5" />
                <span>{items.length}</span>
              </div>
            </div>

            {/* Title & Channel Details */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-zinc-200/80 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full text-zinc-800 dark:text-zinc-200">
                  {renderCircularFlag(flag)}
                  <span>{localizedLang}</span>
                </span>
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                  {playlist.sourceType === "youtube_playlist" ? "YouTube Playlist" : t("playlist.custom", "Collection")}
                </span>
                {playlist.isArchived && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 rounded-md border border-amber-300 dark:border-amber-800">
                    {t("common.archived", "Archived")}
                  </span>
                )}
              </div>

              {isEditingTitle ? (
                <div className="flex items-center gap-2 pt-1 w-full">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="flex-1 min-w-0 px-3 py-1.5 text-base sm:text-lg font-bold bg-white dark:bg-zinc-900 border border-teal-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-zinc-950 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    disabled={!editingTitleValue.trim()}
                    className="p-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl transition cursor-pointer shrink-0 shadow-sm"
                    title={t("common.save", "Save")}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTitleValue(playlist.title);
                      setIsEditingTitle(false);
                    }}
                    className="p-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl transition cursor-pointer shrink-0"
                    title={t("common.cancel", "Cancel")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group/pl-title">
                  <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white leading-tight tracking-tight">
                    {playlist.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTitleValue(playlist.title);
                      setIsEditingTitle(true);
                    }}
                    className="opacity-60 group-hover/pl-title:opacity-100 hover:!opacity-100 p-1.5 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer shrink-0"
                    title={t("playlist.rename", "Rename playlist")}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}

              {playlist.channelTitle && (
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {playlist.channelTitle}
                </p>
              )}

              {/* Playlist Tags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {playlist.primaryTag && (
                  <button
                    type="button"
                    onClick={() => setIsTagsModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 cursor-pointer hover:opacity-90 transition shadow-2xs"
                    title={t("tags.primary_tag_tooltip", "Primary category (click to edit)")}
                  >
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                    <span>#{playlist.primaryTag}</span>
                  </button>
                )}
                {Array.isArray(playlist.tags) && playlist.tags.filter((t) => t.toLowerCase() !== playlist.primaryTag?.toLowerCase()).map((tag) => {
                  const col = getTagColor(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setIsTagsModalOpen(true)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${col.lightBg} ${col.border} ${col.text} cursor-pointer hover:opacity-90 transition`}
                    >
                      <span>#{tag}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setIsTagsModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title={t("tags.edit_tags", "Edit tags")}
                >
                  <Tag className="w-3 h-3" />
                  <span>{!playlist.primaryTag && (!playlist.tags || playlist.tags.length === 0) ? `+ ${t("tags.add_tag", "Add Tag")}` : t("common.edit", "Edit")}</span>
                </button>
              </div>

              {/* Aggregate Meta Stats */}
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal flex items-center gap-2">
                <span>{items.length} {t("playlist.videos_count", "videos")}</span>
                {totalSeconds > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatTotalDuration(totalSeconds, t)}</span>
                  </>
                )}
              </div>

              {/* Total Playlist Completion Progress */}
              {items.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    <span>{t("playlist.progress_label", "Progress")}</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">
                      {statusCounts.completed} / {items.length} {t("playlist.completed_short", "completed")} ({items.length > 0 ? Math.round((statusCounts.completed / items.length) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200/80 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${items.length > 0 ? Math.round((statusCounts.completed / items.length) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {playlist.description && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed pt-1">
                  {playlist.description}
                </p>
              )}
            </div>

            {/* Actions: ▶ Play All */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handlePlayAll}
                className="w-full py-3 px-5 bg-teal-600 hover:bg-teal-500 active:scale-98 text-white font-bold text-sm rounded-full flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-teal-600/20"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t("player.play_all", "Play All")}</span>
              </button>
            </div>

            {/* Aggregate Vocabulary & Comprehension Analytics */}
            {playlistAggregateStats.hasAnyText ? (
              <div className="pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3">
                {/* Header with Title and CEFR Level */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      {t("playlist.analytics_title", "Лексика и понимание")}
                    </span>
                  </div>
                  {playlistAggregateStats.difficultyLabel && (
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80"
                      title={t("playlist.level_label", "Сложность")}
                    >
                      {playlistAggregateStats.difficultyLabel}
                    </span>
                  )}
                </div>

                {/* Comprehension Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span>{t("playlist.comprehension_stat", "Понимание")}:</span>
                      <span className="text-sm font-black">{playlistAggregateStats.knownPct}%</span>
                    </span>
                    <span className="text-sky-500 dark:text-sky-400 text-[11px] font-semibold">
                      {t("library.new_stat", "New:")} {playlistAggregateStats.unknownPct}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-sky-500/20 flex overflow-hidden">
                    <div
                      style={{ width: `${playlistAggregateStats.knownPct}%` }}
                      className="bg-emerald-500 h-full transition-all duration-300"
                    />
                    <div
                      style={{ width: `${playlistAggregateStats.unknownPct}%` }}
                      className="bg-sky-400 h-full transition-all duration-300"
                    />
                  </div>
                </div>

                {/* 2x2 Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Total Unique Words */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50">
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium leading-none">
                      {t("playlist.total_unique_words", "Всего уникальных")}
                    </div>
                    <div className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 font-mono mt-1.5 leading-none">
                      ~{formatWordCount(playlistAggregateStats.uniqueTotalWords)}
                    </div>
                  </div>

                  {/* New to you */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50">
                    <div className="text-[10px] text-sky-600 dark:text-sky-400 font-medium leading-none">
                      {t("playlist.new_for_you", "Новых для вас")}
                    </div>
                    <div className="text-base font-extrabold text-sky-600 dark:text-sky-400 font-mono mt-1.5 leading-none flex items-baseline gap-1">
                      <span>~{formatWordCount(playlistAggregateStats.uniqueUnknownCount)}</span>
                      <span className="text-[10px] font-sans font-bold opacity-80">({playlistAggregateStats.unknownVocabularyPct}%)</span>
                    </div>
                  </div>

                  {/* Already known */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50">
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium leading-none">
                      {t("playlist.already_known", "Уже знакомо")}
                    </div>
                    <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1.5 leading-none flex items-baseline gap-1">
                      <span>~{formatWordCount(playlistAggregateStats.uniqueKnownCount)}</span>
                      <span className="text-[10px] font-sans font-bold opacity-80">({playlistAggregateStats.knownVocabularyPct}%)</span>
                    </div>
                  </div>

                  {/* Total running words */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50">
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium leading-none">
                      {t("playlist.total_words_stream", "Всего слов")}
                    </div>
                    <div className="text-base font-extrabold text-zinc-700 dark:text-zinc-300 font-mono mt-1.5 leading-none">
                      ~{formatWordCount(playlistAggregateStats.totalWords)}
                    </div>
                  </div>
                </div>

                {/* Subtitle coverage note */}
                <div className="pt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                  {playlistAggregateStats.lessonsWithTextCount === items.length ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[10.5px]">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>{t("playlist.all_subtitles_analyzed", "All {{count}} videos analyzed", { count: items.length })}</span>
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      {t("playlist.based_on_subtitles", "Based on {{current}} of {{total}} videos with subtitles", {
                        current: playlistAggregateStats.lessonsWithTextCount,
                        total: items.length,
                      })}
                    </span>
                  )}
                </div>
              </div>
            ) : items.length > 0 ? (
              <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 text-center p-3 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800/80 space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-zinc-400 dark:text-zinc-500 text-xs font-semibold">
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>{t("playlist.analytics_title", "Лексика и понимание")}</span>
                </div>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-tight">
                  {t("playlist.no_subtitles_stats", "Субтитры еще не загружены для анализа лексики")}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Column (Videos / Episodes List with Sorting & Search) */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header toolbar with counter, search input, and sort dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <span>{t("playlist.episodes_list", "Videos / Episodes")}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
                  {sortedAndFilteredItems.length}{selectedDifficulty !== "all" || selectedTag !== "all" || statusFilter !== "all" ? ` / ${items.length}` : ""}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Add video shortcut button */}
              <button
                type="button"
                onClick={() => setShowAddMediaModal(true)}
                className="w-9 h-9 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 transition-all cursor-pointer shrink-0"
                title={t("playlist.add_media_btn", "Add video / lesson")}
              >
                <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="hidden sm:inline">{t("playlist.add_btn_short", "Add")}</span>
              </button>

              {/* Multi-select toggle button */}
              <button
                type="button"
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedItemIds(new Set());
                }}
                className={`w-9 h-9 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
                  isSelectMode
                    ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                    : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60"
                }`}
                title={isSelectMode ? t("common.cancel", "Cancel") : t("playlist.select_videos", "Select multiple")}
              >
                {isSelectMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                <span className="hidden sm:inline">
                  {isSelectMode ? t("common.cancel", "Cancel") : t("common.select", "Select")}
                </span>
              </button>
              {/* Bulk Subtitles Download Button */}
              {pendingItems.length > 0 ? (
                <button
                  type="button"
                  disabled={isBulkDownloading}
                  onClick={handleDownloadAllSubtitles}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs shrink-0 ${
                    isBulkDownloading
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse cursor-wait"
                      : "bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-300/60 dark:border-teal-700/60"
                  }`}
                  title={
                    isBulkDownloading
                      ? `${t("playlist.downloading_bulk", "Downloading subtitles")} (${bulkProgress.current}/${bulkProgress.total})`
                      : t("playlist.download_all_tooltip", "Download subtitles sequentially for all pending videos")
                  }
                >
                  {isBulkDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                      <span>
                        {t("playlist.bulk_progress", "Downloading: {{current}} / {{total}}...", {
                          current: bulkProgress.current,
                          total: bulkProgress.total,
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>
                        {t("playlist.download_all_btn", "Download All Subtitles ({{count}})", { count: pendingItems.length })}
                      </span>
                    </>
                  )}
                </button>
              ) : null}

              {/* Tag Filter Dropdown */}
              <TagFilterDropdown
                selectedTag={selectedTag}
                onSelectTag={setSelectedTag}
                availableTags={availablePlaylistTags}
                tagCounts={playlistTagCounts}
              />

              {/* Level Filter Dropdown */}
              <LevelFilterDropdown
                selectedDifficulty={selectedDifficulty}
                onSelectDifficulty={setSelectedDifficulty}
                levelCounts={levelCounts}
              />

              {/* Animated Reset Filters Button */}
              {(selectedTag !== "all" || selectedDifficulty !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTag("all");
                    setSelectedDifficulty("all");
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 border bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-900/60 shadow-3xs animate-in fade-in zoom-in-95 duration-150"
                  title={t("library.reset_all_filters", "Reset all filters")}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t("library.reset", "Reset")}</span>
                </button>
              )}

              {/* Sort dropdown (compact icon button on mobile, full select on desktop) */}
              <div className="relative shrink-0">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as PlaylistSortOption)}
                  className="w-9 h-9 sm:w-auto appearance-none pl-2.5 pr-2.5 sm:pl-7 sm:pr-7 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-transparent sm:text-zinc-800 dark:sm:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60 rounded-xl cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors"
                  title={t("playlist.sort_title", "Sort order")}
                >
                  <option value="default" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_default", "Default order")}</option>
                  <option value="duration_asc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_duration_asc", "Shortest first")}</option>
                  <option value="duration_desc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_duration_desc", "Longest first")}</option>
                  <option value="title_asc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_title_asc", "Title (A - Z)")}</option>
                  <option value="title_desc" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_title_desc", "Title (Z - A)")}</option>
                  <option value="status" className="text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">{t("playlist.sort_status", "Incomplete first")}</option>
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 absolute left-1/2 -translate-x-1/2 sm:left-2 sm:translate-x-0 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
                <ChevronDown className="hidden sm:block w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Status Filter Chips Row (Horizontal Scroll with touch smooth and w-full) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full scroll-smooth">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "all"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.all", "All")}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                statusFilter === "all"
                  ? "bg-white/20 text-white"
                  : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
              }`}>
                {statusCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("new")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "new"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.new", "New")}</span>
              {statusCounts.new > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  statusFilter === "new"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {statusCounts.new}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("in_progress")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "in_progress"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.in_progress", "In Progress")}</span>
              {statusCounts.in_progress > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  statusFilter === "in_progress"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {statusCounts.in_progress}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("completed")}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap select-none ${
                statusFilter === "completed"
                  ? "bg-zinc-900 text-white dark:bg-teal-600 dark:text-white shadow-xs"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/50"
              }`}
            >
              <span>{t("common.completed", "Completed")}</span>
              {statusCounts.completed > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  statusFilter === "completed"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {statusCounts.completed}
                </span>
              )}
            </button>
          </div>

          {/* Multi-selection Action Toolbar */}
          {isSelectMode && (
            <div className="p-3 bg-teal-50/90 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/80 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer flex items-center gap-1.5"
                >
                  {selectedItemIds.size === sortedAndFilteredItems.length && sortedAndFilteredItems.length > 0 ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>
                    {selectedItemIds.size === sortedAndFilteredItems.length && sortedAndFilteredItems.length > 0
                      ? t("common.deselect_all", "Deselect all")
                      : t("common.select_all", "Select all")}
                  </span>
                </button>
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  • {t("playlist.selected_count", "Selected: {{count}}", { count: selectedItemIds.size })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedItemIds.size === 0}
                  onClick={handleBatchMove}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  <span>{t("playlist.move_selected", "Move")} ({selectedItemIds.size})</span>
                </button>

                <button
                  type="button"
                  disabled={selectedItemIds.size === 0}
                  onClick={handleBatchDelete}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("common.delete", "Delete")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedItemIds(new Set());
                  }}
                  className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-lg cursor-pointer"
                  title={t("common.close", "Close")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Episode Cards List */}
          {sortedAndFilteredItems.length === 0 ? (
            <div className="p-8 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 text-center space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {selectedTag !== "all"
                  ? t("playlist.no_tag_matches", "No videos match the selected tag.")
                  : selectedDifficulty !== "all"
                  ? t("playlist.no_level_matches", "No videos match the selected difficulty level.")
                  : statusFilter !== "all"
                  ? t("playlist.no_status_matches", "No videos in this category.")
                  : t("playlist.empty_playlist", "This playlist is empty.")}
              </p>
              {(statusFilter !== "all" || selectedDifficulty !== "all" || selectedTag !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("all");
                    setSelectedDifficulty("all");
                    setSelectedTag("all");
                  }}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  {t("playlist.clear_filter", "Clear filter")}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedAndFilteredItems.map((item) => {
                const originalIndex = items.findIndex((it) => it.id === item.id) + 1;
                const lesson = getItemLesson(item);
                const isCompleted = isItemCompleted(item);
                const isLoading = loadingItemId === item.id;
                const isSelected = selectedItemIds.has(item.id);
                const hasSubtitles = item.transcriptLoaded || (lesson && lesson.text && lesson.text.length > 50);

                // Calculate playback/reading progress
                const videoProgressSec = getItemVideoProgress(item, lesson);
                const durationSec = getItemEffectiveDuration(item, lesson);
                let progressPercent = 0;
                if (durationSec > 0 && videoProgressSec > 0) {
                  progressPercent = Math.min(100, Math.round((videoProgressSec / durationSec) * 100));
                }
                const isInProgress = !isCompleted && getItemStatus(item) === "in_progress";

                // Calculate word counts & comprehension stats
                const hasLessonText = !!(lesson && lesson.text && lesson.text.length > 20);
                const rawWordCount = hasLessonText ? lesson!.text.split(/\s+/).filter(Boolean).length : null;
                const formattedWordCount = rawWordCount !== null ? (rawWordCount >= 1000 ? `${(rawWordCount / 1000).toFixed(1).replace('.0', '')}k` : `${rawWordCount}`) : null;
                const bookStats = (hasLessonText && vocab && wordLinks) ? getCachedBookStats(lesson!, vocab, wordLinks) : null;
                const isCover = activeCoverItem?.id === item.id;

                return (
                  <div
                    key={item.id}
                    draggable={!isSelectMode}
                    onDragStart={(e) => {
                      if (isSelectMode) {
                        e.preventDefault();
                        return;
                      }
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("input")) {
                        e.preventDefault();
                        return;
                      }
                      setDraggedItemId(item.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!draggedItemId || draggedItemId === item.id) return;
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      const pos = e.clientY < midY ? "before" : "after";
                      if (dragOverItemId !== item.id || dropPosition !== pos) {
                        setDragOverItemId(item.id);
                        setDropPosition(pos);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (dragOverItemId === item.id) {
                        setDragOverItemId(null);
                        setDropPosition(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!draggedItemId || draggedItemId === item.id) {
                        setDraggedItemId(null);
                        setDragOverItemId(null);
                        setDropPosition(null);
                        return;
                      }
                      handleReorderItems(draggedItemId, item.id, dropPosition || "before");
                      setDraggedItemId(null);
                      setDragOverItemId(null);
                      setDropPosition(null);
                    }}
                    onDragEnd={() => {
                      setDraggedItemId(null);
                      setDragOverItemId(null);
                      setDropPosition(null);
                    }}
                    onClick={(e) => {
                      if (isSelectMode) {
                        toggleSelectItem(item.id, e);
                      } else {
                        handleOpenItem(item);
                      }
                    }}
                    className={`group relative p-2.5 sm:p-3 rounded-2xl border transition-all duration-150 flex items-center gap-3 cursor-pointer select-none ${
                      isSelectMode && isSelected
                        ? "bg-teal-50/80 dark:bg-teal-950/40 border-teal-400 dark:border-teal-600 shadow-xs"
                        : isCompleted
                        ? "bg-zinc-50/70 dark:bg-zinc-900/40 border-zinc-200/60 dark:border-zinc-800/60 opacity-85"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-md"
                    } ${
                      draggedItemId === item.id
                        ? "opacity-35 scale-[0.99] border-dashed border-teal-500 bg-teal-50/20 dark:bg-teal-950/20"
                        : ""
                    }`}
                  >
                    {/* Drag Insertion Indicators */}
                    {dragOverItemId === item.id && dropPosition === "before" && (
                      <div className="absolute -top-1.5 inset-x-2 h-1 bg-teal-500 rounded-full z-20 shadow-sm shadow-teal-500/50 flex items-center pointer-events-none">
                        <div className="w-2.5 h-2.5 rounded-full bg-teal-500 -ml-1 ring-2 ring-white dark:ring-zinc-900" />
                      </div>
                    )}
                    {dragOverItemId === item.id && dropPosition === "after" && (
                      <div className="absolute -bottom-1.5 inset-x-2 h-1 bg-teal-500 rounded-full z-20 shadow-sm shadow-teal-500/50 flex items-center pointer-events-none">
                        <div className="w-2.5 h-2.5 rounded-full bg-teal-500 -ml-1 ring-2 ring-white dark:ring-zinc-900" />
                      </div>
                    )}

                    {/* Track Original Index number or Checkbox in Select Mode */}
                    {isSelectMode ? (
                      <div
                        onClick={(e) => toggleSelectItem(item.id, e)}
                        className="cursor-pointer shrink-0 text-teal-600 dark:text-teal-400 w-5 flex items-center justify-center"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        ) : (
                          <Square className="w-5 h-5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300" />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <div
                          className="text-zinc-300 dark:text-zinc-600 hover:text-teal-600 dark:hover:text-teal-400 p-0.5 rounded transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing opacity-30 group-hover:opacity-100"
                          title={t("playlist.drag_to_reorder", "Перетащите, чтобы изменить порядок")}
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                        <span
                          title={`#${originalIndex}`}
                          className="w-5 text-center text-xs font-mono font-bold text-zinc-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0 hidden sm:inline-block"
                        >
                          #{originalIndex}
                        </span>
                      </div>
                    )}

                    {/* Video Thumbnail (Fixed 24/28 width, compact aspect-video) */}
                    <div className="relative w-24 sm:w-28 h-[58px] sm:h-[68px] rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-zinc-800">
                      <img
                        src={item.thumbnailUrl || (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : "")}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src.includes("/maxresdefault.jpg")) {
                            target.src = target.src.replace("/maxresdefault.jpg", "/hqdefault.jpg");
                          }
                        }}
                      />
                      {durationSec > 0 && (
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.2 bg-black/85 text-white font-mono text-[9px] font-bold rounded">
                          {formatDuration(durationSec)}
                        </span>
                      )}

                      {isCompleted && (
                        <div className="absolute inset-0 bg-teal-950/70 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-teal-300" />
                        </div>
                      )}

                      {/* In Progress Mini Progress Bar */}
                      {isInProgress && progressPercent > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 overflow-hidden">
                          <div style={{ width: `${progressPercent}%` }} className="h-full bg-teal-400 rounded-full transition-all" />
                        </div>
                      )}
                    </div>

                    {/* Right: Title & 1-row metadata */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-2 leading-snug">
                        {item.title}
                      </h3>

                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500 dark:text-zinc-400 leading-none">
                        {/* Status Badge: Completed vs In Progress vs New */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>{t("common.completed", "Completed")}</span>
                          </span>
                        ) : isInProgress ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800/80">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{t("common.in_progress", "In Progress")}{progressPercent > 0 ? ` (${progressPercent}%)` : ""}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50">
                            <span>{t("common.new", "New")}</span>
                          </span>
                        )}

                        {/* Cover Badge */}
                        {isCover && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 shadow-3xs">
                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                            <span>{t("playlist.cover_badge", "Обложка")}</span>
                          </span>
                        )}

                        {/* Difficulty Badge */}
                        {lesson?.difficulty && (
                          <span
                            className="text-[9.5px] font-black leading-none px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 shrink-0"
                            title={lesson.difficultyExplanation || `Difficulty: ${lesson.difficulty}`}
                          >
                            {lesson.difficulty}
                          </span>
                        )}

                        {/* Word count & comprehension */}
                        {hasLessonText ? (
                          <>
                            {formattedWordCount && (
                              <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400 font-medium">
                                <span>•</span>
                                <span>📚 {formattedWordCount} {t("library.words", "words")}</span>
                              </span>
                            )}

                            {bookStats && (
                              <>
                                <span 
                                  className="inline-flex items-center gap-1.5 font-bold"
                                  title={t("library.tooltip_comp_bar", "Comprehension: {{pct}}% (Known: {{known}} of {{tokens}} tokens to study)", {
                                    pct: bookStats.knownPct,
                                    known: bookStats.knownCount,
                                    tokens: bookStats.eligibleTokens
                                  })}
                                >
                                  <span>•</span>
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {t("library.understood_stat", "Understood:")} {bookStats.knownPct}%
                                  </span>
                                  <div
                                    className="w-10 sm:w-12 h-1.5 rounded-full bg-sky-500/20 flex overflow-hidden shrink-0 self-center"
                                  >
                                    <div style={{ width: `${bookStats.knownPct}%` }} className="bg-emerald-500 h-full transition-all duration-300" />
                                    <div style={{ width: `${bookStats.unknownPct}%` }} className="bg-sky-400 h-full transition-all duration-300" />
                                  </div>
                                </span>

                                <span 
                                  className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"
                                  title={t("library.tooltip_vocab_compact", "Vocabulary: {{pct}}% ({{unique}} lemmas out of {{total}} to study)", {
                                    pct: bookStats.knownVocabularyPct,
                                    unique: bookStats.uniqueKnownCount,
                                    total: bookStats.eligibleLemmas
                                  })}
                                >
                                  <span>•</span>
                                  <span>{t("library.vocab_stat", "Vocabulary:")} {bookStats.knownVocabularyPct}%</span>
                                </span>

                                <span 
                                  className="inline-flex items-center gap-1 text-sky-500 dark:text-sky-400 font-bold"
                                  title={t("library.tooltip_new_compact", "New words: {{pct}}% ({{unique}} new unique lemmas)", {
                                    pct: bookStats.unknownVocabularyPct,
                                    unique: bookStats.uniqueUnknownCount
                                  })}
                                >
                                  <span>•</span>
                                  <span>{t("library.new_stat", "New:")} {bookStats.unknownVocabularyPct}%</span>
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-400 dark:text-zinc-500 font-medium text-[10.5px]">
                            <span>•</span>
                            <Sparkles className="w-2.5 h-2.5 text-teal-500/70" />
                            <span>{t("playlist.lazy_subs", "Subtitles on demand")}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Trailing Loader / Move & Delete Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isLoading && (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400 mr-1" />
                      )}
                      {/* Set as Cover button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetCoverItem(item);
                        }}
                        title={isCover ? t("playlist.is_cover_item", "Главное видео (обложка)") : t("playlist.set_as_cover", "Сделать обложкой")}
                        className={`p-1.5 rounded-xl transition-all cursor-pointer border ${
                          isCover
                            ? "text-amber-500 bg-amber-500/15 border-amber-500/30 opacity-100 shadow-3xs"
                            : "text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/50 border-transparent hover:border-amber-200 dark:hover:border-amber-800/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isCover ? "fill-amber-400 text-amber-500" : ""}`} />
                      </button>
                      {/* Edit lesson button — shown when lesson is in the library */}
                      {lesson && onEditLesson && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditLesson(lesson);
                          }}
                          title={t("library.edit_tooltip", "Edit book")}
                          className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Move to another playlist button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveModalItems([item]);
                        }}
                        title={t("playlist.move_video", "Переместить в другой плейлист")}
                        className="p-1.5 text-zinc-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-teal-200 dark:hover:border-teal-800/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <FolderInput className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveEpisode(item.id);
                        }}
                        title={t("playlist.remove_video", "Remove from playlist")}
                        className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Move / Copy to Playlist Modal */}
      {moveModalItems && moveModalItems.length > 0 && (
        <MoveToPlaylistModal
          isOpen={true}
          onClose={() => setMoveModalItems(null)}
          sourcePlaylist={playlist}
          items={moveModalItems}
          playlists={playlists}
          lessons={lessons}
          languageFlags={languageFlags}
          onMoveItems={(items, sourceId, targetId, mode) => {
            onMovePlaylistItem?.(items, sourceId, targetId, mode);
            if (mode === "move") {
              setSelectedItemIds(new Set());
              setIsSelectMode(false);
            }
            setMoveModalItems(null);
          }}
          onAddPlaylist={onAddPlaylist}
        />
      )}

      {/* Select Cover Modal */}
      {showCoverPicker && (
        <SelectPlaylistCoverModal
          isOpen={showCoverPicker}
          onClose={() => setShowCoverPicker(false)}
          playlist={playlist}
          lessons={lessons}
          onUpdatePlaylist={onUpdatePlaylist}
        />
      )}

      {/* Playlist Tags Modal */}
      {isTagsModalOpen && (
        <PlaylistTagsModal
          isOpen={isTagsModalOpen}
          onClose={() => setIsTagsModalOpen(false)}
          playlist={playlist}
          availableTags={getAllKnownTags(lessons, playlists, history)}
          onSave={(pTag, tgs) => {
            onUpdatePlaylist({
              ...playlist,
              primaryTag: pTag,
              tags: tgs,
              updatedAt: new Date().toISOString(),
            });
          }}
        />
      )}
    </div>
  );
};

export default PlaylistDetailView;
