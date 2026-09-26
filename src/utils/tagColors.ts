/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

export { getTopicColor } from "./colorUtils";

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
  return TAG_PALETTE[index];
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

  // 1. Scan default suggestions
  extraDefaults.forEach(addTag);

  // 2. Scan lessons
  (lessons || []).forEach((l) => {
    if (l) {
      addTag(l.primaryTag);
      if (Array.isArray(l.tags)) l.tags.forEach(addTag);
    }
  });

  // 3. Scan playlists
  (playlists || []).forEach((p) => {
    if (p) {
      addTag(p.primaryTag);
      if (Array.isArray(p.tags)) p.tags.forEach(addTag);
    }
  });

  // 4. Scan history entries
  (history || []).forEach((h) => {
    if (h) {
      addTag(h.primaryTag);
      if (Array.isArray(h.tags)) h.tags.forEach(addTag);
    }
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

