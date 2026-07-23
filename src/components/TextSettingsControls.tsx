/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ReaderSettings } from "../types";
import { Type, Sliders, Check, Minus, Plus } from "lucide-react";

interface TextSettingsControlsProps {
  settings: ReaderSettings;
  onUpdateSettings: (settings: ReaderSettings) => void;
}

export default function TextSettingsControls({
  settings,
  onUpdateSettings,
}: TextSettingsControlsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const fontSizes: ReaderSettings["fontSize"][] = ["sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
  const fonts: { id: ReaderSettings["fontFamily"]; name: string }[] = [
    { id: "sans", name: "Modern Sans" },
    { id: "serif", name: "Classic Lora Book" },
    { id: "mono", name: "Coder Mono" },
  ];

  const themes: { id: ReaderSettings["readerTheme"]; name: string; bg: string; text: string; border: string }[] = [
    { id: "default", name: "System", bg: "bg-white dark:bg-zinc-900", text: "text-zinc-800 dark:text-zinc-200", border: "border-zinc-200 dark:border-zinc-700" },
    { id: "cream", name: "Cream", bg: "bg-[#faf5eb]", text: "text-[#3d2c16]", border: "border-[#eddcb9]" },
    { id: "sepia", name: "Sepia", bg: "bg-[#f5edd0]", text: "text-[#4d3319]", border: "border-[#e0cea1]" },
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

  return (
    <div className="relative inline-block text-left">
      <button
        id="btn-toggle-typography"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-1.5 h-9 px-3 shrink-0 whitespace-nowrap text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/55 dark:hover:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all active:scale-95 cursor-pointer"
        title="Adjust text appearance, size, theme and fonts"
      >
        <Type className="w-3.5 h-3.5 text-zinc-500" />
        <span>Text Settings (AA)</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop closer */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          
          <div className="fixed inset-x-3 top-14 max-h-[85vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2.5 sm:w-85 sm:max-h-[80vh] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 sm:p-5 z-[9999] space-y-4 animate-in fade-in slide-in-from-top-3 duration-150 scrollbar-thin">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" /> Text Appearance
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[10px] font-bold text-teal-600 hover:underline"
              >
                Done
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
                  {(settings.fontFamily === "serif" ? "Serif" : (settings.fontFamily === "mono" ? "Mono" : "Sans"))} {settings.fontSize.toUpperCase()}
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

            {/* Font Family choosing */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-400">Font Style</span>
              <div className="grid grid-cols-3 gap-1">
                {fonts.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => updateKey("fontFamily", f.id)}
                    className={`px-1 py-2 text-[10px] rounded-lg border font-medium transition-all ${
                      settings.fontFamily === f.id
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

            {/* Color Readers Palette Settings */}
            <div className="space-y-1.5">
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
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Интервал предложений (Sentence Spacing)</span>
              <select
                value={settings.sentenceSpacing || "normal"}
                onChange={(e) => updateKey("sentenceSpacing", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="normal">↔️ Стандартное (Normal)</option>
                <option value="spaced">↔️ Небольшой отступ (Spaced)</option>
                <option value="wide">↔️ Широкий интервал (Wide)</option>
                <option value="newline">↩️ Каждое с новой строки (New Line)</option>
                <option value="double-newline">↩️ С новой строки с пропуском (Double New Line)</option>
              </select>
            </div>

            {/* Segment Spacing config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Расстояние между абзацами/блоками (Paragraph Spacing)</span>
              <select
                value={settings.segmentSpacing || "normal"}
                onChange={(e) => updateKey("segmentSpacing", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="compact">🔽 Компактное (Compact)</option>
                <option value="normal">↕️ Стандартное (Normal)</option>
                <option value="relaxed">⏬ Просторное (Relaxed)</option>
                <option value="loose">⬇️ Очень широкое (Loose)</option>
              </select>
            </div>

            {/* Page Size config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Размер страницы (Page Size)</span>
              <select
                value={settings.pageSize || "auto"}
                onChange={(e) => updateKey("pageSize", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="auto">✨ Умный адаптивный (Smart Auto)</option>
                <option value="all">📝 Показать целиком (Full text)</option>
                
                <optgroup label="📋 По предложениям (By Sentences)">
                  <option value="s5">5 предложений (5 sentences)</option>
                  <option value="s10">10 предложений (10 sentences)</option>
                  <option value="s20">20 предложений (20 sentences)</option>
                  <option value="s30">30 предложений (30 sentences)</option>
                </optgroup>

                <optgroup label="🔢 По словам (By Words)">
                  <option value="w50">~50 слов (Micro)</option>
                  <option value="w100">~100 слов (Small Book)</option>
                  <option value="w250">~250 слов (Medium Book)</option>
                  <option value="w500">~500 слов (Large Page)</option>
                  <option value="w1000">~1000 слов (Chapters)</option>
                </optgroup>

                <optgroup label="📂 По абзацам / Репликам (By Paragraphs)">
                  <option value="p1">По 1 абзацу (1 paragraph)</option>
                  <option value="p2">По 2 абзаца (2 paragraphs)</option>
                  <option value="p3">По 3 абзаца (3 paragraphs)</option>
                  <option value="p5">По 5 абзацев (5 paragraphs)</option>
                  <option value="p10">По 10 абзацев (10 paragraphs)</option>
                  <option value="p15">По 15 абзацев (15 paragraphs)</option>
                  <option value="p20">По 20 абзацев (20 paragraphs)</option>
                </optgroup>

                <optgroup label="🔤 По символам (By Characters)">
                  <option value="c250">~250 символов (Short CJK)</option>
                  <option value="c500">~500 символов (Standard CJK)</option>
                  <option value="c1000">~1000 символов (Long CJK)</option>
                  <option value="c2000">~2000 символов (Full CJK page)</option>
                </optgroup>
              </select>
            </div>

            {/* TTS Engine config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Озвучка слов (Speech Synthesis)</span>
              <select
                value={settings.ttsEngine || "browser"}
                onChange={(e) => updateKey("ttsEngine", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="browser">🔊 Системный синтезатор (Бесплатно, быстро)</option>
                <option value="gemini">✨ Gemini AI нейро-голос (Лимиты, высокое кач-во)</option>
              </select>
            </div>

            {/* Idiom Highlight Style config */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Подсветка идиом и фразовых глаголов</span>
              <select
                value={settings.idiomHighlightStyle || "badge"}
                onChange={(e) => updateKey("idiomHighlightStyle", e.target.value as any)}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              >
                <option value="badge">🟣 Единая фоновая плашка (Cohesive Badge)</option>
                <option value="underline">〰️ Сквозной пунктир под всей фразой (Continuous Underline)</option>
                <option value="icon">✨ Маленькая иконка в конце фразы (Icon Marker)</option>
                <option value="hover">🔍 Подсветка только при наведении (Highlight on Hover)</option>
              </select>
            </div>

            {/* Word Highlight Toggle */}
            <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Пословная подсветка (Word Highlight)</span>
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

          </div>
        </>
      )}
    </div>
  );
}
