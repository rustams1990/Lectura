import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { 
  X, Check, User, Key, Upload, Lightbulb, Lock, 
  ShieldCheck, Loader2, RefreshCw, Sparkles, Image as ImageIcon, Trash2
} from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AVATAR_PRESETS = [
  "🦊", "🦉", "🐱", "🐼", "🦁", "🐨", "🚀", "👑", 
  "⚡", "🌟", "🎨", "📚", "☕", "🎮", "🎧", "🎯"
];

// Helper to compress image client-side to max 256x256 WebP/JPEG
export async function compressImageToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Canvas context not available"));
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Try webp first, fallback to jpeg
        try {
          const dataUrl = canvas.toDataURL("image/webp", 0.85);
          resolve(dataUrl);
        } catch (_) {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image for compression"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// User Avatar Display Helper Component
export function UserAvatarDisplay({ 
  avatarUrl, 
  name, 
  size = "md",
  className = "" 
}: { 
  avatarUrl?: string | null; 
  name?: string; 
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClasses = {
    xs: "w-5 h-5 text-[10px]",
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-14 h-14 text-2xl",
    xl: "w-20 h-20 text-4xl"
  };

  const isImg = avatarUrl && (
    avatarUrl.startsWith("data:image") || 
    avatarUrl.startsWith("http") || 
    avatarUrl.startsWith("/api/") ||
    avatarUrl.startsWith("/uploads/") ||
    avatarUrl.includes(".png") ||
    avatarUrl.includes(".jpg") ||
    avatarUrl.includes(".webp")
  );

  if (isImg) {
    return (
      <img
        src={avatarUrl}
        alt={name || "User avatar"}
        className={`rounded-full object-cover border border-teal-500/30 bg-zinc-100 dark:bg-zinc-800 shrink-0 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  if (avatarUrl) {
    return (
      <div className={`rounded-full bg-teal-100 dark:bg-teal-950/60 border border-teal-500/30 text-teal-800 dark:text-teal-200 flex items-center justify-center font-bold select-none shrink-0 ${sizeClasses[size]} ${className}`}>
        {avatarUrl}
      </div>
    );
  }

  const initial = (name || "U").substring(0, 1).toUpperCase();
  return (
    <div className={`rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-black select-none shrink-0 shadow-xs ${sizeClasses[size]} ${className}`}>
      {initial}
    </div>
  );
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, updateProfile, changePassword, uploadAvatar } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"general" | "security">("general");

  // General tab state
  const [displayName, setDisplayName] = useState<string>("");
  const [selectedAvatar, setSelectedAvatar] = useState<string>("");
  const [passwordHint, setPasswordHint] = useState<string>("");
  const [isSavingGeneral, setIsSavingGeneral] = useState<boolean>(false);

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [securityPasswordHint, setSecurityPasswordHint] = useState<string>("");
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.username || "");
      setSelectedAvatar(user.avatarUrl || "");
      setPasswordHint(user.passwordHint || "");
      setSecurityPasswordHint(user.passwordHint || "");
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast(t('profile.invalid_image_type', 'Please select an image file (PNG, JPEG, WebP)'), 'error');
      return;
    }
    try {
      const compressedDataUrl = await compressImageToDataUrl(file, 256);
      setSelectedAvatar(compressedDataUrl);
      showToast(t('profile.image_ready', 'Image ready to save'), 'info');
    } catch (err: any) {
      showToast(err.message || 'Image compression failed', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGeneral(true);
    try {
      let finalAvatarUrl = selectedAvatar;
      if (selectedAvatar && selectedAvatar.startsWith("data:image")) {
        const uploadRes = await uploadAvatar(selectedAvatar);
        if (!uploadRes.success) {
          throw new Error(uploadRes.error || "Avatar upload error");
        }
        finalAvatarUrl = uploadRes.avatarUrl || selectedAvatar;
      }

      const res = await updateProfile({
        displayName: displayName.trim() || undefined,
        avatarUrl: finalAvatarUrl || null,
        passwordHint: passwordHint.trim() || null,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to update profile");
      }

      showToast(t('profile.saved_success', 'Profile saved successfully!'), 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);

    if (!currentPassword) {
      setSecurityError(t('profile.error_current_password_empty', 'Please enter your current password'));
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setSecurityError(t('profile.error_new_password_length', 'New password must be at least 6 characters long'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityError(t('profile.error_passwords_mismatch', 'Passwords do not match'));
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await changePassword(currentPassword, newPassword, securityPasswordHint.trim() || undefined);
      if (!res.success) {
        throw new Error(res.error || "Password change failed");
      }
      showToast(t('profile.password_changed', 'Password changed successfully!'), 'success');
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (err: any) {
      setSecurityError(err.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center text-lg">
              👤
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
                {t('profile.title', 'Profile Settings')}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {user.email || user.username}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "general"
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t('profile.tab_general', 'General & Avatar')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "security"
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t('profile.tab_security', 'Password & Security')}</span>
          </button>
        </div>

        {/* Tab 1: General & Avatar */}
        {activeTab === "general" && (
          <form onSubmit={handleSaveGeneral} className="space-y-4">
            {/* Avatar Picker */}
            <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/50 dark:border-zinc-800/80 space-y-3 text-left">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('profile.avatar', 'Profile Avatar:')}
                </label>
                {selectedAvatar && (
                  <button
                    type="button"
                    onClick={() => setSelectedAvatar("")}
                    className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t('profile.reset_avatar', 'Reset')}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <UserAvatarDisplay
                    avatarUrl={selectedAvatar}
                    name={displayName || user.username}
                    size="lg"
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block font-medium">
                    {t('profile.avatar_desc', 'Choose a preset emoji or upload your own photo:')}
                  </span>
                  
                  {/* Upload photo button */}
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-teal-400 dark:hover:border-teal-500 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{t('profile.upload_photo', 'Upload Photo')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Emoji Presets Grid */}
              <div className="pt-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-1.5">
                  {t('profile.presets', 'Presets:')}
                </span>
                <div className="flex flex-wrap gap-1.5 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
                  {AVATAR_PRESETS.map((preset) => {
                    const isSelected = selectedAvatar === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSelectedAvatar(preset)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all active:scale-95 cursor-pointer ${
                          isSelected
                            ? "bg-teal-100 dark:bg-teal-950 border-2 border-teal-500 scale-110 shadow-xs"
                            : "bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-transparent"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Display Name Input */}
            <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/50 dark:border-zinc-800/80 space-y-3 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('profile.display_name', 'Display Name:')}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('profile.placeholder_display_name', 'Your name or nickname')}
                  className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                />
              </div>

              {/* Password Hint Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-amber-500" />
                  <span>{t('auth.password_hint_label', 'Password hint:')}</span>
                </label>
                <input
                  type="text"
                  value={passwordHint}
                  onChange={(e) => setPasswordHint(e.target.value)}
                  placeholder={t('auth.placeholder_password_hint', "Password hint (e.g. mother's maiden name or favorite book)")}
                  className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                {t('profile.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={isSavingGeneral}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-black text-xs transition cursor-pointer shadow-md shadow-teal-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingGeneral ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{t('profile.save_changes', 'Save Changes')}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Security & Password Change */}
        {activeTab === "security" && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            {securityError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl text-[11px] text-red-600 dark:text-red-400">
                {securityError}
              </div>
            )}

            <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100/50 dark:border-zinc-800/80 space-y-3 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('profile.current_password', 'Current Password:')}
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('profile.new_password', 'New Password (min 6 characters):')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('auth.placeholder_confirm_password', 'Confirm password:')}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-amber-500" />
                  <span>{t('auth.password_hint_label', 'New password hint (optional):')}</span>
                </label>
                <input
                  type="text"
                  value={securityPasswordHint}
                  onChange={(e) => setSecurityPasswordHint(e.target.value)}
                  placeholder={t('auth.placeholder_password_hint', "Password hint (e.g. mother's maiden name or favorite book)")}
                  className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                {t('profile.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={isChangingPassword}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-black text-xs transition cursor-pointer shadow-md shadow-teal-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isChangingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{t('profile.btn_change_password', 'Change Password')}</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
