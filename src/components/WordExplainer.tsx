/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { VocabItem, WordStatus, ExampleSentence, Dictionary, DictionaryItem, TabDictionaryPreferences, UserDictionaryPreferences, ReaderSettings, Lesson } from "../types";
import { safeJsonParse, getTtsAudioFromCache, saveTtsAudioToCache, getLanguageCode, getBCP47LanguageTag, getEffectiveTtsLocale, getEffectiveLocalTtsVoice, getLanguageNameWithDialect, safeLocalStorageSetItem } from "../utils";
import { getSuggestedLemmas } from "../morphology";
import { searchWordInLessons } from "../contextSearch";
import ContextSearchResults from "./ContextSearchResults";
import ImageSearch from "./ImageSearch";
import AiExplainerChat from "./AiExplainerChat";
import WordNetSynsetsView from "./WordNetSynsetsView";
import { BookOpen, Check, HelpCircle, Loader2, Award, Volume2, Ban, Sparkles, Tag, Plus, X, ChevronDown, ChevronUp, Trash2, Edit, ExternalLink, AppWindow, Image, Upload, Languages, Save, Layers, Network } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { useToast } from "../context/ToastContext";
import { executeAiWithFailover, getOrCreateAiProfiles } from "../services/aiFailoverService";
import { ignoreListManager } from "../services/ignoreListService";
import { compareWords } from "../utils/stringUtils";
import { resolveTargetLanguage } from "../utils/languageUtils";

const sanitizeGrammarTag = (tag: string) => {
  if (!tag) return "";
  const tagLower = tag.toLowerCase().trim();
  if (tagLower === "verb" || tagLower.includes("глагол") || tagLower === "гл" || tagLower.includes("auxiliary")) return "Verb";
  if (tagLower === "noun" || tagLower.includes("существительн") || tagLower === "сущ") return "Noun";
  if (tagLower === "adjective" || tagLower.includes("прилагательн") || tagLower === "прил" || tagLower === "adj") return "Adjective";
  if (tagLower === "adverb" || tagLower.includes("наречи") || tagLower === "нар" || tagLower === "adv") return "Adverb";
  if (tagLower === "pronoun" || tagLower.includes("местоимени") || tagLower === "мест" || tagLower === "pron") return "Pronoun";
  if (tagLower === "preposition" || tagLower.includes("предлог") || tagLower === "prep") return "Preposition";
  if (tagLower === "conjunction" || tagLower.includes("союз") || tagLower === "conj") return "Conjunction";
  if (tagLower === "determiner" || tagLower.includes("артикль") || tagLower === "article" || tagLower === "art") return "Determiner";
  if (tagLower.includes("междомети") || tagLower === "interj" || tagLower === "interjection") return "Interjection";
  if (tagLower.includes("идиом") || tagLower === "idiom") return "Idiom";
  if (tagLower.includes("фразов") || tagLower.includes("phrasal") || tagLower === "phrasal verb") return "Phrasal Verb";
  if (tagLower.includes("выражени") || tagLower.includes("phrase")) return "Phrase";

  let cleaned = tag.split(/[,\(\[\/]/)[0].trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
};

const STANDARD_TAGS = ["Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Idiom", "Phrasal Verb", "Phrase"];

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
  if (norm.startsWith("kk") || norm.startsWith("kaz") || norm === "казахский" || norm === "қазақша" || norm === "қазақ тілі") return "kazakh";
  return norm || "english";
};

export const sanitizeDictItem = (d: any): DictionaryItem => {
  const isGtransOrReverso = (
    d.name?.includes("Google") ||
    d.name?.includes("Reverso") ||
    d.id?.includes("gtrans") ||
    d.id?.includes("reverso")
  );
  let displayType = d.displayType;
  if (!displayType || (isGtransOrReverso && displayType === "new_tab")) {
    displayType = "window_popup";
  }
  return {
    id: d.id || `dict_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: d.name || "Dictionary",
    urlTemplate: d.urlTemplate || "",
    displayType: displayType || "window_popup",
    enabled: d.enabled !== false,
    order: typeof d.order === "number" ? d.order : undefined
  };
};

export const getDefaultMeaningDictionaries = (targetLanguage: string, translationLanguage: string): DictionaryItem[] => {
  const sourceCode = getLanguageCode(targetLanguage);
  const targetCode = getLanguageCode(translationLanguage);
  const sourceReverso = getLanguageReversoName(targetLanguage);
  const targetReverso = getLanguageReversoName(translationLanguage);

  if (sourceCode === "es") {
    return [
      {
        id: "gtrans-es",
        name: "Google Translate",
        urlTemplate: `https://translate.google.com/?sl=es&tl=${targetCode}&text={word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "reverso-es",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/spanish-${targetReverso}/{word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "spanishdict",
        name: "Spanishdict",
        urlTemplate: "https://www.spanishdict.com/translate/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "collins-es",
        name: "Collins",
        urlTemplate: "https://www.collinsdictionary.com/dictionary/spanish-english/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "cambridge-es",
        name: "Cambridge",
        urlTemplate: "https://dictionary.cambridge.org/dictionary/spanish-english/{word}",
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "en") {
    return [
      {
        id: "gtrans-en",
        name: "Google Translate",
        urlTemplate: `https://translate.google.com/?sl=en&tl=${targetCode}&text={word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "reverso-en",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/english-${targetReverso}/{word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "cambridge-en",
        name: "Cambridge",
        urlTemplate: `https://dictionary.cambridge.org/dictionary/english-${targetReverso}/{word}`,
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "uk") {
    return [
      {
        id: "gtrans-uk",
        name: "Google Translate",
        urlTemplate: `https://translate.google.com/?sl=uk&tl=${targetCode}&text={word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "goroh-declension",
        name: "Горох (Словозміна)",
        urlTemplate: "https://goroh.pp.ua/Словозміна/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "reverso-uk",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/ukrainian-${targetReverso}/{word}`,
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "pt") {
    return [
      {
        id: "gtrans-pt",
        name: "Google Translate",
        urlTemplate: `https://translate.google.com/?sl=pt&tl=${targetCode}&text={word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "reverso-pt",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/portuguese-${targetReverso}/{word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "collins-pt",
        name: "Collins",
        urlTemplate: "https://www.collinsdictionary.com/dictionary/portuguese-english/{word}",
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "kk") {
    return [
      {
        id: "gtrans-kk",
        name: "Google Translate",
        urlTemplate: `https://translate.google.com/?sl=kk&tl=${targetCode}&text={word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "sozdik-kk",
        name: "Sozdik.kz",
        urlTemplate: `https://sozdik.kz/${targetCode === "ru" ? "ru" : "en"}/dictionary/translate/kk/${targetCode === "ru" ? "ru" : "en"}/{word}`,
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "reverso-kk",
        name: "Reverso Context",
        urlTemplate: `https://context.reverso.net/translation/kazakh-${targetReverso}/{word}`,
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  return [
    {
      id: "gtrans-auto",
      name: "Google Translate",
      urlTemplate: `https://translate.google.com/?sl=${sourceCode}&tl=${targetCode}&text={word}`,
      displayType: "window_popup",
      enabled: true
    },
    {
      id: "reverso-auto",
      name: "Reverso Context",
      urlTemplate: `https://context.reverso.net/translation/${sourceReverso}-${targetReverso}/{word}`,
      displayType: "window_popup",
      enabled: true
    }
  ];
};

export const getDefaultDefinitionDictionaries = (targetLanguage: string): DictionaryItem[] => {
  const sourceCode = getLanguageCode(targetLanguage);

  if (sourceCode === "es") {
    return [
      {
        id: "rae-def",
        name: "RAE (DLE)",
        urlTemplate: "https://dle.rae.es/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "wordreference-es-def",
        name: "WordReference (Definición)",
        urlTemplate: "https://www.wordreference.com/definicion/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "wiktionary-es-def",
        name: "Wikcionario (ES)",
        urlTemplate: "https://es.wiktionary.org/wiki/{word}",
        displayType: "popup",
        enabled: true
      },
      {
        id: "cambridge-es-def",
        name: "Cambridge (Definición)",
        urlTemplate: "https://dictionary.cambridge.org/dictionary/spanish/{word}",
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "en") {
    return [
      {
        id: "cambridge-en-def",
        name: "Cambridge English",
        urlTemplate: "https://dictionary.cambridge.org/dictionary/english/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "simple-wiktionary-def",
        name: "Simple Wiktionary",
        urlTemplate: "https://simple.wiktionary.org/wiki/{word}",
        displayType: "popup",
        enabled: true
      },
      {
        id: "merriam-webster-def",
        name: "Merriam-Webster",
        urlTemplate: "https://www.merriam-webster.com/dictionary/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "collins-en-def",
        name: "Collins English",
        urlTemplate: "https://www.collinsdictionary.com/dictionary/english/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "oxford-learners-def",
        name: "Oxford Learner's",
        urlTemplate: "https://www.oxfordlearnersdictionaries.com/definition/english/{word}",
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "fr") {
    return [
      {
        id: "larousse-fr-def",
        name: "Larousse",
        urlTemplate: "https://www.larousse.fr/dictionnaires/francais/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "robert-fr-def",
        name: "Le Robert",
        urlTemplate: "https://dictionnaire.lerobert.com/definition/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "wiktionary-fr-def",
        name: "Wiktionnaire (FR)",
        urlTemplate: "https://fr.wiktionary.org/wiki/{word}",
        displayType: "popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "de") {
    return [
      {
        id: "duden-de-def",
        name: "Duden",
        urlTemplate: "https://www.duden.de/suchen/dudenonline/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "dwds-de-def",
        name: "DWDS",
        urlTemplate: "https://www.dwds.de/wb/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "wiktionary-de-def",
        name: "Wiktionary (DE)",
        urlTemplate: "https://de.wiktionary.org/wiki/{word}",
        displayType: "popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "ru") {
    return [
      {
        id: "gramota-ru-def",
        name: "Грамота.ру",
        urlTemplate: "https://gramota.ru/poisk?query={word}&mode=slovari",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "wiktionary-ru-def",
        name: "Викисловарь",
        urlTemplate: "https://ru.wiktionary.org/wiki/{word}",
        displayType: "popup",
        enabled: true
      },
      {
        id: "academic-ru-def",
        name: "Академик",
        urlTemplate: "https://dic.academic.ru/searchall.php?SWord={word}",
        displayType: "window_popup",
        enabled: true
      }
    ];
  }

  if (sourceCode === "uk") {
    return [
      {
        id: "goroh-uk-def",
        name: "Горох (Тлумачення)",
        urlTemplate: "https://goroh.pp.ua/Тлумачення/{word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "slovnyk-uk-def",
        name: "Словник.ua",
        urlTemplate: "https://slovnyk.ua/index.php?swrd={word}",
        displayType: "window_popup",
        enabled: true
      },
      {
        id: "wiktionary-uk-def",
        name: "Вікісловник",
        urlTemplate: "https://uk.wiktionary.org/wiki/{word}",
        displayType: "popup",
        enabled: true
      }
    ];
  }

  return [
    {
      id: "wiktionary-gen-def",
      name: "Wiktionary",
      urlTemplate: `https://${sourceCode}.wiktionary.org/wiki/{word}`,
      displayType: "popup",
      enabled: true
    }
  ];
};

export const getDefaultDictionaries = (targetLanguage: string, translationLanguage: string): DictionaryItem[] => {
  return getDefaultMeaningDictionaries(targetLanguage, translationLanguage);
};

export const normalizeDictionaryPreferences = (
  raw: any,
  targetLanguage: string,
  translationLanguage: string
): TabDictionaryPreferences => {
  const defaultMeaning = getDefaultMeaningDictionaries(targetLanguage, translationLanguage);
  const defaultDefinition = getDefaultDefinitionDictionaries(targetLanguage);

  if (!raw) {
    return { meaning: defaultMeaning, definition: defaultDefinition };
  }

  // Backward compatibility: if raw is an old flat array DictionaryItem[]
  if (Array.isArray(raw)) {
    const migratedMeaning = raw.map(sanitizeDictItem);
    return {
      meaning: migratedMeaning.length > 0 ? migratedMeaning : defaultMeaning,
      definition: defaultDefinition
    };
  }

  // If raw is TabDictionaryPreferences object { meaning?, definition? }
  if (typeof raw === "object") {
    let meaningList: DictionaryItem[] = [];
    let definitionList: DictionaryItem[] = [];

    if (Array.isArray(raw.meaning)) {
      meaningList = raw.meaning.map(sanitizeDictItem);
    } else {
      meaningList = defaultMeaning;
    }

    if (Array.isArray(raw.definition)) {
      definitionList = raw.definition.map(sanitizeDictItem);
    } else {
      definitionList = defaultDefinition;
    }

    return {
      meaning: meaningList.length > 0 ? meaningList : defaultMeaning,
      definition: definitionList.length > 0 ? definitionList : defaultDefinition
    };
  }

  return { meaning: defaultMeaning, definition: defaultDefinition };
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
  textLemmas?: Record<string, string>;
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

function WordExplainer({
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
  textLemmas,
  currentLessonId,
  onOpenLesson,
}: WordExplainerProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const activeSettings = settings || { readerTheme: "default" };
  const explainerThemeMap = {
    default: "bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100",
    cream: "bg-[#fcf8f2] dark:bg-zinc-900 border-[#eddcb9] dark:border-zinc-800/80 text-[#3d2c16] dark:text-zinc-100",
    sepia: "bg-[#f7f4eb] dark:bg-zinc-900 border-[#e5dec9] dark:border-zinc-800/80 text-[#2c2a29] dark:text-zinc-100",
    slate: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100",
  };
  const themeClasses = explainerThemeMap[activeSettings.readerTheme || "default"] || explainerThemeMap.default;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsWarning, setTtsWarning] = useState<string | null>(null);

  const [playingSpeech, setPlayingSpeech] = useState(false);
  const [accentOpen, setAccentOpen] = useState(false);
  const [savedMeaningOpen, setSavedMeaningOpen] = useState(true);
  const [dictionariesOpen, setDictionariesOpen] = useState(true);
  const [wordVariationsOpen, setWordVariationsOpen] = useState(false);
  const [relatedPhrasesOpen, setRelatedPhrasesOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vocab_related_phrases_open") !== "false";
    }
    return true;
  });
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
  const [aiTabOpen, setAiTabOpen] = useState(false);
  const [examplesTabOpen, setExamplesTabOpen] = useState(false);
  const [imageUrlValue, setImageUrlValue] = useState<string | null>(null);
  // Frequency & CEFR data state
  const [frequencyData, setFrequencyData] = useState<{ rank?: number; cefr: string; found: boolean } | null>(null);
  // Ask AI state variables (only answer is kept in WordExplainer for saving)
  const [customAnswer, setCustomAnswer] = useState("");

  const autoIgnoreInfo = useMemo(() => {
    if (!word || existingVocab) {
      return { isIgnored: false, categoryId: null, categoryLabelRu: "", categoryLabelEn: "", icon: "" };
    }
    return ignoreListManager.checkAutoIgnore(word, settings, targetLanguage);
  }, [word, existingVocab, settings, targetLanguage]);

  const handleSelectImage = (url: string | null) => {
    setImageUrlValue(url);
    if (word) {
      const nextStatus = status === "new" ? "2" : status;
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : ""),
        definition: definitionValue.trim() || existingVocab?.definition || undefined,
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
  const [definitionValue, setDefinitionValue] = useState("");
  const [savedMeaningTab, setSavedMeaningTab] = useState<"meaning" | "definition">("meaning");
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

  const pinnedLang = typeof window !== "undefined" ? localStorage.getItem("vocab_default_translation_language") : null;
  const effectiveTranslationLanguage = useMemo(() => {
    return resolveTargetLanguage(
      targetLanguage,
      translationLanguage,
      pinnedLang,
      i18n.language
    );
  }, [targetLanguage, translationLanguage, pinnedLang, i18n.language]);

  // Third-party Dictionaries Preferences (Meaning & Definition separation + Multi-device sync)
  const [dictPreferences, setDictPreferences] = useState<TabDictionaryPreferences>(() => {
    return normalizeDictionaryPreferences(null, targetLanguage, effectiveTranslationLanguage);
  });
  const [manageDictsTab, setManageDictsTab] = useState<"meaning" | "definition">("meaning");

  const activeLangKey = useMemo(() => {
    return `${(targetLanguage || "unknown").toLowerCase()}_${(effectiveTranslationLanguage || "unknown").toLowerCase()}`;
  }, [targetLanguage, effectiveTranslationLanguage]);

  const activePrefsStorageKey = useMemo(() => {
    return `vocab_clone_dict_prefs_${activeLangKey}`;
  }, [activeLangKey]);

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
    // 1. Instant load from localStorage (new format or legacy format fallback)
    const savedPrefs = localStorage.getItem(activePrefsStorageKey);
    if (savedPrefs) {
      try {
        const parsed = JSON.parse(savedPrefs);
        setDictPreferences(normalizeDictionaryPreferences(parsed, targetLanguage, effectiveTranslationLanguage));
      } catch (err) {
        console.error("Error parsing saved dictionary preferences:", err);
      }
    } else {
      const legacySaved = localStorage.getItem(`vocab_clone_dicts_${activeLangKey}`);
      if (legacySaved) {
        try {
          const parsedLegacy = JSON.parse(legacySaved);
          const normalized = normalizeDictionaryPreferences(parsedLegacy, targetLanguage, effectiveTranslationLanguage);
          setDictPreferences(normalized);
          safeLocalStorageSetItem(activePrefsStorageKey, JSON.stringify(normalized));
        } catch (_) {}
      } else {
        setDictPreferences(normalizeDictionaryPreferences(null, targetLanguage, effectiveTranslationLanguage));
      }
    }

    // 2. Background sync from server (multi-device sync)
    let isMounted = true;
    (async () => {
      try {
        const token = localStorage.getItem("vocab_clone_auth_token");
        const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (syncKey) headers["x-sync-key"] = syncKey;

        const res = await fetch("/api/dictionary-preferences", { headers });
        if (res.ok) {
          const json = await res.json();
          if (json?.data && json.data[activeLangKey] && isMounted) {
            const serverNormalized = normalizeDictionaryPreferences(json.data[activeLangKey], targetLanguage, effectiveTranslationLanguage);
            setDictPreferences(serverNormalized);
            safeLocalStorageSetItem(activePrefsStorageKey, JSON.stringify(serverNormalized));
          }
        }
      } catch (_) {}
    })();

    return () => {
      isMounted = false;
    };
  }, [targetLanguage, effectiveTranslationLanguage, activePrefsStorageKey, activeLangKey]);

  // Helper to open dictionary with safe URI encoding for diacritics and special characters
  const handleOpenDictionary = (dict: DictionaryItem, wordToLookup: string) => {
    const cleanWord = (wordToLookup || "").trim();
    const encodedWord = encodeURIComponent(cleanWord);
    const url = dict.urlTemplate
      .replace(/{word}/g, encodedWord)
      .replace(/{query}/g, encodedWord);

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
  };

  // State for dictionary management modal
  const [showManageDictsModal, setShowManageDictsModal] = useState(false);
  const [editingDict, setEditingDict] = useState<DictionaryItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form fields for dictionary creations & modifications
  const [dictFormName, setDictFormName] = useState("");
  const [dictFormUrl, setDictFormUrl] = useState("");
  const [dictFormType, setDictFormType] = useState<"popup" | "new_tab" | "window_popup">("window_popup");

  const currentTabDictionaries = dictPreferences[manageDictsTab] || [];

  const persistDictionaryPreferences = (updated: TabDictionaryPreferences, changedTab?: "meaning" | "definition") => {
    setDictPreferences(updated);
    safeLocalStorageSetItem(activePrefsStorageKey, JSON.stringify(updated));

    // Send granular update to server for multi-device sync
    try {
      const token = localStorage.getItem("vocab_clone_auth_token");
      const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (syncKey) headers["x-sync-key"] = syncKey;

      const tabToSync = changedTab || manageDictsTab;
      fetch("/api/dictionary-preferences", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          langKey: activeLangKey,
          tab: tabToSync,
          dictionaries: updated[tabToSync]
        })
      }).catch(err => {
        console.warn("[Dictionary Sync] Server save failed:", err);
      });
    } catch (_) {}
  };

  const handleSaveDictionary = () => {
    if (!dictFormName.trim() || !dictFormUrl.trim()) return;

    let updatedList: DictionaryItem[];
    if (editingDict) {
      updatedList = currentTabDictionaries.map((d) =>
        d.id === editingDict.id
          ? { ...d, name: dictFormName.trim(), urlTemplate: dictFormUrl.trim(), displayType: dictFormType }
          : d
      );
    } else {
      const newDict: DictionaryItem = {
        id: "dict_" + Date.now(),
        name: dictFormName.trim(),
        urlTemplate: dictFormUrl.trim(),
        displayType: dictFormType,
        enabled: true
      };
      updatedList = [...currentTabDictionaries, newDict];
    }

    const nextPrefs: TabDictionaryPreferences = {
      ...dictPreferences,
      [manageDictsTab]: updatedList
    };
    persistDictionaryPreferences(nextPrefs, manageDictsTab);

    setEditingDict(null);
    setShowAddForm(false);
    setDictFormName("");
    setDictFormUrl("");
    setDictFormType("window_popup");
  };

  const handleStartEditDict = (dict: DictionaryItem) => {
    setEditingDict(dict);
    setShowAddForm(false);
    setDictFormName(dict.name);
    setDictFormUrl(dict.urlTemplate);
    setDictFormType(dict.displayType || "window_popup");
  };

  const handleCancelEditDict = () => {
    setEditingDict(null);
    setShowAddForm(false);
    setDictFormName("");
    setDictFormUrl("");
    setDictFormType("window_popup");
  };

  const handleDeleteDictionary = (id: string) => {
    const updatedList = currentTabDictionaries.filter((d) => d.id !== id);
    const nextPrefs: TabDictionaryPreferences = {
      ...dictPreferences,
      [manageDictsTab]: updatedList
    };
    persistDictionaryPreferences(nextPrefs, manageDictsTab);
    if (editingDict?.id === id) {
      handleCancelEditDict();
    }
  };

  const handleToggleDictionaryEnabled = (id: string) => {
    const updatedList = currentTabDictionaries.map((d) =>
      d.id === id ? { ...d, enabled: d.enabled === false ? true : false } : d
    );
    const nextPrefs: TabDictionaryPreferences = {
      ...dictPreferences,
      [manageDictsTab]: updatedList
    };
    persistDictionaryPreferences(nextPrefs, manageDictsTab);
  };

  const handleResetDefaults = () => {
    const msg = manageDictsTab === "meaning"
      ? t('explainer.reset_meaning_dicts_confirm', "Are you sure you want to reset Meaning dictionaries to defaults?")
      : t('explainer.reset_def_dicts_confirm', "Are you sure you want to reset Definition dictionaries to defaults?");

    if (window.confirm(msg)) {
      const defaults = manageDictsTab === "meaning"
        ? getDefaultMeaningDictionaries(targetLanguage, effectiveTranslationLanguage)
        : getDefaultDefinitionDictionaries(targetLanguage);

      const nextPrefs: TabDictionaryPreferences = {
        ...dictPreferences,
        [manageDictsTab]: defaults
      };
      persistDictionaryPreferences(nextPrefs, manageDictsTab);
    }
  };

  // Word link custom base targets variables
  const [parentWordInput, setParentWordInput] = useState("");
  const isLinked = word ? !!wordLinks[`${targetLanguage.toLowerCase()}_${word.toLowerCase()}`] : false;
  const linkedParentRaw = word ? (wordLinks[`${targetLanguage.toLowerCase()}_${word.toLowerCase()}`] || "") : "";
  const linkedParent = linkedParentRaw.replace(/^[a-zA-Z]+_/, "");

  // Word Family state
  const [familyTabOpen, setFamilyTabOpen] = useState(false);
  const [isGeneratingFamily, setIsGeneratingFamily] = useState(false);
  const [familyData, setFamilyData] = useState<{ word: string; contextMeaning: string; family: { word: string; pos: string; translation: string }[] } | null>(null);

  const handleGenerateWordFamily = async () => {
    if (!word) return;
    if (familyData && familyData.word.toLowerCase() === word.toLowerCase()) {
      setFamilyTabOpen(!familyTabOpen);
      return;
    }
    setIsGeneratingFamily(true);
    try {
      const profiles = getOrCreateAiProfiles(settings);
      const data = await executeAiWithFailover(
        profiles,
        async (profile) => {
          const response = await fetch("/api/analyze-word-family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word,
              sentence: sentence || word,
              targetLanguage,
              translationLanguage: effectiveTranslationLanguage,
              aiProfile: profile,
            })
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const err: any = new Error(errData.error || `HTTP ${response.status}`);
            err.status = response.status;
            throw err;
          }
          return response.json();
        },
        {
          onFallback: (from, to) => {
            showToast(t("settings.ai_fallback_toast", "Quota for {{from}} exceeded. Request completed via {{to}}.", { from: from.name, to: to.name }), "info");
          }
        }
      );
      setFamilyData(data);
      setFamilyTabOpen(true);
    } catch (err: any) {
      console.error("Word Family Error:", err);
    } finally {
      setIsGeneratingFamily(false);
    }
  };

  // Reset mapper input and load word frequency when word changes
  useEffect(() => {
    setParentWordInput("");
    if (!word || !word.trim() || !targetLanguage) {
      setFrequencyData(null);
      return;
    }

    const cleanWord = word.trim().toLowerCase();

    let isMounted = true;
    fetch(`/api/frequency/lookup?word=${encodeURIComponent(cleanWord)}&lang=${encodeURIComponent(targetLanguage)}`)
      .then(res => safeJsonParse(res))
      .then(json => {
        if (isMounted && json && json.status === "ok" && json.data) {
          setFrequencyData(json.data);
        } else if (isMounted) {
          setFrequencyData(null);
        }
      })
      .catch(() => {
        if (isMounted) setFrequencyData(null);
      });

    return () => {
      isMounted = false;
    };
  }, [word, targetLanguage]);

  // Suggest potential root lemmas using morphology helpers & text_lemmas AI map
  const suggestedLemmas = useMemo(() => {
    if (!word) return [];
    const targetNorm = word.trim().toLowerCase();
    const langKey = `${targetLanguage.toLowerCase()}_${targetNorm}`;

    // 1. Check existing wordLinks parent
    const linkedParentRaw = wordLinks ? (wordLinks[langKey] || wordLinks[targetNorm]) : null;
    const linkedParent = linkedParentRaw ? linkedParentRaw.replace(/^[a-zA-Z]+_/, "") : null;

    // 2. Check AI pre-parsed text_lemmas (trimmed, lowercased, or raw)
    const aiLemma = textLemmas
      ? (textLemmas[word.trim()] || textLemmas[targetNorm] || textLemmas[word])
      : null;

    // 3. Check algorithmic morphology suggestions
    const morphs = getSuggestedLemmas(word, targetLanguage);

    const candidates = [
      linkedParent,
      aiLemma,
      ...morphs
    ];

    // Filter out: empty values, duplicate forms, and the SELECTED WORD ITSELF (case-insensitive)
    const seen = new Set<string>();
    const filtered: string[] = [];

    for (const cand of candidates) {
      if (!cand) continue;
      const candNorm = cand.trim().toLowerCase();

      // Rule: NEVER suggest the exact selected word itself!
      if (candNorm === targetNorm) continue;

      if (!seen.has(candNorm)) {
        seen.add(candNorm);
        filtered.push(cand.trim());
      }
    }

    return filtered;
  }, [word, targetLanguage, textLemmas, wordLinks]);

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
        return compareWords(a.lower, b.lower, targetLanguage || "spanish", "asc");
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

    // Helper: resolve the parent vocab entry using both prefixed and non-prefixed keys
    const resolveParentVocab = (parentWord: string): VocabItem | null => {
      if (!vocab || !parentWord) return null;
      const langPrefix = `${targetLanguage.toLowerCase()}_`;
      const parentLower = parentWord.toLowerCase();
      const parentKey = parentLower.startsWith(langPrefix)
        ? parentLower
        : `${langPrefix}${parentLower}`;
      return vocab[parentKey] || vocab[parentLower] || null;
    };

    // Resolve definition: own entry first, direct vocab object, then parent entry via wordLinks, then any family link
    const resolveDefinition = (): string => {
      if (existingVocab?.definition) return existingVocab.definition;

      const wordLower = word.toLowerCase();
      const lang = targetLanguage.toLowerCase();
      const langPrefix = `${lang}_`;

      // 1. Direct check in vocab object
      const directVocab = vocab?.[`${langPrefix}${wordLower}`] || vocab?.[wordLower];
      if (directVocab?.definition) return directVocab.definition;

      // 2. Check parent link via wordLinks
      const rawParentKey = wordLinks[`${langPrefix}${wordLower}`] || wordLinks[wordLower] || "";
      const parentWord = rawParentKey ? rawParentKey.replace(/^[a-zA-Z]+_/, "").toLowerCase() : "";
      if (parentWord && parentWord !== wordLower) {
        const parentEntry = resolveParentVocab(parentWord);
        if (parentEntry?.definition) return parentEntry.definition;
      }

      // 3. Search across all wordLinks in family for any definition
      if (wordLinks && vocab) {
        for (const [fromKey, toKey] of Object.entries(wordLinks)) {
          const cleanFrom = fromKey.replace(/^[a-zA-Z]+_/, "").toLowerCase();
          const cleanTo = String(toKey || "").replace(/^[a-zA-Z]+_/, "").toLowerCase();
          if (cleanFrom === wordLower || cleanTo === wordLower) {
            const memberVocab = vocab[`${langPrefix}${cleanTo}`] || vocab[cleanTo] || vocab[`${langPrefix}${cleanFrom}`] || vocab[cleanFrom];
            if (memberVocab?.definition) return memberVocab.definition;
          }
        }
      }

      return "";
    };

    const resolvedDef = resolveDefinition();

    const vocabContentChanged =
      wordChanged ||
      (existingVocab === null) !== (prevVocab === null) ||
      (existingVocab && prevVocab && (
        existingVocab.word !== prevVocab.word ||
        existingVocab.translation !== prevVocab.translation ||
        existingVocab.definition !== prevVocab.definition ||
        existingVocab.status !== prevVocab.status ||
        existingVocab.ipa !== prevVocab.ipa ||
        existingVocab.grammar !== prevVocab.grammar ||
        existingVocab.contextRelation !== prevVocab.contextRelation ||
        JSON.stringify(existingVocab.examples) !== JSON.stringify(prevVocab.examples) ||
        JSON.stringify(existingVocab.tags) !== JSON.stringify(prevVocab.tags) ||
        existingVocab.imageUrl !== prevVocab.imageUrl
      )) ||
      (resolvedDef !== definitionValue && !internalStatusUpdateRef.current);

    if (!vocabContentChanged) {
      return;
    }

    // Reset tab to "meaning" whenever the active word changes
    if (wordChanged) {
      setSavedMeaningTab("meaning");
    }

    if (existingVocab) {
      const rawTrans = existingVocab.translation || "";
      const isPlaceholderTrans = !rawTrans || rawTrans === "Pending translation" || (rawTrans.startsWith("[") && rawTrans.endsWith("]"));
      setTranslationValue(isPlaceholderTrans ? "" : normalizeTranslationSemicolons(rawTrans));
      setDefinitionValue(resolvedDef);
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

      // Still try to resolve definition from parent even if word not yet in vocab
      setDefinitionValue(resolvedDef);

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
          if (autoIgnoreInfo.isIgnored) {
            setStatus("ignored");
          } else {
            setStatus("new");
          }
        }
        setSelectedTags(isPhrase ? ["Idiom"] : []);
        setImageUrlValue(null);
      }
      internalStatusUpdateRef.current = false;
    }

    if (wordChanged) {
      setError(null);
    }
  }, [word, existingVocab, detectedPhrases, vocab, wordLinks, targetLanguage]);


  // Request word translation & expansion from server API
  const handleTranslate = async () => {
    if (!word) return;
    setLoading(true);
    setError(null);

    try {
      let data: any = null;
      if (translationSource === "ai") {
        const profiles = getOrCreateAiProfiles(settings);
        data = await executeAiWithFailover(
          profiles,
          async (profile) => {
            const response = await fetch("/api/explain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                word,
                context: sentence || word,
                targetLanguage,
                translationLanguage: effectiveTranslationLanguage,
                aiProfile: profile,
              }),
            });
            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              const err: any = new Error(errData.error || "Failed to fetch translation and explanation.");
              err.status = response.status;
              throw err;
            }
            return safeJsonParse(response);
          },
          {
            onFallback: (from, to) => {
              showToast(t("settings.ai_fallback_toast", "Quota for {{from}} exceeded. Request completed via {{to}}.", { from: from.name, to: to.name }), "info");
            }
          }
        );
      } else {
        const bodyParams: any = {
          word,
          targetLanguage,
          translationLanguage: effectiveTranslationLanguage,
          source: translationSource,
          context: translationSource === "google" ? (sentence || word) : undefined,
        };
        const response = await fetch("/api/dictionary-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyParams),
        });
        if (!response.ok) {
          throw new Error("No dictionary record found for this word.");
        }
        data = await safeJsonParse(response);
      }

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
        definition: definitionValue.trim() || existingVocab?.definition || undefined,
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

  const handleExplanationReceived = (data: any, questionText: string) => {
    const answer = data.contextRelation || data.translation || "No explanation provided.";
    setCustomAnswer(answer);
    setContextRelationValue(answer);

    // Auto-populate other fields if empty
    let currentTranslation = data.translation ? normalizeTranslationSemicolons(data.translation) : translationValue;
    if (data.translation) {
      setTranslationValue(currentTranslation);
    }
    let currentIpa = data.ipa || ipaValue;
    if (data.ipa) {
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
      word: word?.toLowerCase() || "",
      translation: currentTranslation.trim() || "",
      definition: definitionValue.trim() || existingVocab?.definition || undefined,
      ipa: currentIpa || "",
      grammar: currentGrammar || "",
      contextRelation: answer,
      status: nextStatus,
      examples: currentExamples,
      createdAt: existingVocab ? existingVocab.createdAt : Date.now(),
      tags: savedTags,
      imageUrl: imageUrlValue,
    };
    if (word) {
      onSaveVocab(newVocab);
    }
  };

  const handleSaveExplanation = () => {
    if (!word) return;
    const nextStatus = status === "new" ? "2" : status;
    if (status === "new") setStatus("2");

    const updatedVocab: VocabItem = {
      word: word.toLowerCase(),
      translation: translationValue.trim() || "",
      definition: definitionValue.trim() || existingVocab?.definition || undefined,
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
          if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          const audio = new Audio(audioUrl);
          audio.onended = () => { URL.revokeObjectURL(audioUrl!); setPlayingSpeech(false); };
          audio.onerror = () => { URL.revokeObjectURL(audioUrl!); setPlayingSpeech(false); };
          await audio.play();
          return;
        }
      } catch (e: any) {
        setPlayingSpeech(false);
        const isInterrupted = e.name === "AbortError" || (e.message && (
          e.message.includes("interrupted") ||
          e.message.includes("user gesture") ||
          e.message.includes("pause") ||
          e.message.includes("removed from the document")
        ));

        if (isInterrupted) {
          return;
        }

        console.warn("Google TTS failed, falling back to browser TTS:", e);
        const isKazakh = (targetLanguage || "").toLowerCase().includes("kaza") || (targetLanguage || "").toLowerCase().includes("қаза");
        if (isKazakh) {
          setTtsWarning(t('explainer.tts_no_kazakh', "Google TTS engine does not support Kazakh. Please select 'Gemini AI' or 'Browser' in settings."));
        } else {
          setTtsWarning(t('explainer.tts_google_fail', `Google TTS failed (${e.message || "error"}). Switched to browser voice.`));
        }
        setTimeout(() => {
          setTtsWarning(prev => prev && (prev.includes("Google") || prev.includes("kazakh")) ? null : prev);
        }, 8000);
      }
      return;
    }

    // --- Kokoro-82M / Local TTS ---
    if (currentTtsEngine === "kokoro" || currentTtsEngine === "local_tts") {
      try {
        const effectiveVoice = getEffectiveLocalTtsVoice(targetLanguage, settings);
        const cacheKey = `local-tts:${effectiveVoice}:${word.toLowerCase().trim()}`;
        let audioUrl: string | null = null;
        let blob = await getTtsAudioFromCache(cacheKey);

        if (blob) {
          audioUrl = URL.createObjectURL(blob);
        } else {
          const response = await fetch("/api/local-tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: word,
              voice: effectiveVoice,
              language: targetLanguage,
              localTtsUrl: settings?.localTtsUrl || "http://localhost:8880/v1/audio/speech"
            }),
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error || t('explainer.local_tts_server_error', `Local TTS server returned ${response.status}`, { status: response.status }));
          }
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
        console.warn("Local Kokoro TTS failed, falling back to browser TTS:", e);
        setTtsWarning(t('explainer.tts_local_fail', `Local TTS failed (${e.message || "server unavailable"}). Switched to browser voice.`));
        setTimeout(() => {
          setTtsWarning(prev => prev && (prev.includes("Local")) ? null : prev);
        }, 8000);
      }
      return;
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
          throw new Error(errData?.error || t('explainer.server_error', `Server error (${response.status})`, { status: response.status }));
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
        setPlayingSpeech(false);
        const isInterrupted = e.name === "AbortError" || (e.message && e.message.includes("interrupted"));
        if (isInterrupted) return;

        console.warn("Gemini neural voice failed or rate-limited. Falling back automatically to local browser TTS.", e);
        setTtsWarning(t('explainer.tts_gemini_fail', `Gemini TTS failed (${e.message || "error"}). Switched to browser voice.`));
        setTimeout(() => {
          setTtsWarning(prev => prev && (prev.includes("Gemini")) ? null : prev);
        }, 8000);
      }
      return;
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
      definition: definitionValue.trim() || existingVocab?.definition || undefined,
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

  // Save definition to the parent (lemma) vocab entry, or self if no parent link
  const handleSaveDefinition = () => {
    if (!word) return;
    const defVal = definitionValue.trim();

    // Determine the target word: parent (lemma) if linked, otherwise the word itself
    const wordLower = word.toLowerCase();
    const langKey = targetLanguage.toLowerCase();
    const rawParentKey = wordLinks[`${langKey}_${wordLower}`] || wordLinks[wordLower] || "";
    const parentWord = rawParentKey ? rawParentKey.replace(/^[a-zA-Z]+_/, "").toLowerCase() : "";
    const targetWord = (parentWord && parentWord !== wordLower) ? parentWord : wordLower;

    // Resolve the target vocab entry with prefixed/non-prefixed fallback
    const langPrefix = `${langKey}_`;
    const prefixedKey = `${langPrefix}${targetWord}`;
    const existingTarget: VocabItem | null | undefined =
      vocab?.[prefixedKey] || vocab?.[targetWord] || null;

    if (existingTarget) {
      // Update definition on existing entry; set to undefined when empty (clean removal)
      onSaveVocab({
        ...existingTarget,
        definition: defVal || undefined,
      });
    } else if (defVal) {
      // Parent word or new word not yet in vocab → create entry with status "2"
      const newParentVocab: VocabItem = {
        word: targetWord,
        translation: (targetWord === wordLower && translationValue) ? translationValue.trim() : "",
        definition: defVal,
        ipa: (targetWord === wordLower && ipaValue) ? ipaValue : "",
        grammar: (targetWord === wordLower && grammarValue) ? grammarValue : "",
        contextRelation: (targetWord === wordLower && contextRelationValue) ? contextRelationValue : "",
        status: status === "new" ? "2" : status,
        examples: (targetWord === wordLower && examplesValue) ? examplesValue : [],
        createdAt: Date.now(),
        tags: (targetWord === wordLower && selectedTags) ? selectedTags : [],
      };
      if (status === "new") setStatus("2");
      onSaveVocab(newParentVocab);
    }
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
        translation: translationValue.trim() || (existingVocab?.translation && existingVocab.translation !== "Pending translation" ? existingVocab.translation : "") || (newStatus === "ignored" ? "[Ignored]" : newStatus === "known" ? "[Known]" : ""),
        definition: definitionValue.trim() || existingVocab?.definition || undefined,
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
        translation: translationValue.trim() || (existingVocab?.translation && existingVocab.translation !== "Pending translation" ? existingVocab.translation : "") || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : ""),
        definition: definitionValue.trim() || existingVocab?.definition || undefined,
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
      try {
        const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
        const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (syncKey) headers["x-sync-key"] = syncKey;
        fetch("/api/user-metadata", { method: "PUT", headers, body: JSON.stringify({ customTags: updated }) }).catch(() => {});
      } catch (_) {}
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
        translation: translationValue.trim() || (existingVocab?.translation && existingVocab.translation !== "Pending translation" ? existingVocab.translation : "") || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : ""),
        definition: definitionValue.trim() || existingVocab?.definition || undefined,
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
    try {
      const token = localStorage.getItem("vocab_clone_auth_token") || localStorage.getItem("vocab_clone_server_token");
      const syncKey = localStorage.getItem("vocab_clone_local_sync_key");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (syncKey) headers["x-sync-key"] = syncKey;
      fetch("/api/user-metadata", { method: "PUT", headers, body: JSON.stringify({ customTags: updated }) }).catch(() => {});
    } catch (_) {}
    
    const updatedTags = selectedTags.filter((t) => t !== tag);
    setSelectedTags(updatedTags);

    if (word) {
      const nextStatus = status === "new" ? "2" : status;
      if (status === "new") {
        setStatus("2");
      }
      const updatedVocab: VocabItem = {
        word: word.toLowerCase(),
        translation: translationValue.trim() || (existingVocab?.translation && existingVocab.translation !== "Pending translation" ? existingVocab.translation : "") || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : ""),
        definition: definitionValue.trim() || existingVocab?.definition || undefined,
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
              title={t('explainer.play_tts_title', 'Play pronunciation (TTS)')}
              className={`w-8 h-8 rounded-l-lg bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-110 dark:hover:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 border border-teal-100/50 dark:border-teal-900/50 transition-all cursor-pointer ${
                playingSpeech ? "animate-pulse scale-95" : "active:scale-90"
              }`}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            {/* Accent dropdown trigger — always visible for Google TTS */}
            <button
              onClick={() => setAccentOpen(p => !p)}
              title={t('explainer.choose_accent_title', 'Choose accent')}
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
                { group: t('explainer.accents_english', "🇺🇸🇬🇧 English"), items: [
                  { code: "en-US", label: t('explainer.accent_us', "🇺🇸 American") },
                  { code: "en-GB", label: t('explainer.accent_gb', "🇬🇧 British") },
                  { code: "en-AU", label: t('explainer.accent_au', "🇦🇺 Australian") },
                  { code: "en-CA", label: t('explainer.accent_ca', "🇨🇦 Canadian") },
                  { code: "en-IN", label: t('explainer.accent_in', "🇮🇳 Indian") },
                ]},
                { group: t('explainer.accents_spanish', "🇪🇸 Spanish"), items: [
                  { code: "es-US", label: t('explainer.accent_mx', "🇲🇽 Mexican") },
                  { code: "es-ES", label: t('explainer.accent_es', "🇪🇸 Spanish") },
                  { code: "es-AR", label: t('explainer.accent_ar', "🇦🇷 Argentine") },
                ]},
                { group: t('explainer.accents_portuguese', "🇧🇷 Portuguese"), items: [
                  { code: "pt-BR", label: t('explainer.accent_br', "🇧🇷 Brazilian") },
                  { code: "pt-PT", label: t('explainer.accent_pt', "🇵🇹 European") },
                ]},
                { group: t('explainer.accents_french', "🇫🇷 French"), items: [
                  { code: "fr-FR", label: t('explainer.accent_fr', "🇫🇷 French") },
                  { code: "fr-CA", label: "🇨🇦 Canadian" },
                ]},
                { group: t('explainer.accents_other', "Other"), items: [
                  { code: "de-DE", label: t('explainer.accent_de', "🇩🇪 German") },
                  { code: "it-IT", label: t('explainer.accent_it', "🇮🇹 Italian") },
                  { code: "ru-RU", label: t('explainer.accent_ru', "🇷🇺 Russian") },
                  { code: "uk-UA", label: t('explainer.accent_uk', "🇺🇦 Ukrainian") },
                  { code: "ja-JP", label: t('explainer.accent_ja', "🇯🇵 Japanese") },
                  { code: "ko-KR", label: t('explainer.accent_ko', "🇰🇷 Korean") },
                  { code: "zh-CN", label: t('explainer.accent_zh_cn', "🇨🇳 Chinese") },
                  { code: "zh-TW", label: t('explainer.accent_zh_tw', "🇹🇼 Taiwanese") },
                  { code: "tr-TR", label: t('explainer.accent_tr', "🇹🇷 Turkish") },
                  { code: "ar-SA", label: t('explainer.accent_ar', "🇸🇦 Arabic") },
                ]},
              ];
              return (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-2 min-w-[200px] max-h-[70vh] overflow-y-auto" style={{scrollbarWidth:'thin'}}>
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400 px-2 py-1 mb-1">
                    🌍 {t('explainer.accent_google_tts', 'Google TTS Accent')} · <span className="text-teal-600">{currentLocale}</span>
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
              {(() => {
                const langKey = targetLanguage.toLowerCase();
                const rawParentKey = wordLinks[`${langKey}_${word.toLowerCase()}`] || (wordLinks[word.toLowerCase()] ? wordLinks[word.toLowerCase()] : null);
                if (rawParentKey) {
                  const cleanParentWord = rawParentKey.replace(/^[a-zA-Z]+_/, "").trim();
                  if (cleanParentWord.toLowerCase() !== word.toLowerCase()) {
                    const parentVocab = vocab ? (vocab[`${langKey}_${cleanParentWord.toLowerCase()}`] || vocab[cleanParentWord.toLowerCase()]) : null;
                    const parentTrans = parentVocab?.translation;
                    return (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                        <span className="text-zinc-400 dark:text-zinc-500 font-normal">{t('explainer.from_word', 'from')}</span>
                        <span className="font-bold text-teal-600 dark:text-teal-400 capitalize">{cleanParentWord}</span>
                        {parentTrans && <span className="text-zinc-400 dark:text-zinc-500 font-normal">— {parentTrans}</span>}
                      </span>
                    );
                  }
                }
                return null;
              })()}
              {!existingVocab && detectedPhrases && word && (detectedPhrases[word.toLowerCase()] || detectedPhrases[word]) && (
                <span className="text-[8px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900 px-1.5 py-0.5 rounded leading-none shrink-0 select-none animate-pulse">
                  {t('explainer.ai_recommends', 'AI Recommends')}
                </span>
              )}
            </div>
            {ipaValue && (
              <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400 font-semibold tracking-wider block mt-0.5">
                {targetLanguage.toLowerCase() === "english" 
                  ? ipaValue 
                  : `IPA: ${ipaValue.replace(/US:\s*/gi, "").replace(/UK:\s*/gi, "").split("|")[0].trim()}`}
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
                      title={t('explainer.click_to_open_comp', `Click to open "${comp}"`, { comp })}
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
            title={t('explainer.close_panel_title', 'Close panel')}
            className="w-6.5 h-6.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {ttsWarning && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50 text-[11px] rounded-xl flex items-center justify-between gap-1 leading-snug shrink-0">
          <div className="flex-1">
            <span className="font-bold">{t('explainer.warning_prefix', 'Warning: ')}</span>
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
                translation: translationValue.trim() || (nextStatus === "ignored" ? "[Ignored]" : nextStatus === "known" ? "[Known]" : ""),
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

        {/* Auto-Ignore Category Badge */}
        {autoIgnoreInfo.isIgnored && !existingVocab && (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0"
            title={t('ignore_lists.auto_ignored_tooltip', 'Слово автоматически скрыто правилами фильтрации. Вы можете в 1 клик сделать его изучаемым, выбрав любой статус.')}
          >
            <span>{autoIgnoreInfo.icon || "🛡️"}</span>
            <span>
              {autoIgnoreInfo.categoryId
                ? `${t('ignore_lists.auto_ignored_badge', 'Игнор')}: ${autoIgnoreInfo.shortNameKey ? t(autoIgnoreInfo.shortNameKey, autoIgnoreInfo.shortNameRu) : (i18n?.language?.startsWith("ru") ? autoIgnoreInfo.shortNameRu : autoIgnoreInfo.shortNameEn)}`
                : t('ignore_lists.auto_ignored_badge', 'Игнор')}
            </span>
          </span>
        )}

        {/* Frequency Rank & CEFR Level Badge (Hidden for ignored words / names) */}
        {frequencyData && status !== "ignored" && (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-black border tracking-tight flex items-center gap-1 transition-all ${
              frequencyData.cefr === "A1"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                : frequencyData.cefr === "A2"
                ? "bg-teal-50 text-teal-700 border-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50"
                : frequencyData.cefr === "B1"
                ? "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50"
                : frequencyData.cefr === "B2"
                ? "bg-orange-50 text-orange-700 border-orange-200/70 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/50"
                : frequencyData.cefr === "C1"
                ? "bg-purple-50 text-purple-700 border-purple-200/70 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/50"
                : frequencyData.cefr === "C2"
                ? "bg-indigo-50 text-indigo-700 border-indigo-200/70 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50"
                : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
            }`}
            title={
              frequencyData.found && frequencyData.rank
                ? t("frequency.rank_tooltip", `Частотный ранг: #${frequencyData.rank.toLocaleString()} из 50,000 (Уровень ${frequencyData.cefr})`, { rank: frequencyData.rank.toLocaleString(), cefr: frequencyData.cefr })
                : t("frequency.rare_tooltip", "Редкое слово / Имя собственное / Термин")
            }
          >
            <span>{frequencyData.cefr === "A1" ? "🔥" : frequencyData.cefr === "A2" ? "⚡" : frequencyData.cefr === "B1" ? "📊" : frequencyData.cefr === "B2" ? "🎯" : frequencyData.cefr === "C1" ? "💎" : frequencyData.cefr === "C2" ? "👑" : "⚪"}</span>
            <span>
              {frequencyData.found && frequencyData.rank 
                ? `#${frequencyData.rank > 999 ? (frequencyData.rank / 1000).toFixed(1) + "k" : frequencyData.rank} • ${frequencyData.cefr}`
                : frequencyData.cefr.toUpperCase()
              }
            </span>
          </span>
        )}

        {/* Tag+ button to expand/toggle custom categorization tags list */}
        <button
          onClick={() => {
            setTagsOpen(!tagsOpen);
            setImageOpen(false);
            setAiTabOpen(false);
            setExamplesTabOpen(false);
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
            setAiTabOpen(false);
            setExamplesTabOpen(false);
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

        {/* AI+ button to toggle Ask AI panel */}
        <button
          type="button"
          onClick={() => {
            setAiTabOpen(!aiTabOpen);
            setTagsOpen(false);
            setImageOpen(false);
            setExamplesTabOpen(false);
            setFamilyTabOpen(false);
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

        {/* Family+ button for Word Family generation */}
        <button
          type="button"
          onClick={() => {
            if (!familyTabOpen && (!familyData || familyData.word.toLowerCase() !== word?.toLowerCase())) {
              handleGenerateWordFamily();
            } else {
              setFamilyTabOpen(!familyTabOpen);
            }
            setTagsOpen(false);
            setImageOpen(false);
            setAiTabOpen(false);
            setExamplesTabOpen(false);
          }}
          disabled={isGeneratingFamily}
          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-0.5 transition-all cursor-pointer ${
            familyTabOpen
              ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
              : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          {isGeneratingFamily ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin text-teal-500" />
          ) : (
            <Layers className="w-2.5 h-2.5" />
          )}
          <span>Family+</span>
        </button>

        {/* Ctx+ button to toggle example usages panel */}
        {examplesValue.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setExamplesTabOpen(!examplesTabOpen);
              setTagsOpen(false);
              setImageOpen(false);
              setAiTabOpen(false);
              setFamilyTabOpen(false);
            }}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-0.5 transition-all cursor-pointer ${
              examplesTabOpen
                ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
                : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <Award className="w-2.5 h-2.5" />
            <span>Ctx+</span>
          </button>
        )}
      </div>

      {/* Collapsible Section Layout Block */}
      <div className="space-y-2 overflow-y-auto pr-0.5 flex-1 scrollbar-thin dark:dark-scrollbar max-h-[calc(100vh-210px)]">

        {/* Word Family Panel */}
        {familyTabOpen && familyData && (
          <div className="border border-teal-200 dark:border-teal-900/50 rounded-xl p-3 bg-teal-50/30 dark:bg-teal-950/20 space-y-2 font-sans animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-400 font-sans flex items-center gap-1">
                <Layers className="w-3 h-3" /> Word Family (Contextual Roots)
              </span>
              <button onClick={() => setFamilyTabOpen(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {familyData.contextMeaning && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">
                Meaning in context: "{familyData.contextMeaning}"
              </p>
            )}

            <div className="space-y-1.5 pt-1">
              {familyData.family.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 shadow-3xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-zinc-800 dark:text-zinc-200 capitalize">
                        {item.word}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {item.pos}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {item.translation}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (word) {
                        onSaveWordLink(word.toLowerCase(), item.word.toLowerCase());
                      }
                    }}
                    className="px-2 py-1 text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 hover:bg-teal-100 rounded-md border border-teal-200/50 cursor-pointer"
                  >
                    Link 🔗
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 1. Saved Meaning Container */}
        {!imageOpen && !aiTabOpen && (
          <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl overflow-visible bg-zinc-50/40 dark:bg-zinc-950/20">
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
            {/* Tabs: Meaning / Definition */}
            <div className="flex items-center gap-0.5 bg-zinc-100/80 dark:bg-zinc-800/60 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => { setSavedMeaningTab("meaning"); if (!savedMeaningOpen) setSavedMeaningOpen(true); }}
                className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  savedMeaningTab === "meaning"
                    ? "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 shadow-3xs"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {t('explainer.tab_meaning', 'Meaning')}
              </button>
              <button
                type="button"
                onClick={() => { setSavedMeaningTab("definition"); if (!savedMeaningOpen) setSavedMeaningOpen(true); }}
                className={`relative px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  savedMeaningTab === "definition"
                    ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-3xs"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {t('explainer.tab_definition', 'Definition')}
                {definitionValue && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 border border-white dark:border-zinc-900" />
                )}
              </button>
            </div>
            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setSavedMeaningOpen(!savedMeaningOpen)}
              className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            >
              {savedMeaningOpen ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
            </button>
          </div>

          {savedMeaningOpen && (
            <div className="p-2.5 pt-0 border-t border-zinc-100/70 dark:border-zinc-800 space-y-2">
              {savedMeaningTab === "meaning" ? (
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
                    placeholder={t('explainer.meaning_placeholder', 'Type a meaning for this form...')}
                    rows={1}
                    className="flex-1 p-2 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80 transition-all font-medium custom-scrollbar resize-none min-h-[34px] overflow-hidden"
                  />
                  {translationValue && translationValue !== "Pending translation" && !translationValue.startsWith("[") && (
                    <button
                      type="button"
                      onClick={handleDeleteTranslation}
                      title={t('explainer.delete_translation_title', 'Delete translation')}
                      className="p-2 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-650 dark:text-red-400 border border-red-100/50 dark:border-red-900/50 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center self-stretch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                /* Definition tab */
                <div className="mt-1.5 space-y-1.5">
                  {isLinked && (
                    <div className="flex items-center gap-1 text-[9px] text-teal-600 dark:text-teal-400 font-bold">
                      <span>📖</span>
                      <span>{t('explainer.definition_for_lemma', 'Definition for root:')}</span>
                      <span className="capitalize font-extrabold">{linkedParent}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5">
                    <textarea
                      value={definitionValue}
                      onChange={(e) => setDefinitionValue(e.target.value)}
                      onBlur={handleSaveDefinition}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleSaveDefinition();
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder={t('explainer.definition_placeholder', 'Type definition for parent word...')}
                      rows={2}
                      className="flex-1 p-2 text-xs bg-white dark:bg-zinc-900/80 border border-teal-200/60 dark:border-teal-900/40 rounded-lg text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500/80 transition-all font-medium custom-scrollbar resize-none min-h-[52px] overflow-hidden italic"
                    />
                    {definitionValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setDefinitionValue("");
                          // Call save directly with empty string so we don't rely on async state
                          if (!word) return;
                          const wordLower = word.toLowerCase();
                          const langKey = targetLanguage.toLowerCase();
                          const rawParentKey = wordLinks[`${langKey}_${wordLower}`] || wordLinks[wordLower] || "";
                          const parentWord = rawParentKey ? rawParentKey.replace(/^[a-zA-Z]+_/, "").toLowerCase() : "";
                          const targetWord = (parentWord && parentWord !== wordLower) ? parentWord : wordLower;
                          const langPrefix = `${langKey}_`;
                          const existingTarget = vocab?.[`${langPrefix}${targetWord}`] || vocab?.[targetWord] || null;
                          if (existingTarget) {
                            const { definition: _removed, ...rest } = existingTarget;
                            onSaveVocab({ ...rest, definition: undefined });
                          }
                        }}
                        title={t('explainer.delete_definition_title', 'Delete definition')}
                        className="p-2 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-650 dark:text-red-400 border border-red-100/50 dark:border-red-900/50 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center self-stretch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Definition Dictionaries Section */}
                  <div className="space-y-1.5 pt-1.5 border-t border-zinc-100/40 dark:border-zinc-800/40 mt-1">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <button
                        type="button"
                        onClick={() => setDictionariesOpen(!dictionariesOpen)}
                        className="font-extrabold uppercase tracking-widest text-[8px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                      >
                        <BookOpen className="w-2.5 h-2.5 text-teal-600/80" /> {t('explainer.definition_dicts', 'Definition Dictionaries')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManageDictsTab("definition");
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
                        {dictPreferences.definition.filter((d) => d.enabled !== false).map((dict) => {
                          const lookupWord = (isLinked && linkedParent) ? linkedParent : (word || "");
                          return (
                            <button
                              key={dict.id}
                              type="button"
                              onClick={() => handleOpenDictionary(dict, lookupWord)}
                              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 px-2 py-0.5 rounded-md text-[9px] font-bold text-zinc-600 dark:text-zinc-300 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <span>{dict.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* WordNet Synsets for English in Definition Tab */}
                  {targetLanguage.toLowerCase().startsWith("en") && word && (
                    <div className="pt-2">
                      <WordNetSynsetsView
                        word={(isLinked && linkedParent) ? linkedParent : word}
                        onApplyDefinition={(def, posName) => {
                          setDefinitionValue(def);
                          
                          // Map WordNet POS to standard grammar tag (Noun, Verb, Adjective, Adverb)
                          const posToGrammarMap: Record<string, string> = {
                            noun: "Noun",
                            verb: "Verb",
                            adjective: "Adjective",
                            adverb: "Adverb"
                          };
                          const newGrammar = (posName && posToGrammarMap[posName]) ? posToGrammarMap[posName] : grammarValue;
                          if (newGrammar) {
                            setGrammarValue(newGrammar);
                          }
                          const updatedTags = (newGrammar && !selectedTags.includes(newGrammar)) 
                            ? [...selectedTags, newGrammar] 
                            : selectedTags;
                          if (newGrammar && !selectedTags.includes(newGrammar)) {
                            setSelectedTags(updatedTags);
                          }

                          // Auto save definition and grammar
                          const wordLower = word.toLowerCase();
                          const langKey = targetLanguage.toLowerCase();
                          const rawParentKey = wordLinks[`${langKey}_${wordLower}`] || wordLinks[wordLower] || "";
                          const parentWord = rawParentKey ? rawParentKey.replace(/^[a-zA-Z]+_/, "").toLowerCase() : "";
                          const targetWord = (parentWord && parentWord !== wordLower) ? parentWord : wordLower;
                          const langPrefix = `${langKey}_`;
                          const existingTarget = vocab?.[`${langPrefix}${targetWord}`] || vocab?.[targetWord] || null;
                          const nextStatus = status === "new" ? "2" : status;
                          if (status === "new") setStatus("2");

                          if (existingTarget) {
                            onSaveVocab({ 
                              ...existingTarget, 
                              definition: def.trim(),
                              grammar: newGrammar || existingTarget.grammar,
                              tags: updatedTags
                            });
                          } else {
                            const newVocab: VocabItem = {
                              word: targetWord,
                              translation: translationValue.trim() || "",
                              definition: def.trim(),
                              ipa: ipaValue || "",
                              grammar: newGrammar || "",
                              contextRelation: contextRelationValue || "",
                              status: nextStatus,
                              examples: examplesValue,
                              createdAt: Date.now(),
                              tags: updatedTags,
                              imageUrl: imageUrlValue,
                            };
                            onSaveVocab(newVocab);
                          }
                        }}
                        onApplySynonym={(syn) => {
                          if (onWordClick) onWordClick(syn, sentence || "");
                        }}
                        onWordClick={(w) => {
                          if (onWordClick) onWordClick(w, sentence || "");
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Dictionaries, Word Variations — on Meaning tab */}
              {savedMeaningTab === "meaning" && (
                <>
                {/* Meaning Dictionaries Section integrated directly in Saved Meaning Card */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between text-xs font-sans">
                    <button
                      type="button"
                      onClick={() => setDictionariesOpen(!dictionariesOpen)}
                      className="font-extrabold uppercase tracking-widest text-[8px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      <BookOpen className="w-2.5 h-2.5 text-teal-600/80" /> {t('explainer.translation_dicts', 'Dictionaries')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setManageDictsTab("meaning");
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
                      {dictPreferences.meaning.filter((d) => d.enabled !== false).map((dict) => (
                        <button
                          key={dict.id}
                          type="button"
                          onClick={() => handleOpenDictionary(dict, word || "")}
                          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 px-2 py-0.5 rounded-md text-[9px] font-bold text-zinc-600 dark:text-zinc-300 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span>{dict.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              {/* Word Variations Link (Pattern) integrated directly in Saved Meaning Card */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-100/40 dark:border-zinc-800/40 mt-1.5">
                <div className="flex items-center justify-between text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => setWordVariationsOpen(!wordVariationsOpen)}
                    className="font-extrabold uppercase tracking-widest text-[8.5px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                  >
                    🔗 {t('explainer.word_variations_link', 'WORD VARIATIONS LINK')}
                    <ChevronDown className={`w-3 h-3 transition-transform ${wordVariationsOpen ? "rotate-180" : ""}`} />
                  </button>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-teal-50/70 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 font-mono">
                    zorro ⇄ zorros
                  </span>
                </div>

                {wordVariationsOpen && (
                  <>
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
                  </div>
                )}

                    {suggestedLemmas.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-0.5">
                        <span className="text-[9.5px] text-zinc-400 dark:text-zinc-500 font-extrabold uppercase font-sans">
                          💡 {t('explainer.suggestions', 'Suggestions:')}
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
                  </>
                )}
              </div>

              {/* Translation Source Selector */}
              <div className="space-y-1 pt-2 border-t border-zinc-100/40 dark:border-zinc-800/40 text-left shrink-0">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 dark:text-zinc-500 block pl-0.5">
                    {t('explainer.translation_source', 'TRANSLATION SOURCE')}
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
                      ✨ {t('explainer.source_ai', 'AI')}
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
                      🌐 {t('explainer.source_hybrid', 'Hybrid')}
                    </button>
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
                      {translationSource === "google" && t('explainer.source_google_no_ai', 'Google Translate 🌐')}
                      {translationSource === "free_dictionary" && "Free Dictionary API"}
                      {translationSource === "wiktionary" && "Wiktionary REST API"}
                      {translationSource === "hybrid" && "Dictionary Hybrid Search 🌐"}
                    </span>
                  </button>
                )}
              </div>
              </>
            )}
          </div>
          )}
        </div>
      )}

      {/* Ask AI Section */}
        {aiTabOpen && (
          <AiExplainerChat
            word={word}
            sentence={sentence}
            targetLanguage={targetLanguage}
            translationLanguage={effectiveTranslationLanguage}
            settings={settings}
            customAnswer={customAnswer}
            onCustomAnswerChange={setCustomAnswer}
            onExplanationReceived={handleExplanationReceived}
            onSaveExplanation={handleSaveExplanation}
          />
        )}

            {/* 6. AI Generated Sentences */}
            {examplesValue.length > 0 && examplesTabOpen && (
              <div className="space-y-2 pt-1 font-sans animate-in slide-in-from-top-1 duration-150">
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

        {/* 2. Custom categorization tags panel (rendered when Tag+ is active) */}
        {!imageOpen && !aiTabOpen && tagsOpen && (
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
          <ImageSearch
            word={word}
            imageUrlValue={imageUrlValue}
            handleSelectImage={handleSelectImage}
            handleClipboardPaste={handleClipboardPaste}
            handleFileChange={handleFileChange}
          />
        )}

        {/* 4. Related Phrases Card */}
        {!imageOpen && !aiTabOpen && sentence && (
          <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-50/40 dark:bg-zinc-950/20">
            <button
              onClick={() => {
                const nextVal = !relatedPhrasesOpen;
                setRelatedPhrasesOpen(nextVal);
                safeLocalStorageSetItem("vocab_related_phrases_open", String(nextVal));
              }}
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
        {!imageOpen && !aiTabOpen && loading && (
          <div className="p-6 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold animate-pulse">Running smart translation analysis...</p>
          </div>
        )}

        {!imageOpen && !aiTabOpen && error && (
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
          title={t('explainer.wipe_word_title', 'Wipe word status')}
          className="w-8 h-8 border border-zinc-200 dark:border-zinc-800 hover:border-red-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-zinc-400 hover:text-rose-600 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-3xs shrink-0 active:scale-90"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Ignore word button with Ban icon */}
        <button
          onClick={() => handleUpdateStatus("ignored")}
          title={t('explainer.ignore_word_title', 'Ignore word')}
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
          title={t('explainer.mark_known_title', 'Mark as Known')}
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
                  {t('explainer.manage_dicts', 'Manage Dictionaries')}
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

            {/* Tab Selection Switcher inside Modal */}
            <div className="flex items-center gap-2 px-5 pt-3 pb-1 bg-zinc-50/50 dark:bg-zinc-950/50 border-b border-zinc-100 dark:border-zinc-800 font-sans">
              <button
                type="button"
                onClick={() => {
                  setManageDictsTab("meaning");
                  handleCancelEditDict();
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  manageDictsTab === "meaning"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <span>📖 {t('explainer.manage_meaning_dicts', 'Meaning Dictionaries')}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${manageDictsTab === "meaning" ? "bg-teal-700 text-teal-100" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                  {dictPreferences.meaning.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setManageDictsTab("definition");
                  handleCancelEditDict();
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  manageDictsTab === "definition"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <span>📘 {t('explainer.manage_def_dicts', 'Definition Dictionaries')}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${manageDictsTab === "definition" ? "bg-teal-700 text-teal-100" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                  {dictPreferences.definition.length}
                </span>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
              
              {/* Form container: ONLY SHOW when adding or editing, so it doesn't block lists! */}
              {(showAddForm || editingDict) ? (
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-teal-500/20 dark:border-teal-500/10 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 font-sans">
                      {editingDict ? t('explainer.edit_dict', 'Edit Dictionary') : t('explainer.add_new_dict', 'Add New Dictionary')}
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
                        {t('explainer.dict_name', 'Name')}
                      </label>
                      <input
                        type="text"
                        value={dictFormName}
                        onChange={(e) => setDictFormName(e.target.value)}
                        placeholder={t('explainer.dict_name_placeholder', 'E.g.: Spanishdict, WordReference...')}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1 font-sans">
                        {t('explainer.url_template', 'URL Template')}
                      </label>
                      <input
                        type="text"
                        value={dictFormUrl}
                        onChange={(e) => setDictFormUrl(e.target.value)}
                        placeholder="https://example.com/search?q={word}"
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                      />
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 block leading-relaxed font-sans">
                        <Trans i18nKey="explainer.url_template_desc">Use placeholder <code className="text-teal-600 dark:text-teal-400 font-mono font-bold">{`{word}`}</code> in the link. It will automatically be replaced with the selected word.</Trans>
                      </span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5 font-sans">
                        {t('explainer.display_type', 'Display Type')}
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
                          <span className="text-center">{t('explainer.display_new_tab', 'New Tab')}</span>
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
                          <span className="text-center">{t('explainer.display_popup', 'Popup Frame')}</span>
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
                          <span className="text-center">{t('explainer.display_window', 'Mini Window')}</span>
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
                      {t('explainer.cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDictionary}
                      disabled={!dictFormName.trim() || !dictFormUrl.trim()}
                      className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingDict ? t('explainer.save_changes', 'Save Changes') : t('explainer.add_dict', 'Add Dictionary')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center font-sans gap-2">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-3 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{t('explainer.reset_default', 'Reset to Default')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-400 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-teal-100 dark:border-teal-900/30 cursor-pointer shadow-xs font-sans"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('explainer.add_dict_btn', 'Add New Dictionary')}</span>
                  </button>
                </div>
              )}

              {/* List of existing dictionaries */}
              <div className="space-y-2 font-sans">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {manageDictsTab === "meaning" ? t('explainer.available_meaning_dicts', 'Available Meaning Dictionaries') : t('explainer.available_def_dicts', 'Available Definition Dictionaries')}
                </h4>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900">
                  {currentTabDictionaries.map((dict) => {
                    const isEnabled = dict.enabled !== false;
                    return (
                      <div
                        key={dict.id}
                        className={`p-3 flex items-center justify-between transition-all gap-3 ${
                          !isEnabled
                            ? "opacity-55 bg-zinc-100/40 dark:bg-zinc-950/40"
                            : "hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => handleToggleDictionaryEnabled(dict.id)}
                            className={`w-9 h-5 rounded-full transition-colors p-0.5 flex items-center shrink-0 cursor-pointer ${
                              isEnabled
                                ? "bg-teal-600 justify-end"
                                : "bg-zinc-300 dark:bg-zinc-700 justify-start"
                            }`}
                            title={isEnabled ? t('explainer.disable_dict', 'Disable dictionary') : t('explainer.enable_dict', 'Enable dictionary')}
                          >
                            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-extrabold text-xs truncate ${!isEnabled ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-200"}`}>
                                {dict.name}
                              </span>
                              {dict.displayType === "popup" ? (
                                <span className="text-[7.5px] text-teal-600 dark:text-teal-400 font-extrabold uppercase bg-teal-50 dark:bg-teal-950/40 px-1 rounded border border-teal-100/50 dark:border-teal-900/10 font-sans">
                                  pop
                                </span>
                              ) : dict.displayType === "window_popup" ? (
                                <span className="text-[7.5px] text-amber-600 dark:text-amber-400 font-extrabold uppercase bg-amber-50 dark:bg-amber-950/40 px-1 rounded border border-amber-100/50 dark:border-amber-900/10 font-sans">
                                  win
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
                        </div>

                      <div className="flex items-center gap-1 shrink-0 animate-none">
                        <button
                          type="button"
                          onClick={() => handleStartEditDict(dict)}
                          className="p-1 px-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                          title={t('explainer.edit_dict_title', 'Edit dictionary')}
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>{t('explainer.edit_btn', 'Edit')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDictionary(dict.id)}
                          className="p-1 px-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                          title={t('explainer.delete_dict_title', 'Delete dictionary')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('explainer.delete_btn', 'Delete')}</span>
                        </button>
                      </div>
                    </div>
                    );
                  })}

                  {currentTabDictionaries.length === 0 && (
                    <div className="p-6 text-center text-zinc-400 text-xs">
                      {t('explainer.no_dicts_msg', 'No dictionaries configured. You can add a new one above!')}
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
                <span>{t('explainer.save_and_close', 'Save & Close')}</span>
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
                  <span>{t('explainer.open_in_new_window', 'Open Link ↗')}</span>
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
                <Trans i18nKey="explainer.iframe_blocked_warning">⚠️ If the dictionary is blank due to site protection (X-Frame-Options), click <strong>&laquo;Open Link&raquo;</strong> in the top right corner!</Trans>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

export default memo(WordExplainer);

