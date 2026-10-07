/**
 * Subtitle Parser Utility for Lectura
 * Supports parsing .srt and .vtt subtitle files into time-synced lesson texts.
 */

export interface ParsedSubtitleCue {
  id?: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export interface ParseSubtitlesResult {
  cues: ParsedSubtitleCue[];
  text: string;
  duration: number;
  cueCount: number;
}

/**
 * Converts seconds to [mm:ss] or [hh:mm:ss] timestamp format used by Lectura reader.
 */
export function formatSecondsToTimestamp(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Parses time string like "01:23:45,678" or "00:02:15.500" or "02:15.500" to seconds.
 */
function parseTimecodeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const normalized = timeStr.trim().replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  } else {
    return parseFloat(parts[0]) || 0;
  }
}

/**
 * Cleans formatting, HTML, and SSA/ASS tags from subtitle text.
 */
function cleanSubtitleText(raw: string): string {
  return raw
    // Strip HTML/XML tags: <i>, </i>, <font color="...">, <c.yellow>, etc.
    .replace(/<[^>]+>/g, '')
    // Strip SSA/ASS style tags: {\an8}, {\pos(100,200)}, {\c&HFFFFFF&}, etc.
    .replace(/\{[^}]+\}/g, '')
    // Strip leading dashes or bullet dialogue markers like "- Hello! - Hi!"
    .replace(/^[-–—]\s*/, '')
    // Replace newlines inside a single cue with a single space
    .replace(/[\r\n]+/g, ' ')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Robust parser for SRT and WebVTT subtitle files.
 */
export function parseSubtitleFile(rawContent: string): ParseSubtitlesResult {
  if (!rawContent || !rawContent.trim()) {
    return { cues: [], text: '', duration: 0, cueCount: 0 };
  }

  // Normalize line endings
  const content = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into cue blocks separated by blank lines
  const rawBlocks = content.split(/\n\s*\n/);
  const cues: ParsedSubtitleCue[] = [];

  // Timestamp regex supporting both SRT ("00:01:20,000") and VTT ("00:01:20.000" or "01:20.000")
  // and optional VTT cue settings ("align:start position:50%")
  const timeRegex = /(?:(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{2,3}))\s*-->\s*(?:(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{2,3}))/;

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Skip WebVTT header or note blocks
    if (trimmed.startsWith('WEBVTT') || trimmed.startsWith('NOTE') || trimmed.startsWith('STYLE')) {
      continue;
    }

    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    let timeIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeIndex = i;
        break;
      }
    }

    if (timeIndex === -1) {
      continue;
    }

    const timeLine = lines[timeIndex];
    const match = timeLine.match(timeRegex);
    if (!match) continue;

    const parts = timeLine.split('-->');
    const startStr = parts[0].trim();
    // End time might have VTT cue settings after it, e.g. "00:01:23.000 align:start"
    const endRaw = parts[1].trim().split(/\s+/)[0];

    const startSec = parseTimecodeToSeconds(startStr);
    const endSec = parseTimecodeToSeconds(endRaw);

    // Text lines follow after the time line
    const textLines = lines.slice(timeIndex + 1);
    const cleanText = cleanSubtitleText(textLines.join(' '));

    // Exclude cues with no actual spoken text or pure sound effects like [Applause] or ♪
    if (!cleanText || /^\[.*\]$/.test(cleanText) || /^\(.*\)$/.test(cleanText) || /^[♪♫\s]+$/.test(cleanText)) {
      continue;
    }

    cues.push({
      start: startSec,
      end: endSec,
      text: cleanText,
    });
  }

  // Deduplicate and sort cues by start time
  cues.sort((a, b) => a.start - b.start);

  // Merge consecutive cues that have identical or overlapping text
  const cleanCues: ParsedSubtitleCue[] = [];
  for (let i = 0; i < cues.length; i++) {
    const curr = cues[i];
    if (cleanCues.length > 0) {
      const prev = cleanCues[cleanCues.length - 1];
      if (prev.text === curr.text && Math.abs(curr.start - prev.start) < 2) {
        prev.end = Math.max(prev.end, curr.end);
        continue;
      }
    }
    cleanCues.push(curr);
  }

  // Generate Lectura formatted lesson text with [mm:ss] or [hh:mm:ss] timestamps
  const textLines = cleanCues.map((cue) => `[${formatSecondsToTimestamp(cue.start)}] ${cue.text}`);
  const formattedText = textLines.join('\n\n');

  const duration = cleanCues.length > 0 ? Math.ceil(cleanCues[cleanCues.length - 1].end) : 0;

  return {
    cues: cleanCues,
    text: formattedText,
    duration,
    cueCount: cleanCues.length,
  };
}

/**
 * Extracts timed cues from a lesson's formatted text (which contains [mm:ss] or [hh:mm:ss] timestamp lines).
 */
export function parseCuesFromLessonText(lessonText: string): ParsedSubtitleCue[] {
  if (!lessonText || !lessonText.trim()) return [];

  const lines = lessonText.split(/\r?\n/);
  const timestampRegex = /^\[?((?:\d{1,2}:){1,2}\d{2}|\d+(?:h|m|s))\]?\s*(.*)$/i;
  const rawList: { start: number; text: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(timestampRegex);
    if (match) {
      const ts = match[1].replace(/[\[\]]/g, "");
      const cleanText = match[2]?.trim() || "";
      if (!cleanText) continue;
      const startSec = parseTimecodeToSeconds(ts);
      rawList.push({ start: startSec, text: cleanSubtitleText(cleanText) });
    }
  }

  if (rawList.length === 0) return [];

  // Sort by start time
  rawList.sort((a, b) => a.start - b.start);

  const cues: ParsedSubtitleCue[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const curr = rawList[i];
    const next = rawList[i + 1];
    // Next cue start time or max 6 seconds duration
    const maxDuration = 6;
    const end = next ? Math.max(curr.start + 1.2, Math.min(curr.start + maxDuration, next.start)) : curr.start + 4;
    cues.push({
      id: `cue-${i}`,
      start: curr.start,
      end,
      text: curr.text,
    });
  }

  return cues;
}
