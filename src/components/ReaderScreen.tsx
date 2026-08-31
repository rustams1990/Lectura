import React, { useState, useEffect } from "react";
import { ChevronLeft, Sparkles, Trophy, Loader2, Eye, EyeOff, Tv, BookOpen, Brain, Languages, List, Clock } from "lucide-react";
import { useUIStore } from "../store/uiStore";
import TextSettingsControls from "./TextSettingsControls";
import AudioPlayerBar from "./AudioPlayerBar";
import ReaderView from "./ReaderView";
import WordDetailContainer from "./WordDetailContainer";
import WordExplainer from "./WordExplainer";
import FloatingWordPopup from "./FloatingWordPopup";
import AiHubModal from "./AiHubModal";
import { Lesson, HistoryEntry, ReaderSettings, VocabItem, DEFAULT_TOOLBAR_VISIBILITY, ReaderToolbarVisibility, WordCardViewType, normalizeWordCardView, isVideoLesson } from "../types";
import { useTranslation } from "react-i18next";
import { useVocab } from "../context/VocabContext";
import { useSettingsStore } from "../store/settingsStore";

interface ReaderScreenProps {
  activeLesson: Lesson | null;
  activeLessonImagesMap: Record<string, string>;
  readerSettings: ReaderSettings;
  setReaderSettings: React.Dispatch<React.SetStateAction<ReaderSettings>>;
  handleAudioUploaded: (lessonId: string, base64Audio: string) => void;
  handleListeningTick: (seconds: number) => void;
  handleMediaEnded: (lesson: Lesson) => void;
  setEditingLesson: React.Dispatch<React.SetStateAction<Lesson | null>>;
  history: HistoryEntry[];
  handleUpdateHistory: (history: HistoryEntry[]) => void;
  selectedWord: string | null;
  setSelectedWord: React.Dispatch<React.SetStateAction<string | null>>;
  selectedContext: string;
  activeVocabItem: VocabItem | null | undefined;
  wordLinks: Record<string, string>;
  vocab: Record<string, VocabItem>;
  handleSaveVocabItem: (item: VocabItem) => void;
  onSaveMultipleVocabs?: (items: VocabItem[], lang?: string) => void;
  handleDeleteVocabItem: (word: string) => void;
  handleSaveWordLink: (from: string, to: string, lang?: string) => void;
  handleDeleteWordLink: (alias: string) => void;
  handleWordClick: (word: string, sentence: string) => void;
  handleOpenLesson: (lessonId: string, word: string, sentence: string) => void;
  lessons: Lesson[];
  currentReaderTheme: { cardBg: string; text: string; border: string; };
  handleDetectIdioms: () => void;
  isDetectingIdioms: boolean;
  handleAiLemmatizeText?: () => void;
  isLemmatizingText?: boolean;
}

export default function ReaderScreen({
  activeLesson,
  activeLessonImagesMap,
  readerSettings,
  setReaderSettings,
  handleAudioUploaded,
  handleListeningTick,
  handleMediaEnded,
  setEditingLesson,
  history,
  handleUpdateHistory,
  selectedWord,
  setSelectedWord,
  selectedContext,
  activeVocabItem,
  wordLinks,
  vocab,
  handleSaveVocabItem,
  onSaveMultipleVocabs,
  handleDeleteVocabItem,
  handleSaveWordLink,
  handleDeleteWordLink,
  handleWordClick,
  handleOpenLesson,
  lessons,
  currentReaderTheme,
  handleDetectIdioms,
  isDetectingIdioms,
  handleAiLemmatizeText,
  isLemmatizingText
}: ReaderScreenProps) {
  const {
    setActiveTab,
    isFocusMode,
    setIsFocusMode,
    setShowMatchPairsModal,
    showOnlyUnknown,
    setShowOnlyUnknown,
    showYoutubePlayer,
    setShowYoutubePlayer,
    readerTextWidth,
    setReaderTextWidth,
    showAiHubModal,
    setShowAiHubModal,
    bookDisplayMode,
    setBookDisplayMode,
    bookReaderView,
    setBookReaderView,
  } = useUIStore();
  const { t } = useTranslation();
  const { selectedElement, selectedWordRect } = useVocab();
  const { wordCardMode: storeCardMode } = useSettingsStore();
  const isBookLesson = activeLesson?.lessonType === "book";
  const isBookFocus = isBookLesson && (bookReaderView === "focus" || bookDisplayMode === "book");

  // Context-aware word card mode:
  // For books in Book Focus mode: defaults to "floating" (calm popup)
  // Context-aware word card mode respecting user selection across all modes
  const rawWordCardMode = isBookLesson
    ? (readerSettings.bookWordCardMode || readerSettings.wordCardMode || storeCardMode || "floating")
    : (readerSettings.wordCardMode || storeCardMode || "floating");
  const wordCardView: WordCardViewType = normalizeWordCardView(rawWordCardMode);

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-activate Focus Mode for video lessons on mobile & tablet devices (< 1024px)
  useEffect(() => {
    if (!activeLesson) return;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    const isVideo = isVideoLesson(activeLesson);

    if (isMobileOrTablet && isVideo) {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const isExplicitNonFocus = urlParams?.get("focus") === "false" || urlParams?.get("mode") === "text";

      if (!isExplicitNonFocus) {
        setIsFocusMode(true);
        setShowYoutubePlayer(true);
      }
    }
  }, [activeLesson?.id, setIsFocusMode, setShowYoutubePlayer]);

  // Desktop right sidebar is visible on PC (lg+) only in normal study mode with inspector
  const showRightSidebar = isDesktop && !isFocusMode && !isBookFocus && wordCardView === "inspector";

  // Center Modal is rendered for inspector on tablets/mobiles (< lg), and in Focus Mode (any device)
  const showCenterModalInspector = wordCardView === "inspector" && (!isDesktop || isFocusMode || isBookFocus);
  const [selectedText, setSelectedText] = useState("");
  const toolbarVisibility: ReaderToolbarVisibility = {
    ...DEFAULT_TOOLBAR_VISIBILITY,
    ...(readerSettings.toolbarVisibility || {}),
  };

  // Global hotkeys: 'T' for parallel translations, 'Escape' to exit Focus Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        if (selectedWord) {
          e.preventDefault();
          setSelectedWord(null);
          return;
        }
        if (isFocusMode) {
          e.preventDefault();
          setIsFocusMode(false);
          return;
        }
      }
      if ((e.key === "t" || e.key === "T" || e.key === "е" || e.key === "Е") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setReaderSettings((prev) => ({
          ...prev,
          showSentenceTranslations: !prev.showSentenceTranslations,
        }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setReaderSettings, isFocusMode, setIsFocusMode, selectedWord, setSelectedWord]);

  // Sync isWordPopupOpen with 350ms ghost-click shield for all word card modes
  useEffect(() => {
    if (selectedWord) {
      useUIStore.getState().setIsWordPopupOpen(true);
    } else {
      const timer = setTimeout(() => {
        useUIStore.getState().setIsWordPopupOpen(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [selectedWord]);

  const handleCloseWord = () => {
    if (typeof window !== "undefined") {
      (window as any).__lecturaLastModalClosedAt = Date.now();
    }
    setSelectedWord(null);
  };

  // Isolated layout width classes strictly applied inside Reader
  const readerWidthClasses = isBookFocus
    ? ({
        narrow: "w-full max-w-none lg:max-w-lg mx-auto py-0 lg:py-10 px-0 lg:px-6",
        medium: "w-full max-w-none lg:max-w-xl mx-auto py-0 lg:py-10 px-0 lg:px-6",
        wide: "w-full max-w-none lg:max-w-3xl mx-auto py-0 lg:py-10 px-0 lg:px-6",
      }[readerSettings.maxWidth || "medium"])
    : !showRightSidebar
    ? ({
        standard: "w-full lg:max-w-4xl mx-auto px-0",
        wide: "w-full lg:max-w-6xl mx-auto px-0",
        full: "w-full px-0 lg:px-6",
      }[readerTextWidth || "full"])
    : ({
        standard: "w-full lg:max-w-7xl mx-auto px-0",
        wide: "w-full lg:max-w-[1560px] mx-auto px-0",
        full: "w-full px-0 lg:px-6",
      }[readerTextWidth || "full"]);

  return (
    <>
      <div className={`reader-layout-container reader-page-wrapper w-full transition-all duration-200 ${readerWidthClasses}`}>
        <div className={`grid grid-cols-1 ${showRightSidebar ? 'lg:grid-cols-3' : 'grid-cols-1'} gap-6 items-start`}>
          {/* ЛЕВАЯ КОЛОНКА / ОСНОВНОЙ КОНТЕНТ: Текст урока */}
          <div className={`${showRightSidebar ? 'lg:col-span-2' : 'col-span-1 w-full'} min-w-0 space-y-2.5 sm:space-y-4`}>
          {activeLesson ? (
            <>
              {/* Reader inline toolbar (visible only on PC / Desktop >= lg and when not in Book Focus Mode) */}
              {!isBookFocus && (
                <div className="hidden lg:flex items-center justify-between gap-2 flex-wrap py-2 border-b border-zinc-200/40 dark:border-zinc-800/40 animate-in fade-in duration-200 w-full relative z-30">
                  {/* Left items group */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* 1. Library (Always visible) */}
                    <button
                      onClick={() => {
                        setActiveTab("library");
                        setSelectedWord(null);
                      }}
                      className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{t('reader.library_btn', 'Library')}</span>
                    </button>

                    {/* Chapters / Table of Contents (For books in Study mode) */}
                    {isBookLesson && (
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("toggle-book-toc"));
                        }}
                        className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                        title={t('reader.toc', 'Table of Contents')}
                      >
                        <span>📑 {t('reader.chapters', 'Chapters')}</span>
                      </button>
                    )}

                    {/* Book Mode Switcher (For books: returns to Book Mode) */}
                    {isBookLesson ? (
                      <button
                        onClick={() => {
                          setBookReaderView("focus");
                          setReaderSettings((prev) => ({
                            ...prev,
                            bookReaderViewStyle: "text",
                            bookFontFamily: "serif",
                          }));
                        }}
                        className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                        title={t('reader.switch_to_book', 'Switch to Book Mode')}
                      >
                        <span>📖 {t('reader.book_mode_short', 'Book')}</span>
                      </button>
                    ) : (
                      /* Focus Mode for non-book lessons */
                      toolbarVisibility.showFocusMode !== false && (
                        <button
                          onClick={() => setIsFocusMode(!isFocusMode)}
                          className={`px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                            isFocusMode
                              ? "bg-teal-50/60 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-800"
                              : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                          }`}
                          title={isFocusMode ? t('app.focus_exit', 'Exit Focus (Esc)') : t('reader.focus_btn', 'Focus Mode')}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isFocusMode ? t('app.focus_exit', 'Exit Focus') : t('reader.focus_btn', 'Focus Mode')}</span>
                        </button>
                      )
                    )}

                    {/* 2. AI Hub */}
                    {toolbarVisibility.showAiHub === true && (
                      <button
                        onClick={() => setShowAiHubModal(true)}
                        className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                        title={t('reader.ai_hub_title', 'Open AI Hub (Phrases, slang and word analysis)')}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                        <span>{t('reader.ai_hub_btn', 'AI Hub')}</span>
                      </button>
                    )}

                    {/* 3. Translation */}
                    {toolbarVisibility.showTranslation === true && (
                      <button
                        onClick={() =>
                          setReaderSettings((prev) => ({
                            ...prev,
                            showSentenceTranslations: !prev.showSentenceTranslations,
                          }))
                        }
                        className={`px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          readerSettings.showSentenceTranslations
                            ? "bg-teal-50/60 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-800"
                            : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        }`}
                        title={
                          readerSettings.showSentenceTranslations
                            ? t('reader.hide_translations_title', 'Hide parallel sentence translation (T)')
                            : t('reader.show_translations_title', 'Show parallel sentence translation (T)')
                        }
                      >
                        <Languages className="w-3.5 h-3.5" />
                        <span>{t('reader.translations_btn', 'Translation')}</span>
                      </button>
                    )}

                    {/* 4. Play: Pairs */}
                    {toolbarVisibility.showPlayPairs === true && (
                      <button
                        onClick={() => setShowMatchPairsModal(true)}
                        className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                        title={t('reader.pairs_btn_title', 'Game: word and translation matching')}
                      >
                        <Trophy className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                        <span>{t('reader.pairs_btn', 'Play: Pairs')}</span>
                      </button>
                    )}

                    {/* 6. Unknown Only */}
                    {toolbarVisibility.showUnknownOnly !== false && (
                      <button
                        onClick={() => setShowOnlyUnknown(!showOnlyUnknown)}
                        className={`px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          showOnlyUnknown
                            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800"
                            : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        }`}
                        title={t('reader.unknown_btn_title', 'Show only unknown words in the lesson')}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>{t('reader.unknown_btn', 'Unknown Only')}</span>
                      </button>
                    )}

                    {/* 7. Video */}
                    {toolbarVisibility.showVideoToggle !== false && !isBookLesson && activeLesson?.sourceType !== 'book' && activeLesson?.sourceType !== 'article' && activeLesson?.lessonType !== 'article' && Boolean(activeLesson?.youtubeId || (activeLesson as any)?.localVideoUrl) && (
                      <button
                        onClick={() => {
                          const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
                          if (isMobileOrTablet) {
                            if (isFocusMode && showYoutubePlayer) {
                              setShowYoutubePlayer(false);
                            } else {
                              setIsFocusMode(true);
                              setShowYoutubePlayer(true);
                            }
                          } else {
                            setShowYoutubePlayer(!showYoutubePlayer);
                          }
                        }}
                        className={`px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          (showYoutubePlayer && !isFocusMode) || (isFocusMode && showYoutubePlayer)
                            ? "bg-teal-50/60 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-600 dark:text-teal-400"
                            : "bg-teal-50/60 dark:bg-teal-950/30 border-teal-300/80 dark:border-teal-800/80 text-teal-600 dark:text-teal-400 hover:bg-teal-100/50"
                        }`}
                        title={t('reader.video_btn_title', 'Toggle YouTube Video window')}
                      >
                        <Tv className="w-3.5 h-3.5" />
                        <span>{t('reader.video_btn', 'Video')}</span>
                      </button>
                    )}

                    {/* 8. Timestamps */}
                    {toolbarVisibility.showTimestampsToggle !== false && !isBookLesson && activeLesson?.sourceType !== 'book' && activeLesson?.sourceType !== 'article' && activeLesson?.lessonType !== 'article' && Boolean(activeLesson && (activeLesson.youtubeId || activeLesson.audioUrl || activeLesson.audioBase64 || activeLesson.lessonType === "youtube" || activeLesson.lessonType === "podcast" || activeLesson.lessonType === "audio" || /\b(\d{1,2}:)?\d{1,2}:\d{2}\b/.test(activeLesson.text))) && (
                      <button
                        onClick={() =>
                          setReaderSettings((prev) => {
                            const prevVal = prev.showTimestamps === undefined ? true : (prev.showTimestamps === "false" ? false : Boolean(prev.showTimestamps));
                            return {
                              ...prev,
                              showTimestamps: !prevVal,
                            };
                          })
                        }
                        className={`px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          (readerSettings.showTimestamps === undefined ? true : (readerSettings.showTimestamps === "false" ? false : Boolean(readerSettings.showTimestamps)))
                            ? "bg-teal-50/60 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-800"
                            : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        }`}
                        title={
                          (readerSettings.showTimestamps === undefined ? true : (readerSettings.showTimestamps === "false" ? false : Boolean(readerSettings.showTimestamps)))
                            ? t('reader.hide_timestamps_title', 'Hide timestamps')
                            : t('reader.show_timestamps_title', 'Show timestamps')
                        }
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{t('reader.timestamps_btn', 'Timestamps')}</span>
                      </button>
                    )}
                  </div>

                  {/* Right items group (Display Mode, Width, Text Settings AA) */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    {/* 9. Переключатель Badges / Book */}
                    {toolbarVisibility.showDisplayMode !== false && (
                      <div className="flex items-center gap-0.5 bg-stone-100/50 dark:bg-zinc-900/55 p-0.5 h-8 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 font-sans shrink-0">
                        <button
                          type="button"
                          onClick={() => setReaderSettings((prev) => ({ ...prev, readerViewStyle: 'badges' }))}
                          className={`h-6 px-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            (!readerSettings.readerViewStyle || readerSettings.readerViewStyle === 'badges')
                              ? 'bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-300'
                          }`}
                          title={t('reader.view_badges_title', 'Badge/Pill highlight tiles view')}
                        >
                          <Brain className="w-3.5 h-3.5" />
                          <span>{t('reader.view_badges', 'Badges')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReaderSettings((prev) => ({ ...prev, readerViewStyle: 'text' }))}
                          className={`h-6 px-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            readerSettings.readerViewStyle === 'text'
                              ? 'bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-300'
                          }`}
                          title={t('reader.view_text_title', 'Clean continuous book typography view')}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{t('reader.view_text', 'Book')}</span>
                        </button>
                      </div>
                    )}

                    {/* 10. Переключатель STANDARD / WIDE / FULL */}
                    {toolbarVisibility.showWidthToggle !== false && (
                      <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-[11px] font-bold shadow-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => setReaderTextWidth('standard')}
                          className={`transition-colors cursor-pointer ${
                            (readerTextWidth || 'full') === 'standard'
                              ? 'text-teal-600 dark:text-teal-400 font-bold'
                              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 font-medium'
                          }`}
                        >
                          STANDARD
                        </button>
                        <button
                          type="button"
                          onClick={() => setReaderTextWidth('wide')}
                          className={`transition-colors cursor-pointer ${
                            (readerTextWidth || 'full') === 'wide'
                              ? 'text-teal-600 dark:text-teal-400 font-bold'
                              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 font-medium'
                          }`}
                        >
                          WIDE
                        </button>
                        <button
                          type="button"
                          onClick={() => setReaderTextWidth('full')}
                          className={`transition-colors cursor-pointer ${
                            (readerTextWidth || 'full') === 'full'
                              ? 'text-teal-600 dark:text-teal-400 font-bold'
                              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 font-medium'
                          }`}
                        >
                          FULL
                        </button>
                      </div>
                    )}

                    {/* 11. Text Settings (AA) (Always visible) */}
                    <TextSettingsControls
                      settings={readerSettings}
                      onUpdateSettings={setReaderSettings}
                      lessonType={activeLesson?.lessonType}
                      buttonClassName="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer active:scale-95"
                    />
                  </div>
                </div>
              )}

              {/* Interactive Audio Player - render ONLY when audio is genuinely present and valid */}
              {Boolean(
                (activeLesson.audioBase64 && activeLesson.audioBase64.trim() !== '') ||
                (activeLesson.audioUrl && 
                 activeLesson.audioUrl.trim() !== '' && 
                 (
                   activeLesson.lessonType === 'video' ||
                   activeLesson.lessonType === 'podcast' ||
                   activeLesson.lessonType === 'youtube' ||
                   /youtube\.com|youtu\.be/i.test(activeLesson.audioUrl) ||
                   /\.(mp3|m4a|wav|ogg|aac|flac|mp4|webm|m3u8)(\?.*)?$/i.test(activeLesson.audioUrl) ||
                   activeLesson.audioUrl.startsWith('/api/') ||
                   activeLesson.audioUrl.startsWith('blob:') ||
                   activeLesson.audioUrl.startsWith('data:audio')
                 )
                )
              ) && (
                <AudioPlayerBar
                  onAudioUpload={handleAudioUploaded}
                  onListeningTick={handleListeningTick}
                  onAudioEnded={() => handleMediaEnded(activeLesson)}
                  readerTheme={readerSettings.readerTheme || "default"}
                  showSentenceTranslations={readerSettings.showSentenceTranslations}
                  onToggleSentenceTranslations={() =>
                    setReaderSettings((prev) => ({
                      ...prev,
                      showSentenceTranslations: !prev.showSentenceTranslations,
                    }))
                  }
                  isFocusMode={isFocusMode}
                  onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
                  onOpenMatchPairs={() => setShowMatchPairsModal(true)}
                  showOnlyUnknown={showOnlyUnknown}
                  onToggleShowOnlyUnknown={() => setShowOnlyUnknown(!showOnlyUnknown)}
                />
              )}

              <ReaderView
                key={activeLesson.id}
                lessonImagesMap={activeLessonImagesMap}
                settings={readerSettings}
                onUpdateSettings={setReaderSettings}
                onEditClick={() => setEditingLesson(activeLesson)}
                showOnlyUnknown={showOnlyUnknown}
                history={history}
                onUpdateHistory={handleUpdateHistory}
                hideMeta={isBookFocus}
                onToggleTranslations={() =>
                  setReaderSettings((prev) => ({
                    ...prev,
                    showSentenceTranslations: !prev.showSentenceTranslations,
                  }))
                }
              />
            </>
          ) : (
            <div className="bg-white dark:bg-zinc-900 p-12 text-center rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-4">
              <BookOpen className="w-12 h-12 text-zinc-300 mx-auto" />
              <p className="text-zinc-500 dark:text-zinc-400">{t('reader.empty_state', 'No lessons currently chosen. Go to the Library tab to selects or import lessons!')}</p>
            </div>
          )}
        </div>

        {/* ПРАВАЯ КОЛОНКА: Inspector sidebar — только в режиме Inspector на десктопе, скрывается в Focus / Calm / Sheet */}
        {showRightSidebar && (
          <aside className="hidden lg:block lg:col-span-1 sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto pr-1 z-20">
            <div className="h-full w-full">
              {activeLesson ? (
                <WordDetailContainer
                  forceInspector={true}
                  word={selectedWord}
                  sentence={selectedContext}
                  targetLanguage={activeLesson.targetLanguage}
                  translationLanguage={activeLesson.translationLanguage}
                  existingVocab={activeVocabItem}
                  wordLinks={wordLinks}
                  vocab={vocab}
                  onSaveVocab={handleSaveVocabItem}
                  onDeleteVocab={handleDeleteVocabItem}
                  onSaveWordLink={handleSaveWordLink}
                  onDeleteWordLink={handleDeleteWordLink}
                  onClose={() => setSelectedWord(null)}
                  settings={readerSettings}
                  onSettingsChange={(patch) => setReaderSettings((prev: ReaderSettings) => ({ ...prev, ...patch }))}
                  onWordClick={handleWordClick}
                  lessonText={activeLesson?.text}
                  lessons={lessons}
                  detectedPhrases={activeLesson.detectedPhrases}
                  textLemmas={activeLesson?.text_lemmas}
                  currentLessonId={activeLesson?.id}
                  onOpenLesson={handleOpenLesson}
                />
              ) : (
                <div className="empty-inspector-placeholder bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200/70 dark:border-zinc-800 shadow-sm p-6 sm:p-8 text-center flex flex-col items-center justify-center space-y-3 min-h-[340px] text-zinc-900 dark:text-zinc-100">
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-400 dark:text-zinc-500">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="max-w-xs">
                    <h3 className="font-bold text-base text-zinc-800 dark:text-zinc-200">No Word Selected</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Click on any word to view translation and definitions
                    </p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      </div>

      {/* ── Word Card Manager (Strict conditional render: Inspector | Floating | Sheet) ── */}
      {selectedWord && activeLesson && (
        <>
          {/* 1. Center Inspector Modal: Rendered on mobile/tablets (< lg) and in Focus Mode without dark overlay or blur */}
          {showCenterModalInspector && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-none bg-transparent border-0 outline-none shadow-none">
              {/* Fully transparent invisible backdrop for clicking outside without darkening or blur */}
              <div
                className="fixed inset-0 bg-transparent pointer-events-auto border-0 outline-none shadow-none"
                onClick={handleCloseWord}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  handleCloseWord();
                }}
              />

              {/* Centered card */}
              <div
                className="relative pointer-events-auto max-w-md w-full z-10 animate-in zoom-in-95 duration-150 flex flex-col"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <WordExplainer
                  word={selectedWord}
                  sentence={selectedContext}
                  targetLanguage={activeLesson.targetLanguage}
                  translationLanguage={activeLesson.translationLanguage}
                  existingVocab={activeVocabItem}
                  wordLinks={wordLinks}
                  vocab={vocab}
                  onSaveVocab={handleSaveVocabItem}
                  onDeleteVocab={handleDeleteVocabItem}
                  onSaveWordLink={handleSaveWordLink}
                  onDeleteWordLink={handleDeleteWordLink}
                  onClose={handleCloseWord}
                  settings={readerSettings}
                  onSettingsChange={(patch) => setReaderSettings((prev: ReaderSettings) => ({ ...prev, ...patch }))}
                  onWordClick={handleWordClick}
                  lessonText={activeLesson?.text}
                  lessons={lessons}
                  detectedPhrases={activeLesson.detectedPhrases}
                  textLemmas={activeLesson?.text_lemmas}
                  currentLessonId={activeLesson?.id}
                  onOpenLesson={handleOpenLesson}
                />
              </div>
            </div>
          )}

          {/* 2. Floating Calm Sheet Popup (Preserves existing positioning near clicked word) */}
          {wordCardView === "floating" && (
            <FloatingWordPopup
              word={selectedWord}
              sentence={selectedContext}
              targetLanguage={activeLesson.targetLanguage}
              translationLanguage={activeLesson.translationLanguage}
              existingVocab={activeVocabItem}
              wordLinks={wordLinks}
              vocab={vocab}
              onSaveVocab={handleSaveVocabItem}
              onDeleteVocab={handleDeleteVocabItem}
              onSaveWordLink={handleSaveWordLink}
              onDeleteWordLink={handleDeleteWordLink}
              onClose={handleCloseWord}
              settings={readerSettings}
              onSettingsChange={(patch) => setReaderSettings((prev: ReaderSettings) => ({ ...prev, ...patch }))}
              onWordClick={handleWordClick}
              lessonText={activeLesson?.text}
              lessons={lessons}
              detectedPhrases={activeLesson.detectedPhrases}
              textLemmas={activeLesson?.text_lemmas}
              currentLessonId={activeLesson?.id}
              onOpenLesson={handleOpenLesson}
              targetEl={selectedElement}
              targetRect={selectedWordRect}
            />
          )}

          {/* 3. Docked Bottom Sheet: full-width on mobile (< sm), centered max-w-xl / max-w-2xl on tablets and PC */}
          {wordCardView === "sheet" && (
            <div
              className="fixed inset-0 z-[70] flex flex-col justify-end items-center bg-transparent pointer-events-none"
            >
              <div
                className="fixed inset-0 bg-transparent pointer-events-auto"
                onClick={handleCloseWord}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  handleCloseWord();
                }}
              />
              <div
                className={`relative pointer-events-auto font-sans max-h-[75vh] sm:max-h-[80vh] w-full max-w-xl md:max-w-2xl mx-auto ${currentReaderTheme.cardBg} ${currentReaderTheme.text} rounded-t-2xl sm:rounded-t-3xl border-t border-x ${currentReaderTheme.border} p-1 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300 z-10`}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center py-2 shrink-0">
                  <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-pulse" />
                </div>
                <div className="overflow-y-auto max-h-[calc(75vh-32px)] sm:max-h-[calc(80vh-32px)] px-3 pb-6">
                  <WordDetailContainer
                    word={selectedWord}
                    sentence={selectedContext}
                    targetLanguage={activeLesson.targetLanguage}
                    translationLanguage={activeLesson.translationLanguage}
                    existingVocab={activeVocabItem}
                    wordLinks={wordLinks}
                    vocab={vocab}
                    onSaveVocab={handleSaveVocabItem}
                    onDeleteVocab={handleDeleteVocabItem}
                    onSaveWordLink={handleSaveWordLink}
                    onDeleteWordLink={handleDeleteWordLink}
                    onClose={handleCloseWord}
                    settings={readerSettings}
                    onSettingsChange={(patch) => setReaderSettings((prev: ReaderSettings) => ({ ...prev, ...patch }))}
                    onWordClick={handleWordClick}
                    lessonText={activeLesson?.text}
                    lessons={lessons}
                    detectedPhrases={activeLesson.detectedPhrases}
                    textLemmas={activeLesson?.text_lemmas}
                    currentLessonId={activeLesson?.id}
                    onOpenLesson={handleOpenLesson}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Hub Modal */}
      <AiHubModal
        isOpen={showAiHubModal}
        onClose={() => setShowAiHubModal(false)}
        activeLesson={activeLesson}
        selectedText={selectedText}
        onSaveMultipleVocabs={onSaveMultipleVocabs || ((items) => items.forEach(handleSaveVocabItem))}
        onSaveWordLink={handleSaveWordLink}
        readerSettings={readerSettings}
        t={t}
        currentReaderTheme={currentReaderTheme}
      />
    </>
  );
}
