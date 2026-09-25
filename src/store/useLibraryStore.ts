import { create } from "zustand";

interface LibraryStore {
  isSelectionMode: boolean;
  selectedBookIds: string[];
  isBatchLoading: boolean;

  setSelectionMode: (active: boolean) => void;
  toggleSelectionMode: (active?: boolean) => void;
  toggleBookSelection: (id: string) => void;
  selectBook: (id: string) => void;
  deselectBook: (id: string) => void;
  selectAll: (allVisibleIds: string[]) => void;
  clearSelection: () => void;
  setBatchLoading: (loading: boolean) => void;
  setIsBatchLoading: (loading: boolean) => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  isSelectionMode: false,
  selectedBookIds: [],
  isBatchLoading: false,

  setSelectionMode: (active) =>
    set((state) => ({
      isSelectionMode: active,
      selectedBookIds: active ? state.selectedBookIds : [],
    })),

  toggleSelectionMode: (active) =>
    set((state) => {
      const nextActive = active !== undefined ? active : !state.isSelectionMode;
      return {
        isSelectionMode: nextActive,
        selectedBookIds: nextActive ? state.selectedBookIds : [],
      };
    }),

  toggleBookSelection: (id) =>
    set((state) => {
      const exists = state.selectedBookIds.includes(id);
      return {
        selectedBookIds: exists
          ? state.selectedBookIds.filter((item) => item !== id)
          : [...state.selectedBookIds, id],
      };
    }),

  selectBook: (id) =>
    set((state) => {
      if (state.selectedBookIds.includes(id)) return state;
      return { selectedBookIds: [...state.selectedBookIds, id] };
    }),

  deselectBook: (id) =>
    set((state) => ({
      selectedBookIds: state.selectedBookIds.filter((item) => item !== id),
    })),

  selectAll: (allVisibleIds) =>
    set((state) => {
      const allSelected =
        allVisibleIds.length > 0 &&
        allVisibleIds.every((id) => state.selectedBookIds.includes(id));

      if (allSelected) {
        // Deselect all visible
        return {
          selectedBookIds: state.selectedBookIds.filter(
            (id) => !allVisibleIds.includes(id)
          ),
        };
      } else {
        // Select all visible (union)
        const merged = Array.from(
          new Set([...state.selectedBookIds, ...allVisibleIds])
        );
        return { selectedBookIds: merged };
      }
    }),

  clearSelection: () =>
    set({
      selectedBookIds: [],
    }),

  setBatchLoading: (loading) => set({ isBatchLoading: loading }),
  setIsBatchLoading: (loading) => set({ isBatchLoading: loading }),
}));
