/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { VocabItem, ReaderSettings, Lesson } from "../types";
import { useSettingsStore } from "../store/settingsStore";
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
}

export default function WordDetailContainer(props: WordDetailContainerProps) {
  const { wordCardMode: storeMode } = useSettingsStore();
  const effectiveMode = props.settings?.wordCardMode || storeMode || "full-inspector";

  if (effectiveMode === "calm-sheet") {
    return <CalmSheetWordCard {...props} />;
  }

  return <WordExplainer {...props} />;
}
