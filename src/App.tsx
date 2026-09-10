/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useUIStore } from "./store/uiStore";
import ReaderScreen from "./components/ReaderScreen";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Lesson, LessonType, VocabItem, WordStatus, AppStats, ReaderSettings, HistoryEntry, Playlist, DEFAULT_TOOLBAR_VISIBILITY, DEFAULT_READER_SETTINGS, isVideoLesson } from "./types";
import { BUILT_IN_LESSONS, DEFAULT_LESSON_TYPES, ensureDefaultLessonTypes } from "./data";
import AppSidebar from "./components/layout/AppSidebar";
import AppHeader from "./components/layout/AppHeader";
import ManageLanguagesModal from "./components/ManageLanguagesModal";
import ReaderPanel from "./components/ReaderPanel";
import WordExplainer from "./components/WordExplainer";
import AudioPlayerBar from "./components/AudioPlayerBar";
import ReaderView from "./components/ReaderView";
import { APP_VERSION } from "./version";
import { useLesson } from "./context/LessonContext";
import { useAuth } from "./context/AuthContext";
import { useVocab, mergeCloudVocabWithLocal, localWordMutations, markWordLocallyMutated } from "./context/VocabContext";
import { useSettingsStore, lastSettingsLocalMutationTime, markSettingsLocallyMutated } from "./store/settingsStore";
import { useLessonStore } from "./store/useLessonStore";
import { useToast } from "./context/ToastContext";
import StatsWidget from "./components/StatsWidget";
import ImportLessonForm from "./components/ImportLessonForm";
import PlaylistDetailView from "./components/playlist/PlaylistDetailView";
import VocabularyPractice from "./components/practice/VocabularyPractice";
import MatchPairsModal from "./components/MatchPairsModal";
import LibraryHome from "./components/LibraryHome";
import StatisticsPage from "./components/StatisticsPage";
import HistoryPage from "./components/HistoryPage";
import SettingsModal from "./components/SettingsModal";
import AuthModal from "./components/AuthModal";
import ProfileModal from "./components/ProfileModal";
import PwaInstallBanner from "./components/PwaInstallBanner";
import {
  setLessonImages,
  getLessonImagesMap,
  mergeLessonImages,
  removeLessonImages,
} from "./lessonImagesStore";
import YoutubePlayerWindow from "./components/YoutubePlayerWindow";
import FocusPinnedPlayer from "./components/FocusPinnedPlayer";
import GlobalAudioPlayer from "./components/player/GlobalAudioPlayer";
import BottomAudioBar from "./components/player/BottomAudioBar";
import FullscreenAudioPlayerModal from "./components/player/FullscreenAudioPlayerModal";
import QueueModal from "./components/player/QueueModal";
import InAppUpdateModal from "./components/InAppUpdateModal";
import PodcastsPage from "./components/PodcastsPage";
import { checkForGitHubUpdate, GitHubReleaseInfo } from "./services/inAppUpdaterService";
import { usePlaylistStore } from "./store/playlistStore";
import { BookOpen, PlusCircle, GraduationCap, Headphones, Languages, Trash2, HelpCircle, Sparkles, BookMarked, TrendingUp, Pencil, Settings, ChevronLeft, Menu, X, Tv, Maximize2, Trophy, Loader2, Moon, Sun, Eye, EyeOff, History, Mic2 } from "lucide-react";
import { safeJsonParse, safeParse, normalizeLanguagePrefixedKey, isLocalHostname, safeLocalStorageSetItem, sanitizeLessonsForLocalStorage, normalizeContraction, normalizeVocabRecord, normalizeWordLinksRecord, dedupeHistory, buildVocabItem, getUIPreviewCache, saveUIPreviewCache, normalizeLanguage, getActiveMediaCurrentTime, generateHistoryId } from "./utils";
import { resolveApiUrl } from "./utils/apiConfig";
import { lessonsStore, vocabStore, settingsStore, playlistsStore, migrateFromLocalStorage, clearLocalUserDataCache } from "./db";
import { whisperQueueService } from "./services/whisperQueueService";
import { checkIsBookLesson } from "./utils/readerSettingsUtils";
import { useTranslation, Trans } from "react-i18next";

const readerThemes = {
  default: {
    pageBg: "bg-stone-50 dark:bg-zinc-950",
    text: "text-zinc-900 dark:text-zinc-100",
    headerBg: "bg-white/80 dark:bg-zinc-900/80 border-zinc-200/60 dark:border-zinc-900",
    cardBg: "bg-white dark:bg-zinc-900",
    border: "border-zinc-200/70 dark:border-zinc-800",
  },
  cream: {
    pageBg: "bg-[#faf5eb] dark:bg-zinc-950",
    text: "text-[#3d2c16] dark:text-zinc-100",
    headerBg: "bg-[#fcf8f2]/90 dark:bg-zinc-900/60 border-[#eddcb9] dark:border-zinc-800",
    cardBg: "bg-[#fcf8f2] dark:bg-zinc-900",
    border: "border-[#eddcb9] dark:border-zinc-800",
  },
  sepia: {
    pageBg: "bg-[#efe9dc] dark:bg-zinc-950",
    text: "text-[#2c2a29] dark:text-zinc-100",
    headerBg: "bg-[#f7f4eb]/90 dark:bg-zinc-900/60 border-[#e5dec9] dark:border-zinc-800",
    cardBg: "bg-[#f7f4eb] dark:bg-zinc-900",
    border: "border-[#e5dec9] dark:border-zinc-800",
  },
  slate: {
    pageBg: "bg-slate-100/90 dark:bg-slate-950",
    text: "text-slate-800 dark:text-slate-100",
    headerBg: "bg-slate-50/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800",
    cardBg: "bg-slate-50 dark:bg-slate-900",
    border: "border-slate-200 dark:border-slate-800",
  },
};

const BUILT_IN_IDS = new Set(["builtin-es", "builtin-fr", "builtin-de", "builtin-pt"]);
const normalizeBuiltInLessons = (lessonsList: Lesson[]): Lesson[] => {
  if (!Array.isArray(lessonsList)) return BUILT_IN_LESSONS;
  return lessonsList.map((l) => {
    if (l.isBuiltIn || BUILT_IN_IDS.has(l.id)) {
      return { ...l, translationLanguage: "English" };
    }
    return l;
  });
};

export default function App() {
  const {
    activeTab, setActiveTab,
    showImportForm, setShowImportForm,
    showSettingsModal, setShowSettingsModal,
    showMatchPairsModal, setShowMatchPairsModal,
    showAiHubModal, setShowAiHubModal,
    showYoutubePlayer, setShowYoutubePlayer,
    isFocusMode, setIsFocusMode,
    bookDisplayMode, setBookDisplayMode,
    bookReaderView, setBookReaderView,
    showOnlyUnknown, setShowOnlyUnknown,
    zoomScale, setZoomScale,
    layoutWidthMode, setLayoutWidthMode,
    interfaceMaxWidth, setInterfaceMaxWidth,
    isSidebarOpen, setIsSidebarOpen
  } = useUIStore();
  const { t } = useTranslation();
  const {
    user: activeUser,
    serverToken,
    storageMode,
    setStorageMode,
    localSyncKey,
    setLocalSyncKey,
    localSyncError,
    setLocalSyncError,
    isAuthLoading,
    isAuthenticated,
    loginLocalServer,
    registerLocalServer,
    logout,
  } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showLocalLoginModal, setShowLocalLoginModal] = useState<boolean>(false);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [isAppLoaded, setIsAppLoaded] = useState(false);

  // Detect mobile/tablet vs desktop (< 1024px = tablet/phone, ≥ 1024px = desktop)
  const [isMobileTablet, setIsMobileTablet] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
    const check = () => setIsMobileTablet(window.innerWidth < 1024);
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  const [lessons, setLessons] = useState<Lesson[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("vocab_clone_lessons");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {}
      }
    }
    return [];
  });

  const lessonsRef = useRef<Lesson[]>(lessons);
  useEffect(() => {
    lessonsRef.current = lessons;
  }, [lessons]);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const playlistsRef = useRef<Playlist[]>(playlists);
  useEffect(() => {
    playlistsRef.current = playlists;
  }, [playlists]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const [lessonTypes, setLessonTypes] = useState<LessonType[]>(DEFAULT_LESSON_TYPES);
  const lessonTypesRef = useRef<LessonType[]>(lessonTypes);
  useEffect(() => {
    lessonTypesRef.current = lessonTypes;
  }, [lessonTypes]);
  const hasActiveQueue = usePlaylistStore((state) => state.queue.length > 0);

  const {
    vocab,
    setVocab,
    wordLinks,
    setWordLinks,
    selectedWord,
    setSelectedWord,
    contextSentence: selectedContext,
    setContextSentence: setSelectedContext,
    getLinkedWordsFor,
    handleUpdateStatusDirect,
    handleDeleteMultipleVocabItems,
    handleWordClick,
  } = useVocab();

  const vocabRef = useRef<Record<string, VocabItem>>(vocab);
  useEffect(() => {
    vocabRef.current = vocab;
    vocabStore.setItem("words", vocab).catch(() => {});
  }, [vocab]);

  const wordLinksRef = useRef<Record<string, string>>(wordLinks);
  useEffect(() => {
    wordLinksRef.current = wordLinks;
    vocabStore.setItem("aliases", wordLinks).catch(() => {});
  }, [wordLinks]);

  const { showToast } = useToast();

  const [listeningSeconds, setListeningSeconds] = useState<number>(0);
  const listeningSecondsRef = useRef<number>(listeningSeconds);
  useEffect(() => {
    listeningSecondsRef.current = listeningSeconds;
  }, [listeningSeconds]);

  const [languageFlags, setLanguageFlags] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("vocab_clone_language_flags");
      const parsed = saved ? JSON.parse(saved) : {};
      const preview = getUIPreviewCache();
      if (preview?.selectedLanguage && preview?.selectedVariant) {
        const lKey = preview.selectedLanguage.toLowerCase();
        if (!parsed[lKey]) {
          parsed[lKey] = preview.selectedVariant;
        }
      }
      return parsed;
    } catch (_) {
      return {};
    }
  });
  const languageFlagsRef = useRef<Record<string, string>>(languageFlags);
  useEffect(() => {
    languageFlagsRef.current = languageFlags;
  }, [languageFlags]);

  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const defaults: ReaderSettings = {
      ...DEFAULT_READER_SETTINGS,
      geminiApiKey: localStorage.getItem("vocab_clone_gemini_key") || "",
      readerViewStyle: (localStorage.getItem("lectura_reader_view_style") as any) || DEFAULT_READER_SETTINGS.readerViewStyle,
      bookReaderViewStyle: (localStorage.getItem("lectura_book_reader_view_style") as any) || DEFAULT_READER_SETTINGS.bookReaderViewStyle,
      fontFamily: (localStorage.getItem("lectura_font_family") as any) || DEFAULT_READER_SETTINGS.fontFamily,
      bookFontFamily: (localStorage.getItem("lectura_book_font_family") as any) || DEFAULT_READER_SETTINGS.bookFontFamily,
      fontSize: (localStorage.getItem("lectura_reader_font_size") as any) || DEFAULT_READER_SETTINGS.fontSize,
      bookFontSize: (localStorage.getItem("lectura_book_font_size") as any) || DEFAULT_READER_SETTINGS.bookFontSize,
      lineHeight: (localStorage.getItem("lectura_line_height") as any) || DEFAULT_READER_SETTINGS.lineHeight,
      bookLineHeight: (localStorage.getItem("lectura_book_line_height") as any) || DEFAULT_READER_SETTINGS.bookLineHeight,
      maxWidth: (localStorage.getItem("lectura_reader_typography_width") as any) || DEFAULT_READER_SETTINGS.maxWidth,
      readerLayoutWidth: (localStorage.getItem("lectura_reader_layout_width") as any) || DEFAULT_READER_SETTINGS.readerLayoutWidth,
      bookMaxWidth: (localStorage.getItem("lectura_book_text_width") as any) || DEFAULT_READER_SETTINGS.bookMaxWidth,
      readerTheme: (localStorage.getItem("lectura_reader_theme") as any) || DEFAULT_READER_SETTINGS.readerTheme,
      bookReaderTheme: (localStorage.getItem("lectura_book_reader_theme") || localStorage.getItem("lectura_book_theme") as any) || DEFAULT_READER_SETTINGS.bookReaderTheme,
      wordCardMode: (localStorage.getItem("lectura_word_card_mode") as any) || DEFAULT_READER_SETTINGS.wordCardMode,
      bookWordCardMode: (localStorage.getItem("lectura_book_word_card_mode") as any) || DEFAULT_READER_SETTINGS.bookWordCardMode,
      showTimestamps: localStorage.getItem("lectura_show_timestamps") !== "false",
      toolbarVisibility: DEFAULT_TOOLBAR_VISIBILITY,
    };
    try {
      const saved = localStorage.getItem("vocab_clone_reader_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.ttsEngine_v2) {
          parsed.ttsEngine = "google";
          parsed.ttsEngine_v2 = true;
        }
        if (!parsed.toolbarVisibility_v3) {
          parsed.toolbarVisibility = {
            ...DEFAULT_TOOLBAR_VISIBILITY,
            ...(parsed.toolbarVisibility || {}),
            showTranslation: false,
            showPlayPairs: false,
            showAiHub: false,
          };
          parsed.toolbarVisibility_v3 = true;
        }
        return {
          ...defaults,
          ...parsed,
          toolbarVisibility: {
            ...DEFAULT_TOOLBAR_VISIBILITY,
            ...(parsed.toolbarVisibility || {}),
          },
        };
      }
    } catch (e) {
      console.error("Failed to parse saved reader settings:", e);
    }
    return defaults;
  });
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
  useEffect(() => {
    readerSettingsRef.current = readerSettings;
  }, [readerSettings]);

  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState<string>(() => {
    const preview = getUIPreviewCache();
    if (preview?.selectedLanguage) {
      return preview.selectedLanguage;
    }
    return localStorage.getItem("vocab_global_target_language") || "All";
  });
  const selectedTargetLanguageRef = useRef<string>(selectedTargetLanguage);
  useEffect(() => {
    selectedTargetLanguageRef.current = selectedTargetLanguage;
  }, [selectedTargetLanguage]);

  const handleSelectTargetLanguage = (lang: string) => {
    setSelectedTargetLanguage(lang);
    safeLocalStorageSetItem("vocab_global_target_language", lang);
    saveUIPreviewCache({
      selectedLanguage: lang,
      selectedVariant: languageFlags[lang.toLowerCase()] || undefined,
    });
    if (storageMode === "server") {
      syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, listeningSeconds, languageFlags, historyRef.current, undefined, readerSettings, pinnedLanguages, hiddenLanguages, lang).catch(() => {});
    }
  };

  const [isManageLanguagesOpen, setIsManageLanguagesOpen] = useState(false);
  const [pinnedLanguages, setPinnedLanguages] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("vocab_clone_pinned_languages");
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const pinnedLanguagesRef = useRef<string[]>(pinnedLanguages);
  useEffect(() => {
    pinnedLanguagesRef.current = pinnedLanguages;
  }, [pinnedLanguages]);
  const [hiddenLanguages, setHiddenLanguages] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("vocab_clone_hidden_languages");
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const hiddenLanguagesRef = useRef<string[]>(hiddenLanguages);
  useEffect(() => {
    hiddenLanguagesRef.current = hiddenLanguages;
  }, [hiddenLanguages]);

  const handleAddLanguage = (langName: string) => {
    setHiddenLanguages((prev) => {
      const next = prev.filter((l) => l.toLowerCase() !== langName.toLowerCase());
      safeLocalStorageSetItem("vocab_clone_hidden_languages", JSON.stringify(next));
      settingsStore.setItem("vocab_clone_hidden_languages", JSON.stringify(next)).catch(() => {});
      return next;
    });
    setPinnedLanguages((prev) => {
      if (!prev.some((l) => l.toLowerCase() === langName.toLowerCase())) {
        const next = [...prev, langName];
        safeLocalStorageSetItem("vocab_clone_pinned_languages", JSON.stringify(next));
        settingsStore.setItem("vocab_clone_pinned_languages", JSON.stringify(next)).catch(() => {});
        return next;
      }
      return prev;
    });
    setSelectedTargetLanguage(langName);
    safeLocalStorageSetItem("vocab_global_target_language", langName);
  };

  const handleRemoveLanguage = (langName: string) => {
    setHiddenLanguages((prev) => {
      if (!prev.some((l) => l.toLowerCase() === langName.toLowerCase())) {
        const next = [...prev, langName];
        safeLocalStorageSetItem("vocab_clone_hidden_languages", JSON.stringify(next));
        settingsStore.setItem("vocab_clone_hidden_languages", JSON.stringify(next)).catch(() => {});
        return next;
      }
      return prev;
    });
    setPinnedLanguages((prev) => {
      const next = prev.filter((l) => l.toLowerCase() !== langName.toLowerCase());
      safeLocalStorageSetItem("vocab_clone_pinned_languages", JSON.stringify(next));
      settingsStore.setItem("vocab_clone_pinned_languages", JSON.stringify(next)).catch(() => {});
      return next;
    });
    if (selectedTargetLanguage.toLowerCase() === langName.toLowerCase()) {
      setSelectedTargetLanguage("All");
      safeLocalStorageSetItem("vocab_global_target_language", "All");
    }
  };

  const availableTargetLanguages = useMemo(() => {
    const list = new Set<string>();
    const activeLanguagesWithBooks = new Set<string>();
    lessons.forEach((l) => {
      if (l.targetLanguage) {
        const norm = normalizeLanguage(l.targetLanguage);
        list.add(norm);
        if (!l.isArchived) {
          activeLanguagesWithBooks.add(norm.toLowerCase());
        }
      }
    });
    Object.keys(vocab || {}).forEach((key) => {
      const parts = key.split("_");
      if (parts.length > 1) {
        const lang = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
        list.add(normalizeLanguage(lang));
      }
    });
    pinnedLanguages.forEach((lang) => list.add(normalizeLanguage(lang)));
    if (selectedTargetLanguage && selectedTargetLanguage !== "All") {
      list.add(normalizeLanguage(selectedTargetLanguage));
    }

    const hiddenLower = new Set(hiddenLanguages.map((l) => normalizeLanguage(l).toLowerCase()));
    // If a language has active books in the library, it must NEVER be hidden
    const filtered = Array.from(list).filter((lang) => {
      const lower = lang.toLowerCase();
      if (activeLanguagesWithBooks.has(lower)) return true;
      return !hiddenLower.has(lower);
    });
    return ["All", ...filtered];
  }, [lessons, vocab, pinnedLanguages, hiddenLanguages, selectedTargetLanguage]);

  // Auto-heal: If user has active books in a language, automatically remove it from hiddenLanguages
  useEffect(() => {
    if (!lessons || lessons.length === 0 || hiddenLanguages.length === 0) return;
    const activeLangs = new Set(
      lessons
        .filter((l) => !l.isArchived && l.targetLanguage)
        .map((l) => normalizeLanguage(l.targetLanguage).toLowerCase())
    );
    if (activeLangs.size === 0) return;

    const next = hiddenLanguages.filter((h) => !activeLangs.has(normalizeLanguage(h).toLowerCase()));
    if (next.length !== hiddenLanguages.length) {
      setHiddenLanguages(next);
      safeLocalStorageSetItem("vocab_clone_hidden_languages", JSON.stringify(next));
      settingsStore.setItem("vocab_clone_hidden_languages", JSON.stringify(next)).catch(() => {});
      try {
        const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
        const syncKey = localStorage.getItem("vocab_clone_local_sync_key") || localStorage.getItem("local_sync_key");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (syncKey) headers["x-sync-key"] = syncKey;
        fetch(resolveApiUrl("/api/metadata"), {
          method: "POST",
          headers,
          body: JSON.stringify({ key: "hiddenLanguages", value: JSON.stringify(next) })
        }).catch(() => {});
      } catch (_) {}
    }
  }, [lessons, hiddenLanguages]);

  const lessonCountByLanguage = useMemo(() => {
    const map: Record<string, number> = {};
    lessons.forEach((l) => {
      if (l.targetLanguage) {
        const key = normalizeLanguage(l.targetLanguage);
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [lessons]);

  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      try {
        const hash = window.location.hash;
        // Hash could be #/read?lesson=123 or #/lesson/123
        const [path, queryString] = hash.substring(1).split("?");
        if (path.startsWith("/read") && queryString) {
          const params = new URLSearchParams(queryString);
          const lessonId = params.get("lesson");
          if (lessonId) return lessonId;
        }
      } catch (e) {
        console.error("Failed to parse initial hash for lessonId", e);
      }
    }
    return lessons[0]?.id || "";
  });
  const [lessonImagesVersion, setLessonImagesVersion] = useState(0);

  // Navigation states

  // History state
  const listeningBufferRef = useRef<number>(0);

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem("vocab_clone_reading_history");
    return saved ? safeParse(saved, []) : [];
  });

  const historyRef = useRef<HistoryEntry[]>(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const delayDebounceFnRef = useRef<NodeJS.Timeout | null>(null);
  const historySyncDebounceFnRef = useRef<NodeJS.Timeout | null>(null);

  const appBroadcastChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const channel = new BroadcastChannel("lectura_sync_channel");
      appBroadcastChannelRef.current = channel;
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "history_updated" && Array.isArray(event.data.history)) {
          const clean = dedupeHistory(event.data.history).filter(h => (h.durationSeconds || 0) > 0 || (h.lastPosition || 0) > 0);
          setHistory(clean);
          historyRef.current = clean;
        }
      };
      channel.addEventListener("message", handleMessage);
      return () => {
        channel.removeEventListener("message", handleMessage);
        channel.close();
      };
    }
  }, []);

  const scheduleBackgroundHistorySync = (nextHistory: HistoryEntry[], forceImmediate: boolean = false) => {
    if (storageMode !== "server") return;
    if (historySyncDebounceFnRef.current) {
      clearTimeout(historySyncDebounceFnRef.current);
      historySyncDebounceFnRef.current = null;
    }

    if (forceImmediate) {
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypesRef.current,
        vocabRef.current,
        wordLinksRef.current,
        listeningSecondsRef.current,
        languageFlagsRef.current,
        historyRef.current.length > 0 ? historyRef.current : nextHistory,
        undefined,
        readerSettingsRef.current,
        pinnedLanguagesRef.current,
        hiddenLanguagesRef.current,
        selectedTargetLanguageRef.current,
        undefined,
        playlistsRef.current
      ).catch(() => {});
      return;
    }

    historySyncDebounceFnRef.current = setTimeout(() => {
      historySyncDebounceFnRef.current = null;
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypesRef.current,
        vocabRef.current,
        wordLinksRef.current,
        listeningSecondsRef.current,
        languageFlagsRef.current,
        historyRef.current.length > 0 ? historyRef.current : nextHistory,
        undefined,
        readerSettingsRef.current,
        pinnedLanguagesRef.current,
        hiddenLanguagesRef.current,
        selectedTargetLanguageRef.current,
        undefined,
        playlistsRef.current
      ).catch(() => {});
    }, 15000);
  };

  const handleUpdateHistory = (newHistory: HistoryEntry[], deletedIds?: string[]) => {
    if (deletedIds && deletedIds.length > 0) {
      console.log('[Delete History]', { deletedIds, remainingEntries: newHistory.length });
      
      // Cancel pending debounced calls
      if (delayDebounceFnRef.current) {
        clearTimeout(delayDebounceFnRef.current);
        delayDebounceFnRef.current = null;
      }
      if (historySyncDebounceFnRef.current) {
        clearTimeout(historySyncDebounceFnRef.current);
        historySyncDebounceFnRef.current = null;
      }
      
      // Clear in-memory listening buffer
      listeningBufferRef.current = 0;
    }

    const deduped = dedupeHistory(newHistory).filter(h => (h.durationSeconds || 0) > 0);
    setHistory(deduped);
    historyRef.current = deduped;
    // Mark immediately so loadDataFromLocalServer won't overwrite for 30s
    lastLocalChangeTime.current = Date.now();
    safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(deduped));
    settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(deduped)).catch(() => {});
    syncDataToLocalServer(
      lessonsRef.current,
      lessonTypesRef.current,
      vocabRef.current,
      wordLinksRef.current,
      listeningSecondsRef.current,
      languageFlagsRef.current,
      deduped,
      undefined,
      readerSettingsRef.current,
      pinnedLanguagesRef.current,
      hiddenLanguagesRef.current,
      selectedTargetLanguageRef.current,
      undefined,
      playlistsRef.current,
      undefined,
      deletedIds
    ).catch(() => {});
  };

  const recordHistoryActivity = (
    targetLesson: Lesson | {
      id: string;
      title: string;
      lessonType?: string;
      coverUrl?: string | null;
      targetLanguage: string;
      audioUrl?: string | null;
      podcastTitle?: string | null;
      channelName?: string | null;
      channelAvatarUrl?: string | null;
      guid?: string | null;
      lastPosition?: number;
      audioDuration?: number | null;
      youtubeId?: string | null;
      audioBase64?: string | null;
    },
    actionType: "read" | "listen" | "complete",
    durationSeconds?: number,
    lastPosition?: number,
    forceImmediate: boolean = false
  ) => {
    if (!targetLesson || !targetLesson.id) return;

    // Absolute Circuit Breaker: Zero duration records without position are not permitted
    if (actionType !== "complete" && (!durationSeconds || durationSeconds <= 0) && (lastPosition === undefined || lastPosition <= 0)) {
      return;
    }
    
    // Strict guardrail for garbage time (e.g. infinite loops or anomalies)
    if (durationSeconds !== undefined && (durationSeconds <= 0 || durationSeconds > 7200)) {
       durationSeconds = 0;
    }

    
    if ((actionType === "listen" || actionType === "complete") && lastPosition === undefined) {
      const globalTime = getActiveMediaCurrentTime();
      if (globalTime > 0) {
        lastPosition = globalTime;
      }
    }
    setHistory((prev) => {
      const now = new Date().toISOString();

      const isAudioOrVideo = !!(
        targetLesson.youtubeId ||
        targetLesson.audioUrl ||
        targetLesson.audioBase64 ||
        targetLesson.lessonType === "podcast" ||
        targetLesson.lessonType === "youtube" ||
        targetLesson.lessonType === "audio"
      );

      // Target Resolution: match specific item by ID, GUID, audioUrl, or exact title
      const targetId = targetLesson.id;
      const targetGuid = (targetLesson as any).guid || (targetLesson as any).podcastGuid || (targetLesson as any).playlistId;
      const targetAudioUrl = targetLesson.audioUrl || (targetLesson as any).originalAudioUrl;
      const targetTitleClean = targetLesson.title ? targetLesson.title.trim().toLowerCase() : "";
      const todayDateStr = new Date().toLocaleDateString("en-CA");

      const targetIndex = prev.findIndex((h) => {
        // 1. Direct ID / LessonID / GUID match
        const matchesId =
          h.id === targetId ||
          h.lessonId === targetId ||
          (targetGuid && (h.guid === targetGuid || h.id === targetGuid || h.lessonId === targetGuid));

        // 2. Audio URL match (e.g. streaming URL)
        const matchesAudio = Boolean(
          targetAudioUrl &&
          h.audioUrl &&
          (h.audioUrl === targetAudioUrl ||
           h.audioUrl.includes(targetAudioUrl) ||
           targetAudioUrl.includes(h.audioUrl))
        );

        // 3. Exact Title match
        const matchesTitle = Boolean(
          targetTitleClean &&
          h.lessonTitle &&
          h.lessonTitle.trim().toLowerCase() === targetTitleClean
        );

        if (!matchesId && !matchesAudio && !matchesTitle) return false;

        try {
          const entryDate = new Date(h.timestamp);
          const entryDateStr = entryDate.toLocaleDateString("en-CA");
          if (entryDateStr === todayDateStr) return true;
          return Date.now() - entryDate.getTime() < 24 * 60 * 60 * 1000;
        } catch {
          return false;
        }
      });

      let updated: HistoryEntry[];
      if (targetIndex !== -1) {
        // Isolated update: preserve all other items completely unmodified
        updated = prev.map((item, idx) => {
          if (idx !== targetIndex) {
            return item;
          }

          const nextActionType =
            isAudioOrVideo || actionType === "listen" || item.actionType === "listen" || (item.durationSeconds || 0) > 0 || (durationSeconds || 0) > 0
              ? "listen"
              : actionType === "complete"
              ? (item.actionType === "complete" ? "read" : item.actionType)
              : item.actionType;

          const nextStatus: "in_progress" | "completed" =
            actionType === "complete" || item.status === "completed" || item.actionType === "complete"
              ? "completed"
              : item.status || "in_progress";

          // Prefer real library lessonId over streaming temporary id
          const preferredLessonId = (targetLesson.id && !targetLesson.id.startsWith("podcast_ep_") && !targetLesson.id.startsWith("http"))
            ? targetLesson.id
            : (item.lessonId || targetLesson.id);

          const targetTotalDuration = Number(targetLesson.duration) || Number((targetLesson as any).audioDuration) || 0;
          // Duration must strictly reflect actual spent study time, never scrubber position (lastPosition)
          const calculatedDuration = Math.round(((item.durationSeconds || 0) + (durationSeconds || 0)) * 10) / 10;

          return {
            ...item,
            lessonId: preferredLessonId,
            lessonTitle: targetLesson.title || item.lessonTitle,
            timestamp: now,
            actionType: nextActionType,
            status: nextStatus,
            durationSeconds: calculatedDuration,
            duration: targetTotalDuration > 0 ? targetTotalDuration : item.duration,
            lastPosition: lastPosition !== undefined ? lastPosition : item.lastPosition,
            youtubeId: item.youtubeId || (targetLesson as any).youtubeId || null,
            audioUrl: (targetLesson.audioUrl && targetLesson.audioUrl.startsWith("/api/")) ? targetLesson.audioUrl : (item.audioUrl || targetLesson.audioUrl || null),
            podcastTitle: item.podcastTitle || (targetLesson as any).podcastTitle || (targetLesson as any).bookTitle || null,
            guid: item.guid || targetGuid || targetLesson.id,
            channelName: item.channelName || targetLesson.channelName || (targetLesson as any).podcastTitle || (targetLesson as any).bookTitle || null,
            channelAvatarUrl: item.channelAvatarUrl || targetLesson.channelAvatarUrl || null,
          };
        });
      } else {
        const targetTotalDuration = Number(targetLesson.duration) || Number((targetLesson as any).audioDuration) || 0;
        const initialDuration = Math.round((durationSeconds || 0) * 10) / 10;

        const generatedId = generateHistoryId({
          durationSeconds: initialDuration,
          actionType,
          source: `recordHistoryActivity(${targetLesson.id}, ${actionType})`,
        });

        if (!generatedId) {
          // Hard Trap blocked creation of 0-second phantom record
          return prev;
        }

        const newEntry: HistoryEntry = {
          id: generatedId,
          lessonId: targetLesson.id,
          lessonTitle: targetLesson.title,
          lessonType: targetLesson.lessonType || (targetLesson.youtubeId ? "youtube" : "podcast"),
          coverUrl: targetLesson.coverUrl || null,
          targetLanguage: normalizeLanguage(targetLesson.targetLanguage || "es"),
          timestamp: now,
          actionType: isAudioOrVideo ? "listen" : (actionType === "complete" ? "read" : actionType),
          status: actionType === "complete" ? "completed" : "in_progress",
          durationSeconds: initialDuration,
          duration: targetTotalDuration > 0 ? targetTotalDuration : undefined,
          lastPosition: lastPosition !== undefined ? lastPosition : undefined,
          youtubeId: (targetLesson as any).youtubeId || null,
          audioUrl: targetLesson.audioUrl || null,
          podcastTitle: (targetLesson as any).podcastTitle || (targetLesson as any).bookTitle || null,
          guid: (targetLesson as any).guid || targetLesson.id,
          channelName: targetLesson.channelName || (targetLesson as any).podcastTitle || (targetLesson as any).bookTitle || null,
          channelAvatarUrl: targetLesson.channelAvatarUrl || null,
        };

        updated = [newEntry, ...prev];
      }
      const finalHistory = dedupeHistory(updated);
      historyRef.current = finalHistory;
      lastLocalChangeTime.current = Date.now();
      
      // We rely on IndexedDB (settingsStore) and the SQLite backend for persistence, 
      // avoiding window.localStorage to prevent QuotaExceededError for large histories.
      settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(finalHistory)).catch(() => {});
      
      if (appBroadcastChannelRef.current) {
        try {
          appBroadcastChannelRef.current.postMessage({ type: "history_updated", history: finalHistory });
        } catch (_) {}
      }

      scheduleBackgroundHistorySync(finalHistory, forceImmediate);
      return finalHistory;
    });
  };

  const [initialImportUrl, setInitialImportUrl] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [isDetectingIdioms, setIsDetectingIdioms] = useState<boolean>(false);
  const lastLocalChangeTime = useRef<number>(0);
  const lastSyncSuccessTime = useRef<number>(Date.now());
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const activeLessonIdRef = useRef(activeLessonId);
  activeLessonIdRef.current = activeLessonId;

  // Browser History & Route State Tracking
  const isPopStateRef = useRef(false);
  const isInitialMount = useRef(true);
  const isPlayerExpanded = usePlaylistStore((state) => state.isExpanded);
  const isQueueModalOpen = usePlaylistStore((state) => state.showQueueModal);

  // Count active modal/overlay layers for browser history stack depth
  const activeOverlayCount = [
    showProfileModal,
    showLocalLoginModal,
    showUpdateModal,
    !!selectedWord,
    showAiHubModal,
    showSettingsModal,
    showImportForm,
    showMatchPairsModal,
    isManageLanguagesOpen,
    isQueueModalOpen,
    isSidebarOpen,
    isPlayerExpanded,
    !!selectedPlaylistId,
  ].filter(Boolean).length;

  const prevOverlayCountRef = useRef(activeOverlayCount);

  // Helper to build distinct hash URLs for Android browser history navigation
  const buildHashUrl = useCallback((tab: string, lessonId?: string, focus?: boolean, overlayCount?: number) => {
    const baseTab = tab || "library";
    let url = `#/${baseTab}`;
    const params = new URLSearchParams();
    if (baseTab === "read" && lessonId) {
      params.set("lesson", lessonId);
      if (focus) params.set("focus", "1");
    }
    if (overlayCount && overlayCount > 0) {
      params.set("layer", String(overlayCount));
    }
    const query = params.toString();
    return query ? `${url}?${query}` : url;
  }, []);

  // Initialize history state on mount and add custom event listener for forceful history flushes
  useEffect(() => {
    const handleForceFlush = (e: CustomEvent) => {
      const exactTime = e.detail?.exactTime;
      if (typeof exactTime === 'number') {
        handleListeningTick(0, "global", true, exactTime);
      }
    };
    window.addEventListener("force-history-flush", handleForceFlush as EventListener);

    if (typeof window === "undefined") return;
    const initialUrl = buildHashUrl(activeTab, activeLessonId, isFocusMode, activeOverlayCount);
    if (!window.history.state) {
      window.history.replaceState(
        { tab: activeTab, lessonId: activeLessonId, focusMode: isFocusMode, overlayCount: activeOverlayCount },
        "",
        initialUrl
      );
    }

    return () => {
      window.removeEventListener("force-history-flush", handleForceFlush as EventListener);
    };
  }, []);

  // Push history state whenever a new layer opens or active route changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevOverlayCountRef.current = activeOverlayCount;
      return;
    }
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      prevOverlayCountRef.current = activeOverlayCount;
      return;
    }

    const currentHistoryState = window.history.state;
    const isSame =
      currentHistoryState?.tab === activeTab &&
      currentHistoryState?.lessonId === activeLessonId &&
      currentHistoryState?.focusMode === isFocusMode &&
      currentHistoryState?.overlayCount === activeOverlayCount;

    if (!isSame) {
      const targetUrl = buildHashUrl(activeTab, activeLessonId, isFocusMode, activeOverlayCount);
      // If a new overlay was opened, or route changed, push state
      if (
        activeOverlayCount > (prevOverlayCountRef.current || 0) ||
        currentHistoryState?.tab !== activeTab ||
        currentHistoryState?.lessonId !== activeLessonId ||
        currentHistoryState?.focusMode !== isFocusMode
      ) {
        window.history.pushState(
          {
            tab: activeTab,
            lessonId: activeLessonId,
            focusMode: isFocusMode,
            overlayCount: activeOverlayCount,
          },
          "",
          targetUrl
        );
      } else {
        // If an overlay was closed manually (via X/backdrop), update history with replaceState cleanly
        window.history.replaceState(
          {
            tab: activeTab,
            lessonId: activeLessonId,
            focusMode: isFocusMode,
            overlayCount: activeOverlayCount,
          },
          "",
          targetUrl
        );
      }
      prevOverlayCountRef.current = activeOverlayCount;
    }
  }, [activeTab, activeLessonId, isFocusMode, activeOverlayCount, buildHashUrl]);

  const [showIosInstallBanner, setShowIosInstallBanner] = useState<boolean>(false);

  const lastSettingsLocalChangeTimeRef = useRef<number>(0);

  const updateSettingsAndSync = (newSettingsOrFn: React.SetStateAction<ReaderSettings>) => {
    const now = Date.now();
    lastSettingsLocalChangeTimeRef.current = now;
    lastLocalChangeTime.current = now;
    markSettingsLocallyMutated();

    setReaderSettings((prev) => {
      const next = typeof newSettingsOrFn === "function" ? newSettingsOrFn(prev) : newSettingsOrFn;
      readerSettingsRef.current = next;
      useSettingsStore.getState().setSettings(next);
      safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(next));
      if (next.readerLayoutWidth) {
        safeLocalStorageSetItem("lectura_reader_layout_width", next.readerLayoutWidth);
      }
      settingsStore.setItem("vocab_clone_reader_settings", JSON.stringify(next)).catch(() => {});
      try {
        const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
        const savedUserStr = localStorage.getItem("vocab_clone_local_user");
        const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-local-sync-key": localSyncKey,
          "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default",
        };
        if (savedToken) headers["Authorization"] = `Bearer ${savedToken}`;
        fetch(resolveApiUrl("/api/user/settings"), {
          method: "PATCH",
          headers,
          body: JSON.stringify({ settings: next }),
        }).catch(() => {});
      } catch (_) {}
      return next;
    });
  };

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("vocab_clone_dark_mode");
      if (saved === "false") return false;
      if (saved === "true") return true;
    } catch (_) {}
    return false;
  });

  // Auth & Sync States
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{
    isSyncing: boolean;
    percent: number;
    message?: string;
    error?: boolean;
    lastSyncTime?: number | null;
  }>({
    isSyncing: false,
    percent: 100,
    message: "В сети",
    error: false,
    lastSyncTime: null,
  });

  // In-App Auto Updater State
  const [availableUpdate, setAvailableUpdate] = useState<GitHubReleaseInfo | null>(null);

  // 🧭 Centralized Single-Action Back Navigation Dispatcher (Popstate & Capacitor BackButton)
  const handleBackNavigation = useCallback((): boolean => {
    // [Priority 1: Ephemeral Modals & Sheets]
    if (showProfileModal) {
      setShowProfileModal(false);
      return true;
    }
    if (showLocalLoginModal) {
      setShowLocalLoginModal(false);
      return true;
    }
    if (showUpdateModal) {
      setShowUpdateModal(false);
      return true;
    }
    if (selectedWord) {
      setSelectedWord(null);
      return true;
    }
    if (showAiHubModal) {
      setShowAiHubModal(false);
      return true;
    }
    if (showSettingsModal) {
      setShowSettingsModal(false);
      return true;
    }
    if (showImportForm) {
      setShowImportForm(false);
      return true;
    }
    if (showMatchPairsModal) {
      setShowMatchPairsModal(false);
      return true;
    }
    if (isManageLanguagesOpen) {
      setIsManageLanguagesOpen(false);
      return true;
    }
    const playlistState = usePlaylistStore.getState();
    if (playlistState.showQueueModal) {
      playlistState.setShowQueueModal(false);
      return true;
    }
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      return true;
    }

    // [Priority 2: Fullscreen Overlays]
    if (playlistState.isExpanded) {
      playlistState.setIsExpanded(false);
      return true;
    }
    if (isFocusMode) {
      setIsFocusMode(false);
      return true;
    }

    // [Priority 3: Sub-views & Route Navigation]
    if (selectedPlaylistId) {
      setSelectedPlaylistId(null);
      return true;
    }
    if (activeTab === "read") {
      setActiveTab("library");
      setSelectedWord(null);
      return true;
    }
    if (activeTab !== "library") {
      setActiveTab("library");
      return true;
    }

    // [Priority 4: Root Level]
    return false;
  }, [
    showProfileModal,
    showLocalLoginModal,
    showUpdateModal,
    selectedWord,
    showAiHubModal,
    showSettingsModal,
    showImportForm,
    showMatchPairsModal,
    isManageLanguagesOpen,
    isSidebarOpen,
    isFocusMode,
    selectedPlaylistId,
    activeTab,
    setActiveTab,
    setShowProfileModal,
    setShowLocalLoginModal,
    setShowUpdateModal,
    setSelectedWord,
    setShowAiHubModal,
    setShowSettingsModal,
    setShowImportForm,
    setShowMatchPairsModal,
    setIsManageLanguagesOpen,
    setIsSidebarOpen,
    setIsFocusMode,
    setSelectedPlaylistId,
  ]);

  // Handle browser Back / Forward buttons and Android back swipe gesture (popstate)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      isPopStateRef.current = true;
      handleBackNavigation();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handleBackNavigation]);

  // Prevent YouTube/media iframe focus hijacking and support edge swipe back gestures
  useEffect(() => {
    if (typeof window === "undefined") return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isEdgeSwipe = false;
    let lastTriggerTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();

      // Check if touch started near the screen edge (within 40px)
      const isLeftEdge = touchStartX <= 40;
      const isRightEdge = touchStartX >= window.innerWidth - 40;
      isEdgeSwipe = isLeftEdge || isRightEdge;

      // If touch started near edge and an iframe has focus, immediately blur it so window captures gestures
      if (isEdgeSwipe && document.activeElement && document.activeElement.tagName === "IFRAME") {
        (document.activeElement as HTMLElement).blur();
        window.focus();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isEdgeSwipe || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const elapsedTime = Date.now() - touchStartTime;

      const isLeftSwipeInward = touchStartX <= 40 && deltaX > 45;
      const isRightSwipeInward = touchStartX >= window.innerWidth - 40 && deltaX < -45;

      // Verify horizontal gesture characteristics
      if ((isLeftSwipeInward || isRightSwipeInward) && Math.abs(deltaX) > Math.abs(deltaY) * 1.4 && elapsedTime < 650) {
        const now = Date.now();
        if (now - lastTriggerTime > 400) {
          lastTriggerTime = now;
          if (document.activeElement && document.activeElement.tagName === "IFRAME") {
            (document.activeElement as HTMLElement).blur();
            window.focus();
          }
          isPopStateRef.current = true;
          handleBackNavigation();
        }
      }
      isEdgeSwipe = false;
    };

    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart, { capture: true } as any);
      window.removeEventListener("touchend", onTouchEnd, { capture: true } as any);
    };
  }, [handleBackNavigation]);

  // Handle native Capacitor Android hardware back button
  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    let cleanupFn: (() => void) | null = null;
    CapApp.addListener("backButton", () => {
      const handled = handleBackNavigation();
      if (!handled) {
        CapApp.exitApp();
      }
    }).then((handle) => {
      cleanupFn = () => handle.remove();
    }).catch(() => {});

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [handleBackNavigation]);

  useEffect(() => {
    // Automatic background update check on app launch
    const timer = setTimeout(() => {
      checkForGitHubUpdate(false).then((release) => {
        if (release && release.hasUpdate) {
          setAvailableUpdate(release);
          setShowUpdateModal(true);
        }
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function initDb() {
      // In server mode, data comes directly from local server DB via loadDataFromLocalServer().
      // Skip heavy sequential IndexedDB reads to ensure immediate startup.
      if (storageMode === "server") {
        setIsAppLoaded(true);
        return;
      }
      try {
        await migrateFromLocalStorage();
        
        const savedLessons = await lessonsStore.getItem('lessons');
        if (savedLessons) setLessons(savedLessons as Lesson[]);
        
        const savedLessonTypes = await lessonsStore.getItem('lessontypes');
        if (savedLessonTypes) setLessonTypes(savedLessonTypes as LessonType[]);

        const ls = await settingsStore.getItem('vocab_clone_listening');
        if (ls !== null) setListeningSeconds(parseFloat(ls as string) || 0);

        let initialHistory: HistoryEntry[] = [];
        const localHist1Str = localStorage.getItem('vocab_clone_reading_history');
        if (localHist1Str) {
          initialHistory = safeParse(localHist1Str, []);
        } else {
          try {
            const savedHistory = await settingsStore.getItem('vocab_clone_reading_history');
            if (savedHistory) {
              initialHistory = typeof savedHistory === 'string' ? JSON.parse(savedHistory) : (savedHistory as any);
            }
          } catch(e) {}
        }

        try { localStorage.removeItem('vocab_clone_reading_history'); } catch(_) {}

        const cleanInitialHistory = dedupeHistory(Array.isArray(initialHistory) ? initialHistory : []);
        setHistory(cleanInitialHistory);
        safeLocalStorageSetItem('vocab_clone_reading_history', JSON.stringify(cleanInitialHistory));
        settingsStore.setItem('vocab_clone_reading_history', JSON.stringify(cleanInitialHistory)).catch(() => {});

        const lf = await settingsStore.getItem('vocab_clone_language_flags');
        if (lf) setLanguageFlags(typeof lf === 'string' ? JSON.parse(lf) : lf);

        const fm = await settingsStore.getItem('vocab_clone_focus_mode');
        if (fm !== null) setIsFocusMode(fm === 'true' || fm === true);

        const lw = await settingsStore.getItem('vocab_clone_layout_width');
        if (lw) setLayoutWidthMode(lw as any);

        const rs = await settingsStore.getItem('vocab_clone_reader_settings');
        if (rs) {
          try {
             const parsed = typeof rs === 'string' ? JSON.parse(rs) : rs;
             setReaderSettings(prev => {
               const updated: ReaderSettings = {
                 ...DEFAULT_READER_SETTINGS,
                 ...prev,
                 ...parsed,
                 toolbarVisibility: {
                   ...DEFAULT_TOOLBAR_VISIBILITY,
                   ...(parsed.toolbarVisibility || {}),
                 },
               };
               safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(updated));
               return updated;
             });
          } catch(e) {}
        }

        const zs = await settingsStore.getItem('vocab_clone_interface_zoom');
        if (zs !== null) setZoomScale(parseInt(zs as string, 10));

        const loadedPlaylists: Playlist[] = [];
        await playlistsStore.iterate<Playlist, void>((val) => {
          if (val && val.id) loadedPlaylists.push(val);
        });
        if (loadedPlaylists.length > 0) {
          setPlaylists(loadedPlaylists);
        }

      } catch (e) {
        console.error("App DB load error:", e);
      } finally {
        setIsAppLoaded(true);
      }
    }
    initDb();
  }, [storageMode]);


  const serverInitialLoadComplete = useRef<boolean>(false);
  const isServerLoadInProgress = useRef<boolean>(false);
  const [isInitialServerLoading, setIsInitialServerLoading] = useState<boolean>(() => {
    return storageMode === "server" && !serverInitialLoadComplete.current;
  });

  useEffect(() => {
    settingsStore.setItem("vocab_clone_storage_mode", storageMode);
  }, [storageMode]);

  useEffect(() => {
    settingsStore.setItem("vocab_clone_local_sync_key", localSyncKey);
    setLocalSyncError(false); // Reset error status when key is edited
  }, [localSyncKey]);

  // Auto-show login/profile selection modal on launch if no profile is active
  useEffect(() => {
    if (!isAuthLoading && !activeUser) {
      setShowLocalLoginModal(true);
    }
  }, [isAuthLoading, activeUser]);

  useEffect(() => {
    const handleProgressSave = (e: any) => {
      if (e && e.detail && e.detail.lessonId && e.detail.videoProgress !== undefined) {
        if (e.detail.videoProgress === "0") {
          localStorage.removeItem(`youtube_progress_${e.detail.lessonId}`);
        } else {
          safeLocalStorageSetItem(`youtube_progress_${e.detail.lessonId}`, String(e.detail.videoProgress));
        }
      }
    };
    window.addEventListener("lectura:save_progress", handleProgressSave);
    return () => {
      window.removeEventListener("lectura:save_progress", handleProgressSave);
    };
  }, []);

  // Periodic background check for new server version to auto-reload browser tab seamlessly (Web PWA only)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return;
    }
    let unmounted = false;
    const checkVersion = async () => {
      try {
        const res = await fetch("/api/health?t=" + Date.now());
        if (res.ok) {
          const data = await res.json();
          if (!unmounted && data && data.version && data.version !== APP_VERSION) {
            console.log(`[VersionCheck] Server updated to ${data.version} (current: ${APP_VERSION}).`);
            // If user is currently in active reader mode, do NOT disrupt reading session
            if (activeTabRef.current === "read") {
              return;
            }
            if ("serviceWorker" in navigator) {
              try {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                  await reg.unregister();
                }
              } catch (_) {}
            }
            if ("caches" in window) {
              try {
                const keys = await caches.keys();
                for (const key of keys) {
                  await caches.delete(key);
                }
              } catch (_) {}
            }
            window.location.reload();
          }
        }
      } catch (e) {}
    };

    checkVersion();
    const interval = setInterval(checkVersion, 30000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, []);

  // Multi-Device Wake-up / Focus Sync (when device unlocks or tab becomes visible)
  useEffect(() => {
    let focusTimer: any = null;
    const handleWakeup = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (storageMode !== "server" || localSyncError) return;
      if (isServerLoadInProgress.current || isSyncing) return;

      const now = Date.now();
      // Strict debounce & cooldown: at least 8s since last sync and 30s since last local change
      if (now - lastSyncSuccessTime.current < 8000 || now - lastLocalChangeTime.current < 30000) {
        return;
      }

      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible" && !isServerLoadInProgress.current) {
          loadDataFromLocalServer().catch(() => {});
        }
      }, 300);
    };

    window.addEventListener("focus", handleWakeup);
    document.addEventListener("visibilitychange", handleWakeup);
    return () => {
      window.removeEventListener("focus", handleWakeup);
      document.removeEventListener("visibilitychange", handleWakeup);
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [storageMode, localSyncError, isSyncing]);

  const activeUserId = (activeUser as any)?.uid || (activeUser as any)?.id || null;
  const prevUserIdRef = useRef<string | null>(activeUserId);

  useEffect(() => {
    if (storageMode === "server" && !isAuthLoading) {
      if (prevUserIdRef.current !== activeUserId) {
        prevUserIdRef.current = activeUserId;
        serverInitialLoadComplete.current = false;
        // Clear any previous error so a fresh login always triggers a clean sync
        setLocalSyncError(false);
        // Only load from server if an authenticated user is logged in
        if (activeUserId) {
          setTimeout(() => loadDataFromLocalServer(), 600);
        }
        return;
      }
      if (activeUserId) {
        loadDataFromLocalServer();
      }
    }
  }, [activeUserId, storageMode, isAuthLoading]);

  useEffect(() => {
    const handleLogout = () => {
      serverInitialLoadComplete.current = false;
      const initialLessons = normalizeBuiltInLessons(BUILT_IN_LESSONS);
      setLessons(initialLessons);
      useLessonStore.getState().setLessons(initialLessons);
      setLessonTypes(ensureDefaultLessonTypes(DEFAULT_LESSON_TYPES));
      setPlaylists([]);
      setVocab({});
      setWordLinks({});
      setListeningSeconds(0);
      setHistory([]);
      setLanguageFlags({});
      const cleanDefaults: ReaderSettings = {
        ...DEFAULT_READER_SETTINGS,
        toolbarVisibility: { ...DEFAULT_TOOLBAR_VISIBILITY },
      };
      setReaderSettings(cleanDefaults);
      safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(cleanDefaults));
      settingsStore.setItem("vocab_clone_reader_settings", JSON.stringify(cleanDefaults)).catch(() => {});
    };
    window.addEventListener("lectura:user_logout", handleLogout);
    return () => {
      window.removeEventListener("lectura:user_logout", handleLogout);
    };
  }, []);

  const loadDataFromLocalServer = async (force: boolean = false) => {
    if (!force && storageMode === "server" && serverInitialLoadComplete.current && Date.now() - lastLocalChangeTime.current < 5000) {
      return;
    }
    // Only block on error if we already successfully loaded once — first-time login should always retry
    if (localSyncError && serverInitialLoadComplete.current) return;
    if (!force && storageMode === "server" && serverInitialLoadComplete.current && Date.now() - lastLocalChangeTime.current < 15000) {
      return;
    }
    if (storageMode !== "server") return;
    if (localSyncError) return;
    if (isServerLoadInProgress.current) {
      return;
    }

    const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
    const savedUserStr = localStorage.getItem("vocab_clone_local_user");
    const hasSavedSession = !!(savedToken && savedUserStr);
    if (!hasSavedSession && (isAuthLoading || !activeUserId)) {
      setIsInitialServerLoading(false);
      setIsSyncing(false);
      return;
    }

    isServerLoadInProgress.current = true;
    setIsSyncing(true);
    setSyncProgress({
      isSyncing: true,
      percent: 25,
      message: "Подключение к серверу...",
      error: false,
      lastSyncTime: lastSyncSuccessTime.current,
    });
    if (!serverInitialLoadComplete.current) {
      setIsInitialServerLoading(true);
    }
    const loadT0 = performance.now();
    console.log("[Load] loadDataFromLocalServer START", new Date().toISOString());
    try {
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;

      const fetchHeaders: Record<string, string> = {
        "x-local-sync-key": localSyncKey,
        "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default"
      };
      if (savedToken) {
        fetchHeaders["Authorization"] = `Bearer ${savedToken}`;
      }
      const fetchStart = performance.now();
      const res = await fetch(resolveApiUrl("/api/server-db"), {
        headers: fetchHeaders
      });
      console.log(`[Load] /api/server-db responded in ${(performance.now() - fetchStart).toFixed(0)}ms, status=${res.status}`);

      if (res.status === 401 || res.status === 403) {
        setLocalSyncError(true);
        setIsSyncing(false);
        setSyncProgress({
          isSyncing: false,
          percent: 0,
          message: "Ошибка доступа (401/403)",
          error: true,
          lastSyncTime: lastSyncSuccessTime.current,
        });
        return;
      }
      if (res.ok) {
        setSyncProgress({
          isSyncing: true,
          percent: 65,
          message: "Синхронизация словаря и книг...",
          error: false,
          lastSyncTime: lastSyncSuccessTime.current,
        });
        lastSyncSuccessTime.current = Date.now();
        const body = await safeJsonParse(res);
        if (!force && storageMode === "server" && serverInitialLoadComplete.current && Date.now() - lastLocalChangeTime.current < 15000) {
          setIsSyncing(false);
          setSyncProgress({
            isSyncing: false,
            percent: 100,
            message: "В сети",
            error: false,
            lastSyncTime: lastSyncSuccessTime.current || Date.now(),
          });
          return;
        }
        if (body.status === "ok" && body.data) {
          const d = body.data;
          const normalizedCloudVocab = normalizeVocabRecord(d.vocab);
          const normalizedCloudWordLinks = normalizeWordLinksRecord(d.wordLinks);
          if (d.lessons && Array.isArray(d.lessons)) {
            const { archivingIds } = useLessonStore.getState();
            const safeLessons = d.lessons
              .filter((l: any) => {
                if (!l) return false;
                if (typeof l.text === "string" && l.text.trim().length > 0) return true;
                if (l.isBuiltIn) return true;
                if (l.wordTimestamps && l.wordTimestamps.length > 2) return true;
                return false;
              })
              .map((l: any) => {
                if (archivingIds.has(l.id)) {
                  const currentLocal = lessonsRef.current.find((item) => item.id === l.id);
                  if (currentLocal) {
                    return { ...l, isArchived: currentLocal.isArchived };
                  }
                }
                return l;
              });
            setLessons(safeLessons);
            lessonsRef.current = safeLessons;
            lessonsStore.setItem("lessons", safeLessons).catch(() => {});
          }
          if (d.playlists && Array.isArray(d.playlists)) {
            setPlaylists(d.playlists);
            d.playlists.forEach((pl: Playlist) => {
              playlistsStore.setItem(pl.id, pl).catch(() => {});
            });
          }
          if (d.lessonTypes) setLessonTypes(d.lessonTypes);

          // Smart merge: NEVER overwrite recent local word mutations with stale server data
          setVocab((prevVocab) => {
            const merged = mergeCloudVocabWithLocal(normalizedCloudVocab, prevVocab);
            vocabRef.current = merged;
            return merged;
          });
          setWordLinks(normalizedCloudWordLinks);
          wordLinksRef.current = normalizedCloudWordLinks;

          if (d.listeningSeconds !== undefined) {
            setListeningSeconds(prev => Math.max(prev, d.listeningSeconds));
          }
          if (d.languageFlags) setLanguageFlags(d.languageFlags);

          // Smart settings merge: NEVER overwrite recent local tone / theme / font changes with stale server data
          if (d.readerSettings && typeof d.readerSettings === "object") {
            const settingsRecentlyChanged =
              Date.now() - lastSettingsLocalChangeTimeRef.current < 60000 ||
              Date.now() - lastSettingsLocalMutationTime < 60000;
            if (!settingsRecentlyChanged) {
              const nextSettings: ReaderSettings = {
                ...DEFAULT_READER_SETTINGS,
                ...d.readerSettings,
                toolbarVisibility: {
                  ...DEFAULT_TOOLBAR_VISIBILITY,
                  ...(d.readerSettings.toolbarVisibility || {}),
                },
              };
              setReaderSettings(nextSettings);
              readerSettingsRef.current = nextSettings;
              useSettingsStore.getState().setSettings(nextSettings);
              safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(nextSettings));
              settingsStore.setItem("vocab_clone_reader_settings", JSON.stringify(nextSettings)).catch(() => {});
            } else {
              console.log("[Load] Preserving recent local readerSettings (tone/theme/font changed < 60s ago)");
            }
          } else {
            const settingsRecentlyChanged =
              Date.now() - lastSettingsLocalChangeTimeRef.current < 60000 ||
              Date.now() - lastSettingsLocalMutationTime < 60000;
            if (!settingsRecentlyChanged) {
              const cleanDefaults: ReaderSettings = {
                ...DEFAULT_READER_SETTINGS,
                toolbarVisibility: { ...DEFAULT_TOOLBAR_VISIBILITY },
              };
              setReaderSettings(cleanDefaults);
              readerSettingsRef.current = cleanDefaults;
              useSettingsStore.getState().setSettings(cleanDefaults);
              safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(cleanDefaults));
              settingsStore.setItem("vocab_clone_reader_settings", JSON.stringify(cleanDefaults)).catch(() => {});
            }
          }
          if (d.pinnedLanguages && Array.isArray(d.pinnedLanguages)) {
            setPinnedLanguages(d.pinnedLanguages);
            safeLocalStorageSetItem("vocab_clone_pinned_languages", JSON.stringify(d.pinnedLanguages));
            settingsStore.setItem("vocab_clone_pinned_languages", JSON.stringify(d.pinnedLanguages)).catch(() => {});
          }
          if (d.hiddenLanguages && Array.isArray(d.hiddenLanguages)) {
            setHiddenLanguages(d.hiddenLanguages);
            safeLocalStorageSetItem("vocab_clone_hidden_languages", JSON.stringify(d.hiddenLanguages));
            settingsStore.setItem("vocab_clone_hidden_languages", JSON.stringify(d.hiddenLanguages)).catch(() => {});
          }
          if (d.selectedTargetLanguage && typeof d.selectedTargetLanguage === "string") {
            if (!serverInitialLoadComplete.current) {
              setSelectedTargetLanguage(d.selectedTargetLanguage);
              safeLocalStorageSetItem("vocab_global_target_language", d.selectedTargetLanguage);
            }
          }

          if (d.dictionaryPreferences && typeof d.dictionaryPreferences === "object") {
            for (const [langKey, prefs] of Object.entries(d.dictionaryPreferences)) {
              if (prefs && typeof prefs === "object") {
                safeLocalStorageSetItem(`vocab_clone_dict_prefs_${langKey}`, JSON.stringify(prefs));
              }
            }
          }

          if (d.history && Array.isArray(d.history)) {
            const GARBAGE_TITLES = new Set(['test', 'занятие', 'imported_record', '']);
            const cleanServerHistory = d.history
              .filter((item: HistoryEntry) => {
                if ((item.durationSeconds || 0) <= 0) return false;
                if (item.lessonId === 'imported_record' && GARBAGE_TITLES.has((item.lessonTitle || '').trim().toLowerCase())) {
                  return false;
                }
                return true;
              });

            // Preserve only very recent local sessions (created in the last 10s) not yet sent to server
            const serverIds = new Set(cleanServerHistory.map((h: HistoryEntry) => h.id));
            const now = Date.now();
            const recentUnsynced = historyRef.current.filter((localItem) => {
              if (serverIds.has(localItem.id)) return false;
              if (cleanServerHistory.some((srv: HistoryEntry) => 
                ((srv as any).guid && (localItem as any).guid === (srv as any).guid) ||
                (srv.lessonId && localItem.lessonId === srv.lessonId)
              )) return false;
              const itemTime = new Date(localItem.timestamp).getTime() || 0;
              return (now - itemTime < 10000) && (localItem.durationSeconds || 0) > 0;
            });

            const cleanHistory = dedupeHistory([...recentUnsynced, ...cleanServerHistory]);
            setHistory(cleanHistory);
            historyRef.current = cleanHistory;
            safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(cleanHistory));
            settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(cleanHistory)).catch(() => {});
          }

          // Sync into local stores
          if (d.lessons) lessonsStore.setItem("lessons", d.lessons);
          if (d.lessonTypes) lessonsStore.setItem("lessontypes", d.lessonTypes);
          vocabStore.setItem("words", normalizedCloudVocab).catch(() => {});
          vocabStore.setItem("aliases", normalizedCloudWordLinks).catch(() => {});
          if (d.listeningSeconds !== undefined) safeLocalStorageSetItem("vocab_clone_listening", d.listeningSeconds.toString());
          if (d.languageFlags) safeLocalStorageSetItem("vocab_clone_language_flags", JSON.stringify(d.languageFlags));

          if (d.videoProgress && typeof d.videoProgress === "object") {
            for (const [lessonId, val] of Object.entries(d.videoProgress)) {
              if (val !== undefined && val !== null) {
                safeLocalStorageSetItem(`youtube_progress_${lessonId}`, String(val));
                settingsStore.setItem(`youtube_progress_${lessonId}`, String(val)).catch(() => {});
              }
            }
          }
          if (d.readingProgress && typeof d.readingProgress === "object") {
            const parseProgMeta = (raw: any): { progress: number; updatedAt: number } => {
              if (!raw) return { progress: 0, updatedAt: 0 };
              if (typeof raw === "number") return { progress: raw, updatedAt: 0 };
              if (typeof raw === "object") {
                const p = parseInt(raw.progress, 10);
                return { progress: !isNaN(p) && p >= 0 ? p : 0, updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0 };
              }
              try {
                const parsed = JSON.parse(raw);
                if (typeof parsed === "number") return { progress: parsed, updatedAt: 0 };
                if (parsed && typeof parsed === "object") {
                  const p = parseInt(parsed.progress, 10);
                  return { progress: !isNaN(p) && p >= 0 ? p : 0, updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0 };
                }
              } catch (_) {}
              const num = parseInt(raw, 10);
              return { progress: !isNaN(num) && num >= 0 ? num : 0, updatedAt: 0 };
            };

            for (const [lessonId, val] of Object.entries(d.readingProgress)) {
              if (val !== undefined && val !== null) {
                // If user is actively reading this lesson, preserve current reader page
                if (activeTabRef.current === "read" && activeLessonIdRef.current === lessonId) {
                  continue;
                }
                const localRaw = localStorage.getItem(`vocab_progress_${lessonId}`);
                const localInfo = parseProgMeta(localRaw);
                const serverInfo = parseProgMeta(val);
                if (!localInfo.updatedAt || serverInfo.updatedAt >= localInfo.updatedAt) {
                  const toStore = typeof val === "object" ? JSON.stringify(val) : String(val);
                  safeLocalStorageSetItem(`vocab_progress_${lessonId}`, toStore);
                }
              }
            }
          }

          if (d.customTags && Array.isArray(d.customTags)) {
            safeLocalStorageSetItem("vocab_clone_custom_tags", JSON.stringify(d.customTags));
          }

          if (d.dailyWordGoal) {
            safeLocalStorageSetItem("vocab_clone_daily_word_goal", String(d.dailyWordGoal));
          }

          if (d.lastActiveLessonId && typeof d.lastActiveLessonId === "string") {
            safeLocalStorageSetItem("vocab_clone_last_active_lesson_id", d.lastActiveLessonId);
          }

          // Update lightweight UI preview cache (READ-ONLY visual snapshot for fast startup)
          try {
            const targetLang = d.selectedTargetLanguage || selectedTargetLanguage;
            const activeBooks = (d.lessons || []).filter((l: any) => !l.isArchived).length + (d.playlists || []).filter((p: any) => !p.isArchived).length;
            const archivedBooks = (d.lessons || []).filter((l: any) => l.isArchived).length + (d.playlists || []).filter((p: any) => p.isArchived).length;
            const flagVariant = d.languageFlags?.[targetLang.toLowerCase()] || undefined;

            const langLower = targetLang !== "All" ? targetLang.toLowerCase() : null;
            let knownCount = 0;
            let activeWordsCount = 0;
            if (d.vocab && typeof d.vocab === "object") {
              Object.entries(d.vocab).forEach(([k, v]: [string, any]) => {
                if (!v) return;
                if (langLower) {
                  const parts = k.split("_");
                  const itemLang = parts.length > 1 ? parts[0].toLowerCase() : "spanish";
                  if (itemLang !== langLower) return;
                }
                if (v.status === "known") knownCount++;
                else if (["1", "2", "3", "4", "5", "learning"].includes(v.status)) activeWordsCount++;
              });
            }

            saveUIPreviewCache({
              selectedLanguage: targetLang,
              selectedVariant: flagVariant,
              activeBooksCount: activeBooks,
              archivedBooksCount: archivedBooks,
              knownWordsCount: knownCount,
              activeWordsCount: activeWordsCount,
            });
          } catch (_) {}

          serverInitialLoadComplete.current = true;
        } else if (body.status === "empty") {
          // Empty server database: Seed it immediately with default lessons
          const seedLessons = normalizeBuiltInLessons(BUILT_IN_LESSONS);
          setLessons(seedLessons);
          serverInitialLoadComplete.current = true;
          syncDataToLocalServer(seedLessons).catch(() => {});
        }
      } else {
        setIsSyncing(false);
        setSyncProgress(prev => ({
          ...prev,
          isSyncing: false,
          percent: 0,
          message: `Ошибка HTTP ${res.status}`,
          error: true,
        }));
      }
    } catch (e: any) {
      console.error("Failed to load or seed dataset from local server:", e);
      setSyncProgress(prev => ({
        ...prev,
        isSyncing: false,
        percent: 0,
        message: e?.message || "Ошибка подключения",
        error: true,
      }));
    } finally {
      isServerLoadInProgress.current = false;
      setIsSyncing(false);
      setIsInitialServerLoading(false);
      setSyncProgress(prev => ({
        ...prev,
        isSyncing: false,
        percent: prev.error ? 0 : 100,
        message: prev.error ? (prev.message || "Ошибка") : "В сети",
        lastSyncTime: prev.error ? prev.lastSyncTime : Date.now(),
      }));
    }
  };

  // Auto-refresh books list when a background Whisper transcription finishes
  useEffect(() => {
    let lastCompletedCount = whisperQueueService.getState().completedTasks.length;
    const unsub = whisperQueueService.subscribe(() => {
      const state = whisperQueueService.getState();
      if (state.completedTasks.length > lastCompletedCount) {
        lastCompletedCount = state.completedTasks.length;
        loadDataFromLocalServer();
      }
    });
    return () => unsub();
  }, []);


  const pendingSyncDeletedLessonsRef = useRef<string[]>([]);
  const pendingSyncDeletedPlaylistsRef = useRef<string[]>([]);
  const pendingSyncDeletedWordKeysRef = useRef<string[]>([]);
  const pendingSyncDeletedHistoryRef = useRef<string[]>([]);
  const syncDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const syncDataToLocalServer = async (
    currentLessons = lessonsRef.current,
    currentTypes = lessonTypesRef.current,
    currentVocab = vocabRef.current,
    currentLinks = wordLinksRef.current,
    currentListening = listeningSecondsRef.current,
    currentFlags = languageFlagsRef.current,
    currentHistory = historyRef.current,
    deletedLessonIds?: string[],
    currentSettings = readerSettingsRef.current,
    currentPinned = pinnedLanguagesRef.current,
    currentHidden = hiddenLanguagesRef.current,
    currentSelectedLang = selectedTargetLanguageRef.current,
    deletedWordKeys?: string[],
    currentPlaylists = playlistsRef.current,
    deletedPlaylistIds?: string[],
    deletedHistoryIds?: string[]
  ) => {
    if (storageMode !== "server") return;
    if (localSyncError) return;
    lastLocalChangeTime.current = Date.now();
    
    if (deletedLessonIds) pendingSyncDeletedLessonsRef.current.push(...deletedLessonIds);
    if (deletedPlaylistIds) pendingSyncDeletedPlaylistsRef.current.push(...deletedPlaylistIds);
    if (deletedWordKeys) pendingSyncDeletedWordKeysRef.current.push(...deletedWordKeys);
    if (deletedHistoryIds) pendingSyncDeletedHistoryRef.current.push(...deletedHistoryIds);

    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
    }

    syncDebounceTimerRef.current = setTimeout(async () => {
      syncDebounceTimerRef.current = null;
      lastLocalChangeTime.current = Date.now();

      const finalDeletedLessonIds = [...new Set(pendingSyncDeletedLessonsRef.current)];
      const finalDeletedPlaylistIds = [...new Set(pendingSyncDeletedPlaylistsRef.current)];
      const finalDeletedWordKeys = [...new Set(pendingSyncDeletedWordKeysRef.current)];
      const finalDeletedHistoryIds = [...new Set(pendingSyncDeletedHistoryRef.current)];

      pendingSyncDeletedLessonsRef.current = [];
      pendingSyncDeletedPlaylistsRef.current = [];
      pendingSyncDeletedWordKeysRef.current = [];
      pendingSyncDeletedHistoryRef.current = [];

      try {
      const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
      const savedUserStr = localStorage.getItem("vocab_clone_local_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;

      const postHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "x-local-sync-key": localSyncKey,
        "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default"
      };
      if (savedToken) {
        postHeaders["Authorization"] = `Bearer ${savedToken}`;
      }

      // Collect video & reading progress & dictionary preferences maps from localStorage
      const videoProgress: Record<string, string> = {};
      const readingProgress: Record<string, string> = {};
      const dictionaryPreferences: Record<string, any> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("youtube_progress_")) {
            const lessonId = key.replace("youtube_progress_", "");
            const val = localStorage.getItem(key);
            if (val !== null) videoProgress[lessonId] = val;
          } else if (key?.startsWith("vocab_progress_")) {
            const lessonId = key.replace("vocab_progress_", "");
            const val = localStorage.getItem(key);
            if (val !== null) readingProgress[lessonId] = val;
          } else if (key?.startsWith("vocab_clone_dict_prefs_")) {
            const langKey = key.replace("vocab_clone_dict_prefs_", "");
            const val = localStorage.getItem(key);
            if (val) {
              try { dictionaryPreferences[langKey] = JSON.parse(val); } catch (_) {}
            }
          }
        }
      } catch (_) {}

      let customTags = undefined;
      const rawTags = localStorage.getItem("vocab_clone_custom_tags");
      if (rawTags) {
        try { customTags = JSON.parse(rawTags); } catch (_) {}
      }

      const rawGoal = localStorage.getItem("vocab_clone_daily_word_goal");
      const dailyWordGoal = rawGoal ? parseInt(rawGoal, 10) : undefined;
      const lastActiveLessonId = localStorage.getItem("vocab_clone_last_active_lesson_id") || undefined;

      // (finalDeletedHistoryIds calculated above in debounce wrapper)

      if (finalDeletedHistoryIds.length > 0) {
        console.log('[Sync Delete Request]', { deletedHistoryIds: finalDeletedHistoryIds });
      }

      const safeHistory = (currentHistory || []).filter(h => {
        if (!h || !h.id) return false;
        if (finalDeletedHistoryIds.includes(h.id)) return false;
        if ((h.durationSeconds || 0) <= 0) return false;
        return true;
      });

      const res = await fetch(resolveApiUrl("/api/server-db"), {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify({
          data: {
            lessons: currentLessons,
            playlists: currentPlaylists,
            lessonTypes: currentTypes,
            vocab: vocabRef.current || currentVocab,
            wordLinks: wordLinksRef.current || currentLinks,
            listeningSeconds: listeningSecondsRef.current || currentListening,
            languageFlags: languageFlagsRef.current || currentFlags,
            history: safeHistory,
            readerSettings: readerSettingsRef.current || currentSettings,
            pinnedLanguages: currentPinned,
            hiddenLanguages: currentHidden,
            selectedTargetLanguage: currentSelectedLang,
            dictionaryPreferences,
            customTags,
            dailyWordGoal,
            lastActiveLessonId,
            videoProgress,
            readingProgress,
            deletedLessonIds: finalDeletedLessonIds.length > 0 ? finalDeletedLessonIds : undefined,
            deletedPlaylistIds: finalDeletedPlaylistIds.length > 0 ? finalDeletedPlaylistIds : undefined,
            deletedWordKeys: finalDeletedWordKeys.length > 0 ? finalDeletedWordKeys : undefined,
            deletedHistoryIds: finalDeletedHistoryIds,
          },
        }),
      });
      
      if (finalDeletedHistoryIds.length > 0) {
        console.log('[Sync Server Response]', res.status);
      }
      if (res.status === 401 || res.status === 403) {
        setLocalSyncError(true);
        setSyncProgress(prev => ({
          ...prev,
          isSyncing: false,
          percent: 0,
          message: "Ошибка доступа (401/403)",
          error: true,
        }));
        return;
      }
      if (res.ok) {
        lastLocalChangeTime.current = Date.now();
        lastSyncSuccessTime.current = Date.now();
        setSyncProgress(prev => ({
          ...prev,
          isSyncing: false,
          percent: 100,
          message: "В сети",
          error: false,
          lastSyncTime: Date.now(),
        }));
      }
    } catch (e: any) {
      console.error("Failed to auto-sync with local dev server:", e);
      setSyncProgress(prev => ({
        ...prev,
        isSyncing: false,
        percent: 0,
        message: e?.message || "Ошибка отправки",
        error: true,
      }));
    }
    }, 1500);
  };

  // Synchronize with Local Server / Local Cache on mount and mode change
  useEffect(() => {
    if (storageMode === "server") {
      loadDataFromLocalServer();
    } else {
      // Local browser storage
      const localLessonsStr = localStorage.getItem("vocab_clone_lessons");
      const localTypesStr = localStorage.getItem("vocab_clone_lessontypes");
      const localListeningStr = localStorage.getItem("vocab_clone_listening");
      const localFlagsStr = localStorage.getItem("vocab_clone_language_flags");

      const userDel = localStorage.getItem("vocab_clone_user_deleted_lessons") === "true";
      setLessons(safeParse(localLessonsStr, userDel ? [] : BUILT_IN_LESSONS));
      setLessonTypes(ensureDefaultLessonTypes(safeParse(localTypesStr, DEFAULT_LESSON_TYPES) as LessonType[]));
      setListeningSeconds(localListeningStr ? parseFloat(localListeningStr) || 0 : 0);
      setLanguageFlags(safeParse(localFlagsStr, {}));

      vocabStore.getItem("words").then((savedVocab) => {
        if (savedVocab) {
          setVocab(normalizeVocabRecord(savedVocab as Record<string, VocabItem>));
        } else {
          const localWordsStr = localStorage.getItem("vocab_clone_words");
          if (localWordsStr) setVocab(normalizeVocabRecord(safeParse(localWordsStr, {})));
        }
      }).catch(() => {});

      vocabStore.getItem("aliases").then((savedAliases) => {
        if (savedAliases) {
          setWordLinks(normalizeWordLinksRecord(savedAliases as Record<string, string>));
        } else {
          const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
          if (localAliasesStr) setWordLinks(normalizeWordLinksRecord(safeParse(localAliasesStr, {})));
        }
      }).catch(() => {});
    }
  }, [storageMode, activeUser]);

  // Debounced Auto-save to Local Dev Server for language settings changes
  useEffect(() => {
    if (storageMode !== "server") return;
    if (!serverInitialLoadComplete.current) return;

    if (delayDebounceFnRef.current) clearTimeout(delayDebounceFnRef.current);

    delayDebounceFnRef.current = setTimeout(() => {
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypesRef.current,
        vocabRef.current,
        wordLinksRef.current,
        listeningSecondsRef.current,
        languageFlagsRef.current,
        historyRef.current,
        undefined,
        readerSettingsRef.current,
        pinnedLanguagesRef.current,
        hiddenLanguagesRef.current,
        selectedTargetLanguageRef.current,
        undefined,
        playlistsRef.current
      );
    }, 10000); // Strict 10s debounce

    return () => {
      if (delayDebounceFnRef.current) clearTimeout(delayDebounceFnRef.current);
    };
  }, [storageMode, localSyncKey, localSyncError, selectedTargetLanguage]);

  // Listen to immediate vocab updates from VocabContext / components
  useEffect(() => {
    const handleVocabUpdated = (e: any) => {
      lastLocalChangeTime.current = Date.now();
      const updatedVocab = e.detail || vocabRef.current;
      vocabRef.current = updatedVocab;
      if (storageMode === "server") {
        syncDataToLocalServer(lessonsRef.current, lessonTypesRef.current, updatedVocab, wordLinksRef.current).catch((err) =>
          console.error("Failed to sync vocab update with server:", err)
        );
      }
    };
    window.addEventListener("lectura:vocab_updated", handleVocabUpdated);

    const handleRefreshLessons = () => {
      lastLocalChangeTime.current = 0;
      loadDataFromLocalServer(true);
    };
    window.addEventListener("lectura:refresh_lessons", handleRefreshLessons);
    window.addEventListener("lectura:refresh_history", handleRefreshLessons);

    return () => {
      window.removeEventListener("lectura:vocab_updated", handleVocabUpdated);
      window.removeEventListener("lectura:refresh_lessons", handleRefreshLessons);
      window.removeEventListener("lectura:refresh_history", handleRefreshLessons);
    };
  }, [storageMode]);

  // Dynamic automatic syncing of tablet/PC changes over local network (polls on window focus and every 10s when visible)
  // Note: We do NOT call loadDataFromLocalServer() on mount here — onAuthStateChanged already does the initial load.
  // This avoids a duplicate parallel fetch race on startup that caused UI flickering.
  useEffect(() => {
    if (storageMode !== "server") return;

    const handleFocusOrVisible = () => {
      // Respect recent local changes: do NOT poll if local changes happened within last 15s
      if (Date.now() - lastLocalChangeTime.current < 15000) {
        return;
      }
      if (document.visibilityState === "visible") {
        loadDataFromLocalServer(false);
      }
    };

    window.addEventListener("visibilitychange", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("focus", handleFocusOrVisible);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastLocalChangeTime.current >= 15000) {
        loadDataFromLocalServer(false);
      }
    }, 15000);

    return () => {
      window.removeEventListener("visibilitychange", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("focus", handleFocusOrVisible);
      clearInterval(interval);
    };
  }, [storageMode, localSyncKey, localSyncError, serverToken]);

  // Real-time Cross-Window History Sync: synchronize in-memory history when modified/deleted in another tab
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "vocab_clone_reading_history" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            const clean = dedupeHistory(parsed).filter((h) => (h.durationSeconds || 0) > 0);
            setHistory(clean);
            historyRef.current = clean;
          }
        } catch (_) {}
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);



  // Sync state to local storage (sanitizing heavy base64 fields to prevent quota overflow)
  useEffect(() => {
    lessonsStore.setItem("lessons", lessons);
  }, [lessons]);

  useEffect(() => {
    lessonsStore.setItem("lessontypes", lessonTypes);
  }, [lessonTypes]);

  const handleCreateLessonType = (newType: LessonType) => {
    setLessonTypes((prev) => {
      if (prev.some((t) => t.id.toLowerCase() === newType.id.toLowerCase())) return prev;
      return [...prev, newType];
    });
  };

  const handleDeleteLessonType = (typeId: string) => {
    setLessonTypes((prev) => prev.filter((t) => t.id !== typeId));
  };

  const handleUpdateLessonType = (updatedType: LessonType) => {
    setLessonTypes((prev) => prev.map((t) => t.id === updatedType.id ? updatedType : t));
  };

  useEffect(() => {
    vocabStore.setItem("words", vocab);
  }, [vocab]);

  useEffect(() => {
    settingsStore.setItem("vocab_clone_listening", listeningSeconds.toString());
  }, [listeningSeconds]);

  useEffect(() => {
    vocabStore.setItem("aliases", wordLinks);
  }, [wordLinks]);

  useEffect(() => {
    useSettingsStore.getState().setSettings(readerSettings);
    safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(readerSettings));
    settingsStore.setItem("vocab_clone_reader_settings", JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    settingsStore.setItem("vocab_clone_language_flags", JSON.stringify(languageFlags));
  }, [languageFlags]);

  useEffect(() => {
    settingsStore.setItem("vocab_clone_focus_mode", isFocusMode ? "true" : "false");
  }, [isFocusMode]);

  useEffect(() => {
    settingsStore.setItem("vocab_clone_layout_width", layoutWidthMode);
  }, [layoutWidthMode]);

  // Derive current active objects
  const activeLesson = useMemo(() => {
    return activeLessonId ? (lessons.find((l) => l.id === activeLessonId) || null) : null;
  }, [lessons, activeLessonId]);

  const { setActiveLesson } = useLesson();
  useEffect(() => {
    setActiveLesson(activeLesson || null);
  }, [activeLesson, setActiveLesson]);

  // Auto-activate Focus Mode for video lessons on mobile & tablet devices (< 1024px)
  useEffect(() => {
    if (!activeLesson || activeTab !== "read") return;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    const isVideo = isVideoLesson(activeLesson);

    if (isMobileOrTablet && isVideo) {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const isExplicitNonFocus = urlParams?.get("focus") === "false" || urlParams?.get("mode") === "text";

      if (!isExplicitNonFocus) {
        setIsFocusMode(true);
        setShowYoutubePlayer(true);
      }
    }
  }, [activeLesson?.id, activeTab, setIsFocusMode, setShowYoutubePlayer]);

  useEffect(() => {
    try {
      localStorage.setItem("vocab_clone_dark_mode", isDarkMode ? "true" : "false");
    } catch (_) {}
    settingsStore.setItem("vocab_clone_dark_mode", isDarkMode ? "true" : "false");
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const activeLessonWords = useMemo(() => {
    if (!activeLesson || typeof activeLesson.text !== "string") return [];
    const textLower = activeLesson.text.toLowerCase();
    const regex = /[\p{L}\p{M}'’]+/gu;
    const tokens = textLower.match(regex) || [];
    const tokenSet = new Set(tokens);
    const lang = (activeLesson.targetLanguage || "spanish").toLowerCase();
    const bookVocabItemsMap = new Map<string, VocabItem>();

    // Fast check over vocab items
    for (const key of Object.keys(vocab)) {
      const item = vocab[key];
      if (!item || !["1", "2", "3", "4", "5", "learning"].includes(item.status)) continue;
      
      const wordLower = item.word.toLowerCase();
      // Direct word match in book tokens
      if (tokenSet.has(wordLower)) {
        bookVocabItemsMap.set(wordLower, item);
        continue;
      }
      // Multi-word phrase match in book text
      if (wordLower.includes(" ") && textLower.includes(wordLower)) {
        bookVocabItemsMap.set(wordLower, item);
        continue;
      }
      // Word links / lemma match
      const langKey = `${lang}_${wordLower}`;
      if (wordLinks[langKey]) {
        const resolved = wordLinks[langKey].replace(/^[a-zA-Z]+_/, "");
        if (tokenSet.has(resolved)) {
          bookVocabItemsMap.set(wordLower, item);
        }
      }
    }

    // Explicit detected phrases
    if (activeLesson.detectedPhrases) {
      Object.keys(activeLesson.detectedPhrases).forEach((phrase) => {
        const phraseLower = phrase.toLowerCase().trim();
        const lq = vocab[`${lang}_${phraseLower}`] || vocab[phraseLower];
        if (lq && ["1", "2", "3", "4", "5", "learning"].includes(lq.status)) {
          bookVocabItemsMap.set(phraseLower, lq);
        }
      });
    }

    return Array.from(bookVocabItemsMap.values());
  }, [activeLesson?.id, activeLesson?.text, activeLesson?.targetLanguage, activeLesson?.detectedPhrases, vocab, wordLinks]);

  const activeLessonImagesMap = useMemo(() => {
    if (!activeLesson?.id) return {};
    const fromStore = getLessonImagesMap(activeLesson.id);
    let fromLesson = activeLesson.images || {};
    if (typeof fromLesson === "string") {
      try {
        fromLesson = JSON.parse(fromLesson);
      } catch (_) {
        fromLesson = {};
      }
    }
    return { ...fromLesson, ...fromStore };
  }, [activeLesson?.id, activeLesson?.images, lessonImagesVersion]);

  useEffect(() => {
    if (activeLesson?.youtubeId) {
      setShowYoutubePlayer(true);
    }
  }, [activeLesson?.id, activeLesson?.youtubeId]);

  const activeVocabItem = useMemo(() => {
    if (!selectedWord) return null;
    const key = selectedWord.toLowerCase();
    const lang = (activeLesson?.targetLanguage || "spanish").toLowerCase();
    
    // 1. Check direct exact match for selected word first (e.g. wrote -> писал)
    const exactMatch = vocab[`${lang}_${key}`] || vocab[key];
    if (exactMatch) return exactMatch;

    // 2. Check linked parent lemma form if exact match not found (e.g. write -> писать)
    const resolved = wordLinks[`${lang}_${key}`] || (wordLinks[key] ? wordLinks[key] : null);
    if (resolved) {
      const cleanResolved = resolved.replace(/^[a-zA-Z]+_/, "");
      const parentMatch = vocab[`${lang}_${cleanResolved}`] || vocab[cleanResolved];
      if (parentMatch) return parentMatch;
    }

    // 3. Check normalized contraction base word for inheritance
    const normalized = normalizeContraction(key, lang);
    if (normalized !== key) {
      const normMatch = vocab[`${lang}_${normalized}`] || vocab[normalized];
      if (normMatch) return normMatch;
    }

    return null;
  }, [selectedWord, vocab, wordLinks, activeLesson]);

  // Dynamic statistics computing
  const calculatedStats = useMemo<AppStats>(() => {
    const onlyParents = readerSettings?.onlyPatterns !== false;

    let known = 0;
    let learning = 0;

    if (onlyParents && wordLinks) {
      const parentGroups = new Map<string, string[]>();
      Object.entries(vocab || {}).forEach(([key, lq]) => {
        const item = lq as VocabItem;
        if (!item || typeof item !== "object" || !item.word) return;
        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0].toLowerCase() : "spanish";
        const wordLower = item.word.toLowerCase();
        const keyWithLang = `${itemLang}_${wordLower}`;
        const targetKey = wordLinks[keyWithLang] || wordLinks[wordLower];
        let parentWord = wordLower;
        if (targetKey && typeof targetKey === "string") {
          const underscoreIdx = targetKey.indexOf("_");
          parentWord = underscoreIdx !== -1 ? targetKey.substring(underscoreIdx + 1).toLowerCase() : targetKey.toLowerCase();
        }

        const parentGroupKey = `${itemLang}_${parentWord}`;
        if (!parentGroups.has(parentGroupKey)) {
          parentGroups.set(parentGroupKey, []);
        }
        parentGroups.get(parentGroupKey)!.push(item.status || "new");
      });

      parentGroups.forEach((statuses) => {
        const getStatusWeight = (status: string) => {
          switch (status) {
            case "known": return 6;
            case "5": return 5;
            case "4": return 4;
            case "3": case "learning": return 3;
            case "2": return 2;
            case "1": return 1;
            case "ignored": return 0;
            default: return 0;
          }
        };

        let highestStatus = "ignored";
        let maxWeight = -1;
        statuses.forEach((st) => {
          const w = getStatusWeight(st);
          if (w > maxWeight) {
            maxWeight = w;
            highestStatus = st;
          }
        });

        if (highestStatus === "known") {
          known++;
        } else if (["1", "2", "3", "4", "5", "learning"].includes(highestStatus)) {
          learning++;
        }
      });
    } else {
      const values = (Object.values(vocab) || []).filter(Boolean) as VocabItem[];
      known = values.filter((l) => l && l.status === "known").length;
      learning = values.filter((l) => 
        l && l.status && ["1", "2", "3", "4", "5", "learning"].includes(l.status)
      ).length;
    }

    const isToday = (isoDateStr?: string) => {
      if (!isoDateStr) return false;
      try {
        const d = new Date(isoDateStr);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      } catch {
        return false;
      }
    };

    const dedupedHist = dedupeHistory(history);
    const historyListeningSeconds = dedupedHist
      .filter((item) => item.actionType === "listen")
      .reduce((acc, item) => acc + (item.durationSeconds || 0), 0);

    const todayListeningSeconds = dedupedHist
      .filter((item) => item.actionType === "listen" && isToday(item.timestamp))
      .reduce((acc, item) => acc + (item.durationSeconds || 0), 0);

    return {
      listeningSeconds: Math.round(historyListeningSeconds),
      todayListeningSeconds: Math.round(todayListeningSeconds),
      wordsKnownCount: known,
      wordsLearningCount: learning,
    };
  }, [vocab, listeningSeconds, history, readerSettings?.onlyPatterns, wordLinks]);

  const handleOpenLesson = (lessonId: string, word: string, sentence: string) => {
    const normalizedWord = word.replace(/\s+/g, " ").trim();
    const normalizedContext = sentence.replace(/\s+/g, " ").trim();
    setActiveLessonId(lessonId);
    setSelectedWord(normalizedWord);
    setSelectedContext(normalizedContext);
    setActiveTab("read");
  };

  const handleOpenWhisperBook = async (bookId: string) => {
    try {
      const savedToken = localStorage.getItem("vocab_clone_server_token") || localStorage.getItem("local_sync_key") || "";
      const localSyncKey = localStorage.getItem("local_sync_key") || "";
      const savedUserStr = localStorage.getItem("vocab_clone_local_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
      const syncUser = savedUser ? (savedUser.uid || savedUser.email || "default") : (activeUser ? (activeUser.id || activeUser.email || "default") : "default");

      const fetchHeaders: Record<string, string> = {
        "x-local-sync-key": localSyncKey,
        "x-local-sync-user": syncUser
      };
      if (savedToken) {
        fetchHeaders["Authorization"] = `Bearer ${savedToken}`;
      }
      const res = await fetch("/api/server-db", {
        headers: fetchHeaders
      });
      if (res.ok) {
        const body = await safeJsonParse(res);
        if (body.status === "ok" && body.data?.lessons) {
          setLessons(body.data.lessons);
          lessonsStore.setItem("lessons", body.data.lessons).catch(() => {});
        }
      }
    } catch (_) {}

    setActiveLessonId(bookId);
    setActiveTab("read");
  };

  const handleSaveWordLink = (from: string, to: string, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    const lowerFrom = from.toLowerCase();
    const lowerTo = to.toLowerCase();
    if (lowerFrom === lowerTo) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const sourceKey = `${activeLang}_${lowerFrom}`;
    const targetKey = `${activeLang}_${lowerTo}`;
    
    const nextWordLinks = {
      ...wordLinks,
      [sourceKey]: targetKey,
    };

    setWordLinks(nextWordLinks);

    // Instantly sync the statuses and definitions of linked items to avoid split status profiles
    setVocab((prev) => {
      const familyWords = Array.from(new Set([
        lowerFrom,
        lowerTo,
        ...getLinkedWordsFor(lowerTo, activeLang, nextWordLinks),
        ...getLinkedWordsFor(lowerFrom, activeLang, nextWordLinks)
      ]));

      // Search across ALL words in the entire family in `prev` to find the definition
      let targetDefinition: string | undefined = undefined;
      for (const fw of familyWords) {
        const item = prev[`${activeLang}_${fw}`] || prev[`english_${fw}`] || prev[`spanish_${fw}`] || prev[`french_${fw}`] || prev[`german_${fw}`] || prev[fw];
        if (item?.definition && item.definition.trim() !== "") {
          targetDefinition = item.definition.trim();
          break;
        }
      }

      // Find best available status / translation configuration (prefer target/parent lemma)
      let targetStatus: WordStatus = "2";
      for (const fw of familyWords) {
        const item = prev[`${activeLang}_${fw}`] || prev[`english_${fw}`] || prev[`spanish_${fw}`] || prev[`french_${fw}`] || prev[`german_${fw}`] || prev[fw];
        if (item?.status && item.status !== "new") {
          targetStatus = item.status;
          break;
        }
      }

      const nextVocab = { ...prev };

      const now = Date.now();
      familyWords.forEach((linkedWord) => {
        const k = `${activeLang}_${linkedWord}`.toLowerCase();
        markWordLocallyMutated(k);
        markWordLocallyMutated(linkedWord);
        const existing = prev[k] || prev[linkedWord];
        if (existing) {
          nextVocab[k] = {
            ...existing,
            status: existing.status && existing.status !== "new" ? existing.status : targetStatus,
            definition: targetDefinition || existing.definition || undefined,
            updatedAt: now,
          };
        } else {
          nextVocab[k] = {
            word: linkedWord,
            status: targetStatus,
            translation: "",
            definition: targetDefinition || undefined,
            ipa: "",
            grammar: "",
            contextRelation: "",
            examples: [],
            createdAt: now,
            updatedAt: now,
            tags: [],
            imageUrl: null,
          };
        }
      });

      vocabRef.current = nextVocab;

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextVocab, nextWordLinks).catch((err) => console.error(err));
      }

      return nextVocab;
    });
  };

  const handleDeleteWordLink = (from: string, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    const hasUnderscore = from.includes("_");
    const rawWord = hasUnderscore ? from.substring(from.indexOf("_") + 1) : from;
    const activeLang = hasUnderscore ? from.substring(0, from.indexOf("_")) : (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    
    const sourceKey = `${activeLang}_${rawWord.toLowerCase()}`;
    const lowerFrom = rawWord.toLowerCase();

    setWordLinks((prev) => {
      const copy = { ...prev };
      delete copy[sourceKey];
      delete copy[lowerFrom];
      
      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, vocab, copy).catch((err) => console.error(err));
      }
      
      return copy;
    });
  };

  const handleSaveVocabItem = (newVocabItem: VocabItem, lang?: string) => {
    if (!newVocabItem || !newVocabItem.word) {
      console.warn("handleSaveVocabItem: word is empty or undefined", newVocabItem);
      return;
    }
    lastLocalChangeTime.current = Date.now();
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanWord = newVocabItem.word.replace(/^[a-zA-Z]+_/, "").toLowerCase();
    
    // Find all linked words (forms of the same word)
    const linkedWords = getLinkedWordsFor(cleanWord, activeLang);

    setVocab((prev) => {
      const nextVocab = { ...prev };
      
      // Inherit existing family definition ONLY if this update didn't specify one and wasn't explicitly cleared ("")
      let effectiveItem = { ...newVocabItem };
      if (effectiveItem.definition === undefined) {
        for (const lw of linkedWords) {
          if (lw === cleanWord) continue;
          const k = `${activeLang}_${lw}`;
          const ex = prev[k] || prev[`english_${lw}`] || prev[`spanish_${lw}`] || prev[`french_${lw}`] || prev[`german_${lw}`] || prev[lw];
          if (ex?.definition && ex.definition.trim() !== "") {
            effectiveItem.definition = ex.definition.trim();
            break;
          }
        }
      }

      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`.toLowerCase();
        markWordLocallyMutated(targetLangKey);
        markWordLocallyMutated(linkedWord);
        const existing = prev[targetLangKey] || prev[`english_${linkedWord}`] || prev[`spanish_${linkedWord}`] || prev[`french_${linkedWord}`] || prev[`german_${linkedWord}`] || prev[linkedWord];

        const updatedVocabItem: VocabItem = buildVocabItem(effectiveItem, linkedWord, existing);

        // Clean up legacy non-prefixed key or case variations from local state
        Object.keys(nextVocab).forEach((k) => {
          const kLower = k.trim().toLowerCase();
          if (kLower === linkedWord.toLowerCase() && k !== targetLangKey) {
            delete nextVocab[k];
          }
        });

        nextVocab[targetLangKey] = updatedVocabItem;
      });

      vocabRef.current = nextVocab;

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextVocab, wordLinks).catch((err) =>
          console.error("Failed to sync saved word with server:", err)
        );
      }

      return nextVocab;
    });
  };

  const handleSaveVocabItems = (newVocabItems: VocabItem[], lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();

    setVocab((prev) => {
      const nextVocab = { ...prev };
      const keysToDelete: string[] = [];
      const cloudPromises: Promise<any>[] = [];

      // Build a lookup map of lowercase keys to original keys to avoid O(N^2) search
      const keyLookup = new Map<string, string[]>();
      Object.keys(nextVocab).forEach((k) => {
        const kLower = k.trim().toLowerCase();
        if (!keyLookup.has(kLower)) {
          keyLookup.set(kLower, []);
        }
        keyLookup.get(kLower)!.push(k);
      });

      newVocabItems.forEach((newVocabItem) => {
        if (!newVocabItem || !newVocabItem.word) return;
        const cleanWord = newVocabItem.word.replace(/^[a-zA-Z]+_/, "").toLowerCase();
        const linkedWords = getLinkedWordsFor(cleanWord, activeLang);

        // Inherit existing family definition ONLY if this update didn't specify one and wasn't explicitly cleared ("")
        let effectiveItem = { ...newVocabItem };
        if (effectiveItem.definition === undefined) {
          for (const lw of linkedWords) {
            if (lw === cleanWord) continue;
            const k = `${activeLang}_${lw}`;
            const ex = prev[k] || prev[`english_${lw}`] || prev[`spanish_${lw}`] || prev[`french_${lw}`] || prev[`german_${lw}`] || prev[lw];
            if (ex?.definition && ex.definition.trim() !== "") {
              effectiveItem.definition = ex.definition.trim();
              break;
            }
          }
        }

        linkedWords.forEach((linkedWord) => {
          const targetLangKey = `${activeLang}_${linkedWord}`;
          const existing = prev[targetLangKey] || prev[`english_${linkedWord}`] || prev[`spanish_${linkedWord}`] || prev[`french_${linkedWord}`] || prev[`german_${linkedWord}`] || prev[linkedWord];

          const updatedVocabItem: VocabItem = buildVocabItem(effectiveItem, linkedWord, existing);

          // Clean up legacy non-prefixed key or case variations from local state
          const targetLower = linkedWord.toLowerCase();
          const legacyKeys = keyLookup.get(targetLower) || [];
          legacyKeys.forEach((k) => {
            if (k !== targetLangKey) {
              keysToDelete.push(k);
              delete nextVocab[k];
            }
          });

          markWordLocallyMutated(targetLangKey);
          nextVocab[targetLangKey] = updatedVocabItem;

          // Update lookup map with the new key so subsequent checks in the same batch are accurate
          const newKeyLower = targetLangKey.toLowerCase();
          if (!keyLookup.has(newKeyLower)) {
            keyLookup.set(newKeyLower, []);
          }
          const list = keyLookup.get(newKeyLower)!;
          if (!list.includes(targetLangKey)) {
            list.push(targetLangKey);
          }
        });
      });

      vocabRef.current = nextVocab;

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextVocab, wordLinks).catch((err) =>
          console.error("Failed to sync saved word with server:", err)
        );
      }

      return nextVocab;
    });
  };

  const handleDeleteVocabItem = (word: string, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    if (!word || !word.trim()) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanWord = word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
    if (!cleanWord) return;

    setVocab((prev) => {
      const copy = { ...prev };
      const keysToDrop = new Set<string>();

      // Only delete this specific word's keys, NOT all linked/pattern words
      keysToDrop.add(`${activeLang}_${cleanWord}`);
      keysToDrop.add(cleanWord);

      // Also check for any casing variants in the existing keys
      Object.keys(copy).forEach((k) => {
        if (!k || !k.trim()) return;
        const kLower = k.trim().toLowerCase();
        if (kLower === `${activeLang}_${cleanWord}` || kLower === cleanWord) {
          keysToDrop.add(k);
        }
      });

      const cleanKeys = Array.from(keysToDrop)
        .filter(k => k && k.trim() !== "");
      const uniqueCleanKeys = Array.from(new Set(cleanKeys));

      uniqueCleanKeys.forEach((k) => {
        markWordLocallyMutated(k);
        delete copy[k];
      });

      vocabRef.current = copy;

      if (uniqueCleanKeys.length > 0 && storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, copy, wordLinks, listeningSeconds, languageFlags, historyRef.current, undefined, readerSettings, pinnedLanguages, hiddenLanguages, selectedTargetLanguage, uniqueCleanKeys).catch((err) => console.error(err));
      }

      return copy;
    });
  };

  const handleRenameVocabItem = (oldWord: string, newVocabItem: VocabItem, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    if (!oldWord || !oldWord.trim()) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanOldWord = oldWord.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
    const cleanNewWord = newVocabItem.word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");

    if (cleanOldWord === cleanNewWord) {
      // It's just an update of metadata (translation, grammar, etc.) on the same word
      handleSaveVocabItem(newVocabItem, lang);
      return;
    }

    const linkedOldWords = getLinkedWordsFor(cleanOldWord, activeLang);

    setVocab((prev) => {
      const copy = { ...prev };
      const allKeysToDrop = new Set<string>();

      linkedOldWords.forEach((linkedWord) => {
        if (!linkedWord || !linkedWord.trim()) return;
        const targetLangKey = `${activeLang}_${linkedWord.trim()}`.toLowerCase();
        const plainWord = linkedWord.trim().toLowerCase();

        allKeysToDrop.add(targetLangKey);
        allKeysToDrop.add(plainWord);
        allKeysToDrop.add(oldWord.trim());

        Object.keys(copy).forEach((k) => {
          if (!k || !k.trim()) return;
          const kLower = k.trim().toLowerCase();
          if (kLower === targetLangKey || kLower === plainWord || kLower === oldWord.trim().toLowerCase()) {
            allKeysToDrop.add(k);
          }
        });
      });

      const cleanKeys = Array.from(allKeysToDrop)
        .filter((k) => k && k.trim() !== "")
        .flatMap((k) => [k, k.toLowerCase(), k.toUpperCase()]);
      const uniqueDropKeys = Array.from(new Set(cleanKeys));

      // Synchronously delete the old keys from local state
      uniqueDropKeys.forEach((k) => {
        delete copy[k];
      });

      // Synchronously insert the new key into the local state
      const targetLangKeyNew = `${activeLang}_${cleanNewWord}`;
      const updatedVocabItem: VocabItem = {
        ...newVocabItem,
        word: cleanNewWord,
        translation: newVocabItem.translation,
        ipa: newVocabItem.ipa || "",
        grammar: newVocabItem.grammar || "",
        contextRelation: newVocabItem.contextRelation || "",
        examples: newVocabItem.examples || [],
        createdAt: newVocabItem.createdAt || Date.now(),
        updatedAt: Date.now(),
        tags: newVocabItem.tags || [],
      };
      markWordLocallyMutated(targetLangKeyNew);
      uniqueDropKeys.forEach((k) => markWordLocallyMutated(k));
      copy[targetLangKeyNew] = updatedVocabItem;
      vocabRef.current = copy;

      // In server mode, sync the resulting local state to local_server_db
      if (uniqueDropKeys.length > 0 && storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, copy, wordLinks).catch((err) =>
          console.error("Failed to sync renamed word with server:", err)
        );
      }

      return copy;
    });
  };



  const handleAddLesson = (newL: Lesson, images?: Record<string, { dataUrl: string; width: string; height: string } | string>) => {
    lastLocalChangeTime.current = Date.now();
    const flatImagesMap: Record<string, string> = {};
    if (images) {
      for (const [id, img] of Object.entries(images)) {
        if (typeof img === "string") {
          flatImagesMap[id] = img;
        } else if (img && typeof (img as any).dataUrl === "string") {
          flatImagesMap[id] = (img as any).dataUrl;
        }
      }
    }
    const lessonWithDate: Lesson = {
      ...newL,
      createdAt: newL.createdAt || Date.now(),
      images: Object.keys(flatImagesMap).length > 0 ? flatImagesMap : (newL.images || undefined),
    };
    if (images && Object.keys(images).length > 0) {
      setLessonImages(lessonWithDate.id, images as any);
      setLessonImagesVersion((v) => v + 1);
    }
    let updatedLessons: Lesson[] = [];
    setLessons((prev) => {
      const exists = prev.some((l) => l.id === lessonWithDate.id);
      if (exists) {
        updatedLessons = prev.map((l) => (l.id === lessonWithDate.id ? { ...l, ...lessonWithDate } : l));
      } else {
        updatedLessons = [lessonWithDate, ...prev];
      }
      return updatedLessons;
    });
    // Instantly persist new lesson to IndexedDB cache
    lessonsStore.getItem<Lesson[]>("lessons").then((cached) => {
      const list = cached || lessons;
      const exists = list.some((l) => l.id === lessonWithDate.id);
      const nextList = exists ? list.map((l) => (l.id === lessonWithDate.id ? { ...l, ...lessonWithDate } : l)) : [lessonWithDate, ...list];
      lessonsStore.setItem("lessons", nextList).catch(() => {});
    }).catch(() => {});

    setActiveLessonId(lessonWithDate.id);
    setShowImportForm(false);
    if (lessonWithDate.targetLanguage) {
      const addedLangNorm = normalizeLanguage(lessonWithDate.targetLanguage);
      setHiddenLanguages((prev) => {
        const next = prev.filter((l) => l.toLowerCase() !== addedLangNorm.toLowerCase());
        if (next.length !== prev.length) {
          safeLocalStorageSetItem("vocab_clone_hidden_languages", JSON.stringify(next));
          settingsStore.setItem("vocab_clone_hidden_languages", JSON.stringify(next)).catch(() => {});
        }
        return next;
      });
    }
    if (storageMode === "server") {
      syncDataToLocalServer(updatedLessons.length > 0 ? updatedLessons : [lessonWithDate, ...lessons]).catch((err) => console.error(err));
    }
  };

  const handleDetectIdioms = async () => {
    if (!activeLesson) return;
    setIsDetectingIdioms(true);
    try {
      const response = await fetch("/api/detect-idioms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: activeLesson.text,
          targetLanguage: activeLesson.targetLanguage,
          translationLanguage: activeLesson.translationLanguage || "Russian",
          aiProvider: readerSettings.aiProvider || "gemini",
          localAiUrl: readerSettings.localAiUrl || "http://localhost:11434/api/generate",
          localAiModel: readerSettings.localAiModel || "phi3.5",
        })
      });
      if (!response.ok) {
        let errMsg = "Failed to detect idioms from server";
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      if (data.detectedPhrases) {
        lastLocalChangeTime.current = Date.now();
        const updatedLesson = {
          ...activeLesson,
          detectedPhrases: data.detectedPhrases
        };
        setActiveLesson(updatedLesson);
        setLessons((prev) => {
          const next = prev.map((l) => (l.id === activeLesson.id ? updatedLesson : l));
          lessonsStore.setItem("lessons", next);
          return next;
        });
        if (storageMode === "server") {
          syncDataToLocalServer(
            lessons.map((l) => (l.id === activeLesson.id ? updatedLesson : l))
          ).catch((err) => console.error(err));
        }
      }
    } catch (e: any) {
      console.error(e);
      showToast(t('app.idioms_error', "Ошибка при распознавании идиом: ") + (e.message || String(e)), "error");
    } finally {
      setIsDetectingIdioms(false);
    }
  };

  const [isLemmatizingText, setIsLemmatizingText] = useState(false);

  const handleAiLemmatizeText = async () => {
    if (!activeLesson) return;
    setIsLemmatizingText(true);
    try {
      const response = await fetch("/api/lemmatize-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: activeLesson.text,
          targetLanguage: activeLesson.targetLanguage,
          aiProvider: readerSettings.aiProvider || "gemini",
          localAiUrl: readerSettings.localAiUrl || "http://localhost:11434/api/generate",
          localAiModel: readerSettings.localAiModel || "phi3.5",
        })
      });
      if (!response.ok) {
        let errMsg = "Failed to lemmatize text with AI";
        try {
          const errData = await response.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      if (data.lemmas) {
        lastLocalChangeTime.current = Date.now();
        const updatedLesson = {
          ...activeLesson,
          text_lemmas: {
            ...(activeLesson.text_lemmas || {}),
            ...data.lemmas
          }
        };

        const langLower = activeLesson.targetLanguage.toLowerCase();
        const newLinks = { ...wordLinks };
        Object.entries(data.lemmas).forEach(([child, parent]) => {
          if (child && parent && typeof parent === "string") {
            const key = `${langLower}_${child.toLowerCase()}`;
            const targetKey = `${langLower}_${parent.toLowerCase()}`;
            newLinks[key] = targetKey;
          }
        });
        setWordLinks(newLinks);
        vocabStore.setItem("aliases", newLinks);

        setActiveLesson(updatedLesson);
        setLessons((prev) => {
          const next = prev.map((l) => (l.id === activeLesson.id ? updatedLesson : l));
          lessonsStore.setItem("lessons", next);
          return next;
        });
        if (storageMode === "server") {
          syncDataToLocalServer(
            lessons.map((l) => (l.id === activeLesson.id ? updatedLesson : l))
          ).catch((err) => console.error(err));
        }
        showToast(t('app.lemmatize_success', "✓ AI предразбор лемм завершён успешно!"), "success");
      }
    } catch (e: any) {
      console.error("AI Lemmatize Text failed:", e);
      showToast(t('app.lemmatize_error', "Ошибка предразбора лемм: ") + (e.message || String(e)), "error");
    } finally {
      setIsLemmatizingText(false);
    }
  };



  const handleDeleteLesson = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    lastLocalChangeTime.current = Date.now();
    removeLessonImages(idToDelete);
    setLessonImagesVersion((v) => v + 1);
    const remaining = lessons.filter((l) => l.id !== idToDelete);
    setLessons(remaining);
    lessonsStore.setItem("lessons", remaining);
    safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(remaining));
    safeLocalStorageSetItem("vocab_clone_user_deleted_lessons", "true");

    // Switch active lesson if necessary
    if (activeLessonId === idToDelete && remaining.length > 0) {
      setActiveLessonId(remaining[0].id);
    }
    // Immediately sync to local server so the polling interval doesn't restore the deleted lesson
    if (storageMode === "server") {
      syncDataToLocalServer(remaining, lessonTypesRef.current, vocabRef.current, wordLinksRef.current, listeningSecondsRef.current, languageFlagsRef.current, historyRef.current, [idToDelete]).catch((err) => console.error(err));
    }
  };

  const handleToggleArchiveLesson = (idToToggle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    lastLocalChangeTime.current = Date.now();
    let nextIsArchived = false;
    let next: Lesson[] = [];
    setLessons((prev) => {
      next = prev.map((l) => {
        if (l.id === idToToggle) {
          nextIsArchived = !l.isArchived;
          return {
            ...l,
            isArchived: nextIsArchived,
          };
        }
        return l;
      });
      return next;
    });

    // 1. Optimistically lock in useLessonStore & invoke server endpoint
    useLessonStore.getState().archiveLesson(idToToggle, nextIsArchived).catch(() => {});

    lessonsRef.current = next;
    lessonsStore.setItem("lessons", next).catch(() => {});
    safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(next));

    if (storageMode === "server") {
      syncDataToLocalServer(next).catch((err) => console.error(err));
    }
  };

  const handleTogglePinLesson = (idToToggle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    lastLocalChangeTime.current = Date.now();
    let next: Lesson[] = [];
    setLessons((prev) => {
      next = prev.map((l) => {
        if (l.id === idToToggle) {
          return {
            ...l,
            pinned: !l.pinned,
          };
        }
        return l;
      });
      return next;
    });

    lessonsRef.current = next;
    lessonsStore.setItem("lessons", next).catch(() => {});
    safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(next));

    if (storageMode === "server") {
      syncDataToLocalServer(next).catch((err) => console.error(err));
    }
  };

  const handleAddPlaylist = (newPlaylist: Playlist) => {
    lastLocalChangeTime.current = Date.now();
    const next = [newPlaylist, ...playlists.filter(p => p.id !== newPlaylist.id)];
    setPlaylists(next);
    playlistsRef.current = next;
    playlistsStore.setItem(newPlaylist.id, newPlaylist).catch(() => {});
    if (storageMode === "server") {
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypes,
        vocabRef.current,
        wordLinksRef.current,
        listeningSeconds,
        languageFlags,
        historyRef.current,
        undefined,
        readerSettings,
        pinnedLanguages,
        hiddenLanguages,
        selectedTargetLanguage,
        undefined,
        next
      ).catch((err) => console.error(err));
    }
  };

  const handleUpdatePlaylist = (updatedPlaylist: Playlist) => {
    lastLocalChangeTime.current = Date.now();
    const exists = playlists.some(p => p.id === updatedPlaylist.id);
    const next = exists
      ? playlists.map(p => p.id === updatedPlaylist.id ? updatedPlaylist : p)
      : [updatedPlaylist, ...playlists];
    setPlaylists(next);
    playlistsRef.current = next;
    playlistsStore.setItem(updatedPlaylist.id, updatedPlaylist).catch(() => {});
    if (storageMode === "server") {
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypes,
        vocabRef.current,
        wordLinksRef.current,
        listeningSeconds,
        languageFlags,
        historyRef.current,
        undefined,
        readerSettings,
        pinnedLanguages,
        hiddenLanguages,
        selectedTargetLanguage,
        undefined,
        next
      ).catch((err) => console.error(err));
    }
  };

  const handleDeletePlaylist = (playlistId: string) => {
    lastLocalChangeTime.current = Date.now();
    const next = playlists.filter(p => p.id !== playlistId);
    setPlaylists(next);
    playlistsRef.current = next;
    playlistsStore.removeItem(playlistId).catch(() => {});
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
    }
    if (storageMode === "server") {
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypes,
        vocabRef.current,
        wordLinksRef.current,
        listeningSeconds,
        languageFlags,
        historyRef.current,
        undefined,
        readerSettings,
        pinnedLanguages,
        hiddenLanguages,
        selectedTargetLanguage,
        undefined,
        next,
        [playlistId]
      ).catch((err) => console.error(err));
    }
  };

  const handleToggleArchivePlaylist = (playlistId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    lastLocalChangeTime.current = Date.now();
    let isNowArchived = false;
    const next = playlists.map((p) => {
      if (p.id === playlistId) {
        isNowArchived = !p.isArchived;
        const updated = {
          ...p,
          isArchived: !p.isArchived,
          updatedAt: new Date().toISOString(),
        };
        playlistsStore.setItem(p.id, updated).catch(() => {});
        return updated;
      }
      return p;
    });
    setPlaylists(next);
    playlistsRef.current = next;
    showToast(
      isNowArchived
        ? t("library.archived_toast", "Moved to archive")
        : t("library.unarchived_toast", "Restored from archive"),
      "info"
    );
    if (storageMode === "server") {
      syncDataToLocalServer(
        lessonsRef.current,
        lessonTypes,
        vocabRef.current,
        wordLinksRef.current,
        listeningSeconds,
        languageFlags,
        historyRef.current,
        undefined,
        readerSettings,
        pinnedLanguages,
        hiddenLanguages,
        selectedTargetLanguage,
        undefined,
        next
      ).catch((err) => console.error(err));
    }
  };

  // Sync audiourl uploads or base64 generated state
  const handleAudioUploaded = (audioUrl: string, base64: string | null) => {
    lastLocalChangeTime.current = Date.now();
    setLessons((prev) => {
      const next = prev.map((l) => {
        if (l.id === activeLessonId) {
          const updated = {
            ...l,
            audioUrl,
            audioBase64: audioUrl === "" ? null : (base64 || l.audioBase64),
          };
          return updated;
        }
        return l;
      });
      if (storageMode === "server") {
        syncDataToLocalServer(next).catch((err) => console.error(err));
      }
      return next;
    });
  };

  const lastTickWallTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const handleMediaPlayStart = () => {
      lastTickWallTimeRef.current = performance.now();
    };
    window.addEventListener("media-play-start", handleMediaPlayStart);
    return () => {
      window.removeEventListener("media-play-start", handleMediaPlayStart);
    };
  }, []);

  const handleListeningTick = (
    seconds: number,
    sourceOrForceFlush: "global" | "local" | boolean = "local",
    forceFlushOrExactTime: boolean | number = false,
    exactTime?: number
  ) => {
    const source = typeof sourceOrForceFlush === "string" ? sourceOrForceFlush : "local";
    const forceFlush = typeof sourceOrForceFlush === "boolean" ? sourceOrForceFlush : Boolean(forceFlushOrExactTime);
    const resolvedExactTime = typeof sourceOrForceFlush === "boolean" && typeof forceFlushOrExactTime === "number"
      ? forceFlushOrExactTime
      : exactTime;

    if (seconds <= 0 && !forceFlush) return;

    const effectiveSeconds = seconds > 0 ? Math.min(seconds, 7200.0) : 0;
    const currentPos = resolvedExactTime !== undefined ? resolvedExactTime : getActiveMediaCurrentTime();

    if (effectiveSeconds > 0) {
      setListeningSeconds((prev) => {
        const nextVal = Math.round((prev + effectiveSeconds) * 10) / 10;
        safeLocalStorageSetItem("vocab_clone_listening", nextVal.toString());
        settingsStore.setItem("vocab_clone_listening", nextVal.toString());
        return nextVal;
      });
    }

    // 1. Strict Target Resolution:
    // Global Podcast Player ONLY logs to currentTrack
    // Reader / YouTube / Local player ONLY logs to activeLesson
    let itemToLog: any = null;
    let isGlobalTrack = false;

    if (source === "global") {
      const { queue, currentIndex } = usePlaylistStore.getState();
      const currentTrack = queue[currentIndex];
      if (currentTrack) {
        // Check if this track corresponds to an imported lesson in the library
        const matchingLesson = lessonsRef.current.find(
          (l) =>
            l.id === currentTrack.id ||
            (currentTrack.guid && (l.id === currentTrack.guid || (l as any).podcastGuid === currentTrack.guid)) ||
            (l.title && currentTrack.title && l.title.trim().toLowerCase() === currentTrack.title.trim().toLowerCase())
        );
        if (matchingLesson) {
          itemToLog = matchingLesson;
          isGlobalTrack = false;
        } else {
          itemToLog = currentTrack;
          isGlobalTrack = true;
        }
      }
    } else {
      const foundLesson = activeLesson || (activeLessonId ? lessonsRef.current.find(l => l.id === activeLessonId) : null);
      if (foundLesson) {
        itemToLog = foundLesson;
      }
    }

    if (!itemToLog) {
      return;
    }

    if (currentPos !== undefined && currentPos >= 0 && itemToLog && itemToLog.id) {
      const targetId = itemToLog.id;
      const targetGuid = (itemToLog as any).guid;
      const progressSec = Math.floor(currentPos);
      setLessons((prev) => {
        let changed = false;
        const next = prev.map((l) => {
          if (l.id === targetId || (targetGuid && (l.id === targetGuid || (l as any).podcastGuid === targetGuid))) {
            if (l.audioProgress !== progressSec) {
              changed = true;
              return { ...l, audioProgress: progressSec };
            }
          }
          return l;
        });
        if (changed) {
          lessonsRef.current = next;
          lessonsStore.setItem("lessons", next).catch(() => {});
        }
        return changed ? next : prev;
      });
    }

    if (effectiveSeconds > 0 || (forceFlush && currentPos !== undefined && currentPos > 0)) {
      const deltaToRecord = effectiveSeconds;
      const pos = currentPos;
      
      if (isGlobalTrack) {
        const entryPayload = {
          id: itemToLog.guid || itemToLog.id,
          title: itemToLog.title,
          lessonType: itemToLog.lessonType || "podcast",
          coverUrl: itemToLog.coverUrl || null,
          targetLanguage: normalizeLanguage(itemToLog.targetLanguage || "es"),
          audioUrl: itemToLog.audioUrl,
          podcastTitle: itemToLog.podcastTitle || itemToLog.bookTitle || itemToLog.channelName || "Podcast",
          channelName: itemToLog.channelName || itemToLog.podcastTitle || itemToLog.bookTitle || null,
          guid: itemToLog.guid || itemToLog.id,
          lastPosition: pos,
        };
        recordHistoryActivity(entryPayload, "listen", deltaToRecord, pos, forceFlush);
      } else {
        recordHistoryActivity(itemToLog, "listen", deltaToRecord, pos, forceFlush);
      }
    }
  };

  const handleMediaEnded = (targetLesson: Lesson) => {
    if (!targetLesson || !targetLesson.id) return;
    safeLocalStorageSetItem(`vocab_progress_${targetLesson.id}`, "100");
    setLessons((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (l.id === targetLesson.id) {
          changed = true;
          return { ...l, audioProgress: 0 };
        }
        return l;
      });
      if (changed) {
        lessonsRef.current = next;
        lessonsStore.setItem("lessons", next).catch(() => {});
      }
      return changed ? next : prev;
    });
    recordHistoryActivity(targetLesson, "complete");
  };

  // Clean up listening buffer on unmount
  useEffect(() => {
    return () => {
      // Immediate Flush on Component Unmount: so no timers linger in the background
      if (listeningBufferRef.current > 0) {
        handleListeningTick(listeningBufferRef.current, "local", true);
        listeningBufferRef.current = 0;
      }
    };
  }, []);

  // Global application layout container class (for Library, History, Podcasts, Statistics, Practice, Header)
  const activeInterfaceMaxWidth = interfaceMaxWidth || layoutWidthMode || "full";
  const globalLayoutClass =
    activeInterfaceMaxWidth === "wide"
      ? "max-w-[1560px]"
      : activeInterfaceMaxWidth === "standard"
      ? "max-w-7xl"
      : "max-w-[1920px] w-full px-4 sm:px-6 lg:px-8";
  const layoutContainerClass = globalLayoutClass;

  const handleExitFocusMode = useCallback(() => {
    if (activeLesson) {
      try {
        sessionStorage.setItem(`dismissed_focus_${activeLesson.id}`, "true");
      } catch (_) {}
    }
    setIsFocusMode(false);
  }, [activeLesson, setIsFocusMode]);

  const isBookLesson = checkIsBookLesson(activeLesson);
  const isBookFocusMode = isBookLesson && (bookReaderView === "focus" || bookDisplayMode === "book");
  const isImmersiveBook = activeTab === "read" && !!activeLesson && isBookFocusMode;

  const currentReaderTheme = (activeTab === "read" && activeLesson)
    ? (readerThemes[readerSettings.readerTheme] || readerThemes.default)
    : readerThemes.default;

  if (!isAppLoaded) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-stone-50 dark:bg-zinc-950 font-sans text-zinc-800 dark:text-zinc-100 transition-colors duration-300 relative overflow-hidden">
        {/* Background glow circle */}
        <div className="absolute w-[450px] h-[450px] bg-teal-500/10 dark:bg-teal-500/15 rounded-full blur-3xl animate-pulse pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center space-y-6">
          {/* Logo Badge */}
          <div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-br from-teal-500 to-teal-700 text-white rounded-3xl shadow-xl shadow-teal-500/20 transform hover:scale-105 transition-transform duration-300">
            <Languages className="w-10 h-10 animate-bounce" />
            <div className="absolute inset-0 rounded-3xl ring-1 ring-white/30" />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              Lectura
            </h1>
          </div>

          {/* Loading bar & spinner */}
          <div className="w-full space-y-2 pt-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                {t('app.loading', 'Loading materials...')}
              </span>
              <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400">IndexedDB</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full w-2/3 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${currentReaderTheme.pageBg} ${currentReaderTheme.text} flex flex-col font-sans transition-colors duration-200 overflow-x-clip w-full max-w-[100vw]`}>
      
      <AppSidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showImportForm={showImportForm}
        setShowImportForm={setShowImportForm}
        activeLesson={activeLesson}
        setIsFocusMode={setIsFocusMode}
        setShowSettingsModal={setShowSettingsModal}
        activeUser={activeUser}
        setShowLocalLoginModal={setShowLocalLoginModal}
        currentReaderTheme={currentReaderTheme}
      />

      {/* Top Header HUD */}
      <AppHeader
        isFocusMode={isFocusMode || isImmersiveBook}
        activeTab={activeTab}
        readerSettings={readerSettings}
        onUpdateReaderSettings={updateSettingsAndSync}
        currentReaderTheme={currentReaderTheme}
        layoutContainerClass={layoutContainerClass}
        setIsSidebarOpen={setIsSidebarOpen}
        setActiveTab={setActiveTab}
        setShowImportForm={setShowImportForm}
        setSelectedWord={setSelectedWord}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        setShowLocalLoginModal={setShowLocalLoginModal}
        onOpenProfileSettings={() => setShowProfileModal(true)}
        storageMode={storageMode}
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        localSyncError={localSyncError}
        selectedTargetLanguage={selectedTargetLanguage}
        onSelectTargetLanguage={handleSelectTargetLanguage}
        availableTargetLanguages={availableTargetLanguages}
        languageFlags={languageFlags}
        onOpenManageLanguages={() => setIsManageLanguagesOpen(true)}
        lessonCountByLanguage={lessonCountByLanguage}
        onOpenBook={handleOpenWhisperBook}
        onManualSync={() => loadDataFromLocalServer()}
        activeLessonType={activeLesson ? (isBookLesson ? "book" : activeLesson.lessonType) : undefined}
      />

      {/* ── Focus Mode Sticky Header / Video Zone (Mobile / Tablet Only < 1024px) ── */}
      {isFocusMode && activeTab === "read" && activeLesson && isMobileTablet && activeLesson.lessonType !== "book" && (
        <>
          {/* Pinned YouTube Player sticky at top */}
          {activeLesson.youtubeId && showYoutubePlayer ? (
            <FocusPinnedPlayer
              lesson={activeLesson}
              onClose={() => setShowYoutubePlayer(false)}
              onExitFocus={handleExitFocusMode}
              onBackToLibrary={() => {
                setIsFocusMode(false);
                setActiveTab("library");
                setSelectedWord(null);
              }}
              onListeningTick={handleListeningTick}
              onVideoEnded={() => handleMediaEnded(activeLesson)}
            />
          ) : (
            /* Minimal Focus Bar if player is hidden or lesson has no YouTube */
            <div
              className={`sticky top-0 z-30 px-3 sm:px-6 py-2 border-b ${currentReaderTheme.border} ${currentReaderTheme.headerBg} backdrop-blur-md flex items-center justify-between gap-2 shadow-xs`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => {
                    setIsFocusMode(false);
                    setActiveTab("library");
                    setSelectedWord(null);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 h-8 border ${currentReaderTheme.border} ${currentReaderTheme.cardBg} hover:opacity-90 font-bold text-xs rounded-xl transition-all active:scale-97 cursor-pointer shadow-3xs`}
                  title={t("reader.library_btn", "Библиотека")}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("reader.library_btn", "Библиотека")}</span>
                </button>

                <button
                  id="focus-exit-btn"
                  onClick={handleExitFocusMode}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 h-8 border ${currentReaderTheme.border} ${currentReaderTheme.cardBg} hover:opacity-90 font-bold text-xs rounded-xl transition-all active:scale-97 cursor-pointer shadow-3xs`}
                  title={t("app.focus_exit", "Выйти из фокуса")}
                >
                  <span>← {t("app.focus_exit", "Выйти из фокуса")}</span>
                </button>

                <span className="text-xs font-semibold text-zinc-500 truncate max-w-[140px] sm:max-w-xs">
                  {activeLesson.title}
                </span>
              </div>

              {activeLesson.youtubeId && (
                <button
                  onClick={() => setShowYoutubePlayer(true)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 h-8 border rounded-xl font-bold text-xs transition-all active:scale-97 cursor-pointer shadow-3xs bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50"
                  title={t("reader.video_btn_title", "Показать видео")}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>{t("reader.video_btn", "Видео")}</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Main Body */}
      <main 
        className={`flex-grow w-full mx-auto ${
          isImmersiveBook ? "p-0 lg:p-4" : activeTab === "read" ? "p-0 lg:p-6" : "p-4 sm:p-6 space-y-6"
        } transition-all duration-300 ${
          activeTab === "read" ? "max-w-full" : layoutContainerClass
        } ${hasActiveQueue ? "pb-36 sm:pb-32" : ""}`}
        style={hasActiveQueue ? { paddingBottom: "max(8rem, calc(6rem + env(safe-area-inset-bottom)))" } : undefined}
      >
        
        {/* Dynamic Achievements HUD Panel */}
        {activeTab !== "read" && activeTab !== "practice" && activeTab !== "history" && activeTab !== "library" && activeTab !== "podcasts" && activeTab !== "statistics" && (
          <StatsWidget stats={calculatedStats} />
        )}

        {showImportForm || editingLesson ? (
          /* Import customized forms screen */
          <div className="py-2">
            <ImportLessonForm
              editingLesson={editingLesson}
              playlists={playlists}
              lessons={lessons}
              onAddPlaylist={handleAddPlaylist}
              onUpdatePlaylist={handleUpdatePlaylist}
              lessonTypes={lessonTypes}
              onCreateLessonType={handleCreateLessonType}
              onDeleteLessonType={handleDeleteLessonType}
              onUpdateLessonType={handleUpdateLessonType}
              initialWebUrl={initialImportUrl}
              defaultTargetLanguage={selectedTargetLanguage}
              onAddLesson={(newOrUpdated, images) => {
                lastLocalChangeTime.current = Date.now();
                if (editingLesson) {
                  const nextLessons = lessons.map((l) => (l.id === editingLesson.id ? newOrUpdated : l));
                  setLessons(nextLessons);
                  setHistory((prev) => {
                    const updatedHist = prev.map((h) => {
                      if (h.lessonId === editingLesson.id) {
                        return {
                          ...h,
                          lessonTitle: newOrUpdated.title,
                          channelName: newOrUpdated.channelName || null,
                          channelAvatarUrl: newOrUpdated.channelAvatarUrl || null,
                        };
                      }
                      return h;
                    });
                    safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(updatedHist));
                    settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(updatedHist)).catch(() => {});
                    return updatedHist;
                  });
                  if (storageMode === "server") {
                    syncDataToLocalServer(nextLessons).catch((err) => console.error(err));
                  }
                  setEditingLesson(null);
                } else {
                  handleAddLesson(newOrUpdated, images);
                }
                setShowImportForm(false);
                setInitialImportUrl(null);
              }}
              onCancel={() => {
                setShowImportForm(false);
                setEditingLesson(null);
                setInitialImportUrl(null);
              }}
              settings={readerSettings}
            />
          </div>
        ) : activeTab === "library" && selectedPlaylistId && playlists.find(p => p.id === selectedPlaylistId) ? (
          /* Playlist Detail View Screen */
          <div className="py-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <PlaylistDetailView
              playlist={playlists.find(p => p.id === selectedPlaylistId)!}
              lessons={lessons}
              history={history}
              onBack={() => setSelectedPlaylistId(null)}
              onOpenLesson={(id) => {
                setSelectedPlaylistId(null);
                setActiveLessonId(id);
                setSelectedWord(null);
                setActiveTab("read");
                safeLocalStorageSetItem("vocab_clone_last_active_lesson_id", id);
                try {
                  const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
                  const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
                  const headers: Record<string, string> = { "Content-Type": "application/json" };
                  if (token) headers["Authorization"] = `Bearer ${token}`;
                  if (syncKey) headers["x-sync-key"] = syncKey;
                  fetch(resolveApiUrl("/api/user-metadata"), { method: "PUT", headers, body: JSON.stringify({ lastActiveLessonId: id }) }).catch(() => {});
                } catch (_) {}
              }}
              onSelectLesson={(id) => {
                setSelectedPlaylistId(null);
                setActiveLessonId(id);
                setSelectedWord(null);
                setActiveTab("read");
                safeLocalStorageSetItem("vocab_clone_last_active_lesson_id", id);
                try {
                  const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
                  const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
                  const headers: Record<string, string> = { "Content-Type": "application/json" };
                  if (token) headers["Authorization"] = `Bearer ${token}`;
                  if (syncKey) headers["x-sync-key"] = syncKey;
                  fetch(resolveApiUrl("/api/user-metadata"), { method: "PUT", headers, body: JSON.stringify({ lastActiveLessonId: id }) }).catch(() => {});
                } catch (_) {}
              }}
              onPlayQueue={(items, startIndex) => {
                usePlaylistStore.getState().setQueue(items, startIndex, true);
              }}
              onUpdatePlaylist={handleUpdatePlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onToggleArchive={handleToggleArchivePlaylist}
              onAddOrUpdateLesson={(newLesson) => {
                handleAddLesson(newLesson);
              }}
              onAddLessonToLibrary={(newLesson) => {
                handleAddLesson(newLesson);
              }}
              vocab={vocab}
              wordLinks={wordLinks}
              languageFlags={languageFlags}
              settings={readerSettings}
            />
          </div>
        ) : activeTab === "library" ? (
          /* Beautiful visual library homepage */
          <div className="py-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <LibraryHome
              lessons={lessons}
              playlists={playlists}
              onSelectPlaylist={(id) => setSelectedPlaylistId(id)}
              onDeletePlaylist={(id, e) => {
                e.stopPropagation();
                handleDeletePlaylist(id);
              }}
              onToggleArchivePlaylist={(id, e) => {
                if (e) e.stopPropagation();
                handleToggleArchivePlaylist(id, e);
              }}
              onUpdatePlaylist={handleUpdatePlaylist}
              onAddPlaylist={handleAddPlaylist}
              onAddOrUpdateLesson={(newLesson) => {
                handleAddLesson(newLesson);
              }}
              lessonTypes={lessonTypes}
              onSelectLesson={(id) => {
                setActiveLessonId(id);
                setSelectedWord(null);
                setActiveTab("read");
                safeLocalStorageSetItem("vocab_clone_last_active_lesson_id", id);
                try {
                  const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
                  const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
                  const headers: Record<string, string> = { "Content-Type": "application/json" };
                  if (token) headers["Authorization"] = `Bearer ${token}`;
                  if (syncKey) headers["x-sync-key"] = syncKey;
                  fetch(resolveApiUrl("/api/user-metadata"), { method: "PUT", headers, body: JSON.stringify({ lastActiveLessonId: id }) }).catch(() => {});
                } catch (_) {}
              }}
              onOpenImportForm={() => setShowImportForm(true)}
              onDeleteLesson={handleDeleteLesson}
              onToggleArchiveLesson={handleToggleArchiveLesson}
              onTogglePinLesson={handleTogglePinLesson}
              onEditLesson={(lesson) => setEditingLesson(lesson)}
              stats={calculatedStats}
              vocab={vocab}
              wordLinks={wordLinks}
              languageFlags={languageFlags}
              history={history}
              selectedTargetLanguage={selectedTargetLanguage}
              onSelectTargetLanguage={handleSelectTargetLanguage}
              settings={readerSettings}
              onUpdateSettings={updateSettingsAndSync}
              isLoading={isInitialServerLoading && lessons.length === 0}
            />
          </div>
        ) : activeTab === "statistics" ? (
          /* Statistics Dashboard */
          <div className="py-2 animate-in fade-in duration-150">
            <StatisticsPage
              vocab={vocab}
              lessons={lessons}
              listeningSeconds={listeningSeconds}
              onUpdateStatus={handleUpdateStatusDirect}
              onDeleteVocab={handleDeleteVocabItem}
              onDeleteMultipleVocabs={handleDeleteMultipleVocabItems}
              onSaveVocab={handleSaveVocabItem}
              onSaveMultipleVocabs={handleSaveVocabItems}
              onRenameVocab={handleRenameVocabItem}
              wordLinks={wordLinks}
              onSaveWordLink={handleSaveWordLink}
              onDeleteWordLink={handleDeleteWordLink}
              onOpenLesson={handleOpenLesson}
              readerSettings={readerSettings}
              onUpdateSettings={updateSettingsAndSync}
            />
          </div>
        ) : activeTab === "practice" ? (
          /* Study vocab tab */
          <div className="py-6">
            <VocabularyPractice
              vocab={vocab}
              wordLinks={wordLinks}
              onUpdateStatus={handleUpdateStatusDirect}
              defaultLanguage={activeLesson?.targetLanguage || "Spanish"}
              onAddLesson={handleAddLesson}
              onSelectTab={setActiveTab}
              settings={readerSettings}
              onSaveVocab={handleSaveVocabItem}
              onDeleteVocab={handleDeleteVocabItem}
              onSaveWordLink={handleSaveWordLink}
              onDeleteWordLink={handleDeleteWordLink}
              lessons={lessons}
            />
          </div>
        ) : activeTab === "history" ? (
          /* History Page */
          <div className="py-2 animate-in fade-in duration-150">
            <HistoryPage
              history={history}
              lessons={lessons}
              onOpenLesson={(lessonId) => {
                setActiveLessonId(lessonId);
                setSelectedWord(null);
                setActiveTab("read");
              }}
              onUpdateHistory={handleUpdateHistory}
              onUpdateLessons={(updated) => {
                setLessons(updated);
                if (storageMode === "server") {
                  syncDataToLocalServer(updated).catch((err) => console.error(err));
                }
              }}
              readerSettings={readerSettings}
              onUpdateSettings={updateSettingsAndSync}
            />
          </div>
        ) : activeTab === "podcasts" ? (
          /* Podcasts Section */
          <div className="animate-in fade-in duration-150 h-full">
            <PodcastsPage
              lessons={lessons}
              history={history}
              selectedTargetLanguage={selectedTargetLanguage}
              onOpenLesson={handleOpenWhisperBook}
              onToggleCompleteLesson={(lessonId) => {
                const target = lessons.find(l => l.id === lessonId);
                if (target) {
                  recordHistoryActivity(target, "complete");
                }
              }}
            />
          </div>
        ) : (
          /* Main Interactive Reader View Grid */
          <ReaderScreen
            activeLesson={activeLesson}
            activeLessonImagesMap={activeLessonImagesMap}
            readerSettings={readerSettings}
            setReaderSettings={updateSettingsAndSync}
            handleAudioUploaded={handleAudioUploaded}
            handleListeningTick={handleListeningTick}
            handleMediaEnded={handleMediaEnded}
            setEditingLesson={setEditingLesson}
            history={history}
            handleUpdateHistory={handleUpdateHistory}
            selectedWord={selectedWord}
            setSelectedWord={setSelectedWord}
            selectedContext={selectedContext}
            activeVocabItem={activeVocabItem}
            wordLinks={wordLinks}
            vocab={vocab}
            handleSaveVocabItem={handleSaveVocabItem}
            onSaveMultipleVocabs={handleSaveVocabItems}
            handleDeleteVocabItem={handleDeleteVocabItem}
            handleSaveWordLink={handleSaveWordLink}
            handleDeleteWordLink={handleDeleteWordLink}
            handleWordClick={handleWordClick}
            handleOpenLesson={handleOpenLesson}
            lessons={lessons}
            currentReaderTheme={currentReaderTheme}
            handleDetectIdioms={handleDetectIdioms}
            isDetectingIdioms={isDetectingIdioms}
            handleAiLemmatizeText={handleAiLemmatizeText}
            isLemmatizingText={isLemmatizingText}
          />
        )}
      </main>

      {!isImmersiveBook && (
        <footer className={`py-6 border-t ${currentReaderTheme.border} text-center text-xs ${currentReaderTheme.text} opacity-50 ${currentReaderTheme.pageBg} transition-colors duration-200 ${activeTab === 'read' ? 'hidden lg:block' : ''}`}>
          <p className="leading-relaxed">
            {t('app.footer', 'Lectura {{version}} © 2026. Interactive system for reading and language learning.', { version: APP_VERSION })}
          </p>
        </footer>
      )}
      <MatchPairsModal
        isOpen={showMatchPairsModal}
        onClose={() => setShowMatchPairsModal(false)}
        bookWords={activeLessonWords}
        onUpdateStatus={handleUpdateStatusDirect}
        languageName={activeLesson?.targetLanguage}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        lessons={lessons}
        playlists={playlists}
        languageFlags={languageFlags}
        onSaveLanguageFlag={(lang, flag) => {
          const canonical = normalizeLanguage(lang).toLowerCase();
          const nextFlags = {
            ...languageFlags,
            [lang.toLowerCase()]: flag,
            [canonical]: flag,
          };
          setLanguageFlags(nextFlags);
          if (storageMode === "server") {
            syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, listeningSeconds, nextFlags).catch(err => console.error(err));
          }
        }}
        onResetLanguageFlags={() => {
          setLanguageFlags({});
          if (storageMode === "server") {
            syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, listeningSeconds, {}).catch(err => console.error(err));
          }
        }}
        wordLinks={wordLinks}
        onDeleteWordLink={handleDeleteWordLink}
        zoomScale={zoomScale}
        onZoomScaleChange={setZoomScale}
        layoutWidthMode={activeInterfaceMaxWidth}
        onLayoutWidthModeChange={setInterfaceMaxWidth}
        storageMode={storageMode}
        onStorageModeChange={setStorageMode}
        localSyncKey={localSyncKey}
        onLocalSyncKeyChange={setLocalSyncKey}
        localSyncError={localSyncError}
        activeUser={activeUser}
        onOpenAuthModal={() => setShowLocalLoginModal(true)}
        onLogout={async () => { await logout(); }}
        vocab={vocab}
        lessonTypes={lessonTypes}
        listeningSeconds={listeningSeconds}
        history={history}
        pinnedLanguages={pinnedLanguages}
        hiddenLanguages={hiddenLanguages}
        selectedTargetLanguage={selectedTargetLanguage}
        onListeningSecondsChange={(seconds) => {
          setListeningSeconds(seconds);
          safeLocalStorageSetItem("vocab_clone_listening", seconds.toString());
          settingsStore.setItem("vocab_clone_listening", seconds.toString());
          if (storageMode === "server") {
            syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, seconds, languageFlags).catch((err) => console.error(err));
          }
        }}
        onImportData={(imported: any) => {
          const importedVocab = imported.vocab || imported.words;
          const parsedVocab = importedVocab ? normalizeVocabRecord(importedVocab) : vocab;
          const parsedWordLinks = imported.wordLinks ? normalizeWordLinksRecord(imported.wordLinks) : wordLinks;
          const parsedLessons = imported.lessons || lessons;
          const parsedPlaylists = imported.playlists || playlists;
          const parsedLessonTypes = imported.lessonTypes || lessonTypes;
          const parsedListeningSeconds = imported.listeningSeconds !== undefined ? imported.listeningSeconds : listeningSeconds;
          const parsedLanguageFlags = imported.languageFlags || languageFlags;
          const parsedHistory = imported.history && Array.isArray(imported.history) ? dedupeHistory(imported.history) : history;
          const parsedReaderSettings = imported.readerSettings || readerSettings;
          const parsedPinnedLanguages = imported.pinnedLanguages || pinnedLanguages;
          const parsedHiddenLanguages = imported.hiddenLanguages || hiddenLanguages;
          const parsedSelectedTargetLanguage = imported.selectedTargetLanguage || selectedTargetLanguage;

          if (imported.lessons) {
            setLessons(imported.lessons);
          }
          if (imported.playlists && Array.isArray(imported.playlists)) {
            setPlaylists(imported.playlists);
            safeLocalStorageSetItem("vocab_clone_playlists", JSON.stringify(imported.playlists));
          }
          if (imported.lessonTypes) {
            setLessonTypes(imported.lessonTypes);
          }
          if (importedVocab) {
            setVocab(parsedVocab);
          }
          if (imported.wordLinks) {
            setWordLinks(parsedWordLinks);
          }
          if (imported.listeningSeconds !== undefined) {
            setListeningSeconds(imported.listeningSeconds);
          }
          if (imported.languageFlags) {
            setLanguageFlags(imported.languageFlags);
          }

          if (imported.history && Array.isArray(imported.history)) {
            setHistory(parsedHistory);
            historyRef.current = parsedHistory;
            safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(parsedHistory));
            settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(parsedHistory)).catch(() => {});
          }
          if (imported.readerSettings) {
            setReaderSettings(prev => ({ ...prev, ...imported.readerSettings }));
            safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(imported.readerSettings));
            settingsStore.setItem("vocab_clone_reader_settings", JSON.stringify(imported.readerSettings)).catch(() => {});
          }
          if (imported.pinnedLanguages) {
            setPinnedLanguages(imported.pinnedLanguages);
            safeLocalStorageSetItem("vocab_clone_pinned_languages", JSON.stringify(imported.pinnedLanguages));
            settingsStore.setItem("vocab_clone_pinned_languages", JSON.stringify(imported.pinnedLanguages)).catch(() => {});
          }
          if (imported.hiddenLanguages) {
            setHiddenLanguages(imported.hiddenLanguages);
            safeLocalStorageSetItem("vocab_clone_hidden_languages", JSON.stringify(imported.hiddenLanguages));
            settingsStore.setItem("vocab_clone_hidden_languages", JSON.stringify(imported.hiddenLanguages)).catch(() => {});
          }
          if (imported.selectedTargetLanguage) {
            setSelectedTargetLanguage(imported.selectedTargetLanguage);
            safeLocalStorageSetItem("vocab_global_target_language", imported.selectedTargetLanguage);
          }

          // Force update local storage instantly
          if (imported.lessons) safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(imported.lessons));
          if (imported.playlists) safeLocalStorageSetItem("vocab_clone_playlists", JSON.stringify(imported.playlists));
          if (imported.lessonTypes) safeLocalStorageSetItem("vocab_clone_lessontypes", JSON.stringify(imported.lessonTypes));
          if (importedVocab) vocabStore.setItem("words", parsedVocab).catch(() => {});
          if (imported.wordLinks) vocabStore.setItem("aliases", parsedWordLinks).catch(() => {});
          if (imported.listeningSeconds !== undefined) safeLocalStorageSetItem("vocab_clone_listening", imported.listeningSeconds.toString());
          if (imported.languageFlags) safeLocalStorageSetItem("vocab_clone_language_flags", JSON.stringify(imported.languageFlags));

          // Sync with server if in server mode (Local server DB sync)
          if (storageMode === "server") {
            lastLocalChangeTime.current = Date.now();
            syncDataToLocalServer(
              parsedLessons,
              parsedLessonTypes,
              parsedVocab,
              parsedWordLinks,
              parsedListeningSeconds,
              parsedLanguageFlags,
              parsedHistory,
              undefined,
              parsedReaderSettings,
              parsedPinnedLanguages,
              parsedHiddenLanguages,
              parsedSelectedTargetLanguage
            ).catch(err => console.error("Local server import sync error:", err));
          }
        }}
        onClearAllData={async () => {
          // Reset states to default
          setLessons(BUILT_IN_LESSONS);
          setLessonTypes(DEFAULT_LESSON_TYPES);
          setVocab({});
          setWordLinks({});
          setListeningSeconds(0);
          setLanguageFlags({});

          // Delete corresponding localStorage keys
          localStorage.removeItem("vocab_clone_lessons");
          localStorage.removeItem("vocab_clone_lessontypes");
          localStorage.removeItem("vocab_clone_words");
          localStorage.removeItem("vocab_clone_aliases");
          localStorage.removeItem("vocab_clone_listening");
          localStorage.removeItem("vocab_clone_language_flags");

          if (storageMode === "server") {
            try {
              setIsSyncing(true);
              const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
              const savedUserStr = localStorage.getItem("vocab_clone_local_user");
              const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;

              const deleteHeaders: Record<string, string> = {
                "x-local-sync-key": localSyncKey,
                "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default"
              };
              if (savedToken) {
                deleteHeaders["Authorization"] = `Bearer ${savedToken}`;
              }
              await fetch("/api/server-db", { 
                method: "DELETE",
                headers: deleteHeaders
              });
            } catch (err) {
              console.error("Failed to clear server-side database:", err);
            } finally {
              setIsSyncing(false);
            }
          }
        }}
        onClearHistory={() => {
          setHistory([]);
          historyRef.current = [];
          safeLocalStorageSetItem("vocab_clone_reading_history", "[]");
          settingsStore.setItem("vocab_clone_reading_history", "[]").catch(() => {});
          if (storageMode === "server") {
            syncDataToLocalServer(
              lessons,
              lessonTypes,
              vocab,
              wordLinks,
              listeningSeconds,
              languageFlags,
              [],
              undefined,
              readerSettings,
              pinnedLanguages,
              hiddenLanguages,
              selectedTargetLanguage
            ).catch(err => console.error("Error clearing history on server:", err));
          }
        }}
        isSyncing={isSyncing}
        settings={readerSettings}
        onSettingsChange={(patch) => {
          updateSettingsAndSync((prev) => ({ ...prev, ...patch }));
        }}
      />

      {/* Local/Guest Auth fallback Modal */}
      <AuthModal
        isOpen={showLocalLoginModal}
        onClose={() => setShowLocalLoginModal(false)}
        onLocalServerLogin={() => {
          serverInitialLoadComplete.current = false;
        }}
      />

      {/* User Profile Settings & Avatar Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      {/* Floating draggable/resizable YouTube player window (Desktop >= 1024px, both standard and Focus Mode) */}
      {activeLesson && activeLesson.youtubeId && showYoutubePlayer && activeTab === "read" && !isMobileTablet && (
        <YoutubePlayerWindow
          lesson={activeLesson}
          onClose={() => setShowYoutubePlayer(false)}
          onListeningTick={handleListeningTick}
          onVideoEnded={() => handleMediaEnded(activeLesson)}
        />
      )}

      {/* Manage Languages Modal */}
      <ManageLanguagesModal
        isOpen={isManageLanguagesOpen}
        onClose={() => setIsManageLanguagesOpen(false)}
        selectedTargetLanguage={selectedTargetLanguage}
        onSelectTargetLanguage={handleSelectTargetLanguage}
        availableTargetLanguages={availableTargetLanguages}
        onAddLanguage={handleAddLanguage}
        onRemoveLanguage={handleRemoveLanguage}
        lessonCountByLanguage={lessonCountByLanguage}
        languageFlags={languageFlags}
      />

      {/* iOS Safari PWA Install Banner */}
      <PwaInstallBanner 
        showIosInstallBanner={showIosInstallBanner} 
        setShowIosInstallBanner={setShowIosInstallBanner} 
      />

      {/* Global Background Audio Player Engine & Media Session API */}
      <GlobalAudioPlayer
        onListeningTick={(seconds, forceFlush, exactTime) => handleListeningTick(seconds, "global", forceFlush, exactTime)}
        onMediaEnded={(track) => {
          if (activeLesson && activeLesson.id === track.id) {
            handleMediaEnded(activeLesson);
          } else {
            recordHistoryActivity({
              id: track.guid || track.id,
              title: track.title,
              lessonType: track.lessonType || "podcast",
              coverUrl: track.coverUrl || null,
              targetLanguage: track.targetLanguage || "es",
              audioUrl: track.audioUrl,
              podcastTitle: track.podcastTitle || track.bookTitle || track.channelName || "Podcast",
              channelName: track.channelName || track.podcastTitle || track.bookTitle || null,
              guid: track.guid || track.id,
              lastPosition: track.duration || undefined,
            }, "complete");
          }
        }}
      />

      {/* Floating Bottom Audio Bar */}
      <BottomAudioBar
        activeTab={activeTab}
        lessons={lessons}
        selectedTargetLanguage={selectedTargetLanguage}
        onOpenLesson={handleOpenWhisperBook}
      />

      {/* Fullscreen Mobile Audio Player (Now Playing / Sheet) */}
      <FullscreenAudioPlayerModal
        lessons={lessons}
        selectedTargetLanguage={selectedTargetLanguage}
        onOpenLesson={handleOpenWhisperBook}
      />

      {/* Play Queue Management Drawer / Modal */}
      <QueueModal />

      {/* In-App Auto-Updater Modal from GitHub Releases */}
      <InAppUpdateModal
        release={availableUpdate}
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
      />
    </div>
  );
}
