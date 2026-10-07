import { getOption } from "@astropress/core/query";

/**
 * Minimal server-side AI provider client for the translation endpoint.
 * Reads the SAME option the core AI assistant uses
 * (wp_options.astropress_ai_settings — configured at /admin/settings/ai)
 * so the plugin needs no credentials of its own. Provider call shapes
 * mirror apps/admin/src/pages/api/ai/chat.ts.
 */

export interface AIConfig {
  activeProvider: string;
  apiKey: string;
  model: string;
}

export async function loadAIConfig(db: any): Promise<AIConfig | null> {
  const raw = await getOption(db, "astropress_ai_settings", "");
  if (!raw) return null;
  let settings: any;
  try {
    settings = JSON.parse(raw);
  } catch {
    return null;
  }
  const provider: string = settings?.activeProvider ?? "anthropic";
  const cfg = settings?.providers?.[provider];
  if (provider !== "cloudflare-ai" && (!cfg?.apiKey || cfg.enabled === false)) return null;
  return {
    activeProvider: provider,
    apiKey: cfg?.apiKey ?? "",
    model: cfg?.defaultModel ?? defaultModel(provider),
  };
}

function defaultModel(provider: string): string {
  switch (provider) {
    case "anthropic": return "claude-sonnet-4-6";
    case "openai": return "gpt-4o";
    case "gemini": return "gemini-flash-latest";
    case "mistral": return "mistral-large-latest";
    case "groq": return "llama-3.3-70b-versatile";
    case "cloudflare-ai": return "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    default: return "gpt-4o";
  }
}

/** 从 Workers AI 任意返回形态中提取纯文本（兼容对象/数组/流结束形态） */
function extractCfText(result: any): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (result instanceof Uint8Array) return new TextDecoder().decode(result);

  const part = (x: any): string => {
    if (typeof x === "string") return x;
    if (x instanceof Uint8Array) return new TextDecoder().decode(x);
    if (x && typeof x === "object") {
      const inner = x.response ?? x.text ?? x.content ?? x.output ?? x.data ?? x.token ?? "";
      return typeof inner === "string" ? inner : "";
    }
    return "";
  };

  const candidate = result.response ?? result.text ?? result.output ?? result.content;
  if (typeof candidate === "string") return candidate;
  if (Array.isArray(candidate)) return candidate.map(part).join("");

  // OpenAI 风格 choices
  if (Array.isArray(result.choices)) {
    return result.choices.map((c: any) => c?.message?.content ?? part(c)).join("");
  }
  // 兜底：整体按可提取字段尝试
  const flat = part(candidate);
  if (flat) return flat;
  return JSON.stringify(result);
}

/** Call the configured provider. Returns the assistant text. */
export async function callProvider(
  cfg: AIConfig,
  system: string,
  userContent: string,
  cfAI?: any
): Promise<string> {
  const messages = [{ role: "user", content: userContent }];
  switch (cfg.activeProvider) {
    case "cloudflare-ai": {
      if (!cfAI) throw new Error("Cloudflare Workers AI 绑定不可用（仅 Cloudflare 部署支持该 provider）");
      const result = (await cfAI.run(cfg.model, {
        max_tokens: 8192,
        messages: [{ role: "system", content: system }, ...messages],
      })) as any;
      const text = extractCfText(result);
      // 记录返回结构，便于核对（不打印正文全文）
      console.warn("[ap-autofill] cfAI shape:", typeof result,
        result && typeof result === "object" ? Object.keys(result) : "",
        "textLen:", text.length);
      return text;
    }
    case "anthropic":
      return callOpenAICompatible("https://api.anthropic.com/v1/messages", {
        model: cfg.model, max_tokens: 8192, system,
        messages,
      }, {
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      }, (d) => d.content?.[0]?.text);
    case "gemini": {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userContent }] }],
            generationConfig: { maxOutputTokens: 8192 },
          }),
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        }
      );
      const data: any = await res.json();
      if (!res.ok) throw new Error(`Gemini 接口返回错误（HTTP ${res.status}）：${JSON.stringify(data).slice(0, 200)}`);
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    case "mistral":
      return callOpenAICompatible("https://api.mistral.ai/v1/chat/completions", {
        model: cfg.model, messages: [{ role: "system", content: system }, ...messages],
      }, { Authorization: `Bearer ${cfg.apiKey}` }, (d) => d.choices?.[0]?.message?.content);
    case "groq":
      return callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", {
        model: cfg.model, messages: [{ role: "system", content: system }, ...messages],
      }, { Authorization: `Bearer ${cfg.apiKey}` }, (d) => d.choices?.[0]?.message?.content);
    case "openai":
    default:
      return callOpenAICompatible("https://api.openai.com/v1/chat/completions", {
        model: cfg.model, messages: [{ role: "system", content: system }, ...messages],
      }, { Authorization: `Bearer ${cfg.apiKey}` }, (d) => d.choices?.[0]?.message?.content);
  }
}

/** 外发统一 120s 超时，防 provider 挂起占住连接 */
const AI_TIMEOUT_MS = 120_000;

async function callOpenAICompatible(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  pick: (data: any) => string | undefined
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "object" ? JSON.stringify(data.error) : String(data?.error ?? "");
    throw new Error(`AI 接口返回错误（HTTP ${res.status}）：${(msg || JSON.stringify(data)).slice(0, 200)}`);
  }
  const text = pick(data);
  if (typeof text !== "string") throw new Error("AI 服务返回的数据格式异常");
  return text;
}

/** Strip accidental markdown code fences / prose around the HTML reply. */
export function stripFences(text: string): string {
  let t = text.trim();
  const fence = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}
