import { ReaderSettings, Lesson, WordCardMode, DEFAULT_READER_SETTINGS } from '../types';

/**
 * Clean typed predicate to check if a lesson is a Book (EPUB / PDF / Book type).
 */
export function isBookLesson(lesson?: Partial<Lesson> | null): boolean {
  if (!lesson) return false;
  return (
    lesson.lessonType === "book" ||
    lesson.sourceType === "book" ||
    Boolean(lesson.epub) ||
    Boolean(lesson.pdf)
  );
}

export const checkIsBookLesson = isBookLesson;

/**
 * Resolves the effective reader settings based on whether the active lesson is a book.
 * Incorporates cascading fallbacks: book setting -> book default -> global setting.
 */
export function resolveEffectiveReaderSettings(
  settings: ReaderSettings,
  lessonOrIsBook?: Partial<Lesson> | boolean | string | null
): ReaderSettings {
  const isBook = typeof lessonOrIsBook === "boolean"
    ? lessonOrIsBook
    : typeof lessonOrIsBook === "string"
    ? lessonOrIsBook === "book"
    : isBookLesson(lessonOrIsBook);

  if (isBook) {
    return {
      ...settings,
      fontSize: settings.bookFontSize ?? DEFAULT_READER_SETTINGS.bookFontSize ?? settings.fontSize,
      lineHeight: settings.bookLineHeight ?? DEFAULT_READER_SETTINGS.bookLineHeight ?? settings.lineHeight,
      fontFamily: settings.bookFontFamily ?? DEFAULT_READER_SETTINGS.bookFontFamily ?? "serif",
      readerTheme: settings.bookReaderTheme ?? DEFAULT_READER_SETTINGS.bookReaderTheme ?? settings.readerTheme,
      maxWidth: settings.bookMaxWidth ?? DEFAULT_READER_SETTINGS.bookMaxWidth ?? settings.maxWidth,
      pageSize: settings.bookPageSize ?? DEFAULT_READER_SETTINGS.bookPageSize ?? settings.pageSize ?? "auto",
      sentenceSpacing: settings.bookSentenceSpacing ?? DEFAULT_READER_SETTINGS.bookSentenceSpacing ?? settings.sentenceSpacing ?? "normal",
      segmentSpacing: settings.bookSegmentSpacing ?? DEFAULT_READER_SETTINGS.bookSegmentSpacing ?? settings.segmentSpacing ?? "normal",
      readerViewStyle: settings.bookReaderViewStyle ?? DEFAULT_READER_SETTINGS.bookReaderViewStyle ?? "text",
      wordCardMode: settings.bookWordCardMode ?? DEFAULT_READER_SETTINGS.bookWordCardMode ?? "calm-sheet",
    };
  }

  return {
    ...settings,
    fontSize: settings.fontSize ?? DEFAULT_READER_SETTINGS.fontSize ?? "base",
    lineHeight: settings.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight ?? "relaxed",
    fontFamily: settings.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily ?? "sans",
    readerTheme: settings.readerTheme ?? DEFAULT_READER_SETTINGS.readerTheme ?? "default",
    maxWidth: settings.maxWidth ?? DEFAULT_READER_SETTINGS.maxWidth ?? "wide",
    pageSize: settings.pageSize ?? DEFAULT_READER_SETTINGS.pageSize ?? "auto",
    sentenceSpacing: settings.sentenceSpacing ?? DEFAULT_READER_SETTINGS.sentenceSpacing ?? "normal",
    segmentSpacing: settings.segmentSpacing ?? DEFAULT_READER_SETTINGS.segmentSpacing ?? "normal",
    readerViewStyle: settings.readerViewStyle ?? DEFAULT_READER_SETTINGS.readerViewStyle ?? "badges",
    wordCardMode: settings.wordCardMode ?? DEFAULT_READER_SETTINGS.wordCardMode ?? "full-inspector",
  };
}

/**
 * Maps a single generic reader setting property (e.g. "fontSize", "readerTheme", "maxWidth")
 * into its scoped patch for either book mode or standard mode.
 */
export function getScopedSettingPatch<K extends keyof ReaderSettings>(
  key: K,
  value: ReaderSettings[K],
  isBook: boolean
): Partial<ReaderSettings> {
  if (isBook) {
    switch (key) {
      case "fontSize":
        return { bookFontSize: value as any };
      case "fontFamily":
        return { bookFontFamily: value as any };
      case "readerTheme":
        return { bookReaderTheme: value as any };
      case "lineHeight":
        return { bookLineHeight: value as any };
      case "maxWidth":
        return { bookMaxWidth: value as any };
      case "readerViewStyle":
        return { bookReaderViewStyle: value as any };
      case "wordCardMode":
        return { bookWordCardMode: value as any };
      case "pageSize":
        return { bookPageSize: value as any };
      case "sentenceSpacing":
        return { bookSentenceSpacing: value as any };
      case "segmentSpacing":
        return { bookSegmentSpacing: value as any };
      default:
        return { [key]: value };
    }
  } else {
    return { [key]: value };
  }
}

/**
 * Maps a patch of settings into the isolated scope (book vs standard)
 * and mirrors changed values to the appropriate localStorage keys.
 */
export function createScopedSettingsPatch(
  currentSettings: ReaderSettings,
  patch: Partial<ReaderSettings>,
  lessonOrIsBook?: Partial<Lesson> | boolean | string | null
): ReaderSettings {
  const isBook = typeof lessonOrIsBook === "boolean"
    ? lessonOrIsBook
    : typeof lessonOrIsBook === "string"
    ? lessonOrIsBook === "book"
    : isBookLesson(lessonOrIsBook);

  const next: ReaderSettings = { ...currentSettings };

  for (const [rawKey, val] of Object.entries(patch)) {
    const key = rawKey as keyof ReaderSettings;
    const scopedPatch = getScopedSettingPatch(key, val as any, isBook);
    Object.assign(next, scopedPatch);

    // Mirror to localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        if (isBook) {
          if (key === "fontSize") localStorage.setItem("lectura_book_font_size", String(val));
          if (key === "fontFamily") localStorage.setItem("lectura_book_font_family", String(val));
          if (key === "readerTheme") {
            localStorage.setItem("lectura_book_reader_theme", String(val));
            localStorage.setItem("lectura_book_theme", String(val));
          }
          if (key === "lineHeight") localStorage.setItem("lectura_book_line_height", String(val));
          if (key === "maxWidth") localStorage.setItem("lectura_book_text_width", String(val));
          if (key === "readerViewStyle") localStorage.setItem("lectura_book_reader_view_style", String(val));
          if (key === "wordCardMode") localStorage.setItem("lectura_book_word_card_mode", String(val));
        } else {
          if (key === "fontSize") localStorage.setItem("lectura_reader_font_size", String(val));
          if (key === "fontFamily") localStorage.setItem("lectura_font_family", String(val));
          if (key === "readerTheme") localStorage.setItem("lectura_reader_theme", String(val));
          if (key === "lineHeight") localStorage.setItem("lectura_line_height", String(val));
          if (key === "maxWidth") localStorage.setItem("lectura_reader_typography_width", String(val));
          if (key === "readerViewStyle") localStorage.setItem("lectura_reader_view_style", String(val));
          if (key === "wordCardMode") localStorage.setItem("lectura_word_card_mode", String(val));
        }
      }
    } catch (_) {}
  }

  return next;
}
