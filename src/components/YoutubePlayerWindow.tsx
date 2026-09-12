import React, { useState, useEffect, useRef } from "react";
import { GripHorizontal, X, ChevronDown, ChevronUp, Tv, RefreshCw, Download, AlertTriangle, Loader2, HardDrive, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Lesson } from "../types";
import { useLesson } from "../context/LessonContext";
import { settingsStore } from "../db";
import { usePlaylistStore } from "../store/playlistStore";

interface YoutubePlayerWindowProps {
  lesson: Lesson;
  onClose: () => void;
  onListeningTick?: (seconds: number, forceFlush?: boolean, exactTime?: number) => void;
  onVideoEnded?: () => void;
}

export default function YoutubePlayerWindow({
  lesson,
  onClose,
  onListeningTick,
  onVideoEnded,
}: YoutubePlayerWindowProps) {
  const { t } = useTranslation();
  const { setCurrentTime, seekToTime, playbackRate } = useLesson();
  const { youtubeId } = lesson;
  const lastTickTimeRef = useRef<number | null>(null);
  if (!youtubeId) return null;

  // Track minimized (rolled up) state
  const [isMinimized, setIsMinimized] = useState(false);

  // Dragging and resizing temporary lock states to shield mouse events from iframe
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Local media & embed restriction states
  const [localMediaUrl, setLocalMediaUrl] = useState<string | null>(lesson.localVideoUrl || null);
  const [useLocalMedia, setUseLocalMedia] = useState<boolean>(!!lesson.localVideoUrl);
  const [isEmbedBlocked, setIsEmbedBlocked] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; speed: string; eta: string }>({ percent: 0, speed: "", eta: "" });
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Default window dimensions in pixels (440px wide, 248px content height + 44px header = 292px)
  const [size, setSize] = useState({ width: 440, height: 292 });
  const [position, setPosition] = useState({ x: 20, y: 150 });
  const [iframeKey, setIframeKey] = useState(0); // For reloading the player if needed

  const windowRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initTimeoutRef = useRef<any>(null);
  const trackingIntervalRef = useRef<any>(null);
  const progressPollIntervalRef = useRef<any>(null);
  const lastContextTimeRef = useRef<number>(0);
  const lastStorageSaveTimeRef = useRef<number>(0);
  const hasRestoredPositionRef = useRef<boolean>(false);
  const initialSeekTargetRef = useRef<number>(0);

  // Parse saved progress
  const parseSavedVideoProgress = (raw: string | null): number => {
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number") return parsed > 2 ? Math.floor(parsed) : 0;
      if (parsed && typeof parsed === "object" && parsed.progress !== undefined) {
        const sec = parseFloat(parsed.progress);
        return !isNaN(sec) && sec > 2 ? Math.floor(sec) : 0;
      }
      const sec = parseFloat(raw);
      return !isNaN(sec) && sec > 2 ? Math.floor(sec) : 0;
    } catch (_) {
      const sec = parseFloat(raw);
      return !isNaN(sec) && sec > 2 ? Math.floor(sec) : 0;
    }
  };

  const saveProgressNow = (time: number) => {
    if (time === undefined || isNaN(time) || time <= 2) return;
    try {
      const seconds = Math.floor(time);
      const updatedAt = Date.now();
      const payload = JSON.stringify({ progress: seconds, updatedAt });
      localStorage.setItem(`youtube_progress_${lesson.id}`, payload);
      settingsStore.setItem(`youtube_progress_${lesson.id}`, payload).catch(() => {});
      lastStorageSaveTimeRef.current = Date.now();
      window.dispatchEvent(new CustomEvent("lectura:save_progress", { detail: { lessonId: lesson.id, videoProgress: payload } }));

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
          type: "video",
          lessonId: lesson.id,
          progress: seconds,
          updatedAt
        })
      }).catch(() => {});
    } catch (e) {}
  };

  // Check if media is already downloaded on backend
  useEffect(() => {
    if (lesson.localVideoUrl) {
      setLocalMediaUrl(lesson.localVideoUrl);
      setUseLocalMedia(true);
      return;
    }

    let isSubscribed = true;
    fetch(`/api/media/status?videoId=${youtubeId}&lessonId=${lesson.id}`)
      .then(res => res.json())
      .then(data => {
        if (!isSubscribed) return;
        if (data.exists && data.url) {
          setLocalMediaUrl(data.url);
        }
        if (data.downloading) {
          setIsDownloading(true);
        }
      })
      .catch(() => {});

    return () => {
      isSubscribed = false;
    };
  }, [lesson.id, lesson.localVideoUrl, youtubeId]);

  // Handler for downloading media via yt-dlp with live progress polling
  const handleDownloadMedia = async (onlyAudio: boolean = false) => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress({ percent: 1, speed: "", eta: "" });

    // Start progress polling interval
    if (progressPollIntervalRef.current) clearInterval(progressPollIntervalRef.current);
    progressPollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/media/progress?videoId=${youtubeId}&lessonId=${lesson.id}&onlyAudio=${onlyAudio ? "1" : "0"}`);
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.percent === "number") {
            setDownloadProgress({
              percent: Math.min(100, Math.max(1, Math.round(data.percent))),
              speed: data.speed || "",
              eta: data.eta || ""
            });
          }
        }
      } catch (_) {}
    }, 400);

    try {
      const res = await fetch("/api/media/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: youtubeId,
          lessonId: lesson.id,
          onlyAudio,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || t('explainer.yt_download_error', 'Не удалось скачать медиафайл'));
      }
      setDownloadProgress({ percent: 100, speed: "", eta: "" });
      setLocalMediaUrl(data.url);
      setUseLocalMedia(true);
      setIsEmbedBlocked(false);
    } catch (err: any) {
      console.error("Failed to download media with yt-dlp:", err);
      setDownloadError(err.message || t('explainer.yt_download_error', 'Ошибка загрузки'));
    } finally {
      if (progressPollIntervalRef.current) {
        clearInterval(progressPollIntervalRef.current);
        progressPollIntervalRef.current = null;
      }
      setIsDownloading(false);
    }
  };

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
    if (useLocalMedia) return;

    let isUnmounted = false;

    const container = containerRef.current;
    if (!container) return;

    // Clear any existing children (removes old iframe or placeholder)
    container.innerHTML = "";

    // Create a fresh placeholder div for YT to replace
    const placeholder = document.createElement("div");
    placeholder.id = `yt-player-iframe-${lesson.id}`;
    container.appendChild(placeholder);

    const startTrackingTime = () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
          // Expose globally for unified history queries
          (window as any).getYoutubeCurrentTime = () => {
            try {
              if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
                return playerRef.current.getCurrentTime();
              }
            } catch (_) {}
            return 0;
          };

          try {
            const time = playerRef.current.getCurrentTime();
            if (time !== undefined) {
              // Mark position as restored once playback passes initial seek target
              if (!hasRestoredPositionRef.current && initialSeekTargetRef.current > 0) {
                if (time >= initialSeekTargetRef.current - 2) {
                  hasRestoredPositionRef.current = true;
                }
              } else if (!hasRestoredPositionRef.current) {
                hasRestoredPositionRef.current = true;
              }

              if (Math.abs(time - lastContextTimeRef.current) >= 0.5) {
                lastContextTimeRef.current = time;
                setCurrentTime(time);
              }
              if (Date.now() - lastStorageSaveTimeRef.current >= 3000) {
                saveProgressNow(time);
              }
            }
          } catch (e) {}
        }
      }, 500);
    };

    const stopTrackingTime = () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      let elapsed = 0;
      if (lastTickTimeRef.current) {
        elapsed = Math.round((Date.now() - lastTickTimeRef.current) / 1000);
      }
      lastTickTimeRef.current = null;
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        (window as any).getYoutubeCurrentTime = null;
        try {
          const time = playerRef.current.getCurrentTime();
          if (time !== undefined) {
            saveProgressNow(time);
            if (onListeningTick) {
              if (elapsed >= 1 && elapsed < 7200) {
                onListeningTick(elapsed, true, time);
              } else {
                onListeningTick(0, true, time);
              }
            }
          }
        } catch (e) {}
      }
    };

    const getInitialSeekTarget = (): number => {
      let startSeconds = 0;
      try {
        const savedProgress = localStorage.getItem(`youtube_progress_${lesson.id}`);
        startSeconds = parseSavedVideoProgress(savedProgress);
        
        if (!startSeconds) {
           const histRaw = localStorage.getItem("vocab_clone_reading_history");
           if (histRaw) {
             const histArr = JSON.parse(histRaw);
             histArr.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
             const match = histArr.find((h: any) => h.lessonId === lesson.id || h.guid === youtubeId);
             if (match && match.lastPosition > 0) {
               startSeconds = Math.floor(match.lastPosition);
             }
           }
        }
      } catch (e) {}
      return startSeconds;
    };

    const initPlayer = () => {
      if (isUnmounted) return;

      const YT = (window as any).YT;

      const startSeconds = getInitialSeekTarget();
      
      initialSeekTargetRef.current = startSeconds;
      if (startSeconds > 0) {
        setCurrentTime(startSeconds);
      }

      if (YT && YT.Player) {
        try {
          playerRef.current = new YT.Player(placeholder, {
            width: "100%",
            height: "100%",
            videoId: youtubeId,
            playerVars: {
              enablejsapi: 1,
              controls: 1,
              rel: 0,
              autoplay: 0,
              playsinline: 1,
              modestbranding: 0,
              origin: typeof window !== "undefined" ? window.location.origin : undefined,
              start: startSeconds > 0 ? startSeconds : undefined,
            },
            events: {
              onReady: (event: any) => {
                if (isUnmounted) return;
                playerRef.current = event.target;
                const player = event.target;
                if (playbackRate && player && typeof player.setPlaybackRate === "function") {
                  try { player.setPlaybackRate(playbackRate); } catch (e) {}
                }

                let currentStartSeconds = startSeconds;
                try {
                  const freshSaved = localStorage.getItem(`youtube_progress_${lesson.id}`);
                  const parsedFresh = parseSavedVideoProgress(freshSaved);
                  if (parsedFresh > 2) {
                    currentStartSeconds = parsedFresh;
                  }
                } catch (e) {}

                const targetSeek = (seekToTime !== null && seekToTime !== undefined) ? seekToTime : currentStartSeconds;

                if (targetSeek > 0 && player && typeof player.seekTo === "function") {
                  try {
                    player.seekTo(targetSeek, true);
                  } catch (e) {}
                  setTimeout(() => {
                    if (isUnmounted) return;
                    try {
                      player.seekTo(targetSeek, true);
                    } catch (e) {}
                  }, 300);
                  setTimeout(() => {
                    if (isUnmounted) return;
                    try {
                      player.seekTo(targetSeek, true);
                    } catch (e) {}
                  }, 800);
                }
              },
              onStateChange: (event: any) => {
                if (isUnmounted) return;
                playerRef.current = event.target;
                const state = event.data;
                const YTStates = (window as any).YT?.PlayerState;

                // 1: PLAYING
                if (state === 1 || (YTStates && state === YTStates.PLAYING)) {
                  lastTickTimeRef.current = Date.now();
                  usePlaylistStore.getState().setIsPlaying(false);
                  window.dispatchEvent(new CustomEvent("media-play-start", { detail: { trackId: lesson.id, guid: youtubeId } }));
                  startTrackingTime();
                } 
                // 2: PAUSED, 0: ENDED, 3: BUFFERING, -1: UNSTARTED, 5: CUED
                else if (
                  state === 2 || state === 0 || state === 3 || state === -1 || state === 5 ||
                  (YTStates && (
                    state === YTStates.PAUSED || 
                    state === YTStates.ENDED || 
                    state === YTStates.BUFFERING ||
                    state === YTStates.UNSTARTED ||
                    state === YTStates.CUED
                  ))
                ) {
                  stopTrackingTime();
                }

                if (state === 0 || (YTStates && state === YTStates.ENDED)) {
                  try {
                    const dur = Math.round(playerRef.current?.getDuration?.() || lesson.duration || 0);
                    if (onListeningTick && dur > 0) {
                      onListeningTick(0, true, dur);
                    }
                    localStorage.removeItem(`youtube_progress_${lesson.id}`);
                    settingsStore.removeItem(`youtube_progress_${lesson.id}`).catch(() => {});
                    window.dispatchEvent(new CustomEvent("lectura:save_progress", { detail: { lessonId: lesson.id, videoProgress: "0" } }));
                  } catch (e) {}
                  if (onVideoEnded) onVideoEnded();
                }
              },
              onError: (event: any) => {
                if (isUnmounted) return;
                console.warn("YouTube Player error:", event.data);
                // 101 / 150: Embed restricted by owner. 2 / 5 / 100: invalid / blocked.
                if (event.data === 101 || event.data === 150 || event.data === 100 || event.data === 2 || event.data === 5) {
                  setIsEmbedBlocked(true);
                }
              }
            },
          });
        } catch (error) {
          console.error("Failed to construct YouTube Player:", error);
        }
      } else {
        initTimeoutRef.current = setTimeout(initPlayer, 300);
      }
    };

    initPlayer();

    return () => {
      isUnmounted = true;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      (window as any).getYoutubeCurrentTime = null;

      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        try {
          const time = playerRef.current.getCurrentTime();
          if (time !== undefined && !isNaN(time)) {
            saveProgressNow(time);
          }
        } catch (e) {}
      }

      try {
        if (playerRef.current && typeof playerRef.current.destroy === "function") {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      } catch (err) {}
    };
  }, [youtubeId, iframeKey, lesson.id, useLocalMedia]);

  // Synchronize seekToTime to active player (HTML5 video or YouTube iframe)
  const effectiveSeek = seekToTime;

  useEffect(() => {
    if (effectiveSeek !== null && effectiveSeek !== undefined) {
      if (useLocalMedia && videoElRef.current) {
        try {
          videoElRef.current.currentTime = effectiveSeek;
          videoElRef.current.play().catch(() => {});
        } catch (e) {}
      } else if (playerRef.current && typeof playerRef.current.seekTo === "function") {
        try {
          playerRef.current.seekTo(effectiveSeek, true);
          if (typeof playerRef.current.playVideo === "function") {
            playerRef.current.playVideo();
          }
        } catch (e) {
          console.error("Seeking YouTube video failed:", e);
        }
      }
    }
  }, [effectiveSeek, useLocalMedia]);

  // Synchronize playbackRate (speed) across HTML5 video and YouTube iframe
  useEffect(() => {
    const rate = playbackRate || 1;
    if (useLocalMedia && videoElRef.current) {
      try {
        videoElRef.current.playbackRate = rate;
      } catch (e) {}
    } else if (playerRef.current && typeof playerRef.current.setPlaybackRate === "function") {
      try {
        playerRef.current.setPlaybackRate(rate);
      } catch (e) {}
    }
  }, [playbackRate, useLocalMedia]);

  // Helper to read the current interface zoom factor
  const getZoomFactor = (): number => {
    if (typeof document !== "undefined" && document.body) {
      const zoomProp = (document.body.style as any).zoom;
      if (zoomProp) {
        const val = parseFloat(zoomProp);
        if (!isNaN(val) && val > 0) return val;
      }
      const scaleMatch = document.body.style.transform?.match(/scale\(([^)]+)\)/);
      if (scaleMatch && scaleMatch[1]) {
        const val = parseFloat(scaleMatch[1]);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return 1;
  };

  // Position initialized to bottom-right corner when first loading, adjusted for interface zoom
  useEffect(() => {
    const handleInitialLayout = () => {
      const s = getZoomFactor();
      const padding = 24;
      const initialX = Math.max(10, (window.innerWidth - padding) / s - size.width);
      const initialY = Math.max(10, (window.innerHeight - padding) / s - (isMinimized ? 44 : size.height));
      setPosition({ x: initialX, y: initialY });
    };

    const timer = setTimeout(handleInitialLayout, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep window in bounds when screen size changes
  useEffect(() => {
    const handleResize = () => {
      const s = getZoomFactor();
      setPosition((prev) => {
        const maxX = window.innerWidth / s - size.width;
        const maxY = window.innerHeight / s - (isMinimized ? 44 : size.height);
        
        const nextX = Math.max(10, Math.min(maxX - 10, prev.x));
        const nextY = Math.max(10, Math.min(maxY - 10, prev.y));
        return { x: nextX, y: nextY };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [size.width, size.height, isMinimized]);

  // Handle Dragging
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("svg") || (e.target as HTMLElement).closest("input")) {
      return;
    }

    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();

    setIsDragging(true);

    const isTouch = e.type.startsWith("touch");
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;

    const startX = clientX;
    const startY = clientY;
    const startPosX = position.x;
    const startPosY = position.y;

    const s = getZoomFactor();

    const handleDragMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      moveEvent.stopPropagation();

      const isTouchMove = moveEvent.type.startsWith("touch");
      const curX = isTouchMove ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const curY = isTouchMove ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;

      const deltaX = (curX - startX) / s;
      const deltaY = (curY - startY) / s;

      const minX = -size.width + 120;
      const maxX = window.innerWidth / s - 120;
      const minY = 4;
      const maxY = window.innerHeight / s - 44;

      const nextX = Math.max(minX, Math.min(maxX, startPosX + deltaX));
      const nextY = Math.max(minY, Math.min(maxY, startPosY + deltaY));

      setPosition({ x: nextX, y: nextY });
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("blur", handleDragEnd);
      document.removeEventListener("touchmove", handleDragMove as any);
      document.removeEventListener("touchend", handleDragEnd);
      document.removeEventListener("touchcancel", handleDragEnd);
    };

    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("blur", handleDragEnd);
    document.addEventListener("touchmove", handleDragMove, { passive: false });
    document.addEventListener("touchend", handleDragEnd);
    document.addEventListener("touchcancel", handleDragEnd);
  };

  type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  // Handle Drag/Manual Resizing from any edge or corner - keeping aspect ratio (16:9) of video perfectly intact!
  const handleResizeStart = (direction: ResizeDirection) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const isTouch = e.type.startsWith("touch");
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;

    const startWidth = size.width;
    const startHeight = size.height;
    const startPosX = position.x;
    const startPosY = position.y;
    const startX = clientX;
    const startY = clientY;

    const s = getZoomFactor();
    const minWidth = 260;
    const maxWidth = Math.max(minWidth, Math.min(window.innerWidth / s - 20, 1100));

    const handleResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      moveEvent.stopPropagation();

      const isTouchMove = moveEvent.type.startsWith("touch");
      const curX = isTouchMove ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const curY = isTouchMove ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;

      const deltaX = (curX - startX) / s;
      const deltaY = (curY - startY) / s;

      let deltaW = 0;

      switch (direction) {
        case "e":
          deltaW = deltaX;
          break;
        case "w":
          deltaW = -deltaX;
          break;
        case "s":
          deltaW = deltaY * (16 / 9);
          break;
        case "n":
          deltaW = -deltaY * (16 / 9);
          break;
        case "se":
          deltaW = Math.abs(deltaX) > Math.abs(deltaY * (16 / 9)) ? deltaX : deltaY * (16 / 9);
          break;
        case "sw":
          deltaW = Math.abs(-deltaX) > Math.abs(deltaY * (16 / 9)) ? -deltaX : deltaY * (16 / 9);
          break;
        case "ne":
          deltaW = Math.abs(deltaX) > Math.abs(-deltaY * (16 / 9)) ? deltaX : -deltaY * (16 / 9);
          break;
        case "nw":
          deltaW = Math.abs(-deltaX) > Math.abs(-deltaY * (16 / 9)) ? -deltaX : -deltaY * (16 / 9);
          break;
      }

      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaW));
      const contentHeight = Math.round((nextWidth * 9) / 16);
      const nextHeight = contentHeight + 44;

      // Calculate anchor position shifts based on edge
      let nextX = startPosX;
      let nextY = startPosY;

      if (direction === "w" || direction === "nw" || direction === "sw") {
        nextX = startPosX - (nextWidth - startWidth);
      }
      if (direction === "n" || direction === "nw" || direction === "ne") {
        nextY = startPosY - (nextHeight - startHeight);
      }

      // Viewport boundaries clamping so window isn't pushed offscreen
      const minX = -nextWidth + 120;
      const maxX = window.innerWidth / s - 120;
      const minY = 4;
      const maxY = window.innerHeight / s - 44;

      nextX = Math.max(minX, Math.min(maxX, nextX));
      nextY = Math.max(minY, Math.min(maxY, nextY));

      setSize({ width: nextWidth, height: nextHeight });
      setPosition({ x: nextX, y: nextY });
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      window.removeEventListener("mouseup", handleResizeEnd);
      window.removeEventListener("blur", handleResizeEnd);
      document.removeEventListener("touchmove", handleResizeMove as any);
      document.removeEventListener("touchend", handleResizeEnd);
      document.removeEventListener("touchcancel", handleResizeEnd);
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    window.addEventListener("mouseup", handleResizeEnd);
    window.addEventListener("blur", handleResizeEnd);
    document.addEventListener("touchmove", handleResizeMove, { passive: false });
    document.addEventListener("touchend", handleResizeEnd);
    document.addEventListener("touchcancel", handleResizeEnd);
  };

  // Preset size handlers
  const applyPresetSize = (preset: "small" | "medium" | "large") => {
    const s = getZoomFactor();
    if (preset === "small") {
      setSize({ width: 340, height: Math.round((340 * 9) / 16) + 44 });
    } else if (preset === "medium") {
      setSize({ width: 440, height: Math.round((440 * 9) / 16) + 44 });
    } else if (preset === "large") {
      const targetWidth = Math.min(640, window.innerWidth / s - 44);
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
        className={`h-11 px-3 bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between select-none shrink-0 touch-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        title={t('explainer.yt_drag', 'Перетащите плеер удерживая левую кнопку мыши')}
      >
        <div className="flex items-center gap-2 max-w-[45%]">
          <GripHorizontal className="w-4 h-4 text-zinc-400 dark:text-zinc-600" />
          <Tv className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 truncate" title={lesson.title}>
            {lesson.title}
          </span>
        </div>

        {/* Control toolbar */}
        <div className="flex items-center gap-1">
          {/* Toggle between Local Video and YouTube Stream if local is ready */}
          {!isMinimized && localMediaUrl && (
            <button
              type="button"
              onClick={() => {
                setUseLocalMedia(prev => !prev);
                setIsEmbedBlocked(false);
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 transition-colors cursor-pointer mr-1 ${
                useLocalMedia
                  ? "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-300 dark:border-teal-800"
                  : "bg-zinc-200/60 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:text-zinc-800"
              }`}
              title={useLocalMedia ? t('explainer.yt_source_local', 'Локальное видео') : t('explainer.yt_source_youtube', 'YouTube онлайн')}
            >
              {useLocalMedia ? (
                <>
                  <HardDrive className="w-2.5 h-2.5" />
                  <span>MP4</span>
                </>
              ) : (
                <>
                  <Globe className="w-2.5 h-2.5" />
                  <span>YT</span>
                </>
              )}
            </button>
          )}

          {/* Quick download button if not yet downloaded and not blocked */}
          {!isMinimized && !localMediaUrl && !isEmbedBlocked && (
            isDownloading ? (
              <div
                className="relative flex items-center px-2 py-0.5 rounded-md bg-teal-500/10 dark:bg-teal-950/40 border border-teal-500/30 text-teal-600 dark:text-teal-400 text-[10px] font-bold select-none overflow-hidden cursor-wait"
                title={`${downloadProgress.percent}% • ${downloadProgress.eta ? `${t('explainer.yt_eta', 'Осталось')}: ${downloadProgress.eta}` : t('explainer.yt_downloading', 'Загрузка...')} ${downloadProgress.speed ? `(${downloadProgress.speed})` : ''}`}
              >
                <div className="flex items-center gap-1.5 z-10">
                  <Loader2 className="w-3 h-3 animate-spin text-teal-500 shrink-0" />
                  <span className="font-mono font-bold leading-none">{downloadProgress.percent}%</span>
                  {downloadProgress.eta && (
                    <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[9px] leading-none">
                      · {downloadProgress.eta}
                    </span>
                  )}
                </div>
                {/* Background progress fill */}
                <div
                  className="absolute left-0 bottom-0 top-0 bg-teal-500/20 dark:bg-teal-500/25 transition-all duration-300 pointer-events-none"
                  style={{ width: `${Math.max(2, Math.min(100, downloadProgress.percent))}%` }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleDownloadMedia(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title={t('explainer.yt_download_tooltip', 'Скачать видео на сервер для офлайн-просмотра')}
              >
                <Download className="w-3 h-3" />
              </button>
            )
          )}

          {/* Presets */}
          {!isMinimized && (
            <div className="flex items-center bg-zinc-200/50 dark:bg-zinc-900/60 rounded-md p-0.5 mr-1 text-[9px] font-bold text-zinc-500">
              <button
                type="button"
                onClick={() => applyPresetSize("small")}
                className="px-1.5 py-0.5 rounded-sm hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
                title={t('explainer.yt_small', 'Маленький масштаб (16:9)')}
              >
                S
              </button>
              <button
                type="button"
                onClick={() => applyPresetSize("medium")}
                className="px-1.5 py-0.5 rounded-sm hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
                title={t('explainer.yt_medium', 'Средний масштаб (16:9)')}
              >
                M
              </button>
              <button
                type="button"
                onClick={() => applyPresetSize("large")}
                className="px-1.5 py-0.5 rounded-sm hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
                title={t('explainer.yt_large', 'Большой масштаб (16:9)')}
              >
                L
              </button>
            </div>
          )}

          {/* Refresh player */}
          <button
            type="button"
            onClick={() => {
              setIsEmbedBlocked(false);
              setIframeKey((prev) => prev + 1);
            }}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title={t('explainer.yt_refresh', 'Обновить видео')}
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          {/* Minimize/Restore */}
          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isMinimized ? t('explainer.yt_expand', 'Развернуть') : t('explainer.yt_collapse', 'Свернуть в панель')}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
            title={t('explainer.yt_close', 'Закрыть плеер')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Embed Media Player Container */}
      <div 
        style={{
          height: isMinimized ? "0px" : `${size.height - 44}px`,
          opacity: isMinimized ? 0 : 1,
          pointerEvents: isMinimized ? "none" : "auto"
        }} 
        className="w-full bg-black relative flex-1 transition-all duration-150 overflow-hidden"
      >
        {/* Case 1: Playing Local HTML5 Video */}
        {useLocalMedia && localMediaUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-black relative">
            <video
              ref={videoElRef}
              src={localMediaUrl}
              controls
              playsInline
              className="w-full h-full object-contain bg-black"
              onLoadedMetadata={() => {
                if (videoElRef.current) {
                  videoElRef.current.playbackRate = playbackRate || 1;
                  const startSec = initialSeekTargetRef.current || 0;
                  if (startSec > 2) {
                    videoElRef.current.currentTime = startSec;
                    setCurrentTime(startSec);
                  }
                }
              }}
              onTimeUpdate={() => {
                if (videoElRef.current) {
                  const time = videoElRef.current.currentTime;
                  if (Math.abs(time - lastContextTimeRef.current) >= 0.5) {
                    lastContextTimeRef.current = time;
                    setCurrentTime(time);
                  }
                  if (Date.now() - lastStorageSaveTimeRef.current >= 3000) {
                    saveProgressNow(time);
                  }
                }
                if (lastTickTimeRef.current) {
                  const now = Date.now();
                  const delta = (now - lastTickTimeRef.current) / 1000;
                  if (delta >= 5.0) {
                    if (delta > 0 && delta <= 15 && onListeningTick) {
                      const exactTime = videoElRef.current ? videoElRef.current.currentTime : 0;
                      onListeningTick(delta, false, exactTime);
                    }
                    lastTickTimeRef.current = now;
                  }
                }
              }}
              onPlay={() => {
                lastTickTimeRef.current = Date.now();
              }}
              onPause={() => {
                lastTickTimeRef.current = null;
                if (videoElRef.current) {
                  saveProgressNow(videoElRef.current.currentTime);
                  if (onListeningTick) {
                    onListeningTick(0, true, videoElRef.current.currentTime);
                  }
                }
              }}
              onEnded={() => {
                try {
                  const total = Math.round(videoElRef.current?.duration || lesson.duration || 0);
                  if (onListeningTick && total > 0) {
                    onListeningTick(0, true, total);
                  }
                  localStorage.removeItem(`youtube_progress_${lesson.id}`);
                  settingsStore.removeItem(`youtube_progress_${lesson.id}`).catch(() => {});
                  window.dispatchEvent(new CustomEvent("lectura:save_progress", { detail: { lessonId: lesson.id, videoProgress: "0" } }));
                } catch (e) {}
                if (onVideoEnded) onVideoEnded();
              }}
            />
          </div>
        ) : isEmbedBlocked ? (
          /* Case 2: YouTube Embedding Restricted (Errors 101/150) -> Informative Card & Local Download Action */
          <div className="absolute inset-0 z-50 w-full h-full flex flex-col items-center justify-center p-4 text-center bg-zinc-950 text-white select-none overflow-y-auto">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h4 className="text-xs font-bold text-amber-200 mb-1 max-w-[90%]">
              {t('explainer.yt_embed_blocked_title', 'Владелец видео ограничил его просмотр на других сайтах')}
            </h4>

            <p className="text-[10px] text-zinc-400 max-w-[85%] mb-3 leading-relaxed">
              {t('explainer.yt_embed_blocked_desc', 'Вы можете скачать медиафайл локально на сервер для бесшовного воспроизведения без ограничений.')}
            </p>

            {isDownloading ? (
              <div className="flex flex-col items-center gap-2 p-3 bg-zinc-900/90 rounded-xl border border-zinc-800 w-full max-w-[280px]">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                    <span className="text-[11px] font-bold text-teal-200">
                      {t('explainer.yt_downloading_msg', 'Загрузка с YouTube...')}
                    </span>
                  </div>
                  <span className="text-[12px] font-black text-teal-400 font-mono">
                    {downloadProgress.percent}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden border border-zinc-700/60 p-0.5">
                  <div
                    className="bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-sm shadow-teal-500/50"
                    style={{ width: `${Math.max(4, Math.min(100, downloadProgress.percent))}%` }}
                  />
                </div>

                {/* Speed & ETA */}
                <div className="flex items-center justify-between text-[9px] text-zinc-400 font-mono w-full px-0.5">
                  <span>{downloadProgress.speed || t('explainer.yt_download_wait', 'Подготовка файла...')}</span>
                  {downloadProgress.eta ? <span>ETA: {downloadProgress.eta}</span> : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 w-full max-w-[260px]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadMedia(false)}
                    className="flex-1 py-1.5 px-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[10px] font-bold shadow-md shadow-teal-900/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Download className="w-3 h-3" />
                    <span>{t('explainer.yt_download_video', 'Скачать видео (720p)')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadMedia(true)}
                    className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-[10px] font-bold border border-zinc-700 transition-all cursor-pointer active:scale-95"
                    title={t('explainer.yt_download_audio', 'Только аудио (M4A)')}
                  >
                    <span>{t('explainer.yt_download_audio', 'Аудио (M4A)')}</span>
                  </button>
                </div>

                {downloadError && (
                  <div className="p-2 bg-red-950/40 border border-red-800/60 rounded-lg text-[9px] text-red-300 text-left">
                    <p className="font-semibold">{t('explainer.yt_download_error', 'Не удалось скачать видео')}:</p>
                    <p className="text-red-400 mt-0.5 truncate">{downloadError}</p>
                    <button
                      type="button"
                      onClick={() => handleDownloadMedia(false)}
                      className="mt-1 text-teal-400 hover:underline text-[9px] font-bold cursor-pointer"
                    >
                      {t('explainer.yt_retry', 'Повторить попытку')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Case 3: Standard YouTube Player Iframe — ALWAYS clickable */
          <div className="relative w-full h-full">
            <div 
              ref={containerRef}
              className={`w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0 ${
                isDragging || isResizing ? "pointer-events-none" : "pointer-events-auto"
              }`}
            />

            {/* Guard overlay: active ONLY during active drag or resize so mouse doesn't stick inside iframe */}
            {(isDragging || isResizing) && (
              <div 
                className="absolute inset-0 bg-transparent z-40 cursor-grabbing pointer-events-auto" 
                onMouseUp={() => {
                  setIsDragging(false);
                  setIsResizing(false);
                }}
                onTouchEnd={() => {
                  setIsDragging(false);
                  setIsResizing(false);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Multi-Directional Resize Handles (Opera-style PiP — non-overlapping perimeter handles) ── */}
      {!isMinimized && (
        <>
          {/* Top Edge */}
          <div
            onMouseDown={handleResizeStart("n")}
            onTouchStart={handleResizeStart("n")}
            className="absolute top-0 inset-x-3 h-2 cursor-ns-resize z-30 bg-transparent touch-none"
          />
          {/* Bottom Edge — positioned on outer bottom border (-bottom-1) so it DOES NOT overlap YouTube controls */}
          <div
            onMouseDown={handleResizeStart("s")}
            onTouchStart={handleResizeStart("s")}
            className="absolute -bottom-1 inset-x-4 h-2 cursor-ns-resize z-30 bg-transparent touch-none"
          />
          {/* Left Edge */}
          <div
            onMouseDown={handleResizeStart("w")}
            onTouchStart={handleResizeStart("w")}
            className="absolute left-0 inset-y-4 w-1 cursor-ew-resize z-30 bg-transparent touch-none"
          />
          {/* Right Edge */}
          <div
            onMouseDown={handleResizeStart("e")}
            onTouchStart={handleResizeStart("e")}
            className="absolute right-0 inset-y-4 w-1 cursor-ew-resize z-30 bg-transparent touch-none"
          />
          {/* Top-Left Corner */}
          <div
            onMouseDown={handleResizeStart("nw")}
            onTouchStart={handleResizeStart("nw")}
            className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-30 bg-transparent touch-none"
          />
          {/* Top-Right Corner */}
          <div
            onMouseDown={handleResizeStart("ne")}
            onTouchStart={handleResizeStart("ne")}
            className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-30 bg-transparent touch-none"
          />
          {/* Bottom-Left Corner */}
          <div
            onMouseDown={handleResizeStart("sw")}
            onTouchStart={handleResizeStart("sw")}
            className="absolute -bottom-1 -left-1 w-3 h-3 cursor-nesw-resize z-30 bg-transparent touch-none"
          />
          {/* Bottom-Right Corner & Visual Grip */}
          <div
            onMouseDown={handleResizeStart("se")}
            onTouchStart={handleResizeStart("se")}
            className="absolute -bottom-1 -right-1 w-4 h-4 cursor-nwse-resize z-30 flex items-end justify-end p-0.5 text-zinc-400 hover:text-white group bg-transparent select-none touch-none"
            title={t('explainer.yt_resize', 'Потяните для изменения размера (сохраняет 16:9)')}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="fill-current text-zinc-400 opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none"
            >
              <path d="M8 8L2 8M8 8L8 2M8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
