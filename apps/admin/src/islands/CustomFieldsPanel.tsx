import { useState, useEffect } from "react";

interface ACFField {
  id: string;
  key: string;
  label: string;
  name: string;
  type: string;
  instructions: string;
  required: boolean;
  conditionalLogic: any;
  wrapper: any;
  subFields?: ACFField[];
  layouts?: any[];
  choices?: string;
  [key: string]: any;
}

interface FieldGroup {
  id: string;
  title: string;
  fields: ACFField[];
  position: string;
  labelPlacement: string;
  active?: boolean;
  location?: any[][];
}

interface Props {
  postId: number;
  postType: string;
}

// ─── Parse choices string to array ───────────────────────────────────────────

function parseChoices(raw: any): { value: string; label: string }[] {
  if (!raw) return [];
  // Object format from AI action: { key: "Label", ... }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw).map(([value, label]) => ({ value, label: String(label) }));
  }
  // Array format: ["Label", ...]
  if (Array.isArray(raw)) {
    return raw.map(item => ({ value: String(item).toLowerCase().replace(/\s+/g, "_"), label: String(item) }));
  }
  // String format from FieldGroupEditor: "key : Label\nkey2 : Label2"
  return String(raw).split("\n").map(line => {
    const [v, ...rest] = line.split(":");
    const value = v.trim();
    const label = rest.length ? rest.join(":").trim() : value;
    return { value, label };
  }).filter(c => c.value);
}

// ─── Check if conditional logic passes ───────────────────────────────────────

function evaluateConditional(field: ACFField, values: Record<string, string>, allFields: ACFField[]): boolean {
  if (!field.conditionalLogic || !Array.isArray(field.conditionalLogic)) return true;
  const orGroups: any[][] = field.conditionalLogic;
  return orGroups.some(andGroup =>
    andGroup.every(rule => {
      const val = values[allFields.find(f => f.key === rule.field)?.name ?? ""] ?? "";
      switch (rule.operator) {
        case "==": return val === rule.value;
        case "!=": return val !== rule.value;
        case ">": return Number(val) > Number(rule.value);
        case "<": return Number(val) < Number(rule.value);
        case ">=": return Number(val) >= Number(rule.value);
        case "<=": return Number(val) <= Number(rule.value);
        case "=empty": return !val;
        case "!=empty": return !!val;
        default: return true;
      }
    })
  );
}

// ─── Single Field Input ───────────────────────────────────────────────────────

function FieldInput({ field, value, onChange, allValues, allFields }: {
  field: ACFField;
  value: string;
  onChange: (v: string) => void;
  allValues: Record<string, string>;
  allFields: ACFField[];
}) {
  const visible = evaluateConditional(field, allValues, allFields);
  if (!visible) return null;

  const s: React.CSSProperties = { width: "100%", padding: "6px 10px", fontSize: "13px", border: "1px solid #8c8f94", borderRadius: "3px", outline: "none", boxSizing: "border-box" };

  const t = field.type;

  if (t === "message" || t === "accordion" || t === "tab") {
    if (t === "message") return (
      <div style={{ padding: "8px 12px", background: "#f0f6fc", border: "1px solid #c3d9f7", borderRadius: "3px", fontSize: "13px", color: "#1d2327" }}
        dangerouslySetInnerHTML={{ __html: field.message ?? "" }}
      />
    );
    if (t === "accordion") return (
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1d2327", padding: "8px 0", borderBottom: "1px solid #dcdcde" }}>
        {field.label}
      </div>
    );
    if (t === "tab") return (
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#2271b1", textTransform: "uppercase", letterSpacing: "0.5px", padding: "6px 0", borderBottom: "2px solid #2271b1", marginBottom: "4px" }}>
        {field.label}
      </div>
    );
  }

  if (t === "text" || t === "email" || t === "url") {
    return <input type={t} style={s} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder ?? ""} readOnly={!!field.readonly} disabled={!!field.disabled} />;
  }

  if (t === "password") {
    return <input type="password" style={s} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder ?? ""} />;
  }

  if (t === "number") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {field.prepend && <span style={{ fontSize: "13px", color: "#646970" }}>{field.prepend}</span>}
        <input type="number" style={s} value={value} onChange={e => onChange(e.target.value)} min={field.min} max={field.max} step={field.step} placeholder={field.placeholder ?? ""} />
        {field.append && <span style={{ fontSize: "13px", color: "#646970" }}>{field.append}</span>}
      </div>
    );
  }

  if (t === "range") {
    const num = Number(value) || Number(field.min) || 0;
    return (
      <div>
        <input type="range" style={{ width: "100%" }} value={value || field.min || 0} min={field.min} max={field.max || 100} step={field.step || 1} onChange={e => onChange(e.target.value)} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#646970", marginTop: "2px" }}>
          <span>{field.prepend}{field.min ?? 0}{field.append}</span>
          <span style={{ fontWeight: 600 }}>{field.prepend}{value || field.min || 0}{field.append}</span>
          <span>{field.prepend}{field.max ?? 100}{field.append}</span>
        </div>
      </div>
    );
  }

  if (t === "textarea" || t === "wysiwyg") {
    return <textarea style={{ ...s, resize: "vertical", minHeight: t === "wysiwyg" ? "160px" : "80px" }} value={value} onChange={e => onChange(e.target.value)} rows={field.rows ?? 4} placeholder={field.placeholder ?? ""} />;
  }

  if (t === "true_false") {
    const isOn = value === "1";
    if (field.ui !== false) {
      return (
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <span style={{ display: "inline-block", width: "42px", height: "22px", background: isOn ? "#2271b1" : "#c3c4c7", borderRadius: "11px", position: "relative", transition: "background 0.2s" }}>
            <span style={{ position: "absolute", top: "3px", left: isOn ? "22px" : "3px", width: "16px", height: "16px", background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
          </span>
          <input type="checkbox" checked={isOn} onChange={e => onChange(e.target.checked ? "1" : "0")} style={{ display: "none" }} />
          <span style={{ fontSize: "13px", color: "#1d2327" }}>{isOn ? (field.uiOnText ?? "是") : (field.uiOffText ?? "否")}</span>
        </label>
      );
    }
    return (
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
        <input type="checkbox" checked={isOn} onChange={e => onChange(e.target.checked ? "1" : "0")} />
        {field.message && <span>{field.message}</span>}
      </label>
    );
  }

  if (t === "select") {
    const choices = parseChoices(field.choices ?? "");
    if (field.multiple) {
      const selected: string[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
      return (
        <select multiple style={{ ...s, height: "100px" }} value={selected}
          onChange={e => onChange(JSON.stringify(Array.from(e.target.selectedOptions, o => o.value)))}>
          {field.allowNull && <option value="">— 无 —</option>}
          {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      );
    }
    return (
      <select style={s} value={value} onChange={e => onChange(e.target.value)}>
        {field.allowNull && <option value="">— 请选择 —</option>}
        {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    );
  }

  if (t === "checkbox") {
    const choices = parseChoices(field.choices ?? "");
    const selected: string[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
    return (
      <div style={{ display: "flex", flexDirection: field.layout === "horizontal" ? "row" : "column", flexWrap: "wrap", gap: "8px" }}>
        {choices.map(c => (
          <label key={c.value} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(c.value)}
              onChange={e => onChange(JSON.stringify(e.target.checked ? [...selected, c.value] : selected.filter(v => v !== c.value)))} />
            {c.label}
          </label>
        ))}
      </div>
    );
  }

  if (t === "radio") {
    const choices = parseChoices(field.choices ?? "");
    return (
      <div style={{ display: "flex", flexDirection: field.layout === "horizontal" ? "row" : "column", flexWrap: "wrap", gap: "8px" }}>
        {choices.map(c => (
          <label key={c.value} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
            <input type="radio" name={field.name} checked={value === c.value} onChange={() => onChange(c.value)} />
            {c.label}
          </label>
        ))}
      </div>
    );
  }

  if (t === "button_group") {
    const choices = parseChoices(field.choices ?? "");
    return (
      <div style={{ display: "flex", gap: "0", border: "1px solid #dcdcde", borderRadius: "3px", overflow: "hidden", flexWrap: field.layout === "vertical" ? "wrap" : "nowrap" }}>
        {choices.map(c => (
          <button key={c.value} type="button" onClick={() => onChange(c.value)} style={{
            padding: "7px 14px", fontSize: "13px", border: "none", borderRight: "1px solid #dcdcde",
            background: value === c.value ? "#2271b1" : "#fff", color: value === c.value ? "#fff" : "#1d2327",
            cursor: "pointer", fontWeight: value === c.value ? 600 : 400,
          }}>
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  if (t === "color_picker") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input type="color" value={value || "#ffffff"} onChange={e => onChange(e.target.value)} style={{ width: "40px", height: "32px", border: "1px solid #dcdcde", borderRadius: "3px", cursor: "pointer" }} />
        <input type="text" style={{ ...s, flex: 1 }} value={value} onChange={e => onChange(e.target.value)} placeholder="#ffffff" />
      </div>
    );
  }

  if (t === "date_picker") {
    return <input type="date" style={s} value={value} onChange={e => onChange(e.target.value)} />;
  }

  if (t === "date_time_picker") {
    return <input type="datetime-local" style={s} value={value} onChange={e => onChange(e.target.value)} />;
  }

  if (t === "time_picker") {
    return <input type="time" style={s} value={value} onChange={e => onChange(e.target.value)} />;
  }

  if (t === "image") {
    const imgId = value;
    return (
      <div>
        {imgId && <div style={{ fontSize: "11px", color: "#646970", marginBottom: "4px" }}>附件 ID：{imgId}</div>}
        <input type="number" style={s} value={value} onChange={e => onChange(e.target.value)} placeholder="附件 ID" />
        <p style={{ fontSize: "11px", color: "#646970", marginTop: "3px" }}>请输入 WordPress 附件 ID（媒体库中上传的项目）</p>
      </div>
    );
  }

  if (t === "file") {
    return (
      <div>
        <input type="number" style={s} value={value} onChange={e => onChange(e.target.value)} placeholder="附件 ID" />
        <p style={{ fontSize: "11px", color: "#646970", marginTop: "3px" }}>请输入 WordPress 附件 ID</p>
      </div>
    );
  }

  if (t === "gallery") {
    const ids: string[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {ids.map((id, i) => (
            <div key={i} style={{ position: "relative", background: "#f0f0f1", padding: "4px 8px", borderRadius: "3px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
              <span>ID: {id}</span>
              <button type="button" onClick={() => onChange(JSON.stringify(ids.filter((_, j) => j !== i)))} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "14px", padding: "0" }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <input type="number" id={`gallery_add_${field.name}`} style={{ ...s, flex: 1 }} placeholder="添加附件 ID" />
          <button type="button" onClick={() => {
            const el = document.getElementById(`gallery_add_${field.name}`) as HTMLInputElement;
            if (el?.value) { onChange(JSON.stringify([...ids, el.value])); el.value = ""; }
          }} style={{ padding: "6px 12px", background: "#2271b1", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer", fontSize: "13px" }}>添加</button>
        </div>
      </div>
    );
  }

  if (t === "link") {
    const link = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
    return (
      <div style={{ display: "grid", gap: "6px" }}>
        <input type="url" style={s} value={link.url ?? ""} onChange={e => onChange(JSON.stringify({ ...link, url: e.target.value }))} placeholder="URL" />
        <input type="text" style={s} value={link.title ?? ""} onChange={e => onChange(JSON.stringify({ ...link, title: e.target.value }))} placeholder="链接文字" />
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
          <input type="checkbox" checked={link.target === "_blank"} onChange={e => onChange(JSON.stringify({ ...link, target: e.target.checked ? "_blank" : "" }))} />
          在新标签页打开
        </label>
      </div>
    );
  }

  if (t === "google_map") {
    const map = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "6px" }}>
        <input type="text" style={s} value={map.lat ?? ""} onChange={e => onChange(JSON.stringify({ ...map, lat: e.target.value }))} placeholder="纬度" />
        <input type="text" style={s} value={map.lng ?? ""} onChange={e => onChange(JSON.stringify({ ...map, lng: e.target.value }))} placeholder="经度" />
        <input type="number" style={s} value={map.zoom ?? 14} onChange={e => onChange(JSON.stringify({ ...map, zoom: e.target.value }))} placeholder="缩放" />
        <input type="text" style={{ ...s, gridColumn: "1/-1" }} value={map.address ?? ""} onChange={e => onChange(JSON.stringify({ ...map, address: e.target.value }))} placeholder="地址" />
      </div>
    );
  }

  if (t === "oembed") {
    return (
      <div>
        <input type="url" style={s} value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." />
        {value && (
          <p style={{ fontSize: "11px", color: "#646970", marginTop: "3px" }}>粘贴 YouTube、Vimeo、Twitter 或其他兼容 oEmbed 的网址</p>
        )}
      </div>
    );
  }

  if (t === "post_object" || t === "page_link" || t === "relationship" || t === "taxonomy" || t === "user") {
    const isMulti = t === "relationship" || field.multiple;
    if (isMulti) {
      const ids: string[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
      return (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px", padding: ids.length ? "6px" : "0", background: ids.length ? "#f6f7f7" : "transparent", borderRadius: "3px" }}>
            {ids.map((id, i) => (
              <span key={i} style={{ background: "#2271b1", color: "#fff", padding: "2px 8px", borderRadius: "10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                {id}
                <button type="button" onClick={() => onChange(JSON.stringify(ids.filter((_, j) => j !== i)))} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "14px", padding: "0", lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input type="number" id={`multi_add_${field.name}`} style={{ ...s, flex: 1 }} placeholder="添加 ID" />
            <button type="button" onClick={() => {
              const el = document.getElementById(`multi_add_${field.name}`) as HTMLInputElement;
              if (el?.value) { onChange(JSON.stringify([...ids, el.value])); el.value = ""; }
            }} style={{ padding: "6px 12px", background: "#2271b1", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer", fontSize: "13px" }}>添加</button>
          </div>
        </div>
      );
    }
    return <input type="number" style={s} value={value} onChange={e => onChange(e.target.value)} placeholder="请输入 ID" />;
  }

  if (t === "repeater") {
    const rows: any[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
    const subFields: ACFField[] = field.subFields ?? [];

    const updateRow = (ri: number, name: string, v: string) => {
      const newRows = rows.map((row, i) => i === ri ? { ...row, [name]: v } : row);
      onChange(JSON.stringify(newRows));
    };

    const addRow = () => {
      const newRow: any = {};
      subFields.forEach(f => { newRow[f.name] = ""; });
      onChange(JSON.stringify([...rows, newRow]));
    };

    const deleteRow = (ri: number) => onChange(JSON.stringify(rows.filter((_, i) => i !== ri)));

    return (
      <div>
        {rows.map((row, ri) => (
          <div key={ri} style={{ border: "1px solid #dcdcde", borderRadius: "3px", padding: "12px", marginBottom: "8px", background: "#f6f7f7" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#646970" }}>第 {ri + 1} 行</span>
              <button type="button" onClick={() => deleteRow(ri)} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "13px" }}>删除此行</button>
            </div>
            {subFields.map(sf => (
              <div key={sf.id} style={{ marginBottom: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "3px", color: "#1d2327" }}>{sf.label}{sf.required && <span style={{ color: "#d63638" }}>*</span>}</label>
                {sf.instructions && <p style={{ fontSize: "11px", color: "#646970", marginBottom: "3px" }}>{sf.instructions}</p>}
                <FieldInput field={sf} value={row[sf.name] ?? ""} onChange={v => updateRow(ri, sf.name, v)} allValues={allValues} allFields={allFields} />
              </div>
            ))}
          </div>
        ))}
        <button type="button" onClick={addRow} style={{ fontSize: "13px", color: "#2271b1", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", padding: "6px 16px", cursor: "pointer", width: "100%" }}>
          + {field.buttonLabel ?? "添加一行"}
        </button>
      </div>
    );
  }

  if (t === "group") {
    const groupData: any = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
    const subFields: ACFField[] = field.subFields ?? [];

    const updateSub = (name: string, v: string) => onChange(JSON.stringify({ ...groupData, [name]: v }));

    return (
      <div style={{ border: "1px solid #dcdcde", borderRadius: "3px", padding: "12px", background: "#f6f7f7" }}>
        {subFields.map(sf => (
          <div key={sf.id} style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "3px", color: "#1d2327" }}>{sf.label}{sf.required && <span style={{ color: "#d63638" }}>*</span>}</label>
            {sf.instructions && <p style={{ fontSize: "11px", color: "#646970", marginBottom: "3px" }}>{sf.instructions}</p>}
            <FieldInput field={sf} value={groupData[sf.name] ?? ""} onChange={v => updateSub(sf.name, v)} allValues={allValues} allFields={allFields} />
          </div>
        ))}
      </div>
    );
  }

  if (t === "flexible_content") {
    const fcData: any[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
    const layouts: any[] = field.layouts ?? [];

    const addLayout = (layoutName: string) => {
      const layout = layouts.find(l => l.name === layoutName);
      if (!layout) return;
      const newRow: any = { _layout: layoutName };
      (layout.subFields ?? []).forEach((f: ACFField) => { newRow[f.name] = ""; });
      onChange(JSON.stringify([...fcData, newRow]));
    };

    const updateRow = (ri: number, name: string, v: string) => {
      onChange(JSON.stringify(fcData.map((row, i) => i === ri ? { ...row, [name]: v } : row)));
    };

    const deleteRow = (ri: number) => onChange(JSON.stringify(fcData.filter((_, i) => i !== ri)));

    return (
      <div>
        {fcData.map((row, ri) => {
          const layout = layouts.find(l => l.name === row._layout);
          if (!layout) return null;
          const subFields: ACFField[] = layout.subFields ?? [];
          return (
            <div key={ri} style={{ border: "1px solid #dcdcde", borderRadius: "3px", padding: "12px", marginBottom: "8px", background: "#f6f7f7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#2271b1" }}>{layout.label}</span>
                <button type="button" onClick={() => deleteRow(ri)} style={{ background: "none", border: "none", color: "#d63638", cursor: "pointer", fontSize: "13px" }}>删除</button>
              </div>
              {subFields.map(sf => (
                <div key={sf.id} style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "3px", color: "#1d2327" }}>{sf.label}</label>
                  <FieldInput field={sf} value={row[sf.name] ?? ""} onChange={v => updateRow(ri, sf.name, v)} allValues={allValues} allFields={allFields} />
                </div>
              ))}
            </div>
          );
        })}
        {layouts.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {layouts.map(l => (
              <button key={l.name} type="button" onClick={() => addLayout(l.name)} style={{ fontSize: "12px", color: "#2271b1", background: "none", border: "1px dashed #2271b1", borderRadius: "3px", padding: "5px 12px", cursor: "pointer" }}>
                + {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback: text input
  return <input type="text" style={s} value={value} onChange={e => onChange(e.target.value)} />;
}

// ─── Field Row in panel ───────────────────────────────────────────────────────

function FieldRow({ field, value, onChange, allValues, allFields, labelPlacement }: {
  field: ACFField;
  value: string;
  onChange: (v: string) => void;
  allValues: Record<string, string>;
  allFields: ACFField[];
  labelPlacement: string;
}) {
  if (!evaluateConditional(field, allValues, allFields)) return null;
  if (field.type === "message" || field.type === "accordion" || field.type === "tab") {
    return (
      <div style={{ marginBottom: "12px" }}>
        <FieldInput field={field} value={value} onChange={onChange} allValues={allValues} allFields={allFields} />
      </div>
    );
  }

  const isLeft = labelPlacement === "left";
  return (
    <div style={{ display: isLeft ? "grid" : "block", gridTemplateColumns: isLeft ? "140px 1fr" : undefined, gap: isLeft ? "12px" : undefined, alignItems: "start", marginBottom: "14px" }}>
      <div>
        <label style={{ fontSize: "12px", fontWeight: 600, color: "#1d2327", display: "block", paddingTop: isLeft ? "8px" : "0", marginBottom: isLeft ? "0" : "4px" }}>
          {field.label}
          {field.required && <span style={{ color: "#d63638", marginLeft: "3px" }}>*</span>}
        </label>
        {field.instructions && !isLeft && <p style={{ fontSize: "11px", color: "#646970", margin: "2px 0 4px" }}>{field.instructions}</p>}
      </div>
      <div>
        {isLeft && field.instructions && <p style={{ fontSize: "11px", color: "#646970", margin: "0 0 4px" }}>{field.instructions}</p>}
        <FieldInput field={field} value={value} onChange={onChange} allValues={allValues} allFields={allFields} />
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function CustomFieldsPanel({ postId, postType }: Props) {
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/custom-fields").then(r => r.ok ? r.json() : []),
      fetch(`/api/custom-fields/values?postId=${postId}`).then(r => r.ok ? r.json() : {}),
    ]).then(([allGroups, vals]) => {
      const applicable = (allGroups as FieldGroup[]).filter(g => {
        if (g.active === false) return false;
        if (!g.location || g.location.length === 0) return false;
        return (g as any).location.some((andGroup: any[]) =>
          andGroup.every((rule: any) => {
            if (rule.param === "post_type") {
              return rule.operator === "==" ? rule.value === postType : rule.value !== postType;
            }
            return true;
          })
        );
      });
      setGroups(applicable);
      setValues(vals as Record<string, string>);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [postId, postType]);

  const save = async () => {
    setSaving(true);
    setStatus("保存中…");
    try {
      const res = await fetch("/api/custom-fields/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, values }),
      });
      if (res.ok) {
        setStatus("已保存 ✓");
        setTimeout(() => setStatus(""), 3000);
      } else {
        setStatus("保存失败");
      }
    } catch {
      setStatus("保存失败");
    }
    setSaving(false);
  };

  // Expose save to window so it can be called alongside savePost
  useEffect(() => {
    (window as any).__saveCustomFields = save;
  }, [values, postId]);

  if (loading) return <div style={{ padding: "12px", fontSize: "13px", color: "#646970" }}>正在加载字段…</div>;
  if (groups.length === 0) return null;

  return (
    <div>
      {groups.map(group => {
        const allFields = group.fields;
        return (
          <div key={group.id} style={{ background: "#fff", border: "1px solid #dcdcde", borderRadius: "4px", overflow: "hidden", marginBottom: "16px" }}>
            <div style={{ background: "#f6f7f7", padding: "10px 16px", fontSize: "13px", fontWeight: 700, color: "#1d2327", borderBottom: "1px solid #dcdcde", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{group.title}</span>
              <span style={{ fontSize: "12px", color: "#646970", fontWeight: 400 }}>{status}</span>
            </div>
            <div style={{ padding: "16px" }}>
              {group.fields.map(field => (
                <FieldRow
                  key={field.id}
                  field={field}
                  value={values[field.name] ?? ""}
                  onChange={v => setValues(prev => ({ ...prev, [field.name]: v }))}
                  allValues={values}
                  allFields={allFields}
                  labelPlacement={group.labelPlacement ?? "top"}
                />
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px", paddingTop: "12px", borderTop: "1px solid #f0f0f1" }}>
                <button type="button" onClick={save} disabled={saving} style={{ background: "#2271b1", color: "#fff", border: "none", padding: "7px 16px", borderRadius: "3px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "保存中…" : "保存字段"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
