/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Lectura YouTube Bridge (Runs in MAIN world context)
 * Directly accesses YouTube player (movie_player), intercepts /api/timedtext requests,
 * and bridges caption tracks without CSP restrictions.
 */

(function () {
  if ((window as any).__LECTURA_YOUTUBE_BRIDGE_INSTALLED__) return;
  (window as any).__LECTURA_YOUTUBE_BRIDGE_INSTALLED__ = true;

  console.log('⚡ [Lectura Bridge] YouTube MAIN world bridge initialized');

  interface CachedTimedText {
    videoId: string;
    lang: string;
    url: string;
    text: string;
    timestamp: number;
  }

  const timedTextCache: CachedTimedText[] = [];
  let lastPreferredLang: string | undefined = undefined;
  let attachedPlayer: any = null;

  function normalizeCode(code: string): string {
    if (!code) return '';
    return String(code).trim().toLowerCase().split(/[-_]/)[0];
  }

  function notifyTimedText(lang: string | null, url: string, text: string | null) {
    try {
      let videoId = '';
      try {
        const parsed = new URL(url, window.location.origin);
        videoId = parsed.searchParams.get('v') || '';
      } catch (_) {}

      if (lang) {
        window.dispatchEvent(new CustomEvent('LECTURA_TIMEDTEXT_LANG', { detail: { lang, videoId, url } }));
      }
      if (text && typeof text === 'string' && (text.includes('events') || text.includes('<transcript') || text.includes('timedtext'))) {
        if (lang && videoId) {
          const cleanLang = normalizeCode(lang);
          const existingIdx = timedTextCache.findIndex((c) => c.videoId === videoId && normalizeCode(c.lang) === cleanLang);
          const entry: CachedTimedText = { videoId, lang: cleanLang, url, text, timestamp: Date.now() };
          if (existingIdx >= 0) {
            timedTextCache[existingIdx] = entry;
          } else {
            timedTextCache.push(entry);
            if (timedTextCache.length > 15) timedTextCache.shift();
          }
        }
        window.dispatchEvent(new CustomEvent('LECTURA_TIMEDTEXT_DATA', { detail: { lang, videoId, url, text } }));
      }
    } catch (_) {}
  }

  // 1. Intercept fetch in MAIN world
  try {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && (args[0] as any).url);
      const res = await origFetch.apply(this, args as any);
      if (url && typeof url === 'string' && url.includes('/api/timedtext')) {
        try {
          const parsed = new URL(url, window.location.origin);
          const tlang = parsed.searchParams.get('tlang');
          const lang = tlang || parsed.searchParams.get('lang');
          const clone = res.clone();
          clone.text().then((text) => {
            notifyTimedText(lang, url, text);
          }).catch(() => notifyTimedText(lang, url, null));
        } catch (_) {}
      }
      return res;
    };
  } catch (_) {}

  // 2. Intercept XMLHttpRequest in MAIN world
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      const urlStr = typeof url === 'string' ? url : (url ? url.toString() : '');
      if (urlStr && urlStr.includes('/api/timedtext')) {
        try {
          const parsed = new URL(urlStr, window.location.origin);
          const tlang = parsed.searchParams.get('tlang');
          const lang = tlang || parsed.searchParams.get('lang');
          this.addEventListener('load', function () {
            notifyTimedText(lang, urlStr, this.responseText);
          });
        } catch (_) {}
      }
      return (origOpen as any).apply(this, [method, url, ...rest]);
    };
  } catch (_) {}

  /**
   * Checks if a candidate track language is incompatible with the video title's script
   * (e.g., prevents selecting Arabic 'ar' or Bangla 'bn' when the video title is in Latin script)
   */
  function isScriptIncompatibleWithTitle(langCode: string, title: string): boolean {
    if (!title || !langCode) return false;
    const code = normalizeCode(langCode);
    const hasLatin = /[a-zA-Z]{2,}/.test(title);
    if (!hasLatin) return false;

    if (code === 'ar' || code === 'fa' || code === 'ur') {
      return !/[\u0600-\u06FF]/.test(title);
    }
    if (code === 'bn') {
      return !/[\u0980-\u09FF]/.test(title);
    }
    if (code === 'hi' || code === 'mr' || code === 'ne') {
      return !/[\u0900-\u097F]/.test(title);
    }
    if (code === 'th') {
      return !/[\u0E00-\u0E7F]/.test(title);
    }
    if (code === 'he' || code === 'iw') {
      return !/[\u0590-\u05FF]/.test(title);
    }
    if (code === 'el') {
      return !/[\u0370-\u03FF]/.test(title);
    }
    return false;
  }

  /**
   * Extracts the video's true original spoken language from YouTube player response & runtime metadata.
   * Handles YouTube's multi-language ASR / Auto-Dubbing where multiple tracks have kind === 'asr'.
   */
  function detectOriginalSpokenLanguage(pResp: any, player: any, tracks: any[]): string {
    if (!Array.isArray(tracks) || tracks.length === 0) return '';
    const title = pResp?.videoDetails?.title || document.title || '';

    // 1. Check microformat / videoDetails explicit defaultAudioLanguage
    const microAudioLang =
      pResp?.microformat?.playerMicroformatRenderer?.defaultAudioLanguage ||
      pResp?.videoDetails?.defaultAudioLanguage;
    if (microAudioLang) {
      const clean = normalizeCode(microAudioLang);
      if (clean && tracks.some((t: any) => normalizeCode(t.languageCode) === clean)) {
        return clean;
      }
    }

    // 2. Check streamingData.adaptiveFormats for the "original" or default audio track (e.g. "English (US) original")
    const adaptiveFormats = pResp?.streamingData?.adaptiveFormats;
    if (Array.isArray(adaptiveFormats)) {
      const origAudioFmt =
        adaptiveFormats.find((f: any) => f?.audioTrack?.displayName && /original/i.test(String(f.audioTrack.displayName))) ||
        adaptiveFormats.find((f: any) => f?.audioTrack?.id && /original/i.test(String(f.audioTrack.id))) ||
        adaptiveFormats.find((f: any) => f?.audioTrack?.audioIsDefault === true);
      if (origAudioFmt?.audioTrack?.id) {
        const clean = normalizeCode(String(origAudioFmt.audioTrack.id).split('.')[0]);
        if (clean && tracks.some((t: any) => normalizeCode(t.languageCode) === clean)) {
          return clean;
        }
      }
    }

    // 3. Check playerCaptionsTracklistRenderer.audioTracks defaultAudioTrackIndex -> defaultCaptionTrackIndex / audioTrackId
    const renderer = pResp?.captions?.playerCaptionsTracklistRenderer;
    if (renderer && Array.isArray(renderer.audioTracks) && renderer.audioTracks.length > 0) {
      const defAudioIdx = typeof renderer.defaultAudioTrackIndex === 'number' ? renderer.defaultAudioTrackIndex : 0;
      const defAudioTrack = renderer.audioTracks[defAudioIdx] || renderer.audioTracks[0];
      if (defAudioTrack?.audioTrackId) {
        const clean = normalizeCode(String(defAudioTrack.audioTrackId).split('.')[0]);
        if (clean && !isScriptIncompatibleWithTitle(clean, title) && tracks.some((t: any) => normalizeCode(t.languageCode) === clean)) {
          return clean;
        }
      }
      if (typeof defAudioTrack?.defaultCaptionTrackIndex === 'number' && tracks[defAudioTrack.defaultCaptionTrackIndex]) {
        const capLang = normalizeCode(tracks[defAudioTrack.defaultCaptionTrackIndex].languageCode);
        if (capLang && !isScriptIncompatibleWithTitle(capLang, title)) {
          return capLang;
        }
      }
    }

    // 4. If a language has BOTH a manual track (kind !== 'asr') AND an ASR track (kind === 'asr'),
    // while other languages only have ASR or manual translations, that paired language is the creator's original language!
    const manualLangs = new Set(
      tracks.filter((t: any) => t.kind !== 'asr').map((t: any) => normalizeCode(t.languageCode)).filter(Boolean)
    );
    const asrLangs = new Set(
      tracks.filter((t: any) => t.kind === 'asr').map((t: any) => normalizeCode(t.languageCode)).filter(Boolean)
    );
    const pairedLangs = Array.from(manualLangs).filter((l) => asrLangs.has(l) && !isScriptIncompatibleWithTitle(l, title));
    if (pairedLangs.length === 1) {
      return pairedLangs[0];
    }

    // 5. If there is only ONE manual (non-ASR) track (e.g. "English" + many "(auto-generated)" tracks),
    // that manual track is the creator's uploaded original language!
    const validManualLangs = Array.from(manualLangs).filter((l) => !isScriptIncompatibleWithTitle(l, title));
    if (validManualLangs.length === 1) {
      return validManualLangs[0];
    }

    // 6. If there is only ONE ASR track total, it is the video's spoken language
    const validAsrLangs = Array.from(asrLangs).filter((l) => !isScriptIncompatibleWithTitle(l, title));
    if (validAsrLangs.length === 1) {
      return validAsrLangs[0];
    }

    // 7. Check runtime movie_player caption tracklist order (YouTube's UI menu puts the original language at index 0)
    try {
      const runtimeList = player?.getOption?.('captions', 'tracklist');
      if (Array.isArray(runtimeList) && runtimeList.length > 0) {
        const defRuntime = runtimeList.find((rt: any) => rt.is_default) || runtimeList[0];
        if (defRuntime?.languageCode) {
          const clean = normalizeCode(defRuntime.languageCode);
          if (clean && !isScriptIncompatibleWithTitle(clean, title)) {
            return clean;
          }
        }
      }
    } catch (_) {}

    // 8. Check first track in captionTracks if its script is compatible with the title and not an alphabetical auto-dub outlier
    const firstLang = normalizeCode(tracks[0]?.languageCode || '');
    if (firstLang && !isScriptIncompatibleWithTitle(firstLang, title) && !['ar', 'sq', 'af', 'am', 'az', 'bn', 'bs', 'eu'].includes(firstLang)) {
      return firstLang;
    }

    return '';
  }

  function selectBestCaptionTrack(tracks: any[], spokenLang: string, preferredLang?: string, title: string = ''): any {
    if (!Array.isArray(tracks) || tracks.length === 0) return null;
    const pref = normalizeCode(preferredLang || '');
    const spoken = normalizeCode(spokenLang || '');

    // 1. If we know the video's original spoken language, strongly prioritize it!
    // (When watching an English video, subtitles must be in English, not Arabic/Albanian)
    if (spoken) {
      const spokenMatches = tracks.filter((t: any) => normalizeCode(t.languageCode) === spoken);
      if (spokenMatches.length > 0) {
        // Prefer creator's manual track in the spoken language if available, otherwise ASR in the spoken language
        return spokenMatches.find((t: any) => t.kind !== 'asr') || spokenMatches[0];
      }
    }

    // 2. If user's preferred study language exists on the video and is compatible with title script
    if (pref && !isScriptIncompatibleWithTitle(pref, title)) {
      const prefMatches = tracks.filter((t: any) => normalizeCode(t.languageCode) === pref);
      if (prefMatches.length > 0) {
        return prefMatches.find((t: any) => t.kind !== 'asr') || prefMatches[0];
      }
    }

    // 3. Fallback to common major languages (preferring manual tracks first)
    const majorPriority = ['en', 'es', 'ru', 'uk', 'de', 'fr', 'pt', 'it', 'ja', 'zh', 'ko'];
    for (const code of majorPriority) {
      if (isScriptIncompatibleWithTitle(code, title)) continue;
      const match = tracks.find((t: any) => normalizeCode(t.languageCode) === code && t.kind !== 'asr') ||
                    tracks.find((t: any) => normalizeCode(t.languageCode) === code);
      if (match) return match;
    }

    // 4. Any track compatible with title script
    const compatible = tracks.find((t: any) => !isScriptIncompatibleWithTitle(t.languageCode, title));
    return compatible || tracks[0];
  }

  /**
   * Clears sticky Arabic/Albanian caption overrides that YouTube persists in localStorage/sessionStorage
   */
  function sanitizeYouTubeStickyCaptionStorage(bestLang: string, prefLang: string, title: string) {
    if (!bestLang) return;
    const storages = [window.localStorage, window.sessionStorage];
    const keys = ['yt-player-sticky-caption', 'yt-player-caption-language-preferences'];
    for (const storage of storages) {
      try {
        if (!storage) continue;
        for (const key of keys) {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const lower = raw.toLowerCase();
          // If sticky storage forces an incompatible language (e.g. 'ar', 'sq', 'bn') that is neither bestLang nor prefLang
          if (
            lower.includes('"ar"') ||
            lower.includes('"sq"') ||
            lower.includes('"bn"') ||
            isScriptIncompatibleWithTitle('ar', title) && lower.includes('arabic')
          ) {
            if (bestLang !== 'ar' && prefLang !== 'ar' && bestLang !== 'sq' && prefLang !== 'sq') {
              storage.removeItem(key);
            }
          }
        }
      } catch (_) {}
    }
  }

  // 3. Inspect YouTube Player and bridge caption tracks
  function bridgePlayerCaptionTracks(forceEnableCC?: boolean, preferredLang?: string) {
    try {
      if (preferredLang) {
        lastPreferredLang = preferredLang;
      } else if (lastPreferredLang) {
        preferredLang = lastPreferredLang;
      }

      const player = document.getElementById('movie_player') as any;
      const pResp = (player && typeof player.getPlayerResponse === 'function' && player.getPlayerResponse()) ||
                    (window as any).ytInitialPlayerResponse;

      const videoId = pResp?.videoDetails?.videoId || '';
      const title = pResp?.videoDetails?.title || document.title || '';
      const tracks = pResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (Array.isArray(tracks) && tracks.length > 0) {
        const spokenLang = detectOriginalSpokenLanguage(pResp, player, tracks);
        const bestTrack = selectBestCaptionTrack(tracks, spokenLang, preferredLang, title);
        const bestLang = normalizeCode(bestTrack?.languageCode || spokenLang || 'en');
        const prefNorm = normalizeCode(preferredLang || '');

        sanitizeYouTubeStickyCaptionStorage(bestLang, prefNorm, title);

        window.dispatchEvent(
          new CustomEvent('LECTURA_CAPTION_TRACKS', {
            detail: {
              videoId,
              spokenLang: spokenLang || bestLang,
              bestLang,
              tracks: tracks.map((t: any) => {
                const tLang = normalizeCode(t.languageCode);
                return {
                  baseUrl: t.baseUrl,
                  languageCode: t.languageCode,
                  vssId: t.vssId,
                  name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
                  kind: t.kind,
                  isDefault: Boolean(t.isDefault || tLang === (spokenLang || bestLang)),
                  isSpokenOriginal: Boolean(tLang === (spokenLang || bestLang)),
                };
              }),
            },
          })
        );

        // Replay cached timedtext payload if we already intercepted the best track earlier (e.g. at document_start)
        if (videoId && bestLang) {
          const cachedBest = timedTextCache.find((c) => c.videoId === videoId && normalizeCode(c.lang) === bestLang);
          if (cachedBest) {
            window.dispatchEvent(
              new CustomEvent('LECTURA_TIMEDTEXT_DATA', {
                detail: {
                  lang: cachedBest.lang,
                  videoId: cachedBest.videoId,
                  url: cachedBest.url,
                  text: cachedBest.text,
                },
              })
            );
          }
        }

        const ccBtn = document.querySelector<HTMLElement>('.ytp-subtitles-button');
        const isCcPressed = ccBtn && ccBtn.getAttribute('aria-pressed') === 'true';

        if (player && bestTrack && (forceEnableCC || isCcPressed)) {
          if (typeof player.loadModule === 'function') {
            try { player.loadModule('captions'); } catch (_) {}
          }
          if (forceEnableCC && ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
            ccBtn.click();
          }

          const applyBestTrackToPlayer = () => {
            try {
              if (typeof player.setOption !== 'function') return;
              const cur = player.getOption?.('captions', 'track');
              const currentTrackLang = normalizeCode(cur?.languageCode || '');
              const currentTranslationLang = normalizeCode(cur?.translationLanguage?.languageCode || '');

              // Check if current active player track is missing, auto-translated, or doesn't match bestLang
              const isWrongTrack =
                !currentTrackLang ||
                Boolean(currentTranslationLang && currentTranslationLang !== bestLang) ||
                currentTrackLang !== bestLang;

              if (isWrongTrack) {
                // Find the exact runtime track object from movie_player's tracklist so setOption is 100% honored
                const runtimeTracks = player.getOption?.('captions', 'tracklist');
                let targetTrackObj: any = null;
                if (Array.isArray(runtimeTracks) && runtimeTracks.length > 0) {
                  targetTrackObj =
                    runtimeTracks.find((rt: any) => normalizeCode(rt.languageCode) === bestLang && rt.kind !== 'asr') ||
                    runtimeTracks.find((rt: any) => normalizeCode(rt.languageCode) === bestLang) ||
                    runtimeTracks.find((rt: any) => rt.vss_id === bestTrack.vssId || rt.vssId === bestTrack.vssId);
                }
                if (!targetTrackObj) {
                  targetTrackObj = {
                    languageCode: bestTrack.languageCode,
                    vssId: bestTrack.vssId,
                    vss_id: bestTrack.vssId,
                    kind: bestTrack.kind || '',
                  };
                }
                player.setOption('captions', 'track', targetTrackObj);
                if (typeof player.setOption === 'function') {
                  try { player.setOption('captions', 'reload', true); } catch (_) {}
                }
              }
            } catch (_) {}
          };

          applyBestTrackToPlayer();
          setTimeout(applyBestTrackToPlayer, 250);
          setTimeout(applyBestTrackToPlayer, 700);
        }

        // Hook player state/API changes once so if YouTube asynchronously restores a sticky 'ar' track on play, we immediately override it
        if (player && attachedPlayer !== player && typeof player.addEventListener === 'function') {
          attachedPlayer = player;
          try {
            player.addEventListener('onApiChange', () => {
              setTimeout(() => bridgePlayerCaptionTracks(false, lastPreferredLang), 80);
            });
            player.addEventListener('onStateChange', (state: number) => {
              if (state === 1) {
                setTimeout(() => bridgePlayerCaptionTracks(false, lastPreferredLang), 100);
              }
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // 4. Listen for requests from isolated content script
  window.addEventListener('LECTURA_REQUEST_CAPTIONS', (ev: any) => {
    const forceCC = ev?.detail?.forceEnableCC;
    const preferredLang = ev?.detail?.preferredLang;
    bridgePlayerCaptionTracks(forceCC, preferredLang);
  });

  // 5. Poll for player tracks during SPA navigations and initial load
  function schedulePolls() {
    [100, 350, 800, 1600, 3000].forEach((ms) => {
      setTimeout(() => bridgePlayerCaptionTracks(false, lastPreferredLang), ms);
    });
  }

  window.addEventListener('yt-navigate-finish', () => {
    schedulePolls();
  });

  schedulePolls();
})();
