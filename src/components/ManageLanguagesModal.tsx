import React, { useState } from "react";
import { X, Search, Plus, Check, Globe, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getLanguageFlagEmoji, renderCircularFlag } from "./LibraryHome";

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const ALL_SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇧🇷" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "🇺🇦" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақша", flag: "🇰🇿" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", flag: "🇬🇷" },
  { code: "he", name: "Hebrew", nativeName: "עברית", flag: "🇮🇱" },
];

interface ManageLanguagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTargetLanguage: string;
  onSelectTargetLanguage: (lang: string) => void;
  availableTargetLanguages: string[];
  onAddLanguage: (lang: string) => void;
  onRemoveLanguage: (lang: string) => void;
  lessonCountByLanguage?: Record<string, number>;
  languageFlags?: Record<string, string>;
}

export default function ManageLanguagesModal({
  isOpen,
  onClose,
  selectedTargetLanguage,
  onSelectTargetLanguage,
  availableTargetLanguages,
  onAddLanguage,
  onRemoveLanguage,
  lessonCountByLanguage = {},
  languageFlags,
}: ManageLanguagesModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const filteredLanguages = ALL_SUPPORTED_LANGUAGES.filter((l) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      l.name.toLowerCase().includes(q) ||
      l.nativeName.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-xl border border-teal-100 dark:border-teal-900">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white">
                {t("header.add_new_language", "Manage Languages")}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">
                {t("header.select_language_desc", "Add or remove languages from your dropdown")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("header.search_languages", "Search languages...")}
              className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>

        {/* Languages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
          {filteredLanguages.map((lang) => {
            const isCurrentSelected = selectedTargetLanguage.toLowerCase() === lang.name.toLowerCase();
            const isInDropdown = availableTargetLanguages.some(
              (l) => l.toLowerCase() === lang.name.toLowerCase()
            );
            const bookCount = lessonCountByLanguage[lang.name] || 0;

            return (
              <div
                key={lang.code}
                className={`p-3 rounded-2xl border transition-all flex items-center justify-between group ${
                  isCurrentSelected
                    ? "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900 shadow-xs"
                    : isInDropdown
                    ? "bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 border-zinc-200/80 dark:border-zinc-800"
                    : "bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-100 dark:border-zinc-800/40 opacity-80 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  {renderCircularFlag(getLanguageFlagEmoji(lang.name, languageFlags))}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-zinc-900 dark:text-white">
                        {lang.name}
                      </span>
                      <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                        • {lang.nativeName}
                      </span>
                    </div>
                    {bookCount > 0 && (
                      <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 block mt-0.5">
                        {bookCount} {bookCount === 1 ? "book" : "books"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isInDropdown ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTargetLanguage(lang.name);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                          isCurrentSelected
                            ? "bg-teal-600 text-white shadow-xs"
                            : "bg-zinc-100 dark:bg-zinc-800 hover:bg-teal-500 hover:text-white text-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        {isCurrentSelected ? "Active" : "Select"}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveLanguage(lang.name);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all border border-transparent hover:border-red-200 dark:hover:border-red-900 cursor-pointer"
                        title={t("common.remove", "Remove from dropdown")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddLanguage(lang.name);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-600 hover:text-white rounded-xl text-[10px] font-black transition-all border border-teal-200/60 dark:border-teal-900 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-xl transition-all cursor-pointer"
          >
            {t("common.done", "Done")}
          </button>
        </div>
      </div>
    </div>
  );
}

