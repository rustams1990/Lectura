/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DateFormatOption = 'auto' | 'DD/MM/YYYY' | 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormatOption = 'auto' | '12h' | '24h';

export interface FormatOptions {
  datePref?: DateFormatOption;
  timePref?: TimeFormatOption;
  appLocale?: string; // Current app language from i18n (e.g. "ru", "en", "es")
}

/**
 * Resolves a reliable BCP-47 locale tag from appLocale, customLocale, or browser fallback.
 */
export function resolveLocale(appLocale?: string): string {
  if (appLocale) {
    const norm = appLocale.toLowerCase().trim();
    if (norm === 'ru' || norm.startsWith('ru-')) return 'ru-RU';
    if (norm === 'en' || norm.startsWith('en-')) return 'en-US';
    if (norm === 'es' || norm.startsWith('es-')) return 'es-ES';
    if (norm === 'fr' || norm.startsWith('fr-')) return 'fr-FR';
    if (norm === 'de' || norm.startsWith('de-')) return 'de-DE';
    if (norm === 'it' || norm.startsWith('it-')) return 'it-IT';
    if (norm === 'pt' || norm.startsWith('pt-')) return 'pt-BR';
    if (norm === 'zh' || norm.startsWith('zh-')) return 'zh-CN';
    if (norm === 'ja' || norm.startsWith('ja-')) return 'ja-JP';
    if (norm === 'ko' || norm.startsWith('ko-')) return 'ko-KR';
    if (norm === 'pl' || norm.startsWith('pl-')) return 'pl-PL';
    if (norm === 'tr' || norm.startsWith('tr-')) return 'tr-TR';
    if (norm === 'uk' || norm.startsWith('uk-')) return 'uk-UA';
    return appLocale;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

/**
 * Formats a Date/timestamp according to user preferences or locale conventions.
 */
export function formatDate(
  dateInput: Date | string | number | null | undefined,
  options: FormatOptions = {}
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const { datePref = 'auto', appLocale } = options;
  const locale = resolveLocale(appLocale);

  if (datePref === 'auto') {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  switch (datePref) {
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'DD.MM.YYYY': return `${day}.${month}.${year}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    default: return `${day}/${month}/${year}`;
  }
}

/**
 * Formats a date with abbreviated text month (e.g. "17 авг. 2026 г." or "Aug 17, 2026")
 * Ideal for word cards, history lists, and vocabulary tables.
 */
export function formatFriendlyDate(
  dateInput: Date | string | number | null | undefined,
  options: FormatOptions = {}
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const { datePref = 'auto', appLocale } = options;
  const locale = resolveLocale(appLocale);

  // If user selected an explicit numeric format (not auto), honor that pattern
  if (datePref && datePref !== 'auto') {
    return formatDate(date, options);
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Formats time respecting 12-hour (AM/PM) vs 24-hour preference and active locale.
 */
export function formatTime(
  dateInput: Date | string | number | null | undefined,
  options: FormatOptions = {}
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const { timePref = 'auto', appLocale } = options;
  const locale = resolveLocale(appLocale);
  const hour12 = timePref === '12h' ? true : timePref === '24h' ? false : undefined;

  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(date);
}

/**
 * Combined Date and Time formatting.
 */
export function formatDateTime(
  dateInput: Date | string | number | null | undefined,
  options: FormatOptions = {}
): string {
  if (!dateInput && dateInput !== 0) return '';
  const dStr = formatDate(dateInput, options);
  const tStr = formatTime(dateInput, options);
  if (!dStr) return '';
  return `${dStr} ${tStr}`.trim();
}

/**
 * Returns the current local calendar date formatted as YYYY-MM-DD for day-level database keys/lookups.
 */
export function getLocalTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type FirstDayOfWeekOption = 'auto' | 'monday' | 'sunday';

/**
 * Returns 1 for Monday or 0 for Sunday based on preference or locale convention.
 */
export function getFirstDayOfWeek(pref?: FirstDayOfWeekOption, appLocale?: string): 0 | 1 {
  if (pref === 'monday') return 1;
  if (pref === 'sunday') return 0;

  // Auto resolution based on locale convention
  const locale = resolveLocale(appLocale).toLowerCase();
  // Locales where Sunday is traditionally the first day of the week
  if (locale === 'en-us' || locale === 'en-ca' || locale.startsWith('en-us') || locale.startsWith('en-ca') || locale === 'he' || locale.startsWith('he-') || locale === 'ar-sa') {
    return 0; // Sunday
  }
  return 1; // Monday (ISO-8601 standard for Russia, Europe, CIS, Latin America)
}

/**
 * Generates an array of 7 localized weekday names starting from the designated first day (1 = Monday, 0 = Sunday).
 */
export function getWeekDayLabels(
  firstDay: 0 | 1 = 1,
  appLocale?: string,
  format: 'narrow' | 'short' | 'long' = 'short'
): string[] {
  const locale = resolveLocale(appLocale);
  const formatter = new Intl.DateTimeFormat(locale, { weekday: format });
  
  // Reference dates: 2026-08-16 is Sunday, 2026-08-17 is Monday
  const sundayRef = new Date(2026, 7, 16);
  const mondayRef = new Date(2026, 7, 17);

  const baseRef = firstDay === 0 ? sundayRef : mondayRef;
  const labels: string[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(baseRef);
    d.setDate(baseRef.getDate() + i);
    const raw = formatter.format(d);
    const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\.$/, '');
    labels.push(capitalized);
  }

  return labels;
}
