import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import util from "util";
import { Request, Response } from "express";

const execFilePromise = util.promisify(execFile);

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
const HLS_CACHE_DIR = path.join(DATA_DIR, "media", "hls_cache");

if (!fs.existsSync(HLS_CACHE_DIR)) {
  fs.mkdirSync(HLS_CACHE_DIR, { recursive: true });
}

export const SEGMENT_DURATION = 4; // 4 seconds per segment for fast seeking and low latency

// In-memory cache for durations and codecs to avoid repeated ffprobe calls
const metadataCache = new Map<string, { duration: number; isH264: boolean }>();

function formatSeekTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.padStart(6, "0")}`;
}

export async function getVideoMetadata(sourcePath: string): Promise<{ duration: number; isH264: boolean }> {
  const cached = metadataCache.get(sourcePath);
  if (cached) return cached;

  try {
    const { stdout } = await execFilePromise("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt",
      "-of", "json",
      sourcePath,
    ]);
    const data = JSON.parse(stdout || "{}");
    const duration = Math.round(parseFloat(data.format?.duration) || 0);
    const videoStream = (data.streams || []).find((s: any) => s.codec_type === "video");
    const vCodec = (videoStream?.codec_name || "").toLowerCase();
    const pixFmt = (videoStream?.pix_fmt || "").toLowerCase();
    const is10Bit = pixFmt.includes("10") || pixFmt.includes("12");
    const isH264 = (vCodec === "h264" || vCodec === "avc1") && !is10Bit;

    const meta = { duration, isH264 };
    metadataCache.set(sourcePath, meta);
    return meta;
  } catch (err: any) {
    console.warn("[HLS] ffprobe error:", err?.message);
    return { duration: 0, isH264: false };
  }
}

/**
 * Generates an on-demand HLS VOD playlist for any video file.
 */
export async function generateHlsPlaylist(
  filename: string,
  audioIndex: number = 0
): Promise<string | null> {
  const sourcePath = path.join(VIDEO_STORAGE_DIR, filename);
  if (!fs.existsSync(sourcePath)) return null;

  const { duration } = await getVideoMetadata(sourcePath);
  if (!duration || duration <= 0) return null;

  const totalSegments = Math.ceil(duration / SEGMENT_DURATION);

  let m3u8 = "#EXTM3U\n";
  m3u8 += "#EXT-X-VERSION:3\n";
  m3u8 += `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}\n`;
  m3u8 += "#EXT-X-MEDIA-SEQUENCE:0\n";
  m3u8 += "#EXT-X-PLAYLIST-TYPE:VOD\n";

  for (let i = 0; i < totalSegments; i++) {
    const segDur = i === totalSegments - 1 ? (duration - i * SEGMENT_DURATION).toFixed(3) : SEGMENT_DURATION.toFixed(3);
    m3u8 += "#EXT-X-DISCONTINUITY\n";
    m3u8 += `#EXTINF:${segDur},\n`;
    m3u8 += `segment_${i}.ts?audioIndex=${audioIndex}\n`;
  }

  m3u8 += "#EXT-X-ENDLIST\n";
  return m3u8;
}

// Set to prevent duplicate concurrent encoding of the same segment
const pendingJobs = new Map<string, Promise<string | null>>();

/**
 * Retrieves a segment from cache or encodes it on-demand in ~0.5-1.5s using FFmpeg.
 */
export async function getOrCreateSegment(
  filename: string,
  segIndex: number,
  audioIndex: number = 0
): Promise<string | null> {
  const sourcePath = path.join(VIDEO_STORAGE_DIR, filename);
  if (!fs.existsSync(sourcePath)) return null;

  const segCacheFolder = path.join(HLS_CACHE_DIR, filename, `a_${audioIndex}`);
  if (!fs.existsSync(segCacheFolder)) {
    fs.mkdirSync(segCacheFolder, { recursive: true });
  }

  const finalPath = path.join(segCacheFolder, `seg_${segIndex}.ts`);

  if (fs.existsSync(finalPath) && fs.statSync(finalPath).size > 500) {
    return finalPath;
  }

  const jobKey = `${filename}_${audioIndex}_${segIndex}`;
  if (pendingJobs.has(jobKey)) {
    return pendingJobs.get(jobKey)!;
  }

  const jobPromise = (async () => {
    try {
      const { duration, isH264 } = await getVideoMetadata(sourcePath);
      const startTime = segIndex * SEGMENT_DURATION;
      if (duration > 0 && startTime >= duration) {
        return null;
      }

      const startStr = formatSeekTime(startTime);
      const tmpPath = path.join(segCacheFolder, `tmp_${segIndex}_${Date.now()}.ts`);

      const videoArgs = isH264
        ? ["-c:v", "copy"]
        : [
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-pix_fmt", "yuv420p"
          ];

      const ffmpegArgs = [
        "-nostdin",
        "-y",
        "-loglevel", "error",
        "-ss", startStr,
        "-i", sourcePath,
        "-t", String(SEGMENT_DURATION),
        "-map", "0:v:0",
        "-map", `0:${audioIndex}?`,
        ...videoArgs,
        "-c:a", "aac",
        "-b:a", "192k",
        "-f", "mpegts",
        tmpPath
      ];

      await execFilePromise("ffmpeg", ffmpegArgs, { maxBuffer: 50 * 1024 * 1024 });

      if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 500) {
        fs.renameSync(tmpPath, finalPath);

        // Async prefetch next segment in background for bufferless playback
        const totalSegments = Math.ceil(duration / SEGMENT_DURATION);
        if (segIndex + 1 < totalSegments) {
          setTimeout(() => {
            getOrCreateSegment(filename, segIndex + 1, audioIndex).catch(() => {});
          }, 50);
        }

        return finalPath;
      }
    } catch (err: any) {
      console.warn(`[HLS] Failed to generate segment ${segIndex} for ${filename}:`, err?.message);
    } finally {
      pendingJobs.delete(jobKey);
    }
    return null;
  })();

  pendingJobs.set(jobKey, jobPromise);
  return jobPromise;
}

/**
 * Express handler for HLS playlist (index.m3u8)
 */
export async function handleHlsPlaylist(req: Request, res: Response) {
  try {
    const filename = path.basename(req.params.filename);
    const audioIndex = parseInt(req.query.audioIndex as string, 10) || 0;

    const m3u8 = await generateHlsPlaylist(filename, audioIndex);
    if (!m3u8) {
      return res.status(404).send("Media not found or unreadable");
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.send(m3u8);
  } catch (err: any) {
    console.error("[HLS Playlist error]:", err);
    return res.status(500).send("Internal Server Error");
  }
}

/**
 * Express handler for HLS video segment (segment_:segIndex.ts)
 */
export async function handleHlsSegment(req: Request, res: Response) {
  try {
    const filename = path.basename(req.params.filename);
    const segIndex = parseInt(req.params.segIndex, 10);
    const audioIndex = parseInt(req.query.audioIndex as string, 10) || 0;

    if (isNaN(segIndex) || segIndex < 0) {
      return res.status(400).send("Invalid segment index");
    }

    const segPath = await getOrCreateSegment(filename, segIndex, audioIndex);
    if (!segPath || !fs.existsSync(segPath)) {
      return res.status(404).send("Segment generation failed");
    }

    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const stream = fs.createReadStream(segPath);
    return stream.pipe(res);
  } catch (err: any) {
    console.error("[HLS Segment error]:", err);
    return res.status(500).send("Internal Server Error");
  }
}
