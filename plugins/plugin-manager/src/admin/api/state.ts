import type { APIRoute } from "astro";
import { REGISTRY, getMeta, ALL_MEMBER_SLUGS } from "../../lib/registry";
import { loadStates, mergeStates } from "../../lib/state";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isCloudflareRuntime } from "@astropress/core";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// 进程内互斥锁：串行化「读-改-写」，避免并发启停互相覆盖
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface PkgInfo { version?: string; description?: string }

/** 扫描 plugins/ 目录读取各插件 package.json 的版本与描述（Node 适配器下可用；失败静默降级） */
async function scanPackages(): Promise<Record<string, PkgInfo>> {
  const out: Record<string, PkgInfo> = {};
  try {
    // state.ts 位于 src/admin/api/，上溯 4 级到 plugins/ 根目录
    const pluginsDir = resolve(dirname(fileURLToPath(import.meta.url ?? "file:///")), "..", "..", "..", "..");
    const dirs = await readdir(pluginsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const raw = await readFile(join(pluginsDir, d.name, "package.json"), "utf-8");
        const pkg = JSON.parse(raw);
        out[d.name] = { version: pkg.version, description: pkg.description };
      } catch { /* 单个插件缺 package.json 不影响整体 */ }
    }
  } catch { /* 无文件系统环境（如 Cloudflare）时回退注册表 */ }
  return out;
}

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const states = await loadStates(db);
  const pkgs = await scanPackages();
  const cf = isCloudflareRuntime();

  const list = REGISTRY.map((m) => ({
    slug: m.slug,
    label: m.label,
    kind: m.kind,
    system: !!m.system,
    enabled: m.system ? true : states[m.slug] !== false,
    settingsUrl: m.settingsUrl,
    optionKeys: m.optionKeys,
    version: pkgs[m.slug]?.version ?? "",
    description: pkgs[m.slug]?.description ?? "",
    members: (m.members ?? []).map((x) => ({
      slug: x.slug,
      label: x.label,
      settingsUrl: x.settingsUrl,
      cfUnsupported: x.cfUnsupported,
      // 平台不兼容成员在 CF 上强制呈现为不可用，即使用户历史状态里是开启
      enabled: !(states[x.slug] === false || (cf && !!x.cfUnsupported)),
    })),
  }));

  // 文件系统中存在但注册表未收录的插件（只读展示，不支持开关）；
  // 套件成员由套件卡片统一管理，不在此重复展示。
  const memberSet = new Set(ALL_MEMBER_SLUGS);
  for (const slug of Object.keys(pkgs)) {
    if (getMeta(slug) || memberSet.has(slug)) continue;
    list.push({
      slug, label: slug, kind: "integration", system: false,
      enabled: states[slug] !== false, settingsUrl: undefined, optionKeys: [],
      version: pkgs[slug].version ?? "", description: pkgs[slug].description ?? "",
      members: [],
    });
  }
  return json(list);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { slug?: string; enabled?: boolean };
  try {
    body = (await request.json()) as { slug?: string; enabled?: boolean };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  const slug = String(body.slug ?? "");
  if (!SLUG_RE.test(slug)) return json({ error: "插件标识不合法（仅允许小写字母、数字、短横线）" }, 400);
  const meta = getMeta(slug);
  if (meta?.system) return json({ error: "系统插件不可禁用" }, 400);
  // 仅接受注册表中的套件 slug 或套件成员 slug，拒绝未知标识污染状态表
  if (!meta && !ALL_MEMBER_SLUGS.includes(slug)) {
    return json({ error: "未知插件" }, 400);
  }
  if (typeof body.enabled !== "boolean") return json({ error: "启用状态必须是布尔值 true/false" }, 400);

  // 平台能力屏蔽：CF 上不允许开启 fs/子进程依赖型成员（关闭操作仍允许写入）
  if (body.enabled && isCloudflareRuntime()) {
    const member = REGISTRY.flatMap((m) => m.members ?? []).find((x) => x.slug === slug);
    if (member?.cfUnsupported) {
      return json({ error: `该功能在 Cloudflare 上不可用：${member.cfUnsupported}。Node.js 部署中可正常使用。` }, 400);
    }
  }

  const db = (locals as any).db;
  // 套件启停需级联到全部成员：成员插件各自的 isPluginDisabled(slug)
  // 读的是成员自己的状态键，必须一并写入才能即时生效。
  const memberSlugs = (meta?.members ?? []).map((x) => x.slug);
  const validSlugs = new Set([...REGISTRY.map((m) => m.slug), ...ALL_MEMBER_SLUGS]);
  await withLock(async () => {
    // 原子合并（json_patch）：只 patch 本次变动的键。
    // 旧实现「读缓存快照→改→整份写回」在跨 isolate 的 10s 内连续启停会互相覆盖。
    const patch: Record<string, boolean> = { [slug]: body.enabled as boolean };
    for (const ms of memberSlugs) patch[ms] = body.enabled as boolean;
    await mergeStates(db, patch, validSlugs);
  });
  return json({ ok: true, slug, enabled: body.enabled, cascaded: memberSlugs });
};
