import type { MiddlewareHandler } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";

const ACTIVE_KEY = "astropress_active_theme";
const MARKER_KEY = "astropress_slots_synced_theme";
const THEMES_KEY = "astropress_themes";
const TMPLS_KEY = "astropress_theme_templates";
const SLOTS_KEY = "astropress_template_slots";
/** 每主题精确槽位快照：{ [themeId]: Record<type, schemaSlug> } */
const SLOTS_MAP_KEY = "astropress_slots_map";

/** 模板类型 → wp-themes 命名约定中的名称后缀（"<主题名> <类型词>"） */
const TYPE_SUFFIX: Record<string, string> = {
  header: "header",
  footer: "footer",
  "single-post": "singlepost",
  archive: "archive",
  search: "search",
  "404": "404",
};

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, "");
}

async function getOption(db: any, name: string): Promise<string | null> {
  const rows = await db
    .select({ v: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  return rows?.[0]?.v ?? null;
}

async function upsertOption(db: any, name: string, value: string): Promise<void> {
  const rows = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  if (rows?.length) {
    await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionId, rows[0].id));
  } else {
    await db.insert(wpOptions).values({ optionName: name, optionValue: value });
  }
}

async function loadSlotsMap(db: any): Promise<Record<string, Record<string, string>>> {
  const raw = await getOption(db, SLOTS_MAP_KEY);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 名称兜底匹配（仅用于早于快照机制存在的旧主题）。
 *  1) 精确：模板名 === 主题名 + 类型后缀，如 "Butterfly Header"
 *  2) 弱匹配：核心词双向包含，多候选取核心词最长者
 */
async function matchByName(db: any, themeName: string): Promise<Record<string, string>> {
  let tmpls: any[] = [];
  try {
    tmpls = JSON.parse((await getOption(db, TMPLS_KEY)) || "[]");
  } catch {
    tmpls = [];
  }
  const tname = norm(themeName);
  const exact: Record<string, string> = {};
  const weak: { type: string; slug: string; core: string }[] = [];
  for (const t of tmpls) {
    if (!t?.type || !t?.schemaSlug) continue;
    const full = norm(t.name);
    const suffix = TYPE_SUFFIX[t.type];
    if (!suffix) continue;
    if (full === tname + suffix) {
      if (!exact[t.type]) exact[t.type] = t.schemaSlug;
      continue;
    }
    const core = full.slice(0, full.length - suffix.length);
    if (core && (tname.includes(core) || core.includes(tname))) {
      weak.push({ type: t.type, slug: t.schemaSlug, core });
    }
  }
  const slots: Record<string, string> = { ...exact };
  const best: Record<string, string> = {};
  const bestLen: Record<string, number> = {};
  for (const w of weak) {
    if (slots[w.type]) continue;
    if (bestLen[w.type] === undefined || w.core.length > bestLen[w.type]) {
      bestLen[w.type] = w.core.length;
      best[w.type] = w.slug;
    }
  }
  for (const type of Object.keys(best)) slots[type] = best[type];
  return slots;
}

/**
 * 导入后：精确快照该主题的槽位（核心此刻刚把全局 slots 写成新主题的槽位）。
 * 独立于名称匹配，是切换可靠的基础。
 */
async function snapshotImported(db: any, res: Response): Promise<void> {
  let themeId = "";
  try {
    const body = (await res.clone().json()) as any;
    themeId = body?.themeId ?? "";
  } catch {
    return;
  }
  if (!themeId) return;
  const raw = await getOption(db, SLOTS_KEY);
  let slots: Record<string, string> = {};
  try {
    slots = raw ? JSON.parse(raw) : {};
  } catch {
    slots = {};
  }
  if (Object.keys(slots).length === 0) return;
  const map = await loadSlotsMap(db);
  map[themeId] = slots;
  await upsertOption(db, SLOTS_MAP_KEY, JSON.stringify(map));
}

/**
 * 激活后：优先用精确快照恢复该主题槽位；无快照时退名称匹配。
 * 保证一切换主题，header/footer/正文/归档等模板立即跟随。
 */
async function restoreForActivation(db: any, themeId: string): Promise<void> {
  const map = await loadSlotsMap(db);
  let slots = map[themeId];
  let via = "snapshot";
  if (!slots || Object.keys(slots).length === 0) {
    let themes: any[] = [];
    try {
      themes = JSON.parse((await getOption(db, THEMES_KEY)) || "[]");
    } catch {
      themes = [];
    }
    const theme = themes.find((t) => t?.id === themeId);
    if (theme?.name) slots = await matchByName(db, theme.name);
    via = "name";
  }
  if (slots && Object.keys(slots).length > 0) {
    await upsertOption(db, SLOTS_KEY, JSON.stringify(slots));
    await upsertOption(db, MARKER_KEY, themeId);
  }
  void via;
}

const ACTIVATE_RE = /^\/api\/themes\/([^/]+)\/?$/;
// 这些子路径不是"激活单个主题"，需排除
const NON_ID_SEGMENTS = new Set([
  "import", "store", "upload", "slots", "library", "templates",
  "export", "config", "query-preview",
]);

/** 主题相关请求后自动维护槽位，其余路径零开销放行 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();
  try {
    const path = ctx.url.pathname;
    const db = (ctx.locals as any).db;
    if (!db) return res;

    // 1) 导入 → 快照
    if (ctx.request.method === "POST" && path === "/api/themes/import") {
      await snapshotImported(db, res);
      return res;
    }

    // 2) 激活单个主题 → 精确恢复
    if (ctx.request.method === "POST") {
      const m = ACTIVATE_RE.exec(path);
      if (m && !NON_ID_SEGMENTS.has(m[1])) {
        await restoreForActivation(db, m[1]);
        return res;
      }
    }
  } catch {
    // 维护失败不影响正常响应
  }
  return res;
};
