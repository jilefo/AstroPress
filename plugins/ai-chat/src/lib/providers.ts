/**
 * Provider registry — each entry describes how to automate one AI chat website.
 * 所有选择器均为 CSS / Playwright 兼容选择器。
 */
export interface ChatProvider {
  id: string;
  name: string;
  /** 聊天主页（登录后落点） */
  url: string;
  /** 登录页 */
  loginUrl: string;
  /** 出现在 URL 中即判定「正在登录页/未登录」的标记片段 */
  loginMarkers: string[];
  /** 主聊天输入框 */
  inputSelector: string;
  /** 发送按钮 */
  sendButtonSelector: string;
  /** 最新一条助手回复容器 */
  replySelector: string;
  /** 存在即视为已登录的选择器（收紧为聊天输入类元素，避免误匹配登录页 class） */
  loggedInSelector: string;
  /**
   * 可选：LocalStorage 鉴权判定 JS 语句体（服务端静态配置）。
   * 运行时可访问 ls（= window.localStorage），return true 即已登录。
   * 用于把登录态放在存储而非 Cookie 的 SPA（如元宝 LOCAL_AUTH_INFO_KEY）。
   */
  storageCheck?: string;
  /** 页面加载后额外等待 ms */
  settleMs?: number;
}

export const PROVIDERS: ChatProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/",
    loginUrl: "https://chat.deepseek.com/sign_in",
    loginMarkers: ["sign_in", "/login"],
    inputSelector: "textarea[placeholder*='DeepSeek'], textarea[placeholder*='发送消息'], #chat-input",
    sendButtonSelector: "div[role='button']:has-text('发送'), button:has-text('发送'), div.ds-button:has(svg)",
    replySelector: ".ds-markdown, .message-content, [class*='markdown'], [class*='message']",
    loggedInSelector: "textarea, [contenteditable='true']",
    settleMs: 3000,
  },
  {
    id: "yuanbao",
    name: "元宝",
    url: "https://yuanbao.tencent.com/",
    loginUrl: "https://yuanbao.tencent.com/login",
    loginMarkers: ["/login", "/auth"],
    inputSelector: "textarea[placeholder*='输入'], textarea, [contenteditable='true']",
    sendButtonSelector: "button[type='submit'], button:has-text('发送'), [class*='send']",
    replySelector: "[class*='message'], [class*='content'], [class*='bubble']",
    loggedInSelector: "textarea, [contenteditable='true']",
    // 元宝登录态保存在 LocalStorage 的 LOCAL_AUTH_INFO_KEY*（JSON blob），
    // 而非鉴权 Cookie；auth=true && status=2 && userId 才是已登录。
    storageCheck:
      "for (var i = 0; i < ls.length; i++) { var k = ls.key(i) || ''; " +
      "if (k.indexOf('LOCAL_AUTH_INFO_KEY') === 0) { " +
      "try { var v = JSON.parse(ls.getItem(k) || '{}'); " +
      "if (v && v.auth === true && v.status === 2 && v.userId) return true; } catch (e) {} } } return false;",
    settleMs: 4000,
  },
  {
    id: "qwen",
    name: "通义千问",
    url: "https://www.tongyi.com/",
    loginUrl: "https://login.tongyi.com/",
    loginMarkers: ["login.", "passport", "auth"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button:has-text('发送'), [class*='send'], [class*='submit']",
    replySelector: "[class*='message'], [class*='content'], [class*='bubble']",
    loggedInSelector: "textarea, [contenteditable='true']",
    settleMs: 4000,
  },
  {
    id: "doubao",
    name: "豆包",
    url: "https://www.doubao.com/",
    loginUrl: "https://www.doubao.com/",
    loginMarkers: ["login", "passport", "auth"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button:has-text('发送'), [class*='send'], [class*='submit']",
    replySelector: "[class*='message'], [class*='content'], [class*='bubble']",
    loggedInSelector: "textarea, [contenteditable='true']",
    settleMs: 4000,
  },
  {
    id: "zhipu",
    name: "智谱清言",
    url: "https://chatglm.cn/",
    loginUrl: "https://chatglm.cn/userAuth/login",
    loginMarkers: ["userAuth", "login", "passport"],
    inputSelector: "textarea, [contenteditable='true']",
    sendButtonSelector: "button:has-text('发送'), [class*='send'], [class*='submit']",
    replySelector: "[class*='message'], [class*='content'], [class*='bubble']",
    loggedInSelector: "textarea, [contenteditable='true']",
    settleMs: 4000,
  },
];

export function getProvider(id: string): ChatProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
