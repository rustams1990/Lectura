import Hls from "hls.js";

/**
 * Attaches a media URL (direct MP4 or on-demand HLS .m3u8) to an HTML5 video element.
 * Automatically selects Hls.js for Chrome/Firefox/Edge, or native playback for Safari.
 * Returns a cleanup teardown function.
 */
export function setupVideoMediaSource(
  videoEl: HTMLVideoElement | null,
  srcUrl: string | null | undefined,
  onLoadedMetadata?: () => void
): (() => void) | null {
  if (!videoEl || !srcUrl) return null;

  const isHls = srcUrl.includes(".m3u8") || srcUrl.includes("/api/media/hls/");

  // Native Safari HLS or standard direct MP4/WebM video
  if (!isHls || videoEl.canPlayType("application/vnd.apple.mpegurl")) {
    videoEl.src = srcUrl;
    if (onLoadedMetadata) {
      videoEl.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    }
    return () => {
      videoEl.src = "";
    };
  }

  // Use Hls.js for Chrome, Edge, Firefox, and Android
  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 60,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });

    hls.loadSource(srcUrl);
    hls.attachMedia(videoEl);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      onLoadedMetadata?.();
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn("[HLS] Network error, recovering...", data.details);
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.warn("[HLS] Media decode error, recovering...", data.details);
            hls.recoverMediaError();
            break;
          default:
            console.error("[HLS] Fatal error:", data.details);
            hls.destroy();
            break;
        }
      }
    });

    return () => {
      hls.destroy();
    };
  }

  // Generic fallback
  videoEl.src = srcUrl;
  return null;
}
