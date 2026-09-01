import { Router, Request, Response } from "express";
import { resolveUserId } from "./auth.ts";
import { getDbConnection } from "./dbConnection.ts";

const router = Router();

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
    const fallbackUser = String(
      req.body?.userId ||
      req.body?.syncUser ||
      req.body?.userEmail ||
      req.headers["x-user-id"] ||
      req.headers["x-user-email"] ||
      req.headers["x-local-sync-user"] ||
      req.query?.sync_user ||
      req.query?.userId ||
      req.query?.userEmail ||
      ""
    ).trim();

    if (fallbackUser && fallbackUser !== "default") {
      try {
        const db = getDbConnection("default");
        const userRow = db.prepare("SELECT id FROM server_users WHERE id = ? OR lower(email) = ? LIMIT 1").get(fallbackUser, fallbackUser.toLowerCase()) as { id: string } | undefined;
        userId = userRow ? userRow.id : fallbackUser;
      } catch (_) {
        userId = fallbackUser;
      }
    } else {
      try {
        const db = getDbConnection("default");
        const primaryUser = db.prepare("SELECT id FROM server_users WHERE lower(email) = 'rustamniy@gmail.com' LIMIT 1").get() as { id: string } | undefined;
        userId = primaryUser ? primaryUser.id : "default";
      } catch (_) {
        userId = "default";
      }
    }
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
  const targetLang = String(studyLanguage || language || "es").toLowerCase().trim();
  const totalDuration = Math.max(0, Math.round(Number(duration || durationSeconds) || 0));
  const explicitTimeSpent = req.body?.timeSpentSeconds !== undefined ? Math.max(0, Math.round(Number(req.body.timeSpentSeconds) || 0)) : undefined;
  const addedSec = Math.max(0, Math.round(Number(addedSeconds ?? watchedSeconds) || 0));
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
      const newTimeSpent = completed && totalDuration > 0
        ? totalDuration
        : explicitTimeSpent !== undefined
          ? Math.max(prevTimeSpent, explicitTimeSpent)
          : prevTimeSpent + addedSec;
      incrementalSec = Math.max(0, newTimeSpent - prevTimeSpent);

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
      incrementalSec = addedSec > 0
        ? addedSec
        : (explicitTimeSpent !== undefined ? explicitTimeSpent : (completed && totalDuration > 0 ? totalDuration : 0));
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
      const updatedDuration = completed && totalDuration > 0
        ? totalDuration
        : explicitTimeSpent !== undefined
          ? Math.max(prevDuration, explicitTimeSpent)
          : prevDuration + addedSec;

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
        updatedDuration,
        totalDuration,
        totalDuration,
        userId,
        existingHistory.id
      );
    } else {
      // Create new history entry (even with 0 seconds on initial video open, so it immediately shows up in TODAY)
      const initialDuration = completed && totalDuration > 0
        ? totalDuration
        : explicitTimeSpent !== undefined
          ? explicitTimeSpent
          : addedSec;

      const historyId = "hist_yt_" + (cleanVideoId || Date.now().toString(36)) + "_" + Date.now().toString(36);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
          timestamp, actionType, status, durationSeconds, channelName, channelAvatarUrl,
          channelUrl, category, customTitle, mode, tags, lastPosition, duration
        ) VALUES (?, ?, ?, ?, 'youtube', ?, ?, ?, 'listen', ?, ?, ?, ?, ?, 'video', ?, 'custom', ?, ?, ?)
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
        JSON.stringify(["youtube", "extension"]),
        initialDuration,
        totalDuration
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

export default router;