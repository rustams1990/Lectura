/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Cached collators for high performance sorting across large word lists
const collatorCache = new Map<string, Intl.Collator>();

/**
 * Normalizes an arbitrary language name or code to a standard BCP-47 language tag.
 */
export function normalizeLanguageToBCP47(targetLang?: string): string {
  if (!targetLang) return 'en-US';
  const norm = targetLang.toLowerCase().trim();

  if (norm === 'es' || norm.startsWith('es-') || norm.includes('spanish') || norm.includes('испан') || norm.includes('español')) {
    return 'es-ES';
  }
  if (norm === 'en' || norm.startsWith('en-') || norm.includes('english') || norm.includes('англ')) {
    return 'en-US';
  }
  if (norm === 'ru' || norm.startsWith('ru-') || norm.includes('russian') || norm.includes('русск')) {
    return 'ru-RU';
  }
  if (norm === 'de' || norm.startsWith('de-') || norm.includes('german') || norm.includes('немец') || norm.includes('deutsch')) {
    return 'de-DE';
  }
  if (norm === 'fr' || norm.startsWith('fr-') || norm.includes('french') || norm.includes('франц') || norm.includes('français')) {
    return 'fr-FR';
  }
  if (norm === 'it' || norm.startsWith('it-') || norm.includes('italian') || norm.includes('италь') || norm.includes('italiano')) {
    return 'it-IT';
  }
  if (norm === 'pt' || norm.startsWith('pt-') || norm.includes('portuguese') || norm.includes('португ') || norm.includes('português')) {
    return 'pt-PT';
  }
  if (norm === 'zh' || norm.startsWith('zh-') || norm.includes('chinese') || norm.includes('китай')) {
    return 'zh-CN';
  }
  if (norm === 'ja' || norm.startsWith('ja-') || norm.includes('japanese') || norm.includes('япон')) {
    return 'ja-JP';
  }
  if (norm === 'ko' || norm.startsWith('ko-') || norm.includes('korean') || norm.includes('корей')) {
    return 'ko-KR';
  }
  if (norm === 'tr' || norm.startsWith('tr-') || norm.includes('turkish') || norm.includes('турец')) {
    return 'tr-TR';
  }

  // Fallback to original string if it's already a valid code or en-US
  return norm.length === 2 ? norm : 'en-US';
}

/**
 * Gets or creates a cached Intl.Collator for the target language.
 */
function getCollator(targetLang: string = 'en', sensitivity: 'base' | 'accent' | 'case' | 'variant' = 'base'): Intl.Collator {
  const bcp47 = normalizeLanguageToBCP47(targetLang);
  const cacheKey = `${bcp47}_${sensitivity}`;
  
  let collator = collatorCache.get(cacheKey);
  if (!collator) {
    try {
      collator = new Intl.Collator(bcp47, {
        sensitivity,
        numeric: true,
      });
    } catch {
      collator = new Intl.Collator('en-US', {
        sensitivity,
        numeric: true,
      });
    }
    collatorCache.set(cacheKey, collator);
  }
  return collator;
}

/**
 * Universal locale-aware word comparator for sorting words in language-learning dictionaries.
 * Properly handles diacritics (á, é, í, ó, ú, ü, ñ, ç, etc.) in correct alphabetical order.
 *
 * @param a First word
 * @param b Second word
 * @param targetLang Target learning language (e.g. "es", "Spanish", "de", "fr")
 * @param direction "asc" (A-Z) or "desc" (Z-A)
 * @returns Standard comparison number (-1, 0, 1)
 */
export function compareWords(
  a: string,
  b: string,
  targetLang: string = 'en',
  direction: 'asc' | 'desc' = 'asc'
): number {
  if (a === b) return 0;
  if (!a) return direction === 'asc' ? -1 : 1;
  if (!b) return direction === 'asc' ? 1 : -1;

  const collator = getCollator(targetLang, 'base');
  const result = collator.compare(a, b);

  // If base sensitivity treats them as equal (e.g. "año" vs "ano"), do a secondary variant check
  if (result === 0) {
    const variantCollator = getCollator(targetLang, 'variant');
    const variantResult = variantCollator.compare(a, b);
    return direction === 'asc' ? variantResult : -variantResult;
  }

  return direction === 'asc' ? result : -result;
}

/**
 * Convenience helper to sort an array of objects by a string property using locale-aware collation.
 */
export function sortWordsLocale<T>(
  items: T[],
  getWord: (item: T) => string,
  targetLang: string = 'en',
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  return [...items].sort((a, b) => compareWords(getWord(a), getWord(b), targetLang, direction));
}

// Cached DisplayNames for language localization
const displayNamesCache = new Map<string, Intl.DisplayNames>();

const LANGUAGE_CODE_MAP: Record<string, string> = {
  spanish: 'es', español: 'es', castellano: 'es', es: 'es',
  english: 'en', inglés: 'en', ingles: 'en', en: 'en',
  french: 'fr', français: 'fr', francais: 'fr', fr: 'fr',
  german: 'de', deutsch: 'de', de: 'de',
  italian: 'it', italiano: 'it', it: 'it',
  portuguese: 'pt', português: 'pt', portugues: 'pt', pt: 'pt',
  russian: 'ru', русский: 'ru', ru: 'ru',
  chinese: 'zh', 中文: 'zh', 汉语: 'zh', 漢語: 'zh', zh: 'zh',
  japanese: 'ja', 日本語: 'ja', ja: 'ja',
  korean: 'ko', 한국어: 'ko', ko: 'ko',
  polish: 'pl', polski: 'pl', pl: 'pl',
  turkish: 'tr', türkçe: 'tr', turkce: 'tr', tr: 'tr',
  ukrainian: 'uk', українська: 'uk', uk: 'uk',
  kazakh: 'kk', қазақша: 'kk', kk: 'kk',
  arabic: 'ar', العربية: 'ar', ar: 'ar',
  dutch: 'nl', nederlands: 'nl', nl: 'nl',
  swedish: 'sv', svenska: 'sv', sv: 'sv',
  hindi: 'hi', हिन्दी: 'hi', hi: 'hi',
  greek: 'el', ελληνικά: 'el', el: 'el',
  hebrew: 'he', עברית: 'he', he: 'he',
  finnish: 'fi', suomi: 'fi', fi: 'fi',
  hungarian: 'hu', magyar: 'hu', hu: 'hu',
  czech: 'cs', čeština: 'cs', cestina: 'cs', cs: 'cs',
  romanian: 'ro', română: 'ro', romana: 'ro', ro: 'ro',
  vietnamese: 'vi', 'tiếng việt': 'vi', 'tieng viet': 'vi', vi: 'vi',
  persian: 'fa', فارسی: 'fa', fa: 'fa',
  norwegian: 'no', norsk: 'no', no: 'no',
  danish: 'da', dansk: 'da', da: 'da',
  bulgarian: 'bg', български: 'bg', bg: 'bg',
  serbian: 'sr', српски: 'sr', sr: 'sr',
  croatian: 'hr', hrvatski: 'hr', hr: 'hr',
  slovak: 'sk', slovenčina: 'sk', sk: 'sk',
  lithuanian: 'lt', lietuvių: 'lt', lt: 'lt',
  latvian: 'lv', latviešu: 'lv', lv: 'lv',
  estonian: 'et', eesti: 'et', et: 'et',
  indonesian: 'id', 'bahasa indonesia': 'id', id: 'id',
  thai: 'th', ไทย: 'th', th: 'th',
};

/**
 * Returns the localized name of a language for the current UI locale (e.g. "Russian" -> "Ruso" in Spanish UI, "Испанский" for "Spanish" in Russian UI).
 */
export function getLocalizedLanguageName(langInput?: string, uiLocale: string = 'en'): string {
  if (!langInput) return '';
  const trimmed = langInput.trim();
  if (trimmed === 'All' || trimmed === 'all') return trimmed;

  const lookupKey = trimmed.toLowerCase();
  const code = LANGUAGE_CODE_MAP[lookupKey] || (trimmed.length === 2 ? lookupKey : null);

  try {
    const normLocale = uiLocale || 'en';
    let displayNames = displayNamesCache.get(normLocale);
    if (!displayNames) {
      displayNames = new Intl.DisplayNames([normLocale], { type: 'language' });
      displayNamesCache.set(normLocale, displayNames);
    }
    
    if (code) {
      const name = displayNames.of(code);
      if (name && name.toLowerCase() !== code.toLowerCase()) {
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
    } else {
      const name = displayNames.of(trimmed);
      if (name && name.toLowerCase() !== trimmed.toLowerCase()) {
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
  } catch (e) {
    // fallback
  }

  return trimmed;
}


