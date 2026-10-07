import type { APIRoute } from "astro";
import { loadAIConfig, callProvider } from "../../lib/ai";
import {
  looseJsonObject,
  pickString,
  pickStringArray,
  freeFormToArticle,
  htmlToText,
  normalizeContent,
} from "../../lib/parse";
import { htmlToMarkdown } from "../../lib/htmlmd";
import { wantsImages as wantsImagesFromTopic, generateAndStore } from "../../lib/images";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * 成功返回的「超集」结构：
 * - 扁平字段（ok/mode/title/content/markdown/...）供编辑页底部 autofill 脚本消费；
 * - 额外的 `data:{...}` 包裹供右侧 AIWidget 聊天面板（其读取 `resp.data.content`）消费。
 * 两者契约不同，故同时提供，避免修改核心前端，也不破坏既有消费方。
 */
const successPayload = (mode: "write" | "optimize", result: WriteResult) => ({
  ok: true as const,
  mode,
  ...result,
  data: { mode, ...result },
});

const MAX_TOPIC = 4000;
const MAX_ORIGINAL = 200_000;
/** 原文纯文本短于该长度视为「新文章」，走生成模式（用户要求 50 字为分界） */
const OPTIMIZE_MIN_CHARS = 50;
/** 返回内容去除图片后纯文本最低长度——防止 AI 只返回一张图片链接 */
const MIN_TEXT_AFTER_IMAGES = 100;

const SCHEMA_HINT = `{"title":"compelling post title","content":"full article body in GitHub-flavored Markdown","excerpt":"1-2 sentence plain-text summary under 120 chars","seoTitle":"SEO title under 60 chars","metaDesc":"meta description under 155 chars","focusKeyword":"main keyword phrase","tags":["3-6 short tags without #"]}`;

const COMMON_RULES = `Rules:
- Write in the SAME language as the article/topic (Chinese topic → Chinese output).
- content MUST be GitHub-flavored Markdown ONLY: ## / ### headings, - bullet lists, 1. numbered lists, > blockquotes, **bold**, *italic*, \`inline code\`, fenced code blocks, [text](url), plain paragraphs separated by blank lines.
- NEVER output HTML tags such as <p>, <h2>, <ul>, <div> or &lt;p&gt; entities inside content.
- content length: 4-8 well-structured sections/paragraphs.
- NEVER fabricate image URLs or write bare image links, markdown image syntax ![]() or <img> tags — you cannot host images.
- excerpt/metaDesc: single-line plain text.
- title/seoTitle: concise, no surrounding quotes.
- Reply with ONLY one JSON object. No markdown fences around the JSON, no prose before/after. All string values valid JSON (escape newlines inside strings).`;

/** 图文模式附加规则：用 [[IMG:prompt]] 占位，由后端生成真实图片后替换 */
const IMAGE_RULES = `- The reader needs an ILLUSTRATED article (图文). Embed EXACTLY 2-3 image placeholders at meaningful positions (e.g. after the intro and beside key sections), each on its OWN line.
- Placeholder format strictly: [[IMG:a concise, concrete English visual description of the photo/illustration, include subject, scene, style, lighting]]
- Do NOT output markdown image syntax, real URLs or <img> tags; ONLY the [[IMG:...]] placeholder. Keep the surrounding article text substantial (images supplement the text).`;

/** 新文章生成提示词 */
function buildWritePrompt(topic: string, includeImages: boolean): string {
  return `Write a complete blog post based on the topic/requirements below.

${SCHEMA_HINT}

${COMMON_RULES}
${includeImages ? "\n" + IMAGE_RULES : ""}

Topic / requirements:
${topic}`;
}

/** 已有文章优化提示词：把原文（Markdown）与用户指令一起发给 AI，要求在原文基础上优化 */
function buildOptimizePrompt(instruction: string, title: string, originalMd: string, includeImages: boolean): string {
  return `You are a professional WeChat-official-account style editor. Optimize the EXISTING blog post below according to the user's instruction, improving it IN PLACE.

${SCHEMA_HINT}

Rules:
- Optimize based ON the original article: keep its topic, facts, core viewpoints and intent; polish the title, structure, headings, logic, wording and readability. Do NOT fabricate an unrelated new article.
- If the instruction asks for expansion/condensing/rewrite tone, follow it while keeping the original subject.
- The "content" field MUST be a COMPLETE article body in GitHub-flavored Markdown with multiple sections/paragraphs (at least several hundred words of text).
- content MUST be GitHub-flavored Markdown ONLY (## headings, - lists, > quotes, **bold**, [text](url), blank-line separated paragraphs). NEVER output HTML tags.
- NEVER fabricate image URLs, bare image links, ![]() markdown images or <img> tags.
- Write in the SAME language as the original article.
- Reply with ONLY one JSON object (same schema), no fences, no prose.
${includeImages ? "\n" + IMAGE_RULES : ""}

User instruction:
${instruction}

Original title:
${title || "(untitled)"}

Original article (Markdown):
${originalMd}`;
}

const SYSTEM = "You are a professional blog writer, editor and SEO expert. You reply with one strict JSON object only.";

/** 网页 UI 垃圾文本特征（上传区/登录引导等被误当回复的固定文案） */
const UI_JUNK = /拖动到此处|支持文件格式|上传支持|扫码下载|打开.{0,8}App|登录后即可体验/;
/** prompt 模板占位符被原样回显时的特征（说明拿到的不是真正的文章） */
const TEMPLATE_JUNK =
  /compelling post title|plain-text summary under|meta description under \d|short tags without|github-flavored markdown only|optimize the existing blog post|reply with only one json object/i;

/** [[IMG:prompt]] 占位符（HTML 转换后可能带残余包裹） */
const IMAGE_PH_RE = /\[\[IMG:([^\]]+)\]\]/g;
/** 模型可能误写的 Markdown 图片或裸图片链接（图文模式外用于清理） */
const MD_IMAGE_URL_RE = /!\[[^\]]*\]\(\s*https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)\S*?\s*\)/gi;
const BARE_IMAGE_URL_RE = /(?<![("'\w])https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)\b/gi;

export interface ImageResolver {
  (prompt: string): Promise<string | null>;
}

/** 从标题/章节构造英文画面描述（text_to_image 需要具体英文 prompt） */
function imagePrompt(title: string, heading: string | null): string {
  const t = title.replace(/[*_`#]/g, "").trim();
  if (!heading) {
    return `${t}, hero header image, clean modern editorial photography, soft natural light, high detail, wide composition`;
  }
  const h = heading.replace(/[*_`#]/g, "").trim();
  return `${h}, related to "${t}", editorial illustration / photo, clean modern style, soft natural light, high detail, wide composition`;
}

/**
 * 程序层强制插图：以标题（封面）和前若干个 ## 章节为锚点，生成真实图片并以
 * Markdown 图片语法插入。最多 maxImages 张；图片生成失败的锚点跳过。
 */
async function insertForcedImages(
  md: string,
  title: string,
  resolver: ImageResolver,
  maxImages = 3
): Promise<{ markdown: string; count: number }> {
  // 先去掉模型可能误写的伪造图片，避免重复
  md = stripFakeImageLinks(md);
  // 锚点：行首索引 + 对应标题
  const lines = md.split("\n");
  const anchors: { index: number; heading: string | null }[] = [{ index: -1, heading: null }];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(lines[i].trim());
    if (m && anchors.length < maxImages) anchors.push({ index: i, heading: m[2] });
  }

  let count = 0;
  // 从后往前插入，避免索引位移
  for (let a = anchors.length - 1; a >= 0; a--) {
    const { index, heading } = anchors[a];
    let url: string | null = null;
    try {
      url = await resolver(imagePrompt(title, heading));
    } catch {
      url = null;
    }
    if (!url) continue;
    const img = `\n\n![${heading ? heading : title}](${url})\n`;
    if (index === -1) {
      lines.unshift(img.trim());
    } else {
      lines.splice(index + 1, 0, img);
    }
    count++;
  }
  return { markdown: lines.join("\n").replace(/\n{3,}/g, "\n\n"), count };
}

/** 清除模型误写的伪造图片（markdown 图/裸链接），避免返回不可显示的链接 */
function stripFakeImageLinks(markdown: string): string {
  return markdown
    .replace(MD_IMAGE_URL_RE, "")   // 先移除完整 markdown 图片（含外链）
    .replace(BARE_IMAGE_URL_RE, "") // 再移除残留裸图片链接
    .replace(/\n{3,}/g, "\n\n");
}

/** 从 AI 原始返回中恢复完整文章结构；任何情况下尽量返回可用结果 */
async function parseResult(
  raw: string,
  topic: string,
  opts: { wantImages?: boolean; resolver?: ImageResolver } = {}
): Promise<WriteResult | null> {
  const obj = looseJsonObject(raw);

  // content/title：JSON 成功直接用；否则自由文本兜底。
  // 保留模型原始 Markdown，便于在 Markdown 层按锚点强制插入真实图片。
  let title = pickString(obj, raw, ["title"], 200);
  let rawMd = "";
  let content = "";
  if (obj) {
    const c0 = typeof obj.content === "string" ? obj.content.trim() : "";
    if (c0) rawMd = c0;
  }
  const usedFallback = !title || !rawMd;
  if (usedFallback) {
    const fb = freeFormToArticle(raw, topic);
    if (!title) title = fb.title;
    if (!rawMd) {
      // 兜底拿到的是 HTML；转回 Markdown 再统一走插图流程
      rawMd = htmlToMarkdown(fb.content);
    }
  }
  if (!title || !rawMd) return null;

  // 图文：程序层强制生成并嵌入真实图片（不依赖模型是否写占位符）
  let imageCount = 0;
  if (opts.wantImages && opts.resolver) {
    const r = await insertForcedImages(rawMd, title, opts.resolver);
    rawMd = r.markdown;
    imageCount = r.count;
  } else {
    // 非图文：清理模型伪造的图片链接
    rawMd = stripFakeImageLinks(rawMd);
  }
  // 清除任何残余占位符
  rawMd = rawMd.replace(IMAGE_PH_RE, "");
  // 统一归一化为编辑器需要的块级 HTML
  content = normalizeContent(rawMd);

  // 质量闸门：内容过短、含网页 UI 垃圾文案或 prompt 模板回显时拒绝
  const plain = htmlToText(content);
  if (plain.length < 40) return null;
  // 去掉图片后再测纯文本长度，防止只返回图片
  const textWithoutImages = plain.replace(/<img[^>]*>/gi, "");
  if (textWithoutImages.trim().length < MIN_TEXT_AFTER_IMAGES) return null;
  if (UI_JUNK.test(raw.slice(0, 6000))) return null;
  if (TEMPLATE_JUNK.test(raw.slice(0, 6000))) return null;

  const excerpt =
    pickString(obj, raw, ["excerpt", "summary", "description"], 120) ||
    plain.slice(0, 118);
  const seoTitle =
    pickString(obj, raw, ["seoTitle", "seo_title"], 70) || title.slice(0, 60);
  const metaDesc =
    pickString(obj, raw, ["metaDesc", "metaDescription", "meta_description"], 165) ||
    excerpt.slice(0, 153);
  const focusKeyword =
    pickString(obj, raw, ["focusKeyword", "focus_keyword", "keyword", "keywords"], 60) ||
    title.slice(0, 20);
  const tags = pickStringArray(obj, raw, ["tags", "keywords"], 8);

  // 返回的 Markdown 即插入真实图片后的源文（图片为本站 /media/ 资源）。
  // 清理已在插图前对模型原文执行；此处不再 strip，以免误删刚插入的本站图片。
  const markdown = rawMd.trim();

  return { title, content, markdown, excerpt, seoTitle, metaDesc, focusKeyword, tags, imageCount };
}

/** 解析失败时带原始返回片段，方便用户/日志定位 */
function parseError(raw: string): string {
  const snippet = (raw || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return "AI 返回内容无法解析" + (snippet ? "（原始片段：" + snippet + "）" : "（空回复）") + "，请重试";
}

export interface WriteResult {
  title: string;
  content: string;
  /** 文章正文的 Markdown 版本（任何返回都强制提供） */
  markdown: string;
  excerpt: string;
  seoTitle: string;
  metaDesc: string;
  focusKeyword: string;
  tags: string[];
  /** 实际成功嵌入的真实图片数量 */
  imageCount: number;
}

/** 根据是否携带原文构造提示词；返回 { prompt, mode, wantImages } */
function resolvePrompt(topic: string, title: string, originalHtml: string): { prompt: string; mode: "write" | "optimize"; wantImages: boolean } {
  const wantImages = wantsImagesFromTopic(topic);
  const plain = htmlToText(originalHtml).trim();
  if (plain.length >= OPTIMIZE_MIN_CHARS) {
    const md = htmlToMarkdown(originalHtml).slice(0, MAX_ORIGINAL);
    if (md.length >= OPTIMIZE_MIN_CHARS) {
      return { prompt: buildOptimizePrompt(topic, title, md, wantImages), mode: "optimize", wantImages };
    }
  }
  return { prompt: buildWritePrompt(topic, wantImages), mode: "write", wantImages };
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  if (!db || !locals.user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { topic?: string; title?: string; content?: string };
  try {
    body = (await request.json()) as { topic?: string; title?: string; content?: string };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  const topic = (body.topic ?? "").trim().slice(0, MAX_TOPIC);
  if (!topic) return json({ error: "请先输入主题或优化要求" }, 400);
  const title = (body.title ?? "").trim().slice(0, 500);
  const originalHtml = (body.content ?? "").slice(0, MAX_ORIGINAL);
  const { prompt, mode, wantImages } = resolvePrompt(topic, title, originalHtml);

  // 真实图片解析器：把 LLM 给的画面描述交给 text_to_image，存 R2 后返回 URL
  const imageResolver: ImageResolver = async (p: string) => {
    const g = await generateAndStore(locals, request, p, "landscape_16_9");
    return g.url;
  };
  const parseOpts = { wantImages, resolver: imageResolver };

  const cfg = await loadAIConfig(db);
  if (cfg) {
    try {
      const reply = await callProvider(
        cfg,
        SYSTEM,
        prompt,
        (locals as any).runtime?.env?.AI
      );
      const result = await parseResult(reply, topic, parseOpts);
      if (!result) return json({ error: parseError(reply) }, 502);
      return json(successPayload(mode, result));
    } catch (err: any) {
      return json({ error: String(err?.message ?? err).slice(0, 300) }, 502);
    }
  }

  // 未配置 API Key 时回退到 AI 助手（浏览器会话）
  try {
    const { listSessions, sendPrompt, checkLoginStatus } = await import(
      "@astropress/plugin-ai-chat/lib/browser"
    );
    const { PROVIDERS } = await import("@astropress/plugin-ai-chat/lib/providers");

    // 候选平台：内存中标记已登录的优先，其次逐个探测持久化登录态
    const candidates = Array.from(
      new Set([
        ...listSessions().filter((s) => s.loggedIn).map((s) => s.provider),
        ...PROVIDERS.map((p) => p.id),
      ])
    );
    let usableId: string | undefined;
    for (const id of candidates) {
      try {
        const st = await checkLoginStatus(id);
        if (st.loggedIn) { usableId = id; break; }
      } catch { /* 单个平台探测失败不影响后续 */ }
    }
    if (!usableId) {
      return json({
        error: "未配置 AI 服务：请到「设置 → AI」填写 API Key，或到「插件 → AI 助手」登录后重试",
      }, 400);
    }

    // 网页版只发送任务正文（指令已内含 JSON 要求）；额外的 system 前缀反而
    // 可能被页面回显、干扰回复抓取
    const r = await sendPrompt(usableId, prompt);
    if (r.error) return json({ error: "AI 助手调用失败：" + r.error }, 502);
    // 记录原始返回摘要到服务端日志，便于排查解析问题
    console.warn("[ap-autofill] web AI raw reply head:", JSON.stringify(r.reply.slice(0, 300)));
    const parsed = await parseResult(r.reply, topic, parseOpts);
    if (!parsed) return json({ error: parseError(r.reply) }, 502);
    return json(successPayload(mode, parsed));
  } catch (e: any) {
    return json({ error: "AI 助手不可用：" + String(e?.message ?? e).slice(0, 200) }, 502);
  }
};
