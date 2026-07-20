import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from './locales/fr.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'readigma_language';

// Device locale as a same-turn best guess (no network/AsyncStorage round
// trip needed) — overridden below by the user's saved choice, if any, once
// that async read resolves. Falls back to English for any locale we don't
// have a translation for.
function deviceLanguage(): AppLanguage {
  const code = Localization.getLocales()[0]?.languageCode;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '') ? (code as AppLanguage) : 'en';
}

i18next
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    lng: deviceLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React already escapes — double-escaping would show literal "&amp;" etc.
    compatibilityJSON: 'v4',
  });

// Applies the user's saved language preference once AsyncStorage resolves —
// called once from app/_layout.tsx on startup. A no-op if they've never set
// one, leaving deviceLanguage()'s guess in place.
export async function loadSavedLanguage() {
  const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) {
    await i18next.changeLanguage(saved);
  }
}

export async function setAppLanguage(lang: AppLanguage) {
  await i18next.changeLanguage(lang);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export default i18next;
