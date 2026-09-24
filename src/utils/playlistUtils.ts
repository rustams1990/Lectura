/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Playlist, PlaylistItem, Lesson } from "../types";
import { normalizeLanguage } from "../utils";

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

    // Update original playlist with only matching items
    if (matchingItems.length !== items.length) {
      updatedPlaylists.push({
        ...pl,
        items: matchingItems,
        itemCount: matchingItems.length,
        language: pl.language || plProperLang,
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
        // Append items avoiding duplicates
        const existingIds = new Set((targetPl.items || []).map((it) => it.lessonId || it.videoId));
        const itemsToAdd = extractedItems.filter((it) => !existingIds.has(it.lessonId || it.videoId));
        const mergedItems = [...(targetPl.items || []), ...itemsToAdd];
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
