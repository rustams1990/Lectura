import React, { useState, useEffect } from "react";
import { ChevronLeft, Sparkles, Trophy, Loader2, Eye, EyeOff, Tv, BookOpen, Brain, Languages } from "lucide-react";
import { useUIStore } from "../store/uiStore";
import TextSettingsControls from "./TextSettingsControls";
import AudioPlayerBar from "./AudioPlayerBar";
import ReaderView from "./ReaderView";
import WordDetailContainer from "./WordDetailContainer";
import FloatingWordPopup from "./FloatingWordPopup";
import AiHubModal from "./AiHubModal";
import { Lesson, HistoryEntry, ReaderSettings, VocabItem, DEFAULT_TOOLBAR_VISIBILITY, ReaderToolbarVisibility } from "../types";
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
  } = useUIStore();
  const { t } = useTranslation();
  const { selectedElement, selectedWordRect } = useVocab();
  const { wordCardMode: storeCardMode } = useSettingsStore();
  // true when user has chosen "Calm Sheet" mode in Text Settings
  const isCalmSheet = (readerSettings.wordCardMode || storeCardMode) === "calm-sheet";
  // true when either in Focus Mode or reading a book
  const isImmersiveBook = isFocusMode || activeLesson?.lessonType === "book";
  // In Immersive Book mode, Calm Sheet floating popup is strictly used instead of right Inspector sidebar
  const effectiveCalmSheet = isCalmSheet || isImmersiveBook;
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
      if (e.key === "Escape" && isFocusMode) {
        e.preventDefault();
        setIsFocusMode(false);
        return;
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
  }, [setReaderSettings, isFocusMode, setIsFocusMode]);

  // Isolated layout width classes strictly applied inside Reader
  const readerWidthClasses = isImmersiveBook
    ? ({
        narrow: "max-w-xl mx-auto py-2 sm:py-6 lg:py-8",
        medium: "max-w-3xl mx-auto py-2 sm:py-6 lg:py-8",
        wide: "max-w-5xl mx-auto py-2 sm:py-6 lg:py-8",
      }[readerSettings.maxWidth || "medium"])
    : effectiveCalmSheet
    ? ({
        standard: "max-w-4xl mx-auto",
        wide: "max-w-6xl mx-auto",
        full: "w-full px-2 sm:px-4 lg:px-6",
      }[readerTextWidth || "standard"])
    : ({
        standard: "max-w-7xl mx-auto",
        wide: "max-w-[1560px] mx-auto",
        full: "w-full px-2 sm:px-4 lg:px-6",
      }[readerTextWidth || "standard"]);

  return (
    <>
      {/* Floating Controls for Immersive Book Mode */}
      {isImmersiveBook && activeLesson && (
        <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-40 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity duration-200">
          <button 
            type="button"
            onClick={() => {
              setActiveTab("library");
              setSelectedWord(null);
            }}
            className="px-3 py-1.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-stone-200/80 dark:border-zinc-700/80 rounded-full shadow-sm text-xs font-semibold text-stone-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
            title={t('reader.library_btn', 'Library')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{t('reader.library_btn', 'Library')}</span>
          </button>
          <TextSettingsControls settings={readerSettings} onUpdateSettings={setReaderSettings} />
        </div>
      )}

      <div className={`reader-layout-container reader-page-wrapper w-full transition-all duration-200 ${readerWidthClasses}`}>
        <div className={`grid grid-cols-1 ${effectiveCalmSheet ? 'grid-cols-1' : 'lg:grid-cols-3'} gap-6 items-start`}>
          {/* ЛЕВАЯ КОЛОНКА / ОСНОВНОЙ КОНТЕНТ: Текст урока */}
          <div className={`${effectiveCalmSheet ? 'col-span-1 w-full' : 'lg:col-span-2'} min-w-0 space-y-2.5 sm:space-y-4`}>
          {activeLesson ? (
            <>
              {/* Reader inline toolbar (visible only on PC / Desktop >= lg and when not in Immersive Book Mode) */}
              {!isImmersiveBook && (
                <div className="hidden lg:flex items-center gap-2 flex-wrap py-2 border-b border-zinc-200/40 dark:border-zinc-800/40 animate-in fade-in duration-200 w-full relative z-30">
                    {/* 1. Library (Always visible) */}
                    <button
                      onClick={() => {
                        setActiveTab("library");
                        setSelectedWord(null);
                      }}
                      className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{t('reader.library_btn', 'Library')}</span>
                    </button>

                    {/* 2. AI Hub */}
                    {toolbarVisibility.showAiHub !== false && (
                      <button
                        onClick={() => setShowAiHubModal(true)}
                        className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
                        title={t('reader.ai_hub_title', 'Open AI Hub (Phrases, slang and word analysis)')}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                        <span>{t('reader.ai_hub_btn', 'AI Hub')}</span>
                      </button>
                    )}

                    {/* 3. Translation */}
                    {toolbarVisibility.showTranslation !== false && (
                      <button
                        onClick={() =>
                          setReaderSettings((prev) => ({
                            ...prev,
                            showSentenceTranslations: !prev.showSentenceTranslations,
                          }))
                        }
                        className={`px-3.5 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
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

                    {/* 4. Focus Mode */}
                    {toolbarVisibility.showFocusMode !== false && (
                      <button
                        onClick={() => setIsFocusMode(!isFocusMode)}
                        className={`px-3.5 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          isFocusMode
                            ? "bg-teal-50/60 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-800"
                            : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        }`}
                        title={isFocusMode ? t('app.focus_exit', 'Exit Focus (Esc)') : t('reader.focus_btn', 'Focus Mode')}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isFocusMode ? t('app.focus_exit', 'Exit Focus') : t('reader.focus_btn', 'Focus Mode')}</span>
                      </button>
                    )}

                    {/* 5. Play: Pairs */}
                    {toolbarVisibility.showPlayPairs !== false && (
                      <button
                        onClick={() => setShowMatchPairsModal(true)}
                        className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-all active:scale-97 cursor-pointer"
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
                        className={`px-3.5 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
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
                    {toolbarVisibility.showVideoToggle !== false && activeLesson?.youtubeId && (
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
                        className={`px-3.5 py-1.5 border rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
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

                    {/* 8. Переключатель Badges / Book */}
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

                    {/* 9. Переключатель STANDARD / WIDE / FULL */}
                    {toolbarVisibility.showWidthToggle !== false && (
                      <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-[11px] font-bold shadow-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => setReaderTextWidth('standard')}
                          className={`transition-colors cursor-pointer ${
                            (readerTextWidth || 'standard') === 'standard'
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
                            readerTextWidth === 'wide'
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
                            readerTextWidth === 'full'
                              ? 'text-teal-600 dark:text-teal-400 font-bold'
                              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 font-medium'
                          }`}
                        >
                          FULL
                        </button>
                      </div>
                    )}

                    {/* 10. Text Settings (AA) (Always visible) */}
                    <TextSettingsControls settings={readerSettings} onUpdateSettings={setReaderSettings} />
                  </div>
                )}

              {/* Interactive Audio Player */}
              {(activeLesson.audioUrl || activeLesson.audioBase64) && (
                <AudioPlayerBar
                  onAudioUpload={handleAudioUploaded}
                  onListeningTick={handleListeningTick}
                  onAudioEnded={() => handleMediaEnded(activeLesson)}
                  readerTheme={readerSettings.readerTheme}
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
                onEditClick={() => setEditingLesson(activeLesson)}
                showOnlyUnknown={showOnlyUnknown}
                history={history}
                onUpdateHistory={handleUpdateHistory}
                hideMeta={isImmersiveBook}
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

        {/* ПРАВАЯ КОЛОНКА: Inspector sidebar — только в режиме Inspector, скрывается в Calm Sheet и Immersive Book */}
        {!effectiveCalmSheet && (
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
                <div className="empty-inspector-placeholder bg-white/60 dark:bg-zinc-900/60 rounded-2xl border border-dashed border-stone-300 dark:border-zinc-800 p-8 text-center text-stone-400">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-sm">No Word Selected</p>
                  <p className="text-xs text-stone-400 mt-1">Click on any word to view translation and definitions</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      </div>

      {/* Calm Sheet mode (desktop lg+): floating popup near the clicked word */}
      {effectiveCalmSheet && selectedWord && activeLesson && (
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
          targetEl={selectedElement}
          targetRect={selectedWordRect}
        />
      )}

      {/* Mobile/tablet (< lg): bottom sheet for both Inspector and Calm Sheet modes */}
      {selectedWord && activeLesson && (
        <div
          className="fixed inset-0 z-[70] lg:hidden flex flex-col justify-end bg-black/40 animate-in fade-in duration-200"
          onClick={() => setSelectedWord(null)}
        >
          <div
            className={`font-sans max-h-[80vh] w-full ${currentReaderTheme.cardBg} ${currentReaderTheme.text} rounded-t-3xl border-t ${currentReaderTheme.border} p-1 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center py-2 shrink-0">
              <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full animate-pulse" />
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-32px)] px-3 pb-6">
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
            </div>
          </div>
        </div>
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
