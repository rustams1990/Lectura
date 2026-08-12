/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Lesson, LessonType, ReaderSettings } from "../types";
import { safeJsonParse, safeLocalStorageSetItem } from "../utils";
import { LANGUAGES_SUPPORTED } from "../data";
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
  Headphones
} from "lucide-react";

import { useTranslation } from "react-i18next";

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
  defaultTargetLanguage
}: ImportLessonFormProps) {
  const { t } = useTranslation();
  // Navigation: standard, youtube or file
  const [activeTab, setActiveTab] = useState<"standard" | "youtube" | "file" | "url">(
    editingLesson ? "standard" : (initialWebUrl ? "url" : "file")
  );

  const [title, setTitle] = useState(editingLesson?.title || "");
  const [text, setText] = useState(editingLesson?.text || "");
  const [targetLanguage, setTargetLanguage] = useState(() => {
    if (editingLesson?.targetLanguage) return editingLesson.targetLanguage;
    if (defaultTargetLanguage && defaultTargetLanguage !== "All") return defaultTargetLanguage;
    const globalTarget = localStorage.getItem("vocab_global_target_language");
    if (globalTarget && globalTarget !== "All") return globalTarget;
    return localStorage.getItem("vocab_default_target_language") || "Spanish";
  });
  const [translationLanguage, setTranslationLanguage] = useState(
    editingLesson?.translationLanguage || localStorage.getItem("vocab_default_translation_language") || "Russian"
  );

  useEffect(() => {
    if (!editingLesson && defaultTargetLanguage && defaultTargetLanguage !== "All") {
      setTargetLanguage(defaultTargetLanguage);
    }
  }, [defaultTargetLanguage, editingLesson]);

  const [savedTargetLang, setSavedTargetLang] = useState(
    localStorage.getItem("vocab_default_target_language") || "Spanish"
  );
  const [savedTranslationLang, setSavedTranslationLang] = useState(
    localStorage.getItem("vocab_default_translation_language") || "Russian"
  );

  const isTargetLanguageRemembered = targetLanguage === savedTargetLang;
  const isTranslationLanguageRemembered = translationLanguage === savedTranslationLang;

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
  const [webScreenshotAsCover, setWebScreenshotAsCover] = useState(true);

  // File import states
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSuccess, setFileSuccess] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importImages, setImportImages] = useState(false);
  const [pendingImages, setPendingImages] = useState<Record<string, { dataUrl: string; width: string; height: string }>>({});
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

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
      const userApiKey = localStorage.getItem("vocab_clone_gemini_key") || "";
      const response = await fetch("/api/import-url", {
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

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          throw new Error(t('import.read_local_err', 'Failed to read local file'));
        }

        const base64Str = dataUrl.split(",")[1];

        const response = await fetch("/api/import-file", {
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

  // Fallback state when YouTube lacks subtitles or restricts access
  const [canGenerateFallback, setCanGenerateFallback] = useState(false);
  const [fallbackData, setFallbackData] = useState<{ title: string; coverUrl: string; youtubeId: string | null; youtubeDuration?: number | null } | null>(null);
  const [isGeneratingFallback, setIsGeneratingFallback] = useState(false);

  const PRESET_COVERS = [
    "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80", // Books stack
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=400&q=80", // Study focus
    "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=400&q=80", // Open textbook
    "https://images.unsplash.com/photo-1474366521946-c3d4b507abf2?auto=format&fit=crop&w=400&q=80", // Notebooks
    "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80", // Vintage books
  ];

  const [ytLoadingMode, setYtLoadingMode] = useState<"auto" | "force_ai" | null>(null);
  const [ytProgress, setYtProgress] = useState<number>(0);
  const [ytStageText, setYtStageText] = useState<string>("");
  const [ytChunkSentences, setYtChunkSentences] = useState<boolean>(true);

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
          setYtStageText(t('import.stage_format', 'Formatting timestamped sentences...'));
          return prev + 0.8;
        }
        return 95;
      });
    }, speed);

    try {
      const response = await fetch("/api/youtube-subtitles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: youtubeUrlInput.trim(),
          targetLanguage,
          mode: modeChoice,
          chunkSentences: ytChunkSentences
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
      setSelectedType("youtube");
      
      if (data.isFallback) {
        setYtSuccessMessage(t('import.fallback_gen_success', '✓ Subtitles not found, but AI generated a full study text for this video!'));
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
      const response = await fetch("/api/youtube-fallback-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: fallbackData.title,
          targetLanguage,
          aiProvider: settings?.aiProvider || "gemini",
          localAiUrl: settings?.localAiUrl || "http://localhost:11434/api/generate",
          localAiModel: settings?.localAiModel || "phi3.5",
        }),
      });
      const data = await safeJsonParse(response);
      if (!response.ok) {
        throw new Error(data.error || t('import.failed_generate_lesson', 'Failed to generate lesson text.'));
      }
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
      const userApiKey = localStorage.getItem("vocab_clone_gemini_key") || "";
      let response: Response;

      if (audioRawFile) {
        response = await fetch("/api/transcribe-audio", {
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
        response = await fetch("/api/transcribe-audio", {
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
      const response = await fetch("/api/generate-tts", {
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
    if (!title.trim() || !text.trim()) return;

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
      lessonType: selectedType,
      isBuiltIn: editingLesson?.isBuiltIn || false,
      isArchived: editingLesson?.isArchived || false,
      difficulty: difficulty || null,
      difficultyExplanation: difficultyExplanation || null,
      createdAt: editingLesson?.createdAt || Date.now(),
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


            {/* Action Buttons: YouTube Subtitles vs AI Speech-to-Text */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                id="btn-youtube-fetch"
                disabled={isYtLoading}
                onClick={(e) => handleYtFetch(e, "auto")}
                className="flex-1 py-2.5 px-4 bg-red-50/80 hover:bg-red-100/90 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-extrabold text-xs rounded-xl border border-red-200/80 dark:border-red-800/40 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-2xs"
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
                disabled={isYtLoading}
                onClick={(e) => handleYtFetch(e, "force_ai")}
                className="flex-1 py-2.5 px-4 bg-purple-50/80 hover:bg-purple-100/90 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-extrabold text-xs rounded-xl border border-purple-200/80 dark:border-purple-800/40 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-2xs"
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

          <div className="flex gap-2">
            <input
              type="url"
              value={webUrlInput}
              onChange={(e) => setWebUrlInput(e.target.value)}
              placeholder="https://podcasts.apple.com/us/podcast/..."
              className="flex-1 px-3.5 py-2.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/25"
            />
            <button
              type="button"
              disabled={isWebLoading}
              onClick={handleWebImport}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-heavy text-xs rounded-xl flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer transition-all shrink-0 active:scale-97"
            >
              {isWebLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('import.importing', 'Importing...')}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  {t('import.import_btn', 'Import')}
                </>
              )}
            </button>
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

          {/* Bookmarklet Integration Box */}
          <div className="mt-4 p-4 border border-teal-100/80 dark:border-teal-950/40 bg-teal-50/15 dark:bg-teal-950/10 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 font-bold" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {t('import.bookmarklet_title', 'Quick import from any site (Bookmarklet)')}
                </span>
              </div>
              <span className="text-[9px] bg-teal-100/60 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full font-bold">
                {t('import.one_click', 'One-click')}
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
              {t('import.bookmarklet_desc', 'A bookmarklet is a smart bookmark button in your browser bar. To install it, choose one of the options below:')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-0.5">
              {/* Option A: Open in new tab */}
              <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
                <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  {t('import.option1_title', 'Option 1: New tab (Recommended)')}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`javascript:(function(){var url=window.location.href;var appUrl='${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/';window.open(appUrl+'?import_url='+encodeURIComponent(url),'_blank');})();`}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-heavy text-[11px] rounded-lg shadow-sm cursor-grab active:cursor-grabbing select-none hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center gap-1 transition-all"
                    title={t('import.drag_to_bar', 'Drag me to your bookmark bar')}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    📥 {t('import.import_new_tab', 'Import to Lectura (New Tab)')}
                  </a>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans leading-normal">
                  {t('import.option1_desc', 'Opens clean text in a new tab, leaving original article open.')}
                </p>
              </div>

              {/* Option B: Open in same tab */}
              <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
                <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  {t('import.option2_title', 'Option 2: Current tab (Reliable)')}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`javascript:(function(){var url=window.location.href;var appUrl='${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/';window.location.href=appUrl+'?import_url='+encodeURIComponent(url);})();`}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-heavy text-[11px] rounded-lg shadow-sm cursor-grab active:cursor-grabbing select-none hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center gap-1 transition-all"
                    title={t('import.drag_to_bar', 'Drag me to your bookmark bar')}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    📥 {t('import.import_same_tab', 'Import to Lectura (Same Tab)')}
                  </a>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans leading-normal">
                  {t('import.option2_desc', 'Redirects current page to Lectura. Protected against popup blockers.')}
                </p>
              </div>
            </div>

            {/* Manual Installation (Copy-Paste) */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  {t('import.manual_setup', 'Can\'t drag? Set up manually:')}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const code = `javascript:(function(){var url=window.location.href;var appUrl='${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/';window.open(appUrl+'?import_url='+encodeURIComponent(url),'_blank');})();`;
                    navigator.clipboard.writeText(code);
                    setCopiedBookmarklet(true);
                    setTimeout(() => setCopiedBookmarklet(false), 2000);
                  }}
                  className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedBookmarklet ? t('import.copied', '✓ Copied!') : t('import.copy_code', 'Copy code')}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal font-sans">
                {t('import.manual_step1', '1. Create any temporary bookmark in browser')} (<kbd className="px-1 bg-zinc-200 dark:bg-zinc-800 rounded">Ctrl+D</kbd>).<br />
                {t('import.manual_step2', '2. Right click the created bookmark and select Edit')}.<br />
                {t('import.manual_step3', '3. Clear URL field, paste copied code, and rename it to Lectura')}.
              </p>
            </div>

            {/* Crucial troubleshooting checklist */}
            <div className="p-3 bg-yellow-50/35 dark:bg-yellow-950/10 border border-yellow-200/30 dark:border-yellow-900/20 rounded-xl space-y-1 font-sans">
              <div className="text-[10px] font-bold text-yellow-850 dark:text-yellow-405">
                ⚠️ {t('import.bm_troubleshoot_title', 'Why bookmarklet may not react to click:')}
              </div>
              <ul className="text-[10px] text-zinc-500 dark:text-zinc-400 list-disc list-inside space-y-1 leading-normal font-sans">
                <li>{t('import.bm_troubleshoot_1', 'You clicked the bookmark on an empty browser tab (chrome://newtab) or settings page. Browser security policies block bookmarklets on internal pages.')}</li>
                <li>{t('import.bm_troubleshoot_2', 'You are testing on highly restricted sites (e.g. GitHub or Chrome Web Store) that restrict third-party scripts via Content Security Policy (CSP).')}</li>
                <li><strong>{t('import.bm_troubleshoot_test', 'Test it:')}</strong> {t('import.bm_troubleshoot_3', 'Go to any article on Wikipedia or news website and click the bookmark there!')}</li>
              </ul>
            </div>
          </div>
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
              accept=".pdf,.epub"
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
                    {t('import.parsing_desc', 'Extracting chapters, cleaning markup, and formatting book text. May take a few seconds.')}
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
                    {t('import.upload_book_file', 'Upload book file (PDF, EPUB)')}
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-1.5 max-w-md font-sans">
                    {t('import.drag_file_here', 'Drag your .pdf or .epub file here or click to select')}
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

        {/* Cover Customizer */}
        <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-teal-555" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              {t('import.cover_label', 'Book Cover')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Real-time cover preview */}
            <div className="md:col-span-3 flex justify-center items-center">
              <div className="w-20 h-28 bg-zinc-200 dark:bg-zinc-800 rounded-xl overflow-hidden shadow-xs border border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center relative">
                {coverUrl ? (
                  <img 
                    src={coverUrl} 
                    alt="Cover preview" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.warn("Cover image failed to load:", coverUrl);
                    }}
                  />
                ) : (
                  <span className="text-[10px] text-zinc-500 font-extrabold text-center px-1">
                    {t('import.no_cover', 'No cover')}
                  </span>
                )}
              </div>
            </div>

            {/* URL entry or preset selector */}
            <div className="md:col-span-9 space-y-2.5">
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

              {/* AI Speech-to-Text Action Card */}
              <div className="p-3 bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-sky-500/10 border border-teal-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-teal-600 text-white rounded-lg shrink-0">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-zinc-900 dark:text-white">
                      {t('import.create_subtitles_ai', 'Generate subtitles from audio with Gemini AI')}
                    </h5>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                      {!text.trim()
                        ? t('import.ai_subtitles_desc_empty', 'Book text is empty. AI will transcribe audio and create sentences with timecodes!')
                        : t('import.ai_subtitles_desc_existing', 'AI will transcribe audio and re-generate sentences with sync timecodes.')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isTranscribingAudio}
                  onClick={handleTranscribeAudio}
                  className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-60 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap"
                >
                  {isTranscribingAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      {t('import.transcribing', 'Transcribing audio...')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      {t('import.create_subtitles_btn', 'Generate subtitles (Gemini AI)')}
                    </>
                  )}
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
