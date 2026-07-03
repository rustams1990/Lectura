/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Lesson, LessonType, VocabItem, WordStatus, AppStats, ReaderSettings } from "./types";
import { BUILT_IN_LESSONS, DEFAULT_LESSON_TYPES } from "./data";
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
import ReaderPanel from "./components/ReaderPanel";
import WordExplainer from "./components/WordExplainer";
import AudioPlayer from "./components/AudioPlayer";
import StatsWidget from "./components/StatsWidget";
import ImportLessonForm from "./components/ImportLessonForm";
import VocabularyPractice from "./components/VocabularyPractice";
import MatchPairsModal from "./components/MatchPairsModal";
import TextSettingsControls from "./components/TextSettingsControls";
import LibraryHome from "./components/LibraryHome";
import StatisticsPage from "./components/StatisticsPage";
import SettingsModal from "./components/SettingsModal";
import {
  setLessonImages,
  getLessonImagesMap,
  mergeLessonImages,
  removeLessonImages,
} from "./lessonImagesStore";
import YoutubePlayerWindow from "./components/YoutubePlayerWindow";
import { BookOpen, PlusCircle, GraduationCap, Headphones, Languages, Trash2, HelpCircle, Sparkles, BookMarked, TrendingUp, Pencil, Settings, ChevronLeft, Menu, X, Tv, Maximize2, Trophy, Loader2, Moon, Sun, Eye, EyeOff } from "lucide-react";
import { safeJsonParse, safeLocalStorageSetItem, normalizeContraction } from "./utils";

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
  charcoal: {
    pageBg: "bg-zinc-900",
    text: "text-[#eaeaea]",
    headerBg: "bg-zinc-950/90 border-zinc-800",
    cardBg: "bg-zinc-950",
    border: "border-zinc-800",
  },
};





function migrateLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const keys = [
    "words",
    "translation_source",
    "custom_tags",
    "lessons",
    "lessontypes",
    "listening",
    "aliases",
    "language_flags",
    "focus_mode",
    "layout_width",
    "reader_settings",
    "interface_zoom",
    "local_user",
    "storage_mode",
    "daily_word_goal",
    "last_active_lesson_id"
  ];
  keys.forEach(k => {
    const oldKey = `lingq_clone_${k}`;
    const newKey = `vocab_clone_${k}`;
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
    }
  });

  const exactKeys = [
    "lingq_default_target_language",
    "lingq_default_translation_language",
    "lingq_books_per_row"
  ];
  exactKeys.forEach(oldKey => {
    const newKey = oldKey.replace("lingq_", "vocab_");
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
    }
  });
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      if (key.startsWith("lingq_clone_dicts_")) {
        const newKey = key.replace("lingq_clone_dicts_", "vocab_clone_dicts_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(key));
        }
      } else if (key.startsWith("lingq_progress_")) {
        const newKey = key.replace("lingq_progress_", "vocab_progress_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(key));
        }
      }
    }
  }
}
migrateLocalStorage();

function safeParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch (err) {
    console.warn("Failed to parse stored JSON, falling back:", err);
    return fallback;
  }
}

function normalizeLanguagePrefixedKey(key: string): string {
  let k = key;
  while (k.match(/^([a-zA-Z]+)_\1_/i)) {
    k = k.replace(/^([a-zA-Z]+)_\1_/i, "$1_");
  }
  return k;
}

function normalizeVocabRecord(record: Record<string, VocabItem> | any[] | undefined): Record<string, VocabItem> {
  if (!record || typeof record !== "object") return {};
  const normalized: Record<string, VocabItem> = {};

  const entries = Array.isArray(record)
    ? record.map((val, idx) => [String(idx), val] as [string, any])
    : Object.entries(record);

  for (const [key, value] of entries) {
    if (!value || typeof value !== "object") continue;

    // Detect numeric/array key
    const isNumericKey = /^\d+$/.test(key);

    // Determine language prefix
    let lang = "";
    if (!isNumericKey) {
      const parts = key.split("_");
      if (parts.length > 1) {
        lang = parts[0].toLowerCase();
      }
    }

    // Fallback: search in properties
    if (!lang) {
      const valLang = value.language_code || value.language || value.targetLanguage;
      if (typeof valLang === "string") {
        lang = valLang.toLowerCase();
      }
    }

    // Default fallback
    if (!lang) {
      lang = "english";
    }

    const rawWord = typeof value.word === "string" ? value.word : "";
    const cleanWord = rawWord.replace(/^[a-zA-Z]+_/, "");
    if (!cleanWord) continue;

    const cleanKey = `${lang}_${cleanWord.toLowerCase()}`;

    // Handle string/number status values
    let cleanStatus: WordStatus = "known";
    const rawStatus = typeof value.status === "string"
      ? value.status
      : typeof value.status === "number"
        ? String(value.status)
        : "";

    if (rawStatus === "1" || rawStatus === "2" || rawStatus === "3" || rawStatus === "4" || rawStatus === "5" || rawStatus === "known" || rawStatus === "ignored" || rawStatus === "new") {
      cleanStatus = rawStatus as WordStatus;
    } else if (rawStatus === "learning") {
      cleanStatus = "1";
    } else {
      cleanStatus = "known";
    }

    normalized[cleanKey] = {
      word: cleanWord,
      translation: typeof value.translation === "string" ? value.translation : "",
      grammar: typeof value.grammar === "string" ? value.grammar : "",
      ipa: typeof value.ipa === "string" ? value.ipa : "",
      contextRelation: typeof value.contextRelation === "string" ? value.contextRelation : "",
      status: cleanStatus,
      createdAt: typeof value.createdAt === "number" && !isNaN(value.createdAt) ? value.createdAt : Date.now(),
      tags: Array.isArray(value.tags) ? value.tags.filter((t) => typeof t === "string") : [],
      examples: Array.isArray(value.examples) ? value.examples : [],
      imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    };
  }
  return normalized;
}

function normalizeWordLinksRecord(record: Record<string, string> | undefined): Record<string, string> {
  if (!record || typeof record !== "object") return {};
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof key !== "string" || typeof val !== "string") continue;
    const cleanKey = normalizeLanguagePrefixedKey(key);
    const cleanVal = normalizeLanguagePrefixedKey(val);
    normalized[cleanKey] = cleanVal;
  }
  return normalized;
}

const isLocalHostname = (): boolean => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.")
  );
};

export default function App() {
  // Durable browser persistence states
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const saved = localStorage.getItem("vocab_clone_lessons");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return BUILT_IN_LESSONS;
  });

  const [lessonTypes, setLessonTypes] = useState<LessonType[]>(() => {
    const saved = localStorage.getItem("vocab_clone_lessontypes");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return DEFAULT_LESSON_TYPES;
  });

  const [vocab, setVocab] = useState<Record<string, VocabItem>>(() => {
    const saved = localStorage.getItem("vocab_clone_words");
    if (saved) {
      try {
        return normalizeVocabRecord(JSON.parse(saved));
      } catch (err) {
        console.error(err);
      }
    }
    return {};
  });

  const [listeningSeconds, setListeningSeconds] = useState<number>(() => {
    const saved = localStorage.getItem("vocab_clone_listening");
    if (saved) {
      const num = parseFloat(saved);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  });

  // Word plural/singular mapping rules state (e.g. zorros -> zorro)
  const [wordLinks, setWordLinks] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("vocab_clone_aliases");
    if (saved) {
      try {
        return normalizeWordLinksRecord(JSON.parse(saved));
      } catch (err) {
        console.error(err);
      }
    }
    return {};
  });

  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    return lessons[0]?.id || "";
  });
  const [lessonImagesVersion, setLessonImagesVersion] = useState(0);

  // Navigation states
  const [activeTab, setActiveTab] = useState<"library" | "read" | "practice" | "statistics">("library");
  const [showImportForm, setShowImportForm] = useState(false);
  const [initialImportUrl, setInitialImportUrl] = useState<string | null>(null);
  const [showYoutubePlayer, setShowYoutubePlayer] = useState<boolean>(true);
  const [youtubePlayTime, setYoutubePlayTime] = useState<number | null>(null);
  const [youtubeSeekToTime, setYoutubeSeekToTime] = useState<number | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [showMatchPairsModal, setShowMatchPairsModal] = useState<boolean>(false);
  const [isDetectingIdioms, setIsDetectingIdioms] = useState<boolean>(false);
  const lastLocalChangeTime = useRef<number>(0);

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
    console.log("DEBUG [App]: window.location.search =", window.location.search);
    console.log("DEBUG [App]: parsed import_url =", importUrl);
    if (importUrl) {
      console.log("DEBUG [App]: Setting initialImportUrl and opening import form");
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
  const [languageFlags, setLanguageFlags] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("vocab_clone_language_flags");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return {};
  });
  const [isFocusMode, setIsFocusMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("vocab_clone_focus_mode");
    return saved !== null ? saved === "true" : true;
  });
  const [showOnlyUnknown, setShowOnlyUnknown] = useState<boolean>(false);

  const [layoutWidthMode, setLayoutWidthMode] = useState<"standard" | "wide" | "ultra" | "full">(() => {
    const saved = localStorage.getItem("vocab_clone_layout_width");
    // Migrate 'standard' to 'full' — full-width looks better especially at zoom > 100%
    if (!saved || saved === "standard") {
      localStorage.setItem("vocab_clone_layout_width", "full");
      return "full";
    }
    return (saved as "standard" | "wide" | "ultra" | "full");
  });

  // Customizable reader options (Fonts family, background tone, size, spacing, container width)
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem("vocab_clone_reader_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          aiProvider: "gemini",
          localAiUrl: "http://localhost:11434/api/generate",
          localAiModel: "phi3.5",
          showDetailedVocabularyStats: true,
          mainStatsMetric: "comprehension",
          ...parsed
        };
      } catch (err) {
        console.error("Failed to parse reader settings:", err);
      }
    }
    return {
      fontSize: "xl", // default cozy legible font size
      lineHeight: "loose",
      fontFamily: "sans",
      readerTheme: "default",
      maxWidth: "medium",
      pageSize: "auto",
      sentenceSpacing: "normal",
      ttsEngine: "google",
      ttsLocale: "en-US",
      aiProvider: "gemini",
      localAiUrl: "http://localhost:11434/api/generate",
      localAiModel: "phi3.5",
      showDetailedVocabularyStats: true,
      mainStatsMetric: "comprehension",
    };
  });

  // Zoom level state (default is 100 representing 100%)
  const [zoomScale, setZoomScale] = useState<number>(() => {
    const saved = localStorage.getItem("vocab_clone_interface_zoom");
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_interface_zoom", zoomScale.toString());
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
    const saved = localStorage.getItem("vocab_clone_dark_mode");
    if (saved !== null) return saved === "true";
    // Default to system preference
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_dark_mode", isDarkMode ? "true" : "false");
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Firebase Auth & Cloud Sync States
  const [user, setUser] = useState<any>(null);
  const [localUser, setLocalUser] = useState<any>(() => {
    const saved = localStorage.getItem("vocab_clone_local_user");
    return safeParse(saved, null);
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [showLocalLoginModal, setShowLocalLoginModal] = useState<boolean>(false);
  const [localNameInput, setLocalNameInput] = useState<string>("");
  const [isLocalServerRegister, setIsLocalServerRegister] = useState<boolean>(false);
  const [localServerEmail, setLocalServerEmail] = useState<string>("");
  const [localServerPassword, setLocalServerPassword] = useState<string>("");
  const [localServerName, setLocalServerName] = useState<string>("");
  const [isLocalServerAuthLoading, setIsLocalServerAuthLoading] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudOfflineWarning, setCloudOfflineWarning] = useState<boolean>(false);
  const [cloudOfflineError, setCloudOfflineError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [isEmailRegister, setIsEmailRegister] = useState<boolean>(false);
  const [emailAuthLoading, setEmailAuthLoading] = useState<boolean>(false);
  const [storageMode, setStorageMode] = useState<"cloud" | "local" | "server">(() => {
    const saved = localStorage.getItem("vocab_clone_storage_mode");
    if (saved === "cloud" || saved === "local" || saved === "server") {
      return saved;
    }
    return isLocalHostname() ? "server" : "cloud";
  });

  const [authModalTab, setAuthModalTab] = useState<"local" | "cloud">(() => {
    return isLocalHostname() ? "local" : "cloud";
  });

  const [localSyncKey, setLocalSyncKey] = useState<string>(() => {
    return localStorage.getItem("vocab_clone_local_sync_key") || "";
  });

  const [localSyncError, setLocalSyncError] = useState<boolean>(false);

  const [serverToken, setServerToken] = useState<string>(() => {
    return localStorage.getItem("vocab_clone_server_token") || "";
  });

  useEffect(() => {
    if (serverToken) {
      localStorage.setItem("vocab_clone_server_token", serverToken);
    } else {
      localStorage.removeItem("vocab_clone_server_token");
    }
  }, [serverToken]);

  // Check self-hosted session on mount
  useEffect(() => {
    const checkServerSession = async () => {
      const savedToken = localStorage.getItem("vocab_clone_server_token");
      if (!savedToken) {
        setIsAuthLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            "Authorization": `Bearer ${savedToken}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setLocalUser(data.user);
            setStorageMode("server");
            localStorage.setItem("vocab_clone_storage_mode", "server");
            setLocalSyncError(false);
          }
        } else {
          console.warn("Server session token invalid or expired, logging out.");
          localStorage.removeItem("vocab_clone_server_token");
          setServerToken("");
          setLocalUser(null);
        }
      } catch (err) {
        console.error("Failed to verify server session:", err);
      } finally {
        setIsAuthLoading(false);
      }
    };

    if (storageMode === "server") {
      checkServerSession();
    } else {
      setIsAuthLoading(false);
    }
  }, [storageMode, serverToken]);

  const activeUser = storageMode === "cloud" ? user : storageMode === "server" ? localUser : null;

  const serverInitialLoadComplete = useRef<boolean>(false);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_storage_mode", storageMode);
  }, [storageMode]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_local_sync_key", localSyncKey);
    setLocalSyncError(false); // Reset error status when key is edited
  }, [localSyncKey]);

  // Auto-show login/profile selection modal on launch if no profile is active
  useEffect(() => {
    if (!isAuthLoading && !activeUser) {
      setShowLocalLoginModal(true);
    }
  }, [isAuthLoading, activeUser]);

  const handleServerAuthSubmit = async (emailInputVal: string, passwordInputVal: string, nameInputVal: string, isRegisterVal: boolean) => {
    const email = emailInputVal.trim();
    const password = passwordInputVal.trim();
    const name = nameInputVal.trim();

    if (!email || !password) {
      setAuthError("Пожалуйста, введите email/логин и пароль.");
      return;
    }

    setAuthError(null);
    setIsLocalServerAuthLoading(true);

    try {
      // 1. Sign out of Firebase Cloud if logged in to avoid conflict
      if (auth.currentUser) {
        await signOut(auth);
      }

      // 2. Perform server authentication request
      const url = isRegisterVal ? "/api/auth/register" : "/api/auth/login";
      const body = isRegisterVal 
        ? { email, password, name }
        : { email, password };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка авторизации");
      }

      if (data.token && data.user) {
        localStorage.setItem("vocab_clone_server_token", data.token);
        localStorage.setItem("vocab_clone_local_user", JSON.stringify(data.user));
        localStorage.setItem("vocab_clone_storage_mode", "server");
        setServerToken(data.token);
        setLocalUser(data.user);
        serverInitialLoadComplete.current = false;
        setStorageMode("server");
        setLocalSyncError(false);

        // Reset fields
        setLocalServerEmail("");
        setLocalServerPassword("");
        setLocalServerName("");
        setShowLocalLoginModal(false);
      }
    } catch (err: any) {
      console.error("Local server auth error:", err);
      setAuthError(err.message || String(err));
    } finally {
      setIsLocalServerAuthLoading(false);
    }
  };

  const loadDataFromLocalServer = async () => {
    if (storageMode === "server" && Date.now() - lastLocalChangeTime.current < 8000) {
      console.log("Skipping server database poll to avoid overwriting pending local changes.");
      return;
    }
    if (isAuthLoading) return;
    if (localSyncError) return;
    setIsSyncing(true);
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
          console.log("Skipping server database poll update to avoid overwriting pending local changes (post-fetch check).");
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

          // Sync into localStorage as fallback buffer
          if (d.lessons) safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(d.lessons));
          if (d.lessonTypes) safeLocalStorageSetItem("vocab_clone_lessontypes", JSON.stringify(d.lessonTypes));
          safeLocalStorageSetItem("vocab_clone_words", JSON.stringify(normalizedCloudVocab));
          safeLocalStorageSetItem("vocab_clone_aliases", JSON.stringify(normalizedCloudWordLinks));
          if (d.listeningSeconds !== undefined) safeLocalStorageSetItem("vocab_clone_listening", d.listeningSeconds.toString());
          if (d.languageFlags) safeLocalStorageSetItem("vocab_clone_language_flags", JSON.stringify(d.languageFlags));

          serverInitialLoadComplete.current = true;
        } else if (body.status === "empty") {
          // Empty server database: Seed with current browser's local state
          const localLessonsStr = localStorage.getItem("vocab_clone_lessons");
          const localTypesStr = localStorage.getItem("vocab_clone_lessontypes");
          const localWordsStr = localStorage.getItem("vocab_clone_words");
          const localListeningStr = localStorage.getItem("vocab_clone_listening");
          const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
          const localFlagsStr = localStorage.getItem("vocab_clone_language_flags");

          const lLessons = safeParse(localLessonsStr, BUILT_IN_LESSONS);
          const lTypes = safeParse(localTypesStr, DEFAULT_LESSON_TYPES);
          const lWords = normalizeVocabRecord(safeParse(localWordsStr, {}));
          const lListening = localListeningStr ? parseFloat(localListeningStr) || 0 : 0;
          const lWordLinks = normalizeWordLinksRecord(safeParse(localAliasesStr, {}));
          const lLanguageFlags = safeParse(localFlagsStr, {});

          setLessons(lLessons);
          setLessonTypes(lTypes);
          setVocab(lWords);
          setListeningSeconds(lListening);
          setWordLinks(lWordLinks);
          setLanguageFlags(lLanguageFlags);

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
    }
  };

  const syncDataToLocalServer = async (
    currentLessons = lessons,
    currentTypes = lessonTypes,
    currentVocab = vocab,
    currentLinks = wordLinks,
    currentListening = listeningSeconds,
    currentFlags = languageFlags
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
        console.log("Firebase user detected while in Server mode. Signing out of Firebase.");
        signOut(auth).catch(err => console.error("Firebase signout failed:", err));
        setUser(null);
        return;
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        // Automatically align storageMode to "cloud" when logged in via Firebase
        if (storageMode !== "cloud") {
          console.log("Firebase user authenticated. Forcing storageMode to 'cloud' for proper sync.");
          setStorageMode("cloud");
          localStorage.setItem("vocab_clone_storage_mode", "cloud");
          return; // The change in storageMode will trigger a re-run of this useEffect
        }
      }

      if (storageMode === "cloud") {
        const savedToken = localStorage.getItem("vocab_clone_server_token");
        if (savedToken) {
          console.log("Local server session detected while in Cloud mode. Clearing local server session.");
          fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Authorization": `Bearer ${savedToken}` }
          }).catch(err => console.error("Server logout request failed:", err));
          setLocalUser(null);
          localStorage.removeItem("vocab_clone_local_user");
          localStorage.removeItem("vocab_clone_server_token");
          setServerToken("");
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
          const lTypes = safeParse(localTypesStr, DEFAULT_LESSON_TYPES) as LessonType[];
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
            console.log("Merging local data into cloud...", {
              lessonsCount: missingLessons.length,
              typesCount: missingTypes.length,
              wordsCount: Object.keys(missingWords).length,
              linksCount: Object.keys(missingLinks).length
            });
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
                      console.log("Auth session changed or user signed out; aborting image loading.");
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
      setIsAuthLoading(false);
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
        console.log("Tab became visible/focused. Syncing from server...");
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

  // Active word translate helpers
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);

  // Sync state to local storage
  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(lessons));
  }, [lessons]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_lessontypes", JSON.stringify(lessonTypes));
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
    safeLocalStorageSetItem("vocab_clone_words", JSON.stringify(vocab));
  }, [vocab]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_listening", listeningSeconds.toString());
  }, [listeningSeconds]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_aliases", JSON.stringify(wordLinks));
  }, [wordLinks]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_reader_settings", JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_language_flags", JSON.stringify(languageFlags));
  }, [languageFlags]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_focus_mode", isFocusMode ? "true" : "false");
  }, [isFocusMode]);

  useEffect(() => {
    safeLocalStorageSetItem("vocab_clone_layout_width", layoutWidthMode);
  }, [layoutWidthMode]);

  // Derive current active objects
  const activeLesson = useMemo(() => {
    return lessons.find((l) => l.id === activeLessonId) || lessons[0];
  }, [lessons, activeLessonId]);

  const activeLessonWords = useMemo(() => {
    if (!activeLesson) return [];
    const regex = /[\p{L}\p{M}]+/gu;
    const tokens = activeLesson.text.toLowerCase().match(regex) || [];
    
    const lang = activeLesson.targetLanguage.toLowerCase();
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

    return {
      listeningSeconds: Math.round(listeningSeconds),
      wordsKnownCount: known,
      wordsLearningCount: learning,
    };
  }, [vocab, listeningSeconds]);

  // Event handlers
  const handleWordClick = (word: string, context: string) => {
    const normalizedWord = word.replace(/\s+/g, " ").trim();
    const normalizedContext = context.replace(/\s+/g, " ").trim();
    setSelectedWord(normalizedWord);
    setSelectedContext(normalizedContext);
    setActiveTab("read"); // Force return to reader screen
  };

  const handleOpenLesson = (lessonId: string, word: string, sentence: string) => {
    const normalizedWord = word.replace(/\s+/g, " ").trim();
    const normalizedContext = sentence.replace(/\s+/g, " ").trim();
    setActiveLessonId(lessonId);
    setSelectedWord(normalizedWord);
    setSelectedContext(normalizedContext);
    setActiveTab("read");
  };

  // Helper to find all linked words for a root pattern or a word form
  const getLinkedWordsFor = (word: string, lang: string): string[] => {
    const list = new Set<string>();
    const lowerWord = word.toLowerCase();
    list.add(lowerWord);

    const visited = new Set<string>();
    const queue = [lowerWord];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      list.add(current);

      for (const [key, val] of Object.entries(wordLinks)) {
        const valStr = val as string;
        const extractRaw = (str: string) => {
          const idx = str.indexOf("_");
          return idx !== -1 ? str.substring(idx + 1).toLowerCase() : str.toLowerCase();
        };
        const keyLang = key.includes("_") ? key.substring(0, key.indexOf("_")).toLowerCase() : "";
        const valLang = valStr.includes("_") ? valStr.substring(0, valStr.indexOf("_")).toLowerCase() : "";

        if (keyLang && keyLang !== lang.toLowerCase()) continue;
        if (valLang && valLang !== lang.toLowerCase()) continue;

        const rawKey = extractRaw(key);
        const rawVal = extractRaw(valStr);

        if (rawKey === current && !visited.has(rawVal)) {
          queue.push(rawVal);
        }
        if (rawVal === current && !visited.has(rawKey)) {
          queue.push(rawKey);
        }
      }
    }

    return Array.from(list);
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

        const updatedVocabItem: VocabItem = {
          ...newVocabItem,
          word: linkedWord,
          translation: newVocabItem.translation !== undefined ? newVocabItem.translation : (existing ? existing.translation : ""),
          ipa: newVocabItem.ipa !== undefined ? newVocabItem.ipa : (existing ? existing.ipa : ""),
          grammar: newVocabItem.grammar !== undefined ? newVocabItem.grammar : (existing ? existing.grammar : ""),
          contextRelation: newVocabItem.contextRelation !== undefined ? newVocabItem.contextRelation : (existing ? existing.contextRelation : ""),
          examples: newVocabItem.examples !== undefined ? newVocabItem.examples : (existing ? existing.examples : []),
          createdAt: newVocabItem.createdAt !== undefined ? newVocabItem.createdAt : (existing ? existing.createdAt : Date.now()),
          tags: newVocabItem.tags !== undefined ? newVocabItem.tags : (existing ? existing.tags : []),
          imageUrl: newVocabItem.imageUrl !== undefined ? newVocabItem.imageUrl : (existing && existing.imageUrl ? existing.imageUrl : null),
          spellingCorrectCount: newVocabItem.spellingCorrectCount !== undefined ? newVocabItem.spellingCorrectCount : (existing ? existing.spellingCorrectCount : 0),
          spellingIncorrectCount: newVocabItem.spellingIncorrectCount !== undefined ? newVocabItem.spellingIncorrectCount : (existing ? existing.spellingIncorrectCount : 0),
          lastSpelledCorrectly: newVocabItem.lastSpelledCorrectly !== undefined ? newVocabItem.lastSpelledCorrectly : (existing ? existing.lastSpelledCorrectly : null),
          spellingExclude: newVocabItem.spellingExclude !== undefined ? newVocabItem.spellingExclude : (existing ? existing.spellingExclude : false),
        };

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

          const updatedVocabItem: VocabItem = {
            ...newVocabItem,
            word: linkedWord,
            translation: newVocabItem.translation !== undefined ? newVocabItem.translation : (existing ? existing.translation : ""),
            ipa: newVocabItem.ipa !== undefined ? newVocabItem.ipa : (existing ? existing.ipa : ""),
            grammar: newVocabItem.grammar !== undefined ? newVocabItem.grammar : (existing ? existing.grammar : ""),
            contextRelation: newVocabItem.contextRelation !== undefined ? newVocabItem.contextRelation : (existing ? existing.contextRelation : ""),
            examples: newVocabItem.examples !== undefined ? newVocabItem.examples : (existing ? existing.examples : []),
            createdAt: newVocabItem.createdAt !== undefined ? newVocabItem.createdAt : (existing ? existing.createdAt : Date.now()),
            tags: newVocabItem.tags !== undefined ? newVocabItem.tags : (existing ? existing.tags : []),
            imageUrl: newVocabItem.imageUrl !== undefined ? newVocabItem.imageUrl : (existing && existing.imageUrl ? existing.imageUrl : null),
          };

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

  const handleDeleteMultipleVocabItems = (words: string[], lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    if (!words || words.length === 0) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    setVocab((prev) => {
      const copy = { ...prev };
      const allKeysToDrop = new Set<string>();

      // Build a lookup map of lowercase keys to original keys to avoid O(N^2) search
      const keyLookup = new Map<string, string[]>();
      Object.keys(copy).forEach((k) => {
        const kLower = k.trim().toLowerCase();
        if (!keyLookup.has(kLower)) {
          keyLookup.set(kLower, []);
        }
        keyLookup.get(kLower)!.push(k);
      });

      words.forEach((word) => {
        if (!word || !word.trim()) return;
        const cleanWord = word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
        if (!cleanWord) return;

        const targetLangKey = `${activeLang}_${cleanWord}`;
        allKeysToDrop.add(targetLangKey);
        allKeysToDrop.add(cleanWord);

        const targetLangKeyLower = targetLangKey.toLowerCase();
        const cleanWordLower = cleanWord.toLowerCase();

        const matchingKeys1 = keyLookup.get(targetLangKeyLower) || [];
        const matchingKeys2 = keyLookup.get(cleanWordLower) || [];

        matchingKeys1.forEach((k) => allKeysToDrop.add(k));
        matchingKeys2.forEach((k) => allKeysToDrop.add(k));
      });

      const cleanKeys = Array.from(allKeysToDrop).filter(k => k && k.trim() !== "");

      cleanKeys.forEach((k) => {
        delete copy[k];
      });

      if (cleanKeys.length > 0) {
        if (auth.currentUser && storageMode === "cloud") {
          deleteMultipleVocabs(auth.currentUser.uid, cleanKeys).catch((err) => console.error(err));
        } else if (storageMode === "server") {
          syncDataToLocalServer(lessons, lessonTypes, copy, wordLinks).catch((err) => console.error(err));
        }
      }

      return copy;
    });
  };

  const handleUpdateStatusDirect = (word: string, newStatus: WordStatus, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanWord = word.toLowerCase().replace(/^[a-zA-Z]+_/, "");
    const linkedWords = getLinkedWordsFor(cleanWord, activeLang);

    setVocab((prev) => {
      const nextVocab = { ...prev };
      const keysToDelete: string[] = [];

      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`;
        const existing = prev[targetLangKey] || prev[linkedWord];

        const updated: VocabItem = {
          word: linkedWord,
          status: newStatus,
          translation: existing ? existing.translation : "[Known]",
          ipa: existing ? existing.ipa : "",
          grammar: existing ? existing.grammar : "",
          contextRelation: existing ? existing.contextRelation : "",
          examples: existing ? existing.examples : [],
          createdAt: existing ? (existing.createdAt || Date.now()) : Date.now(),
          tags: existing ? existing.tags : [],
          imageUrl: existing ? (existing.imageUrl || null) : null,
        };

        // Clean up legacy non-prefixed key or case variations from local state
        Object.keys(nextVocab).forEach((k) => {
          const kLower = k.trim().toLowerCase();
          if (kLower === linkedWord.toLowerCase() && k !== targetLangKey) {
            keysToDelete.push(k);
            delete nextVocab[k];
          }
        });

        nextVocab[targetLangKey] = updated;

        if (auth.currentUser && storageMode === "cloud") {
          saveVocab(auth.currentUser.uid, targetLangKey, updated).catch((err) => console.error(err));
        }
      });

      if (auth.currentUser && storageMode === "cloud" && keysToDelete.length > 0) {
        deleteMultipleVocabs(auth.currentUser.uid, keysToDelete).catch((err) =>
          console.error("Failed to delete legacy keys from cloud during status update:", err)
        );
      }

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextVocab, wordLinks).catch((err) => console.error(err));
      }

      return nextVocab;
    });
  };

  const handleAddLesson = (newL: Lesson, images?: Record<string, { dataUrl: string; width: string; height: string }>) => {
    lastLocalChangeTime.current = Date.now();
    if (images && Object.keys(images).length > 0) {
      setLessonImages(newL.id, images);
      setLessonImagesVersion((v) => v + 1);
    }
    setLessons((prev) => [newL, ...prev]);
    setActiveLessonId(newL.id);
    setShowImportForm(false);
    if (auth.currentUser && storageMode === "cloud") {
      saveLesson(auth.currentUser.uid, newL, images).catch((err) => console.error(err));
    }
    if (storageMode === "server") {
      syncDataToLocalServer([newL, ...lessons]).catch((err) => console.error(err));
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
          safeLocalStorageSetItem("vocab_clone_lessons", JSON.stringify(next));
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
      alert("Ошибка при распознавании идиом: " + (e.message || String(e)));
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
      const nextVal = prev + seconds;
      if (auth.currentUser && storageMode === "cloud") {
        saveProfileStats(auth.currentUser.uid, nextVal).catch((err) => console.error(err));
      }
      return nextVal;
    });
  };

  // Full-Screen Isolated Focused Reading Room
  if (isFocusMode && activeLesson) {
    const focusTheme = readerThemes[readerSettings.readerTheme] || readerThemes.default;
    return (
      <div className={`min-h-screen ${focusTheme.pageBg} ${focusTheme.text} flex flex-col font-sans transition-colors duration-200`}>
        
        {/* Top Focus Header bar */}
        <header className={`border-b ${focusTheme.border} ${focusTheme.headerBg} backdrop-blur-md relative z-30 px-4 sm:px-6 py-3.5`}>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Back Button */}
            <button
              id="focus-exit-btn"
              onClick={() => setIsFocusMode(false)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 border ${focusTheme.border} ${focusTheme.cardBg} hover:opacity-95 text-inherit font-bold text-xs rounded-xl transition-all active:scale-98 cursor-pointer shadow-xs`}
            >
              ← Back to Dashboard (Выйти из фокуса)
            </button>

            {/* Lesson Title Indicators */}
            <div className="text-center flex-1 max-w-xl truncate">
              <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 bg-teal-100/40 dark:bg-teal-950/40 px-2 py-0.5 rounded">
                Focused Reading Room
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
                  title="Toggle YouTube Video window"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Видео (Video)</span>
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
                  title="Default width (1280px)"
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
                  title="Wide width (1560px)"
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
                  title="Full screen width"
                >
                  Экран
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* Focused main container */}
        <main className={`flex-grow w-full mx-auto p-4 sm:p-6 lg:px-8 grid grid-cols-12 gap-6 items-start transition-all duration-300 ${
          layoutWidthMode === "standard"
            ? "max-w-7xl"
            : layoutWidthMode === "wide"
            ? "max-w-[1560px]"
            : "max-w-full lg:px-12 md:px-8"
        }`}>
          
          {/* Middle Main - Reader and Audio player only */}
          <div className="col-span-12 md:col-span-8 lg:col-span-8 space-y-4">
            {(activeLesson.audioUrl || activeLesson.audioBase64) && (
              <AudioPlayer
                lesson={activeLesson}
                onAudioUpload={handleAudioUploaded}
                onListeningTick={handleListeningTick}
                onTimeUpdate={(seconds) => setYoutubePlayTime(seconds)}
                seekToTime={youtubeSeekToTime}
              />
            )}

            <ReaderPanel
              key={activeLesson.id}
              lesson={activeLesson}
              lessonImagesMap={activeLessonImagesMap}
              vocab={vocab}
              activeWord={selectedWord}
              wordLinks={wordLinks}
              onWordClick={handleWordClick}
              onMarkKnown={(w) => handleUpdateStatusDirect(w, "known")}
              settings={readerSettings}
              onEditClick={() => setEditingLesson(activeLesson)}
              currentYoutubeTime={youtubePlayTime}
              onTimestampClick={(seconds) => setYoutubeSeekToTime(seconds)}
              showOnlyUnknown={showOnlyUnknown}
            />
          </div>

          {/* Right Sidebar - Active Word dictionary */}
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

        {/* On small screens, if a word is selected, show it in a sliding bottom sheet with overlay */}
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

      </div>
    );
  }

  const currentReaderTheme = (activeTab === "read" && activeLesson)
    ? (readerThemes[readerSettings.readerTheme] || readerThemes.default)
    : readerThemes.default;

  return (
    <div className={`min-h-screen ${currentReaderTheme.pageBg} ${currentReaderTheme.text} flex flex-col font-sans transition-colors duration-200`}>
      
      {/* Sliding Sidebar Drawer from the Left */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex pointer-events-auto">
          {/* Backdrop Overlay */}
          <div 
            id="sidebar-overlay"
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
          />

          {/* Sidebar Panel */}
          <div 
            id="sidebar-panel"
            className={`relative flex flex-col w-full max-w-[280px] sm:max-w-xs h-full ${currentReaderTheme.cardBg} ${currentReaderTheme.text} border-r ${currentReaderTheme.border} shadow-2xl p-5 overflow-y-auto animate-in slide-in-from-left duration-200 z-10`}
          >
            {/* Header / Brand in Sidebar */}
            <div className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-600 rounded-xl text-white">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900 dark:text-white tracking-wide">
                    SLL Menu
                  </h3>
                  <span className="text-[9px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest block font-mono">
                    Navigation
                  </span>
                </div>
              </div>

              {/* Close Button */}
              <button
                id="btn-close-sidebar"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
                title="Закрыть меню (Close Menu)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sidebar Main Content Options */}
            <div className="flex-1 py-6 space-y-6">
              {/* Core Tabs Navigation */}
              <div className="space-y-1">
                <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest pl-2 font-mono">
                  Tabs (Разделы)
                </span>
                
                <button
                  id="tab-library-mode"
                  onClick={() => {
                    setActiveTab("library");
                    setShowImportForm(false);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "library" && !showImportForm
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
                  }`}
                >
                  <BookMarked className="w-4 h-4 shrink-0" />
                  Библиотека (Library)
                </button>

                <button
                  id="tab-read-mode"
                  onClick={() => {
                    setActiveTab("read");
                    setShowImportForm(false);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "read" && !showImportForm
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
                  }`}
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  Чтение (Reader)
                </button>

                <button
                  id="tab-practice-mode"
                  onClick={() => {
                    setActiveTab("practice");
                    setShowImportForm(false);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "practice" && !showImportForm
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
                  }`}
                >
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  Карточки (Study)
                </button>

                <button
                  id="tab-statistics-mode"
                  onClick={() => {
                    setActiveTab("statistics");
                    setShowImportForm(false);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "statistics" && !showImportForm
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
                  }`}
                >
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  Статистика (Stats)
                </button>
              </div>

              {/* Quick Actions separator */}
              <div className="space-y-1.5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest pl-2 font-mono">
                  Actions (Действия)
                </span>

                {activeLesson && (
                  <button
                    id="btn-enter-focus"
                    onClick={() => {
                      setIsFocusMode(true);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50/60 hover:bg-teal-100/80 dark:bg-teal-950/20 dark:hover:bg-teal-900/30 border border-teal-100/50 dark:border-teal-900/50 rounded-xl transition-all cursor-pointer active:scale-97"
                    title="Enter dedicated focus mode"
                  >
                    <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 animate-pulse" />
                    Focus Room (Режим фокуса)
                  </button>
                )}

                <button
                  id="btn-open-settings"
                  onClick={() => {
                    setShowSettingsModal(true);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white rounded-xl transition-all cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
                  Настройки (Settings)
                </button>

                <button
                  id="btn-open-import"
                  onClick={() => {
                    setShowImportForm(true);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 rounded-xl transition-all cursor-pointer shadow-3xs"
                >
                  <PlusCircle className="w-4 h-4 shrink-0 text-teal-100" />
                  Import Lesson
                </button>
              </div>
            </div>

            {/* Bottom Footer block inside sidebar showing sync/user stats overview */}
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 font-mono">
                  Cloud Profile
                </span>
                {activeUser ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{activeUser.displayName || activeUser.email}</p>
                    <div className="flex items-center justify-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${user ? "bg-teal-500 animate-pulse" : "bg-teal-500"}`} />
                      <span className="text-[8px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                        {user ? "Synced to Cloud" : "Local Guest Profile"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowLocalLoginModal(true);
                      setIsSidebarOpen(false);
                    }}
                    className="text-[9px] font-black text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    🔑 Sign In and Sync
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Top Header HUD */}
      {!isFocusMode && (
        <header className={`border-b ${currentReaderTheme.border} ${currentReaderTheme.headerBg} backdrop-blur-md relative z-30 px-4 sm:px-6 py-3.5`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            
            {/* Left side: Hamburger + Brand logo */}
            <div className="flex items-center gap-3">
              <button
                id="btn-toggle-sidebar"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2.5 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-3xs"
                title="Открыть меню (Open Left Sidebar Menu)"
              >
                <Menu className="w-5 h-5" />
              </button>

              <a
                href="#/library"
                onClick={(e) => {
                  // Only intercept regular clicks to perform in-app state updates.
                  // Allow browser standard actions (e.g. Ctrl+Click, Cmd+Click, middle click) to open in a new tab.
                  if (
                    e.button === 0 &&
                    !e.ctrlKey &&
                    !e.shiftKey &&
                    !e.metaKey &&
                    !e.altKey
                  ) {
                    e.preventDefault();
                    setActiveTab("library");
                    setShowImportForm(false);
                    setSelectedWord(null);
                  }
                }}
                className="flex items-center gap-2.5 group cursor-pointer transition-all active:scale-98 text-left focus:outline-none no-underline"
                title="На главную (Go to Home Page)"
              >
                <div className="p-2 bg-teal-600 group-hover:bg-teal-500 rounded-xl text-white shadow-md shadow-teal-100/10 dark:shadow-none hidden sm:block transition-colors">
                  <Languages className="w-5 h-5 transition-transform group-hover:scale-110" />
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 text-zinc-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    Smart Language Learner
                  </h1>
                </div>
              </a>
            </div>

            {/* Right side: Sync State & Login/Logout HUD */}
            <div className="flex items-center gap-2">
              {/* Dark Mode Toggle Button */}
              <button
                id="btn-toggle-dark-mode"
                onClick={() => setIsDarkMode(prev => !prev)}
                className="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-3xs active:scale-95
                  bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800
                  text-amber-500 dark:text-indigo-400
                  border-zinc-200/60 dark:border-zinc-800/80"
                title={isDarkMode ? "Светлая тема (Light Mode)" : "Тёмная тема (Dark Mode)"}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDarkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
              </button>
              {isAuthLoading ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-3xs">
                  <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] text-zinc-400 font-bold hidden sm:inline">Checking...</span>
                </div>
              ) : activeUser ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 dark:bg-teal-900/20 border border-teal-200/50 dark:border-teal-900 rounded-xl relative shadow-3xs">
                  {activeUser.photoURL ? (
                    <img
                      src={activeUser.photoURL}
                      alt="User avatar"
                      className="w-5.5 h-5.5 rounded-full border border-teal-400"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-5.5 h-5.5 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center text-[10px] font-black text-teal-700 dark:text-teal-300">
                      {(activeUser.displayName || activeUser.email || "U").substring(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col text-left justify-center min-w-0 pr-1">
                    <span className="text-[9px] font-black text-teal-700 dark:text-teal-300 flex items-center gap-1 leading-none">
                      {storageMode === "cloud" ? "☁️ cloud" : storageMode === "server" ? "🖥️ server" : "📱 local"}
                      {isSyncing && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />}
                    </span>
                    <span className="text-[7.5px] text-zinc-400 dark:text-zinc-500 font-bold truncate max-w-[100px] leading-tight block mt-0.5" title={activeUser.displayName || activeUser.email || ""}>
                      {activeUser.displayName || activeUser.email || "user"}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (storageMode === "cloud") {
                        signOut(auth).catch(err => console.error(err));
                      } else if (storageMode === "server") {
                        if (serverToken) {
                          fetch("/api/auth/logout", {
                            method: "POST",
                            headers: {
                              "Authorization": `Bearer ${serverToken}`
                            }
                          }).catch(err => console.error("Server logout request failed:", err));
                        }
                        setLocalUser(null);
                        localStorage.removeItem("vocab_clone_local_user");
                        localStorage.removeItem("vocab_clone_server_token");
                        setServerToken("");
                        setStorageMode("local");
                        localStorage.setItem("vocab_clone_storage_mode", "local");
                      }
                    }}
                    className="text-[9px] font-bold text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-1.5 py-0.5 rounded transition cursor-pointer"
                    title="Выйти (Logout)"
                  >
                    Exit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLocalLoginModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[10px] font-bold rounded-xl transition duration-150 cursor-pointer shadow-3xs"
                  title="Войдите, чтобы сохранить результаты"
                >
                  ☁️ Войти (Sync)
                </button>
              )}
            </div>

          </div>
        </header>
      )}

      {cloudOfflineWarning && (
        <div id="banner-cloud-offline-warning" className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
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
      <main className={`flex-grow w-full mx-auto p-4 sm:p-6 space-y-6 transition-all duration-300 ${
        layoutWidthMode === "standard"
          ? "max-w-7xl"
          : layoutWidthMode === "wide"
          ? "max-w-[1560px]"
          : "max-w-full lg:px-12 md:px-8"
      }`}>
        
        {/* Dynamic Achievements HUD Panel */}
        {activeTab !== "read" && <StatsWidget stats={calculatedStats} />}

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
        ) : (
          /* Main Interactive Reader View Grid */
          <>
            <div className="grid grid-cols-12 gap-6 items-start">

              {/* Middle Main - Reader and Audio player - Full-width like Focus Room */}
              <div className="col-span-12 md:col-span-8 lg:col-span-8 space-y-4 animate-in fade-in duration-150">
                {activeLesson ? (
                  <>
                    {/* Quiet minimal inline toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 pt-1 border-b border-zinc-200/40 dark:border-zinc-800/40 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveTab("library");
                            setSelectedWord(null);
                          }}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 text-xs font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:shadow-xs transition-all active:scale-97 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Библиотека (Library)
                        </button>
                        <span className="text-zinc-300 dark:text-zinc-600 text-xs hidden sm:inline">/</span>
                        <span className="text-zinc-700 dark:text-zinc-300 text-xs font-bold truncate max-w-[200px]" title={activeLesson.title}>
                          {activeLesson.title}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => setIsFocusMode(true)}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap bg-teal-50 hover:bg-teal-100/80 dark:bg-teal-950/20 dark:hover:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/50 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Focus Mode
                        </button>

                        <button
                          onClick={() => setShowMatchPairsModal(true)}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                          title="Игра: сопоставление слов и перевода"
                        >
                          <Trophy className="w-3.5 h-3.5 animate-pulse" />
                          Игра: Пары
                        </button>

                        <button
                          onClick={handleDetectIdioms}
                          disabled={isDetectingIdioms}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/20 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
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
                          className={`flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            showOnlyUnknown
                              ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm scale-102"
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
                            className={`flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
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

                        <TextSettingsControls settings={readerSettings} onUpdateSettings={setReaderSettings} />

                        {/* Width Selector */}
                        <div className="flex items-center gap-1 bg-stone-100/50 dark:bg-zinc-900/55 p-1 h-9 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 font-sans shrink-0">
                          <button
                            type="button"
                            onClick={() => setLayoutWidthMode("standard")}
                            className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
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
                            className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
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
                            className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              layoutWidthMode === "full"
                                ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                            }`}
                            title="Full screen width"
                          >
                            Экран
                          </button>
                        </div>

                        <button
                          onClick={() => setShowSettingsModal(true)}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/55 dark:hover:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all active:scale-95 cursor-pointer"
                          title="Language settings"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          Settings
                        </button>

                        <button
                          onClick={() => setEditingLesson(activeLesson)}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/55 dark:hover:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all active:scale-95 cursor-pointer"
                          title="Edit lesson details"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* Interactive Audio Player */}
                    {(activeLesson.audioUrl || activeLesson.audioBase64) && (
                      <AudioPlayer
                        lesson={activeLesson}
                        onAudioUpload={handleAudioUploaded}
                        onListeningTick={handleListeningTick}
                        onTimeUpdate={(seconds) => setYoutubePlayTime(seconds)}
                        seekToTime={youtubeSeekToTime}
                      />
                    )}



                    <ReaderPanel
                      key={activeLesson.id}
                      lesson={activeLesson}
                      lessonImagesMap={activeLessonImagesMap}
                      vocab={vocab}
                      activeWord={selectedWord}
                      wordLinks={wordLinks}
                      onWordClick={handleWordClick}
                      onMarkKnown={(w) => handleUpdateStatusDirect(w, "known")}
                      settings={readerSettings}
                      onEditClick={() => setEditingLesson(activeLesson)}
                      currentYoutubeTime={youtubePlayTime}
                      onTimestampClick={(seconds) => setYoutubeSeekToTime(seconds)}
                      showOnlyUnknown={showOnlyUnknown}
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
            
            {/* On small screens, if a word is selected, show it in a sliding bottom sheet with overlay */}
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
          Smart Language Learner &copy; 2026. Powered by Google Gemini. Use this tool to boost reading & listening fluency.
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
        firebaseUser={user}
        activeUser={activeUser}
        vocab={vocab}
        lessonTypes={lessonTypes}
        listeningSeconds={listeningSeconds}
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
          if (storageMode === "cloud" && user) {
            uploadLocalToCloud(
              user.uid,
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
          if (storageMode === "cloud" && user) {
            try {
              setIsSyncing(true);
              await clearAllUserDataOnFirestore(user.uid);
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
          if (user) {
            try {
              await uploadLocalToCloud(
                user.uid,
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
      {showLocalLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150">
            {activeUser && (
              <button
                onClick={() => {
                  setShowLocalLoginModal(false);
                  setAuthError(null);
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-base font-bold"
              >
                &times;
              </button>
            )}

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center mx-auto text-xl">
                🔑
              </div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
                Авторизация и Профиль
              </h3>
            </div>

            {/* Tab selection */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setAuthModalTab("local")}
                className={`flex-1 pb-3 text-xs font-black uppercase tracking-wider transition-colors ${
                  authModalTab === "local"
                    ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-500"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                }`}
              >
                💻 Локальный Профиль
              </button>
              <button
                onClick={() => setAuthModalTab("cloud")}
                className={`flex-1 pb-3 text-xs font-black uppercase tracking-wider transition-colors ${
                  authModalTab === "cloud"
                    ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-500"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                }`}
              >
                ☁️ Облако (Google / Email)
              </button>
            </div>

            {authError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed max-h-36 overflow-y-auto">
                <p className="font-bold mb-1">⚠️ Ошибка:</p>
                <p className="mb-2">{authError}</p>
              </div>
            )}

            <div className="space-y-4">
              {authModalTab === "local" ? (
                <div className="space-y-4 pt-2">
                  <div className="text-center space-y-1">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                      Войдите или зарегистрируйтесь на вашем локальном сервере CasaOS. Данные будут храниться и синхронизироваться через вашу собственную базу данных SQLite.
                    </p>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                        Профиль на Сервере:
                      </label>
                      <button
                        onClick={() => {
                          setIsLocalServerRegister(!isLocalServerRegister);
                          setAuthError(null);
                        }}
                        className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-bold underline transition cursor-pointer"
                      >
                        {isLocalServerRegister ? "Вход" : "Регистрация"}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {isLocalServerRegister && (
                        <input
                          type="text"
                          value={localServerName}
                          onChange={(e) => setLocalServerName(e.target.value)}
                          placeholder="Ваше имя (например, Rustam)"
                          disabled={isLocalServerAuthLoading}
                          className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50 font-bold"
                        />
                      )}
                      <input
                        type="email"
                        value={localServerEmail}
                        onChange={(e) => setLocalServerEmail(e.target.value)}
                        placeholder="Email адрес или логин"
                        disabled={isLocalServerAuthLoading}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                      />
                      <input
                        type="password"
                        value={localServerPassword}
                        onChange={(e) => setLocalServerPassword(e.target.value)}
                        placeholder="Пароль"
                        disabled={isLocalServerAuthLoading}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            await handleServerAuthSubmit(localServerEmail, localServerPassword, localServerName, isLocalServerRegister);
                          }
                        }}
                      />

                      <button
                        onClick={async () => {
                          await handleServerAuthSubmit(localServerEmail, localServerPassword, localServerName, isLocalServerRegister);
                        }}
                        disabled={isLocalServerAuthLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs transition duration-150 cursor-pointer disabled:opacity-50 shadow-md shadow-teal-600/10"
                      >
                        {isLocalServerAuthLoading ? (
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span>💻</span>
                        )}
                        <span>{isLocalServerRegister ? "Создать аккаунт на сервере" : "Войти в профиль сервера"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {/* Option A: Google Sign In */}
                  <div>
                    <button
                      onClick={async () => {
                        setAuthError(null);
                        try {
                          await signInWithPopup(auth, googleProvider);
                          setStorageMode("cloud");
                          setShowLocalLoginModal(false);
                        } catch (err: any) {
                          console.error("Local PC Sign-In with popup error:", err);
                          setAuthError(err.message || String(err));
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs transition duration-150 cursor-pointer shadow-md shadow-teal-600/10"
                    >
                      <span>☁️</span> Войти через Google Account
                    </button>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
                    <span className="flex-shrink mx-3 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest font-mono">или</span>
                    <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
                  </div>

                  {/* Option B: Email & Password */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                        Вход по Email:
                      </label>
                      <button
                        onClick={() => {
                          setIsEmailRegister(!isEmailRegister);
                          setAuthError(null);
                        }}
                        className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-bold underline transition cursor-pointer"
                      >
                        {isEmailRegister ? "Вход" : "Регистрация"}
                      </button>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Email адрес"
                        disabled={emailAuthLoading}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                      />
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Пароль (от 6 символов)"
                        disabled={emailAuthLoading}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                      />

                      <button
                        onClick={async () => {
                          const email = emailInput.trim();
                          const password = passwordInput.trim();
                          if (!email || !password) {
                            setAuthError("Пожалуйста, введите email и пароль.");
                            return;
                          }
                          if (password.length < 6) {
                            setAuthError("Пароль должен содержать не менее 6 символов.");
                            return;
                          }

                          setAuthError(null);
                          setEmailAuthLoading(true);
                          try {
                            if (isEmailRegister) {
                              await createUserWithEmailAndPassword(auth, email, password);
                            } else {
                              await signInWithEmailAndPassword(auth, email, password);
                            }
                            setStorageMode("cloud");
                            setEmailInput("");
                            setPasswordInput("");
                            setShowLocalLoginModal(false);
                          } catch (err: any) {
                            console.error("Email auth error:", err);
                            let friendlyMsg = err.message || String(err);
                            if (err.code === "auth/email-already-in-use") {
                              friendlyMsg = "Этот адрес почты уже зарегистрирован.";
                            } else if (err.code === "auth/invalid-email") {
                              friendlyMsg = "Неверный формат email адреса.";
                            } else if (err.code === "auth/operation-not-allowed") {
                              friendlyMsg = "Вход по Email отключен в настройках Firebase.";
                            } else if (err.code === "auth/weak-password") {
                              friendlyMsg = "Слишком простой пароль. Нужно не менее 6 символов.";
                            } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
                              friendlyMsg = "Неверный логин или пароль.";
                            }
                            setAuthError(friendlyMsg);
                          } finally {
                            setEmailAuthLoading(false);
                          }
                        }}
                        disabled={emailAuthLoading}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-zinc-700 hover:bg-zinc-800 active:scale-98 text-white font-bold text-xs transition duration-150 cursor-pointer disabled:opacity-50"
                      >
                        {emailAuthLoading ? (
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span>🔒</span>
                        )}
                        <span>{isEmailRegister ? "Создать аккаунт и войти" : "Войти в облако"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating draggable/resizable YouTube player window */}
      {activeLesson && activeLesson.youtubeId && showYoutubePlayer && activeTab === "read" && (
        <YoutubePlayerWindow
          lesson={activeLesson}
          onClose={() => setShowYoutubePlayer(false)}
          onTimeUpdate={(seconds) => setYoutubePlayTime(seconds)}
          seekToSeconds={youtubeSeekToTime}
          onSeekComplete={() => setYoutubeSeekToTime(null)}
        />
      )}
    </div>
  );
}
