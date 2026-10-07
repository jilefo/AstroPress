import React, { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  appliedActions?: ActionChip[];
  pending?: PendingExecution; // awaiting user confirmation
  /** 长文写作结果（Markdown 全文 + 模式） */
  article?: ArticleResult;
}

interface ArticleResult {
  mode: "write" | "optimize";
  title: string;
  markdown: string;
  /** Markdown 字数（去图片/语法后的纯文本长度） */
  textLength: number;
}

interface PendingExecution {
  serverActions: Action[];
  clientActions: Action[];
  navigateAction: Action | null;
}

interface ActionChip {
  label: string;
  ok: boolean;
}

interface Action {
  type: string;
  [key: string]: any;
}

interface AIWidgetProps {
  pageContext?: Record<string, any>;
}

// Client-side action types — everything else goes to /api/ai/execute
const CLIENT_SIDE = new Set(["setTitle", "setContent", "setExcerpt", "setStatus", "savePost", "navigate"]);

// ─── Session persistence ───────────────────────────────────────────────────────

const SESSION_KEY = "ap_ai_widget";

interface Session {
  messages: Message[];
  open: boolean;
  pendingActions?: Action[];
}

function saveSession(messages: Message[], open: boolean, pendingActions?: Action[]) {
  try {
    const s: Session = { messages, open };
    if (pendingActions?.length) s.pendingActions = pendingActions;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// ─── Action execution ─────────────────────────────────────────────────────────

// ─── AI update animation (Apple Intelligence style) ───────────────────────────

function injectAIStyles() {
  if (document.getElementById("ap-ai-styles")) return;
  const s = document.createElement("style");
  s.id = "ap-ai-styles";
  s.textContent = `
    @keyframes ap-ai-glow {
      0%   { box-shadow: 0 0 0 2.5px rgba(99,102,241,0.95), 0 0 18px rgba(99,102,241,0.45), 0 0 40px rgba(168,85,247,0.25); }
      35%  { box-shadow: 0 0 0 2.5px rgba(168,85,247,0.95), 0 0 22px rgba(168,85,247,0.50), 0 0 50px rgba(236,72,153,0.28); }
      70%  { box-shadow: 0 0 0 2px  rgba(236,72,153,0.80), 0 0 16px rgba(236,72,153,0.35), 0 0 36px rgba(99,102,241,0.20); }
      100% { box-shadow: 0 0 0 0    transparent; }
    }
    @keyframes ap-ai-glow-area {
      0%   { outline: 2.5px solid rgba(99,102,241,0.85);  outline-offset: 3px; }
      35%  { outline: 2.5px solid rgba(168,85,247,0.85);  outline-offset: 4px; }
      70%  { outline: 2px   solid rgba(236,72,153,0.70);  outline-offset: 3px; }
      100% { outline: 2px   solid transparent;             outline-offset: 2px; }
    }
    .ap-ai-flash       { animation: ap-ai-glow      1.8s ease-out forwards !important; border-radius: 4px; }
    .ap-ai-flash-area  { animation: ap-ai-glow-area 1.8s ease-out forwards !important; border-radius: 4px; }
  `;
  document.head.appendChild(s);
}

function flashAIUpdate(el: Element, variant: "glow" | "area" = "glow") {
  injectAIStyles();
  const cls = variant === "area" ? "ap-ai-flash-area" : "ap-ai-flash";
  el.classList.remove("ap-ai-flash", "ap-ai-flash-area");
  void (el as HTMLElement).offsetWidth; // force reflow to restart animation
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 2000);
}

/** Execute a client-side DOM action. Returns label or null if not applicable. */
function executeClientAction(action: Action, persistAndNavigate: (url: string, pending: Action[]) => void): string | null {
  switch (action.type) {
    case "setTitle": {
      const el = document.getElementById("post-title") as HTMLInputElement | null;
      if (el) {
        el.value = action.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        flashAIUpdate(el);
        return `标题已改为「${action.value}」`;
      }
      return null;
    }
    case "setExcerpt": {
      const el = document.getElementById("post-excerpt") as HTMLTextAreaElement | null;
      if (el) {
        el.value = action.value;
        flashAIUpdate(el);
        return "摘要已更新";
      }
      return null;
    }
    case "setContent": {
      window.dispatchEvent(new CustomEvent("ap:setContent", { detail: { html: action.html } }));
      // Flash the editor container after a short delay to let it render
      setTimeout(() => {
        const editor =
          document.querySelector(".ap-wysiwyg-editor") ??
          document.querySelector("[data-ap-editor]") ??
          document.getElementById("post-content-editor");
        if (editor) flashAIUpdate(editor, "area");
      }, 150);
      return "正文已更新";
    }
    case "setStatus": {
      const el = document.getElementById("post-status") as HTMLSelectElement | null;
      if (el) {
        el.value = action.value;
        return `状态已改为 ${action.value}`;
      }
      return null;
    }
    case "savePost": {
      if (typeof (window as any).savePost === "function") {
        setTimeout(() => (window as any).savePost(action.status ?? null), 400);
        return "保存中…";
      }
      return null;
    }
    case "navigate": {
      persistAndNavigate(action.url, []);
      return `正在打开 ${action.url}…`;
    }
    default:
      return null;
  }
}



// ─── Action humanizer ────────────────────────────────────────────────────────

/**
 * 是否属于「长文写作」类请求：写文章/图文/Markdown/指定字数/扩写优化等。
 * 命中后改走 /api/ap-autofill/write（50 字分界、Markdown 强制、纯图片闸门），
 * 不再走动作块聊天协议——避免出现「只回一个图片链接」的问题。
 */
function isWritingRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (/\d{2,5}\s*(?:字|words?)\b/.test(t)) return true;
  if (/(^|[^a-z])markdown([^a-z]|$)|(^|[^a-z])md([^a-z]|$)/.test(t)) return true;
  if (/图文|配图|有图|排版精美|公众号|长文|多图|小红书|放\s*图|视觉|visual|pictorial/.test(t)) return true;
  // 「配/加/插入/生成…插图、封面图、插画、图片、照片」类请求也必须走实图写作链路；
  // 否则落入 /api/ai/chat 动作块协议，模型会编造 https://example.com/xxx.jpg 之类的假图片链接。
  if (
    /(?:配|插入?|添|加|生成|做|画|放|来)[^，。,.?？!！\n]{0,10}(?:封面图|插图|插画|配图|图片|照片)|(?:封面图|插图|插画|配图|图片|照片)[^，。,.?？!！\n]{0,6}(?:配|插入?|添|加|生成|做|画)/.test(t)
  ) return true;
  if (/写\s*(一篇|篇文章|文章|稿|教程|博客|博文)|生成\s*(一篇|文章)/.test(t)) return true;
  if (/write\s+(?:a\s+)?(?:\d+\s*[-—]?\s*words?\s+)?(?:article|post|essay|blog)/.test(t)) return true;
  // 英文配图请求：add/insert/include/with … illustration/image/photo/picture/cover
  if (/(?:add|insert|generate|create|include|with|put)[^.\n]{0,15}(?:illustrations?|images?|photos?|pictures?|cover)/.test(t)) return true;
  if (/扩写|扩充|续写|润色|改写|根据.{0,12}(内容|文章|正文)/.test(t)) return true;
  if (/优化.{0,6}(至\s*\d|文章|正文|内容|篇幅)/.test(t)) return true;
  return false;
}

/** 长文结果卡片：模式徽标 + 复制 Markdown + 折叠查看全文 */
function ArticleCard({ article }: { article: ArticleResult }) {
  const [copied, setCopied] = useState(false);
  const [openMd, setOpenMd] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(article.markdown);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = article.markdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const imgCount = (article.markdown.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  return (
    <div style={{
      border: "1px solid #c7d2fe", borderRadius: 8, background: "#fff",
      overflow: "hidden", fontSize: 12,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        padding: "8px 10px", background: "#eef2ff",
        borderBottom: openMd ? "1px solid #e0e7ff" : "none",
      }}>
        <span style={{
          background: article.mode === "optimize" ? "#f59e0b" : "#6366f1",
          color: "#fff", borderRadius: 3, padding: "1px 7px",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.03em",
        }}>
          {article.mode === "optimize" ? "原文优化" : "全新写作"}
        </span>
        <span style={{ color: "#4f46e5", fontWeight: 600 }}>
          {article.textLength} 字{imgCount > 0 ? ` · ${imgCount} 张配图` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={copy} style={{
          height: 24, padding: "0 10px", fontSize: 11, fontFamily: "inherit",
          background: copied ? "#00a32a" : "#fff", color: copied ? "#fff" : "#4f46e5",
          border: "1px solid " + (copied ? "#007a1f" : "#a5b4fc"),
          borderRadius: 3, cursor: "pointer", fontWeight: 600,
        }}>
          {copied ? "已复制" : "复制 Markdown"}
        </button>
        <button onClick={() => setOpenMd(v => !v)} style={{
          height: 24, padding: "0 10px", fontSize: 11, fontFamily: "inherit",
          background: "#fff", color: "#4f46e5",
          border: "1px solid #a5b4fc", borderRadius: 3, cursor: "pointer",
        }}>
          {openMd ? "收起全文" : "查看全文"}
        </button>
      </div>
      {openMd && (
        <pre style={{
          margin: 0, padding: "10px 12px", maxHeight: 320, overflow: "auto",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          fontSize: 11, lineHeight: 1.6, color: "#1d2327",
          background: "#fafafa", fontFamily: "ui-monospace, Consolas, monospace",
        }}>
          {article.markdown}
        </pre>
      )}
    </div>
  );
}

function humanizeAction(action: Action): string {
  switch (action.type) {
    case "createPost":       return `新建${action.postType === "page" ? "页面" : "文章"}：「${action.title ?? "无标题"}」`;
    case "updatePost":       return `更新文章 #${action.id}`;
    case "deletePost":       return `删除文章 #${action.id}`;
    case "createPostType":   return `注册文章类型：${action.name ?? action.key}`;
    case "createTaxonomy":   return `注册分类法：${action.name ?? action.key}`;
    case "createForm":       return `新建表单：「${action.name ?? "新表单"}」`;
    case "updateForm":       return `更新表单 #${action.id}`;
    case "createFieldGroup": return `新建字段组：「${action.title ?? "新字段组"}」`;
    case "updateSettings":   return `更新站点设置：${Object.keys(action.settings ?? {}).join("、")}`;
    case "setTitle":         return `设置标题：「${action.value}」`;
    case "setContent":       return "更新文章正文";
    case "setExcerpt":       return `设置摘要`;
    case "setStatus":        return `设置状态：${action.value}`;
    case "savePost":         return "保存文章";
    case "navigate":         return `跳转到 ${action.url}`;
    default:                 return action.type;
  }
}

// ─── Quick prompts ────────────────────────────────────────────────────────────

const QUICK_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  post: [
    { label: "写开头", prompt: "为这篇文章写一段吸引人的开头，并设置为正文。" },
    { label: "生成标题", prompt: "为这篇文章生成一个有吸引力的标题并更新。" },
    { label: "写摘要", prompt: "为这篇文章写一段简洁的摘要。" },
    { label: "完整草稿", prompt: "根据当前标题写一篇完整草稿并设置为正文。" },
    { label: "发布", prompt: "发布这篇文章。" },
  ],
  dashboard: [
    { label: "新建文章", prompt: "新建一篇草稿文章，起一个好标题并写好开头。" },
    { label: "新建页面", prompt: "新建一个草稿页面。" },
    { label: "创建联系表单", prompt: "创建一个包含姓名、邮箱、留言字段的联系表单。" },
    { label: "你能做什么？", prompt: "在这个 CMS 里你能做哪些事情？" },
  ],
  settings: [
    { label: "修改站点标题", prompt: "把站点标题修改为 " },
    { label: "修改副标题", prompt: "把站点副标题修改为 " },
  ],
  default: [
    { label: "新建文章", prompt: "新建一篇草稿文章。" },
    { label: "新建页面", prompt: "新建一个草稿页面。" },
    { label: "新建表单", prompt: "创建一个包含姓名、邮箱、留言字段的联系表单。" },
    { label: "新建文章类型", prompt: "创建一个自定义文章类型，名称为 " },
    { label: "你能做什么？", prompt: "在这个 CMS 里你能做哪些事情？" },
  ],
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const SparkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  // Split into lines, process each
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, li) => {
    // Parse inline tokens: **bold**, *italic*, `code`
    const parts: React.ReactNode[] = [];
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      if (match.index > last) parts.push(line.slice(last, match.index));
      if (match[2] !== undefined) parts.push(<strong key={match.index}>{match[2]}</strong>);
      else if (match[3] !== undefined) parts.push(<em key={match.index}>{match[3]}</em>);
      else if (match[4] !== undefined) parts.push(
        <code key={match.index} style={{ background: "#e8e8e8", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em", fontFamily: "monospace" }}>{match[4]}</code>
      );
      last = match.index + match[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));

    nodes.push(<span key={li}>{parts}</span>);
    if (li < lines.length - 1) nodes.push(<br key={`br-${li}`} />);
  });

  return nodes;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AIWidget({ pageContext = {} }: AIWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveChips, setLiveChips] = useState<ActionChip[]>([]);
  const [error, setError] = useState("");
  const [resumed, setResumed] = useState(false);
  const [confirmBeforeAction, setConfirmBeforeAction] = useState(true);
  const panelOpenRef = useRef(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const pageType =
    path.includes("/posts/") || path.includes("/pages/") || path.includes("/cpt/") ? "post"
    : path.includes("/dashboard") ? "dashboard"
    : path.includes("/settings") ? "settings"
    : "default";

  const quickPrompts = QUICK_PROMPTS[pageType] ?? QUICK_PROMPTS.default;

  // Load confirmation preference
  useEffect(() => {
    fetch("/api/ai/settings")
      .then(r => r.json() as any)
      .then(d => { setConfirmBeforeAction(d.confirmBeforeAction !== false); })
      .catch(() => {});
  }, []);

  // Restore session + execute pending actions
  useEffect(() => {
    const session = loadSession();
    if (session) {
      if (session.messages?.length) setMessages(session.messages);
      if (session.open) setOpen(true);

      if (session.pendingActions?.length) {
        const pending = session.pendingActions;
        saveSession(session.messages ?? [], session.open ?? false);

        const hasContent = pending.some((a) => a.type === "setContent");

        const runPending = () => {
          const chips: ActionChip[] = [];
          for (const action of pending) {
            const label = executeClientAction(action, () => {});
            if (label) chips.push({ label, ok: true });
          }
          if (chips.length && session.messages?.length) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  appliedActions: [...(last.appliedActions ?? []), ...chips],
                };
              }
              return updated;
            });
          }
        };

        if (hasContent) {
          let fired = false;
          const onReady = () => {
            if (fired) return;
            fired = true;
            window.removeEventListener("ap:editorReady", onReady);
            setTimeout(runPending, 100);
          };
          window.addEventListener("ap:editorReady", onReady);
          setTimeout(() => { if (!fired) { fired = true; window.removeEventListener("ap:editorReady", onReady); runPending(); } }, 4000);
        } else {
          const tryApply = (attempts: number) => {
            if (document.getElementById("post-title") || attempts >= 10) runPending();
            else setTimeout(() => tryApply(attempts + 1), 300);
          };
          setTimeout(() => tryApply(0), 300);
        }
      }
    }
    setResumed(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!resumed) return;
    saveSession(messages, open);
  }, [messages, open, resumed]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && open) setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Scroll to bottom — instant when panel opens, smooth only for new messages while already open
  useEffect(() => {
    if (!open) {
      panelOpenRef.current = false;
      return;
    }
    const behavior = panelOpenRef.current ? "smooth" : "instant";
    panelOpenRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior });
  }, [open, messages]);

  // Focus input
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const persistAndNavigate = useCallback((url: string, pending: Action[] = []) => {
    saveSession(messages, true, pending);
    setTimeout(() => { window.location.href = url; }, 300);
  }, [messages]);

  const buildContext = useCallback((): Record<string, any> => {
    const ctx: Record<string, any> = { currentPage: path, ...pageContext };
    const titleEl = document.getElementById("post-title") as HTMLInputElement | null;
    if (titleEl?.value) ctx.postTitle = titleEl.value;
    const statusEl = document.getElementById("post-status") as HTMLSelectElement | null;
    if (statusEl?.value) ctx.postStatus = statusEl.value;
    const excerptEl = document.getElementById("post-excerpt") as HTMLTextAreaElement | null;
    if (excerptEl?.value) ctx.postExcerpt = excerptEl.value.slice(0, 200);
    return ctx;
  }, [path, pageContext]);

  // ── Shared action executor ────────────────────────────────────────────────
  const executeActions = async (
    serverActions: Action[],
    clientActions: Action[],
    navigateAction: Action | null,
    nav: (url: string, pending: Action[]) => void,
  ): Promise<ActionChip[]> => {
    const chips: ActionChip[] = [];
    let navigateTo: string | null = null;

    for (const action of serverActions) {
      try {
        const r = await fetch("/api/ai/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const d = await r.json() as any;
        const result = d.results?.[0] ?? { success: false, message: "无执行结果" };
        chips.push({ label: result.message, ok: result.success });
        setLiveChips([...chips]);
        if (result.navigate) navigateTo = result.navigate;
      } catch (e: any) {
        chips.push({ label: e.message ?? "操作失败", ok: false });
        setLiveChips([...chips]);
      }
    }

    const finalNav = navigateTo ?? navigateAction?.url ?? null;
    if (finalNav) {
      nav(finalNav, clientActions);
      chips.push({ label: `正在打开 ${finalNav}…`, ok: true });
    } else {
      for (const action of clientActions) {
        const label = executeClientAction(action, nav);
        if (label) chips.push({ label, ok: true });
      }
    }

    return chips;
  };

  // ── Approve pending actions ───────────────────────────────────────────────
  const approveActions = useCallback(async (msgIndex: number) => {
    setMessages(prev => {
      const msg = prev[msgIndex];
      if (!msg?.pending) return prev;
      return prev.map((m, i) => i === msgIndex ? { ...m, pending: undefined } : m);
    });

    // Read the pending data before clearing
    const msg = messages[msgIndex];
    if (!msg?.pending) return;
    const { serverActions, clientActions, navigateAction } = msg.pending;

    setLoading(true);
    setLiveChips([]);

    const chips = await executeActions(serverActions, clientActions, navigateAction, persistAndNavigate);

    setLiveChips([]);
    setLoading(false);
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, appliedActions: chips, pending: undefined } : m
    ));
  }, [messages, persistAndNavigate]);

  // ── Cancel pending actions ────────────────────────────────────────────────
  const cancelActions = useCallback((msgIndex: number) => {
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex
        ? { ...m, pending: undefined, appliedActions: [{ label: "已取消", ok: false }] }
        : m
    ));
  }, []);

  // ── 长文写作：走 /api/ap-autofill/write，结果写入编辑器 + 气泡保留 Markdown ──
  const runWriter = async (topic: string, base: Message[]) => {
    try {
      const titleEl = document.getElementById("post-title") as HTMLInputElement | null;
      const currentHtml =
        (window as any).__editorContent ??
        (document.querySelector(".ap-wysiwyg-editor") as HTMLElement | null)?.innerHTML ??
        "";
      const res = await fetch("/api/ap-autofill/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, title: titleEl?.value ?? "", content: currentHtml }),
      });
      const data = await res.json() as any;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "AI 写作失败，请重试");

      const r = data.data;

      // 1) 正文：优先走事件契约（BlockEditor 已监听）；无监听者则直接写入
      window.dispatchEvent(new CustomEvent("ap:setContent", { detail: { html: r.content } }));
      const editor = document.querySelector(".ap-wysiwyg-editor") as HTMLElement | null;
      if (editor) {
        if ((window as any).__editorContent !== r.content) {
          editor.innerHTML = r.content;
          (window as any).__editorContent = r.content;
        }
        flashAIUpdate(editor, "area");
      }
      // 2) 标题
      if (r.title && titleEl) {
        titleEl.value = r.title;
        titleEl.dispatchEvent(new Event("input", { bubbles: true }));
        flashAIUpdate(titleEl);
      }
      // 3) 摘要
      const exEl = document.getElementById("post-excerpt") as HTMLTextAreaElement | null;
      if (r.excerpt && exEl) exEl.value = r.excerpt;

      const mdText = String(r.markdown ?? "");
      const textLength = mdText
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/[#>*`|~=-]/g, "")
        .replace(/\s+/g, "").length;

      setMessages([
        ...base,
        {
          role: "assistant",
          content:
            r.mode === "optimize"
              ? `已在原文基础上扩充优化（Markdown 图文），纯文本约 ${textLength} 字，正文已自动更新。`
              : `Markdown 图文文章已生成，纯文本约 ${textLength} 字，已自动插入编辑器。`,
          article: { mode: r.mode, title: r.title ?? "", markdown: mdText, textLength },
        },
      ]);
    } catch (e: any) {
      const msg = e?.message ?? "AI 写作失败，请稍后再试";
      setMessages([
        ...base,
        { role: "assistant", content: `出错了：${msg}`, appliedActions: [{ label: msg, ok: false }] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setLiveChips([]);
    setError("");

    // ── 长文写作意图：独立链路，保证 Markdown 图文 + 50 字分界 + 上下文加工 ──
    if (isWritingRequest(content)) {
      await runWriter(content, newMessages);
      return;
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, context: buildContext() }),
      });

      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error ?? "请求失败");

      // ── Parse action blocks from reply ────────────────────────────────
      const allActions: Action[] = [];
      const replyContent = data.reply
        .replace(/```action\n([\s\S]*?)```/g, (_: string, json: string) => {
          try { allActions.push(JSON.parse(json.trim())); } catch {}
          return "";
        })
        .trim();

      const serverActions = allActions.filter((a) => !CLIENT_SIDE.has(a.type));
      const clientActions = allActions.filter((a) => CLIENT_SIDE.has(a.type) && a.type !== "navigate");
      const navigateAction = allActions.find((a) => a.type === "navigate") ?? null;

      const actionableCount = serverActions.length + clientActions.length + (navigateAction ? 1 : 0);

      // ── Confirmation mode: show plan and wait for approval ────────────
      if (confirmBeforeAction && actionableCount > 0) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: replyContent, pending: { serverActions, clientActions, navigateAction } },
        ]);
        return;
      }

      // ── Execute immediately ───────────────────────────────────────────
      const chips = await executeActions(serverActions, clientActions, navigateAction, persistAndNavigate);
      setLiveChips([]);
      setMessages([
        ...newMessages,
        { role: "assistant", content: replyContent, appliedActions: chips },
      ]);
    } catch (e: any) {
      const msg = e.message ?? "出了点问题，请稍后再试";
      setError(msg);
      setMessages([
        ...newMessages,
        { role: "assistant", content: `出错了：${msg}`, appliedActions: [{ label: msg, ok: false }] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button — hidden when panel is open */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="AI 助手"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 99998,
            width: 46, height: 46, borderRadius: "50%",
            background: "#2271b1", border: "none",
            boxShadow: "0 2px 12px rgba(0,0,0,.28)",
            cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <SparkIcon />
        </button>
      )}

      {/* Slide-in panel */}
      <div style={{
        position: "fixed", right: 0, top: 32, bottom: 0, zIndex: 99997,
        width: 380, background: "#fff",
        borderLeft: "1px solid #dcdcde",
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,.1)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform .22s cubic-bezier(.4,0,.2,1)",
      }}>

        {/* Header */}
        <div style={{
          background: "#1d2327", color: "#fff",
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0,
        }}>
          <SparkIcon />
          <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>AstroPress AI</span>
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setError("");
                try { sessionStorage.removeItem(SESSION_KEY); } catch {}
              }}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,.4)",
                fontSize: 11, cursor: "pointer", padding: "2px 6px", fontFamily: "inherit",
              }}
            >
              清空
            </button>
          )}
          <a href="/admin/settings/ai" style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textDecoration: "none" }}>
            设置
          </a>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "rgba(255,255,255,.08)", border: "none",
              color: "rgba(255,255,255,.7)",
              width: 26, height: 26, borderRadius: 3,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0, marginLeft: 4,
            }}
            title="关闭（Esc）"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Provider badge */}
        <ProviderBadge />

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: 16,
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {messages.length === 0 && (
            <div>
              <p style={{ fontSize: 13, color: "#646970", margin: "0 0 14px", lineHeight: 1.6 }}>
                告诉我你的需求，我会自动处理。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {quickPrompts.map((p) => (
                  <button
                    key={p.prompt}
                    onClick={() => send(p.prompt)}
                    style={{
                      textAlign: "left", background: "#f6f7f7",
                      border: "1px solid #dcdcde", borderRadius: 3,
                      padding: "7px 10px", fontSize: 12, cursor: "pointer",
                      color: "#3c434a", fontFamily: "inherit", lineHeight: 1.4,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
              <div style={{ flex: 1, height: 1, background: "#f0f0f1" }} />
              <span style={{ fontSize: 10, color: "#c3c4c7", whiteSpace: "nowrap" }}>{path}</span>
              <div style={{ flex: 1, height: 1, background: "#f0f0f1" }} />
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
                  <div style={{
                    background: "#2271b1", color: "#fff",
                    padding: "8px 12px",
                    borderRadius: "12px 12px 2px 12px",
                    fontSize: 13, lineHeight: 1.5,
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            }

            const allPlanActions = [
              ...(msg.pending?.serverActions ?? []),
              ...(msg.pending?.clientActions ?? []),
              ...(msg.pending?.navigateAction ? [msg.pending.navigateAction] : []),
            ];

            return (
              <div key={i} style={{ alignSelf: "flex-start", maxWidth: "96%", display: "flex", flexDirection: "column", gap: 5 }}>
                {msg.content && (
                  <div style={{
                    background: "#f6f7f7", border: "1px solid #dcdcde",
                    padding: "8px 12px",
                    borderRadius: "2px 12px 12px 12px",
                    fontSize: 13, lineHeight: 1.65, color: "#1d2327",
                    wordBreak: "break-word",
                  }}>
                    {renderMarkdown(msg.content)}
                  </div>
                )}

                {/* 长文写作结果卡片 */}
                {msg.article && <ArticleCard article={msg.article} />}

                {/* Confirmation plan */}
                {msg.pending && (
                  <div style={{
                    border: "1px solid #c3c4c7", borderRadius: 6,
                    overflow: "hidden", background: "#fff",
                    fontSize: 12,
                  }}>
                    <div style={{
                      padding: "8px 12px", background: "#f6f7f7",
                      borderBottom: "1px solid #e0e0e1",
                      fontSize: 11, fontWeight: 600, color: "#646970",
                      letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                      以下是待执行的变更，确认后执行
                    </div>
                    <ul style={{ margin: 0, padding: "8px 12px 8px 28px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {allPlanActions.map((a, ai) => (
                        <li key={ai} style={{ color: "#1d2327", lineHeight: 1.5 }}>
                          {humanizeAction(a)}
                        </li>
                      ))}
                    </ul>
                    <div style={{
                      display: "flex", gap: 8, padding: "8px 12px 10px",
                      borderTop: "1px solid #f0f0f1",
                    }}>
                      <button
                        onClick={() => approveActions(i)}
                        style={{
                          height: 28, padding: "0 14px",
                          background: "#00a32a", color: "#fff",
                          border: "1px solid #007a1f", borderRadius: 3,
                          fontSize: 12, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        确认执行
                      </button>
                      <button
                        onClick={() => cancelActions(i)}
                        style={{
                          height: 28, padding: "0 12px",
                          background: "#fff", color: "#646970",
                          border: "1px solid #dcdcde", borderRadius: 3,
                          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {msg.appliedActions && msg.appliedActions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {msg.appliedActions.map((a, ai) => (
                      <span key={ai} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: a.ok ? "#d1e7dd" : "#f8d7da",
                        color: a.ok ? "#146c43" : "#842029",
                        borderRadius: 10, padding: "2px 8px",
                        fontSize: 11, fontWeight: 600,
                      }}>
                        {a.ok
                          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        }
                        {a.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 5, maxWidth: "96%" }}>
              <div style={{
                background: "#f6f7f7", border: "1px solid #dcdcde",
                padding: "8px 14px", borderRadius: "2px 12px 12px 12px",
                fontSize: 13, color: "#8c8f94",
              }}>
                <AnimatedDots />
              </div>
              {liveChips.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {liveChips.map((a, ai) => (
                    <span key={ai} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: a.ok ? "#d1e7dd" : "#f8d7da",
                      color: a.ok ? "#146c43" : "#842029",
                      borderRadius: 4, padding: "3px 9px",
                      fontSize: 11, fontWeight: 600, alignSelf: "flex-start",
                    }}>
                      {a.ok
                        ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      }
                      {a.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "10px 12px 14px",
          borderTop: "1px solid #dcdcde",
          flexShrink: 0, background: "#fff",
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="告诉我你想做什么…"
              rows={2}
              style={{
                flex: 1, resize: "none",
                border: "1px solid #8c8f94", borderRadius: 3,
                padding: "6px 8px", fontSize: 13,
                fontFamily: "inherit", outline: "none", lineHeight: 1.4,
                transition: "border-color .08s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#2271b1")}
              onBlur={(e) => (e.target.style.borderColor = "#8c8f94")}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                background: "#2271b1", color: "#fff",
                border: "none", borderRadius: 3,
                padding: "10px 12px",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.45 : 1,
                flexShrink: 0,
              }}
            >
              <SendIcon />
            </button>
          </div>
          {error && <p style={{ margin: "6px 0 0", fontSize: 11, color: "#d63638" }}>{error}</p>}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProviderBadge() {
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/settings")
      .then((r) => r.json() as any)
      .then((d) => { if (d.activeProvider && d.activeProvider !== "none") setProvider(d.activeProvider); })
      .catch(() => {});
  }, []);

  if (!provider) return null;

  const labels: Record<string, string> = {
    anthropic: "Claude", openai: "GPT", gemini: "Gemini", mistral: "Mistral", groq: "Groq",
  };

  return (
    <div style={{
      padding: "4px 14px", background: "#f6f7f7",
      borderBottom: "1px solid #f0f0f1",
      fontSize: 11, color: "#646970",
      display: "flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00a32a", display: "inline-block" }} />
      {labels[provider] ?? provider}
    </div>
  );
}

function AnimatedDots() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 400);
    return () => clearInterval(t);
  }, []);
  return <span>思考中{dots}</span>;
}
