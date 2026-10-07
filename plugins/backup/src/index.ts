import { definePlugin } from "@astropress/core";

/**
 * Backup — 数据库与媒体库备份/恢复
 *
 * 备份为 .apzip（zipSync 生成）：
 *   - manifest.json 元信息
 *   - dump.sql 逻辑转储（恢复主依据，始终生成）
 *   - data/local.db 物理副本（可复制时才包含）
 *   - media/** 媒体库文件（可关闭）
 *
 * 危险操作（恢复）要求管理员登录 + Origin CSRF，
 * 媒体解压做 zip-slip 路径校验。零核心修改。
 */
export default definePlugin({
  name: "Backup",
  version: "0.1.0",
  description: "数据库与媒体库的 ZIP 备份/下载/恢复",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
