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

interface VerbEndingRule {
  ending: string;
  infinitives: string[];
}

const ENGLISH_IRREGULARS: Record<string, string[]> = englishIrregularsJson;
const SPANISH_IRREGULARS: Record<string, string[]> = spanishIrregularsJson;
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

export function getSuggestedLemmas(word: string, targetLanguage: string): string[] {
  if (!word) return [];
  const w = word.trim().toLowerCase();
  if (w.length <= 1) return [];

  const lang = (targetLanguage || "").toLowerCase().trim();
  const suggestions: string[] = [];

  // 1. English Lemmatization (via compromise + ENGLISH_IRREGULARS override)
  if (lang.startsWith("en") || lang === "английский" || lang === "english") {
    // Priority 1: our hand-curated irregulars dictionary (covers edge-cases compromise misses)
    if (ENGLISH_IRREGULARS[w]) {
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
              generatedVerbs.push(sVar + inf);
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

      if (!foundCommonVerb && matchedRulesData.length > 0) {
        const primaryMatch = matchedRulesData[0];
        const rule = primaryMatch.rule;
        const stem = primaryMatch.stem;

        if (SPANISH_HIGH_CONFIDENCE_ENDINGS.has(rule.ending)) {
          for (const v of primaryMatch.generatedVerbs) {
            pushVerbSuggestion(v);
          }
        } else if (!primaryMatch.foundIrregular && nounAdjSuggestions.length === 0) {
          if (rule.ending === "a") {
            pushVerbSuggestion(stem + "ar");
          } else {
            for (const inf of rule.infinitives) {
              pushVerbSuggestion(stem + inf);
            }
          }
        }
      }
    }

    // Merge suggestions, placing verbs first
    suggestions.push(...verbSuggestions);
    suggestions.push(...nounAdjSuggestions.map(s => restoreSpanishAccents(s, w)));
  }

  // 3. French Lemmatization
  else if (lang.startsWith("fr") || lang.startsWith("fre") || lang === "французский" || lang === "french") {
    // Plurals
    if (w.endsWith("aux") && w.length > 4) {
      suggestions.push(w.slice(0, -3) + "al");
    } else if (w.endsWith("x") && w.length > 2) {
      suggestions.push(w.slice(0, -1));
    } else if (w.endsWith("s") && w.length > 2) {
      suggestions.push(w.slice(0, -1));
    }

    // Adjectives
    if (w.endsWith("es") && w.length > 3) {
      suggestions.push(w.slice(0, -2));
    } else if (w.endsWith("e") && w.length > 2) {
      suggestions.push(w.slice(0, -1));
    }

    // Conjugation guess
    if (w.endsWith("ant") && w.length > 4) {
      suggestions.push(w.slice(0, -3) + "er");
      suggestions.push(w.slice(0, -3) + "ir");
      suggestions.push(w.slice(0, -3) + "re");
    } else if (w.endsWith("er") || w.endsWith("ez") || w.endsWith("é")) {
      suggestions.push(w.slice(0, -2) + "er");
    } else if (w.endsWith("ait") || w.endsWith("ais") || w.endsWith("ait")) {
      suggestions.push(w.slice(0, -3) + "er");
    }
  }

  // 4. German Lemmatization
  else if (lang.startsWith("de") || lang.startsWith("ger") || lang === "немецкий" || lang === "german") {
    // Plurals & Case
    if (w.endsWith("en") && w.length > 3) {
      suggestions.push(w.slice(0, -2));
      suggestions.push(w.slice(0, -1)); // e.g. Katze -> Katzen
    } else if (w.endsWith("ern") && w.length > 4) {
      suggestions.push(w.slice(0, -3) + "er");
    } else if (w.endsWith("er") && w.length > 3) {
      suggestions.push(w.slice(0, -2));
    } else if (w.endsWith("e") && w.length > 2) {
      suggestions.push(w.slice(0, -1));
    } else if (w.endsWith("s") && w.length > 2) {
      suggestions.push(w.slice(0, -1));
    }

    // Verbs
    if (w.endsWith("te") || w.endsWith("ten") || w.endsWith("test") || w.endsWith("tet")) {
      suggestions.push(w.slice(0, -2) + "en");
      suggestions.push(w.slice(0, -3) + "en");
      suggestions.push(w.slice(0, -4) + "en");
    } else if (w.endsWith("t") && w.length > 2) {
      suggestions.push(w.slice(0, -1) + "en");
    } else if (w.startsWith("ge") && w.endsWith("t") && w.length > 4) {
      suggestions.push(w.slice(2, -1) + "en");
    } else if (w.startsWith("ge") && w.endsWith("en") && w.length > 5) {
      suggestions.push(w.slice(2));
    }

    // Attempt Umlaut reversion for suggestions
    const reverted = w
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u");
    if (reverted !== w) {
      suggestions.push(reverted);
      if (reverted.endsWith("er")) {
        suggestions.push(reverted.slice(0, -2));
      }
    }
  }

  // 5. Japanese Lemmatization
  else if (lang.startsWith("ja") || lang.startsWith("jap") || lang === "японский" || lang === "japanese") {
    // Verbs
    if (w.endsWith("ている")) {
      suggestions.push(w.slice(0, -3));
      suggestions.push(w.slice(0, -3) + "う");
    } else if (w.endsWith("て")) {
      suggestions.push(w.slice(0, -1) + "る");
      suggestions.push(w.slice(0, -1) + "う");
    } else if (w.endsWith("ました")) {
      suggestions.push(w.slice(0, -3) + "ます");
    } else if (w.endsWith("ます")) {
      suggestions.push(w.slice(0, -2) + "る");
      suggestions.push(w.slice(0, -2) + "う");
    } else if (w.endsWith("ない")) {
      suggestions.push(w.slice(0, -2) + "る");
      suggestions.push(w.slice(0, -2) + "う");
    } else if (w.endsWith("かった")) {
      suggestions.push(w.slice(0, -3) + "い"); // e.g. 寒かった -> 寒い
    } else if (w.endsWith("くない")) {
      suggestions.push(w.slice(0, -3) + "い"); // e.g. 寒くない -> 寒い
    }
  }

  // 6. Ukrainian Lemmatization
  else if (lang.startsWith("uk") || lang.startsWith("ukr") || lang === "украинский" || lang === "українська" || lang === "український") {
    // Handle reflexive verbs ending in -ся / -сь
    let base = w;
    let isReflexive = false;
    if (w.endsWith("ся") && w.length > 3) {
      base = w.slice(0, -2);
      isReflexive = true;
    } else if (w.endsWith("сь") && w.length > 2) {
      base = w.slice(0, -1);
      isReflexive = true;
    }

    const baseSuggestions: string[] = [];
    const addSugg = (s: string) => {
      if (!s || s.length <= 1) return;
      baseSuggestions.push(s);
      if (isReflexive) {
        baseSuggestions.push(s + "ся");
      }
    };

    // Add original base itself (without reflexive)
    addSugg(base);

    // Adjectives: Oblique case endings -> change to -ий or -ій
    const adjEndings = ["ого", "ому", "им", "ім", "ої", "ій", "ою", "ею", "єю", "их", "ми", "ими", "а", "я", "е", "є", "і"];
    for (const ending of adjEndings) {
      if (base.endsWith(ending) && base.length > ending.length) {
        const stem = base.slice(0, -ending.length);
        addSugg(stem + "ий");
        addSugg(stem + "ій");
      }
    }

    // Verbs: Past tense
    if (base.endsWith("ла") && base.length > 3) {
      addSugg(base.slice(0, -2) + "ти");
    } else if (base.endsWith("ло") && base.length > 3) {
      addSugg(base.slice(0, -2) + "ти");
    } else if (base.endsWith("ли") && base.length > 3) {
      addSugg(base.slice(0, -2) + "ти");
    } else if (base.endsWith("в") && base.length > 2) {
      addSugg(base.slice(0, -1) + "ти");
    }

    // Verbs: Present/Future tense personal endings
    const verbEndings = [
      { ending: "ємо", repl: ["ти"] },
      { ending: "ете", repl: ["ти"] },
      { ending: "ють", repl: ["ти"] },
      { ending: "емо", repl: ["ти", "ати", "ити"] },
      { ending: "ете", repl: ["ти", "ати", "ити"] },
      { ending: "уть", repl: ["ти", "ати", "ити"] },
      { ending: "єш", repl: ["ти"] },
      { ending: "еш", repl: ["ти", "ати", "ити"] },
      { ending: "є", repl: ["ти"] },
      { ending: "е", repl: ["ти", "ати", "ити"] },
      { ending: "иш", repl: ["ити", "ти"] },
      { ending: "ить", repl: ["ити", "ти"] },
      { ending: "имо", repl: ["ити", "ти"] },
      { ending: "ите", repl: ["ити", "ти"] },
      { ending: "ять", repl: ["ити", "яти", "ти"] },
      { ending: "ать", repl: ["ати", "ити", "ти"] }
    ];

    for (const rule of verbEndings) {
      if (base.endsWith(rule.ending) && base.length > rule.ending.length) {
        const stem = base.slice(0, -rule.ending.length);
        for (const r of rule.repl) {
          addSugg(stem + r);
        }
      }
    }

    // Nouns: Common oblique/plural endings
    const nounEndings = [
      "ові", "еві", "єві", 
      "ом", "ем", "єм", 
      "ами", "ями", "ах", "ях", 
      "ів", "ей", "ам", "ям", 
      "у", "ю", "а", "я", "е", "є", "и", "і"
    ];
    for (const ending of nounEndings) {
      if (base.endsWith(ending) && base.length > ending.length) {
        const stem = base.slice(0, -ending.length);
        
        // Suggest basic nominative candidates
        addSugg(stem);
        addSugg(stem + "ь");
        addSugg(stem + "я");
        addSugg(stem + "о");
        addSugg(stem + "е");

        // Special exceptions (fill vowels)
        if (stem === "дн") addSugg("день");
        if (stem === "льв") addSugg("лев");
        if (stem === "отц") addSugg("отець");
        if (stem === "вс") addSugg("весь");

        // Vowel alternation: o/e -> i in closed syllables
        // e.g. стола -> stem "стол" -> "стіл"
        // e.g. коня -> stem "кон" -> "кін" + "ь" = "кінь"
        // e.g. ночі -> stem "ноч" -> "ніч"
        const match = stem.match(/([ое])([^аеєиіїоуюяь' ]{1,2})$/i);
        if (match) {
          const vowel = match[1];
          const idx = stem.lastIndexOf(vowel);
          const alternated = stem.substring(0, idx) + "і" + stem.substring(idx + 1);
          addSugg(alternated);
          addSugg(alternated + "ь");
        }
      }
    }

    suggestions.push(...baseSuggestions);
  }

  // 6. Kazakh Lemmatization
  else if (lang.startsWith("kk") || lang.startsWith("kaz") || lang === "казахский" || lang === "қазақша" || lang === "қазақ тілі") {
    const baseSuggestions: string[] = [];

    const makeKazakhInfinitive = (stem: string): string => {
      if (!stem || stem.length <= 1) return "";
      if (stem.endsWith("йы") || stem.endsWith("йі")) {
        return stem.slice(0, -2) + "ю";
      }
      if (stem.endsWith("ы") || stem.endsWith("і")) {
        return stem.slice(0, -1) + "у";
      }
      return stem + "у";
    };

    const addSugg = (s: string) => {
      if (!s || s.length <= 1) return;
      if (!baseSuggestions.includes(s)) {
        baseSuggestions.push(s);
      }

      // Consonant alternation (restoring voiceless stops):
      // If a suffix starting with a vowel is added, final (қ, к, п) becomes voiced (ғ, г, б).
      // We suggest both the original stem and the alternate with restored voiceless consonant.
      if (s.endsWith("ғ")) {
        const alt = s.slice(0, -1) + "қ";
        if (!baseSuggestions.includes(alt)) baseSuggestions.push(alt);
      } else if (s.endsWith("г")) {
        const alt = s.slice(0, -1) + "к";
        if (!baseSuggestions.includes(alt)) baseSuggestions.push(alt);
      } else if (s.endsWith("б")) {
        const alt = s.slice(0, -1) + "п";
        if (!baseSuggestions.includes(alt)) baseSuggestions.push(alt);
      }
    };

    // Strip suffixes sequentially from right to left
    let current = w;
    addSugg(current);

    // Pass 1: Personal (predicative) endings
    const personalEndings = [
      "сыздар", "сіздер", "сыңдар", "сіңдер",
      "мын", "мін", "бын", "бін", "пын", "пін",
      "сыз", "сіз", "сың", "сің",
      "мыз", "міз", "быз", "біз", "пыз", "піз"
    ];
    for (const end of personalEndings) {
      if (current.endsWith(end) && current.length > end.length) {
        current = current.slice(0, -end.length);
        addSugg(current);
        break;
      }
    }

    // Pass 2: Case endings
    const caseEndings = [
      "менен", "бенен", "пенен",
      "дың", "дің", "тың", "тің", "ның", "нің",
      "дан", "ден", "тан", "тен", "нан", "нен",
      "мен", "бен", "пен",
      "нда", "нде",
      "ға", "ге", "қа", "ке", "на", "не",
      "да", "де", "та", "те",
      "ды", "ді", "ты", "ті", "ны", "ні", "н", "а", "е"
    ];
    for (const end of caseEndings) {
      if (current.endsWith(end) && current.length > end.length) {
        current = current.slice(0, -end.length);
        addSugg(current);
        break;
      }
    }

    // Pass 3: Possessive endings
    const possessiveEndings = [
      "ымыздар", "іміздер", "ыңыздар", "іңіздер",
      "ыңыз", "іңіз", "ыңдар", "іңдер",
      "ымыз", "іміз",
      "ым", "ім", "ың", "ің",
      "сы", "сі", "ы", "і", "м"
    ];
    for (const end of possessiveEndings) {
      if (current.endsWith(end) && current.length > end.length) {
        current = current.slice(0, -end.length);
        addSugg(current);
        break;
      }
    }

    // Pass 4: Plural endings
    const pluralEndings = ["лар", "лер", "дар", "дер", "тар", "тер"];
    for (const end of pluralEndings) {
      if (current.endsWith(end) && current.length > end.length) {
        current = current.slice(0, -end.length);
        addSugg(current);
        break;
      }
    }

    // Pass 5: Verb tense, voice and participle suffixes
    const verbSuffixes = [
      "атын", "етін", "йтін",
      "ған", "ген", "қан", "кен",
      "мақ", "мек", "бақ", "бек", "пақ", "пек",
      "ар", "ер", "ып", "іп", "са", "се",
      "ма", "ме", "ба", "бе", "па", "пе", "р", "п"
    ];
    for (const end of verbSuffixes) {
      if (current.endsWith(end) && current.length > end.length) {
        current = current.slice(0, -end.length);
        addSugg(current);
        break;
      }
    }

    // Suggest infinitives for all generated stems
    const infinitiveSuggestions: string[] = [];
    for (const stem of baseSuggestions) {
      const inf = makeKazakhInfinitive(stem);
      if (inf) {
        infinitiveSuggestions.push(inf);
        // Restored voiceless consonant infs:
        if (stem.endsWith("ғ")) {
          const infAlt = makeKazakhInfinitive(stem.slice(0, -1) + "қ");
          if (infAlt && !infinitiveSuggestions.includes(infAlt)) infinitiveSuggestions.push(infAlt);
        } else if (stem.endsWith("г")) {
          const infAlt = makeKazakhInfinitive(stem.slice(0, -1) + "к");
          if (infAlt && !infinitiveSuggestions.includes(infAlt)) infinitiveSuggestions.push(infAlt);
        } else if (stem.endsWith("б")) {
          const infAlt = makeKazakhInfinitive(stem.slice(0, -1) + "п");
          if (infAlt && !infinitiveSuggestions.includes(infAlt)) infinitiveSuggestions.push(infAlt);
        }
      }
    }

    for (const inf of infinitiveSuggestions) {
      if (!baseSuggestions.includes(inf)) {
        baseSuggestions.push(inf);
      }
    }

    suggestions.push(...baseSuggestions);
  }

  // 7. Portuguese Lemmatization
  else if (lang.startsWith("pt") || lang.startsWith("por") || lang === "португальский" || lang === "portuguese") {
    const verbSuggestions: string[] = [];
    const nounAdjSuggestions: string[] = [];

    const candidates = getPortugueseEncliticCandidates(w);

    for (let cand of Array.from(new Set(candidates))) {
      if (cand.endsWith("ar") || cand.endsWith("er") || cand.endsWith("ir") || cand.endsWith("or")) {
        verbSuggestions.push(cand);
      }

      // 1. Plural / Gender nouns & adjectives
      if (cand.endsWith("s") && cand.length > 2) {
        if (cand.endsWith("ões")) {
          nounAdjSuggestions.push(cand.slice(0, -3) + "ão");
        } else if (cand.endsWith("ães")) {
          nounAdjSuggestions.push(cand.slice(0, -3) + "ão");
          nounAdjSuggestions.push(cand.slice(0, -3) + "ã");
        } else if (cand.endsWith("ãos")) {
          nounAdjSuggestions.push(cand.slice(0, -3) + "ão");
        } else if (cand.endsWith("ns")) {
          nounAdjSuggestions.push(cand.slice(0, -2) + "m");
        } else if (cand.endsWith("es")) {
          nounAdjSuggestions.push(cand.slice(0, -2));
          nounAdjSuggestions.push(cand.slice(0, -2) + "z");
          nounAdjSuggestions.push(cand.slice(0, -2) + "s");
        } else if (cand.endsWith("is")) {
          if (cand.endsWith("ais")) {
            nounAdjSuggestions.push(cand.slice(0, -2) + "l");
          } else if (cand.endsWith("éis") || cand.endsWith("eis")) {
            nounAdjSuggestions.push(cand.slice(0, -3) + "el");
          } else if (cand.endsWith("óis") || cand.endsWith("ois")) {
            nounAdjSuggestions.push(cand.slice(0, -3) + "ol");
          } else if (cand.endsWith("uis") || cand.endsWith("úis")) {
            nounAdjSuggestions.push(cand.slice(0, -2) + "l");
          } else {
            nounAdjSuggestions.push(cand.slice(0, -1));
          }
        } else {
          nounAdjSuggestions.push(cand.slice(0, -1));
        }
      }

      // Gender inflection
      if (cand.endsWith("a") && cand.length > 2) {
        nounAdjSuggestions.push(cand.slice(0, -1) + "o");
        if (cand.endsWith("ora")) {
          nounAdjSuggestions.push(cand.slice(0, -1));
        } else if (cand.endsWith("ola")) {
          nounAdjSuggestions.push(cand.slice(0, -2) + "l");
        } else if (cand.endsWith("esa")) {
          nounAdjSuggestions.push(cand.slice(0, -3) + "ês");
        }
      }

      // 2. Verb conjugations (regular suffix guessing)
      if (cand.endsWith("ando") && cand.length > 4) {
        verbSuggestions.push(cand.slice(0, -4) + "ar");
      } else if (cand.endsWith("endo") && cand.length > 4) {
        verbSuggestions.push(cand.slice(0, -4) + "er");
        verbSuggestions.push(cand.slice(0, -4) + "ir");
      } else if (cand.endsWith("indo") && cand.length > 4) {
        verbSuggestions.push(cand.slice(0, -4) + "ir");
        verbSuggestions.push(cand.slice(0, -4) + "er");
      }

      if (cand.endsWith("ado") && cand.length > 3) {
        verbSuggestions.push(cand.slice(0, -3) + "ar");
      } else if (cand.endsWith("ido") && cand.length > 3) {
        verbSuggestions.push(cand.slice(0, -3) + "er");
        verbSuggestions.push(cand.slice(0, -3) + "ir");
      } else if (cand.endsWith("ada") && cand.length > 3) {
        verbSuggestions.push(cand.slice(0, -3) + "ar");
      } else if (cand.endsWith("ida") && cand.length > 3) {
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

      if (cand.endsWith("ou") || cand.endsWith("ei") || cand.endsWith("ámos") || cand.endsWith("aram") || cand.endsWith("ara")) {
        verbSuggestions.push(cand.replace(/(ou|ei|ámos|amos|aram|ara)$/, "") + "ar");
      }
      if (cand.endsWith("eu") || cand.endsWith("emos") || cand.endsWith("eram") || cand.endsWith("era")) {
        verbSuggestions.push(cand.replace(/(eu|emos|eram|era)$/, "") + "er");
      }
      if (cand.endsWith("iu") || cand.endsWith("imos") || cand.endsWith("iram") || cand.endsWith("ira")) {
        verbSuggestions.push(cand.replace(/(iu|imos|iram|ira)$/, "") + "ir");
      }

      if (cand.endsWith("o") && cand.length > 2) {
        verbSuggestions.push(cand.slice(0, -1) + "ar");
        verbSuggestions.push(cand.slice(0, -1) + "er");
        verbSuggestions.push(cand.slice(0, -1) + "ir");
      }
      if (cand.endsWith("as") || cand.endsWith("a") || cand.endsWith("am")) {
        verbSuggestions.push(cand.replace(/(as|a|am)$/, "") + "ar");
      }
      if (cand.endsWith("es") || cand.endsWith("e") || cand.endsWith("em")) {
        verbSuggestions.push(cand.replace(/(es|e|em)$/, "") + "er");
        verbSuggestions.push(cand.replace(/(es|e|em)$/, "") + "ir");
      }

      if (cand.includes("ar") && (cand.endsWith("á") || cand.endsWith("ão") || cand.endsWith("ei") || cand.endsWith("emos") || cand.endsWith("ia") || cand.endsWith("iam") || cand.endsWith("as"))) {
        const idx = cand.lastIndexOf("ar");
        verbSuggestions.push(cand.substring(0, idx + 2));
      }
      if (cand.includes("er") && (cand.endsWith("á") || cand.endsWith("ão") || cand.endsWith("ei") || cand.endsWith("emos") || cand.endsWith("ia") || cand.endsWith("iam") || cand.endsWith("as"))) {
        const idx = cand.lastIndexOf("er");
        verbSuggestions.push(cand.substring(0, idx + 2));
      }
      if (cand.includes("ir") && (cand.endsWith("á") || cand.endsWith("ão") || cand.endsWith("ei") || cand.endsWith("emos") || cand.endsWith("ia") || cand.endsWith("iam") || cand.endsWith("as"))) {
        const idx = cand.lastIndexOf("ir");
        verbSuggestions.push(cand.substring(0, idx + 2));
      }

      if (cand.endsWith("asse") || cand.endsWith("assem") || cand.endsWith("asses") || cand.endsWith("ássemos")) {
        verbSuggestions.push(cand.replace(/á|a(sse|ssem|sses|ssemos)$/, "") + "ar");
      }
      if (cand.endsWith("esse") || cand.endsWith("essem") || cand.endsWith("esses") || cand.endsWith("êssemos")) {
        verbSuggestions.push(cand.replace(/ê|e(sse|ssem|sses|ssemos)$/, "") + "er");
      }
      if (cand.endsWith("isse") || cand.endsWith("issem") || cand.endsWith("isses") || cand.endsWith("íssemos")) {
        verbSuggestions.push(cand.replace(/í|i(sse|ssem|sses|ssemos)$/, "") + "ir");
      }
    }

    suggestions.push(...verbSuggestions);
    suggestions.push(...nounAdjSuggestions);
  }

  // Post-process: unique values, filter out target word, strip empty values, normalize length
  let unique = Array.from(new Set(suggestions))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s !== w);

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
