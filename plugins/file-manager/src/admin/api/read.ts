import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { basename, extname } from "node:path";
import { errMsg, json } from "../../lib/http";
import { PathError, resolveSafe } from "../../lib/paths";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * GET /admin-ext/api/files/read?path=
 * 读取文本文件内容供在线查看/编辑。
 * 安全：路径锁定站点根；仅允许白名单文本扩展名（含常见无扩展名点文件）；
 *      大小 ≤1MB；二进制/超大文件拒绝。
 */
const MAX_READ = 1024 * 1024;
const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx",
  ".astro", ".css", ".scss", ".less", ".html", ".htm", ".xml", ".svg",
  ".yml", ".yaml", ".ini", ".conf", ".env", ".sh", ".bash", ".zsh",
  ".bat", ".cmd", ".ps1", ".sql", ".log", ".vue", ".svelte", ".toml",
  ".php", ".py", ".rb", ".go", ".rs", ".java", ".c", ".h", ".cpp",
  ".gitignore", ".npmrc", ".editorconfig",
]);
const TEXT_DOTFILES = new Set([
  "dockerfile", "license", "readme", "changelog", "makefile", ".gitignore",
  ".npmrc", ".env", ".editorconfig",
]);

export function isEditableName(name: string): boolean {
  const lower = name.toLowerCase();
  const ext = extname(lower);
  if (TEXT_EXT.has(ext)) return true;
  if (TEXT_DOTFILES.has(lower)) return true;
  // 点文件一律按文本处理（.env.production、.npmrc 等）
  if (lower.startsWith(".")) return true;
  return false;
}

export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  const rel = new URL(request.url).searchParams.get("path") ?? "";
  if (!rel) return json({ error: "缺少 path 参数" }, 400);

  try {
    const abs = resolveSafe(rel);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) return json({ error: "文件不存在" }, 404);
    if (st.isDirectory()) return json({ error: "不能读取目录" }, 400);
    if (st.size > MAX_READ) return json({ error: "文件过大（>1MB），请下载后编辑" }, 413);
    if (!isEditableName(basename(abs))) {
      return json({ error: "不支持在线查看的文件类型（仅文本文件），请下载后查看" }, 415);
    }
    const content = await fs.readFile(abs, "utf8");
    // 去除 BOM，保存时按无 BOM UTF-8 写回
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    return json({ path: rel, content: text, size: st.size });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
