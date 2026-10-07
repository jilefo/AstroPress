# AstroPress v1.0.2 发布说明

发布日期：2026-10-05
对应线上版本：Cloudflare Workers `ba1c3ffb-f08a-46b8-b62d-d460354f5ddb`
校验和：见 [checksums.txt](checksums.txt)（SHA256）

## 本版概要

v1.0.2 是 v1.0.1 之后的质量修复版，来自对生产站第五轮「每插件每功能真实测试」。
无数据库结构变更，可直接覆盖部署。

## 修复

### 1. 批量删除附件不级联（存储泄漏 + 孤儿数据）

文章/媒体列表批量操作接口 `POST /api/posts/bulk {action:"delete"}` 原先只删除
wp_posts 主表记录：若被删对象是附件，R2/本地媒体文件和 wp_postmeta 元数据全部残留，
长期累积产生存储费用与孤儿数据。

现删除流程为：查出本批 id 中的附件 → 并行删除存储对象（文件缺失容忍）→
删除 wp_postmeta → 删除 wp_posts。普通文章的删除行为不变。
已通过「插入假附件与元数据 → 批量删除 → 双表核对」真实验证，零残留。

### 2. 媒体删除接口英文报错中文化

`DELETE /api/media/{id}` 的 `Unauthorized` / `Invalid ID` / `Not found`
改为中文 JSON 响应（v1.0.1 中文化扫尾时遗漏的文件）。

### 3. 批量操作其余英文提示中文化

`Unknown action` → 「不支持的操作类型」、`No valid IDs` → 「没有有效的文章 id」。

## 质量验证（生产环境真实测试）

- 22 个启用插件「保存设置」真实往返（读取→原值写回→再读取逐字段比对）：22/22 无数据漂移
- 51 个后台/前台页面引用的 154 个 CSS、图片、链接资源 404 扫描：0 个缺失
- 32 个前端 fetch 端点的响应字段契约核对：无缺失字段
- 全插件冒烟 108/108；50 个后台页内联脚本语法检查 0 错误
- 批量删除附件级联链路真实造数验证：wp_posts 与 wp_postmeta 双零残留

## 生产数据维护说明（仅线上，不影响新部署）

本轮同时清理了演示生产站媒体库中 39 条历史测试遗留的孤儿附件记录
（早期 `ap-test-*` 上传测试：数据库有记录、存储中文件已不存在，导致媒体库裂图）。
新安装用户不存在此数据。

## 部署说明

- Node.js 部署：更新源码后 `pnpm install && pnpm build`。
- Cloudflare 部署：`pnpm run build:cf && pnpm exec wrangler deploy`。
- 无数据迁移。

## 已知平台限制（Cloudflare Workers）

以下 6 个插件在 Cloudflare 部署中被平台能力自动屏蔽（页面 404、入口零痕迹），
Node.js 部署下功能完整：static-html、ai-chat、backup、git-sync、file-manager、webdav。
