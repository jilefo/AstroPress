/**
 * config-io 核心逻辑：导出信封构造与导入校验/写入。
 *
 * 安全约束：
 *   - 所有 section / 表名 / 列名走常量白名单，标识符用 sql.identifier
 *   - 所有写入值一律 drizzle sql 参数化绑定，禁止字符串拼接
 *   - replace 模式只删当前 section 范围；astropress_setup_complete 永不删除
 *   - 内容表固定五张（wp_posts/wp_postmeta/wp_terms/wp_term_taxonomy/wp_term_relationships），
 *     不导出用户表与会话表
 */
import {
  wpOptions,
  wpPostmeta,
  wpPosts,
  wpTermRelationships,
  wpTermTaxonomy,
  wpTerms,
} from "@astropress/core/schema";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

export type SectionName = "settings" | "plugins" | "themes" | "content";
export const ALL_SECTIONS: SectionName[] = ["settings", "plugins", "themes", "content"];
export const MAX_CONTENT_ROWS = 50000;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_ERRORS = 100;

/** 站点设置白名单键 */
export const SETTINGS_KEYS = [
  "blogname",
  "blogdescription",
  "siteurl",
  "admin_email",
  "posts_per_page",
  "default_role",
  "show_on_front",
  "page_on_front",
  "page_for_posts",
  "posts_per_rss",
  "blog_public",
  "timezone_string",
  "template",
  "stylesheet",
] as const;

/** 主题配置四个固定键 */
export const THEME_KEYS = [
  "astropress_themes",
  "astropress_active_theme",
  "astropress_theme_config",
  "astropress_theme_templates",
] as const;

const SETUP_COMPLETE_KEY = "astropress_setup_complete";
/** 敏感键名（小写匹配）：不导出、replace 不清、不导入 */
const SENSITIVE_RE = /(secret|key|password|salt)/i;
// 注意：主题白名单中的键不受敏感词影响（固定四键显式指定）

/**
 * 值级敏感字段名：即使选项名本身不含敏感词（如 astropress_gitalk_settings、
 * astropress_gist_sync_settings），其 JSON 值内部仍可能携带密钥。
 * 导出时递归把这些字段的非空字符串值清空（导入后需重新填写密钥）。
 * 刻意不使用裸 "key"，避免误伤 keyword/monkey 等正常字段。
 */
const SECRET_FIELD_RE =
  /(token|secret|password|passwd|api[_-]?key|access[_-]?key|secret[_-]?key|credential|salt|authorization)/i;

function isPlainObjectNode(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 对 JSON 形态的选项值做值级脱敏；非 JSON 或无命中时原样返回（保留原始序列化） */
export function redactSecretFields(raw: string): string {
  let node: unknown;
  try {
    node = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!isPlainObjectNode(node) && !Array.isArray(node)) return raw;
  let touched = false;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObjectNode(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (SECRET_FIELD_RE.test(k) && typeof val === "string" && val !== "") {
          out[k] = "";
          touched = true;
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    }
    return v;
  };
  const redacted = walk(node);
  return touched ? JSON.stringify(redacted) : raw;
}

/** 插件设置范围：astropress_ 前缀（LIKE 转义下划线），排除 setup 完成标记与敏感键 */
export function isPluginOptionName(name: string): boolean {
  return (
    typeof name === "string" &&
    name.startsWith("astropress_") &&
    name !== SETUP_COMPLETE_KEY &&
    !SENSITIVE_RE.test(name)
  );
}

export class IoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "IoError";
  }
}

// ─── 内容表元数据 ─────────────────────────────────────────────────────────────

interface TableMeta {
  /** 数据库表名（白名单常量） */
  table: string;
  obj: SQLiteTable;
  /** 数据库列名（建表顺序） */
  columns: string[];
  /** 主键列名（用于存在性判断） */
  pk: string[];
  /** 由行数据构造主键等值条件（query-builder，跨驱动） */
  pkWhere: (row: Record<string, unknown>) => any;
}

function columnNames(obj: SQLiteTable): string[] {
  const cols = getTableColumns(obj);
  return Object.keys(cols).map((k) => cols[k].name);
}

export const CONTENT_TABLES: TableMeta[] = [
  {
    table: "wp_posts",
    obj: wpPosts,
    columns: columnNames(wpPosts),
    pk: ["ID"],
    pkWhere: (r) => eq(wpPosts.id, r.ID as number),
  },
  {
    table: "wp_postmeta",
    obj: wpPostmeta,
    columns: columnNames(wpPostmeta),
    pk: ["meta_id"],
    pkWhere: (r) => eq(wpPostmeta.metaId, r.meta_id as number),
  },
  {
    table: "wp_terms",
    obj: wpTerms,
    columns: columnNames(wpTerms),
    pk: ["term_id"],
    pkWhere: (r) => eq(wpTerms.termId, r.term_id as number),
  },
  {
    table: "wp_term_taxonomy",
    obj: wpTermTaxonomy,
    columns: columnNames(wpTermTaxonomy),
    pk: ["term_taxonomy_id"],
    pkWhere: (r) => eq(wpTermTaxonomy.termTaxonomyId, r.term_taxonomy_id as number),
  },
  {
    // 该表无显式主键约束，按 (object_id, term_taxonomy_id) 业务键判重
    table: "wp_term_relationships",
    obj: wpTermRelationships,
    columns: columnNames(wpTermRelationships),
    pk: ["object_id", "term_taxonomy_id"],
    pkWhere: (r) =>
      and(
        eq(wpTermRelationships.objectId, r.object_id as number),
        eq(wpTermRelationships.termTaxonomyId, r.term_taxonomy_id as number)
      ),
  },
];

const CONTENT_BY_NAME = new Map(CONTENT_TABLES.map((t) => [t.table, t]));
/** replace 清空顺序：先子表/关系表，再主表 */
const DELETE_ORDER = [
  "wp_term_relationships",
  "wp_term_taxonomy",
  "wp_terms",
  "wp_postmeta",
  "wp_posts",
];

// ─── 导出 ────────────────────────────────────────────────────────────────────

export interface Envelope {
  app: "astropress";
  kind: "config-export";
  version: 1;
  exportedAt: string;
  sections: Record<string, unknown>;
}

export function parseSections(input: string | null | undefined): SectionName[] {
  if (!input) return [...ALL_SECTIONS];
  const tokens = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [...ALL_SECTIONS];
  const out: SectionName[] = [];
  for (const t of tokens) {
    if ((ALL_SECTIONS as string[]).includes(t) && !out.includes(t as SectionName)) {
      out.push(t as SectionName);
    }
  }
  return out;
}

async function exportOptions(db: any, section: SectionName): Promise<{ name: string; value: string }[]> {
  let rows: { optionName: string; optionValue: string }[];
  if (section === "settings") {
    rows = await db
      .select({ optionName: wpOptions.optionName, optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(inArray(wpOptions.optionName, SETTINGS_KEYS as unknown as string[]));
  } else if (section === "themes") {
    rows = await db
      .select({ optionName: wpOptions.optionName, optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(inArray(wpOptions.optionName, THEME_KEYS as unknown as string[]));
  } else {
    // astropress\_% ESCAPE '\'：前缀与转义字符均参数化绑定
    const prefix = "astropress\\_%"; // LIKE 模式（反斜杠转义下划线）
    const escape = "\\"; // ESCAPE 字符
    rows = await db
      .select({ optionName: wpOptions.optionName, optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(sql`${wpOptions.optionName} LIKE ${prefix} ESCAPE ${escape}`);
    // JS 侧二次过滤，确保 setup 标记与敏感键绝不导出
    rows = rows.filter((r) => isPluginOptionName(r.optionName));
  }
  // 值级脱敏：所有 section 统一过一遍，防止选项名无害但 JSON 值内含 token/secret
  return rows.map((r) => ({ name: r.optionName, value: redactSecretFields(r.optionValue) }));
}

async function countRows(db: any, meta: TableMeta): Promise<number> {
  const [row] = await db.select({ c: sql<number>`count(*)` }).from(meta.obj);
  return Number(row?.c ?? 0);
}

async function selectAllRows(db: any, meta: TableMeta): Promise<Record<string, unknown>[]> {
  // 以数据库列名作为结果键（select 别名），保证导出/导入列名一致
  const cols = getTableColumns(meta.obj);
  const fields: Record<string, unknown> = {};
  for (const jsName of Object.keys(cols)) fields[cols[jsName].name] = cols[jsName];
  return db.select(fields as any).from(meta.obj);
}

/** 构造导出信封；content 总行数超 MAX_CONTENT_ROWS 抛 413 */
export async function buildExport(db: any, sections: SectionName[]): Promise<Envelope> {
  const payload: Record<string, unknown> = {};

  if (sections.includes("content")) {
    let total = 0;
    const content: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> = {};
    for (const meta of CONTENT_TABLES) {
      const n = await countRows(db, meta);
      total += n;
      if (total > MAX_CONTENT_ROWS) {
        throw new IoError(413, `内容数据超过 ${MAX_CONTENT_ROWS} 行上限，请改用备份插件导出完整数据库`);
      }
      content[meta.table] = { columns: meta.columns, rows: await selectAllRows(db, meta) };
    }
    payload.content = content;
  }

  for (const s of ["settings", "plugins", "themes"] as const) {
    if (sections.includes(s)) payload[s] = await exportOptions(db, s);
  }

  return {
    app: "astropress",
    kind: "config-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    sections: payload,
  };
}

// ─── 导入 ────────────────────────────────────────────────────────────────────

export interface ImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface ImportResult {
  ok: true;
  mode: "merge" | "replace";
  importedSections: SectionName[];
  summary: ImportSummary;
  errors: string[];
}

interface Ctx {
  summary: ImportSummary;
  errors: string[];
}

function fail(ctx: Ctx, where: string, message: string) {
  ctx.summary.failed++;
  if (ctx.errors.length < MAX_ERRORS) ctx.errors.push(`${where}: ${message}`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 原始单元格值 → 可绑定的 SQL 值；不接受对象/数组/符号 */
function bindValue(v: unknown): { ok: true; value: string | number | null } | { ok: false } {
  if (v === null) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
  if (typeof v === "boolean") return { ok: true, value: v ? 1 : 0 };
  return { ok: false };
}

/** 严格校验信封；不合法直接 400 */
export function parseEnvelope(raw: unknown): Envelope {
  if (!isPlainObject(raw)) throw new IoError(400, "无效的配置文件：根节点必须是对象");
  if (raw.app !== "astropress") throw new IoError(400, "无效的配置文件：app 必须为 astropress");
  if (raw.kind !== "config-export") throw new IoError(400, "无效的配置文件：kind 必须为 config-export");
  if (raw.version !== 1) throw new IoError(400, "无效的配置文件：仅支持 version=1");
  if (!isPlainObject(raw.sections)) throw new IoError(400, "无效的配置文件：sections 缺失或格式错误");
  return raw as unknown as Envelope;
}

/** replace 模式删除某个 options section 的覆盖范围（永不删 setup_complete） */
async function clearOptionsRange(db: any, section: SectionName): Promise<void> {
  if (section === "settings") {
    await db
      .delete(wpOptions)
      .where(inArray(wpOptions.optionName, SETTINGS_KEYS as unknown as string[]));
  } else if (section === "themes") {
    await db
      .delete(wpOptions)
      .where(inArray(wpOptions.optionName, THEME_KEYS as unknown as string[]));
  } else if (section === "plugins") {
    // 先查出范围内全部键（复用导出同款过滤），再按主键集合删除，保证不碰敏感键
    const prefix = "astropress\\_%";
    const escape = "\\";
    const rows: { optionName: string }[] = await db
      .select({ optionName: wpOptions.optionName })
      .from(wpOptions)
      .where(sql`${wpOptions.optionName} LIKE ${prefix} ESCAPE ${escape}`);
    const names = rows.map((r) => r.optionName).filter(isPluginOptionName);
    if (names.length > 0) {
      await db.delete(wpOptions).where(inArray(wpOptions.optionName, names));
    }
  }
}

function allowedOptionName(section: SectionName, name: string): boolean {
  if (section === "settings") return (SETTINGS_KEYS as readonly string[]).includes(name);
  if (section === "themes") return (THEME_KEYS as readonly string[]).includes(name);
  return isPluginOptionName(name);
}

async function optionExists(db: any, name: string): Promise<boolean> {
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, name))
    .limit(1);
  return !!row;
}

async function importOptionsSection(
  db: any,
  section: SectionName,
  node: unknown,
  mode: "merge" | "replace",
  ctx: Ctx
): Promise<void> {
  if (!Array.isArray(node)) {
    fail(ctx, section, "section 必须是数组，已跳过整段");
    return;
  }
  if (mode === "replace") await clearOptionsRange(db, section);

  for (let i = 0; i < node.length; i++) {
    const where = `${section}[${i}]`;
    const item = node[i];
    if (!isPlainObject(item)) {
      fail(ctx, where, "单项必须是对象");
      continue;
    }
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 191) {
      fail(ctx, where, "name 必须为 1-191 字符的字符串");
      continue;
    }
    if (!allowedOptionName(section, name)) {
      fail(ctx, where, `键 ${name} 不在该 section 白名单内`);
      continue;
    }
    // 双保险：setup 完成标记永不写入覆盖
    if (name === SETUP_COMPLETE_KEY) {
      fail(ctx, where, "astropress_setup_complete 受保护，禁止导入");
      continue;
    }
    const coerced = bindValue(item.value === undefined ? null : item.value);
    if (!coerced.ok) {
      fail(ctx, where, "value 仅支持字符串/数字/布尔/null");
      continue;
    }
    const value = coerced.value === null ? "" : String(coerced.value);
    try {
      if (await optionExists(db, name)) {
        await db.update(wpOptions).set({ optionValue: value }).where(eq(wpOptions.optionName, name));
        ctx.summary.updated++;
      } else {
        await db.insert(wpOptions).values({ optionName: name, optionValue: value });
        ctx.summary.inserted++;
      }
    } catch (e) {
      fail(ctx, where, e instanceof Error ? e.message : "写入失败");
    }
  }
}

// ── 内容表行级 SQL（标识符全白名单 + sql.identifier；值全参数化） ─────────────

function colListSql(cols: string[]) {
  return sql.join(cols.map((c) => sql.identifier(c)), sql`, `);
}

function insertStmt(meta: TableMeta, cols: string[], values: unknown[]) {
  return sql`INSERT INTO ${sql.identifier(meta.table)} (${colListSql(cols)}) VALUES (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )})`;
}

function updateStmt(meta: TableMeta, setCols: string[], setVals: unknown[], row: Record<string, unknown>) {
  const assignments = sql.join(
    setCols.map((c, i) => sql`${sql.identifier(c)} = ${setVals[i]}`),
    sql`, `
  );
  return sql`UPDATE ${sql.identifier(meta.table)} SET ${assignments} WHERE ${meta.pkWhere(row)}`;
}

interface SanitizedRow {
  row: Record<string, unknown>;
  cols: string[];
  vals: (string | number | null)[];
}

/** 校验并清洗一张表的行数据 */
function sanitizeRows(meta: TableMeta, node: unknown, ctx: Ctx): SanitizedRow[] {
  if (!isPlainObject(node) || !Array.isArray(node.rows)) {
    fail(ctx, meta.table, "必须是包含 rows 数组的对象，已跳过整表");
    return [];
  }
  const allowed = new Set(meta.columns);
  const out: SanitizedRow[] = [];
  const rows = node.rows as unknown[];
  for (let i = 0; i < rows.length; i++) {
    const where = `${meta.table}[${i}]`;
    const raw = rows[i];
    if (!isPlainObject(raw)) {
      fail(ctx, where, "行必须是对象");
      continue;
    }
    const keys = Object.keys(raw);
    if (keys.some((k) => !allowed.has(k))) {
      fail(ctx, where, "存在未知列名");
      continue;
    }
    // 主键列必须齐全
    const missingPk = meta.pk.filter((k) => !Object.prototype.hasOwnProperty.call(raw, k) || raw[k] === null);
    if (missingPk.length) {
      fail(ctx, where, `缺少主键列 ${missingPk.join("+")}`);
      continue;
    }
    const cols: string[] = [];
    const vals: (string | number | null)[] = [];
    let bad = false;
    for (const k of keys) {
      const v = bindValue(raw[k]);
      if (!v.ok) {
        fail(ctx, where, `列 ${k} 的值类型不受支持`);
        bad = true;
        break;
      }
      cols.push(k);
      vals.push(v.value);
    }
    if (bad || cols.length === 0) continue;
    // 固定按建表列序排列，保证 replace 批量插入列序稳定
    const order = new Map(cols.map((c, idx) => [c, idx]));
    cols.sort((a, b) => meta.columns.indexOf(a) - meta.columns.indexOf(b));
    const sortedVals = cols.map((c) => vals[order.get(c)!]);
    out.push({ row: raw, cols, vals: sortedVals });
  }
  return out;
}

async function mergeContent(db: any, byTable: Map<TableMeta, SanitizedRow[]>, ctx: Ctx): Promise<void> {
  for (const meta of CONTENT_TABLES) {
    const items = byTable.get(meta);
    if (!items) continue;
    for (const item of items) {
      try {
        const [hit] = await db
          .select({ one: sql<number>`1` })
          .from(meta.obj)
          .where(meta.pkWhere(item.row))
          .limit(1);
        if (hit) {
          const setCols = item.cols.filter((c) => !meta.pk.includes(c));
          if (setCols.length === 0) {
            ctx.summary.skipped++;
            continue;
          }
          const setVals = setCols.map((c) => item.vals[item.cols.indexOf(c)]);
          await db.run(updateStmt(meta, setCols, setVals, item.row));
          ctx.summary.updated++;
        } else {
          await db.run(insertStmt(meta, item.cols, item.vals));
          ctx.summary.inserted++;
        }
      } catch (e) {
        fail(ctx, meta.table, e instanceof Error ? e.message : "写入失败");
      }
    }
  }
}

/** 优先使用数据库事务；驱动不支持时退化为顺序执行 */
async function inTransaction(db: any, fn: (tx: any) => Promise<void>): Promise<void> {
  if (typeof db.transaction === "function") {
    await db.transaction(async (tx: any) => {
      await fn(tx);
    });
  } else {
    await fn(db);
  }
}

async function replaceContent(db: any, byTable: Map<TableMeta, SanitizedRow[]>, ctx: Ctx): Promise<void> {
  await inTransaction(db, async (tx) => {
    for (const name of DELETE_ORDER) {
      await tx.run(sql`DELETE FROM ${sql.identifier(name)}`);
    }
    // 重置自增序列（表存在 sqlite_sequence 时生效；失败可忽略）
    try {
      await tx.run(
        sql`DELETE FROM sqlite_sequence WHERE name IN ('wp_posts','wp_postmeta','wp_terms','wp_term_taxonomy','wp_term_relationships')`
      );
    } catch {
      /* sqlite_sequence 不存在时忽略 */
    }
    for (const meta of CONTENT_TABLES) {
      const items = byTable.get(meta);
      if (!items) continue;
      for (const item of items) {
        try {
          await tx.run(insertStmt(meta, item.cols, item.vals));
          ctx.summary.inserted++;
        } catch (e) {
          fail(ctx, meta.table, e instanceof Error ? e.message : "插入失败");
        }
      }
    }
  });
}

/**
 * 执行导入。
 * @param requested 表单勾选要导入的 section
 */
export async function runImport(
  db: any,
  envelope: Envelope,
  requested: SectionName[],
  mode: "merge" | "replace"
): Promise<ImportResult> {
  const ctx: Ctx = {
    summary: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
    errors: [],
  };
  const importedSections: SectionName[] = [];

  // ── options 三个 section ──
  for (const s of ["settings", "plugins", "themes"] as const) {
    if (!requested.includes(s)) continue;
    if (!Object.prototype.hasOwnProperty.call(envelope.sections, s)) {
      // 文件中没有该段：合法但无事可做
      continue;
    }
    importedSections.push(s);
    await importOptionsSection(db, s, envelope.sections[s], mode, ctx);
  }

  // ── content ──
  if (requested.includes("content") && envelope.sections.content !== undefined) {
    const contentNode = envelope.sections.content;
    if (!isPlainObject(contentNode)) {
      fail(ctx, "content", "必须是以表名为键的对象，已跳过");
    } else {
      const byTable = new Map<TableMeta, SanitizedRow[]>();
      for (const meta of CONTENT_TABLES) {
        if (!Object.prototype.hasOwnProperty.call(contentNode, meta.table)) continue;
        const rows = sanitizeRows(meta, contentNode[meta.table], ctx);
        if (rows.length > 0) byTable.set(meta, rows);
      }
      if (byTable.size > 0) {
        importedSections.push("content");
        if (mode === "replace") await replaceContent(db, byTable, ctx);
        else await mergeContent(db, byTable, ctx);
      }
    }
  }

  return { ok: true, mode, importedSections, summary: ctx.summary, errors: ctx.errors };
}
