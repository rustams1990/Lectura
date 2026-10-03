import { Lesson, Playlist } from "../types";
import { BingeQueueContext } from "../store/useBingeQueueStore";

export interface BingeCalculationResult {
  nextLesson: Lesson | null;
  isLastInPlaylist: boolean;
  playlistTitle?: string;
}

export function calculateNextBingeLesson(
  currentLesson: Lesson | null | undefined,
  lessons: Lesson[],
  playlists: Playlist[],
  queueContext: BingeQueueContext | null
): BingeCalculationResult {
  if (!currentLesson || !currentLesson.id) {
    return { nextLesson: null, isLastInPlaylist: false };
  }

  // 1. Context: Playlist
  const targetPlaylistId = currentLesson.playlistId || queueContext?.playlistId;
  if (targetPlaylistId) {
    const playlist = playlists.find((p) => p.id === targetPlaylistId);
    if (playlist && Array.isArray(playlist.items) && playlist.items.length > 0) {
      const currentIndex = playlist.items.findIndex(
        (it) =>
          it.lessonId === currentLesson.id ||
          (currentLesson.youtubeId && it.videoId === currentLesson.youtubeId) ||
          (currentLesson.title && it.title && it.title.trim().toLowerCase() === currentLesson.title.trim().toLowerCase())
      );

      if (currentIndex !== -1) {
        if (currentIndex + 1 < playlist.items.length) {
          const nextItem = playlist.items[currentIndex + 1];
          const nextLesson = lessons.find(
            (l) =>
              l.id === nextItem.lessonId ||
              (nextItem.videoId && l.youtubeId === nextItem.videoId) ||
              (nextItem.title && l.title && l.title.trim().toLowerCase() === nextItem.title.trim().toLowerCase())
          );
          if (nextLesson) {
            return {
              nextLesson,
              isLastInPlaylist: false,
              playlistTitle: playlist.title,
            };
          } else {
            // Virtual lesson representation so playback does not stall if next item is an unimported stream
            const isVideo = Boolean(nextItem.videoId);
            const virtualLesson: Lesson = {
              id: nextItem.lessonId || (isVideo ? `yt_temp_${nextItem.videoId}` : `podcast_temp_${nextItem.id}`),
              title: nextItem.title,
              youtubeId: nextItem.videoId || null,
              audioUrl: (nextItem as any).audioUrl || null,
              duration: nextItem.durationSeconds || 0,
              coverUrl: nextItem.thumbnailUrl || playlist.thumbnailUrl,
              targetLanguage: playlist.language,
              translationLanguage: "English",
              lessonType: isVideo ? "youtube" : "podcast",
              playlistId: playlist.id,
              text: "",
            };
            return {
              nextLesson: virtualLesson,
              isLastInPlaylist: false,
              playlistTitle: playlist.title,
            };
          }
        } else {
          // Reached end of playlist!
          return {
            nextLesson: null,
            isLastInPlaylist: true,
            playlistTitle: playlist.title,
          };
        }
      }
    }
  }

  // 2. Context: Filtered Library queue
  if (queueContext && queueContext.type === "library" && Array.isArray(queueContext.lessonIds)) {
    const currentIndex = queueContext.lessonIds.indexOf(currentLesson.id);
    if (currentIndex !== -1 && currentIndex + 1 < queueContext.lessonIds.length) {
      const nextId = queueContext.lessonIds[currentIndex + 1];
      const nextLesson = lessons.find((l) => l.id === nextId);
      if (nextLesson) {
        return { nextLesson, isLastInPlaylist: false };
      }
    } else if (currentIndex === queueContext.lessonIds.length - 1) {
      // Reached the end of filtered queue
      return { nextLesson: null, isLastInPlaylist: false };
    }
  }

  // 3. Fallback: Search among active lessons in same language
  const currentLang = (currentLesson.targetLanguage || "").toLowerCase().trim();
  const eligibleLessons = lessons.filter((l) => {
    if (l.isArchived) return false;
    if (l.id === currentLesson.id) return false;
    if (currentLang) {
      return (l.targetLanguage || "").toLowerCase().trim() === currentLang;
    }
    return true;
  });

  if (eligibleLessons.length > 0) {
    const currIdxInAll = lessons.findIndex((l) => l.id === currentLesson.id);
    if (currIdxInAll !== -1) {
      for (let i = currIdxInAll + 1; i < lessons.length; i++) {
        const candidate = lessons[i];
        if (
          !candidate.isArchived &&
          (!currentLang || (candidate.targetLanguage || "").toLowerCase().trim() === currentLang)
        ) {
          return { nextLesson: candidate, isLastInPlaylist: false };
        }
      }
    }
  }

  return { nextLesson: null, isLastInPlaylist: false };
}
