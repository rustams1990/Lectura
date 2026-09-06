import { Router } from "express";
import os from "os";
import fs from "fs";
import path from "path";
import ytdlp from "yt-dlp-exec";
import { getYtDlp } from "./ytdlpWrapper.ts";
import { YoutubeTranscript } from "youtube-transcript";
import WebVTT from "node-webvtt";
import { aiRateLimit, sanitizeLang } from "./ai.ts";
import { getGeminiClient } from "./geminiClient.ts";
import {
  SubtitleItem,
  FormattedSentence,
  isAbbreviationOrNumber,
  cleanSentenceText,
  chunkSubtitlesIntoSentences
} from "../src/utils/sentenceChunker.ts";

const router = Router();

export type { SubtitleItem, FormattedSentence };
export { isAbbreviationOrNumber, cleanSentenceText, chunkSubtitlesIntoSentences };

export function formatGeminiTranscript(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;

  // Convert XmYs or Xm Ys (e.g. 1m3s -> 63s, 1m17s -> 77s)
  text = text.replace(/(\d+)\s*m\s*(\d+)\s*s?/gi, (_, m, s) => {
    const totalSec = parseInt(m, 10) * 60 + parseInt(s, 10);
    return `${totalSec}s`;
  });

  // Convert Xm (e.g. 2m -> 120s)
  text = text.replace(/(\d+)\s*m(?!\w)/gi, (_, m) => {
    const totalSec = parseInt(m, 10) * 60;
    return `${totalSec}s`;
  });

  const timestampPattern = /(?:^|\s+)(?:\b(\d{1,2}:\d{2}(?::\d{2})?)\b|\b(\d+)s\b)\s*/gi;

  const lines: string[] = [];
  let lastIndex = 0;
  let currentSec: number | null = null;

  const matches = Array.from(text.matchAll(timestampPattern));
  if (matches.length === 0) return rawText;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    if (i > 0) {
      const chunk = text.substring(lastIndex, matchStart).trim();
      if (chunk && currentSec !== null) {
        const mins = Math.floor(currentSec / 60);
        const secs = Math.floor(currentSec % 60);
        const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;
        lines.push(`${formattedTime} ${chunk}`);
      }
    }

    if (match[1]) {
      const parts = match[1].split(':').map(n => parseInt(n, 10));
      if (parts.length === 2) currentSec = parts[0] * 60 + parts[1];
      else if (parts.length === 3) currentSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (match[2]) {
      currentSec = parseInt(match[2], 10);
    }

    lastIndex = matchEnd;
  }

  if (lastIndex < text.length && currentSec !== null) {
    const chunk = text.substring(lastIndex).trim();
    if (chunk) {
      const mins = Math.floor(currentSec / 60);
      const secs = Math.floor(currentSec % 60);
      const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;
      lines.push(`${formattedTime} ${chunk}`);
    }
  }

  return lines.join("\n");
}

export async function resolveBestYoutubeThumbnail(videoId: string, oembedThumbnailUrl?: string | null): Promise<string> {
  const maxres = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const headRes = await fetch(maxres, { method: "HEAD", signal: AbortSignal.timeout(2000) });
    if (headRes.ok && headRes.status === 200) {
      return maxres;
    }
  } catch (_) {}

  const sd = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
  try {
    const headSd = await fetch(sd, { method: "HEAD", signal: AbortSignal.timeout(1500) });
    if (headSd.ok && headSd.status === 200) {
      return sd;
    }
  } catch (_) {}

  return oembedThumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

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
  let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  let videoLengthSeconds: number | null = null;

  const mode = req.body.mode || "auto"; // "auto" | "force_ai"
  const doChunkSentences = req.body.chunkSentences !== false;

  try {
    const resPage = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

    let channelName: string | null = null;
    let channelAvatarUrl: string | null = null;

    // Fetch official oEmbed data (100% reliable, never blocked)
    let oembedThumbUrl: string | null = null;
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData: any = await oembedRes.json();
        if (oembedData.thumbnail_url) {
          oembedThumbUrl = oembedData.thumbnail_url;
        }
        if (oembedData.author_name) {
          channelName = oembedData.author_name;
        }
        if (oembedData.title && (title === "YouTube Video" || !title)) {
          title = oembedData.title;
        }
        if (oembedData.author_url) {
          try {
            const cRes = await fetch(oembedData.author_url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
              }
            });
            if (cRes.ok) {
              const cHtml = await cRes.text();
              const ogImgMatch = cHtml.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
                              || cHtml.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
              if (ogImgMatch) channelAvatarUrl = ogImgMatch[1];
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // Resolve best accessible thumbnail (HD maxres -> SD sddefault -> HQ hqdefault)
    thumbnail = await resolveBestYoutubeThumbnail(videoId, oembedThumbUrl);

    // Fallback parsing from HTML if oEmbed didn't provide it
    if (!channelName && playerResponseMatch) {
      try {
        const parsed = JSON.parse(playerResponseMatch[1]);
        if (parsed?.videoDetails?.author) {
          channelName = parsed.videoDetails.author;
        }
      } catch (e) {}
    }
    if (!channelName) {
      const channelMatch = html.match(/"author"\s*:\s*"([^"]+)"/) || html.match(/<link itemprop="name" content="([^"]+)">/i);
      if (channelMatch) channelName = channelMatch[1];
    }
    
    if (!channelAvatarUrl) {
      const avatarMatch = html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);
      if (avatarMatch) {
        channelAvatarUrl = avatarMatch[1];
      }
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

    // Helper to fetch and format subtitles via YoutubeTranscript (fast InnerTube API, no child process)
    const fetchWithYoutubeTranscript = async (lang?: string): Promise<boolean> => {
      try {
        const opts = lang ? { lang } : undefined;
        const rawCues = await YoutubeTranscript.fetchTranscript(videoId, opts);
        if (!rawCues || rawCues.length === 0) return false;

        const cleanCues = rawCues.map(c => {
          let t = c.text || "";
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
            .replace(/[♪♫♬♩#]+|>>+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return {
            start: c.offset / 1000,
            end: (c.offset + c.duration) / 1000,
            text: t
          };
        }).filter(c => c.text.length > 0);

        if (cleanCues.length === 0) return false;

        if (doChunkSentences) {
          const formattedSentences = chunkSubtitlesIntoSentences(cleanCues);
          lines = formattedSentences.map(s => `${s.start}s\t${s.text}`);
        } else {
          lines = cleanCues.map(cue => `${Math.floor(cue.start)}s\t${cue.text}`);
        }
        return lines.length > 0;
      } catch (err: any) {
        console.log(`[YouTube] youtube-transcript info for ${videoId}${lang ? ` (lang: ${lang})` : ""}:`, err.message || err);
        return false;
      }
    };

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
        const dlp = getYtDlp();
        await (dlp as any)(`https://www.youtube.com/watch?v=${videoId}`, {
          writeSub: true,
          writeAutoSub: true,
          subLang: `${lang}.*,${lang}`,
          subFormat: 'vtt',
          addHeader: [
            'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language:en-US,en;q=0.9'
          ],
          extractorArgs: 'youtube:player_client=android,web',
          output: tempBasePath,
          skipDownload: true,
          noCheckCertificate: true,
        });
      } catch (dlErr: any) {
        // yt-dlp may return exit code 1 if secondary auto-translation fails, but primary .vtt file is written!
        console.warn(`[YouTube] yt-dlp warning/info for ${videoId} (${lang}):`, dlErr.message || dlErr);
      }

      try {
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
                // Remove music symbols and technical subtitle cue artifacts
                .replace(/[♪♫♬♩#]+|>>+|-->|align:(?:start|center|end|left|right)|position:\d+%?|line:\d+%?|size:\d+%?/gi, " ")
                .replace(/\s+([.,!?:;])/g, "$1")
                .replace(/^([.,!?:;]\s*)+/g, "")
                .replace(/\s+/g, " ")
                .trim();
              return {
                start: c.start,
                end: c.end,
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
                end: filteredCues[0].end,
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
                    end: filteredCues[i].end,
                    text: cleanText
                  });
                }
              }
            }

            // Format cues into final array format
            if (doChunkSentences) {
              const formattedSentences = chunkSubtitlesIntoSentences(finalLines);
              lines = formattedSentences.map(s => `${s.start}s\t${s.text}`);
            } else {
              lines = finalLines.map(cue => {
                const offsetSec = Math.floor(cue.start);
                return `${offsetSec}s\t${cue.text}`;
              });
            }
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
        // parsing failed for this language
      }
      return false;
    };

    if (mode !== "force_ai") {
      // 1. Try fast retrieval via InnerTube API with requested language
      isSuccessful = await fetchWithYoutubeTranscript(langCode);

      // 2. Try fast retrieval with video default/auto transcript
      if (!isSuccessful) {
        isSuccessful = await fetchWithYoutubeTranscript();
      }

      // 3. Fallback to yt-dlp with requested language
      if (!isSuccessful) {
        isSuccessful = await downloadSubs(langCode);
      }

      // 4. Fallback to yt-dlp with English
      if (!isSuccessful) {
        isSuccessful = await downloadSubs("en");
      }
    } else {
      console.log(`[YouTube] Forced AI mode for video ${videoId}. Running Gemini Audio Speech-to-Text...`);
    }

    // 3. Fallback to Gemini AI Audio Transcription if we could not retrieve any subtitles
    if (!isSuccessful || lines.length === 0) {
      const userApiKey = (req.headers["x-gemini-key"] as string) || req.body.geminiApiKey;
      const ai = getGeminiClient(userApiKey);

      if (mode === "force_ai" && !ai) {
        return res.status(400).json({
          error: "Gemini API Key missing or invalid. Please set your Gemini API Key in Settings to use Gemini AI Speech-to-Text transcription.",
          videoTitle: title,
          coverUrl: thumbnail,
          youtubeId: videoId,
          youtubeDuration: videoLengthSeconds,
        });
      }

      if (ai) {
        let tempAudioPath: string | null = null;
        let uploadedGeminiFile: any = null;
        let lastAiErr: string | null = null;
        try {
          console.log(`[YouTube] Attempting Gemini Audio Speech-to-Text for video ${videoId}...`);
          const tempAudioDir = os.tmpdir();
          const tempAudioBase = path.join(tempAudioDir, `yt_audio_${videoId}_${Date.now()}`);
          
          const dlp = getYtDlp();
          await (dlp as any)(`https://www.youtube.com/watch?v=${videoId}`, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 5,
            format: 'bestaudio/best',
            addHeader: [
              'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept-Language:en-US,en;q=0.9'
            ],
            extractorArgs: 'youtube:player_client=android,web',
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
              const formattedAiText = formatGeminiTranscript(aiText);

              return res.json({
                title: `${title} (Gemini AI Transcription)`,
                text: formattedAiText,
                coverUrl: thumbnail,
                youtubeId: videoId,
                youtubeDuration: videoLengthSeconds,
                isFallback: false,
                channelName,
                channelAvatarUrl
              });
            }
          }
        } catch (gErr: any) {
          console.error("Gemini AI Audio Speech-to-Text failed:", gErr);
          lastAiErr = gErr.message || String(gErr);
        } finally {
          if (tempAudioPath) {
            try { fs.unlinkSync(tempAudioPath); } catch (e) {}
          }
          if (uploadedGeminiFile?.name) {
            try { await ai.files.delete({ name: uploadedGeminiFile.name }); } catch (e) {}
          }
        }

        if (mode === "force_ai") {
          let cleanErr = lastAiErr || "Could not process audio track.";
          if (cleanErr.includes("RESOURCE_EXHAUSTED") || cleanErr.includes("Quota exceeded") || cleanErr.includes("429")) {
            cleanErr = "Gemini API rate limit or daily quota exceeded (Google Free Tier limit: 20 requests/day). Please wait a minute before retrying or provide a paid/different API key.";
          }
          return res.status(500).json({
            error: `Gemini AI Speech-to-Text failed: ${cleanErr}`,
            videoTitle: title,
            coverUrl: thumbnail,
            youtubeId: videoId,
            youtubeDuration: videoLengthSeconds,
          });
        }
      }

      const uiLang = (req.body.uiLang || "en").toLowerCase();
      const isRu = uiLang.startsWith("ru");

      const fallbackTitle = isRu ? `${title} (Субтитры отсутствуют)` : `${title} (No Subtitles Available)`;
      const fallbackText = isRu
        ? `У этого видео на YouTube отсутствуют готовые субтитры.\n\nДля включения автоматического распознавания речи ИИ укажите ваш рабочий Gemini API Key (начинается на AIza...) при запуске Docker контейнера (-e GEMINI_API_KEY="AIzaSy...") или в настройках приложения.`
        : `This YouTube video does not have ready-made subtitles.\n\nTo enable automatic AI Speech-to-Text transcription, please provide a valid Gemini API Key (starts with AIza...) when starting the Docker container (-e GEMINI_API_KEY="AIzaSy...") or in application settings.`;

      // If no AI key set or AI generation fails, return informative localized fallback response
      return res.json({
        title: fallbackTitle,
        text: fallbackText,
        coverUrl: thumbnail,
        youtubeId: videoId,
        youtubeDuration: videoLengthSeconds,
        isFallback: true,
        channelName,
        channelAvatarUrl
      });
    }

    // Join subtitle cue lines with single newline
    const formattedText = lines.join("\n");

    return res.json({
      title: title,
      text: formattedText,
      coverUrl: thumbnail,
      youtubeId: videoId,
      youtubeDuration: videoLengthSeconds,
      channelName,
      channelAvatarUrl
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

// ── YouTube Playlist Metadata Fetcher (Fast & Flat, Subtitles Loaded Lazily) ───────
router.post("/youtube-playlist", async (req, res) => {
  const { url } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL is required" });
  }

  // Extract playlist ID from ?list=... or &list=...
  const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (!listMatch || !listMatch[1]) {
    return res.status(400).json({ error: "No YouTube playlist ID found in URL (missing '?list=...')" });
  }
  const playlistId = listMatch[1];
  const canonicalPlaylistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

  try {
    console.log(`[YouTube Playlist] Fetching full metadata for playlist ${playlistId}...`);

    let title = "YouTube Playlist";
    let description = "";
    let channelTitle = "";
    let thumbnailUrl = "";
    let items: Array<{
      id: string;
      videoId: string;
      title: string;
      durationSeconds: number;
      thumbnailUrl: string;
      publishedAt?: string;
      transcriptLoaded: boolean;
    }> = [];

    // 1. Primary extractor via yt-dlp-exec (Flat playlist, no limits, no audio download)
    try {
      const dlp = getYtDlp();
      const data: any = await (dlp as any)(canonicalPlaylistUrl, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        ignoreErrors: true,
        addHeader: [
          "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language:en-US,en;q=0.9"
        ],
        extractorArgs: "youtube:player_client=android,web",
        noCheckCertificate: true,
      });

      if (data) {
        title = data.title || title;
        description = data.description || "";
        channelTitle = data.uploader || data.channel || data.channel_title || "";
        
        if (data.thumbnails && Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
          thumbnailUrl = data.thumbnails[data.thumbnails.length - 1].url || "";
        }

        const rawEntries = Array.isArray(data.entries) ? data.entries : [];
        items = rawEntries.map((entry: any, idx: number) => {
          const videoId = entry.id || entry.url?.match(/(?:v=|shorts\/|youtu\.be\/)([^&"/?\s]{11})/)?.[1] || "";
          
          let thumb = "";
          if (entry.thumbnails && Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
            thumb = entry.thumbnails[entry.thumbnails.length - 1].url;
          }
          if (!thumb && videoId) {
            thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          }

          return {
            id: `yt_item_${playlistId}_${videoId || idx}`,
            videoId,
            title: entry.title || `Video ${idx + 1}`,
            durationSeconds: typeof entry.duration === "number" ? Math.round(entry.duration) : 0,
            thumbnailUrl: thumb,
            publishedAt: entry.upload_date || entry.timestamp ? String(entry.upload_date || entry.timestamp) : undefined,
            transcriptLoaded: false,
          };
        }).filter(item => !!item.videoId);
      }
    } catch (ytdlpErr) {
      console.warn("[YouTube Playlist] yt-dlp flat playlist extraction had a warning/error, attempting fallback:", ytdlpErr);
    }

    // 2. Fallback if yt-dlp returned 0 items: scrape YouTube HTML page directly
    if (items.length === 0) {
      try {
        const pageRes = await fetch(canonicalPlaylistUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
          }
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const matchTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
            || html.match(/<title>([^<]+)<\/title>/i);
          if (matchTitle && matchTitle[1]) {
            title = matchTitle[1].replace(" - YouTube", "").trim();
          }

          const matchChannel = html.match(/"ownerText"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/i)
            || html.match(/"author"\s*:\s*"([^"]+)"/i);
          if (matchChannel && matchChannel[1]) {
            channelTitle = matchChannel[1];
          }

          // Extract video items from ytInitialData
          const dataMatch = html.match(/var ytInitialData = (\{.+?\});<\/script>/);
          if (dataMatch && dataMatch[1]) {
            const parsed = JSON.parse(dataMatch[1]);
            const sectionContents = parsed?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;
            if (Array.isArray(sectionContents)) {
              for (let i = 0; i < sectionContents.length; i++) {
                const renderer = sectionContents[i]?.playlistVideoRenderer;
                if (!renderer || !renderer.videoId) continue;
                const vId = renderer.videoId;
                const vTitle = renderer.title?.runs?.[0]?.text || `Video ${i + 1}`;
                const durSec = parseInt(renderer.lengthSeconds || "0", 10);
                const thumb = renderer.thumbnail?.thumbnails?.pop()?.url || `https://img.youtube.com/vi/${vId}/hqdefault.jpg`;

                items.push({
                  id: `yt_item_${playlistId}_${vId}`,
                  videoId: vId,
                  title: vTitle,
                  durationSeconds: durSec,
                  thumbnailUrl: thumb,
                  transcriptLoaded: false,
                });
              }
            }
          }
        }
      } catch (scrapeErr) {
        console.error("[YouTube Playlist] HTML scrape fallback error:", scrapeErr);
      }
    }

    if (items.length === 0) {
      return res.status(404).json({
        error: "Could not retrieve videos from this YouTube playlist. Please check that the playlist is public or unlisted.",
      });
    }

    if (!thumbnailUrl && items[0]?.thumbnailUrl) {
      thumbnailUrl = items[0].thumbnailUrl;
    }

    return res.json({
      id: `pl_yt_${playlistId}`,
      title: title || "YouTube Playlist",
      description,
      thumbnailUrl,
      sourceType: "youtube_playlist",
      externalUrl: canonicalPlaylistUrl,
      channelTitle,
      itemCount: items.length,
      language: targetLanguage,
      items,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("YouTube Playlist import error:", err);
    return res.status(500).json({
      error: `Failed to import YouTube playlist: ${err.message || "Unknown error"}`,
    });
  }
});

// Handler for channel metadata resolution (supports /channel-info, /youtube/channel-info, /resolve-channel)
const handleChannelInfo = async (req: any, res: any) => {
  try {
    const rawUrl = req.body?.url || req.body?.channelUrl || req.body?.link || "";
    const rawName = req.body?.channelName || req.body?.title || "";
    const youtubeId = req.body?.youtubeId || "";

    let resolvedName: string | null = (rawName && typeof rawName === "string") ? rawName.trim() : null;
    let resolvedAvatarUrl: string | null = null;
    let resolvedUrl: string | null = (rawUrl && typeof rawUrl === "string") ? rawUrl.trim() : null;

    // 1. If YouTube video ID is provided or URL has a video ID, try oEmbed first
    let vId = youtubeId;
    if (!vId && resolvedUrl) {
      const vMatch = resolvedUrl.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (vMatch) vId = vMatch[1];
    }

    if (vId) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vId}&format=json`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(5000)
        });
        if (oembedRes.ok) {
          const data: any = await oembedRes.json();
          if (data.author_name && !resolvedName) resolvedName = data.author_name;
          if (data.author_url && !resolvedUrl) resolvedUrl = data.author_url;
        }
      } catch (_) {}
    }

    // 2. If channel URL / handle is provided, fetch channel page HTML
    if (resolvedUrl) {
      try {
        let cleanUrl = resolvedUrl;
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          if (cleanUrl.startsWith("@")) {
            cleanUrl = `https://www.youtube.com/${cleanUrl}`;
          } else {
            cleanUrl = `https://www.youtube.com/@${cleanUrl}`;
          }
        }
        resolvedUrl = cleanUrl;

        const chRes = await fetch(cleanUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (chRes.ok) {
          const html = await chRes.text();

          // Extract author/channel title from OpenGraph, title tag, or schema.org
          const titleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i)
                          || html.match(/<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i)
                          || html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            let chTitle = titleMatch[1].replace(/ - YouTube$/, "").trim();
            if (chTitle && (!resolvedName || resolvedName === "__unknown__")) {
              resolvedName = chTitle;
            }
          }

          // Extract avatar from OpenGraph image or Google / YouTube CDN
          const ogImg = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
                     || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
          if (ogImg && ogImg[1]) {
            resolvedAvatarUrl = ogImg[1];
          } else {
            const avatarMatch = html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-=]+/);
            if (avatarMatch) resolvedAvatarUrl = avatarMatch[0];
          }
        }
      } catch (fetchErr: any) {
        console.warn("[handleChannelInfo] Error fetching channel page:", fetchErr?.message);
      }
    }

    if (!resolvedName && !resolvedAvatarUrl) {
      return res.status(404).json({
        ok: false,
        error: "Не удалось найти данные YouTube канала по указанной ссылке. Проверьте адрес канала."
      });
    }

    return res.json({
      ok: true,
      title: resolvedName || "",
      avatar: resolvedAvatarUrl || "",
      channelName: resolvedName || "",
      channelAvatarUrl: resolvedAvatarUrl || "",
      channelUrl: resolvedUrl || "",
    });
  } catch (e: any) {
    console.error("[handleChannelInfo] Error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to resolve channel info" });
  }
};

router.post("/channel-info", handleChannelInfo);
router.post("/youtube/channel-info", handleChannelInfo);
router.post("/resolve-channel", handleChannelInfo);

export default router;
