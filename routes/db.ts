import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { JSDOM } from "jsdom";
import Database from "better-sqlite3";
import { getDbConnection, SQLITE_DB_PATH } from "./dbConnection.ts";
import { resolveUserId, requireLocalSyncKey, requireAuth } from "./auth.ts";
import { analyzeTextComplexity } from "../server/frequency/frequencyService.ts";

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://freedictionaryapi.com/api/v1/entries/${langCode}/${encodeURIComponent(word)}?translations=true`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/2.99 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      return data;
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError' || e?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      console.warn(`[FreeDictAPI] Timeout for word "${word}" (${langCode})`);
    } else {
      console.warn(`[FreeDictAPI] Failed for word "${word}":`, e?.message || e);
    }
  }
  return null;
}

// Keyless Free Dictionary API Fetcher
async function fetchFreeDictionary(word: string, langCode: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/2.99 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError' || e?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      console.warn(`[DictionaryAPI.dev] Timeout for word "${word}" (${langCode})`);
    } else {
      console.warn(`[DictionaryAPI.dev] Failed for word "${word}":`, e?.message || e);
    }
  }
  return null;
}

// Keyless Wiktionary REST Definition API Fetcher with proper User-Agent & timeout
async function fetchWiktionarySingle(word: string, lang: string = 'en') {
  const cleanWord = word.trim().toLowerCase();
  const endpoint = `https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(cleanWord)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LecturaApp/2.99 (https://github.com/lectura; contact@lectura.local)',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 404 is expected when word doesn't exist in Wiktionary
      return null;
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error?.name === 'AbortError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT' || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      console.warn(`[Wiktionary] Timeout for word "${cleanWord}" (${lang}) — skipping definition.`);
    } else {
      console.warn(`[Wiktionary] Failed to fetch "${cleanWord}" (${lang}): ${error?.message || error}`);
    }

    return null;
  }
}

async function fetchWiktionary(word: string, langCode: string) {
  const primaryResult = await fetchWiktionarySingle(word, 'en');
  if (primaryResult) return primaryResult;

  if (langCode && langCode !== 'en') {
    return await fetchWiktionarySingle(word, langCode);
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
      const nounTerms: string[] = [];
      const adjTerms: string[] = [];
      const otherTerms: string[] = [];

      if (data[1] && Array.isArray(data[1])) {
        for (const posBlock of data[1]) {
          const pos = (posBlock[0] || "").toLowerCase();
          if (posBlock && Array.isArray(posBlock[1])) {
            for (const word of posBlock[1]) {
              if (typeof word === "string" && word.trim()) {
                const clean = word.trim();
                if (pos === "noun" || pos.includes("noun") || pos.includes("существительное")) {
                  nounTerms.push(clean);
                } else if (pos === "adjective" || pos.includes("adj") || pos.includes("прилагательное")) {
                  adjTerms.push(clean);
                } else {
                  otherTerms.push(clean);
                }
              }
            }
          }
        }
      }

      if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
        for (const item of data[5][0][2]) {
          if (item && typeof item[0] === "string" && item[0].trim()) {
            otherTerms.push(item[0].trim());
          }
        }
      }

      const allVariants = [primary, ...nounTerms, ...adjTerms, ...otherTerms].filter(Boolean);
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const term of allVariants) {
        const lower = term.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          unique.push(term);
        }
      }

      if (unique.length > 0) {
        return unique.slice(0, 4).join(", ");
      }
    }

    return primary || null;
  } catch (e) {
    console.error("Google Translate fetch failed:", e);
  }
  return null;
}

export const LANG_MAP: Record<string, string> = {
  en: "English",
  english: "English",
  es: "Spanish",
  spanish: "Spanish",
  de: "German",
  german: "German",
  fr: "French",
  french: "French",
  it: "Italian",
  italian: "Italian",
  ru: "Russian",
  russian: "Russian",
  ja: "Japanese",
  japanese: "Japanese",
  zh: "Chinese",
  chinese: "Chinese",
  pt: "Portuguese",
  portuguese: "Portuguese",
};

export function normalizeLang(lang: string): string {
  if (!lang) return "English";
  const lower = lang.trim().toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
}

// Read helper safely — all queries scoped strictly to userId
export function getLocalServerDb(userId: string = "default") {
  try {
    const db = getDbConnection(userId);

    // Retrieve user data strictly scoped by user_id

    // Listening seconds — per user
    const listeningRow = db.prepare(
      "SELECT value FROM metadata WHERE user_id = ? AND key = 'listeningSeconds'"
    ).get(userId) as { value: string } | undefined;
    const listeningSeconds = listeningRow ? parseFloat(listeningRow.value) || 0 : 0;

    // Language flags — global (shared across users) + user scoped overrides
    const langRows = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL").all() as { code: string; flag: string }[];
    const languageFlags: Record<string, string> = {};
    for (const row of langRows) {
      languageFlags[row.code] = row.flag;
    }
    const userLangFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'languageFlags'").get(userId) as { value: string } | undefined;
    if (userLangFlagsRow?.value) {
      try {
        const parsed = JSON.parse(userLangFlagsRow.value);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') languageFlags[k] = v;
          }
        }
      } catch (_) {}
    }

    // Lessons — strictly this user's, newest first (Whisper books appear at the top)
    const lessonsRows = db.prepare(
      "SELECT *, rowid FROM lessons WHERE user_id = ? ORDER BY COALESCE(createdAt, rowid * 1000) DESC"
    ).all(userId) as any[];
    const updateAudioStmt = db.prepare("UPDATE lessons SET audioUrl = ?, audioBase64 = NULL WHERE id = ? AND user_id = ?");

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
            updateAudioStmt.run(savedFileUrl, l.id, userId);
          } catch (e) {}
        }
      }

      let lessonDifficulty = l.difficulty;
      let lessonDifficultyExplanation = l.difficultyExplanation;

      // Automatic CEFR calculation via offline frequency table if difficulty is missing
      if (!lessonDifficulty && typeof l.text === "string" && l.text.trim().length > 0) {
        try {
          const langCode = (l.targetLanguage || "en").toLowerCase();
          const comp = analyzeTextComplexity(l.text, langCode.startsWith("en") ? "en" : langCode);
          if (comp && comp.cefrOverall) {
            lessonDifficulty = comp.cefrOverall;
            lessonDifficultyExplanation = `A1-A2: ${comp.coverage.a1_a2}%, B1-B2: ${comp.coverage.b1_b2}%, C1-C2: ${comp.coverage.c1_c2}%, Rare: ${comp.coverage.rare}%`;
            // Persist in background
            try {
              db.prepare("UPDATE lessons SET difficulty = ?, difficultyExplanation = ? WHERE id = ? AND user_id = ?")
                .run(lessonDifficulty, lessonDifficultyExplanation, l.id, userId);
            } catch (_) {}
          }
        } catch (_) {}
      }

      if (l && typeof l.wordTimestamps === 'string') {
        try { l.wordTimestamps = JSON.parse(l.wordTimestamps); } catch (_) { l.wordTimestamps = null; }
      }

      return {
        id: l.id,
        title: l.title,
        text: l.text,
        audioUrl: currentAudioUrl,
        audioBase64: null,
        targetLanguage: l.targetLanguage,
        translationLanguage: l.translationLanguage,
        isBuiltIn: l.isBuiltIn === 1,
        isArchived: l.isArchived === 1,
        coverUrl: l.coverUrl,
        youtubeId: l.youtubeId,
        localVideoUrl: l.localVideoUrl || null,
        lessonType: l.lessonType,
        pinned: l.pinned === 1,
        translationText: l.translationText,
        detectedPhrases: l.detectedPhrases ? JSON.parse(l.detectedPhrases) : {},
        difficulty: lessonDifficulty,
        difficultyExplanation: lessonDifficultyExplanation,
        createdAt: l.createdAt ?? (l.rowid ? l.rowid * 1000 : undefined),
        wordTimestamps: l.wordTimestamps,
        channelName: l.channelName || null,
        channelAvatarUrl: l.channelAvatarUrl || null,
        channelUrl: l.channelUrl || null,
        playlistId: l.playlistId || null,
        images: l.images ? (typeof l.images === "string" ? JSON.parse(l.images) : l.images) : undefined,
        audioProgress: l.audioProgress || 0,
      };
    });

    // Playlists — strictly this user's
    const playlistsRows = db.prepare(
      "SELECT * FROM playlists WHERE user_id = ? ORDER BY COALESCE(createdAt, rowid * 1000) DESC"
    ).all(userId) as any[];
    const playlists = playlistsRows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description || undefined,
      thumbnailUrl: p.thumbnailUrl || "",
      sourceType: p.sourceType || "custom_collection",
      externalUrl: p.externalUrl || undefined,
      channelTitle: p.channelTitle || undefined,
      itemCount: typeof p.itemCount === "number" ? p.itemCount : 0,
      language: p.language || "en",
      items: p.items ? (typeof p.items === "string" ? JSON.parse(p.items) : p.items) : [],
      isArchived: p.isArchived === 1,
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt || new Date().toISOString(),
    }));

    // Lesson types — global (not per-user)
    const lessonTypes = db.prepare("SELECT * FROM lesson_types").all() as any[];

    // Words — strictly this user's
    const wordsRows = db.prepare("SELECT * FROM words WHERE user_id = ?").all(userId) as any[];
    const vocabWords: Record<string, any> = {};
    for (const w of wordsRows) {
      const lang = (w.language_code || "english").toLowerCase();
      const vocabKey = (w.id && w.id.includes("_") && w.id.startsWith(lang + "_")) ? w.id : `${lang}_${w.word}`;
      vocabWords[vocabKey] = {
        word: w.word,
        language_code: lang,
        translation: w.translation || "",
        definition: (w.definition && typeof w.definition === "string" && w.definition.trim() !== "") ? w.definition.trim() : undefined,
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
        srsNextReview: typeof w.srsNextReview === "number" ? w.srsNextReview : undefined,
        srsInterval: typeof w.srsInterval === "number" ? w.srsInterval : undefined,
        srsEaseFactor: typeof w.srsEaseFactor === "number" ? w.srsEaseFactor : undefined,
        srsRepetitions: typeof w.srsRepetitions === "number" ? w.srsRepetitions : undefined,
      };
    }

    // Word links — strictly this user's
    const linksRows = db.prepare(
      "SELECT language_code, word_from, word_to FROM word_links WHERE user_id = ?"
    ).all(userId) as any[];
    const wordLinks: Record<string, string> = {};
    for (const link of linksRows) {
      const lang = link.language_code;
      if (lang && lang !== "null") {
        wordLinks[`${lang}_${link.word_from}`] = `${lang}_${link.word_to}`;
      }
    }

    // Reading history — strictly this user's
    let history: any[] = [];
    try {
      const historyRows = db.prepare(
        "SELECT * FROM reading_history WHERE user_id = ? ORDER BY timestamp DESC"
      ).all(userId) as any[];
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
        channelName: h.channelName || null,
        channelAvatarUrl: h.channelAvatarUrl || null,
        channelUrl: h.channelUrl || undefined,
        category: h.category || undefined,
        customTitle: h.customTitle || undefined,
        mode: h.mode || undefined,
        tags: h.tags ? (typeof h.tags === "string" ? JSON.parse(h.tags) : h.tags) : [],
        lastPosition: h.lastPosition !== null && h.lastPosition !== undefined ? Number(h.lastPosition) : undefined,
        audioUrl: h.audioUrl || undefined,
        guid: h.guid || undefined,
        podcastTitle: h.podcastTitle || undefined,
      }));
    } catch (_) {}

    // Video / reading progress & custom user settings — strictly this user's
    const metadataRows = db.prepare(
      "SELECT key, value FROM metadata WHERE user_id = ?"
    ).all(userId) as { key: string; value: string }[];
    const videoProgress: Record<string, string> = {};
    const readingProgress: Record<string, string> = {};
    let readerSettings = null;
    let pinnedLanguages = null;
    let hiddenLanguages = null;
    let selectedTargetLanguage = null;
    let dictionaryPreferences = null;
    let customTags: string[] = [];
    let dailyWordGoal: number | null = null;
    let lastActiveLessonId: string | null = null;

    for (const row of metadataRows) {
      if (row.key.startsWith("youtube_progress_")) {
        videoProgress[row.key.replace("youtube_progress_", "")] = row.value;
      } else if (row.key.startsWith("vocab_progress_")) {
        readingProgress[row.key.replace("vocab_progress_", "")] = row.value;
      } else if (row.key === "readerSettings" && row.value) {
        try { readerSettings = JSON.parse(row.value); } catch (_) {}
      } else if (row.key === "pinnedLanguages" && row.value) {
        try { pinnedLanguages = JSON.parse(row.value); } catch (_) {}
      } else if (row.key === "hiddenLanguages" && row.value) {
        try { hiddenLanguages = JSON.parse(row.value); } catch (_) {}
      } else if (row.key === "selectedTargetLanguage" && row.value) {
        selectedTargetLanguage = row.value;
      } else if (row.key === "dictionaryPreferences" && row.value) {
        try { dictionaryPreferences = JSON.parse(row.value); } catch (_) {}
      } else if (row.key === "customTags" && row.value) {
        try { customTags = JSON.parse(row.value); } catch (_) {}
      } else if (row.key === "dailyWordGoal" && row.value) {
        dailyWordGoal = parseInt(row.value, 10) || null;
      } else if (row.key === "lastActiveLessonId" && row.value) {
        lastActiveLessonId = row.value;
      }
    }

    return {
      lessons,
      playlists,
      lessonTypes,
      vocab: vocabWords,
      wordLinks,
      listeningSeconds,
      languageFlags,
      history,
      videoProgress,
      readingProgress,
      readerSettings,
      pinnedLanguages,
      hiddenLanguages,
      selectedTargetLanguage,
      dictionaryPreferences,
      customTags,
      dailyWordGoal,
      lastActiveLessonId,
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
    console.log(`[saveLocalServerDb] Data details - lessons: ${(data.lessons || []).length}, vocab words: ${Object.keys(data.vocab || {}).length}`);
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
        id, user_id, language_code, word, translation, definition, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples,
        spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
        srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWordLink = db.prepare(`
      INSERT OR REPLACE INTO word_links (user_id, language_code, word_from, word_to) VALUES (?, ?, ?, ?)
    `);

    const insertLesson = db.prepare(`
      INSERT OR REPLACE INTO lessons (
        id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation, createdAt, wordTimestamps, channelName, channelAvatarUrl, channelUrl, playlistId, images, audioProgress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPlaylist = db.prepare(`
      INSERT OR REPLACE INTO playlists (
        id, user_id, title, description, thumbnailUrl, sourceType, externalUrl, channelTitle, itemCount, language, items, isArchived, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLessonType = db.prepare(`
      INSERT OR REPLACE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)
    `);

    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)
    `);

    db.transaction(() => {
      const flags = data.languageFlags || {};
      for (const [lang, flag] of Object.entries(flags)) {
        const name = lang.charAt(0).toUpperCase() + lang.slice(1);
        insertLanguage.run(lang, name, flag as string);
      }
      if (data.languageFlags && typeof data.languageFlags === "object") {
        insertMetadata.run(userId, "languageFlags", JSON.stringify(data.languageFlags));
      }

      const vocabWords = data.vocab || {};
      const incomingVocabKeys = Object.keys(vocabWords);
      const existingWordCount = (db.prepare("SELECT COUNT(*) as count FROM words WHERE user_id = ?").get(userId) as any)?.count || 0;

      if (existingWordCount > 0 && incomingVocabKeys.length === 0) {
        console.warn(`[SAFETY GUARD] Blocked attempt to overwrite ${existingWordCount} words with 0 words for user ${userId}`);
      } else if (incomingVocabKeys.length > 0) {
        for (const [key, value] of Object.entries(vocabWords)) {
          const match = key.match(/^([a-zA-Z]+)_(.*)$/);
          const lang = match ? match[1] : "english";
          const val = value as any;
          const wordVal = cleanWordPrefix(val.word || (match ? match[2] : key));

          if (!wordVal || wordVal.length > 80 || /[\r\n\t]/.test(wordVal)) {
            continue;
          }

          const tagsJson = (val.tags && Array.isArray(val.tags) && val.tags.length > 0) ? JSON.stringify(val.tags) : null;
          const examplesJson = (val.examples && Array.isArray(val.examples) && val.examples.length > 0) ? JSON.stringify(val.examples) : null;

          const wordKey = `${lang}_${wordVal.toLowerCase()}`;
          const wordId = `${userId}_${wordKey}`;
          ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
          insertWord.run(
            wordId,
            userId,
            lang,
            wordVal,
            val.translation || "",
            (val.definition && typeof val.definition === "string" && val.definition.trim() !== "") ? val.definition.trim() : null,
            val.ipa || "",
            val.grammar || "",
            val.contextRelation || "",
            val.status || "new",
            val.createdAt || Date.now(),
            tagsJson,
            val.imageUrl || null,
            examplesJson,
            val.spellingCorrectCount || 0,
            val.spellingIncorrectCount || 0,
            val.spellingAccentCount || 0,
            val.lastSpelledCorrectly === true ? 1 : val.lastSpelledCorrectly === false ? 0 : null,
            val.lastSpelledWithAccentError ? 1 : 0,
            val.spellingExclude ? 1 : 0,
            val.srsNextReview || null,
            val.srsInterval || null,
            val.srsEaseFactor || null,
            val.srsRepetitions || null
          );
        }
      }

      const links = data.wordLinks || {};
      const incomingLinkKeys = Object.keys(links);
      const existingLinksCount = (db.prepare("SELECT COUNT(*) as count FROM word_links WHERE user_id = ?").get(userId) as any)?.count || 0;

      if (existingLinksCount > 0 && incomingLinkKeys.length === 0) {
        console.warn(`[SAFETY GUARD] Blocked attempt to overwrite ${existingLinksCount} word_links with 0 links for user ${userId}`);
      } else if (incomingLinkKeys.length > 0) {
        for (const [key, val] of Object.entries(links)) {
          if (!val || typeof val !== "string") continue;
          const matchKey = key.match(/^([a-zA-Z]+)_(.*)$/);
          const matchVal = (val as string).match(/^([a-zA-Z]+)_(.*)$/);
          
          if (!matchKey && !matchVal) {
            continue;
          }

          const lang = matchKey ? matchKey[1] : matchVal![1];
          const cleanFrom = cleanWordPrefix(key);
          const cleanTo = cleanWordPrefix(val as string);

          ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
          insertWordLink.run(userId, lang, cleanFrom, cleanTo);
        }
      }

      if (data.deletedLessonIds && Array.isArray(data.deletedLessonIds) && data.deletedLessonIds.length > 0) {
        // Cascade delete local media files (audio & videos)
        const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
        for (const delId of data.deletedLessonIds) {
          try {
            const audioPathMp3 = path.join(AUDIO_STORAGE_DIR, `audio_${delId}.mp3`);
            if (fs.existsSync(audioPathMp3)) fs.unlinkSync(audioPathMp3);
            const audioPathM4a = path.join(AUDIO_STORAGE_DIR, `audio_${delId}.m4a`);
            if (fs.existsSync(audioPathM4a)) fs.unlinkSync(audioPathM4a);

            if (fs.existsSync(VIDEO_STORAGE_DIR)) {
              const videoMp4 = path.join(VIDEO_STORAGE_DIR, `${delId}.mp4`);
              if (fs.existsSync(videoMp4)) fs.unlinkSync(videoMp4);
              const videoM4a = path.join(VIDEO_STORAGE_DIR, `${delId}.m4a`);
              if (fs.existsSync(videoM4a)) fs.unlinkSync(videoM4a);
            }
          } catch (e) {
            console.error("Failed to delete local media files for lesson:", delId, e);
          }
        }

        const placeholders = data.deletedLessonIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM lessons WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedLessonIds);
        const insertMeta = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, '1')");
        for (const delId of data.deletedLessonIds) {
          insertMeta.run(userId, `deleted_lesson_${delId}`);
        }
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
          userId,
          l.title,
          l.text,
          finalAudioUrl,
          finalAudioBase64,
          l.targetLanguage || "english",
          l.translationLanguage || "russian",
          l.isBuiltIn ? 1 : 0,
          finalIsArchived,
          l.coverUrl || null,
          l.youtubeId || null,
          l.localVideoUrl || null,
          l.lessonType || null,
          finalPinned,
          l.translationText || null,
          JSON.stringify(l.detectedPhrases || {}),
          l.difficulty || null,
          l.difficultyExplanation || null,
          // Preserve existing createdAt if present, else use current time
          (typeof l.createdAt === "number" && l.createdAt > 0) ? l.createdAt : Date.now(),
          l.wordTimestamps ? JSON.stringify(l.wordTimestamps) : null,
          l.channelName || l.channelTitle || null,
          l.channelAvatarUrl || l.channelAvatar || null,
          l.channelUrl || null,
          l.playlistId || null,
          l.images ? (typeof l.images === "string" ? l.images : JSON.stringify(l.images)) : null,
          l.audioProgress !== undefined ? Math.floor(Number(l.audioProgress) || 0) : (existingLesson?.audioProgress || 0)
        );
      }

      if (data.deletedPlaylistIds && Array.isArray(data.deletedPlaylistIds) && data.deletedPlaylistIds.length > 0) {
        const placeholders = data.deletedPlaylistIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM playlists WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedPlaylistIds);
        const insertMeta = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, '1')");
        for (const delId of data.deletedPlaylistIds) {
          insertMeta.run(userId, `deleted_playlist_${delId}`);
        }
      }

      const playlists = data.playlists || [];
      for (const p of playlists) {
        const existingPlaylist = db.prepare("SELECT isArchived FROM playlists WHERE id = ?").get(p.id) as any;
        let finalPlIsArchived = p.isArchived ? 1 : 0;
        if (p.isArchived === undefined && existingPlaylist) {
          finalPlIsArchived = existingPlaylist.isArchived || 0;
        }

        insertPlaylist.run(
          p.id,
          userId,
          p.title || "Untitled Playlist",
          p.description || null,
          p.thumbnailUrl || "",
          p.sourceType || "custom_collection",
          p.externalUrl || null,
          p.channelTitle || null,
          p.itemCount || (Array.isArray(p.items) ? p.items.length : 0),
          p.language || "en",
          p.items ? (typeof p.items === "string" ? p.items : JSON.stringify(p.items)) : "[]",
          finalPlIsArchived,
          p.createdAt || new Date().toISOString(),
          p.updatedAt || new Date().toISOString()
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
        insertMetadata.run(userId, "listeningSeconds", String(data.listeningSeconds));
      }

      if (data.readerSettings && typeof data.readerSettings === "object") {
        insertMetadata.run(userId, "readerSettings", JSON.stringify(data.readerSettings));
      }

      if (data.pinnedLanguages && Array.isArray(data.pinnedLanguages)) {
        insertMetadata.run(userId, "pinnedLanguages", JSON.stringify(data.pinnedLanguages));
      }

      if (data.hiddenLanguages && Array.isArray(data.hiddenLanguages)) {
        insertMetadata.run(userId, "hiddenLanguages", JSON.stringify(data.hiddenLanguages));
      }

      if (data.selectedTargetLanguage && typeof data.selectedTargetLanguage === "string") {
        insertMetadata.run(userId, "selectedTargetLanguage", data.selectedTargetLanguage);
      }

      if (data.dictionaryPreferences && typeof data.dictionaryPreferences === "object") {
        let existingPrefs: Record<string, any> = {};
        const existingRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'dictionaryPreferences'").get(userId) as { value: string } | undefined;
        if (existingRow?.value) {
          try { existingPrefs = JSON.parse(existingRow.value) || {}; } catch (_) {}
        }
        const mergedPrefs = { ...existingPrefs };
        for (const [langKey, tabPrefs] of Object.entries(data.dictionaryPreferences)) {
          if (tabPrefs && typeof tabPrefs === "object") {
            mergedPrefs[langKey] = {
              ...(mergedPrefs[langKey] || {}),
              ...(tabPrefs as any),
            };
          }
        }
        insertMetadata.run(userId, "dictionaryPreferences", JSON.stringify(mergedPrefs));
      }

      if (data.customTags && Array.isArray(data.customTags)) {
        insertMetadata.run(userId, "customTags", JSON.stringify(data.customTags));
      }

      if (data.dailyWordGoal !== undefined && data.dailyWordGoal !== null) {
        insertMetadata.run(userId, "dailyWordGoal", String(data.dailyWordGoal));
      }

      if (data.lastActiveLessonId && typeof data.lastActiveLessonId === "string") {
        insertMetadata.run(userId, "lastActiveLessonId", data.lastActiveLessonId);
      }

      const getMetaStmt = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?");

      if (data.videoProgress && typeof data.videoProgress === "object") {
        for (const [lessonId, val] of Object.entries(data.videoProgress)) {
          if (val !== undefined && val !== null) {
            const key = `youtube_progress_${lessonId}`;
            const existingRow = getMetaStmt.get(userId, key) as { value: string } | undefined;

            let incomingUpdatedAt = Date.now();
            let incomingProgress = val;
            if (typeof val === "object" && val !== null && "progress" in val) {
              incomingProgress = (val as any).progress;
              if (typeof (val as any).updatedAt === "number") incomingUpdatedAt = (val as any).updatedAt;
            } else if (typeof val === "string") {
              try {
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === "object" && "progress" in parsed) {
                  incomingProgress = parsed.progress;
                  if (typeof parsed.updatedAt === "number") incomingUpdatedAt = parsed.updatedAt;
                }
              } catch (_) {}
            }

            let shouldSave = true;
            if (existingRow?.value) {
              try {
                const existingParsed = JSON.parse(existingRow.value);
                if (existingParsed && typeof existingParsed.updatedAt === "number" && existingParsed.updatedAt > incomingUpdatedAt) {
                  shouldSave = false;
                }
              } catch (_) {}
            }

            if (shouldSave) {
              const payload = JSON.stringify({ progress: incomingProgress, updatedAt: incomingUpdatedAt });
              insertMetadata.run(userId, key, payload);
            }
          }
        }
      }

      if (data.readingProgress && typeof data.readingProgress === "object") {
        for (const [lessonId, val] of Object.entries(data.readingProgress)) {
          if (val !== undefined && val !== null) {
            const key = `vocab_progress_${lessonId}`;
            const existingRow = getMetaStmt.get(userId, key) as { value: string } | undefined;

            let incomingUpdatedAt = Date.now();
            let incomingProgress = val;
            if (typeof val === "object" && val !== null && "progress" in val) {
              incomingProgress = (val as any).progress;
              if (typeof (val as any).updatedAt === "number") incomingUpdatedAt = (val as any).updatedAt;
            } else if (typeof val === "string") {
              try {
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === "object" && "progress" in parsed) {
                  incomingProgress = parsed.progress;
                  if (typeof parsed.updatedAt === "number") incomingUpdatedAt = parsed.updatedAt;
                }
              } catch (_) {}
            }

            let shouldSave = true;
            if (existingRow?.value) {
              try {
                const existingParsed = JSON.parse(existingRow.value);
                if (existingParsed && typeof existingParsed.updatedAt === "number" && existingParsed.updatedAt > incomingUpdatedAt) {
                  shouldSave = false;
                }
              } catch (_) {}
            }

            if (shouldSave) {
              const payload = JSON.stringify({ progress: incomingProgress, updatedAt: incomingUpdatedAt });
              insertMetadata.run(userId, key, payload);
            }
          }
        }
      }

      const insertHistory = db.prepare(`
        INSERT OR REPLACE INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, lastPosition, audioUrl, guid, podcastTitle
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (Array.isArray(data.deletedHistoryIds) && data.deletedHistoryIds.length > 0) {
        const placeholders = data.deletedHistoryIds.map(() => "?").join(",");
        const result = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedHistoryIds);
        console.log('[Server SQL Delete Bulk]', { deletedIds: data.deletedHistoryIds, changes: result.changes });
      }

      if (Array.isArray(data.history)) {
        const historyList = data.history;
        for (const h of historyList) {
          if (!h || !h.id) continue;
          
          const incomingDuration = h.durationSeconds || 0;
          const incomingPosition = h.lastPosition || 0;
          if (incomingDuration <= 0 && incomingPosition <= 0) {
            // Strict reject: zero duration and zero position records are illegal
            continue;
          }

          insertHistory.run(
            h.id,
            userId,
            h.lessonId || 'imported_record',
            h.lessonTitle || "Занятие",
            h.lessonType || null,
            h.coverUrl || null,
            h.targetLanguage || "english",
            h.timestamp || new Date().toISOString(),
            h.actionType || "read",
            h.status || "in_progress",
            incomingDuration,
            h.notes || null,
            h.channelName || null,
            h.channelAvatarUrl || null,
            h.channelUrl || null,
            h.category || null,
            h.customTitle || null,
            h.mode || null,
            h.tags && Array.isArray(h.tags) ? JSON.stringify(h.tags) : null,
            h.lastPosition !== undefined && h.lastPosition !== null ? Number(h.lastPosition) : 0,
            h.audioUrl || null,
            h.guid || null,
            h.podcastTitle || null
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

  if (source === "google" || (translationLanguage && translationLanguage !== "mono" && getLangCode(translationLanguage) !== getLangCode(targetLanguage))) {
    const sourceLangCode = getLangCode(targetLanguage);
    const destLangCode = getLangCode(translationLanguage || "ru");
    const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
    if (googleTrans) {
      translation = googleTrans;
    }
  }

  if (source === "free_dictionary" || source === "hybrid" || !source || (source === "google" && !translation)) {
    comDictResult = await fetchFreeDictionaryFromCom(cleanWord, langCode);
    if (!comDictResult) {
      freeDictResult = await fetchFreeDictionary(cleanWord, langCode);
    }
  }
  if (source === "wiktionary" || source === "hybrid" || !source || (source === "google" && !translation)) {
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

// 5. Get Dictionary Preferences (Granular fetch)
router.get("/dictionary-preferences", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  try {
    const db = getDbConnection(userId);
    const row = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'dictionaryPreferences'").get(userId) as { value: string } | undefined;
    const preferences = row?.value ? JSON.parse(row.value) : {};
    return res.json({ status: "ok", data: preferences });
  } catch (err: any) {
    console.error("[GET /api/dictionary-preferences] Error:", err);
    return res.status(500).json({ error: "Failed to fetch dictionary preferences" });
  }
});

// 8. Update Dictionary Preferences (Granular patch with Deep Merge)
router.put("/dictionary-preferences", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { langKey, tab, dictionaries, preferences } = req.body;

  try {
    const db = getDbConnection(userId);
    const row = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'dictionaryPreferences'").get(userId) as { value: string } | undefined;
    let existingPrefs: Record<string, any> = {};
    if (row?.value) {
      try { existingPrefs = JSON.parse(row.value) || {}; } catch (_) {}
    }

    const mergedPrefs = { ...existingPrefs };

    if (langKey && tab && Array.isArray(dictionaries)) {
      // Granular single tab update (e.g. langKey: "es_en", tab: "definition", dictionaries: [...])
      mergedPrefs[langKey] = {
        ...(mergedPrefs[langKey] || {}),
        [tab]: dictionaries
      };
    } else if (langKey && preferences && typeof preferences === "object") {
      // Lang preferences update
      mergedPrefs[langKey] = {
        ...(mergedPrefs[langKey] || {}),
        ...preferences
      };
    } else if (preferences && typeof preferences === "object") {
      // Full object merge
      for (const [k, v] of Object.entries(preferences)) {
        if (v && typeof v === "object") {
          mergedPrefs[k] = {
            ...(mergedPrefs[k] || {}),
            ...(v as any)
          };
        }
      }
    } else {
      return res.status(400).json({ error: "Invalid payload. Required { langKey, tab, dictionaries } or { preferences }" });
    }

    db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'dictionaryPreferences', ?)").run(
      userId,
      JSON.stringify(mergedPrefs)
    );

    return res.json({ status: "success", data: mergedPrefs });
  } catch (err: any) {
    console.error("[PUT /api/dictionary-preferences] Error:", err);
    return res.status(500).json({ error: "Failed to save dictionary preferences" });
  }
});

// 9. Update User Metadata (customTags, dailyWordGoal, lastActiveLessonId)
router.put("/user-metadata", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { customTags, dailyWordGoal, lastActiveLessonId } = req.body;

  try {
    const db = getDbConnection(userId);
    const insertMeta = db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)");

    db.transaction(() => {
      if (customTags !== undefined && Array.isArray(customTags)) {
        insertMeta.run(userId, "customTags", JSON.stringify(customTags));
      }
      if (dailyWordGoal !== undefined && dailyWordGoal !== null) {
        insertMeta.run(userId, "dailyWordGoal", String(dailyWordGoal));
      }
      if (lastActiveLessonId !== undefined && typeof lastActiveLessonId === "string") {
        insertMeta.run(userId, "lastActiveLessonId", lastActiveLessonId);
      }
    })();

    return res.json({ status: "success" });
  } catch (err: any) {
    console.error("[PUT /api/user-metadata] Error:", err);
    return res.status(500).json({ error: "Failed to save user metadata" });
  }
});

// 10. Update Lesson Progress with LWW timestamp conflict protection
router.post("/progress", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { type, lessonId, progress, updatedAt } = req.body;
  if (!type || !lessonId || progress === undefined) {
    return res.status(400).json({ error: "Required { type: 'reading' | 'video', lessonId, progress }" });
  }

  const incomingUpdatedAt = typeof updatedAt === "number" ? updatedAt : Date.now();
  const key = type === "video" ? `youtube_progress_${lessonId}` : `vocab_progress_${lessonId}`;

  try {
    const db = getDbConnection(userId);
    const existingRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?").get(userId, key) as { value: string } | undefined;

    let shouldSave = true;
    if (existingRow?.value) {
      try {
        const existingParsed = JSON.parse(existingRow.value);
        if (existingParsed && typeof existingParsed.updatedAt === "number" && existingParsed.updatedAt > incomingUpdatedAt) {
          shouldSave = false;
        }
      } catch (_) {}
    }

    if (shouldSave) {
      const payload = JSON.stringify({ progress, updatedAt: incomingUpdatedAt });
      db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)").run(userId, key, payload);
      return res.json({ status: "success", progress, updatedAt: incomingUpdatedAt });
    } else {
      return res.json({ status: "stale_ignored", message: "Newer progress already recorded on server" });
    }
  } catch (err: any) {
    console.error("[POST /api/progress] Error:", err);
    return res.status(500).json({ error: "Failed to update progress" });
  }
});

// 11. User Settings (GET /api/user/settings)
router.get("/user/settings", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  try {
    const db = getDbConnection(userId);
    let settings: Record<string, any> = {};

    const row = db.prepare("SELECT settings, updated_at FROM user_settings WHERE user_id = ?").get(userId) as any;
    if (row?.settings) {
      try { settings = JSON.parse(row.settings); } catch (_) {}
    } else {
      const metaRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId) as any;
      if (metaRow?.value) {
        try { settings = JSON.parse(metaRow.value); } catch (_) {}
      }
    }

    return res.json({ status: "success", settings, updatedAt: row?.updated_at || Date.now() });
  } catch (err: any) {
    console.error("[GET /api/user/settings] Error:", err);
    return res.status(500).json({ error: "Failed to get user settings" });
  }
});

// 12. User Settings (PATCH /api/user/settings and PUT)
const updateUserSettingsHandler = (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const incomingSettings = req.body.settings || req.body;
  if (!incomingSettings || typeof incomingSettings !== "object") {
    return res.status(400).json({ error: "Invalid settings object" });
  }

  try {
    const db = getDbConnection(userId);
    const now = Date.now();

    db.transaction(() => {
      let mergedSettings: Record<string, any> = {};
      const existingRow = db.prepare("SELECT settings FROM user_settings WHERE user_id = ?").get(userId) as any;
      if (existingRow?.settings) {
        try { mergedSettings = JSON.parse(existingRow.settings); } catch (_) {}
      } else {
        const metaRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId) as any;
        if (metaRow?.value) {
          try { mergedSettings = JSON.parse(metaRow.value); } catch (_) {}
        }
      }

      mergedSettings = { ...mergedSettings, ...incomingSettings };
      const serialized = JSON.stringify(mergedSettings);

      db.prepare("INSERT OR REPLACE INTO user_settings (user_id, settings, updated_at) VALUES (?, ?, ?)").run(userId, serialized, now);
      db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'readerSettings', ?)").run(userId, serialized);
    })();

    return res.json({ status: "success", settings: incomingSettings, updatedAt: now });
  } catch (err: any) {
    console.error("[PATCH /api/user/settings] Error:", err);
    return res.status(500).json({ error: "Failed to update user settings" });
  }
};
router.patch("/user/settings", updateUserSettingsHandler);
router.put("/user/settings", updateUserSettingsHandler);

// 13. Granular History Update (PATCH /api/history/:id)
router.patch("/history/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { id } = req.params;
  const updates = req.body;
  if (!id) return res.status(400).json({ error: "Missing history entry ID" });

  try {
    const db = getDbConnection(userId);
    
    db.transaction(() => {
      const existing = db.prepare("SELECT * FROM reading_history WHERE user_id = ? AND id = ?").get(userId, id) as any;
      const requestedDuration = updates?.durationSeconds;
      if (!existing && (requestedDuration || 0) <= 0) {
        throw new Error("ZERO_DURATION_HISTORY_CREATE");
      }
      if (existing && requestedDuration !== undefined && requestedDuration <= 0) {
        throw new Error("ZERO_DURATION_HISTORY_UPDATE");
      }
      if (!existing) {
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO reading_history (
            id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(
          id,
          userId,
          updates.lessonId || 'custom',
          updates.lessonTitle || updates.customTitle || "Занятие",
          updates.lessonType || updates.category || null,
          updates.coverUrl || null,
          updates.targetLanguage || "english",
          updates.timestamp || new Date().toISOString(),
          updates.actionType || "read",
          updates.status || "in_progress",
          updates.durationSeconds || 0,
          updates.notes || null,
          updates.channelName || null,
          updates.channelAvatarUrl || null,
          updates.channelUrl || null,
          updates.category || null,
          updates.customTitle || null,
          updates.mode || null,
          updates.tags ? JSON.stringify(updates.tags) : null
        );
      } else {
        const nextChannelName = updates.channelName !== undefined ? updates.channelName : existing.channelName;
        const nextChannelAvatar = updates.channelAvatarUrl !== undefined ? updates.channelAvatarUrl : existing.channelAvatarUrl;
        const nextChannelUrl = updates.channelUrl !== undefined ? updates.channelUrl : existing.channelUrl;
        const nextNotes = updates.notes !== undefined ? updates.notes : existing.notes;
        const nextTitle = updates.lessonTitle !== undefined ? updates.lessonTitle : existing.lessonTitle;
        const nextTargetLang = updates.targetLanguage !== undefined ? updates.targetLanguage : existing.targetLanguage;
        const nextStatus = updates.status !== undefined ? updates.status : existing.status;
        const nextActionType = updates.actionType !== undefined ? updates.actionType : existing.actionType;
        const nextDuration = updates.durationSeconds !== undefined ? updates.durationSeconds : existing.durationSeconds;
        const nextCoverUrl = updates.coverUrl !== undefined ? updates.coverUrl : existing.coverUrl;
        const nextLessonType = updates.lessonType !== undefined ? updates.lessonType : existing.lessonType;
        const nextLessonId = (updates.lessonId && updates.lessonId !== "custom") ? updates.lessonId : existing.lessonId;
        const nextTags = updates.tags !== undefined ? (Array.isArray(updates.tags) ? JSON.stringify(updates.tags) : updates.tags) : existing.tags;
        const nextMode = updates.mode !== undefined ? updates.mode : existing.mode;
        const nextCategory = updates.category !== undefined ? updates.category : existing.category;
        const nextCustomTitle = updates.customTitle !== undefined ? updates.customTitle : existing.customTitle;

        db.prepare(`
          UPDATE reading_history SET
            lessonId = ?, lessonTitle = ?, lessonType = ?, coverUrl = ?, targetLanguage = ?,
            actionType = ?, status = ?, durationSeconds = ?, notes = ?, channelName = ?,
            channelAvatarUrl = ?, channelUrl = ?, category = ?, customTitle = ?, mode = ?, tags = ?
          WHERE user_id = ? AND id = ?
        `).run(
          nextLessonId, nextTitle, nextLessonType, nextCoverUrl, nextTargetLang,
          nextActionType, nextStatus, nextDuration, nextNotes, nextChannelName,
          nextChannelAvatar, nextChannelUrl, nextCategory, nextCustomTitle, nextMode, nextTags,
          userId, id
        );

        if (updates.channelName !== undefined && nextLessonId && nextLessonId !== "custom") {
          db.prepare(`
            UPDATE reading_history SET
              channelName = ?,
              channelAvatarUrl = COALESCE(?, channelAvatarUrl),
              channelUrl = COALESCE(?, channelUrl)
            WHERE user_id = ? AND lessonId = ?
          `).run(nextChannelName, nextChannelAvatar, nextChannelUrl, userId, nextLessonId);

          db.prepare(`
            UPDATE lessons SET
              channelName = ?,
              channelTitle = ?,
              channelAvatarUrl = COALESCE(?, channelAvatarUrl),
              channelUrl = COALESCE(?, channelUrl)
            WHERE user_id = ? AND id = ?
          `).run(nextChannelName, nextChannelName, nextChannelAvatar, nextChannelUrl, userId, nextLessonId);
        }
      }
    })();

    console.log(`[SAVED TO DB] History ${id} updated with channel: ${updates.channelName || updates.channelTitle || 'unchanged'}`);
    return res.json({ status: "success", id });
  } catch (err: any) {
    if (err?.message === "ZERO_DURATION_HISTORY_CREATE" || err?.message === "ZERO_DURATION_HISTORY_UPDATE") {
      return res.status(400).json({ error: "History durationSeconds must be greater than 0" });
    }
    console.error("[PATCH /api/history/:id] Error:", err);
    return res.status(500).json({ error: "Failed to update history entry" });
  }
});

// 14. Granular History Delete (DELETE /api/history/:id)
router.delete("/history/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { id } = req.params;
  try {
    const db = getDbConnection(userId);
    const result = db.prepare("DELETE FROM reading_history WHERE user_id = ? AND id = ?").run(userId, id);
    console.log('[Server SQL Delete]', { id, changes: result.changes });
    return res.json({ status: "success", id, changes: result.changes });
  } catch (err: any) {
    console.error("[DELETE /api/history/:id] Error:", err);
    return res.status(500).json({ error: "Failed to delete history entry" });
  }
});

// 15. Batch Assign Channel to Lessons & History (POST /api/history/assign-channel)
router.post("/history/assign-channel", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { lessonIds, historyIds, channelName, channelAvatarUrl, channelUrl } = req.body;
  if (!channelName || (!Array.isArray(lessonIds) && !Array.isArray(historyIds))) {
    return res.status(400).json({ error: "Missing channelName or target IDs" });
  }

  try {
    const db = getDbConnection(userId);
    const trimmedName = String(channelName).trim();
    const avatar = channelAvatarUrl || null;
    const url = channelUrl || null;

    db.transaction(() => {
      if (Array.isArray(lessonIds) && lessonIds.length > 0) {
        const placeholders = lessonIds.map(() => "?").join(",");
        db.prepare(`
          UPDATE lessons SET
            channelName = ?,
            channelTitle = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND id IN (${placeholders})
        `).run(trimmedName, trimmedName, avatar, url, userId, ...lessonIds);

        db.prepare(`
          UPDATE reading_history SET
            channelName = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND lessonId IN (${placeholders})
        `).run(trimmedName, avatar, url, userId, ...lessonIds);
      }

      if (Array.isArray(historyIds) && historyIds.length > 0) {
        const placeholders = historyIds.map(() => "?").join(",");
        db.prepare(`
          UPDATE reading_history SET
            channelName = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND id IN (${placeholders})
        `).run(trimmedName, avatar, url, userId, ...historyIds);
      }
    })();

    return res.json({ status: "success", count: (lessonIds?.length || 0) + (historyIds?.length || 0) });
  } catch (err: any) {
    console.error("[POST /api/history/assign-channel] Error:", err);
    return res.status(500).json({ error: "Failed to assign channel in batch" });
  }
});

// 15b. Log Media Watch Activity & Listening History (POST /api/history/log & POST /api/activity/log)
const logActivityHandler = (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const {
    videoId,
    videoTitle,
    channelName,
    channelAvatarUrl,
    channelUrl,
    thumbnailUrl,
    durationSeconds,
    watchedSeconds,
    language,
    timestamp,
  } = req.body || {};

  const seconds = Math.round(Number(watchedSeconds) || 0);
  if (!seconds || seconds <= 0 || seconds > 3600) {
    return res.json({ success: true, loggedSeconds: 0, message: "Ignored (0 seconds)" });
  }

  try {
    const db = getDbConnection(userId);
    const cleanVideoId = String(videoId || "").trim();
    const cleanTitle = String(videoTitle || cleanVideoId || "YouTube Video").trim();
    const cleanChannel = channelName ? String(channelName).trim() : "YouTube";
    const cleanCover = thumbnailUrl || (cleanVideoId ? `https://img.youtube.com/vi/${cleanVideoId}/hqdefault.jpg` : null);
    const targetLang = language ? String(language).toLowerCase().trim() : "en";
    const nowIso = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
    const todayDatePrefix = nowIso.slice(0, 10); // e.g. "2026-08-24"

    const lessonId = cleanVideoId ? `youtube_${cleanVideoId}` : `custom_activity_${Date.now().toString(36)}`;

    // Check if a history record for this video on the SAME day already exists for this user
    let existingEntry: any = null;
    if (cleanVideoId) {
      existingEntry = db.prepare(`
        SELECT * FROM reading_history
        WHERE user_id = ? 
          AND (lessonId = ? OR (coverUrl LIKE ? AND lessonType = 'youtube'))
          AND timestamp LIKE ?
        ORDER BY timestamp DESC LIMIT 1
      `).get(userId, lessonId, `%${cleanVideoId}%`, `${todayDatePrefix}%`);
    }

    if (existingEntry) {
      // Accumulate watchedSeconds into the existing daily entry
      const updatedDuration = (existingEntry.durationSeconds || 0) + seconds;
      db.prepare(`
        UPDATE reading_history SET
          durationSeconds = ?,
          timestamp = ?,
          lessonTitle = COALESCE(?, lessonTitle),
          channelName = COALESCE(?, channelName),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          coverUrl = COALESCE(?, coverUrl)
        WHERE user_id = ? AND id = ?
      `).run(
        updatedDuration,
        nowIso,
        cleanTitle,
        cleanChannel,
        channelAvatarUrl || null,
        channelUrl || null,
        cleanCover,
        userId,
        existingEntry.id
      );
    } else {
      // Create new history entry
      const historyId = "hist_yt_" + (cleanVideoId || Date.now().toString(36)) + "_" + Date.now().toString(36);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        userId,
        lessonId,
        cleanTitle,
        "youtube",
        cleanCover,
        targetLang,
        nowIso,
        "listen",
        "in_progress",
        seconds,
        cleanChannel,
        channelAvatarUrl || null,
        channelUrl || null,
        "video",
        cleanTitle,
        "custom",
        JSON.stringify(["youtube", "extension"])
      );
    }

    // Update listeningSeconds in metadata table
    const currentListeningRow = db.prepare(
      "SELECT value FROM metadata WHERE user_id = ? AND key = 'listeningSeconds'"
    ).get(userId) as { value: string } | undefined;
    const currentTotal = currentListeningRow ? (parseFloat(currentListeningRow.value) || 0) : 0;
    const newTotal = Math.round(currentTotal + seconds);

    db.prepare(
      "INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'listeningSeconds', ?)"
    ).run(userId, String(newTotal));

    return res.json({
      success: true,
      loggedSeconds: seconds,
      totalListeningSeconds: newTotal,
      videoId: cleanVideoId,
    });
  } catch (err: any) {
    console.error("[POST /api/history/log] Error:", err);
    return res.status(500).json({ error: "Failed to log listening activity: " + err.message });
  }
};

router.post("/history/log", logActivityHandler);
router.post("/activity/log", logActivityHandler);

// 15c. Get Reading / Listening Activity History (GET /api/history & GET /api/activity)
const getActivityHistoryHandler = (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ" });
  }

  try {
    const db = getDbConnection(userId);
    const lang = req.query.language ? String(req.query.language).toLowerCase() : null;
    let query = "SELECT * FROM reading_history WHERE user_id = ?";
    const params: any[] = [userId];
    if (lang && lang !== "all") {
      query += " AND (targetLanguage = ? OR targetLanguage LIKE ?)";
      params.push(lang, `${lang}%`);
    }
    query += " ORDER BY timestamp DESC";

    const rows = db.prepare(query).all(...params) as any[];
    const readerSettingsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId) as { value: string } | undefined;
    let dailyGoalMinutes = 15;
    let dailyGoalsByLanguage: Record<string, number> = {};
    if (readerSettingsRow?.value) {
      try {
        const parsed = JSON.parse(readerSettingsRow.value);
        if (typeof parsed.dailyGoalMinutes === 'number') dailyGoalMinutes = parsed.dailyGoalMinutes;
        if (parsed.dailyGoalsByLanguage && typeof parsed.dailyGoalsByLanguage === 'object') {
          dailyGoalsByLanguage = parsed.dailyGoalsByLanguage;
        }
      } catch (_) {}
    }

    const langRows = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL").all() as { code: string; flag: string }[];
    const customFlags: Record<string, string> = {};
    for (const row of langRows) {
      if (row.code && row.flag) {
        customFlags[row.code.toLowerCase().trim()] = row.flag;
      }
    }

    const userFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'studyLanguageFlags'").get(userId) as { value: string } | undefined;
    if (userFlagsRow?.value) {
      try {
        const parsed = JSON.parse(userFlagsRow.value);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') customFlags[k.toLowerCase().trim()] = v;
          }
        }
      } catch (_) {}
    }

    const languageFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'languageFlags'").get(userId) as { value: string } | undefined;
    if (languageFlagsRow?.value) {
      try {
        const parsed = JSON.parse(languageFlagsRow.value);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') customFlags[k.toLowerCase().trim()] = v;
          }
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      userGoals: {
        dailyGoalMinutes,
        dailyGoalsByLanguage,
      },
      customFlags,
      history: rows.map((h) => ({
        id: h.id,
        lessonId: h.lessonId,
        lessonTitle: h.lessonTitle,
        lessonType: h.lessonType || "youtube",
        coverUrl: h.coverUrl || null,
        targetLanguage: h.targetLanguage || "en",
        timestamp: h.timestamp,
        actionType: h.actionType,
        status: h.status || "in_progress",
        durationSeconds: h.durationSeconds || 0,
        channelName: h.channelName || null,
        category: h.category || undefined,
        customTitle: h.customTitle || undefined,
      })),
    });
  } catch (err: any) {
    console.error("[GET /api/history] Error:", err);
    return res.status(500).json({ error: "Failed to load history: " + err.message });
  }
};

router.get("/history", getActivityHistoryHandler);
router.get("/activity", getActivityHistoryHandler);

// 15d. Get Granular Day History (GET /api/activity/day & GET /api/history/day)
const getDayActivityHandler = (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ" });
  }

  const dateStr = req.query.date ? String(req.query.date).trim() : new Date().toISOString().slice(0, 10);
  const lang = req.query.language ? String(req.query.language).toLowerCase().trim() : null;

  try {
    const db = getDbConnection(userId);
    let query = "SELECT * FROM reading_history WHERE user_id = ? AND timestamp LIKE ?";
    const params: any[] = [userId, `${dateStr}%`];

    if (lang && lang !== "all") {
      query += " AND (targetLanguage = ? OR targetLanguage LIKE ?)";
      params.push(lang, `${lang}%`);
    }
    query += " ORDER BY timestamp DESC";

    const rows = db.prepare(query).all(...params) as any[];

    const flags: Record<string, string> = {
      en: "🇺🇸", es: "🇪🇸", pt: "🇵🇹", ru: "🇷🇺", uk: "🇺🇦",
      fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", zh: "🇨🇳", ja: "🇯🇵",
      ar: "🇸🇦", tr: "🇹🇷", pl: "🇵🇱", sv: "🇸🇪", nl: "🇳🇱",
      kk: "🇰🇿", ko: "🇰🇷", he: "🇮🇱", hi: "🇮🇳", fa: "🇮🇷", el: "🇬🇷"
    };

    const langAliasMap: Record<string, string> = {
      sp: "es", spa: "es", spanish: "es", esp: "es",
      eng: "en", english: "en",
      rus: "ru", russian: "ru",
      ger: "de", deu: "de", german: "de", deutsch: "de",
      fra: "fr", fre: "fr", french: "fr",
      por: "pt", portuguese: "pt",
      ita: "it", italian: "it",
      ukr: "uk", ukrainian: "uk",
      kaz: "kk", kazakh: "kk",
      chi: "zh", zho: "zh", chinese: "zh",
      jpn: "ja", japanese: "ja",
      kor: "ko", korean: "ko",
      tur: "tr", turkish: "tr",
      pol: "pl", polish: "pl",
      swe: "sv", swedish: "sv",
      dut: "nl", nld: "nl", dutch: "nl",
      ara: "ar", arabic: "ar"
    };

    const userFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'studyLanguageFlags'").get(userId) as { value: string } | undefined;
    let userCustomFlags: Record<string, string> = {};
    if (userFlagsRow?.value) {
      try { userCustomFlags = JSON.parse(userFlagsRow.value); } catch (_) {}
    }

    const logs = rows.map((h) => {
      const durSec = Number(h.durationSeconds) || 0;
      const rawLang = (h.targetLanguage || "en").toLowerCase().trim();
      const cleanLang = rawLang.replace(/[-_].*$/, "");
      const langCode = langAliasMap[rawLang] || langAliasMap[cleanLang] || cleanLang.slice(0, 2);
      const flag = userCustomFlags[langCode] || flags[langCode] || "🌐";
      const minutes = Math.max(1, Math.round(durSec / 60));
      const videoId = h.lessonId && h.lessonId.startsWith("youtube_") ? h.lessonId.replace("youtube_", "") : "";
      const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (h.sourceUrl || "");

      return {
        id: h.id,
        title: h.lessonTitle || h.customTitle || "YouTube Video",
        minutes,
        durationSeconds: durSec,
        language: langCode,
        flag,
        channel: h.channelName || "YouTube",
        source: h.lessonType === "article" ? "Article" : "YouTube",
        url,
        timestamp: h.timestamp,
      };
    });

    return res.json({ success: true, date: dateStr, logs });
  } catch (err: any) {
    console.error("[GET /api/activity/day] Error:", err);
    return res.status(500).json({ error: "Failed to load day activity: " + err.message });
  }
};

router.get("/activity/day", getDayActivityHandler);
router.get("/history/day", getDayActivityHandler);

// 15e. Delete Activity Log (DELETE /api/activity/log/:id)
router.delete("/activity/log/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ" });
  }

  const { id } = req.params;
  try {
    const db = getDbConnection(userId);
    const result = db.prepare("DELETE FROM reading_history WHERE user_id = ? AND id = ?").run(userId, id);
    return res.json({ success: true, id, changes: result.changes });
  } catch (err: any) {
    console.error("[DELETE /api/activity/log/:id] Error:", err);
    return res.status(500).json({ error: "Failed to delete activity log: " + err.message });
  }
});

// 16. Granular Lesson Update (PATCH /api/lessons/:id and PUT)
const updateLessonHandler = (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { id } = req.params;
  const updates = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing lesson ID" });

  try {
    const db = getDbConnection(userId);
    const channelTitle = updates.channelTitle || updates.channelName || null;
    const channelAvatar = updates.channelAvatar || updates.channelAvatarUrl || null;
    const channelUrl = updates.channelUrl || null;

    db.transaction(() => {
      // 1. Update lessons table
      db.prepare(`
        UPDATE lessons SET
          channelName = COALESCE(?, channelName),
          channelTitle = COALESCE(?, channelTitle),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl)
        WHERE user_id = ? AND id = ?
      `).run(channelTitle, channelTitle, channelAvatar, channelUrl, userId, id);

      // 2. Also update all reading_history rows for this lessonId
      if (channelTitle) {
        db.prepare(`
          UPDATE reading_history SET
            channelName = ?,
            channelAvatarUrl = COALESCE(?, channelAvatarUrl),
            channelUrl = COALESCE(?, channelUrl)
          WHERE user_id = ? AND lessonId = ?
        `).run(channelTitle, channelAvatar, channelUrl, userId, id);
      }
    })();

    console.log(`[SAVED TO DB] Lesson ${id} updated with channel: ${channelTitle}`);
    return res.json({ status: "success", id, channelTitle, channelAvatar, channelUrl });
  } catch (err: any) {
    console.error("[PATCH /api/lessons/:id] Error:", err);
    return res.status(500).json({ error: "Failed to update lesson on server" });
  }
};

router.patch("/lessons/:id", updateLessonHandler);
router.put("/lessons/:id", updateLessonHandler);

router.get("/lessons/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing lesson ID" });

  try {
    const db = getDbConnection(userId);
    const lesson = db.prepare("SELECT * FROM lessons WHERE id = ? AND (user_id = ? OR user_id = 'default')").get(id, userId) as any;
    if (!lesson) {
      const meta = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = ?").get(userId, `audio_progress_${id}`) as { value: string } | undefined;
      if (meta?.value) {
        try {
          const parsed = JSON.parse(meta.value);
          return res.json({ id, audio_progress: parsed.progress ?? parsed.audioProgress, audioProgress: parsed.progress ?? parsed.audioProgress, ...parsed });
        } catch (_) {}
      }
      return res.status(404).json({ error: "Lesson not found" });
    }
    return res.json(lesson);
  } catch (err: any) {
    console.error("[GET /api/lessons/:id] Error:", err);
    return res.status(500).json({ error: "Failed to get lesson" });
  }
});

router.patch("/lessons/:id/progress", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    userId = "default";
  }

  const { id } = req.params;
  const { progress, audioProgress, progressPercent, lastSentenceIndex, status, clientUpdatedAt, updatedAt } = req.body || {};
  const incomingProgress = Number(progress !== undefined ? progress : audioProgress) || 0;
  const incomingTime = Number(clientUpdatedAt || updatedAt) || Date.now();

  if (!id) return res.status(400).json({ error: "Missing lesson ID" });

  try {
    const db = getDbConnection(userId);
    const current = db.prepare("SELECT audio_progress_updated_at FROM lessons WHERE id = ? AND (user_id = ? OR user_id = 'default')").get(id, userId) as { audio_progress_updated_at?: number } | undefined;

    // Если в базе уже есть более свежая запись — отклоняем устаревшие данные
    if (current?.audio_progress_updated_at && current.audio_progress_updated_at > incomingTime) {
      return res.json({ success: false, reason: 'Stale update ignored' });
    }

    try {
      db.prepare(`
        UPDATE lessons 
        SET audio_progress = ?, audio_progress_updated_at = ? 
        WHERE id = ? AND (user_id = ? OR user_id = 'default')
      `).run(incomingProgress, incomingTime, id, userId);
    } catch (_) {
      // Fallback if lessons table column update encounters an issue
    }

    // Всегда сохраняем прогресс в таблицу metadata (UPSERT)
    const metaPayload = JSON.stringify({
      progress: incomingProgress,
      audioProgress: incomingProgress,
      progressPercent: typeof progressPercent === "number" ? progressPercent : undefined,
      lastSentenceIndex: typeof lastSentenceIndex === "number" ? lastSentenceIndex : undefined,
      status: typeof status === "string" ? status : undefined,
      updatedAt: incomingTime,
    });
    db.prepare("INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)").run(userId, `audio_progress_${id}`, metaPayload);

    return res.json({
      success: true,
      audio_progress: incomingProgress,
      audioProgress: incomingProgress,
      audio_progress_updated_at: incomingTime
    });
  } catch (err: any) {
    console.error("[PATCH /api/lessons/:id/progress] Error:", err);
    return res.status(500).json({ error: "Failed to update audio progress: " + (err.message || String(err)) });
  }
});

// ============================================================
// Chrome Extension & External REST Endpoints
// ============================================================

function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.trim();
  }

  try {
    const dom = new JSDOM(`<body>${html}</body>`);
    const doc = dom.window.document;

    // Remove non-content elements
    doc.querySelectorAll("script, style, noscript, svg, button, nav, header, footer, aside, form, input, select, canvas").forEach((el) => el.remove());
    const metaSelectors = [
      '[data-component="byline-block"]',
      '[data-testid="byline"]',
      '[data-testid="timestamp"]',
      '.article__byline',
      '.byline',
      'time',
      'header [data-component="headline-block"] ~ div:not([data-component="text-block"])'
    ];
    metaSelectors.forEach(sel => {
      try {
        doc.querySelectorAll(sel).forEach(el => el.remove());
      } catch (_) {}
    });

    // Replace <figure> elements
    doc.querySelectorAll("figure").forEach((fig) => {
      const img = fig.querySelector("img");
      const figcaption = fig.querySelector("figcaption");
      let src = "";
      if (img) {
        src = img.getAttribute("data-src") || img.getAttribute("src") || "";
        if (!src && img.getAttribute("srcset")) {
          const parts = img.getAttribute("srcset")!.split(",");
          const last = parts[parts.length - 1].trim().split(/\s+/)[0];
          if (last) src = last;
        }
      }
      const rawCap = (figcaption?.textContent || "").trim().replace(/\s+/g, " ");
      const cap = rawCap.replace(/^image caption[:,]?\s*/i, "").trim();
      let markerText = "";
      if (src && !src.startsWith("data:") && !src.includes("placeholder") && !src.includes("grey-")) {
        markerText += `[IMG:${src}]`;
      }
      if (cap) {
        markerText += (markerText ? "\n" : "") + `[CAPTION:${cap}]`;
      }
      if (markerText) {
        const p = doc.createElement("p");
        p.textContent = markerText;
        fig.replaceWith(p);
      } else {
        fig.remove();
      }
    });

    // Replace any remaining images with placeholders
    doc.querySelectorAll("img").forEach((img) => {
      let src = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (!src && img.getAttribute("srcset")) {
        const parts = img.getAttribute("srcset")!.split(",");
        const last = parts[parts.length - 1].trim().split(/\s+/)[0];
        if (last) src = last;
      }
      if (src && !src.startsWith("data:") && !src.includes("placeholder") && !src.includes("grey-")) {
        const p = doc.createElement("p");
        p.textContent = `[IMG:${src}]`;
        img.replaceWith(p);
      } else {
        img.remove();
      }
    });

    // Convert headings
    doc.querySelectorAll("h1, h2").forEach((h) => {
      const txt = (h.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `## ${txt} ##`;
        h.replaceWith(p);
      } else {
        h.remove();
      }
    });
    doc.querySelectorAll("h3, h4, h5, h6").forEach((h) => {
      const txt = (h.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `# ${txt} #`;
        h.replaceWith(p);
      } else {
        h.remove();
      }
    });

    // Convert list items
    doc.querySelectorAll("li").forEach((li) => {
      const txt = (li.textContent || "").trim().replace(/\s+/g, " ");
      if (txt) {
        const p = doc.createElement("p");
        p.textContent = `• ${txt}`;
        li.replaceWith(p);
      } else {
        li.remove();
      }
    });

    // Extract pure text from body children without <p>, <b>, <ul>
    return Array.from(doc.body.childNodes)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join("\n\n");
  } catch (err) {
    console.warn("[htmlToPlainText] Parsing failed, fallback:", err);
    return html.replace(/<[^>]+>/g, "").trim();
  }
}

// 1. Create/Import Lesson (One-Click Article / Content Importer)
router.post("/lessons", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const {
    id,
    title,
    text,
    content,
    targetLanguage,
    language,
    translationLanguage,
    sourceUrl,
    coverUrl,
    lessonType,
    author,
    channelTitle
  } = req.body;

  const rawText = (text || content || "").trim();
  const cleanText = htmlToPlainText(rawText);
  const cleanTitle = (title || "Imported Article").replace(/<[^>]+>/g, "").trim();
  const targetLang = (targetLanguage || language || "es").trim();
  const transLang = (translationLanguage || "ru").trim();

  // For text/article lessons: audioUrl, audioFile, youtubeId must be strictly null!
  const isVideoOrAudio = lessonType === 'video' || lessonType === 'podcast' || lessonType === 'youtube';
  const incomingAudio = (req.body.audioUrl || req.body.audio_url || "").trim();
  const isMediaStream = incomingAudio && (
    /youtube\.com|youtu\.be/i.test(incomingAudio) ||
    /\.(mp3|m4a|wav|ogg|aac|flac|mp4|webm|m3u8)(\?.*)?$/i.test(incomingAudio) ||
    incomingAudio.startsWith('/api/audio-files/')
  );

  const resolvedAudioUrl = (isVideoOrAudio && isMediaStream) ? incomingAudio : null;
  const type = (resolvedAudioUrl || isVideoOrAudio) ? (lessonType || 'video') : 'article';
  const lessonId = id || ("ext_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7));

  if (!cleanText) {
    return res.status(400).json({ error: "Lesson text/content is required" });
  }

  try {
    const db = getDbConnection(userId);
    const now = Date.now();

    db.transaction(() => {
      // 1. Insert lesson
      db.prepare(`
        INSERT INTO lessons (
          id, user_id, title, text, audioUrl, targetLanguage, translationLanguage,
          isBuiltIn, isArchived, coverUrl, lessonType, pinned, createdAt, channelTitle, channelUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          text = excluded.text,
          audioUrl = excluded.audioUrl,
          targetLanguage = excluded.targetLanguage,
          translationLanguage = excluded.translationLanguage,
          coverUrl = COALESCE(excluded.coverUrl, lessons.coverUrl),
          channelTitle = COALESCE(excluded.channelTitle, lessons.channelTitle),
          channelUrl = COALESCE(excluded.channelUrl, lessons.channelUrl)
      `).run(
        lessonId,
        userId,
        cleanTitle,
        cleanText,
        resolvedAudioUrl,
        targetLang,
        transLang,
        coverUrl || null,
        type,
        now,
        author || channelTitle || null,
        sourceUrl || null
      );

      // 2. Add initial reading history item
      const historyId = "hist_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
          timestamp, actionType, status, durationSeconds, channelTitle, channelUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'opened', 'reading', 0, ?, ?)
      `).run(
        historyId,
        userId,
        lessonId,
        cleanTitle,
        type,
        coverUrl || null,
        targetLang,
        new Date().toISOString(),
        author || channelTitle || null,
        sourceUrl || null
      );
    })();

    console.log(`[EXTENSION API] Imported lesson '${cleanTitle}' (${lessonId}) for user ${userId}`);
    return res.json({
      status: "success",
      id: lessonId,
      lesson: {
        id: lessonId,
        title: cleanTitle,
        targetLanguage: targetLang,
        translationLanguage: transLang,
        lessonType: type,
        sourceType: type,
        sourceUrl: sourceUrl || null,
        audioUrl: resolvedAudioUrl,
        audioFile: null,
        youtubeId: null,
        createdAt: now
      }
    });
  } catch (err: any) {
    console.error("[POST /api/lessons] Error importing lesson:", err);
    return res.status(500).json({ error: "Failed to save lesson: " + err.message });
  }
});

// 2. Save / Update Word (Vocabulary Item)
router.post("/words", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const {
    word,
    translation,
    definition,
    ipa,
    grammar,
    contextRelation,
    status,
    examples,
    contextSentence,
    contextTranslation,
    targetLanguage,
    language,
    language_code,
    tags,
    imageUrl
  } = req.body;

  const rawWord = (word || "").trim();
  if (!rawWord) {
    return res.status(400).json({ error: "Word is required" });
  }

  const rawLang = (language_code || targetLanguage || language || "English").trim();
  const langName = normalizeLang(rawLang);
  const langLower = langName.toLowerCase();
  const wordStatus = String(status || "1"); // default to stage 1 (Learning)
  let wordTranslation = (translation || "").trim();
  const invalidPlaceholders = ['translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден'];
  if (invalidPlaceholders.includes(wordTranslation.toLowerCase()) || wordTranslation.toLowerCase() === rawWord.toLowerCase()) {
    wordTranslation = "";
  }
  const wordDefinition = definition ? String(definition).trim() : null;
  const wordIpa = ipa ? String(ipa).trim() : "";
  const wordGrammar = grammar ? String(grammar).trim() : "";
  const wordContext = contextRelation ? String(contextRelation).trim() : (contextSentence ? String(contextSentence).trim() : "");
  
  // Format examples array
  let exampleList: Array<{ text: string; translation: string }> = [];
  if (Array.isArray(examples) && examples.length > 0) {
    exampleList = examples;
  } else if (contextSentence && String(contextSentence).trim()) {
    exampleList = [{
      text: String(contextSentence).trim(),
      translation: contextTranslation ? String(contextTranslation).trim() : ""
    }];
  }

  const examplesJson = JSON.stringify(exampleList);
  const tagsJson = tags ? (Array.isArray(tags) ? JSON.stringify(tags) : String(tags)) : JSON.stringify([]);
  const now = Date.now();

  try {
    const db = getDbConnection(userId);

    // Ensure language exists in canonical form
    db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `).run(langName, langName);

    const newWordId = `${userId}_${langLower}_${rawWord.toLowerCase()}`;

    // Perform atomic upsert with user isolation
    const existing = db.prepare("SELECT id, translation FROM words WHERE user_id = ? AND language_code = ? AND word = ?").get(userId, langName, rawWord) as any;

    if (existing) {
      db.prepare(`
        UPDATE words SET
          translation = CASE WHEN ? != '' THEN ? ELSE words.translation END,
          definition = COALESCE(?, definition),
          ipa = CASE WHEN ? != '' THEN ? ELSE ipa END,
          grammar = CASE WHEN ? != '' THEN ? ELSE grammar END,
          contextRelation = CASE WHEN ? != '' THEN ? ELSE contextRelation END,
          status = ?,
          tags = ?,
          imageUrl = COALESCE(?, imageUrl),
          examples = CASE WHEN ? != '[]' THEN ? ELSE examples END
        WHERE user_id = ? AND language_code = ? AND word = ?
      `).run(
        wordTranslation, wordTranslation,
        wordDefinition,
        wordIpa, wordIpa,
        wordGrammar, wordGrammar,
        wordContext, wordContext,
        wordStatus,
        tagsJson,
        imageUrl || null,
        examplesJson, examplesJson,
        userId,
        langName,
        rawWord
      );
    } else {
      db.prepare(`
        INSERT INTO words (
          id, user_id, language_code, word, translation, definition,
          ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          examples = CASE WHEN excluded.examples != '[]' THEN excluded.examples ELSE words.examples END,
          imageUrl = COALESCE(excluded.imageUrl, words.imageUrl)
      `).run(
        newWordId,
        userId,
        langName,
        rawWord,
        wordTranslation,
        wordDefinition,
        wordIpa,
        wordGrammar,
        wordContext,
        wordStatus,
        now,
        tagsJson,
        imageUrl || null,
        examplesJson
      );
    }

    console.log(`[EXTENSION API] Word saved: '${rawWord}' -> '${wordTranslation}' (${wordStatus}) [${langName}] for user "${userId}"`);
    return res.json({
      status: "success",
      userId,
      word: rawWord,
      language: langName,
      wordStatus,
      translation: wordTranslation
    });
  } catch (err: any) {
    console.error("[POST /api/words] Error saving word:", err);
    return res.status(500).json({ error: "Failed to save word: " + err.message });
  }
});

// 3. Get Words List / Dictionary Map (For extension caching & in-situ highlights)
router.get("/words", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const rawLang = (req.query.lang || req.query.language || req.query.language_code || "").toString().trim();
  const statusFilter = req.query.status ? String(req.query.status).trim() : null;

  try {
    const db = getDbConnection(userId);
    let query = "SELECT word, translation, status, language_code, ipa, grammar, examples, createdAt FROM words WHERE user_id = ?";
    const params: any[] = [userId];

    if (rawLang) {
      const canonicalLang = normalizeLang(rawLang);
      query += " AND (lower(language_code) = ? OR lower(language_code) = ?)";
      params.push(canonicalLang.toLowerCase(), rawLang.toLowerCase());
    }
    if (statusFilter) {
      query += " AND status = ?";
      params.push(statusFilter);
    }

    query += " ORDER BY createdAt DESC";

    const rows = db.prepare(query).all(...params) as any[];
    const map: Record<string, { status: string; translation: string; ipa?: string; language?: string }> = {};

    for (const r of rows) {
      if (r.word) {
        const cleanWord = r.word.toLowerCase().trim();
        let trans = (r.translation || "").trim();
        const invalidPlaceholders = ['translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден'];
        if (invalidPlaceholders.includes(trans.toLowerCase()) || trans.toLowerCase() === cleanWord) {
          trans = "";
        }
        map[cleanWord] = {
          status: r.status,
          translation: trans,
          ipa: r.ipa || "",
          language: r.language_code || ""
        };
      }
    }

    console.log(`[GET /api/words] Returned ${rows.length} words for user "${userId}" (lang filter: "${rawLang || 'ALL'}")`);
    return res.json({
      status: "ok",
      count: rows.length,
      userId,
      words: rows,
      map
    });
  } catch (err: any) {
    console.error("[GET /api/words] Error fetching words:", err);
    return res.status(500).json({ error: "Failed to fetch words: " + err.message });
  }
});

// 3.1 Batch Word Status Lookup (strictly filtered by language & user_id)
router.post("/words/batch-status", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { words, language, language_code, targetLanguage } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.json({ status: "ok", results: {}, map: {} });
  }

  const rawLang = (language_code || targetLanguage || language || "English").trim();
  const canonicalLang = normalizeLang(rawLang);

  const cleanWords = Array.from(new Set(words.map((w: any) => String(w || "").trim().toLowerCase()).filter(Boolean)));
  if (cleanWords.length === 0) {
    return res.json({ status: "ok", results: {}, map: {} });
  }

  try {
    const db = getDbConnection(userId);
    const chunkSize = 400;
    const map: Record<string, { status: string; translation: string; ipa?: string; language: string }> = {};

    for (let i = 0; i < cleanWords.length; i += chunkSize) {
      const chunk = cleanWords.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const query = `
        SELECT word, translation, status, language_code, ipa
        FROM words
        WHERE user_id = ?
          AND (lower(language_code) = ? OR lower(language_code) = ?)
          AND lower(word) IN (${placeholders})
      `;
      const params = [userId, canonicalLang.toLowerCase(), rawLang.toLowerCase(), ...chunk];
      const rows = db.prepare(query).all(...params) as any[];

      for (const r of rows) {
        if (r.word) {
          const wLower = r.word.toLowerCase().trim();
          let trans = (r.translation || "").trim();
          const invalidPlaceholders = ['translating...', 'loading...', '—', '— (нет данных)', 'перевод не найден'];
          if (invalidPlaceholders.includes(trans.toLowerCase()) || trans.toLowerCase() === wLower) {
            trans = "";
          }
          map[wLower] = {
            status: r.status,
            translation: trans,
            ipa: r.ipa || "",
            language: r.language_code || canonicalLang
          };
        }
      }
    }

    console.log(`[POST /api/words/batch-status] Checked ${cleanWords.length} words for user "${userId}" [${canonicalLang}] -> matched ${Object.keys(map).length}`);
    return res.json({
      status: "ok",
      language: canonicalLang,
      count: Object.keys(map).length,
      map,
      results: map
    });
  } catch (err: any) {
    console.error("[POST /api/words/batch-status] Error:", err);
    return res.status(500).json({ error: "Failed to batch lookup words: " + err.message });
  }
});

// 21. POST /api/word-links: Save morphological parent-child link (e.g. were -> be)
router.post("/word-links", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { word_from, word_to, from, to, language, language_code } = req.body;
  const sourceWord = String(word_from || from || "").trim().toLowerCase();
  const targetWord = String(word_to || to || "").trim().toLowerCase();
  const rawLang = String(language_code || language || "English").trim();
  const langName = normalizeLang(rawLang);
  const langLower = langName.toLowerCase();

  if (!sourceWord || !targetWord) {
    return res.status(400).json({ error: "word_from and word_to are required" });
  }

  if (sourceWord === targetWord) {
    return res.json({ status: "noop", message: "Source and target words are identical" });
  }

  try {
    const db = getDbConnection(userId);

    // Save link to word_links table
    db.prepare(`
      INSERT OR REPLACE INTO word_links (user_id, language_code, word_from, word_to)
      VALUES (?, ?, ?, ?)
    `).run(userId, langName, sourceWord, targetWord);

    // Check if target parent lemma exists in words table to inherit status & translation
    const parentRow = db.prepare(`
      SELECT status, translation, definition, ipa, grammar FROM words
      WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?) AND lower(word) = ?
    `).get(userId, langLower, rawLang.toLowerCase(), targetWord) as any;

    let inheritedStatus = parentRow?.status || "new";
    let inheritedTranslation = parentRow?.translation || "";

    if (parentRow) {
      // Update child word to inherit parent's status
      const existingChild = db.prepare(`
        SELECT id FROM words
        WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?) AND lower(word) = ?
      `).get(userId, langLower, rawLang.toLowerCase(), sourceWord) as any;

      if (existingChild) {
        db.prepare(`
          UPDATE words SET
            status = ?,
            translation = CASE WHEN translation = '' OR translation IS NULL THEN ? ELSE translation END
          WHERE user_id = ? AND id = ?
        `).run(parentRow.status, parentRow.translation || "", userId, existingChild.id);
      } else {
        const newChildId = `${userId}_${langLower}_${sourceWord}`;
        db.prepare(`
          INSERT INTO words (
            id, user_id, language_code, word, translation, definition, ipa, grammar,
            contextRelation, status, createdAt, tags, imageUrl, examples
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]')
          ON CONFLICT(id) DO UPDATE SET status = excluded.status
        `).run(
          newChildId,
          userId,
          langName,
          sourceWord,
          parentRow.translation || "",
          parentRow.definition || null,
          parentRow.ipa || null,
          parentRow.grammar || null,
          `Форма от базового слова "${targetWord}"`,
          parentRow.status || "1",
          Date.now(),
          JSON.stringify(["child_form", "morphology"])
        );
      }
    }

    console.log(`[POST /api/word-links] Linked "${sourceWord}" ➔ "${targetWord}" for user "${userId}" (${langName}), inherited status: "${inheritedStatus}"`);
    return res.json({
      status: "ok",
      from: sourceWord,
      to: targetWord,
      parentStatus: inheritedStatus,
      parentTranslation: inheritedTranslation
    });
  } catch (err: any) {
    console.error("[POST /api/word-links] Error saving word link:", err);
    return res.status(500).json({ error: "Failed to save word link: " + err.message });
  }
});

// 22. GET /api/word-links: Get all word links for user & language
router.get("/word-links", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const rawLang = ((req.query.language || req.query.language_code || "") as string).trim();

  try {
    const db = getDbConnection(userId);
    let rows: Array<{ language_code: string; word_from: string; word_to: string }> = [];

    if (rawLang) {
      const langName = normalizeLang(rawLang);
      const langLower = langName.toLowerCase();
      rows = db.prepare(`
        SELECT language_code, word_from, word_to FROM word_links
        WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?)
      `).all(userId, langLower, rawLang.toLowerCase()) as any[];
    } else {
      rows = db.prepare(`
        SELECT language_code, word_from, word_to FROM word_links
        WHERE user_id = ?
      `).all(userId) as any[];
    }

    const linksMap: Record<string, string> = {};
    for (const r of rows) {
      if (r.word_from && r.word_to) {
        linksMap[r.word_from.toLowerCase().trim()] = r.word_to.toLowerCase().trim();
      }
    }

    return res.json({
      status: "ok",
      count: rows.length,
      links: linksMap,
      rawLinks: rows
    });
  } catch (err: any) {
    console.error("[GET /api/word-links] Error fetching word links:", err);
    return res.status(500).json({ error: "Failed to fetch word links: " + err.message });
  }
});

export default router;
