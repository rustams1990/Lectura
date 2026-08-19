import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePlaylistStore, resolveAudioSrc } from '../../store/playlistStore';
import { useLesson } from '../../context/LessonContext';
import { startNativeForegroundAudio, stopNativeForegroundAudio, registerNativeAudioActionListener, updateNativeAudioPosition } from '../../services/nativeAudioBridge';

interface GlobalAudioPlayerProps {
  onListeningTick?: (seconds: number) => void;
}

export default function GlobalAudioPlayer({ onListeningTick }: GlobalAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const isYtReadyRef = useRef<boolean>(false);
  const ytTrackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
              setIsPlaying(true);
            } else if (state === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
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
        if (typeof player.getCurrentTime === 'function') {
          const cur = player.getCurrentTime();
          if (cur !== null && !isNaN(cur)) {
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
        if (typeof player.getPlayerState === 'function') {
          const st = player.getPlayerState();
          const isActuallyPlaying = st === (window as any).YT?.PlayerState?.PLAYING;
          if (isActuallyPlaying && onListeningTick) {
            const now = Date.now();
            const delta = (now - lastTickTime) / 1000;
            if (delta > 0 && delta < 5) {
              onListeningTick(delta);
            }
            lastTickTime = now;
          } else {
            lastTickTime = Date.now();
          }
        }
      } catch (_) {}
    }, 250);
  }, [activeLesson, currentTrack, onListeningTick, setCurrentTime, setDuration, setLessonCurrentTime, setLessonDuration, setLessonIsPlaying]);

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
        audio.src = audioSrc;
        audio.load();

        const initialTime = usePlaylistStore.getState().currentTime;
        if (initialTime > 0) {
          audio.currentTime = initialTime;
        }
      }

      if (isPlaying) {
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
  }, [audioSrc, currentTrack?.youtubeId, isPlaying, isYouTubeTrack, isYtApiLoaded, startYtTracking, stopYtTracking]);

  // ---------------------------------------------------------------------------
  // 5. Seek Handling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (seekTarget === null) return;

    if (isYouTubeTrack && ytPlayerRef.current && isYtReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(seekTarget, true);
        if (isPlaying) ytPlayerRef.current.playVideo();
      } catch (_) {}
    } else if (audioRef.current) {
      audioRef.current.currentTime = seekTarget;
    }

    clearSeekTarget();
  }, [seekTarget, clearSeekTarget, isYouTubeTrack, isPlaying]);

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
  // 8. HTML5 Audio Event Handlers
  // ---------------------------------------------------------------------------
  const handleTimeUpdate = useCallback(() => {
    if (isYouTubeTrack) return;
    const audio = audioRef.current;
    if (!audio) return;
    const cur = audio.currentTime;
    setCurrentTime(cur);

    if (activeLesson && currentTrack && activeLesson.id === currentTrack.id) {
      setLessonCurrentTime(cur);
      setLessonIsPlaying(!audio.paused);
    }
  }, [activeLesson, currentTrack, isYouTubeTrack, setCurrentTime, setLessonCurrentTime, setLessonIsPlaying]);

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
  }, [activeLesson, currentTrack, isYouTubeTrack, setDuration, setLessonDuration]);

  // HTML5 audio listening tick tracking
  useEffect(() => {
    let tickInterval: NodeJS.Timeout;
    if (isPlaying && !isYouTubeTrack) {
      let lastAudioTime = audioRef.current?.currentTime ?? null;
      tickInterval = setInterval(() => {
        if (audioRef.current && lastAudioTime !== null && !audioRef.current.paused) {
          const nowAudioTime = audioRef.current.currentTime;
          const delta = nowAudioTime - lastAudioTime;
          if (delta > 0 && delta < 10) {
            onListeningTick?.(delta);
          }
          lastAudioTime = nowAudioTime;
        } else if (audioRef.current) {
          lastAudioTime = audioRef.current.currentTime;
        }
      }, 1000);
    }

    return () => {
      clearInterval(tickInterval);
    };
  }, [isPlaying, isYouTubeTrack, onListeningTick]);

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
      album: currentTrack.bookTitle || 'Lectura Playlist',
      artwork,
    });

    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('seekforward', (d) => seekDelta(d.seekOffset || 10));
    navigator.mediaSession.setActionHandler('seekbackward', (d) => seekDelta(-(d.seekOffset || 10)));

    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
    } catch (_) {}

    try {
      navigator.mediaSession.setActionHandler('stop', () => setIsPlaying(false));
    } catch (_) {}
  }, [currentTrack, setIsPlaying, playNext, playPrev, seekDelta, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // 10. Native Mobile Android Foreground Service Sync & Action Handlers
  useEffect(() => {
    const unregister = registerNativeAudioActionListener((action) => {
      if (action === 'play_pause') {
        setIsPlaying(!isPlaying);
      } else if (action === 'seek_backward') {
        seekDelta(-10);
      } else if (action === 'seek_forward') {
        seekDelta(10);
      }
    });
    return () => unregister();
  }, [isPlaying, setIsPlaying, seekDelta]);

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

  return (
    <>
      {/* Native HTML5 Audio Engine for Podcasts & Audiobooks */}
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => {
          if (!isYouTubeTrack) setIsPlaying(true);
        }}
        onPause={() => {
          if (!isYouTubeTrack) setIsPlaying(false);
        }}
        onError={(e) => {
          if (!isYouTubeTrack) console.warn('[GlobalAudioPlayer HTML5 Error]', e);
        }}
        preload="auto"
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
