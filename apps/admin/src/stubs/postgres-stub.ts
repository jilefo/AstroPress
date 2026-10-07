// Cloudflare 构建期桩模块：postgres 驱动在 CF 部署中不使用（数据库走 D1），
// 但 drivers/postgres.ts 的动态导入会让打包器尝试解析 postgres 包。
// 这里用别名顶替，真被调用时给出明确报错而非模块解析失败。
export function drizzle(): never {
  throw new Error("postgres 驱动在 Cloudflare 构建中不可用（请使用 D1 绑定）");
}
export default function postgres(): never {
  throw new Error("postgres 驱动在 Cloudflare 构建中不可用（请使用 D1 绑定）");
}
