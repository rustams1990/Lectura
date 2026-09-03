/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, startTransition } from "react";
import { createPortal } from "react-dom";
import { ReaderSettings, ReaderToolbarVisibility, DEFAULT_TOOLBAR_VISIBILITY, WordCardViewType, normalizeWordCardView } from "../types";
import { Type, Sliders, Check, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../store/uiStore";
import { useSettingsStore } from "../store/settingsStore";
import { useAppearanceStore, debounceAppearanceSync, registerAppearanceSyncCallback } from "../store/useAppearanceStore";

interface TextSettingsControlsProps {
  settings: ReaderSettings;
  onUpdateSettings: (settings: ReaderSettings) => void;
  compact?: boolean;
  lessonType?: string;
  buttonClassName?: string;
}

export default function TextSettingsControls({
  settings,
  onUpdateSettings,
  compact = false,
  lessonType,
  buttonClassName,
}: TextSettingsControlsProps) {
  const { t } = useTranslation();
  const bookDisplayMode = useUIStore((s) => s.bookDisplayMode);
  const setBookDisplayMode = useUIStore((s) => s.setBookDisplayMode);
  const bookReaderView = useUIStore((s) => s.bookReaderView);
  const setBookReaderView = useUIStore((s) => s.setBookReaderView);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"appearance" | "reading" | "toolbar">("appearance");

  const isBookMode = lessonType === "book";

  const appearance = useAppearanceStore();

  useEffect(() => {
    registerAppearanceSyncCallback((patch) => {
      onUpdateSettings({ ...settings, ...patch });
    });
  }, [settings, onUpdateSettings]);

  const activeFontFamily = isBookMode
    ? (appearance.fontFamily || settings.bookFontFamily || "serif")
    : (appearance.fontFamily || settings.fontFamily || "sans");

  const activeDisplayMode = isBookMode
    ? (appearance.readerViewStyle || settings.bookReaderViewStyle || "text")
    : (appearance.readerViewStyle || settings.readerViewStyle || "badges");

  const activeFontSize = appearance.fontSize || settings.fontSize || "lg";
  const activeLineHeight = appearance.lineHeight || settings.lineHeight || "loose";
  const activeTheme = appearance.readerTheme || settings.readerTheme || "default";
  const activeMaxWidth = appearance.maxWidth || settings.maxWidth || "wide";

  const rawWordCardMode = isBookMode
    ? (settings.bookWordCardMode || settings.wordCardMode || "floating")
    : (settings.wordCardMode || "floating");
  const activeWordCardView: WordCardViewType = normalizeWordCardView(rawWordCardMode);

  const fontSizes: ReaderSettings["fontSize"][] = ["sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
  const fontSizeLabels: Record<ReaderSettings["fontSize"], string> = {
    sm: "85%",
    base: "100%",
    lg: "115%",
    xl: "130%",
    "2xl": "150%",
    "3xl": "175%",
    "4xl": "200%",
  };
  const activeFontSizeIndex = Math.max(0, fontSizes.indexOf(activeFontSize));

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Number(e.target.value);
    const next = fontSizes[idx];
    if (next) {
      useAppearanceStore.getState().setFontSize(next);
      debounceAppearanceSync({ fontSize: next });
    }
  };
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
    debounceAppearanceSync({ [key]: value });
  };

  const handleFontFamilyChange = (font: ReaderSettings["fontFamily"]) => {
    useAppearanceStore.getState().setFontFamily(font);
    debounceAppearanceSync({ [isBookMode ? "bookFontFamily" : "fontFamily"]: font });
  };

  const handleDisplayModeChange = (mode: "badges" | "text") => {
    useAppearanceStore.getState().setReaderViewStyle(mode);
    debounceAppearanceSync({ [isBookMode ? "bookReaderViewStyle" : "readerViewStyle"]: mode });
  };

  const handleThemeChange = (theme: ReaderSettings["readerTheme"]) => {
    useAppearanceStore.getState().setReaderTheme(theme);
    debounceAppearanceSync({ readerTheme: theme });
  };

  const handleLineHeightChange = (lh: ReaderSettings["lineHeight"]) => {
    useAppearanceStore.getState().setLineHeight(lh);
    debounceAppearanceSync({ lineHeight: lh });
  };

  const handleMaxWidthChange = (w: ReaderSettings["maxWidth"]) => {
    useAppearanceStore.getState().setMaxWidth(w);
    debounceAppearanceSync({ maxWidth: w });
  };

  const handleWordCardModeChange = (mode: string) => {
    startTransition(() => {
      useSettingsStore.getState().setWordCardMode(mode as any);
      onUpdateSettings({
        ...settings,
        wordCardMode: mode as any,
        bookWordCardMode: mode as any,
      });
      try {
        localStorage.setItem("lectura_word_card_mode", mode);
        localStorage.setItem("lectura_book_word_card_mode", mode);
      } catch (_) {}
    });
  };

  const handleDecreaseFont = () => {
    const idx = fontSizes.indexOf(activeFontSize);
    if (idx > 0) {
      const next = fontSizes[idx - 1];
      useAppearanceStore.getState().setFontSize(next);
      debounceAppearanceSync({ fontSize: next });
    }
  };

  const handleIncreaseFont = () => {
    const idx = fontSizes.indexOf(activeFontSize);
    if (idx < fontSizes.length - 1) {
      const next = fontSizes[idx + 1];
      useAppearanceStore.getState().setFontSize(next);
      debounceAppearanceSync({ fontSize: next });
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
          buttonClassName || (
            compact
              ? "p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-xs active:scale-95 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-zinc-800"
              : "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
          )
        }
        title={t('reader.text_appearance', 'Text Appearance')}
        aria-label={t('reader.text_settings_title', 'Text Settings')}
      >
        {compact ? (
          <>
            <Type className="w-4 h-4 text-slate-600 dark:text-zinc-300" />
            <span className="hidden sm:inline text-xs font-black">AA</span>
          </>
        ) : (
          <span className="font-semibold text-xs tracking-tight leading-none select-none">
            AA
          </span>
        )}
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 select-none">
          {/* Backdrop closer */}
          <div 
            className="fixed inset-0 bg-black/50 dark:bg-black/70 animate-in fade-in duration-150" 
            onClick={() => setIsOpen(false)} 
          />
          
          <div 
            className="relative w-full max-w-sm sm:max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl z-10 animate-in zoom-in-95 duration-150 overflow-hidden contain-content will-change-transform"
            style={{ transform: "translateZ(0)" }}
          >
            {/* 1. Modal Top Bar: Title & Done */}
            <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{t('reader.settings_title', 'Reader Settings')}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 px-3 py-1 rounded-lg transition-colors cursor-pointer"
              >
                {t('common.done', 'Done')}
              </button>
            </div>

            {/* 2. Navigation Tabs */}
            <div className="shrink-0 flex border-b border-zinc-100 dark:border-zinc-800 px-4 sm:px-6 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("appearance")}
                className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "appearance"
                    ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <span>{t('reader.tab_appearance', 'Appearance')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("reading")}
                className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "reading"
                    ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <span>{t('reader.tab_reading_parsing', 'Reading & Parsing')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("toolbar")}
                className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "toolbar"
                    ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <span>{t('reader.tab_layout_toolbar', 'Layout & Toolbar')}</span>
              </button>
            </div>

            {/* 3. Tab Body Container */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 scrollbar-thin">

              {/* ─────────────────────────────────────────────────────────────
                  TAB 1: APPEARANCE (Typography, Colors, Spacing, Display)
                 ───────────────────────────────────────────────────────────── */}
              {activeTab === "appearance" && (
                <div className="space-y-4.5 animate-in fade-in duration-150">
                  {/* Section Title */}
                  <div className="flex items-center justify-between pb-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('reader.section_typography', 'Typography')}
                    </span>
                  </div>

                  {/* 1. Font Size Slider with % and buttons */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                        {t('reader.font_size', 'Font Size')}
                      </span>
                      <span className="text-[10px] font-extrabold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 rounded-md border border-teal-200/50 dark:border-teal-900/40 font-mono">
                        {fontSizeLabels[activeFontSize] || "115%"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDecreaseFont}
                        disabled={activeFontSizeIndex === 0}
                        className="w-8 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors shrink-0 cursor-pointer"
                        title="Smaller text"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex-1 px-1">
                        <input
                          type="range"
                          min={0}
                          max={fontSizes.length - 1}
                          step={1}
                          value={activeFontSizeIndex}
                          onChange={handleSliderChange}
                          className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
                        />
                        <div className="flex justify-between items-center px-0.5 mt-1.5 text-[8.5px] font-mono text-zinc-400 dark:text-zinc-500">
                          <span>85%</span>
                          <span>100%</span>
                          <span>115%</span>
                          <span>130%</span>
                          <span>150%</span>
                          <span>175%</span>
                          <span>200%</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleIncreaseFont}
                        disabled={activeFontSizeIndex === fontSizes.length - 1}
                        className="w-8 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors shrink-0 cursor-pointer"
                        title="Larger text"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 2. Font Style */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      {t('reader.font_style', 'Font Style')}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {fonts.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleFontFamilyChange(f.id)}
                          className={`py-2 text-xs rounded-xl border font-bold transition-all cursor-pointer ${
                            activeFontFamily === f.id
                              ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                              : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          <span className={f.id === "sans" ? "font-sans" : f.id === "serif" ? "font-serif text-[12.5px]" : "font-mono"}>
                            {f.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Background Tone */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      {t('reader.background_tone', 'Background Tone')}
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {themes.map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => handleThemeChange(th.id)}
                          className={`h-11 w-full rounded-2xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${th.bg} ${
                            activeTheme === th.id
                              ? "border-teal-600 dark:border-teal-400 ring-2 ring-teal-500/20 shadow-xs scale-102"
                              : `${th.border} opacity-85 hover:opacity-100 hover:scale-101`
                          }`}
                          title={th.name}
                        >
                          {activeTheme === th.id && (
                            <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Line Spacing */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      {t('reader.line_spacing', 'Line Spacing')}
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {lineHeights.map((lh) => (
                        <button
                          key={lh.id}
                          type="button"
                          onClick={() => handleLineHeightChange(lh.id)}
                          className={`py-2 text-[11px] rounded-xl border font-bold transition-all cursor-pointer text-center ${
                            activeLineHeight === lh.id
                              ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                              : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {lh.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5. Text Width */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      {t('reader.text_width', 'Text Width')}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {maxWidths.map((mw) => (
                        <button
                          key={mw.id}
                          type="button"
                          onClick={() => handleMaxWidthChange(mw.id)}
                          className={`py-2 text-[11px] rounded-xl border font-bold transition-all cursor-pointer text-center ${
                            activeMaxWidth === mw.id
                              ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                              : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {mw.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 6. Display Mode (Badges vs Clean Book) */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      {t('reader.view_style_label', 'Display Mode')}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleDisplayModeChange("badges")}
                        className={`py-2 px-3 text-xs rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeDisplayMode === "badges"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>🏷️ {t('reader.view_badges', 'Badges')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisplayModeChange("text")}
                        className={`py-2 px-3 text-xs rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeDisplayMode === "text"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>📖 {t('reader.view_text', 'Book')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 7. Word Card View (Inspector vs Floating vs Sheet) */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      {t('reader.word_card_mode_label', 'Word Card View')}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleWordCardModeChange("inspector")}
                        className={`px-1.5 py-2 text-xs rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                          activeWordCardView === "inspector"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="font-extrabold">{t('reader.card_inspector', 'Inspector')}</span>
                        <span className="text-[9px] opacity-80 font-normal leading-none">{t('reader.card_inspector_sub', 'Center')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWordCardModeChange("floating")}
                        className={`px-1.5 py-2 text-xs rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                          activeWordCardView === "floating"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="font-extrabold">{t('reader.card_floating', 'Floating')}</span>
                        <span className="text-[9px] opacity-80 font-normal leading-none">{t('reader.card_floating_sub', 'Calm Pop')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWordCardModeChange("sheet")}
                        className={`px-1.5 py-2 text-xs rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                          activeWordCardView === "sheet"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="font-extrabold">{t('reader.card_sheet', 'Sheet')}</span>
                        <span className="text-[9px] opacity-80 font-normal leading-none">{t('reader.card_sheet_sub', 'Bottom')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  TAB 2: READING & PARSING (Paging, Spacing, Speech, Features)
                 ───────────────────────────────────────────────────────────── */}
              {activeTab === "reading" && (
                <div className="space-y-4.5 animate-in fade-in duration-150">
                  {/* Section Title: Text & Paging */}
                  <div className="flex items-center justify-between pb-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('reader.section_text_paging', 'Text & Paging')}
                    </span>
                  </div>

                  {/* Page Size */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block">
                      {t('explainer.page_size', 'Page Size')}
                    </span>
                    <select
                      value={settings.pageSize || "auto"}
                      onChange={(e) => updateKey("pageSize", e.target.value as any)}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium cursor-pointer"
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

                  {/* Sentence Spacing & Paragraph Spacing Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block">
                        {t('explainer.sentence_spacing', 'Sentence Spacing')}
                      </span>
                      <select
                        value={settings.sentenceSpacing || "normal"}
                        onChange={(e) => updateKey("sentenceSpacing", e.target.value as any)}
                        className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium cursor-pointer"
                      >
                        <option value="normal">↔️ {t('explainer.spacing_normal', 'Normal')}</option>
                        <option value="spaced">↔️ {t('explainer.spacing_spaced', 'Spaced')}</option>
                        <option value="wide">↔️ {t('explainer.spacing_wide', 'Wide')}</option>
                        <option value="newline">↩️ {t('explainer.spacing_newline', 'New Line')}</option>
                        <option value="double-newline">↩️ {t('explainer.spacing_double_newline', 'Double New Line')}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block">
                        {t('explainer.paragraph_spacing', 'Paragraph Spacing')}
                      </span>
                      <select
                        value={settings.segmentSpacing || "normal"}
                        onChange={(e) => updateKey("segmentSpacing", e.target.value as any)}
                        className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium cursor-pointer"
                      >
                        <option value="compact">🔽 {t('explainer.p_spacing_compact', 'Compact')}</option>
                        <option value="normal">↕️ {t('explainer.p_spacing_normal', 'Normal')}</option>
                        <option value="relaxed">⏬ {t('explainer.p_spacing_relaxed', 'Relaxed')}</option>
                        <option value="loose">⬇️ {t('explainer.p_spacing_loose', 'Loose')}</option>
                      </select>
                    </div>
                  </div>

                  {/* Section Title: Speech & Highlighting */}
                  <div className="flex items-center justify-between pt-1 pb-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('reader.section_audio_highlighting', 'Speech & Highlighting')}
                    </span>
                  </div>

                  {/* Speech Synthesis (TTS Engine) */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block">
                      {t('explainer.speech_synthesis', 'Speech Synthesis')}
                    </span>
                    <select
                      value={settings.ttsEngine || "google"}
                      onChange={(e) => updateKey("ttsEngine", e.target.value as any)}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium cursor-pointer"
                    >
                      <option value="google">🎙️ Google Translate TTS</option>
                      <option value="browser">🔊 {t('explainer.tts_browser', 'System Synthesizer (Free, fast)')}</option>
                      <option value="gemini">✨ {t('explainer.tts_gemini', 'Gemini AI Voice (Limits apply, high quality)')}</option>
                    </select>
                  </div>

                  {/* Idioms & Phrasal Verbs Highlighting Style */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block">
                      {t('explainer.idiom_highlighting', 'Idioms & Phrasal Verbs Highlighting')}
                    </span>
                    <select
                      value={settings.idiomHighlightStyle || "badge"}
                      onChange={(e) => updateKey("idiomHighlightStyle", e.target.value as any)}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium cursor-pointer"
                    >
                      <option value="badge">🟣 {t('explainer.idiom_badge', 'Cohesive Badge')}</option>
                      <option value="underline">〰️ {t('explainer.idiom_underline', 'Continuous Underline')}</option>
                      <option value="icon">✨ {t('explainer.idiom_icon', 'Icon Marker')}</option>
                      <option value="hover">🔍 {t('explainer.idiom_hover', 'Highlight on Hover')}</option>
                    </select>
                  </div>

                  {/* Section Title: Reading Features */}
                  <div className="flex items-center justify-between pt-1 pb-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('reader.section_reading_features', 'Reading Features')}
                    </span>
                  </div>

                  {/* Feature Switches Group Card */}
                  <div className="space-y-3 bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800">
                    {/* 1. Word Highlight */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">
                          {t('explainer.word_highlight', 'Word Highlight')}
                        </span>
                        <span className="text-[9.5px] text-zinc-400 block leading-tight">
                          {t('explainer.word_highlight_desc', 'Color highlight words by vocabulary status')}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={!!settings.wordHighlight}
                          onChange={(e) => updateKey("wordHighlight", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 2. Parallel Translation */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2.5">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">
                          {t('explainer.parallel_translations', 'Parallel Translation (T)')}
                        </span>
                        <span className="text-[9.5px] text-zinc-400 block leading-tight">
                          {t('explainer.parallel_translations_desc', 'Show line-by-line sentence translations under text')}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={!!settings.showSentenceTranslations}
                          onChange={(e) => updateKey("showSentenceTranslations", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 3. Timestamps */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2.5">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">
                          {t('explainer.show_timestamps', 'Timestamps (0:02, 0:12)')}
                        </span>
                        <span className="text-[9.5px] text-zinc-400 block leading-tight">
                          {t('explainer.show_timestamps_desc', 'Show line-by-line timestamps in video and audio lessons')}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-3">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={settings.showTimestamps !== false}
                          onChange={(e) => updateKey("showTimestamps", e.target.checked)}
                        />
                        <div className="relative w-9 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 4. Sentence Split */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2.5">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">
                          {t('explainer.auto_punct_split', 'Sentence Split (., ?, !)')}
                        </span>
                        <span className="text-[9.5px] text-zinc-400 block leading-tight">
                          {t('explainer.auto_punct_split_desc', 'Group text into full sentences per line')}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={settings.autoPunctuationSplit !== false}
                          onChange={(e) => updateKey("autoPunctuationSplit", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 5. CJK Word Spacing */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2.5">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">
                          {t('explainer.cjk_word_spacing', 'Word Spacing for Asian Languages')}
                        </span>
                        <span className="text-[9.5px] text-zinc-400 block leading-tight">
                          {t('explainer.cjk_word_spacing_desc', 'Adds visual spacing between words in Japanese, Chinese, etc.')}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={!!settings.cjkWordSpacing}
                          onChange={(e) => updateKey("cjkWordSpacing", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 6. Reading Progress Bar */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2.5">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">
                          {t('explainer.reading_progress_bar', 'Reading Progress Bar')}
                        </span>
                        <span className="text-[9.5px] text-zinc-400 block leading-tight">
                          {t('explainer.reading_progress_bar_desc', 'Show top progress bar indicating chapter completion')}
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={settings.showProgressBar !== false}
                          onChange={(e) => updateKey("showProgressBar", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  TAB 3: LAYOUT & TOOLBAR (Video Mode, Custom Header Buttons)
                 ───────────────────────────────────────────────────────────── */}
              {activeTab === "toolbar" && (
                <div className="space-y-4.5 animate-in fade-in duration-150">
                  {/* Section Title: Video Player */}
                  <div className="flex items-center justify-between pb-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('reader.section_video_player', 'Video Player')}
                    </span>
                  </div>

                  {/* YouTube / Video Lessons View Mode */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block">
                      {t('explainer.default_video_mode', 'YouTube / Video View Mode')}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateKey("defaultVideoViewMode", "focus")}
                        className={`px-1.5 py-2 text-xs rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                          (settings.defaultVideoViewMode || "focus") === "focus"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>🎯 Focus</span>
                        <span className="text-[9px] opacity-80 font-normal leading-none">{t('explainer.video_focus_sub', 'Subtitles')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateKey("defaultVideoViewMode", "floating")}
                        className={`px-1.5 py-2 text-xs rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                          settings.defaultVideoViewMode === "floating"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>🪟 Floating</span>
                        <span className="text-[9px] opacity-80 font-normal leading-none">PiP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateKey("defaultVideoViewMode", "off")}
                        className={`px-1.5 py-2 text-xs rounded-xl border font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer text-center ${
                          settings.defaultVideoViewMode === "off"
                            ? "bg-teal-600 border-teal-600 text-white shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>⏹️ Closed</span>
                        <span className="text-[9px] opacity-80 font-normal leading-none">{t('explainer.video_off_sub', 'Hidden')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Section Title: Toolbar Buttons Visibility */}
                  <div className="flex items-center justify-between pt-1 pb-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t('reader.toolbar_visibility_label', 'Toolbar Buttons')}
                    </span>
                  </div>

                  {/* Toolbar Buttons Checklist */}
                  <div className="space-y-2.5 bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800">
                    {/* 1. AI Hub */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        {t('reader.tb_ai_hub', 'AI Hub')}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(toolbarVisibility.showAiHub)}
                          onChange={(e) => updateToolbarVisibility("showAiHub", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 2. Translation */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        {t('reader.tb_translation', 'Translation (T)')}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(toolbarVisibility.showTranslation)}
                          onChange={(e) => updateToolbarVisibility("showTranslation", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 3. Focus Mode */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
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
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        {t('reader.tb_play_pairs', 'Play: Pairs')}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(toolbarVisibility.showPlayPairs)}
                          onChange={(e) => updateToolbarVisibility("showPlayPairs", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                      </label>
                    </div>

                    {/* 5. Unknown Only */}
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
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
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
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
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
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
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
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
                    <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-850 pt-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        {t('reader.tb_timestamps_toggle', 'Timestamps Toggle Button')}
                      </span>
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
              )}

            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
