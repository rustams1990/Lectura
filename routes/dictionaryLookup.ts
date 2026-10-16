import { Request, Response } from "express";

// Helper for Dictionary Language Code Resolution
export function getLangCode(langName: string): string {
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
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "украинский" || norm === "українська" || norm === "український") return "uk";
  return "en";
}

// Keyless freedictionaryapi.com Fetcher
export async function fetchFreeDictionaryFromCom(word: string, langCode: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://freedictionaryapi.com/api/v1/entries/${langCode}/${encodeURIComponent(word)}?translations=true`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/1.0.1 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      return data;
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === "AbortError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn(`[FreeDictAPI] Timeout for word "${word}" (${langCode})`);
    } else {
      console.warn(`[FreeDictAPI] Failed for word "${word}":`, e?.message || e);
    }
  }
  return null;
}

// Keyless Free Dictionary API Fetcher
export async function fetchFreeDictionary(word: string, langCode: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/1.0.1 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === "AbortError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn(`[DictionaryAPI.dev] Timeout for word "${word}" (${langCode})`);
    } else {
      console.warn(`[DictionaryAPI.dev] Failed for word "${word}":`, e?.message || e);
    }
  }
  return null;
}

// Keyless Wiktionary REST Definition API Fetcher with proper User-Agent & timeout
async function fetchWiktionarySingle(word: string, lang: string = "en") {
  const cleanWord = word.trim().toLowerCase();
  const endpoint = `https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(cleanWord)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LecturaApp/1.0.1 (https://github.com/lectura; contact@lectura.local)",
        "Accept": "application/json"
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error?.name === "AbortError" || error?.code === "UND_ERR_CONNECT_TIMEOUT" || error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn(`[Wiktionary] Timeout for word "${cleanWord}" (${lang}) — skipping definition.`);
    } else {
      console.warn(`[Wiktionary] Failed to fetch "${cleanWord}" (${lang}): ${error?.message || error}`);
    }

    return null;
  }
}

export async function fetchWiktionary(word: string, langCode: string) {
  const primaryResult = await fetchWiktionarySingle(word, "en");
  if (primaryResult) return primaryResult;

  if (langCode && langCode !== "en") {
    return await fetchWiktionarySingle(word, langCode);
  }

  return null;
}

// Keyless Google Translate Fetcher
export async function fetchGoogleTranslate(text: string, fromLang: string, toLang: string, getAlternatives = false): Promise<string | null> {
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
      const nounTerms: string[] = [];
      const adjTerms: string[] = [];
      const otherTerms: string[] = [];

      if (data[1] && Array.isArray(data[1])) {
        for (const posBlock of data[1]) {
          const pos = (posBlock[0] || "").toLowerCase();
          if (posBlock && Array.isArray(posBlock[1])) {
            for (const word of posBlock[1]) {
              if (typeof word === "string" && word.trim()) {
                const clean = word.trim();
                if (pos === "noun" || pos.includes("noun") || pos.includes("существительное")) {
                  nounTerms.push(clean);
                } else if (pos === "adjective" || pos.includes("adj") || pos.includes("прилагательное")) {
                  adjTerms.push(clean);
                } else {
                  otherTerms.push(clean);
                }
              }
            }
          }
        }
      }

      if (data[5] && Array.isArray(data[5]) && data[5][0] && Array.isArray(data[5][0][2])) {
        for (const item of data[5][0][2]) {
          if (item && typeof item[0] === "string" && item[0].trim()) {
            otherTerms.push(item[0].trim());
          }
        }
      }

      const allVariants = [primary, ...nounTerms, ...adjTerms, ...otherTerms].filter(Boolean);
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const term of allVariants) {
        const lower = term.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          unique.push(term);
        }
      }

      if (unique.length > 0) {
        return unique.slice(0, 4).join(", ");
      }
    }

    return primary || null;
  } catch (e) {
    console.error("Google Translate fetch failed:", e);
  }
  return null;
}

// Keyless Multi-Dictionary Lookup (Free Dictionary API + Wiktionary REST + Google Translate)
export async function handleDictionaryExplain(req: Request, res: Response) {
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

  const isMonolingual = getLangCode(translationLanguage) === getLangCode(targetLanguage);

  if (!isMonolingual && (source === "google" || (translationLanguage && translationLanguage !== "mono"))) {
    const sourceLangCode = getLangCode(targetLanguage);
    const destLangCode = getLangCode(translationLanguage || "ru");
    const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
    if (googleTrans) {
      translation = googleTrans;
    }
  }

  if (isMonolingual || source === "free_dictionary" || source === "hybrid" || !source || (source === "google" && !translation)) {
    comDictResult = await fetchFreeDictionaryFromCom(cleanWord, langCode);
    if (!comDictResult) {
      freeDictResult = await fetchFreeDictionary(cleanWord, langCode);
    }
  }
  if (isMonolingual || source === "wiktionary" || source === "hybrid" || !source || (source === "google" && !translation)) {
    wiktionaryResult = await fetchWiktionary(cleanWord, langCode);
  }

  if (comDictResult && comDictResult.entries && Array.isArray(comDictResult.entries) && comDictResult.entries.length > 0) {
    const mainEntry = comDictResult.entries[0];
    grammar = mainEntry.partOfSpeech || "";

    if (mainEntry.pronunciations && Array.isArray(mainEntry.pronunciations)) {
      const ipaObj = mainEntry.pronunciations.find((p: any) => p.type === "ipa" && p.text);
      if (ipaObj) {
        ipa = ipaObj.text;
      }
    }

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
                  if (cleanEx && !examples.some((item) => item.text.toLowerCase() === cleanEx.toLowerCase())) {
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
    if (sourceLangCode !== destLangCode) {
      const googleTrans = await fetchGoogleTranslate(cleanWord, sourceLangCode, destLangCode, true);
      if (googleTrans) {
        translation = googleTrans;
      }
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
    word: cleanWord,
    translation,
    ipa: ipa || `[${cleanWord}]`,
    grammar: grammar || "Word",
    contextRelation,
    examples: examples.slice(0, 3)
  });
}
