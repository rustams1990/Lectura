import React from "react";
import { useLesson } from "../context/LessonContext";
import { useVocab } from "../context/VocabContext";
import ReaderPanel from "./ReaderPanel";
import { HistoryEntry, ReaderSettings } from "../types";
import { useUIStore } from "../store/uiStore";

interface ReaderViewProps {
  key?: string;
  lessonImagesMap?: Record<string, string>;
  settings?: ReaderSettings;
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
  onEditClick,
  showOnlyUnknown,
  history,
  onUpdateHistory,
  hideMeta = false,
  onToggleTranslations,
}: ReaderViewProps) {
  const { activeLesson, currentTime, setSeekToTime } = useLesson();
  const { vocab, selectedWord, wordLinks, handleWordClick, handleUpdateStatusDirect } = useVocab();

  // Auto-activate Focus Mode or default video mode for video lessons on mobile & tablet devices (< 1024px)
  React.useEffect(() => {
    if (!activeLesson) return;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    const isVideoLesson = !!activeLesson.youtubeId || activeLesson.lessonType === "youtube" || activeLesson.lessonType === "video" || !!activeLesson.localVideoUrl;
    const videoMode = settings?.defaultVideoViewMode ?? "focus";

    if (isMobileOrTablet && isVideoLesson) {
      let isDismissed = false;
      try {
        isDismissed = sessionStorage.getItem(`dismissed_focus_${activeLesson.id}`) === "true";
      } catch (_) {}

      if (!isDismissed) {
        if (videoMode === "focus") {
          useUIStore.getState().setIsFocusMode(true);
        } else if (videoMode === "floating") {
          useUIStore.getState().setIsFocusMode(false);
          useUIStore.getState().setShowYoutubePlayer(true);
        } else if (videoMode === "off") {
          useUIStore.getState().setIsFocusMode(false);
          useUIStore.getState().setShowYoutubePlayer(false);
        }
      }
    }
  }, [activeLesson?.id, settings?.defaultVideoViewMode]);

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
