/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Lesson, VocabItem, WordStatus, ReaderSettings } from "../types";
import { formatTime, normalizeContraction, safeLocalStorageSetItem } from "../utils";
import { Sparkles, Loader2, Volume2, Check, BookOpen, Eye, EyeOff, List, AlignLeft, RotateCcw } from "lucide-react";
import { getDifficultyBadgeStyles } from "./LibraryHome";

interface ReaderPanelProps {
  key?: string;
  lesson: Lesson;
  lessonImagesMap?: Record<string, string>;
  vocab: Record<string, VocabItem>;
  activeWord: string | null;
  wordLinks: Record<string, string>;
  onWordClick: (word: string, context: string) => void;
  onMarkKnown: (word: string) => void;
  settings?: ReaderSettings;
  onEditClick?: () => void;
  currentYoutubeTime?: number | null;
  onTimestampClick?: (seconds: number) => void;
  showOnlyUnknown?: boolean;
}

function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const clean = ts.trim().toLowerCase();
  
  if (clean.endsWith("s") || clean.endsWith("m") || clean.endsWith("h")) {
    let seconds = 0;
    const hMatch = clean.match(/(\d+)h/);
    const mMatch = clean.match(/(\d+)m/);
    const sMatch = clean.match(/(\d+)s/);
    
    if (hMatch) seconds += parseInt(hMatch[1], 10) * 3600;
    if (mMatch) seconds += parseInt(mMatch[1], 10) * 60;
    if (sMatch) seconds += parseInt(sMatch[1], 10);
    
    if (seconds === 0) {
      const numOnly = clean.replace(/[^\d]/g, "");
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
}

interface TextSegment {
  text: string;
  timestamp: string | null;
}

const fontSizeMap = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

const lineHeightMap = {
  normal: "leading-normal",
  relaxed: "leading-relaxed",
  loose: "leading-loose",
  "extra-loose": "leading-[2.2]",
};

const fontFamilyMap = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

const themeMap = {
  default: "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-100 dark:border-zinc-800/80",
  cream: "bg-[#fcf8f2] text-[#3b2b1a] border-[#f3e9d8]",
  sepia: "bg-[#f5ebd0] text-[#432d16] border-[#ebdcb3]",
  slate: "bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-800",
  charcoal: "bg-zinc-950 text-zinc-100 border-zinc-900",
};

const widthMap = {
  narrow: "max-w-xl mx-auto",
  medium: "max-w-3xl mx-auto",
  wide: "max-w-5xl mx-auto",
};

function getZoomScale(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 1;
  const zoomStr = document.documentElement?.style.zoom || document.body?.style.zoom;
  if (zoomStr) {
    const val = parseFloat(zoomStr);
    if (!isNaN(val)) return val / 100;
  }
  const saved = localStorage.getItem("vocab_clone_interface_zoom");
  if (saved) {
    const val = parseInt(saved, 10);
    if (!isNaN(val)) return val / 100;
  }
  return 1;
}

const getPhraseTypeLabel = (type?: string) => {
  if (!type) return "Идиома";
  switch (type.toLowerCase()) {
    case "phrasal_verb": return "Фразовый глагол";
    case "idiom": return "Идиома";
    case "saying": return "Пословица / поговорка";
    case "set_expression": return "Устойчивое выражение";
    default: return "Идиома";
  }
};

const TooltipPortal = ({
  children,
  x,
  y,
  position
}: {
  children: React.ReactNode;
  x: number;
  y: number;
  position: "above" | "below";
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Zoom factor correction if browser zoom is used
    const scale = getZoomScale();
    const zoomedX = x / scale;
    const zoomedY = y / scale;
    const zoomedWidth = width / scale;
    const zoomedHeight = height / scale;

    const viewportWidth = window.innerWidth / scale;
    const viewportHeight = window.innerHeight / scale;

    const margin = 12;
    
    let left = zoomedX - zoomedWidth / 2;
    let right = zoomedX + zoomedWidth / 2;
    
    if (left < margin) {
      left = margin;
    } else if (right > viewportWidth - margin) {
      left = viewportWidth - margin - zoomedWidth;
    }
    
    let top = zoomedY;
    if (position === "above") {
      top = zoomedY - zoomedHeight - 4; // minor adjustment to sit nicely above
    } else {
      top = zoomedY + 4; // minor adjustment to sit nicely below
    }
    
    // Clamp vertical position so it doesn't overflow top of page
    if (top < margin) {
      top = margin;
    } else if (top + zoomedHeight > viewportHeight - margin) {
      top = viewportHeight - margin - zoomedHeight;
    }

    setCoords({ left, top });
  }, [x, y, position]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        minWidth: "220px",
        maxWidth: "min(520px, 90vw)",
        width: "max-content",
        zIndex: 99999,
      }}
      className="pointer-events-none p-3 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-xl shadow-xl flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100 text-left"
    >
      {children}
    </div>,
    document.body
  );
};

const normalizeTranslationSemicolons = (text: string): string => {
  if (!text) return "";
  // 1. Replace semicolons that separate different part of speech definitions with double newlines (\n\n)
  let result = text.replace(/;\s*(\((?:noun|verb|adj|adjective|adv|adverb|pronoun|prep|conjunction|interjection|participle|article)[^)]*\))/gi, "\n\n$1");
  // 2. Replace remaining internal semicolons within a single meaning block with a space
  result = result.replace(/;\s*/g, " ");
  return result.trim();
};

export default function ReaderPanel({
  lesson,
  lessonImagesMap,
  vocab,
  activeWord,
  wordLinks,
  onWordClick,
  onMarkKnown,
  settings,
  onEditClick,
  currentYoutubeTime,
  onTimestampClick,
  showOnlyUnknown = false,
}: ReaderPanelProps) {
  const [unknownViewMode, setUnknownViewMode] = useState<"text" | "list">("text");
  const [unknownSearchQuery, setUnknownSearchQuery] = useState("");
  const [unknownSortMode, setUnknownSortMode] = useState<"alpha" | "appearance">("alpha");

  const textForSearch = useMemo(
    () => lesson.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " "),
    [lesson.text]
  );
  // Tooltip/popup states for hover over patterns/timestamps
  const [hoveredWordId, setHoveredWordId] = useState<string | null>(null);

  // Popup states for word hover translations & tags (Requirement 3)
  const [hoveredWordObj, setHoveredWordObj] = useState<{
    word: string;
    parentWord?: string;
    translation: string;
    tags?: string[];
    grammar?: string;
    imageUrl?: string | null;
    x: number;
    y: number;
    position?: "above" | "below";
    phraseText?: string;
    phraseTranslation?: string;
    phraseStatus?: WordStatus;
    phraseTags?: string[];
    detectedPhraseText?: string;
    detectedPhraseTranslation?: string;
    detectedPhraseExplanation?: string;
    detectedPhraseType?: string;
  } | null>(null);

  // Check if text is mostly East Asian (at least 30% CJK characters)
  const isCjk = useMemo(() => {
    if (!textForSearch) return false;
    const cjkChars = (textForSearch.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const totalChars = textForSearch.replace(/\s/g, '').length;
    return totalChars > 0 && (cjkChars / totalChars) > 0.3;
  }, [textForSearch]);

  // Helper to split paragraph text into individual sentences
  const splitIntoSentences = (text: string): string[] => {
    if (isCjk) {
      // Split on CJK terminators like 。！？ and filter out empty strings
      const matches = text.match(/[^。！？\n]+[。！？]?|[\n]+/g);
      return matches ? matches.map((s) => s.trim()).filter(Boolean) : [text];
    } else {
      // Standard split on .!? followed by whitespace, keeping delimiters
      return text.split(/(?<=[.!?])\s+/).filter(Boolean);
    }
  };

  // Parse lines to detect timestamps and compile clean TextSegments
  const segments = useMemo<TextSegment[]>(() => {
    const lines = lesson.text.split("\n");
    const result: TextSegment[] = [];
    // Matches patterns like "15s", "123s", "0:15", "11:20:45", "1:01", "1:07", "[15s]", "[1:15]"
    const timestampRegex = /^\[?((?:\d{1,2}:){1,2}\d{2}|\d+(?:h|m|s))\]?\s*/i;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      
      const match = trimmed.match(timestampRegex);
      if (match) {
        const ts = match[1].replace(/[\[\]]/g, ""); // clean brackets
        const cleanText = trimmed.substring(match[0].length).trim();
        result.push({
          text: cleanText,
          timestamp: ts,
        });
      } else {
        result.push({
          text: trimmed,
          timestamp: null,
        });
      }
    });

    const hasAnyTimestamp = result.some((r) => r.timestamp !== null);
    if (!hasAnyTimestamp) {
      // Split standard prose by double line-break so we preserve neat large books style
      const paras = lesson.text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      return paras.map((p) => ({
        text: p.trim(),
        timestamp: null,
      }));
    }

    return result;
  }, [lesson.text]);

  const hasTimestamps = useMemo(() => {
    return segments.some((s) => s.timestamp !== null);
  }, [segments]);

  const activeSettings = useMemo<Required<ReaderSettings>>(() => {
    return {
      fontSize: settings?.fontSize || "lg",
      lineHeight: settings?.lineHeight || "loose",
      fontFamily: settings?.fontFamily || "sans",
      readerTheme: settings?.readerTheme || "default",
      maxWidth: settings?.maxWidth || "wide",
      pageSize: settings?.pageSize || "auto",
      sentenceSpacing: settings?.sentenceSpacing || "normal",
      segmentSpacing: settings?.segmentSpacing || "normal",
      ttsEngine: settings?.ttsEngine || "browser",
      wordHighlight: settings?.wordHighlight !== false,
      idiomHighlightStyle: settings?.idiomHighlightStyle || "badge",
    };
  }, [settings]);

  // Compute pages based on segments list
  const pages = useMemo<TextSegment[][]>(() => {
    let pSize = activeSettings.pageSize || "auto";
    if (pSize === "auto") {
      if (hasTimestamps) {
        pSize = "p15";
      } else if (isCjk) {
        pSize = "c500";
      } else {
        pSize = "w300";
      }
    }

    if (pSize === "all") {
      return [segments];
    }
    
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
      if (currentChunk.length > 0) {
        result.push(currentChunk);
      }
      return result.length > 0 ? result : [[]];
    }

    if (pSize.startsWith("s")) {
      const limit = parseInt(pSize.substring(1), 10);
      const result: TextSegment[][] = [];
      let currentChunk: TextSegment[] = [];
      let currentSentences = 0;

      for (const seg of segments) {
        const sentsInSeg = splitIntoSentences(seg.text).length;
        if (currentSentences > 0 && currentSentences + sentsInSeg > limit) {
          result.push(currentChunk);
          currentChunk = [seg];
          currentSentences = sentsInSeg;
        } else {
          currentChunk.push(seg);
          currentSentences += sentsInSeg;
        }
      }
      if (currentChunk.length > 0) {
        result.push(currentChunk);
      }
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
      if (currentChunk.length > 0) {
        result.push(currentChunk);
      }
      return result.length > 0 ? result : [[]];
    }
    
    return [segments];
  }, [segments, activeSettings.pageSize, hasTimestamps, isCjk]);

  // Track page navigation states initialized directly from localstorage
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`vocab_progress_${lesson.id}`);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load progress:", e);
    }
    return 0;
  });

  // Track if the user manually navigated (to distinguish from initial auto-page detection)
  const didUserNavigateRef = useRef(false);

  // Save progress ONLY when the user has actually navigated or the page is non-zero
  useEffect(() => {
    if (!lesson.id || pages.length === 0) return;
    // Never overwrite a saved non-zero progress with 0 on initial mount
    const savedRaw = localStorage.getItem(`vocab_progress_${lesson.id}`);
    const savedPage = savedRaw !== null ? parseInt(savedRaw, 10) : 0;
    if (currentPageIdx === 0 && savedPage > 0 && !didUserNavigateRef.current) {
      // Still initializing — don't overwrite real saved value with 0
      return;
    }
    const valid = Math.min(Math.max(0, currentPageIdx), pages.length - 1);
    safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, valid.toString());
  }, [currentPageIdx, pages.length, lesson.id]);

  // Reset hover states on page or lesson change
  useEffect(() => {
    setHoveredWordObj(null);
    setHoveredWordId(null);
  }, [currentPageIdx, lesson.id]);

  // Dismiss tooltips on any scroll event in the window (e.g. scroll of the reader panel)
  useEffect(() => {
    const handleGlobalScroll = () => {
      setHoveredWordObj(null);
      setHoveredWordId(null);
    };

    window.addEventListener("scroll", handleGlobalScroll, true);
    return () => {
      window.removeEventListener("scroll", handleGlobalScroll, true);
    };
  }, []);

  const clampedPageIdx = useMemo(() => {
    return Math.min(Math.max(0, currentPageIdx), pages.length - 1);
  }, [currentPageIdx, pages]);

  const activeSegmentsForPage = useMemo(() => {
    return pages[clampedPageIdx] || [];
  }, [pages, clampedPageIdx]);

  // Find which segment index globally matches the current youtube video time
  const activeSegmentIndex = useMemo(() => {
    if (currentYoutubeTime === null || currentYoutubeTime === undefined) return -1;
    
    // Find all segments with parsed timestamp values
    const timedSegments = segments.map((s, idx) => ({
      idx,
      time: s.timestamp ? parseTimestampToSeconds(s.timestamp) : -1
    })).filter(s => s.time >= 0);
    
    if (timedSegments.length === 0) return -1;
    
    // Find which interval currentYoutubeTime falls into
    for (let i = 0; i < timedSegments.length; i++) {
      const current = timedSegments[i];
      const next = timedSegments[i + 1];
      
      const startTime = current.time;
      // If there is a next timestamp, the segment runs until that timestamp
      // If not, it runs for a reasonable buffer (e.g. 10 seconds)
      const endTime = next ? next.time : startTime + 10;
      
      if (currentYoutubeTime >= startTime && currentYoutubeTime < endTime) {
        return current.idx;
      }
    }
    
    return -1;
  }, [segments, currentYoutubeTime]);

  // Track last active page index for playback page boundary crossings
  const lastActivePageIdxRef = useRef<number>(-1);

  // Automatically switch page ONLY when playback crosses page boundaries
  useEffect(() => {
    if (activeSegmentIndex < 0 || pages.length <= 1) {
      lastActivePageIdxRef.current = -1;
      return;
    }

    let newActivePageIdx = -1;
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const hasActive = page.some((seg) => {
        const globalIdx = segments.indexOf(seg);
        return globalIdx === activeSegmentIndex;
      });
      if (hasActive) {
        newActivePageIdx = pIdx;
        break;
      }
    }

    const prevActivePageIdx = lastActivePageIdxRef.current;
    lastActivePageIdxRef.current = newActivePageIdx;

    // Only switch page automatically if the playback itself crossed a page boundary while playing
    const shouldSwitch = (newActivePageIdx >= 0 && prevActivePageIdx >= 0 && newActivePageIdx !== prevActivePageIdx);

    if (shouldSwitch && newActivePageIdx !== currentPageIdx) {
      didUserNavigateRef.current = true;
      setCurrentPageIdx(newActivePageIdx);
    }
  }, [activeSegmentIndex, pages, segments, currentPageIdx]);

  const lastPageIdxRef = useRef(currentPageIdx);

  // Scroll active segment or page into view
  useEffect(() => {
    const pageChanged = lastPageIdxRef.current !== currentPageIdx;
    lastPageIdxRef.current = currentPageIdx;

    if (pageChanged) {
      // If page changed, scroll to the top of the reader panel instantly
      const topEl = document.getElementById("reader-top");
      if (topEl) {
        topEl.scrollIntoView({ behavior: "auto", block: "start" });
      }
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

  // Compute active saved multi-word phrases/idioms in active target language inside this text
  const activePhrasesInLesson = useMemo(() => {
    const lang = lesson.targetLanguage.toLowerCase();
    const lessonTextLower = textForSearch.toLowerCase();
    
    return Object.keys(vocab)
      .filter((key) => {
        const parts = key.split("_");
        if (parts.length <= 1) return false;
        
        // Ensure language matched
        if (parts[0] !== lang) return false;
        
        const originalWord = key.substring(parts[0].length + 1);
        
        // Multi-word phrase containing a space, and present in lesson text
        return originalWord.includes(" ") && lessonTextLower.includes(originalWord);
      })
      .map((key) => vocab[key]);
  }, [vocab, textForSearch, lesson.targetLanguage]);

  // Precompute tokens and phrase matches for the active segments on this page
  const { allPageTokens, pagePhraseMatches, pageDetectedMatches, sentenceTokenRanges } = useMemo(() => {
    // 1. Tokenize everything on the page first, keeping track of segment index (pIdx) and sentence index (sIdx)
    const allPageTokens: {
      raw: string;
      clean: string;
      isWord: boolean;
      segIdx: number;
      sIdx: number;
      localIdx: number;
      globalIdx: number;
    }[] = [];

    const sentenceTokenRanges: {
      segIdx: number;
      sIdx: number;
      startIdx: number;
      endIdx: number;
    }[] = [];

    let globalIdx = 0;

    activeSegmentsForPage.forEach((seg, segIdx) => {
      const sentenceStrings = (activeSettings.sentenceSpacing && activeSettings.sentenceSpacing !== "normal")
        ? splitIntoSentences(seg.text)
        : [seg.text];

      sentenceStrings.forEach((sentText, sIdx) => {
        let tokens: { raw: string; clean: string; isWord: boolean }[] = [];
        if (isCjk) {
          tokens = sentText.split("").map((char) => {
            const isPunct = /[.,\/#!$%\^&\*;:{}=\-_`~()"?、。！？」『』 \t\n]/g.test(char);
            const isDigit = /^\d+$/.test(char);
            return {
              raw: char,
              clean: (isPunct || isDigit) ? "" : char,
              isWord: !isPunct && !isDigit,
            };
          });
        } else {
          const parts = sentText.split(/(\s+)/);
          tokens = parts.map((part) => {
            if (/^\s+$/.test(part)) {
              return { raw: part, clean: "", isWord: false };
            }
            const clean = part.replace(/^[^\w\p{L}]+|[^\w\p{L}]+$/gu, "");
            const isNumericOrTimestamp = (str: string): boolean => {
              if (/\d/.test(str)) {
                if (/\d+:\d+/.test(str)) return true;
                if (/^\d+([.,%/-]\d+)*%?$/.test(str)) return true;
                if (/^\d+[a-zA-Z]+$/.test(str)) return true;
                if (!/\p{L}/u.test(str)) return true;
              }
              return false;
            };
            const isNumeric = /^\d+$/.test(clean) || isNumericOrTimestamp(clean);
            return {
              raw: part,
              clean: clean.toLowerCase(),
              isWord: clean.length > 0 && !isNumeric,
            };
          });
        }

        const startIdx = globalIdx;
        tokens.forEach((t, localIdx) => {
          allPageTokens.push({
            ...t,
            segIdx: segIdx,
            sIdx: sIdx,
            localIdx: localIdx,
            globalIdx: globalIdx,
          });
          globalIdx++;
        });
        const endIdx = globalIdx - 1;
        sentenceTokenRanges.push({
          segIdx: segIdx,
          sIdx: sIdx,
          startIdx,
          endIdx,
        });
      });
    });

    // 2. Perform phrase matching on the flat list of word tokens
    const wordTokens = allPageTokens.filter(t => t.isWord);
    const pagePhraseMatches: { phrase: string; vocabItem: VocabItem; tokenIndices: number[] }[] = [];
    const pageDetectedMatches: { phrase: string; translation: string; explanation: string; type?: string; tokenIndices: number[] }[] = [];
    const lang = lesson.targetLanguage.toLowerCase();
    const detectedPhrases = lesson.detectedPhrases || {};

    let wIdx = 0;
    while (wIdx < wordTokens.length) {
      let matched = false;
      
      // Try matching user-saved phrase first (takes priority)
      for (let len = Math.min(10, wordTokens.length - wIdx); len >= 2; len--) {
        const candidateWords = wordTokens.slice(wIdx, wIdx + len).map((t) => t.clean);
        const candidatePhrase = candidateWords.join(" ");
        const langKey = `${lang}_${candidatePhrase}`;
        const lq = vocab[langKey] || vocab[candidatePhrase];
        if (lq) {
          const matchedTokenIndices = wordTokens.slice(wIdx, wIdx + len).map((t) => t.globalIdx);
          pagePhraseMatches.push({
            phrase: candidatePhrase,
            vocabItem: lq,
            tokenIndices: matchedTokenIndices,
          });
          wIdx += len;
          matched = true;
          break;
        }
      }
      
      if (matched) continue;
      
      // Try matching auto-detected phrase
      for (let len = Math.min(10, wordTokens.length - wIdx); len >= 2; len--) {
        const candidateWords = wordTokens.slice(wIdx, wIdx + len).map((t) => t.clean);
        const candidatePhrase = candidateWords.join(" ");
        const cleanCandidate = candidatePhrase.toLowerCase();
        const details = detectedPhrases[cleanCandidate] || detectedPhrases[candidatePhrase];
        if (details) {
          const matchedTokenIndices = wordTokens.slice(wIdx, wIdx + len).map((t) => t.globalIdx);
          pageDetectedMatches.push({
            phrase: candidatePhrase,
            translation: details.translation,
            explanation: details.explanation,
            type: details.type,
            tokenIndices: matchedTokenIndices,
          });
          wIdx += len;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        wIdx++;
      }
    }

    return { allPageTokens, pagePhraseMatches, pageDetectedMatches, sentenceTokenRanges };
  }, [activeSegmentsForPage, vocab, lesson, isCjk, activeSettings.sentenceSpacing]);

  // Handle multi-word text drag selection (phrases & idioms)
  const handleTextSelection = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection) return;
    const selectedText = selection.toString().replace(/\s+/g, " ").trim();
    
    // Validate bounds
    if (!selectedText) return;
    if (selectedText.length <= 1 && !isCjk) return;
    if (selectedText.length > 1000) return;
    
    // For spaced languages, single-word selections are handled directly by token click.
    // If it's a multi-word drag, let's catch it!
    const wordCount = selectedText.split(/\s+/).filter(Boolean).length;
    if (!isCjk && wordCount <= 1) {
      return; 
    }

    // Attempt to locate containing sentence paragraph for rich context relationship
    let associatedSentence = "";
    const anchorNode = selection.anchorNode;
    if (anchorNode) {
      let currentEl: HTMLElement | null = anchorNode.parentElement;
      while (
        currentEl && 
        !currentEl.classList.contains("paragraph-block") && 
        currentEl.tagName !== "P" &&
        !currentEl.classList.contains("prose")
      ) {
        currentEl = currentEl.parentElement;
      }
      if (currentEl) {
        const fullPara = currentEl.textContent || "";
        const sentences = splitIntoSentences(fullPara);
        associatedSentence = sentences.find((s) => s.includes(selectedText)) || fullPara;
      }
    }

    onWordClick(selectedText, associatedSentence.trim() || selectedText);
  };

  // Resolve lemma or alias base words, e.g. zorros -> zorro
  const resolveWord = (w: string) => {
    const lower = w.toLowerCase();
    const lang = lesson.targetLanguage.toLowerCase();
    const langKey = `${lang}_${lower}`;
    const resolved = wordLinks[langKey] || lower;
    return resolved.replace(/^[a-zA-Z]+_/, "");
  };

  // Handle single word styling/status checking
  const getWordInfo = (cleanWord: string) => {
    const key = resolveWord(cleanWord);
    const lang = lesson.targetLanguage.toLowerCase();
    const langKey = `${lang}_${key}`;
    const lq = vocab[langKey];
    if (lq) {
      return lq.status;
    }

    // Inherit status from base word if contraction/possessive base is known
    const normalized = normalizeContraction(key, lang);
    if (normalized !== key) {
      const normLangKey = `${lang}_${normalized}`;
      const normLq = vocab[normLangKey];
      if (normLq) {
        return normLq.status;
      }
    }

    return "new"; // defaults to blue 'new'
  };

  const speakWord = (word: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      
      const targetLang = lesson.targetLanguage.toLowerCase();
      let locale = "en-US";
      if (targetLang.includes("span")) locale = "es-ES";
      else if (targetLang.includes("fren") || targetLang.includes("fran")) locale = "fr-FR";
      else if (targetLang.includes("germ") || targetLang.includes("deut")) locale = "de-DE";
      else if (targetLang.includes("ital")) locale = "it-IT";
      else if (targetLang.includes("russ")) locale = "ru-RU";
      else if (targetLang.includes("chin") || targetLang.includes("zh")) locale = "zh-CN";
      else if (targetLang.includes("ja")) locale = "ja-JP";
      else if (targetLang.includes("ko")) locale = "ko-KR";
      else if (targetLang.includes("por")) locale = "pt-PT";
      
      utterance.lang = locale;
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => v.lang.toLowerCase().replace("_", "-").startsWith(locale.split("-")[0]));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const allUnknownWords = useMemo(() => {
    const cleanText = lesson.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ");
    
    let candidates: string[] = [];
    if (isCjk) {
      candidates = cleanText.split("").filter(char => {
        const isPunct = /[.,\/#!$%\^&\*;:{}=\-_`~()"?、。！？」『』 \t\n]/g.test(char);
        const isDigit = /^\d+$/.test(char);
        return !isPunct && !isDigit;
      });
    } else {
      const words = cleanText.match(/[\p{L}\p{M}'’]+/gu) || [];
      candidates = words.map(w => w.toLowerCase());
    }

    const uniqueCandidates = Array.from(new Set(candidates));
    
    const result = uniqueCandidates.filter(word => {
      if (!word) return false;
      const status = getWordInfo(word);
      return status !== "known" && status !== "ignored";
    });

    if (unknownSortMode === "alpha") {
      return [...result].sort((a, b) => a.localeCompare(b));
    }
    return result;
  }, [lesson.text, vocab, wordLinks, isCjk, unknownSortMode]);

  const filteredUnknownWords = useMemo(() => {
    if (!unknownSearchQuery.trim()) return allUnknownWords;
    const query = unknownSearchQuery.toLowerCase().trim();
    return allUnknownWords.filter(w => w.toLowerCase().includes(query));
  }, [allUnknownWords, unknownSearchQuery]);

  const getPhraseBorderColorClass = (status: WordStatus) => {
    switch (status) {
      case "1": return "border-[#f3a4b0] dark:border-rose-400";
      case "2": return "border-[#f0d46d] dark:border-amber-400";
      case "3":
      case "learning" as any:
        return "border-[#a6d896] dark:border-emerald-400";
      case "4": return "border-[#204bf4] dark:border-blue-400";
      case "5": return "border-[#a882dd] dark:border-purple-400";
      case "known": return "border-zinc-400 dark:border-zinc-500";
      case "ignored": return "border-zinc-400/70 dark:border-zinc-600/70";
      default: return "border-sky-300 dark:border-sky-500";
    }
  };

  const handleWordSelect = (e: React.MouseEvent | undefined, rawToken: string, cleanWord: string, fullPara: string) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const key = resolveWord(cleanWord);
    const sentences = splitIntoSentences(fullPara);
    const associatedSentence = sentences.find((s) => s.includes(rawToken)) || fullPara;
    setHoveredWordObj(null);
    setHoveredWordId(null);
    onWordClick(cleanWord, associatedSentence.trim());
  };

  const currentTheme = themeMap[activeSettings.readerTheme] || themeMap.default;

  return (
    <div id="reader-top" className={`relative rounded-2xl border shadow-sm p-6 sm:p-8 space-y-6 transition-colors duration-200 ${currentTheme}`}>
      <div className="pb-4 border-b border-zinc-200/60 dark:border-zinc-800/80 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3.5">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {lesson.title}
            </h2>
            {!lesson.isBuiltIn && onEditClick && (
              <button
                type="button"
                id="btn-edit-active-lesson"
                onClick={onEditClick}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/30 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-400 hover:text-teal-800 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                ✏️ ред.
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100/40 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400">
              Target: {lesson.targetLanguage}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
              Lingo To: {lesson.translationLanguage}
            </span>
            {lesson.difficulty && (
              <span 
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded border flex items-center gap-1 cursor-default select-none shadow-xs ${
                  getDifficultyBadgeStyles(lesson.difficulty)
                }`}
              >
                Сложность: {lesson.difficulty}
              </span>
            )}

          </div>
        </div>
      </div>

      {showOnlyUnknown && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-zinc-850 dark:text-zinc-200 animate-in fade-in duration-200 font-sans">
          <span className="text-xs font-black flex items-center gap-1.5 uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse animate-duration-1000" />
            Неизвестных слов в главе: {allUnknownWords.length}
          </span>
          <div className="flex items-center gap-1 bg-white/60 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={() => setUnknownViewMode("text")}
              className={`h-7 px-3 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                unknownViewMode === "text"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350"
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
              В контексте
            </button>
            <button
              type="button"
              onClick={() => setUnknownViewMode("list")}
              className={`h-7 px-3 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                unknownViewMode === "list"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Списком
            </button>
          </div>
        </div>
      )}

      <div 
        onMouseUp={handleTextSelection}
        className={`prose max-w-none space-y-6 ${fontFamilyMap[activeSettings.fontFamily]} ${fontSizeMap[activeSettings.fontSize]} ${lineHeightMap[activeSettings.lineHeight]} ${widthMap[activeSettings.maxWidth]}`}
      >
        {showOnlyUnknown && unknownViewMode === "list" && (
          <div className="animate-in fade-in duration-200 space-y-6 font-sans">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-4 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/50 dark:border-zinc-800/60 shadow-xs">
              <div className="relative w-full sm:max-w-xs">
                <input
                  type="text"
                  placeholder="Поиск слов..."
                  value={unknownSearchQuery}
                  onChange={(e) => setUnknownSearchQuery(e.target.value)}
                  className="w-full h-9 px-3.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 placeholder-zinc-400 dark:placeholder-zinc-650 transition-all font-sans"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Сортировка:</span>
                <select
                  value={unknownSortMode}
                  onChange={(e) => setUnknownSortMode(e.target.value as any)}
                  className="text-xs font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-zinc-700 dark:text-zinc-300 cursor-pointer h-9 shadow-xs"
                >
                  <option value="alpha">По алфавиту</option>
                  <option value="appearance">По появлению</option>
                </select>
              </div>
            </div>

            {filteredUnknownWords.length === 0 ? (
              <div className="text-center py-16 bg-zinc-50/50 dark:bg-zinc-900/10 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Неизвестных слов не найдено.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredUnknownWords.map((word) => {
                  const status = getWordInfo(word);
                  const key = resolveWord(word);
                  const lang = lesson.targetLanguage.toLowerCase();
                  const langKey = `${lang}_${key}`;
                  const lq = vocab[langKey];
                  const translation = lq ? lq.translation : "";
                  const isSelected = activeWord?.toLowerCase() === word.toLowerCase() || activeWord?.toLowerCase() === key.toLowerCase();

                  let badgeText = "New";
                  let badgeColor = "bg-sky-100 text-sky-850 dark:bg-sky-950/40 dark:text-sky-350 border border-sky-200/50 dark:border-sky-900/40";
                  if (status === "1") {
                    badgeText = "L1";
                    badgeColor = "bg-rose-100 text-rose-850 dark:bg-rose-950/40 dark:text-rose-350 border border-rose-200/50 dark:border-rose-900/40";
                  } else if (status === "2") {
                    badgeText = "L2";
                    badgeColor = "bg-amber-105 text-amber-850 dark:bg-amber-950/40 dark:text-amber-350 border border-amber-200/50 dark:border-amber-900/40";
                  } else if (status === "3" || (status as any) === "learning") {
                    badgeText = "L3";
                    badgeColor = "bg-emerald-100 text-emerald-850 dark:bg-emerald-950/40 dark:text-emerald-350 border border-emerald-200/50 dark:border-emerald-900/40";
                  } else if (status === "4") {
                    badgeText = "L4";
                    badgeColor = "bg-blue-100 text-blue-850 dark:bg-blue-950/40 dark:text-blue-350 border border-blue-200/50 dark:border-blue-900/40";
                  } else if (status === "5") {
                    badgeText = "L5";
                    badgeColor = "bg-purple-100 text-purple-850 dark:bg-purple-950/40 dark:text-purple-350 border border-purple-200/50 dark:border-purple-900/40";
                  }

                  const cardBorder = isSelected
                    ? "border-teal-500 dark:border-teal-400 ring-2 ring-teal-500/25 shadow-md scale-102"
                    : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xs";

                  return (
                    <div
                      key={word}
                      onClick={() => onWordClick(word, lesson.text)}
                      className={`p-4 rounded-2xl bg-white dark:bg-zinc-950 border transition-all cursor-pointer flex flex-col justify-between gap-3 ${cardBorder}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 break-words hover:text-teal-600 dark:hover:text-teal-400">
                            {word}
                          </span>
                          {translation ? (
                            <p className="text-xs text-zinc-650 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed" title={translation}>
                              {translation}
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-400 dark:text-zinc-650 mt-1 italic">
                              Нет перевода
                            </p>
                          )}
                        </div>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded leading-none shrink-0 ${badgeColor}`}>
                          {badgeText}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/50 pt-3 mt-1 shrink-0 font-sans">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakWord(word);
                          }}
                          className="p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-550 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer border border-zinc-200/50 dark:border-zinc-850"
                          title="Прослушать произношение"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkKnown(word);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/20 dark:hover:bg-teal-900/35 text-teal-700 dark:text-teal-400 text-[10px] font-black uppercase tracking-wider border border-teal-100/60 dark:border-teal-900/40 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Отметить как известное"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Знаю</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!(showOnlyUnknown && unknownViewMode === "list") && activeSegmentsForPage.map((seg, pIdx) => {
          const globalSegmentIdx = segments.indexOf(seg);
          const isSegmentActive = globalSegmentIdx === activeSegmentIndex && activeSegmentIndex >= 0;

          // Check if we should split by sentence
          const sentenceStrings = (activeSettings.sentenceSpacing && activeSettings.sentenceSpacing !== "normal")
            ? splitIntoSentences(seg.text)
            : [seg.text];

          // Precalculate total words in this segment for word-by-word highlight
          const segmentWordCount = (() => {
            if (!activeSettings.wordHighlight || !isSegmentActive) return 0;
            let count = 0;
            sentenceStrings.forEach((sentText) => {
              let tokens: { isWord: boolean }[] = [];
              if (isCjk) {
                tokens = sentText.split("").map((char) => {
                  const isPunct = /[.,\/#!$%\^&\*;:{}=\-_`~()"?、。！？」『』 \t\n]/g.test(char);
                  const isDigit = /^\d+$/.test(char);
                  return { isWord: !isPunct && !isDigit };
                });
              } else {
                const parts = sentText.split(/(\s+)/);
                tokens = parts.map((part) => {
                  if (/^\s+$/.test(part)) {
                    return { isWord: false };
                  }
                  const clean = part.replace(/^[^\w\p{L}]+|[^\w\p{L}]+$/gu, "");
                  const isNumericOrTimestamp = (str: string): boolean => {
                    if (/\d/.test(str)) {
                      if (/\d+:\d+/.test(str)) return true;
                      if (/^\d+([.,%/-]\d+)*%?$/.test(str)) return true;
                      if (/^\d+[a-zA-Z]+$/.test(str)) return true;
                      if (!/\p{L}/u.test(str)) return true;
                    }
                    return false;
                  };
                  const isNumeric = /^\d+$/.test(clean) || isNumericOrTimestamp(clean);
                  return { isWord: clean.length > 0 && !isNumeric };
                });
              }
              count += tokens.filter((t) => t.isWord).length;
            });
            return count;
          })();
          let wordRenderCount = 0;

          // Check if this segment represents an inline image placeholder
          const isImage = /^\[IMG(?:_REF)?:/.test(seg.text) && seg.text.endsWith("]");
          if (isImage) {
            try {
              const payload = seg.text.startsWith("[IMG_REF:")
                ? seg.text.substring(9, seg.text.length - 1)
                : seg.text.substring(5, seg.text.length - 1);
              const pipeIdx = payload.indexOf("|");
              const lastPipeIdx = payload.lastIndexOf("|");
              let dataUrl = payload;
              let width = "";
              let height = "";
              if (pipeIdx !== -1) {
                dataUrl = payload.substring(0, pipeIdx);
                if (lastPipeIdx !== pipeIdx) {
                  width = payload.substring(pipeIdx + 1, lastPipeIdx);
                  height = payload.substring(lastPipeIdx + 1);
                } else {
                  width = payload.substring(pipeIdx + 1);
                }
              }

              if (dataUrl.startsWith("epub_img_") || !dataUrl.startsWith("data:")) {
                const resolved = lessonImagesMap?.[dataUrl];
                if (!resolved) return null;
                dataUrl = resolved;
              } else if (seg.text.startsWith("[IMG_REF:")) {
                return null;
              }

              if (!dataUrl.startsWith("data:image/")) return null;

              const containerStyle: React.CSSProperties = {
                maxWidth: "100%",
                margin: "1.5rem auto",
                display: "flex",
                justifyContent: "center",
                flexDirection: "column",
                alignItems: "center",
              };

              const imgStyle: React.CSSProperties = {
                maxHeight: "450px",
                objectFit: "contain",
              };

              if (width) {
                imgStyle.width = width.match(/^\d+$/) ? `${width}px` : width;
              } else {
                imgStyle.width = "auto";
              }

              if (height) {
                imgStyle.height = height.match(/^\d+$/) ? `${height}px` : height;
              } else {
                imgStyle.height = "auto";
              }

              return (
                <div 
                  key={pIdx} 
                  style={containerStyle} 
                  className="my-6 p-2 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-800/40 shadow-xs flex flex-col items-center select-none"
                >
                  <img 
                    src={dataUrl} 
                    style={imgStyle} 
                    className="rounded-xl shadow-xs max-w-full" 
                    alt="Иллюстрация" 
                    referrerPolicy="no-referrer"
                    id={`pdf-epub-img-${pIdx}`}
                  />
                </div>
              );
            } catch (err) {
              console.error("Failed to render inline image segment:", err);
              return null;
            }
          }



          const getSentenceSpacingClass = (spacing?: string) => {
            switch (spacing) {
              case "spaced":
                return "inline-block mr-4 md:mr-6";
              case "wide":
                return "inline-block mr-8 md:mr-12";
              case "newline":
                return "block mb-2 last:mb-0";
              case "double-newline":
                return "block mb-5 last:mb-0";
              default:
                return "inline";
            }
          };

          const renderSentenceTokens = (sentText: string, sIdx: number) => {
            const range = sentenceTokenRanges.find((r) => r.segIdx === pIdx && r.sIdx === sIdx);
            if (!range) return [];
            const tokens = allPageTokens.slice(range.startIdx, range.endIdx + 1);

            // Map page-level phrase matches to sentence-local token indices
            const phraseMatches: { phrase: string; vocabItem: VocabItem; tokenIndices: number[] }[] = [];
            const detectedMatches: { phrase: string; translation: string; explanation: string; type?: string; tokenIndices: number[] }[] = [];

            pagePhraseMatches.forEach((m) => {
              const sentenceIndices = m.tokenIndices.filter((idx) => idx >= range.startIdx && idx <= range.endIdx);
              if (sentenceIndices.length > 0) {
                const localIndices = sentenceIndices.map((idx) => idx - range.startIdx);
                phraseMatches.push({
                  phrase: m.phrase,
                  vocabItem: m.vocabItem,
                  tokenIndices: localIndices,
                });
              }
            });

            pageDetectedMatches.forEach((m) => {
              const sentenceIndices = m.tokenIndices.filter((idx) => idx >= range.startIdx && idx <= range.endIdx);
              if (sentenceIndices.length > 0) {
                const localIndices = sentenceIndices.map((idx) => idx - range.startIdx);
                detectedMatches.push({
                  phrase: m.phrase,
                  translation: m.translation,
                  explanation: m.explanation,
                  type: m.type,
                  tokenIndices: localIndices,
                });
              }
            });

            const elements: React.ReactNode[] = [];
            let tIdx = 0;

            const handlePhraseMouseEnter = (
              e: React.MouseEvent,
              rect: DOMRect,
              detectedMatch: typeof detectedMatches[0] | null,
              phraseMatch: typeof phraseMatches[0] | null
            ) => {
              const showBelow = rect.bottom < window.innerHeight - 280;
              const posY = showBelow ? rect.bottom + 6 : rect.top - 6;
              
              if (phraseMatch) {
                setHoveredWordObj({
                  word: phraseMatch.phrase,
                  translation: "",
                  x: rect.left + rect.width / 2,
                  y: posY,
                  position: showBelow ? "below" : "above",
                  phraseText: phraseMatch.phrase,
                  phraseTranslation: phraseMatch.vocabItem.translation,
                  phraseStatus: phraseMatch.vocabItem.status,
                  phraseTags: phraseMatch.vocabItem.tags,
                });
              } else if (detectedMatch) {
                setHoveredWordObj({
                  word: detectedMatch.phrase,
                  translation: "",
                  x: rect.left + rect.width / 2,
                  y: posY,
                  position: showBelow ? "below" : "above",
                  detectedPhraseText: detectedMatch.phrase,
                  detectedPhraseTranslation: detectedMatch.translation,
                  detectedPhraseExplanation: detectedMatch.explanation,
                  detectedPhraseType: detectedMatch.type,
                });
              }
            };

            while (tIdx < tokens.length) {
              const tok = tokens[tIdx];

              if (!tok.isWord) {
                elements.push(<span key={`nonword-${tIdx}`} className="opacity-95">{tok.raw}</span>);
                tIdx++;
                continue;
              }

              // Check if this token starts a user-saved phrase match (takes priority)
              const matchedPhrase = phraseMatches.find((m) => m.tokenIndices[0] === tIdx);
              const matchedDetected = detectedMatches.find((m) => m.tokenIndices[0] === tIdx);

              if (matchedPhrase) {
                const startIndex = matchedPhrase.tokenIndices[0];
                const endIndex = matchedPhrase.tokenIndices[matchedPhrase.tokenIndices.length - 1];
                const phraseTokens = tokens.slice(startIndex, endIndex + 1);

                // Increment word render count for the words in this phrase
                let isPhraseActive = false;
                phraseTokens.forEach((t) => {
                  if (t.isWord) {
                    const currentWordIdx = wordRenderCount;
                    wordRenderCount++;

                    if (
                      activeSettings.wordHighlight &&
                      isSegmentActive &&
                      currentYoutubeTime !== null &&
                      currentYoutubeTime !== undefined &&
                      segmentWordCount > 0
                    ) {
                      const segmentStartTime = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : 0;
                      let segmentEndTime = segmentStartTime + 10;
                      for (let i = globalSegmentIdx + 1; i < segments.length; i++) {
                        if (segments[i].timestamp) {
                          segmentEndTime = parseTimestampToSeconds(segments[i].timestamp!);
                          break;
                        }
                      }
                      const segmentDuration = Math.max(0.1, segmentEndTime - segmentStartTime);
                      const wordDuration = segmentDuration / segmentWordCount;
                      const wordStart = segmentStartTime + currentWordIdx * wordDuration;
                      const wordEnd = segmentStartTime + (currentWordIdx + 1) * wordDuration;

                      if (currentYoutubeTime >= wordStart && currentYoutubeTime < wordEnd) {
                        isPhraseActive = true;
                      }
                    }
                  }
                });

                const isPhraseSelected = activeWord?.toLowerCase() === matchedPhrase.phrase.toLowerCase();

                // Build clean phrase display
                let prefix = "";
                let suffix = "";
                const firstTok = phraseTokens[0];
                const lastTok = phraseTokens[phraseTokens.length - 1];

                const firstClean = firstTok.clean;
                const firstRaw = firstTok.raw;
                const cleanedAtStartIdx = firstRaw.toLowerCase().indexOf(firstClean);
                if (cleanedAtStartIdx > 0) {
                  prefix = firstRaw.substring(0, cleanedAtStartIdx);
                }

                const lastClean = lastTok.clean;
                const lastRaw = lastTok.raw;
                const lastCleanedStartIdx = lastRaw.toLowerCase().indexOf(lastClean);
                if (lastCleanedStartIdx >= 0) {
                  const cleanedAtEndIdx = lastCleanedStartIdx + lastClean.length;
                  if (cleanedAtEndIdx < lastRaw.length) {
                    suffix = lastRaw.substring(cleanedAtEndIdx);
                  }
                }

                let phraseDisplay = "";
                if (phraseTokens.length === 1) {
                  phraseDisplay = firstClean;
                } else {
                  const middleRaw = phraseTokens.slice(1, -1).map(t => t.raw).join("");
                  const firstWordPortion = cleanedAtStartIdx >= 0 ? firstRaw.substring(cleanedAtStartIdx) : firstRaw;
                  const lastWordPortion = lastCleanedStartIdx >= 0 ? lastRaw.substring(0, lastCleanedStartIdx + lastClean.length) : lastRaw;
                  phraseDisplay = firstWordPortion + middleRaw + lastWordPortion;
                }

                const status = matchedPhrase.vocabItem.status;
                let styleClass = "";
                const borderClass = `border-b-2 border-dashed ${getPhraseBorderColorClass(status)}`;

                if (status === "ignored" || status === "known") {
                  styleClass = `hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 text-inherit cursor-pointer rounded px-1 transition-colors font-normal ${borderClass}`;
                  if (showOnlyUnknown && unknownViewMode === "text") {
                    styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2px] hover:blur-none hover:opacity-100 duration-300`;
                  }
                } else if (status === "1") {
                  styleClass = `bg-[#f3a4b0]/45 dark:bg-rose-950/30 hover:bg-[#f3a4b0]/70 text-rose-900 dark:text-rose-200 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                } else if (status === "2") {
                  styleClass = `bg-[#f0d46d]/45 dark:bg-amber-950/30 hover:bg-[#f0d46d]/70 text-amber-900 dark:text-amber-200 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                } else if (status === "3" || (status as any) === "learning") {
                  styleClass = `bg-[#a6d896]/45 dark:bg-emerald-950/30 hover:bg-[#a6d896]/70 text-emerald-900 dark:text-emerald-200 rounded px-1.5 font-medium ${borderClass} cursor-pointer transition-colors`;
                } else if (status === "4") {
                  styleClass = `bg-[#99bce8] dark:bg-blue-900/40 hover:bg-[#86b0e3] text-blue-950 dark:text-blue-200 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                } else if (status === "5") {
                  styleClass = `bg-[#c5aee2] dark:bg-purple-900/40 hover:bg-[#b096d2] text-purple-950 dark:text-purple-200 rounded px-1.5 font-semibold ${borderClass} cursor-pointer transition-colors`;
                }

                if (isPhraseActive) {
                  styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold scale-103 shadow-md duration-150`;
                } else if (isPhraseSelected) {
                  styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 scale-102 duration-150`;
                }

                const wordId = `phrase-${matchedPhrase.phrase}-${tIdx}-${sIdx}-${pIdx}`;

                elements.push(
                  <span key={tIdx} className={`inline-block relative ${hoveredWordId === wordId ? "z-50" : ""}`} spellCheck={false}>
                    {prefix && <span className="opacity-80">{prefix}</span>}
                    <button
                      id={`word-phrase-${matchedPhrase.phrase}-${tIdx}`}
                      onClick={(e) => handleWordSelect(e, matchedPhrase.phrase, matchedPhrase.phrase, sentText)}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredWordId(wordId);
                        handlePhraseMouseEnter(e, rect, null, matchedPhrase);
                      }}
                      onMouseLeave={() => {
                        setHoveredWordId(null);
                        setHoveredWordObj(null);
                      }}
                      className={`${styleClass} inline-block select-text font-inherit`}
                      style={{ outline: "none" }}
                      spellCheck={false}
                    >
                      {phraseDisplay}
                    </button>
                    {suffix && <span className="opacity-80">{suffix}</span>}
                  </span>
                );

                tIdx = endIndex + 1;
                continue;
              }

              if (matchedDetected) {
                const startIndex = matchedDetected.tokenIndices[0];
                const endIndex = matchedDetected.tokenIndices[matchedDetected.tokenIndices.length - 1];
                const phraseTokens = tokens.slice(startIndex, endIndex + 1);

                // Increment word render count for the words in this phrase
                let isPhraseActive = false;
                phraseTokens.forEach((t) => {
                  if (t.isWord) {
                    const currentWordIdx = wordRenderCount;
                    wordRenderCount++;

                    if (
                      activeSettings.wordHighlight &&
                      isSegmentActive &&
                      currentYoutubeTime !== null &&
                      currentYoutubeTime !== undefined &&
                      segmentWordCount > 0
                    ) {
                      const segmentStartTime = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : 0;
                      let segmentEndTime = segmentStartTime + 10;
                      for (let i = globalSegmentIdx + 1; i < segments.length; i++) {
                        if (segments[i].timestamp) {
                          segmentEndTime = parseTimestampToSeconds(segments[i].timestamp!);
                          break;
                        }
                      }
                      const segmentDuration = Math.max(0.1, segmentEndTime - segmentStartTime);
                      const wordDuration = segmentDuration / segmentWordCount;
                      const wordStart = segmentStartTime + currentWordIdx * wordDuration;
                      const wordEnd = segmentStartTime + (currentWordIdx + 1) * wordDuration;

                      if (currentYoutubeTime >= wordStart && currentYoutubeTime < wordEnd) {
                        isPhraseActive = true;
                      }
                    }
                  }
                });

                const isPhraseSelected = activeWord?.toLowerCase() === matchedDetected.phrase.toLowerCase();

                // Build clean phrase display
                let prefix = "";
                let suffix = "";
                const firstTok = phraseTokens[0];
                const lastTok = phraseTokens[phraseTokens.length - 1];

                const firstClean = firstTok.clean;
                const firstRaw = firstTok.raw;
                const cleanedAtStartIdx = firstRaw.toLowerCase().indexOf(firstClean);
                if (cleanedAtStartIdx > 0) {
                  prefix = firstRaw.substring(0, cleanedAtStartIdx);
                }

                const lastClean = lastTok.clean;
                const lastRaw = lastTok.raw;
                const lastCleanedStartIdx = lastRaw.toLowerCase().indexOf(lastClean);
                if (lastCleanedStartIdx >= 0) {
                  const cleanedAtEndIdx = lastCleanedStartIdx + lastClean.length;
                  if (cleanedAtEndIdx < lastRaw.length) {
                    suffix = lastRaw.substring(cleanedAtEndIdx);
                  }
                }

                let phraseDisplay = "";
                if (phraseTokens.length === 1) {
                  phraseDisplay = firstClean;
                } else {
                  const middleRaw = phraseTokens.slice(1, -1).map(t => t.raw).join("");
                  const firstWordPortion = cleanedAtStartIdx >= 0 ? firstRaw.substring(cleanedAtStartIdx) : firstRaw;
                  const lastWordPortion = lastCleanedStartIdx >= 0 ? lastRaw.substring(0, lastCleanedStartIdx + lastClean.length) : lastRaw;
                  phraseDisplay = firstWordPortion + middleRaw + lastWordPortion;
                }

                const idiomStyle = activeSettings.idiomHighlightStyle || "badge";
                let styleClass = "";
                let isIconStyle = false;

                if (idiomStyle === "badge") {
                  styleClass = "bg-purple-100/70 border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800 text-purple-950 dark:text-purple-300 font-semibold hover:bg-purple-200/80 dark:hover:bg-purple-900/50 cursor-pointer rounded-lg px-1.5 py-0.5 mx-0.5 transition-all";
                } else if (idiomStyle === "underline") {
                  styleClass = "border-b-2 border-dotted border-purple-500 dark:border-purple-400 pb-[3px] cursor-pointer rounded px-0.5 transition-all";
                } else if (idiomStyle === "icon") {
                  isIconStyle = true;
                  styleClass = "cursor-pointer rounded px-0.5 transition-all";
                } else if (idiomStyle === "hover") {
                  styleClass = "border-b-2 border-transparent hover:border-dotted hover:border-purple-500 pb-[3px] cursor-pointer rounded px-0.5 transition-all duration-150";
                }

                const phraseKey = resolveWord(matchedDetected.phrase);
                const phraseLang = lesson.targetLanguage.toLowerCase();
                const phraseLangKey = `${phraseLang}_${phraseKey}`;
                const isPhraseSaved = !!(vocab[phraseLangKey] || vocab[phraseKey]);
                const phraseStatus = isPhraseSaved ? (vocab[phraseLangKey] || vocab[phraseKey]).status : "new";
                const isPhraseKnown = phraseStatus === "known" || phraseStatus === "ignored";

                if (showOnlyUnknown && unknownViewMode === "text" && isPhraseKnown) {
                  styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2px] hover:blur-none hover:opacity-100 duration-300`;
                }

                if (isPhraseActive) {
                  styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold scale-103 shadow-md duration-150`;
                } else if (isPhraseSelected) {
                  styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-1 dark:ring-offset-zinc-950 scale-102 duration-150`;
                }

                const wordId = `detected-${matchedDetected.phrase}-${tIdx}-${sIdx}-${pIdx}`;

                elements.push(
                  <span key={tIdx} className={`inline-block relative ${hoveredWordId === wordId ? "z-50" : ""}`} spellCheck={false}>
                    {prefix && <span className="opacity-80">{prefix}</span>}
                    <button
                      id={`word-detected-${matchedDetected.phrase}-${tIdx}`}
                      onClick={(e) => handleWordSelect(e, matchedDetected.phrase, matchedDetected.phrase, sentText)}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredWordId(wordId);
                        handlePhraseMouseEnter(e, rect, matchedDetected, null);
                      }}
                      onMouseLeave={() => {
                        setHoveredWordId(null);
                        setHoveredWordObj(null);
                      }}
                      className={`${styleClass} inline-flex items-center select-text font-inherit`}
                      style={{ outline: "none" }}
                      spellCheck={false}
                    >
                      {idiomStyle === "badge" ? (
                        <span>{phraseDisplay}</span>
                      ) : (
                        phraseTokens.map((tok, tokIdx) => {
                          if (!tok.isWord) {
                            return <span key={tokIdx} className="opacity-95">{tok.raw}</span>;
                          }
                          const wordStatus = getWordInfo(tok.clean);
                          const resolvedCleanWord = resolveWord(tok.clean);
                          const isWordActive = activeWord?.toLowerCase() === tok.clean.toLowerCase() || activeWord?.toLowerCase() === resolvedCleanWord.toLowerCase();
                          
                          const hasIdiomUnderline = idiomStyle === "underline" || idiomStyle === "hover";
                          let tokenStyleClass = "";
                          if (wordStatus === "ignored" || wordStatus === "known") {
                            tokenStyleClass = `hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 text-inherit cursor-pointer rounded px-0.5 transition-colors font-normal`;
                          } else if (wordStatus === "1") {
                            tokenStyleClass = `bg-[#f3a4b0]/45 dark:bg-rose-950/30 hover:bg-[#f3a4b0]/70 text-rose-900 dark:text-rose-200 rounded px-1 font-semibold ${hasIdiomUnderline ? "" : "border-b-2 border-[#f3a4b0]"} cursor-pointer transition-colors`;
                          } else if (wordStatus === "2") {
                            tokenStyleClass = `bg-[#f0d46d]/45 dark:bg-amber-950/35 hover:bg-[#f0d46d]/70 text-amber-900 dark:text-amber-200 rounded px-1 font-semibold ${hasIdiomUnderline ? "" : "border-b-2 border-[#f0d46d]"} cursor-pointer transition-colors`;
                          } else if (wordStatus === "3" || (wordStatus as any) === "learning") {
                            tokenStyleClass = `bg-[#a6d896]/45 dark:bg-emerald-950/35 hover:bg-[#a6d896]/70 text-emerald-900 dark:text-emerald-200 rounded px-1 font-medium ${hasIdiomUnderline ? "" : "border-b-2 border-[#a6d896]"} cursor-pointer transition-colors`;
                          } else if (wordStatus === "4") {
                            tokenStyleClass = `bg-[#99bce8] dark:bg-blue-900/40 hover:bg-[#86b0e3] text-blue-950 dark:text-blue-100 rounded px-1 font-semibold ${hasIdiomUnderline ? "" : "border-b-2 border-[#204bf4] dark:border-blue-400"} cursor-pointer transition-colors`;
                          } else if (wordStatus === "5") {
                            tokenStyleClass = `bg-[#c5aee2] dark:bg-purple-900/40 hover:bg-[#b096d2] text-purple-950 dark:text-purple-200 rounded px-1 font-semibold ${hasIdiomUnderline ? "" : "border-b-2 border-[#a882dd] dark:border-purple-400"} cursor-pointer transition-colors`;
                          } else {
                            tokenStyleClass = `bg-[#cbeeff] dark:bg-sky-900/35 hover:bg-[#addbff] dark:hover:bg-sky-900/50 text-sky-900 dark:text-sky-200 rounded px-1 cursor-pointer transition-colors`;
                          }
                          
                          if (isWordActive) {
                            tokenStyleClass = `${tokenStyleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-2 dark:ring-offset-zinc-950 scale-103 duration-150`;
                          }

                          let displayText = tok.raw;
                          if (tokIdx === 0) {
                            displayText = tok.raw.substring(prefix.length);
                          }
                          if (tokIdx === phraseTokens.length - 1) {
                            displayText = tok.raw.substring(0, tok.raw.length - suffix.length);
                          }
                          
                          return (
                            <span key={tokIdx} className={`${tokenStyleClass} inline-block`}>
                              {displayText}
                            </span>
                          );
                        })
                      )}
                      {isIconStyle && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-0.5 text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full font-bold shadow-xs select-none animate-pulse" title="Идиома (ИИ)">
                          ✨
                        </span>
                      )}
                    </button>
                    {suffix && <span className="opacity-80">{suffix}</span>}
                  </span>
                );

                tIdx = endIndex + 1;
                continue;
              }

              // Normal single word rendering
              const currentWordIdx = wordRenderCount;
              wordRenderCount++;

              const rawString = tok.raw;
              const cleanWord = tok.clean;

              let prefix = "";
              let suffix = "";
              if (!isCjk) {
                const cleanedAtStartIdx = rawString.toLowerCase().indexOf(cleanWord);
                if (cleanedAtStartIdx >= 0) {
                  if (cleanedAtStartIdx > 0) {
                    prefix = rawString.substring(0, cleanedAtStartIdx);
                  }
                  const cleanedAtEndIdx = cleanedAtStartIdx + cleanWord.length;
                  if (cleanedAtEndIdx < rawString.length) {
                    suffix = rawString.substring(cleanedAtEndIdx);
                  }
                }
              }

              const status = getWordInfo(cleanWord);
              const resolvedCleanWord = resolveWord(cleanWord);
              const isActive = activeWord?.toLowerCase() === cleanWord.toLowerCase() || activeWord?.toLowerCase() === resolvedCleanWord.toLowerCase();

              let isWordActive = false;
              if (
                activeSettings.wordHighlight &&
                isSegmentActive &&
                currentYoutubeTime !== null &&
                currentYoutubeTime !== undefined &&
                segmentWordCount > 0
              ) {
                const segmentStartTime = seg.timestamp ? parseTimestampToSeconds(seg.timestamp) : 0;
                let segmentEndTime = segmentStartTime + 10;
                for (let i = globalSegmentIdx + 1; i < segments.length; i++) {
                  if (segments[i].timestamp) {
                    segmentEndTime = parseTimestampToSeconds(segments[i].timestamp!);
                    break;
                  }
                }
                const segmentDuration = Math.max(0.1, segmentEndTime - segmentStartTime);
                const wordDuration = segmentDuration / segmentWordCount;
                const wordStart = segmentStartTime + currentWordIdx * wordDuration;
                const wordEnd = segmentStartTime + (currentWordIdx + 1) * wordDuration;

                isWordActive = currentYoutubeTime >= wordStart && currentYoutubeTime < wordEnd;
              }

              const lang = lesson.targetLanguage.toLowerCase();
              const hasWordLink = !!wordLinks[`${lang}_${cleanWord.toLowerCase()}`];

              let styleClass = "";
              if (status === "ignored" || status === "known") {
                styleClass = `hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 text-inherit cursor-pointer rounded px-0.5 transition-colors font-normal`;
                if (showOnlyUnknown && unknownViewMode === "text") {
                  styleClass = `${styleClass} opacity-15 dark:opacity-10 blur-[2.5px] hover:blur-none hover:opacity-100 duration-300`;
                }
              } else if (status === "1") {
                styleClass = `bg-[#f3a4b0]/45 dark:bg-rose-950/30 hover:bg-[#f3a4b0]/70 text-rose-900 dark:text-rose-200 rounded px-1 font-semibold border-b-2 ${hasWordLink ? "border-dotted border-amber-600 dark:border-amber-400" : "border-[#f3a4b0]"} cursor-pointer transition-colors`;
              } else if (status === "2") {
                styleClass = `bg-[#f0d46d]/45 dark:bg-amber-950/35 hover:bg-[#f0d46d]/70 text-amber-900 dark:text-amber-200 rounded px-1 font-semibold border-b-2 ${hasWordLink ? "border-dotted border-amber-700 dark:border-amber-300" : "border-[#f0d46d]"} cursor-pointer transition-colors`;
              } else if (status === "3" || (status as any) === "learning") {
                styleClass = `bg-[#a6d896]/45 dark:bg-emerald-950/35 hover:bg-[#a6d896]/70 text-emerald-900 dark:text-emerald-200 rounded px-1 font-medium border-b-2 ${hasWordLink ? "border-dotted border-amber-600 dark:border-amber-400" : "border-[#a6d896]"} cursor-pointer transition-colors`;
              } else if (status === "4") {
                styleClass = `bg-[#99bce8] dark:bg-blue-900/40 hover:bg-[#86b0e3] text-blue-950 dark:text-blue-100 rounded px-1 font-semibold border-b-2 ${hasWordLink ? "border-dotted border-amber-600 dark:border-amber-400" : "border-[#204bf4] dark:border-blue-400"} cursor-pointer transition-colors`;
              } else if (status === "5") {
                styleClass = `bg-[#c5aee2] dark:bg-purple-900/40 hover:bg-[#b096d2] text-purple-950 dark:text-purple-200 rounded px-1 font-semibold border-b-2 ${hasWordLink ? "border-dotted border-amber-600 dark:border-amber-400" : "border-[#a882dd] dark:border-purple-400"} cursor-pointer transition-colors`;
              } else {
                styleClass = `bg-[#cbeeff] dark:bg-sky-900/35 hover:bg-[#addbff] dark:hover:bg-sky-900/50 text-sky-900 dark:text-sky-200 rounded px-1 ${hasWordLink ? "border-b-2 border-dotted border-amber-600 dark:border-amber-400" : ""} cursor-pointer transition-colors`;
              }

              if (isWordActive) {
                styleClass = `${styleClass} ring-2 ring-amber-500 dark:ring-amber-400 font-extrabold scale-105 shadow-md duration-150`;
              } else if (isActive) {
                styleClass = `${styleClass} ring-2 ring-teal-500 dark:ring-teal-400 ring-offset-2 dark:ring-offset-zinc-950 scale-103 duration-150`;
              }

              const wordId = `${cleanWord}-${tIdx}-${sIdx}-${pIdx}`;

              elements.push(
                <span key={tIdx} className={`inline-block relative ${hoveredWordId === wordId ? "z-50" : ""}`} spellCheck={false}>
                  {prefix && <span className="opacity-80">{prefix}</span>}
                  <button
                    type="button"
                    id={`word-${cleanWord}-${tIdx}`}
                    onClick={(e) => handleWordSelect(e, rawString, cleanWord, sentText)}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredWordId(wordId);

                      const key = resolveWord(cleanWord);
                      const lang = lesson.targetLanguage.toLowerCase();
                      const langKey = `${lang}_${key}`;
                      const lq = vocab[langKey];
                      
                      const showBelow = rect.bottom < window.innerHeight - 280;
                      const posY = showBelow ? rect.bottom + 6 : rect.top - 6;

                      if (lq) {
                        const rawBaseWord = wordLinks[`${lang}_${cleanWord.toLowerCase()}`];
                        const baseWord = rawBaseWord ? rawBaseWord.replace(/^[a-zA-Z]+_/, "") : "";
                        
                        setHoveredWordObj({
                          word: cleanWord,
                          parentWord: baseWord || undefined,
                          translation: lq.translation,
                          tags: lq.tags,
                          grammar: lq.grammar,
                          imageUrl: lq.imageUrl || undefined,
                          x: rect.left + rect.width / 2,
                          y: posY,
                          position: showBelow ? "below" : "above",
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredWordId(null);
                      setHoveredWordObj(null);
                    }}
                    className={`${styleClass} inline-block select-text font-inherit`}
                    style={{ outline: "none" }}
                    spellCheck={false}
                  >
                    {isCjk ? rawString : rawString.substring(prefix.length, rawString.length - suffix.length)}
                  </button>
                  {suffix && <span className="opacity-80">{suffix}</span>}
                </span>
              );

              tIdx++;
            }

            return elements;
          };

          const renderParagraphContent = () => {
            return sentenceStrings.map((sentText, sIdx) => {
              const spacingClass = getSentenceSpacingClass(activeSettings.sentenceSpacing);
              return (
                <span key={sIdx} className={spacingClass} spellCheck={false}>
                  {renderSentenceTokens(sentText, sIdx)}
                </span>
              );
            });
          };

          const getSegmentSpacingClass = () => {
            switch (activeSettings.segmentSpacing) {
              case "compact": return "py-0.5 my-0.5";
              case "relaxed": return "py-4 my-2";
              case "loose": return "py-6 my-4";
              case "normal":
              default: return "py-2 my-1";
            }
          };

          const getBookParagraphSpacingClass = () => {
            switch (activeSettings.segmentSpacing) {
              case "compact": return "mb-2 mt-0";
              case "relaxed": return "mb-8 mt-4";
              case "loose": return "mb-12 mt-6";
              case "normal":
              default: return "mb-5 mt-2";
            }
          };

          if (hasTimestamps) {
            // Render beautiful unified line-by-line subtitle transcript layout exactly like screenshot 1
            return (
              <div 
                key={pIdx} 
                id={`segment-row-${globalSegmentIdx}`}
                className={`relative hover:z-20 flex items-baseline gap-3 px-3 sm:px-4 border-l-[3.5px] rounded-r-2xl transition-all duration-300 ${getSegmentSpacingClass()} ${
                  isSegmentActive 
                    ? "bg-amber-500/8 dark:bg-amber-500/5 border-amber-500 shadow-xs scale-[1.008]" 
                    : "border-transparent hover:bg-zinc-100/30 dark:hover:bg-zinc-800/10"
                }`}
              >
                <div className="w-12 sm:w-16 shrink-0 select-none text-left">
                  {seg.timestamp ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (onTimestampClick) {
                          const secs = parseTimestampToSeconds(seg.timestamp);
                          onTimestampClick(secs);
                        }
                      }}
                      className={`text-xs sm:text-sm font-semibold font-mono tracking-tight transition-all cursor-pointer rounded-md px-1.5 py-0.5 hover:scale-105 active:scale-95 inline-block ${
                        isSegmentActive
                          ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-950 shadow-xs font-bold"
                          : "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/45"
                      }`}
                      title="Нажмите, чтобы переместить видео к этому моменту / Click to seek"
                    >
                      {formatTime(parseTimestampToSeconds(seg.timestamp))}
                    </button>
                  ) : (
                    <span className="text-xs font-mono text-zinc-300 dark:text-zinc-700 select-none">
                      ··
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-left antialiased text-inherit selection:bg-teal-200 dark:selection:bg-teal-900 leading-relaxed text-sm sm:text-base">
                    {renderParagraphContent()}
                  </p>
                </div>
              </div>
            );
          } else {
            // Render classic clean book block paragraphs
            return (
              <p 
                key={pIdx} 
                id={`segment-row-${globalSegmentIdx}`}
                className={`paragraph-block relative hover:z-20 text-justify antialiased selection:bg-teal-200 dark:selection:bg-teal-900 transition-all duration-300 rounded-lg ${getBookParagraphSpacingClass()} ${
                  isSegmentActive
                    ? "bg-amber-500/8 dark:bg-amber-500/5 border-l-[3px] border-amber-500 pl-3.5 scale-[1.005] py-2"
                    : "border-l-0 pl-0 py-0"
                }`}
              >
                {renderParagraphContent()}
              </p>
            );
          }
        })}

        {/* Active saved Phrases and Idioms shelf */}
        {activePhrasesInLesson.length > 0 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 mt-6 space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Выделенные идиомы и фразы в главе / Idioms In Chapter ({activePhrasesInLesson.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {activePhrasesInLesson.map((pq) => (
                <button
                  key={pq.word}
                  type="button"
                  onClick={() => onWordClick(pq.word, lesson.text)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-xl cursor-pointer transition-all border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 hover:brightness-95 active:scale-97 flex items-center gap-1 shrink-0"
                >
                  📖 {pq.word}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auto-detected Phrases and Idioms shelf */}
        {lesson.detectedPhrases && Object.keys(lesson.detectedPhrases).length > 0 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 mt-4 space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Найденные ИИ фразовые глаголы и идиомы / AI Detected Idioms ({Object.keys(lesson.detectedPhrases).length})
            </h4>
            <div className="flex flex-wrap gap-1.5 animate-in fade-in duration-200">
              {Object.entries(lesson.detectedPhrases).map(([phrase, details]) => {
                const key = resolveWord(phrase);
                const lang = lesson.targetLanguage.toLowerCase();
                const langKey = `${lang}_${key}`;
                const isSaved = !!(vocab[langKey] || vocab[key]);

                return (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => onWordClick(phrase, lesson.text)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shrink-0 active:scale-97 hover:brightness-95 ${
                      isSaved
                        ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/10 dark:text-amber-400"
                        : "border border-purple-200 bg-purple-55 text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-400"
                    }`}
                    title={`[${getPhraseTypeLabel(details.type)}] ${details.translation}: ${details.explanation}`}
                  >
                    <span>{isSaved ? `📖 ${phrase}` : `✨ ${phrase}`}</span>
                    <span className="text-[8px] opacity-75 font-normal px-1 rounded-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 uppercase tracking-wider">
                      {getPhraseTypeLabel(details.type).toLowerCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Beautiful Pagination HUD bar custom control */}
        {pages.length > 1 && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/80 pt-5 mt-6 space-y-4">
            {/* Quick jump timeline slider row */}
            <div className="flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-950/20 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/40">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 shrink-0">
                Быстрый переход / Fast Jump:
              </span>
              <div className="flex-grow flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                {pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      didUserNavigateRef.current = true;
                      setCurrentPageIdx(i);
                      document.getElementById(`reader-top`)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`min-w-[28px] h-7 px-1.5 text-[10px] font-black font-mono rounded-lg transition-all cursor-pointer ${
                      i === clampedPageIdx
                        ? "bg-teal-600 text-white shadow-sm ring-1 ring-teal-400 scale-105"
                        : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                id="reader-prev-page-btn"
                disabled={clampedPageIdx === 0}
                onClick={() => {
                  didUserNavigateRef.current = true;
                  setCurrentPageIdx(prev => Math.max(0, prev - 1));
                  document.getElementById(`reader-top`)?.scrollIntoView({ behavior: "smooth" });
                }}
                className="w-full sm:w-auto px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black transition-all active:scale-98 flex items-center justify-center gap-1.5 border border-zinc-200/50 dark:border-zinc-700/60"
              >
                ← Предыдущая (Prev)
              </button>

              <div className="flex items-center gap-2 bg-zinc-100/40 dark:bg-zinc-950/40 px-3 py-1.5 rounded-xl border border-zinc-200/40 dark:border-zinc-800/80">
                <span className="text-xs font-mono font-bold tracking-tight text-zinc-500">
                  Страница / Page
                </span>
                <select
                  id="page-jump-select"
                  value={clampedPageIdx}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    didUserNavigateRef.current = true;
                    setCurrentPageIdx(val);
                    document.getElementById(`reader-top`)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="text-xs font-mono font-bold tracking-tight text-teal-600 dark:text-teal-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer shadow-xs font-sans"
                >
                  {pages.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-mono font-bold tracking-tight text-zinc-400 dark:text-zinc-500">
                  из {pages.length}
                </span>
                <button
                  type="button"
                  title="Сбросить на 1-ю страницу / Reset to Page 1"
                  onClick={() => {
                    didUserNavigateRef.current = true;
                    setCurrentPageIdx(0);
                    safeLocalStorageSetItem(`vocab_progress_${lesson.id}`, "0");
                    document.getElementById(`reader-top`)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition cursor-pointer ml-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                id="reader-next-page-btn"
                disabled={clampedPageIdx === pages.length - 1}
                onClick={() => {
                  didUserNavigateRef.current = true;
                  setCurrentPageIdx(prev => Math.min(pages.length - 1, prev + 1));
                  document.getElementById(`reader-top`)?.scrollIntoView({ behavior: "smooth" });
                }}
                className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black transition-all active:scale-98 flex items-center justify-center gap-1.5 shadow-sm"
              >
                Следующая (Next) →
              </button>
            </div>
          </div>
        )}

        {lesson.translationText && !(showOnlyUnknown && unknownViewMode === "list") && (
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/80 pt-5 mt-6">
            <details className="group select-text">
              <summary className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 hover:text-teal-700 cursor-pointer list-none select-none">
                <span className="transition-transform duration-200 group-open:rotate-90 inline-block">▶</span>
                <span>Показать перевод истории (Russian Translation)</span>
              </summary>
              <div className="mt-4 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-100 dark:border-zinc-800/40 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 space-y-4 antialiased whitespace-pre-line font-medium select-text">
                {lesson.translationText}
              </div>
            </details>
          </div>
        )}
      </div>

      {hoveredWordObj && (
        <TooltipPortal
          x={hoveredWordObj.x}
          y={hoveredWordObj.y}
          position={hoveredWordObj.position || "above"}
        >
          {hoveredWordObj.phraseText ? (
            <div className="flex flex-col gap-1.5 pb-1">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/60 pb-1.5">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 capitalize truncate">
                    📖 {hoveredWordObj.phraseText}
                  </span>
                </div>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded leading-none shrink-0 ${
                  hoveredWordObj.phraseStatus === "1" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-100/50 dark:border-rose-900/40" :
                  hoveredWordObj.phraseStatus === "2" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/40" :
                  hoveredWordObj.phraseStatus === "3" || (hoveredWordObj.phraseStatus as any) === "learning" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/40" :
                  hoveredWordObj.phraseStatus === "4" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/40" :
                  hoveredWordObj.phraseStatus === "5" ? "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-100/50 dark:border-purple-900/40" :
                  "bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}>
                  Статус: {hoveredWordObj.phraseStatus || "new"}
                </span>
              </div>
              {hoveredWordObj.phraseTranslation && (
                <div className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug break-words whitespace-pre-wrap font-semibold bg-amber-500/5 dark:bg-amber-400/5 p-2 rounded-lg border border-amber-500/15 dark:border-amber-400/15">
                  {normalizeTranslationSemicolons(hoveredWordObj.phraseTranslation)}
                </div>
              )}
            </div>
          ) : null}

          {hoveredWordObj.detectedPhraseText ? (
            <div className="flex flex-col gap-1.5 pb-1">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/60 pb-1.5">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-extrabold text-purple-600 dark:text-purple-400 capitalize truncate">
                    ✨ {hoveredWordObj.detectedPhraseText}
                  </span>
                </div>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded leading-none shrink-0 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-100/50 dark:border-purple-900/40 animate-pulse">
                  {getPhraseTypeLabel(hoveredWordObj.detectedPhraseType)} (ИИ)
                </span>
              </div>
              {hoveredWordObj.detectedPhraseTranslation && (
                <div className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug break-words whitespace-pre-wrap font-semibold bg-purple-500/5 dark:bg-purple-400/5 p-2 rounded-lg border border-purple-500/15 dark:border-purple-400/15">
                  {normalizeTranslationSemicolons(hoveredWordObj.detectedPhraseTranslation)}
                </div>
              )}
              {hoveredWordObj.detectedPhraseExplanation && (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal italic px-1">
                  {hoveredWordObj.detectedPhraseExplanation}
                </div>
              )}
            </div>
          ) : null}

          {(hoveredWordObj.translation || hoveredWordObj.parentWord || hoveredWordObj.imageUrl) ? (
            <div className={`flex flex-col gap-1.5 ${(hoveredWordObj.phraseText || hoveredWordObj.detectedPhraseText) ? "mt-1 pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-800/80" : ""}`}>
              <div className="flex items-center justify-between gap-2 pb-1.5">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 capitalize truncate">
                    {hoveredWordObj.word}
                  </span>
                  {hoveredWordObj.parentWord && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium lowercase italic">
                      ({hoveredWordObj.parentWord})
                    </span>
                  )}
                </div>
                
                {((hoveredWordObj.tags && hoveredWordObj.tags.length > 0) || hoveredWordObj.grammar) && (
                  <div className="flex gap-1 shrink-0">
                    {hoveredWordObj.tags && hoveredWordObj.tags.length > 0 ? (
                      hoveredWordObj.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-extrabold px-1.5 py-0.5 rounded border border-teal-100/50 dark:border-teal-900/40 leading-none"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-[9px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-extrabold px-1.5 py-0.5 rounded border border-teal-100/50 dark:border-teal-900/40 leading-none">
                        {hoveredWordObj.grammar}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {hoveredWordObj.imageUrl && (
                <div className="w-full h-32 overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center shrink-0">
                  <img
                    src={hoveredWordObj.imageUrl}
                    alt={hoveredWordObj.word}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              {hoveredWordObj.translation && (
                <div className="text-[11px] text-zinc-650 dark:text-zinc-300 leading-snug break-words whitespace-pre-wrap font-medium">
                  {normalizeTranslationSemicolons(hoveredWordObj.translation)}
                </div>
              )}
            </div>
          ) : null}
        </TooltipPortal>
      )}
    </div>
  );
}
