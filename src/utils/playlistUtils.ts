/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Playlist, PlaylistItem, Lesson } from "../types";
import { normalizeLanguage } from "../utils";

/**
 * Deduplicates playlist items based on videoId, lessonId, and item id.
 * Merges duplicate entries to preserve the most complete metadata
 * (lessonId, transcriptLoaded, duration, and thumbnail).
 */
export function deduplicatePlaylistItems(
  items: PlaylistItem[] | null | undefined,
  lessons?: Lesson[] | null
): PlaylistItem[] {
  if (!items || !Array.isArray(items) || items.length <= 1) {
    return items ? [...items] : [];
  }

  const lessonById = new Map<string, Lesson>();
  const lessonByVideoId = new Map<string, Lesson>();
  if (lessons && Array.isArray(lessons)) {
    lessons.forEach((l) => {
      if (l.id) lessonById.set(l.id, l);
      if (l.youtubeId) lessonByVideoId.set(l.youtubeId, l);
    });
  }

  const result: PlaylistItem[] = [];

  for (const item of items) {
    if (!item) continue;

    const itemVideoId = item.videoId || (item.lessonId ? lessonById.get(item.lessonId)?.youtubeId : null) || null;
    const itemLessonId = item.lessonId || (item.videoId ? lessonByVideoId.get(item.videoId)?.id : null) || null;

    const existingIndex = result.findIndex((existing) => {
      // 1. Exact PlaylistItem id
      if (existing.id && item.id && existing.id === item.id) return true;

      // 2. Same YouTube video ID
      const existingVideoId = existing.videoId || (existing.lessonId ? lessonById.get(existing.lessonId)?.youtubeId : null) || null;
      if (itemVideoId && existingVideoId && itemVideoId === existingVideoId) return true;

      // 3. Same Lesson ID
      const existingLessonId = existing.lessonId || (existing.videoId ? lessonByVideoId.get(existing.videoId)?.id : null) || null;
      if (itemLessonId && existingLessonId && itemLessonId === existingLessonId) return true;

      // 4. Exact Title match with compatible duration or missing videoIds
      if (
        item.title &&
        existing.title &&
        item.title.trim().toLowerCase() === existing.title.trim().toLowerCase()
      ) {
        if (!itemVideoId && !existingVideoId) return true;
        if (
          item.durationSeconds &&
          existing.durationSeconds &&
          Math.abs(item.durationSeconds - existing.durationSeconds) <= 25
        ) {
          return true;
        }
      }

      return false;
    });

    if (existingIndex === -1) {
      result.push({ ...item });
    } else {
      const prev = result[existingIndex];
      const merged: PlaylistItem = {
        ...prev,
        lessonId: prev.lessonId || item.lessonId || undefined,
        videoId: prev.videoId || item.videoId || itemVideoId || undefined,
        transcriptLoaded: Boolean(prev.transcriptLoaded || item.transcriptLoaded),
        title: (prev.title && prev.title.trim().length >= (item.title || "").trim().length)
          ? prev.title
          : (item.title || prev.title),
        durationSeconds: Math.max(prev.durationSeconds || 0, item.durationSeconds || 0),
        thumbnailUrl: (
          prev.thumbnailUrl?.includes("maxresdefault")
            ? prev.thumbnailUrl
            : (item.thumbnailUrl?.includes("maxresdefault") ? item.thumbnailUrl : (prev.thumbnailUrl || item.thumbnailUrl || ""))
        ),
        publishedAt: prev.publishedAt || item.publishedAt,
      };
      result[existingIndex] = merged;
    }
  }

  return result;
}

/**
 * Deduplicates items in a Playlist object and cleans up itemCount and primaryItemId.
 */
export function deduplicatePlaylist(
  playlist: Playlist,
  lessons?: Lesson[] | null
): Playlist {
  if (!playlist || !Array.isArray(playlist.items)) {
    return playlist;
  }
  const cleanItems = deduplicatePlaylistItems(playlist.items, lessons);
  const stillHasPrimary = playlist.primaryItemId
    ? cleanItems.some((it) => it.id === playlist.primaryItemId)
    : false;

  return {
    ...playlist,
    items: cleanItems,
    itemCount: cleanItems.length,
    primaryItemId: stillHasPrimary ? playlist.primaryItemId : (cleanItems[0]?.id || undefined),
    thumbnailUrl: stillHasPrimary ? playlist.thumbnailUrl : (cleanItems[0]?.thumbnailUrl || playlist.thumbnailUrl || ""),
  };
}

/**
 * Ensures strict language segregation across playlists and lessons.
 * If any playlist contains items whose corresponding lesson belongs to a different target language,
 * this function cleanly extracts those items into a playlist of their matching language.
 *
 * For example:
 * If a Spanish playlist "Language Learning" contains English videos,
 * those videos are separated into an English playlist "Language Learning",
 * and the Spanish playlist retains only its Spanish videos.
 */
export function segregatePlaylistsByLanguage(
  playlists: Playlist[],
  lessons: Lesson[]
): {
  playlists: Playlist[];
  lessons: Lesson[];
  hasChanges: boolean;
} {
  if (!playlists || playlists.length === 0 || !lessons || lessons.length === 0) {
    return { playlists, lessons, hasChanges: false };
  }

  const lessonById = new Map<string, Lesson>();
  const lessonByVideoId = new Map<string, Lesson>();
  lessons.forEach((l) => {
    if (l.id) lessonById.set(l.id, l);
    if (l.youtubeId) lessonByVideoId.set(l.youtubeId, l);
  });

  let hasChanges = false;
  const updatedPlaylists: Playlist[] = [];
  const lessonsToUpdate = new Map<string, Lesson>();

  // Temporary container for newly segregated playlists by key: `${langNorm}___${title.toLowerCase()}`
  const newPlaylistsByLangAndTitle = new Map<string, Playlist>();

  for (const pl of playlists) {
    const items = pl.items || [];
    const firstLessonWithLang = items.map((it) => (it.lessonId ? lessonById.get(it.lessonId) : null) || (it.videoId ? lessonByVideoId.get(it.videoId) : null)).find((l) => !!l?.targetLanguage);
    const plProperLang = normalizeLanguage(pl.language || firstLessonWithLang?.targetLanguage || "English");
    const plLangNorm = plProperLang.toLowerCase();
    const matchingItems: PlaylistItem[] = [];
    const misallocatedItemsByLang = new Map<string, PlaylistItem[]>();

    for (const item of items) {
      const matchLesson = (item.lessonId ? lessonById.get(item.lessonId) : null) ||
        (item.videoId ? lessonByVideoId.get(item.videoId) : null);

      const rawItemLang = matchLesson?.targetLanguage || plProperLang;
      const itemProperLang = normalizeLanguage(rawItemLang);
      const itemLangNorm = itemProperLang.toLowerCase();

      if (itemLangNorm === plLangNorm) {
        matchingItems.push(item);
      } else {
        hasChanges = true;
        if (!misallocatedItemsByLang.has(itemProperLang)) {
          misallocatedItemsByLang.set(itemProperLang, []);
        }
        misallocatedItemsByLang.get(itemProperLang)!.push(item);
      }
    }

    // Deduplicate matching items
    const cleanMatching = deduplicatePlaylistItems(matchingItems, lessons);
    if (cleanMatching.length !== items.length) {
      hasChanges = true;
      const stillHasPrimary = pl.primaryItemId ? cleanMatching.some(it => it.id === pl.primaryItemId) : false;
      updatedPlaylists.push({
        ...pl,
        items: cleanMatching,
        itemCount: cleanMatching.length,
        language: pl.language || plProperLang,
        primaryItemId: stillHasPrimary ? pl.primaryItemId : (cleanMatching[0]?.id || undefined),
        thumbnailUrl: stillHasPrimary ? pl.thumbnailUrl : (cleanMatching[0]?.thumbnailUrl || pl.thumbnailUrl || ""),
        updatedAt: new Date().toISOString(),
      });
    } else {
      updatedPlaylists.push(pl);
    }

    // For each group of misallocated items:
    misallocatedItemsByLang.forEach((extractedItems, properTargetLang) => {
      const groupKey = `${properTargetLang.toLowerCase()}___${pl.title.trim().toLowerCase()}`;

      // Check if a playlist of that language and title already exists
      let targetPl = updatedPlaylists.find(
        (p) =>
          normalizeLanguage(p.language || "").toLowerCase() === properTargetLang.toLowerCase() &&
          p.title.trim().toLowerCase() === pl.title.trim().toLowerCase()
      ) || newPlaylistsByLangAndTitle.get(groupKey);

      if (targetPl) {
        const mergedItems = deduplicatePlaylistItems([...(targetPl.items || []), ...extractedItems], lessons);
        targetPl = {
          ...targetPl,
          items: mergedItems,
          itemCount: mergedItems.length,
          updatedAt: new Date().toISOString(),
        };
        newPlaylistsByLangAndTitle.set(groupKey, targetPl);

        // Update the lessons' playlistId
        extractedItems.forEach((it) => {
          const l = (it.lessonId ? lessonById.get(it.lessonId) : null) ||
            (it.videoId ? lessonByVideoId.get(it.videoId) : null);
          if (l && l.playlistId !== targetPl!.id) {
            lessonsToUpdate.set(l.id, { ...l, playlistId: targetPl!.id });
          }
        });
      } else {
        // Create new playlist for this target language!
        const newPlId = `pl_${properTargetLang.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const createdPl: Playlist = {
          id: newPlId,
          title: pl.title.trim(),
          thumbnailUrl: extractedItems[0]?.thumbnailUrl || pl.thumbnailUrl || "",
          sourceType: "custom_collection",
          itemCount: extractedItems.length,
          language: properTargetLang,
          items: extractedItems,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newPlaylistsByLangAndTitle.set(groupKey, createdPl);

        extractedItems.forEach((it) => {
          const l = (it.lessonId ? lessonById.get(it.lessonId) : null) ||
            (it.videoId ? lessonByVideoId.get(it.videoId) : null);
          if (l && l.playlistId !== newPlId) {
            lessonsToUpdate.set(l.id, { ...l, playlistId: newPlId });
          }
        });
      }
    });
  }

  // Merge any newly created playlists into updatedPlaylists
  newPlaylistsByLangAndTitle.forEach((newPl) => {
    const existingIdx = updatedPlaylists.findIndex((p) => p.id === newPl.id);
    if (existingIdx !== -1) {
      updatedPlaylists[existingIdx] = newPl;
    } else {
      updatedPlaylists.push(newPl);
    }
  });

  const nextLessons = lessonsToUpdate.size > 0
    ? lessons.map((l) => lessonsToUpdate.get(l.id) || l)
    : lessons;

  return {
    playlists: updatedPlaylists,
    lessons: nextLessons,
    hasChanges,
  };
}
