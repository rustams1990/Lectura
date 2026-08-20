import React, { useState, useEffect, useMemo } from "react";
import { Lesson, LessonType, ReaderSettings, Playlist } from "../types";
import { safeJsonParse, safeLocalStorageSetItem } from "../utils";
import { resolveTargetLanguage } from "../utils/languageUtils";
import { LANGUAGES_SUPPORTED } from "../data";
import { resolveApiUrl } from "../utils/apiConfig";
import {
  PlusCircle,
  FileText,
  Check,
  Music,
  Youtube,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  X,
  Book,
  Smile,
  Star,
  Heart,
  Compass,
  Type,
  Plus,
  FileUp,
  UploadCloud,
  Wand2,
  Globe,
  Pin,
  BookOpen,
  BookMarked,
  GraduationCap,
  Pencil,
  Trash2,
  Podcast,
  Radio,
  Headphones,
  Zap,
  ListVideo,
  Layers,
  Search,
  CheckSquare,
  Square,
  Film
} from "lucide-react";

import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { executeAiWithFailover, getOrCreateAiProfiles } from "../services/aiFailoverService";
import { whisperQueueService } from "../services/whisperQueueService";

export const ICON_MAP: Record<string, React.ComponentType<any>> = {
  youtube: Youtube,
  podcast: Podcast,
  radio: Radio,
  headphones: Headphones,
  book: Book,
  bookOpen: BookOpen,
  bookMarked: BookMarked,
  graduation: GraduationCap,
  article: FileText,
  music: Music,
  heart: Heart,
  star: Star,
  smile: Smile,
  compass: Compass,
  globe: Globe,
  pin: Pin,
  type: Type
};

export const getCategoryIcon = (iconKey: string, categoryName: string): React.ComponentType<any> => {
  if (iconKey && ICON_MAP[iconKey]) {
    return ICON_MAP[iconKey];
  }
  const name = (categoryName || "").toLowerCase();
  if (name.includes("подкаст") || name.includes("podcast") || name.includes("аудио")) {
    return Podcast;
  }
  if (name.includes("lectura") || name.includes("read") || name.includes("чтение")) {
    return BookOpen;
  }
  if (name.includes("книг") || name.includes("book")) {
    return Book;
  }
  return ICON_MAP.type || Type;
};

export const getCategoryDisplayName = (
  typeId?: string,
  typeName?: string,
  t?: any
): string => {
  const translate = (key: string, def: string) => {
    if (t) return t(key, def);
    return def;
  };

  const id = (typeId || "").toLowerCase();
  if (id === "youtube") return "YouTube";
  if (id === "podcast") return translate("library.podcast", "Podcast");
  if (id === "book") return translate("library.book", "Book");
  if (id === "article") return translate("library.article", "Article");
  if (id === "comic") return translate("library.comic", "Comic");

  const name = (typeName || "").toLowerCase();
  if (name.includes("книг") || name === "book") return translate("library.book", "Book");
  if (name.includes("стать") || name === "article") return translate("library.article", "Article");
  if (name.includes("комикс") || name === "comic") return translate("library.comic", "Comic");
  if (name.includes("подкаст") || name === "podcast") return translate("library.podcast", "Podcast");
  if (name.includes("ютуб") || name.includes("youtube")) return "YouTube";

  if (typeName && typeName.trim()) return typeName;
  return translate("library.book", "Book");
};

interface ImportLessonFormProps {
  onAddLesson: (lesson: Lesson, images?: Record<string, { dataUrl: string; width: string; height: string }>) => void;
  onCancel: () => void;
  editingLesson?: Lesson | null;
  lessonTypes: LessonType[];
  onCreateLessonType: (newType: LessonType) => void;
  onDeleteLessonType?: (id: string) => void;
  onUpdateLessonType?: (updatedType: LessonType) => void;
  initialWebUrl?: string | null;
  settings?: ReaderSettings;
  defaultTargetLanguage?: string;
  playlists?: Playlist[];
  lessons?: Lesson[];
  onAddPlaylist?: (playlist: Playlist) => void;
  onUpdatePlaylist?: (playlist: Playlist) => void;
}

export default function ImportLessonForm({
  onAddLesson,
  onCancel,
  editingLesson,
  lessonTypes,
  onCreateLessonType,
  onDeleteLessonType,
  onUpdateLessonType,
  initialWebUrl,
  settings,
  defaultTargetLanguage,
  playlists = [],
  lessons = [],
  onAddPlaylist,
  onUpdatePlaylist
}: ImportLessonFormProps) {
  const { t, i18n } = useTranslation();
  const { user: activeUser } = useAuth();
  const { showToast } = useToast();
  // Navigation: standard, youtube or file
  const [activeTab, setActiveTab] = useState<"standard" | "youtube" | "file" | "url">(
    editingLesson ? "standard" : (initialWebUrl ? "url" : "file")
  );

  const handleWhisperQueueSubmit = async () => {
    const url = youtubeUrlInput.trim();
    if (!url) {
      showToast(t('import.error_empty_url', 'Please enter a valid YouTube URL'), 'error');
      return;
    }

    try {
      await whisperQueueService.enqueueTask({
        sourceUrl: url,
        sourceType: "youtube",
        title: title.trim() || "YouTube Video",
        language: targetLanguage || "auto",
        userId: activeUser?.id || "default_user",
        model: (settings as any)?.whisperModel || "base",
        threads: (settings as any)?.whisperThreads || 2,
        vad: (settings as any)?.whisperVad !== false,
      });
      showToast(t('import.whisper_queued_toast', 'Task added to Faster-Whisper background queue ⚡'), 'success');
      onCancel(); // Non-blocking close!
    } catch (err: any) {
      showToast(err.message || 'Failed to queue Whisper task', 'error');
    }
  };

  const handlePodcastWhisperSubmit = async () => {
    const url = webUrlInput.trim();
    if (!url) {
      showToast(t('import.error_empty_podcast_url', 'Please enter a valid Podcast or Apple Podcasts URL'), 'error');
      return;
    }

    try {
      await whisperQueueService.enqueueTask({
        sourceUrl: url,
        sourceType: "podcast",
        title: title.trim() || "Podcast Episode",
        language: targetLanguage || "auto",
        userId: activeUser?.id || "default_user",
        model: (settings as any)?.whisperModel || "base",
        threads: (settings as any)?.whisperThreads || 2,
        vad: (settings as any)?.whisperVad !== false,
      });
      showToast(t('import.whisper_queued_toast', 'Task added to Faster-Whisper background queue ⚡'), 'success');
      onCancel(); // Non-blocking close!
    } catch (err: any) {
      showToast(err.message || 'Failed to queue Whisper task', 'error');
    }
  };

  const [title, setTitle] = useState(editingLesson?.title || "");
  const [text, setText] = useState(editingLesson?.text || "");
  const [targetLanguage, setTargetLanguage] = useState(() => {
    if (editingLesson?.targetLanguage) return editingLesson.targetLanguage;
    if (defaultTargetLanguage && defaultTargetLanguage !== "All") return defaultTargetLanguage;
    const globalTarget = localStorage.getItem("vocab_global_target_language");
    if (globalTarget && globalTarget !== "All") return globalTarget;
    return localStorage.getItem("vocab_default_target_language") || "Spanish";
  });
  const [translationLanguage, setTranslationLanguage] = useState(() => {
    if (editingLesson?.translationLanguage) return editingLesson.translationLanguage;
    const remembered = localStorage.getItem("vocab_default_translation_language");
    if (remembered) return remembered;
    return resolveTargetLanguage(targetLanguage, null, null, i18n.language);
  });

  useEffect(() => {
    if (!editingLesson && defaultTargetLanguage && defaultTargetLanguage !== "All") {
      setTargetLanguage(defaultTargetLanguage);
    }
  }, [defaultTargetLanguage, editingLesson]);

  const [savedTargetLang, setSavedTargetLang] = useState(
    localStorage.getItem("vocab_default_target_language") || "Spanish"
  );
  const [savedTranslationLang, setSavedTranslationLang] = useState(
    localStorage.getItem("vocab_default_translation_language") || ""
  );

  const isTargetLanguageRemembered = targetLanguage === savedTargetLang;
  const isTranslationLanguageRemembered = Boolean(savedTranslationLang && translationLanguage === savedTranslationLang);

  const handleRememberTargetLanguage = () => {
    safeLocalStorageSetItem("vocab_default_target_language", targetLanguage);
    setSavedTargetLang(targetLanguage);
  };

  const handleRememberTranslationLanguage = () => {
    safeLocalStorageSetItem("vocab_default_translation_language", translationLanguage);
    setSavedTranslationLang(translationLanguage);
  };
  
  // Website URL import states
  const [webUrlInput, setWebUrlInput] = useState(initialWebUrl || "");
  const [isWebLoading, setIsWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [webSuccess, setWebSuccess] = useState<string | null>(null);

  // Audio states and control flags
  const [audioUrl, setAudioUrl] = useState<string | null>(editingLesson?.audioUrl || null);
  const [audioBase64, setAudioBase64] = useState<string | null>(editingLesson?.audioBase64 || null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioRawFile, setAudioRawFile] = useState<File | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>("audio/mp3");
  const [isTranscribingAudio, setIsTranscribingAudio] = useState<boolean>(false);
  const [generatingTts, setGeneratingTts] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const [coverUrl, setCoverUrl] = useState(editingLesson?.coverUrl || "");
  const [isCoverLoading, setIsCoverLoading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(editingLesson?.youtubeId || null);
  const [youtubeDuration, setYoutubeDuration] = useState<number | null>(editingLesson?.youtubeDuration || null);
  const [channelName, setChannelName] = useState<string | null>(editingLesson?.channelName || (editingLesson as any)?.channelTitle || null);
  const [channelAvatarUrl, setChannelAvatarUrl] = useState<string | null>(editingLesson?.channelAvatarUrl || null);
  const [channelUrl, setChannelUrl] = useState<string>(editingLesson?.channelUrl || "");
  const [isResolvingChannel, setIsResolvingChannel] = useState<boolean>(false);
  const [webScreenshotAsCover, setWebScreenshotAsCover] = useState(true);

  // Existing channels from library for autocomplete/instant matching
  const existingChannels = useMemo(() => {
    const map = new Map<string, { name: string; avatarUrl?: string | null; channelUrl?: string | null }>();
    (lessons || []).forEach((l) => {
      const name = l.channelName?.trim() || (l as any).channelTitle?.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name,
            avatarUrl: l.channelAvatarUrl || null,
            channelUrl: l.channelUrl || null,
          });
        } else {
          const existing = map.get(key)!;
          if (!existing.avatarUrl && l.channelAvatarUrl) {
            existing.avatarUrl = l.channelAvatarUrl;
          }
          if (!existing.channelUrl && l.channelUrl) {
            existing.channelUrl = l.channelUrl;
          }
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lessons]);

  const handleResolveChannel = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl !== undefined ? overrideUrl : channelUrl).trim();
    if (!targetUrl) {
      showToast(t('import.channel_url_required', 'Пожалуйста, введите ссылку на YouTube канал'), 'error');
      return;
    }
    setIsResolvingChannel(true);
    try {
      const res = await fetch(resolveApiUrl("/api/youtube/channel-info"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          channelUrl: targetUrl,
          channelName: channelName || undefined,
          youtubeId: youtubeId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const title = data.title || data.channelName;
        const avatar = data.avatar || data.channelAvatarUrl;
        const cleanUrl = data.channelUrl || targetUrl;

        if (title) setChannelName(title);
        if (avatar) setChannelAvatarUrl(avatar);
        if (cleanUrl) setChannelUrl(cleanUrl);

        showToast(
          t('import.channel_found', 'Канал успешно найден: {{name}}', { name: title || 'YouTube' }),
          'success'
        );
      } else {
        showToast(
          data.error || t('import.channel_not_found', 'Не удалось найти информацию о YouTube канале. Проверьте ссылку.'),
          'error'
        );
      }
    } catch (e) {
      console.error("Error resolving channel:", e);
      showToast(
        t('import.channel_resolve_error', 'Ошибка при обращении к серверу для поиска канала.'),
        'error'
      );
    } finally {
      setIsResolvingChannel(false);
    }
  };

  const handleChannelNameChange = (val: string) => {
    setChannelName(val);
    const match = existingChannels.find((c) => c.name.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      if (match.avatarUrl && !channelAvatarUrl) setChannelAvatarUrl(match.avatarUrl);
      if (match.channelUrl && !channelUrl) setChannelUrl(match.channelUrl);
    }
  };

  // File import states
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSuccess, setFileSuccess] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importImages, setImportImages] = useState(false);
  const [pendingImages, setPendingImages] = useState<Record<string, { dataUrl: string; width: string; height: string }>>({});

  const [selectedType, setSelectedType] = useState<string>(
    editingLesson?.lessonType ||
    (activeTab === "youtube" ? "youtube" :
      (editingLesson?.audioUrl || editingLesson?.audioBase64 ? "podcast" : "book"))
  );

  const [difficulty, setDifficulty] = useState<string>(editingLesson?.difficulty || "");
  const [difficultyExplanation, setDifficultyExplanation] = useState<string>(editingLesson?.difficultyExplanation || "");


  const performWebImport = async (url: string) => {
    console.log("DEBUG [ImportLessonForm]: starting performWebImport for url:", url);
    setIsWebLoading(true);
    setWebError(null);
    setWebSuccess(null);

    try {
      const userApiKey = settings?.geminiApiKey || localStorage.getItem("vocab_clone_gemini_key") || "";
      const response = await fetch(resolveApiUrl("/api/import-url"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": userApiKey,
        },
        body: JSON.stringify({
          url: url.trim(),
          aiProvider: settings?.aiProvider || "gemini",
          localAiUrl: settings?.localAiUrl || "http://localhost:11434/api/generate",
          localAiModel: settings?.localAiModel || "phi3.5",
        }),
      });

      const data = await safeJsonParse(response);
      console.log("DEBUG [ImportLessonForm]: /api/import-url response status:", response.status, "data:", data);
      if (!response.ok) {
        throw new Error(data.error || "Failed to extract article/podcast from the specified URL");
      }

      setTitle(data.title || "Podcast / Web Article");
      setText(data.text || "");

      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
      }
      if (data.audioBase64) {
        setAudioBase64(data.audioBase64);
      }
      if (data.title) {
        setAudioFileName(data.title);
      }

      // Automatically set lesson type to "podcast" if audio is attached or returned as podcast
      const targetType = data.lessonType || (data.audioUrl || data.audioBase64 || url.toLowerCase().includes("podcast") ? "podcast" : "article");
      setSelectedType(targetType);

      // Cover image assignment
      if (data.coverUrl) {
        setCoverUrl(data.coverUrl);
      } else if (webScreenshotAsCover) {
        setCoverUrl(`https://api.microlink.io/?url=${encodeURIComponent(url.trim())}&screenshot=true&embed=screenshot.url`);
      } else {
        setCoverUrl("");
      }
      
      const wordCount = data.text ? data.text.split(/\s+/).filter(Boolean).length : 0;
      setWebSuccess(t('import.web_success', '✓ Successfully imported! {{audioNote}}Extracted {{count}} words. Check details below.', { audioNote: data.audioUrl ? t('import.audio_attached_note', 'Audio attached. ') : '', count: wordCount }));
    } catch (err: any) {
      console.error("DEBUG [ImportLessonForm]: web import error:", err);
      setWebError(err.message || t('import.web_error_default', 'Connection or parsing error. Make sure URL is accessible.'));
    } finally {
      setIsWebLoading(false);
    }
  };

  const handleWebImport = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!webUrlInput.trim()) {
      setWebError(t('import.enter_url_err', 'Enter website/article URL'));
      return;
    }
    await performWebImport(webUrlInput);
  };

  useEffect(() => {
    console.log("DEBUG [ImportLessonForm]: useEffect mounted, initialWebUrl =", initialWebUrl);
    if (initialWebUrl) {
      performWebImport(initialWebUrl);
    }
  }, [initialWebUrl]);

  const handleFileImport = async (file: File) => {
    setIsFileLoading(true);
    setFileError(null);
    setFileSuccess(null);

    // If media file (audio/video), queue directly to Faster-Whisper
    const isAudioOrVideo = /\.(mp3|m4a|wav|ogg|flac|aac|wma|webm|mp4|mkv|mov|avi)$/i.test(file.name) || file.type.startsWith("audio/") || file.type.startsWith("video/");
    if (isAudioOrVideo) {
      const audioReader = new FileReader();
      audioReader.onload = async (e) => {
        try {
          const dataUrl = e.target?.result as string;
          if (!dataUrl) throw new Error("Failed to read audio file");
          const base64Str = dataUrl.split(",")[1];

          await whisperQueueService.enqueueTask({
            fileBase64: base64Str,
            filename: file.name,
            title: title.trim() || file.name.replace(/\.[^/.]+$/, ""),
            language: targetLanguage || "auto",
            userId: activeUser?.id || "default_user",
            model: (settings as any)?.whisperModel || "base",
            threads: (settings as any)?.whisperThreads || 2,
            vad: (settings as any)?.whisperVad !== false,
          });
          showToast(t('import.whisper_file_queued_toast', 'Audio file "{{name}}" queued for Faster-Whisper transcription ⚡', { name: file.name }), 'success');
          onCancel();
        } catch (err: any) {
          setFileError(err.message || t('import.whisper_queue_failed', 'Failed to queue audio file'));
          setIsFileLoading(false);
        }
      };
      audioReader.onerror = () => {
        setFileError("Failed to read file from disk");
        setIsFileLoading(false);
      };
      audioReader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          throw new Error(t('import.read_local_err', 'Failed to read local file'));
        }

        const base64Str = dataUrl.split(",")[1];

        const response = await fetch(resolveApiUrl("/api/import-file"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileBase64: base64Str,
            filename: file.name,
            fileType: file.type,
            importImages: importImages,
          }),
        });

        const data = await safeJsonParse(response);
        if (!response.ok) {
          throw new Error(data.error || t('import.server_parse_err', 'Server parsing error'));
        }

        setTitle(data.title || file.name.replace(/\.[^/.]+$/, ""));
        setText(data.text || "");

        setPendingImages(data.images || {});
        setSelectedType("book");
        
        const wordCount = data.text
          ? data.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ").split(/\s+/).filter(Boolean).length
          : 0;
        const imageCount = data.images ? Object.keys(data.images).length : 0;
        const imageNote = imageCount > 0 ? t('import.illustrations_note', ', {{count}} illustrations', { count: imageCount }) : "";
        setFileSuccess(t('import.file_imported_success', '✓ File "{{name}}" imported! Extracted {{count}} words{{imageNote}}. Check details below.', { name: file.name, count: wordCount, imageNote }));
      } catch (err: any) {
        console.error(err);
        setFileError(err.message || t('import.file_parse_err_default', 'File parsing error. Try another document.'));
      } finally {
        setIsFileLoading(false);
      }
    };

    reader.onerror = () => {
      setFileError(t('import.read_disk_err', 'Failed to read file from disk.'));
      setIsFileLoading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileImport(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileImport(e.target.files[0]);
    }
  };

  // Custom-type creation fields
  const [showTypeCreator, setShowTypeCreator] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIcon, setNewTypeIcon] = useState("type");
  const [editingType, setEditingType] = useState<LessonType | null>(null);

  const handleStartEditType = (type: LessonType) => {
    setEditingType(type);
    setNewTypeName(type.name);
    setNewTypeIcon(type.icon);
    setShowTypeCreator(true);
  };

  const handleCancelTypeCreator = () => {
    setShowTypeCreator(false);
    setEditingType(null);
    setNewTypeName("");
    setNewTypeIcon("type");
  };

  const handleSaveType = () => {
    if (!newTypeName.trim()) return;
    if (editingType) {
      if (onUpdateLessonType) {
        onUpdateLessonType({
          ...editingType,
          name: newTypeName.trim(),
          icon: newTypeIcon
        });
      }
      setEditingType(null);
    } else {
      const newId = newTypeName.trim().toLowerCase().replace(/\s+/g, "-");
      const newTypeObj = {
        id: newId,
        name: newTypeName.trim(),
        icon: newTypeIcon
      };
      onCreateLessonType(newTypeObj);
      setSelectedType(newId);
    }
    setNewTypeName("");
    setNewTypeIcon("type");
    setShowTypeCreator(false);
  };

  const handleDeleteType = (typeId: string) => {
    if (window.confirm(t('import.confirm_delete_cat', 'Are you sure you want to delete this category?'))) {
      if (onDeleteLessonType) {
        onDeleteLessonType(typeId);
      }
      if (selectedType === typeId) {
        const remaining = lessonTypes.filter((t) => t.id !== typeId);
        if (remaining.length > 0) {
          setSelectedType(remaining[0].id);
        } else {
          setSelectedType("book");
        }
      }
    }
  };

  // YouTube source state
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [isYtLoading, setIsYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytSuccessMessage, setYtSuccessMessage] = useState<string | null>(null);

  // YouTube Playlist state
  const [isYtPlaylistLoading, setIsYtPlaylistLoading] = useState(false);
  const [ytPlaylistData, setYtPlaylistData] = useState<Playlist | null>(null);
  const [ytPlaylistTitle, setYtPlaylistTitle] = useState<string>("");
  const [selectedYtItemIds, setSelectedYtItemIds] = useState<Set<string>>(new Set());
  const [ytFilterSearch, setYtFilterSearch] = useState<string>("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(editingLesson?.playlistId || "none");
  const [newPlaylistTitle, setNewPlaylistTitle] = useState<string>("");

  const isYoutubePlaylistUrl = /[?&]list=([a-zA-Z0-9_-]+)/i.test(youtubeUrlInput.trim());

  const handleYtPlaylistFetch = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const url = youtubeUrlInput.trim();
    if (!url) {
      setYtError(t('import.enter_yt_url_err', 'Enter YouTube playlist link'));
      return;
    }

    setIsYtPlaylistLoading(true);
    setYtError(null);
    setYtSuccessMessage(null);

    try {
      const apiUrl = resolveApiUrl('/api/youtube-playlist');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          targetLanguage,
        }),
      });

      const data = await safeJsonParse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch YouTube playlist');
      }

      setYtPlaylistData(data);
      setYtPlaylistTitle(data.title || "YouTube Playlist");
      const allItemIds = new Set<string>((data.items || []).map((it: any) => it.id));
      setSelectedYtItemIds(allItemIds);
      setYtFilterSearch("");
      showToast(t('playlist.fetched_success', 'Retrieved playlist "{{title}}" with {{count}} videos!', { title: data.title, count: data.items.length }), 'success');
    } catch (err: any) {
      console.error('YouTube playlist fetch failed:', err);
      setYtError(err.message || 'Failed to fetch YouTube playlist');
    } finally {
      setIsYtPlaylistLoading(false);
    }
  };

  const handleToggleYtItem = (id: string) => {
    setSelectedYtItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllYtItems = () => {
    if (!ytPlaylistData) return;
    setSelectedYtItemIds(new Set((ytPlaylistData.items || []).map((it) => it.id)));
  };

  const handleDeselectAllYtItems = () => {
    setSelectedYtItemIds(new Set());
  };

  const handleConfirmYtPlaylist = () => {
    if (!ytPlaylistData) return;
    const selectedItems = (ytPlaylistData.items || []).filter((it) => selectedYtItemIds.has(it.id));
    if (selectedItems.length === 0) {
      showToast(t('playlist.select_at_least_one', 'Select at least one video to import'), 'error');
      return;
    }

    const finalPlaylist: Playlist = {
      ...ytPlaylistData,
      title: ytPlaylistTitle.trim() || ytPlaylistData.title,
      items: selectedItems,
      itemCount: selectedItems.length,
      thumbnailUrl: selectedItems[0]?.thumbnailUrl || ytPlaylistData.thumbnailUrl,
      updatedAt: new Date().toISOString(),
    };

    if (onAddPlaylist) {
      onAddPlaylist(finalPlaylist);
    }
    showToast(t('playlist.import_success', 'Playlist "{{title}}" ({{count}} videos) imported successfully!', { title: finalPlaylist.title, count: selectedItems.length }), 'success');
    onCancel();
  };

  // Fallback state when YouTube lacks subtitles or restricts access
  const [canGenerateFallback, setCanGenerateFallback] = useState(false);
  const [fallbackData, setFallbackData] = useState<{ title: string; coverUrl: string; youtubeId: string | null; youtubeDuration?: number | null } | null>(null);
  const [isGeneratingFallback, setIsGeneratingFallback] = useState(false);

  const PRESET_COVERS = [
    "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=640&h=360&q=80", // Books stack (16:9)
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=640&h=360&q=80", // Study focus (16:9)
    "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=640&h=360&q=80", // Open textbook (16:9)
    "https://images.unsplash.com/photo-1474366521946-c3d4b507abf2?auto=format&fit=crop&w=640&h=360&q=80", // Notebooks (16:9)
    "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=640&h=360&q=80", // Vintage books (16:9)
  ];

  const [ytLoadingMode, setYtLoadingMode] = useState<"auto" | "force_ai" | null>(null);
  const [ytProgress, setYtProgress] = useState<number>(0);
  const [ytStageText, setYtStageText] = useState<string>("");
  const [ytChunkSentences, setYtChunkSentences] = useState<boolean>(false);

  const handleYtFetch = async (e?: React.MouseEvent, modeChoice: "auto" | "force_ai" = "auto") => {
    if (e) e.preventDefault();
    if (!youtubeUrlInput.trim()) {
      setYtError(t('import.enter_yt_url_err', 'Enter YouTube video link'));
      return;
    }

    setIsYtLoading(true);
    setYtLoadingMode(modeChoice);
    setYtError(null);
    setYtSuccessMessage(null);
    setCanGenerateFallback(false);
    setFallbackData(null);
    setYtProgress(5);
    setYtStageText(t('import.stage_metadata', 'Connecting & fetching video metadata...'));

    const isAi = modeChoice === "force_ai";
    const speed = isAi ? 350 : 250;

    const progressInterval = setInterval(() => {
      setYtProgress((prev) => {
        if (prev < 20) {
          setYtStageText(t('import.stage_metadata', 'Connecting & fetching video metadata...'));
          return prev + 4;
        } else if (prev < 45) {
          setYtStageText(isAi ? t('import.stage_audio', 'Extracting audio track for AI...') : t('import.stage_subs', 'Downloading YouTube subtitles...'));
          return prev + 3;
        } else if (prev < 80) {
          setYtStageText(isAi ? t('import.stage_ai', 'Gemini AI Speech-to-Text transcribing...') : t('import.stage_parsing', 'Parsing and cleaning subtitles...'));
          return prev + (isAi ? 1.5 : 2.5);
        } else if (prev < 95) {
          setYtStageText(t('import.stage_format', 'Processing timestamped subtitles...'));
          return prev + 0.8;
        }
        return 95;
      });
    }, speed);

    try {
      const userApiKey = settings?.geminiApiKey || localStorage.getItem("vocab_clone_gemini_key") || "";
      const response = await fetch(resolveApiUrl("/api/youtube-subtitles"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": userApiKey,
        },
        body: JSON.stringify({
          url: youtubeUrlInput.trim(),
          targetLanguage,
          mode: modeChoice,
          chunkSentences: ytChunkSentences,
          uiLang: i18n.language || "en"
        }),
      });

      const data = await safeJsonParse(response);
      clearInterval(progressInterval);
      setYtProgress(100);

      if (!response.ok) {
        if (data.videoTitle) {
          setTitle(data.videoTitle);
          if (data.coverUrl) {
            setCoverUrl(data.coverUrl);
          }
          if (data.youtubeId) {
            setYoutubeId(data.youtubeId);
          }
          if (data.youtubeDuration) {
            setYoutubeDuration(data.youtubeDuration);
          }
          if (data.channelName) setChannelName(data.channelName);
          if (data.channelAvatarUrl) setChannelAvatarUrl(data.channelAvatarUrl);
          setFallbackData({
            title: data.videoTitle,
            coverUrl: data.coverUrl || "",
            youtubeId: data.youtubeId || null,
            youtubeDuration: data.youtubeDuration || null
          });
          setCanGenerateFallback(true);
        }
        throw new Error(data.error || t('import.no_subtitles_found_err', 'Subtitles not found for this YouTube video. However, we retrieved the title and cover! You can paste text manually below or generate text using Gemini AI.'));
      }

      setTitle(data.title || "YouTube Video Lesson");
      setText(data.text || "");

      if (data.coverUrl) {
        setCoverUrl(data.coverUrl);
      }
      if (data.youtubeId) {
        setYoutubeId(data.youtubeId);
      }
      if (data.youtubeDuration) {
        setYoutubeDuration(data.youtubeDuration);
      }
      if (data.channelName) setChannelName(data.channelName);
      if (data.channelAvatarUrl) setChannelAvatarUrl(data.channelAvatarUrl);
      setSelectedType("youtube");
      
      if (data.isFallback) {
        setFallbackData({
          title: data.title,
          coverUrl: data.coverUrl || "",
          youtubeId: data.youtubeId || null,
          youtubeDuration: data.youtubeDuration || null
        });
        setCanGenerateFallback(true);
        setYtError(t('import.yt_no_subs_notice', 'YouTube captions missing. You can generate a study text using Gemini AI below or set your API key in Settings for automatic speech-to-text.'));
      } else if (modeChoice === "force_ai") {
        setYtSuccessMessage(t('import.yt_ai_success', '✓ Gemini AI Speech-to-Text transcribed the video audio with timestamps successfully!'));
      } else {
        setYtSuccessMessage(t('import.yt_import_success', '✓ Subtitles and cover fetched successfully! Check details below.'));
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setYtProgress(0);
      console.error(err);
      setYtError(err.message || t('import.yt_connect_err', 'Connection error. Make sure video has subtitles.'));
    } finally {
      setTimeout(() => {
        setIsYtLoading(false);
        setYtLoadingMode(null);
        setYtProgress(0);
      }, 400);
    }
  };

  const handleGenerateFallback = async () => {
    if (!fallbackData) return;
    setIsGeneratingFallback(true);
    setYtError(null);
    try {
      const profiles = getOrCreateAiProfiles(settings);
      const data = await executeAiWithFailover(
        profiles,
        async (profile) => {
          const response = await fetch(resolveApiUrl("/api/youtube-fallback-generate"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: fallbackData.title,
              targetLanguage,
              aiProfile: profile,
            }),
          });
          const resData = await safeJsonParse(response);
          if (!response.ok) {
            const err: any = new Error(resData.error || t('import.failed_generate_lesson', 'Failed to generate lesson text.'));
            err.status = response.status;
            throw err;
          }
          return resData;
        },
        {
          onFallback: (from, to) => {
            showToast(t("settings.ai_fallback_toast", "Quota for {{from}} exceeded. Request completed via {{to}}.", { from: from.name, to: to.name }), "info");
          }
        }
      );
      setTitle(fallbackData.title);
      setText(data.text || "");

      if (fallbackData.coverUrl) {
        setCoverUrl(fallbackData.coverUrl);
      }
      if (fallbackData.youtubeId) {
        setYoutubeId(fallbackData.youtubeId);
      }
      if (fallbackData.youtubeDuration) {
        setYoutubeDuration(fallbackData.youtubeDuration);
      }
      setSelectedType("youtube");
      setCanGenerateFallback(false);
      setFallbackData(null);
      setYtSuccessMessage(t('import.ai_gen_success', '✓ Lesson text generated by AI based on video topic!'));
    } catch (err: any) {
      console.error(err);
      setYtError(t('import.failed_gen_prefix', 'Failed to generate text: ') + (err.message || err));
    } finally {
      setIsGeneratingFallback(false);
    }
  };

  const handleAudioUpload = (file: File) => {
    setIsAudioLoading(true);
    setAudioUploadError(null);
    setAudioFileName(file.name);
    setAudioRawFile(file);
    setAudioMimeType(file.type || "audio/mp3");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          throw new Error(t('import.read_audio_err', 'Failed to read audio file'));
        }
        const base64Str = dataUrl.split(",")[1];
        setAudioUrl(dataUrl);
        setAudioBase64(base64Str);
      } catch (err: any) {
        console.error(err);
        setAudioUploadError(t('import.upload_audio_err', 'Error uploading audio file: ') + (err.message || err));
      } finally {
        setIsAudioLoading(false);
      }
    };
    reader.onerror = () => {
      setAudioUploadError(t('import.read_audio_disk_err', 'Failed to read file from disk.'));
      setIsAudioLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleTranscribeAudio = async () => {
    if (!audioBase64 && !audioRawFile) return;
    setIsTranscribingAudio(true);
    setAudioUploadError(null);

    try {
      const userApiKey = settings?.geminiApiKey || localStorage.getItem("vocab_clone_gemini_key") || "";
      let response: Response;

      if (audioRawFile) {
        response = await fetch(resolveApiUrl("/api/transcribe-audio"), {
          method: "POST",
          headers: {
            "Content-Type": audioMimeType || "audio/mp3",
            "x-gemini-key": userApiKey,
            "x-target-language": targetLanguage || "",
            "x-filename": encodeURIComponent(audioFileName || audioRawFile.name || ""),
          },
          body: audioRawFile,
        });
      } else {
        response = await fetch(resolveApiUrl("/api/transcribe-audio"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-key": userApiKey,
          },
          body: JSON.stringify({
            audioBase64,
            mimeType: audioMimeType,
            targetLanguage: targetLanguage,
            filename: audioFileName,
          }),
        });
      }

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || t('import.stt_err', 'Failed to transcribe speech from audio file.'));
      }

      if (data.text) {
        setText(data.text);
        if (!title || title === "My Book" || title.trim() === "") {
          if (audioFileName) {
            const cleanName = audioFileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
            setTitle(cleanName);
          }
        }
      }
    } catch (err: any) {
      console.error("Audio Transcription failed:", err);
      setAudioUploadError(err.message || t('import.stt_err', 'Speech recognition error.'));
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCoverLoading(true);
    setCoverUploadError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const maxWidth = 300;
          const maxHeight = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setCoverUrl(event.target?.result as string);
            setIsCoverLoading(false);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);
          setCoverUrl(compressedDataUrl);
        } catch (err: any) {
          console.error(err);
          setCoverUploadError(t('import.img_process_err', 'Image processing error.'));
        } finally {
          setIsCoverLoading(false);
          e.target.value = "";
        }
      };
      img.onerror = () => {
        setCoverUploadError(t('import.read_img_err', 'Failed to read image.'));
        setIsCoverLoading(false);
        e.target.value = "";
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setCoverUploadError(t('import.upload_file_err', 'Failed to upload file.'));
      setIsCoverLoading(false);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAiAudio = async () => {
    if (!text.trim()) {
      setAudioUploadError(t('import.enter_text_first_err', 'Enter lesson text before generating AI audio'));
      return;
    }
    setGeneratingTts(true);
    setAudioUploadError(null);

    try {
      const response = await fetch(resolveApiUrl("/api/generate-tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          language: targetLanguage,
        }),
      });

      if (!response.ok) {
        const errorData = await safeJsonParse(response);
        throw new Error(errorData.error || t('import.tts_gen_err', 'Failed to generate AI audio.'));
      }

      const data = await safeJsonParse(response);
      if (!data.audioBase64) {
        throw new Error(t('import.no_audio_returned', 'Server returned no audio file.'));
      }

      const blobUrl = `data:audio/mp3;base64,${data.audioBase64}`;
      setAudioUrl(blobUrl);
      setAudioBase64(data.audioBase64);
      setAudioUploadError(null);
    } catch (err: any) {
      console.error(err);
      setAudioUploadError(err.message || t('import.tts_start_err', 'Failed to start audio generation.'));
    } finally {
      setGeneratingTts(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && audioBase64) {
      handleTranscribeAudio();
      return;
    }
    let finalPlaylistId: string | null = editingLesson?.playlistId || null;

    if (selectedPlaylistId === "new" && newPlaylistTitle.trim()) {
      const newPlId = `pl_custom_${Date.now()}`;
      const newPlItem = {
        id: `pl_item_${newPlId}_${editingLesson?.id || Date.now().toString()}`,
        lessonId: editingLesson?.id || Date.now().toString(),
        videoId: youtubeId || undefined,
        title: title.trim(),
        durationSeconds: youtubeDuration || 0,
        thumbnailUrl: coverUrl || "",
        transcriptLoaded: true,
      };
      const newPl: Playlist = {
        id: newPlId,
        title: newPlaylistTitle.trim(),
        thumbnailUrl: coverUrl || "",
        sourceType: "custom_collection",
        itemCount: 1,
        language: targetLanguage || "en",
        items: [newPlItem],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      finalPlaylistId = newPlId;
      if (onAddPlaylist) onAddPlaylist(newPl);
    } else if (selectedPlaylistId !== "none" && selectedPlaylistId !== "new") {
      finalPlaylistId = selectedPlaylistId;
      if (playlists && onUpdatePlaylist) {
        const existingPl = playlists.find(p => p.id === selectedPlaylistId);
        if (existingPl) {
          const existingItems = existingPl.items || [];
          const currentLessonId = editingLesson?.id || Date.now().toString();
          if (!existingItems.some(it => it.lessonId === currentLessonId)) {
            const newPlItem = {
              id: `pl_item_${selectedPlaylistId}_${currentLessonId}`,
              lessonId: currentLessonId,
              videoId: youtubeId || undefined,
              title: title.trim(),
              durationSeconds: youtubeDuration || 0,
              thumbnailUrl: coverUrl || "",
              transcriptLoaded: true,
            };
            onUpdatePlaylist({
              ...existingPl,
              itemCount: existingItems.length + 1,
              items: [...existingItems, newPlItem],
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    } else if (selectedPlaylistId === "none") {
      finalPlaylistId = null;
    }

    const lessonData: Lesson = {
      id: editingLesson?.id || Date.now().toString(),
      title: title.trim(),
      text: text.trim(),
      targetLanguage,
      translationLanguage,
      audioUrl,
      audioBase64,
      coverUrl: coverUrl || null,
      youtubeId,
      youtubeDuration,
      channelName: channelName?.trim() || null,
      channelTitle: channelName?.trim() || null,
      channelAvatarUrl: channelAvatarUrl || null,
      channelUrl: channelUrl?.trim() || null,
      lessonType: selectedType,
      isBuiltIn: editingLesson?.isBuiltIn || false,
      isArchived: editingLesson?.isArchived || false,
      difficulty: difficulty || null,
      difficultyExplanation: difficultyExplanation || null,
      createdAt: editingLesson?.createdAt || Date.now(),
      playlistId: finalPlaylistId,
    };

    onAddLesson(lessonData, Object.keys(pendingImages).length > 0 ? pendingImages : undefined);
    setPendingImages({});
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6 max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-xl">
            <PlusCircle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight text-zinc-900 dark:text-zinc-100">
              {editingLesson ? t('import.edit_title', "Edit Book / Lesson") : t('import.title', "Add Book / Lesson")}
            </h3>
            <p className="text-xs text-zinc-500">
              {editingLesson ? t('import.edit_subtitle', "Edit book title, text, languages and cover") : t('import.subtitle', "Import YouTube subtitles with cover or add your own text")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Tabs Selector */}
      {!editingLesson && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl">
          {/* 1. YouTube */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("youtube");
              setYtError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "youtube"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Youtube className="w-4 h-4 text-red-500" />
            {t('import.tab_youtube', 'YouTube Import')}
          </button>
          {/* 2. Подкаст */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("podcast" as any);
              setYtError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === ("podcast" as any)
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Podcast className="w-4 h-4 text-purple-500" />
            {t('import.tab_podcast', 'Podcast')}
          </button>
          {/* 3. Книга PDF / EPUB */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("file");
              setYtError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
              activeTab === "file"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <FileUp className="w-4 h-4 text-amber-500" />
            {t('import.tab_file', 'Book PDF / EPUB')}
          </button>
          {/* 4. Импорт с Сайта */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("url");
              setYtError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "url"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-500" />
            {t('import.tab_url', 'Website Import')}
          </button>
          {/* 5. Обычный текст */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("standard");
              setYtError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "standard"
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <FileText className="w-4 h-4 text-teal-500" />
            {t('import.tab_standard', 'Plain Text')}
          </button>
        </div>
      )}

      {/* Language selections & Difficulty (Used for both) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block md:h-8 md:flex md:items-end">
            {t('import.study_lang', 'Study Language (Study)')}
          </label>
          <div className="flex gap-2">
            <select
              id="sel-target-lang"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              {LANGUAGES_SUPPORTED.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRememberTargetLanguage}
              className={`px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer transition-all flex items-center justify-center gap-1.5 active:scale-95 shrink-0 ${
                isTargetLanguageRemembered
                  ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900"
                  : "bg-white hover:bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
              }`}
              title={t('import.remember_target_title', 'Remember default study language')}
            >
              <Pin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline md:hidden">{isTargetLanguageRemembered ? t('import.remembered', 'Remembered') : t('import.remember', 'Remember')}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block md:h-8 md:flex md:items-end">
            {t('import.trans_lang', 'Translation Language (Translate to)')}
          </label>
          <div className="flex gap-2">
            <select
              id="sel-translation-lang"
              value={translationLanguage}
              onChange={(e) => setTranslationLanguage(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              {LANGUAGES_SUPPORTED.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRememberTranslationLanguage}
              className={`px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer transition-all flex items-center justify-center gap-1.5 active:scale-95 shrink-0 ${
                isTranslationLanguageRemembered
                  ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900"
                  : "bg-white hover:bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
              }`}
              title={t('import.remember_trans_lang', 'Remember default translation language')}
            >
              <Pin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline md:hidden">{isTranslationLanguageRemembered ? t('import.remembered', 'Remembered') : t('import.remember', 'Remember')}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block md:h-8 md:flex md:items-end">
            {t('import.difficulty', 'Difficulty')}
          </label>
          <select
            id="sel-difficulty-level"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">{t('import.diff_none', 'Not specified')}</option>
            <option value="A1">A1 ({t('import.diff_a1', 'Beginner')})</option>
            <option value="A2">A2 ({t('import.diff_a2', 'Elementary')})</option>
            <option value="B1">B1 ({t('import.diff_b1', 'Intermediate')})</option>
            <option value="B2">B2 ({t('import.diff_b2', 'Upper-Intermediate')})</option>
            <option value="C1">C1 ({t('import.diff_c1', 'Advanced')})</option>
            <option value="C2">C2 ({t('import.diff_c2', 'Proficient')})</option>
          </select>
        </div>
      </div>

      {difficultyExplanation && (
        <div className="text-xs bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest block mb-1">{t('import.diff_reasoning', 'Difficulty Level Reasoning')}</span>
          <p className="text-zinc-600 dark:text-zinc-300 italic">"{difficultyExplanation}"</p>
        </div>
      )}

      {/* Lesson Type Selection */}
      <div className="space-y-3 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
            {t('import.source_type', 'Source Type / Resource')}
          </label>
          <button
            type="button"
            onClick={() => {
              if (showTypeCreator) {
                handleCancelTypeCreator();
              } else {
                setShowTypeCreator(true);
              }
            }}
            className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
          >
            {showTypeCreator ? t('import.close', 'Close') : t('import.create_custom_type', '+ Create custom type')}
          </button>
        </div>

        {showTypeCreator && (
          <div className="p-3.5 bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-900/10 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 border-dashed">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {editingType ? t('import.edit_type', 'Edit material type') : t('import.create_type', 'Create new material type')}
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div className="space-y-1.5">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">{t('import.type_name', 'Name (e.g. Podcast)')}</span>
                <input
                  type="text"
                  placeholder={t('import.enter_name', 'Enter name...')}
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">{t('import.select_icon', 'Select icon')}</span>
                <div className="flex flex-wrap gap-2 p-1.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {Object.keys(ICON_MAP).map((iconKey) => {
                    const IconComponent = ICON_MAP[iconKey];
                    const isSelected = newTypeIcon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setNewTypeIcon(iconKey)}
                        className={`p-1.5 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? "bg-teal-600 text-white shadow-xs"
                            : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                        }`}
                        title={iconKey}
                      >
                        <IconComponent className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveType}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-heavy text-[10px] uppercase tracking-wider rounded-xl shadow-xs cursor-pointer active:scale-97 transition-all"
              >
                {editingType ? t('import.save_changes', 'Save changes') : t('import.create_and_select', 'Create and select')}
              </button>
            </div>
          </div>
        )}

        {/* Dynamic type chips grid */}
        <div className="flex flex-wrap gap-2">
          {lessonTypes.map((type) => {
            const IconComponent = getCategoryIcon(type.icon, type.name);
            const isSelected = selectedType === type.id;
            return (
              <div
                key={type.id}
                className={`flex items-center gap-1 p-0.5 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-teal-55 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900 shadow-xs"
                    : "bg-white hover:bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedType(type.id)}
                  className="px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <IconComponent className="w-3.5 h-3.5" />
                  <span>{getCategoryDisplayName(type.id, type.name, t)}</span>
                </button>
                {isSelected && (
                  <div className="flex items-center gap-0.5 border-l border-zinc-200/60 dark:border-zinc-700/60 pl-1 pr-1">
                    <button
                      type="button"
                      onClick={() => handleStartEditType(type)}
                      className="p-1 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50/80 dark:hover:bg-teal-900/20 rounded-md cursor-pointer transition-colors"
                      title={t('import.edit_category', 'Edit category')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteType(type.id)}
                      className="p-1 text-zinc-400 hover:text-red-655 dark:hover:text-red-400 hover:bg-red-50/80 dark:hover:bg-red-900/20 rounded-md cursor-pointer transition-colors"
                      title={t('import.delete_category', 'Delete category')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* YouTube Import Pane */}
      {activeTab === "youtube" && (
        <div className="space-y-4 p-4 border border-red-100 dark:border-red-950/30 bg-red-50/20 dark:bg-red-950/10 rounded-2xl">
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Youtube className="w-4.5 h-4.5 text-red-500 animate-pulse" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {t('import.yt_subtitles_title', 'Download subtitles from YouTube video')}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
              {t('import.yt_subtitles_desc', 'Paste a YouTube video link. Choose standard YouTube subtitles download or direct Gemini AI Speech-to-Text transcription!')}
            </p>
          </div>

          <div className="space-y-2.5">
            <input
              type="text"
              id="txt-youtube-url"
              value={youtubeUrlInput}
              onChange={(e) => setYoutubeUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/25"
            />

            {/* YouTube Playlist Detected Banner & Dedicated Fetch Action */}
            {isYoutubePlaylistUrl && !ytPlaylistData && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <ListVideo className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{t('playlist.detected_banner', 'YouTube Playlist link detected!')}</span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-normal">
                  {t('playlist.detected_desc', 'Import this entire playlist as a neat single collection container with custom video selection. Subtitles will be loaded lazily on demand!')}
                </p>
                <button
                  type="button"
                  id="btn-youtube-playlist-fetch"
                  disabled={isYtPlaylistLoading || isYtLoading}
                  onClick={handleYtPlaylistFetch}
                  className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all active:scale-98"
                >
                  {isYtPlaylistLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('playlist.fetching_meta', 'Fetching playlist metadata...')}</span>
                    </>
                  ) : (
                    <>
                      <ListVideo className="w-4 h-4" />
                      <span>{t('playlist.import_playlist_btn', '📥 Import as Full YouTube Playlist')}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* YouTube Playlist Preview & Selective Video Import Box */}
            {ytPlaylistData && (
              <div className="p-4 bg-white dark:bg-zinc-900 border border-teal-200 dark:border-teal-800/70 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 shadow-md">
                {/* Header: Cover + Editable Title + Channel & Info */}
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  {ytPlaylistData.thumbnailUrl && (
                    <img
                      src={ytPlaylistData.thumbnailUrl}
                      alt={ytPlaylistData.title}
                      className="w-24 aspect-video object-cover rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0 shadow-xs"
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1">
                        <ListVideo className="w-3.5 h-3.5" />
                        {t('playlist.custom_import_title', 'YouTube Playlist Video Selection')}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-md">
                        {ytPlaylistData.items.length} {t('playlist.total_found', 'found')}
                      </span>
                    </div>

                    {/* Editable Title Input */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] font-bold text-zinc-400 block uppercase">
                        {t('playlist.edit_title_label', 'Playlist Title')}
                      </label>
                      <input
                        type="text"
                        value={ytPlaylistTitle}
                        onChange={(e) => setYtPlaylistTitle(e.target.value)}
                        placeholder={t('playlist.enter_name', 'Enter playlist title...')}
                        className="w-full px-3 py-1.5 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border border-teal-300 dark:border-teal-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                      />
                    </div>

                    <p className="text-[11px] text-zinc-500 truncate">
                      {ytPlaylistData.channelTitle ? `${ytPlaylistData.channelTitle} • ` : ""}{t('import.study_lang', 'Study')}: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{targetLanguage}</span>
                    </p>
                  </div>
                </div>

                {/* Toolbar: Counter + Select/Deselect All + Filter Search */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                  <div className="flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-300">
                    <span>
                      {t('playlist.selected_count', 'Selected: {{selected}} of {{total}}', {
                        selected: selectedYtItemIds.size,
                        total: ytPlaylistData.items.length,
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleSelectAllYtItems}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:hover:bg-teal-900/50 dark:text-teal-300 transition-colors cursor-pointer"
                    >
                      {t('playlist.select_all', 'Select All')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllYtItems}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 transition-colors cursor-pointer"
                    >
                      {t('playlist.deselect_all', 'Deselect All')}
                    </button>
                  </div>
                </div>

                {/* Optional Search Filter in playlist */}
                {ytPlaylistData.items.length > 5 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={ytFilterSearch}
                      onChange={(e) => setYtFilterSearch(e.target.value)}
                      placeholder={t('playlist.filter_search_placeholder', 'Filter videos in playlist...')}
                      className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500/40"
                    />
                  </div>
                )}

                {/* Scrollable video list */}
                <div className="max-h-[380px] overflow-y-auto space-y-1.5 p-1.5 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl">
                  {ytPlaylistData.items
                    .filter((it) => !ytFilterSearch || it.title.toLowerCase().includes(ytFilterSearch.toLowerCase()))
                    .map((item, idx) => {
                      const isSelected = selectedYtItemIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleYtItem(item.id)}
                          className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                            isSelected
                              ? "bg-white dark:bg-zinc-900 border-teal-300 dark:border-teal-800/80 shadow-2xs"
                              : "bg-zinc-100/50 dark:bg-zinc-900/40 border-transparent opacity-60 hover:opacity-100"
                          }`}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleYtItem(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600"
                          />

                          {/* Index badge */}
                          <span className="text-[11px] font-mono font-bold text-zinc-400 w-5 text-right shrink-0">
                            #{idx + 1}
                          </span>

                          {/* Thumbnail with duration */}
                          <div className="relative w-14 aspect-video rounded-md overflow-hidden bg-black shrink-0 border border-zinc-700/30">
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                                <Film className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {item.durationSeconds > 0 && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/80 text-white font-mono font-bold text-[9px] rounded">
                                {Math.floor(item.durationSeconds / 60)}:{String(item.durationSeconds % 60).padStart(2, '0')}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-1">
                              {item.title}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={selectedYtItemIds.size === 0}
                    onClick={handleConfirmYtPlaylist}
                    className="flex-1 py-2.5 px-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-all active:scale-98 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {t('playlist.save_playlist_btn', 'Сохранить плейлист ({{count}} видео)', {
                        count: selectedYtItemIds.size,
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYtPlaylistData(null);
                      setSelectedYtItemIds(new Set());
                    }}
                    className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons: YouTube Subtitles vs AI Speech-to-Text vs Faster-Whisper Background */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                id="btn-youtube-fetch"
                disabled={isYtLoading || isYtPlaylistLoading}
                onClick={(e) => handleYtFetch(e, "auto")}
                className="flex-1 py-2.5 px-3 bg-red-50/80 hover:bg-red-100/90 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-extrabold text-xs rounded-xl border border-red-200/80 dark:border-red-800/40 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-2xs"
                title={t('import.yt_auto_tooltip', 'Import official or auto-generated YouTube subtitles (falls back to AI if missing)')}
              >
                {isYtLoading && (ytLoadingMode === "auto" || !ytLoadingMode) ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600 dark:text-red-400" />
                    {t('import.downloading', 'Downloading...')} <span className="font-mono font-bold">{Math.round(ytProgress)}%</span>
                  </>
                ) : (
                  <>
                    <Youtube className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    {t('import.yt_auto_btn', 'YouTube Subtitles (Auto)')}
                  </>
                )}
              </button>

              <button
                type="button"
                id="btn-youtube-ai-fetch"
                disabled={isYtLoading || isYtPlaylistLoading}
                onClick={(e) => handleYtFetch(e, "force_ai")}
                className="flex-1 py-2.5 px-3 bg-purple-50/80 hover:bg-purple-100/90 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-extrabold text-xs rounded-xl border border-purple-200/80 dark:border-purple-800/40 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-2xs"
                title={t('import.yt_ai_tooltip', 'Directly transcribe video speech into timestamped sentences using Gemini AI Speech-to-Text')}
              >
                {isYtLoading && ytLoadingMode === "force_ai" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-400" />
                    {t('import.ai_transcribing', 'Gemini AI Transcribing...')} <span className="font-mono font-bold">{Math.round(ytProgress)}%</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    {t('import.yt_ai_btn', 'Import with AI (Gemini STT)')}
                  </>
                )}
              </button>

              <button
                type="button"
                id="btn-youtube-whisper-fetch"
                disabled={isYtLoading || isYtPlaylistLoading}
                onClick={handleWhisperQueueSubmit}
                className="flex-1 py-2.5 px-3 bg-emerald-50/90 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-2xs"
                title={t('import.yt_whisper_tooltip', 'Enqueue in background and transcribe locally using Faster-Whisper CPU')}
              >
                <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                {t('import.yt_whisper_btn', '⚡ Transcribe with Whisper')}
              </button>
            </div>

            {/* Live Progress Bar & Stage Indicator */}
            {isYtLoading && (
              <div className="p-3.5 bg-white dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 rounded-xl space-y-2 shadow-2xs animate-in fade-in duration-150 font-sans">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  <span className="flex items-center gap-2">
                    <Loader2 className={`w-3.5 h-3.5 animate-spin ${ytLoadingMode === "force_ai" ? "text-purple-600 dark:text-purple-400" : "text-red-600 dark:text-red-400"}`} />
                    {ytStageText || t('import.processing', 'Processing video...')}
                  </span>
                  <span className={`font-mono font-extrabold text-xs ${ytLoadingMode === "force_ai" ? "text-purple-600 dark:text-purple-400" : "text-red-600 dark:text-red-400"}`}>
                    {Math.round(ytProgress)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      ytLoadingMode === "force_ai"
                        ? "bg-gradient-to-r from-purple-500 via-indigo-500 to-teal-400"
                        : "bg-gradient-to-r from-red-500 via-amber-500 to-emerald-400"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(4, ytProgress))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {ytError && !canGenerateFallback && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold leading-normal border border-red-100 dark:border-red-900/30 font-sans">
              {ytError}
            </div>
          )}

          {canGenerateFallback && fallbackData && (
            <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center gap-3">
                {fallbackData.coverUrl && (
                  <img src={fallbackData.coverUrl} className="w-16 h-11 object-cover rounded-lg shadow-xs shrink-0" alt="Video cover" />
                )}
                <div className="space-y-0.5" id="fallback-box">
                  <h5 className="font-bold text-teal-950 dark:text-teal-300 leading-snug">
                    {t('import.found_video', 'Found video:')} "{fallbackData.title}"
                  </h5>
                  <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-normal max-w-md font-sans">
                    {t('import.no_subtitles_desc', 'This video has no built-in subtitles (CC). But no worries! Our AI (Gemini) can generate a story inspired by this video in')} <strong>{targetLanguage}</strong>!
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-gemini-fallback"
                disabled={isGeneratingFallback}
                onClick={handleGenerateFallback}
                className="w-full md:w-auto px-4 py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:brightness-110 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer hover:shadow-sm disabled:opacity-50 transition-all active:scale-97"
              >
                {isGeneratingFallback ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('import.generating', 'Generating...')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('import.gen_ai_btn', 'Generate with AI (Gemini)')}
                  </>
                )}
              </button>
            </div>
          )}

          {ytSuccessMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/30">
              {ytSuccessMessage}
            </div>
          )}
        </div>
      )}

      {/* Podcast Import Pane */}
      {activeTab === ("podcast" as any) && (
        <div className="space-y-4 p-4 border border-purple-100 dark:border-purple-950/30 bg-purple-50/20 dark:bg-purple-950/10 rounded-2xl animate-in fade-in duration-150">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Podcast className="w-4.5 h-4.5 text-purple-500 animate-pulse" />
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-sans">
                {t('import.podcast_title', 'Podcast Import')}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-normal font-sans">
              {t('import.podcast_subtitle', 'Paste an episode link from Apple Podcasts or RSS. AI will transcribe audio and generate subtitles with timecodes.')}
            </p>
          </div>

          {/* Apple Podcasts hint */}
          <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/30 rounded-xl">
            <div className="shrink-0 mt-0.5">
              <Podcast className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed space-y-1">
              <p className="font-bold text-zinc-800 dark:text-zinc-200">{t('import.how_to_apple', 'How to import from Apple Podcasts?')}</p>
              <ol className="list-decimal list-inside space-y-0.5 text-zinc-500">
                <li>{t('import.apple_step1', 'Open podcasts.apple.com in browser')}</li>
                <li>{t('import.apple_step2', 'Navigate to desired episode')}</li>
                <li>{t('import.apple_step3', 'Copy link from address bar and paste below')}</li>
              </ol>
              <p className="text-[10px] text-zinc-400 mt-1">{t('import.also_supported', 'Also supported: Spotify, Podbean, Buzzsprout, Anchor, RSS feeds.')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              type="url"
              value={webUrlInput}
              onChange={(e) => setWebUrlInput(e.target.value)}
              placeholder="https://podcasts.apple.com/us/podcast/..."
              className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/25"
            />
            
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                id="btn-podcast-ai-import"
                disabled={isWebLoading}
                onClick={handleWebImport}
                className="flex-1 py-2.5 px-3 bg-purple-50/80 hover:bg-purple-100/90 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-extrabold text-xs rounded-xl border border-purple-200/80 dark:border-purple-800/40 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-2xs"
                title={t('import.podcast_ai_tooltip', 'Import and transcribe audio with Gemini AI Speech-to-Text')}
              >
                {isWebLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-400" />
                    {t('import.importing', 'Importing...')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    {t('import.podcast_ai_btn', 'Import with AI (Gemini STT)')}
                  </>
                )}
              </button>

              <button
                type="button"
                id="btn-podcast-whisper-fetch"
                disabled={isWebLoading}
                onClick={handlePodcastWhisperSubmit}
                className="flex-1 py-2.5 px-3 bg-emerald-50/90 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-2xs"
                title={t('import.podcast_whisper_tooltip', 'Enqueue in background and transcribe locally using Faster-Whisper CPU')}
              >
                <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                {t('import.podcast_whisper_btn', '⚡ Transcribe with Whisper')}
              </button>
            </div>
          </div>

          {webError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold leading-normal border border-red-100 dark:border-red-900/30 font-sans">
              {webError}
            </div>
          )}

          {webSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/45 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/30 font-sans">
              {webSuccess}
            </div>
          )}
        </div>
      )}

      {/* Website URL Import Pane */}
      {activeTab === "url" && (
        <div className="space-y-4 p-4 border border-emerald-100 dark:border-emerald-950/30 bg-emerald-50/20 dark:bg-emerald-950/10 rounded-2xl animate-in fade-in duration-150">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Globe className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-sans">
                {t('import.web_import_title', 'Import Articles from Websites')}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-normal font-sans">
              {t('import.web_import_desc', 'Paste any article or web page link. AI will clean up ads, navigation and extract text.')}
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              value={webUrlInput}
              onChange={(e) => setWebUrlInput(e.target.value)}
              placeholder="https://example.com/article-to-read"
              className="flex-1 px-3.5 py-2.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
            <button
              type="button"
              disabled={isWebLoading}
              onClick={handleWebImport}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-heavy text-xs rounded-xl flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer transition-all shrink-0 active:scale-97"
            >
              {isWebLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('import.importing', 'Importing...')}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-yellow-350" />
                  {t('import.import_btn', 'Import')}
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-1.5 px-1">
            <input
              type="checkbox"
              id="webScreenshotAsCover"
              checked={webScreenshotAsCover}
              onChange={(e) => setWebScreenshotAsCover(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500/20 w-3.5 h-3.5"
            />
            <label htmlFor="webScreenshotAsCover" className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans cursor-pointer select-none">
              {t('import.screenshot_cover', 'Take page screenshot as cover (otherwise use og:image)')}
            </label>
          </div>

          {webError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold leading-normal border border-red-100 dark:border-red-900/30 font-sans">
              {webError}
            </div>
          )}

          {webSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/45 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/30 font-sans">
              {webSuccess}
            </div>
          )}
        </div>
      )}

      {/* File (PDF/EPUB) Import Pane */}
      {activeTab === "file" && (
        <div className="space-y-4">
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-8 text-center transition-all min-h-[220px] cursor-pointer relative ${
              dragActive 
                ? "border-teal-500 bg-teal-50/30 dark:bg-teal-950/10 scale-[1.01]" 
                : "border-zinc-200 dark:border-zinc-800 hover:border-teal-400 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40"
            }`}
            onClick={() => document.getElementById("file-loader")?.click()}
          >
            <input 
              id="file-loader"
              type="file"
              accept=".pdf,.epub,.mp3,.m4a,.wav,.ogg,.flac,.aac,.mp4,.mkv,.webm"
              onChange={handleFileChange}
              className="hidden"
            />
            {isFileLoading ? (
              <div className="space-y-3 flex flex-col items-center">
                <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
                <div>
                  <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                    {t('import.parsing_book', 'Reading and analyzing document...')}
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-sm">
                    {t('import.parsing_desc', 'Extracting chapters, audio or formatting text. May take a few seconds.')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 flex flex-col items-center">
                <div className="p-4 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-2xl">
                  <UploadCloud className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-widest leading-normal">
                    {t('import.upload_book_file', 'Upload Book or Audio/Video File')}
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-1.5 max-w-md font-sans">
                    {t('import.drag_file_here', 'Drag your .pdf, .epub book or .mp3, .m4a, .mp4 media file here to transcribe with Faster-Whisper')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {fileError && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 text-red-705 dark:text-red-350 rounded-xl text-xs font-semibold leading-normal border border-red-100 dark:border-red-900/30 font-sans">
              ⚠️ {fileError}
            </div>
          )}

          {fileSuccess && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/30">
              {fileSuccess}
            </div>
          )}

          <div className="flex items-center gap-2.5 bg-zinc-50/50 dark:bg-zinc-950/35 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800/80">
            <input
              type="checkbox"
              id="chk-import-images"
              checked={importImages}
              onChange={(e) => setImportImages(e.target.checked)}
              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-zinc-300 dark:border-zinc-700 cursor-pointer accent-teal-600"
            />
            <label htmlFor="chk-import-images" className="text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none leading-normal">
              {t('import.epub_images_option', 'Optional: Extract images from pages and preserve layout (EPUB only)')}
            </label>
          </div>
        </div>
      )}

      {/* Common Editable Fields Section (Prefilled by YouTube, or typed manually) */}
      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
            {t('import.book_title_label', 'Book / Lesson Title (Title)')}
          </label>
          <input
            type="text"
            id="txt-lesson-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('import.title_placeholder', 'E.g.: El Patito Feo - Chapter 1')}
            className="w-full px-3.5 py-2 text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Text Area */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block pb-0.5">
            {t('import.content_label', 'Book Content')} ({text ? `${text.split(/\s+/).length} ${t('import.words_count', 'words')}` : t('import.empty', 'empty')})
          </label>
          <textarea
            id="txt-lesson-body"
            required
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('import.content_placeholder', 'Paste original foreign text, fairy tale or article to read here...')}
            className="w-full px-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 leading-relaxed font-sans"
          ></textarea>
        </div>

        {/* Channel / Author section with Autocomplete & Auto-resolver */}
        <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📺</span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                {t('import.channel', 'Channel / Author')}
              </span>
            </div>
            {channelAvatarUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={channelAvatarUrl}
                  alt={channelName || "Avatar"}
                  className="w-7 h-7 rounded-full object-cover border border-zinc-300 dark:border-zinc-700 shadow-xs"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                {t('import.channel_name_label', 'Channel / Author Name')}
              </label>
              <input
                type="text"
                list="existing-channels-list"
                value={channelName || ""}
                onChange={(e) => handleChannelNameChange(e.target.value)}
                placeholder={t('import.channel_name_placeholder', 'e.g. Andrea la Mexicana, Mr Salas')}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
              <datalist id="existing-channels-list">
                {existingChannels.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                {t('import.channel_url_label', 'Channel URL (YouTube)')}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  onBlur={() => {
                    if (channelUrl && !channelAvatarUrl) {
                      handleResolveChannel();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleResolveChannel();
                    }
                  }}
                  placeholder="https://youtube.com/@Channel"
                  className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => handleResolveChannel()}
                  disabled={isResolvingChannel || !channelUrl.trim()}
                  className="px-2.5 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl transition flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Auto-fetch channel name and avatar"
                >
                  {isResolvingChannel ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>{t('import.resolve_channel_btn', 'Find')}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Cover Customizer */}
        <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-teal-555" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              {t('import.cover_label', 'Book Cover')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Real-time cover preview (supports both vertical books and 16:9 YouTube video thumbnails) */}
            <div className="md:col-span-4 flex justify-center items-center">
              <div className="w-full max-w-[190px] h-28 bg-zinc-900 dark:bg-zinc-950 rounded-xl overflow-hidden shadow-xs border border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative">
                {coverUrl ? (
                  <>
                    {/* Ambient backdrop */}
                    <img 
                      src={coverUrl} 
                      alt="" 
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 select-none pointer-events-none"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("/maxresdefault.jpg")) {
                          target.src = target.src.replace("/maxresdefault.jpg", "/sddefault.jpg");
                        } else if (target.src.includes("/sddefault.jpg")) {
                          target.src = target.src.replace("/sddefault.jpg", "/hqdefault.jpg");
                        }
                      }}
                    />
                    {/* Foreground sharp image shown completely (cover for articles, contain for books) */}
                    <img 
                      src={coverUrl} 
                      alt="Cover preview" 
                      className={`relative z-10 ${selectedType === 'article' ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain'} rounded shadow-sm select-none`}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("/maxresdefault.jpg")) {
                          const fallback = target.src.replace("/maxresdefault.jpg", "/sddefault.jpg");
                          target.src = fallback;
                          setCoverUrl(fallback);
                        } else if (target.src.includes("/sddefault.jpg")) {
                          const fallback = target.src.replace("/sddefault.jpg", "/hqdefault.jpg");
                          target.src = fallback;
                          setCoverUrl(fallback);
                        }
                      }}
                    />
                  </>
                ) : (
                  <span className="text-[10px] text-zinc-400 font-extrabold text-center px-1">
                    {t('import.no_cover', 'No cover')}
                  </span>
                )}
              </div>
            </div>

            {/* URL entry or preset selector */}
            <div className="md:col-span-8 space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('import.cover_url_placeholder', 'Paste image URL')}
                  value={coverUrl}
                  onChange={(e) => {
                    setCoverUrl(e.target.value);
                    setCoverUploadError(null);
                  }}
                  className="flex-grow px-3 py-2 text-[11px] bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 min-w-0"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById("cover-upload-input")?.click()}
                  className="px-3 py-2 text-[11px] font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-xl border border-teal-200 dark:border-teal-900/50 hover:bg-teal-100 dark:hover:bg-teal-950/60 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                  disabled={isCoverLoading}
                >
                  {isCoverLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileUp className="w-3.5 h-3.5" />
                  )}
                  <span>{isCoverLoading ? t('import.compressing', 'Compressing...') : t('import.upload_btn', 'Upload')}</span>
                </button>
                <input
                  id="cover-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                />
              </div>

              {coverUploadError && (
                <div className="text-[10px] text-red-500 font-medium leading-none">
                  {coverUploadError}
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 block">
                  {t('import.or_choose_preset', 'Or choose a ready-made preset:')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COVERS.map((preset, idx) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCoverUrl(preset);
                        setCoverUploadError(null);
                      }}
                      className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all hover:scale-110 cursor-pointer ${
                        coverUrl === preset ? "border-teal-600 scale-105" : "border-transparent"
                      }`}
                    >
                      <img src={preset} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCoverUrl("");
                      setCoverUploadError(null);
                    }}
                    className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 border-2 border-transparent text-[11px] font-bold text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-300"
                    title="Clear cover"
                  >
                    {t('import.reset_btn', 'Reset')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Companion Audio Customizer — hidden in YouTube (already has YouTube player) */}
        {activeTab !== "youtube" && (
        <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              {t('import.companion_audio', 'Companion Audio / Narrator')}
            </span>
          </div>

          {audioUrl || audioBase64 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-950/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-lg">
                    <Music className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {t('import.audio_attached', '✓ Audio file attached successfully')} {audioFileName ? `(${audioFileName})` : ""}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {t('import.audio_available', 'Will be available in audio player during reading')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAudioUrl(null);
                    setAudioBase64(null);
                    setAudioFileName(null);
                    setAudioUploadError(null);
                  }}
                  className="px-3 py-1.5 border border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-red-950/30 dark:hover:bg-red-950/20 dark:hover:text-red-400 rounded-lg text-[11px] font-bold text-zinc-500 transition-colors cursor-pointer"
                >
                  {t('import.reset_audio', 'Reset audio')}
                </button>
              </div>

            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: AI TTS Generation — hidden in Podcast (already has real audio) */}
              {activeTab !== ("podcast" as any) && (
              <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-3 flex flex-col justify-between space-y-3">
                <div>
                  <h5 className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                    {t('import.generate_ai_voice', 'Generate AI Voice Audio (Generate AI Audio)')}
                  </h5>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                    {t('import.generate_ai_voice_desc', 'AI (Gemini) will read the entire lesson text expressively with a native speaker voice.')}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={generatingTts || !text.trim()}
                  onClick={handleGenerateAiAudio}
                  className="w-full px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-heavy text-[10px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  title={!text.trim() ? t('import.enter_text_first', 'Enter lesson text first to generate audio') : t('import.generate_audio_title', 'Generate AI audio')}
                >
                  {generatingTts ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t('import.generating_audio', 'Generating audio...')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('import.voice_ai_btn', 'Generate with AI')}
                    </>
                  )}
                </button>
              </div>
              )}

              {/* Option 2: Upload local audio file */}
              <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-3 flex flex-col justify-between space-y-3 relative">
                <div>
                  <h5 className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                    {t('import.upload_audio_file', 'Upload Audio File (Upload)')}
                  </h5>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                    {t('import.upload_audio_desc', 'Upload companion audio (MP3, M4A, etc.) from your computer.')}
                  </p>
                </div>

                <div className="relative">
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={isAudioLoading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAudioUpload(file);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={isAudioLoading}
                    className="w-full px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-700 dark:text-zinc-300 font-heavy text-[10px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 border border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer"
                  >
                    {isAudioLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('import.uploading', 'Uploading...')}
                      </>
                    ) : (
                      <>
                        <FileUp className="w-3.5 h-3.5" />
                        {t('import.upload_file_btn', 'Upload file')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {audioUploadError && (
            <div className="p-3 bg-red-100/55 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-xl text-[11px] font-semibold leading-normal border border-red-100 dark:border-red-900/40">
              ⚠️ {audioUploadError}
            </div>
          )}
        </div>
        )}

        {/* Playlist / Collection Assignment */}
        <div className="space-y-2.5 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ListVideo className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              {t('playlist.select_playlist_label', 'Playlist / Collection')}
            </span>
          </div>

          <div className="space-y-2">
            <select
              id="sel-playlist"
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer"
            >
              <option value="none">{t('playlist.none_direct', 'None (Direct to Library)')}</option>
              <option value="new">+ {t('playlist.create_new', 'Create New Playlist...')}</option>
              {(playlists || []).map((pl) => (
                <option key={pl.id} value={pl.id}>
                  📁 {pl.title} ({pl.itemCount || pl.items?.length || 0} {t('playlist.videos', 'videos')})
                </option>
              ))}
            </select>

            {selectedPlaylistId === "new" && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                <input
                  type="text"
                  value={newPlaylistTitle}
                  onChange={(e) => setNewPlaylistTitle(e.target.value)}
                  placeholder={t('playlist.enter_name', 'Enter new playlist title...')}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 border border-teal-300 dark:border-teal-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder-zinc-400"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Buttons panel */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
        >
          {t('import.cancel_btn', 'Cancel')}
        </button>
        <button
          type="submit"
          disabled={!title.trim() || !text.trim()}
          className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-sm active:scale-97 cursor-pointer transition-all"
        >
          <Check className="w-4 h-4" />
          {editingLesson ? t('import.save_changes_btn', 'Save changes') : t('import.create_and_read_btn', 'Create book and start reading')}
        </button>
      </div>
    </form>
  );
}
