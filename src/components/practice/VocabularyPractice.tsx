/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { VocabItem, WordStatus, Lesson, ReaderSettings } from "../../types";
import { calculateNextReview } from "../../utils/srsAlgorithm";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, Star, ArrowRight, CheckCircle, RefreshCw, Bookmark, Sparkles, X, ChevronDown, BookOpen, Volume2, Edit3, Download, Settings, BrainCircuit } from "lucide-react";
import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getLanguageNameWithDialect, safeLocalStorageSetItem } from "../../utils";
import WordExplainer from "../WordExplainer";
import FlashcardMode from "./FlashcardMode";
import SpellingMode from "./SpellingMode";
import { LANGUAGES_SUPPORTED } from "../../data";



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

  // Reset card index when deck filter changes to avoid index errors
  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [deckTypeFilter]);

  // Extract all learning status words for the selected language, resolving them to parents if they exist
  const learningList = useMemo(() => {
    const parentMap = new Map<string, typeof vocab[string]>();

    Object.entries(vocab)
      .filter(([key, lq]) => {
        if (!lq) return false;

        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0] : "spanish";
        if (itemLang.toLowerCase() !== selectedPracticeLang.toLowerCase()) return false;

        // Apply deck filter
        if (deckTypeFilter === "learning") {
          const isActive = lq.status && ["1", "2", "3", "4", "5", "learning"].includes(lq.status);
          if (!isActive) return false;
          
          if (studyMode !== "spelling") {
            const isDue = !lq.srsNextReview || lq.srsNextReview <= Date.now();
            if (!isDue) return false;
          } else {
            if (lq.lastSpelledCorrectly === true || lq.spellingExclude === true) return false;
          }
        } else if (deckTypeFilter === "spelling-problems") {
          // General spelling errors (complete incorrects, not accent warnings)
          if (lq.lastSpelledCorrectly !== false || lq.lastSpelledWithAccentError === true) return false;
          if (studyMode === "spelling" && lq.spellingExclude === true) return false;
        } else if (deckTypeFilter === "spelling-accents") {
          // Accent errors only
          if (!lq.lastSpelledWithAccentError) return false;
          if (studyMode === "spelling" && lq.spellingExclude === true) return false;
        } else if (deckTypeFilter === "spelling-correct") {
          // Words that were spelled correctly OR marked as "╨в╨╛╤З╨╜╨╛ ╨╖╨╜╨░╤О" both belong here
          if (lq.lastSpelledCorrectly !== true && lq.spellingExclude !== true) return false;
          if (lq.lastSpelledWithAccentError === true) return false;
        } else {
          // "all" - anything that isn't ignored
          if (lq.status === "ignored") return false;
          if (studyMode === "spelling" && (lq.lastSpelledCorrectly === true || lq.spellingExclude === true)) return false;
        }

        // Apply timeframe filter
        if (timeframeFilter !== "all") {
          const createdAtVal = typeof lq.createdAt === "number" && !isNaN(lq.createdAt) ? lq.createdAt : Date.now();
          const now = Date.now();
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
      .forEach(([key, lq]) => {
        // Resolve recursively to the top-level parent key
        let parentKey = key;
        const visited = new Set<string>();
        while (wordLinks[parentKey] && !visited.has(wordLinks[parentKey])) {
          visited.add(parentKey);
          parentKey = wordLinks[parentKey];
        }

        const cleanParentWord = parentKey.replace(/^[a-zA-Z]+_/, "");

        // Find the parent item in vocab or fallback to child metadata with parent word
        const parentLq = vocab[parentKey] || {
          ...lq,
          word: cleanParentWord,
        };

        if (!parentMap.has(parentKey)) {
          parentMap.set(parentKey, parentLq);
        }
      });

    return Array.from(parentMap.values()).map((lq) => ({
      ...lq,
      word: lq.word || "",
      translation: lq.translation || "",
      grammar: lq.grammar || "",
      ipa: lq.ipa || "",
      contextRelation: lq.contextRelation || "",
      status: lq.status || "1",
      createdAt: typeof lq.createdAt === "number" && !isNaN(lq.createdAt) ? lq.createdAt : Date.now(),
      tags: Array.isArray(lq.tags) ? lq.tags.filter(t => typeof t === "string") : [],
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
  // Generation counter: incremented on every card navigation so stale async TTS requests can be discarded
  const ttsGenerationRef = React.useRef<number>(0);
  // Pending spell result to be saved when user navigates (prevents immediate list recomputation)
  const pendingSpellSaveRef = React.useRef<VocabItem | null>(null);
  // Target next word to preserve index alignment when elements are dynamically filtered out of learningList
  const nextWordTargetRef = React.useRef<string | null>(null);

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

    // ╨б╨┐╨╡╤Ж╨╕╤Д╨╕╤З╨╜╤Л╨╣ ╤Д╨╛╤А╨╝╨░╤В ╨┤╨╗╤П Anki: ╨б╨╗╨╛╨▓╨╛ ; ╨Я╨╡╤А╨╡╨▓╨╛╨┤ ; ╨Ъ╨╛╨╜╤В╨╡╨║╤Б╤В
    const header = ["╨б╨╗╨╛╨▓╨╛", "╨Я╨╡╤А╨╡╨▓╨╛╨┤", "╨Ъ╨╛╨╜╤В╨╡╨║╤Б╤В"].join(";");
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

    // 1. Immediately cancel local browser SpeechSynthesis to stop overlapping
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        console.error("speechSynthesis cancel error:", e);
      }
    }

    // 2. Stop any active HTML5 Audio playback (Google TTS / Gemini TTS)
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
      } catch (e) {
        console.error("Audio pause error:", e);
      }
      activeAudioRef.current = null;
    }

    setPlayingSpeech(true);

    const currentTtsEngine = settings?.ttsEngine || "google";
    const targetLanguage = selectedPracticeLang;
    const ttsLang = getEffectiveTtsLocale(targetLanguage, settings);

    const isStale = () => ttsGenerationRef.current !== myGeneration;

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
          const response = await fetch(`/api/google-tts?${params.toString()}`);
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
        });

        if (isStale()) { setPlayingSpeech(false); return; }

        if (!response.ok) {
          const errData = await safeJsonParse(response);
          throw new Error(errData?.error || `╨Ю╤И╨╕╨▒╨║╨░ ╤Б╨╡╤А╨▓╨╡╤А╨░ (${response.status})`);
        }

        const data = await safeJsonParse(response);
        if (isStale()) { setPlayingSpeech(false); return; }

        if (data.audioBase64) {
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
        console.warn("Gemini neural voice failed or rate-limited. Falling back automatically to local browser TTS.", e);
      }
    }

    // --- Default flow: local browser HTML5 SpeechSynthesis API ---
    try {
      if (isStale()) { setPlayingSpeech(false); return; }

      const utterance = new SpeechSynthesisUtterance(wordToPlay);
      utterance.lang = ttsLang;
      utterance.onend = () => { setPlayingSpeech(false); };
      utterance.onerror = () => { setPlayingSpeech(false); };
      
      if (typeof window !== "undefined" && window.speechSynthesis) {
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
      }
      window.speechSynthesis.speak(utterance);
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
      setGenError("╨Я╨╛╨╢╨░╨╗╤Г╨╣╤Б╤В╨░, ╨▓╤Л╨▒╨╡╤А╨╕╤В╨╡ ╤Е╨╛╤В╤П ╨▒╤Л ╨╛╨┤╨╜╨╛ ╤Б╨╗╨╛╨▓╨╛.");
      return;
    }
    if (selectedWords.length > 15) {
      setGenError("╨б╨╗╨╕╤И╨║╨╛╨╝ ╨╝╨╜╨╛╨│╨╛ ╤Б╨╗╨╛╨▓. ╨Я╨╛╨╢╨░╨╗╤Г╨╣╤Б╤В╨░, ╨▓╤Л╨▒╨╡╤А╨╕╤В╨╡ ╨╜╨╡ ╨▒╨╛╨╗╨╡╨╡ 15 ╤Б╨╗╨╛╨▓.");
      return;
    }

    setIsGenerating(true);
    setGenError(null);

    try {
      const response = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words: selectedWords,
          targetLanguage: selectedPracticeLang,
          translationLanguage: "Russian",
          level: storyLevel,
          genre: storyGenre,
          aiProvider: settings?.aiProvider || "gemini",
          localAiUrl: settings?.localAiUrl || "http://localhost:11434/api/generate",
          localAiModel: settings?.localAiModel || "phi3.5",
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "╨Ю╤И╨╕╨▒╨║╨░ ╤Б╨╛╨╡╨┤╨╕╨╜╨╡╨╜╨╕╤П ╤Б ╤Б╨╡╤А╨▓╨╡╤А╨╛╨╝");
      }

      const data = await response.json();
      if (!data.text || !data.title) {
        throw new Error("╨Э╨╡╨▓╨╡╤А╨╜╤Л╨╣ ╤Д╨╛╤А╨╝╨░╤В ╨╛╤В╨▓╨╡╤В╨░ ╨╛╤В ╨Ш╨Ш");
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
      setGenError(err.message || "╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨│╨╡╨╜╨╡╤А╨╕╤А╨╛╨▓╨░╤В╤М ╨╕╤Б╤В╨╛╤А╨╕╤О. ╨Я╨╛╨┐╤А╨╛╨▒╤Г╨╣╤В╨╡ ╨╡╤Й╨╡ ╤А╨░╨╖.");
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

    pendingSpellSaveRef.current = {
      ...currentLq,
      spellingCorrectCount: (currentLq.spellingCorrectCount || 0) + (isCorrect ? 1 : 0),
      spellingIncorrectCount: (currentLq.spellingIncorrectCount || 0) + (!isCorrect && !isAccentWarning ? 1 : 0),
      spellingAccentCount: (currentLq.spellingAccentCount || 0) + (isAccentWarning ? 1 : 0),
      lastSpelledCorrectly: isCorrect,
      lastSpelledWithAccentError: isAccentWarning,
    };
  };

  const handleExcludeSpelling = () => {
    if (!currentLq) return;

    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
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

    setSpellingStatus("incorrect");
    setHasCheckedSpelling(true);

    // Store result; save deferred to handleNext for consistency
    pendingSpellSaveRef.current = {
      ...currentLq,
      spellingIncorrectCount: (currentLq.spellingIncorrectCount || 0) + 1,
      lastSpelledCorrectly: false,
      lastSpelledWithAccentError: false,
    };
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

  // Global key listener for next card when flipped
  useEffect(() => {
    if (studyMode !== "spelling") return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" && document.activeElement !== spellingInputRef.current) {
        return;
      }
      if (document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (isFlipped && e.key === "Enter") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [studyMode, isFlipped, currentIndex]);

  const hasAnyImages = useMemo(() => {
    return learningList.some((lq) => !!lq.imageUrl);
  }, [learningList]);

  // Safeguard against temporary out-of-bound index renders during state updates
  if (learningList.length > 0 && !currentLq) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 font-sans">
        ╨Ч╨░╨│╤А╤Г╨╖╨║╨░ ╨║╨░╤А╤В╨╛╤З╨║╨╕... / Loading flashcard...
      </div>
    );
  }

  const isCardWithImage = studyMode === "image" && currentLq && !!currentLq.imageUrl;

  const handleNext = () => {
    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
    nextWordTargetRef.current = targetWord;

    resetSpellingState();
    setIsFlipped(false);

    setTimeout(() => {
      if (pendingSpellSaveRef.current) {
        handleSaveVocabWrapped(pendingSpellSaveRef.current);
        pendingSpellSaveRef.current = null;
      } else {
        const newIdx = learningList.findIndex(item => item.word === targetWord);
        if (newIdx !== -1) {
          setCurrentIndex(newIdx);
        }
        nextWordTargetRef.current = null;
      }
    }, 150);
  };

  const handleMarkKnown = () => {
    if (!currentLq) return;

    // 1. Determine target next word before list changes
    const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
    nextWordTargetRef.current = targetWord;

    onUpdateStatus(currentLq.word, "known", selectedPracticeLang);
    setIsFlipped(false);
  };

  const handleSrsAnswer = (quality: number) => {
    if (!currentLq || !onSaveVocab) return;
    
    const nextSrs = calculateNextReview(
      quality,
      currentLq.srsEaseFactor || 2.5,
      currentLq.srsInterval || 0,
      currentLq.srsRepetitions || 0
    );

    const updatedItem = {
      ...currentLq,
      srsNextReview: nextSrs.nextReviewDate,
      srsInterval: nextSrs.interval,
      srsEaseFactor: nextSrs.easeFactor,
      srsRepetitions: nextSrs.repetitions,
    };

    if (quality >= 3) {
      const targetWord = learningList[(currentIndex + 1) % learningList.length]?.word || null;
      nextWordTargetRef.current = targetWord;
    }

    onSaveVocab(updatedItem, selectedPracticeLang);
    setIsFlipped(false);
    
    if (quality < 3) {
      setCurrentIndex((prev) => (prev + 1) % learningList.length);
    }
  };

  const resetDeck = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  if (learningList.length === 0) {
    return (
      <div className="space-y-6 max-w-md mx-auto font-sans">
        {/* Language selector even when empty, so they can switch between decks! */}
        {activeDeckLanguages.length > 1 && (
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 flex-wrap justify-center gap-1 shadow-sm">
            {activeDeckLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setSelectedPracticeLang(lang);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedPracticeLang.toLowerCase() === lang.toLowerCase()
                    ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}

        {/* Deck Type Filter (Empty state) */}
        <div className="flex bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 justify-center gap-1 shadow-2xs font-sans max-w-md mx-auto flex-wrap justify-center">
          {[
            { id: "learning", label: "╨Ш╨╖╤Г╤З╨░╨╡╨╝╤Л╨╡ ЁЯОп" },
            { id: "all", label: "╨Т╤Б╨╡ ╤Б╨╗╨╛╨▓╨░ ЁЯУЦ" },
            { id: "spelling-problems", label: "╨б ╨╛╤И╨╕╨▒╨║╨░╨╝╨╕ тЭМ" },
            { id: "spelling-accents", label: "╨б ╤Г╨┤╨░╤А╨╡╨╜╨╕╨╡╨╝ тЪая╕П" },
            { id: "spelling-correct", label: "╨Я╨╕╤И╤Г ╨┐╤А╨░╨▓╨╕╨╗╤М╨╜╨╛ тЬЕ" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDeckTypeFilter(item.id as any)}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                deckTypeFilter === item.id
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm border border-zinc-100 dark:border-zinc-800"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Timeframe Filter Selector (Empty state) */}
        <div className="flex bg-zinc-50 dark:bg-zinc-950/40 p-1 rounded-xl border border-zinc-200/40 dark:border-zinc-800/60 justify-center gap-1 shadow-2xs font-sans max-w-sm mx-auto">
          {[
            { id: "all", label: "╨Т╤Б╨╡ ╨▓╤А╨╡╨╝╤П ЁЯУЕ" },
            { id: "today", label: "╨б╨╡╨│╨╛╨┤╨╜╤П тШАя╕П" },
            { id: "week", label: "╨Э╨╡╨┤╨╡╨╗╤П ЁЯУЕ" },
            { id: "month", label: "╨Ь╨╡╤Б╤П╤Ж ЁЯЧУя╕П" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTimeframeFilter(item.id as any);
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                timeframeFilter === item.id
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm border border-zinc-100 dark:border-zinc-800"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-10 text-center space-y-4 shadow-sm">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/35 text-amber-500 rounded-full w-14 h-14 flex items-center justify-center mx-auto">
            <Bookmark className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">╨Т╨░╤И╨░ ╨║╨╛╨╗╨╛╨┤╨░ ({selectedPracticeLang}) ╨┐╤Г╤Б╤В╨░</h3>
            <p className="text-zinc-500 text-xs leading-relaxed font-semibold">
              ╨б╨╗╨╛╨▓╨░, ╨║╨╛╤В╨╛╤А╤Л╨╡ ╨▓╤Л ╨╛╤В╨╝╨╡╤З╨░╨╡╤В╨╡ ╨╢╨╡╨╗╤В╤Л╨╝/╨╖╨╡╨╗╨╡╨╜╤Л╨╝/╨║╤А╨░╤Б╨╜╤Л╨╝ ╤Ж╨▓╨╡╤В╨╛╨╝ ╨┐╤А╨╕ ╤З╤В╨╡╨╜╨╕╨╕ ╤Г╤А╨╛╨║╨╛╨▓ {selectedPracticeLang}, ╨░╨▓╤В╨╛╨╝╨░╤В╨╕╤З╨╡╤Б╨║╨╕ ╨┐╨╛╨┐╨░╨┤╨░╤О╤В ╤Б╤О╨┤╨░. ╨Э╨░╤З╨╜╨╕╤В╨╡ ╤З╤В╨╡╨╜╨╕╨╡!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 font-sans mx-auto transition-all duration-300 ${
      showList ? "max-w-3xl lg:max-w-4xl" : "max-w-md"
    }`}>
      {/* Filters Toggle Button */}
      <div className="flex justify-end px-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-all cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          ╨Э╨░╤Б╤В╤А╨╛╨╣╨║╨╕ ╤Д╨╕╨╗╤М╤В╤А╨╛╨▓ {showFilters ? "тЦ┤" : "тЦ╛"}
        </button>
      </div>

      {showFilters && (
        <div className="space-y-4 mb-6 p-4 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm mx-auto max-w-md">
          {/* Language selector for active decks */}
          {activeDeckLanguages.length > 1 && (
            <div id="deck-lang-tabs" className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 flex-wrap justify-center gap-1 shadow-sm">
              {activeDeckLanguages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setSelectedPracticeLang(lang);
                    setCurrentIndex(0);
                    setIsFlipped(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    selectedPracticeLang.toLowerCase() === lang.toLowerCase()
                      ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}

          {/* Deck Type Filter Selector */}
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 justify-center gap-1 shadow-2xs font-sans flex-wrap">
            {[
              { id: "learning", label: "╨Ш╨╖╤Г╤З╨░╨╡╨╝╤Л╨╡ ЁЯОп" },
              { id: "all", label: "╨Т╤Б╨╡ ╤Б╨╗╨╛╨▓╨░ ЁЯУЦ" },
              { id: "spelling-problems", label: "╨б ╨╛╤И╨╕╨▒╨║╨░╨╝╨╕ тЭМ" },
              { id: "spelling-accents", label: "╨б ╤Г╨┤╨░╤А╨╡╨╜╨╕╨╡╨╝ тЪая╕П" },
              { id: "spelling-correct", label: "╨Я╨╕╤И╤Г ╨┐╤А╨░╨▓╨╕╨╗╤М╨╜╨╛ тЬЕ" }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDeckTypeFilter(item.id as any)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  deckTypeFilter === item.id
                    ? "bg-zinc-100 dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-sm border border-zinc-200/50 dark:border-zinc-700"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Timeframe Filter Selector */}
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200/40 dark:border-zinc-800/60 justify-center gap-1 shadow-2xs font-sans">
            {[
              { id: "all", label: "╨Т╤Б╨╡ ╨▓╤А╨╡╨╝╤П ЁЯУЕ" },
              { id: "today", label: "╨б╨╡╨│╨╛╨┤╨╜╤П тШАя╕П" },
              { id: "week", label: "╨Э╨╡╨┤╨╡╨╗╤П ЁЯУЕ" },
              { id: "month", label: "╨Ь╨╡╤Б╤П╤Ж ЁЯЧУя╕П" }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTimeframeFilter(item.id as any);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  timeframeFilter === item.id
                    ? "bg-zinc-100 dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-sm border border-zinc-200/50 dark:border-zinc-700"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={showList ? "grid grid-cols-1 md:grid-cols-12 gap-6" : "space-y-6"}>
        {/* Left Card Column */}
        <div className={showList ? "md:col-span-7 space-y-6" : "space-y-6"}>
          {/* Deck progress meter */}
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 px-1">
            <span className="uppercase tracking-wider">╨Ъ╨╛╨╗╨╛╨┤╨░ ╤Б╨╗╨╛╨▓</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportAnki}
                className="px-2 py-1 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 text-[10px] uppercase font-bold tracking-wider hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                title="╨н╨║╤Б╨┐╨╛╤А╤В╨╕╤А╨╛╨▓╨░╤В╤М ╨▓╤Л╨▒╤А╨░╨╜╨╜╤Л╨╡ ╤Б╨╗╨╛╨▓╨░ ╨┤╨╗╤П ╨╕╨╝╨┐╨╛╤А╤В╨░ ╨▓ Anki"
              >
                <Download className="w-3 h-3" />
                <span>Anki (.csv)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowList(!showList)}
                className={`px-2 py-1 rounded-lg border text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                  showList
                    ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-900"
                    : "bg-white hover:bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                ╨б╨┐╨╕╤Б╨╛╨║ ЁЯУЛ
              </button>
              <span>
                ╨Ъ╨░╤А╤В╨╛╤З╨║╨░ {currentIndex + 1} ╨╕╨╖ {learningList.length}
              </span>
            </div>
          </div>

      {/* Controls Bar (Mode & Direction) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
        {/* Practice Mode Selector */}
        <div className="flex bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 justify-between items-center px-2.5 py-1.5">
          <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">╨а╨╡╨╢╨╕╨╝:</span>
          <div className="flex gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setStudyMode("word");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyMode === "word"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              ╨б╨╗╨╛╨▓╨╛ ЁЯФд
            </button>
            {hasAnyImages && (
              <button
                type="button"
                onClick={() => {
                  setStudyMode("image");
                  setIsFlipped(false);
                }}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  studyMode === "image"
                    ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-800"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                ╨Ъ╨░╤А╤В╨╕╨╜╨║╨░ ЁЯЦ╝я╕П
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStudyMode("spelling");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyMode === "spelling"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              ╨Я╤А╨░╨▓╨╛╨┐╨╕╤Б╨░╨╜╨╕╨╡ тЬНя╕П
            </button>
          </div>
        </div>

        {/* Direction Selector */}
        <div className="flex bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 justify-between items-center px-2.5 py-1.5">
          <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">╨б╨╜╨░╤З╨░╨╗╨░:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setStudyDirection("forward");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyDirection === "forward"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
              title="╨Ш╨╖╤Г╤З╨░╨╡╨╝╨╛╨╡ ╤Б╨╗╨╛╨▓╨╛ -> ╨Я╨╡╤А╨╡╨▓╨╛╨┤"
            >
              ╨б╨╗╨╛╨▓╨╛ ЁЯФд
            </button>
            <button
              type="button"
              onClick={() => {
                setStudyDirection("reverse");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyDirection === "reverse"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
              title="╨Я╨╡╤А╨╡╨▓╨╛╨┤ -> ╨Ш╨╖╤Г╤З╨░╨╡╨╝╨╛╨╡ ╤Б╨╗╨╛╨▓╨╛"
            >
              ╨Я╨╡╤А╨╡╨▓╨╛╨┤ ЁЯФД
            </button>
          </div>
        </div>
      </div>

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
          studyDirection={studyDirection}
        />
      )}

      <div className="text-center space-y-4 pt-2">
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="text-xs text-teal-600 hover:text-teal-700 font-bold uppercase tracking-wider flex items-center gap-1 mx-auto cursor-pointer select-none"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          ╨Я╨╡╤А╨╡╨▓╨╡╤А╨╜╤Г╤В╤М ╨║╨░╤А╤В╨╛╤З╨║╤Г
        </button>

        <button
          onClick={handleOpenStoryGen}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-teal-500/20 hover:border-teal-500/50 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-bold text-sm rounded-2xl transition-all active:scale-[0.98] cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          AI-╨У╨╡╨╜╨╡╤А╨░╤В╨╛╤А ╨Ш╤Б╤В╨╛╤А╨╕╨╣ (Story Gen)
        </button>
      </div>
    </div>

    {/* Right Word List Column */}
    {showList && (
      <div className="md:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-5 flex flex-col max-h-[520px] shadow-sm animate-in fade-in slide-in-from-right-5 duration-200">
        <div className="flex justify-between items-center pb-2.5 border-b border-zinc-100 dark:border-zinc-800 mb-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            ╨б╨╗╨╛╨▓╨░ ╨▓ ╨║╨╛╨╗╨╛╨┤╨╡ ({learningList.length})
          </span>
          <button
            type="button"
            onClick={() => setShowList(false)}
            className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
          >
            ╨б╨║╤А╤Л╤В╤М ├Ч
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
                spellingStatusIcon = <span className="text-[10px] text-amber-500 font-bold ml-1.5" title="╨Ш╤Б╨║╨╗╤О╤З╨╡╨╜╨╛ (╨в╨╛╤З╨╜╨╛ ╨╖╨╜╨░╤О)">тнР</span>;
                if (!isActive) {
                  itemBgClass = "opacity-50 bg-stone-100/30 dark:bg-zinc-900/10 text-zinc-400 dark:text-zinc-500 border-zinc-200/40 line-through decoration-zinc-400/40";
                }
              } else if (item.lastSpelledWithAccentError === true) {
                spellingStatusIcon = <span className="text-amber-500 font-black ml-1.5" title="╨Ю╤И╨╕╨▒╨║╨░ ╨▓ ╤Г╨┤╨░╤А╨╡╨╜╨╕╨╕">тЪая╕П</span>;
                if (!isActive) {
                  itemBgClass = "bg-amber-50/35 hover:bg-amber-100/50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-100/50 dark:border-amber-950/30";
                }
              } else if (item.lastSpelledCorrectly === true) {
                spellingStatusIcon = <span className="text-emerald-500 font-black ml-1.5" title="╨Э╨░╨┐╨╕╤Б╨░╨╜╨╛ ╨▓╨╡╤А╨╜╨╛">тЬУ</span>;
                if (!isActive) {
                  itemBgClass = "bg-emerald-50/35 hover:bg-emerald-100/50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-100/50 dark:border-emerald-950/30";
                }
              } else if (item.lastSpelledCorrectly === false) {
                spellingStatusIcon = <span className="text-rose-500 font-black ml-1.5" title="╨Э╨░╨┐╨╕╤Б╨░╨╜╨╛ ╤Б ╨╛╤И╨╕╨▒╨║╨╛╨╣">тЬЧ</span>;
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
                    <Sparkles className="w-6 h-6 text-teal-600 dark:text-teal-400 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 animate-pulse">
                      ╨Ш╨Ш ╤Б╨╛╤З╨╕╨╜╤П╨╡╤В ╨╕╤Б╤В╨╛╤А╨╕╤О ╨┤╨╗╤П ╨▓╨░╤Б...
                    </p>
                    <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed max-w-xs mx-auto">
                      ╨Ш╨╜╤В╨╡╨│╤А╨╕╤А╤Г╨╡╨╝ ╨▓╤Л╨▒╤А╨░╨╜╨╜╤Л╨╡ ╤Б╨╗╨╛╨▓╨░ ({selectedWords.length}) ╨▓ ╤Б╤О╨╢╨╡╤В ╨╜╨░ ╤П╨╖╤Л╨║╨╡ {selectedPracticeLang}. ╨Я╨╛╨╢╨░╨╗╤Г╨╣╤Б╤В╨░, ╨┐╨╛╨┤╨╛╨╢╨┤╨╕╤В╨╡.
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
                        ╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡ ╤Б╨╗╨╛╨▓╨░ / Select Words ({selectedWords.length})
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
                        {selectedWords.length === learningList.length ? "╨б╨▒╤А╨╛╤Б╨╕╤В╤М ╨▓╤Б╨╡" : "╨Т╤Л╨▒╤А╨░╤В╤М ╨▓╤Б╨╡"}
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
                      ╨г╤А╨╛╨▓╨╡╨╜╤М ╤Б╨╗╨╛╨╢╨╜╨╛╤Б╤В╨╕ / Difficulty
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
                      ╨Ц╨░╨╜╤А ╨╕╤Б╤В╨╛╤А╨╕╨╕ / Genre
                    </span>
                    <div className="relative">
                      <select
                        value={storyGenre}
                        onChange={(e) => setStoryGenre(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80 cursor-pointer appearance-none shadow-4xs"
                      >
                        <option value="general">╨Ю╨▒╤Л╤З╨╜╤Л╨╣ ╤А╨░╤Б╤Б╨║╨░╨╖ (General)</option>
                        <option value="humor">╨о╨╝╨╛╤А / ╨Ъ╨╛╨╝╨╡╨┤╨╕╤П (Humor)</option>
                        <option value="scifi">╨Э╨░╤Г╤З╨╜╨░╤П ╤Д╨░╨╜╤В╨░╤Б╤В╨╕╨║╨░ / ╨д╤Н╨╜╤В╨╡╨╖╨╕ (Sci-Fi)</option>
                        <option value="mystery">╨Ф╨╡╤В╨╡╨║╤В╨╕╨▓ / ╨в╨░╨╣╨╜╨░ (Mystery)</option>
                        <option value="romance">╨а╨╛╨╝╨░╨╜╤В╨╕╨║╨░ (Romance)</option>
                        <option value="adventure">╨Я╤А╨╕╨║╨╗╤О╤З╨╡╨╜╨╕╨╡ (Adventure)</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Error Notification */}
                  {genError && (
                    <div className="text-xs text-rose-500 font-bold p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/35 rounded-xl text-center">
                      тЪая╕П {genError}
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
                    ╨б╨╛╨╖╨┤╨░╤В╤М AI ╨╕╤Б╤В╨╛╤А╨╕╤О
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
              title="╨Ч╨░╨║╤А╤Л╤В╤М"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="pt-2 font-sans">
              {/* Language selection dropdown */}
              <div className="flex justify-between items-center pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-4 pr-8">
                <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">╨а╨╡╨┤╨░╨║╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡ ╨║╨░╤А╤В╨╛╤З╨║╨╕</h3>
                <div className="flex items-center gap-1.5 font-sans">
                  <span className="text-[10px] font-black uppercase text-zinc-400">╨п╨╖╤Л╨║ ╨┐╨╡╤А╨╡╨▓╨╛╨┤╨░:</span>
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
