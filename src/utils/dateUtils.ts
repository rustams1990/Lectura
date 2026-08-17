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
    if (norm === 'pt' || norm.startsWith('pt-')) return 'pt-PT';
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
