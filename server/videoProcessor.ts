import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import util from "util";
import { parseSubtitleFile } from "../src/utils/subtitleParser.ts";

const execFilePromise = util.promisify(execFile);

export interface SubtitleTrackInfo {
  index: number;
  language?: string;
  title?: string;
  codec?: string;
  text?: string;
  cueCount?: number;
  duration?: number;
  isForced?: boolean;
}

export interface AudioTrackInfo {
  index: number;
  language?: string;
  title?: string;
  codec?: string;
  channels?: number;
  isDefault?: boolean;
}

export interface VideoProcessingResult {
  finalFilename: string;
  finalUrl: string;
  sizeBytes: number;
  duration: number;
  subtitleTracks: SubtitleTrackInfo[];
  selectedSubtitle: SubtitleTrackInfo | null;
  audioTracks: AudioTrackInfo[];
  selectedAudio: AudioTrackInfo | null;
  videoCodec?: string;
  pixelFormat?: string;
  isBrowserCompatibleVideo?: boolean;
  videoWarning?: string;
  coverUrl?: string;
}

function formatLanguageName(code: string): string {
  const map: Record<string, string> = {
    spa: "Español",
    es: "Español",
    eng: "English",
    en: "English",
    rus: "Русский",
    ru: "Русский",
    fra: "Français",
    fre: "Français",
    fr: "Français",
    deu: "Deutsch",
    ger: "Deutsch",
    de: "Deutsch",
    ita: "Italiano",
    it: "Italiano",
    por: "Português",
    pt: "Português",
    jpn: "日本語",
    ja: "日本語",
    kor: "한국어",
    ko: "한국어",
    zho: "中文",
    chi: "中文",
    zh: "中文",
    ukr: "Українська",
    uk: "Українська",
    tur: "Türkçe",
    tr: "Türkçe",
    pol: "Polski",
    pl: "Polski",
  };
  return map[code.toLowerCase()] || code.toUpperCase();
}

function generateTrackDisplayTitle(
  type: "audio" | "subtitle",
  index: number,
  rawLang: string,
  rawTitle: string,
  extra?: string
): string {
  const langName = rawLang ? formatLanguageName(rawLang) : "";
  const prefix = rawLang ? `[${rawLang.toUpperCase()}]` : "";

  if (rawTitle && rawTitle.trim()) {
    const cleanTitle = rawTitle.trim();
    if (langName && cleanTitle.toLowerCase().includes(langName.toLowerCase())) {
      return `${prefix} ${cleanTitle}${extra ? ` (${extra})` : ""}`.trim();
    }
    return `${prefix} ${langName ? `${langName} - ` : ""}${cleanTitle}${extra ? ` (${extra})` : ""}`.trim();
  }

  const typeName = type === "audio" ? "Озвучка" : "Субтитры";
  return `${prefix} ${langName || `${typeName} #${index}`}${extra ? ` (${extra})` : ""}`.trim();
}

/**
 * Maps common 2-letter or standard language codes to 3-letter ISO 639-2 codes
 */
function matchesLanguage(trackLang: string | undefined, targetLang: string | undefined): boolean {
  if (!trackLang || !targetLang) return false;
  const tl = targetLang.toLowerCase().trim();
  const trk = trackLang.toLowerCase().trim();
  if (tl === trk) return true;

  const map: Record<string, string[]> = {
    es: ["spa", "es", "spanish", "español", "espanol", "latino", "castellano"],
    en: ["eng", "en", "english"],
    ru: ["rus", "ru", "russian"],
    fr: ["fra", "fre", "fr", "french"],
    de: ["deu", "ger", "de", "german"],
    it: ["ita", "it", "italian"],
    pt: ["por", "pt", "portuguese"],
    ja: ["jpn", "ja", "japanese"],
    ko: ["kor", "ko", "korean"],
    zh: ["zho", "chi", "zh", "chinese"],
    tr: ["tur", "tr", "turkish"],
    uk: ["ukr", "uk", "ukrainian"],
    pl: ["pol", "pl", "polish"],
  };

  const aliases = map[tl] || [tl];
  return aliases.some(a => trk.includes(a) || a.includes(trk));
}

/**
 * Inspects a video file, extracts all embedded subtitle tracks, detects audio tracks,
 * and remuxes MKV to MP4 for seamless HTML5 video browser streaming.
 */
export async function processVideoFile(
  filePath: string,
  filename: string,
  targetLanguage?: string
): Promise<VideoProcessingResult> {
  const ext = path.extname(filename).toLowerCase();
  let durationSec = 0;
  const subtitleTracks: SubtitleTrackInfo[] = [];
  const audioTracks: AudioTrackInfo[] = [];
  let vCodec = "";
  let pixFmt = "";
  let isBrowserCompatibleVideo = true;
  let videoWarning: string | undefined;

  try {
    // 1. Inspect streams with ffprobe
    const probeResult = await execFilePromise("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=index,codec_type,codec_name,pix_fmt,channels:stream_tags=language,title:stream_disposition=default,forced",
      "-of", "json",
      filePath
    ]);

    const probeData = JSON.parse(probeResult.stdout || "{}");
    durationSec = Math.round(parseFloat(probeData.format?.duration) || 0);
    const streams: any[] = probeData.streams || [];

    // Inspect video stream for browser compatibility
    const videoStream = streams.find((s: any) => s.codec_type === "video");
    vCodec = (videoStream?.codec_name || "").toLowerCase();
    pixFmt = (videoStream?.pix_fmt || "").toLowerCase();
    const is10Bit = pixFmt.includes("10") || pixFmt.includes("12");
    const isHevc = vCodec === "hevc" || vCodec === "h265";
    isBrowserCompatibleVideo = vCodec === "h264" && !is10Bit;

    if (isHevc || is10Bit) {
      videoWarning = `Файл закодирован в ${isHevc ? "x265 / HEVC" : vCodec}${is10Bit ? " (10-bit)" : ""}. Браузеры на ПК (Chrome/Edge) без аппаратного декодера могут показывать черный экран. Для идеального воспроизведения рекомендуется видео с кодеком H.264 (x264).`;
    }

    // 2. Locate all audio tracks
    const audioStreams = streams.filter((s: any) => s.codec_type === "audio");
    for (const a of audioStreams) {
      const rawLang = a.tags?.language || "";
      const rawTitle = a.tags?.title || "";
      const isDefault = a.disposition?.default === 1;
      const displayTitle = generateTrackDisplayTitle("audio", a.index, rawLang, rawTitle);

      audioTracks.push({
        index: a.index,
        language: rawLang,
        title: displayTitle,
        codec: a.codec_name,
        channels: a.channels,
        isDefault,
      });
    }

    // 3. Locate all subtitle tracks
    const subStreams = streams.filter((s: any) => s.codec_type === "subtitle");

    for (const s of subStreams) {
      const rawLang = s.tags?.language || "";
      const rawTitle = s.tags?.title || "";
      const isForced = s.disposition?.forced === 1;
      const extra = isForced ? "Только надписи / Forced" : "";
      const displayTitle = generateTrackDisplayTitle("subtitle", s.index, rawLang, rawTitle, extra);

      const trackInfo: SubtitleTrackInfo = {
        index: s.index,
        language: rawLang,
        title: displayTitle,
        codec: s.codec_name,
        isForced,
      };

      // Extract this subtitle stream using ffmpeg to SRT
      try {
        const subExtract = await execFilePromise("ffmpeg", [
          "-nostdin",
          "-y",
          "-loglevel", "error",
          "-i", filePath,
          "-map", `0:${s.index}`,
          "-f", "srt",
          "-"
        ], { maxBuffer: 20 * 1024 * 1024 });

        if (subExtract.stdout && subExtract.stdout.trim().length > 0) {
          const parsed = parseSubtitleFile(subExtract.stdout);
          if (parsed.cueCount > 0) {
            trackInfo.text = parsed.text;
            trackInfo.cueCount = parsed.cueCount;
            trackInfo.duration = parsed.duration;
            if (durationSec === 0 && parsed.duration > 0) {
              durationSec = parsed.duration;
            }
          }
        }
      } catch (subErr: any) {
        console.warn(`[VideoProcessor] Warning: failed to extract subtitle stream ${s.index}:`, subErr?.message);
      }

      if (trackInfo.text) {
        subtitleTracks.push(trackInfo);
      }
    }
  } catch (probeErr: any) {
    console.warn("[VideoProcessor] ffprobe inspection warning:", probeErr?.message);
  }

  // 4. Auto-select best matching subtitle track (skip forced if full subtitles available)
  let selectedTrack: SubtitleTrackInfo | null = null;
  if (subtitleTracks.length > 0) {
    const fullTracks = subtitleTracks.filter(t => !t.isForced);
    const candidateTracks = fullTracks.length > 0 ? fullTracks : subtitleTracks;

    if (targetLanguage) {
      selectedTrack = candidateTracks.find(t => matchesLanguage(t.language, targetLanguage) || (t.title && matchesLanguage(t.title, targetLanguage))) || null;
    }
    if (!selectedTrack) {
      selectedTrack = candidateTracks[0];
    }
  }

  // 5. Auto-select best matching audio track
  let selectedAudio: AudioTrackInfo | null = null;
  if (audioTracks.length > 0) {
    if (targetLanguage) {
      selectedAudio = audioTracks.find(a => matchesLanguage(a.language, targetLanguage) || (a.title && matchesLanguage(a.title, targetLanguage))) || null;
    }
    if (!selectedAudio) {
      selectedAudio = audioTracks.find(a => a.isDefault) || audioTracks[0];
    }
  }

  // 6. Instant Delivery:
  // If native MP4 with standard H.264 8-bit, stream directly via HTML5 video.
  // For MKV, HEVC, 10-bit or container with alternate audio: serve via On-Demand HLS Streaming (/api/media/hls/)
  // This completely eliminates the 20-minute transcoding wait: file is ready in 1-2 seconds!
  const is10Bit = pixFmt.includes("10") || pixFmt.includes("12");
  const isHevc = vCodec === "hevc" || vCodec === "h265";
  const isDirectMp4Compatible = ext === ".mp4" && (vCodec === "h264" || vCodec === "avc1") && !is10Bit;

  const defaultAudioIdx = selectedAudio ? selectedAudio.index : 0;
  const finalFilename = filename;
  const finalPath = filePath;

  const finalUrl = isDirectMp4Compatible
    ? `/api/media/stream/${finalFilename}`
    : `/api/media/hls/${finalFilename}/index.m3u8?audioIndex=${defaultAudioIdx}`;

  const stat = fs.statSync(finalPath);
  const coverUrl = await extractVideoCoverBase64(finalPath, durationSec);

  return {
    finalFilename,
    finalUrl,
    sizeBytes: stat.size,
    duration: durationSec,
    subtitleTracks,
    selectedSubtitle: selectedTrack,
    audioTracks,
    selectedAudio,
    videoCodec: vCodec,
    pixelFormat: pixFmt,
    isBrowserCompatibleVideo: true, // 100% playable via HLS on all browsers
    videoWarning: undefined,
    coverUrl: coverUrl || undefined,
  };
}

/**
 * Extracts a representative frame from the video as base64 JPEG (scale 640px wide, ~30-50KB)
 */
export async function extractVideoCoverBase64(videoFilePath: string, durationSec: number): Promise<string | null> {
  const seekSec = durationSec > 20 ? Math.min(15, Math.floor(durationSec * 0.05)) : 2;
  const seekStr = `${Math.floor(seekSec / 60).toString().padStart(2, "0")}:${(seekSec % 60).toString().padStart(2, "0")}`;
  try {
    const { stdout } = await execFilePromise("ffmpeg", [
      "-nostdin",
      "-y",
      "-ss", seekStr,
      "-i", videoFilePath,
      "-vframes", "1",
      "-vf", "scale=640:-1",
      "-q:v", "3",
      "-f", "image2",
      "-"
    ], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });

    if (stdout && stdout.length > 500) {
      return `data:image/jpeg;base64,${stdout.toString("base64")}`;
    }
  } catch (err: any) {
    console.warn("[VideoProcessor] Could not extract cover frame:", err?.message);
  }
  return null;
}

/**
 * Fast remux to switch audio track on an existing video.
 * If h264VideoSourcePath is provided, copies video stream from it in 1 second without re-encoding!
 */
export async function switchVideoAudioTrack(
  sourceMkvPath: string,
  outputMp4Path: string,
  audioIndex: number,
  h264VideoSourcePath?: string
): Promise<boolean> {
  const ffmpegArgs: string[] = ["-nostdin", "-y", "-loglevel", "error"];

  if (h264VideoSourcePath && fs.existsSync(h264VideoSourcePath) && fs.statSync(h264VideoSourcePath).size > 1000) {
    // Ultra-fast 1-2 second mux: copy video from existing H.264 MP4, copy audio from MKV!
    ffmpegArgs.push(
      "-i", h264VideoSourcePath,
      "-i", sourceMkvPath,
      "-map", "0:v:0",
      "-map", `1:${audioIndex}`,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-sn",
      outputMp4Path
    );
  } else {
    // Transcode video to H.264
    ffmpegArgs.push(
      "-i", sourceMkvPath,
      "-map", "0:v:0",
      "-map", `0:${audioIndex}`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-sn",
      outputMp4Path
    );
  }
  await execFilePromise("ffmpeg", ffmpegArgs, { maxBuffer: 50 * 1024 * 1024 });
  return fs.existsSync(outputMp4Path) && fs.statSync(outputMp4Path).size > 1000;
}
