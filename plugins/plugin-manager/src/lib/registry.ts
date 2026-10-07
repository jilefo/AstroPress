/**
 * 已知插件注册表（套件化版）。
 * 原 40+ 独立插件已聚合为 10 大套件：套件卡片承担启停/清除数据，
 * 成员插件保持独立实现（零源文件改动），其管理页仍可单独访问。
 * 套件的 routePrefixes/sidebarHrefs/assetPrefixes/frontendHideSelectors/
 * optionKeys 为全部成员的并集；成员级字段（routePrefixes 等）用于
 * 「只禁用套件中某一个成员」时的精确守卫，未声明则该成员禁用后
 * 仅其插件内部 isPluginDisabled(slug) 生效，不产生路由级效果。
 */
export interface SuiteMember {
  slug: string;
  label: string;
  /** 成员自己的管理页（套件卡片上的芯片链接）；禁用时也用于侧边栏菜单剥离 */
  settingsUrl?: string;
  /** 成员独立禁用时 pre 中间件 404 的路由前缀（套件禁用时无需使用，走套件并集） */
  routePrefixes?: string[];
  /** 成员独立禁用时从后台 HTML 剥离的脚本/样式地址前缀 */
  assetPrefixes?: string[];
  /** 成员独立禁用时前台注入 CSS 隐藏的选择器 */
  frontendHideSelectors?: string[];
  /**
   * Cloudflare Workers 平台不支持的原因（truthy 即不兼容）。
   * CF 下该成员被平台层强制屏蔽：路由 404、菜单移除、管理页显示不可开启，
   * 与用户手动禁用等效；Node.js 部署（VPS/Docker/本地）不受影响。
   */
  cfUnsupported?: string;
}

export interface PluginMeta {
  slug: string;
  /** 展示名 */
  label: string;
  /** 管理页地址（卡片上的"设置"入口） */
  settingsUrl?: string;
  /** 禁用时 pre 中间件 404 的路由前缀 */
  routePrefixes: string[];
  /** 禁用时从后台侧边栏移除的链接 href */
  sidebarHrefs: string[];
  /** 禁用时从后台页面剥离的脚本/样式地址前缀（通常为 routePrefixes 的子集） */
  assetPrefixes: string[];
  /** 禁用时前台注入 CSS 隐藏的选择器 */
  frontendHideSelectors: string[];
  /** "清除数据"时删除的 wp_options 键（精确匹配） */
  optionKeys: string[];
  /** 系统插件不可禁用 */
  system?: boolean;
  /** 功能分类 */
  kind: "system" | "suite" | "editor" | "frontend" | "admin" | "integration";
  /** 套件成员（仅 kind === "suite"） */
  members?: SuiteMember[];
}

const sec = "/admin-ext/security-headers";
const rl = "/admin-ext/rate-limit";
const mm = "/admin-ext/maintenance-mode";
const tfa = "/admin-ext/two-factor-auth";
const ur = "/admin-ext/user-roles";
const al = "/admin-ext/activity-log";

const pc = "/admin-ext/page-cache";
const il = "/admin-ext/image-lazy";
const ho = "/admin-ext/html-opt";
const ac = "/admin-ext/asset-cache";
const sm = "/admin-ext/sitemap";
const sh = "/admin-ext/static-html";
const em = "/admin-ext/404-monitor";
const cw = "/admin-ext/cache-warmer";

const mf = "/admin-ext/media-folders";

const ml = "/admin-ext/multilingual";
const i18n = "/admin-ext/i18n";
const aic = "/admin-ext/ai-chat";

const rp = "/admin-ext/related-posts";
const st = "/admin-ext/seo-tools";
const se = "/admin-ext/search";
const rd = "/admin-ext/redirects";
const pl = "/admin-ext/permalink";
const rv = "/admin-ext/revisions";

const ads = "/admin-ext/ads";
const cmt = "/admin-ext/comments";
const shr = "/admin-ext/share";
const cs = "/admin-ext/customer-service";
const ft = "/admin-ext/footer";
const don = "/admin-ext/donation";
const gtk = "/admin-ext/gitalk";

const bk = "/admin-ext/backup";
const cio = "/admin-ext/config-io";
const gs = "/admin-ext/gist-sync";
const git = "/admin-ext/git-sync";

const wh = "/admin-ext/webhooks";
const dbc = "/admin-ext/db-console";
const ld = "/admin-ext/links";
const fm = "/admin-ext/files";
const wd = "/admin-ext/webdav";
const dbo = "/admin-ext/db-optimize";

const nc = "/admin-ext/notification-center";

export const REGISTRY: PluginMeta[] = [
  {
    slug: "seo",
    label: "SEO（核心）",
    kind: "system",
    system: true,
    routePrefixes: [],
    sidebarHrefs: [],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: [],
  },
  {
    slug: "plugin-manager",
    label: "插件管理器",
    kind: "system",
    system: true,
    settingsUrl: "/admin-ext/plugin-manager",
    routePrefixes: [],
    sidebarHrefs: ["/admin-ext/plugin-manager"],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: ["astropress_plugin_states"],
  },

  {
    slug: "security-suite",
    label: "安全与防护",
    kind: "suite",
    routePrefixes: [rl, "/admin-ext/api/rate-limit/", mm, "/admin-ext/api/maintenance/", tfa, "/admin-ext/api/2fa/", ur, al, "/admin-ext/api/activity-log/"],
    sidebarHrefs: [rl, mm, tfa, ur, al],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: [
      "astropress_rate_limit_settings",
      "astropress_maintenance_settings",
    ],
    members: [
      { slug: "rate-limit", label: "全局限流", settingsUrl: rl, routePrefixes: [rl, "/admin-ext/api/rate-limit/"] },
      { slug: "maintenance-mode", label: "维护模式", settingsUrl: mm, routePrefixes: [mm, "/admin-ext/api/maintenance/"] },
      { slug: "two-factor-auth", label: "两步验证", settingsUrl: tfa, routePrefixes: [tfa, "/admin-ext/api/2fa/"] },
      { slug: "user-roles", label: "用户角色", settingsUrl: ur, routePrefixes: [ur] },
      { slug: "activity-log", label: "操作审计", settingsUrl: al, routePrefixes: [al, "/admin-ext/api/activity-log/"] },
    ],
  },
  {
    slug: "perf-suite",
    label: "缓存与性能优化",
    kind: "suite",
    routePrefixes: [pc, "/admin-ext/api/page-cache/", il, "/admin-ext/api/image-lazy/", ho, "/admin-ext/api/html-opt/", ac, "/admin-ext/api/asset-cache/", sm, "/sitemap.xml", sh, "/admin-ext/api/static-html/", em, "/admin-ext/api/404/", cw, "/admin-ext/api/cache-warmer/"],
    sidebarHrefs: [pc, il, ho, ac, sm, sh, em, cw],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: [
      "astropress_page_cache_settings",
      "astropress_image_lazy_settings",
      "astropress_html_opt_settings",
      "astropress_asset_cache_settings",
      "astropress_sitemap_settings",
      "astropress_static_html_settings",
      "astropress_static_html_state",
      "astropress_static_html_runs",
      "astropress_404_settings",
      "astropress_cache_warmer_settings",
      "astropress_cache_warmer_runs",
    ],
    members: [
      { slug: "page-cache", label: "页面缓存", settingsUrl: pc, routePrefixes: [pc, "/admin-ext/api/page-cache/"] },
      { slug: "image-lazy", label: "图片懒加载", settingsUrl: il, routePrefixes: [il, "/admin-ext/api/image-lazy/"] },
      { slug: "html-opt", label: "HTML 优化", settingsUrl: ho, routePrefixes: [ho, "/admin-ext/api/html-opt/"] },
      { slug: "asset-cache", label: "静态资源缓存", settingsUrl: ac, routePrefixes: [ac, "/admin-ext/api/asset-cache/"] },
      { slug: "sitemap", label: "网站地图", settingsUrl: sm, routePrefixes: [sm, "/sitemap.xml"] },
      { slug: "static-html", label: "静态HTML生成", settingsUrl: sh, routePrefixes: [sh, "/admin-ext/api/static-html/"], cfUnsupported: "需要本地文件系统写入生成文件（Cloudflare 上直接使用 Workers 动态渲染）" },
      { slug: "error-monitor", label: "404 监控", settingsUrl: em, routePrefixes: [em, "/admin-ext/api/404/"] },
      { slug: "cache-warmer", label: "缓存预热", settingsUrl: cw, routePrefixes: [cw, "/admin-ext/api/cache-warmer/"] },
    ],
  },
  {
    slug: "editor-suite",
    label: "编辑器增强",
    kind: "suite",
    routePrefixes: ["/api/ap-media/", "/api/ap-etools/", "/api/ap-media-av/", "/api/ap-wp-editor/"],
    sidebarHrefs: [],
    assetPrefixes: ["/api/ap-media/", "/api/ap-etools/", "/api/ap-media-av/", "/api/ap-wp-editor/"],
    frontendHideSelectors: [],
    optionKeys: [],
    members: [
      { slug: "editor-upload", label: "编辑器上传增强", routePrefixes: ["/api/ap-media/"], assetPrefixes: ["/api/ap-media/"] },
      { slug: "editor-tools", label: "排版与中英互译", routePrefixes: ["/api/ap-etools/"], assetPrefixes: ["/api/ap-etools/"] },
      // 外链图片镜像无独立路由，能力寄生于 editor-tools，禁用仅关闭其内部钩子
      { slug: "image-mirror", label: "外链图片镜像" },
      { slug: "media-av", label: "音视频上传插入", routePrefixes: ["/api/ap-media-av/"], assetPrefixes: ["/api/ap-media-av/"] },
      { slug: "wp-editor", label: "WordPress 风格编辑器", routePrefixes: ["/api/ap-wp-editor/"], assetPrefixes: ["/api/ap-wp-editor/"] },
    ],
  },
  {
    slug: "media-suite",
    label: "媒体与传输安全",
    kind: "suite",
    routePrefixes: [mf, "/admin-ext/api/media-folders/", sec, "/admin-ext/api/security-headers/"],
    sidebarHrefs: [mf, sec],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: ["astropress_security_headers_settings"],
    members: [
      { slug: "media-folders", label: "媒体文件夹", settingsUrl: mf, routePrefixes: [mf, "/admin-ext/api/media-folders/"] },
      { slug: "security-headers", label: "安全响应头", settingsUrl: sec, routePrefixes: [sec, "/admin-ext/api/security-headers/"] },
    ],
  },
  {
    slug: "ai-suite",
    label: "AI 与多语言",
    kind: "suite",
    routePrefixes: [ml, "/admin-ext/api/ml/", "/ml-asset/", "/ml/", i18n, "/admin-ext/api/i18n/", "/api/ap-i18n/", aic, "/admin-ext/api/ai-chat/", "/api/ap-autofill/"],
    sidebarHrefs: [ml, i18n, aic],
    assetPrefixes: ["/ml-asset/", "/api/ap-i18n/", "/api/ap-autofill/"],
    frontendHideSelectors: ["[data-ml-switcher]", "#ml-switcher"],
    optionKeys: ["astropress_ml_settings", "astropress_i18n_settings"],
    members: [
      { slug: "multilingual", label: "多语言", settingsUrl: ml, routePrefixes: [ml, "/admin-ext/api/ml/", "/ml-asset/", "/ml/"], assetPrefixes: ["/ml-asset/"], frontendHideSelectors: ["[data-ml-switcher]", "#ml-switcher"] },
      { slug: "admin-i18n", label: "界面翻译", settingsUrl: i18n, routePrefixes: [i18n, "/admin-ext/api/i18n/", "/api/ap-i18n/"], assetPrefixes: ["/api/ap-i18n/"] },
      { slug: "ai-chat", label: "AI 助手", settingsUrl: aic, routePrefixes: [aic, "/admin-ext/api/ai-chat/"], cfUnsupported: "网页版助手需要 Playwright 浏览器子进程（API 类 AI 功能不受影响）" },
      { slug: "ai-autofill", label: "AI 自动填写", routePrefixes: ["/api/ap-autofill/"], assetPrefixes: ["/api/ap-autofill/"] },
    ],
  },
  {
    slug: "seo-suite",
    label: "SEO 与内容",
    kind: "suite",
    routePrefixes: [rp, "/admin-ext/api/related-posts/", "/ap-related/", st, "/admin-ext/api/seo-tools/", "/rss.xml", "/robots.txt", se, "/admin-ext/api/search/", "/search", rd, "/admin-ext/api/redirects", pl, rv, "/admin-ext/api/revisions/"],
    sidebarHrefs: [rp, st, se, rd, pl, rv],
    assetPrefixes: [],
    frontendHideSelectors: ["#related-posts-block", "#ap-search-fab"],
    optionKeys: [
      "astropress_related_posts_settings",
      "astropress_seo_tools_settings",
      "astropress_search_settings",
      "astropress_redirects",
      "astropress_permalink_settings",
    ],
    members: [
      { slug: "related-posts", label: "相关文章", settingsUrl: rp, routePrefixes: [rp, "/admin-ext/api/related-posts/", "/ap-related/"], frontendHideSelectors: ["#related-posts-block"] },
      { slug: "seo-tools", label: "SEO 工具", settingsUrl: st, routePrefixes: [st, "/admin-ext/api/seo-tools/", "/rss.xml", "/robots.txt"] },
      { slug: "search", label: "全站搜索", settingsUrl: se, routePrefixes: [se, "/admin-ext/api/search/", "/search"], frontendHideSelectors: ["#ap-search-fab"] },
      { slug: "redirect", label: "重定向", settingsUrl: rd, routePrefixes: [rd, "/admin-ext/api/redirects"] },
      { slug: "permalink", label: "固定链接", settingsUrl: pl, routePrefixes: [pl] },
      { slug: "revisions", label: "版本历史", settingsUrl: rv, routePrefixes: [rv, "/admin-ext/api/revisions/"] },
    ],
  },
  {
    slug: "site-suite",
    label: "站点互动与营销",
    kind: "suite",
    routePrefixes: [ads, "/admin-ext/api/ads/", "/ap-ads/", cmt, "/admin-ext/api/comments/", "/ap-comments/", shr, "/admin-ext/api/share/", cs, "/admin-ext/api/customer-service/", ft, "/admin-ext/api/footer/", don, "/admin-ext/api/donation/", gtk, "/admin-ext/api/gitalk/"],
    sidebarHrefs: [ads, cmt, shr, cs, ft, don, gtk],
    assetPrefixes: ["/ap-ads/"],
    frontendHideSelectors: [
      ".ap-ad", "[data-ap-ad-id]", "#ap-comments", "#ap-share-root", ".ap-share",
      "#apcs-root", ".ap-footer-item", "#ap-donation", "#ap-donation-modal",
      "#ap-gitalk", "#gitalk-container",
    ],
    optionKeys: [
      "astropress_ads_slots",
      "astropress_comments_settings",
      "astropress_share_settings",
      "astropress_cs_settings",
      "astropress_footer_settings",
      "astropress_donation_settings",
      "astropress_gitalk_settings",
    ],
    members: [
      { slug: "ads-manager", label: "广告管理", settingsUrl: ads, routePrefixes: [ads, "/admin-ext/api/ads/", "/ap-ads/"], assetPrefixes: ["/ap-ads/"], frontendHideSelectors: [".ap-ad", "[data-ap-ad-id]"] },
      { slug: "comments", label: "评论", settingsUrl: cmt, routePrefixes: [cmt, "/admin-ext/api/comments/", "/ap-comments/"], frontendHideSelectors: ["#ap-comments"] },
      { slug: "share", label: "社交分享", settingsUrl: shr, routePrefixes: [shr, "/admin-ext/api/share/"], frontendHideSelectors: ["#ap-share-root", ".ap-share"] },
      { slug: "customer-service", label: "在线客服", settingsUrl: cs, routePrefixes: [cs, "/admin-ext/api/customer-service/"], frontendHideSelectors: ["#apcs-root"] },
      { slug: "footer", label: "页脚设置", settingsUrl: ft, routePrefixes: [ft, "/admin-ext/api/footer/"], frontendHideSelectors: [".ap-footer-item"] },
      { slug: "donation", label: "文章打赏", settingsUrl: don, routePrefixes: [don, "/admin-ext/api/donation/"], frontendHideSelectors: ["#ap-donation", "#ap-donation-modal"] },
      { slug: "gitalk-comment", label: "Gitalk 评论", settingsUrl: gtk, routePrefixes: [gtk, "/admin-ext/api/gitalk/"], frontendHideSelectors: ["#ap-gitalk", "#gitalk-container"] },
    ],
  },
  {
    slug: "sync-suite",
    label: "同步与备份",
    kind: "suite",
    routePrefixes: [bk, "/admin-ext/api/backup", cio, "/admin-ext/api/config-io/", gs, "/admin-ext/api/gist-sync", git, "/admin-ext/api/git-sync"],
    sidebarHrefs: [bk, cio, gs, git],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: [
      "astropress_gist_sync_settings",
      "astropress_gist_sync_history",
      "astropress_git_sync_settings",
      "astropress_git_sync_history",
    ],
    members: [
      { slug: "backup", label: "备份与恢复", settingsUrl: bk, routePrefixes: [bk, "/admin-ext/api/backup"], cfUnsupported: "备份包需要本地文件系统读写（Cloudflare 上请使用 D1 自动备份）" },
      { slug: "config-io", label: "配置导入导出", settingsUrl: cio, routePrefixes: [cio, "/admin-ext/api/config-io/"] },
      { slug: "gist-sync", label: "Gist 配置同步", settingsUrl: gs, routePrefixes: [gs, "/admin-ext/api/gist-sync"] },
      { slug: "git-sync", label: "Git 同步", settingsUrl: git, routePrefixes: [git, "/admin-ext/api/git-sync"], cfUnsupported: "依赖服务器本地 Git CLI 与文件系统" },
    ],
  },
  {
    slug: "ops-suite",
    label: "运维工具箱",
    kind: "suite",
    routePrefixes: [wh, "/admin-ext/api/webhook/", "/ap-webhook/", dbc, "/admin-ext/api/db-console/", ld, "/admin-ext/api/links/", "/ap-links/", "/directory", fm, "/admin-ext/api/files", wd, "/admin-ext/api/webdav", "/webdav", dbo, "/admin-ext/api/db-opt/"],
    sidebarHrefs: [wh, dbc, ld, "/directory", fm, wd, dbo],
    assetPrefixes: [],
    frontendHideSelectors: ["#ap-directory"],
    optionKeys: [
      "astropress_webhook_api_keys",
      "astropress_webhook_logs",
      "astropress_links_settings",
      "webdav_access_token",
    ],
    members: [
      { slug: "webhook-publisher", label: "Webhook 发布", settingsUrl: wh, routePrefixes: [wh, "/admin-ext/api/webhook/", "/ap-webhook/"] },
      { slug: "db-console", label: "数据库控制台", settingsUrl: dbc, routePrefixes: [dbc, "/admin-ext/api/db-console/"] },
      { slug: "link-directory", label: "网站目录", settingsUrl: ld, routePrefixes: [ld, "/admin-ext/api/links/", "/ap-links/", "/directory"], frontendHideSelectors: ["#ap-directory"] },
      { slug: "file-manager", label: "文件管理", settingsUrl: fm, routePrefixes: [fm, "/admin-ext/api/files"], cfUnsupported: "管理服务器本地磁盘文件，Cloudflare Workers 无持久文件系统（媒体库走 R2）" },
      { slug: "webdav", label: "WebDAV 存储", settingsUrl: wd, routePrefixes: [wd, "/admin-ext/api/webdav", "/webdav"], cfUnsupported: "需要挂载本地文件系统作为 WebDAV 存储目录" },
      { slug: "db-optimize", label: "数据库优化", settingsUrl: dbo, routePrefixes: [dbo, "/admin-ext/api/db-opt/"] },
    ],
  },
  {
    slug: "admin-suite",
    label: "后台增强",
    kind: "suite",
    routePrefixes: ["/admin-ext/api/dashboard-widgets/", nc, "/admin-ext/api/notifications/"],
    sidebarHrefs: [nc],
    assetPrefixes: [],
    frontendHideSelectors: [],
    optionKeys: ["astropress_slots_synced_theme"],
    members: [
      { slug: "dashboard-widgets", label: "仪表盘增强", routePrefixes: ["/admin-ext/api/dashboard-widgets/"] },
      { slug: "notification-center", label: "通知中心", settingsUrl: nc, routePrefixes: [nc, "/admin-ext/api/notifications/"] },
      // 主题槽位同步无独立路由，仅在启用时注入后台槽位
      { slug: "theme-slot-sync", label: "主题槽位同步" },
    ],
  },
];

/** 全部套件成员 slug（用于状态级联与未收录列表过滤） */
export const ALL_MEMBER_SLUGS: string[] = REGISTRY.flatMap((m) => (m.members ?? []).map((x) => x.slug));

export function getMeta(slug: string): PluginMeta | undefined {
  return REGISTRY.find((p) => p.slug === slug);
}

/** 被禁用单元的归并集合（套件整体禁用 → 套件并集；仅成员禁用 → 成员自己的归属）。 */
export interface DisabledUnits {
  /** pre 中间件应直接 404 的路由前缀 */
  routePrefixes: string[];
  /** 后台侧边栏应移除的菜单 href */
  sidebarHrefs: string[];
  /** 后台 HTML 中应剥离的脚本/样式地址前缀 */
  assetPrefixes: string[];
  /** 前台应 CSS 隐藏的节点选择器 */
  frontendSelectors: string[];
  /** 当前被禁用的成员 slug（含套件级联禁用与平台屏蔽），供 FAB 等特殊处理使用 */
  memberSlugs: string[];
}

export interface CollectOptions {
  /** 是否运行在 Cloudflare Workers：为 true 时 cfUnsupported 成员按禁用处理 */
  cloudflare?: boolean;
}

export function collectDisabled(states: Record<string, boolean>, opts: CollectOptions = {}): DisabledUnits {
  const cf = !!opts.cloudflare;
  const out: DisabledUnits = {
    routePrefixes: [],
    sidebarHrefs: [],
    assetPrefixes: [],
    frontendSelectors: [],
    memberSlugs: [],
  };
  for (const m of REGISTRY) {
    // 系统套件不可禁用；普通套件整体开关关闭 → 直接采用套件并集
    const suiteOff = !m.system && states[m.slug] === false;
    if (suiteOff) {
      out.routePrefixes.push(...m.routePrefixes);
      out.sidebarHrefs.push(...m.sidebarHrefs);
      out.assetPrefixes.push(...m.assetPrefixes);
      out.frontendSelectors.push(...m.frontendHideSelectors);
    }
    for (const mem of m.members ?? []) {
      // 平台不兼容（如 CF 无 fs/子进程）→ 与用户手动禁用等效
      const platformOff = cf && !!mem.cfUnsupported;
      const memberOff = states[mem.slug] === false;
      if (!platformOff && !memberOff) continue;
      out.memberSlugs.push(mem.slug);
      // 套件已整体禁用时成员归属无需重复收集
      if (suiteOff) continue;
      out.routePrefixes.push(...(mem.routePrefixes ?? []));
      if (mem.settingsUrl) out.sidebarHrefs.push(mem.settingsUrl);
      out.assetPrefixes.push(...(mem.assetPrefixes ?? []));
      out.frontendSelectors.push(...(mem.frontendHideSelectors ?? []));
    }
  }
  return out;
}
