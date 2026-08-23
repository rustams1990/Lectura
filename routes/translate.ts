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
 * Live Google Translate GTX client for translating words with multiple synonyms and phrases in context.
 */
async function translateWithGoogleGtx(text: string, sl: string, tl: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return "";
  const isMultiWord = clean.includes(" ");
  const dtParams = isMultiWord ? "dt=t" : "dt=t&dt=at&dt=bd";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&${dtParams}&q=${encodeURIComponent(clean)}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}`);
  const data: any = await resp.json();
  if (!data) throw new Error("Empty Google Translate response");

  let primary = "";
  if (Array.isArray(data[0])) {
    primary = data[0].map((item: any) => (item && item[0] ? item[0] : "")).join("").trim();
  }

  // If multi-word phrase, return full contextual translation
  if (isMultiWord) {
    if (primary) return primary;
    throw new Error("No phrase translation returned");
  }

  // Single word: format structured definitions by Part of Speech if available
  if (data[1] && Array.isArray(data[1]) && data[1].length > 0) {
    const posLines: string[] = [];
    for (const posBlock of data[1]) {
      if (posBlock && typeof posBlock[0] === "string" && Array.isArray(posBlock[1]) && posBlock[1].length > 0) {
        const posTag = posBlock[0].toLowerCase();
        const topWords = posBlock[1].slice(0, 4).map((w: any) => String(w).trim()).filter(Boolean);
        if (topWords.length > 0) {
          posLines.push(`(${posTag}) ${topWords.join(", ")}`);
        }
      }
    }
    if (posLines.length > 0) {
      return posLines.join("\n");
    }
  }

  // Fallback: collect top 2-3 distinct synonyms
  const definitions: string[] = [];
  if (primary) {
    definitions.push(primary);
  }

  // Alternative translation blocks (data[5])
  if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
    for (const item of data[5][0][2]) {
      if (item && typeof item[0] === "string" && item[0].trim()) {
        const cleanSyn = item[0].trim();
        if (!definitions.some((d) => d.toLowerCase() === cleanSyn.toLowerCase())) {
          definitions.push(cleanSyn);
        }
      }
    }
  }

  if (definitions.length > 0) {
    return definitions.slice(0, 3).join(", ");
  }

  if (primary) return primary;
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

const COMMON_WORD_DICTIONARY: Record<string, Record<string, string>> = {
  "en_ru": {
    "you": "ты, вы, вам",
    "were": "были, был, была",
    "was": "был, была, было",
    "be": "быть, являться",
    "been": "был, была (бывший)",
    "to": "к, в, чтобы",
    "the": "(определённый артикль)",
    "a": "(неопределённый артикль)",
    "an": "(неопределённый артикль)",
    "it": "это, оно, ему",
    "i": "я, мне",
    "we": "мы, нам",
    "they": "они, им",
    "he": "он, ему",
    "she": "она, ей",
    "and": "и",
    "or": "или",
    "but": "но",
    "in": "в",
    "on": "на",
    "at": "в, у, около",
    "for": "для, за",
    "of": "из, о",
    "with": "с, вместе с",
    "as": "как, в качестве",
    "by": "у, около, с помощью",
    "is": "есть, является",
    "are": "являются, есть",
    "am": "являюсь, есть",
    "have": "иметь",
    "has": "имеет",
    "had": "имел, имели",
    "do": "делать",
    "does": "делает",
    "did": "делал, сделали",
    "can": "мочь, уметь",
    "could": "мог, могли",
    "will": "будет, будут",
    "would": "бы",
    "should": "следует, должен",
    "must": "должен, обязаны",
    "my": "мой, моя, моё",
    "your": "твой, ваш",
    "their": "их",
    "our": "наш",
    "his": "его",
    "her": "её",
    "its": "его, её",
    "this": "этот, эта, это",
    "that": "тот, та, то",
    "these": "эти",
    "those": "те",
    "what": "что, какой",
    "who": "кто",
    "where": "где, куда",
    "when": "когда",
    "why": "почему, зачем",
    "how": "как",
    "not": "не, нет",
    "no": "нет, никакой",
    "yes": "да",
  }
};

/**
 * Fast MyMemory translation fallback
 */
async function translateWithMyMemory(text: string, sl: string, tl: string): Promise<string> {
  const from = sl === "auto" ? "en" : sl;
  const to = tl === "auto" ? "ru" : tl;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);
  const data: any = await resp.json();
  if (data?.responseData?.translatedText && !data.responseData.translatedText.includes("MYMEMORY WARNING")) {
    return data.responseData.translatedText;
  }
  throw new Error("No valid MyMemory translation");
}

// ── Single Word/Text Translation Endpoint for Browser Extensions & Quick Lookups ───
router.post("/translate", aiRateLimit, async (req: Request, res: Response) => {
  const text = (req.body.text || req.body.word || "").trim();
  const sourceLanguage = req.body.sourceLanguage || req.body.sourceLang || req.body.sl || "auto";
  const targetLanguage = req.body.targetLanguage || req.body.targetLang || req.body.tl || "ru";

  if (!text) {
    return res.status(400).json({ error: "Missing text to translate" });
  }

  const sIso = toIso(sourceLanguage);
  const tIso = toIso(targetLanguage);
  const db = getCacheDb();

  // 1. Primary: Live Google Translate RPC (with multiple synonyms and contextual phrases)
  try {
    const gtxTranslation = await translateWithGoogleGtx(text, sIso, tIso);
    if (gtxTranslation && gtxTranslation.trim()) {
      const clean = gtxTranslation.trim();
      try {
        db.prepare(`
          INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(text, sIso, tIso, clean, Date.now());
      } catch (_) {}
      return res.json({ text, translation: clean, sourceLang: sIso, targetLang: tIso });
    }
  } catch (err: any) {
    console.warn("[POST /api/translate] Google GTX RPC error, checking fallbacks:", err.message);
  }

  // 2. Secondary: Check SQLite Cache
  try {
    const row = db.prepare(`
      SELECT translation FROM sentence_translations 
      WHERE source_text = ? AND source_lang = ? AND target_lang = ?
    `).get(text, sIso, tIso) as { translation: string } | undefined;

    if (row?.translation) {
      return res.json({ text, translation: row.translation, cached: true });
    }
  } catch (_) {}

  // 3. Fallback: Fast MyMemory
  try {
    const myMemoryTrans = await translateWithMyMemory(text, sIso, tIso);
    if (myMemoryTrans && myMemoryTrans.trim()) {
      const clean = myMemoryTrans.trim();
      try {
        db.prepare(`
          INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(text, sIso, tIso, clean, Date.now());
      } catch (_) {}
      return res.json({ text, translation: clean, sourceLang: sIso, targetLang: tIso });
    }
  } catch (_) {}

  // 4. Fallback: AI translation
  try {
    const aiResults = await translateBatchWithAi([text], sourceLanguage, targetLanguage, req);
    if (aiResults[text]) {
      const clean = aiResults[text].trim();
      try {
        db.prepare(`
          INSERT OR REPLACE INTO sentence_translations (source_text, source_lang, target_lang, translation, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(text, sIso, tIso, clean, Date.now());
      } catch (_) {}
      return res.json({ text, translation: clean, sourceLang: sIso, targetLang: tIso });
    }
  } catch (err: any) {
    console.error("[POST /api/translate] Translation error:", err);
  }

  // 5. Fallback: Builtin dictionary
  const dictKey = `${sIso}_${tIso}`;
  const lowerText = text.toLowerCase();
  if (COMMON_WORD_DICTIONARY[dictKey] && COMMON_WORD_DICTIONARY[dictKey][lowerText]) {
    return res.json({ text, translation: COMMON_WORD_DICTIONARY[dictKey][lowerText], sourceLang: sIso, targetLang: tIso });
  }

  return res.json({ text, translation: "", sourceLang: sIso, targetLang: tIso });
});

export default router;
