import { Router } from "express";
import { Type } from "@google/genai";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { 
  getGeminiClient, callLocalAi, callUniversalAiProvider, 
  AIProfilePayload, UniversalAiOptions, extractAndParseJson, sanitizeGeminiKey 
} from "./geminiClient.ts";

const router = Router();

export function extractAiProfile(req: any): AIProfilePayload {
  if (req.body?.aiProfile && typeof req.body.aiProfile === "object") {
    return req.body.aiProfile;
  }
  const customKey = (req.headers["x-gemini-key"] as string) || req.body?.geminiApiKey;
  if (req.body?.aiProvider === "local" || req.body?.localAiUrl) {
    return {
      provider: "ollama",
      baseUrl: req.body.localAiUrl || "http://localhost:11434/api/generate",
      model: req.body.localAiModel || "phi3.5"
    };
  }
  return {
    provider: "gemini",
    apiKey: customKey || process.env.GEMINI_API_KEY,
    model: req.body?.aiModel || "gemini-2.5-flash"
  };
}

// Test Connection Endpoint
const handleTestProfile = async (req: any, res: any) => {
  const profile: AIProfilePayload = req.body?.profile || req.body;
  if (!profile || !profile.provider) {
    return res.status(400).json({ error: "Profile configuration is missing" });
  }

  const start = performance.now();
  try {
    const result = await callUniversalAiProvider(profile, "Hello, reply with 'OK' only.", {
      maxOutputTokens: 15,
      temperature: 0.1,
      timeoutMs: 15000
    });
    const latencyMs = Math.round(performance.now() - start);
    return res.json({
      success: true,
      message: "Connection test succeeded",
      reply: typeof result === "string" ? result.trim() : JSON.stringify(result),
      latencyMs
    });
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return res.status(err.status || 400).json({
      success: false,
      error: err.message || "Connection failed",
      status: err.status || 400,
      isQuotaExceeded: !!err.isQuotaExceeded,
      latencyMs
    });
  }
};

const DATA_DIR = process.env.DATA_DIR || process.cwd();

// ============================================================
// Rate Limiter — 30 запросов в минуту с одного IP
// ============================================================

export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Слишком много запросов к AI. Пожалуйста, подождите минуту.",
    retryAfter: 60
  },
  keyGenerator: (req) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown",
});

router.post("/test-profile", aiRateLimit, handleTestProfile);
router.post("/ai/test-profile", aiRateLimit, handleTestProfile);

// ============================================================
// Защита от Prompt Injection: санация полей языка
// ============================================================

const KNOWN_LANGUAGES: Record<string, string> = {
  // English labels
  "english": "English", "en": "English",
  "spanish": "Spanish", "español": "Spanish", "es": "Spanish",
  "french": "French", "français": "French", "fr": "French",
  "german": "German", "deutsch": "German", "de": "German",
  "italian": "Italian", "italiano": "Italian", "it": "Italian",
  "portuguese": "Portuguese", "português": "Portuguese", "pt": "Portuguese",
  "russian": "Russian", "ru": "Russian",
  "japanese": "Japanese", "ja": "Japanese",
  "chinese": "Chinese", "zh": "Chinese",
  "arabic": "Arabic", "ar": "Arabic",
  "korean": "Korean", "ko": "Korean",
  "turkish": "Turkish", "türkçe": "Turkish", "tr": "Turkish",
  "ukrainian": "Ukrainian", "uk": "Ukrainian",
  "kazakh": "Kazakh", "kk": "Kazakh",
  "polish": "Polish", "pl": "Polish",
  "dutch": "Dutch", "nl": "Dutch",
  "swedish": "Swedish", "sv": "Swedish",
  "greek": "Greek", "el": "Greek",
  "hebrew": "Hebrew", "he": "Hebrew",
  "hindi": "Hindi", "hi": "Hindi",
  // Russian labels
  "английский": "English",
  "испанский": "Spanish",
  "французский": "French",
  "немецкий": "German",
  "итальянский": "Italian",
  "португальский": "Portuguese",
  "русский": "Russian",
  "японский": "Japanese",
  "китайский": "Chinese",
  "арабский": "Arabic",
  "корейский": "Korean",
  "турецкий": "Turkish",
  "украинский": "Ukrainian",
  "казахский": "Kazakh",
  "польский": "Polish",
  "нидерландский": "Dutch",
  "шведский": "Swedish",
  "греческий": "Greek",
  "иврит": "Hebrew",
  "хинди": "Hindi",
  // Native labels
  "українська": "Ukrainian", "український": "Ukrainian",
  "қазақша": "Kazakh", "қазақ тілі": "Kazakh",
  "中文": "Chinese", "日本語": "Japanese",
  "한국어": "Korean", "عربي": "Arabic", "عربية": "Arabic",
};

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)/i,
  /system\s+prompt/i,
  /\binstruction/i,
  /\bpretend\b/i,
  /\bforget\b/i,
  /\bact\s+as\b/i,
  /\brole\s*play/i,
  /\bjailbreak/i,
  /\bDAN\b/,
  /\bdo\s+anything\s+now\b/i,
];

export function sanitizeLang(raw: string | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;

  const trimmed = raw.trim().substring(0, 80);

  if (INJECTION_PATTERNS.some(p => p.test(trimmed))) {
    console.warn(`[sanitizeLang] Potential prompt injection blocked: "${trimmed.substring(0, 60)}"`);
    return fallback;
  }

  const cleaned = trimmed.replace(/[^\p{L}\p{N}\s\-]/gu, "").trim();

  const lookup = cleaned.toLowerCase();
  if (KNOWN_LANGUAGES[lookup]) {
    return KNOWN_LANGUAGES[lookup];
  }

  if (cleaned.length >= 2 && cleaned.length <= 40 && !/\d/.test(cleaned)) {
    return cleaned;
  }

  return fallback;
}

export function sanitizeGrammarTag(tag: string): string {
  if (!tag) return "Word";
  let clean = tag.trim();

  const separators = [",", ";", "(", "/"];
  for (const sep of separators) {
    const idx = clean.indexOf(sep);
    if (idx !== -1) {
      clean = clean.substring(0, idx).trim();
    }
  }

  clean = clean.replace(/^[^a-zA-Z\p{L}]+|[^a-zA-Z\p{L}]+$/gu, "");

  const lower = clean.toLowerCase();

  const ruToEnMap: Record<string, string> = {
    "существительное": "Noun",
    "сущ": "Noun",
    "глагол": "Verb",
    "гл": "Verb",
    "прилагательное": "Adjective",
    "прил": "Adjective",
    "наречие": "Adverb",
    "нар": "Adverb",
    "междометие": "Interjection",
    "межд": "Interjection",
    "союз": "Conjunction",
    "предлог": "Preposition",
    "местоимение": "Pronoun",
    "мест": "Pronoun",
    "частица": "Particle",
    "причастие": "Participle",
    "деепричастие": "Gerund",
    "идиома": "Idiom",
    "фразовый глагол": "Phrasal Verb",
    "выражение": "Phrase",
    "устойчивое выражение": "Set Expression",
    "сокращение": "Abbreviation"
  };

  if (ruToEnMap[lower]) {
    return ruToEnMap[lower];
  }

  if (/[а-яА-ЯёЁ]/.test(clean)) {
    if (clean.includes(" ") || clean.length > 15) {
      return "Phrase";
    }
    return "Word";
  }

  if (clean.length > 0) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean || "Word";
}

// ============================================================
// SQLite Кэширование AI-ответов (/explain)
// ============================================================

const CACHE_DB_PATH = path.join(DATA_DIR, "ai_cache.sqlite");
let cacheDbConn: Database.Database | null = null;

function getCacheDb(): Database.Database {
  if (!cacheDbConn) {
    cacheDbConn = new Database(CACHE_DB_PATH);
    cacheDbConn.pragma("journal_mode = WAL");
    cacheDbConn.exec(`
      CREATE TABLE IF NOT EXISTS ai_explain_cache (
        cache_key TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        context TEXT,
        target_lang TEXT NOT NULL,
        translation_lang TEXT NOT NULL,
        custom_question TEXT,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_explain_cache_created ON ai_explain_cache(created_at);
    `);
  }
  return cacheDbConn;
}

function getCachedExplain(
  word: string,
  context: string,
  targetLang: string,
  translationLang: string,
  customQuestion?: string
): any | null {
  try {
    const db = getCacheDb();
    const keySource = `${word.toLowerCase().trim()}|${(context || "").toLowerCase().trim()}|${targetLang.toLowerCase().trim()}|${translationLang.toLowerCase().trim()}|${(customQuestion || "").toLowerCase().trim()}`;
    const cacheKey = crypto.createHash("md5").update(keySource).digest("hex");

    const stmt = db.prepare("SELECT response_json FROM ai_explain_cache WHERE cache_key = ?");
    const row = stmt.get(cacheKey) as { response_json: string } | undefined;
    if (row && row.response_json) {
      const parsed = JSON.parse(row.response_json);
      return { ...parsed, isCached: true };
    }
  } catch (err) {
    console.error("[AI Cache Read Error]:", err);
  }
  return null;
}

function setCachedExplain(
  word: string,
  context: string,
  targetLang: string,
  translationLang: string,
  customQuestion: string | undefined,
  responseObj: any
): void {
  try {
    if (!responseObj || responseObj.isDemo || responseObj.error) return;

    const db = getCacheDb();
    const keySource = `${word.toLowerCase().trim()}|${(context || "").toLowerCase().trim()}|${targetLang.toLowerCase().trim()}|${translationLang.toLowerCase().trim()}|${(customQuestion || "").toLowerCase().trim()}`;
    const cacheKey = crypto.createHash("md5").update(keySource).digest("hex");

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ai_explain_cache
      (cache_key, word, context, target_lang, translation_lang, custom_question, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      cacheKey,
      word.trim(),
      context || "",
      targetLang,
      translationLang,
      customQuestion || "",
      JSON.stringify(responseObj),
      Date.now()
    );
  } catch (err) {
    console.error("[AI Cache Write Error]:", err);
  }
}

// ============================================================
// AI Routes
// ============================================================

router.post("/explain", aiRateLimit, async (req, res) => {
  const { word, context, customQuestion } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
  const cleanQuestion = typeof customQuestion === "string"
    ? customQuestion.substring(0, 500)
    : undefined;

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");

  // 1. Проверяем наличие ответа в SQLite кэше
  const cachedData = getCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, cleanQuestion);
  if (cachedData) {
    return res.json(cachedData);
  }

  const profile = extractAiProfile(req);

  try {
    let prompt = "";
    let systemInstruction = "";
    if (cleanQuestion) {
      systemInstruction = `You are a helpful language learning assistant. Answer the user's specific linguistic question in ${translationLanguage || "Russian"}. Return strictly valid JSON.`;
      prompt = `The user highlighted the text: "${word}"
Surrounding context: "${context || word}"
Target language of the text: ${targetLanguage || "auto-detect"}
User's native/translation language: ${translationLanguage || "Russian"}

The user has a custom question/request about this highlighted text:
"${cleanQuestion}"

Please answer the user's question clearly and helpful in ${translationLanguage || "Russian"}.

Return your answer strictly in JSON format with these exact keys:
- "translation": A concise summary translation or direct answer (1-2 sentences) in ${translationLanguage || "Russian"}
- "contextRelation": The detailed explanation answering the user's question, including grammatical analysis, context details, or idiom break down in ${translationLanguage || "Russian"}
- "ipa": Pronunciation IPA representation of the highlighted text (optional, leave empty if not applicable)
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "examples": an array of up to 2 objects, each containing:
  - "text": a simple example sentence in the target language featuring the highlighted text or related concept
  - "translation": translation of the example sentence in ${translationLanguage || "Russian"}`;
    } else {
      systemInstruction = `You are a precise language dictionary and vocabulary explainer. Provide exact translations and grammatical breakdown. Return strictly valid JSON.`;
      prompt = `Translate the word "${cleanWord}" (which is inside the surrounding context: "${context || cleanWord}") from ${targetLanguage || "auto-detect"} to ${translationLanguage || "Russian"}.
Provide the exact IPA pronunciation of the word "${cleanWord}", its grammar/part of speech details, explanation on how it functions in this context, and 2 helpful example sentences in ${targetLanguage || "the target language"} featuring this word with translations in ${translationLanguage || "Russian"}.

Return your answer strictly in JSON format with these exact keys:
- "translation": the translation of the word
- "ipa": the phonetic IPA representation of the word (e.g., [ola])
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "contextRelation": explanation of how the word functions/means in the current sentence context
- "examples": an array of 2 objects, each containing:
  - "text": a simple example sentence in the target language featuring the word
  - "translation": translation of the example sentence`;
    }

    const data = await callUniversalAiProvider(profile, prompt, {
      systemInstruction,
      formatJson: true,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translation: { type: Type.STRING },
          ipa: { type: Type.STRING },
          grammar: { type: Type.STRING },
          contextRelation: { type: Type.STRING },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                translation: { type: Type.STRING }
              },
              required: ["text", "translation"]
            }
          }
        },
        required: ["translation", "ipa", "grammar", "contextRelation", "examples"]
      }
    });

    if (data) {
      data.grammar = sanitizeGrammarTag(data.grammar);
      setCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, cleanQuestion, data);
    }
    return res.json(data);
  } catch (err: any) {
    console.error("AI word explanation error:", err);
    if (err.isQuotaExceeded || err.status === 429) {
      return res.status(429).json({ error: err.message, isQuotaExceeded: true });
    }
    return res.status(err.status || 500).json({ error: err.message || "Failed to analyze word" });
  }
});

router.post("/youtube-fallback-generate", aiRateLimit, async (req, res) => {
  const { title } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  if (!title || !targetLanguage) {
    return res.status(400).json({ error: "Title and targetLanguage are required" });
  }

  const profile = extractAiProfile(req);

  try {
    const prompt = `You are an expert language teacher.
Create a detailed, beautiful and comprehensive educational study text, narrative or transcript fully written in the target language: "${targetLanguage}", inspired by the YouTube video titled: "${title}".
Let the text expand on this topic naturally using standard, common vocabulary of ${targetLanguage} suitable for study.
Structure the text into 4 to 6 clean, engaging paragraphs with a double line break between them.
IMPORTANT: Output ONLY the raw paragraph text in ${targetLanguage}. Do not provide titles, introductory explanations, ending summaries, translation notes, bracketed remarks, or markdown headers. Provide only the article body paragraphs in ${targetLanguage}.`;

    const text = await callUniversalAiProvider(profile, prompt, {
      systemInstruction: "You are an expert language teacher. Provide only clean text for language learning.",
      temperature: 0.7,
    });

    return res.json({ text: typeof text === "string" ? text.trim() : JSON.stringify(text) });
  } catch (err: any) {
    console.error("Fallback AI Lesson Generator failed:", err);
    if (err.isQuotaExceeded || err.status === 429) {
      return res.status(429).json({ error: err.message, isQuotaExceeded: true });
    }
    return res.status(err.status || 500).json({ error: err.message || "Failed to generate fallback study text" });
  }
});

router.post("/generate-story", aiRateLimit, async (req, res) => {
  const { words, level, genre } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
  if (!words || !Array.isArray(words) || words.length === 0 || !targetLanguage) {
    return res.status(400).json({ error: "words array and targetLanguage are required" });
  }

  const profile = extractAiProfile(req);

  try {
    const prompt = `You are a creative writer and language teacher.
Write a short story in ${targetLanguage} suitable for a language learner at difficulty level "${level || "A2-B1"}".
The genre of the story should be "${genre || "general"}".
The story MUST naturally include the following vocabulary words: ${words.join(", ")}.
Structure the story into 3 to 5 short paragraphs with a double line break \\n\\n between them.

Return your answer strictly in JSON format with these exact keys:
- "title": creative title of the story in ${targetLanguage}
- "text": the full story in ${targetLanguage} (paragraphs separated by double newlines \\n\\n)
- "translation": paragraph-by-paragraph translation of the story into ${translationLanguage || "Russian"} (paragraphs separated by double newlines \\n\\n)`;

    const data = await callUniversalAiProvider(profile, prompt, {
      systemInstruction: "You are a creative writer and language teacher. Return strictly valid JSON.",
      formatJson: true,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          text: { type: Type.STRING },
          translation: { type: Type.STRING }
        },
        required: ["title", "text", "translation"]
      }
    });

    return res.json(data);
  } catch (err: any) {
    console.error("AI Story Generator failed:", err);
    if (err.isQuotaExceeded || err.status === 429) {
      return res.status(429).json({ error: err.message, isQuotaExceeded: true });
    }
    return res.status(err.status || 500).json({ error: err.message || "Failed to generate story" });
  }
});

// Helper for robust JSON sanitization and parsing (strips markdown ```json ... ``` code blocks)
function cleanAndParseJson<T = any>(raw: string): T {
  if (!raw) return {} as T;
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  let startIdx = -1;
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    startIdx = firstObj;
  } else if (firstArr !== -1) {
    startIdx = firstArr;
  }
  const lastObj = text.lastIndexOf("}");
  const lastArr = text.lastIndexOf("]");
  const endIdx = Math.max(lastObj, lastArr);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    text = text.substring(startIdx, endIdx + 1);
  }
  return JSON.parse(text);
}

// POST /api/detect-expressions & /api/detect-idioms: Enhanced Smart Expression & Idiom Detector
const handleDetectExpressions = async (req: any, res: any) => {
  const { text, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
  if (!text || !targetLanguage) {
    return res.status(400).json({ error: "Text and targetLanguage are required" });
  }

  const systemPrompt = `You are an expert language teacher and lexicographer for "${targetLanguage}".
Analyze the following text written in "${targetLanguage}".
Identify ALL phrasal verbs, idioms, slang, set expressions, sayings, and proverbs present in the text.

CRITICAL RULE:
- DO NOT include single regular words (such as "quit", "run", "make", "take", "go"). Single words are standard vocabulary items, NOT idioms or phrasal verbs.
- ONLY include genuine multi-word phrasal verbs (e.g., "give up", "figure out"), idioms, slang expressions, and true set expressions.

For each item found:
1. "phrase": the exact phrase as it appears in the text or normalized (all lowercase).
2. "parent": the canonical dictionary base lemma form of the expression (e.g. "kicked the bucket" -> "kick the bucket").
3. "translation_in_context": contextual translation of the meaning in "${translationLanguage || "Russian"}".
4. "literal_translation": word-for-word literal translation to explain internal logic (in "${translationLanguage || "Russian"}").
5. "explanation": helpful usage note in "${translationLanguage || "Russian"}".
6. "type": classification ('phrasal_verb', 'idiom', 'slang', 'saying', or 'set_expression').
7. "register": register style ('Formal', 'Informal', 'Slang', 'Taboo', 'Archaic').
8. "tags": list of tags, e.g. ["Idiom", "Informal"].

Return JSON object:
{
  "detectedPhrasesList": [
    {
      "phrase": "kicked the bucket",
      "parent": "kick the bucket",
      "translation_in_context": "умер / склеил ласты",
      "literal_translation": "пнул ведро",
      "explanation": "Разговорный эвфемизм для смерти",
      "type": "idiom",
      "register": "Informal",
      "tags": ["Idiom", "Informal"]
    }
  ]
}`;

  const profile = extractAiProfile(req);

  try {
    const combinedPrompt = `${systemPrompt}\n\nHere is the text to analyze:\n---\n${text.substring(0, 15000)}\n---`;
    const data = await callUniversalAiProvider(profile, combinedPrompt, {
      systemInstruction: "You are an expert linguistics analyzer specializing in idioms, phrasal verbs, and multi-word expressions. Return strictly valid JSON.",
      formatJson: true,
    });

    const phrasesList = Array.isArray(data)
      ? data
      : (data.detectedPhrasesList || data.detectedPhrases || data.phrases || data.items || data.expressions || []);
    const formattedPhrases: Record<string, any> = {};
    const itemsList: any[] = [];

    for (const item of phrasesList) {
      if (item && (item.phrase || item.parent)) {
        const key = (item.phrase || item.parent).toLowerCase();
        const obj = {
          phrase: item.phrase || key,
          parent: item.parent || key,
          translation_in_context: item.translation_in_context || item.translation || "",
          literal_translation: item.literal_translation || "",
          explanation: item.explanation || "",
          type: item.type || "idiom",
          register: item.register || "Informal",
          tags: item.tags || [item.type || "Idiom", item.register || "Informal"].filter(Boolean)
        };
        formattedPhrases[key] = obj;
        itemsList.push(obj);
      }
    }
    return res.json({ detectedPhrases: formattedPhrases, items: itemsList });
  } catch (err: any) {
    console.error("AI Expression Detector Error:", err.message || err);
    if (err.isQuotaExceeded || err.status === 429) {
      return res.status(429).json({ error: err.message, isQuotaExceeded: true });
    }
    return res.status(err.status || 500).json({ error: `AI Error: ${err.message || "Failed to reach AI"}` });
  }
};

router.post("/detect-expressions", aiRateLimit, handleDetectExpressions);
router.post("/detect-idioms", aiRateLimit, handleDetectExpressions);

// Global Persistent AI Word Properties Cache (ISO Language -> Word -> PropertyObj)
const GLOBAL_WORD_PROPERTIES_CACHE_PATH = path.join(process.cwd(), "data", "global_word_properties_cache.json");
let GLOBAL_WORD_PROPERTIES_CACHE: Record<string, Record<string, any>> = {};

try {
  if (fs.existsSync(GLOBAL_WORD_PROPERTIES_CACHE_PATH)) {
    const rawData = fs.readFileSync(GLOBAL_WORD_PROPERTIES_CACHE_PATH, "utf-8");
    const loaded = JSON.parse(rawData);
    // Clean out any corrupted dummy fallback entries
    for (const lang of Object.keys(loaded)) {
      GLOBAL_WORD_PROPERTIES_CACHE[lang] = {};
      for (const [wordKey, val] of Object.entries(loaded[lang] || {})) {
        if (val && typeof val === "object" && (val as any).pos !== "Noun" || (val as any).cefr !== "A1" || (val as any).frequency !== "Top 3000") {
          GLOBAL_WORD_PROPERTIES_CACHE[lang][wordKey] = val;
        }
      }
    }
    console.log(`[GlobalWordPropertiesCache] Loaded and cleaned cache from ${GLOBAL_WORD_PROPERTIES_CACHE_PATH}`);
  }
} catch (e: any) {
  console.warn(`[GlobalWordPropertiesCache] Could not load cache: ${e.message}`);
}

function saveGlobalWordPropertiesCache() {
  try {
    const dir = path.dirname(GLOBAL_WORD_PROPERTIES_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GLOBAL_WORD_PROPERTIES_CACHE_PATH, JSON.stringify(GLOBAL_WORD_PROPERTIES_CACHE, null, 2), "utf-8");
  } catch (e: any) {
    console.warn(`[GlobalWordPropertiesCache] Could not save cache: ${e.message}`);
  }
}

router.post("/analyze-word-properties", aiRateLimit, async (req, res) => {
  const { text, words, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const langCode = normalizeLangCode(targetLanguage);

  let tokenList: string[] = [];
  if (Array.isArray(words) && words.length > 0) {
    const seen = new Set<string>();
    tokenList = words
      .map((w: any) => String(w).trim())
      .filter((w) => {
        const low = w.toLowerCase();
        if (!w || seen.has(low)) return false;
        seen.add(low);
        return true;
      });
  } else if (text) {
    const cleanText = text.replace(/(?:[bcdjlmnst]|qu)['’]/gi, " ");
    const rawTokens = cleanText.match(/[\p{L}\p{M}]+/gu) || [];
    const seen = new Set<string>();
    tokenList = rawTokens
      .map((t: string) => t.trim())
      .filter((t: string) => {
        const low = t.toLowerCase();
        if (t.length <= 1 || seen.has(low)) return false;
        seen.add(low);
        return true;
      });
  }

  if (tokenList.length === 0) {
    return res.json({ wordProperties: [] });
  }

  // Process all unique words on the open page (up to 300 unique words)
  const pageTokens = tokenList.slice(0, 300);

  if (!GLOBAL_WORD_PROPERTIES_CACHE[langCode]) {
    GLOBAL_WORD_PROPERTIES_CACHE[langCode] = {};
  }
  const langCache = GLOBAL_WORD_PROPERTIES_CACHE[langCode];

  const CORE_POS_MAP: Record<string, { pos: string; cefr: string; frequency: string; ipa_us?: string; ipa_uk?: string }> = {
    // English
    "do": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/duː/", ipa_uk: "/duː/" },
    "does": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/dʌz/", ipa_uk: "/dʌz/" },
    "did": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/dɪd/", ipa_uk: "/dɪd/" },
    "done": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/dʌn/", ipa_uk: "/dʌn/" },
    "doing": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/ˈduː.ɪŋ/", ipa_uk: "/ˈduː.ɪŋ/" },
    "be": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/biː/", ipa_uk: "/biː/" },
    "is": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/ɪz/", ipa_uk: "/ɪz/" },
    "are": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/ɑːr/", ipa_uk: "/ɑː/" },
    "was": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/wʌz/", ipa_uk: "/wɒz/" },
    "were": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/wɜːr/", ipa_uk: "/wɜː/" },
    "have": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/hæv/", ipa_uk: "/hæv/" },
    "has": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/hæz/", ipa_uk: "/hæz/" },
    "had": { pos: "Verb", cefr: "A1", frequency: "Top 1000", ipa_us: "/hæd/", ipa_uk: "/hæd/" },
    "in": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/ɪn/", ipa_uk: "/ɪn/" },
    "on": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/ɑːn/", ipa_uk: "/ɒn/" },
    "at": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/æt/", ipa_uk: "/æt/" },
    "the": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/ðə/", ipa_uk: "/ðə/" },
    "a": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/ə/", ipa_uk: "/ə/" },
    "an": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/ən/", ipa_uk: "/ən/" },
    "this": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/ðɪs/", ipa_uk: "/ðɪs/" },
    "that": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/ðæt/", ipa_uk: "/ðæt/" },
    "to": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/tuː/", ipa_uk: "/tuː/" },
    "for": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/fɔːr/", ipa_uk: "/fɔː/" },
    "of": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/əv/", ipa_uk: "/əv/" },
    "and": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/ænd/", ipa_uk: "/ænd/" },
    "but": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/bʌt/", ipa_uk: "/bʌt/" },

    // Spanish Core Stop Words & Known Forms
    "un": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/un/" },
    "una": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/ˈuna/" },
    "el": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/el/" },
    "él": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/el/" },
    "la": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/la/" },
    "los": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/los/" },
    "las": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/las/" },
    "de": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/de/" },
    "del": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/del/" },
    "por": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/por/" },
    "con": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/kon/" },
    "que": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/ke/" },
    "pero": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/ˈpero/" },
    "en": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/en/" },
    "y": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/i/" },
    "o": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/o/" },
    "al": { pos: "Preposition", cefr: "A1", frequency: "Top 1000", ipa_us: "/al/" },
    "no": { pos: "Adverb", cefr: "A1", frequency: "Top 1000", ipa_us: "/no/" },
    "si": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000", ipa_us: "/si/" },
    "mi": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/mi/" },
    "tu": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/tu/" },
    "sus": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/sus/" },
    "su": { pos: "Determiner", cefr: "A1", frequency: "Top 1000", ipa_us: "/su/" },
    "todas": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/ˈtodas/" },
    "todos": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/ˈtodos/" },
    "yo": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/ɟo/" },
    "se": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000", ipa_us: "/se/" },

    // Kazakh Core Words & Agglutinative Examples
    "мен": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "сен": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "ол": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "біз": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "бұл": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "маған": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "саған": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "оған": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "бізге": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "сізге": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "сіздерге": { pos: "Pronoun", cefr: "A1", frequency: "Top 1000" },
    "және": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000" },
    "бірақ": { pos: "Conjunction", cefr: "A1", frequency: "Top 1000" },
    "үшін": { pos: "Preposition", cefr: "A1", frequency: "Top 1000" },
    "өте": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
    "әдетте": { pos: "Adverb", cefr: "A2", frequency: "Top 3000" },
    "күнде": { pos: "Adverb", cefr: "A2", frequency: "Top 3000" },
    "бүгін": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
    "ерте": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
    "таңертең": { pos: "Adverb", cefr: "A1", frequency: "Top 1000" },
    "досымды": { pos: "Noun", cefr: "A1", frequency: "Top 1000" },
    "кездестірдім": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
    "шештім": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
    "болып": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
    "тұр": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
    "отырып": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
    "жасаған": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
    "беретін": { pos: "Verb", cefr: "A1", frequency: "Top 1000" },
    "байытатын": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
    "саяхаттау": { pos: "Verb", cefr: "A2", frequency: "Top 3000" },
    "таңғажайып": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
    "ғажайып": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
    "керемет": { pos: "Adjective", cefr: "A1", frequency: "Top 1000" },
    "көркем": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
    "мөлдір": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
    "таза": { pos: "Adjective", cefr: "A1", frequency: "Top 1000" },
    "аппақ": { pos: "Adjective", cefr: "A1", frequency: "Top 1000" },
    "қалың": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
    "рухани": { pos: "Adjective", cefr: "B1", frequency: "Top 5000" },
    "ішкі": { pos: "Adjective", cefr: "A2", frequency: "Top 3000" },
    "өркениет": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
    "өркениеттің": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
    "құдірет": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
    "құдіретіне": { pos: "Noun", cefr: "B2", frequency: "Top 5000" },
    "шабыт": { pos: "Noun", cefr: "B1", frequency: "Top 5000" }
  };

  const inferGrammaticalPos = (w: string): string => {
    const low = w.toLowerCase().trim();
    if (CORE_POS_MAP[low]) return CORE_POS_MAP[low].pos;
    if (/(?:маған|саған|оған|бізге|сізге|сіздерге)$/i.test(low)) return "Pronoun";
    if (/(?:aba|aban|ías|ían|aría|arían|aron|erlas|arlo|arse|ió|astis|este|imos|isteis|мын|мін|сың|сің|ды|ді|ады|еді|бару|ішу|тұру|дім|тім|дым|тым|п|ып|іп|ған|ген|қан|кен|атын|етін|йтын|йтін|тау|теу|дау|деу|лау|леу|ру)$/i.test(low)) return "Verb";
    if (/(?:oso|osa|osas|osos|iente|iento|ienta|able|ables|ible|ibles|al|ales|ante|antes|ша|ше|ық|ік|ні|ни|көм|дір|дар|дер|пақ|ппек|жайып|емет)$/i.test(low)) return "Adjective";
    return "Noun";
  };

  const resultsMap: Record<string, any> = {};
  const uncachedTokens: string[] = [];

  // Step 1: Check persistent global cache & CORE_POS_MAP (0 ms, 0 AI cost)
  for (const tok of pageTokens) {
    const lower = tok.toLowerCase().trim();
    if (langCache[lower] && langCache[lower].pos !== "Noun") {
      resultsMap[lower] = { ...langCache[lower], word: tok };
    } else if (CORE_POS_MAP[lower]) {
      const core = CORE_POS_MAP[lower];
      const item = {
        word: tok,
        pos: core.pos,
        cefr: core.cefr,
        frequency: core.frequency,
        ipa_us: core.ipa_us || "",
        ipa_uk: core.ipa_uk || "",
        tags: [core.cefr, core.pos, core.frequency].filter(Boolean)
      };
      langCache[lower] = item;
      resultsMap[lower] = item;
    } else {
      uncachedTokens.push(tok);
    }
  }

  // Step 2: If there are uncached words, fetch from Universal AI in 50-word batches
  if (uncachedTokens.length > 0) {
    const profile = extractAiProfile(req);
    const systemPrompt = `You are a master lexicographer specializing in morphology and CEFR grading for target language "${targetLanguage}".
Analyze each word extracted from a "${targetLanguage}" text.

CRITICAL KAZAKH MORPHOLOGY & POS RULES FOR "${targetLanguage}":
1. PRONOUNS IN DATIVE CASE:
   - Words like "маған", "саған", "оған", "бізге", "сізге", "сіздерге" MUST be classified as PRONOUN, NOT Verb or Noun.

2. COMPOUND & QUALITY ADJECTIVES:
   - Quality & wonder words ("таңғажайып", "ғажайып", "керемет", "көркем", "мөлдір", "таза", "аппақ", "қалың", "рухани", "ішкі") MUST be classified as ADJECTIVE, NOT Verb or Noun.

3. CASE-SUFFIX STRIPPING FOR CEFR & LEMMA:
   - ALWAYS strip possessive/genitive/dative suffixes (-тің/-нің/-тың/-нің, -тіне/-не/-ға/-ге) FIRST to find the core base lemma before assigning CEFR level.

4. VERBS & PARTICIPLES:
   - Words ending in verbal, participle, or infinitive suffixes (-ған/-ген, -қан/-кен, -атын/-етін, -йтын/-йтін, -у, -тау/-теу/-дау/-деу) MUST be classified as VERB (unless they are dative pronouns like "маған", "саған", "оған").

FIELDS TO RETURN FOR EACH WORD:
1. "word": exact input word form.
2. "lemma": base dictionary lemma (e.g. "өркениет", "дос", "жасау", "көркем").
3. "pos": Part of Speech ('Verb', 'Noun', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Determiner', 'Interjection').
4. "cefr": CEFR level evaluated at the BASE LEMMA level ('A1', 'A2', 'B1', 'B2', 'C1', 'C2').
5. "frequency": Frequency Tier evaluated at the BASE LEMMA level ('Top 1000', 'Top 3000', 'Top 5000', 'Rare').
6. "ipa_us": Phonetic IPA transcription string.

Return JSON object with key "wordProperties":
{
  "wordProperties": [
    {
      "word": "маған",
      "lemma": "мен",
      "pos": "Pronoun",
      "cefr": "A1",
      "frequency": "Top 1000",
      "ipa_us": "/maɣan/"
    }
  ]
}`;

    const BATCH_SIZE = 50;
    let hasNewCacheItems = false;
    for (let i = 0; i < uncachedTokens.length; i += BATCH_SIZE) {
      const chunk = uncachedTokens.slice(i, i + BATCH_SIZE);
      try {
        const combinedPrompt = `${systemPrompt}\n\nWords to analyze:\n${JSON.stringify(chunk)}`;
        const data = await callUniversalAiProvider(profile, combinedPrompt, {
          systemInstruction: "You are a master lexicographer. Return strictly valid JSON.",
          formatJson: true,
        });

        let rawList: any[] = [];
        if (Array.isArray(data)) {
          rawList = data;
        } else if (data.wordProperties || data.items || data.words || data.properties || data.word_properties || data.results || data.data) {
          rawList = data.wordProperties || data.items || data.words || data.properties || data.word_properties || data.results || data.data;
        } else if (typeof data === "object" && data !== null) {
          rawList = Object.entries(data).map(([key, val]: [string, any]) => {
            if (typeof val === "object" && val !== null) {
              return { word: val.word || key, ...val };
            }
            return { word: key, pos: String(val) };
          });
        }

        rawList.forEach((item: any) => {
          const rawWord = item.word || item.token || item.lemma || "";
          const lower = rawWord.toLowerCase().trim();
          if (!lower) return;

          const pos = item.pos || item.partOfSpeech || item.part_of_speech || item.type || inferGrammaticalPos(rawWord);
          const cefr = item.cefr || item.level || item.cefr_level || item.cefrLevel || "A1";
          const frequency = item.frequency || item.frequency_tier || item.freq || item.frequencyTier || "Top 1000";

          const propObj = {
            word: rawWord,
            pos,
            cefr,
            frequency,
            ipa_us: item.ipa_us || item.ipa || "",
            ipa_uk: item.ipa_uk || item.ipa || "",
            tags: item.tags || [cefr, pos, frequency].filter(Boolean)
          };

          langCache[lower] = propObj;
          resultsMap[lower] = propObj;
          hasNewCacheItems = true;
        });
      } catch (err: any) {
        console.error("Batch AI Word Property error:", err);
      }
    }
    if (hasNewCacheItems) {
      saveGlobalWordPropertiesCache();
    }

    // Temporary failsafe for any tokens AI didn't return (DO NOT SAVE FAILSAFE TO DISK)
    for (const tok of uncachedTokens) {
      const lower = tok.toLowerCase().trim();
      if (!resultsMap[lower]) {
        const pos = inferGrammaticalPos(tok);
        resultsMap[lower] = {
          word: tok,
          pos,
          cefr: "A1",
          frequency: "Top 1000",
          ipa_us: "",
          ipa_uk: "",
          tags: ["A1", pos, "Top 1000"]
        };
      }
    }
  }

  const finalPropertiesList = pageTokens.map((tok) => {
    const lower = tok.toLowerCase().trim();
    return resultsMap[lower] || {
      word: tok,
      pos: inferGrammaticalPos(tok),
      cefr: "A1",
      frequency: "Top 1000",
      ipa_us: "",
      ipa_uk: "",
      tags: ["A1", "Top 1000"]
    };
  });

  return res.json({ wordProperties: finalPropertiesList });
});

// POST /api/analyze-word-family: Polysemy-aware Contextual Word Family Generator
router.post("/analyze-word-family", aiRateLimit, async (req, res) => {
  const { word, sentence, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const systemPrompt = `You are an expert etymologist and lexicographer for "${targetLanguage}".
Given the target word "${word}" used in the context sentence: "${sentence || word}", analyze its specific contextual meaning.
CRITICAL POLYSEMY RULE: Return ONLY true morphological cognates and word family members (nouns, verbs, adjectives, adverbs) derived from that EXACT contextual root meaning in "${targetLanguage}".
Strictly IGNORE homonyms that have a different etymology or meaning.
For example:
- If target word is "lead" in sentence "He will lead the team" (meaning to guide): return "leader", "leadership", "leading". DO NOT return "leaded" or "unleaded" (which come from the metal lead).
- If target word is "lead" in sentence "The pipe is made of lead" (meaning the metal): return "leaded", "unleaded". DO NOT return "leader" or "leadership".

For each family member:
1. "word": the cognate word form.
2. "pos": Part of Speech ('Noun', 'Verb', 'Adjective', 'Adverb').
3. "translation": concise translation into "${translationLanguage || "Russian"}".

Return JSON object:
{
  "word": "${word}",
  "contextMeaning": "brief explanation of the contextual meaning",
  "family": [
    { "word": "leader", "pos": "Noun", "translation": "руководитель / лидер" },
    { "word": "leadership", "pos": "Noun", "translation": "руководство / лидерство" },
    { "word": "leading", "pos": "Adjective", "translation": "ведущий" }
  ]
}`;

  const profile = extractAiProfile(req);

  try {
    const combinedPrompt = `${systemPrompt}\n\nTarget Word: "${word}"\nSentence: "${sentence || word}"`;
    const data = await callUniversalAiProvider(profile, combinedPrompt, {
      systemInstruction: "You are an expert morphological analyzer. Return strictly valid JSON.",
      formatJson: true,
    });

    return res.json({
      word,
      contextMeaning: data?.contextMeaning || "",
      family: data?.family || []
    });
  } catch (err: any) {
    console.error("AI Word Family Generator failed:", err);
    if (err.isQuotaExceeded || err.status === 429) {
      return res.status(429).json({ error: err.message, isQuotaExceeded: true });
    }
    return res.status(err.status || 500).json({ error: err.message || "Failed to generate word family" });
  }
});

function getMockPhrases(text: string, targetLanguage: string): Record<string, any> {
  const mockPhrases: Record<string, any> = {};
  const textLower = text.toLowerCase();
  
  const addMock = (key: string, trans: string, expl: string, typeStr: string = "phrasal_verb") => {
    mockPhrases[key] = {
      phrase: key,
      parent: key,
      translation_in_context: trans,
      translation: trans,
      literal_translation: "",
      explanation: expl,
      type: typeStr,
      register: "Informal",
      tags: [typeStr.replace("_", " "), "Informal"]
    };
  };

  if (targetLanguage.toLowerCase().includes("span")) {
    if (textLower.includes("dar a conocer") || textLower.includes("dó a conocer") || textLower.includes("dio a conocer")) {
      addMock("dar a conocer", "обнародовать, сделать известным", "Идиома, означающая раскрытие информации или представление чего-то публике.", "idiom");
    }
    if (textLower.includes("darse cuenta") || textLower.includes("dio cuenta") || textLower.includes("doy cuenta")) {
      addMock("darse cuenta", "осознать, понять", "Выражение, означающее внезапное осознание или понимание факта.", "set_expression");
    }
    if (textLower.includes("tener en cuenta") || textLower.includes("tenga en cuenta") || textLower.includes("tiene en cuenta")) {
      addMock("tener en cuenta", "принимать во внимание, учитывать", "Устойчивое выражение, означающее учет чего-либо при принятии решения.", "set_expression");
    }
  }
  
  if (targetLanguage.toLowerCase().includes("engl") || targetLanguage.toLowerCase().includes("eng")) {
    if (textLower.includes("act out") || textLower.includes("acted out") || textLower.includes("acting out") || textLower.includes("act them out")) {
      addMock("act out", "разыгрывать, изображать в ролях", "Phrasal verb meaning to perform a scene or express emotions through actions.", "phrasal_verb");
    }
    if (textLower.includes("walk by") || textLower.includes("walked by") || textLower.includes("walking by")) {
      addMock("walk by", "проходить мимо", "Phrasal verb meaning to pass someone or something on foot.", "phrasal_verb");
    }
    if (textLower.includes("do over") || textLower.includes("did over") || textLower.includes("doing over") || textLower.includes("done over")) {
      addMock("do over", "переделывать, выполнять заново", "Phrasal verb meaning to do something again from the beginning.", "phrasal_verb");
    }
    if (textLower.includes("sit down") || textLower.includes("sat down") || textLower.includes("sitting down")) {
      addMock("sit down", "садиться", "Phrasal verb meaning to move from standing to a seated position.", "phrasal_verb");
    }
    if (textLower.includes("stand up") || textLower.includes("stood up") || textLower.includes("standing up")) {
      addMock("stand up", "вставать", "Phrasal verb meaning to rise to one's feet from a seated or lying position.", "phrasal_verb");
    }
    if (textLower.includes("fall down") || textLower.includes("fell down") || textLower.includes("falling down")) {
      addMock("fall down", "падать, опускаться", "Phrasal verb meaning to collapse or drop to the ground.", "phrasal_verb");
    }
    if (textLower.includes("climb up") || textLower.includes("climbed up") || textLower.includes("climbing up")) {
      addMock("climb up", "взбираться наверх", "Phrasal verb meaning to ascend something using hands and feet.", "phrasal_verb");
    }
    if (textLower.includes("pick up") || textLower.includes("picked up") || textLower.includes("picking up")) {
      addMock("pick up", "поднимать, подбирать, забирать", "Phrasal verb meaning to lift something or collect someone.", "phrasal_verb");
    }
    if (textLower.includes("find out") || textLower.includes("found out") || textLower.includes("finding out")) {
      addMock("find out", "выяснять, узнавать", "Phrasal verb meaning to discover a fact or information.", "phrasal_verb");
    }
    if (textLower.includes("take off") || textLower.includes("took off") || textLower.includes("taking off")) {
      addMock("take off", "взлетать, снимать (одежду)", "Phrasal verb meaning to leave the ground (plane) or remove clothing.", "phrasal_verb");
    }
    if (textLower.includes("look forward to") || textLower.includes("looking forward to") || textLower.includes("looked forward to")) {
      addMock("look forward to", "ожидать с нетерпением", "Phrasal verb meaning to feel excited about something that is going to happen.", "phrasal_verb");
    }
    if (textLower.includes("set up") || textLower.includes("setting up")) {
      addMock("set up", "устанавливать, организовывать", "Phrasal verb meaning to establish or arrange something.", "phrasal_verb");
    }
    if (textLower.includes("take up") || textLower.includes("took up") || textLower.includes("taking up")) {
      addMock("take up", "начать заниматься чем-то (хобби, спорт)", "Phrasal verb meaning to start a new activity, hobby, or interest.", "phrasal_verb");
    }
    if (textLower.includes("give up") || textLower.includes("gave up") || textLower.includes("giving up")) {
      addMock("give up", "сдаваться, бросать", "Phrasal verb meaning to stop doing something or stop trying.", "phrasal_verb");
    }
    if (textLower.includes("keep going") || textLower.includes("kept going") || textLower.includes("keeps going")) {
      addMock("keep going", "продолжать идти/делать", "Phrasal verb meaning to continue progress or not stop.", "phrasal_verb");
    }
    if (textLower.includes("run into") || textLower.includes("ran into") || textLower.includes("running into")) {
      addMock("run into", "случайно встретить, натолкнуться", "Phrasal verb meaning to meet someone or encounter a problem unexpectedly.", "phrasal_verb");
    }
    if (textLower.includes("work out") || textLower.includes("worked out") || textLower.includes("working out")) {
      addMock("work out", "получаться, улаживаться; тренироваться", "Phrasal verb meaning to develop, resolve or progress in a specified way.", "phrasal_verb");
    }
    if (textLower.includes("figure out") || textLower.includes("figured out") || textLower.includes("figuring out")) {
      addMock("figure out", "выяснить, понять, разобраться", "Phrasal verb meaning to understand or solve something after thinking about it.", "phrasal_verb");
    }
    if (textLower.includes("look up") || textLower.includes("looked up") || textLower.includes("looking up") || textLower.includes("look it up")) {
      addMock("look up", "искать (информацию в книге/интернете)", "Phrasal verb meaning to search for information in a reference source like a dictionary or online.", "phrasal_verb");
    }
    if (textLower.includes("come together") || textLower.includes("came together") || textLower.includes("coming together")) {
      addMock("come together", "успешно соединиться, сложиться", "Phrasal verb meaning to finalize or assemble successfully.", "phrasal_verb");
    }
    if (textLower.includes("get up") || textLower.includes("got up") || textLower.includes("getting up")) {
      addMock("get up", "вставать с постели", "Phrasal verb meaning to rise from bed after sleeping.", "phrasal_verb");
    }
    if (textLower.includes("put on") || textLower.includes("putting on")) {
      addMock("put on", "надевать (одежду/обувь)", "Phrasal verb meaning to place clothing onto one's body.", "phrasal_verb");
    }
    if (textLower.includes("turn on") || textLower.includes("turned on") || textLower.includes("turning on")) {
      addMock("turn on", "включать (прибор/свет)", "Phrasal verb meaning to start a device or light.", "phrasal_verb");
    }
    if (textLower.includes("turn off") || textLower.includes("turned off") || textLower.includes("turning off")) {
      addMock("turn off", "выключать (прибор/свет)", "Phrasal verb meaning to stop a device or light.", "phrasal_verb");
    }
    if (textLower.includes("go on") || textLower.includes("went on") || textLower.includes("going on")) {
      addMock("go on", "продолжать; происходить", "Phrasal verb meaning to continue or happen.", "phrasal_verb");
    }
    if (textLower.includes("come back") || textLower.includes("came back") || textLower.includes("coming back")) {
      addMock("come back", "возвращаться", "Phrasal verb meaning to return to a place.", "phrasal_verb");
    }
    if (textLower.includes("wake up") || textLower.includes("woke up") || textLower.includes("waking up")) {
      addMock("wake up", "просыпаться", "Phrasal verb meaning to stop sleeping.", "phrasal_verb");
    }
    if (textLower.includes("hit the nail on the head")) {
      addMock("hit the nail on the head", "попасть прямо в точку, угадать", "Idiom meaning to describe exactly what is causing a situation or problem.", "idiom");
    }
    if (textLower.includes("miss the boat") || textLower.includes("missed the boat")) {
      addMock("miss the boat", "упустить возможность / шанс", "Idiom meaning to fail to use an opportunity by being too slow.", "idiom");
    }
    if (textLower.includes("beat around the bush") || textLower.includes("beating around the bush")) {
      addMock("beat around the bush", "ходить вокруг да около", "Idiom meaning to avoid talking about what is important.", "idiom");
    }
    if (textLower.includes("rocket science") || textLower.includes("not rocket science")) {
      addMock("rocket science", "не высшая математика (проще простого)", "Idiom used to emphasize that something is not difficult to understand.", "idiom");
    }
    if (textLower.includes("come up with") || textLower.includes("came up with") || textLower.includes("coming up with")) {
      addMock("come up with", "придумывать, выдать идею", "Phrasal verb meaning to produce an idea or thought.", "phrasal_verb");
    }
    if (textLower.includes("back down") || textLower.includes("backed down") || textLower.includes("backing down")) {
      addMock("back down", "отступать, идти на попятный", "Phrasal verb meaning to withdraw a claim or assertion.", "phrasal_verb");
    }
    if (textLower.includes("kick back") || textLower.includes("kicked back")) {
      addMock("kick back", "расслабиться, отдохнуть", "Phrasal verb meaning to relax and take it easy.", "phrasal_verb");
    }
    if (textLower.includes("chill out") || textLower.includes("chilled out")) {
      addMock("chill out", "отдыхать, расслабляться", "Phrasal verb meaning to calm down and relax.", "phrasal_verb");
    }
    if (textLower.includes("get over") || textLower.includes("got over") || textLower.includes("getting over")) {
      addMock("get over", "преодолеть, справиться", "Phrasal verb meaning to recover from an illness or difficulty.", "phrasal_verb");
    }
    if (textLower.includes("actions speak louder than words")) {
      addMock("actions speak louder than words", "поступки громче слов", "A proverb meaning what you do is more important than what you say.", "saying");
    }
    if (textLower.includes("under the weather")) {
      addMock("under the weather", "недомогать, неважно себя чувствовать", "Idiom meaning slightly unwell or in low spirits.", "idiom");
    }
    if (textLower.includes("spill the beans")) {
      addMock("spill the beans", "выдать секрет, проговориться", "Idiom meaning to reveal secret information unintentionally or prematurely.", "idiom");
    }
    if (textLower.includes("eye to eye") || textLower.includes("see eye to eye")) {
      addMock("see eye to eye", "сходиться во взглядах, полностью соглашаться", "Idiom meaning to agree fully with someone on something.", "idiom");
    }
    if (textLower.includes("piece of cake")) {
      addMock("piece of cake", "проще простого, пара пустяков", "Idiom meaning something very easy to do.", "idiom");
    }
    if (textLower.includes("break a leg")) {
      addMock("break a leg", "ни пуха ни пера, удачи!", "Idiom used to wish performance good luck.", "idiom");
    }
    if (textLower.includes("bite the bullet")) {
      addMock("bite the bullet", "стиснуть зубы, принять трудное решение", "Idiom meaning to face a painful situation bravely.", "idiom");
    }
    if (textLower.includes("call it a day")) {
      addMock("call it a day", "закончить работу, закруглиться", "Idiom meaning to stop working on something for the day.", "idiom");
    }
    if (textLower.includes("cut corners")) {
      addMock("cut corners", "экономить в ущерб качеству", "Idiom meaning to do something perfunctorily to save time or money.", "idiom");
    }
    if (textLower.includes("hit the sack") || textLower.includes("hit the hay")) {
      addMock("hit the sack", "лечь спать", "Idiom meaning to go to bed.", "idiom");
    }
    if (textLower.includes("once in a blue moon")) {
      addMock("once in a blue moon", "крайне редко, раз в сто лет", "Idiom meaning very rarely.", "idiom");
    }
    if (textLower.includes("pull someone's leg") || textLower.includes("pulling my leg") || textLower.includes("pulling your leg")) {
      addMock("pull someone's leg", "морочить голову, разыгрывать", "Idiom meaning to tease or trick someone playfully.", "idiom");
    }
    if (textLower.includes("over the moon")) {
      addMock("over the moon", "на седьмом небе от счастья", "Idiom meaning extremely happy and excited.", "idiom");
    }
    if (textLower.includes("rome wasn't built in a day")) {
      addMock("rome wasn't built in a day", "Рим не за один день строился", "A famous saying/idiom meaning that important work takes time to complete and should not be rushed.", "saying");
    }
    if (textLower.includes("to be honest")) {
      addMock("to be honest", "если честно, честно говоря", "A common conversational phrase used to state one's true opinion or feeling.", "set_expression");
    }
  }
 
  return mockPhrases;
}

// ISO Language Code Normalizer for Cache Partitioning
function normalizeLangCode(rawLang: string): string {
  if (!rawLang) return "en";
  const l = rawLang.trim().toLowerCase();
  if (l.startsWith("kk") || l.startsWith("kaz") || l.includes("казах") || l.includes("қазақ")) return "kk";
  if (l.startsWith("en") || l.includes("english") || l.includes("англи")) return "en";
  if (l.startsWith("es") || l.includes("spanish") || l.includes("испан")) return "es";
  if (l.startsWith("de") || l.includes("german") || l.includes("немец")) return "de";
  if (l.startsWith("fr") || l.includes("french") || l.includes("франц")) return "fr";
  if (l.startsWith("ja") || l.includes("japan") || l.includes("япон")) return "ja";
  if (l.startsWith("zh") || l.includes("chinese") || l.includes("китай")) return "zh";
  if (l.startsWith("ru") || l.includes("russian") || l.includes("русск")) return "ru";
  if (l.startsWith("it") || l.includes("italian") || l.includes("италь")) return "it";
  if (l.startsWith("pt") || l.includes("portug") || l.includes("португ")) return "pt";
  if (l.startsWith("tr") || l.includes("turkish") || l.includes("турец")) return "tr";
  if (l.startsWith("hu") || l.includes("hungar") || l.includes("венгер")) return "hu";
  return l.substring(0, 2);
}

// Global Persistent AI Lemma Cache (ISO Language -> Word -> Lemma)
const GLOBAL_LEMMAS_CACHE_PATH = path.join(process.cwd(), "data", "global_lemmas_cache.json");
let GLOBAL_LEMMAS_CACHE: Record<string, Record<string, string>> = {};

try {
  if (fs.existsSync(GLOBAL_LEMMAS_CACHE_PATH)) {
    const rawData = fs.readFileSync(GLOBAL_LEMMAS_CACHE_PATH, "utf-8");
    GLOBAL_LEMMAS_CACHE = JSON.parse(rawData);
    console.log(`[GlobalLemmasCache] Loaded global AI lemmas cache from ${GLOBAL_LEMMAS_CACHE_PATH}`);
  }
} catch (e: any) {
  console.warn(`[GlobalLemmasCache] Could not load global lemmas cache: ${e.message}`);
}

function saveGlobalLemmasCache() {
  try {
    const dir = path.dirname(GLOBAL_LEMMAS_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GLOBAL_LEMMAS_CACHE_PATH, JSON.stringify(GLOBAL_LEMMAS_CACHE, null, 2), "utf-8");
  } catch (e: any) {
    console.warn(`[GlobalLemmasCache] Could not save global lemmas cache: ${e.message}`);
  }
}

// POST /api/lemmatize-text: AI-powered pre-parsing and lemmatization of text tokens with Global Cache
router.post("/lemmatize-text", aiRateLimit, async (req, res) => {
  const { text, words, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "Kazakh");
  const langCode = normalizeLangCode(targetLanguage);

  if (!text && (!words || !Array.isArray(words) || words.length === 0)) {
    return res.status(400).json({ error: "Text or words array is required" });
  }

  // Extract unique tokens
  let tokenList: string[] = [];
  if (Array.isArray(words) && words.length > 0) {
    tokenList = Array.from(new Set(words.map((w: any) => String(w).trim()).filter(Boolean)));
  } else if (text) {
    const rawTokens = text.match(/[\p{L}\p{M}'’]+/gu) || [];
    tokenList = Array.from(new Set(rawTokens.map((t: string) => t.trim()).filter((t: string) => t.length > 1)));
  }

  if (tokenList.length === 0) {
    return res.json({ lemmas: {} });
  }

  // Step 1: Check Global Lemma Cache under exact ISO 2-letter language code key (e.g. GLOBAL_LEMMAS_CACHE["es"])
  GLOBAL_LEMMAS_CACHE[langCode] = GLOBAL_LEMMAS_CACHE[langCode] || {};
  const cachedLemmas: Record<string, string> = {};
  const missingTokens: string[] = [];

  for (const tok of tokenList) {
    const lowerTok = tok.toLowerCase();
    const cachedVal = GLOBAL_LEMMAS_CACHE[langCode][tok] || GLOBAL_LEMMAS_CACHE[langCode][lowerTok];
    // ONLY accept cached lemmas if they map to a different base root lemma
    if (cachedVal && cachedVal.toLowerCase() !== lowerTok) {
      cachedLemmas[tok] = cachedVal;
    } else {
      missingTokens.push(tok);
    }
  }

  // If 100% of missing tokens are already resolved in cache for this language
  if (missingTokens.length === 0) {
    console.log(`[POST /api/lemmatize-text] 100% fulfilled from Global Cache [${langCode}]! (${Object.keys(cachedLemmas).length} words, 0 AI calls)`);
    return res.json({ lemmas: cachedLemmas, cachedCount: Object.keys(cachedLemmas).length, aiCount: 0 });
  }

  // Limit missing tokens chunk size to max 150 for AI batch
  const batchTokens = missingTokens.slice(0, 150);

  const systemPrompt = `You are an expert lexicographer and lemmatizer for target language: "${targetLanguage}".
Given a list of inflected words or tokens from a text, provide the exact canonical dictionary base lemma for each word in "${targetLanguage}".

STRICT LEMMATIZATION RULES:
- FOR ALL VERBS: You MUST return the standard dictionary INFINITIVE form of the verb.
  Examples for Russian verbs:
    "работало" -> "работать", "работал" -> "работать", "работаем" -> "работать", "работали" -> "работать", "работают" -> "работать", "работала" -> "работать"
    "говорил" -> "говорить", "были" -> "быть", "сказал" -> "сказать", "пошел" -> "пойти"
  Examples for Kazakh verbs:
    "әкелді" -> "әкелу", "жатыр" -> "жату", "барамыз" -> "бару"
  Examples for English verbs:
    "running" -> "run", "went" -> "go", "worked" -> "work"
  Examples for Spanish verbs:
    "hablando" -> "hablar", "fue" -> "ir", "casaron" -> "casar"

- FOR NOUNS & ADJECTIVES: You MUST return the standard singular nominative (initial dictionary) form.
  Examples for Russian: "красивыми" -> "красивый", "домами" -> "дом", "деревьях" -> "дерево"
  Examples for Kazakh: "Қазақстанда" -> "Қазақстан", "баламыз" -> "бала", "үйлер" -> "үй"

- FOR PRONOUNS & IRREGULARS: You MUST return the nominative base root.
  Examples for Russian: "меня" -> "я", "мне" -> "я", "его" -> "он"
  Examples for Kazakh: "менің" -> "мен", "оның" -> "ол"

- If a word is already in base form or is a proper name, keep it as is.
Return a JSON object with a "lemmas" property containing a dictionary mapping each input word to its canonical dictionary base lemma.`;

  let newLemmas: Record<string, string> = {};
  const profile = extractAiProfile(req);

  try {
    const combinedPrompt = `${systemPrompt}\n\nWords to lemmatize:\n${JSON.stringify(batchTokens)}`;
    const data = await callUniversalAiProvider(profile, combinedPrompt, {
      systemInstruction: "You are an expert lexicographer and lemmatizer. Return strictly valid JSON with a 'lemmas' dictionary mapping each word to its dictionary base lemma.",
      formatJson: true,
    });
    newLemmas = data?.lemmas || (typeof data === "object" && !Array.isArray(data) ? data : {}) || {};
  } catch (err: any) {
    console.error("AI Lemmatizer failed:", err);
  }

  // Update Global Cache under exact ISO 2-letter language code key (e.g. GLOBAL_LEMMAS_CACHE["es"])
  if (Object.keys(newLemmas).length > 0) {
    Object.entries(newLemmas).forEach(([tok, lem]) => {
      if (tok && lem && tok.toLowerCase() !== lem.toLowerCase()) {
        GLOBAL_LEMMAS_CACHE[langCode][tok] = lem;
        GLOBAL_LEMMAS_CACHE[langCode][tok.toLowerCase()] = lem;
      }
    });
    saveGlobalLemmasCache();
  }

  const combinedLemmas = { ...cachedLemmas, ...newLemmas };
  return res.json({
    lemmas: combinedLemmas,
    cachedCount: Object.keys(cachedLemmas).length,
    aiCount: Object.keys(newLemmas).length
  });
});

export default router;
