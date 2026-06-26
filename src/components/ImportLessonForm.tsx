/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Lesson, LessonType, ReaderSettings } from "../types";
import { safeJsonParse } from "../utils";
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
  Trash2
} from "lucide-react";

export const ICON_MAP: Record<string, React.ComponentType<any>> = {
  youtube: Youtube,
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
  if (name.includes("lectura") || name.includes("read") || name.includes("чтение")) {
    return BookOpen;
  }
  if (name.includes("книг")) {
    return Book;
  }
  return ICON_MAP.type || Type;
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
  settings
}: ImportLessonFormProps) {
  // Navigation: standard, youtube or file
  const [activeTab, setActiveTab] = useState<"standard" | "youtube" | "file" | "url">(
    editingLesson ? "standard" : (initialWebUrl ? "url" : "file")
  );

  const [title, setTitle] = useState(editingLesson?.title || "");
  const [text, setText] = useState(editingLesson?.text || "");
  const [targetLanguage, setTargetLanguage] = useState(
    editingLesson?.targetLanguage || localStorage.getItem("vocab_default_target_language") || "Spanish"
  );
  const [translationLanguage, setTranslationLanguage] = useState(
    editingLesson?.translationLanguage || localStorage.getItem("vocab_default_translation_language") || "Russian"
  );

  const [savedTargetLang, setSavedTargetLang] = useState(
    localStorage.getItem("vocab_default_target_language") || "Spanish"
  );
  const [savedTranslationLang, setSavedTranslationLang] = useState(
    localStorage.getItem("vocab_default_translation_language") || "Russian"
  );

  const isTargetLanguageRemembered = targetLanguage === savedTargetLang;
  const isTranslationLanguageRemembered = translationLanguage === savedTranslationLang;

  const handleRememberTargetLanguage = () => {
    localStorage.setItem("vocab_default_target_language", targetLanguage);
    setSavedTargetLang(targetLanguage);
  };

  const handleRememberTranslationLanguage = () => {
    localStorage.setItem("vocab_default_translation_language", translationLanguage);
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
  const [generatingTts, setGeneratingTts] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const [coverUrl, setCoverUrl] = useState(editingLesson?.coverUrl || "");
  const [isCoverLoading, setIsCoverLoading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(editingLesson?.youtubeId || null);
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
    editingLesson?.lessonType || (activeTab === "youtube" ? "youtube" : "book")
  );

  const [difficulty, setDifficulty] = useState<string>(editingLesson?.difficulty || "");
  const [difficultyExplanation, setDifficultyExplanation] = useState<string>(editingLesson?.difficultyExplanation || "");


  const performWebImport = async (url: string) => {
    console.log("DEBUG [ImportLessonForm]: starting performWebImport for url:", url);
    setIsWebLoading(true);
    setWebError(null);
    setWebSuccess(null);

    try {
      const response = await fetch("/api/import-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        throw new Error(data.error || "Не удалось извлечь статью с указанного сайта");
      }

      setTitle(data.title || "Статья с сайта");
      setText(data.text || "");
      setSelectedType("article"); // Select article type for website import


      // Automatically generate a web screenshot cover or use og:image metadata
      if (webScreenshotAsCover) {
        setCoverUrl(`https://api.microlink.io/?url=${encodeURIComponent(url.trim())}&screenshot=true&embed=screenshot.url`);
      } else if (data.coverUrl) {
        setCoverUrl(data.coverUrl);
      } else {
        setCoverUrl("");
      }
      
      const wordCount = data.text ? data.text.split(/\s+/).filter(Boolean).length : 0;
      setWebSuccess(`✓ Статья успешно импортирована! Извлечено ${wordCount} слов. Проверьте детали ниже.`);
    } catch (err: any) {
      console.error("DEBUG [ImportLessonForm]: web import error:", err);
      setWebError(err.message || "Ошибка подключения или парсинга страницы. Убедитесь, что URL доступен.");
    } finally {
      setIsWebLoading(false);
    }
  };

  const handleWebImport = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!webUrlInput.trim()) {
      setWebError("Введите ссылку на сайт/статью");
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
          throw new Error("Не удалось прочитать локальный файл");
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
          throw new Error(data.error || "Ошибка парсинга на сервере");
        }

        setTitle(data.title || file.name.replace(/\.[^/.]+$/, ""));
        setText(data.text || "");

        setPendingImages(data.images || {});
        setSelectedType("book");
        
        const wordCount = data.text
          ? data.text.replace(/\[IMG(?:_REF)?:[^\]]+\]/gi, " ").split(/\s+/).filter(Boolean).length
          : 0;
        const imageCount = data.images ? Object.keys(data.images).length : 0;
        const imageNote = imageCount > 0 ? `, ${imageCount} иллюстраций` : "";
        setFileSuccess(`✓ Файл "${file.name}" импортирован! Извлечено ${wordCount} слов${imageNote}. Проверьте детали ниже.`);
      } catch (err: any) {
        console.error(err);
        setFileError(err.message || "Ошибка парсинга файла. Попробуйте другой документ.");
      } finally {
        setIsFileLoading(false);
      }
    };

    reader.onerror = () => {
      setFileError("Не удалось прочитать локальный файл с диска.");
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
    if (window.confirm("Вы уверены, что хотите удалить эту категорию?")) {
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
  const [fallbackData, setFallbackData] = useState<{ title: string; coverUrl: string; youtubeId: string | null } | null>(null);
  const [isGeneratingFallback, setIsGeneratingFallback] = useState(false);

  const PRESET_COVERS = [
    "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80", // Books stack
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=400&q=80", // Study focus
    "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=400&q=80", // Open textbook
    "https://images.unsplash.com/photo-1474366521946-c3d4b507abf2?auto=format&fit=crop&w=400&q=80", // Notebooks
    "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80", // Vintage books
  ];

  const handleYtFetch = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!youtubeUrlInput.trim()) {
      setYtError("Введите ссылку на YouTube видео");
      return;
    }

    setIsYtLoading(true);
    setYtError(null);
    setYtSuccessMessage(null);
    setCanGenerateFallback(false);
    setFallbackData(null);

    try {
      const response = await fetch("/api/youtube-subtitles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: youtubeUrlInput.trim(),
          targetLanguage,
        }),
      });

      const data = await safeJsonParse(response);

      if (!response.ok) {
        if (data.videoTitle) {
          setTitle(data.videoTitle);
          if (data.coverUrl) {
            setCoverUrl(data.coverUrl);
          }
          if (data.youtubeId) {
            setYoutubeId(data.youtubeId);
          }
          setFallbackData({
            title: data.videoTitle,
            coverUrl: data.coverUrl || "",
            youtubeId: data.youtubeId || null
          });
          setCanGenerateFallback(true);
        }
        throw new Error(data.error || "Субтитры не найдены для этого YouTube видео. Однако мы нашли заставку и название видео! Вы можете вставить текст вручную ниже или сгенерировать текст с помощью Gemini AI.");
      }

      setTitle(data.title || "YouTube Video Lesson");
      setText(data.text || "");

      if (data.coverUrl) {
        setCoverUrl(data.coverUrl);
      }
      if (data.youtubeId) {
        setYoutubeId(data.youtubeId);
      }
      setSelectedType("youtube");
      
      if (data.isFallback) {
        setYtSuccessMessage("✓ Субтитры не найдены, но ИИ успешно сгенерировал полноценный учебный текст по теме этого видео!");
      } else {
        setYtSuccessMessage("✓ Субтитры и обложка успешно загружены! Вы можете проверить детали ниже.");
      }
    } catch (err: any) {
      console.error(err);
      setYtError(err.message || "Ошибка подключения. Убедитесь, что у видео есть субтитры.");
    } finally {
      setIsYtLoading(false);
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
        throw new Error(data.error || "Не удалось сгенерировать текст урока.");
      }
      setTitle(fallbackData.title);
      setText(data.text || "");

      if (fallbackData.coverUrl) {
        setCoverUrl(fallbackData.coverUrl);
      }
      if (fallbackData.youtubeId) {
        setYoutubeId(fallbackData.youtubeId);
      }
      setSelectedType("youtube");
      setCanGenerateFallback(false);
      setFallbackData(null);
      setYtSuccessMessage("✓ Текст урока успешно сгенерирован ИИ по теме видео!");
    } catch (err: any) {
      console.error(err);
      setYtError("Не удалось сгенерировать текст: " + (err.message || err));
    } finally {
      setIsGeneratingFallback(false);
    }
  };

  const handleAudioUpload = (file: File) => {
    setIsAudioLoading(true);
    setAudioUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          throw new Error("Не удалось прочитать аудиофайл");
        }
        const base64Str = dataUrl.split(",")[1];
        setAudioUrl(dataUrl);
        setAudioBase64(base64Str);
      } catch (err: any) {
        console.error(err);
        setAudioUploadError("Ошибка при загрузке аудиофайла: " + (err.message || err));
      } finally {
        setIsAudioLoading(false);
      }
    };
    reader.onerror = () => {
      setAudioUploadError("Не удалось прочитать файл с диска.");
      setIsAudioLoading(false);
    };
    reader.readAsDataURL(file);
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
          setCoverUploadError("Ошибка при обработке изображения.");
        } finally {
          setIsCoverLoading(false);
          e.target.value = "";
        }
      };
      img.onerror = () => {
        setCoverUploadError("Не удалось прочитать изображение.");
        setIsCoverLoading(false);
        e.target.value = "";
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setCoverUploadError("Не удалось загрузить файл.");
      setIsCoverLoading(false);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAiAudio = async () => {
    if (!text.trim()) {
      setAudioUploadError("Введите текст книги перед озвучиванием ИИ");
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
        throw new Error(errorData.error || "Не удалось сгенерировать ИИ озвучку.");
      }

      const data = await safeJsonParse(response);
      if (!data.audioBase64) {
        throw new Error("Сервер не вернул аудиофайл.");
      }

      const blobUrl = `data:audio/mp3;base64,${data.audioBase64}`;
      setAudioUrl(blobUrl);
      setAudioBase64(data.audioBase64);
      setAudioUploadError(null);
    } catch (err: any) {
      console.error(err);
      setAudioUploadError(err.message || "Не удалось запустить озвучивание.");
    } finally {
      setGeneratingTts(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      lessonType: selectedType,
      isBuiltIn: editingLesson?.isBuiltIn || false,
      isArchived: editingLesson?.isArchived || false,
      difficulty: difficulty || null,
      difficultyExplanation: difficultyExplanation || null,
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
              {editingLesson ? "Редактировать книгу / Урок (Edit Book)" : "Добавить книгу / Урок (Import Lesson)"}
            </h3>
            <p className="text-xs text-zinc-500">
              {editingLesson ? "Отредактируйте название, текст, языки и обложку книги" : "Импортируйте субтитры из YouTube с обложкой или добавьте свой текст"}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl">
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
            Импорт с YouTube
          </button>
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
            Книга PDF / EPUB
          </button>
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
            Импорт с Сайта
          </button>
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
            Обычный текст
          </button>
        </div>
      )}

      {/* Language selections & Difficulty (Used for both) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block md:h-8 md:flex md:items-end">
            Язык изучения (Study)
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
              title="Запомнить язык изучения по умолчанию"
            >
              <Pin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline md:hidden">{isTargetLanguageRemembered ? "Запомнено" : "Запомнить"}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block md:h-8 md:flex md:items-end">
            Язык перевода (Translate to)
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
              title="Запомнить язык перевода по умолчанию"
            >
              <Pin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline md:hidden">{isTranslationLanguageRemembered ? "Запомнено" : "Запомнить"}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block md:h-8 md:flex md:items-end">
            Сложность (Difficulty)
          </label>
          <select
            id="sel-difficulty-level"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">Не указана</option>
            <option value="A1">A1 (Начинающий)</option>
            <option value="A2">A2 (Элементарный)</option>
            <option value="B1">B1 (Средний)</option>
            <option value="B2">B2 (Выше среднего)</option>
            <option value="C1">C1 (Продвинутый)</option>
            <option value="C2">C2 (В совершенстве)</option>
          </select>
        </div>
      </div>

      {difficultyExplanation && (
        <div className="text-xs bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest block mb-1">Обоснование уровня сложности</span>
          <p className="text-zinc-600 dark:text-zinc-300 italic">"{difficultyExplanation}"</p>
        </div>
      )}

      {/* Lesson Type Selection */}
      <div className="space-y-3 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
            Тип материала / Ресурс (Source Type)
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
            {showTypeCreator ? "Закрыть" : "+ Создать свой тип"}
          </button>
        </div>

        {showTypeCreator && (
          <div className="p-3.5 bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-900/10 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 border-dashed">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {editingType ? "Редактировать тип материала" : "Создать новый тип материала"}
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div className="space-y-1.5">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Название (напр. Подкаст)</span>
                <input
                  type="text"
                  placeholder="Введите название..."
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Выберите иконку</span>
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
                {editingType ? "Сохранить изменения" : "Создать и выбрать"}
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
                  <span>{type.name}</span>
                </button>
                {isSelected && (
                  <div className="flex items-center gap-0.5 border-l border-zinc-200/60 dark:border-zinc-700/60 pl-1 pr-1">
                    <button
                      type="button"
                      onClick={() => handleStartEditType(type)}
                      className="p-1 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50/80 dark:hover:bg-teal-900/20 rounded-md cursor-pointer transition-colors"
                      title="Редактировать категорию"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteType(type.id)}
                      className="p-1 text-zinc-400 hover:text-red-655 dark:hover:text-red-400 hover:bg-red-50/80 dark:hover:bg-red-900/20 rounded-md cursor-pointer transition-colors"
                      title="Удалить категорию"
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
            <div className="flex items-center gap-2">
              <Youtube className="w-4.5 h-4.5 text-red-500 animate-pulse" />
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Загрузка субтитров с YouTube-видео
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Вставьте ссылку на видео YouTube (напр., <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-[10px]">https://www.youtube.com/watch?v=dQw4w9WgXcQ</span>). Скрипт мгновенно скачает дорожку субтитров на выбранном языке и автоматически подтянет заставку видео в качестве обложки книги!
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              id="txt-youtube-url"
              value={youtubeUrlInput}
              onChange={(e) => setYoutubeUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-3.5 py-2.5 text-xs bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
            <button
              type="button"
              id="btn-youtube-fetch"
              disabled={isYtLoading}
              onClick={handleYtFetch}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-heavy text-xs rounded-xl flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer transition-all shrink-0"
            >
              {isYtLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Скачиваем...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Импортировать
                </>
              )}
            </button>
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
                  <img src={fallbackData.coverUrl} className="w-10 h-14 object-cover rounded shadow-xs shrink-0" alt="Video cover" />
                )}
                <div className="space-y-0.5" id="fallback-box">
                  <h5 className="font-bold text-teal-950 dark:text-teal-300 leading-snug">
                    Найдено видео: "{fallbackData.title}"
                  </h5>
                  <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-normal max-w-md font-sans">
                    У этого видео нет встроенных субтитров (CC). Но не волнуйтесь! Наш искусственный интеллект (Gemini) может мгновенно сгенерировать увлекательный обучающий материал на выбранном языке (<strong>{targetLanguage}</strong>), вдохновленный темой этого видео!
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
                    Генерируем...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Сгенерировать с AI (Gemini)
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

      {/* Website URL Import Pane */}
      {activeTab === "url" && (
        <div className="space-y-4 p-4 border border-emerald-100 dark:border-emerald-950/30 bg-emerald-50/20 dark:bg-emerald-950/10 rounded-2xl animate-in fade-in duration-150">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Globe className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-sans">
                Импорт статей с сайтов
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-normal font-sans">
              Просто вставьте ссылку на любую статью или веб-страницу. Искусственный интеллект автоматически очистит страницу от рекламы, меню навигации и баннеров, извлекая только полезный текст для чтения и обучения.
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
                  Импортируем...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-yellow-350" />
                  Импортировать
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
              Сделать скриншот страницы в качестве обложки (иначе использовать og:image)
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
                  Быстрый импорт с любого сайта (Букмарклет)
                </span>
              </div>
              <span className="text-[9px] bg-teal-100/60 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full font-bold">
                В один клик
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
              Букмарклет — это умная кнопка-закладка в панели вашего браузера. Чтобы установить её, выберите один из вариантов ниже:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-0.5">
              {/* Option A: Open in new tab */}
              <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
                <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  Вариант 1: В новой вкладке (Рекомендуется)
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`javascript:(function(){var url=window.location.href;var appUrl='${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/';window.open(appUrl+'?import_url='+encodeURIComponent(url),'_blank');})();`}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-heavy text-[11px] rounded-lg shadow-sm cursor-grab active:cursor-grabbing select-none hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center gap-1 transition-all"
                    title="Перетащите меня на panel закладок"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    📥 Импорт в Lectura (New Tab)
                  </a>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans leading-normal">
                  Открывает очищенный текст в новой вкладке, оставляя исходную статью открытой в текущей вкладке.
                </p>
              </div>

              {/* Option B: Open in same tab */}
              <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
                <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  Вариант 2: В текущей вкладке (Надёжный)
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`javascript:(function(){var url=window.location.href;var appUrl='${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/';window.location.href=appUrl+'?import_url='+encodeURIComponent(url);})();`}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-heavy text-[11px] rounded-lg shadow-sm cursor-grab active:cursor-grabbing select-none hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center gap-1 transition-all"
                    title="Перетащите меня на panel закладок"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    📥 Импорт в Lectura (Same Tab)
                  </a>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans leading-normal">
                  Перенаправляет текущую страницу в Lectura. Полностью защищен от блокировщиков всплывающих окон.
                </p>
              </div>
            </div>

            {/* Manual Installation (Copy-Paste) */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  Не получается перетащить? Установите вручную:
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
                  {copiedBookmarklet ? "✓ Скопировано!" : "Скопировать код"}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal font-sans">
                1. Создайте любую временную закладку в браузере (например, нажмите <kbd className="px-1 bg-zinc-200 dark:bg-zinc-800 rounded">Ctrl+D</kbd> на этой странице).<br />
                2. Нажмите правой кнопкой мыши по созданной закладке и выберите <strong>«Изменить»</strong> (или «Свойства»).<br />
                3. Очистите поле <strong>URL / Адрес</strong>, вставьте туда скопированный код и переименуйте её в <code>Импорт в Lectura</code>.
              </p>
            </div>

            {/* Crucial troubleshooting checklist */}
            <div className="p-3 bg-yellow-50/35 dark:bg-yellow-950/10 border border-yellow-200/30 dark:border-yellow-900/20 rounded-xl space-y-1 font-sans">
              <div className="text-[10px] font-bold text-yellow-850 dark:text-yellow-405">
                ⚠️ Почему закладка может не реагировать на клик:
              </div>
              <ul className="text-[10px] text-zinc-500 dark:text-zinc-400 list-disc list-inside space-y-1 leading-normal font-sans">
                <li>Вы кликнули по закладке на <strong>пустой вкладке браузера</strong> (<code>chrome://newtab</code>) или страницах настроек. Браузерные политики безопасности полностью блокируют букмарклеты на таких служебных страницах.</li>
                <li>Вы тестируете на высокозащищенных сайтах (например, <em>GitHub</em> или интернет-магазин Chrome). Они блокируют запуск сторонних скриптов с помощью Content Security Policy (CSP).</li>
                <li><strong>Проверьте:</strong> перейдите на любую статью в <a href="https://ru.wikipedia.org/" target="_blank" rel="noreferrer" className="underline text-teal-600 dark:text-teal-400">Википедии</a> или новостной сайт и нажмите на закладку там!</li>
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
                    Читаем и анализируем документ...
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-sm">
                    Мы извлекаем главы, чистим разметку и формируем текст книги. Это может занять несколько секунд для больших файлов.
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
                    Загрузить файл книги (PDF, EPUB)
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-1.5 max-w-md font-sans">
                    Перетащите сюда свой файл <strong className="text-zinc-600 dark:text-zinc-400">.pdf</strong> или <strong className="text-zinc-600 dark:text-zinc-400">.epub</strong>, либо нажмите для выбора на диске.
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
              Опционально: Извлечь картинки со страниц и сохранить их положение и размеры (только для EPUB)
            </label>
          </div>
        </div>
      )}

      {/* Common Editable Fields Section (Prefilled by YouTube, or typed manually) */}
      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
            Название книги / Урока (Title)
          </label>
          <input
            type="text"
            id="txt-lesson-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: El Patito Feo - Глава 1"
            className="w-full px-3.5 py-2 text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Text Area */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block pb-0.5">
            Текст книги (Content - {text ? `${text.split(/\s+/).length} слов` : "пусто"})
          </label>
          <textarea
            id="txt-lesson-body"
            required
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Вставьте оригинальный иностранный текст, сказку или статью для чтения здесь..."
            className="w-full px-3.5 py-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 leading-relaxed font-sans"
          ></textarea>
        </div>

        {/* Cover Customizer */}
        <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-teal-555" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Обложка книги (Book Cover)
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
                    Без обложки
                  </span>
                )}
              </div>
            </div>

            {/* URL entry or preset selector */}
            <div className="md:col-span-9 space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Вставьте ссылку на изображение (URL)"
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
                  <span>{isCoverLoading ? "Сжатие..." : "Загрузить"}</span>
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
                  Или выберите готовый пресет:
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
                    Сброс
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Companion Audio Customizer (AI narration or file upload) */}
        <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950/65 rounded-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Сопровождающее аудио (Companion Audio / Narrator)
            </span>
          </div>

          {audioUrl || audioBase64 ? (
            <div className="flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-950/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-lg">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Аудиофайл успешно привязан
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    Будет доступен для воспроизведения в плеере при чтении
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAudioUrl(null);
                  setAudioBase64(null);
                  setAudioUploadError(null);
                }}
                className="px-3 py-1.5 border border-red-200 hover:bg-red-50 hover:text-red-605 dark:border-red-950/30 dark:hover:bg-red-950/20 dark:hover:text-red-400 rounded-lg text-[11px] font-bold text-zinc-500 transition-colors cursor-pointer"
              >
                Сбросить аудио
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: AI TTS Generation */}
              <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-3 flex flex-col justify-between space-y-3">
                <div>
                  <h5 className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                    Озвучить текст через ИИ (Generate AI Audio)
                  </h5>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                    ИИ (Gemini) выразительно прочитает весь текст урока голосом носителя языка. (На бесплатном ключе Gemini API действует жесткий лимит 10 запросов в день).
                  </p>
                </div>

                <button
                  type="button"
                  disabled={generatingTts || !text.trim()}
                  onClick={handleGenerateAiAudio}
                  className="w-full px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-heavy text-[10px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  title={!text.trim() ? "Введите текст урока, чтобы озвучить его" : "Сгенерировать AI аудио"}
                >
                  {generatingTts ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Генерируем аудио...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Озвучить через ИИ
                    </>
                  )}
                </button>
              </div>

              {/* Option 2: Upload local audio file */}
              <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-3 flex flex-col justify-between space-y-3 relative">
                <div>
                  <h5 className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                    Загрузить аудиофайл (Upload)
                  </h5>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                    Загрузите аудиосопровождение (MP3, M4A и др.) со своего компьютера.
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
                        Загрузка...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-3.5 h-3.5" />
                        Загрузить файл
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
      </div>

      {/* Buttons panel */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={!title.trim() || !text.trim()}
          className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-sm active:scale-97 cursor-pointer transition-all"
        >
          <Check className="w-4 h-4" />
          {editingLesson ? "Сохранить изменения" : "Создать книгу и начать чтение"}
        </button>
      </div>
    </form>
  );
}
