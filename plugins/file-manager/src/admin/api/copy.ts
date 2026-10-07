import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { errMsg, json, sameOrigin } from "../../lib/http";
import { PathError, isProtectedRel, resolveSafe, siteRoot } from "../../lib/paths";
import { copyRecursive, moveEntry } from "../../lib/fs-util";
import { hasFileSystem, envNotSupported } from "@astropress/core";

interface Body {
  sources?: unknown;
  destDir?: unknown;
  confirm?: unknown;
}

interface ItemResult {
  src: string;
  ok: boolean;
  dest?: string;
  error?: string;
}

function toRel(abs: string): string {
  return relative(siteRoot, abs).split(sep).join("/");
}

/** 复制 / 移动共用处理 */
export async function runTransfer(
  request: Request,
  mode: "copy" | "move"
): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }
  if (body.confirm !== true) return json({ error: "操作必须先确认" }, 403);
  const sources = body.sources;
  const destRel = typeof body.destDir === "string" ? body.destDir : "";
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 100) {
    return json({ error: "sources 必须是 1-100 个路径的数组" }, 400);
  }

  try {
    if (isProtectedRel(destRel)) return json({ error: "目标目录受保护" }, 400);
    const destAbs = resolveSafe(destRel);
    const destSt = await fs.stat(destAbs).catch(() => null);
    if (!destSt || !destSt.isDirectory()) return json({ error: "目标目录不存在" }, 400);

    const results: ItemResult[] = [];
    for (const raw of sources) {
      const rel = String(raw);
      try {
        if (isProtectedRel(rel)) throw new PathError("受保护目录禁止操作");
        const srcAbs = resolveSafe(rel);
        const st = await fs.stat(srcAbs).catch(() => null);
        if (!st) throw new PathError("源不存在", 404);
        // 防环：目录不能复制/移动到自身或其子孙目录
        if (st.isDirectory() && (srcAbs === destAbs || destAbs.startsWith(srcAbs + sep))) {
          throw new PathError("不能移动/复制到自身或其子目录");
        }
        if (mode === "move" && dirname(srcAbs) === destAbs) {
          throw new PathError("源与目标在同一目录，请使用重命名");
        }
        const finalAbs =
          mode === "copy"
            ? await copyRecursive(srcAbs, destAbs)
            : await moveEntry(srcAbs, destAbs);
        results.push({ src: rel, ok: true, dest: toRel(finalAbs) });
      } catch (e: any) {
        results.push({
          src: rel,
          ok: false,
          error: e instanceof PathError ? e.message : errMsg(e),
        });
      }
    }
    const done = results.filter((r) => r.ok).length;
    return json({ ok: done > 0, mode, done, failed: results.length - done, results });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
}

export function guard(locals: any, request: Request): Response | null {
  if (!locals?.user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);
  return null;
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const denied = guard(locals, request);
  if (denied) return denied;
  return runTransfer(request, "copy");
};
