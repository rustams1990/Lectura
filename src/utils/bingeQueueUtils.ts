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
          (currentLesson.youtubeId && it.videoId === currentLesson.youtubeId)
      );

      if (currentIndex !== -1) {
        if (currentIndex + 1 < playlist.items.length) {
          const nextItem = playlist.items[currentIndex + 1];
          const nextLesson = lessons.find(
            (l) =>
              l.id === nextItem.lessonId ||
              (nextItem.videoId && l.youtubeId === nextItem.videoId)
          );
          if (nextLesson) {
            return {
              nextLesson,
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
