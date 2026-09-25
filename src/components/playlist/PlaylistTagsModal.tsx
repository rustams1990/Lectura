/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { X, Star, Plus, Tag, Check, Sparkles, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Playlist } from "../../types";
import { getTagColor } from "../../utils/tagColors";
import { useToast } from "../../context/ToastContext";
import { TagInputWithAutocomplete } from "../common/TagInputWithAutocomplete";

interface PlaylistTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist;
  availableTags?: string[];
  onSave: (primaryTag: string | null, tags: string[]) => void;
}

const QUICK_SUGGESTIONS = [
  "Language Learning", "Gaming", "Tech", "Podcast", "Stories", "News", "Science",
  "Travel", "History", "Culture", "Business", "Music", "Comedy"
];

export const PlaylistTagsModal: React.FC<PlaylistTagsModalProps> = ({
  isOpen,
  onClose,
  playlist,
  availableTags,
  onSave,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [primaryTag, setPrimaryTag] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagValue, setEditingTagValue] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      const initialTags = Array.isArray(playlist.tags) ? [...playlist.tags] : [];
      const initialPrimary = playlist.primaryTag || (initialTags.length > 0 ? initialTags[0] : null);
      if (initialPrimary && !initialTags.includes(initialPrimary)) {
        initialTags.unshift(initialPrimary);
      }
      setTags(initialTags);
      setPrimaryTag(initialPrimary);
      setNewTagInput("");
      setEditingTagIndex(null);
    }
  }, [isOpen, playlist]);

  if (!isOpen) return null;

  const handleAddTag = (rawName: string) => {
    let clean = rawName.trim().replace(/^#+/, "").trim();
    if (!clean) return;
    // Capitalize first letter
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);

    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      showToast(t('tags.already_added', 'This tag has already been added'), 'info');
      setNewTagInput("");
      return;
    }
    const updated = [...tags, clean];
    setTags(updated);
    if (!primaryTag) {
      setPrimaryTag(clean);
    }
    setNewTagInput("");
  };

  const handleStartEditTag = (index: number, currentTag: string) => {
    setEditingTagIndex(index);
    setEditingTagValue(currentTag);
  };

  const handleSaveTagEdit = (index: number) => {
    let clean = editingTagValue.trim().replace(/^#+/, "").trim();
    if (!clean) {
      setEditingTagIndex(null);
      return;
    }
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    const oldTag = tags[index];
    if (oldTag && oldTag.toLowerCase() === clean.toLowerCase()) {
      setEditingTagIndex(null);
      return;
    }

    if (tags.some((t, idx) => idx !== index && t.toLowerCase() === clean.toLowerCase())) {
      showToast(t('tags.already_added', 'This tag has already been added'), 'info');
      setEditingTagIndex(null);
      return;
    }

    const nextTags = [...tags];
    nextTags[index] = clean;
    setTags(nextTags);

    if (primaryTag && oldTag && primaryTag.toLowerCase() === oldTag.toLowerCase()) {
      setPrimaryTag(clean);
    }
    setEditingTagIndex(null);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase());
    setTags(updated);
    if (primaryTag && primaryTag.toLowerCase() === tagToRemove.toLowerCase()) {
      setPrimaryTag(updated.length > 0 ? updated[0] : null);
    }
  };

  const handleTogglePrimary = (tagName: string) => {
    if (primaryTag && primaryTag.toLowerCase() === tagName.toLowerCase()) {
      // Toggle off -> no primary tag
      setPrimaryTag(null);
    } else {
      setPrimaryTag(tagName);
    }
  };

  const handleSave = () => {
    onSave(primaryTag, tags);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t("tags.modal_title", "Playlist Categories & Tags")}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {playlist.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Info Banner */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex gap-2">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              {t(
                "tags.primary_tag_hint",
                "The Primary tag (★) is inherited by all lessons in this playlist and used for the 100% topic balance in History analytics."
              )}
            </p>
          </div>

          {/* Current Tags Chips */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
              {t("tags.assigned_tags", "Assigned Tags")}
            </label>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => {
                  const isPrimary = primaryTag && primaryTag.toLowerCase() === tag.toLowerCase();
                  const color = getTagColor(tag);
                  const isEditingThis = editingTagIndex === idx;

                  if (isEditingThis) {
                    return (
                      <div
                        key={`edit-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-teal-400 bg-white dark:bg-zinc-800 shadow-sm animate-in fade-in zoom-in-95 duration-100"
                      >
                        <span className="text-teal-600 dark:text-teal-400 text-xs font-bold">#</span>
                        <input
                          type="text"
                          value={editingTagValue}
                          onChange={(e) => setEditingTagValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveTagEdit(idx);
                            } else if (e.key === "Escape") {
                              setEditingTagIndex(null);
                            }
                          }}
                          autoFocus
                          className="w-24 sm:w-32 px-1 py-0.5 text-xs font-semibold bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTagEdit(idx)}
                          className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded cursor-pointer transition"
                          title={t("common.save", "Save")}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTagIndex(null)}
                          className="p-1 text-zinc-400 hover:text-zinc-600 rounded cursor-pointer transition"
                          title={t("common.cancel", "Cancel")}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={tag}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        isPrimary
                          ? "ring-2 ring-amber-400 dark:ring-amber-500/70 border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                          : `${color.lightBg} ${color.border} ${color.text}`
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleTogglePrimary(tag)}
                        className="cursor-pointer transition hover:scale-110 active:scale-95"
                        title={
                          isPrimary
                            ? t("tags.is_primary_click_to_unset", "Primary tag (click to unset)")
                            : t("tags.click_to_make_primary", "Click to make Primary")
                        }
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            isPrimary
                              ? "text-amber-500 fill-amber-500"
                              : "text-zinc-400 hover:text-amber-500"
                          }`}
                        />
                      </button>
                      <span
                        onDoubleClick={() => handleStartEditTag(idx, tag)}
                        className="cursor-text"
                        title={t("tags.double_click_to_edit", "Double click to rename")}
                      >
                        #{tag}
                      </span>
                      {isPrimary && (
                        <span className="text-[9px] uppercase tracking-wider font-black px-1 py-0.5 bg-amber-500 text-white rounded-md">
                          {t("tags.primary_badge", "Primary")}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEditTag(idx, tag)}
                        className="text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 p-0.5 rounded transition cursor-pointer"
                        title={t("common.edit", "Edit tag name")}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                        title={t("common.remove", "Remove")}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 italic">
                {t("tags.no_tags_yet", "No tags assigned yet. Add one below.")}
              </p>
            )}
          </div>

          {/* Add Tag Input */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
              {t("tags.add_new_tag", "Add Tag")}
            </label>
            <TagInputWithAutocomplete
              value={newTagInput}
              onChange={setNewTagInput}
              onAddTag={handleAddTag}
              availableTags={availableTags && availableTags.length > 0 ? availableTags : QUICK_SUGGESTIONS}
              currentTags={tags}
              placeholder={t("tags.input_placeholder", "e.g. Gaming, Tech, Vocabulary...")}
            />
          </div>

          {/* Quick Suggestions */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              {t("tags.quick_suggestions", "Quick Suggestions")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(availableTags && availableTags.length > 0 ? availableTags : QUICK_SUGGESTIONS).filter(
                (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())
              ).slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleAddTag(s)}
                  className="text-[11px] px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition cursor-pointer"
                >
                  +{s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850/50 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t("common.save", "Save")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlaylistTagsModal;
