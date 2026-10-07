import React, { useState, useEffect, useCallback } from "react";

interface Props {
  postId: number;
}

interface MlLanguage {
  code: string;
  locale: string;
  nativeLabel: string;
  enabled: boolean;
}

interface MlSettings {
  defaultLang: string;
  urlStrategy: "prefix" | "param";
  languages: MlLanguage[];
}

interface TranslationLink {
  postId: number;
  lang: string;
  title: string;
  editUrl: string;
}

interface MlGroup {
  groupId: string;
  baseId: number;
  translations: TranslationLink[];
}

export default function MultilingualPanel({ postId }: Props) {
  const [settings, setSettings] = useState<MlSettings | null>(null);
  const [group, setGroup] = useState<MlGroup | null>(null);
  const [currentLang, setCurrentLang] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loaded, setLoaded] = useState(false);

  // Load settings and group data
  useEffect(() => {
    Promise.all([
      fetch("/admin-ext/api/ml/settings").then((r) => r.json()),
      fetch(`/admin-ext/api/ml/links?postId=${postId}`).then((r) => r.json()),
    ])
      .then(([s, g]) => {
        setSettings(s as MlSettings);
        const grp = (g as { group: MlGroup | null }).group;
        setGroup(grp);
        // Determine current post's language
        if (grp?.translations) {
          const self = grp.translations.find((t) => t.postId === postId);
          if (self) setCurrentLang(self.lang);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [postId]);

  // Save language for this post
  const saveLang = useCallback(async () => {
    if (!currentLang) return;
    setStatus("saving");
    try {
      // If this post is the base of a group, update its _ml_lang
      // If not in a group yet, we create a solo entry
      const res = await fetch("/admin-ext/api/ml/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link",
          baseId: group?.baseId ?? postId,
          lang: currentLang,
          targetId: postId,
        }),
      });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) {
        // Refresh group data
        const g = await fetch(`/admin-ext/api/ml/links?postId=${postId}`).then((r) => r.json());
        setGroup((g as { group: MlGroup | null }).group);
        setTimeout(() => setStatus("idle"), 2500);
      }
    } catch {
      setStatus("error");
    }
  }, [postId, currentLang, group]);

  // Unlink a translation
  const unlinkTranslation = useCallback(
    async (targetId: number) => {
      try {
        const res = await fetch("/admin-ext/api/ml/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unlink", targetId }),
        });
        if (res.ok) {
          const g = await fetch(`/admin-ext/api/ml/links?postId=${postId}`).then((r) => r.json());
          setGroup((g as { group: MlGroup | null }).group);
        }
      } catch {
        /* best-effort */
      }
    },
    [postId],
  );

  if (!loaded) {
    return <div style={{ padding: 14, fontSize: 12, color: "#646970" }}>加载中…</div>;
  }

  if (!settings) {
    return (
      <div style={{ padding: 14, fontSize: 12, color: "#646970" }}>
        多语言插件尚未配置。
        <br />
        <a href="/admin-ext/multilingual" style={{ color: "#2271b1" }}>
          配置语言 →
        </a>
      </div>
    );
  }

  const enabledLangs = settings.languages.filter((l) => l.enabled);
  const other译文 = group?.translations?.filter((t) => t.postId !== postId) ?? [];

  return (
    <div>
      {/* Language selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
          文章语言
        </label>
        <select
          value={currentLang}
          onChange={(e) => setCurrentLang(e.target.value)}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "6px 8px",
            border: "1px solid #dcdcde",
            borderRadius: 3,
            outline: "none",
          }}
        >
          <option value="">— 请选择 —</option>
          {enabledLangs.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel} ({l.code})
            </option>
          ))}
        </select>
        <p style={{ fontSize: 10, color: "#646970", margin: "3px 0 0" }}>
          设置本文的语言，用于 hreflang 和译文分组。
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={saveLang}
        disabled={status === "saving" || !currentLang}
        style={{
          width: "100%",
          padding: 7,
          fontSize: 12,
          fontWeight: 600,
          background: status === "saved" ? "#146c43" : status === "error" ? "#d63638" : "#2271b1",
          color: "#fff",
          border: "none",
          borderRadius: 3,
          cursor: currentLang ? "pointer" : "not-allowed",
          opacity: currentLang ? 1 : 0.5,
          transition: "background 0.2s",
        }}
      >
        {status === "saving" ? "保存中…" : status === "saved" ? "已保存 ✓" : status === "error" ? "保存失败，点击重试" : "设置语言"}
      </button>

      {/* Linked translations */}
      {other译文.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #f0f0f1" }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
            译文
          </label>
          {other译文.map((t) => {
            const langInfo = enabledLangs.find((l) => l.code === t.lang);
            return (
              <div
                key={t.postId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  fontSize: 12,
                }}
              >
                <span>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#f6f7f7",
                      border: "1px solid #dcdcde",
                      borderRadius: 2,
                      padding: "0 5px",
                      marginRight: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {t.lang}
                  </span>
                  <a href={t.editUrl} style={{ color: "#2271b1", textDecoration: "none" }}>
                    {langInfo?.nativeLabel ?? t.lang}
                  </a>
                </span>
                <button
                  onClick={() => unlinkTranslation(t.postId)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#d63638",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: "0 2px",
                  }}
                  title="取消翻译关联"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Link to manage */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #f0f0f1" }}>
        <a
          href={`/admin-ext/multilingual`}
          style={{ fontSize: 11, color: "#2271b1", textDecoration: "none" }}
        >
          管理译文 →
        </a>
      </div>
    </div>
  );
}