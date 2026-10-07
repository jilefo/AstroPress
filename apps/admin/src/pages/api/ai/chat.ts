import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
// Register all built-in actions so the system prompt is complete
import "../../../lib/ai-actions";
import { getAllAIActions } from "../../../lib/ai-registry";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user)
    return new Response("未登录或登录已过期", { status: 401 });
  const cfAI = (locals as any).runtime?.env?.AI;

  let messages: ChatMessage[];
  let context: Record<string, any>;

  try {
    ({ messages, context } = await request.json() as any);
  } catch {
    return new Response(JSON.stringify({ error: "请求数据不是有效的 JSON 格式" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  // 容错：context 缺失/非对象会导致 Object.entries 崩溃（此异常在下方 try 之外）
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "缺少 messages 数组" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!context || typeof context !== "object") context = {};

  const row = await db
    .select()
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_ai_settings"))
    .get();

  if (!row?.optionValue) {
    return new Response(
      JSON.stringify({ error: "尚未配置 AI 服务商，请前往「设置 → AI」添加 API 密钥。" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let settings: any;
  try {
    settings = JSON.parse(row.optionValue);
  } catch {
    return new Response(
      JSON.stringify({ error: "AI 服务商配置已损坏，请在「设置 → AI」中重新配置。" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const provider: string = settings.activeProvider ?? "anthropic";
  const cfg = settings.providers?.[provider];

  if (provider !== "cloudflare-ai" && (!cfg?.apiKey || cfg.enabled === false)) {
    return new Response(
      JSON.stringify({ error: `AI 服务商 "${provider}" 未配置或已被禁用，请前往「设置 → AI」检查。` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const siteContext: string = settings.systemContext?.trim() ?? "";
  const system = buildSystemPrompt(context, siteContext);

  try {
    let reply: string;

    if (provider === "cloudflare-ai") {
      reply = await callCloudflareAI(cfAI, cfg?.defaultModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast", system, messages);
    } else if (provider === "anthropic") {
      reply = await callAnthropic(cfg.apiKey, cfg.defaultModel ?? "claude-sonnet-4-6", system, messages);
    } else if (provider === "openai") {
      reply = await callOpenAI(cfg.apiKey, cfg.defaultModel ?? "gpt-4o", system, messages);
    } else if (provider === "gemini") {
      reply = await callGemini(cfg.apiKey, cfg.defaultModel ?? "gemini-flash-latest", system, messages);
    } else if (provider === "mistral") {
      reply = await callMistral(cfg.apiKey, cfg.defaultModel ?? "mistral-large-latest", system, messages);
    } else if (provider === "groq") {
      reply = await callGroq(cfg.apiKey, cfg.defaultModel ?? "llama-3.3-70b-versatile", system, messages);
    } else if (provider === "custom") {
      if (!cfg?.baseUrl) {
        return new Response(
          JSON.stringify({ error: "自定义端点未配置 Base URL。请到 设置 → AI 填写 API 地址。" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      reply = await callOpenAICompatible(cfg.baseUrl, cfg.apiKey, cfg.defaultModel ?? "deepseek-chat", system, messages);
    } else {
      return new Response(
        JSON.stringify({ error: `未知的 AI 服务商：${provider}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "AI 请求失败，请稍后再试" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(context: Record<string, any>, siteContext = ""): string {
  const contextStr = Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");

  const actions = getAllAIActions();
  const serverActions = actions.filter((a) => a.serverSide);
  const clientActions = actions.filter((a) => !a.serverSide);

  const serverActionDocs = serverActions
    .map((a) => `- **${a.type}**: ${a.description}\n  Example: \`${a.example}\``)
    .join("\n");

  const clientActionDocs = clientActions
    .map((a) => `- **${a.type}**: ${a.description}\n  Example: \`${a.example}\``)
    .join("\n");

  return `You are AstroPress AI — a fully autonomous CMS assistant with complete control over this WordPress-compatible CMS. You act immediately; you never give instructions for the user to follow themselves.
${siteContext ? `\n## Site Instructions & Context\n${siteContext}\n` : ""}
## Current Page Context
${contextStr || "(none)"}

## Behaviour Rules
1. When the user asks you to do something, DO IT — emit the correct action block(s) immediately.
2. Never say "you can", "you should", "click", "go to", "navigate to", or give manual instructions.
3. Keep your reply to ONE short sentence confirming what you did. Do NOT write multiple confirmation sentences. Do NOT narrate each step separately.
4. For multi-step tasks emit ALL action blocks in one response — actions execute sequentially. ONE reply sentence + all action blocks. Never split into multiple replies.
5. Write complete, high-quality content — never placeholders.
6. Use **server-side actions** for create/update/delete operations — they work from any page.
7. Use **client-side actions** only when already on the relevant editor page.
8. NEVER emit duplicate or redundant actions. Each thing should be done ONCE. Do not setContent multiple times for the same request.

## Action Ordering & Dependencies
- **Always order by dependency**: if action B depends on action A (e.g. a taxonomy references a post type), emit A first.
- **Post type → Taxonomy**: always create the post type before creating taxonomies that attach to it.
- **No intermediate navigation**: do NOT emit a navigate action between other actions. Navigation only happens after ALL actions complete (the last navigate in the chain is used).
- If creating multiple related things (post type + taxonomies), emit all in one response in dependency order.

## Server-Side Actions
These execute via the API and work from any page:
${serverActionDocs}

## Client-Side Actions
These manipulate the current editor page DOM directly:
${clientActionDocs}

## Action Block Format
Emit one JSON action per fenced block at the END of your response, in dependency order:

\`\`\`action
{"type":"createPost","postType":"page","title":"Pricing","content":"<h2>Plans</h2><p>...</p>","status":"draft"}
\`\`\`

\`\`\`action
{"type":"setTitle","value":"Updated Title"}
\`\`\`

## Content Format
- Post content: clean semantic HTML (<h2>, <p>, <ul>, <strong>, <blockquote>)
- Titles: plain text, no HTML
- Excerpts: plain text, 1–2 sentences
- Form field types: text, email, textarea, select, checkbox, number, tel, url
- Taxonomy keys: lowercase, underscores only, max 32 chars (e.g. job_type, location)
- Post type keys: lowercase, underscores only, max 20 chars (e.g. job_application)

## Examples

User: "create a pricing page with 3 tiers"
→ "Created a draft pricing page with Starter, Pro, and Enterprise plans."
→ \`\`\`action\n{"type":"createPost","postType":"page","title":"Pricing","content":"<h2>Pricing Plans</h2>...","status":"draft"}\n\`\`\`

User: "create a contact form"
→ "Created a contact form with Name, Email, and Message fields."
→ \`\`\`action\n{"type":"createForm","name":"Contact Us","fields":[{"label":"Name","type":"text","required":true},{"label":"Email","type":"email","required":true},{"label":"Message","type":"textarea","required":true}]}\n\`\`\`

User: "create a job application post type with job type and location taxonomies"
→ "Created Job Applications post type with Job Type and Location taxonomies."
→ \`\`\`action\n{"type":"createPostType","name":"Job Applications","key":"job_application","singular":"Job Application","icon":"folder","description":"Job application listings"}\n\`\`\`
→ \`\`\`action\n{"type":"createTaxonomy","name":"Job Types","key":"job_type","singular":"Job Type","postTypes":["job_application"],"hierarchical":true}\n\`\`\`
→ \`\`\`action\n{"type":"createTaxonomy","name":"Locations","key":"location","singular":"Location","postTypes":["job_application"],"hierarchical":false}\n\`\`\`
→ \`\`\`action\n{"type":"navigate","url":"/admin/cpt/job_application"}\n\`\`\`

User: "create a products post type with brand and category taxonomies"
→ "Created Products post type with Brand and Category taxonomies."
→ \`\`\`action\n{"type":"createPostType","name":"Products","key":"product","singular":"Product","icon":"tag"}\n\`\`\`
→ \`\`\`action\n{"type":"createTaxonomy","name":"Brands","key":"brand","singular":"Brand","postTypes":["product"],"hierarchical":false}\n\`\`\`
→ \`\`\`action\n{"type":"createTaxonomy","name":"Product Categories","key":"product_category","singular":"Product Category","postTypes":["product"],"hierarchical":true}\n\`\`\`
→ \`\`\`action\n{"type":"navigate","url":"/admin/cpt/product"}\n\`\`\`

User: "change the site title to Acme Corp"
→ "Updated site title to Acme Corp."
→ \`\`\`action\n{"type":"updateSettings","settings":{"blogname":"Acme Corp"}}\n\`\`\`

User: "write the intro for this post" (on editor page)
→ "Written an engaging introduction."
→ \`\`\`action\n{"type":"setContent","html":"<p>...</p>"}\n\`\`\`

User: "publish this post" (on editor page)
→ "Published."
→ \`\`\`action\n{"type":"setStatus","value":"publish"}\n\`\`\`\`\`\`action\n{"type":"savePost","status":"publish"}\n\`\`\``;
}

// ─── Provider implementations ─────────────────────────────────────────────────

/** 外发统一 120s 超时，防 provider 挂起占住连接（Node 无默认总超时） */
const AI_TIMEOUT_MS = 120_000;

async function callCloudflareAI(ai: any, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  if (!ai) throw new Error("Cloudflare Workers AI 绑定不可用。请在 Cloudflare 控制台（Workers & Pages → 当前项目 → Settings → Bindings）添加名为 \"AI\" 的绑定。");
  const result = await ai.run(model, {
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  }) as any;
  return result.response ?? result.text ?? JSON.stringify(result);
}

async function callAnthropic(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Anthropic 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.content[0].text as string;
}

async function callOpenAI(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`OpenAI 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}

// 自定义 OpenAI 兼容端点（DeepSeek / 智谱 / 通义 / 豆包 / Ollama 等）
function normalizeBaseUrl(raw: string): string {
  const u = (raw ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) throw new Error("Base URL 必须以 http:// 或 https:// 开头");
  return u.endsWith("/chat/completions") ? u.slice(0, -"/chat/completions".length) : u;
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`自定义端点 ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}

async function callGemini(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.candidates[0].content.parts[0].text as string;
}

async function callMistral(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Mistral 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}

async function callGroq(apiKey: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Groq 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}
