/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { VocabItem, WordStatus, Lesson, ReaderSettings } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, Star, ArrowRight, CheckCircle, RefreshCw, Bookmark, Sparkles, X, ChevronDown, BookOpen, Volume2 } from "lucide-react";
import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getLanguageNameWithDialect } from "../utils";



interface VocabularyPracticeProps {
  vocab: Record<string, VocabItem>;
  wordLinks?: Record<string, string>;
  onUpdateStatus: (word: string, status: WordStatus, lang?: string) => void;
  defaultLanguage?: string;
  onAddLesson?: (newL: Lesson) => void;
  onSelectTab?: (tab: "library" | "read" | "practice" | "statistics") => void;
  settings?: ReaderSettings;
}

export default function VocabularyPractice({
  vocab,
  wordLinks = {},
  onUpdateStatus,
  defaultLanguage,
  onAddLesson,
  onSelectTab,
  settings
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

  // Extract all learning status words for the selected language, resolving them to parents if they exist
  const learningList = useMemo(() => {
    const parentMap = new Map<string, typeof vocab[string]>();

    Object.entries(vocab)
      .filter(([key, lq]) => {
        if (!lq) return false;
        const isActive = lq.status && ["1", "2", "3", "4", "5", "learning"].includes(lq.status);
        if (!isActive) return false;

        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0] : "spanish";
        return itemLang.toLowerCase() === selectedPracticeLang.toLowerCase();
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
    }));
  }, [vocab, selectedPracticeLang, wordLinks]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyMode, setStudyMode] = useState<"word" | "image">("word");
  const [studyDirection, setStudyDirection] = useState<"forward" | "reverse">("forward");

  const [playingSpeech, setPlayingSpeech] = useState(false);

  const playSpeech = async (wordToPlay: string) => {
    if (!wordToPlay || playingSpeech) return;
    setPlayingSpeech(true);

    const currentTtsEngine = settings?.ttsEngine || "google";
    const targetLanguage = selectedPracticeLang;
    const ttsLang = getEffectiveTtsLocale(targetLanguage, settings);

    // --- Google Translate TTS (with local caching) ---
    if (currentTtsEngine === "google") {
      try {
        const cacheKey = `google-tts:${ttsLang}:${wordToPlay.toLowerCase().trim()}`;
        let audioUrl: string | null = null;
        let blob = await getTtsAudioFromCache(cacheKey);

        if (blob) {
          audioUrl = URL.createObjectURL(blob);
        } else {
          const params = new URLSearchParams({ text: wordToPlay, lang: ttsLang });
          const response = await fetch(`/api/google-tts?${params.toString()}`);
          if (!response.ok) throw new Error(`Google TTS ${response.status}`);
          blob = await response.blob();
          await saveTtsAudioToCache(cacheKey, blob);
          audioUrl = URL.createObjectURL(blob);
        }

        if (audioUrl) {
          const audio = new Audio(audioUrl);
          audio.onended = () => { URL.revokeObjectURL(audioUrl!); setPlayingSpeech(false); };
          audio.onerror = () => { URL.revokeObjectURL(audioUrl!); setPlayingSpeech(false); };
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

        if (!response.ok) {
          const errData = await safeJsonParse(response);
          throw new Error(errData?.error || `Ошибка сервера (${response.status})`);
        }

        const data = await safeJsonParse(response);
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
          audio.onended = () => setPlayingSpeech(false);
          await audio.play();
          return; // successfully played AI audio
        } else {
          throw new Error("No audio base64 payload");
        }
      } catch (e: any) {
        console.warn("Gemini neural voice failed or rate-limited. Falling back automatically to local browser TTS.", e);
      }
    }

    // --- Default flow: local browser HTML5 SpeechSynthesis API ---
    try {
      const utterance = new SpeechSynthesisUtterance(wordToPlay);
      utterance.lang = ttsLang;
      
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        
        // 1. Try exact match first (e.g. "es-US" or "en-GB")
        let matchingVoice = voices.find(v => {
          const vLang = v.lang.toLowerCase().replace("_", "-");
          return vLang === ttsLang.toLowerCase();
        });
        
        // 2. Fall back to main language prefix matching (e.g. "es", "en")
        if (!matchingVoice) {
          const mainLang = ttsLang.toLowerCase().split("-")[0];
          matchingVoice = voices.find(v => {
            const vLang = v.lang.toLowerCase().replace("_", "-");
            return vLang.startsWith(mainLang);
          });
        }
        
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
      }
      window.speechSynthesis.speak(utterance);
    } catch (browserErr) {
      console.error("Audio playback error:", browserErr);
    } finally {
      setPlayingSpeech(false);
    }
  };

  // Auto-play when current card changes or when card is flipped to reveal target word
  useEffect(() => {
    if (!currentLq || !currentLq.word) return;

    const shouldPlay = (studyDirection === "forward" && !isFlipped) || (studyDirection === "reverse" && isFlipped);
    if (shouldPlay) {
      const timer = setTimeout(() => {
        playSpeech(currentLq.word);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, selectedPracticeLang, isFlipped, studyDirection]);

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
      setGenError("Пожалуйста, выберите хотя бы одно слово.");
      return;
    }
    if (selectedWords.length > 15) {
      setGenError("Слишком много слов. Пожалуйста, выберите не более 15 слов.");
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
        throw new Error(errData.error || "Ошибка соединения с сервером");
      }

      const data = await response.json();
      if (!data.text || !data.title) {
        throw new Error("Неверный формат ответа от ИИ");
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
      setGenError(err.message || "Не удалось сгенерировать историю. Попробуйте еще раз.");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentLq = learningList[currentIndex];

  // Safeguard against temporary out-of-bound index renders during state updates
  if (learningList.length > 0 && !currentLq) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 font-sans">
        Загрузка карточки... / Loading flashcard...
      </div>
    );
  }

  const hasAnyImages = useMemo(() => {
    return learningList.some((lq) => !!lq.imageUrl);
  }, [learningList]);

  const isCardWithImage = studyMode === "image" && currentLq && !!currentLq.imageUrl;

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % learningList.length);
    }, 150);
  };

  const handleMarkKnown = () => {
    if (!currentLq) return;
    onUpdateStatus(currentLq.word, "known", selectedPracticeLang);
    
    // If we are on the last card, decrease index or reset
    if (learningList.length <= 1) {
      setCurrentIndex(0);
    } else if (currentIndex >= learningList.length - 1) {
      setCurrentIndex(0);
    }
    setIsFlipped(false);
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
          <div className="flex bg-zinc-150 dark:bg-zinc-850 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 flex-wrap justify-center gap-1 shadow-sm">
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
                    ? "bg-white dark:bg-zinc-900 text-teal-650 dark:text-teal-400 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-10 text-center space-y-4 shadow-sm">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/35 text-amber-500 rounded-full w-14 h-14 flex items-center justify-center mx-auto">
            <Bookmark className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-150">Ваша колода ({selectedPracticeLang}) пуста</h3>
            <p className="text-zinc-500 text-xs leading-relaxed font-semibold">
              Слова, которые вы отмечаете желтым/зеленым/красным цветом при чтении уроков {selectedPracticeLang}, автоматически попадают сюда. Начните чтение!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md mx-auto font-sans">
      {/* Language selector for active decks */}
      {activeDeckLanguages.length > 1 && (
        <div id="deck-lang-tabs" className="flex bg-zinc-100 dark:bg-zinc-850 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 flex-wrap justify-center gap-1 shadow-sm">
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
                  ? "bg-white dark:bg-zinc-900 text-teal-650 dark:text-teal-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      )}
      {/* Deck progress meter */}
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 px-1">
        <span className="uppercase tracking-wider">Vocabulary Deck</span>
        <span>
          Card {currentIndex + 1} of {learningList.length}
        </span>
      </div>

      {/* Controls Bar (Mode & Direction) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
        {/* Practice Mode Selector */}
        {hasAnyImages ? (
          <div className="flex bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 justify-between items-center px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Режим:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setStudyMode("word");
                  setIsFlipped(false);
                }}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  studyMode === "word"
                    ? "bg-white dark:bg-zinc-900 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-800"
                    : "text-zinc-450 hover:text-zinc-700 dark:hover:text-zinc-350"
                }`}
              >
                Слово 🔤
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudyMode("image");
                  setIsFlipped(false);
                }}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  studyMode === "image"
                    ? "bg-white dark:bg-zinc-900 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-800"
                    : "text-zinc-450 hover:text-zinc-750 dark:hover:text-zinc-350"
                }`}
              >
                Картинка 🖼️
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}

        {/* Direction Selector */}
        <div className="flex bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 justify-between items-center px-2.5 py-1.5">
          <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Сначала:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setStudyDirection("forward");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyDirection === "forward"
                  ? "bg-white dark:bg-zinc-900 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-800"
                  : "text-zinc-450 hover:text-zinc-750 dark:hover:text-zinc-350"
              }`}
              title="Изучаемое слово -> Перевод"
            >
              Слово 🔤
            </button>
            <button
              type="button"
              onClick={() => {
                setStudyDirection("reverse");
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                studyDirection === "reverse"
                  ? "bg-white dark:bg-zinc-900 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-800"
                  : "text-zinc-450 hover:text-zinc-750 dark:hover:text-zinc-350"
              }`}
              title="Перевод -> Изучаемое слово"
            >
              Перевод 🔄
            </button>
          </div>
        </div>
      </div>

      {/* Main Flashcard wrapper */}
      <div className="relative min-h-[365px] cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            /* Front side of the card */
            <motion.div
              key="front"
              initial={{ opacity: 0, rotateY: -90, scale: 0.95 }}
              animate={{ opacity: 1, rotateY: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: 90, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="bg-gradient-to-br from-teal-50 to-white dark:from-zinc-900 dark:to-zinc-850 border border-teal-100/65 dark:border-zinc-800 rounded-3xl p-8 flex flex-col justify-between shadow-md h-full min-h-[365px]"
            >
              {isCardWithImage ? (
                <>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold tracking-widest text-teal-605 dark:text-teal-400 uppercase">
                      Что это за слово? / Visual Prompt
                    </span>
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  </div>

                  <div className="flex flex-col items-center justify-center flex-grow py-4">
                    <div className="relative w-44 h-44 rounded-2xl overflow-hidden border border-zinc-200/60 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-950 select-none pointer-events-none">
                      <img
                        src={currentLq.imageUrl!.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(currentLq.imageUrl!)}` : currentLq.imageUrl!}
                        alt="Visual prompt"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="mt-3.5 text-center">
                      <span className="text-[10.5px] font-bold px-2.5 py-1 bg-teal-50/65 dark:bg-teal-955/20 text-teal-605 dark:text-teal-400 rounded-full border border-teal-100/30 dark:border-teal-900/10">
                        Угадайте слово на {selectedPracticeLang}
                      </span>
                    </div>
                  </div>

                  <div className="text-center text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                    Нажмите на карточку, чтобы перевернуть и увидеть слово
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold tracking-widest text-teal-605 dark:text-teal-405 uppercase">
                      {studyDirection === "forward" ? "Target Word" : "Translation / Перевод"}
                    </span>
                    <div className="flex items-center gap-2">
                      {studyDirection === "forward" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // prevent flipping the card when clicking play!
                            playSpeech(currentLq.word);
                          }}
                          disabled={playingSpeech}
                          className={`p-1.5 rounded-lg bg-teal-600/10 hover:bg-teal-600/20 text-teal-650 dark:text-teal-400 transition-all cursor-pointer ${
                            playingSpeech ? "animate-pulse" : ""
                          }`}
                          title="Прослушать слово (TTS)"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      )}
                      <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    </div>
                  </div>

                  <div className="text-center py-12 flex-grow flex flex-col justify-center">
                    <h2 className="text-4xl font-black tracking-tight text-teal-950 dark:text-zinc-50 capitalize">
                      {studyDirection === "forward" ? currentLq.word : currentLq.translation}
                    </h2>
                    {studyDirection === "forward" && currentLq.ipa && (
                      <p className="font-mono text-sm text-teal-650 dark:text-teal-405 mt-2 font-semibold">
                        {currentLq.ipa}
                      </p>
                    )}
                  </div>

                  <div className="text-center text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                    {studyDirection === "forward" ? "Tap or click card to reveal translation" : "Нажмите для перевода / Reveal original word"}
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            /* Back side of the card */
            <motion.div
              key="back"
              initial={{ opacity: 0, rotateY: 90, scale: 0.95 }}
              animate={{ opacity: 1, rotateY: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: -90, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-3xl p-8 flex flex-col justify-between shadow-lg h-full min-h-[365px] cursor-default"
              onClick={(e) => e.stopPropagation()} // don't flip back when clicking other buttons
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start pb-2.5 border-b border-zinc-100 dark:border-zinc-850">
                  <div className="flex items-center gap-3">
                    {currentLq.imageUrl && (
                      <img
                        src={currentLq.imageUrl.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(currentLq.imageUrl)}` : currentLq.imageUrl}
                        alt={currentLq.word}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 object-cover rounded-lg border border-zinc-200 dark:border-zinc-800 shrink-0 select-none pointer-events-none"
                      />
                    )}
                    <div className="flex items-center gap-2.5">
                      <div>
                        <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-50 capitalize leading-tight">
                          {currentLq.word}
                        </h3>
                        {currentLq.ipa && <p className="text-xs font-mono text-zinc-500 leading-none mt-0.5">{currentLq.ipa}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playSpeech(currentLq.word);
                        }}
                        disabled={playingSpeech}
                        className={`p-1.5 rounded-lg bg-teal-600/10 hover:bg-teal-600/20 text-teal-650 dark:text-teal-400 transition-all cursor-pointer ${
                          playingSpeech ? "animate-pulse" : ""
                        }`}
                        title="Прослушать слово (TTS)"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {currentLq.grammar && (
                    <span className="text-[10px] font-bold uppercase py-0.5 px-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 rounded">
                      {currentLq.grammar}
                    </span>
                  )}
                </div>

                {/* Meaning & translations */}
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                    Translation
                  </span>
                  <p className="text-base font-bold text-teal-650 dark:text-teal-400">
                    {currentLq.translation}
                  </p>
                </div>

                {/* Example sentence if exists */}
                {currentLq.examples && currentLq.examples.length > 0 && (
                  <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-100/75 dark:border-zinc-850">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                      Context Example
                    </span>
                    <p className="text-xs text-zinc-850 dark:text-zinc-200 font-medium leading-relaxed">
                      {currentLq.examples[0].text}
                    </p>
                    <p className="text-[10px] text-zinc-500 italic mt-0.5">
                      {currentLq.examples[0].translation}
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons on flip side */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-850">
                <button
                  type="button"
                  id="btn-flashcard-keep-learning"
                  onClick={handleNext}
                  className="px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-400 transition-all flex items-center justify-center gap-1"
                >
                  Still learning
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  id="btn-flashcard-mastered"
                  onClick={handleMarkKnown}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm shadow-emerald-100 dark:shadow-none"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Mastered (Known)
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="text-center space-y-4 pt-2">
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="text-xs text-teal-605 hover:text-teal-700 font-bold uppercase tracking-wider flex items-center gap-1 mx-auto cursor-pointer select-none"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Click to flip card
        </button>

        <button
          onClick={handleOpenStoryGen}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white font-bold text-sm rounded-2xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          AI-Генератор Историй (Story Gen)
        </button>
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
              className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative z-10 space-y-5 text-left"
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
                    className="p-1 text-zinc-400 hover:text-zinc-655 dark:hover:text-zinc-255 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isGenerating ? (
                /* Generating Loading State */
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-teal-100 dark:border-zinc-850" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-teal-600 dark:border-t-teal-450 animate-spin" />
                    <Sparkles className="w-6 h-6 text-teal-600 dark:text-teal-400 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 animate-pulse">
                      ИИ сочиняет историю для вас...
                    </p>
                    <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed max-w-xs mx-auto">
                      Интегрируем выбранные слова ({selectedWords.length}) в сюжет на языке {selectedPracticeLang}. Пожалуйста, подождите.
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
                        Выберите слова / Select Words ({selectedWords.length})
                      </span>
                      <button
                        onClick={() => {
                          if (selectedWords.length === learningList.length) {
                            setSelectedWords([]);
                          } else {
                            setSelectedWords(learningList.map(lq => lq.word));
                          }
                        }}
                        className="text-[9px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-405 dark:hover:text-teal-350 hover:underline cursor-pointer"
                      >
                        {selectedWords.length === learningList.length ? "Сбросить все" : "Выбрать все"}
                      </button>
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 space-y-1 bg-zinc-50/50 dark:bg-zinc-950/20 custom-scrollbar">
                      {learningList.map((lq) => {
                        const isChecked = selectedWords.includes(lq.word);
                        return (
                          <label key={lq.word} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-150/40 dark:hover:bg-zinc-800/40 rounded-lg cursor-pointer transition-colors text-xs font-semibold text-zinc-750 dark:text-zinc-250 select-none">
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
                      Уровень сложности / Difficulty
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 bg-stone-100/50 dark:bg-zinc-900/55 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-805/60 font-sans">
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
                              ? "bg-white dark:bg-zinc-850 text-teal-605 dark:text-teal-400 shadow-xs border border-zinc-150/70 dark:border-zinc-750"
                              : "text-zinc-500 hover:text-zinc-750 dark:hover:text-zinc-350"
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
                      Жанр истории / Genre
                    </span>
                    <div className="relative">
                      <select
                        value={storyGenre}
                        onChange={(e) => setStoryGenre(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-805 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80 cursor-pointer appearance-none shadow-4xs"
                      >
                        <option value="general">Обычный рассказ (General)</option>
                        <option value="humor">Юмор / Комедия (Humor)</option>
                        <option value="scifi">Научная фантастика / Фэнтези (Sci-Fi)</option>
                        <option value="mystery">Детектив / Тайна (Mystery)</option>
                        <option value="romance">Романтика (Romance)</option>
                        <option value="adventure">Приключение (Adventure)</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-450">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Error Notification */}
                  {genError && (
                    <div className="text-xs text-rose-505 font-bold p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/35 rounded-xl text-center">
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
                    Создать AI историю
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
