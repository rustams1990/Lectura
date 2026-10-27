import { Router, Request, Response } from "express";
import { getDbConnection } from "./dbConnection.ts";
import { resolveUserId } from "./auth.ts";
import { normalizeLang } from "./htmlTextUtils.ts";
import { normalizeContraction } from "../src/utils.ts";
import { ignoreListManager } from "../src/services/ignoreListService.ts";

const router = Router();

export function normalizeCanonicalWord(token: string, lang: string): string {
  const trimmed = (token || "").trim();
  if (!trimmed) return "";
  const isAllUpper = trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase() && trimmed.length > 1;
  const isAcronym = /^(?:USA|UK|EU|UN|AI|FBI|CIA|NASA|NATO|HTML|CSS|JS|API|URL|UI|ID|TV|CD|DVD|VIP|SOS)$/i.test(trimmed);
  const langLower = (lang || "").toLowerCase();
  const isGerman = langLower.startsWith("de") || langLower.startsWith("german");

  if (isAllUpper && !isAcronym) {
    if (isGerman) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }
    return trimmed.toLowerCase();
  }
  if (!isGerman && !isAcronym && !trimmed.includes(" ")) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

// 1. Save / Update Word (Vocabulary Item)
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
  const canonicalWord = normalizeCanonicalWord(rawWord, langName);
  const wordStatus = String(status || "1");
  let wordTranslation = (translation || "").trim();
  const invalidPlaceholders = ["translating...", "loading...", "—", "— (нет данных)", "перевод не найден"];
  if (invalidPlaceholders.includes(wordTranslation.toLowerCase()) || wordTranslation.toLowerCase() === rawWord.toLowerCase()) {
    wordTranslation = "";
  }
  const hasDefinition = definition !== undefined;
  const wordDefinition = hasDefinition ? (definition ? String(definition).trim() : null) : null;
  const wordIpa = ipa ? String(ipa).trim() : "";
  const wordGrammar = grammar ? String(grammar).trim() : "";
  const wordContext = contextRelation ? String(contextRelation).trim() : (contextSentence ? String(contextSentence).trim() : "");

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

    db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `).run(langName, langName);

    const newWordId = `${userId}_${langLower}_${canonicalWord.toLowerCase()}`;

    const existing = db.prepare("SELECT id, translation FROM words WHERE user_id = ? AND language_code = ? AND (word = ? OR lower(word) = ?)").get(userId, langName, canonicalWord, canonicalWord.toLowerCase()) as any;

    if (existing) {
      db.prepare(`
        UPDATE words SET
          word = ?,
          translation = CASE WHEN ? != '' THEN ? ELSE words.translation END,
          definition = CASE WHEN ? = 1 THEN ? ELSE definition END,
          ipa = CASE WHEN ? != '' THEN ? ELSE ipa END,
          grammar = CASE WHEN ? != '' THEN ? ELSE grammar END,
          contextRelation = CASE WHEN ? != '' THEN ? ELSE contextRelation END,
          status = ?,
          tags = ?,
          imageUrl = COALESCE(?, imageUrl),
          examples = CASE WHEN ? != '[]' THEN ? ELSE examples END
        WHERE user_id = ? AND id = ?
      `).run(
        canonicalWord,
        wordTranslation, wordTranslation,
        hasDefinition ? 1 : 0, wordDefinition,
        wordIpa, wordIpa,
        wordGrammar, wordGrammar,
        wordContext, wordContext,
        wordStatus,
        tagsJson,
        imageUrl || null,
        examplesJson, examplesJson,
        userId,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO words (
          id, user_id, language_code, word, translation, definition,
          ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          word = excluded.word,
          status = excluded.status,
          examples = CASE WHEN excluded.examples != '[]' THEN excluded.examples ELSE words.examples END,
          imageUrl = COALESCE(excluded.imageUrl, words.imageUrl)
      `).run(
        newWordId,
        userId,
        langName,
        canonicalWord,
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

    console.log(`[EXTENSION API] Word saved: '${canonicalWord}' (orig: '${rawWord}') -> '${wordTranslation}' (${wordStatus}) [${langName}] for user "${userId}"`);
    return res.json({
      status: "success",
      userId,
      word: canonicalWord,
      language: langName,
      wordStatus,
      translation: wordTranslation
    });
  } catch (err: any) {
    console.error("[POST /api/words] Error saving word:", err);
    return res.status(500).json({ error: "Failed to save word: " + err.message });
  }
});

// 2. Get Words List / Dictionary Map (For extension caching & in-situ highlights)
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
        const invalidPlaceholders = ["translating...", "loading...", "—", "— (нет данных)", "перевод не найден"];
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

    console.log(`[GET /api/words] Returned ${rows.length} words for user "${userId}" (lang filter: "${rawLang || "ALL"}")`);
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

// 3. Batch Word Status Lookup (strictly filtered by language & user_id)
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

  const cleanWords = Array.from(
    new Set(
      words
        .map((w: any) => String(w || "").trim().toLowerCase().replace(/[’‘ʻʼ´`]/g, "'"))
        .filter(Boolean)
    )
  );
  if (cleanWords.length === 0) {
    return res.json({ status: "ok", results: {}, map: {} });
  }

  try {
    const db = getDbConnection(userId);
    const chunkSize = 400;
    const map: Record<string, {
      status: string;
      translation: string;
      ipa?: string;
      language: string;
      isAutoIgnored?: boolean;
      ignoreCategory?: string;
      ignoreBadge?: string;
      ignoreIcon?: string;
      ignoreCategoryId?: string | null;
      lemma?: string;
    }> = {};

    // 1. Direct match in user words table
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
          const wLower = r.word.toLowerCase().replace(/[’‘ʻʼ´`]/g, "'").trim();
          let trans = (r.translation || "").trim();
          const invalidPlaceholders = ["translating...", "loading...", "—", "— (нет данных)", "перевод не найден"];
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

    // 2. Contraction normalization for words not matched directly
    const missingContractions: { original: string; base: string }[] = [];
    for (const w of cleanWords) {
      if (!map[w]) {
        const base = normalizeContraction(w, canonicalLang);
        if (base && base !== w) {
          if (map[base]) {
            map[w] = {
              ...map[base],
              lemma: base
            };
          } else {
            missingContractions.push({ original: w, base });
          }
        }
      }
    }

    if (missingContractions.length > 0) {
      const uniqueBases = Array.from(new Set(missingContractions.map((mc) => mc.base)));
      for (let i = 0; i < uniqueBases.length; i += chunkSize) {
        const chunk = uniqueBases.slice(i, i + chunkSize);
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
            const baseLower = r.word.toLowerCase().replace(/[’‘ʻʼ´`]/g, "'").trim();
            let trans = (r.translation || "").trim();
            const invalidPlaceholders = ["translating...", "loading...", "—", "— (нет данных)", "перевод не найден"];
            if (invalidPlaceholders.includes(trans.toLowerCase()) || trans.toLowerCase() === baseLower) {
              trans = "";
            }
            const baseEntry = {
              status: r.status,
              translation: trans,
              ipa: r.ipa || "",
              language: r.language_code || canonicalLang
            };
            map[baseLower] = baseEntry;
            for (const mc of missingContractions) {
              if (mc.base === baseLower && !map[mc.original]) {
                map[mc.original] = {
                  ...baseEntry,
                  lemma: baseLower
                };
              }
            }
          }
        }
      }
    }

    // 3. Auto-ignore check for remaining words
    for (const w of cleanWords) {
      if (!map[w]) {
        let autoRes = ignoreListManager.checkAutoIgnore(w, undefined, canonicalLang);
        let matchedWord = w;
        if (!autoRes.isIgnored) {
          const base = normalizeContraction(w, canonicalLang);
          if (base && base !== w) {
            autoRes = ignoreListManager.checkAutoIgnore(base, undefined, canonicalLang);
            matchedWord = base;
          }
        }

        if (autoRes.isIgnored) {
          map[w] = {
            status: "ignored",
            translation: "",
            ipa: "",
            language: canonicalLang,
            isAutoIgnored: true,
            ignoreCategory: autoRes.categoryLabelEn,
            ignoreBadge: autoRes.shortNameEn,
            ignoreIcon: autoRes.icon,
            ignoreCategoryId: autoRes.categoryId,
            lemma: matchedWord !== w ? matchedWord : undefined
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

// 4. POST /api/word-links: Save morphological parent-child link (e.g. were -> be)
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

    db.prepare(`
      INSERT OR REPLACE INTO word_links (user_id, language_code, word_from, word_to)
      VALUES (?, ?, ?, ?)
    `).run(userId, langName, sourceWord, targetWord);

    const parentRow = db.prepare(`
      SELECT status, translation, definition, ipa, grammar FROM words
      WHERE user_id = ? AND (lower(language_code) = ? OR lower(language_code) = ?) AND lower(word) = ?
    `).get(userId, langLower, rawLang.toLowerCase(), targetWord) as any;

    let inheritedStatus = parentRow?.status || "new";
    let inheritedTranslation = parentRow?.translation || "";

    if (parentRow) {
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

// 5. GET /api/word-links: Get all word links for user & language
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
