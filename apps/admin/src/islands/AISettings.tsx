import { useState, useEffect } from "react";

const PROVIDERS = [
  {
    id: "none",
    name: "无（禁用 AI 助手）",
    models: [],
  },
  {
    id: "cloudflare-ai",
    name: "Cloudflare Workers AI（无需 API 密钥）",
    note: "使用 Cloudflare 控制台中的 AI 绑定。请在 Workers & Pages → 你的项目 → 设置 → 绑定 中添加名为 \"AI\" 的 AI 绑定。",
    models: [
      { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B（推荐）" },
      { id: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B（更快）" },
      { id: "@cf/mistral/mistral-7b-instruct-v0.1", label: "Mistral 7B" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    url: "https://console.anthropic.com",
    models: [
      { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
      { id: "claude-opus-4-6", label: "claude-opus-4-6" },
      { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    url: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4-turbo", label: "gpt-4-turbo" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    url: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-flash-latest", label: "gemini-flash-latest" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    url: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-large-latest", label: "mistral-large-latest" },
      { id: "mistral-small-latest", label: "mistral-small-latest" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    url: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile" },
      { id: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" },
    ],
  },
  {
    id: "custom",
    name: "自定义 OpenAI 兼容端点（DeepSeek / 智谱 / 通义 / 豆包 / Ollama）",
    models: [],
  },
] as const;

type ProviderId = typeof PROVIDERS[number]["id"];

export default function AISettings() {
  const [activeProvider, setActiveProvider] = useState<ProviderId>("none");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [savedProviders, setSavedProviders] = useState<Record<string, any>>({});
  const [systemContext, setSystemContext] = useState("");
  const [confirmBeforeAction, setConfirmBeforeAction] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    fetch("/api/ai/settings")
      .then((r) => r.json() as any)
      .then((data) => {
        const provider = data.activeProvider ?? "none";
        setActiveProvider(provider as ProviderId);
        const cfg = data.providers?.[provider];
        if (cfg) {
          setModel(cfg.defaultModel ?? "");
          setBaseUrl(cfg.baseUrl ?? "");
          if (cfg._hasKey || cfg.apiKey) {
            setHasStoredKey(true);
            setApiKey("••••••••••••••••");
          }
        }
        setSavedProviders(data.providers ?? {});
        setSystemContext(data.systemContext ?? "");
        setConfirmBeforeAction(data.confirmBeforeAction !== false); // default true
      })
      .catch(() => {});
  }, []);

  const selectedProvider = PROVIDERS.find((p) => p.id === activeProvider);
  const needsKey = activeProvider !== "none" && activeProvider !== "cloudflare-ai";
  const isCloudflareAI = activeProvider === "cloudflare-ai";
  const isCustom = activeProvider === "custom";

  const handleProviderChange = (id: ProviderId) => {
    setActiveProvider(id);
    setApiKey("");
    setHasStoredKey(false);
    setEditingKey(false);
    setTestStatus("idle");
    setTestMessage("");
    const p = PROVIDERS.find((x) => x.id === id);
    const saved = savedProviders[id];
    setModel((p as any)?.models?.[0]?.id ?? saved?.defaultModel ?? "");
    setBaseUrl(saved?.baseUrl ?? "");
  };

  const handleChangeKey = () => {
    setApiKey("");
    setEditingKey(true);
    setShowKey(true);
  };

  const save = async () => {
    setStatus("saving");
    try {
      const isMasked = /^•+$/.test(apiKey);
      const providerConfig = activeProvider === "none" ? {} : {
        [activeProvider]: activeProvider === "cloudflare-ai"
          ? { enabled: true, defaultModel: model }
          : activeProvider === "custom"
            ? { enabled: true, defaultModel: model, baseUrl: baseUrl.trim(), apiKey: isMasked ? undefined : apiKey }
            : { enabled: true, defaultModel: model, apiKey: isMasked ? undefined : apiKey },
      };
      const body = {
        activeProvider,
        systemContext,
        confirmBeforeAction,
        providers: providerConfig,
      };
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setStatus("saved");
      setEditingKey(false);
      setShowKey(false);
      if (!isMasked && apiKey) {
        setHasStoredKey(true);
        setApiKey("••••••••••••••••");
      }
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const testConnection = async () => {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const isMasked = /^•+$/.test(apiKey);
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: activeProvider,
          model,
          baseUrl: isCustom ? baseUrl.trim() : undefined,
          // Send actual key if user typed one; omit if masked (server uses saved key instead)
          apiKey: isMasked ? undefined : (apiKey || undefined),
        }),
      });
      const data = await res.json() as any;
      if (res.ok && data.reply) {
        setTestStatus("ok");
        setTestMessage("连接成功。");
      } else {
        setTestStatus("fail");
        setTestMessage(data.error ?? "连接失败。");
      }
    } catch (e: any) {
      setTestStatus("fail");
      setTestMessage(e.message ?? "连接失败。");
    }
  };

  return (
    <div style={{ maxWidth: 540, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{
        background: "#fff", border: "1px solid #c3c4c7",
        borderRadius: 3, padding: "24px 28px", marginBottom: 20,
      }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#1d2327" }}>
          AI 服务商
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#646970", lineHeight: 1.5 }}>
          请为助手选择 AI 服务商。API 密钥保存在你的数据库中，绝不会暴露给浏览器。
        </p>

        {/* Provider radio list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {PROVIDERS.map((p) => (
            <label key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", fontSize: 13, color: "#1d2327",
            }}>
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={activeProvider === p.id}
                onChange={() => handleProviderChange(p.id as ProviderId)}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#2271b1" }}
              />
              {p.name}
              {"url" in p && activeProvider === p.id && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "#2271b1", textDecoration: "none", marginLeft: 4 }}
                >
                  获取 API 密钥 ↗
                </a>
              )}
            </label>
          ))}
        </div>

        {/* Workers AI info note */}
        {isCloudflareAI && (
          <div style={{ borderTop: "1px solid #f0f0f1", paddingTop: 20 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#646970", lineHeight: 1.6 }}>
              {(selectedProvider as any)?.note}
            </p>
            {selectedProvider && "models" in selectedProvider && selectedProvider.models.length > 0 && (
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1d2327" }}>
                  模型
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{
                    width: "100%", height: 34, padding: "0 8px",
                    border: "1px solid #8c8f94", borderRadius: 3,
                    fontSize: 13, fontFamily: "inherit", background: "#fff",
                    outline: "none",
                  }}
                >
                  {selectedProvider.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={testConnection}
              disabled={testStatus === "testing"}
              style={{
                marginTop: 14, height: 34, padding: "0 14px",
                background: "#fff", border: "1px solid #dcdcde",
                borderRadius: 3, fontSize: 12, color: "#3c434a",
                cursor: testStatus === "testing" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {testStatus === "testing" ? "测试中…" : "测试连接"}
            </button>
            {testMessage && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: testStatus === "ok" ? "#00a32a" : "#d63638" }}>
                {testMessage}
              </p>
            )}
          </div>
        )}

        {/* Model + API key — shown only when a provider is selected */}
        {needsKey && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid #f0f0f1", paddingTop: 20 }}>
            {/* Custom endpoint: Base URL + free-form model */}
            {isCustom && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1d2327" }}>
                    API 地址（Base URL）
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com"
                    style={{
                      width: "100%", height: 34, padding: "0 8px",
                      border: "1px solid #8c8f94", borderRadius: 3,
                      fontSize: 13, fontFamily: "inherit",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#8c8f94", lineHeight: 1.6 }}>
                    填 OpenAI 兼容端点根地址，无需加 /chat/completions：
                    DeepSeek https://api.deepseek.com ・ 智谱 https://open.bigmodel.cn/api/paas/v4 ・
                    通义 https://dashscope.aliyuncs.com/compatible-mode/v1 ・
                    豆包 https://ark.cn-beijing.volces.com/api/v3 ・ 本地 Ollama http://localhost:11434/v1
                  </p>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1d2327" }}>
                    模型名称
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="例如 deepseek-chat / glm-4-flash / qwen-plus / doubao-pro-32k"
                    style={{
                      width: "100%", height: 34, padding: "0 8px",
                      border: "1px solid #8c8f94", borderRadius: 3,
                      fontSize: 13, fontFamily: "inherit",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              </>
            )}
            {/* Model */}
            {!isCustom && selectedProvider && "models" in selectedProvider && selectedProvider.models.length > 1 && (
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1d2327" }}>
                  模型
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{
                    width: "100%", height: 34, padding: "0 8px",
                    border: "1px solid #8c8f94", borderRadius: 3,
                    fontSize: 13, fontFamily: "inherit", background: "#fff",
                    outline: "none",
                  }}
                >
                  {selectedProvider.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
            {selectedProvider && "models" in selectedProvider && selectedProvider.models.length === 1 && (
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1d2327" }}>
                  模型
                </label>
                <input
                  type="text"
                  value={selectedProvider.models[0].id}
                  readOnly
                  style={{
                    width: "100%", height: 34, padding: "0 8px",
                    border: "1px solid #dcdcde", borderRadius: 3,
                    fontSize: 13, fontFamily: "inherit", background: "#f6f7f7",
                    color: "#646970", boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>
            )}

            {/* API Key */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#1d2327" }}>
                API Key
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type={showKey && !hasStoredKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setEditingKey(true); }}
                  placeholder="粘贴你的 API 密钥"
                  disabled={hasStoredKey && !editingKey}
                  style={{
                    flex: 1, height: 34, padding: "0 8px",
                    border: "1px solid #8c8f94", borderRadius: 3,
                    fontSize: 13, fontFamily: "inherit",
                    background: hasStoredKey && !editingKey ? "#f6f7f7" : "#fff",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                {hasStoredKey && !editingKey ? (
                  <button
                    onClick={handleChangeKey}
                    style={{
                      height: 34, padding: "0 12px",
                      background: "#fff", border: "1px solid #dcdcde",
                      borderRadius: 3, fontSize: 12, color: "#2271b1",
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                    }}
                  >
                    修改
                  </button>
                ) : (
                  <button
                    onClick={() => setShowKey((s) => !s)}
                    style={{
                      height: 34, padding: "0 12px",
                      background: "#fff", border: "1px solid #dcdcde",
                      borderRadius: 3, fontSize: 12, color: "#3c434a",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                )}
                <button
                  onClick={testConnection}
                  disabled={testStatus === "testing"}
                  style={{
                    height: 34, padding: "0 12px",
                    background: "#fff", border: "1px solid #dcdcde",
                    borderRadius: 3, fontSize: 12, color: "#3c434a",
                    cursor: testStatus === "testing" ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {testStatus === "testing" ? "测试中…" : "测试连接"}
                </button>
              </div>
              {testMessage && (
                <p style={{
                  margin: "6px 0 0", fontSize: 12,
                  color: testStatus === "ok" ? "#00a32a" : "#d63638",
                }}>
                  {testMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* System Context */}
      <div style={{
        background: "#fff", border: "1px solid #c3c4c7",
        borderRadius: 3, padding: "24px 28px", marginBottom: 20,
      }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#1d2327" }}>
          AI 上下文与指令
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#646970", lineHeight: 1.6 }}>
          你在这里填写的所有内容都会前置到本站的每次 AI 操作中——包括内容生成、聊天、区块生成等。可用它设定 AI 的角色人设、提供公司信息、定义品牌语气，并列出注意事项。
        </p>
        <textarea
          value={systemContext}
          onChange={e => setSystemContext(e.target.value)}
          rows={10}
          placeholder={`可包含的内容示例：\n\n• 公司名称、标语和所属行业\n• 目标受众与语气语调\n• 应做：始终使用包容性语言、注明来源、使用公制单位\n• 不应做：不提竞争对手、避免行话、不作价格承诺\n• 品牌关键词与偏好术语\n• 需要包含的法律或合规声明`}
          style={{
            width: "100%", padding: "10px 12px",
            border: "1px solid #8c8f94", borderRadius: 3,
            fontSize: 13, fontFamily: "inherit", lineHeight: 1.6,
            resize: "vertical", outline: "none", boxSizing: "border-box",
            color: "#1d2327",
          }}
        />
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#8c8f94" }}>
          这些上下文绝不会展示给站点访客，而是在每次请求时发送给 AI 服务商。
        </p>
      </div>

      {/* Behaviour */}
      <div style={{
        background: "#fff", border: "1px solid #c3c4c7",
        borderRadius: 3, padding: "24px 28px", marginBottom: 20,
      }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#1d2327" }}>
          行为
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#646970", lineHeight: 1.5 }}>
          控制 AI 助手如何处理会修改你站点的操作。
        </p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
          <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
            <input
              type="checkbox"
              checked={confirmBeforeAction}
              onChange={e => setConfirmBeforeAction(e.target.checked)}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            <div
              onClick={() => setConfirmBeforeAction(v => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                background: confirmBeforeAction ? "#2271b1" : "#c3c4c7",
                transition: "background .15s",
                position: "relative",
              }}
            >
              <div style={{
                position: "absolute", top: 2, borderRadius: "50%",
                width: 16, height: 16, background: "#fff",
                left: confirmBeforeAction ? 18 : 2,
                transition: "left .15s",
                boxShadow: "0 1px 3px rgba(0,0,0,.25)",
              }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1d2327", lineHeight: 1.4 }}>
              执行更改前先请求确认
            </div>
            <div style={{ fontSize: 12, color: "#646970", marginTop: 3, lineHeight: 1.5 }}>
              开启时（默认），AI 会先展示执行计划，在得到你的批准后才执行任何创建、更新或删除操作。关闭后 AI 将立即执行。
            </div>
          </div>
        </label>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={save}
          disabled={status === "saving"}
          style={{
            height: 34, padding: "0 18px",
            background: "#2271b1", color: "#fff",
            border: "1px solid #135e96", borderRadius: 3,
            fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            opacity: status === "saving" ? 0.7 : 1,
          }}
        >
          {status === "saving" ? "保存中…" : "保存设置"}
        </button>
        {status === "saved" && (
          <span style={{ fontSize: 13, color: "#00a32a", fontWeight: 600 }}>已保存。</span>
        )}
        {status === "error" && (
          <span style={{ fontSize: 13, color: "#d63638" }}>保存失败，请重试。</span>
        )}
      </div>
    </div>
  );
}
