import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// src/lib 下：lib → src → file-manager → plugins → 仓库根，共上溯 4 级
const libDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
export const siteRoot = resolve(libDir, "..", "..", "..", "..");

/** 受保护目录名：任何路径段命中即禁止写操作（浏览可见但前端置灰） */
export const PROTECTED = [".git", "node_modules", ".astro"];

/** 业务错误：带 HTTP 状态码 */
export class PathError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** 判断相对路径是否命中受保护目录（任一路径段命中即视为受保护） */
export function isProtectedRel(rel: string): boolean {
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  return segs.some((s) => PROTECTED.includes(s));
}

/**
 * 相对路径 → 仓库根内绝对路径。
 * 拒绝：null 字节、绝对路径、穿越出根目录的路径。
 * rel 为空串时表示根目录本身。
 */
export function resolveSafe(rel: string): string {
  if (typeof rel !== "string") throw new PathError("非法路径");
  if (rel.includes("\0")) throw new PathError("非法路径：含 null 字节");
  if (isAbsolute(rel)) throw new PathError("非法路径：不允许绝对路径");
  // Windows 盘符形式（C:\... 或 C:foo）与 UNC 也按绝对路径拒绝
  if (/^[a-zA-Z]:/.test(rel) || rel.startsWith("\\\\")) {
    throw new PathError("非法路径：不允许绝对路径");
  }
  const abs = resolve(siteRoot, rel);
  if (abs !== siteRoot && !abs.startsWith(siteRoot + sep)) {
    throw new PathError("非法路径：超出站点根目录");
  }
  return abs;
}

/** 写操作前的受保护目录校验 */
export function assertWritableRel(rel: string): void {
  if (isProtectedRel(rel)) {
    throw new PathError("受保护目录：.git / node_modules / .astro 禁止修改");
  }
}

/** 规范化相对路径为 posix 形式（用于 API 返回与面包屑） */
export function normalizeRel(rel: string): string {
  return rel.split(/[\\/]+/).filter(Boolean).join("/");
}

/** 计算多个绝对路径的共同父目录（绝对路径） */
export function commonParentDir(absPaths: string[]): string {
  if (!absPaths.length) return siteRoot;
  const dirs = absPaths.map((p) => dirname(p));
  let common = dirs[0];
  for (const d of dirs.slice(1)) {
    while (d !== common && !d.startsWith(common + sep)) {
      const parent = dirname(common);
      if (parent === common) break;
      common = parent;
    }
  }
  return common;
}

/** 生成不冲突的目标路径：name.ext 冲突时返回 name-1.ext / name-2.ext … */
export async function uniqueTarget(
  dirAbs: string,
  base: string,
  exists: (abs: string) => Promise<boolean>,
): Promise<{ name: string; abs: string }> {
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let name = base;
  let abs = resolve(dirAbs, name);
  let n = 0;
  while (await exists(abs)) {
    n += 1;
    name = `${stem}-${n}${ext}`;
    abs = resolve(dirAbs, name);
  }
  return { name, abs };
}
