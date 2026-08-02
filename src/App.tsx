/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Lesson, LessonType, VocabItem, WordStatus, AppStats, ReaderSettings, HistoryEntry } from "./types";
import { BUILT_IN_LESSONS, DEFAULT_LESSON_TYPES, ensureDefaultLessonTypes } from "./data";
import { onAuthStateChanged, signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { onSnapshot, collection, doc, getDocs } from "firebase/firestore";
import { 
  saveVocab, 
  deleteVocab, 
  deleteMultipleVocabs,
  saveLesson, 
  deleteLesson, 
  saveProfileStats, 
  saveWordRangeLink, 
  deleteWordRangeLink,
  saveLessonType,
  deleteLessonType,
  loadUserData, 
  uploadLocalToCloud,
  saveProfileSettings,
  decodeDocId,
  clearAllUserDataOnFirestore,
  handleFirestoreError,
  OperationType
} from "./firebaseService";
import AppSidebar from "./components/layout/AppSidebar";
import AppHeader from "./components/layout/AppHeader";
import ReaderPanel from "./components/ReaderPanel";
import WordExplainer from "./components/WordExplainer";
import AudioPlayerBar from "./components/AudioPlayerBar";
import ReaderView from "./components/ReaderView";
import { APP_VERSION } from "./version";
import { useLesson } from "./context/LessonContext";
import { useAuth } from "./context/AuthContext";
import { useVocab } from "./context/VocabContext";
import { useToast } from "./context/ToastContext";
import StatsWidget from "./components/StatsWidget";
import ImportLessonForm from "./components/ImportLessonForm";
import VocabularyPractice from "./components/VocabularyPractice";
import MatchPairsModal from "./components/MatchPairsModal";
import TextSettingsControls from "./components/TextSettingsControls";
import LibraryHome from "./components/LibraryHome";
import StatisticsPage from "./components/StatisticsPage";
import HistoryPage from "./components/HistoryPage";
import SettingsModal from "./components/SettingsModal";
import AuthModal from "./components/AuthModal";
import {
  setLessonImages,
  getLessonImagesMap,
  mergeLessonImages,
  removeLessonImages,
} from "./lessonImagesStore";
import YoutubePlayerWindow from "./components/YoutubePlayerWindow";
import { BookOpen, PlusCircle, GraduationCap, Headphones, Languages, Trash2, HelpCircle, Sparkles, BookMarked, TrendingUp, Pencil, Settings, ChevronLeft, Menu, X, Tv, Maximize2, Trophy, Loader2, Moon, Sun, Eye, EyeOff, History } from "lucide-react";
import { safeJsonParse, safeParse, normalizeLanguagePrefixedKey, isLocalHostname, safeLocalStorageSetItem, sanitizeLessonsForLocalStorage, normalizeContraction, normalizeVocabRecord, normalizeWordLinksRecord, dedupeHistory, buildVocabItem } from "./utils";
import { lessonsStore, vocabStore, settingsStore, migrateFromLocalStorage } from "./db";

const readerThemes = {
  default: {
    pageBg: "bg-stone-50 dark:bg-zinc-950",
    text: "text-zinc-900 dark:text-zinc-100",
    headerBg: "bg-white/70 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-900",
    cardBg: "bg-white dark:bg-zinc-900",
    border: "border-zinc-200 dark:border-zinc-800",
  },
  cream: {
    pageBg: "bg-[#faf5eb]",
    text: "text-[#3d2c16]",
    headerBg: "bg-[#fcf8f2]/90 border-[#eddcb9]",
    cardBg: "bg-[#fcf8f2]",
    border: "border-[#eddcb9]",
  },
  sepia: {
    pageBg: "bg-[#f5edd0]",
    text: "text-[#4d3319]",
    headerBg: "bg-[#f5ebd0]/90 border-[#e0cea1]",
    cardBg: "bg-[#f5ebd0]",
    border: "border-[#e0cea1]",
  },
  slate: {
    pageBg: "bg-slate-100/90 dark:bg-slate-950",
    text: "text-slate-800 dark:text-slate-100",
    headerBg: "bg-slate-50/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800",
    cardBg: "bg-slate-50 dark:bg-slate-900",
    border: "border-slate-200 dark:border-slate-800",
  },
};





export default function App() {
  const [isAppLoaded, setIsAppLoaded] = useState(false);

  // Durable browser persistence states
  const [lessons, setLessons] = useState<Lesson[]>(BUILT_IN_LESSONS);

  const [lessonTypes, setLessonTypes] = useState<LessonType[]>(DEFAULT_LESSON_TYPES);

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

  const { showToast } = useToast();

  const [listeningSeconds, setListeningSeconds] = useState<number>(0);

  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    return lessons[0]?.id || "";
  });
  const [lessonImagesVersion, setLessonImagesVersion] = useState(0);

  // Navigation states
  const [activeTab, setActiveTab] = useState<"library" | "read" | "practice" | "statistics" | "history">("library");

  // History state
  const listeningBufferRef = useRef<number>(0);

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem("vocab_clone_reading_history");
    return saved ? safeParse(saved, []) : [];
  });

  const handleUpdateHistory = (newHistory: HistoryEntry[]) => {
    const deduped = dedupeHistory(newHistory);
    setHistory(deduped);
    safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(deduped));
    settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(deduped)).catch(() => {});
    syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, listeningSeconds, languageFlags, deduped).catch(() => {});
  };

  const recordHistoryActivity = (
    targetLesson: Lesson,
    actionType: "read" | "listen" | "complete",
    durationSeconds?: number
  ) => {
    if (!targetLesson || !targetLesson.id) return;
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

      // Find recent entry for THIS LESSON (within last 2 hours regardless of actionType)
      const recentIdx = prev.findIndex(
        (h) =>
          h.lessonId === targetLesson.id &&
          Date.now() - new Date(h.timestamp).getTime() < 2 * 60 * 60 * 1000
      );

      let updated: HistoryEntry[];
      if (recentIdx !== -1) {
        updated = [...prev];
        const existing = updated[recentIdx];

        const nextActionType =
          isAudioOrVideo || actionType === "listen" || existing.actionType === "listen"
            ? "listen"
            : actionType === "complete"
            ? (existing.actionType === "complete" ? "read" : existing.actionType)
            : existing.actionType;

        const nextStatus: "in_progress" | "completed" =
          actionType === "complete" || existing.status === "completed" || existing.actionType === "complete"
            ? "completed"
            : existing.status || "in_progress";

        updated[recentIdx] = {
          ...existing,
          timestamp: now,
          actionType: nextActionType,
          status: nextStatus,
          durationSeconds: (existing.durationSeconds || 0) + (durationSeconds || 0),
        };
      } else {
        const newEntry: HistoryEntry = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          lessonId: targetLesson.id,
          lessonTitle: targetLesson.title,
          lessonType: targetLesson.lessonType || "article",
          coverUrl: targetLesson.coverUrl || null,
          targetLanguage: targetLesson.targetLanguage,
          timestamp: now,
          actionType: isAudioOrVideo ? "listen" : (actionType === "complete" ? "read" : actionType),
          status: actionType === "complete" ? "completed" : "in_progress",
          durationSeconds: durationSeconds || 0,
        };
        updated = [newEntry, ...prev];
      }
      const sliced = dedupeHistory(updated).slice(0, 500);
      safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(sliced));
      settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(sliced)).catch(() => {});
      syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, listeningSeconds, languageFlags, sliced).catch(() => {});
      return sliced;
    });
  };

  const [showImportForm, setShowImportForm] = useState(false);
  const [initialImportUrl, setInitialImportUrl] = useState<string | null>(null);
  const [showYoutubePlayer, setShowYoutubePlayer] = useState<boolean>(true);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [showMatchPairsModal, setShowMatchPairsModal] = useState<boolean>(false);
  const [isDetectingIdioms, setIsDetectingIdioms] = useState<boolean>(false);
  const lastLocalChangeTime = useRef<number>(0);
  const [showIosInstallBanner, setShowIosInstallBanner] = useState<boolean>(false);


  useEffect(() => {
    async function initDb() {
      try {
        await migrateFromLocalStorage();
        
        const savedLessons = await lessonsStore.getItem('lessons');
        if (savedLessons) setLessons(savedLessons as Lesson[]);
        
        const savedLessonTypes = await lessonsStore.getItem('lessontypes');
        if (savedLessonTypes) setLessonTypes(savedLessonTypes as LessonType[]);

        const ls = await settingsStore.getItem('vocab_clone_listening');
        if (ls !== null) setListeningSeconds(parseFloat(ls as string) || 0);

        const localHist1 = safeParse(localStorage.getItem('vocab_clone_reading_history'), []);
        const localHist2 = safeParse(localStorage.getItem('lingq_clone_reading_history'), []);
        let dbHist: HistoryEntry[] = [];
        try {
          const savedHistory = await settingsStore.getItem('vocab_clone_reading_history');
          if (savedHistory) {
            dbHist = typeof savedHistory === 'string' ? JSON.parse(savedHistory) : (savedHistory as any);
          }
        } catch(e) {}

        const combinedHistory = dedupeHistory([...localHist1, ...(localHist2.length > 0 ? localHist2 : []), ...(Array.isArray(dbHist) ? dbHist : [])]);
        if (combinedHistory.length > 0) {
          setHistory(combinedHistory);
          safeLocalStorageSetItem('vocab_clone_reading_history', JSON.stringify(combinedHistory));
          settingsStore.setItem('vocab_clone_reading_history', JSON.stringify(combinedHistory)).catch(() => {});
        }
        if (localHist2.length > 0) {
          try { localStorage.removeItem('lingq_clone_reading_history'); } catch(_) {}
        }

        const lf = await settingsStore.getItem('vocab_clone_language_flags');
        if (lf) setLanguageFlags(typeof lf === 'string' ? JSON.parse(lf) : lf);

        const fm = await settingsStore.getItem('vocab_clone_focus_mode');
        if (fm !== null) setIsFocusMode(fm === 'true' || fm === true);

        const lw = await settingsStore.getItem('vocab_clone_layout_width');
        if (lw) setLayoutWidthMode((lw === 'standard' ? 'full' : lw) as any);

        const rs = await settingsStore.getItem('vocab_clone_reader_settings');
        if (rs) {
          try {
             const parsed = typeof rs === 'string' ? JSON.parse(rs) : rs;
             setReaderSettings(prev => {
               const updated = { ...prev, ...parsed };
               safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(updated));
               return updated;
             });
          } catch(e) {}
        }

        const zs = await settingsStore.getItem('vocab_clone_interface_zoom');
        if (zs !== null) setZoomScale(parseInt(zs as string, 10));


      } catch (e) {
        console.error("App DB load error:", e);
      } finally {
        setIsAppLoaded(true);
      }
    }
    initDb();
  }, []);

  // Synchronize URL Hash with Tab Navigation and Browser Back/Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash || "#/library";
      
      if (hash.startsWith("#/import")) {
        setActiveTab("library");
        setShowImportForm(true);
      } else if (hash.startsWith("#/read")) {
        setActiveTab("read");
        setShowImportForm(false);
        const match = hash.match(/[?&]lesson=([^&]+)/);
        if (match && match[1]) {
          setActiveLessonId(match[1]);
        }
      } else if (hash.startsWith("#/practice")) {
        setActiveTab("practice");
        setShowImportForm(false);
      } else if (hash.startsWith("#/statistics")) {
        setActiveTab("statistics");
        setShowImportForm(false);
      } else {
        // default /library
        setActiveTab("library");
        setShowImportForm(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    
    // Initialize state on first mount
    handlePopState();

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  useEffect(() => {
    // Detect iOS Safari in non-standalone mode
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    const bannerDismissed = localStorage.getItem('ios_pwa_banner_dismissed') === 'true';

    if (isIOS && !isStandalone && !bannerDismissed) {
      setShowIosInstallBanner(true);
    }
  }, []);

  useEffect(() => {
    let hash = `#/${activeTab}`;
    if (activeTab === "read" && activeLessonId) {
      hash += `?lesson=${activeLessonId}`;
    } else if (activeTab === "library" && showImportForm) {
      hash = `#/import`;
    }
    
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
  }, [activeTab, activeLessonId, showImportForm]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const importUrl = params.get("import_url");
    if (importUrl) {
      setInitialImportUrl(importUrl);
      setShowImportForm(true);
      // Clean query parameters from URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete("import_url");
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  }, []);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [languageFlags, setLanguageFlags] = useState<Record<string, string>>({});
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [showOnlyUnknown, setShowOnlyUnknown] = useState<boolean>(false);

  const [layoutWidthMode, setLayoutWidthMode] = useState<"standard" | "wide" | "ultra" | "full">("full");

  // Customizable reader options (Fonts family, background tone, size, spacing, container width)
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const defaults: ReaderSettings = {
      fontSize: "xl",
      lineHeight: "loose",
      fontFamily: "sans",
      readerTheme: "default",
      maxWidth: "medium",
      pageSize: "auto",
      sentenceSpacing: "normal",
      segmentSpacing: "normal",
      ttsEngine: "google",
      ttsLocale: "en-US",
      aiProvider: "gemini",
      localAiUrl: "http://localhost:11434/api/generate",
      localAiModel: "phi3.5",
      showDetailedVocabularyStats: true,
      mainStatsMetric: "comprehension",
      showProgressBar: true,
    };
    try {
      const saved = localStorage.getItem("vocab_clone_reader_settings");
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Failed to parse saved reader settings:", e);
    }
    return defaults;
  });

  // Zoom level state (default is 100 representing 100%)
  const [zoomScale, setZoomScale] = useState<number>(100);

  useEffect(() => {
    settingsStore.setItem("vocab_clone_interface_zoom", zoomScale.toString());
    const val = `${zoomScale}%`;
    try {
      (document.documentElement.style as any).zoom = "";
      if (document.body) {
        (document.body.style as any).zoom = val;
      }
    } catch (e) {
      console.error("Zoom layout adjustment not supported:", e);
    }
  }, [zoomScale]);

  // Dark mode toggle state (manual, persists to localStorage)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("vocab_clone_dark_mode");
      if (saved === "false") return false;
      if (saved === "true") return true;
    } catch (_) {}
    return false;
  });

  // Firebase Auth & Cloud Sync States
  const [showLocalLoginModal, setShowLocalLoginModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudOfflineWarning, setCloudOfflineWarning] = useState<boolean>(false);
  const [cloudOfflineError, setCloudOfflineError] = useState<string | null>(null);
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


  const serverInitialLoadComplete = useRef<boolean>(false);
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


  const loadDataFromLocalServer = async () => {
    if (storageMode === "server" && Date.now() - lastLocalChangeTime.current < 8000) {
      return;
    }
    if (isAuthLoading) return;
    if (localSyncError) return;
    setIsSyncing(true);
    if (!serverInitialLoadComplete.current) {
      setIsInitialServerLoading(true);
    }
    try {
      const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
      const savedUserStr = localStorage.getItem("vocab_clone_local_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;

      const fetchHeaders: Record<string, string> = {
        "x-local-sync-key": localSyncKey,
        "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default"
      };
      if (savedToken) {
        fetchHeaders["Authorization"] = `Bearer ${savedToken}`;
      }
      const res = await fetch("/api/server-db", {
        headers: fetchHeaders
      });
      if (res.status === 401 || res.status === 403) {
        setLocalSyncError(true);
        setIsSyncing(false);
        return;
      }
      if (res.ok) {
        const body = await safeJsonParse(res);
        if (storageMode === "server" && Date.now() - lastLocalChangeTime.current < 8000) {
          setIsSyncing(false);
          return;
        }
        if (body.status === "ok" && body.data) {
          const d = body.data;
          const normalizedCloudVocab = normalizeVocabRecord(d.vocab);
          const normalizedCloudWordLinks = normalizeWordLinksRecord(d.wordLinks);

          if (d.lessons) setLessons(d.lessons);
          if (d.lessonTypes) setLessonTypes(d.lessonTypes);
          setVocab(normalizedCloudVocab);
          setWordLinks(normalizedCloudWordLinks);
          if (d.listeningSeconds !== undefined) setListeningSeconds(d.listeningSeconds);
          if (d.languageFlags) setLanguageFlags(d.languageFlags);

          if (d.history && Array.isArray(d.history)) {
            const cleanHistory = dedupeHistory(d.history);
            setHistory(cleanHistory);
            safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(cleanHistory));
            settingsStore.setItem("vocab_clone_reading_history", JSON.stringify(cleanHistory)).catch(() => {});
          }

          // Sync into localStorage as fallback buffer (sanitizing heavy base64 fields)
          if (d.lessons) lessonsStore.setItem("lessons", d.lessons);
          if (d.lessonTypes) lessonsStore.setItem("lessontypes", d.lessonTypes);
          safeLocalStorageSetItem("vocab_clone_words", JSON.stringify(normalizedCloudVocab));
          safeLocalStorageSetItem("vocab_clone_aliases", JSON.stringify(normalizedCloudWordLinks));
          if (d.listeningSeconds !== undefined) safeLocalStorageSetItem("vocab_clone_listening", d.listeningSeconds.toString());
          if (d.languageFlags) safeLocalStorageSetItem("vocab_clone_language_flags", JSON.stringify(d.languageFlags));
          if (d.history) safeLocalStorageSetItem("vocab_clone_reading_history", JSON.stringify(d.history));

          serverInitialLoadComplete.current = true;
        } else if (body.status === "empty") {
          // Empty server database: Seed with current browser's local state
          const localLessonsStr = localStorage.getItem("vocab_clone_lessons");
          const localTypesStr = localStorage.getItem("vocab_clone_lessontypes");
          const localWordsStr = localStorage.getItem("vocab_clone_words");
          const localListeningStr = localStorage.getItem("vocab_clone_listening");
          const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
          const localFlagsStr = localStorage.getItem("vocab_clone_language_flags");
          const localHistoryStr = localStorage.getItem("vocab_clone_reading_history");

          const lLessons = safeParse(localLessonsStr, BUILT_IN_LESSONS);
          const lTypes = ensureDefaultLessonTypes(safeParse(localTypesStr, DEFAULT_LESSON_TYPES) as LessonType[]);
          const lWords = normalizeVocabRecord(safeParse(localWordsStr, {}));
          const lListening = localListeningStr ? parseFloat(localListeningStr) || 0 : 0;
          const lWordLinks = normalizeWordLinksRecord(safeParse(localAliasesStr, {}));
          const lLanguageFlags = safeParse(localFlagsStr, {});
          const lHistory = dedupeHistory(safeParse(localHistoryStr, []));

          setLessons(lLessons);
          setLessonTypes(lTypes);
          setVocab(lWords);
          setListeningSeconds(lListening);
          setWordLinks(lWordLinks);
          setLanguageFlags(lLanguageFlags);
          setHistory(lHistory);

          const postHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            "x-local-sync-key": localSyncKey,
            "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default"
          };
          if (savedToken) {
            postHeaders["Authorization"] = `Bearer ${savedToken}`;
          }

          await fetch("/api/server-db", {
            method: "POST",
            headers: postHeaders,
            body: JSON.stringify({
              data: {
                lessons: lLessons,
                lessonTypes: lTypes,
                vocab: lWords,
                wordLinks: lWordLinks,
                listeningSeconds: lListening,
                languageFlags: lLanguageFlags,
                history: lHistory,
              }
            })
          });
          serverInitialLoadComplete.current = true;
        }
      } else {
        setIsSyncing(false);
      }
    } catch (e) {
      console.error("Failed to load or seed dataset from local server:", e);
    } finally {
      setIsSyncing(false);
      setIsInitialServerLoading(false);
    }
  };

  const syncDataToLocalServer = async (
    currentLessons = lessons,
    currentTypes = lessonTypes,
    currentVocab = vocab,
    currentLinks = wordLinks,
    currentListening = listeningSeconds,
    currentFlags = languageFlags,
    currentHistory = history
  ) => {
    if (storageMode !== "server") return;
    if (isAuthLoading) return;
    if (localSyncError) return;
    lastLocalChangeTime.current = Date.now();
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

      const res = await fetch("/api/server-db", {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify({
          data: {
            lessons: currentLessons,
            lessonTypes: currentTypes,
            vocab: currentVocab,
            wordLinks: currentLinks,
            listeningSeconds: currentListening,
            languageFlags: currentFlags,
            history: currentHistory,
          },
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setLocalSyncError(true);
        return;
      }
      if (res.ok) {
        lastLocalChangeTime.current = Date.now();
      }
    } catch (e) {
      console.error("Failed to auto-sync with local dev server:", e);
    }
  };

  // Synchronize Cloud Firestore with Local Cache on mount/auth change
  useEffect(() => {
    let unsubscribes: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clear previous active snapshots first
      unsubscribes.forEach((unsub) => unsub());
      unsubscribes = [];

      if (firebaseUser && storageMode === "server") {
        signOut(auth).catch(err => console.error("Firebase signout failed:", err));
        return;
      }

      if (firebaseUser) {
        // Automatically align storageMode to "cloud" when logged in via Firebase
        if (storageMode !== "cloud") {
          setStorageMode("cloud");
          safeLocalStorageSetItem("vocab_clone_storage_mode", "cloud");
          return; // The change in storageMode will trigger a re-run of this useEffect
        }
      }

      if (storageMode === "cloud") {
        if (serverToken) {
          logout().catch(err => console.error("Server logout request failed:", err));
        }
      }

      if (firebaseUser && storageMode === "cloud") {
        setIsSyncing(true);
        try {
          if (!db) {
            throw new Error("Firestore database instance (db) is offline or undefined");
          }

          const cloudData = await loadUserData(firebaseUser.uid);
          
          // Get local storage data
          const localLessonsStr = localStorage.getItem("vocab_clone_lessons");
          const localTypesStr = localStorage.getItem("vocab_clone_lessontypes");
          const localWordsStr = localStorage.getItem("vocab_clone_words");
          const localListeningStr = localStorage.getItem("vocab_clone_listening");
          const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
          const localFlagsStr = localStorage.getItem("vocab_clone_language_flags");

          const lLessons = safeParse(localLessonsStr, BUILT_IN_LESSONS) as Lesson[];
          const lTypes = ensureDefaultLessonTypes(safeParse(localTypesStr, DEFAULT_LESSON_TYPES) as LessonType[]);
          const lWords = normalizeVocabRecord(safeParse(localWordsStr, {}));
          const lListening = localListeningStr ? parseFloat(localListeningStr) || 0 : 0;
          const lWordLinks = normalizeWordLinksRecord(safeParse(localAliasesStr, {}));
          const lLanguageFlags = safeParse(localFlagsStr, {});

          // Merge logic: find missing custom items locally and upload them to the cloud
          const cloudLessonIds = new Set(cloudData.lessons.map(l => l.id));
          const missingLessons = lLessons.filter(l => !l.isBuiltIn && !cloudLessonIds.has(l.id));

          const cloudTypeIds = new Set(cloudData.lessonTypes.map(t => t.id));
          const missingTypes = lTypes.filter(t => !cloudTypeIds.has(t.id));

          const missingWords: Record<string, VocabItem> = {};
          for (const [key, wordItem] of Object.entries(lWords)) {
            if (!cloudData.vocab[key]) {
              missingWords[key] = wordItem;
            }
          }

          const missingLinks: Record<string, string> = {};
          for (const [key, target] of Object.entries(lWordLinks)) {
            if (!cloudData.wordLinks[key]) {
              missingLinks[key] = target;
            }
          }

          // If there are missing items, upload them (merge local progress into cloud)
          const needsUpload = 
            missingLessons.length > 0 || 
            missingTypes.length > 0 || 
            Object.keys(missingWords).length > 0 || 
            Object.keys(missingLinks).length > 0;

          if (needsUpload) {
            await uploadLocalToCloud(
              firebaseUser.uid,
              missingLessons,
              missingTypes,
              missingWords,
              missingLinks,
              Math.max(lListening, cloudData.listeningSeconds),
              { ...cloudData.languageFlags, ...lLanguageFlags }
            );
          }

          // Setup real-time Firestore listeners to instantly synchronize devices (computer, tablet, etc.)
          const unsubLessons = onSnapshot(
            collection(db, "users", firebaseUser.uid, "lessons"),
            (snapshot) => {
              const processLessonsSnapshot = async () => {
                const cloudLessonsList: Lesson[] = [];
                const lessonsToFetchImagesFor: Lesson[] = [];

                snapshot.forEach((doc) => {
                  const lesson = doc.data() as Lesson;
                  if (lesson.text && lesson.text.includes("[IMG_REF:")) {
                    lessonsToFetchImagesFor.push(lesson);
                  } else {
                    cloudLessonsList.push(lesson);
                  }
                });

                if (lessonsToFetchImagesFor.length > 0) {
                  for (const lesson of lessonsToFetchImagesFor) {
                    // Guard: Check if the user is still of the same identity and is authenticated before running subcollection getDocs
                    if (!auth.currentUser || auth.currentUser.uid !== firebaseUser.uid) {
                      return;
                    }
                    try {
                      const imagesSnap = await getDocs(collection(db, "users", firebaseUser.uid, "lessons", lesson.id, "images"));
                      const imagesMap: Record<string, string> = {};
                      imagesSnap.forEach(imgDoc => {
                        imagesMap[imgDoc.id] = imgDoc.data().dataUrl;
                      });
                      mergeLessonImages(lesson.id, imagesMap);
                    } catch (err) {
                      console.error("Failed to load images for lesson", lesson.id, err);
                    }
                    cloudLessonsList.push(lesson);
                  }
                  setLessonImagesVersion((v) => v + 1);
                }

                // Always update state (even if empty list) to keep UI in sync
                const snapshotIds = snapshot.docs.map(doc => doc.id);
                cloudLessonsList.sort((a, b) => snapshotIds.indexOf(a.id) - snapshotIds.indexOf(b.id));
                setLessons(cloudLessonsList);
              };

              processLessonsSnapshot().catch((err) => {
                console.error("Error processing real-time lessons snapshot:", err);
              });
            },
            (error) => {
              console.error("Firestore real-time sync lessons failed:", error);
              try { handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/lessons`); } catch(e){}
            }
          );
          unsubscribes.push(unsubLessons);

          const unsubTypes = onSnapshot(
            collection(db, "users", firebaseUser.uid, "lessonTypes"),
            (snapshot) => {
              const cloudTypes: LessonType[] = [];
              snapshot.forEach((doc) => {
                cloudTypes.push(doc.data() as LessonType);
              });
              if (cloudTypes.length > 0) {
                setLessonTypes(cloudTypes);
              }
            },
            (error) => {
              console.error("Firestore real-time sync lessonTypes failed:", error);
              try { handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/lessonTypes`); } catch(e){}
            }
          );
          unsubscribes.push(unsubTypes);

          const unsubVocabItems = onSnapshot(
            collection(db, "users", firebaseUser.uid, "lingqs"),
            (snapshot) => {
              const cloudVocab: Record<string, VocabItem> = {};
              snapshot.forEach((doc) => {
                const data = doc.data() as VocabItem;
                if (data.word) {
                  data.word = data.word.replace(/^[a-zA-Z]+_/, "");
                }
                cloudVocab[decodeDocId(doc.id)] = data;
              });
              setVocab(normalizeVocabRecord(cloudVocab));
            },
            (error) => {
              console.error("Firestore real-time sync vocab failed:", error);
              try { handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/lingqs`); } catch(e){}
            }
          );
          unsubscribes.push(unsubVocabItems);

          const unsubLinks = onSnapshot(
            collection(db, "users", firebaseUser.uid, "wordLinks"),
            (snapshot) => {
              const cloudWordLinks: Record<string, string> = {};
              snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.sourceWord && data.targetWord) {
                  cloudWordLinks[data.sourceWord] = data.targetWord;
                }
              });
              setWordLinks(normalizeWordLinksRecord(cloudWordLinks));
            },
            (error) => {
              console.error("Firestore real-time sync wordLinks failed:", error);
              try { handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/wordLinks`); } catch(e){}
            }
          );
          unsubscribes.push(unsubLinks);

          const unsubProfile = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                if (typeof data.listeningSeconds === "number") {
                  setListeningSeconds(data.listeningSeconds);
                }
                if (data.languageFlags) {
                  setLanguageFlags(data.languageFlags);
                }
              }
            },
            (error) => {
              console.error("Firestore real-time sync profile failed:", error);
              try { handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`); } catch(e){}
            }
          );
          unsubscribes.push(unsubProfile);

          setCloudOfflineWarning(false);
          setCloudOfflineError(null);
        } catch (err: any) {
          console.error("Failed to sync offline user details to remote container; falling back to local storage:", err);
          setCloudOfflineWarning(true);
          setCloudOfflineError(err instanceof Error ? err.message : String(err));

          // Robust local fallback: Keep current active in-memory state safe. No-op to avoid data clobbering.

          // setLessons(safeParse(localLessonsStr, BUILT_IN_LESSONS));





        } finally {
          setIsSyncing(false);
        }
      } else {
        setCloudOfflineWarning(false);
        setCloudOfflineError(null);
        if (storageMode === "server") {
          // Local Dev Server Shared DB
          loadDataFromLocalServer();
        } else {
          // Not authenticated: Fall back to local browser storage
          const localLessonsStr = localStorage.getItem("vocab_clone_lessons");
          const localTypesStr = localStorage.getItem("vocab_clone_lessontypes");
          const localWordsStr = localStorage.getItem("vocab_clone_words");
          const localListeningStr = localStorage.getItem("vocab_clone_listening");
          const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
          const localFlagsStr = localStorage.getItem("vocab_clone_language_flags");

          setLessons(safeParse(localLessonsStr, BUILT_IN_LESSONS));
          setLessonTypes(safeParse(localTypesStr, DEFAULT_LESSON_TYPES));
          setVocab(normalizeVocabRecord(safeParse(localWordsStr, {})));
          setListeningSeconds(localListeningStr ? parseFloat(localListeningStr) || 0 : 0);
          setWordLinks(normalizeWordLinksRecord(safeParse(localAliasesStr, {})));
          setLanguageFlags(safeParse(localFlagsStr, {}));
        }
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [storageMode]);

  // Debounced Auto-save to Local Dev Server whenever major modules change
  useEffect(() => {
    if (storageMode !== "server") return;
    if (!serverInitialLoadComplete.current) return;

    const delayDebounceFn = setTimeout(() => {
      syncDataToLocalServer();
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [lessons, lessonTypes, vocab, listeningSeconds, wordLinks, languageFlags, storageMode, localSyncKey, localSyncError]);

  // Dynamic automatic syncing of tablet/PC changes over local network (polls on mount, tab changes, focus, and every 8s when visible)
  useEffect(() => {
    if (storageMode !== "server") return;
    if (isAuthLoading) return;

    loadDataFromLocalServer(); // Poll on mount/mode/key/tab change

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        loadDataFromLocalServer();
      }
    };

    window.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("focus", handleFocusOrVisible);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadDataFromLocalServer();
      }
    }, 8000);

    return () => {
      window.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("focus", handleFocusOrVisible);
      clearInterval(interval);
    };
  }, [storageMode, localSyncKey, localSyncError, serverToken, isAuthLoading, activeTab]);



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
    if (auth.currentUser && storageMode === "cloud") {
      saveLessonType(auth.currentUser.uid, newType).catch((err) => console.error(err));
    }
  };

  const handleDeleteLessonType = (typeId: string) => {
    setLessonTypes((prev) => prev.filter((t) => t.id !== typeId));
    if (auth.currentUser && storageMode === "cloud") {
      deleteLessonType(auth.currentUser.uid, typeId).catch((err) => console.error(err));
    }
  };

  const handleUpdateLessonType = (updatedType: LessonType) => {
    setLessonTypes((prev) => prev.map((t) => t.id === updatedType.id ? updatedType : t));
    if (auth.currentUser && storageMode === "cloud") {
      saveLessonType(auth.currentUser.uid, updatedType).catch((err) => console.error(err));
    }
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
    return lessons.find((l) => l.id === activeLessonId) || lessons[0];
  }, [lessons, activeLessonId]);

  const { setActiveLesson } = useLesson();
  useEffect(() => {
    setActiveLesson(activeLesson || null);
  }, [activeLesson, setActiveLesson]);

  // When Cream or Sepia background tone is selected in reader view, disable dark mode override so the full page & UI render in clean Cream / Sepia light styling
  const isReadThemeLightOverride = (
    activeTab === "read" && 
    Boolean(activeLesson) && 
    (readerSettings.readerTheme === "cream" || readerSettings.readerTheme === "sepia")
  );
  const shouldApplyDarkClass = isDarkMode && !isReadThemeLightOverride;

  useEffect(() => {
    try {
      localStorage.setItem("vocab_clone_dark_mode", isDarkMode ? "true" : "false");
    } catch (_) {}
    if (shouldApplyDarkClass) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode, shouldApplyDarkClass]);

  const activeLessonWords = useMemo(() => {
    if (!activeLesson || typeof activeLesson.text !== "string") return [];
    const regex = /[\p{L}\p{M}'’]+/gu;
    const tokens = activeLesson.text.toLowerCase().match(regex) || [];
    
    const lang = (activeLesson.targetLanguage || "spanish").toLowerCase();
    const uniqueKeys = new Set<string>();
    
    tokens.forEach((t) => {
      const lower = t.trim();
      if (!lower) return;
      const langKey = `${lang}_${lower}`;
      const resolved = wordLinks[langKey] || lower;
      const cleanKey = resolved.replace(/^[a-zA-Z]+_/, "");
      
      uniqueKeys.add(`${lang}_${cleanKey}`);
      uniqueKeys.add(cleanKey); // fallback legacy
    });
    
    // Support multi-word phrases (idioms, phrasal verbs, collocations) from tokens (sliding window)
    for (let i = 0; i < tokens.length; i++) {
      for (let len = 2; len <= 8; len++) {
        if (i + len > tokens.length) break;
        const candidatePhrase = tokens.slice(i, i + len).join(" ");
        uniqueKeys.add(`${lang}_${candidatePhrase}`);
        uniqueKeys.add(candidatePhrase); // fallback legacy
      }
    }

    // Support AI detected phrases explicitly
    if (activeLesson.detectedPhrases) {
      Object.keys(activeLesson.detectedPhrases).forEach((phrase) => {
        const lowerPhrase = phrase.toLowerCase().trim();
        uniqueKeys.add(`${lang}_${lowerPhrase}`);
        uniqueKeys.add(lowerPhrase); // fallback legacy
      });
    }
    
    const bookVocabItemsMap = new Map<string, VocabItem>();
    
    uniqueKeys.forEach((key) => {
      const lq = vocab[key];
      if (lq && ["1", "2", "3", "4", "5", "learning"].includes(lq.status)) {
        bookVocabItemsMap.set(lq.word.toLowerCase(), lq);
      }
    });
    
    return Array.from(bookVocabItemsMap.values());
  }, [activeLesson, vocab, wordLinks]);

  const activeLessonImagesMap = useMemo(() => {
    if (!activeLesson?.id) return {};
    return getLessonImagesMap(activeLesson.id);
  }, [activeLesson?.id, lessonImagesVersion]);

  useEffect(() => {
    if (activeLesson?.youtubeId) {
      setShowYoutubePlayer(true);
    }
  }, [activeLesson?.id, activeLesson?.youtubeId]);

  const activeVocabItem = useMemo(() => {
    if (!selectedWord) return null;
    const key = selectedWord.toLowerCase();
    const lang = (activeLesson?.targetLanguage || "spanish").toLowerCase();
    const resolved = wordLinks[`${lang}_${key}`] || key;
    const cleanResolved = resolved.replace(/^[a-zA-Z]+_/, "");
    
    // Check direct match
    const directMatch = vocab[`${lang}_${cleanResolved}`];
    if (directMatch) return directMatch;

    // Check normalized contraction base word for inheritance
    const normalized = normalizeContraction(cleanResolved, lang);
    if (normalized !== cleanResolved) {
      const normMatch = vocab[`${lang}_${normalized}`];
      if (normMatch) return normMatch;
    }

    return null;
  }, [selectedWord, vocab, wordLinks, activeLesson]);

  // Dynamic statistics computing
  const calculatedStats = useMemo<AppStats>(() => {
    const values = (Object.values(vocab) || []).filter(Boolean) as VocabItem[];
    const known = values.filter((l) => l && l.status === "known").length;
    const learning = values.filter((l) => 
      l && l.status && ["1", "2", "3", "4", "5", "learning"].includes(l.status)
    ).length;

    const dedupedHist = dedupeHistory(history);
    const historyListeningSeconds = dedupedHist
      .filter((item) => item.actionType === "listen")
      .reduce((acc, item) => acc + (item.durationSeconds || 0), 0);

    return {
      listeningSeconds: Math.round(historyListeningSeconds),
      wordsKnownCount: known,
      wordsLearningCount: learning,
    };
  }, [vocab, listeningSeconds, history]);

  const handleOpenLesson = (lessonId: string, word: string, sentence: string) => {
    const normalizedWord = word.replace(/\s+/g, " ").trim();
    const normalizedContext = sentence.replace(/\s+/g, " ").trim();
    setActiveLessonId(lessonId);
    setSelectedWord(normalizedWord);
    setSelectedContext(normalizedContext);
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

    if (auth.currentUser && storageMode === "cloud") {
      saveWordRangeLink(auth.currentUser.uid, sourceKey, targetKey).catch((err) => console.error(err));
    }

    // Instantly sync the statuses of linked items to avoid split status profiles
    setVocab((prev) => {
      const fromVocab = prev[sourceKey] || prev[lowerFrom];
      const toVocab = prev[targetKey] || prev[lowerTo];

      if (!fromVocab && !toVocab) {
        if (storageMode === "server") {
          syncDataToLocalServer(lessons, lessonTypes, prev, nextWordLinks).catch((err) => console.error(err));
        }
        return prev;
      }

      // Find best available status / translation configuration
      const sourceOfTruth = fromVocab || toVocab;
      if (!sourceOfTruth) return prev;

      const nextVocab = { ...prev };
      const updatedFrom: VocabItem = {
        word: lowerFrom,
        status: sourceOfTruth.status,
        translation: fromVocab?.translation || sourceOfTruth.translation || "[Known]",
        ipa: fromVocab?.ipa || sourceOfTruth.ipa || "",
        grammar: fromVocab?.grammar || sourceOfTruth.grammar || "",
        contextRelation: fromVocab?.contextRelation || sourceOfTruth.contextRelation || "",
        examples: fromVocab?.examples || sourceOfTruth.examples || [],
        createdAt: fromVocab?.createdAt || sourceOfTruth.createdAt || Date.now(),
        tags: fromVocab?.tags || sourceOfTruth.tags || [],
        imageUrl: fromVocab?.imageUrl || sourceOfTruth.imageUrl || null,
      };

      const updatedTo: VocabItem = {
        word: lowerTo,
        status: sourceOfTruth.status,
        translation: toVocab?.translation || sourceOfTruth.translation || "[Known]",
        ipa: toVocab?.ipa || sourceOfTruth.ipa || "",
        grammar: toVocab?.grammar || sourceOfTruth.grammar || "",
        contextRelation: toVocab?.contextRelation || sourceOfTruth.contextRelation || "",
        examples: toVocab?.examples || sourceOfTruth.examples || [],
        createdAt: toVocab?.createdAt || sourceOfTruth.createdAt || Date.now(),
        tags: toVocab?.tags || sourceOfTruth.tags || [],
        imageUrl: toVocab?.imageUrl || sourceOfTruth.imageUrl || null,
      };

      // Clean up legacy non-prefixed keys or case variations
      const keysToDelete: string[] = [];
      Object.keys(nextVocab).forEach((k) => {
        const kLower = k.trim().toLowerCase();
        if ((kLower === lowerFrom && k !== sourceKey) || (kLower === lowerTo && k !== targetKey)) {
          keysToDelete.push(k);
          delete nextVocab[k];
        }
      });

      nextVocab[sourceKey] = updatedFrom;
      nextVocab[targetKey] = updatedTo;

      if (auth.currentUser && storageMode === "cloud") {
        saveVocab(auth.currentUser.uid, sourceKey, updatedFrom).catch((err) => console.error(err));
        saveVocab(auth.currentUser.uid, targetKey, updatedTo).catch((err) => console.error(err));
        if (keysToDelete.length > 0) {
          deleteMultipleVocabs(auth.currentUser.uid, keysToDelete).catch((err) =>
            console.error("Failed to delete legacy keys from cloud in handleSaveWordLink:", err)
          );
        }
      }

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
    if (auth.currentUser && storageMode === "cloud") {
      deleteWordRangeLink(auth.currentUser.uid, sourceKey).catch((err) => console.error(err));
      deleteWordRangeLink(auth.currentUser.uid, lowerFrom).catch((err) => console.error(err));
    }
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
      const keysToDelete: string[] = [];
      
      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`;
        const existing = prev[targetLangKey];

        const updatedVocabItem: VocabItem = buildVocabItem(newVocabItem, linkedWord, existing);

        // Clean up legacy non-prefixed key or case variations from local state
        Object.keys(nextVocab).forEach((k) => {
          const kLower = k.trim().toLowerCase();
          if (kLower === linkedWord.toLowerCase() && k !== targetLangKey) {
            keysToDelete.push(k);
            delete nextVocab[k];
          }
        });

        nextVocab[targetLangKey] = updatedVocabItem;

        if (auth.currentUser && storageMode === "cloud") {
          saveVocab(auth.currentUser.uid, targetLangKey, updatedVocabItem).catch((err) => console.error(err));
        }
      });

      if (auth.currentUser && storageMode === "cloud" && keysToDelete.length > 0) {
        deleteMultipleVocabs(auth.currentUser.uid, keysToDelete).catch((err) =>
          console.error("Failed to delete legacy keys from cloud during save:", err)
        );
      }

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

        linkedWords.forEach((linkedWord) => {
          const targetLangKey = `${activeLang}_${linkedWord}`;
          const existing = prev[targetLangKey];

          const updatedVocabItem: VocabItem = buildVocabItem(newVocabItem, linkedWord, existing);

          // Clean up legacy non-prefixed key or case variations from local state
          const targetLower = linkedWord.toLowerCase();
          const legacyKeys = keyLookup.get(targetLower) || [];
          legacyKeys.forEach((k) => {
            if (k !== targetLangKey) {
              keysToDelete.push(k);
              delete nextVocab[k];
            }
          });

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

          if (auth.currentUser && storageMode === "cloud") {
            cloudPromises.push(saveVocab(auth.currentUser.uid, targetLangKey, updatedVocabItem));
          }
        });
      });

      if (cloudPromises.length > 0) {
        Promise.all(cloudPromises).catch((err) => console.error("Cloud batch save error:", err));
      }

      if (auth.currentUser && storageMode === "cloud" && keysToDelete.length > 0) {
        deleteMultipleVocabs(auth.currentUser.uid, keysToDelete).catch((err) =>
          console.error("Failed to delete legacy keys from cloud during save:", err)
        );
      }

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
        delete copy[k];
      });

      if (uniqueCleanKeys.length > 0) {
        if (auth.currentUser && storageMode === "cloud") {
          deleteMultipleVocabs(auth.currentUser.uid, uniqueCleanKeys).catch((err) => console.error(err));
        } else if (storageMode === "server") {
          syncDataToLocalServer(lessons, lessonTypes, copy, wordLinks).catch((err) => console.error(err));
        }
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
        tags: newVocabItem.tags || [],
      };
      copy[targetLangKeyNew] = updatedVocabItem;

      // Update backend / Firestore / Server
      if (uniqueDropKeys.length > 0) {
        if (auth.currentUser && storageMode === "cloud") {
          // Delete old keys from cloud first, then save the new key
          deleteMultipleVocabs(auth.currentUser.uid, uniqueDropKeys)
            .then(() => {
              saveVocab(auth.currentUser.uid!, targetLangKeyNew, updatedVocabItem).catch((err) =>
                console.error("Failed to save renamed word to cloud:", err)
              );
            })
            .catch((err) => {
              console.error("Failed to delete older word keys during rename:", err);
              saveVocab(auth.currentUser.uid!, targetLangKeyNew, updatedVocabItem).catch((err) =>
                console.error(err)
              );
            });
        } else if (storageMode === "server") {
          // In server mode, sync the resulting local state to local_server_db
          syncDataToLocalServer(lessons, lessonTypes, copy, wordLinks).catch((err) =>
            console.error("Failed to sync renamed word with server:", err)
          );
        }
      }

      return copy;
    });
  };



  const handleAddLesson = (newL: Lesson, images?: Record<string, { dataUrl: string; width: string; height: string }>) => {
    lastLocalChangeTime.current = Date.now();
    const lessonWithDate: Lesson = {
      ...newL,
      createdAt: newL.createdAt || Date.now(),
    };
    if (images && Object.keys(images).length > 0) {
      setLessonImages(lessonWithDate.id, images);
      setLessonImagesVersion((v) => v + 1);
    }
    setLessons((prev) => {
      const exists = prev.some((l) => l.id === lessonWithDate.id);
      if (exists) {
        return prev.map((l) => (l.id === lessonWithDate.id ? { ...l, ...lessonWithDate } : l));
      }
      return [lessonWithDate, ...prev];
    });
    setActiveLessonId(lessonWithDate.id);
    setShowImportForm(false);
    if (auth.currentUser && storageMode === "cloud") {
      saveLesson(auth.currentUser.uid, lessonWithDate, images).catch((err) => console.error(err));
    }
    if (storageMode === "server") {
      syncDataToLocalServer([lessonWithDate, ...lessons]).catch((err) => console.error(err));
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
        setLessons((prev) => {
          const next = prev.map((l) => (l.id === activeLesson.id ? updatedLesson : l));
          lessonsStore.setItem("lessons", next);
          return next;
        });
        if (auth.currentUser && storageMode === "cloud") {
          saveLesson(auth.currentUser.uid, updatedLesson).catch((err) => console.error(err));
        }
        if (storageMode === "server") {
          syncDataToLocalServer(
            lessons.map((l) => (l.id === activeLesson.id ? updatedLesson : l))
          ).catch((err) => console.error(err));
        }
      }
    } catch (e: any) {
      console.error(e);
      showToast("Ошибка при распознавании идиом: " + (e.message || String(e)), "error");
    } finally {
      setIsDetectingIdioms(false);
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

    // Switch active lesson if necessary
    if (activeLessonId === idToDelete && remaining.length > 0) {
      setActiveLessonId(remaining[0].id);
    }
    if (auth.currentUser && storageMode === "cloud") {
      deleteLesson(auth.currentUser.uid, idToDelete).catch((err) => console.error(err));
    }
    // Immediately sync to local server so the polling interval doesn't restore the deleted lesson
    if (storageMode === "server") {
      syncDataToLocalServer(remaining, lessonTypes, vocab, wordLinks, listeningSeconds, languageFlags).catch((err) => console.error(err));
    }
  };

  const handleToggleArchiveLesson = (idToToggle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    lastLocalChangeTime.current = Date.now();
    setLessons((prev) => {
      const next = prev.map((l) => {
        if (l.id === idToToggle) {
          const updated = {
            ...l,
            isArchived: !l.isArchived,
          };
          if (auth.currentUser && storageMode === "cloud") {
            saveLesson(auth.currentUser.uid, updated).catch((err) => console.error(err));
          }
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

  const handleTogglePinLesson = (idToToggle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    lastLocalChangeTime.current = Date.now();
    setLessons((prev) => {
      const next = prev.map((l) => {
        if (l.id === idToToggle) {
          const updated = {
            ...l,
            pinned: !l.pinned,
          };
          if (auth.currentUser && storageMode === "cloud") {
            saveLesson(auth.currentUser.uid, updated).catch((err) => console.error(err));
          }
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
          if (auth.currentUser && storageMode === "cloud") {
            saveLesson(auth.currentUser.uid, updated).catch((err) => console.error(err));
          }
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

  const handleListeningTick = (seconds: number) => {
    setListeningSeconds((prev) => {
      const nextVal = Math.round((prev + seconds) * 10) / 10;
      if (auth.currentUser && storageMode === "cloud") {
        saveProfileStats(auth.currentUser.uid, nextVal).catch((err) => console.error(err));
      }
      safeLocalStorageSetItem("vocab_clone_listening", nextVal.toString());
      settingsStore.setItem("vocab_clone_listening", nextVal.toString());
      return nextVal;
    });

    if (activeLesson) {
      listeningBufferRef.current += seconds;
      if (listeningBufferRef.current >= 5) {
        const flushSec = Math.round(listeningBufferRef.current);
        listeningBufferRef.current = 0;
        recordHistoryActivity(activeLesson, "listen", flushSec);
      }
    }
  };

  const handleMediaEnded = (targetLesson: Lesson) => {
    if (!targetLesson || !targetLesson.id) return;
    safeLocalStorageSetItem(`vocab_progress_${targetLesson.id}`, "100");
    recordHistoryActivity(targetLesson, "complete");
  };

  useEffect(() => {
    if (activeLesson && activeTab === "read") {
      const prog = localStorage.getItem(`vocab_progress_${activeLesson.id}`);
      const isCompleted = prog ? parseFloat(prog) >= 100 : false;
      const isAudioOrVideo = !!(
        activeLesson.youtubeId ||
        activeLesson.audioUrl ||
        activeLesson.audioBase64 ||
        activeLesson.lessonType === "podcast" ||
        activeLesson.lessonType === "youtube" ||
        activeLesson.lessonType === "audio"
      );
      recordHistoryActivity(activeLesson, isCompleted ? "complete" : (isAudioOrVideo ? "listen" : "read"));
    }
  }, [activeLesson?.id, activeTab]);

  const layoutContainerClass =
    layoutWidthMode === "standard"
      ? "max-w-7xl"
      : layoutWidthMode === "wide"
      ? "max-w-[1560px]"
      : "max-w-full lg:px-12 md:px-8";

  // Full-Screen Isolated Focused Reading Room
  if (isFocusMode && activeTab === "read" && activeLesson) {
    const focusTheme = readerThemes[readerSettings.readerTheme] || readerThemes.default;
    return (
      <div className={`min-h-screen ${focusTheme.pageBg} ${focusTheme.text} flex flex-col font-sans transition-colors duration-200`}>
        
        {/* Top Focus Header bar */}
        <header className={`border-b ${focusTheme.border} ${focusTheme.headerBg} backdrop-blur-md relative z-30 px-4 sm:px-6 py-3.5`}>
          <div className={`mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300 ${layoutContainerClass}`}>
            
            {/* Back Button */}
            <button
              id="focus-exit-btn"
              onClick={() => {
                setIsFocusMode(false);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 border ${focusTheme.border} ${focusTheme.cardBg} hover:opacity-95 text-inherit font-bold text-xs rounded-xl transition-all active:scale-98 cursor-pointer shadow-xs`}
            >
              ← Выйти из фокуса
            </button>

            {/* Lesson Title Indicators */}
            <div className="text-center flex-1 max-w-xl truncate">
              <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 bg-teal-100/40 dark:bg-teal-950/40 px-2 py-0.5 rounded">
                Режим фокуса
              </span>
              <h2 className="text-sm font-bold text-inherit block truncate mt-1">
                {activeLesson.title}
              </h2>
            </div>

            {/* Typography controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowOnlyUnknown(prev => !prev)}
                className={`flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showOnlyUnknown
                    ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm scale-102"
                    : `${focusTheme.cardBg} ${focusTheme.border} text-inherit hover:opacity-90`
                }`}
                title="Показать только неизвестные слова в уроке"
              >
                {showOnlyUnknown ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>Только неизвестные</span>
              </button>

              {activeLesson?.youtubeId && (
                <button
                  onClick={() => setShowYoutubePlayer((prev) => !prev)}
                  className={`flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap border rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    showYoutubePlayer
                      ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50"
                      : `${focusTheme.cardBg} ${focusTheme.border} text-inherit hover:opacity-90`
                  }`}
                  title="Переключить окно YouTube"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Видео</span>
                </button>
              )}
              <TextSettingsControls settings={readerSettings} onUpdateSettings={setReaderSettings} />
              
              {/* Width Selector */}
              <div className="flex items-center gap-1 bg-stone-100/50 dark:bg-zinc-900/55 p-1 h-9 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 font-sans shrink-0">
                <button
                  type="button"
                  onClick={() => setLayoutWidthMode("standard")}
                  className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    layoutWidthMode === "standard"
                      ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100 dark:border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                  title="Стандартная ширина (1280px)"
                >
                  Стандарт
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutWidthMode("wide")}
                  className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    layoutWidthMode === "wide"
                      ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100 dark:border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                  title="Широкая область (1560px)"
                >
                  Широкий
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutWidthMode("full")}
                  className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    layoutWidthMode === "full"
                      ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100 dark:border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                  title="На весь экран"
                >
                  Экран
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* Focused main container */}
        <main className={`flex-grow w-full mx-auto p-4 sm:p-6 lg:px-8 grid grid-cols-12 gap-6 items-start transition-all duration-300 ${layoutContainerClass}`}>
          
          {/* Middle Main - Reader and Audio player only */}
          <div className="col-span-12 md:col-span-8 lg:col-span-8 space-y-4">
            {(activeLesson.audioUrl || activeLesson.audioBase64) && (
              <AudioPlayerBar
                onAudioUpload={handleAudioUploaded}
                onListeningTick={handleListeningTick}
                onAudioEnded={() => handleMediaEnded(activeLesson)}
              />
            )}

            <ReaderView
              key={activeLesson.id}
              lessonImagesMap={activeLessonImagesMap}
              settings={readerSettings}
              onEditClick={() => setEditingLesson(activeLesson)}
              showOnlyUnknown={showOnlyUnknown}
              history={history}
              onUpdateHistory={handleUpdateHistory}
            />
          </div>

          {/* Right Sidebar - Active Word dictionary */}
          {/* Shared props for WordExplainer — desktop sidebar uses this directly */}
          <div className="hidden md:block md:col-span-4 lg:col-span-4 md:sticky md:top-[85px] max-h-[calc(100vh-110px)] overflow-y-auto pr-1 z-25">
            <WordExplainer
              word={selectedWord}
              sentence={selectedContext}
              targetLanguage={activeLesson.targetLanguage}
              translationLanguage={activeLesson.translationLanguage}
              existingVocab={activeVocabItem}
              wordLinks={wordLinks}
              vocab={vocab}
              onSaveVocab={handleSaveVocabItem}
              onDeleteVocab={handleDeleteVocabItem}
              onSaveWordLink={handleSaveWordLink}
              onDeleteWordLink={handleDeleteWordLink}
              onClose={() => setSelectedWord(null)}
              settings={readerSettings}
              onSettingsChange={(patch) => setReaderSettings(prev => ({ ...prev, ...patch }))}
              onWordClick={handleWordClick}
              lessonText={activeLesson?.text}
              lessons={lessons}
              currentLessonId={activeLesson?.id}
              onOpenLesson={handleOpenLesson}
            />
          </div>

        </main>

        {/* On small screens (< md), if a word is selected, show it in a sliding bottom sheet with overlay */}
        {selectedWord && (
          <div 
            className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setSelectedWord(null)}
          >
            <div 
              className={`font-sans max-h-[80vh] w-full ${focusTheme.cardBg} ${focusTheme.text} rounded-t-3xl border-t ${focusTheme.border} p-1 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center py-2 shrink-0">
                <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-pulse" />
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-32px)] px-3 pb-6">
                <WordExplainer
                  word={selectedWord}
                  sentence={selectedContext}
                  targetLanguage={activeLesson.targetLanguage}
                  translationLanguage={activeLesson.translationLanguage}
                  existingVocab={activeVocabItem}
                  wordLinks={wordLinks}
                  vocab={vocab}
                  onSaveVocab={handleSaveVocabItem}
                  onDeleteVocab={handleDeleteVocabItem}
                  onSaveWordLink={handleSaveWordLink}
                  onDeleteWordLink={handleDeleteWordLink}
                  onClose={() => setSelectedWord(null)}
                  settings={readerSettings}
                  onSettingsChange={(patch) => setReaderSettings(prev => ({ ...prev, ...patch }))}
                  onWordClick={handleWordClick}
                  lessonText={activeLesson?.text}
                  lessons={lessons}
                  currentLessonId={activeLesson?.id}
                  onOpenLesson={handleOpenLesson}
                />
              </div>
            </div>
          </div>
        )}

        {/* Floating Youtube player in Focus Mode */}
        {activeLesson && activeLesson.youtubeId && showYoutubePlayer && (
          <YoutubePlayerWindow
            lesson={activeLesson}
            onClose={() => setShowYoutubePlayer(false)}
            onListeningTick={handleListeningTick}
            onVideoEnded={() => handleMediaEnded(activeLesson)}
          />
        )}

      </div>
    );
  }

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

          {/* Title & Tagline */}
          <div className="space-y-1.5">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              Lectura
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Умное чтение и изучение языков с ИИ
            </p>
          </div>

          {/* Loading bar & spinner */}
          <div className="w-full space-y-2 pt-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                Загрузка материалов...
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
    <div className={`min-h-screen ${currentReaderTheme.pageBg} ${currentReaderTheme.text} flex flex-col font-sans transition-colors duration-200`}>
      
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
        isFocusMode={isFocusMode}
        currentReaderTheme={currentReaderTheme}
        layoutContainerClass={layoutContainerClass}
        setIsSidebarOpen={setIsSidebarOpen}
        setActiveTab={setActiveTab}
        setShowImportForm={setShowImportForm}
        setSelectedWord={setSelectedWord}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        setShowLocalLoginModal={setShowLocalLoginModal}
        storageMode={storageMode}
        isSyncing={isSyncing}
      />

      {cloudOfflineWarning && (
        <div id="banner-cloud-offline-warning" className={`mx-auto px-4 sm:px-6 pt-4 transition-all duration-300 ${layoutContainerClass}`}>
          <div className="bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-3xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 animate-pulse">
                <HelpCircle className="w-5 h-5 opacity-80" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-amber-800 dark:text-amber-400 leading-none">
                  Связь с облаком не установлена (Работа в локальном режиме)
                </h4>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 leading-relaxed">
                  Не удалось подключиться к облачной базе данных Google Firebase. Все функции активны, и ваши данные <strong>сохраняются локально</strong> в кэше браузера. Синхронизация автоматически возобновится при восстановлении связи!
                </p>
                {cloudOfflineError && (
                  <p className="text-[10px] bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/10 p-2 rounded-xl text-amber-800 dark:text-amber-300 font-mono mt-2 break-all">
                    Детали ошибки: {cloudOfflineError}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setCloudOfflineWarning(false)}
              className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl transition cursor-pointer self-stretch sm:self-auto text-center border border-amber-500/10"
            >
              Свернуть
            </button>
          </div>
        </div>
      )}

      {/* Main Body */}
      <main className={`flex-grow w-full mx-auto p-4 sm:p-6 space-y-6 transition-all duration-300 ${layoutContainerClass}`}>
        
        {/* Dynamic Achievements HUD Panel */}
        {activeTab !== "read" && activeTab !== "practice" && activeTab !== "history" && <StatsWidget stats={calculatedStats} />}

        {showImportForm || editingLesson ? (
          /* Import customized forms screen */
          <div className="py-2">
            <ImportLessonForm
              editingLesson={editingLesson}
              lessonTypes={lessonTypes}
              onCreateLessonType={handleCreateLessonType}
              onDeleteLessonType={handleDeleteLessonType}
              onUpdateLessonType={handleUpdateLessonType}
              initialWebUrl={initialImportUrl}
              onAddLesson={(newOrUpdated, images) => {
                lastLocalChangeTime.current = Date.now();
                if (editingLesson) {
                  setLessons((prev) => {
                    const next = prev.map((l) => (l.id === editingLesson.id ? newOrUpdated : l));
                    return next;
                  });
                  if (auth.currentUser && storageMode === "cloud") {
                    saveLesson(auth.currentUser.uid, newOrUpdated, images).catch((err) => console.error(err));
                  }
                  if (storageMode === "server") {
                    syncDataToLocalServer(
                      lessons.map((l) => (l.id === editingLesson.id ? newOrUpdated : l))
                    ).catch((err) => console.error(err));
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
        ) : activeTab === "library" ? (
          /* Beautiful visual library homepage */
          <div className="py-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <LibraryHome
              lessons={lessons}
              lessonTypes={lessonTypes}
              onSelectLesson={(id) => {
                setActiveLessonId(id);
                setSelectedWord(null);
                setActiveTab("read");
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
              settings={readerSettings}
              isLoading={isInitialServerLoading}
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
              readerSettings={readerSettings}
              onUpdateSettings={setReaderSettings}
            />
          </div>
        ) : (
          /* Main Interactive Reader View Grid */
          <>
            <div className="grid grid-cols-12 gap-6 items-start">

              {/* Middle Main - Reader and Audio player - 8 cols on tablets and desktops */}
              <div className="col-span-12 md:col-span-8 lg:col-span-8 min-w-0 space-y-4 animate-in fade-in duration-150">
                {activeLesson ? (
                  <>
                    {/* Quiet minimal inline toolbar */}
                    <div className="flex items-center justify-between gap-x-3 gap-y-2 pb-2.5 pt-1 border-b border-zinc-200/40 dark:border-zinc-800/40 animate-in fade-in duration-200">
                      {/* Left side actions scrollable bar */}
                      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar min-w-0 flex-1 pr-1">
                        <button
                          onClick={() => {
                            setActiveTab("library");
                            setSelectedWord(null);
                          }}
                          className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 text-xs font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:shadow-xs transition-all active:scale-97 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Библиотека
                        </button>

                        <button
                          onClick={() => setIsFocusMode(true)}
                          className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-bold rounded-xl transition-all active:scale-97 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Focus Mode
                        </button>

                        <button
                          onClick={() => setShowMatchPairsModal(true)}
                          className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-bold rounded-xl transition-all active:scale-97 cursor-pointer"
                          title="Игра: сопоставление слов и перевода"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          Игра: Пары
                        </button>

                        <button
                          onClick={handleDetectIdioms}
                          disabled={isDetectingIdioms}
                          className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-bold rounded-xl transition-all active:scale-97 cursor-pointer disabled:opacity-50"
                          title="Автоматически найти идиомы и фразовые глаголы с помощью ИИ"
                        >
                          {isDetectingIdioms ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Поиск...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Найти идиомы
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setShowOnlyUnknown(prev => !prev)}
                          className={`flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            showOnlyUnknown
                              ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm"
                              : "bg-white hover:bg-zinc-55 hover:text-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
                          }`}
                          title="Показать только неизвестные слова в уроке"
                        >
                          {showOnlyUnknown ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span>Только неизвестные</span>
                        </button>

                        {activeLesson?.youtubeId && (
                          <button
                            onClick={() => setShowYoutubePlayer((prev) => !prev)}
                            className={`flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              showYoutubePlayer
                                ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50"
                                : "bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
                            }`}
                            title="Toggle YouTube Video window"
                          >
                            <Tv className="w-3.5 h-3.5" />
                            <span>Видео</span>
                          </button>
                        )}

                        {/* Width Selector */}
                        <div className="flex items-center gap-0.5 bg-stone-100/50 dark:bg-zinc-900/55 p-0.5 h-8 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 font-sans shrink-0">
                          <button
                            type="button"
                            onClick={() => setLayoutWidthMode("standard")}
                            className={`h-6 px-1.5 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              layoutWidthMode === "standard"
                                ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                            }`}
                            title="Default width (1280px)"
                          >
                            Стандарт
                          </button>
                          <button
                            type="button"
                            onClick={() => setLayoutWidthMode("wide")}
                            className={`h-6 px-1.5 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              layoutWidthMode === "wide"
                                ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                            }`}
                            title="Wide width (1560px)"
                          >
                            Широкий
                          </button>
                          <button
                            type="button"
                            onClick={() => setLayoutWidthMode("full")}
                            className={`h-6 px-1.5 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              layoutWidthMode === "full"
                                ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                            }`}
                            title="Full screen width"
                          >
                            Экран
                          </button>
                        </div>
                      </div>

                      {/* Right side settings buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <TextSettingsControls settings={readerSettings} onUpdateSettings={setReaderSettings} />
                      </div>
                    </div>

                    {/* Interactive Audio Player */}
                    {(activeLesson.audioUrl || activeLesson.audioBase64) && (
                      <AudioPlayerBar
                        onAudioUpload={handleAudioUploaded}
                        onListeningTick={handleListeningTick}
                        onAudioEnded={() => handleMediaEnded(activeLesson)}
                      />
                    )}

                    <ReaderView
                      key={activeLesson.id}
                      lessonImagesMap={activeLessonImagesMap}
                      settings={readerSettings}
                      onEditClick={() => setEditingLesson(activeLesson)}
                      showOnlyUnknown={showOnlyUnknown}
                      history={history}
                      onUpdateHistory={handleUpdateHistory}
                    />
                  </>
                ) : (
                  <div className="bg-white dark:bg-zinc-900 p-12 text-center rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-4">
                    <BookOpen className="w-12 h-12 text-zinc-300 mx-auto" />
                    <p className="text-zinc-500 dark:text-zinc-400">No lessons currently chosen. Go to the Library tab to selects or import lessons!</p>
                  </div>
                )}
              </div>

              {/* Right Sidebar - Active Word Explainer definitions */}
              <div className="hidden md:block md:col-span-4 lg:col-span-4 md:sticky md:top-[24px] max-h-[calc(100vh-48px)] overflow-y-auto pr-1 z-25">
                <div className="h-full">
                  {activeLesson ? (
                    <WordExplainer
                      word={selectedWord}
                      sentence={selectedContext}
                      targetLanguage={activeLesson.targetLanguage}
                      translationLanguage={activeLesson.translationLanguage}
                      existingVocab={activeVocabItem}
                      wordLinks={wordLinks}
                      vocab={vocab}
                      onSaveVocab={handleSaveVocabItem}
                      onDeleteVocab={handleDeleteVocabItem}
                      onSaveWordLink={handleSaveWordLink}
                      onDeleteWordLink={handleDeleteWordLink}
                      onClose={() => setSelectedWord(null)}
                      settings={readerSettings}
                      onSettingsChange={(patch) => setReaderSettings(prev => ({ ...prev, ...patch }))}
                      onWordClick={handleWordClick}
                      lessonText={activeLesson?.text}
                      lessons={lessons}
                      detectedPhrases={activeLesson.detectedPhrases}
                      currentLessonId={activeLesson?.id}
                      onOpenLesson={handleOpenLesson}
                    />
                  ) : (
                    <div className="text-center p-4 text-zinc-400">Select a lesson first</div>
                  )}
                </div>
              </div>

            </div>
            
            {/* On small screens (< md), if a word is selected, show it in a sliding bottom sheet with overlay */}
            {selectedWord && activeLesson && (
              <div 
                className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
                onClick={() => setSelectedWord(null)}
              >
                <div 
                  className={`font-sans max-h-[80vh] w-full ${currentReaderTheme.cardBg} ${currentReaderTheme.text} rounded-t-3xl border-t ${currentReaderTheme.border} p-1 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-center py-2 shrink-0">
                    <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-pulse" />
                  </div>
                  <div className="overflow-y-auto max-h-[calc(80vh-32px)] px-3 pb-6">
                    <WordExplainer
                      word={selectedWord}
                      sentence={selectedContext}
                      targetLanguage={activeLesson.targetLanguage}
                      translationLanguage={activeLesson.translationLanguage}
                      existingVocab={activeVocabItem}
                      wordLinks={wordLinks}
                      vocab={vocab}
                      onSaveVocab={handleSaveVocabItem}
                      onDeleteVocab={handleDeleteVocabItem}
                      onSaveWordLink={handleSaveWordLink}
                      onDeleteWordLink={handleDeleteWordLink}
                      onClose={() => setSelectedWord(null)}
                      settings={readerSettings}
                      onSettingsChange={(patch) => setReaderSettings(prev => ({ ...prev, ...patch }))}
                      onWordClick={handleWordClick}
                      lessonText={activeLesson?.text}
                      lessons={lessons}
                      detectedPhrases={activeLesson.detectedPhrases}
                      currentLessonId={activeLesson?.id}
                      onOpenLesson={handleOpenLesson}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="py-6 border-t border-zinc-200/50 dark:border-zinc-900 text-center text-xs text-zinc-400 dark:text-zinc-600 bg-stone-50 dark:bg-zinc-950/40">
        <p className="leading-relaxed">
          Lectura {APP_VERSION} &copy; 2026. Powered by Google Gemini ИИ. Интерактивная система чтения и изучения языков.
        </p>
      </footer>

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
        languageFlags={languageFlags}
        onSaveLanguageFlag={(lang, flag) => {
          const nextFlags = {
            ...languageFlags,
            [lang.toLowerCase()]: flag
          };
          setLanguageFlags(nextFlags);
          if (auth.currentUser && storageMode === "cloud") {
            saveProfileSettings(auth.currentUser.uid, { languageFlags: nextFlags }).catch(err => console.error(err));
          }
        }}
        onResetLanguageFlags={() => {
          setLanguageFlags({});
          if (auth.currentUser && storageMode === "cloud") {
            saveProfileSettings(auth.currentUser.uid, { languageFlags: {} }).catch(err => console.error(err));
          }
        }}
        wordLinks={wordLinks}
        onDeleteWordLink={handleDeleteWordLink}
        zoomScale={zoomScale}
        onZoomScaleChange={setZoomScale}
        layoutWidthMode={layoutWidthMode}
        onLayoutWidthModeChange={setLayoutWidthMode}
        storageMode={storageMode}
        onStorageModeChange={setStorageMode}
        localSyncKey={localSyncKey}
        onLocalSyncKeyChange={setLocalSyncKey}
        localSyncError={localSyncError}
        firebaseUser={activeUser}
        activeUser={activeUser}
        vocab={vocab}
        lessonTypes={lessonTypes}
        listeningSeconds={listeningSeconds}
        onListeningSecondsChange={(seconds) => {
          setListeningSeconds(seconds);
          safeLocalStorageSetItem("vocab_clone_listening", seconds.toString());
          settingsStore.setItem("vocab_clone_listening", seconds.toString());
          if (auth.currentUser && storageMode === "cloud") {
            saveProfileStats(auth.currentUser.uid, seconds).catch((err) => console.error(err));
          }
          if (storageMode === "server") {
            syncDataToLocalServer(lessons, lessonTypes, vocab, wordLinks, seconds, languageFlags).catch((err) => console.error(err));
          }
        }}
        onImportData={(imported: any) => {
          const importedVocab = imported.vocab || imported.lingqs || imported.lingq;
          const parsedVocab = importedVocab ? normalizeVocabRecord(importedVocab) : vocab;
          const parsedWordLinks = imported.wordLinks ? normalizeWordLinksRecord(imported.wordLinks) : wordLinks;
          const parsedLessons = imported.lessons || lessons;
          const parsedLessonTypes = imported.lessonTypes || lessonTypes;
          const parsedListeningSeconds = imported.listeningSeconds !== undefined ? imported.listeningSeconds : listeningSeconds;
          const parsedLanguageFlags = imported.languageFlags || languageFlags;

          if (imported.lessons) {
            setLessons(imported.lessons);
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

          // Force update local storage instantly
          if (imported.lessons) safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(imported.lessons));
          if (imported.lessonTypes) safeLocalStorageSetItem("vocab_clone_lessontypes", JSON.stringify(imported.lessonTypes));
          if (importedVocab) safeLocalStorageSetItem("vocab_clone_words", JSON.stringify(parsedVocab));
          if (imported.wordLinks) safeLocalStorageSetItem("vocab_clone_aliases", JSON.stringify(parsedWordLinks));
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
              parsedLanguageFlags
            ).catch(err => console.error("Local server import sync error:", err));
          }

          // Upload to cloud if logged in and cloud sync is active
          if (storageMode === "cloud" && activeUser) {
            uploadLocalToCloud(
              activeUser.uid,
              parsedLessons,
              parsedLessonTypes,
              parsedVocab,
              parsedWordLinks,
              parsedListeningSeconds,
              parsedLanguageFlags
            ).catch(err => console.error("Cloud import sync error:", err));
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

          // Clear Cloud Firestore database if in Cloud Mode
          if (storageMode === "cloud" && activeUser) {
            try {
              setIsSyncing(true);
              await clearAllUserDataOnFirestore(activeUser.uid);
            } catch (err) {
              console.error("Failed to clear Cloud database:", err);
            } finally {
              setIsSyncing(false);
            }
          } else if (storageMode === "server") {
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
        onManualSync={async () => {
          if (activeUser) {
            try {
              await uploadLocalToCloud(
                activeUser.uid,
                lessons,
                lessonTypes,
                vocab,
                wordLinks,
                listeningSeconds,
                languageFlags
              );
            } catch (err) {
              console.error("Manual cloud sync failed:", err);
            }
          }
        }}
        isSyncing={isSyncing}
        settings={readerSettings}
        onSettingsChange={(patch) => setReaderSettings(prev => ({ ...prev, ...patch }))}
      />

      {/* Local/Guest Auth fallback Modal */}
      <AuthModal
        isOpen={showLocalLoginModal}
        onClose={() => setShowLocalLoginModal(false)}
        onLocalServerLogin={() => {
          serverInitialLoadComplete.current = false;
        }}
      />
      {/* Floating draggable/resizable YouTube player window */}
      {activeLesson && activeLesson.youtubeId && showYoutubePlayer && activeTab === "read" && (
        <YoutubePlayerWindow
          lesson={activeLesson}
          onClose={() => setShowYoutubePlayer(false)}
          onListeningTick={handleListeningTick}
          onVideoEnded={() => handleMediaEnded(activeLesson)}
        />
      )}

      {/* iOS Safari PWA Install Banner */}
      {showIosInstallBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 z-[9999] flex items-start gap-3 animate-in slide-in-from-bottom duration-300 text-zinc-800 dark:text-zinc-200">
          <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">Установить Lectura</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
              Нажмите кнопку <span className="font-bold">«Поделиться»</span> (Share) в меню браузера Safari, затем выберите <span className="font-bold">«На экран "Домой"»</span> (Add to Home Screen) для установки приложения.
            </p>
          </div>
          <button 
            onClick={() => {
              setShowIosInstallBanner(false);
              safeLocalStorageSetItem('ios_pwa_banner_dismissed', 'true');
            }}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
