import { useSettingsStore } from '../store/settingsStore';
import i18n from '../i18n';
import { resolveLocale, DateFormatOption, TimeFormatOption, FirstDayOfWeekOption } from './dateUtils';

/**
 * Format a Date, ISO string, or timestamp into the user's chosen DateFormat ('DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'auto').
 */
export function formatAppDate(
  dateInput: Date | string | number | null | undefined,
  customFormat?: DateFormatOption
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = typeof dateInput === 'object' && dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const activeDateFormat = customFormat || useSettingsStore.getState().dateFormat || 'auto';
  const locale = resolveLocale(i18n.language);

  if (activeDateFormat === 'auto') {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  switch (activeDateFormat) {
    case 'DD.MM.YYYY':
      return `${day}.${month}.${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    default:
      return `${day}.${month}.${year}`;
  }
}

/**
 * Formats time according to the user's active 12h/24h preference.
 */
export function formatAppTime(
  dateInput: Date | string | number | null | undefined,
  customTimeFormat?: TimeFormatOption
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = typeof dateInput === 'object' && dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const activeTimeFormat = customTimeFormat || useSettingsStore.getState().timeFormat || 'auto';
  const locale = resolveLocale(i18n.language);
  const hour12 = activeTimeFormat === '12h' ? true : activeTimeFormat === '24h' ? false : undefined;

  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(date);
}

/**
 * Combined Date and Time formatting. e.g. "20.08.2026 • 23:45" or "08/20/2026 • 11:45 PM"
 */
export function formatAppDateTime(
  dateInput: Date | string | number | null | undefined,
  separator: string = ' • '
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = typeof dateInput === 'object' && dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const dStr = formatAppDate(date);
  const tStr = formatAppTime(date);
  if (!dStr) return '';
  if (!tStr) return dStr;
  return `${dStr}${separator}${tStr}`;
}

/**
 * Formats a date with abbreviated text month (e.g. "20 авг. 2026" or "Aug 20, 2026") when in 'auto' mode,
 * or honors the user's explicit numeric format.
 */
export function formatAppFriendlyDate(
  dateInput: Date | string | number | null | undefined
): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = typeof dateInput === 'object' && dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const activeDateFormat = useSettingsStore.getState().dateFormat || 'auto';
  if (activeDateFormat !== 'auto') {
    return formatAppDate(date, activeDateFormat);
  }

  const locale = resolveLocale(i18n.language);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Returns standard YYYY-MM-DD string for DB storage or comparison.
 */
export function formatToDbDate(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput && dateInput !== 0) return '';
  const date = typeof dateInput === 'object' && dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns first day of week: 1 for Monday, 0 for Sunday based on active user setting or locale.
 */
export function getAppFirstDayOfWeek(prefOverride?: FirstDayOfWeekOption): 0 | 1 {
  const pref = prefOverride || useSettingsStore.getState().firstDayOfWeek || 'auto';
  if (pref === 'monday') return 1;
  if (pref === 'sunday') return 0;

  const locale = resolveLocale(i18n.language).toLowerCase();
  if (
    locale === 'en-us' ||
    locale === 'en-ca' ||
    locale.startsWith('en-us') ||
    locale.startsWith('en-ca') ||
    locale === 'he' ||
    locale.startsWith('he-') ||
    locale === 'ar-sa'
  ) {
    return 0; // Sunday
  }
  return 1; // Monday
}
