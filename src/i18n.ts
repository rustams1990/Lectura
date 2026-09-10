import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from './locales/en/translation.json';
import translationRU from './locales/ru/translation.json';
import translationES from './locales/es/translation.json';
import translationDE from './locales/de/translation.json';
import translationFR from './locales/fr/translation.json';
import translationPT from './locales/pt/translation.json';
import translationZH from './locales/zh/translation.json';
import translationIT from './locales/it/translation.json';
import translationJA from './locales/ja/translation.json';
import translationKO from './locales/ko/translation.json';
import translationPL from './locales/pl/translation.json';
import translationTR from './locales/tr/translation.json';
import translationUK from './locales/uk/translation.json';

const resources = {
  en: {
    translation: translationEN,
  },
  ru: {
    translation: translationRU,
  },
  es: {
    translation: translationES,
  },
  de: {
    translation: translationDE,
  },
  fr: {
    translation: translationFR,
  },
  pt: {
    translation: translationPT,
  },
  zh: {
    translation: translationZH,
  },
  it: {
    translation: translationIT,
  },
  ja: {
    translation: translationJA,
  },
  ko: {
    translation: translationKO,
  },
  pl: {
    translation: translationPL,
  },
  tr: {
    translation: translationTR,
  },
  uk: {
    translation: translationUK,
  },
};

const SUPPORTED_LANGS = ['en', 'de', 'es', 'fr', 'it', 'pl', 'pt', 'ru', 'tr', 'uk', 'zh', 'ja', 'ko'];

const getInitialLanguage = (): string => {
  try {
    const saved = localStorage.getItem('i18nextLng');
    if (saved) {
      const code = saved.toLowerCase().slice(0, 2);
      if (SUPPORTED_LANGS.includes(code)) {
        return code;
      }
    }
  } catch (_) {}
  // Always default to English ('en')
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    returnEmptyString: false,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  try {
    const code = (lng || '').toLowerCase().slice(0, 2);
    if (SUPPORTED_LANGS.includes(code)) {
      localStorage.setItem('i18nextLng', code);
    }
  } catch (_) {}
});

export default i18n;
