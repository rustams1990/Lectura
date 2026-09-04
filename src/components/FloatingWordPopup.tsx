/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import CalmLightReaderPopup from "./reader/CalmLightReaderPopup";
import WordExplainer from "./WordExplainer";
import { VocabItem, ReaderSettings, Lesson } from "../types";
import { usePopoverPosition, PopoverPosition } from "../hooks/usePopoverPosition";
import { useUIStore } from "../store/uiStore";
import { useSettingsStore } from "../store/settingsStore";

export interface FloatingWordPopupProps {
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
  onClose: () => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onWordClick?: (word: string, context: string, targetEl?: HTMLElement | null) => void;
  lessonText?: string;
  lessons?: Lesson[];
  detectedPhrases?: Record<string, { translation: string; explanation: string; type?: string }>;
  textLemmas?: Record<string, string>;
  currentLessonId?: string;
  onOpenLesson?: (lessonId: string, word: string, sentence: string) => void;
  targetEl?: HTMLElement | null;
  targetRect?: DOMRect | null;
}

export default function FloatingWordPopup(props: FloatingWordPopupProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const storeWordCardMode = useSettingsStore((s) => s.wordCardMode);
  const isBookMode = props.lessons?.find(l => l.id === props.currentLessonId)?.lessonType === "book";
  const activeWordCardMode = isBookMode
    ? (props.settings?.bookWordCardMode || "calm-sheet")
    : (props.settings?.wordCardMode || storeWordCardMode || "full-inspector");

  const isFullInspector = activeWordCardMode === "full-inspector";
  const position: PopoverPosition | null = usePopoverPosition(
    props.targetEl || null, 
    props.targetRect || null, 
    isFullInspector ? 480 : 430, 
    isFullInspector ? 480 : 360
  );
  const [actualHeight, setActualHeight] = useState<number>(isFullInspector ? 480 : 360);

  // Sync isWordPopupOpen with 350ms ghost-click shield
  useEffect(() => {
    if (props.word) {
      useUIStore.getState().setIsWordPopupOpen(true);
    }
    return () => {
      const timer = setTimeout(() => {
        useUIStore.getState().setIsWordPopupOpen(false);
      }, 350);
      return () => clearTimeout(timer);
    };
  }, [props.word]);

  // Measure actual height of popover element in DOM to accurately snap above word
  useLayoutEffect(() => {
    if (popoverRef.current) {
      const h = popoverRef.current.offsetHeight;
      if (h > 50 && h !== actualHeight) {
        setActualHeight(h);
      }
    }
  });

  useEffect(() => {
    if (!popoverRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
        if (h > 50) {
          setActualHeight(h);
        }
      }
    });
    observer.observe(popoverRef.current);
    return () => observer.disconnect();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const targetNode = e.target as Node | null;
      if (!targetNode) return;

      if (popoverRef.current && !popoverRef.current.contains(targetNode)) {
        // Check if the click was on the target element itself (so clicking word doesn't close & immediately reopen)
        if (props.targetEl && props.targetEl.contains(targetNode)) {
          return;
        }
        props.onClose();
      }
    };

    // Add with small timeout so the initial opening click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [props.onClose, props.targetEl]);

  if (!props.word) return null;

  // Fallback position if coordinates are not available (e.g. Center Top of viewport)
  const defaultTop = typeof window !== "undefined" ? window.scrollY + 120 : 120;
  const defaultLeft = typeof window !== "undefined" ? Math.max(16, (window.innerWidth - 430) / 2) : 100;

  let finalTop = position ? position.top : defaultTop;
  const finalLeft = position ? position.left : defaultLeft;

  // If placement is TOP, adjust with actual measured height for exact 8px gap above the target word
  if (position && position.placement === "top" && (props.targetEl || props.targetRect)) {
    const rect = props.targetEl ? props.targetEl.getBoundingClientRect() : props.targetRect!;
    const scrollY = typeof window !== "undefined" ? window.scrollY || window.pageYOffset || 0 : 0;
    const gap = 8;
    const screenPadding = 16;
    const computedTop = rect.top - actualHeight - gap;
    finalTop = Math.max(screenPadding, computedTop) + scrollY;
  }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className="lectura-floating-popover font-sans"
      style={{
        top: `${finalTop}px`,
        left: `${finalLeft}px`,
        width: isFullInspector ? "480px" : "430px",
        maxWidth: "calc(100vw - 24px)",
        background: "transparent",
      }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {isFullInspector ? (
        <WordExplainer {...props} />
      ) : (
        <CalmLightReaderPopup {...props} />
      )}
    </div>,
    document.body
  );
}
