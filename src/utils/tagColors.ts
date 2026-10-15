/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTopicColor } from "./colorUtils";

// Curated palette of visually balanced colors for tags
const TAG_PALETTE = [
  { hex: "#0D9488", bg: "bg-teal-500", text: "text-teal-600 dark:text-teal-400", lightBg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-200 dark:border-teal-800" },
  { hex: "#2563EB", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", lightBg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800" },
  { hex: "#7C3AED", bg: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", lightBg: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800" },
  { hex: "#DB2777", bg: "bg-pink-500", text: "text-pink-600 dark:text-pink-400", lightBg: "bg-pink-50 dark:bg-pink-950/40", border: "border-pink-200 dark:border-pink-800" },
  { hex: "#EA580C", bg: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", lightBg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800" },
  { hex: "#16A34A", bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", lightBg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800" },
  { hex: "#0284C7", bg: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", lightBg: "bg-sky-50 dark:bg-sky-950/40", border: "border-sky-200 dark:border-sky-800" },
  { hex: "#D97706", bg: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", lightBg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800" },
  { hex: "#E11D48", bg: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", lightBg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800" },
  { hex: "#4F46E5", bg: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400", lightBg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-200 dark:border-indigo-800" },
  { hex: "#059669", bg: "bg-green-500", text: "text-green-600 dark:text-green-400", lightBg: "bg-green-50 dark:bg-green-950/40", border: "border-green-200 dark:border-green-800" },
  { hex: "#C026D3", bg: "bg-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400", lightBg: "bg-fuchsia-50 dark:bg-fuchsia-950/40", border: "border-fuchsia-200 dark:border-fuchsia-800" },
];

export { getTopicColor };

export const UNCATEGORIZED_COLOR = {
  hex: "#9CA3AF",
  bg: "bg-zinc-400",
  text: "text-zinc-500 dark:text-zinc-400",
  lightBg: "bg-zinc-100 dark:bg-zinc-800/60",
  border: "border-zinc-300 dark:border-zinc-700",
};

export function getTagColor(tagName: string | null | undefined) {
  if (!tagName || !tagName.trim() || tagName.toLowerCase() === "uncategorized" || tagName.toLowerCase() === "без категории") {
    return UNCATEGORIZED_COLOR;
  }
  const clean = tagName.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % TAG_PALETTE.length;
  const paletteColor = TAG_PALETTE[index];
  return {
    ...paletteColor,
    hex: getTopicColor(clean),
  };
}

export const DEFAULT_SUGGESTED_TAGS = [
  "Language Learning",
  "Gaming",
  "Tech",
  "Podcast",
  "Grammar",
  "Vocabulary",
  "Stories",
  "News",
  "Science",
  "Travel",
  "History",
  "Culture",
  "Business",
  "Music",
  "Comedy",
];

export function getAllKnownTags(
  lessons?: any[] | null,
  playlists?: any[] | null,
  history?: any[] | null,
  extraDefaults: string[] = DEFAULT_SUGGESTED_TAGS
): string[] {
  const map = new Map<string, string>(); // lowerKey -> canonical

  const addTag = (raw: string | null | undefined) => {
    if (!raw || typeof raw !== "string") return;
    const clean = raw.trim().replace(/^#+/, "").trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (lower === "youtube" || lower === "extension") return;

    if (!map.has(lower)) {
      // Capitalize first letter if all lowercase
      const canonical =
        clean.length > 1 && clean[0] === clean[0].toLowerCase() && clean[1] === clean[1].toLowerCase()
          ? clean.charAt(0).toUpperCase() + clean.slice(1)
          : clean;
      map.set(lower, canonical);
    }
  };

  const processItem = (primaryTag: string | null | undefined, tags: any) => {
    addTag(primaryTag);
    if (Array.isArray(tags)) {
      tags.forEach(addTag);
    } else if (typeof tags === "string") {
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) parsed.forEach(addTag);
      } catch {}
    }
  };

  // 1. Scan default suggestions
  extraDefaults.forEach(addTag);

  // 2. Scan lessons
  (lessons || []).forEach((l) => {
    if (l) processItem(l.primaryTag, l.tags);
  });

  // 3. Scan playlists
  (playlists || []).forEach((p) => {
    if (p) processItem(p.primaryTag, p.tags);
  });

  // 4. Scan history entries
  (history || []).forEach((h) => {
    if (h) processItem(h.primaryTag, h.tags);
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns tags ranked by how frequently they are used by the user across lessons,
 * playlists, and history. If targetLanguage is specified, tags used with that language
 * receive higher priority. If fewer than `limit` used tags exist, remaining slots
 * are filled from extraDefaults.
 */
export function getFrequentlyUsedTags(
  lessons?: any[] | null,
  playlists?: any[] | null,
  history?: any[] | null,
  limit: number = 10,
  targetLanguage?: string | null,
  extraDefaults: string[] = DEFAULT_SUGGESTED_TAGS
): string[] {
  const map = new Map<string, { canonical: string; count: number; langMatchCount: number }>();

  const targetLangLower = (targetLanguage || "").trim().toLowerCase();

  const processItem = (
    primaryTag: string | null | undefined,
    tags: any,
    itemLang?: string | null
  ) => {
    const itemUnique = new Set<string>();
    const itemLangLower = (itemLang || "").trim().toLowerCase();
    const isLangMatch = !!targetLangLower && !!itemLangLower && (
      itemLangLower === targetLangLower ||
      itemLangLower.startsWith(targetLangLower) ||
      targetLangLower.startsWith(itemLangLower)
    );

    const cleanAndCollect = (raw: string | null | undefined) => {
      if (!raw || typeof raw !== "string") return;
      const clean = raw.trim().replace(/^#+/, "").trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (lower === "youtube" || lower === "extension") return;

      const canonical =
        clean.length > 1 && clean[0] === clean[0].toLowerCase() && clean[1] === clean[1].toLowerCase()
          ? clean.charAt(0).toUpperCase() + clean.slice(1)
          : clean;

      itemUnique.add(lower);

      if (!map.has(lower)) {
        map.set(lower, { canonical, count: 0, langMatchCount: 0 });
      } else {
        const entry = map.get(lower)!;
        if (entry.canonical[0] === entry.canonical[0].toLowerCase() && canonical[0] !== canonical[0].toLowerCase()) {
          entry.canonical = canonical;
        }
      }
    };

    cleanAndCollect(primaryTag);
    if (Array.isArray(tags)) {
      tags.forEach(cleanAndCollect);
    } else if (typeof tags === "string") {
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) parsed.forEach(cleanAndCollect);
      } catch {}
    }

    for (const lower of itemUnique) {
      const entry = map.get(lower);
      if (entry) {
        entry.count += 1;
        if (isLangMatch) {
          entry.langMatchCount += 1;
        }
      }
    }
  };

  (lessons || []).forEach((l) => {
    if (l) processItem(l.primaryTag, l.tags, l.targetLanguage);
  });
  (playlists || []).forEach((p) => {
    if (p) processItem(p.primaryTag, p.tags, p.targetLanguage || (p as any).language);
  });
  (history || []).forEach((h) => {
    if (h) processItem(h.primaryTag, h.tags, h.targetLanguage);
  });

  // Sort used tags by score descending (lang match bonus + total frequency)
  const usedTags = Array.from(map.values())
    .filter((e) => e.count > 0)
    .sort((a, b) => {
      const scoreA = a.count + (a.langMatchCount * 2);
      const scoreB = b.count + (b.langMatchCount * 2);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return a.canonical.localeCompare(b.canonical);
    })
    .map((e) => e.canonical);

  if (usedTags.length >= limit) {
    return usedTags.slice(0, limit);
  }

  // Fill up to limit with extraDefaults that haven't been used yet
  const lowerUsed = new Set(usedTags.map((t) => t.toLowerCase()));
  const fallbackDefaults = extraDefaults
    .map((raw) => {
      const clean = raw.trim().replace(/^#+/, "").trim();
      return clean.length > 1 && clean[0] === clean[0].toLowerCase() && clean[1] === clean[1].toLowerCase()
        ? clean.charAt(0).toUpperCase() + clean.slice(1)
        : clean;
    })
    .filter((t) => t && !lowerUsed.has(t.toLowerCase()) && t.toLowerCase() !== "youtube" && t.toLowerCase() !== "extension");

  return [...usedTags, ...fallbackDefaults].slice(0, limit);
}


