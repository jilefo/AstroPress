import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function fileManagerIntegration(): AstroIntegration {
  return {
    name: "astropress-file-manager",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 文件管理器页面
        injectRoute({
          pattern: "/admin-ext/files",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });
        // 目录列表
        injectRoute({
          pattern: "/admin-ext/api/files/list",
          entrypoint: p("admin", "api", "list.ts"),
          prerender: false,
        });
        // 下载（GET，走登录态 Cookie）
        injectRoute({
          pattern: "/admin-ext/api/files/download",
          entrypoint: p("admin", "api", "download.ts"),
          prerender: false,
        });
        // 读取文本文件（在线查看/编辑）
        injectRoute({
          pattern: "/admin-ext/api/files/read",
          entrypoint: p("admin", "api", "read.ts"),
          prerender: false,
        });
        // 保存文本文件（在线编辑）
        injectRoute({
          pattern: "/admin-ext/api/files/write",
          entrypoint: p("admin", "api", "write.ts"),
          prerender: false,
        });
        // 目录树（复制/移动选择器）
        injectRoute({
          pattern: "/admin-ext/api/files/dirs",
          entrypoint: p("admin", "api", "dirs.ts"),
          prerender: false,
        });
        // 复制 / 移动
        injectRoute({
          pattern: "/admin-ext/api/files/copy",
          entrypoint: p("admin", "api", "copy.ts"),
          prerender: false,
        });
        injectRoute({
          pattern: "/admin-ext/api/files/move",
          entrypoint: p("admin", "api", "move.ts"),
          prerender: false,
        });
        // 新建文件夹
        injectRoute({
          pattern: "/admin-ext/api/files/mkdir",
          entrypoint: p("admin", "api", "mkdir.ts"),
          prerender: false,
        });
        // 上传（multipart）
        injectRoute({
          pattern: "/admin-ext/api/files/upload",
          entrypoint: p("admin", "api", "upload.ts"),
          prerender: false,
        });
        // 重命名
        injectRoute({
          pattern: "/admin-ext/api/files/rename",
          entrypoint: p("admin", "api", "rename.ts"),
          prerender: false,
        });
        // 删除
        injectRoute({
          pattern: "/admin-ext/api/files/delete",
          entrypoint: p("admin", "api", "delete.ts"),
          prerender: false,
        });
        // 打包 ZIP
        injectRoute({
          pattern: "/admin-ext/api/files/zip",
          entrypoint: p("admin", "api", "zip.ts"),
          prerender: false,
        });
        // 解压 ZIP
        injectRoute({
          pattern: "/admin-ext/api/files/unzip",
          entrypoint: p("admin", "api", "unzip.ts"),
          prerender: false,
        });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
