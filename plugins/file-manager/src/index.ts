import { definePlugin } from "@astropress/core";

/**
 * File Manager — 网站文件管理器
 *
 * 仿 Windows 资源管理器管理站点根目录（仓库根）文件：
 * 浏览 / 进入目录 / 下载 / 删除 / 打包 zip / 解压 zip / 上传 / 新建文件夹 / 重命名。
 *
 * 安全边界：
 *   - 所有 API 要求管理员登录，写操作要求 Origin 同源；
 *   - 路径解析强制限制在仓库根内（防穿越）；
 *   - .git / node_modules / .astro 为受保护目录，任何写操作拒绝；
 *   - zip 打包限 256MB，上传单文件限 64MB，解压做 zip-slip 校验。
 */
export default definePlugin({
  name: "File Manager",
  version: "0.1.0",
  description: "网站文件管理器：浏览/上传/下载/重命名/删除/打包/解压站点文件",
  register() {
    // 所有逻辑在 Astro 集成中
  },
});
