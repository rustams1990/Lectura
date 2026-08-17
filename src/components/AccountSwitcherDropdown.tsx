import React, { useState, useRef, useEffect } from "react";
import { useAuth, SavedAccount } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { UserAvatarDisplay } from "./ProfileModal";
import { 
  ChevronDown, UserPlus, Settings, LogOut, Check, 
  Trash2, Shield, Loader2, Sparkles 
} from "lucide-react";

interface AccountSwitcherDropdownProps {
  onOpenProfileSettings: () => void;
  onOpenAddAccount: (prefillUsername?: string) => void;
  localSyncError?: boolean;
  isSyncing?: boolean;
  onSyncErrorClick?: () => void;
}

export default function AccountSwitcherDropdown({
  onOpenProfileSettings,
  onOpenAddAccount,
  localSyncError = false,
  isSyncing = false,
  onSyncErrorClick,
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
        showToast(res.error || 'Failed to switch account', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error', 'error');
    } finally {
      setSwitchingToken(null);
    }
  };

  const handleRemoveAccount = (e: React.MouseEvent, acc: SavedAccount) => {
    e.stopPropagation();
    removeSavedAccount(acc.token);
    showToast(t('account_switcher.account_removed', 'Account removed from quick switcher list'), 'info');
  };

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Header Button Badge */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 bg-teal-50 hover:bg-teal-100/70 dark:bg-teal-900/20 dark:hover:bg-teal-900/35 border border-teal-200/50 dark:border-teal-800/80 rounded-xl relative shadow-3xs transition-all active:scale-98 cursor-pointer group select-none"
        title={t('account_switcher.tooltip', 'Profile and account switcher')}
      >
        <div className="relative">
          <UserAvatarDisplay
            avatarUrl={user.avatarUrl}
            name={displayName}
            size="sm"
          />
          {/* Status badge dot */}
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-zinc-900 bg-teal-500" />
        </div>

        <div className="flex flex-col text-left justify-center min-w-0 pr-0.5 max-w-[110px]">
          <div className="flex items-center gap-1 leading-none">
            <span className="text-[10px] font-black text-teal-800 dark:text-teal-200 truncate">
              {displayName}
            </span>
          </div>
          <span className="text-[8px] font-bold text-zinc-400 dark:text-zinc-500 truncate">
            {user.email || user.username}
          </span>
        </div>

        {localSyncError ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSyncErrorClick?.();
            }}
            className="flex items-center gap-0.5 px-1 py-0.2 bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded text-[7.5px] font-black cursor-pointer animate-pulse"
          >
            <span className="w-1 h-1 bg-red-500 rounded-full shrink-0" />
            <span>Sync</span>
          </span>
        ) : isSyncing ? (
          <span className="flex items-center gap-0.5 text-[7.5px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded border border-amber-200/50 dark:border-amber-900/30">
            <span className="w-1 h-1 bg-amber-500 rounded-full animate-ping shrink-0" />
          </span>
        ) : null}

        <ChevronDown className={`w-3.5 h-3.5 text-teal-600 dark:text-teal-400 transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/80">
          
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

          {/* Other Saved Accounts Section */}
          {otherAccounts.length > 0 && (
            <div className="py-2">
              <div className="px-3 py-1 text-[9px] uppercase font-black tracking-wider text-zinc-400 dark:text-zinc-500">
                {t('account_switcher.other_accounts', 'Other Accounts:')}
              </div>
              <div className="max-h-44 overflow-y-auto space-y-0.5 px-1.5">
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
