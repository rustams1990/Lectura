/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Statistics Dashboard
 */

import React, { useMemo, useState, useEffect } from "react";
import { VocabItem, Lesson, WordStatus } from "../types";
import { searchWordInLessons } from "../contextSearch";
import ContextSearchResults from "./ContextSearchResults";
import { normalizeContraction } from "../utils";
import { 
  TrendingUp, 
  BookOpen, 
  Clock, 
  Settings, 
  GraduationCap, 
  Flame, 
  Target, 
  Award, 
  Search, 
  Trash2, 
  Calendar,
  Layers,
  Sparkles,
  RefreshCw,
  HelpCircle,
  FileText,
  ChevronDown,
  SlidersHorizontal,
  Tag,
  Image,
  Check,
  Pencil,
  X,
  Download,
  Upload
} from "lucide-react";

interface StatisticsPageProps {
  vocab: Record<string, VocabItem>;
  lessons: Lesson[];
  listeningSeconds: number;
  onUpdateStatus: (word: string, status: WordStatus, lang?: string) => void;
  onDeleteVocab: (word: string, lang?: string) => void;
  onDeleteMultipleVocabs?: (words: string[], lang?: string) => void;
  onSaveVocab?: (newVocab: VocabItem, lang?: string) => void;
  onSaveMultipleVocabs?: (newVocabs: VocabItem[], lang?: string) => void;
  onRenameVocab?: (oldWord: string, newVocab: VocabItem, lang?: string) => void;
  wordLinks?: Record<string, string>;
  onSaveWordLink?: (from: string, to: string, lang?: string) => void;
  onDeleteWordLink?: (from: string, lang?: string) => void;
  onOpenLesson?: (lessonId: string, word: string, sentence: string) => void;
}

export default function StatisticsPage({
  vocab,
  lessons,
  listeningSeconds,
  onUpdateStatus,
  onDeleteVocab,
  onDeleteMultipleVocabs,
  onSaveVocab,
  onSaveMultipleVocabs,
  onRenameVocab,
  wordLinks = {},
  onSaveWordLink,
  onDeleteWordLink,
  onOpenLesson,
}: StatisticsPageProps) {
  const [vocabSearch, setVocabSearch] = useState("");
  const [contextSearchQuery, setContextSearchQuery] = useState("");
  const [vocabFilter, setVocabFilter] = useState<string>("all");
  const [vocabSort, setVocabSort] = useState<"newest" | "oldest" | "alphabetical" | "level_desc" | "level_asc">("newest");
  const [onlyPatterns, setOnlyPatterns] = useState(false);

  // Advanced word filter states
  const [vocabTagFilter, setVocabTagFilter] = useState<string>("all");
  const [vocabLengthFilter, setVocabLengthFilter] = useState<string>("all");
  const [vocabImageFilter, setVocabImageFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(100);

  // Custom confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warning?: string;
    onConfirm: () => void;
  } | null>(null);

  const askConfirm = (title: string, message: string, warning: string | undefined, onConfirm: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      warning,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(null);
      }
    });
  };
  
  // Migration & Date correction states
  const [editingWordDate, setEditingWordDate] = useState<string | null>(null);
  const [showMigrationTools, setShowMigrationTools] = useState<boolean>(false);

  // Editable fields states
  const [editingWord, setEditingWord] = useState<string | null>(null);
  const [editWordValue, setEditWordValue] = useState<string>("");
  const [editTranslationValue, setEditTranslationValue] = useState<string>("");
  const [editGrammarValue, setEditGrammarValue] = useState<string>("");
  const [editParentValue, setEditParentValue] = useState<string>("");

  // Batch paste import states
  const [batchImportText, setBatchImportText] = useState<string>("");
  const [batchImportDate, setBatchImportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [batchImportStatus, setBatchImportStatus] = useState<WordStatus>("known");
  const [batchImportTag, setBatchImportTag] = useState<string>("lute-import");

  const parsedBatchWords = useMemo(() => {
    if (!batchImportText.trim()) return [];
    const lines = batchImportText.split("\n");
    const results: Array<{ 
      word: string; 
      translation: string; 
      customDate: number | null;
      grammar: string;
    }> = [];

    // Common Parts Of Speech Keywords to match against
    const posKeywords = /^(noun|verb|adverb|adjective|pronoun|preposition|conjunction|interjection|article|particle|существительное|глагол|наречие|прилагательное|местоимение|предлог|союз|частица|артикль|sustantivo|verbo|adverbio|adjetivo|pronombre|preposición|conjunción|interjección|artículo|adj|adv|prep|conj|pron|n|v)\.?$/i;

    // Helper to parser dates supporting Russian, Spanish as well as English month names
    const parseFlexibleDate = (dateStr: string): number | null => {
      let cleaned = dateStr.toLowerCase().trim();
      
      // Remove Spanish connection particle "de"
      cleaned = cleaned.replace(/\bde\s+/g, "");

      const monthTranslations = [
        // Russian
        ["янв", "jan"], ["фев", "feb"], ["мар", "mar"], ["апр", "apr"],
        ["май", "may"], ["мая", "may"], ["июн", "jun"], ["июл", "jul"],
        ["авг", "aug"], ["сен", "sep"], ["окт", "oct"], ["ноя", "nov"],
        ["дек", "dec"],
        // Spanish
        ["enero", "jan"], ["febrero", "feb"], ["marzo", "mar"], ["abril", "apr"],
        ["mayo", "may"], ["junio", "jun"], ["julio", "jul"], ["agosto", "aug"],
        ["septiembre", "sep"], ["octubre", "oct"], ["noviembre", "nov"], ["diciembre", "dec"]
      ];

      monthTranslations.forEach(([lang, en]) => {
        cleaned = cleaned.replace(new RegExp("\\b" + lang + "[а-я]*", "g"), en);
      });

      const parsed = Date.parse(cleaned);
      return isNaN(parsed) ? null : parsed;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Try to find a date in the line
      let customDate: number | null = null;
      let matchedDateStr = "";

      const dateRegexes = [
        // March 18, 2025; February 2, 2026
        /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}/i,
        // 18 March 2025
        /\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)(?:,)?\s+\d{4}/i,
        // 18 марта 2025, 18 de febrero de 2026
        /\d{1,2}\s+(?:декабря|января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек|de\s+enero|de\s+febrero|de\s+marzo|de\s+abril|de\s+mayo|de\s+junio|de\s+julio|de\s+agosto|de\s+septiembre|de\s+octubre|de\s+noviembre|de\s+diciembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s+)?\d{4}/i,
        // ISO dates
        /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
        /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/
      ];

      for (const rx of dateRegexes) {
        const match = rx.exec(line);
        if (match) {
          matchedDateStr = match[0];
          const parsed = parseFlexibleDate(matchedDateStr);
          if (parsed !== null) {
            customDate = parsed;
            break;
          }
        }
      }

      // Now prepare a string without the date string
      let rest = line;
      if (matchedDateStr) {
        // Replace ONLY the first exact match to avoid destroying text that contains similar characters
        const index = line.indexOf(matchedDateStr);
        if (index !== -1) {
          rest = line.substring(0, index) + "   " + line.substring(index + matchedDateStr.length);
        }
      }

      // Split the rest on common delimiters
      let parts: string[] = [];
      if (rest.includes("\t")) {
        parts = rest.split("\t");
      } else if (/\s{2,}/.test(rest)) {
        parts = rest.split(/\s{2,}/);
      } else if (rest.includes(";")) {
        parts = rest.split(";");
      } else if (rest.includes("|")) {
        parts = rest.split("|");
      } else if (rest.includes(" - ")) {
        parts = rest.split(" - ");
      } else {
        parts = rest.split(/\s+/);
      }

      parts = parts.map(p => p.trim()).filter(Boolean);

      const cleanScraps = (text: string): string => {
        let val = text.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1).trim();
        }
        if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1).trim();
        }
        val = val.replace(/^[,;]+|[,;]+$/g, "").trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1).trim();
        }
        return val.trim();
      };

      let word = "";
      let grammar = "";
      let translation = "";

      if (parts.length > 0) {
        word = cleanScraps(parts[0]);

        // Process other components
        const remainingParts = parts.slice(1);
        const nonPosParts: string[] = [];

        remainingParts.forEach((part) => {
          const cleanedPart = cleanScraps(part);
          if (cleanedPart) {
            if (posKeywords.test(cleanedPart)) {
              // Capitalize first letter of grammar (e.g. Noun, Verb, etc.)
              grammar = cleanedPart.charAt(0).toUpperCase() + cleanedPart.slice(1).toLowerCase();
            } else {
              nonPosParts.push(cleanedPart);
            }
          }
        });

        if (nonPosParts.length > 0) {
          translation = nonPosParts.join(" ");
        } else {
          translation = customDate !== null ? "[Импорт с датой]" : "[Импорт Lute]";
        }
      }

      if (word) {
        results.push({
          word,
          translation,
          customDate,
          grammar
        });
      }
    });

    return results;
  }, [batchImportText]);

  const handleExecuteBatchImport = () => {
    if (parsedBatchWords.length === 0) return;
    if (!onSaveVocab && !onSaveMultipleVocabs) {
      setProfileMessage("Ошибка: Функция добавления слов не передана в компонент.");
      return;
    }

    const tDate = new Date(batchImportDate);
    if (isNaN(tDate.getTime())) {
      setProfileMessage("Некорректная дата.");
      return;
    }

    let importCount = 0;
    let customDatesCount = 0;
    const newVocabs: VocabItem[] = [];

    parsedBatchWords.forEach((item, index) => {
      let resolvedTimestamp: number;

      if (item.customDate !== null) {
        const seedDate = new Date(item.customDate);
        if (seedDate.getHours() === 0 && seedDate.getMinutes() === 0) {
          seedDate.setHours(
            Math.floor(Math.random() * 8) + 9, // Between 9:00 and 17:00
            Math.floor(Math.random() * 60),
            Math.floor(Math.random() * 60)
          );
        }
        resolvedTimestamp = seedDate.getTime() + index; // Millisecond offset to avoid duplicate keys/timestamps
        customDatesCount++;
      } else {
        const computedDate = new Date(tDate);
        computedDate.setHours(
          Math.floor(Math.random() * 8) + 9, // Between 9:00 and 17:00
          Math.floor(Math.random() * 60),
          Math.floor(Math.random() * 60),
          index // Milliseconds
        );
        resolvedTimestamp = computedDate.getTime();
      }

      const newVocab: VocabItem = {
        word: item.word,
        translation: item.translation,
        ipa: "",
        grammar: item.grammar || "",
        contextRelation: "",
        status: batchImportStatus,
        examples: [],
        createdAt: resolvedTimestamp,
        tags: batchImportTag.trim() ? [batchImportTag.trim()] : []
      };

      newVocabs.push(newVocab);
      importCount++;
    });

    if (onSaveMultipleVocabs) {
      onSaveMultipleVocabs(newVocabs, selectedStatsLang);
    } else if (onSaveVocab) {
      newVocabs.forEach((newVocab) => {
        onSaveVocab(newVocab, selectedStatsLang);
      });
    }

    let successMessage = `Успешно импортировано ${importCount} слов(а) с тегом "${batchImportTag}"!`;
    if (customDatesCount > 0) {
      successMessage += ` У ${customDatesCount} слов автоматически определились и применились даты из списка.`;
    } else {
      successMessage += ` Всем установлена общая выбранная дата: ${tDate.toLocaleDateString("ru-RU")}.`;
    }

    setProfileMessage(successMessage);
    setBatchImportText("");
  };

  const startEditingWord = (item: VocabItem) => {
    setEditingWord(item.word);
    setEditWordValue(item.word);
    setEditTranslationValue(item.translation || "");
    setEditGrammarValue(item.grammar || "");
    setEditParentValue(getParentWord(item.word) || "");
  };

  const handleSaveEditedWord = (item: VocabItem) => {
    const cleanWord = editWordValue.trim();
    if (!cleanWord) return;

    const updatedVocab: VocabItem = {
      ...item,
      word: cleanWord,
      translation: editTranslationValue.trim(),
      grammar: editGrammarValue.trim()
    };

    if (onRenameVocab) {
      onRenameVocab(item.word, updatedVocab, selectedStatsLang);
    } else {
      if (item.word !== cleanWord) {
        onDeleteVocab(item.word, selectedStatsLang);
      }
      onSaveVocab?.(updatedVocab, selectedStatsLang);
    }

    // Update parent/pattern link if changed
    const oldParent = getParentWord(item.word) || "";
    const newParent = editParentValue.trim();

    if (oldParent.toLowerCase() !== newParent.toLowerCase()) {
      if (!newParent) {
        // Delete link
        const langLower = selectedStatsLang.toLowerCase();
        const keyWithLang = `${langLower}_${cleanWord.toLowerCase()}`;
        onDeleteWordLink?.(keyWithLang, selectedStatsLang);
        onDeleteWordLink?.(cleanWord.toLowerCase(), selectedStatsLang);
      } else {
        // Save link (from the new/cleaned word to the new parent)
        onSaveWordLink?.(cleanWord, newParent, selectedStatsLang);
      }
    }

    setEditingWord(null);
  };

  const handleExportCSV = () => {
    if (processedVocabularyList.length === 0) return;

    // CSV Headers: Word, Translation, Status, Grammar, IPA, Created Date, Tags
    const headers = ["Word", "Translation", "Status", "Grammar", "IPA", "Created Date", "Tags"];

    // Map rows
    const rows = processedVocabularyList.map((item) => {
      const dateStr = item.createdAt && !isNaN(new Date(item.createdAt).getTime())
        ? new Date(item.createdAt).toISOString().split('T')[0]
        : "";
      const tagsStr = (item.tags || []).join(", ");

      return [
        item.word,
        item.translation || "",
        item.status || "",
        item.grammar || "",
        item.ipa || "",
        dateStr,
        tagsStr
      ];
    });

    // Escape special CSV characters
    const escapeCSV = (val: string) => {
      const clean = val.replace(/"/g, '""');
      if (clean.includes(",") || clean.includes("\n") || clean.includes('"') || clean.includes(";")) {
        return `"${clean}"`;
      }
      return clean;
    };

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCSV).join(","))
    ].join("\n");

    // Add UTF-8 BOM so spreadsheet apps (Excel, etc.) parse Cyrillic and Spanish chars correctly
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const dateFormatted = new Date().toISOString().split('T')[0];
    const filename = `${selectedStatsLang.toLowerCase()}_vocabulary_${dateFormatted}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result as string;
      if (!csvText) return;

      try {
        // Parse CSV with double quote handling
        const parseCSV = (text: string): string[][] => {
          const result: string[][] = [];
          let row: string[] = [];
          let inQuotes = false;
          let currentValue = "";

          for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                currentValue += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              row.push(currentValue);
              currentValue = "";
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
              if (char === '\r' && nextChar === '\n') {
                i++;
              }
              row.push(currentValue);
              result.push(row);
              row = [];
              currentValue = "";
            } else {
              currentValue += char;
            }
          }
          if (currentValue || row.length > 0) {
            row.push(currentValue);
            result.push(row);
          }
          return result.filter(r => r.length > 0 && r.some(val => val.trim() !== ""));
        };

        const parsedRows = parseCSV(csvText);
        if (parsedRows.length <= 1) {
          setProfileMessage("Ошибка: CSV-файл пуст или содержит только заголовок.");
          return;
        }

        // Detect column indices based on header row (remove BOM if present)
        const header = parsedRows[0].map(h => h.replace(/^\ufeff/, "").toLowerCase().trim());
        let wordIdx = header.indexOf("word");
        let transIdx = header.indexOf("translation");
        let statusIdx = header.indexOf("status");
        let grammarIdx = header.indexOf("grammar");
        let ipaIdx = header.indexOf("ipa");
        let dateIdx = header.indexOf("created date");
        let tagsIdx = header.indexOf("tags");

        // Fallback mapping if standard headers are missing
        if (wordIdx === -1) wordIdx = 0;
        if (transIdx === -1) transIdx = 1 < header.length ? 1 : -1;
        if (statusIdx === -1) statusIdx = 2 < header.length ? 2 : -1;
        if (grammarIdx === -1) grammarIdx = 3 < header.length ? 3 : -1;
        if (ipaIdx === -1) ipaIdx = 4 < header.length ? 4 : -1;
        if (dateIdx === -1) dateIdx = 5 < header.length ? 5 : -1;
        if (tagsIdx === -1) tagsIdx = 6 < header.length ? 6 : -1;

        const dataRows = parsedRows.slice(1);
        const newVocabs: VocabItem[] = [];
        let skippedCount = 0;

        dataRows.forEach((row, rIdx) => {
          const word = row[wordIdx] ? row[wordIdx].trim() : "";
          if (!word) {
            skippedCount++;
            return;
          }

          const translation = transIdx !== -1 && row[transIdx] ? row[transIdx].trim() : "";
          const statusStr = statusIdx !== -1 && row[statusIdx] ? row[statusIdx].trim().toLowerCase() : "known";
          const grammar = grammarIdx !== -1 && row[grammarIdx] ? row[grammarIdx].trim() : "";
          const ipa = ipaIdx !== -1 && row[ipaIdx] ? row[ipaIdx].trim() : "";

          let createdAt = Date.now() + rIdx;
          if (dateIdx !== -1 && row[dateIdx]) {
            const parsedDate = Date.parse(row[dateIdx].trim());
            if (!isNaN(parsedDate)) {
              createdAt = parsedDate;
            }
          }

          let tags: string[] = [];
          if (tagsIdx !== -1 && row[tagsIdx]) {
            tags = row[tagsIdx].split(",").map(t => t.trim()).filter(Boolean);
          }

          let status: WordStatus = "known";
          if (["1", "2", "3", "4", "5", "learning", "known", "ignored"].includes(statusStr)) {
            status = statusStr as WordStatus;
          }

          newVocabs.push({
            word,
            translation,
            ipa,
            grammar,
            contextRelation: "",
            status,
            createdAt,
            tags,
            examples: []
          });
        });

        if (newVocabs.length === 0) {
          setProfileMessage("В CSV-файле не найдено корректных слов для импорта.");
          return;
        }

        askConfirm(
          "Импорт слов из CSV",
          `Вы действительно хотите импортировать ${newVocabs.length} слов(а) в словарь для языка "${selectedStatsLang}"?`,
          skippedCount > 0 ? `Пропущено пустых строк: ${skippedCount}. Существующие в словаре слова с теми же ключами будут обновлены.` : undefined,
          () => {
            if (onSaveMultipleVocabs) {
              onSaveMultipleVocabs(newVocabs, selectedStatsLang);
            } else if (onSaveVocab) {
              newVocabs.forEach(item => onSaveVocab(item, selectedStatsLang));
            }
            setProfileMessage(`Успешно импортировано ${newVocabs.length} слов(а) из CSV-файла!`);
          }
        );

      } catch (err) {
        console.error("CSV import parsing failed", err);
        setProfileMessage("Ошибка при чтении или разборе CSV-файла.");
      }
    };
    reader.readAsText(file, "UTF-8");

    // Reset input value to allow importing the same file again
    e.target.value = "";
  };

  const handleDisperseDates = (daysCount: number) => {
    if (processedVocabularyList.length === 0) return;

    askConfirm(
      "Равномерное распределение дат",
      `Вы действительно хотите равномерно распределить ${processedVocabularyList.length} отфильтрованных слов назад в прошлое на ${daysCount} дней?`,
      "Это действие перезапишет даты сохранения для всех отфильтрованных слов, чтобы разгладить пики активности на тепловой карте.",
      () => {
        const listSize = processedVocabularyList.length;
        const now = Date.now();
        
        processedVocabularyList.forEach((item, index) => {
          // Linearly step back the time: for index 0 -> now, for index (listSize-1) -> now - daysCount days.
          const fraction = listSize > 1 ? index / (listSize - 1) : 0.5;
          const daysBack = fraction * daysCount;
          const millisecondsBack = daysBack * 24 * 3600 * 1000;
          
          // Random jitter of up to 4 hours in milliseconds to make timestamps look natural
          const jitter = (Math.random() - 0.5) * 4 * 3600 * 1000;
          const computedTime = Math.min(now, now - millisecondsBack + jitter);

          const updated = {
            ...item,
            createdAt: Math.round(computedTime)
          };
          
          onSaveVocab?.(updated, selectedStatsLang);
        });

        setProfileMessage(`Успешно распределили даты для ${listSize} слов на последние ${daysCount} дней! Тепловая карта обновилась.`);
      }
    );
  };

  const handleBatchSetDate = (dateStr: string) => {
    if (!dateStr || processedVocabularyList.length === 0) return;
    const targetDate = new Date(dateStr);
    if (isNaN(targetDate.getTime())) return;

    askConfirm(
      "Установка даты для слов",
      `Установить дату сохранения "${targetDate.toLocaleDateString("ru-RU")}" для всех ${processedVocabularyList.length} отфильтрованных слов?`,
      "Это действие запишет все выбранные слова на один день с реалистичным распределением времени в течение дня.",
      () => {
        // Use selected date but add random hour/minute/second so they don't have identical millisecond timestamps
        processedVocabularyList.forEach((item) => {
          const computedDate = new Date(targetDate);
          computedDate.setHours(
            Math.floor(Math.random() * 8) + 9, // Between 9:00 and 17:00
            Math.floor(Math.random() * 60),
            Math.floor(Math.random() * 60)
          );

          const updated = {
            ...item,
            createdAt: computedDate.getTime()
          };
          onSaveVocab?.(updated, selectedStatsLang);
        });

        setProfileMessage(`Успешно перенесли ${processedVocabularyList.length} слов на дату ${targetDate.toLocaleDateString("ru-RU")}! Тепловая карта обновилась.`);
      }
    );
  };

  const handleDeleteAllLanguageWords = () => {
    if (vocabArray.length === 0) return;
    
    askConfirm(
      "ПОЛНОЕ УДАЛЕНИЕ СЛОВАРЯ",
      `Вы собираетесь ПОЛНОСТЬЮ удалить ВСЕ слова для языка "${selectedStatsLang}" (${vocabArray.length} шт.).`,
      "ВНИМАНИЕ! Это действие абсолютно необратимо и сотрет ваш словарь для этого языка. Вы точно хотите начать заново?",
      () => {
        if (onDeleteMultipleVocabs) {
          const words = vocabArray.map((item) => item.word);
          onDeleteMultipleVocabs(words, selectedStatsLang);
        } else {
          // Loop fallback
          vocabArray.forEach((item) => {
            onDeleteVocab(item.word, selectedStatsLang);
          });
        }

        setProfileMessage(`Успешно удалили все слова для языка "${selectedStatsLang}". Словарь полностью очищен для этого языка.`);
      }
    );
  };

  const handleDeleteFilteredWords = () => {
    if (processedVocabularyList.length === 0) return;

    askConfirm(
      "Удаление отфильтрованных слов",
      `Вы собираетесь удалить ${processedVocabularyList.length} ОТФИЛЬТРОВАННЫХ слов для языка "${selectedStatsLang}" из словаря.`,
      "Все эти слова будут удалены со своими статусами без возможности восстановления.",
      () => {
        if (onDeleteMultipleVocabs) {
          const words = processedVocabularyList.map((item) => item.word);
          onDeleteMultipleVocabs(words, selectedStatsLang);
        } else {
          // Loop fallback
          processedVocabularyList.forEach((item) => {
            onDeleteVocab(item.word, selectedStatsLang);
          });
        }

        setProfileMessage(`Успешно удалили ${processedVocabularyList.length} отфильтрованных слов со всеми их статусами.`);
      }
    );
  };
  
  // States for Vocabulary CEFR Frequency Tagger
  const [isProfiling, setIsProfiling] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  // Resolves a word to its root pattern/lemma if it exists in wordLinks
  const resolveWordToPattern = (word: string): string => {
    if (!wordLinks) return word;
    const langLower = selectedStatsLang.toLowerCase();
    const keyWithLang = `${langLower}_${word.toLowerCase()}`;
    const targetKey = wordLinks[keyWithLang] || wordLinks[word.toLowerCase()];
    if (targetKey && typeof targetKey === "string") {
      const underscoreIdx = targetKey.indexOf("_");
      return underscoreIdx !== -1 ? targetKey.substring(underscoreIdx + 1) : targetKey;
    }
    return word;
  };

  // Resolves a word to its direct parent from wordLinks
  const getParentWord = (word: string): string | null => {
    if (!wordLinks) return null;
    const langLower = selectedStatsLang.toLowerCase();
    const keyWithLang = `${langLower}_${word.toLowerCase()}`;
    const targetKey = wordLinks[keyWithLang] || wordLinks[word.toLowerCase()];
    if (targetKey && typeof targetKey === "string") {
      const underscoreIdx = targetKey.indexOf("_");
      return underscoreIdx !== -1 ? targetKey.substring(underscoreIdx + 1) : targetKey;
    }
    return null;
  };

  // Find all child variations grouped under a parent word
  const getChildWordsForPattern = (pattern: string): string[] => {
    if (!wordLinks) return [];
    const children: string[] = [];
    const langLower = selectedStatsLang.toLowerCase();
    const patternLower = pattern.toLowerCase();

    Object.entries(wordLinks).forEach(([childKey, parentKey]) => {
      if (parentKey && typeof parentKey === "string") {
        const parentLower = parentKey.replace(/^[a-zA-Z]+_/, "").toLowerCase();
        if (parentLower === patternLower) {
          const cleanChild = childKey.replace(/^[a-zA-Z]+_/, "");
          if (cleanChild.toLowerCase() !== patternLower) {
            children.push(cleanChild);
          }
        }
      }
    });
    return Array.from(new Set(children));
  };

  // Direct parent link deletion handler
  const handleDeleteParentLink = (word: string) => {
    const langLower = selectedStatsLang.toLowerCase();
    const keyWithLang = `${langLower}_${word.toLowerCase()}`;
    onDeleteWordLink?.(keyWithLang, selectedStatsLang);
    onDeleteWordLink?.(word.toLowerCase(), selectedStatsLang);
  };

  // Find all languages dynamically that have at least one word (VocabItem) entry
  const languagesList = useMemo(() => {
    const langs = new Set<string>();
    Object.keys(vocab).forEach((key) => {
      const parts = key.split("_");
      const langName = parts.length > 1 ? parts[0] : "spanish";
      langs.add(langName.charAt(0).toUpperCase() + langName.slice(1).toLowerCase());
    });

    // Filter out languages that don't have any actual saved words
    return Array.from(langs).filter((lang) => {
      const count = Object.entries(vocab).filter(([key]) => {
        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0] : "spanish";
        return itemLang.toLowerCase() === lang.toLowerCase();
      }).length;
      return count > 0;
    });
  }, [vocab]);

  const [selectedStatsLang, setSelectedStatsLang] = useState<string>(() => {
    return lessons[0]?.targetLanguage || languagesList[0] || "Spanish";
  });

  const batchImportStats = useMemo(() => {
    let newWords = 0;
    let existingWords = 0;
    const langLower = selectedStatsLang.toLowerCase();

    parsedBatchWords.forEach((item) => {
      const lowerWord = item.word.toLowerCase();
      const keyWithLang = `${langLower}_${lowerWord}`;
      let exists = !!(vocab[keyWithLang] || vocab[lowerWord]);
      
      if (!exists) {
        const normalized = normalizeContraction(lowerWord, langLower);
        if (normalized !== lowerWord) {
          const normKeyWithLang = `${langLower}_${normalized}`;
          exists = !!(vocab[normKeyWithLang] || vocab[normalized]);
        }
      }

      if (exists) {
        existingWords++;
      } else {
        newWords++;
      }
    });

    return { newWords, existingWords };
  }, [parsedBatchWords, vocab, selectedStatsLang]);

  // Synchronize chosen stats language if current language no longer exists or becomes empty
  useEffect(() => {
    if (languagesList.length > 0 && !languagesList.includes(selectedStatsLang)) {
      setSelectedStatsLang(languagesList[0]);
    }
  }, [languagesList, selectedStatsLang]);

  // Reset page when vocabulary filter/sorting or language changes
  useEffect(() => {
    setCurrentPage(1);
  }, [vocabSearch, vocabFilter, vocabSort, onlyPatterns, vocabTagFilter, vocabLengthFilter, vocabImageFilter, selectedStatsLang]);

  const vocabArray = useMemo(() => {
    return Object.entries(vocab)
      .filter(([key, lq]) => {
        if (!lq || typeof lq !== "object") return false;
        if (typeof lq.word !== "string" || !lq.word.trim()) return false;
        if (lq.translation !== undefined && lq.translation !== null && typeof lq.translation !== "string") return false;
        const parts = key.split("_");
        const itemLang = parts.length > 1 ? parts[0] : "spanish";
        return itemLang.toLowerCase() === selectedStatsLang.toLowerCase();
      })
      .map(([_, lq]) => ({
        ...lq,
        translation: lq.translation || "",
        grammar: lq.grammar || "",
        ipa: lq.ipa || "",
        contextRelation: lq.contextRelation || "",
        status: lq.status || "known",
        createdAt: typeof lq.createdAt === "number" && !isNaN(lq.createdAt) ? lq.createdAt : Date.now(),
        tags: Array.isArray(lq.tags) ? lq.tags.filter(t => typeof t === "string") : [],
        examples: Array.isArray(lq.examples) ? lq.examples : [],
        imageUrl: typeof lq.imageUrl === "string" ? lq.imageUrl : null,
      }));
  }, [vocab, selectedStatsLang]);

  // Grouped active list containing only root patterns if active, otherwise full vocabulary
  const statsArray = useMemo(() => {
    if (!onlyPatterns) {
      return vocabArray;
    }

    const grouped = new Map();
    vocabArray.forEach((item) => {
      const resolved = resolveWordToPattern(item.word);
      const existing = grouped.get(resolved);

      if (!existing) {
        grouped.set(resolved, {
          ...item,
          word: resolved,
        });
      } else {
        const getStatusWeight = (status) => {
          switch (status) {
            case "known": return 6;
            case "5": return 5;
            case "4": return 4;
            case "3": case "learning": return 3;
            case "2": return 2;
            case "1": return 1;
            case "ignored": return 0;
            default: return 0;
          }
        };
        const useNewer = getStatusWeight(item.status) > getStatusWeight(existing.status);

        let mergedTranslation = existing.translation || "";
        const itemTranslation = item.translation || "";
        if (itemTranslation && itemTranslation !== mergedTranslation) {
          const existingLower = mergedTranslation.toLowerCase();
          const itemLower = itemTranslation.toLowerCase();
          if (!existingLower.includes(itemLower) && !itemLower.includes(existingLower)) {
            mergedTranslation = mergedTranslation ? `${mergedTranslation} | ${itemTranslation}` : itemTranslation;
          }
        }

        grouped.set(resolved, {
          ...(useNewer ? item : existing),
          word: resolved,
          translation: mergedTranslation,
          createdAt: Math.max(existing.createdAt || 0, item.createdAt || 0),
        });
      }
    });

    return Array.from(grouped.values());
  }, [vocabArray, onlyPatterns, selectedStatsLang, wordLinks]);

  const contextSearchHits = useMemo(() => {
    const query = contextSearchQuery.trim();
    if (query.length < 2) return [];
    return searchWordInLessons(query, lessons, {
      targetLanguage: selectedStatsLang,
      wordLinks,
      maxResults: 40,
      maxPerLesson: 6,
    });
  }, [contextSearchQuery, lessons, selectedStatsLang, wordLinks]);

  // Analytical hooks for tracking daily study habits & volume growth over time
  const heatmapData = useMemo(() => {
    // 1. Group words by their creation date (YYYY-MM-DD)
    const dailyCounts: Record<string, { added: number; words: string[] }> = {};
    
    statsArray.forEach((item) => {
      if (!item.createdAt || item.status === "ignored") return;
      const dateObj = new Date(item.createdAt);
      if (isNaN(dateObj.getTime())) return;
      
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      if (!dailyCounts[dateStr]) {
        dailyCounts[dateStr] = { added: 0, words: [] };
      }
      dailyCounts[dateStr].added += 1;
      dailyCounts[dateStr].words.push(item.word);
    });

    // 2. Generate the last 24 weeks containing 7 days each
    const cells: { dateStr: string; date: Date; count: number; words: string[] }[] = [];
    const today = new Date();
    
    // Find nearest Sunday of the current week (to have clean columns)
    const dayOfWeek = today.getDay();
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysToSunday);
    
    // We want 24 weeks, so 24 * 7 = 168 days
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 167); // Monday 24 weeks ago
    
    const tempDate = new Date(startDate);
    for (let i = 0; i < 168; i++) {
      const year = tempDate.getFullYear();
      const month = String(tempDate.getMonth() + 1).padStart(2, '0');
      const day = String(tempDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const dayData = dailyCounts[dateStr] || { added: 0, words: [] };
      cells.push({
        dateStr,
        date: new Date(tempDate),
        count: dayData.added,
        words: dayData.words
      });
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // Split cells into 24 columns
    const columns: typeof cells[] = [];
    for (let c = 0; c < 24; c++) {
      const column: typeof cells = [];
      for (let r = 0; r < 7; r++) {
        column.push(cells[c * 7 + r]);
      }
      columns.push(column);
    }

    // Calculations for stats
    const activeDays = Object.keys(dailyCounts).length;
    const maxInADay = Object.values(dailyCounts).reduce((max, d) => Math.max(max, d.added), 0);
    
    // Streak calculations
    const sortedDates = Object.keys(dailyCounts).sort();
    let longestStreak = 0;
    let currentStreak = 0;

    if (sortedDates.length > 0) {
      const dateSet = new Set(sortedDates);
      let tempStreak = 0;
      
      // We scan from startDate to today
      const scanDate = new Date(startDate);
      scanDate.setHours(0,0,0,0);
      const endScan = new Date(today);
      endScan.setHours(0,0,0,0);
      
      while (scanDate <= endScan) {
        const y = scanDate.getFullYear();
        const m = String(scanDate.getMonth() + 1).padStart(2, '0');
        const d = String(scanDate.getDate()).padStart(2, '0');
        const ds = `${y}-${m}-${d}`;
        
        if (dateSet.has(ds)) {
          tempStreak++;
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
          }
        } else {
          tempStreak = 0;
        }
        scanDate.setDate(scanDate.getDate() + 1);
      }
      
      // Calculate current streak
      const checkDate = new Date(today);
      checkDate.setHours(0,0,0,0);
      let finished = false;
      while (!finished) {
        const y = checkDate.getFullYear();
        const m = String(checkDate.getMonth() + 1).padStart(2, '0');
        const d = String(checkDate.getDate()).padStart(2, '0');
        const ds = `${y}-${m}-${d}`;
        
        if (dateSet.has(ds)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // If today has no activity, check yesterday to see if streak is still alive
          if (currentStreak === 0) {
            const yesterday = new Date(today);
            yesterday.setHours(0,0,0,0);
            yesterday.setDate(today.getDate() - 1);
            
            const yy = yesterday.getFullYear();
            const ym = String(yesterday.getMonth() + 1).padStart(2, '0');
            const yd = String(yesterday.getDate()).padStart(2, '0');
            const yds = `${yy}-${ym}-${yd}`;
            
            if (dateSet.has(yds)) {
              let yStreak = 0;
              const yCheck = new Date(yesterday);
              while (dateSet.has(`${yCheck.getFullYear()}-${String(yCheck.getMonth() + 1).padStart(2, '0')}-${String(yCheck.getDate()).padStart(2, '0')}`)) {
                yStreak++;
                yCheck.setDate(yCheck.getDate() - 1);
              }
              currentStreak = yStreak;
            }
          }
          finished = true;
        }
      }
    }

    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    return {
      columns,
      activeDays,
      maxInADay,
      longestStreak,
      currentStreak,
      dailyCounts
    };
  }, [statsArray]);

  const monthlyGrowth = useMemo(() => {
    const list: { name: string; count: number }[] = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthLabel = d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
      
      const endOfMonthMax = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      const totalWordsByThen = statsArray.filter(item => item.createdAt && item.createdAt <= endOfMonthMax && item.status !== "ignored").length;
      
      list.push({
        name: monthLabel,
        count: totalWordsByThen
      });
    }
    return list;
  }, [statsArray]);

  // CEFR Profiler calculation and frequency tagger logic
  const cefrProfileCounts = useMemo(() => {
    let a1 = 0, a2 = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0;
    statsArray.forEach((item) => {
      const tags = item.tags || [];
      const uppercaseTags = tags
        .filter((t) => typeof t === "string")
        .map((t) => t.toUpperCase().trim());
      if (uppercaseTags.includes("A1")) a1++;
      else if (uppercaseTags.includes("A2")) a2++;
      else if (uppercaseTags.includes("B1")) b1++;
      else if (uppercaseTags.includes("B2")) b2++;
      else if (uppercaseTags.includes("C1")) c1++;
      else if (uppercaseTags.includes("C2")) c2++;
    });
    const totalWithCefr = a1 + a2 + b1 + b2 + c1 + c2;
    return { a1, a2, b1, b2, c1, c2, totalWithCefr };
  }, [statsArray]);

  const handleAutoProfileVocabulary = () => {
    if (!onSaveVocab && !onSaveMultipleVocabs) {
      setProfileMessage("Ошибка: функция обновления словаря недоступна.");
      return;
    }

    setIsProfiling(true);
    setProfileMessage(null);

    // Run in a slight setTimeout to let the spinner render smoothly
    setTimeout(() => {
      try {
        const langLower = selectedStatsLang.toLowerCase();

        // 1. Gather all lessons text in the current language
        const relevantLessons = lessons.filter(
          (l) => l.targetLanguage.toLowerCase() === langLower
        );

        // Concatenate title and text to build a rich corpus
        let rawCorpus = "";
        relevantLessons.forEach((lesson) => {
          rawCorpus += " " + (lesson.title || "");
          rawCorpus += " " + (lesson.text || "");
        });

        // 2. Tokenize the corpus
        const tokens = rawCorpus.toLowerCase().match(/[\p{L}\p{M}'’]+/gu) || [];
        
        // 3. Count frequencies
        const frequencyMap: Record<string, number> = {};
        tokens.forEach((t) => {
          if (t.length <= 1) return; // skip single character noise
          frequencyMap[t] = (frequencyMap[t] || 0) + 1;
        });

        // Sort unique words by descending frequency
        const sortedUniqueWords = Object.keys(frequencyMap).sort(
          (a, b) => frequencyMap[b] - frequencyMap[a]
        );

        const totalUnique = sortedUniqueWords.length;

        // Custom list of high frequency words for language backup (CEFR guides)
        const commonHighFreqSpanish = ["el", "la", "los", "las", "un", "una", "y", "en", "que", "de", "ser", "estar", "haber", "hacer", "ir", "tener", "con", "para", "por", "su", "este", "mi", "tu", "como", "si", "más", "pero", "todo", "nos", "le", "lo", "se", "me", "te", "como", "bien", "muy", "otro", "este", "ese", "sí"];
        const commonHighFreqFrench = ["le", "la", "les", "un", "une", "des", "et", "en", "que", "de", "être", "avoir", "faire", "aller", "dire", "pouvoir", "vouloir", "savoir", "voir", "avec", "pour", "sur", "dans", "ce", "ma", "mon", "ta", "ton", "sa", "son", "se", "me", "te", "nous", "vous", "ils", "elles", "qui"];
        const commonHighFreqEnglish = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their"];
        const commonHighFreqGerman = ["der", "die", "das", "ein", "eine", "und", "in", "zu", "haben", "sein", "werden", "von", "mit", "nicht", "es", "ich", "er", "sie", "wir", "ihr", "zu", "auf", "für", "an", "nach", "aus", "bei", "durch", "ohne", "gegen"];
        const commonHighFreqPortuguese = ["o", "a", "os", "as", "um", "uma", "uns", "umas", "e", "em", "que", "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "ser", "estar", "ter", "haver", "fazer", "ir", "com", "para", "por", "seu", "sua", "este", "esta", "meu", "minha", "teu", "tua", "como", "se", "mais", "mas", "todo", "toda", "todos", "todas", "lhe", "lhes", "me", "te", "nos", "vos", "ele", "ela", "eles", "elas", "não", "sim", "bem", "muito", "outro", "outra", "este", "esse", "aquele"];

        let isSpanish = langLower.includes("span");
        let isFrench = langLower.includes("fren") || langLower.includes("fran");
        let isEnglish = langLower.includes("eng");
        let isGerman = langLower.includes("ger") || langLower.includes("deut");
        let isPortuguese = langLower.includes("port") || langLower.includes("pt");

        const isCoreCommonBackup = (w: string) => {
          const wl = w.toLowerCase();
          if (isSpanish && commonHighFreqSpanish.includes(wl)) return "A1";
          if (isFrench && commonHighFreqFrench.includes(wl)) return "A1";
          if (isEnglish && commonHighFreqEnglish.includes(wl)) return "A1";
          if (isGerman && commonHighFreqGerman.includes(wl)) return "A1";
          if (isPortuguese && commonHighFreqPortuguese.includes(wl)) return "A1";
          return null;
        };

        // 4. Group our target vocabulary items
        let updatedCount = 0;
        const updatedVocabs: VocabItem[] = [];

        vocabArray.forEach((vocabItem) => {
          const w = vocabItem.word.toLowerCase();
          
          // Determine the rank
          const rankIndex = sortedUniqueWords.indexOf(w);
          let assignedCEFR = "C1"; // default if rare / not in lessons

          // First check our core high frequency dictionary backup
          const backupCEFR = isCoreCommonBackup(w);
          if (backupCEFR) {
            assignedCEFR = backupCEFR;
          } else if (rankIndex !== -1 && totalUnique > 0) {
            const percentile = rankIndex / totalUnique;
            const freq = frequencyMap[w] || 0;

            if (percentile <= 0.15 || freq >= 15) {
              assignedCEFR = "A1";
            } else if (percentile <= 0.35 || freq >= 7) {
              assignedCEFR = "A2";
            } else if (percentile <= 0.55 || freq >= 4) {
              assignedCEFR = "B1";
            } else if (percentile <= 0.75 || freq >= 2) {
              assignedCEFR = "B2";
            } else if (percentile <= 0.90) {
              assignedCEFR = "C1";
            } else {
              assignedCEFR = "C2";
            }
          } else {
            // Not found in active lessons. Use length / shape complexity heuristic
            if (w.length <= 4) {
              assignedCEFR = "A2";
            } else if (w.length <= 6) {
              assignedCEFR = "B1";
            } else if (w.length <= 9) {
              assignedCEFR = "B2";
            } else {
              assignedCEFR = "C1";
            }
          }

          // Merge current tags list, stripping previous CEFR tags to prevent duplicates
          const originalTags = vocabItem.tags || [];
          const cefrSet = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
          const cleanedTags = originalTags.filter(
            (t) => !cefrSet.has(t.toUpperCase().trim())
          );

          const newTags = [...cleanedTags, assignedCEFR];

          // Save the VocabItem back
          const updatedVocab: VocabItem = {
            ...vocabItem,
            tags: newTags
          };

          updatedVocabs.push(updatedVocab);
          updatedCount++;
        });

        if (onSaveMultipleVocabs) {
          onSaveMultipleVocabs(updatedVocabs, selectedStatsLang);
        } else if (onSaveVocab) {
          updatedVocabs.forEach((updatedVocab) => {
            onSaveVocab(updatedVocab, selectedStatsLang);
          });
        }

        setProfileMessage(
          `Успешно! Проанализировано ${relevantLessons.length} уроков (${tokens.length} словоупотреблений). Автоматически обновлено ${updatedCount} слов(а) в словаре добавлением CEFR-тегов важности (A1, A2, B1, B2, C1).`
        );
      } catch (err) {
        console.error("Vocabulary profiling failed", err);
        setProfileMessage("Ошибка при проведении частотного анализа.");
      } finally {
        setIsProfiling(false);
      }
    }, 850);
  };

  // Calculations
  const stats = useMemo(() => {
    const total = statsArray.length;
    const known = statsArray.filter((l) => l.status === "known").length;
    const learning = statsArray.filter((l) => 
      ["1", "2", "3", "4", "5", "learning"].includes(l.status)
    ).length;
    const ignored = statsArray.filter((l) => l.status === "ignored").length;

    // Status distributions
    const status1 = statsArray.filter((l) => l.status === "1").length;
    const status2 = statsArray.filter((l) => l.status === "2").length;
    const status3 = statsArray.filter((l) => l.status === "3").length;
    const status4 = statsArray.filter((l) => l.status === "4").length;
    const status5 = statsArray.filter((l) => l.status === "5" || l.status === "learning").length;

    // Estimate CEFR based on known words count
    let cefrLevel = "A1 Breakthrough";
    let cefrTarget = 500;
    let cefrDesc = "Вы умеете понимать и использовать простейшие бытовые фразы.";
    let cefrProgress = 0;

    if (known <= 500) {
      cefrLevel = "A1 (Начинающий)";
      cefrTarget = 500;
      cefrDesc = "Освоение базовой лексики и простых выражений.";
      cefrProgress = Math.min(100, Math.round((known / 500) * 100));
    } else if (known <= 1500) {
      cefrLevel = "A2 (Элементарный)";
      cefrTarget = 1500;
      cefrDesc = "Понимание повседневных предложений на личные темы.";
      cefrProgress = Math.min(100, Math.round(((known - 500) / 1000) * 100));
    } else if (known <= 3000) {
      cefrLevel = "B1 (Средний)";
      cefrTarget = 3000;
      cefrDesc = "Понимание главных идей сложных текстов о работе/учебе.";
      cefrProgress = Math.min(100, Math.round(((known - 1500) / 1500) * 100));
    } else if (known <= 6000) {
      cefrLevel = "B2 (Выше среднего)";
      cefrTarget = 6000;
      cefrDesc = "Быстрое осмысление текстов и аргументов в беседах.";
      cefrProgress = Math.min(100, Math.round(((known - 3000) / 3000) * 100));
    } else if (known <= 10000) {
      cefrLevel = "C1 (Продвинутый)";
      cefrTarget = 10000;
      cefrDesc = "Профессиональное владение языком, чтение оригиналов.";
      cefrProgress = Math.min(100, Math.round(((known - 600) / 4000) * 100));
    } else {
      cefrLevel = "C2 (В совершенстве)";
      cefrTarget = 20000;
      cefrDesc = "Понимание любых сообщений без усилий, близко к носителю.";
      cefrProgress = Math.min(100, Math.round((known / 20000) * 100));
    }

    return {
      total,
      known,
      learning,
      ignored,
      distribution: {
        status1,
        status2,
        status3,
        status4,
        status5,
      },
      cefr: {
        level: cefrLevel,
        target: cefrTarget,
        desc: cefrDesc,
        progress: Math.max(8, cefrProgress), // minimum visual 8% for design aesthetics
      }
    };
  }, [statsArray]);

  // Formatted listening time helper
  const formatTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0с";
    const totalSecs = Math.round(seconds);
    if (totalSecs < 60) return `${totalSecs}с`;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins < 60) return secs > 0 ? `${mins} мин ${secs} с` : `${mins} мин`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs} ч ${remMins} мин` : `${hrs} ч`;
  };

  // Extract all unique tags actually used inside the user's active language dictionary
  const uniqueTags = useMemo(() => {
    const tagsSet = new Set<string>();
    statsArray.forEach((item) => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((tag) => {
          if (tag && tag.trim()) {
            tagsSet.add(tag.trim().toLowerCase());
          }
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [statsArray]);

  // Filtered vocabulary table for active study review
  const filteredVocabularyList = useMemo(() => {
    const list = statsArray.filter((item) => {
      if (!item) return false;
      const wordStr = typeof item.word === "string" ? item.word : "";
      const transStr = typeof item.translation === "string" ? item.translation : "";
      const grammarStr = typeof item.grammar === "string" ? item.grammar : "";

      const matchesSearch = 
        wordStr.toLowerCase().includes(vocabSearch.toLowerCase()) ||
        transStr.toLowerCase().includes(vocabSearch.toLowerCase()) ||
        grammarStr.toLowerCase().includes(vocabSearch.toLowerCase());

      const matchesFilter = (() => {
        if (vocabFilter === "all") {
          return item.status !== "ignored"; // "игнорированные слова не отображаются в общем списке"
        }
        if (vocabFilter === "learning") {
          return item.status && ["1", "2", "3", "4", "5", "learning"].includes(item.status);
        }
        if (vocabFilter === "known") {
          return item.status === "known";
        }
        if (vocabFilter === "ignored") {
          return item.status === "ignored";
        }
        if (vocabFilter === "1") return item.status === "1";
        if (vocabFilter === "2") return item.status === "2";
        if (vocabFilter === "3") return item.status === "3";
        if (vocabFilter === "4") return item.status === "4";
        if (vocabFilter === "5") return item.status === "5" || item.status === "learning";
        return true;
      })();

      const matchesTag = (() => {
        if (vocabTagFilter === "all") return true;
        return !!(item.tags && Array.isArray(item.tags) && item.tags.some(t => typeof t === "string" && t.toLowerCase() === vocabTagFilter.toLowerCase()));
      })();

      const matchesLength = (() => {
        if (vocabLengthFilter === "all") return true;
        const len = wordStr.length;
        if (vocabLengthFilter === "short") return len < 5;
        if (vocabLengthFilter === "medium") return len >= 5 && len <= 8;
        if (vocabLengthFilter === "long") return len > 8;
        return true;
      })();

      const matchesImage = (() => {
        if (vocabImageFilter === "all") return true;
        if (vocabImageFilter === "with_image") return !!item.imageUrl;
        if (vocabImageFilter === "without_image") return !item.imageUrl;
        return true;
      })();

      return matchesSearch && matchesFilter && matchesTag && matchesLength && matchesImage;
    });

    const getStatusWeight = (status: string) => {
      switch (status) {
        case "known": return 6;
        case "5": return 5;
        case "4": return 4;
        case "3": case "learning": return 3;
        case "2": return 2;
        case "1": return 1;
        case "ignored": return 0;
        default: return 0;
      }
    };

    return list.sort((a, b) => {
      if (vocabSort === "newest") {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      if (vocabSort === "oldest") {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      if (vocabSort === "alphabetical") {
        return a.word.localeCompare(b.word);
      }
      if (vocabSort === "level_desc") {
        return getStatusWeight(b.status) - getStatusWeight(a.status);
      }
      if (vocabSort === "level_asc") {
        return getStatusWeight(a.status) - getStatusWeight(b.status);
      }
      return 0;
    });
  }, [statsArray, vocabSearch, vocabFilter, vocabSort, vocabTagFilter, vocabLengthFilter, vocabImageFilter]);

  // Optionally group words by their resolved patterns/lemmas
  const processedVocabularyList = useMemo(() => {
    if (!onlyPatterns) {
      return filteredVocabularyList;
    }

    const grouped = new Map<string, VocabItem>();
    filteredVocabularyList.forEach((item) => {
      const resolved = resolveWordToPattern(item.word);
      const existing = grouped.get(resolved);

      if (!existing) {
        grouped.set(resolved, {
          ...item,
          word: resolved, // display word as base pattern e.g. "uva"
        });
      } else {
        // Merge entries: keep higher rank status
        const getStatusWeight = (status: string) => {
          switch (status) {
            case "known": return 6;
            case "5": return 5;
            case "4": return 4;
            case "3": case "learning": return 3;
            case "2": return 2;
            case "1": return 1;
            case "ignored": return 0;
            default: return 0;
          }
        };
        const useNewer = getStatusWeight(item.status) > getStatusWeight(existing.status);

        // Intelligently merge translations
        let mergedTranslation = existing.translation || "";
        const itemTranslation = item.translation || "";
        if (itemTranslation && itemTranslation !== mergedTranslation) {
          const existingLower = mergedTranslation.toLowerCase();
          const itemLower = itemTranslation.toLowerCase();
          if (!existingLower.includes(itemLower) && !itemLower.includes(existingLower)) {
            mergedTranslation = mergedTranslation ? `${mergedTranslation} | ${itemTranslation}` : itemTranslation;
          }
        }

        grouped.set(resolved, {
          ...(useNewer ? item : existing),
          word: resolved,
          translation: mergedTranslation,
          createdAt: Math.max(existing.createdAt || 0, item.createdAt || 0),
        });
      }
    });

    return Array.from(grouped.values());
  }, [filteredVocabularyList, onlyPatterns, selectedStatsLang, wordLinks]);

  const totalPages = Math.ceil(processedVocabularyList.length / itemsPerPage);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

  const paginatedVocabularyList = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return processedVocabularyList.slice(startIndex, startIndex + itemsPerPage);
  }, [processedVocabularyList, safeCurrentPage, itemsPerPage]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 10;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    let start = safeCurrentPage - Math.floor(maxButtons / 2);
    start = Math.max(1, start);
    let end = start + maxButtons - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxButtons + 1);
    }
    
    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  return (
    <div className="space-y-6">
      
      {/* Page Title Board */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs">
        <div>
          <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-500" />
            Личный кабинет и статистика обучения (Learning Analytics)
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Отслеживайте свой словарный запас, показатели понимания текстов и речевую активность.
          </p>
        </div>

        {/* Decorative Time Tracker HUD block */}
        <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-100/45 dark:border-zinc-800/50 shrink-0 select-none">
          <Calendar className="w-4 h-4 text-zinc-400" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Статистика обновляется мгновенно в реальном времени
          </span>
        </div>
      </div>

      {/* Dynamic Language Selection Hub */}
      {languagesList.length > 0 && (
        <div id="stats-lang-selector" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-3 rounded-2xl shadow-xs font-sans">
          <label className="block text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 px-1">
            Выберите язык для просмотра статистики / Choose Language:
          </label>
          <div className="flex flex-wrap gap-2">
            {languagesList.map((lang) => {
              const wordsCount = Object.entries(vocab).filter(([key, lq]) => {
                const parts = key.split("_");
                const itemLang = parts.length > 1 ? parts[0] : "spanish";
                return itemLang.toLowerCase() === lang.toLowerCase();
              }).length;

              return (
                <button
                  key={lang}
                  onClick={() => setSelectedStatsLang(lang)}
                  className={`px-4 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${
                    selectedStatsLang.toLowerCase() === lang.toLowerCase()
                      ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900"
                      : "bg-zinc-50 border-zinc-200/60 dark:bg-zinc-950 dark:border-zinc-800 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-300"
                  }`}
                >
                  <span>{lang}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                    selectedStatsLang.toLowerCase() === lang.toLowerCase()
                      ? "bg-teal-200/50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "bg-zinc-200/50 dark:bg-zinc-800 text-zinc-500"
                  }`}>
                    {wordsCount} слов(а)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary Bento Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Known Words */}
        <div id="stat-known-card" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute right-0 top-0 opacity-10 -translate-x-1 translate-y-1 text-emerald-555">
            <Award className="w-24 h-24" />
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
              Изучено слов (Known)
            </span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
              {stats.known}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
              ✓ Полностью освоенные слова
            </span>
          </div>
        </div>

        {/* Card 2: Learning Words */}
        <div id="stat-learning-card" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex items-center gap-4 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 -translate-x-1 translate-y-1 text-amber-555">
            <Sparkles className="w-24 h-24 animate-pulse" />
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/25 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
              Изучается (Learning)
            </span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
              {stats.learning}
            </span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5">
              ⚡ Активных карточек в обучении
            </span>
          </div>
        </div>

        {/* Card 3: Audio listening tracker */}
        <div id="stat-audio-card" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex items-center gap-4 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 -translate-x-1 translate-y-1 text-teal-555">
            <Clock className="w-24 h-24" />
          </div>
          <div className="p-3 bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 rounded-xl shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
              Прослушивание (Listening)
            </span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white mt-1 block truncate">
              {formatTime(listeningSeconds)}
            </span>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold block mt-0.5">
              🔊 Время речевой аудиоозвучки
            </span>
          </div>
        </div>

        {/* Card 4: Total active books */}
        <div id="stat-books-card" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex items-center gap-4 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 -translate-x-1 translate-y-1 text-teal-555">
            <BookOpen className="w-24 h-24" />
          </div>
          <div className="p-3 bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 rounded-xl shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
              Активных книг (Books)
            </span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white mt-1 block">
              {lessons.filter(l => !l.isArchived).length}
            </span>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold block mt-0.5">
              📖 Всего книг на книжной полке
            </span>
          </div>
        </div>

      </div>

      {/* Grid: Milestones estimate & Word Status distribution bars */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        
        {/* CEFR Level Milestone Indicator */}
        <div className="col-span-12 md:col-span-6 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950/40 text-[10px] font-black text-teal-700 dark:text-teal-400 uppercase tracking-widest">
              <Award className="w-3.5 h-3.5" />
              Текущий уровень владения (Estimated Language Level)
            </div>
            <h3 className="text-xl font-black text-zinc-900 dark:text-white mt-2">
              {stats.cefr.level}
            </h3>
            <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">
              {stats.cefr.desc} Оценка уровня производится на основе количества изученных и подтвержденных слов на платформе.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between items-center text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              <span>До следующего ранга осталось: {stats.cefr.target - stats.known < 0 ? 0 : stats.cefr.target - stats.known} слов</span>
              <span className="text-teal-600 dark:text-teal-400">{stats.cefr.progress}%</span>
            </div>
            
            {/* Elegant visual gauge bar */}
            <div className="h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-950 overflow-hidden flex border border-zinc-200 dark:border-zinc-800">
              <div 
                style={{ width: `${stats.cefr.progress}%` }}
                className="h-full bg-gradient-to-r from-teal-500 to-teal-700 rounded-full transition-all duration-300"
              />
            </div>

            <div className="flex justify-between items-center text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
              <span>{stats.known} слов</span>
              <span>Цель: {stats.cefr.target} слов</span>
            </div>
          </div>
        </div>

        {/* Word Status Level distribution Bar charts (Custom SVG elements) */}
        <div className="col-span-12 md:col-span-6 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-widest text-zinc-400">
              Распределение слов по статусу знакомства (Word Status Breakdown)
            </h4>
            <p className="text-[11px] text-zinc-500">
              Каждое сохраненное слово проходит 5 этапов запоминания до статуса «Знаю».
            </p>
          </div>

          {/* Graphics Custom Level Bars */}
          <div className="space-y-3 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            
            {/* Status 1 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-red-400 inline-block"></span>
                  Новые (Статус 1 - Не помню совсем)
                </span>
                <span>{stats.distribution.status1} слов</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-400 rounded-full"
                  style={{ width: `${stats.total > 0 ? (stats.distribution.status1 / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Status 2 & 3 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block"></span>
                  В процессе (Статус 2-3 - Припоминаю с трудом)
                </span>
                <span>{stats.distribution.status2 + stats.distribution.status3} слов</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-full"
                  style={{ width: `${stats.total > 0 ? ((stats.distribution.status2 + stats.distribution.status3) / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Status 4 & 5 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-teal-400 inline-block"></span>
                  Почти изучено (Статус 4-5 - Хорошо помню)
                </span>
                <span>{stats.distribution.status4 + stats.distribution.status5} слов</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-teal-400 rounded-full"
                  style={{ width: `${stats.total > 0 ? ((stats.distribution.status4 + stats.distribution.status5) / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Known Status */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span>
                  Знаю (Полностью выучено)
                </span>
                <span>{stats.known} слов</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${stats.total > 0 ? (stats.known / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 2.5. Learning Progress Dashboard (Heatmap & Growth Curve) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        
        {/* Heatmap & Streak Section */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500 fill-orange-500 animate-pulse" />
                Карта активности и регулярности обучения (Vocabulary Heatmap)
              </h3>
              <p className="text-xs text-zinc-500">
                Визуализация вашей ежедневной активности по сохранению и изучению новых слов за последние 24 недели.
              </p>
            </div>
          </div>

          {/* Interactive Streak Indicators HUD strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-xl border border-zinc-100/45 dark:border-zinc-800/40 text-xs text-zinc-600 dark:text-zinc-300">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-black text-zinc-400 select-none block">Текущая серия (Streak)</span>
              <div className="flex items-center gap-1.5">
                <Flame className={`w-4 h-4 ${heatmapData.currentStreak > 0 ? "text-orange-500 fill-orange-500" : "text-zinc-400"}`} />
                <span className="font-extrabold text-sm text-zinc-800 dark:text-white">
                  {heatmapData.currentStreak} {heatmapData.currentStreak === 1 ? "день" : [2,3,4].includes(heatmapData.currentStreak % 10) && ![12,13,14].includes(heatmapData.currentStreak) ? "дня" : "дней"}
                </span>
              </div>
            </div>

            <div className="space-y-1 border-l border-zinc-100 dark:border-zinc-800/80 pl-3">
              <span className="text-[9px] uppercase font-black text-zinc-400 select-none block">Рекорд серии</span>
              <div className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="font-extrabold text-sm text-zinc-800 dark:text-white">
                  {heatmapData.longestStreak} {heatmapData.longestStreak === 1 ? "день" : [2,3,4].includes(heatmapData.longestStreak % 10) && ![12,13,14].includes(heatmapData.longestStreak) ? "дня" : "дней"}
                </span>
              </div>
            </div>

            <div className="space-y-1 border-l border-zinc-100 dark:border-zinc-800/80 pl-3">
              <span className="text-[9px] uppercase font-black text-zinc-400 select-none block">Активных дней</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-500" />
                <span className="font-extrabold text-sm text-zinc-800 dark:text-white">
                  {heatmapData.activeDays} {heatmapData.activeDays % 10 === 1 && heatmapData.activeDays !== 11 ? "день" : [2,3,4].includes(heatmapData.activeDays % 10) && ![12,13,14].includes(heatmapData.activeDays) ? "дня" : "дней"}
                </span>
              </div>
            </div>

            <div className="space-y-1 border-l border-zinc-100 dark:border-zinc-800/80 pl-3">
              <span className="text-[9px] uppercase font-black text-zinc-400 select-none block">Пик за сутки</span>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="font-extrabold text-sm text-zinc-800 dark:text-white">
                  +{heatmapData.maxInADay} слов
                </span>
              </div>
            </div>
          </div>

          {/* Actual Contribution Grid wrapper with Month Headers and vertical row labels */}
          <div className="p-3 bg-zinc-50/50 dark:bg-zinc-950/20 rounded-xl border border-zinc-100 dark:border-zinc-800/50 overflow-hidden">
            
            {/* Months Row */}
            <div className="flex pl-8 text-[9px] font-bold text-zinc-400 select-none relative h-4 mb-1">
              {(() => {
                let lastMonthName = "";
                return heatmapData.columns.map((week, wIdx) => {
                  const firstDay = week[0].date;
                  const monthName = firstDay.toLocaleDateString("ru", { month: "short" });
                  
                  // Only display month name when it changes
                  if (monthName !== lastMonthName) {
                    lastMonthName = monthName;
                    return (
                      <div 
                        key={wIdx} 
                        style={{ left: `${32 + wIdx * 15.5}px` }}
                        className="absolute capitalize text-[8px] tracking-tight font-extrabold"
                      >
                        {monthName}
                      </div>
                    );
                  }
                  return null;
                });
              })()}
            </div>

            <div className="flex gap-1.5 items-start">
              {/* Day names left labels */}
              <div className="flex flex-col text-[8px] font-black text-zinc-400 select-none space-y-[4.5px] mt-0.5 w-[22px] text-right shrink-0">
                <span>Пн</span>
                <span className="opacity-0">Вт</span>
                <span>Ср</span>
                <span className="opacity-0">Чт</span>
                <span>Пт</span>
                <span className="opacity-0">Сб</span>
                <span>Вс</span>
              </div>

              {/* Heatmap Matrix with Columns representing weeks */}
              <div className="flex-1 overflow-x-auto pb-1 scrollbar-thin flex gap-1 select-none">
                {heatmapData.columns.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col gap-1 shrink-0 font-mono">
                    {week.map((day) => {
                      const count = day.count;
                      
                      // Assign color bounds
                      let cellColor = "bg-zinc-100 dark:bg-zinc-950 border-zinc-200/20 dark:border-zinc-800/40 hover:scale-115";
                      if (count > 0 && count <= 2) {
                        cellColor = "bg-teal-100 dark:bg-teal-950/30 border-teal-200/50 dark:border-teal-900/50 hover:bg-teal-200 hover:scale-120";
                      } else if (count > 2 && count <= 5) {
                        cellColor = "bg-teal-300 dark:bg-teal-800 border-teal-400 dark:border-teal-700 hover:bg-teal-400 hover:scale-120";
                      } else if (count > 5 && count <= 9) {
                        cellColor = "bg-teal-500 dark:bg-teal-600 border-teal-600 dark:border-teal-500 hover:bg-teal-600 hover:scale-120 text-white";
                      } else if (count >= 10) {
                        cellColor = "bg-teal-700 dark:bg-teal-400 border-teal-800 dark:border-teal-300 hover:bg-teal-800 hover:scale-120 text-white";
                      }

                      const isSelected = selectedHeatmapDate === day.dateStr;

                      return (
                        <button
                          key={day.dateStr}
                          type="button"
                          onClick={() => {
                            setSelectedHeatmapDate(selectedHeatmapDate === day.dateStr ? null : day.dateStr);
                          }}
                          className={`w-[11.5px] h-[11.5px] rounded-xs border transition-all duration-100 shrink-0 cursor-pointer ${cellColor} ${
                            isSelected ? "ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-zinc-900 scale-125 z-10 font-bold" : ""
                          }`}
                          title={`${day.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}: добавлено ${count} слов(а)`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap Legend */}
            <div className="flex items-center justify-between mt-3 text-[10px] text-zinc-400 select-none border-t border-zinc-100/40 dark:border-zinc-800/40 pt-2 px-1">
              <span>* Кликните на квадрат, чтобы посмотреть добавленные слова за этот день</span>
              <div className="flex items-center gap-1">
                <span>Меньше</span>
                <span className="w-2.5 h-2.5 rounded bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/30 dark:border-zinc-800/40" />
                <span className="w-2.5 h-2.5 rounded bg-teal-100 dark:bg-teal-950/30 border border-teal-200/30 dark:border-teal-900/40" />
                <span className="w-2.5 h-2.5 rounded bg-teal-300 dark:bg-teal-800" />
                <span className="w-2.5 h-2.5 rounded bg-teal-500 dark:bg-teal-600" />
                <span className="w-2.5 h-2.5 rounded bg-teal-700 dark:bg-teal-400" />
                <span>Больше</span>
              </div>
            </div>
            
          </div>

          {/* Interactive Cell Words Details Overlay popup/block (renders slide-in details) */}
          {selectedHeatmapDate && (() => {
            const resolvedWords = heatmapData.columns.flatMap(c => c).find(day => day.dateStr === selectedHeatmapDate);
            if (!resolvedWords) return null;
            
            const wordsList = resolvedWords.words;
            const fullDateStr = resolvedWords.date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            
            return (
              <div className="bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/60 p-3.5 rounded-xl animate-in slide-in-from-top-2 duration-200 font-sans space-y-2">
                <div className="flex items-center justify-between text-xs select-none border-b border-teal-100/45 pb-1.5">
                  <span className="font-extrabold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
                    🗓️ Добавлено в {fullDateStr}
                  </span>
                  <button
                    onClick={() => setSelectedHeatmapDate(null)}
                    className="text-[10px] font-black hover:text-red-500 cursor-pointer text-zinc-400"
                  >
                    закрыть ✕
                  </button>
                </div>
                {wordsList.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {wordsList.map((word, wIdx) => {
                      const wordObj = statsArray.find(item => item.word.toLowerCase() === word.toLowerCase());
                      return (
                        <div 
                          key={`${word}-${wIdx}`} 
                          className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-900/60 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 shadow-3xs"
                        >
                          <span className="text-teal-600 dark:text-teal-400 capitalize">{word}</span>
                          {wordObj?.translation && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[120px] font-medium border-l pl-1.5 border-zinc-100 dark:border-zinc-800">
                              {wordObj.translation}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400 italic">
                    В этот день вы не заносили новые слова в словарь. Самое время изучить новый урок! 🚀
                  </p>
                )}
              </div>
            );
          })()}

        </div>

        {/* Month-by-Month Vocabulary Cumulative Growth curve (custom SVG based dashboard) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="space-y-1 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-500" />
              Рост словаря (Growth History)
            </h3>
            <p className="text-xs text-zinc-500 w-full">
              Динамика накопления сохраненных слов по месяцам.
            </p>
          </div>

          {/* SVG Trend curve bar elements */}
          {monthlyGrowth.length > 0 ? (
            <div className="py-4 flex-1 flex flex-col justify-end space-y-4">
              
              {/* Chart Visual Grid */}
              <div className="h-28 flex items-end justify-between px-2 gap-2 w-full pt-2 relative">
                
                {/* Visual horizontal guidelines background */}
                <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none select-none">
                  <div className="w-full border-t border-zinc-100 dark:border-zinc-800/60 h-0" />
                  <div className="w-full border-t border-zinc-100 dark:border-zinc-800/60 h-0" />
                  <div className="w-full border-t border-zinc-100 dark:border-zinc-800/60 h-0" />
                </div>

                {(() => {
                  const maxCount = Math.max(...monthlyGrowth.map(m => m.count), 5);
                  return monthlyGrowth.map((month, idx) => {
                    const heightPercent = Math.max(5, Math.min(100, (month.count / maxCount) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center group relative z-1">
                        
                        {/* Word count Bubble marker displayed on hover/active */}
                        <div className="absolute bottom-full mb-1 bg-zinc-800 dark:bg-zinc-800 text-white dark:text-zinc-100 text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none mb-1.5 duration-100 select-none">
                          {month.count} слов
                        </div>

                        {/* Bar graphics column */}
                        <div className="w-full max-w-[28px] bg-gradient-to-t from-teal-50 to-teal-100 dark:from-teal-950/20 dark:to-teal-900/60 rounded-t-lg border border-teal-200/30 hover:border-teal-500/50 hover:from-teal-500 hover:to-teal-600 dark:hover:from-teal-500 dark:hover:to-teal-400 transition-all select-none cursor-help overflow-hidden relative flex flex-col justify-end" style={{ height: `${heightPercent}%` }}>
                          
                          {/* Inner gradient filler bar */}
                          <div className="w-full bg-teal-500 dark:bg-teal-400 rounded-t-sm h-1.5 opacity-80" />
                        </div>

                        {/* Month names footer */}
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-2 block select-none capitalize">
                          {month.name}
                        </span>
                      </div>
                    );
                  });
                })()}

              </div>

              {/* Sparkline details list summary */}
              <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100/50 dark:border-zinc-800/50 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between font-medium select-none">
                  <span>Общий запас (Total Scope):</span>
                  <strong className="text-zinc-900 dark:text-white">{statsArray.length} {onlyPatterns ? "parents" : "слов"}</strong>
                </div>
                <div className="flex justify-between font-medium select-none text-[10.5px]">
                  <span>Позапрошлый месяц:</span>
                  <span className="text-zinc-500">{monthlyGrowth[3]?.count || 0} {onlyPatterns ? "parents" : "слов"}</span>
                </div>
                <div className="flex justify-between font-medium select-none text-[10.5px]">
                  <span>Текущий месяц:</span>
                  <span className="text-teal-600 dark:text-teal-400 font-bold">+{statsArray.length - (monthlyGrowth[4]?.count || 0)} новых за месяц</span>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-950/50 rounded-xl select-none">
              <span className="text-xs text-zinc-400 italic">Недостаточно данных для графика</span>
            </div>
          )}
        </div>

      </div>

      {/* 2.6. CEFR Word Prioritization & Lesson Corpus Profiler */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-5 font-sans">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2 select-none">
              <Sparkles className="w-5 h-5 text-teal-500 animate-pulse" />
              Приоритет изучения слов & CEFR профилирование (Vocabulary Priority Profiler)
            </h3>
            <p className="text-xs text-zinc-500">
              Умный лингвистический анализатор сканирует тексты ваших импортированных уроков, определяет частоту повторения слов и автоматически размечает карточки уровнями сложности (от A1 до C1). Это помогает сфокусироваться на высокочастотных словах в первую очередь.
            </p>
          </div>

          <button
            onClick={handleAutoProfileVocabulary}
            disabled={isProfiling || vocabArray.length === 0}
            className={`cursor-pointer px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl border transition-all flex items-center gap-2 select-none shadow-3xs hover:shadow-4xs ${
              isProfiling
                ? "bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 animate-pulse cursor-not-allowed"
                : "bg-teal-500 hover:bg-teal-600 active:scale-97 border-teal-600 hover:border-teal-700 text-white dark:bg-teal-600 dark:hover:bg-teal-600"
            }`}
          >
            {isProfiling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Анализ уроков...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Запустить разметку словаря</span>
              </>
            )}
          </button>
        </div>

        {/* Display profile messages / results if any */}
        {profileMessage && (
          <div className="p-3 bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 text-xs font-semibold text-teal-700 dark:text-teal-400 rounded-xl leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-200">
            <span className="text-sm select-none">💡</span>
            <span>{profileMessage}</span>
          </div>
        )}

        {/* Live CEFR Distribution Profile Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs select-none">
            <span className="font-extrabold text-zinc-600 dark:text-zinc-300">Распределение уровня сложности словаря ({selectedStatsLang}):</span>
            <span className="font-mono text-zinc-400">
              Размечено: <strong className="text-zinc-700 dark:text-zinc-200 font-extrabold">{cefrProfileCounts.totalWithCefr}</strong> из <strong className="text-zinc-700 dark:text-zinc-200 font-extrabold">{vocabArray.length}</strong> слов
            </span>
          </div>

          {vocabArray.length === 0 ? (
            <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center select-none text-xs text-zinc-400 italic">
              Словарь пуст. Добавьте слова, читая уроки во вкладке "Читать уроки".
            </div>
          ) : cefrProfileCounts.totalWithCefr > 0 ? (
            <div className="space-y-4">
              
              {/* Segmented Progress Band Bar representational display */}
              <div className="h-4 rounded-xl flex overflow-hidden border border-zinc-200/45 dark:border-zinc-800/45 select-none shadow-4xs">
                {(() => {
                  const items = [
                    { label: "A1", count: cefrProfileCounts.a1, color: "bg-emerald-500 text-white" },
                    { label: "A2", count: cefrProfileCounts.a2, color: "bg-teal-500 text-white" },
                    { label: "B1", count: cefrProfileCounts.b1, color: "bg-cyan-500 text-white" },
                    { label: "B2", count: cefrProfileCounts.b2, color: "bg-blue-500 text-white" },
                    { label: "C1", count: cefrProfileCounts.c1, color: "bg-indigo-500 text-white" },
                    { label: "C2", count: cefrProfileCounts.c2, color: "bg-violet-500 text-white" },
                  ];

                  const total = cefrProfileCounts.totalWithCefr;
                  return items.map((item, idx) => {
                    if (item.count === 0) return null;
                    const pct = (item.count / total) * 100;
                    return (
                      <div
                        key={idx}
                        style={{ width: `${pct}%` }}
                        className={`${item.color} flex items-center justify-center font-mono text-[8px] font-black leading-none truncate`}
                        title={`${item.label}: ${item.count} слов (${pct.toFixed(1)}%)`}
                      >
                        {pct >= 8 && `${item.label} (${pct.toFixed(0)}%)`}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* CEFR Tiers Detailed Grid Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { level: "A1", badgeDesc: "Ключевые слова", count: cefrProfileCounts.a1, color: "border-emerald-200 text-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/10 dark:text-emerald-400 dark:border-emerald-950", sub: "Самые частые (Топ-15%)" },
                  { level: "A2", badgeDesc: "Разговорные основы", count: cefrProfileCounts.a2, color: "border-teal-200 text-teal-700 bg-teal-50/40 dark:bg-teal-950/10 dark:text-teal-400 dark:border-teal-950", sub: "Общие основы (15-35%)" },
                  { level: "B1", badgeDesc: "Пороговые понятия", count: cefrProfileCounts.b1, color: "border-cyan-200 text-cyan-700 bg-cyan-50/40 dark:bg-cyan-950/10 dark:text-cyan-400 dark:border-cyan-950", sub: "Средний уровень (35-55%)" },
                  { level: "B2", badgeDesc: "Продвинутая речь", count: cefrProfileCounts.b2, color: "border-blue-200 text-blue-700 bg-blue-50/40 dark:bg-blue-950/10 dark:text-blue-400 dark:border-blue-950", sub: "Выше среднего (55-75%)" },
                  { level: "C1", badgeDesc: "Академические", count: cefrProfileCounts.c1, color: "border-indigo-200 text-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/10 dark:text-indigo-400 dark:border-indigo-950", sub: "Сложные/Письменные" },
                  { level: "C2", badgeDesc: "Узкая терминология", count: cefrProfileCounts.c2, color: "border-violet-200 text-violet-700 bg-violet-50/40 dark:bg-violet-950/10 dark:text-violet-400 dark:border-violet-950", sub: "Редкие слова (последний топ)" },
                ].map((tier, idx) => (
                  <div key={idx} className={`p-2.5 border rounded-xl flex flex-col justify-between ${tier.color} text-xs leading-normal select-none`}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm">{tier.level}</span>
                      <span className="font-sans font-black text-xs">{tier.count} <span className="text-[10px] font-normal text-zinc-400">слов</span></span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide opacity-80 leading-tight">{tier.badgeDesc}</p>
                      <p className="text-[8px] opacity-60 leading-none">{tier.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ) : (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center select-none text-[11px] text-zinc-500 leading-normal">
              В вашем словаре пока нет размеченных по частотности слов. Нажмите кнопку <strong className="text-teal-600 dark:text-teal-400 font-extrabold">"Запустить разметку словаря"</strong> в правом верхнем углу, чтобы просканировать ваши уроки и присвоить теги приоритета!
            </div>
          )}
        </div>

      </div>

      {/* Contextual search across uploaded texts */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-4 font-sans">
        <div className="space-y-0.5">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2 select-none">
            <BookOpen className="w-5 h-5 text-teal-500" />
            Контекстный поиск по своим книгам
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Часто мы учим слово, но забываем, где именно его встречали. Поиск работает не по словарю, а по всем текстам, которые вы уже загрузили в Lectura.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
          <input
            type="text"
            value={contextSearchQuery}
            onChange={(e) => setContextSearchQuery(e.target.value)}
            placeholder="Введите слово или фразу — найдём все вхождения в ваших книгах..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/25"
          />
        </div>

        {contextSearchQuery.trim().length >= 2 && contextSearchHits.length === 0 && (
          <p className="text-xs text-zinc-500 italic">
            Не найдено вхождений «{contextSearchQuery.trim()}» в текстах на языке {selectedStatsLang}.
          </p>
        )}

        {contextSearchHits.length > 0 && (
          <ContextSearchResults
            hits={contextSearchHits}
            query={contextSearchQuery.trim()}
            onOpenLesson={onOpenLesson}
            maxVisible={12}
            embedded
          />
        )}
      </div>

      {/* Vocabulary Review Interactive Workspace */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-4">
        
        <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-teal-500" />
              Личный интерактивный словарь и разбор слов (Vocabulary Notebook)
            </h4>
            <p className="text-xs text-zinc-500">
              Быстрый обзор, повторение, редактирование статусов или удаление из карточек.
            </p>
          </div>

          {/* Filtering tabs replaced with a dynamic word counter badge + Advanced filter toggle */}
          <div className="flex items-center gap-2 shrink-0 select-none flex-wrap">
            <button
              onClick={() => {
                if (!statsArray || statsArray.length === 0) return;
                const header = ["Word", "Translation", "Context", "Status", "Tags"].join("\t");
                const rows = statsArray.map((item) => {
                  const cleanWord = (item.word || "").replace(/\t/g, " ");
                  const cleanTranslation = (item.translation || "").replace(/\t/g, " ");
                  const cleanContext = (item.contextSentence || item.sentence || "").replace(/\t/g, " ");
                  const statusLabel = `L${item.status || 1}`;
                  const tags = (item.tags || []).join(" ") || "lectura";
                  return `${cleanWord}\t${cleanTranslation}\t${cleanContext}\t${statusLabel}\t${tags}`;
                });

                const csvContent = [header, ...rows].join("\n");
                const blob = new Blob(["\uFEFF" + csvContent], { type: "text/tab-separated-values;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                const filename = `lectura_anki_${selectedStatsLang.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.txt`;
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/60 flex items-center gap-1.5 cursor-pointer shadow-3xs"
              title="Экспортировать отфильтрованные слова в Anki (.txt)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Anki (.txt)</span>
            </button>
            <button
              onClick={() => setShowMigrationTools(!showMigrationTools)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 cursor-pointer ${
                showMigrationTools
                  ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
                  : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-800 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"
              }`}
              title="Инструменты коррекции дат для импортированных слов из Lute/Anki"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Перенос с Lute / Даты</span>
            </button>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 cursor-pointer ${
                showAdvancedFilters
                  ? "bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900"
                  : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-800 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Доп. Фильтры</span>
              {(vocabTagFilter !== "all" || vocabLengthFilter !== "all" || vocabImageFilter !== "all") && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={processedVocabularyList.length === 0}
              className="px-3 py-1.5 bg-zinc-50 border border-zinc-200 text-zinc-600 hover:text-zinc-800 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs disabled:opacity-50 disabled:pointer-events-none select-none"
              title="Экспортировать отфильтрованные слова в CSV файл"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Экспорт ({processedVocabularyList.length})</span>
            </button>
            <button
              onClick={() => document.getElementById("csv-file-import-input")?.click()}
              className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 active:scale-97 border border-teal-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs hover:shadow-4xs select-none"
              title="Импортировать слова из CSV-файла"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Импорт CSV</span>
            </button>
            <input
              type="file"
              id="csv-file-import-input"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
            <div className="flex bg-zinc-100 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 items-center gap-1.5 header-badge-layout select-none">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Найдено слов:</span>
              <span className="text-xs font-black text-teal-600 dark:text-teal-400 leading-none">{processedVocabularyList.length}</span>
            </div>
          </div>
        </div>

        {/* Search, Level Filter & Sorting header panel */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
            <input
              type="text"
              value={vocabSearch}
              onChange={(e) => setVocabSearch(e.target.value)}
              placeholder="Быстрый поиск слова в блокноте... (Поиск перевода или грамматики)"
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
          </div>

          {/* New Dropdown list to filter by level of understanding and ignored status */}
          <div className="relative">
            <select
              value={vocabFilter}
              onChange={(e) => setVocabFilter(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/25 appearance-none cursor-pointer"
            >
              <option value="all">🌐 Все активные {onlyPatterns ? "parents" : "слова"} ({statsArray.filter(l => l.status !== "ignored").length})</option>
              <option value="learning">🎓 Изучаю (1-5) ({stats.learning})</option>
              <option value="1">🔴 Уровень 1 (Новое) ({stats.distribution.status1})</option>
              <option value="2">🟠 Уровень 2 (Трудное) ({stats.distribution.status2})</option>
              <option value="3">🟡 Уровень 3 (Припоминаю) ({stats.distribution.status3})</option>
              <option value="4">🟢 Уровень 4 (Почти знаю) ({stats.distribution.status4})</option>
              <option value="5">🟣 Уровень 5 (Знаю хорошо) ({stats.distribution.status5})</option>
              <option value="known">✓ Изучено ({stats.known})</option>
              <option value="ignored">🚫 Игнорированные ({stats.ignored})</option>
            </select>
            <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-zinc-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          <div className="relative">
            <select
              value={vocabSort}
              onChange={(e) => setVocabSort(e.target.value as any)}
              className="w-full pl-3 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/25 appearance-none cursor-pointer"
            >
              <option value="newest">📅 Сначала новые</option>
              <option value="oldest">📅 Сначала старые</option>
              <option value="alphabetical">🔤 По алфавиту</option>
              <option value="level_desc">📈 Status (По убыванию)</option>
              <option value="level_asc">📉 Status (По возрастанию)</option>
            </select>
            <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-zinc-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {/* Root/lemma patterns toggle selector */}
          <button
            type="button"
            onClick={() => setOnlyPatterns(!onlyPatterns)}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border flex items-center justify-center gap-2 select-none cursor-pointer ${
              onlyPatterns
                ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/45 dark:border-teal-900 dark:text-teal-400 font-extrabold shadow-inner"
                : "bg-zinc-50 border-zinc-100 dark:bg-zinc-950 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
            title="Отображать только базовые формы (леммы) слов, группируя морфологические формы"
          >
            <span className="text-sm leading-none">🔗</span>
            <span>Только Parents</span>
          </button>
        </div>

        {/* Lute / Anki Migration and Date correction Tools Collapsible Card */}
        {showMigrationTools && (
          <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-200/50 dark:border-amber-900/40 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-150 font-sans font-medium">
            <div className="flex items-start gap-2.5">
              <span className="text-xl">📅</span>
              <div className="space-y-1">
                <h5 className="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest leading-none">
                  Инструменты миграции и ручного управления датами (LUTE / Anki Migration Tools)
                </h5>
                <p className="text-[11.5px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold">
                  При переезде с Lute или Anki слова часто импортируются или добавляются сотнями за одну сессию. Это создает один огромный пик на тепловой карте и искажает ежедневную статистику. Вы можете точечно менять даты у слов в таблице ниже, либо использовать инструменты пакетного распределения ниже.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
              
              {/* Option 1: Disperse / Smooth out date values */}
              <div className="bg-white/80 dark:bg-zinc-950/45 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="space-y-1">
                  <h6 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 leading-none">
                    <RefreshCw className="w-3.5 h-3.5 text-teal-500" />
                    Равномерно распределить (Разгладить тепловую карту)
                  </h6>
                  <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-snug font-medium">
                    Равномерно распределит все слова из текущего отфильтрованного списка ({processedVocabularyList.length} шт.) по временному интервалу назад в прошлое.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[9px] uppercase font-black text-zinc-400 tracking-wider">Интервал:</span>
                  {[7, 14, 30, 90, 180].map((days) => (
                    <button
                      key={days}
                      onClick={() => handleDisperseDates(days)}
                      disabled={processedVocabularyList.length === 0}
                      className="cursor-pointer px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-zinc-50 hover:bg-teal-500 hover:text-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-teal-500 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {days} дн.
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 2: Set absolute batch date */}
              <div className="bg-white/80 dark:bg-zinc-950/45 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="space-y-1">
                  <h6 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 leading-none">
                    <Calendar className="w-3.5 h-3.5 text-cyan-500" />
                    Пакетный перенос на определенный день
                  </h6>
                  <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-snug font-medium">
                    Установит выбранную дату в точности для всех отфильтрованных слов ({processedVocabularyList.length} шт.).
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="date"
                    id="batch-target-date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('batch-target-date') as HTMLInputElement;
                      if (input && input.value) {
                        handleBatchSetDate(input.value);
                      }
                    }}
                    disabled={processedVocabularyList.length === 0}
                    className="cursor-pointer bg-teal-500 hover:bg-teal-600 text-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg border border-teal-600 hover:scale-105 active:scale-95 transition-all shadow-3xs disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Перенести
                  </button>
                </div>
              </div>

            </div>

            {/* Option 3: Batch Paste Import with selection of Date */}
            <div className="bg-white/80 dark:bg-zinc-950/45 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3.5 mt-3">
              <div className="space-y-1">
                <h6 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 leading-none">
                  <span className="text-sm leading-none">📋</span>
                  Пакетный импорт новых слов списком с выбором даты
                </h6>
                <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-snug font-medium">
                  Вставьте список слов (по одному слову на строку), либо скопированные данные из Lute / Anki (поддерживается автоматическое разделение по табуляции <code className="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.2 rounded font-mono font-bold text-amber-600">\t</code>, точке с запятой <code className="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.2 rounded font-mono font-bold text-amber-600">;</code>, символу <code className="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.2 rounded font-mono font-bold text-amber-600">|</code> или пробел-дефис-пробел <code className="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.2 rounded font-mono font-bold text-amber-600"> - </code> для добавления перевода).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
                {/* Left side: Textarea to paste words */}
                <div className="md:col-span-7 space-y-1.5">
                  <textarea
                    rows={5}
                    placeholder={`Пример:\nperro\tсобака\ngato\tкошка\nsol\tсолнце\nИли просто список слов по одному на строку`}
                    value={batchImportText}
                    onChange={(e) => setBatchImportText(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder-zinc-400 resize-y"
                  />
                  {parsedBatchWords.length > 0 && (
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold bg-teal-500/5 dark:bg-teal-400/5 px-2.5 py-1 rounded-lg border border-teal-500/10 flex items-center justify-between select-none animate-pulse">
                      <span>
                        🔍 Распознано слов к импорту: <strong className="text-teal-600 dark:text-teal-400">{parsedBatchWords.length} шт.</strong>
                        {" "}(новых: <strong className="text-emerald-600 dark:text-emerald-400">{batchImportStats.newWords}</strong>, обновится: <strong className="text-amber-600 dark:text-amber-400">{batchImportStats.existingWords}</strong>)
                      </span>
                      <span className="text-[8.5px] uppercase font-black tracking-widest text-zinc-400">Язык: {selectedStatsLang}</span>
                    </div>
                  )}
                </div>

                {/* Right side: Parameters & Execute Button */}
                <div className="md:col-span-5 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  {/* Select Import Date */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                      Установить дату сохранения:
                    </label>
                    <input
                      type="date"
                      value={batchImportDate}
                      onChange={(e) => setBatchImportDate(e.target.value || new Date().toISOString().split('T')[0])}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  {/* Select Word Status */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                        Статус слов:
                      </label>
                      <select
                        value={batchImportStatus}
                        onChange={(e) => setBatchImportStatus(e.target.value as WordStatus)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-sans text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                      >
                        <option value="1">Изучаю (1)</option>
                        <option value="2">Изучаю (2)</option>
                        <option value="3">Изучаю (3)</option>
                        <option value="4">Изучаю (4)</option>
                        <option value="5">Изучаю (5)</option>
                        <option value="known">Знаю полностью (known)</option>
                        <option value="ignored">Игнорировать</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                        Тег импорта:
                      </label>
                      <input
                        type="text"
                        placeholder="lute-import"
                        value={batchImportTag}
                        onChange={(e) => setBatchImportTag(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Execute Button */}
                  <button
                    onClick={handleExecuteBatchImport}
                    disabled={parsedBatchWords.length === 0}
                    className="w-full cursor-pointer bg-emerald-500 hover:bg-emerald-400 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest py-2 rounded-xl border border-emerald-600 hover:scale-103 active:scale-97 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/10 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none select-none"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Импортировать {parsedBatchWords.length > 0 ? `${parsedBatchWords.length} слов` : "список"}</span>
                  </button>
                </div>
              </div>

              {/* Parsed list preview */}
              {parsedBatchWords.length > 0 && (
                <div className="space-y-1 pt-1.5 border-t border-zinc-200/50 dark:border-zinc-800/50">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400">Предпросмотр первых нескольких записей:</span>
                  <div className="max-h-36 overflow-y-auto bg-zinc-500/5 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 font-mono text-[10.5px] space-y-1.5 align-middle">
                    {parsedBatchWords.slice(0, 10).map((w, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-zinc-700 dark:text-zinc-300">
                        <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                          <span className="font-extrabold text-teal-600 dark:text-teal-400 truncate">{w.word}</span>
                          {w.grammar && (
                            <span className="bg-emerald-50 dark:bg-emerald-950/35 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30 px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase shrink-0">
                              {w.grammar}
                            </span>
                          )}
                          <span className="text-zinc-400 dark:text-zinc-500 shrink-0">➔</span>
                          <span className="truncate italic text-zinc-500 dark:text-zinc-400">{w.translation}</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase shrink-0 tracking-wider ${
                          w.customDate 
                            ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/50" 
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                        }`}>
                          {w.customDate 
                            ? `📅 ${new Date(w.customDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })}` 
                            : "Выбранная дата"}
                        </span>
                      </div>
                    ))}
                    {parsedBatchWords.length > 10 && (
                      <div className="text-[9px] text-zinc-400 italic text-center pt-1 font-sans">
                        и ещё {parsedBatchWords.length - 10} слов(а)...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Option 4: Danger Zone - Clear dictionary */}
            <div className="bg-red-500/5 dark:bg-red-500/15 p-4 rounded-xl border border-red-200/40 dark:border-red-900/30 space-y-3 mt-1.5 font-sans">
              <div className="space-y-1">
                <h6 className="text-xs font-bold text-red-800 dark:text-red-400 flex items-center gap-1.5 leading-none">
                  <span className="text-sm leading-none">⚠️</span>
                  Опасная зона: Сбросить или стереть слова
                </h6>
                <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-snug font-medium">
                  Если вы хотите начать обучение заново для языка {selectedStatsLang.toUpperCase()} или очистить неверные импорты, воспользуйтесь кнопками ниже. Действие безвозвратно удаляет слова.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDeleteAllLanguageWords}
                  disabled={vocabArray.length === 0}
                  className="cursor-pointer bg-red-650 hover:bg-red-700 active:scale-98 text-white px-3.5 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg border border-red-700 hover:scale-103 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none disabled:transform-none select-none"
                  title="Удалить все слова для текущего выбранного языка из словаря"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить все слова {selectedStatsLang.toUpperCase()} ({vocabArray.length} шт.)</span>
                </button>

                {processedVocabularyList.length > 0 && processedVocabularyList.length < vocabArray.length && (
                  <button
                    type="button"
                    onClick={handleDeleteFilteredWords}
                    className="cursor-pointer bg-amber-600 hover:bg-amber-700 active:scale-98 text-white px-3.5 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg border border-amber-600 hover:scale-103 transition-all flex items-center gap-1.5 shadow-sm select-none"
                    title="Удалить только те слова, которые выбраны текущими фильтрами"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить только отфильтрованные ({processedVocabularyList.length} шт.)</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Advanced Filters Expandable Card */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800/50 rounded-2xl font-sans animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Tag Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1 leading-none select-none">
                <Tag className="w-3.5 h-3.5 text-teal-500" /> Фильтр по тегам
              </label>
              <div className="relative">
                <select
                  value={vocabTagFilter}
                  onChange={(e) => setVocabTagFilter(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/25 appearance-none cursor-pointer"
                >
                  <option value="all">🏷️ Все теги ({uniqueTags.length === 0 ? "нет тегов" : `${uniqueTags.length} видов`})</option>
                  {uniqueTags.map((t, tIdx) => (
                    <option key={`${t}-${tIdx}`} value={t}>#{t}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Length Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1 leading-none select-none">
                <Layers className="w-3.5 h-3.5 text-teal-500" /> Длина слова
              </label>
              <div className="relative">
                <select
                  value={vocabLengthFilter}
                  onChange={(e) => setVocabLengthFilter(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/25 appearance-none cursor-pointer"
                >
                  <option value="all">📏 Любая длина</option>
                  <option value="short">⚡ Короткие (&lt; 5 букв)</option>
                  <option value="medium">📝 Средние (5–8 букв)</option>
                  <option value="long">🏛️ Длинные (&gt; 8 букв)</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Media Attachment Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1 leading-none select-none">
                <Image className="w-3.5 h-3.5 text-teal-500" /> Иллюстрации карточки
              </label>
              <div className="relative">
                <select
                  value={vocabImageFilter}
                  onChange={(e) => setVocabImageFilter(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/25 appearance-none cursor-pointer"
                >
                  <option value="all">🖼️ Все карточки</option>
                  <option value="with_image">🎨 Только с иллюстрацией</option>
                  <option value="without_image">📝 Без иллюстрации</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Words Table/List */}
        {processedVocabularyList.length > 0 ? (
          <>
            <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800 rounded-xl max-h-[460px] overflow-y-auto">
            <table className="w-full table-auto border-collapse text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950 sticky top-0 border-b border-zinc-100 dark:border-zinc-800 text-[10px] font-black text-zinc-400 uppercase tracking-widest select-none">
                <tr>
                  <th className="p-3">Иностранное слово</th>
                  <th className="p-3">Parents</th>
                  <th className="p-3">Перевод / AI Значение</th>
                  <th className="p-3">Грамматика / IPA</th>
                  <th className="p-3 text-center">Дата доп.</th>
                  <th className="p-3 text-center">Статус</th>
                  <th className="p-3 text-center">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {paginatedVocabularyList.map((item, idx) => {
                  const isSavesKnown = item.status === "known";
                  return (
                    <tr key={`${item.word}-${idx}`} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-950/40 transition-colors">
                      {/* Foreign word */}
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-2">
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.word}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 object-cover rounded-lg border border-zinc-100 dark:border-zinc-800 shrink-0 select-none shadow-4xs"
                            />
                          )}
                          <div className="flex flex-col min-w-[120px]">
                            {editingWord === item.word ? (
                              <input
                                type="text"
                                value={editWordValue}
                                onChange={(e) => setEditWordValue(e.target.value)}
                                className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                              />
                            ) : (
                              <span className="capitalize leading-tight font-extrabold text-teal-600 dark:text-teal-400">{item.word}</span>
                            )}
                            {item.tags && item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 select-none">
                                {item.tags.map((tag, tagIdx) => (
                                  <span
                                    key={`${tag}-${tagIdx}`}
                                    className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[8px] px-1.5 py-0.5 rounded-full font-sans lowercase font-extrabold"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      {/* Pattern / Parent word */}
                      <td className="p-3 text-xs">
                        {editingWord === item.word ? (
                          <input
                            type="text"
                            value={editParentValue}
                            onChange={(e) => setEditParentValue(e.target.value)}
                            placeholder="Parents"
                            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        ) : onlyPatterns ? (
                          /* If onlyPatterns is true, the item.word is the pattern itself. Show child variations grouped under it */
                          (() => {
                            const childWords = getChildWordsForPattern(item.word);
                            return childWords.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 block w-full">варианты:</span>
                                {childWords.map((child, cIdx) => (
                                  <span
                                    key={`${child}-${cIdx}`}
                                    className="bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 text-[9px] px-1.5 py-0.5 rounded border border-teal-100 dark:border-teal-900 font-medium"
                                  >
                                    {child}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-zinc-400 italic">—</span>
                            );
                          })()
                        ) : (
                          /* Display parent pattern with quick delete link button */
                          (() => {
                            const parent = getParentWord(item.word);
                            return parent ? (
                              <div className="inline-flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800/80 px-2 py-1 rounded-lg">
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300 capitalize">
                                  {parent}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteParentLink(item.word)}
                                  className="text-zinc-400 hover:text-red-500 transition-colors p-0.5 rounded cursor-pointer flex items-center justify-center"
                                  title="Удалить связь с родителем"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-zinc-400 italic">—</span>
                            );
                          })()
                        )}
                      </td>
                      
                      {/* Translation text */}
                      <td className="p-3 max-w-xs font-medium">
                        {editingWord === item.word ? (
                          <input
                            type="text"
                            value={editTranslationValue}
                            onChange={(e) => setEditTranslationValue(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs font-medium text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        ) : (
                          <span className="truncate block max-w-xs" title={item.translation}>{item.translation}</span>
                        )}
                      </td>

                      {/* Grammar / IPA */}
                      <td className="p-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {editingWord === item.word ? (
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              value={editGrammarValue}
                              onChange={(e) => setEditGrammarValue(e.target.value)}
                              placeholder="часть речи"
                              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs font-medium text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                            <span className="font-mono text-[9px] text-zinc-400 self-start">
                              {item.ipa || "/.../"}
                            </span>
                          </div>
                        ) : (
                          <>
                            <span className="font-mono bg-zinc-100 dark:bg-zinc-800 text-[10px] px-1.5 py-0.5 rounded mr-1.5">
                              {item.ipa || "/.../"}
                            </span>
                            <span className="italic block mt-0.5 sm:inline sm:mt-0 font-medium">
                              {item.grammar || "часть речи"}
                            </span>
                          </>
                        )}
                      </td>

                      {/* Date added */}
                      <td className="p-3 text-center text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                        {editingWordDate === item.word ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="date"
                              defaultValue={item.createdAt && !isNaN(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toISOString().split('T')[0] : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) {
                                  const timestamp = new Date(val).getTime();
                                  if (!isNaN(timestamp)) {
                                    const updated = {
                                      ...item,
                                      createdAt: timestamp
                                    };
                                    onSaveVocab?.(updated, selectedStatsLang);
                                  }
                                }
                              }}
                              onBlur={() => setEditingWordDate(null)}
                              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-1.5 py-1 text-xs font-mono text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => setEditingWordDate(null)}
                              className="p-1 text-emerald-600 hover:text-emerald-500 rounded bg-emerald-50 dark:bg-emerald-950/20"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => setEditingWordDate(item.word)}
                            className="inline-flex items-center justify-center gap-1 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-400 px-2 py-1 rounded-lg transition-all active:scale-95 cursor-pointer group"
                            title="Изменить дату сохранения для статистики"
                          >
                            <span>
                              {item.createdAt && !isNaN(new Date(item.createdAt).getTime())
                                ? new Date(item.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) 
                                : "—"}
                            </span>
                            <Calendar className="w-3 h-3 text-zinc-400 group-hover:text-teal-500 transition-colors" />
                          </div>
                        )}
                      </td>

                      {/* Status selectors */}
                      <td className="p-3 text-center">
                        <select
                          value={item.status}
                          onChange={(e) => onUpdateStatus(item.word, e.target.value as WordStatus, selectedStatsLang)}
                          className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg border focus:outline-none ${
                            isSavesKnown
                              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200"
                              : "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200"
                          }`}
                        >
                          <option value="1">1 (Новое)</option>
                          <option value="2">2 (Трудное)</option>
                          <option value="3">3 (Помню)</option>
                          <option value="4">4 (Почти знаю)</option>
                          <option value="5">5 (Хорошо)</option>
                          <option value="known">✓ Знаю полностью</option>
                          <option value="ignored">Игнорировать</option>
                        </select>
                      </td>

                      {/* Delete / Edit Actions */}
                      <td className="p-3 text-center">
                        {editingWord === item.word ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEditedWord(item)}
                              className="p-1 px-1.5 text-white bg-emerald-500 hover:bg-emerald-400 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                              title="Сохранить изменения"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold">ОК</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingWord(null)}
                              className="p-1 px-1.5 text-zinc-500 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 rounded-lg transition-transform active:scale-95 cursor-pointer flex items-center justify-center"
                              title="Отменить редактирование"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditingWord(item)}
                              className="p-1.5 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-zinc-400 hover:text-teal-500 rounded-lg transition-colors cursor-pointer"
                              title="Редактировать слово"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteVocab(item.word, selectedStatsLang)}
                              className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-zinc-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                              title="Удалить слово из словаря"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination and Rows Selection Controls */}
          {processedVocabularyList.length > 25 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl animate-in fade-in duration-150">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  Показывать по:
                </span>
                <div className="relative">
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="cursor-pointer bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-lg px-2.5 py-1.5 pr-8 text-xs font-black select-none focus:outline-none focus:ring-1 focus:ring-teal-500 appearance-none shadow-4xs"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="250">250</option>
                    <option value="500">500</option>
                  </select>
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-zinc-400">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium font-sans">
                  | Показано {Math.min(processedVocabularyList.length, (safeCurrentPage - 1) * itemsPerPage + 1)} - {Math.min(safeCurrentPage * itemsPerPage, processedVocabularyList.length)} из {processedVocabularyList.length}
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto max-w-full py-1 select-none">
                  {/* Prev Button */}
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage(safeCurrentPage - 1)}
                    className="cursor-pointer px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:pointer-events-none text-xs font-black transition-all shadow-4xs"
                  >
                    Назад
                  </button>

                  {/* Page Numbers */}
                  {pageNumbers.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCurrentPage(p)}
                      className={`cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black transition-all ${
                        safeCurrentPage === p
                          ? "bg-teal-600 border border-teal-600 text-white shadow-xs"
                          : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {p}
                    </button>
                  ))}

                  {/* Next Button */}
                  <button
                    type="button"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage(safeCurrentPage + 1)}
                    className="cursor-pointer px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 disabled:pointer-events-none text-xs font-black transition-all shadow-4xs"
                  >
                    Вперед
                  </button>
                </div>
              )}
            </div>
          )}
          </>
        ) : (
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center rounded-xl space-y-2">
            <FileText className="w-8 h-8 text-zinc-300 mx-auto" aria-hidden="true" />
            <h5 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">
              Словарь пуст
            </h5>
            <p className="text-[11px] text-zinc-500 leading-normal max-w-sm mx-auto">
              {vocabSearch 
                ? `Не удалось найти слова по запросу "${vocabSearch}". Попробуйте изменить ключевые слова поиска.`
                : "Открывайте уроки чтения, нажимайте на незнакомые слова, сохраняйте их в словарь, и вы начнете видеть их статистику здесь!"}
            </p>
          </div>
        )}

      </div>

      {/* Custom Confirm Dialog Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 select-none">
            <h3 className="text-base font-black text-red-600 dark:text-red-400 tracking-tight flex items-center gap-2 mb-2 font-sans">
              <span>⚠️</span> {confirmDialog.title}
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans mb-4 font-medium">
              {confirmDialog.message}
            </p>
            {confirmDialog.warning && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900/30 rounded-xl text-xs text-red-650 dark:text-red-400 leading-normal mb-5 font-bold font-sans">
                {confirmDialog.warning}
              </div>
            )}
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="cursor-pointer bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="cursor-pointer bg-red-650 hover:bg-red-700 active:scale-98 text-white px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
