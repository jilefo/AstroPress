import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { readJsonBody } from "../../../lib/json-body";

const BLOCK_TYPES_DOC = `
AVAILABLE BLOCK TYPES — always prefer these over "html". Use html ONLY when nothing else fits.

1. hero      — Full-width banner. props: { heading, subtext, buttonText, buttonUrl, bgColor (hex), textColor (hex), align ("left"|"center"|"right"), height (px number) }
2. text      — Rich text section. props: { content (valid HTML string), align ("left"|"center"|"right") }
3. cta       — Call-to-action band. props: { heading, text, buttonText, buttonUrl, bgColor (hex), textColor (hex) }
4. features  — Feature/benefit grid (pricing tiers, team members, service cards, testimonials, FAQ items, stats — use this for any repeating card layout). props: { heading, subtext, cols (2|3|4), items: [{ icon (single emoji/symbol), title, text }] }
5. columns   — Two-column layout (text+image, side-by-side content, about sections). props: { leftContent (HTML), rightContent (HTML), gap ("2rem") }
6. form      — Embedded form. props: { formId (string — see available forms below), formTitle (string) }
7. image     — Image with optional caption. props: { src (URL or ""), alt, caption, align, width ("normal"|"wide"|"full") }
8. spacer    — Vertical gap. props: { height (px number) }
9. divider   — Horizontal rule. props: { style ("solid"|"dashed"|"dotted"), color (hex), thickness (px number) }
10. html     — Raw HTML. USE ONLY when types 1–9 cannot satisfy the requirement. props: { content (raw HTML) }

DECISION GUIDE:
- Pricing tables → "features" block (cols: 3, each item = one tier)
- Team/people sections → "features" block
- Testimonials → "features" block
- Stats / numbers → "features" block
- Contact/newsletter/signup → "form" block using an available form ID
- Side-by-side → "columns" block
- Long article text → "text" block with rich HTML content
- NEVER use "html" for layouts achievable with the above types
`;

function buildSystemPrompt(formsSection: string, siteContext: string, single: boolean): string {
  const base = `You are a web page block generator for AstroPress CMS.
${BLOCK_TYPES_DOC}
${formsSection}
Each block object must have exactly: { "id": "<8 random hex chars>", "type": "<one of the types above>", "props": { ... } }

Rules:
- Return ONLY a valid JSON array. No markdown fences, no explanation, no surrounding text.
- Generate 3–8 blocks that logically cover the prompt (unless generating a single block).
- Use realistic, compelling copy — never placeholder text like "Lorem ipsum".
- Choose colours that match the requested brand or style.
- Landing pages should start with a hero block.
- Prefer structured block types over html at all times.${siteContext ? `\n\n## Site Instructions & Context\n${siteContext}` : ""}`;

  if (single) return base + `\n\nIMPORTANT: Generate EXACTLY ONE block — the single block that best fits the request. Return a JSON array with exactly one element.`;
  return base;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function makeContactForm(title: string): any {
  return {
    id: uid(),
    title,
    fields: [
      { id: uid(), type: "name", label: "姓名", required: true, placeholder: "", description: "", defaultValue: "", cssClass: "", hideLabel: false, conditionalLogic: false },
      { id: uid(), type: "email", label: "邮箱", required: true, placeholder: "", description: "", defaultValue: "", cssClass: "", hideLabel: false, conditionalLogic: false },
      { id: uid(), type: "textarea", label: "留言内容", required: false, placeholder: "", description: "", defaultValue: "", cssClass: "", hideLabel: false, conditionalLogic: false },
    ],
    settings: { submitText: "发送留言", submitProcessingText: "发送中…", submitAlign: "left", formClass: "", labelAlignment: "top", ajax: true, honeypot: true, requireLogin: false, requireLoginMessage: "", scheduleForm: false, scheduleStart: "", scheduleEnd: "", scheduleClosedMessage: "", limitEntries: false, limitEntriesCount: 0, limitEntriesMessage: "", storeEntries: true },
    notifications: [],
    confirmations: [{ id: uid(), name: "默认", active: true, type: "message", message: "提交成功，我们会尽快与您联系。", redirectUrl: "", page: "", autoScroll: true, conditionalLogic: false }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeNewsletterForm(title: string): any {
  return {
    id: uid(),
    title,
    fields: [
      { id: uid(), type: "email", label: "邮箱地址", required: true, placeholder: "your@email.com", description: "", defaultValue: "", cssClass: "", hideLabel: false, conditionalLogic: false },
    ],
    settings: { submitText: "订阅", submitProcessingText: "订阅中…", submitAlign: "left", formClass: "", labelAlignment: "top", ajax: true, honeypot: true, requireLogin: false, requireLoginMessage: "", scheduleForm: false, scheduleStart: "", scheduleEnd: "", scheduleClosedMessage: "", limitEntries: false, limitEntriesCount: 0, limitEntriesMessage: "", storeEntries: true },
    notifications: [],
    confirmations: [{ id: uid(), name: "默认", active: true, type: "message", message: "订阅成功，感谢关注！", redirectUrl: "", page: "", autoScroll: true, conditionalLogic: false }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const cfAI = (locals as any).runtime?.env?.AI;

  const parsed = await readJsonBody<{ prompt?: string; currentBlocks?: any; singleBlock?: any }>(request);
  if (!parsed.ok) return parsed.response;
  const { prompt, currentBlocks, singleBlock } = parsed.data;
  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: "提示词不能为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Load AI settings ──────────────────────────────────────────────────────
  const [settingsRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_ai_settings"))
    .limit(1);

  if (!settingsRow?.value) {
    return new Response(
      JSON.stringify({ error: "尚未配置 AI 服务商，请前往「设置 → AI」完成配置。" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const settings = JSON.parse(settingsRow.value);
  const provider: string = settings.activeProvider ?? "anthropic";
  const cfg = settings.providers?.[provider];

  if (provider !== "cloudflare-ai" && (!cfg?.apiKey || cfg.enabled === false)) {
    return new Response(
      JSON.stringify({ error: `AI 服务商 "${provider}" 未配置或已被禁用，请前往「设置 → AI」检查。` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Load existing forms ───────────────────────────────────────────────────
  const [formsRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, "astropress_forms"))
    .limit(1);

  let forms: any[] = formsRow?.value ? JSON.parse(formsRow.value) : [];

  // Build forms section for the prompt
  let formsSection: string;
  if (forms.length > 0) {
    formsSection = `AVAILABLE FORMS (use the "form" block with these exact IDs when the layout needs a form):
${forms.map(f => `- formId: "${f.id}", formTitle: "${f.title}"`).join("\n")}`;
  } else {
    formsSection = `FORMS: No forms exist yet. If the layout needs a contact, newsletter, or signup form, use type "form" with formId: "__auto_contact__" for a contact form or formId: "__auto_newsletter__" for an email newsletter signup. The system will create these forms automatically.`;
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  const siteContext: string = settings.systemContext?.trim() ?? "";
  const fullSystemPrompt = buildSystemPrompt(formsSection, siteContext, !!singleBlock);

  const userMessage = currentBlocks?.length > 0
    ? `Current page has ${currentBlocks.length} block(s). ${prompt}`
    : prompt;

  const messages = [{ role: "user" as const, content: userMessage }];

  try {
    let raw: string;

    if (provider === "cloudflare-ai") {
      raw = await callCloudflareAI(cfAI, cfg?.defaultModel ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast", fullSystemPrompt, messages);
    } else if (provider === "anthropic") {
      raw = await callAnthropic(cfg.apiKey, cfg.defaultModel ?? "claude-sonnet-4-6", fullSystemPrompt, messages);
    } else if (provider === "openai") {
      raw = await callOpenAI(cfg.apiKey, cfg.defaultModel ?? "gpt-4o", fullSystemPrompt, messages);
    } else if (provider === "gemini") {
      raw = await callGemini(cfg.apiKey, cfg.defaultModel ?? "gemini-flash-latest", fullSystemPrompt, messages);
    } else if (provider === "mistral") {
      raw = await callMistral(cfg.apiKey, cfg.defaultModel ?? "mistral-large-latest", fullSystemPrompt, messages);
    } else if (provider === "groq") {
      raw = await callGroq(cfg.apiKey, cfg.defaultModel ?? "llama-3.3-70b-versatile", fullSystemPrompt, messages);
    } else if (provider === "custom") {
      if (!cfg?.baseUrl) {
        return new Response(
          JSON.stringify({ error: "自定义端点未配置 Base URL。请到 设置 → AI 填写 API 地址。" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      raw = await callOpenAICompatible(cfg.baseUrl, cfg.apiKey, cfg.defaultModel ?? "deepseek-chat", fullSystemPrompt, messages);
    } else {
      return new Response(
        JSON.stringify({ error: `未知的 AI 服务商：${provider}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI 返回内容中未找到 JSON 区块数组");
    let blocks: any[] = JSON.parse(jsonMatch[0]);

    // ── Post-process: resolve auto form placeholders ───────────────────────
    const autoContactNeeded = blocks.some(b => b.type === "form" && b.props?.formId === "__auto_contact__");
    const autoNewsletterNeeded = blocks.some(b => b.type === "form" && b.props?.formId === "__auto_newsletter__");

    if (autoContactNeeded || autoNewsletterNeeded) {
      // Re-load forms in case they changed
      const [freshFormsRow] = await db
        .select({ value: wpOptions.optionValue })
        .from(wpOptions)
        .where(eq(wpOptions.optionName, "astropress_forms"))
        .limit(1);
      forms = freshFormsRow?.value ? JSON.parse(freshFormsRow.value) : [];

      if (autoContactNeeded) {
        // Use existing contact-like form or create one
        let contactForm = forms.find(f =>
          /contact|inquiry|enquiry|get.?in.?touch/i.test(f.title)
        );
        if (!contactForm) {
          contactForm = makeContactForm("Contact Form");
          forms.push(contactForm);
        }
        blocks = blocks.map(b =>
          b.type === "form" && b.props?.formId === "__auto_contact__"
            ? { ...b, props: { ...b.props, formId: contactForm.id, formTitle: contactForm.title } }
            : b
        );
      }

      if (autoNewsletterNeeded) {
        let newsletterForm = forms.find(f =>
          /newsletter|subscribe|signup|sign.?up/i.test(f.title)
        );
        if (!newsletterForm) {
          newsletterForm = makeNewsletterForm("Newsletter Signup");
          forms.push(newsletterForm);
        }
        blocks = blocks.map(b =>
          b.type === "form" && b.props?.formId === "__auto_newsletter__"
            ? { ...b, props: { ...b.props, formId: newsletterForm.id, formTitle: newsletterForm.title } }
            : b
        );
      }

      // Save updated forms list back to DB
      await db
        .insert(wpOptions)
        .values({ optionName: "astropress_forms", optionValue: JSON.stringify(forms) })
        .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: JSON.stringify(forms) } });
    }

    return new Response(JSON.stringify({ blocks }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "生成失败，请稍后再试" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// ─── Provider implementations (mirrors chat.ts exactly) ───────────────────────

interface Msg { role: "user" | "assistant"; content: string; }

async function callCloudflareAI(ai: any, model: string, system: string, messages: Msg[]): Promise<string> {
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

async function callAnthropic(apiKey: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 4096, system, messages: messages.map(m => ({ role: m.role, content: m.content })) }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Anthropic 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.content[0].text as string;
}

async function callOpenAI(apiKey: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))] }),
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

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))] }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`自定义端点 ${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}

async function callGemini(apiKey: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 4096 } }),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.candidates[0].content.parts[0].text as string;
}

async function callMistral(apiKey: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))] }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Mistral 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}

async function callGroq(apiKey: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))] }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Groq 接口返回错误（HTTP ${res.status}）：${t.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}
