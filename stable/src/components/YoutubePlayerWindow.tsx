import React, { useState, useEffect, useRef, useMemo } from "react";
import { GripHorizontal, X, ChevronDown, ChevronUp, Maximize2, Minimize2, Tv, RefreshCw } from "lucide-react";
import { Lesson } from "../types";

interface YoutubePlayerWindowProps {
  lesson: Lesson;
  onClose: () => void;
  onTimeUpdate?: (seconds: number) => void;
  seekToSeconds?: number | null;
  onSeekComplete?: () => void;
}

export default function YoutubePlayerWindow({
  lesson,
  onClose,
  onTimeUpdate,
  seekToSeconds,
  onSeekComplete,
}: YoutubePlayerWindowProps) {
  const { youtubeId } = lesson;
  if (!youtubeId) return null;

  // Track minimized (rolled up) state
  const [isMinimized, setIsMinimized] = useState(false);

  // Dragging and resizing temporary lock states to shield mouse events from iframe
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Default window dimensions in pixels (440px wide, 248px content height + 44px header = 292px)
  const [size, setSize] = useState({ width: 440, height: 292 });
  const [position, setPosition] = useState({ x: 20, y: 150 });
  const [iframeKey, setIframeKey] = useState(0); // For reloading the player if needed

  const windowRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load YouTube Player API script
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const target = document.head || document.body;
      if (target) {
        target.appendChild(tag);
      }
    }
  }, []);

  // Initialize YT Player on dynamic placeholder once DOM is ready and API loaded
  useEffect(() => {
    let timer: any;
    let isUnmounted = false;

    const container = containerRef.current;
    if (!container) return;

    // Clear any existing children (removes old iframe or placeholder)
    container.innerHTML = "";

    // Create a fresh placeholder div for YT to replace
    const playerDiv = document.createElement("div");
    container.appendChild(playerDiv);

    const initPlayer = () => {
      if (isUnmounted) return;

      const YT = (window as any).YT;

      if (YT && YT.Player) {
        try {
          playerRef.current = new YT.Player(playerDiv, {
            width: "100%",
            height: "100%",
            videoId: youtubeId,
            playerVars: {
              enablejsapi: 1,
              rel: 0,
              autoplay: 0,
              playsinline: 1,
            },
            events: {
              onReady: () => {
                if (isUnmounted) return;
                console.log("YouTube Player is ready");
                if (seekToSeconds !== null && seekToSeconds !== undefined) {
                  playerRef.current.seekTo(seekToSeconds, true);
                }
              },
              onStateChange: (event: any) => {
                // event.data === 1 (YT.PlayerState.PLAYING)
                if (event.data === 1) {
                  startTrackingTime();
                } else {
                  stopTrackingTime();
                }
              },
            },
          });
        } catch (error) {
          console.error("Failed to construct YouTube Player:", error);
        }
      } else {
        timer = setTimeout(initPlayer, 300);
      }
    };

    const startTrackingTime = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
          try {
            const currentTime = playerRef.current.getCurrentTime();
            if (currentTime !== undefined && onTimeUpdate) {
              onTimeUpdate(currentTime);
            }
          } catch (e) {
            // ignore temporary access issues
          }
        }
      }, 250);
    };

    const stopTrackingTime = () => {
      if (timer) clearInterval(timer);
    };

    initPlayer();

    return () => {
      isUnmounted = true;
      if (timer) clearInterval(timer);
      try {
        if (playerRef.current && typeof playerRef.current.destroy === "function") {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      } catch (err) {
        // ignore destroy errors on cleanup
      }
    };
  }, [youtubeId, iframeKey]);

  // Handle outside seek instructions matching timing jumps
  useEffect(() => {
    if (seekToSeconds !== null && seekToSeconds !== undefined && playerRef.current) {
      if (typeof playerRef.current.seekTo === "function") {
        try {
          playerRef.current.seekTo(seekToSeconds, true);
          if (typeof playerRef.current.playVideo === "function") {
            playerRef.current.playVideo();
          }
        } catch (e) {
          console.error("Seeking YouTube video failed:", e);
        }
        if (onSeekComplete) {
          onSeekComplete();
        }
      }
    }
  }, [seekToSeconds, onSeekComplete]);

  // Position initialized to bottom-right corner when first loading
  useEffect(() => {
    const handleInitialLayout = () => {
      const padding = 24;
      const initialX = Math.max(10, window.innerWidth - size.width - padding);
      const initialY = Math.max(10, window.innerHeight - (isMinimized ? 44 : size.height) - padding);
      setPosition({ x: initialX, y: initialY });
    };

    handleInitialLayout();
    // Re-adjust only once on start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Dragging
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    // Only allow dragging through the header or dedicated handle, not through sub-buttons
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("select")) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    const isTouch = e.type.startsWith("touch");
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;

    const startOffsetLeft = clientX - position.x;
    const startOffsetTop = clientY - position.y;

    const handleDragMove = (moveEvent: MouseEvent | TouchEvent) => {
      const isTouch = moveEvent.type.startsWith("touch");
      const curX = isTouch ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const curY = isTouch ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;

      let nextX = curX - startOffsetLeft;
      let nextY = curY - startOffsetTop;

      // Keep inside generous viewport boundaries
      // Let the user move almost entirely off-screen sideways, keeping at least 120px visible
      const minX = -size.width + 120;
      const maxX = window.innerWidth - 120;

      // Keep at least the header (44px) on screen at the bottom and top
      const minY = 4;
      const maxY = window.innerHeight - 44; 

      nextX = Math.max(minX, Math.min(maxX, nextX));
      nextY = Math.max(minY, Math.min(maxY, nextY));

      setPosition({ x: nextX, y: nextY });
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      document.removeEventListener("touchmove", handleDragMove);
      document.removeEventListener("touchend", handleDragEnd);
    };

    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
    document.addEventListener("touchmove", handleDragMove);
    document.addEventListener("touchend", handleDragEnd);
  };

  // Handle Drag/Manual Resizing - keeping aspect ratio (16:9) of video perfectly intact!
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const isTouch = e.type.startsWith("touch");
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;

    const startWidth = size.width;
    const startX = clientX;
    const startY = clientY;

    const handleResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
      const isTouch = moveEvent.type.startsWith("touch");
      const curX = isTouch ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const curY = isTouch ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;

      const deltaX = curX - startX;
      const deltaY = curY - startY;

      // Calculate horizontal and vertical scaled deltas
      const dragX = deltaX;
      const dragY = deltaY * (16 / 9);

      // Use the dominant displacement to ensure comfortable drag progression from any angle
      const deltaAdjusted = Math.abs(dragX) > Math.abs(dragY) ? dragX : dragY;

      // Width limits from 260px wide to 850px wide
      let nextWidth = Math.max(260, Math.min(window.innerWidth - 20, startWidth + deltaAdjusted));
      
      // Keep perfect 16:9 ratio of the video content!
      const contentHeight = Math.round((nextWidth * 9) / 16);
      const nextHeight = contentHeight + 44; // add the header bar height

      setSize({ width: nextWidth, height: nextHeight });
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.removeEventListener("touchmove", handleResizeMove);
      document.removeEventListener("touchend", handleResizeEnd);
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.addEventListener("touchmove", handleResizeMove);
    document.addEventListener("touchend", handleResizeEnd);
  };

  // Preset size handlers
  const applyPresetSize = (preset: "small" | "medium" | "large") => {
    if (preset === "small") {
      setSize({ width: 340, height: Math.round((340 * 9) / 16) + 44 });
    } else if (preset === "medium") {
      setSize({ width: 440, height: Math.round((440 * 9) / 16) + 44 });
    } else if (preset === "large") {
      const targetWidth = Math.min(640, window.innerWidth - 44);
      setSize({ width: targetWidth, height: Math.round((targetWidth * 9) / 16) + 44 });
    }
  };

  return (
    <div
      ref={windowRef}
      style={{
        width: `${size.width}px`,
        height: isMinimized ? "44px" : `${size.height}px`,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      className={`fixed bg-white dark:bg-zinc-900 border ${
        isDragging || isResizing 
          ? "border-teal-400 dark:border-teal-700 shadow-teal-500/10" 
          : "border-zinc-200 dark:border-zinc-800"
      } rounded-2xl shadow-2xl overflow-hidden z-[999] flex flex-col transition-colors duration-150 animate-in fade-in zoom-in-95`}
    >
      {/* Header bar - acts as Drag handle */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`h-11 px-3 bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-150 dark:border-zinc-850 flex items-center justify-between select-none shrink-0 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        title="Перетащите плеер удерживая левую кнопку мыши"
      >
        <div className="flex items-center gap-2 max-w-[50%]">
          <GripHorizontal className="w-4 h-4 text-zinc-400 dark:text-zinc-650" />
          <Tv className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 truncate" title={lesson.title}>
            {lesson.title}
          </span>
        </div>

        {/* Control toolbar */}
        <div className="flex items-center gap-1">
          {/* Presets */}
          {!isMinimized && (
            <div className="flex items-center bg-zinc-200/50 dark:bg-zinc-900/60 rounded-md p-0.5 mr-1 text-[9px] font-bold text-zinc-500">
              <button
                type="button"
                onClick={() => applyPresetSize("small")}
                className="px-1.5 py-0.5 rounded-sm hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
                title="Маленький масштаб (16:9)"
              >
                S
              </button>
              <button
                type="button"
                onClick={() => applyPresetSize("medium")}
                className="px-1.5 py-0.5 rounded-sm hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
                title="Средний масштаб (16:9)"
              >
                M
              </button>
              <button
                type="button"
                onClick={() => applyPresetSize("large")}
                className="px-1.5 py-0.5 rounded-sm hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
                title="Большой масштаб (16:9)"
              >
                L
              </button>
            </div>
          )}

          {/* Refresh player */}
          <button
            type="button"
            onClick={() => setIframeKey((prev) => prev + 1)}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-850 transition-colors cursor-pointer"
            title="Обновить видео"
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          {/* Minimize/Restore */}
          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-850 transition-colors cursor-pointer"
            title={isMinimized ? "Развернуть" : "Свернуть в панель"}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
            title="Закрыть плеер"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Embed YouTube player container */}
      <div 
        style={{ height: isMinimized ? "0px" : `${size.height - 44}px`, display: isMinimized ? "none" : "block" }} 
        className="w-full bg-black relative flex-1"
      >
        {/* Dedicated YouTube player container - completely untouched by React's children reconciliation */}
        <div 
          ref={containerRef}
          className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
        />

        {/* Guard overlay: active when dragging/resizing so mouse track events never fail on top of the iframe */}
        {(isDragging || isResizing) && (
          <div className="absolute inset-0 bg-transparent z-40 cursor-grabbing" />
        )}

        {/* Custom Proportional Resize Handle icon on Bottom-Right */}
        <div
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-50 flex items-end justify-end p-0.5 text-zinc-400 hover:text-white group bg-transparent select-none"
          title="Потяните для изменения размера (сохраняет 16:9)"
        >
          {/* Visual indicators for drag handle */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="fill-current text-zinc-400 opacity-60 group-hover:opacity-100 transition-opacity"
          >
            <path d="M8 8L2 8M8 8L8 2M8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
