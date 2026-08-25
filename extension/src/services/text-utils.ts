/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Shared Text & Token utilities for Lectura Extension
 * Aligned directly with Lectura web app tokenizer rules
 */

/**
 * Checks if token is a valid Roman numeral
 */
export function isRomanNumeral(text: string, isEnglish: boolean = false): boolean {
  if (!text) return false;
  const clean = text.replace(/^[“"'(«\[$€£¥₹₽#]+|[.,;:!?”"')»\]%]+$/g, '').trim();
  if (!clean) return false;
  // If single 'I' in English without Roman dot (e.g. not "I."), treat as the English pronoun "I"
  if (isEnglish && clean.toUpperCase() === 'I' && !/[IVXLCDM]+\./i.test(text)) {
    return false;
  }
  return (
    /^[IVXLCDM]+$/i.test(clean) &&
    clean.length > 0 &&
    /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i.test(clean)
  );
}

/**
 * Cleans punctuation from edges of words while strictly preserving all accents and diacritics
 */
export function cleanWordForLookup(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();
  // Strip leading and trailing punctuation, quotes, brackets, dashes, symbols
  clean = clean.replace(/^[^\w\p{L}\p{N}]+|[^\w\p{L}\p{N}]+$/gu, '');
  // Strip leading or trailing apostrophes/quotes
  clean = clean.replace(/^['’"`“«»]+|['’"`”«»]+$/gu, '');
  return clean.toLowerCase();
}

/**
 * Checks if a token is purely numeric, timestamp, currency amount, numbers with suffixes (4s, 90s, 1080p, 4k, 60fps), or non-word symbols
 */
export function isNumericOrSymbolToken(str: string): boolean {
  if (!str) return true;
  const clean = str.replace(/^[^\w\p{L}\p{N}]+|[^\w\p{L}\p{N}]+$/gu, '').trim();
  if (!clean) return true;

  // Must contain at least one letter (Unicode letter category \p{L})
  if (!/\p{L}/u.test(clean)) return true;

  // Pure digits: 4, 70, 1999
  if (/^\d+$/.test(clean)) return true;

  // Numbers with plural/decade 's' suffix: 4s, 70s, 80s, 90s, 1990s, 2000s
  if (/^\d+s$/i.test(clean)) return true;

  // Numbers with ordinals or common technical/measurement/time units:
  // e.g. 1st, 2nd, 3rd, 4th, 4k, 8k, 1080p, 720p, 60fps, 120hz, 500mb, 4gb, 1tb, 50kg, 100m, 5min, 2h, 30sec, 120px, 16pt, 2em
  if (/^\d+([.,]\d+)?(k|p|fps|mb|gb|tb|hz|khz|mhz|ghz|m|cm|mm|km|s|sec|min|mins|h|hr|hrs|px|pt|em|rem|g|kg|mg|oz|lb|lbs|v|w|a|mah|db|st|nd|rd|th)$/i.test(clean)) {
    return true;
  }

  // Any number-prefixed alphanumeric token (e.g. 3d, 4g, 5g, 2x, 10x, 34a, 12b)
  if (/^\d+[a-zA-Z]{1,3}$/i.test(clean)) {
    return true;
  }

  // Timestamps: 12:30, 01:45:00
  if (/^\d+:\d+/.test(clean)) return true;

  // Numeric amounts with symbols/percentages: $70, 100%, 3.14, 1,000, 50-60, +45, -10
  if (/^[+-]?[\$€£¥₹₽#]?\d+([.,%/-]\d+)*%?$/.test(clean)) return true;

  return false;
}

/**
 * Returns true only if the string is a valid study word token (not a number, symbol, or punctuation)
 */
export function isWordToken(token: string, isEnglish: boolean = false): boolean {
  if (!token || !token.trim()) return false;
  const clean = cleanWordForLookup(token);
  if (!clean || clean.length === 0) return false;
  if (isNumericOrSymbolToken(token) || isNumericOrSymbolToken(clean)) return false;
  if (isRomanNumeral(token, isEnglish) || isRomanNumeral(clean, isEnglish)) return false;
  return true;
}
