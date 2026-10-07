/**
 * HTML → Markdown 转换器（服务端，零依赖，正则实现）。
 *
 * 用途：AI 写文章「优化已有文章」模式下，把 contentEditable 编辑器保存的
 * 语义化 HTML（<p>/<h2>/<ul>/<blockquote>/<a>/<strong> 等）转回 Markdown，
 * 连同用户指令一起发给 AI，使优化结果建立在原文基础上而非另起炉灶。
 *
 * 输入来自本站受信编辑器（已登录用户、已在客户端/服务端清洗），
 * 这里仍做基础防御：丢弃 script/style/object/embed 等标签。
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", middot: "·",
};

export function decodeHtmlEntities(s: string): string {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

/** 删除危险/无意义节点（内容一并丢弃） */
function dropNonContent(html: string): string {
  return html
    .replace(/<(script|style|head|object|embed|applet|iframe|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|object|embed|applet|iframe)[^>]*\/?>/gi, "");
}

/** 行内级 HTML → Markdown 语法（作用于已拆出的块内部文本） */
function inlineToMd(html: string): string {
  let t = html;
  // 图片（放在链接之前，避免被链接规则吞掉）
  t = t.replace(
    /<img[^>]*\balt=["']([^"']*)["'][^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/gi,
    (_, alt, src) => `![${decodeHtmlEntities(alt)}]${safeUrl(src) ? `(${src})` : ""}`
  );
  t = t.replace(
    /<img[^>]*\bsrc=["']([^"']+)["'][^>]*\balt=["']([^"']*)["'][^>]*\/?>/gi,
    (_, src, alt) => `![${decodeHtmlEntities(alt)}]${safeUrl(src) ? `(${src})` : ""}`
  );
  t = t.replace(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/gi, (_, src) =>
    safeUrl(src) ? `![](${src})` : ""
  );
  // 链接
  t = t.replace(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const text = decodeHtmlEntities(inlineToMd(inner)).replace(/\s+/g, " ").trim();
    const url = safeUrl(href) ? href.trim() : "";
    if (!url) return text;
    return text ? `[${text}](${url})` : url;
  });
  // 行内代码
  t = t.replace(/<(?:code|tt)\b[^>]*>([\s\S]*?)<\/(?:code|tt)>/gi, (_, c) =>
    "`" + decodeHtmlEntities(c).trim().replace(/`/g, "ʼ") + "`"
  );
  // 粗体 / 斜体
  t = t.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, c) => `**${inlineToMd(c)}**`);
  t = t.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, c) => `*${inlineToMd(c)}*`);
  t = t.replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, c) => `~~${inlineToMd(c)}~~`);
  // 换行
  t = t.replace(/<br\s*\/?>/gi, "\n");
  return t;
}

function safeUrl(u: string): boolean {
  const v = (u || "").trim().toLowerCase();
  if (!v) return false;
  if (/^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/.test(v)) return true;
  return false;
}

function cleanInline(s: string): string {
  return decodeHtmlEntities(s).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * HTML → Markdown。覆盖编辑器常见标签；未识别的标签直接剥离、文本保留。
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let t = dropNonContent(html);

  // HTML 注释
  t = t.replace(/<!--[\s\S]*?-->/g, "");

  // 围栏代码块 <pre><code class="language-x"> / <pre>
  t = t.replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, code) => "\n\n```\n" + decodeHtmlEntities(code).replace(/^\n+|\n+$/g, "") + "\n```\n\n");
  t = t.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, code) => "\n\n```\n" + decodeHtmlEntities(code).replace(/^\n+|\n+$/g, "") + "\n```\n\n");

  // 标题
  t = t.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, c) => {
    const text = cleanInline(inlineToMd(c)).replace(/\n+/g, " ");
    return "\n\n" + "#".repeat(Number(n)) + " " + text + "\n\n";
  });

  // 分隔线
  t = t.replace(/<hr\b[^>]*\/?>/gi, "\n\n---\n\n");

  // 引用块（多层嵌套统一按一层处理，每行加 > ）
  t = t.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, inner) => {
    const body = blockToText(inner)
      .split("\n")
      .map((l) => "> " + l)
      .join("\n");
    return "\n\n" + body.trim() + "\n\n";
  });

  // 列表：<ul>/<ol>...</ol>，支持一层嵌套
  t = t.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, tag, inner) => {
    const ordered = tag.toLowerCase() === "ol";
    let idx = 0;
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = liRe.exec(inner))) {
      // 嵌套列表先转成缩进文本
      let item = lm[1].replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (nm: string, t2: string, in2: string) => {
        const sub = in2
          .split(/<li\b[^>]*>|<\/li>/i)
          .map((x) => cleanInline(inlineToMd(x)))
          .filter((x) => x.trim())
          .map((x, i) => `\n    - ${x.replace(/\s+/g, " ").trim()}`)
          .join("");
        return sub;
      });
      item = cleanInline(inlineToMd(item)).replace(/\n{2,}/g, "\n");
      items.push((ordered ? `${++idx}. ` : "- ") + item.split("\n").join("\n  "));
    }
    return "\n\n" + items.join("\n") + "\n\n";
  });

  // 段落 / 区块容器边界
  t = t.replace(/<p\b[^>]*>/gi, "\n\n");
  t = t.replace(/<\/p>/gi, "\n\n");
  t = t.replace(/<div\b[^>]*>/gi, "\n");
  t = t.replace(/<\/div>/gi, "\n");

  // 剩余标签全部剥离（表格、span、section、figure 等，文本保留）
  t = inlineToMd(t);
  t = t.replace(/<[^>]+>/g, "");
  t = decodeHtmlEntities(t);

  // 空行收敛 + 行尾空白
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

/** 块级节点（blockquote 内层）→ 纯文本/简单 markdown */
function blockToText(inner: string): string {
  let t = inner
    .replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m: string, tag: string, body: string) => {
      const ordered = tag.toLowerCase() === "ol";
      let i = 0;
      return body
        .split(/<li\b[^>]*>|<\/li>/i)
        .map((x) => cleanInline(inlineToMd(x)))
        .filter((x) => x.trim())
        .map((x) => (ordered ? `${++i}. ${x}` : `- ${x}`))
        .join("\n");
    })
    .replace(/<p\b[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n");
  t = inlineToMd(t).replace(/<[^>]+>/g, "");
  return cleanInline(t);
}
