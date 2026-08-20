import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { getApiBaseUrl, resolveApiUrl, setCustomApiUrl, CUSTOM_SERVER_STORAGE_KEY, LEGACY_MOBILE_SERVER_KEY } from './apiConfig';
import { checkForUpdates } from '../services/inAppUpdaterService';

const PREF_SERVER_URL_KEY = CUSTOM_SERVER_STORAGE_KEY;

export { getApiBaseUrl, resolveApiUrl, setCustomApiUrl, checkForUpdates };

/**
 * Returns current server base URL (e.g. "http://localhost:8586" or dynamic host)
 */
export function getServerBaseUrl(): string {
  return getApiBaseUrl();
}

/**
 * Initialize and get the configured Server Base URL for native mobile apps.
 */
export async function initMobileServerUrl(): Promise<string> {
  try {
    const { value } = await Preferences.get({ key: PREF_SERVER_URL_KEY });
    if (value && value.trim().length > 0 && !value.includes('localhost') && !value.includes('192.168.0.83')) {
      const sanitized = sanitizeServerUrl(value.trim());
      setCustomApiUrl(sanitized);
    } else {
      await Preferences.remove({ key: PREF_SERVER_URL_KEY }).catch(() => {});
    }
  } catch (err) {
    console.warn('[MobileServerBridge] Failed to load server url from Preferences:', err);
  }

  setupNativeFetchInterceptor();
  return getServerBaseUrl();
}

/**
 * Sets a new server base URL and persists it across app restarts.
 */
export async function setServerBaseUrl(newUrl: string): Promise<boolean> {
  const sanitized = newUrl ? sanitizeServerUrl(newUrl) : '';
  setCustomApiUrl(sanitized);
  try {
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
  return resolveApiUrl(url);
}

/**
 * Tests health connection to the server URL with native HTTP fallback.
 */
export async function testServerConnection(url?: string): Promise<{ ok: boolean; message: string; version?: string }> {
  const cleanUrl = url && url.trim() ? sanitizeServerUrl(url) : '';
  const healthEndpoint = cleanUrl ? `${cleanUrl}/api/health` : '/api/health';

  try {
    if (Capacitor.isNativePlatform() && cleanUrl) {
      const nativeRes = await CapacitorHttp.get({
        url: healthEndpoint,
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

    const res = await fetch(healthEndpoint, {
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
