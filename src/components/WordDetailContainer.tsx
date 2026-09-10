/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { VocabItem, ReaderSettings, Lesson } from "../types";
import { useSettingsStore } from "../store/settingsStore";
import { useWordStore, extractSelectedWordText } from "../store/useWordStore";
import WordExplainer from "./WordExplainer";
import CalmSheetWordCard from "./CalmSheetWordCard";

export interface WordDetailContainerProps {
  word: string | null;
  sentence: string | null;
  targetLanguage: string;
  translationLanguage: string;
  existingVocab?: VocabItem | null;
  wordLinks: Record<string, string>;
  vocab?: Record<string, VocabItem> | null;
  onSaveVocab: (vocabItem: VocabItem) => void;
  onDeleteVocab: (word: string) => void;
  onSaveWordLink: (from: string, to: string) => void;
  onDeleteWordLink: (from: string) => void;
  onClose?: () => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onWordClick?: (word: string, context: string) => void;
  lessonText?: string;
  lessons?: Lesson[];
  detectedPhrases?: Record<string, { translation: string; explanation: string; type?: string }>;
  textLemmas?: Record<string, string>;
  currentLessonId?: string;
  onOpenLesson?: (lessonId: string, word: string, sentence: string) => void;
  /** When true, always renders the full Inspector (WordExplainer) regardless of wordCardMode setting. */
  forceInspector?: boolean;
}

export default function WordDetailContainer(props: WordDetailContainerProps) {
  const { wordCardMode: storeMode } = useSettingsStore();
  const selectedWordData = useWordStore((state) => state.selectedWord);

  const storeWord = extractSelectedWordText(selectedWordData);
  const effectiveWord = props.word || storeWord || null;
  const effectiveSentence = props.sentence || selectedWordData?.contextSentence || null;

  const resolvedProps: WordDetailContainerProps = {
    ...props,
    word: effectiveWord,
    sentence: effectiveSentence,
    onClose: () => {
      useWordStore.getState().setSelectedWord(null);
      if (props.onClose) props.onClose();
    },
  };

  const effectiveMode = props.settings?.wordCardMode || storeMode || "full-inspector";

  // Desktop sidebar always shows the full Inspector, never the compact Calm Sheet popup
  if (props.forceInspector || effectiveMode !== "calm-sheet") {
    return <WordExplainer {...resolvedProps} />;
  }

  return <CalmSheetWordCard {...resolvedProps} />;
}
