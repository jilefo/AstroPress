import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// src/lib 下：lib → src → static-html → plugins → 仓库根，共上溯 4 级
const libDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
export const siteRoot = resolve(libDir, "..", "..", "..", "..");

/**
 * 禁止作为导出目标的顶层目录：系统/源码目录，避免误写误覆盖。
 * 导出只允许在站点根下的独立普通目录（默认 static-html/）。
 */
const DENY_TOP = new Set([
  ".git",
  "node_modules",
  ".astro",
  "apps",
  "packages",
  "plugins",
  "scripts",
  "panel",
  "public",
  "data",
  ".vscode",
  ".github",
  "src",
]);

/** 校验输出目录：相对路径、单段或多段普通目录、不穿越、非系统目录 */
export function isSafeOutputDir(rel: string): boolean {
  if (typeof rel !== "string") return false;
  if (!rel || rel.includes("\0")) return false;
  if (isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith("\\\\")) return false;
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  if (segs.length === 0) return false; // 禁止写站点根本身
  for (const s of segs) {
    if (s === "." || s === "..") return false;
    if (/[<>:"|?*\x00-\x1f]/.test(s)) return false;
  }
  if (DENY_TOP.has(segs[0].toLowerCase())) return false;
  const abs = resolve(siteRoot, rel);
  if (abs !== siteRoot && !abs.startsWith(siteRoot + sep)) return false;
  return true;
}

/** 已校验的相对路径 → 绝对路径（调用前需先过 isSafeOutputDir） */
export function resolveOutputDir(rel: string): string {
  return resolve(siteRoot, rel);
}

/** URL 路径段 → 磁盘相对路径段的白名单校验（防穿越/非法字符） */
export function safeUrlPathToRel(urlPath: string): string | null {
  if (!urlPath.startsWith("/")) return null;
  // 去掉 query/hash（理论上 fetch 前已处理）
  const clean = urlPath.split("?")[0].split("#")[0];
  const segs = decodeURIComponent(clean).split("/").filter(Boolean);
  for (const s of segs) {
    if (!s || s === "." || s === "..") return null;
    if (s.includes("\\") || /[<>:"|?*\x00-\x1f]/.test(s)) return null;
  }
  return segs.join("/");
}
