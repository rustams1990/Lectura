/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import { 
  ShieldCheck, Upload, Check, AlertCircle, FileText, 
  Trash2, Plus, Sparkles, HelpCircle, CheckCircle2
} from "lucide-react";
import { 
  IGNORE_CATEGORIES_CONFIG, 
  DEFAULT_IGNORE_CATEGORIES, 
  IgnoreCategoryId, 
  ignoreListManager,
  parseWordsForMassImport 
} from "../services/ignoreListService";
import { ReaderSettings, IgnoreCategorySettings } from "../types";
import { useVocab } from "../context/VocabContext";

interface IgnoreListsSettingsManagerProps {
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  availableLanguages?: string[];
  selectedTargetLanguage?: string;
  t: (key: string, defaultVal: string, options?: any) => string;
}

export default function IgnoreListsSettingsManager({
  settings,
  onSettingsChange,
  availableLanguages = ["Spanish", "English", "French", "German", "Russian"],
  selectedTargetLanguage = "Spanish",
  t,
}: IgnoreListsSettingsManagerProps) {
  const { handleMassImportIgnoredWords } = useVocab();

  const currentCategories: IgnoreCategorySettings = useMemo(() => ({
    ...DEFAULT_IGNORE_CATEGORIES,
    ...(settings?.ignoreCategories || {}),
  }), [settings?.ignoreCategories]);

  // Mass Import State
  const [importLang, setImportLang] = useState<string>(selectedTargetLanguage || "Spanish");
  const [inputText, setInputText] = useState<string>("");
  const [importResult, setImportResult] = useState<{ success: boolean; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedWords = useMemo(() => {
    return parseWordsForMassImport(inputText);
  }, [inputText]);

  const handleToggleCategory = (catId: IgnoreCategoryId) => {
    const updated: IgnoreCategorySettings = {
      ...currentCategories,
      [catId]: !currentCategories[catId],
    };
    onSettingsChange?.({
      ignoreCategories: updated,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText((prev) => (prev ? `${prev}\n${content}` : content));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    if (parsedWords.length === 0) return;

    const count = handleMassImportIgnoredWords(parsedWords, importLang);
    setImportResult({ success: true, count });
    setInputText("");

    setTimeout(() => {
      setImportResult(null);
    }, 6000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Explanation */}
      <div className="p-4 bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900/50 rounded-2xl flex items-start gap-3.5">
        <div className="p-2 bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 rounded-xl shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-bold text-teal-900 dark:text-teal-200 text-sm flex items-center gap-2">
            {t("ignore_lists.header_title", "Фильтрация шума и авто-игнорирование")}
          </h4>
          <p className="text-teal-800/90 dark:text-teal-300/80 leading-relaxed">
            {t(
              "ignore_lists.header_desc",
              "Слова из активных категорий (названия игр, консолей, IT-брендов, англицизмов и городов) автоматически считаются игнорируемыми: они не подсвечиваются синим как новые и не засоряют статистику. В карточке слова вы всегда можете в 1 клик сделать любое слово изучаемым."
            )}
          </p>
        </div>
      </div>

      {/* Category Toggles List */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">
          {t("ignore_lists.categories_title", "Тематические наборы авто-игнора")}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(IGNORE_CATEGORIES_CONFIG) as IgnoreCategoryId[]).map((catId) => {
            const cat = IGNORE_CATEGORIES_CONFIG[catId];
            const isEnabled = currentCategories[catId];

            return (
              <div
                key={catId}
                onClick={() => handleToggleCategory(catId)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                  isEnabled
                    ? "bg-white dark:bg-zinc-900/80 border-teal-500/40 dark:border-teal-500/30 shadow-xs ring-1 ring-teal-500/10"
                    : "bg-zinc-50/70 dark:bg-zinc-900/40 border-zinc-200/70 dark:border-zinc-800 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-2xl shrink-0 select-none">{cat.icon}</span>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {t(cat.nameKey, cat.defaultNameRu)}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {ignoreListManager.getCategoryWordCount(catId, selectedTargetLanguage)}+ {t("ignore_lists.words_count_label", "слов")}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
                      {t(cat.descKey, cat.defaultDescRu)}
                    </p>
                  </div>
                </div>

                {/* Custom Toggle Switch */}
                <div
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 p-0.5 cursor-pointer mt-0.5 ${
                    isEnabled ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                      isEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mass Import Section */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Upload className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              {t("ignore_lists.mass_import_title", "Массовый импорт своих слов в личный игнор-лист")}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("ignore_lists.mass_import_desc", "Вставьте список слов или загрузите .txt файл для добавления в ваш персональный словарь со статусом «Игнорировать».")}
            </p>
          </div>

          {/* Language selector for import */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("ignore_lists.target_lang_label", "Язык:")}
            </label>
            <select
              value={importLang}
              onChange={(e) => setImportLang(e.target.value)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Success Alert */}
        {importResult && importResult.success && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {t("ignore_lists.import_success", "Успешно добавлено {{count}} слов в список игнорируемых для {{lang}}!", {
                count: importResult.count,
                lang: importLang,
              })}
            </span>
          </div>
        )}

        {/* Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>{t("ignore_lists.input_words_placeholder_label", "Список слов (через запятую, пробел или новую строку):")}</span>
            <span className="font-semibold text-teal-600 dark:text-teal-400">
              {t("ignore_lists.words_detected", "Распознано слов: {{count}}", { count: parsedWords.length })}
            </span>
          </div>
          <textarea
            rows={4}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t(
              "ignore_lists.textarea_placeholder",
              "Например: Nintendo, PlayStation, Zelda, Mario, Witcher, Bossfight, Speedrun, DLC, Skyrim..."
            )}
            className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".txt,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              {t("ignore_lists.upload_txt_btn", "Загрузить .txt файл")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {inputText.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setInputText("")}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {t("ignore_lists.clear_btn", "Очистить")}
              </button>
            )}
            <button
              type="button"
              disabled={parsedWords.length === 0}
              onClick={handleExecuteImport}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs ${
                parsedWords.length > 0
                  ? "bg-teal-600 hover:bg-teal-700 text-white cursor-pointer hover:shadow-md active:scale-95"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
              }`}
            >
              <Plus className="w-4 h-4" />
              {t("ignore_lists.import_btn", "Добавить в игнор ({{count}})", { count: parsedWords.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
