import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const PREF_SERVER_URL_KEY = 'lectura_mobile_server_url';
const DEFAULT_SERVER_URL = typeof window !== 'undefined' ? window.location.origin : 'http://192.168.0.83:8586';

let currentServerBaseUrl = '';

/**
 * Initialize and get the configured Server Base URL for native mobile apps.
 */
export async function initMobileServerUrl(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    currentServerBaseUrl = '';
    return '';
  }

  try {
    const { value } = await Preferences.get({ key: PREF_SERVER_URL_KEY });
    if (value && value.trim().length > 0) {
      currentServerBaseUrl = sanitizeServerUrl(value.trim());
    } else {
      // Fallback default
      currentServerBaseUrl = sanitizeServerUrl(DEFAULT_SERVER_URL);
      await Preferences.set({ key: PREF_SERVER_URL_KEY, value: currentServerBaseUrl });
    }
  } catch (err) {
    console.warn('[MobileServerBridge] Failed to load server url from Preferences:', err);
    currentServerBaseUrl = sanitizeServerUrl(DEFAULT_SERVER_URL);
  }

  // Hook global fetch for native mobile
  setupNativeFetchInterceptor();

  return currentServerBaseUrl;
}

/**
 * Returns current server base URL (e.g. "http://192.168.0.83:8586")
 */
export function getServerBaseUrl(): string {
  if (!Capacitor.isNativePlatform()) {
    return '';
  }
  if (!currentServerBaseUrl) {
    try {
      const saved = localStorage.getItem(PREF_SERVER_URL_KEY);
      if (saved) currentServerBaseUrl = sanitizeServerUrl(saved);
    } catch (_) {}
  }
  return currentServerBaseUrl;
}

/**
 * Sets a new server base URL and persists it across app restarts.
 */
export async function setServerBaseUrl(newUrl: string): Promise<boolean> {
  const sanitized = sanitizeServerUrl(newUrl);
  currentServerBaseUrl = sanitized;
  try {
    localStorage.setItem(PREF_SERVER_URL_KEY, sanitized);
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
 * Tests health connection to the server URL.
 */
export async function testServerConnection(url: string): Promise<{ ok: boolean; message: string; version?: string }> {
  try {
    const cleanUrl = sanitizeServerUrl(url);
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

function sanitizeServerUrl(url: string): string {
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
function setupNativeFetchInterceptor() {
  if (isFetchIntercepted || typeof window === 'undefined') return;
  isFetchIntercepted = true;

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      const base = getServerBaseUrl();
      if (base) {
        if (typeof input === 'string') {
          if (input.startsWith('/')) {
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
