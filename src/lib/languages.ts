export const APP_LANGUAGES = [
  { code: "zh-TW", labelKey: "lang.zhTW" },
  { code: "zh-CN", labelKey: "lang.zhCN" },
  { code: "en", labelKey: "lang.en" },
  { code: "ja", labelKey: "lang.ja" },
  { code: "ko", labelKey: "lang.ko" },
  { code: "es", labelKey: "lang.es" },
  { code: "fr", labelKey: "lang.fr" },
  { code: "de", labelKey: "lang.de" },
  { code: "pt-BR", labelKey: "lang.ptBR" },
] as const;

export type AppLanguageCode = (typeof APP_LANGUAGES)[number]["code"];

const CODE_SET = new Set<string>(APP_LANGUAGES.map((l) => l.code));

export function isAppLanguage(code: string): code is AppLanguageCode {
  return CODE_SET.has(code);
}

export function detectBrowserLanguage(): AppLanguageCode {
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("zh-tw") || nav === "zh-hant") return "zh-TW";
  if (nav.startsWith("zh")) return "zh-CN";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("de")) return "de";
  if (nav.startsWith("pt")) return "pt-BR";
  return "en";
}

export function normalizeAppLanguage(lng: string): AppLanguageCode {
  if (isAppLanguage(lng)) return lng;
  const lower = lng.toLowerCase();
  if (lower.startsWith("zh")) {
    return lower.includes("tw") || lower.includes("hant") ? "zh-TW" : "zh-CN";
  }
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("pt")) return "pt-BR";
  return "en";
}

export function localeForDates(code: AppLanguageCode): string {
  return code;
}
