import express from "express";
import path from "path";
import fs from "fs";
import { YoutubeTranscript } from "youtube-transcript";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import crypto from "crypto";
import Database from "better-sqlite3";
import os from "os";
import ytdlp from "yt-dlp-exec";
import WebVTT from "node-webvtt";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || process.cwd();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const AUDIO_CACHE_DIR = path.join(DATA_DIR, "audio_cache");
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

const IMAGE_CACHE_DIR = path.join(DATA_DIR, "image_cache");
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

function getCacheFilename(text: string, lang: string): string {
  const hash = crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex");
  return `google_${lang}_${hash}.mp3`;
}

// Lazy initialize Gemini client safely
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY") {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
  }
  return aiClient;
}

// Helper function to call local Ollama AI model
async function callLocalAi(
  url: string,
  model: string,
  prompt: string,
  formatJson = false
): Promise<any> {
  const cleanUrl = (url || "http://localhost:11434/api/generate").trim();
  const cleanModel = (model || "phi3.5").trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

  try {
    const bodyPayload: any = {
      model: cleanModel,
      prompt: prompt,
      stream: false
    };
    if (formatJson) {
      bodyPayload.format = "json";
    }

    const response = await fetch(cleanUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Local AI server returned status ${response.status}`);
    }

    const data: any = await response.json();
    const rawText = (data.response || "").trim();

    if (formatJson) {
      try {
        return JSON.parse(rawText);
      } catch (e) {
        console.error("Failed to parse JSON response from local AI:", rawText, e);
        throw new Error("Не удалось разобрать JSON-ответ от локального ИИ. Убедитесь, что модель генерирует корректный JSON.");
      }
    }
    return rawText;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("Запрос к локальному ИИ превысил лимит времени (60 секунд).");
    }
    // Check for connection refused/network errors
    if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
      const displayHost = cleanUrl.replace("/api/generate", "");
      throw new Error(`Локальный ИИ недоступен. Проверьте, запущен ли Ollama на вашем компьютере (адрес: ${displayHost}).`);
    }
    throw err;
  }
}

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.post("/api/explain", async (req, res) => {
  const { word, context, targetLanguage, translationLanguage, aiProvider, localAiUrl, localAiModel, customQuestion } = req.body;

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");

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
      }
      return res.json(data);
    } catch (localErr: any) {
      console.error("Local AI word explanation failed:", localErr);
      return res.status(500).json({ error: localErr.message || "Failed to analyze word with local AI" });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Elegant fallback simulation
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
      model: "gemini-3.5-flash",
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
    }
    return res.json(data);
  } catch (err: any) {
    console.error("Gemini context translation error:", err);
    return res.status(500).json({ error: err.message || "Failed to analyze word" });
  }
});

// Helper for cleaning and mapping grammar tags to clean standard English names
function sanitizeGrammarTag(tag: string): string {
  if (!tag) return "Word";
  let clean = tag.trim();
  
  // Split by common separators to remove additional comments/details
  const separators = [",", ";", "(", "/"];
  for (const sep of separators) {
    const idx = clean.indexOf(sep);
    if (idx !== -1) {
      clean = clean.substring(0, idx).trim();
    }
  }
  
  // Remove any remaining non-word characters at the ends
  clean = clean.replace(/^[^a-zA-Z\p{L}]+|[^a-zA-Z\p{L}]+$/gu, "");
  
  const lower = clean.toLowerCase();
  
  // Mapping dictionary from Russian grammatical terms to standard English tags
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
  
  // If it still contains Cyrillic characters, default to "Word" or "Phrase"
  if (/[а-яА-ЯёЁ]/.test(clean)) {
    if (clean.includes(" ") || clean.length > 15) {
      return "Phrase";
    }
    return "Word";
  }
  
  // Capitalize first letter
  if (clean.length > 0) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  
  return clean || "Word";
}

// Helper for Dictionary Language Code Resolution
function getLangCode(langName: string): string {
  const norm = (langName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "английский") return "en";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "испанский") return "es";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "французский") return "fr";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "немецкий") return "de";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "итальянский") return "it";
  if (norm.startsWith("ru") || norm === "русский") return "ru";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "португальский") return "pt";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "турецкий") return "tr";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "японский") return "ja";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "китайский") return "zh";
  if (norm.startsWith("ar") || norm === "арабский") return "ar";
  return "en";
}

// Keyless freedictionaryapi.com Fetcher
async function fetchFreeDictionaryFromCom(word: string, langCode: string) {
  try {
    const url = `https://freedictionaryapi.com/api/v1/entries/${langCode}/${encodeURIComponent(word)}?translations=true`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      return data;
    }
  } catch (e) {
    console.error("freedictionaryapi.com fetch failed for word:", word, e);
  }
  return null;
}

// Keyless Free Dictionary API Fetcher
async function fetchFreeDictionary(word: string, langCode: string) {
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch (e) {
    console.error("Free Dictionary API fetch failed for word:", word, e);
  }
  return null;
}

// Keyless Wiktionary REST Definition API Fetcher
async function fetchWiktionary(word: string, langCode: string) {
  try {
    // English Wiktionary typically has exhaustive coverage for all language translations & etymology
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error("Wiktionary API 'en' fetch failed for word:", word, e);
  }

  // Fallback to native language Wiktionary REST definition page
  if (langCode !== "en") {
    try {
      const fallbackUrl = `https://${langCode}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
      const response = await fetch(fallbackUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Wiktionary fallback fetch failed for word:", word, e);
    }
  }
  return null;
}

// Keyless Google Translate Fetcher
async function fetchGoogleTranslate(text: string, fromLang: string, toLang: string, getAlternatives = false): Promise<string | null> {
  try {
    const dtParams = getAlternatives ? "dt=t&dt=at&dt=bd" : "dt=t";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&${dtParams}&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;

    let primary = "";
    if (data[0] && Array.isArray(data[0])) {
      primary = data[0].map((x: any) => x[0]).join("").trim();
    }

    if (getAlternatives) {
      const alts: string[] = [];
      if (primary) {
        alts.push(primary);
      }

      // Parse data[1] (bilingual dictionary/definitions)
      if (data[1] && Array.isArray(data[1])) {
        for (const posBlock of data[1]) {
          if (posBlock && Array.isArray(posBlock[1])) {
            for (const word of posBlock[1]) {
              if (typeof word === "string" && word.trim()) {
                const clean = word.trim();
                if (!alts.some(w => w.toLowerCase() === clean.toLowerCase())) {
                  alts.push(clean);
                }
              }
            }
          }
        }
      }

      // Parse data[5] (alternative translations list)
      if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
        for (const item of data[5][0][2]) {
          if (item && typeof item[0] === "string" && item[0].trim()) {
            const clean = item[0].trim();
            if (!alts.some(w => w.toLowerCase() === clean.toLowerCase())) {
              alts.push(clean);
            }
          }
        }
      }

      if (alts.length > 0) {
        return alts.slice(0, 5).join(", ");
      }
    }

    return primary || null;
  } catch (e) {
    console.error("Google Translate fetch failed:", e);
  }
  return null;
}

// 1.5. Keyless Multi-Dictionary Lookup (Free Dictionary API + Wiktionary REST)
app.post("/api/dictionary-explain", async (req, res) => {
  const { word, context, targetLanguage, translationLanguage, source } = req.body;

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");
  const langCode = getLangCode(targetLanguage);

  let ipa = "";
  let grammar = "";
  let translation = "";
  const examples: { text: string; translation: string }[] = [];
  let contextRelation = "Результат получен из бесплатных словарей (Free Dictionary + Wiktionary).";

  let freeDictResult: any = null;
  let comDictResult: any = null;
  let wiktionaryResult: any = null;

  // 1. Fetch based on selected source target
  if (source === "free_dictionary" || source === "hybrid" || source === "google" || !source) {
    // Try freedictionaryapi.com first as it has excellent coverage for Spanish, English and other languages
    comDictResult = await fetchFreeDictionaryFromCom(cleanWord, langCode);
    if (!comDictResult) {
      freeDictResult = await fetchFreeDictionary(cleanWord, langCode);
    }
  }
  if (source === "wiktionary" || source === "hybrid" || source === "google" || !source) {
    wiktionaryResult = await fetchWiktionary(cleanWord, langCode);
  }

  // 2. Parse freedictionaryapi.com
  if (comDictResult && comDictResult.entries && Array.isArray(comDictResult.entries) && comDictResult.entries.length > 0) {
    const mainEntry = comDictResult.entries[0];
    grammar = mainEntry.partOfSpeech || "";

    // Parse IPA phonetic
    if (mainEntry.pronunciations && Array.isArray(mainEntry.pronunciations)) {
      const ipaObj = mainEntry.pronunciations.find((p: any) => p.type === "ipa" && p.text);
      if (ipaObj) {
        ipa = ipaObj.text;
      }
    }

    // Parse senses, definitions, and examples
    if (mainEntry.senses && Array.isArray(mainEntry.senses) && mainEntry.senses.length > 0) {
      const meaningsList: string[] = [];
      mainEntry.senses.forEach((s: any) => {
        if (s.definition) {
          const part = mainEntry.partOfSpeech ? `(${mainEntry.partOfSpeech}) ` : "";
          meaningsList.push(`${part}${s.definition}`);
        }
        if (s.examples && Array.isArray(s.examples)) {
          s.examples.slice(0, 3).forEach((ex: string) => {
            if (ex && typeof ex === "string") {
              examples.push({
                text: ex,
                translation: "Пример из Free Dictionary"
              });
            }
          });
        }
      });

      if (meaningsList.length > 0) {
        translation = meaningsList.slice(0, 3).join("; ");
      }
    }
    contextRelation = "Результат получен из базы freedictionaryapi.com + Wiktionary.";
  }

  // 2.5 Parse Free Dictionary API (fallback)
  if (freeDictResult) {
    if (freeDictResult.phonetic) {
      ipa = freeDictResult.phonetic;
    } else if (freeDictResult.phonetics && Array.isArray(freeDictResult.phonetics)) {
      const validPhonetic = freeDictResult.phonetics.find((p: any) => p.text);
      if (validPhonetic) {
        ipa = validPhonetic.text;
      }
    }

    if (freeDictResult.meanings && Array.isArray(freeDictResult.meanings) && freeDictResult.meanings.length > 0) {
      const meaningsList: string[] = [];
      const firstMeaning = freeDictResult.meanings[0];
      grammar = firstMeaning.partOfSpeech || "";

      freeDictResult.meanings.forEach((m: any) => {
        const part = m.partOfSpeech ? `(${m.partOfSpeech}) ` : "";
        if (m.definitions && Array.isArray(m.definitions)) {
          m.definitions.slice(0, 2).forEach((d: any) => {
            if (d.definition) {
              meaningsList.push(`${part}${d.definition}`);
            }
            if (d.example) {
              examples.push({
                text: d.example,
                translation: "Пример из словаря (перевод отсутствует)"
              });
            }
          });
        }
      });

      if (meaningsList.length > 0) {
        translation = meaningsList.slice(0, 3).join("; ");
      }
    }
  }

  // 3. Parse Wiktionary
  if (wiktionaryResult) {
    const sections = Object.keys(wiktionaryResult);
    const validParts: string[] = [];

    sections.forEach((sec) => {
      const partOfSpeeches = wiktionaryResult[sec];
      if (Array.isArray(partOfSpeeches)) {
        partOfSpeeches.forEach((pos: any) => {
          if (pos.partOfSpeech && !grammar) {
            grammar = pos.partOfSpeech;
          }
          if (pos.definitions && Array.isArray(pos.definitions)) {
            pos.definitions.slice(0, 3).forEach((d: any) => {
              const cleanDef = d.definition ? d.definition.replace(/<[^>]+>/g, "").trim() : "";
              if (cleanDef) {
                validParts.push(`${pos.partOfSpeech ? `(${pos.partOfSpeech}) ` : ""}${cleanDef}`);
              }
              if (d.examples && Array.isArray(d.examples)) {
                d.examples.slice(0, 2).forEach((ex: any) => {
                  const cleanEx = ex.text ? ex.text.replace(/<[^>]+>/g, "").trim() : "";
                  if (cleanEx && !examples.some(item => item.text.toLowerCase() === cleanEx.toLowerCase())) {
                    examples.push({
                      text: cleanEx,
                      translation: "Пример употребления"
                    });
                  }
                });
              }
            });
          }
        });
      }
    });

    if (validParts.length > 0) {
      if (!translation) {
        translation = validParts.slice(0, 3).join("; ");
      } else if (source === "hybrid") {
        translation += " | Wiktionary: " + validParts.slice(0, 2).join("; ");
      }
    }
  }

  if (source === "google") {
    const sourceLangCode = getLangCode(targetLanguage);
    const destLangCode = getLangCode(translationLanguage);
    const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
    if (googleTrans) {
      translation = googleTrans;
    }

    if (examples.length > 0) {
      for (const ex of examples) {
        if (ex.text) {
          const transEx = await fetchGoogleTranslate(ex.text, sourceLangCode, destLangCode);
          if (transEx) {
            ex.translation = transEx;
          }
        }
      }
    }

    if (context && context.trim() !== cleanWord) {
      const transContext = await fetchGoogleTranslate(context, sourceLangCode, destLangCode);
      if (transContext) {
        contextRelation = `Перевод контекста: "${transContext}" (Google Translate)`;
      } else {
        contextRelation = `Результат получен из Google Translate (без ИИ).`;
      }
    } else {
      contextRelation = `Результат получен из Google Translate (без ИИ).`;
    }
  } else {
    // Fallback structures if empty
    if (!translation) {
      translation = `Перевод слова не найден в выбранном локальном словаре.`;
      contextRelation = `Мы пытались найти слово "${cleanWord}" в Free Dictionary и Wiktionary, но результатов нет. Пожалуйста, используйте поиск через ИИ (AI)!`;
    } else {
      contextRelation = `Определение успешно загружено из источника: ${
        source === "free_dictionary" ? "Free Dictionary API" : source === "wiktionary" ? "Wiktionary REST API" : "Смешанный поиск (Hybrid)"
      }.`;
    }
  }

  if (examples.length === 0) {
    examples.push({
      text: `Let's use "${cleanWord}" in a text context.`,
      translation: `Давайте используем слово "${cleanWord}" в предложении.`
    });
  }

  return res.json({
    translation,
    ipa: ipa || `[${cleanWord}]`,
    grammar: sanitizeGrammarTag(grammar || "Word"),
    contextRelation,
    examples: examples.slice(0, 3)
  });
});

// 2. AI Audio Generator (TTS)
app.post("/api/generate-tts", async (req, res) => {
  const { text, language } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({
      error: "Gemini API key is missing. AI TTS requires the GEMINI_API_KEY secret configured in AI Studio Settings.",
      isDemo: true
    });
  }

  try {
    const speechText = `Convert the following text into speech. Do not translate, do not answer, do not add any commentary. Output only the spoken audio of the text.
Language: ${language || "appropriate language"}
Text: ${text}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: speechText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Warm narration voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio chunk was returned from the model");
    }

    return res.json({ audioBase64: base64Audio });
  } catch (err: any) {
    console.error("Gemini TTS audio generation error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate AI audio narration" });
  }
});

// 3. Google Translate TTS Proxy (same engine as AwesomeTTS in Anki — free, no key required)
app.get("/api/google-tts", async (req, res) => {
  const text = req.query.text as string;
  const lang = (req.query.lang as string) || "en";
  const speed = parseFloat((req.query.speed as string) || "1.0");

  if (!text) {
    return res.status(400).json({ error: "text query param is required" });
  }

  try {
    // Clamp speed: Google Translate TTS accepts 0.24 – 1.0
    const clampedSpeed = Math.min(1.0, Math.max(0.24, speed));
    const ttsspeed = clampedSpeed < 1.0 ? String(clampedSpeed) : "1";

    const cacheFilename = getCacheFilename(text, lang);
    const cacheFilePath = path.join(AUDIO_CACHE_DIR, cacheFilename);

    // If already saved on disk, serve it directly offline
    if (fs.existsSync(cacheFilePath)) {
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "public, max-age=31536000"); // cache 1 year in client browser
      return res.sendFile(cacheFilePath);
    }

    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("tl", lang);
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("q", text.slice(0, 200)); // Google limits ~200 chars
    if (ttsspeed !== "1") url.searchParams.set("ttsspeed", ttsspeed);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Google TTS returned ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to disk cache in the project directory
    await fs.promises.writeFile(cacheFilePath, buffer);

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000"); // cache 1 year
    return res.send(buffer);
  } catch (err: any) {
    console.error("Google Translate TTS proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy Google TTS" });
  }
});

// Local Image caching proxy to support offline work and migrations
app.get("/api/image-proxy", async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: "URL parameter 'url' is required" });
  }

  try {
    const hash = crypto.createHash("md5").update(imageUrl).digest("hex");
    
    // Parse the image URL extension safely, defaulting to .jpg
    const parsedUrl = new URL(imageUrl);
    const pathname = parsedUrl.pathname;
    let ext = path.extname(pathname) || ".jpg";
    if (!/^\.[a-zA-Z0-5]+$/.test(ext) || ext.length > 5) {
      ext = ".jpg";
    }
    
    const cacheFilename = `img_${hash}${ext}`;
    const cacheFilePath = path.join(IMAGE_CACHE_DIR, cacheFilename);

    // Serve directly from disk offline
    if (fs.existsSync(cacheFilePath)) {
      res.set("Cache-Control", "public, max-age=31536000"); // cache 1 year
      return res.sendFile(cacheFilePath);
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Image fetch failed with status ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to the local image_cache directory
    await fs.promises.writeFile(cacheFilePath, buffer);

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000");
    return res.send(buffer);
  } catch (err: any) {
    console.error("Image proxy error:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy image" });
  }
});

// Image Search Proxy using DuckDuckGo Scraper (No Key Required)
app.get("/api/image-search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    // 1. Fetch the DuckDuckGo search page to get the "vqd" string (the request token needed for i.js API)
    const htmlUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query as string)}`;
    const htmlResponse = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });

    if (!htmlResponse.ok) {
      throw new Error(`DuckDuckGo HTML query returned status ${htmlResponse.status}`);
    }

    const html = await htmlResponse.text();

    // Extract the vqd token using multiple regex fallback patterns
    let vqd: string | null = null;
    const match1 = html.match(/vqd=([\d-]+)\&/);
    if (match1) {
      vqd = match1[1];
    }
    if (!vqd) {
      const match2 = html.match(/vqd\s*=\s*['"]([^'"]+)['"]/);
      if (match2) {
        vqd = match2[1];
      }
    }
    if (!vqd) {
      const match3 = html.match(/vqd\s*:\s*['"]([^'"]+)['"]/);
      if (match3) {
        vqd = match3[1];
      }
    }

    if (!vqd) {
      throw new Error("Could not extract vqd request token from DuckDuckGo Search page");
    }

    // 2. Query the DuckDuckGo keyless i.js image search database
    const searchUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query as string)}&vqd=${vqd}&f=,,,&p=1`;
    const imageResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://duckduckgo.com/"
      }
    });

    if (!imageResponse.ok) {
      throw new Error(`DuckDuckGo image API query returned status ${imageResponse.status}`);
    }

    const data = await imageResponse.json();
    const results = (data?.results || []).slice(0, 24).map((img: any, idx: number) => ({
      id: `ddg-${idx}-${img.image || Math.random()}`,
      url: img.image || "",
      thumb: img.thumbnail || img.image || "",
      author: img.source || "DuckDuckGo Search",
      description: img.title || "Image"
    }));

    return res.json({ results });
  } catch (err: any) {
    console.error("DuckDuckGo image search error:", err);
    
    // Safety Fallback Strategy: If DDG is rate-limited or fails, return highly aesthetic curated Unsplash placeholder imagery based on query to ensure zero UI interruption
    const normalizedQuery = (query as string).toLowerCase().trim();
    const fallbacks = [
      {
        id: "fb-1",
        url: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=60`,
        thumb: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=60`,
        author: "Unsplash Creator",
        description: `Curated fallback image matching "${normalizedQuery}"`
      },
      {
        id: "fb-2",
        url: `https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&auto=format&fit=crop&q=60`,
        thumb: `https://images.unsplash.com/photo-1501854140801-50d01698950b?w=200&auto=format&fit=crop&q=60`,
        author: "Unsplash Creator",
        description: `Nature placeholder for "${normalizedQuery}"`
      },
      {
        id: "fb-3",
        url: `https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=60`,
        thumb: `https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=200&auto=format&fit=crop&q=60`,
        author: "Web Placeholder",
        description: `Landscape visual representation`
      }
    ];

    return res.json({ results: fallbacks, isFallback: true });
  }
});

// Robust helper function to parse complete nested JSON objects (e.g. ytInitialPlayerResponse)
// from raw HTML using bracket balancing with proper treatment of quotes and escape sequences.
function extractPlayerResponse(html: string): any {
  // Method 1: Search for ytInitialPlayerResponse to find full state
  let index = html.indexOf("ytInitialPlayerResponse");
  while (index !== -1) {
    const startChar = html.indexOf("{", index);
    if (startChar !== -1) {
      let braceCount = 0;
      let inString = false;
      let escape = false;
      for (let i = startChar; i < html.length; i++) {
        const char = html[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") {
            braceCount++;
          } else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              const jsonStr = html.substring(startChar, i + 1);
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                  return parsed;
                }
              } catch (e) {
                // Ignore SyntaxError and check next occurrence
              }
              break;
            }
          }
        }
      }
    }
    index = html.indexOf("ytInitialPlayerResponse", index + 1);
  }

  // Method 2: Search for playerCaptionsTracklistRenderer directly (extremely robust fallback)
  let indexCap = html.indexOf('"playerCaptionsTracklistRenderer"');
  if (indexCap === -1) {
    indexCap = html.indexOf("playerCaptionsTracklistRenderer");
  }
  if (indexCap !== -1) {
    let searchStart = indexCap;
    // Go backwards up to 3000 chars to find matching opening bracket of containing block
    while (searchStart > 0 && indexCap - searchStart < 3000) {
      searchStart = html.lastIndexOf("{", searchStart - 1);
      if (searchStart === -1) break;

      let braceCount = 0;
      let inString = false;
      let escape = false;
      for (let i = searchStart; i < html.length; i++) {
        const char = html[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") {
            braceCount++;
          } else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              const jsonStr = html.substring(searchStart, i + 1);
              try {
                const parsed = JSON.parse(jsonStr);
                const tracks = parsed?.playerCaptionsTracklistRenderer?.captionTracks ||
                               parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (tracks) {
                  return parsed.captions ? parsed : { captions: parsed };
                }
              } catch (e) {
                // Ignore and try previous '{'
              }
              break;
            }
          }
        }
      }
    }
  }

  // Method 3: Search for "\"captions\":" directly
  let indexCaptions = html.indexOf('"captions":');
  if (indexCaptions !== -1) {
    const startChar = html.indexOf("{", indexCaptions);
    if (startChar !== -1) {
      let braceCount = 0;
      let inString = false;
      let escape = false;
      for (let i = startChar; i < html.length; i++) {
        const char = html[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") {
            braceCount++;
          } else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              const jsonStr = html.substring(startChar, i + 1);
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed?.playerCaptionsTracklistRenderer?.captionTracks) {
                  return { captions: parsed };
                }
              } catch (e) {
                // Ignore
              }
              break;
            }
          }
        }
      }
    }
  }

  // Method 4: Search for direct captionTracks array string structure
  let indexTracks = html.indexOf('"captionTracks"');
  if (indexTracks !== -1) {
    const startChar = html.indexOf("[", indexTracks);
    if (startChar !== -1) {
      let bracketCount = 0;
      let inString = false;
      let escape = false;
      for (let i = startChar; i < html.length; i++) {
        const char = html[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "[") {
            bracketCount++;
          } else if (char === "]") {
            bracketCount--;
            if (bracketCount === 0) {
              const jsonStr = html.substring(startChar, i + 1);
              try {
                const parsedTracks = JSON.parse(jsonStr);
                if (Array.isArray(parsedTracks) && parsedTracks.length > 0) {
                  return {
                    captions: {
                      playerCaptionsTracklistRenderer: {
                        captionTracks: parsedTracks
                      }
                    }
                  };
                }
              } catch (e) {
                // Ignore
              }
              break;
            }
          }
        }
      }
    }
  }

  return null;
}

// 3. YouTube Subtitle Downloader & Metadata Parser
app.post("/api/youtube-subtitles", async (req, res) => {
  const { url, targetLanguage } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Extract 11-char video ID
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
  if (!match) {
    return res.status(400).json({ error: "Invalid YouTube URL format" });
  }
  const videoId = match[1];
  let title = "YouTube Video";
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  try {
    const resPage = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const html = await resPage.text();

    // Title parsing
    const titleMatch = html.match(/<meta name="title" content="([^"]*)"/i) || html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(" - YouTube", "");
      // HTML entity decode title simple
      title = title
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#160;/g, " ");
    }

    let langCode = "es";
    const targetLower = (targetLanguage || "spanish").toLowerCase();
    if (targetLower.startsWith("span") || targetLower === "es") langCode = "es";
    else if (targetLower.startsWith("fren") || targetLower === "fr") langCode = "fr";
    else if (targetLower.startsWith("germ") || targetLower === "de") langCode = "de";
    else if (targetLower.startsWith("ital") || targetLower === "it") langCode = "it";
    else if (targetLower.startsWith("russ") || targetLower === "ru") langCode = "ru";
    else if (targetLower.startsWith("engl") || targetLower === "en") langCode = "en";
    else if (targetLower.startsWith("jap") || targetLower === "ja") langCode = "ja";
    else if (targetLower.startsWith("chin") || targetLower === "zh") langCode = "zh";
    else if (targetLower.startsWith("arab") || targetLower === "ar") langCode = "ar";
    else langCode = targetLower.substring(0, 2);

    let isSuccessful = false;
    let lines: string[] = [];

    // Helper to download and parse subtitles with yt-dlp
    const downloadSubs = async (lang: string) => {
      const tempDir = os.tmpdir();
      const tempBaseName = `yt_sub_${videoId}_${Date.now()}`;
      const tempBasePath = path.join(tempDir, tempBaseName);
      
      const findWordOverlap = (a: string, b: string): number => {
        const wordsA = a.trim().split(/\s+/);
        const wordsB = b.trim().split(/\s+/);
        
        const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
        
        const normA = wordsA.map(normalize).filter(Boolean);
        const normB = wordsB.map(normalize).filter(Boolean);
        
        const maxOverlap = Math.min(normA.length, normB.length);
        for (let len = maxOverlap; len > 0; len--) {
          let match = true;
          for (let i = 0; i < len; i++) {
            if (normA[normA.length - len + i] !== normB[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            let wordCount = 0;
            let charIdx = 0;
            while (charIdx < b.length && /\s/.test(b[charIdx])) {
              charIdx++;
            }
            while (charIdx < b.length && wordCount < len) {
              while (charIdx < b.length && !/\s/.test(b[charIdx])) {
                charIdx++;
              }
              wordCount++;
              while (charIdx < b.length && /\s/.test(b[charIdx])) {
                charIdx++;
              }
            }
            return charIdx;
          }
        }
        return 0;
      };

      try {
        console.log(`[YouTube Subtitles] Downloading with yt-dlp-exec. Lang: ${lang}, Video: ${videoId}`);
        await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
          writeSub: true,
          writeAutoSub: true,
          subLang: lang,
          subFormat: 'vtt',
          output: tempBasePath,
          skipDownload: true,
          noCheckCertificate: true,
        });

        // Search for generated subtitle file matching the prefix and ending with .vtt
        const files = fs.readdirSync(tempDir);
        const matchingFile = files.find(f => f.startsWith(tempBaseName) && f.endsWith(".vtt"));
        
        if (matchingFile) {
          const fullPath = path.join(tempDir, matchingFile);
          const rawContent = fs.readFileSync(fullPath, "utf-8");
          
          // Sanitise VTT content to bypass strict node-webvtt signature checks
          const rawLines = rawContent.split(/\r?\n/);
          const sanitizedLines: string[] = ["WEBVTT", ""];
          let inHeader = true;
          for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (line.startsWith("WEBVTT")) continue;
            if (inHeader) {
              if (line.includes("-->")) {
                inHeader = false;
              } else {
                continue;
              }
            }
            sanitizedLines.push(rawLines[i]);
          }
          const sanitizedContent = sanitizedLines.join("\n");
          const parsed = WebVTT.parse(sanitizedContent);
          
          if (parsed?.cues && parsed.cues.length > 0) {
            // Clean cues text first
            const cleanCues = parsed.cues.map(c => {
              let t = c.text || "";
              // Strip inline timing tags (<00:00:00.123>) and other WebVTT formatting tags (<c>, etc.)
              t = t.replace(/<[^>]+>/g, "");
              t = t
                .replace(/&nbsp;/g, " ")
                .replace(/&#160;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&#10;/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              return {
                start: c.start,
                text: t
              };
            }).filter(c => c.text.length > 0);

            // Step 1: Discard any cue i if cue i+1 starts with cue i
            const filteredCues = [];
            for (let i = 0; i < cleanCues.length; i++) {
              const current = cleanCues[i].text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "");
              const next = i < cleanCues.length - 1 ? cleanCues[i+1].text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, "") : "";
              if (next && next.startsWith(current)) {
                continue;
              }
              filteredCues.push(cleanCues[i]);
            }

            // Step 2: Merge overlapping consecutive cues
            const finalLines = [];
            if (filteredCues.length > 0) {
              finalLines.push({
                start: filteredCues[0].start,
                text: filteredCues[0].text
              });

              for (let i = 1; i < filteredCues.length; i++) {
                const prevText = filteredCues[i - 1].text;
                const currentText = filteredCues[i].text;
                const skipBytes = findWordOverlap(prevText, currentText);
                const cleanText = currentText.substring(skipBytes).trim();
                
                if (cleanText) {
                  finalLines.push({
                    start: filteredCues[i].start,
                    text: cleanText
                  });
                }
              }
            }

            // Format cues into final array format
            lines = finalLines.map(cue => {
              const offsetSec = Math.floor(cue.start);
              return `${offsetSec}s\t${cue.text}`;
            });
          }
          
          // Cleanup
          try {
            fs.unlinkSync(fullPath);
          } catch (e) {
            // ignore cleanup errors
          }
          
          if (lines.length > 0) {
            return true;
          }
        }
      } catch (err: any) {
        console.log(`[YouTube Subtitles] yt-dlp-exec failed for lang ${lang}:`, err.message);
      }
      return false;
    };

    // 1. Try fetching with preferred language
    isSuccessful = await downloadSubs(langCode);

    // 2. Try fetching with default language (English fallback)
    if (!isSuccessful) {
      console.log(`[YouTube Subtitles] Preferred code "${langCode}" not retrieved. Retrying with "en"...`);
      isSuccessful = await downloadSubs("en");
    }

    // 3. Fallback to Gemini AI Generation if we could not retrieve any transcripts
    if (!isSuccessful || lines.length === 0) {
      console.log(`[YouTube Subtitles] Transcripts unavailable for ${videoId} (${title}). Falling back to Gemini...`);
      
      const ai = getGeminiClient();
      if (ai) {
        try {
          const prompt = `You are an expert language teacher.
Create a detailed, beautiful and comprehensive educational study text, narrative or transcript fully written in the target language: "${targetLanguage}", inspired by the YouTube video titled: "${title}".
Let the text expand on this topic naturally using standard, common vocabulary of ${targetLanguage} suitable for study.
Structure the text into 4 to 6 clean, engaging paragraphs with a double line break between them.
IMPORTANT: Output ONLY the raw paragraph text in ${targetLanguage}. Do not provide titles, introductory explanations, ending summaries, translation notes, bracketed remarks, or markdown headers. Provide only the article body paragraphs in ${targetLanguage}.`;

          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
          });

          const aiText = response.text || "";
          if (aiText.trim()) {
            return res.json({
              title: `${title} (AI Study Text)`,
              text: aiText.trim(),
              coverUrl: thumbnail,
              youtubeId: videoId,
              isFallback: true
            });
          }
        } catch (gErr: any) {
          console.error("Auto Fallback Gemini generation failed:", gErr);
        }
      }

      // If no AI key set or AI generation fails, return a simulated lesson structured nicely so that it doesn't fail
      return res.json({
        title: `${title} (No Captions)`,
        text: `Questo è un testo di studio alternativo preparato per il video: "${title}".\n\nPer favore, per questo video attiva i sottotitoli (CC) oppure inserisci manualmente l'articolo che desideri studiare nel pannello 'Testo normale'.`,
        coverUrl: thumbnail,
        youtubeId: videoId,
        isFallback: true
      });
    }

    // Join lines with double newline as requested
    const formattedText = lines.join("\n\n");

    return res.json({
      title: title,
      text: formattedText,
      coverUrl: thumbnail,
      youtubeId: videoId
    });
  } catch (err: any) {
    console.error("YouTube importing subtitle error:", err);
    return res.status(500).json({
      error: `Could not parse subtitles: ${err.message || "Unknown error"}. Clean YouTube transcription blocks may be geo-restricted or unavailable.`,
      videoTitle: title || "YouTube Study Lesson",
      coverUrl: thumbnail,
      youtubeId: videoId
    });
  }
});

// 4. Fallback Gemini AI lesson generator for restricted YouTube videos
app.post("/api/youtube-fallback-generate", async (req, res) => {
  const { title, targetLanguage, aiProvider, localAiUrl, localAiModel } = req.body;
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
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const text = response.text || "";
    return res.json({ text: text.trim() });
  } catch (err: any) {
    console.error("Fallback AI Lesson Generator failed:", err);
    return res.status(500).json({ error: err.message || "Failed to generate fallback study text" });
  }
});

app.post("/api/generate-story", async (req, res) => {
  const { words, targetLanguage, translationLanguage, level, genre, aiProvider, localAiUrl, localAiModel } = req.body;
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
    // Simulated demo story if offline or key is missing
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
      model: "gemini-3.5-flash",
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

app.post("/api/detect-idioms", async (req, res) => {
  const { text, targetLanguage, translationLanguage, aiProvider, localAiUrl, localAiModel } = req.body;
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
    const systemPrompt = `You are an expert language teacher and lexicographer.
Analyze the following text written in "${targetLanguage}".
Identify all phrasal verbs, idioms, sayings/proverbs, and multi-word set expressions present in the text.
For each identified item:
1. Provide the phrase normalized to its dictionary or infinitive form (all lowercase).
2. Provide a concise translation into "${translationLanguage || "Russian"}".
3. Provide a brief, helpful explanation in "${translationLanguage || "Russian"}" explaining what it means and how it functions in this context.
4. Classify it into one of these types: 'phrasal_verb' (phrasal verb), 'idiom' (idiom), 'saying' (saying, proverb, or quote), or 'set_expression' (collocation or set expression).

Only include actual multi-word expressions (2 or more words, e.g., "take off", "darse cuenta", "tener en cuenta", "bite the bullet"). Do not include single-word vocabulary.

Return the result strictly as a JSON object with a "detectedPhrases" property.`;

    const combinedPrompt = `${systemPrompt}\n\nHere is the text to analyze:\n---\n${text.substring(0, 15000)}\n---`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
    // Graceful rate-limit/network fallback
    const mockPhrases = getMockPhrases(text, targetLanguage);
    return res.json({ detectedPhrases: mockPhrases, isFallback: true });
  }
});



// Helper function to generate mock phrases for offline/fallback mode
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

const EPUB_MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const EPUB_MAX_IMAGES = 50;

function safeDecodePath(rawPath: string): string {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function normalizeZipPath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
}

// Helper function to resolve relative paths inside EPUB ZIP entries
function resolveRelativePath(basePath: string, relativePath: string): string {
  const baseParts = normalizeZipPath(basePath).split("/");
  baseParts.pop();

  const relParts = normalizeZipPath(relativePath).split("/");
  for (const part of relParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      if (baseParts.length > 0) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join("/");
}

function resolveOpfHref(opfEntryName: string, href: string): string {
  const decodedHref = safeDecodePath(href);
  const opfParentDir = opfEntryName.includes("/")
    ? opfEntryName.substring(0, opfEntryName.lastIndexOf("/"))
    : "";

  if (!opfParentDir) {
    return normalizeZipPath(decodedHref);
  }

  // Handle complex relative paths (../../images/file.png)
  const hrefParts = decodedHref.split("/");
  const baseParts = opfParentDir.split("/");
  const resolvedParts: string[] = [];

  for (const part of hrefParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      if (baseParts.length > 0) {
        baseParts.pop();
      }
    } else {
      resolvedParts.push(part);
    }
  }

  const fullPath = [...baseParts, ...resolvedParts].join("/");
  return normalizeZipPath(fullPath);
}

type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

function findZipEntry(entries: ZipEntry[], resolvedPath: string): ZipEntry | undefined {
  const normalized = normalizeZipPath(resolvedPath).toLowerCase();
  const basename = normalized.includes("/") ? normalized.substring(normalized.lastIndexOf("/") + 1) : normalized;

  return entries.find((e) => {
    if (e.isDirectory) return false;
    const eName = normalizeZipPath(e.entryName).toLowerCase();
    return (
      eName === normalized ||
      eName.endsWith("/" + normalized) ||
      normalized.endsWith("/" + eName) ||
      eName.endsWith("/" + basename) ||
      eName === basename
    );
  });
}

function getMimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/jpeg";
}

function getTagAttr(tagStr: string, attrName: string): string {
  const quoted = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
  const quotedMatch = tagStr.match(quoted);
  if (quotedMatch) return quotedMatch[1];

  const unquoted = new RegExp(`${attrName}\\s*=\\s*([^\\s>"']+)`, "i");
  const unquotedMatch = tagStr.match(unquoted);
  return unquotedMatch ? unquotedMatch[1] : "";
}

interface EpubParseResult {
  title: string;
  text: string;
  images?: Record<string, { dataUrl: string; width: string; height: string }>;
}

// Helper function to extract, order, and clean text from an EPUB (ZIP archive)
function parseEpub(buffer: Buffer, includeImages: boolean = false): EpubParseResult {
  const startTime = Date.now();
  console.log(`[EPUB] Starting EPUB parsing (includeImages: ${includeImages}, buffer size: ${buffer.length} bytes)`);
  
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    console.log(`[EPUB] ZIP archive contains ${entries.length} entries`);
    
    let title = "Imported EPUB Book";
    let opfEntry = entries.find(e => e.entryName.endsWith(".opf"));
    
    if (opfEntry) {
      console.log(`[EPUB] Found OPF file: ${opfEntry.entryName}`);
    } else {
      console.warn(`[EPUB] No OPF file found, will use fallback HTML discovery`);
    }
    
    let htmlFilesOrder: string[] = [];
    const manifestResolvedPaths = new Set<string>();
    
    if (opfEntry) {
      const opfText = opfEntry.getData().toString("utf-8");
      console.log(`[EPUB] OPF file size: ${opfText.length} chars`);
      
      // Parse book title
      const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (titleMatch) {
         // simple trim and tag strip
        title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
        console.log(`[EPUB] Extracted title from OPF: "${title}"`);
      }
      
      // Parse manifest: id -> href (supports id/href in any order)
      const manifestItems: Record<string, string> = {};
      const itemRegex = /<item\s+[^>]*\/?>/gi;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(opfText)) !== null) {
        const itemTag = itemMatch[0];
        const idMatch = itemTag.match(/\bid=["']([^"']+)["']/i);
        const hrefMatch = itemTag.match(/\bhref=["']([^"']+)["']/i);
        if (idMatch && hrefMatch) {
          manifestItems[idMatch[1]] = hrefMatch[1];
          const resolvedPath = resolveOpfHref(opfEntry.entryName, hrefMatch[1]);
          manifestResolvedPaths.add(resolvedPath);
        }
      }
      console.log(`[EPUB] Parsed manifest: ${Object.keys(manifestItems).length} items`);
      
      // Parse spine: exact reading order
      const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*>/gi;
      const spineIdrefs: string[] = [];
      let spineMatch;
      while ((spineMatch = spineRegex.exec(opfText)) !== null) {
        spineIdrefs.push(spineMatch[1]);
      }
      console.log(`[EPUB] Parsed spine: ${spineIdrefs.length} itemrefs`);
      
      spineIdrefs.forEach(idref => {
        const href = manifestItems[idref];
        if (href) {
          htmlFilesOrder.push(resolveOpfHref(opfEntry.entryName, href));
        } else {
          console.warn(`[EPUB] Spine references unknown idref: ${idref}`);
        }
      });
      console.log(`[EPUB] Resolved reading order: ${htmlFilesOrder.length} chapters`);
    }
    
    // Fallback: collect all xhtml/html files alphabetically if OPF structures failed
    if (htmlFilesOrder.length === 0) {
      console.warn(`[EPUB] No chapters found in OPF spine, using fallback HTML discovery`);
      const fallbackEntries = entries.filter(e => 
        !e.isDirectory && 
        (e.entryName.endsWith(".xhtml") || e.entryName.endsWith(".html") || e.entryName.endsWith(".htm"))
      );
      fallbackEntries.sort((a, b) => a.entryName.localeCompare(b.entryName));
      htmlFilesOrder = fallbackEntries.map(e => e.entryName);
      console.log(`[EPUB] Fallback discovered ${htmlFilesOrder.length} HTML files`);
    }
    
    // Read and merge ordered chapters text content
    let combinedText = "";
    const extractedImages: Record<string, { dataUrl: string; width: string; height: string }> = {};
    let imageCounter = 0;

    htmlFilesOrder.forEach((path, chapterIndex) => {
      const entry = entries.find(e => 
        e.entryName === path || 
        e.entryName.endsWith(path) || 
        path.endsWith(e.entryName)
      );
      
      if (!entry) {
        console.warn(`[EPUB] Chapter ${chapterIndex + 1}/${htmlFilesOrder.length}: Entry not found for path: ${path}`);
        return;
      }

      try {
        console.log(`[EPUB] Processing chapter ${chapterIndex + 1}/${htmlFilesOrder.length}: ${entry.entryName}`);
        
        let htmlText: string;
        try {
          htmlText = entry.getData().toString("utf-8");
        } catch (err) {
          console.error(`[EPUB] Chapter ${chapterIndex + 1}: Failed to decode UTF-8 for ${entry.entryName}`, err);
          return;
        }
        
        if (title === "Imported EPUB Book") {
          const titleMatch = htmlText.match(/<title>([\s\S]*?)<\/title>/i) || htmlText.match(/<h1>([\s\S]*?)<\/h1>/i);
          if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
          }
        }
        
        let cleanHtmlText = htmlText
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        
        if (includeImages) {
          const imgRegex = /<(img|image)\s+([^>]+)\/?>/gi;
          cleanHtmlText = cleanHtmlText.replace(imgRegex, (match) => {
            if (imageCounter >= EPUB_MAX_IMAGES) return "";

            try {
              let srcVal =
                getTagAttr(match, "src") ||
                getTagAttr(match, "href") ||
                getTagAttr(match, "xlink:href");
              if (!srcVal) return "";

              srcVal = safeDecodePath(srcVal.split("#")[0].split("?")[0]);
              let resolvedPath = resolveRelativePath(entry.entryName, srcVal);

              let imgEntry = findZipEntry(entries, resolvedPath);
              if (!imgEntry && opfEntry) {
                imgEntry = findZipEntry(entries, resolveOpfHref(opfEntry.entryName, srcVal));
              }
              if (!imgEntry) {
                for (const manifestPath of manifestResolvedPaths) {
                  if (manifestPath.toLowerCase().endsWith("/" + normalizeZipPath(srcVal).toLowerCase()) ||
                      manifestPath.toLowerCase() === normalizeZipPath(srcVal).toLowerCase()) {
                    imgEntry = findZipEntry(entries, manifestPath);
                    if (imgEntry) {
                      resolvedPath = manifestPath;
                      break;
                    }
                  }
                }
              }

              if (!imgEntry) {
                console.warn(`[EPUB] Image not found in chapter ${chapterIndex + 1}: src="${srcVal}" resolved="${resolvedPath}"`);
                return "";
              }

              console.log(`[EPUB] Processing image ${imageCounter + 1}/${EPUB_MAX_IMAGES}: ${resolvedPath}`);
              const imgData = imgEntry.getData();
              if (!imgData || imgData.length === 0) {
                console.warn(`[EPUB] Image has no data: ${resolvedPath}`);
                return "";
              }
              if (imgData.length > EPUB_MAX_IMAGE_BYTES) {
                console.warn(`[EPUB] Image too large, skipped: ${resolvedPath} (${imgData.length} bytes > ${EPUB_MAX_IMAGE_BYTES})`);
                return "";
              }

              const mime = getMimeFromPath(resolvedPath);
              const dataUrl = `data:${mime};base64,${imgData.toString("base64")}`;
              const width = getTagAttr(match, "width") || "";
              const height = getTagAttr(match, "height") || "";
              const imgId = `epub_img_${imageCounter++}`;

              extractedImages[imgId] = { dataUrl, width, height };
              return `\n\n[IMG_REF:${imgId}|${width}|${height}]\n\n`;
            } catch (imgErr) {
              console.warn("EPUB image processing error:", imgErr);
              return "";
            }
          });
        }
        
        // Paragraph markers formatting
        cleanHtmlText = cleanHtmlText
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/h[1-6]>/gi, "\n\n")
          .replace(/<\/div>/gi, "\n");
        
        const plainText = cleanHtmlText.replace(/<[^>]+>/g, "");
        
        // HTML Entities normalizers
        const decodedChunk = plainText
          .replace(/&nbsp;/g, " ")
          .replace(/&#160;/g, " ")
          .replace(/&mdash;/g, "—")
          .replace(/&ndash;/g, "–")
          .replace(/&ldquo;/g, "“")
          .replace(/&rdquo;/g, "”")
          .replace(/&lsquo;/g, "‘")
          .replace(/&rsquo;/g, "’")
          .replace(/&amp;/g, "&")
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
          
        combinedText += decodedChunk + "\n\n";
        console.log(`[EPUB] Chapter ${chapterIndex + 1}/${htmlFilesOrder.length}: Successfully processed (${decodedChunk.length} chars)`);
        
        // Memory optimization: Clear large variables after processing each chapter
        htmlText = "";
        cleanHtmlText = "";
        // Force garbage collection hint for large books
        if (buffer.length > 5 * 1024 * 1024 && chapterIndex % 10 === 0) {
          console.log(`[EPUB] Memory checkpoint at chapter ${chapterIndex + 1}`);
        }
      } catch (chapterErr) {
        console.error(`[EPUB] Chapter ${chapterIndex + 1}: Error processing ${entry.entryName}`, chapterErr);
        // Continue with next chapter instead of crashing entire import
      }
    });
    
    combinedText = combinedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const result: EpubParseResult = { title, text: combinedText };
    if (includeImages && Object.keys(extractedImages).length > 0) {
      result.images = extractedImages;
      console.log(`[EPUB] Extracted ${Object.keys(extractedImages).length} images`);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[EPUB] Parsing completed in ${duration}ms. Title: "${title}", Text length: ${combinedText.length} chars`);
    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[EPUB] Parsing failed after ${duration}ms:`, err);
    throw new Error("Unable to extract epub ZIP content structures: " + err.message);
  }
}

// 5. PDF and EPUB multi-document parser and converter endpoint
app.post("/api/import-file", async (req, res) => {
  const { fileBase64, filename, fileType, importImages } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: "File data base64 is required" });
  }

  const buffer = Buffer.from(fileBase64, "base64");
  const extension = filename ? filename.split(".").pop().toLowerCase() : "";

  try {
    if (fileType === "application/pdf" || extension === "pdf") {
      let PDFParseClass: any;
      try {
        const pdfModule = await import("pdf-parse") as any;
        PDFParseClass = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse) || pdfModule.default;
      } catch (importErr) {
        console.warn("Dynamic import of 'pdf-parse' failed, trying require fallback:", importErr);
        try {
          const { createRequire } = await import("module");
          const requireFn = createRequire(import.meta.url);
          const requiredModule = requireFn("pdf-parse");
          PDFParseClass = requiredModule.PDFParse || (requiredModule.default && requiredModule.default.PDFParse) || requiredModule;
        } catch (err) {
          console.error("Fallback require of pdf-parse failed:", err);
        }
      }

      if (!PDFParseClass) {
        throw new Error("Could not resolve PDFParse constructor from pdf-parse. Please check dependency installation.");
      }

      console.log("Parsing PDF using standard PDFParse text-only extractor...");
      const parser = new PDFParseClass({ data: buffer });
      let text = "";

      try {
        const textResult = await parser.getText();
        text = textResult?.text || "";
      } finally {
        try {
          await parser.destroy();
        } catch (destroyErr) {
          console.warn("Failed to destroy PDFParse parser instance:", destroyErr);
        }
      }

      // Clean up hyphenated words at line-breaks
      text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");
      text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported PDF Document";

      // Extract images if requested (temporarily disabled due to TypeScript errors)
      // if (importImages) {
      //   console.log("Extracting images from PDF...");
      //   const imageResult = await extractImagesFromPDFBuffer(buffer);
      //   if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
      //     console.log(`Extracted ${imageResult.images.length} images from PDF`);
      //     // Insert image placeholders into text at appropriate positions
      //     const lines = text.split('\n');
      //     const imagesByPage: Record<number, typeof imageResult.images> = {};
      //     
      //     // Group images by page
      //     imageResult.images.forEach(img => {
      //       if (!imagesByPage[img.pageIndex]) {
      //         imagesByPage[img.pageIndex] = [];
      //       }
      //       imagesByPage[img.pageIndex].push(img);
      //     });

      //     // Simple heuristic: insert images at estimated line positions based on y-coordinate
      //     // Assuming average line height of 20 pixels
      //     const lineHeight = 20;
      //     const linesWithImages: string[] = [];
      //     
      //     imageResult.images.forEach(img => {
      //       const estimatedLineIndex = Math.floor(img.y / lineHeight);
      //       const imagePlaceholder = `[IMG:data:${img.mimeType};base64,${img.data}|${img.width}|${img.height}]`;
      //       
      //       // Insert image placeholder at estimated line position
      //       if (estimatedLineIndex >= 0 && estimatedLineIndex < lines.length) {
      //         lines[estimatedLineIndex] = imagePlaceholder + '\n' + lines[estimatedLineIndex];
      //       } else {
      //         // Append at end if position is out of bounds
      //         lines.push(imagePlaceholder);
      //       }
      //     });
      //     
      //     text = lines.join('\n');
      //   } else {
      //     console.log("No images extracted from PDF or extraction failed");
      //   }
      // }
      
      return res.json({ title, text });
    } else if (
      fileType === "application/epub+zip" || 
      fileType === "application/epub" || 
      extension === "epub" ||
      fileType === "application/octet-stream" && extension === "epub"
    ) {
      const parsed = parseEpub(buffer, !!importImages);
      if (!parsed.text) {
        throw new Error("Extracted text is empty. EPUB might contain scanned pages or empty chapters.");
      }
      return res.json(parsed);
    } else {
      // Treat as plain text or markdown fallback
      const textContent = buffer.toString("utf-8");
      const title = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported Document";
      return res.json({ title, text: textContent });
    }
  } catch (err: any) {
    console.error("Document parser error in /api/import-file:", err);
    return res.status(500).json({ error: "Не удалось импортировать файл: " + (err.message || err) });
  }
});

// 5b. Web Article URL importer using Gemini AI cleaned parsing
app.post("/api/import-url", async (req, res) => {
  const { url, aiProvider, localAiUrl, localAiModel } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const fetchRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch webpage. HTTP status: ${fetchRes.status}`);
    }

    const html = await fetchRes.text();

    // Extract og:image or twitter:image to use as cover URL
    let extractedCoverUrl = "";
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
                         html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogImageMatch) {
      const rawImgUrl = ogImageMatch[1];
      try {
        extractedCoverUrl = new URL(rawImgUrl, url).href;
      } catch (e) {
        extractedCoverUrl = rawImgUrl;
      }
    }

    if (aiProvider === "local") {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 45000)}
---

Return your answer strictly in JSON format with these exact keys:
- "title": creative/extracted title of the article
- "text": the cleaned text content (paragraphs separated by double newlines \\n\\n)

IMPORTANT: Do not wrap your response in markdown formatting or add any pre/post text. Return ONLY the JSON object.`;
        const data = await callLocalAi(localAiUrl, localAiModel, prompt, true);
        return res.json({
          title: data.title || "Статья с сайта",
          text: data.text || "",
          coverUrl: extractedCoverUrl || null
        });
      } catch (localErr: any) {
        console.warn("Local AI article parsing failed (falling back to offline regex parser):", localErr.message || localErr);
        // Fall through to offline regex parser below
      }
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `You are an automated article extraction and helper assistant.
Analyze the following HTML text downloaded from a webpage URL ("${url}").
1. Extract the main title of the article.
2. Extract the main readable text content of the article, removing all website navigation menus, footer lines, advertisement text, lists of unrelated links, social media buttons, cookie warnings, or unrelated sidebar widgets. Leave only the actual article text paragraphs or essay content.
3. Keep the extracted text formatted cleanly with paragraphs separated by exactly one double line-break. Do not output HTML tags, markdown headings, or translation notes unless they form part of the actual article content.

Here is the HTML content of the page:
---
${html.substring(0, 60000)}
---

Output your result as a JSON object matching this schema:
{
  "title": "extracted article title",
  "text": "cleaned paragraph 1\n\ncleaned paragraph 2\n\n..."
}`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                text: { type: Type.STRING }
              },
              required: ["title", "text"]
            }
          }
        });

        const parsed = JSON.parse(response.text || "{}");
        return res.json({
          title: parsed.title || "Статья с сайта",
          text: parsed.text || "",
          coverUrl: extractedCoverUrl || null
        });
      } catch (geminiErr: any) {
        console.warn("Gemini AI article parsing failed (falling back to offline regex parser):", geminiErr.message || geminiErr);
        // Fall through to offline regex parser below
      }
    }

    // Offline fallback: regex matching
    let title = "Статья с сайта";
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    // Simple regex cleanup
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      // Clean headers, sidebars, TOCs and navigation elements (Wikipedia & typical blogs)
      .replace(/<div[^>]*id="mw-navigation"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "")
      .replace(/<div[^>]*id="mw-panel"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*id="mw-head"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class="[^"]*vector-sidebar-container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class="[^"]*vector-header-container[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<div[^>]*class="[^"]*toc[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

    text = text
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return res.json({
      title: title,
      text: text.substring(0, 500000),
      coverUrl: extractedCoverUrl || null
    });
  } catch (err: any) {
    console.error("Web article parser error:", err);
    return res.status(500).json({ error: "Failed to parse website article: " + (err.message || err) });
  }
});

const SQLITE_DB_PATH = path.join(DATA_DIR, "local_server_db.sqlite");
const LOCAL_DB_PATH = path.join(DATA_DIR, "local_server_db.json");

let dbConns = new Map<string, Database.Database>();

function cleanWordPrefix(word: string): string {
  if (typeof word !== "string") return "";
  return word.replace(/^[a-zA-Z]+_/, "");
}

function getDbConnection(userId: string = "default") {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  let conn = dbConns.get(safeUserId);
  if (!conn) {
    const userDbPath = safeUserId === "default"
      ? SQLITE_DB_PATH
      : path.join(DATA_DIR, `local_server_db_${safeUserId}.sqlite`);
      
    // Migrate existing main SQLite database to 'rustam' user profile if they connect for the first time
    if ((safeUserId === "local_rustam" || safeUserId === "local-rustam") && !fs.existsSync(userDbPath) && fs.existsSync(SQLITE_DB_PATH)) {
      console.log("Migrating main SQLite database to user profile 'local-rustam'...");
      try {
        fs.copyFileSync(SQLITE_DB_PATH, userDbPath);
        if (fs.existsSync(SQLITE_DB_PATH + "-wal")) {
          fs.copyFileSync(SQLITE_DB_PATH + "-wal", userDbPath + "-wal");
        }
        if (fs.existsSync(SQLITE_DB_PATH + "-shm")) {
          fs.copyFileSync(SQLITE_DB_PATH + "-shm", userDbPath + "-shm");
        }
      } catch (err) {
        console.error("Failed to copy default SQLite database to local-rustam profile:", err);
      }
    }
      
    conn = new Database(userDbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    
    // Ensure all tables exist
    conn.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS languages (
        code TEXT PRIMARY KEY,
        name TEXT,
        flag TEXT
      );

      CREATE TABLE IF NOT EXISTS words (
        id TEXT PRIMARY KEY,
        language_code TEXT NOT NULL,
        word TEXT NOT NULL,
        translation TEXT,
        ipa TEXT,
        grammar TEXT,
        contextRelation TEXT,
        status TEXT NOT NULL,
        createdAt INTEGER,
        tags TEXT,
        imageUrl TEXT,
        examples TEXT,
        spellingCorrectCount INTEGER DEFAULT 0,
        spellingIncorrectCount INTEGER DEFAULT 0,
        spellingAccentCount INTEGER DEFAULT 0,
        lastSpelledCorrectly INTEGER,
        lastSpelledWithAccentError INTEGER DEFAULT 0,
        spellingExclude INTEGER DEFAULT 0,
        FOREIGN KEY(language_code) REFERENCES languages(code) ON DELETE CASCADE,
        UNIQUE(language_code, word)
      );

      CREATE TABLE IF NOT EXISTS word_links (
        language_code TEXT NOT NULL,
        word_from TEXT NOT NULL,
        word_to TEXT NOT NULL,
        PRIMARY KEY (language_code, word_from),
        FOREIGN KEY(language_code) REFERENCES languages(code) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        audioUrl TEXT,
        audioBase64 TEXT,
        targetLanguage TEXT NOT NULL,
        translationLanguage TEXT NOT NULL,
        isBuiltIn INTEGER DEFAULT 0,
        isArchived INTEGER DEFAULT 0,
        coverUrl TEXT,
        youtubeId TEXT,
        lessonType TEXT,
        pinned INTEGER DEFAULT 0,
        translationText TEXT,
        detectedPhrases TEXT,
        difficulty TEXT,
        difficultyExplanation TEXT
      );

      CREATE TABLE IF NOT EXISTS lesson_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL
      );
    `);

    if (safeUserId === "default") {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS server_users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS server_sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at INTEGER,
          FOREIGN KEY(user_id) REFERENCES server_users(id) ON DELETE CASCADE
        );
      `);
    }

    // Ensure spelling statistics columns exist in words table (safe migration)
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingCorrectCount INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingIncorrectCount INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN lastSpelledCorrectly INTEGER;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingExclude INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN spellingAccentCount INTEGER DEFAULT 0;`);
    } catch (_) {}
    try {
      conn.exec(`ALTER TABLE words ADD COLUMN lastSpelledWithAccentError INTEGER DEFAULT 0;`);
    } catch (_) {}

    // Backfill: words marked "Точно знаю" (spellingExclude=1) should also be considered
    // correctly spelled so they appear in the "Пишу правильно" deck.
    try {
      conn.exec(`
        UPDATE words
        SET lastSpelledCorrectly = 1
        WHERE spellingExclude = 1 AND (lastSpelledCorrectly IS NULL OR lastSpelledCorrectly = 0);
      `);
    } catch (_) {}

    dbConns.set(safeUserId, conn);
  }
  return conn;
}

// Function to run migration from JSON if it exists
function migrateJsonToSqliteIfNeeded() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return;
    }
    console.log("Migration: Found legacy local_server_db.json. Migrating to SQLite...");
    
    const fileContent = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    if (!fileContent.trim()) {
      return;
    }
    const data = JSON.parse(fileContent);
    const db = getDbConnection("default");

    const insertLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET flag=excluded.flag
    `);

    const ensureLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `);

    const insertWord = db.prepare(`
      INSERT OR REPLACE INTO words (
        id, language_code, word, translation, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples, spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWordLink = db.prepare(`
      INSERT OR REPLACE INTO word_links (language_code, word_from, word_to) VALUES (?, ?, ?)
    `);

    const insertLesson = db.prepare(`
      INSERT OR REPLACE INTO lessons (
        id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLessonType = db.prepare(`
      INSERT OR REPLACE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)
    `);

    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)
    `);

    db.transaction(() => {
      // 1. Language Flags
      const flags = data.languageFlags || {};
      for (const [lang, flag] of Object.entries(flags)) {
        const name = lang.charAt(0).toUpperCase() + lang.slice(1);
        insertLanguage.run(lang, name, flag as string);
      }

      // 2. Words (lingqs)
      const lingqs = data.vocab || data.lingqs || {};
      for (const [key, value] of Object.entries(lingqs)) {
        const match = key.match(/^([a-zA-Z]+)_(.*)$/);
        const lang = match ? match[1] : "english";
        const val = value as any;
        const wordVal = cleanWordPrefix(val.word || (match ? match[2] : key));
        
        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));

        insertWord.run(
          key,
          lang,
          wordVal,
          val.translation || "",
          val.ipa || "",
          val.grammar || "",
          val.contextRelation || "",
          val.status || "known",
          val.createdAt || Date.now(),
          JSON.stringify(val.tags || []),
          val.imageUrl || null,
          JSON.stringify(val.examples || []),
          val.spellingCorrectCount || 0,
          val.spellingIncorrectCount || 0,
          val.spellingAccentCount || 0,
          val.lastSpelledCorrectly !== undefined ? (val.lastSpelledCorrectly === true ? 1 : (val.lastSpelledCorrectly === false ? 0 : null)) : null,
          val.lastSpelledWithAccentError ? 1 : 0,
          val.spellingExclude ? 1 : 0
        );
      }

      // 3. Word Links
      const links = data.wordLinks || {};
      for (const [key, val] of Object.entries(links)) {
        const matchKey = key.match(/^([a-zA-Z]+)_(.*)$/);
        const matchVal = (val as string).match(/^([a-zA-Z]+)_(.*)$/);
        
        let lang = "spanish"; // fallback
        if (matchKey) {
          lang = matchKey[1];
        } else if (matchVal) {
          lang = matchVal[1];
        } else {
          // Attempt to find language by looking up in lingqs keys
          const cleanKey = cleanWordPrefix(key);
          for (const wKey of Object.keys(lingqs)) {
            const m = wKey.match(/^([a-zA-Z]+)_(.*)$/);
            if (m && m[2] === cleanKey) {
              lang = m[1];
              break;
            }
          }
        }

        const cleanFrom = cleanWordPrefix(key);
        const cleanTo = cleanWordPrefix(val as string);

        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
        insertWordLink.run(lang, cleanFrom, cleanTo);
      }

      // 4. Lessons
      const lessons = data.lessons || [];
      for (const l of lessons) {
        insertLesson.run(
          l.id,
          l.title,
          l.text,
          l.audioUrl || null,
          l.audioBase64 || null,
          l.targetLanguage,
          l.translationLanguage,
          l.isBuiltIn ? 1 : 0,
          l.isArchived ? 1 : 0,
          l.coverUrl || null,
          l.youtubeId || null,
          l.lessonType || null,
          l.pinned ? 1 : 0,
          l.translationText || null,
          JSON.stringify(l.detectedPhrases || {}),
          l.difficulty || null,
          l.difficultyExplanation || null
        );
      }

      // 5. Lesson Types
      const types = data.lessonTypes || [];
      for (const t of types) {
        insertLessonType.run(t.id, t.name, t.icon);
      }

      // 6. Stats
      if (data.listeningSeconds !== undefined) {
        insertMetadata.run("listeningSeconds", String(data.listeningSeconds));
      }
    })();

    console.log("Migration: SQLite database populated successfully.");
    
    // Rename source JSON to backup
    const backupPath = LOCAL_DB_PATH + ".bak";
    fs.renameSync(LOCAL_DB_PATH, backupPath);
    console.log(`Migration: Legacy JSON file renamed to ${backupPath}`);
  } catch (e) {
    console.error("Migration: Error migrating JSON to SQLite:", e);
  }
}

// Perform migration on module load
migrateJsonToSqliteIfNeeded();

// Read helper safely
function getLocalServerDb(userId: string = "default") {
  try {
    const db = getDbConnection(userId);
    
    // Check if db is initialized (i.e. has words or lessons)
    const wordsStmt = db.prepare("SELECT count(*) as count FROM words");
    const wordsResult = wordsStmt.get() as { count: number };
    const lessonsStmt = db.prepare("SELECT count(*) as count FROM lessons");
    const lessonsResult = lessonsStmt.get() as { count: number };

    console.log(`[getLocalServerDb] userId: "${userId}", words count: ${wordsResult.count}, lessons count: ${lessonsResult.count}`);
    
    // If we have no data at all, return null so client seeds it
    if (wordsResult.count === 0 && lessonsResult.count === 0) {
      console.log(`[getLocalServerDb] Database for "${userId}" is empty, returning null to trigger seeding.`);
      return null;
    }

    // 2. Load metadata / listeningSeconds
    const metaStmt = db.prepare("SELECT value FROM metadata WHERE key = 'listeningSeconds'");
    const listeningRow = metaStmt.get() as { value: string } | undefined;
    const listeningSeconds = listeningRow ? parseFloat(listeningRow.value) || 0 : 0;

    // 3. Load languages / flags
    const langStmt = db.prepare("SELECT code, flag FROM languages WHERE flag IS NOT NULL");
    const langRows = langStmt.all() as { code: string; flag: string }[];
    const languageFlags: Record<string, string> = {};
    for (const row of langRows) {
      languageFlags[row.code] = row.flag;
    }

    // 4. Load lessons
    const lessonsRows = db.prepare("SELECT * FROM lessons").all() as any[];
    const lessons = lessonsRows.map((l) => ({
      id: l.id,
      title: l.title,
      text: l.text,
      audioUrl: l.audioUrl,
      audioBase64: l.audioBase64,
      targetLanguage: l.targetLanguage,
      translationLanguage: l.translationLanguage,
      isBuiltIn: l.isBuiltIn === 1,
      isArchived: l.isArchived === 1,
      coverUrl: l.coverUrl,
      youtubeId: l.youtubeId,
      lessonType: l.lessonType,
      pinned: l.pinned === 1,
      translationText: l.translationText,
      detectedPhrases: l.detectedPhrases ? JSON.parse(l.detectedPhrases) : {},
      difficulty: l.difficulty,
      difficultyExplanation: l.difficultyExplanation,
    }));

    // 5. Load lesson types
    const lessonTypes = db.prepare("SELECT * FROM lesson_types").all() as any[];

    // 6. Load words (lingqs)
    const wordsRows = db.prepare("SELECT * FROM words").all() as any[];
    const lingqs: Record<string, any> = {};
    for (const w of wordsRows) {
      lingqs[w.id] = {
        word: w.word,
        translation: w.translation || "",
        ipa: w.ipa || "",
        grammar: w.grammar || "",
        contextRelation: w.contextRelation || "",
        status: w.status,
        createdAt: w.createdAt,
        tags: w.tags ? JSON.parse(w.tags) : [],
        imageUrl: w.imageUrl,
        examples: w.examples ? JSON.parse(w.examples) : [],
        spellingCorrectCount: w.spellingCorrectCount || 0,
        spellingIncorrectCount: w.spellingIncorrectCount || 0,
        spellingAccentCount: w.spellingAccentCount || 0,
        lastSpelledCorrectly: w.lastSpelledCorrectly === 1 ? true : (w.lastSpelledCorrectly === 0 ? false : null),
        lastSpelledWithAccentError: w.lastSpelledWithAccentError === 1,
        spellingExclude: w.spellingExclude === 1,
      };
    }

    // 7. Load word links (only use language-prefixed forms to prevent collisions)
    const linksRows = db.prepare("SELECT language_code, word_from, word_to FROM word_links").all() as any[];
    const wordLinks: Record<string, string> = {};
    for (const link of linksRows) {
      const lang = link.language_code;
      if (lang && lang !== "null") {
        wordLinks[`${lang}_${link.word_from}`] = `${lang}_${link.word_to}`;
      }
    }

    return {
      lessons,
      lessonTypes,
      vocab: lingqs,
      wordLinks,
      listeningSeconds,
      languageFlags,
    };
  } catch (e) {
    console.error("Error loading SQLite database data:", e);
    return null;
  }
}

// Write helper safely using a single SQLite transaction
function saveLocalServerDb(userId: string = "default", data: any) {
  try {
    console.log(`[saveLocalServerDb] Attempting to save for userId: "${userId}"`);
    console.log(`[saveLocalServerDb] Data details - lessons: ${(data.lessons || []).length}, vocab words: ${Object.keys(data.vocab || data.lingqs || {}).length}`);
    const db = getDbConnection(userId);

    const insertLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET flag=excluded.flag
    `);

    const ensureLanguage = db.prepare(`
      INSERT INTO languages (code, name, flag) VALUES (?, ?, NULL)
      ON CONFLICT(code) DO NOTHING
    `);

    const insertWord = db.prepare(`
      INSERT OR REPLACE INTO words (
        id, language_code, word, translation, ipa, grammar, contextRelation, status, createdAt, tags, imageUrl, examples, spellingCorrectCount, spellingIncorrectCount, spellingAccentCount, lastSpelledCorrectly, lastSpelledWithAccentError, spellingExclude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWordLink = db.prepare(`
      INSERT OR REPLACE INTO word_links (language_code, word_from, word_to) VALUES (?, ?, ?)
    `);

    const insertLesson = db.prepare(`
      INSERT OR REPLACE INTO lessons (
        id, title, text, audioUrl, audioBase64, targetLanguage, translationLanguage, isBuiltIn, isArchived, coverUrl, youtubeId, lessonType, pinned, translationText, detectedPhrases, difficulty, difficultyExplanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLessonType = db.prepare(`
      INSERT OR REPLACE INTO lesson_types (id, name, icon) VALUES (?, ?, ?)
    `);

    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)
    `);

    db.transaction(() => {
      // Clear all existing data to prevent orphans
      db.prepare("DELETE FROM metadata").run();
      db.prepare("DELETE FROM lesson_types").run();
      db.prepare("DELETE FROM lessons").run();
      db.prepare("DELETE FROM words").run();
      db.prepare("DELETE FROM word_links").run();
      db.prepare("DELETE FROM languages").run();

      // 1. Insert language flags
      const flags = data.languageFlags || {};
      for (const [lang, flag] of Object.entries(flags)) {
        const name = lang.charAt(0).toUpperCase() + lang.slice(1);
        insertLanguage.run(lang, name, flag as string);
      }

      // 2. Insert words (lingqs)
      const lingqs = data.vocab || data.lingqs || {};
      for (const [key, value] of Object.entries(lingqs)) {
        const match = key.match(/^([a-zA-Z]+)_(.*)$/);
        const lang = match ? match[1] : "english";
        const val = value as any;
        const wordVal = cleanWordPrefix(val.word || (match ? match[2] : key));

        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));

        insertWord.run(
          key,
          lang,
          wordVal,
          val.translation || "",
          val.ipa || "",
          val.grammar || "",
          val.contextRelation || "",
          val.status || "known",
          val.createdAt || Date.now(),
          JSON.stringify(val.tags || []),
          val.imageUrl || null,
          JSON.stringify(val.examples || []),
          val.spellingCorrectCount || 0,
          val.spellingIncorrectCount || 0,
          val.spellingAccentCount || 0,
          val.lastSpelledCorrectly !== undefined ? (val.lastSpelledCorrectly === true ? 1 : (val.lastSpelledCorrectly === false ? 0 : null)) : null,
          val.lastSpelledWithAccentError ? 1 : 0,
          val.spellingExclude ? 1 : 0
        );
      }

      // 3. Insert word links
      const links = data.wordLinks || {};
      for (const [key, val] of Object.entries(links)) {
        const matchKey = key.match(/^([a-zA-Z]+)_(.*)$/);
        const matchVal = (val as string).match(/^([a-zA-Z]+)_(.*)$/);
        
        if (!matchKey && !matchVal) {
          // Skip prefixless key/value pairs to prevent cross-language pollution
          continue;
        }

        const lang = matchKey ? matchKey[1] : matchVal![1];
        const cleanFrom = cleanWordPrefix(key);
        const cleanTo = cleanWordPrefix(val as string);

        ensureLanguage.run(lang, lang.charAt(0).toUpperCase() + lang.slice(1));
        insertWordLink.run(lang, cleanFrom, cleanTo);
      }

      // 4. Insert lessons
      const lessons = data.lessons || [];
      for (const l of lessons) {
        insertLesson.run(
          l.id,
          l.title,
          l.text,
          l.audioUrl || null,
          l.audioBase64 || null,
          l.targetLanguage,
          l.translationLanguage,
          l.isBuiltIn ? 1 : 0,
          l.isArchived ? 1 : 0,
          l.coverUrl || null,
          l.youtubeId || null,
          l.lessonType || null,
          l.pinned ? 1 : 0,
          l.translationText || null,
          JSON.stringify(l.detectedPhrases || {}),
          l.difficulty || null,
          l.difficultyExplanation || null
        );
      }

      // 5. Insert lesson types
      const types = data.lessonTypes || [];
      for (const t of types) {
        insertLessonType.run(t.id, t.name, t.icon);
      }

      // 6. Insert listeningSeconds
      if (data.listeningSeconds !== undefined) {
        insertMetadata.run("listeningSeconds", String(data.listeningSeconds));
      }
    })();

    console.log(`[saveLocalServerDb] Transaction successfully committed for userId: "${userId}"`);
    return true;
  } catch (e) {
    console.error(`[saveLocalServerDb] Error saving SQLite database for "${userId}":`, e);
    return false;
  }
}

// Helper functions for secure password hashing and verification using pbkdf2
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === originalHash;
}

// Authentication Endpoints

app.post("/api/auth/register", (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email и пароль обязательны" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = name ? String(name).trim() : cleanEmail.split("@")[0];

  console.log(`[AUTH REGISTER] Attempting to register email/login: "${cleanEmail}", name: "${cleanName}", password length: ${password.length}`);

  const db = getDbConnection("default");
  try {
    // Check if user already exists
    const existing = db.prepare("SELECT id FROM server_users WHERE email = ?").get(cleanEmail) as any;
    if (existing) {
      console.log(`[AUTH REGISTER] Registration failed: user "${cleanEmail}" already exists with ID: ${existing.id}`);
      return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
    }

    const userId = "usr_" + crypto.randomBytes(16).toString("hex");
    const pwdHash = hashPassword(password);
    const createdAt = Date.now();

    db.prepare("INSERT INTO server_users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, cleanEmail, pwdHash, cleanName, createdAt);

    console.log(`[AUTH REGISTER] User inserted successfully. ID: ${userId}, pwdHash: ${pwdHash}`);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, userId, expiresAt);

    console.log(`[AUTH REGISTER] Session created for ID ${userId}`);

    return res.json({
      token,
      user: {
        uid: userId,
        email: cleanEmail,
        displayName: cleanName
      }
    });
  } catch (err: any) {
    console.error("[AUTH REGISTER] Error:", err);
    return res.status(500).json({ error: "Ошибка при регистрации пользователя: " + err.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email и пароль обязательны" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  console.log(`[AUTH LOGIN] Attempting to login email/login: "${cleanEmail}", password length: ${password.length}`);

  const db = getDbConnection("default");

  try {
    const user = db.prepare("SELECT * FROM server_users WHERE email = ?").get(cleanEmail) as any;
    if (!user) {
      console.log(`[AUTH LOGIN] Login failed: user with email "${cleanEmail}" not found in DB`);
      return res.status(400).json({ error: "Неверный логин или пароль" });
    }

    console.log(`[AUTH LOGIN] User found in DB. ID: ${user.id}, stored password_hash: ${user.password_hash}`);

    const isValid = verifyPassword(password, user.password_hash);
    console.log(`[AUTH LOGIN] Password verification result: ${isValid}`);
    if (!isValid) {
      return res.status(400).json({ error: "Неверный логин или пароль" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare("INSERT INTO server_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, user.id, expiresAt);

    console.log(`[AUTH LOGIN] Session created for ID ${user.id}`);

    return res.json({
      token,
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.display_name
      }
    });
  } catch (err: any) {
    console.error("[AUTH LOGIN] Error:", err);
    return res.status(500).json({ error: "Ошибка авторизации: " + err.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.json({ status: "success" });
  }

  const db = getDbConnection("default");
  try {
    db.prepare("DELETE FROM server_sessions WHERE token = ?").run(token);
    return res.json({ status: "success" });
  } catch (err: any) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Ошибка при выходе: " + err.message });
  }
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Не авторизован" });
  }

  const db = getDbConnection("default");
  try {
    const session = db.prepare("SELECT * FROM server_sessions WHERE token = ? AND expires_at > ?").get(token, Date.now()) as any;
    if (!session) {
      return res.status(401).json({ error: "Сессия истекла или недействительна" });
    }

    const user = db.prepare("SELECT id, email, display_name FROM server_users WHERE id = ?").get(session.user_id) as any;
    if (!user) {
      return res.status(401).json({ error: "Пользователь не найден" });
    }

    return res.json({
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.display_name
      }
    });
  } catch (err: any) {
    console.error("Auth check error:", err);
    return res.status(500).json({ error: "Ошибка при проверке авторизации: " + err.message });
  }
});

// Middleware to verify local sync key if configured
function requireLocalSyncKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expectedKey = process.env.LOCAL_SYNC_KEY;
  if (!expectedKey) {
    return next();
  }
  const clientKey = req.headers["x-local-sync-key"] || req.query.sync_key;
  if (clientKey === expectedKey) {
    return next();
  }
  return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
}

// Helper function to verify token or sync key, returning resolved userId or throwing an error
function resolveUserId(req: express.Request): string {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (token) {
    const db = getDbConnection("default");
    const session = db.prepare("SELECT user_id FROM server_sessions WHERE token = ? AND expires_at > ?").get(token, Date.now()) as any;
    if (session) {
      console.log(`[resolveUserId] Token found and verified. userId resolved: "${session.user_id}"`);
      return session.user_id;
    }
    console.warn(`[resolveUserId] Token provided but session not found/expired in database.`);
    throw new Error("UNAUTHORIZED_TOKEN");
  }

  // Fallback to local sync key for backward compatibility/guests
  const expectedKey = process.env.LOCAL_SYNC_KEY;
  if (expectedKey) {
    const clientKey = req.headers["x-local-sync-key"] || req.query.sync_key;
    if (clientKey !== expectedKey) {
      console.warn(`[resolveUserId] Fallback sync key check failed. expected: ${expectedKey}, client: ${clientKey}`);
      throw new Error("UNAUTHORIZED_SYNC_KEY");
    }
  }

  const resolved = String(req.headers["x-local-sync-user"] || req.query.sync_user || "default");
  console.log(`[resolveUserId] Fallback active. Resolved user from header/query: "${resolved}"`);
  return resolved;
}

// API Endpoints for Local Dev Server Sync mode (PC + Tablet synchronization)
app.get("/api/server-db", (req, res) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const db = getLocalServerDb(userId);
  if (!db) {
    return res.json({ status: "empty" });
  }
  return res.json({ status: "ok", data: db });
});

app.post("/api/server-db", (req, res) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: "No data provided" });
  }

  let userId: string;
  try {
    userId = resolveUserId(req);
    console.log(`[POST /api/server-db] Resolved request to userId: "${userId}"`);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      console.warn(`[POST /api/server-db] Unauthorized token.`);
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    console.warn(`[POST /api/server-db] Unauthorized sync key.`);
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const success = saveLocalServerDb(userId, data);
  if (success) {
    return res.json({ status: "success" });
  } else {
    return res.status(500).json({ error: "Failed to write database to local SQLite storage" });
  }
});

app.delete("/api/server-db", (req, res) => {
  let userId: string;
  try {
    userId = resolveUserId(req);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_TOKEN") {
      return res.status(401).json({ error: "Сессия недействительна или истекла. Пожалуйста, войдите снова." });
    }
    return res.status(401).json({ error: "Неверный или отсутствующий ключ локальной синхронизации" });
  }

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const userDbPath = safeUserId === "default"
    ? SQLITE_DB_PATH
    : path.join(DATA_DIR, `local_server_db_${safeUserId}.sqlite`);

  try {
    const conn = dbConns.get(safeUserId);
    if (conn) {
      conn.close();
      dbConns.delete(safeUserId);
    }
    if (fs.existsSync(userDbPath)) {
      fs.unlinkSync(userDbPath);
    }
    if (fs.existsSync(userDbPath + "-wal")) {
      fs.unlinkSync(userDbPath + "-wal");
    }
    if (fs.existsSync(userDbPath + "-shm")) {
      fs.unlinkSync(userDbPath + "-shm");
    }
    return res.json({ status: "success", message: "Database file deleted successfully" });
  } catch (error) {
    console.error("Failed to delete local server db file:", error);
    return res.status(500).json({ error: "Failed to wipe local server database from computer disk" });
  }
});

// Temporary store for local Wi-Fi fast data synchronization (expires after 15 mins)
interface SyncSession {
  data: any;
  createdAt: number;
}
const localSyncSessions = new Map<string, SyncSession>();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of localSyncSessions.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      localSyncSessions.delete(code);
    }
  }
}, 5 * 60 * 1000);

// Endpoint to register local data and get a transfer PIN
app.post("/api/local-sync/share", requireLocalSyncKey, (req, res) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: "Data is required" });
  }

  // Generate a random 6-digit numeric PIN
  let pinCodeCode = "";
  for (let i = 0; i < 6; i++) {
    pinCodeCode += Math.floor(Math.random() * 10).toString();
  }

  localSyncSessions.set(pinCodeCode, {
    data,
    createdAt: Date.now()
  });

  return res.json({ code: pinCodeCode });
});

// Endpoint to retrieve data using a PIN
app.get("/api/local-sync/retrieve/:code", requireLocalSyncKey, (req, res) => {
  const { code } = req.params;
  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  const session = localSyncSessions.get(code);
  if (!session) {
    return res.status(404).json({ error: "Код не найден или срок его действия (15 мин) истек. Пожалуйста, создайте новый код на вашем ПК." });
  }

  return res.json({ data: session.data });
});

// Start server
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    let localIp = "192.168.1.171"; // fallback
    try {
      const interfaces = os.networkInterfaces();
      for (const name in interfaces) {
        const iface = interfaces[name];
        if (iface) {
          for (const alias of iface) {
            if (alias.family === "IPv4" && !alias.internal) {
              localIp = alias.address;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not detect local IP dynamically, using fallback.");
    }

    console.log(`Server is running! Access it via:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`👉 http://${localIp}:${PORT}  (локальная сеть)`);
  });
}

bootstrap();
