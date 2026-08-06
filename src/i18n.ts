import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from './locales/en/translation.json';
import translationRU from './locales/ru/translation.json';

const resources = {
  en: {
    translation: translationEN,
  },
  ru: {
    translation: translationRU,
  },
};

const getInitialLanguage = (): string => {
  try {
    const saved = localStorage.getItem('i18nextLng');
    if (saved === 'ru' || saved === 'en') {
      return saved;
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
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  try {
    if (lng === 'ru' || lng === 'en') {
      localStorage.setItem('i18nextLng', lng);
    }
  } catch (_) {}
});

export default i18n;
