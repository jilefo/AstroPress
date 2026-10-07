---
name: theme-data-resync
description: AstroPress 线上主题模板/槽位数据损坏时的干净重导入流程，含按主题ID精确快照恢复与全量矩阵验证。用户反馈主题切换不生效、前台显示其他主题（如AIYA显示MengD）、主题模板缺失时使用。
---

# AstroPress 主题数据干净重导入（Resync）

适用于：线上（Cloudflare Workers + D1）主题元数据与模板/块数据不一致，表现为激活某主题后前台仍渲染旧主题、槽位指向错误模板、大量主题无模板。

## 不可违背的约束

- `apps/**`、`packages/core/**` 零改动；只允许改 `plugins/**`。
- 先取数据库事实，再动代码或数据。禁止凭页面猜测根因。
- 所有 Python 一律写成 `logs/` 下独立 `.py` 文件运行（PowerShell 内联 Python 必错）。
- 环境路径前置：`$env:Path = "D:\DevTools\node;D:\DevTools\Git\cmd;$env:Path"`。

## 数据模型（wp_options 键值）

| option_name | 内容 |
|---|---|
| `astropress_themes` | 主题元数据数组 `[{id,name,tokens,...}]` |
| `astropress_active_theme` | 当前主题 id |
| `astropress_theme_config` | 当前主题 tokens JSON |
| `astropress_theme_templates` | 模板数组 `[{id,name,type,conditions,schemaSlug}]` |
| `astropress_template_slots` | 全局 `{type: schemaSlug}` |
| `astropress_page_schema_{slug}` | 每模板/页面块；模板 slug 为 `__xxx__` 双下划线包裹 |
| `astropress_theme_css_{id}` | 每主题自定义 CSS |
| `astropress_slots_map` | theme-slot-sync 插件的 `{themeId:{type:slug}}` 精确快照 |

## 诊断（按序查 D1）

1. `SELECT option_value ... WHERE option_name='astropress_active_theme'` → 确认激活 id，再到 themes 列表确认它对应的主题名。
2. 查 `astropress_template_slots` 中 header/footer 的 schemaSlug，再反查模板名：
   `wrangler d1 execute astropress --remote --command="SELECT json_extract(j.value,'$.name') FROM wp_options, json_each(option_value) j WHERE option_name='astropress_theme_templates' AND json_extract(j.value,'$.schemaSlug')='__xxx__'"`
   （注意：subprocess 调 wrangler 用 `shell=True` 字符串命令；`--file` 多语句不显示结果行，要看结果用 `--command` 单条。）
3. 统计每主题模板匹配数；典型损坏时多个主题匹配 0 模板。
4. 检查 marker `astropress_slots_synced_theme`：等于 active 会让旧插件误判「已同步」。

## 重导入流程

1. **备份**：导出全部 option_name+长度，及 themes/theme_templates/template_slots/active_theme/theme_config 等关键值到 `logs/online_backup/`。
2. **安全确认**：统计 `astropress_page_schema_*`，仅当全部为 `__` 前缀模板（无真实页面 schema）才可整体删除。
3. **清理 SQL**：删除全局槽位/模板/激活/配置/marker/slots_map + `astropress_theme_css_%` + `astropress_page_schema_%`。
4. **重置 Base**：`astropress_themes` 写回仅含 Base Theme（id `base-theme`），INSERT active_theme/theme_config（行已被删）。
5. **逐包重导入**：POST `/api/themes/import`（登录 cookie，JSON），包来自 `wp-themes/*-theme/`：6 模板（404/archive/footer/header/search/single-post）+ pages 含 home blocks + theme.css，`createPages=false`。
   - 登录：POST `/api/auth/login` 用 `application/x-www-form-urlencoded`，UA 含 Mozilla，成功 302 到 /admin/dashboard。
   - 响应必须含 `ok` 与 `themeId`；失败记录后继续。
6. theme-slot-sync 中间件（`plugins/theme-slot-sync/src/middleware.ts`）负责：导入响应后按 `themeId` 快照全局槽位到 `astropress_slots_map`；激活（POST `/api/themes/{id}`，正则 `^/api/themes/([^/]+)/?$`，排除 import/store/upload/slots 等非 ID 段）时优先按 id 精确恢复，无快照才退名称匹配。

## 验证矩阵（逐主题，勿省）

对每个主题：激活 → GET `/blog/ad-render-test` → 检查：

1. **层叠最终主色**：页面有多个 `:root`（首个是基础 themeStyles 的 #2271b1），必须取 `re.findall(r"--color-primary:\s*([^;]+);", html)[-1]`，与该主题 tokens 的 colors.primary 一致。
2. header/footer 块签名（去 script/style 后归一化空白）：重点确认用户关注的两主题（如 AIYA vs MengD）签名不同。
3. Gitalk 等文章页插件注入标记。
4. 统计 header/footer 唯一签名数；同源主题（Argon 系等）共享签名属正常。
5. 测后把 active 恢复为用户指定主题（默认 AIYA-CMS），再清缓存。

参考实现（可直接改名复用）：`logs/{backup_online,reimport_online,theme_matrix,prove_switch,diag_switch}.py`，结果存 `logs/aa8_results/*.json`。

## 完成定义

- 全部主题主色 N/N 一致；目标两主题 header/footer 签名不同。
- 浏览器截图佐证 header 品牌文字为目标主题。
- 更新 CHANGELOG.md 与当轮报告（logs/*.md），README 部署节同步绑定说明。
