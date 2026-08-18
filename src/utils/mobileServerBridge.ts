import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const PREF_SERVER_URL_KEY = 'lectura_mobile_server_url';
export const DEFAULT_SERVER_URL = 'http://192.168.0.83:8586';

let currentServerBaseUrl = '';

/**
 * Returns current server base URL (e.g. "http://192.168.0.83:8586")
 */
export function getServerBaseUrl(): string {
  if (!currentServerBaseUrl) {
    try {
      const saved = localStorage.getItem(PREF_SERVER_URL_KEY);
      if (saved && saved.trim().length > 0 && !saved.includes('localhost')) {
        currentServerBaseUrl = sanitizeServerUrl(saved);
      }
    } catch (_) {}
  }

  if (!currentServerBaseUrl) {
    if (Capacitor.isNativePlatform()) {
      currentServerBaseUrl = DEFAULT_SERVER_URL;
    } else if (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')) {
      currentServerBaseUrl = window.location.origin;
    } else {
      currentServerBaseUrl = DEFAULT_SERVER_URL;
    }
  }

  return currentServerBaseUrl;
}

/**
 * Initialize and get the configured Server Base URL for native mobile apps.
 */
export async function initMobileServerUrl(): Promise<string> {
  try {
    const { value } = await Preferences.get({ key: PREF_SERVER_URL_KEY });
    if (value && value.trim().length > 0 && !value.includes('localhost')) {
      currentServerBaseUrl = sanitizeServerUrl(value.trim());
      localStorage.setItem(PREF_SERVER_URL_KEY, currentServerBaseUrl);
    } else {
      currentServerBaseUrl = getServerBaseUrl();
      await Preferences.set({ key: PREF_SERVER_URL_KEY, value: currentServerBaseUrl });
      localStorage.setItem(PREF_SERVER_URL_KEY, currentServerBaseUrl);
    }
  } catch (err) {
    console.warn('[MobileServerBridge] Failed to load server url from Preferences:', err);
    currentServerBaseUrl = getServerBaseUrl();
  }

  setupNativeFetchInterceptor();
  return currentServerBaseUrl;
}

/**
 * Sets a new server base URL and persists it across app restarts.
 */
export async function setServerBaseUrl(newUrl: string): Promise<boolean> {
  const sanitized = sanitizeServerUrl(newUrl);
  currentServerBaseUrl = sanitized;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREF_SERVER_URL_KEY, sanitized);
    }
    await Preferences.set({ key: PREF_SERVER_URL_KEY, value: sanitized });
    return true;
  } catch (err) {
    console.error('[MobileServerBridge] Failed to save server URL:', err);
    return false;
  }
}

/**
 * Universal URL resolver for APIs, audio streams, media, and images.
 */
export function resolveServerUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // If already absolute URL or data URI, return as-is
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const base = getServerBaseUrl();
  if (!base) {
    return trimmed;
  }

  // Prepend base URL to relative paths (e.g. "/api/media/stream/123.m4a")
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

/**
 * Tests health connection to the server URL with native HTTP fallback.
 */
export async function testServerConnection(url: string): Promise<{ ok: boolean; message: string; version?: string }> {
  const cleanUrl = sanitizeServerUrl(url);
  if (!cleanUrl) {
    return { ok: false, message: 'Invalid URL' };
  }

  try {
    if (Capacitor.isNativePlatform()) {
      const nativeRes = await CapacitorHttp.get({
        url: `${cleanUrl}/api/health`,
        headers: { 'Accept': 'application/json' },
        connectTimeout: 6000,
        readTimeout: 6000,
      });

      if (nativeRes.status >= 200 && nativeRes.status < 300) {
        const data = nativeRes.data || {};
        return { ok: true, message: 'Connected successfully', version: data.version || 'v2.x' };
      }
      return { ok: false, message: `Server returned HTTP ${nativeRes.status}` };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${cleanUrl}/api/health`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, message: 'Connected successfully', version: data.version || 'v2.x' };
    }
    return { ok: false, message: `Server returned HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Connection failed or timeout' };
  }
}

export function sanitizeServerUrl(url: string): string {
  if (!url) return '';
  let s = url.trim();
  // Remove trailing slashes
  s = s.replace(/\/+$/, '');
  // Default to http if no protocol provided
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = `http://${s}`;
  }
  return s;
}

let isFetchIntercepted = false;
export function setupNativeFetchInterceptor() {
  if (isFetchIntercepted || typeof window === 'undefined') return;
  isFetchIntercepted = true;

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      const base = getServerBaseUrl();
      if (base) {
        if (typeof input === 'string') {
          if (input.startsWith('/') && !input.startsWith('//')) {
            input = `${base}${input}`;
          }
        } else if (input instanceof URL) {
          if (input.pathname && !input.origin.includes('://')) {
            input = new URL(`${base}${input.pathname}${input.search}`);
          }
        }
      }
    }
    return originalFetch(input, init);
  };
}

// Automatically setup interceptor on module load
setupNativeFetchInterceptor();
