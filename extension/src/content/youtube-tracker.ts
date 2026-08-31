import { StorageService } from '../services/storage';
import { ExtensionSettings } from '../types/index';

interface VideoSession {
  videoId: string;
  title: string;
  channelName: string;
  channelUrl: string;
  duration: number;
  studyLanguage: string;
}

let currentSession: VideoSession | null = null;
let lastVideoCurrentTime = 0;
let pendingSecondsBuffer = 0;
let activeVideoElement: HTMLVideoElement | null = null;
let isObserverInitialized = false;

function getStudyLanguage(settings: ExtensionSettings | null): string {
  const customLang = (window as any).__LECTURA_ACTIVE_LANG__ || (window as any).__LECTURA_YT_TRACK_LANG__;
  if (customLang) return String(customLang).toLowerCase();
  if (settings?.targetLanguage) return settings.targetLanguage.toLowerCase();
  return 'es';
}

function extractVideoId(url: string = window.location.href): string | null {
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
 * Called on page load and hooks into YouTube SPA navigation and browser unload events.
 */
export function initYouTubeTracker() {
  if (isObserverInitialized) return;
  isObserverInitialized = true;

  console.log('🎬 [Lectura Tracker] Initializing YouTube Lifecycle Tracker...');

  // 1. Hook into YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', handleVideoNavigation);
  window.addEventListener('spfdone', handleVideoNavigation);
  window.addEventListener('popstate', handleVideoNavigation);

  // Fallback ticker in case YouTube mutates history without firing yt-navigate-finish
  let lastObservedUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastObservedUrl) {
      lastObservedUrl = window.location.href;
      handleVideoNavigation();
    }
  }, 1000);

  // 2. Reliable flush on tab hidden / closed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushTime(true);
    }
  });
  window.addEventListener('pagehide', () => flushTime(true));
  window.addEventListener('beforeunload', () => flushTime(true));

  // 3. Initial check on page load
  handleVideoNavigation();
}

function handleVideoNavigation() {
  const videoId = extractVideoId();

  // If navigated away from previous video, flush pending buffer immediately
  if (currentSession && currentSession.videoId !== videoId) {
    flushTime(true);
    currentSession = null;
    detachVideoListeners();
  }

  if (!videoId) return;

  waitForVideoElement((video) => {
    startTrackingVideo(video, videoId);
  });
}

function waitForVideoElement(callback: (v: HTMLVideoElement) => void, retries = 0) {
  if (retries > 60) return; // Timeout after ~18s

  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video, #movie_player video');
  if (video && !isNaN(video.duration) && video.duration > 0) {
    callback(video);
  } else {
    setTimeout(() => waitForVideoElement(callback, retries + 1), 300);
  }
}

async function startTrackingVideo(video: HTMLVideoElement, videoId: string) {
  // If already tracking this exact video, avoid duplicate listeners
  if (currentSession && currentSession.videoId === videoId && activeVideoElement === video) {
    return;
  }

  detachVideoListeners();
  activeVideoElement = video;

  const settings = await StorageService.getSettings();
  if (settings.isEnabled === false || settings.trackListeningActivity === false) {
    return;
  }

  // Extract rich metadata from YouTube page
  const titleEl = document.querySelector(
    'h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title.ytd-video-primary-info-renderer'
  );
  const title =
    titleEl?.textContent?.trim() ||
    document.title.replace(/ - YouTube$/, '').trim() ||
    `YouTube Video (${videoId})`;

  const channelEl = document.querySelector(
    'ytd-channel-name a, #channel-name a, #upload-info #channel-name a'
  ) as HTMLAnchorElement;
  const channelName = channelEl?.textContent?.trim() || 'YouTube';
  const channelUrl = channelEl?.href || `https://www.youtube.com/watch?v=${videoId}`;

  const studyLanguage = getStudyLanguage(settings);

  currentSession = {
    videoId,
    title,
    channelName,
    channelUrl,
    duration: Math.round(video.duration || 0),
    studyLanguage,
  };

  lastVideoCurrentTime = video.currentTime;
  pendingSecondsBuffer = 0;

  console.log('🎯 [Lectura Tracker] Tracking YouTube session:', currentSession);

  // 1. Immediately register the video open event in history (with 0s) so it instantly appears in TODAY
  syncOpenSession(currentSession);

  // 2. Attach robust timeupdate listeners (unaffected by Chrome background throttling)
  const onPlay = () => {
    lastVideoCurrentTime = video.currentTime;
  };

  const onTimeUpdate = () => {
    if (video.paused || video.seeking) {
      lastVideoCurrentTime = video.currentTime;
      return;
    }

    const delta = video.currentTime - lastVideoCurrentTime;
    // Count normal forward playback (0 to 2.5s per timeupdate tick, ignore rewinds & scrubs)
    if (delta > 0 && delta < 2.5) {
      pendingSecondsBuffer += delta;
    }
    lastVideoCurrentTime = video.currentTime;

    // Flush accumulated watch time every 10 seconds
    if (pendingSecondsBuffer >= 10) {
      flushTime(false);
    }
  };

  const onEnded = () => {
    flushTime(true, true);
  };

  const onPause = () => {
    flushTime(false);
  };

  video.addEventListener('play', onPlay);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  video.addEventListener('pause', onPause);

  (video as any).__lectura_cleanup = () => {
    video.removeEventListener('play', onPlay);
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('pause', onPause);
  };
}

function detachVideoListeners() {
  if (activeVideoElement && (activeVideoElement as any).__lectura_cleanup) {
    (activeVideoElement as any).__lectura_cleanup();
    delete (activeVideoElement as any).__lectura_cleanup;
  }
  activeVideoElement = null;
}

async function syncOpenSession(session: VideoSession) {
  try {
    const settings = await StorageService.getSettings();
    if (settings.isEnabled === false || settings.trackListeningActivity === false) return;

    sendPayload(
      settings,
      {
        videoId: session.videoId,
        title: session.title,
        channelName: session.channelName,
        channelUrl: session.channelUrl,
        duration: session.duration,
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

async function flushTime(isFinal: boolean = false, isCompleted: boolean = false) {
  if (!currentSession) return;
  if (pendingSecondsBuffer < 1 && !isFinal && !isCompleted) return;

  const secondsToSend = Math.round(pendingSecondsBuffer);
  pendingSecondsBuffer = 0;

  if (secondsToSend <= 0 && !isFinal && !isCompleted) return;

  try {
    const settings = await StorageService.getSettings();
    if (settings.isEnabled === false || settings.trackListeningActivity === false) return;

    const payload = {
      videoId: currentSession.videoId,
      title: currentSession.title,
      channelName: currentSession.channelName,
      channelUrl: currentSession.channelUrl,
      duration: currentSession.duration,
      studyLanguage: currentSession.studyLanguage,
      addedSeconds: secondsToSend,
      isCompleted,
      timestamp: Date.now(),
    };

    console.log(`⏱️ [Lectura Tracker] Flushing ${secondsToSend}s (final=${isFinal}, completed=${isCompleted})`);
    sendPayload(settings, payload, isFinal);
  } catch (err) {
    console.warn('[Lectura Tracker] flushTime error:', err);
  }
}

function sendPayload(settings: ExtensionSettings, payload: any, isFinal: boolean) {
  const serverUrl = (settings.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const endpoint = `${serverUrl}/api/history/track-activity`;

  // Attach credentials directly into payload for sendBeacon and server parsing
  payload.userId = settings.selectedUserId || 'default';
  payload.syncUser = settings.selectedUserId || 'default';
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
  }
  if (settings.selectedUserId) {
    headers['x-local-sync-user'] = settings.selectedUserId.trim();
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
        settings.selectedUserId || 'default'
      )}&sync_key=${encodeURIComponent(settings.syncKey || '')}`;
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
