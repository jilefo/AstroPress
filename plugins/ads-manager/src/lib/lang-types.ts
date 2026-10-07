export interface MlSettingsLite {
  defaultLang?: string;
  languages?: Array<{ code: string; enabled: boolean }>;
}