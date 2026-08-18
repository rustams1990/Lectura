import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { Globe, X, Lightbulb, ArrowLeft, Loader2, KeyRound } from "lucide-react";

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

export default function AuthModal({ isOpen, onClose, onLocalServerLogin, initialUsername = "" }: AuthModalProps) {
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

  // Forgot password hint state
  const [forgotUsername, setForgotUsername] = useState<string>("");
  const [isHintLoading, setIsHintLoading] = useState<boolean>(false);
  const [hintResult, setHintResult] = useState<{ searched: boolean; hint: string | null } | null>(null);

  useEffect(() => {
    if (initialUsername) {
      setEmailOrUsername(initialUsername);
    }
  }, [initialUsername, isOpen]);

  const cleanLegacyFirebaseKeys = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("firebase:") || key.startsWith("persist:firebase"))) {
          localStorage.removeItem(key);
        }
      }
    } catch (_) {}
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem("i18nextLng", lang);
    } catch (_) {}
  };

  // Fetch hint for given username
  const fetchPasswordHint = async (usernameToQuery: string) => {
    const cleanQuery = usernameToQuery.trim();
    if (!cleanQuery) return;
    setIsHintLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`/api/auth/password-hint?username=${encodeURIComponent(cleanQuery)}`);
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

    setAuthError(null);
    setIsLoading(true);

    try {
      cleanLegacyFirebaseKeys();

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
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150">
        
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
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed max-h-36 overflow-y-auto">
                <p className="font-bold mb-1">{t('auth.error', '⚠️ Ошибка:')}</p>
                <p>{authError}</p>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/40 dark:border-zinc-800/80 space-y-3 text-left">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {t('auth.account', 'Аккаунт:')}
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
                      className="flex-1 text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isHintLoading || !forgotUsername.trim()}
                      className="px-3.5 py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                    >
                      {isHintLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                      <span>{t('auth.btn_get_hint', 'Показать')}</span>
                    </button>
                  </div>
                </div>

                {/* Hint result output card */}
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
            <div className="text-center space-y-2">
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

            {authError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-3 rounded-2xl text-[11px] text-red-650 dark:text-red-400 leading-relaxed max-h-36 overflow-y-auto">
                <p className="font-bold mb-1">{t('auth.error', '⚠️ Ошибка:')}</p>
                <p>{authError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
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
                          {["🦊", "🦉", "🐱", "🐼", "🚀", "👑", "⚡", "🌟", "🎨", "📚"].map((emoji) => (
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
                        <KeyRound className="w-3 h-3" />
                        <span>{t('auth.forgot_password', 'Забыли пароль?')}</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs transition duration-150 cursor-pointer disabled:opacity-50 shadow-md shadow-teal-600/10 mt-2"
                  >
                    {isLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>👤</span>
                    )}
                    <span>{isRegister ? t('auth.btn_register', 'Создать аккаунт') : t('auth.btn_login', 'Войти в аккаунт')}</span>
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
