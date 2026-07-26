import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhTW from "./locales/zh-TW.json";
import zhCN from "./locales/zh-CN.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ptBR from "./locales/pt-BR.json";
import {
  type AppLanguageCode,
  detectBrowserLanguage,
  isAppLanguage,
} from "./lib/languages";

const STORAGE_KEY = "novel-edit-console-lang";

function detectLanguage(): AppLanguageCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isAppLanguage(stored)) return stored;
  return detectBrowserLanguage();
}

void i18n.use(initReactI18next).init({
  resources: {
    "zh-TW": { translation: zhTW },
    "zh-CN": { translation: zhCN },
    en: { translation: en },
    ja: { translation: ja },
    ko: { translation: ko },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    "pt-BR": { translation: ptBR },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setAppLanguage(lng: AppLanguageCode) {
  localStorage.setItem(STORAGE_KEY, lng);
  void i18n.changeLanguage(lng);
}

export default i18n;
