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
import { startBackupScheduler } from "./server/backupService.ts";
import { APP_VERSION } from "./src/version.ts";

// Lectura Server Entry v2.99.90
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

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));
  app.use(express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }));

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
        if (filePath.endsWith("index.html")) {
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

startServer();
