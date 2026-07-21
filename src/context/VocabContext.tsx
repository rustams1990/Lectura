import React, { createContext, useContext, useState, ReactNode } from "react";
import { VocabItem, WordStatus } from "../types";

interface VocabContextType {
  vocab: Record<string, VocabItem>;
  setVocab: React.Dispatch<React.SetStateAction<Record<string, VocabItem>>>;
  wordLinks: Record<string, string>;
  setWordLinks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedWord: string | null;
  setSelectedWord: (word: string | null) => void;
  contextSentence: string;
  setContextSentence: (sentence: string) => void;
  getLinkedWordsFor: (word: string, lang?: string) => string[];
  handleUpdateStatusDirect: (word: string, newStatus: WordStatus, lang?: string) => void;
  handleDeleteMultipleVocabItems: (words: string[], lang?: string) => void;
  handleWordClick: (word: string, context: string) => void;
}

const VocabContext = createContext<VocabContextType | undefined>(undefined);

export function VocabProvider({ children }: { children: ReactNode }) {
  const [vocab, setVocab] = useState<Record<string, VocabItem>>({});
  const [wordLinks, setWordLinks] = useState<Record<string, string>>({});
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [contextSentence, setContextSentence] = useState<string>("");

  const getLinkedWordsFor = (word: string, lang = "spanish"): string[] => {
    if (!word) return [];
    const cleanInputWord = word.toLowerCase().trim().replace(/^[a-zA-Z]+_/, "");
    const activeLang = lang.toLowerCase();
    const result = new Set<string>([cleanInputWord]);

    const prefix = `${activeLang}_`;
    const targetKey = `${prefix}${cleanInputWord}`;

    // Forward chain search
    let currentKey = targetKey;
    let guard = 0;
    while (wordLinks[currentKey] && guard < 10) {
      const nextPrefixedWord = wordLinks[currentKey];
      const cleanNext = nextPrefixedWord.replace(/^[a-zA-Z]+_/, "");
      result.add(cleanNext);
      currentKey = nextPrefixedWord;
      guard++;
    }

    // Backward chain search
    Object.entries(wordLinks).forEach(([fromKey, toKey]) => {
      const cleanFrom = fromKey.replace(/^[a-zA-Z]+_/, "");
      const cleanTo = String(toKey || "").replace(/^[a-zA-Z]+_/, "");
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

    setVocab((prev) => {
      const nextVocab = { ...prev };
      const keysToDelete: string[] = [];

      linkedWords.forEach((linkedWord) => {
        const targetLangKey = `${activeLang}_${linkedWord}`;
        const existing = prev[targetLangKey] || prev[linkedWord];

        const updated: VocabItem = {
          word: linkedWord,
          status: newStatus,
          translation: existing ? existing.translation : "[Known]",
          ipa: existing ? existing.ipa : "",
          grammar: existing ? existing.grammar : "",
          contextRelation: existing ? existing.contextRelation : "",
          examples: existing ? existing.examples : [],
          createdAt: existing ? (existing.createdAt || Date.now()) : Date.now(),
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

      return nextVocab;
    });
  };

  const handleDeleteMultipleVocabItems = (words: string[], lang = "spanish") => {
    if (!words || words.length === 0) return;
    const activeLang = lang.toLowerCase();

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

        const targetLangKey = `${activeLang}_${cleanWord}`;
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

      return copy;
    });
  };

  const handleWordClick = (word: string, context: string) => {
    setSelectedWord(word);
    setContextSentence(context);
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
        getLinkedWordsFor,
        handleUpdateStatusDirect,
        handleDeleteMultipleVocabItems,
        handleWordClick,
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
