import { useState, useEffect, useRef } from "react";

interface FormField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: any;
  choices?: Array<{ label: string; value: string; selected?: boolean }>;
  size?: "small" | "medium" | "large";
  subfields?: { first?: boolean; last?: boolean; middle?: boolean; prefix?: boolean; suffix?: boolean };
  addressFields?: { address1?: boolean; address2?: boolean; city?: boolean; state?: boolean; zip?: boolean; country?: boolean };
  dateFormat?: string;
  timeFormat?: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  fileExtensions?: string;
  maxFileSize?: number;
  allowMultiple?: boolean;
  ratingMax?: number;
  npsLeft?: string;
  npsRight?: string;
  html?: string;
  minLength?: number;
  maxLength?: number;
  conditionalLogic?: {
    enabled: boolean;
    action: "show" | "hide";
    logicType: "all" | "any";
    rules: Array<{ field: string; operator: string; value: string }>;
  };
}

interface Form {
  id: string;
  name?: string;
  title?: string;
  fields: FormField[];
  settings?: {
    submitButtonText?: string;
    submitButtonAlignment?: string;
    honeypot?: boolean;
    labelAlignment?: string;
  };
  confirmations?: Array<{
    type: "message" | "redirect" | "page";
    message?: string;
    redirectUrl?: string;
    active?: boolean;
  }>;
}

function evaluateConditional(field: FormField, values: Record<string, any>, allFields: FormField[]): boolean {
  const cl = field.conditionalLogic;
  if (!cl || !cl.enabled) return true;

  const results = cl.rules.map(rule => {
    const val = String(values[rule.field] ?? "");
    switch (rule.operator) {
      case "is": return val === rule.value;
      case "is_not": return val !== rule.value;
      case "contains": return val.includes(rule.value);
      case "not_contains": return !val.includes(rule.value);
      case "starts_with": return val.startsWith(rule.value);
      case "ends_with": return val.endsWith(rule.value);
      case "greater_than": return Number(val) > Number(rule.value);
      case "less_than": return Number(val) < Number(rule.value);
      case "is_empty": return val === "";
      case "is_not_empty": return val !== "";
      default: return true;
    }
  });

  const passes = cl.logicType === "all" ? results.every(Boolean) : results.some(Boolean);
  return cl.action === "show" ? passes : !passes;
}

function FieldInput({ field, value, onChange, labelAlign }: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
  labelAlign: string;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid #dcdcde", borderRadius: 4,
    fontSize: 14, boxSizing: "border-box", outline: "none",
    fontFamily: "system-ui, -apple-system, sans-serif"
  };

  const { type, placeholder, choices = [], minValue, maxValue, step, ratingMax = 5 } = field;

  switch (type) {
    case "text":
    case "email":
    case "url":
    case "phone":
    case "password":
      return (
        <input
          type={type === "phone" ? "tel" : type}
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          minLength={field.minLength}
          maxLength={field.maxLength}
        />
      );
    case "number":
      return (
        <input type="number" value={value ?? ""} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} style={inputStyle} min={minValue} max={maxValue} step={step} />
      );
    case "range_slider":
      return (
        <div>
          <input type="range" value={value ?? minValue ?? 0} onChange={e => onChange(Number(e.target.value))}
            min={minValue ?? 0} max={maxValue ?? 100} step={step ?? 1}
            style={{ width: "100%", marginBottom: 4 }} />
          <span style={{ fontSize: 12, color: "#646970" }}>值：{value ?? minValue ?? 0}</span>
        </div>
      );
    case "textarea":
      return (
        <textarea value={value ?? ""} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={4}
          style={{ ...inputStyle, resize: "vertical" }} />
      );
    case "dropdown":
      return (
        <select value={value ?? ""} onChange={e => onChange(e.target.value)} style={inputStyle}>
          <option value="">— 请选择 —</option>
          {choices.map((c, i) => <option key={i} value={c.value}>{c.label}</option>)}
        </select>
      );
    case "multiple_choice":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {choices.map((c, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="radio" name={field.id} value={c.value}
                checked={value === c.value} onChange={() => onChange(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      );
    case "checkboxes":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {choices.map((c, i) => {
            const checked = Array.isArray(value) && value.includes(c.value);
            return (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" value={c.value} checked={checked}
                  onChange={e => {
                    const arr: string[] = Array.isArray(value) ? [...value] : [];
                    if (e.target.checked) onChange([...arr, c.value]);
                    else onChange(arr.filter(v => v !== c.value));
                  }} />
                {c.label}
              </label>
            );
          })}
        </div>
      );
    case "name":
      return (
        <div style={{ display: "flex", gap: 8 }}>
          {field.subfields?.prefix !== false && (
            <select value={(value as any)?.prefix ?? ""} onChange={e => onChange({ ...(value ?? {}), prefix: e.target.value })}
              style={{ ...inputStyle, width: 90 }}>
              <option value="">称谓</option>
              {[["Mr.","先生"],["Mrs.","女士"],["Ms.","女士"],["Dr.","博士"],["Prof.","教授"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          {field.subfields?.first !== false && (
            <input type="text" placeholder="名字" value={(value as any)?.first ?? ""}
              onChange={e => onChange({ ...(value ?? {}), first: e.target.value })}
              style={{ ...inputStyle, flex: 1 }} />
          )}
          {field.subfields?.middle && (
            <input type="text" placeholder="中间名" value={(value as any)?.middle ?? ""}
              onChange={e => onChange({ ...(value ?? {}), middle: e.target.value })}
              style={{ ...inputStyle, flex: 1 }} />
          )}
          {field.subfields?.last !== false && (
            <input type="text" placeholder="姓氏" value={(value as any)?.last ?? ""}
              onChange={e => onChange({ ...(value ?? {}), last: e.target.value })}
              style={{ ...inputStyle, flex: 1 }} />
          )}
          {field.subfields?.suffix && (
            <input type="text" placeholder="后缀" value={(value as any)?.suffix ?? ""}
              onChange={e => onChange({ ...(value ?? {}), suffix: e.target.value })}
              style={{ ...inputStyle, width: 80 }} />
          )}
        </div>
      );
    case "address":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {field.addressFields?.address1 !== false && (
            <input type="text" placeholder="详细地址" value={(value as any)?.address1 ?? ""}
              onChange={e => onChange({ ...(value ?? {}), address1: e.target.value })} style={inputStyle} />
          )}
          {field.addressFields?.address2 && (
            <input type="text" placeholder="地址第二行" value={(value as any)?.address2 ?? ""}
              onChange={e => onChange({ ...(value ?? {}), address2: e.target.value })} style={inputStyle} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {field.addressFields?.city !== false && (
              <input type="text" placeholder="城市" value={(value as any)?.city ?? ""}
                onChange={e => onChange({ ...(value ?? {}), city: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} />
            )}
            {field.addressFields?.state !== false && (
              <input type="text" placeholder="省 / 州" value={(value as any)?.state ?? ""}
                onChange={e => onChange({ ...(value ?? {}), state: e.target.value })}
                style={{ ...inputStyle, flex: 1 }} />
            )}
            {field.addressFields?.zip !== false && (
              <input type="text" placeholder="邮政编码" value={(value as any)?.zip ?? ""}
                onChange={e => onChange({ ...(value ?? {}), zip: e.target.value })}
                style={{ ...inputStyle, width: 100 }} />
            )}
          </div>
          {field.addressFields?.country !== false && (
            <input type="text" placeholder="国家 / 地区" value={(value as any)?.country ?? ""}
              onChange={e => onChange({ ...(value ?? {}), country: e.target.value })} style={inputStyle} />
          )}
        </div>
      );
    case "date_time":
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={(value as any)?.date ?? ""}
            onChange={e => onChange({ ...(value ?? {}), date: e.target.value })}
            style={{ ...inputStyle, flex: 1 }} />
          {(field.timeFormat !== "none") && (
            <input type="time" value={(value as any)?.time ?? ""}
              onChange={e => onChange({ ...(value ?? {}), time: e.target.value })}
              style={{ ...inputStyle, flex: 1 }} />
          )}
        </div>
      );
    case "file":
      return (
        <div>
          <input type="file" onChange={e => onChange(e.target.files?.[0]?.name ?? "")}
            accept={field.fileExtensions ? field.fileExtensions.split(",").map(e => `.${e.trim()}`).join(",") : undefined}
            multiple={field.allowMultiple}
            style={{ fontSize: 13 }} />
          {field.fileExtensions && <div style={{ fontSize: 11, color: "#646970", marginTop: 3 }}>允许的格式：{field.fileExtensions}</div>}
        </div>
      );
    case "rating":
      return (
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: ratingMax }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              style={{
                background: "none", border: "none", cursor: "pointer", fontSize: 28,
                color: (value ?? 0) >= n ? "#f59e0b" : "#dcdcde"
              }}
            >★</button>
          ))}
        </div>
      );
    case "nps":
      return (
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            {Array.from({ length: 11 }, (_, i) => i).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                style={{
                  width: 36, height: 36, border: "1px solid #dcdcde", borderRadius: 4,
                  cursor: "pointer", fontSize: 13,
                  background: value === n ? "#2271b1" : "#fff",
                  color: value === n ? "#fff" : "#3c434a"
                }}
              >{n}</button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#646970" }}>
            <span>{field.npsLeft ?? "完全不可能"}</span>
            <span>{field.npsRight ?? "非常可能"}</span>
          </div>
        </div>
      );
    case "likert":
      return (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 10px", textAlign: "left" }}></th>
                {choices.map((c, i) => (
                  <th key={i} style={{ padding: "6px 10px", textAlign: "center", fontWeight: 400, color: "#646970" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "6px 10px" }}></td>
                {choices.map((c, i) => (
                  <td key={i} style={{ padding: "6px 10px", textAlign: "center" }}>
                    <input type="radio" name={field.id} value={c.value}
                      checked={value === c.value} onChange={() => onChange(c.value)} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      );
    case "html":
      return <div dangerouslySetInnerHTML={{ __html: field.html ?? "" }} />;
    case "section_divider":
      return <hr style={{ border: "none", borderTop: "1px solid #dcdcde", margin: "8px 0" }} />;
    case "page_break":
      return <div style={{ borderTop: "2px dashed #dcdcde", padding: "8px 0", color: "#646970", fontSize: 12, textAlign: "center" }}>— 分页 —</div>;
    case "hidden":
      return null;
    case "captcha":
      return <div style={{ padding: "12px", border: "1px solid #dcdcde", borderRadius: 4, background: "#f6f7f7", fontSize: 13, color: "#646970" }}>🤖 reCAPTCHA（仅预览）</div>;
    case "signature":
      return <div style={{ border: "1px solid #dcdcde", borderRadius: 4, height: 80, background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#646970" }}>✍ 签名字段（浏览器暂不支持）</div>;
    default:
      return <input type="text" value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />;
  }
}

export default function FormRenderer({ formId, pageUrl }: { formId: string; pageUrl?: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    fetch(`/api/forms/${formId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: any) => {
        setForm(data);
        // Pre-fill defaults
        const defaults: Record<string, any> = {};
        for (const f of data.fields ?? []) {
          if (f.defaultValue !== undefined && f.defaultValue !== "") defaults[f.id] = f.defaultValue;
          if (f.type === "checkboxes") {
            const sel = (f.choices ?? []).filter((c: any) => c.selected).map((c: any) => c.value);
            if (sel.length > 0) defaults[f.id] = sel;
          }
        }
        setValues(defaults);
      })
      .catch(() => setLoadError("表单不存在。"));
  }, [formId]);

  if (loadError) return <div style={{ padding: 24, color: "#dc3232" }}>{loadError}</div>;
  if (!form) return <div style={{ padding: 24, color: "#646970" }}>表单加载中…</div>;

  // Split fields into pages
  const pages: FormField[][] = [];
  let current: FormField[] = [];
  for (const f of form.fields ?? []) {
    if (f.type === "page_break") {
      pages.push(current);
      current = [];
    } else {
      current.push(f);
    }
  }
  pages.push(current);

  const isMultiPage = pages.length > 1;
  const currentFields = pages[currentPage] ?? [];
  const visibleFields = currentFields.filter(f => evaluateConditional(f, values, form.fields ?? []));

  const validate = (fields: FormField[]) => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required) continue;
      if (["page_break","section_divider","html","captcha"].includes(f.type)) continue;
      const v = values[f.id];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
        errs[f.id] = `请填写「${f.label}」。`;
      }
    }
    return errs;
  };

  const handleNext = () => {
    const errs = validate(visibleFields);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setCurrentPage(p => p + 1);
  };

  const handlePrev = () => {
    setErrors({});
    setCurrentPage(p => p - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(visibleFields);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const payload: any = { formId, fields: values, pageUrl: pageUrl ?? window.location.href };
      // Honeypot
      if (form.settings?.honeypot) payload.fields["__hp"] = "";

      const r = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json() as any;
      if (!r.ok) {
        setErrors({ _form: data.error ?? "提交失败，请稍后再试。" });
        setSubmitting(false);
        return;
      }
      setConfirmation(data.confirmation);
      setSubmitted(true);

      // Handle redirect
      if (data.confirmation?.type === "redirect" && data.confirmation?.redirectUrl) {
        window.location.href = data.confirmation.redirectUrl;
      }
    } catch {
      setErrors({ _form: "网络异常，请稍后再试。" });
      setSubmitting(false);
    }
  };

  const labelAlign = form.settings?.labelAlignment ?? "top";
  const submitText = form.settings?.submitButtonText ?? (form.settings as any)?.submitText ?? "提交";
  const submitAlign = form.settings?.submitButtonAlignment ?? "left";

  if (submitted && confirmation) {
    if (confirmation.type === "redirect") {
      return <div style={{ padding: 24, color: "#646970" }}>正在跳转…</div>;
    }
    return (
      <div style={{ padding: "24px", background: "#f0f7ee", border: "1px solid #7ad03a", borderRadius: 8 }}>
        <div dangerouslySetInnerHTML={{ __html: confirmation.message ?? "<p>提交成功，感谢您的填写！</p>" }} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {isMultiPage && (
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {pages.map((_, i) => (
            <div key={i} style={{
              height: 6, flex: 1, borderRadius: 3,
              background: i <= currentPage ? "#2271b1" : "#dcdcde"
            }} />
          ))}
        </div>
      )}

      {errors._form && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fce8e8", border: "1px solid #dc3232", borderRadius: 4, color: "#dc3232", fontSize: 13 }}>
          {errors._form}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {visibleFields.map(field => {
          if (field.type === "hidden") {
            return <input key={field.id} type="hidden" value={field.defaultValue ?? ""} />;
          }
          if (["section_divider","html"].includes(field.type)) {
            return (
              <div key={field.id}>
                {field.type === "section_divider" && field.label && (
                  <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, borderBottom: "1px solid #dcdcde", paddingBottom: 8 }}>{field.label}</h3>
                )}
                {field.type === "html" && <div dangerouslySetInnerHTML={{ __html: field.html ?? "" }} />}
                {field.description && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#646970" }}>{field.description}</p>}
              </div>
            );
          }

          return (
            <div key={field.id} style={labelAlign === "left" ? { display: "flex", gap: 16, alignItems: "flex-start" } : {}}>
              {field.type !== "html" && field.type !== "section_divider" && (
                <label style={{
                  display: "block",
                  fontWeight: 500, fontSize: 13, marginBottom: labelAlign === "top" ? 4 : 0,
                  minWidth: labelAlign === "left" ? 140 : undefined,
                  paddingTop: labelAlign === "left" ? 8 : 0,
                  color: "#1d2327"
                }}>
                  {field.label}
                  {field.required && <span style={{ color: "#dc3232", marginLeft: 2 }}>*</span>}
                </label>
              )}
              <div style={{ flex: 1 }}>
                <FieldInput
                  field={field}
                  value={values[field.id]}
                  onChange={v => setValues(prev => ({ ...prev, [field.id]: v }))}
                  labelAlign={labelAlign}
                />
                {field.description && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#646970" }}>{field.description}</p>}
                {errors[field.id] && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#dc3232" }}>{errors[field.id]}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Form actions */}
      <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: submitAlign === "center" ? "center" : submitAlign === "right" ? "flex-end" : "flex-start" }}>
        {isMultiPage && currentPage > 0 && (
          <button type="button" onClick={handlePrev}
            style={{ padding: "9px 22px", background: "#f6f7f7", border: "1px solid #dcdcde", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>
            ← 上一页
          </button>
        )}
        {isMultiPage && currentPage < pages.length - 1 ? (
          <button type="button" onClick={handleNext}
            style={{ padding: "9px 22px", background: "#2271b1", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            下一页 →
          </button>
        ) : (
          <button type="submit" disabled={submitting}
            style={{ padding: "9px 22px", background: "#2271b1", color: "#fff", border: "none", borderRadius: 4, cursor: submitting ? "default" : "pointer", fontSize: 14, fontWeight: 600, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "提交中…" : submitText}
          </button>
        )}
      </div>
    </form>
  );
}
