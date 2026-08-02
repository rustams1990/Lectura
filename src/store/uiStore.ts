import { create } from 'zustand';

type TabType = 'library' | 'read' | 'practice' | 'statistics' | 'history';

interface UIState {
  isSidebarOpen: boolean;
  activeTab: TabType;
  showImportForm: boolean;
  showSettingsModal: boolean;
  showMatchPairsModal: boolean;
  showYoutubePlayer: boolean;
  isFocusMode: boolean;
  showOnlyUnknown: boolean;
  zoomScale: number;
  layoutWidthMode: 'normal' | 'wide' | 'full';

  // Actions
  setIsSidebarOpen: (isOpen: boolean) => void;
  setActiveTab: (tab: TabType) => void;
  setShowImportForm: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowMatchPairsModal: (show: boolean) => void;
  setShowYoutubePlayer: (show: boolean) => void;
  setIsFocusMode: (isFocus: boolean) => void;
  setShowOnlyUnknown: (show: boolean) => void;
  setZoomScale: (scale: number) => void;
  setLayoutWidthMode: (mode: 'normal' | 'wide' | 'full') => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  activeTab: 'library',
  showImportForm: false,
  showSettingsModal: false,
  showMatchPairsModal: false,
  showYoutubePlayer: true,
  isFocusMode: false,
  showOnlyUnknown: false,
  zoomScale: 100,
  layoutWidthMode: 'normal',

  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowImportForm: (show) => set({ showImportForm: show }),
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),
  setShowMatchPairsModal: (show) => set({ showMatchPairsModal: show }),
  setShowYoutubePlayer: (show) => set({ showYoutubePlayer: show }),
  setIsFocusMode: (isFocus) => set({ isFocusMode: isFocus }),
  setShowOnlyUnknown: (show) => set({ showOnlyUnknown: show }),
  setZoomScale: (scale) => set({ zoomScale: scale }),
  setLayoutWidthMode: (mode) => set({ layoutWidthMode: mode }),
}));
