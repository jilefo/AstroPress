import { useEffect, useRef, useCallback } from "react";

interface Props {
  initialContent?: string;
  postId?: number;
  onChange?: (html: string) => void;
}

// ─── Toolbar button definition ────────────────────────────────────────────────

interface ToolbarItem {
  title: string;
  icon: string;
  action: () => void;
  isActive?: () => boolean;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  wrapper: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "480px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "1px",
    padding: "6px 10px",
    background: "#f6f7f7",
    borderBottom: "1px solid #dcdcde",
    alignItems: "center",
  },
  btn: (active = false): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "28px",
    background: active ? "#dcdcde" : "none",
    border: "1px solid " + (active ? "#8c8f94" : "transparent"),
    borderRadius: "2px",
    cursor: "pointer",
    fontSize: "13px",
    color: "#1d2327",
    padding: "0",
    lineHeight: 1,
    transition: "background 0.1s, border-color 0.1s",
  }),
  separator: {
    width: "1px",
    height: "20px",
    background: "#dcdcde",
    margin: "0 4px",
    flexShrink: 0,
  } as React.CSSProperties,
  editor: {
    flex: 1,
    padding: "20px 24px",
    outline: "none",
    fontSize: "15px",
    lineHeight: "1.7",
    color: "#1d2327",
    minHeight: "440px",
    overflowY: "auto" as const,
  },
};

// ─── SVG icons ────────────────────────────────────────────────────────────────

const icons: Record<string, string> = {
  bold:          `<svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><path d="M6.5 6.75A1.75 1.75 0 0 0 6.5 3.25H2V6.75H6.5ZM6.5 7.25H2V10.75H7A1.75 1.75 0 0 0 7 7.25H6.5ZM.5 2H6.5A3.25 3.25 0 0 1 7.94 7.64A3.25 3.25 0 0 1 7 12.25H.5V2Z"/></svg>`,
  italic:        `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><path d="M3.5 2H9.5V3.5H7.13L4.87 10.5H7V12H1V10.5H3.37L5.63 3.5H3.5V2Z"/></svg>`,
  underline:     `<svg width="12" height="15" viewBox="0 0 12 15" fill="currentColor"><path d="M1 13.5H11V15H1V13.5ZM6 11.5A4 4 0 0 1 2 7.5V1H3.5V7.5A2.5 2.5 0 0 0 8.5 7.5V1H10V7.5A4 4 0 0 1 6 11.5Z"/></svg>`,
  strike:        `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1C9.21 1 11 2.57 11 4.5H9.5C9.5 3.4 8.38 2.5 7 2.5S4.5 3.4 4.5 4.5C4.5 5.27 5.24 5.88 6.34 6.25H2.07A4.58 4.58 0 0 1 2 5.5H.5A4.58 4.58 0 0 0 .66 6.25H.5V7.75H13.5V6.25H8.11C8.5 6.09 8.84 5.9 9.1 5.67A4.5 4.5 0 0 1 13.5 9.5C13.5 11.43 11.71 13 9.5 13S5.5 11.43 5.5 9.5H7C7 10.6 8.12 11.5 9.5 11.5S12 10.6 12 9.5 11.24 7.75 9.5 7.75H.5V6.25H7Z"/></svg>`,
  h1:            `<svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor"><path d="M1 1H2.5V6H7V1H8.5V13H7V7.5H2.5V13H1V1ZM11 4L14 2V13H12.5V4.2L11.5 4.77V3.2L11 4Z"/></svg>`,
  h2:            `<svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor"><path d="M1 1H2.5V6H7V1H8.5V13H7V7.5H2.5V13H1V1ZM11 4.5C11 3.12 12.12 2 13.5 2S16 3.12 16 4.5C16 5.5 15.43 6.37 14.6 6.82L12.37 9.5H16V11H11V9.62L14.12 6L14.29 5.8A1 1 0 1 0 12.5 4.5H11V4.5Z"/></svg>`,
  h3:            `<svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor"><path d="M1 1H2.5V6H7V1H8.5V13H7V7.5H2.5V13H1V1ZM13.5 2C14.88 2 16 3.12 16 4.5A2.44 2.44 0 0 1 15.08 6.5A2.44 2.44 0 0 1 16 8.5C16 9.88 14.88 11 13.5 11S11 9.88 11 8.5H12.5A1 1 0 1 0 14.5 8.5A1 1 0 0 0 13.5 7.5H13V6H13.5A1 1 0 1 0 12.5 5H11A2.5 2.5 0 0 1 13.5 2Z"/></svg>`,
  ul:            `<svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor"><circle cx="1.5" cy="2" r="1.5"/><circle cx="1.5" cy="6" r="1.5"/><circle cx="1.5" cy="10" r="1.5"/><rect x="4" y="1" width="10" height="2"/><rect x="4" y="5" width="10" height="2"/><rect x="4" y="9" width="10" height="2"/></svg>`,
  ol:            `<svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor"><path d="M1 0H2V3H0.5V2H1V0ZM0 5H2.5V5.5L1 7H2.5V8H0V7.5L1.5 6H0V5ZM0.5 9.5A1 1 0 0 1 2.5 9.5C2.5 10 2.18 10.38 1.75 10.68L1 11H2.5V12H0V11.32L1.5 10.2C1.66 10.09 1.75 9.98 1.75 9.86A0.25 0.25 0 0 0 1.25 9.86H0.5V9.5Z"/><rect x="4" y="1" width="10" height="2"/><rect x="4" y="5" width="10" height="2"/><rect x="4" y="9" width="10" height="2"/></svg>`,
  blockquote:    `<svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor"><path d="M0 6H3.5L1.5 12H4L6 6V0H0V6ZM8 6H11.5L9.5 12H12L14 6V0H8V6Z"/></svg>`,
  link:          `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.47 5.53A3.75 3.75 0 0 0 3.17 10.83L4.23 9.77A2.25 2.25 0 0 1 7.41 6.59L8.47 5.53ZM5.53 8.47L6.59 7.41A2.25 2.25 0 0 1 9.77 4.23L10.83 3.17A3.75 3.75 0 0 0 5.53 8.47ZM3.87 3.87A5.25 5.25 0 1 1 10.13 10.13L8.12 8.12A2.25 2.25 0 1 0 5.88 5.88L3.87 3.87Z"/></svg>`,
  unlink:        `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 1L13 12L12 13L9.59 10.59A3.75 3.75 0 0 1 3.17 10.83L4.23 9.77A2.25 2.25 0 0 0 8 9.06L5.94 7A2.25 2.25 0 0 0 4.23 9.77L3.17 8.71A3.75 3.75 0 0 1 4.41 4.41L1 1L2 0L13 11L12 12L2 1ZM10.83 3.17A3.75 3.75 0 0 1 10.83 8.47L9.77 7.41A2.25 2.25 0 0 0 9.77 4.23L10.83 3.17Z"/></svg>`,
  hr:            `<svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor"><rect x="0" y="4" width="14" height="2"/></svg>`,
  undo:          `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M4.5 4H9A3.5 3.5 0 0 1 9 11H5V9.5H9A2 2 0 1 0 9 5.5H4.5L6 7L5 8L2 5L5 2L6 3L4.5 4Z"/></svg>`,
  redo:          `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M9.5 4H5A3.5 3.5 0 0 0 5 11H9V9.5H5A2 2 0 1 1 5 5.5H9.5L8 7L9 8L12 5L9 2L8 3L9.5 4Z"/></svg>`,
};

function Icon({ name }: { name: string }) {
  return <span dangerouslySetInnerHTML={{ __html: icons[name] ?? "" }} style={{ display: "flex", alignItems: "center" }} />;
}

// ─── Main Editor ─────────────────────────────────────────────────────────────

export default function BlockEditor({ initialContent = "", onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(initialContent);

  // Sync content out on every input
  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    contentRef.current = html;
    (window as any).__editorContent = html;
    onChange?.(html);
  }, [onChange]);

  // Set initial content once on mount
  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent;
      (window as any).__editorContent = initialContent;
    }
  }, []);

  // ── AI 事件契约（见 apps/admin/docs/AI.md）：派发就绪事件 + 接收 setContent ──
  useEffect(() => {
    const onSetContent = (e: Event) => {
      const html = String((e as CustomEvent).detail?.html ?? "");
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = html;
      contentRef.current = html;
      (window as any).__editorContent = html;
      onChange?.(html);
    };
    window.addEventListener("ap:setContent", onSetContent);
    window.dispatchEvent(new CustomEvent("ap:editorReady"));
    return () => window.removeEventListener("ap:setContent", onSetContent);
  }, [onChange]);

  // execCommand wrapper — keeps focus in editor
  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  }, [handleInput]);

  const isActive = (tag: string) => document.queryCommandState(tag);

  const insertLink = () => {
    const sel = window.getSelection();
    const text = sel?.toString() || "";
    const url = prompt("链接地址：", "https://");
    if (!url) return;
    if (text) {
      exec("createLink", url);
    } else {
      const label = prompt("链接文字：", "点击这里") || url;
      exec("insertHTML", `<a href="${url}">${label}</a>`);
    }
  };

  // ─── Toolbar groups ────────────────────────────────────────────────────────

  const groups: ToolbarItem[][] = [
    [
      { title: "撤销", icon: "undo", action: () => exec("undo") },
      { title: "重做", icon: "redo", action: () => exec("redo") },
    ],
    [
      { title: "标题 1", icon: "h1", action: () => exec("formatBlock", "<h1>"), isActive: () => isActive("h1") },
      { title: "标题 2", icon: "h2", action: () => exec("formatBlock", "<h2>"), isActive: () => isActive("h2") },
      { title: "标题 3", icon: "h3", action: () => exec("formatBlock", "<h3>"), isActive: () => isActive("h3") },
    ],
    [
      { title: "加粗", icon: "bold", action: () => exec("bold"), isActive: () => isActive("bold") },
      { title: "斜体", icon: "italic", action: () => exec("italic"), isActive: () => isActive("italic") },
      { title: "下划线", icon: "underline", action: () => exec("underline"), isActive: () => isActive("underline") },
      { title: "删除线", icon: "strike", action: () => exec("strikeThrough"), isActive: () => isActive("strikeThrough") },
    ],
    [
      { title: "无序列表", icon: "ul", action: () => exec("insertUnorderedList"), isActive: () => isActive("insertUnorderedList") },
      { title: "有序列表", icon: "ol", action: () => exec("insertOrderedList"), isActive: () => isActive("insertOrderedList") },
      { title: "引用", icon: "blockquote", action: () => exec("formatBlock", "<blockquote>") },
    ],
    [
      { title: "插入链接", icon: "link", action: insertLink },
      { title: "移除链接", icon: "unlink", action: () => exec("unlink") },
      { title: "水平线", icon: "hr", action: () => exec("insertHorizontalRule") },
    ],
  ];

  return (
    <div style={S.wrapper}>
      {/* Inline styles for editor content */}
      <style>{`
        .ap-wysiwyg-editor:focus { outline: none; }
        .ap-wysiwyg-editor h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0; }
        .ap-wysiwyg-editor h2 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; }
        .ap-wysiwyg-editor h3 { font-size: 1.25em; font-weight: 700; margin: 0.5em 0; }
        .ap-wysiwyg-editor p { margin: 0.5em 0; }
        .ap-wysiwyg-editor ul { padding-left: 1.5em; list-style: disc; }
        .ap-wysiwyg-editor ol { padding-left: 1.5em; list-style: decimal; }
        .ap-wysiwyg-editor li { margin: 0.25em 0; }
        .ap-wysiwyg-editor blockquote { border-left: 4px solid #dcdcde; margin: 1em 0; padding: 4px 16px; color: #646970; }
        .ap-wysiwyg-editor a { color: #2271b1; text-decoration: underline; }
        .ap-wysiwyg-editor hr { border: none; border-top: 2px solid #dcdcde; margin: 1.5em 0; }
        .ap-wysiwyg-editor img { max-width: 100%; height: auto; }
        .ap-wysiwyg-editor pre { background: #f6f7f7; border: 1px solid #dcdcde; border-radius: 3px; padding: 12px 16px; font-family: monospace; overflow-x: auto; }
        .ap-wysiwyg-editor code { background: #f6f7f7; padding: 2px 4px; border-radius: 2px; font-family: monospace; font-size: 0.9em; }
        .ap-wysiwyg-toolbar-btn:hover { background: #e2e4e7 !important; border-color: #8c8f94 !important; }
      `}</style>

      {/* Toolbar */}
      <div style={S.toolbar}>
        {groups.map((group, gi) => (
          <span key={gi} style={{ display: "inline-flex", alignItems: "center", gap: "1px" }}>
            {gi > 0 && <span style={S.separator} />}
            {group.map(item => (
              <button
                key={item.title}
                title={item.title}
                className="ap-wysiwyg-toolbar-btn"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep editor focus
                  item.action();
                }}
                style={S.btn(item.isActive?.() ?? false)}
              >
                <Icon name={item.icon} />
              </button>
            ))}
          </span>
        ))}
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        className="ap-wysiwyg-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={(e) => {
          // Paste as plain HTML to avoid bringing in external styles
          e.preventDefault();
          const text = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
          document.execCommand("insertHTML", false, text);
        }}
        style={S.editor}
        data-placeholder="开始写作…"
      />
    </div>
  );
}
