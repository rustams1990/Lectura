/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Lesson, LessonType, LingQ, WordStatus, AppStats, ReaderSettings } from "./types";
import { BUILT_IN_LESSONS, DEFAULT_LESSON_TYPES } from "./data";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { onSnapshot, collection, doc, getDocs } from "firebase/firestore";
import { 
  saveLingQ, 
  deleteLingQ, 
  deleteMultipleLingQs,
  saveLesson, 
  deleteLesson, 
  saveProfileStats, 
  saveWordRangeLink, 
  deleteWordRangeLink,
  saveLessonType, 
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
import { BookOpen, PlusCircle, GraduationCap, Headphones, Languages, Trash2, HelpCircle, Sparkles, BookMarked, TrendingUp, Pencil, Settings, ChevronLeft, Menu, X, Tv, Maximize2, Trophy, Loader2 } from "lucide-react";
import { safeJsonParse, safeLocalStorageSetItem } from "./utils";

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
    headerBg: "bg-zinc-950/90 border-zinc-850",
    cardBg: "bg-zinc-950",
    border: "border-zinc-850",
  },
};

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

function normalizeLingqsRecord(record: Record<string, LingQ> | undefined): Record<string, LingQ> {
  if (!record) return {};
  const normalized: Record<string, LingQ> = {};
  for (const [key, value] of Object.entries(record)) {
    const cleanKey = normalizeLanguagePrefixedKey(key);
    const cleanWord = value.word ? value.word.replace(/^[a-zA-Z]+_/, "") : cleanKey.replace(/^[a-zA-Z]+_/, "");
    normalized[cleanKey] = {
      ...value,
      word: cleanWord,
    };
  }
  return normalized;
}

function normalizeWordLinksRecord(record: Record<string, string> | undefined): Record<string, string> {
  if (!record) return {};
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    const cleanKey = normalizeLanguagePrefixedKey(key);
    const cleanVal = normalizeLanguagePrefixedKey(val);
    normalized[cleanKey] = cleanVal;
  }
  return normalized;
}

export default function App() {
  // Durable browser persistence states
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const saved = localStorage.getItem("lingq_clone_lessons");
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
    const saved = localStorage.getItem("lingq_clone_lessontypes");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return DEFAULT_LESSON_TYPES;
  });

  const [lingqs, setLingqs] = useState<Record<string, LingQ>>(() => {
    const saved = localStorage.getItem("lingq_clone_words");
    if (saved) {
      try {
        return normalizeLingqsRecord(JSON.parse(saved));
      } catch (err) {
        console.error(err);
      }
    }
    return {};
  });

  const [listeningSeconds, setListeningSeconds] = useState<number>(() => {
    const saved = localStorage.getItem("lingq_clone_listening");
    if (saved) {
      const num = parseFloat(saved);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  });

  // Word plural/singular mapping rules state (e.g. zorros -> zorro)
  const [wordLinks, setWordLinks] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("lingq_clone_aliases");
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
    const saved = localStorage.getItem("lingq_clone_language_flags");
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
    const saved = localStorage.getItem("lingq_clone_focus_mode");
    return saved !== null ? saved === "true" : true;
  });

  const [layoutWidthMode, setLayoutWidthMode] = useState<"standard" | "wide" | "ultra" | "full">(() => {
    const saved = localStorage.getItem("lingq_clone_layout_width");
    return (saved as "standard" | "wide" | "ultra" | "full") || "standard";
  });

  // Customizable reader options (Fonts family, background tone, size, spacing, container width)
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem("lingq_clone_reader_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          aiProvider: "gemini",
          localAiUrl: "http://localhost:11434/api/generate",
          localAiModel: "phi3.5",
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
    };
  });

  // Zoom level state (default is 100 representing 100%)
  const [zoomScale, setZoomScale] = useState<number>(() => {
    const saved = localStorage.getItem("lingq_clone_interface_zoom");
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    localStorage.setItem("lingq_clone_interface_zoom", zoomScale.toString());
    const val = `${zoomScale}%`;
    try {
      (document.documentElement.style as any).zoom = val;
      if (document.body) {
        (document.body.style as any).zoom = val;
      }
    } catch (e) {
      console.error("Zoom layout adjustment not supported:", e);
    }
  }, [zoomScale]);

  // Firebase Auth & Cloud Sync States
  const [user, setUser] = useState<any>(null);
  const [localUser, setLocalUser] = useState<any>(() => {
    const saved = localStorage.getItem("lingq_clone_local_user");
    return safeParse(saved, null);
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [showLocalLoginModal, setShowLocalLoginModal] = useState<boolean>(false);
  const [localNameInput, setLocalNameInput] = useState<string>("");
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudOfflineWarning, setCloudOfflineWarning] = useState<boolean>(false);
  const [storageMode, setStorageMode] = useState<"cloud" | "local" | "server">(() => {
    const saved = localStorage.getItem("lingq_clone_storage_mode");
    return (saved === "cloud" || saved === "local" || saved === "server") ? saved : "cloud";
  });

  useEffect(() => {
    localStorage.setItem("lingq_clone_storage_mode", storageMode);
  }, [storageMode]);

  const activeUser = user || localUser;

  const loadDataFromLocalServer = async () => {
    if (storageMode === "server" && Date.now() - lastLocalChangeTime.current < 8000) {
      console.log("Skipping server database poll to avoid overwriting pending local changes.");
      return;
    }
    setIsSyncing(true);
    try {
      const res = await fetch("/api/server-db");
      if (res.ok) {
        const body = await safeJsonParse(res);
        if (body.status === "ok" && body.data) {
          const d = body.data;
          const normalizedCloudLingqs = normalizeLingqsRecord(d.lingqs);
          const normalizedCloudWordLinks = normalizeWordLinksRecord(d.wordLinks);

          if (d.lessons) setLessons(d.lessons);
          if (d.lessonTypes) setLessonTypes(d.lessonTypes);
          setLingqs(normalizedCloudLingqs);
          setWordLinks(normalizedCloudWordLinks);
          if (d.listeningSeconds !== undefined) setListeningSeconds(d.listeningSeconds);
          if (d.languageFlags) setLanguageFlags(d.languageFlags);

          // Sync into localStorage as fallback buffer
          if (d.lessons) safeLocalStorageSetItem("lingq_clone_lessons", JSON.stringify(d.lessons));
          if (d.lessonTypes) safeLocalStorageSetItem("lingq_clone_lessontypes", JSON.stringify(d.lessonTypes));
          safeLocalStorageSetItem("lingq_clone_words", JSON.stringify(normalizedCloudLingqs));
          safeLocalStorageSetItem("lingq_clone_aliases", JSON.stringify(normalizedCloudWordLinks));
          if (d.listeningSeconds !== undefined) safeLocalStorageSetItem("lingq_clone_listening", d.listeningSeconds.toString());
          if (d.languageFlags) safeLocalStorageSetItem("lingq_clone_language_flags", JSON.stringify(d.languageFlags));
        } else if (body.status === "empty") {
          // Empty server database: Seed with current browser's local state
          const localLessonsStr = localStorage.getItem("lingq_clone_lessons");
          const localTypesStr = localStorage.getItem("lingq_clone_lessontypes");
          const localWordsStr = localStorage.getItem("lingq_clone_words");
          const localListeningStr = localStorage.getItem("lingq_clone_listening");
          const localAliasesStr = localStorage.getItem("lingq_clone_aliases");
          const localFlagsStr = localStorage.getItem("lingq_clone_language_flags");

          const lLessons = safeParse(localLessonsStr, BUILT_IN_LESSONS);
          const lTypes = safeParse(localTypesStr, DEFAULT_LESSON_TYPES);
          const lWords = normalizeLingqsRecord(safeParse(localWordsStr, {}));
          const lListening = localListeningStr ? parseFloat(localListeningStr) || 0 : 0;
          const lWordLinks = normalizeWordLinksRecord(safeParse(localAliasesStr, {}));
          const lLanguageFlags = safeParse(localFlagsStr, {});

          setLessons(lLessons);
          setLessonTypes(lTypes);
          setLingqs(lWords);
          setListeningSeconds(lListening);
          setWordLinks(lWordLinks);
          setLanguageFlags(lLanguageFlags);

          await fetch("/api/server-db", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                lessons: lLessons,
                lessonTypes: lTypes,
                lingqs: lWords,
                wordLinks: lWordLinks,
                listeningSeconds: lListening,
                languageFlags: lLanguageFlags,
              }
            })
          });
        }
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
    currentLingqs = lingqs,
    currentLinks = wordLinks,
    currentListening = listeningSeconds,
    currentFlags = languageFlags
  ) => {
    if (storageMode !== "server") return;
    lastLocalChangeTime.current = Date.now();
    try {
      const res = await fetch("/api/server-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            lessons: currentLessons,
            lessonTypes: currentTypes,
            lingqs: currentLingqs,
            wordLinks: currentLinks,
            listeningSeconds: currentListening,
            languageFlags: currentFlags,
          },
        }),
      });
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

      setUser(firebaseUser);

      if (firebaseUser && storageMode === "cloud") {
        setIsSyncing(true);
        try {
          if (!db) {
            throw new Error("Firestore database instance (db) is offline or undefined");
          }

          const cloudData = await loadUserData(firebaseUser.uid);
          
          const hasCloudData = 
            Object.keys(cloudData.lingqs).length > 0 || 
            cloudData.lessons.length > 0 || 
            cloudData.listeningSeconds > 0;

          if (!hasCloudData) {
            // First time loading: sync any local browser cache to the cloud
            const localLessonsStr = localStorage.getItem("lingq_clone_lessons");
            const localTypesStr = localStorage.getItem("lingq_clone_lessontypes");
            const localWordsStr = localStorage.getItem("lingq_clone_words");
            const localListeningStr = localStorage.getItem("lingq_clone_listening");
            const localAliasesStr = localStorage.getItem("lingq_clone_aliases");
            const localFlagsStr = localStorage.getItem("lingq_clone_language_flags");

            const lLessons = safeParse(localLessonsStr, BUILT_IN_LESSONS);
            const lTypes = safeParse(localTypesStr, DEFAULT_LESSON_TYPES);
            const lWords = safeParse(localWordsStr, {});
            const lListening = localListeningStr ? parseFloat(localListeningStr) || 0 : 0;
            const lWordLinks = safeParse(localAliasesStr, {});
            const lLanguageFlags = safeParse(localFlagsStr, {});

            await uploadLocalToCloud(
              firebaseUser.uid,
              lLessons,
              lTypes,
              lWords,
              lWordLinks,
              lListening,
              lLanguageFlags
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

          const unsubLingQs = onSnapshot(
            collection(db, "users", firebaseUser.uid, "lingqs"),
            (snapshot) => {
              const cloudLingqs: Record<string, LingQ> = {};
              snapshot.forEach((doc) => {
                const data = doc.data() as LingQ;
                if (data.word) {
                  data.word = data.word.replace(/^[a-zA-Z]+_/, "");
                }
                cloudLingqs[decodeDocId(doc.id)] = data;
              });
              setLingqs(normalizeLingqsRecord(cloudLingqs));
            },
            (error) => {
              console.error("Firestore real-time sync lingqs failed:", error);
              try { handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/lingqs`); } catch(e){}
            }
          );
          unsubscribes.push(unsubLingQs);

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
        } catch (err) {
          console.error("Failed to sync offline user details to remote container; falling back to local storage:", err);
          setCloudOfflineWarning(true);

          // Robust local fallback: Keep current active in-memory state safe. No-op to avoid data clobbering.

          // setLessons(safeParse(localLessonsStr, BUILT_IN_LESSONS));





        } finally {
          setIsSyncing(false);
        }
      } else if (storageMode === "server") {
        // Local Dev Server Shared DB
        loadDataFromLocalServer();
      } else {
        // Not authenticated: Fall back to local browser storage
        const localLessonsStr = localStorage.getItem("lingq_clone_lessons");
        const localTypesStr = localStorage.getItem("lingq_clone_lessontypes");
        const localWordsStr = localStorage.getItem("lingq_clone_words");
        const localListeningStr = localStorage.getItem("lingq_clone_listening");
        const localAliasesStr = localStorage.getItem("lingq_clone_aliases");
        const localFlagsStr = localStorage.getItem("lingq_clone_language_flags");

        setLessons(safeParse(localLessonsStr, BUILT_IN_LESSONS));
        setLessonTypes(safeParse(localTypesStr, DEFAULT_LESSON_TYPES));
        setLingqs(safeParse(localWordsStr, {}));
        setListeningSeconds(localListeningStr ? parseFloat(localListeningStr) || 0 : 0);
        setWordLinks(safeParse(localAliasesStr, {}));
        setLanguageFlags(safeParse(localFlagsStr, {}));
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

    const delayDebounceFn = setTimeout(() => {
      syncDataToLocalServer();
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [lessons, lessonTypes, lingqs, listeningSeconds, wordLinks, languageFlags, storageMode]);

  // Dynamic automatic syncing of tablet/PC changes over local network (polls every 8s when tab is visible)
  useEffect(() => {
    if (storageMode !== "server") return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadDataFromLocalServer();
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [storageMode]);

  // Active word translate helpers
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);

  // Sync state to local storage
  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_lessons", JSON.stringify(lessons));
  }, [lessons]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_lessontypes", JSON.stringify(lessonTypes));
  }, [lessonTypes]);

  const handleCreateLessonType = (newType: LessonType) => {
    setLessonTypes((prev) => {
      if (prev.some((t) => t.id.toLowerCase() === newType.id.toLowerCase())) return prev;
      return [...prev, newType];
    });
  };

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_words", JSON.stringify(lingqs));
  }, [lingqs]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_listening", listeningSeconds.toString());
  }, [listeningSeconds]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_aliases", JSON.stringify(wordLinks));
  }, [wordLinks]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_reader_settings", JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_language_flags", JSON.stringify(languageFlags));
  }, [languageFlags]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_focus_mode", isFocusMode ? "true" : "false");
  }, [isFocusMode]);

  useEffect(() => {
    safeLocalStorageSetItem("lingq_clone_layout_width", layoutWidthMode);
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
      const resolved = wordLinks[langKey] || wordLinks[lower] || lower;
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
    
    const bookLingQsMap = new Map<string, LingQ>();
    
    uniqueKeys.forEach((key) => {
      const lq = lingqs[key];
      if (lq && ["1", "2", "3", "4", "5", "learning"].includes(lq.status)) {
        bookLingQsMap.set(lq.word.toLowerCase(), lq);
      }
    });
    
    return Array.from(bookLingQsMap.values());
  }, [activeLesson, lingqs, wordLinks]);

  const activeLessonImagesMap = useMemo(() => {
    if (!activeLesson?.id) return {};
    return getLessonImagesMap(activeLesson.id);
  }, [activeLesson?.id, lessonImagesVersion]);

  useEffect(() => {
    if (activeLesson?.youtubeId) {
      setShowYoutubePlayer(true);
    }
  }, [activeLesson?.id, activeLesson?.youtubeId]);

  const activeLingQ = useMemo(() => {
    if (!selectedWord) return null;
    const key = selectedWord.toLowerCase();
    const lang = (activeLesson?.targetLanguage || "spanish").toLowerCase();
    const resolvedKey = wordLinks[`${lang}_${key}`] || wordLinks[key] || key;
    return lingqs[`${lang}_${resolvedKey}`] || lingqs[resolvedKey] || null;
  }, [selectedWord, lingqs, wordLinks, activeLesson]);

  // Dynamic statistics computing
  const calculatedStats = useMemo<AppStats>(() => {
    const values = Object.values(lingqs) as LingQ[];
    const known = values.filter((l) => l.status === "known").length;
    const learning = values.filter((l) => 
      ["1", "2", "3", "4", "5", "learning"].includes(l.status)
    ).length;

    return {
      listeningSeconds: Math.round(listeningSeconds),
      wordsKnownCount: known,
      wordsLearningCount: learning,
    };
  }, [lingqs, listeningSeconds]);

  // Event handlers
  const handleWordClick = (word: string, context: string) => {
    setSelectedWord(word);
    setSelectedContext(context);
    setActiveTab("read"); // Force return to reader screen
  };

  const handleOpenLesson = (lessonId: string, word: string, sentence: string) => {
    setActiveLessonId(lessonId);
    setSelectedWord(word);
    setSelectedContext(sentence);
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

  const handleSaveWordLink = (from: string, to: string) => {
    lastLocalChangeTime.current = Date.now();
    const lowerFrom = from.toLowerCase();
    const lowerTo = to.toLowerCase();
    if (lowerFrom === lowerTo) return;
    const lang = (activeLesson?.targetLanguage || "spanish").toLowerCase();
    const sourceKey = `${lang}_${lowerFrom}`;
    const targetKey = `${lang}_${lowerTo}`;
    
    const nextWordLinks = {
      ...wordLinks,
      [sourceKey]: targetKey,
      [lowerFrom]: lowerTo,
    };

    setWordLinks(nextWordLinks);

    if (auth.currentUser && storageMode === "cloud") {
      saveWordRangeLink(auth.currentUser.uid, sourceKey, targetKey).catch((err) => console.error(err));
      saveWordRangeLink(auth.currentUser.uid, lowerFrom, lowerTo).catch((err) => console.error(err));
    }

    // Instantly sync the statuses of linked items to avoid split status profiles
    setLingqs((prev) => {
      const fromLingq = prev[sourceKey] || prev[lowerFrom];
      const toLingq = prev[targetKey] || prev[lowerTo];

      if (!fromLingq && !toLingq) {
        if (storageMode === "server") {
          syncDataToLocalServer(lessons, lessonTypes, prev, nextWordLinks).catch((err) => console.error(err));
        }
        return prev;
      }

      // Find best available status / translation configuration
      const sourceOfTruth = fromLingq || toLingq;
      if (!sourceOfTruth) return prev;

      const nextLingqs = { ...prev };
      const updatedFrom: LingQ = {
        word: lowerFrom,
        status: sourceOfTruth.status,
        translation: fromLingq?.translation || sourceOfTruth.translation || "[Known]",
        ipa: fromLingq?.ipa || sourceOfTruth.ipa || "",
        grammar: fromLingq?.grammar || sourceOfTruth.grammar || "",
        contextRelation: fromLingq?.contextRelation || sourceOfTruth.contextRelation || "",
        examples: fromLingq?.examples || sourceOfTruth.examples || [],
        createdAt: fromLingq?.createdAt || sourceOfTruth.createdAt || Date.now(),
        tags: fromLingq?.tags || sourceOfTruth.tags || [],
        imageUrl: fromLingq?.imageUrl || sourceOfTruth.imageUrl || null,
      };

      const updatedTo: LingQ = {
        word: lowerTo,
        status: sourceOfTruth.status,
        translation: toLingq?.translation || sourceOfTruth.translation || "[Known]",
        ipa: toLingq?.ipa || sourceOfTruth.ipa || "",
        grammar: toLingq?.grammar || sourceOfTruth.grammar || "",
        contextRelation: toLingq?.contextRelation || sourceOfTruth.contextRelation || "",
        examples: toLingq?.examples || sourceOfTruth.examples || [],
        createdAt: toLingq?.createdAt || sourceOfTruth.createdAt || Date.now(),
        tags: toLingq?.tags || sourceOfTruth.tags || [],
        imageUrl: toLingq?.imageUrl || sourceOfTruth.imageUrl || null,
      };

      // Clean up legacy non-prefixed keys or case variations
      const keysToDelete: string[] = [];
      Object.keys(nextLingqs).forEach((k) => {
        const kLower = k.trim().toLowerCase();
        if ((kLower === lowerFrom && k !== sourceKey) || (kLower === lowerTo && k !== targetKey)) {
          keysToDelete.push(k);
          delete nextLingqs[k];
        }
      });

      nextLingqs[sourceKey] = updatedFrom;
      nextLingqs[targetKey] = updatedTo;

      if (auth.currentUser && storageMode === "cloud") {
        saveLingQ(auth.currentUser.uid, sourceKey, updatedFrom).catch((err) => console.error(err));
        saveLingQ(auth.currentUser.uid, targetKey, updatedTo).catch((err) => console.error(err));
        if (keysToDelete.length > 0) {
          deleteMultipleLingQs(auth.currentUser.uid, keysToDelete).catch((err) =>
            console.error("Failed to delete legacy keys from cloud in handleSaveWordLink:", err)
          );
        }
      }

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextLingqs, nextWordLinks).catch((err) => console.error(err));
      }

      return nextLingqs;
    });
  };

  const handleDeleteWordLink = (from: string) => {
    lastLocalChangeTime.current = Date.now();
    const hasUnderscore = from.includes("_");
    const rawWord = hasUnderscore ? from.substring(from.indexOf("_") + 1) : from;
    const lang = hasUnderscore ? from.substring(0, from.indexOf("_")) : (activeLesson?.targetLanguage || "spanish").toLowerCase();
    
    const sourceKey = `${lang}_${rawWord.toLowerCase()}`;
    const lowerFrom = rawWord.toLowerCase();

    setWordLinks((prev) => {
      const copy = { ...prev };
      delete copy[sourceKey];
      delete copy[lowerFrom];
      
      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, lingqs, copy).catch((err) => console.error(err));
      }
      
      return copy;
    });
    if (auth.currentUser && storageMode === "cloud") {
      deleteWordRangeLink(auth.currentUser.uid, sourceKey).catch((err) => console.error(err));
      deleteWordRangeLink(auth.currentUser.uid, lowerFrom).catch((err) => console.error(err));
    }
  };

  const handleSaveLingQ = (newLingQ: LingQ, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanWord = newLingQ.word.replace(/^[a-zA-Z]+_/, "").toLowerCase();
    
    // Find all linked words (forms of the same word)
    const linkedWords = getLinkedWordsFor(cleanWord, activeLang);

    setLingqs((prev) => {
      const nextLingqs = { ...prev };
      const keysToDelete: string[] = [];
      
      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`;
        const existing = prev[targetLangKey] || prev[linkedWord];

        const updatedLingQ: LingQ = {
          ...newLingQ,
          word: linkedWord,
          translation: newLingQ.translation || (existing ? existing.translation : ""),
          ipa: newLingQ.ipa || (existing ? existing.ipa : ""),
          grammar: newLingQ.grammar || (existing ? existing.grammar : ""),
          contextRelation: newLingQ.contextRelation || (existing ? existing.contextRelation : ""),
          examples: newLingQ.examples || (existing ? existing.examples : []),
          createdAt: newLingQ.createdAt || (existing ? existing.createdAt : Date.now()),
          tags: newLingQ.tags || (existing ? existing.tags : []),
          imageUrl: newLingQ.imageUrl !== undefined ? newLingQ.imageUrl : (existing && existing.imageUrl ? existing.imageUrl : null),
        };

        // Clean up legacy non-prefixed key or case variations from local state
        Object.keys(nextLingqs).forEach((k) => {
          const kLower = k.trim().toLowerCase();
          if (kLower === linkedWord.toLowerCase() && k !== targetLangKey) {
            keysToDelete.push(k);
            delete nextLingqs[k];
          }
        });

        nextLingqs[targetLangKey] = updatedLingQ;

        if (auth.currentUser && storageMode === "cloud") {
          saveLingQ(auth.currentUser.uid, targetLangKey, updatedLingQ).catch((err) => console.error(err));
        }
      });

      if (auth.currentUser && storageMode === "cloud" && keysToDelete.length > 0) {
        deleteMultipleLingQs(auth.currentUser.uid, keysToDelete).catch((err) =>
          console.error("Failed to delete legacy keys from cloud during save:", err)
        );
      }

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextLingqs, wordLinks).catch((err) =>
          console.error("Failed to sync saved word with server:", err)
        );
      }

      return nextLingqs;
    });
  };

  const handleDeleteLingQ = (word: string, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    if (!word || !word.trim()) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanWord = word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
    if (!cleanWord) return;

    setLingqs((prev) => {
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
          deleteMultipleLingQs(auth.currentUser.uid, uniqueCleanKeys).catch((err) => console.error(err));
        } else if (storageMode === "server") {
          syncDataToLocalServer(lessons, lessonTypes, copy, wordLinks).catch((err) => console.error(err));
        }
      }

      return copy;
    });
  };

  const handleRenameLingQ = (oldWord: string, newLingQ: LingQ, lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    if (!oldWord || !oldWord.trim()) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    const cleanOldWord = oldWord.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
    const cleanNewWord = newLingQ.word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");

    if (cleanOldWord === cleanNewWord) {
      // It's just an update of metadata (translation, grammar, etc.) on the same word
      handleSaveLingQ(newLingQ, lang);
      return;
    }

    const linkedOldWords = getLinkedWordsFor(cleanOldWord, activeLang);

    setLingqs((prev) => {
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
      const updatedLingQ: LingQ = {
        ...newLingQ,
        word: cleanNewWord,
        translation: newLingQ.translation,
        ipa: newLingQ.ipa || "",
        grammar: newLingQ.grammar || "",
        contextRelation: newLingQ.contextRelation || "",
        examples: newLingQ.examples || [],
        createdAt: newLingQ.createdAt || Date.now(),
        tags: newLingQ.tags || [],
      };
      copy[targetLangKeyNew] = updatedLingQ;

      // Update backend / Firestore / Server
      if (uniqueDropKeys.length > 0) {
        if (auth.currentUser && storageMode === "cloud") {
          // Delete old keys from cloud first, then save the new key
          deleteMultipleLingQs(auth.currentUser.uid, uniqueDropKeys)
            .then(() => {
              saveLingQ(auth.currentUser.uid!, targetLangKeyNew, updatedLingQ).catch((err) =>
                console.error("Failed to save renamed word to cloud:", err)
              );
            })
            .catch((err) => {
              console.error("Failed to delete older word keys during rename:", err);
              saveLingQ(auth.currentUser.uid!, targetLangKeyNew, updatedLingQ).catch((err) =>
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

  const handleDeleteMultipleLingQs = (words: string[], lang?: string) => {
    lastLocalChangeTime.current = Date.now();
    if (!words || words.length === 0) return;
    const activeLang = (lang || activeLesson?.targetLanguage || "spanish").toLowerCase();
    setLingqs((prev) => {
      const copy = { ...prev };
      const allKeysToDrop = new Set<string>();

      words.forEach((word) => {
        if (!word || !word.trim()) return;
        const cleanWord = word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
        if (!cleanWord) return;

        // Only delete this specific word's keys, NOT all linked/pattern words
        allKeysToDrop.add(`${activeLang}_${cleanWord}`);
        allKeysToDrop.add(cleanWord);

        Object.keys(copy).forEach((k) => {
          if (!k || !k.trim()) return;
          const kLower = k.trim().toLowerCase();
          if (kLower === `${activeLang}_${cleanWord}` || kLower === cleanWord) {
            allKeysToDrop.add(k);
          }
        });
      });

      const cleanKeys = Array.from(allKeysToDrop).filter(k => k && k.trim() !== "");

      cleanKeys.forEach((k) => {
        delete copy[k];
      });

      if (cleanKeys.length > 0) {
        if (auth.currentUser && storageMode === "cloud") {
          deleteMultipleLingQs(auth.currentUser.uid, cleanKeys).catch((err) => console.error(err));
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

    setLingqs((prev) => {
      const nextLingqs = { ...prev };
      const keysToDelete: string[] = [];

      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`;
        const existing = prev[targetLangKey] || prev[linkedWord];

        const updated: LingQ = {
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
        Object.keys(nextLingqs).forEach((k) => {
          const kLower = k.trim().toLowerCase();
          if (kLower === linkedWord.toLowerCase() && k !== targetLangKey) {
            keysToDelete.push(k);
            delete nextLingqs[k];
          }
        });

        nextLingqs[targetLangKey] = updated;

        if (auth.currentUser && storageMode === "cloud") {
          saveLingQ(auth.currentUser.uid, targetLangKey, updated).catch((err) => console.error(err));
        }
      });

      if (auth.currentUser && storageMode === "cloud" && keysToDelete.length > 0) {
        deleteMultipleLingQs(auth.currentUser.uid, keysToDelete).catch((err) =>
          console.error("Failed to delete legacy keys from cloud during status update:", err)
        );
      }

      if (storageMode === "server") {
        syncDataToLocalServer(lessons, lessonTypes, nextLingqs, wordLinks).catch((err) => console.error(err));
      }

      return nextLingqs;
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
          safeLocalStorageSetItem("lingq_clone_lessons", JSON.stringify(next));
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
      syncDataToLocalServer(remaining, lessonTypes, lingqs, wordLinks, listeningSeconds, languageFlags).catch((err) => console.error(err));
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
              <span className="text-[9px] font-black uppercase tracking-widest text-teal-650 dark:text-teal-400 bg-teal-100/40 dark:bg-teal-950/40 px-2 py-0.5 rounded">
                Focused Reading Room
              </span>
              <h2 className="text-sm font-bold text-inherit block truncate mt-1">
                {activeLesson.title}
              </h2>
            </div>

            {/* Typography controls */}
            <div className="flex flex-wrap items-center gap-2">
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
                      ? "bg-white dark:bg-zinc-805 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150 dark:border-zinc-750"
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
                      ? "bg-white dark:bg-zinc-805 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150 dark:border-zinc-750"
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
                      ? "bg-white dark:bg-zinc-805 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150 dark:border-zinc-750"
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
              lingqs={lingqs}
              activeWord={selectedWord}
              wordLinks={wordLinks}
              onWordClick={handleWordClick}
              onMarkKnown={(w) => handleUpdateStatusDirect(w, "known")}
              settings={readerSettings}
              onEditClick={() => setEditingLesson(activeLesson)}
              currentYoutubeTime={youtubePlayTime}
              onTimestampClick={(seconds) => setYoutubeSeekToTime(seconds)}
            />
          </div>

          {/* Right Sidebar - Active Word dictionary */}
          <div className="hidden md:block md:col-span-4 lg:col-span-4 md:sticky md:top-[85px] max-h-[calc(100vh-110px)] overflow-y-auto pr-1 z-25">
            <WordExplainer
              word={selectedWord}
              sentence={selectedContext}
              targetLanguage={activeLesson.targetLanguage}
              translationLanguage={activeLesson.translationLanguage}
              existingLingQ={activeLingQ}
              wordLinks={wordLinks}
              lingqs={lingqs}
              onSaveLingQ={handleSaveLingQ}
              onDeleteLingQ={handleDeleteLingQ}
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
                <div className="w-12 h-1.5 bg-zinc-350 dark:bg-zinc-700 rounded-full animate-pulse" />
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-32px)] px-3 pb-6">
                <WordExplainer
                  word={selectedWord}
                  sentence={selectedContext}
                  targetLanguage={activeLesson.targetLanguage}
                  translationLanguage={activeLesson.translationLanguage}
                  existingLingQ={activeLingQ}
                  wordLinks={wordLinks}
                  lingqs={lingqs}
                  onSaveLingQ={handleSaveLingQ}
                  onDeleteLingQ={handleDeleteLingQ}
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
            <div className="flex items-center justify-between pb-5 border-b border-zinc-150 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-600 rounded-xl text-white">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900 dark:text-white tracking-wide">
                    SLL Menu
                  </h3>
                  <span className="text-[9px] font-black text-teal-650 dark:text-teal-400 uppercase tracking-widest block font-mono">
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
                <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest pl-2 font-mono">
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
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-750 dark:text-teal-400 border border-teal-100/50 dark:border-teal-905/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-805/50 hover:text-zinc-850 dark:hover:text-white"
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
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-750 dark:text-teal-400 border border-teal-100/50 dark:border-teal-905/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-805/50 hover:text-zinc-850 dark:hover:text-white"
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
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-750 dark:text-teal-400 border border-teal-100/50 dark:border-teal-905/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-805/50 hover:text-zinc-850 dark:hover:text-white"
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
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-750 dark:text-teal-400 border border-teal-100/50 dark:border-teal-905/40 shadow-3xs"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-805/50 hover:text-zinc-850 dark:hover:text-white"
                  }`}
                >
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  Статистика (Stats)
                </button>
              </div>

              {/* Quick Actions separator */}
              <div className="space-y-1.5 pt-4 border-t border-zinc-150 dark:border-zinc-800">
                <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest pl-2 font-mono">
                  Actions (Действия)
                </span>

                {activeLesson && (
                  <button
                    id="btn-enter-focus"
                    onClick={() => {
                      setIsFocusMode(true);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-teal-650 dark:text-teal-400 bg-teal-50/60 hover:bg-teal-100/80 dark:bg-teal-950/20 dark:hover:bg-teal-900/30 border border-teal-100/50 dark:border-teal-900/50 rounded-xl transition-all cursor-pointer active:scale-97"
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-zinc-650 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-805/50 hover:text-zinc-850 dark:hover:text-white rounded-xl transition-all cursor-pointer"
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
            <div className="pt-4 border-t border-zinc-150 dark:border-zinc-800 text-center">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-805">
                <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 font-mono">
                  Cloud Profile
                </span>
                {activeUser ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{activeUser.displayName || activeUser.email}</p>
                    <div className="flex items-center justify-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${user ? "bg-teal-500 animate-pulse" : "bg-teal-550"}`} />
                      <span className="text-[8px] font-bold text-teal-650 dark:text-teal-400 uppercase tracking-wider">
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
                    className="text-[9px] font-black text-teal-650 dark:text-teal-400 hover:underline cursor-pointer"
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

              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-600 rounded-xl text-white shadow-md shadow-teal-100/10 dark:shadow-none hidden sm:block">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 text-zinc-900 dark:text-white">
                    Smart Language Learner
                  </h1>
                </div>
              </div>
            </div>

            {/* Right side: Sync State & Login/Logout HUD */}
            <div className="flex items-center gap-2">
              {isAuthLoading ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-250 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-3xs">
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
                    <div className="w-5.5 h-5.5 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center text-[10px] font-black text-teal-700 dark:text-teal-350">
                      {(activeUser.displayName || activeUser.email || "U").substring(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] font-black text-teal-700 dark:text-teal-350 flex items-center gap-1">
                      {user ? "☁️ active" : "💻 local"}
                      {user && isSyncing && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (user) {
                        signOut(auth).catch(err => console.error(err));
                      } else {
                        setLocalUser(null);
                        localStorage.removeItem("lingq_clone_local_user");
                      }
                    }}
                    className="text-[9px] font-bold text-zinc-450 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-1.5 py-0.5 rounded transition cursor-pointer"
                    title="Выйти (Logout)"
                  >
                    Exit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLocalLoginModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-905 border border-zinc-250 dark:border-zinc-800 text-zinc-750 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[10px] font-bold rounded-xl transition duration-150 cursor-pointer shadow-3xs"
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
              <div className="p-2 bg-amber-100 dark:bg-amber-950/40 text-amber-650 dark:text-amber-450 rounded-xl shrink-0 animate-pulse">
                <HelpCircle className="w-5 h-5 opacity-80" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-amber-850 dark:text-amber-450 leading-none">
                  Связь с облаком не установлена (Работа в локальном режиме)
                </h4>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 leading-relaxed">
                  Не удалось подключиться к облачной базе данных Google Firebase. Все функции активны, и ваши данные <strong>сохраняются локально</strong> в кэше браузера. Синхронизация автоматически возобновится при восстановлении связи!
                </p>
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
              lingqs={lingqs}
              wordLinks={wordLinks}
              languageFlags={languageFlags}
            />
          </div>
        ) : activeTab === "statistics" ? (
          /* Statistics Dashboard */
          <div className="py-2 animate-in fade-in duration-150">
            <StatisticsPage
              lingqs={lingqs}
              lessons={lessons}
              listeningSeconds={listeningSeconds}
              onUpdateStatus={handleUpdateStatusDirect}
              onDeleteLingQ={handleDeleteLingQ}
              onDeleteMultipleLingQs={handleDeleteMultipleLingQs}
              onSaveLingQ={handleSaveLingQ}
              onRenameLingQ={handleRenameLingQ}
              wordLinks={wordLinks}
              onOpenLesson={handleOpenLesson}
            />
          </div>
        ) : activeTab === "practice" ? (
          /* Study vocab tab */
          <div className="py-6">
            <VocabularyPractice
              lingqs={lingqs}
              onUpdateStatus={handleUpdateStatusDirect}
              defaultLanguage={activeLesson?.targetLanguage || "Spanish"}
              onAddLesson={handleAddLesson}
              onSelectTab={setActiveTab}
              settings={readerSettings}
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
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap text-zinc-500 hover:text-teal-650 dark:text-zinc-400 dark:hover:text-teal-400 text-xs font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:shadow-xs transition-all active:scale-97 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Библиотека (Library)
                        </button>
                        <span className="text-zinc-350 dark:text-zinc-650 text-xs hidden sm:inline">/</span>
                        <span className="text-zinc-700 dark:text-zinc-300 text-xs font-bold truncate max-w-[200px]" title={activeLesson.title}>
                          {activeLesson.title}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => setIsFocusMode(true)}
                          className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap bg-teal-50 hover:bg-teal-100/80 dark:bg-teal-950/20 dark:hover:bg-teal-900/30 text-teal-650 dark:text-teal-400 border border-teal-100 dark:border-teal-900/50 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
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
                        <div className="flex items-center gap-1 bg-stone-100/50 dark:bg-zinc-900/55 p-1 h-9 rounded-xl border border-zinc-200/50 dark:border-zinc-850/60 font-sans shrink-0">
                          <button
                            type="button"
                            onClick={() => setLayoutWidthMode("standard")}
                            className={`h-7 px-2 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              layoutWidthMode === "standard"
                                ? "bg-white dark:bg-zinc-805 text-teal-655 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-750"
                                : "text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-300"
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
                                ? "bg-white dark:bg-zinc-805 text-teal-655 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-750"
                                : "text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-300"
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
                                ? "bg-white dark:bg-zinc-805 text-teal-655 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-750"
                                : "text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-300"
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
                      lingqs={lingqs}
                      activeWord={selectedWord}
                      wordLinks={wordLinks}
                      onWordClick={handleWordClick}
                      onMarkKnown={(w) => handleUpdateStatusDirect(w, "known")}
                      settings={readerSettings}
                      onEditClick={() => setEditingLesson(activeLesson)}
                      currentYoutubeTime={youtubePlayTime}
                      onTimestampClick={(seconds) => setYoutubeSeekToTime(seconds)}
                    />
                  </>
                ) : (
                  <div className="bg-white dark:bg-zinc-900 p-12 text-center rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-4">
                    <BookOpen className="w-12 h-12 text-zinc-300 mx-auto" />
                    <p className="text-zinc-550 dark:text-zinc-400">No lessons currently chosen. Go to the Library tab to selects or import lessons!</p>
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
                      existingLingQ={activeLingQ}
                      wordLinks={wordLinks}
                      lingqs={lingqs}
                      onSaveLingQ={handleSaveLingQ}
                      onDeleteLingQ={handleDeleteLingQ}
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
                    <div className="w-12 h-1.5 bg-zinc-350 dark:bg-zinc-700 rounded-full animate-pulse" />
                  </div>
                  <div className="overflow-y-auto max-h-[calc(80vh-32px)] px-3 pb-6">
                    <WordExplainer
                      word={selectedWord}
                      sentence={selectedContext}
                      targetLanguage={activeLesson.targetLanguage}
                      translationLanguage={activeLesson.translationLanguage}
                      existingLingQ={activeLingQ}
                      wordLinks={wordLinks}
                      lingqs={lingqs}
                      onSaveLingQ={handleSaveLingQ}
                      onDeleteLingQ={handleDeleteLingQ}
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

      <footer className="py-6 border-t border-zinc-200/50 dark:border-zinc-900 text-center text-xs text-zinc-400 dark:text-zinc-650 bg-stone-50 dark:bg-zinc-950/40">
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
        storageMode={storageMode}
        onStorageModeChange={setStorageMode}
        firebaseUser={user}
        lingqs={lingqs}
        lessonTypes={lessonTypes}
        listeningSeconds={listeningSeconds}
        onImportData={(imported) => {
          if (imported.lessons) {
            setLessons(imported.lessons);
          }
          if (imported.lessonTypes) {
            setLessonTypes(imported.lessonTypes);
          }
          if (imported.lingqs) {
            setLingqs(imported.lingqs);
          }
          if (imported.wordLinks) {
            setWordLinks(imported.wordLinks);
          }
          if (imported.listeningSeconds !== undefined) {
            setListeningSeconds(imported.listeningSeconds);
          }
          if (imported.languageFlags) {
            setLanguageFlags(imported.languageFlags);
          }

          // Force update local storage instantly
          if (imported.lessons) safeLocalStorageSetItem("lingq_clone_lessons", JSON.stringify(imported.lessons));
          if (imported.lessonTypes) safeLocalStorageSetItem("lingq_clone_lessontypes", JSON.stringify(imported.lessonTypes));
          if (imported.lingqs) safeLocalStorageSetItem("lingq_clone_words", JSON.stringify(imported.lingqs));
          if (imported.wordLinks) safeLocalStorageSetItem("lingq_clone_aliases", JSON.stringify(imported.wordLinks));
          if (imported.listeningSeconds !== undefined) safeLocalStorageSetItem("lingq_clone_listening", imported.listeningSeconds.toString());
          if (imported.languageFlags) safeLocalStorageSetItem("lingq_clone_language_flags", JSON.stringify(imported.languageFlags));

          // Upload to cloud if logged in and cloud sync is active
          if (storageMode === "cloud" && user) {
            uploadLocalToCloud(
              user.uid,
              imported.lessons || lessons,
              imported.lessonTypes || lessonTypes,
              imported.lingqs || lingqs,
              imported.wordLinks || wordLinks,
              imported.listeningSeconds !== undefined ? imported.listeningSeconds : listeningSeconds,
              imported.languageFlags || languageFlags
            ).catch(err => console.error("Cloud import sync error:", err));
          }
        }}
        onClearAllData={async () => {
          // Reset states to default
          setLessons(BUILT_IN_LESSONS);
          setLessonTypes(DEFAULT_LESSON_TYPES);
          setLingqs({});
          setWordLinks({});
          setListeningSeconds(0);
          setLanguageFlags({});

          // Delete corresponding localStorage keys
          localStorage.removeItem("lingq_clone_lessons");
          localStorage.removeItem("lingq_clone_lessontypes");
          localStorage.removeItem("lingq_clone_words");
          localStorage.removeItem("lingq_clone_aliases");
          localStorage.removeItem("lingq_clone_listening");
          localStorage.removeItem("lingq_clone_language_flags");

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
              await fetch("/api/server-db", { method: "DELETE" });
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
                lingqs,
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
            <button
              onClick={() => {
                setShowLocalLoginModal(false);
                setAuthError(null);
              }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-205 cursor-pointer text-base font-bold"
            >
              &times;
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center mx-auto text-xl">
                🔑
              </div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
                Авторизация и Синхронизация
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 px-2 leading-relaxed">
                Войдите под своей учетной записью Google для облачного бекапа на любом устройстве, либо используйте автономный режим гостя на вашем ПК.
              </p>
            </div>

            {authError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed max-h-36 overflow-y-auto">
                <p className="font-bold mb-1">⚠️ Ошибка авторизации Google:</p>
                <p className="mb-2">{authError}</p>
                <p className="opacity-80 border-t border-red-150/50 dark:border-red-900/40 pt-1.5 font-sans">
                  <strong>Для разработчиков на локальном ПК:</strong> Убедитесь, что ваш адрес (например, localhost) зарегистрирован в authorized domains в панели управления Firebase, либо используйте Локальный вход ниже.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={async () => {
                  setAuthError(null);
                  try {
                    await signInWithPopup(auth, googleProvider);
                    setShowLocalLoginModal(false);
                  } catch (err: any) {
                    console.error("Local PC Sign-In with popup error:", err);
                    setAuthError(err.message || String(err));
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs transition duration-150 cursor-pointer shadow-md shadow-teal-650/10"
              >
                <span>☁️</span> Войти через Google Account
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-zinc-150 dark:border-zinc-800"></div>
                <span className="flex-shrink mx-3 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest font-mono">или</span>
                <div className="flex-grow border-t border-zinc-150 dark:border-zinc-800"></div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-150/40 dark:border-zinc-800/80 space-y-3 text-left">
                <label className="block text-[10px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-wider">
                  Вход для локального ПК (Режим гостя):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localNameInput}
                    onChange={(e) => setLocalNameInput(e.target.value)}
                    placeholder="Ваше имя (Guest)"
                    className="flex-grow text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                  />
                  <button
                    onClick={() => {
                      const name = localNameInput.trim() || "Guest Developer";
                      const mockUserObj = {
                        uid: "local-guest",
                        displayName: name,
                        email: `${name.toLowerCase().replace(/\s+/g, "_")}@localhost`
                      };
                      setLocalUser(mockUserObj);
                      localStorage.setItem("lingq_clone_local_user", JSON.stringify(mockUserObj));
                      setShowLocalLoginModal(false);
                      setAuthError(null);
                    }}
                    className="px-3.5 py-2 bg-zinc-700 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    💻 Начать
                  </button>
                </div>
              </div>
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
