import { definePlugin } from "@astropress/core";

/**
 * Revisions — 文章版本历史
 *
 * 功能：
 *   - 后台中间件拦截 POST/PUT/PATCH /api/posts/<id>（page/CPT 共用此 API），
 *     next() 前读取当前文章，更新成功（<400）后把「旧版本」快照写入 ap_post_revisions
 *   - 每篇文章保留最近 20 版，插入后自动裁剪
 *   - 后台 /admin-ext/revisions?post=<id> 查看版本列表、只读查看任意版本、一键恢复
 *   - 文章/页面/CPT 编辑页工具区注入「🕘 版本历史」链接（DOM 轮询定位，失败静默）
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "revisions",
  version: "0.1.0",
  description:
    "文章版本历史：保存前自动快照旧版本（每文 20 版封顶），后台可查看与一键恢复，编辑页注入版本历史入口。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
