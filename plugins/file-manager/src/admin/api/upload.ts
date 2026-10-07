import type { APIRoute } from "astro";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import * as fs from "node:fs/promises";
import { basename } from "node:path";
import { errMsg, json, sameOrigin } from "../../lib/http";
import {
  PathError,
  assertWritableRel,
  resolveSafe,
  uniqueTarget,
} from "../../lib/paths";

const MAX_UPLOAD = 64 * 1024 * 1024; // 单文件 ≤64MB

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.stat(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /admin-ext/api/files/upload（multipart/form-data）
 *   file 上传文件（单文件 ≤64MB，文件名只取 basename）
 *   dir  目标目录（相对站点根）
 * 同名文件自动加 -1/-2 后缀。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "请求必须是 multipart/form-data" }, 400);
  }

  const file = form.get("file");
  const dir = form.get("dir");
  if (!(file instanceof File)) return json({ error: "缺少上传文件 file" }, 400);
  if (typeof dir !== "string") return json({ error: "缺少目标目录 dir" }, 400);
  if (file.size > MAX_UPLOAD) return json({ error: "单文件不能超过 64MB" }, 413);

  const name = basename(file.name || "");
  if (!name || name === "." || name === "..") {
    return json({ error: "非法的文件名" }, 400);
  }

  try {
    assertWritableRel(dir);
    assertWritableRel(dir ? `${dir}/${name}` : name);
    const dirAbs = resolveSafe(dir);
    const st = await fs.stat(dirAbs).catch(() => null);
    if (!st || !st.isDirectory()) return json({ error: "目标目录不存在" }, 400);

    const target = await uniqueTarget(dirAbs, name, pathExists);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await fs.writeFile(target.abs, bytes);
    const relOut = dir
      ? `${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/${target.name}`
      : target.name;
    return json({
      ok: true,
      file: target.name,
      path: relOut,
      size: bytes.length,
      renamed: target.name !== name,
    });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
