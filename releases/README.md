# Releases（开源发布物料目录）

本目录用于存放 AstroPress 每次正式对外发布的物料与发布说明（Release Notes）。

## 目录约定

```
releases/
├── README.md                 # 本说明
└── vX.Y.Z/
    ├── release-notes.md      # 该版本发布说明（亮点/修复/升级注意事项）
    └── checksums.txt         # 发布包校验和（打包时生成）
```

发布包本身不入库，通过 GitHub Releases 上传：

- `astropress-vX.Y.Z-source.zip` —— `git archive` 生成的纯净源码（不含 node_modules、local.db、logs、panel）
- 部署方式见根目录 README 与 [docs/deployment.md](../docs/deployment.md)；Cloudflare 一键部署见 `部署AstroPress到Cloudflare.py`

## 发布检查单（发版前逐项确认）

1. [ ] `pnpm -r run typecheck` 全部通过
2. [ ] `pnpm --filter @astropress/admin run build`（Node 构建）与 `run build:cf`（Cloudflare 构建）均通过
3. [ ] CHANGELOG.md 已新增版本条目并从 Unreleased 切出
4. [ ] 线上版本按 [onlinereadme.md](../onlinereadme.md) 方法完成全插件冒烟（108 项基线）与关键页面浏览器实测
5. [ ] 无密钥/凭据/生产数据库入库（参考 logs/secret-scan.py 的检查项）
6. [ ] 打好 git tag `vX.Y.Z` 并推送，GitHub Release 关联对应 tag
7. [ ] release-notes.md 中注明：6 个 Cloudflare 平台屏蔽成员（static-html/ai-chat/backup/git-sync/file-manager/webdav）在 Node.js 部署中功能完整

## 当前状态

**V8 轮发布物料已就绪（最新发布包 v1.0.4，2026-10-07）**：

- [v1.0.4/astropress-v1.0.4-source.zip](v1.0.4/astropress-v1.0.4-source.zip) —— 纯净开源源码包（2.1 MB，1427 文件；内置安全扫描 PASS，新增排除 `releases/` 与内部工作文档 HANDOVER/PLAN/CLAUDE）
- [v1.0.4/checksums.txt](v1.0.4/checksums.txt) —— SHA256：`f2d21d04…5261`
- [v1.0.4/release-notes.md](v1.0.4/release-notes.md) —— 发布说明（Node+SQLite 对等验证 54/54 / 页面缓存 epoch 收口 ≤2s / 开源发布工程化与 .github 基建）
- 对应线上版本：V2 `8c0162e7`、主站 `cdde9018`（epoch 2s 收口构建）；根 `package.json` 版本对齐 `1.0.4`
- V8 轮验收：Node 混沌 54/54 + epoch 双实例收敛断言 7/7×2 + 全仓脱敏 186+ 文件 + secret-scan 零泄漏，记录见 [onlinereadme.md](../onlinereadme.md) 与 [CHANGELOG.md](../CHANGELOG.md) V8 轮条目。

**V2 轮重装验收（2026-10-06，零缺陷，无新发布包）**：全新独立实例 https://astropress-v2.nqc715560.workers.dev（Worker `astropress-v2`，部署版本 `ea7cfbae`，D1 `astropress-v2` + R2 `astropress-media-v2`）完成 setup 安装 + 12 套件插件默认全启用 + 44/44 主题重导入，并按 8+1 套件全量重测（288+ 项断言）零代码缺陷收官；代码零改动，releases 维持 v1.0.3 为最新发布包。记录见 [onlinereadme.md](../onlinereadme.md) 第二十三节与 [CHANGELOG.md](../CHANGELOG.md) V2 轮条目。

**v1.0.3 发布物料已就绪（最新发布包，Z 轮，2026-10-06）**：

- [v1.0.3/astropress-v1.0.3-source.zip](v1.0.3/astropress-v1.0.3-source.zip) —— 纯净开源源码包（7.4 MB，2101 文件；安全扫描 PASS）
- [v1.0.3/checksums.txt](v1.0.3/checksums.txt) —— SHA256：`5cfd3db9…5563c`
- [v1.0.3/release-notes.md](v1.0.3/release-notes.md) —— 发布说明（后台 HTML 安全头子集补齐 / 9 处英文报错扫尾）
- 对应线上版本 `fa77bbf7`；Z 轮验收：11 主题逐一真实切换渲染 + 网站目录/广告/插件启停全生命周期 CRUD + 后台安全头修复 + 侧栏 12 分组与前台视觉真实浏览器验证 + 108 冒烟 + 50 页内联 JS 0 错误，记录见 [onlinereadme.md](../onlinereadme.md) 第二十二节。

**v1.0.2 发布物料已就绪**（Y 轮，2026-10-05）：

- [v1.0.2/astropress-v1.0.2-source.zip](v1.0.2/astropress-v1.0.2-source.zip) —— 纯净开源源码包（7.4 MB，2099 文件；安全扫描 PASS）
- [v1.0.2/checksums.txt](v1.0.2/checksums.txt) —— SHA256：`7d35faaa…157fa7`
- [v1.0.2/release-notes.md](v1.0.2/release-notes.md) —— 发布说明（批量删除附件级联修复 / 媒体删除接口中文化）
- 对应线上版本 `ba1c3ffb`；Y 轮验收：22 插件设置保存往返 + 154 资产零 404 + 32 端点字段契约 + 108 冒烟 + 级联删除造数验证，记录见 [onlinereadme.md](../onlinereadme.md) 第二十一节。

**v1.0.1 发布物料已就绪**（X 轮，2026-10-05）：

- [v1.0.1/astropress-v1.0.1-source.zip](v1.0.1/astropress-v1.0.1-source.zip) —— 纯净开源源码包（7.4 MB，2098 文件；安全扫描 PASS）
- [v1.0.1/checksums.txt](v1.0.1/checksums.txt) —— SHA256：`67f6237d…6366b8`
- [v1.0.1/release-notes.md](v1.0.1/release-notes.md) —— 发布说明（铃铛 SyntaxError 修复 / 上传异常吞没修复 / 全站 API 报错中文化 305 处）
- 对应线上版本 `a9f37862`；X 轮验收：108 冒烟 + 50 页内联脚本 0 错误 + 17 外部脚本 + 74 fetch 端点契约 + 铃铛浏览器终验，记录见 [onlinereadme.md](../onlinereadme.md) 第二十节。

**v1.0.0 发布物料已就绪**（V 轮，2026-10-05）：

- [v1.0.0/astropress-v1.0.0-source.zip](v1.0.0/astropress-v1.0.0-source.zip) —— 纯净开源源码包（7.3 MB，2096 文件；已排除 node_modules/构建产物/数据库/日志/panel、wordpress/ 与 hexothemes/ 第三方参考物、内部验收文档及含硬编码凭据的旧脚本）
- [v1.0.0/checksums.txt](v1.0.0/checksums.txt) —— SHA256 校验和
- [v1.0.0/release-notes.md](v1.0.0/release-notes.md) —— 发布说明
- 打包脚本 [logs/v_package_release.py](../logs/v_package_release.py)（含打包后强制安全扫描：密钥/私钥模式命中即中止）
- V 轮全插件复测（108 冒烟 ×2 + 30+ 写路径 + 11 主题 + 27 稳定性）全部通过，记录见根目录 [onlinereadme.md](../onlinereadme.md) 第十七节，变更明细见 [CHANGELOG.md](../CHANGELOG.md) V 轮条目。

下一步：按上方检查单逐项确认后，打 tag 并上传 GitHub Release（建议直接发布 v1.0.1）。
