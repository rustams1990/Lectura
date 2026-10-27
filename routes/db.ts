import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { getDbConnection, getUserDbVersion, touchUserDbVersion } from "./dbConnection.ts";
import { resolveUserId, handleAuthError } from "./auth.ts";
import { analyzeTextComplexity } from "../server/frequency/frequencyService.ts";
import { cleanWordPrefix, deduplicateDbPlaylistItems, LANG_MAP, normalizeLang } from "./htmlTextUtils.ts";
import { handleDictionaryExplain } from "./dictionaryLookup.ts";
import vocabRouter, { normalizeCanonicalWord } from "./vocabRoutes.ts";

export { LANG_MAP, normalizeLang };

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AUDIO_STORAGE_DIR = path.join(DATA_DIR, "audio_files");

// Helper to offload heavy base64 audio payload from DB/RAM into static MP3 files on disk
function saveAudioBase64ToDisk(lessonId: string, base64OrDataUrl: string, userId: string = "default"): string | null {
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

    const safeUser = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeLessonId = String(lessonId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = safeUser === "default" ? `${safeLessonId}.${ext}` : `${safeUser}_${safeLessonId}.${ext}`;
    const filePath = path.join(AUDIO_STORAGE_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    return `/api/audio-files/${fileName}`;
  } catch (err) {
    console.error(`[saveAudioBase64ToDisk] Failed to save audio for lesson ${lessonId}:`, err);
    return null;
  }
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
      "SELECT *, rowid FROM lessons WHERE user_id = ? AND (length(trim(COALESCE(text, ''))) > 0 OR isBuiltIn = 1 OR (wordTimestamps IS NOT NULL AND length(wordTimestamps) > 2)) ORDER BY COALESCE(createdAt, rowid * 1000) DESC"
    ).all(userId) as any[];
    const updateAudioStmt = db.prepare("UPDATE lessons SET audioUrl = ?, audioBase64 = NULL WHERE id = ? AND user_id = ?");

    const lessons = lessonsRows.map((l) => {
      let currentAudioUrl = l.audioUrl;
      let currentAudioBase64 = l.audioBase64;

      // Automatic Migration: If SQLite contains legacy base64 string, offload to disk file and clear base64 from DB/RAM
      if (currentAudioBase64 && typeof currentAudioBase64 === "string" && currentAudioBase64.length > 50) {
        const savedFileUrl = saveAudioBase64ToDisk(l.id, currentAudioBase64, userId);
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

      if (l && typeof l.wordTimestamps === 'string') {
        try { l.wordTimestamps = JSON.parse(l.wordTimestamps); } catch (_) { l.wordTimestamps = null; }
      }

      return {
        id: l.id,
        title: l.title,
        text: l.text,
        audioUrl: currentAudioUrl,
        audioBase64: null,
        targetLanguage: normalizeLang(l.targetLanguage || "English"),
        translationLanguage: normalizeLang(l.translationLanguage || "Russian"),
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
        duration: l.duration ?? l.durationSeconds ?? (l.youtubeDuration || null),
        durationSeconds: l.durationSeconds ?? l.duration ?? null,
        youtubeDuration: l.youtubeDuration ?? l.duration ?? null,
        audioDuration: l.audioDuration ?? null,
        sourceType: l.sourceType || (
          l.lessonType === "youtube" ? "youtube" :
          (l.lessonType === "podcast" || l.lessonType === "audio") ? "podcast" :
          (l.lessonType === "article" || l.lessonType === "website" || l.lessonType === "news") ? "article" :
          (l.lessonType === "book" || l.epub || l.pdf) ? "book" :
          (l.lessonType || "article")
        ),
        wordCount: l.wordCount ?? null,
        primaryTag: l.primaryTag || undefined,
        tags: l.tags ? (typeof l.tags === "string" ? JSON.parse(l.tags) : l.tags) : [],
      };
    });


    // Playlists — strictly this user's
    const playlistsRows = db.prepare(
      "SELECT * FROM playlists WHERE user_id = ? ORDER BY COALESCE(pinned, 0) DESC, COALESCE(orderIndex, 0) ASC, COALESCE(createdAt, rowid * 1000) DESC"
    ).all(userId) as any[];
    const playlists = playlistsRows.map((p) => {
      const parsedItems = p.items ? (typeof p.items === "string" ? JSON.parse(p.items) : p.items) : [];
      const cleanItems = deduplicateDbPlaylistItems(parsedItems);
      return {
        id: p.id,
        title: p.title,
        description: p.description || undefined,
        thumbnailUrl: p.thumbnailUrl || "",
        sourceType: p.sourceType || "custom_collection",
        externalUrl: p.externalUrl || undefined,
        channelTitle: p.channelTitle || undefined,
        itemCount: cleanItems.length,
        language: p.language || "en",
        items: cleanItems,
        isArchived: p.isArchived === 1,
        primaryTag: p.primaryTag || undefined,
        tags: p.tags ? (typeof p.tags === "string" ? JSON.parse(p.tags) : p.tags) : [],
        order: typeof p.orderIndex === "number" ? p.orderIndex : 0,
        pinned: p.pinned === 1,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
      };
    });

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
        audioClipUrl: w.audioClipUrl,
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
        duration: h.duration !== null && h.duration !== undefined ? Number(h.duration) : undefined,
        notes: h.notes || undefined,
        channelName: h.channelName || null,
        channelAvatarUrl: h.channelAvatarUrl || null,
        channelUrl: h.channelUrl || undefined,
        category: h.category || undefined,
        customTitle: h.customTitle || undefined,
        mode: h.mode || undefined,
        tags: h.tags ? (typeof h.tags === "string" ? JSON.parse(h.tags) : h.tags) : [],
        primaryTag: h.primaryTag || undefined,
        lastPosition: h.lastPosition !== null && h.lastPosition !== undefined ? Number(h.lastPosition) : undefined,
        audioUrl: h.audioUrl || undefined,
        guid: h.guid || undefined,
        podcastTitle: h.podcastTitle || undefined,
        youtubeId: h.youtubeId || undefined,
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

    // Merge authoritative user_settings (which stores settings via PATCH /api/user/settings)
    // so readerSettings is never missing fields like ttsLocales
    try {
      const userSettingsRow = db.prepare("SELECT settings FROM user_settings WHERE user_id = ?").get(userId) as any;
      if (userSettingsRow?.settings) {
        const parsedUser = JSON.parse(userSettingsRow.settings);
        readerSettings = {
          ...(readerSettings || {}),
          ...parsedUser,
          ttsLocales: {
            ...(readerSettings?.ttsLocales || {}),
            ...(parsedUser.ttsLocales || {})
          }
        };
      }
    } catch (_) {}

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
        id, user_id, language_code, word, translation, definition, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, audioClipUrl, examples,
        spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
        srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWordLink = db.prepare(`
      INSERT OR REPLACE INTO word_links (user_id, language_code, word_from, word_to) VALUES (?, ?, ?, ?)
    `);

    const insertLesson = db.prepare(`
      INSERT INTO lessons (
        id, user_id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation, createdAt, wordTimestamps, channelName, channelAvatarUrl, channelUrl, playlistId, images, audioProgress, sourceType, primaryTag, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        title = excluded.title,
        text = excluded.text,
        audioUrl = excluded.audioUrl,
        audioBase64 = excluded.audioBase64,
        targetLanguage = excluded.targetLanguage,
        translationLanguage = excluded.translationLanguage,
        isBuiltIn = excluded.isBuiltIn,
        isArchived = excluded.isArchived,
        coverUrl = excluded.coverUrl,
        youtubeId = excluded.youtubeId,
        localVideoUrl = excluded.localVideoUrl,
        lessonType = excluded.lessonType,
        pinned = excluded.pinned,
        translationText = excluded.translationText,
        detectedPhrases = excluded.detectedPhrases,
        difficulty = COALESCE(excluded.difficulty, lessons.difficulty),
        difficultyExplanation = COALESCE(excluded.difficultyExplanation, lessons.difficultyExplanation),
        createdAt = COALESCE(lessons.createdAt, excluded.createdAt),
        wordTimestamps = excluded.wordTimestamps,
        channelName = COALESCE(excluded.channelName, lessons.channelName),
        channelAvatarUrl = COALESCE(excluded.channelAvatarUrl, lessons.channelAvatarUrl),
        channelUrl = COALESCE(excluded.channelUrl, lessons.channelUrl),
        playlistId = excluded.playlistId,
        images = excluded.images,
        audioProgress = excluded.audioProgress,
        sourceType = excluded.sourceType,
        primaryTag = excluded.primaryTag,
        tags = excluded.tags
    `);

    const insertPlaylist = db.prepare(`
      INSERT OR REPLACE INTO playlists (
        id, user_id, title, description, thumbnailUrl, sourceType, externalUrl, channelTitle, itemCount, language, items, isArchived, createdAt, updatedAt, primaryTag, tags, orderIndex, pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertItemTag = db.prepare(`
      INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)
    `);

    const insertLessonType = db.prepare(`
      INSERT OR REPLACE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)
    `);

    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, ?, ?)
    `);

    let writtenWordsCount = 0;
    let writtenLessonsCount = 0;

    db.transaction(() => {
      const ensuredLangs = new Set<string>();
      const ensureLangCached = (lang: string) => {
        if (!lang || ensuredLangs.has(lang)) return;
        ensuredLangs.add(lang);
        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
      };

      const flags = data.languageFlags || {};
      for (const [lang, flag] of Object.entries(flags)) {
        const name = lang.charAt(0).toUpperCase() + lang.slice(1);
        insertLanguage.run(lang, name, flag as string);
        ensuredLangs.add(lang);
      }
      if (data.languageFlags && typeof data.languageFlags === "object") {
        insertMetadata.run(userId, "languageFlags", JSON.stringify(data.languageFlags));
      }

      // Process explicit word deletions if provided
      if (Array.isArray(data.deletedWordKeys) && data.deletedWordKeys.length > 0) {
        const delWordByIdStmt = db.prepare("DELETE FROM words WHERE user_id = ? AND id = ?");
        const delWordByLangWordStmt = db.prepare("DELETE FROM words WHERE user_id = ? AND lower(language_code) = ? AND lower(word) = ?");
        for (const rawKey of data.deletedWordKeys) {
          if (!rawKey || typeof rawKey !== "string") continue;
          delWordByIdStmt.run(userId, `${userId}_${rawKey.toLowerCase()}`);
          const m = rawKey.match(/^([a-zA-Z]+)_(.*)$/);
          if (m) {
            delWordByLangWordStmt.run(userId, m[1].toLowerCase(), m[2].toLowerCase());
          }
        }
      }

      const vocabWords = data.vocab || {};
      const incomingVocabKeys = Object.keys(vocabWords);
      const isDeltaSync = Boolean(data.isDelta);
      const existingWordCount = !isDeltaSync
        ? ((db.prepare("SELECT COUNT(*) as count FROM words WHERE user_id = ?").get(userId) as any)?.count || 0)
        : 0;

      if (!isDeltaSync && existingWordCount > 0 && incomingVocabKeys.length === 0) {
        console.warn(`[SAFETY GUARD] Blocked attempt to overwrite ${existingWordCount} words with 0 words for user ${userId}`);
      } else if (incomingVocabKeys.length > 0) {
        // Load existing rows to skip identical records and avoid unnecessary WAL disk writes
        const existingWordsMap = new Map<string, any>();
        const selectSingleWordStmt = incomingVocabKeys.length <= 25
          ? db.prepare(
              `SELECT id, translation, definition, ipa, grammar, contextRelation, status, tags, imageUrl, audioClipUrl, examples,
                      spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
                      srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
               FROM words WHERE id = ? AND user_id = ?`
            )
          : null;
        if (incomingVocabKeys.length > 25) {
          const existingRows = db.prepare(
            `SELECT id, translation, definition, ipa, grammar, contextRelation, status, tags, imageUrl, audioClipUrl, examples,
                    spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude,
                    srsNextReview, srsInterval, srsEaseFactor, srsRepetitions
             FROM words WHERE user_id = ?`
          ).all(userId) as any[];
          for (const row of existingRows) {
            existingWordsMap.set(row.id, row);
          }
        }

        for (const [key, value] of Object.entries(vocabWords)) {
          const match = key.match(/^([a-zA-Z]+)[_:](.*)$/);
          const val = value as any;
          const lang = (match ? match[1] : (val?.language || "english")).toLowerCase();
          const wordVal = cleanWordPrefix(val.word || (match ? match[2] : key));
          const canonicalWordVal = normalizeCanonicalWord(wordVal, lang);

          if (!canonicalWordVal || canonicalWordVal.length > 80 || /[\r\n\t]/.test(canonicalWordVal)) {
            continue;
          }

          const tagsJson = (val.tags && Array.isArray(val.tags) && val.tags.length > 0) ? JSON.stringify(val.tags) : null;
          const examplesJson = (val.examples && Array.isArray(val.examples) && val.examples.length > 0) ? JSON.stringify(val.examples) : null;

          const wordKey = `${lang}_${canonicalWordVal.toLowerCase()}`;
          const wordId = `${userId}_${wordKey}`;

          const nextTranslation = val.translation || "";
          const nextDefinition = (val.definition && typeof val.definition === "string" && val.definition.trim() !== "") ? val.definition.trim() : null;
          const nextIpa = val.ipa || "";
          const nextGrammar = val.grammar || "";
          const nextContextRelation = val.contextRelation || "";
          const nextStatus = val.status || "new";
          const nextImageUrl = val.imageUrl || null;
          const nextAudioClipUrl = val.audioClipUrl || null;
          const nextSpellCorrect = val.spellingCorrectCount || 0;
          const nextSpellIncorrect = val.spellingIncorrectCount || 0;
          const nextSpellAccent = val.spellingAccentCount || 0;
          const nextLastSpelled = val.lastSpelledCorrectly === true ? 1 : val.lastSpelledCorrectly === false ? 0 : null;
          const nextLastAccentErr = val.lastSpelledWithAccentError ? 1 : 0;
          const nextSpellExclude = val.spellingExclude ? 1 : 0;
          const nextSrsReview = val.srsNextReview || null;
          const nextSrsInterval = val.srsInterval || null;
          const nextSrsEase = val.srsEaseFactor || null;
          const nextSrsReps = val.srsRepetitions || null;

          const existingW = selectSingleWordStmt
            ? (selectSingleWordStmt.get(wordId, userId) as any)
            : existingWordsMap.get(wordId);
          if (
            existingW &&
            existingW.status === nextStatus &&
            existingW.translation === nextTranslation &&
            existingW.definition === nextDefinition &&
            existingW.ipa === nextIpa &&
            existingW.grammar === nextGrammar &&
            existingW.contextRelation === nextContextRelation &&
            existingW.tags === tagsJson &&
            existingW.imageUrl === nextImageUrl &&
            existingW.audioClipUrl === nextAudioClipUrl &&
            existingW.examples === examplesJson &&
            (existingW.spellingCorrectCount || 0) === nextSpellCorrect &&
            (existingW.spellingIncorrectCount || 0) === nextSpellIncorrect &&
            (existingW.spellingAccentCount || 0) === nextSpellAccent &&
            existingW.lastSpelledCorrectly === nextLastSpelled &&
            (existingW.lastSpelledWithAccentError || 0) === nextLastAccentErr &&
            (existingW.spellingExclude || 0) === nextSpellExclude &&
            existingW.srsNextReview === nextSrsReview &&
            existingW.srsInterval === nextSrsInterval &&
            existingW.srsEaseFactor === nextSrsEase &&
            existingW.srsRepetitions === nextSrsReps
          ) {
            continue;
          }

          ensureLangCached(lang);
          insertWord.run(
            wordId,
            userId,
            lang,
            canonicalWordVal,
            nextTranslation,
            nextDefinition,
            nextIpa,
            nextGrammar,
            nextContextRelation,
            nextStatus,
            val.createdAt || Date.now(),
            tagsJson,
            nextImageUrl,
            nextAudioClipUrl,
            examplesJson,
            nextSpellCorrect,
            nextSpellIncorrect,
            nextSpellAccent,
            nextLastSpelled,
            nextLastAccentErr,
            nextSpellExclude,
            nextSrsReview,
            nextSrsInterval,
            nextSrsEase,
            nextSrsReps
          );
          writtenWordsCount++;
        }
      }

      const links = data.wordLinks || {};
      const incomingLinkKeys = Object.keys(links);
      const existingLinksCount = !isDeltaSync
        ? ((db.prepare("SELECT COUNT(*) as count FROM word_links WHERE user_id = ?").get(userId) as any)?.count || 0)
        : 0;

      if (!isDeltaSync && existingLinksCount > 0 && incomingLinkKeys.length === 0) {
        console.warn(`[SAFETY GUARD] Blocked attempt to overwrite ${existingLinksCount} word_links with 0 links for user ${userId}`);
      } else if (incomingLinkKeys.length > 0) {
        const existingLinksSet = new Set<string>();
        if (incomingLinkKeys.length > 10) {
          const existingLinkRows = db.prepare("SELECT language_code, word_from, word_to FROM word_links WHERE user_id = ?").all(userId) as any[];
          for (const r of existingLinkRows) {
            existingLinksSet.add(`${r.language_code}|${r.word_from}|${r.word_to}`);
          }
        }
        for (const [key, val] of Object.entries(links)) {
          if (!val || typeof val !== "string") continue;
          const matchKey = key.match(/^([a-zA-Z]+)_(.*)$/);
          const matchVal = (val as string).match(/^([a-zA-Z]+)_(.*)$/);
          
          if (!matchKey && !matchVal) {
            continue;
          }

          const lang = (matchKey ? matchKey[1] : matchVal![1]).toLowerCase();
          const cleanFrom = cleanWordPrefix(key);
          const cleanTo = cleanWordPrefix(val as string);
          if (existingLinksSet.has(`${lang}|${cleanFrom}|${cleanTo}`)) {
            continue;
          }

          ensureLangCached(lang);
          insertWordLink.run(userId, lang, cleanFrom, cleanTo);
        }
      }

      if (data.deletedLessonIds && Array.isArray(data.deletedLessonIds) && data.deletedLessonIds.length > 0) {
        // Cascade delete local media files (audio & videos) ONLY if no other user still references the same lesson ID
        const VIDEO_STORAGE_DIR = path.join(DATA_DIR, "media", "videos");
        const checkOtherUsersLessonStmt = db.prepare("SELECT 1 FROM lessons WHERE id = ? AND user_id != ? LIMIT 1");
        const safeUser = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
        for (const delId of data.deletedLessonIds) {
          try {
            const safeDelId = String(delId).replace(/[^a-zA-Z0-9_-]/g, "_");
            // Always clean up user-prefixed audio files
            for (const ext of ["mp3", "m4a", "wav", "ogg"]) {
              const userScopedAudio = path.join(AUDIO_STORAGE_DIR, `${safeUser}_${safeDelId}.${ext}`);
              if (fs.existsSync(userScopedAudio)) fs.unlinkSync(userScopedAudio);
            }

            const stillUsedByOther = checkOtherUsersLessonStmt.get(delId, userId);
            if (!stillUsedByOther) {
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
      const selectExistingLessonStmt = db.prepare(
        "SELECT title, text, audioUrl, targetLanguage, translationLanguage, isArchived, coverUrl, youtubeId, localVideoUrl, lessonType, pinned, translationText, detectedPhrases, difficulty, playlistId, audioProgress, primaryTag, tags FROM lessons WHERE id = ? AND user_id = ?"
      );

      for (const l of lessons) {
        let finalAudioUrl = l.audioUrl || null;
        let finalAudioBase64 = null; // Clear base64 from RAM & DB

        if (l.audioBase64 && typeof l.audioBase64 === "string" && l.audioBase64.length > 50) {
          const savedUrl = saveAudioBase64ToDisk(l.id, l.audioBase64, userId);
          if (savedUrl) {
            finalAudioUrl = savedUrl;
          }
        }

        const existingLesson = selectExistingLessonStmt.get(l.id, userId) as any;
        let finalIsArchived = l.isArchived ? 1 : 0;
        let finalPinned = l.pinned ? 1 : 0;
        if (l.isArchived === undefined && existingLesson) {
          finalIsArchived = existingLesson.isArchived || 0;
        }
        if (l.pinned === undefined && existingLesson) {
          finalPinned = existingLesson.pinned || 0;
        }

        const lessonPrimaryTag = l.primaryTag || null;
        const lessonTagsJson = (l.tags && Array.isArray(l.tags) && l.tags.length > 0) ? JSON.stringify(l.tags) : null;
        const nextDetectedPhrasesJson = JSON.stringify(l.detectedPhrases || {});
        const nextAudioProgress = l.audioProgress !== undefined ? Math.floor(Number(l.audioProgress) || 0) : (existingLesson?.audioProgress || 0);

        if (
          existingLesson &&
          existingLesson.title === l.title &&
          existingLesson.text === l.text &&
          existingLesson.audioUrl === finalAudioUrl &&
          existingLesson.targetLanguage === (l.targetLanguage || "english") &&
          existingLesson.translationLanguage === (l.translationLanguage || "russian") &&
          existingLesson.isArchived === finalIsArchived &&
          existingLesson.pinned === finalPinned &&
          existingLesson.coverUrl === (l.coverUrl || null) &&
          existingLesson.youtubeId === (l.youtubeId || null) &&
          existingLesson.localVideoUrl === (l.localVideoUrl || null) &&
          existingLesson.lessonType === (l.lessonType || null) &&
          existingLesson.translationText === (l.translationText || null) &&
          existingLesson.detectedPhrases === nextDetectedPhrasesJson &&
          existingLesson.playlistId === (l.playlistId || null) &&
          (existingLesson.audioProgress || 0) === nextAudioProgress &&
          existingLesson.primaryTag === lessonPrimaryTag &&
          existingLesson.tags === lessonTagsJson
        ) {
          continue;
        }

        insertLesson.run(
          l.id,
          userId,
          l.title,
          l.text,
          finalAudioUrl,
          finalAudioBase64,
          normalizeLang(l.targetLanguage || "English"),
          normalizeLang(l.translationLanguage || "Russian"),
          l.isBuiltIn ? 1 : 0,
          finalIsArchived,
          l.coverUrl || null,
          l.youtubeId || null,
          l.localVideoUrl || null,
          l.lessonType || null,
          finalPinned,
          l.translationText || null,
          nextDetectedPhrasesJson,
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
          nextAudioProgress,
          l.sourceType || (
            l.lessonType === "youtube" ? "youtube" :
            (l.lessonType === "podcast" || l.lessonType === "audio") ? "podcast" :
            (l.lessonType === "article" || l.lessonType === "website" || l.lessonType === "news") ? "article" :
            (l.lessonType === "book" || l.epub || l.pdf) ? "book" :
            (l.lessonType || "article")
          ),
          lessonPrimaryTag,
          lessonTagsJson
        );
        writtenLessonsCount++;

        if (lessonPrimaryTag && typeof lessonPrimaryTag === "string" && lessonPrimaryTag.trim()) {
          const pTag = lessonPrimaryTag.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          insertTag.run(tagId, userId, pTag, null, l.targetLanguage || null, Date.now());
          insertItemTag.run(userId, l.id, tagId, 1);
        }
        if (Array.isArray(l.tags)) {
          for (const t of l.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = lessonPrimaryTag && lessonPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            insertTag.run(tagId, userId, tagName, null, l.targetLanguage || null, Date.now());
            insertItemTag.run(userId, l.id, tagId, isPrim);
          }
        }
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
      const selectExistingPlaylistStmt = db.prepare("SELECT isArchived, orderIndex, pinned FROM playlists WHERE id = ? AND user_id = ?");
      for (const p of playlists) {
        const existingPlaylist = selectExistingPlaylistStmt.get(p.id, userId) as any;
        let finalPlIsArchived = p.isArchived ? 1 : 0;
        if (p.isArchived === undefined && existingPlaylist) {
          finalPlIsArchived = existingPlaylist.isArchived || 0;
        }

        let finalOrder = typeof p.order === "number" ? p.order : (typeof p.orderIndex === "number" ? p.orderIndex : (existingPlaylist?.orderIndex ?? 0));
        let finalPinned = p.pinned !== undefined ? (p.pinned ? 1 : 0) : (existingPlaylist?.pinned || 0);

        const playlistPrimaryTag = p.primaryTag || null;
        const playlistTagsJson = (p.tags && Array.isArray(p.tags) && p.tags.length > 0) ? JSON.stringify(p.tags) : null;
        const rawPlItems = p.items ? (typeof p.items === "string" ? JSON.parse(p.items) : p.items) : [];
        const cleanPlItems = deduplicateDbPlaylistItems(rawPlItems);

        insertPlaylist.run(
          p.id,
          userId,
          p.title || "Untitled Playlist",
          p.description || null,
          p.thumbnailUrl || "",
          p.sourceType || "custom_collection",
          p.externalUrl || null,
          p.channelTitle || null,
          cleanPlItems.length,
          p.language || "en",
          JSON.stringify(cleanPlItems),
          finalPlIsArchived,
          p.createdAt || new Date().toISOString(),
          p.updatedAt || new Date().toISOString(),
          playlistPrimaryTag,
          playlistTagsJson,
          finalOrder,
          finalPinned
        );

        if (playlistPrimaryTag && typeof playlistPrimaryTag === "string" && playlistPrimaryTag.trim()) {
          const pTag = playlistPrimaryTag.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          insertTag.run(tagId, userId, pTag, null, p.language || null, Date.now());
          insertItemTag.run(userId, p.id, tagId, 1);
        }
        if (Array.isArray(p.tags)) {
          for (const t of p.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = playlistPrimaryTag && playlistPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            insertTag.run(tagId, userId, tagName, null, p.language || null, Date.now());
            insertItemTag.run(userId, p.id, tagId, isPrim);
          }
        }
      }

      // Ensure lessons belonging to playlists have their playlistId accurately updated in database and inherit primaryTag if unset
      if (Array.isArray(playlists) && playlists.length > 0) {
        const updateLessonPlaylistStmt = db.prepare(
          "UPDATE lessons SET playlistId = ?, primaryTag = COALESCE(primaryTag, ?) WHERE user_id = ? AND (id = ? OR (youtubeId IS NOT NULL AND length(youtubeId) > 2 AND youtubeId = ?))"
        );
        for (const p of playlists) {
          try {
            const items = Array.isArray(p.items) ? p.items : (typeof p.items === "string" ? JSON.parse(p.items || "[]") : []);
            for (const item of items) {
              if (item.lessonId || item.videoId) {
                updateLessonPlaylistStmt.run(p.id, p.primaryTag || null, userId, item.lessonId || "", item.videoId || "");
              }
            }
          } catch (_) {}
        }
      }

      const types = data.lessonTypes || [];
      for (const t of types) {
        if (t && t.id && t.name) {
          insertLessonType.run(t.id, t.name, t.icon);
        }
      }

      if (data.listeningSeconds !== undefined) {
        insertMetadata.run(userId, "listeningSeconds", String(data.listeningSeconds));
      }

      if (data.readerSettings && typeof data.readerSettings === "object") {
        let existingSettings: Record<string, any> = {};
        try {
          const userRow = db.prepare("SELECT settings FROM user_settings WHERE user_id = ?").get(userId) as any;
          if (userRow?.settings) {
            existingSettings = JSON.parse(userRow.settings);
          } else {
            const metaRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId) as any;
            if (metaRow?.value) {
              existingSettings = JSON.parse(metaRow.value);
            }
          }
        } catch (_) {}

        const mergedSettings = {
          ...existingSettings,
          ...data.readerSettings,
          ttsLocales: {
            ...(existingSettings.ttsLocales || {}),
            ...(data.readerSettings.ttsLocales || {}),
          },
        };
        const serialized = JSON.stringify(mergedSettings);
        insertMetadata.run(userId, "readerSettings", serialized);
        try {
          db.prepare("INSERT OR REPLACE INTO user_settings (user_id, settings, updated_at) VALUES (?, ?, ?)").run(userId, serialized, Date.now());
        } catch (_) {}
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
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, lastPosition, audioUrl, guid, podcastTitle, primaryTag, youtubeId, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (Array.isArray(data.deletedHistoryIds) && data.deletedHistoryIds.length > 0) {
        const placeholders = data.deletedHistoryIds.map(() => "?").join(",");
        const result = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...data.deletedHistoryIds);
        console.log('[Server SQL Delete Bulk]', { deletedIds: data.deletedHistoryIds, changes: result.changes });
      }

      let writtenHistoryCount = 0;
      if (Array.isArray(data.history) && data.history.length > 0) {
        const historyList = data.history;
        const existingHistoryMap = new Map<string, any>();
        if (historyList.length > 10) {
          const existingHistRows = db.prepare(
            "SELECT id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, lastPosition, audioUrl, guid, podcastTitle, primaryTag, youtubeId, duration FROM reading_history WHERE user_id = ?"
          ).all(userId) as any[];
          for (const r of existingHistRows) {
            existingHistoryMap.set(r.id, r);
          }
        }

        // Prepared statement to find existing row by youtubeId for the same user within 24h window.
        // Watching the same video on different days = separate history entries (intentional re-watch).
        const findByYoutubeId = db.prepare(
          `SELECT id, durationSeconds, lastPosition, status, actionType, timestamp FROM reading_history WHERE user_id = ? AND youtubeId = ? AND id != ? AND ABS(JULIANDAY(timestamp) - JULIANDAY(?)) < 1.0 LIMIT 1`
        );
        // Prepared statement to delete a duplicate row after merging into the canonical one
        const deleteById = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id = ?`);

        for (const h of historyList) {
          if (!h || !h.id) continue;
          
          const incomingDuration = h.durationSeconds || 0;
          const incomingPosition = h.lastPosition || 0;
          const isCompleted = h.status === "completed" || h.actionType === "complete";

          // Allow completed-status entries through even if durationSeconds=0
          if (incomingDuration <= 0 && incomingPosition <= 0 && !isCompleted) {
            // Strict reject: zero duration and zero position records with no completion signal are illegal
            continue;
          }

          // youtubeId deduplication: if there's already a row for the same YouTube video,
          // merge into it instead of creating a second row with a different ID.
          let canonicalId = h.id;
          if (h.youtubeId) {
            const existing: any = findByYoutubeId.get(userId, h.youtubeId, h.id, h.timestamp || new Date().toISOString());
            if (existing) {
              // Merge: keep max duration, max position, prefer completed, keep most recent timestamp
              const mergedDuration = Math.max(incomingDuration, existing.durationSeconds || 0);
              const mergedPosition = Math.max(incomingPosition, existing.lastPosition || 0);
              const mergedStatus = isCompleted || existing.status === "completed" || existing.actionType === "complete"
                ? "completed" : (h.status || existing.status || "in_progress");
              const mergedActionType = isCompleted || existing.actionType === "complete"
                ? "complete" : (h.actionType || existing.actionType || "listen");
              const mergedTimestamp = new Date(h.timestamp || 0).getTime() >= new Date(existing.timestamp || 0).getTime()
                ? (h.timestamp || new Date().toISOString())
                : existing.timestamp;

              // We'll upsert the incoming entry with the canonical (existing) id, then delete the duplicate
              canonicalId = existing.id;
              h.durationSeconds = mergedDuration;
              h.lastPosition = mergedPosition;
              h.status = mergedStatus;
              h.actionType = mergedActionType;
              h.timestamp = mergedTimestamp;

              // Remove the incoming duplicate entry (the one with h.id != existing.id)
              if (h.id !== existing.id) {
                deleteById.run(userId, h.id);
              }
            }
          }

          const historyPrimaryTag = h.primaryTag || null;
          const historyTagsJson = h.tags && Array.isArray(h.tags) && h.tags.length > 0 ? JSON.stringify(h.tags) : null;
          const nextLastPos = h.lastPosition !== undefined && h.lastPosition !== null ? Number(h.lastPosition) : 0;
          const nextDuration = h.duration !== undefined && h.duration !== null ? Number(h.duration) : null;

          const existingH = existingHistoryMap.get(canonicalId);
          if (
            existingH &&
            existingH.lessonId === (h.lessonId || 'imported_record') &&
            existingH.lessonTitle === (h.lessonTitle || "Занятие") &&
            existingH.status === (h.status || "in_progress") &&
            (existingH.durationSeconds || 0) === (h.durationSeconds || 0) &&
            (existingH.lastPosition || 0) === nextLastPos &&
            existingH.timestamp === h.timestamp &&
            existingH.notes === (h.notes || null) &&
            existingH.channelName === (h.channelName || null) &&
            existingH.channelAvatarUrl === (h.channelAvatarUrl || null) &&
            existingH.customTitle === (h.customTitle || null) &&
            existingH.primaryTag === historyPrimaryTag &&
            existingH.tags === historyTagsJson
          ) {
            continue;
          }

          insertHistory.run(
            canonicalId,
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
            h.channelAvatarUrl || null,
            h.channelUrl || null,
            h.category || null,
            h.customTitle || null,
            h.mode || null,
            historyTagsJson,
            nextLastPos,
            h.audioUrl || null,
            h.guid || null,
            h.podcastTitle || null,
            historyPrimaryTag,
            h.youtubeId || null,
            nextDuration
          );
          writtenHistoryCount++;

          if (historyPrimaryTag && typeof historyPrimaryTag === "string" && historyPrimaryTag.trim()) {
            const pTag = historyPrimaryTag.trim();
            const tagId = `${userId}_${pTag.toLowerCase()}`;
            insertTag.run(tagId, userId, pTag, null, h.targetLanguage || null, Date.now());
            insertItemTag.run(userId, canonicalId, tagId, 1);
          }
          if (Array.isArray(h.tags)) {
            for (const t of h.tags) {
              if (!t || typeof t !== "string" || !t.trim()) continue;
              const tagName = t.trim();
              const isPrim = historyPrimaryTag && historyPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
              const tagId = `${userId}_${tagName.toLowerCase()}`;
              insertTag.run(tagId, userId, tagName, null, h.targetLanguage || null, Date.now());
              insertItemTag.run(userId, canonicalId, tagId, isPrim);
            }
          }
        }
      }
      console.log(`[saveLocalServerDb] Committed for "${userId}" (written: ${writtenWordsCount} words, ${writtenLessonsCount} lessons, ${writtenHistoryCount} history)`);
    })();

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
router.post("/dictionary-explain", handleDictionaryExplain);

// 2. Load User Server DB (Pull / Load)
router.get("/server-db", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
  }

  // Fast ETag check: if user data has not changed, return 304 Not Modified in < 2ms (0 bytes)
  const userVersion = getUserDbVersion(userId);
  const etag = `W/"${userId}-${userVersion}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, no-cache");

  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `"${userId}-${userVersion}"`)) {
    return res.status(304).end();
  }

  const dbData = getLocalServerDb(userId);
  if (!dbData) {
    return res.json({ status: "empty" });
  }
  const acceptEncoding = String(req.headers["accept-encoding"] || "");
  if (acceptEncoding.includes("gzip")) {
    const jsonBuffer = Buffer.from(JSON.stringify({ status: "ok", data: dbData }), "utf8");
    zlib.gzip(jsonBuffer, { level: zlib.constants.Z_BEST_SPEED }, (err, compressed) => {
      if (err) {
        return res.json({ status: "ok", data: dbData });
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", String(compressed.length));
      return res.send(compressed);
    });
    return;
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
    return handleAuthError(err, res);
  }

  const success = saveLocalServerDb(userId, data);
  if (success) touchUserDbVersion(userId);
  if (success) {
    return res.json({ status: "success" });
  } else {
    return res.status(500).json({ error: "Failed to write database to local SQLite storage" });
  }
});

// 4. Wipe User Server DB (strictly scoped to current userId)
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

  try {
    const db = getDbConnection(userId);
    const wipeTransaction = db.transaction(() => {
      db.prepare("DELETE FROM words WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM word_links WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM lessons WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM playlists WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM reading_history WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM metadata WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM podcast_subscriptions WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM item_tags WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM tags WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM study_activity_logs WHERE userId = ?").run(userId);
    });
    wipeTransaction();
    return res.json({ status: "success", message: "User data wiped from server database successfully" });
  } catch (error) {
    console.error("Failed to wipe user data from server db:", error);
    return res.status(500).json({ error: "Failed to wipe user data from server database" });
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
    if (progress === 0 || progress === "0") {
      db.prepare("DELETE FROM metadata WHERE user_id = ? AND key = ?").run(userId, key);
      return res.json({ status: "success", progress: 0, deleted: true });
    }

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


// Mount modular vocabulary & word-links routes
router.use(vocabRouter);

export default router;
