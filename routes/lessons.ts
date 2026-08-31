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
    let query = "SELECT * FROM lessons WHERE user_id = ?";
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

export default router;
