/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Переиспользуемый модальный диалог подтверждения опасных или важных действий.
 */

import React, { useEffect } from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  isDanger = true,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isDanger ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400" : "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"}`}>
              {isDanger ? <Trash2 className="w-6 h-6 animate-pulse" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
                {title}
              </h3>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                {t('explainer.confirmation_required', 'Требуется подтверждение')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-850">
          {message}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            {cancelText || t('explainer.cancel_btn', 'Отмена')}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 px-4 text-white font-bold text-xs rounded-xl transition-all active:scale-97 cursor-pointer shadow-md ${
              isDanger 
                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20" 
                : "bg-teal-600 hover:bg-teal-700 shadow-teal-600/20"
            }`}
          >
            {confirmText || t('explainer.confirm_btn', 'Подтвердить')}
          </button>
        </div>
      </div>
    </div>
  );
}
