import express from "express";
import path from "path";
import fs from "fs";
import { YoutubeTranscript } from "youtube-transcript";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import crypto from "crypto";
// import { extractImagesFromPDFBuffer } from "./src/pdfImageExtractor.js";

dotenv.config();

const app = express();
const PORT = 3000;

const AUDIO_CACHE_DIR = path.join(process.cwd(), "audio_cache");
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

const IMAGE_CACHE_DIR = path.join(process.cwd(), "image_cache");
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
      title = title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    }

    // 3. YouTube Subtitle Downloader & Metadata Parser using youtube-transcript
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

    let transcriptData: any[] = [];
    let isSuccessful = false;

    // 1. Try fetching with preferred language
    try {
      console.log(`[YouTube Subtitles] Method: youtube-transcript package. Lang: ${langCode}, Video: ${videoId}`);
      transcriptData = await YoutubeTranscript.fetchTranscript(videoId, { lang: langCode });
      if (transcriptData && transcriptData.length > 0) {
        isSuccessful = true;
      }
    } catch (errLang: any) {
      console.log(`[YouTube Subtitles] Preferred code "${langCode}" not retrieved. Proceeding to fallback.`);
    }

    // 2. Try fetching with default language
    if (!isSuccessful) {
      try {
        console.log(`[YouTube Subtitles] Retrying with default video language...`);
        transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
        if (transcriptData && transcriptData.length > 0) {
          isSuccessful = true;
        }
      } catch (errDefault: any) {
        console.log(`[YouTube Subtitles] Default video caption track not retrieved. Proceeding with generator option.`);
      }
    }

    // 3. Fallback to Gemini AI Generation if we could not retrieve any transcripts
    if (!isSuccessful || transcriptData.length === 0) {
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

    // Clean up transcript text
    const lines: string[] = [];
    for (const item of transcriptData) {
      let t = item.text || "";
      // HTML entity decode for basic punctuation
      t = t
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#10;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      let isSeconds = false;
      if (item.duration && item.duration < 100) {
        // If duration is less than 100, it's likely in seconds (usually subtitles duration is ~2-10 seconds)
        isSeconds = true;
      } else if (item.offset !== 0 && item.offset < 1000) {
        // If offset is non-zero but < 1000 (1 second), but isn't milliseconds? Actually < 1000 ms is perfectly valid.
        // It's safer to rely on duration or just fraction:
      }
      
      if (!isSeconds && item.offset.toString().includes(".")) {
        isSeconds = true;
      }

      // But to be completely bulletproof: youtube-transcript standard JSON offset is ms, XML fallback is sec.
      // Easiest is checking duration length etc. Let's just check if start includes fraction
      // But wait, the most robust check: 
      const isMs = item.duration ? item.duration > 200 : item.offset > 20000;
      const offsetSec = Math.floor(isMs ? item.offset / 1000 : item.offset);
      
      if (t) {
        lines.push(`${offsetSec}s\t${t}`);
      }
    }

    if (lines.length === 0) {
      throw new Error("No text segments found in the parsed subtitle track");
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
          .replace(/&mdash;/g, "—")
          .replace(/&ndash;/g, "–")
          .replace(/&ldquo;/g, "“")
          .replace(/&rdquo;/g, "”")
          .replace(/&lsquo;/g, "‘")
          .replace(/&rsquo;/g, "’")
          .replace(/&amp;/g, "&")
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
      .replace(/&amp;/g, "&")
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

const LOCAL_DB_PATH = path.join(process.cwd(), "local_server_db.json");

// Read helper safely
function getLocalServerDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading local server db:", e);
  }
  return null;
}

// Write helper safely
function saveLocalServerDb(data: any) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Error saving local server db:", e);
    return false;
  }
}

// API Endpoints for Local Dev Server Sync mode (PC + Tablet synchronization)
app.get("/api/server-db", (req, res) => {
  const db = getLocalServerDb();
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
  const success = saveLocalServerDb(data);
  if (success) {
    return res.json({ status: "success" });
  } else {
    return res.status(500).json({ error: "Failed to write database file to local computer disk" });
  }
});

app.delete("/api/server-db", (req, res) => {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      fs.unlinkSync(LOCAL_DB_PATH);
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
app.post("/api/local-sync/share", (req, res) => {
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
app.get("/api/local-sync/retrieve/:code", (req, res) => {
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
    console.log(`Server is running! Access it via:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`👉 http://192.168.1.171:${PORT}  (локальная сеть)`);
  });
}

bootstrap();
