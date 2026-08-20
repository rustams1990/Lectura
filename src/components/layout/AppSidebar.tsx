import React from 'react';
import { Languages, X, BookMarked, BookOpen, GraduationCap, TrendingUp, History, Sparkles, Settings, PlusCircle, Mic2 } from 'lucide-react';
import { Lesson } from '../../types';
import { useTranslation } from 'react-i18next';

interface AppSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  activeTab: 'library' | 'read' | 'practice' | 'statistics' | 'history' | 'podcasts';
  setActiveTab: (tab: 'library' | 'read' | 'practice' | 'statistics' | 'history' | 'podcasts') => void;
  showImportForm: boolean;
  setShowImportForm: (show: boolean) => void;
  activeLesson: Lesson | null;
  setIsFocusMode: (focus: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  activeUser: any;
  setShowLocalLoginModal: (show: boolean) => void;
  currentReaderTheme: {
    cardBg: string;
    text: string;
    border: string;
  };
}

export default function AppSidebar({
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  setActiveTab,
  showImportForm,
  setShowImportForm,
  activeLesson,
  setIsFocusMode,
  setShowSettingsModal,
  activeUser,
  setShowLocalLoginModal,
  currentReaderTheme
}: AppSidebarProps) {
  const { t } = useTranslation();

  if (!isSidebarOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex pointer-events-auto">
      {/* Backdrop Overlay */}
      <div 
        id="sidebar-overlay"
        onClick={() => setIsSidebarOpen(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
      />

      {/* Sidebar Panel */}
      <div 
        id="sidebar-panel"
        className={`relative flex flex-col w-full max-w-[280px] sm:max-w-xs h-full ${currentReaderTheme.cardBg} ${currentReaderTheme.text} border-r ${currentReaderTheme.border} shadow-2xl p-5 overflow-y-auto animate-in slide-in-from-left duration-200 z-10`}
      >
        {/* Header / Brand in Sidebar */}
        <div className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-600 rounded-xl text-white">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-zinc-900 dark:text-white tracking-wide">
                Lectura
              </h3>
              <span className="text-[9px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest block font-mono">
                {t('sidebar.navigation', 'Навигация')}
              </span>
            </div>
          </div>

          {/* Close Button */}
          <button
            id="btn-close-sidebar"
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
            title="{t('sidebar.close_menu', 'Закрыть меню')}"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Main Content Options */}
        <div className="flex-1 py-6 space-y-6">
          {/* Core Tabs Navigation */}
          <div className="space-y-1">
            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest pl-2 font-mono">
              {t('sidebar.sections', 'Разделы')}
            </span>
            
            <button
              id="tab-library-mode"
              onClick={() => {
                setActiveTab("library");
                setShowImportForm(false);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === "library" && !showImportForm
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
              }`}
            >
              <BookMarked className="w-4 h-4 shrink-0" />
              {t('sidebar.library', 'Библиотека')}
            </button>



            <button
              id="tab-practice-mode"
              onClick={() => {
                setActiveTab("practice");
                setShowImportForm(false);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === "practice" && !showImportForm
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
              }`}
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              {t('sidebar.practice', 'Практика')}
            </button>

            <button
              id="tab-statistics-mode"
              onClick={() => {
                setActiveTab("statistics");
                setShowImportForm(false);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === "statistics" && !showImportForm
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
              }`}
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              {t('sidebar.statistics', 'Словарь и статистика')}
            </button>

            <button
              id="tab-history-mode"
              onClick={() => {
                setActiveTab("history");
                setShowImportForm(false);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === "history" && !showImportForm
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
              }`}
            >
              <History className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
              {t('sidebar.history', 'История чтения')}
            </button>

            <button
              id="tab-podcasts-mode"
              onClick={() => {
                setActiveTab("podcasts");
                setShowImportForm(false);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === "podcasts" && !showImportForm
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/40 shadow-3xs"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white"
              }`}
            >
              <Mic2 className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
              {t('sidebar.podcasts', 'Подкасты')}
            </button>
          </div>

          {/* Quick Actions separator */}
          <div className="space-y-1.5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest pl-2 font-mono">
              {t('sidebar.actions', 'Действия')}
            </span>



            <button
              id="btn-open-settings"
              onClick={() => {
                setShowSettingsModal(true);
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-white rounded-xl transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
              {t('sidebar.settings', 'Настройки')}
            </button>

            <button
              id="btn-open-import"
              onClick={() => {
                setShowImportForm(true);
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 rounded-xl transition-all cursor-pointer shadow-3xs"
            >
              <PlusCircle className="w-4 h-4 shrink-0 text-teal-100" />
              {t('sidebar.import_material', 'Импортировать материал')}
            </button>
          </div>
        </div>

        {/* Bottom Footer block inside sidebar showing sync/user stats overview */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
          <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-1 font-mono">
              {t('sidebar.sync_profile', 'Профиль синхронизации')}
            </span>
            {activeUser ? (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{activeUser.displayName || activeUser.email}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${activeUser ? "bg-teal-500 animate-pulse" : "bg-teal-500"}`} />
                  <span className="text-[8px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                    {activeUser ? t("sidebar.synced", "Синхронизировано") : t("sidebar.local_profile", "Локальный профиль")}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowLocalLoginModal(true);
                  setIsSidebarOpen(false);
                }}
                className="text-[9px] font-black text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
              >
                🔑 {t('sidebar.login_sync', 'Войти и синхронизировать')}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
