import React from "react";
import { useLesson } from "../context/LessonContext";
import { useVocab } from "../context/VocabContext";
import ReaderPanel from "./ReaderPanel";
import { HistoryEntry, ReaderSettings } from "../types";

interface ReaderViewProps {
  key?: string;
  lessonImagesMap?: Record<string, string>;
  settings?: ReaderSettings;
  onEditClick?: () => void;
  showOnlyUnknown?: boolean;
  history?: HistoryEntry[];
  onUpdateHistory?: (updatedHistory: HistoryEntry[]) => void;
}

export default function ReaderView({
  lessonImagesMap,
  settings,
  onEditClick,
  showOnlyUnknown,
  history,
  onUpdateHistory,
}: ReaderViewProps) {
  const { activeLesson, currentTime, setSeekToTime } = useLesson();
  const { vocab, selectedWord, wordLinks, handleWordClick, handleUpdateStatusDirect } = useVocab();

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
    />
  );
}
