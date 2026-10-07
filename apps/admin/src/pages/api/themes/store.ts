import type { APIRoute } from "astro";

function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── Built-in Header Templates ────────────────────────────────────────────────

const HEADER_CLASSIC = [{ id: uid(), type: "nav", props: { logoText: "", align: "right" } }];

const HEADER_CENTERED = [{ id: uid(), type: "html", props: { content: `<header style="background:var(--color-bg,#fff);border-bottom:1px solid var(--color-border,#e9ecef);padding:16px 48px;text-align:center;"><a href="/" style="font-family:var(--font-heading,sans-serif);font-size:1.5rem;font-weight:700;color:var(--color-text,#212529);text-decoration:none;">站点名称</a><nav style="margin-top:12px;display:flex;gap:24px;justify-content:center;flex-wrap:wrap;"><a href="/" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;">首页</a><a href="/about" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;">关于</a><a href="/blog" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;">博客</a><a href="/contact" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;">联系</a></nav></header>` } }];

const HEADER_DARK = [{ id: uid(), type: "html", props: { content: `<header style="background:#1d2327;padding:0 48px;height:68px;display:flex;align-items:center;justify-content:space-between;"><a href="/" style="font-family:var(--font-heading,sans-serif);font-weight:700;font-size:1.2rem;color:#fff;text-decoration:none;">站点名称</a><nav style="display:flex;gap:0;"><a href="/" style="color:rgba(255,255,255,0.75);text-decoration:none;font-size:0.9rem;padding:8px 14px;transition:color 0.15s;">首页</a><a href="/about" style="color:rgba(255,255,255,0.75);text-decoration:none;font-size:0.9rem;padding:8px 14px;">关于</a><a href="/blog" style="color:rgba(255,255,255,0.75);text-decoration:none;font-size:0.9rem;padding:8px 14px;">博客</a><a href="/contact" style="color:rgba(255,255,255,0.75);text-decoration:none;font-size:0.9rem;padding:8px 14px;">联系</a></nav></header>` } }];

const HEADER_BRANDED = [{ id: uid(), type: "html", props: { content: `<header style="background:var(--color-primary,#2271b1);padding:0 48px;height:68px;display:flex;align-items:center;justify-content:space-between;"><a href="/" style="font-family:var(--font-heading,sans-serif);font-weight:700;font-size:1.3rem;color:#fff;text-decoration:none;">站点名称</a><nav style="display:flex;gap:0;"><a href="/" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:0.9rem;padding:8px 16px;">首页</a><a href="/about" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:0.9rem;padding:8px 16px;">关于</a><a href="/blog" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:0.9rem;padding:8px 16px;">博客</a><a href="/contact" style="background:rgba(255,255,255,0.2);color:#fff;text-decoration:none;font-size:0.9rem;padding:8px 16px;border-radius:4px;">联系</a></nav></header>` } }];

const HEADER_SPLIT = [{ id: uid(), type: "html", props: { content: `<header style="background:var(--color-bg,#fff);border-bottom:1px solid var(--color-border,#e9ecef);"><div style="background:var(--color-primary,#2271b1);padding:6px 48px;text-align:right;"><a href="/login" style="color:rgba(255,255,255,0.8);font-size:12px;text-decoration:none;margin-left:16px;">登录</a><a href="/contact" style="color:rgba(255,255,255,0.8);font-size:12px;text-decoration:none;margin-left:16px;">联系</a></div><div style="padding:0 48px;height:68px;display:flex;align-items:center;justify-content:space-between;"><a href="/" style="font-family:var(--font-heading,sans-serif);font-weight:700;font-size:1.4rem;color:var(--color-text,#212529);text-decoration:none;">站点名称</a><nav style="display:flex;gap:0;"><a href="/" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;padding:8px 14px;">首页</a><a href="/about" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;padding:8px 14px;">关于</a><a href="/services" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;padding:8px 14px;">服务</a><a href="/blog" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;padding:8px 14px;">博客</a><a href="/contact" style="color:var(--color-muted,#6c757d);text-decoration:none;font-size:0.9rem;padding:8px 14px;">联系</a></nav></div></header>` } }];

// ─── Built-in Footer Templates ────────────────────────────────────────────────

const FOOTER_SIMPLE = [{ id: uid(), type: "html", props: { content: `<footer style="background:var(--color-surface,#f8f9fa);border-top:1px solid var(--color-border,#e9ecef);padding:24px 48px;text-align:center;"><p style="margin:0;font-size:13px;color:var(--color-muted,#6c757d);">© ${new Date().getFullYear()} 你的站点。保留所有权利。</p></footer>` } }];

const FOOTER_DARK = [{ id: uid(), type: "html", props: { content: `<footer style="background:#1d2327;color:#a7aaad;padding:48px;"><div style="max-width:1200px;margin:0 auto;display:flex;justify-content:center;gap:32px;flex-wrap:wrap;margin-bottom:28px;"><a href="/" style="color:#a7aaad;text-decoration:none;font-size:13px;">首页</a><a href="/about" style="color:#a7aaad;text-decoration:none;font-size:13px;">关于</a><a href="/blog" style="color:#a7aaad;text-decoration:none;font-size:13px;">博客</a><a href="/services" style="color:#a7aaad;text-decoration:none;font-size:13px;">服务</a><a href="/contact" style="color:#a7aaad;text-decoration:none;font-size:13px;">联系</a></div><p style="text-align:center;margin:0;font-size:12px;color:#646970;">© ${new Date().getFullYear()} 你的站点。保留所有权利。</p></footer>` } }];

const FOOTER_FOUR_COL = [{ id: uid(), type: "html", props: { content: `<footer style="background:#1d2327;color:#a7aaad;padding:60px 48px 32px;"><div style="max-width:1200px;margin:0 auto;"><div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:48px;"><div><h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0 0 12px;">站点名称</h3><p style="font-size:13px;line-height:1.7;margin:0 0 16px;">为全球用户打造卓越的数字体验。</p></div><div><h4 style="color:#fff;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 14px;">公司</h4><div style="display:flex;flex-direction:column;gap:9px;"><a href="/about" style="color:#a7aaad;text-decoration:none;font-size:13px;">关于</a><a href="/services" style="color:#a7aaad;text-decoration:none;font-size:13px;">服务</a><a href="/contact" style="color:#a7aaad;text-decoration:none;font-size:13px;">联系</a></div></div><div><h4 style="color:#fff;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 14px;">资源</h4><div style="display:flex;flex-direction:column;gap:9px;"><a href="/blog" style="color:#a7aaad;text-decoration:none;font-size:13px;">博客</a><a href="/docs" style="color:#a7aaad;text-decoration:none;font-size:13px;">文档</a><a href="/faq" style="color:#a7aaad;text-decoration:none;font-size:13px;">常见问题</a></div></div><div><h4 style="color:#fff;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 14px;">法律信息</h4><div style="display:flex;flex-direction:column;gap:9px;"><a href="/privacy" style="color:#a7aaad;text-decoration:none;font-size:13px;">隐私政策</a><a href="/terms" style="color:#a7aaad;text-decoration:none;font-size:13px;">服务条款</a></div></div></div><div style="border-top:1px solid #3c434a;padding-top:24px;text-align:center;"><p style="margin:0;font-size:12px;color:#646970;">© ${new Date().getFullYear()} 你的站点。保留所有权利。</p></div></div></footer>` } }];

const FOOTER_BRAND = [{ id: uid(), type: "html", props: { content: `<footer style="background:var(--color-primary,#2271b1);color:rgba(255,255,255,0.85);padding:40px 48px;"><div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;"><div><strong style="color:#fff;font-size:1.1rem;">站点名称</strong><p style="margin:6px 0 0;font-size:13px;opacity:0.8;">© ${new Date().getFullYear()} 保留所有权利。</p></div><nav style="display:flex;gap:24px;flex-wrap:wrap;"><a href="/" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">首页</a><a href="/about" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">关于</a><a href="/blog" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">博客</a><a href="/privacy" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">隐私政策</a></nav></div></footer>` } }];

// ─── Built-in Template Library ────────────────────────────────────────────────

export const TEMPLATE_LIBRARY: Record<string, Array<{ id: string; name: string; free: boolean; blocks: any[] }>> = {
  header: [
    { id: "header-classic", name: "经典", free: true, blocks: HEADER_CLASSIC },
    { id: "header-centered", name: "居中", free: true, blocks: HEADER_CENTERED },
    { id: "header-dark", name: "深色", free: true, blocks: HEADER_DARK },
    { id: "header-branded", name: "品牌", free: true, blocks: HEADER_BRANDED },
    { id: "header-split", name: "分栏（顶部栏）", free: true, blocks: HEADER_SPLIT },
  ],
  footer: [
    { id: "footer-simple", name: "简约", free: true, blocks: FOOTER_SIMPLE },
    { id: "footer-dark", name: "深色链接", free: true, blocks: FOOTER_DARK },
    { id: "footer-four-col", name: "四栏", free: true, blocks: FOOTER_FOUR_COL },
    { id: "footer-brand", name: "品牌", free: true, blocks: FOOTER_BRAND },
  ],
  "single-post": [
    { id: "single-post-standard", name: "标准", free: true, blocks: [{ id: uid(), type: "html", props: { content: `<article style="max-width:740px;margin:0 auto;padding:48px 24px;"><header style="margin-bottom:32px;"><h1 style="font-family:var(--font-heading,sans-serif);font-size:2.2rem;font-weight:700;margin:0 0 12px;line-height:1.25;color:var(--color-text,#212529);">文章标题</h1><div style="font-size:0.875rem;color:var(--color-muted,#6c757d);">2024年1月1日 · 阅读约 5 分钟</div></header><div style="font-size:1.05rem;line-height:1.8;color:var(--color-text,#212529);">文章内容在此处渲染。</div></article>` } }] },
  ],
  "single-page": [
    { id: "single-page-standard", name: "标准", free: true, blocks: [{ id: uid(), type: "html", props: { content: `<main style="max-width:900px;margin:0 auto;padding:48px 24px;"><h1 style="font-family:var(--font-heading,sans-serif);font-size:2rem;font-weight:700;margin:0 0 24px;color:var(--color-text,#212529);">页面标题</h1><div style="font-size:1.05rem;line-height:1.8;color:var(--color-text,#212529);">页面内容在此处渲染。</div></main>` } }] },
  ],
  archive: [
    { id: "archive-grid", name: "网格", free: true, blocks: [{ id: uid(), type: "html", props: { content: `<div style="max-width:1100px;margin:0 auto;padding:48px 24px;"><h1 style="font-family:var(--font-heading,sans-serif);font-size:1.8rem;font-weight:700;margin:0 0 32px;color:var(--color-text,#212529);">归档</h1><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;">文章在此处渲染。</div></div>` } }] },
  ],
  "404": [
    { id: "404-standard", name: "标准", free: true, blocks: [{ id: uid(), type: "html", props: { content: `<div style="text-align:center;padding:100px 24px;"><div style="font-size:6rem;font-weight:700;color:var(--color-border,#e9ecef);line-height:1;">404</div><h2 style="font-family:var(--font-heading,sans-serif);font-size:1.5rem;font-weight:600;margin:16px 0 8px;color:var(--color-text,#212529);">页面未找到</h2><p style="color:var(--color-muted,#6c757d);margin:0 0 28px;">你要访问的页面不存在或已被移动。</p><a href="/" style="display:inline-block;background:var(--color-primary,#2271b1);color:#fff;padding:12px 28px;border-radius:var(--radius-md,6px);text-decoration:none;font-weight:600;">返回首页</a></div>` } }] },
  ],
  search: [
    { id: "search-standard", name: "标准", free: true, blocks: [{ id: uid(), type: "html", props: { content: `<div style="max-width:740px;margin:0 auto;padding:48px 24px;"><h1 style="font-family:var(--font-heading,sans-serif);font-size:1.8rem;font-weight:700;margin:0 0 24px;color:var(--color-text,#212529);">搜索结果</h1><div>结果在此处渲染。</div></div>` } }] },
  ],
};

// ─── Built-in Theme Packages ──────────────────────────────────────────────────

const THEME_PACKAGES = [
  {
    id: "theme-business",
    name: "商务专业版",
    description: "简洁专业的主题，适合企业与代理商",
    preview: null,
    free: true,
    package: {
      name: "商务专业版",
      version: "1.0.0",
      description: "简洁专业的主题，适合企业与代理商",
      author: "AstroPress",
      tokens: {
        colors: { primary: "#2271b1", secondary: "#0ea5e9", background: "#ffffff", surface: "#f8fafc", text: "#1e293b", textMuted: "#64748b", border: "#e2e8f0" },
        fonts: { heading: "system-ui, -apple-system, sans-serif", body: "system-ui, -apple-system, sans-serif" },
        spacing: { sectionY: "5rem", containerMax: "1200px", borderRadius: "0.5rem" },
      },
      templates: [
        { type: "header", name: "商务页眉", blocks: HEADER_CLASSIC },
        { type: "footer", name: "商务页脚", blocks: FOOTER_FOUR_COL },
      ],
      pages: [
        {
          title: "Home", slug: "home",
          blocks: [
            { id: uid(), type: "hero", props: { heading: "让你的业务在线增长", subtext: "专业的工具与服务，助你的业务更上一层楼。", buttonText: "立即开始", buttonUrl: "/contact", bgColor: "#1e293b", textColor: "#ffffff", align: "center", height: 520 } },
            { id: uid(), type: "features", props: { heading: "为什么选择我们", subtext: "你的业务在线取得成功所需的一切", cols: 3, items: [{ icon: "⚡", title: "快速可靠", text: "极致的性能，99.9% 在线率保障。" }, { icon: "🔒", title: "安全", text: "企业级安全，守护你的数据与客户。" }, { icon: "📈", title: "可扩展", text: "伴随你的业务从初创成长为企业。" }] } },
            { id: uid(), type: "cta", props: { heading: "准备好开始了吗？", text: "加入成千上万已与我们共同成长的企业。", buttonText: "开始免费试用", buttonUrl: "/contact", bgColor: "#2271b1", textColor: "#ffffff" } },
          ],
        },
        {
          title: "About", slug: "about",
          blocks: [
            { id: uid(), type: "hero", props: { heading: "关于我们", subtext: "进一步了解我们是谁、我们做什么。", bgColor: "#1e293b", textColor: "#ffffff", align: "center", height: 300 } },
            { id: uid(), type: "columns", props: { leftContent: "<h2>我们的故事</h2><p>我们自 2020 年成立以来，始终以帮助企业在线蓬勃发展为使命，持续交付卓越的数字解决方案。</p><p>我们的专家团队将深厚的行业积累与前沿技术相结合，打造能带来真实成效的解决方案。</p>", rightContent: "<h2>我们的使命</h2><p>我们相信，无论规模大小、预算多少，每家企业都应能使用世界级的数字工具与专业能力。</p><p>正因如此，我们打造了一个人人可用的平台，让强大的功能触手可及。</p>" } },
          ],
        },
        {
          title: "Contact", slug: "contact",
          blocks: [
            { id: uid(), type: "hero", props: { heading: "联系我们", subtext: "与我们的团队取得联系。", bgColor: "#1e293b", textColor: "#ffffff", align: "center", height: 280 } },
            { id: uid(), type: "text", props: { content: "<p style='text-align:center;font-size:1.1rem;'>📧 hello@yoursite.com &nbsp;|&nbsp; 📞 +1 (555) 000-0000 &nbsp;|&nbsp; 📍 123 Business Ave, New York, NY</p>", align: "center" } },
          ],
        },
      ],
    },
  },
  {
    id: "theme-creative",
    name: "创意代理商",
    description: "大胆而富有表现力的主题，适合创意工作室与代理商",
    preview: null,
    free: true,
    package: {
      name: "创意代理商",
      version: "1.0.0",
      description: "大胆而富有表现力的主题，适合创意工作室与代理商",
      author: "AstroPress",
      tokens: {
        colors: { primary: "#7c3aed", secondary: "#ec4899", background: "#ffffff", surface: "#faf5ff", text: "#1e1b4b", textMuted: "#6b7280", border: "#e9d5ff" },
        fonts: { heading: "system-ui, -apple-system, sans-serif", body: "system-ui, -apple-system, sans-serif" },
        spacing: { sectionY: "6rem", containerMax: "1100px", borderRadius: "1rem" },
      },
      templates: [
        { type: "header", name: "创意页眉", blocks: HEADER_BRANDED },
        { type: "footer", name: "创意页脚", blocks: FOOTER_DARK },
      ],
      pages: [
        {
          title: "Home", slug: "home",
          blocks: [
            { id: uid(), type: "hero", props: { heading: "我们创造大胆的体验", subtext: "一家热爱设计、战略与数字创新的创意代理商。", buttonText: "查看我们的作品", buttonUrl: "/portfolio", bgColor: "#1e1b4b", textColor: "#ffffff", align: "center", height: 560 } },
            { id: uid(), type: "features", props: { heading: "我们的业务", subtext: "为现代品牌提供端到端的创意服务", cols: 3, items: [{ icon: "✦", title: "品牌识别", text: "定义你是谁的标志、规范与视觉系统。" }, { icon: "◆", title: "网页设计", text: "精美、面向转化优化的网站与数字体验。" }, { icon: "★", title: "战略", text: "以数据驱动、带来真实增长的营销策略。" }] } },
          ],
        },
      ],
    },
  },
  {
    id: "theme-minimal",
    name: "极简博客",
    description: "专注于字体排版与阅读体验的简洁极简主题",
    preview: null,
    free: true,
    package: {
      name: "极简博客",
      version: "1.0.0",
      description: "专注于字体排版与阅读体验的简洁极简主题",
      author: "AstroPress",
      tokens: {
        colors: { primary: "#111827", secondary: "#374151", background: "#ffffff", surface: "#f9fafb", text: "#111827", textMuted: "#6b7280", border: "#f3f4f6" },
        fonts: { heading: "Georgia, 'Times New Roman', serif", body: "system-ui, -apple-system, sans-serif" },
        spacing: { sectionY: "4rem", containerMax: "740px", borderRadius: "0.25rem" },
      },
      templates: [
        { type: "header", name: "极简页眉", blocks: HEADER_CENTERED },
        { type: "footer", name: "极简页脚", blocks: FOOTER_SIMPLE },
      ],
      pages: [],
    },
  },
];

export const GET: APIRoute = async ({ locals, url }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const type = url.searchParams.get("type");

  if (type === "themes") {
    return new Response(JSON.stringify({ themes: THEME_PACKAGES.map(t => ({ id: t.id, name: t.name, description: t.description, free: t.free, preview: t.preview })) }), { headers: { "Content-Type": "application/json" } });
  }

  if (type === "theme-package") {
    const id = url.searchParams.get("id");
    const pkg = THEME_PACKAGES.find(t => t.id === id);
    if (!pkg) return new Response(JSON.stringify({ error: "主题包不存在" }), { status: 404, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ package: pkg.package }), { headers: { "Content-Type": "application/json" } });
  }

  // Default: return templates (optionally filtered by type)
  const library = type && TEMPLATE_LIBRARY[type] ? { [type]: TEMPLATE_LIBRARY[type] } : TEMPLATE_LIBRARY;
  return new Response(JSON.stringify({ templates: library }), { headers: { "Content-Type": "application/json" } });
};
