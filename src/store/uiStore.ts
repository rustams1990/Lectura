import { create } from 'zustand';

type TabType = 'library' | 'read' | 'practice' | 'statistics' | 'history' | 'podcasts';
type LayoutWidthType = 'standard' | 'wide' | 'ultra' | 'full';

interface UIState {
  isSidebarOpen: boolean;
  activeTab: TabType;
  showImportForm: boolean;
  showSettingsModal: boolean;
  showMatchPairsModal: boolean;
  showYoutubePlayer: boolean;
  showAiHubModal: boolean;
  isFocusMode: boolean;
  showOnlyUnknown: boolean;
  zoomScale: number;
  layoutWidthMode: LayoutWidthType;

  // Actions
  setIsSidebarOpen: (isOpen: boolean) => void;
  setActiveTab: (tab: TabType) => void;
  setShowImportForm: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowMatchPairsModal: (show: boolean) => void;
  setShowYoutubePlayer: (show: boolean) => void;
  setShowAiHubModal: (show: boolean) => void;
  setIsFocusMode: (isFocus: boolean) => void;
  setShowOnlyUnknown: (show: boolean) => void;
  setZoomScale: (scale: number) => void;
  setLayoutWidthMode: (mode: LayoutWidthType) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  activeTab: (() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash;
      if (hash.startsWith('#/statistics')) return 'statistics';
      if (hash.startsWith('#/practice')) return 'practice';
      if (hash.startsWith('#/history')) return 'history';
      if (hash.startsWith('#/podcasts')) return 'podcasts';
      if (hash.startsWith('#/read') || hash.startsWith('#/lesson')) return 'read';
    }
    return 'library';
  })(),
  showImportForm: false,
  showSettingsModal: false,
  showMatchPairsModal: false,
  showYoutubePlayer: true,
  showAiHubModal: false,
  isFocusMode: false,
  showOnlyUnknown: false,
  zoomScale: 100,
  layoutWidthMode: 'full',

  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowImportForm: (show) => set({ showImportForm: show }),
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),
  setShowMatchPairsModal: (show) => set({ showMatchPairsModal: show }),
  setShowYoutubePlayer: (show) => set({ showYoutubePlayer: show }),
  setShowAiHubModal: (show) => set({ showAiHubModal: show }),
  setIsFocusMode: (isFocus) => set({ isFocusMode: isFocus }),
  setShowOnlyUnknown: (show) => set({ showOnlyUnknown: show }),
  setZoomScale: (scale) => set({ zoomScale: scale }),
  setLayoutWidthMode: (mode) => set({ layoutWidthMode: mode }),
}));
