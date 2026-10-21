import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Download,
  X,
  ExternalLink,
  CheckCircle2,
  ArrowUpCircle,
  Terminal,
  Copy,
  Check,
  Smartphone,
  Server,
  RefreshCw,
  Loader2,
  Database,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  GitHubReleaseInfo,
  downloadAndInstallApk,
  dismissUpdateTag,
  triggerServerUpdate,
  fetchServerUpdateProgress,
  checkServerHealthVersion,
  clearCacheAndReloadApp,
  compareVersions,
} from '../services/inAppUpdaterService';
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
  const [serverUpdateStep, setServerUpdateStep] = useState<string>('idle');
  const [serverUpdateProgress, setServerUpdateProgress] = useState<number>(0);
  const [serverUpdateError, setServerUpdateError] = useState<string | null>(null);
  const [showManualCommands, setShowManualCommands] = useState(false);
  const [copiedServerCmd, setCopiedServerCmd] = useState(false);
  const [copiedWindowsCmd, setCopiedWindowsCmd] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'ubuntu' | 'windows'>(
    release?.environment?.platform === 'win32' ? 'windows' : 'ubuntu'
  );

  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (release?.environment?.platform === 'win32') {
      setActivePlatformTab('windows');
    } else if (release?.environment?.isDocker || release?.environment?.platform === 'linux') {
      setActivePlatformTab('ubuntu');
    }
  }, [release]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  if (!isOpen || !release || !release.hasUpdate) {
    return null;
  }

  const isNative = Capacitor.isNativePlatform();

  const handleNativeApkUpdate = async () => {
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

  const getStepLabel = (stepKey: string): string => {
    switch (stepKey) {
      case 'backup':
        return t('updater.step_backup', '1/3 Creating database backup...');
      case 'downloading':
        return t('updater.step_downloading', '2/3 Downloading new version from GitHub...');
      case 'installing':
        return t('updater.step_installing', '2/3 Updating packages & dependencies...');
      case 'building':
        return t('updater.step_building', '2/3 Building application bundle...');
      case 'restarting':
        return t('updater.step_restarting', '3/3 Restarting server & applying update...');
      case 'completed':
        return t('updater.step_completed', 'Update complete! Reloading interface...');
      default:
        return t('updater.step_starting', 'Starting automatic update...');
    }
  };

  const handleOneClickServerUpdate = async () => {
    // If server is already updated and only this browser tab is behind, just clear cache & reload
    if (release.isClientReloadOnly) {
      setIsUpdating(true);
      setServerUpdateStep('completed');
      setServerUpdateProgress(100);
      await clearCacheAndReloadApp();
      return;
    }

    setIsUpdating(true);
    setServerUpdateError(null);
    setServerUpdateStep('backup');
    setServerUpdateProgress(15);

    const startRes = await triggerServerUpdate();
    if (!startRes.ok) {
      setIsUpdating(false);
      setServerUpdateError(startRes.error || t('updater.update_error', 'Failed to start automatic update.'));
      setShowManualCommands(true);
      return;
    }

    let sawRestarting = false;
    let sawActiveStep = false;
    let idleCountAfterStart = 0;
    const targetTag = release.tag_name;
    const startTime = Date.now();

    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = window.setInterval(async () => {
      // Safety timeout after 2 minutes
      if (Date.now() - startTime > 2 * 60 * 1000) {
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
        setIsUpdating(false);
        setServerUpdateError(t('updater.timeout_error', 'Update is taking longer than expected. Please refresh the page in a few seconds.'));
        return;
      }

      const prog = await fetchServerUpdateProgress();
      if (prog) {
        // First check if server already reports the new version (e.g. finished restarting or updated via Watchtower)
        if (prog.currentVersion && compareVersions(prog.currentVersion, targetTag) >= 0 && (prog.status === 'idle' || prog.status === 'completed' || prog.status === 'restarting')) {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          setServerUpdateStep('completed');
          setServerUpdateProgress(100);
          setTimeout(() => {
            clearCacheAndReloadApp();
          }, 600);
          return;
        }

        if (prog.status === 'error') {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          setIsUpdating(false);
          setServerUpdateError(prog.error || prog.message || t('updater.update_error', 'Automatic update failed.'));
          setShowManualCommands(true);
          return;
        }

        if (prog.status !== 'idle') {
          sawActiveStep = true;
          idleCountAfterStart = 0;
          setServerUpdateStep(prog.status);
          setServerUpdateProgress((prev) => Math.max(prev, prog.progress || 20));
        } else if (sawActiveStep) {
          // Server returned to 'idle' after an active step — means process restarted!
          idleCountAfterStart++;
          if (idleCountAfterStart >= 3) {
            if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
            setIsUpdating(false);
            setServerUpdateError(t('updater.update_error', 'Server restarted before completing the update. Please refresh the page or try again.'));
            setShowManualCommands(true);
            return;
          }
        }

        if (prog.status === 'restarting' || prog.status === 'completed') {
          sawRestarting = true;
        }
      } else {
        // When server briefly drops connection during restart
        sawRestarting = true;
        setServerUpdateStep('restarting');
        setServerUpdateProgress((prev) => Math.max(prev, 92));
      }

      if (sawRestarting) {
        const liveVer = await checkServerHealthVersion();
        if (liveVer && compareVersions(liveVer, targetTag) >= 0) {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          setServerUpdateStep('completed');
          setServerUpdateProgress(100);
          setTimeout(() => {
            clearCacheAndReloadApp();
          }, 700);
        }
      }
    }, 1200);
  };

  const handleDismiss = () => {
    if (isUpdating) return;
    dismissUpdateTag(release.tag_name);
    onClose();
  };

  const handleClose = () => {
    if (isUpdating) return;
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

          {!isUpdating && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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
                onClick={handleNativeApkUpdate}
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
          /* Web Browser (Local PC & Ubuntu Server): 1-Click Automatic Update */
          <div className="space-y-3 pt-1">
            {/* Live Progress View when updating */}
            {isUpdating && (
              <div className="p-3.5 bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/80 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-teal-800 dark:text-teal-200">
                  <div className="flex items-center gap-2">
                    {serverUpdateStep === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-teal-600 dark:text-teal-400 animate-spin shrink-0" />
                    )}
                    <span>{getStepLabel(serverUpdateStep)}</span>
                  </div>
                  <span className="font-mono text-[11px]">{serverUpdateProgress}%</span>
                </div>

                <div className="w-full h-2 bg-teal-200/60 dark:bg-teal-900/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 dark:bg-teal-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(8, Math.min(100, serverUpdateProgress))}%` }}
                  />
                </div>

                <p className="text-[10px] text-teal-700/80 dark:text-teal-300/80 flex items-center gap-1.5">
                  <Database className="w-3 h-3 shrink-0" />
                  <span>
                    {t(
                      'updater.auto_backup_note',
                      'Your database and settings are backed up automatically before updating.'
                    )}
                  </span>
                </p>
              </div>
            )}

            {/* Error Alert if automatic update encountered an issue */}
            {serverUpdateError && !isUpdating && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">{t('updater.update_error_title', 'Automatic update failed')}</div>
                  <div className="text-[11px] opacity-90">{serverUpdateError}</div>
                </div>
              </div>
            )}

            {/* Primary 1-Click Update Button */}
            {!isUpdating && (
              <button
                type="button"
                onClick={handleOneClickServerUpdate}
                className="w-full py-3.5 px-4 bg-teal-600 hover:bg-teal-500 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-lg hover:shadow-teal-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>
                  {release.isClientReloadOnly
                    ? t('updater.btn_reload_now', 'Apply Update & Reload ({{ver}})', { ver: release.tag_name })
                    : t('updater.btn_auto_update_now', 'Update Now to {{ver}}', { ver: release.tag_name })}
                </span>
              </button>
            )}

            {/* Safety Subtitle under Update button */}
            {!isUpdating && !release.isClientReloadOnly && (
              <p className="text-[10px] text-center text-zinc-500 dark:text-zinc-400">
                {t(
                  'updater.one_click_hint',
                  'Automatically backs up your SQLite database, installs the update, and restarts Lectura.'
                )}
              </p>
            )}

            {/* Separate Button to Download Android APK if needed */}
            {!isUpdating && release.apkDownloadUrl && (
              <button
                type="button"
                onClick={handleNativeApkUpdate}
                className="w-full py-2.5 px-3 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>
                  {t('updater.download_apk_btn', 'Download APK for Android {{size}}', {
                    size: formattedSize ? `(${formattedSize})` : '',
                  })}
                </span>
                <Download className="w-3.5 h-3.5 opacity-60 ml-auto" />
              </button>
            )}

            {/* Collapsible Manual Terminal Commands (Fallback for advanced users) */}
            {!isUpdating && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualCommands((v) => !v)}
                  className="w-full py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Terminal className="w-3 h-3" />
                  <span>{t('updater.manual_cmd_toggle', 'Manual update via terminal')}</span>
                  {showManualCommands ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showManualCommands && (
                  <div className="mt-2 space-y-2.5">
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

                    {activePlatformTab === 'ubuntu' ? (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                            {t('updater.server_cmd_title', 'Ubuntu Server update command:')}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard('bash scripts/update-server.sh', 'ubuntu')}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-bold hover:bg-teal-100 transition cursor-pointer"
                          >
                            {copiedServerCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedServerCmd ? t('updater.copied', 'Copied!') : t('updater.copy', 'Copy')}</span>
                          </button>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                          bash scripts/update-server.sh
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                            {t('updater.windows_cmd_title', 'Local Windows server update command:')}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard('update.bat', 'windows')}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-bold hover:bg-teal-100 transition cursor-pointer"
                          >
                            {copiedWindowsCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedWindowsCmd ? t('updater.copied', 'Copied!') : t('updater.copy', 'Copy')}</span>
                          </button>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                          update.bat
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Secondary Actions */}
        {!isUpdating && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
            <a
              href={release.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400 font-semibold transition"
            >
              <span>{t('updater.view_on_github', 'View on GitHub')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-semibold transition cursor-pointer"
              >
                {t('updater.later', 'Later')}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium transition cursor-pointer"
              >
                {t('updater.dont_ask_again', "Don't ask for this version")}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
