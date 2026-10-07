import type { APIRoute } from "astro";
import { callProvider, loadAIConfig, stripFences } from "../../lib/ai";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const MAX_HTML = 20_000;
const TARGETS = new Set(["en", "zh-CN"]);

function systemPrompt(target: string): string {
  const langName = target === "en" ? "English" : "Simplified Chinese (zh-CN)";
  return [
    "You are a professional website-content translator.",
    `Translate the user's HTML content into ${langName}.`,
    "Rules:",
    "1. Preserve ALL HTML tags, attributes, structure and entity references EXACTLY — never add, remove, reorder or modify any tag.",
    "2. Translate ONLY the human-readable text between tags.",
    "3. Do NOT translate URLs, email addresses, code, <pre>/<code> contents, or placeholder-like text such as [ap-ad key=\"...\"].",
    "4. Keep headings, list items and paragraphs as separate blocks exactly as given.",
    "5. Output ONLY the translated HTML. No explanations, no markdown code fences.",
  ].join("\n");
}

/**
 * POST /api/ap-etools/translate  { html, target: "en" | "zh-CN" }
 * → { html }  (translated, tags preserved)
 * Login-protected (core /api/* session wall); CSRF-checked.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { html?: unknown; target?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const html = typeof body.html === "string" ? body.html : "";
  const target = typeof body.target === "string" ? body.target : "";
  if (!html.trim()) return json({ error: "待翻译内容不能为空" }, 400);
  if (html.length > MAX_HTML) return json({ error: `内容过长（${html.length} > ${MAX_HTML}），请分段处理` }, 400);
  if (!TARGETS.has(target)) return json({ error: `目标语言必须是：${[...TARGETS].join("、")}` }, 400);

  const cfg = await loadAIConfig(db);
  if (!cfg) {
    return json({ error: "AI 未配置：请到 设置 → AI 添加 provider API key（editor-tools 翻译使用站点 AI 配置）" }, 400);
  }

  try {
    const reply = await callProvider(cfg, systemPrompt(target), html, (locals as any).runtime?.env?.AI);
    const translated = stripFences(reply);
    if (!translated.trim()) return json({ error: "AI 返回了空内容" }, 502);
    return json({ html: translated });
  } catch (err) {
    return json({ error: `AI 调用失败：${String((err as Error)?.message ?? err)}` }, 502);
  }
};
