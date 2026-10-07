# wp-themes 主题包 · 全面排错与优化报告

> 范围：`wp-themes/` 下 **34 个移植主题包** + 参考文件 `base-theme.json`
> 依据：`apps/admin/src/pages/api/themes/{upload,import}.ts`、`apps/web/src/components/BlockRenderer.astro`、`apps/admin/src/islands/ThemeEditor.tsx`、`packages/core/src/types/theme.ts`、`apps/web/src/layouts/BaseLayout.astro`
> 工具：`scripts/audit-themes.mjs`（审计）、`scripts/fix-themes.mjs`（修复）
> 日期：2026-09-11

---

## 一、结论速览

| 指标 | 修复前 | 修复后 |
|---|---|---|
| error | **68** | **0** |
| warning | **88** | **0** |
| info | 227 | 193 |
| JSON 解析失败 | 0 | 0 |
| 主题包总数 | 34 | 34 |

修复后 `error = 0 / warning = 0`，剩余 193 条全部是 **info 级**，且其中 170 条属于**平台能力限制**（主题包本身无法解决，详见第六节）。

---

## 二、最重要的一条诊断

### 移植工作只搬了「配色」，没搬「结构」

34 个包的 `theme.css` 基本是从原 WordPress 主题**逐字复制**过来的，选择器指向的是 WordPress 模板 DOM：

```css
.post-card, .main-container, .nav-bar, .sidebar-section, .article-title { … }
```

但 AstroPress 前台 `BlockRenderer.astro` 实际输出的 class 只有：

```
.ap-blocks  .ap-block  .ap-block-hero  .ap-block-nav  .ap-block-query-loop
.ap-block-html  .ap-block-features  …   （外加 BaseLayout 的 .site-main / .site-wrapper）
```

**两套 class 名零交集** → 这 34 份 CSS 对前台**完全没有作用**。修复前审计结果：

```
34 / 34  css/inert      theme.css 无任何 .ap-block-* 规则，选择器对前台无效
34 / 34  css/no-adapter 缺少适配层
```

所以修复前所有主题看起来几乎一样：只能靠 `tokens`（7 个颜色 + 2 个字体 + 3 个间距）区分，原主题的圆角、卡片阴影、导航样式、悬停反馈**全部丢失**。

### 为什么"直接改 CSS"还不够 —— 两个必须知道的机制

1. **block 的样式几乎全是内联 `style`。**
   `BlockRenderer` 把 `padding` / `background` / `grid-template-columns` 等直接写成 `style="…"`。
   → 类选择器**默认打不过内联样式**，只有内联没覆盖的性质（`box-shadow`、`transition`、`:hover`、`position`）才能免 `!important` 生效。

2. **主题的 `:root` 变量会被 token 顶掉。**
   `BaseLayout.astro` 的注入顺序是：`themeStyles`(默认主题) → **主题 theme.css** → **token `:root` + `body`**。
   最后那个内联 `<style>` 重新声明了这些变量，**后写的赢**：

   ```
   --color-primary  --color-primary-hover  --color-bg  --color-surface  --color-border
   --color-text  --color-muted  --font-sans  --font-heading
   --max-width  --radius-md  --radius-sm  --section-y
   ```

   → 主题好不容易写对的 `--color-primary-hover: #d63838` 被替换成 `= primary`，**悬停色等于主色，hover 无任何视觉反馈**。
   也正因如此，`--color-secondary` 从不被注入 —— 主题用它的地方才会真正生效。

---

## 三、修复清单

### F1 · `manifest.json` 去重（34 个包，68 条警告）

**问题**：每个包同时存在两份数据源 —— `manifest.json` 里的内联 `templates[]` / `pages[]`，以及 `templates/*.json` / `pages/*.json`。而 `upload.ts` 组装包时会把目录扫描结果**覆盖**到 manifest 之上：

```js
return { ...manifest, tokens, css, pages, templates, postTypes };
//                            ^^^^^  ^^^^^^^^^ 来自 templates/ 与 pages/ 目录
```

→ manifest 里的内联数组是**死数据**，且与实际内容不一致时会严重误导（本次核验过 type 列表完全一致，所以删除无损）。

**修复**：删掉内联 `templates` / `pages`，manifest 只保留 `upload.ts` / `import.ts` 真正消费的字段：

```json
{ "name": …, "version": …, "description": …, "author": …, "tokens": { … } }
```

保留任何未预期的自定义字段，避免静默丢数据。

### F2 · `loopTemplateId` 归一化（2 个主题 / 6 个文件）

**问题**：`aiphoto-theme`、`nirvana-theme` 的 `query-loop` 用了 `"loopTemplateId": "default-card"`。
`BlockRenderer` 只认内置 id（`default-with-image` / `default-no-image` / `default-horizontal` / `default-magazine`），其余会去查 `astropress_page_schema___loop-item_default-card__` —— 而主题包**根本没有携带循环模板的能力**（`ThemePackage` 类型没有这个字段），所以必然落空、**静默回退**成默认布局。

**修复**：按 `showImage` 归一化到内置模板

| 原值 | 条件 | 改为 |
|---|---|---|
| `default-card` | `showImage !== false` | `default-with-image` |
| `default-card` | `showImage === false` | `default-no-image` |

### F3 · 注入 Web 字体 `@import`（20 个主题）

**问题**：主题声明了 `'Open Sans'` / `'Cormorant Garamond'` / `'LXGW WenKai'` 等字体，但 **AstroPress 不会注入任何字体 `<link>` 或 `@font-face`** → 浏览器只能回退到系统字体，排版风格全丢。

**修复**：在 `theme.css` **最顶部**注入 `@import`（CSS 规范要求 `@import` 必须位于其它规则之前；`themeCustomCss` 是独立 `<style>` 块，因此合法）：

```css
/* >>> ap-fonts >>> */
@import url("https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&family=Noto+Serif+SC:wght@400;700&display=swap");
/* <<< ap-fonts <<< */
```

处理了几个坑：

- `Muli` 已改名 → 用 `Mulish`
- `Courgette` 只有单一字重，带 `:wght@400;700` 会让**整个 `@import` 返回 400** → 单字重字体不带 `:wght@` 轴
- `LXGW WenKai` 不在 Google Fonts → 改用 jsDelivr 的 `lxgw-wenkai-webfont`
- **国内网络无法访问 Google Fonts 时删掉这个区块即可**，字体会优雅回退到系统字体

### F4 · 追加 AstroPress 适配层（34 个包 · 本次核心产出）

给每个 `theme.css` 末尾追加一段带标记的适配层（`/* >>> ap-adapter >>> */` … `/* <<< ap-adapter <<< */`），严格遵守上面第三节的两条机制：

**只做安全的事**（不依赖 `!important`，因为内联样式没设这些性质）：

| 类别 | 作用 |
|---|---|
| 卡片阴影 + 悬浮抬升 | `.ap-block-query-loop article` / `.ap-block-features` 卡片的 `box-shadow` + `transform: translateY(-4px)` + `transition` |
| 导航吸顶 | 见下方「一个反直觉的坑」 |
| 链接/导航悬停 | `:hover` 恢复主题的真实悬停色 |
| 富文本 | `blockquote` / `pre` / `code` / 列表 / 标题的间距与配色（原生标签，内联不涉及） |
| 图片圆角、`::selection` | 主题化细节 |

**必须用 `!important` 的地方只在媒体查询里**（因为对应性质是内联的）：

| 断点 | 修复 |
|---|---|
| ≤ 900px | 内联 `padding: … 48px` → 24px，**避免 360px 屏幕上被吃掉 96px**；多列网格降为 2 列；`columns` 块降为 1 列 |
| ≤ 640px | 网格降为 1 列；导航 `height:auto` + 允许换行，**修复固定 64px 高、不换行导致的导航溢出** |
| `prefers-reduced-motion` | 关闭卡片动效 |

**配色隔离方案**：适配层定义一组 `--ap-*` 变量作为**主题原始配色快照**。凡是会被 token 覆盖的变量（`--color-primary` 等）取**字面量**，不会被覆盖的（`--color-accent` / `--radius` / `--shadow`）用 `var(名称, 字面量)`。这样主题自身的配色被完整还原，同时保留未来的可调性。

**一个反直觉的坑（已修正）**：`BaseLayout` 里 header 的 `.ap-blocks` 是 `<body>` 的直接子元素且**与 nav 等高**，所以给 `.ap-block-nav` 设 `position: sticky` 是**无效的**（可粘范围 = 自身高度）。正确做法是让包装层吸顶：

```css
body > .ap-blocks:has(> .ap-block-nav) {
  position: sticky; top: 0; z-index: 90; background: var(--ap-bg);
}
```

不支持 `:has()` 的浏览器自动降级为不吸顶，无副作用。

### F5 · 修复参考文件 `base-theme.json`（2 处致命 prop 错误）

该文件的 `nav` 与 `html` 块 props **几乎全是错的**，而它正是移植工具效仿的对象：

| 块 | 原 props | 渲染器实际读取 | 后果 |
|---|---|---|---|
| `html` | `{ "html": "<footer…>" }` | `p.content` | **页脚渲染为空** |
| `nav` | `logo`, `logoSize`, `sticky`, `links[]`, `align`, `background`, `textColor`, `borderBottom` | `logoText`, `align`, `style` + 数据库菜单 | 8 个 prop 里 **7 个被忽略**，只剩 `align` 有效 |

**已修复为**：

```json
nav ： { "logoText": "AstroPress", "align": "right" }
html： { "content": "<footer …>" }
```

> 顺带说明：`base-theme.json` 是**导出格式**（`format: "astropress-theme"` + `schemas`），而 `import.ts` 读的是 `pkg.templates[].blocks`。
> 导出文件里的 `templates` 只带 `schemaSlug`、**不带 `blocks`**，`pages` 也没有 —— 所以**导出的 JSON 无法被重新导入**（会得到空 header/footer）。
> 主题分发的正确格式是**目录包**（`manifest.json` + `templates/` + `pages/` + `theme.css`），也正是这 34 个包采用的格式；`base-theme.json` 不适合当模板参考。

---

## 四、验证结果

```
主题: 34   E:0 W:0 I:193

问题类型（消息数 / 影响主题数）:
   136 / 34  template/inert     ← 平台限制，见第六节
    34 / 34  css/scoped-vars     ← 平台限制，见第六节
    23 / 16  css/var-unused      ← 主题自身设计 token 未被适配层引用，无害
```

附加校验：由 **两套独立实现**（Node 审计器 + `scripts/verify-themes.py`）分别确认，结果一致。

| 校验项 | 结果 |
|---|---|
| JSON 文件解析 | 272 个，0 失败 |
| manifest 残留内联 `templates`/`pages` | 0 |
| 缺失 `tokens`（会导致 upload 直接 400） | 0 |
| 缺少适配层 / 适配层标记重复 | 0 |
| 适配层存在未使用的 `--ap-*` 变量 | 0 |
| 残留 `default-card` | 0 |
| `theme.css` 括号平衡 / `@import` 位置合法 | 全部通过 |
| `base-theme.json` 的 `nav` / `html` prop | 已修正，通过 |
| 修复脚本幂等（重复运行） | 0 改动、0 失败 |

Python 校验器输出：

```
====================================================================
wp-themes 主题包独立校验（Python）
====================================================================
主题目录数          : 34
JSON 文件数         : 272
含适配层的 theme.css: 34
FAIL                : 0
WARN                : 0

全部通过。
```

---

## 五、工具用法

> 本机 `python` / `python3` 是 **Microsoft Store 占位别名**（`AppData\Local\Microsoft\WindowsApps\python.exe`，无实际解释器）。
> 真实解释器装在 `C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe`，下列命令用绝对路径调用。

```bash
# 独立校验（Python，推荐先跑这个）
C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe scripts/verify-themes.py
# 需要同时落盘时追加一个路径参数：
#   ... scripts/verify-themes.py wp-themes/_verify.txt

# 审计（Node，默认扫 wp-themes/，可用 AP_THEMES_DIR 指向其它目录）
node scripts/audit-themes.mjs              # 人类可读报告
node scripts/audit-themes.mjs --json       # 机器可读

# 汇总统计（可选传入审计 JSON 路径，便于对比修复前后）
node scripts/audit-summary.mjs wp-themes/_audit.json

# 修复
node scripts/fix-themes.mjs --dry-run      # 预览
node scripts/fix-themes.mjs                # 实际写入
node scripts/fix-themes.mjs --only=argon   # 只处理名字含 argon 的主题
```

`verify-themes.py`（Python）与 `audit-themes.mjs`（Node）是**两套独立实现**：后者负责"发现问题"，前者负责"确认修复结果"，互相交叉验证，避免同一个逻辑错误被复制两次。Python 版检查：JSON 完整性、`default-card` 残留、manifest 契约与内联字段、`tokens` 完备性、适配层标记唯一性、花括号平衡、`@import` 顺序、`--ap-*` 死变量、字体加载、`loopTemplateId` 白名单、`base-theme.json` 的 `nav`/`html` prop。

审计脚本的检查项覆盖：manifest 元数据 / tokens 完整性、模板 `type` 枚举、页面 slug 与 Astro 路由冲突、block `type` 与 prop 合法性（含别名映射 `logo→logoText`、`html→content`、`title→heading` 等）、必填 prop、枚举值、`perPage`/`columns` 范围、`loopTemplateId`、CSS 未定义变量、死选择器占比、token↔`:root` 配色冲突（含 `#333`/`#333333` 归一化）、Web 字体加载、响应式缺失、适配层存在性、`--ap-*` 死变量。

> **备份**：修复前版本完整保留在 `.backup-wp-themes/`（34 个目录）。本仓库不是 git 仓库，故留此兜底；确认无误后可删除：
> `C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe -c "import shutil; shutil.rmtree('.backup-wp-themes')"`

---

## 六、剩余的「平台级」问题（主题包无法解决，需改平台）

这些是本次审计中被刻意留下的 info 项，**都能单独作为平台改造任务**：

### 6.1 136 条：4 种模板被导入却永不被渲染

每个包都带 `single-post` / `archive` / `search` / `404` 四个模板，但 `BaseLayout` **只读 `slots.header` 与 `slots.footer`**：

```js
const headerSlug = slots.header;
const footerSlug = slots.footer;
```

`404.astro` 也是硬编码页面。→ 这 136 个模板会写进数据库、却完全不生效，属于"看起来很丰富"的假数据。

**更危险的是** `import.ts` 给**所有**模板硬编码了同一个条件：

```js
conditions: [{ rule: "entire_site" }],
```

一旦平台未来开始消费这些模板，`single-post` / `archive` 的 `entire_site` 条件会**全站生效**，属于埋雷。

**建议**：要么让 `BaseLayout` / `blog/*` / `404.astro` 真正消费这些 slot（推荐，模板才有意义），要么在导入时按 type 设置合理条件、并在主题包中删掉不支持的模板类型。

### 6.2 34 条：暗色模式全站失效

主题在 `.dark { --color-bg: … }`（或 `[data-theme="dark"]`）里写了暗色配色，但：

1. AstroPress **没有任何地方**给 `<html>` 加 `.dark`，也没有 `prefers-color-scheme` 处理；
2. 更根本的是，block 的背景/文字色是**内联字面量**（`style="background:#1e1b4b;color:#fff"`），不是 `var(--color-*)`，**换变量也改不动**。

→ 暗色模式需要平台先把 block 颜色改为变量驱动。

适配层已把这部分抽成**注释块**保留在 `theme.css` 里，方便将来一键启用：

```css
/* ── 暗色模式（默认注释掉：… 直接启用会与内联色冲突导致对比度异常） ──
.dark { --color-bg: #1a1a1a; … }
*/
```

### 6.3 导航链接无法随主题预置

`nav` 块的 `links[]` prop 是无效的 —— 导航数据来自数据表菜单（`getNavMenu()`）。**34 个包全部如此**：

→ 用户装上主题后**导航是空的**，必须去后台「外观 → 菜单」手动配置。
建议在主题包的 `description` 里写明这一点，或平台支持从包内预置菜单。

### 6.4 多主题共存会互相破坏数据

`import.ts` 的三处**整体覆盖**：

```js
await upsertOption(db, "astropress_theme_templates", JSON.stringify(templates));  // 全量替换，旧主题模板全丢
await upsertOption(db, "astropress_template_slots", JSON.stringify(slots));      // 全量替换 header/footer 槽位
await upsertOption(db, `astropress_page_schema_${slug}`, …);                     // 同名 slug 直接覆盖
```

叠加一个事实：**34 个包的首页 slug 全都是 `/`**。

→ 于是「装 A → 装 B」的结果是：
- B 的模板列表接管，A 的模板**从 `wp_options` 中消失**；
- Home 页面 schema 已被 B 覆盖；
- 但 `astropress_active_theme` **没有变**（`import.ts` 不设置它，只有激活接口 `POST /api/themes/[id]` 才写）。

→ 最终状态是 **B 的布局 + A 的配色**，混合且难以理解。
**建议**：导入时写入「待激活」状态（如 `astropress_pending_theme`），或在激活时再落库模板/页面。

### 6.5 query-loop 卡片不显示真实特色图

`loop-image` 渲染的是**内联 SVG 占位符**，不读取文章特色图。→ 所有主题的首页卡片都没有真图，观感问题明显。需要平台补 `wp_posts` 特色图（`_thumbnail_id`）的读取与 `srcset` 输出。

### 6.6 `--color-primary-hover` 被写成等于 `--color-primary`

```js
--color-primary-hover: ${tokens.colors.primary};
```

悬停色与主色相同 → 所有依赖该变量的 hover 都无反馈。适配层已用 `--ap-primary-hover` 绕过，但平台侧应改为独立的 hover token（或提供自动加深）。

### 6.7 其它既存问题（与主题包无关，仅记录）

- `--header-height: 60px`（默认主题）与 nav 块内联的 `height: 64px` 不一致；
- `.site-wrapper { max-width: var(--max-width) }` 用的是 `containerMax`，博客长文在大屏下行宽偏大，缺少阅读度量（`65ch` 左右）约束；
- `import.ts` 用 `{...b, id: uid()}` 重写 block id，所以源文件里的 id 重复无影响，但编辑器新建时仍需唯一 id（`query-loop` 的网格 DOM id 依赖它）。

2026-10-01 插件/主题全面排错时新增记录（均为存量源文件问题，按「零核心修改」约束未动）：

- `packages/core/src/integration.ts` 与 `packages/auth/src/index.ts` 在 `turbo run typecheck` 下报 3 个 TS 错误（`TS2307` 找不到 astro 类型、`TS7006`/`TS7031` 隐式 any）。文件 mtime 为 2026-05-23，属上游遗留；本轮 7 个插件 + `apps/admin` + `apps/web` + `packages/api` typecheck 全绿，不受影响；
- `apps/admin/src/pages/api/pages/set-front.ts`（设置首页 API）为本机更早会话创建的功能文件，非本轮改动，保留。

---

## 七、主题包规范速查（写新主题时对照）

### 必需的目录结构

```
my-theme/                     ← zip 打包时 manifest.json 必须在根目录
├── manifest.json             ← 仅元数据 + tokens（不要再放 templates/pages）
├── tokens.json               ← 可选；未在 manifest 内联时使用
├── theme.css                 ← 可选；必须是「适配层 + 主题自己的规则」
├── templates/
│   ├── header.json           ← type 必须是合法枚举
│   └── footer.json           ← 只有 header / footer 会被前台渲染
└── pages/
    └── home.json             ← slug 为 "/" 时自动设为首页
```

### `manifest.json`

```json
{
  "name": "My Theme",
  "version": "1.0.0",
  "description": "…（建议注明：导航需在后台菜单中配置）",
  "author": "…",
  "tokens": {
    "colors": { "primary": "#…", "secondary": "#…", "background": "#…",
                "surface": "#…", "text": "#…", "textMuted": "#…", "border": "#…" },
    "fonts":  { "heading": "…", "body": "…" },
    "spacing":{ "sectionY": "5rem", "containerMax": "1100px", "borderRadius": "8px" }
  }
}
```

> `tokens` 缺失 → upload 直接返回 `Invalid theme file — missing tokens`。

### block 的合法 prop（易错点）

| 块 | 正确 prop | 常见错误写法 |
|---|---|---|
| `html` | `content` | ~~`html`~~ ~~`body`~~ |
| `text` | `content` | ~~`html`~~ ~~`text`~~ |
| `nav` | `logoText`、`align`、`style` | ~~`logo`~~ ~~`links`~~ ~~`sticky`~~ ~~`background`~~ |
| `hero` | `heading`、`subtext`、`buttonText`、`buttonUrl`、`bgColor`、`textColor`、`align`、`height` | ~~`title`~~ ~~`subtitle`~~ ~~`href`~~ |
| `cta` | `heading`、`text`、`buttonText`、`buttonUrl`、`bgColor`、`textColor` | ~~`description`~~ |
| `image` | `src`、`alt`、`caption`、`align`、`width` | ~~`url`~~ ~~`imageUrl`~~ |
| `query-loop` | `postType`、`perPage`、`columns`、`orderBy`、`order`、`loopTemplateId`、`pagination`、`cardBg`、`cardBorder`、`cardRadius`、`padding`、`gap` | ~~`count`~~ ~~`type`~~ ~~`layout`~~ |

- `loopTemplateId` 只认 `default-with-image` / `default-no-image` / `default-horizontal` / `default-magazine`（自定义值需要配套 `astropress_page_schema___loop-item_<id>__`，主题包**无法携带**）。
- `orderBy: "rand"` 会被渲染器转成 `date`，想要随机排序需平台支持。

### 页面 slug 不能与 Astro 路由冲突

`blog` / `admin` / `api` / `forms` / `media` / `login` / `setup` 已被文件路由占用，作为页面 slug 会导致该页面**不可达**。

### `theme.css` 必须面向真实 DOM

只对这 3 类选择器写样式才有意义：

1. `.ap-blocks` / `.ap-block` / `.ap-block-<type>`（block 容器）
2. `.site-main` / `.site-wrapper`（BaseLayout 结构；`.site-header` 仅在**没有** header 模板时的兜底分支出现）
3. 原生标签（`blockquote` / `pre` / `code` / `h2` / `ul` … 在 `text` / `columns` / `html` 块内）

并记住：**内联样式的性质要覆盖必须 `!important`**（尽量只用在媒体查询里）。

---

## 附录：本次改动文件清单

| 路径 | 改动 |
|---|---|
| `wp-themes/*/manifest.json` | 34 个 — 移除内联 `templates`/`pages` |
| `wp-themes/{aiphoto,nirvana}-theme/{pages,templates}/*.json` | 6 个 — `loopTemplateId` 归一化 |
| `wp-themes/*/theme.css` | 34 个 — 注入字体 `@import` + 追加适配层 |
| `wp-themes/base-theme.json` | 修复 `nav` / `html` 块的 prop |
| `scripts/audit-themes.mjs` | 新增：主题包审计器（Node） |
| `scripts/audit-summary.mjs` | 新增：审计结果汇总（Node） |
| `scripts/fix-themes.mjs` | 新增：幂等修复器（Node） |
| `scripts/verify-themes.py` | 新增：独立校验器（Python，交叉验证修复结果） |
| `docs/theme-package-audit.md` | 新增：本报告 |
| `.backup-wp-themes/` | 新增：修复前备份（34 个目录，可删） |

---

# 八、Pass-2：按原始设计语言还原 34 主题（2026-10-01）

> 工具：`scripts/optimize-themes.py`（Python 3，约 900 行）
> 备份：pass-1 产物完整副本在 `.backup-wp-themes-v1/`（34 个目录，非 git 仓库下唯一回滚手段）
> 归档：`wp-themes.zip` 已用 pass-2 产物重建（409 条目 = 307 文件 + 102 目录，34 个 theme.css）

## 8.1 为什么需要第二轮

Pass-1 的适配层是**同一套模板**：34 个主题只有 `--ap-*` 颜色字面量不同，却被统一强加「卡片阴影 + hover `translateY(-4px)`」。而逐个核对 34 份原始 CSS 后确认，原主题的卡片语言其实分三类，pass-1 让约 27 个主题呈现了它们原本没有的视觉效果。

另一个问题：原始 CSS 中大量规则的选择器指向 WordPress DOM（`.nav-*` / `.main-*` / `.post-card` / `.sidebar-*` / `.article-title` 等），前台零命中，属于永久死代码，却原样保留在每个包里。

## 8.2 实测得到的三类卡片语言

判定依据是每个主题骨架中卡片本体规则（`.post-card` / `.post-list-item`，含两个自定义命名特例）的 `background` / 四周边框 `border` / `box-shadow` / `:hover transform`：

| 类别 | 判据 | 数量 | 前台处理 |
|---|---|:---:|---|
| **shadow 阴影卡** | 静态或 hover 含 `box-shadow` | 7 | 内联壳（底色/1px 边框/圆角）保留，阴影、hover 阴影与位移用提取值驱动 |
| **border 边框卡** | 有 `--color-surface` 底色块、无阴影 | 11 | 内联壳保留；只去阴影；hover 严格按原设计：有位移动位移，**不擅自加边框变色** |
| **list 列表流** | 无底色无阴影，仅 `border-bottom` 分隔 | 16 | `!important` 中和内联卡片壳（透明底/去边框去圆角/去阴影），网格 gap 归零，行间分隔线 |

### 全部分类清单

**shadow（7）** — 括号内为 hover 位移，静态/hover 阴影均提取自原 CSS：

| 主题 | 圆角 | 位移 | 静态阴影（原 CSS 字面量） |
|---|---|---|---|
| argon-modern | 8px | -2px | `0 8px 24px rgba(94,114,228,.12)` |
| argon-santiago | 10px | -2px | `0 8px 24px rgba(94,114,228,.15)` |
| git-alpha | 8px | -2px | `0 4px 12px rgba(0,0,0,.08)` |
| lyrargon | 16px | -2px | `0 8px 24px rgba(33,150,243,.1)` |
| puock | 8px | -2px | `0 4px 12px rgba(28,96,243,.1)` |
| xinaide-cloud | 12px | **-4px** | `0 8px 24px rgba(24,168,143,.15)` |
| ztheme | 8px | -2px | `0 4px 12px rgba(59,130,246,.1)` |

**border（11）**：

| 子类 | 主题 |
|---|---|
| 描边卡 + hover 上浮 | aiphoto（-4px）、nirvana（-4px，卡片类是自定义的 `.photo-card`）、dream2-mxin、halo-dream、qiling、sakurairo、yneko-reimu（均 -2px） |
| 描边卡、无 hover 动效 | days-from-blog、elsewhere-magazine（用 `.post-list-item` 做完整卡片）、yesterday |
| **纯底色卡（无描边）** | mirage —— 原 CSS 只有 `background: var(--color-surface)` + 圆角，适配层用 `border-color: transparent !important` 中和内联 1px 边框（保留占位避免布局抖动） |

**list（16）**：aiya-cms、argon、blossom-fashion、context-blog、hello-elementor（圆角 0/标题 600）、ink-context、kratos-plus、once、quire-ink（标题 600）、simple-theme、simplepost、stillora（圆角 0）、twentytwelve（圆角 0）、vitepress-ninc、weisaygrace、wpno-vc（列表类是自定义的 `.novel-item`）。

## 8.3 优化器四项功能（`scripts/optimize-themes.py`）

### O1 · 特征提取 `extract_traits()`

从原始 CSS 提取并量化主题设计特征：卡片三分类、静态/hover 阴影、hover 位移、`--radius` 真实值（0/4/6/8/10/12/15/16px 七档）、导航高度（`.nav-inner`/`.nav-bar`，实测 44–56px）、标题字重（600/700/800）与标题颜色（对比 primary/text 字面量归类）、衬线标题（serif/Playfair/LXGW/Courgette 等关键词 → 字距归零）、正文行高、链接下划线、引用块左边框宽度/颜色/圆角、图片圆角、`.dark` 暗色声明。

自定义类名特例显式纳入候选：nirvana 的 `.photo-card`（边框卡）、wpno-vc 的 `.novel-item`（列表流）。词界匹配避免 `.post-list-item` 误命中 `.post-list-item-title`。

### O2 · 适配层 v2 `build_adapter()`

- 三分支卡片 CSS（见 8.2 表），策略基于一个硬约束：`BlockRenderer.astro` 的 query-loop 卡片**内联固定输出** `background:<cardBg>; border:1px solid <cardBorder>; border-radius:<cardRadius>`，类选择器只能免 `!important` 接管 `box-shadow`/`transform`/`transition`/`:hover`。
- 导航高度 `height: var(--ap-nav-height) !important`（内联固定 64px），沿用 pass-1 验证过的 `body > .ap-blocks:has(> .ap-block-nav)` 吸顶、900/640px 响应式、`prefers-reduced-motion` 关闭动效。
- 暗色声明仍以**注释块**保留（平台不给 `<html>` 加 `.dark`，启用前提不变，见 6.2）。
- `--ap-card-*` 三个变量**只在 shadow 分支输出**；pass-1 遗留的 `--ap-accent` / `--ap-shadow` 因无任何规则消费而删除——适配层不允许存在死变量（`verify-themes.py` 强制）。

### O3 · 字体镜像 `mirror_fonts()`

20 个主题的字体 `@import` 域名替换为国内可达镜像：`fonts.googleapis.com → fonts.loli.net`、`fonts.gstatic.com → gstatic.loli.net`（海外同样可访问；LXGW 的 jsDelivr 源不动）。已镜像的区块原样返回，注释中保留「如何改回官方源」的说明。

### O4 · 死规则清理 `prune_css()`

自研极简 CSS 解析器（顶层规则 + 一层 `@media` + 注释/raw，适配本批规整文件），白名单驱动删除前台零命中规则，34 个主题共删除 **758 条**（每主题 14–35 条）：

- **保留前缀**：`site-`、`ap-block`、`wp-block`；
- **精确保留**：`.post-list` 系列、`.post-meta`、`.post-excerpt`、`.read-more`、`.post-content`（博客正文真实存在）、`.pagination`、`.current` 等；
- **删除**：`.nav-*`、`.main-*`、`.sidebar-*`、`.post-card*`、`.article-*`、`.header-inner`、`#id`、`[attr]` 等选择器；
- 组选择器按 OR 判定（任一选择器存活则整条保留），宁可多留不误删。

## 8.4 幂等设计（特征快照往返）

死规则清理会删掉特征来源（`.post-card` 等规则），因此二次运行时无法再从基础 CSS 提取特征。解决方案：适配层区块顶部内嵌一行机器可读快照：

```css
/* >>> ap-adapter >>> */
/* ap-traits-v2: {"card_style":"shadow","card_has_border":true,"card_shadow":"0 8px 24px ...",...} */
```

重跑时优先从快照恢复全部 Traits（暗色多行声明从区块内 `.dark {}` 文本恢复，保留缩进）；字体区块检测到已是镜像则原样返回。实测二次运行 **34/34 主题字节级零差异**。

## 8.5 验证结果

```
============================================================
wp-themes 主题包独立校验（Python）
============================================================
主题目录数          : 34
JSON 文件数         : 272
含适配层的 theme.css: 34
对比度达标配色对    : 272 (WCAG AA)   ← 8 对 × 34 主题
FAIL                : 0
WARN                : 0
```

- 花括号平衡、`@import` 位于顶部、区块标记唯一：34/34；
- 死类（`.nav-menu` / `.post-card` / `.sidebar` / `.article-title` / `.main-container`）基础 CSS 中 0 残留；活类（`.post-list-item` / `.post-content` / `.pagination` / `.site-header`）全部保留；
- 抽检四类产物（hello-elementor 列表流 / yesterday 描边卡无动效 / mirage 纯底色卡 / argon-modern 阴影卡）分支 CSS 与原主题设计一一对应；
- 优化器重复运行：34/34 零改动。

`verify-themes.py` 同步更新：移除已不存在的 `--ap-accent` 对比度对与解析逻辑（每主题受检配色对由 9 调整为 8，总对数 306 → 272）。

## 8.6 工具用法

```powershell
$py = "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"

& $py scripts/optimize-themes.py --analyze    # 只打印特征/删规则数/字节变化，不写盘
& $py scripts/optimize-themes.py --dry-run    # 同上（显式语义）
& $py scripts/optimize-themes.py              # 实际写入
& $py scripts/optimize-themes.py --only=argon # 只处理名字含 argon 的主题
& $py scripts/optimize-themes.py --no-prune   # 只重建适配层/镜像字体，不清理死规则
& $py scripts/verify-themes.py                # 独立校验
```

与 pass-1 的 `fix-themes.mjs` 共享同一套区块标记（`>>> ap-fonts >>>` / `>>> ap-adapter >>>`），两轮脚本互相幂等：优化器每次先剥离旧区块再按当前特征重建。

## 8.7 仍未覆盖

- **运行时浏览器验证未做**：本机 Node.js/pnpm 在目录迁移后断链（见 README「故障排查」），dev server 当前无法启动；本轮全部为静态产物校验，环境恢复后应抽看三类主题的首页 query-loop 实际观感。
- pass-1 报告第六节的 7 项平台级问题（模板不渲染、暗色模式、导航预置、多主题互相覆盖、特色图、hover token 等）本轮均未触及——它们超出主题包边界。
