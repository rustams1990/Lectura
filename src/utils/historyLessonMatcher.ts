import { Lesson, HistoryEntry, Playlist } from '../types';

/**
 * Robustly matches a history entry to its corresponding Lesson in the library.
 * Handles direct ID match, YouTube ID match (including "lesson-yt_" and "youtube_" prefixes),
 * YouTube cover/thumbnail URL match, and normalized title matching.
 */
export function findMatchingLesson(
  item?: HistoryEntry | null,
  lessons?: Lesson[] | null
): Lesson | undefined {
  if (!item || !lessons || lessons.length === 0) return undefined;

  // 1. Direct ID match
  if (item.lessonId) {
    const direct = lessons.find((l) => l.id === item.lessonId);
    if (direct) return direct;
  }

  // 2. YouTube ID match
  const rawYtId = item.youtubeId || (
    item.lessonId?.startsWith("lesson-yt_")
      ? item.lessonId.replace("lesson-yt_", "")
      : (item.lessonId?.startsWith("youtube_") ? item.lessonId.replace("youtube_", "") : null)
  );
  if (rawYtId) {
    const cleanYt = rawYtId.trim();
    const ytMatch = lessons.find(
      (l) => l.youtubeId === cleanYt || l.id === cleanYt || l.id === `youtube_${cleanYt}` || l.id === `lesson-yt_${cleanYt}`
    );
    if (ytMatch) return ytMatch;
  }

  // 3. Cover URL match (e.g. https://img.youtube.com/vi/53TuWHq6OXM/maxresdefault.jpg)
  if (item.coverUrl) {
    const coverMatch = item.coverUrl.match(/(?:vi\/|vi_webp\/|v=|\/)([a-zA-Z0-9_-]{11})/);
    if (coverMatch && coverMatch[1]) {
      const extractedYt = coverMatch[1];
      const match = lessons.find(
        (l) => l.youtubeId === extractedYt || l.id === extractedYt || l.id === `youtube_${extractedYt}` || l.id === `lesson-yt_${extractedYt}`
      );
      if (match) return match;
    }
  }

  // 4. Exact Title match fallback (for imported/custom records in same target language)
  if (item.lessonTitle && item.lessonTitle.trim()) {
    const cleanTitle = item.lessonTitle.trim().toLowerCase();
    const titleMatch = lessons.find(
      (l) => l.title && l.title.trim().toLowerCase() === cleanTitle
    );
    if (titleMatch) return titleMatch;
  }

  return undefined;
}

/**
 * Resolves effective tags (primary tag + secondary tags) for a history item,
 * with fallback inheritance from its matched lesson and parent playlist.
 */
export function getHistoryEffectiveTags(
  item: HistoryEntry,
  matchedLesson?: Lesson | null,
  playlists?: Playlist[] | null
): { primaryTag: string | null; tags: string[] } {
  // If history item explicitly has its own primaryTag or tags
  const itemPrimary = item.primaryTag?.trim() || null;
  const itemTags = Array.isArray(item.tags)
    ? item.tags.filter((t) => Boolean(t && typeof t === "string" && t.trim()))
    : [];

  // If history item has both, return directly
  if (itemPrimary && itemTags.length > 0) {
    return { primaryTag: itemPrimary, tags: itemTags };
  }

  // Otherwise, fallback to matched lesson tags and playlist tags
  let lessonPrimary: string | null = null;
  let lessonTags: string[] = [];

  if (matchedLesson) {
    lessonPrimary = matchedLesson.primaryTag?.trim() || null;
    if (Array.isArray(matchedLesson.tags)) {
      lessonTags = matchedLesson.tags.filter((t) => Boolean(t && typeof t === "string" && t.trim()));
    }
    // Playlist fallback
    if (!lessonPrimary && matchedLesson.playlistId && playlists && playlists.length > 0) {
      const parentPlaylist = playlists.find((p) => p.id === matchedLesson.playlistId);
      if (parentPlaylist?.primaryTag?.trim()) {
        lessonPrimary = parentPlaylist.primaryTag.trim();
      }
    }
  }

  const finalPrimary = itemPrimary || lessonPrimary || (itemTags.length > 0 ? itemTags[0] : (lessonTags.length > 0 ? lessonTags[0] : null));
  const finalTags = itemTags.length > 0 ? itemTags : lessonTags;

  return {
    primaryTag: finalPrimary,
    tags: finalTags,
  };
}
