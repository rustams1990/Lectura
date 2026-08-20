import { Router, Request, Response } from "express";
import path from "path";
import Database from "better-sqlite3";
import { aiRateLimit, extractAiProfile } from "./ai.ts";
import { callUniversalAiProvider } from "./geminiClient.ts";

const router = Router();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const CACHE_DB_PATH = path.join(DATA_DIR, "ai_cache.sqlite");

let cacheDbConn: Database.Database | null = null;

function getCacheDb(): Database.Database {
  if (!cacheDbConn) {
    cacheDbConn = new Database(CACHE_DB_PATH);
    cacheDbConn.pragma("journal_mode = WAL");
    cacheDbConn.exec(`
      CREATE TABLE IF NOT EXISTS sentence_translations (
        source_text TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        translation TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source_text, source_lang, target_lang)
      );
      CREATE INDEX IF NOT EXISTS idx_sentence_trans_lookup ON sentence_translations (source_lang, target_lang);
    `);
  }
  return cacheDbConn;
}

const ISO_MAP: Record<string, string> = {
  spanish: "es", spa: "es", es: "es",
  english: "en", eng: "en", en: "en",
  french: "fr", fra: "fr", fr: "fr",
  german: "de", deu: "de", ger: "de", de: "de",
  italian: "it", ita: "it", it: "it",
  russian: "ru", rus: "ru", ru: "ru",
  portuguese: "pt", por: "pt", pt: "pt",
  chinese: "zh", zho: "zh", chi: "zh", zh: "zh",
  japanese: "ja", jpn: "ja", ja: "ja",
  korean: "ko", kor: "ko", ko: "ko",
  turkish: "tr", tur: "tr", tr: "tr",
  polish: "pl", pol: "pl", pl: "pl",
  ukrainian: "uk", ukr: "uk", uk: "uk",
};

function toIso(lang?: string): string {
  if (!lang) return "auto";
  const clean = lang.toLowerCase().trim();
  return ISO_MAP[clean] || (clean.length === 2 ? clean : "auto");
}

/**
 * Fast Google Translate GTX client for translating a single or batch text.
 */
async function translateWithGoogleGtx(text: string, sl: string, tl: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}`);
  const data: any = await resp.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((item: any) => item[0]).join("");
  }
  throw new Error("Unexpected Google Translate response format");
}

/**
 * AI fallback batch translator using Gemini or configured AI profile
 */
async function translateBatchWithAi(
  sentences: string[],
  sourceLang: string,
  targetLang: string,
  req: Request
): Promise<Record<string, string>> {
  const profile = extractAiProfile(req);
  const prompt = `You are a professional language translator. Translate the following array of sentences from ${sourceLang} to ${targetLang}.
Return ONLY a valid JSON object mapping each original sentence string exactly to its translated string.

Sentences to translate:
${JSON.stringify(sentences, null, 2)}

Format:
{
  "Original sentence 1": "Translated sentence 1",
  "Original sentence 2": "Translated sentence 2"
}`;

  try {
    const raw = await callUniversalAiProvider(profile, prompt, {
      formatJson: true,
      temperature: 0.1,
      timeoutMs: 15000,
    });
    if (typeof raw === "object" && raw !== null) {
      return raw as Record<string, string>;
    }
    if (typeof raw === "string") {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Translate] AI batch translation failed:", err);
  }
  return {};
}

// ── Batch Sentence Translation Endpoint ───────────────────────────────────────
router.post("/translate-sentences", aiRateLimit, async (req: Request, res: Response) => {
  const { sentences, sourceLanguage, targetLanguage } = req.body;

  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.json({ translations: {} });
  }

  const sLang = (sourceLanguage || "Spanish").trim();
  const tLang = (targetLanguage || "Russian").trim();
  const sIso = toIso(sLang);
  const tIso = toIso(tLang);

  const db = getCacheDb();
  const result: Record<string, string> = {};
  const missing: string[] = [];

  // 1. Check SQLite Cache
  const selectStmt = db.prepare(`
    SELECT translation FROM sentence_translations 
    WHERE source_text = ? AND source_lang = ? AND target_lang = ?
  `);

  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;

    // Filter out purely punctuation/numbers or timestamps
    if (/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(clean) || /^\[IMG.*\]$/.test(clean)) {
      continue;
    }

    const row = selectStmt.get(clean, sIso, tIso) as { translation: string } | undefined;
    if (row && row.translation) {
      result[clean] = row.translation;
    } else {
      missing.push(clean);
    }
  }

  // 2. If everything was cached, return immediately!
  if (missing.length === 0) {
    return res.json({ translations: result });
  }

  // 3. Batch translate missing sentences (limit concurrency/chunks up to 35 items)
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const uniqueMissing = Array.from(new Set(missing)).slice(0, 35);

  // Parallel fetch with Google Translate GTX
  const fetchPromises = uniqueMissing.map(async (text) => {
    try {
      const translated = await translateWithGoogleGtx(text, sIso, tIso);
      if (translated && translated.trim()) {
        const cleanTrans = translated.trim();
        result[text] = cleanTrans;
        insertStmt.run(text, sIso, tIso, cleanTrans, Date.now());
      }
    } catch (_) {
      // If individual fast translation fails, will be caught by AI fallback below
    }
  });

  await Promise.allSettled(fetchPromises);

  // 4. Any remaining untranslated sentences fallback to AI Universal Provider
  const stillMissing = uniqueMissing.filter((t) => !result[t]);
  if (stillMissing.length > 0) {
    const aiResults = await translateBatchWithAi(stillMissing, sLang, tLang, req);
    for (const [orig, trans] of Object.entries(aiResults)) {
      if (trans && typeof trans === "string" && trans.trim()) {
        const cleanTrans = trans.trim();
        result[orig] = cleanTrans;
        try {
          insertStmt.run(orig, sIso, tIso, cleanTrans, Date.now());
        } catch (_) {}
      }
    }
  }

  return res.json({ translations: result });
});

export default router;
