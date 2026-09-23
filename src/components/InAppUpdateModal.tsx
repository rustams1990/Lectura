import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Download, X, ExternalLink, CheckCircle2, ArrowUpCircle, Terminal, Copy, Check, Smartphone, Server } from 'lucide-react';
import { GitHubReleaseInfo, downloadAndInstallApk, dismissUpdateTag } from '../services/inAppUpdaterService';
import { APP_VERSION } from '../version';
import { Capacitor } from '@capacitor/core';

interface InAppUpdateModalProps {
  release: GitHubReleaseInfo | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function InAppUpdateModal({ release, isOpen, onClose }: InAppUpdateModalProps) {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateTriggered, setUpdateTriggered] = useState(false);
  const [copiedServerCmd, setCopiedServerCmd] = useState(false);
  const [copiedWindowsCmd, setCopiedWindowsCmd] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'ubuntu' | 'windows'>('ubuntu');

  if (!isOpen || !release || !release.hasUpdate) {
    return null;
  }

  const isNative = Capacitor.isNativePlatform();

  const handleUpdate = async () => {
    const url = release.apkDownloadUrl || release.html_url;
    setIsUpdating(true);
    try {
      await downloadAndInstallApk(url, release.tag_name);
      setUpdateTriggered(true);
    } catch (err) {
      console.error('Update initiation failed:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    dismissUpdateTag(release.tag_name);
    onClose();
  };

  const handleClose = () => {
    // Suppress for current browser session so it doesn't pop up on every page refresh
    try {
      sessionStorage.setItem('lectura_dismissed_session', release.tag_name);
    } catch (_) {}
    onClose();
  };

  const copyToClipboard = (text: string, type: 'ubuntu' | 'windows') => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'ubuntu') {
        setCopiedServerCmd(true);
        setTimeout(() => setCopiedServerCmd(false), 2000);
      } else {
        setCopiedWindowsCmd(true);
        setTimeout(() => setCopiedWindowsCmd(false), 2000);
      }
    }).catch(() => {});
  };

  const formattedSize = release.apkSize
    ? `${(release.apkSize / (1024 * 1024)).toFixed(1)} MB`
    : null;

  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center p-4 z-[99999]">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative space-y-4 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0 shadow-xs">
              <ArrowUpCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-zinc-900 dark:text-white">
                  {t('updater.title', 'Update Available')}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 text-[10px] font-black uppercase tracking-wider">
                  {release.tag_name}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t('updater.current_vs_new', 'Current: {{current}} → New: {{latest}}', {
                  current: APP_VERSION,
                  latest: release.tag_name,
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Release Notes / Changelog */}
        <div className="bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 max-h-36 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5 font-sans leading-relaxed">
          <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('updater.whats_new', "What's new in this release:")}</span>
          </div>
          <div className="whitespace-pre-wrap font-mono text-[11px] opacity-90">
            {release.body || t('updater.no_changelog', 'Performance improvements and bug fixes.')}
          </div>
        </div>

        {/* Platform-Specific Update Section */}
        {isNative ? (
          /* Native Android App: Direct 1-Click In-App APK Download & Install */
          <div className="space-y-2 pt-1">
            {updateTriggered ? (
              <div className="flex items-center gap-2 p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl text-teal-700 dark:text-teal-300 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t('updater.download_started', 'Download started in background. The installer will open automatically.')}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleUpdate}
                disabled={isUpdating}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-500 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-lg hover:shadow-teal-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>
                  {isUpdating
                    ? t('updater.starting', 'Starting download...')
                    : t('updater.btn_update', 'Download & Install Update {{size}}', {
                        size: formattedSize ? `(${formattedSize})` : '',
                      })}
                </span>
              </button>
            )}
          </div>
        ) : (
          /* Web Browser (Ubuntu Server / Windows Desktop) */
          <div className="space-y-3 pt-1">
            {/* Platform Tabs */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setActivePlatformTab('ubuntu')}
                className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activePlatformTab === 'ubuntu'
                    ? 'bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Ubuntu Server</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePlatformTab('windows')}
                className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activePlatformTab === 'windows'
                    ? 'bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Windows</span>
              </button>
            </div>

            {/* Ubuntu Server Instructions */}
            {activePlatformTab === 'ubuntu' && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                    {t('updater.server_cmd_title', 'Команда обновления на сервере Ubuntu:')}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('bash scripts/update-server.sh', 'ubuntu')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-bold hover:bg-teal-100 transition cursor-pointer"
                  >
                    {copiedServerCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedServerCmd ? t('updater.copied', 'Скопировано!') : t('updater.copy', 'Скопировать')}</span>
                  </button>
                </div>
                <div className="bg-zinc-900 text-zinc-100 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                  bash scripts/update-server.sh
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                  {t('updater.server_hint', 'Скрипт автоматически сделает бэкап базы данных, скачает свежий Docker-образ v{{ver}} и перезапустит Lectura.', { ver: release.tag_name })}
                </p>
              </div>
            )}

            {/* Windows Instructions */}
            {activePlatformTab === 'windows' && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                    {t('updater.windows_cmd_title', 'Команда для локального сервера Windows:')}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('update.bat', 'windows')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-bold hover:bg-teal-100 transition cursor-pointer"
                  >
                    {copiedWindowsCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedWindowsCmd ? t('updater.copied', 'Скопировано!') : t('updater.copy', 'Скопировать')}</span>
                  </button>
                </div>
                <div className="bg-zinc-900 text-zinc-100 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                  update.bat
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                  {t('updater.windows_hint', 'Запустите update.bat в корне папки Lectura для обновления с бэкапом базы данных.')}
                </p>
              </div>
            )}

            {/* Separate Button to Download Android APK if needed */}
            {release.apkDownloadUrl && (
              <button
                type="button"
                onClick={handleUpdate}
                className="w-full py-2.5 px-3 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>
                  {t('updater.download_apk_btn', 'Скачать APK для Android {{size}}', {
                    size: formattedSize ? `(${formattedSize})` : '',
                  })}
                </span>
                <Download className="w-3.5 h-3.5 opacity-60 ml-auto" />
              </button>
            )}

            {/* Primary Action Button: Got It / Dismiss */}
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-500 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-lg hover:shadow-teal-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t('common.close', 'Понятно')}</span>
            </button>
          </div>
        )}

        {/* Footer Links */}
        <div className="flex items-center justify-between text-xs pt-1 px-1 border-t border-zinc-100 dark:border-zinc-800/60">
          <a
            href={release.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-1 transition"
          >
            <span>{t('updater.view_on_github', 'View on GitHub')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition font-medium cursor-pointer"
          >
            {t('updater.dont_ask_again', "Don't ask for this version")}
          </button>
        </div>
      </div>
    </div>
  );
}
