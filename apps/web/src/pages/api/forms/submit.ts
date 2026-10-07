import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

function uid() { return Math.random().toString(36).slice(2, 12); }
const key = (id: string) => `astropress_form_entries_${id}`;

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

const J = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const db = locals.db;
  if (!db) return J({ error: "服务器开小差了，请稍后再试" }, 500);

  let body: { formId?: string; fields?: Record<string, any>; pageUrl?: string };
  try {
    body = await request.json();
  } catch {
    return J({ error: "请求数据格式不正确" }, 400);
  }
  const { formId, fields } = body;
  if (!fields || typeof fields !== "object") return J({ error: "缺少表单字段数据" }, 400);

  if (!formId) return J({ error: "缺少表单标识 formId" }, 400);

  const forms = await getForms(db);
  const form = forms.find(f => f.id === formId);
  if (!form) return J({ error: "表单不存在或已删除" }, 404);

  // Honeypot
  if (form.settings?.honeypot && fields["__hp"]) {
    return J({ ok: true, confirmation: form.confirmations?.[0] });
  }

  // Entry limit
  if (form.settings?.limitEntries) {
    const entries = await getEntries(db, formId);
    const active = entries.filter((e: any) => e.status !== "trash");
    if (active.length >= Number(form.settings.limitEntriesCount ?? 0)) {
      return J({ error: form.settings.limitEntriesMessage ?? "表单已停止收集提交。" }, 403);
    }
  }

  // Schedule
  if (form.settings?.scheduleForm) {
    const now = new Date();
    if (form.settings.scheduleStart && new Date(form.settings.scheduleStart) > now) {
      return J({ error: form.settings.scheduleClosedMessage ?? "表单尚未开放提交。" }, 403);
    }
    if (form.settings.scheduleEnd && new Date(form.settings.scheduleEnd) < now) {
      return J({ error: form.settings.scheduleClosedMessage ?? "表单已停止收集提交。" }, 403);
    }
  }

  // Required field validation
  const formFields: any[] = form.fields ?? [];
  for (const field of formFields) {
    if (!field.required) continue;
    if (["page_break", "section_divider", "html", "content", "captcha"].includes(field.type)) continue;
    const val = fields[field.id];
    if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
      return J({ error: `请填写「${field.label}」。` }, 422);
    }
  }

  const entry = {
    id: uid(),
    formId,
    fields,
    date: new Date().toISOString(),
    ip: clientAddress ?? "unknown",
    userAgent: request.headers.get("user-agent") ?? "",
    status: "unread",
    pageUrl: body.pageUrl ?? "",
  };

  const entries = await getEntries(db, formId);
  entries.push(entry);
  await saveEntries(db, formId, entries);

  const confirmations: any[] = form.confirmations ?? [];
  const activeConf = confirmations.find((c: any) => c.active) ?? confirmations[0];

  return J({ ok: true, entryId: entry.id, confirmation: activeConf ?? null });
};
