import { Router, Request, Response } from "express";
import os from "os";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import ytdlp from "yt-dlp-exec";
import { resolvePythonExecutable } from "../server/whisper/python_resolver.ts";
import { getDbConnection } from "./dbConnection.ts";

const router = Router();

const uploadDir = path.join(os.tmpdir(), "lectura_whisper_uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export interface WhisperQueueItem {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  filePath?: string;
  sourceType: "youtube" | "file";
  model: string;
  language?: string;
  threads?: number;
  vad?: boolean;
  thumbnail?: string;
  status: "queued" | "downloading_model" | "extracting_audio" | "transcribing" | "completed" | "error" | "cancelled";
  progress: number;
  currentTime: number;
  totalDuration: number;
  etaSeconds: number;
  stageText: string;
  createdBookId?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

// Queue State
const queue: WhisperQueueItem[] = [];
let activeItem: WhisperQueueItem | null = null;
let currentChildProcess: ChildProcess | null = null;

// Telemetry & Lifecycle State
let lastActiveTimestamp = Date.now();
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let loadedModelName: string | null = null;

// SSE Subscribers
const sseClients: Response[] = [];

function broadcastSse(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch (_) {
      sseClients.splice(i, 1);
    }
  }
}

/**
 * Formats faster-whisper segments into clean Lectura paragraph format:
 * "0:00 First sentence. Second sentence.\n\n0:15 Next paragraph."
 */
export function formatWhisperToLecturaParagraphs(segments: any[]): string {
  if (!segments || segments.length === 0) return "";

  const paragraphs: string[] = [];
  let currentTimestamp = "";
  let currentBuffer: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = (seg.text || "").trim();
    if (!text) continue;

    const startSec = Math.floor(seg.start || 0);
    const mins = Math.floor(startSec / 60);
    const secs = Math.floor(startSec % 60);
    const tsStr = `${mins}:${secs.toString().padStart(2, "0")}`;

    if (!currentTimestamp) {
      currentTimestamp = tsStr;
    }

    currentBuffer.push(text);

    // Group sentences into paragraphs of ~3-4 sentences or when pause/time gap is large
    const nextSeg = segments[i + 1];
    const isBigGap = nextSeg && (nextSeg.start - seg.end > 2.5);
    const isBufferFull = currentBuffer.length >= 3;

    if (isBufferFull || isBigGap || i === segments.length - 1) {
      paragraphs.push(`${currentTimestamp} ${currentBuffer.join(" ")}`);
      currentBuffer = [];
      currentTimestamp = "";
    }
  }

  return paragraphs.join("\n\n");
}

/**
 * Background worker processing the sequential queue (Concurrency = 1)
 */
async function processQueue() {
  if (activeItem || queue.length === 0) return;

  activeItem = queue.shift()!;
  activeItem.status = "extracting_audio";
  activeItem.startedAt = Date.now();
  activeItem.stageText = "Preparing media...";
  lastActiveTimestamp = Date.now();
  broadcastSse("queue_update", { queue, activeItem });

  let tempAudioPath: string | null = null;

  try {
    // Step 1: Prepare audio file & metadata
    if (activeItem.sourceType === "youtube" && activeItem.sourceUrl) {
      activeItem.stageText = "Extracting audio from YouTube...";
      broadcastSse("queue_update", { queue, activeItem });

      // Fetch real video title & thumbnail if placeholder
      if (activeItem.title === "YouTube Video" || !activeItem.thumbnail) {
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(activeItem.sourceUrl)}&format=json`);
          if (oembedRes.ok) {
            const oembedData: any = await oembedRes.json();
            if (oembedData.title && activeItem.title === "YouTube Video") {
              activeItem.title = oembedData.title;
            }
            if (oembedData.thumbnail_url && !activeItem.thumbnail) {
              activeItem.thumbnail = oembedData.thumbnail_url;
            }
            broadcastSse("queue_update", { queue, activeItem });
          }
        } catch (_) {}
      }

      const outPattern = path.join(uploadDir, `yt_whisper_${activeItem.id}.%(ext)s`);
      await (ytdlp as any)(activeItem.sourceUrl, {
        // Prefer lightweight audio-only formats: m4a → opus → webm → any audio
        format: "ba[ext=m4a]/ba[ext=opus]/ba[ext=webm]/bestaudio/best",
        output: outPattern,
        noCheckCertificate: true,
        preferFreeFormats: true,
        // Parallel fragment downloads for faster streaming
        concurrentFragments: 4,
        bufferSize: "16K",
        addHeader: [
          'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language:en-US,en;q=0.9'
        ],
        extractorArgs: 'youtube:player_client=android,web'
      });

      // Find the actual output file regardless of audio codec (.opus, .m4a, .webm, etc.)
      const files = fs.readdirSync(uploadDir);
      const matchingFile = files.find(f => f.startsWith(`yt_whisper_${activeItem.id}.`));
      if (!matchingFile) {
        throw new Error("Could not find extracted audio file from YouTube");
      }
      tempAudioPath = path.join(uploadDir, matchingFile);
    } else if (activeItem.filePath && fs.existsSync(activeItem.filePath)) {
      tempAudioPath = activeItem.filePath;
    } else {
      throw new Error("No valid media source provided");
    }

    // Step 2: Spawn Python Faster-Whisper Worker
    activeItem.status = "transcribing";
    activeItem.stageText = "Starting Faster-Whisper CPU...";
    broadcastSse("queue_update", { queue, activeItem });

    const pythonPath = resolvePythonExecutable();
    const workerScript = path.join(process.cwd(), "server", "whisper", "whisper_worker.py");
    const cacheDir = path.join(process.env.DATA_DIR || process.cwd(), "models", "whisper");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const workerArgs = [
      workerScript,
      tempAudioPath,
      "--model", activeItem.model || "base",
      "--threads", String(activeItem.threads || 2),
      "--cache-dir", cacheDir,
      activeItem.vad === false ? "--no-vad" : "--vad",
    ];

    if (activeItem.language && activeItem.language !== "auto") {
      workerArgs.push("--language", activeItem.language);
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonPath, workerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1"
        }
      });
      currentChildProcess = proc;

      let buffer = "";
      let stderrBuffer = "";
      let lastJsonError: string | null = null;

      proc.stdout.on("data", async (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === "download_start") {
              if (activeItem) {
                activeItem.status = "downloading_model";
                activeItem.stageText = event.message || "Downloading model weights...";
                broadcastSse("queue_update", { queue, activeItem });
              }
            } else if (event.type === "loaded") {
              loadedModelName = activeItem ? activeItem.model : null;
              if (activeItem) {
                activeItem.status = "transcribing";
                activeItem.stageText = `Model ${activeItem.model} loaded in RAM (${event.load_time_sec}s)`;
                broadcastSse("queue_update", { queue, activeItem });
              }
            } else if (event.type === "progress") {
              if (activeItem) {
                activeItem.status = "transcribing";
                activeItem.progress = event.percent || activeItem.progress;
                activeItem.currentTime = event.currentTime || activeItem.currentTime;
                activeItem.totalDuration = event.totalDuration || activeItem.totalDuration;
                activeItem.etaSeconds = event.etaSeconds || 0;
                activeItem.stageText = `Transcribing ${Math.round(activeItem.progress)}% • ETA ~${activeItem.etaSeconds}s`;
                broadcastSse("progress", activeItem);
              }
            } else if (event.type === "completed") {
              if (activeItem) {
                // Auto-persist into SQLite Lectura DB
                const bookId = await persistWhisperBook(activeItem, event);
                activeItem.createdBookId = bookId;
                activeItem.status = "completed";
                activeItem.progress = 100;
                activeItem.completedAt = Date.now();
                activeItem.stageText = "Transcription completed!";
                broadcastSse("task_completed", activeItem);
              }
            } else if (event.type === "error") {
              lastJsonError = event.message || "Whisper worker failed";
            }
          } catch (e: any) {
            console.error("[Whisper Worker Line Error]:", e.message, "Line was:", trimmed);
          }
        }
      });

      proc.stderr.on("data", (d) => {
        stderrBuffer += d.toString();
        console.warn("[Whisper Worker Stderr]:", d.toString());
      });

      proc.on("close", (code) => {
        currentChildProcess = null;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(lastJsonError || stderrBuffer.trim() || `Whisper worker exited with code ${code}`));
        }
      });

      proc.on("error", (err) => {
        currentChildProcess = null;
        reject(err);
      });
    });

  } catch (err: any) {
    if (activeItem) {
      if ((activeItem.status as string) !== "cancelled") {
        activeItem.status = "error";
      }
      activeItem.error = err.message || String(err);
      activeItem.stageText = `Failed: ${activeItem.error}`;
      broadcastSse("task_error", activeItem);
    }
  } finally {
    // Cleanup temporary audio file
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      try { fs.unlinkSync(tempAudioPath); } catch (_) {}
    }

    lastActiveTimestamp = Date.now();
    activeItem = null;
    broadcastSse("queue_update", { queue, activeItem });

    // Continue with next task in FIFO queue
    setTimeout(processQueue, 500);
  }
}

function extractYouTubeId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

function normalizeTargetLanguage(lang?: string): string {
  if (!lang) return "English";
  const lower = lang.toLowerCase().trim();
  if (lower === "en" || lower.startsWith("eng") || lower.startsWith("англ")) return "English";
  if (lower === "es" || lower.startsWith("spa") || lower.startsWith("исп")) return "Spanish";
  if (lower === "fr" || lower.startsWith("fre") || lower.startsWith("фран")) return "French";
  if (lower === "de" || lower.startsWith("ger") || lower.startsWith("нем")) return "German";
  if (lower === "it" || lower.startsWith("ita") || lower.startsWith("ита")) return "Italian";
  if (lower === "ru" || lower.startsWith("rus") || lower.startsWith("рус")) return "Russian";
  if (lower === "pt" || lower.startsWith("por") || lower.startsWith("порт")) return "Portuguese";
  if (lower === "zh" || lower.startsWith("chi") || lower.startsWith("кит")) return "Chinese";
  if (lower === "ja" || lower.startsWith("jap") || lower.startsWith("япон")) return "Japanese";
  if (lower === "ko" || lower.startsWith("kor") || lower.startsWith("корей")) return "Korean";
  if (lower === "ar" || lower.startsWith("ara") || lower.startsWith("араб")) return "Arabic";
  if (lower === "tr" || lower.startsWith("tur") || lower.startsWith("тур")) return "Turkish";
  if (lower === "uk" || lower.startsWith("ukr") || lower.startsWith("укр")) return "Ukrainian";
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

/**
 * Persists the transcribed book directly into the Lectura SQLite database
 */
async function persistWhisperBook(item: WhisperQueueItem, event: any): Promise<string> {
  const db = getDbConnection();
  const bookId = `lesson_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const formattedContent = formatWhisperToLecturaParagraphs(event.segments || []);
  const resolvedTargetLang = normalizeTargetLanguage(item.language && item.language !== "auto" ? item.language : event.language);
  const ytId = item.sourceType === "youtube" ? extractYouTubeId(item.sourceUrl) : null;
  const user = item.userId || "default";
  const now = Date.now();

  // Build best-quality thumbnail: prefer maxresdefault, fallback to hqdefault
  let coverUrl: string | null = null;
  if (item.thumbnail && item.thumbnail.startsWith("http")) {
    // Use oEmbed thumbnail but upgrade to maxresdefault if it's a YouTube thumb
    coverUrl = item.thumbnail.replace("/hqdefault.jpg", "/maxresdefault.jpg").replace("/mqdefault.jpg", "/maxresdefault.jpg");
  } else if (ytId) {
    coverUrl = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
  }

  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO lessons (
        id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation, createdAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    insertStmt.run(
      bookId,
      user,
      item.title || "Whisper Transcription",
      formattedContent || event.text || "",
      null, // audioUrl
      null, // audioBase64
      resolvedTargetLang,
      "Russian", // translationLanguage
      0, // isBuiltIn
      0, // isArchived
      coverUrl,
      ytId,
      null, // localVideoUrl
      item.sourceType === "youtube" ? "youtube" : "podcast",
      0, // pinned
      null, // translationText
      JSON.stringify({}), // detectedPhrases
      null, // difficulty
      null, // difficultyExplanation
      now  // createdAt — ensures Whisper books sort to the top as newest
    );

    console.log(`[Whisper] Successfully saved lesson '${item.title}' (ID: ${bookId}, Lang: ${resolvedTargetLang}, User: ${user}) to SQLite`);
  } catch (err: any) {
    console.error("[Whisper Auto-Persist DB Error]:", err);
  }

  return bookId;
}

// 1. SSE Events Endpoint
router.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  // Send initial queue state
  res.write(`event: init\ndata: ${JSON.stringify({ queue, activeItem })}\n\n`);

  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// 2. Queue Submission Endpoint (JSON supporting sourceUrl or fileBase64)
router.post("/queue", async (req: Request, res: Response) => {
  try {
    const { title, sourceUrl, fileBase64, filename, model, language, threads, vad, userId, thumbnail } = req.body;

    const isYoutube = !!sourceUrl && typeof sourceUrl === "string" && sourceUrl.includes("http");
    let localFilePath: string | undefined = undefined;

    if (fileBase64 && typeof fileBase64 === "string") {
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const ext = path.extname(filename || "audio.mp3") || ".mp3";
      const targetPath = path.join(uploadDir, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`);
      fs.writeFileSync(targetPath, buffer);
      localFilePath = targetPath;
    }

    const itemTitle = (title || "").trim() || (isYoutube ? "YouTube Video" : (filename || "Audio Lesson"));

    const newItem: WhisperQueueItem = {
      id: `whisper_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: userId || "default_user",
      title: itemTitle,
      sourceUrl: isYoutube ? sourceUrl : undefined,
      filePath: localFilePath,
      sourceType: isYoutube ? "youtube" : "file",
      model: model || "base",
      language: language || "auto",
      threads: threads ? parseInt(threads, 10) : 2,
      vad: vad === false || vad === "false" ? false : true,
      thumbnail: thumbnail || (isYoutube && sourceUrl ? `https://img.youtube.com/vi/${sourceUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || ""}/hqdefault.jpg` : ""),
      status: "queued",
      progress: 0,
      currentTime: 0,
      totalDuration: 0,
      etaSeconds: 0,
      stageText: `Queued (Position #${queue.length + (activeItem ? 1 : 0)})`,
      createdAt: Date.now(),
    };

    queue.push(newItem);
    broadcastSse("queue_update", { queue, activeItem });

    // Trigger sequential queue worker
    processQueue();

    res.json({ success: true, item: newItem, queuePosition: queue.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to enqueue transcription task" });
  }
});

// 3. Get Queue Status
router.get("/queue", (_req: Request, res: Response) => {
  res.json({ queue, activeItem });
});

// 4. Cancel Task
router.post("/cancel", (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Missing task id" });

  if (activeItem && activeItem.id === id) {
    activeItem.status = "cancelled";
    activeItem.stageText = "Cancelled by user";
    if (currentChildProcess) {
      try { currentChildProcess.kill(); } catch (_) {}
    }
    broadcastSse("queue_update", { queue, activeItem });
    return res.json({ success: true, message: "Active task cancelled" });
  }

  const idx = queue.findIndex(q => q.id === id);
  if (idx !== -1) {
    const removed = queue.splice(idx, 1)[0];
    broadcastSse("queue_update", { queue, activeItem });
    return res.json({ success: true, message: "Queued task removed", item: removed });
  }

  res.status(404).json({ error: "Task not found" });
});

// 5. Hardware Telemetry & Model Status
router.get("/telemetry", async (_req: Request, res: Response) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  // Model idle status calculation
  const isTranscribing = !!activeItem;
  const idleElapsedSec = Math.floor((Date.now() - lastActiveTimestamp) / 1000);
  const idleRemainingSec = isTranscribing ? 300 : Math.max(0, Math.floor((IDLE_TIMEOUT_MS - (Date.now() - lastActiveTimestamp)) / 1000));
  const isModelActiveInRam = isTranscribing || (idleRemainingSec > 0 && !!loadedModelName);

  res.json({
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || "CPU",
    },
    ram: {
      totalMb: Math.round(totalMem / (1024 * 1024)),
      usedMb: Math.round(usedMem / (1024 * 1024)),
      freeMb: Math.round(freeMem / (1024 * 1024)),
      percent: Math.round((usedMem / totalMem) * 100)
    },
    model: {
      status: isModelActiveInRam ? `ACTIVE IN RAM: ${(loadedModelName || "BASE").toUpperCase()}` : "DORMANT (0 MB)",
      isLoaded: isModelActiveInRam,
      currentModel: loadedModelName,
      idleRemainingSeconds: idleRemainingSec,
      idleTimeoutSeconds: 300
    }
  });
});

// 6. Check Model Cache on Disk
router.get("/models-status", async (_req: Request, res: Response) => {
  const cacheDir = path.join(process.env.DATA_DIR || process.cwd(), "models", "whisper");
  const models = ["tiny", "base", "small", "medium"];
  const pythonPath = resolvePythonExecutable();
  const workerScript = path.join(process.cwd(), "server", "whisper", "whisper_worker.py");

  const results: Record<string, { cached: boolean }> = {};

  await Promise.all(models.map(async (model) => {
    return new Promise<void>((resolve) => {
      const proc = spawn(pythonPath, [workerScript, "dummy", "--model", model, "--cache-dir", cacheDir, "--check-cached-only"], {
        stdio: ["ignore", "pipe", "ignore"]
      });

      let stdout = "";
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.on("close", () => {
        try {
          const parsed = JSON.parse(stdout.trim());
          results[model] = { cached: !!parsed.cached };
        } catch (_) {
          results[model] = { cached: false };
        }
        resolve();
      });
      proc.on("error", () => {
        results[model] = { cached: false };
        resolve();
      });
    });
  }));

  res.json({ models: results });
});

// 7. Manual Memory Release (Unload)
router.post("/unload", (_req: Request, res: Response) => {
  if (activeItem) {
    return res.status(400).json({ error: "Cannot release RAM while transcription is in progress" });
  }
  loadedModelName = null;
  lastActiveTimestamp = 0;
  broadcastSse("model_unloaded", { message: "Model unloaded from RAM" });
  res.json({ success: true, message: "Whisper model successfully unloaded and RAM freed." });
});

export default router;
