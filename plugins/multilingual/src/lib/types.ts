export interface MlLanguage {
  /** URL prefix, lowercase, e.g. "zh-hans" */
  code: string;
  /** hreflang value, e.g. "zh-Hans" */
  locale: string;
  /** End-user label, e.g. "简体中文" */
  nativeLabel: string;
  enabled: boolean;
}

export interface MlSettings {
  defaultLang: string;
  /** "prefix": /{code}/slug — "param": ?lang=code */
  urlStrategy: "prefix" | "param";
  languages: MlLanguage[];
}

export const DEFAULT_SETTINGS: MlSettings = {
  defaultLang: "en",
  urlStrategy: "prefix",
  languages: [
    { code: "en", locale: "en", nativeLabel: "English", enabled: true },
    { code: "zh-hans", locale: "zh-Hans", nativeLabel: "简体中文", enabled: false },
    { code: "zh-hant", locale: "zh-Hant", nativeLabel: "繁體中文", enabled: false },
    { code: "ko", locale: "ko", nativeLabel: "한국어", enabled: false },
    { code: "ja", locale: "ja", nativeLabel: "日本語", enabled: false },
    { code: "de", locale: "de", nativeLabel: "Deutsch", enabled: false },
    { code: "fr", locale: "fr", nativeLabel: "Français", enabled: false },
  ],
};

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
