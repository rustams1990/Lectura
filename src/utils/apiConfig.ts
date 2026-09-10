/**
 * Universal API Base URL Resolver (Self-Hosted & Multi-User Ready)
 */

export const CUSTOM_SERVER_STORAGE_KEY = 'lectura_custom_server_url';
export const LEGACY_MOBILE_SERVER_KEY = 'lectura_mobile_server_url';

/**
 * Resolves current API base URL dynamically based on user settings, ENV, or runtime host.
 */
export const getApiBaseUrl = (): string => {
  // 1. Проверяем пользовательскую настройку из localStorage / SettingsStore (если указан кастомный сервер)
  if (typeof localStorage !== 'undefined') {
    try {
      const customServerUrl = localStorage.getItem(CUSTOM_SERVER_STORAGE_KEY) || localStorage.getItem(LEGACY_MOBILE_SERVER_KEY);
      if (customServerUrl && customServerUrl.trim() !== '') {
        return customServerUrl.trim().replace(/\/+$/, '');
      }
    } catch (_) {}
  }

  // 2. Проверяем ENV-переменную сборки
  const metaEnv = (import.meta as any)?.env;
  if (metaEnv?.VITE_API_URL) {
    return (metaEnv.VITE_API_URL as string).trim().replace(/\/+$/, '');
  }

  // 3. Динамический fallback в браузере (Same-Origin / Vite Proxy)
  // Для браузера возвращаем пустую строку, чтобы запросы шли на относительные эндпоинты (/api/...)
  // В dev-режиме они прозрачно проксируются Vite Proxy, а в production — Nginx или хост-сервером
  return '';
};

/**
 * Sets or clears custom API Server URL in storage.
 */
export const setCustomApiUrl = (url?: string | null): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    const clean = url ? url.trim().replace(/\/+$/, '') : '';
    if (clean) {
      localStorage.setItem(CUSTOM_SERVER_STORAGE_KEY, clean);
      localStorage.setItem(LEGACY_MOBILE_SERVER_KEY, clean);
    } else {
      localStorage.removeItem(CUSTOM_SERVER_STORAGE_KEY);
      localStorage.removeItem(LEGACY_MOBILE_SERVER_KEY);
    }
  } catch (_) {}
};

/**
 * Universal endpoint resolver: prepends active API base URL to relative endpoints (/api/...)
 */
export const resolveApiUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // If already absolute URL or data/blob URI, return as-is
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const base = getApiBaseUrl();
  if (!base) {
    return trimmed;
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
};
