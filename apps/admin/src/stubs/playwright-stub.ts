// Cloudflare 构建期桩模块：playwright 需要本地浏览器子进程，CF Workers 不支持。
// ai-chat 的 API 入口已用 hasChildProcess() 守卫，运行到这里的唯一可能是守卫缺失——
// 给出明确报错而非模块解析失败。
export const chromium = {
  launchPersistentContext(): never {
    throw new Error("playwright 在 Cloudflare Workers 环境不可用（ai-chat 插件仅支持 Node.js 部署）");
  },
  launch(): never {
    throw new Error("playwright 在 Cloudflare Workers 环境不可用（ai-chat 插件仅支持 Node.js 部署）");
  },
};
export default { chromium };
