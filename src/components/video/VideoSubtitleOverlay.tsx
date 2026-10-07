import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Lesson, VocabItem, WordStatus } from "../../types";
import { useVocab } from "../../context/VocabContext";
import { ParsedSubtitleCue } from "../../utils/subtitleParser";
import {
  fetchWordMeaning,
  fetchSentenceTranslation,
  prefetchSentenceTranslations,
  normalizePossessiveSuffix,
  normalizeLanguage,
} from "../../utils";
import { getSuggestedLemmas } from "../../morphology";
import CalmSheetWordCard from "../CalmSheetWordCard";

// In-memory translation cache to make hovering fast with 0 network delay
const translationCache = new Map<string, string>();

interface VideoSubtitleOverlayProps {
  cues: ParsedSubtitleCue[];
  currentTime: number;
  lesson: Lesson;
  videoElement: HTMLVideoElement | null;
  isFullscreen: boolean;
  showSubtitles?: boolean;
  showDualSubtitles?: boolean;
}

interface ActiveWordData {
  word: string;
  contextSentence: string;
  elementRect: DOMRect | null;
}

export default function VideoSubtitleOverlay({
  cues,
  currentTime,
  lesson,
  videoElement,
  isFullscreen,
  showSubtitles = true,
  showDualSubtitles = false,
}: VideoSubtitleOverlayProps) {
  const { t } = useTranslation();
  const {
    vocab,
    wordLinks,
    handleSaveVocab,
    handleDeleteVocab,
    handleSaveWordLink,
    handleDeleteWordLink,
  } = useVocab();

  const [activeWordData, setActiveWordData] = useState<ActiveWordData | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [hoveredWord, setHoveredWord] = useState<{
    word: string;
    cleanWord: string;
    status: WordStatus;
    translation: string;
    rect: DOMRect;
  } | null>(null);

  const [popupPos, setPopupPos] = useState<{ left: number; bottom: number; maxHeight: number }>({
    left: 16,
    bottom: 120,
    maxHeight: 520,
  });

  const hoverTimeoutRef = useRef<any>(null);
  const subtitleBoxRef = useRef<HTMLDivElement>(null);
  const tokenSpansRef = useRef<Map<number, HTMLSpanElement>>(new Map());
  const isDraggingRef = useRef<boolean>(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const hasDraggedRef = useRef<boolean>(false);

  // Calculates coordinates to place popup card cleanly above the clicked token & subtitles
  const calculatePopupPos = useCallback((tokenRect: DOMRect): { left: number; bottom: number; maxHeight: number } => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupWidth = Math.min(430, viewportWidth - 32);

    // Horizontal: center over clicked word token
    const tokenCenter = tokenRect.left + (tokenRect.width / 2);
    let left = tokenCenter - (popupWidth / 2);
    left = Math.max(16, Math.min(left, viewportWidth - popupWidth - 16));

    // Vertical: strictly above the subtitle container with 12px gap
    const containerTop = subtitleBoxRef.current
      ? subtitleBoxRef.current.getBoundingClientRect().top
      : tokenRect.top;

    const bottom = Math.max(16, (viewportHeight - containerTop) + 12);
    const maxHeight = Math.max(260, Math.min(540, viewportHeight - bottom - 16));

    return {
      left: Math.round(left),
      bottom: Math.round(bottom),
      maxHeight: Math.round(maxHeight),
    };
  }, []);

  // Compute union bounding box across multiple token elements
  const computeUnionRect = useCallback((startIndex: number, endIndex: number): DOMRect | null => {
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;
    let found = false;

    for (let i = startIndex; i <= endIndex; i++) {
      const el = tokenSpansRef.current.get(i);
      if (el) {
        found = true;
        const rect = el.getBoundingClientRect();
        if (rect.left < minLeft) minLeft = rect.left;
        if (rect.top < minTop) minTop = rect.top;
        if (rect.right > maxRight) maxRight = rect.right;
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
      }
    }

    if (!found) return null;

    return new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop);
  }, []);

  // Clear selections when closing word card
  const handleCloseWordCard = useCallback(() => {
    setActiveWordData(null);
    setSelectedRange(null);
  }, []);

  // Recalculate popup position on window resize
  useEffect(() => {
    if (!activeWordData?.elementRect) return;

    const handleResize = () => {
      if (activeWordData?.elementRect) {
        setPopupPos(calculatePopupPos(activeWordData.elementRect));
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeWordData, calculatePopupPos]);

  const isShiftDownRef = useRef<boolean>(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Track global Shift key press and release
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        isShiftDownRef.current = true;
      }
      if (e.key === "Escape" && activeWordData) {
        e.stopPropagation();
        handleCloseWordCard();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        isShiftDownRef.current = false;
      }
    };

    const handleBlur = () => {
      isShiftDownRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [activeWordData, handleCloseWordCard]);

  // Click outside listener: close word card if clicked outside the card AND outside subtitles
  useEffect(() => {
    if (!activeWordData) return;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const insideCard = cardContainerRef.current?.contains(target);
      const insideSubtitles = subtitleBoxRef.current?.contains(target);

      // If clicked outside both card and subtitle box, close card
      if (!insideCard && !insideSubtitles) {
        handleCloseWordCard();
      }
    };

    // Use capture or standard bubbling on window
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [activeWordData, handleCloseWordCard]);

  // Lookup word info according to Lectura status priority
  const lookupWordInfo = useCallback(
    (rawWord: string): { status: WordStatus; cleanWord: string; translation?: string; vocabItem?: VocabItem } => {
      if (!rawWord) return { status: "new", cleanWord: "" };
      const clean = normalizePossessiveSuffix(rawWord.trim()).toLowerCase();
      if (!clean) return { status: "new", cleanWord: "" };

      const activeLang = normalizeLanguage(lesson.targetLanguage || "english").toLowerCase();
      const langKey = `${activeLang}_${clean}`;

      const findVocab = (key: string): VocabItem | undefined => {
        const raw = key.replace(/^[a-zA-Z]+_/, "").toLowerCase();
        return vocab[`${activeLang}_${raw}`] || vocab[raw] || vocab[key];
      };

      // 1. Direct match in user vocab
      const directItem = findVocab(clean);
      if (directItem) {
        return {
          status: directItem.status || "new",
          cleanWord: clean,
          translation: directItem.translation,
          vocabItem: directItem,
        };
      }

      // 2. Direct match via parent alias / word link
      const parent = wordLinks[langKey] || wordLinks[clean];
      if (parent) {
        const parentItem = findVocab(parent);
        if (parentItem) {
          return {
            status: parentItem.status || "new",
            cleanWord: clean,
            translation: parentItem.translation,
            vocabItem: parentItem,
          };
        }
      }

      // 3. Contraction normalization (e.g. let's -> let, user's -> user, don't -> do)
      const baseContraction = clean.replace(/['’]s$/, "").replace(/n['’]t$/, "");
      if (baseContraction && baseContraction !== clean) {
        const contractionItem = findVocab(baseContraction);
        if (contractionItem) {
          return {
            status: contractionItem.status || "new",
            cleanWord: clean,
            translation: contractionItem.translation,
            vocabItem: contractionItem,
          };
        }
      }

      // 4. Lemma suggestion via morphology engine
      if (lesson.targetLanguage) {
        try {
          const lemmas = getSuggestedLemmas(rawWord, lesson.targetLanguage);
          for (const lem of lemmas) {
            const lemLower = lem.toLowerCase();
            const lemItem = findVocab(lemLower);
            if (lemItem) {
              return {
                status: lemItem.status || "new",
                cleanWord: clean,
                translation: lemItem.translation,
                vocabItem: lemItem,
              };
            }
            const lemParent = wordLinks[`${activeLang}_${lemLower}`] || wordLinks[lemLower];
            if (lemParent) {
              const lemParentItem = findVocab(lemParent);
              if (lemParentItem) {
                return {
                  status: lemParentItem.status || "new",
                  cleanWord: clean,
                  translation: lemParentItem.translation,
                  vocabItem: lemParentItem,
                };
              }
            }
          }
        } catch (_) {}
      }

      return { status: "new", cleanWord: clean };
    },
    [vocab, wordLinks, lesson.targetLanguage]
  );

  // Active cue calculation based on current video timestamp
  const activeCue = useMemo(() => {
    if (!showSubtitles || !cues || cues.length === 0) return null;
    return cues.find((c) => currentTime >= c.start && currentTime < c.end) || null;
  }, [cues, currentTime, showSubtitles]);

  const [currentTranslation, setCurrentTranslation] = useState<string>("");

  // Resolve full sentence translation when dual subtitles are active
  useEffect(() => {
    if (!showSubtitles || !showDualSubtitles || !activeCue?.text) {
      setCurrentTranslation("");
      return;
    }

    let isSubscribed = true;
    const text = activeCue.text;
    const sLang = lesson.targetLanguage || "English";
    const tLang = lesson.translationLanguage || "Russian";

    fetchSentenceTranslation(text, sLang, tLang).then((trans) => {
      if (isSubscribed) {
        setCurrentTranslation(trans);
      }
    });

    // Prefetch next 5 cues in background
    if (cues && cues.length > 0) {
      const idx = cues.indexOf(activeCue);
      if (idx !== -1) {
        const nextTexts = cues.slice(idx + 1, idx + 6).map((c) => c.text);
        prefetchSentenceTranslations(nextTexts, sLang, tLang).catch(() => {});
      }
    }

    return () => {
      isSubscribed = false;
    };
  }, [activeCue?.text, showSubtitles, showDualSubtitles, lesson.targetLanguage, lesson.translationLanguage, cues]);

  // Handle hover over a word token with prefetching translation
  const handleTokenMouseEnter = (e: React.MouseEvent<HTMLElement>, coreWord: string) => {
    if (activeWordData) return; // Don't show hover tooltip if card is open
    const rect = e.currentTarget.getBoundingClientRect();
    const info = lookupWordInfo(coreWord);

    const cacheKey = `${lesson.targetLanguage}:${info.cleanWord}`;
    let trans = info.translation || translationCache.get(cacheKey) || "";

    setHoveredWord({
      word: coreWord,
      cleanWord: info.cleanWord,
      status: info.status,
      translation: trans,
      rect,
    });

    if (!trans) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(async () => {
        try {
          const fetched = await fetchWordMeaning(
            info.cleanWord,
            lesson.targetLanguage,
            lesson.translationLanguage || "ru"
          );
          if (fetched) {
            translationCache.set(cacheKey, fetched);
            setHoveredWord((prev) =>
              prev && prev.cleanWord === info.cleanWord
                ? { ...prev, translation: fetched }
                : prev
            );
          }
        } catch (_) {}
      }, 80);
    }
  };

  const handleTokenMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredWord(null);
  };

  // Clear selection on cue changes
  const prevCueRef = useRef<any>(null);
  useEffect(() => {
    if (activeCue !== prevCueRef.current) {
      prevCueRef.current = activeCue;
      if (activeWordData) {
        handleCloseWordCard();
      }
    }
  }, [activeCue, activeWordData, handleCloseWordCard]);

  // Split cue text into tokens preserving punctuation and core word indexes
  const parsedTokens = useMemo(() => {
    if (!activeCue?.text) return [];
    const parts = activeCue.text.trim().split(/\s+/).filter(Boolean);

    return parts.map((part, pIdx) => {
      const match =
        part.match(/^([\p{P}\s¿¡«"'(]*)([\p{L}\p{N}'-]+)([\p{P}\s?!.,:;"»')]*)$/u) ||
        part.match(/^([^a-zA-ZÀ-ÿ0-9_'-]*)([a-zA-ZÀ-ÿ0-9_'-]+)([^a-zA-ZÀ-ÿ0-9_'-]*)$/);

      if (!match) {
        return {
          raw: part,
          isWord: false,
          pIdx,
          coreWord: "",
          leadingPunct: "",
          trailingPunct: "",
        };
      }

      return {
        raw: part,
        isWord: true,
        pIdx,
        coreWord: match[2],
        leadingPunct: match[1],
        trailingPunct: match[3],
      };
    });
  }, [activeCue]);

  // Handle word token click with Shift + Click support
  const handleTokenClick = (e: React.MouseEvent<HTMLElement>, coreWord: string, tokenIndex: number) => {
    e.stopPropagation();
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredWord(null);

    // If mouse drag just completed multi-token selection, let mouseup handle it
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    // Pause video on word click
    if (videoElement && !videoElement.paused) {
      try {
        videoElement.pause();
      } catch (_) {}
    }

    const isShift = Boolean(e.shiftKey || isShiftDownRef.current);

    if (isShift && anchorIndex !== null && parsedTokens.length > 0) {
      const minIdx = Math.min(anchorIndex, tokenIndex);
      const maxIdx = Math.max(anchorIndex, tokenIndex);

      setSelectedRange({ start: minIdx, end: maxIdx });

      // Build phrase from all word tokens in the selected index range
      const selectedWords: string[] = [];
      for (let i = minIdx; i <= maxIdx; i++) {
        const item = parsedTokens[i];
        if (item && item.isWord && item.coreWord) {
          selectedWords.push(item.coreWord);
        }
      }
      const phraseText = selectedWords.join(" ").trim();

      const unionRect = computeUnionRect(minIdx, maxIdx);
      if (unionRect) {
        const pos = calculatePopupPos(unionRect);
        setPopupPos(pos);
      }

      setActiveWordData({
        word: phraseText || coreWord,
        contextSentence: activeCue?.text || "",
        elementRect: unionRect,
      });
    } else {
      // Single word selection
      setSelectedRange({ start: tokenIndex, end: tokenIndex });
      setAnchorIndex(tokenIndex);

      const rect = e.currentTarget.getBoundingClientRect();
      const pos = calculatePopupPos(rect);
      setPopupPos(pos);

      setActiveWordData({
        word: coreWord,
        contextSentence: activeCue?.text || "",
        elementRect: rect,
      });
    }
  };

  // Mouse down / move / up drag selection handlers
  const handleTokenMouseDown = (e: React.MouseEvent<HTMLElement>, tokenIndex: number) => {
    if (e.button !== 0) return; // Only primary mouse button
    isDraggingRef.current = true;
    dragStartIndexRef.current = tokenIndex;
    hasDraggedRef.current = false;
  };

  const handleTokenMouseEnterWithDrag = (
    e: React.MouseEvent<HTMLElement>,
    coreWord: string,
    tokenIndex: number
  ) => {
    if (isDraggingRef.current && dragStartIndexRef.current !== null) {
      if (dragStartIndexRef.current !== tokenIndex) {
        hasDraggedRef.current = true;
        const minIdx = Math.min(dragStartIndexRef.current, tokenIndex);
        const maxIdx = Math.max(dragStartIndexRef.current, tokenIndex);
        setSelectedRange({ start: minIdx, end: maxIdx });
      }
      return;
    }

    handleTokenMouseEnter(e, coreWord);
  };

  // Global mouseup to finalize dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (hasDraggedRef.current && dragStartIndexRef.current !== null && selectedRange) {
        // Pause video on phrase select
        if (videoElement && !videoElement.paused) {
          try {
            videoElement.pause();
          } catch (_) {}
        }

        const minIdx = selectedRange.start;
        const maxIdx = selectedRange.end;

        const selectedWords: string[] = [];
        for (let i = minIdx; i <= maxIdx; i++) {
          const item = parsedTokens[i];
          if (item && item.isWord && item.coreWord) {
            selectedWords.push(item.coreWord);
          }
        }
        const phraseText = selectedWords.join(" ").trim();

        if (phraseText) {
          const unionRect = computeUnionRect(minIdx, maxIdx);
          if (unionRect) {
            const pos = calculatePopupPos(unionRect);
            setPopupPos(pos);
          }

          setAnchorIndex(dragStartIndexRef.current);
          setActiveWordData({
            word: phraseText,
            contextSentence: activeCue?.text || "",
            elementRect: unionRect,
          });
        }
      }

      dragStartIndexRef.current = null;
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [activeCue, calculatePopupPos, computeUnionRect, parsedTokens, selectedRange, videoElement]);

  // Split cue text into tokens preserving punctuation
  const tokenElements = useMemo(() => {
    if (!parsedTokens || parsedTokens.length === 0) return null;

    return parsedTokens.map((item, pIdx) => {
      if (!item.isWord) {
        return (
          <span key={pIdx} className="text-white mx-0.5 select-none">
            {item.raw}
          </span>
        );
      }

      const { coreWord, leadingPunct, trailingPunct } = item;
      const info = lookupWordInfo(coreWord);

      const isInSelectedRange =
        selectedRange !== null && pIdx >= selectedRange.start && pIdx <= selectedRange.end;
      const isSingleSelected =
        !selectedRange && activeWordData?.word.toLowerCase() === coreWord.toLowerCase();
      const isSelected = isInSelectedRange || isSingleSelected;

      // Underline mode styling matching the browser extension
      let underlineClass = "";
      if (info.status === "new") {
        underlineClass = "underline decoration-[#38bdf8] decoration-[2.5px] underline-offset-4";
      } else if (info.status === "1") {
        underlineClass = "underline decoration-[#fb7185] decoration-[2.5px] underline-offset-4";
      } else if (info.status === "2") {
        underlineClass = "underline decoration-[#facc15] decoration-[2.5px] underline-offset-4";
      } else if (info.status === "3") {
        underlineClass = "underline decoration-[#34d399] decoration-[2.5px] underline-offset-4";
      } else if (info.status === "4") {
        underlineClass = "underline decoration-[#204bf4] decoration-[2.5px] underline-offset-4";
      } else if (info.status === "5") {
        underlineClass = "underline decoration-[#c084fc] decoration-[2.5px] underline-offset-4";
      } else {
        // known, ignored: clean white text without underline
        underlineClass = "no-underline";
      }

      return (
        <span key={pIdx} className="inline-block mx-0.5 whitespace-nowrap select-none">
          {leadingPunct && <span className="text-white">{leadingPunct}</span>}
          <span
            ref={(el) => {
              if (el) {
                tokenSpansRef.current.set(pIdx, el);
              } else {
                tokenSpansRef.current.delete(pIdx);
              }
            }}
            data-token-index={pIdx}
            data-word={coreWord.toLowerCase()}
            onMouseDown={(e) => handleTokenMouseDown(e, pIdx)}
            onClick={(e) => handleTokenClick(e, coreWord, pIdx)}
            onMouseEnter={(e) => handleTokenMouseEnterWithDrag(e, coreWord, pIdx)}
            onMouseLeave={handleTokenMouseLeave}
            className={`cursor-pointer px-1 py-0.5 rounded transition-all duration-100 text-white font-bold inline-block select-none ${underlineClass} ${
              isSelected
                ? "bg-sky-500/45 text-white ring-2 ring-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.6)]"
                : "hover:bg-white/20 hover:text-sky-200"
            }`}
            style={{
              textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)",
            }}
          >
            {coreWord}
          </span>
          {trailingPunct && <span className="text-white">{trailingPunct}</span>}
        </span>
      );
    });
  }, [parsedTokens, lookupWordInfo, selectedRange, activeWordData]);

  // Color mapping for hover tooltip status track bar
  const getStatusBarColor = (status: WordStatus) => {
    switch (status) {
      case "new":
        return "#38bdf8";
      case "1":
        return "#fb7185";
      case "2":
        return "#facc15";
      case "3":
        return "#34d399";
      case "4":
        return "#204bf4";
      case "5":
        return "#c084fc";
      case "known":
        return "#22c55e";
      default:
        return "#94a3b8";
    }
  };

  const activeLookup = activeWordData ? lookupWordInfo(activeWordData.word) : null;

  // Only display overlay in fullscreen mode to avoid duplicate subtitles
  // (In windowed/PiP mode, the Reader screen below already displays the text and interactive words)
  if (!isFullscreen) {
    return null;
  }

  return (
    <>
      {/* 1. Subtitle Banner Container */}
      {showSubtitles && activeCue && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-200 flex flex-col items-center ${
            isFullscreen ? "bottom-20 md:bottom-24 max-w-[90vw]" : "bottom-12 max-w-[94%]"
          }`}
        >
          <div
            ref={subtitleBoxRef}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`pointer-events-auto bg-black/85 px-6 py-2.5 rounded-2xl border border-white/10 shadow-2xl flex flex-col justify-center items-center text-center select-none backdrop-blur-xs ${
              isFullscreen ? "text-xl md:text-2xl leading-relaxed py-3.5 px-8" : "text-base md:text-lg leading-normal"
            }`}
          >
            {/* Primary line: interactive tokens */}
            <div className="flex flex-wrap justify-center items-center text-center">
              {tokenElements}
            </div>

            {/* Dual subtitles: translation line */}
            {showDualSubtitles && (
              <div className="w-full text-center text-sm md:text-base font-medium text-slate-300 mt-2 pt-1.5 border-t border-white/10 select-none animate-in fade-in duration-150 drop-shadow-sm">
                {currentTranslation || (
                  <span className="italic opacity-60 text-xs md:text-sm">
                    {t("explainer.translating", "Перевод...")}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Mini Hover Tooltip (Language Reactor style) */}
      {hoveredWord && !activeWordData && (
        <div
          className="fixed z-50 pointer-events-none animate-in fade-in duration-100 flex flex-col items-center"
          style={{
            top: `${Math.max(12, hoveredWord.rect.top - 12)}px`,
            left: `${hoveredWord.rect.left + hoveredWord.rect.width / 2}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="relative bg-[#0284c7] text-white px-3.5 py-2 rounded-lg shadow-2xl flex flex-col items-center min-w-[120px] max-w-[240px] text-center">
            {/* Translations */}
            <span className="font-bold text-[14px] leading-snug drop-shadow-xs truncate max-w-full">
              {hoveredWord.translation || t("explainer.translating", "Translating...")}
            </span>

            {/* Status bar track at bottom */}
            <div className="w-10 h-1 bg-black/30 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full w-full rounded-full transition-all"
                style={{ backgroundColor: getStatusBarColor(hoveredWord.status) }}
              />
            </div>

            {/* Downward triangle arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#0284c7]" />
          </div>
        </div>
      )}

      {/* 3. Word Card Popup (CalmSheetWordCard positioned directly above the word & subtitles) */}
      {activeWordData && (
        <div
          ref={cardContainerRef}
          style={{
            position: "fixed",
            left: `${popupPos.left}px`,
            bottom: `${popupPos.bottom}px`,
            width: "430px",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: `${popupPos.maxHeight}px`,
          }}
          className="z-50 pointer-events-auto overflow-y-auto rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 select-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <CalmSheetWordCard
            word={activeWordData.word}
            sentence={activeWordData.contextSentence}
            targetLanguage={lesson.targetLanguage}
            translationLanguage={lesson.translationLanguage || "ru"}
            existingVocab={activeLookup?.vocabItem}
            wordLinks={wordLinks}
            vocab={vocab}
            onSaveVocab={(vItem) => {
              handleSaveVocab(vItem, lesson.targetLanguage);
            }}
            onDeleteVocab={(w) => {
              handleDeleteVocab(w, lesson.targetLanguage);
            }}
            onSaveWordLink={(from, to) => {
              handleSaveWordLink(from, to, lesson.targetLanguage);
            }}
            onDeleteWordLink={(from) => {
              handleDeleteWordLink(from, lesson.targetLanguage);
            }}
            onClose={handleCloseWordCard}
            lessonText={lesson.text}
            currentLessonId={lesson.id}
          />
        </div>
      )}
    </>
  );
}

