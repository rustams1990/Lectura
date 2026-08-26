import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import crypto from "crypto";
import { spawn } from "child_process";
import { XMLParser } from "fast-xml-parser";
import { getDbConnection } from "./dbConnection.ts";
import { resolveUserId } from "./auth.ts";
import { resolvePythonExecutable } from "../server/whisper/python_resolver.ts";
import { formatWhisperToLecturaParagraphs, broadcastSse } from "./whisper.ts";

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AUDIO_STORAGE_DIR = path.join(DATA_DIR, "audio_files");

// Ensure audio_files dir exists
if (!fs.existsSync(AUDIO_STORAGE_DIR)) {
  fs.mkdirSync(AUDIO_STORAGE_DIR, { recursive: true });
}

// ── XML Parser for RSS ────────────────────────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["item", "enclosure", "podcast:transcript"].includes(name),
  parseTagValue: true,
  trimValues: true,
});

// ── Language Normalization & Mapping ──────────────────────────────────────────

export const CANONICAL_LANG_NAMES: Record<string, string> = {
  es: "Spanish",
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  pl: "Polish",
  uk: "Ukrainian",
  ar: "Arabic",
  he: "Hebrew",
  el: "Greek",
  sv: "Swedish",
  hi: "Hindi",
  nl: "Dutch",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  hu: "Hungarian",
  cs: "Czech",
  ro: "Romanian",
  vi: "Vietnamese",
  fa: "Persian",
  id: "Indonesian",
  th: "Thai",
};

/**
 * Strict language normalizer: maps any string / code / name to 2-letter ISO code.
 * (e.g. spanish / spa / es-ES / es-MX / español -> es)
 */
export const normalizeLanguageCode = (lang?: string): string => {
  if (!lang) return "";
  const clean = lang.toLowerCase().trim();
  if (clean.startsWith("es") || clean === "spanish" || clean === "spa" || clean.includes("испан") || clean.includes("español")) return "es";
  if (clean.startsWith("en") || clean === "english" || clean === "eng" || clean.includes("англ")) return "en";
  if (clean.startsWith("fr") || clean === "french" || clean === "fra" || clean.includes("франц")) return "fr";
  if (clean.startsWith("de") || clean === "german" || clean === "deu" || clean.includes("немец")) return "de";
  if (clean.startsWith("ru") || clean === "russian" || clean === "rus" || clean.includes("русск")) return "ru";
  if (clean.startsWith("it") || clean === "italian" || clean === "ita" || clean.includes("италь")) return "it";
  if (clean.startsWith("pt") || clean === "portuguese" || clean === "por" || clean.includes("португ")) return "pt";
  if (clean.startsWith("zh") || clean === "chinese" || clean === "chi" || clean.includes("китай")) return "zh";
  if (clean.startsWith("ja") || clean === "japanese" || clean === "jap" || clean.includes("япон")) return "ja";
  if (clean.startsWith("ko") || clean === "korean" || clean === "kor" || clean.includes("корей")) return "ko";
  if (clean.startsWith("tr") || clean === "turkish" || clean === "tur" || clean.includes("турец")) return "tr";
  if (clean.startsWith("uk") || clean === "ukrainian" || clean === "ukr" || clean.includes("украин")) return "uk";
  if (clean.startsWith("ar") || clean === "arabic" || clean === "ara" || clean.includes("араб")) return "ar";
  if (clean.startsWith("he") || clean === "hebrew" || clean === "heb" || clean.includes("иврит")) return "he";
  if (clean.startsWith("el") || clean === "greek" || clean === "gre" || clean.includes("греческ")) return "el";
  if (clean.startsWith("sv") || clean === "swedish" || clean === "swe" || clean.includes("шведск")) return "sv";
  if (clean.startsWith("hi") || clean === "hindi" || clean === "hin" || clean.includes("хинди")) return "hi";
  if (clean.startsWith("nl") || clean === "dutch" || clean === "dut" || clean.includes("нидерланд")) return "nl";
  if (clean.startsWith("pl") || clean === "polish" || clean === "pol" || clean.includes("польск")) return "pl";
  return clean.slice(0, 2) || "";
};

/**
 * Resolves the targetLanguage string to match the user's existing lessons,
 * avoiding duplicate language groups (e.g. "Spanish" vs "es" vs "es-ES").
 */
export function resolveUserTargetLanguage(db: any, userId: string, activeLanguage?: string, fallbackLanguage?: string): string {
  const langCandidate = (activeLanguage && activeLanguage !== "All" && activeLanguage.trim() !== "")
    ? activeLanguage
    : (fallbackLanguage || "es");

  const isoCode = normalizeLanguageCode(langCandidate);

  // 1. Check existing lessons for this user to find matching string
  try {
    const existingLessons = db.prepare(
      "SELECT DISTINCT targetLanguage FROM lessons WHERE user_id = ? AND targetLanguage IS NOT NULL AND targetLanguage != ''"
    ).all(userId) as { targetLanguage: string }[];

    for (const row of existingLessons) {
      if (normalizeLanguageCode(row.targetLanguage) === isoCode) {
        return row.targetLanguage;
      }
    }
  } catch (e) {
    console.warn("[Podcasts] Failed to query existing user languages:", e);
  }

  // 2. Check languages table
  try {
    const dbLang = db.prepare("SELECT code, name FROM languages WHERE code = ?").get(isoCode) as { code: string; name: string } | undefined;
    if (dbLang) {
      return dbLang.name || dbLang.code;
    }
  } catch (_) {}

  // 3. Fallback to activeLanguage if provided, or canonical full name
  if (activeLanguage && activeLanguage !== "All" && activeLanguage.trim() !== "") {
    return activeLanguage;
  }
  return CANONICAL_LANG_NAMES[isoCode] || isoCode;
}

// ── Transcript Parsing Helpers ────────────────────────────────────────────────

function parseWebVTT(vttText: string): string {
  const lines = vttText.split(/\r?\n/);
  const textLines: string[] = [];
  let inHeader = true;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (inHeader) {
      if (line === "" || (!line.startsWith("WEBVTT") && !line.startsWith("NOTE") && !line.includes("-->"))) {
        inHeader = false;
      } else {
        continue;
      }
    }
    if (!line || line.startsWith("NOTE") || line.includes("-->") || /^\d+$/.test(line)) {
      continue;
    }
    const cleanLine = line.replace(/<\/?[^>]+>/g, "").trim();
    if (cleanLine) {
      textLines.push(cleanLine);
    }
  }
  return textLines.join(" ").replace(/\s+/g, " ").trim();
}

function parseSRT(srtText: string): string {
  const lines = srtText.split(/\r?\n/);
  const textLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^\d+$/.test(line) || line.includes("-->")) {
      continue;
    }
    const cleanLine = line.replace(/<\/?[^>]+>/g, "").trim();
    if (cleanLine) {
      textLines.push(cleanLine);
    }
  }
  return textLines.join(" ").replace(/\s+/g, " ").trim();
}

function parseTranscriptJson(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr);
    if (typeof data.text === "string" && data.text.trim()) {
      return data.text.trim();
    }
    if (typeof data.transcript === "string" && data.transcript.trim()) {
      return data.transcript.trim();
    }
    if (Array.isArray(data.segments)) {
      return data.segments.map((s: any) => s.text || s.body || "").join(" ").replace(/\s+/g, " ").trim();
    }
    if (Array.isArray(data.transcripts)) {
      return data.transcripts.map((t: any) => t.text || t.body || "").join(" ").replace(/\s+/g, " ").trim();
    }
    if (Array.isArray(data.words)) {
      return data.words.map((w: any) => w.word || w.text || "").join(" ").replace(/\s+/g, " ").trim();
    }
  } catch {}
  return "";
}

// ── Whisper Transcription Helper ──────────────────────────────────────────────

async function transcribeAudioWithWhisper(audioPath: string, languageCode: string, taskId?: string): Promise<{
  text: string;
  wordTimestampsJson: string | null;
  duration?: number;
} | null> {
  const pythonPath = resolvePythonExecutable();
  if (!pythonPath) return null;

  const workerScript = path.join(process.cwd(), "server", "whisper", "whisper_worker.py");
  if (!fs.existsSync(workerScript)) return null;

  const cacheDir = path.join(process.env.DATA_DIR || process.cwd(), "models", "whisper");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const isoLang = normalizeLanguageCode(languageCode);
  const workerArgs = [
    workerScript,
    audioPath,
    "--model", "base",
    "--threads", "2",
    "--cache-dir", cacheDir,
    "--vad",
  ];

  if (isoLang && isoLang !== "auto") {
    workerArgs.push("--language", isoLang);
  }

  if (taskId) {
    broadcastSse("progress", {
      id: taskId,
      status: "transcribing",
      progress: 5,
      stageText: "Распознавание речи через Whisper...",
    });
  }

  return new Promise((resolve) => {
    try {
      const proc = spawn(pythonPath, workerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1"
        }
      });

      let buffer = "";
      let completedResult: any = null;

      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === "progress" && taskId) {
              broadcastSse("progress", {
                id: taskId,
                status: "transcribing",
                progress: event.percent,
                currentTime: event.currentTime,
                totalDuration: event.totalDuration,
                etaSeconds: event.etaSeconds,
                stageText: "Расшифровка речи",
              });
            } else if (event.type === "completed") {
              completedResult = event;
            }
          } catch (_) {}
        }
      });

      proc.stderr.on("data", (d) => {
        console.warn("[Podcasts Whisper Stderr]:", d.toString());
      });

      proc.on("close", (code) => {
        if (code === 0 && completedResult) {
          const formatted = formatWhisperToLecturaParagraphs(completedResult.segments || []);
          const wordTimestamps: Array<{ w: string; s: number; e: number }> = [];
          for (const seg of (completedResult.segments || [])) {
            for (const w of (seg.words || [])) {
              if (w.word && typeof w.start === "number") {
                wordTimestamps.push({ w: w.word.trim(), s: w.start, e: w.end });
              }
            }
          }
          const wordTimestampsJson = wordTimestamps.length > 0 ? JSON.stringify(wordTimestamps) : null;
          resolve({
            text: formatted || completedResult.text || "",
            wordTimestampsJson,
            duration: completedResult.duration,
          });
        } else {
          console.warn(`[Podcasts Whisper] Exited with code ${code}`);
          resolve(null);
        }
      });

      proc.on("error", (err) => {
        console.error("[Podcasts Whisper] Spawn error:", err);
        resolve(null);
      });
    } catch (e) {
      console.error("[Podcasts Whisper] Execution failed:", e);
      resolve(null);
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDuration(raw: string | number | undefined): number | null {
  if (!raw) return null;
  if (typeof raw === "number") return raw;
  const str = String(raw).trim();
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeResolveUserId(req: Request): string {
  try {
    return resolveUserId(req);
  } catch {
    return "default";
  }
}

const LANG_TO_ITUNES_COUNTRY: Record<string, string> = {
  en: "US",
  es: "ES",
  fr: "FR",
  de: "DE",
  it: "IT",
  pt: "BR",
  ru: "RU",
  zh: "CN",
  ja: "JP",
  ko: "KR",
  pl: "PL",
  tr: "TR",
  uk: "UA",
  ar: "SA",
  nl: "NL",
  sv: "SE",
  no: "NO",
  da: "DK",
  fi: "FI",
  cs: "CZ",
  el: "GR",
  he: "IL",
  hi: "IN",
  hu: "HU",
  id: "ID",
  ro: "RO",
  th: "TH",
  vi: "VN",
};

// ── 1. Search Podcasts (iTunes Search API proxy) ──────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  const q = (req.query.q as string || "").trim();
  const lang = (req.query.lang as string || "").trim();
  const limit = Math.min(Number(req.query.limit) || 24, 50);

  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const buildUrl = (withCountry: boolean) => {
      const params = new URLSearchParams({
        term: q,
        media: "podcast",
        entity: "podcast",
        limit: String(limit),
      });
      if (withCountry && lang) {
        const isoLang = normalizeLanguageCode(lang);
        const countryCode = LANG_TO_ITUNES_COUNTRY[isoLang] || (isoLang.length === 2 ? isoLang.toUpperCase() : "US");
        params.set("country", countryCode);
      }
      return `https://itunes.apple.com/search?${params.toString()}`;
    };

    let response = await fetch(buildUrl(Boolean(lang)), {
      headers: { "User-Agent": "Lectura/1.0" },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    // If request with country failed or returned non-200, retry without country parameter
    if (!response || !response.ok) {
      response = await fetch(buildUrl(false), {
        headers: { "User-Agent": "Lectura/1.0" },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }

    if (!response || !response.ok) {
      return res.status(502).json({ error: "iTunes Search API unavailable" });
    }

    const data = await response.json() as any;
    let rawResults = data.results || [];

    // If results are empty and we used country, try global search without country
    if (rawResults.length === 0 && lang) {
      try {
        const globalRes = await fetch(buildUrl(false), {
          headers: { "User-Agent": "Lectura/1.0" },
          signal: AbortSignal.timeout(6000),
        });
        if (globalRes.ok) {
          const globalData = await globalRes.json() as any;
          if (globalData.results && globalData.results.length > 0) {
            rawResults = globalData.results;
          }
        }
      } catch (_) {}
    }

    const results = rawResults.map((item: any) => ({
      collectionId: item.collectionId,
      title: item.collectionName || item.trackName || "",
      artistName: item.artistName || "",
      feedUrl: item.feedUrl || "",
      artworkUrl600: item.artworkUrl600 || item.artworkUrl100 || "",
      primaryGenreName: item.primaryGenreName || "",
      trackCount: item.trackCount || 0,
    }));

    res.json({ results });
  } catch (err: any) {
    console.error("[Podcasts] Search error:", err);
    res.status(500).json({ error: "Failed to search podcasts" });
  }
});

// ── 2. Subscriptions CRUD ─────────────────────────────────────────────────────

router.get("/subscriptions", (req: Request, res: Response) => {
  try {
    const userId = safeResolveUserId(req);
    const db = getDbConnection("default");
    const subs = db.prepare(
      "SELECT * FROM podcast_subscriptions WHERE user_id = ? ORDER BY created_at DESC"
    ).all(userId) as any[];

    res.json({ subscriptions: subs.map(s => ({
      id: s.id,
      title: s.title,
      author: s.author,
      feedUrl: s.feed_url,
      artworkUrl: s.artwork_url,
      language: normalizeLanguageCode(s.language),
      createdAt: s.created_at,
    })) });
  } catch (err: any) {
    console.error("[Podcasts] Get subscriptions error:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

router.post("/subscriptions", async (req: Request, res: Response) => {
  try {
    const userId = safeResolveUserId(req);
    const { title, author, feedUrl, artworkUrl, language } = req.body;

    if (!title || !feedUrl) {
      return res.status(400).json({ error: "title and feedUrl are required" });
    }

    let normalizedLang = normalizeLanguageCode(language);
    if (!normalizedLang && feedUrl) {
      try {
        const feed = await fetchAndParseFeed(feedUrl, { limit: 1 });
        if (feed?.meta?.language) {
          normalizedLang = normalizeLanguageCode(feed.meta.language);
        }
      } catch (_) {}
    }
    if (!normalizedLang) normalizedLang = "en";

    const db = getDbConnection("default");
    const id = crypto.randomUUID();
    const now = Date.now();

    try {
      db.prepare(
        `INSERT INTO podcast_subscriptions (id, user_id, title, author, feed_url, artwork_url, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, title, author || "", feedUrl, artworkUrl || "", normalizedLang, now);
    } catch (e: any) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE" || String(e).includes("UNIQUE")) {
        const existing = db.prepare(
          "SELECT * FROM podcast_subscriptions WHERE user_id = ? AND feed_url = ?"
        ).get(userId, feedUrl) as any;
        if (existing) {
          return res.json({ subscription: {
            id: existing.id, title: existing.title, author: existing.author,
            feedUrl: existing.feed_url, artworkUrl: existing.artwork_url,
            language: normalizeLanguageCode(existing.language) || normalizedLang, createdAt: existing.created_at,
          }, alreadyExists: true });
        }
      }
      throw e;
    }

    timelineCache.delete(userId);
    res.json({ subscription: { id, title, author: author || "", feedUrl, artworkUrl: artworkUrl || "", language: normalizedLang, createdAt: now } });
  } catch (err: any) {
    console.error("[Podcasts] Subscribe error:", err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// ── 3. Feed Parsing Helper & In-Memory Timeline Cache ─────────────────────────

interface TimelineCacheEntry {
  episodes: any[];
  timestamp: number;
}
const timelineCache = new Map<string, TimelineCacheEntry>();
const TIMELINE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchAndParseFeed(feedUrl: string, options: { limit?: number } = {}): Promise<{
  meta: {
    title: string;
    description: string;
    language: string;
    artworkUrl: string;
    author: string;
    link: string;
  };
  episodes: any[];
}> {
  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(feedUrl);
  } catch {
    decodedUrl = feedUrl;
  }

  if (!decodedUrl.startsWith("http://") && !decodedUrl.startsWith("https://")) {
    throw new Error("Invalid feed URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let feedResponse: Awaited<ReturnType<typeof fetch>>;
  try {
    feedResponse = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "Lectura Podcast Reader/1.0 (compatible; RSS)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!feedResponse.ok) {
    throw new Error(`Feed server returned HTTP ${feedResponse.status}`);
  }

  const xmlText = await feedResponse.text();
  const parsed = xmlParser.parse(xmlText);

  const channel = parsed?.rss?.channel || parsed?.feed || {};
  let rawItems: any[] = Array.isArray(channel.item)
    ? channel.item
    : channel.item ? [channel.item] : [];

  if (options.limit && options.limit > 0) {
    rawItems = rawItems.slice(0, options.limit);
  }

  const rawLang = channel.language || "";
  const normalizedChannelLang = normalizeLanguageCode(rawLang);

  const meta = {
    title: channel.title || "",
    description: stripHtml(channel.description || channel["itunes:summary"] || ""),
    language: normalizedChannelLang,
    artworkUrl: channel["itunes:image"]?.["@_href"] || channel.image?.url || "",
    author: channel["itunes:author"] || channel["managingEditor"] || "",
    link: channel.link || "",
  };

  const episodes = rawItems.map((item: any) => {
    const enclosures: any[] = Array.isArray(item.enclosure)
      ? item.enclosure
      : item.enclosure ? [item.enclosure] : [];

    const audioEnclosure = enclosures.find(
      (e: any) => e["@_type"]?.startsWith("audio/") || e["@_url"]
    );
    const rawAudioUrl: string = audioEnclosure?.["@_url"] || "";

    const audioUrl = rawAudioUrl.startsWith("http://")
      ? rawAudioUrl.replace("http://", "https://")
      : rawAudioUrl;

    const originalAudioUrl = rawAudioUrl;

    const transcripts: any[] = Array.isArray(item["podcast:transcript"])
      ? item["podcast:transcript"]
      : item["podcast:transcript"] ? [item["podcast:transcript"]] : [];

    let chosenTranscriptUrl = "";
    let chosenTranscriptType: "vtt" | "srt" | "json" | "text" | null = null;

    for (const t of transcripts) {
      const url = (t["@_url"] || "").trim();
      const type = (t["@_type"] || "").toLowerCase();
      if (!url) continue;

      const isVtt = type.includes("vtt") || url.endsWith(".vtt");
      const isSrt = type.includes("srt") || url.endsWith(".srt");
      const isJson = type.includes("json") || url.endsWith(".json");

      if (isVtt || isSrt || isJson || type.includes("text")) {
        chosenTranscriptUrl = url.startsWith("http://") ? url.replace("http://", "https://") : url;
        chosenTranscriptType = isVtt ? "vtt" : isSrt ? "srt" : isJson ? "json" : "text";
        break;
      }
    }

    const durationSec = parseDuration(item["itunes:duration"] || item.duration);
    const itemArtwork = item["itunes:image"]?.["@_href"] || "";

    return {
      guid: String(item.guid?.["#text"] || item.guid || item.link || rawAudioUrl || Math.random()),
      title: item.title || "",
      pubDate: item.pubDate || "",
      duration: durationSec,
      description: stripHtml(item.description || item["itunes:summary"] || ""),
      audioUrl,
      originalAudioUrl,
      transcriptUrl: chosenTranscriptUrl,
      transcriptType: chosenTranscriptType,
      hasTranscript: Boolean(chosenTranscriptUrl),
      artworkUrl: itemArtwork,
      fileSize: Number(audioEnclosure?.["@_length"]) || null,
    };
  });

  return { meta, episodes };
}

// ── GET /api/podcasts/timeline (Aggregated latest episodes from all subscriptions) ─
router.get("/timeline", async (req: Request, res: Response) => {
  try {
    const userId = safeResolveUserId(req);
    const forceRefresh = req.query.refresh === "true";

    // 1. Check in-memory cache
    const cached = timelineCache.get(userId);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < TIMELINE_CACHE_TTL) {
      return res.json({ episodes: cached.episodes, fromCache: true });
    }

    // 2. Fetch user subscriptions
    const db = getDbConnection("default");
    const subscriptions = db.prepare(
      "SELECT * FROM podcast_subscriptions WHERE user_id = ? ORDER BY created_at DESC"
    ).all(userId) as any[];

    if (!subscriptions || subscriptions.length === 0) {
      timelineCache.set(userId, { episodes: [], timestamp: Date.now() });
      return res.json({ episodes: [] });
    }

    // 3. Parallel fetch & parse with Promise.allSettled
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const feed = await fetchAndParseFeed(sub.feed_url, { limit: 5 });
          const detectedFeedLang = normalizeLanguageCode(feed.meta.language) || normalizeLanguageCode(sub.language) || "en";
          return feed.episodes.map(ep => ({
            ...ep,
            podcastId: sub.id,
            podcastTitle: sub.title || feed.meta.title,
            podcastArtwork: sub.artwork_url || feed.meta.artworkUrl,
            podcastAuthor: sub.author || feed.meta.author,
            podcastLanguage: detectedFeedLang,
            feedUrl: sub.feed_url,
          }));
        } catch (e) {
          console.warn(`[Podcasts Timeline] Failed to fetch feed ${sub.feed_url}:`, e);
          return [];
        }
      })
    );

    // 4. Flatten, sort by pubDate desc, and slice top 50
    const allEpisodes = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap(r => r.value)
      .sort((a, b) => {
        const timeA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const timeB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 50);

    // 5. Cache result
    timelineCache.set(userId, {
      episodes: allEpisodes,
      timestamp: Date.now(),
    });

    res.json({ episodes: allEpisodes });
  } catch (err: any) {
    console.error("[Podcasts Timeline] Error:", err);
    res.status(500).json({ error: "Failed to generate timeline" });
  }
});

// ── GET /api/podcasts/feed ───────────────────────────────────────────────────
router.get("/feed", async (req: Request, res: Response) => {
  const feedUrl = (req.query.url as string || "").trim();
  if (!feedUrl) {
    return res.status(400).json({ error: "Query parameter 'url' is required" });
  }

  try {
    const result = await fetchAndParseFeed(feedUrl);
    res.json(result);
  } catch (err: any) {
    console.error("[Podcasts Feed] Error:", err);
    res.status(500).json({ error: err.message || "Failed to parse RSS feed" });
  }
});

router.delete("/subscriptions/:id", (req: Request, res: Response) => {
  try {
    const userId = safeResolveUserId(req);
    const { id } = req.params;
    const db = getDbConnection("default");

    const result = db.prepare(
      "DELETE FROM podcast_subscriptions WHERE id = ? AND user_id = ?"
    ).run(id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    timelineCache.delete(userId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Podcasts] Unsubscribe error:", err);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});


// ── 4. Import Episode to Library ──────────────────────────────────────────────
router.post("/import-episode", async (req: Request, res: Response) => {
  const {
    guid,
    title,
    audioUrl,
    originalAudioUrl,
    transcriptUrl,
    description,
    artworkUrl,
    podcastTitle,
    language,
    activeLanguage,
    currentLanguage,
    duration,
    pubDate,
    taskId,
  } = req.body;

  if (!audioUrl || !title) {
    return res.status(400).json({ error: "audioUrl and title are required" });
  }

  const userId = safeResolveUserId(req);
  const db = getDbConnection("default");
  const lessonId = `podcast_${crypto.randomUUID()}`;
  const safeFilename = lessonId;

  // Determine file extension
  const urlForExt = audioUrl.split("?")[0];
  const extMatch = urlForExt.match(/\.(mp3|m4a|aac|ogg|opus|wav|webm)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : "mp3";
  const audioFilename = `${safeFilename}.${ext}`;
  const audioFilePath = path.join(AUDIO_STORAGE_DIR, audioFilename);
  const storedAudioUrl = `/api/audio-files/${audioFilename}`;

  try {
    // ── Step 1: Stream download audio to disk ─────────────────────────────
    const urlsToTry: string[] = [audioUrl];
    if (originalAudioUrl && originalAudioUrl !== audioUrl) {
      urlsToTry.push(originalAudioUrl);
    }

    let downloadSuccess = false;
    let lastError: any;

    for (const tryUrl of urlsToTry) {
      try {
        const audioResp = await fetch(tryUrl, {
          headers: { "User-Agent": "Lectura/1.0" },
          signal: AbortSignal.timeout(120_000),
        });

        if (!audioResp.ok) {
          lastError = new Error(`HTTP ${audioResp.status} from ${tryUrl}`);
          continue;
        }

        if (!audioResp.body) {
          lastError = new Error("No response body");
          continue;
        }

        const { Readable } = await import("stream");
        const fileStream = fs.createWriteStream(audioFilePath);
        await pipeline(Readable.fromWeb(audioResp.body as any), fileStream);
        downloadSuccess = true;
        break;
      } catch (e) {
        lastError = e;
        if (fs.existsSync(audioFilePath)) {
          try { fs.unlinkSync(audioFilePath); } catch {}
        }
      }
    }

    if (!downloadSuccess) {
      throw lastError || new Error("Audio download failed");
    }

    // ── Step 2: Language Resolution ───────────────────────────────────────
    const effectiveActiveLanguage = activeLanguage || currentLanguage;
    const resolvedTargetLanguage = resolveUserTargetLanguage(db, userId, effectiveActiveLanguage, language);
    const targetIso = normalizeLanguageCode(resolvedTargetLanguage);

    // ── Step 3: Transcript Resolution (RSS Transcript vs Whisper) ─────────
    let lessonText = "";
    let hasValidTranscript = false;
    let wordTimestampsJson: string | null = null;
    let transcriptionMethod: "rss_transcript" | "whisper" | "show_notes" = "show_notes";

    // 3.1 Check for RSS Transcript file
    if (transcriptUrl) {
      try {
        const tResp = await fetch(transcriptUrl, {
          headers: { "User-Agent": "Lectura/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (tResp.ok) {
          const raw = await tResp.text();
          if (raw && raw.trim().length > 30) {
            const lowerUrl = transcriptUrl.toLowerCase();
            if (lowerUrl.endsWith(".vtt") || raw.includes("WEBVTT")) {
              lessonText = parseWebVTT(raw);
            } else if (lowerUrl.endsWith(".srt") || raw.includes("-->")) {
              lessonText = parseSRT(raw);
            } else if (lowerUrl.endsWith(".json") || raw.startsWith("{") || raw.startsWith("[")) {
              lessonText = parseTranscriptJson(raw);
            } else {
              lessonText = raw.slice(0, 100000).trim();
            }

            if (lessonText.length > 30) {
              hasValidTranscript = true;
              transcriptionMethod = "rss_transcript";
            }
          }
        }
      } catch (e) {
        console.warn("[Podcasts] RSS transcript fetch failed:", e);
      }
    }

    // 3.2 If no transcript in RSS, run Whisper Speech-to-Text Pipeline
    if (!hasValidTranscript) {
      console.log(`[Podcasts] No RSS transcript found for "${title}". Triggering Faster-Whisper (${targetIso})...`);
      try {
        const whisperResult = await transcribeAudioWithWhisper(audioFilePath, targetIso, taskId);
        if (whisperResult && whisperResult.text && whisperResult.text.trim().length > 30) {
          lessonText = whisperResult.text;
          wordTimestampsJson = whisperResult.wordTimestampsJson;
          hasValidTranscript = true;
          transcriptionMethod = "whisper";
          console.log(`[Podcasts] Whisper transcription successful for "${title}" (${lessonText.length} chars)`);
        }
      } catch (whisperErr) {
        console.warn("[Podcasts] Whisper STT pipeline failed (fallback to show notes):", whisperErr);
      }
    }

    // 3.3 Fallback to Show Notes if both failed
    if (!hasValidTranscript || !lessonText) {
      const cleanDesc = description ? description.trim() : "";
      lessonText = `[Show Notes / Описание выпуска]\n\n${cleanDesc || title}`;
      transcriptionMethod = "show_notes";
    }

    // ── Step 4: Create Lesson Record in SQLite ─────────────────────────────
    const now = Date.now();
    const cleanTitle = (title || "").trim();
    const cleanPodcastTitle = (podcastTitle || "").trim();
    const cleanArtworkUrl = (artworkUrl || "").trim();

    const origGuid = (guid || req.body.episodeId || "").trim();
    const origAudio = (originalAudioUrl || audioUrl || "").trim();

    db.prepare(`
      INSERT INTO lessons (id, user_id, title, text, audioUrl, targetLanguage, translationLanguage,
        lessonType, coverUrl, channelName, wordTimestamps, playlistId, channelUrl, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'podcast', ?, ?, ?, ?, ?, ?)
    `).run(
      lessonId,
      userId,
      cleanTitle,
      lessonText,
      storedAudioUrl,
      resolvedTargetLanguage,
      "English",
      cleanArtworkUrl || null,
      cleanPodcastTitle || null,
      wordTimestampsJson,
      null,
      origAudio || null,
      now
    );

    res.json({
      ok: true,
      lessonId,
      audioUrl: storedAudioUrl,
      targetLanguage: resolvedTargetLanguage,
      hasTranscript: hasValidTranscript,
      transcriptionMethod,
    });
  } catch (err: any) {
    if (fs.existsSync(audioFilePath)) {
      try { fs.unlinkSync(audioFilePath); } catch {}
    }
    console.error("[Podcasts] Import episode error:", err);
    res.status(500).json({ error: err.message || "Failed to import episode" });
  }
});

// ── 5. Channel Analytics Endpoint (Case-insensitive aggregation) ──────────────
// GET /api/podcasts/stats/channels
router.get("/stats/channels", (req: Request, res: Response) => {
  try {
    const userId = safeResolveUserId(req);
    const db = getDbConnection("default");

    const rows = db.prepare(`
      SELECT 
        MAX(channelName) AS display_name,
        COALESCE(
          MAX(CASE WHEN channelAvatarUrl IS NOT NULL AND channelAvatarUrl != '' THEN channelAvatarUrl END),
          MAX(CASE WHEN youtubeId IS NOT NULL OR lessonType = 'youtube' THEN coverUrl END),
          MAX(coverUrl)
        ) AS avatar_url,
        COUNT(id) AS total_items
      FROM lessons
      WHERE user_id = ? AND channelName IS NOT NULL AND TRIM(channelName) != ''
      GROUP BY LOWER(TRIM(channelName))
      ORDER BY total_items DESC
    `).all(userId) as any[];

    res.json({
      channels: rows.map(r => ({
        name: r.display_name,
        avatarUrl: r.avatar_url,
        totalItems: r.total_items,
      })),
    });
  } catch (err: any) {
    console.error("[Podcasts] Channels stats error:", err);
    res.status(500).json({ error: "Failed to fetch channel stats" });
  }
});

export default router;
