/**
 * 统一归一化文本中的「外部图片引用」（服务端纵深防御）。
 *
 * 识别三类 token：
 *   1. <img src="http(s)://...">（含 ```action 围栏 JSON 里被反斜杠转义的引号形态）
 *   2. Markdown 图片 ![alt](http(s)://...)
 *   3. 裸图片 URL（http(s)://...png|jpg|jpeg|webp|gif|avif）
 *
 * 策略：
 *   - 同源（本站）引用一律跳过；
 *   - 外链图片前 maxImages 张调用 text_to_image 生成真实图片并落地 R2，原位替换；
 *   - 超出配额或生成失败的外链 token 直接移除——绝不把死链/编造链接留在内容里。
 *
 * 同一实现用于：
 *   - /api/ai/chat 响应（reply 自由文本 + 动作块，覆盖客户端 setContent 动作）
 *   - /api/ai/execute 请求体（服务端动作执行前的最后闸门）
 */
import { generateAndStore } from "./images";

export interface NormalizeResult {
  text: string;
  generated: number;
  stripped: number;
}

const IMG_TAG_RE = /<img\b[^>]*?>/gi;
const MD_IMG_RE = /!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+?)\s*\)/gi;
// svg 纳入裸链识别（外部 SVG 可内嵌脚本，属活动内容）；处理时直接剥离、不生成
const BARE_URL_RE =
  /(?<![("'\w\\])https?:\/\/\S+?\.(?:png|jpe?g|webp|gif|avif|svg)\b\S*/gi;

/**
 * 计算受保护的代码区间（围栏代码块 + 行内反引号代码）。
 * 代码示例中的 <img>/图片 URL 是“示例文本”，不能被替换或掏空。
 */
function computeProtectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lines = text.split("\n");
  let offset = 0;
  let fence: { ch: string; len: number; start: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1; // +1 for \n
    const fm = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const close = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
      if (close && close[1][0] === fence.ch && close[1].length >= fence.len) {
        ranges.push([fence.start, offset]);
        fence = null;
      }
      continue;
    }
    if (fm) {
      fence = { ch: fm[1][0], len: fm[1].length, start: lineStart };
      continue;
    }
    // 行内代码（含 `code` 形态；同一段落内可跨行，简化为单行）
    const inline = /`+[^`\n]+?`+/g;
    let im: RegExpExecArray | null;
    while ((im = inline.exec(line)) !== null) {
      ranges.push([lineStart + im.index, lineStart + im.index + im[0].length]);
    }
  }
  if (fence) ranges.push([fence.start, text.length]); // 未闭合围栏
  return ranges;
}

function isInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
  }
  return false;
}

/** 快速预检：是否含外链图片（img/md/裸链），不含则完全不触碰文本 */
export function containsExternalImage(text: string, ownHost: string): boolean {
  if (!/https?:\/\//i.test(text)) return false;
  const protectedRanges = computeProtectedRanges(text);
  for (const re of [IMG_TAG_RE, MD_IMG_RE, BARE_URL_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (isInRanges(m.index, protectedRanges)) continue;
      let url: string;
      if (re === IMG_TAG_RE) {
        const s = parseImgTag(m[0]).src;
        if (!s) continue;
        url = s;
      } else if (re === MD_IMG_RE) {
        url = m[2];
      } else {
        url = m[0];
      }
      if (isExternal(url, ownHost)) return true;
    }
  }
  return false;
}

interface Token {
  start: number;
  end: number;
  kind: "img" | "md" | "bare";
  url: string;
  alt: string;
  /** token 处于 JSON 转义上下文（```action 围栏内），替换时需保留反斜杠 */
  escaped: boolean;
}

function parseImgTag(tag: string): { src: string; alt: string; escaped: boolean } {
  const srcM =
    /\bsrc\s*=\s*\\?\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>\\]+))\\?/i.exec(tag);
  const altM = /\balt\s*=\s*\\?\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>\\]+))\\?/i.exec(tag);
  const src = (srcM?.[1] ?? srcM?.[2] ?? srcM?.[3] ?? "").trim();
  const alt = (altM?.[1] ?? altM?.[2] ?? altM?.[3] ?? "").trim();
  const escaped = /\\"|\\'/.test(tag);
  return { src, alt, escaped };
}

function isExternal(url: string, ownHost: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.host !== ownHost;
  } catch {
    return false;
  }
}

function cleanAlt(s: string): string {
  return s
    .replace(/[*_`#<>[\]\\]/g, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** 从 alt/标题构造 text_to_image 画面描述（主题可中文，风格描述英文） */
function buildPrompt(subject: string, titleHint: string): string {
  const s = cleanAlt(subject) || cleanAlt(titleHint) || "blog article section";
  return `${s}, editorial photo / illustration${
    titleHint ? ` related to "${cleanAlt(titleHint)}"` : ""
  }, clean modern style, soft natural light, high detail, wide composition`;
}

export async function normalizeImageRefs(
  input: string,
  options: {
    locals: any;
    request: Request;
    titleHint?: string;
    maxImages?: number;
  }
): Promise<NormalizeResult> {
  const { locals, request, titleHint = "" } = options;
  const maxImages = options.maxImages ?? 3;
  const ownHost = new URL(request.url).host;

  const protectedRanges = computeProtectedRanges(input);
  const tokens: Token[] = [];
  const collect = (re: RegExp, kind: Token["kind"]) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const match: RegExpExecArray = m;
      // 代码块/行内代码中的图片示例不处理
      if (isInRanges(match.index, protectedRanges)) continue;
      let url = "";
      let alt = "";
      let escaped = false;
      if (kind === "img") {
        const p = parseImgTag(match[0]);
        url = p.src; alt = p.alt; escaped = p.escaped;
      } else if (kind === "md") {
        url = match[2]; alt = match[1] ?? "";
      } else {
        url = match[0];
      }
      if (!url || !isExternal(url, ownHost)) continue;
      // 防止与先收集的 token 重叠
      if (tokens.some((t) => match.index < t.end && match.index + match[0].length > t.start)) continue;
      tokens.push({ start: match.index, end: match.index + match[0].length, kind, url, alt, escaped });
    }
  };
  collect(IMG_TAG_RE, "img");
  collect(MD_IMG_RE, "md");
  collect(BARE_URL_RE, "bare");
  tokens.sort((a, b) => a.start - b.start);
  if (tokens.length === 0) return { text: input, generated: 0, stripped: 0 };

  // 去重 URL：同一伪造链接只生成一次；svg 属活动内容，永不生成（直接剥离）
  const isSvg = (u: string) => /\.svg(?:[?#]|$)/i.test(u);
  const uniqueUrls: string[] = [];
  for (const t of tokens) if (!uniqueUrls.includes(t.url)) uniqueUrls.push(t.url);
  const chosen = uniqueUrls.filter((u) => !isSvg(u)).slice(0, maxImages);

  const urlMap = new Map<string, string>();
  let generated = 0;
  await Promise.all(
    chosen.map(async (u) => {
      // 以该 URL 对应的首个 token alt 作为画面主体
      const t = tokens.find((x) => x.url === u)!;
      try {
        const g = await generateAndStore(locals, request, buildPrompt(t.alt, titleHint));
        urlMap.set(u, g.url);
        generated++;
      } catch {
        /* 该外链将被移除 */
      }
    })
  );

  // 从后往前替换，避免位移
  let out = input;
  let stripped = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    const newUrl = urlMap.get(t.url);
    let rep: string;
    if (newUrl) {
      const alt = cleanAlt(t.alt) || cleanAlt(titleHint) || "配图";
      if (t.kind === "img") {
        const q = t.escaped ? '\\"' : '"';
        rep = t.escaped
          ? `<img src=${q}${newUrl}${q} alt=${q}${alt}${q} />`
          : `<img src=${q}${newUrl}${q} alt=${q}${alt}${q}>`;
      } else {
        rep = `![${alt}](${newUrl})`;
      }
    } else {
      rep = "";
      stripped++;
    }
    out = out.slice(0, t.start) + rep + out.slice(t.end);
  }
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");

  return { text: out, generated, stripped };
}
