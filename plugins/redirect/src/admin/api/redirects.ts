import type { APIRoute } from "astro";
import { addRedirect, loadRedirects, removeRedirect, updateRedirect } from "../../lib/store";
import { invalidateRedirectsCache, REDIRECT_SKIP_PREFIXES } from "../../middleware";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** 校验登录态：未登录返回 null */
async function requireAdmin(ctx: any) {
  const user = (ctx.locals as any).user;
  if (!user) return null;
  return user;
}

/** 写操作 CSRF 校验：origin 存在时必须与请求同源 */
function checkOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return false;
  return true;
}

/** 路径/URL 最大长度（浏览器普遍支持的 URL 上限约 2000+，留余量取 2048） */
const MAX_RULE_LEN = 2048;

/** 含 CRLF 等控制字符（会污染 Location 响应头甚至触发 500），DEL 也一并拒绝 */
function hasControlChar(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f\x7f]/.test(s);
}

/**
 * from 必须以单个 / 开头（不能是 // 协议相对、/\ 反斜杠混淆），
 * 长度 2..2048，且不含控制字符。
 */
function validFrom(from: unknown): from is string {
  if (typeof from !== "string" || from.length < 2 || from.length > MAX_RULE_LEN) return false;
  if (!from.startsWith("/")) return false;
  if (from[1] === "/" || from[1] === "\\") return false; // //host 或 /\host
  if (hasControlChar(from)) return false;
  return true;
}

/**
 * to 支持站内绝对路径与 http(s):// 绝对地址；
 * 站内路径第二个字符不得是 / 或 \（防止 //evil.com、/\evil.com 被浏览器解析成外站），
 * 不允许控制字符（防 Location 头 CRLF 注入），长度 1..2048。
 */
function validTo(to: unknown): to is string {
  if (typeof to !== "string" || !to || to.length > MAX_RULE_LEN) return false;
  if (hasControlChar(to)) return false;
  if (to.startsWith("http://") || to.startsWith("https://")) {
    try {
      // 必须能解析为合法 http(s) URL，且 host 非空（挡掉 https:///x 之类）
      const u = new URL(to);
      return u.protocol === "http:" || u.protocol === "https:" ? !!u.host : false;
    } catch {
      return false;
    }
  }
  if (to.startsWith("/")) {
    if (to.length > 1 && (to[1] === "/" || to[1] === "\\")) return false;
    return true;
  }
  return false;
}

/** type 只接受 301 / 302 */
function validType(type: unknown): type is 301 | 302 {
  return type === 301 || type === 302;
}

/** 命中系统保留前缀的 from 永远不会被中间件拦截，保存即拒绝，避免静默失效 */
function hitsReservedPrefix(from: string): string | null {
  const lower = from.toLowerCase();
  for (const p of REDIRECT_SKIP_PREFIXES) {
    if (lower.startsWith(p)) return p;
  }
  return null;
}

/**
 * 多跳循环检测：从 to 出发沿「精确匹配」规则链最多走 50 步，
 * 若回到 from（或链上任何已访问节点成环）则拒绝保存。
 * 外链（http(s)://）与通配规则不参与链式追踪。
 */
async function createsLoop(db: any, from: string, to: string, excludeId?: string): Promise<boolean> {
  if (!to.startsWith("/")) return false;
  const list = await loadRedirects(db);
  const exact = new Map<string, string>();
  for (const r of list) {
    if (!r.enabled || r.from.endsWith("/*")) continue;
    if (excludeId && r.id === excludeId) continue;
    exact.set(r.from.toLowerCase(), r.to);
  }
  const visited = new Set<string>([from.toLowerCase()]);
  let cur = to.split(/[?#]/)[0].toLowerCase();
  for (let i = 0; i < 50; i++) {
    if (visited.has(cur)) return true;
    visited.add(cur);
    const next = exact.get(cur);
    if (!next || !next.startsWith("/")) return false;
    cur = next.split(/[?#]/)[0].toLowerCase();
  }
  return false;
}

export const GET: APIRoute = async ({ locals }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  const list = await loadRedirects(db);
  return json(list);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!checkOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { from?: string; to?: string; type?: number };
  try {
    body = (await request.json()) as { from?: string; to?: string; type?: number };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  if (!validFrom(body.from)) return json({ error: "from 必须以 / 开头且长度不超过 2048" }, 400);
  if (!validTo(body.to)) return json({ error: "to 必须以 / 或 http(s):// 开头且长度不超过 2048" }, 400);
  if (!validType(body.type)) return json({ error: "type 必须是 301 或 302" }, 400);
  const reserved = hitsReservedPrefix(body.from as string);
  if (reserved) {
    return json({ error: `系统保留前缀「${reserved}」下的路径不会经过重定向中间件，该规则永远不会生效，请更换 from` }, 400);
  }

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  // from 去重：已存在相同 from（不区分大小写）则拒绝
  const existing = await loadRedirects(db);
  if (existing.some((r) => r.from.toLowerCase() === (body.from as string).toLowerCase())) {
    return json({ error: "已存在相同来源路径（from）的规则" }, 400);
  }

  // 多跳循环检测（A→B→A）
  if (await createsLoop(db, body.from as string, body.to as string)) {
    return json({ error: "检测到重定向循环（如 A→B→A），该规则会形成死循环，请调整目标" }, 400);
  }

  // 并发竞争兜底：原子 append 返回 duplicate 说明同 from 已被其他并发请求抢先落库
  const added = await addRedirect(db, { from: body.from as string, to: body.to as string, type: body.type as 301 | 302 });
  if (added === "duplicate") {
    return json({ error: "已存在相同来源路径（from）的规则" }, 400);
  }
  invalidateRedirectsCache();
  return json({ ok: true, rule: added });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!checkOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { id?: string; enabled?: boolean; from?: string; to?: string; type?: number };
  try {
    body = (await request.json()) as { id?: string; enabled?: boolean; from?: string; to?: string; type?: number };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  if (!body.id) return json({ error: "缺少规则 id" }, 400);
  if (body.from !== undefined && !validFrom(body.from)) return json({ error: "from 必须以 / 开头且长度不超过 2048" }, 400);
  if (body.to !== undefined && !validTo(body.to)) return json({ error: "to 必须以 / 或 http(s):// 开头且长度不超过 2048" }, 400);
  if (body.type !== undefined && !validType(body.type)) return json({ error: "type 必须是 301 或 302" }, 400);
  if (body.from !== undefined) {
    const reserved = hitsReservedPrefix(body.from);
    if (reserved) {
      return json({ error: `系统保留前缀「${reserved}」下的路径不会经过重定向中间件，该规则永远不会生效，请更换 from` }, 400);
    }
  }

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  // 修改 from 时同样做去重校验
  if (body.from !== undefined) {
    const existing = await loadRedirects(db);
    if (existing.some((r) => r.id !== body.id && r.from.toLowerCase() === (body.from as string).toLowerCase())) {
      return json({ error: "已存在相同来源路径（from）的规则" }, 400);
    }
  }

  // 多跳循环检测：以「修改后的 from/to」为准，排除规则自身
  {
    const list = await loadRedirects(db);
    const current = list.find((r) => r.id === body.id);
    if (current) {
      const effFrom = (body.from ?? current.from) as string;
      const effTo = (body.to ?? current.to) as string;
      // 仅当修改后规则处于启用态（或本次未改 enabled 且原本启用）时才需要检测
      const effEnabled = body.enabled ?? current.enabled;
      if (effEnabled && (await createsLoop(db, effFrom, effTo, body.id))) {
        return json({ error: "检测到重定向循环（如 A→B→A），该规则会形成死循环，请调整目标" }, 400);
      }
    }
  }

  const rule = await updateRedirect(db, body.id, {
    enabled: body.enabled,
    from: body.from,
    to: body.to,
    type: body.type as 301 | 302 | undefined,
  });
  if (!rule) return json({ error: "规则不存在或已删除" }, 404);
  invalidateRedirectsCache();
  return json({ ok: true, rule });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!checkOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少规则 id" }, 400);

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  const ok = await removeRedirect(db, id);
  invalidateRedirectsCache();
  return json({ ok });
};
