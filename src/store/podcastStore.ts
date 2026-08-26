import { create } from "zustand";
import { PodcastSubscription, PodcastSearchResult, PodcastEpisode, PodcastFeedMeta, PodcastTimelineEpisode } from "../types";
import { resolveServerUrl } from "../utils/mobileServerBridge";

export type { PodcastEpisode };

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = localStorage.getItem("vocab_clone_server_token");
    const syncKey = (window as any).__LOCAL_SYNC_KEY__ || "";
    const userStr = localStorage.getItem("vocab_clone_local_user");
    const user = userStr ? JSON.parse(userStr) : null;

    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (syncKey) headers["x-local-sync-key"] = syncKey;
    if (user?.uid || user?.email) {
      headers["x-local-sync-user"] = user.uid || user.email || "default";
    }
  } catch {}
  return headers;
}

let activeSearchAbortController: AbortController | null = null;

interface PodcastState {
  // Data
  subscriptions: PodcastSubscription[];
  searchResults: PodcastSearchResult[];
  currentPodcast: (PodcastSubscription | PodcastSearchResult) | null;
  currentFeedMeta: PodcastFeedMeta | null;
  currentFeedEpisodes: PodcastEpisode[];

  // Timeline (aggregated latest episodes from all subscriptions)
  timelineEpisodes: PodcastTimelineEpisode[];
  isTimelineLoading: boolean;

  // Loading states
  isSearching: boolean;
  isFeedLoading: boolean;
  isSubscribing: boolean;
  isLoadingSubscriptions: boolean;
  importingEpisodes: Record<string, boolean>; // guid → loading
  importingStages: Record<string, 'downloading' | 'transcribing'>; // guid → current stage
  importedEpisodes: Record<string, string>;   // guid → lessonId

  // Actions
  setCurrentPodcast: (podcast: (PodcastSubscription | PodcastSearchResult) | null) => void;
  fetchSubscriptions: () => Promise<void>;
  fetchTimeline: (forceRefresh?: boolean) => Promise<void>;
  subscribe: (podcast: PodcastSearchResult | PodcastSubscription) => Promise<PodcastSubscription | null>;
  unsubscribe: (id: string) => Promise<void>;
  searchPodcasts: (query: string, lang?: string) => Promise<void>;
  clearSearch: () => void;
  fetchFeed: (feedUrl: string) => Promise<void>;
  importEpisode: (episode: PodcastEpisode, podcastTitle: string, language: string, artworkUrl: string, activeLanguage?: string, taskId?: string) => Promise<string | null>;
}

export const usePodcastStore = create<PodcastState>((set, get) => ({
  subscriptions: [],
  searchResults: [],
  timelineEpisodes: [],
  currentPodcast: null,
  currentFeedMeta: null,
  currentFeedEpisodes: [],
  isSearching: false,
  isFeedLoading: false,
  isSubscribing: false,
  isLoadingSubscriptions: false,
  isTimelineLoading: false,
  importingEpisodes: {},
  importingStages: {},
  importedEpisodes: {},

  setCurrentPodcast: (podcast) => set({ currentPodcast: podcast }),

  // ── Fetch user subscriptions ────────────────────────────────────────────────
  fetchSubscriptions: async () => {
    set({ isLoadingSubscriptions: true });
    try {
      const headers = buildHeaders();
      delete headers["Content-Type"];
      const res = await fetch(resolveServerUrl("/api/podcasts/subscriptions"), { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ subscriptions: data.subscriptions || [] });
    } catch (e) {
      console.error("[PodcastStore] fetchSubscriptions error:", e);
    } finally {
      set({ isLoadingSubscriptions: false });
    }
  },

  // ── Fetch aggregated timeline (Latest Episodes) ─────────────────────────────
  fetchTimeline: async (forceRefresh = false) => {
    set({ isTimelineLoading: true });
    try {
      const headers = buildHeaders();
      delete headers["Content-Type"];
      const url = resolveServerUrl(`/api/podcasts/timeline${forceRefresh ? "?refresh=true" : ""}`);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ timelineEpisodes: data.episodes || [] });
    } catch (e) {
      console.error("[PodcastStore] fetchTimeline error:", e);
    } finally {
      set({ isTimelineLoading: false });
    }
  },

  // ── Subscribe to a podcast ──────────────────────────────────────────────────
  subscribe: async (podcast) => {
    set({ isSubscribing: true });
    try {
      const isSearchResult = "collectionId" in podcast;
      const payload = {
        title: isSearchResult ? podcast.title : podcast.title,
        author: isSearchResult ? (podcast as PodcastSearchResult).artistName : (podcast as PodcastSubscription).author,
        feedUrl: podcast.feedUrl,
        artworkUrl: isSearchResult ? (podcast as PodcastSearchResult).artworkUrl600 : (podcast as PodcastSubscription).artworkUrl,
        language: isSearchResult ? "" : (podcast as PodcastSubscription).language,
      };

      const res = await fetch(resolveServerUrl("/api/podcasts/subscriptions"), {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sub: PodcastSubscription = data.subscription;

      set((state) => {
        const exists = state.subscriptions.some(s => s.id === sub.id || s.feedUrl === sub.feedUrl);
        return {
          subscriptions: exists
            ? state.subscriptions
            : [sub, ...state.subscriptions],
        };
      });
      return sub;
    } catch (e) {
      console.error("[PodcastStore] subscribe error:", e);
      return null;
    } finally {
      set({ isSubscribing: false });
    }
  },

  // ── Unsubscribe from a podcast ──────────────────────────────────────────────
  unsubscribe: async (id) => {
    try {
      const res = await fetch(resolveServerUrl(`/api/podcasts/subscriptions/${id}`), {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set((state) => ({
        subscriptions: state.subscriptions.filter(s => s.id !== id),
      }));
    } catch (e) {
      console.error("[PodcastStore] unsubscribe error:", e);
    }
  },

  // ── iTunes Search ───────────────────────────────────────────────────────────
  searchPodcasts: async (query, lang) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      if (activeSearchAbortController) {
        activeSearchAbortController.abort();
        activeSearchAbortController = null;
      }
      set({ isSearching: false, searchResults: [] });
      return;
    }

    if (activeSearchAbortController) {
      activeSearchAbortController.abort();
    }
    const abortController = new AbortController();
    activeSearchAbortController = abortController;

    set({ isSearching: true });
    try {
      const params = new URLSearchParams({ q: cleanQuery });
      if (lang) params.set("lang", lang);
      const res = await fetch(resolveServerUrl(`/api/podcasts/search?${params}`), {
        signal: abortController.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (activeSearchAbortController === abortController) {
        set({ searchResults: data.results || [] });
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("[PodcastStore] searchPodcasts error:", e);
      }
    } finally {
      if (activeSearchAbortController === abortController) {
        set({ isSearching: false });
      }
    }
  },

  clearSearch: () => {
    if (activeSearchAbortController) {
      activeSearchAbortController.abort();
      activeSearchAbortController = null;
    }
    set({ isSearching: false, searchResults: [] });
  },

  // ── Lazy RSS Feed Parsing ───────────────────────────────────────────────────
  fetchFeed: async (feedUrl) => {
    set({ isFeedLoading: true, currentFeedEpisodes: [], currentFeedMeta: null });
    try {
      const res = await fetch(
        resolveServerUrl(`/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}`)
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        currentFeedMeta: data.meta || null,
        currentFeedEpisodes: data.episodes || [],
      });
    } catch (e) {
      console.error("[PodcastStore] fetchFeed error:", e);
    } finally {
      set({ isFeedLoading: false });
    }
  },

  // ── Import Episode to Library ───────────────────────────────────────────────
  importEpisode: async (episode, podcastTitle, language, artworkUrl, activeLanguage, taskId) => {
    const guid = episode.guid;
    if (get().importingEpisodes[guid]) return null;

    set(state => ({
      importingEpisodes: { ...state.importingEpisodes, [guid]: true },
      importingStages: { ...state.importingStages, [guid]: 'downloading' },
    }));

    // If episode has no pre-existing transcript, after 3.5s of download switch stage text to Whisper transcription
    let stageTimer: NodeJS.Timeout | null = null;
    if (!episode.hasTranscript && !episode.transcriptUrl) {
      stageTimer = setTimeout(() => {
        if (get().importingEpisodes[guid]) {
          set(state => ({
            importingStages: { ...state.importingStages, [guid]: 'transcribing' },
          }));
        }
      }, 3500);
    }

    try {
      const res = await fetch(resolveServerUrl("/api/podcasts/import-episode"), {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          guid,
          title: episode.title,
          audioUrl: episode.audioUrl,
          originalAudioUrl: episode.originalAudioUrl,
          transcriptUrl: episode.transcriptUrl || "",
          description: episode.description,
          artworkUrl: episode.artworkUrl || artworkUrl,
          podcastTitle,
          language,
          activeLanguage,
          currentLanguage: activeLanguage,
          duration: episode.duration,
          pubDate: episode.pubDate,
          taskId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      set(state => ({
        importedEpisodes: { ...state.importedEpisodes, [guid]: data.lessonId },
      }));
      window.dispatchEvent(new CustomEvent("lectura:refresh_lessons")); return data.lessonId as string;
    } catch (e) {
      console.error("[PodcastStore] importEpisode error:", e);
      return null;
    } finally {
      if (stageTimer) clearTimeout(stageTimer);
      set(state => {
        const nextEpisodes = { ...state.importingEpisodes };
        const nextStages = { ...state.importingStages };
        delete nextEpisodes[guid];
        delete nextStages[guid];
        return { importingEpisodes: nextEpisodes, importingStages: nextStages };
      });
    }
  },
}));
