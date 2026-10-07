import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Block, BlockType, ThemeTokens, TemplateType, DisplayCondition, ConditionRule } from "@astropress/core/types/theme";
import { BLOCK_DEFAULTS, TEMPLATE_TYPE_LABELS, CONDITION_RULE_LABELS } from "@astropress/core/types/theme";
import { LIBRARY_BLOCKS, LIBRARY_PAGES, LIBRARY_CATEGORIES } from "../lib/templateLibrary";
import type { UserTemplate, LibraryCategory } from "../lib/templateLibrary";

interface FormOption { id: string; title: string; fieldCount: number; }

interface Props {
  slug: string;
  pageTitle: string;
  initialBlocks: Block[];
  initialTokens: ThemeTokens;
  forms?: FormOption[];
  isTemplate?: boolean;
  isLoopItem?: boolean;
  templatePart?: TemplateType;
  templateId?: string;
  initialConditions?: DisplayCondition[];
  siteUrl?: string;
}

// ─── Plugin Panel Extension Registry ─────────────────────────────────────────
export interface BlockPanelExtension {
  id: string;
  label: string;
  render: (block: Block, onChange: (props: Record<string, unknown>) => void) => React.ReactNode;
}

if (typeof window !== "undefined") {
  const w = window as any;
  if (!w.__apBlockPanels__) w.__apBlockPanels__ = {};
  w.AstroPressEditor = w.AstroPressEditor ?? {};
  w.AstroPressEditor.registerBlockPanel = (blockType: string, ext: BlockPanelExtension) => {
    if (!w.__apBlockPanels__[blockType]) w.__apBlockPanels__[blockType] = [];
    w.__apBlockPanels__[blockType].push(ext);
  };
}

function getBlockPanelExtensions(blockType: string): BlockPanelExtension[] {
  if (typeof window === "undefined") return [];
  const w = window as any;
  return [...(w.__apBlockPanels__?.["*"] ?? []), ...(w.__apBlockPanels__?.[blockType] ?? [])];
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const CONTENT_PALETTE = [
  { type: "ai" as BlockType, label: "✨ AI 区块", desc: "描述任意需求，AI 自动选择最合适的区块" },
  { type: "hero" as BlockType, label: "主视觉横幅", desc: "通栏横幅，含标题与行动按钮" },
  { type: "text" as BlockType, label: "文本", desc: "富文本内容" },
  { type: "image" as BlockType, label: "图片", desc: "带说明文字的图片" },
  { type: "cta" as BlockType, label: "行动号召", desc: "带按钮的彩色横幅" },
  { type: "features" as BlockType, label: "特性", desc: "带图标的卡片网格" },
  { type: "columns" as BlockType, label: "分栏", desc: "双栏布局" },
  { type: "form" as BlockType, label: "表单", desc: "嵌入联系表单" },
  { type: "spacer" as BlockType, label: "间距", desc: "垂直留白" },
  { type: "divider" as BlockType, label: "分隔线", desc: "水平分割线" },
  { type: "html" as BlockType, label: "HTML", desc: "自定义 HTML 嵌入" },
  { type: "query-loop" as BlockType, label: "文章循环", desc: "以网格展示文章" },
];

const TEMPLATE_PALETTE = [
  { type: "ai" as BlockType, label: "✨ AI 区块", desc: "描述任意需求，AI 自动选择最合适的区块" },
  { type: "nav" as BlockType, label: "导航栏", desc: "带 Logo 的站点导航" },
  { type: "site-title" as BlockType, label: "站点标题", desc: "站点名称与副标题" },
  { type: "text" as BlockType, label: "文本", desc: "富文本内容" },
  { type: "columns" as BlockType, label: "分栏", desc: "多栏布局" },
  { type: "html" as BlockType, label: "HTML", desc: "自定义 HTML" },
  { type: "spacer" as BlockType, label: "间距", desc: "垂直留白" },
  { type: "divider" as BlockType, label: "分隔线", desc: "水平分割线" },
];

const LOOP_PALETTE = [
  { type: "loop-image" as BlockType, label: "文章图片", desc: "文章特色图片" },
  { type: "loop-title" as BlockType, label: "文章标题", desc: "带文章链接的标题" },
  { type: "loop-excerpt" as BlockType, label: "文章摘要", desc: "自动生成的摘要" },
  { type: "loop-date" as BlockType, label: "文章日期", desc: "发布日期" },
  { type: "loop-author" as BlockType, label: "文章作者", desc: "作者名称" },
  { type: "loop-category" as BlockType, label: "文章分类", desc: "分类法徽标" },
  { type: "loop-read-more" as BlockType, label: "阅读全文", desc: "文章链接或按钮" },
  { type: "loop-custom-field" as BlockType, label: "自定义字段", desc: "展示文章 meta/自定义字段值" },
  { type: "spacer" as BlockType, label: "间距", desc: "垂直留白" },
  { type: "divider" as BlockType, label: "分隔线", desc: "水平分割线" },
  { type: "html" as BlockType, label: "HTML", desc: "自定义 HTML" },
];

const BLOCK_TYPE_LABELS: Record<string, string> = {};
for (const _pl of [CONTENT_PALETTE, TEMPLATE_PALETTE, LOOP_PALETTE]) {
  for (const _it of _pl) BLOCK_TYPE_LABELS[_it.type] = _it.label;
}
const LIB_CATEGORY_LABELS: Record<string, string> = {
  All: "全部", Navigation: "导航", Hero: "主视觉", Features: "特性",
  Content: "内容", CTA: "行动号召", Pricing: "定价", Gallery: "图库",
  Form: "表单", Footer: "页脚",
};
const blockTypeLabel = (tp: string) => BLOCK_TYPE_LABELS[tp] ?? tp.replace(/-/g, " ");

function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── Inline Editable ──────────────────────────────────────────────────────────
function Editable({ value, onSave, style, html = false, placeholder = "" }: {
  value: string; onSave: (v: string) => void;
  style?: React.CSSProperties; html?: boolean; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el === document.activeElement) return;
    if (html) el.innerHTML = value || placeholder;
    else el.textContent = value || placeholder;
  }, [value, html, placeholder]);
  return (
    <div ref={ref} contentEditable suppressContentEditableWarning
      data-placeholder={placeholder}
      style={{ outline: "none", cursor: "text", minHeight: "1em", ...style }}
      onClick={e => e.stopPropagation()}
      onFocus={e => { if (e.currentTarget.textContent === placeholder) e.currentTarget.textContent = ""; }}
      onBlur={e => onSave(html ? e.currentTarget.innerHTML : e.currentTarget.textContent || "")}
    />
  );
}

// ─── AI Block (separate component for hooks) ──────────────────────────────────
function AIBlockPreview({ block, tokens, isSelected, onPropChange, onReplace }: {
  block: Block; tokens: ThemeTokens; isSelected?: boolean;
  onPropChange?: (key: string, val: unknown) => void; onReplace?: (b: Block) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const prompt = String(block.props.prompt || "");

  const generate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!prompt.trim()) return;
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/ai/generate-blocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, singleBlock: true }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) { setError(data.error || "生成失败"); return; }
      const generated: Block[] = data.blocks ?? [];
      if (generated.length > 0 && onReplace) onReplace({ ...generated[0], id: block.id });
    } catch { setError("网络异常，请稍后再试"); }
    finally { setGenerating(false); }
  };

  return (
    <div style={{ padding: "48px", background: tokens.colors.surface, borderTop: "3px solid #7c3aed", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
      <div style={{ maxWidth: "560px", width: "100%", background: "#fff", border: `1px solid ${tokens.colors.border}`, borderRadius: tokens.spacing.borderRadius, padding: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <span style={{ fontSize: "1.3rem" }}>✨</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#1d2327" }}>AI 区块</div>
            <div style={{ fontSize: "11px", color: tokens.colors.textMuted }}>描述你的需求，AI 会选择最合适的区块类型</div>
          </div>
        </div>
        {isSelected && onPropChange ? (
          <Editable value={prompt} onSave={v => onPropChange("prompt", v)}
            placeholder="例如：包含三档定价的表格，或团队介绍板块…"
            style={{ width: "100%", minHeight: "72px", padding: "10px 12px", border: `1px solid ${tokens.colors.border}`, borderRadius: "4px", fontSize: "13px", color: tokens.colors.text, background: tokens.colors.surface, lineHeight: "1.6", boxSizing: "border-box" }}
          />
        ) : (
          <div style={{ padding: "10px 12px", border: `1px solid ${tokens.colors.border}`, borderRadius: "4px", minHeight: "48px", fontSize: "13px", color: prompt ? tokens.colors.text : tokens.colors.textMuted, background: tokens.colors.surface }}>
            {prompt || "点击设置提示词…"}
          </div>
        )}
        {error && <div style={{ marginTop: "12px", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "4px", fontSize: "12px", color: "#dc2626" }}>{error}</div>}
        <button onClick={generate} disabled={generating || !prompt.trim()}
          style={{ marginTop: "16px", width: "100%", padding: "10px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "4px", fontSize: "13px", fontWeight: 600, cursor: generating || !prompt.trim() ? "not-allowed" : "pointer", opacity: !prompt.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          {generating ? <><span style={{ display: "inline-block", width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />生成中…</> : <>✨ 生成区块</>}
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ─── Query Loop Live Preview ──────────────────────────────────────────────────
const DEFAULT_PREVIEW_TEMPLATES: Record<string, any[]> = {
  "default-with-image": [
    { type: "loop-image", props: { height: 220 } },
    { type: "loop-category", props: { size: "10px" } },
    { type: "loop-title", props: { tag: "h3", size: "1.05rem", weight: "700" } },
    { type: "loop-date", props: { size: "11px" } },
    { type: "loop-excerpt", props: { length: 120, size: "0.9rem" } },
    { type: "loop-read-more", props: { text: "阅读全文 →", buttonStyle: "link" } },
  ],
  "default-no-image": [
    { type: "loop-category", props: { size: "10px", badge: true } },
    { type: "loop-title", props: { tag: "h3", size: "1.1rem", weight: "700" } },
    { type: "loop-date", props: { size: "11px" } },
    { type: "loop-author", props: { prefix: "作者：" } },
    { type: "loop-excerpt", props: { length: 160, size: "0.9rem" } },
    { type: "loop-read-more", props: { text: "阅读全文 →", buttonStyle: "link" } },
  ],
  "default-horizontal": [
    { type: "loop-image", props: { height: 140, layout: "horizontal", width: "180px" } },
    { type: "loop-category", props: { size: "10px" } },
    { type: "loop-title", props: { tag: "h3", size: "1rem", weight: "700" } },
    { type: "loop-date", props: { size: "11px" } },
    { type: "loop-excerpt", props: { length: 80, size: "0.88rem" } },
    { type: "loop-read-more", props: { text: "阅读全文 →", buttonStyle: "link" } },
  ],
  "default-magazine": [
    { type: "loop-image", props: { height: 280 } },
    { type: "loop-category", props: { size: "10px", badge: true } },
    { type: "loop-title", props: { tag: "h3", size: "1.15rem", weight: "700" } },
    { type: "loop-date", props: { size: "11px" } },
    { type: "loop-read-more", props: { text: "阅读全文 →", buttonStyle: "link" } },
  ],
};

function LoopBlockNode({ b, post, toks }: { b: any; post: any; toks: ThemeTokens }) {
  const p = b.props ?? {};
  const date = post.date ? new Date(post.date) : new Date();
  let dateStr = "";
  try {
    const fmt = String(p.format || "long");
    if (fmt === "long") dateStr = date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    else if (fmt === "short") dateStr = date.toLocaleDateString("zh-CN");
    else if (fmt === "iso") dateStr = date.toISOString().slice(0, 10);
    else if (fmt === "relative") { const d = Math.floor((Date.now() - date.getTime()) / 86400000); dateStr = d === 0 ? "今天" : d === 1 ? "昨天" : `${d} 天前`; }
  } catch { dateStr = post.date ?? ""; }

  switch (b.type) {
    case "loop-image":
      return <div style={{ height: `${Number(p.height) || 220}px`, background: `linear-gradient(135deg, ${toks.colors.surface}, ${toks.colors.border})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", borderRadius: `${String(p.borderRadius || "0")} ${String(p.borderRadius || "0")} 0 0` }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={toks.colors.border} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </div>;
    case "loop-category":
      return <div style={{ padding: "0 16px 6px" }}>
        <span style={{ fontSize: String(p.size || "10px"), fontWeight: 700, color: String(p.color || toks.colors.primary), textTransform: "uppercase" as const, letterSpacing: "0.5px", ...(p.badge ? { background: toks.colors.surface, border: `1px solid ${toks.colors.border}`, borderRadius: "99px", padding: "2px 8px" } : {}) }}>文章</span>
      </div>;
    case "loop-title": {
      const Tag = (String(p.tag || "h3")) as any;
      return <Tag style={{ margin: 0, padding: "6px 16px", fontFamily: toks.fonts.heading, fontWeight: Number(String(p.weight || "700")), fontSize: String(p.size || "1.05rem"), lineHeight: 1.35, color: String(p.color || toks.colors.text) }}>{post.title || "无标题"}</Tag>;
    }
    case "loop-excerpt": {
      const raw = (post.excerpt || (post.content ? String(post.content).replace(/<[^>]+>/g, "") : "")).trim();
      const len = Number(p.length) || 120;
      const ex = raw.length > len ? raw.slice(0, len) + "…" : raw;
      return ex ? <div style={{ padding: "4px 16px" }}><p style={{ margin: 0, fontSize: String(p.size || "0.9rem"), color: String(p.color || toks.colors.textMuted), lineHeight: 1.65 }}>{ex}</p></div> : null;
    }
    case "loop-date":
      return <div style={{ padding: "4px 16px" }}><span style={{ fontSize: String(p.size || "11px"), color: String(p.color || toks.colors.textMuted) }}>{dateStr}</span></div>;
    case "loop-author":
      return <div style={{ padding: "4px 16px" }}><span style={{ fontSize: String(p.size || "11px"), color: String(p.color || toks.colors.textMuted) }}>{String(p.prefix || "作者：")}作者</span></div>;
    case "loop-read-more": {
      const bs = String(p.buttonStyle || "link");
      const bc = String(p.color || toks.colors.primary);
      const bt = String(p.text || "阅读全文 →");
      if (bs === "button") return <div style={{ padding: "10px 16px 16px" }}><span style={{ display: "inline-block", background: bc, color: "#fff", padding: "8px 20px", borderRadius: toks.spacing.borderRadius, fontSize: String(p.size || "13px"), fontWeight: 600, cursor: "pointer" }}>{bt}</span></div>;
      if (bs === "outline") return <div style={{ padding: "10px 16px 16px" }}><span style={{ display: "inline-block", border: `2px solid ${bc}`, color: bc, padding: "7px 18px", borderRadius: toks.spacing.borderRadius, fontSize: String(p.size || "13px"), fontWeight: 600, cursor: "pointer" }}>{bt}</span></div>;
      return <div style={{ padding: "10px 16px 16px" }}><span style={{ fontSize: String(p.size || "13px"), fontWeight: 600, color: bc, cursor: "pointer" }}>{bt}</span></div>;
    }
    case "loop-custom-field":
      return p.fieldKey ? <div style={{ padding: "4px 16px" }}><span style={{ fontSize: String(p.size || "13px"), color: String(p.color || toks.colors.textMuted), fontStyle: "italic" }}>[{String(p.fieldKey)}]</span></div> : null;
    case "spacer":
      return <div style={{ height: `${Number(p.height) || 16}px` }} />;
    case "divider":
      return <hr style={{ border: "none", borderTop: `1px solid ${toks.colors.border}`, margin: "8px 16px" }} />;
    default:
      return null;
  }
}

function QueryLoopLivePreview({ block, tokens }: { block: Block; tokens: ThemeTokens }) {
  const p = block.props;
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [templateBlocks, setTemplateBlocks] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const templateId = String(p.loopTemplateId || "default-with-image");

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const previewPerPage = Math.min(Number(p.perPage) || 6, 12);
        const [postsRes, tmplRes] = await Promise.all([
          fetch(`/api/themes/query-preview?postType=${encodeURIComponent(String(p.postType || "post"))}&perPage=${previewPerPage}&orderBy=${encodeURIComponent(String(p.orderBy || "date"))}&order=${encodeURIComponent(String(p.order || "DESC"))}`),
          templateId.startsWith("default-")
            ? Promise.resolve(null)
            : fetch(`/api/page-schema/${encodeURIComponent(`__loop-item_${templateId}__`)}`).catch(() => null),
        ]);
        const postsData = await postsRes.json() as any;
        setPosts(Array.isArray(postsData.posts) ? postsData.posts : []);
        setTotal(Number(postsData.total) || 0);
        if (tmplRes && tmplRes.ok) {
          const td = await tmplRes.json() as any;
          setTemplateBlocks(Array.isArray(td.blocks) ? td.blocks : null);
        } else {
          setTemplateBlocks(null);
        }
      } catch { setPosts([]); setTotal(0); } finally { setLoading(false); }
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [p.postType, p.perPage, p.orderBy, p.order, templateId]);

  const cols = Number(p.columns) || 3;
  const gap = String(p.gap || "24px");
  const cardBg = String(p.cardBg || "#ffffff");
  const cardBorder = String(p.cardBorder || "#e2e8f0");
  const cardRadius = String(p.cardRadius || "8px");
  const tmplBlocks = templateBlocks ?? DEFAULT_PREVIEW_TEMPLATES[templateId] ?? DEFAULT_PREVIEW_TEMPLATES["default-with-image"];
  const isHorizontal = tmplBlocks.some((b: any) => b.type === "loop-image" && b.props?.layout === "horizontal");

  return (
    <div style={{ fontFamily: tokens.fonts.body, color: tokens.colors.text, padding: String(p.padding || "5rem 48px") }}>
      <style>{`@keyframes ap-shimmer{from{background-position:-400px 0}to{background-position:400px 0}}`}</style>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
          {loading
            ? Array.from({ length: Math.min(Number(p.perPage) || 6, 12) }).map((_, i) => (
                <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: cardRadius, overflow: "hidden" }}>
                  <div style={{ height: "160px", background: "linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)", backgroundSize: "400px 100%", animation: "ap-shimmer 1.4s infinite" }} />
                  <div style={{ padding: "14px" }}>
                    {[40, 100, 60, 80].map((w, j) => <div key={j} style={{ height: j === 1 ? "16px" : "10px", background: "#f0f0f0", borderRadius: "4px", marginBottom: "8px", width: `${w}%` }} />)}
                  </div>
                </div>
              ))
            : posts.length === 0
              ? <div style={{ gridColumn: `1 / -1`, padding: "32px", textAlign: "center", color: tokens.colors.textMuted, fontSize: "13px", background: tokens.colors.surface, borderRadius: cardRadius }}>当前查询下没有已发布的文章。</div>
              : posts.map((post: any, i: number) => (
                  <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: cardRadius, overflow: "hidden", display: "flex", flexDirection: isHorizontal ? "row" : "column" }}>
                    {isHorizontal ? <>
                      <div style={{ width: String(tmplBlocks.find((b: any) => b.type === "loop-image")?.props?.width || "180px"), flexShrink: 0 }}>
                        {tmplBlocks.filter((b: any) => b.type === "loop-image").map((b: any, j: number) => <LoopBlockNode key={j} b={b} post={post} toks={tokens} />)}
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                        {tmplBlocks.filter((b: any) => b.type !== "loop-image").map((b: any, j: number) => <LoopBlockNode key={j} b={b} post={post} toks={tokens} />)}
                      </div>
                    </> : tmplBlocks.map((b: any, j: number) => <LoopBlockNode key={j} b={b} post={post} toks={tokens} />)}
                  </div>
                ))
          }
        </div>
        {!loading && String(p.pagination || "none") !== "none" && (() => {
          const perPage = Number(p.perPage) || 6;
          const pageLimit = Number(p.pageLimit) || 0;
          const totalPages = Math.max(2, total > 0 ? Math.ceil(total / perPage) : 3); // always show at least 2 pages in preview
          const effectivePages = pageLimit > 0 ? Math.max(2, Math.min(totalPages, pageLimit)) : totalPages;
          const paginationType = String(p.pagination);
          const btnBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 16px", border: `1px solid ${tokens.colors.border}`, borderRadius: "4px", fontSize: "13px", color: tokens.colors.text, background: tokens.colors.surface, cursor: "default", userSelect: "none" };
          const activeBtn: React.CSSProperties = { ...btnBase, background: tokens.colors.primary, color: "#fff", borderColor: tokens.colors.primary, fontWeight: 700 };
          const numBtn: React.CSSProperties = { ...btnBase, width: "36px", height: "36px", padding: 0 };
          const activeNumBtn: React.CSSProperties = { ...numBtn, background: tokens.colors.primary, color: "#fff", borderColor: tokens.colors.primary, fontWeight: 700 };

          return (
            <div style={{ marginTop: "24px", borderTop: `1px solid ${tokens.colors.border}`, paddingTop: "20px" }}>
              {paginationType === "numbers" && effectivePages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
                  {Array.from({ length: Math.min(effectivePages, 7) }, (_, i) => i + 1).map(n => (
                    <div key={n} style={n === 1 ? activeNumBtn : numBtn}>{n}</div>
                  ))}
                  {effectivePages > 7 && <div style={{ ...numBtn, border: "none", background: "transparent" }}>…</div>}
                </div>
              )}
              {paginationType === "prev-next" && effectivePages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ ...btnBase, opacity: 0.4 }}>← 上一页</div>
                  <span style={{ fontSize: "13px", color: tokens.colors.textMuted }}>第 1 页，共 {effectivePages} 页</span>
                  <div style={btnBase}>下一页 →</div>
                </div>
              )}
              {paginationType === "load-more" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ ...activeBtn, borderRadius: "6px", fontWeight: 600, padding: "10px 28px", cursor: "default" }}>{String(p.loadMoreText || "加载更多")}</div>
                </div>
              )}
              {paginationType === "infinite-scroll" && (
                <div style={{ textAlign: "center", fontSize: "12px", color: tokens.colors.textMuted, fontStyle: "italic" }}>无限滚动：下滑时自动加载更多文章</div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Block Canvas Previews ────────────────────────────────────────────────────
function BlockPreview({ block, tokens, forms, isSelected, onPropChange, onReplace }: {
  block: Block; tokens: ThemeTokens; forms?: FormOption[]; isSelected?: boolean;
  onPropChange?: (key: string, val: unknown) => void; onReplace?: (b: Block) => void;
}) {
  const p = block.props;
  const sty: React.CSSProperties = { fontFamily: tokens.fonts.body, color: tokens.colors.text };
  const editable = !!(isSelected && onPropChange);

  function T(key: string, fallback: string, style: React.CSSProperties, htmlContent = false) {
    if (editable) return <Editable value={String(p[key] ?? "")} onSave={v => onPropChange!(key, v)} style={style} html={htmlContent} placeholder={fallback} />;
    if (htmlContent) return <div style={style} dangerouslySetInnerHTML={{ __html: String(p[key] || fallback) }} />;
    return <div style={style}>{String(p[key] || fallback)}</div>;
  }

  switch (block.type) {
    case "hero": {
      const align = String(p.align || "center");
      const height = Number(p.height) || 400;
      const itemsAlign = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
      return (
        <div style={{ background: String(p.bgColor || "#1a1a2e"), color: String(p.textColor || "#fff"), padding: "80px 48px", textAlign: align as any, minHeight: `${height}px`, display: "flex", flexDirection: "column", alignItems: itemsAlign, justifyContent: "center", fontFamily: tokens.fonts.heading }}>
          {T("heading", "主视觉标题", { fontSize: "2.5rem", fontWeight: 700, margin: "0 0 16px", lineHeight: "1.15", maxWidth: "800px", color: "inherit" })}
          {(p.subtext || editable) && T("subtext", "副标题（可选）", { fontSize: "1.15rem", margin: "0 0 32px", opacity: "0.85", maxWidth: "560px", color: "inherit" })}
          {(p.buttonText || editable) && T("buttonText", "按钮文字", { display: "inline-block", background: tokens.colors.primary, color: "#fff", padding: "14px 32px", borderRadius: tokens.spacing.borderRadius, fontWeight: 600, fontSize: "1rem" })}
        </div>
      );
    }
    case "text":
      return <div style={{ ...sty, padding: "48px 60px", textAlign: (p.align as any) || "left", lineHeight: 1.75 }}>
        {T("content", "<p>点击此处编辑文本…</p>", { fontFamily: tokens.fonts.body, fontSize: "1.05rem", lineHeight: "1.75", color: tokens.colors.text }, true)}
      </div>;
    case "image": {
      const maxW = p.width === "full" ? "100%" : p.width === "wide" ? "900px" : "640px";
      return (
        <div style={{ padding: "32px 48px", textAlign: (p.align as any) || "center" }}>
          {p.src ? <img src={String(p.src)} alt={String(p.alt || "")} style={{ maxWidth: maxW, borderRadius: tokens.spacing.borderRadius, display: "inline-block" }} />
            : <div style={{ width: "100%", maxWidth: maxW, height: "220px", background: "#f0f4f8", border: "2px dashed #cbd5e1", borderRadius: tokens.spacing.borderRadius, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "14px" }}>
              {editable ? "请在样式面板中设置图片地址" : "尚未设置图片地址"}
            </div>}
          {(p.caption || editable) && T("caption", "图片说明（可选）", { fontSize: "0.85rem", color: tokens.colors.textMuted, marginTop: "8px", textAlign: "center" })}
        </div>
      );
    }
    case "cta":
      return (
        <div style={{ background: String(p.bgColor || tokens.colors.primary), color: String(p.textColor || "#fff"), padding: "72px 48px", textAlign: "center", fontFamily: tokens.fonts.heading }}>
          {T("heading", "行动号召", { fontSize: "2rem", margin: "0 0 12px", fontWeight: 700, color: "inherit" })}
          {(p.text || editable) && T("text", "副标题文字（可选）", { margin: "0 0 32px", opacity: "0.9", maxWidth: "560px", marginLeft: "auto", marginRight: "auto", color: "inherit" })}
          {(p.buttonText || editable) && T("buttonText", "按钮文字", { display: "inline-block", background: "rgba(255,255,255,0.15)", color: "inherit", padding: "12px 28px", borderRadius: tokens.spacing.borderRadius, border: "2px solid rgba(255,255,255,0.4)", fontWeight: 600 })}
        </div>
      );
    case "features": {
      const items = (p.items as any[]) || [];
      const cols = Number(p.cols) || 3;
      return (
        <div style={{ ...sty, padding: "72px 48px", textAlign: "center" }}>
          {T("heading", "特性标题", { fontSize: "2rem", margin: "0 0 12px", fontFamily: tokens.fonts.heading, fontWeight: 700 })}
          {(p.subtext || editable) && T("subtext", "副标题（可选）", { color: tokens.colors.textMuted, margin: "0 0 48px" })}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "28px", textAlign: "left" }}>
            {items.map((item: any, i: number) => (
              <div key={i} style={{ padding: "28px", background: tokens.colors.surface, borderRadius: tokens.spacing.borderRadius, border: `1px solid ${tokens.colors.border}` }}>
                {editable ? <>
                  <Editable value={item.icon || "★"} onSave={v => { const n = [...items]; n[i] = { ...item, icon: v }; onPropChange!("items", n); }} style={{ fontSize: "2rem", marginBottom: "12px" }} />
                  <Editable value={item.title || ""} onSave={v => { const n = [...items]; n[i] = { ...item, title: v }; onPropChange!("items", n); }} style={{ fontFamily: tokens.fonts.heading, fontWeight: 600, marginBottom: "8px", fontSize: "1.05rem" }} placeholder="特性标题" />
                  <Editable value={item.text || ""} onSave={v => { const n = [...items]; n[i] = { ...item, text: v }; onPropChange!("items", n); }} style={{ color: tokens.colors.textMuted, fontSize: "0.95rem", lineHeight: "1.6" }} placeholder="特性描述" />
                </> : <>
                  <div style={{ fontSize: "2rem", marginBottom: "12px" }}>{item.icon || "★"}</div>
                  <h3 style={{ margin: "0 0 8px", fontFamily: tokens.fonts.heading, fontSize: "1.05rem" }}>{item.title}</h3>
                  <p style={{ margin: 0, color: tokens.colors.textMuted, fontSize: "0.95rem", lineHeight: 1.6 }}>{item.text}</p>
                </>}
              </div>
            ))}
            {editable && <button onClick={e => { e.stopPropagation(); onPropChange!("items", [...items, { icon: "★", title: "新特性", text: "特性描述。" }]); }} style={{ padding: "28px", background: "transparent", border: `2px dashed ${tokens.colors.border}`, borderRadius: tokens.spacing.borderRadius, cursor: "pointer", color: tokens.colors.textMuted, fontSize: "13px" }}>+ 添加一项</button>}
          </div>
        </div>
      );
    }
    case "columns":
      return (
        <div style={{ ...sty, padding: "48px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: String(p.gap || "2rem") }}>
          {T("leftContent", "<p>左栏内容…</p>", { fontFamily: tokens.fonts.body, lineHeight: "1.75" }, true)}
          {T("rightContent", "<p>右栏内容…</p>", { fontFamily: tokens.fonts.body, lineHeight: "1.75" }, true)}
        </div>
      );
    case "form": {
      const form = forms?.find(f => f.id === String(p.formId || ""));
      return (
        <div style={{ ...sty, padding: "48px", textAlign: "center" }}>
          <div style={{ maxWidth: "560px", margin: "0 auto", background: tokens.colors.surface, border: `1px solid ${tokens.colors.border}`, borderRadius: tokens.spacing.borderRadius, padding: "32px" }}>
            {form ? <>
              <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "16px", fontFamily: tokens.fonts.heading }}>{form.title}</div>
              <div style={{ color: tokens.colors.textMuted, fontSize: "13px", marginBottom: "16px" }}>{form.fieldCount} 个字段</div>
              <div style={{ background: tokens.colors.primary, color: "#fff", padding: "10px 24px", borderRadius: tokens.spacing.borderRadius, display: "inline-block", fontSize: "13px", fontWeight: 600 }}>提交</div>
            </> : <div style={{ color: tokens.colors.textMuted, fontSize: "14px", padding: "24px 0" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⊞</div>
              {p.formId ? "表单不存在" : editable ? "请在内容面板中选择表单 →" : "尚未选择表单"}
            </div>}
          </div>
        </div>
      );
    }
    case "nav":
      return (
        <div style={{ background: tokens.colors.background, borderBottom: `1px solid ${tokens.colors.border}`, padding: "0 48px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>
          {editable ? <Editable value={String(p.logoText || "")} onSave={v => onPropChange!("logoText", v)} style={{ fontFamily: tokens.fonts.heading, fontWeight: 700, fontSize: "1.2rem", color: tokens.colors.text }} placeholder="站点名称" />
            : <div style={{ fontFamily: tokens.fonts.heading, fontWeight: 700, fontSize: "1.2rem", color: tokens.colors.text }}>{String(p.logoText || "站点名称")}</div>}
          <nav style={{ display: "flex", gap: "24px" }}>
            {["首页", "关于", "博客", "联系"].map(item => <span key={item} style={{ color: tokens.colors.textMuted, fontSize: "14px" }}>{item}</span>)}
          </nav>
        </div>
      );
    case "site-title":
      return (
        <div style={{ ...sty, padding: "24px 48px", textAlign: (p.align as any) || "left" }}>
          <div style={{ fontFamily: tokens.fonts.heading, fontWeight: 700, fontSize: String(p.size) === "large" ? "2rem" : String(p.size) === "small" ? "1rem" : "1.4rem", color: tokens.colors.text }}>站点名称</div>
          {!!p.showTagline && <div style={{ color: tokens.colors.textMuted, fontSize: "0.9rem", marginTop: "4px" }}>这里显示站点副标题</div>}
        </div>
      );
    case "spacer":
      return <div style={{ height: `${Number(p.height) || 64}px`, background: "repeating-linear-gradient(45deg,#f8fafc,#f8fafc 10px,#f0f4f8 10px,#f0f4f8 20px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "11px", color: "#94a3b8", background: "#fff", padding: "2px 8px", borderRadius: "99px", border: "1px solid #e2e8f0" }}>{Number(p.height) || 64}px</span>
      </div>;
    case "divider":
      return <div style={{ padding: "16px 48px" }}><hr style={{ border: "none", borderTop: `${Number(p.thickness) || 1}px ${String(p.style || "solid")} ${String(p.color || "#e2e8f0")}`, margin: 0 }} /></div>;
    case "html":
      return <div style={{ padding: "24px 48px", ...sty }} dangerouslySetInnerHTML={{ __html: String(p.content || "") }} />;
    case "ai":
      return <AIBlockPreview block={block} tokens={tokens} isSelected={isSelected} onPropChange={onPropChange} onReplace={onReplace} />;
    case "loop-image":
      return (
        <div style={{ width: "100%", height: `${Number(p.height) || 220}px`, background: `linear-gradient(135deg, ${tokens.colors.surface}, ${tokens.colors.border})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={tokens.colors.textMuted} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
      );
    case "loop-category":
      return (
        <div style={{ padding: "0 16px 6px", paddingTop: editable ? "16px" : "0" }}>
          <span style={{ fontSize: String(p.size || "10px"), fontWeight: 700, color: tokens.colors.primary, textTransform: "uppercase" as const, letterSpacing: "0.5px", ...(p.badge ? { background: tokens.colors.surface, border: `1px solid ${tokens.colors.border}`, borderRadius: tokens.spacing.borderRadius, padding: "2px 8px" } : {}) }}>分类</span>
        </div>
      );
    case "loop-title":
      return (
        <div style={{ padding: "6px 16px" }}>
          <div style={{ fontFamily: tokens.fonts.heading, fontWeight: Number(String(p.weight || "700")), fontSize: String(p.size || "1.05rem"), color: tokens.colors.text, lineHeight: 1.35 }}>文章标题示例</div>
        </div>
      );
    case "loop-excerpt":
      return (
        <div style={{ padding: "4px 16px" }}>
          <div style={{ fontSize: String(p.size || "0.9rem"), color: tokens.colors.textMuted, lineHeight: 1.6 }}>这里将显示文章的简短摘要，为读者提供内容预览…</div>
        </div>
      );
    case "loop-date":
      return (
        <div style={{ padding: "4px 16px" }}>
          <span style={{ fontSize: String(p.size || "11px"), color: tokens.colors.textMuted }}>2025年1月15日</span>
        </div>
      );
    case "loop-author":
      return (
        <div style={{ padding: "4px 16px" }}>
          <span style={{ fontSize: String(p.size || "11px"), color: tokens.colors.textMuted }}>{String(p.prefix || "作者：")}作者名称</span>
        </div>
      );
    case "loop-read-more":
      return (
        <div style={{ padding: "10px 16px 16px" }}>
          {String(p.buttonStyle || "link") === "button"
            ? <div style={{ display: "inline-block", background: tokens.colors.primary, color: "#fff", padding: "8px 20px", borderRadius: tokens.spacing.borderRadius, fontSize: "13px", fontWeight: 600 }}>{String(p.text || "阅读全文 →")}</div>
            : <div style={{ fontSize: "13px", fontWeight: 600, color: tokens.colors.primary }}>{String(p.text || "阅读全文 →")}</div>
          }
        </div>
      );
    case "loop-custom-field":
      return (
        <div style={{ padding: "4px 16px" }}>
          {p.showLabel !== false && !!p.label && <span style={{ fontSize: "10px", fontWeight: 700, color: tokens.colors.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.5px", display: "block", marginBottom: "2px" }}>{String(p.label)}</span>}
          <span style={{ fontSize: String(p.size || "13px"), color: tokens.colors.text }}>{p.fieldKey ? `[${String(p.fieldKey)}]` : <em style={{ color: tokens.colors.textMuted }}>请在设置中填写字段键名</em>}</span>
        </div>
      );
    case "query-loop":
      return <QueryLoopLivePreview block={block} tokens={tokens} />;
    default:
      return <div style={{ padding: "20px", color: "#999", fontStyle: "italic" }}>未知区块类型</div>;
  }
}

// ─── Shared form primitives ────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", border: "1px solid #3c434a", borderRadius: "3px", fontSize: "12px", fontFamily: "inherit", boxSizing: "border-box", background: "#1d2327", color: "#e0e0e0" };
const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 600, color: "#8c8f94", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" };
const fld: React.CSSProperties = { marginBottom: "14px" };

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return <div style={fld}><label style={lbl}>{name}</label>{children}</div>;
}
function Inp({ value, onChange, type = "text", rows, placeholder }: { value: string; onChange: (v: string) => void; type?: string; rows?: number; placeholder?: string }) {
  if (rows) return <textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
  return <input style={inp} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select style={inp} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
function ColorField({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={lbl}>{name}</label>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: "30px", height: "30px", border: "1px solid #3c434a", borderRadius: "3px", padding: "1px", cursor: "pointer", background: "none" }} />
        <input style={{ ...inp, fontFamily: "monospace", fontSize: "12px", flex: 1 }} value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  );
}

const alignOpts = [{ value: "left", label: "居左" }, { value: "center", label: "居中" }, { value: "right", label: "居右" }];

// ─── Media Picker Modal ────────────────────────────────────────────────────────
interface MediaItem { id: number; url: string; title: string; mimeType: string; filename: string; }

function MediaPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const perPage = 24;

  const load = useCallback((p: number, q: string) => {
    setSearching(true);
    const qs = new URLSearchParams({ page: String(p), ...(q ? { search: q } : {}) });
    fetch(`/api/media?${qs}`)
      .then(r => r.json())
      .then((data: any) => { setItems(data.items ?? []); setTotal(data.total ?? 0); })
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const onSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(1, val), 300);
  };

  const goPage = (p: number) => { setPage(p); load(p, search); };

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      await fetch("/api/media/upload", { method: "POST", body: form });
    }
    setUploading(false);
    setPage(1);
    load(1, search);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) uploadFiles(files);
  };

  const totalPages = Math.ceil(total / perPage);

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const modalStyle: React.CSSProperties = {
    background: "#1d2327", borderRadius: "6px", width: "900px", maxWidth: "95vw",
    height: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderBottom: "1px solid #3c434a", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "14px", color: "#e0e0e0", flex: 1 }}>媒体库</span>
          <input
            type="search" placeholder="搜索…" value={search} onChange={e => onSearch(e.target.value)}
            style={{ background: "#2c3338", border: "1px solid #3c434a", borderRadius: "4px", color: "#e0e0e0", padding: "6px 10px", fontSize: "12px", width: "200px", outline: "none" }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ background: "#2271b1", border: "none", borderRadius: "4px", color: "#fff", padding: "7px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
          >
            {uploading ? "上传中…" : "上传"}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" multiple style={{ display: "none" }}
            onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) uploadFiles(f); e.target.value = ""; }} />
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8c8f94", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Grid */}
          <div
            style={{ flex: 1, overflowY: "auto", padding: "14px", background: dragOver ? "rgba(34,113,177,0.1)" : "transparent", transition: "background 0.15s" }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {dragOver && (
              <div style={{ position: "absolute", inset: 0, border: "2px dashed #2271b1", borderRadius: "4px", pointerEvents: "none", zIndex: 2, margin: "14px" }} />
            )}
            {searching && <div style={{ color: "#8c8f94", fontSize: "12px", textAlign: "center", padding: "20px" }}>加载中…</div>}
            {!searching && items.length === 0 && (
              <div style={{ color: "#8c8f94", fontSize: "13px", textAlign: "center", padding: "40px 20px" }}>
                {search ? "没有找到结果。" : "还没有媒体文件。可在上方上传图片，或拖拽文件到此处。"}
              </div>
            )}
            {!searching && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
                {items.map(item => {
                  const isImg = item.mimeType.startsWith("image/");
                  const isSel = selected?.id === item.id;
                  return (
                    <div key={item.id}
                      onClick={() => setSelected(item)}
                      onDoubleClick={() => { onSelect(item.url); onClose(); }}
                      style={{
                        border: `2px solid ${isSel ? "#2271b1" : "transparent"}`,
                        borderRadius: "4px", overflow: "hidden", cursor: "pointer",
                        background: "#2c3338", position: "relative",
                        boxShadow: isSel ? "0 0 0 1px #2271b1" : "none",
                      }}>
                      {isImg
                        ? <img src={item.url} alt={item.title} style={{ width: "100%", height: "90px", objectFit: "cover", display: "block" }} loading="lazy" />
                        : <div style={{ width: "100%", height: "90px", display: "flex", alignItems: "center", justifyContent: "center", background: "#2c3338" }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8c8f94" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          </div>
                      }
                      <div style={{ padding: "5px 6px", fontSize: "10px", color: "#8c8f94", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.title || item.filename}
                      </div>
                      {isSel && <div style={{ position: "absolute", top: "4px", right: "4px", width: "16px", height: "16px", background: "#2271b1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: "4px", justifyContent: "center", marginTop: "16px" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => goPage(p)}
                    style={{ padding: "4px 10px", border: "1px solid #3c434a", borderRadius: "3px", background: p === page ? "#2271b1" : "#2c3338", color: p === page ? "#fff" : "#8c8f94", cursor: "pointer", fontSize: "12px" }}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right details pane */}
          {selected && (
            <div style={{ width: "220px", flexShrink: 0, borderLeft: "1px solid #3c434a", padding: "14px", overflowY: "auto" }}>
              {selected.mimeType.startsWith("image/")
                ? <img src={selected.url} alt={selected.title} style={{ width: "100%", borderRadius: "3px", marginBottom: "12px" }} />
                : <div style={{ height: "80px", display: "flex", alignItems: "center", justifyContent: "center", background: "#2c3338", borderRadius: "3px", marginBottom: "12px" }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8c8f94" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
              }
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#e0e0e0", marginBottom: "6px", wordBreak: "break-all" }}>{selected.title || selected.filename}</div>
              <div style={{ fontSize: "11px", color: "#8c8f94", marginBottom: "12px" }}>{selected.mimeType}</div>
              <label style={{ fontSize: "11px", color: "#8c8f94", display: "block", marginBottom: "4px" }}>URL</label>
              <input type="text" readOnly value={selected.url} onClick={e => (e.target as HTMLInputElement).select()}
                style={{ width: "100%", fontSize: "10px", padding: "5px 7px", background: "#2c3338", border: "1px solid #3c434a", borderRadius: "3px", color: "#a7aaad", boxSizing: "border-box" }} />
              <button
                onClick={() => { onSelect(selected.url); onClose(); }}
                style={{ width: "100%", marginTop: "12px", padding: "8px", background: "#2271b1", border: "none", borderRadius: "4px", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
              >
                选择
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QueryLoopContent (extracted component to allow hooks) ────────────────────
function QueryLoopContent({ p, set }: { p: Record<string, unknown>; set: (key: string) => (val: unknown) => void }) {
  const [loopTemplates, setLoopTemplates] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>([]);
  useEffect(() => {
    fetch("/api/themes/loop-templates").then(r => r.json()).then((data: any) => setLoopTemplates(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);
  return <>
    <Field name="循环文章模板">
      <select style={inp} value={String(p.loopTemplateId || "default-with-image")} onChange={e => set("loopTemplateId")(e.target.value)}>
        <optgroup label="内置模板">
          {loopTemplates.filter(t => t.isDefault).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>
        {loopTemplates.some(t => !t.isDefault) && <optgroup label="我的模板">
          {loopTemplates.filter(t => !t.isDefault).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>}
      </select>
      <a href="/admin/themes/loop-templates" target="_blank" style={{ fontSize: "11px", color: "#72aee6", display: "block", marginTop: "4px" }}>管理循环模板 ↗</a>
    </Field>
    <div style={{ fontWeight: 700, fontSize: "11px", color: "#8c8f94", textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "16px 0 10px", borderTop: "1px solid #3c434a", paddingTop: "12px" }}>查询</div>
    <Field name="文章类型">
      <select style={inp} value={String(p.postType || "post")} onChange={e => set("postType")(e.target.value)}>
        <option value="post">文章</option>
        <option value="page">页面</option>
      </select>
    </Field>
    <Field name="每页文章数">
      <input type="number" style={inp} value={Number(p.perPage) || 6} min={1} max={48} onChange={e => set("perPage")(Number(e.target.value))} />
    </Field>
    <Field name="排序依据">
      <Sel value={String(p.orderBy || "date")} onChange={set("orderBy")} options={[{ value: "date", label: "日期" }, { value: "title", label: "标题" }, { value: "modified", label: "最后修改" }, { value: "rand", label: "随机" }]} />
    </Field>
    <Field name="排序方向">
      <Sel value={String(p.order || "DESC")} onChange={set("order")} options={[{ value: "DESC", label: "最新优先" }, { value: "ASC", label: "最旧优先" }]} />
    </Field>
    <div style={{ fontWeight: 700, fontSize: "11px", color: "#8c8f94", textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "16px 0 10px", borderTop: "1px solid #3c434a", paddingTop: "12px" }}>分页</div>
    <Field name="分页方式">
      <Sel value={String(p.pagination || "none")} onChange={set("pagination")} options={[
        { value: "none", label: "不分页" },
        { value: "numbers", label: "数字页码" },
        { value: "prev-next", label: "上一页 / 下一页" },
        { value: "load-more", label: "加载更多按钮" },
        { value: "infinite-scroll", label: "无限滚动" },
      ]} />
    </Field>
    {String(p.pagination || "none") !== "none" && (
      <Field name="页数上限（0 为不限）">
        <input type="number" style={inp} value={Number(p.pageLimit) || 0} min={0} max={100} onChange={e => set("pageLimit")(Number(e.target.value))} />
      </Field>
    )}
    {String(p.pagination) === "load-more" && (
      <Field name="按钮文字"><Inp value={String(p.loadMoreText || "加载更多")} onChange={set("loadMoreText")} /></Field>
    )}
  </>;
}

// ─── Block Content Panels (data/media/text settings) ──────────────────────────
function BlockContent({ block, onChange, forms, openMediaPicker }: { block: Block; onChange: (props: Record<string, unknown>) => void; forms?: FormOption[]; openMediaPicker?: (cb: (url: string) => void) => void }) {
  const p = block.props;
  const set = (key: string) => (val: unknown) => onChange({ ...p, [key]: val });

  switch (block.type) {
    case "hero":
      return <>
        <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0 0 14px", lineHeight: 1.6 }}>点击画布上的文字，可直接编辑标题、副标题和按钮文字。</p>
        <Field name="按钮链接"><Inp value={String(p.buttonUrl || "")} onChange={set("buttonUrl")} type="url" placeholder="https://…" /></Field>
      </>;

    case "text":
      return <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0", lineHeight: 1.6 }}>点击画布上的文本即可直接编辑，支持富 HTML。</p>;

    case "image":
      return <>
        <div style={fld}>
          <label style={lbl}>图片</label>
          {!!p.src && <img src={String(p.src)} alt="" style={{ width: "100%", maxHeight: "120px", objectFit: "cover", borderRadius: "3px", marginBottom: "8px", display: "block" }} />}
          <button
            onClick={() => openMediaPicker?.(url => onChange({ ...p, src: url }))}
            style={{ width: "100%", padding: "8px", background: "#2c3338", border: "1px dashed #50575e", borderRadius: "4px", color: "#72aee6", cursor: "pointer", fontSize: "12px", marginBottom: "6px" }}
          >
            {p.src ? "替换图片" : "从媒体库选择"}
          </button>
          <Inp value={String(p.src || "")} onChange={set("src")} type="url" placeholder="或粘贴图片地址…" />
        </div>
        <Field name="替代文本"><Inp value={String(p.alt || "")} onChange={set("alt")} placeholder="描述图片内容" /></Field>
        <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0", lineHeight: 1.6 }}>点击画布上的说明文字可直接编辑。</p>
      </>;

    case "cta":
      return <>
        <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0 0 14px", lineHeight: 1.6 }}>点击画布上的标题、副标题和按钮文字可直接编辑。</p>
        <Field name="按钮链接"><Inp value={String(p.buttonUrl || "")} onChange={set("buttonUrl")} type="url" placeholder="https://…" /></Field>
      </>;

    case "features": {
      const items = (p.items as any[]) || [];
      return <>
        <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0 0 14px", lineHeight: 1.6 }}>点击画布上的图标、标题或文字即可直接编辑。</p>
        <div style={fld}>
          <label style={lbl}>项目（{items.length}）</label>
          <button onClick={() => set("items")([...items, { icon: "★", title: "新特性", text: "特性描述。" }])} style={{ fontSize: "12px", color: "#72aee6", background: "none", border: "1px dashed #50575e", borderRadius: "3px", padding: "7px 12px", cursor: "pointer", width: "100%", marginBottom: "6px" }}>+ 添加项目</button>
          {items.length > 0 && <button onClick={() => set("items")(items.slice(0, -1))} style={{ fontSize: "12px", color: "#f87171", background: "none", border: "1px dashed #4a2222", borderRadius: "3px", padding: "7px 12px", cursor: "pointer", width: "100%" }}>− 删除最后一项</button>}
        </div>
      </>;
    }

    case "columns":
      return <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0", lineHeight: 1.6 }}>点击画布上的任意一栏即可直接编辑 HTML 内容。</p>;

    case "form":
      return <>
        <Field name="选择表单">
          <select style={inp} value={String(p.formId || "")} onChange={e => {
            const f = forms?.find(f => f.id === e.target.value);
            onChange({ ...p, formId: e.target.value, ...(f ? { formTitle: f.title } : {}) });
          }}>
            <option value="">— 请选择表单 —</option>
            {(forms || []).map(f => <option key={f.id} value={f.id}>{f.title}（{f.fieldCount} 个字段）</option>)}
          </select>
        </Field>
        {(forms?.length === 0) && <p style={{ fontSize: "12px", color: "#8c8f94" }}>还没有表单。<a href="/admin/forms/create" target="_blank" style={{ color: "#72aee6" }}>去创建一个 ↗</a></p>}
      </>;

    case "nav":
      return <>
        <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0 0 14px", lineHeight: 1.6 }}>点击画布上的站点名称可直接编辑。导航链接来自「菜单」设置。</p>
        <a href="/admin/menus" target="_blank" style={{ fontSize: "12px", color: "#72aee6" }}>编辑菜单 ↗</a>
      </>;

    case "site-title":
      return <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0", lineHeight: 1.6 }}>站点名称与副标题来自「常规设置」。</p>;

    case "spacer":
      return <Field name="高度（像素）">
        <input type="number" style={inp} value={Number(p.height) || 64} min={8} max={400} step={8} onChange={e => set("height")(Number(e.target.value))} />
        <input type="range" value={Number(p.height) || 64} min={8} max={400} step={8} onChange={e => set("height")(Number(e.target.value))} style={{ width: "100%", marginTop: "6px", accentColor: "#72aee6" }} />
      </Field>;

    case "html":
      return <Field name="HTML 内容"><textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5, fontFamily: "monospace" }} rows={12} value={String(p.content || "")} onChange={e => set("content")(e.target.value)} placeholder="<div>自定义 HTML…</div>" /></Field>;

    case "ai": {
      const set2 = (key: string) => (val: unknown) => onChange({ ...p, [key]: val });
      return <>
        <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0 0 12px", lineHeight: 1.6 }}>输入提示词后，在画布上点击「生成」，AI 会用最匹配的区块替换此占位内容。</p>
        <Field name="提示词"><textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} rows={4} value={String(p.prompt || "")} onChange={e => set2("prompt")(e.target.value)} placeholder="例如：三档定价表" /></Field>
      </>;
    }

    case "query-loop":
      return <QueryLoopContent p={p} set={set} />;

    case "loop-image":
      return <>
        <Field name="图片高度（像素）">
          <input type="number" style={inp} value={Number(p.height) || 220} min={80} max={600} step={20} onChange={e => set("height")(Number(e.target.value))} />
        </Field>
        <Field name="填充方式">
          <Sel value={String(p.objectFit || "cover")} onChange={set("objectFit")} options={[{ value: "cover", label: "覆盖（裁剪）" }, { value: "contain", label: "适应" }, { value: "fill", label: "拉伸" }]} />
        </Field>
      </>;
    case "loop-title":
      return <>
        <Field name="HTML 标签">
          <Sel value={String(p.tag || "h3")} onChange={set("tag")} options={[{ value: "h2", label: "H2" }, { value: "h3", label: "H3" }, { value: "h4", label: "H4" }, { value: "p", label: "p" }]} />
        </Field>
        <Field name="字号"><Inp value={String(p.size || "1.05rem")} onChange={set("size")} placeholder="1.05rem" /></Field>
        <Field name="字重">
          <Sel value={String(p.weight || "700")} onChange={set("weight")} options={[{ value: "400", label: "常规" }, { value: "600", label: "半粗" }, { value: "700", label: "加粗" }, { value: "800", label: "特粗" }]} />
        </Field>
      </>;
    case "loop-excerpt":
      return <>
        <Field name="最大字符数">
          <input type="number" style={inp} value={Number(p.length) || 120} min={20} max={500} step={10} onChange={e => set("length")(Number(e.target.value))} />
        </Field>
        <Field name="字号"><Inp value={String(p.size || "0.9rem")} onChange={set("size")} placeholder="0.9rem" /></Field>
      </>;
    case "loop-date":
      return <>
        <Field name="日期格式">
          <Sel value={String(p.format || "long")} onChange={set("format")} options={[{ value: "long", label: "长（2025年1月15日）" }, { value: "short", label: "短（2025/1/15）" }, { value: "relative", label: "相对（2 天前）" }, { value: "iso", label: "ISO（2025-01-15）" }]} />
        </Field>
        <Field name="字号"><Inp value={String(p.size || "11px")} onChange={set("size")} placeholder="11px" /></Field>
      </>;
    case "loop-author":
      return <>
        <Field name="前缀"><Inp value={String(p.prefix || "作者：")} onChange={set("prefix")} placeholder="作者：" /></Field>
        <Field name="字号"><Inp value={String(p.size || "11px")} onChange={set("size")} placeholder="11px" /></Field>
      </>;
    case "loop-category":
      return <>
        <div style={fld}><label style={{ ...lbl, marginBottom: "8px" }}>显示为徽标</label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" checked={!!p.badge} onChange={e => set("badge")(e.target.checked)} style={{ accentColor: "#72aee6" }} />
            <span style={{ fontSize: "12px", color: "#a7aaad" }}>胶囊/徽标样式</span>
          </label>
        </div>
        <Field name="字号"><Inp value={String(p.size || "10px")} onChange={set("size")} placeholder="10px" /></Field>
      </>;
    case "loop-read-more":
      return <>
        <Field name="按钮文字"><Inp value={String(p.text || "阅读全文 →")} onChange={set("text")} placeholder="阅读全文 →" /></Field>
        <Field name="样式">
          <Sel value={String(p.buttonStyle || "link")} onChange={set("buttonStyle")} options={[{ value: "link", label: "文字链接" }, { value: "button", label: "按钮" }, { value: "outline", label: "描边按钮" }]} />
        </Field>
      </>;
    case "loop-custom-field":
      return <>
        <Field name="字段键名（field_key）"><Inp value={String(p.fieldKey || "")} onChange={set("fieldKey")} placeholder="例如 price、rating、sku" /></Field>
        <Field name="标签文字"><Inp value={String(p.label || "")} onChange={set("label")} placeholder="例如：价格" /></Field>
        <div style={fld}><label style={{ ...lbl, marginBottom: "8px" }}>显示标签</label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" checked={p.showLabel !== false} onChange={e => set("showLabel")(e.target.checked)} style={{ accentColor: "#72aee6" }} />
            <span style={{ fontSize: "12px", color: "#a7aaad" }}>在数值上方显示标签</span>
          </label>
        </div>
        <Field name="为空时的兜底内容"><Inp value={String(p.fallback || "")} onChange={set("fallback")} placeholder="—" /></Field>
      </>;

    default:
      return <p style={{ color: "#8c8f94", fontSize: "12px" }}>该区块没有内容设置。</p>;
  }
}

// ─── Block Style Panels (visual/layout settings) ──────────────────────────────
function BlockStyle({ block, onChange, tokens }: { block: Block; onChange: (props: Record<string, unknown>) => void; tokens: ThemeTokens }) {
  const p = block.props;
  const set = (key: string) => (val: unknown) => onChange({ ...p, [key]: val });

  switch (block.type) {
    case "hero":
      return <>
        <ColorField name="背景色" value={String(p.bgColor || "#1a1a2e")} onChange={set("bgColor")} />
        <ColorField name="文字颜色" value={String(p.textColor || "#ffffff")} onChange={set("textColor")} />
        <Field name="文字对齐"><Sel value={String(p.align || "center")} onChange={set("align")} options={alignOpts} /></Field>
        <Field name="最小高度（像素）"><input type="number" style={inp} value={Number(p.height) || 480} min={200} max={900} step={20} onChange={e => set("height")(Number(e.target.value))} /></Field>
      </>;

    case "text":
      return <Field name="对齐方式"><Sel value={String(p.align || "left")} onChange={set("align")} options={alignOpts} /></Field>;

    case "image":
      return <>
        <Field name="对齐方式"><Sel value={String(p.align || "center")} onChange={set("align")} options={alignOpts} /></Field>
        <Field name="宽度"><Sel value={String(p.width || "normal")} onChange={set("width")} options={[{ value: "normal", label: "常规（640px）" }, { value: "wide", label: "较宽（900px）" }, { value: "full", label: "100% 全宽" }]} /></Field>
      </>;

    case "cta":
      return <>
        <ColorField name="背景色" value={String(p.bgColor || "#2271b1")} onChange={set("bgColor")} />
        <ColorField name="文字颜色" value={String(p.textColor || "#ffffff")} onChange={set("textColor")} />
      </>;

    case "features":
      return <Field name="列数"><Sel value={String(p.cols || "3")} onChange={v => set("cols")(Number(v))} options={[{ value: "2", label: "2 列" }, { value: "3", label: "3 列" }, { value: "4", label: "4 列" }]} /></Field>;

    case "columns":
      return <Field name="栏间距"><Inp value={String(p.gap || "2rem")} onChange={set("gap")} placeholder="2rem" /></Field>;

    case "nav":
      return <Field name="链接对齐"><Sel value={String(p.align || "right")} onChange={set("align")} options={[{ value: "left", label: "居左" }, { value: "right", label: "居右" }]} /></Field>;

    case "site-title":
      return <>
        <Field name="尺寸"><Sel value={String(p.size || "medium")} onChange={set("size")} options={[{ value: "small", label: "小" }, { value: "medium", label: "中" }, { value: "large", label: "大" }]} /></Field>
        <Field name="对齐方式"><Sel value={String(p.align || "left")} onChange={set("align")} options={alignOpts} /></Field>
        <div style={fld}><label style={{ ...lbl, marginBottom: "8px" }}>显示副标题</label><label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}><input type="checkbox" checked={!!p.showTagline} onChange={e => set("showTagline")(e.target.checked)} style={{ accentColor: "#72aee6" }} /><span style={{ fontSize: "12px", color: "#a7aaad" }}>在名称下方显示站点副标题</span></label></div>
      </>;

    case "divider":
      return <>
        <Field name="线条样式"><Sel value={String(p.style || "solid")} onChange={set("style")} options={[{ value: "solid", label: "实线" }, { value: "dashed", label: "虚线" }, { value: "dotted", label: "点线" }]} /></Field>
        <ColorField name="颜色" value={String(p.color || "#e2e8f0")} onChange={set("color")} />
        <Field name="粗细（像素）"><input type="number" style={inp} value={Number(p.thickness) || 1} min={1} max={16} onChange={e => set("thickness")(Number(e.target.value))} /></Field>
      </>;

    case "query-loop":
      return <>
        <Field name="列数">
          <Sel value={String(p.columns || "3")} onChange={v => set("columns")(Number(v))} options={[{ value: "1", label: "1 列" }, { value: "2", label: "2 列" }, { value: "3", label: "3 列" }, { value: "4", label: "4 列" }]} />
        </Field>
        <Field name="卡片间距"><Inp value={String(p.gap || "24px")} onChange={set("gap")} placeholder="24px" /></Field>
        <ColorField name="卡片背景" value={String(p.cardBg || "#ffffff")} onChange={set("cardBg")} />
        <ColorField name="卡片边框" value={String(p.cardBorder || "#e2e8f0")} onChange={set("cardBorder")} />
        <Field name="卡片圆角"><Inp value={String(p.cardRadius || "8px")} onChange={set("cardRadius")} placeholder="8px" /></Field>
        <Field name="区块内边距"><Inp value={String(p.padding || "5rem 48px")} onChange={set("padding")} placeholder="5rem 48px" /></Field>
      </>;

    case "loop-image":
      return <Field name="圆角"><Inp value={String(p.borderRadius || "0")} onChange={set("borderRadius")} placeholder="0" /></Field>;
    case "loop-title":
      return <ColorField name="颜色（留空使用主题默认色）" value={String(p.color || tokens.colors.text)} onChange={set("color")} />;
    case "loop-excerpt":
      return <ColorField name="文字颜色" value={String(p.color || tokens.colors.textMuted)} onChange={set("color")} />;
    case "loop-date":
      return <ColorField name="文字颜色" value={String(p.color || tokens.colors.textMuted)} onChange={set("color")} />;
    case "loop-author":
      return <ColorField name="文字颜色" value={String(p.color || tokens.colors.textMuted)} onChange={set("color")} />;
    case "loop-category":
      return <ColorField name="颜色" value={String(p.color || tokens.colors.primary)} onChange={set("color")} />;
    case "loop-read-more":
      return <>
        <ColorField name="文字/按钮颜色" value={String(p.color || tokens.colors.primary)} onChange={set("color")} />
        {String(p.buttonStyle) !== "link" && <Field name="字号"><Inp value={String(p.size || "13px")} onChange={set("size")} /></Field>}
      </>;
    case "loop-custom-field":
      return <>
        <Field name="字号"><Inp value={String(p.size || "13px")} onChange={set("size")} placeholder="13px" /></Field>
        <ColorField name="文字颜色" value={String(p.color || tokens.colors.text)} onChange={set("color")} />
        <ColorField name="标签颜色" value={String(p.labelColor || tokens.colors.textMuted)} onChange={set("labelColor")} />
      </>;

    default:
      return <p style={{ color: "#8c8f94", fontSize: "12px" }}>该区块没有样式设置。</p>;
  }
}

// ─── Block Advanced Panel ──────────────────────────────────────────────────────
function BlockAdvanced({ block, onChange }: { block: Block; onChange: (props: Record<string, unknown>) => void }) {
  const p = block.props;
  const set = (key: string) => (val: unknown) => onChange({ ...p, [key]: val });
  const extensions = getBlockPanelExtensions(block.type);

  return (
    <>
      <Field name="CSS 类">
        <Inp value={String(p._cssClass || "")} onChange={set("_cssClass")} placeholder="my-class another-class" />
      </Field>
      <Field name="HTML 元素">
        <Sel value={String(p._element || "section")} onChange={set("_element")} options={[
          { value: "section", label: "section" },
          { value: "div", label: "div" },
          { value: "article", label: "article" },
          { value: "aside", label: "aside" },
          { value: "header", label: "header" },
          { value: "footer", label: "footer" },
          { value: "main", label: "main" },
        ]} />
      </Field>
      <Field name="入场动画">
        <Sel value={String(p._animation || "none")} onChange={set("_animation")} options={[
          { value: "none", label: "无" },
          { value: "ap-fade-in", label: "淡入" },
          { value: "ap-slide-up", label: "上滑" },
          { value: "ap-slide-left", label: "左侧滑入" },
          { value: "ap-slide-right", label: "右侧滑入" },
          { value: "ap-zoom-in", label: "放大进入" },
        ]} />
      </Field>
      <div style={fld}>
        <label style={lbl}>自定义 CSS</label>
        <textarea
          style={{ ...inp, fontFamily: "monospace", fontSize: "11px", resize: "vertical", lineHeight: 1.5 }}
          rows={8}
          value={String(p._customCss || "")}
          onChange={e => set("_customCss")(e.target.value)}
          placeholder={`.ap-block {\n  /* your styles */\n}`}
        />
        <div style={{ fontSize: "10px", color: "#646970", marginTop: "4px" }}>通过带作用域的 &lt;style&gt; 标签应用到此区块。</div>
      </div>
      {extensions.length > 0 && extensions.map(ext => (
        <div key={ext.id}>
          <div style={{ fontWeight: 700, fontSize: "11px", color: "#8c8f94", textTransform: "uppercase", letterSpacing: "0.5px", margin: "16px 0 10px", borderTop: "1px solid #3c434a", paddingTop: "12px" }}>{ext.label}</div>
          {ext.render(block, onChange)}
        </div>
      ))}
    </>
  );
}

// ─── Global Theme Panel ────────────────────────────────────────────────────────
function ThemePanel({ tokens, onChange }: { tokens: ThemeTokens; onChange: (t: ThemeTokens) => void }) {
  const setColor = (key: keyof ThemeTokens["colors"]) => (val: string) => onChange({ ...tokens, colors: { ...tokens.colors, [key]: val } });
  const setFont = (key: keyof ThemeTokens["fonts"]) => (val: string) => onChange({ ...tokens, fonts: { ...tokens.fonts, [key]: val } });
  const setSpacing = (key: keyof ThemeTokens["spacing"]) => (val: string) => onChange({ ...tokens, spacing: { ...tokens.spacing, [key]: val } });
  const colorLabels: Record<keyof ThemeTokens["colors"], string> = { primary: "主色", secondary: "辅色", background: "背景", surface: "表面", text: "正文文字", textMuted: "弱化文字", border: "边框" };
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: "11px", color: "#8c8f94", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>颜色</div>
      {(Object.keys(tokens.colors) as (keyof ThemeTokens["colors"])[]).map(key => (
        <ColorField key={key} name={colorLabels[key]} value={tokens.colors[key]} onChange={setColor(key)} />
      ))}
      <div style={{ fontWeight: 700, fontSize: "11px", color: "#8c8f94", textTransform: "uppercase", letterSpacing: "0.5px", margin: "20px 0 12px" }}>字体排版</div>
      <Field name="标题字体"><Inp value={tokens.fonts.heading} onChange={setFont("heading")} placeholder="Georgia, serif" /></Field>
      <Field name="正文字体"><Inp value={tokens.fonts.body} onChange={setFont("body")} placeholder="system-ui, sans-serif" /></Field>
      <div style={{ fontWeight: 700, fontSize: "11px", color: "#8c8f94", textTransform: "uppercase", letterSpacing: "0.5px", margin: "20px 0 12px" }}>间距</div>
      <Field name="区块纵向内边距"><Inp value={tokens.spacing.sectionY} onChange={setSpacing("sectionY")} /></Field>
      <Field name="最大宽度"><Inp value={tokens.spacing.containerMax} onChange={setSpacing("containerMax")} /></Field>
      <Field name="圆角"><Inp value={tokens.spacing.borderRadius} onChange={setSpacing("borderRadius")} /></Field>
    </div>
  );
}

// ─── Conditions Panel ─────────────────────────────────────────────────────────
const RULES_WITH_VALUE: ConditionRule[] = ["post_type", "singular", "archive_type"];

function ConditionsPanel({ templateId, conditions, onChange }: {
  templateId: string;
  conditions: DisplayCondition[];
  onChange: (c: DisplayCondition[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [postTypes, setPostTypes] = useState<{ key: string; label: string }[]>([]);
  const [taxonomies, setTaxonomies] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/post-types").then(r => r.json()).then((data: any) => {
      const builtIn = [
        { key: "post", label: "文章" },
        { key: "page", label: "页面" },
      ];
      const arr: any[] = Array.isArray(data) ? data : [];
      const custom = arr.map((pt: any) => ({ key: pt.key ?? pt.slug, label: pt.label ?? pt.key ?? pt.slug }));
      setPostTypes([...builtIn, ...custom]);
    }).catch(() => {});

    fetch("/api/taxonomies").then(r => r.json()).then((data: any) => {
      const builtIn = [
        { key: "category", label: "分类" },
        { key: "post_tag", label: "标签" },
      ];
      const arr: any[] = Array.isArray(data) ? data : [];
      const custom = arr.map((tx: any) => ({ key: tx.key ?? tx.slug, label: tx.label ?? tx.key ?? tx.slug }));
      setTaxonomies([...builtIn, ...custom]);
    }).catch(() => {});
  }, []);

  const addCondition = () => onChange([...conditions, { rule: "entire_site" as ConditionRule }]);
  const removeCondition = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));
  const updateRule = (i: number, rule: ConditionRule) => {
    const next = [...conditions];
    next[i] = { rule, value: RULES_WITH_VALUE.includes(rule) ? (next[i].value ?? "") : undefined };
    onChange(next);
  };
  const updateValue = (i: number, value: string) => {
    const next = [...conditions];
    next[i] = { ...next[i], value };
    onChange(next);
  };

  const saveConditions = async () => {
    setSaving(true);
    try {
      await fetch(`/api/themes/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const renderValueField = (cond: DisplayCondition, i: number) => {
    if (cond.rule === "post_type") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <label style={lbl}>文章类型</label>
          <select style={inp} value={cond.value ?? ""} onChange={e => updateValue(i, e.target.value)}>
            <option value="">— 请选择 —</option>
            {postTypes.map(pt => <option key={pt.key} value={pt.key}>{pt.label}</option>)}
          </select>
        </div>
      );
    }
    if (cond.rule === "archive_type") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <label style={lbl}>分类法</label>
          <select style={inp} value={cond.value ?? ""} onChange={e => updateValue(i, e.target.value)}>
            <option value="">— 请选择 —</option>
            {taxonomies.map(tx => <option key={tx.key} value={tx.key}>{tx.label}</option>)}
          </select>
        </div>
      );
    }
    // singular — free text slug
    return (
      <div style={{ marginBottom: "6px" }}>
        <label style={lbl}>固定链接别名（Slug）</label>
        <input style={inp} type="text" value={cond.value ?? ""} onChange={e => updateValue(i, e.target.value)} placeholder="例如 about、contact" />
      </div>
    );
  };

  return (
    <div>
      <div style={{ fontSize: "11px", color: "#8c8f94", marginBottom: "14px", lineHeight: 1.6 }}>
        控制此模板的显示位置：当<strong style={{ color: "#a7aaad" }}>任意</strong>条件满足时，模板即会显示。
      </div>
      {conditions.length === 0 && (
        <div style={{ color: "#8c8f94", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>暂无条件，模板将不会显示。</div>
      )}
      {conditions.map((cond, i) => (
        <div key={i} style={{ marginBottom: "10px", background: "#1d2327", border: "1px solid #3c434a", borderRadius: "4px", padding: "10px" }}>
          <div style={{ marginBottom: "6px" }}>
            <label style={lbl}>规则</label>
            <select style={inp} value={cond.rule} onChange={e => updateRule(i, e.target.value as ConditionRule)}>
              {(Object.keys(CONDITION_RULE_LABELS) as ConditionRule[]).map(r => (
                <option key={r} value={r}>{CONDITION_RULE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          {RULES_WITH_VALUE.includes(cond.rule) && renderValueField(cond, i)}
          <button onClick={() => removeCondition(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", padding: 0 }}>✕ 移除</button>
        </div>
      ))}
      <button onClick={addCondition} style={{ width: "100%", padding: "8px", background: "transparent", border: "1px dashed #50575e", borderRadius: "4px", color: "#8c8f94", cursor: "pointer", fontSize: "12px", marginBottom: "14px" }}>+ 添加条件</button>
      <button onClick={saveConditions} disabled={saving} style={{ width: "100%", padding: "8px", background: "#2271b1", border: "1px solid #0a4b78", borderRadius: "4px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
        {saving ? "保存中…" : saved ? "已保存 ✓" : "保存显示条件"}
      </button>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
type LeftPanel = "palette" | "block" | "theme" | "conditions";
type BlockTab = "content" | "style" | "advanced";

export default function ThemeEditor({ slug, pageTitle, initialBlocks, initialTokens, forms = [], isTemplate = false, isLoopItem = false, templatePart, templateId, initialConditions = [], siteUrl = "" }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [tokens, setTokens] = useState<ThemeTokens>(initialTokens);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<"before" | "after">("after");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [paletteTab, setPaletteTab] = useState<"elements" | "navigator">("elements");
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("palette");
  const [blockTab, setBlockTab] = useState<BlockTab>("content");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"append" | "replace">("append");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [conditions, setConditions] = useState<DisplayCondition[]>(initialConditions);
  const [mediaPicker, setMediaPicker] = useState<{ onSelect: (url: string) => void } | null>(null);

  const openMediaPicker = useCallback((onSelect: (url: string) => void) => {
    setMediaPicker({ onSelect });
  }, []);

  // ── Library state ───────────────────────────────────────────────────────────
  const [showLibrary, setShowLibrary] = useState(false);
  const [libTab, setLibTab] = useState<"blocks" | "pages" | "my">("blocks");
  const [libSearch, setLibSearch] = useState("");
  const [libCategory, setLibCategory] = useState<LibraryCategory>("All");
  const [libFavsOnly, setLibFavsOnly] = useState(false);
  const [libSortPages, setLibSortPages] = useState<"popular" | "new">("popular");
  const [libFavorites, setLibFavorites] = useState<Set<string>>(new Set());
  const [myTemplates, setMyTemplates] = useState<UserTemplate[]>([]);
  const [myTemplatesLoaded, setMyTemplatesLoaded] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const palette = isLoopItem ? LOOP_PALETTE : isTemplate ? TEMPLATE_PALETTE : CONTENT_PALETTE;
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  const selectBlock = useCallback((id: string) => {
    setSelectedId(id);
    setLeftPanel("block");
    setBlockTab("content");
  }, []);

  const deselectBlock = useCallback(() => {
    setSelectedId(null);
    setLeftPanel("palette");
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const nb: Block = { id: uid(), type, props: { ...BLOCK_DEFAULTS[type] } };
    setBlocks(prev => {
      if (selectedId) {
        const idx = prev.findIndex(b => b.id === selectedId);
        const next = [...prev];
        next.splice(idx + 1, 0, nb);
        return next;
      }
      return [...prev, nb];
    });
    selectBlock(nb.id);
  }, [selectedId, selectBlock]);

  const updateBlock = useCallback((id: string, props: Record<string, unknown>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, props } : b));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    deselectBlock();
  }, [deselectBlock]);

  const moveBlock = useCallback((id: string, dir: "up" | "down") => {
    setBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      if (dir === "up" && i === 0) return prev;
      if (dir === "down" && i === prev.length - 1) return prev;
      const next = [...prev];
      const swap = dir === "up" ? i - 1 : i + 1;
      [next[i], next[swap]] = [next[swap], next[i]];
      return next;
    });
  }, []);

  const replaceBlock = useCallback((id: string, newBlock: Block) => {
    setBlocks(prev => prev.map(b => b.id === id ? newBlock : b));
    setSelectedId(newBlock.id);
    setLeftPanel("block");
  }, []);

  const reorderBlock = useCallback((fromId: string, toId: string, pos: "before" | "after") => {
    setBlocks(prev => {
      const fi = prev.findIndex(b => b.id === fromId);
      const ti = prev.findIndex(b => b.id === toId);
      if (fi === -1 || ti === -1 || fi === ti) return prev;
      const next = [...prev];
      const [moved] = next.splice(fi, 1);
      const insertAt = pos === "before"
        ? (fi < ti ? ti - 1 : ti)
        : (fi < ti ? ti : ti + 1);
      next.splice(Math.max(0, insertAt), 0, moved);
      return next;
    });
  }, []);

  const duplicateBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      const clone = { ...prev[i], id: uid(), props: { ...prev[i].props } };
      const next = [...prev];
      next.splice(i + 1, 0, clone);
      return next;
    });
  }, []);

  // ── Library handlers ────────────────────────────────────────────────────────
  const insertTemplate = useCallback((templateBlocks: Block[]) => {
    const cloned = templateBlocks.map(bl => ({ ...bl, id: uid(), props: { ...bl.props } }));
    setBlocks(prev => {
      if (selectedId) {
        const idx = prev.findIndex(b => b.id === selectedId);
        const next = [...prev];
        next.splice(idx + 1, 0, ...cloned);
        return next;
      }
      return [...prev, ...cloned];
    });
    setShowLibrary(false);
    if (cloned.length > 0) selectBlock(cloned[0].id);
  }, [selectedId, selectBlock]);

  const replaceWithTemplate = useCallback((templateBlocks: Block[]) => {
    if (!confirm("确定要用此模板替换整个页面吗？此操作无法撤销。")) return;
    const cloned = templateBlocks.map(bl => ({ ...bl, id: uid(), props: { ...bl.props } }));
    setBlocks(cloned);
    setShowLibrary(false);
    deselectBlock();
  }, [deselectBlock]);

  const loadMyTemplates = useCallback(async () => {
    if (myTemplatesLoaded) return;
    try {
      const res = await fetch("/api/themes/library");
      const data = await res.json() as any;
      setMyTemplates(data.templates ?? []);
      setMyTemplatesLoaded(true);
    } catch { /* silent */ }
  }, [myTemplatesLoaded]);

  const saveAsMyTemplate = async () => {
    if (!saveTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/themes/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveTemplateName.trim(), blocks }),
      });
      const data = await res.json() as any;
      if (res.ok) {
        setMyTemplates(prev => [...prev, data.template]);
        setSaveTemplateName("");
        setShowSaveForm(false);
      }
    } finally { setSavingTemplate(false); }
  };

  const deleteMyTemplate = async (id: string) => {
    if (!confirm("确定删除此已保存的模板吗？")) return;
    await fetch(`/api/themes/library/${id}`, { method: "DELETE" });
    setMyTemplates(prev => prev.filter(t => t.id !== id));
  };

  const toggleFavorite = useCallback((id: string) => {
    setLibFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("ap_lib_favs", JSON.stringify([...next])); } catch { /* silent */ }
      return next;
    });
  }, []);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ap_lib_favs") || "[]");
      setLibFavorites(new Set(saved));
    } catch { /* silent */ }
  }, []);

  // Delete selected block on Delete / Backspace key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteBlock(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteBlock]);

  const filteredLibBlocks = useMemo(() => {
    let items = LIBRARY_BLOCKS;
    if (libCategory !== "All") items = items.filter(t => t.category === libCategory);
    if (libFavsOnly) items = items.filter(t => libFavorites.has(t.id));
    if (libSearch) {
      const q = libSearch.toLowerCase();
      items = items.filter(t => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || (LIB_CATEGORY_LABELS[t.category] ?? "").includes(q));
    }
    return items;
  }, [libCategory, libFavsOnly, libSearch, libFavorites]);

  const filteredLibPages = useMemo(() => {
    let items = [...LIBRARY_PAGES];
    if (libFavsOnly) items = items.filter(t => libFavorites.has(t.id));
    if (libSearch) {
      const q = libSearch.toLowerCase();
      items = items.filter(t => t.name.toLowerCase().includes(q) || t.industry.toLowerCase().includes(q));
    }
    if (libSortPages === "popular") items.sort((a, b) => b.popularity - a.popularity);
    return items;
  }, [libFavsOnly, libSearch, libSortPages, libFavorites]);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch(`/api/page-schema/${encodeURIComponent(slug)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: 1, blocks }),
        }),
        fetch("/api/themes/config", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokens),
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setAiError(false);
    try {
      const res = await fetch("/api/ai/generate-blocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, currentBlocks: aiMode === "append" ? blocks : [] }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) { setAiError(true); return; }
      setBlocks(aiMode === "replace" ? data.blocks : [...blocks, ...data.blocks]);
      setAiPrompt(""); setShowAI(false);
    } catch { setAiError(true); }
    finally { setGenerating(false); }
  };

  const canvasWidth = device === "desktop" ? "100%" : device === "tablet" ? "768px" : "390px";
  const templateLabel = isTemplate && templatePart
    ? (TEMPLATE_TYPE_LABELS[templatePart] ?? templatePart) + " 模板"
    : pageTitle;

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    root: { display: "flex", flexDirection: "column" as const, height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: "13px", background: "#1d2327", color: "#e0e0e0" },
    toolbar: { height: "52px", background: "#1d2327", borderBottom: "1px solid #3c434a", display: "flex", alignItems: "center", padding: "0 16px", gap: "10px", flexShrink: 0, zIndex: 10 },
    body: { flex: 1, display: "flex", overflow: "hidden" },
    left: { width: "300px", background: "#2c3338", borderRight: "1px solid #3c434a", display: "flex", flexDirection: "column" as const, flexShrink: 0 },
    canvas: { flex: 1, background: "#111", overflow: "auto", display: "flex", justifyContent: "center", padding: "24px" },
    tab: (active: boolean): React.CSSProperties => ({ flex: 1, padding: "10px 0", textAlign: "center", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: active ? "#72aee6" : "#a7aaad", background: "none", border: "none", borderBottom: `2px solid ${active ? "#72aee6" : "transparent"}` }),
    panelBody: { flex: 1, overflow: "auto", padding: "16px" } as React.CSSProperties,
    btn: (primary = false): React.CSSProperties => ({ height: "30px", padding: "0 14px", borderRadius: "3px", border: primary ? "1px solid #0a4b78" : "1px solid #50575e", background: primary ? "#2271b1" : "#3c434a", color: primary ? "#fff" : "#e0e0e0", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const }),
    devBtn: (active: boolean): React.CSSProperties => ({ padding: "5px 12px", borderRadius: "3px", border: "none", background: active ? "#50575e" : "transparent", color: active ? "#fff" : "#a7aaad", cursor: "pointer", fontSize: "12px" }),
    backBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderBottom: "1px solid #3c434a", cursor: "pointer", color: "#a7aaad", fontSize: "12px", background: "none", border: "none", width: "100%", textAlign: "left" as const, borderBottom2: "1px solid #3c434a" } as React.CSSProperties,
  };

  // ── Left Panel Content ────────────────────────────────────────────────────
  function renderLeft() {
    // ── Conditions Mode (templates only) ──
    if (leftPanel === "conditions" && isTemplate && templateId) {
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #3c434a", padding: "0" }}>
            <button onClick={() => setLeftPanel("palette")} style={{ ...S.backBtn, padding: "12px 16px", borderBottom: "none", width: "auto", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              返回
            </button>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#e0e0e0", flex: 1, textAlign: "center", paddingRight: "16px" }}>显示条件</span>
          </div>
          <div style={S.panelBody}>
            <ConditionsPanel templateId={templateId} conditions={conditions} onChange={setConditions} />
          </div>
        </>
      );
    }

    // ── Theme Mode ──
    if (leftPanel === "theme") {
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #3c434a", padding: "0" }}>
            <button onClick={() => setLeftPanel("palette")} style={{ ...S.backBtn, padding: "12px 16px", borderBottom: "none", width: "auto", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              返回
            </button>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#e0e0e0", flex: 1, textAlign: "center", paddingRight: "16px" }}>全局样式</span>
          </div>
          <div style={S.panelBody}>
            <ThemePanel tokens={tokens} onChange={setTokens} />
          </div>
        </>
      );
    }

    // ── Block Settings Mode ──
    if (leftPanel === "block" && selectedBlock) {
      const blockLabel = blockTypeLabel(selectedBlock.type);
      return (
        <>
          {/* Block panel header */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #3c434a", flexShrink: 0 }}>
            <button onClick={deselectBlock} style={{ ...S.backBtn, padding: "12px 16px", borderBottom: "none", width: "auto", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              {isLoopItem ? "循环区块" : "元素"}
            </button>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#72aee6", flex: 1, textAlign: "center", paddingRight: "8px", textTransform: "capitalize" }}>{blockLabel}</span>
          </div>

          {/* Content / Style / Advanced tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #3c434a", flexShrink: 0 }}>
            <button style={S.tab(blockTab === "content")} onClick={() => setBlockTab("content")}>内容</button>
            <button style={S.tab(blockTab === "style")} onClick={() => setBlockTab("style")}>样式</button>
            <button style={S.tab(blockTab === "advanced")} onClick={() => setBlockTab("advanced")}>高级</button>
          </div>

          {/* Panel body */}
          <div style={S.panelBody}>
            {blockTab === "content"
              ? <BlockContent block={selectedBlock} onChange={props => updateBlock(selectedBlock.id, props)} forms={forms} openMediaPicker={openMediaPicker} />
              : blockTab === "style"
              ? <BlockStyle block={selectedBlock} onChange={props => updateBlock(selectedBlock.id, props)} tokens={tokens} />
              : <BlockAdvanced block={selectedBlock} onChange={props => updateBlock(selectedBlock.id, props)} />
            }
          </div>

          {/* Custom CSS injection for this block */}
          {selectedBlock.props._customCss && (
            <style dangerouslySetInnerHTML={{ __html: String(selectedBlock.props._customCss) }} />
          )}

          {/* Block actions footer */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #3c434a", display: "flex", gap: "6px", flexShrink: 0 }}>
            <button style={{ ...S.btn(), flex: 1 }} onClick={() => duplicateBlock(selectedBlock.id)}>复制</button>
            <button style={{ ...S.btn(), flex: 1, color: "#f87171", borderColor: "#4a2222" }} onClick={() => deleteBlock(selectedBlock.id)}>删除</button>
          </div>
        </>
      );
    }

    // ── Palette / Navigator Mode (default) ──
    return (
      <>
        <div style={{ display: "flex", borderBottom: "1px solid #3c434a", flexShrink: 0 }}>
          <button style={S.tab(paletteTab === "elements")} onClick={() => setPaletteTab("elements")}>元素</button>
          <button style={S.tab(paletteTab === "navigator")} onClick={() => setPaletteTab("navigator")}>导航</button>
        </div>
        <div style={S.panelBody}>
          {paletteTab === "elements" ? (
            <div>
              <p style={{ fontSize: "11px", color: "#8c8f94", margin: "0 0 10px" }}>点击可插入到所选区块之后</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {palette.map(item => (
                  <button key={item.type} onClick={() => addBlock(item.type)}
                    style={{ textAlign: "left", background: "#1d2327", border: "1px solid #3c434a", borderRadius: "4px", padding: "10px", cursor: "pointer", color: "#e0e0e0" }}>
                    <div style={{ fontWeight: 600, fontSize: "12px", marginBottom: "3px" }}>{item.label}</div>
                    <div style={{ fontSize: "10px", color: "#8c8f94", lineHeight: 1.4 }}>{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {blocks.length === 0 && <p style={{ color: "#8c8f94", fontSize: "12px" }}>暂无区块，请从「元素」中添加。</p>}
              {blocks.map((b, i) => {
                const isNavDragOver = dragOverId === b.id && dragId !== b.id;
                const isNavDragging = dragId === b.id;
                return (
                <div key={b.id}
                  draggable
                  onDragStart={e => { setDragId(b.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  onDragOver={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (!dragId || dragId === b.id) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragOverId(b.id);
                    setDragPos(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
                  }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (dragId && dragId !== b.id) reorderBlock(dragId, b.id, dragPos);
                    setDragId(null); setDragOverId(null);
                  }}
                  onClick={() => selectBlock(b.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", marginBottom: "3px",
                    borderRadius: "4px", cursor: "grab",
                    background: selectedId === b.id ? "#0a4b78" : "transparent",
                    border: `1px solid ${selectedId === b.id ? "#2271b1" : "transparent"}`,
                    opacity: isNavDragging ? 0.35 : 1,
                    boxShadow: isNavDragOver ? (dragPos === "before" ? "inset 0 3px 0 0 #2271b1" : "inset 0 -3px 0 0 #2271b1") : "none",
                  }}>
                  <span style={{ fontSize: "14px", color: "#555d66", cursor: "grab", flexShrink: 0 }}>⠿</span>
                  <span style={{ fontSize: "10px", color: "#646970", width: "16px", textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, flex: 1, color: "#e0e0e0" }}>{blockTypeLabel(b.type)}</span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div style={S.root}>
      {/* Toolbar */}
      <div style={S.toolbar}>
        {isLoopItem ? (
          <a href="/admin/themes/loop-templates" style={{ color: "#a7aaad", textDecoration: "none", fontSize: "12px", marginRight: "4px", flexShrink: 0 }}>← 循环模板</a>
        ) : isTemplate ? (
          <a href="/admin/themes/builder" style={{ color: "#a7aaad", textDecoration: "none", fontSize: "12px", marginRight: "4px", flexShrink: 0 }}>← 构建器</a>
        ) : (
          <a href="/admin/themes" style={{ color: "#a7aaad", textDecoration: "none", fontSize: "12px", marginRight: "4px", flexShrink: 0 }}>← 主题</a>
        )}
        <div style={{ width: "1px", height: "20px", background: "#3c434a", flexShrink: 0 }} />
        {isLoopItem && (
          <span style={{ fontSize: "11px", background: "#0e7490", color: "#fff", padding: "2px 8px", borderRadius: "3px", fontWeight: 600, flexShrink: 0 }}>
            循环模板
          </span>
        )}
        {isTemplate && templatePart && (
          <span style={{ fontSize: "11px", background: "#7c3aed", color: "#fff", padding: "2px 8px", borderRadius: "3px", fontWeight: 600, flexShrink: 0 }}>
            {(TEMPLATE_TYPE_LABELS[templatePart] ?? templatePart).toUpperCase()}
          </span>
        )}
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }}>{templateLabel}</span>
        <div style={{ flex: 1 }} />

        {/* Device switcher */}
        {!isTemplate && (
          <div style={{ display: "flex", background: "#111", borderRadius: "4px", padding: "2px", flexShrink: 0 }}>
            {(["desktop", "tablet", "mobile"] as const).map(d => (
              <button key={d} style={S.devBtn(device === d)} onClick={() => setDevice(d)}>
                {d === "desktop" ? "🖥" : d === "tablet" ? "⬜" : "📱"}
              </button>
            ))}
          </div>
        )}

        {/* Global Style button */}
        {!isTemplate && (
          <button
            style={{ ...S.btn(), background: leftPanel === "theme" ? "#50575e" : "#3c434a", border: leftPanel === "theme" ? "1px solid #72aee6" : "1px solid #50575e", flexShrink: 0 }}
            onClick={() => { setLeftPanel(leftPanel === "theme" ? "palette" : "theme"); setSelectedId(null); }}
          >
            全局样式
          </button>
        )}

        {/* Conditions button (templates with registered ID only) */}
        {isTemplate && templateId && (
          <button
            style={{ ...S.btn(), background: leftPanel === "conditions" ? "#50575e" : "#3c434a", border: leftPanel === "conditions" ? `1px solid #72aee6` : "1px solid #50575e", flexShrink: 0 }}
            onClick={() => { setLeftPanel(leftPanel === "conditions" ? "palette" : "conditions"); setSelectedId(null); }}
          >
            显示条件{conditions.length > 0 ? ` (${conditions.length})` : ""}
          </button>
        )}

        {/* Library */}
        <button
          style={{ ...S.btn(), flexShrink: 0 }}
          onClick={() => { setShowLibrary(true); if (libTab === "my") loadMyTemplates(); }}
        >
          模板库
        </button>

        {/* AI Generate */}
        {!isTemplate && (
          <button style={{ ...S.btn(), background: "#7c3aed", border: "1px solid #6d28d9", color: "#fff", flexShrink: 0 }} onClick={() => setShowAI(true)}>AI 生成</button>
        )}

        {/* Save */}
        <button style={S.btn(true)} onClick={save} disabled={saving}>
          {saving ? "保存中…" : saved ? "已保存 ✓" : "保存"}
        </button>

        {/* Preview */}
        {!isTemplate && (
          <a href={`${siteUrl}/${slug}`} target="_blank" rel="noopener" style={{ ...S.btn(), textDecoration: "none", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>预览 ↗</a>
        )}
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Left Panel — Elementor-style context panel */}
        <div style={S.left}>{renderLeft()}</div>

        {/* Canvas */}
        <div style={S.canvas} onClick={deselectBlock}>
          <div style={{ width: canvasWidth, maxWidth: "100%", background: "#fff", minHeight: "100%", boxShadow: "0 4px 32px rgba(0,0,0,0.4)", transition: "width 0.2s" }}>
            {blocks.length === 0 && (
              <div style={{ padding: "80px 40px", textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px", opacity: 0.3 }}>□</div>
                <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px", color: "#64748b" }}>{isTemplate ? "空模板" : "空白页面"}</div>
                <div style={{ fontSize: "13px" }}>请从<strong>元素</strong>面板添加区块{!isTemplate ? "，或点击 <strong>AI 生成</strong>" : ""}。</div>
              </div>
            )}
            {blocks.map((block, i) => {
              const isSelected = selectedId === block.id;
              const isDragging = dragId === block.id;
              const isDragOver = dragOverId === block.id;
              const isHovered = hoveredBlockId === block.id;
              return (
                <div key={block.id}
                  onMouseEnter={() => setHoveredBlockId(block.id)}
                  onMouseLeave={() => setHoveredBlockId(null)}
                  onDragOver={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (!dragId) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragOverId(block.id);
                    setDragPos(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
                  }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (dragId && dragId !== block.id) reorderBlock(dragId, block.id, dragPos);
                    setDragId(null); setDragOverId(null);
                  }}
                  onClick={e => { e.stopPropagation(); selectBlock(block.id); }}
                  style={{
                    position: "relative",
                    outline: isSelected ? "2px solid #2271b1" : "2px solid transparent",
                    outlineOffset: "-2px",
                    opacity: isDragging ? 0.35 : 1,
                    transition: "outline-color 0.1s, opacity 0.15s",
                    boxShadow: isDragOver
                      ? (dragPos === "before" ? "inset 0 3px 0 0 #2271b1" : "inset 0 -3px 0 0 #2271b1")
                      : "none",
                  }}>

                  {/* Drag handle — visible on hover/select */}
                  <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); setDragId(block.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                    title="拖拽排序"
                    style={{
                      position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                      width: "22px", zIndex: 20, cursor: "grab",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: isSelected || isHovered ? 1 : 0,
                      transition: "opacity 0.15s",
                      color: "#2271b1", fontSize: "15px", userSelect: "none",
                      padding: "10px 3px", lineHeight: 1,
                    }}
                  >⠿</div>

                  {!!block.props._customCss && <style dangerouslySetInnerHTML={{ __html: String(block.props._customCss) }} />}
                  <div className={block.props._cssClass ? String(block.props._cssClass) : undefined}
                    data-animation={block.props._animation && block.props._animation !== "none" ? String(block.props._animation) : undefined}>
                    <BlockPreview block={block} tokens={tokens} forms={forms} isSelected={isSelected}
                      onPropChange={(key, val) => updateBlock(block.id, { ...block.props, [key]: val })}
                      onReplace={newBlock => replaceBlock(block.id, newBlock)}
                    />
                  </div>
                  {isSelected && (
                    <>
                      <div style={{ position: "absolute", top: "8px", left: "28px", background: "#2271b1", color: "#fff", fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "3px", pointerEvents: "none", letterSpacing: "0.3px" }}>
                        {blockTypeLabel(block.type)}
                      </div>
                      <div style={{ position: "absolute", top: "8px", right: "8px", display: "flex", gap: "4px", zIndex: 10 }}>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, "up"); }} style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "#1d2327" }} disabled={i === 0}>▲</button>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, "down"); }} style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "#1d2327" }} disabled={i === blocks.length - 1}>▼</button>
                        <button onClick={e => { e.stopPropagation(); duplicateBlock(block.id); }} style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "#1d2327" }} title="复制">⧉</button>
                        <button onClick={e => { e.stopPropagation(); deleteBlock(block.id); }} style={{ background: "#fff", border: "1px solid #d63638", borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "#d63638" }} title="删除（Del）">✕</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Modal */}
      {showAI && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAI(false)}>
          <div style={{ background: "#2c3338", border: "1px solid #3c434a", borderRadius: "8px", padding: "28px", width: "520px", maxWidth: "90vw", color: "#e0e0e0" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "#fff" }}>AI 页面生成器</h2>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#a7aaad" }}>描述页面布局，AI 会为你生成区块。</p>
            <label style={{ ...lbl, color: "#a7aaad" }}>提示词</label>
            <textarea style={{ ...inp, resize: "vertical", marginBottom: "16px" }} rows={4} placeholder="例如：一个 SaaS 落地页，含深色主视觉、三栏特性和行动号召区" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === "Enter" && e.metaKey && generateWithAI()} />
            <label style={{ ...lbl, color: "#a7aaad" }}>模式</label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              {(["append", "replace"] as const).map(m => (
                <button key={m} onClick={() => setAiMode(m)} style={{ flex: 1, padding: "8px", border: `1px solid ${aiMode === m ? "#7c3aed" : "#3c434a"}`, borderRadius: "4px", background: aiMode === m ? "#4c1d95" : "#1d2327", color: aiMode === m ? "#fff" : "#a7aaad", cursor: "pointer", fontSize: "13px" }}>
                  {m === "append" ? "追加到页面" : "替换页面"}
                </button>
              ))}
            </div>
            {aiError && <div style={{ background: "#4c1313", border: "1px solid #d63638", borderRadius: "4px", padding: "8px 12px", marginBottom: "12px", fontSize: "13px", color: "#fca5a5" }}>生成失败，请检查 AI 设置后重试。</div>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button style={S.btn()} onClick={() => setShowAI(false)}>取消</button>
              <button style={{ ...S.btn(true), background: "#7c3aed", borderColor: "#6d28d9" }} onClick={generateWithAI} disabled={generating || !aiPrompt.trim()}>
                {generating ? "生成中…" : "生成布局"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Library Modal ─────────────────────────────────────────────────── */}
      {showLibrary && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowLibrary(false)}>
          <div style={{ background: "#1d2327", border: "1px solid #3c434a", borderRadius: "10px", width: "min(1020px, 95vw)", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>

            {/* Library header */}
            <div style={{ borderBottom: "1px solid #3c434a", padding: "0 20px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", paddingRight: "8px" }}>模板库</span>
              <div style={{ display: "flex", flex: 1 }}>
                {(["blocks", "pages", "my"] as const).map(t => (
                  <button key={t} onClick={() => { setLibTab(t); if (t === "my") loadMyTemplates(); }} style={{ ...S.tab(libTab === t), flex: "none", padding: "14px 20px", fontSize: "13px", textTransform: "capitalize", letterSpacing: "0.2px" }}>
                    {t === "blocks" ? "区块模板" : t === "pages" ? "页面模板" : "我的模板"}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowLibrary(false)} style={{ background: "none", border: "none", color: "#8c8f94", fontSize: "20px", cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>✕</button>
            </div>

            {/* Filter bar */}
            <div style={{ padding: "10px 20px", borderBottom: "1px solid #3c434a", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, flexWrap: "wrap" as const }}>
              {libTab === "blocks" && (
                <>
                  {/* Category dropdown */}
                  <div style={{ position: "relative" as const, display: "flex", alignItems: "center", gap: "4px", background: "#2c3338", border: "1px solid #3c434a", borderRadius: "4px", padding: "0 8px", height: "32px" }}>
                    <select
                      value={libCategory}
                      onChange={e => setLibCategory(e.target.value as LibraryCategory)}
                      style={{ background: "none", border: "none", color: "#e0e0e0", fontSize: "12px", cursor: "pointer", outline: "none", paddingRight: "4px" }}
                    >
                      {LIBRARY_CATEGORIES.map(c => <option key={c} value={c}>{LIB_CATEGORY_LABELS[c] ?? c}</option>)}
                    </select>
                    {libCategory !== "All" && (
                      <button onClick={() => setLibCategory("All")} style={{ background: "none", border: "none", color: "#8c8f94", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                  {/* Favorites toggle */}
                  <button
                    onClick={() => setLibFavsOnly(v => !v)}
                    style={{ height: "32px", padding: "0 12px", background: libFavsOnly ? "#3c434a" : "none", border: "1px solid #3c434a", borderRadius: "4px", color: libFavsOnly ? "#fff" : "#8c8f94", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <span style={{ color: "#f87171", fontSize: "13px" }}>{libFavsOnly ? "♥" : "♡"}</span> 收藏
                  </button>
                </>
              )}
              {libTab === "pages" && (
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["popular", "new"] as const).map(s => (
                    <button key={s} onClick={() => setLibSortPages(s)} style={{ height: "30px", padding: "0 12px", background: libSortPages === s ? "#2271b1" : "none", border: `1px solid ${libSortPages === s ? "#2271b1" : "#3c434a"}`, borderRadius: "4px", color: libSortPages === s ? "#fff" : "#8c8f94", cursor: "pointer", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>
                      {s === "popular" ? "热门" : "最新"}
                    </button>
                  ))}
                  <button onClick={() => setLibFavsOnly(v => !v)} style={{ height: "30px", padding: "0 12px", background: libFavsOnly ? "#3c434a" : "none", border: "1px solid #3c434a", borderRadius: "4px", color: libFavsOnly ? "#fff" : "#8c8f94", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#f87171" }}>{libFavsOnly ? "♥" : "♡"}</span> 收藏
                  </button>
                </div>
              )}
              {/* Search */}
              <div style={{ marginLeft: "auto", position: "relative" as const, display: "flex", alignItems: "center" }}>
                <input
                  placeholder="搜索…"
                  value={libSearch}
                  onChange={e => setLibSearch(e.target.value)}
                  style={{ ...inp, width: "180px", height: "32px", paddingRight: "28px", background: "#2c3338" }}
                />
                <span style={{ position: "absolute" as const, right: "8px", color: "#8c8f94", fontSize: "13px", pointerEvents: "none" as const }}>⌕</span>
              </div>
            </div>

            {/* Grid content */}
            <div style={{ flex: 1, overflowY: "auto" as const, padding: "20px" }}>
              {/* ── Blocks Tab ── */}
              {libTab === "blocks" && (
                <>
                  {filteredLibBlocks.length === 0 && (
                    <div style={{ textAlign: "center", color: "#8c8f94", padding: "60px 20px", fontSize: "13px" }}>没有符合筛选条件的区块。</div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(216px, 1fr))", gap: "12px" }}>
                    {filteredLibBlocks.map(tmpl => (
                      <LibraryCard
                        key={tmpl.id}

                        name={tmpl.name}
                        badge={tmpl.category}
                        blocks={tmpl.blocks}
                        tokens={tokens}
                        forms={forms}
                        isFav={libFavorites.has(tmpl.id)}
                        onToggleFav={() => toggleFavorite(tmpl.id)}
                        onInsert={() => insertTemplate(tmpl.blocks)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* ── Pages Tab ── */}
              {libTab === "pages" && (
                <>
                  {filteredLibPages.length === 0 && (
                    <div style={{ textAlign: "center", color: "#8c8f94", padding: "60px 20px", fontSize: "13px" }}>没有符合筛选条件的页面。</div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(216px, 1fr))", gap: "12px" }}>
                    {filteredLibPages.map(tmpl => (
                      <LibraryCard
                        key={tmpl.id}

                        name={tmpl.name}
                        badge={tmpl.industry}
                        blocks={tmpl.blocks}
                        tokens={tokens}
                        forms={forms}
                        isFav={libFavorites.has(tmpl.id)}
                        onToggleFav={() => toggleFavorite(tmpl.id)}
                        onInsert={() => insertTemplate(tmpl.blocks)}
                        onReplace={() => replaceWithTemplate(tmpl.blocks)}
                        isPage
                      />
                    ))}
                  </div>
                </>
              )}

              {/* ── My Templates Tab ── */}
              {libTab === "my" && (
                <div>
                  {/* Save current page */}
                  {!showSaveForm ? (
                    <button
                      onClick={() => setShowSaveForm(true)}
                      style={{ width: "100%", padding: "12px", background: "#2271b1", border: "none", borderRadius: "6px", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer", marginBottom: "20px" }}
                    >
                      + 将当前页面保存为模板
                    </button>
                  ) : (
                    <div style={{ background: "#2c3338", border: "1px solid #3c434a", borderRadius: "6px", padding: "16px", marginBottom: "20px" }}>
                      <label style={{ ...lbl, marginBottom: "8px" }}>模板名称</label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          style={{ ...inp, flex: 1 }}
                          value={saveTemplateName}
                          onChange={e => setSaveTemplateName(e.target.value)}
                          placeholder="例如：我的落地页"
                          onKeyDown={e => e.key === "Enter" && saveAsMyTemplate()}
                          autoFocus
                        />
                        <button onClick={saveAsMyTemplate} disabled={savingTemplate || !saveTemplateName.trim()} style={{ ...S.btn(true), flexShrink: 0 }}>
                          {savingTemplate ? "保存中…" : "保存"}
                        </button>
                        <button onClick={() => { setShowSaveForm(false); setSaveTemplateName(""); }} style={{ ...S.btn(), flexShrink: 0 }}>取消</button>
                      </div>
                    </div>
                  )}

                  {myTemplates.length === 0 && !showSaveForm && (
                    <div style={{ textAlign: "center", color: "#8c8f94", padding: "40px 20px", fontSize: "13px" }}>
                      <div style={{ fontSize: "2.5rem", marginBottom: "12px", opacity: 0.3 }}>⊡</div>
                      还没有保存的模板。搭建页面后可保存到此处，方便以后复用。
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(216px, 1fr))", gap: "12px" }}>
                    {myTemplates.map(tmpl => (
                      <LibraryCard
                        key={tmpl.id}

                        name={tmpl.name}
                        badge={new Date(tmpl.createdAt).toLocaleDateString()}
                        blocks={tmpl.blocks}
                        tokens={tokens}
                        forms={forms}
                        isFav={false}
                        onInsert={() => insertTemplate(tmpl.blocks)}
                        onDelete={() => deleteMyTemplate(tmpl.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Picker Modal */}
      {mediaPicker && (
        <MediaPicker
          onSelect={mediaPicker.onSelect}
          onClose={() => setMediaPicker(null)}
        />
      )}
    </div>
  );
}

// ── Library Card ────────────────────────────────────────────────────────────────
function LibraryCard({ name, badge, blocks, tokens, forms, isFav, onToggleFav, onInsert, onReplace, onDelete, isPage = false }: {
  name: string; badge: string; blocks: Block[]; tokens: ThemeTokens; forms: FormOption[];
  isFav?: boolean; onToggleFav?: () => void; onInsert: () => void; onReplace?: () => void;
  onDelete?: () => void; isPage?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ border: `1px solid ${hovered ? "#72aee6" : "#3c434a"}`, borderRadius: "6px", overflow: "hidden", cursor: "pointer", background: "#2c3338", transition: "border-color 0.15s" }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", height: "152px", overflow: "hidden", background: "#fff" }}>
        <div style={{ transform: "scale(0.27)", transformOrigin: "top left", width: "800px", pointerEvents: "none", userSelect: "none" }}>
          {blocks.map((block, i) => (
            <BlockPreview key={i} block={block} tokens={tokens} forms={forms} />
          ))}
        </div>

        {/* Hover overlay */}
        {hovered && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <button
              onClick={e => { e.stopPropagation(); onInsert(); }}
              style={{ padding: "8px 16px", background: "#2271b1", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >
              {isPage ? "追加" : "插入"}
            </button>
            {isPage && onReplace && (
              <button
                onClick={e => { e.stopPropagation(); onReplace(); }}
                style={{ padding: "8px 14px", background: "#3c434a", border: "1px solid #50575e", borderRadius: "4px", color: "#e0e0e0", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                替换
              </button>
            )}
            {onDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                style={{ padding: "8px 10px", background: "rgba(214,54,56,0.15)", border: "1px solid #d63638", borderRadius: "4px", color: "#f87171", fontSize: "12px", cursor: "pointer" }}
                title="删除"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Favorite button */}
        {onToggleFav && (
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(); }}
            style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", color: isFav ? "#f87171" : "#fff", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
          >
            {isFav ? "♥" : "♡"}
          </button>
        )}
      </div>

      {/* Label */}
      <div style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#e0e0e0", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: "10px", color: "#8c8f94" }}>{badge}</div>
      </div>
    </div>
  );
}
