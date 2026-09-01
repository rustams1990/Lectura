import { create } from "zustand";
import { Lesson } from "../types";
import { resolveApiUrl } from "../utils/apiConfig";

interface LessonStore {
  lessons: Lesson[];
  archivingIds: Set<string>;
  archiveLesson: (id: string, isArchived?: boolean) => Promise<void>;
  setLessons: (incomingLessons: Lesson[] | ((prev: Lesson[]) => Lesson[])) => void;
}

export const useLessonStore = create<LessonStore>((set, get) => ({
  lessons: [],
  archivingIds: new Set<string>(),

  archiveLesson: async (id: string, isArchived = true) => {
    // 1. Optimistically mark ID in archivingIds and update lesson in state
    set((state) => {
      const nextArchiving = new Set(state.archivingIds).add(id);
      return {
        archivingIds: nextArchiving,
        lessons: state.lessons.map((l) => (l.id === id ? { ...l, isArchived } : l)),
      };
    });

    try {
      // 2. Await server response
      const savedToken = localStorage.getItem("vocab_clone_server_token") || "";
      const savedUserStr = localStorage.getItem("vocab_clone_local_user");
      const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
      const localSyncKey = localStorage.getItem("local_sync_key") || "";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-local-sync-key": localSyncKey,
        "x-local-sync-user": savedUser ? (savedUser.uid || savedUser.email || "default") : "default",
      };
      if (savedToken) {
        headers["Authorization"] = `Bearer ${savedToken}`;
      }

      await fetch(resolveApiUrl(`/api/lessons/${id}/archive`), {
        method: "POST",
        headers,
        body: JSON.stringify({ isArchived }),
      });
    } catch (err) {
      console.error("Failed to archive lesson on server:", err);
    } finally {
      // 3. Keep lock for 3 seconds so background sync / server fetch can't revert it
      setTimeout(() => {
        set((state) => {
          const next = new Set(state.archivingIds);
          next.delete(id);
          return { archivingIds: next };
        });
      }, 3000);
    }
  },

  setLessons: (incomingLessons) => {
    const { archivingIds } = get();
    set((state) => {
      const resolved = typeof incomingLessons === "function" ? incomingLessons(state.lessons) : incomingLessons;
      const merged = resolved.map((l) => {
        if (archivingIds.has(l.id)) {
          const current = state.lessons.find((item) => item.id === l.id);
          if (current) {
            return { ...l, isArchived: current.isArchived };
          }
        }
        return l;
      });
      return { lessons: merged };
    });
  },
}));
