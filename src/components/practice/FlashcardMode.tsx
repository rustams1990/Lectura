import React from "react";
import { VocabItem } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, Edit3, ArrowRight, CheckCircle, BrainCircuit, RefreshCw, Star, Sparkles } from "lucide-react";

interface FlashcardModeProps {
  item: VocabItem;
  isFlipped: boolean;
  setIsFlipped: (flipped: boolean) => void;
  playSpeech: () => void;
  playingSpeech: boolean;
  onEditWord: () => void;
  onAnswer: (quality: 1 | 3 | 4 | 5) => void;
  studyDirection: "forward" | "reverse";
}

// SM-2 quality mapping
// 1 = Снова (Again) - Incorrect
// 3 = Трудно (Hard) - Correct, but hard
// 4 = Хорошо (Good) - Correct
// 5 = Легко (Easy) - Perfect response

export default function FlashcardMode({
  item,
  isFlipped,
  setIsFlipped,
  playSpeech,
  playingSpeech,
  onEditWord,
  onAnswer,
  studyDirection
}: FlashcardModeProps) {

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
  const frontLabel = studyDirection === "forward" ? "Изучаемое слово" : "Перевод";
  const backLabel = studyDirection === "forward" ? "Перевод" : "Изучаемое слово";

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
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold tracking-widest text-teal-600 dark:text-teal-400 uppercase">
                Флеш-карта
              </span>
              <div className="flex items-center gap-2">
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
                  title="Прослушать слово (TTS)"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-center py-10 flex-grow flex flex-col justify-center items-center">
              <div className="mb-6 relative">
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
                    Подсказка контекстом
                  </span>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed italic">
                    "{getClozeSentence(item.examples[0].text, item.word)}"
                  </p>
                </div>
              )}
            </div>

            <div className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest animate-pulse pt-4">
              Нажмите, чтобы перевернуть
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
            <div className="flex-grow space-y-6">
              <div className="flex justify-between items-start border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="pr-4">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block mb-1">
                    {studyDirection === "reverse" ? "Изучаемое слово" : frontLabel}
                  </span>
                  <div>
                    <h3 className="text-2xl font-black text-teal-950 dark:text-zinc-50 capitalize inline-block mr-2">
                      {studyDirection === "reverse" ? item.word : frontText}
                    </h3>
                    {studyDirection === "reverse" && item.ipa && (
                      <p className="text-xs font-mono text-zinc-500 leading-none mt-0.5">{item.ipa}</p>
                    )}
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
                    Пример использования
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
            <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-zinc-800 mt-4">
              <p className="text-[10px] text-center font-bold uppercase tracking-widest text-zinc-400 mb-2">Оцените память</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => onAnswer(1)}
                  className="px-2 py-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer"
                  title="Не вспомнил (Обучение заново)"
                >
                  <RefreshCw className="w-4 h-4 mb-1" />
                  Снова
                </button>

                <button
                  type="button"
                  onClick={() => onAnswer(3)}
                  className="px-2 py-3 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-500 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer"
                  title="Вспомнил с трудом (Интервал меньше)"
                >
                  <BrainCircuit className="w-4 h-4 mb-1" />
                  Трудно
                </button>

                <button
                  type="button"
                  onClick={() => onAnswer(4)}
                  className="px-2 py-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border border-emerald-200 dark:border-emerald-800/50"
                  title="Вспомнил нормально (Увеличить интервал)"
                >
                  <CheckCircle className="w-4 h-4 mb-1" />
                  Хорошо
                </button>

                <button
                  type="button"
                  onClick={() => onAnswer(5)}
                  className="px-2 py-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer"
                  title="Вспомнил моментально (Максимальный интервал)"
                >
                  <Sparkles className="w-4 h-4 mb-1" />
                  Легко
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
