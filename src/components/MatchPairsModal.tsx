/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { VocabItem, WordStatus } from "../types";
import { X, CheckCircle, RefreshCw, Trophy, AlertCircle, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MatchPairsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookWords: VocabItem[];
  onUpdateStatus?: (word: string, status: WordStatus, lang?: string) => void;
  languageName?: string;
}

interface CardItem {
  id: string;
  text: string;
  wordKey: string; // the original word to match
  type: "word" | "translation";
}

export default function MatchPairsModal({
  isOpen,
  onClose,
  bookWords,
  onUpdateStatus,
  languageName = "Spanish"
}: MatchPairsModalProps) {
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "previous">("all");
  const [round, setRound] = useState(1);
  
  // Game states
  const [selectedWordCard, setSelectedWordCard] = useState<CardItem | null>(null);
  const [selectedTransCard, setSelectedTransCard] = useState<CardItem | null>(null);
  const [matchedKeys, setMatchedKeys] = useState<string[]>([]);
  const [wrongMatch, setWrongMatch] = useState<{ wordId: string; transId: string } | null>(null);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  
  // Keep track of total session score
  const [score, setScore] = useState(0);

  // Filter bookWords based on timeFilter
  const filteredWords = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return bookWords.filter((w) => {
      const isToday = w.createdAt >= startOfToday;
      if (timeFilter === "today") return isToday;
      if (timeFilter === "previous") return !isToday;
      return true;
    });
  }, [bookWords, timeFilter]);

  // Generate cards for the current round (up to 5 pairs)
  const [currentPairs, setCurrentPairs] = useState<VocabItem[]>([]);
  
  // Shuffled cards for UI
  const [wordCards, setWordCards] = useState<CardItem[]>([]);
  const [transCards, setTransCards] = useState<CardItem[]>([]);

  // Fisher-Yates shuffle algorithm for uniform randomness
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Initialize/reshuffle cards for the round
  const setupRound = () => {
    if (filteredWords.length < 2) {
      setCurrentPairs([]);
      setWordCards([]);
      setTransCards([]);
      setShowSuccessScreen(false);
      return;
    }

    // Pick up to 5 random words from the filtered list using Fisher-Yates
    const shuffledPool = shuffleArray(filteredWords);
    const selectedPairs = shuffledPool.slice(0, Math.min(5, filteredWords.length));
    
    setCurrentPairs(selectedPairs);

    // Create cards with index-augmented unique IDs to avoid key collisions
    const words = shuffleArray(selectedPairs.map((p: VocabItem, idx) => ({
      id: `word_${p.word}_${idx}`,
      text: p.word,
      wordKey: p.word.toLowerCase(),
      type: "word" as const
    })));

    const translations = shuffleArray(selectedPairs.map((p: VocabItem, idx) => ({
      id: `trans_${p.word}_${idx}`,
      text: p.translation,
      wordKey: p.word.toLowerCase(),
      type: "translation" as const
    })));

    setWordCards(words);
    setTransCards(translations);
    setMatchedKeys([]);
    setSelectedWordCard(null);
    setSelectedTransCard(null);
    setWrongMatch(null);
    setShowSuccessScreen(false);
  };

  // Reset when filter or round changes
  useEffect(() => {
    if (isOpen) {
      setupRound();
    }
  }, [isOpen, timeFilter, round, filteredWords.length]);

  // Handle card selection
  const handleCardClick = (card: CardItem) => {
    if (wrongMatch || matchedKeys.includes(card.wordKey)) return;

    if (card.type === "word") {
      if (selectedWordCard?.id === card.id) {
        setSelectedWordCard(null); // toggle off
      } else {
        setSelectedWordCard(card);
      }
    } else {
      if (selectedTransCard?.id === card.id) {
        setSelectedTransCard(null); // toggle off
      } else {
        setSelectedTransCard(card);
      }
    }
  };

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Check match when both are selected
  useEffect(() => {
    if (selectedWordCard && selectedTransCard) {
      if (selectedWordCard.wordKey === selectedTransCard.wordKey) {
        // Correct match!
        const matchKey = selectedWordCard.wordKey;
        
        // Trigger SRS Status upgrade callback
        if (onUpdateStatus) {
          const matchedItem = currentPairs.find((p) => p.word.toLowerCase() === matchKey);
          if (matchedItem) {
            const curStatus = matchedItem.status;
            let nextStatus: WordStatus = "1";
            if (curStatus === "1") nextStatus = "2";
            else if (curStatus === "2") nextStatus = "3";
            else if (curStatus === "3") nextStatus = "4";
            else if (curStatus === "4") nextStatus = "5";
            else if (curStatus === "5") nextStatus = "known";
            onUpdateStatus(matchedItem.word, nextStatus);
          }
        }

        // Timeout to let animations sync
        setTimeout(() => {
          setMatchedKeys((prev) => {
            const next = [...prev, matchKey];
            
            // Check if all matched
            if (next.length === currentPairs.length) {
              setScore((s) => s + currentPairs.length);
              setShowSuccessScreen(true);
            }
            return next;
          });
          setSelectedWordCard(null);
          setSelectedTransCard(null);
        }, 300);
      } else {
        // Incorrect match
        setWrongMatch({
          wordId: selectedWordCard.id,
          transId: selectedTransCard.id
        });

        setTimeout(() => {
          setWrongMatch(null);
          setSelectedWordCard(null);
          setSelectedTransCard(null);
        }, 1000);
      }
    }
  }, [selectedWordCard, selectedTransCard, currentPairs, onUpdateStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs font-sans"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-pairs-modal-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-4.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-stone-50/50 dark:bg-zinc-950/20">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-xl">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 id="match-pairs-modal-title" className="font-extrabold text-sm text-zinc-800 dark:text-zinc-100 tracking-tight">
                Сопоставление пар (Match Pairs)
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">
                Изучение лексики: {languageName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-extrabold text-[10px] uppercase rounded-lg border border-zinc-200/40 dark:border-zinc-700/50">
              Очки: {score}
            </span>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-400 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="px-4.5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-stone-50/20 dark:bg-zinc-950/10 shrink-0">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50 text-[10.5px] font-bold">
            <button
              onClick={() => {
                setTimeFilter("all");
                setRound(1);
              }}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                timeFilter === "all"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              Все слова
            </button>
            <button
              onClick={() => {
                setTimeFilter("today");
                setRound(1);
              }}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                timeFilter === "today"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              За сегодня
            </button>
            <button
              onClick={() => {
                setTimeFilter("previous");
                setRound(1);
              }}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                timeFilter === "previous"
                  ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              Предыдущие дни
            </button>
          </div>

          <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
            Доступно слов: {filteredWords.length}
          </span>
        </div>

        {/* Game Area */}
        <div className="flex-1 p-5 overflow-y-auto min-h-[350px]">
          <AnimatePresence mode="wait">
            {filteredWords.length < 2 ? (
              /* Not enough words screen */
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="flex flex-col items-center justify-center text-center space-y-4 py-12 max-w-sm mx-auto h-full"
              >
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-500 rounded-full">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-zinc-700 dark:text-zinc-200">
                    Недостаточно слов
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Для игры требуется как минимум 2 слова со статусами 1–5 в выбранном фильтре. 
                    {timeFilter === "today" && " Добавьте новые слова сегодня!"}
                    {timeFilter === "previous" && " У вас нет слов, добавленных в предыдущие дни."}
                    {timeFilter === "all" && " Читайте дальше и добавляйте переводы слов, чтобы начать играть!"}
                  </p>
                </div>
              </motion.div>
            ) : showSuccessScreen ? (
              /* Round Completed Screen */
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center text-center space-y-5 py-12 max-w-sm mx-auto h-full"
              >
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full animate-bounce">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-50">
                    Отличная работа! 🎉
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                    Все пары успешно сопоставлены в этом раунде. Вы повторили {currentPairs.length} слов!
                  </p>
                </div>
                
                <div className="flex gap-3 pt-2 w-full">
                  <button
                    onClick={setupRound}
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 active:scale-97 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Следующий раунд
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Active Matching Board */
              <motion.div
                key="gameboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 h-full"
              >
                <p className="text-xs text-zinc-400 dark:text-zinc-400 text-center font-bold font-sans">
                  Выберите слово слева и его правильный перевод справа
                </p>

                {/* Scrambled grid */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  
                  {/* Left Column: Words */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest text-zinc-400 block text-center">
                      Слово
                    </span>
                    {wordCards.map((card) => {
                      const isMatched = matchedKeys.includes(card.wordKey);
                      const isSelected = selectedWordCard?.id === card.id;
                      const isWrong = wrongMatch?.wordId === card.id;

                      let cardStyle = "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300";
                      if (isMatched) {
                        cardStyle = "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 cursor-default opacity-60";
                      } else if (isWrong) {
                        cardStyle = "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 animate-shake";
                      } else if (isSelected) {
                        cardStyle = "bg-teal-50/50 dark:bg-teal-950/20 border-teal-500 text-teal-700 dark:text-teal-400 shadow-sm shadow-teal-100 dark:shadow-none";
                      }

                      return (
                        <button
                          key={card.id}
                          onClick={() => handleCardClick(card)}
                          disabled={isMatched}
                          className={`w-full py-3.5 px-4 rounded-2xl border text-center font-bold text-xs transition-all duration-200 ${cardStyle} cursor-pointer break-all flex items-center justify-center min-h-[52px]`}
                        >
                          <span>{card.text}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Column: Translations */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest text-zinc-400 block text-center">
                      Перевод
                    </span>
                    {transCards.map((card) => {
                      const isMatched = matchedKeys.includes(card.wordKey);
                      const isSelected = selectedTransCard?.id === card.id;
                      const isWrong = wrongMatch?.transId === card.id;

                      let cardStyle = "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300";
                      if (isMatched) {
                        cardStyle = "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 cursor-default opacity-60";
                      } else if (isWrong) {
                        cardStyle = "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 animate-shake";
                      } else if (isSelected) {
                        cardStyle = "bg-teal-50/50 dark:bg-teal-950/20 border-teal-500 text-teal-700 dark:text-teal-400 shadow-sm shadow-teal-100 dark:shadow-none";
                      }

                      return (
                        <button
                          key={card.id}
                          onClick={() => handleCardClick(card)}
                          disabled={isMatched}
                          className={`w-full py-3.5 px-4 rounded-2xl border text-center font-bold text-xs transition-all duration-200 ${cardStyle} cursor-pointer break-all flex items-center justify-center min-h-[52px]`}
                        >
                          <span>{card.text}</span>
                        </button>
                      );
                    })}
                  </div>

                </div>

                {/* Progress bar info */}
                <div className="pt-4 flex items-center justify-between text-[11px] font-bold text-zinc-400 dark:text-zinc-400 font-mono">
                  <span>
                    Прогресс раунда: {matchedKeys.length} / {currentPairs.length}
                  </span>
                  <button
                    onClick={setupRound}
                    title="Перемешать"
                    className="text-[10px] font-black uppercase text-teal-600 hover:text-teal-700 cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Перемешать
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-stone-50/30 dark:bg-zinc-950/10 shrink-0 text-center text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
          Повторяйте слова во время чтения для лучшего запоминания!
        </div>
      </motion.div>
    </div>
  );
}
