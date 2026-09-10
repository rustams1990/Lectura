import React from "react";
import { useLesson } from "../context/LessonContext";
import { useVocab } from "../context/VocabContext";
import ReaderPanel from "./ReaderPanel";
import { HistoryEntry, ReaderSettings, isVideoLesson } from "../types";
import { useUIStore } from "../store/uiStore";
import { useWordStore, extractSelectedWordText, sanitizePhraseText } from "../store/useWordStore";

interface ReaderViewProps {
  key?: string;
  lessonImagesMap?: Record<string, string>;
  settings?: ReaderSettings;
  onUpdateSettings?: (settings: ReaderSettings) => void;
  onEditClick?: () => void;
  showOnlyUnknown?: boolean;
  history?: HistoryEntry[];
  onUpdateHistory?: (updatedHistory: HistoryEntry[]) => void;
  /** Hides the title/badges/status header block (for Focus Mode) */
  hideMeta?: boolean;
  onToggleTranslations?: () => void;
  onWordClick?: (word: string, context: string, targetEl?: HTMLElement | null) => void;
  onClearSelection?: () => void;
  selectedWord?: string | null;
}

export default function ReaderView({
  lessonImagesMap,
  settings,
  onUpdateSettings,
  onEditClick,
  showOnlyUnknown,
  history,
  onUpdateHistory,
  hideMeta = false,
  onToggleTranslations,
  onWordClick: propOnWordClick,
  onClearSelection: propOnClearSelection,
  selectedWord: propSelectedWord,
}: ReaderViewProps) {
  const { activeLesson, currentTime, setSeekToTime } = useLesson();
  const { vocab, selectedWord: vocabSelectedWord, setSelectedWord, wordLinks, handleWordClick, handleUpdateStatusDirect } = useVocab();
  const storeSelectedWord = useWordStore((state) => state.selectedWord);

  const effectiveActiveWord = propSelectedWord !== undefined
    ? propSelectedWord
    : (extractSelectedWordText(storeSelectedWord) || vocabSelectedWord);

  // Auto-activate Focus Mode for video lessons on mobile & tablet devices (< 1024px)
  React.useEffect(() => {
    if (!activeLesson) return;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    const isVideo = isVideoLesson(activeLesson);

    if (isMobileOrTablet && isVideo) {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const isExplicitNonFocus = urlParams?.get("focus") === "false" || urlParams?.get("mode") === "text";

      if (!isExplicitNonFocus) {
        useUIStore.getState().setIsFocusMode(true);
        useUIStore.getState().setShowYoutubePlayer(true);
      }
    }
  }, [activeLesson?.id]);

  const handleWordSelect = (word: string, context: string, targetEl?: HTMLElement | null) => {
    const cleanWord = sanitizePhraseText(word) || word.trim();
    useWordStore.getState().setSelectedWord({
      text: word.trim(),
      cleanText: cleanWord,
      contextSentence: context,
    });
    if (propOnWordClick) {
      propOnWordClick(cleanWord, context, targetEl);
    } else {
      handleWordClick(cleanWord, context, targetEl);
    }
  };

  const handleClearSelection = () => {
    useWordStore.getState().setSelectedWord(null);
    setSelectedWord(null);
    if (propOnClearSelection) {
      propOnClearSelection();
    }
  };

  if (!activeLesson) return null;

  return (
    <ReaderPanel
      key={activeLesson.id}
      lesson={activeLesson}
      lessonImagesMap={lessonImagesMap}
      vocab={vocab}
      activeWord={effectiveActiveWord}
      wordLinks={wordLinks}
      onWordClick={handleWordSelect}
      onMarkKnown={(w) => handleUpdateStatusDirect(w, "known", activeLesson.targetLanguage)}
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      onClearSelection={handleClearSelection}
      onEditClick={onEditClick}
      currentYoutubeTime={currentTime}
      onTimestampClick={(seconds) => setSeekToTime(seconds)}
      showOnlyUnknown={showOnlyUnknown}
      history={history}
      onUpdateHistory={onUpdateHistory}
      hideMeta={hideMeta}
      onToggleTranslations={onToggleTranslations}
    />
  );
}
