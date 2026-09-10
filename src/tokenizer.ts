/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function isCjkLanguage(lang: string = ""): boolean {
  const norm = lang.toLowerCase();
  return (
    norm.includes("ja") ||
    norm.includes("japan") ||
    norm.includes("япон") ||
    norm.includes("日本語") ||
    norm.includes("zh") ||
    norm.includes("chin") ||
    norm.includes("китай") ||
    norm.includes("中文") ||
    norm.includes("ko") ||
    norm.includes("korea") ||
    norm.includes("корей")
  );
}

export function isCjkText(text: string): boolean {
  if (!text) return false;
  const cjkChars = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  return totalChars > 0 && cjkChars / totalChars > 0.2;
}

export function getLocaleFromLanguage(lang: string = ""): string {
  const norm = lang.toLowerCase();
  if (norm.includes("ja") || norm.includes("japan") || norm.includes("япон") || norm.includes("日本語")) return "ja";
  if (norm.includes("zh") || norm.includes("chin") || norm.includes("китай") || norm.includes("中文")) return "zh";
  if (norm.includes("ko") || norm.includes("korea") || norm.includes("корей")) return "ko";
  if (norm.includes("es") || norm.includes("span") || norm.includes("испан")) return "es";
  if (norm.includes("fr") || norm.includes("fren") || norm.includes("франц")) return "fr";
  if (norm.includes("de") || norm.includes("germ") || norm.includes("немец")) return "de";
  if (norm.includes("ru") || norm.includes("russ") || norm.includes("рус")) return "ru";
  return "en";
}

export interface Token {
  raw: string;
  clean: string;
  isWord: boolean;
}

export function fuseJapaneseTokens(tokens: Token[]): Token[] {
  if (!tokens || tokens.length <= 1) return tokens;

  let currentTokens = tokens;

  // Multi-pass fusion (up to 3 passes to catch chain splits like 跳ね + ま + した)
  for (let pass = 0; pass < 3; pass++) {
    const fused: Token[] = [];
    let i = 0;
    let mergedAny = false;

    while (i < currentTokens.length) {
      let curr = currentTokens[i];

      if (i + 1 < currentTokens.length) {
        const next = currentTokens[i + 1];

        if (curr.isWord && next.isWord) {
          const cStr = curr.raw;
          const nStr = next.raw;

          let shouldFuse = false;

          // Rule 1: -ま / -で / -いま / -せんで / -まし + -した / -しょう / -す
          if (
            (nStr === "した" && (cStr.endsWith("ま") || cStr.endsWith("で") || cStr.endsWith("いま") || cStr.endsWith("せんで") || cStr.endsWith("まし") || cStr === "で" || cStr === "ま")) ||
            (nStr === "しょう" && cStr.endsWith("ま")) ||
            (nStr === "す" && (cStr.endsWith("ま") || cStr.endsWith("で"))) ||
            (nStr === "ん" && (cStr.endsWith("ませ") || cStr.endsWith("せん"))) ||
            (nStr === "でした" && (cStr.endsWith("せん") || cStr.endsWith("で")))
          ) {
            shouldFuse = true;
          }
          // Rule 2: Verb Ren'youkei or Te-form stem + -ました / -ます / -ましょう / -いました / -ています / -ていました
          else if (
            (nStr === "ました" || nStr === "ます" || nStr === "ましょう" || nStr === "いました" || nStr === "います" || nStr === "ていました") &&
            (/[いきしちにびみりえけせてねべめれ]$/.test(cStr) || cStr.endsWith("て") || cStr.endsWith("で"))
          ) {
            shouldFuse = true;
          }
          // Rule 3: -て + -い / -いた / -いる / -います / -いました
          else if (
            (cStr.endsWith("て") || cStr.endsWith("で")) &&
            (nStr === "い" || nStr === "いた" || nStr === "いる" || nStr === "います" || nStr === "いました" || nStr === "いま")
          ) {
            shouldFuse = true;
          }

          if (shouldFuse) {
            curr = {
              raw: curr.raw + next.raw,
              clean: (curr.clean + next.clean).toLowerCase(),
              isWord: true,
            };
            i++; // Skip next
            mergedAny = true;
          }
        }
      }

      fused.push(curr);
      i++;
    }

    currentTokens = fused;
    if (!mergedAny) break;
  }

  return currentTokens;
}

export function isRomanNumeral(text: string, isEnglish: boolean = false): boolean {
  if (!text) return false;
  const clean = text.replace(/^[“"'(«\[]+|[.,;:!?”"')»\]]+$/g, '').trim();
  if (!clean) return false;

  // Roman numerals MUST be strictly in uppercase in text (e.g. "IV", "VIII", "XXI", "IV.")
  // Lowercase words like "mi", "di", "vi", "ci", "id", "cl", "mix" are standard language words!
  if (clean !== clean.toUpperCase()) {
    return false;
  }

  // If single 'I' in English without Roman dot (e.g. not "I."), treat as the English pronoun "I"
  if (isEnglish && clean === "I" && !/[IVXLCDM]+\./i.test(text)) {
    return false;
  }

  // Single characters like "C", "D", "M", "V", "X", "L" without dot are letters/words, not Roman numerals
  if (clean.length === 1 && !/[IVXLCDM]\./i.test(text)) {
    return false;
  }

  // Common acronyms or short uppercase words that should not be Roman numerals unless followed by a dot
  const commonWords = new Set(["MI", "ME", "DI", "CI", "VI", "ID", "IN", "CD", "DC", "MD", "TV", "DJ", "OK", "AI"]);
  if (commonWords.has(clean) && !/[IVXLCDM]+\./i.test(text)) {
    return false;
  }

  return (
    /^[IVXLCDM]+$/.test(clean) &&
    clean.length > 0 &&
    /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(clean)
  );
}

export function isNumericOrRoman(text: string, isEnglish: boolean = false): boolean {
  if (!text) return false;
  const clean = text.replace(/^[“"'(«\[]+|[.,;:!?”"')»\]]+$/g, '').trim();
  if (!clean) return false;
  return /^\d+$/.test(clean) || isRomanNumeral(text, isEnglish);
}

export function cleanWordForLookup(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();
  // Strip leading and trailing punctuation, quotes, brackets, dashes
  clean = clean.replace(/^[^\w\p{L}\p{N}]+|[^\w\p{L}\p{N}]+$/gu, "");
  // Strip leading or trailing apostrophes/quotes: " ' “ ” ‘ ’ « » „ ‟ ‹ ›
  clean = clean.replace(/^['’"`“«»„‟‹›]+|['’"`”«»„‟‹›]+$/gu, "");
  return clean.toLowerCase();
}

export const TOKEN_REGEX = /([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\p{L}\p{N}\s]+|\s+)/gu;

export function segmentSentenceTokens(sentText: string, langName: string = ""): Token[] {
  // If the sentence is an image placeholder or caption, NEVER tokenize it into words!
  if (/^\s*\[(?:\[LECTURA_)?IMG(?:_REF)?:/i.test(sentText) || /^\s*\[(?:CAPTION:?|caption)/i.test(sentText)) {
    return [{ raw: sentText, clean: "", isWord: false }];
  }


  const isCjk = isCjkLanguage(langName) || isCjkText(sentText);

  if (isCjk) {
    const locale = getLocaleFromLanguage(langName);
    let tokens: Token[] = [];
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      try {
        const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
        const segments = Array.from(segmenter.segment(sentText));
        tokens = segments.map((s) => {
          const str = s.segment;
          const isPunct = /^[.,\/#!$%\^&\*;:{}=\-_`~()"?、。！？」『』 \t\n\r]+$/g.test(str);
          const isDigit = /^\d+$/.test(str);
          const isWord = Boolean(s.isWordLike) && !isPunct && !isDigit;
          return {
            raw: str,
            clean: isWord ? str.toLowerCase() : "",
            isWord,
          };
        });
      } catch (e) {
        console.warn("[Tokenizer] Intl.Segmenter failed, fallback to char split:", e);
      }
    }
    // Fallback if Intl.Segmenter is not supported
    if (tokens.length === 0) {
      tokens = sentText.split("").map((char) => {
        const isPunct = /[.,\/#!$%\^&\*;:{}=\-_`~()"?、。！？」『』 \t\n]/g.test(char);
        const isDigit = /^\d+$/.test(char);
        return {
          raw: char,
          clean: (isPunct || isDigit) ? "" : char,
          isWord: !isPunct && !isDigit,
        };
      });
    }

    const normLang = langName.toLowerCase();
    if (locale === "ja" || normLang.includes("ja") || normLang.includes("japan") || normLang.includes("япон") || normLang.includes("日本語") || /[\u3040-\u30ff]/.test(sentText)) {
      tokens = fuseJapaneseTokens(tokens);
    }

    return tokens;
  } else {
    const isEnglish = langName.toLowerCase().startsWith("en") || langName.toLowerCase() === "english" || langName.toLowerCase() === "английский";

    const parts = sentText.match(TOKEN_REGEX) || [];
    return parts.map((part) => {
      if (/^\s+$/.test(part)) {
        return { raw: part, clean: "", isWord: false };
      }
      if (/^[^\p{L}\p{N}\s]+$/u.test(part)) {
        return { raw: part, clean: "", isWord: false };
      }
      if (/^<[\s\/]*[a-zA-Z0-9]+[^>]*>$/i.test(part) || /^&[a-zA-Z0-9#]+;$/.test(part)) {
        return { raw: part, clean: "", isWord: false };
      }
      const clean = cleanWordForLookup(part);
      const isNumericOrTimestamp = (str: string): boolean => {
        if (!str) return false;
        if (/\d/.test(str)) {
          if (/^\d+$/.test(str)) return true;
          if (/^\d+s$/i.test(str)) return true;
          if (/^\d+([.,]\d+)?(k|p|fps|mb|gb|tb|hz|khz|mhz|ghz|m|cm|mm|km|s|sec|min|mins|h|hr|hrs|px|pt|em|rem|g|kg|mg|oz|lb|lbs|v|w|a|mah|db|st|nd|rd|th)$/i.test(str)) return true;
          if (/\d+:\d+/.test(str)) return true;
          if (/^[+-]?[\$€£¥₹₽#]?\d+([.,%/-]\d+)*%?$/.test(str)) return true;
          if (/^\d+[a-zA-Z]{1,3}$/i.test(str)) return true;
          if (!/\p{L}/u.test(str)) return true;
        }
        return false;
      };
      const isNumOrRoman = isNumericOrRoman(part, isEnglish) || isNumericOrTimestamp(clean) || /^\d+$/.test(clean);
      return {
        raw: part,
        clean: isNumOrRoman ? "" : clean,
        isWord: clean.length > 0 && !isNumOrRoman,
      };
    });
  }
}
