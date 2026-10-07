import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ACFFieldType =
  | "text" | "textarea" | "number" | "range" | "email" | "url" | "password"
  | "image" | "file" | "wysiwyg" | "oembed" | "gallery"
  | "select" | "checkbox" | "radio" | "button_group" | "true_false"
  | "link" | "post_object" | "page_link" | "relationship" | "taxonomy" | "user"
  | "google_map" | "date_picker" | "date_time_picker" | "time_picker" | "color_picker"
  | "message" | "accordion" | "tab"
  | "group" | "repeater" | "flexible_content" | "clone";

interface ACFField {
  id: string; key: string; label: string; name: string; type: ACFFieldType;
  instructions: string; required: boolean; conditionalLogic: any[] | false;
  wrapper: { width: string; class: string; id: string };
  subFields?: ACFField[]; layouts?: FlexLayout[];
  [key: string]: any;
}
interface FlexLayout {
  id: string; key: string; label: string; name: string;
  display: "block" | "table" | "row"; min: string; max: string; subFields: ACFField[];
}
interface FieldGroupLocation { param: string; operator: "==" | "!="; value: string; }
interface FieldGroup {
  id: string; key: string; title: string; fields: ACFField[];
  location: FieldGroupLocation[][];
  menuOrder: number; position: "normal" | "side" | "acf_after_title";
  labelPlacement: "top" | "left"; instructionPlacement: "label" | "field";
  hideOnScreen: string[]; active: boolean;
}

// ─── Field Type Registry (plugin-extensible) ──────────────────────────────────

export interface FieldTypeMeta {
  label: string;
  category: string;
}

const _registry = new Map<string, FieldTypeMeta>([
  ["text",             { label: "单行文本",         category: "基础" }],
  ["textarea",         { label: "多行文本",          category: "基础" }],
  ["number",           { label: "数字",              category: "基础" }],
  ["range",            { label: "滑块",              category: "基础" }],
  ["email",            { label: "邮箱",              category: "基础" }],
  ["url",              { label: "网址",              category: "基础" }],
  ["password",         { label: "密码",              category: "基础" }],
  ["image",            { label: "图片",              category: "内容" }],
  ["file",             { label: "文件",              category: "内容" }],
  ["wysiwyg",          { label: "富文本编辑器",      category: "内容" }],
  ["oembed",           { label: "多媒体嵌入",        category: "内容" }],
  ["gallery",          { label: "图库",              category: "内容" }],
  ["select",           { label: "下拉选择",          category: "选择" }],
  ["checkbox",         { label: "复选框",            category: "选择" }],
  ["radio",            { label: "单选按钮",          category: "选择" }],
  ["button_group",     { label: "按钮组",            category: "选择" }],
  ["true_false",       { label: "真/假开关",         category: "选择" }],
  ["link",             { label: "链接",              category: "关联" }],
  ["post_object",      { label: "文章对象",          category: "关联" }],
  ["page_link",        { label: "页面链接",          category: "关联" }],
  ["relationship",     { label: "关联选择器",        category: "关联" }],
  ["taxonomy",         { label: "分类法",            category: "关联" }],
  ["user",             { label: "用户",              category: "关联" }],
  ["google_map",       { label: "谷歌地图",          category: "界面组件" }],
  ["date_picker",      { label: "日期选择",          category: "界面组件" }],
  ["date_time_picker", { label: "日期时间选择",      category: "界面组件" }],
  ["time_picker",      { label: "时间选择",          category: "界面组件" }],
  ["color_picker",     { label: "颜色选择",          category: "界面组件" }],
  ["message",          { label: "提示信息",          category: "布局" }],
  ["accordion",        { label: "折叠面板",          category: "布局" }],
  ["tab",              { label: "标签页",            category: "布局" }],
  ["group",            { label: "字段组",            category: "高级" }],
  ["repeater",         { label: "重复器",            category: "高级" }],
  ["flexible_content", { label: "弹性内容",          category: "高级" }],
  ["clone",            { label: "克隆",              category: "高级" }],
]);

const CATEGORY_ORDER = ["基础", "内容", "选择", "关联", "界面组件", "布局", "高级"];
const CATEGORY_ALIAS: Record<string, string> = {
  Basic: "基础", Content: "内容", Choice: "选择", Relational: "关联",
  jQuery: "界面组件", Layout: "布局", Pro: "高级",
};

/** Register a custom field type — call this from plugins before the editor mounts */
export function registerFieldType(key: string, meta: FieldTypeMeta): void {
  _registry.set(key, meta);
}

function getFieldMeta(key: string): FieldTypeMeta {
  return _registry.get(key) ?? { label: key, category: "基础" };
}

function getCategories(): string[] {
  const present = new Set<string>();
  for (const m of _registry.values()) present.add(CATEGORY_ALIAS[m.category] ?? m.category);
  const ordered = CATEGORY_ORDER.filter(c => present.has(c));
  const extra = [...present].filter(c => !CATEGORY_ORDER.includes(c));
  return [...ordered, ...extra];
}

function getByCategory(cat: string): [string, FieldTypeMeta][] {
  return Array.from(_registry.entries())
    .filter(([, m]) => (CATEGORY_ALIAS[m.category] ?? m.category) === cat);
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function FieldTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const s = { width: size, height: size, flexShrink: 0 } as const;
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "text":     return <svg viewBox="0 0 24 24" style={s} {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
    case "textarea": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>;
    case "number":   return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>;
    case "range":    return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="3" y1="12" x2="21" y2="12"/><circle cx="8" cy="12" r="3" fill="currentColor" stroke="none"/></svg>;
    case "email":    return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2 4 12 13 22 4"/></svg>;
    case "url":      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case "password": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "image":    return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
    case "file":     return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
    case "wysiwyg":  return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    case "oembed":   return <svg viewBox="0 0 24 24" style={s} {...p}><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>;
    case "gallery":  return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="2" y="8" width="13" height="13" rx="2"/><path d="M20 2H8a2 2 0 0 0-2 2v2"/><circle cx="8.5" cy="13.5" r="1.5"/><polyline points="15 21 11 16 5 21 5 10"/></svg>;
    case "select":   return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="8 10 12 14 16 10"/></svg>;
    case "checkbox": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 12 11 14 15 10"/></svg>;
    case "radio":    return <svg viewBox="0 0 24 24" style={s} {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>;
    case "button_group": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="2" y="7" width="6" height="10" rx="1"/><rect x="9" y="7" width="6" height="10" rx="1"/><rect x="16" y="7" width="6" height="10" rx="1"/></svg>;
    case "true_false": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="4" fill="currentColor" stroke="none"/></svg>;
    case "link":     return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case "post_object": return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>;
    case "page_link": return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 12 12 15 15 12"/></svg>;
    case "relationship": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="2" y="9" width="8" height="6" rx="1"/><rect x="14" y="9" width="8" height="6" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/><polyline points="12 9 14 12 12 15"/></svg>;
    case "taxonomy": return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
    case "user":     return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "google_map": return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case "date_picker": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "date_time_picker": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="4" width="14" height="14" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><circle cx="19" cy="19" r="4"/><polyline points="19 16 19 19 21 19"/></svg>;
    case "time_picker": return <svg viewBox="0 0 24 24" style={s} {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "color_picker": return <svg viewBox="0 0 24 24" style={s} {...p}><circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeWidth="2"/></svg>;
    case "message":  return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case "accordion": return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="3" y1="6" x2="21" y2="6"/><polyline points="3 12 9 12 12 15 15 12 21 12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
    case "tab":      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 12h4V7H3"/><path d="M8 12h5V7H8"/></svg>;
    case "group":    return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case "repeater": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="5" width="18" height="4" rx="1"/><rect x="3" y="11" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>;
    case "flexible_content": return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>;
    case "clone":    return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M3 16V5a2 2 0 0 1 2-2h11"/></svg>;
    default:         return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

const ROLE_LABELS: Record<string, string> = {
  administrator: "管理员", editor: "编辑", author: "作者",
  contributor: "投稿者", subscriber: "订阅者",
};
const ROLE_OPTIONS = ["administrator", "editor", "author", "contributor", "subscriber"]
  .map(r => ({ value: r, label: ROLE_LABELS[r] ?? r }));

const LOCATION_PARAMS = [
  { value: "post_type",         label: "文章类型" },
  { value: "post_status",       label: "文章状态" },
  { value: "current_user_role", label: "当前用户角色" },
  { value: "post_format",       label: "文章形式" },
  { value: "taxonomy",          label: "分类法" },
];

const LOCATION_PARAM_VALUES: Record<string, { value: string; label: string }[]> = {
  post_type: [
    { value: "post",       label: "文章" },
    { value: "page",       label: "页面" },
    { value: "attachment", label: "媒体" },
  ],
  post_status: [
    { value: "publish", label: "已发布" }, { value: "draft",   label: "草稿" },
    { value: "pending", label: "待审核" },   { value: "private", label: "私有" },
    { value: "future",  label: "定时发布" },
  ],
  current_user_role: [
    { value: "administrator", label: "管理员" }, { value: "editor",      label: "编辑" },
    { value: "author",        label: "作者" },   { value: "contributor", label: "投稿者" },
    { value: "subscriber",    label: "订阅者" },
  ],
  post_format: [
    { value: "0", label: "标准" }, { value: "aside", label: "日志" },
    { value: "gallery", label: "图库" }, { value: "link", label: "链接" },
    { value: "image", label: "图片" }, { value: "quote", label: "引用" },
    { value: "status", label: "状态" }, { value: "video", label: "视频" },
    { value: "audio", label: "音频" }, { value: "chat", label: "聊天" },
  ],
  taxonomy: [
    { value: "category", label: "分类" },
    { value: "post_tag", label: "标签" },
  ],
};

const HIDE_ON_SCREEN_OPTIONS = [
  { value: "permalink", label: "固定链接" }, { value: "the_content", label: "正文编辑器" },
  { value: "excerpt", label: "摘要" }, { value: "discussion", label: "讨论" },
  { value: "comments", label: "评论" }, { value: "revisions", label: "修订记录" },
  { value: "slug", label: "别名" }, { value: "author", label: "作者" },
  { value: "format", label: "形式" }, { value: "page_attributes", label: "页面属性" },
  { value: "featured_image", label: "特色图片" }, { value: "categories", label: "分类" },
  { value: "tags", label: "标签" }, { value: "send-trackbacks", label: "发送引用通告" },
];

function createField(type: ACFFieldType = "text"): ACFField {
  return {
    id: uid(), key: "field_" + uid(), label: "新字段",
    name: "new_field_" + uid().slice(0, 4), type,
    instructions: "", required: false, conditionalLogic: false,
    wrapper: { width: "", class: "", id: "" },
    ...(type === "repeater" || type === "group" ? { subFields: [] } : {}),
    ...(type === "flexible_content" ? { layouts: [] } : {}),
  };
}

function createGroup(): FieldGroup {
  return {
    id: uid(), key: "group_" + uid(), title: "新字段组",
    fields: [],
    location: [[{ param: "post_type", operator: "==", value: "post" }]],
    menuOrder: 0, position: "normal", labelPlacement: "top",
    instructionPlacement: "label", hideOnScreen: [], active: true,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  input:  { width: "100%", padding: "7px 10px", fontSize: "13px", border: "1px solid #8c8f94", borderRadius: "3px", outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  select: { width: "100%", padding: "7px 10px", fontSize: "13px", border: "1px solid #8c8f94", borderRadius: "3px", outline: "none" } as React.CSSProperties,
  label:  { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "#1d2327" } as React.CSSProperties,
  hint:   { fontSize: "11px", color: "#646970", marginTop: "3px" } as React.CSSProperties,
  row2:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" } as React.CSSProperties,
  row3:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" } as React.CSSProperties,
  sectionTitle: { fontSize: "11px", fontWeight: 700, color: "#646970", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" },
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
      {hint && <p style={S.hint}>{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
      <span style={{ display: "inline-block", width: "36px", height: "20px", background: checked ? "#2271b1" : "#c3c4c7", borderRadius: "10px", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: "2px", left: checked ? "18px" : "2px", width: "16px", height: "16px", background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
      </span>
      {label && <span style={{ color: "#1d2327" }}>{label}</span>}
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: "none" }} />
    </label>
  );
}

// ─── Choices Editor ───────────────────────────────────────────────────────────

function ChoicesEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="选项" hint="每行一个选项；如需分别指定值与显示文字，用冒号分隔，例如：red : 红色">
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={6}
        style={{ ...S.input, resize: "vertical", fontFamily: "monospace" }}
        placeholder={"red : 红色\ngreen : 绿色\nblue : 蓝色"}
      />
    </Field>
  );
}

function MultiCheckSelect({ value, options, onChange }: {
  value: string[]; options: { value: string; label: string }[]; onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {options.map(o => (
        <label key={o.value} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", cursor: "pointer" }}>
          <input type="checkbox" checked={value.includes(o.value)}
            onChange={e => { if (e.target.checked) onChange([...value, o.value]); else onChange(value.filter(v => v !== o.value)); }} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ─── Type-specific Options ────────────────────────────────────────────────────

function TypeOptions({ field, update }: { field: ACFField; update: (patch: Partial<ACFField>) => void }) {
  const u = (k: string, v: any) => update({ [k]: v });
  const t = field.type;

  if (["text", "email", "url"].includes(t)) {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row2}>
          <Field label="默认值"><input style={S.input} value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} /></Field>
          <Field label="占位提示"><input style={S.input} value={field.placeholder ?? ""} onChange={e => u("placeholder", e.target.value)} /></Field>
          <Field label="前缀"><input style={S.input} value={field.prepend ?? ""} onChange={e => u("prepend", e.target.value)} /></Field>
          <Field label="后缀"><input style={S.input} value={field.append ?? ""} onChange={e => u("append", e.target.value)} /></Field>
          {t === "text" && <Field label="字符上限" hint="留空表示不限制"><input style={S.input} type="number" value={field.maxlength ?? ""} onChange={e => u("maxlength", e.target.value)} /></Field>}
        </div>
        {t === "text" && (
          <div style={{ display: "flex", gap: "20px" }}>
            <Toggle checked={!!field.readonly} onChange={v => u("readonly", v)} label="只读" />
            <Toggle checked={!!field.disabled} onChange={v => u("disabled", v)} label="禁用" />
          </div>
        )}
      </div>
    );
  }

  if (t === "textarea") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row2}>
          <Field label="默认值"><textarea style={{ ...S.input, resize: "vertical" }} rows={3} value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} /></Field>
          <div>
            <Field label="占位提示"><input style={S.input} value={field.placeholder ?? ""} onChange={e => u("placeholder", e.target.value)} /></Field>
            <div style={{ marginTop: "14px" }}><Field label="行数"><input style={S.input} type="number" value={field.rows ?? 8} onChange={e => u("rows", e.target.value)} /></Field></div>
          </div>
          <Field label="换行处理" hint="如何处理换行字符">
            <select style={S.select} value={field.newLines ?? "wpautop"} onChange={e => u("newLines", e.target.value)}>
              <option value="wpautop">自动分段（包裹段落标签）</option>
              <option value="br">自动添加 &lt;br&gt; 换行</option>
              <option value="">不做处理</option>
            </select>
          </Field>
          <Field label="字符数量限制"><input style={S.input} type="number" value={field.maxlength ?? ""} onChange={e => u("maxlength", e.target.value)} /></Field>
        </div>
      </div>
    );
  }

  if (t === "number" || t === "range") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row2}>
          <Field label="默认值"><input style={S.input} type="number" value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} /></Field>
          <Field label="占位提示"><input style={S.input} value={field.placeholder ?? ""} onChange={e => u("placeholder", e.target.value)} /></Field>
          <Field label="最小值"><input style={S.input} type="number" value={field.min ?? ""} onChange={e => u("min", e.target.value)} /></Field>
          <Field label="最大值"><input style={S.input} type="number" value={field.max ?? ""} onChange={e => u("max", e.target.value)} /></Field>
          <Field label="步长"><input style={S.input} type="number" value={field.step ?? ""} onChange={e => u("step", e.target.value)} /></Field>
          {t === "number" && <Field label="前缀"><input style={S.input} value={field.prepend ?? ""} onChange={e => u("prepend", e.target.value)} /></Field>}
          {t === "number" && <Field label="后缀"><input style={S.input} value={field.append ?? ""} onChange={e => u("append", e.target.value)} /></Field>}
        </div>
      </div>
    );
  }

  if (t === "password") {
    return (
      <div style={S.row2}>
        <Field label="占位提示"><input style={S.input} value={field.placeholder ?? ""} onChange={e => u("placeholder", e.target.value)} /></Field>
        <div />
        <Toggle checked={!!field.readonly} onChange={v => u("readonly", v)} label="只读" />
        <Toggle checked={!!field.disabled} onChange={v => u("disabled", v)} label="禁用" />
      </div>
    );
  }

  if (t === "image" || t === "gallery") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row2}>
          <Field label="返回格式">
            <select style={S.select} value={field.returnFormat ?? "array"} onChange={e => u("returnFormat", e.target.value)}>
              <option value="array">数组</option>
              <option value="url">URL</option>
              <option value="id">图片 ID</option>
            </select>
          </Field>
          <Field label="预览尺寸">
            <select style={S.select} value={field.previewSize ?? "medium"} onChange={e => u("previewSize", e.target.value)}>
              <option value="thumbnail">缩略图</option>
              <option value="medium">中等</option>
              <option value="large">大图</option>
            </select>
          </Field>
        </div>
        <Field label="允许的文件类型" hint="多个类型用逗号分隔，例如 image/jpeg,image/png"><input style={S.input} value={field.mimeTypes ?? ""} onChange={e => u("mimeTypes", e.target.value)} /></Field>
        {t === "gallery" && (
          <div style={S.row2}>
            <Field label="最小值"><input style={S.input} type="number" value={field.min ?? ""} onChange={e => u("min", e.target.value)} /></Field>
            <Field label="最大值"><input style={S.input} type="number" value={field.max ?? ""} onChange={e => u("max", e.target.value)} /></Field>
          </div>
        )}
      </div>
    );
  }

  if (t === "file") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <Field label="返回格式">
          <select style={S.select} value={field.returnFormat ?? "array"} onChange={e => u("returnFormat", e.target.value)}>
            <option value="array">数组</option>
            <option value="url">URL</option>
            <option value="id">文件 ID</option>
          </select>
        </Field>
        <Field label="允许的文件类型" hint="多个类型用逗号分隔，留空表示全部允许">
          <input style={S.input} value={field.mimeTypes ?? ""} onChange={e => u("mimeTypes", e.target.value)} />
        </Field>
      </div>
    );
  }

  if (t === "wysiwyg") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <Field label="默认值"><textarea style={{ ...S.input, resize: "vertical" }} rows={3} value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} /></Field>
        <div style={S.row2}>
          <Field label="编辑器标签页">
            <select style={S.select} value={field.tabs ?? "all"} onChange={e => u("tabs", e.target.value)}>
              <option value="all">可视化与文本</option>
              <option value="visual">仅可视化</option>
              <option value="text">仅文本</option>
            </select>
          </Field>
          <Field label="工具栏">
            <select style={S.select} value={field.toolbar ?? "full"} onChange={e => u("toolbar", e.target.value)}>
              <option value="full">完整</option>
              <option value="basic">基础</option>
            </select>
          </Field>
        </div>
        <div style={S.row2}>
          <Toggle checked={!!field.mediaUpload} onChange={v => u("mediaUpload", v)} label="显示媒体上传按钮" />
          <Toggle checked={field.escHtml !== false} onChange={v => u("escHtml", v)} label="转义 HTML" />
        </div>
      </div>
    );
  }

  if (t === "select") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <ChoicesEditor value={field.choices ?? ""} onChange={v => u("choices", v)} />
        <div style={S.row2}>
          <Field label="默认值"><input style={S.input} value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} /></Field>
          <Field label="返回格式">
            <select style={S.select} value={field.returnFormat ?? "value"} onChange={e => u("returnFormat", e.target.value)}>
              <option value="value">值</option>
              <option value="label">标签</option>
              <option value="array">两者（数组）</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Toggle checked={!!field.multiple} onChange={v => u("multiple", v)} label="允许多选" />
          <Toggle checked={!!field.allowNull} onChange={v => u("allowNull", v)} label="允许为空" />
          <Toggle checked={!!field.ui} onChange={v => u("ui", v)} label="美化样式" />
          <Toggle checked={!!field.ajax} onChange={v => u("ajax", v)} label="使用 AJAX 加载" />
        </div>
      </div>
    );
  }

  if (t === "checkbox" || t === "radio" || t === "button_group") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <ChoicesEditor value={field.choices ?? ""} onChange={v => u("choices", v)} />
        <div style={S.row2}>
          {t === "checkbox" && <Field label="默认值"><input style={S.input} value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} /></Field>}
          <Field label="返回格式">
            <select style={S.select} value={field.returnFormat ?? "value"} onChange={e => u("returnFormat", e.target.value)}>
              <option value="value">值</option>
              <option value="label">标签</option>
              <option value="array">两者（数组）</option>
            </select>
          </Field>
          <Field label="布局">
            <select style={S.select} value={field.layout ?? "vertical"} onChange={e => u("layout", e.target.value)}>
              <option value="vertical">纵向</option>
              <option value="horizontal">横向</option>
            </select>
          </Field>
        </div>
        {t === "checkbox" && (
          <div style={{ display: "flex", gap: "24px" }}>
            <Toggle checked={!!field.allowCustom} onChange={v => u("allowCustom", v)} label="允许自定义" />
            <Toggle checked={!!field.saveCustom} onChange={v => u("saveCustom", v)} label="保存自定义项" />
            <Toggle checked={!!field.toggleAll} onChange={v => u("toggleAll", v)} label="全选切换" />
          </div>
        )}
        {t === "radio" && (
          <div style={{ display: "flex", gap: "24px" }}>
            <Toggle checked={!!field.allowNull} onChange={v => u("allowNull", v)} label="允许为空" />
            <Toggle checked={!!field.otherChoice} onChange={v => u("otherChoice", v)} label="提供「其他」选项" />
            <Toggle checked={!!field.saveOther} onChange={v => u("saveOther", v)} label="保存「其他」内容" />
          </div>
        )}
      </div>
    );
  }

  if (t === "true_false") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row2}>
          <Field label="显示文字" hint="开关旁边展示的提示文字"><input style={S.input} value={field.message ?? ""} onChange={e => u("message", e.target.value)} /></Field>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "4px" }}>
            <Toggle checked={!!field.defaultValue} onChange={v => u("defaultValue", v)} label="默认开启" />
          </div>
        </div>
        <Toggle checked={!!field.ui} onChange={v => u("ui", v)} label="美化开关样式" />
        {field.ui && (
          <div style={S.row2}>
            <Field label="开启时文字"><input style={S.input} value={field.uiOnText ?? "是"} onChange={e => u("uiOnText", e.target.value)} /></Field>
            <Field label="关闭时文字"><input style={S.input} value={field.uiOffText ?? "否"} onChange={e => u("uiOffText", e.target.value)} /></Field>
          </div>
        )}
      </div>
    );
  }

  if (t === "link") {
    return (
      <Field label="返回格式">
        <select style={{ ...S.select, width: "auto" }} value={field.returnFormat ?? "array"} onChange={e => u("returnFormat", e.target.value)}>
          <option value="array">数组</option>
          <option value="url">URL</option>
        </select>
      </Field>
    );
  }

  if (t === "post_object" || t === "relationship") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <Field label="按文章类型筛选" hint="留空显示全部文章类型">
          <MultiCheckSelect
            value={field.postType ?? []}
            options={[
              { value: "post", label: "文章" }, { value: "page", label: "页面" },
            ]}
            onChange={v => u("postType", v)}
          />
        </Field>
        <div style={S.row2}>
          <Field label="返回格式">
            <select style={S.select} value={field.returnFormat ?? "object"} onChange={e => u("returnFormat", e.target.value)}>
              <option value="object">文章对象</option>
              <option value="id">文章 ID</option>
            </select>
          </Field>
          {t === "relationship" && (
            <Field label="最多可选数量"><input style={S.input} type="number" value={field.max ?? ""} onChange={e => u("max", e.target.value)} /></Field>
          )}
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Toggle checked={!!field.allowNull} onChange={v => u("allowNull", v)} label="允许为空" />
          {t === "post_object" && <Toggle checked={!!field.multiple} onChange={v => u("multiple", v)} label="允许多选" />}
        </div>
      </div>
    );
  }

  if (t === "page_link") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "flex", gap: "24px" }}>
          <Toggle checked={!!field.allowNull} onChange={v => u("allowNull", v)} label="允许为空" />
          <Toggle checked={!!field.multiple} onChange={v => u("multiple", v)} label="允许多选" />
        </div>
      </div>
    );
  }

  if (t === "taxonomy") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row3}>
          <Field label="分类法">
            <select style={S.select} value={field.taxonomy ?? "category"} onChange={e => u("taxonomy", e.target.value)}>
              <option value="category">分类</option>
              <option value="post_tag">标签</option>
            </select>
          </Field>
          <Field label="外观样式">
            <select style={S.select} value={field.fieldType ?? "checkbox"} onChange={e => u("fieldType", e.target.value)}>
              <option value="checkbox">复选框</option>
              <option value="multi_select">多选框</option>
              <option value="radio">单选按钮</option>
              <option value="select">下拉选择</option>
            </select>
          </Field>
          <Field label="返回格式">
            <select style={S.select} value={field.returnFormat ?? "id"} onChange={e => u("returnFormat", e.target.value)}>
              <option value="object">术语对象</option>
              <option value="id">术语 ID</option>
              <option value="slug">别名</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Toggle checked={!!field.addTerm} onChange={v => u("addTerm", v)} label="允许新建术语" />
          <Toggle checked={!!field.saveTerms} onChange={v => u("saveTerms", v)} label="保存术语" />
          <Toggle checked={!!field.loadTerms} onChange={v => u("loadTerms", v)} label="异步加载术语" />
        </div>
      </div>
    );
  }

  if (t === "user") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <Field label="按角色筛选">
          <MultiCheckSelect value={field.role ?? []}
            options={ROLE_OPTIONS}
            onChange={v => u("role", v)}
          />
        </Field>
        <div style={S.row2}>
          <Field label="返回格式">
            <select style={S.select} value={field.returnFormat ?? "array"} onChange={e => u("returnFormat", e.target.value)}>
              <option value="array">数组</option>
              <option value="object">用户对象</option>
              <option value="id">用户 ID</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Toggle checked={!!field.allowNull} onChange={v => u("allowNull", v)} label="允许为空" />
          <Toggle checked={!!field.multiple} onChange={v => u("multiple", v)} label="允许多选" />
        </div>
      </div>
    );
  }

  if (t === "date_picker" || t === "date_time_picker") {
    return (
      <div style={S.row3}>
        <Field label="显示格式"><input style={S.input} value={field.displayFormat ?? (t === "date_picker" ? "d/m/Y" : "d/m/Y g:i a")} onChange={e => u("displayFormat", e.target.value)} /></Field>
        <Field label="返回格式"><input style={S.input} value={field.returnFormat ?? (t === "date_picker" ? "Ymd" : "Y-m-d H:i:s")} onChange={e => u("returnFormat", e.target.value)} /></Field>
        <Field label="每周起始日">
          <select style={S.select} value={String(field.firstDay ?? 0)} onChange={e => u("firstDay", Number(e.target.value))}>
            {["周日","周一","周二","周三","周四","周五","周六"].map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
      </div>
    );
  }

  if (t === "time_picker") {
    return (
      <div style={S.row2}>
        <Field label="显示格式"><input style={S.input} value={field.displayFormat ?? "g:i a"} onChange={e => u("displayFormat", e.target.value)} /></Field>
        <Field label="返回格式"><input style={S.input} value={field.returnFormat ?? "H:i:s"} onChange={e => u("returnFormat", e.target.value)} /></Field>
      </div>
    );
  }

  if (t === "color_picker") {
    return (
      <div style={S.row3}>
        <Field label="默认值"><input style={S.input} value={field.defaultValue ?? ""} onChange={e => u("defaultValue", e.target.value)} placeholder="#ffffff" /></Field>
        <Field label="返回格式">
          <select style={S.select} value={field.returnFormat ?? "string"} onChange={e => u("returnFormat", e.target.value)}>
            <option value="string">字符串</option>
            <option value="array">数组（r,g,b,a）</option>
          </select>
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "4px" }}>
          <Toggle checked={!!field.enableOpacity} onChange={v => u("enableOpacity", v)} label="启用透明度" />
        </div>
      </div>
    );
  }

  if (t === "google_map") {
    return (
      <div style={S.row3}>
        <Field label="中心纬度"><input style={S.input} value={field.centerLat ?? ""} onChange={e => u("centerLat", e.target.value)} /></Field>
        <Field label="中心经度"><input style={S.input} value={field.centerLng ?? ""} onChange={e => u("centerLng", e.target.value)} /></Field>
        <Field label="缩放级别"><input style={S.input} type="number" value={field.zoom ?? 14} onChange={e => u("zoom", e.target.value)} /></Field>
        <Field label="高度（像素）"><input style={S.input} type="number" value={field.height ?? 400} onChange={e => u("height", e.target.value)} /></Field>
      </div>
    );
  }

  if (t === "message") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <Field label="提示文字">
          <textarea style={{ ...S.input, resize: "vertical" }} rows={3} value={field.message ?? ""} onChange={e => u("message", e.target.value)} />
        </Field>
        <div style={S.row2}>
          <Field label="换行处理">
            <select style={S.select} value={field.newLines ?? "wpautop"} onChange={e => u("newLines", e.target.value)}>
              <option value="wpautop">自动分段（包裹段落标签）</option>
              <option value="br">自动添加 &lt;br&gt; 换行</option>
              <option value="">不做处理</option>
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "4px" }}>
            <Toggle checked={field.escHtml !== false} onChange={v => u("escHtml", v)} label="转义 HTML" />
          </div>
        </div>
      </div>
    );
  }

  if (t === "accordion") {
    return (
      <div style={{ display: "flex", gap: "24px" }}>
        <Toggle checked={!!field.open} onChange={v => u("open", v)} label="默认展开" />
        <Toggle checked={!!field.multiExpand} onChange={v => u("multiExpand", v)} label="允许同时展开多个" />
        <Toggle checked={!!field.endpoint} onChange={v => u("endpoint", v)} label="作为端点" />
      </div>
    );
  }

  if (t === "tab") {
    return (
      <div style={{ display: "flex", gap: "24px" }}>
        <Field label="摆放位置">
          <select style={{ ...S.select, width: "auto" }} value={field.placement ?? "top"} onChange={e => u("placement", e.target.value)}>
            <option value="top">顶部对齐</option>
            <option value="left">靠左对齐</option>
          </select>
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "4px" }}>
          <Toggle checked={!!field.endpoint} onChange={v => u("endpoint", v)} label="作为端点" />
        </div>
      </div>
    );
  }

  if (t === "group") {
    return (
      <Field label="布局">
        <select style={{ ...S.select, width: "auto" }} value={field.layout ?? "block"} onChange={e => u("layout", e.target.value)}>
          <option value="block">块状</option>
          <option value="table">表格</option>
          <option value="row">行内</option>
        </select>
      </Field>
    );
  }

  if (t === "repeater") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={S.row3}>
          <Field label="最少行数"><input style={S.input} type="number" value={field.min ?? ""} onChange={e => u("min", e.target.value)} /></Field>
          <Field label="最多行数"><input style={S.input} type="number" value={field.max ?? ""} onChange={e => u("max", e.target.value)} /></Field>
          <Field label="布局">
            <select style={S.select} value={field.layout ?? "table"} onChange={e => u("layout", e.target.value)}>
              <option value="table">表格</option>
              <option value="block">块状</option>
              <option value="row">行内</option>
            </select>
          </Field>
          <Field label="按钮文字"><input style={S.input} value={field.buttonLabel ?? "添加一行"} onChange={e => u("buttonLabel", e.target.value)} /></Field>
        </div>
      </div>
    );
  }

  if (t === "flexible_content") {
    return (
      <div style={S.row3}>
        <Field label="最少布局数"><input style={S.input} type="number" value={field.min ?? ""} onChange={e => u("min", e.target.value)} /></Field>
        <Field label="最多布局数"><input style={S.input} type="number" value={field.max ?? ""} onChange={e => u("max", e.target.value)} /></Field>
        <Field label="按钮文字"><input style={S.input} value={field.buttonLabel ?? "添加布局"} onChange={e => u("buttonLabel", e.target.value)} /></Field>
      </div>
    );
  }

  if (t === "clone") {
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <Field label="要克隆的字段键 / 字段组键（每行一个）">
          <textarea style={{ ...S.input, fontFamily: "monospace", resize: "vertical" }} rows={4}
            value={(field.clone ?? []).join("\n")}
            onChange={e => u("clone", e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean))}
          />
        </Field>
        <div style={S.row2}>
          <Field label="展示方式">
            <select style={S.select} value={field.display ?? "seamless"} onChange={e => u("display", e.target.value)}>
              <option value="seamless">无缝</option>
              <option value="group">分组</option>
            </select>
          </Field>
          <Field label="布局">
            <select style={S.select} value={field.layout ?? "block"} onChange={e => u("layout", e.target.value)}>
              <option value="block">块状</option>
              <option value="table">表格</option>
              <option value="row">行内</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Toggle checked={!!field.prefixLabel} onChange={v => u("prefixLabel", v)} label="字段标签加前缀" />
          <Toggle checked={!!field.prefixName} onChange={v => u("prefixName", v)} label="字段键名加前缀" />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Conditional Logic Editor ─────────────────────────────────────────────────

function ConditionalLogicEditor({ field, allFields, update }: {
  field: ACFField; allFields: ACFField[]; update: (patch: Partial<ACFField>) => void;
}) {
  const enabled = field.conditionalLogic !== false;
  const rules: any[][] = (enabled && Array.isArray(field.conditionalLogic)) ? field.conditionalLogic : [];
  const OPERATORS = [
    { value: "==", label: "等于" }, { value: "!=", label: "不等于" },
    { value: ">",  label: "大于" }, { value: "<",  label: "小于" },
    { value: "=empty", label: "为空" }, { value: "!=empty", label: "不为空" },
  ];
  const setRules = (nr: any[][]) => update({ conditionalLogic: nr.length ? nr : false });
  const eligibleFields = allFields.filter(f => f.id !== field.id && !["message","accordion","tab"].includes(f.type));

  return (
    <div>
      <Toggle checked={enabled} onChange={v => update({ conditionalLogic: v ? [[{ field: "", operator: "==", value: "" }]] : false })} label="启用条件逻辑" />
      {enabled && (
        <div style={{ marginTop: "12px" }}>
          {rules.map((andGroup, gi) => (
            <div key={gi} style={{ marginBottom: "8px", padding: "10px", background: "#f6f7f7", border: "1px solid #dcdcde", borderRadius: "3px" }}>
              {gi > 0 && <div style={{ fontSize: "11px", fontWeight: 700, color: "#646970", marginBottom: "6px" }}>或</div>}
              {andGroup.map((rule, ri) => (
                <div key={ri}>
                  {ri > 0 && <div style={{ fontSize: "11px", fontWeight: 700, color: "#646970", margin: "4px 0" }}>且</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                    <select style={S.select} value={rule.field ?? ""} onChange={e => { const ng = rules.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, field: e.target.value } : r) : g); setRules(ng); }}>
                      <option value="">选择字段…</option>
                      {eligibleFields.map(f => <option key={f.id} value={f.key}>{f.label}</option>)}
                    </select>
                    <select style={S.select} value={rule.operator ?? "=="} onChange={e => { const ng = rules.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, operator: e.target.value } : r) : g); setRules(ng); }}>
                      {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    <input style={S.input} value={rule.value ?? ""} onChange={e => { const ng = rules.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, value: e.target.value } : r) : g); setRules(ng); }} placeholder="条件值" />
                    <button onClick={() => { const ng = rules.map((g, i) => i === gi ? g.filter((_, j) => j !== ri) : g).filter(g => g.length > 0); setRules(ng); }} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { const ng = rules.map((g, i) => i === gi ? [...g, { field: "", operator: "==", value: "" }] : g); setRules(ng); }} style={{ fontSize: "11px", color: "#2271b1", background: "none", border: "1px solid #2271b1", borderRadius: "3px", padding: "3px 8px", cursor: "pointer" }}>+ 添加条件</button>
                <button onClick={() => setRules(rules.filter((_, i) => i !== gi))} style={{ fontSize: "11px", color: "#d63638", background: "none", border: "1px solid #d63638", borderRadius: "3px", padding: "3px 8px", cursor: "pointer" }}>删除本组</button>
              </div>
            </div>
          ))}
          <button onClick={() => setRules([...rules, [{ field: "", operator: "==", value: "" }]])} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", padding: "5px 12px", cursor: "pointer" }}>
            + 添加规则组（或）
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Flex Layout Editor ───────────────────────────────────────────────────────

function FlexLayoutEditor({ field, update, allFields }: { field: ACFField; update: (patch: Partial<ACFField>) => void; allFields: ACFField[] }) {
  const layouts = field.layouts ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const setLayouts = (l: FlexLayout[]) => update({ layouts: l });
  const addLayout = () => {
    const l: FlexLayout = { id: uid(), key: "layout_" + uid(), label: "新布局", name: "new_layout_" + uid().slice(0, 4), display: "block", min: "", max: "", subFields: [] };
    setLayouts([...layouts, l]); setExpandedId(l.id);
  };
  const updateLayout = (id: string, patch: Partial<FlexLayout>) => setLayouts(layouts.map(l => l.id === id ? { ...l, ...patch } : l));

  return (
    <div>
      <p style={S.sectionTitle}>布局</p>
      {layouts.map((layout) => (
        <div key={layout.id} style={{ border: "1px solid #dcdcde", borderRadius: "3px", marginBottom: "6px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#f6f7f7", cursor: "pointer" }}
            onClick={() => setExpandedId(expandedId === layout.id ? null : layout.id)}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#646970" }}>{expandedId === layout.id ? "▼" : "▶"}</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#1d2327", flex: 1 }}>{layout.label || "未命名布局"}</span>
            <button onClick={e => { e.stopPropagation(); setLayouts(layouts.filter(l => l.id !== layout.id)); }} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "16px" }}>×</button>
          </div>
          {expandedId === layout.id && (
            <div style={{ padding: "16px" }}>
              <div style={{ ...S.row3, marginBottom: "14px" }}>
                <Field label="字段标签"><input style={S.input} value={layout.label} onChange={e => updateLayout(layout.id, { label: e.target.value })} /></Field>
                <Field label="字段键名"><input style={S.input} value={layout.name} onChange={e => updateLayout(layout.id, { name: e.target.value })} /></Field>
                <Field label="展示方式">
                  <select style={S.select} value={layout.display} onChange={e => updateLayout(layout.id, { display: e.target.value as any })}>
                    <option value="block">块状</option><option value="table">表格</option><option value="row">行内</option>
                  </select>
                </Field>
                <Field label="最少行数"><input style={S.input} type="number" value={layout.min} onChange={e => updateLayout(layout.id, { min: e.target.value })} /></Field>
                <Field label="最多行数"><input style={S.input} type="number" value={layout.max} onChange={e => updateLayout(layout.id, { max: e.target.value })} /></Field>
              </div>
              <p style={S.sectionTitle}>子字段</p>
              <NestedFieldList fields={layout.subFields} onChange={sf => updateLayout(layout.id, { subFields: sf })} parentFields={allFields} depth={2} />
            </div>
          )}
        </div>
      ))}
      <button onClick={addLayout} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", padding: "6px 14px", cursor: "pointer", width: "100%" }}>
        + 添加布局
      </button>
    </div>
  );
}

// ─── Nested Field List (for sub-fields in repeater/group) ─────────────────────

function NestedFieldList({ fields, onChange, parentFields, depth = 1 }: {
  fields: ACFField[]; onChange: (f: ACFField[]) => void; parentFields: ACFField[]; depth?: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const autoName = (l: string) => l.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const addField = (type: ACFFieldType) => {
    const f = createField(type); onChange([...fields, f]); setExpandedId(f.id);
  };
  const updateField = (id: string, patch: Partial<ACFField>) => onChange(fields.map(f => f.id === id ? { ...f, ...patch } : f));
  const deleteField = (id: string) => onChange(fields.filter(f => f.id !== id));
  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex(f => f.id === id);
    if (idx + dir < 0 || idx + dir >= fields.length) return;
    const arr = [...fields]; [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]]; onChange(arr);
  };

  return (
    <div>
      {fields.map((field, idx) => {
        const meta = getFieldMeta(field.type);
        const expanded = expandedId === field.id;
        return (
          <div key={field.id} style={{ border: "1px solid #dcdcde", borderRadius: "3px", marginBottom: "4px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", background: expanded ? "#f0f6fc" : "#fff", cursor: "pointer", borderLeft: expanded ? "3px solid #2271b1" : "3px solid transparent" }}
              onClick={() => setExpandedId(expanded ? null : field.id)}>
              <span style={{ color: "#2271b1", display: "flex" }}><FieldTypeIcon type={field.type} size={13} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#1d2327" }}>{field.label || "未命名"}</span>
                <span style={{ fontSize: "11px", color: "#646970", fontFamily: "monospace", marginLeft: "8px" }}>{field.name}</span>
              </div>
              <span style={{ fontSize: "10px", background: "#f0f0f1", color: "#50575e", padding: "1px 6px", borderRadius: "8px" }}>{meta.label}</span>
              <div style={{ display: "flex", gap: "3px" }} onClick={e => e.stopPropagation()}>
                <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: idx === 0 ? "#c3c4c7" : "#646970" }}>▲</button>
                <button onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: idx === fields.length - 1 ? "#c3c4c7" : "#646970" }}>▼</button>
                <button onClick={() => deleteField(field.id)} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: "#d63638" }}>✕</button>
              </div>
            </div>
            {expanded && (
              <div style={{ padding: "14px", borderTop: "1px solid #e0e0e0", background: "#fafafa", display: "grid", gap: "12px" }}>
                <div style={S.row2}>
                  <Field label="字段标签"><input style={S.input} value={field.label} onChange={e => { const label = e.target.value; updateField(field.id, { label, name: field.name || autoName(label) }); }} /></Field>
                  <Field label="字段键名"><input style={S.input} value={field.name} onChange={e => updateField(field.id, { name: e.target.value })} /></Field>
                </div>
                <div style={S.row2}>
                  <Field label="字段类型">
                    <select style={S.select} value={field.type} onChange={e => {
                      const nf = createField(e.target.value as ACFFieldType);
                      updateField(field.id, { ...nf, id: field.id, key: field.key, label: field.label, name: field.name, instructions: field.instructions, required: field.required, conditionalLogic: field.conditionalLogic, wrapper: field.wrapper });
                    }}>
                      {getCategories().map(cat => (
                        <optgroup key={cat} label={cat}>
                          {getByCategory(cat).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field label="填写说明"><input style={S.input} value={field.instructions} onChange={e => updateField(field.id, { instructions: e.target.value })} /></Field>
                </div>
                <Toggle checked={field.required} onChange={v => updateField(field.id, { required: v })} label="必填" />
                {TypeOptions && <TypeOptions field={field} update={patch => updateField(field.id, patch)} />}
              </div>
            )}
          </div>
        );
      })}
      <NestedAddField depth={depth} onAdd={addField} />
    </div>
  );
}

function NestedAddField({ depth, onAdd }: { depth: number; onAdd: (t: ACFFieldType) => void }) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState("基础");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ display: "block", width: "100%", padding: "7px", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", color: "#2271b1", fontSize: "12px", cursor: "pointer", marginTop: "4px" }}>
        + 添加{depth > 1 ? "子" : ""}字段
      </button>
    );
  }
  return (
    <div style={{ border: "1px solid #dcdcde", borderRadius: "3px", marginTop: "4px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f6f7f7", borderBottom: "1px solid #dcdcde" }}>
        <span style={{ fontSize: "12px", fontWeight: 700 }}>选择字段类型</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#646970", fontSize: "16px" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr" }}>
        <div style={{ borderRight: "1px solid #dcdcde", padding: "6px 0" }}>
          {getCategories().map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", fontSize: "12px", border: "none", background: cat === activeCat ? "#f0f6fc" : "none", color: cat === activeCat ? "#2271b1" : "#1d2327", cursor: "pointer", fontWeight: cat === activeCat ? 600 : 400, borderLeft: cat === activeCat ? "3px solid #2271b1" : "3px solid transparent" }}>
              {cat}
            </button>
          ))}
        </div>
        <div style={{ padding: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", alignContent: "start" }}>
          {getByCategory(activeCat).map(([type, meta]) => (
            <button key={type} onClick={() => { onAdd(type as ACFFieldType); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 10px", border: "1px solid #dcdcde", borderRadius: "3px", background: "#fff", cursor: "pointer", fontSize: "11px", color: "#1d2327", textAlign: "left" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f0f6fc"; e.currentTarget.style.borderColor = "#2271b1"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#dcdcde"; }}>
              <span style={{ color: "#2271b1", display: "flex" }}><FieldTypeIcon type={type} size={12} /></span>
              {meta.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Canvas Field Card ────────────────────────────────────────────────────────

function CanvasField({ field, selected, onSelect, onDelete, onMove, isFirst, isLast, isDragOver, onDragStart, onDragOver, onDrop }: {
  field: ACFField; selected: boolean; onSelect: () => void; onDelete: () => void;
  onMove: (d: -1 | 1) => void; isFirst: boolean; isLast: boolean;
  isDragOver: boolean; onDragStart: () => void; onDragOver: () => void; onDrop: () => void;
}) {
  const meta = getFieldMeta(field.type);
  return (
    <div
      draggable onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onClick={onSelect}
      style={{
        border: `1px solid ${selected ? "#2271b1" : isDragOver ? "#f0a500" : "#dcdcde"}`,
        borderLeft: `3px solid ${selected ? "#2271b1" : "#dcdcde"}`,
        borderRadius: "3px", marginBottom: "4px", cursor: "pointer", userSelect: "none",
        background: selected ? "#f0f6fc" : "#fff", opacity: isDragOver ? 0.7 : 1,
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "11px", color: "#c3c4c7", cursor: "grab" }}>⠿⠿</span>
        <span style={{ color: selected ? "#2271b1" : "#646970", display: "flex" }}><FieldTypeIcon type={field.type} size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1d2327" }}>{field.label || "未命名"}</span>
          {field.required && <span style={{ color: "#d63638", marginLeft: "3px", fontWeight: 700 }}>*</span>}
          <span style={{ fontSize: "11px", color: "#646970", fontFamily: "monospace", marginLeft: "8px" }}>{field.name}</span>
        </div>
        <span style={{ fontSize: "10px", background: "#f0f0f1", color: "#50575e", padding: "2px 7px", borderRadius: "8px", flexShrink: 0 }}>{meta.label}</span>
        <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onMove(-1)} disabled={isFirst} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: isFirst ? "#c3c4c7" : "#646970" }}>▲</button>
          <button onClick={() => onMove(1)} disabled={isLast} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: isLast ? "#c3c4c7" : "#646970" }}>▼</button>
          <button onClick={onDelete} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: "#d63638" }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── Field Settings Panel (right column) ─────────────────────────────────────

function FieldSettingsPanel({ field, onUpdate, allFields, onClose }: {
  field: ACFField; onUpdate: (patch: Partial<ACFField>) => void; allFields: ACFField[]; onClose: () => void;
}) {
  const [showWrapper, setShowWrapper] = useState(false);
  const u = (k: string, v: any) => onUpdate({ [k]: v });
  const meta = getFieldMeta(field.type);
  const autoName = (l: string) => l.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const hasSubFields = field.type === "repeater" || field.type === "group";
  const hasFlex = field.type === "flexible_content";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #dcdcde", display: "flex", alignItems: "center", gap: "8px", background: "#f6f7f7", flexShrink: 0 }}>
        <span style={{ color: "#2271b1", display: "flex" }}><FieldTypeIcon type={field.type} size={16} /></span>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d2327", flex: 1 }}>字段设置</span>
        <span style={{ fontSize: "11px", background: "#e0e7f3", color: "#2271b1", padding: "2px 7px", borderRadius: "8px" }}>{meta.label}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#646970", fontSize: "18px", lineHeight: 1 }}>×</button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "grid", gap: "16px", alignContent: "start" }}>

        {/* Label + Name */}
        <div style={S.row2}>
          <Field label="字段标签">
            <input style={S.input} value={field.label} onChange={e => {
              const label = e.target.value;
              onUpdate({ label, name: field.name || autoName(label) });
            }} />
          </Field>
          <Field label="字段键名" hint="不能包含空格，允许使用下划线和连字符。">
            <input style={S.input} value={field.name} onChange={e => u("name", e.target.value)} />
          </Field>
        </div>

        {/* Field Type + Instructions */}
        <div style={S.row2}>
          <Field label="字段类型">
            <select style={S.select} value={field.type} onChange={e => {
              const nf = createField(e.target.value as ACFFieldType);
              onUpdate({ ...nf, id: field.id, key: field.key, label: field.label, name: field.name, instructions: field.instructions, required: field.required, conditionalLogic: field.conditionalLogic, wrapper: field.wrapper });
            }}>
              {getCategories().map(cat => (
                <optgroup key={cat} label={cat}>
                  {getByCategory(cat).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="填写说明" hint="编辑文章时展示给作者的提示文字">
            <input style={S.input} value={field.instructions} onChange={e => u("instructions", e.target.value)} />
          </Field>
        </div>

        {/* Required */}
        <Toggle checked={field.required} onChange={v => u("required", v)} label="必填字段" />

        {/* Type-specific settings */}
        {!["message","accordion","tab"].includes(field.type) && (
          <div style={{ background: "#f6f7f7", border: "1px solid #e0e0e0", borderRadius: "3px", padding: "14px" }}>
            <p style={S.sectionTitle}>字段设置</p>
            <TypeOptions field={field} update={onUpdate} />
          </div>
        )}

        {/* Sub-fields for repeater / group */}
        {hasSubFields && (
          <div style={{ background: "#f6f7f7", border: "1px solid #e0e0e0", borderRadius: "3px", padding: "14px" }}>
            <p style={S.sectionTitle}>子字段</p>
            <NestedFieldList
              fields={field.subFields ?? []}
              onChange={sf => u("subFields", sf)}
              parentFields={allFields}
              depth={2}
            />
          </div>
        )}

        {/* Flex layouts */}
        {hasFlex && (
          <div style={{ background: "#f6f7f7", border: "1px solid #e0e0e0", borderRadius: "3px", padding: "14px" }}>
            <FlexLayoutEditor field={field} update={onUpdate} allFields={allFields} />
          </div>
        )}

        {/* Conditional Logic */}
        <div style={{ background: "#f6f7f7", border: "1px solid #e0e0e0", borderRadius: "3px", padding: "14px" }}>
          <p style={S.sectionTitle}>条件逻辑</p>
          <ConditionalLogicEditor field={field} allFields={allFields} update={onUpdate} />
        </div>

        {/* Wrapper Attributes */}
        <div style={{ border: "1px solid #e0e0e0", borderRadius: "3px", overflow: "hidden" }}>
          <button onClick={() => setShowWrapper(!showWrapper)} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "10px 14px", background: "#f6f7f7", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#646970", textAlign: "left" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform .15s", transform: showWrapper ? "rotate(180deg)" : "rotate(0deg)" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            外层属性
          </button>
          {showWrapper && (
            <div style={{ padding: "14px", display: "grid", gap: "12px" }}>
              <div style={S.row3}>
                <Field label="宽度（%）"><input style={S.input} value={field.wrapper.width} onChange={e => u("wrapper", { ...field.wrapper, width: e.target.value })} placeholder="50" /></Field>
                <Field label="CSS 类"><input style={S.input} value={field.wrapper.class} onChange={e => u("wrapper", { ...field.wrapper, class: e.target.value })} /></Field>
                <Field label="元素 ID"><input style={S.input} value={field.wrapper.id} onChange={e => u("wrapper", { ...field.wrapper, id: e.target.value })} /></Field>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Location Tab ─────────────────────────────────────────────────────────────

function LocationTab({ group, setGroup, postTypeOptions, taxonomyOptions }: {
  group: FieldGroup; setGroup: (g: FieldGroup) => void;
  postTypeOptions: { value: string; label: string }[];
  taxonomyOptions: { value: string; label: string }[];
}) {
  const setLocation = (loc: FieldGroupLocation[][]) => setGroup({ ...group, location: loc });
  const getParamValues = (param: string) => {
    if (param === "post_type") return postTypeOptions;
    if (param === "taxonomy") return taxonomyOptions;
    return LOCATION_PARAM_VALUES[param] ?? [];
  };
  const addRuleGroup = () => setLocation([...group.location, [{ param: "post_type", operator: "==", value: "post" }]]);
  const addRule = (gi: number) => setLocation(group.location.map((g, i) => i === gi ? [...g, { param: "post_type", operator: "==" as const, value: "post" }] : g));
  const updateRule = (gi: number, ri: number, patch: Partial<FieldGroupLocation>) =>
    setLocation(group.location.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, ...patch } : r) : g));
  const removeRule = (gi: number, ri: number) =>
    setLocation(group.location.map((g, i) => i === gi ? g.filter((_, j) => j !== ri) : g).filter(g => g.length > 0));

  return (
    <div style={{ maxWidth: "760px" }}>
      <p style={{ fontSize: "13px", color: "#646970", marginBottom: "16px" }}>
        同一组内的规则为「且」关系，组与组之间为「或」关系。
      </p>
      {group.location.map((andGroup, gi) => (
        <div key={gi} style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", padding: "16px", marginBottom: "12px" }}>
          {gi > 0 && <div style={{ textAlign: "center", marginBottom: "12px", fontSize: "13px", fontWeight: 700, color: "#646970" }}>或</div>}
          {andGroup.map((rule, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: "180px 130px 1fr 32px", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
              {ri > 0 && <div style={{ gridColumn: "1/-1", fontSize: "11px", fontWeight: 700, color: "#646970", marginBottom: "2px" }}>且</div>}
              <select style={S.select} value={rule.param} onChange={e => updateRule(gi, ri, { param: e.target.value, value: "" })}>
                {LOCATION_PARAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select style={S.select} value={rule.operator} onChange={e => updateRule(gi, ri, { operator: e.target.value as "==" | "!=" })}>
                <option value="==">== 等于</option>
                <option value="!=">!= 不等于</option>
              </select>
              {getParamValues(rule.param).length > 0 ? (
                <select style={S.select} value={rule.value} onChange={e => updateRule(gi, ri, { value: e.target.value })}>
                  <option value="">请选择…</option>
                  {getParamValues(rule.param).map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              ) : (
                <input style={S.input} value={rule.value} onChange={e => updateRule(gi, ri, { value: e.target.value })} placeholder="条件值" />
              )}
              <button onClick={() => removeRule(gi, ri)} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "3px", cursor: "pointer", color: "#d63638", fontSize: "14px", padding: "4px 8px" }}>×</button>
            </div>
          ))}
          <button onClick={() => addRule(gi)} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px solid #2271b1", borderRadius: "3px", padding: "5px 12px", cursor: "pointer" }}>+ 添加条件</button>
        </div>
      ))}
      <button onClick={addRuleGroup} style={{ fontSize: "13px", color: "#2271b1", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", padding: "8px 20px", cursor: "pointer" }}>
        + 添加规则组（或）
      </button>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ group, setGroup }: { group: FieldGroup; setGroup: (g: FieldGroup) => void }) {
  const u = (k: keyof FieldGroup, v: any) => setGroup({ ...group, [k]: v });
  return (
    <div style={{ display: "grid", gap: "20px", maxWidth: "600px" }}>
      <div style={S.row2}>
        <Field label="显示位置">
          <select style={S.select} value={group.position} onChange={e => u("position", e.target.value)}>
            <option value="normal">常规（正文下方）</option>
            <option value="side">侧边栏</option>
            <option value="acf_after_title">顶部（标题下方）</option>
          </select>
        </Field>
        <Field label="排序" hint="在编辑区模块中的排列顺序">
          <input style={S.input} type="number" value={group.menuOrder} onChange={e => u("menuOrder", Number(e.target.value))} />
        </Field>
      </div>
      <div style={S.row2}>
        <Field label="标签位置">
          <select style={S.select} value={group.labelPlacement} onChange={e => u("labelPlacement", e.target.value)}>
            <option value="top">顶部对齐</option>
            <option value="left">左侧对齐</option>
          </select>
        </Field>
        <Field label="说明位置">
          <select style={S.select} value={group.instructionPlacement} onChange={e => u("instructionPlacement", e.target.value)}>
            <option value="label">标签下方</option>
            <option value="field">字段下方</option>
          </select>
        </Field>
      </div>
      <div>
        <label style={S.label}>在编辑页隐藏</label>
        <p style={S.hint}>字段组显示时，可在此勾选需要隐藏的系统模块。</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "10px" }}>
          {HIDE_ON_SCREEN_OPTIONS.map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
              <input type="checkbox" checked={group.hideOnScreen.includes(opt.value)}
                onChange={e => {
                  const cur = group.hideOnScreen;
                  u("hideOnScreen", e.target.checked ? [...cur, opt.value] : cur.filter(v => v !== opt.value));
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      <Toggle checked={group.active} onChange={v => u("active", v)} label="启用（开启该字段组）" />
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function FieldGroupEditor({ groupId }: { groupId?: string }) {
  const [group, setGroup] = useState<FieldGroup | null>(null);
  const [tab, setTab] = useState<"fields" | "location" | "settings">("fields");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(["基础"]));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [postTypeOptions, setPostTypeOptions] = useState<{ value: string; label: string }[]>([
    { value: "post", label: "文章" }, { value: "page", label: "页面" }, { value: "attachment", label: "媒体" },
  ]);
  const [taxonomyOptions, setTaxonomyOptions] = useState<{ value: string; label: string }[]>([
    { value: "category", label: "分类" }, { value: "post_tag", label: "标签" },
  ]);

  useEffect(() => {
    if (groupId) {
      fetch(`/api/custom-fields/${groupId}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: any) => setGroup((d as FieldGroup | null) ?? createGroup()))
        .catch(() => setGroup(createGroup()));
    } else {
      setGroup(createGroup());
    }
    fetch("/api/post-types").then(r => r.ok ? r.json() : []).then((types: any) => {
      if (Array.isArray(types) && types.length > 0) setPostTypeOptions([
        { value: "post", label: "文章" }, { value: "page", label: "页面" }, { value: "attachment", label: "媒体" },
        ...types.map((t: any) => ({ value: t.key, label: t.config?.pluralLabel ?? t.pluralLabel ?? t.key })),
      ]);
    }).catch(() => {});
    fetch("/api/taxonomies").then(r => r.ok ? r.json() : []).then((taxs: any) => {
      if (Array.isArray(taxs) && taxs.length > 0) setTaxonomyOptions([
        { value: "category", label: "分类" }, { value: "post_tag", label: "标签" },
        ...taxs.map((t: any) => ({ value: t.key, label: t.pluralLabel ?? t.label ?? t.key })),
      ]);
    }).catch(() => {});
  }, [groupId]);

  const save = async () => {
    if (!group) return;
    setSaving(true); setStatus("保存中…");
    try {
      const res = await fetch("/api/custom-fields", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(group),
      });
      if (res.ok) {
        setStatus("已保存 ✓");
        if (!groupId) { const d: any = await res.json(); window.location.href = `/admin/custom-fields/${d.group?.id ?? group.id}`; }
        setTimeout(() => setStatus(""), 3000);
      } else { setStatus("保存失败"); }
    } catch { setStatus("保存失败"); }
    setSaving(false);
  };

  const deleteGroup = async () => {
    if (!group || !groupId) return;
    if (!confirm("确定删除该字段组吗？此操作不可撤销。")) return;
    await fetch(`/api/custom-fields/${groupId}`, { method: "DELETE" });
    window.location.href = "/admin/custom-fields";
  };

  if (!group) return <div style={{ padding: "40px", textAlign: "center", color: "#646970" }}>加载中…</div>;

  const selectedField = group.fields.find(f => f.id === selectedId) ?? null;

  const addField = (type: ACFFieldType) => {
    const f = createField(type);
    setGroup({ ...group, fields: [...group.fields, f] });
    setSelectedId(f.id);
  };
  const updateField = (id: string, patch: Partial<ACFField>) =>
    setGroup({ ...group, fields: group.fields.map(f => f.id === id ? { ...f, ...patch } : f) });
  const deleteField = (id: string) => {
    setGroup({ ...group, fields: group.fields.filter(f => f.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };
  const moveField = (id: string, dir: -1 | 1) => {
    const idx = group.fields.findIndex(f => f.id === id);
    if (idx + dir < 0 || idx + dir >= group.fields.length) return;
    const arr = [...group.fields]; [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    setGroup({ ...group, fields: arr });
  };
  const dropField = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const arr = [...group.fields];
    const from = arr.findIndex(f => f.id === dragId);
    const to = arr.findIndex(f => f.id === targetId);
    const [moved] = arr.splice(from, 1); arr.splice(to, 0, moved);
    setGroup({ ...group, fields: arr }); setDragId(null); setDragOverId(null);
  };
  const toggleCat = (cat: string) => setOpenCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)", margin: "-20px -20px -40px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", background: "#fff", borderBottom: "1px solid #dcdcde", flexShrink: 0 }}>
        <input value={group.title} onChange={e => setGroup({ ...group, title: e.target.value })}
          style={{ flex: 1, fontSize: "18px", fontWeight: 700, border: "none", outline: "none", background: "transparent", color: "#1d2327" }}
          placeholder="字段组标题"
        />
        <span style={{ fontSize: "13px", color: "#646970" }}>{status}</span>
        {groupId && (
          <button onClick={deleteGroup} style={{ fontSize: "12px", color: "#d63638", background: "#fff", border: "1px solid #d63638", padding: "7px 14px", borderRadius: "3px", cursor: "pointer" }}>删除</button>
        )}
        <button onClick={save} disabled={saving} style={{ background: "#2271b1", color: "#fff", border: "none", padding: "8px 20px", borderRadius: "3px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          {saving ? "保存中…" : "保存字段组"}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #dcdcde", padding: "0 20px", flexShrink: 0 }}>
        {(["fields", "location", "settings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 16px", border: "none", background: "none",
            borderBottom: t === tab ? "2px solid #2271b1" : "2px solid transparent",
            color: t === tab ? "#2271b1" : "#646970",
            fontWeight: t === tab ? 600 : 400, cursor: "pointer", fontSize: "13px", textTransform: "capitalize",
          }}>
            {{fields:"字段",location:"位置规则",settings:"设置"}[t]}{t === "fields" ? ` (${group.fields.length})` : ""}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* ── Fields tab ── */}
        {tab === "fields" && (
          <>
            {/* Left: field type accordion sidebar */}
            <div style={{ width: "220px", borderRight: "1px solid #dcdcde", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #dcdcde", fontSize: "11px", fontWeight: 700, color: "#646970", textTransform: "uppercase", letterSpacing: "0.6px", background: "#f6f7f7" }}>
                添加字段
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {getCategories().map(cat => {
                  const items = getByCategory(cat);
                  const isOpen = openCats.has(cat);
                  return (
                    <div key={cat} style={{ borderBottom: "1px solid #f0f0f1" }}>
                      <button onClick={() => toggleCat(cat)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "none", background: isOpen ? "#f0f6fc" : "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: isOpen ? "#2271b1" : "#1d2327", textAlign: "left" }}
                        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "#f6f7f7"; }}
                        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "#fff"; }}>
                        <span>{cat}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: "transform .15s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: isOpen ? "#2271b1" : "#8c8f94" }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "6px 10px 10px" }}>
                          {items.map(([type, meta]) => (
                            <button key={type} onClick={() => addField(type as ACFFieldType)}
                              style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: "3px", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#1d2327", textAlign: "left", marginBottom: "4px" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#f0f6fc"; e.currentTarget.style.borderColor = "#2271b1"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e0e0e0"; }}>
                              <span style={{ width: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#2271b1" }}>
                                <FieldTypeIcon type={type} size={13} />
                              </span>
                              <span style={{ lineHeight: 1.3 }}>{meta.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center: canvas */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#f6f7f7" }} onClick={() => setSelectedId(null)}>
              {group.fields.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#646970", border: "2px dashed #dcdcde", borderRadius: "4px", background: "#fff" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c3c4c7" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "12px" }}>
                    <path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="12 2 12 8 18 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
                  </svg>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: "#1d2327" }}>暂无字段</div>
                  <div style={{ fontSize: "12px" }}>点击左侧字段类型即可添加</div>
                </div>
              ) : (
                <div onClick={e => e.stopPropagation()}>
                  {group.fields.map((field, idx) => (
                    <CanvasField key={field.id} field={field}
                      selected={selectedId === field.id}
                      onSelect={() => setSelectedId(selectedId === field.id ? null : field.id)}
                      onDelete={() => deleteField(field.id)}
                      onMove={dir => moveField(field.id, dir)}
                      isFirst={idx === 0} isLast={idx === group.fields.length - 1}
                      isDragOver={dragOverId === field.id}
                      onDragStart={() => setDragId(field.id)}
                      onDragOver={() => setDragOverId(field.id)}
                      onDrop={() => dropField(field.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: settings panel */}
            <div style={{ width: "320px", borderLeft: "1px solid #dcdcde", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              {selectedField ? (
                <FieldSettingsPanel
                  field={selectedField}
                  onUpdate={patch => updateField(selectedField.id, patch)}
                  allFields={group.fields}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <div style={{ padding: "40px 20px", color: "#646970", fontSize: "13px", textAlign: "center" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c3c4c7" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "12px", display: "block", margin: "0 auto 12px" }}>
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  <div style={{ fontWeight: 600, marginBottom: "6px", color: "#1d2327" }}>字段设置</div>
                  <div>点击字段可编辑其设置</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Location tab ── */}
        {tab === "location" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <LocationTab group={group} setGroup={setGroup} postTypeOptions={postTypeOptions} taxonomyOptions={taxonomyOptions} />
          </div>
        )}

        {/* ── Settings tab ── */}
        {tab === "settings" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <SettingsTab group={group} setGroup={setGroup} />
          </div>
        )}
      </div>
    </div>
  );
}
