import React, { useState, useRef, useEffect } from "react";
import { useAuth, SavedAccount } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { UserAvatarDisplay } from "./ProfileModal";
import { 
  ChevronDown, UserPlus, Settings, LogOut, Check, 
  Trash2, Shield, Loader2, Sparkles, RefreshCw, AlertCircle, CheckCircle2, Cloud
} from "lucide-react";

export interface SyncProgressInfo {
  isSyncing: boolean;
  percent: number;
  message?: string;
  error?: boolean;
  lastSyncTime?: number | null;
}

interface AccountSwitcherDropdownProps {
  onOpenProfileSettings: () => void;
  onOpenAddAccount: (prefillUsername?: string) => void;
  localSyncError?: boolean;
  isSyncing?: boolean;
  syncProgress?: SyncProgressInfo;
  onSyncErrorClick?: () => void;
  onManualSync?: () => void;
}

export default function AccountSwitcherDropdown({
  onOpenProfileSettings,
  onOpenAddAccount,
  localSyncError = false,
  isSyncing = false,
  syncProgress,
  onSyncErrorClick,
  onManualSync,
}: AccountSwitcherDropdownProps) {
  const { user, savedAccounts, switchAccount, removeSavedAccount, logout } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [switchingToken, setSwitchingToken] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const displayName = user.displayName || user.username || user.email || "User";
  const otherAccounts = savedAccounts.filter(acc => acc.user.id !== user.id && acc.user.email !== user.email);

  const handleSwitch = async (acc: SavedAccount) => {
    setSwitchingToken(acc.token);
    try {
      const res = await switchAccount(acc.token);
      if (res.success) {
        showToast(t('account_switcher.switch_success', 'Switched to account: {{name}}', { name: acc.user.displayName || acc.user.username }), 'success');
        setIsOpen(false);
      } else if (res.is401) {
        showToast(t('account_switcher.session_expired', 'Account session expired. Please sign in again.'), 'warning');
        setIsOpen(false);
        onOpenAddAccount(acc.user.email || acc.user.username);
      } else {
        showToast(res.error || t('account_switcher.switch_error', 'Failed to switch account'), 'error');
      }
    } catch (err: any) {
      showToast(err.message || t('account_switcher.switch_error', 'Failed to switch account'), 'error');
    } finally {
      setSwitchingToken(null);
    }
  };

  const handleRemoveAccount = (e: React.MouseEvent, acc: SavedAccount) => {
    e.stopPropagation();
    removeSavedAccount(acc.token);
    showToast(t('account_switcher.removed', 'Account removed from saved list'), 'info');
  };

  const isCurrentlySyncing = isSyncing || (syncProgress && syncProgress.isSyncing);
  const syncPercent = syncProgress?.percent ?? (isCurrentlySyncing ? 65 : 100);
  const hasSyncError = localSyncError || !!syncProgress?.error;

  const formatLastSync = (timestamp?: number | null) => {
    if (!timestamp) return t('sync.just_now', 'just now');
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 10) return t('sync.just_now', 'just now');
    if (diffSec < 60) return t('sync.seconds_ago', '{{count}}s ago', { count: diffSec });
    const diffMin = Math.floor(diffSec / 60);
    return t('sync.minutes_ago', '{{count}}m ago', { count: diffMin });
  };

  const getLocalizedSyncMessage = (msg?: string) => {
    if (!msg) return t('sync.syncingBooksAndDicts', 'Syncing dictionaries and books...');
    if (msg.includes("Синхронизация") || msg.includes("Syncing")) {
      return t('sync.syncingBooksAndDicts', 'Syncing dictionaries and books...');
    }
    if (msg.includes("Подключение") || msg.includes("Connecting")) {
      return t('sync.connecting', 'Connecting to server...');
    }
    if (msg === "В сети" || msg === "Online") {
      return t('sync.online', 'Online');
    }
    return msg;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Account Switcher Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 p-1 sm:pl-1.5 sm:pr-2.5 sm:py-1 bg-teal-50 hover:bg-teal-100/70 dark:bg-teal-900/20 dark:hover:bg-teal-900/35 border border-teal-200/50 dark:border-teal-800/80 rounded-xl relative shadow-3xs transition-all active:scale-98 cursor-pointer group select-none"
        title={t('account_switcher.tooltip', 'Profile and account switcher')}
      >
        <div className="relative">
          <UserAvatarDisplay
            avatarUrl={user.avatarUrl}
            name={displayName}
            size="sm"
          />
          {/* Status badge dot */}
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-zinc-900 ${
            hasSyncError ? "bg-red-500 animate-pulse" : isCurrentlySyncing ? "bg-amber-500 animate-ping" : "bg-teal-500"
          }`} />
        </div>

        <div className="hidden sm:flex flex-col text-left justify-center min-w-0 pr-0.5 max-w-[110px]">
          <div className="flex items-center gap-1 leading-none">
            <span className="text-[10px] font-black text-teal-800 dark:text-teal-200 truncate">
              {displayName}
            </span>
          </div>
          <span className="text-[8px] font-bold text-zinc-400 dark:text-zinc-500 truncate">
            {user.email || user.username}
          </span>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-teal-600 dark:text-teal-400 transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/80">
          
          {/* Active Profile Info */}
          <div className="p-3 bg-zinc-50/50 dark:bg-zinc-950/40">
            <div className="flex items-center gap-3">
              <UserAvatarDisplay
                avatarUrl={user.avatarUrl}
                name={displayName}
                size="md"
              />
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-zinc-900 dark:text-white truncate">
                    {displayName}
                  </h4>
                  <span className="text-[8px] font-extrabold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 border border-teal-200 dark:border-teal-800 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse" />
                    {t('account_switcher.active', 'Active')}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                  {user.email || user.username}
                </p>
              </div>
            </div>
          </div>

          {/* Sync Progress & Health Card */}
          <div className="p-3 bg-zinc-50/70 dark:bg-zinc-950/60 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <Cloud className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{t('sync.title', 'DATA SYNCHRONIZATION')}</span>
              </div>
              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                hasSyncError
                  ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
                  : isCurrentlySyncing
                  ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-mono border border-amber-300/60 dark:border-amber-800/60 shadow-3xs"
                  : "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
              }`}>
                {hasSyncError ? (
                  <>
                    <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                    <span>{t('sync.offline', t('sync.status_error', 'Offline'))}</span>
                  </>
                ) : isCurrentlySyncing ? (
                  <>
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{syncPercent}%</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>{t('sync.online', t('sync.status_synced', 'Online'))}</span>
                  </>
                )}
              </span>
            </div>

            {/* Progress Bar when syncing */}
            {isCurrentlySyncing && (
              <div className="space-y-1 animate-in fade-in duration-150">
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${Math.min(100, Math.max(10, syncPercent))}%` }} 
                  />
                </div>
                <div className="flex justify-between items-center text-[9px] text-zinc-500 font-medium">
                  <span className="truncate">{getLocalizedSyncMessage(syncProgress?.message)}</span>
                  <span className="font-mono font-bold shrink-0 text-amber-600 dark:text-amber-400">{syncPercent}%</span>
                </div>
              </div>
            )}

            {!isCurrentlySyncing && (
              <div className="flex items-center justify-between pt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>
                    {!syncProgress?.lastSyncTime || (Math.floor((Date.now() - (syncProgress.lastSyncTime || 0)) / 1000) < 10)
                      ? t('sync.updatedJustNow', 'Updated: just now')
                      : t('sync.updatedAt', { time: formatLastSync(syncProgress?.lastSyncTime), defaultValue: `${t('sync.last_sync', 'Updated:')} ${formatLastSync(syncProgress?.lastSyncTime)}` })
                    }
                  </span>
                </span>
                {onManualSync && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onManualSync();
                    }}
                    className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{t('sync.syncButton', t('sync.sync_now', 'Sync'))}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Other Saved Accounts Section */}
          {otherAccounts.length > 0 && (
            <div className="py-2">
              <div className="px-3 py-1 text-[9px] uppercase font-black tracking-wider text-zinc-400 dark:text-zinc-500">
                {t('account_switcher.other_accounts', 'Other Accounts:')}
              </div>
              <div className="max-h-44 overflow-y-auto space-y-0.5 px-1.5 custom-scrollbar">
                {otherAccounts.map((acc) => {
                  const isSwitchingThis = switchingToken === acc.token;
                  const accName = acc.user.displayName || acc.user.username || acc.user.email || "User";
                  return (
                    <div
                      key={acc.token}
                      onClick={() => !isSwitchingThis && handleSwitch(acc)}
                      className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl hover:bg-teal-50/60 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatarDisplay
                          avatarUrl={acc.user.avatarUrl}
                          name={accName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                            {accName}
                          </div>
                          <div className="text-[9px] text-zinc-400 dark:text-zinc-500 truncate">
                            {acc.user.email || acc.user.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isSwitchingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleRemoveAccount(e, acc)}
                            title={t('account_switcher.remove_from_list', 'Remove from list')}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500 rounded-lg transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="p-1.5 space-y-0.5 text-left">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenProfileSettings();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{t('account_switcher.profile_settings', 'Profile Settings')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenAddAccount();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t('account_switcher.add_account', '+ Add Account')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                logout().catch(console.error);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('account_switcher.logout_current', 'Sign Out from this account')}</span>
            </button>

            {savedAccounts.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  logout({ all: true }).catch(console.error);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-400 hover:text-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20 rounded-xl transition cursor-pointer"
              >
                <span>{t('account_switcher.logout_all', 'Sign Out from all accounts')}</span>
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
