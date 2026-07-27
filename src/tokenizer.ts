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

export function segmentSentenceTokens(sentText: string, langName: string = ""): Token[] {
  const isCjk = isCjkLanguage(langName) || isCjkText(sentText);

  if (isCjk) {
    const locale = getLocaleFromLanguage(langName);
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      try {
        const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
        const segments = Array.from(segmenter.segment(sentText));
        return segments.map((s) => {
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
    return sentText.split("").map((char) => {
      const isPunct = /[.,\/#!$%\^&\*;:{}=\-_`~()"?、。！？」『』 \t\n]/g.test(char);
      const isDigit = /^\d+$/.test(char);
      return {
        raw: char,
        clean: (isPunct || isDigit) ? "" : char,
        isWord: !isPunct && !isDigit,
      };
    });
  } else {
    const parts = sentText.split(/(\s+)/);
    return parts.map((part) => {
      if (/^\s+$/.test(part)) {
        return { raw: part, clean: "", isWord: false };
      }
      const clean = part.replace(/^[^\w\p{L}]+|[^\w\p{L}]+$/gu, "");
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
        clean: clean.toLowerCase(),
        isWord: clean.length > 0 && !isNumeric,
      };
    });
  }
}
