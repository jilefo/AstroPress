# @astropress/plugin-ads-manager

广告管理插件（零核心修改）。完整设计见 `docs/plugins/02-ads-manager.md`。

## 架构

- **广告 = CPT `ap_ad`**：`post_content` 存广告代码（经典编辑器），`post_status`（publish/draft）即启用/停用；配置字段组经 `install.ts` 幂等写入 `wp_options.astropress_field_groups`（CustomFieldsPanel 的数据源 `GET /api/custom-fields` 直读该 option — 已核实），CPT 写入 `astropress_custom_post_types` → 后台菜单自动出现。
- **web**：`integration.ts` — `/ap-ads/track`（CORS 统计，仿官方 forms/submit 模式）、`/ap-ads/loader.js`（曝光/点击/rel=sponsored/GDPR 门控/批量上报）、`middleware.ts`（`post`：替换 `[ap-ad key]` 短代码与 `data-ap-ad` 占位 + 注入 loader；不改 head）。**注意**：这两个公开端点刻意放在 `/ap-ads/*` 而非 `/api/*`——单应用架构下核心中间件对 `/api/*` 一律要求登录会话，放 `/api` 会让匿名访客（真正的广告受众）拿不到 loader/上报失败。
- **admin**：`integration.admin.ts` — `/admin-ext/ads`（广告位管理 + 全量统计表）、`/admin-ext/api/ads/slots`、`admin-middleware.ts`（`post` 中间件：拦截 `POST /api/posts` 与 `PUT /api/posts/:id`，广告单元保存成功后立即 `invalidateAdsCache()`，免去最长 60 秒的缓存陈旧；PUT 请求体不含 `type`，按保存行的 `post_type` 判定）。

## 安装

单应用架构（apps/admin 同时承载后台与前台），web 与 admin 两个集成装进**同一个** astro.config.ts：

```ts
// apps/admin/astro.config.ts
import adsWebIntegration from "@astropress/plugin-ads-manager/integration";
import adsAdminIntegration from "@astropress/plugin-ads-manager/integration.admin";
integrations: [..., adsWebIntegration(), adsAdminIntegration()]

// apps/admin/src/plugins.ts
import adsPlugin from "@astropress/plugin-ads-manager";
loadPlugin(adsPlugin);
```

`loadPlugin` 注册 CPT 使 `/admin/cpt/ap_ad` 可用；侧栏菜单项由 web 集成首次请求时 `ensureAdsInstalled()` 写入 `astropress_custom_post_types` 后出现。

## 使用

1. `/admin-ext/ads` 建广告位（key 如 `header-banner`）。
2. 后台菜单 Ads Manager → 新建广告：编辑器写代码 → 字段组填 slots/权重/排期/定向 → 发布。
3. 内容写 `[ap-ad key="header-banner"]` 或 `<div data-ap-ad="header-banner"></div>`。
4. 统计在 `/admin-ext/ads` 实时表格（曝光/点击/CTR，按天分桶存 meta `_ap_ad_stats`）。

## 安全

- 广告代码为受信管理员输入（同 WP 自定义 HTML 块威胁模型）；插件生成属性全部转义。
- 第三方脚本建议 kind=iframe + Sandbox。
- GDPR 门控：字段启用后待 `window.__apGdprConsent === true` 才激活。
- track 仅聚合计数，不存 IP。

## 卸载

移除装配行即停用；内容中的短代码恢复为原样文本。数据清理：
```sql
DELETE FROM wp_posts WHERE post_type='ap_ad';
DELETE FROM wp_postmeta WHERE meta_key LIKE 'ap_ad_%' OR meta_key='_ap_ad_stats';
DELETE FROM wp_options WHERE option_name='astropress_ads_slots';
```