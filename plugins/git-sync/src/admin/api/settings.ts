import type { APIRoute } from "astro";
import { PRESETS } from "../../lib/drivers";
import { json, sameOrigin } from "../../lib/http";
import {
  DEFAULT_SETTINGS,
  GitSyncSettings,
  loadSettings,
  maskToken,
  sanitizeRemotePath,
  saveSettings,
} from "../../lib/settings";

/** 设置回显：token 只回掩码，不回原文 */
function publicView(s: GitSyncSettings) {
  return {
    preset: s.preset,
    baseUrl: s.baseUrl,
    owner: s.owner,
    repo: s.repo,
    branch: s.branch,
    prefix: s.prefix,
    dumpPath: s.dumpPath,
    scopes: s.scopes,
    hasToken: !!s.token,
    tokenMasked: maskToken(s.token),
  };
}

function validName(v: unknown): v is string {
  // owner/repo/branch：非空、无空白、无斜杠、不含 ..
  return (
    typeof v === "string" &&
    v.trim().length > 0 &&
    v.trim().length <= 200 &&
    !/[\s/\\]/.test(v) &&
    !v.includes("..")
  );
}

/**
 * GET  /admin-ext/api/git-sync/settings  → 当前设置（token 掩码）
 * POST /admin-ext/api/git-sync/settings  {confirm:true, ...} → 保存（token 留空不覆盖）
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  const settings = await loadSettings(db);
  return json({ ok: true, settings: publicView(settings), presets: PRESETS });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }
  if (body?.confirm !== true) return json({ error: "写操作必须先确认" }, 403);

  const preset = typeof body.preset === "string" ? body.preset : "";
  if (!PRESETS[preset]) return json({ error: `未知平台预设：${preset}` }, 400);

  const owner = String(body.owner ?? "").trim();
  const repo = String(body.repo ?? "").trim();
  if (owner && !validName(owner)) return json({ error: "owner 含非法字符" }, 400);
  if (repo && !validName(repo)) return json({ error: "repo 含非法字符" }, 400);

  const branch = String(body.branch ?? "").trim() || DEFAULT_SETTINGS.branch;
  if (!validName(branch)) return json({ error: "分支名含非法字符" }, 400);

  const prefix = sanitizeRemotePath(String(body.prefix ?? ""), true);
  if (prefix === null) return json({ error: "远端目录前缀含非法路径段（.. 等）" }, 400);

  const dumpPath = sanitizeRemotePath(
    String(body.dumpPath ?? "") || DEFAULT_SETTINGS.dumpPath,
    false
  );
  if (dumpPath === null) return json({ error: "dump 远端路径含非法路径段（.. 等）" }, 400);

  const baseUrl = String(body.baseUrl ?? "").trim();
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    return json({ error: "API Base URL 必须以 http:// 或 https:// 开头" }, 400);
  }

  const scopesRaw = body.scopes ?? {};
  const scopes = {
    dbDump: scopesRaw.dbDump === true,
    media: scopesRaw.media === true,
    configJson: scopesRaw.configJson === true,
    site: scopesRaw.site === true,
  };
  if (!scopes.dbDump && !scopes.media && !scopes.configJson && !scopes.site) {
    return json({ error: "请至少勾选一个同步范围" }, 400);
  }

  const current = await loadSettings(db);
  const next: GitSyncSettings = {
    preset,
    baseUrl,
    owner,
    repo,
    branch,
    prefix,
    dumpPath,
    scopes,
    // token 留空 → 保留旧值；非空 → 覆盖
    token: typeof body.token === "string" && body.token.length > 0 ? body.token : current.token,
  };
  await saveSettings(db, next);
  return json({ ok: true, settings: publicView(next) });
};
