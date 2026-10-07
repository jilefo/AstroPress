/// <reference path="../env.d.ts" />
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/lib 下：lib → src → backup → plugins → 仓库根，共上溯 4 级
const libDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
export const repoRoot = resolve(libDir, "..", "..", "..", "..");

/** 备份输出目录（仓库根 backups/） */
export const backupDir = resolve(repoRoot, "backups");

export async function ensureBackupDir(): Promise<string> {
  await fs.mkdir(backupDir, { recursive: true });
  return backupDir;
}

/**
 * file: URL → 本机路径。
 * 支持 file:///C:/..（标准 URL）与 file:D:/..（AstroPress 配置常见写法）。
 * 相对路径相对仓库根解析；非 file 协议返回空串。
 */
export function fileUrlToFsPath(url: string): string {
  if (url.startsWith("file://")) {
    try {
      return fileURLToPath(url);
    } catch {
      return "";
    }
  }
  if (url.startsWith("file:")) {
    const rest = url.slice(5);
    if (!rest) return "";
    // 形如 file:./local.db 的相对路径，统一按仓库根解析
    return isAbsolute(rest) ? rest : resolve(repoRoot, rest);
  }
  return "";
}

/**
 * 主数据库文件路径：
 *   virtual:astropress/config 的 database.url 优先；
 *   不可用时回退仓库根 local.db。
 */
export async function resolveDbFile(): Promise<string> {
  try {
    const cfg: any = await import("virtual:astropress/config");
    const url: unknown = cfg?.database?.url;
    if (typeof url === "string" && url.startsWith("file:")) {
      const p = fileUrlToFsPath(url);
      if (p) return p;
    }
  } catch {
    /* 虚拟模块不可用，走回退路径 */
  }
  return resolve(repoRoot, "local.db");
}

/**
 * 媒体目录探测：优先 apps/admin/public/media，
 * 通过 fs 探测确认存在且为目录，否则返回 null。
 */
export async function findMediaDir(): Promise<string | null> {
  const candidates = [resolve(repoRoot, "apps", "admin", "public", "media")];
  for (const dir of candidates) {
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) return dir;
    } catch {
      /* 不存在，继续探测 */
    }
  }
  return null;
}
