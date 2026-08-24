import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { safeLocalStorageSetItem } from "../utils";
import { clearLocalUserDataCache } from "../db";
import { resolveServerUrl } from "../utils/mobileServerBridge";

export interface LocalUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string | null;
  passwordHint?: string | null;
}

export interface SavedAccount {
  token: string;
  user: LocalUser;
  lastUsed?: number;
}

interface AuthContextType {
  user: LocalUser | null;
  localUser: LocalUser | null;
  serverToken: string;
  storageMode: "server" | "local";
  setStorageMode: (mode: "server" | "local") => void;
  localSyncKey: string;
  setLocalSyncKey: (key: string) => void;
  localSyncError: boolean;
  setLocalSyncError: (err: boolean) => void;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  savedAccounts: SavedAccount[];
  loginLocalServer: (username: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  registerLocalServer: (username: string, password?: string, passwordHint?: string, avatarUrl?: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (patch: { displayName?: string; avatarUrl?: string | null; passwordHint?: string | null }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string, passwordHint?: string) => Promise<{ success: boolean; error?: string }>;
  uploadAvatar: (avatarData: string) => Promise<{ success: boolean; avatarUrl?: string; error?: string }>;
  switchAccount: (targetToken: string) => Promise<{ success: boolean; error?: string; is401?: boolean; expiredAccount?: SavedAccount }>;
  removeSavedAccount: (targetTokenOrUserId: string) => void;
  logout: (options?: { all?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [localUser, setLocalUser] = useState<LocalUser | null>(() => {
    const saved = localStorage.getItem("vocab_clone_local_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved local user:", e);
      }
    }
    return null;
  });
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  const [storageMode, setStorageModeState] = useState<"server" | "local">(() => {
    const saved = localStorage.getItem("vocab_clone_storage_mode");
    if (saved === "local") {
      return "local";
    }
    return "server";
  });

  const [serverToken, setServerToken] = useState<string>(() => {
    return localStorage.getItem("vocab_clone_server_token") || "";
  });

  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => {
    const saved = localStorage.getItem("vocab_clone_saved_accounts");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error("Failed to parse saved accounts:", e);
      }
    }
    return [];
  });

  const [localSyncKey, setLocalSyncKeyState] = useState<string>(() => {
    return localStorage.getItem("vocab_clone_local_sync_key") || "";
  });

  const [localSyncError, setLocalSyncError] = useState<boolean>(false);

  const setStorageMode = useCallback((mode: "server" | "local") => {
    setStorageModeState(mode);
    safeLocalStorageSetItem("vocab_clone_storage_mode", mode);
  }, []);

  const setLocalSyncKey = useCallback((key: string) => {
    setLocalSyncKeyState(key);
    safeLocalStorageSetItem("vocab_clone_local_sync_key", key);
    setLocalSyncError(false);
  }, []);

  // Helper to upsert saved account into list & localStorage
  const upsertSavedAccount = useCallback((token: string, user: LocalUser) => {
    setSavedAccounts(prev => {
      const filtered = prev.filter(acc => acc.token !== token && acc.user.id !== user.id && acc.user.email !== user.email);
      const updated: SavedAccount[] = [{ token, user, lastUsed: Date.now() }, ...filtered];
      safeLocalStorageSetItem("vocab_clone_saved_accounts", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Remove saved account by token or userId
  const removeSavedAccount = useCallback((targetTokenOrUserId: string) => {
    setSavedAccounts(prev => {
      const updated = prev.filter(acc => acc.token !== targetTokenOrUserId && acc.user.id !== targetTokenOrUserId);
      safeLocalStorageSetItem("vocab_clone_saved_accounts", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Synchronize serverToken & localUser to localStorage safely
  useEffect(() => {
    if (serverToken) {
      safeLocalStorageSetItem("vocab_clone_server_token", serverToken);
    } else {
      localStorage.removeItem("vocab_clone_server_token");
    }
  }, [serverToken]);

  useEffect(() => {
    if (localUser) {
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(localUser));
      if (serverToken) {
        setSavedAccounts(prev => {
          const existing = prev.find(acc => acc.token === serverToken);
          if (
            existing &&
            existing.user.id === localUser.id &&
            existing.user.username === localUser.username &&
            existing.user.displayName === localUser.displayName &&
            existing.user.avatarUrl === localUser.avatarUrl &&
            existing.user.passwordHint === localUser.passwordHint
          ) {
            return prev; // No change needed, prevent re-render
          }
          const filtered = prev.filter(acc => acc.token !== serverToken && acc.user.id !== localUser.id && acc.user.email !== localUser.email);
          const updated: SavedAccount[] = [{ token: serverToken, user: localUser, lastUsed: Date.now() }, ...filtered];
          safeLocalStorageSetItem("vocab_clone_saved_accounts", JSON.stringify(updated));
          return updated;
        });
      }
    } else {
      localStorage.removeItem("vocab_clone_local_user");
    }
  }, [localUser, serverToken]);

  // Check self-hosted server session on mount
  useEffect(() => {
    const checkServerSession = async () => {
      const savedToken = localStorage.getItem("vocab_clone_server_token");
      if (!savedToken) {
        if (storageMode === "server") {
          setIsAuthLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(resolveServerUrl("/api/auth/me"), {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setLocalUser(data.user);
            upsertSavedAccount(savedToken, data.user);
            setStorageMode("server");
            setLocalSyncError(false);
          }
        } else if (res.status === 401) {
          console.warn("Server session expired or invalid.");
          removeSavedAccount(savedToken);
          localStorage.removeItem("vocab_clone_server_token");
          localStorage.removeItem("vocab_clone_local_user");
          setServerToken("");
          setLocalUser(null);
        }
      } catch (err) {
        console.error("Failed to verify server session:", err);
      } finally {
        if (storageMode === "server") {
          setIsAuthLoading(false);
        }
      }
    };

    if (storageMode === "server") {
      checkServerSession();
    } else {
      setIsAuthLoading(false);
    }
  }, [storageMode, upsertSavedAccount, removeSavedAccount, setStorageMode]);

  const loginLocalServer = useCallback(async (username: string, password = ""): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(resolveServerUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, username, password }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch (_) {
        return { success: false, error: `Ошибка сервера (код статуса ${res.status})` };
      }
      if (!res.ok || !data.token) {
        return { success: false, error: data.error || `Ошибка входа (код статуса ${res.status})` };
      }
      await clearLocalUserDataCache();
      window.dispatchEvent(new CustomEvent("lectura:user_logout"));
      setServerToken(data.token);
      setLocalUser(data.user);
      upsertSavedAccount(data.token, data.user);
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(data.user));
      safeLocalStorageSetItem("vocab_clone_server_token", data.token);
      setStorageMode("server");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось подключиться к серверу" };
    }
  }, [upsertSavedAccount, setStorageMode]);

  const registerLocalServer = useCallback(async (username: string, password = "", passwordHint = "", avatarUrl = ""): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(resolveServerUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, username, password, passwordHint: passwordHint || undefined, avatarUrl: avatarUrl || undefined }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch (_) {
        return { success: false, error: `Ошибка сервера (код статуса ${res.status})` };
      }
      if (!res.ok || !data.token) {
        return { success: false, error: data.error || `Ошибка регистрации (код статуса ${res.status})` };
      }
      await clearLocalUserDataCache();
      window.dispatchEvent(new CustomEvent("lectura:user_logout"));
      setServerToken(data.token);
      setLocalUser(data.user);
      upsertSavedAccount(data.token, data.user);
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(data.user));
      safeLocalStorageSetItem("vocab_clone_server_token", data.token);
      setStorageMode("server");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось подключиться к серверу" };
    }
  }, [upsertSavedAccount, setStorageMode]);

  const updateProfile = useCallback(async (patch: { displayName?: string; avatarUrl?: string | null; passwordHint?: string | null }): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!serverToken) {
        return { success: false, error: "Не авторизован" };
      }
      const res = await fetch(resolveServerUrl("/api/auth/profile"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serverToken}`,
        },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        return { success: false, error: data.error || "Ошибка обновления профиля" };
      }
      setLocalUser(data.user);
      upsertSavedAccount(serverToken, data.user);
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(data.user));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось обновить профиль" };
    }
  }, [serverToken, upsertSavedAccount]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string, passwordHint?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!serverToken) {
        return { success: false, error: "Не авторизован" };
      }
      const res = await fetch(resolveServerUrl("/api/auth/change-password"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serverToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, passwordHint }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Ошибка смены пароля" };
      }
      if (data.passwordHint !== undefined && localUser) {
        const updated = { ...localUser, passwordHint: data.passwordHint };
        setLocalUser(updated);
        upsertSavedAccount(serverToken, updated);
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось сменить пароль" };
    }
  }, [serverToken, localUser, upsertSavedAccount]);

  const uploadAvatar = useCallback(async (avatarData: string): Promise<{ success: boolean; avatarUrl?: string; error?: string }> => {
    try {
      if (!serverToken) {
        return { success: false, error: "Не авторизован" };
      }
      const res = await fetch(resolveServerUrl("/api/auth/avatar-upload"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serverToken}`,
        },
        body: JSON.stringify({ avatarData }),
      });
      const data = await res.json();
      if (!res.ok || !data.avatarUrl) {
        return { success: false, error: data.error || "Ошибка загрузки аватара" };
      }
      if (localUser) {
        const updated = { ...localUser, avatarUrl: data.avatarUrl };
        setLocalUser(updated);
        upsertSavedAccount(serverToken, updated);
      }
      return { success: true, avatarUrl: data.avatarUrl };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось загрузить аватар" };
    }
  }, [serverToken, localUser, upsertSavedAccount]);

  const switchAccount = useCallback(async (targetToken: string): Promise<{ success: boolean; error?: string; is401?: boolean; expiredAccount?: SavedAccount }> => {
    const account = savedAccounts.find(a => a.token === targetToken);
    try {
      const res = await fetch(resolveServerUrl("/api/auth/me"), {
        headers: {
          Authorization: `Bearer ${targetToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          await clearLocalUserDataCache();
          window.dispatchEvent(new CustomEvent("lectura:user_logout"));
          setServerToken(targetToken);
          setLocalUser(data.user);
          upsertSavedAccount(targetToken, data.user);
          safeLocalStorageSetItem("vocab_clone_server_token", targetToken);
          safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(data.user));
          setStorageMode("server");
          return { success: true };
        }
      } else if (res.status === 401) {
        // Token expired/invalid
        removeSavedAccount(targetToken);
        return { success: false, is401: true, expiredAccount: account, error: "Сессия аккаунта истекла" };
      }
      return { success: false, error: `Ошибка при переключении (${res.status})` };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось переключить аккаунт" };
    }
  }, [savedAccounts, upsertSavedAccount, removeSavedAccount, setStorageMode]);

  const logout = useCallback(async (options?: { all?: boolean }) => {
    if (serverToken) {
      try {
        await fetch(resolveServerUrl("/api/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${serverToken}` },
        });
      } catch (err) {
        console.error("Server logout call failed:", err);
      }
    }

    await clearLocalUserDataCache();
    window.dispatchEvent(new CustomEvent("lectura:user_logout"));

    if (options?.all) {
      // Logout from all saved accounts
      localStorage.removeItem("vocab_clone_server_token");
      localStorage.removeItem("vocab_clone_local_user");
      localStorage.removeItem("vocab_clone_saved_accounts");
      setSavedAccounts([]);
      setServerToken("");
      setLocalUser(null);
      return;
    }

    // Single account logout: remove current token from savedAccounts
    const remaining = savedAccounts.filter(a => a.token !== serverToken);
    setSavedAccounts(remaining);
    safeLocalStorageSetItem("vocab_clone_saved_accounts", JSON.stringify(remaining));

    if (remaining.length > 0) {
      // Smart switch to next available account
      const nextAcc = remaining[0];
      setServerToken(nextAcc.token);
      setLocalUser(nextAcc.user);
      safeLocalStorageSetItem("vocab_clone_server_token", nextAcc.token);
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(nextAcc.user));
    } else {
      // No other accounts left
      localStorage.removeItem("vocab_clone_server_token");
      localStorage.removeItem("vocab_clone_local_user");
      setServerToken("");
      setLocalUser(null);
    }
  }, [serverToken, savedAccounts]);

  const activeUser = storageMode === "server" ? localUser : null;
  const isAuthenticated = !!activeUser || storageMode === "local";

  const contextValue = useMemo(() => ({
    user: activeUser,
    localUser,
    serverToken,
    storageMode,
    setStorageMode,
    localSyncKey,
    setLocalSyncKey,
    localSyncError,
    setLocalSyncError,
    isAuthLoading,
    isAuthenticated,
    savedAccounts,
    loginLocalServer,
    registerLocalServer,
    updateProfile,
    changePassword,
    uploadAvatar,
    switchAccount,
    removeSavedAccount,
    logout,
  }), [
    activeUser,
    localUser,
    serverToken,
    storageMode,
    setStorageMode,
    localSyncKey,
    setLocalSyncKey,
    localSyncError,
    setLocalSyncError,
    isAuthLoading,
    isAuthenticated,
    savedAccounts,
    loginLocalServer,
    registerLocalServer,
    updateProfile,
    changePassword,
    uploadAvatar,
    switchAccount,
    removeSavedAccount,
    logout,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
