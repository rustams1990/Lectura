/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Lesson } from "../types";
import { safeJsonParse, getBCP47LanguageTag, FLAG_EMOJI_TO_CODE } from "../utils";
import { useToast } from "../context/ToastContext";
import { APP_VERSION } from "../version";
import { 
  X, Check, Globe, HelpCircle, Save, RotateCcw, Trash2, Link, 
  Maximize2, Sparkles, Database, HardDrive, Download, Upload,
  Wifi, Copy, RefreshCw, TrendingUp, Headphones, Languages, AlertTriangle, UserCheck, ChevronDown, Lightbulb,
  ArrowUp, ArrowDown, Key, Eye, EyeOff, Plus, CheckCircle2, XCircle, Loader2, Zap, Server, ShieldAlert, Cpu, ExternalLink, Activity,
  Calendar, Clock
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { UserAvatarDisplay } from "./ProfileModal";
import { AIProfile, DateFormatOption, TimeFormatOption, FirstDayOfWeekOption, BackupSettings, BackupFileInfo, Playlist } from "../types";
import { formatDate, formatTime, getFirstDayOfWeek, resolveLocale } from "../utils/dateUtils";
import { 
  getOrCreateAiProfiles, testAiProfileConnection, 
  isProfileOnCooldown, getCooldownRemainingSeconds 
} from "../services/aiFailoverService";
import WhisperSettingsManager from "./WhisperSettingsManager";
import IgnoreListsSettingsManager from "./IgnoreListsSettingsManager";
import { Capacitor } from "@capacitor/core";
import { getServerBaseUrl, setServerBaseUrl, testServerConnection } from "../utils/mobileServerBridge";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessons: Lesson[];
  playlists?: Playlist[];
  languageFlags: Record<string, string>;
  onSaveLanguageFlag: (lang: string, flag: string) => void;
  onResetLanguageFlags: () => void;
  // New properties for managing word variation links & scaling
  wordLinks: Record<string, string>;
  onDeleteWordLink?: (sourceKey: string) => void;
  zoomScale: number;
  onZoomScaleChange: (scale: number) => void;
  layoutWidthMode?: "standard" | "wide" | "ultra" | "full";
  onLayoutWidthModeChange?: (mode: "standard" | "wide" | "ultra" | "full") => void;

  // Storage / Backup and Profile capabilities props
  storageMode: "local" | "server" | "cloud";
  onStorageModeChange: (mode: "local" | "server") => void;
  localSyncKey: string;
  onLocalSyncKeyChange: (key: string) => void;
  localSyncError: boolean;
  activeUser?: any;
  onOpenAuthModal?: () => void;
  onLogout?: () => void;
  vocab: Record<string, any>;
  lessonTypes: any[];
  listeningSeconds: number;
  onListeningSecondsChange?: (seconds: number) => void;
  onImportData: (imported: {
    lessons?: Lesson[];
    playlists?: Playlist[];
    lessonTypes?: any[];
    vocab?: Record<string, any>;
    wordLinks?: Record<string, string>;
    listeningSeconds?: number;
    languageFlags?: Record<string, string>;
    history?: any[];
    readerSettings?: Record<string, any>;
    pinnedLanguages?: string[];
    hiddenLanguages?: string[];
    selectedTargetLanguage?: string;
  }) => void;
  history?: any[];
  pinnedLanguages?: string[];
  hiddenLanguages?: string[];
  selectedTargetLanguage?: string;
  onClearAllData?: () => void;
  onClearHistory?: () => void;
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
      label: "Spanish-speaking countries:"
    };
  }

  // English
  if (norm.includes("english") || norm.includes("англ") || norm === "en") {
    return {
      presets: ["🇺🇸", "🇬🇧", "🇨🇦", "🇦🇺", "🇳🇿", "🇮🇪", "🇿🇦", "🇯🇲", "🇸🇬", "🇮🇳"],
      label: "English-speaking countries:"
    };
  }

  // German / Deutsch
  if (norm.includes("german") || norm.includes("немец") || norm.includes("deutsch") || norm === "de") {
    return {
      presets: ["🇩🇪", "🇦🇹", "🇨🇭", "🇱🇮", "🇱🇺", "🇧🇪"],
      label: "German-speaking countries:"
    };
  }

  // French / Français
  if (norm.includes("french") || norm.includes("франц") || norm.includes("français") || norm.includes("francais") || norm === "fr") {
    return {
      presets: ["🇫🇷", "🇨🇦", "🇧🇪", "🇨🇭", "🇲🇨", "🇸🇳", "🇨🇮", "🇨🇲", "🇲🇬", "🇨🇩", "🇭🇹"],
      label: "French-speaking countries:"
    };
  }

  // Portuguese / Português
  if (norm.includes("portuguese") || norm.includes("португал") || norm.includes("português") || norm.includes("portugues") || norm === "pt") {
    return {
      presets: ["🇵🇹", "🇧🇷", "🇦🇴", "🇲🇿", "🇨🇻", "🇬🇼", "🇸🇹", "🇹🇱", "🇲🇴"],
      label: "Portuguese-speaking countries:"
    };
  }

  // Russian / Русский
  if (norm.includes("russian") || norm.includes("русский") || norm.includes("русск") || norm === "ru") {
    return {
      presets: ["🇷🇺", "🇧🇾", "🇰🇿", "🇰🇬"],
      label: "Russian-speaking regions:"
    };
  }

  // Italian / Italiano
  if (norm.includes("italian") || norm.includes("итальян") || norm.includes("italiano") || norm === "it") {
    return {
      presets: ["🇮🇹", "🇨🇭", "🇸🇲", "🇻🇦"],
      label: "Italian-speaking countries:"
    };
  }

  // Chinese / 中文
  if (norm.includes("chinese") || norm.includes("китай") || norm.includes("中文") || norm === "zh") {
    return {
      presets: ["🇨🇳", "🇹🇼", "🇭🇰", "🇸🇬", "🇲🇴"],
      label: "Chinese-speaking regions:"
    };
  }

  // Japanese / 日本語
  if (norm.includes("japanese") || norm.includes("япон") || norm.includes("日本語") || norm === "ja") {
    return {
      presets: ["🇯🇵"],
      label: "Japan:"
    };
  }

  // Korean / 한국어
  if (norm.includes("korean") || norm.includes("корей") || norm.includes("한국어") || norm === "ko") {
    return {
      presets: ["🇰🇷", "🇰🇵"],
      label: "Korean regions:"
    };
  }

  // Arabic / العربية
  if (norm.includes("arabic") || norm.includes("араб") || norm === "ar") {
    return {
      presets: ["🇸🇦", "🇦🇪", "🇪🇬", "🇮🇶", "🇯🇴", "🇱🇧", "🇲🇦", "🇩🇿", "🇹🇳", "🇶🇦", "🇰🇼", "🇴🇲", "🇧🇭"],
      label: "Arabic-speaking countries:"
    };
  }

  // Turkish / Türkçe
  if (norm.includes("turkish") || norm.includes("турец") || norm === "tr") {
    return {
      presets: ["🇹🇷", "🇨🇾"],
      label: "Turkish-speaking regions:"
    };
  }

  // Ukrainian / Українська
  if (norm.includes("ukrainian") || norm.includes("украин") || norm === "uk") {
    return {
      presets: ["🇺🇦"],
      label: "Ukraine:"
    };
  }

  // Kazakh / Қазақ
  if (norm.includes("kazakh") || norm.includes("казах") || norm.includes("қазақ") || norm === "kk") {
    return {
      presets: ["🇰🇿"],
      label: "Kazakhstan:"
    };
  }

  // Polish / Polski
  if (norm.includes("polish") || norm.includes("польск") || norm === "pl") {
    return {
      presets: ["🇵🇱"],
      label: "Poland:"
    };
  }

  // Dutch / Nederlands
  if (norm.includes("dutch") || norm.includes("голланд") || norm.includes("нидерланд") || norm === "nl") {
    return {
      presets: ["🇳🇱", "🇧🇪", "🇸🇷"],
      label: "Dutch-speaking countries:"
    };
  }

  // Swedish / Svenska
  if (norm.includes("swedish") || norm.includes("швед") || norm === "sv") {
    return {
      presets: ["🇸🇪", "🇫🇮"],
      label: "Sweden & Finland:"
    };
  }

  // Greek / Ελληνικά
  if (norm.includes("greek") || norm.includes("греч") || norm === "el") {
    return {
      presets: ["🇬🇷", "🇨🇾"],
      label: "Greece & Cyprus:"
    };
  }

  // Hindi
  if (norm.includes("hindi") || norm.includes("хинди") || norm === "hi") {
    return {
      presets: ["🇮🇳"],
      label: "India:"
    };
  }

  // Default fallback flags list
  return {
    presets: ALL_WORLD_FLAGS.slice(0, 24),
    label: "Choose a suitable flag:"
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
  playlists = [],
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
  activeUser,
  onOpenAuthModal,
  onLogout,
  vocab,
  lessonTypes,
  listeningSeconds,
  onImportData,
  onClearAllData,
  onClearHistory,
  onManualSync,
  isSyncing = false,
  settings,
  onSettingsChange,
  history,
  pinnedLanguages,
  hiddenLanguages,
  selectedTargetLanguage,
}: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { updateProfile, serverToken } = useAuth();
  const [hintInput, setHintInput] = useState<string>(activeUser?.passwordHint || "");
  const [isSavingHint, setIsSavingHint] = useState<boolean>(false);
  const [hintSavedSuccess, setHintSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (activeUser) {
      setHintInput(activeUser.passwordHint || "");
    }
  }, [activeUser]);

  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [activeSettingsTab, setActiveSettingsTab] = useState<"flags" | "interface" | "audio" | "ai" | "whisper" | "stats" | "ignore_lists" | "storage">("flags");
  const [importStatus, setImportStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showConfirmClearHistory, setShowConfirmClearHistory] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatic & Server Backups State
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({
    enabled: true,
    intervalHours: 24,
    maxKeep: 5,
    lastBackupTime: null,
  });
  const [isLoadingBackupSettings, setIsLoadingBackupSettings] = useState<boolean>(false);
  const [serverBackups, setServerBackups] = useState<BackupFileInfo[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [confirmRestoreBackup, setConfirmRestoreBackup] = useState<BackupFileInfo | null>(null);
  const [isRestoringServerBackup, setIsRestoringServerBackup] = useState<boolean>(false);

  // Server Connection URL State (Universal Self-Hosted Resolver)
  const [mobileServerInput, setMobileServerInput] = useState<string>(() => {
    try {
      return localStorage.getItem('lectura_custom_server_url') || localStorage.getItem('lectura_mobile_server_url') || '';
    } catch {
      return '';
    }
  });
  const [testingMobileServer, setTestingMobileServer] = useState<boolean>(false);
  const [mobileServerStatus, setMobileServerStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      "x-local-sync-key": localSyncKey || "",
      "x-local-sync-user": activeUser?.id || activeUser?.email || "default",
    };
    if (serverToken) {
      headers["Authorization"] = `Bearer ${serverToken}`;
    }
    return headers;
  };

  const fetchBackupSettings = async () => {
    try {
      setIsLoadingBackupSettings(true);
      const res = await fetch("/api/settings/backup", { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "ok" && json.data) {
          setBackupSettings(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch backup settings:", err);
    } finally {
      setIsLoadingBackupSettings(false);
    }
  };

  const updateBackupSettings = async (patch: Partial<BackupSettings>) => {
    setBackupSettings((prev) => ({ ...prev, ...patch }));
    try {
      const res = await fetch("/api/settings/backup", {
        method: "PATCH",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success" && json.data) {
          setBackupSettings(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to update backup settings:", err);
    }
  };

  const fetchServerBackups = async () => {
    try {
      setIsLoadingBackups(true);
      const res = await fetch("/api/backups", { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "ok" && Array.isArray(json.data)) {
          setServerBackups(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch server backups:", err);
      showToast(t("settings.err_fetch_backups", "Failed to fetch backups from server"), "error");
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleCreateServerBackup = async () => {
    try {
      setIsCreatingBackup(true);
      const res = await fetch("/api/backups/create", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success") {
          showToast(t("settings.backup_created_success", "Backup created successfully!"), "success");
          fetchServerBackups();
          fetchBackupSettings();
        }
      } else {
        const json = await res.json().catch(() => ({}));
        showToast(json.error || t("settings.err_export_backup", "Error creating backup"), "error");
      }
    } catch (err: any) {
      showToast(err.message || String(err), "error");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleExecuteRestoreServerBackup = async () => {
    if (!confirmRestoreBackup) return;
    try {
      setIsRestoringServerBackup(true);
      const res = await fetch(`/api/backups/restore/${encodeURIComponent(confirmRestoreBackup.filename)}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success" && json.data) {
          onImportData(json.data);
          showToast(t("settings.restore_success", "Data restored successfully from backup!"), "success");
          setConfirmRestoreBackup(null);
          fetchServerBackups();
        }
      } else {
        const json = await res.json().catch(() => ({}));
        showToast(json.error || t("settings.err_restore_backup", "Failed to restore backup"), "error");
      }
    } catch (err: any) {
      showToast(err.message || String(err), "error");
    } finally {
      setIsRestoringServerBackup(false);
    }
  };

  const handleDownloadServerBackup = async (filename: string) => {
    try {
      const res = await fetch(`/api/backups/download/${encodeURIComponent(filename)}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        showToast(t("settings.err_export_backup", "Error downloading backup"), "error");
      }
    } catch (err: any) {
      showToast(err.message || String(err), "error");
    }
  };

  const handleDeleteServerBackup = async (filename: string) => {
    if (!confirm(t("settings.delete_backup_confirm", "Are you sure you want to delete backup file \"{{filename}}\"?", { filename }))) {
      return;
    }
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showToast(t("settings.backup_deleted_success", "Backup file deleted."), "success");
        fetchServerBackups();
      } else {
        showToast(t("settings.err_delete_backup", "Failed to delete backup"), "error");
      }
    } catch (err: any) {
      showToast(err.message || String(err), "error");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatBackupDateTime = (timestamp: number | string): string => {
    try {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString(resolveLocale(i18n.language), {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (_) {}
    return String(timestamp);
  };

  useEffect(() => {
    if (isOpen && activeSettingsTab === "storage") {
      fetchBackupSettings();
      fetchServerBackups();
    }
  }, [isOpen, activeSettingsTab]);

  const [listeningMinsInput, setListeningMinsInput] = useState<string>(Math.round((listeningSeconds || 0) / 60).toString());
  const [listeningSaveMsg, setListeningSaveMsg] = useState<string | null>(null);
  const [showAllFlagsMap, setShowAllFlagsMap] = useState<Record<string, boolean>>({});

  const [confirmImport, setConfirmImport] = useState<{
    data: any;
    dateFormatted: string;
    username?: string;
    lessonsCount: number;
    playlistsCount?: number;
    wordsCount: number;
    historyCount?: number;
  } | null>(null);

  const handleExportDataLocal = () => {
    try {
      const rawUsername = activeUser?.username || activeUser?.email?.split("@")[0] || activeUser?.displayName || "";
      const cleanUsername = rawUsername.replace(/[^a-zA-Z0-9_-]/g, "");

      const backupFile = {
        version: "1.0",
        username: cleanUsername || undefined,
        exportDate: new Date().toISOString(),
        lessons,
        playlists: playlists || [],
        lessonTypes,
        vocab,
        wordLinks,
        listeningSeconds,
        languageFlags,
        history: history || [],
        readerSettings: settings || null,
        pinnedLanguages: pinnedLanguages || [],
        hiddenLanguages: hiddenLanguages || [],
        selectedTargetLanguage: selectedTargetLanguage || null,
      };

      const jsonString = JSON.stringify(backupFile, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      const dateStr = new Date().toISOString().substring(0, 10);
      downloadAnchor.download = cleanUsername ? `lectura_backup_${cleanUsername}_${dateStr}.json` : `lectura_backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Failed to export backup JSON:", e);
      showToast(`${t("settings.err_export_backup", "Error exporting backup:")} ${e.message || String(e)}`, "error");
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
          (!parsed.lessons && !parsed.vocab && !parsed.words && !parsed.wordLinks && !parsed.lessonTypes && !parsed.playlists)
        ) {
          throw new Error(t("settings.err_invalid_structure", "Invalid backup file structure. Must contain at least one list: lessons, words, or links."));
        }

        let dateFormatted = "Не указана";
        if (parsed.exportDate) {
          try {
            const d = new Date(parsed.exportDate);
            if (!isNaN(d.getTime())) {
              dateFormatted = d.toLocaleString(resolveLocale(i18n.language), {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              });
            }
          } catch (_) {}
        } else if (file.lastModified) {
          try {
            const d = new Date(file.lastModified);
            dateFormatted = d.toLocaleString(resolveLocale(i18n.language), {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            });
          } catch (_) {}
        }

        const lessonsCount = parsed.lessons?.length || 0;
        const playlistsCount = parsed.playlists?.length || 0;
        const wordsCount = Object.keys(parsed.vocab || parsed.words || {}).length || 0;
        const historyCount = Array.isArray(parsed.history) ? parsed.history.length : 0;

        setConfirmImport({
          data: parsed,
          dateFormatted,
          username: parsed.username || undefined,
          lessonsCount,
          playlistsCount,
          wordsCount,
          historyCount,
        });
      } catch (err: any) {
        setImportStatus({
          type: "error",
          message: `${t("settings.err_read_backup", "Error reading backup file:")} ${err.message || String(err)}`
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestoreHistoryOnly = () => {
    if (!confirmImport || !confirmImport.data?.history) return;
    onImportData({ history: confirmImport.data.history });
    const count = confirmImport.data.history.length;
    setImportStatus({
      type: "success",
      message: `${t("settings.restore_history_success", "Activity history restored successfully!")} (${count} ${t("settings.history_records_unit", "records")})`
    });
    setConfirmImport(null);
  };

  const handleExecuteImport = () => {
    if (!confirmImport) return;
    const { data, lessonsCount, playlistsCount, wordsCount } = confirmImport;
    onImportData(data);
    const plText = playlistsCount ? `, ${playlistsCount} ${t("playlist.collection", "playlists")}` : "";
    setImportStatus({
      type: "success",
      message: `${t("settings.import_success", "Import complete! Loaded:")} ${lessonsCount} ${t("settings.lessons_unit", "lessons")}${plText}, ${wordsCount} ${t("settings.words_unit", "words.")}`
    });
    setConfirmImport(null);
  };

  // Detect all unique target languages in the user library that actually have materials (lessons)
  const detectedLanguages = useMemo(() => {
    const set = new Set<string>();
    lessons.forEach((l) => {
      if (l.targetLanguage) {
        const trimmed = l.targetLanguage.trim();
        if (trimmed) {
          const norm = trimmed.toLowerCase();
          // Exclude single-flag languages with no variant flags (Japanese, Kazakh, Ukrainian)
          if (
            norm.includes("japan") || norm.includes("япон") || norm === "ja" ||
            norm.includes("kazak") || norm.includes("казах") || norm.includes("қаза") || norm === "kk" ||
            norm.includes("ukrai") || norm.includes("украин") || norm.includes("україн") || norm === "uk"
          ) {
            return;
          }
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
                {t('settings.title', 'Application Settings')} <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded-md font-mono text-zinc-600 dark:text-zinc-400">{APP_VERSION}</span>
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5 font-medium leading-relaxed">
                {t('settings.subtitle', 'Configure interface scale, manage word connections and flag visuals.')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title={t('settings.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Header */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/30 px-3 sm:px-6 select-none shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveSettingsTab("flags")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "flags"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            🚩 {t('settings.tab_flags', 'Language Flags')}
          </button>
          <button
            onClick={() => setActiveSettingsTab("interface")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "interface"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            📐 {t('settings.tab_ui', 'Interface')}
          </button>
          <button
            onClick={() => setActiveSettingsTab("audio")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "audio"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            🎙️ {t('settings.tab_audio', 'Audio (TTS)')}
          </button>
          <button
            onClick={() => setActiveSettingsTab("ai")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "ai"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            ✨ {t('settings.tab_ai', 'AI Assistant')}
          </button>
          <button
            onClick={() => setActiveSettingsTab("whisper")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "whisper"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            ⚡ {t('settings.tab_whisper', 'Whisper (STT)')}
          </button>
          <button
            onClick={() => setActiveSettingsTab("stats")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "stats"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            📊 {t('settings.tab_stats', 'Statistics')}
          </button>
          <button
            onClick={() => setActiveSettingsTab("ignore_lists")}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "ignore_lists"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            🛡️ {t('settings.tab_ignore_lists', 'Игнор-листы')}
          </button>
          <button
            onClick={() => {
              setActiveSettingsTab("storage");
              setImportStatus({ type: "idle" });
              setSyncStatus(null);
            }}
            className={`py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-wider relative transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeSettingsTab === "storage"
                ? "text-teal-600 dark:text-teal-400 border-teal-500 font-black"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent"
            }`}
          >
            💾 {t('settings.tab_storage', 'Data & Sync')}
          </button>
        </div>

        {/* Modal Scrollable Contents */}
        <div className="p-6 overflow-y-auto flex-grow">
          
          {/* Active Tab: Languages & Flags */}
          {activeSettingsTab === "flags" && (
            <div className="space-y-6 divide-y divide-zinc-100 dark:divide-zinc-800">
              {detectedLanguages.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 dark:text-zinc-500 font-medium">
                  {t('settings.no_languages', '📚 Your library has no languages yet. Load or select a lesson to configure flags!')}
                </div>
              ) : (
                detectedLanguages.map((lang, index) => {
                  const langLower = lang.toLowerCase();
                  const currentFlag = (languageFlags[langLower] && languageFlags[langLower] !== "📖") ? languageFlags[langLower] : (DEFAULT_FALLBACK_FLAGS[langLower] || "🇵🇹");
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
                            {t('settings.current_flag', 'Current flag:')} <span className="font-mono bg-zinc-100 dark:bg-zinc-950 px-1 py-0.5 rounded">{currentFlag}</span>
                          </p>
                        </div>
                      </div>

                      {/* Flag Selection Presets Grid and Custom input block */}
                      <div className="flex-1 space-y-3">
                        {/* Presets Grid */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                              {isShowingAll ? t('settings.all_world_flags', 'All world flags:') : flagConfig.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAllFlagsMap(prev => ({ ...prev, [langLower]: !isShowingAll }))}
                              className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                            >
                              {isShowingAll ? t('settings.show_matching', 'Show matching only') : t('settings.all_flags', '🌐 All Flags')}
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
                              placeholder={t('settings.flag_placeholder', '...or paste your flag emoji here')}
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
                            <Check className="w-3.5 h-3.5" /> {t('settings.apply', 'Apply')}
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Active Tab: Interface Scale */}
          {activeSettingsTab === "interface" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Scalable UI Language Selector */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                      <Languages className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                        {t('settings.language', 'Interface Language')}
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                        {t('settings.language_desc', 'Choose the app language. Changes apply immediately.')}
                      </p>
                    </div>
                  </div>

                  {/* Scalable Select Dropdown */}
                  <div className="w-full sm:w-64 shrink-0">
                    <div className="relative">
                      <select
                        value={["en", "de", "es", "fr", "it", "pl", "pt", "ru", "tr", "uk", "zh", "ja", "ko"].includes(i18n.language) ? i18n.language : (i18n.language?.slice(0, 2) || "en")}
                        onChange={(e) => {
                          const lang = e.target.value;
                          i18n.changeLanguage(lang);
                          try {
                            localStorage.setItem("i18nextLng", lang);
                          } catch (_) {}
                        }}
                        aria-label="Interface Language"
                        className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold py-2.5 pl-3.5 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer shadow-3xs"
                      >
                        <option value="en" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇬🇧 English
                        </option>
                        <option value="de" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇩🇪 Deutsch (German)
                        </option>
                        <option value="es" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇪🇸 Español (Spanish)
                        </option>
                        <option value="fr" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇫🇷 Français (French)
                        </option>
                        <option value="it" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇮🇹 Italiano (Italian)
                        </option>
                        <option value="pl" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇵🇱 Polski (Polish)
                        </option>
                        <option value="pt" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇧🇷 Português (Portuguese)
                        </option>
                        <option value="ru" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇷🇺 Русский (Russian)
                        </option>
                        <option value="tr" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇹🇷 Türkçe (Turkish)
                        </option>
                        <option value="uk" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇺🇦 Українська (Ukrainian)
                        </option>
                        <option value="zh" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇨🇳 简体中文 (Chinese)
                        </option>
                        <option value="ja" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇯🇵 日本語 (Japanese)
                        </option>
                        <option value="ko" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold py-1">
                          🇰🇷 한국어 (Korean)
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Regional Preferences (Date & Time Formats) */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                        {t('settings.regional_preferences', 'Regional Preferences')}
                      </h4>
                      {/* Live Preview Badge */}
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-[11px] font-mono font-bold text-teal-600 dark:text-teal-400 shadow-3xs">
                        <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="text-zinc-500 dark:text-zinc-400 font-sans font-normal text-[10px]">{t('settings.live_preview', 'Preview:')}</span>
                        <span>
                          {formatDate(new Date(), { datePref: (settings?.dateFormat as DateFormatOption) || 'auto', appLocale: i18n.language })}
                          {' • '}
                          {formatTime(new Date(), { timePref: (settings?.timeFormat as TimeFormatOption) || 'auto', appLocale: i18n.language })}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      {t('settings.regional_preferences_desc', 'Date and time display formats across lists, vocabulary, and stats.')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  {/* Date Format Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {t('settings.date_format', 'Date Format')}
                    </label>
                    <div className="relative">
                      <select
                        value={(settings?.dateFormat as string) || "auto"}
                        onChange={(e) => {
                          const val = e.target.value as DateFormatOption;
                          onSettingsChange?.({ dateFormat: val });
                        }}
                        aria-label="Date Format"
                        className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold py-2.5 pl-3.5 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer shadow-3xs"
                      >
                        <option value="auto">
                          {t('settings.format_auto', 'Automatic (by language)')} — {formatDate(new Date(), { datePref: 'auto', appLocale: i18n.language })}
                        </option>
                        <option value="DD.MM.YYYY">
                          DD.MM.YYYY — {formatDate(new Date(), { datePref: 'DD.MM.YYYY' })}
                        </option>
                        <option value="DD/MM/YYYY">
                          DD/MM/YYYY — {formatDate(new Date(), { datePref: 'DD/MM/YYYY' })}
                        </option>
                        <option value="MM/DD/YYYY">
                          MM/DD/YYYY — {formatDate(new Date(), { datePref: 'MM/DD/YYYY' })}
                        </option>
                        <option value="YYYY-MM-DD">
                          YYYY-MM-DD — {formatDate(new Date(), { datePref: 'YYYY-MM-DD' })}
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Time Format Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {t('settings.time_format', 'Time Format')}
                    </label>
                    <div className="relative">
                      <select
                        value={(settings?.timeFormat as string) || "auto"}
                        onChange={(e) => {
                          const val = e.target.value as TimeFormatOption;
                          onSettingsChange?.({ timeFormat: val });
                        }}
                        aria-label="Time Format"
                        className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold py-2.5 pl-3.5 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer shadow-3xs"
                      >
                        <option value="auto">
                          {t('settings.format_auto', 'Automatic (by language)')} — {formatTime(new Date(), { timePref: 'auto', appLocale: i18n.language })}
                        </option>
                        <option value="24h">
                          {t('settings.time_24h', '24-hour (22:30)')} — {formatTime(new Date(), { timePref: '24h' })}
                        </option>
                        <option value="12h">
                          {t('settings.time_12h', '12-hour (10:30 PM)')} — {formatTime(new Date(), { timePref: '12h' })}
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* First Day of Week Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {t('settings.first_day_of_week', 'First Day of the Week')}
                    </label>
                    <div className="relative">
                      <select
                        value={(settings?.firstDayOfWeek as string) || "auto"}
                        onChange={(e) => {
                          const val = e.target.value as FirstDayOfWeekOption;
                          onSettingsChange?.({ firstDayOfWeek: val });
                        }}
                        aria-label="First Day of the Week"
                        className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold py-2.5 pl-3.5 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer shadow-3xs"
                      >
                        <option value="auto">
                          {t('settings.format_auto', 'Automatic (by language)')} ({getFirstDayOfWeek('auto', i18n.language) === 1 ? t('settings.first_day_monday', 'Monday') : t('settings.first_day_sunday', 'Sunday')})
                        </option>
                        <option value="monday">
                          {t('settings.first_day_monday', 'Monday (Europe, CIS)')}
                        </option>
                        <option value="sunday">
                          {t('settings.first_day_sunday', 'Sunday (US, Canada)')}
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                    <Maximize2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                      {t("settings.zoom_title", "Interface Zoom")}
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      {t("settings.zoom_desc", "Control the app scale to make text more readable or fit more information. Changes apply instantly.")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4.5 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                      {t("settings.active_zoom", "Active Zoom:")}
                    </span>
                    <div className="text-xl font-black text-zinc-800 dark:text-white flex items-center gap-2 font-mono">
                      {zoomScale}% {zoomScale === 100 && <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{t("settings.recommended", "(Recommended)")}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onZoomScaleChange(Math.max(70, zoomScale - 5))}
                      disabled={zoomScale <= 70}
                      className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center text-base"
                      title={t("settings.decrease_zoom", "Decrease zoom (-5%)")}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => onZoomScaleChange(Math.min(150, zoomScale + 5))}
                      disabled={zoomScale >= 150}
                      className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center text-base"
                      title={t("settings.increase_zoom", "Increase zoom (+5%)")}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Width Selector setting */}
                {layoutWidthMode && onLayoutWidthModeChange && (
                  <div className="border-t border-zinc-100/60 dark:border-zinc-800 pt-5 space-y-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                      {t("settings.max_width", "Maximum interface width:")}
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: "standard", label: t("settings.width_std", "Standard (1280px)"), desc: t("settings.width_std_desc", "Compact view") },
                        { id: "wide", label: t("settings.width_wide", "Wide (1560px)"), desc: t("settings.width_wide_desc", "Balanced") },
                        { id: "full", label: t("settings.width_full", "Full screen"), desc: t("settings.width_full_desc", "Maximum space") },
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
                    {t("settings.scale_preview", "Scale Live Preview")}
                  </span>
                  <p className="text-zinc-800 dark:text-zinc-200 text-xs font-medium leading-relaxed max-w-sm mx-auto">
                    {t("settings.scale_preview_desc", "This box simulates changes. At scale {{zoomScale}}%, fonts and buttons adjust accordingly.", { zoomScale })}
                  </p>
                  <button className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-[11px] rounded-xl shadow-xs cursor-pointer select-none">
                    {t("settings.demo_btn", "Demo Button!")}
                  </button>
                </div>
              </div>

              {/* Book Covers Dimming Filter Option */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                    {t("settings.dim_covers_label", "Затемнение обложек в библиотеке")}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {t("settings.dim_covers_desc", "Накладывать затемняющий градиентный фильтр на обложки книг для контраста текста (по умолчанию выключено).")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSettingsChange?.({ dimBookCovers: !settings?.dimBookCovers })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings?.dimBookCovers ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      settings?.dimBookCovers ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Active Tab: Audio & TTS */}
          {activeSettingsTab === "audio" && (
            <div className="space-y-6 animate-in fade-in duration-200">
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
                      {t('settings.tts_engine', 'Word Audio Engine (TTS)')}
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      {t('settings.tts_desc', 'Choose the voice for word pronunciation when clicking the 🔊 button on a word card.')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {([
                    { id: "google", label: "Google Translate TTS", badge: t('settings.google_badge', 'As in AwesomeTTS'), icon: "🎙️", desc: t('settings.google_desc', 'Same voice as Anki AwesomeTTS plugin. Clean, pleasant, free — no API key needed.') },
                    { id: "kokoro", label: "Kokoro-82M / Local TTS", badge: t('settings.kokoro_badge', 'Offline / Local AI'), icon: "🧠", desc: t('settings.kokoro_desc', 'Studio neural voice (Kokoro-82M / Piper). Works locally on your server without cloud.') },
                    { id: "gemini", label: "Gemini AI (Neural)", badge: t('settings.gemini_badge', 'Requires API key'), icon: "✨", desc: t('settings.gemini_desc', 'Gemini neural voice — very natural and alive. Requires GEMINI_API_KEY (free tier limit: 10 words/day).') },
                    { id: "browser", label: t('settings.browser_label', 'Browser (Built-in)'), badge: t('settings.browser_badge', 'Offline'), icon: "💻", desc: t('settings.browser_desc', 'System OS voice. Works offline without internet, but quality depends on OS.') },
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
                        {t('settings.kokoro_settings', 'Kokoro / Local TTS Settings')}
                      </h5>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                          {t('settings.local_tts_url', 'Local TTS server URL (OpenAI-compatible / Kokoro / Piper):')}
                        </label>
                        <input
                          type="text"
                          value={settings?.localTtsUrl || "http://localhost:8880/v1/audio/speech"}
                          onChange={(e) => onSettingsChange?.({ localTtsUrl: e.target.value })}
                          placeholder="http://localhost:8880/v1/audio/speech"
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:ring-2 focus:ring-violet-500 focus:outline-none"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {t('settings.kokoro_port_note', 'Standard port for kokoro-fastapi:')} <code>http://localhost:8880/v1/audio/speech</code>
                        </p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                          {t('settings.voice_name', 'Voice name:')}
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
                          <span className="text-[10px] text-zinc-400 self-center mr-1">{t('settings.presets', 'Presets:')}</span>
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
                      lang: t('settings.lang_english', 'English 🇺🇸🇬🇧'),
                      locales: [
                        { code: "en-US", label: "🇺🇸 American (en-US)" },
                        { code: "en-GB", label: "🇬🇧 British (en-GB)" },
                        { code: "en-AU", label: "🇦🇺 Australian (en-AU)" },
                        { code: "en-CA", label: "🇨🇦 Canadian (en-CA)" },
                        { code: "en-IN", label: "🇮🇳 Indian (en-IN)" },
                      ],
                    },
                    {
                      lang: t('settings.lang_spanish', 'Spanish 🇪🇸🇲🇽'),
                      locales: [
                        { code: "es-US", label: "🇲🇽 Mexican (es-US)" },
                        { code: "es-ES", label: "🇪🇸 Spanish (es-ES)" },
                        { code: "es-AR", label: "🇦🇷 Argentinian (es-AR)" },
                      ],
                    },
                    {
                      lang: t('settings.lang_portuguese', 'Portuguese 🇧🇷🇵🇹'),
                      locales: [
                        { code: "pt-BR", label: "🇧🇷 Brazilian (pt-BR)" },
                        { code: "pt-PT", label: "🇵🇹 European (pt-PT)" },
                      ],
                    },
                    {
                      lang: t('settings.lang_french', 'French 🇫🇷🇨🇦'),
                      locales: [
                        { code: "fr-FR", label: "🇫🇷 French (fr-FR)" },
                        { code: "fr-CA", label: "🇨🇦 Canadian (fr-CA)" },
                      ],
                    },
                    {
                      lang: t('settings.lang_chinese', 'Chinese 🇨🇳🇹🇼'),
                      locales: [
                        { code: "zh-CN", label: "🇨🇳 Mandarin (zh-CN)" },
                        { code: "zh-TW", label: "🇹🇼 Taiwanese (zh-TW)" },
                      ],
                    },
                    {
                      lang: t('settings.lang_other', 'Other languages'),
                      locales: [
                        { code: "de-DE", label: "🇩🇪 German (de-DE)" },
                        { code: "it-IT", label: "🇮🇹 Italian (it-IT)" },
                        { code: "ru-RU", label: "🇷🇺 Russian (ru-RU)" },
                        { code: "uk-UA", label: "🇺🇦 Ukrainian (uk-UA)" },
                        { code: "ja-JP", label: "🇯🇵 Japanese (ja-JP)" },
                        { code: "ko-KR", label: "🇰🇷 Korean (ko-KR)" },
                        { code: "tr-TR", label: "🇹🇷 Turkish (tr-TR)" },
                        { code: "ar-SA", label: "🇸🇦 Arabic (ar-SA)" },
                      ],
                    },
                  ];
                  return (
                    <div className="mt-1 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌍</span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                          {t("settings.tts_accent", "Accent / Google TTS Dialect")}
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
              </div>
            </div>
          )}

          {/* Active Tab: AI Assistant */}
          {activeSettingsTab === "ai" && (
            <AIProfilesManager
              settings={settings}
              onSettingsChange={onSettingsChange}
              t={t}
            />
          )}

          {/* Active Tab: Local Whisper STT */}
          {activeSettingsTab === "whisper" && (
            <WhisperSettingsManager
              settings={settings}
              onSettingsChange={onSettingsChange}
              t={t}
            />
          )}

          {/* Active Tab: Book Card Statistics */}
          {activeSettingsTab === "stats" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Book Card Stats Section */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
                      {t("settings.detailed_stats", "Detailed stats on book cards")}
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      {t("settings.detailed_stats_desc", "Show separate comprehension stats (by total words) and vocabulary stats (by unique lemmas) on book cards.")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t("settings.enable_detailed", "Enable detailed stats (Vocabulary & New %)")}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSettingsChange?.({ showDetailedVocabularyStats: !settings?.showDetailedVocabularyStats })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings?.showDetailedVocabularyStats ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          settings?.showDetailedVocabularyStats ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t("settings.main_stat_label", "Show on the main book card bar:")}
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
                        title={t("settings.show_comprehension", "Show comprehension percentage by total words")}
                      >
                        {t("settings.understood_label", "Understood")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSettingsChange?.({ mainStatsMetric: "vocabulary" })}
                        className={`h-7 px-3 flex items-center justify-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                          settings?.mainStatsMetric === "vocabulary"
                            ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                        }`}
                        title={t("settings.show_vocabulary", "Show unique vocabulary percentage")}
                      >
                        {t("settings.vocab_label", "Vocabulary")}
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-zinc-100 dark:border-zinc-800 my-1"></div>

                  {/* Vocabulary Counting Mode: All Forms vs Parents Only */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                        {t("settings.vocab_count_mode_label", "Vocabulary Counting Mode:")}
                      </span>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                        {settings?.onlyPatterns
                          ? t("settings.vocab_count_mode_parents_desc", "Counting root/parent words (be, been, is = 1 parent word)")
                          : t("settings.vocab_count_mode_all_desc", "Counting all word forms separately (be, been, is = 3 words)")}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 font-sans shrink-0">
                      <button
                        type="button"
                        onClick={() => onSettingsChange?.({ onlyPatterns: false })}
                        className={`h-7 px-3 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                          !settings?.onlyPatterns
                            ? "bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-xs border border-zinc-100/70 dark:border-zinc-700 font-black"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                        }`}
                      >
                        <span>🔤</span>
                        <span>{t("settings.all_forms", "All Forms")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSettingsChange?.({ onlyPatterns: true })}
                        className={`h-7 px-3 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                          settings?.onlyPatterns
                            ? "bg-teal-600 text-white shadow-xs font-black"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                        }`}
                      >
                        <span>🔗</span>
                        <span>{t("settings.parents_only", "Parents Only")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Tab: Noise Filtering & Ignore Lists */}
          {activeSettingsTab === "ignore_lists" && (
            <IgnoreListsSettingsManager
              settings={settings as any}
              onSettingsChange={onSettingsChange}
              availableLanguages={detectedLanguages.length > 0 ? detectedLanguages : ["Spanish", "English", "French", "German", "Russian"]}
              selectedTargetLanguage={selectedTargetLanguage}
              t={t}
            />
          )}

          {/* Active Tab: Database & Storage Settings */}
          {activeSettingsTab === "storage" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Part 1: User Profile & Database Sync */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <h4 className="text-xs sm:text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">
                      {t('settings.profile_and_sync', 'Профиль и Синхронизация')}
                    </h4>
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                    {t('settings.sync_active', 'Синхронизация активна')}
                  </span>
                </div>

                {activeUser ? (
                  <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <UserAvatarDisplay
                          avatarUrl={activeUser.avatarUrl}
                          name={activeUser.displayName || activeUser.username || activeUser.email}
                          size="md"
                        />
                        <div>
                          <div className="text-xs font-black text-zinc-900 dark:text-white">
                            {activeUser.displayName || activeUser.username || activeUser.email || "Пользователь"}
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {t('settings.profile_sync_desc', 'Все материалы, слова и прогресс автоматически сохраняются в вашей базе данных SQLite.')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {onOpenAuthModal && (
                          <button
                            type="button"
                            onClick={onOpenAuthModal}
                            className="flex-1 sm:flex-initial px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl font-bold text-xs transition cursor-pointer"
                          >
                            {t('settings.switch_profile', 'Сменить профиль')}
                          </button>
                        )}
                        {onLogout && (
                          <button
                            type="button"
                            onClick={onLogout}
                            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-xl font-bold text-xs transition cursor-pointer"
                          >
                            {t('settings.logout', 'Выйти')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Password Hint Field */}
                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span>{t('auth.password_hint_label', 'Подсказка к паролю:')}</span>
                        </label>
                        {hintSavedSuccess && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" /> {t('auth.password_hint_saved', 'Сохранено')}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={hintInput}
                          onChange={(e) => {
                            setHintInput(e.target.value);
                            setHintSavedSuccess(false);
                          }}
                          placeholder={t('auth.placeholder_password_hint', 'Подсказка к паролю (например: девичья фамилия матери)')}
                          className="flex-1 text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        <button
                          type="button"
                          disabled={isSavingHint}
                          onClick={async () => {
                            if (!updateProfile) return;
                            setIsSavingHint(true);
                            try {
                              const res = await updateProfile({ passwordHint: hintInput.trim() || null });
                              if (res.success) {
                                setHintSavedSuccess(true);
                                showToast(t('auth.password_hint_saved', 'Подсказка к паролю сохранена!'), 'success');
                                setTimeout(() => setHintSavedSuccess(false), 3000);
                              } else {
                                showToast(res.error || 'Ошибка при сохранении', 'error');
                              }
                            } catch (e: any) {
                              showToast(e.message || 'Ошибка', 'error');
                            } finally {
                              setIsSavingHint(false);
                            }
                          }}
                          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 shadow-sm shrink-0"
                        >
                          {t('auth.password_hint_save_btn', 'Сохранить')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
                    <div>
                      <div className="text-xs font-black text-zinc-900 dark:text-white">
                        {t('settings.guest_profile', 'Гостевой режим')}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {t('settings.guest_desc', 'Войдите или создайте аккаунт, чтобы сохранять материалы и синхронизировать прогресс чтения между устройствами.')}
                      </p>
                    </div>

                    {onOpenAuthModal && (
                      <button
                        type="button"
                        onClick={onOpenAuthModal}
                        className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-sm shrink-0"
                      >
                        {t('settings.login_or_register', 'Войти в профиль')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Universal Server Connection URL (Self-Hosted & Multi-User Ready) */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <h4 className="text-xs sm:text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">
                      {t('settings.server_connection', 'Server Connection URL')}
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-[200px]">
                    {getServerBaseUrl()}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                  {t('settings.server_connection_desc', 'Specify your custom Lectura server address or leave empty for automatic network host detection.')}
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={mobileServerInput}
                    onChange={(e) => {
                      setMobileServerInput(e.target.value);
                      setMobileServerStatus(null);
                    }}
                    placeholder={`${t('settings.server_auto_placeholder', 'Auto-detect (Current Host)')} [${getServerBaseUrl()}]`}
                    className="flex-1 text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={testingMobileServer}
                      onClick={async () => {
                        setTestingMobileServer(true);
                        const targetUrl = mobileServerInput.trim() || getServerBaseUrl();
                        const res = await testServerConnection(targetUrl);
                        setMobileServerStatus(res);
                        setTestingMobileServer(false);
                        if (res.ok) {
                          showToast(t('settings.server_test_success', 'Server connection healthy ({{version}})', { version: res.version || 'v2.x' }), 'success');
                        } else {
                          showToast(res.message, 'error');
                        }
                      }}
                      className="px-3.5 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                      title={t('settings.test_connection', 'Test Connection')}
                    >
                      {testingMobileServer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      <span>{t('settings.test_connection', 'Test Connection')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await setServerBaseUrl(mobileServerInput.trim());
                        showToast(mobileServerInput.trim() ? t('settings.server_saved', 'Server URL saved!') : t('settings.server_auto_saved', 'Reset to automatic server detection!'), 'success');
                      }}
                      className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{t('common.save', 'Save')}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileServerInput('');
                      setMobileServerStatus(null);
                    }}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-sans font-bold hover:bg-teal-100 dark:hover:bg-teal-950 transition cursor-pointer flex items-center gap-1"
                  >
                    ⚡ {t('settings.auto_detect', 'Auto-detect (Current Host)')}
                  </button>
                  {typeof window !== 'undefined' && window.location.origin && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileServerInput(window.location.origin);
                        setMobileServerStatus(null);
                      }}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono hover:bg-teal-100 dark:hover:bg-teal-950 transition cursor-pointer"
                    >
                      {window.location.origin}
                    </button>
                  )}
                </div>

                {mobileServerStatus && (
                  <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${mobileServerStatus.ok ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800' : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                    {mobileServerStatus.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    <span>{mobileServerStatus.message}</span>
                  </div>
                )}
              </div>

              {/* Part 2: Local JSON backups: export and import files on computer */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <h4 className="text-xs sm:text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">
                    {t('settings.local_backups', 'Disk Backups (Local Backups)')}
                  </h4>
                </div>
                
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                  {t("settings.backup_desc", "You can download a full copy of your entire library, vocabulary, links and stats as a single .json backup file. You can also restore this file at any time to recover your progress.")}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5">
                  {/* Export Button */}
                  <button
                    type="button"
                    onClick={handleExportDataLocal}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold text-xs rounded-xl transition duration-150 cursor-pointer shadow-3xs"
                    title={t("settings.export_title", "Export database to computer")}
                  >
                    <Download className="w-4 h-4 text-teal-500" />
                    <span>{t('settings.download_json', 'Download copy (.json)')}</span>
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
                      title={t("settings.import_title", "Upload backup from computer")}
                    >
                      <Upload className="w-4 h-4 text-emerald-500" />
                      <span>{t('settings.restore_json', 'Restore from file')}</span>
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

                {/* --- Section 1: Automatic Scheduled Backups Configuration --- */}
                <div className="pt-4 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                        {t('settings.auto_backups_title', 'Automatic Scheduled Backups')}
                      </span>
                    </div>
                    {/* Toggle Switch */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={backupSettings.enabled}
                        onChange={(e) => updateBackupSettings({ enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                    </label>
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    {t('settings.auto_backups_desc', 'Lectura will automatically create full JSON snapshots of your library and vocabulary according to the schedule.')}
                  </p>

                  {/* Interval & Copies Selectors Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 shadow-3xs">
                    {/* Interval Dropdown */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        {t('settings.backup_interval', 'Backup interval:')}
                      </label>
                      <select
                        value={backupSettings.intervalHours}
                        disabled={!backupSettings.enabled}
                        onChange={(e) => updateBackupSettings({ intervalHours: Number(e.target.value) })}
                        className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 cursor-pointer"
                      >
                        <option value={6}>{t('settings.interval_6h', 'Every 6 hours')}</option>
                        <option value={12}>{t('settings.interval_12h', 'Every 12 hours')}</option>
                        <option value={24}>{t('settings.interval_24h', 'Daily (24 hours)')}</option>
                        <option value={72}>{t('settings.interval_72h', 'Every 3 days')}</option>
                        <option value={168}>{t('settings.interval_168h', 'Weekly (7 days)')}</option>
                      </select>
                    </div>

                    {/* Max Keep Copies */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        {t('settings.keep_copies', 'Keep last:')}
                      </label>
                      <select
                        value={backupSettings.maxKeep}
                        disabled={!backupSettings.enabled}
                        onChange={(e) => updateBackupSettings({ maxKeep: Number(e.target.value) })}
                        className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 cursor-pointer"
                      >
                        <option value={3}>{t('settings.copies_count', '{{count}} copies', { count: 3 })}</option>
                        <option value={5}>{t('settings.copies_count', '{{count}} copies', { count: 5 })}</option>
                        <option value={10}>{t('settings.copies_count', '{{count}} copies', { count: 10 })}</option>
                        <option value={20}>{t('settings.copies_count', '{{count}} copies', { count: 20 })}</option>
                      </select>
                    </div>
                  </div>

                  {/* Status & Manual Trigger Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-medium">{t('settings.last_backup', 'Last backup:')}</span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {backupSettings.lastBackupTime ? formatBackupDateTime(backupSettings.lastBackupTime) : t('settings.backup_never', 'Never')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateServerBackup}
                      disabled={isCreatingBackup}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/70 border border-teal-200/60 dark:border-teal-800/60 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 shadow-3xs"
                    >
                      {isCreatingBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>{isCreatingBackup ? t('settings.creating_backup', 'Creating backup...') : t('settings.create_backup_now', 'Create backup now')}</span>
                    </button>
                  </div>
                </div>

                {/* --- Section 2: Available Backups on Disk --- */}
                <div className="pt-4 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                        {t('settings.available_backups', 'Available Backups on Disk')}
                      </span>
                      {serverBackups.length > 0 && (
                        <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold px-1.5 py-0.2 rounded-full font-mono">
                          {serverBackups.length}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={fetchServerBackups}
                      disabled={isLoadingBackups}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
                      title="Refresh"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Backups List container */}
                  {isLoadingBackups ? (
                    <div className="p-4 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                      <span>Loading backups...</span>
                    </div>
                  ) : serverBackups.length === 0 ? (
                    <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center text-[11px] text-zinc-400 font-medium">
                      {t('settings.no_backups_found', 'No backup files saved on disk yet.')}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {serverBackups.map((b) => (
                        <div
                          key={b.filename}
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70 rounded-xl gap-2 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate font-mono">
                                {b.filename}
                              </span>
                              {/* Type Badge */}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                                b.type === 'auto'
                                  ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800'
                                  : b.type === 'pre-restore'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              }`}>
                                {b.type === 'auto' ? t('settings.badge_auto', 'Auto') : b.type === 'pre-restore' ? t('settings.badge_pre_restore', 'Safety Snapshot') : t('settings.badge_manual', 'Manual')}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {formatFileSize(b.size)}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 flex items-center gap-2 mt-0.5 font-medium">
                              <span>{formatBackupDateTime(b.createdAt)}</span>
                              {b.lessonsCount !== undefined && (
                                <span>• {b.lessonsCount} {t('settings.lessons_unit', 'lessons')}</span>
                              )}
                              {b.wordsCount !== undefined && (
                                <span>• {b.wordsCount} {t('settings.words_unit', 'words')}</span>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setConfirmRestoreBackup(b)}
                              className="p-1.5 text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition cursor-pointer"
                              title={t('settings.restore_backup_btn', 'Restore')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadServerBackup(b.filename)}
                              className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                              title={t('settings.download_backup_btn', 'Download')}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteServerBackup(b.filename)}
                              className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition cursor-pointer"
                              title={t('settings.delete_backup_btn', 'Delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* --- Section 3: Danger Zone / Data Management --- */}
              <div className="bg-rose-50/30 dark:bg-rose-950/20 p-5 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <h4 className="text-xs sm:text-sm font-black text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                    {t('settings.danger_zone_title', 'Danger Zone')}
                  </h4>
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
                  {t('settings.danger_zone_desc', 'Destructive actions for managing stored records, vocabulary, and activity history.')}
                </p>

                <div className="space-y-3">
                  {/* Clear Activity History */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-white dark:bg-zinc-900 border border-rose-200/60 dark:border-rose-900/40 rounded-xl">
                    <div>
                      <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {t('settings.clear_history_title', 'Clear All Activity History')}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {t('settings.clear_history_desc', 'Permanently deletes all logged listening, reading, and study sessions from history.')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowConfirmClearHistory(true)}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-3xs flex items-center gap-1.5 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('settings.clear_history_btn', 'Clear History')}</span>
                    </button>
                  </div>
                </div>
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
                  if (confirm(t('settings.confirm_reset_flags', 'Are you sure you want to reset all configured flags to their default values?'))) {
                    onResetLanguageFlags();
                    setCustomInputs({});
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 px-3 py-1.5 hover:bg-red-50/55 dark:hover:bg-red-950/20 rounded-xl transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t("settings.reset_flags", "Reset flags (Reset)")}
              </button>
            ) : activeSettingsTab === "interface" ? (
              <button
                type="button"
                onClick={() => {
                  onZoomScaleChange(100);
                }}
                className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t("settings.reset_zoom_btn", "Reset zoom (100%)")}
              </button>
            ) : activeSettingsTab === "storage" ? (
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800">
                {t("settings.profile_label", "Profile:")} <span className="text-teal-600 dark:text-teal-400 font-black">{activeUser ? (activeUser.displayName || activeUser.username || activeUser.email) : t("settings.guest_profile", "Guest")}</span>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">
                {t("settings.links_count", "Word links in DB:")} {Object.keys(wordLinks).filter(k => k.includes("_")).length}
              </div>
            )}

            <div className="text-[9px] bg-zinc-100/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold px-2 py-0.5 rounded-md border border-zinc-200/40 dark:border-zinc-700/45 font-mono">
              {APP_VERSION}
            </div>
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" /> {t('settings.done', 'Done')}
          </button>
        </div>

      </div>

      {/* Restoration Confirmation Modal Overlay */}
      {confirmImport && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => setConfirmImport(null)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl z-10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                  {t('settings.restore_backup_title', 'Restore Backup')}
                </h4>
                <p className="text-xs text-zinc-500 font-medium">
                  {t('settings.restore_backup_subtitle', 'Confirm data restoration')}
                </p>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800 rounded-2xl flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-500">{t('settings.backup_date', 'Backup date:')}</span>
                <span className="font-bold font-mono text-teal-600 dark:text-teal-400">{confirmImport.dateFormatted}</span>
              </div>
              {confirmImport.username && (
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-zinc-500">{t('settings.backup_user', 'User:')}</span>
                  <span className="font-bold font-mono text-zinc-900 dark:text-white">@{confirmImport.username}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-500">{t('settings.backup_lessons', 'Books / lessons:')}</span>
                <span className="font-bold font-mono">{confirmImport.lessonsCount}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-500">{t('settings.backup_words', 'Vocabulary cards:')}</span>
                <span className="font-bold font-mono">{confirmImport.wordsCount}</span>
              </div>
              {typeof confirmImport.historyCount === 'number' && confirmImport.historyCount > 0 && (
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-zinc-500">{t('settings.backup_history', 'Activity history:')}</span>
                  <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{confirmImport.historyCount}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {confirmImport.username
                ? t('settings.restore_confirm_text_user', 'Are you sure you want to restore backup of user @{{user}} from {{date}}? Your current books, vocabulary, and history will be updated from this file.', { user: confirmImport.username, date: confirmImport.dateFormatted })
                : t('settings.restore_confirm_text', 'Are you sure you want to restore backup from {{date}}? Your current books, vocabulary, and history will be updated from this file.', { date: confirmImport.dateFormatted })}
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmImport(null)}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              {Boolean(confirmImport.historyCount && confirmImport.historyCount > 0) && (
                <button
                  type="button"
                  onClick={handleExecuteRestoreHistoryOnly}
                  className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl transition cursor-pointer"
                  title="Restore only activity history log without touching current books or vocabulary"
                >
                  {t('settings.restore_history_only_btn', 'Restore Only History')}
                </button>
              )}
              <button
                type="button"
                onClick={handleExecuteImport}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer"
              >
                {t('settings.restore_btn_confirm', 'Restore Everything')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Server Backup Restoration Confirmation Modal Overlay */}
      {confirmRestoreBackup && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => !isRestoringServerBackup && setConfirmRestoreBackup(null)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl z-10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                  {t('settings.restore_server_backup_title', 'Restore Server Backup')}
                </h4>
                <p className="text-xs text-zinc-500 font-medium">
                  {t('settings.restore_backup_subtitle', 'Confirm data restoration')}
                </p>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800 rounded-2xl flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-500">{t('settings.backup_date', 'Backup date:')}</span>
                <span className="font-bold font-mono text-teal-600 dark:text-teal-400">{formatBackupDateTime(confirmRestoreBackup.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-500">Файл:</span>
                <span className="font-bold font-mono text-zinc-900 dark:text-white truncate max-w-[200px]">{confirmRestoreBackup.filename}</span>
              </div>
              {confirmRestoreBackup.lessonsCount !== undefined && (
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-zinc-500">{t('settings.backup_lessons', 'Books / lessons:')}</span>
                  <span className="font-bold font-mono">{confirmRestoreBackup.lessonsCount}</span>
                </div>
              )}
              {confirmRestoreBackup.wordsCount !== undefined && (
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-zinc-500">{t('settings.backup_words', 'Vocabulary cards:')}</span>
                  <span className="font-bold font-mono">{confirmRestoreBackup.wordsCount}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {t('settings.restore_server_backup_confirm', 'Restoring from this backup will update your books, vocabulary, links and progress. A safety snapshot will be created automatically before restoring. Continue?')}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestoringServerBackup}
                onClick={() => setConfirmRestoreBackup(null)}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={isRestoringServerBackup}
                onClick={handleExecuteRestoreServerBackup}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isRestoringServerBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isRestoringServerBackup ? t('settings.restoring_backup', 'Restoring data...') : t('settings.restore_btn_confirm', 'Restore Backup')}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Clear Activity History Confirmation Modal Overlay */}
      {showConfirmClearHistory && (
        <div className="fixed inset-0 z-60 overflow-y-auto flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => setShowConfirmClearHistory(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl z-10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                  {t('settings.confirm_clear_history_title', 'Clear Activity History')}
                </h4>
                <p className="text-xs text-zinc-500 font-medium">
                  {t('settings.confirm_clear_history_subtitle', 'This action cannot be undone')}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {t('settings.confirm_clear_history_text', 'Are you sure you want to clear all history records? All your reading sessions, listening time logs, and study records will be permanently deleted.')}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmClearHistory(false)}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearHistory?.();
                  setShowConfirmClearHistory(false);
                  showToast(t('settings.history_cleared_toast', 'Activity history successfully cleared.'), 'success');
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('settings.confirm_clear_history_btn', 'Yes, Clear History')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PROVIDER_PRESETS: Record<string, {
  name: string;
  provider: AIProfile["provider"];
  model: string;
  baseUrl?: string;
  badge: string;
  color: string;
  icon: string;
  keyUrl?: string;
  keyUrlLabel?: string;
  isFree?: boolean;
}> = {
  gemini: {
    name: "Google Gemini",
    provider: "gemini",
    model: "gemini-2.5-flash",
    badge: "Cloud / Fast",
    color: "teal",
    icon: "✨",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyUrlLabel: "Google AI Studio (Free)",
    isFree: true
  },
  groq: {
    name: "Groq Cloud",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    badge: "Ultra Fast",
    color: "amber",
    icon: "🚀",
    keyUrl: "https://console.groq.com/keys",
    keyUrlLabel: "Groq Console (Free)",
    isFree: true
  },
  ollama: {
    name: "Ollama (Local)",
    provider: "ollama",
    model: "phi3.5",
    baseUrl: "http://localhost:11434/api/generate",
    badge: "Offline",
    color: "indigo",
    icon: "💻",
    keyUrl: "https://ollama.com",
    keyUrlLabel: "Ollama (Free / Offline)",
    isFree: true
  },
  openai: {
    name: "OpenAI",
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    badge: "Cloud",
    color: "emerald",
    icon: "⚡",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "OpenAI Platform",
    isFree: false
  },
  custom: {
    name: "Custom (OpenAI)",
    provider: "custom",
    model: "default",
    baseUrl: "http://localhost:11434/v1",
    badge: "Custom",
    color: "purple",
    icon: "🔌",
    keyUrl: "https://openrouter.ai/keys",
    keyUrlLabel: "OpenRouter (Free models)",
    isFree: true
  }
};

const PROVIDER_MODELS: Record<AIProfile["provider"], { id: string; label: string }[]> = {
  gemini: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommended)" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { id: "__custom__", label: "Custom (Type model name)..." },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini (Fast & Cheap)" },
    { id: "gpt-4o", label: "GPT-4o (Flagship)" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "o3-mini", label: "o3-mini (Reasoning)" },
    { id: "__custom__", label: "Custom (Type model name)..." },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (Ultra Fast)" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B IT" },
    { id: "__custom__", label: "Custom (Type model name)..." },
  ],
  ollama: [
    { id: "phi3.5", label: "phi3.5 (Recommended / Lightweight)" },
    { id: "llama3.2", label: "llama3.2" },
    { id: "llama3.1", label: "llama3.1" },
    { id: "qwen2.5", label: "qwen2.5" },
    { id: "mistral", label: "mistral" },
    { id: "__custom__", label: "Custom (Type model name)..." },
  ],
  custom: [
    { id: "default", label: "default" },
    { id: "__custom__", label: "Custom (Type model name)..." },
  ]
};

export function GeminiLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gemini_logo_grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1BA1E3" />
          <stop offset="50%" stopColor="#5B73F2" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill="url(#gemini_logo_grad)"
      />
    </svg>
  );
}

export function OpenAILogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.607 1.5-2.602-1.5z"/>
    </svg>
  );
}

export function GroqLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.237 2.636 7.855 6.356 9.312l1.64-3.527C7.68 16.71 6.2 14.54 6.2 12c0-3.204 2.596-5.8 5.8-5.8s5.8 2.596 5.8 5.8c0 1.956-.97 3.686-2.46 4.74l2.42 3.07C20.12 18.06 21.8 15.23 21.8 12c0-5.523-4.477-10-9.8-10zm.5 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
    </svg>
  );
}

export function OllamaLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 2C8.67 2 8 2.67 8 3.5V6H7C5.9 6 5 6.9 5 8v1.5c0 .83.67 1.5 1.5 1.5H7v5c0 1.1.9 2 2 2h1v3c0 .55.45 1 1 1s1-.45 1-1v-3h2v3c0 .55.45 1 1 1s1-.45 1-1v-3h1c1.1 0 2-.9 2-2v-5h.5c.83 0 1.5-.67 1.5-1.5V8c0-1.1-.9-2-2-2h-1V3.5C17 2.67 16.33 2 15.5 2h-1c-.83 0-1.5.67-1.5 1.5V6h-1V3.5C12 2.67 11.33 2 10.5 2h-1zM9 8h1v2H9V8zm5 0h1v2h-1V8z" />
    </svg>
  );
}

export function OpenRouterLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function CustomAiLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </svg>
  );
}

export function ProviderLogo({ provider, className = "w-4 h-4" }: { provider: string; className?: string }) {
  switch (provider) {
    case "gemini":
      return <GeminiLogoIcon className={className} />;
    case "openai":
      return <OpenAILogoIcon className={`${className} text-[#10A37F]`} />;
    case "groq":
      return <GroqLogoIcon className={`${className} text-[#F55036]`} />;
    case "ollama":
      return <OllamaLogoIcon className={`${className} text-zinc-800 dark:text-zinc-200`} />;
    default:
      return <CustomAiLogoIcon className={`${className} text-purple-600 dark:text-purple-400`} />;
  }
}

interface AIProfilesManagerProps {
  settings?: any;
  onSettingsChange?: (newSettings: any) => void;
  t: any;
}

function AIProfilesManager({ settings, onSettingsChange, t }: AIProfilesManagerProps) {
  const { showToast } = useToast();
  const profiles = useMemo(() => getOrCreateAiProfiles(settings), [settings?.aiProfiles, settings?.geminiApiKey, settings?.localAiUrl]);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [testingState, setTestingState] = useState<Record<string, { loading?: boolean; success?: boolean; latencyMs?: number; error?: string }>>({});
  const [customModelEditing, setCustomModelEditing] = useState<Record<string, boolean>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [, setTick] = useState(0);

  // Periodic tick for remaining cooldown counters
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const saveProfiles = (newProfiles: AIProfile[]) => {
    const reindexed = newProfiles.map((p, idx) => ({ ...p, priority: idx + 1 }));
    const firstGemini = reindexed.find(p => p.provider === "gemini" && p.apiKey);
    const firstOllama = reindexed.find(p => p.provider === "ollama");

    onSettingsChange?.({
      aiProfiles: reindexed,
      geminiApiKey: firstGemini?.apiKey || settings?.geminiApiKey,
      localAiUrl: firstOllama?.baseUrl || settings?.localAiUrl,
      localAiModel: firstOllama?.model || settings?.localAiModel,
    });
  };

  const handleToggleEnabled = (id: string) => {
    const updated = profiles.map(p => p.id === id ? { ...p, isEnabled: !p.isEnabled } : p);
    saveProfiles(updated);
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= profiles.length) return;
    const updated = [...profiles];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    saveProfiles(updated);
  };

  const handleUpdateField = (id: string, field: keyof AIProfile, value: any) => {
    const updated = profiles.map(p => {
      if (p.id !== id) return p;
      const updatedProfile = { ...p, [field]: value };
      // If changing provider, apply sensible default model and baseUrl
      if (field === "provider" && PROVIDER_PRESETS[value]) {
        updatedProfile.model = PROVIDER_PRESETS[value].model;
        if (PROVIDER_PRESETS[value].baseUrl) {
          updatedProfile.baseUrl = PROVIDER_PRESETS[value].baseUrl;
        }
      }
      return updatedProfile;
    });
    saveProfiles(updated);
  };

  const handleDelete = (id: string, name: string) => {
    if (profiles.length <= 1) {
      // Keep at least one empty profile
      const reset = [{
        id: `profile_${Date.now()}`,
        name: "Gemini (Main)",
        provider: "gemini" as const,
        apiKey: "",
        model: "gemini-2.5-flash",
        isEnabled: true,
        priority: 1,
      }];
      saveProfiles(reset);
      return;
    }
    const updated = profiles.filter(p => p.id !== id);
    saveProfiles(updated);
  };

  const handleAddProfile = (presetKey: string) => {
    const preset = PROVIDER_PRESETS[presetKey] || PROVIDER_PRESETS.gemini;
    const newId = `profile_${preset.provider}_${Date.now().toString(36)}`;
    const newProfile: AIProfile = {
      id: newId,
      name: `${preset.name} #${profiles.filter(p => p.provider === preset.provider).length + 1}`,
      provider: preset.provider,
      apiKey: "",
      model: preset.model,
      baseUrl: preset.baseUrl,
      isEnabled: true,
      priority: profiles.length + 1,
    };
    saveProfiles([...profiles, newProfile]);
    setShowAddMenu(false);
  };

  const handleTestKey = async (profile: AIProfile) => {
    setTestingState(prev => ({ ...prev, [profile.id]: { loading: true } }));
    const result = await testAiProfileConnection(profile);
    setTestingState(prev => ({ ...prev, [profile.id]: { loading: false, ...result } }));
    if (result.success) {
      showToast(t("settings.ai_test_success", "Working") + ` (${result.latencyMs}ms)`, "success");
    } else {
      showToast(t("settings.ai_test_failed", "Failed") + `: ${result.error}`, "error");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-zinc-50 dark:bg-zinc-950/40 p-5 rounded-2xl border border-zinc-100/60 dark:border-zinc-800 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-zinc-800 dark:text-white leading-tight">
              {t("settings.ai_profiles_title", "AI Keys & Providers (Auto-Failover on Rate Limits)")}
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              {t("settings.ai_profiles_desc", "Configure multiple AI keys or providers. When a key hits rate limits (HTTP 429 / Quota Exceeded), Lectura automatically switches to the next enabled key in the list.")}
            </p>
          </div>
        </div>

        {/* Quick Links for Free API keys & Services */}
        <div className="pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-bold text-zinc-500 dark:text-zinc-400 text-[10px] uppercase tracking-wider mr-1">
            {t("settings.free_api_keys_label", "Free AI Keys & Services:")}
          </span>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 font-semibold text-[11px] border border-teal-200/60 dark:border-teal-800/60 transition shadow-2xs"
          >
            <GeminiLogoIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Google AI Studio</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-semibold text-[11px] border border-amber-200/60 dark:border-amber-800/60 transition shadow-2xs"
          >
            <GroqLogoIcon className="w-3.5 h-3.5 text-[#F55036] shrink-0" />
            <span>Groq Cloud</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold text-[11px] border border-purple-200/60 dark:border-purple-800/60 transition shadow-2xs"
          >
            <OpenRouterLogoIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>OpenRouter</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
          <a
            href="https://ollama.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px] border border-indigo-200/60 dark:border-indigo-800/60 transition shadow-2xs"
          >
            <OllamaLogoIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Ollama</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] border border-emerald-200/60 dark:border-emerald-800/60 transition shadow-2xs"
          >
            <OpenAILogoIcon className="w-3.5 h-3.5 text-[#10A37F] shrink-0" />
            <span>OpenAI</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
        </div>
      </div>

      {/* Profiles Dynamic List */}
      <div className="space-y-3">
        {profiles.map((profile, index) => {
          const isVisible = !!visibleKeys[profile.id];
          const testStatus = testingState[profile.id];
          const remainingCooldown = getCooldownRemainingSeconds(profile.id);
          const isOnCooldown = remainingCooldown > 0;
          const presetInfo = PROVIDER_PRESETS[profile.provider] || PROVIDER_PRESETS.gemini;

          return (
            <div
              key={profile.id}
              className={`p-4 rounded-2xl border transition-all ${
                profile.isEnabled
                  ? "bg-white dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800 shadow-3xs"
                  : "bg-zinc-50/70 dark:bg-zinc-950/30 border-zinc-200/50 dark:border-zinc-800/40 opacity-75"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Reorder Buttons & Priority Badge */}
                  <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, "up")}
                      title={t("settings.ai_move_up", "Move Up")}
                      className="p-1 hover:bg-white dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-black font-mono text-zinc-600 dark:text-zinc-300 px-1">
                      #{index + 1}
                    </span>
                    <button
                      type="button"
                      disabled={index === profiles.length - 1}
                      onClick={() => handleMove(index, "down")}
                      title={t("settings.ai_move_down", "Move Down")}
                      className="p-1 hover:bg-white dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Profile Name input */}
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => handleUpdateField(profile.id, "name", e.target.value)}
                    placeholder={t("settings.ai_profile_name", "Profile Name")}
                    className="text-xs font-black text-zinc-800 dark:text-zinc-100 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-teal-500 focus:outline-none px-1 py-0.5 max-w-[200px] truncate"
                  />

                  {/* Provider Icon/Tag */}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0 flex items-center gap-1.5">
                    <ProviderLogo provider={profile.provider} className="w-3.5 h-3.5 shrink-0" />
                    <span>{profile.provider.toUpperCase()}</span>
                  </span>

                  {/* Cooldown Tag */}
                  {isOnCooldown && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shrink-0 flex items-center gap-1 animate-pulse">
                      <ShieldAlert className="w-3 h-3" />
                      <span>{t("settings.ai_cooldown_badge", "Cooldown: {{seconds}}s", { seconds: remainingCooldown })}</span>
                    </span>
                  )}
                </div>

                {/* Actions: Enable Toggle & Delete */}
                <div className="flex items-center gap-2 shrink-0">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profile.isEnabled}
                      onChange={() => handleToggleEnabled(profile.id)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-teal-600"></div>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleDelete(profile.id, profile.name)}
                    title={t("settings.ai_delete_profile", "Delete profile")}
                    className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
                {/* Provider Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {t("settings.ai_provider", "Provider")}
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-2.5 pointer-events-none flex items-center">
                      <ProviderLogo provider={profile.provider} className="w-3.5 h-3.5 shrink-0" />
                    </div>
                    <select
                      value={profile.provider}
                      onChange={(e) => handleUpdateField(profile.id, "provider", e.target.value as any)}
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI (ChatGPT)</option>
                      <option value="groq">Groq Cloud</option>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="custom">Custom (OpenAI Compatible)</option>
                    </select>
                  </div>
                </div>

                {/* Model Selector & Custom input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {t("settings.ai_model", "Model")}
                  </label>
                  <div className="space-y-1.5">
                    {(() => {
                      const isPresetModel = (PROVIDER_MODELS[profile.provider] || []).some(m => m.id === profile.model && m.id !== "__custom__");
                      const isCustom = customModelEditing[profile.id] || !isPresetModel;

                      return (
                        <>
                          <select
                            value={isCustom ? "__custom__" : (profile.model || presetInfo.model)}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "__custom__") {
                                setCustomModelEditing(prev => ({ ...prev, [profile.id]: true }));
                              } else {
                                setCustomModelEditing(prev => ({ ...prev, [profile.id]: false }));
                                handleUpdateField(profile.id, "model", val);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                          >
                            {(PROVIDER_MODELS[profile.provider] || []).map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>

                          {isCustom && (
                            <input
                              type="text"
                              value={profile.model || ""}
                              onChange={(e) => handleUpdateField(profile.id, "model", e.target.value.trim())}
                              placeholder={presetInfo.model}
                              className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-teal-500/80 dark:border-teal-500/60 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono text-[11px]"
                              autoFocus
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* API Key */}
                <div className={`space-y-1 ${profile.provider === "ollama" ? "sm:col-span-2 lg:col-span-1" : ""}`}>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
                    <span>{t("settings.ai_api_key", "API Key")}</span>
                    <div className="flex items-center gap-1.5 normal-case font-medium">
                      {presetInfo.keyUrl && (
                        <a
                          href={presetInfo.keyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-bold flex items-center gap-0.5"
                        >
                          <span>{presetInfo.isFree ? t("settings.get_free_key", "Get free key") : t("settings.get_key", "Get key")}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        </a>
                      )}
                      {profile.provider === "ollama" && (
                        <span className="text-[9px] text-zinc-400 font-normal lowercase">(optional)</span>
                      )}
                    </div>
                  </label>
                  <div className="relative">
                    <input
                      type={isVisible ? "text" : "password"}
                      value={profile.apiKey || ""}
                      onChange={(e) => handleUpdateField(profile.id, "apiKey", e.target.value.trim())}
                      placeholder={profile.provider === "gemini" ? "AIzaSy..." : profile.provider === "groq" ? "gsk_..." : "sk-..."}
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, [profile.id]: !isVisible }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-0.5 cursor-pointer"
                    >
                      {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Base URL (For Ollama and Custom providers) */}
                {(profile.provider === "custom" || profile.provider === "ollama" || profile.provider === "groq") && (
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {t("settings.ai_base_url", "Base URL Endpoint")}
                    </label>
                    <input
                      type="text"
                      value={profile.baseUrl || ""}
                      onChange={(e) => handleUpdateField(profile.id, "baseUrl", e.target.value.trim())}
                      placeholder={presetInfo.baseUrl || "http://localhost:11434/v1"}
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono text-[11px]"
                    />
                  </div>
                )}
              </div>

              {/* Card Footer: Test connection & status */}
              <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={testStatus?.loading}
                    onClick={() => handleTestKey(profile)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-[11px] font-bold transition cursor-pointer disabled:opacity-50 border border-zinc-200/50 dark:border-zinc-700/50"
                  >
                    {testStatus?.loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    )}
                    <span>{t("settings.ai_test_connection", "Test")}</span>
                  </button>

                  {testStatus && !testStatus.loading && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold">
                      {testStatus.success ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t("settings.ai_test_success", "Working")} ({testStatus.latencyMs}ms)</span>
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 max-w-[300px] truncate" title={testStatus.error}>
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{testStatus.error}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                  Priority: #{index + 1}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Profile Controls */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-3 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-950/60 border border-teal-200/80 dark:border-teal-800/60 text-teal-700 dark:text-teal-300 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-3xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t("settings.add_ai_profile", "+ Add AI Key / Provider")}</span>
        </button>

        {showAddMenu && (
          <div className="absolute left-0 right-0 bottom-full mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 shadow-xl z-20 grid grid-cols-1 sm:grid-cols-2 gap-1.5 animate-in fade-in zoom-in-95 duration-150">
            {Object.entries(PROVIDER_PRESETS).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleAddProfile(key)}
                className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition cursor-pointer"
              >
                <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center">
                  <ProviderLogo provider={item.provider} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-zinc-800 dark:text-zinc-100">{item.name}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{item.model} • {item.badge}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

