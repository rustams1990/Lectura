import { Router } from "express";
import os from "os";
import fs from "fs";
import path from "path";
import ytdlp from "yt-dlp-exec";
import WebVTT from "node-webvtt";
import { aiRateLimit, sanitizeLang } from "./ai.ts";
import { getGeminiClient } from "./geminiClient.ts";

const router = Router();

// ============================================================
// YouTube Subtitle Downloader & Metadata Parser Route
// ============================================================

router.post("/youtube-subtitles", aiRateLimit, async (req, res) => {
  const { url } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Extract 11-char video ID
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
  if (!match) {
    return res.status(400).json({ error: "Invalid YouTube URL format" });
  }
  const videoId = match[1];
  let title = "YouTube Video";
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  let videoLengthSeconds: number | null = null;

  try {
    const resPage = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const html = await resPage.text();

    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(.*?);<\/script>/);
    if (playerResponseMatch) {
      try {
        const parsed = JSON.parse(playerResponseMatch[1]);
        if (parsed?.videoDetails?.lengthSeconds) {
          videoLengthSeconds = parseInt(parsed.videoDetails.lengthSeconds, 10);
        }
      } catch (e) {
        console.error("Failed to parse ytInitialPlayerResponse", e);
      }
    }
    if (!videoLengthSeconds) {
      const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/i) || html.match(/\\?"lengthSeconds\\?"\s*:\s*\\?"(\d+)\\?"/i);
      if (lengthMatch) {
        videoLengthSeconds = parseInt(lengthMatch[1], 10);
      }
    }

    // Title parsing
    const titleMatch = html.match(/<meta name="title" content="([^"]*)"/i) || html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(" - YouTube", "");
      // HTML entity decode title simple
      title = title
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#160;/g, " ");
    }

    let langCode = "es";
    const targetLower = (targetLanguage || "spanish").toLowerCase();
    if (targetLower.startsWith("span") || targetLower === "es") langCode = "es";
    else if (targetLower.startsWith("fren") || targetLower === "fr") langCode = "fr";
    else if (targetLower.startsWith("germ") || targetLower === "de") langCode = "de";
    else if (targetLower.startsWith("ital") || targetLower === "it") langCode = "it";
    else if (targetLower.startsWith("russ") || targetLower === "ru") langCode = "ru";
    else if (targetLower.startsWith("engl") || targetLower === "en") langCode = "en";
    else if (targetLower.startsWith("jap") || targetLower === "ja") langCode = "ja";
    else if (targetLower.startsWith("chin") || targetLower === "zh") langCode = "zh";
    else if (targetLower.startsWith("arab") || targetLower === "ar") langCode = "ar";
    else langCode = targetLower.substring(0, 2);

    let isSuccessful = false;
    let lines: string[] = [];

    // Helper to download and parse subtitles with yt-dlp
    const downloadSubs = async (lang: string) => {
      const tempDir = os.tmpdir();
      const tempBaseName = `yt_sub_${videoId}_${Date.now()}`;
      const tempBasePath = path.join(tempDir, tempBaseName);
      
      const findWordOverlap = (a: string, b: string): number => {
        const wordsA = a.trim().split(/\s+/);
        const wordsB = b.trim().split(/\s+/);
        
        const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
        
        const normA = wordsA.map(normalize).filter(Boolean);
        const normB = wordsB.map(normalize).filter(Boolean);
        
        const maxOverlap = Math.min(normA.length, normB.length);
        for (let len = maxOverlap; len > 0; len--) {
          let match = true;
          for (let i = 0; i < len; i++) {
            if (normA[normA.length - len + i] !== normB[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            let wordCount = 0;
            let charIdx = 0;
            while (charIdx < b.length && /\s/.test(b[charIdx])) {
              charIdx++;
            }
            while (charIdx < b.length && wordCount < len) {
              while (charIdx < b.length && !/\s/.test(b[charIdx])) {
                charIdx++;
              }
              wordCount++;
              while (charIdx < b.length && /\s/.test(b[charIdx])) {
                charIdx++;
              }
            }
            return charIdx;
          }
        }
        return 0;
      };

      try {
        await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
          writeSub: true,
          writeAutoSub: true,
          subLang: lang,
          subFormat: 'vtt',
          output: tempBasePath,
          skipDownload: true,
          noCheckCertificate: true,
        });

        // Search for generated subtitle file matching the prefix and ending with .vtt
        const files = fs.readdirSync(tempDir);
        const matchingFile = files.find(f => f.startsWith(tempBaseName) && f.endsWith(".vtt"));
        
        if (matchingFile) {
          const fullPath = path.join(tempDir, matchingFile);
          const rawContent = fs.readFileSync(fullPath, "utf-8");
          
          // Sanitise VTT content to bypass strict node-webvtt signature checks
          const rawLines = rawContent.split(/\r?\n/);
          const sanitizedLines: string[] = ["WEBVTT", ""];
          let inHeader = true;
          for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (line.startsWith("WEBVTT")) continue;
            if (inHeader) {
              if (line.includes("-->")) {
                inHeader = false;
              } else {
                continue;
              }
            }
            sanitizedLines.push(rawLines[i]);
          }
          const sanitizedContent = sanitizedLines.join("\n");
          const parsed = WebVTT.parse(sanitizedContent);
          
          if (parsed?.cues && parsed.cues.length > 0) {
            // Clean cues text first
            const cleanCues = parsed.cues.map(c => {
              let t = c.text || "";
              // Strip inline timing tags (<00:00:00.123>) and other WebVTT formatting tags (<c>, etc.)
              t = t.replace(/<[^>]+>/g, "");
              t = t
                .replace(/&nbsp;/g, " ")
                .replace(/&#160;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&#10;/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              return {
                start: c.start,
                text: t
              };
            }).filter(c => c.text.length > 0);

            // Step 1: Discard any cue i if cue i+1 starts with cue i
            const filteredCues = [];
            for (let i = 0; i < cleanCues.length; i++) {
              const current = cleanCues[i].text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
              const next = i < cleanCues.length - 1 ? cleanCues[i+1].text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "") : "";
              if (next && next.startsWith(current)) {
                continue;
              }
              filteredCues.push(cleanCues[i]);
            }

            // Step 2: Merge overlapping consecutive cues
            const finalLines = [];
            if (filteredCues.length > 0) {
              finalLines.push({
                start: filteredCues[0].start,
                text: filteredCues[0].text
              });

              for (let i = 1; i < filteredCues.length; i++) {
                const prevText = filteredCues[i - 1].text;
                const currentText = filteredCues[i].text;
                const skipBytes = findWordOverlap(prevText, currentText);
                const cleanText = currentText.substring(skipBytes).trim();
                
                if (cleanText) {
                  finalLines.push({
                    start: filteredCues[i].start,
                    text: cleanText
                  });
                }
              }
            }

            // Format cues into final array format
            lines = finalLines.map(cue => {
              const offsetSec = Math.floor(cue.start);
              return `${offsetSec}s\t${cue.text}`;
            });
          }
          
          // Cleanup
          try {
            fs.unlinkSync(fullPath);
          } catch (e) {
            // ignore cleanup errors
          }
          
          if (lines.length > 0) {
            return true;
          }
        }
      } catch (err: any) {
        // yt-dlp failed for this language
      }
      return false;
    };

    // 1. Try fetching with preferred language
    isSuccessful = await downloadSubs(langCode);

    // 2. Try fetching with default language (English fallback)
    if (!isSuccessful) {
      isSuccessful = await downloadSubs("en");
    }

    // 3. Fallback to Gemini AI Audio Transcription if we could not retrieve any subtitles
    if (!isSuccessful || lines.length === 0) {
      const userApiKey = (req.headers["x-gemini-key"] as string) || req.body.geminiApiKey;
      const ai = getGeminiClient(userApiKey);
      if (ai) {
        let tempAudioPath: string | null = null;
        let uploadedGeminiFile: any = null;
        try {
          console.log(`[YouTube] No captions found for video ${videoId}. Attempting Gemini Audio Speech-to-Text...`);
          const tempAudioDir = os.tmpdir();
          const tempAudioBase = path.join(tempAudioDir, `yt_audio_${videoId}_${Date.now()}`);
          
          await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 5,
            output: `${tempAudioBase}.%(ext)s`,
            noCheckCertificate: true,
          });

          const tempFiles = fs.readdirSync(tempAudioDir);
          const downloadedFile = tempFiles.find(f => f.startsWith(path.basename(tempAudioBase)));

          if (downloadedFile) {
            tempAudioPath = path.join(tempAudioDir, downloadedFile);

            // Upload audio to Gemini File API
            uploadedGeminiFile = await (ai.files as any).upload({
              file: tempAudioPath,
              mimeType: "audio/mp3",
            });

            const prompt = `Listen carefully to this audio track from a YouTube video titled: "${title}".
Transcribe all spoken words accurately into short, sentence-by-sentence entries in the original spoken language (preferably target study language: "${targetLanguage}").
For EVERY single spoken sentence or dialogue turn, provide the exact start timestamp in seconds or minutes (e.g. 0s\t..., 20s\t..., 47s\t..., 1m3s\t..., 1m17s\t...).
Do NOT group multiple sentences or long paragraphs into a single timestamp entry. Break the transcript into short, individual spoken sentences so that every line has an accurate timestamp matching when it is actually spoken in the audio.

IMPORTANT: Output ONLY the line-by-line timestamped transcript entries. Do not provide titles, introductory explanations, translation notes, bracketed remarks, or markdown code blocks.`;

            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [
                {
                  fileData: {
                    fileUri: uploadedGeminiFile.uri,
                    mimeType: uploadedGeminiFile.mimeType || "audio/mp3"
                  }
                },
                prompt
              ]
            });

            const aiText = response.text || "";
            if (aiText.trim()) {
              const cleanLines = aiText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
              const formattedAiText = cleanLines.join("\n\n");

              return res.json({
                title: `${title} (Gemini AI Transcription)`,
                text: formattedAiText,
                coverUrl: thumbnail,
                youtubeId: videoId,
                youtubeDuration: videoLengthSeconds,
                isFallback: false
              });
            }
          }
        } catch (gErr: any) {
          console.error("Gemini AI Audio Speech-to-Text failed:", gErr);
        } finally {
          if (tempAudioPath) {
            try { fs.unlinkSync(tempAudioPath); } catch (e) {}
          }
          if (uploadedGeminiFile?.name) {
            try { await ai.files.delete({ name: uploadedGeminiFile.name }); } catch (e) {}
          }
        }
      }

      // If no AI key set or AI generation fails, return a clear, informative Russian error response
      return res.json({
        title: `${title} (Субтитры отсутствуют)`,
        text: `У этого видео на YouTube отсутствуют готовые субтитры.\n\nДля включения автоматического распознавания речи ИИ укажите ваш рабочий Gemini API Key (начинается на AIza...) при запуске Docker контейнера (-e GEMINI_API_KEY="AIzaSy...") или в настройках приложения.`,
        coverUrl: thumbnail,
        youtubeId: videoId,
        youtubeDuration: videoLengthSeconds,
        isFallback: true
      });
    }

    // Join lines with double newline as requested
    const formattedText = lines.join("\n\n");

    return res.json({
      title: title,
      text: formattedText,
      coverUrl: thumbnail,
      youtubeId: videoId,
      youtubeDuration: videoLengthSeconds
    });
  } catch (err: any) {
    console.error("YouTube importing subtitle error:", err);
    return res.status(500).json({
      error: `Could not parse subtitles: ${err.message || "Unknown error"}. Clean YouTube transcription blocks may be geo-restricted or unavailable.`,
      videoTitle: title || "YouTube Study Lesson",
      coverUrl: thumbnail,
      youtubeId: videoId,
    });
  }
});

export default router;
