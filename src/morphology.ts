/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Irregular word mappings for major languages
const ENGLISH_IRREGULARS: Record<string, string[]> = {
  // Verbs
  went: ["go"],
  gone: ["go"],
  was: ["be"],
  were: ["be"],
  been: ["be"],
  am: ["be"],
  is: ["be"],
  are: ["be"],
  being: ["be"],
  had: ["have"],
  has: ["have"],
  did: ["do"],
  done: ["do"],
  said: ["say"],
  took: ["take"],
  taken: ["take"],
  saw: ["see"],
  seen: ["see"],
  came: ["come"],
  come: ["come"],
  made: ["make"],
  got: ["get"],
  gotten: ["get"],
  found: ["find"],
  thought: ["think"],
  told: ["tell"],
  became: ["become"],
  become: ["become"],
  felt: ["feel"],
  left: ["leave"],
  wrote: ["write"],
  written: ["write"],
  bought: ["buy"],
  brought: ["bring"],
  heard: ["hear"],
  held: ["hold"],
  met: ["meet"],
  ran: ["run"],
  run: ["run"],
  stood: ["stand"],
  lost: ["lose"],
  paid: ["pay"],
  understood: ["understand"],
  spoke: ["speak"],
  spoken: ["speak"],
  spent: ["spend"],
  grew: ["grow"],
  grown: ["grow"],
  won: ["win"],
  taught: ["teach"],
  sent: ["send"],
  built: ["build"],
  fell: ["fall"],
  fallen: ["fall"],
  kept: ["keep"],
  slept: ["sleep"],
  // Nouns
  men: ["man"],
  women: ["woman"],
  children: ["child"],
  teeth: ["tooth"],
  feet: ["foot"],
  mice: ["mouse"],
  geese: ["goose"],
  people: ["person"],
};

const SPANISH_IRREGULARS: Record<string, string[]> = {
  // Ser / Ir
  fui: ["ser", "ir"],
  fuiste: ["ser", "ir"],
  fue: ["ser", "ir"],
  fuimos: ["ser", "ir"],
  fuisteis: ["ser", "ir"],
  fueron: ["ser", "ir"],
  soy: ["ser"],
  eres: ["ser"],
  es: ["ser"],
  somos: ["ser"],
  sois: ["ser"],
  son: ["ser"],
  voy: ["ir"],
  vas: ["ir"],
  va: ["ir"],
  vamos: ["ir"],
  vais: ["ir"],
  van: ["ir"],
  iba: ["ir"],
  ibas: ["ir"],
  íbamos: ["ir"],
  ibais: ["ir"],
  iban: ["ir"],
  // Haber
  he: ["haber"],
  has: ["haber"],
  ha: ["haber"],
  hemos: ["haber"],
  habéis: ["haber"],
  han: ["haber"],
  hubo: ["haber"],
  había: ["haber"],
  // Tener
  tengo: ["tener"],
  tienes: ["tener"],
  tiene: ["tener"],
  tenemos: ["tener"],
  tenéis: ["tener"],
  tienen: ["tener"],
  tuve: ["tener"],
  tuviste: ["tener"],
  tuvo: ["tener"],
  tuvimos: ["tener"],
  tuvieron: ["tener"],
  tenía: ["tener"],
  // Hacer
  hago: ["hacer"],
  haces: ["hacer"],
  hace: ["hacer"],
  hacemos: ["hacer"],
  hacéis: ["hacer"],
  hacen: ["hacer"],
  hice: ["hacer"],
  hiciste: ["hacer"],
  hizo: ["hacer"],
  hicimos: ["hacer"],
  hicieron: ["hacer"],
  // Poder
  puedo: ["poder"],
  puedes: ["poder"],
  puede: ["poder"],
  podemos: ["poder"],
  podéis: ["poder"],
  pueden: ["poder"],
  pude: ["poder"],
  pudiste: ["poder"],
  pudo: ["poder"],
  pudimos: ["poder"],
  pudieron: ["poder"],
  // Decir
  digo: ["decir"],
  dices: ["decir"],
  dice: ["decir"],
  decimos: ["decir"],
  decís: ["decir"],
  dicen: ["decir"],
  dije: ["decir"],
  dijiste: ["decir"],
  dijo: ["decir"],
  dijimos: ["decir"],
  dijeron: ["decir"],
  // Querer
  quiero: ["querer"],
  quieres: ["querer"],
  quiere: ["querer"],
  queremos: ["querer"],
  queréis: ["querer"],
  quieren: ["querer"],
  quise: ["querer"],
  quiso: ["querer"],
  quisieron: ["querer"],
  // Saber
  sé: ["saber"],
  sabes: ["saber"],
  sabe: ["saber"],
  sabemos: ["saber"],
  sabéis: ["saber"],
  saben: ["saber"],
  supe: ["saber"],
  supo: ["saber"],
  supieron: ["saber"],
  // Ver
  veo: ["ver"],
  ves: ["ver"],
  ve: ["ver"],
  vemos: ["ver"],
  veis: ["ver"],
  ven: ["ver"],
  vi: ["ver"],
  viste: ["ver"],
  vio: ["ver"],
  vimos: ["ver"],
  visteis: ["ver"],
  vieron: ["ver"],
  // Dar
  doy: ["dar"],
  das: ["dar"],
  da: ["dar"],
  damos: ["dar"],
  dais: ["dar"],
  dan: ["dar"],
  di: ["dar"],
  diste: ["dar"],
  dio: ["dar"],
  dimos: ["dar"],
  dieron: ["dar"],
  // Poner
  pongo: ["poner"],
  pones: ["poner"],
  pone: ["poner"],
  ponemos: ["poner"],
  ponéis: ["poner"],
  ponen: ["poner"],
  puse: ["poner"],
  pusiste: ["poner"],
  puso: ["poner"],
  pusimos: ["poner"],
  pusieron: ["poner"],
  ponía: ["poner"],
  // Salir
  salgo: ["salir"],
  sales: ["salir"],
  sale: ["salir"],
  salimos: ["salir"],
  salís: ["salir"],
  salen: ["salir"],
  // Venir
  vengo: ["venir"],
  vienes: ["venir"],
  viene: ["venir"],
  venimos: ["venir"],
  venís: ["venir"],
  vienen: ["venir"],
  vine: ["venir"],
  viniste: ["venir"],
  vino: ["venir"],
  vinimos: ["venir"],
  vinieron: ["venir"],
  venía: ["venir"],
  // Traer
  traigo: ["traer"],
  traes: ["traer"],
  trae: ["traer"],
  traemos: ["traer"],
  traéis: ["traer"],
  traen: ["traer"],
  traje: ["traer"],
  trajiste: ["traer"],
  trajo: ["traer"],
  trajimos: ["traer"],
  trajeron: ["traer"],
  traía: ["traer"],
  // Caer
  caigo: ["caer"],
  caes: ["caer"],
  cae: ["caer"],
  caemos: ["caer"],
  caéis: ["caer"],
  caen: ["caer"],
  caí: ["caer"],
  cayó: ["caer"],
  cayeron: ["caer"],
  caía: ["caer"],
  // Oír
  oigo: ["oír"],
  oyes: ["oír"],
  oye: ["oír"],
  oímos: ["oír"],
  oís: ["oír"],
  oyen: ["oír"],
  oyó: ["oír"],
  oyeron: ["oír"],
  oía: ["oír"],
  // Irregular Participles
  abierto: ["abrir"],
  cubierto: ["cubrir"],
  dicho: ["decir"],
  escrito: ["escribir"],
  hecho: ["hacer"],
  muerto: ["morir"],
  puesto: ["poner"],
  roto: ["romper"],
  visto: ["ver"],
  vuelto: ["volver"],
  resuelto: ["resolver"],
  devuelto: ["devolver"],
};

const SPANISH_DOUBLE_ENCLITICS = [
  "melo", "mela", "melos", "melas",
  "telo", "tela", "telos", "telas",
  "selo", "sela", "selos", "selas",
  "noslo", "nosla", "noslos", "noslas",
  "oslo", "osla", "oslos", "oslas"
];

const SPANISH_SINGLE_ENCLITICS = [
  "me", "te", "se", "nos", "os", "le", "les", "lo", "la", "los", "las"
];

const SPANISH_SHORT_IMPERATIVES: Record<string, string[]> = {
  di: ["decir"],
  haz: ["hacer"],
  ve: ["ir", "ver"],
  pon: ["poner"],
  ten: ["tener"],
  sal: ["salir"],
  ven: ["venir"],
  val: ["valer"],
  da: ["dar"],
  trae: ["traer"],
  oye: ["oír"],
  sé: ["ser", "saber"],
  se: ["ser", "saber"],
};

const SPANISH_FUTURE_STEMS: Record<string, string[]> = {
  tendr: ["tener"],
  har: ["hacer"],
  dir: ["decir"],
  podr: ["poder"],
  sabr: ["saber"],
  quer: ["querer"],
  pondr: ["poner"],
  valdr: ["valer"],
  saldr: ["salir"],
  habr: ["haber"],
  vendr: ["venir"],
  cabr: ["caber"]
};

interface VerbEndingRule {
  ending: string;
  infinitives: string[];
}


const SPANISH_VERB_ENDINGS: VerbEndingRule[] = [
  // 8 chars
  { ending: "iésemos", infinitives: ["er", "ir"] },
  { ending: "iéramos", infinitives: ["er", "ir"] },
  { ending: "aríamos", infinitives: ["ar"] },
  { ending: "eríamos", infinitives: ["er"] },
  { ending: "iríamos", infinitives: ["ir"] },

  // 7 chars
  { ending: "ásemos", infinitives: ["ar"] },
  { ending: "áramos", infinitives: ["ar"] },
  { ending: "isteis", infinitives: ["ar", "er", "ir"] },
  { ending: "ierais", infinitives: ["er", "ir"] },
  { ending: "ieseis", infinitives: ["er", "ir"] },
  { ending: "aremos", infinitives: ["ar"] },
  { ending: "eremos", infinitives: ["er"] },
  { ending: "iremos", infinitives: ["ir"] },
  { ending: "aríais", infinitives: ["ar"] },
  { ending: "eríais", infinitives: ["er"] },
  { ending: "iríais", infinitives: ["ir"] },

  // 6 chars
  { ending: "ábamos", infinitives: ["ar"] },
  { ending: "aron", infinitives: ["ar"] },
  { ending: "ieron", infinitives: ["er", "ir"] },
  { ending: "ieran", infinitives: ["er", "ir"] },
  { ending: "iesen", infinitives: ["er", "ir"] },
  { ending: "ieras", infinitives: ["er", "ir"] },
  { ending: "ieses", infinitives: ["er", "ir"] },
  { ending: "yendo", infinitives: ["er", "ir"] },
  { ending: "iendo", infinitives: ["er", "ir"] },
  { ending: "arían", infinitives: ["ar"] },
  { ending: "erían", infinitives: ["er"] },
  { ending: "irían", infinitives: ["ir"] },
  { ending: "arías", infinitives: ["ar"] },
  { ending: "erías", infinitives: ["er"] },
  { ending: "irías", infinitives: ["ir"] },
  { ending: "abais", infinitives: ["ar"] },
  { ending: "íais", infinitives: ["er", "ir"] },

  // 5 chars
  { ending: "aste", infinitives: ["ar"] },
  { ending: "iste", infinitives: ["er", "ir"] },
  { ending: "amos", infinitives: ["ar", "er", "ir"] },
  { ending: "emos", infinitives: ["ar", "er"] },
  { ending: "imos", infinitives: ["er", "ir"] },
  { ending: "aran", infinitives: ["ar"] },
  { ending: "asen", infinitives: ["ar"] },
  { ending: "aras", infinitives: ["ar"] },
  { ending: "ases", infinitives: ["ar"] },
  { ending: "iera", infinitives: ["er", "ir"] },
  { ending: "iese", infinitives: ["er", "ir"] },
  { ending: "arán", infinitives: ["ar"] },
  { ending: "erán", infinitives: ["er"] },
  { ending: "irán", infinitives: ["ir"] },
  { ending: "arás", infinitives: ["ar"] },
  { ending: "erás", infinitives: ["er"] },
  { ending: "irás", infinitives: ["ir"] },

  // 4 chars
  { ending: "abas", infinitives: ["ar"] },
  { ending: "aban", infinitives: ["ar"] },
  { ending: "ías", infinitives: ["er", "ir"] },
  { ending: "ían", infinitives: ["er", "ir"] },
  { ending: "ará", infinitives: ["ar"] },
  { ending: "erá", infinitives: ["er"] },
  { ending: "irá", infinitives: ["ir"] },
  { ending: "ando", infinitives: ["ar"] },
  { ending: "ador", infinitives: ["ar"] },
  { ending: "ados", infinitives: ["ar"] },
  { ending: "adas", infinitives: ["ar"] },
  { ending: "idos", infinitives: ["er", "ir"] },
  { ending: "idas", infinitives: ["er", "ir"] },
  { ending: "ara", infinitives: ["ar"] },
  { ending: "ase", infinitives: ["ar"] },
  { ending: "áis", infinitives: ["ar", "er", "ir"] },
  { ending: "éis", infinitives: ["ar", "er", "ir"] },
  { ending: "zco", infinitives: ["cer", "cir"] },
  { ending: "zca", infinitives: ["cer", "cir"] },
  { ending: "zcas", infinitives: ["cer", "cir"] },
  { ending: "zcan", infinitives: ["cer", "cir"] },

  // 3 chars
  { ending: "aba", infinitives: ["ar"] },
  { ending: "ía", infinitives: ["er", "ir"] },
  { ending: "ado", infinitives: ["ar"] },
  { ending: "ido", infinitives: ["er", "ir"] },
  { ending: "an", infinitives: ["ar"] },
  { ending: "en", infinitives: ["ar", "er", "ir"] },
  { ending: "as", infinitives: ["ar"] },
  { ending: "es", infinitives: ["ar", "er", "ir"] },
  { ending: "ís", infinitives: ["ir"] },
  { ending: "ió", infinitives: ["er", "ir"] },

  // 2 chars
  { ending: "ó", infinitives: ["ar"] },
  { ending: "é", infinitives: ["ar"] },
  { ending: "í", infinitives: ["er", "ir"] },
  { ending: "ad", infinitives: ["ar"] },
  { ending: "ed", infinitives: ["er"] },
  { ending: "id", infinitives: ["ir"] },
  { ending: "jo", infinitives: ["ger", "gir"] },
  { ending: "a", infinitives: ["ar", "er", "ir"] },
  { ending: "e", infinitives: ["ar", "er", "ir"] },
  { ending: "o", infinitives: ["ar", "er", "ir"] }
];

function removeSpanishAccents(str: string): string {
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

  // 1. Try double enclitics
  for (const pronoun of SPANISH_DOUBLE_ENCLITICS) {
    if (w.endsWith(pronoun)) {
      const stripped = w.slice(0, -pronoun.length);
      if (stripped.length >= 2) {
        candidates.push(removeSpanishAccents(stripped));
        if (hasAccent) {
          candidates.push(stripped);
        }
      }
    }
  }

  // 2. Try single enclitics
  for (const pronoun of SPANISH_SINGLE_ENCLITICS) {
    if (w.endsWith(pronoun)) {
      const stripped = w.slice(0, -pronoun.length);
      if (stripped.length >= 2) {
        if ((pronoun === "nos" || pronoun === "se") && stripped.endsWith("mo")) {
          const restored = stripped + "s";
          candidates.push(removeSpanishAccents(restored));
          if (hasAccent) {
            candidates.push(restored);
          }
        }
        candidates.push(removeSpanishAccents(stripped));
        if (hasAccent) {
          candidates.push(stripped);
        }
      }
    }
  }

  return Array.from(new Set(candidates));
}

function getSpanishStemVariations(stem: string): string[] {
  const variations = [stem];

  if (stem.includes("ie")) {
    variations.push(stem.replace("ie", "e"));
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

  if (stem.includes("u")) {
    const lastIndex = stem.lastIndexOf("u");
    const withO = stem.slice(0, lastIndex) + "o" + stem.slice(lastIndex + 1);
    variations.push(withO);
  }

  return Array.from(new Set(variations));
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

export function getSuggestedLemmas(word: string, targetLanguage: string): string[] {
  if (!word) return [];
  const w = word.trim().toLowerCase();
  if (w.length <= 1) return [];

  const lang = (targetLanguage || "").toLowerCase().trim();
  const suggestions: string[] = [];

  // 1. English Lemmatization
  if (lang.startsWith("en") || lang === "английский" || lang === "english") {
    if (ENGLISH_IRREGULARS[w]) {
      suggestions.push(...ENGLISH_IRREGULARS[w]);
    }

    // Rules for Plurals
    if (w.endsWith("s")) {
      if (w.endsWith("ies") && w.length > 4) {
        suggestions.push(w.slice(0, -3) + "y");
      } else if (w.endsWith("ves") && w.length > 4) {
        suggestions.push(w.slice(0, -3) + "f");
        suggestions.push(w.slice(0, -3) + "fe");
      } else if (w.endsWith("es") && w.length > 3) {
        suggestions.push(w.slice(0, -2));
      } else if (w.length > 2) {
        suggestions.push(w.slice(0, -1));
      }
    }

    // Rules for Verbs (Past tense and Gerunds)
    if (w.endsWith("ed")) {
      if (w.endsWith("ied") && w.length > 4) {
        suggestions.push(w.slice(0, -3) + "y");
      } else if (/(.)\1ed$/.test(w) && w.length > 4) {
        // e.g. stopped -> stop, spelled -> spell
        const doubledChar = w[w.length - 3];
        const base = w.slice(0, -3);
        suggestions.push(...handleDoubledConsonant(base, doubledChar));
      } else if (w.length > 3) {
        suggestions.push(w.slice(0, -2));
        suggestions.push(w.slice(0, -1)); // e.g. loved -> love
      }
    }

    if (w.endsWith("ing")) {
      if (w.endsWith("ying") && w.length > 5) {
        suggestions.push(w.slice(0, -4) + "ie"); // e.g. dying -> die
      } else if (/(.)\1ing$/.test(w) && w.length > 4) {
        // e.g. running -> run, telling -> tell
        const doubledChar = w[w.length - 4];
        const base = w.slice(0, -4);
        suggestions.push(...handleDoubledConsonant(base, doubledChar));
      } else if (w.length > 4) {
        suggestions.push(w.slice(0, -3));
        suggestions.push(w.slice(0, -3) + "e"); // e.g. making -> make
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

    // Generate candidates: either the word itself, or base forms after stripping enclitic pronouns
    const candidates = [w];
    candidates.push(...stripSpanishEnclitics(w));

    // Process each candidate
    for (const cand of Array.from(new Set(candidates))) {
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
      } else if (cand.endsWith("os") && cand.length > 3) {
        nounAdjSuggestions.push(cand.slice(0, -2) + "o");
      } else if (cand.endsWith("a") && cand.length > 2) {
        nounAdjSuggestions.push(cand.slice(0, -1) + "o");
      } else if (cand.endsWith("ces") && cand.length > 4) {
        nounAdjSuggestions.push(cand.slice(0, -3) + "z"); // e.g. felices -> feliz
      } else if (cand.endsWith("es") && cand.length > 3) {
        nounAdjSuggestions.push(cand.slice(0, -2)); // e.g. flores -> flor
      } else if (cand.endsWith("s") && cand.length > 2) {
        nounAdjSuggestions.push(cand.slice(0, -1)); // e.g. libros -> libro
      }

      // 3. Verb Ending Rules (run on each candidate)
      for (const rule of SPANISH_VERB_ENDINGS) {
        if (cand.endsWith(rule.ending) && cand.length > rule.ending.length + 1) {
          const stem = cand.slice(0, -rule.ending.length);
          
          // If the stem is an irregular future/conditional stem, add its infinitives
          if (SPANISH_FUTURE_STEMS[stem]) {
            verbSuggestions.push(...SPANISH_FUTURE_STEMS[stem]);
          }

          // Apply stem change reversion only if matched a verb ending
          const stemVars = getSpanishStemVariations(stem);
          for (const sVar of stemVars) {
            for (const inf of rule.infinitives) {
              verbSuggestions.push(sVar + inf);
            }
          }
          // We can break after finding the longest matching verb ending to avoid matching shorter subsets
          break;
        }
      }
    }

    // Merge suggestions, placing verbs first
    suggestions.push(...verbSuggestions);
    suggestions.push(...nounAdjSuggestions);
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

  // Post-process: unique values, filter out target word, strip empty values, normalize length
  const unique = Array.from(new Set(suggestions))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s !== w);

  return unique;
}
