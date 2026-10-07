/**
 * GitHub Gist API 访问层（本插件所有 fetch 集中于此，便于离线 mock 测试）。
 *   - 统一 User-Agent / Accept / Authorization 头
 *   - 20s 超时（AbortSignal.timeout）
 *   - 非 2xx 透传状态码与 GitHub message；401 给中文提示
 */

const API_BASE = "https://api.github.com";
const TIMEOUT_MS = 20000;

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GistFilePayload {
  filename: string;
  description: string;
  content: string;
}

export interface GistResult {
  id: string;
  url: string;
}

interface RequestOptions {
  method: "GET" | "POST" | "PATCH";
  path: string;
  token: string;
  body?: unknown;
}

async function ghRequest(opts: RequestOptions): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${opts.path}`, {
      method: opts.method,
      headers: {
        "User-Agent": "astropress-gist-sync",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${opts.token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort")) {
      throw new GitHubError(0, `请求 GitHub 超时（${TIMEOUT_MS / 1000}s），请检查网络后重试`);
    }
    throw new GitHubError(0, `无法连接 GitHub：${msg}`);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const ghMsg = data && typeof data.message === "string" ? data.message : "";
    if (res.status === 401) {
      throw new GitHubError(
        401,
        `GitHub Token 无效或已过期（401${ghMsg ? `：${ghMsg}` : ""}），请检查 Personal Access Token 是否具备 gist 权限`
      );
    }
    if (res.status === 404) {
      throw new GitHubError(404, `Gist 不存在或 Token 无权访问（404）`);
    }
    throw new GitHubError(res.status, `GitHub API 错误（${res.status}）${ghMsg ? `：${ghMsg}` : ""}`);
  }
  return data;
}

/** GET /gists/{id} — 读取 Gist 完整信息（含文件内容） */
export async function getGist(token: string, gistId: string): Promise<any> {
  return ghRequest({ method: "GET", path: `/gists/${encodeURIComponent(gistId)}`, token });
}

/** POST /gists — 创建私密 Gist，返回 id 与 html_url */
export async function createGist(token: string, payload: GistFilePayload): Promise<GistResult> {
  const data = await ghRequest({
    method: "POST",
    path: "/gists",
    token,
    body: {
      description: payload.description,
      public: false,
      files: { [payload.filename]: { content: payload.content } },
    },
  });
  return { id: String(data?.id ?? ""), url: String(data?.html_url ?? "") };
}

/** PATCH /gists/{id} — 更新既有 Gist 的文件与描述 */
export async function updateGist(
  token: string,
  gistId: string,
  payload: GistFilePayload
): Promise<GistResult> {
  const data = await ghRequest({
    method: "PATCH",
    path: `/gists/${encodeURIComponent(gistId)}`,
    token,
    body: {
      description: payload.description,
      files: { [payload.filename]: { content: payload.content } },
    },
  });
  return { id: String(data?.id ?? gistId), url: String(data?.html_url ?? "") };
}

/** 从 Gist 响应中取指定文件名对应的文件内容 */
export function extractFileContent(gist: any, filename: string): string | null {
  const files = gist?.files;
  if (!files || typeof files !== "object") return null;
  const file = files[filename];
  if (!file || typeof file.content !== "string") return null;
  return file.content;
}
