import express from "express";
import path from "path";
import fs from "fs";
import { YoutubeTranscript } from "youtube-transcript";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";
import AdmZip from "adm-zip";

dotenv.config();

const app = express();
const PORT = 3000;

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

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// 1. Context-aware Translate and Explain Word
app.post("/api/explain", async (req, res) => {
  const { word, context, targetLanguage, translationLanguage } = req.body;

  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "");

  const ai = getGeminiClient();
  if (!ai) {
    // Elegant fallback simulation
    return res.json({
      translation: `[Demo Translation]`,
      ipa: `/.../`,
      grammar: "Word recognized (Offline/Demo Mode)",
      contextRelation: "You are running in demo mode. Please set your GEMINI_API_KEY under Settings > Secrets to unlock context-aware translation!",
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
    const prompt = `Translate the word "${cleanWord}" (which is inside the surrounding context: "${context || cleanWord}") from ${targetLanguage || "auto-detect"} to ${translationLanguage || "English"}.
Provide the exact IPA pronunciation of the word "${cleanWord}", its grammar/part of speech details, explanation on how it functions in this context, and 2 helpful example sentences in ${targetLanguage || "the target language"} featuring this word with translations in ${translationLanguage || "English"}.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING, description: "Translation of the word" },
            ipa: { type: Type.STRING, description: "Phonetic IPA representation of the word (e.g., [ola])" },
            grammar: { type: Type.STRING, description: "Grammatical class, part of speech or noun gender info" },
            contextRelation: { type: Type.STRING, description: "Explanation of how the word functions/means in the current sentence context" },
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
    return res.json(data);
  } catch (err: any) {
    console.error("Gemini context translation error:", err);
    return res.status(500).json({ error: err.message || "Failed to analyze word" });
  }
});

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

// 1.5. Keyless Multi-Dictionary Lookup (Free Dictionary API + Wiktionary REST)
app.post("/api/dictionary-explain", async (req, res) => {
  const { word, targetLanguage, translationLanguage, source } = req.body;

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
  if (source === "free_dictionary" || source === "hybrid" || !source) {
    // Try freedictionaryapi.com first as it has excellent coverage for Spanish, English and other languages
    comDictResult = await fetchFreeDictionaryFromCom(cleanWord, langCode);
    if (!comDictResult) {
      freeDictResult = await fetchFreeDictionary(cleanWord, langCode);
    }
  }
  if (source === "wiktionary" || source === "hybrid" || !source) {
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

  // Fallback structures if empty
  if (!translation) {
    translation = `Перевод слова не найден в выбранном локальном словаре.`;
    contextRelation = `Мы пытались найти слово "${cleanWord}" в Free Dictionary и Wiktionary, но результатов нет. Пожалуйста, используйте поиск через ИИ (AI)!`;
  } else {
    contextRelation = `Определение успешно загружено из источника: ${
      source === "free_dictionary" ? "Free Dictionary API" : source === "wiktionary" ? "Wiktionary REST API" : "Смешанный поиск (Hybrid)"
    }.`;
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
    grammar: grammar || "Word",
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
    const speechText = `Please speak the following text naturally inside the sentence context. The language is ${language || "appropriate language"}: ${text}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
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
      if (t) {
        lines.push(t);
      }
    }

    if (lines.length === 0) {
      throw new Error("No text segments found in the parsed subtitle track");
    }

    // Group lines into paragraphs of about 90 words each
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];
    let currentWordCount = 0;

    for (const line of lines) {
      currentParagraph.push(line);
      currentWordCount += line.split(/\s+/).length;
      if (currentWordCount >= 90) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
        currentWordCount = 0;
      }
    }
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(" "));
    }

    return res.json({
      title: title,
      text: paragraphs.join("\n\n"),
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
  const { title, targetLanguage } = req.body;
  if (!title || !targetLanguage) {
    return res.status(400).json({ error: "Title and targetLanguage are required" });
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

// Helper function to resolve relative paths
function resolveRelativePath(basePath: string, relativePath: string): string {
  const baseParts = basePath.split("/");
  baseParts.pop(); // remove file name
  
  const relParts = relativePath.split("/");
  for (const part of relParts) {
    if (part === "" || part === ".") {
      continue;
    } else if (part === "..") {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join("/");
}

// Helper function to extract, order, and clean text from an EPUB (ZIP archive)
function parseEpub(buffer: Buffer, includeImages: boolean = false): { title: string; text: string } {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    
    let title = "Imported EPUB Book";
    let opfEntry = entries.find(e => e.entryName.endsWith(".opf"));
    
    let htmlFilesOrder: string[] = [];
    
    if (opfEntry) {
      const opfText = opfEntry.getData().toString("utf-8");
      
      // Parse book title
      const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      if (titleMatch) {
         // simple trim and tag strip
        title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      }
      
      // Parse manifest: id -> href
      const manifestItems: Record<string, string> = {};
      const itemRegex = /<item\s+[^>]*id=["']([^"']+)["']\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = itemRegex.exec(opfText)) !== null) {
        manifestItems[match[1]] = match[2];
      }
      
      // Parse spine: exact reading order
      const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*>/gi;
      const spineIdrefs: string[] = [];
      while ((match = spineRegex.exec(opfText)) !== null) {
        spineIdrefs.push(match[1]);
      }
      
      // Get directory containing OPF to resolve relative paths
      const opfParentDir = opfEntry.entryName.includes("/") 
        ? opfEntry.entryName.substring(0, opfEntry.entryName.lastIndexOf("/"))
        : "";
      
      spineIdrefs.forEach(idref => {
        const href = manifestItems[idref];
        if (href) {
          const decodedHref = decodeURIComponent(href);
          let fullPath = decodedHref;
          if (opfParentDir) {
            if (decodedHref.startsWith("../")) {
              const cleanHref = decodedHref.replace(/^\.\.\//, "");
              if (opfParentDir.includes("/")) {
                const upperDir = opfParentDir.substring(0, opfParentDir.lastIndexOf("/"));
                fullPath = upperDir + "/" + cleanHref;
              } else {
                fullPath = cleanHref;
              }
            } else {
              fullPath = opfParentDir + "/" + decodedHref;
            }
          }
          fullPath = fullPath.replace(/\/\.\//g, "/");
          htmlFilesOrder.push(fullPath);
        }
      });
    }
    
    // Fallback: collect all xhtml/html files alphabetically if OPF structures failed
    if (htmlFilesOrder.length === 0) {
      const fallbackEntries = entries.filter(e => 
        !e.isDirectory && 
        (e.entryName.endsWith(".xhtml") || e.entryName.endsWith(".html") || e.entryName.endsWith(".htm"))
      );
      fallbackEntries.sort((a, b) => a.entryName.localeCompare(b.entryName));
      htmlFilesOrder = fallbackEntries.map(e => e.entryName);
    }
    
    // Read and merge ordered chapters text content
    let combinedText = "";
    htmlFilesOrder.forEach(path => {
      const entry = entries.find(e => 
        e.entryName === path || 
        e.entryName.endsWith(path) || 
        path.endsWith(e.entryName)
      );
      if (entry) {
        const htmlText = entry.getData().toString("utf-8");
        
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
          const getAttr = (tagStr: string, attrName: string): string => {
            const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
            const match = tagStr.match(regex);
            return match ? match[1] : "";
          };

          const imgRegex = /<(img|image)\s+([^>]+)>/gi;
          cleanHtmlText = cleanHtmlText.replace(imgRegex, (match) => {
            let srcVal = getAttr(match, "src") || getAttr(match, "href") || getAttr(match, "xlink:href");
            if (!srcVal) return "";

            srcVal = srcVal.split("#")[0];
            const resolvedPath = resolveRelativePath(entry.entryName, srcVal);

            const imgEntry = entries.find(e => {
              const eName = e.entryName.toLowerCase().replace(/^\//, "");
              const rPath = resolvedPath.toLowerCase().replace(/^\//, "");
              return eName === rPath || eName.endsWith("/" + rPath) || rPath.endsWith("/" + eName);
            });

            if (imgEntry) {
              const imgData = imgEntry.getData();
              let mime = "image/jpeg";
              const ext = resolvedPath.split(".").pop()?.toLowerCase();
              if (ext === "png") mime = "image/png";
              else if (ext === "gif") mime = "image/gif";
              else if (ext === "svg") mime = "image/svg+xml";
              else if (ext === "webp") mime = "image/webp";

              const base64Data = imgData.toString("base64");
              const dataUrl = `data:${mime};base64,${base64Data}`;

              const width = getAttr(match, "width") || "";
              const height = getAttr(match, "height") || "";

              return `\n\n[IMG:${dataUrl}|${width}|${height}]\n\n`;
            }
            return "";
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
      }
    });
    
    combinedText = combinedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
      
    return { title, text: combinedText };
  } catch (err: any) {
    console.error("parseEpub inner error:", err);
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
  const { url } = req.body;
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

    const ai = getGeminiClient();
    if (ai) {
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
        text: parsed.text || ""
      });
    } else {
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
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

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
        text: text.substring(0, 8000)
      });
    }
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
    const nextData = JSON.stringify(data, null, 2);
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const currentData = fs.readFileSync(LOCAL_DB_PATH, "utf8");
      if (currentData === nextData) {
        return true;
      }
    }

    fs.writeFileSync(LOCAL_DB_PATH, nextData, "utf8");
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
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            "**/local_server_db.json",
            "**/dist/**",
            "**/forstudio/**",
            "**/del/**",
            "**/13,06,2026*/**",
          ],
        },
      },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running! Access it via:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`👉 http://127.0.0.1:${PORT}`);
  });
}

bootstrap();
