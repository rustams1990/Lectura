import React, { useState, useRef, useEffect } from 'react';
import { Menu, Languages, Sun, Moon, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { settingsStore } from '../../db';
import { useTranslation } from 'react-i18next';
import { getLanguageFlagEmoji, renderCircularFlag } from '../LibraryHome';

interface AppHeaderProps {
  isFocusMode: boolean;
  currentReaderTheme: {
    border: string;
    headerBg: string;
  };
  layoutContainerClass: string;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setActiveTab: (tab: 'library' | 'read' | 'practice' | 'statistics' | 'history') => void;
  setShowImportForm: (show: boolean) => void;
  setSelectedWord: (word: any) => void;
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  setShowLocalLoginModal: (show: boolean) => void;
  storageMode: "local" | "cloud" | "server";
  isSyncing: boolean;
  selectedTargetLanguage: string;
  onSelectTargetLanguage: (lang: string) => void;
  availableTargetLanguages: string[];
  languageFlags?: Record<string, string>;
}

export default function AppHeader({
  isFocusMode,
  currentReaderTheme,
  layoutContainerClass,
  setIsSidebarOpen,
  setActiveTab,
  setShowImportForm,
  setSelectedWord,
  isDarkMode,
  setIsDarkMode,
  setShowLocalLoginModal,
  storageMode,
  isSyncing,
  selectedTargetLanguage,
  onSelectTargetLanguage,
  availableTargetLanguages,
  languageFlags,
}: AppHeaderProps) {
  const { user: activeUser, isAuthLoading, logout } = useAuth();
  const { t, i18n } = useTranslation();

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
    <header className={`border-b ${currentReaderTheme.border} ${currentReaderTheme.headerBg} backdrop-blur-md relative z-30 px-4 sm:px-6 py-3.5`}>
      <div className={`mx-auto flex items-center justify-between gap-4 transition-all duration-300 ${layoutContainerClass}`}>
        
        {/* Left side: Hamburger + Brand logo */}
        <div className="flex items-center gap-3">
          <button
            id="btn-toggle-sidebar"
            onClick={() => setIsSidebarOpen(true)}
            className="p-2.5 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-3xs"
            title={t('header.open_menu', 'Открыть меню')}
          >
            <Menu className="w-5 h-5" />
          </button>

          <a
            href="#/library"
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
            className="flex items-center gap-2.5 group cursor-pointer transition-all active:scale-98 text-left focus:outline-none no-underline"
            title={t('header.go_home', 'На главную')}
          >
            <div className="p-2 bg-teal-600 group-hover:bg-teal-500 rounded-xl text-white shadow-md shadow-teal-100/10 dark:shadow-none hidden sm:block transition-colors">
              <Languages className="w-5 h-5 transition-transform group-hover:scale-110" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 text-zinc-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                Lectura
              </h1>
            </div>
          </a>
        </div>

        {/* Right side: Sync State & Login/Logout HUD */}
        <div className="flex items-center gap-2">

          {/* Global Target Language Selector Dropdown in Header */}
          <div className="relative font-sans" ref={langDropdownRef}>
            <button
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2 shadow-3xs active:scale-95 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-900 dark:text-white border-zinc-200/80 dark:border-zinc-800 font-extrabold text-xs"
              title={t('header.select_target_language', 'Select target language')}
            >
              {renderCircularFlag(getLanguageFlagEmoji(selectedTargetLanguage, languageFlags), selectedTargetLanguage === "All")}
              <span className="hidden md:inline font-black">{selectedTargetLanguage === "All" ? t('header.all_languages', 'All Languages') : selectedTargetLanguage}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isLangDropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 font-sans">
                <div className="px-3 py-1 text-[10px] uppercase font-black tracking-widest text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/60 mb-1">
                  🌐 {t('header.target_language', 'Learning Language')}
                </div>
                {availableTargetLanguages.map((lang) => {
                  const isSelected = selectedTargetLanguage.toLowerCase() === lang.toLowerCase();
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
                        <span>{lang === "All" ? t('header.all_languages', 'All Languages') : lang}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Language Toggle Button (UI Interface Translation EN/RU) */}
          <button
            onClick={() => {
              const newLang = i18n.language.startsWith('en') ? 'ru' : 'en';
              i18n.changeLanguage(newLang);
            }}
            className="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-3xs active:scale-95 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-teal-600 dark:text-teal-400 border-zinc-200/60 dark:border-zinc-800/80 font-bold text-xs uppercase"
            title={i18n.language.startsWith('en') ? t('header.switch_to_ru', 'Switch to Russian') : t('header.switch_to_en', 'Switch to English')}
          >
            {i18n.language.startsWith('en') ? 'EN' : 'RU'}
          </button>

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
            className="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-3xs active:scale-95 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-amber-500 dark:text-indigo-400 border-zinc-200/60 dark:border-zinc-800/80"
            title={isDarkMode ? t('header.light_mode', 'Светлая тема') : t('header.dark_mode', 'Тёмная тема')}
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>

          {isAuthLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-3xs">
              <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] text-zinc-400 font-bold hidden sm:inline">{t('header.checking', 'Checking...')}</span>
            </div>
          ) : activeUser ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 dark:bg-teal-900/20 border border-teal-200/50 dark:border-teal-900 rounded-xl relative shadow-3xs">
              {activeUser.photoURL ? (
                <img
                  src={activeUser.photoURL}
                  alt="User avatar"
                  className="w-5.5 h-5.5 rounded-full border border-teal-400"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-5.5 h-5.5 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center text-[10px] font-black text-teal-700 dark:text-teal-300">
                  {(activeUser.displayName || activeUser.email || "U").substring(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col text-left justify-center min-w-0 pr-1">
                <span className="text-[9px] font-black text-teal-700 dark:text-teal-300 flex items-center gap-1 leading-none">
                  {storageMode === "cloud" ? "☁️ cloud" : storageMode === "server" ? "🖥️ server" : "📱 local"}
                  {isSyncing && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />}
                </span>
                <span className="text-[7.5px] text-zinc-400 dark:text-zinc-500 font-bold truncate max-w-[100px] leading-tight block mt-0.5" title={activeUser.displayName || activeUser.email || ""}>
                  {activeUser.displayName || activeUser.email || "user"}
                </span>
              </div>
              <button
                onClick={() => {
                  logout().catch(err => console.error(err));
                }}
                className="text-[9px] font-bold text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-1.5 py-0.5 rounded transition cursor-pointer"
                title={t('header.exit', 'Выйти')}
              >
                {t('header.exit', 'Exit')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLocalLoginModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[10px] font-bold rounded-xl transition duration-150 cursor-pointer shadow-3xs"
              title={t('header.login_title', 'Войдите, чтобы сохранить результаты')}
            >
              {t('header.login', '☁️ Войти (Sync)')}
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
