import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import { errMsg, json } from "../../lib/http";
import {
  PathError,
  isProtectedRel,
  normalizeRel,
  resolveSafe,
} from "../../lib/paths";

interface Item {
  name: string;
  type: "dir" | "file";
  size: number;
  mtime: string;
  protected: boolean;
}

/** GET /admin-ext/api/files/list?path= — 目录列表（目录在前，按名称排序） */
export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  const relRaw = new URL(request.url).searchParams.get("path") ?? "";
  try {
    const abs = resolveSafe(relRaw);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) return json({ error: "路径不存在" }, 404);
    if (!st.isDirectory()) return json({ error: "不是目录" }, 400);

    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const items: Item[] = [];
    for (const d of dirents) {
      const childRel = normalizeRel(relRaw ? `${normalizeRel(relRaw)}/${d.name}` : d.name);
      let size = 0;
      let mtime = "";
      try {
        const s = await fs.stat(join(abs, d.name));
        size = d.isDirectory() ? 0 : s.size;
        mtime = s.mtime.toISOString();
      } catch {
        continue; // 枚举期间被删除的条目跳过
      }
      items.push({
        name: d.name,
        type: d.isDirectory() ? "dir" : "file",
        size,
        mtime,
        protected: isProtectedRel(childRel),
      });
    }
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    });

    const rel = normalizeRel(relRaw);
    const parent = rel
      ? rel.includes("/")
        ? rel.slice(0, rel.lastIndexOf("/"))
        : ""
      : null;

    return json({ path: rel, parent, items });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
