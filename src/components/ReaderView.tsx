import React from "react";
import { useLesson } from "../context/LessonContext";
import { useVocab } from "../context/VocabContext";
import ReaderPanel from "./ReaderPanel";
import { HistoryEntry, ReaderSettings, isVideoLesson } from "../types";
import { useUIStore } from "../store/uiStore";

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
}: ReaderViewProps) {
  const { activeLesson, currentTime, setSeekToTime } = useLesson();
  const { vocab, selectedWord, setSelectedWord, wordLinks, handleWordClick, handleUpdateStatusDirect } = useVocab();

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

  if (!activeLesson) return null;

  return (
    <ReaderPanel
      key={activeLesson.id}
      lesson={activeLesson}
      lessonImagesMap={lessonImagesMap}
      vocab={vocab}
      activeWord={selectedWord}
      wordLinks={wordLinks}
      onWordClick={handleWordClick}
      onMarkKnown={(w) => handleUpdateStatusDirect(w, "known", activeLesson.targetLanguage)}
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      onClearSelection={() => setSelectedWord(null)}
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
