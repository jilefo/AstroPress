import type { Block } from "@astropress/core/types/theme";

export const LIBRARY_CATEGORIES = [
  "All", "Navigation", "Hero", "Features", "Content", "CTA", "Pricing", "Gallery", "Form", "Footer",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export interface LibraryBlock {
  id: string;
  name: string;
  category: Exclude<LibraryCategory, "All">;
  blocks: Block[];
}

export interface LibraryPage {
  id: string;
  name: string;
  industry: string;
  popularity: number; // 0-100
  blocks: Block[];
}

export interface UserTemplate {
  id: string;
  name: string;
  createdAt: string;
  blocks: Block[];
}

function b(id: string, type: Block["type"], props: Record<string, unknown>): Block {
  return { id, type, props };
}

// ─── Block Templates ───────────────────────────────────────────────────────────

export const LIBRARY_BLOCKS: LibraryBlock[] = [
  // ── Navigation ──────────────────────────────────────────────────────────────
  {
    id: "nav-classic",
    name: "经典导航",
    category: "Navigation",
    blocks: [b("t", "nav", { logoText: "品牌", align: "right", style: "inline" })],
  },
  {
    id: "nav-left-logo",
    name: "Logo 在左导航",
    category: "Navigation",
    blocks: [b("t", "nav", { logoText: "品牌", align: "left", style: "inline" })],
  },
  {
    id: "nav-with-title",
    name: "站点标题加导航",
    category: "Navigation",
    blocks: [
      b("t1", "site-title", { showTagline: true, size: "medium", align: "left" }),
      b("t2", "nav", { logoText: "", align: "right", style: "inline" }),
    ],
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  {
    id: "hero-dark-center",
    name: "深色主视觉（居中）",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "打造卓越产品", subtext: "助力业务增长的一体化平台。", buttonText: "立即开始", buttonUrl: "#", bgColor: "#0f172a", textColor: "#f8fafc", align: "center", height: 520 })],
  },
  {
    id: "hero-navy-left",
    name: "藏青主视觉（居左）",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "设计无界", subtext: "从创意到上线，只需数日而非数月。", buttonText: "查看作品", buttonUrl: "#", bgColor: "#1e3a5f", textColor: "#f0f9ff", align: "left", height: 480 })],
  },
  {
    id: "hero-brand-center",
    name: "品牌主视觉",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "助力业务增长", subtext: "强大工具，助你更上一层楼。", buttonText: "免费试用", buttonUrl: "#", bgColor: "#2271b1", textColor: "#ffffff", align: "center", height: 480 })],
  },
  {
    id: "hero-purple-bold",
    name: "紫色醒目主视觉",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "真正好用的 AI", subtext: "不再把时间浪费在重复劳动上。", buttonText: "抢先体验", buttonUrl: "#", bgColor: "#4c1d95", textColor: "#f5f3ff", align: "center", height: 500 })],
  },
  {
    id: "hero-light-minimal",
    name: "浅色极简主视觉",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "简单、强大、高效。", subtext: "你的团队期待已久的工具。", buttonText: "了解更多", buttonUrl: "#", bgColor: "#f8fafc", textColor: "#111827", align: "center", height: 400 })],
  },
  {
    id: "hero-dark-tall",
    name: "深色加高主视觉",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "We Build Digital Experiences", subtext: "获奖无数的工作室，打造脱颖而出的品牌。", buttonText: "查看作品集", buttonUrl: "#", bgColor: "#1a1a2e", textColor: "#ffffff", align: "left", height: 560 })],
  },
  {
    id: "hero-gradient",
    name: "翠绿主视觉",
    category: "Hero",
    blocks: [b("t", "hero", { heading: "引领行业未来", subtext: "加入数千家已领先一步的企业。", buttonText: "免费加入", buttonUrl: "#", bgColor: "#064e3b", textColor: "#ecfdf5", align: "center", height: 480 })],
  },

  // ── Features ────────────────────────────────────────────────────────────────
  {
    id: "features-3col-icons",
    name: "三栏特性",
    category: "Features",
    blocks: [b("t", "features", {
      heading: "为什么选择我们",
      subtext: "成功所需的一切样样齐备，无关功能一概没有",
      cols: 3,
      items: [
        { icon: "⚡", title: "闪电般快速", text: "从底层开始为极致性能优化。" },
        { icon: "🔒", title: "默认即安全", text: "内置企业级安全，零配置。" },
        { icon: "📊", title: "深度分析", text: "实时洞察，助你做出更明智的决策。" },
      ],
    })],
  },
  {
    id: "features-2col",
    name: "双栏特性",
    category: "Features",
    blocks: [b("t", "features", {
      heading: "我们的核心优势",
      subtext: "",
      cols: 2,
      items: [
        { icon: "🎯", title: "精准", text: "无论规模大小，始终精准可靠。" },
        { icon: "🤝", title: "协作", text: "随时随地，无缝协作。" },
        { icon: "🌍", title: "全球覆盖", text: "服务覆盖 150 多个国家。" },
        { icon: "💡", title: "创新", text: "持续迭代，满足你的需求。" },
      ],
    })],
  },
  {
    id: "features-4col",
    name: "四栏网格",
    category: "Features",
    blocks: [b("t", "features", {
      heading: "你需要的全部工具",
      subtext: "全部集成在一个强大平台中",
      cols: 4,
      items: [
        { icon: "✦", title: "数据分析", text: "追踪最重要的指标。" },
        { icon: "★", title: "自动化", text: "每天节省数小时。" },
        { icon: "◆", title: "集成能力", text: "与你现有的工具无缝对接。" },
        { icon: "●", title: "Support", text: "专家全天候支持。" },
      ],
    })],
  },
  {
    id: "features-services",
    name: "服务网格",
    category: "Features",
    blocks: [b("t", "features", {
      heading: "我们的服务",
      subtext: "为你的业务提供全方位解决方案",
      cols: 3,
      items: [
        { icon: "🎨", title: "品牌形象", text: "经久耐用的标志、规范与视觉体系。" },
        { icon: "💻", title: "网站设计", text: "美观高速、能转化访客的网站。" },
        { icon: "📱", title: "数字营销", text: "用 SEO、广告与内容驱动真实增长。" },
      ],
    })],
  },

  // ── Content ──────────────────────────────────────────────────────────────────
  {
    id: "content-rich-text",
    name: "富文本",
    category: "Content",
    blocks: [b("t", "text", { content: "<h2>我们的故事</h2><p>我们始于一个简单的想法：让每个人都能用上好工具。如今，成千上万的团队每天依靠我们完成出色的工作。</p><p>我们的使命是为创作者、创业者与企业赋能。</p>", align: "left" })],
  },
  {
    id: "content-two-column",
    name: "双栏布局",
    category: "Content",
    blocks: [b("t", "columns", {
      leftContent: "<h3>我们的方法</h3><p>我们相信好产品源于对用户的深刻理解。每个功能都从调研出发，而非凭空假设。</p>",
      rightContent: "<h3>我们的成绩</h3><p>100,000+ 满意用户、99.9% 可用性、屡获好评的支持服务。面向未来，我们才刚刚起步。</p>",
      gap: "3rem",
      cols: 2,
    })],
  },
  {
    id: "content-quote",
    name: "客户评价引言",
    category: "Content",
    blocks: [b("t", "text", { content: "<blockquote style='border-left:4px solid #2271b1;padding-left:24px;font-size:1.2rem;font-style:italic;color:#374151;margin:0'>&ldquo;这款产品彻底改变了我们团队的工作方式，已经回不去了。&rdquo;<br><strong style='font-style:normal;font-size:0.9rem;color:#6b7280;display:block;margin-top:12px'>— 莎拉·K.，某科技公司运营总监</strong></blockquote>", align: "left" })],
  },
  {
    id: "content-wide-image",
    name: "宽幅图片",
    category: "Content",
    blocks: [b("t", "image", { src: "", alt: "特色图片", caption: "在这里添加图片说明", align: "center", width: "wide" })],
  },

  // ── CTA ───────────────────────────────────────────────────────────────────────
  {
    id: "cta-bold-blue",
    name: "醒目蓝色行动号召",
    category: "CTA",
    blocks: [b("t", "cta", { heading: "准备好让业务转型了吗？", text: "加入与我们共同成长的 10,000+ 企业。", buttonText: "免费试用", buttonUrl: "#", bgColor: "#2271b1", textColor: "#ffffff" })],
  },
  {
    id: "cta-dark",
    name: "深色行动号召",
    category: "CTA",
    blocks: [b("t", "cta", { heading: "一起打造出色产品", text: "无需合约、免开通费，随时可取消。", buttonText: "立即开始", buttonUrl: "#", bgColor: "#0f172a", textColor: "#f8fafc" })],
  },
  {
    id: "cta-purple",
    name: "紫色行动号召",
    category: "CTA",
    blocks: [b("t", "cta", { heading: "解锁高级功能", text: "升级套餐，让项目更进一步。", buttonText: "立即升级", buttonUrl: "#", bgColor: "#7c3aed", textColor: "#ffffff" })],
  },
  {
    id: "cta-light",
    name: "浅色行动号召",
    category: "CTA",
    blocks: [b("t", "cta", { heading: "开始免费试用", text: "无需绑定信用卡。", buttonText: "立即开始 →", buttonUrl: "#", bgColor: "#f1f5f9", textColor: "#1e293b" })],
  },
  {
    id: "cta-green",
    name: "绿色行动号召",
    category: "CTA",
    blocks: [b("t", "cta", { heading: "加入数千支满意的团队", text: "开箱即用，所需一切尽在其中。", buttonText: "免费体验", buttonUrl: "#", bgColor: "#064e3b", textColor: "#ecfdf5" })],
  },

  // ── Pricing ───────────────────────────────────────────────────────────────────
  {
    id: "pricing-3tier",
    name: "三档定价",
    category: "Pricing",
    blocks: [b("t", "features", {
      heading: "简单透明的定价",
      subtext: "选择适合团队的套餐",
      cols: 3,
      items: [
        { icon: "🌱", title: "入门版 — 免费", text: "最多 3 个项目 · 5 GB 存储空间 · 邮件支持 · 核心功能" },
        { icon: "🚀", title: "专业版 — $29/月", text: "无限项目 · 50 GB 存储空间 · 优先支持 · 高级分析" },
        { icon: "🏢", title: "企业版 — 定制", text: "全部不限量 · 专属客户经理 · SLA 保障 · 定制集成" },
      ],
    })],
  },
  {
    id: "pricing-2tier",
    name: "月付对比年付",
    category: "Pricing",
    blocks: [b("t", "features", {
      heading: "选择套餐",
      subtext: "按年付费可省 50%",
      cols: 2,
      items: [
        { icon: "◻", title: "月付 — $19/月", text: "全部核心功能 · 不限用户数 · 邮件与在线支持" },
        { icon: "◼", title: "年付 — $9/月", text: "较月付省 50% · 全部核心功能 · 优先支持 · 附赠上手指导" },
      ],
    })],
  },

  // ── Gallery ───────────────────────────────────────────────────────────────────
  {
    id: "gallery-2col",
    name: "双栏图库",
    category: "Gallery",
    blocks: [b("t", "columns", {
      leftContent: '<div style="background:#e2e8f0;border-radius:8px;height:240px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">图片 1</div>',
      rightContent: '<div style="background:#e2e8f0;border-radius:8px;height:240px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">图片 2</div>',
      gap: "1.5rem",
      cols: 2,
    })],
  },
  {
    id: "gallery-image-text",
    name: "图文搭配",
    category: "Gallery",
    blocks: [b("t", "columns", {
      leftContent: '<div style="background:#e2e8f0;border-radius:8px;height:280px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">图片</div>',
      rightContent: "<h3>引人注目的标题</h3><p>用此版式将图片与说明文字搭配，适合展示产品、案例或带图的功能介绍。</p>",
      gap: "2.5rem",
      cols: 2,
    })],
  },

  // ── Form ──────────────────────────────────────────────────────────────────────
  {
    id: "form-contact-section",
    name: "联系区块",
    category: "Form",
    blocks: [
      b("t1", "text", { content: "<h2 style='text-align:center'>联系我们</h2><p style='text-align:center;color:#6c757d;max-width:480px;margin:0 auto'>期待你的来信，填写表单后我们将在 24 小时内回复。</p>", align: "center" }),
      b("t2", "form", { formId: "", formTitle: "请选择表单" }),
    ],
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  {
    id: "footer-minimal",
    name: "极简页脚",
    category: "Footer",
    blocks: [
      b("t1", "divider", { style: "solid", color: "#e2e8f0", thickness: 1 }),
      b("t2", "columns", {
        leftContent: "<p style='margin:0;font-weight:700;font-size:14px'>品牌名称</p><p style='margin:4px 0 0;color:#6c757d;font-size:12px'>© 2025 保留所有权利。</p>",
        rightContent: "<p style='margin:0;text-align:right'><a href='#' style='color:#6c757d;font-size:13px;text-decoration:none;margin-left:20px'>隐私政策</a><a href='#' style='color:#6c757d;font-size:13px;text-decoration:none;margin-left:20px'>服务条款</a><a href='#' style='color:#6c757d;font-size:13px;text-decoration:none;margin-left:20px'>联系我们</a></p>",
        gap: "2rem",
        cols: 2,
      }),
    ],
  },
  {
    id: "footer-rich",
    name: "三栏页脚",
    category: "Footer",
    blocks: [
      b("t1", "divider", { style: "solid", color: "#e2e8f0", thickness: 1 }),
      b("t2", "features", {
        heading: "",
        subtext: "",
        cols: 3,
        items: [
          { icon: "", title: "公司", text: "关于我们\n招聘\n博客\n媒体报道" },
          { icon: "", title: "产品", text: "功能\n定价\n文档\n更新日志" },
          { icon: "", title: "支持", text: "帮助中心\n联系我们\n服务状态\n社区" },
        ],
      }),
      b("t3", "divider", { style: "solid", color: "#e2e8f0", thickness: 1 }),
      b("t4", "columns", {
        leftContent: "<p style='margin:0;color:#6c757d;font-size:12px'>© 2025 品牌公司 保留所有权利。</p>",
        rightContent: "<p style='margin:0;text-align:right'><a href='#' style='color:#6c757d;font-size:12px;text-decoration:none;margin-left:16px'>隐私政策</a><a href='#' style='color:#6c757d;font-size:12px;text-decoration:none;margin-left:16px'>服务条款</a></p>",
        gap: "2rem",
        cols: 2,
      }),
    ],
  },
];

// ─── Page Templates ────────────────────────────────────────────────────────────

export const LIBRARY_PAGES: LibraryPage[] = [
  {
    id: "page-saas",
    name: "SaaS 落地页",
    industry: "创业",
    popularity: 98,
    blocks: [
      b("p1", "nav", { logoText: "云创科技", align: "right" }),
      b("p2", "hero", { heading: "更智能的团队管理方式", subtext: "自动化工作流、追踪项目进度并实时协作。", buttonText: "免费试用", buttonUrl: "#", bgColor: "#0f172a", textColor: "#f8fafc", align: "center", height: 520 }),
      b("p3", "features", { heading: "团队所需，一应俱全", subtext: "为速度、安全与规模化而生", cols: 3, items: [{ icon: "⚡", title: "快速上手", text: "几分钟即可投入使用，无需 IT 支持。" }, { icon: "🔒", title: "企业级安全", text: "符合 SOC 2，全程端到端加密。" }, { icon: "📈", title: "实时分析", text: "通过实时看板掌握成效。" }] }),
      b("p4", "cta", { heading: "准备好让效率提升 10 倍了吗？", text: "加入已在使用我们的 5,000+ 团队。", buttonText: "免费开始", buttonUrl: "#", bgColor: "#2271b1", textColor: "#ffffff" }),
    ],
  },
  {
    id: "page-agency",
    name: "代理商落地页",
    industry: "商业",
    popularity: 91,
    blocks: [
      b("p1", "nav", { logoText: "创意工作室", align: "right" }),
      b("p2", "hero", { heading: "打造数字化体验", subtext: "屡获殊荣的设计工作室，打造脱颖而出的品牌。", buttonText: "查看作品", buttonUrl: "#", bgColor: "#1a1a2e", textColor: "#ffffff", align: "left", height: 500 }),
      b("p3", "features", { heading: "我们的服务", subtext: "", cols: 3, items: [{ icon: "🎨", title: "品牌形象", text: "Logos, guidelines, and visual systems." }, { icon: "💻", title: "网站设计", text: "Beautiful, fast websites that convert." }, { icon: "📱", title: "数字营销", text: "SEO, ads, and content that drives growth." }] }),
      b("p4", "text", { content: "<h2>我们的流程</h2><p>每个项目都从需求沟通开始：我们了解你的目标、受众与竞争格局，然后量身制定策略并精准执行。</p>", align: "left" }),
      b("p5", "cta", { heading: "一起合作吧", text: "准备好提升品牌了吗？", buttonText: "免费报价", buttonUrl: "#", bgColor: "#7c3aed", textColor: "#ffffff" }),
    ],
  },
  {
    id: "page-portfolio",
    name: "作品集",
    industry: "作品集",
    popularity: 87,
    blocks: [
      b("p1", "nav", { logoText: "张三", align: "right" }),
      b("p2", "hero", { heading: "打造能带来转化的网站", subtext: "拥有 8 年经验的自由开发者与设计师。", buttonText: "View My Work", buttonUrl: "#", bgColor: "#f8fafc", textColor: "#1d2327", align: "center", height: 420 }),
      b("p3", "features", { heading: "我的专长", subtext: "", cols: 3, items: [{ icon: "⚛", title: "React 与 Next.js", text: "基于 React 生态的现代前端开发。" }, { icon: "🎨", title: "UI/UX 设计", text: "从线框图到像素级还原。" }, { icon: "☁", title: "云与 DevOps", text: "AWS、Vercel、CI/CD 流水线等。" }] }),
      b("p4", "cta", { heading: "一起创造吧", text: "可接自由职业项目。", buttonText: "联系我们", buttonUrl: "#", bgColor: "#0f172a", textColor: "#f8fafc" }),
    ],
  },
  {
    id: "page-startup",
    name: "创业 / AI",
    industry: "创业",
    popularity: 95,
    blocks: [
      b("p1", "nav", { logoText: "创业AI", align: "right" }),
      b("p2", "hero", { heading: "真正好用的 AI", subtext: "不再把时间浪费在重复劳动上。 让 AI 挑起重担。", buttonText: "Start for Free", buttonUrl: "#", bgColor: "#4c1d95", textColor: "#f5f3ff", align: "center", height: 540 }),
      b("p3", "features", { heading: "10,000+ 团队的信赖之选", subtext: "我们的与众不同之处", cols: 3, items: [{ icon: "🤖", title: "智能自动化", text: "AI 会逐步学习你的工作流。" }, { icon: "⚡", title: "即刻见效", text: "7 天内看到成效，否则退款。" }, { icon: "🔗", title: "100+ 集成", text: "开箱即可对接你现有的工具。" }] }),
      b("p4", "cta", { heading: "开始 14 天免费试用", text: "无需绑定信用卡，也没有任何约束。", buttonText: "免费注册", buttonUrl: "#", bgColor: "#7c3aed", textColor: "#ffffff" }),
    ],
  },
  {
    id: "page-restaurant",
    name: "餐饮行业",
    industry: "餐饮",
    popularity: 82,
    blocks: [
      b("p1", "nav", { logoText: "橄榄树餐厅", align: "right" }),
      b("p2", "hero", { heading: "每一口都是地道意大利风味", subtext: "新鲜食材、传统配方，难忘的用餐时光。", buttonText: "预订餐位", buttonUrl: "#", bgColor: "#1c0a00", textColor: "#fff8f0", align: "center", height: 560 }),
      b("p3", "features", { heading: "顾客喜爱我们的理由", subtext: "", cols: 3, items: [{ icon: "🍝", title: "正宗配方", text: "历经三代厨师传承。" }, { icon: "🌿", title: "应季食材", text: "每天清晨采购本地新鲜食材。" }, { icon: "🍷", title: "精选酒单", text: "120 多款来自意大利优质产区的葡萄酒。" }] }),
      b("p4", "text", { content: "<h2 style='text-align:center'>营业时间</h2><p style='text-align:center'>周一至周四：17:00–22:00<br>周五至周六：17:00–23:00<br>周日：16:00–21:00</p>", align: "center" }),
      b("p5", "cta", { heading: "今晚就预订餐位", text: "欢迎直接到店，建议提前预订。", buttonText: "立即预订", buttonUrl: "#", bgColor: "#7c2d12", textColor: "#fff8f0" }),
    ],
  },
  {
    id: "page-about",
    name: "关于我们",
    industry: "商业",
    popularity: 79,
    blocks: [
      b("p1", "hero", { heading: "我们的故事", subtext: "从一个小想法到全球化产品的历程。", buttonText: "", buttonUrl: "#", bgColor: "#f1f5f9", textColor: "#1e293b", align: "center", height: 320 }),
      b("p2", "text", { content: "<h2>一切的起点</h2><p>2018 年，我们的创始人受困于当时的工具：要么过于复杂，要么功能有限。于是我们打造了更好的选择。</p><p>如今我们服务着 80 个国家的 50,000+ 用户，而这只是开始。</p>", align: "left" }),
      b("p3", "features", { heading: "我们的价值观", subtext: "", cols: 3, items: [{ icon: "❤", title: "用户第一", text: "每一个决策都从用户出发。" }, { icon: "🌱", title: "可持续发展", text: "着眼长期发展，而非只看增长。" }, { icon: "🤝", title: "公开透明", text: "公开分享我们在做什么、为什么做。" }] }),
      b("p4", "cta", { heading: "加入我们的旅程", text: "工程、设计、市场等岗位正在招聘。", buttonText: "查看空缺职位", buttonUrl: "#", bgColor: "#2271b1", textColor: "#ffffff" }),
    ],
  },
  {
    id: "page-contact",
    name: "联系页面",
    industry: "商业",
    popularity: 72,
    blocks: [
      b("p1", "hero", { heading: "联系我们", subtext: "我们通常在 24 小时内回复。", buttonText: "", buttonUrl: "#", bgColor: "#f8fafc", textColor: "#1d2327", align: "center", height: 300 }),
      b("p2", "columns", { leftContent: "<h3>我们的办公室</h3><p>示例市示例区主街 123 号</p><h3 style='margin-top:24px'>邮箱</h3><p>hello@company.com</p><h3 style='margin-top:24px'>电话</h3><p>+1 (555) 000-0000</p>", rightContent: "<h3>给我们留言</h3><p style='color:#6c757d'>期待你的来信。</p>", gap: "3rem", cols: 2 }),
    ],
  },
  {
    id: "page-product-launch",
    name: "产品发布",
    industry: "创业",
    popularity: 88,
    blocks: [
      b("p1", "hero", { heading: "全新产品正式登场", subtext: "你期待已久的工具，为你的工作方式而设计。", buttonText: "加入候补名单", buttonUrl: "#", bgColor: "#0f172a", textColor: "#f8fafc", align: "center", height: 480 }),
      b("p2", "features", { heading: "为现代团队打造", subtext: "更快上线、更易扩展、更聪明地增长。", cols: 3, items: [{ icon: "🚀", title: "更快交付", text: "以创纪录的速度从原型走向生产。" }, { icon: "📊", title: "数据驱动", text: "每个功能都有真实用户数据支撑。" }, { icon: "🛡", title: "稳如磐石", text: "99.99% 可用性，全天候监控。" }] }),
      b("p3", "text", { content: "<blockquote style='border-left:4px solid #2271b1;padding-left:20px;font-size:1.2rem;font-style:italic;color:#475569'>&ldquo;这款产品每周为团队节省 15 小时，彻底改变了工作方式。&rdquo;<br><strong style='font-style:normal;font-size:0.9rem'>— 莎拉·K.，运营总监</strong></blockquote>", align: "left" }),
      b("p4", "cta", { heading: "抢占先机", text: "抢先体验即将开放，立即锁定名额。", buttonText: "加入候补名单 →", buttonUrl: "#", bgColor: "#0f172a", textColor: "#f8fafc" }),
    ],
  },
  {
    id: "page-blog-home",
    name: "博客 / 文章",
    industry: "内容",
    popularity: 65,
    blocks: [
      b("p1", "hero", { heading: "Web 开发的未来", subtext: "2025 年 5 月 18 日 · 阅读约 8 分钟", buttonText: "", buttonUrl: "#", bgColor: "#1d2327", textColor: "#f8fafc", align: "center", height: 320 }),
      b("p2", "text", { content: "<p style='font-size:1.1rem;line-height:1.9'>Web 开发领域的变化前所未有地快。AI 工具、新框架与不断提高的用户期望，都要求开发者走在前沿。</p><h2>AI 辅助开发的兴起</h2><p>从 GitHub Copilot 到 Claude Code，AI 助手正在改变开发者写代码的方式：过去需要数小时的工作，现在几分钟即可完成。</p>", align: "left" }),
      b("p3", "cta", { heading: "喜欢这篇文章吗？", text: "订阅以每周获取更多洞察。", buttonText: "订阅 →", buttonUrl: "#", bgColor: "#f1f5f9", textColor: "#1e293b" }),
    ],
  },
  {
    id: "page-law-firm",
    name: "律所网站",
    industry: "专业服务",
    popularity: 61,
    blocks: [
      b("p1", "nav", { logoText: "史密斯律师事务所", align: "right" }),
      b("p2", "hero", { heading: "自 1985 年起值得信赖的法律顾问", subtext: "数十年经验沉淀，守护你的合法权益。", buttonText: "预约咨询", buttonUrl: "#", bgColor: "#1e3a5f", textColor: "#f0f9ff", align: "center", height: 480 }),
      b("p3", "features", { heading: "业务领域", subtext: "", cols: 3, items: [{ icon: "⚖", title: "公司法", text: "公司设立、合同与合规事务。" }, { icon: "🏠", title: "房地产", text: "住宅与商业地产法律事务。" }, { icon: "👨‍👩‍👦", title: "婚姻家事", text: "离婚、抚养权与遗产规划。" }] }),
      b("p4", "cta", { heading: "准备好守护重要的一切了吗？", text: "新客户可享首次免费咨询。", buttonText: "预约免费咨询", buttonUrl: "#", bgColor: "#1e3a5f", textColor: "#f0f9ff" }),
    ],
  },
  {
    id: "page-photography",
    name: "摄影师",
    industry: "作品集",
    popularity: 76,
    blocks: [
      b("p1", "nav", { logoText: "张三摄影", align: "right" }),
      b("p2", "hero", { heading: "光与影的故事", subtext: "记录珍贵瞬间的纪实摄影师。", buttonText: "查看作品集", buttonUrl: "#", bgColor: "#0f0f0f", textColor: "#fafafa", align: "center", height: 540 }),
      b("p3", "columns", { leftContent: '<div style="background:#e2e8f0;border-radius:4px;height:280px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">人像作品</div>', rightContent: '<div style="background:#e2e8f0;border-radius:4px;height:280px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">风光作品</div>', gap: "1rem", cols: 2 }),
      b("p4", "cta", { heading: "一起创作吧", text: "可接编辑、商业与私人约拍。", buttonText: "联系我们", buttonUrl: "#", bgColor: "#0f0f0f", textColor: "#fafafa" }),
    ],
  },
  {
    id: "page-fitness",
    name: "在线培训",
    industry: "健康与健身",
    popularity: 84,
    blocks: [
      b("p1", "hero", { heading: "成就更好的自己", subtext: "专家设计的各级别训练计划，效果真实，不留借口。", buttonText: "开启训练之旅", buttonUrl: "#", bgColor: "#14532d", textColor: "#f0fdf4", align: "center", height: 520 }),
      b("p2", "features", { heading: "你将获得", subtext: "身心蜕变所需的一切", cols: 3, items: [{ icon: "💪", title: "定制计划", text: "根据目标、时间与体能水平定制计划。" }, { icon: "🥗", title: "营养指南", text: "认证营养师制定的饮食计划与食谱。" }, { icon: "📱", title: "App 使用权限", text: "在任意设备上记录训练、进度与习惯。" }] }),
      b("p3", "cta", { heading: "开始 7 天免费试用", text: "无需器械，随时可取消。", buttonText: "免费开始", buttonUrl: "#", bgColor: "#14532d", textColor: "#f0fdf4" }),
    ],
  },
];
