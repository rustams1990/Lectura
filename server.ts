import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

import aiRouter from "./routes/ai.ts";
import ttsRouter from "./routes/tts.ts";
import youtubeRouter from "./routes/youtube.ts";
import authRouter, { resolveUserId } from "./routes/auth.ts";
import dbRouter from "./routes/db.ts";
import mediaRouter from "./routes/media.ts";
import whisperRouter from "./routes/whisper.ts";
import wordnetRouter from "./routes/wordnet.ts";
import { frequencyRouter } from "./routes/frequency.ts";
import backupRouter from "./routes/backup.ts";
import podcastsRouter from "./routes/podcasts.ts";
import translateRouter from "./routes/translate.ts";
import historyRouter from "./routes/history.ts";
import lessonsRouter from "./routes/lessons.ts";
import { startBackupScheduler } from "./server/backupService.ts";
import { processVideoFile, switchVideoAudioTrack } from "./server/videoProcessor.ts";
import { handleHlsPlaylist, handleHlsSegment } from "./server/hlsStreamer.ts";
import { APP_VERSION } from "./src/version.ts";

// Lectura Server Entry v1.0.1
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  const DATA_DIR = process.env.DATA_DIR || process.cwd();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // ============================================================
  // Security & HTTP Headers Middleware
  // ============================================================
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Range, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Streaming video upload endpoint (streams directly to disk with zero RAM buffering for large video files)
  app.post("/api/media/upload-video", (req, res) => {
    try {
      const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
      if (!fs.existsSync(VIDEO_STORAGE_DIR)) {
        fs.mkdirSync(VIDEO_STORAGE_DIR, { recursive: true });
      }
      const rawFilename = req.headers["x-filename"] ? decodeURIComponent(String(req.headers["x-filename"])) : `video_${Date.now()}.mp4`;
      const cleanBasename = path.basename(rawFilename).replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueFilename = `${Date.now()}_${cleanBasename}`;
      const targetFilePath = path.join(VIDEO_STORAGE_DIR, uniqueFilename);
      const writeStream = fs.createWriteStream(targetFilePath);

      req.pipe(writeStream);

      writeStream.on("finish", async () => {
        if (!fs.existsSync(targetFilePath)) {
          return res.status(500).json({ error: "Failed to save video file" });
        }
        try {
          const targetLang = req.headers["x-target-language"] ? String(req.headers["x-target-language"]) : undefined;
          const result = await processVideoFile(targetFilePath, uniqueFilename, targetLang);
          return res.json({
            success: true,
            url: result.finalUrl,
            filename: result.finalFilename,
            sizeBytes: result.sizeBytes,
            duration: result.duration,
            subtitleTracks: result.subtitleTracks,
            selectedSubtitle: result.selectedSubtitle,
            audioTracks: result.audioTracks,
            selectedAudio: result.selectedAudio,
            videoCodec: result.videoCodec,
            pixelFormat: result.pixelFormat,
            isBrowserCompatibleVideo: result.isBrowserCompatibleVideo,
            videoWarning: result.videoWarning,
            coverUrl: result.coverUrl,
          });
        } catch (procErr: any) {
          console.warn("[upload-video] Post-processing fallback:", procErr?.message);
          const stat = fs.statSync(targetFilePath);
          return res.json({
            success: true,
            url: `/api/media/stream/${uniqueFilename}`,
            filename: uniqueFilename,
            sizeBytes: stat.size,
            duration: 0,
            subtitleTracks: [],
            selectedSubtitle: null,
            audioTracks: [],
            selectedAudio: null,
            videoCodec: undefined,
            isBrowserCompatibleVideo: true,
            videoWarning: undefined,
          });
        }
      });

      writeStream.on("error", (err) => {
        console.error("[upload-video error]:", err);
        try { if (fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath); } catch (_) {}
        return res.status(500).json({ error: err.message || "File upload failed" });
      });
    } catch (err: any) {
      console.error("[upload-video exception]:", err);
      return res.status(500).json({ error: err.message || "Failed to initiate file upload" });
    }
  });

  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  app.use(express.raw({ type: ["audio/*", "application/octet-stream"], limit: "200mb" }));

  // On-demand HLS streaming endpoints (instant playback of MKV / HEVC / 10-bit)
  app.get("/api/media/hls/:filename/index.m3u8", handleHlsPlaylist);
  app.get("/api/media/hls/:filename/master.m3u8", handleHlsPlaylist);
  app.get("/api/media/hls/:filename/segment_:segIndex.ts", handleHlsSegment);

  // Switch audio track for a video
  app.post("/api/media/switch-audio", async (req, res) => {
    try {
      const { filename, audioIndex } = req.body;
      if (!filename || typeof audioIndex !== "number") {
        return res.status(400).json({ error: "Missing filename or audioIndex" });
      }
      const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
      const cleanFileName = path.basename(filename);
      const baseClean = cleanFileName.replace(/(_a\d+)?\.(mp4|mkv)$/i, "");
      const mkvCandidate = path.join(VIDEO_STORAGE_DIR, `${baseClean}.mkv`);
      const sourceFile = fs.existsSync(mkvCandidate) ? mkvCandidate : path.join(VIDEO_STORAGE_DIR, cleanFileName);

      if (!fs.existsSync(sourceFile)) {
        return res.status(404).json({ error: "Source video file not found" });
      }

      // If source is MKV, serve instantly via on-demand HLS with the new audioIndex (0 sec delay)
      if (sourceFile.endsWith(".mkv")) {
        const sourceBase = path.basename(sourceFile);
        return res.json({
          success: true,
          url: `/api/media/hls/${sourceBase}/index.m3u8?audioIndex=${audioIndex}`,
          filename: sourceBase,
        });
      }

      const targetMp4Name = `${baseClean}_a${audioIndex}.mp4`;
      const targetMp4Path = path.join(VIDEO_STORAGE_DIR, targetMp4Name);
      const h264Candidate = path.join(VIDEO_STORAGE_DIR, `${baseClean}.mp4`);

      if (!fs.existsSync(targetMp4Path) || fs.statSync(targetMp4Path).size < 1000) {
        await switchVideoAudioTrack(sourceFile, targetMp4Path, audioIndex, fs.existsSync(h264Candidate) ? h264Candidate : undefined);
      }

      return res.json({
        success: true,
        url: `/api/media/stream/${targetMp4Name}`,
        filename: targetMp4Name,
      });
    } catch (err: any) {
      console.error("[switch-audio error]:", err);
      return res.status(500).json({ error: err.message || "Failed to switch audio track" });
    }
  });

  app.post("/api/log", (req, res) => {
    console.log("BROWSER ERROR:", req.body);
    res.json({ok: true});
  });

  // Health check endpoint for monitoring & Docker
  app.get("/api/health", (req, res) => {
    let resolvedUser = "default";
    try {
      resolvedUser = resolveUserId(req);
    } catch (_) {}
    res.json({ status: "ok", version: APP_VERSION, uptime: process.uptime(), timestamp: Date.now(), userId: resolvedUser });
  });

  // Dynamic Service Worker endpoint: injects current APP_VERSION into CACHE_NAME
  // This forces all browsers (including Edge on tablet) to install a fresh SW and clear old caches on every update
  const swTemplatePath = path.join(process.cwd(), "public", "sw.js");
  app.get("/sw.js", (_req, res) => {
    try {
      if (process.env.NODE_ENV !== "production") {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.send(`
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});
`);
        return;
      }

      const swTemplate = fs.readFileSync(swTemplatePath, "utf8");
      const swContent = swTemplate.replace(/__CACHE_VERSION__/g, APP_VERSION);
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(swContent);
    } catch (e) {
      res.status(500).send("// sw.js template not found");
    }
  });

  // PWA Manifest: Always deliver fresh manifest with no-cache headers so browsers and devices never retain outdated names or icons
  const manifestFilePath = path.join(process.cwd(), "public", "manifest.json");
  app.get(["/manifest.json", "/manifest.webmanifest"], (_req, res) => {
    try {
      res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      if (fs.existsSync(manifestFilePath)) {
        res.sendFile(manifestFilePath);
      } else {
        res.status(404).json({ error: "Manifest not found" });
      }
    } catch (e) {
      res.status(500).json({ error: "Failed to serve manifest" });
    }
  });


  // Static Audio Storage & Streaming route (serves audio files directly from disk with HTTP 206 Range support)
  const AUDIO_STORAGE_DIR = path.join(DATA_DIR, "audio_files");
  if (!fs.existsSync(AUDIO_STORAGE_DIR)) {
    fs.mkdirSync(AUDIO_STORAGE_DIR, { recursive: true });
  }

  const serveAudioFile = (req: express.Request, res: express.Response) => {
    const rawFilename = path.basename(req.params.filename || "");
    let filePath = path.join(AUDIO_STORAGE_DIR, rawFilename);

    // If file doesn't exist directly (e.g. extension was omitted to bypass download managers), probe extensions
    if (!fs.existsSync(filePath)) {
      const candidates = [".mp3", ".m4a", ".aac", ".ogg", ".wav", ".webm"];
      for (const ext of candidates) {
        const testPath = path.join(AUDIO_STORAGE_DIR, `${rawFilename}${ext}`);
        if (fs.existsSync(testPath)) {
          filePath = testPath;
          break;
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();

    let mimeType = "audio/mpeg";
    if (ext === ".m4a" || ext === ".aac") mimeType = "audio/mp4";
    else if (ext === ".ogg") mimeType = "audio/ogg";
    else if (ext === ".wav") mimeType = "audio/wav";
    else if (ext === ".webm") mimeType = "audio/webm";

    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunksize,
        "Content-Type": mimeType,
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  };

  app.get("/api/audio-files/:filename", serveAudioFile);
  app.get("/api/audio-stream/:filename", serveAudioFile);

  // Periodic Garbage Collection sweep (every 3 minutes) if --expose-gc is enabled
  setInterval(() => {
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {}
    }
  }, 3 * 60 * 1000);

  // ============================================================
  // Express Routers
  // ============================================================
  app.use("/api", aiRouter);
  app.use("/api", ttsRouter);
  app.use("/api", youtubeRouter);
  app.use("/api", dbRouter);
  app.use("/api", mediaRouter);
  app.use("/api/whisper", whisperRouter);
  app.use("/api/wordnet", wordnetRouter);
  app.use("/api/frequency", frequencyRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", backupRouter);
  app.use("/api/podcasts", podcastsRouter);
  app.use("/api", translateRouter);
  app.use("/api", historyRouter);
  app.use("/api/lessons", lessonsRouter);

  // Start background automated backup scheduler
  startBackupScheduler();

  // ============================================================
  // Frontend Middleware (Vite Dev Server / Production Static Files)
  // ============================================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (
          filePath.endsWith("index.html") ||
          filePath.endsWith("manifest.json") ||
          filePath.endsWith("manifest.webmanifest") ||
          filePath.endsWith("sw.js")
        ) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("FATAL ERROR IN startServer:", err);
  process.exit(1);
});
