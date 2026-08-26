/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ReaderSettings, ReaderToolbarVisibility, DEFAULT_TOOLBAR_VISIBILITY } from "../types";
import { Type, Sliders, Check, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../store/uiStore";

interface TextSettingsControlsProps {
  settings: ReaderSettings;
  onUpdateSettings: (settings: ReaderSettings) => void;
  compact?: boolean;
  lessonType?: string;
}

export default function TextSettingsControls({
  settings,
  onUpdateSettings,
  compact = false,
  lessonType,
}: TextSettingsControlsProps) {
  const { t } = useTranslation();
  const { bookDisplayMode, setBookDisplayMode, bookReaderView, setBookReaderView } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);

  const isBookMode = lessonType === "book";

  const activeFontFamily = isBookMode
    ? (settings.bookFontFamily || "serif")
    : (settings.fontFamily || "sans");

  const activeDisplayMode = isBookMode
    ? (settings.bookReaderViewStyle || "text")
    : (settings.readerViewStyle || "badges");

  const activeWordCardMode = isBookMode
    ? (settings.bookWordCardMode || "calm-sheet")
    : (settings.wordCardMode || "full-inspector");

  const fontSizes: ReaderSettings["fontSize"][] = ["sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
  const fonts: { id: ReaderSettings["fontFamily"]; name: string }[] = [
    { id: "sans", name: "Modern Sans" },
    { id: "serif", name: "Classic Lora Book" },
    { id: "mono", name: "Coder Mono" },
  ];

  const themes: { id: ReaderSettings["readerTheme"]; name: string; bg: string; text: string; border: string }[] = [
    { id: "default", name: "System", bg: "bg-white dark:bg-zinc-900", text: "text-zinc-800 dark:text-zinc-200", border: "border-zinc-200 dark:border-zinc-700" },
    { id: "cream", name: "Cream", bg: "bg-[#faf5eb]", text: "text-[#3d2c16]", border: "border-[#eddcb9]" },
    { id: "sepia", name: "Sepia", bg: "bg-[#f7f4eb]", text: "text-[#2c2a29]", border: "border-[#e5dec9]" },
    { id: "slate", name: "Slate", bg: "bg-slate-100/90 dark:bg-slate-900", text: "text-slate-800 dark:text-slate-100", border: "border-slate-300 dark:border-slate-800" },
  ];

  const lineHeights: { id: ReaderSettings["lineHeight"]; name: string }[] = [
    { id: "normal", name: "Standard" },
    { id: "relaxed", name: "Relaxed" },
    { id: "loose", name: "Loose" },
    { id: "extra-loose", name: "Wide (1.5x)" },
  ];

  const maxWidths: { id: ReaderSettings["maxWidth"]; name: string }[] = [
    { id: "narrow", name: "Narrow" },
    { id: "medium", name: "Medium" },
    { id: "wide", name: "Full" },
  ];

  const updateKey = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  const handleFontFamilyChange = (font: ReaderSettings["fontFamily"]) => {
    if (isBookMode) {
      onUpdateSettings({ ...settings, bookFontFamily: font });
      try {
        localStorage.setItem("lectura_book_font_family", font || "serif");
      } catch (_) {}
    } else {
      onUpdateSettings({ ...settings, fontFamily: font });
      try {
        localStorage.setItem("lectura_font_family", font || "sans");
      } catch (_) {}
    }
  };

  const handleDisplayModeChange = (mode: "badges" | "text") => {
    if (isBookMode) {
      onUpdateSettings({ ...settings, bookReaderViewStyle: mode });
      try {
        localStorage.setItem("lectura_book_reader_view_style", mode);
      } catch (_) {}
    } else {
      onUpdateSettings({ ...settings, readerViewStyle: mode });
      try {
        localStorage.setItem("lectura_reader_view_style", mode);
      } catch (_) {}
    }
  };

  const handleWordCardModeChange = (mode: WordCardMode) => {
    if (isBookMode) {
      onUpdateSettings({ ...settings, bookWordCardMode: mode });
      try {
        localStorage.setItem("lectura_book_word_card_mode", mode);
      } catch (_) {}
    } else {
      onUpdateSettings({ ...settings, wordCardMode: mode });
      try {
        localStorage.setItem("lectura_word_card_mode", mode);
      } catch (_) {}
    }
  };

  const handleDecreaseFont = () => {
    const idx = fontSizes.indexOf(settings.fontSize);
    if (idx > 0) {
      updateKey("fontSize", fontSizes[idx - 1]);
    }
  };

  const handleIncreaseFont = () => {
    const idx = fontSizes.indexOf(settings.fontSize);
    if (idx < fontSizes.length - 1) {
      updateKey("fontSize", fontSizes[idx + 1]);
    }
  };

  const toolbarVisibility: ReaderToolbarVisibility = {
    ...DEFAULT_TOOLBAR_VISIBILITY,
    ...(settings.toolbarVisibility || {}),
  };

  const updateToolbarVisibility = (key: keyof ReaderToolbarVisibility, value: boolean) => {
    updateKey("toolbarVisibility", {
      ...toolbarVisibility,
      [key]: value,
    });
  };

  return (
    <div className="relative inline-block text-left">
      <button
        id="btn-toggle-typography"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          compact
            ? "p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-xs active:scale-95 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-zinc-800"
            : "w-8 h-8 flex items-center justify-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer active:scale-95"
        }
        title={t('reader.text_settings_title', 'Text Settings')}
      >
        {compact ? (
          <>
            <Type className="w-4 h-4 text-slate-600 dark:text-zinc-300" />
            <span className="hidden sm:inline text-xs font-black">AA</span>
          </>
        ) : (
          "AA"
        )}
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 select-none">
          {/* Backdrop closer */}
          <div 
            className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-150" 
            onClick={() => setIsOpen(false)} 
          />
          
          <div className="relative w-full max-w-sm sm:max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 sm:p-6 z-10 space-y-4 animate-in zoom-in-95 duration-150 scrollbar-thin">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> {t('reader.text_appearance', 'Text Appearance')}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                {t('common.done', 'Done')}
              </button>
            </div>

            {/* Font Size adjustable panel */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">Size</span>
              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-950 p-1.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleDecreaseFont}
                  disabled={settings.fontSize === fontSizes[0]}
                  className="p-1 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                  title="Smaller text size"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-mono font-bold uppercase text-zinc-600 dark:text-zinc-400 select-none">
                  {(activeFontFamily === "serif" ? "Serif" : (activeFontFamily === "mono" ? "Mono" : "Sans"))} {settings.fontSize.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={handleIncreaseFont}
                  disabled={settings.fontSize === fontSizes[fontSizes.length - 1]}
                  className="p-1 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                  title="Larger text size"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Reading Interface (Book Focus vs Study Mode) for Books */}
            {isBookMode && (
              <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">
                  {t('reader.mode_label', 'Reading Interface')}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBookReaderView("focus");
                      handleWordCardModeChange("calm-sheet");
                      handleDisplayModeChange("text");
                      handleFontFamilyChange("serif");
                    }}
                    className={`px-2 py-2 text-[11px] rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      bookReaderView === "focus" || bookDisplayMode === "book"
                        ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                        : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    <span>📖 {t('reader.mode_book_focus', 'Book Focus')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBookReaderView("study");
                      handleWordCardModeChange("full-inspector");
                      handleDisplayModeChange("badges");
                    }}
                    className={`px-2 py-2 text-[11px] rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      bookReaderView === "study"
                        ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                        : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    <span>🎓 {t('reader.mode_study', 'Study Mode')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Font Family choosing */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">Font Style</span>
              <div className="grid grid-cols-3 gap-1">
                {fonts.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleFontFamilyChange(f.id)}
                    className={`px-1 py-2 text-[10px] rounded-lg border font-medium transition-all cursor-pointer ${
                      activeFontFamily === f.id
                        ? "bg-teal-600 border-teal-600 text-white font-bold"
                        : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    <span className={`${f.id === "sans" ? "font-sans" : f.id === "serif" ? "font-serif text-[11px]" : "font-mono"}`}>
                      {f.id === "sans" ? "Sans" : f.id === "serif" ? "Serif" : "Mono"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reader View Style: Badges vs Clean Book Text */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">{t('reader.view_style_label', 'Display Mode')}</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDisplayModeChange("badges")}
                  className={`px-2 py-2 text-[11px] rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeDisplayMode === "badges"
                      ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                      : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <span>{t('reader.view_badges', 'Badges')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDisplayModeChange("text")}
                  className={`px-2 py-2 text-[11px] rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeDisplayMode === "text"
                      ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                      : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <span>{t('reader.view_text', 'Book')}</span>
                </button>
              </div>
            </div>

            {/* Word Card Mode: Full Inspector vs Calm Sheet */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">
                {t('reader.word_card_mode_label', 'Word Card View')}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleWordCardModeChange("full-inspector")}
                  className={`px-2 py-2 text-[11px] rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                    activeWordCardMode === "full-inspector"
                      ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                      : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                  title={t('reader.card_full_inspector_title', 'Full inspector with all tags and translation providers')}
                >
                  <span className="font-extrabold">{t('reader.card_full_inspector', 'Inspector')}</span>
                  <span className="text-[9px] opacity-80 font-normal leading-none">{t('reader.card_full_inspector_sub', 'Full Inspector')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWordCardModeChange("calm-sheet")}
                  className={`px-2 py-2 text-[11px] rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                    activeWordCardMode === "calm-sheet"
                      ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                      : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                  title={t('reader.card_calm_sheet_title', 'Minimalist light card with tabs and status')}
                >
                  <span className="font-extrabold">{t('reader.card_calm_sheet', 'Calm Sheet')}</span>
                  <span className="text-[9px] opacity-80 font-normal leading-none">{t('reader.card_calm_sheet_sub', 'Minimalist')}</span>
                </button>
              </div>
            </div>

            {/* Color Readers Palette Settings */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">Background Tone</span>
              <div className="grid grid-cols-4 gap-1.5">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateKey("readerTheme", t.id)}
                    className={`h-9 w-full rounded-xl border flex items-center justify-center transition-all ${t.bg} ${t.border} ${
                      settings.readerTheme === t.id ? "ring-2 ring-teal-500 scale-105" : "hover:brightness-95 hover:scale-102"
                    }`}
                    title={t.name}
                  >
                    {settings.readerTheme === t.id && (
                      <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced adjustments: Line spacing and width */}
            <div className="grid grid-cols-2 gap-3.5 pt-1">
              {/* Line height */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Line Spacing</span>
                <select
                  value={settings.lineHeight}
                  onChange={(e) => updateKey("lineHeight", e.target.value as any)}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  {lineHeights.map((lh) => (
                    <option key={lh.id} value={lh.id}>
                      {lh.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Margins width */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Text Width</span>
                <select
                  value={settings.maxWidth}
                  onChange={(e) => updateKey("maxWidth", e.target.value as any)}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  {maxWidths.map((mw) => (
                    <option key={mw.id} value={mw.id}>
                      {mw.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sentence Spacing config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.sentence_spacing', 'Sentence Spacing')}</span>
              <select
                value={settings.sentenceSpacing || "normal"}
                onChange={(e) => updateKey("sentenceSpacing", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="normal">↔️ {t('explainer.spacing_normal', 'Normal')}</option>
                <option value="spaced">↔️ {t('explainer.spacing_spaced', 'Spaced')}</option>
                <option value="wide">↔️ {t('explainer.spacing_wide', 'Wide')}</option>
                <option value="newline">↩️ {t('explainer.spacing_newline', 'New Line')}</option>
                <option value="double-newline">↩️ {t('explainer.spacing_double_newline', 'Double New Line')}</option>
              </select>
            </div>

            {/* Segment Spacing config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.paragraph_spacing', 'Paragraph Spacing')}</span>
              <select
                value={settings.segmentSpacing || "normal"}
                onChange={(e) => updateKey("segmentSpacing", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="compact">🔽 {t('explainer.p_spacing_compact', 'Compact')}</option>
                <option value="normal">↕️ {t('explainer.p_spacing_normal', 'Normal')}</option>
                <option value="relaxed">⏬ {t('explainer.p_spacing_relaxed', 'Relaxed')}</option>
                <option value="loose">⬇️ {t('explainer.p_spacing_loose', 'Loose')}</option>
              </select>
            </div>

            {/* Page Size config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.page_size', 'Page Size')}</span>
              <select
                value={settings.pageSize || "auto"}
                onChange={(e) => updateKey("pageSize", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="auto">✨ {t('explainer.page_smart_auto', 'Smart Auto')}</option>
                <option value="all">📝 {t('explainer.page_full_text', 'Full text')}</option>
                
                <optgroup label={`📋 ${t('explainer.page_by_sentences', 'By Sentences')}`}>
                  <option value="s5">{t('explainer.s5', '5 sentences')}</option>
                  <option value="s10">{t('explainer.s10', '10 sentences')}</option>
                  <option value="s20">{t('explainer.s20', '20 sentences')}</option>
                  <option value="s30">{t('explainer.s30', '30 sentences')}</option>
                </optgroup>

                <optgroup label={`🔢 ${t('explainer.page_by_words', 'By Words')}`}>
                  <option value="w50">{t('explainer.w50', '~50 words (Micro)')}</option>
                  <option value="w100">{t('explainer.w100', '~100 words (Small Book)')}</option>
                  <option value="w250">{t('explainer.w250', '~250 words (Medium Book)')}</option>
                  <option value="w500">{t('explainer.w500', '~500 words (Large Page)')}</option>
                  <option value="w1000">{t('explainer.w1000', '~1000 words (Chapters)')}</option>
                </optgroup>

                <optgroup label={`📂 ${t('explainer.page_by_paragraphs', 'By Paragraphs')}`}>
                  <option value="p1">{t('explainer.p1', '1 paragraph')}</option>
                  <option value="p2">{t('explainer.p2', '2 paragraphs')}</option>
                  <option value="p3">{t('explainer.p3', '3 paragraphs')}</option>
                  <option value="p5">{t('explainer.p5', '5 paragraphs')}</option>
                  <option value="p10">{t('explainer.p10', '10 paragraphs')}</option>
                  <option value="p15">{t('explainer.p15', '15 paragraphs')}</option>
                  <option value="p20">{t('explainer.p20', '20 paragraphs')}</option>
                </optgroup>

                <optgroup label={`🔤 ${t('explainer.page_by_chars', 'By Characters')}`}>
                  <option value="c250">{t('explainer.c250', '~250 characters (Short CJK)')}</option>
                  <option value="c500">{t('explainer.c500', '~500 characters (Standard CJK)')}</option>
                  <option value="c1000">{t('explainer.c1000', '~1000 characters (Long CJK)')}</option>
                  <option value="c2000">{t('explainer.c2000', '~2000 characters (Full CJK page)')}</option>
                </optgroup>
              </select>
            </div>

            {/* TTS Engine config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.speech_synthesis', 'Speech Synthesis')}</span>
              <select
                value={settings.ttsEngine || "google"}
                onChange={(e) => updateKey("ttsEngine", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="google">🎙️ Google Translate TTS</option>
                <option value="browser">🔊 {t('explainer.tts_browser', 'System Synthesizer (Free, fast)')}</option>
                <option value="gemini">✨ {t('explainer.tts_gemini', 'Gemini AI Voice (Limits apply, high quality)')}</option>
              </select>
            </div>

            {/* Idiom Highlight Style config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.idiom_highlighting', 'Idioms & Phrasal Verbs Highlighting')}</span>
              <select
                value={settings.idiomHighlightStyle || "badge"}
                onChange={(e) => updateKey("idiomHighlightStyle", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="badge">🟣 {t('explainer.idiom_badge', 'Cohesive Badge')}</option>
                <option value="underline">〰️ {t('explainer.idiom_underline', 'Continuous Underline')}</option>
                <option value="icon">✨ {t('explainer.idiom_icon', 'Icon Marker')}</option>
                <option value="hover">🔍 {t('explainer.idiom_hover', 'Highlight on Hover')}</option>
              </select>
            </div>

            {/* Word Highlight Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.word_highlight', 'Word Highlight')}</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!settings.wordHighlight}
                    onChange={(e) => updateKey("wordHighlight", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* CJK Word Spacing Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    {t('explainer.cjk_word_spacing', 'Word Spacing for Asian Languages')}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-normal block leading-tight">
                    {t('explainer.cjk_word_spacing_desc', 'Adds visual spacing between words to improve readability')}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!settings.cjkWordSpacing}
                    onChange={(e) => updateKey("cjkWordSpacing", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* Auto Sentence Punctuation Split Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    {t('explainer.auto_punct_split', 'Sentence Split (., ?, !)')}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-normal block leading-tight">
                    {t('explainer.auto_punct_split_desc', 'Group text into full sentences per line')}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.autoPunctuationSplit !== false}
                    onChange={(e) => updateKey("autoPunctuationSplit", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* Show Parallel Sentence Translations Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    {t('explainer.parallel_translations', 'Parallel Translation (T)')}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-normal block leading-tight">
                    {t('explainer.parallel_translations_desc', 'Show line-by-line sentence translations under text')}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!settings.showSentenceTranslations}
                    onChange={(e) => updateKey("showSentenceTranslations", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* Show Timestamps Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    {t('explainer.show_timestamps', 'Timestamps (0:02, 0:12)')}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-normal block leading-tight">
                    {t('explainer.show_timestamps_desc', 'Show line-by-line timestamps in video and audio lessons')}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.showTimestamps === undefined ? true : (settings.showTimestamps === "false" ? false : Boolean(settings.showTimestamps))}
                    onChange={(e) => updateKey("showTimestamps", e.target.checked)}
                  />
                  <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* Reading Progress Bar Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">{t('explainer.reading_progress_bar', 'Reading Progress Bar')}</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.showProgressBar !== false}
                    onChange={(e) => updateKey("showProgressBar", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* Default Video Mode (YouTube / Video Lessons) */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                {t('explainer.default_video_mode', 'YouTube / Video View Mode')}
              </span>
              <select
                value={settings.defaultVideoViewMode || "focus"}
                onChange={(e) => updateKey("defaultVideoViewMode", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="focus">🎯 {t('explainer.video_mode_focus', 'Focus Mode (Default on mobile/tablet)')}</option>
                <option value="floating">🪟 {t('explainer.video_mode_floating', 'Floating Window (PiP)')}</option>
                <option value="off">⏹️ {t('explainer.video_mode_off', 'Closed by Default')}</option>
              </select>
            </div>

            {/* Toolbar Buttons Visibility Config */}
            <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                {t('reader.toolbar_visibility_label', 'Toolbar Buttons')}
              </span>
              <div className="space-y-2 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800">
                {/* 1. AI Hub */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_ai_hub', 'AI Hub')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showAiHub !== false}
                      onChange={(e) => updateToolbarVisibility("showAiHub", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 2. Translation */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_translation', 'Translation (T)')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showTranslation !== false}
                      onChange={(e) => updateToolbarVisibility("showTranslation", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 3. Focus Mode */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_focus_mode', 'Focus Mode')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showFocusMode !== false}
                      onChange={(e) => updateToolbarVisibility("showFocusMode", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 4. Play: Pairs */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_play_pairs', 'Play: Pairs')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showPlayPairs !== false}
                      onChange={(e) => updateToolbarVisibility("showPlayPairs", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 5. Unknown Only */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_unknown_only', 'Unknown Only')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showUnknownOnly !== false}
                      onChange={(e) => updateToolbarVisibility("showUnknownOnly", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 6. Video Window */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_video', 'Video Window Toggle')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showVideoToggle !== false}
                      onChange={(e) => updateToolbarVisibility("showVideoToggle", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 7. Display Mode (Badges / Book) */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_display_mode', 'Display Mode (Badges / Book)')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showDisplayMode !== false}
                      onChange={(e) => updateToolbarVisibility("showDisplayMode", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 8. Width (Standard / Wide / Full) */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {t('reader.tb_width_toggle', 'Width (Standard / Wide / Full)')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showWidthToggle !== false}
                      onChange={(e) => updateToolbarVisibility("showWidthToggle", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {/* 9. Timestamps Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">Timestamps Toggle Button</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toolbarVisibility.showTimestampsToggle !== false}
                      onChange={(e) => updateToolbarVisibility("showTimestampsToggle", e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
