import React, { useState, useRef, useEffect } from 'react';
import { Menu, Languages, Sun, Moon, ChevronDown, Check, Plus, ChevronLeft, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { settingsStore } from '../../db';
import { useTranslation } from 'react-i18next';
import { getLanguageFlagEmoji, renderCircularFlag } from '../LibraryHome';
import { getLocalizedLanguageName } from '../../utils/stringUtils';
import AccountSwitcherDropdown from '../AccountSwitcherDropdown';
import WhisperNotificationDropdown from '../WhisperNotificationDropdown';
import TextSettingsControls from '../TextSettingsControls';
import { useUIStore } from '../../store/uiStore';
import { ReaderSettings, DEFAULT_TOOLBAR_VISIBILITY } from '../../types';

interface AppHeaderProps {
  isFocusMode: boolean;
  activeTab?: string;
  readerSettings?: ReaderSettings;
  onUpdateReaderSettings?: (settings: ReaderSettings) => void;
  currentReaderTheme: {
    border: string;
    headerBg: string;
  };
  layoutContainerClass: string;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setActiveTab: (tab: 'library' | 'read' | 'practice' | 'statistics' | 'history' | 'podcasts') => void;
  setShowImportForm: (show: boolean) => void;
  setSelectedWord: (word: any) => void;
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  setShowLocalLoginModal: (show: boolean) => void;
  onOpenProfileSettings?: () => void;
  storageMode: "local" | "cloud" | "server";
  isSyncing: boolean;
  syncProgress?: import("../AccountSwitcherDropdown").SyncProgressInfo;
  localSyncError?: boolean;
  selectedTargetLanguage: string;
  onSelectTargetLanguage: (lang: string) => void;
  availableTargetLanguages: string[];
  languageFlags?: Record<string, string>;
  onOpenManageLanguages?: () => void;
  lessonCountByLanguage?: Record<string, number>;
  onOpenBook?: (bookId: string) => void;
  onManualSync?: () => void;
  activeLessonType?: string;
}

export default function AppHeader({
  isFocusMode,
  activeTab,
  readerSettings,
  onUpdateReaderSettings,
  currentReaderTheme,
  layoutContainerClass,
  setIsSidebarOpen,
  setActiveTab,
  setShowImportForm,
  setSelectedWord,
  isDarkMode,
  setIsDarkMode,
  setShowLocalLoginModal,
  onOpenProfileSettings,
  storageMode,
  isSyncing,
  syncProgress,
  localSyncError = false,
  selectedTargetLanguage,
  onSelectTargetLanguage,
  availableTargetLanguages,
  languageFlags,
  onOpenManageLanguages,
  lessonCountByLanguage = {},
  onOpenBook,
  onManualSync,
  activeLessonType,
}: AppHeaderProps) {
  const { user: activeUser, isAuthLoading, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { setShowAiHubModal } = useUIStore();

  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isFocusMode) return null;

  return (
    <header className={`border-b ${currentReaderTheme.border} ${currentReaderTheme.headerBg} backdrop-blur-md relative z-40 px-2 sm:px-6 py-2 sm:py-3.5`}>
      <div className={`mx-auto flex items-center justify-between gap-1.5 sm:gap-4 transition-all duration-300 ${layoutContainerClass}`}>
        
        {/* Left side: Back to Library (when in reader) or Hamburger + Brand logo */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {activeTab === 'read' ? (
            <button
              onClick={() => {
                setActiveTab("library");
                setSelectedWord(null);
              }}
              className="p-2 sm:p-2.5 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-3xs"
              title={t('reader.library_btn', 'Библиотека')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              id="btn-toggle-sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 sm:p-2.5 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-3xs"
              title={t('header.open_menu', 'Открыть меню')}
            >
              <Menu className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>
          )}

          <a
            href="/"
            onClick={(e) => {
              if (
                e.button === 0 &&
                !e.ctrlKey &&
                !e.shiftKey &&
                !e.metaKey &&
                !e.altKey
              ) {
                e.preventDefault();
                setActiveTab("library");
                setShowImportForm(false);
                setSelectedWord(null);
              }
            }}
            className="flex items-center gap-2 sm:gap-2.5 group cursor-pointer transition-all active:scale-98 text-left focus:outline-none no-underline"
            title={t('header.go_home', 'На главную')}
          >
            <div className="p-2 bg-teal-600 group-hover:bg-teal-500 rounded-xl text-white shadow-md shadow-teal-100/10 dark:shadow-none hidden sm:block transition-colors">
              <Languages className="w-5 h-5 transition-transform group-hover:scale-110" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 text-zinc-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors hidden sm:block">
                Lectura
              </h1>
            </div>
          </a>
        </div>

        {/* Right side: Reader tools (AI Hub, AA) + Sync State & Login/Logout HUD */}
        <div className="flex items-center gap-1 sm:gap-2">

          {/* Quick Reader Header Tools: AI Hub & Text Settings (AA) (Mobile-only: md:hidden) */}
          {activeTab === 'read' && (
            <div className="flex md:hidden items-center gap-1">
              {/* AI Hub Launcher */}
              {Boolean(readerSettings?.toolbarVisibility?.showAiHub ?? DEFAULT_TOOLBAR_VISIBILITY.showAiHub) && (
                <button
                  type="button"
                  onClick={() => setShowAiHubModal(true)}
                  className="p-2 sm:p-2.5 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-3xs"
                  title={t('reader.ai_hub_title', 'AI Hub')}
                >
                  <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </button>
              )}

              {/* Text Settings (AA) */}
              {readerSettings && onUpdateReaderSettings && (
                <TextSettingsControls
                  settings={readerSettings}
                  onUpdateSettings={onUpdateReaderSettings}
                  compact
                  lessonType={activeLessonType}
                />
              )}
            </div>
          )}

          {/* Global Target Language Selector Dropdown in Header */}
          <div className={`relative font-sans ${activeTab === 'read' ? 'hidden md:block' : ''}`} ref={langDropdownRef}>
            <button
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 sm:gap-2 shadow-3xs active:scale-95 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-900 dark:text-white border-zinc-200/80 dark:border-zinc-800 font-extrabold text-xs"
              title={t('header.select_target_language', 'Select target language')}
            >
              {renderCircularFlag(getLanguageFlagEmoji(selectedTargetLanguage, languageFlags), selectedTargetLanguage === "All")}
              <span className="hidden md:inline font-black">
                {selectedTargetLanguage === "All"
                  ? t('header.all_languages', 'All Languages')
                  : getLocalizedLanguageName(selectedTargetLanguage, i18n.language)}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isLangDropdownOpen && (
              <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-56 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 font-sans overflow-hidden">
                <div className="px-3 py-1 text-[10px] uppercase font-black tracking-widest text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/60 mb-1">
                  🌐 {t('header.target_language', 'Learning Language')}
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {availableTargetLanguages.map((lang) => {
                    const isSelected = selectedTargetLanguage.toLowerCase() === lang.toLowerCase();
                    const count = lessonCountByLanguage[lang] || 0;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          onSelectTargetLanguage(lang);
                          setIsLangDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-xs font-extrabold flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-black"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {renderCircularFlag(getLanguageFlagEmoji(lang, languageFlags), lang === "All")}
                          <span>
                            {lang === "All"
                              ? t('header.all_languages', 'All Languages')
                              : getLocalizedLanguageName(lang, i18n.language)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {count > 0 && lang !== "All" && (
                            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                              ({count})
                            </span>
                          )}
                          {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {onOpenManageLanguages && (
                  <>
                    <div className="border-t border-zinc-100 dark:border-zinc-800/80 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsLangDropdownOpen(false);
                        onOpenManageLanguages();
                      }}
                      className="w-full px-3 py-2 text-xs font-extrabold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('header.add_new_language', '+ Add a new language')}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Background Tasks / Whisper Notification Bell */}
          <WhisperNotificationDropdown onOpenBook={onOpenBook} />

          {/* Dark Mode Toggle Button */}
          <button
            id="btn-toggle-dark-mode"
            onClick={() => {
              const next = !isDarkMode;
              try { localStorage.setItem("vocab_clone_dark_mode", next ? "true" : "false"); } catch (_) {}
              settingsStore.setItem("vocab_clone_dark_mode", next ? "true" : "false");
              if (next) { document.documentElement.classList.add("dark"); }
              else { document.documentElement.classList.remove("dark"); }
              setIsDarkMode(next);
            }}
            className="p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-3xs active:scale-95 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-amber-500 dark:text-indigo-400 border-zinc-200/60 dark:border-zinc-800/80"
            title={isDarkMode ? t('header.light_mode', 'Светлая тема') : t('header.dark_mode', 'Тёмная тема')}
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> : <Moon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />}
          </button>

          {isAuthLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-3xs">
              <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] text-zinc-400 font-bold hidden sm:inline">{t('header.checking', 'Checking...')}</span>
            </div>
          ) : activeUser ? (
            <AccountSwitcherDropdown
              onOpenProfileSettings={() => onOpenProfileSettings?.()}
              onOpenAddAccount={(prefillUser) => setShowLocalLoginModal(true)}
              localSyncError={localSyncError}
              isSyncing={isSyncing}
              syncProgress={syncProgress}
              onSyncErrorClick={() => setShowLocalLoginModal(true)}
              onManualSync={onManualSync}
            />
          ) : (
            <button
              onClick={() => setShowLocalLoginModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[10px] font-bold rounded-xl transition duration-150 cursor-pointer shadow-3xs"
              title={t('header.login_title', 'Войдите, чтобы сохранить результаты')}
            >
              <span>👤</span>
              <span>{t('header.login', 'Войти')}</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
