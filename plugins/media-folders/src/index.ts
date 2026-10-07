import { definePlugin } from "@astropress/core";

/**
 * Media Folders — 媒体库文件夹管理
 *
 * 功能：
 *   - 自建表 ap_media_folders（id, name, parent_id, created_at）
 *   - 使用 wp_postmeta 存储媒体附件的文件夹关联（_media_folder_id）
 *   - 后台管理页：文件夹树 + 创建/重命名/删除
 *   - 媒体库页面注入文件夹侧边栏 + 批量移动
 *
 * 零核心修改。
 */
export default definePlugin({
  name: "media-folders",
  version: "0.1.0",
  description: "媒体库文件夹管理：创建/重命名/删除文件夹，批量移动媒体文件。零核心修改。",
  register() {},
});
