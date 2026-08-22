import React, { useState, useEffect, useRef } from "react";
import { X, RefreshCw, ChevronDown, ChevronUp, ChevronLeft, Tv, Download, AlertTriangle, Loader2, HardDrive, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Lesson } from "../types";
import { useLesson } from "../context/LessonContext";
import { settingsStore } from "../db";
import { usePlaylistStore } from "../store/playlistStore";

type SizePreset = "small" | "medium" | "large";

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
  /** Return to Library directly */
  onBackToLibrary?: () => void;
  onListeningTick?: (seconds: number) => void;
  onVideoEnded?: () => void;
}

export default function FocusPinnedPlayer({
  lesson,
  onClose,
  onExitFocus,
  onBackToLibrary,
  onListeningTick,
  onVideoEnded,
}: FocusPinnedPlayerProps) {
  const { t } = useTranslation();
  const { setCurrentTime, seekToTime, playbackRate } = useLesson();
  const { youtubeId } = lesson;

  const [size, setSize] = useState<SizePreset>("medium");
  const [collapsed, setCollapsed] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Local media & embed restriction states
  const [localMediaUrl, setLocalMediaUrl] = useState<string | null>(lesson.localVideoUrl || null);
  const [useLocalMedia, setUseLocalMedia] = useState<boolean>(!!lesson.localVideoUrl);
  const [isEmbedBlocked, setIsEmbedBlocked] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; speed: string; eta: string }>({ percent: 0, speed: "", eta: "" });
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const initTimeoutRef = useRef<any>(null);
  const trackingIntervalRef = useRef<any>(null);
  const progressPollIntervalRef = useRef<any>(null);
  const lastContextTimeRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const lastStorageSaveRef = useRef<number>(0);

  if (!youtubeId) return null;

  // Track sticky player height
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--focus-player-height", `${h}px`);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      document.documentElement.style.removeProperty("--focus-player-height");
    };
  }, []);

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
    } catch {
      const sec = parseFloat(raw);
      return !isNaN(sec) && sec > 2 ? Math.floor(sec) : 0;
    }
  };

  const saveNow = (time: number) => {
    if (time == null || isNaN(time) || time <= 2) return;
    try {
      const sec = Math.floor(time);
      const updatedAt = Date.now();
      const payload = JSON.stringify({ progress: sec, updatedAt });
      localStorage.setItem(`youtube_progress_${lesson.id}`, payload);
      settingsStore.setItem(`youtube_progress_${lesson.id}`, payload).catch(() => {});
      lastStorageSaveRef.current = Date.now();
      window.dispatchEvent(
        new CustomEvent("lectura:save_progress", {
          detail: { lessonId: lesson.id, videoProgress: payload },
        })
      );
      const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
      const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (syncKey) headers["x-sync-key"] = syncKey;
      fetch("/api/progress", {
        method: "POST",
        headers,
        keepalive: true,
        body: JSON.stringify({ type: "video", lessonId: lesson.id, progress: sec, updatedAt }),
      }).catch(() => {});
    } catch {}
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
      .then((res) => res.json())
      .then((data) => {
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
        throw new Error(data.error || t("explainer.yt_download_error", "Не удалось скачать медиафайл"));
      }
      setDownloadProgress({ percent: 100, speed: "", eta: "" });
      setLocalMediaUrl(data.url);
      setUseLocalMedia(true);
      setIsEmbedBlocked(false);
    } catch (err: any) {
      console.error("FocusPinnedPlayer: Failed to download media:", err);
      setDownloadError(err.message || t("explainer.yt_download_error", "Ошибка загрузки"));
    } finally {
      if (progressPollIntervalRef.current) {
        clearInterval(progressPollIntervalRef.current);
        progressPollIntervalRef.current = null;
      }
      setIsDownloading(false);
    }
  };

  // Load YT iframe API script once
  useEffect(() => {
    if (typeof window === "undefined" || (window as any).YT) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    (document.head || document.body)?.appendChild(tag);
  }, []);

  // Init YouTube player
  useEffect(() => {
    if (useLocalMedia) return;

    let dead = false;
    const c = containerRef.current;
    if (!c) return;

    c.innerHTML = "";
    const ph = document.createElement("div");
    ph.id = `focus-yt-${lesson.id}`;
    c.appendChild(ph);

    const startTracking = () => {
      lastTickRef.current = Date.now();
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = setInterval(() => {
        if (playerRef.current?.getCurrentTime) {
          try {
            const cur = playerRef.current.getCurrentTime();
            if (cur != null) {
              if (Math.abs(cur - lastContextTimeRef.current) >= 0.5) {
                lastContextTimeRef.current = cur;
                setCurrentTime(cur);
              }
              if (Date.now() - lastStorageSaveRef.current >= 3000) {
                saveNow(cur);
              }
            }
          } catch {}
        }
        if (lastTickRef.current) {
          const now = Date.now();
          const d = (now - lastTickRef.current) / 1000;
          if (d > 0 && d <= 3 && onListeningTick && !usePlaylistStore.getState().isPlaying) {
            onListeningTick(d);
          }
          lastTickRef.current = now;
        }
      }, 500);
    };

    const stopTracking = () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      lastTickRef.current = null;
      try {
        if (playerRef.current?.getCurrentTime) saveNow(playerRef.current.getCurrentTime());
      } catch {}
    };

    const init = () => {
      if (dead) return;
      const YT = (window as any).YT;
      let startSec = 0;
      try {
        const s = localStorage.getItem(`youtube_progress_${lesson.id}`);
        startSec = parseSavedVideoProgress(s);
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
                if (playbackRate && p && typeof p.setPlaybackRate === "function") {
                  try { p.setPlaybackRate(playbackRate); } catch {}
                }
                let seek = startSec;
                try {
                  const fs = localStorage.getItem(`youtube_progress_${lesson.id}`);
                  const parsedFs = parseSavedVideoProgress(fs);
                  if (parsedFs > 2) seek = parsedFs;
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
              onError: (event: any) => {
                if (dead) return;
                console.warn("FocusPinnedPlayer: YouTube Player error:", event.data);
                if (event.data === 101 || event.data === 150 || event.data === 100 || event.data === 2 || event.data === 5) {
                  setIsEmbedBlocked(true);
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
  }, [youtubeId, iframeKey, lesson.id, useLocalMedia]);

  // External seek
  useEffect(() => {
    if (seekToTime != null) {
      if (useLocalMedia && videoElRef.current) {
        try {
          videoElRef.current.currentTime = seekToTime;
          videoElRef.current.play().catch(() => {});
        } catch {}
      } else if (playerRef.current?.seekTo) {
        try {
          playerRef.current.seekTo(seekToTime, true);
          playerRef.current.playVideo?.();
        } catch (e) {
          console.error("FocusPinnedPlayer: seek failed:", e);
        }
      }
    }
  }, [seekToTime, useLocalMedia]);

  // Playback Rate Sync
  useEffect(() => {
    const rate = playbackRate || 1;
    if (useLocalMedia && videoElRef.current) {
      try {
        videoElRef.current.playbackRate = rate;
      } catch {}
    } else if (playerRef.current?.setPlaybackRate) {
      try {
        playerRef.current.setPlaybackRate(rate);
      } catch {}
    }
  }, [playbackRate, useLocalMedia]);

  return (
    <div ref={rootRef} className="shrink-0 w-full z-20 bg-zinc-950 shadow-xl shadow-black/50">
      {/* Control bar */}
      <div className="flex items-center justify-between h-11 px-2.5 sm:px-3 bg-zinc-900 border-b border-zinc-800 gap-2">
        {/* Left: Library back button + Exit Focus + title */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="flex items-center gap-1 px-2 sm:px-2.5 h-7 shrink-0 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-bold transition-all active:scale-97 cursor-pointer shadow-3xs"
              title={t("reader.library_btn", "Библиотека")}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("reader.library_btn", "Библиотека")}</span>
            </button>
          )}

          <button
            id="focus-exit-btn"
            onClick={onExitFocus}
            className="flex items-center gap-1 px-2 sm:px-3 h-7 shrink-0 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-bold transition-all active:scale-97 cursor-pointer shadow-3xs"
            title={t("app.focus_exit", "Выйти из фокуса")}
          >
            <span>{t("app.focus_exit", "Выйти из фокуса")}</span>
          </button>

          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            <Tv className="w-3 h-3 text-teal-400 shrink-0" />
            <span className="text-[11px] font-semibold text-zinc-400 truncate max-w-[110px] sm:max-w-xs md:max-w-sm">
              {lesson.title}
            </span>
          </div>
        </div>

        {/* Right: Toggle Source + Download + S/M/L + refresh + collapse + close */}
        <div className="flex items-center gap-1.5">
          {/* Toggle between Local Video and YouTube Stream if local is ready */}
          {!collapsed && localMediaUrl && (
            <button
              type="button"
              onClick={() => {
                setUseLocalMedia((prev) => !prev);
                setIsEmbedBlocked(false);
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 transition-colors cursor-pointer mr-1 ${
                useLocalMedia
                  ? "bg-teal-950/60 text-teal-300 border border-teal-800"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
              title={useLocalMedia ? t("explainer.yt_source_local", "Локальное видео") : t("explainer.yt_source_youtube", "YouTube онлайн")}
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
          {!collapsed && !localMediaUrl && !isEmbedBlocked && (
            <button
              type="button"
              disabled={isDownloading}
              onClick={() => handleDownloadMedia(false)}
              className="p-1 rounded-md text-zinc-400 hover:text-teal-400 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
              title={t("explainer.yt_download_tooltip", "Скачать видео на сервер для офлайн-просмотра")}
            >
              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" /> : <Download className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Size presets */}
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
            onClick={() => {
              setIsEmbedBlocked(false);
              setIframeKey((k) => k + 1);
            }}
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
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer"
            title={t("explainer.yt_close", "Скрыть плеер")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Embed / HTML5 Video Container */}
      <div
        className={`w-full bg-zinc-950 flex justify-center transition-all duration-200 ${
          collapsed ? "h-0 min-h-0 max-h-0 opacity-0 overflow-hidden pointer-events-none" : "h-auto opacity-100"
        }`}
      >
        <div style={{ width: "100%", maxWidth: MAX_WIDTHS[size], aspectRatio: "16 / 9" }} className="bg-black relative max-h-[35vh] sm:max-h-[40vh]">
          {useLocalMedia && localMediaUrl ? (
            <video
              ref={videoElRef}
              src={localMediaUrl}
              controls
              playsInline
              className="w-full h-full object-contain bg-black"
              onLoadedMetadata={() => {
                if (videoElRef.current) {
                  videoElRef.current.playbackRate = playbackRate || 1;
                  let startSec = 0;
                  try {
                    const raw = localStorage.getItem(`youtube_progress_${lesson.id}`);
                    startSec = parseSavedVideoProgress(raw);
                  } catch (e) {}
                  if (startSec > 2) {
                    videoElRef.current.currentTime = startSec;
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
                  if (Date.now() - lastStorageSaveRef.current >= 3000) {
                    saveNow(time);
                  }
                }
                if (lastTickRef.current) {
                  const now = Date.now();
                  const delta = (now - lastTickRef.current) / 1000;
                  if (delta > 0 && delta <= 3 && onListeningTick && !usePlaylistStore.getState().isPlaying) {
                    onListeningTick(delta);
                  }
                  lastTickRef.current = now;
                }
              }}
              onPlay={() => {
                lastTickRef.current = Date.now();
              }}
              onPause={() => {
                lastTickRef.current = null;
                if (videoElRef.current) {
                  saveNow(videoElRef.current.currentTime);
                }
              }}
              onEnded={() => {
                try {
                  localStorage.removeItem(`youtube_progress_${lesson.id}`);
                  settingsStore.removeItem(`youtube_progress_${lesson.id}`).catch(() => {});
                  window.dispatchEvent(new CustomEvent("lectura:save_progress", { detail: { lessonId: lesson.id, videoProgress: "0" } }));
                } catch (e) {}
                if (onVideoEnded) onVideoEnded();
              }}
            />
          ) : isEmbedBlocked ? (
            <div className="absolute inset-0 z-50 w-full h-full flex flex-col items-center justify-center p-4 text-center bg-zinc-950 text-white select-none overflow-y-auto">
              <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-2 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>

              <h4 className="text-xs font-bold text-amber-200 mb-1 max-w-[90%]">
                {t("explainer.yt_embed_blocked_title", "Владелец видео ограничил его просмотр на других сайтах")}
              </h4>

              <p className="text-[10px] text-zinc-400 max-w-[85%] mb-2.5 leading-relaxed">
                {t("explainer.yt_embed_blocked_desc", "Вы можете скачать медиафайл локально на сервер для бесшовного воспроизведения без ограничений.")}
              </p>

              {isDownloading ? (
                <div className="flex flex-col items-center gap-2 p-3 bg-zinc-900/90 rounded-xl border border-zinc-800 w-full max-w-[280px]">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                      <span className="text-[11px] font-bold text-teal-200">
                        {t("explainer.yt_downloading_msg", "Загрузка с YouTube...")}
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
                    <span>{downloadProgress.speed || t("explainer.yt_download_wait", "Подготовка файла...")}</span>
                    {downloadProgress.eta ? <span>ETA: {downloadProgress.eta}</span> : null}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadMedia(false)}
                      className="flex-1 py-1.5 px-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[10px] font-bold shadow-md shadow-teal-900/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Download className="w-3 h-3" />
                      <span>{t("explainer.yt_download_video", "Скачать видео (720p)")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadMedia(true)}
                      className="py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-[10px] font-bold border border-zinc-700 transition-all cursor-pointer active:scale-95"
                      title={t("explainer.yt_download_audio", "Только аудио (M4A)")}
                    >
                      <span>{t("explainer.yt_download_audio", "Аудио (M4A)")}</span>
                    </button>
                  </div>

                  {downloadError && (
                    <div className="p-2 bg-red-950/40 border border-red-800/60 rounded-lg text-[9px] text-red-300 text-left">
                      <p className="font-semibold">{t("explainer.yt_download_error", "Не удалось скачать видео")}:</p>
                      <p className="text-red-400 mt-0.5 truncate">{downloadError}</p>
                      <button
                        type="button"
                        onClick={() => handleDownloadMedia(false)}
                        className="mt-1 text-teal-400 hover:underline text-[9px] font-bold cursor-pointer"
                      >
                        {t("explainer.yt_retry", "Повторить попытку")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div ref={containerRef} className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0" />
          )}
        </div>
      </div>
    </div>
  );
}
