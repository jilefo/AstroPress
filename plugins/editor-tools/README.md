# @astropress/plugin-editor-tools

编辑器工具插件：在核心富文本编辑器工具栏注入两个一键按钮（零核心修改，锚定方式与 editor-upload 相同——工具栏容器无 class，按 `.ap-wysiwyg-editor` 的 DOM 位置定位 + 重试兜底）。

## 功能

### 排版（一键自动排版）
对编辑器内容做保守排版整理：
- 折叠/清理开头、连续、结尾的空段落（含 `<p><br></p>`、全空格段）
- 杂散的顶层文本节点包进 `<p>`
- 中英文之间自动加空格（pangu-lite：`中文English` → `中文 English`，数字同）
- CJK 字符后的半角标点转全角：`, . ! ? ; :` → `，。！？；：`（小数与英文语境不受影响）
- 跳过 `code/pre/script/style/svg/textarea` 内部内容

完成后派发 `input` 事件，`window.__editorContent` 即时同步，保存流程无感。

### 互译（中英互译，自动识别方向）
- 自动检测：CJK 字符占比高 → 翻译为英文；否则翻译为中文
- 翻译前 `confirm()` 确认方向并提示内容将被替换
- 按顶层块元素分块（每块 ≤3500 字符）顺序翻译，显示进度（互译 2/5）
- 严格保留 HTML 标签/结构，仅翻译可见文本；URL、代码、占位符不译
- 使用站点 AI 配置（`设置 → AI` 的 provider 与 key，option `astropress_ai_settings`），插件自身不存任何密钥
- AI 未配置时返回清晰中文报错，不做任何修改

支持 provider：anthropic / openai / gemini / mistral / groq / cloudflare-ai（与核心 AI 助手一致）。

## 路由

| 路由 | 说明 |
|---|---|
| `/api/ap-etools/tools.js` | 客户端脚本（no-store，中间件注入 /admin 页面） |
| `/api/ap-etools/translate` | 翻译代理（登录保护 + CSRF 校验，单块 ≤20000 字符） |

## 装配（已接入）

1. `apps/admin/package.json` → `"@astropress/plugin-editor-tools": "workspace:*"`
2. `apps/admin/astro.config.ts` → `editorToolsAdminIntegration()`
3. `apps/admin/src/plugins.ts` → `loadPlugin(editorToolsPlugin)`

## 验证

- typecheck 0 errors
- 浏览器实测：按钮出现、排版后内容完整、互译在未配置 AI 时弹出"AI 未配置"并不改动内容、无控制台错误
