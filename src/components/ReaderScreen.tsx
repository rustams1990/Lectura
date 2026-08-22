import React, { useState, useEffect } from "react";
import { ChevronLeft, Sparkles, Trophy, Loader2, Eye, EyeOff, Tv, BookOpen, Brain, Languages } from "lucide-react";
import { useUIStore } from "../store/uiStore";
import TextSettingsControls from "./TextSettingsControls";
import AudioPlayerBar from "./AudioPlayerBar";
import ReaderView from "./ReaderView";
import WordExplainer from "./WordExplainer";
import AiHubModal from "./AiHubModal";
import { Lesson, HistoryEntry, ReaderSettings, VocabItem } from "../types";
import { useTranslation } from "react-i18next";

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
    layoutWidthMode,
    setLayoutWidthMode,
    showAiHubModal,
    setShowAiHubModal,
  } = useUIStore();
  const { t } = useTranslation();

  const [selectedText, setSelectedText] = useState("");

  // Global hotkey 'T' for toggling parallel sentence translations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
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
  }, [setReaderSettings]);

  return (
    <>
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Middle Main - Reader and Audio player - 8 cols on tablets and desktops */}
        <div className="col-span-12 md:col-span-8 lg:col-span-8 min-w-0 space-y-2.5 sm:space-y-4">
          {activeLesson ? (
            <>
              {/* Quiet minimal inline toolbar (hidden on mobile/tablet, shown only on desktop lg:) */}
              <div className="hidden lg:flex items-center justify-between gap-x-3 gap-y-2 pb-2.5 pt-1 border-b border-zinc-200/40 dark:border-zinc-800/40 animate-in fade-in duration-200">
                {/* Left side actions scrollable bar */}
                <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar min-w-0 flex-1 pr-1">
                  <button
                    onClick={() => {
                      setActiveTab("library");
                      setSelectedWord(null);
                    }}
                    className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 text-xs font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:shadow-xs transition-all active:scale-97 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t('reader.library_btn', 'Библиотека')}
                  </button>

                  {/* AI Hub Modal Launcher */}
                  <button
                    onClick={() => setShowAiHubModal(true)}
                    className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-bold rounded-xl transition-all active:scale-97 cursor-pointer"
                    title={t('reader.ai_hub_title', 'Открыть ИИ-Центр (Поиск выражений, сленга и анализ свойств слов)')}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('reader.ai_hub_btn', 'AI Hub')}</span>
                  </button>

                  {/* Parallel Sentence Translation Mode Toggle */}
                  <button
                    onClick={() =>
                      setReaderSettings((prev) => ({
                        ...prev,
                        showSentenceTranslations: !prev.showSentenceTranslations,
                      }))
                    }
                    className={`flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      readerSettings.showSentenceTranslations
                        ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50 shadow-xs"
                        : "bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
                    }`}
                    title={
                      readerSettings.showSentenceTranslations
                        ? t('reader.hide_translations_title', 'Скрыть параллельный перевод предложений (T)')
                        : t('reader.show_translations_title', 'Показать параллельный перевод предложений (T)')
                    }
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>{t('reader.translations_btn', 'Перевод')}</span>
                  </button>

                  <button
                    onClick={() => setIsFocusMode(true)}
                    className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-bold rounded-xl transition-all active:scale-97 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('reader.focus_btn', 'Focus Mode')}
                  </button>

                  <button
                    onClick={() => setShowMatchPairsModal(true)}
                    className="flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-bold rounded-xl transition-all active:scale-97 cursor-pointer"
                    title={t('reader.pairs_btn_title', 'Игра: сопоставление слов и перевода')}
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    {t('reader.pairs_btn', 'Игра: Пары')}
                  </button>





                  <button
                    onClick={() => setShowOnlyUnknown(!showOnlyUnknown)}
                    className={`flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      showOnlyUnknown
                        ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm"
                        : "bg-white hover:bg-zinc-55 hover:text-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
                    }`}
                    title={t('reader.unknown_btn_title', 'Показать только неизвестные слова в уроке')}
                  >
                    {showOnlyUnknown ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{t('reader.unknown_btn', 'Только неизвестные')}</span>
                  </button>

                  {activeLesson?.youtubeId && (
                    <button
                      onClick={() => setShowYoutubePlayer(!showYoutubePlayer)}
                      className={`flex items-center justify-center gap-1.5 h-8 px-2.5 shrink-0 whitespace-nowrap border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        showYoutubePlayer
                          ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50"
                          : "bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
                      }`}
                      title={t('reader.video_btn_title', 'Toggle YouTube Video window')}
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>{t('reader.video_btn', 'Видео')}</span>
                    </button>
                  )}

                  {/* Width Selector */}
                  <div className="flex items-center gap-0.5 bg-stone-100/50 dark:bg-zinc-900/55 p-0.5 h-8 rounded-xl border border-zinc-200/50 dark:border-zinc-800/60 font-sans shrink-0">
                    <button
                      type="button"
                      onClick={() => setLayoutWidthMode("standard")}
                      className={`h-6 px-1.5 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                        layoutWidthMode === "standard"
                          ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                      title={t('reader.width_standard_title', 'Default width (1280px)')}
                    >
                      {t('reader.width_standard', 'Стандарт')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayoutWidthMode("wide")}
                      className={`h-6 px-1.5 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                        layoutWidthMode === "wide"
                          ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                      title={t('reader.width_wide_title', 'Wide width (1560px)')}
                    >
                      {t('reader.width_wide', 'Широкий')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayoutWidthMode("full")}
                      className={`h-6 px-1.5 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                        layoutWidthMode === "full"
                          ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                      title={t('reader.width_full_title', 'Full screen width')}
                    >
                      {t('reader.width_full', 'Экран')}
                    </button>
                  </div>
                </div>

                {/* Right side settings buttons */}
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <TextSettingsControls settings={readerSettings} onUpdateSettings={setReaderSettings} />
                </div>
              </div>

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

        {/* Right Sidebar - Active Word Explainer definitions */}
        <div className="hidden md:block md:col-span-4 lg:col-span-4 md:sticky md:top-[24px] max-h-[calc(100vh-48px)] overflow-y-auto pr-1 z-25">
          <div className="h-full">
            {activeLesson ? (
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
              <div className="text-center p-4 text-zinc-400">{t('reader.select_first', 'Select a lesson first')}</div>
            )}
          </div>
        </div>
      </div>
      
      {/* On small screens (< md), if a word is selected, show it in a sliding bottom sheet with overlay */}
      {selectedWord && activeLesson && (
        <div 
          className="fixed inset-0 z-[70] md:hidden flex flex-col justify-end bg-black/40 animate-in fade-in duration-200"
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
