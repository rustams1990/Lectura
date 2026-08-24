import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { Globe, X, Lightbulb, ArrowLeft, Loader2, Server, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { getServerBaseUrl, setServerBaseUrl, testServerConnection, resolveServerUrl } from "../utils/mobileServerBridge";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocalServerLogin: () => void;
  initialUsername?: string;
}

const UI_LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "uk", name: "Українська", flag: "🇺🇦" },
  { code: "zh", name: "简体中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
];

const DEFAULT_AVATARS = ["🦊", "🦉", "🐱", "🐼", "🚀", "👑", "⚡", "🌟", "🎨", "📚"];

export function AuthModalComponent({ isOpen, onClose, onLocalServerLogin, initialUsername = "" }: AuthModalProps) {
  const { loginLocalServer, registerLocalServer } = useAuth();
  const { t, i18n } = useTranslation();
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [isForgotMode, setIsForgotMode] = useState<boolean>(false);

  const [emailOrUsername, setEmailOrUsername] = useState<string>(initialUsername);
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [passwordHint, setPasswordHint] = useState<string>("");
  const [selectedAvatar, setSelectedAvatar] = useState<string>("🦊");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Server URL Configuration
  const [serverUrl, setServerUrlState] = useState<string>(() => getServerBaseUrl());
  const [isTestingServer, setIsTestingServer] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<{ ok?: boolean; message?: string; version?: string } | null>(null);
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);

  // Forgot password hint state
  const [forgotUsername, setForgotUsername] = useState<string>("");
  const [isHintLoading, setIsHintLoading] = useState<boolean>(false);
  const [hintResult, setHintResult] = useState<{ searched: boolean; hint: string | null } | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialUsername) {
        setEmailOrUsername(initialUsername);
      }
      setServerUrlState(getServerBaseUrl());
    }
  }, [isOpen, initialUsername]);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem("i18nextLng", lang);
    } catch (_) {}
  };

  const getLocalizedErrorMessage = (err: string | null | undefined): string => {
    if (!err) return "";
    const str = String(err);

    if (
      str === "INVALID_CREDENTIALS" ||
      str.includes("Неверный логин или пароль") ||
      str.toLowerCase().includes("invalid username or password") ||
      str.toLowerCase().includes("invalid credentials") ||
      str.toLowerCase().includes("invalid login")
    ) {
      return t("auth.error_invalid_credentials", "Invalid username or password");
    }

    if (
      str === "EMAIL_IN_USE" ||
      str.includes("уже зарегистрирован") ||
      str.includes("уже используется") ||
      str.toLowerCase().includes("already in use") ||
      str.toLowerCase().includes("already registered")
    ) {
      return t("auth.error_email_in_use", "This email address is already in use.");
    }

    if (
      str === "REQUIRED_FIELDS" ||
      str.includes("обязательны") ||
      str.toLowerCase().includes("required")
    ) {
      return t("auth.error_empty", "Please enter your email/username and password.");
    }

    if (
      str === "PASSWORD_TOO_SHORT" ||
      str.includes("не менее 6") ||
      str.includes("не менее 4") ||
      str.toLowerCase().includes("password must be at least")
    ) {
      return t("auth.error_password_length", "Password must be at least 6 characters long.");
    }

    if (
      str === "TOO_MANY_ATTEMPTS" ||
      str.includes("Слишком много попыток") ||
      str.toLowerCase().includes("too many attempts") ||
      str.toLowerCase().includes("too many requests")
    ) {
      return t("auth.error_too_many_attempts", "Too many login attempts. Please wait 15 minutes.");
    }

    if (
      str === "NETWORK_ERROR" ||
      str.includes("Не удалось подключиться к серверу") ||
      str.toLowerCase().includes("failed to fetch") ||
      str.toLowerCase().includes("network error")
    ) {
      return t("auth.error_network_failed", "Failed to connect to server.");
    }

    if (
      str === "SESSION_EXPIRED" ||
      str.includes("Сессия недействительна") ||
      str.includes("Сессия истекла") ||
      str.toLowerCase().includes("session expired")
    ) {
      return t("auth.error_session_expired", "Session expired. Please sign in again.");
    }

    return str;
  };

  const handleServerUrlChange = (val: string) => {
    setServerUrlState(val);
    setServerStatus(null);
    setServerBaseUrl(val);
  };

  const handleTestServer = async () => {
    if (!serverUrl.trim()) return;
    setIsTestingServer(true);
    setServerStatus(null);
    await setServerBaseUrl(serverUrl.trim());
    const res = await testServerConnection(serverUrl.trim());
    setServerStatus(res);
    setIsTestingServer(false);
  };

  // Fetch hint for given username
  const fetchPasswordHint = async (usernameToQuery: string) => {
    const cleanQuery = usernameToQuery.trim();
    if (!cleanQuery) return;
    setIsHintLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(resolveServerUrl(`/api/auth/password-hint?username=${encodeURIComponent(cleanQuery)}`));
      const data = await res.json();
      setHintResult({
        searched: true,
        hint: data && data.hint ? String(data.hint) : null,
      });
    } catch (err: any) {
      console.error("Fetch password hint error:", err);
      setHintResult({
        searched: true,
        hint: null,
      });
    } finally {
      setIsHintLoading(false);
    }
  };

  const handleOpenForgotMode = () => {
    setIsForgotMode(true);
    setAuthError(null);
    const initialUser = emailOrUsername.trim();
    setForgotUsername(initialUser);
    setHintResult(null);
    if (initialUser) {
      fetchPasswordHint(initialUser);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setAuthError(t('auth.error_empty', 'Пожалуйста, введите email/логин.'));
      return;
    }
    fetchPasswordHint(forgotUsername);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = emailOrUsername.trim();
    const cleanPass = password.trim();
    const cleanConfirm = confirmPassword.trim();
    const cleanHint = passwordHint.trim();

    if (!cleanUser || !cleanPass) {
      setAuthError(t('auth.error_empty', 'Пожалуйста, введите email/логин и пароль.'));
      return;
    }

    if (isRegister) {
      if (!cleanConfirm) {
        setAuthError(t('auth.error_empty_confirm', 'Пожалуйста, повторите пароль.'));
        return;
      }
      if (cleanPass !== cleanConfirm) {
        setAuthError(t('auth.error_passwords_dont_match', 'Пароли не совпадают.'));
        return;
      }
      if (cleanPass.length < 4) {
        setAuthError(t('auth.error_password_length', 'Пароль должен содержать не менее 4 символов.'));
        return;
      }
    }

    setIsLoading(true);
    setAuthError(null);

    try {
      // Ensure server URL is saved before making the network request
      if (serverUrl.trim()) {
        await setServerBaseUrl(serverUrl.trim());
      }

      const result = isRegister
        ? await registerLocalServer(cleanUser, cleanPass, cleanHint, selectedAvatar)
        : await loginLocalServer(cleanUser, cleanPass);

      if (!result.success) {
        throw new Error(result.error || "Ошибка авторизации");
      }

      onLocalServerLogin();
      setEmailOrUsername("");
      setPassword("");
      setConfirmPassword("");
      setPasswordHint("");
      setIsForgotMode(false);
      onClose();
    } catch (err: any) {
      console.error("Server auth error:", err);
      setAuthError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentLang = ["en", "de", "es", "fr", "it", "pl", "pt", "ru", "tr", "uk", "zh", "ja", "ko"].includes(i18n.language) ? i18n.language : (i18n.language?.slice(0, 2) || "en");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150 max-h-[95vh] overflow-y-auto custom-scrollbar">
        
        {/* Top Header: Unified Scalable Language Selector & Close */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 transition hover:border-teal-400/60">
            <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <select
              value={currentLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              aria-label="Interface Language"
              className="bg-transparent text-xs font-black text-zinc-700 dark:text-zinc-200 focus:outline-none cursor-pointer py-0.5"
            >
              {UI_LANGUAGES.map((lang) => (
                <option 
                  key={lang.code} 
                  value={lang.code}
                  className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              onClose();
              setAuthError(null);
              setIsForgotMode(false);
              setHintResult(null);
            }}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View Mode 1: Forgot Password Hint View */}
        {isForgotMode ? (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/50 flex items-center justify-center mx-auto text-xl text-amber-500">
                💡
              </div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
                {t('auth.forgot_password_title', 'Подсказка к паролю')}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal px-2">
                {t('auth.forgot_password_desc', 'Введите логин или email, чтобы увидеть подсказку к вашему паролю.')}
              </p>
            </div>

            {authError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed">
                <p className="font-bold mb-1">{t('auth.error', '⚠️ Ошибка:')}</p>
                <p>{getLocalizedErrorMessage(authError)}</p>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-3.5 text-left">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3">
                <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  {t('auth.forgot_input_label', 'Ваш логин или email:')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={forgotUsername}
                    onChange={(e) => {
                      setForgotUsername(e.target.value);
                      setHintResult(null);
                    }}
                    placeholder={t('auth.placeholder_email', 'Email адрес или логин')}
                    disabled={isHintLoading}
                    autoFocus
                    className="flex-1 text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 dark:text-zinc-100 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isHintLoading || !forgotUsername.trim()}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                  >
                    {isHintLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>{t('auth.btn_find_hint', 'Найти')}</span>
                    )}
                  </button>
                </div>

                {hintResult && (
                  <div className="pt-2 animate-in fade-in zoom-in-95 duration-150">
                    {hintResult.hint ? (
                      <div className="p-3.5 bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-600/40 rounded-xl text-left space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-black text-[11px]">
                          <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('auth.hint_found_title', 'Подсказка к вашему паролю:')}</span>
                        </div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-amber-100 pl-5 break-words select-all">
                          «{hintResult.hint}»
                        </p>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-left space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 font-black text-[11px]">
                          <Lightbulb className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{t('auth.no_hint_title', 'Подсказка не найдена')}</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pl-5 leading-normal">
                          {t('auth.no_hint_desc', 'Подсказка для этого аккаунта не была настроена.')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsForgotMode(false);
                  setAuthError(null);
                  if (forgotUsername.trim()) {
                    setEmailOrUsername(forgotUsername.trim());
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('auth.btn_back_to_login', 'Вернуться к входу')}</span>
              </button>
            </form>
          </div>
        ) : (
          /* View Mode 2: Standard Login & Registration Forms */
          <>
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center mx-auto text-xl">
                🔑
              </div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
                {isRegister ? t('auth.title_register', 'Создать профиль') : t('auth.title', 'Вход в профиль')}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal px-2">
                {t('auth.local_description', 'Войдите или создайте аккаунт, чтобы сохранять материалы и синхронизировать прогресс чтения между устройствами.')}
              </p>
            </div>

            {/* Server Connection Selector Card (Native Mobile Only) */}
            {Capacitor.isNativePlatform() && (
              <div className="bg-zinc-50 dark:bg-zinc-950/80 p-3 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/80 space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 font-bold text-[11px]">
                    <Server className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>{t('auth.serverSettings.title', 'Lectura Server (LAN / IP):')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowServerConfig(!showServerConfig)}
                    className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-bold cursor-pointer"
                  >
                    {showServerConfig ? t('auth.serverSettings.hide', 'Hide') : t('auth.serverSettings.change', 'Change')}
                  </button>
                </div>

                {showServerConfig ? (
                  <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={serverUrl}
                        onChange={(e) => handleServerUrlChange(e.target.value)}
                        placeholder={t('auth.serverSettings.autoDetect', 'Auto-detect (Current Host)')}
                        className="flex-1 text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleTestServer}
                        disabled={isTestingServer}
                        className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isTestingServer ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        <span>{t('auth.serverSettings.test', 'Test')}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleServerUrlChange('')}
                        className="text-[10px] px-2 py-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-sans font-bold hover:bg-teal-100 dark:hover:bg-teal-950 transition cursor-pointer"
                      >
                        ⚡ {t('auth.serverSettings.autoDetect', 'Auto-detect')}
                      </button>
                      {typeof window !== 'undefined' && window.location.origin && (
                        <button
                          type="button"
                          onClick={() => handleServerUrlChange(window.location.origin)}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono hover:bg-teal-100 dark:hover:bg-teal-950 transition cursor-pointer"
                        >
                          {window.location.origin}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50">
                    <span className="truncate">{serverUrl || getServerBaseUrl()}</span>
                    <button
                      type="button"
                      onClick={handleTestServer}
                      disabled={isTestingServer}
                      className="text-[10px] text-teal-600 dark:text-teal-400 font-sans font-bold hover:underline cursor-pointer flex items-center gap-1 shrink-0 ml-2"
                    >
                      {isTestingServer ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      <span>{t('auth.serverSettings.check', 'Check')}</span>
                    </button>
                  </div>
                )}

                {serverStatus && (
                  <div className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg ${
                    serverStatus.ok
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50"
                      : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50"
                  }`}>
                    {serverStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{serverStatus.message} {serverStatus.version ? `(${serverStatus.version})` : ''}</span>
                  </div>
                )}
              </div>
            )}

            {authError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed max-h-36 overflow-y-auto">
                <p className="font-bold mb-1">{t('auth.error', '⚠️ Ошибка:')}</p>
                <p>{getLocalizedErrorMessage(authError)}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 pt-1">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3 text-left">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {isRegister ? t('auth.new_account', 'Новый аккаунт:') : t('auth.account', 'Аккаунт:')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(!isRegister);
                      setConfirmPassword("");
                      setPasswordHint("");
                      setAuthError(null);
                    }}
                    className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-bold underline transition cursor-pointer"
                  >
                    {isRegister ? t('auth.login', 'Уже есть аккаунт? Войти') : t('auth.register', 'Регистрация')}
                  </button>
                </div>

                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={emailOrUsername}
                    onChange={(e) => setEmailOrUsername(e.target.value)}
                    placeholder={t('auth.placeholder_email', 'Email адрес или логин')}
                    disabled={isLoading}
                    autoFocus
                    className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.placeholder_password', 'Пароль')}
                    disabled={isLoading}
                    className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                  />
                  {isRegister && (
                    <>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('auth.placeholder_confirm_password', 'Повторите пароль')}
                        disabled={isLoading}
                        className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                      />
                      <input
                        type="text"
                        value={passwordHint}
                        onChange={(e) => setPasswordHint(e.target.value)}
                        placeholder={t('auth.placeholder_password_hint', 'Подсказка к паролю (например: девичья фамилия матери)')}
                        disabled={isLoading}
                        className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                      />
                      <div className="space-y-1 pt-0.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">
                          {t('profile.avatar', 'Аватар:')}
                        </label>
                        <div className="flex gap-1.5 overflow-x-auto py-1 custom-scrollbar">
                          {DEFAULT_AVATARS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => setSelectedAvatar(emoji)}
                              className={`w-7 h-7 rounded-full text-xs flex items-center justify-center cursor-pointer transition shrink-0 ${
                                selectedAvatar === emoji
                                  ? "bg-teal-100 dark:bg-teal-950 border-2 border-teal-500 scale-110 shadow-xs"
                                  : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100"
                              }`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {!isRegister && (
                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={handleOpenForgotMode}
                        className="text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Lightbulb className="w-3 h-3" />
                        <span>{t('auth.forgotPassword', t('auth.forgot_password', 'Forgot password?'))}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white font-black text-xs transition cursor-pointer shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('common.processing', 'Обработка...')}</span>
                  </>
                ) : (
                  <span>{isRegister ? t('auth.btn_register', 'Создать профиль') : t('auth.btn_login', 'Войти')}</span>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const AuthModal = React.memo(AuthModalComponent);
export default AuthModal;
