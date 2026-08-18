/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const CODE_TO_CANONICAL_NAME: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  pl: "Polish",
  tr: "Turkish",
  uk: "Ukrainian",
  kk: "Kazakh",
  ar: "Arabic",
  nl: "Dutch",
  sv: "Swedish",
  hi: "Hindi",
  el: "Greek",
  he: "Hebrew",
  fi: "Finnish",
  hu: "Hungarian",
  cs: "Czech",
  ro: "Romanian",
  vi: "Vietnamese",
  fa: "Persian",
};

export function getLanguageCode(languageName?: string | null): string {
  const norm = (languageName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "английский" || norm === "english" || norm === "inglés" || norm === "ingles") return "en";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "испанский" || norm === "spanish" || norm === "español") return "es";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "французский" || norm === "french" || norm === "français") return "fr";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "немецкий" || norm === "german" || norm === "deutsch") return "de";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "итальянский" || norm === "italian" || norm === "italiano") return "it";
  if (norm.startsWith("ru") || norm === "русский" || norm === "russian") return "ru";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "португальский" || norm === "portuguese" || norm === "português") return "pt";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "турецкий" || norm === "turkish" || norm === "türkçe") return "tr";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "японский" || norm === "japanese" || norm === "日本語") return "ja";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "китайский" || norm === "chinese" || norm === "中文") return "zh";
  if (norm.startsWith("ar") || norm === "арабский" || norm === "arabic" || norm === "العربية") return "ar";
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "украинский" || norm === "українська" || norm === "український" || norm === "ukrainian") return "uk";
  if (norm.startsWith("kk") || norm.startsWith("kaz") || norm === "казахский" || norm === "қазақша" || norm === "қазақ тілі" || norm === "kazakh") return "kk";
  if (norm.startsWith("pl") || norm === "польский" || norm === "polish" || norm === "polski") return "pl";
  if (norm.startsWith("ko") || norm === "корейский" || norm === "korean" || norm === "한국어") return "ko";
  if (norm.length >= 2 && /^[a-z]+$/.test(norm.substring(0, 2))) {
    return norm.substring(0, 2);
  }
  return "en";
}

/**
 * Resolves the dynamic translation target language with hierarchical fallback:
 * 1. Pinned Target Language (if user pinned a default translation language)
 * 2. Book Target Language (explicit translation language on the book/lesson, if different from study language)
 * 3. UI Language (current active i18n interface language)
 * 4. Fallback ("es" / "Spanish" if studying English, otherwise "en" / "English")
 */
export function resolveTargetLanguage(
  studyLang: string,
  bookTargetLang?: string | null,
  pinnedTargetLang?: string | null,
  uiLanguage: string = 'en'
): string {
  // 1. Priority to user-pinned translation language
  if (pinnedTargetLang && pinnedTargetLang.trim()) {
    return pinnedTargetLang.trim();
  }

  // 2. Book translation language set in the book (if defined and different from study language)
  if (bookTargetLang && bookTargetLang.trim()) {
    const codeBook = getLanguageCode(bookTargetLang);
    const codeStudy = getLanguageCode(studyLang);
    if (codeBook && codeBook !== codeStudy) {
      return bookTargetLang.trim();
    }
  }

  // 3. UI Language of Lectura
  const baseUiLang = (uiLanguage || 'en').split('-')[0].toLowerCase();
  const baseStudyLang = getLanguageCode(studyLang);

  if (baseUiLang && baseUiLang !== baseStudyLang) {
    const canonicalName = CODE_TO_CANONICAL_NAME[baseUiLang];
    return canonicalName || baseUiLang;
  }

  // 4. Safe fallback if study language matches UI language
  return baseStudyLang === 'en' ? 'Spanish' : 'English';
}
