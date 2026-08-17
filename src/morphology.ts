/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import nlp from "compromise";
import englishIrregularsJson from "./data/dictionaries/english_irregulars.json";
import spanishIrregularsJson from "./data/dictionaries/spanish_irregulars.json";
import spanishEncliticsJson from "./data/dictionaries/spanish_enclitics.json";
import spanishShortImperativesJson from "./data/dictionaries/spanish_short_imperatives.json";
import spanishFutureStemsJson from "./data/dictionaries/spanish_future_stems.json";
import spanishHighConfidenceEndingsJson from "./data/dictionaries/spanish_high_confidence_endings.json";
import spanishAccentedVerbsJson from "./data/dictionaries/spanish_accented_verbs.json";
import spanishVerbEndingsJson from "./data/dictionaries/spanish_verb_endings.json";
import spanishCommonVerbsJson from "./data/dictionaries/spanish_common_verbs.json";
import spanishHomonymsJson from "./data/dictionaries/spanish_homonyms.json";

import portugueseIrregularsJson from "./data/dictionaries/portuguese_irregulars.json";
import portugueseCommonVerbsJson from "./data/dictionaries/portuguese_common_verbs.json";
import frenchIrregularsJson from "./data/dictionaries/french_irregulars.json";
import frenchCommonVerbsJson from "./data/dictionaries/french_common_verbs.json";
import italianIrregularsJson from "./data/dictionaries/italian_irregulars.json";
import italianCommonVerbsJson from "./data/dictionaries/italian_common_verbs.json";
import germanIrregularsJson from "./data/dictionaries/german_irregulars.json";
import germanCommonVerbsJson from "./data/dictionaries/german_common_verbs.json";
import russianIrregularsJson from "./data/dictionaries/russian_irregulars.json";
import russianCommonVerbsJson from "./data/dictionaries/russian_common_verbs.json";
import ukrainianIrregularsJson from "./data/dictionaries/ukrainian_irregulars.json";
import ukrainianCommonVerbsJson from "./data/dictionaries/ukrainian_common_verbs.json";
import kazakhIrregularsJson from "./data/dictionaries/kazakh_irregulars.json";
import kazakhCommonVerbsJson from "./data/dictionaries/kazakh_common_verbs.json";
import kazakhCommonWordsJson from "./data/dictionaries/kazakh_common_words.json";
import polishIrregularsJson from "./data/dictionaries/polish_irregulars.json";
import polishCommonVerbsJson from "./data/dictionaries/polish_common_verbs.json";
import swedishIrregularsJson from "./data/dictionaries/swedish_irregulars.json";
import swedishCommonVerbsJson from "./data/dictionaries/swedish_common_verbs.json";
import dutchIrregularsJson from "./data/dictionaries/dutch_irregulars.json";
import dutchCommonVerbsJson from "./data/dictionaries/dutch_common_verbs.json";
import japaneseIrregularsJson from "./data/dictionaries/japanese_irregulars.json";
import japaneseCommonVerbsJson from "./data/dictionaries/japanese_common_verbs.json";
import chineseIrregularsJson from "./data/dictionaries/chinese_irregulars.json";
import chineseCommonWordsJson from "./data/dictionaries/chinese_common_words.json";
import arabicIrregularsJson from "./data/dictionaries/arabic_irregulars.json";
import arabicCommonWordsJson from "./data/dictionaries/arabic_common_words.json";
import koreanIrregularsJson from "./data/dictionaries/korean_irregulars.json";
import koreanCommonWordsJson from "./data/dictionaries/korean_common_words.json";
import turkishIrregularsJson from "./data/dictionaries/turkish_irregulars.json";
import turkishCommonVerbsJson from "./data/dictionaries/turkish_common_verbs.json";
import hindiIrregularsJson from "./data/dictionaries/hindi_irregulars.json";
import hindiCommonWordsJson from "./data/dictionaries/hindi_common_words.json";
import hebrewIrregularsJson from "./data/dictionaries/hebrew_irregulars.json";
import hebrewCommonWordsJson from "./data/dictionaries/hebrew_common_words.json";
import greekIrregularsJson from "./data/dictionaries/greek_irregulars.json";
import greekCommonVerbsJson from "./data/dictionaries/greek_common_verbs.json";
import finnishIrregularsJson from "./data/dictionaries/finnish_irregulars.json";
import finnishCommonVerbsJson from "./data/dictionaries/finnish_common_verbs.json";
import hungarianIrregularsJson from "./data/dictionaries/hungarian_irregulars.json";
import hungarianCommonVerbsJson from "./data/dictionaries/hungarian_common_verbs.json";
import czechIrregularsJson from "./data/dictionaries/czech_irregulars.json";
import czechCommonVerbsJson from "./data/dictionaries/czech_common_verbs.json";
import romanianIrregularsJson from "./data/dictionaries/romanian_irregulars.json";
import romanianCommonVerbsJson from "./data/dictionaries/romanian_common_verbs.json";
import vietnameseIrregularsJson from "./data/dictionaries/vietnamese_irregulars.json";
import vietnameseCommonWordsJson from "./data/dictionaries/vietnamese_common_words.json";
import persianIrregularsJson from "./data/dictionaries/persian_irregulars.json";
import persianCommonWordsJson from "./data/dictionaries/persian_common_words.json";

interface VerbEndingRule {
  ending: string;
  infinitives: string[];
}

const ENGLISH_IRREGULARS: Record<string, string[]> = englishIrregularsJson;
const SPANISH_IRREGULARS: Record<string, string[]> = spanishIrregularsJson;
const PORTUGUESE_IRREGULARS: Record<string, string[]> = portugueseIrregularsJson;
const PORTUGUESE_COMMON_VERBS = new Set<string>(portugueseCommonVerbsJson);
const FRENCH_IRREGULARS: Record<string, string[]> = frenchIrregularsJson;
const FRENCH_COMMON_VERBS = new Set<string>(frenchCommonVerbsJson);
const ITALIAN_IRREGULARS: Record<string, string[]> = italianIrregularsJson;
const ITALIAN_COMMON_VERBS = new Set<string>(italianCommonVerbsJson);
const GERMAN_IRREGULARS: Record<string, string[]> = germanIrregularsJson;
const GERMAN_COMMON_VERBS = new Set<string>(germanCommonVerbsJson);
const RUSSIAN_IRREGULARS: Record<string, string[]> = russianIrregularsJson;
const RUSSIAN_COMMON_VERBS = new Set<string>(russianCommonVerbsJson);
const UKRAINIAN_IRREGULARS: Record<string, string[]> = ukrainianIrregularsJson;
const UKRAINIAN_COMMON_VERBS = new Set<string>(ukrainianCommonVerbsJson);
const KAZAKH_IRREGULARS: Record<string, string[]> = kazakhIrregularsJson;
const KAZAKH_COMMON_VERBS = new Set<string>(kazakhCommonVerbsJson);
const KAZAKH_COMMON_WORDS = new Set<string>([
  ...kazakhCommonVerbsJson,
  ...kazakhCommonVerbsJson.map(s => s.toLowerCase()),
  ...kazakhCommonWordsJson,
  ...kazakhCommonWordsJson.map(s => s.toLowerCase())
]);
const POLISH_IRREGULARS: Record<string, string[]> = polishIrregularsJson;
const POLISH_COMMON_VERBS = new Set<string>(polishCommonVerbsJson);
const SWEDISH_IRREGULARS: Record<string, string[]> = swedishIrregularsJson;
const SWEDISH_COMMON_VERBS = new Set<string>(swedishCommonVerbsJson);
const DUTCH_IRREGULARS: Record<string, string[]> = dutchIrregularsJson;
const DUTCH_COMMON_VERBS = new Set<string>(dutchCommonVerbsJson);
const JAPANESE_IRREGULARS: Record<string, string[]> = japaneseIrregularsJson;
const JAPANESE_COMMON_VERBS = new Set<string>(japaneseCommonVerbsJson);
const CHINESE_IRREGULARS: Record<string, string[]> = chineseIrregularsJson;
const CHINESE_COMMON_WORDS = new Set<string>(chineseCommonWordsJson);
const ARABIC_IRREGULARS: Record<string, string[]> = arabicIrregularsJson;
const ARABIC_COMMON_WORDS = new Set<string>(arabicCommonWordsJson);
const KOREAN_IRREGULARS: Record<string, string[]> = koreanIrregularsJson;
const KOREAN_COMMON_WORDS = new Set<string>(koreanCommonWordsJson);
const TURKISH_IRREGULARS: Record<string, string[]> = turkishIrregularsJson;
const TURKISH_COMMON_VERBS = new Set<string>(turkishCommonVerbsJson);
const HINDI_IRREGULARS: Record<string, string[]> = hindiIrregularsJson;
const HINDI_COMMON_WORDS = new Set<string>(hindiCommonWordsJson);
const HEBREW_IRREGULARS: Record<string, string[]> = hebrewIrregularsJson;
const HEBREW_COMMON_WORDS = new Set<string>(hebrewCommonWordsJson);
const GREEK_IRREGULARS: Record<string, string[]> = greekIrregularsJson;
const GREEK_COMMON_VERBS = new Set<string>(greekCommonVerbsJson);
const FINNISH_IRREGULARS: Record<string, string[]> = finnishIrregularsJson;
const FINNISH_COMMON_VERBS = new Set<string>(finnishCommonVerbsJson);
const HUNGARIAN_IRREGULARS: Record<string, string[]> = hungarianIrregularsJson;
const HUNGARIAN_COMMON_VERBS = new Set<string>(hungarianCommonVerbsJson);
const CZECH_IRREGULARS: Record<string, string[]> = czechIrregularsJson;
const CZECH_COMMON_VERBS = new Set<string>(czechCommonVerbsJson);
const ROMANIAN_IRREGULARS: Record<string, string[]> = romanianIrregularsJson;
const ROMANIAN_COMMON_VERBS = new Set<string>(romanianCommonVerbsJson);
const VIETNAMESE_IRREGULARS: Record<string, string[]> = vietnameseIrregularsJson;
const VIETNAMESE_COMMON_WORDS = new Set<string>(vietnameseCommonWordsJson);
const PERSIAN_IRREGULARS: Record<string, string[]> = persianIrregularsJson;
const PERSIAN_COMMON_WORDS = new Set<string>(persianCommonWordsJson);
const SPANISH_DOUBLE_ENCLITICS: string[] = spanishEncliticsJson.double;
const SPANISH_SINGLE_ENCLITICS: string[] = spanishEncliticsJson.single;
const SPANISH_SHORT_IMPERATIVES: Record<string, string[]> = spanishShortImperativesJson;
const SPANISH_FUTURE_STEMS: Record<string, string[]> = spanishFutureStemsJson;
const SPANISH_HIGH_CONFIDENCE_ENDINGS = new Set<string>(spanishHighConfidenceEndingsJson);
const ACCENTED_VERBS_MAP: Record<string, string> = spanishAccentedVerbsJson;
const SPANISH_VERB_ENDINGS: VerbEndingRule[] = spanishVerbEndingsJson;
const SPANISH_COMMON_VERBS = new Set<string>(spanishCommonVerbsJson);
const SPANISH_HOMONYM_PRIORITY: Record<string, string[]> = spanishHomonymsJson.priority;
const SPANISH_HOMONYM_EXCLUDE = new Set<string>(spanishHomonymsJson.exclude);

function normalizeAccents(str: string): string {
  return str
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ü/g, "u");
}

function stripSpanishEnclitics(w: string): string[] {
  const candidates: string[] = [];
  const hasAccent = /[áéíóú]/.test(w);

  const checkValidBase = (stripped: string): boolean => {
    const deAccented = normalizeAccents(stripped).toLowerCase();
    if (deAccented.endsWith("ar") || deAccented.endsWith("er") || deAccented.endsWith("ir")) {
      return SPANISH_COMMON_VERBS.has(deAccented);
    }
    if (deAccented.endsWith("ando") || deAccented.endsWith("iendo") || deAccented.endsWith("yendo")) {
      return true;
    }
    if (/[aeio]$/.test(deAccented)) {
      return true;
    }
    const shortBases = new Set(["di", "da", "haz", "pon", "ten", "ve", "sal", "ven", "val", "trae", "oye", "se", "sé"]);
    if (shortBases.has(deAccented)) {
      return true;
    }
    return false;
  };

  // 1. Try double enclitics
  for (const pronoun of SPANISH_DOUBLE_ENCLITICS) {
    if (w.endsWith(pronoun)) {
      const stripped = w.slice(0, -pronoun.length);
      if (stripped.length >= 2 && checkValidBase(stripped)) {
        candidates.push(normalizeAccents(stripped));
      }
    }
  }

  // 2. Try single enclitics
  for (const pronoun of SPANISH_SINGLE_ENCLITICS) {
    if (w.endsWith(pronoun)) {
      const stripped = w.slice(0, -pronoun.length);
      if (stripped.length >= 2 && checkValidBase(stripped)) {
        if ((pronoun === "nos" || pronoun === "se") && stripped.endsWith("mo")) {
          const restored = stripped + "s";
          candidates.push(normalizeAccents(restored));
        } else {
          candidates.push(normalizeAccents(stripped));
        }
      }
    }
  }

  return Array.from(new Set(candidates));
}


const SPANISH_PAST_GERUND_ENDINGS = new Set([
  "iendo", "yendo", "ió", "ieron",
  "iera", "ieras", "iéramos", "ierais", "ieran",
  "iese", "ieses", "iésemos", "ieseis", "iesen"
]);

function getSpanishStemVariations(stem: string, ending: string): string[] {
  const variations = [stem];

  if (stem.includes("ie")) {
    variations.push(stem.replace("ie", "e"));
    variations.push(stem.replace("ie", "i")); // e.g. adquier -> adquirir
  }

  if (stem.includes("ue")) {
    variations.push(stem.replace("ue", "o"));
    variations.push(stem.replace("ue", "u"));
  }

  if (stem.includes("i")) {
    const lastIndex = stem.lastIndexOf("i");
    const withE = stem.slice(0, lastIndex) + "e" + stem.slice(lastIndex + 1);
    variations.push(withE);
  }

  // ONLY past/gerund: u -> o (e.g. durm -> dorm)
  if (SPANISH_PAST_GERUND_ENDINGS.has(ending) && stem.includes("u")) {
    const lastIndex = stem.lastIndexOf("u");
    const withO = stem.slice(0, lastIndex) + "o" + stem.slice(lastIndex + 1);
    variations.push(withO);
  }

  const finalVars = new Set<string>();
  for (const v of variations) {
    finalVars.add(v);

    // g-verbs present / subjunctive stem changes
    if (v.endsWith("aig") || v.endsWith("oig")) {
      finalVars.add(v.slice(0, -2)); // caig -> ca, traig -> tra, oig -> o
    } else if (v.endsWith("g")) {
      finalVars.add(v.slice(0, -1)); // pong -> pon, salg -> sal, veng -> ven, teng -> ten
    }

    // Spelling change rules for subjunctives/commands
    if (v.endsWith("qu")) {
      finalVars.add(v.slice(0, -2) + "c"); // e.g. busqu -> busc
    }
    if (v.endsWith("gu")) {
      finalVars.add(v.slice(0, -2) + "g"); // e.g. llegu -> lleg
    }
    if (v.endsWith("z")) {
      finalVars.add(v.slice(0, -1) + "c"); // e.g. venz -> venc
    }
    if (v.endsWith("c")) {
      finalVars.add(v.slice(0, -1) + "z"); // e.g. utilic -> utiliz
    }
    if (v.endsWith("g")) {
      finalVars.add(v + "u"); // e.g. seg -> segu, sig -> sigu
    }
    if (v.endsWith("uy")) {
      finalVars.add(v.slice(0, -2) + "u"); // e.g. incluy -> inclu
    }
  }

  return Array.from(finalVars);
}

function handleDoubledConsonant(base: string, doubledChar: string): string[] {
  const res: string[] = [];
  const doubleLetters = ["l", "s", "z", "f", "d"];
  if (doubleLetters.includes(doubledChar)) {
    res.push(base + doubledChar); // e.g. tell, pass
    res.push(base);               // e.g. travel
  } else {
    res.push(base);               // e.g. stop, run
    res.push(base + doubledChar); // e.g. runn (fallback)
  }
  return res;
}

function getPortugueseEncliticCandidates(word: string): string[] {
  if (!word.includes("-")) return [word];
  const parts = word.split("-");
  const verbPart = parts[0];
  const candidates = [verbPart];

  // Direct object pronouns: lo, la, los, las
  const nextPart = parts[1];
  if (nextPart && (nextPart === "lo" || nextPart === "la" || nextPart === "los" || nextPart === "las")) {
    candidates.push(verbPart + "r");
    candidates.push(verbPart + "s");
    candidates.push(verbPart + "z");

    const unaccented = verbPart
      .replace(/[áàâã]/g, "a")
      .replace(/[éê]/g, "e")
      .replace(/[íî]/g, "i")
      .replace(/[óôõ]/g, "o")
      .replace(/[úû]/g, "u");
    candidates.push(unaccented + "r");

    if (verbPart === "pô") candidates.push("pôr");
    if (verbPart === "quê") candidates.push("querer");
    if (verbPart === "di") candidates.push("dizer");
    if (verbPart === "fa") candidates.push("fazer");
  }
  return candidates;
}

function restoreSpanishAccents(suggestion: string, original: string): string {
  const originalLower = original.toLowerCase();

  // Special plural-to-singular accent restoration for -án/-anes, -én/-enes, -ín/-ines, -ón/-ones, -ún/-unes:
  const sugLower = suggestion.toLowerCase();
  const pluralsMap: { [key: string]: { plurSuffix: string; singSuffix: string; accentedSing: string } } = {
    "an": { plurSuffix: "anes", singSuffix: "an", accentedSing: "án" },
    "en": { plurSuffix: "enes", singSuffix: "en", accentedSing: "én" },
    "in": { plurSuffix: "ines", singSuffix: "in", accentedSing: "ín" },
    "on": { plurSuffix: "ones", singSuffix: "on", accentedSing: "ón" },
    "un": { plurSuffix: "unes", singSuffix: "un", accentedSing: "ún" }
  };

  for (const [key, val] of Object.entries(pluralsMap)) {
    if (originalLower.endsWith(val.plurSuffix) && sugLower.endsWith(val.singSuffix)) {
      const base = suggestion.slice(0, -val.singSuffix.length);
      const suffix = suggestion.slice(-val.singSuffix.length);
      const lastVowel = suffix[0];
      const isUpper = lastVowel === lastVowel.toUpperCase();
      const restoredSuffix = isUpper ? val.accentedSing.toUpperCase() : val.accentedSing.toLowerCase();
      return base + restoredSuffix;
    }
  }
  
  const accentMap: { [key: string]: string } = {
    "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u"
  };
  
  const reverseAccentMap: { [key: string]: string } = {
    "a": "á", "e": "é", "i": "í", "o": "ó", "u": "ú", "ü": "ü"
  };

  // Find where the accent is in the original word
  let accentedChar: string | null = null;
  let accentedIndex: number = -1;
  for (let i = 0; i < originalLower.length; i++) {
    const char = originalLower[i];
    if (accentMap[char]) {
      accentedChar = char;
      accentedIndex = i;
      break;
    }
  }

  if (accentedIndex === -1 || !accentedChar) {
    return suggestion;
  }

  // De-accented original character
  const cleanOrigAccented = accentMap[accentedChar];

  let restored = "";
  for (let i = 0; i < suggestion.length; i++) {
    const sugChar = suggestion[i];
    const sugCharLower = sugChar.toLowerCase();

    // Direct index match
    if (i === accentedIndex && sugCharLower === cleanOrigAccented) {
      const accentedLower = reverseAccentMap[sugCharLower] || sugCharLower;
      const finalChar = sugChar === sugChar.toUpperCase() ? accentedLower.toUpperCase() : accentedLower;
      restored += finalChar;
    } else {
      restored += sugChar;
    }
  }

  // Fallback specifically for -ico / -ica:
  const cleanRestoredLower = normalizeAccents(restored).toLowerCase();
  if ((cleanRestoredLower.endsWith("ico") || cleanRestoredLower.endsWith("ica")) && !/[áéíóú]/.test(restored)) {
    let vowelIndex = -1;
    for (let i = restored.length - 4; i >= 0; i--) {
      const charLower = restored[i].toLowerCase();
      if (["a", "e", "i", "o", "u"].includes(charLower)) {
        vowelIndex = i;
        break;
      }
    }
    if (vowelIndex !== -1) {
      const sugChar = restored[vowelIndex];
      const sugCharLower = sugChar.toLowerCase();
      if (reverseAccentMap[sugCharLower]) {
        const accentedLower = reverseAccentMap[sugCharLower];
        const finalChar = sugChar === sugChar.toUpperCase() ? accentedLower.toUpperCase() : accentedLower;
        restored = restored.slice(0, vowelIndex) + finalChar + restored.slice(vowelIndex + 1);
      }
    }
  }

  return restored;
}

function addFrenchStemVariations(stem: string, verbSuggestions: string[]) {
  if (!stem || stem.length < 2) return;
  verbSuggestions.push(stem + "er");
  verbSuggestions.push(stem + "ir");
  verbSuggestions.push(stem + "re");
  if (stem.endsWith("ç")) verbSuggestions.push(stem.slice(0, -1) + "cer");
  if (stem.endsWith("ge")) verbSuggestions.push(stem.slice(0, -2) + "ger");
  if (stem.endsWith("è")) verbSuggestions.push(stem.slice(0, -1) + "er");
  if (stem.endsWith("ll")) verbSuggestions.push(stem.slice(0, -1) + "er");
  if (stem.endsWith("tt")) verbSuggestions.push(stem.slice(0, -1) + "er");
  if (stem.endsWith("i")) verbSuggestions.push(stem.slice(0, -1) + "yer");
}

function addItalianStemVariations(stem: string, verbSuggestions: string[]) {
  if (!stem || stem.length < 2) return;
  verbSuggestions.push(stem + "are");
  verbSuggestions.push(stem + "ere");
  verbSuggestions.push(stem + "ire");
  if (stem.endsWith("ch")) verbSuggestions.push(stem.slice(0, -2) + "care");
  if (stem.endsWith("gh")) verbSuggestions.push(stem.slice(0, -2) + "gare");
  if (stem.endsWith("isc")) verbSuggestions.push(stem.slice(0, -3) + "ire");
}

function stripItalianEnclitics(word: string): string[] {
  const enclitics = [
    "melo", "mela", "meli", "mele", "telo", "tela", "teli", "tele",
    "glielo", "gliela", "glieli", "gliele", "celo", "cela", "celi", "cele",
    "velo", "vela", "veli", "vele",
    "mi", "ti", "si", "ci", "vi", "lo", "la", "li", "le", "ne"
  ];
  const candidates: string[] = [word];
  for (const enc of enclitics) {
    if (word.endsWith(enc) && word.length > enc.length + 2) {
      const stripped = word.slice(0, -enc.length);
      candidates.push(stripped);
      candidates.push(stripped + "e");
    }
  }
  return candidates;
}

function addGermanStemVariations(stem: string, verbSuggestions: string[]) {
  if (!stem || stem.length < 2) return;
  verbSuggestions.push(stem + "en");
  verbSuggestions.push(stem + "n");
  if (stem.includes("ä")) verbSuggestions.push(stem.replace(/ä/g, "a") + "en");
  if (stem.includes("ö")) verbSuggestions.push(stem.replace(/ö/g, "o") + "en");
  if (stem.includes("ü")) verbSuggestions.push(stem.replace(/ü/g, "u") + "en");
}

function addRussianStemVariations(stem: string, verbSuggestions: string[], isReflexive: boolean = false) {
  if (!stem || stem.length < 2) return;
  const pushInfinitive = (inf: string) => {
    verbSuggestions.push(inf);
    if (isReflexive) verbSuggestions.push(inf + "ся");
  };

  pushInfinitive(stem + "ть");
  pushInfinitive(stem + "ти");
  pushInfinitive(stem + "чь");
  pushInfinitive(stem + "ать");
  pushInfinitive(stem + "ять");
  pushInfinitive(stem + "еть");
  pushInfinitive(stem + "ить");
  pushInfinitive(stem + "овать");
  pushInfinitive(stem + "евать");

  if (stem.endsWith("жд")) pushInfinitive(stem.slice(0, -2) + "дить");
  if (stem.endsWith("ч")) {
    pushInfinitive(stem.slice(0, -1) + "тить");
    pushInfinitive(stem.slice(0, -1) + "чать");
    pushInfinitive(stem.slice(0, -1) + "чь");
  }
  if (stem.endsWith("щ")) {
    pushInfinitive(stem.slice(0, -1) + "стить");
    pushInfinitive(stem.slice(0, -1) + "щать");
  }
  if (stem.endsWith("ж")) {
    pushInfinitive(stem.slice(0, -1) + "зить");
    pushInfinitive(stem.slice(0, -1) + "жать");
    pushInfinitive(stem.slice(0, -1) + "гти");
  }
  if (stem.endsWith("ш")) {
    pushInfinitive(stem.slice(0, -1) + "сить");
    pushInfinitive(stem.slice(0, -1) + "шать");
  }
  if (stem.endsWith("бл")) pushInfinitive(stem.slice(0, -2) + "бить");
  if (stem.endsWith("пл")) pushInfinitive(stem.slice(0, -2) + "пить");
  if (stem.endsWith("вл")) pushInfinitive(stem.slice(0, -2) + "вить");
  if (stem.endsWith("мл")) pushInfinitive(stem.slice(0, -2) + "мить");
}


function addPolishStemVariations(stem: string, verbSuggestions: string[], isReflexive: boolean = false) {
  if (!stem || stem.length < 2) return;
  const pushInfinitive = (inf: string) => {
    verbSuggestions.push(inf);
    if (isReflexive) verbSuggestions.push(inf + " się");
  };

  pushInfinitive(stem + "ać");
  pushInfinitive(stem + "eć");
  pushInfinitive(stem + "ić");
  pushInfinitive(stem + "yć");
  pushInfinitive(stem + "ować");
  pushInfinitive(stem + "iwać");
  pushInfinitive(stem + "ywać");
  pushInfinitive(stem + "ć");
  pushInfinitive(stem + "c");

  if (stem.endsWith("dz")) pushInfinitive(stem.slice(0, -2) + "dzić");
  if (stem.endsWith("cz")) {
    pushInfinitive(stem.slice(0, -2) + "cić");
    pushInfinitive(stem.slice(0, -2) + "cać");
    pushInfinitive(stem.slice(0, -2) + "c");
  }
  if (stem.endsWith("sz")) {
    pushInfinitive(stem.slice(0, -2) + "sić");
    pushInfinitive(stem.slice(0, -2) + "szać");
  }
  if (stem.endsWith("ż")) {
    pushInfinitive(stem.slice(0, -1) + "zić");
    pushInfinitive(stem.slice(0, -1) + "żać");
    pushInfinitive(stem.slice(0, -1) + "c");
  }
  if (stem.endsWith("uj")) {
    pushInfinitive(stem.slice(0, -2) + "ować");
  }
}

function addSwedishStemVariations(stem: string, verbSuggestions: string[]) {
  if (!stem || stem.length < 2) return;
  verbSuggestions.push(stem + "a");
  verbSuggestions.push(stem);
}

function addDutchStemVariations(stem: string, verbSuggestions: string[]) {
  if (!stem || stem.length < 2) return;
  verbSuggestions.push(stem + "en");
  verbSuggestions.push(stem + "n");

  if (stem.endsWith("v")) {
    const fStem = stem.slice(0, -1) + "f";
    verbSuggestions.push(fStem + "en");
  }
  if (stem.endsWith("z")) {
    const sStem = stem.slice(0, -1) + "s";
    verbSuggestions.push(sStem + "en");
  }
}

function normalizeArabic(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\u064B-\u0652\u0670]/g, "") // Strip Tashkeel / Short Vowels
    .replace(/[أإآ]/g, "ا")             // Normalize Alef
    .replace(/ى/g, "ي")                 // Normalize Alef Maqsura
    .replace(/ؤ/g, "و")                 // Normalize Hamza on Waw
    .replace(/ئ/g, "ي");                // Normalize Hamza on Ya
}

function normalizeHebrew(str: string): string {
  if (!str) return "";
  return str.replace(/[\u0591-\u05C7]/g, ""); // Strip Niqqud diacritics
}

function normalizePersian(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\u064B-\u0652]/g, "")    // Strip Harakat (short vowels)
    .replace(/[\u064A\u0649]/g, "ی")    // Arabic Ya -> Persian Ye
    .replace(/\u0643/g, "ک")           // Arabic Kaf -> Persian Ke
    .replace(/\u200C/g, "");            // Strip ZWNJ (nim-fasele)
}

function stripGreekAccents(str: string): string {
  if (!str) return "";
  return str
    .replace(/[άὰάἄἄἂἂἆἆἁἁἃἃἇἇ]/g, "α")
    .replace(/[έὲέἔἔἓἓ]/g, "ε")
    .replace(/[ήὴήἤἤἢἢἦἦἡἡἣἣἧἧ]/g, "η")
    .replace(/[ίὶίἴἴἲἲἶἶἱἱἳἳἷἷϊΐ]/g, "ι")
    .replace(/[όὸόὄὄὃὃὁὁὃὃ]/g, "ο")
    .replace(/[ύὺύὔὔὒὒὖὖὑὑὓὓὗὗϋΰ]/g, "υ")
    .replace(/[ώὼώὤὤὢὢὦὦὡὡὣὣὧὧ]/g, "ω")
    .replace(/ς/g, "σ");
}

export function getSuggestedLemmas(word: string, targetLanguage: string): string[] {
  if (!word) return [];
  const w = word.trim().toLowerCase();
  if (w.length <= 1) return [];

  const lang = (targetLanguage || "").toLowerCase().trim();
  const suggestions: string[] = [];

  // 1. English Lemmatization (via compromise + ENGLISH_IRREGULARS override)
  if (lang.startsWith("en") || lang === "английский" || lang === "english") {
    const ENGLISH_IRREGULAR_FORMS: Record<string, string[]> = {
      "driven": ["drive"],
      "drove": ["drive"],
      "driving": ["drive"],
      "written": ["write"],
      "wrote": ["write"],
      "writing": ["write"],
      "spoken": ["speak"],
      "spoke": ["speak"],
      "speaking": ["speak"],
      "broken": ["break"],
      "broke": ["break"],
      "breaking": ["break"],
      "given": ["give"],
      "gave": ["give"],
      "giving": ["give"],
      "taken": ["take"],
      "took": ["take"],
      "taking": ["take"],
      "chosen": ["choose"],
      "chose": ["choose"],
      "choosing": ["choose"],
      "frozen": ["freeze"],
      "froze": ["freeze"],
      "freezing": ["freeze"],
      "stolen": ["steal"],
      "stole": ["steal"],
      "stealing": ["steal"],
      "woken": ["wake"],
      "woke": ["wake"],
      "waking": ["wake"],
      "bitten": ["bite"],
      "bit": ["bite"],
      "biting": ["bite"],
      "hidden": ["hide"],
      "hid": ["hide"],
      "hiding": ["hide"],
      "ridden": ["ride"],
      "rode": ["ride"],
      "riding": ["ride"],
      "risen": ["rise"],
      "rose": ["rise"],
      "rising": ["rise"],
      "eaten": ["eat"],
      "ate": ["eat"],
      "eating": ["eat"],
      "fallen": ["fall"],
      "fell": ["fall"],
      "falling": ["fall"],
      "forgotten": ["forget"],
      "forgot": ["forget"],
      "forgetting": ["forget"],
      "sung": ["sing"],
      "sang": ["sing"],
      "singing": ["sing"],
      "rung": ["ring"],
      "rang": ["ring"],
      "ringing": ["ring"],
      "swum": ["swim"],
      "swam": ["swim"],
      "swimming": ["swim"],
      "drunk": ["drink"],
      "drank": ["drink"],
      "drinking": ["drink"],
      "flown": ["fly"],
      "flew": ["fly"],
      "flying": ["fly"],
      "drawn": ["draw"],
      "drew": ["draw"],
      "drawing": ["draw"],
      "blown": ["blow"],
      "blew": ["blow"],
      "blowing": ["blow"],
      "grown": ["grow"],
      "grew": ["grow"],
      "growing": ["grow"],
      "thrown": ["throw"],
      "threw": ["throw"],
      "throwing": ["throw"],
      "done": ["do"],
      "did": ["do"],
      "doing": ["do"],
      "does": ["do"],
      "been": ["be"],
      "was": ["be"],
      "were": ["be"],
      "being": ["be"],
      "had": ["have"],
      "having": ["have"],
      "has": ["have"],
      "gone": ["go"],
      "went": ["go"],
      "going": ["go"],
      "goes": ["go"]
    };

    if (ENGLISH_IRREGULAR_FORMS[w]) {
      suggestions.push(...ENGLISH_IRREGULAR_FORMS[w]);
    } else if (ENGLISH_IRREGULARS[w]) {
      suggestions.push(...ENGLISH_IRREGULARS[w]);
    }

    // Priority 2: compromise open-source engine (handles thousands of verbs, nouns, adjectives automatically)
    try {
      const doc = nlp(w);
      doc.compute("root");
      const root: string = doc.json()[0]?.terms?.[0]?.root || "";
      if (root && root !== w && !suggestions.includes(root)) {
        suggestions.push(root);
      }
    } catch {
      // Silently fall through if compromise fails
    }

    // Priority 3: minimal fallback for -ed/-ing when compromise returns no root
    // (happens when compromise tags word as adjective instead of verb, e.g. "loved")
    if (suggestions.length === 0) {
      if (w.endsWith("ed") && w.length > 3) {
        suggestions.push(w.slice(0, -2));       // walked -> walk
        suggestions.push(w.slice(0, -1));       // loved -> love
      } else if (w.endsWith("ing") && w.length > 4) {
        suggestions.push(w.slice(0, -3));       // making -> mak (not great but fallback)
        suggestions.push(w.slice(0, -3) + "e"); // making -> make
      }
    }
  }

  // 2. Spanish Lemmatization
  else if (lang.startsWith("es") || lang.startsWith("spa") || lang === "испанский" || lang === "spanish") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    // Direct lookup in irregulars first
    if (SPANISH_IRREGULARS[w]) {
      verbSuggestions.push(...SPANISH_IRREGULARS[w]);
    }

    // Generate candidates: only process enclitics-stripped bases if enclitics are found
    const encliticBases = stripSpanishEnclitics(w);
    const candidates = encliticBases.length > 0 ? encliticBases : [w];

    // Process each candidate
    for (let cand of Array.from(new Set(candidates))) {
      cand = normalizeAccents(cand);

      // Direct infinitive check: if cand is already a valid common infinitive
      if ((cand.endsWith("ar") || cand.endsWith("er") || cand.endsWith("ir")) && SPANISH_COMMON_VERBS.has(cand)) {
        verbSuggestions.push(cand);
        continue;
      }

      // 1. Irregular checks for this candidate
      if (SPANISH_IRREGULARS[cand]) {
        verbSuggestions.push(...SPANISH_IRREGULARS[cand]);
      }

      // Check short irregular imperative forms
      if (SPANISH_SHORT_IMPERATIVES[cand]) {
        verbSuggestions.push(...SPANISH_SHORT_IMPERATIVES[cand]);
      }

      // Check irregular future stems
      for (const [fStem, infinitives] of Object.entries(SPANISH_FUTURE_STEMS)) {
        if (cand === fStem) {
          verbSuggestions.push(...infinitives);
        }
      }

      // 2. Noun and Adjective Rules (run on each candidate)
      if (cand.endsWith("as") && cand.length > 3) {
        nounAdjSuggestions.push(cand.slice(0, -2) + "o");
        nounAdjSuggestions.push(cand.slice(0, -2) + "a");
      } else if (cand.endsWith("os") && cand.length > 3 && !cand.endsWith("mos")) {
        nounAdjSuggestions.push(cand.slice(0, -2) + "o");
      } else if (cand.endsWith("a") && cand.length > 2) {
        nounAdjSuggestions.push(cand.slice(0, -1) + "o");
      } else if (cand.endsWith("ces") && cand.length > 4) {
        nounAdjSuggestions.push(cand.slice(0, -3) + "z"); // e.g. felices -> feliz
      } else if (cand.endsWith("es") && cand.length > 3) {
        nounAdjSuggestions.push(cand.slice(0, -2)); // e.g. flores -> flor
        nounAdjSuggestions.push(cand.slice(0, -1)); // e.g. amantes -> amante
      } else if (cand.endsWith("s") && cand.length > 2 && !cand.endsWith("mos")) {
        nounAdjSuggestions.push(cand.slice(0, -1)); // e.g. libros -> libro
      }

      // 3. Verb Ending Rules (run on each candidate)
      const pushVerbSuggestion = (verb: string) => {
        verbSuggestions.push(verb);
        if (ACCENTED_VERBS_MAP[verb]) {
          verbSuggestions.push(ACCENTED_VERBS_MAP[verb]);
        }
      };

      const matchedRulesData: {
        rule: typeof SPANISH_VERB_ENDINGS[number];
        stem: string;
        foundIrregular: boolean;
        generatedVerbs: string[];
      }[] = [];

      for (const rule of SPANISH_VERB_ENDINGS) {
        const normEnding = normalizeAccents(rule.ending);
        if (cand.endsWith(normEnding) && cand.length > normEnding.length + 1) {
          const stem = cand.slice(0, -normEnding.length);
          
          let foundIrregular = false;
          if (SPANISH_FUTURE_STEMS[stem]) {
            foundIrregular = true;
          }

          const stemVars = getSpanishStemVariations(stem, rule.ending);
          const generatedVerbs: string[] = [];

          for (const sVar of stemVars) {
            for (const inf of rule.infinitives) {
              const verb = sVar + inf;
              // Synthetic stem variations (e.g. benven, binven) are ONLY allowed if verified in SPANISH_COMMON_VERBS
              if (sVar === stem || SPANISH_COMMON_VERBS.has(verb)) {
                generatedVerbs.push(verb);
              }
            }
          }

          matchedRulesData.push({
            rule,
            stem,
            foundIrregular,
            generatedVerbs
          });
        }
      }

      let foundCommonVerb = false;
      for (const data of matchedRulesData) {
        if (data.foundIrregular) {
          const stem = data.stem;
          for (const v of SPANISH_FUTURE_STEMS[stem]) {
            pushVerbSuggestion(v);
            foundCommonVerb = true;
          }
        }
        const validVerbs = data.generatedVerbs.filter(v => SPANISH_COMMON_VERBS.has(v));
        if (validVerbs.length > 0) {
          foundCommonVerb = true;
          for (const v of validVerbs) {
            pushVerbSuggestion(v);
          }
        }
      }

      if (!foundCommonVerb && matchedRulesData.length > 0 && nounAdjSuggestions.length === 0) {
        const primaryMatch = matchedRulesData[0];
        const rule = primaryMatch.rule;
        const stem = primaryMatch.stem;

        if (SPANISH_HIGH_CONFIDENCE_ENDINGS.has(rule.ending)) {
          for (const inf of rule.infinitives) {
            const verb = stem + inf;
            if (SPANISH_COMMON_VERBS.has(verb)) {
              pushVerbSuggestion(verb);
            }
          }
        }
      }
    }

    // Merge suggestions, placing verbs first
    suggestions.push(...verbSuggestions);
    suggestions.push(...nounAdjSuggestions.map(s => restoreSpanishAccents(s, w)));
  }

  // 3. Portuguese Lemmatization
  else if (lang.startsWith("pt") || lang.startsWith("por") || lang === "португальский" || lang === "portuguese") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    const candidates = getPortugueseEncliticCandidates(w);

    for (let cand of Array.from(new Set(candidates))) {
      const normCand = normalizeAccents(cand);
      if (PORTUGUESE_IRREGULARS[cand] || PORTUGUESE_IRREGULARS[normCand]) {
        if (PORTUGUESE_IRREGULARS[cand]) verbSuggestions.push(...PORTUGUESE_IRREGULARS[cand]);
        if (PORTUGUESE_IRREGULARS[normCand]) verbSuggestions.push(...PORTUGUESE_IRREGULARS[normCand]);
        continue;
      }
      if (cand.endsWith("ar") || cand.endsWith("er") || cand.endsWith("ir") || cand.endsWith("or") || cand.endsWith("ôr")) {
        verbSuggestions.push(cand);
      }

      if (cand.endsWith("rmos") || cand.endsWith("rdes")) {
        verbSuggestions.push(cand.slice(0, -3));
      } else if (cand.endsWith("res") || cand.endsWith("rem")) {
        const infinitiveBase = cand.slice(0, -2);
        if (infinitiveBase.endsWith("r")) verbSuggestions.push(infinitiveBase);
      }

      if (cand.endsWith("s") && cand.length > 2) {
        if (cand.endsWith("ões") || cand.endsWith("ães") || cand.endsWith("ãos")) {
          nounAdjSuggestions.push(cand.slice(0, -3) + "ão");
        } else if (cand.endsWith("ns")) {
          nounAdjSuggestions.push(cand.slice(0, -2) + "m");
        } else if (cand.endsWith("es")) {
          nounAdjSuggestions.push(cand.slice(0, -2));
        } else {
          nounAdjSuggestions.push(cand.slice(0, -1));
        }
      }

      if (cand.endsWith("a") && cand.length > 2) {
        nounAdjSuggestions.push(cand.slice(0, -1) + "o");
      }

      if (cand.endsWith("ando")) verbSuggestions.push(cand.slice(0, -4) + "ar");
      else if (cand.endsWith("endo")) {
        verbSuggestions.push(cand.slice(0, -4) + "er");
        verbSuggestions.push(cand.slice(0, -4) + "ir");
      } else if (cand.endsWith("indo")) {
        verbSuggestions.push(cand.slice(0, -4) + "ir");
      }

      if (cand.endsWith("ado")) verbSuggestions.push(cand.slice(0, -3) + "ar");
      else if (cand.endsWith("ido")) {
        verbSuggestions.push(cand.slice(0, -3) + "er");
        verbSuggestions.push(cand.slice(0, -3) + "ir");
      }

      if (cand.endsWith("ava") || cand.endsWith("avam") || cand.endsWith("avas") || cand.endsWith("ávamos")) {
        verbSuggestions.push(cand.replace(/á|a(va|vam|vas|vamos)$/, "") + "ar");
      }
      if (cand.endsWith("ia") || cand.endsWith("iam") || cand.endsWith("ias") || cand.endsWith("íamos")) {
        verbSuggestions.push(cand.replace(/í|i(a|am|as|amos)$/, "") + "er");
        verbSuggestions.push(cand.replace(/í|i(a|am|as|amos)$/, "") + "ir");
      }

      if (cand.endsWith("ou") || cand.endsWith("ei") || cand.endsWith("aram")) {
        verbSuggestions.push(cand.replace(/(ou|ei|aram)$/, "") + "ar");
      }
      if (cand.endsWith("eu") || cand.endsWith("emos") || cand.endsWith("eram")) {
        verbSuggestions.push(cand.replace(/(eu|emos|eram)$/, "") + "er");
      }
      if (cand.endsWith("iu") || cand.endsWith("imos") || cand.endsWith("iram")) {
        verbSuggestions.push(cand.replace(/(iu|imos|iram)$/, "") + "ir");
      }
    }

    const validVerbs = Array.from(new Set(verbSuggestions)).filter(v => PORTUGUESE_COMMON_VERBS.has(v));
    if (validVerbs.length > 0) {
      suggestions.push(...validVerbs);
    } else {
      suggestions.push(...verbSuggestions);
      suggestions.push(...nounAdjSuggestions);
    }
  }

  // 4. French Lemmatization
  else if (lang.startsWith("fr") || lang.startsWith("fre") || lang === "французский" || lang === "french") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    let baseWord = w;
    const elisionPrefixes = ["l'", "d'", "j'", "m'", "t'", "s'", "n'", "c'"];
    for (const pref of elisionPrefixes) {
      if (baseWord.startsWith(pref)) {
        baseWord = baseWord.slice(pref.length);
        break;
      }
    }

    const normWord = normalizeAccents(baseWord);

    if (FRENCH_IRREGULARS[w] || FRENCH_IRREGULARS[baseWord] || FRENCH_IRREGULARS[normWord]) {
      if (FRENCH_IRREGULARS[w]) verbSuggestions.push(...FRENCH_IRREGULARS[w]);
      if (FRENCH_IRREGULARS[baseWord]) verbSuggestions.push(...FRENCH_IRREGULARS[baseWord]);
      return Array.from(new Set(verbSuggestions)).filter(s => s !== w);
    }

    if ((baseWord.endsWith("er") || baseWord.endsWith("ir") || baseWord.endsWith("re")) && FRENCH_COMMON_VERBS.has(baseWord)) {
      suggestions.push(baseWord);
      return suggestions;
    }

    if (baseWord.endsWith("aux") && baseWord.length > 4) {
      nounAdjSuggestions.push(baseWord.slice(0, -3) + "al");
    } else if (baseWord.endsWith("x") || baseWord.endsWith("s")) {
      nounAdjSuggestions.push(baseWord.slice(0, -1));
    }
    if (baseWord.endsWith("euse") || baseWord.endsWith("euses")) {
      nounAdjSuggestions.push(baseWord.replace(/(euse|euses)$/, "eur"));
    } else if (baseWord.endsWith("es") || baseWord.endsWith("e")) {
      nounAdjSuggestions.push(baseWord.replace(/(es|e)$/, ""));
    }

    if (baseWord.endsWith("ant")) {
      addFrenchStemVariations(baseWord.slice(0, -3), verbSuggestions);
    } else if (baseWord.endsWith("é") || baseWord.endsWith("és") || baseWord.endsWith("ée") || baseWord.endsWith("ées")) {
      addFrenchStemVariations(baseWord.replace(/(é|és|ée|ées)$/, ""), verbSuggestions);
    } else if (baseWord.endsWith("ez") || baseWord.endsWith("ons") || baseWord.endsWith("ent") || baseWord.endsWith("ais") || baseWord.endsWith("ait") || baseWord.endsWith("aient") || baseWord.endsWith("iez") || baseWord.endsWith("ions")) {
      addFrenchStemVariations(baseWord.replace(/(ez|ons|ent|ais|ait|aient|iez|ions)$/, ""), verbSuggestions);
    } else if (baseWord.endsWith("ai") || baseWord.endsWith("as") || baseWord.endsWith("era") || baseWord.endsWith("erai") || baseWord.endsWith("eras") || baseWord.endsWith("erez") || baseWord.endsWith("erons")) {
      addFrenchStemVariations(baseWord.replace(/(ai|as|era|erai|eras|erez|erons)$/, ""), verbSuggestions);
    } else if (baseWord.endsWith("e") || baseWord.endsWith("es") || baseWord.endsWith("is") || baseWord.endsWith("it") || baseWord.endsWith("u")) {
      addFrenchStemVariations(baseWord.slice(0, -1), verbSuggestions);
    }

    const validVerbs = Array.from(new Set(verbSuggestions)).filter(v => FRENCH_COMMON_VERBS.has(v));
    if (validVerbs.length > 0) {
      suggestions.push(...validVerbs);
    } else {
      suggestions.push(...verbSuggestions);
      suggestions.push(...nounAdjSuggestions);
    }
  }

  // 5. Italian Lemmatization
  else if (lang.startsWith("it") || lang.startsWith("ita") || lang === "итальянский" || lang === "italian") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    const candidates = stripItalianEnclitics(w);

    for (let cand of Array.from(new Set(candidates))) {
      const normCand = normalizeAccents(cand);
      if (ITALIAN_IRREGULARS[cand] || ITALIAN_IRREGULARS[normCand]) {
        if (ITALIAN_IRREGULARS[cand]) verbSuggestions.push(...ITALIAN_IRREGULARS[cand]);
        if (ITALIAN_IRREGULARS[normCand]) verbSuggestions.push(...ITALIAN_IRREGULARS[normCand]);
        continue;
      }
      if ((cand.endsWith("are") || cand.endsWith("ere") || cand.endsWith("ire")) && ITALIAN_COMMON_VERBS.has(cand)) {
        verbSuggestions.push(cand);
        continue;
      }

      if (cand.endsWith("i") || cand.endsWith("e") || cand.endsWith("a")) {
        nounAdjSuggestions.push(cand.slice(0, -1) + "o");
        nounAdjSuggestions.push(cand.slice(0, -1) + "a");
        nounAdjSuggestions.push(cand.slice(0, -1) + "e");
      }

      if (cand.endsWith("ando") || cand.endsWith("endo")) {
        addItalianStemVariations(cand.slice(0, -4), verbSuggestions);
      } else if (cand.endsWith("ato") || cand.endsWith("uto") || cand.endsWith("ito")) {
        addItalianStemVariations(cand.slice(0, -3), verbSuggestions);
      } else if (cand.endsWith("avo") || cand.endsWith("avi") || cand.endsWith("ava") || cand.endsWith("avamo") || cand.endsWith("avate") || cand.endsWith("avano")) {
        addItalianStemVariations(cand.replace(/(avo|avi|ava|avamo|avate|avano)$/, ""), verbSuggestions);
      } else if (cand.endsWith("evo") || cand.endsWith("evi") || cand.endsWith("eva") || cand.endsWith("evamo") || cand.endsWith("evate") || cand.endsWith("evano")) {
        addItalianStemVariations(cand.replace(/(evo|evi|eva|evamo|evate|evano)$/, ""), verbSuggestions);
      } else if (cand.endsWith("ivo") || cand.endsWith("ivi") || cand.endsWith("iva") || cand.endsWith("ivamo") || cand.endsWith("ivate") || cand.endsWith("ivano")) {
        addItalianStemVariations(cand.replace(/(ivo|ivi|iva|ivamo|ivate|ivano)$/, ""), verbSuggestions);
      } else if (cand.endsWith("iamo") || cand.endsWith("ate") || cand.endsWith("ete") || cand.endsWith("ite") || cand.endsWith("ano") || cand.endsWith("ono")) {
        addItalianStemVariations(cand.replace(/(iamo|ate|ete|ite|ano|ono)$/, ""), verbSuggestions);
      } else if (cand.endsWith("o") || cand.endsWith("i") || cand.endsWith("a") || cand.endsWith("e")) {
        addItalianStemVariations(cand.slice(0, -1), verbSuggestions);
      }
    }

    const validVerbs = Array.from(new Set(verbSuggestions)).filter(v => ITALIAN_COMMON_VERBS.has(v));
    if (validVerbs.length > 0) {
      suggestions.push(...validVerbs);
    } else {
      suggestions.push(...verbSuggestions);
      suggestions.push(...nounAdjSuggestions);
    }
  }

  // 6. German Lemmatization (Fast Path + Headword + AI Lemma Cache Architecture)
  else if (lang.startsWith("de") || lang.startsWith("ger") || lang === "немецкий" || lang === "german") {
    const rawWord = word.trim();
    const normWord = normalizeAccents(w);

    if (GERMAN_IRREGULARS[w] || GERMAN_IRREGULARS[normWord]) {
      const irRes: string[] = [];
      if (GERMAN_IRREGULARS[w]) irRes.push(...GERMAN_IRREGULARS[w]);
      if (GERMAN_IRREGULARS[normWord]) irRes.push(...GERMAN_IRREGULARS[normWord]);
      suggestions.push(...irRes);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (GERMAN_COMMON_VERBS.has(w) || GERMAN_COMMON_VERBS.has(normWord)) {
      suggestions.push(w);
      return suggestions;
    }

    suggestions.push(rawWord);
  }

  // 7. Russian Lemmatization (Fast Path + Headword + AI Lemma Cache Architecture)
  else if (lang.startsWith("ru") || lang.startsWith("rus") || lang === "русский" || lang === "russian") {
    const rawWord = word.trim();
    let baseWord = w;
    let isReflexive = false;
    if (baseWord.endsWith("ся") && baseWord.length > 3) {
      baseWord = baseWord.slice(0, -2);
      isReflexive = true;
    } else if (baseWord.endsWith("сь") && baseWord.length > 2) {
      baseWord = baseWord.slice(0, -1);
      isReflexive = true;
    }
    const normWord = normalizeAccents(baseWord);

    if (RUSSIAN_IRREGULARS[w] || RUSSIAN_IRREGULARS[baseWord] || RUSSIAN_IRREGULARS[normWord]) {
      const res: string[] = [];
      if (RUSSIAN_IRREGULARS[w]) res.push(...RUSSIAN_IRREGULARS[w]);
      if (RUSSIAN_IRREGULARS[baseWord]) {
        for (const irInf of RUSSIAN_IRREGULARS[baseWord]) {
          res.push(isReflexive ? irInf + "ся" : irInf);
        }
      }
      suggestions.push(...res);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (RUSSIAN_COMMON_VERBS.has(w) || RUSSIAN_COMMON_VERBS.has(baseWord)) {
      suggestions.push(w);
      return suggestions;
    }

    // Safe verb infinitive fallback for common past/present forms (e.g. работал/работала/работали/работаю/работаем -> работать)
    if (baseWord.endsWith("ал") || baseWord.endsWith("ала") || baseWord.endsWith("али") || baseWord.endsWith("аю") || baseWord.endsWith("аем") || baseWord.endsWith("ают")) {
      const stem = baseWord.replace(/(ал|ала|али|аю|аем|ают)$/, "");
      suggestions.push(stem + "ать" + (isReflexive ? "ся" : ""));
    } else if (baseWord.endsWith("ил") || baseWord.endsWith("ила") || baseWord.endsWith("или") || baseWord.endsWith("им") || baseWord.endsWith("ят")) {
      const stem = baseWord.replace(/(ил|ила|или|им|ят)$/, "");
      suggestions.push(stem + "ить" + (isReflexive ? "ся" : ""));
    } else if (baseWord.endsWith("ел") || baseWord.endsWith("ела") || baseWord.endsWith("ели")) {
      const stem = baseWord.replace(/(ел|ела|ели)$/, "");
      suggestions.push(stem + "еть" + (isReflexive ? "ся" : ""));
    } else if (baseWord.endsWith("овал") || baseWord.endsWith("овала") || baseWord.endsWith("ует") || baseWord.endsWith("уют")) {
      const stem = baseWord.replace(/(овал|овала|ует|уют)$/, "");
      suggestions.push(stem + "овать" + (isReflexive ? "ся" : ""));
    } else if (baseWord.endsWith("ыми") || baseWord.endsWith("ими") || baseWord.endsWith("ого") || baseWord.endsWith("его")) {
      const stem = baseWord.replace(/(ыми|ими|ого|его)$/, "");
      if (/[гкхжчшщ]$/.test(stem)) {
        suggestions.push(stem + "ий");
      } else {
        suggestions.push(stem + "ый");
      }
    } else if (baseWord.endsWith("ами") || baseWord.endsWith("ями")) {
      const stem = baseWord.replace(/(ами|ями)$/, "");
      suggestions.push(stem);
      suggestions.push(stem + "а");
    }

    suggestions.push(rawWord);
  }

  // 8. Ukrainian Lemmatization (Dictionary-based strictly, no fake suffix guessing)
  else if (lang.startsWith("uk") || lang.startsWith("ukr") || lang === "украинский" || lang === "українська" || lang === "український") {
    let baseWord = w;
    let isReflexive = false;
    if (baseWord.endsWith("ся") && baseWord.length > 3) {
      baseWord = baseWord.slice(0, -2);
      isReflexive = true;
    } else if (baseWord.endsWith("сь") && baseWord.length > 2) {
      baseWord = baseWord.slice(0, -1);
      isReflexive = true;
    }

    const normWord = normalizeAccents(baseWord);
    const verbSuggestions: string[] = [];

    if (UKRAINIAN_IRREGULARS[w] || UKRAINIAN_IRREGULARS[baseWord] || UKRAINIAN_IRREGULARS[normWord]) {
      if (UKRAINIAN_IRREGULARS[w]) verbSuggestions.push(...UKRAINIAN_IRREGULARS[w]);
      if (UKRAINIAN_IRREGULARS[baseWord]) {
        for (const irInf of UKRAINIAN_IRREGULARS[baseWord]) {
          verbSuggestions.push(isReflexive ? irInf + "ся" : irInf);
        }
      }
      if (UKRAINIAN_IRREGULARS[normWord]) {
        for (const irInf of UKRAINIAN_IRREGULARS[normWord]) {
          verbSuggestions.push(isReflexive ? irInf + "ся" : irInf);
        }
      }
      return Array.from(new Set(verbSuggestions)).filter(s => s !== w);
    }

    if (baseWord.endsWith("ти") && UKRAINIAN_COMMON_VERBS.has(w)) {
      return [w];
    }
  }

  // 9. Polish Lemmatization
  else if (lang.startsWith("pl") || lang.startsWith("pol") || lang === "польский" || lang === "polski") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    let baseWord = w;
    let isReflexive = false;
    if (baseWord.endsWith(" się") && baseWord.length > 4) {
      baseWord = baseWord.slice(0, -4);
      isReflexive = true;
    }

    const normWord = normalizeAccents(baseWord);

    if (POLISH_IRREGULARS[w] || POLISH_IRREGULARS[baseWord] || POLISH_IRREGULARS[normWord]) {
      if (POLISH_IRREGULARS[w]) verbSuggestions.push(...POLISH_IRREGULARS[w]);
      if (POLISH_IRREGULARS[baseWord]) {
        for (const irInf of POLISH_IRREGULARS[baseWord]) {
          verbSuggestions.push(isReflexive ? irInf + " się" : irInf);
        }
      }
      return Array.from(new Set(verbSuggestions)).filter(s => s !== w);
    }

    if ((baseWord.endsWith("ać") || baseWord.endsWith("eć") || baseWord.endsWith("ić") || baseWord.endsWith("yć") || baseWord.endsWith("ć") || baseWord.endsWith("c")) && POLISH_COMMON_VERBS.has(w)) {
      suggestions.push(w);
      return suggestions;
    }

    if (baseWord.endsWith("ego") || baseWord.endsWith("emu") || baseWord.endsWith("ych") || baseWord.endsWith("ich") || baseWord.endsWith("ymi") || baseWord.endsWith("imi")) {
      nounAdjSuggestions.push(baseWord.slice(0, -3) + "y");
      nounAdjSuggestions.push(baseWord.slice(0, -3) + "i");
    } else if (baseWord.endsWith("y") || baseWord.endsWith("i") || baseWord.endsWith("a") || baseWord.endsWith("e") || baseWord.endsWith("o") || baseWord.endsWith("ym") || baseWord.endsWith("im")) {
      nounAdjSuggestions.push(baseWord.slice(0, -1) + "y");
      nounAdjSuggestions.push(baseWord.slice(0, -1) + "i");
    }

    if (baseWord.endsWith("ami") || baseWord.endsWith("ach") || baseWord.endsWith("om") || baseWord.endsWith("ów")) {
      nounAdjSuggestions.push(baseWord.slice(0, -3));
      nounAdjSuggestions.push(baseWord.slice(0, -2));
    }

    if (baseWord.endsWith("łem") || baseWord.endsWith("łeś") || baseWord.endsWith("łam") || baseWord.endsWith("łaś") || baseWord.endsWith("liśmy") || baseWord.endsWith("łyście")) {
      addPolishStemVariations(baseWord.replace(/(łem|łeś|łam|łaś|liśmy|łyście)$/, ""), verbSuggestions, isReflexive);
    }
    if (baseWord.endsWith("łem") || baseWord.endsWith("łam") || baseWord.endsWith("ło") || baseWord.endsWith("li") || baseWord.endsWith("ły") || baseWord.endsWith("ł")) {
      addPolishStemVariations(baseWord.replace(/(łem|łam|ło|li|ły|ł)$/, ""), verbSuggestions, isReflexive);
    }
    if (baseWord.endsWith("esz") || baseWord.endsWith("ysz") || baseWord.endsWith("isz") || baseWord.endsWith("emy") || baseWord.endsWith("imy") || baseWord.endsWith("ymy") || baseWord.endsWith("ecie") || baseWord.endsWith("icie") || baseWord.endsWith("ycie")) {
      addPolishStemVariations(baseWord.replace(/(esz|ysz|isz|emy|imy|ymy|ecie|icie|ycie)$/, ""), verbSuggestions, isReflexive);
    }
    if (baseWord.endsWith("uję") || baseWord.endsWith("ujesz") || baseWord.endsWith("uje") || baseWord.endsWith("ujemy") || baseWord.endsWith("ujecie") || baseWord.endsWith("ują")) {
      addPolishStemVariations(baseWord.replace(/(uję|ujesz|uje|ujemy|ujecie|ują)$/, ""), verbSuggestions, isReflexive);
    }
    if (baseWord.endsWith("ę") || baseWord.endsWith("ą") || baseWord.endsWith("e") || baseWord.endsWith("y") || baseWord.endsWith("i")) {
      addPolishStemVariations(baseWord.slice(0, -1), verbSuggestions, isReflexive);
    }

    const validVerbs = Array.from(new Set(verbSuggestions)).filter(v => POLISH_COMMON_VERBS.has(v));
    if (validVerbs.length > 0) {
      suggestions.push(...validVerbs);
    } else {
      suggestions.push(...verbSuggestions);
      suggestions.push(...nounAdjSuggestions);
    }
  }

  // 10. Kazakh Lemmatization (Fast Path + Headword Protection + AI Lemma Cache Architecture)
  else if (lang.startsWith("kk") || lang.startsWith("kaz") || lang === "казахский" || lang === "қазақша" || lang === "қазақ тілі" || lang === "kazakh") {
    const rawWord = word.trim();
    const normW = rawWord.toLowerCase();

    // Fast Path (Irregulars, Pronouns, Predicatives)
    if (KAZAKH_IRREGULARS[rawWord] || KAZAKH_IRREGULARS[normW]) {
      const irRes = KAZAKH_IRREGULARS[rawWord] || KAZAKH_IRREGULARS[normW];
      suggestions.push(...irRes);
      return Array.from(new Set(suggestions));
    }

    // Headword Protection (Exact Master Dictionary Match)
    if (KAZAKH_COMMON_WORDS.has(rawWord) || KAZAKH_COMMON_WORDS.has(normW)) {
      suggestions.push(rawWord);
      return suggestions;
    }

    suggestions.push(rawWord);
  }

  // 11. Swedish Lemmatization
  else if (lang.startsWith("sv") || lang.startsWith("swe") || lang === "шведский" || lang === "svenska" || lang === "swedish") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    let baseWord = w;
    let isPassive = false;
    if (baseWord.endsWith("s") && baseWord.length > 3 && !baseWord.endsWith("ss")) {
      baseWord = baseWord.slice(0, -1);
      isPassive = true;
    }

    const normWord = normalizeAccents(baseWord);

    if (SWEDISH_IRREGULARS[w] || SWEDISH_IRREGULARS[baseWord] || SWEDISH_IRREGULARS[normWord]) {
      if (SWEDISH_IRREGULARS[w]) verbSuggestions.push(...SWEDISH_IRREGULARS[w]);
      if (SWEDISH_IRREGULARS[baseWord]) {
        for (const irInf of SWEDISH_IRREGULARS[baseWord]) {
          verbSuggestions.push(isPassive ? irInf + "s" : irInf);
        }
      }
      return Array.from(new Set(verbSuggestions)).filter(s => s !== w);
    }

    if (SWEDISH_COMMON_VERBS.has(w)) {
      suggestions.push(w);
      return suggestions;
    }

    if (baseWord.endsWith("arna") || baseWord.endsWith("erna") || baseWord.endsWith("orna")) {
      nounAdjSuggestions.push(baseWord.slice(0, -4) + "a");
      nounAdjSuggestions.push(baseWord.slice(0, -4));
    } else if (baseWord.endsWith("ar") || baseWord.endsWith("er") || baseWord.endsWith("or")) {
      nounAdjSuggestions.push(baseWord.slice(0, -2) + "a");
      nounAdjSuggestions.push(baseWord.slice(0, -2));
    } else if (baseWord.endsWith("en") || baseWord.endsWith("et")) {
      nounAdjSuggestions.push(baseWord.slice(0, -2));
    } else if (baseWord.endsWith("a") || baseWord.endsWith("t")) {
      nounAdjSuggestions.push(baseWord.slice(0, -1));
    }

    if (baseWord.endsWith("ade") || baseWord.endsWith("dde")) {
      addSwedishStemVariations(baseWord.slice(0, -3), verbSuggestions);
    } else if (baseWord.endsWith("de") || baseWord.endsWith("te")) {
      addSwedishStemVariations(baseWord.slice(0, -2), verbSuggestions);
    }

    if (baseWord.endsWith("ande") || baseWord.endsWith("ende")) {
      addSwedishStemVariations(baseWord.slice(0, -4), verbSuggestions);
    }

    if (baseWord.endsWith("ar") || baseWord.endsWith("er")) {
      addSwedishStemVariations(baseWord.slice(0, -2), verbSuggestions);
    } else if (baseWord.endsWith("r")) {
      addSwedishStemVariations(baseWord.slice(0, -1), verbSuggestions);
    }

    if (baseWord.endsWith("at") || baseWord.endsWith("tt")) {
      addSwedishStemVariations(baseWord.slice(0, -2), verbSuggestions);
    } else if (baseWord.endsWith("t")) {
      addSwedishStemVariations(baseWord.slice(0, -1), verbSuggestions);
    }

    const validVerbs = Array.from(new Set(verbSuggestions)).filter(v => SWEDISH_COMMON_VERBS.has(v));
    if (validVerbs.length > 0) {
      suggestions.push(...validVerbs);
    } else {
      suggestions.push(...verbSuggestions);
      suggestions.push(...nounAdjSuggestions);
    }
  }

  // 12. Dutch Lemmatization
  else if (lang.startsWith("nl") || lang.startsWith("dut") || lang.startsWith("ned") || lang === "нидерландский" || lang === "голландский" || lang === "dutch" || lang === "nederlands") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    const normWord = normalizeAccents(w);

    if (DUTCH_IRREGULARS[w] || DUTCH_IRREGULARS[normWord]) {
      if (DUTCH_IRREGULARS[w]) suggestions.push(...DUTCH_IRREGULARS[w]);
      if (DUTCH_IRREGULARS[normWord]) suggestions.push(...DUTCH_IRREGULARS[normWord]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (w.endsWith("en") && DUTCH_COMMON_VERBS.has(w)) {
      suggestions.push(w);
      return suggestions;
    }

    if (w.endsWith("etje") && w.length > 5) {
      nounAdjSuggestions.push(w.slice(0, -4));
    } else if (w.endsWith("tje") || w.endsWith("pje") || w.endsWith("kje")) {
      nounAdjSuggestions.push(w.slice(0, -3));
    } else if (w.endsWith("je") && w.length > 3) {
      nounAdjSuggestions.push(w.slice(0, -2));
    } else if (w.endsWith("en") && w.length > 3) {
      nounAdjSuggestions.push(w.slice(0, -2));
    } else if (w.endsWith("s") && w.length > 2) {
      nounAdjSuggestions.push(w.slice(0, -1));
    }

    if (w.endsWith("e") && w.length > 2) {
      nounAdjSuggestions.push(w.slice(0, -1));
    }

    if (w.includes("ge") && (w.endsWith("d") || w.endsWith("t") || w.endsWith("en")) && w.length > 4) {
      const idx = w.indexOf("ge");
      const prefix = w.substring(0, idx);
      const rest = w.substring(idx + 2);
      
      let stem = rest;
      if (rest.endsWith("d") || rest.endsWith("t")) stem = rest.slice(0, -1);
      else if (rest.endsWith("en")) stem = rest.slice(0, -2);

      const candidateInfinitive = prefix + stem + "en";
      verbSuggestions.push(candidateInfinitive);

      if (DUTCH_IRREGULARS[rest]) {
        for (const irInf of DUTCH_IRREGULARS[rest]) {
          verbSuggestions.push(prefix + irInf);
        }
      }
    }

    if (w.endsWith("den") || w.endsWith("ten")) {
      addDutchStemVariations(w.slice(0, -3), verbSuggestions);
    } else if (w.endsWith("de") || w.endsWith("te")) {
      addDutchStemVariations(w.slice(0, -2), verbSuggestions);
    }

    if (w.endsWith("t") && w.length > 2) {
      addDutchStemVariations(w.slice(0, -1), verbSuggestions);
    }

    addDutchStemVariations(w, verbSuggestions);

    const validVerbs = Array.from(new Set(verbSuggestions)).filter(v => DUTCH_COMMON_VERBS.has(v));
    if (validVerbs.length > 0) {
      suggestions.push(...validVerbs);
    } else {
      suggestions.push(...verbSuggestions);
      suggestions.push(...nounAdjSuggestions);
    }
  }

  // 13. Japanese Lemmatization (Fast Path + Headword + AI Lemma Cache Architecture)
  else if (lang.startsWith("ja") || lang.startsWith("jap") || lang === "японский" || lang === "japanese") {
    const rawWord = word.trim();

    if (JAPANESE_IRREGULARS[w] || JAPANESE_IRREGULARS[rawWord]) {
      const irRes = JAPANESE_IRREGULARS[w] || JAPANESE_IRREGULARS[rawWord];
      suggestions.push(...irRes);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (JAPANESE_COMMON_VERBS.has(w) || JAPANESE_COMMON_VERBS.has(rawWord)) {
      suggestions.push(w);
      return suggestions;
    }

    suggestions.push(rawWord);
  }

  // 14. Chinese Lemmatization
  else if (lang.startsWith("zh") || lang.startsWith("chi") || lang.startsWith("zho") || lang === "китайский" || lang === "中文" || lang === "汉语" || lang === "漢語" || lang === "chinese") {
    // Safeguard 1: Protected Stop-list / Irregulars mapping
    if (CHINESE_IRREGULARS[w]) {
      suggestions.push(...CHINESE_IRREGULARS[w]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Full Headword Dictionary Protection
    // If the word exists as an indivisible entry in CHINESE_COMMON_WORDS (e.g. 了解, 目的, 土地, 着急, 过程, 一起来), NEVER STRIP IT!
    if (CHINESE_COMMON_WORDS.has(w)) {
      suggestions.push(w);
      return suggestions;
    }

    // Safeguard 3: Particle & Suffix Stripping ONLY IF stripped result exists in CHINESE_COMMON_WORDS
    const wordSuggestions: string[] = [];
    let baseWord = w;

    if (baseWord.endsWith("起来") || baseWord.endsWith("起來") || baseWord.endsWith("下去") || baseWord.endsWith("出来") || baseWord.endsWith("出來")) {
      const stripped = baseWord.slice(0, -2);
      if (CHINESE_COMMON_WORDS.has(stripped)) wordSuggestions.push(stripped);
      baseWord = stripped;
    }

    if (baseWord.endsWith("了") || baseWord.endsWith("着") || baseWord.endsWith("著") || baseWord.endsWith("过") || baseWord.endsWith("過")) {
      const stripped = baseWord.slice(0, -1);
      if (CHINESE_COMMON_WORDS.has(stripped)) wordSuggestions.push(stripped);
    }

    if (w.endsWith("们") || w.endsWith("們") || w.endsWith("的") || w.endsWith("地") || w.endsWith("得")) {
      const stripped = w.slice(0, -1);
      if (CHINESE_COMMON_WORDS.has(stripped)) wordSuggestions.push(stripped);
    }

    if (w.endsWith("化") || w.endsWith("性")) {
      const stripped = w.slice(0, -1);
      if (CHINESE_COMMON_WORDS.has(stripped)) wordSuggestions.push(stripped);
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => CHINESE_COMMON_WORDS.has(v));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 15. Arabic Lemmatization
  else if (lang.startsWith("ar") || lang.startsWith("ara") || lang === "арабский" || lang === "العربية" || lang === "arabic") {
    const wordSuggestions: string[] = [];

    const normW = normalizeArabic(w);

    // Safeguard 1: Direct irregulars & protected lookup
    if (ARABIC_IRREGULARS[w] || ARABIC_IRREGULARS[normW]) {
      if (ARABIC_IRREGULARS[w]) suggestions.push(...ARABIC_IRREGULARS[w]);
      if (ARABIC_IRREGULARS[normW]) suggestions.push(...ARABIC_IRREGULARS[normW]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Dictionary Protection
    if (ARABIC_COMMON_WORDS.has(w) || ARABIC_COMMON_WORDS.has(normW)) {
      suggestions.push(ARABIC_COMMON_WORDS.has(w) ? w : normW);
      return suggestions;
    }

    const candidateBases = new Set<string>([w, normW]);

    const prefixes = [
      "وبال", "وفال", "وكال", "ولل", "وسيك", "وسيت",
      "بال", "فال", "كال", "لل", "وال", "وس", "وف", "وب", "ول",
      "ال", "سي", "ست", "سن", "سا", "س"
    ];

    const suffixes = [
      "هما", "هم", "هن", "كم", "كن", "نا",
      "ها", "هو", "هم", "كي", "كا", "ني",
      "ان", "ين", "ون", "ات", "تا", "تي",
      "ه", "ك", "ي", "ة", "ت"
    ];

    for (const base of Array.from(candidateBases)) {
      let strippedPrefix = base;
      for (const pref of prefixes) {
        if (base.startsWith(pref) && base.length > pref.length + 1) {
          strippedPrefix = base.slice(pref.length);
          wordSuggestions.push(strippedPrefix);
          break;
        }
      }

      for (const candidate of [base, strippedPrefix]) {
        for (const suff of suffixes) {
          if (candidate.endsWith(suff) && candidate.length > suff.length + 1) {
            const strippedSuff = candidate.slice(0, -suff.length);
            wordSuggestions.push(strippedSuff);

            if (suff.startsWith("ت") || suff === "ي" || suff === "ها" || suff === "ك" || suff === "ه") {
              wordSuggestions.push(strippedSuff + "ة");
            }
          }
        }
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => ARABIC_COMMON_WORDS.has(v) || ARABIC_COMMON_WORDS.has(normalizeArabic(v)));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 16. Korean Lemmatization
  else if (lang.startsWith("ko") || lang.startsWith("kor") || lang === "корейский" || lang === "한국어" || lang === "korean") {
    const wordSuggestions: string[] = [];

    // Strip preceding negation modifiers (안, 못)
    let baseWord = w;
    if (baseWord.startsWith("안 ") || baseWord.startsWith("못 ")) {
      baseWord = baseWord.slice(2);
    }

    // Safeguard 1: Direct irregular / conjugated form mapping
    if (KOREAN_IRREGULARS[w] || KOREAN_IRREGULARS[baseWord]) {
      if (KOREAN_IRREGULARS[w]) suggestions.push(...KOREAN_IRREGULARS[w]);
      if (KOREAN_IRREGULARS[baseWord]) suggestions.push(...KOREAN_IRREGULARS[baseWord]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (KOREAN_COMMON_WORDS.has(w) || KOREAN_COMMON_WORDS.has(baseWord)) {
      suggestions.push(KOREAN_COMMON_WORDS.has(w) ? w : baseWord);
      return suggestions;
    }

    // Safeguard 3: Josa & Verbal Ending Stripping
    const josaList = [
      "에서부터", "에서", "에게서", "한테서",
      "에게", "한테", "으로", "부터", "까지", "하고", "이랑",
      "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "랑", "들"
    ];

    for (const josa of josaList) {
      if (baseWord.endsWith(josa) && baseWord.length > josa.length) {
        const strippedNoun = baseWord.slice(0, -josa.length);
        if (KOREAN_COMMON_WORDS.has(strippedNoun)) {
          wordSuggestions.push(strippedNoun);
        }
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => KOREAN_COMMON_WORDS.has(v));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 17. Turkish Lemmatization (Fast Path + Headword + AI Lemma Cache Architecture)
  else if (lang.startsWith("tr") || lang.startsWith("tur") || lang === "турецкий" || lang === "türkçe" || lang === "turkish") {
    const rawWord = word.trim();

    if (TURKISH_IRREGULARS[w] || TURKISH_IRREGULARS[rawWord]) {
      const irRes = TURKISH_IRREGULARS[w] || TURKISH_IRREGULARS[rawWord];
      suggestions.push(...irRes);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (TURKISH_COMMON_VERBS.has(w) || TURKISH_COMMON_VERBS.has(rawWord)) {
      suggestions.push(w);
      return suggestions;
    }

    suggestions.push(rawWord);
  }

  // 18. Hindi Lemmatization
  else if (lang.startsWith("hi") || lang.startsWith("hin") || lang === "хинди" || lang === "हिंदी" || lang === "हिन्दी" || lang === "hindi") {
    const wordSuggestions: string[] = [];
    const nfcW = w.normalize("NFC");

    // Safeguard 1: Direct irregular / auxiliary verb lookup
    if (HINDI_IRREGULARS[w] || HINDI_IRREGULARS[nfcW]) {
      if (HINDI_IRREGULARS[w]) suggestions.push(...HINDI_IRREGULARS[w]);
      if (HINDI_IRREGULARS[nfcW]) suggestions.push(...HINDI_IRREGULARS[nfcW]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (HINDI_COMMON_WORDS.has(w) || HINDI_COMMON_WORDS.has(nfcW)) {
      suggestions.push(HINDI_COMMON_WORDS.has(w) ? w : nfcW);
      return suggestions;
    }

    // Safeguard 3: Noun Plural / Oblique & Verb Participle Suffix Stripping
    const verbSuffixes = [
      { ending: "ऊँगा", repl: "ना" },
      { ending: "ऊँगी", repl: "ना" },
      { ending: "एगा", repl: "ना" },
      { ending: "एगी", repl: "ना" },
      { ending: "ेंगे", repl: "ना" },
      { ending: "ओगे", repl: "ना" },
      { ending: "ता", repl: "ना" },
      { ending: "ती", repl: "ना" },
      { ending: "ते", repl: "ना" },
      { ending: "तीं", repl: "ना" },
      { ending: "कर", repl: "ना" },
      { ending: "ने", repl: "ना" }
    ];

    for (const rule of verbSuffixes) {
      if (w.endsWith(rule.ending) && w.length > rule.ending.length) {
        const stem = w.slice(0, -rule.ending.length);
        const candidateInfinitive = stem + rule.repl;
        if (HINDI_COMMON_WORDS.has(candidateInfinitive)) {
          wordSuggestions.push(candidateInfinitive);
        }
      }
    }

    const nounSuffixes = ["ियों", "ियाँ", "ों", "एं", "ें", "े"];
    for (const suff of nounSuffixes) {
      if (w.endsWith(suff) && w.length > suff.length) {
        const stem = w.slice(0, -suff.length);
        wordSuggestions.push(stem);
        wordSuggestions.push(stem + "ा");
        wordSuggestions.push(stem + "ी");
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => HINDI_COMMON_WORDS.has(v));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 19. Hebrew Lemmatization
  else if (lang.startsWith("he") || lang.startsWith("heb") || lang === "иврит" || lang === "עברית" || lang === "hebrew") {
    const wordSuggestions: string[] = [];
    const normW = normalizeHebrew(w);

    // Safeguard 1: Direct irregular / weak verb lookup
    if (HEBREW_IRREGULARS[w] || HEBREW_IRREGULARS[normW]) {
      if (HEBREW_IRREGULARS[w]) suggestions.push(...HEBREW_IRREGULARS[w]);
      if (HEBREW_IRREGULARS[normW]) suggestions.push(...HEBREW_IRREGULARS[normW]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (HEBREW_COMMON_WORDS.has(w) || HEBREW_COMMON_WORDS.has(normW)) {
      suggestions.push(HEBREW_COMMON_WORDS.has(w) ? w : normW);
      return suggestions;
    }

    // Present tense Binyanim verb participle to infinitive resolution (מ -> ל, מת -> להת)
    for (const term of [w, normW]) {
      if (term.startsWith("מת") && term.length > 3) {
        const infCand = "להת" + term.slice(2);
        if (HEBREW_COMMON_WORDS.has(infCand)) wordSuggestions.push(infCand);
      } else if (term.startsWith("מ") && term.length > 2) {
        const infCand1 = "ל" + term.slice(1);
        const infCand2 = "לה" + term.slice(1);
        if (HEBREW_COMMON_WORDS.has(infCand1)) wordSuggestions.push(infCand1);
        if (HEBREW_COMMON_WORDS.has(infCand2)) wordSuggestions.push(infCand2);
      }
    }

    // Safeguard 3: Iterative Prefix Unwinding Queue (Left to Right: ו -> כ/ש -> ה)
    const prefixes = [
      "וכש", "ושה", "ומ", "וב", "ול", "וכ", "שה", "ובה", "ולה", "ומה",
      "ה", "ו", "ב", "כ", "ל", "מ", "ש"
    ];

    const suffixes = [
      "יהם", "יהן", "ינו", "יך", "יכם", "יכן", "יו", "יה",
      "ים", "ות", "תי", "נו", "תם", "תן", "ת", "י", "ו", "ה", "ם", "ן"
    ];

    let currentQueue = [w, normW];
    const visited = new Set<string>([w, normW]);

    for (let pass = 0; pass < 3; pass++) {
      const nextQueue: string[] = [];

      for (const baseWord of currentQueue) {
        let strippedPrefix = baseWord;
        for (const pref of prefixes) {
          if (baseWord.startsWith(pref) && baseWord.length > pref.length + 1) {
            strippedPrefix = baseWord.slice(pref.length);
            wordSuggestions.push(strippedPrefix);

            if (!visited.has(strippedPrefix)) {
              visited.add(strippedPrefix);
              nextQueue.push(strippedPrefix);
            }
            break;
          }
        }

        for (const candidate of [baseWord, strippedPrefix]) {
          for (const suff of suffixes) {
            if (candidate.endsWith(suff) && candidate.length > suff.length + 1) {
              const strippedSuff = candidate.slice(0, -suff.length);
              wordSuggestions.push(strippedSuff);

              if (suff.startsWith("ת") || suff === "י" || suff === "ה" || suff === "ו") {
                wordSuggestions.push(strippedSuff + "ה");
              }
            }
          }
        }
      }

      if (nextQueue.length === 0) break;
      currentQueue = nextQueue;
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => HEBREW_COMMON_WORDS.has(v) || HEBREW_COMMON_WORDS.has(normalizeHebrew(v)));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 20. Greek Lemmatization
  else if (lang.startsWith("el") || lang.startsWith("gre") || lang.startsWith("ell") || lang === "греческий" || lang === "ελληνικά" || lang === "greek") {
    const wordSuggestions: string[] = [];
    const unaccentedW = stripGreekAccents(w);

    // Safeguard 1: Direct irregular verb / noun lookup
    if (GREEK_IRREGULARS[w] || GREEK_IRREGULARS[unaccentedW]) {
      if (GREEK_IRREGULARS[w]) suggestions.push(...GREEK_IRREGULARS[w]);
      if (GREEK_IRREGULARS[unaccentedW]) suggestions.push(...GREEK_IRREGULARS[unaccentedW]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (GREEK_COMMON_VERBS.has(w) || GREEK_COMMON_VERBS.has(unaccentedW)) {
      suggestions.push(GREEK_COMMON_VERBS.has(w) ? w : unaccentedW);
      return suggestions;
    }

    // Safeguard 3: Noun Declension & Verb Conjugation Suffix Stripping
    const nounSuffixes = [
      { ending: "ους", repl: "ος" },
      { ending: "ων", repl: "ος" },
      { ending: "οι", repl: "ος" },
      { ending: "ου", repl: "ος" },
      { ending: "ο", repl: "ος" },
      { ending: "ες", repl: "α" },
      { ending: "ας", repl: "α" },
      { ending: "ες", repl: "η" },
      { ending: "ης", repl: "η" },
      { ending: "ια", repl: "ι" },
      { ending: "ιά", repl: "ί" },
      { ending: "ματα", repl: "μα" }
    ];

    for (const item of [w, unaccentedW]) {
      for (const rule of nounSuffixes) {
        if (item.endsWith(rule.ending) && item.length > rule.ending.length) {
          const stem = item.slice(0, -rule.ending.length);
          const cand = stem + rule.repl;
          wordSuggestions.push(cand);
        }
      }
    }

    const verbSuffixes = ["αμε", "ατε", "αν", "ες", "α", "οντας", "εται", "εσαι", "ομαι"];
    for (const item of [w, unaccentedW]) {
      for (const suff of verbSuffixes) {
        if (item.endsWith(suff) && item.length > suff.length + 1) {
          const stem = item.slice(0, -suff.length);
          let cleanStem = stem;
          if (cleanStem.startsWith("έ") || cleanStem.startsWith("ε")) {
            cleanStem = cleanStem.slice(1);
          }
          wordSuggestions.push(cleanStem + "ω");
          wordSuggestions.push(stem + "ω");
        }
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => GREEK_COMMON_VERBS.has(v) || GREEK_COMMON_VERBS.has(stripGreekAccents(v)));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 21. Finnish Lemmatization (Fast Path + Headword + AI Lemma Cache Architecture)
  else if (lang.startsWith("fi") || lang.startsWith("fin") || lang === "финский" || lang === "suomi" || lang === "finnish") {
    const rawWord = word.trim();

    if (FINNISH_IRREGULARS[w] || FINNISH_IRREGULARS[rawWord]) {
      const irRes = FINNISH_IRREGULARS[w] || FINNISH_IRREGULARS[rawWord];
      suggestions.push(...irRes);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (FINNISH_COMMON_VERBS.has(w) || FINNISH_COMMON_VERBS.has(rawWord)) {
      suggestions.push(w);
      return suggestions;
    }

    suggestions.push(rawWord);
  }

  // 22. Hungarian Lemmatization (Fast Path + Headword + AI Lemma Cache Architecture)
  else if (lang.startsWith("hu") || lang.startsWith("hun") || lang === "венгерский" || lang === "magyar" || lang === "hungarian") {
    const rawWord = word.trim();

    if (HUNGARIAN_IRREGULARS[w] || HUNGARIAN_IRREGULARS[rawWord]) {
      const irRes = HUNGARIAN_IRREGULARS[w] || HUNGARIAN_IRREGULARS[rawWord];
      suggestions.push(...irRes);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    if (HUNGARIAN_COMMON_VERBS.has(w) || HUNGARIAN_COMMON_VERBS.has(rawWord)) {
      suggestions.push(w);
      return suggestions;
    }

    suggestions.push(rawWord);
  }

  // 23. Czech Lemmatization
  else if (lang.startsWith("cs") || lang.startsWith("cze") || lang.startsWith("ces") || lang === "чешский" || lang === "čeština" || lang === "czech") {
    const wordSuggestions: string[] = [];
    let base = w;

    if (w.endsWith(" se") && w.length > 3) {
      base = w.slice(0, -3);
    } else if (w.endsWith(" si") && w.length > 3) {
      base = w.slice(0, -3);
    }

    // Safeguard 1: Direct irregular verb / noun lookup
    if (CZECH_IRREGULARS[w] || CZECH_IRREGULARS[base]) {
      if (CZECH_IRREGULARS[w]) suggestions.push(...CZECH_IRREGULARS[w]);
      if (CZECH_IRREGULARS[base]) suggestions.push(...CZECH_IRREGULARS[base]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (CZECH_COMMON_VERBS.has(w) || CZECH_COMMON_VERBS.has(base)) {
      suggestions.push(CZECH_COMMON_VERBS.has(w) ? w : base);
      return suggestions;
    }

    // Safeguard 3: Noun Case & Verb Conjugation Suffix Stripping
    const suffixes = [
      "ovi", "em", "ům", "ách", "ích", "ou", "ech", "am", "ut", "et", "at",
      "ch", "ou", "ce", "ze", "že", "še", "te", "st", "l", "la", "lo", "li", "le",
      "í", "u", "e", "y", "a", "o"
    ];

    for (const suff of suffixes) {
      if (base.endsWith(suff) && base.length > suff.length + 1) {
        const stem = base.slice(0, -suff.length);
        wordSuggestions.push(stem);

        wordSuggestions.push(stem + "t");
        wordSuggestions.push(stem + "at");
        wordSuggestions.push(stem + "ět");
        wordSuggestions.push(stem + "it");

        if (stem.endsWith("č")) wordSuggestions.push(stem.slice(0, -1) + "c");
        if (stem.endsWith("ž")) wordSuggestions.push(stem.slice(0, -1) + "z");
        if (stem.endsWith("š")) wordSuggestions.push(stem.slice(0, -1) + "s");
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => CZECH_COMMON_VERBS.has(v));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 24. Romanian Lemmatization
  else if (lang.startsWith("ro") || lang.startsWith("rum") || lang.startsWith("ron") || lang === "румынский" || lang === "română" || lang === "romanian") {
    const wordSuggestions: string[] = [];
    let base = w;

    if (w.startsWith("să ") && w.length > 3) {
      base = w.slice(3);
    }

    // Safeguard 1: Direct irregular verb / noun lookup
    if (ROMANIAN_IRREGULARS[w] || ROMANIAN_IRREGULARS[base]) {
      if (ROMANIAN_IRREGULARS[w]) suggestions.push(...ROMANIAN_IRREGULARS[w]);
      if (ROMANIAN_IRREGULARS[base]) suggestions.push(...ROMANIAN_IRREGULARS[base]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (ROMANIAN_COMMON_VERBS.has(w) || ROMANIAN_COMMON_VERBS.has(base)) {
      suggestions.push(ROMANIAN_COMMON_VERBS.has(w) ? w : base);
      return suggestions;
    }

    // Safeguard 3: Enclitic Article & Verb Conjugation Suffix Stripping
    const suffixes = [
      "ului", "ilor", "ilor", "ul", "le", "ua", "lor", "ea", "ia",
      "am", "ai", "at", "au", "ind", "ând", "esc", "ești", "este", "i", "e", "a"
    ];

    for (const suff of suffixes) {
      if (base.endsWith(suff) && base.length > suff.length + 1) {
        const stem = base.slice(0, -suff.length);
        wordSuggestions.push(stem);
        wordSuggestions.push("a " + stem);

        wordSuggestions.push("a " + stem + "a");
        wordSuggestions.push("a " + stem + "e");
        wordSuggestions.push("a " + stem + "i");
        wordSuggestions.push(stem + "ă");
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => ROMANIAN_COMMON_VERBS.has(v));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  }

  // 25. Vietnamese Lemmatization
  else if (lang.startsWith("vi") || lang.startsWith("vie") || lang === "вьетнамский" || lang === "tiếng việt" || lang === "vietnamese") {
    const nfcW = w.normalize("NFC");

    // Safeguard 1: Direct irregular / particle lookup
    if (VIETNAMESE_IRREGULARS[w] || VIETNAMESE_IRREGULARS[nfcW]) {
      if (VIETNAMESE_IRREGULARS[w]) suggestions.push(...VIETNAMESE_IRREGULARS[w]);
      if (VIETNAMESE_IRREGULARS[nfcW]) suggestions.push(...VIETNAMESE_IRREGULARS[nfcW]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (VIETNAMESE_COMMON_WORDS.has(w) || VIETNAMESE_COMMON_WORDS.has(nfcW)) {
      suggestions.push(VIETNAMESE_COMMON_WORDS.has(w) ? w : nfcW);
      return suggestions;
    }

    // Safeguard 3: Clean canonical NFC return
    suggestions.push(nfcW);
  }

  // 26. Persian / Farsi Lemmatization
  else if (lang.startsWith("fa") || lang.startsWith("fas") || lang.startsWith("per") || lang === "персидский" || lang === "фарسی" || lang === "persian" || lang === "farsi") {
    const wordSuggestions: string[] = [];
    const normW = normalizePersian(w);

    // Safeguard 1: Direct irregular verb / noun lookup
    if (PERSIAN_IRREGULARS[w] || PERSIAN_IRREGULARS[normW]) {
      if (PERSIAN_IRREGULARS[w]) suggestions.push(...PERSIAN_IRREGULARS[w]);
      if (PERSIAN_IRREGULARS[normW]) suggestions.push(...PERSIAN_IRREGULARS[normW]);
      return Array.from(new Set(suggestions)).filter(s => s !== w);
    }

    // Safeguard 2: Direct Headword Protection
    if (PERSIAN_COMMON_WORDS.has(w) || PERSIAN_COMMON_WORDS.has(normW)) {
      suggestions.push(PERSIAN_COMMON_WORDS.has(w) ? w : normW);
      return suggestions;
    }

    // Safeguard 3: Present Tense Prefix (می) & Past/Plural/Possessive Suffix Stripping
    let base = normW;
    if (base.startsWith("می")) {
      base = base.slice(2);
    }

    const suffixes = [
      "هایم", "هایت", "هایش", "هایمان", "هایتان", "هایشان",
      "ها", "ان", "ات", "ام", "ای", "ایم", "اید", "اند",
      "مان", "تان", "شان", "م", "ت", "ش"
    ];

    for (const suff of suffixes) {
      if (base.endsWith(suff) && base.length > suff.length + 1) {
        const stem = base.slice(0, -suff.length);
        wordSuggestions.push(stem);

        wordSuggestions.push(stem + "دن");
        wordSuggestions.push(stem + "تن");
        wordSuggestions.push(stem + "یدن");
        wordSuggestions.push(stem + "اندن");
      }
    }

    const validWords = Array.from(new Set(wordSuggestions)).filter(v => PERSIAN_COMMON_WORDS.has(v) || PERSIAN_COMMON_WORDS.has(normalizePersian(v)));
    if (validWords.length > 0) {
      suggestions.push(...validWords);
    }
  } else {
    suggestions.push(w);
  }

  // Post-process: unique values, filter out target word, strip empty values, normalize length
  let unique = Array.from(new Set(suggestions))
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  // If unique contains w alongside other suggestions, filter out w so we show lemmas first.
  // But if unique ONLY contains w (e.g. Headword Protection for Қазақстан, Астана), keep w!
  if (unique.includes(w)) {
    const withoutW = unique.filter((s) => s !== w);
    if (withoutW.length > 0) {
      unique = withoutW;
    }
  }

  // Level 3 — Homonym control (Spanish only)
  if (lang.startsWith("es") || lang.startsWith("spa") || lang === "испанский" || lang === "spanish") {
    // Exclude: function words that accidentally match verb patterns (ya→ir, sin→ser, etc.)
    if (SPANISH_HOMONYM_EXCLUDE.has(w)) {
      return [];
    }
    // Priority: reorder/deduplicate suggestions for ambiguous verb forms (ve → [ver, ir])
    if (SPANISH_HOMONYM_PRIORITY[w]) {
      const prioritized = SPANISH_HOMONYM_PRIORITY[w].filter((p) => unique.includes(p));
      const rest = unique.filter((u) => !SPANISH_HOMONYM_PRIORITY[w].includes(u));
      unique = [...prioritized, ...rest];
    }
  }

  return unique;
}
