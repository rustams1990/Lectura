import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Tag, Star, Plus, Check } from "lucide-react";

interface BatchTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  mode: "addTag" | "setPrimaryTag";
  availableTags: string[];
  onSubmit: (tagName: string, mode: "addTag" | "setPrimaryTag") => void;
  isLoading?: boolean;
}

export const BatchTagModal: React.FC<BatchTagModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  mode,
  availableTags,
  onSubmit,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanQuery = inputValue.trim().replace(/^#+/, "").toLowerCase();
  const filteredSuggestions = availableTags.filter((tag) =>
    tag.toLowerCase().includes(cleanQuery)
  );

  const handleSubmit = (tagNameToSubmit?: string) => {
    const raw = tagNameToSubmit || inputValue;
    let clean = raw.trim().replace(/^#+/, "").trim();
    if (!clean) return;
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    onSubmit(clean, mode);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              {mode === "setPrimaryTag" ? (
                <Star className="w-4 h-4" />
              ) : (
                <Tag className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {mode === "setPrimaryTag"
                  ? t("tags.batch_set_primary_title", "Set Primary Topic")
                  : t("tags.batch_add_tag_title", "Add Tag to Selected")}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {t("tags.batch_target_info", "Applying to {{count}} selected items", {
                  count: selectedCount,
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5">
          {/* Input field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              {t("tags.tag_name", "Tag Name")}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold pointer-events-none">
                #
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputValue.trim()) {
                    e.preventDefault();
                    handleSubmit();
                  } else if (e.key === "Escape") {
                    onClose();
                  }
                }}
                placeholder={t("tags.input_placeholder", "e.g.: Gaming, Tech, Vocabulary...")}
                className="w-full pl-7 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-semibold"
              />
            </div>
          </div>

          {/* Quick Suggestions / Existing Tags */}
          {availableTags.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                {t("tags.existing_tags", "Existing Tags")}:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {filteredSuggestions.map((tag) => {
                  const isSelected =
                    inputValue.trim().replace(/^#+/, "").toLowerCase() ===
                    tag.trim().replace(/^#+/, "").toLowerCase();
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setInputValue(tag)}
                      onDoubleClick={() => handleSubmit(tag)}
                      className={`text-[11px] font-medium px-2.5 pt-0.5 pb-1 rounded-lg border transition-all cursor-pointer shadow-3xs leading-[1.3] ${
                        isSelected
                          ? "bg-teal-600 text-white border-teal-600 font-bold shadow-teal-500/20 scale-102"
                          : "border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-300 hover:border-teal-400 dark:hover:border-teal-600 hover:bg-teal-50/70 dark:hover:bg-teal-950/40 hover:text-teal-700 dark:hover:text-teal-300"
                      }`}
                    >
                      <span className="leading-[1.3] pb-0.5 inline-block">#{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-3 bg-zinc-50/80 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            disabled={!inputValue.trim() || isLoading}
            onClick={() => handleSubmit()}
            className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>
              {mode === "setPrimaryTag"
                ? t("tags.apply_primary", "Set as Primary")
                : t("tags.apply_tag", "Add Tag")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
