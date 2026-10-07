/**
 * 宽松 JSON 解析：网页版 AI 返回的内容经常不严格符合 JSON
 * （markdown 围栏、前后缀散文、单引号、字符串内裸换行、尾逗号等）。
 * 本模块提供多级降级策略，尽量从任意文本中恢复结构化数据。
 */

import { marked } from "marked";

let markedConfigured = false;
/** GitHub 风格 Markdown → HTML（AI 写作的标准正文协议） */
function mdToHtml(md: string): string {
  if (!markedConfigured) {
    marked.setOptions({ gfm: true, breaks: false, async: false });
    markedConfigured = true;
  }
  const out = marked.parse(md);
  return typeof out === "string" ? out : md;
}

/** 去掉可能的 ```json ... ``` 围栏（含仅单侧围栏的情况） */
export function stripFences(text: string): string {
  let t = text.trim();
  const fence = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}

/** 取文本中「最外层」{...} 块（贪婪到最后一个 }，容忍前后缀散文） */
export function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/**
 * 修复常见 JSON 语法瑕疵：
 *  - 字符串值内的裸换行/制表符 → 转义
 *  - 尾逗号 → 删除
 *  - 单引号字符串 → 双引号（key/value 均处理）
 * 仅在直接 parse 失败后调用。
 */
export function repairJson(src: string): string {
  let s = src;

  // 1) 字符串内部的裸控制字符转义（按字符扫描，跟踪是否在字符串内）
  let out = "";
  let inStr = false;
  let quote = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") {
        out += ch + (s[i + 1] ?? "");
        i++;
        continue;
      }
      if (ch === quote) {
        inStr = false;
        quote = "";
        out += '"';
        continue;
      }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
    } else {
      if (ch === '"' || ch === "'") {
        inStr = true;
        quote = ch;
        out += '"';
        continue;
      }
      out += ch;
    }
  }
  s = out;

  // 2) 尾逗号（,} / ,]）
  s = s.replace(/,\s*([}\]])/g, "$1");

  return s;
}

/** 尝试以多级策略把任意文本解析成对象；全部失败返回 null */
export function looseJsonObject(text: string): Record<string, any> | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = stripFences(text);

  const attempts = [cleaned, extractJsonBlock(cleaned)].filter(Boolean) as string[];
  const seen = new Set<string>();
  for (const cand0 of attempts) {
    const cand = cand0.trim();
    if (seen.has(cand)) continue;
    seen.add(cand);
    // 直接解析
    try {
      const d = JSON.parse(cand);
      if (d && typeof d === "object" && !Array.isArray(d)) return d as Record<string, any>;
    } catch { /* next */ }
    // 修复后解析
    try {
      const d = JSON.parse(repairJson(cand));
      if (d && typeof d === "object" && !Array.isArray(d)) return d as Record<string, any>;
    } catch { /* next */ }
  }
  return null;
}

/** 正则提取单个字符串字段（兼容裸换行的宽松版：[\s\S] 直到下一个未转义引号） */
export function extractStringField(text: string, key: string): string | null {
  const re = new RegExp(`["']${key}["']\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const m = re.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1].replace(/\r?\n/g, "\\n")}"`);
  } catch {
    return m[1];
  }
}

/** 宽松读取字符串字段（对象或正则兜底），并做空白收敛+截断 */
export function pickString(d: Record<string, any> | null, text: string, keys: string[], max: number): string {
  if (d) {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim().slice(0, max);
    }
  }
  for (const k of keys) {
    const v = extractStringField(text, k);
    if (v && v.trim()) return v.replace(/\s+/g, " ").trim().slice(0, max);
  }
  return "";
}

/** 宽松读取数组字段（tags 等） */
export function pickStringArray(d: Record<string, any> | null, text: string, keys: string[], max: number): string[] {
  let arr: unknown[] | null = null;
  if (d) {
    for (const k of keys) {
      if (Array.isArray(d[k])) { arr = d[k]; break; }
    }
  }
  if (!arr) {
    // 正则兜底："tags": ["a", "b"]
    for (const k of keys) {
      const m = new RegExp(`["']${k}["']\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i").exec(text);
      if (m) {
        arr = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => {
          try { return JSON.parse(`"${x[1]}"`); } catch { return x[1]; }
        });
        break;
      }
    }
  }
  if (!arr) return [];
  return arr
    .filter((x): x is string => typeof x === "string" && !!x.trim())
    .map((x) => x.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 50))
    .slice(0, max);
}

/** 解码属性值中的 HTML 实体（仅用于协议识别） */
function decodeAttrEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 0))
    .replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(parseInt(n, 10) || 0))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n");
}

/**
 * URL 安全校验：http(s)/mailto/tel、站内相对路径、锚点/查询、
 * data:image（svg+xml 除外）放行；javascript:/vbscript:/file:/data:text、
 * 以及实体编码/空白混淆的伪协议一律拒绝。
 */
function isSafeUrl(rawVal: string): boolean {
  const v = decodeAttrEntities(rawVal.replace(/[\s]+/g, "")).trim();
  if (!v) return true;
  if (/^data:image\/svg/i.test(v)) return false;
  if (/^data:image\//i.test(v)) return true;
  if (/^https?:\/\//i.test(v) || /^(?:mailto:|tel:)/i.test(v)) return true;
  if (["/", "#", "?"].includes(v[0]) && !v.startsWith("//")) return true;
  // 其余任何具名协议（javascript:/vbscript:/file:…）拒绝；无协议相对路径放行
  return !/^[a-z][a-z0-9+.-]*:/i.test(v);
}

/** 剥危险 HTML：script/iframe/object/embed/form/link/meta、事件属性、style、危险链接协议 */
export function sanitizeHtml(content: string): string {
  return content
    .replace(/<(script|iframe|object|embed|form|link|meta)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|iframe|object|embed|form|link|meta)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, pre, rawVal) => {
      const val = String(rawVal).replace(/^["']|["']$/g, "");
      if (!isSafeUrl(val)) return `${pre}"#"`;
      return `${pre}"${val.replace(/"/g, "&quot;").slice(0, 2000)}"`;
    })
    .slice(0, 60000);
}

/** Markdown 正文 → 安全 HTML（marked 转换失败时退回内置轻量转换） */
export function markdownToHtml(md0: string): string {
  const md = md0.trim();
  if (!md) return "";
  try {
    return sanitizeHtml(mdToHtml(md));
  } catch {
    return markdownBodyToHtml(md);
  }
}

/**
 * 最终兜底：AI 完全没按 JSON 返回时，把自由文本/markdown 转成文章。
 * 标题取第一个 markdown 标题或第一行；正文按空行切段包 <p>，简单 markdown 内联转换。
 */
export function freeFormToArticle(raw: string, topic: string): { title: string; content: string } {
  let t = stripFences(raw);
  // 网页版 AI 常把 HTML 转义后输出（&lt;p&gt; 文本），先反转义再按 HTML 走，避免正文显示标签字面量
  if (!hasBlockHtml(t) && /&lt;\/?(p|h[1-6]|ul|ol|li|blockquote|div|br|strong|em)\b[^&]*&gt;/i.test(t)) {
    t = unescapeHtmlEntities(t);
  }
  // 反转义/原本即为 HTML 正文：直接取标题行，正文保持 HTML
  if (hasBlockHtml(t)) {
    const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t);
    const title = m ? htmlToText(m[1]).slice(0, 200) : topic.slice(0, 80);
    const body = m ? t.replace(m[0], "") : t;
    return { title: title || topic.slice(0, 80), content: normalizeContent(body) };
  }

  // 标题：# / **粗体单行** / 第一行
  let title = "";
  const h1 = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(t);
  if (h1) title = h1[1].replace(/[*_`]/g, "").trim();
  if (!title) {
    const boldLine = /^\s*\*{1,2}\s*(.+?)\s*\*{1,2}\s*$/m.exec(t);
    if (boldLine) title = boldLine[1].replace(/[*_`]/g, "").trim();
  }
  if (!title) {
    const firstLine = t.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    title = firstLine.replace(/^#+\s*/, "").replace(/[*_`#]/g, "").slice(0, 80);
  }
  if (!title) title = topic.slice(0, 80);

  // 去掉标题行，剩余转 HTML
  let body = t;
  const hIdx = body.indexOf(h1?.[0] ?? "__none__");
  if (h1 && hIdx >= 0) body = body.slice(hIdx + h1[0].length);

  let content = markdownToHtml(body);
  if (!content) content = `<p>${escapeHtml(topic)}</p>`;
  return { title: title.slice(0, 200), content };
}

/** HTML → 纯文本（用于生成摘要） */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** 检测字符串是否已含块级 HTML */
export function hasBlockHtml(s: string): boolean {
  return /<(p|h[1-6]|ul|ol|blockquote|div|section|article|table)\b/i.test(s);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inlineMd = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

/** markdown/纯文本正文 → 块级 HTML（# 标题、- 列表、空行/单换行分段） */
export function markdownBodyToHtml(body: string): string {
  const blocks: string[] = [];
  for (const rawBlock of body.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (/^#{2,4}\s+/.test(block)) {
      blocks.push(`<h2>${inlineMd(block.replace(/^#{2,4}\s+/, ""))}</h2>`);
    } else if (/^[-*]\s+/m.test(block)) {
      const items = block
        .split(/\n/)
        .map((x) => x.trim())
        .filter((x) => /^[-*]\s+/.test(x))
        .map((x) => `<li>${inlineMd(x.replace(/^[-*]\s+/, ""))}</li>`)
        .join("");
      if (items) blocks.push(`<ul>${items}</ul>`);
      else blocks.push(...block.split(/\n/).filter(Boolean).map((l) => `<p>${inlineMd(l.trim())}</p>`));
    } else {
      const paras = block.split(/\n/).map((x) => x.trim()).filter(Boolean);
      for (const ptext of paras) blocks.push(`<p>${inlineMd(ptext)}</p>`);
    }
  }
  return sanitizeHtml(blocks.join("\n"));
}

const BLOCK_LINE = /^<(p|h[1-6]|ul|ol|li|blockquote|div|section|article|table|thead|tbody|tr|td|th|br|img|figure|hr)\b/i;

/**
 * 反转义实体编码的 HTML（网页版 AI 界面常把 content 里的 <p> 渲染成 &lt;p&gt; 文本被抓回）。
 * 只在「看起来是转义 HTML」时调用，避免误伤正文里的正常 &amp; 等实体。
 */
function unescapeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * 归一化模型返回的正文：
 *  - 完全没有块级标签 → 走 markdown/纯文本转换；
 *  - 内容被实体转义（&lt;p&gt; 形式）→ 先反转义再按 HTML 处理，避免标签被当成纯文本显示；
 *  - 块级标签与裸露文本行混合（常见：几段裸文本 + <ul>）→ 给裸行补 <p>。
 */
export function normalizeContent(c0: string): string {
  let c = c0.trim();
  if (!c) return "";
  // 转义 HTML 检测：没有真实块级标签、但存在成对的 &lt;tag&gt; 实体
  if (!hasBlockHtml(c) && /&lt;\/?(p|h[1-6]|ul|ol|li|blockquote|div|br|strong|em|a|img)\b[^&]*&gt;/i.test(c)) {
    c = unescapeHtmlEntities(c).trim();
  }
  if (!hasBlockHtml(c)) return markdownToHtml(c);
  const out = c
    .split(/\r?\n/)
    .map((line) => {
      const l = line.trim();
      if (!l) return "";
      if (BLOCK_LINE.test(l)) return l;
      return `<p>${inlineMd(l)}</p>`;
    })
    .filter(Boolean)
    .join("\n");
  return sanitizeHtml(out);
}
