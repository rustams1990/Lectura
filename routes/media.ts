import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { Type } from "@google/genai";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getGeminiClient, callLocalAi } from "./geminiClient.ts";
import { formatGeminiTranscript } from "./youtube.ts";
import { getYtDlp } from "./ytdlpWrapper.ts";
import { getDbConnection } from "./dbConnection.ts";
import { resolveUserId } from "./auth.ts";
import { parseEpub, BROWSER_HEADERS, fetchWebPage, cleanAndFormatArticle } from "./bookParsers.ts";
import { execFile } from "child_process";
import util from "util";
const execFilePromise = util.promisify(execFile);

export { fetchWebPage, cleanAndFormatArticle };

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const IMAGE_CACHE_DIR = path.join(DATA_DIR, "image_cache");
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
if (!fs.existsSync(VIDEO_STORAGE_DIR)) {
  fs.mkdirSync(VIDEO_STORAGE_DIR, { recursive: true });
}

const CLIPS_STORAGE_DIR = path.join(DATA_DIR, "media", "clips");
if (!fs.existsSync(CLIPS_STORAGE_DIR)) {
  fs.mkdirSync(CLIPS_STORAGE_DIR, { recursive: true });
}

// ============================================================
// Media & Parser Routes
// ============================================================

// 1. Image Proxy
router.get("/image-proxy", async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: "URL parameter 'url' is required" });
  }

  try {
    const hash = crypto.createHash("md5").update(imageUrl).digest("hex");
    
    const parsedUrl = new URL(imageUrl);
    const pathname = parsedUrl.pathname;
    let ext = path.extname(pathname) || ".jpg";
    if (!/^\.[a-zA-Z0-5]+$/.test(ext) || ext.length > 5) {
      ext = ".jpg";
    }
    
    const cacheFilename = `img_${hash}${ext}`;
    const cacheFilePath = path.join(IMAGE_CACHE_DIR, cacheFilename);

    if (fs.existsSync(cacheFilePath)) {
      res.set("Cache-Control", "public, max-age=31536000");
      return res.sendFile(cacheFilePath);
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Image fetch failed with status ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.promises.writeFile(cacheFilePath, buffer);

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000");
    return res.send(buffer);
  } catch (err: any) {
    console.error("Image proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy image" });
  }
});

// 2. Image Search Proxy (DuckDuckGo Scraper)
router.get("/image-search", async (req: Request, res: Response) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const htmlUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query as string)}`;
    const htmlResponse = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });

    if (!htmlResponse.ok) {
      throw new Error(`DuckDuckGo HTML query returned status ${htmlResponse.status}`);
    }

    const html = await htmlResponse.text();

    let vqd: string | null = null;
    const match1 = html.match(/vqd=([\d-]+)\&/);
    if (match1) {
      vqd = match1[1];
    }
    if (!vqd) {
      const match2 = html.match(/vqd\s*=\s*['"]([^'"]+)['"]/);
      if (match2) {
        vqd = match2[1];
      }
    }
    if (!vqd) {
      const match3 = html.match(/vqd="([\d-]+)"/);
      if (match3) {
        vqd = match3[1];
      }
    }

    if (!vqd) {
      throw new Error("Could not extract vqd token from DuckDuckGo response");
    }

    const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query as string)}&vqd=${vqd}&f=,,,;&p=1`;
    const apiResponse = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://duckduckgo.com/"
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`DuckDuckGo image API returned status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    let results = (data.results || []).slice(0, 16).map((item: any, idx: number) => {
      const imgUrl = item.image || item.thumbnail || "";
      const thumbUrl = item.thumbnail || item.image || "";
      return {
        id: `ddg_${idx}_${Date.now()}`,
        url: imgUrl,
        thumb: thumbUrl,
        image: imgUrl,
        thumbnail: thumbUrl,
        author: item.source || "DuckDuckGo",
        source: item.source || "DuckDuckGo",
        description: item.title || "",
        title: item.title || ""
      };
    });

    if (!results || results.length === 0) {
      results = await searchWikimedia(query as string);
    }

    return res.json({ results });
  } catch (err: any) {
    console.error("DuckDuckGo Image search error, trying Wikimedia fallback:", err);
    try {
      const wikiResults = await searchWikimedia(query as string);
      if (wikiResults.length > 0) {
        return res.json({ results: wikiResults });
      }
    } catch (wikiErr) {
      console.error("Wikimedia fallback error:", wikiErr);
    }
    return res.status(500).json({ error: err.message || "Failed to search images" });
  }
});

async function searchWikimedia(query: string) {
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=16&prop=imageinfo&iiprop=url|mime&format=json`;
    const resp = await fetch(wikiUrl, {
      headers: { "User-Agent": "LecturaApp/1.0 (https://lectura.app)" }
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const pages = json.query?.pages || {};
    return Object.values(pages).map((page: any, idx: number) => {
      const ii = page.imageinfo?.[0];
      const imgUrl = ii?.url || "";
      return {
        id: `wiki_${page.pageid || idx}`,
        url: imgUrl,
        thumb: imgUrl,
        image: imgUrl,
        thumbnail: imgUrl,
        author: "Wikimedia Commons",
        source: "Wikimedia Commons",
        description: page.title || query,
        title: page.title || query
      };
    }).filter((item: any) => item.url);
  } catch (err) {
    return [];
  }
}

// 3. Document Import (EPUB & PDF)
router.post("/import-file", async (req: Request, res: Response) => {
  const { fileBase64, filename, fileType, importImages } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: "File data base64 is required" });
  }

  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
  // Check length of base64 payload first
  const estimatedSize = Math.ceil((fileBase64.length * 3) / 4);
  if (estimatedSize > MAX_FILE_SIZE_BYTES + 1024) {
    return res.status(413).json({ error: "Размер файла превышает максимально допустимый лимит 50 МБ (Payload Too Large)" });
  }

  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ error: "Размер файла превышает максимально допустимый лимит 50 МБ (Payload Too Large)" });
  }

  const extension = filename ? filename.split(".").pop().toLowerCase() : "";

  try {
    if (fileType === "application/pdf" || extension === "pdf") {
      let pdfResult: any;
      try {
        pdfResult = await pdfParse(buffer);
      } catch (err) {
        console.error("PDF parsing failed:", err);
        throw err;
      }

      let text = typeof pdfResult === "string" ? pdfResult : (pdfResult?.text || "");

      text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");
      text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported PDF Document";
      return res.json({ title, text });
    } else if (
      fileType === "application/epub+zip" || 
      fileType === "application/epub" || 
      extension === "epub" ||
      fileType === "application/octet-stream" && extension === "epub"
    ) {
      const parsed = parseEpub(buffer, !!importImages);
      if (!parsed.text) {
        throw new Error("Extracted text is empty. EPUB might contain scanned pages or empty chapters.");
      }
      return res.json(parsed);
    } else {
      const textContent = buffer.toString("utf-8");
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported Document";
      return res.json({ title, text: textContent });
    }
  } catch (err: any) {
    console.error("Document parser error in /api/import-file:", err);
    return res.status(500).json({ error: "Не удалось импортировать файл: " + (err.message || err) });
  }
});

// ============================================================
// 4. Web Article Importer (URL)
// ============================================================
router.post("/import-url", async (req: Request, res: Response) => {
  const { url, aiProvider, localAiUrl, localAiModel } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const html = await fetchWebPage(url);

    // ── Extract og:image / twitter:image for cover ──────────
    let extractedCoverUrl = "";
    const ogImageMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogImageMatch) {
      try {
        extractedCoverUrl = new URL(ogImageMatch[1], url).href;
      } catch {
        extractedCoverUrl = ogImageMatch[1];
      }
    }

    // ── Podcast detection (unchanged) ────────────────────────
    const isPodcastUrl =
      url.toLowerCase().includes("podcasts.apple.com") ||
      url.toLowerCase().includes("podcast") ||
      html.includes("schema:episode") ||
      html.includes('"assetUrl"');

    if (isPodcastUrl) {
      console.log(`[Import URL] Podcast URL detected: ${url}`);

      // 1. Extract Title
      let podcastTitle = "Podcast Episode";
      const ogTitleMatch =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (ogTitleMatch) {
        podcastTitle = ogTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*-\s*Apple Podcasts.*$/i, "").trim();
      }

      // 2. Extract Direct MP3 Audio URL
      let directAudioUrl: string | null = null;
      const assetUrlMatch = html.match(/"assetUrl"\s*:\s*"(https?:\/\/[^"]+)"/i);
      if (assetUrlMatch) {
        directAudioUrl = assetUrlMatch[1];
      } else {
        const audioMatches = html.match(/https?:\/\/[^\s"']+\.(?:mp3|m4a|aac)[^\s"']*/gi);
        if (audioMatches && audioMatches.length > 0) {
          directAudioUrl = audioMatches[0];
        }
      }

      console.log(`[Import URL] Direct audio URL found: ${directAudioUrl}`);

      let audioBase64: string | null = null;
      let audioUrl: string | null = directAudioUrl;
      let transcriptText = "";

      if (directAudioUrl) {
        try {
          console.log(`[Import URL] Downloading audio stream from ${directAudioUrl}...`);
          const audioFetch = await fetch(directAudioUrl, {
            headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
          });

          if (audioFetch.ok) {
            const arrayBuf = await audioFetch.arrayBuffer();
            const buf = Buffer.from(arrayBuf);

            const DATA_DIR = process.env.DATA_DIR || process.cwd();
            const audioStorageDir = path.join(DATA_DIR, "audio_files");
            if (!fs.existsSync(audioStorageDir)) {
              fs.mkdirSync(audioStorageDir, { recursive: true });
            }

            const audioFileName = `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`;
            const diskPath = path.join(audioStorageDir, audioFileName);
            fs.writeFileSync(diskPath, buf);

            audioUrl = `/api/audio-files/${audioFileName}`;
            audioBase64 = null;

            const userApiKey = (req.headers["x-gemini-key"] as string) || req.body.geminiApiKey;
            const ai = getGeminiClient(userApiKey);
            if (ai && buf.length > 0) {
              console.log(`[Import URL] Running Gemini Speech-to-Text on ${buf.length} bytes of podcast audio...`);

              let uploadedFile: any = null;
              try {
                uploadedFile = await (ai.files as any).upload({
                  file: diskPath,
                  mimeType: "audio/mp3",
                });

                const prompt = `Listen carefully to this entire audio recording titled "${podcastTitle}".
Transcribe all spoken words accurately from the very beginning (0:00) ALL THE WAY TO THE VERY END of the audio file.
For EVERY single spoken sentence or dialogue phrase, provide the exact start timestamp in seconds or minutes (e.g. 0s\t..., 15s\t..., 1m15s\t..., 15m40s\t..., 25m10s\t...).
Do NOT stop early. Continue generating timestamped entries for the entire duration of the audio recording until the final closing words.

IMPORTANT: Output ONLY the line-by-line timestamped transcript entries. Do not provide titles, introductory explanations, translation notes, bracketed remarks, or markdown code blocks.`;

                const aiRes = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [
                    { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType || "audio/mp3" } },
                    prompt,
                  ],
                  config: { maxOutputTokens: 8192 },
                });

                if (aiRes.text) {
                  transcriptText = formatGeminiTranscript(aiRes.text);
                }
              } catch (tErr) {
                console.error("[Import URL] Podcast Gemini transcription error:", tErr);
              } finally {
                if (uploadedFile?.name) {
                  try { await ai.files.delete({ name: uploadedFile.name }); } catch (_) {}
                }
              }
            }
          }
        } catch (aErr) {
          console.error("[Import URL] Failed to fetch podcast MP3 stream:", aErr);
        }
      }

      if (!transcriptText.trim()) {
        const descMatch =
          html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        transcriptText = descMatch
          ? descMatch[1].trim()
          : "Подкаст импортирован. Нажмите 'Создать субтитры' для автоматического распознавания текста речи.";
      }

      return res.json({
        title: podcastTitle,
        text: transcriptText,
        lessonType: "podcast",
        coverUrl: extractedCoverUrl || null,
        audioUrl: audioUrl || directAudioUrl || null,
        audioBase64: null,
      });
    }

    // ── PRIMARY: cleanAndFormatArticle with Mozilla Readability ────────────
    let articleData: { title: string; text: string; byline?: string | null; excerpt?: string | null } | null = null;
    try {
      articleData = cleanAndFormatArticle(html, url);
    } catch (parseErr) {
      console.warn("[Import URL] cleanAndFormatArticle error:", parseErr);
    }

    if (articleData && articleData.text) {
      let text = articleData.text;

      // Normalize any image markers to standard [IMG:url] with guaranteed double newlines
      text = text.replace(/\[(?:\[LECTURA_)?IMG:(https?:\/\/[^\]]+)\]/gi, "\n\n[IMG:$1]\n\n");
      // Normalize any legacy caption markers to [CAPTION:text]
      text = text.replace(/^\[caption\]\s*(.+)$/gim, "[CAPTION:$1]");
      // Clean up multiple newlines that might have been created
      text = text.replace(/\n{3,}/g, "\n\n").trim();

      const wordCount = text
        .replace(/\[(?:\[LECTURA_)?IMG:[^\]]+\]/gi, "")
        .replace(/\[CAPTION:[^\]]+\]/gi, "")
        .replace(/\[caption\][^\n]*/gi, "")
        .split(/\s+/)
        .filter(Boolean).length;

      if (wordCount >= 30) {
        console.log(`[Import URL] Clean & Format OK — ${wordCount} words extracted from ${url}`);
        const imageMatches = text.match(/\[IMG:[^\]]+\]/g);
        console.log('🖼️ Found Images in imported text:', imageMatches);
        console.log('Saved Article Text Preview:', text.slice(0, 500));

        // Resolve cover: og:image → first inline image in text
        let coverUrl = extractedCoverUrl;
        if (!coverUrl) {
          const firstImg = text.match(/\[IMG:(https?:\/\/[^\]]+)\]/);
          if (firstImg) coverUrl = firstImg[1];
        }

        return res.json({
          title: articleData.title || "Web Article",
          text,
          coverUrl: coverUrl || null,
          byline: articleData.byline || null,
          excerpt: articleData.excerpt || null,
        });
      }

      console.warn(`[Import URL] Extracted only ${wordCount} words — trying AI fallback`);
    } else {
      console.warn(`[Import URL] cleanAndFormatArticle returned empty — trying AI fallback`);
    }

    // ── FALLBACK 1: Local AI ─────────────────────────────────
    if (aiProvider === "local") {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 45000)}
---

Return your answer strictly in JSON format with these exact keys:
- "title": creative/extracted title of the article
- "text": the cleaned text content (paragraphs separated by double newlines \\n\\n)

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
        const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
        return res.json({
          title: data.title || "Статья с сайта",
          text: data.text || "",
          coverUrl: extractedCoverUrl || null,
        });
      } catch (localErr: any) {
        console.warn("Local AI article parsing failed (falling back to Gemini):", localErr.message || localErr);
      }
    }

    // ── FALLBACK 2: Gemini AI ────────────────────────────────
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 60000)}
---

Output your result as a JSON object matching this schema:
{
  "title": "extracted article title",
  "text": "cleaned paragraph 1\\n\\ncleaned paragraph 2\\n\\n..."
}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ["title", "text"],
            },
          },
        });

        const parsed = JSON.parse(response.text || "{}");
        return res.json({
          title: parsed.title || "Статья с сайта",
          text: parsed.text || "",
          coverUrl: extractedCoverUrl || null,
        });
      } catch (geminiErr: any) {
        console.warn("Gemini AI article parsing failed (falling back to offline regex parser):", geminiErr.message || geminiErr);
      }
    }

    // ── FALLBACK 3: Offline regex parser ─────────────────────
    let title = "Статья с сайта";
    const titleMatch =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

    text = text
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return res.json({
      title,
      text: text.substring(0, 500000),
      coverUrl: extractedCoverUrl || null,
    });
  } catch (err: any) {
    console.error("Web article parser error:", err);
    return res.status(500).json({ error: "Failed to parse website article: " + (err.message || err) });
  }
});

// ============================================================
// Audio Speech-to-Text Transcription via Gemini AI API
// ============================================================
router.post("/transcribe-audio", async (req: Request, res: Response) => {
  // Set 10-minute socket timeout for large audio files & Gemini processing
  req.setTimeout(600000);
  res.setTimeout(600000);

  try {
    const userApiKey = (req.headers["x-gemini-key"] as string) || (req.body && req.body.geminiApiKey);
    const targetLanguage = (req.headers["x-target-language"] as string) || (req.body && req.body.targetLanguage);
    const filenameRaw = (req.headers["x-filename"] as string) || (req.body && req.body.filename);
    const filename = filenameRaw ? decodeURIComponent(filenameRaw) : "";
    const mimeTypeHeader = (req.headers["content-type"] as string) || (req.body && req.body.mimeType) || "audio/mp3";

    let buffer: Buffer | null = null;
    let mimeType = mimeTypeHeader.split(";")[0].trim();

    // Case A: Binary raw audio body
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
    } 
    // Case B: JSON body with audioBase64 string
    else if (req.body && typeof req.body.audioBase64 === "string") {
      const base64Data = req.body.audioBase64.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
      if (req.body.mimeType) mimeType = req.body.mimeType;
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Передан пустой или некорректный аудиофайл." });
    }

    const ai = getGeminiClient(userApiKey);
    if (!ai) {
      return res.status(400).json({
        error: "Для распознавания речи требуется Gemini API Key. Укажите ключ в настройках приложения или при запуске сервера."
      });
    }

    // Determine extension
    let ext = "mp3";
    const rawType = (mimeType || "").toLowerCase();
    if (rawType.includes("wav")) ext = "wav";
    else if (rawType.includes("ogg")) ext = "ogg";
    else if (rawType.includes("m4a") || rawType.includes("aac")) ext = "m4a";
    else if (rawType.includes("webm")) ext = "webm";

    const tempAudioDir = os.tmpdir();
    const tempAudioPath = path.join(tempAudioDir, `transcribe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`);

    fs.writeFileSync(tempAudioPath, buffer);

    let uploadedGeminiFile: any = null;
    try {
      console.log(`[Audio Transcribe] Uploading ${buffer.length} bytes to Gemini File API (${mimeType})...`);
      uploadedGeminiFile = await (ai.files as any).upload({
        file: tempAudioPath,
        mimeType: mimeType || "audio/mp3"
      });

      const prompt = `You are a professional transcription service. Listen to this entire audio recording${filename ? ` ("${filename}")` : ""}${targetLanguage ? ` in ${targetLanguage}` : ""} from START to FINISH.

Your ONLY task: output a timestamped transcript where each line starts with the REAL audio timestamp (the exact position in the audio file where that sentence begins).

Rules:
- Timestamps MUST match the actual audio position exactly — do NOT estimate or guess, use what you hear.
- Format: \`M:SS sentence text\` — for example: \`0:07 Hola, bienvenidos al podcast.\`
- One sentence per line. Each line must start with its correct timestamp.
- Do NOT merge multiple minutes into a single line.
- Do NOT skip any content. Transcribe everything from 0:00 to the very last word.
- Do NOT add headers, titles, notes, or markdown. Plain timestamped lines only.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            fileData: {
              fileUri: uploadedGeminiFile.uri,
              mimeType: uploadedGeminiFile.mimeType || mimeType || "audio/mp3"
            }
          },
          prompt
        ],
        config: {
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      const aiText = response.text || "";
      if (!aiText.trim()) {
        throw new Error("Gemini AI вернул пустой текст распознавания.");
      }

      const formattedTranscript = formatGeminiTranscript(aiText);

      return res.json({
        text: formattedTranscript,
        success: true
      });
    } finally {
      if (fs.existsSync(tempAudioPath)) {
        try { fs.unlinkSync(tempAudioPath); } catch (e) {}
      }
      if (uploadedGeminiFile?.name) {
        try { await ai.files.delete({ name: uploadedGeminiFile.name }); } catch (e) {}
      }
    }
  } catch (err: any) {
    console.error("Audio Transcription error:", err);
    return res.status(500).json({ error: "Ошибка распознавания речи: " + (err.message || String(err)) });
  }
});

// In-memory lock and progress tracker
const activeDownloads = new Map<string, Promise<{ url: string; isAudio: boolean; filename: string; sizeBytes: number }>>();
const downloadProgressMap = new Map<string, { percent: number; speed: string; eta: string; status: string }>();

// ============================================================================
// Media Downloader & Range Streaming (YouTube restricted / offline playback)
// ============================================================================

/**
 * GET /api/media/progress
 * Returns real-time percentage and download speed for active downloads.
 */
router.get("/media/progress", (req: Request, res: Response) => {
  const { videoId, lessonId, onlyAudio } = req.query;
  const cleanVideoId = (videoId ? String(videoId) : "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
  const isAudio = onlyAudio === "true" || onlyAudio === "1";
  const ext = isAudio ? "m4a" : "mp4";
  const lockKey = `${fileId}_${ext}`;

  const isDownloading = activeDownloads.has(lockKey);
  const progress = downloadProgressMap.get(lockKey) || { percent: isDownloading ? 5 : 0, speed: "", eta: "", status: isDownloading ? "downloading" : "idle" };

  return res.json({
    downloading: isDownloading,
    percent: progress.percent,
    speed: progress.speed,
    eta: progress.eta,
    status: progress.status
  });
});

/**
 * POST /api/media/download
 * Downloads YouTube video (720p mp4) or audio (m4a) using yt-dlp with real-time progress.
 */
router.post("/media/download", async (req: Request, res: Response) => {
  try {
    let userId = "default";
    try {
      userId = resolveUserId(req);
    } catch (_) {
      userId = "default";
    }
    const { videoId, lessonId, onlyAudio } = req.body;
    if (!videoId && !lessonId) {
      return res.status(400).json({ error: "Параметр videoId или lessonId обязателен" });
    }

    const cleanVideoId = (videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanVideoId || cleanVideoId.length !== 11) {
      return res.status(400).json({ error: "Некорректный формат YouTube videoId" });
    }

    const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
    const isAudio = !!onlyAudio;
    const ext = isAudio ? "m4a" : "mp4";
    const filename = `${fileId}.${ext}`;
    const targetFilePath = path.join(VIDEO_STORAGE_DIR, filename);

    // If file is already downloaded and valid, return ready immediately
    if (fs.existsSync(targetFilePath)) {
      const stat = fs.statSync(targetFilePath);
      if (stat.size > 100000) {
        return res.json({
          ready: true,
          url: `/api/media/stream/${filename}`,
          filename,
          isAudio,
          sizeBytes: stat.size
        });
      }
    }

    // Race condition prevention: check if this file is already downloading
    const lockKey = `${fileId}_${ext}`;
    let downloadPromise = activeDownloads.get(lockKey);

    if (!downloadPromise) {
      downloadProgressMap.set(lockKey, { percent: 1, speed: "", eta: "", status: "starting" });

      downloadPromise = new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const tempPath = path.join(VIDEO_STORAGE_DIR, `${fileId}_tmp_${Date.now()}.${ext}`);

        const ytArgs: Record<string, any> = {
          output: tempPath,
          noPlaylist: true,
          newline: true,
          noWarnings: true,
        };

        if (isAudio) {
          ytArgs.format = "ba/b";
        } else {
          ytArgs.format = "best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        }

        let processErrorMsg = "";

        const cp = (getYtDlp() as any).exec(videoUrl, ytArgs);

        cp.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          // Match lines like: [download]  45.2% of ~  25.40MiB at  3.50MiB/s ETA 00:05
          const match = text.match(/\[download\]\s+([\d\.]+)%(?:\s+of\s+~?\s*([\d\.]+[A-Za-z]+))?(?:\s+at\s+([\d\.]+[A-Za-z]+\/s))?(?:\s+ETA\s+(\S+))?/);
          if (match) {
            const pct = parseFloat(match[1]);
            const speed = match[3] || "";
            const eta = match[4] || "";
            downloadProgressMap.set(lockKey, {
              percent: !isNaN(pct) ? Math.min(99, pct) : 50,
              speed,
              eta,
              status: "downloading"
            });
          } else if (text.includes("[Merger]") || text.includes("Merging formats") || text.includes("[ffmpeg]")) {
            downloadProgressMap.set(lockKey, {
              percent: 99,
              speed: "Обработка...",
              eta: "00:01",
              status: "merging"
            });
          }
        });

        cp.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (text.includes("ERROR:") || text.includes("Error")) {
            processErrorMsg += " " + text.trim();
          }
        });

        cp.on("close", (code: number) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);

          if (code === 0 && fs.existsSync(tempPath)) {
            try {
              if (fs.existsSync(targetFilePath)) {
                try { fs.unlinkSync(targetFilePath); } catch (_) {}
              }
              fs.renameSync(tempPath, targetFilePath);

              // Update lesson record in SQLite if lessonId is given (scoped by user_id)
              if (lessonId) {
                try {
                  const db = getDbConnection(userId);
                  if (isAudio) {
                    db.prepare("UPDATE lessons SET audioUrl = ? WHERE id = ? AND user_id = ?").run(`/api/media/stream/${filename}`, lessonId, userId);
                  } else {
                    db.prepare("UPDATE lessons SET localVideoUrl = ? WHERE id = ? AND user_id = ?").run(`/api/media/stream/${filename}`, lessonId, userId);
                  }
                } catch (dbErr) {
                  console.warn("Could not update lesson media URL in SQLite:", dbErr);
                }
              }

              const stat = fs.existsSync(targetFilePath) ? fs.statSync(targetFilePath) : null;
              resolve({
                url: `/api/media/stream/${filename}`,
                filename,
                isAudio,
                sizeBytes: stat?.size || 0
              });
            } catch (err: any) {
              reject(new Error("Ошибка перемещения скачанного файла: " + err.message));
            }
          } else {
            if (fs.existsSync(tempPath)) {
              try { fs.unlinkSync(tempPath); } catch (_) {}
            }
            reject(new Error(processErrorMsg || `yt-dlp завершился с кодом ошибки ${code}`));
          }
        });

        cp.on("error", (err: Error) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);
          if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (_) {}
          }
          reject(err);
        });
      });

      activeDownloads.set(lockKey, downloadPromise);
    }

    const result = await downloadPromise;

    return res.json(result);
  } catch (err: any) {
    console.error("Media download error:", err);
    return res.status(500).json({ error: err.message || "Ошибка загрузки медиа через yt-dlp" });
  }
});

/**
 * GET /api/media/status
 * Check if media file is already downloaded or currently in progress.
 */
router.get("/media/status", (req: Request, res: Response) => {
  const { videoId, lessonId, onlyAudio } = req.query;
  const cleanVideoId = (videoId ? String(videoId) : "").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileId = lessonId ? String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
  const isAudio = onlyAudio === "true" || onlyAudio === "1";
  const ext = isAudio ? "m4a" : "mp4";
  const filename = `${fileId}.${ext}`;
  const targetFilePath = path.join(VIDEO_STORAGE_DIR, filename);

  const lockKey = `${fileId}_${ext}`;
  const isDownloading = activeDownloads.has(lockKey);

  if (fs.existsSync(targetFilePath)) {
    const stat = fs.statSync(targetFilePath);
    if (stat.size > 100000) {
      return res.json({
        exists: true,
        ready: true,
        downloading: false,
        url: `/api/media/stream/${filename}`,
        filename,
        isAudio,
        sizeBytes: stat.size
      });
    }
  }

  // Also check if .mp4 exists when onlyAudio wasn't explicitly requested
  if (!isAudio) {
    const audioFilename = `${fileId}.m4a`;
    const audioPath = path.join(VIDEO_STORAGE_DIR, audioFilename);
    if (fs.existsSync(audioPath)) {
      const stat = fs.statSync(audioPath);
      if (stat.size > 100000) {
        return res.json({
          exists: true,
          ready: true,
          downloading: false,
          url: `/api/media/stream/${audioFilename}`,
          filename: audioFilename,
          isAudio: true,
          sizeBytes: stat.size
        });
      }
    }
  }

  return res.json({
    exists: false,
    ready: false,
    downloading: isDownloading
  });
});

/**
 * Helper function to stream any media file with Range headers (HTTP 206 Partial Content)
 */
function streamFile(filePath: string, req: Request, res: Response, defaultContentType?: string) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Media file not found" });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  let contentType = defaultContentType || (ext === ".mkv" ? "video/x-matroska" : "video/mp4");
  if (ext === ".m4a" || ext === ".aac") contentType = "audio/mp4";
  else if (ext === ".mp3") contentType = "audio/mpeg";
  else if (ext === ".webm") contentType = "video/webm";
  else if (ext === ".mkv") contentType = "video/x-matroska";

  res.setHeader("Accept-Ranges", "bytes");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

/**
 * GET /api/media/stream/:filename
 * Stream video/audio files with HTTP 206 Partial Content (Range header) for fast seeking.
 */
router.get("/media/stream/:filename", (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(VIDEO_STORAGE_DIR, filename);

  // If MKV is requested, check if a browser-friendly MP4 exists and stream that instead
  if (filename.toLowerCase().endsWith(".mkv")) {
    const mp4Name = filename.replace(/\.mkv$/i, ".mp4");
    const mp4Path = path.join(VIDEO_STORAGE_DIR, mp4Name);
    if (fs.existsSync(mp4Path)) {
      return streamFile(mp4Path, req, res, "video/mp4");
    }
  }

  return streamFile(filePath, req, res);
});

/**
 * GET /api/media/youtube-stream/:videoId
 * Provides direct audio stream for a YouTube video in GlobalAudioPlayer / background playlist.
 * If file already exists locally, streams it immediately with 206 Partial Content.
 * If not, fetches the audio via yt-dlp on-demand and streams it.
 */
router.get("/media/youtube-stream/:videoId", async (req: Request, res: Response) => {
  try {
    let userId = "default";
    try {
      userId = resolveUserId(req);
    } catch (_) {
      userId = "default";
    }
    const cleanVideoId = (req.params.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanVideoId || cleanVideoId.length !== 11) {
      return res.status(400).json({ error: "Invalid video ID format" });
    }
    const lessonId = req.query.lessonId ? String(req.query.lessonId).replace(/[^a-zA-Z0-9_-]/g, "") : cleanVideoId;
    const filename = `${lessonId}.m4a`;
    const targetFilePath = path.join(VIDEO_STORAGE_DIR, filename);

    // 1. Check if local media file is already downloaded
    if (fs.existsSync(targetFilePath)) {
      const stat = fs.statSync(targetFilePath);
      if (stat.size > 50000) {
        return streamFile(targetFilePath, req, res, "audio/mp4");
      }
    }

    // Also check cleanVideoId.m4a or mp4
    for (const altExt of ["m4a", "mp4"]) {
      const altPath = path.join(VIDEO_STORAGE_DIR, `${cleanVideoId}.${altExt}`);
      if (fs.existsSync(altPath)) {
        const stat = fs.statSync(altPath);
        if (stat.size > 50000) {
          return streamFile(altPath, req, res, altExt === "m4a" ? "audio/mp4" : "video/mp4");
        }
      }
    }

    // 2. On-demand download with yt-dlp
    const lockKey = `${lessonId}_m4a`;
    let downloadPromise = activeDownloads.get(lockKey);

    if (!downloadPromise) {
      downloadProgressMap.set(lockKey, { percent: 1, speed: "", eta: "", status: "starting" });

      downloadPromise = new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const tempPath = path.join(VIDEO_STORAGE_DIR, `${lessonId}_tmp_${Date.now()}.m4a`);

        const ytArgs: Record<string, any> = {
          output: tempPath,
          noPlaylist: true,
          newline: true,
          noWarnings: true,
          format: "ba/b",
        };

        let processErrorMsg = "";
        const cp = (getYtDlp() as any).exec(videoUrl, ytArgs);

        cp.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          const match = text.match(/\[download\]\s+([\d\.]+)%/);
          if (match) {
            const pct = parseFloat(match[1]);
            downloadProgressMap.set(lockKey, {
              percent: !isNaN(pct) ? pct : 50,
              speed: "",
              eta: "",
              status: "downloading"
            });
          }
        });

        cp.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (text.includes("ERROR:") || text.includes("Error")) {
            processErrorMsg += " " + text.trim();
          }
        });

        cp.on("close", (code: number) => {
          activeDownloads.delete(lockKey);
          downloadProgressMap.delete(lockKey);

          if (code === 0 && fs.existsSync(tempPath)) {
            try {
              if (fs.existsSync(targetFilePath)) {
                try { fs.unlinkSync(targetFilePath); } catch (_) {}
              }
              fs.renameSync(tempPath, targetFilePath);

              if (lessonId) {
                try {
                  const db = getDbConnection(userId);
                  db.prepare("UPDATE lessons SET audioUrl = ? WHERE id = ? AND user_id = ?").run(`/api/media/stream/${filename}`, lessonId, userId);
                } catch (_) {}
              }

              const stat = fs.existsSync(targetFilePath) ? fs.statSync(targetFilePath) : null;
              resolve({
                url: `/api/media/stream/${filename}`,
                filename,
                isAudio: true,
                sizeBytes: stat?.size || 0
              });
            } catch (err: any) {
              reject(err);
            }
          } else {
            if (fs.existsSync(tempPath)) {
              try { fs.unlinkSync(tempPath); } catch (_) {}
            }
            reject(new Error(processErrorMsg || `yt-dlp exited with code ${code}`));
          }
        });
      });

      activeDownloads.set(lockKey, downloadPromise);
    }

    await downloadPromise;
    return streamFile(targetFilePath, req, res, "audio/mp4");
  } catch (err: any) {
    console.error("[YouTube Audio Stream Error]:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Error resolving YouTube stream" });
  }
});

/**
 * GET /api/media/clips/:filename
 * Stream card clip media (mp3, jpg, webp) with range support.
 */
router.get("/media/clips/:filename", (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(CLIPS_STORAGE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Clip not found" });
  }
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".mp3" ? "audio/mpeg" : ext === ".m4a" ? "audio/mp4" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return streamFile(filePath, req, res, contentType);
});

/**
 * POST /api/media/create-card-clip
 * Generates audio clip (mp3) and image snapshot (jpg) from video/audio lesson.
 */
router.post("/media/create-card-clip", async (req: Request, res: Response) => {
  try {
    const {
      lessonId,
      videoId,
      audioUrl,
      localVideoUrl,
      startTime = 0,
      endTime = 0,
      imageSnapshot,
      word = "word",
    } = req.body;

    const startNum = Math.max(0, parseFloat(startTime) || 0);
    let endNum = parseFloat(endTime) || (startNum + 3.0);
    if (endNum <= startNum) {
      endNum = startNum + 3.0;
    }
    // Limit clip length to 15 seconds to prevent oversized clips
    if (endNum - startNum > 15) {
      endNum = startNum + 15;
    }

    // Add gentle padding (150ms before, 250ms after)
    const paddedStart = Math.max(0, startNum - 0.15);
    const paddedEnd = endNum + 0.25;

    const clipId = `clip_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const targetMp3Path = path.join(CLIPS_STORAGE_DIR, `${clipId}.mp3`);
    const targetJpgPath = path.join(CLIPS_STORAGE_DIR, `${clipId}.jpg`);

    let finalImageUrl: string | null = null;
    let finalAudioUrl: string | null = null;

    // 1. Process client image snapshot if provided (canvas dataUrl)
    if (imageSnapshot && typeof imageSnapshot === "string" && imageSnapshot.startsWith("data:image")) {
      try {
        const base64Data = imageSnapshot.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(targetJpgPath, Buffer.from(base64Data, "base64"));
        finalImageUrl = `/api/media/clips/${clipId}.jpg`;
      } catch (imgErr) {
        console.warn("[CardClip] Failed to write image snapshot:", imgErr);
      }
    }

    // 2. Find local media source
    let sourcePath: string | null = null;
    const candidates = [
      lessonId ? path.join(VIDEO_STORAGE_DIR, `${lessonId}.m4a`) : null,
      lessonId ? path.join(VIDEO_STORAGE_DIR, `${lessonId}.mp4`) : null,
      videoId ? path.join(VIDEO_STORAGE_DIR, `${videoId}.m4a`) : null,
      videoId ? path.join(VIDEO_STORAGE_DIR, `${videoId}.mp4`) : null,
      localVideoUrl ? path.join(VIDEO_STORAGE_DIR, path.basename(localVideoUrl)) : null,
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        sourcePath = c;
        break;
      }
    }

    // If sourcePath found on disk, extract audio clip and optionally frame
    if (sourcePath) {
      try {
        // Cut audio clip with ffmpeg
        await execFilePromise("ffmpeg", [
          "-y",
          "-ss", paddedStart.toFixed(2),
          "-to", paddedEnd.toFixed(2),
          "-i", sourcePath,
          "-vn",
          "-c:a", "libmp3lame",
          "-b:a", "96k",
          "-ac", "2",
          targetMp3Path,
        ]);
        if (fs.existsSync(targetMp3Path)) {
          finalAudioUrl = `/api/media/clips/${clipId}.mp3`;
        }
      } catch (audioErr: any) {
        console.warn("[CardClip] ffmpeg audio cut error:", audioErr?.message);
      }

      // If no image snapshot was provided, extract frame using ffmpeg
      if (!finalImageUrl && sourcePath.endsWith(".mp4")) {
        try {
          await execFilePromise("ffmpeg", [
            "-y",
            "-ss", startNum.toFixed(2),
            "-i", sourcePath,
            "-vframes", "1",
            "-q:v", "3",
            targetJpgPath,
          ]);
          if (fs.existsSync(targetJpgPath)) {
            finalImageUrl = `/api/media/clips/${clipId}.jpg`;
          }
        } catch (frameErr: any) {
          console.warn("[CardClip] ffmpeg frame extraction error:", frameErr?.message);
        }
      }
    } else if (audioUrl && typeof audioUrl === "string" && audioUrl.startsWith("http")) {
      // Direct remote audio URL
      try {
        await execFilePromise("ffmpeg", [
          "-y",
          "-ss", paddedStart.toFixed(2),
          "-to", paddedEnd.toFixed(2),
          "-i", audioUrl,
          "-vn",
          "-c:a", "libmp3lame",
          "-b:a", "96k",
          "-ac", "2",
          targetMp3Path,
        ]);
        if (fs.existsSync(targetMp3Path)) {
          finalAudioUrl = `/api/media/clips/${clipId}.mp3`;
        }
      } catch (remoteErr: any) {
        console.warn("[CardClip] Remote audio stream ffmpeg cut error:", remoteErr?.message);
      }
    } else if (videoId) {
      // YouTube video: download short 360p mp4 section using yt-dlp with android player client
      const tempSectionMp4 = path.join(CLIPS_STORAGE_DIR, `temp_${clipId}.mp4`);
      try {
        const ytDlp = getYtDlp();
        await Promise.race([
          ytDlp(`https://www.youtube.com/watch?v=${videoId}`, {
            format: "18/best[height<=360]/best",
            extractorArgs: "youtube:player_client=android",
            downloadSections: `*${paddedStart.toFixed(2)}-${paddedEnd.toFixed(2)}`,
            output: tempSectionMp4,
            socketTimeout: 8,
            retries: 2,
            fragmentRetries: 2,
            noCheckCertificates: true,
            preferFreeFormats: true,
          } as any),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("yt-dlp section cut timed out after 12s")), 12000)
          ),
        ]);

        if (fs.existsSync(tempSectionMp4)) {
          // 1. Extract exact scene frame from the section clip
          if (!finalImageUrl) {
            try {
              await execFilePromise("ffmpeg", [
                "-y",
                "-ss", "0.3",
                "-i", tempSectionMp4,
                "-vframes", "1",
                "-q:v", "2",
                targetJpgPath,
              ]);
              if (fs.existsSync(targetJpgPath)) {
                finalImageUrl = `/api/media/clips/${clipId}.jpg`;
              }
            } catch (fErr: any) {
              console.warn("[CardClip] Failed to extract frame from section mp4:", fErr?.message);
            }
          }

          // 2. Extract exact audio clip
          try {
            await execFilePromise("ffmpeg", [
              "-y",
              "-i", tempSectionMp4,
              "-vn",
              "-c:a", "libmp3lame",
              "-b:a", "96k",
              "-ac", "2",
              targetMp3Path,
            ]);
            if (fs.existsSync(targetMp3Path)) {
              finalAudioUrl = `/api/media/clips/${clipId}.mp3`;
            }
          } catch (aErr: any) {
            console.warn("[CardClip] Failed to extract audio from section mp4:", aErr?.message);
          }

          try { fs.unlinkSync(tempSectionMp4); } catch (_) {}
        }
      } catch (ytdlpErr: any) {
        console.warn("[CardClip] yt-dlp section cut error:", ytdlpErr?.message);
        try { if (fs.existsSync(tempSectionMp4)) fs.unlinkSync(tempSectionMp4); } catch (_) {}
      }
    }

    // If still no image and videoId is known, fallback to YouTube video thumbnail
    if (!finalImageUrl && videoId) {
      finalImageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    return res.json({
      success: true,
      clipId,
      audioClipUrl: finalAudioUrl,
      imageUrl: finalImageUrl,
    });
  } catch (err: any) {
    console.error("[CardClip Error]:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Failed to create card clip" });
  }
});

export default router;
