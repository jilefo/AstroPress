import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

function uid() { return Math.random().toString(36).slice(2, 12); }

const key = (id: string) => `astropress_form_entries_${id}`;

// ─── 提交边界（F-T8-07 加固：公开端点防巨包/洪峰/条目无限膨胀） ───
const MAX_BODY_BYTES = 1_048_576; // 1MB（表单提交正常远小于此）
const MAX_FIELDS = 200;
const MAX_STRING_LEN = 100_000; // 单值约 100KB
const MAX_ARRAY_ITEMS = 200;
const MAX_ARRAY_ITEM_LEN = 100_000;
const HARD_ENTRY_CAP = 100_000; // 单表单条目硬上限，保护 wp_options 单行体积
// 同 IP 对同一表单：60 秒内最多 10 次成功/待校验提交（蜜罐通过时静默，不计入）
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const RATE_SWEEP_AT = 5_000;
const rateHits = new Map<string, number[]>();
let rateLastSweep = 0;

function rateLimit(bucket: string, now = Date.now()): boolean {
  const arr = (rateHits.get(bucket) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    rateHits.set(bucket, arr);
    return false;
  }
  arr.push(now);
  rateHits.set(bucket, arr);
  if (rateHits.size > RATE_SWEEP_AT && now - rateLastSweep > RATE_WINDOW_MS) {
    rateLastSweep = now;
    for (const [k, times] of rateHits) {
      const alive = times.filter((t) => now - t < RATE_WINDOW_MS);
      if (alive.length === 0) rateHits.delete(k);
      else rateHits.set(k, alive);
    }
  }
  return true;
}

/** 递归裁尖：字段数/字符串长度/数组项数封顶，数字布尔取原值，其他转字符串 */
function sanitizeFields(fields: unknown): Record<string, any> | null {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const out: Record<string, any> = {};
  const entries = Object.entries(fields as Record<string, unknown>).slice(0, MAX_FIELDS);
  for (const [rawKey, val] of entries) {
    const k = String(rawKey).slice(0, 100);
    if (typeof val === "string") {
      out[k] = val.slice(0, MAX_STRING_LEN);
    } else if (typeof val === "number" || typeof val === "boolean") {
      out[k] = val;
    } else if (Array.isArray(val)) {
      out[k] = val.slice(0, MAX_ARRAY_ITEMS).map((v) =>
        typeof v === "string"
          ? v.slice(0, MAX_ARRAY_ITEM_LEN)
          : typeof v === "number" || typeof v === "boolean"
            ? v
            : String(v ?? "").slice(0, MAX_ARRAY_ITEM_LEN)
      );
    } else if (val && typeof val === "object") {
      out[k] = JSON.stringify(val).slice(0, MAX_STRING_LEN);
    } else {
      out[k] = val == null ? "" : String(val).slice(0, MAX_STRING_LEN);
    }
  }
  return out;
}

async function getForms(db: any): Promise<any[]> {
  const [row] = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_forms")).limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function getEntries(db: any, formId: string): Promise<any[]> {
  const [row] = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
    .where(eq(wpOptions.optionName, key(formId))).limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveEntries(db: any, formId: string, entries: any[]) {
  await db.insert(wpOptions)
    .values({ optionName: key(formId), optionValue: JSON.stringify(entries) })
    .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: JSON.stringify(entries) } });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, { status: 204, headers: CORS });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!db) return new Response(JSON.stringify({ error: "服务器开小差了，请稍后再试" }), { status: 500, headers: CORS });

  // 巨包前置拦截（chunked 无 content-length 时由 raw.length 兜底）
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "提交内容过大，请精简后再提交" }), { status: 413, headers: CORS });
  }

  let body: { formId?: unknown; fields?: unknown; pageUrl?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "提交内容过大，请精简后再提交" }), { status: 413, headers: CORS });
    }
    body = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "提交数据格式不正确" }), { status: 400, headers: CORS });
  }

  const formId = typeof body.formId === "string" ? body.formId.slice(0, 100) : "";
  if (!formId) return new Response(JSON.stringify({ error: "缺少表单 ID" }), { status: 400, headers: CORS });
  const fields = sanitizeFields(body.fields);
  if (!fields) return new Response(JSON.stringify({ error: "表单字段无效" }), { status: 400, headers: CORS });

  // Read IP from headers — clientAddress throws on Cloudflare Pages without explicit header config
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";

  // Load form to validate
  let forms: any[];
  try {
    forms = await getForms(db);
  } catch {
    return new Response(JSON.stringify({ error: "服务器开小差了，请稍后再试" }), { status: 500, headers: CORS });
  }
  const form = forms.find((f: any) => f.id === formId);
  if (!form) return new Response(JSON.stringify({ error: "表单不存在或已关闭" }), { status: 404, headers: CORS });

  // Honeypot check（静默伪装，不消耗频控）
  if (form.settings?.honeypot && fields["__hp"]) {
    return new Response(JSON.stringify({ ok: true, confirmation: form.confirmations?.[0] }), { headers: CORS });
  }

  // 频控（按 IP + 表单）
  if (!rateLimit(`${ip}:${formId}`)) {
    return new Response(JSON.stringify({ error: "提交过于频繁，请稍后再试" }), { status: 429, headers: CORS });
  }

  // Check entry limit
  if (form.settings?.limitEntries) {
    const entries = await getEntries(db, formId);
    const active = entries.filter((e: any) => e.status !== "trash");
    if (active.length >= Number(form.settings.limitEntriesCount ?? 0)) {
      return new Response(JSON.stringify({ error: form.settings.limitEntriesMessage ?? "本表单已停止接收提交" }), { status: 403, headers: CORS });
    }
  }

  // Check schedule
  if (form.settings?.scheduleForm) {
    const now = new Date();
    if (form.settings.scheduleStart && new Date(form.settings.scheduleStart) > now) {
      return new Response(JSON.stringify({ error: form.settings.scheduleClosedMessage ?? "表单尚未开放提交" }), { status: 403, headers: CORS });
    }
    if (form.settings.scheduleEnd && new Date(form.settings.scheduleEnd) < now) {
      return new Response(JSON.stringify({ error: form.settings.scheduleClosedMessage ?? "表单已关闭，不再接收提交" }), { status: 403, headers: CORS });
    }
  }

  // Validate required fields
  const formFields: any[] = form.fields ?? [];
  for (const field of formFields) {
    if (!field.required) continue;
    if (["page_break", "section_divider", "html", "captcha"].includes(field.type)) continue;
    const val = fields[field.id];
    if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
      return new Response(JSON.stringify({ error: `「${field.label || field.id}」为必填项` }), { status: 422, headers: CORS });
    }
  }

  // Store entry（硬上限兜底，防 wp_options 单行无限膨胀）
  const entries = await getEntries(db, formId);
  if (entries.length >= HARD_ENTRY_CAP) {
    return new Response(JSON.stringify({ error: "表单数据已达存储上限，无法继续提交" }), { status: 403, headers: CORS });
  }
  const entry = {
    id: uid(),
    formId,
    fields,
    date: new Date().toISOString(),
    ip,
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 255),
    status: "unread",
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 2000) : "",
  };

  entries.push(entry);
  await saveEntries(db, formId, entries);

  // Determine confirmation to return
  const confirmations: any[] = form.confirmations ?? [];
  const activeConf = confirmations.find((c: any) => c.active) ?? confirmations[0];

  return new Response(JSON.stringify({ ok: true, entryId: entry.id, confirmation: activeConf ?? null }), { headers: CORS });
};
