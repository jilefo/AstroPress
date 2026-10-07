import { definePlugin } from "@astropress/core";

/**
 * Activity Log — 操作审计
 *
 * 功能：
 *   - 后台中间件记录所有对 /api/*、/admin-ext/api/* 的 POST/PUT/PATCH/DELETE 请求：
 *     时间、用户、方法、路径、状态码、IP、UA（绝不记录请求体）
 *   - 自建表 ap_activity_log，CREATE TABLE IF NOT EXISTS 惰性建表
 *   - 单条 INSERT 无 N+1；写失败静默；表超 5 万行按 1/50 概率摊销裁剪最旧 1 万行
 *   - 后台 /admin-ext/activity-log 分页查看（50/页），按用户/路径关键字/状态码过滤，可清空
 *
 * 审计逻辑全部 try/catch 兜底，绝不影响正常请求。零核心修改。
 */
export default definePlugin({
  name: "activity-log",
  version: "0.1.0",
  description:
    "操作审计：记录后台全部 API 写操作（人/时间/路径/状态/IP/UA），支持分页过滤与清空。零核心修改。",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
