import React, { useState } from "react";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useAuth } from "../context/AuthContext";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocalServerLogin: () => void;
}

const isLocalHostname = (): boolean => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.")
  );
};

export default function AuthModal({ isOpen, onClose, onLocalServerLogin }: AuthModalProps) {
  const { user: activeUser, setStorageMode, loginLocalServer, registerLocalServer } = useAuth();
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLocalServerRegister, setIsLocalServerRegister] = useState<boolean>(false);
  const [localServerEmail, setLocalServerEmail] = useState<string>("");
  const [localServerPassword, setLocalServerPassword] = useState<string>("");
  const [localServerName, setLocalServerName] = useState<string>("");
  const [isLocalServerAuthLoading, setIsLocalServerAuthLoading] = useState<boolean>(false);
  
  const [emailInput, setEmailInput] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [isEmailRegister, setIsEmailRegister] = useState<boolean>(false);
  const [emailAuthLoading, setEmailAuthLoading] = useState<boolean>(false);

  const [authModalTab, setAuthModalTab] = useState<"local" | "cloud">(() => {
    return isLocalHostname() ? "local" : "cloud";
  });

  const handleServerAuthSubmit = async (emailInputVal: string, passwordInputVal: string, nameInputVal: string, isRegisterVal: boolean) => {
    const email = emailInputVal.trim();
    const password = passwordInputVal.trim();
    const name = nameInputVal.trim();

    if (!email || !password) {
      setAuthError("Пожалуйста, введите email/логин и пароль.");
      return;
    }

    setAuthError(null);
    setIsLocalServerAuthLoading(true);

    try {
      if (auth.currentUser) {
        await auth.signOut();
      }

      const result = isRegisterVal
        ? await registerLocalServer(email || name, password)
        : await loginLocalServer(email, password);

      if (!result.success) {
        throw new Error(result.error || "Ошибка авторизации");
      }

      onLocalServerLogin();
      setLocalServerEmail("");
      setLocalServerPassword("");
      setLocalServerName("");
      onClose();
    } catch (err: any) {
      console.error("Local server auth error:", err);
      setAuthError(err.message || String(err));
    } finally {
      setIsLocalServerAuthLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150">
        {activeUser && (
          <button
            onClick={() => {
              onClose();
              setAuthError(null);
            }}
            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-base font-bold"
          >
            &times;
          </button>
        )}

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center mx-auto text-xl">
            🔑
          </div>
          <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
            Авторизация и Профиль
          </h3>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setAuthModalTab("local")}
            className={`flex-1 pb-3 text-xs font-black uppercase tracking-wider transition-colors ${
              authModalTab === "local"
                ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-500"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            }`}
          >
            💻 Локальный Профиль
          </button>
          <button
            onClick={() => setAuthModalTab("cloud")}
            className={`flex-1 pb-3 text-xs font-black uppercase tracking-wider transition-colors ${
              authModalTab === "cloud"
                ? "text-teal-600 dark:text-teal-400 border-b-2 border-teal-500"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            }`}
          >
            ☁️ Облако (Google / Email)
          </button>
        </div>

        {authError && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed max-h-36 overflow-y-auto">
            <p className="font-bold mb-1">⚠️ Ошибка:</p>
            <p className="mb-2">{authError}</p>
          </div>
        )}

        <div className="space-y-4">
          {authModalTab === "local" ? (
            <div className="space-y-4 pt-2">
              <div className="text-center space-y-1">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                  Войдите или зарегистрируйтесь на вашем локальном сервере CasaOS. Данные будут храниться и синхронизироваться через вашу собственную базу данных SQLite.
                </p>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3 text-left">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Профиль на Сервере:
                  </label>
                  <button
                    onClick={() => {
                      setIsLocalServerRegister(!isLocalServerRegister);
                      setAuthError(null);
                    }}
                    className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-bold underline transition cursor-pointer"
                  >
                    {isLocalServerRegister ? "Вход" : "Регистрация"}
                  </button>
                </div>

                <div className="space-y-2">
                  {isLocalServerRegister && (
                    <input
                      type="text"
                      value={localServerName}
                      onChange={(e) => setLocalServerName(e.target.value)}
                      placeholder="Ваше имя (например, Rustam)"
                      disabled={isLocalServerAuthLoading}
                      className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50 font-bold"
                    />
                  )}
                  <input
                    type="email"
                    value={localServerEmail}
                    onChange={(e) => setLocalServerEmail(e.target.value)}
                    placeholder="Email адрес или логин"
                    disabled={isLocalServerAuthLoading}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                  />
                  <input
                    type="password"
                    value={localServerPassword}
                    onChange={(e) => setLocalServerPassword(e.target.value)}
                    placeholder="Пароль"
                    disabled={isLocalServerAuthLoading}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        await handleServerAuthSubmit(localServerEmail, localServerPassword, localServerName, isLocalServerRegister);
                      }
                    }}
                  />

                  <button
                    onClick={async () => {
                      await handleServerAuthSubmit(localServerEmail, localServerPassword, localServerName, isLocalServerRegister);
                    }}
                    disabled={isLocalServerAuthLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs transition duration-150 cursor-pointer disabled:opacity-50 shadow-md shadow-teal-600/10"
                  >
                    {isLocalServerAuthLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>💻</span>
                    )}
                    <span>{isLocalServerRegister ? "Создать аккаунт на сервере" : "Войти в профиль сервера"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Option A: Google Sign In */}
              <div>
                <button
                  onClick={async () => {
                    setAuthError(null);
                    try {
                      await signInWithPopup(auth, googleProvider);
                      setStorageMode("cloud");
                      onClose();
                    } catch (err: any) {
                      console.error("Local PC Sign-In with popup error:", err);
                      setAuthError(err.message || String(err));
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs transition duration-150 cursor-pointer shadow-md shadow-teal-600/10"
                >
                  <span>☁️</span> Войти через Google Account
                </button>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
                <span className="flex-shrink mx-3 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest font-mono">или</span>
                <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
              </div>

              {/* Option B: Email & Password */}
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3 text-left">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Вход по Email:
                  </label>
                  <button
                    onClick={() => {
                      setIsEmailRegister(!isEmailRegister);
                      setAuthError(null);
                    }}
                    className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-bold underline transition cursor-pointer"
                  >
                    {isEmailRegister ? "Вход" : "Регистрация"}
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Email адрес"
                    disabled={emailAuthLoading}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                  />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Пароль (от 6 символов)"
                    disabled={emailAuthLoading}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                  />

                  <button
                    onClick={async () => {
                      const email = emailInput.trim();
                      const password = passwordInput.trim();
                      if (!email || !password) {
                        setAuthError("Пожалуйста, введите email и пароль.");
                        return;
                      }
                      if (password.length < 6) {
                        setAuthError("Пароль должен содержать не менее 6 символов.");
                        return;
                      }

                      setAuthError(null);
                      setEmailAuthLoading(true);
                      try {
                        if (isEmailRegister) {
                          await createUserWithEmailAndPassword(auth, email, password);
                        } else {
                          await signInWithEmailAndPassword(auth, email, password);
                        }
                        setStorageMode("cloud");
                        setEmailInput("");
                        setPasswordInput("");
                        onClose();
                      } catch (err: any) {
                        console.error("Email auth error:", err);
                        let friendlyMsg = err.message || String(err);
                        if (err.code === "auth/email-already-in-use") {
                          friendlyMsg = "Этот адрес почты уже зарегистрирован.";
                        } else if (err.code === "auth/invalid-email") {
                          friendlyMsg = "Неверный формат email адреса.";
                        } else if (err.code === "auth/operation-not-allowed") {
                          friendlyMsg = "Вход по Email отключен в настройках Firebase.";
                        } else if (err.code === "auth/weak-password") {
                          friendlyMsg = "Слишком простой пароль. Нужно не менее 6 символов.";
                        } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
                          friendlyMsg = "Неверный логин или пароль.";
                        }
                        setAuthError(friendlyMsg);
                      } finally {
                        setEmailAuthLoading(false);
                      }
                    }}
                    disabled={emailAuthLoading}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-zinc-700 hover:bg-zinc-800 active:scale-98 text-white font-bold text-xs transition duration-150 cursor-pointer disabled:opacity-50"
                  >
                    {emailAuthLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>🔒</span>
                    )}
                    <span>{isEmailRegister ? "Создать аккаунт и войти" : "Войти в облако"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
