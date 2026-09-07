import { Lesson, PlaylistItem } from '../types';

export const parseDurationToSeconds = (duration: string | number | undefined | null): number => {
  if (!duration) return 0;
  if (typeof duration === 'number') return isNaN(duration) ? 0 : Math.round(duration);
  const clean = String(duration).trim();
  if (!clean) return 0;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return Math.round(parseFloat(clean));
  }
  const parts = clean.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
};

export const getYoutubeDurationFromText = (text?: string | null): number | null => {
  if (!text) return null;
  const lines = text.split('\n');
  const timestampRegex = /^\[?((?:\d{1,2}:){1,2}\d{2}|\d+(?:h|m|s))\]?\s*/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(timestampRegex);
    if (match) {
      const ts = match[1].replace(/[\[\]]/g, '');
      let seconds = 0;
      const clean = ts.trim().toLowerCase();
      if (clean.endsWith('s') || clean.endsWith('m') || clean.endsWith('h')) {
        const hMatch = clean.match(/(\d+)h/);
        const mMatch = clean.match(/(\d+)m/);
        const sMatch = clean.match(/(\d+)s/);
        if (hMatch) seconds += parseInt(hMatch[1], 10) * 3600;
        if (mMatch) seconds += parseInt(mMatch[1], 10) * 60;
        if (sMatch) seconds += parseInt(sMatch[1], 10);
      } else {
        const parts = clean.split(':');
        if (parts.length === 2) {
          seconds += parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        } else if (parts.length === 3) {
          seconds += parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        }
      }
      if (seconds > 0) {
        return seconds + 5;
      }
    }
  }
  return null;
};

export const getMaxTimestampInText = (text?: string | null): number | null => {
  if (!text) return null;
  const matches = Array.from(text.matchAll(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/g));
  if (!matches || matches.length === 0) return null;
  let maxSec = 0;
  for (const m of matches) {
    let sec = 0;
    if (m[3]) {
      sec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    } else {
      sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    if (sec > maxSec) maxSec = sec;
  }
  return maxSec > 0 ? maxSec : null;
};

export const getLessonEffectiveDuration = (l?: Lesson | null): number => {
  if (!l) return 0;
  const direct = parseDurationToSeconds(
    l.duration || (l as any).durationSeconds || l.youtubeDuration || l.audioDuration
  );
  if (direct > 0) return direct;

  // Fallback 1: wordTimestamps
  if (Array.isArray(l.wordTimestamps) && l.wordTimestamps.length > 0) {
    const lastWord = l.wordTimestamps[l.wordTimestamps.length - 1];
    if (lastWord && typeof lastWord.e === 'number' && lastWord.e > 0) {
      return Math.round(lastWord.e);
    }
  }

  // Fallback 2: extract from text timestamps if available
  const fromText = getYoutubeDurationFromText(l.text || '');
  if (fromText && fromText > 0) return fromText;

  const fromMax = getMaxTimestampInText(l.text || '');
  if (fromMax && fromMax > 0) return fromMax;

  return 0;
};

export const getItemEffectiveDuration = (item?: PlaylistItem | null, lesson?: Lesson | null): number => {
  if (!item) return 0;
  if (typeof item.durationSeconds === 'number' && item.durationSeconds > 0) {
    return item.durationSeconds;
  }
  if (lesson) {
    return getLessonEffectiveDuration(lesson);
  }
  return 0;
};
