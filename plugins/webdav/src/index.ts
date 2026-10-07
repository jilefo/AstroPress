import { definePlugin } from "@astropress/core";

/**
 * WebDAV — 站点专用网盘/备份存储
 *
 * 把仓库根 webdav-storage/ 目录通过 WebDAV 协议暴露在 /webdav/*，
 * 支持 Windows「映射网络驱动器」/ RaiDrive 等客户端挂载。
 *
 * 鉴权：/webdav 不在核心中间件的强制登录范围内，插件自行实现
 * HTTP Basic Auth（站点用户名 + 管理页生成的专用 access token）。
 * 零核心修改。
 */
export default definePlugin({
  name: "WebDAV",
  version: "0.1.0",
  description: "把 webdav-storage/ 通过 WebDAV 协议暴露为站点专用网盘",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
