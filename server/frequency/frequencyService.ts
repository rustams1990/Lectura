import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export interface FrequencyLookupResult {
  word: string;
  lang: string;
  found: boolean;
  rank?: number;
  frequency?: number;
  cefr: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "rare";
  percentile?: number;
  totalWords: number;
}

export interface TextComplexityResult {
  totalWords: number;
  uniqueWords: number;
  coverage: {
    a1_a2: number; // percentage (e.g. 75.4)
    b1_b2: number; // percentage (e.g. 18.2)
    c1_c2: number; // percentage (e.g. 4.1)
    rare: number;  // percentage (e.g. 2.3)
  };
  cefrOverall: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  stats: {
    a1: number;
    a2: number;
    b1: number;
    b2: number;
    c1: number;
    c2: number;
    rare: number;
  };
  rarestWords: Array<{ word: string; rank?: number; cefr: string }>;
}

let freqDbInstance: Database.Database | null = null;

export const SUPPORTED_FREQUENCY_LANGS = new Set(["en", "es", "de", "fr", "it", "pt", "kk", "ru", "uk", "pl", "cs"]);

export function normalizeLangCode(rawLang: string): string | null {
  if (!rawLang) return null;
  const l = rawLang.toLowerCase().trim();
  if (l.startsWith("en") || l.includes("engl") || l.includes("английск")) return "en";
  if (l.startsWith("es") || l.includes("span") || l.includes("испанск")) return "es";
  if (l.startsWith("de") || l.includes("ger") || l.includes("deutsch") || l.includes("немецк")) return "de";
  if (l.startsWith("fr") || l.includes("fren") || l.includes("franc") || l.includes("француз")) return "fr";
  if (l.startsWith("it") || l.includes("ital") || l.includes("итальян")) return "it";
  if (l.startsWith("pt") || l.includes("port") || l.includes("португал")) return "pt";
  if (l.startsWith("kk") || l.startsWith("kz") || l.includes("kaz") || l.includes("қазақ") || l.includes("казах")) return "kk";
  if (l.startsWith("ru") || l.includes("russ") || l.includes("русск")) return "ru";
  if (l.startsWith("uk") || l.startsWith("ua") || l.includes("ukr") || l.includes("украин") || l.includes("україн")) return "uk";
  if (l.startsWith("pl") || l.includes("pol") || l.includes("польск") || l.includes("polski")) return "pl";
  if (l.startsWith("cs") || l.startsWith("cz") || l.includes("cze") || l.includes("чешск") || l.includes("češ")) return "cs";
  return null;
}

// Common Kazakh agglutinative suffixes for intelligent root matching
const KAZAKH_SUFFIXES = [
  // Plural + Case combinations
  "ларымызбен", "лерімізбен", "дарымызбен", "дерімізбен", "тарымызбен", "терімізбен",
  "ларының", "лерінің", "дарының", "дерінің", "тарының", "терінің",
  "ларынан", "лерінен", "дарынан", "дерінен", "тарынан", "терінен",
  "ларында", "лерінде", "дарында", "дерінде", "тарында", "терінде",
  "ларына", "леріне", "дарына", "деріне", "тарына", "теріне",
  "лардың", "лердің", "дардың", "дердің", "тардың", "тердің",
  "лардан", "лерден", "дардан", "дерден", "тардан", "терден",
  "ларда", "лерде", "дарда", "дерде", "тарда", "терде",
  "ларға", "лерге", "дарға", "дерге", "тарға", "терге",
  "ларды", "лерді", "дарды", "дерді", "тарды", "терді",
  // Plural endings
  "лар", "лер", "дар", "дер", "тар", "тер",
  // Case endings
  "ның", "нің", "дың", "дің", "тың", "тің",
  "дан", "ден", "тан", "тен", "нан", "нен",
  "мен", "бен", "пен",
  "нда", "нде", "да", "де", "та", "те",
  "ға", "ге", "қа", "ке", "на", "не",
  "ны", "ні", "ды", "ді", "ты", "ті",
  // Possessive endings
  "ымыз", "іміз", "мыз", "міз",
  "ыңыз", "іңіз", "ңыз", "ңіз",
  "ың", "ің", "ым", "ім", "сы", "сі", "ы", "і"
];

export function stripKazakhSuffix(word: string): string[] {
  const candidates: string[] = [];
  for (const suf of KAZAKH_SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      candidates.push(word.slice(0, -suf.length));
    }
  }
  return candidates;
}

function getFrequencyDb(): Database.Database {
  if (freqDbInstance) return freqDbInstance;

  const dbDir = path.join(process.cwd(), "server", "frequency");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "frequency.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS word_frequencies (
      lang TEXT NOT NULL,
      word TEXT NOT NULL,
      rank INTEGER NOT NULL,
      frequency INTEGER NOT NULL,
      cefr TEXT NOT NULL,
      PRIMARY KEY (lang, word)
    );
    CREATE INDEX IF NOT EXISTS idx_freq_lookup ON word_frequencies(lang, word);
  `);

  const langConfigs = [
    { code: "en", file: "en_50k.txt" },
    { code: "es", file: "es_50k.txt" },
    { code: "de", file: "de_50k.txt" },
    { code: "fr", file: "fr_50k.txt" },
    { code: "it", file: "it_50k.txt" },
    { code: "pt", file: "pt_50k.txt" },
    { code: "kk", file: "kk_50k.txt" },
    { code: "ru", file: "ru_50k.txt" },
    { code: "uk", file: "uk_50k.txt" },
    { code: "pl", file: "pl_50k.txt" },
    { code: "cs", file: "cs_50k.txt" },
  ];

  for (const cfg of langConfigs) {
    const row = db.prepare("SELECT COUNT(*) as c FROM word_frequencies WHERE lang = ?").get(cfg.code) as any;
    if (!row || row.c < 500) {
      populateLanguageFrequencies(db, cfg.code, cfg.file);
    }
  }

  freqDbInstance = db;
  return db;
}

function calculateCefr(rank: number): "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "rare" {
  if (rank <= 1000) return "A1";
  if (rank <= 2500) return "A2";
  if (rank <= 5000) return "B1";
  if (rank <= 9000) return "B2";
  if (rank <= 16000) return "C1";
  if (rank <= 30000) return "C2";
  return "rare";
}

function populateLanguageFrequencies(db: Database.Database, lang: string, filename: string) {
  const txtPath = path.join(process.cwd(), "server", "frequency", filename);
  if (!fs.existsSync(txtPath)) {
    console.warn(`${filename} not found, skipping frequency DB population for ${lang}`);
    return;
  }

  console.log(`Populating ${lang.toUpperCase()} frequency database into SQLite...`);
  const content = fs.readFileSync(txtPath, "utf-8");
  const lines = content.split("\n");

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO word_frequencies (lang, word, rank, frequency, cefr)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: Array<[string, string, number, number, string]>) => {
    for (const r of rows) {
      insertStmt.run(r[0], r[1], r[2], r[3], r[4]);
    }
  });

  const batch: Array<[string, string, number, number, string]> = [];
  let rank = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const word = parts[0].toLowerCase().trim();
      const freq = parseInt(parts[1], 10) || 0;
      if (word && !word.startsWith("'") && word.length > 0) {
        const cefr = calculateCefr(rank);
        batch.push([lang, word, rank, freq, cefr]);
        rank++;
      }
    }
  }

  if (batch.length > 0) {
    insertMany(batch);
    console.log(`Successfully indexed ${batch.length} ${lang.toUpperCase()} frequency words into SQLite!`);
  }
}

/**
 * Fast single word frequency lookup (returns null if language is unsupported)
 */
export function lookupWordFrequency(word: string, rawLang: string = "en"): FrequencyLookupResult | null {
  const lang = normalizeLangCode(rawLang);
  if (!lang) {
    return null; // Don't return false data for languages without frequency DB
  }

  // Normalize typographic quotes and apostrophes (c’est -> c'est)
  const cleanWord = word.trim().toLowerCase().replace(/[’‘`]/g, "'");
  const db = getFrequencyDb();

  const stmt = db.prepare(
    "SELECT rank, frequency, cefr FROM word_frequencies WHERE lang = ? AND word = ?"
  );

  // 1. Try exact match first
  let row = stmt.get(lang, cleanWord) as any;

  // 2. Contraction / Elision fallback for French, Italian, English (e.g. c'est -> est, j'habite -> habite, l'amour -> amour)
  if (!row && cleanWord.includes("'")) {
    const parts = cleanWord.split("'");
    if (parts.length >= 2) {
      // E.g. "c'est" -> base "est", prefix "c'"
      const basePart = parts[parts.length - 1]; // "est"
      const prefixPart = parts[0] + "'";        // "c'"

      if (basePart) {
        row = stmt.get(lang, basePart) as any;
      }
      if (!row && prefixPart) {
        row = stmt.get(lang, prefixPart) as any;
      }
    }
  }

  // 3. Trailing punctuation / hyphen fallback (e.g. "peut-être" -> "peut")
  if (!row && cleanWord.includes("-")) {
    const parts = cleanWord.split("-");
    for (const p of parts) {
      if (p.length > 1) {
        const subRow = stmt.get(lang, p) as any;
        if (subRow && (!row || subRow.rank < row.rank)) {
          row = subRow;
        }
      }
    }
  }

  // 4. Agglutinative suffix strip fallback for Kazakh (kk)
  if (!row && lang === "kk") {
    const stemCandidates = stripKazakhSuffix(cleanWord);
    for (const stem of stemCandidates) {
      const stemRow = stmt.get("kk", stem) as any;
      if (stemRow && (!row || stemRow.rank < row.rank)) {
        row = stemRow;
      }
    }
  }

  // 5. Russian letter 'ё' -> 'е' normalization fallback (е.g. "ещё" / "еще")
  if (!row && lang === "ru" && (cleanWord.includes("ё") || cleanWord.includes("е"))) {
    const altWord1 = cleanWord.replace(/ё/g, "е");
    const altWord2 = cleanWord.replace(/е/g, "ё");
    row = stmt.get("ru", altWord1) || stmt.get("ru", altWord2);
  }

  const totalWords = 50000;

  if (row) {
    const percentile = Math.max(0.01, Math.min(100, (row.rank / totalWords) * 100));
    return {
      word: cleanWord,
      lang,
      found: true,
      rank: row.rank,
      frequency: row.frequency,
      cefr: row.cefr as any,
      percentile: parseFloat(percentile.toFixed(1)),
      totalWords,
    };
  }

  return {
    word: cleanWord,
    lang,
    found: false,
    cefr: "rare",
    totalWords,
  };
}

/**
 * Batch lookup for multiple words
 */
export function lookupBatchWordFrequency(words: string[], lang: string = "en"): Record<string, FrequencyLookupResult> {
  const db = getFrequencyDb();
  const results: Record<string, FrequencyLookupResult> = {};
  const totalWords = 50000;

  if (!words || words.length === 0) return results;

  const placeholders = words.map(() => "?").join(",");
  const query = `
    SELECT word, rank, frequency, cefr 
    FROM word_frequencies 
    WHERE lang = ? AND word IN (${placeholders})
  `;

  const rows = db.prepare(query).all(lang, ...words.map(w => w.toLowerCase())) as any[];
  const foundMap = new Map<string, any>();
  for (const r of rows) {
    foundMap.set(r.word, r);
  }

  for (const w of words) {
    const lower = w.toLowerCase();
    const row = foundMap.get(lower);
    if (row) {
      results[lower] = {
        word: lower,
        lang,
        found: true,
        rank: row.rank,
        frequency: row.frequency,
        cefr: row.cefr as any,
        totalWords,
      };
    } else {
      results[lower] = {
        word: lower,
        lang,
        found: false,
        cefr: "rare",
        totalWords,
      };
    }
  }

  return results;
}

/**
 * Analyzes full text difficulty / CEFR distribution (returns null if language unsupported)
 */
export function analyzeTextComplexity(text: string, rawLang: string = "en"): TextComplexityResult | null {
  const lang = normalizeLangCode(rawLang);
  if (!lang) {
    return null; // Do not calculate false complexity for unsupported languages
  }

  if (!text || !text.trim()) {
    return {
      totalWords: 0,
      uniqueWords: 0,
      coverage: { a1_a2: 100, b1_b2: 0, c1_c2: 0, rare: 0 },
      cefrOverall: "A1",
      stats: { a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0, rare: 0 },
      rarestWords: [],
    };
  }

  // Extract sentences to detect words capitalized in the middle of sentences (proper nouns/names)
  const words = text.match(/[\p{L}'’]+/gu) || [];
  const properNouns = new Set<string>();

  // Detect proper nouns: word begins with uppercase but is not the first word of a sentence
  const rawWordsWithPos = text.split(/\s+/);
  for (let i = 1; i < rawWordsWithPos.length; i++) {
    const prev = rawWordsWithPos[i - 1];
    const curr = rawWordsWithPos[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    // If previous token doesn't end with sentence terminator (. ! ?) and current token starts with Uppercase
    if (curr.length > 1 && !/[.!?]$/.test(prev) && /^\p{Lu}\p{Ll}+$/u.test(curr)) {
      properNouns.add(curr.toLowerCase());
    }
  }

  const rawTokens: string[] = [];
  for (const w of words) {
    const clean = w.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (clean.length > 1 && !properNouns.has(clean)) {
      rawTokens.push(clean);
    }
  }

  const totalWords = rawTokens.length;
  if (totalWords === 0) {
    return {
      totalWords: 0,
      uniqueWords: 0,
      coverage: { a1_a2: 100, b1_b2: 0, c1_c2: 0, rare: 0 },
      cefrOverall: "A1",
      stats: { a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0, rare: 0 },
      rarestWords: [],
    };
  }

  const uniqueWordsSet = new Set(rawTokens);
  const uniqueWordsList = Array.from(uniqueWordsSet);

  const batchResults = lookupBatchWordFrequency(uniqueWordsList, lang);

  const stats = { a1: 0, a2: 0, b1: 0, b2: 0, c1: 0, c2: 0, rare: 0 };
  const rarestWordsMap = new Map<string, { word: string; rank?: number; cefr: string }>();

  for (const token of rawTokens) {
    const res = batchResults[token];
    if (res && res.found) {
      stats[res.cefr.toLowerCase() as keyof typeof stats]++;
      if (res.cefr === "C1" || res.cefr === "C2" || res.cefr === "rare") {
        if (!rarestWordsMap.has(token)) {
          rarestWordsMap.set(token, { word: token, rank: res.rank, cefr: res.cefr });
        }
      }
    } else {
      stats.rare++;
      if (!rarestWordsMap.has(token)) {
        rarestWordsMap.set(token, { word: token, cefr: "rare" });
      }
    }
  }

  const a1_a2_pct = parseFloat((((stats.a1 + stats.a2) / totalWords) * 100).toFixed(1));
  const b1_b2_pct = parseFloat((((stats.b1 + stats.b2) / totalWords) * 100).toFixed(1));
  const c1_c2_pct = parseFloat((((stats.c1 + stats.c2) / totalWords) * 100).toFixed(1));
  const rare_pct = parseFloat(((stats.rare / totalWords) * 100).toFixed(1));

  // Determine overall CEFR based on 95% comprehension threshold
  let cefrOverall: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" = "A1";
  if (a1_a2_pct >= 92) {
    cefrOverall = stats.a2 > stats.a1 ? "A2" : "A1";
  } else if (a1_a2_pct + b1_b2_pct >= 88) {
    cefrOverall = stats.b2 > stats.b1 ? "B2" : "B1";
  } else if (c1_c2_pct > 8 || rare_pct > 6) {
    cefrOverall = "C2";
  } else {
    cefrOverall = "C1";
  }

  const rarestWords = Array.from(rarestWordsMap.values())
    .sort((a, b) => (b.rank || 999999) - (a.rank || 999999))
    .slice(0, 10);

  return {
    totalWords,
    uniqueWords: uniqueWordsSet.size,
    coverage: {
      a1_a2: a1_a2_pct,
      b1_b2: b1_b2_pct,
      c1_c2: c1_c2_pct,
      rare: rare_pct,
    },
    cefrOverall,
    stats,
    rarestWords,
  };
}
