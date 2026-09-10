/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sanitizeSubtitleText } from "./subtitleSanitizer";

export interface SubtitleItem {
  text: string;
  start: number; // time in seconds
  end?: number;  // optional end time in seconds
}

export interface FormattedSentence {
  start: number;
  text: string;
  words?: SubtitleItem[];
}

const COMMON_ABBREVIATIONS = new Set([
  "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "vs.", "v.",
  "e.g.", "i.e.", "etc.", "vol.", "p.", "pp.", "no.", "jan.", "feb.", "mar.",
  "apr.", "jun.", "jul.", "aug.", "sep.", "oct.", "nov.", "dec.",
  "a1.", "a2.", "b1.", "b2.", "c1.", "c2.", "co.", "inc.", "ltd."
]);

export function isAbbreviationOrNumber(word: string): boolean {
  const cleanWord = word.trim().toLowerCase();

  // Explicit abbreviation match
  if (COMMON_ABBREVIATIONS.has(cleanWord)) return true;

  // Single capital initial like A., B., J., K.
  if (/^[a-z]\.$/i.test(cleanWord)) return true;

  // Multiple initial abbreviations like u.s., u.k., e.u.
  if (/^([a-z]\.){2,}$/i.test(cleanWord)) return true;

  // Decimal numbers or digits like 1.5, 3.14
  if (/^\d+(\.\d+)?\.?$/.test(cleanWord)) return true;

  return false;
}

export function cleanSentenceText(text: string): string {
  if (!text) return "";

  let cleaned = sanitizeSubtitleText(text);

  if (cleaned.length > 0) {
    // Capitalize first letter of sentence block
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

export function chunkSubtitlesIntoSentences(items: SubtitleItem[]): FormattedSentence[] {
  if (!items || items.length === 0) return [];

  // Flatten cues into tokenized word items so sentence boundaries inside any cue are respected instantly
  const wordItems: SubtitleItem[] = [];
  for (const item of items) {
    const tokens = item.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const duration = (item.end && item.end > item.start) ? (item.end - item.start) : 2.0;
    const timePerWord = duration / tokens.length;

    for (let idx = 0; idx < tokens.length; idx++) {
      const wStart = item.start + (idx * timePerWord);
      const wEnd = wStart + timePerWord;
      wordItems.push({
        text: tokens[idx],
        start: wStart,
        end: wEnd
      });
    }
  }

  const result: FormattedSentence[] = [];
  let currentBlock: SubtitleItem[] = [];
  const MAX_BLOCK_LENGTH = 150; // Fallback length if punctuation is missing for a long time

  for (let i = 0; i < wordItems.length; i++) {
    const item = wordItems[i];
    const nextItem = i < wordItems.length - 1 ? wordItems[i + 1] : null;

    currentBlock.push(item);

    const accumulatedRawText = currentBlock.map(b => b.text).join(" ").trim();
    const itemText = item.text.trim();

    // Rule 1: Instant split as soon as a word/token ends with ., ?, or ! (excluding abbreviations & decimal numbers)
    const isPunctuationEnd = /[.!?]$/.test(itemText) && !isAbbreviationOrNumber(itemText);

    // Rule 4 (Fallback 1): Silence pause between current word end and next word start > 2.0 seconds
    const itemEnd = item.end !== undefined ? item.end : item.start + 1.0;
    const pauseDuration = nextItem ? (nextItem.start - itemEnd) : 0;
    const isLongPause = nextItem ? pauseDuration > 2.0 : false;

    // Rule 4 (Fallback 2): If punctuation missing for a long time (> 150 characters), force split
    const isExceedingLength = accumulatedRawText.length >= MAX_BLOCK_LENGTH;

    const shouldClose = isPunctuationEnd || isLongPause || isExceedingLength || !nextItem;

    if (shouldClose && currentBlock.length > 0) {
      // Rule 3: Start timestamp assigned strictly from the first word of this sentence block
      const startSec = Math.floor(currentBlock[0].start);
      const formattedText = cleanSentenceText(accumulatedRawText);

      if (formattedText) {
        result.push({
          start: startSec,
          text: formattedText,
          words: [...currentBlock]
        });
      }

      currentBlock = [];
    }
  }

  return result;
}
