import React, { useState, useEffect, useRef } from "react";
import { X, RefreshCw, ChevronDown, ChevronUp, Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Lesson } from "../types";
import { useLesson } from "../context/LessonContext";
import { settingsStore } from "../db";

type SizePreset = "small" | "medium" | "large";

// S/M/L control the MAX WIDTH of the player — aspect-ratio:16/9 auto-calculates height
// This guarantees zero letterboxing (black bars)
const MAX_WIDTHS: Record<SizePreset, string> = {
  small: "340px",
  medium: "540px",
  large: "100%",
};

interface FocusPinnedPlayerProps {
  lesson: Lesson;
  /** Hide the player (reverts to "Show Video" button in minimal bar) */
  onClose: () => void;
  /** Exit Focus Mode entirely */
  onExitFocus: () => void;
  onListeningTick?: (seconds: number) => void;
  onVideoEnded?: () => void;
}

export default function FocusPinnedPlayer({
  lesson,
  onClose,
  onExitFocus,
  onListeningTick,
  onVideoEnded,
}: FocusPinnedPlayerProps) {
  const { t } = useTranslation();
  const { setCurrentTime, seekToTime, setSeekToTime } = useLesson();
  const { youtubeId } = lesson;

  const [size, setSize] = useState<SizePreset>("medium");
  const [collapsed, setCollapsed] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const initTimeoutRef = useRef<any>(null);
  const trackingIntervalRef = useRef<any>(null);
  const lastContextTimeRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);

  if (!youtubeId) return null;

  // ── Track sticky player height → set scroll-padding-top on <html> so
  //    active subtitle lines never scroll under the pinned player ──────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--focus-player-height", `${h}px`);
      document.documentElement.style.scrollPaddingTop = `${h + 8}px`;
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      document.documentElement.style.removeProperty("--focus-player-height");
      document.documentElement.style.scrollPaddingTop = "";
    };
  }, []);

  // ── Load YouTube IFrame API ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || (window as any).YT) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  // ── Init YT Player ───────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    const ph = document.createElement("div");
    ph.id = `yt-focus-${lesson.id}-${iframeKey}`;
    container.appendChild(ph);

    let lastSave = 0;

    const saveNow = (time: number) => {
      if (!time || isNaN(time) || time <= 2) return;
      try {
        const val = Math.floor(time).toString();
        localStorage.setItem(`youtube_progress_${lesson.id}`, val);
        settingsStore.setItem(`youtube_progress_${lesson.id}`, val).catch(() => {});
        lastSave = Date.now();
        window.dispatchEvent(
          new CustomEvent("lectura:save_progress", {
            detail: { lessonId: lesson.id, videoProgress: val },
          })
        );
      } catch {}
    };

    const startTracking = () => {
      lastTickRef.current = Date.now();
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
          try {
            const t = playerRef.current.getCurrentTime();
            if (t !== undefined) {
              if (Math.abs(t - lastContextTimeRef.current) >= 0.5) {
                lastContextTimeRef.current = t;
                setCurrentTime(t);
              }
              if (Date.now() - lastSave >= 3000) saveNow(t);
            }
          } catch {}
        }
        if (lastTickRef.current) {
          const now = Date.now();
          const delta = (now - lastTickRef.current) / 1000;
          if (delta > 0 && delta < 5 && onListeningTick) onListeningTick(delta);
          lastTickRef.current = now;
        }
      }, 250);
    };

    const stopTracking = () => {
      lastTickRef.current = null;
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        try { saveNow(playerRef.current.getCurrentTime()); } catch {}
      }
    };

    const init = () => {
      if (dead) return;
      const YT = (window as any).YT;
      let startSec = 0;
      try {
        const s = localStorage.getItem(`youtube_progress_${lesson.id}`);
        if (s) { const n = parseFloat(s); if (!isNaN(n) && n > 2) startSec = Math.floor(n); }
      } catch {}

      if (YT?.Player) {
        try {
          playerRef.current = new YT.Player(ph, {
            width: "100%",
            height: "100%",
            videoId: youtubeId,
            playerVars: {
              enablejsapi: 1,
              rel: 0,
              autoplay: 0,
              playsinline: 1,
              start: startSec > 0 ? startSec : undefined,
            },
            events: {
              onReady: (ev: any) => {
                if (dead) return;
                const p = ev.target;
                let seek = startSec;
                try {
                  const fs = localStorage.getItem(`youtube_progress_${lesson.id}`);
                  if (fs) { const n = parseFloat(fs); if (!isNaN(n) && n > 2) seek = Math.floor(n); }
                } catch {}
                const target = (seekToTime !== null && seekToTime !== undefined) ? seekToTime : seek;
                if (target > 0 && p?.seekTo) {
                  try { p.seekTo(target, true); } catch {}
                  setTimeout(() => { if (!dead) try { p.seekTo(target, true); } catch {} }, 350);
                }
              },
              onStateChange: (ev: any) => {
                if (dead) return;
                ev.data === 1 ? startTracking() : stopTracking();
                if (ev.data === 0) {
                  try {
                    localStorage.removeItem(`youtube_progress_${lesson.id}`);
                    settingsStore.removeItem(`youtube_progress_${lesson.id}`).catch(() => {});
                    window.dispatchEvent(
                      new CustomEvent("lectura:save_progress", {
                        detail: { lessonId: lesson.id, videoProgress: "0" },
                      })
                    );
                  } catch {}
                  onVideoEnded?.();
                }
              },
            },
          });
        } catch (e) {
          console.error("FocusPinnedPlayer: failed to init YT player:", e);
        }
      } else {
        initTimeoutRef.current = setTimeout(init, 300);
      }
    };

    init();

    return () => {
      dead = true;
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      try { if (playerRef.current?.getCurrentTime) saveNow(playerRef.current.getCurrentTime()); } catch {}
      try {
        if (playerRef.current?.destroy) { playerRef.current.destroy(); playerRef.current = null; }
      } catch {}
    };
  }, [youtubeId, iframeKey, lesson.id]);

  // ── External seek (click on timestamp in text) ──────────────────────────
  useEffect(() => {
    if (seekToTime != null && playerRef.current) {
      try {
        playerRef.current.seekTo(seekToTime, true);
        playerRef.current.playVideo?.();
      } catch {}
      setSeekToTime(null);
    }
  }, [seekToTime, setSeekToTime]);

  // Force layout repaint when un-collapsing (expanding) player on tablets/mobile to eliminate black screen delay
  useEffect(() => {
    if (!collapsed && playerRef.current) {
      try {
        const iframe = containerRef.current?.querySelector("iframe");
        if (iframe) {
          iframe.style.width = "100%";
          iframe.style.height = "100%";
        }
      } catch (e) {}
    }
  }, [collapsed]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className="sticky top-0 z-50 w-full bg-zinc-950 shadow-xl shadow-black/50">

      {/* ── Control bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-11 px-3 bg-zinc-900 border-b border-zinc-800">

        {/* Left: Exit Focus + title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            id="focus-exit-btn"
            onClick={onExitFocus}
            className="flex items-center gap-1.5 px-3 h-7 shrink-0 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-bold transition-all active:scale-97 cursor-pointer"
          >
            ← {t("app.focus_exit", "Выйти из фокуса")}
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <Tv className="w-3 h-3 text-teal-400 shrink-0" />
            <span className="text-[11px] font-semibold text-zinc-400 truncate max-w-[200px] sm:max-w-xs hidden sm:block">
              {lesson.title}
            </span>
          </div>
        </div>

        {/* Right: S/M/L + refresh + collapse + close */}
        <div className="flex items-center gap-1.5">

          {/* Size presets – S/M/L controls the max-width of the video */}
          {!collapsed && (
            <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700/50 gap-0.5">
              {(["small", "medium", "large"] as SizePreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setSize(p)}
                  className={`w-6 h-6 rounded-md text-[10px] font-black transition-all cursor-pointer flex items-center justify-center ${
                    size === p
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  }`}
                  title={p === "small" ? "Маленький" : p === "medium" ? "Средний" : "Большой"}
                >
                  {p === "small" ? "S" : p === "medium" ? "M" : "L"}
                </button>
              ))}
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={t("explainer.yt_refresh", "Обновить видео")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Collapse / Expand */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={collapsed ? t("explainer.yt_expand", "Развернуть") : t("explainer.yt_collapse", "Свернуть")}
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close → reverts to "Show Video" button in minimal bar */}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer"
            title={t("explainer.yt_close", "Скрыть плеер")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── YouTube iframe — aspect-ratio 16/9, zero black bars ────────────
          S/M/L change max-width; height auto-follows via aspect-ratio.
          Keep iframe ALWAYS mounted in DOM to prevent video stopping & black screen on expand! */}
      <div 
        className={`w-full bg-zinc-950 flex justify-center transition-all duration-200 ${
          collapsed 
            ? "h-0 min-h-0 max-h-0 opacity-0 overflow-hidden pointer-events-none" 
            : "h-auto opacity-100"
        }`}
      >
        <div
          style={{ width: "100%", maxWidth: MAX_WIDTHS[size], aspectRatio: "16 / 9" }}
          className="bg-black relative"
        >
          <div
            ref={containerRef}
            className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
          />
        </div>
      </div>
    </div>
  );
}
