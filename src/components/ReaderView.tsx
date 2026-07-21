import React from "react";
import { useLesson } from "../context/LessonContext";
import { useVocab } from "../context/VocabContext";
import ReaderPanel from "./ReaderPanel";
import { ReaderSettings } from "../types";

interface ReaderViewProps {
  key?: string;
  lessonImagesMap?: Record<string, string>;
  settings?: ReaderSettings;
  onEditClick?: () => void;
  showOnlyUnknown?: boolean;
}

export default function ReaderView({
  lessonImagesMap,
  settings,
  onEditClick,
  showOnlyUnknown,
}: ReaderViewProps) {
  const { activeLesson, currentTime, setSeekToTime } = useLesson();
  const { vocab, selectedWord, wordLinks, handleWordClick, handleUpdateStatusDirect } = useVocab();

  if (!activeLesson) return null;

  return (
    <ReaderPanel
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
    />
  );
}
