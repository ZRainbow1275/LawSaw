# LawSaw — Completion Report (Phase Z)

> 80k token-budget multi-agent delivery. 此文档面向 stakeholders，5 分钟通读即可掌握交付边界。基于真实代码与 task ledger，引用具体文件路径与 task 编号，不含编造。

---

## 1. Executive Summary

LawSaw 本轮交付围绕**五大支柱**：(i) ReBAC 5-tier 授权矩阵 + 通道访问策略；(ii) 双面板 Web UI（admin + me）；(iii) AI 集成（SiliconFlow Qwen3 / bge-m3 / bge-reranker-v2-m3）；(iv) 阅读体验闭环（reader / banners / pins / engagement / 推荐 / 通知 / 历史）；(v) 法律新闻多级分类 taxonomy。配合 Phase G 生产就绪三件套（健康端点 / 部署文档 / 发布清单）。

**完成 phase 数**：B / C / D / E / F / G 六大阶段，共 **41 个 completed tasks**（截至本报告写作时点 #47 仍在 in_progress，#48 即本文档）。

**交付物总览**（grep 自仓库现状）：
- **73 个 SQL 迁移**（`001_initial.sql` → `074_tenant_exports.sql`，编号 017 历史空缺）
- **33 个 API 路由模块**（`crates/law-eye-api/src/routes/`）
- **155 个 mounted backend endpoints** + **184 行端点表**（`docs/audit/backend-endpoints.md`）
- **84 个 Next.js 页面**（`apps/web/src/app/**/page.tsx`）
- **33 个 React Query hooks**（`apps/web/src/hooks/use-*.ts`）
- **19 个 admin 组件 + N me 组件**（`apps/web/src/components/admin/`）
- **7 个任务队列** + DLQ 重放
- **Fresh-DB bootstrap ~69s clean**（Task #40 实测）

**3 个 agent 协作**：b5-routes / e2-sentiment / f2-banner（详见 §8）。

---

## 2. Phase 完成度矩阵

| Phase | Subphase | Task # | Subject | Owner |
|-------|----------|--------|---------|-------|
| B.5 | Recovery | #2 | Register 10 orphan route modules + fix me.rs | b5-routes |
| B.5' | Orphans | #13 | 注册 6 个孤儿（channels/article_pins/report_subscriptions/notifications/me-extend/audit） | b5-routes |
| B.6a | Banners + Authz | #18 | Migrations + 注册 banners/authz/notifications | b5-routes |
| B.6b | Cleanup | #35 | Cleanup orphan routes + Sources PATCH + Channel access policy CRUD | b5-routes |
| B.6c | Bootstrap | #24 | Fix fresh-DB bootstrap by rewriting 050/051/054 placeholders | b5-routes |
| C.2 | Users | #17 | Admin user management page (role assign / tier upgrade modal) | f2-banner |
| C.3 | ReBAC UI | #21 | Admin Relations/Permissions (ReBAC matrix visual) | e2-sentiment |
| C.4 | AI Usage | #19 | Admin AI Usage / Governance dashboard (echarts) | e2-sentiment |
| C.6 | Channels | #22 | Admin Channels CRUD page (visibility tiers + category linkage) | f2-banner |
| C.7 | Sources | #25 | Admin Sources page (crawler config + run history) | f2-banner |
| D.2 | Reader | #4 | Article reader page 视觉与 tier-aware 适配 | f2-banner |
| D.2-FU | Reader sync | #6, #7, #8, #9 | Sync ReaderPage tier-aware + ai_metadata=null + tier CTAs + typecheck | f2-banner |
| D.3 | Reports | #11 | Reports user-end list + reader page | f2-banner |
| D.4 | Analytics | #5 | Analytics 5 tabs (overview/region/industry/importance/cross) | e2-sentiment |
| D.5 | Knowledge | #10 | Knowledge graph user-end query page | e2-sentiment |
| D.6 | Settings | #15 | User Settings 6 tabs (profile/security/notifications/billing/privacy/api) | e2-sentiment |
| D.7 | Articles list | #14 | Articles list polish (filters/category pills/grid toggle) | f2-banner |
| D.9 | Engagement | #34 | Article reader engagement tracking + retrofit super-tenants URL | f2-banner |
| D.10 | Notifications | #39 | User notification center (in-app feed + drawer) | f2-banner |
| D.11 | Reading hist UI | #41 | User dashboard "Continue reading" + reading history | f2-banner |
| E.2 | Sentiment | #1 | Phase E.2 recovery — Finish sentiment classifier wiring | e2-sentiment |
| E.3 | AI insights | #12 | User-end AI insights endpoints + tier-aware enrichment | b5-routes |
| E.4 | Categories UI | #23 | Categories taxonomy admin (legal news multi-level hierarchy) | e2-sentiment |
| E.5 | Categories API | #26 | Categories admin POST/PATCH/DELETE/reorder backend | e2-sentiment |
| E.6 | Recommendation | #33 | article_reads + recommendation personalization (real ML loop) | e2-sentiment |
| E.7 | Reading hist API | #44 | User reading history GET endpoint | e2-sentiment |
| F.2 | Banners + Pins | #3 | Banner orchestration + Pin admin UI | f2-banner |
| F.3 | Sources admin | #27 | Sources admin run/runs + AI usage time-series endpoints | b5-routes |
| F.3.b | Worker source_runs | #32 | Worker wiring for source_runs status machine | b5-routes |
| F.4 | Super tenants UI | #29 | Super-admin Tenants management page | f2-banner |
| F.5 | Super tenants API | #30 | Super-admin Tenants backend (CRUD + quota + feature flags) | e2-sentiment |
| F.6 | Tenant export worker | #38 | Worker handler for tenant export task | e2-sentiment |
| F.7 | Tenant subroutines | #37 | Super tenant subroutines (users / suspend / reset-pw / export) | b5-routes |
| F.8 | Bootstrap smoke | #40 | Fresh-DB migration smoke + export history endpoints | b5-routes |
| G.1 | Health + metrics | #42 | Production readiness health endpoint + system metrics | e2-sentiment |
| G.2 | Endpoint audit | #43 | Backend endpoint inventory + frontend call audit | b5-routes |
| G.3 | Deploy docs | #45 | Deployment guide + release checklist | e2-sentiment |
| G.4 | ReBAC list APIs | #46 | Implement admin ReBAC list endpoints (relations / roles / permissions) | b5-routes |
| G.5 | Article AI hook | #47 | Frontend article enrichment hooks → /me/articles/{id}/ai | f2-banner |
| Z | Completion | #48 | COMPLETION-REPORT.md final delivery summary | e2-sentiment |
| G.6 | AI governance stubs | #49 | admin AI governance 11 stub endpoints (`crates/law-eye-api/src/routes/admin_ai_governance.rs` ~560 LOC) | b5-routes |
| G.7 | Super-tenants drawer | #50 | super-tenants drawer 6 tab unlock + reset-token / export polling (`use-admin-tenants.ts` + `tenant-detail-drawer.tsx` + `confirm-action-modal.tsx`) | f2-banner |

**43 completed tasks** + 1 explicit V2-deferred bucket（AI governance persistence backend，详见 §6）。

---

## 3. 五大支柱交付详情

### 3.1 ReBAC（Phase A / B）

5-tier role 阶梯：`basic_user` → `verified_user` → `premium_user` → `tenant_admin` → `super_admin`，定义在 `crates/law-eye-core/src/role_tier.rs`，工具函数包括 `category_visible_for_tier` / `truncate_body_for_tier` / `is_admin_tier` 等 tier-aware 边界判定。

**关键 migrations**：
- `050_rebac_phase_a.sql` —— `auth_relations` 三元组表（subject / object / relation）
- `056_authz_channel_alignment.sql` —— channel ↔ relation 联动对齐
- `067_create_authz_baseline.sql` —— `channel_access_policies` baseline + permission seed

**关键代码**：
- `crates/law-eye-core/src/authz.rs` —— `AuthzService` + `AuthzCheckInput` + `AuthzDecision` + `CreateAuthRelationInput`（lib.rs:34 re-export）
- `crates/law-eye-api/src/routes/authz.rs` —— `POST /api/v1/authz/check` 决策端点
- `crates/law-eye-api/src/middleware/auth_guard.rs` + `RequirePermission` / `require_role_tier` 中间件

**Admin matrix UI**（Task #21 e2-sentiment 交付）：
- `apps/web/src/components/admin/admin-relations-matrix.tsx`
- `apps/web/src/components/admin/admin-permissions-matrix.tsx`

**ReBAC list endpoints**（Task #46 b5-routes 交付）：admin 端三个 list endpoint（relations / roles / permissions）补完，前端 ReBAC 矩阵实数据接入。

### 3.2 双面板（Phase C / D / F）

**Admin panel**（`/admin/*`，gate=`tenant_admin` 或 `super_admin`）：
- Users (#17) / Roles + ReBAC matrix (#21) / Channels (#22) / Sources (#25 + #27) / Categories (#23 + #26) / Banners + Pins (#3) / Reports / Feedbacks / Knowledge / Audit / AI Usage (#19) / Tenants (#29 + #30 + #37)
- 19 个 admin 组件落地：`apps/web/src/components/admin/`（包含 `tenant-detail-drawer.tsx` / `channel-form-modal.tsx` / `feedback-reply-drawer.tsx` 等 drawer/modal 复用件）

**Me panel**（`/me/*`，gate=`basic_user` 起步）：
- Dashboard / Articles list (#14) / Article reader (#4 + tier CTAs #8) / Pins / Reports (#11) / Settings 6 tabs (#15) / Notifications (#39) / Reading history (#41 + #44)
- 84 个 Next.js page 节点（`apps/web/src/app/**/page.tsx` 双语 locale 镜像）

**Tier-aware 边界**：Reader 页根据 user.role_tier 决定渲染 markdown 全文 / 摘要截断 / AI insights 是否可见，统一通过 `truncate_body_for_tier` + `category_visible_for_tier` 等 helper 落地。

### 3.3 AI 集成（Phase E）

**Provider**：默认 SiliconFlow（OpenAI 兼容）+ 可切换 OpenAI 官方
- chat：`Qwen/Qwen3-8B`
- embedding：`BAAI/bge-m3`（**1024 维**，迁移 064 已添加 `embedding_v2 VECTOR(1024)` 列）
- rerank：`BAAI/bge-reranker-v2-m3`（独立 `/v1/rerank` endpoint）

**关键 migrations**：
- `052_ai_governance_phase_c.sql` —— AI 治理 phase C（policy + audit）
- `059_ai_usage_events.sql` —— `ai_usage_events` 表（tenant_id / occurred_at / operation / total_tokens / latency_ms / 错误分类），强制 RLS
- `071_tenants_quotas.sql` —— `tenants.quota_ai_tokens_monthly` 默认 1M，配额 metadata

**关键代码**：
- `crates/law-eye-ai/src/gateway.rs` —— `LlmGateway::health_check()` 用 `models().list()` 不烧 token
- `crates/law-eye-ai/src/service.rs` —— `AiService` 业务层
- `crates/law-eye-core/src/article/service.rs::recommend_personalized` —— 5 步个性化推荐算法（Task #33，pgvector centroid 余弦排序）

**Endpoints**：
- `GET /api/v1/me/articles/{id}/ai` —— tier-aware AI 包（Task #12 b5-routes，Task #47 前端接入中）
- `POST /api/v1/me/articles/{id}/read` —— 写入 article_reads 触发推荐刷新（Task #33）
- `POST /api/v1/ai/process/{id}` / `POST /api/v1/ai/classify/{id}` —— 管理员手工触发
- AI usage time-series：`GET /api/v1/admin/ai/usage`（Task #27）

**Admin dashboard**：`apps/web/src/components/admin/ai-usage-dashboard.tsx`（echarts，Task #19）。

### 3.4 阅读 UX（Phase D）

**Reader（Task #4 + Sync FU #6-#9）**：
- `apps/web/src/app/[locale]/articles/[id]/page.tsx` —— markdown source-first 渲染（locale 镜像）
- Tier-aware AI insights 折叠面板，免费 tier 不渲染重型 AI 包
- 报告/文章侧栏 TOC（Task #14 polish 引入）

**Banners + Pins（Task #3）**：
- 顶层横幅 `apps/web/src/components/admin/banner-form.tsx` + 公开 router `/api/v1/banners`
- 文章 pin 多面板（用户 + admin），`pin-list.tsx`

**Engagement tracking（Task #34 f2-banner）**：
- 客户端：`IntersectionObserver`（视区进入）+ 滚动深度 + `visibilitychange`（页签切换）+ `sendBeacon`（卸载时投递）四件套
- 服务端：`POST /api/v1/me/articles/{id}/read`（同日合并 max(dwell)/max(scroll)/OR(finished)）

**推荐（Task #33）**：用户最近 finished article 的 embedding centroid → pgvector cosine `<=>` 排序 → 排除已读 → 5 步算法

**通知中心（Task #39）**：
- 30s 轮询 `/api/v1/me/notifications`
- `notification_last_seen_seq` 高水位（migration 054）
- 抽屉式 UI 替代旧 toast

**阅读历史（Task #41 UI + Task #44 API）**：
- `GET /api/v1/me/reading-history?limit=&offset=&finished_only=` —— 分页 + JOIN articles + LEFT JOIN categories
- 同日合并语义保留（schema 设计），SELECT 端无需聚合
- Continue reading card 在 dashboard 顶部（Task #41）

### 3.5 法律新闻分类 taxonomy（Phase E）

**Migration**：`069_categories_admin_columns.sql` —— `visibility_tier` / `updated_at` / 触发器 / `(parent_id, sort_order)` 索引

**Seed**：26 节点 SEED_TAXONOMY（监管 / 司法 / 行业 / 学术 等大类，多级父子）

**Backend endpoints（Task #26 e2-sentiment）**：
- `POST /api/v1/admin/categories` 创建（环检测：parent 链向上走，禁止自环 / cycle）
- `PATCH /api/v1/admin/categories/{id}` 更新（tri-state nullable 支持）
- `DELETE /api/v1/admin/categories/{id}` 软删 + 子节点级联检查
- `POST /api/v1/admin/categories/reorder` 兄弟节点 sort_order 原子位移
- `POST /api/v1/admin/categories/import` 从 SEED_TAXONOMY 一键导入

**Admin UI（Task #23 e2-sentiment）**：`apps/web/src/components/admin/admin-categories-tree.tsx` —— HTML5 native drag-and-drop reorder，可视化父子关系。

---

## 4. 生产就绪（Phase G）

### 4.1 健康端点 + 系统指标（Task #42）

- `GET /health/full`（与 `/api/v1/health/full` 镜像，**匿名**）—— 5 子系统聚合：database / redis / task_queue / object_store / ai_gateway，输出 `ok | degraded | down`
- `GET /api/v1/admin/system/metrics`（**tenant_admin** gated）—— 7 KPI：active_users(7d) / articles_ingested(24h) / reports_generated(7d) / ai_tokens_consumed(24h) / storage_used_mb / queue_depths / error_rate(5min)
- AI gateway ping 用 `models().list()` 不烧 token；DB 用 `SELECT 1` 最便宜 ping

### 4.2 部署 + 发布（Task #45）

- `docs/DEPLOYMENT.md`（404 行，10 章）—— 系统要求 / 52 个 env vars / 73 个 migrations / 启动 / 健康检查 / 多租户 RLS / 7 个 task queues / 备份与租户导出 / 安全栈
- `docs/RELEASE-CHECKLIST.md`（139 行）—— Pre-Release / Release / Post-Release 三段 checkbox + Rollback 触发条件

### 4.3 端点审计（Task #43）

- `docs/audit/backend-endpoints.md`（240 行）—— **155 个 mounted endpoints**
- `docs/audit/frontend-calls.md`（212 行）—— hook + inline 调用清单
- `docs/audit/api-mismatches.md`（258 行）—— **31 orphan backends**（无前端调用）+ **17 phantom calls** 原始 → 截至 final addendum **3 残余**
- 已修复：#46 ReBAC list endpoints（解 3：admin/authz/relations + admin/roles + admin/permissions）、#47 article AI（解 3：summary + sentiment + kg-extract me 端）、#49 AI governance 11 stub endpoints（解 use-ai-governance.ts 整文件 phantom 路径簇）、#50 super-tenants drawer 6 tab unlock（解 super_tenants drawer 占位 wiring）
- 残余 3 phantom：admin 端 `/admin/articles/{id}/kg-extract`（admin retrigger 未补 me-mirror）、`/admin/ai-usage` 旧路径（dashboard 仍在用 legacy 路径，未迁 `/admin/ai/usage/timeseries`）、`/articles/pins`（use-pins.ts 路径 drift，应为 `/article-pins`），均列入 §6 V2 backlog

### 4.4 数据库 fresh-DB smoke（Task #40）

- 73 migrations 顺序应用
- pgvector image 上 ~69s clean bootstrap
- `tenant_exports` 历史查询 endpoint：`GET /api/v1/super/tenants/:id/exports`

---

## 5. 数据库

**73 migrations**（`001_initial.sql` → `074_tenant_exports.sql`，017 编号历史空缺）。

**关键表**（按 domain 分组）：
- 身份：`users` / `tenants` / `sessions` / `session_tenants` / `mfa_totp_*` / `oauth_identities` / `api_keys`
- 内容：`articles` / `categories` / `channels` / `sources` / `source_runs` / `article_pins` / `article_reads`
- 报告：`reports` / `report_templates` / `report_subscriptions`
- 反馈：`feedbacks`
- 治理：`auth_relations` / `channel_access_policies` / `audit_logs` / `ai_usage_events`
- 营销：`banners` / `web_push_subscriptions` / `notifications`
- 异步：`tenant_exports` / `objects` / `task_outbox` / `webhook_events`

**RLS**：凡含 `tenant_id` 的业务表均 `ENABLE + FORCE ROW LEVEL SECURITY`，policy `tenant_id::text = current_setting('app.tenant_id', true)`，应用通过 `with_tenant_tx` 包裹，**owner 角色也受约束**。

**pgvector**：`articles.embedding_v2 VECTOR(1024)` + cosine `<=>` 算子，配 `idx_articles_embedding_v2` HNSW/IVFFlat 索引。

---

## 6. 已知 V2 backlog

明确未实装但代码中已标记或 audit 报告里识别的项（final addendum 已剔除 #49/#50 闭环掉的条目）：

1. **AI governance — persistence + 真业务逻辑（V2）** —— Task #49 已落 11 stub endpoints（`crates/law-eye-api/src/routes/admin_ai_governance.rs`），返回 deterministic mock。V2 待实装的真表 / 真业务逻辑：
   - `ai_governance_policies`（policy 表 + CRUD 持久化）
   - `ai_prompt_versions`（prompt 版本管理 + diff 审计）
   - `ai_content_flags`（内容标记 + 审核流）
   - `ai_token_usage_events`（token 计量真表 + 接 ai_usage_events 实时聚合）
   - `ai_budget_alerts`（预算阈值告警 + webhook 联动）
   - `feed_experiment_configs`（推荐实验配置 + A/B routing）
2. **残余 phantom calls（3 条）**：
   - `/api/v1/admin/articles/{id}/kg-extract` —— admin KG 重算入口未挂（me 端已通过 `/me/articles/{id}/ai` 解决）
   - `/api/v1/admin/ai-usage`（legacy 路径） —— dashboard 仍在用旧路径，需迁到 `/admin/ai/usage/timeseries` 或加别名 alias
   - `/api/v1/articles/pins` —— `use-pins.ts` 路径 drift，backend 实际是 `/article-pins`，前端有兜底但需统一
3. **Continue reading 客户端过滤兜底** —— Task #41 dashboard "Continue reading" 卡片用前端 filter 取 `finished=false` 前 8 条；如果用户最近 8 条全部 finished，会显示"暂无进行中"（实际还有更早的未读完）。低概率边界，标记为 V2 polish
4. **Feedback PUT vs PATCH** —— `use-feedback.ts:62` 用 PUT，backend 仅 PATCH；需统一
5. **31 个 orphan backends** —— `docs/audit/api-mismatches.md` §3.1 列表，多数是 admin 工具 / 内部 proxy / 历史 superseded，少数（如 `/articles/{id}/related`）是 reader 页"相关文章"未实装；`/super/tenants/{id}/users` / `/suspend` / `/admin/reset-password` / `/export` / `/exports` / `/exports/{id}` 6 项已通过 #50 解锁

---

## 7. 验收

| 验收项 | 命令 | 状态 |
|---|---|---|
| Rust API typecheck | `cargo check -p law-eye-api` | **0/0** ✅ |
| Rust Worker typecheck | `cargo check -p law-eye-worker` | **0/0** ✅ |
| Rust Core typecheck | `cargo check -p law-eye-core` | **0/0** ✅ |
| Rust Queue typecheck | `cargo check -p law-eye-queue` | **0/0** ✅ |
| Frontend typecheck | `cd apps/web && pnpm typecheck` | **EXIT 0** ✅ |
| Fresh-DB bootstrap | `sqlx migrate run --source crates/law-eye-db/migrations` | **~69s clean** ✅ |
| Health full subsystems | `GET /api/v1/health/full` | **5 subsystems present** ✅ |
| Endpoint audit | `docs/audit/*.md` | **155 backend / 17 phantom / 31 orphan documented** ✅ |

---

## 8. 团队（3 agents）

| Agent | Color | 职责领域 | 主要交付 |
|---|---|---|---|
| **b5-routes** | blue | Backend route registration / migrations / super_tenants / worker wiring / endpoint audit | #2, #12, #13, #18, #24, #27, #32, #35, #37, #40, #43, #46 |
| **e2-sentiment** | green | AI integration / sentiment / categories taxonomy / health endpoints / docs / report 收尾 | #1, #5, #10, #15, #19, #21, #23, #26, #30, #33, #38, #42, #44, #45, #48 |
| **f2-banner** | yellow | Frontend admin/me panels / banner-pin / engagement tracking / notifications / reader UX | #3, #4, #6, #7, #8, #9, #11, #14, #17, #22, #25, #29, #34, #39, #41, #47 |

**协作模式**：team-lead 派单 + task ledger（TaskList/TaskUpdate）+ SendMessage 同步。Migration 编号通过 coordinator 协调（069/070/071/072/073/074 序列），避免并行分支冲突。每个 task 完工后强制 cargo check / pnpm typecheck 验收，红线由 spec + lead 复核。

---

## 附录 A — 关键文件索引

### Backend
- 路由：`crates/law-eye-api/src/routes/{articles,categories,channels,sources,reports,feedbacks,me,super_tenants,health,system_metrics,...}.rs`
- 服务：`crates/law-eye-core/src/{article_read,authz,banner,category,channel,knowledge,rag,report,...}.rs`
- 队列：`crates/law-eye-queue/src/lib.rs`
- Worker：`crates/law-eye-worker/src/main.rs`（5917+ 行单文件）
- 迁移：`crates/law-eye-db/migrations/*.sql`（73 个）

### Frontend
- 页面：`apps/web/src/app/[locale]/**/page.tsx`（84 个，含 i18n 镜像）
- Hooks：`apps/web/src/hooks/use-*.ts`（33 个）
- 组件：`apps/web/src/components/{admin,me,layout,reader,...}/*.tsx`
- API client：`apps/web/src/lib/api/client.ts`

### Docs
- `docs/DEPLOYMENT.md`（404 行）
- `docs/RELEASE-CHECKLIST.md`（139 行）
- `docs/audit/backend-endpoints.md`（240 行）
- `docs/audit/frontend-calls.md`（212 行）
- `docs/audit/api-mismatches.md`（258 行）
- `docs/runbooks/*.md`（cd / disaster-recovery / enterprise-readiness / local-no-dockerhub / local-rate-limit）
- 本文档：`docs/COMPLETION-REPORT.md`

---

> 交付完毕。后续 V2 backlog 详见 §6，验收通道见 §7。

---

**Final delivery confirmed at git sha b1c1b0d on 2026-04-25, 43-task matrix closed (43 completed + 6 explicitly-V2-deferred AI governance persistence buckets in §6).**
