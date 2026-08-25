import { ReaderSettings, WordCardMode } from '../types';

/**
 * Resolves the effective reader settings based on whether the active lesson is a book.
 * Books use calm-sheet, text/book view style, and serif font by default.
 * Standard lessons (video, audio, article) use full-inspector, badges, and sans font by default.
 */
export function resolveEffectiveReaderSettings(
  settings: ReaderSettings,
  lessonType?: string
): ReaderSettings {
  const isBook = lessonType === "book";

  const effectiveWordCardMode: WordCardMode = isBook
    ? (settings.bookWordCardMode || "calm-sheet")
    : (settings.wordCardMode || "full-inspector");

  const effectiveReaderViewStyle: "badges" | "text" = isBook
    ? (settings.bookReaderViewStyle || "text")
    : (settings.readerViewStyle || "badges");

  const effectiveFontFamily: "sans" | "serif" | "mono" = isBook
    ? (settings.bookFontFamily || "serif")
    : (settings.fontFamily || "sans");

  return {
    ...settings,
    wordCardMode: effectiveWordCardMode,
    readerViewStyle: effectiveReaderViewStyle,
    fontFamily: effectiveFontFamily,
  };
}

/**
 * Maps a patch of settings into the isolated scope (book vs standard).
 */
export function createScopedSettingsPatch(
  currentSettings: ReaderSettings,
  patch: Partial<ReaderSettings>,
  lessonType?: string
): ReaderSettings {
  const isBook = lessonType === "book" || currentSettings.readerViewStyle === "text";
  const next: ReaderSettings = { ...currentSettings, ...patch };

  if (isBook) {
    if (patch.wordCardMode !== undefined) {
      next.bookWordCardMode = patch.wordCardMode;
      try {
        localStorage.setItem("lectura_book_word_card_mode", patch.wordCardMode);
      } catch (_) {}
    }
    if (patch.readerViewStyle !== undefined) {
      next.bookReaderViewStyle = patch.readerViewStyle;
      try {
        localStorage.setItem("lectura_book_reader_view_style", patch.readerViewStyle);
      } catch (_) {}
    }
    if (patch.fontFamily !== undefined) {
      next.bookFontFamily = patch.fontFamily;
      try {
        localStorage.setItem("lectura_book_font_family", patch.fontFamily);
      } catch (_) {}
    }
  } else {
    if (patch.wordCardMode !== undefined) {
      next.wordCardMode = patch.wordCardMode;
      try {
        localStorage.setItem("lectura_word_card_mode", patch.wordCardMode);
      } catch (_) {}
    }
    if (patch.readerViewStyle !== undefined) {
      next.readerViewStyle = patch.readerViewStyle;
      try {
        localStorage.setItem("lectura_reader_view_style", patch.readerViewStyle);
      } catch (_) {}
    }
    if (patch.fontFamily !== undefined) {
      next.fontFamily = patch.fontFamily;
      try {
        localStorage.setItem("lectura_font_family", patch.fontFamily);
      } catch (_) {}
    }
  }

  return next;
}
