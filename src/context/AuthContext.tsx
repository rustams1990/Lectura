import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../firebase";
import { safeLocalStorageSetItem } from "../utils";
import { clearLocalUserDataCache } from "../db";


export interface LocalUser {
  id: string;
  username: string;
}

interface AuthContextType {
  user: User | LocalUser | null;
  firebaseUser: User | null;
  localUser: LocalUser | null;
  serverToken: string;
  storageMode: "cloud" | "local" | "server";
  setStorageMode: (mode: "cloud" | "local" | "server") => void;
  localSyncKey: string;
  setLocalSyncKey: (key: string) => void;
  localSyncError: boolean;
  setLocalSyncError: (err: boolean) => void;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  loginLocalServer: (username: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  registerLocalServer: (username: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isLocalHostname(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("192.168.") || host.startsWith("10.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
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

  const [storageMode, setStorageModeState] = useState<"cloud" | "local" | "server">(() => {
    const saved = localStorage.getItem("vocab_clone_storage_mode");
    if (saved === "cloud" || saved === "local" || saved === "server") {
      return saved;
    }
    return isLocalHostname() ? "server" : "cloud";
  });

  const [serverToken, setServerToken] = useState<string>(() => {
    return localStorage.getItem("vocab_clone_server_token") || "";
  });

  const [localSyncKey, setLocalSyncKeyState] = useState<string>(() => {
    return localStorage.getItem("vocab_clone_local_sync_key") || "";
  });

  const [localSyncError, setLocalSyncError] = useState<boolean>(false);

  const setStorageMode = (mode: "cloud" | "local" | "server") => {
    setStorageModeState(mode);
    safeLocalStorageSetItem("vocab_clone_storage_mode", mode);
  };

  const setLocalSyncKey = (key: string) => {
    setLocalSyncKeyState(key);
    safeLocalStorageSetItem("vocab_clone_local_sync_key", key);
    setLocalSyncError(false);
  };

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
    } else {
      localStorage.removeItem("vocab_clone_local_user");
    }
  }, [localUser]);

  // Handle Firebase Auth Listener — only active in cloud mode
  // In server mode we skip Firebase entirely to avoid 5-15s network round-trip to Firebase servers
  useEffect(() => {
    if (storageMode !== "cloud") {
      // Not using Firebase: just make sure isAuthLoading is set to false
      // (checkServerSession useEffect below handles isAuthLoading for server mode)
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user && storageMode !== "cloud") {
        setStorageMode("cloud");
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, [storageMode]);

  // Check self-hosted server session on mount
  useEffect(() => {
    const checkServerSession = async () => {
      const t0 = performance.now();
      console.log("[Auth] checkServerSession START", new Date().toISOString());
      const savedToken = localStorage.getItem("vocab_clone_server_token");
      if (!savedToken) {
        console.log("[Auth] no saved token → setting isAuthLoading=false immediately");
        if (storageMode === "server") {
          setIsAuthLoading(false);
        }
        return;
      }
      console.log("[Auth] found saved token, fetching /api/auth/me...");
      try {
        const fetchStart = performance.now();
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });
        console.log(`[Auth] /api/auth/me responded in ${(performance.now() - fetchStart).toFixed(0)}ms, status=${res.status}`);
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setLocalUser(data.user);
            setStorageMode("server");
            setLocalSyncError(false);
          }
        } else {
          console.warn("Server session expired or invalid.");
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
        console.log(`[Auth] checkServerSession DONE in ${(performance.now() - t0).toFixed(0)}ms`);
      }
    };

    if (storageMode === "server") {
      checkServerSession();
    } else {
      setIsAuthLoading(false);
    }
  }, [storageMode, serverToken]);


  const loginLocalServer = async (username: string, password = ""): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
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
      setServerToken(data.token);
      setLocalUser(data.user);
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(data.user));
      safeLocalStorageSetItem("vocab_clone_server_token", data.token);
      setStorageMode("server");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось подключиться к серверу" };
    }
  };

  const registerLocalServer = async (username: string, password = ""): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/register", {
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
        return { success: false, error: data.error || `Ошибка регистрации (код статуса ${res.status})` };
      }
      setServerToken(data.token);
      setLocalUser(data.user);
      safeLocalStorageSetItem("vocab_clone_local_user", JSON.stringify(data.user));
      safeLocalStorageSetItem("vocab_clone_server_token", data.token);
      setStorageMode("server");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Не удалось подключиться к серверу" };
    }
  };

  const logout = async () => {
    if (storageMode === "cloud" && firebaseUser) {
      await firebaseSignOut(auth);
      setFirebaseUser(null);
    } else if (serverToken) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${serverToken}` },
        });
      } catch (err) {
        console.error("Server logout call failed:", err);
      }
      localStorage.removeItem("vocab_clone_server_token");
      localStorage.removeItem("vocab_clone_local_user");
      setServerToken("");
      setLocalUser(null);
    }
    await clearLocalUserDataCache();
    window.dispatchEvent(new CustomEvent("lectura:user_logout"));
  };

  const activeUser = storageMode === "cloud" ? firebaseUser : storageMode === "server" ? localUser : null;
  const isAuthenticated = !!activeUser || storageMode === "local";

  return (
    <AuthContext.Provider
      value={{
        user: activeUser,
        firebaseUser,
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
        loginLocalServer,
        registerLocalServer,
        logout,
      }}
    >
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
