import { StorageService } from '../services/storage';
import { ExtensionSettings } from '../types/index';

export interface VideoSession {
  videoId: string;
  title: string;
  channelName: string;
  channelUrl: string;
  duration: number;
  studyLanguage: string;
  actualWatchedSeconds: number;
  lastFlushedSeconds: number;
  lastPlaybackPosition: number;
  lastWallClockTime: number | null;
  currentPosition: number;
  isCompleted: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  videoElement: HTMLVideoElement | null;
  cleanup?: () => void;
}

let currentVideoSession: VideoSession | null = null;
let sessionInitTimeout: ReturnType<typeof setTimeout> | null = null;
let isObserverInitialized = false;
let lastObservedUrl = '';

function getStudyLanguage(settings: ExtensionSettings | null): string {
  const customLang = (window as any).__LECTURA_ACTIVE_LANG__ || (window as any).__LECTURA_YT_TRACK_LANG__;
  if (customLang) return String(customLang).toLowerCase();
  if (settings?.targetLanguage) return settings.targetLanguage.toLowerCase();
  return 'es';
}

export function extractVideoId(url: string = window.location.href): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/')[2] || null;
    }
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/')[2] || null;
    }
  } catch (_) {}
  return null;
}

/**
 * Initializes the YouTube Lifecycle and Watch Time Tracker.
 * Hooks into YouTube SPA navigation, history state changes, and browser unload events.
 */
export function initYouTubeTracker() {
  if (isObserverInitialized) return;
  isObserverInitialized = true;

  console.log('🎬 [Lectura Tracker] Initializing YouTube Lifecycle Tracker...');

  // 1. Hook into YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', handleYouTubePageChange);
  window.addEventListener('spfdone', handleYouTubePageChange);
  window.addEventListener('popstate', handleYouTubePageChange);

  // Fallback ticker in case YouTube mutates history without firing yt-navigate-finish
  lastObservedUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastObservedUrl) {
      lastObservedUrl = window.location.href;
      handleYouTubePageChange();
    }
  }, 1000);

  // 2. Reliable flush on tab hidden / closed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentVideoSession) {
      flushCurrentSession(currentVideoSession, true, false);
    }
  });
  window.addEventListener('pagehide', () => {
    if (currentVideoSession) flushCurrentSession(currentVideoSession, true, false);
  });
  window.addEventListener('beforeunload', () => {
    if (currentVideoSession) flushCurrentSession(currentVideoSession, true, false);
  });

  // 3. Initial check on page load
  handleYouTubePageChange();
}

function handleYouTubePageChange() {
  const urlParams = new URLSearchParams(window.location.search);
  const newVideoId = urlParams.get('v') || extractVideoId();

  // If video changed or navigated away from watch page:
  if (currentVideoSession && currentVideoSession.videoId !== newVideoId) {
    console.log(`🎬 [Lectura Tracker] Video change detected: terminating previous session for ${currentVideoSession.videoId}`);
    // 1. Flush final progress of old video
    flushCurrentSession(currentVideoSession, true, false);
    // 2. Teardown timers and event listeners of old video
    if (currentVideoSession.intervalId) {
      clearInterval(currentVideoSession.intervalId);
      currentVideoSession.intervalId = null;
    }
    if (currentVideoSession.cleanup) {
      currentVideoSession.cleanup();
    }
    currentVideoSession = null;
  }

  if (sessionInitTimeout) {
    clearTimeout(sessionInitTimeout);
    sessionInitTimeout = null;
  }

  if (newVideoId) {
    // If already tracking this exact video, do not re-init
    if (currentVideoSession && currentVideoSession.videoId === newVideoId) {
      return;
    }
    // 3. Initialize fresh isolated session for the new video
    initNewVideoSession(newVideoId);
  }
}

/**
 * Extracts strictly the primary (first) YouTube channel/author for both standard and collaboration videos,
 * ignoring secondary co-authors so statistics and channel groupings remain clean.
 */
export const extractPrimaryYouTubeChannel = (playerAuthorFallback?: string): string => {
  // 1. Ищем первого автора в блоке (работает и для обычных видео, и для Collaborators)
  const firstAuthorEl = document.querySelector(
    '#upload-info #channel-name a, ytd-video-owner-renderer #channel-name a, #owner #channel-name a, #owner-name a'
  );
  const firstAuthorName = firstAuthorEl?.textContent?.replace(/\u00a0/g, ' ')?.trim();
  if (firstAuthorName && firstAuthorName.toLowerCase() !== 'youtube') {
    return firstAuthorName;
  }

  // 2. Стандартный селектор одного канала (фоллбек)
  const singleChannelEl = document.querySelector('ytd-channel-name #text, ytd-channel-name a');
  const singleName = singleChannelEl?.textContent?.replace(/\u00a0/g, ' ')?.trim();
  if (singleName && singleName.toLowerCase() !== 'youtube') {
    return singleName;
  }

  // 3. Фоллбек на meta itemprop="name" (или meta author)
  const metaAuthor = (
    document.querySelector('meta[itemprop="name"]')?.getAttribute('content') ||
    document.querySelector('meta[name="author"]')?.getAttribute('content')
  )?.replace(/\u00a0/g, ' ')?.trim();
  if (metaAuthor && metaAuthor.toLowerCase() !== 'youtube') {
    return metaAuthor;
  }

  // 4. Фоллбек на данные плеера (без обрезки символов, чтобы не повредить каналы вроде Simon & Garfunkel)
  if (playerAuthorFallback && playerAuthorFallback.trim() && playerAuthorFallback.trim().toLowerCase() !== 'youtube') {
    return playerAuthorFallback.trim();
  }

  return 'YouTube';
};

async function initNewVideoSession(videoId: string, retryCount = 0) {
  // If navigated away while waiting, abort
  const currentUrlVideoId = extractVideoId();
  if (currentUrlVideoId !== videoId) return;

  const ytPlayer = document.getElementById('movie_player') as any;
  const videoElement = document.querySelector<HTMLVideoElement>('video.html5-main-video, #movie_player video');

  // Verify that the YouTube player and DOM have switched to the new video
  let isPlayerReady = false;
  if (ytPlayer && typeof ytPlayer.getVideoData === 'function') {
    const data = ytPlayer.getVideoData();
    if (data && data.video_id === videoId) {
      isPlayerReady = true;
    }
  }

  // If player isn't updated yet, wait and retry
  if (!isPlayerReady && retryCount < 40) {
    sessionInitTimeout = setTimeout(() => initNewVideoSession(videoId, retryCount + 1), 250);
    return;
  }

  const settings = await StorageService.getSettings();
  if (settings.isEnabled === false || settings.trackListeningActivity === false) {
    return;
  }

  // Extract accurate metadata from player or DOM
  let title = '';
  let duration = 0;
  let playerAuthor = '';

  if (ytPlayer && typeof ytPlayer.getVideoData === 'function') {
    const data = ytPlayer.getVideoData();
    if (data && data.video_id === videoId) {
      title = data.title || '';
      playerAuthor = data.author || '';
      duration = Math.round(ytPlayer.getDuration?.() || 0);
    }
  }

  if (!title) {
    const titleElement = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title.ytd-video-primary-info-renderer'
    );
    title = titleElement?.textContent?.trim() || document.title.replace(/ - YouTube$/, '').trim() || `YouTube Video (${videoId})`;
  }

  const channelName = extractPrimaryYouTubeChannel(playerAuthor);

  if (!duration && videoElement && !isNaN(videoElement.duration)) {
    duration = Math.round(videoElement.duration);
  }

  const initialPos = videoElement && !isNaN(videoElement.currentTime) ? Math.round(videoElement.currentTime) : 0;
  const session: VideoSession = {
    videoId,
    title,
    channelName,
    channelUrl: `https://www.youtube.com/watch?v=${videoId}`,
    duration,
    studyLanguage: getStudyLanguage(settings),
    actualWatchedSeconds: 0,
    lastFlushedSeconds: 0,
    lastPlaybackPosition: initialPos,
    lastWallClockTime: videoElement && !videoElement.paused ? Date.now() : null,
    currentPosition: initialPos,
    isCompleted: false,
    intervalId: null,
    videoElement: videoElement || null,
  };

  currentVideoSession = session;
  console.log(`🎯 [Lectura Tracker] Starting fresh isolated session for "${title}" (${videoId}, ${duration}s)`);

  // Register the video open event (0s) immediately so it shows in TODAY
  syncOpenSession(session);

  if (videoElement) {
    const onTimeUpdate = () => {
      if (!session.videoElement || session.videoElement.paused || session.videoElement.seeking) return;
      const now = Date.now();
      const cur = session.videoElement.currentTime;
      session.currentPosition = cur;

      if (session.lastWallClockTime === null) {
        session.lastWallClockTime = now;
        session.lastPlaybackPosition = cur;
        return;
      }

      const wallDelta = (now - session.lastWallClockTime) / 1000;
      const mediaDelta = cur - session.lastPlaybackPosition;

      // Discontinuity / seek detection: do NOT credit jump distance if skipped
      if (mediaDelta < 0 || mediaDelta >= 3.0 || wallDelta >= 3.0) {
        session.lastWallClockTime = now;
        session.lastPlaybackPosition = cur;
        return;
      }

      if (mediaDelta > 0 && wallDelta > 0) {
        const rate = session.videoElement.playbackRate || 1;
        const effectiveDelta = Math.min(mediaDelta, wallDelta * rate + 0.5);
        session.actualWatchedSeconds += effectiveDelta;
      }

      session.lastWallClockTime = now;
      session.lastPlaybackPosition = cur;
    };

    const onPlay = () => {
      if (!session.videoElement) return;
      session.lastWallClockTime = Date.now();
      session.lastPlaybackPosition = session.videoElement.currentTime;
      session.currentPosition = session.videoElement.currentTime;
    };

    const onPause = () => {
      if (session.lastWallClockTime && session.videoElement) {
        const now = Date.now();
        const wallDelta = (now - session.lastWallClockTime) / 1000;
        const cur = session.videoElement.currentTime;
        const mediaDelta = cur - session.lastPlaybackPosition;
        if (mediaDelta > 0 && mediaDelta < 5 && wallDelta < 5) {
          const rate = session.videoElement.playbackRate || 1;
          session.actualWatchedSeconds += Math.min(mediaDelta, wallDelta * rate + 0.5);
        }
        session.currentPosition = cur;
        session.lastPlaybackPosition = cur;
        session.lastWallClockTime = null;
      }
      flushCurrentSession(session, false, false);
    };

    const onSeeking = () => {
      // Seek started: freeze timer so seek distance is NEVER counted
      session.lastWallClockTime = null;
      if (session.videoElement) {
        session.currentPosition = session.videoElement.currentTime;
        session.lastPlaybackPosition = session.videoElement.currentTime;
      }
    };

    const onSeeked = () => {
      // Seek finished: set position to new seek point without counting the jump
      if (session.videoElement) {
        session.currentPosition = session.videoElement.currentTime;
        session.lastPlaybackPosition = session.videoElement.currentTime;
        if (!session.videoElement.paused) {
          session.lastWallClockTime = Date.now();
        }
      }
    };

    const onEnded = () => {
      session.isCompleted = true;
      if (session.videoElement) {
        session.currentPosition = session.videoElement.duration || session.currentPosition;
      }
      flushCurrentSession(session, true, true);
    };

    videoElement.addEventListener('timeupdate', onTimeUpdate);
    videoElement.addEventListener('play', onPlay);
    videoElement.addEventListener('pause', onPause);
    videoElement.addEventListener('seeking', onSeeking);
    videoElement.addEventListener('seeked', onSeeked);
    videoElement.addEventListener('ended', onEnded);

    session.cleanup = () => {
      videoElement.removeEventListener('timeupdate', onTimeUpdate);
      videoElement.removeEventListener('play', onPlay);
      videoElement.removeEventListener('pause', onPause);
      videoElement.removeEventListener('seeking', onSeeking);
      videoElement.removeEventListener('seeked', onSeeked);
      videoElement.removeEventListener('ended', onEnded);
    };

    // Periodic progress flush every 10 seconds
    session.intervalId = setInterval(() => {
      if (
        session.videoElement &&
        !session.videoElement.paused &&
        session.actualWatchedSeconds > session.lastFlushedSeconds
      ) {
        flushCurrentSession(session, false, false);
      }
    }, 10000);
  }
}

async function syncOpenSession(session: VideoSession) {
  try {
    const settings = await StorageService.getSettings();
    if (settings.isEnabled === false || settings.trackListeningActivity === false) return;

    if (!session.channelName || session.channelName === 'YouTube') {
      const refreshedChannel = extractPrimaryYouTubeChannel();
      if (refreshedChannel && refreshedChannel !== 'YouTube') {
        session.channelName = refreshedChannel;
      }
    }

    const currentPos = Math.round(session.videoElement?.currentTime ?? session.currentPosition ?? 0);

    sendPayload(
      settings,
      {
        videoId: session.videoId,
        lessonId: `lesson-yt_${session.videoId}`,
        title: session.title,
        channelName: session.channelName,
        channelUrl: session.channelUrl,
        duration: session.duration,
        durationSeconds: session.duration,
        timeSpentSeconds: 0,
        studyLanguage: session.studyLanguage,
        addedSeconds: 0,
        watchedSeconds: 0,
        lastPosition: currentPos,
        currentTime: currentPos,
        isCompleted: false,
        timestamp: Date.now(),
      },
      false
    );
  } catch (err) {
    console.warn('[Lectura Tracker] syncOpenSession error:', err);
  }
}

async function flushCurrentSession(session: VideoSession, isFinal: boolean = false, isCompleted: boolean = false) {
  if (!session) return;

  if (!session.channelName || session.channelName === 'YouTube') {
    const refreshedChannel = extractPrimaryYouTubeChannel();
    if (refreshedChannel && refreshedChannel !== 'YouTube') {
      session.channelName = refreshedChannel;
    }
  }

  const currentDuration = Math.round(
    session.videoElement?.duration || session.duration || 0
  );
  const currentPos = Math.round(
    session.videoElement?.currentTime ?? session.currentPosition ?? 0
  );
  const completed =
    isCompleted ||
    Boolean(session.videoElement ? session.videoElement.ended : false) ||
    session.isCompleted ||
    (currentDuration > 0 && currentPos >= currentDuration - 5 && session.actualWatchedSeconds > 10);

  const totalWatched = Math.round(session.actualWatchedSeconds);
  const added = Math.max(0, totalWatched - session.lastFlushedSeconds);

  if (added <= 0 && !completed && !isFinal) {
    return;
  }

  session.lastFlushedSeconds = totalWatched;

  try {
    const settings = await StorageService.getSettings();
    if (settings.isEnabled === false || settings.trackListeningActivity === false) return;

    const payload = {
      videoId: session.videoId,
      lessonId: `lesson-yt_${session.videoId}`,
      title: session.title,
      channelName: session.channelName,
      channelUrl: session.channelUrl,
      duration: currentDuration,
      durationSeconds: currentDuration,
      timeSpentSeconds: totalWatched,
      addedSeconds: added,
      watchedSeconds: added,
      lastPosition: currentPos,
      currentTime: currentPos,
      studyLanguage: session.studyLanguage,
      isCompleted: completed,
      timestamp: Date.now(),
    };

    console.log(
      `⏱️ [Lectura Tracker] Progress (${session.videoId}): watched ${totalWatched}s (+${added}s), pos ${currentPos}s / ${currentDuration}s (completed=${completed}, final=${isFinal})`
    );
    sendPayload(settings, payload, isFinal);
  } catch (err) {
    console.warn('[Lectura Tracker] flushCurrentSession error:', err);
  }
}

function sendPayload(settings: ExtensionSettings, payload: any, isFinal: boolean) {
  const serverUrl = (settings.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const endpoint = `${serverUrl}/api/history/track-activity`;

  const userId = (settings.selectedUserId || '').trim();
  const userEmail = (settings.selectedUserEmail || '').trim();

  // Attach credentials directly into payload for sendBeacon and server parsing
  payload.userId = userId || userEmail || 'default';
  payload.syncUser = userId || userEmail || 'default';
  payload.userEmail = userEmail || (userId.includes('@') ? userId : '');
  payload.syncKey = settings.syncKey || '';
  payload.authToken = settings.authToken || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.authToken) {
    const clean = settings.authToken.trim();
    headers['Authorization'] = clean.startsWith('Bearer ') ? clean : `Bearer ${clean}`;
  }
  if (settings.syncKey) {
    headers['x-local-sync-key'] = settings.syncKey.trim();
    headers['X-Local-Sync-Key'] = settings.syncKey.trim();
  }
  if (userId) {
    headers['x-local-sync-user'] = userId;
    headers['X-User-Id'] = userId;
    if (userId.includes('@') && !userEmail) {
      headers['X-User-Email'] = userId;
    }
  }
  if (userEmail) {
    headers['X-User-Email'] = userEmail;
    if (!headers['x-local-sync-user']) {
      headers['x-local-sync-user'] = userEmail;
    }
  }

  const jsonStr = JSON.stringify(payload);

  // 1. Send via fetch with keepalive: true (preserves custom headers even while unloading)
  try {
    fetch(endpoint, {
      method: 'POST',
      headers,
      body: jsonStr,
      keepalive: true,
    }).catch((err) => {
      console.warn('[Lectura Tracker] fetch error:', err);
    });
  } catch (err) {
    console.warn('[Lectura Tracker] fetch exception:', err);
  }

  // 2. If page is unloading and navigator.sendBeacon is available, fire beacon as redundant safeguard
  if (isFinal && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const beaconUrl = `${endpoint}?sync_user=${encodeURIComponent(
        userId || userEmail || 'default'
      )}&userId=${encodeURIComponent(userId || '')}&userEmail=${encodeURIComponent(userEmail || '')}&sync_key=${encodeURIComponent(settings.syncKey || '')}`;
      const blob = new Blob([jsonStr], { type: 'application/json' });
      navigator.sendBeacon(beaconUrl, blob);
    } catch (_) {}
  }

  // 3. Also notify background service worker
  try {
    chrome.runtime
      .sendMessage({
        type: 'LOG_YOUTUBE_ACTIVITY',
        payload,
      })
      .catch(() => {});
  } catch (_) {}
}
