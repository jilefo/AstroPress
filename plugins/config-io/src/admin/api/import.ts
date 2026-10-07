import type { APIRoute } from "astro";
import {
  ALL_SECTIONS,
  IoError,
  MAX_IMPORT_BYTES,
  parseEnvelope,
  parseSections,
  runImport,
  type SectionName,
} from "../../lib/io";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /admin-ext/api/config-io/import
 * multipart/form-data:
 *   file     导出的 JSON 文件（≤20MB）
 *   mode     merge | replace
 *   sections 逗号分隔的 section 白名单（缺省全部）
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  // 写操作同源校验，防 CSRF
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "请以 multipart/form-data 格式上传文件" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "未收到上传文件" }, 400);
  if (file.size > MAX_IMPORT_BYTES) {
    return json({ error: `文件超过 20MB 上限（当前 ${file.size} 字节）` }, 413);
  }

  const modeRaw = String(form.get("mode") ?? "merge");
  const mode: "merge" | "replace" = modeRaw === "replace" ? "replace" : "merge";

  const requested: SectionName[] = (() => {
    const raw = form.get("sections");
    if (typeof raw !== "string" || !raw.trim()) return [...ALL_SECTIONS];
    return parseSections(raw);
  })();
  if (requested.length === 0) return json({ error: "没有有效的配置段" }, 400);

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return json({ error: "文件不是合法 JSON" }, 400);
  }

  try {
    const envelope = parseEnvelope(raw);
    const result = await runImport(db, envelope, requested, mode);
    return json(result);
  } catch (e) {
    if (e instanceof IoError) return json({ error: e.message }, e.status);
    console.error("[config-io] import failed:", e);
    return json({ error: "导入失败，请稍后再试" }, 500);
  }
};
