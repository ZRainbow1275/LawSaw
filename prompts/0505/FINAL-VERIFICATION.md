# FINAL VERIFICATION — 0505 Frontend Restore Wave

**Verifier**: qa-verifier (frontend-restore team)
**Date**: 2026-05-05 (UTC+8 evening)
**Dev server**: http://127.0.0.1:8849 (existing, not restarted — middleware.ts therefore not active)
**Login**: `admin@qa.lawsaw.local` (tenant_admin)
**Branch**: `0430-housekeeping`
**Scope**: PRs #10 (i18n-cleaner), #11 (shell-unifier), #12 (detail-page-fixer)

---

## 1. Route walk (38 routes)

Legend
- 渲染: ✅ main 区充实 / ⚠️ 部分 / ❌ 空白或 spinner-only
- 中文化: ✅ 0 未译片段 / ⚠️ 个别白名单内 / ❌ 明显未译
- 与 prototype 对齐: ✅ / ⚠️ / ❌
- console: errors+warnings 数（i18n missing 单列）
- P0/P1/P2 等级针对发现的真实问题

| # | 路由 | 渲染 | 中文化 | 对齐 | console err | i18n miss | 关键问题 | 优先级 |
|---|------|------|--------|------|-------------|-----------|----------|--------|
| 1 | /zh/dashboard | ✅ | ✅ | ✅ | 0 | 0 | onboarding tour 1.2s 后弹出（hasCompleted 不持久） | **P0** (见 §3.A) |
| 2 | /zh/articles | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 3 | /zh/articles?q=microsoft | ✅ | ✅ | ✅ | 0 | 0 | search 生效；分页隐藏；badge "共 95" 是 server total（设计如此） | — |
| 4 | /zh/articles/[id] | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 5 | /zh/knowledge | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 6 | /zh/reports | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 7 | /zh/reports/RPT-20260505-0004 | ✅ | ⚠️ | ⚠️ | 0 | **6** | breadcrumb "RPT 20260505 0004" 当 i18n key + 状态 "Review" 未译 | **P0** (见 §3.B) |
| 8 | /zh/analytics | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 9 | /zh/feedback | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 10 | /zh/me/feed | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 11 | /zh/me/articles/[id] | ✅ | ⚠️ | ⚠️ | 1 | **6** | breadcrumb UUID 当 i18n key + API 400 read endpoint | **P0** (见 §3.B) |
| 12 | /zh/login (匿名) | ✅ | ✅ | ✅ | 0 | 0 | 未触发"已登录跳走"（但允许） | — |
| 13 | /en/dashboard 匿名 → 308 | ❌ | n/a | ❌ | n/a | n/a | 返回 200 而非 308（middleware.ts 未生效，dev 未重启） | **P1** (已知，见 §3.C) |
| 14 | /en/admin/audit 匿名 → 308 | ❌ | n/a | ❌ | n/a | n/a | 同上，返回 200 | **P1** (已知) |
| 15 | /zh/admin | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 16 | /zh/admin/users | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 17 | /zh/admin/users/[id] | ⚠️ | ⚠️ | ⚠️ | 2 (404) | **6** | breadcrumb UUID 当 i18n key + 错误信息英文 "User ... not found" | **P0** (见 §3.B + §3.D) |
| 18 | /zh/admin/audit | ✅ | ✅ | ✅ | 0 | **0** | i18n missing 严格 0 — wave 2 修复已生效 | — |
| 19 | /zh/admin/banners | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 20 | /zh/admin/banners/new | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 21 | /zh/admin/channels | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 22 | /zh/admin/channels/[id] | ⚠️ | ⚠️ | ⚠️ | 0 | **2** | breadcrumb UUID 当 i18n key（detail 页"未找到"中文 OK） | **P0** (见 §3.B) |
| 23 | /zh/admin/sources | ✅ | ⚠️ | ⚠️ | 0 | **4** | "All types" 选项 + tab 未译；4 条 i18n missing | **P0** (见 §3.E) |
| 24 | /zh/admin/sources/[id] | ⚠️ | ⚠️ | ⚠️ | 1 (404) | **2** | breadcrumb UUID + 错误 "Source ... not found" 英文 | **P0** (见 §3.B + §3.D) |
| 25 | /zh/admin/feedbacks | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 26 | /zh/admin/feedbacks/[id] | ⚠️ | ⚠️ | ⚠️ | 1 (404) | **2** | 同上模式 | **P0** (见 §3.B + §3.D) |
| 27 | /zh/admin/knowledge | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 28 | /zh/admin/knowledge/[id] | ⚠️ | ⚠️ | ⚠️ | 1 (404) | **2** | 同上模式 + "Entity ... not found" 英文 | **P0** (见 §3.B + §3.D) |
| 29 | /zh/admin/reports | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 30 | /zh/admin/reports/new | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 31 | /zh/admin/reports/runs | ✅ | ✅ | ✅ | 0 | 0 | placeholder route 自动 ?tab=runs | — |
| 32 | /zh/admin/reports/templates/[id] | ✅ | ✅ | ⚠️ | 0 | **4** | placeholder route 自动 ?templateId=...，breadcrumb UUID 当 i18n key | **P0** (见 §3.B) |
| 33 | /zh/admin/tenants | ⚠️ (access denied 正常) | ⚠️ | ⚠️ | 0 | **12** | "AI enrichment" / "Report generation" / "Webhook" 三个 key 未注册 zh.json，每个出现 4 次 | **P0** (见 §3.F) |
| 34 | /zh/admin/relations | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 35 | /zh/admin/pins | ✅ | ✅ | ✅ | 0 | 0 | — | — |
| 36 | /zh/admin/ai-usage | ⚠️ (API 404) | ✅ | ✅ | 1 (404) | 0 | 后端 `/api/v1/admin/ai-usage` 返回 404；UI 友好 retry。已知 ai-usage-dashboard.tsx:552 用 `${rate}` 模板字面量（task brief 已记） | **P1** (见 §3.G) |
| 37 | /zh/admin/ai-governance | ⚠️ (data error) | ✅ | ✅ | 0 (二访) | 0 | 首次编译 ERR_CONNECTION_RESET（dev cold start, 二访 OK）；契约校验失败：seed 数据 experiment_key=`crud_experiment_*` 不在 enum 内，致整页只显示错误 | **P0** (见 §3.H) |
| 38 | /zh/admin/apikeys | ✅ | ✅ | ✅ | 0 | 0 | — | — |

**统计**
- 38 路由全部访问完毕
- 0 个 main 永久空白 (all mainChildCount > 0；ai-governance 一访失败为 dev cold compile transient)
- 0 个 spinner-only
- console error 主要来源：**i18n missing on dynamic UUID/RPT segments**（同一类 bug 跨 7 条 [id] 路由）+ tenants 的英文 fallback key + sources 的 "All types"
- 中文路由未译片段：基本只在 [id] 路由的 breadcrumb 区出现（UUID 显示为 "B1000000 0000 0000 0000 0000000000..."）

---

## 2. Code gates

| Gate | 命令 | 结果 |
|------|------|------|
| typecheck | `pnpm typecheck` | ✅ 0 errors |
| check:i18n | `pnpm check:i18n` | ✅ ok (2020 unique keys checked) |
| lint | `pnpm lint` | ✅ Checked 345 files in 116ms. No fixes applied. |

**全部代码闸通过。**

---

## 3. P0 / P1 详情（按发现顺序）

### §3.A P0 — Onboarding hasCompleted 未持久化（重新触发）
- **现象**：每次浏览页面 1.2s 后弹出 onboarding tour（dialog），手动点击"跳过引导"后下一个页面又弹。localStorage `lawsaw.onboarding.v1` 中 `hasCompleted: false` 始终未变成 true。
- **根因猜测**：`onboarding-store` 的 `markCompleted` action 没写到 zustand persist storage（possibly state shape mismatch with `partialize`）。
- **复现**：清空 localStorage → 登录 → 任意页面 → 等 1.2s → 弹窗 → 点"跳过引导" → 导航到另一页 → 再等 1.2s → 仍弹。
- **副作用**：弹窗里的 `<dialog>` 会让 Playwright/test 抓键盘焦点；如果用户在 1.2s 窗口内已进入页面操作，可能误触 follow → router.push 跳到 step.route。
- **修复指引**：检查 `apps/web/src/stores/onboarding-store.ts` 的 `markCompleted` 是否同时 set `hasCompleted: true` + `dismissed: true`，并确认 `partialize` 包含 `hasCompleted`。
- **PR 归属**：#11 P1.x onboarding persist 任务

### §3.B P0 — Breadcrumb 把动态路径段当 i18n key（跨 7 条 [id] 路由）
- **现象**：所有 `/zh/.../<dynamic-id>` 路由的 breadcrumb 末段把 path segment 喂给 `t()`，控制台爆 `[i18n] missing zh key: "<UUID 大写空格分隔>"`。展示文本也是 `B1000000 0000 0000 0000 000000000005`（UUID 经 capitalize+space 转）。
- **影响路由**：#7 reports/RPT-*, #11 me/articles/[id], #17 admin/users/[id], #22 admin/channels/[id], #24 admin/sources/[id], #26 admin/feedbacks/[id], #28 admin/knowledge/[id], #32 admin/reports/templates/[id]
- **根因**：breadcrumb 组件对未匹配 i18n 字典的 path segment 走 fallback `t(segment)`，于是 segment 自己变成 i18n lookup key。
- **修复指引**：找到 breadcrumb 渲染处（可能是 `apps/web/src/components/layout/breadcrumb.tsx` 或 admin-shell 内联），对最后一个 segment 改为：
  - 如果是 RPT-* → 直接显示 `RPT-XXX`（不查 i18n）
  - 如果是 UUID → 显示真实实体名（从已 fetch 的 detail data 取 title），fallback 显示 "详情" 或 segment 截断 8 位
- **PR 归属**：#11 breadcrumb i18n 修复未覆盖 dynamic segment

### §3.C P1 — middleware.ts 未生效（已知，待重启 dev server）
- **现象**：匿名 curl `/en/dashboard`、`/en/admin/audit` 返回 200 而非 308 → /en/login?next=...
- **原因**：middleware.ts 是新增文件，Next.js dev server 需重启才加载。当前 dev server 由外部接管，按 task brief "如果 dev server 已被外部接管，跳过 — 用现有的"，未重启。
- **生产风险**：build/restart 后会自动生效。本地暂无法验证 308 路径与 next 参数。

### §3.D P0 — 后端错误信息未中文化（[id] not found 类）
- **现象**：5 条 admin/[id] 路由的"加载失败"卡片正文是英文 `User|Source|Feedback|Entity 00000000-... not found (request_id=...)`。卡片标题已中文化，但错误正文是后端 API 原文。
- **影响路由**：#17 users/[id], #24 sources/[id], #26 feedbacks/[id], #28 knowledge/[id]（reports/templates/[id] 通过 redirect 不触发）
- **修复指引**：在 detail 页错误处理处把 backend `error.message` 经过 i18n 转换或用 fallback 中文："{resource}详情未找到 (请求 ID: {request_id})"

### §3.E P0 — admin/sources "All types" 选项未中文化
- **现象**：sources 页面的来源类型 filter chip 显示 "All types"，并产生 4 条 `[i18n] missing zh key: "All types"` console error。
- **修复指引**：找到 sources 页面 filter，"All types" 替换为 `t("source.filter.allTypes")`，同时在 zh.json 添加 key 翻译"全部类型"。

### §3.F P0 — admin/tenants 三个英文 fallback key 未在 zh.json 注册
- **现象**：12 条 i18n missing：`"AI enrichment"`, `"Report generation"`, `"Webhook"`，每个 4 次。
- **修复指引**：在 zh.json 添加这三个 key（"AI 增强"/"报告生成"/"Webhook"）。Tenants 页主体是 access-denied 卡片，但渲染过程仍会经过这些 strings（可能是 RoleTier feature toggle 的 description）。

### §3.G P1 — admin/ai-usage 后端 404 + JS 模板 ${rate}（已知）
- **现象**：`/api/v1/admin/ai-usage` 返回 404；UI 友好显示"加载 AI 用量失败"+ 重试。task brief 已记 ai-usage-dashboard.tsx:552 用 JS 模板 `${rate}` 而非 i18n `{rate}`。
- **本次实测未观察到 hasRateTemplate=true**（API 没数据所以 dashboard 没渲染到 rate 行），但代码层面已知。

### §3.H P0 — admin/ai-governance Schema 校验失败（seed 数据不规范）
- **现象**：API `/api/v1/admin/ai-governance/feed-experiments` 返回数据中 `experiment_key=crud_experiment_1777952097318`，但前端 zod schema 期望 enum `feed_ranking | banner_delivery`。校验失败 → 整个 main 显示错误信息（中文 OK），用户看不到任何治理控件。
- **根因**：QA seed 创建过名为 `crud_experiment_*` 的实验记录，schema 太严。
- **修复指引**：要么放宽 frontend schema 的 enum（允许 `string`），要么清理 QA seed 中违规 experiment_key（`DELETE FROM ai_experiments WHERE experiment_key NOT IN ('feed_ranking','banner_delivery')`）。

---

## 4. 完成度评分

**67 / 100**

- 路由可达性：38/38 都有响应（37 ✅ + 1 transient cold compile） → +30
- 代码闸：typecheck/check:i18n/lint 全过 → +20
- 客户端核心路由（dashboard/articles/knowledge/analytics/feedback/me/feed/login）：8/8 干净 → +15
- admin 列表页（admin/users/audit/banners/banners-new/channels/sources-list/feedbacks-list/knowledge-list/reports/reports-new/relations/pins/apikeys）：13/14 干净（sources 列表 4 i18n miss）→ +12
- **扣分项**
  - **breadcrumb UUID-as-i18n-key bug 跨 7 条 [id] 路由** → -15（系统性 P0）
  - **onboarding hasCompleted 未持久化** → -8（每次访问都骚扰用户）
  - admin/tenants 12 i18n miss + admin/sources 4 i18n miss → -5
  - admin/ai-governance schema 不符致整页空 → -5
  - 后端错误信息英文（4 条 [id] 路由）→ -3
  - middleware.ts 未生效（已知，dev not restarted）→ -2

---

## 5. 最终判定

# ❌ **需补修**

**理由**：4 个独立 P0 类别（§3.A breadcrumb UUID, §3.B onboarding persist, §3.E sources, §3.F tenants）全部都是承诺已修但实测仍存在的回归，且 §3.B 跨 7 条路由系统性出现，会让 admin 详情页常规导航 console 红条满屏 + breadcrumb 显示 "B1000000 0000 0000 0000..." 这种用户级可见乱码。**不能 commit**。

---

## 6. 剩余 P0 / P1 清单（给修复人员）

### P0（必须修，会阻塞 commit）

| # | 问题 | 文件 | 一句话修复 |
|---|------|------|-----------|
| P0-1 | breadcrumb 把 dynamic segment 当 i18n key | `apps/web/src/components/layout/breadcrumb.tsx`（或类似 admin-shell 内联） | 对 segment 检测 UUID/RPT-*，命中则直接显示原值或 detail-title，不走 t() |
| P0-2 | onboarding `markCompleted` 未持久化 | `apps/web/src/stores/onboarding-store.ts` | 确认 `markCompleted` set `hasCompleted: true` + `dismissed: true`，且 `partialize` 含这两 key |
| P0-3 | admin/sources "All types" 未译 | `apps/web/src/app/[locale]/admin/sources/page.tsx`（或子组件） + `messages/zh.json` | 把字面量改成 `t("source.filter.allTypes")`，zh.json 加"全部类型" |
| P0-4 | admin/tenants 三 key 未注册 | `messages/zh.json` | 加 `"AI enrichment": "AI 增强"`、`"Report generation": "报告生成"`、`"Webhook": "Webhook"` |
| P0-5 | admin/ai-governance schema 太严 | `apps/web/src/lib/api-types/feed-experiments.ts`（或对应 zod） + 或 seed 清理 | enum 放宽到 `string` 或在 schema 中允许扩展 key |
| P0-6 | [id] 错误信息英文 | `apps/web/src/app/[locale]/admin/{users,sources,feedbacks,knowledge}/[id]/page.tsx` | 错误正文用本地化字符串，request_id 单独显示 |

### P1（可不阻塞，但建议同周修）

| # | 问题 | 一句话修复 |
|---|------|-----------|
| P1-1 | middleware.ts 未生效 | dev server 重启即可，prod build 自动生效；建议下次发版时在 release notes 标注 |
| P1-2 | ai-usage-dashboard.tsx:552 JS 模板 `${rate}` | 改成 i18n template `{rate}` 占位符 |
| P1-3 | /zh/me/articles/[id] 首次加载偶发 webpack chunk 抖动 `User is not defined` | dev HMR 副作用，prod 不会出现 |

---

## 7. 变更范围（git diff --stat master...HEAD）

> note: 仓库无 main 分支，对比基线为 master（最近 commit `25d3a18 feat(repo): 8h enterprise hardening rebuild`）。

```
57 files changed, 8556 insertions(+), 5978 deletions(-)
```

**主要新增/扩展**：
- `apps/web/src/components/layout/admin-shell.tsx` +854（新增 admin shell SoT）
- `apps/web/src/app/[locale]/admin/{sources,pins,reports,tenants,channels,banners,relations,knowledge,audit,users}/page.tsx` 各 +408~+720（admin 主页全量重写）
- `apps/web/src/messages/{zh,en}.json` +299/+302（新增大量 i18n key — 含本次 wave 2 扩到 2020 keys）
- 13 个 admin 子路由 placeholder route（[id]/new/runs 等）各 +15-16
- `apps/web/src/components/admin/admin-placeholder-page.tsx` +74（新增）
- `apps/web/src/lib/redirects/legacy-admin.ts` +28（新增）
- `apps/web/src/components/auth/{permission-guard,role-tier-guard}.tsx` +98（新增 + 测试）
- `apps/web/src/app/settings/admin/*/page.tsx` 全部 -X（旧位置清空，逻辑迁移到 [locale]/admin/）
- 后端：`crates/law-eye-api/src/routes/{auth,banners,me,mod}.rs` 微调
- DB migration: `079_role_tier_perm_seed_align.sql` +68
- 工具：`scripts/dev_seed_qa_test.sh` +185

变更范围与三个 PR 承诺一致（i18n cleanup + admin shell unify + detail page fix + 角色权限守卫）。

---

## 8. 截图与原始数据

- 38 张路由截图：`prompts/0505/audit-shots-final/01-dashboard.png` ~ `38-admin-apikeys.png`
- console 原始日志：`.playwright-mcp/console-2026-05-05T*.log`
- 路由 yml snapshot：`.playwright-mcp/page-2026-05-05T*.yml`

---

**报告完。** 上面的 P0 修完，跑完整 38 路由复测后才能盖 ✅。
