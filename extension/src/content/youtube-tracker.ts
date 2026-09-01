import { StorageService } from '../services/storage';
import { ExtensionSettings } from '../types/index';

export interface VideoSession {
  videoId: string;
  title: string;
  channelName: string;
  channelUrl: string;
  duration: number;
  studyLanguage: string;
  maxWatchedPosition: number;
  lastReportedPosition: number;
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
  let channelName = '';
  let duration = 0;

  if (ytPlayer && typeof ytPlayer.getVideoData === 'function') {
    const data = ytPlayer.getVideoData();
    if (data && data.video_id === videoId) {
      title = data.title || '';
      channelName = data.author || '';
      duration = Math.round(ytPlayer.getDuration?.() || 0);
    }
  }

  if (!title) {
    const titleElement = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title.ytd-video-primary-info-renderer'
    );
    title = titleElement?.textContent?.trim() || document.title.replace(/ - YouTube$/, '').trim() || `YouTube Video (${videoId})`;
  }

  if (!channelName) {
    const channelElement = document.querySelector(
      'ytd-channel-name a, #channel-name a, #upload-info #channel-name a'
    ) as HTMLAnchorElement;
    channelName = channelElement?.textContent?.trim() || 'YouTube';
  }

  if (!duration && videoElement && !isNaN(videoElement.duration)) {
    duration = Math.round(videoElement.duration);
  }

  const session: VideoSession = {
    videoId,
    title,
    channelName,
    channelUrl: `https://www.youtube.com/watch?v=${videoId}`,
    duration,
    studyLanguage: getStudyLanguage(settings),
    maxWatchedPosition: 0,
    lastReportedPosition: 0,
    intervalId: null,
    videoElement: videoElement || null,
  };

  currentVideoSession = session;
  console.log(`🎯 [Lectura Tracker] Starting fresh isolated session for "${title}" (${videoId}, ${duration}s)`);

  // Register the video open event (0s) immediately so it shows in TODAY
  syncOpenSession(session);

  if (videoElement) {
    const onTimeUpdate = () => {
      if (!session.videoElement || session.videoElement.paused) return;
      const cur = Math.round(session.videoElement.currentTime || 0);
      if (cur > session.maxWatchedPosition) {
        session.maxWatchedPosition = cur;
      }
    };

    const onEnded = () => {
      const total = Math.round(session.videoElement?.duration || session.duration || session.maxWatchedPosition);
      session.maxWatchedPosition = total;
      flushCurrentSession(session, true, true);
    };

    const onPause = () => {
      flushCurrentSession(session, false, false);
    };

    videoElement.addEventListener('timeupdate', onTimeUpdate);
    videoElement.addEventListener('ended', onEnded);
    videoElement.addEventListener('pause', onPause);

    session.cleanup = () => {
      videoElement.removeEventListener('timeupdate', onTimeUpdate);
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('pause', onPause);
    };

    // Periodic progress flush every 10 seconds
    session.intervalId = setInterval(() => {
      if (
        session.videoElement &&
        !session.videoElement.paused &&
        session.maxWatchedPosition > session.lastReportedPosition
      ) {
        const total = Math.round(session.videoElement.duration || session.duration || 0);
        const isCompleted = session.videoElement.ended || (total > 0 && session.maxWatchedPosition >= total - 5);
        flushCurrentSession(session, false, isCompleted);
      }
    }, 10000);
  }
}

async function syncOpenSession(session: VideoSession) {
  try {
    const settings = await StorageService.getSettings();
    if (settings.isEnabled === false || settings.trackListeningActivity === false) return;

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

  const currentDuration = Math.round(
    session.videoElement?.duration || session.duration || 0
  );
  const completed =
    isCompleted ||
    (session.videoElement ? session.videoElement.ended : false) ||
    (currentDuration > 0 && session.maxWatchedPosition >= currentDuration - 5);

  const effectiveTimeSpent = completed && currentDuration > 0
    ? currentDuration
    : session.maxWatchedPosition;

  if (effectiveTimeSpent <= session.lastReportedPosition && !completed && !isFinal) {
    return;
  }

  const added = Math.max(0, effectiveTimeSpent - session.lastReportedPosition);
  session.lastReportedPosition = effectiveTimeSpent;

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
      timeSpentSeconds: effectiveTimeSpent,
      addedSeconds: added,
      watchedSeconds: effectiveTimeSpent,
      studyLanguage: session.studyLanguage,
      isCompleted: completed,
      timestamp: Date.now(),
    };

    console.log(
      `⏱️ [Lectura Tracker] Progress (${session.videoId}): ${effectiveTimeSpent}s / ${currentDuration}s (+${added}s, completed=${completed}, final=${isFinal})`
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
