import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

import aiRouter from "./routes/ai.ts";
import ttsRouter from "./routes/tts.ts";
import youtubeRouter from "./routes/youtube.ts";
import authRouter from "./routes/auth.ts";
import dbRouter from "./routes/db.ts";
import mediaRouter from "./routes/media.ts";
import { APP_VERSION } from "./src/version.ts";

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
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));
  app.use(express.raw({ type: ["audio/*", "application/octet-stream"], limit: "100mb" }));

  app.post("/api/log", (req, res) => {
    console.log("BROWSER ERROR:", req.body);
    res.json({ok: true});
  });

  // Health check endpoint for monitoring & Docker
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: APP_VERSION, uptime: process.uptime(), timestamp: Date.now() });
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


  // Static Audio Storage route (serves audio files directly from disk to keep RAM usage minimal)
  const AUDIO_STORAGE_DIR = path.join(DATA_DIR, "audio_files");
  if (!fs.existsSync(AUDIO_STORAGE_DIR)) {
    fs.mkdirSync(AUDIO_STORAGE_DIR, { recursive: true });
  }

  app.get("/api/audio-files/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(AUDIO_STORAGE_DIR, filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "Audio file not found" });
    }
  });

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
  app.use("/api/auth", authRouter);

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
