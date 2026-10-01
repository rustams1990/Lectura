import React, { useMemo } from "react";
import { VocabItem } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, Edit3, ArrowRight, CheckCircle, BrainCircuit, RefreshCw, Star, Sparkles, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getLearningDurationInfo } from "../../utils/dateUtils";

interface FlashcardModeProps {
  item: VocabItem;
  isFlipped: boolean;
  setIsFlipped: (flipped: boolean) => void;
  playSpeech: () => void;
  playingSpeech: boolean;
  onEditWord: () => void;
  onAnswer: (quality: 1 | 3 | 4 | 5) => void;
  onMarkKnown: () => void;
  studyDirection: "forward" | "reverse";
}

// SM-2 quality mapping
// 1 = {t('practice.rate_again', 'Снова')} (Again) - Incorrect
// 3 = {t('practice.rate_hard', 'Трудно')} (Hard) - Correct, but hard
// 4 = {t('practice.rate_good', 'Хорошо')} (Good) - Correct
// 5 = {t('practice.rate_easy', 'Легко')} (Easy) - Perfect response

export default function FlashcardMode({
  item,
  isFlipped,
  setIsFlipped,
  playSpeech,
  playingSpeech,
  onEditWord,
  onAnswer,
  onMarkKnown,
  studyDirection
}: FlashcardModeProps) {
  const { t, i18n } = useTranslation();

  const timeInfo = useMemo(() => {
    return getLearningDurationInfo(item.createdAt, t, i18n.language);
  }, [item.createdAt, t, i18n.language]);

  // Helper to highlight word in context
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

  const frontText = studyDirection === "forward" ? item.word : item.translation;
  const backText = studyDirection === "forward" ? item.translation : item.word;
  const showIpa = studyDirection === "forward" && item.ipa;
  const frontLabel = studyDirection === "forward" ? t('practice.study_word', "Target Word") : t('practice.translation', "Translation");
  const backLabel = studyDirection === "forward" ? t('practice.translation', "Translation") : t('practice.study_word', "Target Word");

  return (
    <div 
      className="relative min-h-[365px] cursor-pointer" 
      onClick={() => {
        if (!isFlipped) setIsFlipped(true);
      }}
    >
      <AnimatePresence mode="wait">
        {!isFlipped ? (
          /* FRONT SIDE */
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
                    {t('practice.flashcard', 'Flashcard')}
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
                    onMarkKnown();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all cursor-pointer border border-emerald-500/20"
                  title={t('practice.mark_known_title', 'Mark as Known (Mastered)')}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{t('practice.know_word', 'Know')}</span>
                </button>
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
              </div>
            </div>

            <div className="text-center py-6 flex-grow flex flex-col justify-center items-center">
              {/* If in Translation -> Target Word mode and word has an image, display it prominently */}
              {studyDirection === "reverse" && item.imageUrl && (
                <div className="mb-4 max-h-48 max-w-full flex items-center justify-center">
                  <img
                    src={item.imageUrl.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(item.imageUrl)}` : item.imageUrl}
                    alt={item.word}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (!e.currentTarget.dataset.fallback && item.imageUrl?.startsWith("http")) {
                        e.currentTarget.dataset.fallback = "true";
                        e.currentTarget.src = item.imageUrl;
                      } else {
                        e.currentTarget.style.display = "none";
                      }
                    }}
                    className="max-h-40 sm:max-h-48 max-w-[280px] sm:max-w-xs object-contain rounded-2xl border border-teal-100 dark:border-zinc-800 shadow-md bg-white/80 dark:bg-zinc-900/80 p-1"
                  />
                </div>
              )}

              <div className="mb-4 relative">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block mb-2">
                  {frontLabel}
                </span>
                <h2 className="text-4xl font-black tracking-tight text-teal-950 dark:text-zinc-50 capitalize">
                  {frontText}
                </h2>
                {showIpa && (
                  <p className="text-sm font-mono text-zinc-500 mt-2">{item.ipa}</p>
                )}
              </div>
              
              {item.examples && item.examples.length > 0 && studyDirection === "forward" && (
                <div className="max-w-md w-full bg-zinc-50/50 dark:bg-zinc-950/30 p-4 rounded-xl border border-zinc-100/50 dark:border-zinc-800/40 opacity-70">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block mb-1">
                    {t('practice.context_hint', 'Context hint')}
                  </span>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed italic">
                    "{getClozeSentence(item.examples[0].text, item.word)}"
                  </p>
                </div>
              )}
            </div>

            <div className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest animate-pulse pt-4">
              {t('practice.click_to_flip', 'Click to flip')}
            </div>
          </motion.div>
        ) : (
          /* BACK SIDE */
          <motion.div
            key="back"
            initial={{ opacity: 0, rotateY: -90, scale: 0.95 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 90, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 flex flex-col justify-between shadow-xl h-full min-h-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-grow space-y-4">
              <div className="flex justify-between items-start border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                      {studyDirection === "reverse" ? t('practice.study_word', "Target Word") : frontLabel}
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
                  <div>
                    <h3 className="text-2xl font-black text-teal-950 dark:text-zinc-50 capitalize inline-block mr-2">
                      {studyDirection === "reverse" ? item.word : frontText}
                    </h3>
                    {studyDirection === "reverse" && item.ipa && (
                      <p className="text-xs font-mono text-zinc-500 leading-none mt-0.5">{item.ipa}</p>
                    )}
                  </div>

                  {timeInfo && (
                    <div
                      className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1"
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
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Word Image on Back side as well */}
              {item.imageUrl && (
                <div className="my-2 flex items-center justify-center">
                  <img
                    src={item.imageUrl.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(item.imageUrl)}` : item.imageUrl}
                    alt={item.word}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (!e.currentTarget.dataset.fallback && item.imageUrl?.startsWith("http")) {
                        e.currentTarget.dataset.fallback = "true";
                        e.currentTarget.src = item.imageUrl;
                      } else {
                        e.currentTarget.style.display = "none";
                      }
                    }}
                    className="max-h-32 sm:max-h-40 max-w-[260px] sm:max-w-xs object-contain rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm bg-zinc-50/80 dark:bg-zinc-950/80 p-1"
                  />
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                  {backLabel}
                </span>
                <p className="text-lg font-bold text-teal-600 dark:text-teal-400">
                  {backText}
                </p>
              </div>

              {item.examples && item.examples.length > 0 && (
                <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100/75 dark:border-zinc-800">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block mb-1">
                    {t('practice.usage_example', 'Usage example')}
                  </span>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">
                    {item.examples[0].text}
                  </p>
                  <p className="text-[11px] text-zinc-500 italic mt-1">
                    {item.examples[0].translation}
                  </p>
                </div>
              )}
            </div>

            {/* SRS Action Buttons */}
            <div className="space-y-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => onAnswer(1)}
                  className="px-2 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border border-rose-200/50 dark:border-rose-900/40"
                  title={t('practice.rate_again_title', 'Forgot / Reset learning')}
                >
                  <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-rose-200/60 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">1</span>
                  <div className="flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('practice.again', 'Again')}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onAnswer(3)}
                  className="px-2 py-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-500 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border border-amber-200/50 dark:border-amber-900/40"
                  title={t('practice.rate_hard_title', 'Remembered with effort')}
                >
                  <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-amber-200/60 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">2</span>
                  <div className="flex items-center gap-1">
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>{t('practice.hard', 'Hard')}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onAnswer(4)}
                  className="px-2 py-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border border-emerald-200 dark:border-emerald-800/50"
                  title={t('practice.rate_good_title', 'Remembered normally')}
                >
                  <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">3</span>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('practice.good', 'Good')}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onAnswer(5)}
                  className="px-2 py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border border-blue-200/50 dark:border-blue-900/40"
                  title={t('practice.rate_easy_title', 'Remembered instantly')}
                >
                  <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-blue-200/60 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">4</span>
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('practice.easy', 'Easy')}</span>
                  </div>
                </button>
              </div>

              {/* Secondary Ghost Button: Mark Known */}
              <button
                type="button"
                onClick={onMarkKnown}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 rounded-xl text-[11px] font-bold transition-all cursor-pointer border border-transparent hover:border-emerald-200/40 dark:hover:border-emerald-900/30"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500/70" />
                <span>{t('practice.mark_known_btn', 'Mastered (Known)')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
