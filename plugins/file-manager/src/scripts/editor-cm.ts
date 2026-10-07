/**
 * 文件管理器「查看/编辑」弹窗的 CodeMirror 6 编辑器工厂。
 *
 * - .astro 使用 @fazelstudio/codemirror-lang-astro：Frontmatter / JSX /
 *   <script> / <style> 混合语法高亮与嵌套解析；
 * - 其余常见类型按扩展名切换 html/css/javascript/json/markdown 语言包；
 * - 暴露与旧 textarea 编辑器等价的 API：取值/设值/只读/撤销重做/
 *   查找替换/转到行/自动换行/字号/行列状态/脏标记。
 */
import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, Transaction, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab, undo, redo } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { SearchQuery } from "@codemirror/search";
import { tags as hlTags } from "@lezer/highlight";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { astro } from "@fazelstudio/codemirror-lang-astro";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { python } from "@codemirror/legacy-modes/mode/python";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { diff } from "@codemirror/legacy-modes/mode/diff";

export interface EditorCallbacks {
  /** 文档变更（用户输入） */
  onDirty?: () => void;
  /** 光标/选区状态变化 */
  onPosition?: (line: number, col: number, selected: number) => void;
  onSave?: () => void;
  onFind?: () => void;
  onGoto?: () => void;
}

export interface MatchRange {
  from: number;
  to: number;
}

export interface FileEditor {
  setText(text: string, fileName: string, readonly: boolean): void;
  getText(): string;
  getLineCount(): number;
  setReadonly(ro: boolean): void;
  setClean(): void;
  isDirty(): boolean;
  focus(): void;
  getSelectionText(): string;
  undo(): void;
  redo(): void;
  gotoLine(n: number): void;
  /** 重新计算查找匹配（上限 10000），返回匹配数量 */
  setQuery(query: string): number;
  findNext(fromCursor?: boolean): void;
  findPrev(): void;
  /** 当前光标处于某个匹配上时替换它并跳到下一个；否则跳到下一个匹配。
   *  返回 replaced=已替换 / moved=仅跳转到下一个 / none=无匹配 */
  replaceOne(replace: string): "replaced" | "moved" | "none";
  /** 全部替换，返回替换数量 */
  replaceAll(query: string, replace: string): number;
  getActiveMatchIndex(): number;
  setWrap(on: boolean): void;
  setFontSize(px: number): void;
  /** 切换深色主题（VS Code Dark+ 风格） */
  setDark(on: boolean): void;
}

/** 浅色语法配色（VSCode Light 风格，覆盖 markdown/astro 常用标签） */
const lightHighlight = HighlightStyle.define([
  { tag: [hlTags.keyword, hlTags.modifier, hlTags.controlKeyword], color: "#0033b3" },
  { tag: [hlTags.string, hlTags.special(hlTags.string)], color: "#067d17" },
  { tag: [hlTags.number, hlTags.bool, hlTags.null, hlTags.atom], color: "#1750eb" },
  { tag: [hlTags.comment, hlTags.lineComment, hlTags.blockComment], color: "#8c8c8c", fontStyle: "italic" },
  { tag: [hlTags.function(hlTags.variableName), hlTags.function(hlTags.propertyName)], color: "#6639ba" },
  { tag: [hlTags.definition(hlTags.variableName), hlTags.variableName], color: "#1f1f1f" },
  { tag: [hlTags.typeName, hlTags.className, hlTags.namespace, hlTags.tagName], color: "#b32d2e" },
  { tag: [hlTags.propertyName, hlTags.attributeName], color: "#871094" },
  { tag: [hlTags.operator, hlTags.punctuation, hlTags.separator], color: "#333333" },
  // markdown 标题：彩色加粗，一眼可辨
  { tag: [hlTags.heading1, hlTags.heading2], color: "#0550ae", fontWeight: "700" },
  { tag: [hlTags.heading3, hlTags.heading4, hlTags.heading5, hlTags.heading6], color: "#116329", fontWeight: "700" },
  // markdown 强调/代码/引用
  { tag: hlTags.strong, fontWeight: "700", color: "#9a3412" },
  { tag: hlTags.emphasis, fontStyle: "italic", color: "#6f42c1" },
  { tag: hlTags.strikethrough, textDecoration: "line-through" },
  { tag: hlTags.monospace, color: "#c7254e", backgroundColor: "#f6f8fa" },
  { tag: hlTags.quote, color: "#57606a", fontStyle: "italic" },
  { tag: [hlTags.link, hlTags.url], color: "#0a58ca", textDecoration: "underline" },
  { tag: hlTags.contentSeparator, color: "#8c8c8c" },
  { tag: hlTags.invalid, color: "#b32d2e" },
]);

/** 深色语法配色（VS Code Dark+ 风格） */
const darkHighlight = HighlightStyle.define([
  { tag: [hlTags.keyword, hlTags.modifier, hlTags.controlKeyword], color: "#569cd6" },
  { tag: [hlTags.string, hlTags.special(hlTags.string)], color: "#ce9178" },
  { tag: [hlTags.number, hlTags.bool, hlTags.null, hlTags.atom], color: "#b5cea8" },
  { tag: [hlTags.comment, hlTags.lineComment, hlTags.blockComment], color: "#6a9955", fontStyle: "italic" },
  { tag: [hlTags.function(hlTags.variableName), hlTags.function(hlTags.propertyName)], color: "#dcdcaa" },
  { tag: [hlTags.definition(hlTags.variableName), hlTags.variableName], color: "#9cdcfe" },
  { tag: [hlTags.typeName, hlTags.className, hlTags.namespace, hlTags.tagName], color: "#4ec9b0" },
  { tag: [hlTags.propertyName, hlTags.attributeName], color: "#9cdcfe" },
  { tag: [hlTags.operator, hlTags.punctuation, hlTags.separator], color: "#d4d4d4" },
  { tag: [hlTags.heading1, hlTags.heading2], color: "#569cd6", fontWeight: "700" },
  { tag: [hlTags.heading3, hlTags.heading4, hlTags.heading5, hlTags.heading6], color: "#4ec9b0", fontWeight: "700" },
  { tag: hlTags.strong, fontWeight: "700", color: "#dcdcaa" },
  { tag: hlTags.emphasis, fontStyle: "italic", color: "#c586c0" },
  { tag: hlTags.strikethrough, textDecoration: "line-through" },
  { tag: hlTags.monospace, color: "#ce9178", backgroundColor: "#2d2d2d" },
  { tag: hlTags.quote, color: "#6a9955", fontStyle: "italic" },
  { tag: [hlTags.link, hlTags.url], color: "#569cd6", textDecoration: "underline" },
  { tag: hlTags.contentSeparator, color: "#858585" },
  { tag: hlTags.invalid, color: "#f44747" },
]);

/** 字号独立主题（与明暗解耦，便于 setFontSize 单独切换） */
function sizeTheme(fontPx: number): Extension {
  return EditorView.theme({
    "&": { fontSize: fontPx + "px" },
    ".cm-content": { fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace", lineHeight: "1.75", padding: "14px 18px" },
    ".cm-scroller": { lineHeight: "1.75" },
    ".cm-gutters": { fontSize: fontPx + "px" },
  });
}

function lightTheme(): Extension {
  return EditorView.theme({
    "&": { backgroundColor: "#ffffff", color: "#1f2937" },
    ".cm-content": { caretColor: "#4f46e5" },
    ".cm-gutters": { backgroundColor: "#ffffff", color: "#c3c8d2", border: "none" },
    ".cm-activeLine": { backgroundColor: "#f6f7fb" },
    ".cm-activeLineGutter": { backgroundColor: "#f6f7fb", color: "#4f46e5" },
    ".cm-cursor": { borderLeftColor: "#4f46e5", borderLeftWidth: "2px" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#e0e7ff" },
    "&.cm-focused .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#dbe2fe" },
    ".cm-searchMatch": { backgroundColor: "#fde68a", outline: "none" },
    ".cm-searchMatch-selected": { backgroundColor: "#fbbf24" },
    ".cm-matchingBracket": { backgroundColor: "#e0e7ff", outline: "none" },
    ".cm-foldGutter": { display: "none !important" },
    ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
    ".cm-scroller::-webkit-scrollbar-thumb": { background: "#d1d5db", borderRadius: "5px", border: "2px solid #fff" },
    ".cm-scroller::-webkit-scrollbar-thumb:hover": { background: "#9ca3af" },
    ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
  });
}

function darkTheme(): Extension {
  return EditorView.theme({
    "&": { backgroundColor: "#1e1e1e", color: "#d4d4d4" },
    ".cm-content": { caretColor: "#569cd6" },
    ".cm-gutters": { backgroundColor: "#1e1e1e", color: "#6e7681", border: "none" },
    ".cm-activeLine": { backgroundColor: "#2d2d2d" },
    ".cm-activeLineGutter": { backgroundColor: "#2d2d2d", color: "#569cd6" },
    ".cm-cursor": { borderLeftColor: "#569cd6", borderLeftWidth: "2px" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#264f78" },
    "&.cm-focused .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#264f78" },
    ".cm-searchMatch": { backgroundColor: "#7c6f26", outline: "none" },
    ".cm-searchMatch-selected": { backgroundColor: "#a89e32" },
    ".cm-matchingBracket": { backgroundColor: "#264f78", outline: "none" },
    ".cm-foldGutter": { display: "none !important" },
    ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
    ".cm-scroller::-webkit-scrollbar-thumb": { background: "#4a4a4a", borderRadius: "5px", border: "2px solid #1e1e1e" },
    ".cm-scroller::-webkit-scrollbar-thumb:hover": { background: "#5e5e5e" },
    ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
  }, { dark: true });
}

/** 明暗外观打包：主题 + 语法高亮一起切换 */
function appearanceFor(dark: boolean): Extension {
  return dark
    ? [darkTheme(), syntaxHighlighting(darkHighlight)]
    : [lightTheme(), syntaxHighlighting(lightHighlight)];
}

/** 按文件名选择语言包；未识别类型返回空扩展（纯文本） */
function langFor(fileName: string): Extension {
  const name = (fileName || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : name === "dockerfile" ? "dockerfile" : "";
  switch (ext) {
    case ".astro":
      // 官方社区 Astro 语言包：frontmatter / JSX / script / style 嵌套解析
      return astro();
    case ".js":
    case ".mjs":
    case ".cjs":
      return javascript();
    case ".ts":
    case ".mts":
    case ".cts":
      return javascript({ typescript: true });
    case ".jsx":
      return javascript({ jsx: true });
    case ".tsx":
      return javascript({ jsx: true, typescript: true });
    case ".css":
    case ".scss":
    case ".less":
      return css();
    case ".json":
    case ".jsonc":
    case ".map":
      return json();
    case ".md":
    case ".markdown":
    case ".mdx":
      return markdown();
    case ".html":
    case ".htm":
    case ".vue":
    case ".svelte":
    case ".svg":
    case ".xml":
      return html();
    // —— legacy-modes（StreamLanguage 包裹，覆盖配置/脚本类格式）——
    case ".yaml":
    case ".yml":
      return StreamLanguage.define(yaml);
    case ".sh":
    case ".bash":
    case ".zsh":
      return StreamLanguage.define(shell);
    case ".ps1":
    case ".psm1":
      return StreamLanguage.define(powerShell);
    case ".py":
      return StreamLanguage.define(python);
    case ".sql":
      return StreamLanguage.define(standardSQL);
    case ".toml":
      return StreamLanguage.define(toml);
    case ".ini":
    case ".conf":
    case ".env":
    case ".properties":
      return StreamLanguage.define(properties);
    case ".diff":
    case ".patch":
      return StreamLanguage.define(diff);
    case "dockerfile":
      return StreamLanguage.define(dockerFile);
    default:
      return [];
  }
}

export function createFileEditor(host: HTMLElement, cb: EditorCallbacks = {}): FileEditor {
  const langComp = new Compartment();
  const roComp = new Compartment();
  const wrapComp = new Compartment();
  const fontComp = new Compartment();
  const darkComp = new Compartment();
  let fontPx = 13;
  let dark = false;
  let dirty = false;
  let query = "";
  let matches: MatchRange[] = [];
  let matchIdx = -1;

  // 只读必须同时关 readOnly 与 editable：
  // 仅 readOnly 时 DOM 仍 contenteditable=true（移动端仍弹键盘、可访问性误报可编辑）
  const roExt = (ro: boolean) => [
    EditorState.readOnly.of(ro),
    EditorView.editable.of(!ro),
  ];

  const updateListener = EditorView.updateListener.of((u) => {
    // 只有用户发起的编辑（输入/粘贴/拖拽/撤销重做等）才标脏；
    // setText/查找替换等程序化 dispatch 不带 userEvent，避免切标签/重载后干净文件被误标脏
    const userEdited = u.transactions.some(
      (tr) => tr.docChanged && tr.annotation(Transaction.userEvent) != null,
    );
    if (userEdited) {
      dirty = true;
      cb.onDirty?.();
    }
    if (u.selectionSet || u.docChanged) {
      const pos = u.state.selection.main;
      const line = u.state.doc.lineAt(pos.head);
      cb.onPosition?.(line.number, pos.head - line.from + 1, pos.to - pos.from);
    }
  });

  const state = EditorState.create({
    doc: "",
    extensions: [
      // 自定义快捷键优先于 basicSetup 内的 searchKeymap（抢占 Mod-f/Mod-g）
      keymap.of([
        indentWithTab,
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            cb.onSave?.();
            return true;
          },
        },
        {
          key: "Mod-f",
          preventDefault: true,
          run: () => {
            cb.onFind?.();
            return true;
          },
        },
        {
          key: "Mod-g",
          preventDefault: true,
          run: () => {
            cb.onGoto?.();
            return true;
          },
        },
      ]),
      basicSetup,
      langComp.of([]),
      roComp.of(roExt(false)),
      wrapComp.of([]),
      fontComp.of(sizeTheme(fontPx)),
      darkComp.of(appearanceFor(false)),
      updateListener,
    ],
  });

  const view = new EditorView({ state, parent: host });

  function emitPosition() {
    const pos = view.state.selection.main;
    const line = view.state.doc.lineAt(pos.head);
    cb.onPosition?.(line.number, pos.head - line.from + 1, pos.to - pos.from);
  }

  function selectRange(r: MatchRange) {
    view.focus();
    view.dispatch({ selection: { anchor: r.from, head: r.to }, scrollIntoView: true });
  }

  function recompute(): number {
    matches = [];
    matchIdx = -1;
    const q = query.trim();
    if (q) {
      const sq = new SearchQuery({
        search: query,
        caseSensitive: false,
        regexp: false,
        wholeWord: false,
      });
      const cursor = sq.getCursor(view.state);
      const MAX_MATCHES = 10000;
      while (matches.length < MAX_MATCHES) {
        const nx = cursor.next();
        if (nx.done) break;
        matches.push({ from: nx.value.from, to: nx.value.to });
      }
    }
    return matches.length;
  }

  const api: FileEditor = {
    setText(text, fileName, readonly) {
      dirty = false;
      query = "";
      matches = [];
      matchIdx = -1;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        effects: [
          langComp.reconfigure(langFor(fileName)),
          roComp.reconfigure(roExt(!!readonly)),
        ],
        selection: { anchor: 0 },
      });
      // 弹窗从 display:none 打开后需要重新度量行高
      requestAnimationFrame(() => view.requestMeasure());
      emitPosition();
    },
    getText() {
      return view.state.doc.toString();
    },
    getLineCount() {
      return view.state.doc.lines;
    },
    setReadonly(ro) {
      view.dispatch({ effects: roComp.reconfigure(roExt(!!ro)) });
    },
    setClean() {
      dirty = false;
    },
    isDirty() {
      return dirty;
    },
    focus() {
      view.focus();
    },
    getSelectionText() {
      const sel = view.state.selection.main;
      return view.state.sliceDoc(sel.from, sel.to);
    },
    undo() {
      undo(view);
    },
    redo() {
      redo(view);
    },
    gotoLine(n) {
      const total = view.state.doc.lines;
      const lineNo = Math.max(1, Math.min(total, Math.floor(n) || 1));
      const line = view.state.doc.line(lineNo);
      view.focus();
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    },
    setQuery(q) {
      query = q ?? "";
      return recompute();
    },
    findNext() {
      if (!matches.length) return;
      const head = view.state.selection.main.head;
      let idx = matches.findIndex((r) => r.from >= head);
      if (idx < 0) idx = 0;
      matchIdx = idx;
      selectRange(matches[idx]);
    },
    findPrev() {
      if (!matches.length) return;
      const head = view.state.selection.main.head;
      let idx = -1;
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].from < head) idx = i;
        else break;
      }
      if (idx < 0) idx = matches.length - 1;
      matchIdx = idx;
      selectRange(matches[idx]);
    },
    replaceOne(replace) {
      if (!query.trim() || !matches.length) return "none";
      const head = view.state.selection.main;
      const at = matches.findIndex((r) => r.from === head.anchor && r.to === head.head);
      if (at < 0) {
        api.findNext();
        return "moved";
      }
      const r = matches[at];
      view.dispatch({ changes: { from: r.from, to: r.to, insert: replace }, selection: { anchor: r.from + replace.length } });
      // 工具栏触发的程序化替换，需手动标脏
      dirty = true;
      cb.onDirty?.();
      // 变更后匹配集合已失效，由调用方按新 query 重算并跳下一个
      matchIdx = -1;
      return "replaced";
    },
    replaceAll(q, replace) {
      const saved = query;
      query = q ?? saved;
      const count = recompute();
      if (!count) return 0;
      const changes = matches
        .slice()
        .reverse()
        .map((r) => ({ from: r.from, to: r.to, insert: replace }));
      view.dispatch({ changes, selection: { anchor: view.state.selection.main.from } });
      dirty = true;
      cb.onDirty?.();
      return count;
    },
    getActiveMatchIndex() {
      return matchIdx;
    },
    setWrap(on) {
      view.dispatch({ effects: wrapComp.reconfigure(on ? EditorView.lineWrapping : []) });
    },
    setFontSize(px) {
      fontPx = px;
      view.dispatch({ effects: fontComp.reconfigure(sizeTheme(px)) });
    },
    setDark(on) {
      dark = !!on;
      view.dispatch({ effects: darkComp.reconfigure(appearanceFor(dark)) });
    },
  };

  return api;
}
