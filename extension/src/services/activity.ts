/**
 * Activity & History filtering utilities for Lectura Extension
 */

/**
 * Normalizes and compares language identifiers regardless of format:
 * e.g. 'Spanish', 'es', 'es-MX', 'испанский', 'Español' all match 'es'.
 */
export function matchLanguage(entryLang?: string, targetLang?: string): boolean {
  if (!targetLang || targetLang === 'all' || targetLang === 'overall') return true;
  if (!entryLang) return false;

  const normalize = (l: string): string => {
    const s = l.toLowerCase().trim();
    if (s.startsWith('es') || s === 'spanish' || s === 'испанский' || s === 'español') return 'es';
    if (s.startsWith('en') || s === 'english' || s === 'английский') return 'en';
    if (s.startsWith('ru') || s === 'russian' || s === 'русский') return 'ru';
    if (s.startsWith('de') || s === 'german' || s === 'deutsch' || s === 'немецкий') return 'de';
    if (s.startsWith('fr') || s === 'french' || s === 'français' || s === 'французский') return 'fr';
    if (s.startsWith('it') || s === 'italian' || s === 'italiano' || s === 'итальянский') return 'it';
    if (s.startsWith('pt') || s === 'portuguese' || s === 'português' || s === 'португальский') return 'pt';
    if (s.startsWith('zh') || s === 'chinese' || s === 'китайский') return 'zh';
    if (s.startsWith('ja') || s === 'japanese' || s === 'японский') return 'ja';
    if (s.startsWith('ko') || s === 'korean' || s === 'корейский') return 'ko';
    if (s.startsWith('tr') || s === 'turkish' || s === 'турецкий') return 'tr';
    if (s.startsWith('uk') || s.startsWith('ua') || s === 'ukrainian' || s === 'украинский') return 'uk';
    if (s.startsWith('pl') || s === 'polish' || s === 'польский') return 'pl';
    if (s.startsWith('ar') || s === 'arabic' || s === 'арабский') return 'ar';
    if (s.startsWith('nl') || s === 'dutch' || s === 'голландский') return 'nl';
    if (s.startsWith('sv') || s === 'swedish' || s === 'шведский') return 'sv';
    if (s.startsWith('el') || s === 'greek' || s === 'греческий') return 'el';
    if (s.startsWith('cs') || s === 'czech' || s === 'чешский') return 'cs';
    if (s.startsWith('hi') || s === 'hindi' || s === 'хинди') return 'hi';
    if (s.startsWith('vi') || s === 'vietnamese' || s === 'вьетнамский') return 'vi';
    if (s.startsWith('kk') || s === 'kazakh' || s === 'казахский') return 'kk';
    if (s.startsWith('he') || s === 'hebrew' || s === 'иврит') return 'he';
    if (s.startsWith('fa') || s === 'persian' || s === 'персидский') return 'fa';
    const clean = s.replace(/[-_].*$/, '');
    return clean.slice(0, 2);
  };

  return normalize(entryLang) === normalize(targetLang);
}

/**
 * Returns local YYYY-MM-DD date string from an ISO timestamp in browser timezone
 */
export function getItemLocalDateStr(timestampStr?: string): string {
  if (!timestampStr) return '';
  const d = new Date(timestampStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Filters activity history entries for a specific calendar date and language filter
 */
export function filterDayActivityEntries<T extends { timestamp?: string; targetLanguage?: string; date?: string; createdAt?: string; language?: string }>(
  entries: T[],
  selectedDateStr: string,
  currentLanguageFilter: string
): T[] {
  if (!Array.isArray(entries)) return [];

  return entries.filter((entry) => {
    // 1. Check date in local format YYYY-MM-DD
    const rawTime = entry.timestamp || entry.createdAt || entry.date;
    const localDate = getItemLocalDateStr(rawTime);
    const dateMatch = localDate === selectedDateStr || (rawTime && rawTime.startsWith(selectedDateStr));

    // 2. Check language using matchLanguage
    const entryLang = entry.targetLanguage || entry.language;
    const langMatch = matchLanguage(entryLang, currentLanguageFilter);

    return dateMatch && langMatch;
  });
}
