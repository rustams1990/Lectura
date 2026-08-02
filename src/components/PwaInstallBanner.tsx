import React from "react";
import { X } from "lucide-react";
import { safeLocalStorageSetItem } from "../utils";

interface PwaInstallBannerProps {
  showIosInstallBanner: boolean;
  setShowIosInstallBanner: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function PwaInstallBanner({ showIosInstallBanner, setShowIosInstallBanner }: PwaInstallBannerProps) {
  if (!showIosInstallBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 z-[9999] flex items-start gap-3 animate-in slide-in-from-bottom duration-300 text-zinc-800 dark:text-zinc-200">
      <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </div>
      <div className="flex-1">
        <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">Установить Lectura</h4>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
          Нажмите кнопку <span className="font-bold">«Поделиться»</span> (Share) в меню браузера Safari, затем выберите <span className="font-bold">«На экран "Домой"»</span> (Add to Home Screen) для установки приложения.
        </p>
      </div>
      <button 
        onClick={() => {
          setShowIosInstallBanner(false);
          safeLocalStorageSetItem('ios_pwa_banner_dismissed', 'true');
        }}
        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
        title="Закрыть"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
