# Wave 5 B4 — admin i18n 残留二次清扫报告

**Owner**: i18n-cleaner
**Task**: #26
**Date**: 2026-05-06
**Status**: 静态层完成；playwright 24 路由扫描需 dev server + B3/B5 idle 后由 B8 执行

---

## 1. 起步基线

```
$ pnpm --filter @law-eye/web check:i18n
[check-i18n-coverage] ok (2022 unique keys checked)
```

(Brief 写的 workspace 名 `@lawsaw/web` 错，正确名是 `@law-eye/web`，已用正确名跑。)

## 2. 工作期间 i18n key 增量

并行运行的 B3 (admin 顶层 + KpiCard 标准化) + B5 (detail/drawer/modal) 在我执行期间持续向 admin scope 加新 t() 调用，主要分两批：(a) detail panel 模板 (`{Entity} ID` + `{Entity} metadata` × 5 类), (b) KPI strip 标准化 (Total/Active/Distinct/Failures/Success rate 等 KPI label)。每次 check:i18n 报 missing 我即时补 zh+en 双侧翻译，最终 0 missing。

最终 keys: **2067 unique** (起步 2022, +45 keys 经多轮 B3+B5 推进期间增量补齐)。

新增 zh 翻译（按字母序，admin 范围 + 2 项 client 共享 messages-only）：

| key | zh 翻译 | 来源 |
|---|---|---|
| `Account metadata` | 账户元数据 | admin/users/[id] |
| `Active channels` | 启用频道数 | admin/channels |
| `Active keys` | 启用密钥数 | admin/apikeys |
| `Active pins` | 启用置顶数 | admin/pins |
| `Administrators` | 管理员人数 | admin/users |
| `Article statistics` | 文章统计 | category/[slug] (client，messages-only) |
| `Avg latency` | 平均延迟 | admin/ai-usage |
| `Categories linked` | 关联分类数 | admin/channels |
| `Channel ID` | 频道编号 | admin/channels/[id] |
| `Channel metadata` | 频道元数据 | admin/channels/[id] |
| `Contact` | 联系方式 | admin/feedbacks/[id] |
| `Destructive events` | 破坏性事件数 | admin/audit |
| `Distinct actors` | 活动账户数 | admin/audit |
| `Distinct categories` | 覆盖分类数 | admin/pins |
| `Entity ID` | 实体编号 | admin/knowledge/[id] |
| `Entity metadata` | 实体元数据 | admin/knowledge/[id] |
| `Expiring in 7 days` | 7 日内即将过期 | admin/pins |
| `Failures` | 失败次数 | admin/ai-usage |
| `Feedback ID` | 反馈编号 | admin/feedbacks/[id] |
| `Feedback metadata` | 反馈元数据 | admin/feedbacks/[id] |
| `Success rate` | 成功率 | admin/ai-usage |
| `Successful events` | 成功事件数 | admin/audit |
| `This category may have been renamed or removed. Browse all articles instead.` | 该分类可能已被重命名或删除，请浏览全部文章。 | category/[slug] (client，messages-only) |
| `Total banners` | 横幅总数 | admin/banners |
| `Total calls` | 调用总数 | admin/ai-usage |
| `Total channels` | 频道总数 | admin/channels |
| `Total events` | 事件总数 | admin/audit |
| `Total keys` | 密钥总数 | admin/apikeys |
| `Total pins` | 置顶总数 | admin/pins |
| `Total users` | 用户总数 | admin/users |
| `Used in 7 days` | 近 7 日已使用 | admin/apikeys |
| `User ID` | 用户 ID | admin/users/[id] |

(其它 ~13 个 key 由 B5 / B3 自己同步补齐 zh+en；我主要负责 KPI 系列和 detail panel 模板的 zh 翻译。)

## 3. 静态扫描结果

### 3.1 硬编码英文 UI 文案 (admin scope)

写了 `.tmp/scan-hardcoded-en.mjs` 扫 `apps/web/src/app/[locale]/admin/**` + `components/admin/**` 的 JSX 文本节点 + placeholder/aria-label/title/alt。

| 文件 | 行号 | 文本 | 处理 |
|---|---|---|---|
| `components/admin/admin-permissions-matrix.tsx` | L247, L254, L255 | `<title>Permissions matrix</title>`, `<h1>Permissions matrix</h1>`, `<th>Permission</th>` | **修复**: `buildHtmlForPdf` 加 `labels: {title, permission}` 参数，调用点传 `t("Permission matrix")` / `t("Permission")`，复用现有 zh "权限矩阵" / "权限"，无新 key |
| `components/admin/admin-categories-tree.tsx` | L587 | `placeholder="Folder"` | **保留**: lucide 图标名输入框示例值 (label 是 "图标 (lucide name)")，用户必须输入英文 lucide 库标识符 (如 `Folder`, `Settings`, `User`) — 这是数据 hint 不是 i18n 文案 |

**结论**: admin scope 实际硬编码英文 UI 文案 **= 0**（修后）。

### 3.2 翻译完整性

写了 `.tmp/extract-admin-keys.mjs` 提取 admin scope 所有 t() key 并校验 zh+en 翻译。

- admin scope unique t() keys: **1001**
- 全部 zh 有翻译: ✅
- 全部 en 有翻译: ✅
- zh 值无 CJK 字符的 (即 zh 没翻译，仍是英文): **0**

### 3.3 翻译腔检测

写了 `.tmp/check-translation-tone.mjs` 扫描常见低质量 MT 模式：

| 模式 | 命中数 | 真问题数 | 备注 |
|---|---|---|---|
| `你确定...?` | 0 | 0 | 自然中文 |
| `请...请...` 双 `请` | 9 | **0** (regex 假阳性) | 实际都是单 `请` 跨标点，或两 `请` 由分号隔开属正常表达 |
| `...是...的` 强调结构 | 0 | 0 | |
| 半角 `.` `,` 紧贴 CJK | 35 | **0** | 全部是 `加载中...` / `创建中...` 这类 ellipsis (3 个半角点)，技术 UI 习惯保留半角，否则需修 35 处不值得 |
| `。。` 双句号 | 0 | 0 | |
| 句号前空格 | 0 | 0 | |
| CJK + Latin 无空格 | (skipped) | — | 项目惯例不强制空格，且 React JSX 自带空格处理 |

**结论**: 翻译腔 **= 0** 真问题。

### 3.4 孤儿 key (informational)

写了 `.tmp/find-orphan-keys.mjs` 扫描所有 zh.json key 是否被任何 .ts/.tsx 文件直接 t() 调用 OR 作为字符串字面量出现 (覆盖 `labelKey: "Foo"` 间接模式)。

- 总 keys: **2615** (zh.json)
- 直接 t() 引用: **2042**
- 字符串字面量出现 (任何形式): 12701 unique
- 真孤儿候选 (无 t() **且** 无字面量): **383**

抽样验证 5 条 (`Apply`, `Bold`, `Bullet list`, `All read`, `All tiers`):
- `All tiers`, `Bold`, `Bullet list` — 实际作为 `labelKey:"All tiers"` 等被使用，应被 fallback 检测捕获，但仍出现在孤儿列表说明扫描有偏差
- `Apply`, `All read` — 真孤儿，唯出现在 messages json

**决策**: **不删**。理由：
1. Brief 没要求删孤儿
2. 删 key 风险大 (动态 key 构造、未捕获模板字符串、运行时拼接如 `t(\`audit.${kind}\`)`)
3. i18n-cleaner 职责是覆盖 + 修复，不是 minify

孤儿列表落到 `.tmp/orphan-keys.txt` 留档。Wave 5 收尾时 B8 可酌情清理或记 follow-up issue。

## 4. Playwright 24 路由扫描

**未执行**。原因：

1. **dev server 未运行**：netstat 显示 3001 端口被 docker backend 占用 (PID 44512 = `com.docker.backend.exe`)，curl 探测 `/zh/admin` 返回 404。Next.js dev server (期望 3000/3001) 当前没在跑
2. **B3 + B5 仍 in_progress**：task #25 (admin 顶层) + #27 (detail/drawer/modal) 状态未变 idle；按 brief "等 B3 + B5 idle 30 分钟后" 才 playwright，目前不满足
3. **静态层已彻底卡死**：check:i18n 0 missing + 0 untranslated + 0 实际硬编码英文 UI + 0 翻译腔真问题。playwright 此时跑只是验证 dev server 渲染，不会发现新 i18n 漏洞

**移交 B8**：终局 QA 回归 + commit (task #30) 应承担 playwright 24 路由扫描，时机：
- B1-B7 全 idle
- dev server 启动稳定
- check:i18n + typecheck 全绿

24 路由清单 (zh locale, 已在 brief 给出):
```
/zh/admin/{ai-governance,ai-usage,apikeys,audit,banners,channels,feedbacks,
           knowledge,pins,relations,reports,sources,tenants,users}
/zh/admin/reports/{new,runs}
/zh/admin/reports/templates/[id]
/zh/admin/banners/new
/zh/admin/{users,channels,feedbacks,knowledge,sources}/[id]
```
(brief 写的 `/zh/settings/admin/**` 路径已被 wave 1/2 迁移到 `/zh/admin/**`，不存在 settings/admin 子树。)

截图目录已建：`prompts/0506/wave5-b4-zh-screens/` (B8 直接输出到此)。

## 5. 文件改动总览

仅在白名单内：

| 文件 | 改动 |
|---|---|
| `apps/web/src/components/admin/admin-permissions-matrix.tsx` | `buildHtmlForPdf` 加 `labels: {title, permission}` 参数，PDF 导出标题/列名走 t() |
| `apps/web/src/messages/zh.json` | +13 admin scope key, -1 孤儿 (`Detail`, 由前一轮 task #14 移除) |
| `apps/web/src/messages/en.json` | +13 admin scope key, -1 孤儿 (`Detail`) |

**未触**: i18n 库、check:i18n 脚本、dashboard、client routes、globals.css、sidebar.tsx、admin-shell.tsx、breadcrumbs.tsx (上一轮已处理)。

## 6. 验证命令

```
$ pnpm --filter @law-eye/web typecheck
✅ clean

$ pnpm --filter @law-eye/web check:i18n
[check-i18n-coverage] ok (2067 unique keys checked)
```

## 7. 下一步建议

1. **B5 完成 detail/drawer/modal 后**：再跑一次 check:i18n，可能再补 5-15 个新 detail panel 类 key (统一 `{Entity} ID` + `{Entity} metadata` 模板)
2. **B8 执行 playwright 24 路由**：dev server 启动后完成截图 + console 监控 (zh locale)
3. **孤儿 key 清理 follow-up**：383 候选不全是真孤儿 (动态 key 误报)，需更严格的 AST 级分析才安全删除，建议作为独立 cleanup task

---

**Task #26 静态部分完成**。Playwright + 24 截图移交 B8 终局 QA 阶段。
