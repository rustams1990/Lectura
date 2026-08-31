import React, { useState, useMemo, useEffect, useRef } from "react";
import { Lesson } from "../types";
import { safeLocalStorageSetItem } from "../utils";

import { chunkSubtitlesIntoSentences, SubtitleItem } from "../utils/sentenceChunker";

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
  autoPunctuationSplit?: boolean;
  currentYoutubeTime?: number | null;
  activeWord: string | null;
  onWordClick: (word: string, root: string) => void;
}

export function useReaderPagination({
  lesson,
  isCjk,
  pageSize,
  autoPunctuationSplit = true,
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
      let cleanInputText = lesson.text;
      if (/<[\s\/]*[a-zA-Z0-9]+[^>]*>/i.test(cleanInputText)) {
        cleanInputText = cleanInputText
          .replace(/<\s*\/\s*(?:p|div|section|article|header|footer)\s*>/gi, "\n\n")
          .replace(/<\s*br\s*[\/]?>/gi, "\n")
          .replace(/<\s*h[1-2][^>]*>(.*?)<\s*\/\s*h[1-2]\s*>/gi, "\n\n## $1 ##\n\n")
          .replace(/<\s*h[3-6][^>]*>(.*?)<\s*\/\s*h[3-6]\s*>/gi, "\n\n# $1 #\n\n")
          .replace(/<\s*li[^>]*>(.*?)<\s*\/\s*li\s*>/gi, "\n• $1\n")
          .replace(/<\s*figcaption[^>]*>(.*?)<\s*\/\s*figcaption\s*>/gi, "\n[CAPTION:$1]\n")
          .replace(/<[\s\/]*[a-zA-Z0-9]+[^>]*>/gi, "")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'");
      }

      const normalizedText = cleanInputText
        .replace(/(\[(?:\[LECTURA_)?IMG(?:_REF)?:[^\]]+\])/gi, "\n\n$1\n\n")
        .replace(/(\[CAPTION:[^\]]+\])/gi, "\n\n$1\n\n")
        .replace(/\n{3,}/g, "\n\n");
      const paras = normalizedText.split(/\n+/).filter((p) => p.trim().length > 0);
      const rawParas = paras.map((p) => ({ text: p.trim(), timestamp: null }));
      
      // For books, preserve intact paragraph blocks (each <p> / paragraph is a single block)
      if (autoPunctuationSplit && lesson.lessonType !== "book") {
        const sentenceSegments: TextSegment[] = [];
        paras.forEach((p) => {
          const pTrim = p.trim();
          // Never split images, captions, or headings into sentences
          if (/^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(pTrim) || /^##?\s+/i.test(pTrim) || /^\[(?:CAPTION:?|caption)/i.test(pTrim)) {
            sentenceSegments.push({ text: pTrim, timestamp: null });
            return;
          }
          const sentences = splitIntoSentences(pTrim, isCjk);
          sentences.forEach((s) => {
            const clean = s.trim();
            if (clean) {
              sentenceSegments.push({ text: clean, timestamp: null });
            }
          });
        });
        return sentenceSegments.length > 0 ? sentenceSegments : rawParas;
      }
      return rawParas;
    }

    if (autoPunctuationSplit) {
      const subItems: SubtitleItem[] = result.map((seg, idx) => {
        const startSec = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : idx * 3;
        const nextStartSec = (idx < result.length - 1 && result[idx + 1].timestamp) 
          ? parseTimestampToSeconds(result[idx + 1].timestamp!) 
          : startSec + 3.0;
        const endSec = Math.max(startSec + 0.5, nextStartSec);
        return {
          start: startSec,
          end: endSec,
          text: seg.text
        };
      });

      const chunked = chunkSubtitlesIntoSentences(subItems);
      if (chunked.length > 0) {
        let lastTime = -1;
        return chunked.map((item) => {
          let startSec = item.start;
          if (startSec <= lastTime) {
            startSec = lastTime + 1; // Strictly ascending timestamp so playback never jumps backwards or duplicates
          }
          lastTime = startSec;

          const mins = Math.floor(startSec / 60);
          const secs = Math.floor(startSec % 60);
          const formattedTs = `${mins}:${secs.toString().padStart(2, '0')}`;
          return {
            text: item.text,
            timestamp: formattedTs
          };
        });
      }
    }

    return result;
  }, [lesson.text, autoPunctuationSplit]);

  const hasTimestamps = useMemo(() => segments.some((s) => s.timestamp !== null), [segments]);

  const { pages, tocEntries } = useMemo<{ pages: TextSegment[][]; tocEntries: Array<{ title: string; pageIndex: number; chapterIndex: number; progressPercent: number }> }>(() => {
    // Helper function to chunk paragraph segments into comfortable single-screen pages (~200-230 words per page)
    const chunkSegmentsIntoScreenPages = (segsList: TextSegment[], wordLimit = 220, isSinglePage = false): TextSegment[][] => {
      if (isSinglePage || segsList.length <= 1) {
        return [segsList];
      }

      const totalWords = segsList.reduce((acc, s) => {
        if (/^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(s.text.trim()) || /^\[(?:CAPTION:?|caption)/i.test(s.text.trim())) return acc;
        return acc + s.text.split(/\s+/).filter(Boolean).length;
      }, 0);

      // If entire section is under 180 words, always keep it on a single page!
      if (totalWords <= 180) {
        return [segsList];
      }

      const screenPages: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentWords = 0;

      for (const seg of segsList) {
        const isNonWordSeg = /^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(seg.text.trim()) || /^\[(?:CAPTION:?|caption)/i.test(seg.text.trim());
        const wordsInSeg = isNonWordSeg ? 0 : seg.text.split(/\s+/).filter(w => w.length > 0).length;

        // If a large paragraph exceeds limit, flush current chunk
        if (currentWords > 0 && (currentWords + wordsInSeg > wordLimit + 30)) {
          screenPages.push(currentChunk);
          currentChunk = [seg];
          currentWords = wordsInSeg;
        } else {
          currentChunk.push(seg);
          currentWords += wordsInSeg;
        }
      }
      if (currentChunk.length > 0) {
        screenPages.push(currentChunk);
      }
      return screenPages;
    };

    const cleanChapterTitle = (rawText: string, fallbackNum: number): string => {
      let firstLine = rawText.trim().split("\n")[0]?.trim() || "";
      const bookTitle = (lesson.title || "").trim();

      // If the line starts with book title (e.g. "Coraline I." -> "I." or "Coraline Chapter 2" -> "Chapter 2")
      if (bookTitle && firstLine.toLowerCase().startsWith(bookTitle.toLowerCase())) {
        firstLine = firstLine.substring(bookTitle.length).trim().replace(/^[-:—.\s]+/, "");
      }

      // Check if it's Roman numeral alone (e.g. "I." -> "Chapter I" or "I.")
      if (/^[IVXLCDM]+\.?$/i.test(firstLine)) {
        return `Chapter ${firstLine.replace(/\.$/, "")}`;
      }

      // Check standard heading formats
      if (/^(?:(?:Chapter|Глава|Section|Часть|Part)\s+[0-9IVXLCDM\w]+|[IVXLCDM]+\.?|PROLOGUE|EPILOGUE|ПРЕДИСЛОВИЕ|ВВЕДЕНИЕ|ЭПИЛОГ|PREFACE|INTRODUCTION|CONTENTS|DEDICATION|ПОСВЯЩЕНИЕ|ЭПИГРАФ|EPIGRAPH|TITLE|COVER)/i.test(firstLine)) {
        return firstLine;
      }
      if (firstLine.length > 0 && firstLine.length < 80 && !/[.?!]$/.test(firstLine)) {
        return firstLine;
      }
      const targetLang = (lesson.targetLanguage || "").toLowerCase();
      const isRuOrUk = targetLang.startsWith("ru") || targetLang.startsWith("uk") || targetLang === "russian" || targetLang === "ukrainian";
      return isRuOrUk ? `Глава ${fallbackNum}` : `Chapter ${fallbackNum}`;
    };

    // 1. If lesson has explicit structured chapters array (e.g. lesson.chapters or lesson.parts)
    if (Array.isArray((lesson as any).chapters) && (lesson as any).chapters.length > 0) {
      const allPages: TextSegment[][] = [];
      const entries: Array<{ title: string; pageIndex: number; chapterIndex: number; progressPercent: number }> = [];
      let hasSeenChapterOne = false;

      (lesson as any).chapters.forEach((ch: any, idx: number) => {
        const text = typeof ch === "string" ? ch : (ch.text || ch.content || "");
        const paras = text.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
        const segs = paras.map((p: string) => ({ text: p.trim(), timestamp: null }));
        if (segs.length > 0) {
          const chTitle = (typeof ch === "object" && ch.title) ? ch.title : cleanChapterTitle(text, idx + 1);
          if (/^(?:Chapter\s+1\b|Глава\s+1\b|Part\s+1\b|Section\s+1\b|^i\b|^1\b)/i.test(chTitle.trim())) {
            hasSeenChapterOne = true;
          }
          const isIntro = !hasSeenChapterOne || /^(?:cover|title|dedication|epigraph|copyright|contents|обложка|титул|посвящение|эпиграф)/i.test(chTitle.trim());
          const startPageIndex = allPages.length;
          const chPages = chunkSegmentsIntoScreenPages(segs, 220, isIntro);
          allPages.push(...chPages);
          entries.push({
            title: chTitle,
            pageIndex: startPageIndex,
            chapterIndex: idx,
            progressPercent: 0,
          });
        }
      });

      if (allPages.length > 0) {
        entries.forEach((e) => {
          e.progressPercent = Math.round(((e.pageIndex + 1) / allPages.length) * 100);
        });
        return { pages: allPages, tocEntries: entries };
      }
    }

    // 2. If text contains explicit page breaks (---PAGE--- or [PAGE_BREAK] or [PAGE]), split by chapters and chunk into screen pages!
    if (lesson.text && (lesson.text.includes("---PAGE---") || lesson.text.includes("[PAGE_BREAK]") || lesson.text.includes("[PAGE]"))) {
      const rawChapters = lesson.text.split(/\n\s*---PAGE---\s*\n|\n\s*\[PAGE(?:_BREAK)?\]\s*\n/);
      const allPages: TextSegment[][] = [];
      const entries: Array<{ title: string; pageIndex: number; chapterIndex: number; progressPercent: number }> = [];
      let chapterCounter = 0;
      let hasSeenChapterOne = false;

      rawChapters.forEach((chText) => {
        const trimmed = chText.trim();
        if (!trimmed) return;
        const paras = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
        const segs: TextSegment[] = paras.map((p) => ({ text: p.trim(), timestamp: null }));
        if (segs.length > 0) {
          chapterCounter++;
          const chTitle = cleanChapterTitle(trimmed, chapterCounter);
          if (/^(?:Chapter\s+1\b|Глава\s+1\b|Part\s+1\b|Section\s+1\b|^i\b|^1\b)/i.test(chTitle.trim())) {
            hasSeenChapterOne = true;
          }
          const isIntro = !hasSeenChapterOne || /^(?:cover|title|dedication|epigraph|copyright|contents|обложка|титул|посвящение|эпиграф)/i.test(chTitle.trim());
          const startPageIndex = allPages.length;
          const chPages = chunkSegmentsIntoScreenPages(segs, 220, isIntro);
          allPages.push(...chPages);
          entries.push({
            title: chTitle,
            pageIndex: startPageIndex,
            chapterIndex: chapterCounter - 1,
            progressPercent: 0,
          });
        }
      });

      if (allPages.length > 0) {
        entries.forEach((e) => {
          e.progressPercent = Math.round(((e.pageIndex + 1) / allPages.length) * 100);
        });
        return { pages: allPages, tocEntries: entries };
      }
    }

    // 3. For books without explicit markers, split on natural chapter headers or word chunks (never infinite scroll)
    if (lesson.lessonType === "book" && lesson.text) {
      const chapterHeaderRegex = /\n\s*\n(?=(?:Chapter|Глава|Section|Part|[IVXLCDM]+\.?)\s)/i;
      if (chapterHeaderRegex.test(lesson.text)) {
        const rawChapters = lesson.text.split(chapterHeaderRegex);
        if (rawChapters.length > 1) {
          const allPages: TextSegment[][] = [];
          const entries: Array<{ title: string; pageIndex: number; chapterIndex: number; progressPercent: number }> = [];
          let chapterCounter = 0;
          let hasSeenChapterOne = false;

          rawChapters.forEach((chText) => {
            const trimmed = chText.trim();
            if (!trimmed) return;
            const paras = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
            const segs: TextSegment[] = paras.map((p) => ({ text: p.trim(), timestamp: null }));
            if (segs.length > 0) {
              chapterCounter++;
              const chTitle = cleanChapterTitle(trimmed, chapterCounter);
              if (/^(?:Chapter\s+1\b|Глава\s+1\b|Part\s+1\b|Section\s+1\b|^i\b|^1\b)/i.test(chTitle.trim())) {
                hasSeenChapterOne = true;
              }
              const isIntro = !hasSeenChapterOne || /^(?:cover|title|dedication|epigraph|copyright|contents|обложка|титул|посвящение|эпиграф)/i.test(chTitle.trim());
              const startPageIndex = allPages.length;
              const chPages = chunkSegmentsIntoScreenPages(segs, 220, isIntro);
              allPages.push(...chPages);
              entries.push({
                title: chTitle,
                pageIndex: startPageIndex,
                chapterIndex: chapterCounter - 1,
                progressPercent: 0,
              });
            }
          });

          if (allPages.length > 1) {
            entries.forEach((e) => {
              e.progressPercent = Math.round(((e.pageIndex + 1) / allPages.length) * 100);
            });
            return { pages: allPages, tocEntries: entries };
          }
        }
      }

      // Default chunking for book mode: ~220 words per page
      const targetLang = (lesson.targetLanguage || "").toLowerCase();
      const isRuOrUk = targetLang.startsWith("ru") || targetLang.startsWith("uk") || targetLang === "russian" || targetLang === "ukrainian";
      const pageLabel = isRuOrUk ? "Страница" : "Page";
      const bookPages = chunkSegmentsIntoScreenPages(segments, 220);
      if (bookPages.length > 0) {
        const entries = bookPages.map((_, i) => ({
          title: `${pageLabel} ${i + 1}`,
          pageIndex: i,
          chapterIndex: i,
          progressPercent: Math.round(((i + 1) / bookPages.length) * 100),
        }));
        return { pages: bookPages, tocEntries: entries };
      }
    }

    let pSize = pageSize || "auto";
    if (pSize === "auto") {
      if (hasTimestamps) pSize = "p15";
      else if (isCjk) pSize = "c500";
      else pSize = "w300";
    }

    let calculatedPages: TextSegment[][] = [segments];
    if (pSize === "all") {
      calculatedPages = [segments];
    } else if (pSize.startsWith("p")) {
      const num = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      for (let i = 0; i < segments.length; i += num) {
        result.push(segments.slice(i, i + num));
      }
      calculatedPages = result.length > 0 ? result : [[]];
    } else if (pSize.startsWith("w")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentWords = 0;
      
      for (const seg of segments) {
        const isImgSeg = /^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(seg.text.trim());
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
      calculatedPages = result.length > 0 ? result : [[]];
    } else if (pSize.startsWith("s")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentSentences = 0;

      for (const seg of segments) {
        const isImgSeg = /^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(seg.text.trim());
        const sentsInSeg = isImgSeg ? 0 : splitIntoSentences(seg.text, isCjk).length;
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
      calculatedPages = result.length > 0 ? result : [[]];
    } else if (pSize.startsWith("c")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentChars = 0;

      for (const seg of segments) {
        const isImgSeg = /^\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(seg.text.trim());
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
      calculatedPages = result.length > 0 ? result : [[]];
    }

    const fallbackEntries = calculatedPages.map((_, i) => ({
      title: `Страница ${i + 1}`,
      pageIndex: i,
      chapterIndex: i,
      progressPercent: Math.round(((i + 1) / calculatedPages.length) * 100),
    }));

    return { pages: calculatedPages, tocEntries: fallbackEntries };
  }, [segments, pageSize, hasTimestamps, isCjk, lesson.text, (lesson as any).chapters, lesson.lessonType, lesson.title]);

  const parseSavedProgressPage = (raw: string | null): number => {
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number") return parsed;
      if (parsed && typeof parsed === "object" && parsed.progress !== undefined) {
        const p = parseInt(parsed.progress, 10);
        return !isNaN(p) && p >= 0 ? p : 0;
      }
      const num = parseInt(raw, 10);
      return !isNaN(num) && num >= 0 ? num : 0;
    } catch (_) {
      const num = parseInt(raw, 10);
      return !isNaN(num) && num >= 0 ? num : 0;
    }
  };

  const [currentPageIdx, setCurrentPageIdx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`vocab_progress_${lesson.id}`);
      return parseSavedProgressPage(saved);
    } catch (e) {
      console.error("Failed to load progress:", e);
      return 0;
    }
  });

  const didUserNavigateRef = useRef(false);

  const flushReadingProgress = (pageIdx: number) => {
    if (!lesson.id) return;
    const valid = Math.min(Math.max(0, pageIdx), Math.max(0, pages.length - 1));
    const updatedAt = Date.now();
    const payload = JSON.stringify({ progress: valid, updatedAt });
    safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, payload);
    try {
      const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
      const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (syncKey) headers["x-sync-key"] = syncKey;

      fetch("/api/progress", {
        method: "POST",
        headers,
        keepalive: true,
        body: JSON.stringify({
          type: "reading",
          lessonId: lesson.id,
          progress: valid,
          updatedAt
        })
      }).catch(() => {});
    } catch (_) {}
  };

  useEffect(() => {
    if (!lesson.id || pages.length === 0) return;
    const savedRaw = localStorage.getItem(`vocab_progress_${lesson.id}`);
    const savedPage = parseSavedProgressPage(savedRaw);
    if (currentPageIdx === 0 && savedPage > 0 && !didUserNavigateRef.current) return;
    flushReadingProgress(currentPageIdx);
  }, [currentPageIdx, pages.length, lesson.id]);

  useEffect(() => {
    const handleFlush = () => {
      flushReadingProgress(currentPageIdx);
    };
    window.addEventListener("visibilitychange", handleFlush);
    window.addEventListener("pagehide", handleFlush);
    return () => {
      window.removeEventListener("visibilitychange", handleFlush);
      window.removeEventListener("pagehide", handleFlush);
      flushReadingProgress(currentPageIdx);
    };
  }, [currentPageIdx, lesson.id, pages.length]);

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

  // Anchor tracking: Remember the top segment of the visible page to preserve reading position across setting/layout changes
  const lastFirstSegRef = useRef<{ text: string; timestamp: string | null } | null>(null);

  useEffect(() => {
    if (activeSegmentsForPage && activeSegmentsForPage.length > 0) {
      const first = activeSegmentsForPage[0];
      lastFirstSegRef.current = { text: first.text, timestamp: first.timestamp };
    }
  }, [clampedPageIdx, activeSegmentsForPage]);

  useEffect(() => {
    if (!lastFirstSegRef.current || pages.length === 0) return;
    const target = lastFirstSegRef.current;

    let targetPageIdx = -1;
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const match = page.some(seg => 
        (target.timestamp && seg.timestamp === target.timestamp) || 
        (target.text.length > 5 && seg.text.includes(target.text.slice(0, 20))) ||
        (seg.text.length > 5 && target.text.includes(seg.text.slice(0, 20)))
      );
      if (match) {
        targetPageIdx = pIdx;
        break;
      }
    }

    if (targetPageIdx >= 0 && targetPageIdx !== currentPageIdx) {
      didUserNavigateRef.current = true;
      setCurrentPageIdx(targetPageIdx);
    }
  }, [pages]);

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
  const pageJustChangedRef = useRef(false);

  // Reliable scroll-to-top on page change (pagination, fast jump, arrow keys, auto page advance)
  useEffect(() => {
    const pageChanged = lastPageIdxRef.current !== currentPageIdx;
    lastPageIdxRef.current = currentPageIdx;

    if (pageChanged) {
      pageJustChangedRef.current = true;
      const timer = setTimeout(() => {
        pageJustChangedRef.current = false;
      }, 600);

      // Scroll smoothly to top of the reader text
      requestAnimationFrame(() => {
        const topAnchor = document.getElementById("reader-top-anchor") || document.getElementById("reader-top");
        if (topAnchor) {
          topAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          const scrollContainer = document.querySelector(".reader-scroll-container") || window;
          scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
        }
      });

      return () => clearTimeout(timer);
    }
  }, [currentPageIdx]);

  // Audio/segment auto-scroll (only when playback advances within the current page)
  useEffect(() => {
    if (activeSegmentIndex >= 0 && !pageJustChangedRef.current) {
      const activeEl = document.getElementById(`segment-row-${activeSegmentIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [activeSegmentIndex]);

  const navigateToPage = (index: number) => {
    didUserNavigateRef.current = true;
    setCurrentPageIdx(index);
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
    navigateToPage,
    tocEntries
  };
}
