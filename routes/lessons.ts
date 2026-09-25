import { Router, Request, Response } from "express";
import { resolveUserId } from "./auth.ts";
import { getDbConnection } from "./dbConnection.ts";

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
            // Remove lessonIds from this playlist
            const filteredItems = plItems.filter((it: any) => !lessonIds.includes(it.lessonId));
            if (filteredItems.length !== plItems.length) {
              changed = true;
            }

            if (pl.id === targetPlaylist) {
              // Add lessons to this playlist
              for (const id of lessonIds) {
                const lRow = getLessonStmt.get(id, userId) as any;
                if (lRow) {
                  filteredItems.push({
                    id: `item_${lRow.id}_${Date.now()}`,
                    lessonId: lRow.id,
                    title: lRow.title,
                    videoId: lRow.youtubeId || null,
                    durationSeconds: lRow.duration || 0,
                    thumbnailUrl: lRow.coverUrl || "",
                    transcriptLoaded: !!(lRow.text && lRow.text.length > 20),
                  });
                  changed = true;
                }
              }
            }

            if (changed) {
              db.prepare("UPDATE playlists SET items = ?, itemCount = ?, updatedAt = ? WHERE id = ? AND user_id = ?").run(
                JSON.stringify(filteredItems),
                filteredItems.length,
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

export default router;
