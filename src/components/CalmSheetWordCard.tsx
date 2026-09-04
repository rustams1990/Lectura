/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { VocabItem, WordStatus, ReaderSettings, Lesson } from "../types";
import { useTranslation } from "react-i18next";
import { Volume2, X, Link2 } from "lucide-react";
import { playGoogleTTS, fetchWordMeaning } from "../utils";
import { getSuggestedLemmas } from "../morphology";

export interface CalmSheetWordCardProps {
  word: string | null;
  sentence: string | null;
  targetLanguage: string;
  translationLanguage: string;
  existingVocab?: VocabItem | null;
  wordLinks: Record<string, string>;
  vocab?: Record<string, VocabItem> | null;
  onSaveVocab: (vocabItem: VocabItem) => void;
  onDeleteVocab: (word: string) => void;
  onSaveWordLink: (from: string, to: string) => void;
  onDeleteWordLink: (from: string) => void;
  onClose?: () => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onWordClick?: (word: string, context: string) => void;
  lessonText?: string;
  lessons?: Lesson[];
  detectedPhrases?: Record<string, { translation: string; explanation: string; type?: string }>;
  textLemmas?: Record<string, string>;
  currentLessonId?: string;
  onOpenLesson?: (lessonId: string, word: string, sentence: string) => void;
}

type TabType = "meaning" | "definition" | "usage" | "dictionaries" | "baseroot";

export default function CalmSheetWordCard({
  word,
  sentence,
  targetLanguage,
  translationLanguage,
  existingVocab,
  wordLinks,
  vocab,
  onSaveVocab,
  onDeleteVocab,
  onSaveWordLink,
  onDeleteWordLink,
  onClose,
  settings,
  onSettingsChange,
  onWordClick,
  lessonText,
  lessons,
  detectedPhrases,
  textLemmas,
  currentLessonId,
  onOpenLesson,
}: CalmSheetWordCardProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("meaning");
  const [loadingMeaning, setLoadingMeaning] = useState(false);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [currentMeaning, setCurrentMeaning] = useState("");
  const [dictionaryDefinition, setDictionaryDefinition] = useState("");
  const [ipaText, setIpaText] = useState("");
  const [baseRootInput, setBaseRootInput] = useState("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const cleanWord = useMemo(() => (word ? word.trim().toLowerCase() : ""), [word]);

  // Current status
  const currentStatus: WordStatus = useMemo(() => {
    if (existingVocab?.status) return existingVocab.status;
    if (cleanWord && vocab && vocab[cleanWord]?.status) return vocab[cleanWord].status;
    return "new";
  }, [existingVocab, cleanWord, vocab]);

  // Current parent / base root
  const currentParent = useMemo(() => {
    if (!cleanWord) return "";
    return wordLinks[cleanWord] || "";
  }, [cleanWord, wordLinks]);

  useEffect(() => {
    setBaseRootInput(currentParent);
  }, [currentParent]);

  // Helper to format translation text as comma-separated synonyms
  const formatSynonymsLine = useCallback((text: string): string => {
    if (!text) return "";
    const items = text
      .split(/[\n,;]+/)
      .map((s) => s.replace(/^\([a-zA-Z]+\)\s*/, "").trim())
      .filter((s) => s.length > 0 && s.toLowerCase() !== "ха" && s.toLowerCase() !== "ha");
    const unique = Array.from(new Set(items));
    return unique.slice(0, 4).join(", ");
  }, []);

  // Sync translation & definition when existingVocab or word changes
  useEffect(() => {
    if (!cleanWord) return;

    // Check existing vocab first
    if (existingVocab) {
      if (existingVocab.translation) {
        setCurrentMeaning(existingVocab.translation);
      }
      if (existingVocab.definition) {
        setDictionaryDefinition(existingVocab.definition);
      }
      if (existingVocab.ipa) {
        setIpaText(existingVocab.ipa);
      }
    } else if (vocab && vocab[cleanWord]) {
      if (vocab[cleanWord].translation) {
        setCurrentMeaning(vocab[cleanWord].translation);
      }
      if (vocab[cleanWord].definition) {
        setDictionaryDefinition(vocab[cleanWord].definition);
      }
      if (vocab[cleanWord].ipa) {
        setIpaText(vocab[cleanWord].ipa);
      }
    }

    let isCancelled = false;

    // 1. Fetch bilingual meaning (Direct Google Translate GTX -> Server fallback)
    const fetchMeaning = async () => {
      setLoadingMeaning(true);
      try {
        const targetTransLang = translationLanguage || "ru";
        const meaning = await fetchWordMeaning(cleanWord, targetLanguage, targetTransLang);
        if (!isCancelled && meaning) {
          const formatted = formatSynonymsLine(meaning);
          if (!existingVocab?.translation && (!vocab || !vocab[cleanWord]?.translation)) {
            setCurrentMeaning(formatted);
          }

          // If word has active status, save
          if (currentStatus !== "new" && currentStatus !== "ignored") {
            const newItem: VocabItem = {
              word: cleanWord,
              translation: formatted,
              definition: dictionaryDefinition,
              ipa: ipaText || "",
              grammar: "",
              contextRelation: "",
              status: currentStatus,
              examples: existingVocab?.examples || [],
              createdAt: Date.now(),
              imageUrl: existingVocab?.imageUrl ?? (vocab?.[cleanWord]?.imageUrl || null),
            };
            onSaveVocab(newItem);
          }
        }
      } catch (err) {
        if (!isCancelled && !currentMeaning) {
          setCurrentMeaning("");
        }
      } finally {
        if (!isCancelled) {
          setLoadingMeaning(false);
        }
      }
    };

    // 2. Fetch monolingual definition (Wiktionary / Free Dictionary)
    const fetchDefinition = async () => {
      setLoadingDefinition(true);
      try {
        const res = await fetch("/api/dictionary-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: cleanWord,
            targetLanguage,
            translationLanguage: targetLanguage,
            source: "hybrid",
            context: sentence || cleanWord,
          }),
        });

        if (!res.ok) throw new Error("Definition lookup failed");
        const data = await res.json();
        if (!isCancelled && data.translation) {
          setDictionaryDefinition(data.translation);
          if (data.ipa && !ipaText) setIpaText(data.ipa);
        }
      } catch (err) {
        if (!isCancelled && !dictionaryDefinition) {
          setDictionaryDefinition("");
        }
      } finally {
        if (!isCancelled) {
          setLoadingDefinition(false);
        }
      }
    };

    fetchMeaning();
    fetchDefinition();

    return () => {
      isCancelled = true;
    };
  }, [cleanWord, existingVocab, vocab, targetLanguage, translationLanguage, sentence, formatSynonymsLine, currentStatus, onSaveVocab]);

  // Handle saving meaning edits
  const handleMeaningBlur = () => {
    if (!cleanWord || !currentMeaning.trim()) return;
    const updatedItem: VocabItem = {
      ...(existingVocab || {
        word: cleanWord,
        translation: currentMeaning.trim(),
        definition: dictionaryDefinition,
        ipa: ipaText || "",
        grammar: "",
        contextRelation: "",
        examples: [],
        createdAt: Date.now(),
      }),
      translation: currentMeaning.trim(),
      definition: dictionaryDefinition,
      status: currentStatus === "new" ? "2" : currentStatus,
      imageUrl: existingVocab?.imageUrl ?? (vocab?.[cleanWord]?.imageUrl || null),
    };
    onSaveVocab(updatedItem);
  };

  // Handle status click
  const handleStatusChange = (newStatus: WordStatus) => {
    if (!cleanWord) return;

    if (newStatus === "ignored") {
      const updatedItem: VocabItem = {
        ...(existingVocab || {
          word: cleanWord,
          translation: currentMeaning || "",
          definition: dictionaryDefinition || "",
          ipa: ipaText || "",
          grammar: "",
          contextRelation: "",
          examples: [],
          createdAt: Date.now(),
        }),
        status: "ignored",
        imageUrl: existingVocab?.imageUrl ?? (vocab?.[cleanWord]?.imageUrl || null),
      };
      onSaveVocab(updatedItem);
      return;
    }

    const updatedItem: VocabItem = {
      ...(existingVocab || {
        word: cleanWord,
        translation: currentMeaning || "",
        definition: dictionaryDefinition || "",
        ipa: ipaText || "",
        grammar: "",
        contextRelation: "",
        examples: [],
        createdAt: Date.now(),
      }),
      translation: currentMeaning || existingVocab?.translation || "",
      definition: dictionaryDefinition,
      status: newStatus,
      imageUrl: existingVocab?.imageUrl ?? (vocab?.[cleanWord]?.imageUrl || null),
    };
    onSaveVocab(updatedItem);
  };

  // Google Translate TTS audio playback
  const handlePlayTTS = useCallback(async () => {
    if (!cleanWord || isPlayingAudio) return;
    setIsPlayingAudio(true);

    try {
      await playGoogleTTS(cleanWord, targetLanguage, settings);
    } catch (e) {
      console.error("Google TTS playback error:", e);
    } finally {
      setIsPlayingAudio(false);
    }
  }, [cleanWord, isPlayingAudio, targetLanguage, settings]);

  // Highlight word in sentence
  const highlightedSentence = useMemo(() => {
    if (!sentence || !word) return sentence || "";
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const parts = sentence.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === word.toLowerCase() ? (
        <span key={i} className="text-sky-600 dark:text-sky-400 font-bold">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }, [sentence, word]);

  // Suggested lemmas from algorithmic morphology, AI text_lemmas and wordLinks
  const suggestions = useMemo(() => {
    if (!cleanWord) return [];
    const targetNorm = cleanWord.trim().toLowerCase();
    const langKey = `${targetLanguage.toLowerCase()}_${targetNorm}`;

    // 1. Existing wordLink parent
    const linkedParentRaw = wordLinks ? (wordLinks[langKey] || wordLinks[targetNorm]) : null;
    const linkedParent = linkedParentRaw ? linkedParentRaw.replace(/^[a-zA-Z]+_/, "") : null;

    // 2. Pre-parsed AI text_lemmas
    const aiLemma = textLemmas
      ? (textLemmas[cleanWord.trim()] || textLemmas[targetNorm] || textLemmas[word || ""])
      : null;

    // 3. Algorithmic morphology suggestions
    const morphs = getSuggestedLemmas(cleanWord, targetLanguage);

    const candidates = [
      linkedParent,
      aiLemma,
      ...morphs,
    ];

    const seen = new Set<string>();
    const filtered: string[] = [];

    for (const cand of candidates) {
      if (!cand) continue;
      const candNorm = cand.trim().toLowerCase();

      // Rule: Never suggest the exact selected word itself
      if (candNorm === targetNorm) continue;

      if (!seen.has(candNorm)) {
        seen.add(candNorm);
        filtered.push(cand.trim());
      }
    }

    return filtered;
  }, [cleanWord, word, targetLanguage, textLemmas, wordLinks]);

  const currentLinkedRoot = useMemo(() => {
    if (!cleanWord) return null;
    const targetNorm = cleanWord.trim().toLowerCase();
    const langKey = `${targetLanguage.toLowerCase()}_${targetNorm}`;
    const raw = wordLinks ? (wordLinks[langKey] || wordLinks[targetNorm]) : null;
    return raw ? raw.replace(/^[a-zA-Z]+_/, "") : null;
  }, [cleanWord, targetLanguage, wordLinks]);

  const handleLinkRoot = (rootVal: string) => {
    const trimmed = rootVal.trim();
    if (cleanWord && trimmed) {
      onSaveWordLink(cleanWord, trimmed.toLowerCase());
      setBaseRootInput(trimmed);
    } else if (cleanWord && !trimmed) {
      onDeleteWordLink(cleanWord);
      setBaseRootInput("");
    }
  };

  // External Dictionary URLs
  const dictUrls = useMemo(() => {
    if (!cleanWord) return { cambridge: "#", wiktionary: "#", reverso: "#" };
    const encoded = encodeURIComponent(cleanWord);
    const langCode = targetLanguage.slice(0, 2).toLowerCase();

    let cambridgeDict = "english";
    if (langCode === "es") cambridgeDict = "spanish-english";
    else if (langCode === "fr") cambridgeDict = "french-english";
    else if (langCode === "de") cambridgeDict = "german-english";
    else if (langCode === "it") cambridgeDict = "italian-english";
    else if (langCode === "pt") cambridgeDict = "portuguese-english";
    else if (langCode === "ru") cambridgeDict = "russian-english";

    return {
      cambridge: `https://dictionary.cambridge.org/dictionary/${cambridgeDict}/${encoded}`,
      wiktionary: `https://${langCode}.wiktionary.org/wiki/${encoded}`,
      reverso: `https://context.reverso.net/translation/${targetLanguage.toLowerCase()}-${(translationLanguage || "russian").toLowerCase()}/${encoded}`,
    };
  }, [cleanWord, targetLanguage, translationLanguage]);

  if (!word) {
    return (
      <div className="p-4 text-center text-slate-400 dark:text-zinc-500 font-medium text-sm">
        {t("reader.select_word_prompt", "Click on any word to inspect")}
      </div>
    );
  }

  return (
    <div 
      className="word-popup-card w-full bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-[20px] p-4 shadow-2xl text-slate-900 dark:text-slate-100 font-sans select-text overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* 1. Header Tab Bar (5 compact tabs) */}
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-zinc-800 pb-2 mb-3 gap-1.5 w-full">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setActiveTab("meaning")}
            className={`px-2 py-1 text-[11.5px] font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "meaning"
                ? "bg-slate-200/80 dark:bg-zinc-800 text-slate-950 dark:text-white font-bold shadow-3xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50"
            }`}
          >
            Meaning
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("definition")}
            className={`px-2 py-1 text-[11.5px] font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "definition"
                ? "bg-slate-200/80 dark:bg-zinc-800 text-slate-950 dark:text-white font-bold shadow-3xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50"
            }`}
          >
            Definition
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("usage")}
            className={`px-2 py-1 text-[11.5px] font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "usage"
                ? "bg-slate-200/80 dark:bg-zinc-800 text-slate-950 dark:text-white font-bold shadow-3xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50"
            }`}
          >
            Usage
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dictionaries")}
            className={`px-2 py-1 text-[11.5px] font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "dictionaries"
                ? "bg-slate-200/80 dark:bg-zinc-800 text-slate-950 dark:text-white font-bold shadow-3xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50"
            }`}
          >
            Dicts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("baseroot")}
            className={`px-2 py-1 text-[11.5px] font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "baseroot"
                ? "bg-slate-200/80 dark:bg-zinc-800 text-slate-950 dark:text-white font-bold shadow-3xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50"
            }`}
          >
            Root
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (typeof window !== "undefined") {
                (window as any).__lecturaLastModalClosedAt = Date.now();
              }
              onClose();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            className="relative z-50 p-1.5 touch-none w-7 h-7 flex items-center justify-center rounded-full bg-slate-100/80 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700/80 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0 ml-1 cursor-pointer"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Main Word Row (Word + Language Badge + TTS button) */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif font-extrabold text-2xl sm:text-3xl text-slate-950 dark:text-white tracking-tight">
          {word}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300">
            {targetLanguage}
          </span>
          <button
            type="button"
            onClick={handlePlayTTS}
            disabled={isPlayingAudio}
            className="p-1.5 px-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-transform active:scale-95 cursor-pointer"
            title="Play Google Translate pronunciation"
          >
            <Volume2 className={`w-4 h-4 ${isPlayingAudio ? "animate-pulse text-sky-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* 3. Tab Contents */}

      {/* Tab: Meaning (Active by default) */}
      {activeTab === "meaning" && (
        <div className="space-y-3 animate-in fade-in duration-150">
          {/* Editable Translation Input with zero layout shift */}
          <div className="bg-white dark:bg-zinc-950 border border-slate-200/90 dark:border-zinc-700/80 rounded-xl px-3 py-2 shadow-3xs focus-within:ring-2 focus-within:ring-sky-500/30 focus-within:border-sky-500 transition-all min-h-[42px] flex items-center">
            {loadingMeaning && !currentMeaning ? (
              <div className="flex items-center gap-2 w-full animate-pulse">
                <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded-md w-2/3" />
                <span className="text-xs text-slate-400 dark:text-zinc-500 italic shrink-0">
                  {t("explainer.translating", "Translating...")}
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={currentMeaning}
                onChange={(e) => setCurrentMeaning(e.target.value)}
                onBlur={handleMeaningBlur}
                placeholder="Type a meaning for this form..."
                className="w-full bg-transparent border-none outline-none font-bold text-base text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-zinc-500"
              />
            )}
          </div>

          {/* Example Card (Full Width) */}
          <div className="bg-[#f1f5f9] dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-xl p-3.5 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1">
              {t("explainer.usage_example", "Пример использования:")}
            </span>
            <p className="text-[13.5px] leading-relaxed text-slate-800 dark:text-zinc-200 m-0">
              {highlightedSentence || sentence || (
                <span className="text-slate-400 italic">No context sentence</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Tab: Definition (Monolingual Explanatory Dictionary) */}
      {activeTab === "definition" && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-950 border border-slate-200/90 dark:border-zinc-700/80 rounded-xl p-3.5 shadow-2xs min-h-[72px]">
            <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1.5">
              📖 Monolingual Definition ({targetLanguage}):
            </span>
            {loadingDefinition && !dictionaryDefinition ? (
              <div className="space-y-1.5 animate-pulse pt-1">
                <div className="h-3.5 bg-slate-200 dark:bg-zinc-800 rounded-md w-4/5" />
                <div className="h-3.5 bg-slate-200 dark:bg-zinc-800 rounded-md w-3/5" />
              </div>
            ) : (
              <p className="text-[13.5px] leading-relaxed text-slate-800 dark:text-zinc-200 m-0 whitespace-pre-line font-normal">
                {dictionaryDefinition || "No definition available in dictionary."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Usage */}
      {activeTab === "usage" && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="bg-[#f1f5f9] dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1">
              📖 Context Sentence:
            </span>
            <p className="text-[13.5px] leading-relaxed text-slate-800 dark:text-zinc-200 m-0">
              {highlightedSentence || sentence || "No context sentence available."}
            </p>
          </div>

          {existingVocab?.examples && existingVocab.examples.length > 0 && (
            <div className="bg-[#f1f5f9] dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-xl p-3.5 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block">
                📚 Example Sentences:
              </span>
              {existingVocab.examples.slice(0, 3).map((ex, idx) => (
                <div key={idx} className="text-xs text-slate-700 dark:text-zinc-300 border-l-2 border-sky-500 pl-2">
                  <div className="font-medium">{ex.text}</div>
                  {ex.translation && <div className="text-slate-500 dark:text-zinc-400 text-[11px]">{ex.translation}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Dictionaries */}
      {activeTab === "dictionaries" && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="bg-[#f1f5f9] dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-2.5">
              📖 External Dictionaries:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={dictUrls.cambridge}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-300 text-center transition-all shadow-3xs"
              >
                Cambridge ↗
              </a>
              <a
                href={dictUrls.wiktionary}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-300 text-center transition-all shadow-3xs"
              >
                Wiktionary ↗
              </a>
              <a
                href={dictUrls.reverso}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-300 text-center transition-all shadow-3xs"
              >
                Reverso ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Base Root */}
      {activeTab === "baseroot" && (
        <div className="calm-root-tab-content space-y-3 animate-in fade-in duration-150">
          <div className="bg-[#f8fafc] dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-3">
            <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
              <span>🌱</span> Base Root & Morphology:
            </div>

            {/* Input + Link action row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 gap-2 shadow-3xs focus-within:ring-2 focus-within:ring-sky-500/30 focus-within:border-sky-500 transition-all">
                <span className="text-slate-400 text-xs select-none">🔗</span>
                <input
                  type="text"
                  placeholder="Base root (e.g. book)..."
                  value={baseRootInput}
                  onChange={(e) => setBaseRootInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLinkRoot(baseRootInput);
                    }
                  }}
                  className="w-full bg-transparent border-none outline-none text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handleLinkRoot(baseRootInput)}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3.5 py-1.5 font-semibold text-xs transition-colors shadow-3xs cursor-pointer active:scale-95"
              >
                Link
              </button>
            </div>

            {/* Suggestions row */}
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider block w-full">
                  💡 SUGGESTIONS:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setBaseRootInput(sug);
                        handleLinkRoot(sug);
                      }}
                      className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 rounded-md px-2 py-0.5 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current linked root status */}
            {currentLinkedRoot && (
              <div className="text-xs text-slate-600 dark:text-zinc-400 pt-1 border-t border-slate-200/60 dark:border-zinc-800/60">
                Current Base Root:{" "}
                <strong className="text-sky-600 dark:text-sky-400 underline underline-offset-2 font-bold">
                  {currentLinkedRoot}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Monolithic Segmented Status Bar (Always displayed at the bottom of the card) */}
      <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-full p-1 shadow-xs flex items-center justify-between gap-1 w-full box-border mt-3.5">
        {/* 🚫 Ignore */}
        <button
          type="button"
          onClick={() => handleStatusChange("ignored")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "ignored" || currentStatus === "0"
              ? "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-400 font-extrabold"
              : "text-slate-500 dark:text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
          }`}
          title="Игнорировать (0)"
        >
          🚫
        </button>

        {/* 1 - Hard */}
        <button
          type="button"
          onClick={() => handleStatusChange("1")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "1"
              ? "bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400 font-extrabold"
              : "text-slate-600 dark:text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          }`}
          title="Hard (1)"
        >
          1
        </button>

        {/* 2 - Remembering */}
        <button
          type="button"
          onClick={() => handleStatusChange("2")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "2"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 font-extrabold"
              : "text-slate-600 dark:text-zinc-400 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/40"
          }`}
          title="Remembering (2)"
        >
          2
        </button>

        {/* 3 - Intermediate (Pastel Green Badge) */}
        <button
          type="button"
          onClick={() => handleStatusChange("3")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "3"
              ? "bg-[#dcfce7] text-[#15803d] dark:bg-emerald-950/80 dark:text-emerald-300 font-extrabold shadow-xs"
              : "text-slate-600 dark:text-zinc-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
          }`}
          title="Intermediate (3)"
        >
          3
        </button>

        {/* 4 - Advanced */}
        <button
          type="button"
          onClick={() => handleStatusChange("4")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "4"
              ? "bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 font-extrabold"
              : "text-slate-600 dark:text-zinc-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950/40"
          }`}
          title="Advanced (4)"
        >
          4
        </button>

        {/* 5 - Mastered */}
        <button
          type="button"
          onClick={() => handleStatusChange("5")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "5"
              ? "bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 font-extrabold"
              : "text-slate-600 dark:text-zinc-400 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/40"
          }`}
          title="Mastered (5)"
        >
          5
        </button>

        {/* ✓ Known */}
        <button
          type="button"
          onClick={() => handleStatusChange("known")}
          className={`flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
            currentStatus === "known"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200 font-extrabold shadow-xs"
              : "text-slate-600 dark:text-zinc-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
          }`}
          title="Знаю (K)"
        >
          ✓
        </button>
      </div>
    </div>
  );
}
