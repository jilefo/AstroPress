import { useState, useEffect, useRef } from "react";

interface Term {
  id: number;
  termTaxonomyId: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

interface TaxonomyPanelProps {
  postId: number;
  taxonomy: string;
  label: string;
  hierarchical: boolean;
}

export default function TaxonomyPanel({ postId, taxonomy, label, hierarchical }: TaxonomyPanelProps) {
  const [allTerms, setAllTerms] = useState<Term[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Term[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Load all terms + current post terms
  useEffect(() => {
    Promise.all([
      fetch(`/api/terms/${taxonomy}`).then((r) => r.json()),
      fetch(`/api/posts/${postId}/terms/${taxonomy}`).then((r) => r.json()),
    ]).then(([terms, assignedIds]) => {
      setAllTerms(terms as Term[]);
      setSelected(new Set(assignedIds as number[]));
    }).catch(() => {});
  }, [postId, taxonomy]);

  // Auto-save after selection changes
  const scheduleSave = (next: Set<number>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      fetch(`/api/posts/${postId}/terms/${taxonomy}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termTaxonomyIds: Array.from(next) }),
      }).finally(() => setSaving(false));
    }, 600);
  };

  const toggle = (ttId: number) => {
    const next = new Set(selected);
    if (next.has(ttId)) next.delete(ttId);
    else next.add(ttId);
    setSelected(next);
    scheduleSave(next);
  };

  // Create a new term and auto-select it
  const createTerm = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Check if already exists in allTerms
    const existing = allTerms.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      const next = new Set(selected);
      next.add(existing.termTaxonomyId);
      setSelected(next);
      scheduleSave(next);
      return;
    }

    try {
      const res = await fetch(`/api/terms/${taxonomy}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const term: Term = await res.json();
      setAllTerms((prev) => [...prev, term].sort((a, b) => a.name.localeCompare(b.name)));
      const next = new Set(selected);
      next.add(term.termTaxonomyId);
      setSelected(next);
      scheduleSave(next);
    } catch {}
  };

  const handleAddNew = async () => {
    await createTerm(newName);
    setNewName("");
    setAddingNew(false);
  };

  // Tag input handling (for non-hierarchical)
  const handleTagKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().replace(/,$/, "");
      if (val) {
        await createTerm(val);
        setTagInput("");
        setTagSuggestions([]);
      }
    } else if (e.key === "Backspace" && !tagInput) {
      // Remove last selected tag
      const arr = Array.from(selected);
      if (arr.length > 0) {
        const next = new Set(selected);
        next.delete(arr[arr.length - 1]);
        setSelected(next);
        scheduleSave(next);
      }
    }
  };

  const handleTagInput = (val: string) => {
    setTagInput(val);
    if (val.trim()) {
      const lower = val.toLowerCase();
      setTagSuggestions(
        allTerms.filter((t) => t.name.toLowerCase().includes(lower) && !selected.has(t.termTaxonomyId)).slice(0, 5)
      );
    } else {
      setTagSuggestions([]);
    }
  };

  const selectSuggestion = (term: Term) => {
    const next = new Set(selected);
    next.add(term.termTaxonomyId);
    setSelected(next);
    scheduleSave(next);
    setTagInput("");
    setTagSuggestions([]);
  };

  const removeTag = (ttId: number) => {
    const next = new Set(selected);
    next.delete(ttId);
    setSelected(next);
    scheduleSave(next);
  };

  const selectedTerms = allTerms.filter((t) => selected.has(t.termTaxonomyId));

  // ── Hierarchical (checkbox list) ───────────────────────────────────────────
  if (hierarchical) {
    return (
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #dcdcde", borderRadius: 2, padding: "4px 0", marginBottom: 8 }}>
          {allTerms.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#8c8f94" }}>暂无{label}。</div>
          ) : (
            allTerms.map((term) => (
              <label
                key={term.termTaxonomyId}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: "#1d2327" }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(term.termTaxonomyId)}
                  onChange={() => toggle(term.termTaxonomyId)}
                  style={{ width: 14, height: 14, flexShrink: 0, cursor: "pointer" }}
                />
                {term.name}
              </label>
            ))
          )}
        </div>

        {addingNew ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              ref={newInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddNew(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); } }}
              placeholder={`新${label}名称`}
              autoFocus
              style={{ flex: 1, fontSize: 12, padding: "4px 7px", border: "1px solid #8c8f94", borderRadius: 2, outline: "none" }}
            />
            <button
              onClick={handleAddNew}
              style={{ fontSize: 12, padding: "4px 10px", background: "#2271b1", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer" }}
            >
              添加
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewName(""); }}
              style={{ fontSize: 12, padding: "4px 8px", background: "none", border: "1px solid #dcdcde", borderRadius: 2, cursor: "pointer", color: "#646970" }}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            style={{ fontSize: 12, color: "#2271b1", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "none" }}
          >
            + 新建{label}
          </button>
        )}

        {saving && <div style={{ fontSize: 11, color: "#8c8f94", marginTop: 4 }}>保存中…</div>}
      </div>
    );
  }

  // ── Flat / tag-style (tag input) ───────────────────────────────────────────
  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", position: "relative" }}>
      {/* Selected tags */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 4,
        border: "1px solid #8c8f94", borderRadius: 2,
        padding: "5px 7px", minHeight: 34, cursor: "text", background: "#fff",
      }}
        onClick={() => document.getElementById(`tag-input-${taxonomy}`)?.focus()}
      >
        {selectedTerms.map((term) => (
          <span key={term.termTaxonomyId} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "#f0f0f1", border: "1px solid #dcdcde", borderRadius: 2,
            padding: "1px 5px 1px 7px", fontSize: 12, color: "#1d2327",
          }}>
            {term.name}
            <button
              onClick={(e) => { e.stopPropagation(); removeTag(term.termTaxonomyId); }}
              style={{ background: "none", border: "none", padding: "0 0 0 2px", cursor: "pointer", color: "#8c8f94", fontSize: 13, lineHeight: 1, display: "flex" }}
              title={`移除 ${term.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={`tag-input-${taxonomy}`}
          value={tagInput}
          onChange={(e) => handleTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder={selectedTerms.length === 0 ? `添加${label}…` : ""}
          style={{ border: "none", outline: "none", fontSize: 12, minWidth: 80, flex: 1, padding: "1px 0", background: "transparent" }}
        />
      </div>

      {/* Suggestions dropdown */}
      {tagSuggestions.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0,
          background: "#fff", border: "1px solid #dcdcde", borderTop: "none",
          borderRadius: "0 0 2px 2px", boxShadow: "0 2px 6px rgba(0,0,0,.08)",
        }}>
          {tagSuggestions.map((term) => (
            <button
              key={term.id}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(term); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "none", fontSize: 12, cursor: "pointer", color: "#1d2327" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f6fc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {term.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#8c8f94", marginTop: 5 }}>
        用逗号分隔，或按回车键。
        {saving && <span style={{ marginLeft: 6 }}>保存中…</span>}
      </div>
    </div>
  );
}
