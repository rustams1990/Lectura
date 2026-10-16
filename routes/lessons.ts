import { Router, Request, Response } from "express";
import { resolveUserId } from "./auth.ts";
import { getDbConnection } from "./dbConnection.ts";
import { htmlToPlainText } from "./htmlTextUtils.ts";

const router = Router();

// GET /api/lessons: Query lessons with source filter and duration-based sorting
router.get("/", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }

  const {
    sourceType,
    type,
    lessonType,
    sortBy,
    sort,
    lang,
    targetLanguage,
    isArchived,
    limit,
    offset
  } = req.query;

  try {
    const db = getDbConnection(userId);
    let query = "SELECT * FROM lessons WHERE user_id = ? AND (length(trim(COALESCE(text, ''))) > 0 OR isBuiltIn = 1 OR (wordTimestamps IS NOT NULL AND length(wordTimestamps) > 2))";
    const params: any[] = [userId];

    const resolvedSource = (sourceType || type || lessonType) ? String(sourceType || type || lessonType).toLowerCase().trim() : null;
    if (resolvedSource && resolvedSource !== "all") {
      query += " AND (lower(sourceType) = ? OR lower(lessonType) = ?)";
      params.push(resolvedSource, resolvedSource);
    }

    if (isArchived !== undefined) {
      const arch = isArchived === "true" || isArchived === "1" ? 1 : 0;
      query += " AND COALESCE(isArchived, 0) = ?";
      params.push(arch);
    } else {
      query += " AND COALESCE(isArchived, 0) = 0";
    }

    const resolvedLang = (lang || targetLanguage) ? String(lang || targetLanguage).toLowerCase().trim() : null;
    if (resolvedLang && resolvedLang !== "all") {
      query += " AND lower(targetLanguage) = ?";
      params.push(resolvedLang);
    }

    const sortOption = String(sortBy || sort || "newest").toLowerCase().trim();

    if (sortOption === "short" || sortOption === "length_short") {
      if (resolvedSource === "youtube" || resolvedSource === "podcast") {
        query += " ORDER BY duration ASC, wordCount ASC";
      } else {
        query += " ORDER BY CASE WHEN COALESCE(duration, 0) > 0 THEN duration ELSE COALESCE(wordCount, 0) END ASC";
      }
    } else if (sortOption === "long" || sortOption === "length_long") {
      if (resolvedSource === "youtube" || resolvedSource === "podcast") {
        query += " ORDER BY duration DESC, wordCount DESC";
      } else {
        query += " ORDER BY CASE WHEN COALESCE(duration, 0) > 0 THEN duration ELSE COALESCE(wordCount, 0) END DESC";
      }
    } else if (sortOption === "title") {
      query += " ORDER BY title ASC";
    } else if (sortOption === "title_desc") {
      query += " ORDER BY title DESC";
    } else if (sortOption === "oldest") {
      query += " ORDER BY COALESCE(createdAt, rowid * 1000) ASC";
    } else {
      query += " ORDER BY COALESCE(createdAt, rowid * 1000) DESC";
    }

    if (limit) {
      query += " LIMIT ?";
      params.push(Number(limit));
      if (offset) {
        query += " OFFSET ?";
        params.push(Number(offset));
      }
    }

    const rows = db.prepare(query).all(...params) as any[];
    return res.json({ status: "ok", count: rows.length, lessons: rows });
  } catch (err: any) {
    console.error("[GET /api/lessons] Error:", err);
    return res.status(500).json({ error: "Failed to fetch lessons: " + err.message });
  }
});

// POST /api/lessons/:id/archive: Toggle or set archive status for a single lesson
router.post("/:id/archive", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }

  const { id } = req.params;
  const isArchived = req.body.isArchived !== undefined ? (req.body.isArchived ? 1 : 0) : 1;

  try {
    const db = getDbConnection(userId);
    const result = db.prepare("UPDATE lessons SET isArchived = ? WHERE id = ? AND user_id = ?").run(isArchived, id, userId);
    return res.json({ status: "ok", id, isArchived: isArchived === 1, changes: result.changes });
  } catch (err: any) {
    console.error("[POST /api/lessons/:id/archive] Error:", err);
    return res.status(500).json({ error: "Failed to archive lesson: " + err.message });
  }
});

// POST /api/lessons/batch: Batch operations (addTag, removeTag, setPrimaryTag, archive, assignPlaylist)
export function handleBatchLessons(req: Request, res: Response) {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (_) {
    userId = "default";
  }

  const { lessonIds, action } = req.body;
  const payload = req.body.payload || {};
  const tag = req.body.tag ?? payload.tag;
  const primaryTag = req.body.primaryTag ?? payload.primaryTag;
  const isArchived = req.body.isArchived !== undefined ? req.body.isArchived : payload.isArchived;
  const playlistId = req.body.playlistId !== undefined ? req.body.playlistId : payload.playlistId;

  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lessonIds must be a non-empty array" });
  }

  try {
    const db = getDbConnection(userId);

    const result = db.transaction(() => {
      let affected = 0;

      if (action === "addTag") {
        let cleanTag = String(tag || "").trim().replace(/^#+/, "").trim();
        if (!cleanTag) throw new Error("Tag name is required for addTag");
        cleanTag = cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);

        // Ensure tag exists in tags table
        let existingTag = db.prepare("SELECT id FROM tags WHERE user_id = ? AND lower(name) = ?").get(userId, cleanTag.toLowerCase()) as any;
        let tagId = existingTag?.id;
        if (!tagId) {
          tagId = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, createdAt) VALUES (?, ?, ?, ?, ?)").run(
            tagId,
            userId,
            cleanTag,
            "#14B8A6",
            new Date().toISOString()
          );
        }

        const getLesson = db.prepare("SELECT id, tags, primaryTag FROM lessons WHERE id = ? AND user_id = ?");
        const updateLesson = db.prepare("UPDATE lessons SET tags = ?, primaryTag = COALESCE(primaryTag, ?) WHERE id = ? AND user_id = ?");
        const insertItemTag = db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)");

        for (const id of lessonIds) {
          const row = getLesson.get(id, userId) as any;
          if (!row) continue;

          let currentTags: string[] = [];
          if (row.tags) {
            try {
              currentTags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
              if (!Array.isArray(currentTags)) currentTags = [];
            } catch {
              currentTags = String(row.tags).split(",").map(t => t.trim()).filter(Boolean);
            }
          }

          if (!currentTags.some(t => t.toLowerCase() === cleanTag.toLowerCase())) {
            currentTags.push(cleanTag);
          }

          const hasPrimary = Boolean(row.primaryTag);
          updateLesson.run(JSON.stringify(currentTags), cleanTag, id, userId);
          insertItemTag.run(userId, id, tagId, hasPrimary ? 0 : 1);
          affected++;
        }
      } else if (action === "removeTag") {
        let cleanTag = String(tag || "").trim().replace(/^#+/, "").trim();
        if (!cleanTag) throw new Error("Tag name is required for removeTag");
        cleanTag = cleanTag.toLowerCase();

        const getLesson = db.prepare("SELECT id, tags, primaryTag FROM lessons WHERE id = ? AND user_id = ?");
        const updateLesson = db.prepare("UPDATE lessons SET tags = ?, primaryTag = ? WHERE id = ? AND user_id = ?");
        const deleteItemTag = db.prepare("DELETE FROM item_tags WHERE user_id = ? AND item_id = ? AND tag_id IN (SELECT id FROM tags WHERE user_id = ? AND lower(name) = ?)");

        for (const id of lessonIds) {
          const row = getLesson.get(id, userId) as any;
          if (!row) continue;

          let currentTags: string[] = [];
          if (row.tags) {
            try {
              currentTags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
              if (!Array.isArray(currentTags)) currentTags = [];
            } catch {
              currentTags = String(row.tags).split(",").map(t => t.trim()).filter(Boolean);
            }
          }

          const nextTags = currentTags.filter(t => t.toLowerCase() !== cleanTag);
          let newPrimaryTag = row.primaryTag;
          if (row.primaryTag && row.primaryTag.toLowerCase() === cleanTag) {
            newPrimaryTag = nextTags.length > 0 ? nextTags[0] : null;
          }

          updateLesson.run(JSON.stringify(nextTags), newPrimaryTag, id, userId);
          deleteItemTag.run(userId, id, userId, cleanTag);
          affected++;
        }
      } else if (action === "setPrimaryTag") {
        let cleanTag = String(primaryTag || tag || "").trim().replace(/^#+/, "").trim();
        if (!cleanTag) throw new Error("Tag name is required for setPrimaryTag");
        cleanTag = cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);

        // Ensure tag in tags table
        let existingTag = db.prepare("SELECT id FROM tags WHERE user_id = ? AND lower(name) = ?").get(userId, cleanTag.toLowerCase()) as any;
        let tagId = existingTag?.id;
        if (!tagId) {
          tagId = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, createdAt) VALUES (?, ?, ?, ?, ?)").run(
            tagId,
            userId,
            cleanTag,
            "#14B8A6",
            new Date().toISOString()
          );
        }

        const getLesson = db.prepare("SELECT id, tags, primaryTag FROM lessons WHERE id = ? AND user_id = ?");
        const updateLesson = db.prepare("UPDATE lessons SET primaryTag = ?, tags = ? WHERE id = ? AND user_id = ?");
        const clearItemPrimary = db.prepare("UPDATE item_tags SET is_primary = 0 WHERE user_id = ? AND item_id = ?");
        const setItemPrimary = db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, 1)");

        for (const id of lessonIds) {
          const row = getLesson.get(id, userId) as any;
          if (!row) continue;

          let currentTags: string[] = [];
          if (row.tags) {
            try {
              currentTags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
              if (!Array.isArray(currentTags)) currentTags = [];
            } catch {
              currentTags = String(row.tags).split(",").map(t => t.trim()).filter(Boolean);
            }
          }

          if (!currentTags.some(t => t.toLowerCase() === cleanTag.toLowerCase())) {
            currentTags.push(cleanTag);
          }

          updateLesson.run(cleanTag, JSON.stringify(currentTags), id, userId);
          clearItemPrimary.run(userId, id);
          setItemPrimary.run(userId, id, tagId);
          affected++;
        }
      } else if (action === "archive") {
        const arch = isArchived !== undefined ? (isArchived ? 1 : 0) : 1;
        const stmt = db.prepare("UPDATE lessons SET isArchived = ? WHERE id = ? AND user_id = ?");
        for (const id of lessonIds) {
          const res = stmt.run(arch, id, userId);
          if (res.changes > 0) affected++;
        }
      } else if (action === "assignPlaylist") {
        const targetPlaylist = playlistId || null;
        const stmt = db.prepare("UPDATE lessons SET playlistId = ? WHERE id = ? AND user_id = ?");
        for (const id of lessonIds) {
          const res = stmt.run(targetPlaylist, id, userId);
          if (res.changes > 0) affected++;
        }

        // Also update playlist items in playlists table
        try {
          const allPlaylists = db.prepare("SELECT id, items FROM playlists WHERE user_id = ?").all(userId) as any[];
          const getLessonStmt = db.prepare("SELECT id, title, youtubeId, coverUrl, duration, text FROM lessons WHERE id = ? AND user_id = ?");

          for (const pl of allPlaylists) {
            let plItems: any[] = [];
            try {
              plItems = typeof pl.items === "string" ? JSON.parse(pl.items) : (pl.items || []);
              if (!Array.isArray(plItems)) plItems = [];
            } catch { plItems = []; }

            let changed = false;
            // Remove lessonIds from non-target playlist
            let filteredItems = plItems;
            if (pl.id !== targetPlaylist) {
              const beforeLen = filteredItems.length;
              filteredItems = filteredItems.filter((it: any) => {
                if (lessonIds.includes(it.lessonId)) return false;
                for (const lid of lessonIds) {
                  const lRow = getLessonStmt.get(lid, userId) as any;
                  if (lRow && lRow.youtubeId && it.videoId === lRow.youtubeId) return false;
                }
                return true;
              });
              if (filteredItems.length !== beforeLen) changed = true;
            } else {
              // Add or update lessons in this target playlist
              for (const id of lessonIds) {
                const lRow = getLessonStmt.get(id, userId) as any;
                if (lRow) {
                  const existingIdx = filteredItems.findIndex((it: any) =>
                    (it.lessonId && it.lessonId === lRow.id) ||
                    (lRow.youtubeId && it.videoId && it.videoId === lRow.youtubeId)
                  );
                  const itemPayload = {
                    lessonId: lRow.id,
                    title: lRow.title,
                    videoId: lRow.youtubeId || null,
                    durationSeconds: lRow.duration || 0,
                    thumbnailUrl: lRow.coverUrl || "",
                    transcriptLoaded: !!(lRow.text && lRow.text.length > 20),
                  };
                  if (existingIdx !== -1) {
                    filteredItems[existingIdx] = {
                      ...filteredItems[existingIdx],
                      ...itemPayload,
                    };
                    changed = true;
                  } else {
                    filteredItems.push({
                      id: `item_${lRow.id}_${Date.now()}`,
                      ...itemPayload,
                    });
                    changed = true;
                  }
                }
              }
            }

            // Deduplicate items
            const seen = new Set<string>();
            const deduped: any[] = [];
            for (const it of filteredItems) {
              const key = it.videoId || it.lessonId || it.id;
              if (key && seen.has(key)) {
                changed = true;
                continue;
              }
              if (key) seen.add(key);
              deduped.push(it);
            }

            if (changed) {
              db.prepare("UPDATE playlists SET items = ?, itemCount = ?, updatedAt = ? WHERE id = ? AND user_id = ?").run(
                JSON.stringify(deduped),
                deduped.length,
                new Date().toISOString(),
                pl.id,
                userId
              );
            }
          }
        } catch (e) {
          console.error("Error syncing playlist items in batch:", e);
        }
      } else {
        throw new Error(`Unknown batch action: ${action}`);
      }

      return affected;
    })();

    return res.json({ status: "ok", action, affectedCount: result });
  } catch (err: any) {
    console.error("[POST /api/lessons/batch] Error:", err);
    return res.status(500).json({ error: "Failed to perform batch update: " + err.message });
  }
}

router.post("/batch", handleBatchLessons);

// POST /api/lessons: Create/Import Lesson (One-Click Article / Content Importer)
router.post("/", (req: Request, res: Response) => {
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

  const isVideoOrAudio = lessonType === "video" || lessonType === "podcast" || lessonType === "youtube";
  const incomingAudio = (req.body.audioUrl || req.body.audio_url || "").trim();
  const isMediaStream = incomingAudio && (
    /youtube\.com|youtu\.be/i.test(incomingAudio) ||
    /\.(mp3|m4a|wav|ogg|aac|flac|mp4|webm|m3u8)(\?.*)?$/i.test(incomingAudio) ||
    incomingAudio.startsWith("/api/audio-files/")
  );

  const resolvedAudioUrl = (isVideoOrAudio && isMediaStream) ? incomingAudio : null;
  const type = (resolvedAudioUrl || isVideoOrAudio) ? (lessonType || "video") : "article";
  const lessonId = id || ("ext_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7));

  if (!cleanText) {
    return res.status(400).json({ error: "Lesson text/content is required" });
  }

  try {
    const db = getDbConnection(userId);
    const now = Date.now();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO lessons (
          id, user_id, title, text, audioUrl, targetLanguage, translationLanguage,
          isBuiltIn, isArchived, coverUrl, lessonType, pinned, createdAt, channelTitle, channelUrl, sourceType
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          title = excluded.title,
          text = excluded.text,
          audioUrl = excluded.audioUrl,
          targetLanguage = excluded.targetLanguage,
          translationLanguage = excluded.translationLanguage,
          coverUrl = COALESCE(excluded.coverUrl, lessons.coverUrl),
          channelTitle = COALESCE(excluded.channelTitle, lessons.channelTitle),
          channelUrl = COALESCE(excluded.channelUrl, lessons.channelUrl),
          sourceType = COALESCE(excluded.sourceType, lessons.sourceType)
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
        sourceUrl || null,
        type
      );

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

// GET /api/lessons/:id: Get single lesson with normalized JSON fields
router.get("/:id", (req: Request, res: Response) => {
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
    const lesson = db.prepare("SELECT * FROM lessons WHERE id = ? AND user_id = ?").get(id, userId) as any;
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
    if (typeof lesson.wordTimestamps === "string") {
      try { lesson.wordTimestamps = JSON.parse(lesson.wordTimestamps); } catch (_) { lesson.wordTimestamps = null; }
    }
    if (typeof lesson.detectedPhrases === "string") {
      try { lesson.detectedPhrases = JSON.parse(lesson.detectedPhrases); } catch (_) { lesson.detectedPhrases = {}; }
    }
    if (typeof lesson.images === "string") {
      try { lesson.images = JSON.parse(lesson.images); } catch (_) { lesson.images = undefined; }
    }
    if (typeof lesson.tags === "string") {
      try { lesson.tags = JSON.parse(lesson.tags); } catch (_) { lesson.tags = []; }
    }
    lesson.isBuiltIn = lesson.isBuiltIn === 1 || lesson.isBuiltIn === true;
    lesson.isArchived = lesson.isArchived === 1 || lesson.isArchived === true;
    lesson.pinned = lesson.pinned === 1 || lesson.pinned === true;
    return res.json(lesson);
  } catch (err: any) {
    console.error("[GET /api/lessons/:id] Error:", err);
    return res.status(500).json({ error: "Failed to get lesson" });
  }
});

// PATCH / PUT /api/lessons/:id: Granular Lesson Update
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
    const primaryTag = updates.primaryTag !== undefined ? (typeof updates.primaryTag === "string" ? updates.primaryTag.trim() : null) : null;
    const tagsJson = updates.tags !== undefined
      ? (Array.isArray(updates.tags) && updates.tags.length > 0 ? JSON.stringify(updates.tags) : null)
      : null;

    db.transaction(() => {
      db.prepare(`
        UPDATE lessons SET
          channelName = COALESCE(?, channelName),
          channelTitle = COALESCE(?, channelTitle),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          primaryTag = CASE WHEN ? IS NOT NULL THEN ? ELSE primaryTag END,
          tags = CASE WHEN ? IS NOT NULL THEN ? ELSE tags END
        WHERE user_id = ? AND id = ?
      `).run(
        channelTitle, channelTitle, channelAvatar, channelUrl,
        updates.primaryTag !== undefined ? primaryTag : null, primaryTag,
        updates.tags !== undefined ? tagsJson : null, tagsJson,
        userId, id
      );

      if (primaryTag || (Array.isArray(updates.tags) && updates.tags.length > 0)) {
        const insertTag = db.prepare(`
          INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertItemTag = db.prepare(`
          INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)
        `);
        if (primaryTag && typeof primaryTag === "string" && primaryTag.trim()) {
          const pTag = primaryTag.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          insertTag.run(tagId, userId, pTag, null, null, Date.now());
          insertItemTag.run(userId, id, tagId, 1);
        }
        if (Array.isArray(updates.tags)) {
          for (const t of updates.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = primaryTag && primaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            insertTag.run(tagId, userId, tagName, null, null, Date.now());
            insertItemTag.run(userId, id, tagId, isPrim);
          }
        }
      }

      const existingLesson = db.prepare("SELECT youtubeId FROM lessons WHERE user_id = ? AND id = ?").get(userId, id) as any;
      const ytId = updates.youtubeId || existingLesson?.youtubeId || null;

      db.prepare(`
        UPDATE reading_history SET
          channelName = COALESCE(?, channelName),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          primaryTag = CASE WHEN ? IS NOT NULL THEN ? ELSE primaryTag END,
          tags = CASE WHEN ? IS NOT NULL THEN ? ELSE tags END
        WHERE user_id = ? AND (
          lessonId = ? 
          OR (? IS NOT NULL AND (
            lessonId = ? 
            OR lessonId = ('lesson-yt_' || ?) 
            OR lessonId = ('youtube_' || ?) 
            OR coverUrl LIKE ('%' || ? || '%')
          ))
        )
      `).run(
        channelTitle, channelAvatar, channelUrl,
        updates.primaryTag !== undefined ? primaryTag : null, primaryTag,
        updates.tags !== undefined ? tagsJson : null, tagsJson,
        userId, id,
        ytId, ytId, ytId, ytId, ytId
      );
    })();

    console.log(`[SAVED TO DB] Lesson ${id} updated with channel: ${channelTitle}`);
    return res.json({ status: "success", id, channelTitle, channelAvatar, channelUrl });
  } catch (err: any) {
    console.error("[PATCH /api/lessons/:id] Error:", err);
    return res.status(500).json({ error: "Failed to update lesson on server" });
  }
};

router.patch("/:id", updateLessonHandler);
router.put("/:id", updateLessonHandler);

// PATCH /api/lessons/:id/progress: Update Lesson Audio Progress with LWW conflict protection
router.patch("/:id/progress", (req: Request, res: Response) => {
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
    const current = db.prepare("SELECT audio_progress_updated_at FROM lessons WHERE id = ? AND user_id = ?").get(id, userId) as { audio_progress_updated_at?: number } | undefined;

    if (current?.audio_progress_updated_at && current.audio_progress_updated_at > incomingTime) {
      return res.json({ success: false, reason: "Stale update ignored" });
    }

    try {
      db.prepare(`
        UPDATE lessons 
        SET audio_progress = ?, audio_progress_updated_at = ? 
        WHERE id = ? AND user_id = ?
      `).run(incomingProgress, incomingTime, id, userId);
    } catch (_) {}

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

export default router;
