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

export function cleanWordForLookup(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();
  // Strip leading and trailing punctuation, quotes, brackets, dashes
  clean = clean.replace(/^[^\w\p{L}\p{N}]+|[^\w\p{L}\p{N}]+$/gu, "");
  // Strip leading or trailing apostrophes/quotes
  clean = clean.replace(/^['’"`“«»]+|['’"`”«»]+$/gu, "");
  return clean.toLowerCase();
}

export function segmentSentenceTokens(sentText: string, langName: string = ""): Token[] {
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
    // 1. Separate fused punctuation and quotes/words without space (e.g. wrong,“both -> wrong, “both)
    let normalizedText = sentText
      .replace(/([,.:;!?])(["“«])/g, "$1 $2")
      .replace(/([”"»])([\p{L}\p{N}«“])/gu, "$1 $2")
      .replace(/([.,!?:;…»”\)])([\p{L}\p{N}«“])/gu, "$1 $2");

    // 2. Normalize whitespace around punctuation and preserve contractions
    normalizedText = normalizedText
      .replace(/[\s\u00A0\u200B]+([.,!?:;…»\)'"”\u2019\u201d\u2026\]\}]+)/g, "$1")
      .replace(/([«\(\[\{“\u2018\u201c])[\s\u00A0\u200B]+/g, "$1")
      .replace(/([\p{L}\p{N}])[\s\u00A0\u200B]+(['’])[\s\u00A0\u200B]*([\p{L}\p{N}])/gu, "$1$2$3")
      .replace(/([“"«])[\s\u00A0\u200B]+/g, "$1")
      .replace(/[\s\u00A0\u200B]+([”"»])/g, "$1");

    normalizedText = normalizedText.replace(/\s+([.,!?:;’”"»\)\]\}])/g, "$1");
    normalizedText = normalizedText.replace(/([.,!?:;…])(?=[\p{L}\p{N}«“])/gu, "$1 ");

    const parts = normalizedText.split(/(\s+)/);
    return parts.map((part) => {
      if (/^\s+$/.test(part)) {
        return { raw: part, clean: "", isWord: false };
      }
      const clean = cleanWordForLookup(part);
      const isNumericOrTimestamp = (str: string): boolean => {
        if (/\d/.test(str)) {
          if (/\d+:\d+/.test(str)) return true;
          if (/^\d+([.,%/-]\d+)*%?$/.test(str)) return true;
          if (/^\d+[a-zA-Z]+$/.test(str)) return true;
          if (!/\p{L}/u.test(str)) return true;
        }
        return false;
      };
      const isNumeric = /^\d+$/.test(clean) || isNumericOrTimestamp(clean);
      return {
        raw: part,
        clean: clean,
        isWord: clean.length > 0 && !isNumeric,
      };
    });
  }
}
