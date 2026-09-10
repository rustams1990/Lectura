/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Universal (Cross-language proper nouns & non-dictionary brands)
import universalGaming from './universal/gaming.json';
import universalTech from './universal/tech.json';
import universalMusic from './universal/music.json';
import universalCinema from './universal/cinema.json';
import universalBrands from './universal/brands.json';
import universalCities from './universal/cities.json';
import universalNames from './universal/names.json';
import universalMisc from './universal/misc.json';
import universalTypos from './universal/typos.json';

// Spanish (es)
import esGaming from './es/gaming.json';
import esTech from './es/tech.json';
import esMusic from './es/music.json';
import esCinema from './es/cinema.json';
import esBrands from './es/brands.json';
import esCities from './es/cities.json';
import esNames from './es/names.json';
import esMisc from './es/misc.json';
import esTypos from './es/typos.json';

// English (en)
import enMusic from './en/music.json';
import enCinema from './en/cinema.json';
import enBrands from './en/brands.json';
import enCities from './en/cities.json';
import enNames from './en/names.json';
import enMisc from './en/misc.json';
import enTypos from './en/typos.json';

// French (fr)
import frGaming from './fr/gaming.json';
import frMusic from './fr/music.json';
import frCinema from './fr/cinema.json';
import frBrands from './fr/brands.json';
import frCities from './fr/cities.json';
import frNames from './fr/names.json';
import frMisc from './fr/misc.json';
import frTypos from './fr/typos.json';

// German (de)
import deGaming from './de/gaming.json';
import deMusic from './de/music.json';
import deCinema from './de/cinema.json';
import deBrands from './de/brands.json';
import deCities from './de/cities.json';
import deNames from './de/names.json';
import deMisc from './de/misc.json';
import deTypos from './de/typos.json';

// Russian (ru)
import ruGaming from './ru/gaming.json';
import ruTech from './ru/tech.json';
import ruMusic from './ru/music.json';
import ruCinema from './ru/cinema.json';
import ruBrands from './ru/brands.json';
import ruCities from './ru/cities.json';
import ruNames from './ru/names.json';
import ruMisc from './ru/misc.json';
import ruTypos from './ru/typos.json';

// Italian (it)
import itGaming from './it/gaming.json';
import itMusic from './it/music.json';
import itCinema from './it/cinema.json';
import itBrands from './it/brands.json';
import itCities from './it/cities.json';
import itNames from './it/names.json';
import itMisc from './it/misc.json';
import itTypos from './it/typos.json';

// Portuguese (pt)
import ptGaming from './pt/gaming.json';
import ptMusic from './pt/music.json';
import ptCinema from './pt/cinema.json';
import ptBrands from './pt/brands.json';
import ptCities from './pt/cities.json';
import ptNames from './pt/names.json';
import ptMisc from './pt/misc.json';
import ptTypos from './pt/typos.json';

export type IgnoreCategoryId = 'gaming' | 'tech' | 'music' | 'cinema' | 'brands' | 'cities';

/**
 * Strict Blacklist of protected dictionary words and country names.
 * These must NEVER be auto-ignored under any circumstance.
 */
export const PROTECTED_WORDS_BLACKLIST: Set<string> = new Set([
  // English common words (fruits, verbs, nouns, adjectives)
  'apple', 'zoom', 'nice', 'valve', 'blizzard', 'steam', 'switch', 'hades',
  'celeste', 'canon', 'safari', 'docker', 'chrome', 'edge', 'opera', 'led',
  'ram', 'war', 'god', 'boss', 'drop', 'loot', 'cool', 'like', 'link',
  'chat', 'cloud', 'server', 'stream', 'style', 'team', 'party', 'test',
  'brand', 'meeting', 'deadline', 'target', 'gap', 'shell', 'oracle', 'subway',
  'chase', 'bell', 'deal', 'dell', 'reading', 'bath', 'split', 'intel',
  'discord', 'fedora', 'overwatch', 'insomniac', 'play', 'tree', 'skill',
  'music', 'guerra', 'box', 'boxes', 'boxing',

  // English homonym names
  'will', 'may', 'bill', 'grace', 'hope', 'rose', 'mark', 'rich', 'faith', 'joy',
  'art', 'bob', 'rob', 'sue', 'pat', 'gene', 'frank', 'guy', 'penny',
  'sandy', 'rusty', 'amber', 'cliff', 'daisy', 'dawn', 'lily', 'ruby', 'victor',
  'miles', 'grant', 'wade', 'hunter', 'mason', 'archer', 'cooper', 'fisher',
  'cook', 'baker', 'smith', 'taylor', 'brown', 'white', 'black', 'green', 'wood',
  'stone', 'king', 'prince', 'knight', 'lord', 'bishop', 'bush', 'church', 'fox',
  'wolf', 'bird', 'young', 'long', 'short', 'little', 'small', 'sharp', 'quick',
  'smart', 'bright', 'sweet', 'fair', 'best', 'well', 'early', 'daily', 'page',
  'major', 'general', 'ford', 'carter', 'barr',

  // Spanish homonym names & vocabulary words
  'alma', 'rosa', 'blanca', 'dolores', 'esperanza', 'sol', 'victoria', 'cruz', 'angel',
  'ángel', 'flor', 'mercedes', 'carmen', 'gloria', 'luz', 'pilar', 'consuelo',
  'paz', 'soledad', 'amparo', 'rocio', 'rocío', 'aurora', 'paloma', 'estrella',
  'felix', 'félix', 'salvador', 'roman', 'román', 'domingo', 'julio', 'agosto',
  'martin', 'martín', 'leon', 'león', 'franco', 'marina', 'clara', 'reina',
  'candela', 'milagros', 'inmaculada', 'socorro', 'concepcion', 'concepción',
  'dulce', 'gracia', 'fidel', 'maximo', 'máximo', 'justo', 'modesto', 'prudencio',
  'lima', 'huevo', 'santo', 'cura', 'nieve', 'música', 'musica', 'risas',
  'aplausos', 'farmear', 'craftear', 'grindeo', 'nerfeado', 'buffeado',
  'cielo', 'mar', 'rio', 'río', 'valle', 'monte', 'sierra', 'pena', 'peña',
  'castillo', 'torre', 'fuente', 'iglesia', 'rey', 'conde', 'duque', 'caballero',
  'pastor', 'bello', 'hermoso', 'lindo', 'bueno', 'leal', 'fiel', 'bravo',
  'fuerte', 'valiente', 'grande', 'chico', 'alto', 'bajo', 'gordo', 'flaco',
  'rubio', 'moreno', 'serena', 'valentin', 'valentín', 'nieves', 'asuncion',
  'asunción', 'encarnacion', 'encarnación', 'trinidad', 'santos', 'almond',

  // French / Italian / German homonym names & words
  'sega', 'bella', 'bello', 'blanc', 'merci', 'stein', 'berg', 'mann',

  // Countries in Spanish, English, French, German, Russian, etc.
  'spain', 'españa', 'espana', 'germany', 'alemania', 'deutschland',
  'france', 'francia', 'frankreich', 'italy', 'italia', 'italien',
  'russia', 'rusia', 'russland', 'россия', 'china', 'japan', 'japón', 'japon',
  'mexico', 'méxico', 'usa', 'england', 'inglaterra', 'uk', 'canada', 'canadá',
  'brazil', 'brasil', 'argentina', 'colombia', 'peru', 'perú', 'chile', 'cuba',
  'poland', 'polonia', 'ukraine', 'ucrania', 'turkey', 'turquía', 'egypt', 'egipto',
  'greece', 'grecia', 'sweden', 'suecia', 'norway', 'noruega', 'finland', 'finlandia',
  'portugal', 'holland', 'netherlands', 'países bajos', 'belgium', 'bélgica',
  'switzerland', 'suiza', 'austria', 'india', 'korea', 'corea', 'australia'
]);

/**
 * Resolves active ignore Set for a target language and enabled categories.
 */
export function getActiveIgnoreSet(
  targetLanguage: string,
  enabledCategories: string[] = ['gaming', 'tech', 'music', 'cinema', 'brands', 'cities']
): Set<string> {
  const ignoreSet = new Set<string>();

  const isGaming = enabledCategories.includes('gaming');
  const isTech = enabledCategories.includes('tech') || enabledCategories.includes('tech_brands');
  const isMusic = enabledCategories.includes('music');
  const isCinema = enabledCategories.includes('cinema');
  const isBrands = enabledCategories.includes('brands');
  const isCities = enabledCategories.includes('cities') || enabledCategories.includes('names_cities');

  // 1. Load Universal Categories (Brands & Platforms with no dictionary words)
  if (isGaming) {
    universalGaming.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
  }
  if (isTech) {
    universalTech.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
  }
  if (isMusic) {
    universalMusic.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
  }
  if (isCinema) {
    universalCinema.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
  }
  if (isBrands) {
    universalBrands.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
  }
  if (isCities) {
    universalCities.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
    universalNames.forEach((w) => {
      const clean = w.trim().toLowerCase();
      if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
    });
  }

  // Universal misc and typos are always included in the background
  universalMisc.forEach((w) => {
    const clean = w.trim().toLowerCase();
    if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
  });
  universalTypos.forEach((w) => {
    const clean = w.trim().toLowerCase();
    if (clean && !PROTECTED_WORDS_BLACKLIST.has(clean)) ignoreSet.add(clean);
  });

  // 2. Load Language-Specific lists
  const norm = (targetLanguage || '').toLowerCase().trim();
  const isSpanish = norm.startsWith('es') || norm.startsWith('spa') || norm === 'испанский' || norm === 'spanish';
  const isEnglish = norm.startsWith('en') || norm.startsWith('eng') || norm === 'английский' || norm === 'english';
  const isFrench = norm.startsWith('fr') || norm.startsWith('fre') || norm === 'французский' || norm === 'french';
  const isGerman = norm.startsWith('de') || norm.startsWith('ger') || norm === 'немецкий' || norm === 'german';
  const isRussian = norm.startsWith('ru') || norm === 'русский' || norm === 'russian';
  const isItalian = norm.startsWith('it') || norm.startsWith('ita') || norm === 'итальянский' || norm === 'italian';
  const isPortuguese = norm.startsWith('pt') || norm.startsWith('por') || norm === 'португальский' || norm === 'portuguese';

  if (isSpanish) {
    if (isGaming) esGaming.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isTech) esTech.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isMusic) esMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) esCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) esBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      esCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      esNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    esMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    esTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  } else if (isEnglish) {
    // For English learners, only proper nouns / non-dictionary items are loaded
    if (isMusic) enMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) enCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) enBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      enCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      enNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    enMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    enTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  } else if (isFrench) {
    if (isGaming) frGaming.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isMusic) frMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) frCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) frBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      frCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      frNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    frMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    frTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  } else if (isGerman) {
    if (isGaming) deGaming.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isMusic) deMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) deCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) deBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      deCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      deNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    deMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    deTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  } else if (isRussian) {
    if (isGaming) ruGaming.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isTech) ruTech.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isMusic) ruMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) ruCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) ruBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      ruCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      ruNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    ruMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    ruTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  } else if (isItalian) {
    if (isGaming) itGaming.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isMusic) itMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) itCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) itBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      itCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      itNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    itMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    itTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  } else if (isPortuguese) {
    if (isGaming) ptGaming.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isMusic) ptMusic.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCinema) ptCinema.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isBrands) ptBrands.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    if (isCities) {
      ptCities.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
      ptNames.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    }
    ptMisc.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
    ptTypos.forEach((w) => { const c = w.trim().toLowerCase(); if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) ignoreSet.add(c); });
  }

  return ignoreSet;
}
