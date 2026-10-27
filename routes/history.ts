import { Router, Request, Response } from "express";
import { resolveUserId, handleAuthError } from "./auth.ts";
import { getDbConnection } from "./dbConnection.ts";
import { matchLanguage, LANG_MAP } from "./htmlTextUtils.ts";

const router = Router();

export function safeParseTags(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
      if (typeof parsed === "string") return [parsed.trim()].filter(Boolean);
    } catch (_) {}
    return raw.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

function normalizeLang(lang: string): string {
  if (!lang) return "Spanish";
  const lower = lang.trim().toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  if (lang.length > 2) {
    return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
  }
  return lang;
}

/**
 * Robust YouTube & Media Watch Time Tracking endpoint.
 * Atomically updates:
 * 1. lessons (timeSpentSeconds, duration, status, updatedAt)
 * 2. study_activity_logs (daily breakdown for streak & charts)
 * 3. reading_history (instant visibility in TODAY on /history page)
 * 4. metadata (aggregate listeningSeconds)
 */
export function handleTrackActivity(req: Request, res: Response) {
  let userId = "default";
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
  }

  const {
    videoId,
    title,
    videoTitle,
    channelName,
    channelAvatarUrl,
    channelUrl,
    thumbnailUrl,
    duration,
    durationSeconds,
    studyLanguage,
    language,
    addedSeconds,
    watchedSeconds,
    lastPosition: reqLastPosition,
    currentTime,
    progress,
    isCompleted,
    timestamp
  } = req.body || {};

  const cleanVideoId = String(videoId || "").trim();
  const cleanTitle = String(
    title || videoTitle || (cleanVideoId ? `YouTube Video (${cleanVideoId})` : "Media Session")
  ).trim();
  const cleanChannel = String(channelName || "YouTube").trim();
  const cleanChannelUrl = String(
    channelUrl || (cleanVideoId ? `https://www.youtube.com/watch?v=${cleanVideoId}` : "")
  ).trim();
  const cleanCover = thumbnailUrl || (cleanVideoId ? `https://img.youtube.com/vi/${cleanVideoId}/hqdefault.jpg` : null);
  const rawTargetLang = String(studyLanguage || language || "es").toLowerCase().trim();
  const targetLang = normalizeLang(rawTargetLang);
  const totalDuration = Math.max(0, Math.round(Number(duration || durationSeconds) || 0));

  const rawPos = reqLastPosition ?? currentTime ?? progress;
  const resolvedLastPosition = rawPos !== undefined && !isNaN(Number(rawPos))
    ? Math.max(0, Math.round(Number(rawPos)))
    : undefined;

  // Added seconds strictly reflects incremental study time spent (capped to 7200s)
  const addedSec = req.body?.addedSeconds !== undefined
    ? Math.min(7200, Math.max(0, Math.round(Number(req.body.addedSeconds) || 0)))
    : (req.body?.watchedSeconds !== undefined && Number(req.body.watchedSeconds) <= 300)
      ? Math.min(300, Math.max(0, Math.round(Number(req.body.watchedSeconds) || 0)))
      : 0;

  const completed = Boolean(isCompleted);
  const statusStr = completed ? "COMPLETED" : "IN_PROGRESS";

  const now = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const todayDate = now.split("T")[0]; // "YYYY-MM-DD"

  try {
    const db = getDbConnection(userId);

    // Auto-cleanup any previously created empty phantom lessons for this user
    try {
      db.prepare(`
        DELETE FROM lessons 
        WHERE user_id = ? 
          AND (text IS NULL OR TRIM(text) = '') 
          AND (isBuiltIn IS NULL OR isBuiltIn = 0) 
          AND (wordTimestamps IS NULL OR length(wordTimestamps) <= 2)
      `).run(userId);
    } catch (_) {}

    // 1. Lessons table: ONLY update if lesson already exists (user explicitly imported it into the Library)
    // NEVER create empty phantom lessons in the library during background video tracking!
    const effectiveLessonId = cleanVideoId
      ? (cleanVideoId.startsWith("lesson-yt_") ? cleanVideoId : `lesson-yt_${cleanVideoId}`)
      : `custom_activity_${Date.now().toString(36)}`;

    let lesson = cleanVideoId
      ? (db.prepare(`
          SELECT id, timeSpentSeconds, status, duration 
          FROM lessons 
          WHERE (youtubeId = ? OR id = ? OR id = ?) AND user_id = ?
        `).get(cleanVideoId, effectiveLessonId, `youtube_${cleanVideoId}`, userId) as any)
      : null;

    let incrementalSec = 0;

    if (lesson) {
      const prevTimeSpent = lesson.timeSpentSeconds || 0;
      const newTimeSpent = prevTimeSpent + addedSec;
      incrementalSec = addedSec;

      const newStatus = completed ? "COMPLETED" : (lesson.status || "IN_PROGRESS");
      db.prepare(`
        UPDATE lessons 
        SET timeSpentSeconds = ?, status = ?, updatedAt = ?,
            duration = CASE WHEN ? > 0 THEN ? WHEN COALESCE(duration, 0) > 0 THEN duration ELSE 0 END,
            channelName = COALESCE(?, channelName),
            channelUrl = COALESCE(?, channelUrl)
        WHERE id = ? AND user_id = ?
      `).run(
        newTimeSpent,
        newStatus,
        now,
        totalDuration,
        totalDuration,
        cleanChannel,
        cleanChannelUrl,
        lesson.id,
        userId
      );
      lesson.timeSpentSeconds = newTimeSpent;
    } else {
      // Activity from browser extension only: DO NOT create a lesson in the library!
      incrementalSec = addedSec;
    }

    const recordedLessonId = lesson ? lesson.id : effectiveLessonId;

    // 2. study_activity_logs: Daily activity log (for analytics, streaks, and graphs)
    if (incrementalSec > 0) {
      db.prepare(`
        INSERT INTO study_activity_logs (userId, lessonId, date, secondsSpent, updatedAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(userId, lessonId, date) 
        DO UPDATE SET secondsSpent = secondsSpent + ?, updatedAt = ?
      `).run(userId, recordedLessonId, todayDate, incrementalSec, now, incrementalSec, now);
    }

    // 3. reading_history: strictly required for Lectura's /history page
    let existingHistory: any = null;
    if (cleanVideoId) {
      existingHistory = db.prepare(`
        SELECT * FROM reading_history
        WHERE user_id = ? 
          AND (lessonId = ? OR lessonId = ? OR (coverUrl LIKE ? AND lessonType = 'youtube'))
          AND timestamp LIKE ?
        ORDER BY timestamp DESC LIMIT 1
      `).get(userId, recordedLessonId, `youtube_${cleanVideoId}`, `%${cleanVideoId}%`, `${todayDate}%`);
    }

    if (existingHistory) {
      const prevDuration = existingHistory.durationSeconds || 0;
      const updatedDuration = prevDuration + addedSec;
      const finalLastPosition = resolvedLastPosition !== undefined
        ? resolvedLastPosition
        : (existingHistory.lastPosition || 0);

      db.prepare(`
        UPDATE reading_history SET
          durationSeconds = ?,
          timestamp = ?,
          status = ?,
          lessonTitle = COALESCE(?, lessonTitle),
          channelName = COALESCE(?, channelName),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          coverUrl = COALESCE(?, coverUrl),
          lastPosition = ?,
          duration = CASE WHEN ? > 0 THEN ? WHEN COALESCE(duration, 0) > 0 THEN duration ELSE 0 END
        WHERE user_id = ? AND id = ?
      `).run(
        updatedDuration,
        now,
        completed ? "completed" : (existingHistory.status || "in_progress"),
        cleanTitle,
        cleanChannel,
        channelAvatarUrl || null,
        cleanChannelUrl || null,
        cleanCover,
        finalLastPosition,
        totalDuration,
        totalDuration,
        userId,
        existingHistory.id
      );
    } else {
      // Create new history entry (even with 0 seconds on initial video open, so it immediately shows up in TODAY)
      const initialDuration = addedSec;
      const initialLastPos = resolvedLastPosition !== undefined ? resolvedLastPosition : 0;

      // Look up matching lesson or playlist in database to inherit real study topic tags
      let autoPrimaryTag: string | null = null;
      let autoTags: string[] = [];

      if (cleanVideoId) {
        try {
          const lRow = db.prepare(`
            SELECT id, primaryTag, tags, playlistId FROM lessons
            WHERE user_id = ? AND (id = ? OR youtubeId = ?)
            LIMIT 1
          `).get(userId, recordedLessonId, cleanVideoId) as any;

          if (lRow) {
            autoPrimaryTag = lRow.primaryTag || null;
            if (lRow.tags) {
              const parsed = JSON.parse(lRow.tags);
              if (Array.isArray(parsed)) autoTags = parsed;
            }
            if (!autoPrimaryTag && lRow.playlistId) {
              const pRow = db.prepare(`
                SELECT primaryTag FROM playlists WHERE user_id = ? AND id = ?
              `).get(userId, lRow.playlistId) as any;
              if (pRow?.primaryTag) autoPrimaryTag = pRow.primaryTag;
            }
          }
        } catch (_) {}
      }

      if (req.body.primaryTag) autoPrimaryTag = req.body.primaryTag;
      if (Array.isArray(req.body.tags)) autoTags = req.body.tags;

      const finalTagsJson = autoTags.length > 0 ? JSON.stringify(autoTags) : null;

      const historyId = "hist_yt_" + (cleanVideoId || Date.now().toString(36)) + "_" + Date.now().toString(36);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
          timestamp, actionType, status, durationSeconds, channelName, channelAvatarUrl,
          channelUrl, category, customTitle, mode, tags, lastPosition, duration, primaryTag
        ) VALUES (?, ?, ?, ?, 'youtube', ?, ?, ?, 'listen', ?, ?, ?, ?, ?, 'video', ?, 'custom', ?, ?, ?, ?)
      `).run(
        historyId,
        userId,
        recordedLessonId,
        cleanTitle,
        cleanCover,
        targetLang,
        now,
        completed ? "completed" : "in_progress",
        initialDuration,
        cleanChannel,
        channelAvatarUrl || null,
        cleanChannelUrl || null,
        cleanTitle,
        finalTagsJson,
        initialLastPos,
        totalDuration,
        autoPrimaryTag || null
      );
    }

    // 4. Update metadata aggregate listeningSeconds
    if (incrementalSec > 0) {
      const currentListeningRow = db.prepare(
        "SELECT value FROM metadata WHERE user_id = ? AND key = 'listeningSeconds'"
      ).get(userId) as { value: string } | undefined;
      const currentTotal = currentListeningRow ? (parseFloat(currentListeningRow.value) || 0) : 0;
      const newTotal = Math.round(currentTotal + incrementalSec);

      db.prepare(
        "INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'listeningSeconds', ?)"
      ).run(userId, String(newTotal));
    }

    return res.json({
      success: true,
      lessonId: recordedLessonId,
      addedSeconds: addedSec,
      timestamp: now
    });
  } catch (err: any) {
    console.error("[track-activity] Error saving activity:", err);
    return res.status(500).json({ error: "Failed to track activity: " + err.message });
  }
}

router.post("/history/track-activity", handleTrackActivity);
router.post("/history/track", handleTrackActivity);
router.post("/history/log", handleTrackActivity);
router.post("/activity/track", handleTrackActivity);
router.post("/activity/log", handleTrackActivity);

// Granular History Update (PATCH /api/history/:id)
router.patch("/history/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
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
            id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage, timestamp, actionType, status, durationSeconds, notes, channelName, channelAvatarUrl, channelUrl, category, customTitle, mode, tags, primaryTag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const primaryTagVal = updates.primaryTag || null;
        insertStmt.run(
          id,
          userId,
          updates.lessonId || "custom",
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
          updates.tags ? JSON.stringify(updates.tags) : null,
          primaryTagVal
        );

        if (primaryTagVal && typeof primaryTagVal === "string" && primaryTagVal.trim()) {
          const pTag = primaryTagVal.trim();
          const tagId = `${userId}_${pTag.toLowerCase()}`;
          db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, pTag, null, updates.targetLanguage || null, Date.now());
          db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, 1);
        }
        if (Array.isArray(updates.tags)) {
          for (const t of updates.tags) {
            if (!t || typeof t !== "string" || !t.trim()) continue;
            const tagName = t.trim();
            const isPrim = primaryTagVal && primaryTagVal.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
            const tagId = `${userId}_${tagName.toLowerCase()}`;
            db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, tagName, null, updates.targetLanguage || null, Date.now());
            db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, isPrim);
          }
        }
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
        const nextPrimaryTag = updates.primaryTag !== undefined ? (updates.primaryTag || null) : (existing.primaryTag || null);
        const nextMode = updates.mode !== undefined ? updates.mode : existing.mode;
        const nextCategory = updates.category !== undefined ? updates.category : existing.category;
        const nextCustomTitle = updates.customTitle !== undefined ? updates.customTitle : existing.customTitle;

        db.prepare(`
          UPDATE reading_history SET
            lessonId = ?, lessonTitle = ?, lessonType = ?, coverUrl = ?, targetLanguage = ?,
            actionType = ?, status = ?, durationSeconds = ?, notes = ?, channelName = ?,
            channelAvatarUrl = ?, channelUrl = ?, category = ?, customTitle = ?, mode = ?, tags = ?, primaryTag = ?
          WHERE user_id = ? AND id = ?
        `).run(
          nextLessonId, nextTitle, nextLessonType, nextCoverUrl, nextTargetLang,
          nextActionType, nextStatus, nextDuration, nextNotes, nextChannelName,
          nextChannelAvatar, nextChannelUrl, nextCategory, nextCustomTitle, nextMode, nextTags, nextPrimaryTag,
          userId, id
        );

        if (updates.primaryTag !== undefined || updates.tags !== undefined) {
          db.prepare("DELETE FROM item_tags WHERE user_id = ? AND item_id = ?").run(userId, id);
          if (nextPrimaryTag && typeof nextPrimaryTag === "string" && nextPrimaryTag.trim()) {
            const pTag = nextPrimaryTag.trim();
            const tagId = `${userId}_${pTag.toLowerCase()}`;
            db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, pTag, null, nextTargetLang || null, Date.now());
            db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, 1);
          }
          const parsedTags = safeParseTags(nextTags);
          if (Array.isArray(parsedTags)) {
            for (const t of parsedTags) {
              if (!t || typeof t !== "string" || !t.trim()) continue;
              const tagName = t.trim();
              const isPrim = nextPrimaryTag && nextPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
              const tagId = `${userId}_${tagName.toLowerCase()}`;
              db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, tagName, null, nextTargetLang || null, Date.now());
              db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, id, tagId, isPrim);
            }
          }
        }

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

    console.log(`[SAVED TO DB] History ${id} updated with channel: ${updates.channelName || updates.channelTitle || "unchanged"}`);
    return res.json({ status: "success", id });
  } catch (err: any) {
    if (err?.message === "ZERO_DURATION_HISTORY_CREATE" || err?.message === "ZERO_DURATION_HISTORY_UPDATE") {
      return res.status(400).json({ error: "History durationSeconds must be greater than 0" });
    }
    console.error("[PATCH /api/history/:id] Error:", err);
    return res.status(500).json({ error: "Failed to update history entry" });
  }
});

// Granular History Delete (DELETE /api/history/:id)
router.delete("/history/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
  }

  const { id } = req.params;
  try {
    const db = getDbConnection(userId);
    const result = db.prepare("DELETE FROM reading_history WHERE user_id = ? AND id = ?").run(userId, id);
    console.log("[Server SQL Delete]", { id, changes: result.changes });
    return res.json({ status: "success", id, changes: result.changes });
  } catch (err: any) {
    console.error("[DELETE /api/history/:id] Error:", err);
    return res.status(500).json({ error: "Failed to delete history entry" });
  }
});

// Batch History Delete (POST /api/history/batch-delete)
router.post("/history/batch-delete", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Missing or empty ids array" });
  }

  try {
    const db = getDbConnection(userId);
    let totalDeleted = 0;
    db.transaction(() => {
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        db.prepare(`DELETE FROM item_tags WHERE user_id = ? AND item_id IN (${placeholders})`).run(userId, ...chunk);
        const result = db.prepare(`DELETE FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...chunk);
        totalDeleted += result.changes;
      }
    })();
    console.log("[Server SQL Batch Delete]", { count: ids.length, totalDeleted });
    return res.json({ status: "success", count: ids.length, deletedCount: totalDeleted });
  } catch (err: any) {
    console.error("[POST /api/history/batch-delete] Error:", err);
    return res.status(500).json({ error: "Failed to batch delete history entries" });
  }
});

// Batch History Edit (POST /api/history/batch-edit)
router.post("/history/batch-edit", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
  }

  const { ids, targetLanguage, primaryTag, tags, tagMode = "replace" } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Missing or empty ids array" });
  }

  try {
    const db = getDbConnection(userId);
    db.transaction(() => {
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = db.prepare(`SELECT id, lessonId, tags, primaryTag, targetLanguage FROM reading_history WHERE user_id = ? AND id IN (${placeholders})`).all(userId, ...chunk) as any[];

        for (const row of rows) {
          const nextLang = targetLanguage !== undefined ? targetLanguage : row.targetLanguage;
          const nextPrimaryTag = primaryTag !== undefined ? (primaryTag && typeof primaryTag === "string" && primaryTag.trim() ? primaryTag.trim() : null) : row.primaryTag;
          let nextTagsList: string[] = [];

          if (tags !== undefined) {
            if (tagMode === "append") {
              let existingList: string[] = [];
              try {
                existingList = row.tags ? (typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags) : [];
              } catch (_) {}
              const seen = new Set(existingList.map((t: string) => t.toLowerCase()));
              nextTagsList = [...existingList];
              if (Array.isArray(tags)) {
                for (const t of tags) {
                  const clean = typeof t === "string" ? t.trim().replace(/^#+/, "").trim() : "";
                  if (clean && !seen.has(clean.toLowerCase())) {
                    seen.add(clean.toLowerCase());
                    nextTagsList.push(clean);
                  }
                }
              }
            } else {
              nextTagsList = Array.isArray(tags) ? tags.map((t) => typeof t === "string" ? t.trim().replace(/^#+/, "").trim() : "").filter(Boolean) : [];
            }
          } else {
            try {
              nextTagsList = row.tags ? (typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags) : [];
            } catch (_) {}
          }

          if (nextPrimaryTag && !nextTagsList.some((t) => t.toLowerCase() === nextPrimaryTag.toLowerCase())) {
            nextTagsList.unshift(nextPrimaryTag);
          }

          const nextTagsJson = JSON.stringify(nextTagsList);

          db.prepare(`
            UPDATE reading_history
            SET targetLanguage = ?, primaryTag = ?, tags = ?
            WHERE user_id = ? AND id = ?
          `).run(nextLang, nextPrimaryTag, nextTagsJson, userId, row.id);

          if (tags !== undefined || primaryTag !== undefined || targetLanguage !== undefined) {
            db.prepare("DELETE FROM item_tags WHERE user_id = ? AND item_id = ?").run(userId, row.id);
            for (const t of nextTagsList) {
              const tagName = t.trim();
              const isPrim = nextPrimaryTag && nextPrimaryTag.trim().toLowerCase() === tagName.toLowerCase() ? 1 : 0;
              const tagId = `${userId}_${tagName.toLowerCase()}`;
              db.prepare("INSERT OR IGNORE INTO tags (id, user_id, name, color, targetLanguage, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(tagId, userId, tagName, null, nextLang || null, Date.now());
              db.prepare("INSERT OR REPLACE INTO item_tags (user_id, item_id, tag_id, is_primary) VALUES (?, ?, ?, ?)").run(userId, row.id, tagId, isPrim);
            }
          }

          if (row.lessonId && row.lessonId !== "custom" && row.lessonId !== "imported_record") {
            if (targetLanguage !== undefined && (tags !== undefined || primaryTag !== undefined)) {
              db.prepare("UPDATE lessons SET targetLanguage = ?, primaryTag = ?, tags = ? WHERE user_id = ? AND id = ?").run(nextLang, nextPrimaryTag, nextTagsJson, userId, row.lessonId);
            } else if (targetLanguage !== undefined) {
              db.prepare("UPDATE lessons SET targetLanguage = ? WHERE user_id = ? AND id = ?").run(nextLang, userId, row.lessonId);
            } else if (tags !== undefined || primaryTag !== undefined) {
              db.prepare("UPDATE lessons SET primaryTag = ?, tags = ? WHERE user_id = ? AND id = ?").run(nextPrimaryTag, nextTagsJson, userId, row.lessonId);
            }
          }
        }
      }
    })();
    return res.json({ status: "success", count: ids.length });
  } catch (err: any) {
    console.error("[POST /api/history/batch-edit] Error:", err);
    return res.status(500).json({ error: "Failed to batch edit history entries" });
  }
});

// Batch Assign Channel to Lessons & History (POST /api/history/assign-channel)
router.post("/history/assign-channel", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
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

// Get Reading / Listening Activity History (GET /api/history & GET /api/activity)
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
    const lang = (req.query.language || req.query.lang) ? String(req.query.language || req.query.lang).toLowerCase().trim() : null;
    const query = "SELECT * FROM reading_history WHERE user_id = ? ORDER BY timestamp DESC";
    let rows = db.prepare(query).all(userId) as any[];
    if (lang && lang !== "all" && lang !== "overall") {
      rows = rows.filter((h) => matchLanguage(h.targetLanguage, lang));
    }
    const readerSettingsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'readerSettings'").get(userId) as { value: string } | undefined;
    let dailyGoalMinutes = 15;
    let dailyGoalsByLanguage: Record<string, number> = {};
    if (readerSettingsRow?.value) {
      try {
        const parsed = JSON.parse(readerSettingsRow.value);
        if (typeof parsed.dailyGoalMinutes === "number") dailyGoalMinutes = parsed.dailyGoalMinutes;
        if (parsed.dailyGoalsByLanguage && typeof parsed.dailyGoalsByLanguage === "object") {
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
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") customFlags[k.toLowerCase().trim()] = v;
          }
        }
      } catch (_) {}
    }

    const languageFlagsRow = db.prepare("SELECT value FROM metadata WHERE user_id = ? AND key = 'languageFlags'").get(userId) as { value: string } | undefined;
    if (languageFlagsRow?.value) {
      try {
        const parsed = JSON.parse(languageFlagsRow.value);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") customFlags[k.toLowerCase().trim()] = v;
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

// Get Granular Day History (GET /api/activity/day & GET /api/history/day)
const getDayActivityHandler = (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
  }

  const dateStr = req.query.date ? String(req.query.date).trim() : new Date().toISOString().slice(0, 10);
  const lang = (req.query.language || req.query.lang) ? String(req.query.language || req.query.lang).toLowerCase().trim() : null;
  const tzOffset = req.query.tzOffset !== undefined ? Number(req.query.tzOffset) : null;

  try {
    const db = getDbConnection(userId);

    let prevDateStr = "";
    let nextDateStr = "";
    try {
      const parts = dateStr.split("-").map(Number);
      if (parts.length === 3) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        prevDateStr = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
        nextDateStr = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
      }
    } catch (_) {}

    let query = "SELECT * FROM reading_history WHERE user_id = ?";
    const params: any[] = [userId];

    if (prevDateStr && nextDateStr) {
      query += " AND (timestamp LIKE ? OR timestamp LIKE ? OR timestamp LIKE ?)";
      params.push(`${dateStr}%`, `${prevDateStr}%`, `${nextDateStr}%`);
    } else {
      query += " AND timestamp LIKE ?";
      params.push(`${dateStr}%`);
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

    const filteredRows = rows.filter((h) => {
      if (h.timestamp) {
        let itemDate = h.timestamp.slice(0, 10);
        if (tzOffset !== null && !isNaN(tzOffset)) {
          const tMs = new Date(h.timestamp).getTime();
          if (!isNaN(tMs)) {
            const localMs = tMs - tzOffset * 60 * 1000;
            itemDate = new Date(localMs).toISOString().slice(0, 10);
          }
        }
        if (itemDate !== dateStr && !h.timestamp.startsWith(dateStr)) {
          return false;
        }
      }

      if (lang && lang !== "all" && lang !== "overall") {
        if (!matchLanguage(h.targetLanguage, lang)) {
          return false;
        }
      }

      return true;
    });

    const logs = filteredRows.map((h) => {
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
        title: h.lessonTitle || h.customTitle || "Activity Record",
        minutes,
        durationSeconds: durSec,
        language: langCode,
        flag,
        channel: h.channelName || "Lectura",
        source: h.lessonType === "article" ? "Article" : (h.lessonType === "podcast" ? "Podcast" : "YouTube"),
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

// Delete Activity Log (DELETE /api/activity/log/:id)
router.delete("/activity/log/:id", (req: Request, res: Response) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    return handleAuthError(err, res);
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

export default router;