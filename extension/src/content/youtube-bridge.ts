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

  function notifyTimedText(lang: string | null, url: string, text: string | null) {
    try {
      if (lang) {
        window.dispatchEvent(new CustomEvent('LECTURA_TIMEDTEXT_LANG', { detail: { lang } }));
      }
      if (text && typeof text === 'string' && (text.includes('events') || text.includes('<transcript') || text.includes('timedtext'))) {
        window.dispatchEvent(new CustomEvent('LECTURA_TIMEDTEXT_DATA', { detail: { lang, url, text } }));
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
          const lang = parsed.searchParams.get('lang') || parsed.searchParams.get('tlang');
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
          const lang = parsed.searchParams.get('lang') || parsed.searchParams.get('tlang');
          this.addEventListener('load', function () {
            notifyTimedText(lang, urlStr, this.responseText);
          });
        } catch (_) {}
      }
      return (origOpen as any).apply(this, [method, url, ...rest]);
    };
  } catch (_) {}

  // 3. Inspect YouTube Player and bridge caption tracks
  function bridgePlayerCaptionTracks(forceEnableCC?: boolean) {
    try {
      const player = document.getElementById('movie_player') as any;
      const pResp = (player && typeof player.getPlayerResponse === 'function' && player.getPlayerResponse()) ||
                    (window as any).ytInitialPlayerResponse;

      const videoId = pResp?.videoDetails?.videoId || '';
      const tracks = pResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (Array.isArray(tracks) && tracks.length > 0) {
        window.dispatchEvent(
          new CustomEvent('LECTURA_CAPTION_TRACKS', {
            detail: {
              videoId,
              tracks: tracks.map((t: any) => ({
                baseUrl: t.baseUrl,
                languageCode: t.languageCode,
                vssId: t.vssId,
                name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
                kind: t.kind,
                isDefault: t.isDefault,
              })),
            },
          })
        );
      }

      if (forceEnableCC && player) {
        // Ensure caption module is loaded
        if (typeof player.loadModule === 'function') {
          try { player.loadModule('captions'); } catch (_) {}
        }
        // If CC button in DOM is off, click it
        const ccBtn = document.querySelector<HTMLElement>('.ytp-subtitles-button');
        if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
          ccBtn.click();
        } else if (typeof player.setOption === 'function' && Array.isArray(tracks) && tracks.length > 0) {
          try {
            player.setOption('captions', 'track', tracks[0]);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // 4. Listen for requests from isolated content script
  window.addEventListener('LECTURA_REQUEST_CAPTIONS', (ev: any) => {
    const forceCC = ev?.detail?.forceEnableCC;
    bridgePlayerCaptionTracks(forceCC);
  });

  // 5. Poll for player tracks during SPA navigations and initial load
  function schedulePolls() {
    [100, 350, 800, 1600, 3000].forEach((ms) => {
      setTimeout(() => bridgePlayerCaptionTracks(false), ms);
    });
  }

  window.addEventListener('yt-navigate-finish', () => {
    schedulePolls();
  });

  schedulePolls();
})();
