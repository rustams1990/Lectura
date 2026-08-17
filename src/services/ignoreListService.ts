/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PROTECTED_WORDS_BLACKLIST,
  getActiveIgnoreSet,
} from "../data/ignoreLists/ignoreService";

import universalGaming from "../data/ignoreLists/universal/gaming.json";
import universalTech from "../data/ignoreLists/universal/tech.json";
import universalMusic from "../data/ignoreLists/universal/music.json";
import universalCinema from "../data/ignoreLists/universal/cinema.json";
import universalBrands from "../data/ignoreLists/universal/brands.json";
import universalCities from "../data/ignoreLists/universal/cities.json";
import universalNames from "../data/ignoreLists/universal/names.json";
import universalMisc from "../data/ignoreLists/universal/misc.json";
import universalTypos from "../data/ignoreLists/universal/typos.json";

import esGaming from "../data/ignoreLists/es/gaming.json";
import esTech from "../data/ignoreLists/es/tech.json";
import esMusic from "../data/ignoreLists/es/music.json";
import esCinema from "../data/ignoreLists/es/cinema.json";
import esBrands from "../data/ignoreLists/es/brands.json";
import esCities from "../data/ignoreLists/es/cities.json";
import esNames from "../data/ignoreLists/es/names.json";
import esMisc from "../data/ignoreLists/es/misc.json";
import esTypos from "../data/ignoreLists/es/typos.json";

import enMusic from "../data/ignoreLists/en/music.json";
import enCinema from "../data/ignoreLists/en/cinema.json";
import enBrands from "../data/ignoreLists/en/brands.json";
import enCities from "../data/ignoreLists/en/cities.json";
import enNames from "../data/ignoreLists/en/names.json";
import enMisc from "../data/ignoreLists/en/misc.json";
import enTypos from "../data/ignoreLists/en/typos.json";

import frGaming from "../data/ignoreLists/fr/gaming.json";
import frMusic from "../data/ignoreLists/fr/music.json";
import frCinema from "../data/ignoreLists/fr/cinema.json";
import frBrands from "../data/ignoreLists/fr/brands.json";
import frCities from "../data/ignoreLists/fr/cities.json";
import frNames from "../data/ignoreLists/fr/names.json";
import frMisc from "../data/ignoreLists/fr/misc.json";
import frTypos from "../data/ignoreLists/fr/typos.json";

import deGaming from "../data/ignoreLists/de/gaming.json";
import deMusic from "../data/ignoreLists/de/music.json";
import deCinema from "../data/ignoreLists/de/cinema.json";
import deBrands from "../data/ignoreLists/de/brands.json";
import deCities from "../data/ignoreLists/de/cities.json";
import deNames from "../data/ignoreLists/de/names.json";
import deMisc from "../data/ignoreLists/de/misc.json";
import deTypos from "../data/ignoreLists/de/typos.json";

import ruGaming from "../data/ignoreLists/ru/gaming.json";
import ruTech from "../data/ignoreLists/ru/tech.json";
import ruMusic from "../data/ignoreLists/ru/music.json";
import ruCinema from "../data/ignoreLists/ru/cinema.json";
import ruBrands from "../data/ignoreLists/ru/brands.json";
import ruCities from "../data/ignoreLists/ru/cities.json";
import ruNames from "../data/ignoreLists/ru/names.json";
import ruMisc from "../data/ignoreLists/ru/misc.json";
import ruTypos from "../data/ignoreLists/ru/typos.json";

import itGaming from "../data/ignoreLists/it/gaming.json";
import itMusic from "../data/ignoreLists/it/music.json";
import itCinema from "../data/ignoreLists/it/cinema.json";
import itBrands from "../data/ignoreLists/it/brands.json";
import itCities from "../data/ignoreLists/it/cities.json";
import itNames from "../data/ignoreLists/it/names.json";
import itMisc from "../data/ignoreLists/it/misc.json";
import itTypos from "../data/ignoreLists/it/typos.json";

import ptGaming from "../data/ignoreLists/pt/gaming.json";
import ptMusic from "../data/ignoreLists/pt/music.json";
import ptCinema from "../data/ignoreLists/pt/cinema.json";
import ptBrands from "../data/ignoreLists/pt/brands.json";
import ptCities from "../data/ignoreLists/pt/cities.json";
import ptNames from "../data/ignoreLists/pt/names.json";
import ptMisc from "../data/ignoreLists/pt/misc.json";
import ptTypos from "../data/ignoreLists/pt/typos.json";

import { IgnoreCategorySettings, ReaderSettings } from "../types";
import { getLanguageCode } from "../utils";

export { PROTECTED_WORDS_BLACKLIST, getActiveIgnoreSet };

export type IgnoreCategoryId = "gaming" | "tech_brands" | "music" | "cinema" | "brands" | "names_cities" | "anglicisms";

export interface IgnoreCategoryMeta {
  id: IgnoreCategoryId;
  icon: string;
  nameKey: string;
  defaultNameRu: string;
  defaultNameEn: string;
  shortNameKey: string;
  shortNameRu: string;
  shortNameEn: string;
  descKey: string;
  defaultDescRu: string;
  defaultDescEn: string;
}

export const IGNORE_CATEGORIES_CONFIG: Record<IgnoreCategoryId, IgnoreCategoryMeta> = {
  gaming: {
    id: "gaming",
    icon: "🎮",
    nameKey: "ignore_lists.category_gaming",
    defaultNameRu: "Гейминг и консоли",
    defaultNameEn: "Gaming & Platforms",
    shortNameKey: "ignore_lists.badge_gaming",
    shortNameRu: "Гейминг",
    shortNameEn: "Gaming",
    descKey: "ignore_lists.category_gaming_desc",
    defaultDescRu: "Названия игр, консолей и франшиз (Nintendo, PlayStation, Xbox, Zelda, Roblox, Skyrim)",
    defaultDescEn: "Game consoles, platforms, and franchise titles (Nintendo, PlayStation, Xbox, Zelda, Roblox, Skyrim)",
  },
  tech_brands: {
    id: "tech_brands",
    icon: "💻",
    nameKey: "ignore_lists.category_tech_brands",
    defaultNameRu: "IT и технологии",
    defaultNameEn: "IT & Tech",
    shortNameKey: "ignore_lists.badge_tech",
    shortNameRu: "IT",
    shortNameEn: "IT",
    descKey: "ignore_lists.category_tech_brands_desc",
    defaultDescRu: "IT-бренды, аппаратные стандарты и протоколы (Google, Microsoft, Nvidia, Asus, Xiaomi, Bluetooth, WiFi, HDMI)",
    defaultDescEn: "Tech brands, hardware standards, and protocols (Google, Microsoft, Nvidia, Asus, Xiaomi, Bluetooth, WiFi, HDMI)",
  },
  music: {
    id: "music",
    icon: "🎵",
    nameKey: "ignore_lists.category_music",
    defaultNameRu: "Музыка и исполнители",
    defaultNameEn: "Music & Artists",
    shortNameKey: "ignore_lists.badge_music",
    shortNameRu: "Музыка",
    shortNameEn: "Music",
    descKey: "ignore_lists.category_music_desc",
    defaultDescRu: "Музыкальные группы и исполнители (Radiohead, Metallica, Coldplay, Rammstein, Nirvana, Shakira)",
    defaultDescEn: "Music bands, artists, and groups (Radiohead, Metallica, Coldplay, Rammstein, Nirvana, Shakira)",
  },
  cinema: {
    id: "cinema",
    icon: "🎬",
    nameKey: "ignore_lists.category_cinema",
    defaultNameRu: "Кино и персонажи",
    defaultNameEn: "Cinema & Characters",
    shortNameKey: "ignore_lists.badge_cinema",
    shortNameRu: "Кино",
    shortNameEn: "Cinema",
    descKey: "ignore_lists.category_cinema_desc",
    defaultDescRu: "Фильмы, сериалы и персонажи (Hogwarts, Marvel, Batman, Superman, Gandalf, Skywalker)",
    defaultDescEn: "Movies, franchises, and characters (Hogwarts, Marvel, Batman, Superman, Gandalf, Skywalker)",
  },
  brands: {
    id: "brands",
    icon: "🏷️",
    nameKey: "ignore_lists.category_brands",
    defaultNameRu: "Мировые бренды",
    defaultNameEn: "Global Brands",
    shortNameKey: "ignore_lists.badge_brands",
    shortNameRu: "Бренды",
    shortNameEn: "Brands",
    descKey: "ignore_lists.category_brands_desc",
    defaultDescRu: "Бренды авто, одежды и продуктов (Nike, Adidas, Toyota, Tesla, Pepsi, Lego, Zara)",
    defaultDescEn: "Auto, apparel, and consumer brands (Nike, Adidas, Toyota, Tesla, Pepsi, Lego, Zara)",
  },
  names_cities: {
    id: "names_cities",
    icon: "🏙️",
    nameKey: "ignore_lists.category_names_cities",
    defaultNameRu: "Города и имена",
    defaultNameEn: "Cities & Names",
    shortNameKey: "ignore_lists.badge_cities",
    shortNameRu: "Города и имена",
    shortNameEn: "Cities & Names",
    descKey: "ignore_lists.category_names_cities_desc",
    defaultDescRu: "Мировые столицы, города и имена (Tokyo, Madrid, London, Paris, Berlin, Carlos, Michael).",
    defaultDescEn: "World capitals, cities, and personal names (Tokyo, Madrid, London, Paris, Berlin, Carlos, Michael).",
  },
  anglicisms: {
    id: "anglicisms",
    icon: "🗣️",
    nameKey: "ignore_lists.category_anglicisms",
    defaultNameRu: "Общие англицизмы",
    defaultNameEn: "Common Anglicisms",
    shortNameKey: "ignore_lists.badge_anglicism",
    shortNameRu: "Англицизм",
    shortNameEn: "Anglicism",
    descKey: "ignore_lists.category_anglicisms_desc",
    defaultDescRu: "Заимствования в не-английских текстах. Автоматически отключено при изучении английского.",
    defaultDescEn: "English loanwords in foreign texts. Automatically disabled when studying English.",
  },
};

export const DEFAULT_IGNORE_CATEGORIES: IgnoreCategorySettings = {
  gaming: true,
  tech_brands: true,
  music: true,
  cinema: true,
  brands: true,
  names_cities: true,
  anglicisms: true,
};

export interface AutoIgnoreResult {
  isIgnored: boolean;
  categoryId: IgnoreCategoryId | null;
  nameKey: string;
  shortNameKey: string;
  categoryLabelRu: string;
  categoryLabelEn: string;
  shortNameRu: string;
  shortNameEn: string;
  icon: string;
}

// Pre-compiled language-scoped category Sets for ultra-fast O(1) lookup
class IgnoreListManager {
  // Key format: `${langCode}_${catId}`
  private cache: Map<string, Set<string>> = new Map();

  constructor() {
    this.precompile();
  }

  private precompile() {
    const supportedLangs = ["es", "fr", "de", "ru", "it", "pt", "en"];

    const langData: Record<string, { gaming: string[]; tech: string[]; music: string[]; cinema: string[]; brands: string[]; cities: string[]; names: string[]; misc: string[]; typos: string[] }> = {
      es: { gaming: esGaming, tech: esTech, music: esMusic, cinema: esCinema, brands: esBrands, cities: esCities, names: esNames, misc: esMisc, typos: esTypos },
      en: { gaming: [], tech: [], music: enMusic, cinema: enCinema, brands: enBrands, cities: enCities, names: enNames, misc: enMisc, typos: enTypos },
      fr: { gaming: frGaming, tech: [], music: frMusic, cinema: frCinema, brands: frBrands, cities: frCities, names: frNames, misc: frMisc, typos: frTypos },
      de: { gaming: deGaming, tech: [], music: deMusic, cinema: deCinema, brands: deBrands, cities: deCities, names: deNames, misc: deMisc, typos: deTypos },
      ru: { gaming: ruGaming, tech: ruTech, music: ruMusic, cinema: ruCinema, brands: ruBrands, cities: ruCities, names: ruNames, misc: ruMisc, typos: ruTypos },
      it: { gaming: itGaming, tech: [], music: itMusic, cinema: itCinema, brands: itBrands, cities: itCities, names: itNames, misc: itMisc, typos: itTypos },
      pt: { gaming: ptGaming, tech: [], music: ptMusic, cinema: ptCinema, brands: ptBrands, cities: ptCities, names: ptNames, misc: ptMisc, typos: ptTypos },
    };

    supportedLangs.forEach((langCode) => {
      const data = langData[langCode] || { gaming: [], tech: [], music: [], cinema: [], brands: [], cities: [], names: [], misc: [], typos: [] };

      // Helper
      const buildSet = (universalArr: string[], langArr: string[]) => {
        const s = new Set<string>();
        universalArr.forEach((w) => {
          const c = w.trim().toLowerCase();
          if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) s.add(c);
        });
        langArr.forEach((w) => {
          const c = w.trim().toLowerCase();
          if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) s.add(c);
        });
        return s;
      };

      // 1. Gaming
      this.cache.set(`${langCode}_gaming`, buildSet(universalGaming, data.gaming));

      // 2. Tech
      this.cache.set(`${langCode}_tech_brands`, buildSet(universalTech, data.tech));

      // 3. Music
      this.cache.set(`${langCode}_music`, buildSet(universalMusic, data.music));

      // 4. Cinema
      this.cache.set(`${langCode}_cinema`, buildSet(universalCinema, data.cinema));

      // 5. Brands
      this.cache.set(`${langCode}_brands`, buildSet(universalBrands, data.brands));

      // 6. Names & Cities
      const namesCitiesSet = new Set<string>();
      universalCities.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      universalNames.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      data.cities.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      data.names.forEach((w) => {
        const c = w.trim().toLowerCase();
        if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) namesCitiesSet.add(c);
      });
      this.cache.set(`${langCode}_names_cities`, namesCitiesSet);

      // 7. Anglicisms
      const anglicismsSet = new Set<string>();
      if (langCode !== "en") {
        data.gaming.forEach((w) => {
          const c = w.trim().toLowerCase();
          if (c && !PROTECTED_WORDS_BLACKLIST.has(c)) anglicismsSet.add(c);
        });
      }
      this.cache.set(`${langCode}_anglicisms`, anglicismsSet);

      // 8. Misc (Always active background category)
      this.cache.set(`${langCode}_misc`, buildSet(universalMisc, data.misc));

      // 9. Typos & ASR noise (Always active background category)
      this.cache.set(`${langCode}_typos`, buildSet(universalTypos, data.typos));
    });
  }

  /**
   * Returns total words count for a category in a specific language
   */
  public getCategoryWordCount(catId: IgnoreCategoryId, targetLanguage: string = "Spanish"): number {
    const langCode = getLanguageCode(targetLanguage);
    const cacheKey = `${langCode}_${catId}`;
    const set = this.cache.get(cacheKey);
    return set ? set.size : 0;
  }

  /**
   * Fast O(1) language-aware auto-ignore lookup.
   */
  public checkAutoIgnore(
    cleanWord: string,
    settings?: ReaderSettings,
    targetLanguage: string = "Spanish"
  ): AutoIgnoreResult {
    if (!cleanWord) {
      return {
        isIgnored: false,
        categoryId: null,
        nameKey: "",
        shortNameKey: "",
        categoryLabelRu: "",
        categoryLabelEn: "",
        shortNameRu: "",
        shortNameEn: "",
        icon: "",
      };
    }

    const lower = cleanWord.trim().toLowerCase();

    // 1. Strict protection: never ignore words that match countries or protected homonyms
    if (PROTECTED_WORDS_BLACKLIST.has(lower)) {
      return {
        isIgnored: false,
        categoryId: null,
        nameKey: "",
        shortNameKey: "",
        categoryLabelRu: "",
        categoryLabelEn: "",
        shortNameRu: "",
        shortNameEn: "",
        icon: "",
      };
    }

    // 2. Resolve target language code (e.g. "es", "en", "de", "fr", "ru")
    const langCode = getLanguageCode(targetLanguage);

    // 3. Resolve enabled categories from user settings (defaulting to all true)
    const categorySettings: IgnoreCategorySettings = {
      ...DEFAULT_IGNORE_CATEGORIES,
      ...(settings?.ignoreCategories || {}),
    };

    for (const catId of (Object.keys(IGNORE_CATEGORIES_CONFIG) as IgnoreCategoryId[])) {
      if (!categorySettings[catId]) continue;

      const cacheKey = `${langCode}_${catId}`;
      const set = this.cache.get(cacheKey);

      if (set && set.has(lower)) {
        const meta = IGNORE_CATEGORIES_CONFIG[catId];
        return {
          isIgnored: true,
          categoryId: catId,
          nameKey: meta.nameKey,
          shortNameKey: meta.shortNameKey,
          categoryLabelRu: meta.defaultNameRu,
          categoryLabelEn: meta.defaultNameEn,
          shortNameRu: meta.shortNameRu,
          shortNameEn: meta.shortNameEn,
          icon: meta.icon,
        };
      }
    }

    // 4. Background Misc & Typos Categories (always checked)
    const miscSet = this.cache.get(`${langCode}_misc`);
    if (miscSet && miscSet.has(lower)) {
      return {
        isIgnored: true,
        categoryId: null,
        nameKey: "ignore_lists.badge_misc",
        shortNameKey: "ignore_lists.badge_misc",
        categoryLabelRu: "Разное",
        categoryLabelEn: "Misc",
        shortNameRu: "Разное",
        shortNameEn: "Misc",
        icon: "🧩",
      };
    }

    const typosSet = this.cache.get(`${langCode}_typos`);
    if (typosSet && typosSet.has(lower)) {
      return {
        isIgnored: true,
        categoryId: null,
        nameKey: "ignore_lists.auto_ignored_badge",
        shortNameKey: "ignore_lists.auto_ignored_badge",
        categoryLabelRu: "Игнор",
        categoryLabelEn: "Ignore",
        shortNameRu: "Игнор",
        shortNameEn: "Ignore",
        icon: "🚫",
      };
    }

    return {
      isIgnored: false,
      categoryId: null,
      nameKey: "",
      shortNameKey: "",
      categoryLabelRu: "",
      categoryLabelEn: "",
      shortNameRu: "",
      shortNameEn: "",
      icon: "",
    };
  }
}

export const ignoreListManager = new IgnoreListManager();

/**
 * Utility to parse mass input text into normalized unique words for importing.
 */
export function parseWordsForMassImport(text: string): string[] {
  if (!text) return [];

  // Split by newlines, commas, semicolons, or whitespace
  const rawTokens = text.split(/[\r\n,;]+|\s+/);
  const resultSet = new Set<string>();

  for (const token of rawTokens) {
    const clean = token
      .replace(/^[^\w\p{L}]+|[^\w\p{L}]+$/gu, "")
      .trim()
      .toLowerCase();

    if (clean.length > 0) {
      resultSet.add(clean);
    }
  }

  return Array.from(resultSet);
}
