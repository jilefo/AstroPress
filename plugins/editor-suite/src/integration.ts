import type { AstroIntegration } from "astro";
import EditorUpload from "@astropress/plugin-editor-upload/integration.admin";
import EditorTools from "@astropress/plugin-editor-tools/integration.admin";
import ImageMirror from "@astropress/plugin-image-mirror/integration.admin";
import MediaAv from "@astropress/plugin-media-av/integration.admin";
import WpEditor from "@astropress/plugin-wp-editor/integration.admin";

/**
 * 编辑器增强套件 — 编辑器上传增强 · 排版与中英互译 · 外链图片镜像 · 音视频上传插入 · WordPress风格编辑器。
 * 成员插件保持独立实现（零源文件改动），本套件仅按原全局注册顺序
 * 聚合各自的 Astro 集成，运行时行为与逐个注册完全一致。
 */
export default function suite(): AstroIntegration[] {
  return [EditorUpload(), EditorTools(), ImageMirror(), MediaAv(), WpEditor()];
}
