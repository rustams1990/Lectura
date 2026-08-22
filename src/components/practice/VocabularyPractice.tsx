/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { VocabItem, WordStatus, Lesson, ReaderSettings } from "../../types";
import { calculateNextReview } from "../../utils/srsAlgorithm";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, Star, ArrowRight, CheckCircle, RefreshCw, Bookmark, Sparkles, X, ChevronDown, BookOpen, Volume2, Edit3, Download, Settings, BrainCircuit, SlidersHorizontal, List, MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getLanguageNameWithDialect, safeLocalStorageSetItem } from "../../utils";
import { useToast } from "../../context/ToastContext";
import WordExplainer from "../WordExplainer";
import FlashcardMode from "./FlashcardMode";
import SpellingMode from "./SpellingMode";
import { LANGUAGES_SUPPORTED } from "../../data";
import { executeAiWithFailover, getOrCreateAiProfiles } from "../../services/aiFailoverService";
import { resolveLocale, formatFriendlyDate } from "../../utils/dateUtils";
import { formatAppDate } from "../../utils/dateFormatter";
import { getLanguageFlagEmoji } from "../LibraryHome";



interface VocabularyPracticeProps {
  vocab: Record<string, VocabItem>;
  wordLinks?: Record<string, string>;
  onUpdateStatus: (word: string, status: WordStatus, lang?: string) => void;
  defaultLanguage?: string;
  onAddLesson?: (newL: Lesson) => void;
  onSelectTab?: (tab: "library" | "read" | "practice" | "statistics") => void;
  settings?: ReaderSettings;
  onSaveVocab?: (item: VocabItem, lang?: string) => void;
  onDeleteVocab?: (word: string, lang?: string) => void;
  onSaveWordLink?: (from: string, to: string, lang?: string) => void;
  onDeleteWordLink?: (from: string, lang?: string) => void;
  lessons?: Lesson[];
}

export default function VocabularyPractice({
  vocab,
  wordLinks = {},
  onUpdateStatus,
  defaultLanguage,
  onAddLesson,
  onSelectTab,
  settings,
  onSaveVocab,
  onDeleteVocab,
  onSaveWordLink,
  onDeleteWordLink,
  lessons
}: VocabularyPracticeProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  // Extract all active language keys that have learning words (statuses 1-5)
  const activeDeckLanguages = useMemo(() => {
    const langs = new Set<string>();
    Object.entries(vocab).forEach(([key, lq]) => {
      if (!lq) return;
      const isActive = lq.status && ["1", "2", "3", "4", "5", "learning"].includes(lq.status);
      if (!isActive) return;
      const parts = key.split("_");
      if (parts.length > 1) {
        langs.add(parts[0].charAt(0).toUpperCase() + parts[0].slice(1));
      } else {
        langs.add("Spanish"); // fallback legacy
      }
    });
    // Ensure defaultLanguage is present if specified
    if (defaultLanguage) {
      langs.add(defaultLanguage.charAt(0).toUpperCase() + defaultLanguage.slice(1).toLowerCase());
    }
    return Array.from(langs);
  }, [vocab, defaultLanguage]);

  const [selectedPracticeLang, setSelectedPracticeLang] = useState<string>(() => {
    return defaultLanguage || "Spanish";
  });

  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [timeframeFilter, setTimeframeFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [deckTypeFilter, setDeckTypeFilter] = useState<"learning" | "all" | "spelling-problems" | "spelling-accents" | "spelling-correct">("learning");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyMode, setStudyMode] = useState<"word" | "image" | "spelling">("word");
  // Words re-queued after "Again" — shown again at end of current session
  const [relearningQueue, setRelearningQueue] = useState<string[]>([]);

  // Header and toolbar dropdown states
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [isDirDropdownOpen, setIsDirDropdownOpen] = useState(false);

  const langDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const filtersPopoverRef = React.useRef<HTMLDivElement | null>(null);
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null);
  const modeDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const dirDropdownRef = React.useRef<HTMLDivElement | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (langDropdownRef.current && !langDropdownRef.current.contains(target)) {
        setIsLangMenuOpen(false);
      }
      if (filtersPopoverRef.current && !filtersPopoverRef.current.contains(target)) {
        setIsFiltersOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setIsMoreMenuOpen(false);
      }
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(target)) {
        setIsModeDropdownOpen(false);
      }
      if (dirDropdownRef.current && !dirDropdownRef.current.contains(target)) {
        setIsDirDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  // Reset card index and relearning queue when deck filter/mode/language changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setRelearningQueue([]);
  }, [deckTypeFilter, studyMode, selectedPracticeLang]);

  // Extract all learning status words for the selected language, resolving them to parents if they exist
  const learningList = useMemo(() => {
    const parentMap = new Map<string, typeof vocab[string]>();

    // Build O(1) lowercase lookup maps ONCE before processing entries to avoid O(N^2) linear scans
    const lowerVocabMap = new Map<string, VocabItem>();
    for (const [k, v] of Object.entries(vocab)) {
      if (v) lowerVocabMap.set(k.toLowerCase(), v);
    }

    const lowerLinksMap = new Map<string, string>();
    for (const [k, v] of Object.entries(wordLinks)) {
      if (v) lowerLinksMap.set(k.toLowerCase(), v);
    }

    const targetLangLower = selectedPracticeLang.toLowerCase();

    // Step 1: Map all vocab entries to their root parent item case-insensitively
    Object.entries(vocab).forEach(([key, lq]) => {
      if (!lq) return;

      const parts = key.split("_");
      const itemLang = parts.length > 1 ? parts[0] : "spanish";
      if (itemLang.toLowerCase() !== targetLangLower) return;

      // Resolve recursively to top-level parent key (case-insensitively using O(1) Map)
      let parentKey = key;
      const visited = new Set<string>();
      while (true) {
        const linkTarget = lowerLinksMap.get(parentKey.toLowerCase());
        if (!linkTarget || visited.has(linkTarget.toLowerCase())) break;
        visited.add(parentKey.toLowerCase());
        parentKey = linkTarget;
      }

      const cleanParentWord = parentKey.replace(/^[a-zA-Z]+_/, "");

      // Find parent item in vocab case-insensitively or fallback (using O(1) Map)
      const parentLq = lowerVocabMap.get(parentKey.toLowerCase()) || {
        ...lq,
        word: cleanParentWord,
      };

      const normalizedParentKey = parentKey.toLowerCase();

      // Merge entries under normalized parent key so updated SRS dates are never lost
      const existing = parentMap.get(normalizedParentKey);
      if (!existing) {
        parentMap.set(normalizedParentKey, parentLq);
      } else {
        const merged: VocabItem = {
          ...existing,
          ...parentLq,
          srsNextReview: parentLq.srsNextReview ?? existing.srsNextReview,
          srsInterval: parentLq.srsInterval ?? existing.srsInterval,
          srsEaseFactor: parentLq.srsEaseFactor ?? existing.srsEaseFactor,
          srsRepetitions: parentLq.srsRepetitions ?? existing.srsRepetitions,
          status: parentLq.status && parentLq.status !== "1" ? parentLq.status : existing.status,
        };
        parentMap.set(normalizedParentKey, merged);
      }
    });

    // Step 2: Apply deck filters to the resolved root parent items
    const now = Date.now();
    return Array.from(parentMap.values())
      .filter((lq) => {
        if (!lq || !lq.word) return false;

        // Apply deck filter with complete separation of Reading and Spelling metrics
        if (studyMode === "spelling") {
          // SPELLING METRIC: Independent tracking of writing accuracy
          if (lq.status === "ignored" || lq.spellingExclude === true) return false;

          if (deckTypeFilter === "learning") {
            // Words not yet spelled correctly in current writing queue
            if (lq.lastSpelledCorrectly === true) return false;
          } else if (deckTypeFilter === "spelling-problems") {
            if (lq.lastSpelledCorrectly !== false || lq.lastSpelledWithAccentError === true) return false;
          } else if (deckTypeFilter === "spelling-accents") {
            if (!lq.lastSpelledWithAccentError) return false;
          } else if (deckTypeFilter === "spelling-correct") {
            if (lq.lastSpelledCorrectly !== true) return false;
          }
          // "all" in spelling mode -> all vocabulary available for writing practice!
        } else {
          // READING METRIC: Independent tracking of passive recognition SRS
          if (deckTypeFilter === "learning") {
            const isActive = lq.status && ["1", "2", "3", "4", "5", "learning"].includes(lq.status);
            if (!isActive) return false;
            const isDue = !lq.srsNextReview || lq.srsNextReview <= now;
            if (!isDue) return false;
          } else {
            // "all" - anything that isn't ignored or known
            if (lq.status === "ignored" || lq.status === "known") return false;
          }
        }

        // Apply timeframe filter
        if (timeframeFilter !== "all") {
          const createdAtVal = typeof lq.createdAt === "number" && !isNaN(lq.createdAt) ? lq.createdAt : now;
          let threshold = 0;
          if (timeframeFilter === "today") {
            threshold = now - 24 * 60 * 60 * 1000;
          } else if (timeframeFilter === "week") {
            threshold = now - 7 * 24 * 60 * 60 * 1000;
          } else if (timeframeFilter === "month") {
            threshold = now - 30 * 24 * 60 * 60 * 1000;
          }
          if (createdAtVal < threshold) return false;
        }

        return true;
      })
      .map((lq) => ({
        ...lq,
        word: lq.word || "",
        translation: lq.translation || "",
        grammar: lq.grammar || "",
        ipa: lq.ipa || "",
        contextRelation: lq.contextRelation || "",
        status: lq.status || "1",
        createdAt: typeof lq.createdAt === "number" && !isNaN(lq.createdAt) ? lq.createdAt : Date.now(),
        tags: Array.isArray(lq.tags) ? lq.tags.filter((t) => typeof t === "string") : [],
        examples: Array.isArray(lq.examples) ? lq.examples : [],
        imageUrl: typeof lq.imageUrl === "string" ? lq.imageUrl : null,
        spellingCorrectCount: typeof lq.spellingCorrectCount === "number" ? lq.spellingCorrectCount : 0,
        spellingIncorrectCount: typeof lq.spellingIncorrectCount === "number" ? lq.spellingIncorrectCount : 0,
        spellingAccentCount: typeof lq.spellingAccentCount === "number" ? lq.spellingAccentCount : 0,
        lastSpelledCorrectly: lq.lastSpelledCorrectly !== undefined ? lq.lastSpelledCorrectly : null,
        lastSpelledWithAccentError: !!lq.lastSpelledWithAccentError,
        spellingExclude: !!lq.spellingExclude,
      }));
  }, [vocab, selectedPracticeLang, wordLinks, timeframeFilter, deckTypeFilter, studyMode]);




  const [spellingInput, setSpellingInput] = useState("");
  const [spellingStatus, setSpellingStatus] = useState<"unchecked" | "correct" | "incorrect" | "accent-warning">("unchecked");
  const [hasCheckedSpelling, setHasCheckedSpelling] = useState(false);
  const spellingInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const ttsAbortControllerRef = React.useRef<AbortController | null>(null);
  // Generation counter: incremented on every card navigation so stale async TTS requests can be discarded
  const ttsGenerationRef = React.useRef<number>(0);
  // Pending spell result to be saved when user navigates (prevents immediate list recomputation)
  const pendingSpellSaveRef = React.useRef<VocabItem | null>(null);
  // Target next word to preserve index alignment when elements are dynamically filtered out of learningList
  const nextWordTargetRef = React.useRef<string | null>(null);

  // Stop all active audio / TTS on unmount
  useEffect(() => {
    return () => {
      if (ttsAbortControllerRef.current) {
        ttsAbortControllerRef.current.abort();
      }
      if (activeAudioRef.current) {
        try {
          activeAudioRef.current.pause();
          activeAudioRef.current.currentTime = 0;
          activeAudioRef.current.src = "";
        } catch (e) {}
        activeAudioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
    };
  }, []);

  useEffect(() => {
    if (nextWordTargetRef.current) {
      const targetWord = nextWordTargetRef.current;
      nextWordTargetRef.current = null;
      const newIdx = learningList.findIndex(item => item.word === targetWord);
      if (newIdx !== -1) {
        setCurrentIndex(newIdx);
      } else {
        setCurrentIndex(0);
      }
    }
  }, [learningList]);

  const resetSpellingState = () => {
    setSpellingInput("");
    setSpellingStatus("unchecked");
    setHasCheckedSpelling(false);
  };
  const [studyDirection, setStudyDirection] = useState<"forward" | "reverse">("forward");
  const [isEditingWord, setIsEditingWord] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [modalTranslationLang, setModalTranslationLang] = useState(() => {
    return localStorage.getItem("vocab_default_translation_language") || "Russian";
  });

  const handleExportAnki = () => {
    if (!learningList || learningList.length === 0) return;

    // Специфичный формат для Anki: Слово ; Перевод ; Контекст
    const header = [t('practice.anki_word', 'Слово'), t('practice.anki_translation', 'Перевод'), t('practice.anki_context', 'Контекст')].join(";");
    const rows = learningList.map((item) => {
      const cleanWord = (item.word || "").replace(/;/g, ",").replace(/\n/g, " ").trim();
      const cleanTranslation = (item.translation || "").replace(/;/g, ",").replace(/\n/g, " ").trim();
      
      // Some properties might not be strongly typed, so we use type assertion safely
      const rawContext = item.contextRelation || (item as any).contextSentence || (item as any).sentence || "";
      const cleanContext = rawContext.replace(/;/g, ",").replace(/\n/g, " ").trim();

      return `${cleanWord};${cleanTranslation};${cleanContext}`;
    });

    const csvContent = [header, ...rows].join("\n");
    // UTF-8 BOM helps Excel/Anki recognize UTF-8 characters correctly
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename = `lectura_anki_${selectedPracticeLang.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveVocabWrapped = (item: VocabItem) => {
    if (onSaveVocab) {
      onSaveVocab(item, selectedPracticeLang);
    }
  };

  const handleDeleteVocabWrapped = (word: string) => {
    if (onDeleteVocab) {
      onDeleteVocab(word, selectedPracticeLang);
    }
  };

  const handleSaveWordLinkWrapped = (from: string, to: string) => {
    if (onSaveWordLink) {
      onSaveWordLink(from, to, selectedPracticeLang);
    }
  };

  const handleDeleteWordLinkWrapped = (from: string) => {
    if (onDeleteWordLink) {
      onDeleteWordLink(from, selectedPracticeLang);
    }
  };

  const [playingSpeech, setPlayingSpeech] = useState(false);

  const playSpeech = async (wordToPlay: string) => {
    if (!wordToPlay) return;

    // Snapshot the current generation and increment for the next caller.
    // Any awaited operation that sees a different generation should abort.
    const myGeneration = ttsGenerationRef.current + 1;
    ttsGenerationRef.current = myGeneration;

    // 1. Abort previous pending fetch request if any
    if (ttsAbortControllerRef.current) {
      try {
        ttsAbortControllerRef.current.abort();
      } catch (e) {}
      ttsAbortControllerRef.current = null;
    }
    const abortController = new AbortController();
    ttsAbortControllerRef.current = abortController;

    // 2. Immediately cancel local browser SpeechSynthesis to stop overlapping
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        console.error("speechSynthesis cancel error:", e);
      }
    }

    // 3. Stop any active HTML5 Audio playback (Google TTS / Gemini TTS)
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.src = "";
      } catch (e) {
        console.error("Audio pause error:", e);
      }
      activeAudioRef.current = null;
    }

    setPlayingSpeech(true);

    const currentTtsEngine = settings?.ttsEngine || "google";
    const targetLanguage = selectedPracticeLang;
    const ttsLang = getEffectiveTtsLocale(targetLanguage, settings);

    const isStale = () => ttsGenerationRef.current !== myGeneration || abortController.signal.aborted;

    // --- Google Translate TTS (with local caching) ---
    if (currentTtsEngine === "google") {
      try {
        const cacheKey = `google-tts:${ttsLang}:${wordToPlay.toLowerCase().trim()}`;
        let audioUrl: string | null = null;
        let blob = await getTtsAudioFromCache(cacheKey);

        if (isStale()) { setPlayingSpeech(false); return; }

        if (blob) {
          audioUrl = URL.createObjectURL(blob);
        } else {
          const params = new URLSearchParams({ text: wordToPlay, lang: ttsLang });
          const response = await fetch(`/api/google-tts?${params.toString()}`, {
            signal: abortController.signal,
          });
          if (isStale()) { setPlayingSpeech(false); return; }
          if (!response.ok) throw new Error(`Google TTS ${response.status}`);
          blob = await response.blob();
          await saveTtsAudioToCache(cacheKey, blob);
          audioUrl = URL.createObjectURL(blob);
        }

        if (isStale()) {
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          setPlayingSpeech(false);
          return;
        }

        if (audioUrl) {
          if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          const audio = new Audio(audioUrl);
          activeAudioRef.current = audio;
          audio.onended = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            URL.revokeObjectURL(audioUrl!);
            setPlayingSpeech(false);
          };
          audio.onerror = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            URL.revokeObjectURL(audioUrl!);
            setPlayingSpeech(false);
          };
          await audio.play();
          return;
        }
      } catch (e: any) {
        if (
          e?.name === "AbortError" ||
          e?.code === 20 ||
          e?.message?.includes("interrupted") ||
          e?.message?.includes("aborted") ||
          isStale()
        ) {
          setPlayingSpeech(false);
          return;
        }
        console.warn("Google TTS failed, falling back to browser TTS:", e);
      }
    }

    // --- Gemini neural TTS ---
    if (currentTtsEngine === "gemini") {
      try {
        const descriptiveLang = getLanguageNameWithDialect(targetLanguage, settings);
        const response = await fetch("/api/generate-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: wordToPlay,
            language: descriptiveLang,
          }),
          signal: abortController.signal,
        });

        if (isStale()) { setPlayingSpeech(false); return; }

        if (!response.ok) {
          const errData = await safeJsonParse(response);
          throw new Error(errData?.error || t('practice.server_error', `Ошибка сервера (${response.status})`, { status: response.status }));
        }

        const data = await safeJsonParse(response);
        if (isStale()) { setPlayingSpeech(false); return; }

        if (data.audioBase64) {
          if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
          activeAudioRef.current = audio;
          audio.onended = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            setPlayingSpeech(false);
          };
          audio.onerror = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            setPlayingSpeech(false);
          };
          await audio.play();
          return;
        } else {
          throw new Error("No audio base64 payload");
        }
      } catch (e: any) {
        if (
          e?.name === "AbortError" ||
          e?.code === 20 ||
          e?.message?.includes("interrupted") ||
          e?.message?.includes("aborted") ||
          isStale()
        ) {
          setPlayingSpeech(false);
          return;
        }
        console.warn("Gemini neural voice failed or rate-limited. Falling back automatically to local browser TTS.", e);
      }
    }

    // --- Default flow: local browser HTML5 SpeechSynthesis API ---
    try {
      if (isStale()) { setPlayingSpeech(false); return; }

      if (activeAudioRef.current) {
        try {
          activeAudioRef.current.pause();
          activeAudioRef.current.currentTime = 0;
          activeAudioRef.current.src = "";
        } catch (e) {}
        activeAudioRef.current = null;
      }

      const utterance = new SpeechSynthesisUtterance(wordToPlay);
      utterance.lang = ttsLang;
      utterance.onend = () => { setPlayingSpeech(false); };
      utterance.onerror = () => { setPlayingSpeech(false); };
      
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const voices = window.speechSynthesis.getVoices();
        let matchingVoice = voices.find(v => {
          const vLang = v.lang.toLowerCase().replace("_", "-");
          return vLang === ttsLang.toLowerCase();
        });
        if (!matchingVoice) {
          const mainLang = ttsLang.toLowerCase().split("-")[0];
          matchingVoice = voices.find(v => {
            const vLang = v.lang.toLowerCase().replace("_", "-");
            return vLang.startsWith(mainLang);
          });
        }
        if (matchingVoice) utterance.voice = matchingVoice;
        window.speechSynthesis.speak(utterance);
      }
    } catch (browserErr) {
      console.error("Audio playback error:", browserErr);
      setPlayingSpeech(false);
    }
  };

  // Auto-play when current card changes or when card is flipped to reveal target word
  useEffect(() => {
    if (!currentLq || !currentLq.word) return;

    // In spelling mode: always auto-play on card change (currentIndex)
    if (studyMode === "spelling") {
      const timer = setTimeout(() => {
        playSpeech(currentLq.word);
      }, 350);
      return () => clearTimeout(timer);
    }

    const shouldPlay = (studyDirection === "forward" && !isFlipped) || (studyDirection === "reverse" && isFlipped);
    if (shouldPlay) {
      const timer = setTimeout(() => {
        playSpeech(currentLq.word);
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, selectedPracticeLang, isFlipped, studyDirection, studyMode]);

  // Keep currentIndex in bounds when deck size or language changes
  useEffect(() => {
    if (learningList.length === 0) {
      setCurrentIndex(0);
    } else if (isNaN(currentIndex) || currentIndex < 0 || currentIndex >= learningList.length) {
      setCurrentIndex(0);
    }
  }, [learningList.length, currentIndex]);

  // AI Story Gen States
  const [showStoryGen, setShowStoryGen] = useState(false);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [storyLevel, setStoryLevel] = useState<string>("B1");
  const [storyGenre, setStoryGenre] = useState<string>("general");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const handleOpenStoryGen = () => {
    // Select first 5 words by default or all if less than 5
    const initialWords = learningList.slice(0, 5).map((lq) => lq.word);
    setSelectedWords(initialWords);
    setStoryLevel("B1");
    setStoryGenre("general");
    setGenError(null);
    setShowStoryGen(true);
  };

  const handleGenerateStory = async () => {
    if (selectedWords.length === 0) {
      setGenError(t('practice.select_one_word', 'Please select at least one word.'));
      return;
    }
    if (selectedWords.length > 15) {
      setGenError(t('practice.too_many_words', 'Too many words. Please select no more than 15 words.'));
      return;
    }

    setIsGenerating(true);
    setGenError(null);

    try {
      const profiles = getOrCreateAiProfiles(settings);
      const data = await executeAiWithFailover(
        profiles,
        async (profile) => {
          const response = await fetch("/api/generate-story", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              words: selectedWords,
              targetLanguage: selectedPracticeLang,
              translationLanguage: "Russian",
              level: storyLevel,
              genre: storyGenre,
              aiProfile: profile,
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const err: any = new Error(errData.error || t('practice.conn_error', 'Server connection error'));
            err.status = response.status;
            throw err;
          }

          return response.json();
        },
        {
          onFallback: (from, to) => {
            showToast(t("settings.ai_fallback_toast", "Quota for {{from}} exceeded. Request completed via {{to}}.", { from: from.name, to: to.name }), "info");
          }
        }
      );

      if (!data.text || !data.title) {
        throw new Error(t('practice.invalid_ai_response', 'Invalid AI response format'));
      }

      const newLessonId = "story_" + Date.now();
      
      const newL: Lesson = {
        id: newLessonId,
        title: data.title,
        text: data.text,
        translationText: data.translation,
        targetLanguage: selectedPracticeLang,
        translationLanguage: "Russian",
        lessonType: "article"
      };

      if (onAddLesson) {
        onAddLesson(newL);
      }
      if (onSelectTab) {
        onSelectTab("read");
      }

      setShowStoryGen(false);
    } catch (err: any) {
      console.error(err);
      setGenError(err.message || t('practice.gen_failed', 'Failed to generate story. Please try again.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const currentLq = learningList[currentIndex];


  const checkSpelling = () => {
    if (!currentLq || !currentLq.word) return;

    const target = currentLq.word.trim();
    const typed = spellingInput.trim();

    if (!typed) return;

    // Normalizations for comparison
    const targetClean = target.toLowerCase();
    const typedClean = typed.toLowerCase();

    // Accent-insensitive normalization
    const stripAccents = (str: string) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const targetNoAccents = stripAccents(targetClean);
    const typedNoAccents = stripAccents(typedClean);

    let isCorrect = false;
    let isAccentWarning = false;

    if (targetClean === typedClean) {
      isCorrect = true;
      setSpellingStatus("correct");
      playSpeech(target);
    } else if (targetNoAccents === typedNoAccents) {
      isAccentWarning = true;
      setSpellingStatus("accent-warning");
      playSpeech(target);
    } else {
      setSpellingStatus("incorrect");
    }
    setHasCheckedSpelling(true);

    if (isCorrect) {
      // 100% correct spelling: update spelling statistics independently!
      pendingSpellSaveRef.current = {
        ...currentLq,
        spellingCorrectCount: (currentLq.spellingCorrectCount || 0) + 1,
        lastSpelledCorrectly: true,
        lastSpelledWithAccentError: false,
      };

      showToast(t('practice.toast_spelling_correct', '🟢 Correct! Spelling of «{{word}}» saved!', { word: target }), "success", 3000);

    } else if (isAccentWarning) {
      // Accent warning: update accent error statistics
      pendingSpellSaveRef.current = {
        ...currentLq,
        spellingAccentCount: (currentLq.spellingAccentCount || 0) + 1,
        lastSpelledWithAccentError: true,
      };

      showToast(t('practice.toast_spelling_accent', '⚠️ Warning: accent / diacritic typo in «{{word}}»', { word: target }), "warning", 3000);

    } else {
      // Incorrect spelling -> re-queue card in current session for writing practice, WITHOUT touching reading status!
      setRelearningQueue((prev) => (prev.includes(target) ? prev : [...prev, target]));

      pendingSpellSaveRef.current = {
        ...currentLq,
        spellingIncorrectCount: (currentLq.spellingIncorrectCount || 0) + 1,
        lastSpelledCorrectly: false,
        lastSpelledWithAccentError: false,
      };

      showToast(t('practice.toast_spelling_error', '🔴 Spelling error! «{{word}}» will return in this session', { word: target }), "error", 3000);
    }
  };

  const handleExcludeSpelling = () => {
    if (!currentLq) return;

    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % Math.max(learningList.length, 1)]?.word || null;
    nextWordTargetRef.current = targetWord;

    // 2. Flush any pending spell result first
    if (pendingSpellSaveRef.current) {
      handleSaveVocabWrapped(pendingSpellSaveRef.current);
      pendingSpellSaveRef.current = null;
    }
    
    // 3. Exclude current word
    const updatedLq: VocabItem = {
      ...currentLq,
      spellingExclude: true,
      lastSpelledCorrectly: true,
      lastSpelledWithAccentError: false,
    };
    handleSaveVocabWrapped(updatedLq);

    setIsFlipped(false);
    resetSpellingState();
  };

  const handleDontKnow = () => {
    if (!currentLq || !currentLq.word) return;

    const target = currentLq.word;
    setSpellingStatus("incorrect");
    setHasCheckedSpelling(true);
    setIsFlipped(true); // reveal back side with correct answer!

    setRelearningQueue((prev) => (prev.includes(target) ? prev : [...prev, target]));

    pendingSpellSaveRef.current = {
      ...currentLq,
      spellingIncorrectCount: (currentLq.spellingIncorrectCount || 0) + 1,
      lastSpelledCorrectly: false,
      lastSpelledWithAccentError: false,
    };

    showToast(t('practice.toast_dont_know', '🔴 Don\'t know: «{{word}}» will return in this session', { word: target }), "warning", 3000);
  };

  const getClozeSentence = (sentenceText: string, targetWord: string) => {
    if (!sentenceText || !targetWord) return "";
    const escapedWord = targetWord.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    const regex = new RegExp(`\\b${escapedWord}\\b`, "gi");
    if (regex.test(sentenceText)) {
      return sentenceText.replace(regex, "_______");
    }

    const index = sentenceText.toLowerCase().indexOf(targetWord.toLowerCase());
    if (index !== -1) {
      const before = sentenceText.substring(0, index);
      const after = sentenceText.substring(index + targetWord.length);
      return before + "_______" + after;
    }

    return sentenceText;
  };

  const handleSpellingKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!hasCheckedSpelling) {
        if (spellingInput.trim()) {
          checkSpelling();
        }
      } else {
        if (spellingStatus === "correct" || spellingStatus === "accent-warning") {
          handleNext();
        } else {
          resetSpellingState();
          setTimeout(() => {
            spellingInputRef.current?.focus();
          }, 50);
        }
      }
    }
  };

  // Autofocus input when index, word, mode, or selected practice language changes
  useEffect(() => {
    resetSpellingState();
    if (studyMode === "spelling") {
      const timer = setTimeout(() => {
        spellingInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentLq?.word, studyMode, selectedPracticeLang]);



  const hasAnyImages = useMemo(() => {
    return learningList.some((lq) => !!lq.imageUrl);
  }, [learningList]);

  // Safeguard against temporary out-of-bound index renders during state updates
  if (learningList.length > 0 && !currentLq) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 font-sans">
        {t('practice.loading_flashcard', 'Загрузка карточки... / Loading flashcard...')}
      </div>
    );
  }

  const isCardWithImage = studyMode === "image" && currentLq && !!currentLq.imageUrl;

  const handleNext = () => {
    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % Math.max(learningList.length, 1)]?.word || null;
    nextWordTargetRef.current = targetWord;

    resetSpellingState();
    setIsFlipped(false);

    if (pendingSpellSaveRef.current) {
      handleSaveVocabWrapped(pendingSpellSaveRef.current);
      pendingSpellSaveRef.current = null;
    }

    setTimeout(() => {
      const newIdx = learningList.findIndex(item => item.word === targetWord);
      if (newIdx !== -1) {
        setCurrentIndex(newIdx);
      } else {
        setCurrentIndex((prev) => (prev + 1) % Math.max(learningList.length, 1));
      }
      nextWordTargetRef.current = null;
    }, 150);
  };

  const handleMarkKnown = () => {
    if (!currentLq) return;

    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % Math.max(learningList.length, 1)]?.word || null;
    nextWordTargetRef.current = targetWord;

    setRelearningQueue((prev) => prev.filter((w) => w !== currentLq.word));

    if (onUpdateStatus) {
      onUpdateStatus(currentLq.word, "known", selectedPracticeLang);
    } else if (onSaveVocab) {
      onSaveVocab({ ...currentLq, status: "known" }, selectedPracticeLang);
    }
    showToast(t('practice.toast_marked_known', '✨ «{{word}}» marked as mastered!', { word: currentLq.word }), "success", 3000);
    setIsFlipped(false);
  };

  const handleSrsAnswer = (quality: number) => {
    if (!currentLq || !onSaveVocab) return;

    if (quality < 3) {
      // "Again" — reset status to "1" and re-queue card in current session
      const wordKey = currentLq.word;
      setRelearningQueue((prev) =>
        prev.includes(wordKey) ? prev : [...prev, wordKey]
      );

      const updatedItem: VocabItem = {
        ...currentLq,
        status: "1",
      };
      onSaveVocab(updatedItem, selectedPracticeLang);

      showToast(t('practice.toast_again', '🔴 Again «{{word}}»: review in this session', { word: currentLq.word }), "warning", 3000);

      const targetWord = learningList[(currentIndex + 1) % Math.max(learningList.length, 1)]?.word || null;
      nextWordTargetRef.current = targetWord;
      setIsFlipped(false);
      setCurrentIndex((prev) => (prev + 1) % Math.max(learningList.length, 1));
      return;
    }

    // Hard / Good / Easy — apply SM-2 and advance status
    const nextSrs = calculateNextReview(
      quality,
      currentLq.srsEaseFactor || 2.5,
      currentLq.srsInterval || 0,
      currentLq.srsRepetitions || 0
    );

    // Calculate status progression
    let currentStatus = currentLq.status || "1";
    let newStatus: WordStatus = currentStatus;

    if (quality === 3) {
      // Hard: keep current status (ensure not "new")
      if (currentStatus === "new") newStatus = "1";
    } else if (quality === 4) {
      // Good: advance +1 stage (1 -> 2 -> 3 -> 4 -> 5 -> known)
      if (currentStatus === "1" || currentStatus === "new") newStatus = "2";
      else if (currentStatus === "2") newStatus = "3";
      else if (currentStatus === "3") newStatus = "4";
      else if (currentStatus === "4") newStatus = "5";
      else if (currentStatus === "5") newStatus = "known";
    } else if (quality === 5) {
      // Easy: advance +2 stages (1/2 -> 3, 3/4 -> 5, 5 -> known)
      if (currentStatus === "1" || currentStatus === "2" || currentStatus === "new") newStatus = "3";
      else if (currentStatus === "3" || currentStatus === "4") newStatus = "5";
      else if (currentStatus === "5") newStatus = "known";
    }

    // Auto-graduate if interval >= 21 days or repetitions >= 5
    if (nextSrs.interval >= 21 || nextSrs.repetitions >= 5) {
      newStatus = "known";
    }

    const updatedItem: VocabItem = {
      ...currentLq,
      status: newStatus,
      srsNextReview: nextSrs.nextReviewDate,
      srsInterval: nextSrs.interval,
      srsEaseFactor: nextSrs.easeFactor,
      srsRepetitions: nextSrs.repetitions,
    };

    const targetWord = learningList[(currentIndex + 1) % Math.max(learningList.length, 1)]?.word || null;
    nextWordTargetRef.current = targetWord;

    // Remove from relearning queue if it was there
    setRelearningQueue((prev) => prev.filter((w) => w !== currentLq.word));

    onSaveVocab(updatedItem, selectedPracticeLang);

    // Format human-readable toast notification
    const dateFormatted = formatAppDate(nextSrs.nextReviewDate);

    const dueMsg = nextSrs.interval === 1
      ? t('practice.toast_due_tomorrow', 'tomorrow ({{date}})', { date: dateFormatted })
      : t('practice.toast_due_days', 'in {{days}} days ({{date}})', { days: nextSrs.interval, date: dateFormatted });

    if (newStatus === "known") {
      showToast(t('practice.toast_graduated', '✨ «{{word}}» mastered! Next review {{dueMsg}}', { word: currentLq.word, dueMsg }), "success", 4000);
    } else if (quality === 5) {
      showToast(t('practice.toast_easy', '⚡ Easy «{{word}}»: review {{dueMsg}}', { word: currentLq.word, dueMsg }), "success", 4000);
    } else if (quality === 4) {
      showToast(t('practice.toast_good', '🟢 Good «{{word}}»: review {{dueMsg}}', { word: currentLq.word, dueMsg }), "success", 4000);
    } else if (quality === 3) {
      showToast(t('practice.toast_hard', '🟡 Hard «{{word}}»: review {{dueMsg}}', { word: currentLq.word, dueMsg }), "info", 4000);
    }

    setIsFlipped(false);
  };

  // Single global keydown listener on window for Practice hotkeys
  const studyModeRef = React.useRef(studyMode);
  studyModeRef.current = studyMode;
  const isFlippedRef = React.useRef(isFlipped);
  isFlippedRef.current = isFlipped;
  const currentLqRef = React.useRef(currentLq);
  currentLqRef.current = currentLq;
  const handleSrsAnswerRef = React.useRef(handleSrsAnswer);
  handleSrsAnswerRef.current = handleSrsAnswer;
  const playSpeechRef = React.useRef(playSpeech);
  playSpeechRef.current = playSpeech;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Element isolation check: strictly ignore if inside interactive elements
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, button, a, [contenteditable="true"]')
      ) {
        return;
      }

      // 2. In Spelling mode: global listener ignores hotkeys completely
      if (studyModeRef.current === "spelling") {
        return;
      }

      // 3. In Word / Image mode:
      // Space / Enter -> toggle card flip (same mechanism as clicking the card)
      if (e.code === "Space" || e.key === "Enter") {
        if (e.code === "Space") {
          e.preventDefault();
        }
        setIsFlipped((prev) => !prev);
        return;
      }

      // 1, 2, 3, 4 -> SRS answers (STRICTLY when flipped)
      if (isFlippedRef.current) {
        if (e.key === "1") {
          e.preventDefault();
          handleSrsAnswerRef.current(1);
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          handleSrsAnswerRef.current(3);
          return;
        }
        if (e.key === "3") {
          e.preventDefault();
          handleSrsAnswerRef.current(4);
          return;
        }
        if (e.key === "4") {
          e.preventDefault();
          handleSrsAnswerRef.current(5);
          return;
        }
      }

      // R / r -> replay TTS speech
      if (e.key.toLowerCase() === "r") {
        if (currentLqRef.current?.word) {
          e.preventDefault();
          playSpeechRef.current(currentLqRef.current.word);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div className={`space-y-4 font-sans mx-auto transition-all duration-300 ${
      showList ? "max-w-3xl lg:max-w-4xl" : "max-w-md"
    }`}>
      {/* 1. Compact Unified Header */}
      <div className="flex items-center justify-between gap-3 px-1 py-1 font-sans">
        {/* Left: Language selector dropdown + Card counter */}
        <div className="flex items-center gap-2.5">
          {/* Language Dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsLangMenuOpen(!isLangMenuOpen);
                setIsFiltersOpen(false);
                setIsMoreMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100/80 hover:bg-zinc-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer border border-zinc-200/50 dark:border-zinc-700/50"
            >
              <span className="text-sm leading-none">{getLanguageFlagEmoji(selectedPracticeLang)}</span>
              <span>{selectedPracticeLang}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isLangMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {isLangMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 min-w-[160px] max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
                {activeDeckLanguages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setSelectedPracticeLang(lang);
                      setCurrentIndex(0);
                      setIsFlipped(false);
                      setIsLangMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 text-left cursor-pointer ${
                      selectedPracticeLang.toLowerCase() === lang.toLowerCase()
                        ? "bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="text-sm">{getLanguageFlagEmoji(lang)}</span>
                    <span>{lang}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Counter */}
          <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 font-mono tracking-tight select-none">
            {learningList.length > 0 ? `${currentIndex + 1} / ${learningList.length}` : "0 / 0"}
          </div>
        </div>

        {/* Right: 3 icon buttons (Filters, List, More) */}
        <div className="flex items-center gap-1.5">
          {/* ⚙ Filters button & Popover */}
          <div className="relative" ref={filtersPopoverRef}>
            <button
              type="button"
              onClick={() => {
                setIsFiltersOpen(!isFiltersOpen);
                setIsLangMenuOpen(false);
                setIsMoreMenuOpen(false);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                isFiltersOpen || deckTypeFilter !== "learning" || timeframeFilter !== "all"
                  ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60"
              }`}
              title={t('practice.filter_settings', 'Filter settings')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            {isFiltersOpen && (
              <div className="absolute right-0 top-full mt-1.5 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 w-[280px] sm:w-[320px] animate-in fade-in zoom-in-95 duration-100 space-y-3.5">
                {/* Deck Type Filter */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">
                    {t('practice.deck_type', 'Deck category')}
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-stone-100/60 dark:bg-zinc-950/40 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60">
                    {[
                      { id: "learning", label: t('practice.deck_learning', 'Learning 🎯') },
                      { id: "all", label: t('practice.deck_all', 'All words 📖') },
                      { id: "spelling-problems", label: t('practice.deck_problems', 'With errors ❌') },
                      { id: "spelling-accents", label: t('practice.deck_accents', 'Accented ⚠️') },
                      { id: "spelling-correct", label: t('practice.deck_correct', 'Spelled correctly ✅') }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setDeckTypeFilter(item.id as any);
                          setCurrentIndex(0);
                          setIsFlipped(false);
                        }}
                        className={`px-2 py-1.5 text-[11px] font-bold rounded-lg transition-all text-left cursor-pointer ${
                          deckTypeFilter === item.id
                            ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/60 dark:border-zinc-700"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timeframe Filter */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">
                    {t('practice.timeframe', 'Timeframe')}
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-stone-100/60 dark:bg-zinc-950/40 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60">
                    {[
                      { id: "all", label: t('practice.tf_all', 'All time 📅') },
                      { id: "today", label: t('practice.tf_today', 'Today ☀️') },
                      { id: "week", label: t('practice.tf_week', 'This week 📅') },
                      { id: "month", label: t('practice.tf_month', 'This month 🗓️') }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setTimeframeFilter(item.id as any);
                          setCurrentIndex(0);
                          setIsFlipped(false);
                        }}
                        className={`px-2 py-1.5 text-[11px] font-bold rounded-lg transition-all text-left cursor-pointer ${
                          timeframeFilter === item.id
                            ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/60 dark:border-zinc-700"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ☰ List toggle button */}
          <button
            type="button"
            onClick={() => setShowList(!showList)}
            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
              showList
                ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60"
            }`}
            title={t('practice.list_view', 'List 📋')}
          >
            <List className="w-3.5 h-3.5" />
          </button>

          {/* ⋮ More actions button & menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsMoreMenuOpen(!isMoreMenuOpen);
                setIsLangMenuOpen(false);
                setIsFiltersOpen(false);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                isMoreMenuOpen
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600"
                  : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60"
              }`}
              title={t('common.more_actions', 'More actions')}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 min-w-[200px] animate-in fade-in zoom-in-95 duration-100 space-y-0.5">
                {/* Anki export */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    handleExportAnki();
                  }}
                  className="w-full px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 text-left cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{t('practice.export_anki_title', 'Export to Anki (.CSV)')}</span>
                </button>

                {/* AI Story Generator */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    handleOpenStoryGen();
                  }}
                  className="w-full px-2.5 py-2 text-xs font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl transition-colors flex items-center gap-2 text-left cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{t('practice.ai_story_gen', 'AI Story Generator')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Controls Bar (Mode & Direction) */}
      <div className="flex items-center justify-between gap-2.5 font-sans">
        {/* Mode Selector: [ Flashcards ▾ ] [ Spelling ] */}
        <div className="flex items-center bg-stone-100/70 dark:bg-zinc-900/70 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 gap-1">
          {hasAnyImages ? (
            /* Dropdown if images exist */
            <div className="relative" ref={modeDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (studyMode === "spelling") {
                    setStudyMode("word");
                    setIsFlipped(false);
                  } else {
                    setIsModeDropdownOpen(!isModeDropdownOpen);
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  studyMode === "word" || studyMode === "image"
                    ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/50 dark:border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <span>{studyMode === "image" ? t('practice.mode_image', 'Image 🖼️') : t('practice.flashcards_tab', 'Flashcards')}</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {isModeDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-40 min-w-[130px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setStudyMode("word");
                      setIsFlipped(false);
                      setIsModeDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors text-left flex items-center gap-1.5 cursor-pointer ${
                      studyMode === "word" ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span>{t('practice.mode_word', 'Word 🔤')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudyMode("image");
                      setIsFlipped(false);
                      setIsModeDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors text-left flex items-center gap-1.5 cursor-pointer ${
                      studyMode === "image" ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span>{t('practice.mode_image', 'Image 🖼️')}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStudyMode("word");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyMode === "word" || studyMode === "image"
                  ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/50 dark:border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {t('practice.flashcards_tab', 'Flashcards')}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setStudyMode("spelling");
              setIsFlipped(false);
            }}
            className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              studyMode === "spelling"
                ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-200/50 dark:border-zinc-700"
                : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t('practice.mode_spelling', 'Spelling ✍️')}
          </button>
        </div>

        {/* Direction Dropdown: [ Word → Translation ▾ ] */}
        <div className="relative" ref={dirDropdownRef}>
          <button
            type="button"
            onClick={() => setIsDirDropdownOpen(!isDirDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-100/70 hover:bg-stone-200/70 dark:bg-zinc-900/70 dark:hover:bg-zinc-800/70 rounded-xl text-[11px] font-bold text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer border border-zinc-200/50 dark:border-zinc-800/60"
          >
            <span>{studyDirection === "forward" ? t('practice.word_to_trans', 'Word → Translation') : t('practice.trans_to_word', 'Translation → Word')}</span>
            <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isDirDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {isDirDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-40 min-w-[170px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  setStudyDirection("forward");
                  setIsFlipped(false);
                  setIsDirDropdownOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors text-left cursor-pointer ${
                  studyDirection === "forward" ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {t('practice.word_to_trans', 'Word → Translation')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudyDirection("reverse");
                  setIsFlipped(false);
                  setIsDirDropdownOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors text-left cursor-pointer ${
                  studyDirection === "reverse" ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {t('practice.trans_to_word', 'Translation → Word')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Empty State OR Study Deck Layout */}
      {learningList.length === 0 ? (
        relearningQueue.length > 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-red-100 dark:border-red-900/40 rounded-3xl p-8 text-center space-y-4 shadow-sm">
            <div className="p-4 bg-red-50 dark:bg-red-950/35 text-red-500 rounded-full w-14 h-14 flex items-center justify-center mx-auto text-2xl">
              🔁
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                {t('practice.relearning_title', 'You have {{count}} card(s) to review again', { count: relearningQueue.length })}
              </h3>
              <p className="text-zinc-500 text-xs leading-relaxed font-semibold">
                {t('practice.relearning_desc', 'These words were marked "Again". Review them now to strengthen memory.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeckTypeFilter("all");
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-all shadow cursor-pointer"
            >
              🔁 {t('practice.review_again_btn', 'Review Again Cards')}
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-10 text-center space-y-4 shadow-sm">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/35 text-amber-500 rounded-full w-14 h-14 flex items-center justify-center mx-auto">
              <Bookmark className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t('practice.deck_empty', 'Your deck ({{lang}}) is empty', { lang: selectedPracticeLang })}</h3>
              <p className="text-zinc-500 text-xs leading-relaxed font-semibold">
                {t('practice.deck_empty_desc', 'Words you mark in lessons for {{lang}} automatically appear here. Start reading!', { lang: selectedPracticeLang })}
              </p>
            </div>
          </div>
        )
      ) : (
        <div className={showList ? "grid grid-cols-1 md:grid-cols-12 gap-6" : "space-y-4"}>
          {/* Left Card Column */}
          <div className={showList ? "md:col-span-7 space-y-4" : "space-y-4"}>
            {/* Main Study wrapper */}
            {studyMode === "spelling" ? (
              <SpellingMode
                item={currentLq}
                isFlipped={isFlipped}
                setIsFlipped={setIsFlipped}
                playSpeech={() => playSpeech(currentLq.word)}
                playingSpeech={playingSpeech}
                onEditWord={() => setIsEditingWord(currentLq.word)}
                spellingInput={spellingInput}
                setSpellingInput={setSpellingInput}
                spellingStatus={spellingStatus}
                hasCheckedSpelling={hasCheckedSpelling}
                spellingInputRef={spellingInputRef}
                onCheckSpelling={checkSpelling}
                onNext={handleNext}
                onExclude={handleExcludeSpelling}
                onDontKnow={handleDontKnow}
              />
            ) : (
              <FlashcardMode
                item={currentLq}
                isFlipped={isFlipped}
                setIsFlipped={setIsFlipped}
                playSpeech={() => playSpeech(currentLq.word)}
                playingSpeech={playingSpeech}
                onEditWord={() => setIsEditingWord(currentLq.word)}
                onAnswer={handleSrsAnswer}
                onMarkKnown={handleMarkKnown}
                studyDirection={studyDirection}
              />
            )}
          </div>

          {/* Right Word List Column */}
          {showList && (
            <div className="md:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-5 flex flex-col max-h-[520px] shadow-sm animate-in fade-in slide-in-from-right-5 duration-200">
              <div className="flex justify-between items-center pb-2.5 border-b border-zinc-100 dark:border-zinc-800 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('practice.words_in_deck', 'Words in deck ({{count}})', { count: learningList.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setShowList(false)}
                  className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                >
                  {t('practice.hide', 'Hide ×')}
                </button>
              </div>
              
              <div className="overflow-y-auto custom-scrollbar space-y-1.5 flex-grow pr-1">
                {learningList.map((item, idx) => {
                  const isActive = idx === currentIndex;
                  const displayLabel = studyDirection === "reverse" ? item.translation : item.word;

                  // Spelling status visual treatment
                  let spellingStatusIcon = null;
                  let itemBgClass = isActive
                    ? "bg-teal-50 dark:bg-teal-950/35 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-900 shadow-3xs"
                    : "bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-950/20 dark:hover:bg-zinc-800/30 text-zinc-700 dark:text-zinc-300 border-zinc-100/50 dark:border-zinc-800/60";

                  if (studyMode === "spelling") {
                    if (item.spellingExclude) {
                      spellingStatusIcon = <span className="text-[10px] text-amber-500 font-bold ml-1.5" title={t('practice.status_excluded', 'Excluded (Known)')}>⭐</span>;
                      if (!isActive) {
                        itemBgClass = "opacity-50 bg-stone-100/30 dark:bg-zinc-900/10 text-zinc-400 dark:text-zinc-500 border-zinc-200/40 line-through decoration-zinc-400/40";
                      }
                    } else if (item.lastSpelledWithAccentError === true) {
                      spellingStatusIcon = <span className="text-amber-500 font-black ml-1.5" title={t('practice.status_accent_error', 'Accent error')}>⚠️</span>;
                      if (!isActive) {
                        itemBgClass = "bg-amber-50/35 hover:bg-amber-100/50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-100/50 dark:border-amber-950/30";
                      }
                    } else if (item.lastSpelledCorrectly === true) {
                      spellingStatusIcon = <span className="text-emerald-500 font-black ml-1.5" title={t('practice.status_correct', 'Spelled correctly')}>✓</span>;
                      if (!isActive) {
                        itemBgClass = "bg-emerald-50/35 hover:bg-emerald-100/50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-100/50 dark:border-emerald-950/30";
                      }
                    } else if (item.lastSpelledCorrectly === false) {
                      spellingStatusIcon = <span className="text-rose-500 font-black ml-1.5" title={t('practice.status_error', 'Spelled with error')}>✗</span>;
                      if (!isActive) {
                        itemBgClass = "bg-rose-50/35 hover:bg-rose-100/50 dark:bg-rose-950/10 dark:hover:bg-rose-950/20 text-rose-800 dark:text-rose-300 border-rose-100/50 dark:border-rose-950/30";
                      }
                    }
                  }

                  return (
                    <button
                      key={item.word + "_" + idx}
                      type="button"
                      onClick={() => {
                        setCurrentIndex(idx);
                        setIsFlipped(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all flex justify-between items-center cursor-pointer ${itemBgClass}`}
                    >
                      <span className="capitalize truncate max-w-[160px] flex items-center">
                        {displayLabel}
                        {spellingStatusIcon}
                      </span>
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Story Generator Modal */}
      <AnimatePresence>
        {showStoryGen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isGenerating && setShowStoryGen(false)}
              className="absolute inset-0 bg-zinc-950/40 backdrop-blur-xs"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative z-10 space-y-5 text-left"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                    AI Story Generator
                  </h3>
                </div>
                {!isGenerating && (
                  <button
                    onClick={() => setShowStoryGen(false)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isGenerating ? (
                /* Generating Loading State */
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-teal-100 dark:border-zinc-800" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-teal-600 dark:border-t-teal-400 animate-spin" />
                    <Sparkles className="w-6 h-6 text-teal-600 dark:border-t-teal-400 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 animate-pulse">
                      {t('practice.ai_composing', 'AI is composing a story for you...')}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed max-w-xs mx-auto">
                      {t('practice.integrating_words', 'Integrating selected words ({{count}}) into a story in {{lang}}. Please wait.', { count: selectedWords.length, lang: selectedPracticeLang })}
                    </p>
                  </div>
                </div>
              ) : (
                /* Config State */
                <>
                  {/* Words Selector */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {t('practice.select_words', 'Select Words ({{count}})', { count: selectedWords.length })}
                      </span>
                      <button
                        onClick={() => {
                          if (selectedWords.length === learningList.length) {
                            setSelectedWords([]);
                          } else {
                            setSelectedWords(learningList.map(lq => lq.word));
                          }
                        }}
                        className="text-[9px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 hover:underline cursor-pointer"
                      >
                        {selectedWords.length === learningList.length ? t('practice.reset_all', 'Reset all') : t('practice.select_all', 'Select all')}
                      </button>
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 space-y-1 bg-zinc-50/50 dark:bg-zinc-950/20 custom-scrollbar">
                      {learningList.map((lq) => {
                        const isChecked = selectedWords.includes(lq.word);
                        return (
                          <label key={lq.word} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-100/40 dark:hover:bg-zinc-800/40 rounded-lg cursor-pointer transition-colors text-xs font-semibold text-zinc-700 dark:text-zinc-200 select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedWords((prev) => prev.filter((w) => w !== lq.word));
                                } else {
                                  setSelectedWords((prev) => [...prev, lq.word]);
                                }
                              }}
                              className="rounded border-zinc-300 dark:border-zinc-700 text-teal-600 focus:ring-teal-500/30 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="capitalize">{lq.word}</span>
                            <span className="text-[10px] text-zinc-400 font-normal truncate">({lq.translation})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Level Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">
                      {t('practice.difficulty', 'Difficulty level')}
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 font-sans">
                      {[
                        { id: "A1", label: "A1 (Beg)" },
                        { id: "A2", label: "A2 (Elem)" },
                        { id: "B1", label: "B1 (Inter)" },
                        { id: "B2", label: "B2 (Upper)" }
                      ].map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setStoryLevel(lvl.id)}
                          className={`py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            storyLevel === lvl.id
                              ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          }`}
                        >
                          {lvl.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Genre Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">
                      {t('practice.genre', 'Story genre')}
                    </span>
                    <div className="relative">
                      <select
                        value={storyGenre}
                        onChange={(e) => setStoryGenre(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80 cursor-pointer appearance-none shadow-4xs"
                      >
                        <option value="general">{t('practice.genre_general', 'General story')}</option>
                        <option value="humor">{t('practice.genre_humor', 'Humor / Comedy')}</option>
                        <option value="scifi">{t('practice.genre_scifi', 'Sci-Fi / Fantasy')}</option>
                        <option value="mystery">{t('practice.genre_mystery', 'Mystery / Detective')}</option>
                        <option value="romance">{t('practice.genre_romance', 'Romance')}</option>
                        <option value="adventure">{t('practice.genre_adventure', 'Adventure')}</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Error Notification */}
                  {genError && (
                    <div className="text-xs text-rose-500 font-bold p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/35 rounded-xl text-center">
                      ⚠️ {genError}
                    </div>
                  )}

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerateStory}
                    disabled={selectedWords.length === 0}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                      selectedWords.length === 0
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed shadow-none"
                        : "bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white active:scale-[0.98]"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('practice.create_ai_story', 'Create AI Story')}
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Word Explainer Edit Modal Overlay */}
      {isEditingWord && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" 
          onClick={() => setIsEditingWord(null)}
        >
          <div 
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl p-6 animate-in zoom-in-95 duration-200 relative custom-scrollbar" 
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsEditingWord(null)}
              className="absolute top-5 right-5 p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer z-10"
              title={t('practice.close', 'Close')}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="pt-2 font-sans">
              {/* Language selection dropdown */}
              <div className="flex justify-between items-center pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-4 pr-8">
                <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('practice.edit_card', 'Edit Card')}</h3>
                <div className="flex items-center gap-1.5 font-sans">
                  <span className="text-[10px] font-black uppercase text-zinc-400">{t('practice.translation_lang', 'Translation language:')}</span>
                  <select
                    value={modalTranslationLang}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      setModalTranslationLang(newLang);
                      safeLocalStorageSetItem("vocab_default_translation_language", newLang);
                    }}
                    className="px-2.5 py-1 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/50 cursor-pointer"
                  >
                    {LANGUAGES_SUPPORTED.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <WordExplainer
                word={isEditingWord}
                sentence={currentLq?.contextRelation || ""}
                targetLanguage={selectedPracticeLang}
                translationLanguage={modalTranslationLang}
                existingVocab={vocab[`${selectedPracticeLang.toLowerCase()}_${isEditingWord.toLowerCase()}`] || null}
                wordLinks={wordLinks}
                vocab={vocab}
                onSaveVocab={handleSaveVocabWrapped}
                onDeleteVocab={handleDeleteVocabWrapped}
                onSaveWordLink={handleSaveWordLinkWrapped}
                onDeleteWordLink={handleDeleteWordLinkWrapped}
                onClose={() => setIsEditingWord(null)}
                settings={settings}
                lessons={lessons}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
