import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const db = locals.db;
  let { provider, model, apiKey, baseUrl } = await request.json().catch(() => ({})) as any;

  // If no apiKey provided (masked / not changed), fall back to the saved key for this provider
  if (!apiKey && provider && provider !== "cloudflare-ai" && db) {
    const row = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_ai_settings")).limit(1).then((r: any) => r[0]);
    if (row?.value) {
      const saved = JSON.parse(row.value);
      apiKey = saved.providers?.[provider]?.apiKey;
      if (!model) model = saved.providers?.[provider]?.defaultModel;
      if (provider === "custom" && !baseUrl) baseUrl = saved.providers?.custom?.baseUrl;
    }
  }

  if (!provider || provider === "none") {
    return new Response(JSON.stringify({ error: "未选择 AI 服务商。" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const testMessages = [{ role: "user" as const, content: "Reply with exactly: OK" }];
  const system = "You are a test assistant. Follow instructions exactly.";

  try {
    let reply: string;

    if (provider === "cloudflare-ai") {
      const ai = (locals as any).runtime?.env?.AI;
      if (!ai) throw new Error("未找到 Cloudflare Workers AI 绑定（AI）。请在 Cloudflare 控制台为当前 Worker 添加名为 AI 的绑定（Settings → Bindings）。");
      const result = await ai.run(model ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        max_tokens: 32,
        messages: [{ role: "system", content: system }, ...testMessages],
      }) as any;
      reply = result.response ?? result.text ?? "OK";
    } else if (provider === "anthropic") {
      if (!apiKey) throw new Error("请填写 API Key。");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: model ?? "claude-haiku-4-5-20251001", max_tokens: 16, system, messages: testMessages }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`Anthropic 接口返回错误（HTTP ${res.status}）：${t.slice(0, 120)}`); }
      const data = await res.json() as any;
      reply = data.content[0].text;
    } else if (provider === "openai") {
      if (!apiKey) throw new Error("请填写 API Key。");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model ?? "gpt-4o-mini", max_tokens: 16, messages: [{ role: "system", content: system }, ...testMessages] }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`OpenAI 接口返回错误（HTTP ${res.status}）：${t.slice(0, 120)}`); }
      const data = await res.json() as any;
      reply = data.choices[0].message.content;
    } else if (provider === "gemini") {
      if (!apiKey) throw new Error("请填写 API Key。");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model ?? "gemini-flash-latest"}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: testMessages.map(m => ({ role: "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 16 } }),
        }
      );
      if (!res.ok) { const t = await res.text(); throw new Error(`Gemini 接口返回错误（HTTP ${res.status}）：${t.slice(0, 120)}`); }
      const data = await res.json() as any;
      reply = data.candidates[0].content.parts[0].text;
    } else if (provider === "mistral") {
      if (!apiKey) throw new Error("请填写 API Key。");
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model ?? "mistral-small-latest", max_tokens: 16, messages: [{ role: "system", content: system }, ...testMessages] }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`Mistral 接口返回错误（HTTP ${res.status}）：${t.slice(0, 120)}`); }
      const data = await res.json() as any;
      reply = data.choices[0].message.content;
    } else if (provider === "groq") {
      if (!apiKey) throw new Error("请填写 API Key。");
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model ?? "llama-3.1-8b-instant", max_tokens: 16, messages: [{ role: "system", content: system }, ...testMessages] }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`Groq 接口返回错误（HTTP ${res.status}）：${t.slice(0, 120)}`); }
      const data = await res.json() as any;
      reply = data.choices[0].message.content;
    } else if (provider === "custom") {
      if (!baseUrl) throw new Error("Base URL 未填写。请填入 OpenAI 兼容端点地址，例如 https://api.deepseek.com");
      if (!apiKey) throw new Error("请填写 API Key。");
      const u = baseUrl.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(u)) throw new Error("Base URL 必须以 http:// 或 https:// 开头");
      const url = (u.endsWith("/chat/completions") ? u : u + "/chat/completions");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model ?? "deepseek-chat", max_tokens: 16, messages: [{ role: "system", content: system }, ...testMessages] }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`自定义端点 ${res.status}: ${t.slice(0, 120)}`); }
      const data = await res.json() as any;
      reply = data.choices[0].message.content;
    } else {
      throw new Error(`未知的 AI 服务商：${provider}`);
    }

    return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "连接测试失败，请稍后再试" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
};
