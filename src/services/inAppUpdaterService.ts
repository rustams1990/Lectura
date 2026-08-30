import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../version';

interface LecturaUpdaterPluginInterface {
  downloadAndInstallApk(options: { downloadUrl: string; versionName: string }): Promise<{ downloadId: number; status: string }>;
  openApk(options: { filePath: string }): Promise<void>;
}

const LecturaUpdater = registerPlugin<LecturaUpdaterPluginInterface>('LecturaUpdater');

export interface GitHubReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  apkDownloadUrl?: string;
  apkSize?: number;
  hasUpdate: boolean;
}

const GITHUB_REPO = 'rustams1990/lectura';
const LAST_DISMISSED_TAG_KEY = 'lectura_dismissed_update_tag';

/**
 * Checks GitHub Releases API for newer version
 */
export async function checkForGitHubUpdate(manualCheck = false): Promise<GitHubReleaseInfo | null> {
  try {
    let data: any = null;

    if (Capacitor.isNativePlatform()) {
      try {
        const nativeRes = await CapacitorHttp.get({
          url: `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        if (nativeRes.status < 200 || nativeRes.status >= 300) {
          // Если релизов пока нет (404), тихо выходим без вывода ошибки в консоль
          return null;
        }
        data = nativeRes.data;
      } catch {
        return null;
      }
    } else {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) {
        // Если релизов пока нет (404), тихо выходим без вывода ошибки в консоль
        return null;
      }

      data = await res.json();
    }

    if (!data) return null;

    const latestTag = (data.tag_name || '').trim();
    if (!latestTag) return null;

    // Check if user dismissed this specific version in automatic mode
    if (!manualCheck) {
      try {
        const dismissedTag = localStorage.getItem(LAST_DISMISSED_TAG_KEY);
        if (dismissedTag === latestTag) {
          return null;
        }
      } catch (_) {}
    }

    const currentVersionClean = APP_VERSION.replace(/^v/, '').trim();
    const latestVersionClean = latestTag.replace(/^v/, '').trim();

    const isNewer = compareVersions(latestVersionClean, currentVersionClean) > 0;

    // Find APK asset in release assets
    let apkDownloadUrl: string | undefined;
    let apkSize: number | undefined;

    if (data.assets && Array.isArray(data.assets)) {
      const apkAsset = data.assets.find((a: any) => 
        a.name && (a.name.endsWith('.apk') || a.content_type === 'application/vnd.android.package-archive')
      );
      if (apkAsset) {
        apkDownloadUrl = apkAsset.browser_download_url;
        apkSize = apkAsset.size;
      }
    }

    return {
      tag_name: latestTag,
      name: data.name || latestTag,
      body: data.body || 'New release available',
      published_at: data.published_at,
      html_url: data.html_url,
      apkDownloadUrl,
      apkSize,
      hasUpdate: isNewer,
    };
  } catch {
    // Repository is private or no releases yet — silently return null without console errors
    return null;
  }
}

export const checkForUpdates = checkForGitHubUpdate;

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
      // Fallback: open in system browser
      window.open(downloadUrl, '_system');
      return false;
    }
  } else {
    // Web / desktop / iOS: open GitHub release download
    window.open(downloadUrl, '_blank');
    return true;
  }
}

/**
 * Semver comparison helper (returns 1 if a > b, -1 if a < b, 0 if equal)
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
