/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lesson } from "./types";

export interface ContextSearchHit {
  lessonId: string;
  lessonTitle: string;
  targetLanguage: string;
  sentence: string;
  matchedForm: string;
}

export interface ContextSearchOptions {
  maxResults?: number;
  maxPerLesson?: number;
  targetLanguage?: string;
  wordLinks?: Record<string, string>;
  includeArchived?: boolean;
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

const normalizeForSearch = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "")
    .trim();

const cleanLessonText = (text: string): string =>
  text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ").replace(/\s+/g, " ").trim();

const isCjkText = (text: string): boolean => {
  const cjkChars = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  return totalChars > 0 && cjkChars / totalChars > 0.3;
};

const splitIntoSentences = (text: string): string[] => {
  if (isCjkText(text)) {
    const matches = text.match(/[^。！？\n]+[。！？]?|[\n]+/g);
    return matches ? matches.map((s) => s.trim()).filter(Boolean) : [text];
  }
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRawWord(key: string): string {
  const idx = key.indexOf("_");
  return (idx !== -1 ? key.substring(idx + 1) : key).toLowerCase();
}

function buildLinkAdjacency(wordLinks: Record<string, string>, targetLang: string): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const langLower = targetLang.toLowerCase();

  const addEdge = (u: string, v: string) => {
    if (!adj.has(u)) adj.set(u, new Set());
    adj.get(u)!.add(v);
  };

  for (const [key, val] of Object.entries(wordLinks)) {
    const valStr = val as string;
    const keyLang = key.includes("_") ? key.substring(0, key.indexOf("_")).toLowerCase() : "";
    const valLang = valStr.includes("_") ? valStr.substring(0, valStr.indexOf("_")).toLowerCase() : "";

    if (keyLang && keyLang !== langLower) continue;
    if (valLang && valLang !== langLower) continue;

    const rawKey = extractRawWord(key);
    const rawVal = extractRawWord(valStr);
    if (rawKey && rawVal) {
      addEdge(rawKey, rawVal);
      addEdge(rawVal, rawKey);
    }
  }

  return adj;
}

let lastWordLinksRef: Record<string, string> | null = null;
let lastLang: string = "";
let cachedAdjMap: Map<string, Set<string>> | null = null;

function getCachedLinkAdjacency(wordLinks: Record<string, string>, targetLang: string): Map<string, Set<string>> {
  if (cachedAdjMap && lastWordLinksRef === wordLinks && lastLang === targetLang) {
    return cachedAdjMap;
  }
  cachedAdjMap = buildLinkAdjacency(wordLinks, targetLang);
  lastWordLinksRef = wordLinks;
  lastLang = targetLang;
  return cachedAdjMap;
}

function getLinkedForms(word: string, lang: string, wordLinks: Record<string, string>): string[] {
  const list = new Set<string>();
  const lowerWord = word.toLowerCase();
  list.add(lowerWord);

  if (!wordLinks || Object.keys(wordLinks).length === 0) {
    return Array.from(list);
  }

  const adj = getCachedLinkAdjacency(wordLinks, lang);
  const visited = new Set<string>();
  const queue = [lowerWord];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    list.add(current);

    const neighbors = adj.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  return Array.from(list);
}

function buildMatchPatterns(terms: string[]): RegExp[] {
  const patterns: RegExp[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const trimmed = term.trim();
    if (trimmed.length < 1 || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());

    const escaped = escapeRegex(trimmed);
    if (trimmed.includes(" ")) {
      patterns.push(new RegExp(escaped, "iu"));
    } else {
      patterns.push(new RegExp(`(?<![\\p{L}\\p{M}'’])${escaped}(?![\\p{L}\\p{M}'’])`, "iu"));
    }
  }

  return patterns;
}

export function searchWordInLessons(
  query: string,
  lessons: Lesson[],
  options: ContextSearchOptions = {}
): ContextSearchHit[] {
  const {
    maxResults = 50,
    maxPerLesson = 5,
    targetLanguage,
    wordLinks = {},
    includeArchived = false,
  } = options;

  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  const searchTerms = new Set<string>([cleanQuery]);
  if (targetLanguage) {
    getLinkedForms(cleanQuery, targetLanguage, wordLinks).forEach((t) => searchTerms.add(t));
  }
  searchTerms.add(normalizeForSearch(cleanQuery));

  const patterns = buildMatchPatterns(Array.from(searchTerms));
  if (patterns.length === 0) return [];

  const results: ContextSearchHit[] = [];

  for (const lesson of lessons) {
    if (!includeArchived && lesson.isArchived) continue;
    if (targetLanguage && lesson.targetLanguage !== targetLanguage) continue;
    if (!lesson.text) continue;

    const text = cleanLessonText(lesson.text);
    const sentences = splitIntoSentences(text);
    let lessonHits = 0;

    for (const sentence of sentences) {
      if (lessonHits >= maxPerLesson || results.length >= maxResults) break;

      for (const pattern of patterns) {
        const match = sentence.match(pattern);
        if (match) {
          results.push({
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            targetLanguage: lesson.targetLanguage,
            sentence: sentence.trim(),
            matchedForm: match[0],
          });
          lessonHits++;
          break;
        }
      }
    }

    if (results.length >= maxResults) break;
  }

  return results;
}

export function highlightMatchInSentence(sentence: string, matchedForm: string): HighlightSegment[] {
  if (!matchedForm) return [{ text: sentence, isMatch: false }];

  const idx = sentence.toLowerCase().indexOf(matchedForm.toLowerCase());
  if (idx === -1) return [{ text: sentence, isMatch: false }];

  const segments: HighlightSegment[] = [];
  if (idx > 0) segments.push({ text: sentence.slice(0, idx), isMatch: false });
  segments.push({ text: sentence.slice(idx, idx + matchedForm.length), isMatch: true });
  if (idx + matchedForm.length < sentence.length) {
    segments.push({ text: sentence.slice(idx + matchedForm.length), isMatch: false });
  }
  return segments;
}
