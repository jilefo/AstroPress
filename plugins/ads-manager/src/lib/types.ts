export interface AdSlot {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
}

export type AdKind = "html" | "iframe" | "image";

export interface AdTargeting {
  langs: string[];
  devices: Array<"mobile" | "desktop">;
  pathIncludes: string[];
}

export interface AdUnit {
  id: number;
  title: string;
  content: string;
  kind: AdKind;
  slots: string[];
  weight: number;
  scheduleStart: string;
  scheduleEnd: string;
  targeting: AdTargeting;
  sandbox: boolean;
  noScriptFallback: string;
  gdprConsentRequired: boolean;
}

export interface ReqCtx {
  lang: string | null;
  device: "mobile" | "desktop";
  path: string;
  consent: boolean;
}

export function listVal(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const v = raw.trim();
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}