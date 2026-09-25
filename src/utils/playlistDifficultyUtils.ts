/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility functions for computing and displaying a playlist's difficulty range
 * based on the lessons it contains.
 *
 * Algorithm:
 * - A playlist's difficulty range spans from the lowest to the highest CEFR level
 *   found across all its lessons.
 * - Filtering: A playlist "matches" a selected filter group if it contains
 *   AT LEAST ONE lesson belonging to that group (range overlap check).
 */

import { DifficultyGroup } from "../components/library/LevelFilterDropdown";

// Ordered CEFR levels from lowest to highest
const LEVEL_ORDER: DifficultyGroup[] = ["a1-a2", "b1-b2", "c1-c2"];

/**
 * Classifies a raw difficulty string into one of the CEFR groups.
 * Returns null if not classifiable.
 */
export function classifyDifficulty(difficulty: string | null | undefined): DifficultyGroup | null {
  if (!difficulty || typeof difficulty !== "string") return null;
  const d = difficulty.toLowerCase().trim();

  // A1–A2 (Beginner, Elementary, Pre-Intermediate)
  if (
    d.includes("a1") ||
    d.includes("a2") ||
    d.includes("beginner") ||
    d.includes("elementary") ||
    d.includes("pre-intermediate") ||
    d.includes("начинающ")
  ) {
    return "a1-a2";
  }

  // B1–B2 (Intermediate)
  if (d.includes("b1") || d.includes("b2") || d.includes("средн")) return "b1-b2";
  if (d.includes("intermediate") && !d.includes("pre-intermediate")) return "b1-b2";

  // C1–C2 (Advanced, Proficient, Native)
  if (
    d.includes("c1") ||
    d.includes("c2") ||
    d.includes("advanced") ||
    d.includes("proficient") ||
    d.includes("продвинут") ||
    d.includes("носител") ||
    d.includes("native")
  ) {
    return "c1-c2";
  }

  return null;
}

export interface PlaylistDifficultyRange {
  /** Lowest CEFR group found in the playlist, or null if no lessons have difficulty data */
  min: DifficultyGroup | null;
  /** Highest CEFR group found in the playlist, or null if no lessons have difficulty data */
  max: DifficultyGroup | null;
  /** Set of all distinct CEFR groups represented in the playlist */
  groups: Set<DifficultyGroup>;
  /** Total lessons with classifiable difficulty */
  classifiedCount: number;
  /** Total lessons checked */
  totalCount: number;
}

/**
 * Computes the difficulty range across all lessons in a playlist.
 * @param lessonIds - array of lesson IDs or videoIds in playlist order
 * @param findLesson - lookup function that returns a lesson by id or videoId
 */
export function computePlaylistDifficultyRange(
  lessonIds: { lessonId?: string; videoId?: string }[],
  findLesson: (lessonId?: string, videoId?: string) => { difficulty?: string | null } | undefined
): PlaylistDifficultyRange {
  const groups = new Set<DifficultyGroup>();
  let classifiedCount = 0;
  let totalCount = 0;

  for (const item of lessonIds) {
    const lesson = findLesson(item.lessonId, item.videoId);
    if (!lesson) continue;
    totalCount++;

    const group = classifyDifficulty(lesson.difficulty);
    if (group) {
      groups.add(group);
      classifiedCount++;
    }
  }

  if (groups.size === 0) {
    return { min: null, max: null, groups, classifiedCount, totalCount };
  }

  // Find min/max in LEVEL_ORDER
  let minIdx = LEVEL_ORDER.length;
  let maxIdx = -1;
  for (const g of groups) {
    const idx = LEVEL_ORDER.indexOf(g);
    if (idx < minIdx) minIdx = idx;
    if (idx > maxIdx) maxIdx = idx;
  }

  return {
    min: LEVEL_ORDER[minIdx],
    max: LEVEL_ORDER[maxIdx],
    groups,
    classifiedCount,
    totalCount,
  };
}

/**
 * Returns true if the playlist difficulty range overlaps with the selected filter group.
 * A playlist "matches" if it contains at least one lesson in the selected group.
 */
export function playlistMatchesDifficultyFilter(
  range: PlaylistDifficultyRange,
  selectedGroup: DifficultyGroup
): boolean {
  if (selectedGroup === "all") return true;
  return range.groups.has(selectedGroup);
}

/** Short label for the difficulty range badge on the playlist card, e.g. "B1–C1" */
export function getDifficultyRangeLabel(range: PlaylistDifficultyRange): string | null {
  if (!range.min || !range.max) return null;

  const LABELS: Record<DifficultyGroup, string> = {
    all: "",
    "a1-a2": "A1–A2",
    "b1-b2": "B1–B2",
    "c1-c2": "C1–C2",
  };

  if (range.min === range.max) return LABELS[range.min];

  // Expand to a continuous range label, e.g. B1–C2
  const minLabel = LABELS[range.min].split("–")[0]; // "B1"
  const maxLabel = LABELS[range.max].split("–")[1]; // "C2"
  return `${minLabel}–${maxLabel}`;
}

/** Tailwind color classes for the difficulty range badge */
export function getDifficultyRangeBadgeColor(range: PlaylistDifficultyRange): {
  bg: string;
  text: string;
  dot: string;
} {
  if (!range.min || !range.max) {
    return { bg: "bg-zinc-700/80", text: "text-zinc-200", dot: "bg-zinc-400" };
  }

  // If range spans multiple levels → use neutral/indigo
  if (range.min !== range.max) {
    return {
      bg: "bg-indigo-900/80",
      text: "text-indigo-100",
      dot: "bg-indigo-400",
    };
  }

  switch (range.min) {
    case "a1-a2":
      return { bg: "bg-emerald-900/80", text: "text-emerald-100", dot: "bg-emerald-400" };
    case "b1-b2":
      return { bg: "bg-amber-900/80", text: "text-amber-100", dot: "bg-amber-400" };
    case "c1-c2":
      return { bg: "bg-rose-900/80", text: "text-rose-100", dot: "bg-rose-400" };
    default:
      return { bg: "bg-zinc-700/80", text: "text-zinc-200", dot: "bg-zinc-400" };
  }
}
