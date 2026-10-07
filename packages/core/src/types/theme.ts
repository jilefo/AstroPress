export type BlockType =
  | "hero"
  | "text"
  | "image"
  | "columns"
  | "cta"
  | "features"
  | "form"
  | "nav"
  | "site-title"
  | "spacer"
  | "divider"
  | "html"
  | "ai"
  | "query-loop"
  | "loop-image"
  | "loop-title"
  | "loop-excerpt"
  | "loop-date"
  | "loop-author"
  | "loop-category"
  | "loop-read-more"
  | "loop-custom-field";

export interface Block {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
}

export interface PageSchema {
  version: 1;
  blocks: Block[];
}

export interface ThemeTokens {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  spacing: {
    sectionY: string;
    containerMax: string;
    borderRadius: string;
  };
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  source?: "upload" | "marketplace";
  tokens: ThemeTokens;
  createdAt: string;
  updatedAt: string;
}

export type TemplateType =
  | "header"
  | "footer"
  | "single-post"
  | "single-page"
  | "archive"
  | "404"
  | "search";

export type ConditionRule =
  | "entire_site"
  | "front_page"
  | "all_posts"
  | "all_pages"
  | "post_type"
  | "singular"
  | "archive_type";

export interface DisplayCondition {
  rule: ConditionRule;
  value?: string; // e.g. "book" for post_type, "/about" for singular
}

export interface ThemeTemplate {
  id: string;
  name: string;
  type: TemplateType;
  conditions: DisplayCondition[];
  schemaSlug: string; // suffix for astropress_page_schema_<schemaSlug>
  createdAt: string;
  updatedAt: string;
}

/** Maps each template type to the schemaSlug that is currently active for it */
export interface TemplateSlots {
  header?: string;
  footer?: string;
  "single-post"?: string;
  "single-page"?: string;
  archive?: string;
  "404"?: string;
  search?: string;
}

export interface ThemePackageTemplate {
  type: TemplateType;
  name: string;
  blocks: Block[];
}

export interface ThemePackagePage {
  title: string;
  slug: string;
  blocks: Block[];
}

export interface LoopTemplate {
  id: string;
  name: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ThemePackage {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  preview?: string;
  tokens: ThemeTokens;
  templates: ThemePackageTemplate[];
  pages?: ThemePackagePage[];
}

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  header: "页眉",
  footer: "页脚",
  "single-post": "文章页",
  "single-page": "独立页面",
  archive: "归档页",
  "404": "404 页面",
  search: "搜索结果页",
};

export const CONDITION_RULE_LABELS: Record<ConditionRule, string> = {
  entire_site: "全站",
  front_page: "首页",
  all_posts: "所有文章",
  all_pages: "所有页面",
  post_type: "指定文章类型（填写 slug）",
  singular: "指定页面/文章（填写 slug）",
  archive_type: "归档页（指定分类法）",
};

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  colors: {
    primary: "#2271b1",
    secondary: "#7c3aed",
    background: "#ffffff",
    surface: "#f8f9fa",
    text: "#212529",
    textMuted: "#6c757d",
    border: "#e9ecef",
  },
  fonts: {
    heading: "system-ui, -apple-system, sans-serif",
    body: "system-ui, -apple-system, sans-serif",
  },
  spacing: {
    sectionY: "5rem",
    containerMax: "1200px",
    borderRadius: "0.5rem",
  },
};

export const BLOCK_DEFAULTS: Record<BlockType, Record<string, unknown>> = {
  hero: {
    heading: "Welcome to Our Site",
    subtext: "A powerful platform built for your business.",
    buttonText: "Get Started",
    buttonUrl: "#",
    bgColor: "#1a1a2e",
    textColor: "#ffffff",
    align: "center",
    height: 480,
  },
  text: {
    content: "<p>Your content goes here. Click to edit this block.</p>",
    align: "left",
  },
  image: {
    src: "",
    alt: "",
    caption: "",
    align: "center",
    width: "normal",
  },
  columns: {
    cols: 2,
    gap: "2rem",
    leftContent: "<p>Left column content.</p>",
    rightContent: "<p>Right column content.</p>",
  },
  cta: {
    heading: "Ready to Get Started?",
    text: "Join thousands of users who trust our platform.",
    buttonText: "Start Free Trial",
    buttonUrl: "#",
    bgColor: "#2271b1",
    textColor: "#ffffff",
  },
  features: {
    heading: "Why Choose Us",
    subtext: "Everything you need to grow your business",
    cols: 3,
    items: [
      { icon: "★", title: "Feature One", text: "Description of this amazing feature." },
      { icon: "✦", title: "Feature Two", text: "Description of this amazing feature." },
      { icon: "◆", title: "Feature Three", text: "Description of this amazing feature." },
    ],
  },
  form: {
    formId: "",
    formTitle: "Select a form",
  },
  nav: {
    align: "right",
    style: "inline",
    logoText: "",
  },
  "site-title": {
    showTagline: true,
    size: "medium",
    align: "left",
  },
  spacer: { height: 64 },
  divider: { style: "solid", color: "#e2e8f0", thickness: 1 },
  html: { content: "<!-- Custom HTML here -->" },
  ai: { prompt: "" },
  "loop-image": { height: 220, objectFit: "cover", borderRadius: "0", showPlaceholder: true },
  "loop-title": { tag: "h3", size: "1.05rem", weight: "700", linked: true },
  "loop-excerpt": { length: 120, size: "0.9rem" },
  "loop-date": { format: "long", size: "11px" },
  "loop-author": { prefix: "作者：", size: "11px" },
  "loop-category": { size: "10px", badge: false },
  "loop-read-more": { text: "阅读全文 →", buttonStyle: "link" },
  "loop-custom-field": { fieldKey: "", label: "", showLabel: true, size: "13px", fallback: "" },
  "query-loop": {
    postType: "post",
    perPage: 6,
    columns: 3,
    orderBy: "date",
    order: "DESC",
    showImage: true,
    showDate: true,
    showExcerpt: true,
    showAuthor: false,
    showCategory: true,
    imageHeight: 200,
    gap: "24px",
    cardBg: "#ffffff",
    cardBorder: "#e2e8f0",
    cardRadius: "8px",
    padding: "5rem 48px",
    loopTemplateId: "default-with-image",
    pagination: "none",
    pageLimit: 0,
    loadMoreText: "加载更多",
  },
};
