import React, { useState, useMemo, useEffect, useRef } from "react";
import { Lesson } from "../types";
import { safeLocalStorageSetItem } from "../utils";

export interface TextSegment {
  text: string;
  timestamp: string | null;
}

export const splitIntoSentences = (text: string, isCjk: boolean): string[] => {
  if (isCjk) {
    const matches = text.match(/[^。！？\n]+[。！？]?|[\n]+/g);
    return matches ? matches.map((s) => s.trim()).filter(Boolean) : [text];
  } else {
    return text.split(/(?<=[.!?])\s+/).filter(Boolean);
  }
};

export const parseTimestampToSeconds = (ts: string): number => {
  const clean = ts.replace(/[\[\]]/g, "").trim();
  if (clean.toLowerCase().endsWith("s")) {
    const numOnly = clean.toLowerCase().replace("s", "");
    let seconds = 0;
    if (numOnly.includes(":")) {
      const parts = numOnly.split(":");
      if (parts.length === 2) {
        seconds = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
      }
    } else {
      if (numOnly) {
        seconds = parseInt(numOnly, 10);
      }
    }
    return Math.max(0, seconds);
  }
  
  const parts = clean.split(":");
  if (parts.length === 3) {
    const hrs = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    const secs = parseInt(parts[2], 10) || 0;
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
  }
  
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
};

interface UseReaderPaginationProps {
  lesson: Lesson;
  isCjk: boolean;
  pageSize: string;
  currentYoutubeTime?: number | null;
  activeWord: string | null;
  onWordClick: (word: string, root: string) => void;
}

export function useReaderPagination({
  lesson,
  isCjk,
  pageSize,
  currentYoutubeTime,
  activeWord,
  onWordClick
}: UseReaderPaginationProps) {
  const segments = useMemo<TextSegment[]>(() => {
    const lines = lesson.text.split("\n");
    const result: TextSegment[] = [];
    const timestampRegex = /^\[?((?:\d{1,2}:){1,2}\d{2}|\d+(?:h|m|s))\]?\s*/i;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      
      const match = trimmed.match(timestampRegex);
      if (match) {
        const ts = match[1].replace(/[\[\]]/g, "");
        const cleanText = trimmed.substring(match[0].length).trim();
        result.push({ text: cleanText, timestamp: ts });
      } else {
        result.push({ text: trimmed, timestamp: null });
      }
    });

    const hasAnyTimestamp = result.some((r) => r.timestamp !== null);
    if (!hasAnyTimestamp) {
      const paras = lesson.text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      return paras.map((p) => ({ text: p.trim(), timestamp: null }));
    }

    return result;
  }, [lesson.text]);

  const hasTimestamps = useMemo(() => segments.some((s) => s.timestamp !== null), [segments]);

  const pages = useMemo<TextSegment[][]>(() => {
    let pSize = pageSize || "auto";
    if (pSize === "auto") {
      if (hasTimestamps) pSize = "p15";
      else if (isCjk) pSize = "c500";
      else pSize = "w300";
    }

    if (pSize === "all") return [segments];
    
    if (pSize.startsWith("p")) {
      const num = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      for (let i = 0; i < segments.length; i += num) {
        result.push(segments.slice(i, i + num));
      }
      return result.length > 0 ? result : [[]];
    }
    
    if (pSize.startsWith("w")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentWords = 0;
      
      for (const seg of segments) {
        const isImgSeg = /^\[IMG(?:_REF)?:/.test(seg.text) && seg.text.endsWith("]");
        const wordsInSeg = isImgSeg ? 0 : seg.text.split(/\s+/).filter(w => w.length > 0).length;
        if (currentWords > 0 && currentWords + wordsInSeg > limit + 40) {
          result.push(currentChunk);
          currentChunk = [seg];
          currentWords = wordsInSeg;
        } else {
          currentChunk.push(seg);
          currentWords += wordsInSeg;
        }
      }
      if (currentChunk.length > 0) result.push(currentChunk);
      return result.length > 0 ? result : [[]];
    }

    if (pSize.startsWith("s")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentSentences = 0;

      for (const seg of segments) {
        const sentsInSeg = splitIntoSentences(seg.text, isCjk).length;
        if (currentSentences > 0 && currentSentences + sentsInSeg > limit) {
          result.push(currentChunk);
          currentChunk = [seg];
          currentSentences = sentsInSeg;
        } else {
          currentChunk.push(seg);
          currentSentences += sentsInSeg;
        }
      }
      if (currentChunk.length > 0) result.push(currentChunk);
      return result.length > 0 ? result : [[]];
    }

    if (pSize.startsWith("c")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentChars = 0;

      for (const seg of segments) {
        const isImgSeg = /^\[IMG(?:_REF)?:/.test(seg.text) && seg.text.endsWith("]");
        const charsInSeg = isImgSeg ? 0 : seg.text.length;
        if (currentChars > 0 && currentChars + charsInSeg > limit) {
          result.push(currentChunk);
          currentChunk = [seg];
          currentChars = charsInSeg;
        } else {
          currentChunk.push(seg);
          currentChars += charsInSeg;
        }
      }
      if (currentChunk.length > 0) result.push(currentChunk);
      return result.length > 0 ? result : [[]];
    }
    
    return [segments];
  }, [segments, pageSize, hasTimestamps, isCjk]);

  const [currentPageIdx, setCurrentPageIdx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`vocab_progress_${lesson.id}`);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {
      console.error("Failed to load progress:", e);
    }
    return 0;
  });

  const didUserNavigateRef = useRef(false);

  useEffect(() => {
    if (!lesson.id || pages.length === 0) return;
    const savedRaw = localStorage.getItem(`vocab_progress_${lesson.id}`);
    const savedPage = savedRaw !== null ? parseInt(savedRaw, 10) : 0;
    if (currentPageIdx === 0 && savedPage > 0 && !didUserNavigateRef.current) return;
    const valid = Math.min(Math.max(0, currentPageIdx), pages.length - 1);
    safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, valid.toString());
  }, [currentPageIdx, pages.length, lesson.id]);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    if (e.changedTouches.length === 0) return;

    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        if (currentPageIdx < pages.length - 1) {
          didUserNavigateRef.current = true;
          setCurrentPageIdx(prev => Math.min(pages.length - 1, prev + 1));
          document.getElementById("reader-top")?.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        if (currentPageIdx > 0) {
          didUserNavigateRef.current = true;
          setCurrentPageIdx(prev => Math.max(0, prev - 1));
          document.getElementById("reader-top")?.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.key === "ArrowLeft") {
        if (currentPageIdx > 0) {
          didUserNavigateRef.current = true;
          setCurrentPageIdx(prev => Math.max(0, prev - 1));
          document.getElementById("reader-top")?.scrollIntoView({ behavior: "smooth" });
        }
      } else if (e.key === "ArrowRight") {
        if (currentPageIdx < pages.length - 1) {
          didUserNavigateRef.current = true;
          setCurrentPageIdx(prev => Math.min(pages.length - 1, prev + 1));
          document.getElementById("reader-top")?.scrollIntoView({ behavior: "smooth" });
        }
      } else if (e.key === "Escape") {
        if (activeWord) onWordClick("", "");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPageIdx, pages.length, activeWord, onWordClick]);

  const clampedPageIdx = useMemo(() => Math.min(Math.max(0, currentPageIdx), pages.length - 1), [currentPageIdx, pages]);
  const activeSegmentsForPage = useMemo(() => pages[clampedPageIdx] || [], [pages, clampedPageIdx]);

  const activeSegmentIndex = useMemo(() => {
    if (currentYoutubeTime === null || currentYoutubeTime === undefined) return -1;
    
    const timedSegments = segments.map((s, idx) => ({
      idx,
      time: s.timestamp ? parseTimestampToSeconds(s.timestamp) : -1
    })).filter(s => s.time >= 0);
    
    if (timedSegments.length === 0) return -1;
    
    for (let i = 0; i < timedSegments.length; i++) {
      const current = timedSegments[i];
      const next = timedSegments[i + 1];
      const startTime = current.time;
      const endTime = next ? next.time : startTime + 10;
      
      if (currentYoutubeTime >= startTime && currentYoutubeTime < endTime) return current.idx;
    }
    return -1;
  }, [segments, currentYoutubeTime]);

  const lastActivePageIdxRef = useRef<number>(-1);

  useEffect(() => {
    if (activeSegmentIndex < 0 || pages.length <= 1) {
      lastActivePageIdxRef.current = -1;
      return;
    }

    let newActivePageIdx = -1;
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const hasActive = page.some((seg) => segments.indexOf(seg) === activeSegmentIndex);
      if (hasActive) {
        newActivePageIdx = pIdx;
        break;
      }
    }

    const prevActivePageIdx = lastActivePageIdxRef.current;
    lastActivePageIdxRef.current = newActivePageIdx;

    const shouldSwitch = (newActivePageIdx >= 0 && prevActivePageIdx >= 0 && newActivePageIdx !== prevActivePageIdx);

    if (shouldSwitch && newActivePageIdx !== currentPageIdx) {
      didUserNavigateRef.current = true;
      setCurrentPageIdx(newActivePageIdx);
    }
  }, [activeSegmentIndex, pages, segments, currentPageIdx]);

  const lastPageIdxRef = useRef(currentPageIdx);

  useEffect(() => {
    const pageChanged = lastPageIdxRef.current !== currentPageIdx;
    lastPageIdxRef.current = currentPageIdx;

    if (pageChanged) {
      const topEl = document.getElementById("reader-top");
      if (topEl) topEl.scrollIntoView({ behavior: "auto", block: "start" });
    }

    if (activeSegmentIndex >= 0) {
      const activeEl = document.getElementById(`segment-row-${activeSegmentIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: pageChanged ? "auto" : "smooth",
          block: "nearest",
        });
      }
    }
  }, [activeSegmentIndex, currentPageIdx]);

  const navigateToPage = (index: number) => {
    didUserNavigateRef.current = true;
    setCurrentPageIdx(index);
    document.getElementById("reader-top")?.scrollIntoView({ behavior: "smooth" });
  };

  return {
    segments,
    pages,
    currentPageIdx,
    setCurrentPageIdx,
    clampedPageIdx,
    activeSegmentsForPage,
    activeSegmentIndex,
    handleTouchStart,
    handleTouchEnd,
    hasTimestamps,
    navigateToPage
  };
}
