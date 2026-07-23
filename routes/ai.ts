import { Router } from "express";
import { Type } from "@google/genai";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import path from "path";
import Database from "better-sqlite3";
import { getGeminiClient, callLocalAi } from "./geminiClient.ts";

const router = Router();

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
  const { word, context, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
  const customQuestion = typeof req.body.customQuestion === "string"
    ? req.body.customQuestion.substring(0, 500)
    : undefined;

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");

  // 1. Проверяем наличие ответа в SQLite кэше
  const cachedData = getCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, customQuestion);
  if (cachedData) {
    return res.json(cachedData);
  }

  if (aiProvider === "local") {
    try {
      let prompt = "";
      if (customQuestion) {
        prompt = `The user highlighted the text: "${word}"
Surrounding context: "${context || word}"
Target language of the text: ${targetLanguage || "auto-detect"}
User's native/translation language: ${translationLanguage || "Russian"}

The user has a custom question/request about this highlighted text:
"${customQuestion}"

Please answer the user's question clearly and helpful in ${translationLanguage || "Russian"}.

Return your answer strictly in JSON format with these exact keys:
- "translation": A concise summary translation or direct answer (1-2 sentences) in ${translationLanguage || "Russian"}
- "contextRelation": The detailed explanation answering the user's question, including grammatical analysis, context details, or idiom break down as requested in ${translationLanguage || "Russian"}
- "ipa": Pronunciation IPA representation of the highlighted text (optional, leave empty if not applicable)
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "examples": an array of up to 2 objects, each containing:
  - "text": a simple example sentence in the target language featuring the highlighted text or related concept
  - "translation": translation of the example sentence in ${translationLanguage || "Russian"}

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
      } else {
        prompt = `Translate the word "${cleanWord}" (which is inside the surrounding context: "${context || cleanWord}") from ${targetLanguage || "auto-detect"} to ${translationLanguage || "Russian"}.
Provide the exact IPA pronunciation of the word "${cleanWord}", its grammar/part of speech details, explanation on how it functions in this context, and 2 helpful example sentences in ${targetLanguage || "the target language"} featuring this word with translations in ${translationLanguage || "Russian"}.

Return your answer strictly in JSON format with these exact keys:
- "translation": the translation of the word
- "ipa": the phonetic IPA representation of the word (e.g., [ola])
- "grammar": Grammatical class or part of speech in English (e.g. "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Idiom", "Phrasal Verb", "Set Expression"). Must be strictly in English, maximum 1-2 words, with NO description or explanation, and NEVER in Russian.
- "contextRelation": explanation of how the word functions/means in the current sentence context
- "examples": an array of 2 objects, each containing:
  - "text": a simple example sentence in the target language featuring the word
  - "translation": translation of the example sentence

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
      }
      const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
      if (data) {
        data.grammar = sanitizeGrammarTag(data.grammar);
        setCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, customQuestion, data);
      }
      return res.json(data);
    } catch (localErr: any) {
      console.error("Local AI word explanation failed:", localErr);
      return res.status(500).json({ error: localErr.message || "Failed to analyze word with local AI" });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({
      translation: customQuestion ? `[Ответ на вопрос: ${customQuestion}]` : `[Demo Translation]`,
      ipa: `/.../`,
      grammar: "Word",
      contextRelation: customQuestion
        ? `Вы задали вопрос: "${customQuestion}". Это демонстрационный режим. Пожалуйста, укажите GEMINI_API_KEY в настройках, чтобы получить настоящий ответ от ИИ!`
        : "You are running in demo mode. Please set your GEMINI_API_KEY under Settings > Secrets to unlock context-aware translation!",
      examples: [
        {
          text: `This is a demo sentence in ${targetLanguage || "Target Language"} featuring ${cleanWord}.`,
          translation: `Это демонстрационное предложение на вашем языке с использованием слова ${cleanWord}.`
        }
      ],
      isDemo: true
    });
  }

  try {
    let prompt = "";
    if (customQuestion) {
      prompt = `The user highlighted the text: "${word}"
Surrounding context: "${context || word}"
Target language of the text: ${targetLanguage || "auto-detect"}
User's native/translation language: ${translationLanguage || "Russian"}

The user has a custom question/request about this highlighted text:
"${customQuestion}"

Please answer the user's question clearly and helpful in ${translationLanguage || "Russian"}.
Note for grammar: The grammar classification must be strictly in English, maximum 1-2 words (e.g., "Noun", "Verb", "Adjective", "Adverb", "Interjection", "Idiom", "Phrasal Verb"), and should NOT contain explanations or Russian text.`;
    } else {
      prompt = `Translate the word "${cleanWord}" (which is inside the surrounding context: "${context || cleanWord}") from ${targetLanguage || "auto-detect"} to ${translationLanguage || "English"}.
Provide the exact IPA pronunciation of the word "${cleanWord}", its grammar/part of speech details, explanation on how it functions in this context, and 2 helpful example sentences in ${targetLanguage || "the target language"} featuring this word with translations in ${translationLanguage || "English"}.
Note for grammar: The grammar classification must be strictly in English, maximum 1-2 words (e.g., "Noun", "Verb", "Adjective", "Adverb", "Interjection", "Idiom", "Phrasal Verb"), and should NOT contain explanations or Russian text.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING, description: customQuestion ? "A concise summary translation or direct answer (1-2 sentences)" : "Translation of the word" },
            ipa: { type: Type.STRING, description: "Phonetic IPA representation of the word (e.g., [ola])" },
            grammar: { type: Type.STRING, description: "Grammatical class or part of speech in English (e.g., 'Noun', 'Verb', 'Adjective', 'Adverb', 'Interjection', 'Idiom', 'Phrasal Verb'). Must be strictly in English, 1-2 words only, no description, and NEVER in Russian." },
            contextRelation: { type: Type.STRING, description: customQuestion ? "The detailed explanation answering the user's question" : "Explanation of how the word functions/means in the current sentence context" },
            examples: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING, description: "Simple example sentence in the target language using this word" },
                  translation: { type: Type.STRING, description: "Translation of the example sentence" }
                },
                required: ["text", "translation"]
              }
            }
          },
          required: ["translation", "ipa", "grammar", "contextRelation", "examples"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    if (data) {
      data.grammar = sanitizeGrammarTag(data.grammar);
      setCachedExplain(cleanWord, context || "", targetLanguage, translationLanguage, customQuestion, data);
    }
    return res.json(data);
  } catch (err: any) {
    console.error("Gemini context translation error:", err);
    return res.status(500).json({ error: err.message || "Failed to analyze word" });
  }
});

router.post("/youtube-fallback-generate", aiRateLimit, async (req, res) => {
  const { title, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  if (!title || !targetLanguage) {
    return res.status(400).json({ error: "Title and targetLanguage are required" });
  }

  if (aiProvider === "local") {
    try {
      const prompt = `You are an expert language teacher.
Create a detailed, beautiful and comprehensive educational study text, narrative or transcript fully written in the target language: "${targetLanguage}", inspired by the YouTube video titled: "${title}".
Let the text expand on this topic naturally using standard, common vocabulary of ${targetLanguage} suitable for study.
Structure the text into 4 to 6 clean, engaging paragraphs with a double line break between them.

Return your answer strictly as a JSON object with this exact key:
- "text": the raw educational study text body in target language, with paragraphs separated by double line breaks (\\n\\n). Do not include any titles, introductory explanations, endings, or markdown headers.

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
      const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
      return res.json({ text: (data.text || "").trim() });
    } catch (localErr: any) {
      console.error("Local AI youtube fallback generation failed:", localErr);
      return res.status(500).json({ error: localErr.message || "Failed to generate study text with local AI" });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({
      text: `[Fallback Demo Content]\n\nThis is a sample study text generated in offline mode for: "${title}".\n\nTo unleash our powerful AI lesson generation, please configure your GEMINI_API_KEY inside AI Studio settings.`
    });
  }

  try {
    const prompt = `You are an expert language teacher.
Create a detailed, beautiful and comprehensive educational study text, narrative or transcript fully written in the target language: "${targetLanguage}", inspired by the YouTube video titled: "${title}".
Let the text expand on this topic naturally using standard, common vocabulary of ${targetLanguage} suitable for study.
Structure the text into 4 to 6 clean, engaging paragraphs with a double line break between them.
IMPORTANT: Output ONLY the raw paragraph text in ${targetLanguage}. Do not provide titles, introductory explanations, ending summaries, translation notes, bracketed remarks, or markdown headers. Provide only the article body paragraphs in ${targetLanguage}.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    return res.json({ text: text.trim() });
  } catch (err: any) {
    console.error("Fallback AI Lesson Generator failed:", err);
    return res.status(500).json({ error: err.message || "Failed to generate fallback study text" });
  }
});

router.post("/generate-story", aiRateLimit, async (req, res) => {
  const { words, level, genre, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
  if (!words || !Array.isArray(words) || words.length === 0 || !targetLanguage) {
    return res.status(400).json({ error: "words array and targetLanguage are required" });
  }

  if (aiProvider === "local") {
    try {
      const prompt = `You are a creative writer and language teacher.
Write a short story in ${targetLanguage} suitable for a language learner at difficulty level "${level || "A2-B1"}".
The genre of the story should be "${genre || "general"}".
The story MUST naturally include the following vocabulary words: ${words.join(", ")}.
Structure the story into 3 to 5 short paragraphs with a double line break \\n\\n between them.

Return your answer strictly in JSON format with these exact keys:
- "title": creative title of the story in ${targetLanguage}
- "text": the full story in ${targetLanguage} (paragraphs separated by double newlines \\n\\n)
- "translation": paragraph-by-paragraph translation of the story into ${translationLanguage || "Russian"} (paragraphs separated by double newlines \\n\\n)

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
      const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
      return res.json(data);
    } catch (localErr: any) {
      console.error("Local AI story generation failed:", localErr);
      return res.status(500).json({ error: localErr.message || "Failed to generate story with local AI" });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    const demoTitle = `AI Story: ${words.slice(0, 3).join(", ")} (Demo)`;
    const demoText = `Había una vez un student que quería aprender nuevas palabras. Hoy decidió usar las palabras: ${words.join(", ")}. Todo parecía muy interesante en este nuevo viaje.\n\nEs importante repasar el vocabulario todos los días para no olvidar lo aprendido.`;
    const demoTranslation = `Жили-были студенты, которые хотели выучить новые слова. Сегодня они решили использовать слова: ${words.join(", ")}. Всё казалось очень интересным в этом новом путешествии.\n\nВажно повторять словарный запас каждый день, чтобы не забыть выученное.`;
    return res.json({
      title: demoTitle,
      text: demoText,
      translation: demoTranslation
    });
  }

  try {
    const prompt = `You are a creative writer and language teacher.
Write a short story in ${targetLanguage} suitable for a language learner at difficulty level "${level || "A2-B1"}".
The genre of the story should be "${genre || "general"}".
The story MUST naturally include the following vocabulary words: ${words.join(", ")}.
Structure the story into 3 to 5 short paragraphs with a double line break \\n\\n between them.
IMPORTANT: You must return a JSON object with three fields:
1. "title": a string representing a creative title of the story in ${targetLanguage}.
2. "text": a string representing the full story in ${targetLanguage} (clean plain text, paragraphs separated by double newlines \\n\\n, no markdown, no HTML, no bold tags).
3. "translation": a string representing the paragraph-by-paragraph translation of the story into ${translationLanguage || "Russian"} (paragraphs separated by double newlines \\n\\n, no markdown, no HTML).

Return ONLY a valid JSON object matching this schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            text: { type: Type.STRING },
            translation: { type: Type.STRING }
          },
          required: ["title", "text", "translation"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return res.json(data);
  } catch (err: any) {
    console.error("AI Story Generator failed:", err);
    return res.status(500).json({ error: err.message || "Failed to generate story" });
  }
});

router.post("/detect-idioms", aiRateLimit, async (req, res) => {
  const { text, aiProvider, localAiUrl, localAiModel } = req.body;
  const targetLanguage = sanitizeLang(req.body.targetLanguage, "English");
  const translationLanguage = sanitizeLang(req.body.translationLanguage, "Russian");
  if (!text || !targetLanguage) {
    return res.status(400).json({ error: "Text and targetLanguage are required" });
  }

  const systemPrompt = `You are an expert language teacher and lexicographer.
Analyze the following text written in "${targetLanguage}".
Identify all phrasal verbs, idioms, sayings/proverbs, and multi-word set expressions present in the text.
For each identified item:
1. Provide the phrase normalized to its dictionary or infinitive form (all lowercase).
2. Provide a concise translation into "${translationLanguage || "Russian"}".
3. Provide a brief, helpful explanation in "${translationLanguage || "Russian"}" explaining what it means and how it functions in this context.
4. Classify it into one of these types: 'phrasal_verb' (phrasal verb), 'idiom' (idiom), 'saying' (saying, proverb, or quote), or 'set_expression' (collocation or set expression).

Only include actual multi-word expressions (2 or more words, e.g., "take off", "darse cuenta", "tener en cuenta", "bite the bullet"). Do not include single-word vocabulary.`;

  if (aiProvider === "local") {
    try {
      const prompt = `Task: ${systemPrompt}
Here is the text to analyze:
---
${text.substring(0, 15000)}
---

Return your answer strictly in JSON format with this exact structure:
{
  "detectedPhrases": [
    {
      "phrase": "normalized phrase (all lowercase)",
      "translation": "concise translation",
      "explanation": "brief helpful explanation in ${translationLanguage || "Russian"}",
      "type": "phrasal_verb" or "idiom" or "saying" or "set_expression"
    }
  ]
}

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
      const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
      const detectedPhrasesList = data.detectedPhrases || [];
      const formattedPhrases: Record<string, { translation: string; explanation: string; type: string }> = {};
      for (const item of detectedPhrasesList) {
        if (item && item.phrase) {
          formattedPhrases[item.phrase.toLowerCase()] = {
            translation: item.translation || "",
            explanation: item.explanation || "",
            type: item.type || "idiom"
          };
        }
      }
      return res.json({ detectedPhrases: formattedPhrases });
    } catch (localErr: any) {
      console.warn("Local AI Idiom Detector failed, falling back to local detection rules. Error:", localErr.message || localErr);
      const mockPhrases = getMockPhrases(text, targetLanguage);
      return res.json({ detectedPhrases: mockPhrases, isFallback: true });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    const mockPhrases = getMockPhrases(text, targetLanguage);
    return res.json({ detectedPhrases: mockPhrases });
  }

  try {
    const combinedPrompt = `${systemPrompt}\n\nHere is the text to analyze:\n---\n${text.substring(0, 15000)}\n---`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: combinedPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedPhrases: {
              type: Type.ARRAY,
              description: "A list of detected phrasal verbs, idioms, sayings, and multi-word set expressions",
              items: {
                type: Type.OBJECT,
                properties: {
                  phrase: { type: Type.STRING, description: "The normalized lowercase phrase, e.g., 'take off' or 'dar a conocer'" },
                  translation: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  type: { 
                    type: Type.STRING, 
                    description: "The type of the detected expression: 'phrasal_verb', 'idiom', 'saying', or 'set_expression'" 
                  }
                },
                required: ["phrase", "translation", "explanation", "type"]
              }
            }
          },
          required: ["detectedPhrases"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    const detectedPhrasesList = data.detectedPhrases || [];
    const formattedPhrases: Record<string, { translation: string; explanation: string; type: string }> = {};
    for (const item of detectedPhrasesList) {
      if (item && item.phrase) {
        formattedPhrases[item.phrase.toLowerCase()] = {
          translation: item.translation || "",
          explanation: item.explanation || "",
          type: item.type || "idiom"
        };
      }
    }
    return res.json({ detectedPhrases: formattedPhrases });
  } catch (err: any) {
    console.warn("AI Idiom Detector failed, falling back to local detection rules. Error:", err.message || err);
    const mockPhrases = getMockPhrases(text, targetLanguage);
    return res.json({ detectedPhrases: mockPhrases, isFallback: true });
  }
});

function getMockPhrases(text: string, targetLanguage: string): Record<string, { translation: string; explanation: string; type: string }> {
  const mockPhrases: Record<string, { translation: string; explanation: string; type: string }> = {};
  const textLower = text.toLowerCase();
  
  if (targetLanguage.toLowerCase().includes("span")) {
    if (textLower.includes("dar a conocer") || textLower.includes("dó a conocer") || textLower.includes("dio a conocer")) {
      mockPhrases["dar a conocer"] = {
        translation: "обнародовать, сделать известным",
        explanation: "Идиома, означающая раскрытие информации или представление чего-то/чего-то публике.",
        type: "idiom"
      };
    }
    if (textLower.includes("darse cuenta") || textLower.includes("dio cuenta") || textLower.includes("doy cuenta")) {
      mockPhrases["darse cuenta"] = {
        translation: "осознать, понять",
        explanation: "Выражение, означающее внезапное осознание или понимание факта.",
        type: "set_expression"
      };
    }
    if (textLower.includes("tener en cuenta") || textLower.includes("tenga en cuenta") || textLower.includes("tiene en cuenta")) {
      mockPhrases["tener en cuenta"] = {
        translation: "принимать во внимание, учитывать",
        explanation: "Устойчивое выражение, означающее учет чего-либо при принятии решения.",
        type: "set_expression"
      };
    }
  }
  
  if (targetLanguage.toLowerCase().includes("engl") || targetLanguage.toLowerCase().includes("eng")) {
    if (textLower.includes("take off") || textLower.includes("took off") || textLower.includes("taking off")) {
      mockPhrases["take off"] = {
        translation: "взлетать, снимать (одежду)",
        explanation: "Phrasal verb meaning to leave the ground (plane) or remove clothing.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("look forward to") || textLower.includes("looking forward to") || textLower.includes("looked forward to")) {
      mockPhrases["look forward to"] = {
        translation: "ожидать с нетерпением",
        explanation: "Phrasal verb meaning to feel excited about something that is going to happen.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("set up") || textLower.includes("setting up")) {
      mockPhrases["set up"] = {
        translation: "устанавливать, организовывать",
        explanation: "Phrasal verb meaning to establish or arrange something.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("take up") || textLower.includes("took up") || textLower.includes("taking up")) {
      mockPhrases["take up"] = {
        translation: "начать заниматься чем-то (хобби, спорт)",
        explanation: "Phrasal verb meaning to start a new activity, hobby, or interest.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("give up") || textLower.includes("gave up") || textLower.includes("giving up")) {
      mockPhrases["give up"] = {
        translation: "сдаваться, бросать",
        explanation: "Phrasal verb meaning to stop doing something or stop trying.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("keep going") || textLower.includes("kept going") || textLower.includes("keeps going")) {
      mockPhrases["keep going"] = {
        translation: "продолжать идти/делать",
        explanation: "Phrasal verb meaning to continue progress or not stop.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("run into") || textLower.includes("ran into") || textLower.includes("running into")) {
      mockPhrases["run into"] = {
        translation: "случайно встретить, натолкнуться",
        explanation: "Phrasal verb meaning to meet someone or encounter a problem unexpectedly.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("work out") || textLower.includes("worked out") || textLower.includes("working out")) {
      mockPhrases["work out"] = {
        translation: "получаться, улаживаться; тренироваться",
        explanation: "Phrasal verb meaning to develop, resolve or progress in a specified way.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("figure out") || textLower.includes("figured out") || textLower.includes("figuring out")) {
      mockPhrases["figure out"] = {
        translation: "выяснить, понять, разобраться",
        explanation: "Phrasal verb meaning to understand or solve something after thinking about it.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("look up") || textLower.includes("looked up") || textLower.includes("looking up") || textLower.includes("look it up")) {
      mockPhrases["look up"] = {
        translation: "искать (информацию в книге/интернете)",
        explanation: "Phrasal verb meaning to search for information in a reference source like a dictionary or online.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("come together") || textLower.includes("came together") || textLower.includes("coming together")) {
      mockPhrases["come together"] = {
        translation: "успешно соединиться, сложиться",
        explanation: "Phrasal verb meaning to finalize or assemble successfully.",
        type: "phrasal_verb"
      };
    }
    if (textLower.includes("over the moon")) {
      mockPhrases["over the moon"] = {
        translation: "на седьмом небе от счастья",
        explanation: "Idiom meaning extremely happy and excited.",
        type: "idiom"
      };
    }
    if (textLower.includes("rome wasn't built in a day")) {
      mockPhrases["rome wasn't built in a day"] = {
        translation: "Рим не за один день строился",
        explanation: "A famous saying/idiom meaning that important work takes time to complete and should not be rushed.",
        type: "saying"
      };
    }
    if (textLower.includes("to be honest")) {
      mockPhrases["to be honest"] = {
        translation: "если честно, честно говоря",
        explanation: "A common conversational phrase used to state one's true opinion or feeling.",
        type: "set_expression"
      };
    }
  }
 
  return mockPhrases;
}

export default router;
