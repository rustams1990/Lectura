/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import { Lesson } from "../types";
import { safeJsonParse, getBCP47LanguageTag, FLAG_EMOJI_TO_CODE } from "../utils";
import { 
  X, Check, Globe, HelpCircle, Save, RotateCcw, Trash2, Link, 
  Maximize2, Sparkles, Database, HardDrive, Download, Upload, ShieldAlert,
  Wifi, Copy, RefreshCw, TrendingUp, Headphones
} from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessons: Lesson[];
  languageFlags: Record<string, string>;
  onSaveLanguageFlag: (lang: string, flag: string) => void;
  onResetLanguageFlags: () => void;
  // New properties for managing word variation links & scaling
  wordLinks: Record<string, string>;
  onDeleteWordLink: (sourceKey: string) => void;
  zoomScale: number;
  onZoomScaleChange: (scale: number) => void;
  layoutWidthMode?: "standard" | "wide" | "ultra" | "full";
  onLayoutWidthModeChange?: (mode: "standard" | "wide" | "ultra" | "full") => void;

  // Storage / Backup and Offline capabilities props
  storageMode: "cloud" | "local" | "server";
  onStorageModeChange: (mode: "cloud" | "local" | "server") => void;
  localSyncKey: string;
  onLocalSyncKeyChange: (key: string) => void;
  localSyncError: boolean;
  firebaseUser: any;
  activeUser?: any;
  vocab: Record<string, any>;
  lessonTypes: any[];
  listeningSeconds: number;
  onListeningSecondsChange?: (seconds: number) => void;
  onImportData: (imported: {
    lessons: Lesson[];
    lessonTypes: any[];
    vocab: Record<string, any>;
    wordLinks: Record<string, string>;
    listeningSeconds?: number;
    languageFlags?: Record<string, string>;
  }) => void;
  onClearAllData: () => void;
  onManualSync?: () => Promise<void>;
  isSyncing?: boolean;
  settings?: Record<string, any>;
  onSettingsChange?: (patch: Record<string, any>) => void;
}

// Popular flag symbols & emoji presets
const ALL_WORLD_FLAGS = [
  "🇺🇸", "🇬🇧", "🇪🇸", "🇲🇽", "🇨🇴", "🇦🇷", "🇨🇱", "🇵🇪", "🇻🇪", "🇪🇨", 
  "🇬🇹", "🇨🇺", "🇩🇴", "🇭🇳", "🇵🇾", "🇸🇻", "🇳🇮", "🇨🇷", "🇵🇦", "🇺🇾", 
  "🇧🇴", "🇪🇶", "🇩🇪", "🇦🇹", "🇨🇭", "🇱🇮", "🇱🇺", "🇫🇷", "🇨🇦", "🇧🇪", 
  "🇲🇨", "🇸🇳", "🇨🇮", "🇨🇲", "🇲🇬", "🇨🇩", "🇭🇹", "🇷🇺", "🇧🇾", "🇰🇿", 
  "🇰🇬", "🇯🇵", "🇮🇹", "🇸🇲", "🇻🇦", "🇵🇹", "🇧🇷", "🇦🇴", "🇲🇿", "🇨🇻", 
  "🇬🇼", "🇸🇹", "🇹🇱", "🇲🇴", "🇨🇳", "🇹🇼", "🇭🇰", "🇸🇬", "🇰🇷", "🇰🇵", 
  "🇹🇷", "🇸🇦", "🇦🇪", "🇪🇬", "🇮🇶", "🇯🇴", "🇱🇧", "🇲🇦", "🇩🇿", "🇹🇳", 
  "🇶🇦", "🇰🇼", "🇴🇲", "🇧🇭", "🇮🇳", "🇺🇦", "🇵🇱", "🇸🇪", "🇫🇮", "🇳🇱", 
  "🇸🇷", "🇬🇷", "🇨🇾", "🇮🇪", "🇿🇦", "🇯🇲", "📖", "📜", "🪐", "🌟", "🚩"
];

function getFlagsForLanguage(langName: string): { presets: string[]; label: string } {
  const norm = (langName || "").toLowerCase().trim();

  // Spanish / Español
  if (norm.includes("spanish") || norm.includes("испан") || norm.includes("español") || norm.includes("espanol") || norm === "es") {
    return {
      presets: ["🇪🇸", "🇲🇽", "🇨🇴", "🇦🇷", "🇨🇱", "🇵🇪", "🇻🇪", "🇪🇨", "🇬🇹", "🇨🇺", "🇩🇴", "🇭🇳", "🇵🇾", "🇸🇻", "🇳🇮", "🇨🇷", "🇵🇦", "🇺🇾", "🇧🇴", "🇪🇶", "🇺🇸"],
      label: "Страны, где говорят на испанском:"
    };
  }

  // English
  if (norm.includes("english") || norm.includes("англ") || norm === "en") {
    return {
      presets: ["🇺🇸", "🇬🇧", "🇨🇦", "🇦🇺", "🇳🇿", "🇮🇪", "🇿🇦", "🇯🇲", "🇸🇬", "🇮🇳"],
      label: "Англоязычные страны:"
    };
  }

  // German / Deutsch
  if (norm.includes("german") || norm.includes("немец") || norm.includes("deutsch") || norm === "de") {
    return {
      presets: ["🇩🇪", "🇦🇹", "🇨🇭", "🇱🇮", "🇱🇺", "🇧🇪"],
      label: "Немецкоязычные страны:"
    };
  }

  // French / Français
  if (norm.includes("french") || norm.includes("франц") || norm.includes("français") || norm.includes("francais") || norm === "fr") {
    return {
      presets: ["🇫🇷", "🇨🇦", "🇧🇪", "🇨🇭", "🇲🇨", "🇸🇳", "🇨🇮", "🇨🇲", "🇲🇬", "🇨🇩", "🇭🇹"],
      label: "Франкоязычные страны:"
    };
  }

  // Portuguese / Português
  if (norm.includes("portuguese") || norm.includes("португал") || norm.includes("português") || norm.includes("portugues") || norm === "pt") {
    return {
      presets: ["🇵🇹", "🇧🇷", "🇦🇴", "🇲🇿", "🇨🇻", "🇬🇼", "🇸🇹", "🇹🇱", "🇲🇴"],
      label: "Португалоязычные страны:"
    };
  }

  // Russian / Русский
  if (norm.includes("russian") || norm.includes("русский") || norm.includes("русск") || norm === "ru") {
    return {
      presets: ["🇷🇺", "🇧🇾", "🇰🇿", "🇰🇬"],
      label: "Русскоязычные регионы:"
    };
  }

  // Italian / Italiano
  if (norm.includes("italian") || norm.includes("итальян") || norm.includes("italiano") || norm === "it") {
    return {
      presets: ["🇮🇹", "🇨🇭", "🇸🇲", "🇻🇦"],
      label: "Италоязычные страны:"
    };
  }

  // Chinese / 中文
  if (norm.includes("chinese") || norm.includes("китай") || norm.includes("中文") || norm === "zh") {
    return {
      presets: ["🇨🇳", "🇹🇼", "🇭🇰", "🇸🇬", "🇲🇴"],
      label: "Китайскоязычные регионы:"
    };
  }

  // Japanese / 日本語
  if (norm.includes("japanese") || norm.includes("япон") || norm.includes("日本語") || norm === "ja") {
    return {
      presets: ["🇯🇵"],
      label: "Япония:"
    };
  }

  // Korean / 한국어
  if (norm.includes("korean") || norm.includes("корей") || norm.includes("한국어") || norm === "ko") {
    return {
      presets: ["🇰🇷", "🇰🇵"],
      label: "Корейские регионы:"
    };
  }

  // Arabic / العربية
  if (norm.includes("arabic") || norm.includes("араб") || norm === "ar") {
    return {
      presets: ["🇸🇦", "🇦🇪", "🇪🇬", "🇮🇶", "🇯🇴", "🇱🇧", "🇲🇦", "🇩🇿", "🇹🇳", "🇶🇦", "🇰🇼", "🇴🇲", "🇧🇭"],
      label: "Арабоязычные страны:"
    };
  }

  // Turkish / Türkçe
  if (norm.includes("turkish") || norm.includes("турец") || norm === "tr") {
    return {
      presets: ["🇹🇷", "🇨🇾"],
      label: "Туркоязычные регионы:"
    };
  }

  // Ukrainian / Українська
  if (norm.includes("ukrainian") || norm.includes("украин") || norm === "uk") {
    return {
      presets: ["🇺🇦"],
      label: "Украина:"
    };
  }

  // Kazakh / Қазақ
  if (norm.includes("kazakh") || norm.includes("казах") || norm.includes("қазақ") || norm === "kk") {
    return {
      presets: ["🇰🇿"],
      label: "Казахстан:"
    };
  }

  // Polish / Polski
  if (norm.includes("polish") || norm.includes("польск") || norm === "pl") {
    return {
      presets: ["🇵🇱"],
      label: "Польша:"
    };
  }

  // Dutch / Nederlands
  if (norm.includes("dutch") || norm.includes("голланд") || norm.includes("нидерланд") || norm === "nl") {
    return {
      presets: ["🇳🇱", "🇧🇪", "🇸🇷"],
      label: "Нидерландоязычные страны:"
    };
  }

  // Swedish / Svenska
  if (norm.includes("swedish") || norm.includes("швед") || norm === "sv") {
    return {
      presets: ["🇸🇪", "🇫🇮"],
      label: "Швеция и Финляндия:"
    };
  }

  // Greek / Ελληνικά
  if (norm.includes("greek") || norm.includes("греч") || norm === "el") {
    return {
      presets: ["🇬🇷", "🇨🇾"],
      label: "Греция и Кипр:"
    };
  }

  // Hindi
  if (norm.includes("hindi") || norm.includes("хинди") || norm === "hi") {
    return {
      presets: ["🇮🇳"],
      label: "Индия:"
    };
  }

  // Default fallback flags list
  return {
    presets: ALL_WORLD_FLAGS.slice(0, 24),
    label: "Выберите подходящий флаг:"
  };
}

const renderFlagImg = (emoji: string, size = 24) => {
  const code = FLAG_EMOJI_TO_CODE[emoji];
  if (code) {
    return (
      <img
        src={`https://flagcdn.com/w${size * 2}/${code}.png`}
        srcSet={`https://flagcdn.com/w${size * 4}/${code}.png 2x`}
        alt={code.toUpperCase()}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    );
  }
  return <span className="scale-[1.45] origin-center inline-block select-none">{emoji}</span>;
};

// Map default fallback emojis like getLanguageCoverPreset does
const DEFAULT_FALLBACK_FLAGS: Record<string, string> = {
  spanish: "🇪🇸",
  espanol: "🇪🇸",
  spanish_esp: "🇪🇸",
  english: "🇬🇧",
  german: "🇩🇪",
  deutsch: "🇩🇪",
  french: "🇫🇷",
  francais: "🇫🇷",
  japanese: "🇯🇵",
  russian: "🇷🇺",
  italian: "🇮🇹",
  ukrainian: "🇺🇦",
  ukrainsk: "🇺🇦",
  portuguese: "🇵🇹",
  portugues: "🇵🇹",
  brazil: "🇧🇷",
  brazilian: "🇧🇷",
  kazakh: "🇰🇿",
  kazakhstan: "🇰🇿",
  "қазақ": "🇰🇿",
  kazakh_kir: "🇰🇿",
};

export default function SettingsModal({
  isOpen,
  onClose,
  lessons,
  languageFlags,
  onSaveLanguageFlag,
  onResetLanguageFlags,
  wordLinks,
  onDeleteWordLink,
  zoomScale,
  onZoomScaleChange,
  layoutWidthMode,
  onLayoutWidthModeChange,
  
  storageMode,
  onStorageModeChange,
  localSyncKey,
  onLocalSyncKeyChange,
  localSyncError,
  firebaseUser,
  activeUser,
  vocab,
  lessonTypes,
  listeningSeconds,
  onListeningSecondsChange,
  onImportData,
  onClearAllData,
  onManualSync,
  isSyncing = false,
  settings,
  onSettingsChange,
}: SettingsModalProps) {
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [activeSettingsTab, setActiveSettingsTab] = useState<"flags" | "interface" | "patterns" | "storage">("flags");
  const [importStatus, setImportStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [listeningMinsInput, setListeningMinsInput] = useState<string>(Math.round((listeningSeconds || 0) / 60).toString());
  const [listeningSaveMsg, setListeningSaveMsg] = useState<string | null>(null);
  const [showAllFlagsMap, setShowAllFlagsMap] = useState<Record<string, boolean>>({});

  // States for local Wi-Fi Peer-to-Peer Transfer
  const [wifiSyncPin, setWifiSyncPin] = useState<string | null>(null);
  const [wifiSyncLoading, setWifiSyncLoading] = useState<boolean>(false);
  const [inputWifiPin, setInputWifiPin] = useState<string>("");
  const [wifiSyncStatus, setWifiSyncStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

  const handleLocalWifiShare = async () => {
    setWifiSyncLoading(true);
    setWifiSyncStatus({ type: "idle" });
    try {
      const payload = {
        lessons,
        lessonTypes,
        vocab,
        wordLinks,
        listeningSeconds,
        languageFlags,
      };

      const res = await fetch("/api/local-sync/share", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-local-sync-key": localSyncKey
        },
        body: JSON.stringify({ data: payload })
      });

      if (!res.ok) {
        throw new Error("Не удалось зарегистрировать код синхронизации на сервере.");
      }

      const body = await safeJsonParse(res);
      setWifiSyncPin(body.code);
      setWifiSyncStatus({
        type: "success",
        message: "Код синхронизации сгенерирован! Он будет действителен в течение 15 минут."
      });
    } catch (err: any) {
      console.error(err);
      setWifiSyncStatus({
        type: "error",
        message: err.message || "Ошибка при генерации сессии локального обмена."
      });
    } finally {
      setWifiSyncLoading(false);
    }
  };

  const handleLocalWifiRetrieve = async () => {
    if (!inputWifiPin.trim() || inputWifiPin.trim().length !== 6) {
      setWifiSyncStatus({
        type: "error",
        message: "Пожалуйста, введите корректный 6-значный код."
      });
      return;
    }

    setWifiSyncLoading(true);
    setWifiSyncStatus({ type: "idle" });
    try {
      const res = await fetch(`/api/local-sync/retrieve/${inputWifiPin.trim()}`, {
        headers: {
          "x-local-sync-key": localSyncKey
        }
      });
      if (!res.ok) {
        const errJson = await safeJsonParse(res).catch(() => ({}));
        throw new Error(errJson.error || "Не удалось загрузить данные по этому коду.");
      }

      const body = await safeJsonParse(res);
      if (!body.data) {
        throw new Error("Сервер вернул пустой пакет данных.");
      }

      onImportData(body.data);
      setWifiSyncStatus({
        type: "success",
        message: `Сотрудничество завершено! Успешно перенесено: ${body.data.lessons?.length || 0} книг, ${Object.keys(body.data.vocab || body.data.lingqs || {}).length || 0} слов и связей!`
      });
      setInputWifiPin("");
      setWifiSyncPin(null);
    } catch (err: any) {
      console.error(err);
      setWifiSyncStatus({
        type: "error",
        message: err.message || "Ошибка при скачивании локальных данных."
      });
    } finally {
      setWifiSyncLoading(false);
    }
  };

  const handleExportDataLocal = () => {
    try {
      const backupFile = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        lessons,
        lessonTypes,
        vocab,
        wordLinks,
        listeningSeconds,
        languageFlags,
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupFile, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `smart_learner_backup_${new Date().toISOString().substring(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e: any) {
      console.error("Failed to export backup JSON:", e);
      alert(`Ошибка при экспорте резервной копии: ${e.message || String(e)}`);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Basic validation of backup structure
        if (
          !parsed || 
          (typeof parsed !== "object") ||
          (!parsed.lessons && !parsed.vocab && !parsed.lingqs && !parsed.wordLinks && !parsed.lessonTypes)
        ) {
          throw new Error("Неверная структура файла резервной копии. Должен быть хотя бы один список: уроки, слова или связи.");
        }

        onImportData(parsed);
        setImportStatus({
          type: "success",
          message: `Базовый импорт выполнен! Загружено: ${parsed.lessons?.length || 0} уроков, ${Object.keys(parsed.vocab || parsed.lingqs || {}).length || 0} слов.`
        });
      } catch (err: any) {
        setImportStatus({
          type: "error",
          message: `Ошибка чтения резервной копии: ${err.message || String(err)}`
        });
      }
    };
    reader.readAsText(file);
  };

  // Detect all unique target languages in the user library that actually have materials (lessons)
  const detectedLanguages = useMemo(() => {
    const set = new Set<string>();
    lessons.forEach((l) => {
      if (l.targetLanguage) {
        const trimmed = l.targetLanguage.trim();
        if (trimmed) {
          // Title case format, e.g. "spanish" -> "Spanish"
          const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
          set.add(formatted);
        }
      }
    });
    return Array.from(set).sort();
  }, [lessons]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Semi-transparent backdrop with animation */}
      <div 
        className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Settings Modal Box */}
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-xl text-teal-600 dark:text-teal-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                Настройки Приложения <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded-md font-mono text-zinc-600 dark:text-zinc-400">v2.46.1</span>
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5 font-medium leading-relaxed">
                Настройте масштаб интерфейса, управляйте связями слов и визуальным оформлением флагов.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Header */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 bg-zinc-55 dark:bg-zinc-950/30 px-6 select-none shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveSettingsTab("flags")}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 cursor-pointer ${
              activeSettingsTab === "flags"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            🚩 Флаги Языков
          </button>
          <button
            onClick={() => setActiveSettingsTab("interface")}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 cursor-pointer ${
              activeSettingsTab === "interface"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            📐 Интерфейс (Масштаб)
          </button>
          <button
            onClick={() => setActiveSettingsTab("patterns")}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 cursor-pointer ${
              activeSettingsTab === "patterns"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            🔗 Связи Слов
          </button>
          <button
            onClick={() => {
              setActiveSettingsTab("storage");
              setImportStatus({ type: "idle" });
              setSyncStatus(null);
            }}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 cursor-pointer ${
              activeSettingsTab === "storage"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            💾 Хранилище (Local & Cloud)
          </button>
        </div>

        {/* Modal Scrollable Contents */}
        <div className="p-6 overflow-y-auto flex-grow">
          
          {/* Active Tab: Languages & Flags */}
          {activeSettingsTab === "flags" && (
            <div className="space-y-6 divide-y divide-zinc-100 dark:divide-zinc-800">
              {detectedLanguages.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 dark:text-zinc-500 font-medium">
                  📚 В вашей библиотеке пока нет языков. Загрузите или выберите урок из библиотеки, чтобы настроить флаги!
                </div>
              ) : (
                detectedLanguages.map((lang, index) => {
                  const langLower = lang.toLowerCase();
                  const currentFlag = languageFlags[langLower] || DEFAULT_FALLBACK_FLAGS[langLower] || "📖";
                  const customValue = customInputs[langLower] !== undefined ? customInputs[langLower] : "";
                  const flagConfig = getFlagsForLanguage(lang);
                  const isShowingAll = !!showAllFlagsMap[langLower];
                  const activePresets = isShowingAll ? ALL_WORLD_FLAGS : flagConfig.presets;

                  return (
                    <div 
                      key={lang} 
                      className={`py-5 flex flex-col md:flex-row md:items-start justify-between gap-4 first:pt-0`}
                    >
                      {/* Language Info Title and Active Flag */}
                      <div className="md:w-1/3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/85 dark:border-zinc-700/85 overflow-hidden flex items-center justify-center text-[24px] leading-none select-none shrink-0 shadow-inner">
                          {renderFlagImg(currentFlag, 40)}
                        </span>
                        <div>
                          <h4 className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
                            {lang}
                          </h4>
                          <p className="text-[10px] text-zinc-400 font-medium">
                            Текущий флаг: <span className="font-mono bg-zinc-100 dark:bg-zinc-950 px-1 py-0.5 rounded">{currentFlag}</span>
                          </p>
                        </div>
                      </div>

                      {/* Flag Selection Presets Grid and Custom input block */}
                      <div className="flex-1 space-y-3">
                        {/* Presets Grid */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                              {isShowingAll ? "Все флаги мира:" : flagConfig.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAllFlagsMap(prev => ({ ...prev, [langLower]: !isShowingAll }))}
                              className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                            >
                              {isShowingAll ? "Показать только подходящие" : "🌐 Все флаги"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-100/50 dark:border-zinc-800/60 max-h-[110px] overflow-y-auto">
                            {activePresets.map((preset) => {
                              const isSelected = currentFlag === preset;
                              return (
                                <button
                                  key={preset}
                                  onClick={() => {
                                    onSaveLanguageFlag(lang, preset);
                                    // clear custom input when preset is chosen
                                    setCustomInputs(prev => ({ ...prev, [langLower]: "" }));
                                  }}
                                  className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-base bg-white dark:bg-zinc-900 border select-none transition-all active:scale-95 cursor-pointer ${
                                    isSelected 
                                      ? "ring-2 ring-teal-500 border-teal-500 bg-teal-50 dark:bg-teal-950 scale-110" 
                                      : "border-zinc-200 dark:border-zinc-800 opacity-80 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                  }`}
                                  title={`Assign flag ${preset}`}
                                >
                                  {renderFlagImg(preset, 20)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Custom emoji input form */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="...или вставьте свой emoji флага вручную"
                              value={customValue}
                              onChange={(e) => {
                                setCustomInputs(prev => ({ ...prev, [langLower]: e.target.value }));
                              }}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={!customValue.trim()}
                            onClick={() => {
                              if (customValue.trim()) {
                                onSaveLanguageFlag(lang, customValue.trim());
                              }
                            }}
                            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 font-bold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Применить
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Active Tab: Interface Scale (Увеличение/Уменьшение интерфейса) */}
          {activeSettingsTab === "interface" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                    <Maximize2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                      Размер элементов интерфейса (Zoom)
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      Управляйте масштабом приложения, чтобы сделать текст более читаемым или уместить на экране больше информации. Изменения применяются ко всему приложению мгновенно.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4.5 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                      Активный масштаб:
                    </span>
                    <span className="text-base font-black text-teal-600 dark:text-teal-400 flex items-center gap-2">
                      {zoomScale}% {zoomScale === 100 && <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">(Рекомендуемый)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 select-none text-zinc-700 dark:text-zinc-200">
                    <button
                      type="button"
                      onClick={() => onZoomScaleChange(Math.max(70, zoomScale - 10))}
                      disabled={zoomScale <= 70}
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer transition-all"
                      title="Уменьшить масштаб на 10%"
                    >
                      －
                    </button>
                    <button
                      type="button"
                      onClick={() => onZoomScaleChange(100)}
                      className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 dark:hover:bg-zinc-950/40 transition-all cursor-pointer text-zinc-500"
                    >
                      Сброс
                    </button>
                    <button
                      type="button"
                      onClick={() => onZoomScaleChange(Math.min(150, zoomScale + 10))}
                      disabled={zoomScale >= 150}
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer transition-all"
                      title="Увеличить масштаб на 10%"
                    >
                      ＋
                    </button>
                  </div>
                </div>

                {/* Preset scale targets selection */}
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block mb-2.5">
                    Выберите пресет быстрого переключения:
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {[80, 90, 100, 110, 120, 130, 140, 150].map((scale) => {
                      const isSelected = zoomScale === scale;
                      return (
                        <button
                          key={scale}
                          type="button"
                          onClick={() => onZoomScaleChange(scale)}
                          className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-600 dark:text-teal-400 font-extrabold'
                              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {scale}% {scale === 100 && "•"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Width Selector setting */}
                {layoutWidthMode && onLayoutWidthModeChange && (
                  <div className="border-t border-zinc-100/60 dark:border-zinc-800 pt-5 space-y-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                      Максимальная ширина интерфейса:
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: "standard", label: "Стандарт (1280px)", desc: "Компактный вид" },
                        { id: "wide", label: "Широкий (1560px)", desc: "Сбалансированный" },
                        { id: "full", label: "На весь экран", desc: "Максимальный простор" },
                      ] as const).map((mode) => {
                        const isSelected = layoutWidthMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => onLayoutWidthModeChange(mode.id)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-600 dark:text-teal-400 font-extrabold shadow-sm'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span className="text-xs font-bold leading-tight">{mode.label}</span>
                            <span className="text-[8px] text-zinc-400 dark:text-zinc-500 font-medium font-sans leading-none">{mode.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Simulated live container sample showing sizes */}
                <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 bg-white dark:bg-zinc-900/40 text-center space-y-3 shadow-inner">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 uppercase tracking-widest font-mono">
                    Живой пример масштабирования (Scale Live Preview)
                  </span>
                  <p className="text-zinc-800 dark:text-zinc-200 text-xs font-medium leading-relaxed max-w-sm mx-auto">
                    Эта коробочка имитирует изменения. При масштабе <span className="font-bold text-teal-600 dark:text-teal-400">{zoomScale}%</span> размеры шрифтов и кнопок будут подогнаны под выбранное соотношение.
                  </p>
                  <button className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-[11px] rounded-xl shadow-xs cursor-pointer select-none">
                    Демонстрационная Кнопка!
                  </button>
                </div>
              </div>

              {/* Listening Time Adjustment Card */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-sky-50 dark:bg-sky-950/40 rounded-xl text-sky-600 dark:text-sky-400 shrink-0">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                      Время прослушивания (Listening Time)
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      Автоматически учитывает время прослушивания YouTube видео и аудио уроков. Вы также можете указать время вручную:
                    </p>

                    <div className="mt-3.5 flex items-center gap-3">
                      <div className="relative flex-1 max-w-[180px]">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={listeningMinsInput}
                          onChange={(e) => setListeningMinsInput(e.target.value)}
                          className="w-full h-9 px-3 pr-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-sky-500"
                          placeholder="Минуты"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400">мин</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const mins = parseFloat(listeningMinsInput);
                          if (!isNaN(mins) && mins >= 0 && onListeningSecondsChange) {
                            onListeningSecondsChange(Math.round(mins * 60));
                            setListeningSaveMsg("✓ Время прослушивания успешно обновлено!");
                            setTimeout(() => setListeningSaveMsg(null), 3000);
                          }
                        }}
                        className="h-9 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                      >
                        Сохранить
                      </button>
                    </div>
                    {listeningSaveMsg && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mt-2 animate-in fade-in duration-200">
                        {listeningSaveMsg}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* TTS Engine Selector */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-violet-50 dark:bg-violet-950/40 rounded-xl text-violet-600 dark:text-violet-400 shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                      Движок озвучки слов (TTS)
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      Выберите, каким голосом будут озвучиваться слова при нажатии на кнопку 🔊 в карточке слова.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {([
                    { id: "google", label: "Google Translate TTS", badge: "Как в AwesomeTTS", icon: "🎙️", desc: "Тот же голос что в плагине Anki AwesomeTTS. Чистый, приятный, бесплатный — без API ключа." },
                    { id: "kokoro", label: "Kokoro-82M / Local TTS", badge: "Офлайн / Локальный ИИ", icon: "🧠", desc: "Студийный нейросетевой голос (Kokoro-82M / Piper). Работает локально на вашем сервере без облака." },
                    { id: "gemini", label: "Gemini AI (Neural)", badge: "Требует API ключ", icon: "✨", desc: "Нейросетевой голос Gemini — очень естественный, живой. Требует GEMINI_API_KEY (на бесплатном ключе лимит 10 слов в день)." },
                    { id: "browser", label: "Браузерный (Встроенный)", badge: "Офлайн", icon: "💻", desc: "Голос операционной системы. Работает без интернета, но качество зависит от ОС." },
                  ] as { id: string; label: string; badge: string; icon: string; desc: string }[]).map((engine) => {
                    const isSelected = (settings?.ttsEngine || "google") === engine.id;
                    return (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => onSettingsChange?.({ ttsEngine: engine.id as any })}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                          isSelected
                            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl shrink-0">{engine.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-black ${ isSelected ? "text-violet-700 dark:text-violet-300" : "text-zinc-800 dark:text-zinc-100" }`}>
                                {engine.label}
                              </span>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? "bg-violet-600 text-white"
                                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                              }`}>
                                {engine.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                              {engine.desc}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {((settings?.ttsEngine || "google") === "kokoro" || (settings?.ttsEngine || "google") === "local_tts") && (
                  <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-2xl space-y-3.5 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🧠</span>
                      <h5 className="text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
                        Настройки Kokoro / Local TTS
                      </h5>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                          URL локального TTS сервера (OpenAI-compatible / Kokoro / Piper):
                        </label>
                        <input
                          type="text"
                          value={settings?.localTtsUrl || "http://localhost:8880/v1/audio/speech"}
                          onChange={(e) => onSettingsChange?.({ localTtsUrl: e.target.value })}
                          placeholder="http://localhost:8880/v1/audio/speech"
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:ring-2 focus:ring-violet-500 focus:outline-none"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Стандартный порт для kokoro-fastapi: <code>http://localhost:8880/v1/audio/speech</code>
                        </p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                          Имя голоса (Voice):
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={settings?.localTtsVoice || "af_sarah"}
                            onChange={(e) => onSettingsChange?.({ localTtsVoice: e.target.value })}
                            placeholder="af_sarah"
                            className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:ring-2 focus:ring-violet-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-[10px] text-zinc-400 self-center mr-1">Пресеты:</span>
                          {[
                            { name: "af_sarah (US ♀)", code: "af_sarah" },
                            { name: "am_adam (US ♂)", code: "am_adam" },
                            { name: "bf_emma (UK ♀)", code: "bf_emma" },
                            { name: "bm_george (UK ♂)", code: "bm_george" },
                            { name: "ff_siwis (FR ♀)", code: "ff_siwis" },
                            { name: "es_es (ES ♀)", code: "es_es" },
                          ].map((preset) => (
                            <button
                              key={preset.code}
                              type="button"
                              onClick={() => onSettingsChange?.({ localTtsVoice: preset.code })}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
                                (settings?.localTtsVoice || "af_sarah") === preset.code
                                  ? "bg-violet-600 text-white font-bold"
                                  : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                              }`}
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {lessons.some(l => (l.targetLanguage || "").toLowerCase().includes("kaza") || (l.targetLanguage || "").toLowerCase().includes("қаза")) && (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 rounded-2xl text-[11px] text-amber-800 dark:text-amber-300 flex gap-2.5">
                    <span className="shrink-0 text-base leading-none">💡</span>
                    <div className="leading-relaxed">
                      <strong>Казахский язык (TTS):</strong> Бесплатный движок Google Translate TTS не поддерживает озвучку казахских слов (возвращает ошибку 400). Пожалуйста, выберите <strong>Gemini AI (Neural)</strong> (требуется настроенный API-ключ Gemini) или установите казахский голос в настройках ОС для работы <strong>Браузерной озвучки</strong> (например, Microsoft Aigul/Madi в Windows).
                    </div>
                  </div>
                )}

                {/* Accent / Locale Picker — always visible */}
                {(() => {
                  const currentLocale = settings?.ttsLocale || "en-US";
                  const getIsSelected = (code: string) => {
                    const baseCode = code.split("-")[0].toLowerCase();
                    if (settings?.ttsLocales?.[baseCode]) {
                      return settings.ttsLocales[baseCode] === code;
                    }
                    const globalLocale = settings?.ttsLocale || "en-US";
                    const globalBase = globalLocale.split("-")[0].toLowerCase();
                    if (globalBase === baseCode) {
                      return globalLocale === code;
                    }
                    return getBCP47LanguageTag(baseCode) === code;
                  };
                  const LOCALE_GROUPS = [
                    {
                      lang: "Английский 🇺🇸🇬🇧",
                      locales: [
                        { code: "en-US", label: "🇺🇸 Американский (en-US)" },
                        { code: "en-GB", label: "🇬🇧 Британский (en-GB)" },
                        { code: "en-AU", label: "🇦🇺 Австралийский (en-AU)" },
                        { code: "en-CA", label: "🇨🇦 Канадский (en-CA)" },
                        { code: "en-IN", label: "🇮🇳 Индийский (en-IN)" },
                      ],
                    },
                    {
                      lang: "Испанский 🇪🇸🇲🇽",
                      locales: [
                        { code: "es-US", label: "🇲🇽 Мексиканский (es-US)" },
                        { code: "es-ES", label: "🇪🇸 Испанский (es-ES)" },
                        { code: "es-AR", label: "🇦🇷 Аргентинский (es-AR)" },
                      ],
                    },
                    {
                      lang: "Португальский 🇧🇷🇵🇹",
                      locales: [
                        { code: "pt-BR", label: "🇧🇷 Бразильский (pt-BR)" },
                        { code: "pt-PT", label: "🇵🇹 Европейский (pt-PT)" },
                      ],
                    },
                    {
                      lang: "Французский 🇫🇷🇨🇦",
                      locales: [
                        { code: "fr-FR", label: "🇫🇷 Французский (fr-FR)" },
                        { code: "fr-CA", label: "🇨🇦 Канадский (fr-CA)" },
                      ],
                    },
                    {
                      lang: "Китайский 🇨🇳🇹🇼",
                      locales: [
                        { code: "zh-CN", label: "🇨🇳 Путунхуа (zh-CN)" },
                        { code: "zh-TW", label: "🇹🇼 Тайваньский (zh-TW)" },
                      ],
                    },
                    {
                      lang: "Другие языки",
                      locales: [
                        { code: "de-DE", label: "🇩🇪 Немецкий (de-DE)" },
                        { code: "it-IT", label: "🇮🇹 Итальянский (it-IT)" },
                        { code: "ru-RU", label: "🇷🇺 Русский (ru-RU)" },
                        { code: "uk-UA", label: "🇺🇦 Украинский (uk-UA)" },
                        { code: "ja-JP", label: "🇯🇵 Японский (ja-JP)" },
                        { code: "ko-KR", label: "🇰🇷 Корейский (ko-KR)" },
                        { code: "tr-TR", label: "🇹🇷 Турецкий (tr-TR)" },
                        { code: "ar-SA", label: "🇸🇦 Арабский (ar-SA)" },
                      ],
                    },
                  ];
                  return (
                    <div className="mt-1 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌍</span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                          Акцент / Диалект Google TTS
                        </span>
                        <span className="ml-auto text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                          {currentLocale}
                        </span>
                      </div>
                      {LOCALE_GROUPS.map((group) => (
                        <div key={group.lang}>
                          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block mb-1.5">
                            {group.lang}
                          </span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {group.locales.map((loc) => {
                              const isSel = getIsSelected(loc.code);
                              return (
                                <button
                                  key={loc.code}
                                  type="button"
                                  onClick={() => {
                                    const baseCode = loc.code.split("-")[0].toLowerCase();
                                    onSettingsChange?.({
                                      ttsLocale: loc.code,
                                      ttsLocales: {
                                        ...(settings?.ttsLocales || {}),
                                        [baseCode]: loc.code
                                      }
                                    });
                                  }}
                                  className={`text-left px-3 py-2 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                                    isSel
                                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-black"
                                      : "border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/30 text-zinc-600 dark:text-zinc-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50/50"
                                  }`}
                                >
                                  {loc.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* AI Settings Section */}
                <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                        Настройки ИИ (AI Provider)
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                        Выберите, какую нейросеть использовать для перевода, объяснения грамматики, идиом и генерации историй.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSettingsChange?.({ aiProvider: "gemini" })}
                      className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        (settings?.aiProvider || "gemini") === "gemini"
                          ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-teal-300 dark:hover:border-teal-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl shrink-0">✨</span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-black block ${ (settings?.aiProvider || "gemini") === "gemini" ? "text-teal-700 dark:text-teal-300" : "text-zinc-800 dark:text-zinc-100" }`}>
                            Gemini AI
                          </span>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                            Использует облачную модель Google Gemini.
                          </p>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSettingsChange?.({ aiProvider: "local" })}
                      className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        (settings?.aiProvider || "gemini") === "local"
                          ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-teal-300 dark:hover:border-teal-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl shrink-0">💻</span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-black block ${ (settings?.aiProvider || "gemini") === "local" ? "text-teal-700 dark:text-teal-300" : "text-zinc-800 dark:text-zinc-100" }`}>
                            Локальный ИИ
                          </span>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                            Запросы отправляются на локальный Ollama сервер.
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {(settings?.aiProvider || "gemini") === "local" && (
                    <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-3xs animate-in fade-in duration-150">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          Адрес локального сервера (Ollama URL)
                        </label>
                        <input
                          type="text"
                          value={settings?.localAiUrl || "http://localhost:11434/api/generate"}
                          onChange={(e) => onSettingsChange?.({ localAiUrl: e.target.value })}
                          onBlur={(e) => {
                            let cleaned = e.target.value.trim();
                            if (cleaned) {
                              if (!/^https?:\/\//i.test(cleaned)) {
                                cleaned = "http://" + cleaned;
                              }
                              onSettingsChange?.({ localAiUrl: cleaned });
                            }
                          }}
                          placeholder="http://localhost:11434/api/generate"
                          className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          Название модели (Model name)
                        </label>
                        <input
                          type="text"
                          value={settings?.localAiModel || "phi3.5"}
                          onChange={(e) => onSettingsChange?.({ localAiModel: e.target.value })}
                          placeholder="phi3.5"
                          className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Book Card Stats Section */}
                <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                        Детальная статистика на карточках
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                        Показывать раздельную статистику понимания (по общей массе слов) и словарного запаса (по уникальным леммам) на карточках книг.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Включить детальную статистику (Словарь и Новые %)
                      </span>
                      <button
                        type="button"
                        onClick={() => onSettingsChange?.({ showDetailedVocabularyStats: settings?.showDetailedVocabularyStats === false })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          settings?.showDetailedVocabularyStats !== false ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            settings?.showDetailedVocabularyStats !== false ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Показывать на главной полоске карточки:
                      </span>
                      <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 font-sans shrink-0">
                        <button
                          type="button"
                          onClick={() => onSettingsChange?.({ mainStatsMetric: "comprehension" })}
                          className={`h-7 px-3 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            (settings?.mainStatsMetric || "comprehension") === "comprehension"
                              ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                          }`}
                          title="Показывать процент понимания по общей массе слов"
                        >
                          Понятно
                        </button>
                        <button
                          type="button"
                          onClick={() => onSettingsChange?.({ mainStatsMetric: "vocabulary" })}
                          className={`h-7 px-3 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            settings?.mainStatsMetric === "vocabulary"
                              ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                          }`}
                          title="Показывать процент уникального словарного запаса"
                        >
                          Словарь
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Tab: Patterns & Word Links list with deletion */}
          {activeSettingsTab === "patterns" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-start gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-950/30 p-4.5 rounded-2xl border border-zinc-100/50 dark:border-zinc-800/40">
                <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                  <Link className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight mb-1">
                    Связи слов (Морфологические Паттерны)
                  </h4>
                  <p className="text-[11px] font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Здесь вы можете увидеть и удалить ранее настроенные связи словоформ (например, <span className="font-mono bg-zinc-100 dark:bg-zinc-950 px-1 py-0.5 rounded">zorros ➔ zorro</span>). Связанные слова делят перевод и статистику, предотвращая дублирование в словаре.
                  </p>
                </div>
              </div>

              {/* Word links list */}
              <div className="space-y-2">
                {(() => {
                  // Only gather language-prefixed keys like "spanish_zorros" which represent a unique scoped link
                  const languageSpecificLinks = Object.keys(wordLinks).filter(
                    (key) => key.includes("_")
                  );

                  if (languageSpecificLinks.length === 0) {
                    return (
                      <div className="text-center py-14 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 text-zinc-400">
                        <span className="text-3xl block mb-2 opacity-60 filter grayscale">🔗</span>
                        <p className="text-xs font-black uppercase tracking-widest text-zinc-400">
                          Связанные слова не найдены
                        </p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 leading-relaxed max-w-sm mx-auto font-medium">
                          Вы можете связать производные морфологические формы с их корнем на панели разбора слова во время чтения уроков.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900/40 max-h-[320px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                      {languageSpecificLinks.map((key) => {
                        const targetKey = wordLinks[key];
                        if (!targetKey) return null;

                        const underscoreIdx = key.indexOf("_");
                        const lang = underscoreIdx !== -1 ? key.substring(0, underscoreIdx) : "spanish";
                        const srcWord = underscoreIdx !== -1 ? key.substring(underscoreIdx + 1) : key;

                        const tUnderscoreIdx = targetKey.indexOf("_");
                        const dstWord = tUnderscoreIdx !== -1 ? targetKey.substring(tUnderscoreIdx + 1) : targetKey;

                        const flag = languageFlags[lang.toLowerCase()] || DEFAULT_FALLBACK_FLAGS[lang.toLowerCase()] || "📖";

                        return (
                          <div 
                            key={key} 
                            className="flex items-center justify-between p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-950/20 transition-all text-xs"
                          >
                            <div className="flex items-center gap-3">
                              {/* Language Icon Badge */}
                              <span className="w-6.5 h-6.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-[13px] leading-none select-none border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
                                {renderFlagImg(flag, 16)}
                              </span>
                              
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-zinc-800 dark:text-zinc-200 capitalize font-mono shrink-0">
                                  {srcWord}
                                </span>
                                <span className="text-zinc-400 font-bold shrink-0">➔</span>
                                <span className="font-black text-teal-600 dark:text-teal-400 capitalize font-mono shrink-0">
                                  {dstWord}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Вы действительно хотите удалить связь для слова "${srcWord}" ➔ "${dstWord}"?`)) {
                                  onDeleteWordLink(key);
                                }
                              }}
                              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/35 rounded-lg transition-colors cursor-pointer shrink-0"
                              title="Удалить паттерн связи"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Active Tab: Database & Storage Settings */}
          {activeSettingsTab === "storage" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Part 1: Choose active database system */}
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">
                  Текущий режим хранения данных
                </label>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Option A: Local Storage */}
                  <div 
                    onClick={() => onStorageModeChange("local")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      storageMode === "local"
                        ? "border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-md scale-[1.02]"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 bg-white dark:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 ${
                        storageMode === "local" 
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                      }`}>
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-white flex items-center gap-1.5">
                          Локальный браузер
                          {storageMode === "local" && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />}
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          Данные хранятся локально в кэше вашего браузера. Высокая скорость работы, 100% приватность, доступность без интернета.
                        </p>
                      </div>
                    </div>
                    {storageMode === "local" && (
                      <div className="mt-3 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Активен: Локальное хранение
                      </div>
                    )}
                  </div>

                  {/* Option C: Node.js Local Network Server (PC & Tablet Shared storage) */}
                  <div 
                    onClick={() => onStorageModeChange("server")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      storageMode === "server"
                        ? "border-sky-500 bg-sky-50/20 dark:bg-sky-950/10 shadow-md scale-[1.02]"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-sky-305 dark:hover:border-sky-900 bg-white dark:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 ${
                        storageMode === "server" 
                          ? "bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 animate-pulse"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                      }`}>
                        <Wifi className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-white flex items-center gap-1.5">
                          По локальной сети (Wi-Fi)
                          {storageMode === "server" && <span className="w-2 h-2 bg-sky-500 rounded-full animate-ping" />}
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          <strong>Рекомендуется для ПК + Планшета!</strong> Сохраняет данные на запущенный сервер. Все ваши устройства видят одни книги и слова без интернета.
                        </p>
                      </div>
                    </div>
                    {storageMode === "server" ? (
                      <div className="mt-3">
                        <div className="text-[10px] font-black uppercase text-sky-600 dark:text-sky-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Активен: Локальный Сервер
                        </div>
                        
                        {activeUser ? (
                          <div className="mt-3 pt-3 border-t border-zinc-100/45 dark:border-zinc-800/40" onClick={(e) => e.stopPropagation()}>
                            <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                              Авторизован как <span className="text-zinc-800 dark:text-zinc-200">{activeUser.displayName || activeUser.email}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 pt-3 border-t border-zinc-100/45 dark:border-zinc-800/40" onClick={(e) => e.stopPropagation()}>
                            <label className="text-[9px] font-bold uppercase text-zinc-400 dark:text-zinc-500 block mb-1">
                              Ключ авторизации (пароль)
                            </label>
                            <input
                              type="password"
                              value={localSyncKey}
                              onChange={(e) => onLocalSyncKeyChange(e.target.value)}
                              placeholder="Секретный ключ..."
                              className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-sky-500 text-zinc-800 dark:text-zinc-200"
                            />
                            {localSyncError && (
                              <div className="text-[10px] text-red-500 font-semibold mt-1">
                                ⚠️ Неверный ключ или доступ запрещен!
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 text-[10px] font-medium text-zinc-400 dark:text-zinc-400">
                        Нажмите, чтобы включить
                      </div>
                    )}
                  </div>

                  {/* Option B: Cloud Storage */}
                  <div 
                    onClick={() => onStorageModeChange("cloud")}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      storageMode === "cloud"
                        ? "border-teal-500 bg-teal-50/20 dark:bg-teal-950/10 shadow-md scale-[1.02]"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-teal-300 bg-white dark:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 ${
                        storageMode === "cloud" 
                          ? "bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                      }`}>
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-zinc-800 dark:text-white">
                          Облако Google Firebase
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          Синхронизируются на телефонах, планшетах и ПК при авторизации. Требует интернет-соединения и OAuth-разрешения.
                        </p>
                      </div>
                    </div>
                    {storageMode === "cloud" ? (
                      <div className="mt-3 text-[10px] font-black uppercase text-teal-600 dark:text-teal-400 flex items-center gap-1">
                        {firebaseUser ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Синхронизация: {firebaseUser.email}
                          </>
                        ) : (
                          <span className="text-amber-500 text-[10px] lowercase leading-tight block">
                            ⚠️ Требуется вход в аккаунт через кнопку "Войти" на верхней панели
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 text-[10px] font-medium text-zinc-400">
                        Нажмите, чтобы включить облако
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Part 2: Local JSON backups: export and import files on computer */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <h4 className="text-xs sm:text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">
                    Резервные копии на диске (Local Backups)
                  </h4>
                </div>
                
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                  Вы можете скачать полную копию всей вашей библиотеки, словаря иностранных слов, связей и набранной статистики в виде одного файла резервной копии <span className="font-mono text-zinc-600 bg-zinc-100 dark:bg-zinc-950/50 px-1 py-0.5 rounded">.json</span>. Вы также можете в любой момент загрузить этот файл обратно, чтобы восстановить свой прогресс.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5">
                  {/* Export Button */}
                  <button
                    type="button"
                    onClick={handleExportDataLocal}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold text-xs rounded-xl transition duration-150 cursor-pointer shadow-3xs"
                    title="Экспортировать базу на компьютер"
                  >
                    <Download className="w-4 h-4 text-teal-500" />
                    <span>Скачать копию (.json)</span>
                  </button>

                  {/* Import Button */}
                  <div className="relative">
                    <input 
                      type="file"
                      ref={fileInputRef}
                      accept=".json"
                      onChange={handleFileImport}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold text-xs rounded-xl transition duration-150 cursor-pointer shadow-3xs"
                      title="Загрузить резервную копию с компьютера"
                    >
                      <Upload className="w-4 h-4 text-emerald-500" />
                      <span>Восстановить из файла</span>
                    </button>
                  </div>
                </div>

                {importStatus.type !== "idle" && (
                  <div className={`p-3 rounded-xl border text-[11px] font-medium leading-relaxed ${
                    importStatus.type === "success"
                      ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-800 dark:text-emerald-305"
                      : "bg-red-50/50 dark:bg-red-950/20 border-red-250 text-red-805 dark:text-red-350"
                  }`}>
                    {importStatus.message}
                  </div>
                )}
              </div>

              {/* Part 2.5: Local Wi-Fi Quick Synchronization */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-sky-500" />
                  <h4 className="text-xs sm:text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">
                    Быстрый перенос по локальной сети Wi-Fi (В обе стороны)
                  </h4>
                </div>
                
                <p className="text-[11px] text-zinc-500 leading-relaxed font-semibold">
                  Вы можете передавать ваши данные в любую сторону! Если вы пометили новые слова на планшете, просто сгенерируйте PIN-код на планшете и введите его на компьютере. Все ваши книги, слова и статистика синхронизируются мгновенно.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1.5">
                  {/* Sender side */}
                  <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5">
                    <span className="text-[9px] font-black uppercase text-zinc-400 block tracking-wider">
                      Шаг 1: Экспорт (Устройство-Отправитель)
                    </span>
                    <p className="text-[10px] text-zinc-500 leading-tight">
                      Сгенерируйте временный PIN-код на устройстве, с которого хотите передать обновленный словарь.
                    </p>
                    {wifiSyncPin ? (
                      <div className="p-2.5 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 text-center rounded-xl space-y-1">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Ваш код Wi-Fi PIN:</span>
                        <div className="text-2xl font-black tracking-widest text-teal-600 dark:text-teal-400 font-mono">
                          {wifiSyncPin}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(wifiSyncPin);
                            alert("Код скопирован в буфер обмена!");
                          }}
                          className="text-[9px] text-teal-600 dark:text-teal-400 underline font-bold cursor-pointer"
                        >
                          Скопировать код
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={wifiSyncLoading}
                        onClick={handleLocalWifiShare}
                        className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-extrabold text-xs rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${wifiSyncLoading ? "animate-spin" : ""}`} />
                        <span>{wifiSyncLoading ? "Подготовка..." : "Сгенерировать Код PIN"}</span>
                      </button>
                    )}
                  </div>

                  {/* Receiver side */}
                  <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black uppercase text-zinc-400 block tracking-wider">
                        Шаг 2: Импорт (Устройство-Получатель)
                      </span>
                      <p className="text-[10px] text-zinc-500 leading-tight">
                        Введите этот код на другом устройстве для получения и объединения всех изменений.
                      </p>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={inputWifiPin}
                        onChange={(e) => setInputWifiPin(e.target.value.replace(/\D/g, ""))}
                        className="min-w-0 flex-1 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 font-black text-sm rounded-lg text-center tracking-widest font-mono focus:outline-none focus:border-sky-500 bg-white"
                      />
                      <button
                        type="button"
                        disabled={wifiSyncLoading || inputWifiPin.length !== 6}
                        onClick={handleLocalWifiRetrieve}
                        className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 font-extrabold text-xs rounded-lg transition duration-155 cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {wifiSyncLoading ? "Связь..." : "Принять"}
                      </button>
                    </div>
                  </div>
                </div>

                {wifiSyncStatus.type !== "idle" && (
                  <div className={`p-3 rounded-xl border text-[11px] font-medium leading-relaxed ${
                    wifiSyncStatus.type === "success"
                      ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-800 dark:text-emerald-305"
                      : "bg-red-50/50 dark:bg-red-950/20 border-red-250 text-red-805 dark:text-red-350"
                  }`}>
                    {wifiSyncStatus.message}
                  </div>
                )}
              </div>

              {/* Part 3: Manual cloud upload of local dataset */}
              {storageMode === "cloud" && firebaseUser && (
                <div className="p-4 rounded-xl border border-teal-200/50 bg-teal-50/10 dark:border-teal-900 dark:bg-teal-950/10 flex flex-col sm:flex-row items-center justify-between gap-3.5">
                  <div className="space-y-1 sm:max-w-md text-center sm:text-left">
                    <span className="text-[9px] font-black uppercase text-teal-600 dark:text-teal-400 block tracking-widest">
                      Синхронизация с облаком (Cloud Push)
                    </span>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight font-medium">
                      Загрузить все текущие локальные материалы вашей библиотеки непосредственно в ваше облачное хранилище Firebase. Это объединит данные.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={async () => {
                      if (onManualSync) {
                        try {
                          setSyncStatus("Синхронизация...");
                          await onManualSync();
                          setSyncStatus("Готово! Данные в облаке защищены.");
                        } catch (e: any) {
                          setSyncStatus(`Ошибка: ${e.message || String(e)}`);
                        }
                      }
                    }}
                    className="shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-zinc-100 text-white disabled:text-zinc-400 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isSyncing ? "Синхронизация..." : syncStatus || "Форсировать Cloud Sync"}
                  </button>
                </div>
              )}

              {/* Part 4: Secure Data Purge / Clear all local data */}
              <div className="border border-red-150 dark:border-red-900/60 rounded-2xl p-5 bg-red-50/5 dark:bg-red-950/5 space-y-3 shadow-inner">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase bg-red-500/10 dark:bg-red-500/20 text-red-650 dark:text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full tracking-widest leading-none">
                    Опасная зона (Danger Area)
                  </span>
                </div>
                
                <p className="text-zinc-500 dark:text-zinc-400 text-[11px] leading-relaxed font-medium">
                  При нажатии на кнопку ниже ВСЕ ваши локально сохраненные материалы (уроки, слова в словаре, учебные связи и накопленная статистика) будут БЕЗВОЗВРАТНО стерты с этого компьютера. Рекомендуется сначала скачать копию в формате JSON.
                </p>

                <button 
                  type="button"
                  onClick={() => {
                    if (confirm("ВНИМАНИЕ! Вы утеряете весь локальный прогресс. Вы точно хотите стереть все уроки, слова, и статистику с этого компьютера?")) {
                      if (confirm("Вы абсолютно уверены? Это действие сотрет все локальные данные в вашем браузере. Данные в облаке останутся целыми (если залогинены в Cloud mode). Стереть локальный кэш?")) {
                        onClearAllData();
                        setImportStatus({
                          type: "success",
                          message: "Локальный кэш полностью очищен! Локальная библиотека сброшена."
                        });
                      }
                    }
                  }}
                  className="px-4 py-2 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 hover:text-red-700 text-red-600 font-extrabold text-[11px] rounded-xl border border-red-200/50 dark:border-red-900/40 transition duration-150 cursor-pointer shadow-3xs"
                >
                  Удалить все локальные данные с устройства
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/20 shrink-0 select-none">
          <div className="flex items-center gap-3.5">
            {activeSettingsTab === "flags" ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Вы уверены, что хотите сбросить все настроенные флаги на стандартные значения?")) {
                    onResetLanguageFlags();
                    setCustomInputs({});
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 px-3 py-1.5 hover:bg-red-50/55 dark:hover:bg-red-950/20 rounded-xl transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Сбросить флаги (Reset)
              </button>
            ) : activeSettingsTab === "interface" ? (
              <button
                type="button"
                onClick={() => {
                  onZoomScaleChange(100);
                }}
                className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Сбросить масштаб (100%)
              </button>
            ) : activeSettingsTab === "storage" ? (
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800">
                Режим: <span className="text-teal-600 dark:text-teal-400 font-black">{storageMode === "cloud" ? "ОБЛАКО ☁️" : storageMode === "server" ? "СЕРВЕР 🖥️" : "ЛОКАЛЬНЫЙ 💻"}</span>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">
                Связей в базе: {Object.keys(wordLinks).filter(k => k.includes("_")).length}
              </div>
            )}

            <div className="text-[9px] bg-zinc-100/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold px-2 py-0.5 rounded-md border border-zinc-200/40 dark:border-zinc-700/45 font-mono">
              v2.15.0
            </div>
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" /> Готово
          </button>
        </div>

      </div>
    </div>
  );
}
