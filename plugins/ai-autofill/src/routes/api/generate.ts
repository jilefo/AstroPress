import type { APIRoute } from "astro";
import { loadAIConfig, callProvider } from "../../lib/ai";
import { looseJsonObject, pickString, pickStringArray } from "../../lib/parse";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const MAX_CONTENT = 12000;

export interface AutofillResult {
  excerpt: string;
  seoTitle: string;
  metaDesc: string;
  focusKeyword: string;
  tags: string[];
}

function buildPrompt(title: string, content: string): string {
  const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT);
  return `Based on the following blog post, generate SEO metadata. Reply with ONLY one JSON object, no markdown fences, no prose. Escape newlines inside strings:

{"excerpt":"1-2 sentence plain-text summary","seoTitle":"max 60 chars","metaDesc":"max 155 chars","focusKeyword":"main keyword phrase","tags":["3-6 short tags"]}

Rules:
- Write in the SAME language as the post content.
- excerpt/metaDesc: plain text, no HTML, no line breaks.
- seoTitle: compelling, includes the focus keyword if natural.
- tags: short noun phrases, no # symbols.

Title: ${title}

Content:
${text}`;
}

function parseResult(raw: string): AutofillResult | null {
  const obj = looseJsonObject(raw);
  if (!obj) return null;
  const excerpt = pickString(obj, raw, ["excerpt", "summary"], 500);
  const seoTitle = pickString(obj, raw, ["seoTitle", "seo_title"], 70);
  const metaDesc = pickString(obj, raw, ["metaDesc", "metaDescription", "meta_description"], 165);
  const focusKeyword = pickString(obj, raw, ["focusKeyword", "focus_keyword", "keyword"], 60);
  const tags = pickStringArray(obj, raw, ["tags"], 8);
  if (!excerpt && !seoTitle) return null;
  return { excerpt, seoTitle, metaDesc, focusKeyword, tags };
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  if (!db || !locals.user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { title?: string; content?: string };
  try {
    body = (await request.json()) as { title?: string; content?: string };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  const title = (body.title ?? "").trim();
  const content = (body.content ?? "").trim();
  if (!title && !content) return json({ error: "请先填写标题或内容" }, 400);

  const cfg = await loadAIConfig(db);

  // 优先使用 API Key 配置的 AI 服务
  if (cfg) {
    try {
      const reply = await callProvider(
        cfg,
        "You are an SEO expert CMS assistant. You reply with strict JSON only.",
        buildPrompt(title, content),
        (locals as any).runtime?.env?.AI
      );
      const result = parseResult(reply);
      if (!result || (!result.excerpt && !result.seoTitle)) {
        return json({ error: "AI 返回内容无法解析，请重试" }, 502);
      }
      return json({ ok: true, ...result });
    } catch (err: any) {
      return json({ error: String(err?.message ?? err).slice(0, 300) }, 502);
    }
  }

  // 未配置 API Key 时，回退到 AI 助手插件（网页版浏览器会话，扫码登录即可用）
  const fb = await tryBrowserAssistant(title, content);
  if (fb.ok && fb.result) return json({ ok: true, ...fb.result });
  return json({ error: fb.error || "AI 助手不可用" }, fb.status ?? 400);
};

interface FallbackResult {
  ok: boolean;
  status?: number;
  result?: AutofillResult;
  error?: string;
}

async function tryBrowserAssistant(title: string, content: string): Promise<FallbackResult> {
  try {
    const { listSessions, sendPrompt, checkLoginStatus } = await import(
      "@astropress/plugin-ai-chat/lib/browser"
    );
    const { PROVIDERS } = await import("@astropress/plugin-ai-chat/lib/providers");

    // 1) 优先复用本次运行中已登录的会话
    let providerId = listSessions().find((s) => s.loggedIn)?.provider;
    // 2) 否则依次探测（上限 3 个，避免启动过多浏览器实例）
    if (!providerId) {
      for (const p of PROVIDERS.slice(0, 3)) {
        try {
          const st = await checkLoginStatus(p.id);
          if (st.loggedIn) {
            providerId = p.id;
            break;
          }
        } catch {
          /* 单个平台探测失败不影响后续 */
        }
      }
    }
    if (!providerId) {
      return {
        ok: false,
        status: 400,
        error:
          "未配置 AI 服务：请到「设置 → AI」填写 API Key，或到「插件 → AI 助手」登录 DeepSeek 等平台（支持扫码）后重试",
      };
    }

    const r = await sendPrompt(
      providerId,
      "You are an SEO expert CMS assistant. You reply with strict JSON only.\n\n" +
        buildPrompt(title, content)
    );
    if (r.error) return { ok: false, status: 502, error: "AI 助手调用失败：" + r.error };
    const parsed = parseResult(r.reply);
    if (!parsed || (!parsed.excerpt && !parsed.seoTitle)) {
      return { ok: false, status: 502, error: "AI 助手返回内容无法解析，请重试" };
    }
    return { ok: true, result: parsed };
  } catch (e: any) {
    return {
      ok: false,
      status: 502,
      error: "AI 助手不可用：" + String(e?.message ?? e).slice(0, 200),
    };
  }
}
