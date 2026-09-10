import React, { useState, useEffect } from "react";
import { Network, Loader2, Sparkles, Plus, Check, ChevronDown, ChevronUp, Layers, ArrowRight, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeJsonParse } from "../utils";

export interface WordNetSynset {
  synsetOffset: number;
  pos: string;
  posName: "noun" | "verb" | "adjective" | "adverb" | "other";
  definition: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  hypernyms: Array<{ name: string; definition?: string }>;
  derivations: string[];
}

export interface WordNetData {
  query: string;
  found: boolean;
  synsetsCount: number;
  synsets: WordNetSynset[];
  allSynonyms: string[];
  allAntonyms: string[];
}

interface WordNetSynsetsViewProps {
  word: string;
  onApplyDefinition?: (definition: string, posName?: string) => void;
  onApplySynonym?: (synonym: string) => void;
  onWordClick?: (word: string) => void;
}

const POS_BADGES: Record<string, { label: string; bg: string }> = {
  noun: { label: "n.", bg: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/60 dark:border-blue-900/50" },
  verb: { label: "v.", bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/50" },
  adjective: { label: "adj.", bg: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/60 dark:border-purple-900/50" },
  adverb: { label: "adv.", bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/50" },
  other: { label: "oth.", bg: "bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700" },
};

export default function WordNetSynsetsView({
  word,
  onApplyDefinition,
  onApplySynonym,
  onWordClick
}: WordNetSynsetsViewProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<WordNetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedDefIdx, setCopiedDefIdx] = useState<number | null>(null);
  const [selectedPosFilter, setSelectedPosFilter] = useState<string>("all");
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!word || !word.trim()) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetch(`/api/wordnet/lookup?word=${encodeURIComponent(word.trim().toLowerCase())}`)
      .then((res) => safeJsonParse(res))
      .then((json) => {
        if (isMounted) {
          if (json && json.status === "ok" && json.data) {
            setData(json.data);
          } else {
            setData(null);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setData(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [word]);

  if (loading) {
    return (
      <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-zinc-800/80 rounded-xl flex items-center justify-center gap-2 text-xs text-zinc-500 font-medium font-sans">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
        <span>{t("wordnet.loading", "Поиск в семантической базе WordNet...")}</span>
      </div>
    );
  }

  if (!data || !data.found || data.synsets.length === 0) {
    return null; // Don't take up space if word is not in English WordNet
  }

  const availablePos = Array.from(new Set(data.synsets.map((s) => s.posName)));
  const filteredSynsets = selectedPosFilter === "all" 
    ? data.synsets 
    : data.synsets.filter((s) => s.posName === selectedPosFilter);

  const handleCopyDef = (synset: WordNetSynset, idx: number) => {
    if (onApplyDefinition) {
      onApplyDefinition(synset.definition, synset.posName);
      setCopiedDefIdx(idx);
      setTimeout(() => setCopiedDefIdx(null), 2000);
    }
  };

  return (
    <div className="bg-gradient-to-br from-teal-50/50 via-zinc-50 to-emerald-50/30 dark:from-zinc-900/90 dark:via-zinc-900/60 dark:to-teal-950/20 p-3 rounded-2xl border border-teal-200/60 dark:border-teal-900/40 space-y-2.5 font-sans shadow-3xs">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Network className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
            {t("wordnet.title", "WordNet Смыслы и Сеть")}
          </span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-teal-100/70 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
            {data.synsetsCount} {data.synsetsCount === 1 ? "sense" : "senses"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
          title={isExpanded ? t("common.collapse", "Свернуть") : t("common.expand", "Развернуть")}
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* POS Filter Buttons (if word has multiple parts of speech) */}
          {availablePos.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedPosFilter("all")}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                  selectedPosFilter === "all"
                    ? "bg-teal-600 text-white shadow-3xs"
                    : "bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100"
                }`}
              >
                {t("common.all", "Все")} ({data.synsets.length})
              </button>
              {availablePos.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setSelectedPosFilter(pos)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border transition cursor-pointer capitalize ${
                    selectedPosFilter === pos
                      ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
                      : "bg-white/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border-zinc-200/60 dark:border-zinc-700/60 hover:bg-zinc-100"
                  }`}
                >
                  {pos} ({data.synsets.filter((s) => s.posName === pos).length})
                </button>
              ))}
            </div>
          )}

          {/* Synset Cards */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
            {filteredSynsets.map((synset, idx) => {
              const posBadge = POS_BADGES[synset.posName] || POS_BADGES.other;
              return (
                <div
                  key={`${synset.synsetOffset}-${idx}`}
                  className="p-2.5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-200/70 dark:border-zinc-800 space-y-1.5 text-xs shadow-3xs"
                >
                  {/* Sense definition with number & POS */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-black border shrink-0 mt-0.5 ${posBadge.bg}`}>
                        {posBadge.label} {idx + 1}
                      </span>
                      <p className="text-[11.5px] text-zinc-800 dark:text-zinc-200 font-medium leading-snug">
                        {synset.definition}
                      </p>
                    </div>

                    {/* Copy to definition button */}
                    {onApplyDefinition && (
                      <button
                        type="button"
                        onClick={() => handleCopyDef(synset, idx)}
                        className={`p-1 rounded-lg border transition cursor-pointer shrink-0 ${
                          copiedDefIdx === idx
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:text-teal-600 hover:border-teal-500"
                        }`}
                        title={t("wordnet.apply_definition", "Скопировать это определение в карточку")}
                      >
                        {copiedDefIdx === idx ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {/* Examples from WordNet */}
                  {synset.examples.length > 0 && (
                    <div className="pl-2 border-l-2 border-teal-500/40 space-y-0.5">
                      {synset.examples.map((ex, exIdx) => (
                        <p key={exIdx} className="text-[10px] italic text-zinc-500 dark:text-zinc-400">
                          "{ex}"
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Synonyms & Antonyms Chips */}
                  {(synset.synonyms.length > 0 || synset.antonyms.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-[10px]">
                      {synset.synonyms.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[9px] font-bold text-zinc-400">≈ syn:</span>
                          {synset.synonyms.map((syn) => (
                            <button
                              key={syn}
                              type="button"
                              onClick={() => {
                                if (onApplySynonym) onApplySynonym(syn);
                                if (onWordClick) onWordClick(syn);
                              }}
                              className="px-1.5 py-0.2 rounded-md bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/40 font-semibold cursor-pointer transition"
                              title={t("wordnet.click_synonym", "Клик: открыть или добавить")}
                            >
                              {syn}
                            </button>
                          ))}
                        </div>
                      )}

                      {synset.antonyms.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 ml-1">
                          <span className="text-[9px] font-bold text-rose-400">≠ ant:</span>
                          {synset.antonyms.map((ant) => (
                            <button
                              key={ant}
                              type="button"
                              onClick={() => onWordClick && onWordClick(ant)}
                              className="px-1.5 py-0.2 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/40 font-semibold cursor-pointer transition"
                            >
                              {ant}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hypernym Category ("Is a type of...") */}
                  {synset.hypernyms.length > 0 && (
                    <div className="flex items-center gap-1 text-[9.5px] text-zinc-400 pt-0.5">
                      <span className="font-semibold">⬆ {t("wordnet.category", "Категория")}:</span>
                      {synset.hypernyms.map((hyp, hIdx) => (
                        <button
                          key={hIdx}
                          type="button"
                          onClick={() => onWordClick && onWordClick(hyp.name)}
                          className="text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 font-bold underline decoration-dotted cursor-pointer"
                          title={hyp.definition || ""}
                        >
                          {hyp.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Derivations (Related forms from other parts of speech) */}
                  {synset.derivations && synset.derivations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-[9.5px] text-zinc-400 pt-0.5">
                      <span className="font-semibold">🌱 {t("wordnet.derivations", "Однокоренные")}:</span>
                      {synset.derivations.map((der, dIdx) => (
                        <button
                          key={dIdx}
                          type="button"
                          onClick={() => onWordClick && onWordClick(der)}
                          className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 font-semibold cursor-pointer transition"
                        >
                          {der}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
