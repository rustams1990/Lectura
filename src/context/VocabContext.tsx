import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { VocabItem, WordStatus } from "../types";
import { normalizeVocabRecord, normalizeWordLinksRecord } from "../utils";
import { vocabStore } from "../db";
/**
 * In-memory registry of locally mutated words with timestamps.
 * Prevents stale server fetch / full sync from reverting recent optimistic changes.
 */
export const localWordMutations = new Map<string, number>();

export function markWordLocallyMutated(wordKey: string) {
  localWordMutations.set(wordKey.toLowerCase(), Date.now());
}

/**
 * Merges incoming cloud vocabulary with local in-memory vocabulary.
 * Guarantees that any word mutated locally within the last 60 seconds (or with a newer local updatedAt)
 * will NEVER be overwritten by stale server data.
 */
export function mergeCloudVocabWithLocal(
  cloudVocab: Record<string, VocabItem>,
  localVocab: Record<string, VocabItem>
): Record<string, VocabItem> {
  if (!cloudVocab || typeof cloudVocab !== "object") return localVocab || {};
  if (!localVocab || typeof localVocab !== "object") return cloudVocab || {};

  const merged: Record<string, VocabItem> = { ...cloudVocab };
  const now = Date.now();

  for (const [key, localItem] of Object.entries(localVocab)) {
    if (!localItem) continue;
    const lowerKey = key.toLowerCase();
    const localTime = localItem.updatedAt || localWordMutations.get(lowerKey) || 0;
    const cloudItem = cloudVocab[key];
    const cloudTime = cloudItem?.updatedAt || 0;

    // If local word was mutated within 60s OR local timestamp is newer, preserve local
    if (localTime > 0 && (localTime > cloudTime || (now - localTime < 60000))) {
      merged[key] = localItem;
    }
  }

  return merged;
}

interface VocabContextType {
  vocab: Record<string, VocabItem>;
  setVocab: React.Dispatch<React.SetStateAction<Record<string, VocabItem>>>;
  wordLinks: Record<string, string>;
  setWordLinks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedWord: string | null;
  setSelectedWord: (word: string | null) => void;
  contextSentence: string;
  setContextSentence: (sentence: string) => void;
  selectedElement: HTMLElement | null;
  setSelectedElement: (el: HTMLElement | null) => void;
  selectedWordRect: DOMRect | null;
  setSelectedWordRect: (rect: DOMRect | null) => void;
  getLinkedWordsFor: (word: string, lang?: string) => string[];
  handleUpdateStatusDirect: (word: string, newStatus: WordStatus, lang?: string) => void;
  handleDeleteMultipleVocabItems: (words: string[], lang?: string) => void;
  handleWordClick: (word: string, context: string, target?: HTMLElement | DOMRect | null) => void;
  isWordModalOpen: boolean;
  openWordModal: (word: string, context: string, target?: HTMLElement | DOMRect | null) => void;
  closeWordModal: () => void;
}

const VocabContext = createContext<VocabContextType | undefined>(undefined);

export function VocabProvider({ children }: { children: ReactNode }) {
  const [vocab, setVocab] = useState<Record<string, VocabItem>>(() => {
    try {
      const localWordsStr = localStorage.getItem("vocab_clone_words");
      if (localWordsStr) return normalizeVocabRecord(JSON.parse(localWordsStr));
    } catch (_) {}
    return {};
  });
  const [wordLinks, setWordLinks] = useState<Record<string, string>>(() => {
    try {
      const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
      if (localAliasesStr) return normalizeWordLinksRecord(JSON.parse(localAliasesStr));
    } catch (_) {}
    return {};
  });
  const [isLoaded, setIsLoaded] = useState(false);

  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [contextSentence, setContextSentence] = useState<string>("");
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [selectedWordRect, setSelectedWordRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    async function loadVocabAndLinks() {
      try {
        const [savedVocab, savedLinks] = await Promise.all([
          vocabStore.getItem('words').catch(() => null),
          vocabStore.getItem('aliases').catch(() => null),
        ]);

        let finalVocab: Record<string, VocabItem> | null = null;
        let finalLinks: Record<string, string> | null = null;

        if (savedVocab) {
          finalVocab = normalizeVocabRecord(savedVocab);
        } else {
          const localWordsStr = localStorage.getItem("vocab_clone_words");
          if (localWordsStr) {
            try { finalVocab = normalizeVocabRecord(JSON.parse(localWordsStr)); } catch (_) {}
          }
        }

        if (savedLinks) {
          finalLinks = normalizeWordLinksRecord(savedLinks as Record<string, string>);
        } else {
          const localAliasesStr = localStorage.getItem("vocab_clone_aliases");
          if (localAliasesStr) {
            try { finalLinks = normalizeWordLinksRecord(JSON.parse(localAliasesStr)); } catch (_) {}
          }
        }

        // Publish both simultaneously to prevent intermediate recalculations
        if (finalVocab) setVocab(finalVocab);
        if (finalLinks) setWordLinks(finalLinks);
      } catch (e) {
        console.error("Failed to load vocab from storage", e);
      } finally {
        setIsLoaded(true);
      }
    }
    loadVocabAndLinks();

    const handleLogout = () => {
      setVocab({});
      setWordLinks({});
      setSelectedWord(null);
      setContextSentence("");
    };

    window.addEventListener("lectura:user_logout", handleLogout);
    return () => {
      window.removeEventListener("lectura:user_logout", handleLogout);
    };
  }, []);

  // Auto-save vocab changes to IndexedDB safely
  useEffect(() => {
    if (isLoaded) {
      vocabStore.setItem('words', vocab).catch(console.error);
    }
  }, [vocab, isLoaded]);

  // Auto-save wordLinks changes to IndexedDB safely
  useEffect(() => {
    if (isLoaded) {
      vocabStore.setItem('aliases', wordLinks).catch(console.error);
    }
  }, [wordLinks, isLoaded]);

  const getLinkedWordsFor = (word: string, lang = "spanish", customLinks?: Record<string, string>): string[] => {
    if (!word) return [];
    const cleanInputWord = word.toLowerCase().trim().replace(/^[a-zA-Z]+_/, "");
    const activeLang = lang.toLowerCase();
    const result = new Set<string>([cleanInputWord]);
    const linksMap = customLinks || wordLinks;

    const prefix = `${activeLang}_`;
    const targetKey = `${prefix}${cleanInputWord}`;

    // Forward chain search
    let currentKey = targetKey;
    let guard = 0;
    while (linksMap[currentKey] && guard < 10) {
      const nextPrefixedWord = linksMap[currentKey];
      const cleanNext = nextPrefixedWord.replace(/^[a-zA-Z]+_/, "").toLowerCase();
      result.add(cleanNext);
      currentKey = nextPrefixedWord;
      guard++;
    }

    // Backward chain search
    Object.entries(linksMap).forEach(([fromKey, toKey]) => {
      const cleanFrom = fromKey.replace(/^[a-zA-Z]+_/, "").toLowerCase();
      const cleanTo = String(toKey || "").replace(/^[a-zA-Z]+_/, "").toLowerCase();
      if (result.has(cleanTo)) {
        result.add(cleanFrom);
      }
    });

    return Array.from(result);
  };

  const handleUpdateStatusDirect = (word: string, newStatus: WordStatus, lang = "spanish") => {
    const activeLang = lang.toLowerCase();
    const cleanWord = word.toLowerCase().replace(/^[a-zA-Z]+_/, "");
    const linkedWords = getLinkedWordsFor(cleanWord, activeLang);
    const now = Date.now();

    setVocab((prev) => {
      const nextVocab = { ...prev };
      const keysToDelete: string[] = [];

      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`.toLowerCase();
        markWordLocallyMutated(targetLangKey);
        markWordLocallyMutated(linkedWord);

        const existing = prev[targetLangKey] || prev[`english_${linkedWord}`] || prev[`spanish_${linkedWord}`] || prev[`french_${linkedWord}`] || prev[`german_${linkedWord}`] || prev[linkedWord];

        const isPlaceholder = (s?: string) => !s || s.trim() === "" || s === "Pending translation" || (s.trim().startsWith("[") && s.trim().endsWith("]"));
        const existingTrans = existing && !isPlaceholder(existing.translation) ? existing.translation : undefined;

        const updated: VocabItem = {
          word: linkedWord,
          status: newStatus,
          translation: existingTrans || (newStatus === "ignored" ? "[Ignored]" : newStatus === "known" ? "[Known]" : ""),
          definition: existing?.definition,
          ipa: existing ? existing.ipa : "",
          grammar: existing ? existing.grammar : "",
          contextRelation: existing ? existing.contextRelation : "",
          examples: existing ? existing.examples : [],
          createdAt: existing ? (existing.createdAt || now) : now,
          updatedAt: now,
          tags: existing ? existing.tags : [],
          imageUrl: existing ? (existing.imageUrl || null) : null,
          spellingCorrectCount: existing ? (existing.spellingCorrectCount || 0) : 0,
          spellingIncorrectCount: existing ? (existing.spellingIncorrectCount || 0) : 0,
          spellingAccentCount: existing ? (existing.spellingAccentCount || 0) : 0,
          lastSpelledCorrectly: existing ? existing.lastSpelledCorrectly : null,
          lastSpelledWithAccentError: existing ? existing.lastSpelledWithAccentError : null,
          spellingExclude: existing ? existing.spellingExclude : false,
        };

        Object.keys(nextVocab).forEach((k) => {
          const kLower = k.trim().toLowerCase();
          if (kLower === linkedWord.toLowerCase() && k !== targetLangKey) {
            keysToDelete.push(k);
            delete nextVocab[k];
          }
        });

        nextVocab[targetLangKey] = updated;
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lectura:vocab_updated", { detail: nextVocab }));
      }

      return nextVocab;
    });
  };

  const handleDeleteMultipleVocabItems = (words: string[], lang = "spanish") => {
    if (!words || words.length === 0) return;
    const activeLang = lang.toLowerCase();
    const now = Date.now();

    setVocab((prev) => {
      const copy = { ...prev };
      const allKeysToDrop = new Set<string>();

      const keyLookup = new Map<string, string[]>();
      Object.keys(copy).forEach((k) => {
        const kLower = k.trim().toLowerCase();
        if (!keyLookup.has(kLower)) {
          keyLookup.set(kLower, []);
        }
        keyLookup.get(kLower)!.push(k);
      });

      words.forEach((word) => {
        if (!word || !word.trim()) return;
        const cleanWord = word.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
        if (!cleanWord) return;

        const targetLangKey = `${activeLang}_${cleanWord}`.toLowerCase();
        markWordLocallyMutated(targetLangKey);
        markWordLocallyMutated(cleanWord);

        allKeysToDrop.add(targetLangKey);
        allKeysToDrop.add(cleanWord);

        const targetLangKeyLower = targetLangKey.toLowerCase();
        const cleanWordLower = cleanWord.toLowerCase();

        const matchingKeys1 = keyLookup.get(targetLangKeyLower) || [];
        const matchingKeys2 = keyLookup.get(cleanWordLower) || [];

        matchingKeys1.forEach((k) => allKeysToDrop.add(k));
        matchingKeys2.forEach((k) => allKeysToDrop.add(k));
      });

      const cleanKeys = Array.from(allKeysToDrop).filter((k) => k && k.trim() !== "");
      cleanKeys.forEach((k) => {
        delete copy[k];
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lectura:vocab_updated", { detail: copy }));
      }

      return copy;
    });
  };

  const handleMassImportIgnoredWords = (words: string[], lang = "spanish"): number => {
    if (!words || words.length === 0) return 0;
    const activeLang = lang.toLowerCase();
    let importedCount = 0;
    const now = Date.now();

    setVocab((prev) => {
      const nextVocab = { ...prev };

      words.forEach((rawWord) => {
        if (!rawWord || !rawWord.trim()) return;
        const cleanWord = rawWord.trim().toLowerCase().replace(/^[a-zA-Z]+_/, "");
        if (!cleanWord) return;

        const targetLangKey = `${activeLang}_${cleanWord}`.toLowerCase();
        markWordLocallyMutated(targetLangKey);
        markWordLocallyMutated(cleanWord);
        const existing = nextVocab[targetLangKey];

        // Only add or update to ignored
        nextVocab[targetLangKey] = {
          word: cleanWord,
          status: "ignored",
          translation: existing?.translation && existing.translation !== "Pending translation" ? existing.translation : "[Ignored]",
          definition: existing?.definition,
          ipa: existing?.ipa || "",
          grammar: existing?.grammar || "",
          contextRelation: existing?.contextRelation || "",
          examples: existing?.examples || [],
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          tags: Array.from(new Set([...(existing?.tags || []), "imported-ignored"])),
          imageUrl: existing?.imageUrl || null,
          spellingCorrectCount: existing?.spellingCorrectCount || 0,
          spellingIncorrectCount: existing?.spellingIncorrectCount || 0,
          spellingAccentCount: existing?.spellingAccentCount || 0,
          lastSpelledCorrectly: existing?.lastSpelledCorrectly || null,
          lastSpelledWithAccentError: existing?.lastSpelledWithAccentError || null,
          spellingExclude: existing?.spellingExclude ?? false,
        };
        importedCount++;
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lectura:vocab_updated", { detail: nextVocab }));
      }

      return nextVocab;
    });

    return importedCount;
  };

  const wordClickDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWordClick = (word: string, context: string, target?: HTMLElement | DOMRect | null) => {
    // Ghost click shield: drop any synthetic clicks that arrive within 450ms of closing a modal
    const lastClosedAt = typeof window !== "undefined" ? (window as any).__lecturaLastModalClosedAt || 0 : 0;
    if (Date.now() - lastClosedAt < 450) {
      return;
    }

    if (wordClickDebounceRef.current) {
      clearTimeout(wordClickDebounceRef.current);
    }
    const normalizedWord = word.replace(/\s+/g, " ").trim();
    const normalizedContext = context.replace(/\s+/g, " ").trim();

    let element: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    if (target) {
      if ("getBoundingClientRect" in target) {
        element = target as HTMLElement;
        rect = target.getBoundingClientRect();
      } else {
        rect = target as DOMRect;
      }
    }

    wordClickDebounceRef.current = setTimeout(() => {
      setSelectedWord(normalizedWord);
      setContextSentence(normalizedContext);
      setSelectedElement(element);
      setSelectedWordRect(rect);
    }, 120);
  };

  const isWordModalOpen = Boolean(selectedWord);
  const openWordModal = (word: string, context: string, target?: HTMLElement | DOMRect | null) => {
    handleWordClick(word, context, target);
  };
  const closeWordModal = () => {
    if (typeof window !== "undefined") {
      (window as any).__lecturaLastModalClosedAt = Date.now();
    }
    setSelectedWord(null);
    setSelectedElement(null);
    setSelectedWordRect(null);
  };

  return (
    <VocabContext.Provider
      value={{
        vocab,
        setVocab,
        wordLinks,
        setWordLinks,
        selectedWord,
        setSelectedWord,
        contextSentence,
        setContextSentence,
        selectedElement,
        setSelectedElement,
        selectedWordRect,
        setSelectedWordRect,
        getLinkedWordsFor,
        handleUpdateStatusDirect,
        handleDeleteMultipleVocabItems,
        handleMassImportIgnoredWords,
        handleWordClick,
        isWordModalOpen,
        openWordModal,
        closeWordModal,
      }}
    >
      {children}
    </VocabContext.Provider>
  );
}

export function useVocab() {
  const context = useContext(VocabContext);
  if (!context) {
    throw new Error("useVocab must be used within a VocabProvider");
  }
  return context;
}
