import React, { useState, useEffect, useCallback } from "react";

interface Props {
  postId: number;
}

interface SeoMeta {
  _yoast_wpseo_title: string;
  _yoast_wpseo_metadesc: string;
  _yoast_wpseo_focuskw: string;
}

const FIELD_LABELS: Record<keyof SeoMeta, string> = {
  _yoast_wpseo_title: "SEO 标题",
  _yoast_wpseo_metadesc: "Meta 描述",
  _yoast_wpseo_focuskw: "核心关键词",
};

const FIELD_HINTS: Record<keyof SeoMeta, string> = {
  _yoast_wpseo_title: "覆盖搜索结果中显示的页面标题，约 60 字符。",
  _yoast_wpseo_metadesc: "搜索结果中显示的简短摘要，约 155 字符。",
  _yoast_wpseo_focuskw: "本文内容主要针对的关键词或短语。",
};

function charCount(val: string, limit: number) {
  const len = val.length;
  const color = len === 0 ? "#a7aaad" : len <= limit ? "#146c43" : "#d63638";
  return (
    <span style={{ fontSize: 10, color, float: "right" }}>
      {len}/{limit}
    </span>
  );
}

export default function SeoPanel({ postId }: Props) {
  const [meta, setMeta] = useState<SeoMeta>({
    _yoast_wpseo_title: "",
    _yoast_wpseo_metadesc: "",
    _yoast_wpseo_focuskw: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/posts/${postId}/meta`)
      .then((r) => r.json())
      .then((data) => {
        const d = data as Record<string, string>;
        setMeta({
          _yoast_wpseo_title: d._yoast_wpseo_title ?? "",
          _yoast_wpseo_metadesc: d._yoast_wpseo_metadesc ?? "",
          _yoast_wpseo_focuskw: d._yoast_wpseo_focuskw ?? "",
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [postId]);

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const res = await fetch(`/api/posts/${postId}/meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  }, [postId, meta]);

  if (!loaded) {
    return (
      <div style={{ padding: 14, fontSize: 12, color: "#646970" }}>加载中…</div>
    );
  }

  return (
    <div>
      {(["_yoast_wpseo_title", "_yoast_wpseo_metadesc", "_yoast_wpseo_focuskw"] as (keyof SeoMeta)[]).map((key) => {
        const isTextarea = key === "_yoast_wpseo_metadesc";
        const limit = key === "_yoast_wpseo_title" ? 60 : key === "_yoast_wpseo_metadesc" ? 155 : 50;

        return (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
              {FIELD_LABELS[key]}
              {charCount(meta[key], limit)}
            </label>
            {isTextarea ? (
              <textarea
                value={meta[key]}
                rows={3}
                onChange={(e) => setMeta((prev) => ({ ...prev, [key]: e.target.value }))}
                style={{
                  width: "100%", fontSize: 12, padding: "6px 8px",
                  border: "1px solid #dcdcde", borderRadius: 3, resize: "vertical",
                  outline: "none", fontFamily: "inherit",
                }}
              />
            ) : (
              <input
                type="text"
                value={meta[key]}
                onChange={(e) => setMeta((prev) => ({ ...prev, [key]: e.target.value }))}
                style={{
                  width: "100%", fontSize: 12, padding: "6px 8px",
                  border: "1px solid #dcdcde", borderRadius: 3, outline: "none",
                }}
              />
            )}
            <p style={{ fontSize: 10, color: "#646970", margin: "3px 0 0" }}>
              {FIELD_HINTS[key]}
            </p>
          </div>
        );
      })}

      <button
        onClick={save}
        disabled={status === "saving"}
        style={{
          width: "100%", padding: "7px", fontSize: 12, fontWeight: 600,
          background: status === "saved" ? "#146c43" : status === "error" ? "#d63638" : "#2271b1",
          color: "#fff", border: "none", borderRadius: 3, cursor: "pointer",
          transition: "background 0.2s",
        }}
      >
        {status === "saving" ? "保存中…" : status === "saved" ? "已保存 ✓" : status === "error" ? "保存失败，点击重试" : "保存 SEO 设置"}
      </button>
    </div>
  );
}
