import type { APIRoute } from "astro";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import { unzipSync } from "fflate";
import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { errMsg, json, sameOrigin } from "../../lib/http";
import {
  PathError,
  assertWritableRel,
  isProtectedRel,
  resolveSafe,
} from "../../lib/paths";

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.stat(abs);
    return true;
  } catch {
    return false;
  }
}

/** zip 条目名校验：拒绝绝对路径 / 盘符 / .. 段 / null 字节（zip-slip） */
function isUnsafeEntry(name: string): boolean {
  if (!name || name.includes("\0")) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  const segs = name.split(/[\\/]+/);
  return segs.some((s) => s === ".." || s === "");
}

const MAX_ZIP_FILE_BYTES = 256 * 1024 * 1024; // 压缩包本身上限 256MB
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024; // 解压后总字节上限 512MB（防 zip-bomb）
const MAX_ENTRY_COUNT = 20_000; // 条目数上限

/**
 * POST /admin-ext/api/files/unzip {path, confirm}
 * 解压到 <name> 文件夹；冲突时 <name>-extracted，再冲突加 -1/-2 后缀。
 * 返回 {dir, count}。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }
  if (body?.confirm !== true) return json({ error: "需要 confirm:true 确认" }, 403);

  const rel = body?.path;
  if (typeof rel !== "string" || !rel.trim()) return json({ error: "缺少 path" }, 400);
  if (!rel.toLowerCase().endsWith(".zip")) {
    return json({ error: "只支持解压 .zip 文件" }, 400);
  }

  try {
    assertWritableRel(rel);
    const abs = resolveSafe(rel);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) return json({ error: "zip 文件不存在" }, 404);
    if (st.isDirectory()) return json({ error: "目标是目录" }, 400);
    if (st.size > MAX_ZIP_FILE_BYTES) {
      return json({ error: "zip 文件超过 256MB，已拒绝" }, 413);
    }

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await fs.readFile(abs)));
    } catch {
      return json({ error: "无法解压：不是有效的 zip 文件" }, 400);
    }

    const allNames = Object.keys(entries);
    if (allNames.length > MAX_ENTRY_COUNT) {
      return json({ error: `zip 条目数超过 ${MAX_ENTRY_COUNT}，已拒绝（疑似 zip-bomb）` }, 413);
    }
    // 展开后总字节封顶：高压缩比嵌套炸弹在写盘前被拦下
    let expanded = 0;
    for (const v of Object.values(entries)) {
      expanded += v.byteLength;
      if (expanded > MAX_EXPANDED_BYTES) {
        return json({ error: "解压后总大小超过 512MB，已拒绝（疑似 zip-bomb）" }, 413);
      }
    }

    const names = allNames.filter((n) => !n.endsWith("/"));
    if (!names.length) return json({ error: "zip 内没有文件" }, 400);
    for (const n of names) {
      if (isUnsafeEntry(n)) {
        return json({ error: `zip 包含非法路径条目：${n}（zip-slip 已拦截）` }, 400);
      }
      if (isProtectedRel(n)) {
        return json({ error: `zip 包含受保护路径条目：${n}` }, 400);
      }
    }

    // 目标目录：<name> → <name>-extracted → <name>-extracted-N
    const parent = dirname(abs);
    const fileName = rel.replace(/\\/g, "/").split("/").pop() ?? "archive.zip";
    const stem = fileName.slice(0, fileName.length - 4);
    let dirName = stem;
    let target = join(parent, dirName);
    if (await pathExists(target)) {
      dirName = `${stem}-extracted`;
      target = join(parent, dirName);
      let n = 0;
      while (await pathExists(target)) {
        n += 1;
        dirName = `${stem}-extracted-${n}`;
        target = join(parent, dirName);
      }
    }
    await fs.mkdir(target, { recursive: true });

    let count = 0;
    for (const n of names) {
      const segs = n.split(/[\\/]+/).filter(Boolean);
      const dest = join(target, ...segs);
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.writeFile(dest, entries[n]);
      count += 1;
    }

    return json({ ok: true, dir: dirName, count });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
