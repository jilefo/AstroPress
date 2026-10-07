import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { basename, join } from "node:path";
import { errMsg, json, sameOrigin } from "../../lib/http";
import { PathError, assertWritableRel, resolveSafe } from "../../lib/paths";
import { isEditableName } from "./read";
import { hasFileSystem, envNotSupported } from "@astropress/core";

const MAX_WRITE = 1024 * 1024;

/**
 * POST /admin-ext/api/files/write { path, content, confirm }
 * 保存文本文件（在线编辑/新建）。安全：登录 + 同源 + confirm；受保护目录拒绝；
 * 已存在文件要求白名单文本类型；新建文件要求父目录已存在且为白名单文本扩展名；
 * 内容 ≤1MB；先写临时文件再原子重命名，避免写一半损坏原文件。
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
  const rel: string = body?.path ?? "";
  const content = body?.content;
  if (typeof rel !== "string" || !rel) return json({ error: "缺少 path" }, 400);
  if (typeof content !== "string") return json({ error: "content 必须是字符串" }, 400);
  if (content.length > MAX_WRITE) return json({ error: "内容过大（>1MB）" }, 413);
  if (body.confirm !== true) return json({ error: "保存操作必须先确认" }, 403);

  try {
    assertWritableRel(rel);
    const abs = resolveSafe(rel);
    const name = basename(abs);
    if (!isEditableName(name)) {
      return json({ error: "不支持在线编辑的文件类型" }, 415);
    }
    const st = await fs.stat(abs).catch(() => null);
    if (st?.isDirectory()) return json({ error: "目标是目录" }, 400);
    if (!st) {
      // 新建：父目录必须已存在，避免误创建任意路径
      const parent = await fs.stat(join(abs, "..")).catch(() => null);
      if (!parent?.isDirectory()) return json({ error: "父目录不存在" }, 404);
    }
    const tmp = `${abs}.ap-tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, abs);
    return json({ ok: true, path: rel, size: Buffer.byteLength(content, "utf8"), created: !st });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
