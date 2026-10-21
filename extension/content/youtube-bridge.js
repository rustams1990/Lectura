(() => {
  // extension/src/content/youtube-bridge.ts
  (function() {
    if (window.__LECTURA_YOUTUBE_BRIDGE_INSTALLED__) return;
    window.__LECTURA_YOUTUBE_BRIDGE_INSTALLED__ = true;
    console.log("\u26A1 [Lectura Bridge] YouTube MAIN world bridge initialized");
    function notifyTimedText(lang, url, text) {
      try {
        if (lang) {
          window.dispatchEvent(new CustomEvent("LECTURA_TIMEDTEXT_LANG", { detail: { lang } }));
        }
        if (text && typeof text === "string" && (text.includes("events") || text.includes("<transcript") || text.includes("timedtext"))) {
          window.dispatchEvent(new CustomEvent("LECTURA_TIMEDTEXT_DATA", { detail: { lang, url, text } }));
        }
      } catch (_) {
      }
    }
    try {
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
        const res = await origFetch.apply(this, args);
        if (url && typeof url === "string" && url.includes("/api/timedtext")) {
          try {
            const parsed = new URL(url, window.location.origin);
            const lang = parsed.searchParams.get("lang") || parsed.searchParams.get("tlang");
            const clone = res.clone();
            clone.text().then((text) => {
              notifyTimedText(lang, url, text);
            }).catch(() => notifyTimedText(lang, url, null));
          } catch (_) {
          }
        }
        return res;
      };
    } catch (_) {
    }
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        const urlStr = typeof url === "string" ? url : url ? url.toString() : "";
        if (urlStr && urlStr.includes("/api/timedtext")) {
          try {
            const parsed = new URL(urlStr, window.location.origin);
            const lang = parsed.searchParams.get("lang") || parsed.searchParams.get("tlang");
            this.addEventListener("load", function() {
              notifyTimedText(lang, urlStr, this.responseText);
            });
          } catch (_) {
          }
        }
        return origOpen.apply(this, [method, url, ...rest]);
      };
    } catch (_) {
    }
    function bridgePlayerCaptionTracks(forceEnableCC) {
      try {
        const player = document.getElementById("movie_player");
        const pResp = player && typeof player.getPlayerResponse === "function" && player.getPlayerResponse() || window.ytInitialPlayerResponse;
        const videoId = pResp?.videoDetails?.videoId || "";
        const tracks = pResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          window.dispatchEvent(
            new CustomEvent("LECTURA_CAPTION_TRACKS", {
              detail: {
                videoId,
                tracks: tracks.map((t) => ({
                  baseUrl: t.baseUrl,
                  languageCode: t.languageCode,
                  vssId: t.vssId,
                  name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
                  kind: t.kind,
                  isDefault: t.isDefault
                }))
              }
            })
          );
        }
        if (forceEnableCC && player) {
          if (typeof player.loadModule === "function") {
            try {
              player.loadModule("captions");
            } catch (_) {
            }
          }
          const ccBtn = document.querySelector(".ytp-subtitles-button");
          if (ccBtn && ccBtn.getAttribute("aria-pressed") === "false") {
            ccBtn.click();
          } else if (typeof player.setOption === "function" && Array.isArray(tracks) && tracks.length > 0) {
            try {
              player.setOption("captions", "track", tracks[0]);
            } catch (_) {
            }
          }
        }
      } catch (_) {
      }
    }
    window.addEventListener("LECTURA_REQUEST_CAPTIONS", (ev) => {
      const forceCC = ev?.detail?.forceEnableCC;
      bridgePlayerCaptionTracks(forceCC);
    });
    function schedulePolls() {
      [100, 350, 800, 1600, 3e3].forEach((ms) => {
        setTimeout(() => bridgePlayerCaptionTracks(false), ms);
      });
    }
    window.addEventListener("yt-navigate-finish", () => {
      schedulePolls();
    });
    schedulePolls();
  })();
})();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Lectura YouTube Bridge (Runs in MAIN world context)
 * Directly accesses YouTube player (movie_player), intercepts /api/timedtext requests,
 * and bridges caption tracks without CSP restrictions.
 */
