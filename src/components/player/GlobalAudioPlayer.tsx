import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePlaylistStore, resolveAudioSrc, PlaylistItem } from '../../store/playlistStore';
import { useLesson } from '../../context/LessonContext';
import { startNativeForegroundAudio, stopNativeForegroundAudio, registerNativeAudioActionListener, updateNativeAudioPosition } from '../../services/nativeAudioBridge';

interface GlobalAudioPlayerProps {
  onListeningTick?: (seconds: number, forceFlush?: boolean, exactTime?: number) => void;
  onMediaEnded?: (track: PlaylistItem) => void;
}

export default function GlobalAudioPlayer({ onListeningTick, onMediaEnded }: GlobalAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const isYtReadyRef = useRef<boolean>(false);
  const ytTrackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstPlayTickRef = useRef<boolean>(true);
  const lastAudioPosRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const lastYtVideoIdRef = useRef<string | null>(null);

  const {
    queue,
    currentIndex,
    isPlaying,
    repeatMode,
    playbackRate,
    volume,
    isMuted,
    seekTarget,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    clearSeekTarget,
    playNext,
    playPrev,
    seekDelta,
    seek,
    currentTime,
    duration,
  } = usePlaylistStore();

  const {
    activeLesson,
    setIsPlaying: setLessonIsPlaying,
    setCurrentTime: setLessonCurrentTime,
    setDuration: setLessonDuration,
  } = useLesson();

  const currentTrack = queue[currentIndex] || null;

  // Determine if current track is a YouTube video without local file
  const isYouTubeTrack = Boolean(
    currentTrack &&
      currentTrack.youtubeId &&
      !currentTrack.localVideoUrl &&
      (!currentTrack.audioUrl || currentTrack.audioUrl.startsWith('/api/media/youtube-stream/')) &&
      !currentTrack.audioBase64
  );

  const audioSrc = currentTrack && !isYouTubeTrack
    ? resolveAudioSrc(
        currentTrack.audioUrl,
        currentTrack.audioBase64,
        undefined,
        currentTrack.localVideoUrl,
        currentTrack.id
      )
    : '';

  // ---------------------------------------------------------------------------
  // 1. Load YouTube IFrame API Script
  // ---------------------------------------------------------------------------
  const [isYtApiLoaded, setIsYtApiLoaded] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean((window as any).YT?.Player);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).YT?.Player) {
      setIsYtApiLoaded(true);
      return;
    }

    const prevCallback = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') prevCallback();
      setIsYtApiLoaded(true);
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      (document.head || document.body)?.appendChild(tag);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Initialize YouTube Player
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isYtApiLoaded || ytPlayerRef.current) return;
    const YT = (window as any).YT;
    if (!YT?.Player) return;

    const el = document.getElementById('global-audio-yt-iframe-ph');
    if (!el) return;

    try {
      ytPlayerRef.current = new YT.Player('global-audio-yt-iframe-ph', {
        width: '200',
        height: '200',
        videoId: '',
        playerVars: {
          autoplay: 0,
          controls: 0,
          enablejsapi: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            isYtReadyRef.current = true;
            if (ytPlayerRef.current?.setVolume) {
              ytPlayerRef.current.setVolume(isMuted ? 0 : volume * 100);
            }
            if (ytPlayerRef.current?.setPlaybackRate) {
              ytPlayerRef.current.setPlaybackRate(playbackRate);
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === YT.PlayerState.PLAYING) {
              sessionStartRef.current = Date.now();
              setIsPlaying(true);
            } else if (state === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              if (ytPlayerRef.current?.getCurrentTime) {
                flushPendingListeningTime(ytPlayerRef.current.getCurrentTime());
              }
            } else if (state === YT.PlayerState.ENDED) {
              handleEnded();
            }
          },
          onError: (e: any) => {
            console.warn('[GlobalAudioPlayer YT Error]:', e);
          },
        },
      });
    } catch (err) {
      console.warn('[GlobalAudioPlayer YT Init Error]:', err);
    }
  }, [isYtApiLoaded]);

  const sessionStartRef = useRef<number>(0);
  const targetSeekTimeRef = useRef<number | null>(null);

  const currentTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentTrack?.id && currentTrack.id !== currentTrackIdRef.current) {
      currentTrackIdRef.current = currentTrack.id;
      const initialPos = Number(activeLesson && activeLesson.id === currentTrack.id ? activeLesson.audioProgress : (currentTrack as any).audioProgress) || 0;
      if (initialPos > 0) {
        targetSeekTimeRef.current = initialPos;
        setCurrentTime(initialPos);
        if (audioRef.current) {
          try {
            audioRef.current.currentTime = initialPos;
          } catch (_) {}
        }
      } else {
        targetSeekTimeRef.current = null;
        setCurrentTime(0);
      }
    }
  }, [currentTrack?.id, activeLesson?.id, setCurrentTime]);

  const applyTargetSeek = useCallback(() => {
    if (targetSeekTimeRef.current !== null && audioRef.current) {
      const targetTime = targetSeekTimeRef.current;
      targetSeekTimeRef.current = null;
      try {
        audioRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
      } catch (_) {}
    }
  }, [setCurrentTime]);

  const saveCurrentProgress = useCallback((exactTime?: number) => {
    const lessonId = currentTrack?.id;
    if (!lessonId) return;
    const timeToSave = exactTime !== undefined ? exactTime : (
      isYouTubeTrack && ytPlayerRef.current?.getCurrentTime 
        ? (ytPlayerRef.current.getCurrentTime() || 0)
        : (audioRef.current?.currentTime ?? currentTime)
    );
    if (timeToSave < 0 || isNaN(timeToSave)) return;
    fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: timeToSave, audioProgress: timeToSave, clientUpdatedAt: Date.now(), updatedAt: Date.now() }),
      keepalive: true
    }).catch(() => {});
  }, [currentTrack?.id, isYouTubeTrack, currentTime]);

  // Focus & Visibility Re-sync: Sync playback position from remote server when tab gains focus
  useEffect(() => {
    const handleFocusSync = async () => {
      const lessonId = currentTrack?.id;
      // If audio is currently playing or unmounted - DO NOT touch position
      if (isPlaying || !lessonId || !audioRef.current) return;

      try {
        const res = await fetch(`/api/lessons/${lessonId}`);
        if (!res.ok) return;
        const data = await res.json();
        const remoteTime = Number(data?.audio_progress ?? data?.audioProgress);
        if (!isNaN(remoteTime) && remoteTime >= 0) {
          const localTime = isYouTubeTrack && ytPlayerRef.current?.getCurrentTime
            ? (ytPlayerRef.current.getCurrentTime() || 0)
            : (audioRef.current.currentTime || 0);

          if (Math.abs(localTime - remoteTime) > 2) {
            if (isYouTubeTrack && ytPlayerRef.current && isYtReadyRef.current) {
              try { ytPlayerRef.current.seekTo(remoteTime, false); } catch (_) {}
            } else if (audioRef.current) {
              try { audioRef.current.currentTime = remoteTime; } catch (_) {}
            }
            setCurrentTime(remoteTime);
            if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
              setLessonCurrentTime(remoteTime);
            }
          }
        }
      } catch (_) {
        // silent fail
      }
    };

    window.addEventListener('focus', handleFocusSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocusSync();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentTrack?.id, isPlaying, isYouTubeTrack, activeLesson, setCurrentTime, setLessonCurrentTime]);

  const flushPendingListeningTime = useCallback((exactTime?: number) => {
    let cur = exactTime;
    if (cur === undefined) {
      if (isYouTubeTrack && ytPlayerRef.current?.getCurrentTime) {
        try { cur = ytPlayerRef.current.getCurrentTime(); } catch (_) {}
      } else if (audioRef.current) {
        cur = audioRef.current.currentTime;
      } else {
        cur = usePlaylistStore.getState().currentTime || 0;
      }
    }

    if (cur !== undefined && cur > 0) {
      saveCurrentProgress(cur);
    }

    if (sessionStartRef.current > 0) {
      const now = Date.now();
      const elapsedSec = Math.round((now - sessionStartRef.current) / 1000);
      sessionStartRef.current = 0;
      if (elapsedSec >= 3 && elapsedSec <= 7200) {
        const delta = elapsedSec * (playbackRate || 1);
        onListeningTick?.(delta, true, cur);
      } else if (cur !== undefined) {
        onListeningTick?.(0, true, cur);
      }
    } else if (cur !== undefined) {
      onListeningTick?.(0, true, cur);
    }
    if (cur !== undefined) {
      window.dispatchEvent(new CustomEvent("force-history-flush", { detail: { exactTime: cur, source: "global" } }));
    }
  }, [isYouTubeTrack, playbackRate, onListeningTick, saveCurrentProgress]);

  const flushPendingListeningTimeRef = useRef(flushPendingListeningTime);
  useEffect(() => {
    flushPendingListeningTimeRef.current = flushPendingListeningTime;
  }, [flushPendingListeningTime]);

  // Unmount cleanup & beforeunload: immediately flush pending seconds and save progress
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingListeningTimeRef.current();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingListeningTimeRef.current();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 3. YouTube Playback Tracking & Synchronization
  // ---------------------------------------------------------------------------
  const startYtTracking = useCallback(() => {
    if (ytTrackingIntervalRef.current) clearInterval(ytTrackingIntervalRef.current);
    let lastTickTime = Date.now();

    ytTrackingIntervalRef.current = setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player || !isYtReadyRef.current) return;

      try {
        let cur = 0;
        if (typeof player.getCurrentTime === 'function') {
          const rawCur = player.getCurrentTime();
          if (rawCur !== null && !isNaN(rawCur)) {
            cur = rawCur;
            setCurrentTime(cur);
            if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
              setLessonCurrentTime(cur);
              setLessonIsPlaying(true);
            }
          }
        }
        if (typeof player.getDuration === 'function') {
          const dur = player.getDuration();
          if (dur && !isNaN(dur)) {
            setDuration(dur);
            if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
              setLessonDuration(dur);
            }
          }
        }
      } catch (_) {}
    }, 250);
  }, [activeLesson, currentTrack, setCurrentTime, setDuration, setLessonCurrentTime, setLessonDuration, setLessonIsPlaying]);

  const stopYtTracking = useCallback(() => {
    if (ytTrackingIntervalRef.current) {
      clearInterval(ytTrackingIntervalRef.current);
      ytTrackingIntervalRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 4. Handle Track Changes & Play/Pause Coordination
  // ---------------------------------------------------------------------------
  const lastLoadedSrc = useRef<string>('');

  useEffect(() => {
    const isYT = isYouTubeTrack;
    const targetYtId = currentTrack?.youtubeId || null;

    if (isYT && targetYtId) {
      // Pause HTML5 audio
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }

      // YouTube track handling
      const player = ytPlayerRef.current;
      const initialTime = usePlaylistStore.getState().currentTime || 0;

      if (lastYtVideoIdRef.current !== targetYtId) {
        lastYtVideoIdRef.current = targetYtId;
        if (player && isYtReadyRef.current && typeof player.loadVideoById === 'function') {
          player.loadVideoById({
            videoId: targetYtId,
            startSeconds: initialTime,
          });
          if (isPlaying) {
            player.playVideo();
            startYtTracking();
          } else {
            player.pauseVideo();
            stopYtTracking();
          }
        }
      } else if (player && isYtReadyRef.current) {
        if (isPlaying) {
          player.playVideo();
          startYtTracking();
        } else {
          player.pauseVideo();
          stopYtTracking();
        }
      }
    } else {
      // Pause YouTube player if active
      lastYtVideoIdRef.current = null;
      stopYtTracking();
      if (ytPlayerRef.current && isYtReadyRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch (_) {}
      }

      // Standard HTML5 Audio handling
      const audio = audioRef.current;
      if (!audio) return;

      if (!audioSrc) {
        audio.removeAttribute('src');
        lastLoadedSrc.current = '';
        return;
      }

      if (lastLoadedSrc.current !== audioSrc) {
        lastLoadedSrc.current = audioSrc;
        isFirstPlayTickRef.current = true;
        audio.src = audioSrc;
      }

      if (isPlaying) {
        applyTargetSeek();
        const storeTime = usePlaylistStore.getState().currentTime || 0;
        const expectedTime = storeTime;
        if (expectedTime > 0 && Math.abs(audio.currentTime - expectedTime) > 0.5) {
          try {
            audio.currentTime = expectedTime;
          } catch (_) {}
        }
        const cur = audio.currentTime;
        lastAudioPosRef.current = cur;
        lastTickTimeRef.current = Date.now();
        setCurrentTime(cur);
        const dur = audio.duration;
        if (dur && !isNaN(dur) && dur > 0 && dur !== Infinity) {
          setDuration(dur);
          if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
            setLessonDuration(dur);
          }
        }
        if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
          setLessonCurrentTime(cur);
          setLessonIsPlaying(true);
        }
        window.dispatchEvent(new CustomEvent("media-play-start", { detail: { trackId: currentTrack?.id, guid: currentTrack?.guid } }));
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('[GlobalAudioPlayer] HTML5 audio play error:', err);
          });
        }
      } else {
        audio.pause();
      }
    }
  }, [audioSrc, currentTrack?.youtubeId, isPlaying, isYouTubeTrack, isYtApiLoaded, startYtTracking, stopYtTracking, applyTargetSeek]);

  // ---------------------------------------------------------------------------
  // 5. Seek Handling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (seekTarget === null) return;
    targetSeekTimeRef.current = null;
    if (activeLesson && currentTrack && (activeLesson.id === currentTrack.id || (activeLesson as any).guid === currentTrack.guid)) {
      activeLesson.audioProgress = seekTarget;
    }

    if (isYouTubeTrack && ytPlayerRef.current && isYtReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(seekTarget, true);
        if (isPlaying) ytPlayerRef.current.playVideo();
      } catch (_) {}
    } else if (audioRef.current) {
      audioRef.current.currentTime = seekTarget;
    }

    clearSeekTarget();
  }, [seekTarget, activeLesson, currentTrack, clearSeekTarget, isYouTubeTrack, isPlaying]);

  // ---------------------------------------------------------------------------
  // 6. Playback Rate & Volume Controls
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isYouTubeTrack && ytPlayerRef.current && isYtReadyRef.current && typeof ytPlayerRef.current.setPlaybackRate === 'function') {
      try {
        ytPlayerRef.current.setPlaybackRate(playbackRate);
      } catch (_) {}
    } else if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, isYouTubeTrack]);

  useEffect(() => {
    if (isYouTubeTrack && ytPlayerRef.current && isYtReadyRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try {
        ytPlayerRef.current.setVolume(isMuted ? 0 : volume * 100);
      } catch (_) {}
    } else if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, isYouTubeTrack]);

  // ---------------------------------------------------------------------------
  // 7. Track End (onEnded) Handler (Continuous Playback)
  // ---------------------------------------------------------------------------
  const handleEnded = useCallback(() => {
    const { queue, currentIndex, repeatMode } = usePlaylistStore.getState();
    if (queue.length === 0) return;

    const finishedTrack = queue[currentIndex];
    if (finishedTrack) {
      const currentNativeTime = isYouTubeTrack && ytPlayerRef.current?.getCurrentTime
        ? ytPlayerRef.current.getCurrentTime()
        : (audioRef.current ? audioRef.current.currentTime : 0);
      flushPendingListeningTime(currentNativeTime);
      saveCurrentProgress(0);
      onMediaEnded?.(finishedTrack);
    }

    let nextIndex = currentIndex;
    let shouldContinue = false;

    if (repeatMode === 'one') {
      shouldContinue = true;
    } else if (currentIndex + 1 < queue.length) {
      nextIndex = currentIndex + 1;
      shouldContinue = true;
    } else if (repeatMode === 'all') {
      nextIndex = 0;
      shouldContinue = true;
    }

    if (shouldContinue) {
      const nextTrack = queue[nextIndex];
      const nextIsYt = Boolean(
        nextTrack.youtubeId &&
          !nextTrack.localVideoUrl &&
          (!nextTrack.audioUrl || nextTrack.audioUrl.startsWith('/api/media/youtube-stream/')) &&
          !nextTrack.audioBase64
      );

      if (!nextIsYt && audioRef.current) {
        const nextSrc = resolveAudioSrc(
          nextTrack.audioUrl,
          nextTrack.audioBase64,
          undefined,
          nextTrack.localVideoUrl,
          nextTrack.id
        );
        lastLoadedSrc.current = nextSrc;
        audioRef.current.src = nextSrc;
        audioRef.current.load();
        audioRef.current.play().catch((e) => console.warn('[iOS Audio Transition Error]:', e));
      }

      usePlaylistStore.setState({
        currentIndex: nextIndex,
        currentTime: 0,
        duration: 0,
        isPlaying: true,
      });
    } else {
      usePlaylistStore.setState({ isPlaying: false });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 8. HTML5 Audio Event Handlers & High-Frequency Time Engine
  // ---------------------------------------------------------------------------
  const handleTimeUpdate = useCallback(() => {
    if (isYouTubeTrack) return;
    const audio = audioRef.current;
    if (!audio) return;
    const cur = audio.currentTime;
    setCurrentTime(cur);

    const dur = audio.duration;
    if (dur && !isNaN(dur) && dur > 0 && dur !== Infinity && usePlaylistStore.getState().duration !== dur) {
      setDuration(dur);
      const isThisLesson = Boolean(
        activeLesson && currentTrack && (
          activeLesson.id === currentTrack.id ||
          (activeLesson.title && currentTrack.title && activeLesson.title.trim().toLowerCase() === currentTrack.title.trim().toLowerCase()) ||
          (currentTrack.guid && (activeLesson.id === currentTrack.guid || (activeLesson as any).podcastGuid === currentTrack.guid))
        )
      );
      if (isThisLesson) {
        setLessonDuration(dur);
      }
    }

    const isThisLessonPlaying = Boolean(
      activeLesson && currentTrack && (
        activeLesson.id === currentTrack.id ||
        (activeLesson.title && currentTrack.title && activeLesson.title.trim().toLowerCase() === currentTrack.title.trim().toLowerCase()) ||
        (currentTrack.guid && (activeLesson.id === currentTrack.guid || (activeLesson as any).podcastGuid === currentTrack.guid))
      )
    );
    if (isThisLessonPlaying) {
      setLessonCurrentTime(cur);
      setLessonIsPlaying(!audio.paused);
    }


  }, [activeLesson, currentTrack, isYouTubeTrack, playbackRate, setCurrentTime, setLessonCurrentTime, setLessonIsPlaying, onListeningTick]);


  const handleLoadedMetadata = useCallback(() => {
    if (isYouTubeTrack) return;
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration;
    if (!isNaN(dur)) {
      setDuration(dur);
      if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
        setLessonDuration(dur);
      }
    }
    applyTargetSeek();
  }, [activeLesson, currentTrack, isYouTubeTrack, setDuration, setLessonDuration, applyTargetSeek]);

  const handleCanPlay = useCallback(() => {
    if (!isYouTubeTrack) {
      applyTargetSeek();
    }
  }, [isYouTubeTrack, applyTargetSeek]);

  // ---------------------------------------------------------------------------
  // 9. Media Session API Integration
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const artwork: MediaImage[] = [];
    if (currentTrack.coverUrl) {
      artwork.push({ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' });
    } else {
      artwork.push({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' });
      artwork.push({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.channelName || currentTrack.bookTitle || 'Lectura',
      album: currentTrack.podcastTitle || currentTrack.bookTitle || 'Lectura Course',
      artwork,
    });

    try {
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
      navigator.mediaSession.setActionHandler('seekforward', (d) => seekDelta(d?.seekOffset || 30));
      navigator.mediaSession.setActionHandler('seekbackward', (d) => seekDelta(-(d?.seekOffset || 15)));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('stop', () => setIsPlaying(false));
    } catch (_) {}
  }, [currentTrack, setIsPlaying, playNext, playPrev, seekDelta, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    if ('setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: playbackRate || 1.0,
          position: Math.min(Math.max(0, currentTime), duration),
        });
      } catch (_) {}
    }
  }, [isPlaying, currentTime, duration, playbackRate]);

  // 10. Native Mobile Android Foreground Service Sync & Action Handlers
  useEffect(() => {
    const unregister = registerNativeAudioActionListener((action) => {
      if (action === 'play_pause') {
        setIsPlaying(!isPlaying);
      } else if (action === 'seek_backward') {
        seekDelta(-15);
      } else if (action === 'seek_forward') {
        seekDelta(30);
      } else if (action.startsWith('seek_to:')) {
        const targetSec = parseFloat(action.split(':')[1]);
        if (!isNaN(targetSec)) {
          seek(targetSec);
        }
      }
    });
    return () => unregister();
  }, [isPlaying, setIsPlaying, seekDelta, seek]);

  useEffect(() => {
    if (currentTrack) {
      const title = currentTrack.title || 'Lectura';
      const artist = currentTrack.channelName || currentTrack.bookTitle || 'Audiobook / Podcast';
      startNativeForegroundAudio(title, artist, isPlaying, currentTrack.coverUrl, currentTime, duration);
    } else {
      stopNativeForegroundAudio();
    }
  }, [isPlaying, currentTrack?.title, currentTrack?.channelName, currentTrack?.bookTitle, currentTrack?.coverUrl, duration]);

  // Update position on native every 3 seconds while playing
  useEffect(() => {
    if (!currentTrack || !isPlaying) return;
    const interval = setInterval(() => {
      updateNativeAudioPosition(currentTime, duration, isPlaying);
    }, 3000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, currentTime, duration]);

  // Pause global audio player if another media (e.g. YouTube in Reader) starts playing
  useEffect(() => {
    const handleOtherMediaPlay = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && currentTrack && (detail.trackId !== currentTrack.id && detail.guid !== currentTrack.guid)) {
        if (isPlaying) {
          setIsPlaying(false);
          if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
          }
        }
      }
    };
    window.addEventListener("media-play-start", handleOtherMediaPlay);
    return () => {
      window.removeEventListener("media-play-start", handleOtherMediaPlay);
    };
  }, [currentTrack, isPlaying, setIsPlaying]);

  return (
    <>
      {/* Native HTML5 Audio Engine for Podcasts & Audiobooks */}
      <audio
        id="global-audio-element"
        ref={audioRef}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onPlay={() => {
          if (!isYouTubeTrack) {
            applyTargetSeek();
            const storeTime = usePlaylistStore.getState().currentTime || 0;
            const expectedTime = storeTime;
            if (audioRef.current && expectedTime > 0 && Math.abs(audioRef.current.currentTime - expectedTime) > 0.5) {
              try {
                audioRef.current.currentTime = expectedTime;
              } catch (_) {}
            }
            setIsPlaying(true);
            sessionStartRef.current = Date.now();
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              lastAudioPosRef.current = cur;
              lastTickTimeRef.current = Date.now();
              setCurrentTime(cur);
              if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
                setLessonCurrentTime(cur);
                setLessonIsPlaying(true);
              }
            }
          }
        }}
        onPlaying={() => {
          if (!isYouTubeTrack) {
            applyTargetSeek();
            const storeTime = usePlaylistStore.getState().currentTime || 0;
            const expectedTime = storeTime;
            if (audioRef.current && expectedTime > 0 && Math.abs(audioRef.current.currentTime - expectedTime) > 0.5) {
              try {
                audioRef.current.currentTime = expectedTime;
              } catch (_) {}
            }
            sessionStartRef.current = Date.now();
            setIsPlaying(true);
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              setCurrentTime(cur);
              if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
                setLessonCurrentTime(cur);
                setLessonIsPlaying(true);
              }
            }
          }
        }}
        onPause={() => {
          if (!isYouTubeTrack) {
            setIsPlaying(false);
            const exactTime = audioRef.current?.currentTime ?? usePlaylistStore.getState().currentTime ?? 0;
            flushPendingListeningTime(exactTime);
          }
        }}
        onSeeked={() => {
          if (!isYouTubeTrack && audioRef.current) {
            const cur = audioRef.current.currentTime;
            flushPendingListeningTime(cur);
            if (!audioRef.current.paused) {
              sessionStartRef.current = Date.now();
            }
            setCurrentTime(cur);
          }
        }}
        onError={(e) => {
          if (!isYouTubeTrack) console.warn('[GlobalAudioPlayer HTML5 Error]', e);
        }}
        preload="metadata"
        playsInline
        className="hidden"
      />

      {/* Hidden YouTube IFrame Player for instant continuous YouTube playback without downloading */}
      <div
        ref={ytContainerRef}
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: '200px',
          height: '200px',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <div id="global-audio-yt-iframe-ph" />
      </div>
    </>
  );
}
