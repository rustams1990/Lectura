import React, { useMemo } from "react";
import { VocabItem } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, Edit3, ArrowRight, Sparkles, AlertCircle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getLearningDurationInfo } from "../../utils/dateUtils";

interface SpellingModeProps {
  item: VocabItem;
  isFlipped: boolean;
  setIsFlipped: (flipped: boolean) => void;
  playSpeech: () => void;
  playingSpeech: boolean;
  onEditWord: () => void;
  
  spellingInput: string;
  setSpellingInput: (v: string) => void;
  spellingStatus: "unchecked" | "correct" | "incorrect" | "accent-warning";
  hasCheckedSpelling: boolean;
  
  spellingInputRef: React.RefObject<HTMLInputElement>;
  onCheckSpelling: () => void;
  onNext: () => void;
  onExclude: () => void;
  onDontKnow?: () => void;
}

export default function SpellingMode({
  item,
  isFlipped,
  setIsFlipped,
  playSpeech,
  playingSpeech,
  onEditWord,
  
  spellingInput,
  setSpellingInput,
  spellingStatus,
  hasCheckedSpelling,
  spellingInputRef,
  
  onCheckSpelling,
  onNext,
  onExclude,
  onDontKnow
}: SpellingModeProps) {
  const { t, i18n } = useTranslation();

  const timeInfo = useMemo(() => {
    return getLearningDurationInfo(item.createdAt, t, i18n.language);
  }, [item.createdAt, t, i18n.language]);

  const getClozeSentence = (sentence: string, wordToHide: string) => {
    if (!sentence || !wordToHide) return sentence;
    try {
      const escaped = wordToHide.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\w*\\b`, "gi");
      return sentence.replace(regex, "___");
    } catch {
      return sentence;
    }
  };

  return (
    <div className="relative min-h-[365px] cursor-default">
      <AnimatePresence mode="wait">
        {!isFlipped ? (
          <motion.div
            key="front"
            initial={{ opacity: 0, rotateY: -90, scale: 0.95 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 90, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="bg-gradient-to-br from-teal-50 to-white dark:from-zinc-900 dark:to-zinc-800 border border-teal-100/65 dark:border-zinc-800 rounded-3xl p-8 flex flex-col justify-between shadow-md h-full min-h-[400px]"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex flex-col items-start gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold tracking-widest text-teal-600 dark:text-teal-400 uppercase">
                    {t('practice.spelling_check', 'Spelling Check')}
                  </span>
                  {item.status && ["1", "2", "3", "4", "5"].includes(item.status) && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono border ${
                        item.status === "1" ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50" :
                        item.status === "2" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50" :
                        item.status === "3" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50" :
                        item.status === "4" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50" :
                        "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50"
                      }`}
                      title={t('practice.status_tooltip', 'Learning stage: {{status}}', { status: item.status })}
                    >
                      {t('practice.stage', 'Stage {{status}}', { status: item.status })}
                    </span>
                  )}
                </div>

                {timeInfo && (
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
                    title={timeInfo.fullTitle}
                  >
                    <Clock className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{timeInfo.durationLabel}</span>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="text-zinc-400 dark:text-zinc-500">{timeInfo.dateLabel}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playSpeech();
                  }}
                  disabled={playingSpeech}
                  className={`p-1.5 rounded-lg bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 dark:text-teal-400 transition-all cursor-pointer ${
                    playingSpeech ? "animate-pulse" : ""
                  }`}
                  title={t('practice.listen_word', 'Listen to word (TTS)')}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditWord();
                  }}
                  className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-all cursor-pointer"
                  title={t('practice.edit_word', 'Edit word')}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-center py-6 flex-grow flex flex-col justify-center items-center space-y-4">
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                    {t('practice.translation_label', 'Translation')}
                </span>
                <h2 className="text-2xl font-black text-teal-950 dark:text-zinc-50 capitalize">
                  {item.translation}
                </h2>
              </div>

              {item.examples && item.examples.length > 0 && (
                <div className="max-w-md w-full bg-zinc-50/50 dark:bg-zinc-950/30 p-3 rounded-xl border border-zinc-100/50 dark:border-zinc-800/40">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block mb-1">
                    {t('practice.context_clue', 'Context clue')}
                  </span>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed italic">
                    "{getClozeSentence(item.examples[0].text, item.word)}"
                  </p>
                </div>
              )}

              <div className="w-full max-w-sm space-y-2 pt-2">
                <div className="relative">
                  <input
                    ref={spellingInputRef}
                    type="text"
                    value={spellingInput}
                    onChange={(e) => setSpellingInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onCheckSpelling();
                      }
                    }}
                    placeholder={t('practice.write_word', 'Type the word...')}
                    className={`w-full px-5 py-4 bg-white dark:bg-zinc-900 border-2 rounded-2xl text-center text-lg font-bold shadow-sm outline-none transition-all ${
                      hasCheckedSpelling
                        ? spellingStatus === "correct"
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                          : spellingStatus === "accent-warning"
                          ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
                          : "border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20"
                        : "border-zinc-200 dark:border-zinc-800 focus:border-teal-500 dark:focus:border-teal-500 text-zinc-800 dark:text-zinc-200"
                    }`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck="false"
                  />
                  {hasCheckedSpelling && spellingStatus === "accent-warning" && (
                    <div className="absolute -bottom-8 left-0 right-0 flex justify-center">
                      <span className="bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm">
                        <AlertCircle className="w-3 h-3" />
                        {t('practice.accent_error', 'Accent / Diacritic error')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
              {onDontKnow && !hasCheckedSpelling && (
                <button
                  type="button"
                  onClick={onDontKnow}
                  className="px-4 py-3.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 transition-all cursor-pointer shrink-0"
                  title={t('practice.dont_know_title', 'I don\'t know / Show answer')}
                >
                  {t('practice.dont_know_btn', 'Don\'t know')}
                </button>
              )}
              <button
                type="button"
                onClick={hasCheckedSpelling ? onNext : onCheckSpelling}
                className={`flex-1 py-3.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  hasCheckedSpelling
                    ? "bg-teal-600 hover:bg-teal-500 text-white"
                    : spellingInput.trim()
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:scale-[1.02]"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                }`}
                disabled={!hasCheckedSpelling && !spellingInput.trim()}
              >
                {hasCheckedSpelling ? (
                  <>
                    {t('practice.next_btn', 'Next')} <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  t('practice.check_btn', 'Check')
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="back"
            initial={{ opacity: 0, rotateY: -90, scale: 0.95 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 90, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 flex flex-col justify-between shadow-xl h-full min-h-[400px]"
          >
            <div className="flex-grow space-y-6">
              <div className="flex justify-between items-start border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="pr-4">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block mb-1">
                    {t('practice.correct_spelling', 'Correct spelling')}
                  </span>
                  <div>
                    <h3 className="text-2xl font-black text-teal-950 dark:text-zinc-50 capitalize inline-block mr-2">
                      {item.word}
                    </h3>
                    {item.ipa && <p className="text-xs font-mono text-zinc-500 leading-none mt-0.5">{item.ipa}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSpeech();
                    }}
                    disabled={playingSpeech}
                    className={`p-1.5 rounded-lg bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 dark:text-teal-400 transition-all cursor-pointer ${
                      playingSpeech ? "animate-pulse" : ""
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                  {t('practice.translation', 'Translation')}
                </span>
                <p className="text-lg font-bold text-teal-600 dark:text-teal-400">
                  {item.translation}
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onNext}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                {t('practice.next_btn', 'Next')} <ArrowRight className="w-4 h-4" />
              </button>
              
              <button
                type="button"
                onClick={onExclude}
                className="w-full px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t('practice.exclude_spelling_btn', 'Know for sure (Exclude from spelling) 🌟')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
