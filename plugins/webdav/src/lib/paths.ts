import * as fs from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// src/lib 下：lib → src → webdav → plugins → 仓库根，共上溯 4 级
const libDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
export const repoRoot = resolve(libDir, "..", "..", "..", "..");

/** WebDAV 存储根目录（仓库根 webdav-storage/） */
export const storageRoot = resolve(repoRoot, "webdav-storage");

/** 业务错误：带 HTTP 状态码 */
export class DavError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** 存储目录自动创建 */
export async function ensureStorageRoot(): Promise<string> {
  await fs.mkdir(storageRoot, { recursive: true });
  return storageRoot;
}

/**
 * WebDAV URL 相对路径 → 存储根内绝对路径。
 * 拒绝：null 字节、穿越出存储根的路径。
 * rel 为空串时表示存储根本身。
 */
export function resolveDavPath(rel: string): string {
  if (typeof rel !== "string") throw new DavError("非法路径", 403);
  if (rel.includes("\0")) throw new DavError("非法路径：含 null 字节", 403);
  const abs = resolve(storageRoot, rel);
  if (abs !== storageRoot && !abs.startsWith(storageRoot + sep)) {
    throw new DavError("非法路径：超出存储根目录", 403);
  }
  return abs;
}

/** 规范化 Astro rest 参数为 posix 相对路径（去首尾分隔符） */
export function normalizeDavRel(raw: string): string {
  return raw
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
}
