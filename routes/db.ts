import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
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

    // Language flags — global (shared across users)
    const langRows = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL").all() as { code: string; flag: string }[];
    const languageFlags: Record<string, string> = {};
    for (const row of langRows) {
      languageFlags[row.code] = row.flag;
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
      vocabWords[w.id] = {
        word: w.word,
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
        id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation, createdAt, wordTimestamps, channelName, channelAvatarUrl, channelUrl, playlistId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

      const vocabWords = data.vocab || {};
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

        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
        insertWord.run(
          key,
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

      const links = data.wordLinks || {};
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
          l.channelName || null,
          l.channelAvatarUrl || null,
          l.playlistId || null
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
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (Array.isArray(data.deletedHistoryIds) && data.deletedHistoryIds.length > 0) {
        const placeholders = data.deletedHistoryIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedHistoryIds);
      }

      if (Array.isArray(data.history)) {
        const historyList = data.history;
        for (const h of historyList) {
          if (!h || !h.id) continue;
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
            h.durationSeconds || 0,
            h.notes || null,
            h.channelName || null,
            h.channelAvatarUrl || null
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

export default router;
