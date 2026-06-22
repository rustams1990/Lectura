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
};

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
    if (SPANISH_IRREGULARS[w]) {
      suggestions.push(...SPANISH_IRREGULARS[w]);
    }

    // Adjective and Noun Gender/Plural Reversion
    if (w.endsWith("as") && w.length > 3) {
      suggestions.push(w.slice(0, -2) + "o");
      suggestions.push(w.slice(0, -2) + "a");
    } else if (w.endsWith("os") && w.length > 3) {
      suggestions.push(w.slice(0, -2) + "o");
    } else if (w.endsWith("a") && w.length > 2) {
      suggestions.push(w.slice(0, -1) + "o");
    } else if (w.endsWith("ces") && w.length > 4) {
      suggestions.push(w.slice(0, -3) + "z"); // e.g. felices -> feliz
    } else if (w.endsWith("es") && w.length > 3) {
      suggestions.push(w.slice(0, -2)); // e.g. flores -> flor
    } else if (w.endsWith("s") && w.length > 2) {
      suggestions.push(w.slice(0, -1)); // e.g. libros -> libro
    }

    // Verbs (Gerunds)
    if (w.endsWith("ando") && w.length > 5) {
      suggestions.push(w.slice(0, -4) + "ar");
    } else if ((w.endsWith("iendo") || w.endsWith("yendo")) && w.length > 6) {
      suggestions.push(w.slice(0, -5) + "er");
      suggestions.push(w.slice(0, -5) + "ir");
      if (w.endsWith("yendo")) {
        suggestions.push(w.slice(0, -5) + "er"); // e.g. leyendo -> leer
      }
    }

    // Verbs (Common conjugated endings)
    // Imperfecto: -aba, -abas, -ábamos, -aban
    if (w.endsWith("aba") || w.endsWith("abas") || w.endsWith("aban")) {
      suggestions.push(w.slice(0, -3) + "ar");
    } else if (w.endsWith("ábamos")) {
      suggestions.push(w.slice(0, -6) + "ar");
    }
    // Pretérito/Presente: -aron, -ieron, -iste, -imos
    else if (w.endsWith("aron") && w.length > 5) {
      suggestions.push(w.slice(0, -4) + "ar");
    } else if (w.endsWith("ieron") && w.length > 6) {
      suggestions.push(w.slice(0, -5) + "er");
      suggestions.push(w.slice(0, -5) + "ir");
    } else if (w.endsWith("iste") && w.length > 5) {
      suggestions.push(w.slice(0, -4) + "ar");
      suggestions.push(w.slice(0, -4) + "er");
      suggestions.push(w.slice(0, -4) + "ir");
    } else if (w.endsWith("imos") && w.length > 5) {
      suggestions.push(w.slice(0, -4) + "ar");
      suggestions.push(w.slice(0, -4) + "er");
      suggestions.push(w.slice(0, -4) + "ir");
    }
    // Condicional/Futuro: -aría, -erías, -iría, -arás, -ará, -erá, -irá
    else if (w.endsWith("aría") || w.endsWith("arás") || w.endsWith("ará")) {
      suggestions.push(w.slice(0, -4) + "ar");
    } else if (w.endsWith("ería") || w.endsWith("erás") || w.endsWith("erá")) {
      suggestions.push(w.slice(0, -4) + "er");
    } else if (w.endsWith("iría") || w.endsWith("irás") || w.endsWith("irá")) {
      suggestions.push(w.slice(0, -4) + "ir");
    } else if (w.endsWith("arán")) {
      suggestions.push(w.slice(0, -4) + "ar");
    } else if (w.endsWith("erán")) {
      suggestions.push(w.slice(0, -4) + "er");
    } else if (w.endsWith("irán")) {
      suggestions.push(w.slice(0, -4) + "ir");
    } else if (w.endsWith("ó") && w.length > 2) {
      suggestions.push(w.slice(0, -1) + "ar");
    } else if (w.endsWith("ió") && w.length > 3) {
      suggestions.push(w.slice(0, -2) + "er");
      suggestions.push(w.slice(0, -2) + "ir");
    }
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
