import React, { useState, useMemo } from "react";
import { Sparkles, X, CheckSquare, Square, Search, Loader2, BookOpen, Layers, BookMarked, Check, ShieldCheck, Tag as TagIcon, Brain } from "lucide-react";
import { VocabItem, Lesson, ReaderSettings } from "../types";
import { getSuggestedLemmas } from "../morphology";
import { useToast } from "../context/ToastContext";
import { executeAiWithFailover, getOrCreateAiProfiles } from "../services/aiFailoverService";

interface DetectedExpressionItem {
  phrase: string;
  parent?: string;
  translation_in_context: string;
  literal_translation?: string;
  explanation: string;
  type: string;
  register?: string;
  tags?: string[];
}

interface WordPropertyItem {
  word: string;
  parent?: string;
  translation: string;
  pos: string;
  cefr: string;
  frequency: string;
  ipa_us: string;
  ipa_uk: string;
  audio_us?: string;
  audio_uk?: string;
  tags?: string[];
}

interface AiHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLesson: Lesson | null;
  selectedText: string;
  onSaveMultipleVocabs: (items: VocabItem[], lang?: string) => void;
  onSaveWordLink?: (from: string, to: string, lang?: string) => void;
  readerSettings: ReaderSettings;
  t: any;
  currentReaderTheme?: any;
}

export default function AiHubModal({
  isOpen,
  onClose,
  activeLesson,
  selectedText,
  onSaveMultipleVocabs,
  onSaveWordLink,
  readerSettings,
  t,
  currentReaderTheme
}: AiHubModalProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"expressions" | "properties" | "lemmatizer">("expressions");

  // Expression Detector state
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedItems, setDetectedItems] = useState<DetectedExpressionItem[]>([]);
  const [selectedExpressionIndices, setSelectedExpressionIndices] = useState<Set<number>>(new Set());
  const [hasScannedExpressions, setHasScannedExpressions] = useState(false);

  // Word Properties state
  const [isAnalyzingProps, setIsAnalyzingProps] = useState(false);
  const [propertyItems, setPropertyItems] = useState<WordPropertyItem[]>([]);
  const [selectedPropIndices, setSelectedPropIndices] = useState<Set<number>>(new Set());
  const [hasScannedProps, setHasScannedProps] = useState(false);

  // AI Lemmatizer state
  const [isLemmatizing, setIsLemmatizing] = useState(false);
  const [lemmasData, setLemmasData] = useState<{ child: string; parent: string }[]>([]);
  const [selectedLemmaIndices, setSelectedLemmaIndices] = useState<Set<number>>(new Set());
  const [hasScannedLemmas, setHasScannedLemmas] = useState(false);

  // Live percentage progress state (0% -> 100%)
  const [scanProgress, setScanProgress] = useState(0);

  // Status & Error message state
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [detectErrorMsg, setDetectErrorMsg] = useState<string | null>(null);

  const startProgressTimer = () => {
    setScanProgress(8);
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 94) {
          clearInterval(interval);
          return 94;
        }
        return prev + Math.floor(Math.random() * 8) + 4;
      });
    }, 280);
    return interval;
  };

  // Scope mode state ('page' by default, or 'selection' if user explicitly toggles to selected snippet)
  const [scanScopeMode, setScanScopeMode] = useState<"page" | "selection">("page");

  const trimmedSelection = selectedText.trim();
  const selectionWordCount = useMemo(() => {
    if (!trimmedSelection) return 0;
    return trimmedSelection.split(/\s+/).filter(Boolean).length;
  }, [trimmedSelection]);

  const targetScanText = (scanScopeMode === "selection" && trimmedSelection)
    ? trimmedSelection
    : (activeLesson?.text || "");
  const targetLanguage = activeLesson?.targetLanguage || "English";
  const translationLanguage = activeLesson?.translationLanguage || "Russian";

  if (!isOpen) return null;

  // Handler 1: Smart Expression Detector scan
  const handleScanExpressions = async () => {
    if (!targetScanText) return;
    setIsDetecting(true);
    setSaveSuccessMsg(null);
    setDetectErrorMsg(null);
    const timer = startProgressTimer();
    try {
      const profiles = getOrCreateAiProfiles(readerSettings);
      const data = await executeAiWithFailover(
        profiles,
        async (profile) => {
          const response = await fetch("/api/detect-expressions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: targetScanText,
              targetLanguage,
              translationLanguage,
              aiProfile: profile,
            })
          });
          const resData = await response.json();
          if (!response.ok) {
            const err: any = new Error(resData.error || "Failed to detect expressions");
            err.status = response.status;
            throw err;
          }
          return resData;
        },
        {
          onFallback: (from, to) => {
            showToast(t("settings.ai_fallback_toast", "Quota for {{from}} exceeded. Request completed via {{to}}.", { from: from.name, to: to.name }), "info");
          }
        }
      );
      const items: DetectedExpressionItem[] = data.items || [];
      setDetectedItems(items);
      setSelectedExpressionIndices(new Set(items.map((_, idx) => idx))); // Select all by default
      setHasScannedExpressions(true);
      setScanProgress(100);
    } catch (err: any) {
      console.error("Expression Detection Error:", err);
      setDetectErrorMsg(err.message || "An unexpected error occurred during expression detection.");
      setDetectedItems([]);
      setHasScannedExpressions(true);
    } finally {
      clearInterval(timer);
      setIsDetecting(false);
    }
  };

  // Handler 2: Batch Word Property Analyzer scan
  const handleAnalyzeWordProperties = async () => {
    if (!targetScanText) return;
    setIsAnalyzingProps(true);
    setSaveSuccessMsg(null);
    setDetectErrorMsg(null);
    const timer = startProgressTimer();
    try {
      const profiles = getOrCreateAiProfiles(readerSettings);
      const data = await executeAiWithFailover(
        profiles,
        async (profile) => {
          const response = await fetch("/api/analyze-word-properties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: targetScanText,
              targetLanguage,
              translationLanguage,
              aiProfile: profile,
            })
          });

          if (!response.ok) {
            let errorText = "Failed to analyze word properties";
            try {
              const errData = await response.json();
              if (errData && errData.error) errorText = errData.error;
            } catch (_) {}
            const err: any = new Error(errorText);
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

      const items: WordPropertyItem[] = data.wordProperties || [];

      setPropertyItems(items);
      setSelectedPropIndices(new Set(items.map((_, idx) => idx))); // Select all by default
      setHasScannedProps(true);
      setScanProgress(100);
    } catch (err: any) {
      console.error("Word Property Analysis Error:", err);
      setDetectErrorMsg(err.message || "Failed to analyze word properties.");
      setHasScannedProps(true);
    } finally {
      clearInterval(timer);
      setIsAnalyzingProps(false);
    }
  };

  // Toggle selection helpers
  const toggleExpressionIndex = (idx: number) => {
    setSelectedExpressionIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAllExpressions = () => {
    if (selectedExpressionIndices.size === detectedItems.length) {
      setSelectedExpressionIndices(new Set());
    } else {
      setSelectedExpressionIndices(new Set(detectedItems.map((_, idx) => idx)));
    }
  };

  const togglePropIndex = (idx: number) => {
    setSelectedPropIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAllProps = () => {
    if (selectedPropIndices.size === propertyItems.length) {
      setSelectedPropIndices(new Set());
    } else {
      setSelectedPropIndices(new Set(propertyItems.map((_, idx) => idx)));
    }
  };

  // Save Expressions to Dictionary
  const handleSaveSelectedExpressions = () => {
    const selectedList = detectedItems.filter((_, idx) => selectedExpressionIndices.has(idx));
    if (selectedList.length === 0) return;

    const vocabItems: VocabItem[] = selectedList.map((item) => {
      const cleanWord = (item.phrase || item.parent).toLowerCase().trim();
      const tagList = Array.from(
        new Set([
          ...(item.tags || []),
          item.type ? item.type.replace("_", " ") : "Idiom",
          item.register || "Informal"
        ].filter(Boolean))
      );

      return {
        word: cleanWord,
        translation: item.translation_in_context || "",
        contextRelation: item.explanation || (item.literal_translation ? `Literal: ${item.literal_translation}` : ""),
        grammar: item.type ? item.type.replace("_", " ") : "Idiom",
        tags: tagList,
        status: "2"
      };
    });

    onSaveMultipleVocabs(vocabItems, targetLanguage);
    setSaveSuccessMsg(t("ai_hub.save_success", "✓ {{count}} expressions added to dictionary!", { count: vocabItems.length }));
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Save Word Properties to Dictionary
  const handleSaveSelectedProps = () => {
    const selectedList = propertyItems.filter((_, idx) => selectedPropIndices.has(idx));
    if (selectedList.length === 0) return;

    const vocabItems: VocabItem[] = [];
    selectedList.forEach((item: any) => {
      const formWord = (item.word || "").toLowerCase().trim();

      const formattedIpa = [
        item.ipa_us ? `US: ${item.ipa_us}` : "",
        item.ipa_uk ? `UK: ${item.ipa_uk}` : ""
      ].filter(Boolean).join(" | ") || item.ipa_us || item.ipa_uk || "";

      const tagList = Array.from(
        new Set([
          ...(item.tags || []),
          item.cefr || "",
          item.pos || "",
          item.frequency || ""
        ].filter(Boolean))
      );

      // Save word item properties (word, ipa, grammar, tags)
      if (formWord) {
        vocabItems.push({
          word: formWord,
          translation: "",
          ipa: formattedIpa,
          grammar: item.pos || "",
          tags: tagList,
          contextRelation: "",
          status: "new",
          examples: [],
          createdAt: Date.now(),
        });
      }
    });

    onSaveMultipleVocabs(vocabItems, targetLanguage);
    setSaveSuccessMsg(t("ai_hub.save_props_success", "✓ Properties for {{count}} words added to dictionary!", { count: vocabItems.length }));
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Handler 3: AI Lemmatizer scan (Hybrid Offline Morphology + AI Deep Analysis)
  const handleScanLemmas = async () => {
    if (!targetScanText) return;
    setIsLemmatizing(true);
    setSaveSuccessMsg(null);
    setDetectErrorMsg(null);
    const timer = startProgressTimer();
    try {
      // 1. Extract raw tokens from target scan text
      const rawTokens = targetScanText.match(/[\p{L}\p{M}'’]+/gu) || [];
      const tokenList = Array.from(new Set(rawTokens.map((t) => t.trim()).filter((t) => t.length > 1)));

      const lemmaMap = new Map<string, string>(); // lowerChild -> parent

      // 2. Perform offline morphology resolution first for instantaneous coverage
      tokenList.forEach((tok) => {
        const lowerTok = tok.toLowerCase();
        const suggestions = getSuggestedLemmas(tok, targetLanguage);
        if (suggestions && suggestions.length > 0) {
          const parentLemma = suggestions[0];
          if (parentLemma && parentLemma.toLowerCase() !== lowerTok) {
            lemmaMap.set(lowerTok, parentLemma);
          }
        }
      });

      // 3. Perform AI server lemmatization call
      const profiles = getOrCreateAiProfiles(readerSettings);
      try {
        const data = await executeAiWithFailover(
          profiles,
          async (profile) => {
            const response = await fetch("/api/lemmatize-text", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: targetScanText,
                words: tokenList,
                targetLanguage,
                aiProfile: profile,
              }),
            });
            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              const err: any = new Error(errData.error || `HTTP ${response.status}`);
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

        if (data && data.lemmas) {
          Object.entries(data.lemmas).forEach(([child, parent]) => {
            if (child && parent && typeof parent === "string") {
              const cleanChild = child.trim().toLowerCase();
              const cleanParent = parent.trim();
              if (cleanChild !== cleanParent.toLowerCase()) {
                lemmaMap.set(cleanChild, cleanParent);
              }
            }
          });
        }
      } catch (aiErr) {
        console.warn("AI Lemmatization skipped/fallback failed:", aiErr);
      }

      setScanProgress(100);

      const pairs: { child: string; parent: string }[] = Array.from(lemmaMap.entries()).map(([c, p]) => ({
        child: c,
        parent: p,
      }));

      // Automatically register resolved links
      pairs.forEach(({ child, parent }) => {
        if (onSaveWordLink) {
          onSaveWordLink(child, parent, targetLanguage);
        }
      });

      setLemmasData(pairs);
      setSelectedLemmaIndices(new Set(pairs.map((_, idx) => idx)));
      setHasScannedLemmas(true);
      setSaveSuccessMsg(
        t("ai_hub.lemmatize_success", "✓ AI Lemmatization complete! {{count}} word roots resolved and linked.", {
          count: pairs.length,
        })
      );
    } catch (err: any) {
      console.error("AI Lemmatize Error:", err);
      setDetectErrorMsg(err.message || "An error occurred during AI Lemmatization.");
    } finally {
      clearInterval(timer);
      setIsLemmatizing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/55 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-teal-500 to-emerald-500 rounded-xl text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 font-sans tracking-tight">
                {t("ai_hub.title", "AI Tools Hub")}
              </h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-sans">
                {t("ai_hub.subtitle", "Smart expressions, registers, CEFR levels & US/UK transcriptions")}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope Indicator Badge */}
        <div className="px-5 py-2.5 bg-teal-50/60 dark:bg-teal-950/30 border-b border-teal-100/50 dark:border-teal-900/30 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-teal-700 dark:text-teal-400 font-sans uppercase tracking-wider text-[10px]">
              {t("ai_hub.scope_label", "Scan Scope:")}
            </span>
            <div className="flex items-center gap-1.5 bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 rounded-full border border-zinc-300/40 dark:border-zinc-700/40">
              <button
                type="button"
                onClick={() => setScanScopeMode("page")}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-sans transition-all cursor-pointer ${
                  scanScopeMode === "page"
                    ? "bg-teal-600 text-white shadow-2xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                📄 {t("ai_hub.scope_page", "Current Page")}
              </button>

              {selectionWordCount > 0 && (
                <button
                  type="button"
                  onClick={() => setScanScopeMode("selection")}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-sans transition-all cursor-pointer ${
                    scanScopeMode === "selection"
                      ? "bg-teal-600 text-white shadow-2xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  🎯 {t("ai_hub.scope_selection", "Selected Text ({{count}} words)", { count: selectionWordCount })}
                </button>
              )}
            </div>
          </div>

          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
            {targetLanguage} ➔ {translationLanguage}
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-900 px-5 pt-2">
          <button
            onClick={() => setActiveTab("expressions")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold font-sans border-b-2 transition-all cursor-pointer ${
              activeTab === "expressions"
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <BookMarked className="w-4 h-4" />
            {t("ai_hub.tab_expressions", "Smart Expression Detector")}
          </button>

          <button
            onClick={() => setActiveTab("properties")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold font-sans border-b-2 transition-all cursor-pointer ${
              activeTab === "properties"
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <Layers className="w-4 h-4" />
            {t("ai_hub.tab_properties", "Word Property Analyzer")}
          </button>

          <button
            onClick={() => setActiveTab("lemmatizer")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold font-sans border-b-2 transition-all cursor-pointer ${
              activeTab === "lemmatizer"
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <Brain className="w-4 h-4 text-purple-500" />
            {t("ai_hub.tab_lemmatizer", "AI Lemmatizer")}
          </button>
        </div>

        {/* Success Alert Banner */}
        {saveSuccessMsg && (
          <div className="mx-5 mt-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between animate-in fade-in duration-200 shrink-0">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              {saveSuccessMsg}
            </span>
          </div>
        )}

        {/* Error Alert Banner */}
        {detectErrorMsg && (
          <div className="mx-5 mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-between animate-in fade-in duration-200 shrink-0">
            <span className="flex items-center gap-2">
              <X className="w-4 h-4 text-rose-500 shrink-0" />
              {detectErrorMsg}
            </span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans">
          {/* TAB 1: Smart Expression Detector */}
          {activeTab === "expressions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t(
                    "ai_hub.expressions_desc",
                    "Scans the target scope for idioms, phrasal verbs, slang, set expressions, sayings, and registers."
                  )}
                </p>

                <button
                  onClick={handleScanExpressions}
                  disabled={isDetecting || !targetScanText}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer active:scale-95"
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("ai_hub.scanning", "Scanning...")}
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      {t("ai_hub.btn_scan_expressions", "Scan Expressions")}
                    </>
                  )}
                </button>
              </div>

              {/* Scanning Loader */}
              {isDetecting && (
                <div className="p-8 text-center space-y-4 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-3xl font-black text-teal-600 dark:text-teal-400 font-mono tracking-tight">
                      {scanProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden max-w-xs mx-auto shadow-inner">
                    <div
                      className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    {t("ai_hub.detecting_msg", "Analyzing expressions, registers, and context...")}
                  </p>
                </div>
              )}

              {/* Empty State after scanning */}
              {!isDetecting && hasScannedExpressions && detectedItems.length === 0 && (
                <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 text-zinc-400 space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    {t("ai_hub.no_expressions", "No expressions, idioms, or slang found in this text.")}
                  </p>
                </div>
              )}

              {/* Results List */}
              {!isDetecting && detectedItems.length > 0 && (
                <div className="space-y-3">
                  {/* Select All Controls */}
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <button
                      onClick={toggleAllExpressions}
                      className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      {selectedExpressionIndices.size === detectedItems.length ? (
                        <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400" />
                      )}
                      {t("ai_hub.select_all", "Select All ({{count}})", { count: detectedItems.length })}
                    </button>

                    <button
                      onClick={handleSaveSelectedExpressions}
                      disabled={selectedExpressionIndices.size === 0}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t("ai_hub.add_selected", "Add Selected to Dictionary ({{count}})", {
                        count: selectedExpressionIndices.size
                      })}
                    </button>
                  </div>

                  {/* Cards Grid */}
                  <div className="space-y-2.5">
                    {detectedItems.map((item, idx) => {
                      const isSelected = selectedExpressionIndices.has(idx);
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleExpressionIndex(idx)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                            isSelected
                              ? "bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/50 shadow-2xs"
                              : "bg-white dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                          }`}
                        >
                          <div className="pt-0.5 shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
                            )}
                          </div>

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100 capitalize">
                                {item.phrase || item.parent || (item as any).word || (item as any).phraseKey || ""}
                              </span>

                              <div className="flex items-center gap-1.5">
                                {item.register && (
                                  <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40">
                                    {item.register}
                                  </span>
                                )}
                                {item.type && (
                                  <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-200/50 dark:border-teal-900/40 capitalize">
                                    {item.type.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                            </div>

                            {item.parent && item.phrase && item.parent.toLowerCase() !== item.phrase.toLowerCase() && (
                              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                                Base root: <span className="font-bold text-teal-600 dark:text-teal-400">{item.parent}</span>
                              </p>
                            )}

                            {(item.translation_in_context || (item as any).translation) && (
                              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                                {item.translation_in_context || (item as any).translation}
                              </p>
                            )}

                            {item.literal_translation && (
                              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
                                Literal: "{item.literal_translation}"
                              </p>
                            )}

                            {item.explanation && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                                {item.explanation}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Batch Word Property Analyzer */}
          {activeTab === "properties" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t(
                    "ai_hub.props_desc",
                    "Extracts Parts of Speech, CEFR levels (A1-C2), word frequency ranks, and IPA transcriptions."
                  )}
                </p>

                <button
                  onClick={handleAnalyzeWordProperties}
                  disabled={isAnalyzingProps || !targetScanText}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer active:scale-95"
                >
                  {isAnalyzingProps ? (
                    <>
                      <span className="font-mono text-xs font-black">{scanProgress}%</span>
                      {t("ai_hub.analyzing", "Analyzing...")}
                    </>
                  ) : (
                    <>
                      <Layers className="w-4 h-4" />
                      {t("ai_hub.btn_analyze_props", "Analyze Word Properties")}
                    </>
                  )}
                </button>
              </div>

              {/* Loader */}
              {isAnalyzingProps && (
                <div className="p-8 text-center space-y-4 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-3xl font-black text-teal-600 dark:text-teal-400 font-mono tracking-tight">
                      {scanProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden max-w-xs mx-auto shadow-inner">
                    <div
                      className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    {t("ai_hub.analyzing_msg", "Determining CEFR levels, IPA transcriptions, and POS tags...")}
                  </p>
                </div>
              )}

              {/* Empty State */}
              {!isAnalyzingProps && hasScannedProps && propertyItems.length === 0 && (
                <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 text-zinc-400 space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    {t("ai_hub.no_properties", "No word properties found for this text.")}
                  </p>
                </div>
              )}

              {/* Results List */}
              {!isAnalyzingProps && propertyItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <button
                      onClick={toggleAllProps}
                      className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      {selectedPropIndices.size === propertyItems.length ? (
                        <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400" />
                      )}
                      {t("ai_hub.select_all", "Select All ({{count}})", { count: propertyItems.length })}
                    </button>

                    <button
                      onClick={handleSaveSelectedProps}
                      disabled={selectedPropIndices.size === 0}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t("ai_hub.add_selected_props", "Add Properties to Dictionary ({{count}})", {
                        count: selectedPropIndices.size
                      })}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {propertyItems.map((item, idx) => {
                      const isSelected = selectedPropIndices.has(idx);
                      const isEnglish = targetLanguage.toLowerCase() === "english";
                      const rawIpa = (item.ipa_us || item.ipa_uk || (item as any).ipa || "").replace(/^(US|UK):\s*/gi, "").trim();

                      return (
                        <div
                          key={idx}
                          onClick={() => togglePropIndex(idx)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-2.5 ${
                            isSelected
                              ? "bg-teal-50/40 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/50 shadow-2xs"
                              : "bg-white dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                          }`}
                        >
                          <div className="pt-0.5 shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
                            )}
                          </div>

                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="font-extrabold text-xs text-zinc-900 dark:text-zinc-100 capitalize truncate">
                                  {item.word}
                                </span>

                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {item.cefr && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/40 font-mono">
                                    {item.cefr}
                                  </span>
                                )}
                                {item.frequency && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40 font-mono">
                                    {item.frequency}
                                  </span>
                                )}
                                {item.pos && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 capitalize">
                                    {item.pos}
                                  </span>
                                )}
                              </div>
                            </div>



                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400 font-mono pt-0.5">
                              {isEnglish ? (
                                <>
                                  {item.ipa_us && <span><strong className="text-zinc-500">US:</strong> {item.ipa_us}</span>}
                                  {item.ipa_uk && <span><strong className="text-zinc-500">UK:</strong> {item.ipa_uk}</span>}
                                </>
                              ) : (
                                rawIpa && <span><strong className="text-zinc-500">IPA:</strong> {rawIpa}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI Lemmatizer */}
          {activeTab === "lemmatizer" && (
            <div className="space-y-4 font-sans">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t(
                    "ai_hub.lemmatizer_desc",
                    "Scans the target scope with deep AI linguistic analysis to extract base dictionary roots (lemmas) for all word variations."
                  )}
                </p>

                <button
                  onClick={handleScanLemmas}
                  disabled={isLemmatizing || !targetScanText}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isLemmatizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>{t("ai_hub.analyzing", "Lemmatizing...")} ({scanProgress}%)</span>
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 text-purple-300" />
                      <span>{hasScannedLemmas ? t("ai_hub.rescan_lemmas", "Rescan Lemmatizer") : t("ai_hub.run_lemmatizer", "Run AI Lemmatizer")}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Progress Bar */}
              {isLemmatizing && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                    <span>AI linguistic analysis running...</span>
                    <span>{scanProgress}%</span>
                  </div>
                </div>
              )}

              {/* Results Grid */}
              {hasScannedLemmas && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t("ai_hub.found_lemmas", "Found Roots: {{count}}", { count: lemmasData.length })}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[350px] overflow-y-auto pr-1">
                    {lemmasData.map((item, idx) => {
                      const isSelected = selectedLemmaIndices.has(idx);
                      return (
                        <div
                          key={`${item.child}-${idx}`}
                          onClick={() => {
                            const next = new Set(selectedLemmaIndices);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            setSelectedLemmaIndices(next);
                          }}
                          className={`p-3 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-teal-50/70 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800/80 shadow-2xs"
                              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1 rounded-md ${isSelected ? "text-teal-600 dark:text-teal-400" : "text-zinc-400"}`}>
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 capitalize block truncate">{item.child}</span>
                              <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium block">➔ {item.parent}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
