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
    // Beacon / keepalive fallback: check request body or query params for user identification
    const fallbackUser = String(
      req.body?.userId ||
      req.body?.syncUser ||
      req.query?.sync_user ||
      req.headers["x-local-sync-user"] ||
      ""
    ).trim();

    if (fallbackUser && fallbackUser !== "default") {
      userId = fallbackUser;
    } else {
      userId = "default";
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
  const totalDuration = Math.round(Number(duration || durationSeconds) || 0);
  const addedSec = Math.max(0, Math.round(Number(addedSeconds ?? watchedSeconds) || 0));
  const completed = Boolean(isCompleted);
  const statusStr = completed ? "COMPLETED" : "IN_PROGRESS";

  const now = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const todayDate = now.split("T")[0]; // "YYYY-MM-DD"

  try {
    const db = getDbConnection(userId);

    // 1. Lessons table: find or create lesson
    const lessonId = cleanVideoId ? `lesson-yt_${cleanVideoId}` : `custom_activity_${Date.now().toString(36)}`;
    let lesson = cleanVideoId
      ? (db.prepare(`
          SELECT id, timeSpentSeconds, status, duration 
          FROM lessons 
          WHERE (youtubeId = ? OR id = ? OR id = ?) AND user_id = ?
        `).get(cleanVideoId, lessonId, `youtube_${cleanVideoId}`, userId) as any)
      : null;

    if (!lesson) {
      db.prepare(`
        INSERT INTO lessons (
          id, user_id, title, text, youtubeId, channelName, channelUrl, channelAvatarUrl,
          duration, sourceType, targetLanguage, translationLanguage,
          timeSpentSeconds, status, isArchived, createdAt, updatedAt
        ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'youtube', ?, 'ru', ?, ?, 0, ?, ?)
      `).run(
        lessonId,
        userId,
        cleanTitle,
        cleanVideoId,
        cleanChannel,
        cleanChannelUrl,
        channelAvatarUrl || null,
        totalDuration,
        targetLang,
        addedSec,
        statusStr,
        Date.now(),
        now
      );
      lesson = { id: lessonId, timeSpentSeconds: addedSec, status: statusStr };
    } else {
      const newTimeSpent = (lesson.timeSpentSeconds || 0) + addedSec;
      const newStatus = completed ? "COMPLETED" : (lesson.status || "IN_PROGRESS");
      db.prepare(`
        UPDATE lessons 
        SET timeSpentSeconds = ?, status = ?, updatedAt = ?,
            duration = CASE WHEN COALESCE(duration, 0) > 0 THEN duration ELSE ? END,
            channelName = COALESCE(?, channelName),
            channelUrl = COALESCE(?, channelUrl)
        WHERE id = ? AND user_id = ?
      `).run(
        newTimeSpent,
        newStatus,
        now,
        totalDuration,
        cleanChannel,
        cleanChannelUrl,
        lesson.id,
        userId
      );
    }

    // 2. study_activity_logs: Daily activity log (for analytics, streaks, and graphs)
    if (addedSec > 0) {
      db.prepare(`
        INSERT INTO study_activity_logs (userId, lessonId, date, secondsSpent, updatedAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(userId, lessonId, date) 
        DO UPDATE SET secondsSpent = secondsSpent + ?, updatedAt = ?
      `).run(userId, lesson.id, todayDate, addedSec, now, addedSec, now);
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
      `).get(userId, lesson.id, `youtube_${cleanVideoId}`, `%${cleanVideoId}%`, `${todayDate}%`);
    }

    if (existingHistory) {
      const updatedDuration = (existingHistory.durationSeconds || 0) + addedSec;
      db.prepare(`
        UPDATE reading_history SET
          durationSeconds = ?,
          timestamp = ?,
          status = ?,
          lessonTitle = COALESCE(?, lessonTitle),
          channelName = COALESCE(?, channelName),
          channelAvatarUrl = COALESCE(?, channelAvatarUrl),
          channelUrl = COALESCE(?, channelUrl),
          coverUrl = COALESCE(?, coverUrl)
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
        userId,
        existingHistory.id
      );
    } else {
      // Create new history entry (even with 0 seconds on initial video open, so it immediately shows up in TODAY)
      const historyId = "hist_yt_" + (cleanVideoId || Date.now().toString(36)) + "_" + Date.now().toString(36);
      db.prepare(`
        INSERT INTO reading_history (
          id, user_id, lessonId, lessonTitle, lessonType, coverUrl, targetLanguage,
          timestamp, actionType, status, durationSeconds, channelName, channelAvatarUrl,
          channelUrl, category, customTitle, mode, tags
        ) VALUES (?, ?, ?, ?, 'youtube', ?, ?, ?, 'listen', ?, ?, ?, ?, ?, 'video', ?, 'custom', ?)
      `).run(
        historyId,
        userId,
        lesson.id,
        cleanTitle,
        cleanCover,
        targetLang,
        now,
        completed ? "completed" : "in_progress",
        addedSec,
        cleanChannel,
        channelAvatarUrl || null,
        cleanChannelUrl || null,
        cleanTitle,
        JSON.stringify(["youtube", "extension"])
      );
    }

    // 4. Update metadata aggregate listeningSeconds
    if (addedSec > 0) {
      const currentListeningRow = db.prepare(
        "SELECT value FROM metadata WHERE user_id = ? AND key = 'listeningSeconds'"
      ).get(userId) as { value: string } | undefined;
      const currentTotal = currentListeningRow ? (parseFloat(currentListeningRow.value) || 0) : 0;
      const newTotal = Math.round(currentTotal + addedSec);

      db.prepare(
        "INSERT OR REPLACE INTO metadata (user_id, key, value) VALUES (?, 'listeningSeconds', ?)"
      ).run(userId, String(newTotal));
    }

    return res.json({
      success: true,
      lessonId: lesson.id,
      addedSeconds: addedSec,
      timestamp: now
    });
  } catch (err: any) {
    console.error("[track-activity] Error saving activity:", err);
    return res.status(500).json({ error: "Failed to track activity: " + err.message });
  }
}

router.post("/history/track-activity", handleTrackActivity);
router.post("/history/log", handleTrackActivity);
router.post("/activity/log", handleTrackActivity);

export default router;