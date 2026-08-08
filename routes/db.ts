import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { getDbConnection, SQLITE_DB_PATH } from "./dbConnection.ts";
import { resolveUserId, requireLocalSyncKey, requireAuth } from "./auth.ts";

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AUDIO_STORAGE_DIR = path.join(DATA_DIR, "audio_files");

// Helper to offload heavy base64 audio payload from DB/RAM into static MP3 files on disk
function saveAudioBase64ToDisk(lessonId: string, base64OrDataUrl: string): string | null {
  try {
    if (!fs.existsSync(AUDIO_STORAGE_DIR)) {
      fs.mkdirSync(AUDIO_STORAGE_DIR, { recursive: true });
    }
    const cleanBase64 = base64OrDataUrl.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (buffer.length === 0) return null;

    let ext = "mp3";
    if (base64OrDataUrl.startsWith("data:audio/wav")) ext = "wav";
    else if (base64OrDataUrl.startsWith("data:audio/ogg")) ext = "ogg";
    else if (base64OrDataUrl.startsWith("data:audio/m4a") || base64OrDataUrl.startsWith("data:audio/mp4")) ext = "m4a";

    const fileName = `${lessonId}.${ext}`;
    const filePath = path.join(AUDIO_STORAGE_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    return `/api/audio-files/${fileName}`;
  } catch (err) {
    console.error(`[saveAudioBase64ToDisk] Failed to save audio for lesson ${lessonId}:`, err);
    return null;
  }
}

// Helper to clean word prefix (e.g. 'spanish_hola' -> 'hola')
function cleanWordPrefix(word: string): string {
  if (typeof word !== "string") return "";
  return word.replace(/^[a-zA-Z]+_/, "");
}

// Helper for Dictionary Language Code Resolution
function getLangCode(langName: string): string {
  const norm = (langName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "английский") return "en";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "испанский") return "es";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "французский") return "fr";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "немецкий") return "de";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "итальянский") return "it";
  if (norm.startsWith("ru") || norm === "русский") return "ru";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "португальский") return "pt";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "турецкий") return "tr";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "японский") return "ja";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "китайский") return "zh";
  if (norm.startsWith("ar") || norm === "арабский") return "ar";
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "украинский" || norm === "українська" || norm === "український") return "uk";
  return "en";
}

// Keyless freedictionaryapi.com Fetcher
async function fetchFreeDictionaryFromCom(word: string, langCode: string) {
  try {
    const url = `https://freedictionaryapi.com/api/v1/entries/${langCode}/${encodeURIComponent(word)}?translations=true`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      return data;
    }
  } catch (e) {
    console.error("freedictionaryapi.com fetch failed for word:", word, e);
  }
  return null;
}

// Keyless Free Dictionary API Fetcher
async function fetchFreeDictionary(word: string, langCode: string) {
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch (e) {
    console.error("Free Dictionary API fetch failed for word:", word, e);
  }
  return null;
}

// Keyless Wiktionary REST Definition API Fetcher
async function fetchWiktionary(word: string, langCode: string) {
  try {
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error("Wiktionary API 'en' fetch failed for word:", word, e);
  }

  if (langCode !== "en") {
    try {
      const fallbackUrl = `https://${langCode}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
      const response = await fetch(fallbackUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Wiktionary fallback fetch failed for word:", word, e);
    }
  }
  return null;
}

// Keyless Google Translate Fetcher
async function fetchGoogleTranslate(text: string, fromLang: string, toLang: string, getAlternatives = false): Promise<string | null> {
  try {
    const dtParams = getAlternatives ? "dt=t&dt=at&dt=bd" : "dt=t";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&${dtParams}&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;

    let primary = "";
    if (data[0] && Array.isArray(data[0])) {
      primary = data[0].map((x: any) => x[0]).join("").trim();
    }

    if (getAlternatives) {
      const alts: string[] = [];
      if (primary) {
        alts.push(primary);
      }

      if (data[1] && Array.isArray(data[1])) {
        for (const posBlock of data[1]) {
          if (posBlock && Array.isArray(posBlock[1])) {
            for (const word of posBlock[1]) {
              if (typeof word === "string" && word.trim()) {
                const clean = word.trim();
                if (!alts.some(w => w.toLowerCase() === clean.toLowerCase())) {
                  alts.push(clean);
                }
              }
            }
          }
        }
      }

      if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
        for (const item of data[5][0][2]) {
          if (item && typeof item[0] === "string" && item[0].trim()) {
            const clean = item[0].trim();
            if (!alts.some(w => w.toLowerCase() === clean.toLowerCase())) {
              alts.push(clean);
            }
          }
        }
      }

      if (alts.length > 0) {
        return alts.slice(0, 5).join(", ");
      }
    }

    return primary || null;
  } catch (e) {
    console.error("Google Translate fetch failed:", e);
  }
  return null;
}

// Read helper safely
export function getLocalServerDb(userId: string = "default") {
  try {
    const db = getDbConnection(userId);
    
    const wordsStmt = db.prepare("SELECT count(*) as count FROM words");
    const wordsResult = wordsStmt.get() as { count: number };
    const lessonsStmt = db.prepare("SELECT count(*) as count FROM lessons");
    const lessonsResult = lessonsStmt.get() as { count: number };

    console.log(`[getLocalServerDb] userId: "${userId}", words count: ${wordsResult.count}, lessons count: ${lessonsResult.count}`);
    
    if (wordsResult.count === 0 && lessonsResult.count === 0) {
      console.log(`[getLocalServerDb] Database for "${userId}" is empty, returning null to trigger seeding.`);
      return null;
    }

    const metaStmt = db.prepare("SELECT value FROM metadata WHERE key = 'listeningSeconds'");
    const listeningRow = metaStmt.get() as { value: string } | undefined;
    const listeningSeconds = listeningRow ? parseFloat(listeningRow.value) || 0 : 0;

    const langStmt = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL");
    const langRows = langStmt.all() as { code: string; flag: string }[];
    const languageFlags: Record<string, string> = {};
    for (const row of langRows) {
      languageFlags[row.code] = row.flag;
    }

    const lessonsRows = db.prepare("SELECT * FROM lessons").all() as any[];
    const updateAudioStmt = db.prepare("UPDATE lessons SET audioUrl = ?, audioBase64 = NULL WHERE id = ?");

    const lessons = lessonsRows.map((l) => {
      let currentAudioUrl = l.audioUrl;
      let currentAudioBase64 = l.audioBase64;

      // Automatic Migration: If SQLite contains legacy base64 string, offload to disk file and clear base64 from DB/RAM
      if (currentAudioBase64 && typeof currentAudioBase64 === "string" && currentAudioBase64.length > 50) {
        const savedFileUrl = saveAudioBase64ToDisk(l.id, currentAudioBase64);
        if (savedFileUrl) {
          currentAudioUrl = savedFileUrl;
          currentAudioBase64 = null;
          try {
            updateAudioStmt.run(savedFileUrl, l.id);
          } catch (e) {}
        }
      }

      return {
        id: l.id,
        title: l.title,
        text: l.text,
        audioUrl: currentAudioUrl,
        audioBase64: null, // Never send giant Base64 strings to frontend to save RAM!
        targetLanguage: l.targetLanguage,
        translationLanguage: l.translationLanguage,
        isBuiltIn: l.isBuiltIn === 1,
        isArchived: l.isArchived === 1,
        coverUrl: l.coverUrl,
        youtubeId: l.youtubeId,
        lessonType: l.lessonType,
        pinned: l.pinned === 1,
        translationText: l.translationText,
        detectedPhrases: l.detectedPhrases ? JSON.parse(l.detectedPhrases) : {},
        difficulty: l.difficulty,
        difficultyExplanation: l.difficultyExplanation,
      };
    });

    const lessonTypes = db.prepare("SELECT * FROM lesson_types").all() as any[];

    const wordsRows = db.prepare("SELECT * FROM words").all() as any[];
    const lingqs: Record<string, any> = {};
    for (const w of wordsRows) {
      lingqs[w.id] = {
        word: w.word,
        translation: w.translation || "",
        ipa: w.ipa || "",
        grammar: w.grammar || "",
        contextRelation: w.contextRelation || "",
        status: w.status,
        createdAt: w.createdAt,
        tags: w.tags ? JSON.parse(w.tags) : [],
        imageUrl: w.imageUrl,
        examples: w.examples ? JSON.parse(w.examples) : [],
        spellingCorrectCount: w.spellingCorrectCount || 0,
        spellingIncorrectCount: w.spellingIncorrectCount || 0,
        spellingAccentCount: w.spellingAccentCount || 0,
        lastSpelledCorrectly: w.lastSpelledCorrectly === 1 ? true : (w.lastSpelledCorrectly === 0 ? false : null),
        lastSpelledWithAccentError: w.lastSpelledWithAccentError === 1,
        spellingExclude: w.spellingExclude === 1,
      };
    }

    const linksRows = db.prepare("SELECT language_code, word_from, word_to FROM word_links").all() as any[];
    const wordLinks: Record<string, string> = {};
    for (const link of linksRows) {
      const lang = link.language_code;
      if (lang && lang !== "null") {
        wordLinks[`${lang}_${link.word_from}`] = `${lang}_${link.word_to}`;
      }
    }

    let history: any[] = [];
    try {
      const historyRows = db.prepare("SELECT * FROM reading_history ORDER BY timestamp DESC").all() as any[];
      history = historyRows.map((h) => ({
        id: h.id,
        lessonId: h.lessonId,
        lessonTitle: h.lessonTitle,
        lessonType: h.lessonType || "article",
        coverUrl: h.coverUrl || null,
        targetLanguage: h.targetLanguage,
        timestamp: h.timestamp,
        actionType: h.actionType,
        status: h.status || "in_progress",
        durationSeconds: h.durationSeconds || 0,
        notes: h.notes || undefined,
      }));
    } catch (_) {}

    const progressRows = db.prepare("SELECT key, value FROM metadata WHERE key LIKE 'youtube_progress_%' OR key LIKE 'vocab_progress_%'").all() as { key: string; value: string }[];
    const videoProgress: Record<string, string> = {};
    const readingProgress: Record<string, string> = {};
    for (const row of progressRows) {
      if (row.key.startsWith("youtube_progress_")) {
        videoProgress[row.key.replace("youtube_progress_", "")] = row.value;
      } else if (row.key.startsWith("vocab_progress_")) {
        readingProgress[row.key.replace("vocab_progress_", "")] = row.value;
      }
    }

    return {
      lessons,
      lessonTypes,
      vocab: lingqs,
      wordLinks,
      listeningSeconds,
      languageFlags,
      history,
      videoProgress,
      readingProgress,
    };
  } catch (e) {
    console.error("Error loading SQLite database data:", e);
    return null;
  }
}

// Write helper safely using a single SQLite transaction
export function saveLocalServerDb(userId: string = "default", data: any) {
  try {
    console.log(`[saveLocalServerDb] Attempting to save for userId: "${userId}"`);
    console.log(`[saveLocalServerDb] Data details - lessons: ${(data.lessons || []).length}, vocab words: ${Object.keys(data.vocab || data.lingqs || {}).length}`);
    const db = getDbConnection(userId);

    const insertLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET flag=excluded.flag
    `);

    const ensureLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `);

    const insertWord = db.prepare(`
      INSERT OR REPLACE INTO words (
        id, language_code, word, translation, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples, spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWordLink = db.prepare(`
      INSERT OR REPLACE INTO word_links (language_code, word_from, word_to) VALUES (?, ?, ?)
    `);

    const insertLesson = db.prepare(`
      INSERT OR REPLACE INTO lessons (
        id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLessonType = db.prepare(`
      INSERT OR REPLACE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)
    `);

    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)
    `);

    db.transaction(() => {
      const flags = data.languageFlags || {};
      for (const [lang, flag] of Object.entries(flags)) {
        const name = lang.charAt(0).toUpperCase() + lang.slice(1);
        insertLanguage.run(lang, name, flag as string);
      }

      const lingqs = data.vocab || data.lingqs || {};
      for (const [key, value] of Object.entries(lingqs)) {
        const match = key.match(/^([a-zA-Z]+)_(.*)$/);
        const lang = match ? match[1] : "english";
        const val = value as any;
        const wordVal = cleanWordPrefix(val.word || (match ? match[2] : key));

        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));

        insertWord.run(
          key,
          lang,
          wordVal,
          val.translation || "",
          val.ipa || "",
          val.grammar || "",
          val.contextRelation || "",
          val.status || "known",
          val.createdAt || Date.now(),
          JSON.stringify(val.tags || []),
          val.imageUrl || null,
          JSON.stringify(val.examples || []),
          val.spellingCorrectCount || 0,
          val.spellingIncorrectCount || 0,
          val.spellingAccentCount || 0,
          val.lastSpelledCorrectly !== undefined ? (val.lastSpelledCorrectly === true ? 1 : (val.lastSpelledCorrectly === false ? 0 : null)) : null,
          val.lastSpelledWithAccentError ? 1 : 0,
          val.spellingExclude ? 1 : 0
        );
      }

      const links = data.wordLinks || {};
      for (const [key, val] of Object.entries(links)) {
        const matchKey = key.match(/^([a-zA-Z]+)_(.*)$/);
        const matchVal = (val as string).match(/^([a-zA-Z]+)_(.*)$/);
        
        if (!matchKey && !matchVal) {
          continue;
        }

        const lang = matchKey ? matchKey[1] : matchVal![1];
        const cleanFrom = cleanWordPrefix(key);
        const cleanTo = cleanWordPrefix(val as string);

        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
        insertWordLink.run(lang, cleanFrom, cleanTo);
      }

      if (data.deletedLessonIds && Array.isArray(data.deletedLessonIds) && data.deletedLessonIds.length > 0) {
        const placeholders = data.deletedLessonIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM lessons WHERE id IN (${placeholders})`).run(...data.deletedLessonIds);
      }

      const lessons = data.lessons || [];

      for (const l of lessons) {
        let finalAudioUrl = l.audioUrl || null;
        let finalAudioBase64 = null; // Clear base64 from RAM & DB

        if (l.audioBase64 && typeof l.audioBase64 === "string" && l.audioBase64.length > 50) {
          const savedUrl = saveAudioBase64ToDisk(l.id, l.audioBase64);
          if (savedUrl) {
            finalAudioUrl = savedUrl;
          }
        }

        const existingLesson = db.prepare("SELECT isArchived, pinned FROM lessons WHERE id = ?").get(l.id) as any;
        let finalIsArchived = l.isArchived ? 1 : 0;
        let finalPinned = l.pinned ? 1 : 0;
        if (l.isArchived === undefined && existingLesson) {
          finalIsArchived = existingLesson.isArchived || 0;
        }
        if (l.pinned === undefined && existingLesson) {
          finalPinned = existingLesson.pinned || 0;
        }

        insertLesson.run(
          l.id,
          l.title,
          l.text,
          finalAudioUrl,
          finalAudioBase64,
          l.targetLanguage,
          l.translationLanguage,
          l.isBuiltIn ? 1 : 0,
          finalIsArchived,
          l.coverUrl || null,
          l.youtubeId || null,
          l.lessonType || null,
          finalPinned,
          l.translationText || null,
          JSON.stringify(l.detectedPhrases || {}),
          l.difficulty || null,
          l.difficultyExplanation || null
        );
      }

      const types = data.lessonTypes || [];
      if (Array.isArray(data.lessonTypes)) {
        const currentTypeIds = types.map((t: any) => t.id).filter(Boolean);
        if (currentTypeIds.length > 0) {
          const placeholders = currentTypeIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM lesson_types WHERE id NOT IN (${placeholders})`).run(...currentTypeIds);
        } else {
          db.prepare(`DELETE FROM lesson_types`).run();
        }
      }

      for (const t of types) {
        insertLessonType.run(t.id, t.name, t.icon);
      }

      if (data.listeningSeconds !== undefined) {
        insertMetadata.run("listeningSeconds", String(data.listeningSeconds));
      }

      if (data.videoProgress && typeof data.videoProgress === "object") {
        for (const [lessonId, val] of Object.entries(data.videoProgress)) {
          if (val !== undefined && val !== null) {
            insertMetadata.run(`youtube_progress_${lessonId}`, String(val));
          }
        }
      }

      if (data.readingProgress && typeof data.readingProgress === "object") {
        for (const [lessonId, val] of Object.entries(data.readingProgress)) {
          if (val !== undefined && val !== null) {
            insertMetadata.run(`vocab_progress_${lessonId}`, String(val));
          }
        }
      }

      const insertHistory = db.prepare(`
        INSERT OR REPLACE INTO reading_history (
          id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const historyList = data.history || [];
      if (Array.isArray(data.history)) {
        const currentHistoryIds = historyList.map((h: any) => h?.id).filter(Boolean);
        if (currentHistoryIds.length > 0) {
          const placeholders = currentHistoryIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM reading_history WHERE id NOT IN (${placeholders})`).run(...currentHistoryIds);
        } else {
          db.prepare(`DELETE FROM reading_history`).run();
        }
      }

      if (Array.isArray(historyList) && historyList.length > 0) {
        for (const h of historyList) {
          if (!h || !h.id || !h.lessonId) continue;
          insertHistory.run(
            h.id,
            h.lessonId,
            h.lessonTitle || "Занятие",
            h.lessonType || null,
            h.coverUrl || null,
            h.targetLanguage || "english",
            h.timestamp || new Date().toISOString(),
            h.actionType || "read",
            h.status || "in_progress",
            h.durationSeconds || 0,
            h.notes || null
          );
        }
      }
    })();

    console.log(`[saveLocalServerDb] Transaction successfully committed for userId: "${userId}"`);
    return true;
  } catch (e) {
    console.error(`[saveLocalServerDb] Error saving SQLite database for "${userId}":`, e);
    return false;
  }
}

// Temporary store for local Wi-Fi fast data synchronization (expires after 15 mins)
interface SyncSession {
  data: any;
  createdAt: number;
}
const localSyncSessions = new Map<string, SyncSession>();

setInterval(() => {
  const now = Date.now();
  for (const [code, session] of localSyncSessions.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      localSyncSessions.delete(code);
    }
  }
}, 5 * 60 * 1000);

// ============================================================
// Database & Dictionary Endpoints
// ============================================================

// 1. Keyless Multi-Dictionary Lookup (Free Dictionary API + Wiktionary REST)
router.post("/dictionary-explain", async (req: Request, res: Response) => {
  const { word, context, targetLanguage, translationLanguage, source } = req.body;

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");
  const langCode = getLangCode(targetLanguage);

  let ipa = "";
  let grammar = "";
  let translation = "";
  const examples: { text: string; translation: string }[] = [];
  let contextRelation = "Результат получен из бесплатных словарей (Free Dictionary + Wiktionary).";

  let freeDictResult: any = null;
  let comDictResult: any = null;
  let wiktionaryResult: any = null;

  if (source === "free_dictionary" || source === "hybrid" || source === "google" || !source) {
    comDictResult = await fetchFreeDictionaryFromCom(cleanWord, langCode);
    if (!comDictResult) {
      freeDictResult = await fetchFreeDictionary(cleanWord, langCode);
    }
  }
  if (source === "wiktionary" || source === "hybrid" || source === "google" || !source) {
    wiktionaryResult = await fetchWiktionary(cleanWord, langCode);
  }

  if (comDictResult && comDictResult.entries && Array.isArray(comDictResult.entries) && comDictResult.entries.length > 0) {
    const mainEntry = comDictResult.entries[0];
    grammar = mainEntry.partOfSpeech || "";

    if (mainEntry.pronunciations && Array.isArray(mainEntry.pronunciations)) {
      const ipaObj = mainEntry.pronunciations.find((p: any) => p.type === "ipa" && p.text);
      if (ipaObj) {
        ipa = ipaObj.text;
      }
    }

    if (mainEntry.senses && Array.isArray(mainEntry.senses) && mainEntry.senses.length > 0) {
      const meaningsList: string[] = [];
      mainEntry.senses.forEach((s: any) => {
        if (s.definition) {
          const part = mainEntry.partOfSpeech ? `(${mainEntry.partOfSpeech}) ` : "";
          meaningsList.push(`${part}${s.definition}`);
        }
        if (s.examples && Array.isArray(s.examples)) {
          s.examples.slice(0, 3).forEach((ex: string) => {
            if (ex && typeof ex === "string") {
              examples.push({
                text: ex,
                translation: "Пример из Free Dictionary"
              });
            }
          });
        }
      });

      if (meaningsList.length > 0) {
        translation = meaningsList.slice(0, 3).join("; ");
      }
    }
    contextRelation = "Результат получен из базы freedictionaryapi.com + Wiktionary.";
  }

  if (freeDictResult) {
    if (freeDictResult.phonetic) {
      ipa = freeDictResult.phonetic;
    } else if (freeDictResult.phonetics && Array.isArray(freeDictResult.phonetics)) {
      const validPhonetic = freeDictResult.phonetics.find((p: any) => p.text);
      if (validPhonetic) {
        ipa = validPhonetic.text;
      }
    }

    if (freeDictResult.meanings && Array.isArray(freeDictResult.meanings) && freeDictResult.meanings.length > 0) {
      const meaningsList: string[] = [];
      const firstMeaning = freeDictResult.meanings[0];
      grammar = firstMeaning.partOfSpeech || "";

      freeDictResult.meanings.forEach((m: any) => {
        const part = m.partOfSpeech ? `(${m.partOfSpeech}) ` : "";
        if (m.definitions && Array.isArray(m.definitions)) {
          m.definitions.slice(0, 2).forEach((d: any) => {
            if (d.definition) {
              meaningsList.push(`${part}${d.definition}`);
            }
            if (d.example) {
              examples.push({
                text: d.example,
                translation: "Пример из словаря (перевод отсутствует)"
              });
            }
          });
        }
      });

      if (meaningsList.length > 0) {
        translation = meaningsList.slice(0, 3).join("; ");
      }
    }
  }

  if (wiktionaryResult) {
    const sections = Object.keys(wiktionaryResult);
    const validParts: string[] = [];

    sections.forEach((sec) => {
      const partOfSpeeches = wiktionaryResult[sec];
      if (Array.isArray(partOfSpeeches)) {
        partOfSpeeches.forEach((pos: any) => {
          if (pos.partOfSpeech && !grammar) {
            grammar = pos.partOfSpeech;
          }
          if (pos.definitions && Array.isArray(pos.definitions)) {
            pos.definitions.slice(0, 3).forEach((d: any) => {
              const cleanDef = d.definition ? d.definition.replace(/<[^>]+>/g, "").trim() : "";
              if (cleanDef) {
                validParts.push(`${pos.partOfSpeech ? `(${pos.partOfSpeech}) ` : ""}${cleanDef}`);
              }
              if (d.examples && Array.isArray(d.examples)) {
                d.examples.slice(0, 2).forEach((ex: any) => {
                  const cleanEx = ex.text ? ex.text.replace(/<[^>]+>/g, "").trim() : "";
                  if (cleanEx && !examples.some(item => item.text.toLowerCase() === cleanEx.toLowerCase())) {
                    examples.push({
                      text: cleanEx,
                      translation: "Пример употребления"
                    });
                  }
                });
              }
            });
          }
        });
      }
    });

    if (validParts.length > 0) {
      if (!translation) {
        translation = validParts.slice(0, 3).join("; ");
      } else if (source === "hybrid") {
        translation += " | Wiktionary: " + validParts.slice(0, 2).join("; ");
      }
    }
  }

  if (source === "google") {
    const sourceLangCode = getLangCode(targetLanguage);
    const destLangCode = getLangCode(translationLanguage);
    const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
    if (googleTrans) {
      translation = googleTrans;
    }

    if (examples.length > 0) {
      for (const ex of examples) {
        if (ex.text) {
          const transEx = await fetchGoogleTranslate(ex.text, sourceLangCode, destLangCode);
          if (transEx) {
            ex.translation = transEx;
          }
        }
      }
    }

    if (context && context.trim() !== cleanWord) {
      const transContext = await fetchGoogleTranslate(context, sourceLangCode, destLangCode);
      if (transContext) {
        contextRelation = `Перевод контекста: "${transContext}" (Google Translate)`;
      } else {
        contextRelation = `Результат получен из Google Translate (без ИИ).`;
      }
    } else {
      contextRelation = `Результат получен из Google Translate (без ИИ).`;
    }
  } else {
    if (!translation) {
      translation = `Перевод слова не найден в выбранном локальном словаре.`;
      contextRelation = `Мы пытались найти слово "${cleanWord}" в Free Dictionary и Wiktionary, но результатов нет. Пожалуйста, используйте поиск через ИИ (AI)!`;
    } else {
      contextRelation = `Определение успешно загружено из источника: ${
        source === "free_dictionary" ? "Free Dictionary API" : source === "wiktionary" ? "Wiktionary REST API" : "Смешанный поиск (Hybrid)"
      }.`;
    }
  }

  if (examples.length === 0) {
    examples.push({
      text: `Let's use "${cleanWord}" in a text context.`,
      translation: `Давайте используем слово "${cleanWord}" в предложении.`
    });
  }

  return res.json({
    word: cleanWord,
    translation,
    ipa: ipa || `[${cleanWord}]`,
    grammar: grammar || "Word",
    contextRelation,
    examples: examples.slice(0, 3)
  });
});

// 2. Load User Server DB (Pull / Load)
router.get("/server-db", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const dbData = getLocalServerDb(userId);
  if (!dbData) {
    return res.json({ status: "empty" });
  }
  return res.json({ status: "ok", data: dbData });
});

// 3. Save User Server DB (Push / Save)
router.post("/server-db", (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: "No data provided" });
  }

  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const success = saveLocalServerDb(userId, data);
  if (success) {
    return res.json({ status: "success" });
  } else {
    return res.status(500).json({ error: "Failed to write database to local SQLite storage" });
  }
});

// 4. Wipe User Server DB
router.delete("/server-db", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const userDbPath = safeUserId === "default"
    ? SQLITE_DB_PATH
    : path.join(DATA_DIR, `local_server_db_${safeUserId}.sqlite`);

  try {
    const conn = getDbConnection(safeUserId);
    if (conn) {
      conn.close();
    }
    if (fs.existsSync(userDbPath)) {
      fs.unlinkSync(userDbPath);
    }
    if (fs.existsSync(userDbPath + "-wal")) {
      fs.unlinkSync(userDbPath + "-wal");
    }
    if (fs.existsSync(userDbPath + "-shm")) {
      fs.unlinkSync(userDbPath + "-shm");
    }
    return res.json({ status: "success", message: "Database file deleted successfully" });
  } catch (error) {
    console.error("Failed to delete local server db file:", error);
    return res.status(500).json({ error: "Failed to wipe local server database from computer disk" });
  }
});

// 5. Register Local Data for Wi-Fi Fast Sync and Get PIN
router.post("/local-sync/share", requireLocalSyncKey, (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: "Data is required" });
  }

  let pinCodeCode = "";
  for (let i = 0; i < 6; i++) {
    pinCodeCode += Math.floor(Math.random() * 10).toString();
  }

  localSyncSessions.set(pinCodeCode, {
    data,
    createdAt: Date.now()
  });

  return res.json({ code: pinCodeCode });
});

// 6. Retrieve Data Using PIN
router.get("/local-sync/retrieve/:code", requireLocalSyncKey, (req: Request, res: Response) => {
  const { code } = req.params;
  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  const session = localSyncSessions.get(code);
  if (!session) {
    return res.status(404).json({ error: "Код не найден или срок его действия (15 мин) истек. Пожалуйста, создайте новый код на вашем ПК." });
  }

  return res.json({ data: session.data });
});

export default router;
