/**
 * 各 Git 托管平台的 Contents API 驱动（无需本机 git）。
 *
 * 支持矩阵：
 *   - github：GitHub REST，PUT /repos/{owner}/{repo}/contents/{path}（sha 更新语义）
 *   - gitee：Gitee API v5，同样 Contents 语义（access_token 鉴权；POST 创建 / PUT 更新）
 *   - gitea：Gitea API v1 通用驱动，自填 API Base URL（站点根地址，自动拼 /api/v1），
 *     覆盖 Gitea 自建、GitCode、AtomGit、GitLink 等 Gitea 兼容平台
 *   - cnb / codeup：公开 API 与 Contents 语义差异大，stub 返回友好错误
 *
 * 统一约定：
 *   - 所有请求带 User-Agent: AstroPress-Git-Sync，超时 20s
 *   - HTTP 错误透传平台状态码与返回体中的 message 字段
 */

export const REQUEST_TIMEOUT_MS = 20000;
const UA = "AstroPress-Git-Sync";

export class DriverError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "DriverError";
  }
}

/** URL 脱敏：Gitee 把 access_token 放 query，错误消息/日志中不得回显 */
export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const k of [...u.searchParams.keys()]) {
      if (/token|secret|key|password/i.test(k)) u.searchParams.set(k, "***");
    }
    return u.toString();
  } catch {
    return rawUrl.replace(/([?&](?:access_)?token=)[^&]*/gi, "$1***");
  }
}

// ─── 平台预设 ────────────────────────────────────────────────────────────────

export type DriverKind = "github" | "gitee" | "gitea" | "stub";

export interface PresetMeta {
  label: string;
  kind: DriverKind;
  /** gitea 系的默认站点根地址（用户可覆盖）；其余平台为空串 */
  defaultBase: string;
}

export const PRESETS: Record<string, PresetMeta> = {
  github: { label: "GitHub", kind: "github", defaultBase: "" },
  gitee: { label: "Gitee", kind: "gitee", defaultBase: "" },
  gitea: { label: "Gitea（自建/自定义）", kind: "gitea", defaultBase: "" },
  gitcode: { label: "GitCode", kind: "gitea", defaultBase: "https://gitcode.com" },
  atomgit: { label: "AtomGit", kind: "gitea", defaultBase: "https://atomgit.com" },
  gitlink: { label: "GitLink", kind: "gitea", defaultBase: "https://www.gitlink.org.cn" },
  cnb: { label: "cnb.cool", kind: "stub", defaultBase: "https://cnb.cool" },
  codeup: { label: "Codeup（阿里云）", kind: "stub", defaultBase: "https://codeup.aliyun.com" },
};

export interface DriverConfig {
  preset: string;
  baseUrl: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface GitDriver {
  readonly platform: string;
  /** 成功返回一段描述文本；失败抛 DriverError */
  testConnection(): Promise<string>;
  /** 创建或更新远端文件（内部先做 sha 探测实现更新语义） */
  putFile(remotePath: string, contentBase64: string, message: string): Promise<void>;
}

// ─── HTTP 基础设施 ───────────────────────────────────────────────────────────

interface RawResponse {
  status: number;
  body: unknown;
}

function msgOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function request(
  method: string,
  url: string,
  opts: { auth?: string; body?: unknown } = {}
): Promise<RawResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  headers["User-Agent"] = UA;
  headers["Accept"] = "application/json";
  if (opts.auth) headers["Authorization"] = opts.auth;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
      redirect: "manual",
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new DriverError(
      0,
      aborted
        ? `请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）：${redactUrl(url)}`
        : `网络错误：${msgOf(e)}`
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

/** 平台错误 message 提取（GitHub/Gitee/Gitea 均使用 message 字段） */
function platformMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === "string" && m) return m;
  }
  if (typeof body === "string" && body) return body.slice(0, 200);
  return "";
}

/** 状态码 >=400 抛 DriverError，透传状态码与平台 message */
function ensureOk(r: RawResponse, action: string): void {
  if (r.status >= 200 && r.status < 300) return;
  const detail = platformMessage(r.body);
  throw new DriverError(r.status, `${action}失败（HTTP ${r.status}）${detail ? "：" + detail : ""}`);
}

function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function repoSeg(cfg: DriverConfig): string {
  return `${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
}

function bodySha(body: unknown): string | null {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const sha = (body as Record<string, unknown>).sha;
    if (typeof sha === "string" && sha) return sha;
    return null;
  }
  if (Array.isArray(body)) {
    throw new DriverError(409, "远端路径已存在且是目录，无法写入同名文件");
  }
  return null;
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

class GitHubDriver implements GitDriver {
  readonly platform = "GitHub";
  private api = "https://api.github.com";
  constructor(private cfg: DriverConfig) {}

  private auth(): string {
    return `Bearer ${this.cfg.token}`;
  }

  private contentsUrl(path: string): string {
    return `${this.api}/repos/${repoSeg(this.cfg)}/contents/${encodePath(path)}`;
  }

  async testConnection(): Promise<string> {
    const r = await request("GET", `${this.api}/repos/${repoSeg(this.cfg)}`, { auth: this.auth() });
    ensureOk(r, "连接测试");
    const b = (r.body ?? {}) as Record<string, unknown>;
    const full = typeof b.full_name === "string" ? b.full_name : `${this.cfg.owner}/${this.cfg.repo}`;
    const def = typeof b.default_branch === "string" ? b.default_branch : "";
    return `仓库 ${full} 可访问${def ? `（默认分支 ${def}）` : ""}`;
  }

  private async getSha(path: string): Promise<string | null> {
    const url = `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.cfg.branch)}`;
    const r = await request("GET", url, { auth: this.auth() });
    if (r.status === 404) return null;
    ensureOk(r, "读取远端文件");
    return bodySha(r.body);
  }

  async putFile(path: string, contentBase64: string, message: string): Promise<void> {
    const sha = await this.getSha(path);
    const body: Record<string, unknown> = {
      message,
      content: contentBase64,
      branch: this.cfg.branch,
    };
    if (sha) body.sha = sha;
    const r = await request("PUT", this.contentsUrl(path), { auth: this.auth(), body });
    ensureOk(r, sha ? "更新文件" : "创建文件");
  }
}

// ─── Gitee ───────────────────────────────────────────────────────────────────

class GiteeDriver implements GitDriver {
  readonly platform = "Gitee";
  private api = "https://gitee.com/api/v5";
  constructor(private cfg: DriverConfig) {}

  /** GET 请求把 access_token 放 query（Gitee 鉴权方式） */
  private withToken(url: string): string {
    const sep = url.indexOf("?") === -1 ? "?" : "&";
    return `${url}${sep}access_token=${encodeURIComponent(this.cfg.token)}`;
  }

  private contentsUrl(path: string): string {
    return `${this.api}/repos/${repoSeg(this.cfg)}/contents/${encodePath(path)}`;
  }

  async testConnection(): Promise<string> {
    const r = await request("GET", this.withToken(`${this.api}/repos/${repoSeg(this.cfg)}`));
    ensureOk(r, "连接测试");
    const b = (r.body ?? {}) as Record<string, unknown>;
    const full = typeof b.full_name === "string" ? b.full_name : `${this.cfg.owner}/${this.cfg.repo}`;
    return `仓库 ${full} 可访问`;
  }

  private async getSha(path: string): Promise<string | null> {
    const url = this.withToken(
      `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
    );
    const r = await request("GET", url);
    if (r.status === 404) return null;
    ensureOk(r, "读取远端文件");
    return bodySha(r.body);
  }

  async putFile(path: string, contentBase64: string, message: string): Promise<void> {
    const sha = await this.getSha(path);
    const body: Record<string, unknown> = {
      access_token: this.cfg.token,
      content: contentBase64,
      message,
      branch: this.cfg.branch,
    };
    if (sha) body.sha = sha;
    // Gitee：POST 创建、PUT 更新
    const r = await request(sha ? "PUT" : "POST", this.contentsUrl(path), { body });
    ensureOk(r, sha ? "更新文件" : "创建文件");
  }
}

// ─── Gitea 系通用（自建 Gitea / GitCode / AtomGit / GitLink） ────────────────

class GiteaDriver implements GitDriver {
  readonly platform: string;
  private api: string;
  constructor(
    private cfg: DriverConfig,
    label: string
  ) {
    const base = (cfg.baseUrl || "").trim().replace(/\/+$/, "");
    if (!base) {
      throw new DriverError(
        400,
        `平台 ${label} 需要填写 API Base URL（站点根地址，如 https://gitea.example.com）`
      );
    }
    this.api = `${base}/api/v1`;
    this.platform = label;
  }

  private auth(): string {
    return `token ${this.cfg.token}`;
  }

  private contentsUrl(path: string): string {
    return `${this.api}/repos/${repoSeg(this.cfg)}/contents/${encodePath(path)}`;
  }

  async testConnection(): Promise<string> {
    const r = await request("GET", `${this.api}/repos/${repoSeg(this.cfg)}`, { auth: this.auth() });
    ensureOk(r, "连接测试");
    const b = (r.body ?? {}) as Record<string, unknown>;
    const full = typeof b.full_name === "string" ? b.full_name : `${this.cfg.owner}/${this.cfg.repo}`;
    return `仓库 ${full} 可访问（Gitea API v1）`;
  }

  private async getSha(path: string): Promise<string | null> {
    const url = `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.cfg.branch)}`;
    const r = await request("GET", url, { auth: this.auth() });
    if (r.status === 404) return null;
    ensureOk(r, "读取远端文件");
    return bodySha(r.body);
  }

  async putFile(path: string, contentBase64: string, message: string): Promise<void> {
    const sha = await this.getSha(path);
    const body: Record<string, unknown> = {
      content: contentBase64,
      message,
      branch: this.cfg.branch,
    };
    if (sha) body.sha = sha;
    // Gitea API v1：POST 创建、PUT 更新
    const r = await request(sha ? "PUT" : "POST", this.contentsUrl(path), {
      auth: this.auth(),
      body,
    });
    ensureOk(r, sha ? "更新文件" : "创建文件");
  }
}

// ─── Stub（公开 API 与 Contents 语义差异大的平台） ───────────────────────────

class StubDriver implements GitDriver {
  readonly platform: string;
  constructor(label: string) {
    this.platform = label;
  }

  private unsupported(): never {
    throw new DriverError(
      400,
      `平台「${this.platform}」暂不支持：其公开 API 与 Contents 语义差异较大，` +
        "暂无通用驱动。请使用 Gitea 兼容地址接入（Gitea 自建 / GitCode / AtomGit / GitLink），或改用 GitHub / Gitee。"
    );
  }

  testConnection(): Promise<string> {
    return this.unsupported();
  }

  putFile(): Promise<void> {
    return this.unsupported();
  }
}

// ─── 工厂 ────────────────────────────────────────────────────────────────────

export function createDriver(cfg: DriverConfig): GitDriver {
  const meta = PRESETS[cfg.preset];
  if (!meta) throw new DriverError(400, `未知平台预设：${cfg.preset}`);
  if (meta.kind === "stub") return new StubDriver(meta.label);
  if (!cfg.owner || !cfg.repo) {
    throw new DriverError(400, "请先填写仓库所有者（owner）与仓库名（repo）");
  }
  if (!cfg.token) throw new DriverError(400, "请先填写 Access Token");
  if (!cfg.branch) throw new DriverError(400, "分支不能为空");
  if (meta.kind === "github") return new GitHubDriver(cfg);
  if (meta.kind === "gitee") return new GiteeDriver(cfg);
  // gitea 系：用户未填 baseUrl 时回退到预设默认地址
  const resolved = cfg.baseUrl ? cfg : { ...cfg, baseUrl: meta.defaultBase };
  return new GiteaDriver(resolved, meta.label);
}
