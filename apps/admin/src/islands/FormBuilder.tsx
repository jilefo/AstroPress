import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Choice { id: string; label: string; value: string; selected: boolean; image?: string; price?: string; }
interface ConditionalRule { fieldId: string; operator: string; value: string; }
interface FormField {
  id: string; type: string; label: string; description: string; required: boolean;
  placeholder: string; defaultValue: string; cssClass: string; hideLabel: boolean;
  conditionalLogic: ConditionalRule[][] | false;
  choices?: Choice[];
  subLabel?: string; subLabels?: Record<string, string>;
  // type-specific
  [key: string]: any;
}
interface Notification {
  id: string; name: string; active: boolean;
  toAddress: string; fromName: string; fromEmail: string; replyTo: string;
  subject: string; message: string; conditionalLogic: ConditionalRule[][] | false;
}
interface Confirmation {
  id: string; name: string; active: boolean;
  type: "message" | "redirect" | "page";
  message: string; redirectUrl: string; page: string;
  autoScroll: boolean; conditionalLogic: ConditionalRule[][] | false;
}
interface FormSettings {
  submitText: string; submitProcessingText: string; submitAlign: string;
  formClass: string; labelAlignment: string; ajax: boolean; honeypot: boolean;
  requireLogin: boolean; requireLoginMessage: string;
  scheduleForm: boolean; scheduleStart: string; scheduleEnd: string; scheduleClosedMessage: string;
  limitEntries: boolean; limitEntriesCount: number; limitEntriesMessage: string;
  storeEntries: boolean;
}
interface WPForm {
  id: string; title: string; fields: FormField[];
  settings: FormSettings; notifications: Notification[]; confirmations: Confirmation[];
  createdAt: string; updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

interface FieldMeta { label: string; icon: string; category: string; noValue?: boolean; }
const FIELDS: Record<string, FieldMeta> = {
  text:              { label: "单行文本",       icon: "text",           category: "标准字段" },
  textarea:          { label: "段落文本",       icon: "textarea",       category: "标准字段" },
  dropdown:          { label: "下拉选择",       icon: "dropdown",       category: "标准字段" },
  multiple_choice:   { label: "单选",           icon: "multiple_choice",category: "标准字段" },
  checkboxes:        { label: "复选框",         icon: "checkboxes",     category: "标准字段" },
  number:            { label: "数字",           icon: "number",         category: "标准字段" },
  name:              { label: "姓名",           icon: "name",           category: "标准字段" },
  email:             { label: "邮箱",           icon: "email",          category: "标准字段" },
  url:               { label: "网站 / 网址",    icon: "url",            category: "标准字段" },
  phone:             { label: "电话",           icon: "phone",          category: "标准字段" },
  address:           { label: "地址",           icon: "address",        category: "标准字段" },
  date_time:         { label: "日期 / 时间",    icon: "date_time",      category: "标准字段" },
  file:              { label: "文件上传",       icon: "file",           category: "特色字段" },
  page_break:        { label: "分页符",         icon: "page_break",     category: "特色字段", noValue: true },
  section_divider:   { label: "分节线",         icon: "section_divider",category: "特色字段", noValue: true },
  html:              { label: "HTML / 自定义内容",icon: "html",         category: "特色字段", noValue: true },
  hidden:            { label: "隐藏字段",       icon: "hidden",         category: "特色字段" },
  rating:            { label: "评分",           icon: "rating",         category: "特色字段" },
  likert:            { label: "李克特量表",     icon: "likert",         category: "特色字段" },
  signature:         { label: "签名",           icon: "signature",      category: "特色字段" },
  password:          { label: "密码",           icon: "password",       category: "特色字段" },
  content:           { label: "说明内容",       icon: "content",        category: "特色字段", noValue: true },
  payment_single:    { label: "单项金额",       icon: "payment",        category: "支付" },
  payment_multiple:  { label: "多项金额",       icon: "payment",        category: "支付" },
  payment_checkbox:  { label: "多选金额",       icon: "payment",        category: "支付" },
  payment_dropdown:  { label: "下拉金额",       icon: "payment",        category: "支付" },
  payment_total:     { label: "合计金额",       icon: "payment_total",  category: "支付" },
  nps:               { label: "净推荐值（NPS）",icon: "nps",            category: "调查" },
  range_slider:      { label: "滑块",           icon: "range_slider",   category: "高级" },
  captcha:           { label: "验证码",         icon: "captcha",        category: "高级" },
};

// ─── Field Icons (SVG) ────────────────────────────────────────────────────────

function FieldIcon({ type, size = 15 }: { type: string; size?: number }) {
  const s = { width: size, height: size, flexShrink: 0 } as const;
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "text":
      return <svg viewBox="0 0 24 24" style={s} {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
    case "textarea":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>;
    case "dropdown":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="8 10 12 14 16 10"/></svg>;
    case "multiple_choice":
      return <svg viewBox="0 0 24 24" style={s} {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>;
    case "checkboxes":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 12 11 14 15 10"/></svg>;
    case "number":
      return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>;
    case "name":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "email":
      return <svg viewBox="0 0 24 24" style={s} {...p}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>;
    case "url":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case "phone":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.9-.9a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/></svg>;
    case "address":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case "date_time":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "file":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
    case "page_break":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2"/></svg>;
    case "section_divider":
      return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6" strokeOpacity="0.3"/><line x1="3" y1="18" x2="21" y2="18" strokeOpacity="0.3"/></svg>;
    case "html":
      return <svg viewBox="0 0 24 24" style={s} {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case "hidden":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
    case "rating":
      return <svg viewBox="0 0 24 24" style={s} {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "likert":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case "signature":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    case "password":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "content":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case "payment":
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
    case "payment_total":
      return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case "nps":
      return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case "range_slider":
      return <svg viewBox="0 0 24 24" style={s} {...p}><line x1="3" y1="12" x2="21" y2="12"/><circle cx="8" cy="12" r="3" fill="currentColor" stroke="none"/></svg>;
    case "captcha":
      return <svg viewBox="0 0 24 24" style={s} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    default:
      return <svg viewBox="0 0 24 24" style={s} {...p}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>;
  }
}

const CATEGORIES = ["标准字段", "特色字段", "支付", "调查", "高级"];

const SUBFIELD_LABELS: Record<string, string> = {
  prefix: "称谓", first: "名字", middle: "中间名", last: "姓氏", suffix: "后缀",
};

function makeDefaultChoices(): Choice[] {
  return [
    { id: uid(), label: "选项一", value: "first", selected: false },
    { id: uid(), label: "选项二", value: "second", selected: false },
    { id: uid(), label: "选项三", value: "third", selected: false },
  ];
}

function createField(type: string): FormField {
  const hasChoices = ["dropdown","multiple_choice","checkboxes","payment_multiple","payment_checkbox","payment_dropdown"].includes(type);
  return {
    id: uid(), type, label: FIELDS[type]?.label ?? type,
    description: "", required: false, placeholder: "", defaultValue: "",
    cssClass: "", hideLabel: false, conditionalLogic: false,
    ...(hasChoices ? { choices: makeDefaultChoices() } : {}),
    ...(type === "rating" ? { ratingCount: 5, ratingIcon: "star", ratingSize: "medium", ratingColor: "#f5a623" } : {}),
    ...(type === "likert" ? { rows: ["第 1 行"], columns: ["第 1 列", "第 2 列", "第 3 列"] } : {}),
    ...(type === "page_break" ? { nextText: "下一页", prevText: "上一页", showPrev: true } : {}),
    ...(type === "section_divider" ? { size: "medium" } : {}),
    ...(type === "name" ? { nameFormat: "first-last", subLabels: { first: "名字", last: "姓氏" } } : {}),
    ...(type === "address" ? { addressScheme: "international" } : {}),
    ...(type === "date_time" ? { dateEnable: true, timeEnable: false, dateType: "datepicker", dateFormat: "MM/DD/YYYY", timeFormat: "12H" } : {}),
    ...(type === "payment_single" ? { itemName: "", itemPrice: "" } : {}),
    ...(type === "range_slider" ? { min: 0, max: 100, step: 1, defaultValue: "50", handles: "single" } : {}),
    ...(type === "nps" ? { npsStart: "完全不可能", npsEnd: "非常可能" } : {}),
    ...(type === "captcha" ? { captchaType: "hcaptcha", siteKey: "", secretKey: "" } : {}),
    ...(type === "signature" ? { penColor: "#000000", penSize: "medium" } : {}),
    ...(type === "file" ? { fileExtensions: "jpg,jpeg,png,gif,pdf,doc,docx", fileMaxSize: "10", fileMaxCount: "1" } : {}),
    ...(type === "number" ? { numberFormat: "decimal", numberMin: "", numberMax: "" } : {}),
    ...(type === "html" ? { htmlContent: "<p>在此输入 HTML 内容</p>" } : {}),
    ...(type === "content" ? { content: "<p>在此输入说明内容</p>" } : {}),
  };
}

function defaultForm(): WPForm {
  const id = uid();
  return {
    id, title: "未命名表单",
    fields: [
      createField("name"),
      createField("email"),
      createField("textarea"),
    ],
    settings: {
      submitText: "提交", submitProcessingText: "提交中…", submitAlign: "left",
      formClass: "", labelAlignment: "top", ajax: true, honeypot: true,
      requireLogin: false, requireLoginMessage: "请先登录后再填写本表单。",
      scheduleForm: false, scheduleStart: "", scheduleEnd: "", scheduleClosedMessage: "本表单当前已停止提交。",
      limitEntries: false, limitEntriesCount: 100, limitEntriesMessage: "抱歉，本表单已达到提交数量上限。",
      storeEntries: true,
    },
    notifications: [{
      id: uid(), name: "管理员通知", active: true,
      toAddress: "{admin_email}", fromName: "{site_name}",
      fromEmail: "{admin_email}", replyTo: "{field:email}",
      subject: "新的提交：{form_title}", message: "{all_fields}",
      conditionalLogic: false,
    }],
    confirmations: [{
      id: uid(), name: "默认确认", active: true,
      type: "message", message: "<p>提交成功，我们会尽快与您联系！</p>",
      redirectUrl: "", page: "", autoScroll: true, conditionalLogic: false,
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  input: { width: "100%", padding: "7px 10px", fontSize: "13px", border: "1px solid #8c8f94", borderRadius: "3px", outline: "none", boxSizing: "border-box" as const },
  select: { width: "100%", padding: "7px 10px", fontSize: "13px", border: "1px solid #8c8f94", borderRadius: "3px", outline: "none" },
  label: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "#1d2327" } as React.CSSProperties,
  hint: { fontSize: "11px", color: "#646970", marginTop: "3px", margin: "3px 0 0" } as React.CSSProperties,
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } as React.CSSProperties,
  toggle: (on: boolean) => ({ display: "inline-block", width: "36px", height: "20px", background: on ? "#2271b1" : "#c3c4c7", borderRadius: "10px", position: "relative" as const, cursor: "pointer", flexShrink: 0 }),
  toggleDot: (on: boolean) => ({ position: "absolute" as const, top: "2px", left: on ? "18px" : "2px", width: "16px", height: "16px", background: "#fff", borderRadius: "50%", transition: "left .2s" }),
};

function FField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><label style={S.label}>{label}</label>{children}{hint && <p style={S.hint}>{hint}</p>}</div>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
      <span style={S.toggle(on)} onClick={() => onChange(!on)}><span style={S.toggleDot(on)} /></span>
      {label && <span style={{ fontSize: "13px", color: "#1d2327" }}>{label}</span>}
    </label>
  );
}

// ─── Choices Editor ───────────────────────────────────────────────────────────

function ChoicesEditor({ choices, onChange, showPrice, showImages }: {
  choices: Choice[]; onChange: (c: Choice[]) => void; showPrice?: boolean; showImages?: boolean;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const add = () => onChange([...choices, { id: uid(), label: `选项 ${choices.length + 1}`, value: "", selected: false }]);
  const upd = (id: string, k: keyof Choice, v: any) => onChange(choices.map(c => c.id === id ? { ...c, [k]: v } : c));
  const del = (id: string) => onChange(choices.filter(c => c.id !== id));
  const doImport = () => {
    const lines = importText.split("\n").map(l => l.trim()).filter(Boolean);
    onChange([...choices, ...lines.map(l => ({ id: uid(), label: l, value: l.toLowerCase().replace(/\s+/g, "_"), selected: false }))]);
    setImportOpen(false); setImportText("");
  };
  return (
    <div>
      <div style={{ border: "1px solid #dcdcde", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
        <div style={{ display: "grid", gridTemplateColumns: showPrice ? "auto 1fr 1fr 1fr auto" : "auto 1fr 1fr auto", gap: "0", background: "#f6f7f7", borderBottom: "1px solid #dcdcde", fontSize: "11px", fontWeight: 700, color: "#646970" }}>
          <div style={{ padding: "6px 10px" }}>默认选中</div>
          <div style={{ padding: "6px 10px" }}>选项文字</div>
          <div style={{ padding: "6px 10px" }}>值</div>
          {showPrice && <div style={{ padding: "6px 10px" }}>价格</div>}
          <div style={{ padding: "6px 10px" }}></div>
        </div>
        {choices.map((c, i) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: showPrice ? "auto 1fr 1fr 1fr auto" : "auto 1fr 1fr auto", borderBottom: i < choices.length - 1 ? "1px solid #f0f0f1" : "none", alignItems: "center" }}>
            <div style={{ padding: "6px 10px" }}>
              <input type="checkbox" checked={c.selected} onChange={e => upd(c.id, "selected", e.target.checked)} style={{ width: "14px", height: "14px" }} />
            </div>
            <div style={{ padding: "4px 6px 4px 0" }}>
              <input value={c.label} onChange={e => upd(c.id, "label", e.target.value)} style={{ ...S.input, border: "1px solid transparent", background: "transparent" }} onFocus={e => (e.target.style.border = "1px solid #8c8f94")} onBlur={e => (e.target.style.border = "1px solid transparent")} />
            </div>
            <div style={{ padding: "4px 6px 4px 0" }}>
              <input value={c.value} onChange={e => upd(c.id, "value", e.target.value)} placeholder="留空自动" style={{ ...S.input, border: "1px solid transparent", background: "transparent", fontFamily: "monospace", fontSize: "12px" }} onFocus={e => (e.target.style.border = "1px solid #8c8f94")} onBlur={e => (e.target.style.border = "1px solid transparent")} />
            </div>
            {showPrice && <div style={{ padding: "4px 6px 4px 0" }}><input value={c.price ?? ""} onChange={e => upd(c.id, "price", e.target.value)} placeholder="0.00" style={{ ...S.input, border: "1px solid transparent", background: "transparent" }} /></div>}
            <div style={{ padding: "6px 10px" }}><button onClick={() => del(c.id)} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>×</button></div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={add} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px solid #2271b1", borderRadius: "3px", padding: "4px 10px", cursor: "pointer" }}>+ 添加选项</button>
        <button onClick={() => setImportOpen(!importOpen)} style={{ fontSize: "12px", color: "#646970", background: "none", border: "1px solid #dcdcde", borderRadius: "3px", padding: "4px 10px", cursor: "pointer" }}>批量添加选项</button>
      </div>
      {importOpen && (
        <div style={{ marginTop: "8px", padding: "12px", background: "#f6f7f7", border: "1px solid #dcdcde", borderRadius: "3px" }}>
          <p style={{ fontSize: "12px", color: "#646970", margin: "0 0 6px" }}>每行填写一个选项</p>
          <textarea rows={4} value={importText} onChange={e => setImportText(e.target.value)} style={{ ...S.input, resize: "vertical", marginBottom: "8px" }} />
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={doImport} style={{ fontSize: "12px", background: "#2271b1", color: "#fff", border: "none", borderRadius: "3px", padding: "5px 12px", cursor: "pointer" }}>添加选项</button>
            <button onClick={() => setImportOpen(false)} style={{ fontSize: "12px", background: "none", border: "1px solid #dcdcde", borderRadius: "3px", padding: "5px 12px", cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Conditional Logic ────────────────────────────────────────────────────────

const COND_OPS = [
  { value: "is", label: "等于" }, { value: "is_not", label: "不等于" },
  { value: "contains", label: "包含" }, { value: "not_contains", label: "不包含" },
  { value: "starts_with", label: "开头为" }, { value: "ends_with", label: "结尾为" },
  { value: "empty", label: "为空" }, { value: "not_empty", label: "不为空" },
  { value: "greater_than", label: "大于" }, { value: "less_than", label: "小于" },
];

function ConditionalLogicEditor({ cl, onChange, fields }: {
  cl: ConditionalRule[][] | false;
  onChange: (v: ConditionalRule[][] | false) => void;
  fields: FormField[];
}) {
  const on = cl !== false;
  const rules: ConditionalRule[][] = on && Array.isArray(cl) ? cl : [];
  const eligibleFields = fields.filter(f => !["page_break","section_divider","html","content","captcha"].includes(f.type));

  return (
    <div>
      <Toggle on={on} onChange={v => onChange(v ? [[{ fieldId: "", operator: "is", value: "" }]] : false)} label="启用条件逻辑" />
      {on && (
        <div style={{ marginTop: "12px" }}>
          <p style={{ fontSize: "12px", color: "#646970", marginBottom: "10px" }}>满足以下全部条件时显示此字段：</p>
          {rules.map((andGroup, gi) => (
            <div key={gi} style={{ marginBottom: "8px", padding: "10px", background: "#f6f7f7", border: "1px solid #dcdcde", borderRadius: "3px" }}>
              {gi > 0 && <div style={{ fontSize: "11px", fontWeight: 700, color: "#646970", marginBottom: "6px" }}>或</div>}
              {andGroup.map((rule, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                  {ri > 0 && <div style={{ gridColumn: "1/-1", fontSize: "11px", fontWeight: 700, color: "#646970" }}>且</div>}
                  <select style={S.select} value={rule.fieldId} onChange={e => { const ng = rules.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, fieldId: e.target.value } : r) : g); onChange(ng); }}>
                    <option value="">选择字段…</option>
                    {eligibleFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <select style={S.select} value={rule.operator} onChange={e => { const ng = rules.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, operator: e.target.value } : r) : g); onChange(ng); }}>
                    {COND_OPS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input style={S.input} value={rule.value} onChange={e => { const ng = rules.map((g, i) => i === gi ? g.map((r, j) => j === ri ? { ...r, value: e.target.value } : r) : g); onChange(ng); }} placeholder="条件值" />
                  <button onClick={() => { const ng = rules.map((g, i) => i === gi ? g.filter((_, j) => j !== ri) : g).filter(g => g.length > 0); onChange(ng.length ? ng : false); }} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "16px" }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { const ng = rules.map((g, i) => i === gi ? [...g, { fieldId: "", operator: "is", value: "" }] : g); onChange(ng); }} style={{ fontSize: "11px", color: "#2271b1", background: "none", border: "1px solid #2271b1", borderRadius: "3px", padding: "3px 8px", cursor: "pointer" }}>+ 添加条件</button>
                <button onClick={() => onChange(rules.filter((_, i) => i !== gi) as any || false)} style={{ fontSize: "11px", color: "#d63638", background: "none", border: "1px solid #d63638", borderRadius: "3px", padding: "3px 8px", cursor: "pointer" }}>删除本组</button>
              </div>
            </div>
          ))}
          <button onClick={() => onChange([...rules, [{ fieldId: "", operator: "is", value: "" }]])} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", padding: "5px 12px", cursor: "pointer" }}>+ 添加条件组（或）</button>
        </div>
      )}
    </div>
  );
}

// ─── Smart Tag Picker ─────────────────────────────────────────────────────────

const SMART_TAGS = [
  { tag: "{admin_email}", label: "管理员邮箱" },
  { tag: "{all_fields}", label: "全部字段" },
  { tag: "{form_title}", label: "表单标题" },
  { tag: "{site_name}", label: "站点名称" },
  { tag: "{site_url}", label: "站点地址" },
  { tag: "{entry_id}", label: "提交编号" },
  { tag: "{user_ip}", label: "提交者 IP" },
  { tag: "{date format=\"Y-m-d\"}", label: "当前日期" },
];

function SmartTagPicker({ onInsert }: { onInsert: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ fontSize: "11px", color: "#2271b1", background: "none", border: "1px solid #c3d9f7", borderRadius: "3px", padding: "3px 8px", cursor: "pointer" }}>
        智能标签
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #dcdcde", borderRadius: "3px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", minWidth: "200px", marginTop: "2px" }}>
          {SMART_TAGS.map(t => (
            <button key={t.tag} onClick={() => { onInsert(t.tag); setOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", fontSize: "12px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f1" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f6fc")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
              <span style={{ fontFamily: "monospace", color: "#2271b1" }}>{t.tag}</span>
              <span style={{ color: "#646970", marginLeft: "8px" }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field Settings Panel ─────────────────────────────────────────────────────

function FieldSettings({ field, update, allFields }: { field: FormField; update: (p: Partial<FormField>) => void; allFields: FormField[] }) {
  const [section, setSection] = useState<"general" | "advanced" | "smart_logic">("general");
  const u = (k: string, v: any) => update({ [k]: v });
  const t = field.type;
  const hasChoices = ["dropdown","multiple_choice","checkboxes","payment_multiple","payment_checkbox","payment_dropdown"].includes(t);
  const showPlaceholder = !["multiple_choice","checkboxes","rating","likert","page_break","section_divider","html","content","hidden","signature","payment_total","nps","range_slider","captcha","file"].includes(t);

  return (
    <div style={{ fontSize: "13px" }}>
      {/* Mini tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #dcdcde", marginBottom: "16px" }}>
        {(["general","advanced","smart_logic"] as const).map(s => (
          <button key={s} onClick={() => setSection(s)} style={{ padding: "8px 12px", border: "none", background: "none", borderBottom: s === section ? "2px solid #2271b1" : "2px solid transparent", color: s === section ? "#2271b1" : "#646970", fontWeight: s === section ? 600 : 400, cursor: "pointer", fontSize: "12px", textTransform: "capitalize" }}>
            {{general:"常规",advanced:"高级",smart_logic:"智能逻辑"}[s]}
          </button>
        ))}
      </div>

      {section === "general" && (
        <div style={{ display: "grid", gap: "14px" }}>
          {/* Label */}
          {t !== "html" && t !== "content" && (
            <FField label="字段标签">
              <input style={S.input} value={field.label} onChange={e => u("label", e.target.value)} />
            </FField>
          )}

          {/* HTML Content */}
          {(t === "html" || t === "content") && (
            <FField label={t === "html" ? "HTML 代码" : "内容"}>
              <textarea style={{ ...S.input, resize: "vertical", fontFamily: "monospace" }} rows={6} value={field.htmlContent ?? field.content ?? ""} onChange={e => u(t === "html" ? "htmlContent" : "content", e.target.value)} />
            </FField>
          )}

          {/* Description */}
          {!["page_break","section_divider","html","content"].includes(t) && (
            <FField label="描述 / 填写说明" hint="显示在字段标签下方">
              <textarea style={{ ...S.input, resize: "vertical" }} rows={2} value={field.description} onChange={e => u("description", e.target.value)} />
            </FField>
          )}

          {/* Required */}
          {!["page_break","section_divider","html","content","captcha"].includes(t) && (
            <Toggle on={field.required} onChange={v => u("required", v)} label="必填" />
          )}

          {/* Placeholder */}
          {showPlaceholder && (
            <FField label="占位提示文字">
              <input style={S.input} value={field.placeholder} onChange={e => u("placeholder", e.target.value)} />
            </FField>
          )}

          {/* Choices */}
          {hasChoices && (
            <FField label="选项">
              <ChoicesEditor
                choices={field.choices ?? []}
                onChange={c => u("choices", c)}
                showPrice={t.startsWith("payment_")}
              />
            </FField>
          )}

          {/* TYPE-SPECIFIC ================================================= */}

          {/* Text */}
          {t === "text" && (
            <>
              <FField label="默认值"><input style={S.input} value={field.defaultValue} onChange={e => u("defaultValue", e.target.value)} /></FField>
              <div style={S.row2}>
                <FField label="最大字符数" hint="0 表示不限制"><input style={S.input} type="number" value={field.maxChars ?? ""} onChange={e => u("maxChars", e.target.value)} /></FField>
                <FField label="限制方式">
                  <select style={S.select} value={field.limitType ?? "chars"} onChange={e => u("limitType", e.target.value)}>
                    <option value="chars">按字符</option>
                    <option value="words">按词数</option>
                  </select>
                </FField>
              </div>
              <Toggle on={!!field.readonly} onChange={v => u("readonly", v)} label="只读" />
              <FField label="输入掩码" hint="例如 (999) 999-9999">
                <input style={S.input} value={field.inputMask ?? ""} onChange={e => u("inputMask", e.target.value)} />
              </FField>
              <FField label="通过 URL 参数预填">
                <input style={S.input} value={field.prepopulate ?? ""} onChange={e => u("prepopulate", e.target.value)} placeholder="例如 first_name" />
              </FField>
            </>
          )}

          {/* Textarea */}
          {t === "textarea" && (
            <>
              <FField label="默认值"><textarea style={{ ...S.input, resize: "vertical" }} rows={3} value={field.defaultValue} onChange={e => u("defaultValue", e.target.value)} /></FField>
              <div style={S.row2}>
                <FField label="行数"><input style={S.input} type="number" value={field.rows ?? 5} onChange={e => u("rows", e.target.value)} /></FField>
                <FField label="最大字符数"><input style={S.input} type="number" value={field.maxChars ?? ""} onChange={e => u("maxChars", e.target.value)} /></FField>
              </div>
            </>
          )}

          {/* Number */}
          {t === "number" && (
            <>
              <div style={S.row2}>
                <FField label="最小值"><input style={S.input} type="number" value={field.numberMin ?? ""} onChange={e => u("numberMin", e.target.value)} /></FField>
                <FField label="最大值"><input style={S.input} type="number" value={field.numberMax ?? ""} onChange={e => u("numberMax", e.target.value)} /></FField>
              </div>
              <FField label="数字格式">
                <select style={S.select} value={field.numberFormat ?? "decimal"} onChange={e => u("numberFormat", e.target.value)}>
                  <option value="decimal">小数（1.23）</option>
                  <option value="integer">整数（1）</option>
                </select>
              </FField>
              <FField label="默认值"><input style={S.input} type="number" value={field.defaultValue} onChange={e => u("defaultValue", e.target.value)} /></FField>
            </>
          )}

          {/* Name */}
          {t === "name" && (
            <>
              <FField label="格式">
                <select style={S.select} value={field.nameFormat ?? "first-last"} onChange={e => u("nameFormat", e.target.value)}>
                  <option value="simple">简单（单输入框）</option>
                  <option value="first-last">名字 + 姓氏</option>
                  <option value="extended">完整（称谓、名字、中间名、姓氏、后缀）</option>
                </select>
              </FField>
              {field.nameFormat !== "simple" && (
                <FField label="各部分标签">
                  {(field.nameFormat === "extended" ? ["prefix","first","middle","last","suffix"] : ["first","last"]).map(k => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", color: "#646970" }}>{SUBFIELD_LABELS[k] ?? k}</span>
                      <input style={S.input} value={field.subLabels?.[k] ?? k} onChange={e => u("subLabels", { ...(field.subLabels ?? {}), [k]: e.target.value })} />
                    </div>
                  ))}
                </FField>
              )}
            </>
          )}

          {/* Email */}
          {t === "email" && (
            <>
              <FField label="默认值"><input style={S.input} value={field.defaultValue} onChange={e => u("defaultValue", e.target.value)} /></FField>
              <Toggle on={!!field.confirmEmail} onChange={v => u("confirmEmail", v)} label="启用确认邮箱框" />
              {field.confirmEmail && (
                <FField label="确认邮箱占位提示"><input style={S.input} value={field.confirmPlaceholder ?? "再次输入邮箱"} onChange={e => u("confirmPlaceholder", e.target.value)} /></FField>
              )}
              <FField label="限制邮箱域名" hint="每行一个域名，留空表示不限制。">
                <textarea style={{ ...S.input, resize: "vertical", fontFamily: "monospace" }} rows={3} value={field.restrictedEmails ?? ""} onChange={e => u("restrictedEmails", e.target.value)} placeholder="例如 example.com" />
              </FField>
            </>
          )}

          {/* Phone */}
          {t === "phone" && (
            <FField label="电话格式">
              <select style={S.select} value={field.phoneFormat ?? "us"} onChange={e => u("phoneFormat", e.target.value)}>
                <option value="us">美国格式：(201) 555-0123</option>
                <option value="international">国际格式</option>
                <option value="smart">智能识别（自动）</option>
              </select>
            </FField>
          )}

          {/* Address */}
          {t === "address" && (
            <>
              <FField label="地址格式">
                <select style={S.select} value={field.addressScheme ?? "international"} onChange={e => u("addressScheme", e.target.value)}>
                  <option value="international">国际通用</option>
                  <option value="us">美国</option>
                  <option value="canadian">加拿大</option>
                  <option value="uk">英国</option>
                </select>
              </FField>
              <FField label="启用的子字段">
                {["address1","address2","city","state","postal","country"].map(f2 => (
                  <label key={f2} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", fontSize: "12px", cursor: "pointer" }}>
                    <input type="checkbox" checked={!(field.hiddenSubfields ?? []).includes(f2)} onChange={e => { const hs = field.hiddenSubfields ?? []; u("hiddenSubfields", e.target.checked ? hs.filter((x: string) => x !== f2) : [...hs, f2]); }} />
                    {({ address1: "街道地址", address2: "详细地址（第二行）", city: "城市", state: "省 / 州", postal: "邮政编码", country: "国家 / 地区" } as Record<string, string>)[f2] ?? f2}
                  </label>
                ))}
              </FField>
            </>
          )}

          {/* Date/Time */}
          {t === "date_time" && (
            <>
              <div style={{ display: "flex", gap: "20px" }}>
                <Toggle on={field.dateEnable ?? true} onChange={v => u("dateEnable", v)} label="日期" />
                <Toggle on={field.timeEnable ?? false} onChange={v => u("timeEnable", v)} label="时间" />
              </div>
              {(field.dateEnable ?? true) && (
                <>
                  <FField label="日期选择方式">
                    <select style={S.select} value={field.dateType ?? "datepicker"} onChange={e => u("dateType", e.target.value)}>
                      <option value="datepicker">日期选择器</option>
                      <option value="dropdown">下拉选择</option>
                      <option value="text">手动输入</option>
                    </select>
                  </FField>
                  <FField label="日期格式">
                    <select style={S.select} value={field.dateFormat ?? "MM/DD/YYYY"} onChange={e => u("dateFormat", e.target.value)}>
                      {["MM/DD/YYYY","DD/MM/YYYY","YYYY-MM-DD","MM-DD-YYYY"].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </FField>
                  <FField label="每周第一天">
                    <select style={S.select} value={String(field.firstDay ?? 0)} onChange={e => u("firstDay", Number(e.target.value))}>
                      {["周日","周一","周二","周三","周四","周五","周六"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </FField>
                </>
              )}
              {(field.timeEnable ?? false) && (
                <FField label="时间格式">
                  <select style={S.select} value={field.timeFormat ?? "12H"} onChange={e => u("timeFormat", e.target.value)}>
                    <option value="12H">12 小时制（下午 1:00）</option>
                    <option value="24H">24 小时制（13:00）</option>
                  </select>
                </FField>
              )}
            </>
          )}

          {/* Dropdown specific */}
          {t === "dropdown" && (
            <>
              <FField label="占位提示" hint="未选择任何项时显示"><input style={S.input} value={field.placeholder} onChange={e => u("placeholder", e.target.value)} placeholder="请选择…" /></FField>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                <Toggle on={!!field.allowMultiple} onChange={v => u("allowMultiple", v)} label="允许多选" />
                <Toggle on={!!field.allowOther} onChange={v => u("allowOther", v)} label="允许填写「其他」" />
                <Toggle on={!!field.randomize} onChange={v => u("randomize", v)} label="随机排列选项" />
              </div>
            </>
          )}

          {/* Multiple choice / Checkboxes */}
          {(t === "multiple_choice" || t === "checkboxes") && (
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <FField label="排列方式">
                <select style={{ ...S.select, width: "auto" }} value={field.choiceLayout ?? "vertical"} onChange={e => u("choiceLayout", e.target.value)}>
                  <option value="vertical">竖排</option>
                  <option value="horizontal">横排</option>
                  <option value="inline">行内排列</option>
                </select>
              </FField>
              {t === "checkboxes" && <Toggle on={!!field.selectAll} onChange={v => u("selectAll", v)} label="显示全选" />}
              <Toggle on={!!field.allowOther} onChange={v => u("allowOther", v)} label="允许填写「其他」" />
              <Toggle on={!!field.randomize} onChange={v => u("randomize", v)} label="随机排列" />
              <Toggle on={!!field.imageChoices} onChange={v => u("imageChoices", v)} label="使用图片选项" />
            </div>
          )}

          {/* File Upload */}
          {t === "file" && (
            <>
              <FField label="允许的扩展名" hint="多个扩展名用逗号分隔，留空表示全部允许。">
                <input style={S.input} value={field.fileExtensions ?? "jpg,jpeg,png,gif,pdf,doc,docx"} onChange={e => u("fileExtensions", e.target.value)} />
              </FField>
              <div style={S.row2}>
                <FField label="单文件大小上限（MB）"><input style={S.input} type="number" value={field.fileMaxSize ?? "10"} onChange={e => u("fileMaxSize", e.target.value)} /></FField>
                <FField label="最多上传文件数"><input style={S.input} type="number" value={field.fileMaxCount ?? "1"} onChange={e => u("fileMaxCount", e.target.value)} /></FField>
              </div>
              <FField label="上传样式">
                <select style={S.select} value={field.fileStyle ?? "classic"} onChange={e => u("fileStyle", e.target.value)}>
                  <option value="classic">经典样式</option>
                  <option value="modern">现代样式（拖拽上传）</option>
                </select>
              </FField>
            </>
          )}

          {/* Rating */}
          {t === "rating" && (
            <>
              <div style={S.row2}>
                <FField label="图标数量">
                  <select style={S.select} value={String(field.ratingCount ?? 5)} onChange={e => u("ratingCount", Number(e.target.value))}>
                    {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </FField>
                <FField label="图标">
                  <select style={S.select} value={field.ratingIcon ?? "star"} onChange={e => u("ratingIcon", e.target.value)}>
                    <option value="star">星星</option>
                    <option value="heart">爱心</option>
                    <option value="thumb">点赞</option>
                    <option value="smiley">笑脸</option>
                    <option value="bullet">圆点 •</option>
                  </select>
                </FField>
                <FField label="图标大小">
                  <select style={S.select} value={field.ratingSize ?? "medium"} onChange={e => u("ratingSize", e.target.value)}>
                    <option value="small">小</option><option value="medium">中</option><option value="large">大</option>
                  </select>
                </FField>
                <FField label="图标颜色"><input style={S.input} type="color" value={field.ratingColor ?? "#f5a623"} onChange={e => u("ratingColor", e.target.value)} /></FField>
              </div>
            </>
          )}

          {/* Likert */}
          {t === "likert" && (
            <>
              <FField label="行（问题）">
                {(field.rows ?? ["第 1 行"]).map((r: string, i: number) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px", marginBottom: "4px" }}>
                    <input style={S.input} value={r} onChange={e => { const rows = [...(field.rows ?? [])]; rows[i] = e.target.value; u("rows", rows); }} />
                    <button onClick={() => { const rows = (field.rows ?? []).filter((_: any, j: number) => j !== i); u("rows", rows); }} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </div>
                ))}
                <button onClick={() => u("rows", [...(field.rows ?? []), `第 ${(field.rows ?? []).length + 1} 行`])} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px solid #2271b1", borderRadius: "3px", padding: "4px 10px", cursor: "pointer" }}>+ 添加行</button>
              </FField>
              <FField label="列（答案）">
                {(field.columns ?? ["第 1 列"]).map((c: string, i: number) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px", marginBottom: "4px" }}>
                    <input style={S.input} value={c} onChange={e => { const cols = [...(field.columns ?? [])]; cols[i] = e.target.value; u("columns", cols); }} />
                    <button onClick={() => u("columns", (field.columns ?? []).filter((_: any, j: number) => j !== i))} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </div>
                ))}
                <button onClick={() => u("columns", [...(field.columns ?? []), `第 ${(field.columns ?? []).length + 1} 列`])} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px solid #2271b1", borderRadius: "3px", padding: "4px 10px", cursor: "pointer" }}>+ 添加列</button>
              </FField>
            </>
          )}

          {/* Page Break */}
          {t === "page_break" && (
            <>
              <FField label="分页标题"><input style={S.input} value={field.pageTitle ?? ""} onChange={e => u("pageTitle", e.target.value)} /></FField>
              <div style={S.row2}>
                <FField label="下一页按钮文字"><input style={S.input} value={field.nextText ?? "下一页"} onChange={e => u("nextText", e.target.value)} /></FField>
                <FField label="上一页按钮文字"><input style={S.input} value={field.prevText ?? "上一页"} onChange={e => u("prevText", e.target.value)} /></FField>
              </div>
              <Toggle on={field.showPrev !== false} onChange={v => u("showPrev", v)} label="显示上一页按钮" />
            </>
          )}

          {/* Section Divider */}
          {t === "section_divider" && (
            <>
              <FField label="尺寸">
                <select style={S.select} value={field.size ?? "medium"} onChange={e => u("size", e.target.value)}>
                  <option value="small">小（H4）</option><option value="medium">中（H3）</option><option value="large">大（H2）</option>
                </select>
              </FField>
              <FField label="描述"><textarea style={{ ...S.input, resize: "vertical" }} rows={2} value={field.description} onChange={e => u("description", e.target.value)} /></FField>
            </>
          )}

          {/* Hidden */}
          {t === "hidden" && (
            <div>
              <FField label="默认值"><input style={S.input} value={field.defaultValue} onChange={e => u("defaultValue", e.target.value)} /></FField>
              <div style={{ marginTop: "6px" }}><SmartTagPicker onInsert={tag => u("defaultValue", (field.defaultValue ?? "") + tag)} /></div>
            </div>
          )}

          {/* Signature */}
          {t === "signature" && (
            <div style={S.row2}>
              <FField label="笔迹颜色"><input style={S.input} type="color" value={field.penColor ?? "#000000"} onChange={e => u("penColor", e.target.value)} /></FField>
              <FField label="笔迹粗细">
                <select style={S.select} value={field.penSize ?? "medium"} onChange={e => u("penSize", e.target.value)}>
                  <option value="small">细（2px）</option><option value="medium">中（4px）</option><option value="large">粗（6px）</option>
                </select>
              </FField>
            </div>
          )}

          {/* Password */}
          {t === "password" && (
            <>
              <Toggle on={!!field.showStrength} onChange={v => u("showStrength", v)} label="显示密码强度提示" />
              <Toggle on={!!field.confirmPassword} onChange={v => u("confirmPassword", v)} label="启用确认密码框" />
            </>
          )}

          {/* Payment Single */}
          {t === "payment_single" && (
            <>
              <FField label="项目名称"><input style={S.input} value={field.itemName ?? ""} onChange={e => u("itemName", e.target.value)} /></FField>
              <FField label="项目金额（元）"><input style={S.input} value={field.itemPrice ?? ""} onChange={e => u("itemPrice", e.target.value)} placeholder="0.00" /></FField>
              <Toggle on={!!field.customAmount} onChange={v => u("customAmount", v)} label="允许用户自定义金额" />
            </>
          )}

          {/* NPS */}
          {t === "nps" && (
            <div style={S.row2}>
              <FField label="0 分端文字"><input style={S.input} value={field.npsStart ?? "完全不可能"} onChange={e => u("npsStart", e.target.value)} /></FField>
              <FField label="10 分端文字"><input style={S.input} value={field.npsEnd ?? "非常可能"} onChange={e => u("npsEnd", e.target.value)} /></FField>
            </div>
          )}

          {/* Range Slider */}
          {t === "range_slider" && (
            <>
              <div style={S.row2}>
                <FField label="最小值"><input style={S.input} type="number" value={field.min ?? 0} onChange={e => u("min", Number(e.target.value))} /></FField>
                <FField label="最大值"><input style={S.input} type="number" value={field.max ?? 100} onChange={e => u("max", Number(e.target.value))} /></FField>
                <FField label="步长"><input style={S.input} type="number" value={field.step ?? 1} onChange={e => u("step", Number(e.target.value))} /></FField>
                <FField label="默认值"><input style={S.input} type="number" value={field.defaultValue ?? 50} onChange={e => u("defaultValue", Number(e.target.value))} /></FField>
              </div>
              <FField label="滑块手柄">
                <select style={S.select} value={field.handles ?? "single"} onChange={e => u("handles", e.target.value)}>
                  <option value="single">单滑块</option>
                  <option value="range">范围（双滑块）</option>
                </select>
              </FField>
              <div style={S.row2}>
                <FField label="单位前缀（如 ¥）"><input style={S.input} value={field.unitPrefix ?? ""} onChange={e => u("unitPrefix", e.target.value)} /></FField>
                <FField label="单位后缀（如 km）"><input style={S.input} value={field.unitSuffix ?? ""} onChange={e => u("unitSuffix", e.target.value)} /></FField>
              </div>
              <Toggle on={!!field.displayValue} onChange={v => u("displayValue", v)} label="在滑块上方显示数值" />
            </>
          )}

          {/* CAPTCHA */}
          {t === "captcha" && (
            <>
              <FField label="验证码服务">
                <select style={S.select} value={field.captchaType ?? "hcaptcha"} onChange={e => u("captchaType", e.target.value)}>
                  <option value="hcaptcha">hCaptcha</option>
                  <option value="recaptcha_v2">reCAPTCHA v2</option>
                  <option value="recaptcha_v3">reCAPTCHA v3</option>
                  <option value="turnstile">Cloudflare Turnstile</option>
                  <option value="math">简单算术题（内置）</option>
                </select>
              </FField>
              {field.captchaType !== "math" && (
                <>
                  <FField label="站点密钥（Site Key）"><input style={S.input} value={field.siteKey ?? ""} onChange={e => u("siteKey", e.target.value)} /></FField>
                  <FField label="密钥（Secret Key）"><input style={S.input} type="password" value={field.secretKey ?? ""} onChange={e => u("secretKey", e.target.value)} /></FField>
                  <div style={S.row2}>
                    <FField label="主题">
                      <select style={S.select} value={field.captchaTheme ?? "light"} onChange={e => u("captchaTheme", e.target.value)}>
                        <option value="light">浅色</option><option value="dark">深色</option>
                      </select>
                    </FField>
                    <FField label="尺寸">
                      <select style={S.select} value={field.captchaSize ?? "normal"} onChange={e => u("captchaSize", e.target.value)}>
                        <option value="normal">常规</option><option value="compact">紧凑</option>
                        {field.captchaType === "recaptcha_v2" && <option value="invisible">隐形</option>}
                      </select>
                    </FField>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {section === "advanced" && (
        <div style={{ display: "grid", gap: "14px" }}>
          <FField label="CSS 类" hint="多个类名用空格分隔"><input style={S.input} value={field.cssClass} onChange={e => u("cssClass", e.target.value)} /></FField>
          {!["page_break","section_divider","html","content"].includes(t) && (
            <>
              <Toggle on={!!field.hideLabel} onChange={v => u("hideLabel", v)} label="隐藏标签" />
              <FField label="后台标签" hint="仅在后台显示，前台用户不可见"><input style={S.input} value={field.adminLabel ?? ""} onChange={e => u("adminLabel", e.target.value)} /></FField>
            </>
          )}
          {!["page_break","section_divider","html","content","captcha","rating","likert","signature","file"].includes(t) && (
            <>
              <FField label="默认值">
                <input style={S.input} value={field.defaultValue} onChange={e => u("defaultValue", e.target.value)} />
                <div style={{ marginTop: "4px" }}><SmartTagPicker onInsert={tag => u("defaultValue", (field.defaultValue ?? "") + tag)} /></div>
              </FField>
              <FField label="通过 URL 参数预填">
                <input style={S.input} value={field.prepopulate ?? ""} onChange={e => u("prepopulate", e.target.value)} placeholder="例如 field_name" />
              </FField>
            </>
          )}
        </div>
      )}

      {section === "smart_logic" && (
        <ConditionalLogicEditor cl={field.conditionalLogic} onChange={v => u("conditionalLogic", v)} fields={allFields} />
      )}
    </div>
  );
}

// ─── Canvas Field Row ─────────────────────────────────────────────────────────

function CanvasField({ field, selected, onSelect, onDelete, onDuplicate, onMove, isFirst, isLast, isDragOver, onDragStart, onDragOver, onDrop }: {
  field: FormField; selected: boolean; onSelect: () => void;
  onDelete: () => void; onDuplicate: () => void; onMove: (d: -1|1) => void;
  isFirst: boolean; isLast: boolean; isDragOver: boolean;
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void;
}) {
  const m = FIELDS[field.type];
  const isLayout = ["page_break","section_divider","html","content"].includes(field.type);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onClick={onSelect}
      style={{
        border: `1px solid ${selected ? "#2271b1" : isDragOver ? "#f0a500" : "#dcdcde"}`,
        borderRadius: "3px", marginBottom: "4px", cursor: "pointer", userSelect: "none",
        background: selected ? "#f0f6fc" : "#fff",
        borderLeft: `3px solid ${selected ? "#2271b1" : isLayout ? "#a0a0a0" : "#dcdcde"}`,
        opacity: isDragOver ? 0.7 : 1,
        transition: "border-color 0.15s",
      }}
    >
      {field.type === "page_break" ? (
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px" }}>📄</span>
          <span style={{ flex: 1, fontSize: "12px", fontWeight: 700, color: "#646970", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            分页符 — {field.nextText ?? "下一页"}
          </span>
        </div>
      ) : field.type === "section_divider" ? (
        <div style={{ padding: "10px 14px" }}>
          <div style={{ borderTop: "2px solid #dcdcde", position: "relative" }}>
            <span style={{ position: "absolute", top: "-10px", left: "12px", background: selected ? "#f0f6fc" : "#fff", padding: "0 8px", fontSize: "13px", fontWeight: 600, color: "#1d2327" }}>{field.label}</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", color: "#c3c4c7", cursor: "grab" }}>⠿⠿</span>
          <span style={{ width: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#646970" }}><FieldIcon type={field.type} size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!field.hideLabel && <span style={{ fontSize: "13px", fontWeight: 600, color: "#1d2327" }}>{field.label || "未命名"}</span>}
            {field.required && <span style={{ color: "#d63638", marginLeft: "4px", fontWeight: 700 }}>*</span>}
            {field.adminLabel && <span style={{ fontSize: "11px", color: "#2271b1", marginLeft: "6px" }}>({field.adminLabel})</span>}
          </div>
          <span style={{ fontSize: "10px", background: "#f0f0f1", color: "#50575e", padding: "2px 6px", borderRadius: "8px", flexShrink: 0 }}>{m?.label ?? field.type}</span>
          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onMove(-1)} disabled={isFirst} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: isFirst ? "#c3c4c7" : "#646970" }}>▲</button>
            <button onClick={() => onMove(1)} disabled={isLast} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: isLast ? "#c3c4c7" : "#646970" }}>▼</button>
            <button onClick={onDuplicate} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: "#646970" }} title="复制">⧉</button>
            <button onClick={onDelete} style={{ background: "none", border: "1px solid #dcdcde", borderRadius: "2px", padding: "1px 5px", cursor: "pointer", fontSize: "10px", color: "#d63638" }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form Settings Tab ────────────────────────────────────────────────────────

function SettingsTab({ settings, onChange }: { settings: FormSettings; onChange: (s: FormSettings) => void }) {
  const u = (k: keyof FormSettings, v: any) => onChange({ ...settings, [k]: v });
  return (
    <div style={{ display: "grid", gap: "24px", maxWidth: "680px" }}>
      {/* Submit Button */}
      <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "#f6f7f7", borderBottom: "1px solid #dcdcde", fontSize: "13px", fontWeight: 700, color: "#1d2327" }}>提交按钮</div>
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <div style={S.row2}>
            <FField label="按钮文字"><input style={S.input} value={settings.submitText} onChange={e => u("submitText", e.target.value)} /></FField>
            <FField label="提交中文字"><input style={S.input} value={settings.submitProcessingText} onChange={e => u("submitProcessingText", e.target.value)} /></FField>
          </div>
          <FField label="对齐方式">
            <select style={S.select} value={settings.submitAlign} onChange={e => u("submitAlign", e.target.value)}>
              <option value="left">居左</option><option value="center">居中</option>
              <option value="right">居右</option><option value="full">撑满一行</option>
            </select>
          </FField>
        </div>
      </div>

      {/* Layout */}
      <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "#f6f7f7", borderBottom: "1px solid #dcdcde", fontSize: "13px", fontWeight: 700, color: "#1d2327" }}>布局与样式</div>
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <FField label="标签对齐">
            <select style={S.select} value={settings.labelAlignment} onChange={e => u("labelAlignment", e.target.value)}>
              <option value="top">顶部</option><option value="left">居左</option>
              <option value="right">居右</option><option value="hidden">隐藏</option>
            </select>
          </FField>
          <FField label="表单 CSS 类"><input style={S.input} value={settings.formClass} onChange={e => u("formClass", e.target.value)} /></FField>
        </div>
      </div>

      {/* Spam & Security */}
      <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "#f6f7f7", borderBottom: "1px solid #dcdcde", fontSize: "13px", fontWeight: 700, color: "#1d2327" }}>反垃圾与安全</div>
        <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
          <Toggle on={settings.honeypot} onChange={v => u("honeypot", v)} label="蜜罐防护（推荐开启）" />
          <Toggle on={settings.ajax} onChange={v => u("ajax", v)} label="AJAX 无刷新提交" />
        </div>
      </div>

      {/* Form Locker */}
      <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "#f6f7f7", borderBottom: "1px solid #dcdcde", fontSize: "13px", fontWeight: 700, color: "#1d2327" }}>表单访问限制</div>
        <div style={{ padding: "16px", display: "grid", gap: "16px" }}>
          <div>
            <Toggle on={settings.requireLogin} onChange={v => u("requireLogin", v)} label="要求登录后才能提交" />
            {settings.requireLogin && <div style={{ marginTop: "8px" }}><FField label="未登录提示语"><input style={S.input} value={settings.requireLoginMessage} onChange={e => u("requireLoginMessage", e.target.value)} /></FField></div>}
          </div>
          <div>
            <Toggle on={settings.limitEntries} onChange={v => u("limitEntries", v)} label="限制提交数量" />
            {settings.limitEntries && (
              <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                <div style={S.row2}>
                  <FField label="最大提交数"><input style={S.input} type="number" value={settings.limitEntriesCount} onChange={e => u("limitEntriesCount", Number(e.target.value))} /></FField>
                </div>
                <FField label="关闭提示语"><input style={S.input} value={settings.limitEntriesMessage} onChange={e => u("limitEntriesMessage", e.target.value)} /></FField>
              </div>
            )}
          </div>
          <div>
            <Toggle on={settings.scheduleForm} onChange={v => u("scheduleForm", v)} label="定时开放表单" />
            {settings.scheduleForm && (
              <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                <div style={S.row2}>
                  <FField label="开始时间"><input style={S.input} type="datetime-local" value={settings.scheduleStart} onChange={e => u("scheduleStart", e.target.value)} /></FField>
                  <FField label="结束时间"><input style={S.input} type="datetime-local" value={settings.scheduleEnd} onChange={e => u("scheduleEnd", e.target.value)} /></FField>
                </div>
                <FField label="关闭提示语"><input style={S.input} value={settings.scheduleClosedMessage} onChange={e => u("scheduleClosedMessage", e.target.value)} /></FField>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entries */}
      <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "#f6f7f7", borderBottom: "1px solid #dcdcde", fontSize: "13px", fontWeight: 700, color: "#1d2327" }}>提交记录管理</div>
        <div style={{ padding: "16px" }}>
          <Toggle on={settings.storeEntries !== false} onChange={v => u("storeEntries", v)} label="将提交记录保存到数据库" />
        </div>
      </div>
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab({ notifs, onChange, fields }: { notifs: Notification[]; onChange: (n: Notification[]) => void; fields: FormField[] }) {
  const [editId, setEditId] = useState<string | null>(notifs[0]?.id ?? null);
  const editing = notifs.find(n => n.id === editId);
  const add = () => {
    const n: Notification = { id: uid(), name: `通知 ${notifs.length + 1}`, active: true, toAddress: "{admin_email}", fromName: "{site_name}", fromEmail: "{admin_email}", replyTo: "", subject: "新的提交：{form_title}", message: "{all_fields}", conditionalLogic: false };
    onChange([...notifs, n]); setEditId(n.id);
  };
  const upd = (patch: Partial<Notification>) => onChange(notifs.map(n => n.id === editId ? { ...n, ...patch } : n));
  const del = (id: string) => { onChange(notifs.filter(n => n.id !== id)); if (editId === id) setEditId(notifs.find(n => n.id !== id)?.id ?? null); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "20px" }}>
      {/* List */}
      <div>
        {notifs.map(n => (
          <div key={n.id} onClick={() => setEditId(n.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: `1px solid ${editId === n.id ? "#2271b1" : "#dcdcde"}`, borderRadius: "3px", marginBottom: "4px", cursor: "pointer", background: editId === n.id ? "#f0f6fc" : "#fff" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1d2327" }}>{n.name}</div>
              <div style={{ fontSize: "11px", color: n.active ? "#146c43" : "#646970" }}>{n.active ? "启用" : "停用"}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); del(n.id); }} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "14px" }}>×</button>
          </div>
        ))}
        <button onClick={add} style={{ display: "block", width: "100%", padding: "8px", fontSize: "12px", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", color: "#2271b1", cursor: "pointer" }}>+ 添加通知</button>
      </div>

      {/* Editor */}
      {editing ? (
        <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", padding: "20px", display: "grid", gap: "14px" }}>
          <div style={S.row2}>
            <FField label="通知名称"><input style={S.input} value={editing.name} onChange={e => upd({ name: e.target.value })} /></FField>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "2px" }}><Toggle on={editing.active} onChange={v => upd({ active: v })} label="启用" /></div>
          </div>
          <FField label="收件邮箱" hint="多个邮箱用逗号分隔，支持智能标签。">
            <input style={S.input} value={editing.toAddress} onChange={e => upd({ toAddress: e.target.value })} />
            <SmartTagPicker onInsert={tag => upd({ toAddress: editing.toAddress + tag })} />
          </FField>
          <div style={S.row2}>
            <FField label="发件人名称"><input style={S.input} value={editing.fromName} onChange={e => upd({ fromName: e.target.value })} /></FField>
            <FField label="发件邮箱"><input style={S.input} value={editing.fromEmail} onChange={e => upd({ fromEmail: e.target.value })} /></FField>
          </div>
          <FField label="回复地址（Reply-To）"><input style={S.input} value={editing.replyTo} onChange={e => upd({ replyTo: e.target.value })} /></FField>
          <FField label="邮件主题"><input style={S.input} value={editing.subject} onChange={e => upd({ subject: e.target.value })} /></FField>
          <FField label="邮件正文">
            <textarea style={{ ...S.input, resize: "vertical" }} rows={6} value={editing.message} onChange={e => upd({ message: e.target.value })} />
            <SmartTagPicker onInsert={tag => upd({ message: editing.message + tag })} />
          </FField>
          <div style={{ background: "#f6f7f7", border: "1px solid #dcdcde", borderRadius: "3px", padding: "12px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#1d2327", margin: "0 0 10px" }}>条件逻辑</p>
            <ConditionalLogicEditor cl={editing.conditionalLogic} onChange={v => upd({ conditionalLogic: v })} fields={fields} />
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px", color: "#646970", fontSize: "13px" }}>
          请选择左侧通知进行编辑，或新建一条通知。
        </div>
      )}
    </div>
  );
}

// ─── Confirmations Tab ────────────────────────────────────────────────────────

function ConfirmationsTab({ confs, onChange, fields }: { confs: Confirmation[]; onChange: (c: Confirmation[]) => void; fields: FormField[] }) {
  const [editId, setEditId] = useState<string | null>(confs[0]?.id ?? null);
  const editing = confs.find(c => c.id === editId);
  const add = () => {
    const c: Confirmation = { id: uid(), name: `确认 ${confs.length + 1}`, active: true, type: "message", message: "<p>提交成功，感谢您的填写！</p>", redirectUrl: "", page: "", autoScroll: true, conditionalLogic: false };
    onChange([...confs, c]); setEditId(c.id);
  };
  const upd = (patch: Partial<Confirmation>) => onChange(confs.map(c => c.id === editId ? { ...c, ...patch } : c));
  const del = (id: string) => { onChange(confs.filter(c => c.id !== id)); if (editId === id) setEditId(confs.find(c => c.id !== id)?.id ?? null); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "20px" }}>
      <div>
        {confs.map(c => (
          <div key={c.id} onClick={() => setEditId(c.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: `1px solid ${editId === c.id ? "#2271b1" : "#dcdcde"}`, borderRadius: "3px", marginBottom: "4px", cursor: "pointer", background: editId === c.id ? "#f0f6fc" : "#fff" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1d2327" }}>{c.name}</div>
              <div style={{ fontSize: "11px", color: "#646970" }}>{{message:"显示文字",redirect:"跳转网址",page:"显示页面"}[c.type] ?? c.type}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); del(c.id); }} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "14px" }}>×</button>
          </div>
        ))}
        <button onClick={add} style={{ display: "block", width: "100%", padding: "8px", fontSize: "12px", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", color: "#2271b1", cursor: "pointer" }}>+ 添加确认</button>
      </div>

      {editing ? (
        <div style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", padding: "20px", display: "grid", gap: "14px" }}>
          <div style={S.row2}>
            <FField label="确认名称"><input style={S.input} value={editing.name} onChange={e => upd({ name: e.target.value })} /></FField>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "2px" }}><Toggle on={editing.active} onChange={v => upd({ active: v })} label="启用" /></div>
          </div>
          <FField label="确认方式">
            <select style={S.select} value={editing.type} onChange={e => upd({ type: e.target.value as any })}>
              <option value="message">显示文字</option>
              <option value="redirect">跳转网址（重定向）</option>
              <option value="page">显示站内页面</option>
            </select>
          </FField>
          {editing.type === "message" && (
            <FField label="确认信息">
              <textarea style={{ ...S.input, resize: "vertical" }} rows={5} value={editing.message} onChange={e => upd({ message: e.target.value })} />
              <SmartTagPicker onInsert={tag => upd({ message: editing.message + tag })} />
              <p style={S.hint}>支持 HTML，可使用智能标签插入用户提交的字段值。</p>
            </FField>
          )}
          {editing.type === "redirect" && (
            <FField label="跳转网址">
              <input style={S.input} value={editing.redirectUrl} onChange={e => upd({ redirectUrl: e.target.value })} placeholder="https://example.com/thank-you" />
              <SmartTagPicker onInsert={tag => upd({ redirectUrl: editing.redirectUrl + tag })} />
            </FField>
          )}
          {editing.type === "page" && (
            <FField label="页面地址"><input style={S.input} value={editing.page} onChange={e => upd({ page: e.target.value })} placeholder="/thank-you" /></FField>
          )}
          <Toggle on={editing.autoScroll} onChange={v => upd({ autoScroll: v })} label="自动滚动到确认信息" />
          <div style={{ background: "#f6f7f7", border: "1px solid #dcdcde", borderRadius: "3px", padding: "12px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#1d2327", margin: "0 0 10px" }}>条件逻辑</p>
            <ConditionalLogicEditor cl={editing.conditionalLogic} onChange={v => upd({ conditionalLogic: v })} fields={fields} />
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px", color: "#646970", fontSize: "13px" }}>
          请选择左侧确认进行编辑，或新建一条。
        </div>
      )}
    </div>
  );
}

// ─── Embed Panel ──────────────────────────────────────────────────────────────

function EmbedPanel({ formId }: { formId: string }) {
  const [copied, setCopied] = useState("");
  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 2000); };
  const url = `/forms/${formId}`;
  const iframe = `<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}${url}" width="100%" frameborder="0" scrolling="no" onload="window.parent.scrollTo(0,0)"></iframe>`;
  const shortcode = `[wpforms id="${formId}"]`;

  return (
    <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: "16px", width: "400px", marginTop: "4px" }}>
      <p style={{ fontWeight: 700, fontSize: "13px", marginBottom: "12px", color: "#1d2327" }}>嵌入表单</p>
      {[
        { label: "公开链接", value: url, key: "url" },
        { label: "iFrame 嵌入代码", value: iframe, key: "iframe" },
        { label: "短代码", value: shortcode, key: "shortcode" },
      ].map(item => (
        <div key={item.key} style={{ marginBottom: "12px" }}>
          <label style={S.label}>{item.label}</label>
          <div style={{ display: "flex", gap: "6px" }}>
            <input readOnly value={item.value} style={{ ...S.input, fontFamily: "monospace", fontSize: "11px", background: "#f6f7f7" }} />
            <button onClick={() => copy(item.value, item.key)} style={{ padding: "6px 10px", background: copied === item.key ? "#146c43" : "#2271b1", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer", fontSize: "12px", flexShrink: 0 }}>
              {copied === item.key ? "✓" : "复制"}
            </button>
          </div>
        </div>
      ))}
      <a href={url} target="_blank" style={{ display: "block", textAlign: "center", padding: "8px", background: "#f0f6fc", border: "1px solid #c3d9f7", borderRadius: "3px", color: "#2271b1", fontSize: "12px", textDecoration: "none" }}>
        预览表单 →
      </a>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function FormBuilder({ formId }: { formId?: string }) {
  const [form, setForm] = useState<WPForm | null>(null);
  const [tab, setTab] = useState<"fields"|"settings"|"notifications"|"confirmations">("fields");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(["标准字段"]));
  const toggleCategory = (cat: string) => setOpenCategories(prev => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    if (formId) {
      fetch(`/api/forms/${formId}`).then(r => r.ok ? r.json() as any : null).then((d: any) => {
        if (d) { setForm(d as any); } else { const f = defaultForm(); f.id = formId; setForm(f); }
      }).catch(() => { const f = defaultForm(); f.id = formId; setForm(f); });
    } else {
      setForm(defaultForm());
    }
  }, [formId]);

  const save = async () => {
    if (!form) return;
    setSaving(true); setStatus("保存中…");
    try {
      const res = await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) {
        setStatus("已保存 ✓");
        if (!formId) { const d = await res.json() as any; window.location.href = `/admin/forms/${d.form?.id ?? form.id}`; }
        setTimeout(() => setStatus(""), 3000);
      } else { setStatus("保存失败"); }
    } catch { setStatus("保存失败"); }
    setSaving(false);
  };

  const deleteForm = async () => {
    if (!formId || !confirm("确定删除此表单及其全部提交记录吗？此操作不可撤销。")) return;
    await fetch(`/api/forms/${formId}`, { method: "DELETE" });
    window.location.href = "/admin/forms";
  };

  if (!form) return <div style={{ padding: "40px", textAlign: "center", color: "#646970" }}>加载中…</div>;

  const selectedField = form.fields.find(f => f.id === selectedId) ?? null;

  const addField = (type: string) => {
    const f = createField(type);
    setForm({ ...form, fields: [...form.fields, f] });
    setSelectedId(f.id);
  };

  const updateField = (id: string, patch: Partial<FormField>) =>
    setForm({ ...form, fields: form.fields.map(f => f.id === id ? { ...f, ...patch } : f) });

  const deleteField = (id: string) => {
    setForm({ ...form, fields: form.fields.filter(f => f.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateField = (id: string) => {
    const src = form.fields.find(f => f.id === id);
    if (!src) return;
    const copy = { ...src, id: uid() };
    const idx = form.fields.findIndex(f => f.id === id);
    const arr = [...form.fields];
    arr.splice(idx + 1, 0, copy);
    setForm({ ...form, fields: arr });
    setSelectedId(copy.id);
  };

  const moveField = (id: string, dir: -1|1) => {
    const idx = form.fields.findIndex(f => f.id === id);
    if (idx + dir < 0 || idx + dir >= form.fields.length) return;
    const arr = [...form.fields];
    [arr[idx], arr[idx+dir]] = [arr[idx+dir], arr[idx]];
    setForm({ ...form, fields: arr });
  };

  const dropField = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const arr = [...form.fields];
    const from = arr.findIndex(f => f.id === dragId);
    const to = arr.findIndex(f => f.id === targetId);
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setForm({ ...form, fields: arr });
    setDragId(null); setDragOverId(null);
  };

  const fieldsByCategory = (cat: string) => Object.entries(FIELDS).filter(([, m]) => m.category === cat);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)", margin: "-20px -20px -40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", background: "#fff", borderBottom: "1px solid #dcdcde", flexShrink: 0 }}>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
          style={{ flex: 1, fontSize: "18px", fontWeight: 700, border: "none", outline: "none", background: "transparent", color: "#1d2327" }} placeholder="表单标题" />
        <span style={{ fontSize: "13px", color: "#646970" }}>{status}</span>
        {formId && (
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowEmbed(!showEmbed)} style={{ fontSize: "12px", background: "#f6f7f7", color: "#1d2327", border: "1px solid #dcdcde", padding: "7px 14px", borderRadius: "3px", cursor: "pointer" }}>
              嵌入 ▾
            </button>
            {showEmbed && <EmbedPanel formId={formId} />}
          </div>
        )}
        {formId && (
          <a href={`/admin/forms/${formId}/entries`} style={{ fontSize: "12px", background: "#f6f7f7", color: "#1d2327", border: "1px solid #dcdcde", padding: "7px 14px", borderRadius: "3px", textDecoration: "none" }}>
            提交记录
          </a>
        )}
        {formId && (
          <button onClick={deleteForm} style={{ fontSize: "12px", color: "#d63638", background: "#fff", border: "1px solid #d63638", padding: "7px 14px", borderRadius: "3px", cursor: "pointer" }}>删除</button>
        )}
        <button onClick={save} disabled={saving} style={{ background: "#2271b1", color: "#fff", border: "none", padding: "8px 20px", borderRadius: "3px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          {saving ? "保存中…" : "保存表单"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, background: "#fff", borderBottom: "1px solid #dcdcde", padding: "0 20px", flexShrink: 0 }}>
        {(["fields","settings","notifications","confirmations"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 16px", border: "none", background: "none", borderBottom: t === tab ? "2px solid #2271b1" : "2px solid transparent", color: t === tab ? "#2271b1" : "#646970", fontWeight: t === tab ? 600 : 400, cursor: "pointer", fontSize: "13px", textTransform: "capitalize" }}>
            {({fields:"字段",settings:"设置",notifications:"通知",confirmations:"确认"} as Record<string,string>)[t]}
            {t === "fields" && ` (${form.fields.length})`}
            {t === "notifications" && ` (${form.notifications.length})`}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {tab === "fields" && (
          <>
            {/* Left: Field Type Accordion */}
            <div style={{ width: "220px", borderRight: "1px solid #dcdcde", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #dcdcde", fontSize: "11px", fontWeight: 700, color: "#646970", textTransform: "uppercase", letterSpacing: "0.6px", background: "#f6f7f7" }}>
                添加字段
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {CATEGORIES.map(cat => {
                  const items = fieldsByCategory(cat);
                  const isOpen = openCategories.has(cat);
                  return (
                    <div key={cat} style={{ borderBottom: "1px solid #f0f0f1" }}>
                      {/* Accordion header */}
                      <button
                        onClick={() => toggleCategory(cat)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 14px", border: "none", background: isOpen ? "#f0f6fc" : "#fff",
                          cursor: "pointer", fontSize: "12px", fontWeight: 600,
                          color: isOpen ? "#2271b1" : "#1d2327", textAlign: "left",
                        }}
                        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "#f6f7f7"; }}
                        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "#fff"; }}
                      >
                        <span>{cat}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: "transform .15s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: isOpen ? "#2271b1" : "#8c8f94" }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {/* Accordion body */}
                      {isOpen && (
                        <div style={{ padding: "6px 10px 10px" }}>
                          {items.map(([type, meta]) => (
                            <button
                              key={type}
                              onClick={() => addField(type)}
                              style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: "3px", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#1d2327", textAlign: "left", marginBottom: "4px" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#f0f6fc"; e.currentTarget.style.borderColor = "#2271b1"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e0e0e0"; }}
                            >
                              <span style={{ width: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#2271b1" }}>
                                <FieldIcon type={type} size={13} />
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

            {/* Center: Canvas */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#f6f7f7" }} onClick={() => setSelectedId(null)}>
              {form.fields.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#646970", border: "2px dashed #dcdcde", borderRadius: "4px", background: "#fff" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c3c4c7" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "12px" }}>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                    <line x1="9" y1="16" x2="13" y2="16"/>
                  </svg>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: "#1d2327" }}>暂无字段</div>
                  <div style={{ fontSize: "12px" }}>点击左侧字段类型即可添加</div>
                </div>
              ) : (
                <div onClick={e => e.stopPropagation()}>
                  {form.fields.map((field, idx) => (
                    <CanvasField key={field.id} field={field}
                      selected={selectedId === field.id}
                      onSelect={() => setSelectedId(selectedId === field.id ? null : field.id)}
                      onDelete={() => deleteField(field.id)}
                      onDuplicate={() => duplicateField(field.id)}
                      onMove={dir => moveField(field.id, dir)}
                      isFirst={idx === 0} isLast={idx === form.fields.length - 1}
                      isDragOver={dragOverId === field.id}
                      onDragStart={() => setDragId(field.id)}
                      onDragOver={() => setDragOverId(field.id)}
                      onDrop={() => dropField(field.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Settings Panel */}
            <div style={{ width: "300px", borderLeft: "1px solid #dcdcde", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              {selectedField ? (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #dcdcde", display: "flex", alignItems: "center", gap: "8px", background: "#f6f7f7" }}>
                    <span style={{ display: "flex", alignItems: "center", color: "#2271b1" }}><FieldIcon type={selectedField.type} size={16} /></span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d2327", flex: 1 }}>字段选项</span>
                    <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#646970", fontSize: "16px" }}>×</button>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                    <FieldSettings field={selectedField} update={patch => updateField(selectedField.id, patch)} allFields={form.fields} />
                  </div>
                </>
              ) : (
                <div style={{ padding: "20px", color: "#646970", fontSize: "13px", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>⚙️</div>
                  <div style={{ fontWeight: 600, marginBottom: "6px" }}>字段选项</div>
                  <div>点击表单中的字段即可编辑其设置。</div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "settings" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <SettingsTab settings={form.settings} onChange={s => setForm({ ...form, settings: s })} />
          </div>
        )}

        {tab === "notifications" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <NotificationsTab notifs={form.notifications} onChange={n => setForm({ ...form, notifications: n })} fields={form.fields} />
          </div>
        )}

        {tab === "confirmations" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <ConfirmationsTab confs={form.confirmations} onChange={c => setForm({ ...form, confirmations: c })} fields={form.fields} />
          </div>
        )}
      </div>
    </div>
  );
}
