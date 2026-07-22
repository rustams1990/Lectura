import { Router } from "express";
import { Modality } from "@google/genai";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getGeminiClient } from "./geminiClient.ts";

const router = Router();

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AUDIO_CACHE_DIR = path.join(DATA_DIR, "audio_cache");
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

function getCacheFilename(text: string, lang: string): string {
  const hash = crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
  return `google_${lang}_${hash}.mp3`;
}

// ============================================================
// Rate Limiter — 15 запросов в минуту с одного IP
// ============================================================

export const ttsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Слишком много запросов к TTS. Пожалуйста, подождите минуту.",
    retryAfter: 60
  },
  keyGenerator: (req) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown",
});

// ============================================================
// TTS Routes
// ============================================================

// 1. AI Audio Generator (Gemini TTS)
router.post("/generate-tts", ttsRateLimit, async (req, res) => {
  const { text, language } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({
      error: "Gemini API key is missing. AI TTS requires the GEMINI_API_KEY secret configured in AI Studio Settings.",
      isDemo: true
    });
  }

  try {
    const speechText = `Convert the following text into speech. Do not translate, do not answer, do not add any commentary. Output only the spoken audio of the text.
Language: ${language || "appropriate language"}
Text: ${text}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: speechText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Warm narration voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio chunk was returned from the model");
    }

    return res.json({ audioBase64: base64Audio });
  } catch (err: any) {
    console.error("Gemini TTS audio generation error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate AI audio narration" });
  }
});

// 2. Google Translate TTS Proxy (keyless, disk cached)
router.get("/google-tts", async (req, res) => {
  const text = req.query.text as string;
  const lang = (req.query.lang as string) || "en";
  const speed = parseFloat((req.query.speed as string) || "1.0");

  if (!text) {
    return res.status(400).json({ error: "text query param is required" });
  }

  try {
    // Clamp speed: Google Translate TTS accepts 0.24 – 1.0
    const clampedSpeed = Math.min(1.0, Math.max(0.24, speed));
    const ttsspeed = clampedSpeed < 1.0 ? String(clampedSpeed) : "1";

    const cacheFilename = getCacheFilename(text, lang);
    const cacheFilePath = path.join(AUDIO_CACHE_DIR, cacheFilename);

    // If already saved on disk, serve it directly offline
    if (fs.existsSync(cacheFilePath)) {
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "public, max-age=31536000"); // cache 1 year in client browser
      return res.sendFile(cacheFilePath);
    }

    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("tl", lang);
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("q", text.slice(0, 200)); // Google limits ~200 chars
    if (ttsspeed !== "1") url.searchParams.set("ttsspeed", ttsspeed);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Google TTS returned ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to disk cache in the project directory
    await fs.promises.writeFile(cacheFilePath, buffer);

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000"); // cache 1 year
    return res.send(buffer);
  } catch (err: any) {
    console.error("Google Translate TTS proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy Google TTS" });
  }
});

// Helper to generate fallback URLs for Docker environment
function getCandidateUrls(inputUrl: string): string[] {
  const clean = inputUrl.trim();
  const urls = [clean];
  if (clean.includes("localhost") || clean.includes("127.0.0.1")) {
    urls.push(clean.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"));
    urls.push(clean.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"));
  }
  return Array.from(new Set(urls));
}

// 3. Local Kokoro-82M / Piper TTS Proxy (disk cached)
router.post("/local-tts", ttsRateLimit, async (req, res) => {
  const { text, voice, language, speed, localTtsUrl } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  const cleanUrl = (localTtsUrl || "http://localhost:8880/v1/audio/speech").trim();
  let cleanVoice = (voice || "").trim();
  const cleanSpeed = typeof speed === "number" ? speed : 1.0;
  const langLower = (language || "").toLowerCase().trim();

  // Auto-switch English default voice to native language voice if processing non-English text
  if (!cleanVoice || cleanVoice === "af_sarah" || cleanVoice === "am_adam") {
    if (langLower.includes("span") || langLower.includes("españ") || langLower.startsWith("es")) cleanVoice = "ef_dora";
    else if (langLower.includes("fren") || langLower.includes("fran") || langLower.startsWith("fr")) cleanVoice = "ff_siwis";
    else if (langLower.includes("ital") || langLower.startsWith("it")) cleanVoice = "it_sara";
    else if (langLower.includes("germ") || langLower.includes("deut") || langLower.startsWith("de")) cleanVoice = "de_de";
    else if (langLower.includes("japa") || langLower.startsWith("ja")) cleanVoice = "jf_alpha";
    else if (langLower.includes("chin") || langLower.startsWith("zh")) cleanVoice = "zf_xiaobei";
    else if (langLower.includes("port") || langLower.startsWith("pt")) cleanVoice = "pf_dora";
    else if (langLower.includes("russ") || langLower.startsWith("ru")) cleanVoice = "ru_dmitri";
    else if (!cleanVoice) cleanVoice = "af_sarah";
  }

  const textHash = crypto.createHash("md5").update(`${cleanVoice}_${text.toLowerCase().trim()}`).digest("hex");
  const cacheFilename = `local_${cleanVoice}_${textHash}.mp3`;
  const cacheFilePath = path.join(AUDIO_CACHE_DIR, cacheFilename);

  // Return cached audio if available
  if (fs.existsSync(cacheFilePath)) {
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=31536000");
    return res.sendFile(cacheFilePath);
  }

  const candidateUrls = getCandidateUrls(cleanUrl);
  let lastError: any = null;

  for (const urlToTry of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 sec timeout per candidate

    try {
      const bodyPayload = {
        model: "kokoro",
        input: text,
        voice: cleanVoice,
        response_format: "mp3",
        speed: cleanSpeed
      };

      const response = await fetch(urlToTry, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Сервер TTS (${urlToTry}) вернул статус ${response.status}: ${errorText || response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "audio/mpeg";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Save to disk cache
      await fs.promises.writeFile(cacheFilePath, buffer);

      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=31536000");
      return res.send(buffer);
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === 'AbortError') {
        continue;
      }
      if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
        // Try next candidate URL (e.g. host.docker.internal or 172.17.0.1)
        continue;
      }
      // If it's another non-network error, stop trying
      break;
    }
  }

  console.error("Local TTS proxy error:", lastError);
  if (lastError?.name === 'AbortError') {
    return res.status(504).json({ error: "Запрос к локальному серверу TTS превысил лимит времени (15 секунд)." });
  }
  if (lastError?.code === 'ECONNREFUSED' || lastError?.message?.includes('fetch failed') || lastError?.message?.includes('ECONNREFUSED')) {
    return res.status(503).json({
      error: `Локальный TTS сервер недоступен по адресу ${cleanUrl}. Убедитесь, что контейнер Kokoro или Piper запущен на вашем сервере (порт 8880 или 5000).`
    });
  }
  return res.status(500).json({ error: lastError?.message || "Ошибка генерации речи через локальный TTS" });
});

export default router;
