/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { VocabItem, WordStatus, ExampleSentence, Dictionary, ReaderSettings, Lesson } from "../types";
import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getLanguageNameWithDialect, safeLocalStorageSetItem } from "../utils";
import { getSuggestedLemmas } from "../morphology";
import { searchWordInLessons } from "../contextSearch";
import ContextSearchResults from "./ContextSearchResults";
import { BookOpen, Check, HelpCircle, Loader2, Award, Volume2, Ban, Sparkles, Tag, Plus, X, ChevronDown, ChevronUp, Trash2, Edit, ExternalLink, AppWindow, Image, Upload, Languages, Save } from "lucide-react";

const sanitizeGrammarTag = (tag: string) => {
  if (!tag) return "";
  const tagLower = tag.toLowerCase().trim();
  if (tagLower.includes("существительн") || tagLower === "сущ" || tagLower === "noun") return "Noun";
  if (tagLower.includes("глагол") || tagLower === "гл" || tagLower === "verb") return "Verb";
  if (tagLower.includes("прилагательн") || tagLower === "прил" || tagLower === "adjective" || tagLower === "adj") return "Adjective";
  if (tagLower.includes("наречи") || tagLower === "нар" || tagLower === "adverb" || tagLower === "adv") return "Adverb";
  if (tagLower.includes("местоимени") || tagLower === "мест" || tagLower === "pronoun" || tagLower === "pron") return "Pronoun";
  if (tagLower.includes("предлог") || tagLower === "prep" || tagLower === "preposition") return "Preposition";
  if (tagLower.includes("союз") || tagLower === "conj" || tagLower === "conjunction") return "Conjunction";
  if (tagLower.includes("междомети") || tagLower === "interj" || tagLower === "interjection") return "Interjection";
  if (tagLower.includes("артикль") || tagLower === "article" || tagLower === "art") return "Article";
  if (tagLower.includes("идиом") || tagLower === "idiom") return "Idiom";
  if (tagLower.includes("фразов") || tagLower.includes("phrasal") || tagLower === "phrasal verb") return "Phrasal Verb";
  if (tagLower.includes("выражени") || tagLower.includes("phrase") || tagLower === "phrase") return "Phrase";

  let cleaned = tag.split(/[,\(\[\/]/)[0].trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
};

const STANDARD_TAGS = ["Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Idiom", "Phrasal Verb", "Phrase"];

const PRESET_POPULAR_MEANINGS: Record<string, string[]> = {
  preocupacion: [
    "забота",
    "беспокойство",
    "озабоченность",
    "волнение",
    "тревога"
  ],
  perro: ["собака", "пёс", "собачий", "кобель"],
  gato: ["кот", "кошка", "кошачий", "домкрат"],
  amigo: ["друг", "приятель", "товарищ", "дружеский"],
  casa: ["дом", "жилище", "здание", "домашний"],
};

const normalizeWordString = (w: string) => {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "")
    .trim();
};



const getLanguageReversoName = (languageName: string): string => {
  const norm = (languageName || "").toLowerCase().trim();
  if (norm.startsWith("en") || norm === "английский") return "english";
  if (norm.startsWith("es") || norm.startsWith("spa") || norm === "испанский") return "spanish";
  if (norm.startsWith("fr") || norm.startsWith("fre") || norm === "французский") return "french";
  if (norm.startsWith("de") || norm.startsWith("ger") || norm === "немецкий") return "german";
  if (norm.startsWith("it") || norm.startsWith("ita") || norm === "итальянский") return "italian";
  if (norm.startsWith("ru") || norm === "русский") return "russian";
  if (norm.startsWith("pt") || norm.startsWith("por") || norm === "португальский") return "portuguese";
  if (norm.startsWith("tr") || norm.startsWith("tur") || norm === "турецкий") return "turkish";
  if (norm.startsWith("ja") || norm.startsWith("jap") || norm === "japanese") return "japanese";
  if (norm.startsWith("zh") || norm.startsWith("chi") || norm === "chinese") return "chinese";
  if (norm.startsWith("ar") || norm === "arabic") return "arabic";
  if (norm.startsWith("uk") || norm.startsWith("ukr") || norm === "украинский" || norm === "українська" || norm === "український") return "ukrainian";
  return norm || "english";
};

const getDefaultDictionaries = (targetLanguage: string, translationLanguage: string): Dictionary[] => {
  const sourceCode = getLanguageCode(targetLanguage);
  const targetCode = getLanguageCode(translationLanguage);
  const sourceReverso = getLanguageReversoName(targetLanguage);
  const targetReverso = getLanguageReversoName(translationLanguage);

  if (sourceCode === "es") {
    return [
      {
        id: "gtrans-es-en",
        name: "Google Translate (EN)",
        urlTemplate: "https://translate.google.com/?sl=es&tl=en&text={word}",
        displayType: "window_popup"
      },
      {
        id: "reverso-es-en",
        name: "Reverso Context",
        urlTemplate: "https://context.reverso.net/translation/spanish-english/{word}",
        displayType: "window_popup"
      },
      {
        id: "spanishdict",
        name: "Spanishdict",
        urlTemplate: "https://www.spanishdict.com/translate/{word}",
        displayType: "window_popup"
      },
      {
        id: "rae",
        name: "RAE",
        urlTemplate: "https://dle.rae.es/{word}",
        displayType: "window_popup"
      },
      {
        id: "collins-es-en",
        name: "Collins",
        urlTemplate: "https://www.collinsdictionary.com/dictionary/spanish-english/{word}",
        displayType: "window_popup"
      },
      {
        id: "cambridge-es-en",
        name: "Cambridge",
        urlTemplate: "https://dictionary.cambridge.org/dictionary/spanish-english/{word}",
        displayType: "window_popup"
      }
    ];
  }

  if (sourceCode === "en") {
    return [
      {
        id: "simple-wiktionary",
        name: "Simple Wiktionary",
        urlTemplate: "https://simple.wiktionary.org/wiki/{word}",
        displayType: "popup"
      },
      {
        id: "cambridge-en",
        name: "Cambridge",
        urlTemplate: "https://dictionary.cambridge.org/dictionary/english/{word}",
        displayType: "window_popup"
      },
      {
        id: "reverso-en-ru",
        name: "Reverso Context (EN-RU)",
        urlTemplate: "https://context.reverso.net/translation/english-russian/{word}",
        displayType: "window_popup"
      }
    ];
  }

  if (sourceCode === "uk") {
    return [
      {
        id: "gtrans-uk",
        name: `Google Translate (${targetCode.toUpperCase()})`,
        urlTemplate: `https://translate.google.com/?sl=uk&tl=${targetCode}&text={word}`,
        displayType: "window_popup"
      },
      {
        id: "goroh-declension",
        name: "Горох (Словозміна)",
        urlTemplate: "https://goroh.pp.ua/Словозміна/{word}",
        displayType: "window_popup"
      },
      {
        id: "goroh-definition",
        name: "Горох (Тлумачення)",
        urlTemplate: "https://goroh.pp.ua/Тлумачення/{word}",
        displayType: "window_popup"
      },
      {
        id: "reverso-uk",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/ukrainian-${targetReverso}/{word}`,
        displayType: "window_popup"
      },
      {
        id: "wiktionary-uk",
        name: "Wiktionary (UK)",
        urlTemplate: "https://uk.wiktionary.org/wiki/{word}",
        displayType: "popup"
      }
    ];
  }

  if (sourceCode === "pt") {
    return [
      {
        id: "gtrans-pt",
        name: `Google Translate (${targetCode.toUpperCase()})`,
        urlTemplate: `https://translate.google.com/?sl=pt&tl=${targetCode}&text={word}`,
        displayType: "window_popup"
      },
      {
        id: "reverso-pt",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/portuguese-${targetReverso}/{word}`,
        displayType: "window_popup"
      },
      {
        id: "priberam",
        name: "Priberam (PT-PT)",
        urlTemplate: "https://dicionario.priberam.org/{word}",
        displayType: "window_popup"
      },
      {
        id: "dicio",
        name: "Dicio (PT-BR)",
        urlTemplate: "https://www.dicio.com.br/{word}",
        displayType: "window_popup"
      },
      {
        id: "collins-pt-en",
        name: "Collins",
        urlTemplate: "https://www.collinsdictionary.com/dictionary/portuguese-english/{word}",
        displayType: "window_popup"
      }
    ];
  }

  return [
    {
      id: "gtrans",
      name: `Google Translate (${targetCode.toUpperCase()})`,
      urlTemplate: `https://translate.google.com/?sl=${sourceCode}&tl=${targetCode}&text={word}`,
      displayType: "new_tab"
    },
    {
      id: "reverso",
      name: "Reverso Context",
      urlTemplate: `https://context.reverso.net/translation/${sourceReverso}-${targetReverso}/{word}`,
      displayType: "new_tab"
    },
    {
      id: "wiktionary",
      name: "Wiktionary",
      urlTemplate: `https://${sourceCode}.wiktionary.org/wiki/{word}`,
      displayType: "popup"
    }
  ];
};

interface WordExplainerProps {
  word: string | null;
  sentence: string | null;
  targetLanguage: string;
  translationLanguage: string;
  existingVocab?: VocabItem | null;
  wordLinks: Record<string, string>;
  vocab?: Record<string, VocabItem> | null;
  onSaveVocab: (vocabItem: VocabItem) => void;
  onDeleteVocab: (word: string) => void;
  onSaveWordLink: (from: string, to: string) => void;
  onDeleteWordLink: (from: string) => void;
  onClose?: () => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onWordClick?: (word: string, context: string) => void;
  lessonText?: string;
  lessons?: Lesson[];
  detectedPhrases?: Record<string, { translation: string; explanation: string; type?: string }>;
  currentLessonId?: string;
  onOpenLesson?: (lessonId: string, word: string, sentence: string) => void;
}

const normalizeTranslationSemicolons = (text: string): string => {
  if (!text) return "";
  // 1. Replace semicolons that separate different part of speech definitions with double newlines (\n\n)
  let result = text.replace(/;\s*(\((?:noun|verb|adj|adjective|adv|adverb|pronoun|prep|conjunction|interjection|participle|article)[^)]*\))/gi, "\n\n$1");
  // 2. Replace remaining internal semicolons within a single meaning block with a space
  result = result.replace(/;\s*/g, " ");
  return result.trim();
};

export default function WordExplainer({
  word,
  sentence,
  targetLanguage,
  translationLanguage,
  existingVocab,
  wordLinks,
  vocab,
  onSaveVocab,
  onDeleteVocab,
  onSaveWordLink,
  onDeleteWordLink,
  onClose,
  settings,
  onSettingsChange,
  onWordClick,
  lessonText,
  lessons,
  detectedPhrases,
  currentLessonId,
  onOpenLesson,
}: WordExplainerProps) {
  const activeSettings = settings || { readerTheme: "default" };
  const explainerThemeMap = {
    default: "bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100",
    cream: "bg-[#fcf8f2] border-[#eddcb9] text-[#3d2c16]",
    sepia: "bg-[#f5ebd0] border-[#ebdcb3] text-[#4d3319]",
    slate: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100",
    charcoal: "bg-zinc-950 border-zinc-900 text-[#eaeaea]",
  };
  const themeClasses = explainerThemeMap[activeSettings.readerTheme || "default"] || explainerThemeMap.default;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsWarning, setTtsWarning] = useState<string | null>(null);

  const [playingSpeech, setPlayingSpeech] = useState(false);
  const [accentOpen, setAccentOpen] = useState(false);
  const [savedMeaningOpen, setSavedMeaningOpen] = useState(true);
  const [dictionariesOpen, setDictionariesOpen] = useState(true);
  const [relatedPhrasesOpen, setRelatedPhrasesOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Compute component words for phrase/idiom detection
  const componentWords = useMemo(() => {
    if (!word) return [];
    return word.split(/\s+/)
      .map(w => w.replace(/^[^\w\p{L}]+|[^\w\p{L}]+$/gu, "").trim())
      .filter(w => w.length > 0 && !/^\d+$/.test(w) && /\p{L}/u.test(w));
  }, [word]);

  // Picture search & selection state variables
  const [imageOpen, setImageOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [aiTabOpen, setAiTabOpen] = useState(false);
  const [imageUrlValue, setImageUrlValue] = useState<string | null>(null);
  const [imageSearchKeyword, setImageSearchKeyword] = useState("");
  const [imagesList, setImagesList] = useState<{ id: string; url: string; thumb: string; author: string; description: string }[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imageSearchError, setImageSearchError] = useState<string | null>(null);

  // Ask AI state variables
  const [askAiOpen, setAskAiOpen] = useState(true);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [customAiLoading, setCustomAiLoading] = useState(false);
  const [customAiError, setCustomAiError] = useState<string | null>(null);

  const handleSearchImages = async (keyword: string) => {
    if (!keyword || !keyword.trim()) return;
    setImagesLoading(true);
    setImageSearchError(null);
    try {
      const resp = await fetch(`/api/image-search?q=${encodeURIComponent(keyword.trim())}`);
      if (!resp.ok) {
        throw new Error("Failed to fetch images from search proxy.");
      }
      const data = await safeJsonParse(resp);
      setImagesList(data.results || []);
    } catch (err: any) {
      console.error(err);
      setImageSearchError("Failed to fetch images from internet");
    } finally {
      setImagesLoading(false);
    }
  };

  const handleSelectImage = (url: string | null) => {
    setImageUrlValue(url);
    if (word) {
      const nextStatus = status === "new" ? "2" : status;
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : "Pending translation"),
        ipa: ipaValue || "",
        grammar: grammarValue || "",
        contextRelation: contextRelationValue || "",
        status: nextStatus,
        examples: examplesValue,
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: selectedTags,
        imageUrl: url,
      };
      onSaveVocab(updatedVocab);
      if (status === "new") {
        setStatus("2");
      }
    }
  };

  const handleClipboardPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of Array.from(items) as DataTransferItem[]) {
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              handleSelectImage(base64);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        handleSelectImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // Form states so the user can customize the definition/notes
  const [translationValue, setTranslationValue] = useState("");
  const [ipaValue, setIpaValue] = useState("");
  const [grammarValue, setGrammarValue] = useState("");
  const [contextRelationValue, setContextRelationValue] = useState("");
  const [examplesValue, setExamplesValue] = useState<ExampleSentence[]>([]);
  const [status, setStatus] = useState<WordStatus>("new");
  const internalStatusUpdateRef = useRef(false);
  const lastWordRef = useRef<string | null>(null);
  const prevVocabRef = useRef<VocabItem | null>(null);
  const meaningTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [translationSource, setTranslationSource] = useState<"ai" | "google" | "free_dictionary" | "wiktionary" | "hybrid">(HTML_SELECTOR_INITIAL_VALUE);
  
  function HTML_SELECTOR_INITIAL_VALUE(): "ai" | "google" | "free_dictionary" | "wiktionary" | "hybrid" {
    const saved = localStorage.getItem("vocab_clone_translation_source");
    if (saved === "ai" || saved === "google" || saved === "free_dictionary" || saved === "wiktionary" || saved === "hybrid") {
      return saved;
    }
    return "ai";
  }

  const handleSetTranslationSource = (src: "ai" | "google" | "free_dictionary" | "wiktionary" | "hybrid") => {
    setTranslationSource(src);
    safeLocalStorageSetItem("vocab_clone_translation_source", src);
  };

  // Floating popup dictionary state
  const [activeDictUrl, setActiveDictUrl] = useState<string | null>(null);
  const [activeDictName, setActiveDictName] = useState("");

  // Custom tags management
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [customTags, setCustomTags] = useState<string[]>(() => {
    const saved = localStorage.getItem("vocab_clone_custom_tags");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return [];
  });

  // Third-party Dictionaries State (With custom additions support and display types)
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);

  const activeStorageKey = useMemo(() => {
    return `vocab_clone_dicts_${(targetLanguage || "unknown").toLowerCase()}_${(translationLanguage || "unknown").toLowerCase()}`;
  }, [targetLanguage, translationLanguage]);

  // Auto-adjust height of saved meaning textarea
  useEffect(() => {
    const tx = meaningTextareaRef.current;
    if (tx) {
      tx.style.height = "auto";
      tx.style.height = `${tx.scrollHeight}px`;
    }
  }, [translationValue, savedMeaningOpen]);

  // Load dictionaries when target Language or translation Language changes
  useEffect(() => {
    const saved = localStorage.getItem(activeStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDictionaries(
            parsed.map((d: any) => ({
              id: d.id,
              name: d.name,
              urlTemplate: d.urlTemplate,
              displayType: d.displayType || (d.id === "wiktionary" ? "popup" : "new_tab")
            }))
          );
          return;
        }
      } catch (err) {
        console.error("Error parsing saved dictionaries for language:", err);
      }
    }

    // Default to language-specific dictionaries
    setDictionaries(getDefaultDictionaries(targetLanguage, translationLanguage));
  }, [targetLanguage, translationLanguage, activeStorageKey]);

  // State for dictionary management modal
  const [showManageDictsModal, setShowManageDictsModal] = useState(false);
  const [editingDict, setEditingDict] = useState<Dictionary | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form fields for dictionary creations & modifications
  const [dictFormName, setDictFormName] = useState("");
  const [dictFormUrl, setDictFormUrl] = useState("");
  const [dictFormType, setDictFormType] = useState<"popup" | "new_tab" | "window_popup">("new_tab");

  const handleSaveDictionary = () => {
    if (!dictFormName.trim() || !dictFormUrl.trim()) return;

    let updated: Dictionary[];

    if (editingDict) {
      // Modify existing
      updated = dictionaries.map((d) =>
        d.id === editingDict.id
          ? { ...d, name: dictFormName.trim(), urlTemplate: dictFormUrl.trim(), displayType: dictFormType }
          : d
      );
    } else {
      // Create new
      const newDict: Dictionary = {
        id: "dict_" + Date.now(),
        name: dictFormName.trim(),
        urlTemplate: dictFormUrl.trim(),
        displayType: dictFormType
      };
      updated = [...dictionaries, newDict];
    }

    setDictionaries(updated);
    safeLocalStorageSetItem(activeStorageKey, JSON.stringify(updated));

    // Reset/close form
    setEditingDict(null);
    setShowAddForm(false);
    setDictFormName("");
    setDictFormUrl("");
    setDictFormType("new_tab");
  };

  const handleStartEditDict = (dict: Dictionary) => {
    setEditingDict(dict);
    setShowAddForm(false);
    setDictFormName(dict.name);
    setDictFormUrl(dict.urlTemplate);
    setDictFormType(dict.displayType || "new_tab");
  };

  const handleCancelEditDict = () => {
    setEditingDict(null);
    setShowAddForm(false);
    setDictFormName("");
    setDictFormUrl("");
    setDictFormType("new_tab");
  };

  const handleDeleteDictionary = (id: string) => {
    const updated = dictionaries.filter((d) => d.id !== id);
    setDictionaries(updated);
    safeLocalStorageSetItem(activeStorageKey, JSON.stringify(updated));
    if (editingDict?.id === id) {
      handleCancelEditDict();
    }
  };

  // Word link custom base targets variables
  const [parentWordInput, setParentWordInput] = useState("");
  const isLinked = word ? !!wordLinks[`${targetLanguage.toLowerCase()}_${word.toLowerCase()}`] : false;
  const linkedParentRaw = word ? (wordLinks[`${targetLanguage.toLowerCase()}_${word.toLowerCase()}`] || "") : "";
  const linkedParent = linkedParentRaw.replace(/^[a-zA-Z]+_/, "");

  // Reset mapper input when word changes
  useEffect(() => {
    setParentWordInput("");
  }, [word]);

  // Suggest potential root lemmas using the morphology helpers
  const suggestedLemmas = useMemo(() => {
    return word ? getSuggestedLemmas(word, targetLanguage) : [];
  }, [word, targetLanguage]);

  // Search candidates for linking
  const searchCandidates = useMemo(() => {
    const list = new Map<string, string>(); // lowercase -> original_display
    const translations = new Map<string, string>(); // lowercase -> translation
    const activeLangLower = targetLanguage.toLowerCase();

    if (vocab) {
      Object.entries(vocab).forEach(([key, item]) => {
        if (item && item.word) {
          const keyLang = key.includes("_") ? key.substring(0, key.indexOf("_")).toLowerCase() : "";
          if (keyLang && keyLang !== activeLangLower) return;

          const wLower = item.word.toLowerCase();
          list.set(wLower, item.word);
          if (item.translation) {
            translations.set(wLower, item.translation);
          }
        }
      });
    }

    if (wordLinks) {
      Object.entries(wordLinks).forEach(([child, parent]) => {
        const childLang = child.includes("_") ? child.substring(0, child.indexOf("_")).toLowerCase() : "";
        if (childLang && childLang !== activeLangLower) return;

        const cleanChild = child.replace(/^[a-zA-Z]+_/, "");
        const cleanParent = parent.replace(/^[a-zA-Z]+_/, "");
        if (cleanChild) list.set(cleanChild.toLowerCase(), cleanChild);
        if (cleanParent) list.set(cleanParent.toLowerCase(), cleanParent);
      });
    }

    const regex = /[\p{L}\p{M}'’]+/gu;

    if (lessonText) {
      const tokens = lessonText.match(regex) || [];
      tokens.forEach((token) => {
        const clean = token.trim();
        if (clean.length > 1) {
          const lower = clean.toLowerCase();
          if (!list.has(lower)) {
            list.set(lower, clean);
          }
        }
      });
    }

    if (lessons) {
      lessons.forEach((l) => {
        if (l && l.text && l.targetLanguage?.toLowerCase() === activeLangLower) {
          const tokens = l.text.match(regex) || [];
          tokens.forEach((token) => {
            const clean = token.trim();
            if (clean.length > 1) {
              const lower = clean.toLowerCase();
              if (!list.has(lower)) {
                list.set(lower, clean);
              }
            }
          });
        }
      });
    }

    return Array.from(list.entries()).map(([low, orig]) => ({
      lower: low,
      original: orig,
      translation: translations.get(low) || ""
    }));
  }, [vocab, wordLinks, lessonText, lessons, targetLanguage]);

  // Live filtered search results
  const liveSearchResults = useMemo(() => {
    const query = parentWordInput.trim().toLowerCase();
    if (!query) return [];
    return searchCandidates
      .filter((c) => c.lower.includes(query) && c.lower !== word?.toLowerCase())
      .sort((a, b) => {
        const aStartsWith = a.lower.startsWith(query);
        const bStartsWith = b.lower.startsWith(query);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return a.lower.localeCompare(b.lower);
      })
      .slice(0, 10);
  }, [parentWordInput, searchCandidates, word]);

  const contextSearchHits = useMemo(() => {
    if (!word || !lessons?.length) return [];
    return searchWordInLessons(word, lessons, {
      targetLanguage,
      wordLinks,
      maxResults: 30,
      maxPerLesson: 4,
    });
  }, [word, lessons, targetLanguage, wordLinks]);

  // Sync with selected word or existing vocab
  useEffect(() => {
    if (!word) {
      setError(null);
      return;
    }

    const wordChanged = lastWordRef.current !== word;
    lastWordRef.current = word;

    const prevVocab = prevVocabRef.current;
    prevVocabRef.current = existingVocab || null;

    const vocabContentChanged =
      wordChanged ||
      (existingVocab === null) !== (prevVocab === null) ||
      (existingVocab && prevVocab && (
        existingVocab.word !== prevVocab.word ||
        existingVocab.translation !== prevVocab.translation ||
        existingVocab.status !== prevVocab.status ||
        existingVocab.ipa !== prevVocab.ipa ||
        existingVocab.grammar !== prevVocab.grammar ||
        existingVocab.contextRelation !== prevVocab.contextRelation ||
        JSON.stringify(existingVocab.examples) !== JSON.stringify(prevVocab.examples) ||
        JSON.stringify(existingVocab.tags) !== JSON.stringify(prevVocab.tags) ||
        existingVocab.imageUrl !== prevVocab.imageUrl
      ));

    if (!vocabContentChanged) {
      return;
    }

    if (existingVocab) {
      setTranslationValue(normalizeTranslationSemicolons(existingVocab.translation));
      setIpaValue(existingVocab.ipa);
      const cleanGrammar = sanitizeGrammarTag(existingVocab.grammar);
      setGrammarValue(cleanGrammar);
      setContextRelationValue(existingVocab.contextRelation);
      setCustomAnswer(existingVocab.contextRelation || "");
      setExamplesValue(existingVocab.examples);
      // Only sync status from parent if the change was NOT initiated by the user
      // (avoids race condition where useEffect overwrites the user's click)
      if (internalStatusUpdateRef.current) {
        internalStatusUpdateRef.current = false;
      } else {
        setStatus(existingVocab.status);
      }
      setSelectedTags(existingVocab.tags || (cleanGrammar ? [cleanGrammar] : []));
      setImageUrlValue(existingVocab.imageUrl || null);
    } else {
      // Check if this word/phrase exists in the auto-detected idioms
      const cleanWord = word.toLowerCase();
      const detectedInfo = detectedPhrases ? (detectedPhrases[cleanWord] || detectedPhrases[word]) : null;

      if (detectedInfo) {
        setTranslationValue(normalizeTranslationSemicolons(detectedInfo.translation));
        setIpaValue("");
        
        let grammarLabel = "Idiom";
        let tagLabel = "Idiom";
        if (detectedInfo.type) {
          const type = detectedInfo.type.toLowerCase();
          if (type === "phrasal_verb") {
            grammarLabel = "Phrasal Verb";
            tagLabel = "Phrasal Verb";
          } else if (type === "saying") {
            grammarLabel = "Saying/Proverb";
            tagLabel = "Saying";
          } else if (type === "set_expression") {
            grammarLabel = "Set Expression";
            tagLabel = "Set Expression";
          }
        }
        
        setGrammarValue(grammarLabel);
        setContextRelationValue(detectedInfo.explanation);
        setCustomAnswer(detectedInfo.explanation || "");
        setExamplesValue([]);
        setStatus("2"); // default to learning state level 2
        setSelectedTags([tagLabel]);
        setImageUrlValue(null);
      } else {
        // Clear form for a brand new word translation
        setTranslationValue("");
        setIpaValue("");
        
        // If it's a multi-word phrase, default to Idiom
        const isPhrase = word.trim().includes(" ");
        setGrammarValue(isPhrase ? "Idiom" : "");
        
        setContextRelationValue("");
        setCustomAnswer("");
        setExamplesValue([]);
        if (!internalStatusUpdateRef.current) {
          setStatus("new");
        }
        setSelectedTags(isPhrase ? ["Idiom"] : []);
        setImageUrlValue(null);
      }
      internalStatusUpdateRef.current = false;
    }

    if (wordChanged) {
      setImageSearchKeyword(word);
      setImagesList([]);
      setImageSearchError(null);
      handleSearchImages(word);
      setError(null);
      setCustomQuestion("");
      setCustomAiError(null);
      setCustomAiLoading(false);
    }
  }, [word, existingVocab, detectedPhrases]);

  // Request word translation & expansion from server API
  const handleTranslate = async () => {
    if (!word) return;
    setLoading(true);
    setError(null);

    try {
      const endpoint = translationSource === "ai" ? "/api/explain" : "/api/dictionary-explain";
      const bodyParams: any = {
        word,
        targetLanguage,
        translationLanguage,
      };
      if (translationSource === "ai") {
        bodyParams.context = sentence || word;
        bodyParams.aiProvider = settings?.aiProvider || "gemini";
        bodyParams.localAiUrl = settings?.localAiUrl || "http://localhost:11434/api/generate";
        bodyParams.localAiModel = settings?.localAiModel || "phi3.5";
      } else {
        bodyParams.source = translationSource;
        if (translationSource === "google") {
          bodyParams.context = sentence || word;
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyParams),
      });

      if (!response.ok) {
        throw new Error(
          translationSource === "ai"
            ? "Failed to fetch translation and explanation."
            : "No dictionary record found for this word."
        );
      }

      const data = await safeJsonParse(response);
      setTranslationValue(normalizeTranslationSemicolons(data.translation || ""));
      setIpaValue(data.ipa || "");
      setGrammarValue(data.grammar || "");
      setContextRelationValue(data.contextRelation || "");
      setExamplesValue(data.examples || []);
      const nextStatus = status === "new" ? "2" : status;
      if (status === "new") {
        setStatus("2");
      }
      
      const parsedTags = data.grammar ? [data.grammar] : [];
      setSelectedTags(parsedTags);

      // Create and save VocabItem
      const newVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: data.translation || "",
        ipa: data.ipa || "",
        grammar: data.grammar || "",
        contextRelation: data.contextRelation || "",
        status: nextStatus,
        examples: data.examples || [],
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: parsedTags,
        imageUrl: imageUrlValue,
      };
      onSaveVocab(newVocab);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while translating.");
    } finally {
      setLoading(false);
    }
  };

  const handleAskAi = async (questionText: string) => {
    if (!word || !questionText.trim()) return;
    setCustomAiLoading(true);
    setCustomAiError(null);
    if (customQuestion !== questionText) {
      setCustomQuestion(questionText);
    }

    try {
      const endpoint = "/api/explain";
      const bodyParams: any = {
        word,
        context: sentence || word,
        targetLanguage,
        translationLanguage,
        aiProvider: settings?.aiProvider || "gemini",
        localAiUrl: settings?.localAiUrl || "http://localhost:11434/api/generate",
        localAiModel: settings?.localAiModel || "phi3.5",
        customQuestion: questionText.trim(),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyParams),
      });

      if (!response.ok) {
        throw new Error("Failed to get explanation from AI.");
      }

      const data = await safeJsonParse(response);
      const answer = data.contextRelation || data.translation || "No explanation provided.";
      setCustomAnswer(answer);
      setContextRelationValue(answer);

      // Auto-populate other fields if empty
      let currentTranslation = translationValue;
      if (!currentTranslation || currentTranslation === "Pending translation" || currentTranslation.startsWith("[")) {
        if (data.translation) {
          currentTranslation = normalizeTranslationSemicolons(data.translation);
          setTranslationValue(currentTranslation);
        }
      }
      let currentIpa = ipaValue;
      if (data.ipa && !currentIpa) {
        currentIpa = data.ipa;
        setIpaValue(data.ipa);
      }
      let currentGrammar = grammarValue;
      let currentTags = selectedTags;
      if (data.grammar && !currentGrammar) {
        const cleanGrammar = sanitizeGrammarTag(data.grammar);
        currentGrammar = cleanGrammar;
        setGrammarValue(cleanGrammar);
        currentTags = selectedTags.includes(cleanGrammar) ? selectedTags : [...selectedTags, cleanGrammar];
        setSelectedTags(currentTags);
      }
      let currentExamples = examplesValue;
      if (data.examples && data.examples.length > 0 && currentExamples.length === 0) {
        currentExamples = data.examples;
        setExamplesValue(data.examples);
      }

      // Auto-save the explanation
      const nextStatus = status === "new" ? "2" : status;
      if (status === "new") setStatus("2");

      const savedTags = currentTags.length > 0 ? currentTags : (currentGrammar ? [currentGrammar] : []);
      const newVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: currentTranslation.trim() || "Pending translation",
        ipa: currentIpa || "",
        grammar: currentGrammar || "",
        contextRelation: answer,
        status: nextStatus,
        examples: currentExamples,
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: savedTags,
        imageUrl: imageUrlValue,
      };
      onSaveVocab(newVocab);
    } catch (err: any) {
      console.error(err);
      setCustomAiError(err.message || "An error occurred while calling AI.");
    } finally {
      setCustomAiLoading(false);
    }
  };

  const handleSaveExplanation = () => {
    if (!word) return;
    const nextStatus = status === "new" ? "2" : status;
    if (status === "new") setStatus("2");

    const updatedVocab: VocabItem = {
      word: word.toLowerCase(),
      translation: translationValue.trim() || "Pending translation",
      ipa: ipaValue || "",
      grammar: grammarValue || "",
      contextRelation: customAnswer,
      status: nextStatus,
      examples: examplesValue,
      createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
      tags: selectedTags,
      imageUrl: imageUrlValue,
    };
    onSaveVocab(updatedVocab);
    setContextRelationValue(customAnswer);
  };

  const handlePlaySpeech = async () => {
    if (!word || playingSpeech) return;
    setPlayingSpeech(true);

    const currentTtsEngine = settings?.ttsEngine || "google";
    const ttsLang = getEffectiveTtsLocale(targetLanguage, settings);

    // --- Google Translate TTS (same as AwesomeTTS in Anki, free, no key required) ---
    if (currentTtsEngine === "google") {
      try {
        const cacheKey = `google-tts:${ttsLang}:${word.toLowerCase().trim()}`;
        let audioUrl: string | null = null;
        let blob = await getTtsAudioFromCache(cacheKey);

        if (blob) {
          audioUrl = URL.createObjectURL(blob);
        } else {
          const params = new URLSearchParams({ text: word, lang: ttsLang });
          const response = await fetch(`/api/google-tts?${params.toString()}`);
          if (!response.ok) throw new Error(`Google TTS ${response.status}`);
          blob = await response.blob();
          await saveTtsAudioToCache(cacheKey, blob);
          audioUrl = URL.createObjectURL(blob);
        }

        if (audioUrl) {
          const audio = new Audio(audioUrl);
          audio.onended = () => { URL.revokeObjectURL(audioUrl!); setPlayingSpeech(false); };
          audio.onerror = () => { URL.revokeObjectURL(audioUrl!); setPlayingSpeech(false); };
          await audio.play();
          return;
        }
      } catch (e: any) {
        console.warn("Google TTS failed, falling back to browser TTS:", e);
        setTtsWarning(`Озвучка Google не удалась (${e.message || "ошибка"}). Переключено на голос браузера.`);
        setTimeout(() => {
          setTtsWarning(prev => prev && prev.includes("Google") ? null : prev);
        }, 6000);
      }
    }

    // --- Gemini neural TTS ---
    if (currentTtsEngine === "gemini") {
      try {
        const descriptiveLang = getLanguageNameWithDialect(targetLanguage, settings);
        const response = await fetch("/api/generate-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: word,
            language: descriptiveLang,
          }),
        });

        if (!response.ok) {
          const errData = await safeJsonParse(response);
          throw new Error(errData?.error || `Ошибка сервера (${response.status})`);
        }

        const data = await safeJsonParse(response);
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
          audio.onended = () => setPlayingSpeech(false);
          await audio.play();
          return; // successfully played AI audio
        } else {
          throw new Error("No audio base64 payload");
        }
      } catch (e: any) {
        console.warn("Gemini neural voice failed or rate-limited. Falling back automatically to local browser TTS.", e);
        setTtsWarning(`Озвучка Gemini не удалась (${e.message || "ошибка"}). Переключено на голос браузера.`);
        setTimeout(() => {
          setTtsWarning(prev => prev && prev.includes("Gemini") ? null : prev);
        }, 8000);
      }
    }

    // --- Default flow: local browser HTML5 SpeechSynthesis API ---
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = ttsLang;
      
      // Find best speaker voice matching the target language code
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        
        // 1. Try exact match first (e.g. "es-US" or "en-GB")
        let matchingVoice = voices.find(v => {
          const vLang = v.lang.toLowerCase().replace("_", "-");
          return vLang === ttsLang.toLowerCase();
        });
        
        // 2. Fall back to main language prefix matching (e.g. "es", "en")
        if (!matchingVoice) {
          const mainLang = ttsLang.toLowerCase().split("-")[0];
          matchingVoice = voices.find(v => {
            const vLang = v.lang.toLowerCase().replace("_", "-");
            return vLang.startsWith(mainLang);
          });
        }
        
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
      }
      window.speechSynthesis.speak(utterance);
    } catch (browserErr) {
      console.error("Audio playback error:", browserErr);
    } finally {
      setPlayingSpeech(false);
    }
  };

  const handleSaveCustom = () => {
    if (!word) return;
    
    const trimmedVal = translationValue.trim();
    if (!trimmedVal) {
      setStatus("new");
      onDeleteVocab(word.toLowerCase());
      return;
    }

    const nextStatus = status === "new" ? "2" : status;
    if (status === "new") setStatus("2");
    
    const updatedVocab: VocabItem = {
      word: word.toLowerCase(),
      translation: trimmedVal,
      ipa: ipaValue || "",
      grammar: grammarValue || "",
      contextRelation: contextRelationValue || "",
      status: nextStatus,
      examples: examplesValue,
      createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
      tags: selectedTags,
      imageUrl: imageUrlValue,
    };
    onSaveVocab(updatedVocab);
  };

  const handleDeleteTranslation = () => {
    if (!word) return;
    setTranslationValue("");
    setStatus("new");
    onDeleteVocab(word.toLowerCase());
  };

  const handleUpdateStatus = (newStatus: WordStatus) => {
    if (!word) return;
    // Mark that this status change was initiated by the user,
    // so the useEffect won't overwrite it with stale data
    internalStatusUpdateRef.current = true;
    setStatus(newStatus);
    
    if (newStatus === "new") {
      onDeleteVocab(word.toLowerCase());
    } else {
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (newStatus === "ignored" ? "[Ignored]" : newStatus === "known" ? "[Known]" : "Pending translation"),
        ipa: ipaValue || "",
        grammar: grammarValue || "",
        contextRelation: contextRelationValue || "",
        status: newStatus,
        examples: examplesValue,
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: selectedTags,
        imageUrl: imageUrlValue,
      };
      onSaveVocab(updatedVocab);
    }
  };

  const handleToggleTag = (tag: string) => {
    const updatedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    setSelectedTags(updatedTags);

    if (word) {
      const nextStatus = status === "new" ? "2" : status;
      if (status === "new") {
        setStatus("2");
      }
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : "Pending translation"),
        ipa: ipaValue || "",
        grammar: grammarValue || "",
        contextRelation: contextRelationValue || "",
        status: nextStatus,
        examples: examplesValue,
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: updatedTags,
        imageUrl: imageUrlValue,
      };
      onSaveVocab(updatedVocab);
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    
    if (!customTags.includes(capitalized) && !STANDARD_TAGS.includes(capitalized)) {
      const updated = [...customTags, capitalized];
      setCustomTags(updated);
      safeLocalStorageSetItem("vocab_clone_custom_tags", JSON.stringify(updated));
    }
    
    const updatedTags = selectedTags.includes(capitalized)
      ? selectedTags
      : [...selectedTags, capitalized];
      
    setSelectedTags(updatedTags);
    setNewTagInput("");

    if (word) {
      const nextStatus = status === "new" ? "2" : status;
      if (status === "new") {
        setStatus("2");
      }
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : "Pending translation"),
        ipa: ipaValue || "",
        grammar: grammarValue || "",
        contextRelation: contextRelationValue || "",
        status: nextStatus,
        examples: examplesValue,
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: updatedTags,
        imageUrl: imageUrlValue,
      };
      onSaveVocab(updatedVocab);
    }
  };

  const handleDeleteCustomTag = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTags.filter((t) => t !== tag);
    setCustomTags(updated);
    safeLocalStorageSetItem("vocab_clone_custom_tags", JSON.stringify(updated));
    
    const updatedTags = selectedTags.filter((t) => t !== tag);
    setSelectedTags(updatedTags);

    if (word) {
      const nextStatus = status === "new" ? "2" : status;
      if (status === "new") {
        setStatus("2");
      }
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : "Pending translation"),
        ipa: ipaValue || "",
        grammar: grammarValue || "",
        contextRelation: contextRelationValue || "",
        status: nextStatus,
        examples: examplesValue,
        createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
        tags: updatedTags,
        imageUrl: imageUrlValue,
      };
      onSaveVocab(updatedVocab);
    }
  };

  if (!word) {
    return (
      <div className={`${themeClasses} rounded-2xl border-2 border-dashed p-8 text-center flex flex-col items-center justify-center space-y-3 h-full min-h-[320px]`}>
        <div className="p-3 bg-zinc-100/50 dark:bg-zinc-800/40 rounded-full text-zinc-400 dark:text-zinc-500">
          <BookOpen className="w-8 h-8" />
        </div>
        <div className="max-w-xs">
          <h3 className="font-semibold text-inherit">No Word Selected</h3>
          <p className="text-sm opacity-70 mt-1 leading-normal block">
            Click on any word inside the reader pane to view its translations, pronunciation, and dictionary definitions.
          </p>
        </div>
      </div>
    );
  }

  // Calculate coins based on active status level (represented in VocabItem as the yellow coins score award)
  const coinCount = status === "1" ? "1" : status === "2" ? "2" : status === "3" ? "3" : status === "4" ? "4" : status === "5" ? "5" : status === "known" ? "Check" : "1";

  // Parse list of popular meaning alternatives (merging normalize preset and split translations)
  const popularMeanings = () => {
    const list: string[] = [];
    const normalized = normalizeWordString(word);
    
    // Preset values for high-fidelity screenshots matching
    if (PRESET_POPULAR_MEANINGS[normalized]) {
      list.push(...PRESET_POPULAR_MEANINGS[normalized]);
    }
    
    // Split current translated value if any
    if (translationValue && translationValue !== "Pending translation" && !translationValue.startsWith("[")) {
      const splitItems = translationValue
        .split(/[;\n]+/)
        .map((s) => s.trim())
        .filter((s) => {
          if (!s) return false;
          // Filter out grammatical placeholders that have no real explanation characters
          const clean = s.replace(/\([^)]*\)/g, "").replace(/\b(noun|verb|adj|adjective|adv|adverb|pronoun|prep|conjunction|countable|uncountable)\b/gi, "").trim();
          return clean.length >= 2 && !list.includes(s) && !s.includes("Pending translation") && !s.includes("[Demo Translation]");
        });
      list.push(...splitItems);
    }

    // Default suggestions if list is empty
    if (list.length === 0) {
      if (loading) {
        list.push("searching for meaning...", "loading...");
      } else {
        list.push("загрузка...", "поиск значения...");
      }
    }
    return list;
  };

  const handleSelectPopularMeaning = (meaning: string) => {
    if (meaning === "загрузка..." || meaning === "поиск значения..." || meaning === "searching for meaning..." || meaning === "loading...") return;
    
    let newTranslation = translationValue.trim();
    if (!newTranslation || newTranslation === "Pending translation" || newTranslation.startsWith("[")) {
      newTranslation = meaning;
    } else {
      const parts = newTranslation.split(/[;\n]+/).map((s) => s.trim().toLowerCase());
      if (!parts.includes(meaning.toLowerCase())) {
        newTranslation = `${newTranslation}; ${meaning}`;
      }
    }
    
    setTranslationValue(newTranslation);
    
    // Save instantly inside status learning level 2
    const nextStatus = status === "new" ? "2" : status;
    if (status === "new") setStatus("2");
    
    const updatedVocab: VocabItem = {
      word: word.toLowerCase(),
      translation: newTranslation,
      ipa: ipaValue || "",
      grammar: grammarValue || "",
      contextRelation: contextRelationValue || "",
      status: nextStatus,
      examples: examplesValue,
      createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
      tags: selectedTags,
      imageUrl: imageUrlValue,
    };
    onSaveVocab(updatedVocab);
  };



  return (
    <div className={`${themeClasses} rounded-2xl border shadow-md p-3.5 space-y-2.5 flex flex-col h-full transition-all duration-200 max-w-full overflow-hidden select-none`}>
      
      {/* Top Header Row with Word, close and speech synthesis */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Play button + accent picker */}
          <div className="relative flex items-center shrink-0">
            <button
              onClick={handlePlaySpeech}
              disabled={playingSpeech}
              title="Воспроизвести произношение (TTS)"
              className={`w-8 h-8 rounded-l-lg bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-110 dark:hover:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/50 transition-all cursor-pointer ${
                playingSpeech ? "animate-pulse scale-95" : "active:scale-90"
              }`}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            {/* Accent dropdown trigger — always visible for Google TTS */}
            <button
              onClick={() => setAccentOpen(p => !p)}
              title="Выбрать акцент"
              className="w-5 h-8 rounded-r-lg bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-110 dark:hover:bg-teal-900/40 flex items-center justify-center text-teal-500 dark:text-teal-500 border border-l-0 border-teal-100/50 dark:border-teal-900/50 transition-all cursor-pointer"
            >
              <svg className={`w-2.5 h-2.5 transition-transform ${accentOpen ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="currentColor">
                <path d="M0 0l5 6 5-6z"/>
              </svg>
            </button>
            {/* Accent dropdown panel — always available */}
            {accentOpen && (() => {
              const currentLocale = getEffectiveTtsLocale(targetLanguage, settings);
              const QUICK_ACCENTS = [
                { group: "🇺🇸🇬🇧 Английский", items: [
                  { code: "en-US", label: "🇺🇸 Американский" },
                  { code: "en-GB", label: "🇬🇧 Британский" },
                  { code: "en-AU", label: "🇦🇺 Австралийский" },
                  { code: "en-CA", label: "🇨🇦 Канадский" },
                  { code: "en-IN", label: "🇮🇳 Индийский" },
                ]},
                { group: "🇪🇸 Испанский", items: [
                  { code: "es-US", label: "🇲🇽 Мексиканский" },
                  { code: "es-ES", label: "🇪🇸 Испанский" },
                  { code: "es-AR", label: "🇦🇷 Аргентинский" },
                ]},
                { group: "🇧🇷 Португальский", items: [
                  { code: "pt-BR", label: "🇧🇷 Бразильский" },
                  { code: "pt-PT", label: "🇵🇹 Европейский" },
                ]},
                { group: "🇫🇷 Французский", items: [
                  { code: "fr-FR", label: "🇫🇷 Французский" },
                  { code: "fr-CA", label: "🇨🇦 Канадский" },
                ]},
                { group: "Другие", items: [
                  { code: "de-DE", label: "🇩🇪 Немецкий" },
                  { code: "it-IT", label: "🇮🇹 Итальянский" },
                  { code: "ru-RU", label: "🇷🇺 Русский" },
                  { code: "uk-UA", label: "🇺🇦 Украинский" },
                  { code: "ja-JP", label: "🇯🇵 Японский" },
                  { code: "ko-KR", label: "🇰🇷 Корейский" },
                  { code: "zh-CN", label: "🇨🇳 Китайский" },
                  { code: "zh-TW", label: "🇹🇼 Тайваньский" },
                  { code: "tr-TR", label: "🇹🇷 Турецкий" },
                  { code: "ar-SA", label: "🇸🇦 Арабский" },
                ]},
              ];
              return (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-2 min-w-[200px] max-h-[70vh] overflow-y-auto" style={{scrollbarWidth:'thin'}}>
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400 px-2 py-1 mb-1">
                    🌍 Акцент Google TTS · <span className="text-teal-600">{currentLocale}</span>
                  </div>
                  {QUICK_ACCENTS.map(grp => (
                    <div key={grp.group} className="mb-2">
                      <div className="text-[8px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 px-2 mb-1">{grp.group}</div>
                      {grp.items.map(acc => (
                        <button
                          key={acc.code}
                          type="button"
                          onClick={() => {
                            const baseLangCode = acc.code.split("-")[0].toLowerCase();
                            onSettingsChange?.({
                              ttsLocale: acc.code,
                              ttsLocales: {
                                ...(settings?.ttsLocales || {}),
                                [baseLangCode]: acc.code
                              },
                              ttsEngine: "google"
                            });
                            setAccentOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                            currentLocale === acc.code
                              ? "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-black"
                              : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {acc.label}
                          {currentLocale === acc.code && " ✓"}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          
          <div className="min-w-0 font-sans">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-lg font-bold text-inherit capitalize tracking-tight leading-tight truncate select-all">
                {word}
              </h3>
              {!existingVocab && detectedPhrases && word && (detectedPhrases[word.toLowerCase()] || detectedPhrases[word]) && (
                <span className="text-[8px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900 px-1.5 py-0.5 rounded leading-none shrink-0 select-none animate-pulse">
                  ИИ Рекомендует
                </span>
              )}
            </div>
            {ipaValue && (
              <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400 font-semibold tracking-wider block mt-0.5">
                {ipaValue}
              </span>
            )}
            {componentWords.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 mt-1.5 max-w-full">
                {componentWords.map((comp, idx) => {
                  const compKey = comp.toLowerCase();
                  const lang = targetLanguage.toLowerCase();
                  const langKey = `${lang}_${compKey}`;
                  const compVocab = vocab ? (vocab[langKey] || vocab[compKey]) : null;
                  const status = compVocab ? compVocab.status : "new";
                  
                  let badgeBg = "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900/50";
                  if (status === "known") {
                    badgeBg = "bg-green-50 text-green-700 border-green-150 dark:bg-green-955/20 dark:text-green-400 dark:border-green-900/30";
                  } else if (status === "ignored") {
                    badgeBg = "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
                  } else if (status === "1") {
                    badgeBg = "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40";
                  } else if (status === "2") {
                    badgeBg = "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40";
                  } else if (status === "3") {
                    badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40";
                  } else if (status === "4") {
                    badgeBg = "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/40";
                  } else if (status === "5") {
                    badgeBg = "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/40";
                  }

                  return (
                    <button
                      key={`${comp}-${idx}`}
                      type="button"
                      onClick={() => onWordClick && onWordClick(compKey, sentence || word || "")}
                      className={`px-1.5 py-0.5 rounded text-[9.5px]/none font-extrabold border capitalize tracking-wide cursor-pointer transition-all hover:scale-105 active:scale-95 ${badgeBg}`}
                      title={`Нажмите, чтобы открыть "${comp}"`}
                    >
                      {comp}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            title="Закрыть панель"
            className="w-6.5 h-6.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {ttsWarning && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50 text-[11px] rounded-xl flex items-center justify-between gap-1 leading-snug shrink-0">
          <div className="flex-1">
            <span className="font-bold">Предупреждение: </span>
            {ttsWarning}
          </div>
          <button 
            type="button"
            onClick={() => setTtsWarning(null)} 
            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 font-bold px-1 select-none cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Meta Indicators: Coins Award, Grammar Category, Tag+ */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs shrink-0 pt-0.5">


        {/* Part of Speech / Grammar tag select dropdown */}
        <select
          value={grammarValue}
          onChange={(e) => {
            const newVal = e.target.value;
            setGrammarValue(newVal);
            if (word) {
              const nextStatus = status === "new" ? "2" : status;
              const updatedVocab = {
                word: word.toLowerCase(),
                translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : "Pending translation"),
                ipa: ipaValue || "",
                grammar: newVal,
                contextRelation: contextRelationValue || "",
                status: nextStatus,
                examples: examplesValue,
                createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
                tags: selectedTags,
                imageUrl: imageUrlValue,
              };
              onSaveVocab(updatedVocab);
              if (status === "new") {
                setStatus("2");
              }
            }
          }}
          className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-zinc-200/55 dark:border-zinc-700/60 max-w-[120px] truncate cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">Word</option>
          {STANDARD_TAGS.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
          {customTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
          {grammarValue && !STANDARD_TAGS.includes(grammarValue) && !customTags.includes(grammarValue) && (
            <option value={grammarValue}>{grammarValue}</option>
          )}
        </select>

        {/* Tag+ button to expand/toggle custom categorization tags list */}
        <button
          onClick={() => {
            setTagsOpen(!tagsOpen);
            setImageOpen(false);
            setBookOpen(false);
            setAiTabOpen(false);
          }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-0.5 transition-all cursor-pointer ${
            tagsOpen
              ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
              : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <Tag className="w-2.5 h-2.5" />
          <span>Tag+</span>
        </button>

        {/* Img+ button to toggle image search panel */}
        <button
          type="button"
          onClick={() => {
            setImageOpen(!imageOpen);
            setTagsOpen(false);
            setBookOpen(false);
            setAiTabOpen(false);
          }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-0.5 transition-all cursor-pointer ${
            imageOpen
              ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
              : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <Image className="w-2.5 h-2.5" />
          <span>Img+</span>
        </button>

        {/* Book+ button to toggle context search panel */}
        <button
          type="button"
          onClick={() => {
            setBookOpen(!bookOpen);
            setTagsOpen(false);
            setImageOpen(false);
            setAiTabOpen(false);
          }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-0.5 transition-all cursor-pointer ${
            bookOpen
              ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
              : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <BookOpen className="w-2.5 h-2.5" />
          <span>Book+</span>
        </button>

        {/* AI+ button to toggle Ask AI panel */}
        <button
          type="button"
          onClick={() => {
            setAiTabOpen(!aiTabOpen);
            setTagsOpen(false);
            setImageOpen(false);
            setBookOpen(false);
          }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-0.5 transition-all cursor-pointer ${
            aiTabOpen
              ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
              : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span>AI+</span>
        </button>
      </div>

      {/* Collapsible Section Layout Block */}
      <div className="space-y-2 overflow-y-auto pr-0.5 flex-1 scrollbar-thin dark:dark-scrollbar max-h-[calc(100vh-210px)]">

        {/* 1. Saved Meaning Container */}
        {!imageOpen && !bookOpen && !aiTabOpen && (
          <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl overflow-visible bg-zinc-50/40 dark:bg-zinc-950/20">
          <button
            onClick={() => setSavedMeaningOpen(!savedMeaningOpen)}
            className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors"
          >
            <span className="uppercase tracking-wider text-[9px] text-zinc-400 dark:text-zinc-500 font-extrabold font-sans">Saved Meaning</span>
            {savedMeaningOpen ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
          </button>

          {savedMeaningOpen && (
            <div className="p-2.5 pt-0 border-t border-zinc-100/70 dark:border-zinc-800 space-y-2">
              <div className="flex items-start gap-1.5 mt-1.5">
                <textarea
                  ref={meaningTextareaRef}
                  value={translationValue}
                  onChange={(e) => setTranslationValue(e.target.value)}
                  onBlur={handleSaveCustom}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSaveCustom();
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="Type a new meaning here..."
                  rows={1}
                  className="flex-1 p-2 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80 transition-all font-medium custom-scrollbar resize-none min-h-[34px] overflow-hidden"
                />
                {translationValue && translationValue !== "Pending translation" && !translationValue.startsWith("[") && (
                  <button
                    type="button"
                    onClick={handleDeleteTranslation}
                    title="Удалить перевод"
                    className="p-2 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-650 dark:text-red-400 border border-red-100/50 dark:border-red-900/50 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center self-stretch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dictionaries Section integrated directly in Saved Meaning Card */}
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => setDictionariesOpen(!dictionariesOpen)}
                    className="font-extrabold uppercase tracking-widest text-[8px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                  >
                    <BookOpen className="w-2.5 h-2.5 text-teal-600/80" /> Dictionaries
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowManageDictsModal(true);
                      handleCancelEditDict();
                    }}
                    className="text-[9px] font-bold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer focus:outline-none"
                  >
                    Manage &gt;
                  </button>
                </div>

                {dictionariesOpen && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {dictionaries.map((dict) => (
                      <button
                        key={dict.id}
                        type="button"
                        onClick={() => {
                          const url = dict.urlTemplate.replace("{word}", encodeURIComponent(word || ""));
                          if (dict.displayType === "new_tab") {
                            window.open(url, "_blank", "noopener,noreferrer");
                          } else if (dict.displayType === "window_popup") {
                            window.open(
                              url,
                              `dict_win_${dict.id}`,
                              "width=900,height=650,location=no,status=no,directories=no,menubar=no,toolbar=no,scrollbars=yes,resizable=yes"
                            );
                          } else {
                            setActiveDictUrl(url);
                            setActiveDictName(dict.name);
                          }
                        }}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 px-2 py-0.5 rounded-md text-[9px] font-bold text-zinc-600 dark:text-zinc-300 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>{dict.name}</span>
                        {dict.displayType === "popup" ? (
                          <span className="text-[7px] text-teal-600 dark:text-teal-400 font-extrabold uppercase bg-teal-50 dark:bg-teal-950/40 px-1 rounded border border-teal-100/50 dark:border-teal-900/10 font-sans">pop</span>
                        ) : dict.displayType === "window_popup" ? (
                          <span className="text-[7px] text-amber-600 dark:text-amber-400 font-extrabold uppercase bg-amber-50 dark:bg-amber-950/40 px-1 rounded border border-amber-100/50 dark:border-amber-900/10 font-sans">окно ⧉</span>
                        ) : (
                          <span className="text-[7px] text-blue-600 dark:text-blue-400 font-extrabold uppercase bg-blue-50 dark:bg-blue-950/40 px-1 rounded border border-blue-100/50 dark:border-blue-900/10 font-sans">tab ↗</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Word Variations Link (Pattern) integrated directly in Saved Meaning Card */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-100/40 dark:border-zinc-800/40 mt-1.5">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="font-extrabold uppercase tracking-widest text-[8.5px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                    🔗 Word Variations Link (Связь форм)
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-teal-50/70 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 font-mono">
                    zorro ⇄ zorros
                  </span>
                </div>

                {isLinked ? (
                  <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200/55 dark:border-zinc-800 p-2 rounded-lg font-medium shadow-3xs">
                    <p className="text-zinc-600 dark:text-zinc-300 text-[10.5px]">
                      Root: <strong className="text-teal-600 dark:text-teal-400 capitalize">{linkedParent}</strong>
                    </p>
                    <button
                      onClick={() => onDeleteWordLink(word!.toLowerCase())}
                      className="text-[9.5px] font-bold text-red-500 hover:text-red-650 cursor-pointer"
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 font-sans">
                    <div className="flex gap-1.5 relative">
                      <input
                        type="text"
                        placeholder="Base root (e.g. zorro)..."
                        value={parentWordInput}
                        onChange={(e) => setParentWordInput(e.target.value)}
                        className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <button
                        onClick={() => {
                          if (parentWordInput.trim() && word) {
                            onSaveWordLink(word.toLowerCase(), parentWordInput.trim().toLowerCase());
                            setParentWordInput("");
                          }
                        }}
                        disabled={!parentWordInput.trim()}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-950 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 text-[11px] shrink-0 cursor-pointer"
                      >
                        Link
                      </button>

                      {/* Auto-suggest dropdown */}
                      {liveSearchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 animate-in fade-in slide-in-from-top-1 duration-100">
                          {liveSearchResults.map((res) => (
                            <button
                              key={res.lower}
                              type="button"
                              onClick={() => {
                                if (word) {
                                  onSaveWordLink(word.toLowerCase(), res.lower);
                                  setParentWordInput("");
                                }
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900/60 flex justify-between items-center transition-colors cursor-pointer"
                            >
                              <span className="font-bold text-zinc-800 dark:text-zinc-200 capitalize">
                                {res.original}
                              </span>
                              {res.translation && (
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[150px] ml-2">
                                  {res.translation}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {suggestedLemmas.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-0.5">
                        <span className="text-[9.5px] text-zinc-400 dark:text-zinc-500 font-extrabold uppercase font-sans">
                          💡 Suggestions (Подсказки):
                        </span>
                        {suggestedLemmas.map((lemma) => (
                          <button
                            key={lemma}
                            onClick={() => {
                              if (word) {
                                onSaveWordLink(word.toLowerCase(), lemma);
                              }
                            }}
                            className="text-[9.5px] font-bold bg-teal-50/80 dark:bg-teal-950/35 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-600 dark:text-teal-400 px-1.5 py-0.5 rounded border border-teal-100/40 dark:border-teal-900/30 capitalize cursor-pointer font-sans transition-all active:scale-95"
                          >
                            {lemma}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Popular Meanings — merged into Saved Meaning card */}
              <div className="space-y-1 pt-2.5 border-t border-zinc-100/40 dark:border-zinc-800/40 mt-1.5">
                <span className="text-[8.5px] uppercase font-extrabold tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-teal-500 animate-pulse" /> Popular Meanings
                </span>
                <div className="space-y-1 max-h-[170px] overflow-y-auto scrollbar-thin w-full">
                  {popularMeanings().map((meaning, idx) => {
                    const isSelected = translationValue === meaning;
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectPopularMeaning(meaning)}
                        title={meaning}
                        className={`flex items-start justify-between p-2 rounded-lg text-[11px] font-medium transition-all group/row cursor-pointer ${
                          isSelected
                            ? "bg-teal-50/80 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900 text-teal-800 dark:text-teal-300 font-bold shadow-3xs"
                            : "bg-white dark:bg-zinc-900 border border-zinc-100/40 dark:border-zinc-800/40 hover:bg-zinc-100/50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="leading-normal break-words pr-2 capitalize flex-1">{meaning}</span>
                        <button
                          className={`w-4 h-4 rounded flex items-center justify-center transition-colors shadow-3xs group-hover/row:scale-105 shrink-0 self-center ${
                            isSelected
                              ? "bg-teal-600 text-white"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-teal-600 hover:text-white"
                          }`}
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Translation Source Selector */}
                <div className="space-y-1 pt-1.5 border-t border-zinc-100/40 dark:border-zinc-800/40 text-left shrink-0">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 dark:text-zinc-500 block pl-0.5">
                    Источник перевода (Source)
                  </span>
                  <div className="grid grid-cols-5 gap-0.5 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/60 text-[9px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleSetTranslationSource("ai")}
                      className={`py-1 rounded-md transition-all cursor-pointer ${
                        translationSource === "ai"
                          ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                    >
                      ✨ ИИ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTranslationSource("google")}
                      className={`py-1 rounded-md transition-all cursor-pointer ${
                        translationSource === "google"
                          ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                    >
                      🌐 Google
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTranslationSource("free_dictionary")}
                      className={`py-1 rounded-md transition-all cursor-pointer ${
                        translationSource === "free_dictionary"
                          ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                    >
                      📚 FreeDict
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTranslationSource("wiktionary")}
                      className={`py-1 rounded-md transition-all cursor-pointer ${
                        translationSource === "wiktionary"
                          ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                    >
                      📖 Wikt
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTranslationSource("hybrid")}
                      className={`py-1 rounded-md transition-all cursor-pointer ${
                        translationSource === "hybrid"
                          ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      }`}
                    >
                      🌐 Гибрид
                    </button>
                  </div>
                </div>

                {!loading && (
                  <button
                    type="button"
                    onClick={handleTranslate}
                    className="w-full py-1.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold text-[10.5px] rounded-lg shadow-3xs hover:shadow-2xs hover:from-teal-600 hover:to-teal-700 transition-all text-center flex items-center justify-center gap-1 cursor-pointer mt-1"
                  >
                    {translationSource === "ai" && <Sparkles className="w-3 h-3 animate-pulse" />}
                    {translationSource === "google" && <Languages className="w-3 h-3" />}
                    {translationSource === "free_dictionary" && <BookOpen className="w-3 h-3" />}
                    {translationSource === "wiktionary" && <BookOpen className="w-3 h-3" />}
                    {translationSource === "hybrid" && <Sparkles className="w-3 h-3" />}
                    <span>
                      {translationSource === "ai" && "AI Lookup translation ✨"}
                      {translationSource === "google" && "Google Translate (без ИИ) 🌐"}
                      {translationSource === "free_dictionary" && "Free Dictionary API"}
                      {translationSource === "wiktionary" && "Wiktionary REST API"}
                      {translationSource === "hybrid" && "Dictionary Hybrid Search 🌐"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Ask AI Section */}
        {aiTabOpen && (
          <div className="space-y-3 shrink-0 animate-in slide-in-from-top-1 duration-150">
            <div className="border border-purple-100 dark:border-purple-900/50 rounded-xl overflow-visible bg-purple-50/10 dark:bg-purple-950/5">
              <button
                type="button"
                onClick={() => setAskAiOpen(!askAiOpen)}
                className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-purple-50/20 dark:hover:bg-purple-950/10 transition-colors"
              >
                <span className="uppercase tracking-wider text-[9px] text-purple-600 dark:text-purple-400 font-black font-sans flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500 animate-pulse" /> Спросить ИИ (Ask AI)
                </span>
                {askAiOpen ? <ChevronUp className="w-3 h-3 text-purple-400" /> : <ChevronDown className="w-3 h-3 text-purple-400" />}
              </button>

              {askAiOpen && (
                <div className="p-2.5 pt-0 border-t border-purple-100/30 dark:border-purple-900/20 space-y-2.5">
                  <div className="relative mt-1.5">
                    <textarea
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      placeholder="Задайте вопрос к тексту... (например: Почему здесь такая форма? Объясни грамматику. Что это значит?)"
                      rows={2}
                      className="w-full p-2 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500/80 transition-all font-medium custom-scrollbar resize-none"
                    />
                  </div>

                  {/* Quick Prompts */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => handleAskAi("Объясни грамматику и форму слов")}
                      className="px-2 py-1 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100/50 dark:border-purple-900/30 transition-all cursor-pointer"
                    >
                      📖 Объясни грамматику
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAskAi("Что означает это выражение/идиома в данном контексте?")}
                      className="px-2 py-1 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100/50 dark:border-purple-900/30 transition-all cursor-pointer"
                    >
                      💡 Разбери смысл/идиому
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAskAi("Переведи дословно и объясни разницу")}
                      className="px-2 py-1 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100/50 dark:border-purple-900/30 transition-all cursor-pointer"
                    >
                      ⚡ Переведи дословно
                    </button>
                  </div>

                  {/* Action and status row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {customAiLoading && (
                        <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-bold">
                          <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                          <span className="truncate">ИИ формулирует ответ...</span>
                        </div>
                      )}
                      {customAiError && (
                        <div className="text-[10px] text-red-500 font-bold truncate" title={customAiError}>
                          Ошибка: {customAiError}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAskAi(customQuestion)}
                      disabled={customAiLoading || !customQuestion.trim()}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10.5px] font-bold shrink-0 transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      Спросить ИИ ✨
                    </button>
                  </div>

                  {/* Answer display */}
                  {customAnswer && (
                    <div className="space-y-1.5 pt-2.5 border-t border-purple-100/30 dark:border-purple-900/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400">Объяснение ИИ:</span>
                        <button
                          type="button"
                          onClick={handleSaveExplanation}
                          className="text-[9px] font-bold text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Save className="w-2.5 h-2.5" /> Сохранить в словарь
                        </button>
                      </div>
                      <div className="relative group/answer">
                        <textarea
                          value={customAnswer}
                          onChange={(e) => setCustomAnswer(e.target.value)}
                          rows={5}
                          className="w-full p-2 text-xs bg-purple-50/15 dark:bg-purple-950/5 border border-purple-100/50 dark:border-purple-900/20 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500/80 transition-all font-medium custom-scrollbar"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. AI Generated Sentences */}
            {examplesValue.length > 0 && (
              <div className="space-y-2 pt-1 font-sans">
                <span className="text-[10px] uppercase font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider flex items-center gap-1 pl-0.5">
                  <Award className="w-3.5 h-3.5 text-teal-500" /> Example Usages (AI)
                </span>
                <div className="space-y-2">
                  {examplesValue.map((ex, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-teal-50/20 dark:bg-teal-950/10 rounded-xl border border-teal-100/30 dark:border-teal-900/10 space-y-0.5 text-xs font-sans leading-normal shadow-3xs"
                    >
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">
                        {ex.text}
                      </p>
                      <p className="text-zinc-500 dark:text-zinc-400 italic">
                        {ex.translation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Custom categorization tags panel (rendered when Tag+ is active) */}
        {!imageOpen && !bookOpen && !aiTabOpen && tagsOpen && (
          <div className="p-2.5 bg-zinc-50/75 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2 animate-in slide-in-from-top-1 duration-150">
            <span className="text-[9px] uppercase font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider flex items-center gap-1">
              <Tag className="w-2.5 h-2.5 text-teal-600" /> Manage tags
            </span>
            <div className="flex flex-wrap gap-1 font-sans">
              {STANDARD_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => handleToggleTag(tag)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-900 shadow-2xs"
                        : "bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-800/50"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
              {customTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => handleToggleTag(tag)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-900"
                        : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800/50"
                    }`}
                  >
                    <span>{tag}</span>
                    <X
                      className="w-2.5 h-2.5 hover:text-red-500 shrink-0"
                      onClick={(e) => handleDeleteCustomTag(tag, e)}
                    />
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 pl-0.5">
              <input
                type="text"
                placeholder="New tag..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                className="flex-1 px-2 py-0.5 text-[10.5px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80"
              />
              <button
                onClick={handleAddCustomTag}
                className="px-2.5 py-0.5 bg-zinc-800 hover:bg-zinc-950 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-md text-[10.5px] font-bold shrink-0"
              >
                + Add
              </button>
            </div>
          </div>
        )}

        {/* 2.5. Pictures search & selection (Lute Image Search Requirement) */}
        {imageOpen && (
          <div className="p-2.5 bg-zinc-50/75 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5 animate-in slide-in-from-top-1 duration-150 font-sans">
            <span className="text-[9px] uppercase font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider flex items-center gap-1.5 pl-0.5">
              <span className="text-teal-600">🖼️</span> Изображение слова (Word Image)
            </span>

            {/* Selected Image Preview with delete handle */}
            {imageUrlValue ? (
              <div className="relative group/img rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100/20 dark:bg-zinc-900 max-h-32 flex items-center justify-center">
                <img
                  src={imageUrlValue.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(imageUrlValue)}` : imageUrlValue}
                  alt={word || ""}
                  className="max-h-32 max-w-full object-contain rounded-xl p-1"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectImage(null)}
                    className="px-2.5 py-1 bg-red-650 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 cursor-pointer shadow-sm transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Удалить (Remove)
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-normal border border-dashed border-zinc-200 dark:border-zinc-800 p-2 text-center rounded-lg font-medium bg-white dark:bg-zinc-900/40">
                Изображение не выбрано. Выберите ниже или вставьте картинку.
              </div>
            )}

            {/* Paste from clipboard and custom upload action zone */}
            <div className="grid grid-cols-2 gap-2 font-sans text-[10px]">
              <div
                onPaste={handleClipboardPaste}
                tabIndex={0}
                className="p-1 px-1.5 border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg text-center text-zinc-500 cursor-pointer hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-800 dark:hover:text-teal-400 transition-all font-medium flex flex-col justify-center items-center h-12 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                title="Click here, then press Ctrl+V (or Command+V) to paste any copied image from your clipboard!"
              >
                <span className="font-extrabold uppercase text-[7.5px] text-zinc-400">Paste clipboard</span>
                <span className="text-[9.5px] mt-0.5 font-bold">Нажмите и вставьте Ctrl+V</span>
              </div>

              <label className="p-1 px-1.5 border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg text-center text-zinc-500 cursor-pointer hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-800 dark:hover:text-teal-400 transition-all font-medium flex flex-col justify-center items-center h-12">
                <span className="font-extrabold uppercase text-[7.5px] text-zinc-400">File upload</span>
                <span className="text-[9.5px] mt-0.5 font-bold">Загрузить файл (Upload)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Keyword Search Row */}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={imageSearchKeyword}
                onChange={(e) => setImageSearchKeyword(e.target.value)}
                placeholder="Keyword to search..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchImages(imageSearchKeyword);
                  }
                }}
                className="flex-1 px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
              />
              <button
                type="button"
                onClick={() => handleSearchImages(imageSearchKeyword)}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-md text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
              >
                Поиск
              </button>
            </div>

            {/* Searched Results Horizontal Grid */}
            <div className="space-y-1 w-full">
              <span className="text-[8.5px] uppercase font-extrabold tracking-widest text-zinc-400 dark:text-zinc-500">Результаты поиска Unsplash:</span>
              
              {imagesLoading ? (
                <div className="py-4 flex items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 font-bold text-[10px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  <span>Ищем картинки...</span>
                </div>
              ) : imageSearchError ? (
                <div className="text-[10px] text-rose-500 py-1 font-bold text-center">
                  {imageSearchError}
                </div>
              ) : imagesList.length > 0 ? (
                <div className="grid grid-cols-4 gap-1 max-h-[140px] overflow-y-auto scrollbar-thin rounded-lg p-0.5">
                  {imagesList.map((img) => {
                    const isSelected = imageUrlValue === img.url;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => handleSelectImage(img.url)}
                        title={`${img.description} by ${img.author}`}
                        className={`relative aspect-square w-full rounded-md overflow-hidden border transition-all cursor-pointer hover:scale-103 group ${
                          isSelected
                            ? "ring-2 ring-teal-500 border-transparent shadow-xs"
                            : "border-zinc-100 hover:border-zinc-400/80"
                        }`}
                      >
                        <img
                          src={img.thumb}
                          alt={img.description}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[6.5px] px-0.5 py-0.25 truncate opacity-0 group-hover:opacity-100 transition-opacity leading-none">
                          {img.author}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center py-2 font-medium">
                  Нет картинок. Попробуйте другой запрос.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dedicated Context Search Tab content */}
        {bookOpen && (
          <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
            {contextSearchHits.length > 0 ? (
              <ContextSearchResults
                hits={contextSearchHits}
                query={word || ""}
                currentLessonId={currentLessonId}
                onOpenLesson={onOpenLesson}
                compact={false}
              />
            ) : (
              <div className="text-zinc-400 dark:text-zinc-500 text-center py-10 text-[11px] font-medium border border-zinc-200 dark:border-zinc-800/60 rounded-xl bg-zinc-50/40 dark:bg-zinc-950/20 font-sans">
                📖 Вхождений в других книгах не найдено.
              </div>
            )}
          </div>
        )}


        {/* 4. Related Phrases Card */}
        {!imageOpen && !bookOpen && !aiTabOpen && sentence && (
          <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-50/40 dark:bg-zinc-950/20">
            <button
              onClick={() => setRelatedPhrasesOpen(!relatedPhrasesOpen)}
              className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors"
            >
              <span className="uppercase tracking-wider text-[9px] text-zinc-400 dark:text-zinc-500 font-extrabold font-sans">Context Sentence</span>
              {relatedPhrasesOpen ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
            </button>

            {relatedPhrasesOpen && (
              <div className="p-2.5 pt-0 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 italic leading-relaxed pt-1.5">
                  &ldquo;{sentence}&rdquo;
                </p>
                {contextRelationValue && (
                  <div className="mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 p-1.5 rounded-lg text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal font-medium">
                    {contextRelationValue}
                  </div>
                )}
              </div>
            )}
          </div>
        )}





        {/* 7. Loader Status indicators when AI translates */}
        {!imageOpen && !bookOpen && !aiTabOpen && loading && (
          <div className="p-6 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold animate-pulse">Running smart translation analysis...</p>
          </div>
        )}

        {!imageOpen && !bookOpen && !aiTabOpen && error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 text-rose-600 dark:text-rose-400 border border-red-200/50 dark:border-rose-900 text-xs rounded-xl flex flex-col gap-1.5 leading-normal">
            <span className="font-bold">Translation Error Info</span>
            <span>{error}</span>
            <button
              onClick={handleTranslate}
              className="text-[10px] font-extrabold text-teal-600 dark:text-teal-400 cursor-pointer self-start uppercase hover:underline animate-pulse"
            >
              Try again
            </button>
          </div>
        )}

      </div>

      {/* Solid horizontal thick grey divider before actions footer */}
      <hr className="border-t border-zinc-100 dark:border-zinc-800 my-1 shrink-0" />

      {/* Sticky Bottom Actions Toolbar containing Trash, Ignore, 1, 2, 3, 4, Known */}
      <div className="flex items-center justify-between gap-1.5 pt-1 shrink-0 pb-1">
        
        {/* Trash delete / reset word button */}
        <button
          onClick={() => handleUpdateStatus("new")}
          title="Стереть слово (Wipe word status)"
          className="w-8 h-8 border border-zinc-200 dark:border-zinc-800 hover:border-red-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-zinc-400 hover:text-rose-600 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-3xs shrink-0 active:scale-90"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Ignore word button with Ban icon */}
        <button
          onClick={() => handleUpdateStatus("ignored")}
          title="Игнорировать (Ignore word)"
          className={`w-8 h-8 border rounded-full flex items-center justify-center transition-all cursor-pointer shadow-3xs shrink-0 active:scale-95 ${
            status === "ignored"
              ? "bg-zinc-800 border-zinc-700 text-white dark:bg-zinc-200 dark:border-zinc-300 dark:text-zinc-950 pointer-events-none"
              : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-700 hover:border-zinc-300 dark:hover:text-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
        >
          <Ban className="w-4 h-4" />
        </button>

        {/* Status circle buttons bar: 1, 2, 3, 4 */}
        <div className="flex items-center gap-1.5 flex-1 justify-center font-sans">
          {/* Level 1 buttons */}
          <button
            onClick={() => handleUpdateStatus("1")}
            title="Level 1: Unfamiliar"
            className={`w-7 h-7 rounded-full font-bold text-[11px] flex items-center justify-center border transition-all cursor-pointer active:scale-90 ${
              status === "1"
                ? "bg-[#f3a4b0] text-rose-950 border-rose-300 font-extrabold shadow-sm pointer-events-none"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-rose-50 dark:hover:bg-rose-950/10 hover:text-rose-600"
            }`}
          >
            1
          </button>

          {/* Level 2 buttons */}
          <button
            onClick={() => handleUpdateStatus("2")}
            title="Level 2: Difficult"
            className={`w-7 h-7 rounded-full font-bold text-[11px] flex items-center justify-center border transition-all cursor-pointer active:scale-90 ${
              status === "2"
                ? "bg-[#f0d46d] text-amber-950 border-amber-305 font-extrabold shadow-sm pointer-events-none"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-amber-50 dark:hover:bg-amber-950/10 hover:text-amber-600"
            }`}
          >
            2
          </button>

          {/* Level 3 buttons */}
          <button
            onClick={() => handleUpdateStatus("3")}
            title="Level 3: Learning"
            className={`w-7 h-7 rounded-full font-bold text-[11px] flex items-center justify-center border transition-all cursor-pointer active:scale-90 ${
              status === "3" || status === "learning"
                ? "bg-[#a6d896] text-emerald-950 border-emerald-300 font-extrabold shadow-sm pointer-events-none"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/10 hover:text-emerald-600"
            }`}
          >
            3
          </button>

          {/* Level 4 buttons */}
          <button
            onClick={() => handleUpdateStatus("4")}
            title="Level 4: Familiar"
            className={`w-7 h-7 rounded-full font-bold text-[11px] flex items-center justify-center border transition-all cursor-pointer active:scale-90 ${
              status === "4"
                ? "bg-[#99bce8] text-blue-950 border-blue-300 font-extrabold shadow-sm pointer-events-none"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-blue-50 dark:hover:bg-blue-950/10 hover:text-blue-600"
            }`}
          >
            4
          </button>

          {/* Level 5 buttons */}
          <button
            onClick={() => handleUpdateStatus("5")}
            title="Level 5: Mastered"
            className={`w-7 h-7 rounded-full font-bold text-[11px] flex items-center justify-center border transition-all cursor-pointer active:scale-90 ${
              status === "5"
                ? "bg-[#c5aee2] text-purple-950 border-purple-300 font-extrabold shadow-sm pointer-events-none"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-purple-50 dark:hover:bg-purple-950/10 hover:text-purple-600"
            }`}
          >
            5
          </button>
        </div>

        {/* Green Checkmark button for status "known" */}
        <button
          onClick={() => handleUpdateStatus("known")}
          title="Отметить как известное (Known)"
          className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0 ${
            status === "known"
              ? "bg-green-600 text-white border-green-500 shadow-md shadow-green-500/15 pointer-events-none"
              : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-green-600 hover:bg-green-50/50 dark:hover:bg-green-950/20"
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
        </button>

      </div>

      {showManageDictsModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 pointer-events-auto font-sans text-left">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[85vh]">
            {/* Header */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between animate-none">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-black uppercase text-zinc-700 dark:text-zinc-300 tracking-wider">
                  Управление словарями (Manage Dictionaries)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManageDictsModal(false);
                  handleCancelEditDict();
                }}
                className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg bg-zinc-100 dark:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
              
              {/* Form container: ONLY SHOW when adding or editing, so it doesn't block lists! */}
              {(showAddForm || editingDict) ? (
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-teal-500/20 dark:border-teal-500/10 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 font-sans">
                      {editingDict ? "Редактировать словарь" : "Добавить новый словарь"}
                    </h4>
                    <button
                      type="button"
                      onClick={handleCancelEditDict}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1 font-sans">
                        Название (Name)
                      </label>
                      <input
                        type="text"
                        value={dictFormName}
                        onChange={(e) => setDictFormName(e.target.value)}
                        placeholder="Например: Spanishdict, WordReference..."
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1 font-sans">
                        Шаблон ссылки (URL Template)
                      </label>
                      <input
                        type="text"
                        value={dictFormUrl}
                        onChange={(e) => setDictFormUrl(e.target.value)}
                        placeholder="https://example.com/search?q={word}"
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                      />
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 block leading-relaxed font-sans">
                        Используйте плейсхолдер <code className="text-teal-600 dark:text-teal-400 font-mono font-bold">{`{word}`}</code> в ссылке. Он автоматически заменится на выделенное слово.
                      </span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5 font-sans">
                        Тип отображения (Display Type)
                      </label>
                      <div className="grid grid-cols-3 gap-2 font-sans">
                        <button
                          type="button"
                          onClick={() => setDictFormType("new_tab")}
                          className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            dictFormType === "new_tab"
                              ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-900/50 dark:text-teal-400 font-extrabold shadow-inner"
                              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          }`}
                        >
                          <ExternalLink className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                          <span className="text-center">Новая вкладка</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDictFormType("popup")}
                          className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            dictFormType === "popup"
                              ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-900/50 dark:text-teal-400 font-extrabold shadow-inner"
                              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          }`}
                        >
                          <BookOpen className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                          <span className="text-center">Во фрейме (popup)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDictFormType("window_popup")}
                          className={`py-2 px-1 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            dictFormType === "window_popup"
                              ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-900/50 dark:text-teal-400 font-extrabold shadow-inner"
                              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          }`}
                        >
                          <AppWindow className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                          <span className="text-center">Мини-окно поверх</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1 font-sans">
                    <button
                      type="button"
                      onClick={handleCancelEditDict}
                      className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold transition-colors text-xs cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDictionary}
                      disabled={!dictFormName.trim() || !dictFormUrl.trim()}
                      className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingDict ? "Сохранить изменения" : "Добавить словарь"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center font-sans gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Вы уверены, что хотите сбросить список словарей на значения по умолчанию для текущего языка?")) {
                        const defaults = getDefaultDictionaries(targetLanguage, translationLanguage);
                        setDictionaries(defaults);
                        safeLocalStorageSetItem(activeStorageKey, JSON.stringify(defaults));
                      }
                    }}
                    className="px-3 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Сбросить по умолчанию</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-400 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-teal-100 dark:border-teal-900/30 cursor-pointer shadow-xs font-sans"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Добавить новый словарь (Add Dictionary)</span>
                  </button>
                </div>
              )}

              {/* List of existing dictionaries */}
              <div className="space-y-2 font-sans">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Список словарей (Available Dictionaries)
                </h4>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900">
                  {dictionaries.map((dict) => (
                    <div
                      key={dict.id}
                      className="p-3 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-all gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-zinc-700 dark:text-zinc-200 truncate">
                            {dict.name}
                          </span>
                          {dict.displayType === "popup" ? (
                            <span className="text-[7.5px] text-teal-600 dark:text-teal-400 font-extrabold uppercase bg-teal-50 dark:bg-teal-950/40 px-1 rounded border border-teal-100/50 dark:border-teal-900/10 font-sans">
                              pop
                            </span>
                          ) : dict.displayType === "window_popup" ? (
                            <span className="text-[7.5px] text-amber-600 dark:text-amber-400 font-extrabold uppercase bg-amber-50 dark:bg-amber-950/40 px-1 rounded border border-amber-100/50 dark:border-amber-900/10 font-sans">
                              окно ⧉
                            </span>
                          ) : (
                            <span className="text-[7.5px] text-blue-600 dark:text-blue-400 font-extrabold uppercase bg-blue-50 dark:bg-blue-950/40 px-1 rounded border border-blue-100/50 dark:border-blue-900/10 font-sans">
                              tab ↗
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-sm mt-0.5 animate-none" title={dict.urlTemplate}>
                          {dict.urlTemplate}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 animate-none">
                        <button
                          type="button"
                          onClick={() => handleStartEditDict(dict)}
                          className="p-1 px-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                          title="Редактировать словарь"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>ред.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDictionary(dict.id)}
                          className="p-1 px-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                          title="Удалить словарь"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>уд.</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {dictionaries.length === 0 && (
                    <div className="p-6 text-center text-zinc-400 text-xs">
                      Словари отсутствуют. Вы можете добавить новый выше!
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end px-5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (dictFormName.trim() && dictFormUrl.trim()) {
                    handleSaveDictionary();
                  }
                  setShowManageDictsModal(false);
                  handleCancelEditDict();
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all text-xs shadow-xs cursor-pointer focus:outline-none flex items-center justify-center gap-2"
              >
                <span>Сохранить и закрыть</span>
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {activeDictUrl && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 pointer-events-auto font-sans text-left">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-teal-600 dark:text-teal-400 font-bold text-base">📖</span>
                <span id="dict-modal-title" className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                  {activeDictName}: &ldquo;<span className="lowercase text-teal-600 dark:text-teal-400 font-mono font-bold select-all">{word}</span>&rdquo;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={activeDictUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-400 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <span>Открыть в новом окне (Open Link) ↗</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDictUrl(null);
                    setActiveDictName("");
                  }}
                  className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg bg-zinc-100 dark:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Modal Body with iframe */}
            <div className="flex-grow bg-zinc-50 dark:bg-zinc-950 relative">
              <iframe
                src={activeDictUrl}
                title={activeDictName}
                className="w-full h-full border-none bg-white dark:bg-white rounded-b-2xl"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
              <div className="absolute bottom-2.5 right-2.5 max-w-sm p-3 bg-zinc-900/90 text-white rounded-xl text-[10px] leading-relaxed font-sans shadow-md pointer-events-none border border-zinc-500/10">
                ⚠️ Если словарь пуст или не отображается из-за защиты сайта (X-Frame-Options), просто нажмите кнопку <strong>&laquo;Открыть в новом окне&raquo;</strong> в правом верхнем углу!
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
