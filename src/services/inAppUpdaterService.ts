import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../version';
import { resolveApiUrl } from '../utils/apiConfig';

interface LecturaUpdaterPluginInterface {
  downloadAndInstallApk(options: { downloadUrl: string; versionName: string }): Promise<{ downloadId: number; status: string }>;
  openApk(options: { filePath: string }): Promise<void>;
}

const LecturaUpdater = registerPlugin<LecturaUpdaterPluginInterface>('LecturaUpdater');

export interface SystemUpdateEnvironment {
  isDocker: boolean;
  hasGit: boolean;
  platform: string;
  canOneClickUpdate: boolean;
}

export interface GitHubReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  apkDownloadUrl?: string;
  apkSize?: number;
  hasUpdate: boolean;
  serverVersion?: string;
  isClientReloadOnly?: boolean;
  environment?: SystemUpdateEnvironment;
}

export interface ServerUpdateProgress {
  status: 'idle' | 'backup' | 'downloading' | 'installing' | 'building' | 'restarting' | 'completed' | 'error';
  progress: number;
  stepKey: string;
  message: string;
  error?: string;
  targetVersion?: string;
  currentVersion?: string;
}

const GITHUB_REPO = 'rustams1990/Lectura';
const LAST_DISMISSED_TAG_KEY = 'lectura_dismissed_update_tag';

/**
 * Checks for a newer version via backend /api/system/update-check (with direct GitHub fallback)
 */
export async function checkForGitHubUpdate(manualCheck = false): Promise<GitHubReleaseInfo | null> {
  try {
    const currentClientClean = APP_VERSION.replace(/^v/i, '').trim();

    // 1. Try querying our own backend server first (handles both server updates & client tab reload detection)
    try {
      const apiUrl = resolveApiUrl(`/api/system/update-check${manualCheck ? '?force=true' : ''}`);
      const serverRes = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
      });

      if (serverRes.ok) {
        const srv = await serverRes.json();
        const serverVerClean = String(srv.currentVersion || APP_VERSION).replace(/^v/i, '').trim();
        const latestVerClean = String(srv.latestVersion || srv.tag_name || serverVerClean).replace(/^v/i, '').trim();

        const serverNeedsUpdate = compareVersions(latestVerClean, serverVerClean) > 0;
        const clientBehindServer = compareVersions(serverVerClean, currentClientClean) > 0;
        const isNewer = serverNeedsUpdate || clientBehindServer;

        const targetTag = `v${latestVerClean}`;

        if (!manualCheck && isNewer) {
          try {
            const dismissedTag = localStorage.getItem(LAST_DISMISSED_TAG_KEY);
            if (dismissedTag === targetTag && !clientBehindServer) {
              return null;
            }
            const sessionDismissed = sessionStorage.getItem('lectura_dismissed_session');
            if (sessionDismissed === targetTag && !clientBehindServer) {
              return null;
            }
          } catch (_) {}
        }

        return {
          tag_name: targetTag,
          name: srv.name || `Lectura ${targetTag}`,
          body: srv.body || '',
          published_at: srv.published_at || new Date().toISOString(),
          html_url: srv.html_url || `https://github.com/${GITHUB_REPO}`,
          apkDownloadUrl: srv.apkDownloadUrl,
          apkSize: srv.apkSize,
          hasUpdate: isNewer,
          serverVersion: `v${serverVerClean}`,
          isClientReloadOnly: clientBehindServer && !serverNeedsUpdate,
          environment: srv.environment || {
            isDocker: false,
            hasGit: true,
            platform: 'linux',
            canOneClickUpdate: true,
          },
        };
      }
    } catch (_) {
      // Backend check failed or offline — fallback to direct GitHub check below
    }

    // 2. Fallback: Direct GitHub check (package.json on main + releases/latest)
    let latestTag = '';
    let releaseName = '';
    let releaseBody = '';
    let publishedAt = new Date().toISOString();
    let htmlUrl = `https://github.com/${GITHUB_REPO}`;
    let apkDownloadUrl: string | undefined;
    let apkSize: number | undefined;

    // 2a. Check raw package.json on main
    try {
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json?t=${Date.now()}`;
      if (Capacitor.isNativePlatform()) {
        const nativePkg = await CapacitorHttp.get({ url: rawUrl });
        if (nativePkg.status >= 200 && nativePkg.status < 300 && nativePkg.data) {
          const parsed = typeof nativePkg.data === 'string' ? JSON.parse(nativePkg.data) : nativePkg.data;
          if (parsed?.version) {
            latestTag = `v${String(parsed.version).replace(/^v/i, '').trim()}`;
            releaseName = `Lectura ${latestTag}`;
          }
        }
      } else {
        const pkgRes = await fetch(rawUrl, { headers: { 'Cache-Control': 'no-cache' } });
        if (pkgRes.ok) {
          const parsed = await pkgRes.json();
          if (parsed?.version) {
            latestTag = `v${String(parsed.version).replace(/^v/i, '').trim()}`;
            releaseName = `Lectura ${latestTag}`;
          }
        }
      }
    } catch (_) {}

    // 2b. Check GitHub Releases API
    let data: any = null;
    if (Capacitor.isNativePlatform()) {
      try {
        const nativeRes = await CapacitorHttp.get({
          url: `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          headers: { 'Accept': 'application/vnd.github.v3+json' },
        });
        if (nativeRes.status >= 200 && nativeRes.status < 300) {
          data = nativeRes.data;
        }
      } catch (_) {}
    } else {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' },
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (_) {}
    }

    if (data) {
      const relTag = String(data.tag_name || '').trim();
      if (relTag) {
        const normalizedRelTag = `v${relTag.replace(/^v/i, '')}`;
        if (!latestTag || compareVersions(normalizedRelTag.replace(/^v/i, ''), latestTag.replace(/^v/i, '')) >= 0) {
          latestTag = normalizedRelTag;
          releaseName = data.name || latestTag;
          releaseBody = data.body || '';
          publishedAt = data.published_at || publishedAt;
          htmlUrl = data.html_url || htmlUrl;
        }
      }
      if (data.assets && Array.isArray(data.assets)) {
        const apkAsset = data.assets.find((a: any) =>
          a.name && (a.name.endsWith('.apk') || a.content_type === 'application/vnd.android.package-archive')
        );
        if (apkAsset) {
          apkDownloadUrl = apkAsset.browser_download_url;
          apkSize = apkAsset.size;
        }
      }
    }

    if (!latestTag) return null;

    if (!manualCheck) {
      try {
        const dismissedTag = localStorage.getItem(LAST_DISMISSED_TAG_KEY);
        if (dismissedTag === latestTag) return null;
        const sessionDismissed = sessionStorage.getItem('lectura_dismissed_session');
        if (sessionDismissed === latestTag) return null;
      } catch (_) {}
    }

    const latestVersionClean = latestTag.replace(/^v/i, '').trim();
    const isNewer = compareVersions(latestVersionClean, currentClientClean) > 0;

    return {
      tag_name: latestTag,
      name: releaseName || latestTag,
      body: releaseBody || '',
      published_at: publishedAt,
      html_url: htmlUrl,
      apkDownloadUrl,
      apkSize,
      hasUpdate: isNewer,
    };
  } catch {
    return null;
  }
}

export const checkForUpdates = checkForGitHubUpdate;

/**
 * Triggers 1-click server update on the backend (DB Backup -> Download -> Build -> Restart)
 */
export async function triggerServerUpdate(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(resolveApiUrl('/api/system/update-apply'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}

/**
 * Fetches current server update progress
 */
export async function fetchServerUpdateProgress(): Promise<ServerUpdateProgress | null> {
  try {
    const res = await fetch(resolveApiUrl(`/api/system/update-progress?t=${Date.now()}`), {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Polls /api/health to detect when server is back online with the updated version
 */
export async function checkServerHealthVersion(): Promise<string | null> {
  try {
    const res = await fetch(resolveApiUrl(`/api/health?t=${Date.now()}`), {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.version ? String(data.version) : null;
  } catch {
    return null;
  }
}

/**
 * Clears Service Worker & Cache Storage and reloads the browser tab cleanly
 */
export async function clearCacheAndReloadApp(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister().catch(() => {})));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch (_) {}

  window.location.reload();
}

/**
 * Dismisses an update notification so it doesn't pop up again for this version.
 */
export function dismissUpdateTag(tag: string) {
  try {
    localStorage.setItem(LAST_DISMISSED_TAG_KEY, tag);
  } catch (_) {}
}

/**
 * Initiates APK download and triggers FileProvider system installation.
 */
export async function downloadAndInstallApk(downloadUrl: string, versionName: string): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await LecturaUpdater.downloadAndInstallApk({
        downloadUrl,
        versionName,
      });
      return true;
    } catch (err) {
      console.error('[InAppUpdater] Native APK download/install error:', err);
      window.open(downloadUrl, '_system');
      return false;
    }
  } else {
    window.open(downloadUrl, '_blank');
    return true;
  }
}

/**
 * Semver comparison helper (returns 1 if a > b, -1 if a < b, 0 if equal)
 */
export function compareVersions(a: string, b: string): number {
  const cleanA = String(a || '').replace(/^v/i, '').trim();
  const cleanB = String(b || '').replace(/^v/i, '').trim();
  const pa = cleanA.split('.').map(n => parseInt(n, 10) || 0);
  const pb = cleanB.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
