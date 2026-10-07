import type { APIRoute } from "astro";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import { zipSync } from "fflate";
import * as fs from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { errMsg, json, sameOrigin } from "../../lib/http";
import {
  PathError,
  assertWritableRel,
  commonParentDir,
  resolveSafe,
  siteRoot,
  uniqueTarget,
} from "../../lib/paths";

function toRel(abs: string): string {
  return relative(siteRoot, abs).split(sep).join("/");
}

const MAX_ZIP_BYTES = 256 * 1024 * 1024; // 打包总字节上限 256MB

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.stat(abs);
    return true;
  } catch {
    return false;
  }
}

/** 递归收集目录下全部文件（abs → zip 内相对路径） */
async function collect(
  abs: string,
  prefix: string,
  out: Array<{ entry: string; abs: string; size: number }>,
): Promise<void> {
  const st = await fs.stat(abs);
  if (st.isDirectory()) {
    const names = await fs.readdir(abs);
    names.sort();
    for (const n of names) {
      await collect(join(abs, n), `${prefix}/${n}`, out);
    }
    return;
  }
  out.push({ entry: prefix, abs, size: st.size });
}

/**
 * POST /admin-ext/api/files/zip {paths[], confirm}
 * 生成到共同父目录：单条目 <name>.zip，多条目 archive-<时间戳>.zip；
 * 同名冲突自动加 -1/-2 后缀。返回 {file}（相对父目录的文件名）。
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

  const paths = body?.paths;
  if (!Array.isArray(paths) || !paths.length) {
    return json({ error: "缺少 paths 数组" }, 400);
  }

  try {
    const absList: string[] = [];
    for (const rel of paths) {
      if (typeof rel !== "string" || !rel.trim()) throw new PathError("存在空路径");
      assertWritableRel(rel);
      const abs = resolveSafe(rel);
      const st = await fs.stat(abs).catch(() => null);
      if (!st) throw new PathError(`路径不存在：${rel}`, 404);
      absList.push(abs);
    }

    // ─── 收集文件并统计总字节 ───
    const files: Array<{ entry: string; abs: string; size: number }> = [];
    let total = 0;
    for (const abs of absList) {
      await collect(abs, basename(abs), files);
    }
    // 不同目录下同名条目前缀加序号，避免 zip 内 key 冲突
    const seen = new Set<string>();
    for (const f of files) {
      if (seen.has(f.entry)) {
        let i = 1;
        let alt = `${i}-${f.entry}`;
        while (seen.has(alt)) {
          i += 1;
          alt = `${i}-${f.entry}`;
        }
        f.entry = alt;
      }
      seen.add(f.entry);
      total += f.size;
      if (total > MAX_ZIP_BYTES) {
        return json({ error: "打包内容超过 256MB，已拒绝" }, 413);
      }
    }

    const outDir = commonParentDir(absList);
    const base =
      absList.length === 1
        ? `${basename(absList[0])}.zip`
        : `archive-${new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15)}.zip`;
    const target = await uniqueTarget(outDir, base, pathExists);

    const zippable: Record<string, Uint8Array> = {};
    for (const f of files) {
      zippable[f.entry] = new Uint8Array(await fs.readFile(f.abs));
    }
    const zipped = zipSync(zippable, { level: 0 });
    await fs.writeFile(target.abs, zipped);

    return json({
      ok: true,
      file: target.name,
      path: toRel(target.abs),
      size: zipped.length,
      count: files.length,
    });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
