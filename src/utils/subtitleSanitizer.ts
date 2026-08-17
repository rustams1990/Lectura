/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subtitle sanitizer to clean technical markup artifacts, timing tags,
 * music symbols, and layout cues without removing actual words or remarks.
 *
 * NOTE: Words like [Música], [Risas], (Laughter) are real vocabulary words
 * and are intentionally PRESERVED for student learning.
 */

// Subtitle cue artifacts, music notes, and positioning tags: ♪, ♫, >>, -->, align:start, position:..., line:...
const SUBTITLE_ARTIFACTS_REGEX = /[♪♫♬♩#]+|>>+|-->|align:(?:start|center|end|left|right)|position:\d+%?|line:\d+%?|size:\d+%?/gi;

// HTML entities and tags (e.g. <c>, <font>, <00:00:00.000>)
const HTML_TAG_REGEX = /<[^>]+>/g;

export function sanitizeSubtitleText(text: string): string {
  if (!text) return "";

  let cleaned = text
    // 1. Remove HTML tags (<c>, <font>, <00:00:00>, etc.)
    .replace(HTML_TAG_REGEX, "")
    // 2. Decode common HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#10;/gi, " ")
    // 3. Remove technical subtitle artifacts and music notes ♪, ♫, >>, align:start
    .replace(SUBTITLE_ARTIFACTS_REGEX, " ")
    // 4. Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}
