import natural from "natural";
import path from "path";
import fs from "fs";

let wordnetInstance: any = null;

function getWordNetInstance() {
  if (!wordnetInstance) {
    try {
      // Initialize with default or bundled dict
      wordnetInstance = new (natural as any).WordNet();
    } catch (err) {
      console.error("[WordNet] Failed to initialize WordNet instance:", err);
    }
  }
  return wordnetInstance;
}

export interface WordNetSynsetResult {
  synsetOffset: number;
  pos: string; // 'n', 'v', 'a' (adj), 'r' (adv), 's' (satellite adj)
  posName: "noun" | "verb" | "adjective" | "adverb" | "other";
  definition: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  hypernyms: Array<{
    name: string;
    definition?: string;
  }>;
  derivations: string[];
}

export interface WordNetLookupResponse {
  query: string;
  found: boolean;
  synsetsCount: number;
  synsets: WordNetSynsetResult[];
  allSynonyms: string[];
  allAntonyms: string[];
}

const POS_MAP: Record<string, "noun" | "verb" | "adjective" | "adverb" | "other"> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
};

/**
 * Normalizes input word by stripping punctuation, trimming and lowercasing
 */
export function normalizeQueryWord(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"?]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

/**
 * Lookup raw synsets from Natural WordNet wrapper
 */
function lookupRaw(wn: any, word: string): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      wn.lookup(word, (results: any[]) => {
        resolve(Array.isArray(results) ? results : []);
      });
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * Get full synset object by offset and pos
 */
function getSynsetRaw(wn: any, offset: number, pos: string): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      wn.get(offset, pos, (result: any) => {
        resolve(result || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Perform comprehensive semantic lookup for a word
 */
export async function lookupWordNet(rawWord: string): Promise<WordNetLookupResponse> {
  const word = normalizeQueryWord(rawWord);
  if (!word) {
    return {
      query: rawWord,
      found: false,
      synsetsCount: 0,
      synsets: [],
      allSynonyms: [],
      allAntonyms: [],
    };
  }

  const wn = getWordNetInstance();
  if (!wn) {
    return {
      query: word,
      found: false,
      synsetsCount: 0,
      synsets: [],
      allSynonyms: [],
      allAntonyms: [],
    };
  }

  // 1. Primary lookup
  let rawResults = await lookupRaw(wn, word);

  // 2. If no direct match, try singular / base morphological variations
  if (rawResults.length === 0) {
    const candidates: string[] = [];
    if (word.endsWith("ies") && word.length > 4) candidates.push(word.slice(0, -3) + "y");
    if (word.endsWith("es") && word.length > 3) candidates.push(word.slice(0, -2));
    if (word.endsWith("s") && word.length > 2) candidates.push(word.slice(0, -1));
    if (word.endsWith("ed") && word.length > 3) {
      candidates.push(word.slice(0, -2));
      candidates.push(word.slice(0, -1)); // e.g. liked -> like
    }
    if (word.endsWith("ing") && word.length > 4) {
      candidates.push(word.slice(0, -3));
      candidates.push(word.slice(0, -3) + "e"); // e.g. making -> make
    }

    for (const cand of candidates) {
      const candResults = await lookupRaw(wn, cand);
      if (candResults.length > 0) {
        rawResults = candResults;
        break;
      }
    }
  }

  if (rawResults.length === 0) {
    return {
      query: word,
      found: false,
      synsetsCount: 0,
      synsets: [],
      allSynonyms: [],
      allAntonyms: [],
    };
  }

  const allSynonymsSet = new Set<string>();
  const allAntonymsSet = new Set<string>();
  const synsets: WordNetSynsetResult[] = [];

  for (const item of rawResults) {
    const posName = POS_MAP[item.pos] || "other";
    const cleanSynonyms = (item.synonyms || [])
      .map((s: string) => s.replace(/_/g, " "))
      .filter((s: string) => s.toLowerCase() !== word.replace(/_/g, " "));

    cleanSynonyms.forEach((s: string) => allSynonymsSet.add(s));

    // Resolve pointers (antonyms '!', hypernyms '@', derivations '+')
    const antonymsList: string[] = [];
    const hypernymsList: Array<{ name: string; definition?: string }> = [];
    const derivationsList: string[] = [];

    const ptrs = Array.isArray(item.ptrs) ? item.ptrs : [];

    // Limit resolving pointers to avoid slow nested loops
    for (const ptr of ptrs.slice(0, 10)) {
      if (ptr.pointerSymbol === "!" && ptr.synsetOffset) {
        // Antonym
        const target = await getSynsetRaw(wn, ptr.synsetOffset, ptr.pos);
        if (target && target.synonyms) {
          target.synonyms.forEach((ant: string) => {
            const clean = ant.replace(/_/g, " ");
            antonymsList.push(clean);
            allAntonymsSet.add(clean);
          });
        }
      } else if (ptr.pointerSymbol === "@" && ptr.synsetOffset && hypernymsList.length < 3) {
        // Hypernym ("Is a type of...")
        const target = await getSynsetRaw(wn, ptr.synsetOffset, ptr.pos);
        if (target && target.synonyms && target.synonyms.length > 0) {
          const primaryName = target.synonyms[0].replace(/_/g, " ");
          hypernymsList.push({
            name: primaryName,
            definition: target.def,
          });
        }
      } else if (ptr.pointerSymbol === "+" && ptr.synsetOffset && derivationsList.length < 5) {
        // Derivationally related form
        const target = await getSynsetRaw(wn, ptr.synsetOffset, ptr.pos);
        if (target && target.synonyms) {
          target.synonyms.forEach((der: string) => {
            const clean = der.replace(/_/g, " ");
            if (!derivationsList.includes(clean) && clean.toLowerCase() !== word.replace(/_/g, " ")) {
              derivationsList.push(clean);
            }
          });
        }
      }
    }

    synsets.push({
      synsetOffset: item.synsetOffset,
      pos: item.pos,
      posName,
      definition: item.def || item.gloss || "",
      examples: Array.isArray(item.exp) ? item.exp : [],
      synonyms: cleanSynonyms,
      antonyms: Array.from(new Set(antonymsList)),
      hypernyms: hypernymsList,
      derivations: derivationsList,
    });
  }

  return {
    query: word.replace(/_/g, " "),
    found: true,
    synsetsCount: synsets.length,
    synsets,
    allSynonyms: Array.from(allSynonymsSet),
    allAntonyms: Array.from(allAntonymsSet),
  };
}
