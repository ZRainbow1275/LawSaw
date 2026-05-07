# LawSaw 0425 Enterprise Rebuild — Completion Report

**日期**: 2026-05-05  
**任务目录**: `.trellis/tasks/04-25-04-25-enterprise-rebuild-rebac-panels-ai/`  
**主验收合同**: `prompts/0425/PRD-MASTER.md` + `SPEC-01..06`  
**验证环境**: Windows / Git Bash，Docker Compose 后端 `http://127.0.0.1:3001`，Docker Web `http://127.0.0.1:18849`

---

## 1. 结论

0425 收尾闭环已经完成到可交付状态：前端 lint/typecheck、Rust fmt/clippy/test、真实浏览器截图、Trellis 规范回写均已完成。当前报告严格区分三类事实：

1. **已实现并验证**：admin/user 双面板、admin shell、workspace switcher、登录后管理端可见性、用户端 `/me/feed` 可用、AI governance 页面不再是前端空壳、ReBAC/admin route 质量门禁通过。
2. **已代码修复并由测试门禁验证**：客户端/SSR 角色层级派生统一、admin shell 硬刷新后会自举真实 session/authz、用户列表 API 源码返回真实 `roles` + `role_tier`。
3. **已补齐收尾阻塞并二次批判性复验**：`/admin/ai/*` 已接入 `078_ai_governance.sql` 的 6 组持久化表，并通过 `080_feed_experiment_config_metadata.sql` 补齐 feed experiment config/rollback metadata；admin detail/new/runs/templates 路由已移除 `AdminPlaceholderPage`，且 query 参数会恢复真实抽屉、创建表单或运行队列可见状态。
4. **已补齐订阅信息源与客户端多租户 ReBAC 闭环**：`/report-subscriptions` 改为 `reports:subscribe` gate，订阅资源接入 `report_subscription` owner relation、owner-aware RLS 与审计；source list/detail/admin hot path 接入资源级 ReBAC 与 `sources:read:name/meta/full` 字段裁剪，并通过同租户 basic_user、跨租户 tenant_admin、DB RLS context 与真实 Chromium 页面验证。
5. **已完成 2026-05-05 P0-P3 细致手测矩阵复验**：真实 Docker Web 重建后，Playwright 覆盖 21 个核心 route 与 8 个订阅/source/ReBAC API 正负样例，最终 `routePass=21 routeFail=0 apiPass=8 apiFail=0`；期间修复 reading-history 500、basic source validator、basic reports 403 console 噪声、basic admin denied 可见提示，以及矩阵脚本 secure cookie 传递缺陷。
6. **已完成逐模块 CRUD 手测闭环**：真实 Docker API 重建并应用 migration 082 后，`.tmp/0425-crud-matrix/crud-matrix.mjs` 覆盖 report templates、reports、report subscriptions、sources、channels/policies、banners、categories、feedbacks、article pins、API keys、users、auth relations、AI governance、tenants read，最终 `pass=64 fail=0 skip=1`；唯一 skip 是受控跳过 tenant destructive CRUD，避免污染多租户 fixture。

---

## 2. 本轮关键修复

### 2.1 Admin shell / roleTier 自举

- `apps/web/src/lib/authz.ts` 新增共享 `deriveRoleTierFromRoles`，统一前端、SSR 与 admin user 表格的 tier 派生口径。
- `apps/web/src/hooks/use-auth.ts` 在 `refreshAuthz` 中写入 `roleTier`，避免登录成功后 Zustand store 只有 `roles`/`permissions` 却没有 tier。
- `apps/web/src/components/layout/admin-shell.tsx` 在客户端硬刷新/新 tab 场景下主动 `refreshSession()`，先显示 spinner，再根据真实 session/authz 渲染 admin chrome 或访问受限页。
- `apps/web/src/lib/auth/server.ts` 改用共享派生 helper，保持 SSR guard 与客户端 guard 一致。

### 2.2 Admin user roster truthfulness

- `crates/law-eye-api/src/routes/users.rs` 的 `GET /api/v1/users` 源码现在为每个 list row 返回真实 `roles` 和派生 `role_tier`。
- `apps/web/src/hooks/use-admin-users.ts` 接收并校验 `roles`/`role_tier`；对旧后端缺字段保持兼容，但不再把 display name 当作首要真相。
- `apps/web/src/app/[locale]/admin/users/page.tsx` 优先用真实 roles 派生列表标签，display-name suffix 仅作 fallback。


### 2.4 AI governance persistence 补齐

- `crates/law-eye-api/src/routes/admin_ai_governance.rs` 现在直接读写 `ai_governance_policies`、`ai_prompt_versions`、`ai_content_flags`、`ai_token_usage_events`、`ai_budget_alerts`、`feed_experiment_configs`。
- `/admin/ai/policies/:kind` 会按 tenant 初始化/更新真实 policy row；`publish` 会写入 prompt version、计算 SHA-256 checksum 并切换 active prompt。
- content flags、metrics、token usage、budget alerts、feed experiments 均从 migration 078/080 表读取，budget recompute 会基于本月 token usage 写入 active alert；`/admin/ai/experiments` 已修复为真实读取 `rollback_variant` 与 `config` 列，不再触发 `column "config" does not exist`。

### 2.5 Admin detail route 去占位

- `/admin/users/[id]`、`/admin/sources/[id]`、`/admin/channels/[id]`、`/admin/feedbacks/[id]`、`/admin/knowledge/[id]`、`/admin/reports/templates/[id]` 现在跳转到对应真实列表/抽屉工作流，并携带资源 ID query。
- `/admin/banners/new`、`/admin/reports/new`、`/admin/reports/runs` 现在跳转到对应真实创建/运行队列工作流入口。

### 2.6 Query-param deep link hydration

- 新增 `apps/web/src/hooks/use-admin-deep-link.ts`，统一读取 admin query 参数并在关闭抽屉/重置表单时清理对应参数，避免关闭后刷新又复开。
- `users`、`sources`、`channels`、`feedbacks`、`knowledge`、`reports/templates` 会从 `?userId=`、`?sourceId=`、`?channelId=`、`?feedbackId=`、`?entityId=`、`?templateId=` 恢复目标抽屉；`users`、`sources`、`feedbacks` 在当前列表没有该资源时会用真实 detail API 兜底。
- `banners?create=1` 会直接打开真实 `BannerForm` 创建抽屉；`reports?create=1` 会定位到模板 authoring 区；`reports?tab=runs` 会定位到真实 recent delivery queue 区。

### 2.7 报表订阅 / 信息源 ReBAC 加固

- `crates/law-eye-api/src/routes/mod.rs` 将 `/report-subscriptions` 外层 gate 从 basic tier 提升为 `reports:subscribe` permission；basic_user 真实请求返回 `403 Permission denied`。
- `crates/law-eye-api/src/routes/report_subscriptions.rs` 对 list/get/create/update/delete/trigger 增加 subscribe permission、`report_subscription` 资源级 ReBAC、owner 校验和 create/update/delete/trigger 审计；create 在同一事务内写业务行、owner relation 与 audit log。
- `crates/law-eye-core/src/report/subscription_service.rs` 所有订阅读写路径均设置 `app.user_id` 并限定 `user_id`，配合 migration 081 的 owner-aware RLS，避免同租户横向读取或跨用户更新。
- `crates/law-eye-core/src/authz.rs` 支持 `report_subscription` resource type、`report_subscriptions` tenant resolve、`create_relation_tx`、source granular read permission，以及 legacy `sources:read` 对 granular read 的兼容 implied permission。
- `crates/law-eye-api/src/routes/sources.rs` 为 source list/detail/admin run/runs/patch/delete 等 hot path 增加资源级 ReBAC；basic_user 只拿 name/url 级 payload，verified_user 拿 metadata 但隐藏 config，premium/admin 拿 full payload。
- `crates/law-eye-db/migrations/081_report_subscription_rebac_owner_rls.sql` 回填角色权限、回填 `report_subscription owner` tuple，并将 `report_subscriptions` RLS 改为 tenant + owner。
- `apps/web/src/components/reports/subscription-panel.tsx` 与 `apps/web/src/hooks/use-reports.ts` 已把用户报表页接入真实 `/api/v1/report-subscriptions` API，不渲染 mock；401/403 entitlement 隐藏面板，5xx 显示错误态。
- `Dockerfile.postgres-pgvector` 对生成的 entrypoint 做 CRLF normalization，避免 Windows checkout 下容器启动时出现 `bash\r` 类错误；`docker compose build postgres` 已复验通过。

### 2.8 P0-P3 手测矩阵追加修复

- `crates/law-eye-core/src/article_read.rs` 修复 reading-history SQL：`categories` 是全局 lookup 表，不能用不存在的 `c.tenant_id` 参与 join；`GET /api/v1/me/reading-history?limit=8&offset=0` 登录态返回 `200`。
- `apps/web/src/lib/api/types.ts` 将 source redacted payload 纳入运行时类型合同：`config` 允许 `null`，`health_status` / `render_mode` 允许后端裁剪哨兵值 `""`，避免 basic_user `/zh/sources` 误报“加载失败”。
- `apps/web/src/components/reports/subscription-panel.tsx` 与 `apps/web/src/hooks/use-reports.ts` 增加 permission-gated query：无 `reports:subscribe` 时不渲染订阅面板，也不发 `/api/v1/report-subscriptions` 请求；后端 direct API 仍对 basic_user 返回 `403`。
- `apps/web/src/components/user/me-feed-page.tsx` 在 `/zh/admin` 无权限 redirect 到 `/zh/me/feed?denied=admin` 后显示 `role="alert"` 的 `Access restricted` 提示，避免正确 redirect 但用户无可见原因。
- `.tmp/0425-manual-matrix/manual-matrix.mjs` 使用真实登录产生的 `id` session cookie 显式驱动 API matrix；原因是 Playwright `APIRequestContext` 不会在 HTTP 请求中自动发送 `Secure` cookie，但浏览器 route 手测与后端 direct API 均使用同一真实 session。

### 2.9 CRUD 手测追加修复

- `crates/law-eye-api/src/routes/sources.rs` 修复 admin source PATCH SQL：DB 列名是 `sources.type`，Rust model 字段才是 `source_type`；原 SQL `source_type = COALESCE(...)` 会触发 `500 column "source_type" does not exist`。
- `crates/law-eye-db/migrations/082_channel_access_policies_channels_fk_alignment.sql` 将 `channel_access_policies.channel_id` 的 FK 从旧 `categories(id)` 漂移修正为 `channels(id)`，并把唯一性从 `(tenant_id, channel_id)` 调整为 `(tenant_id, channel_id, subject_type, subject_key)`，使同一 channel 可拥有多 subject policy。
- `.tmp/0425-crud-matrix/crud-matrix.mjs` 校准真实 API 合同：部分 admin create 端点返回 `200`，report template update 返回新 active version id，feedback update 必须带 `If-Match`，subscription trigger 必须在 active 状态下执行。

### 2.3 0425 文档同步

- `.trellis/spec/frontend/index.md` 已加入 0425 frontend overlay：`PRD-MASTER`、`SPEC-02`、`SPEC-04`、`SPEC-06`、AdminShell/session bootstrap、workspace switcher、真实浏览器验收。
- `.trellis/spec/backend/index.md` 已加入 0425 backend overlay：`SPEC-01`、`SPEC-03`、`SPEC-05`、tier/permission 双 guard、AI governance 持久化真实性、Rust 门禁。

---

## 3. 真实运行与截图证据

### 3.1 运行事实

- Docker Compose backend health: `GET http://127.0.0.1:3001/api/v1/health` 返回 `200 OK`，`postgres.ok=true`、`redis.ok=true`、`object_storage.available=true`、`ai.available=true`；当前环境 AI probe 为 `degraded_reason=check_timeout`，不影响本轮 ReBAC/订阅验收。
- 当前 Docker Web: `POSTGRES_HOST_PORT=55435 docker compose ps` 显示 `lawsaw-api-1`、`lawsaw-postgres-1`、`lawsaw-web-1` 均为 `healthy`，Web 暴露 `127.0.0.1:18849->8849`，API 暴露 `127.0.0.1:3001->3001`。
- 真实登录账号: `admin@qa.lawsaw.local` / `Admin@Lawsaw2026`，`POST /api/v1/auth/login` 返回 `200 OK`，`GET /api/v1/auth/me` 返回 `200 OK`，用户为 `QA Admin`。
- CSRF 事实: `18850` 不在后端允许源中，auth write 会返回 `CSRF_FAILED`；切换到已允许的 `http://127.0.0.1:8849` 后登录链路通过。
- Migration runtime 事实: `_sqlx_migrations` 最新版本为 `082_channel_access_policies_channels_fk_alignment` 且 `success=true`；`channel_access_policies_channel_id_fkey` 当前指向 `channels(id)`，`idx_channel_access_policies_subject_unique` 已存在；`080_feed_experiment_config_metadata` 仍存在，`feed_experiment_configs.config` / `rollback_variant` 已存在且 `NOT NULL`。
- AI governance API smoke: 登录态浏览器内 `fetch` 验证 `/api/v1/admin/ai/policies/article_pipeline`、`/api/v1/admin/ai/experiments`、`/api/v1/admin/ai/metrics`、`/api/v1/admin/ai/token-usage?limit=5&offset=0`、`/api/v1/admin/ai/budget-alerts?limit=5&offset=0` 均返回 `200 OK`。
- Report subscription API smoke: 未登录 `GET /api/v1/report-subscriptions` 返回 `401`；admin list 返回 `200` 且包含真实订阅 `f67248d2-fb08-4197-bbc6-3b04946ef9d7`；basic_user `customer@qa.lawsaw.local` 返回 `403`；跨租户 `user@qa.lawsaw.local` list 返回空、detail 返回 `404`、`authz/check` 返回 `allow=false` 与 `tenant:deny`。
- Report subscription owner/audit smoke: `authz/check?resource_type=report_subscription&permission=reports:subscribe` 返回 `allow=true`、`matched_relation=owner`；DB 设置 `app.tenant_id` + `app.user_id` 后可查到 `report_subscription owner` tuple，以及 `report_subscriptions.create/update/trigger` 三条 audit log。
- Source ReBAC smoke: admin `GET /api/v1/sources?limit=5&offset=0` 与 source detail 返回 full payload；basic_user 同一路径返回 `200` 但 `config=null`、`priority=0`、`health_status=""`，证明客户端多租户/role-tier 字段裁剪生效。
- 2026-05-05 manual matrix: `node .tmp/0425-manual-matrix/manual-matrix.mjs` 覆盖 21 个核心 route 与 8 个 API 样例，最终 `routePass=21 routeFail=0 apiPass=8 apiFail=0`；结果文件为 `.tmp/0425-manual-matrix/manual-matrix-result.json`。
- 2026-05-05 CRUD matrix: `node .tmp/0425-crud-matrix/crud-matrix.mjs` 覆盖 64 个真实 CRUD/正负校验动作，最终 `pass=64 fail=0 skip=1`；结果文件为 `.tmp/0425-crud-matrix/crud-matrix-result.json`，`generatedAt=2026-05-05T03:58:02.307Z`。

### 3.2 截图文件

| 页面 | 路径 | 验证点 |
|---|---|---|
| Login | `tmp/0425-screenshots/0425-login-2026-05-04T06-42-54-336Z.png` | 登录页真实渲染，无白屏 |
| Admin dashboard | `tmp/0425-screenshots/0425-admin-dashboard-2026-05-04T06-50-49-372Z.png` | admin shell、workspace switcher、admin tiles、AI gateway health |
| User feed | `tmp/0425-screenshots/0425-user-feed-2026-05-04T06-51-17-459Z.png` | 管理员仍可进入用户工作区，`/me/feed` 有真实 feed 数据 |
| AI governance | `tmp/0425-screenshots/0425-ai-governance-after-080-2026-05-04T09-05-44-746Z.png` | AI governance 页面走真实 hook/API，显示模型策略、默认模型、token/alert 指标和真实 empty state |
| Admin relations | `tmp/0425-screenshots/0425-admin-relations-2026-05-04T06-57-23-488Z.png` | 富管理页在 admin shell 中渲染，ReBAC check/create/delete UI 可见 |
| Reports subscriptions | `.tmp/0425-rebac-e2e/reports-subscription-panel-admin.png` | 真实 Chromium 登录 admin 后打开 `/zh/reports`，`/api/v1/report-subscriptions` 返回 `200`，页面显示真实订阅名 |
| Manual matrix screenshots | `.tmp/0425-manual-matrix/*.png` | 2026-05-05 矩阵重跑生成：21 个 route 截图覆盖 admin/user/basic/cross-tenant 视角 |

说明：`tmp/0425-screenshots/0425-admin-users-2026-05-04T06-52-09-092Z.png` 是修复用户列表 roles enrichment 前的中间截图，不作为最终验收截图引用。

---

## 4. 质量门禁

| 命令 | 结果 | 备注 |
|---|---:|---|
| `pnpm -C apps/web lint` | ✅ PASS | Biome checked 358 files |
| `pnpm -C apps/web typecheck` | ✅ PASS | `tsc --noEmit --incremental false` |
| Playwright admin deep-link hand test | ✅ PASS | 真实登录 `admin@qa.lawsaw.local`，真实 API ID，断言 URL + 可见抽屉/表单/运行队列 |
| Playwright report-template deep-link hand test | ✅ PASS | 真实 API 创建临时模板 `7f39c71b-ce28-42e2-97fc-575183da7430`，验证 `?templateId=` 打开富编辑抽屉后删除清理 |
| `pnpm -C apps/web exec vitest run src/lib/authz.test.ts src/components/auth/role-tier-guard.test.ts` | ✅ PASS | 2 files / 9 tests |
| `cargo fmt -- --check` | ✅ PASS | Rust formatting clean |
| `cargo clippy --workspace -- -D warnings` | ✅ PASS | Finished dev profile in 20.02s |
| `cargo test --workspace --jobs 1` | ✅ PASS | 标准并发首轮触发 Windows rustc 内存分配失败；串行复跑后 workspace tests/doc-tests 全部通过，ignored network/doc tests 保持设计性忽略 |
| `cargo check -p law-eye-core -p law-eye-api` | ✅ PASS | ReBAC/订阅 API 目标包 check 通过 |
| `cargo clippy -p law-eye-core -p law-eye-api -- -D warnings` | ✅ PASS | ReBAC/订阅 API 目标包 clippy 通过 |
| `cargo test -p law-eye-core authz::tests -- --nocapture` | ✅ PASS | 3 tests，覆盖 report_subscription resource type、owner relation、legacy source granular read |
| `cargo test -p law-eye-api report_subscriptions -- --nocapture` | ✅ PASS | 3 tests，覆盖订阅名称校验、period window、audit safe fields |
| `cargo test -p law-eye-api routes::sources::tests -- --nocapture` | ✅ PASS | 9 tests，覆盖 source tier 字段裁剪与 URL validation |
| `cargo test -p law-eye-api middleware::authz::tests -- --nocapture` | ✅ PASS | 7 tests，覆盖 role-tier ladder 与 middleware gate |
| `pnpm -C apps/web exec vitest run src/lib/api/client.test.ts src/lib/authz.test.ts src/components/auth/permission-guard.test.ts src/components/auth/role-tier-guard.test.ts` | ✅ PASS | 4 files / 20 tests |
| `node apps/web/node_modules/@biomejs/biome/bin/biome check apps/web/src/app/reports/page.tsx apps/web/src/components/reports/subscription-panel.tsx apps/web/src/hooks/use-reports.ts` | ✅ PASS | 3 touched frontend files |
| `git diff --check -- <targeted files>` | ✅ PASS | 仅剩 Git for Windows LF→CRLF 提示，无 whitespace error |
| `POSTGRES_HOST_PORT=55435 docker compose build postgres` | ✅ PASS | pgvector postgres image cache build 通过，entrypoint CRLF normalization layer 命中 |
| `BUILDKIT_PROGRESS=plain POSTGRES_HOST_PORT=55435 docker compose build web && POSTGRES_HOST_PORT=55435 docker compose up -d web` | ✅ PASS | Web image 重建并重启，`lawsaw-web-1` healthy |
| `node .tmp/0425-manual-matrix/manual-matrix.mjs` | ✅ PASS | `routePass=21 routeFail=0 apiPass=8 apiFail=0` |
| `cargo fmt --all -- --check` | ✅ PASS | 2026-05-05 本轮追加修复后复验 |
| `cargo check -p law-eye-core -p law-eye-api` | ✅ PASS | 2026-05-05 本轮追加修复后复验 |
| `cargo test -p law-eye-core article_read -- --nocapture` | ✅ PASS | 编译通过，当前 filter 下 0 tests matched |
| `pnpm -C apps/web typecheck` | ✅ PASS | 2026-05-05 本轮追加修复后复验 |
| `pnpm -C apps/web lint` | ✅ PASS | 2026-05-05 本轮追加修复后复验 |
| `node apps/web/node_modules/@biomejs/biome/bin/biome check apps/web/src/components/reports/subscription-panel.tsx apps/web/src/hooks/use-reports.ts apps/web/src/lib/api/types.ts apps/web/src/components/user/me-feed-page.tsx .tmp/0425-manual-matrix/manual-matrix.mjs` | ✅ PASS | 本轮触碰前端文件与手测脚本格式/静态检查 |
| `BUILDKIT_PROGRESS=plain POSTGRES_HOST_PORT=55435 docker compose build api && POSTGRES_HOST_PORT=55435 docker compose up -d api` | ✅ PASS | API image 重建并启动 healthy，启动日志显示 migration 082 已执行 |
| `node .tmp/0425-crud-matrix/crud-matrix.mjs` | ✅ PASS | `pass=64 fail=0 skip=1`，skip 仅为 tenant destructive CRUD 受控跳过 |
| `cargo check -p law-eye-db -p law-eye-api -p law-eye-core` | ✅ PASS | migration 082 / source PATCH / channel policy schema 目标包 check 通过 |
| `cargo test -p law-eye-core channel -- --nocapture` | ✅ PASS | 1 test，覆盖 channel visibility tier matrix |
| `cargo test -p law-eye-core source -- --nocapture` | ✅ PASS | 2 tests，覆盖 source granular permission 与 report_subscription resource type |
| `git diff --check -- crates/law-eye-api/src/routes/sources.rs crates/law-eye-db/src/lib.rs crates/law-eye-db/migrations/082_channel_access_policies_channels_fk_alignment.sql .tmp/0425-crud-matrix/crud-matrix.mjs` | ✅ PASS | 仅 Git for Windows LF→CRLF 提示，无 whitespace error |

---

## 5. 已满足的 0425 验收项

- `/zh/login`、`/zh/admin`、`/zh/me/feed`、`/zh/admin/ai-governance`、`/zh/admin/relations` 已用真实浏览器打开并截图。
- 管理员登录后进入 admin shell，左侧 admin navigation、顶部 admin topbar、workspace switcher 与当前用户 tier badge 可见。
- 管理员可进入 `/me/feed` 用户工作区；用户工作区展示真实 feed、频道、分类与角色信息。
- Admin shell 不再依赖一次性内存态：硬刷新/新 tab 会触发真实 session/authz bootstrap。
- 前端与 SSR guard 使用同一角色层级派生规则；`admin` alias 归入 `tenant_admin`，`editor` alias 归入 `verified_user`。
- `GET /api/v1/users` 源码层补齐 list row 的 `roles` 与 `role_tier`，避免 admin roster 用猜测标签。
- `.trellis/spec/frontend/index.md` 与 `.trellis/spec/backend/index.md` 已引用 0425 标准并记录本轮关键约束。
- 9 个 admin detail/new/runs/templates 去占位路由已用 Playwright 登录态批量验证“最终 URL + 可见目标 UI 状态”：`/admin/banners?create=1` 打开横幅创建抽屉，`/admin/reports?create=1` 定位模板 authoring 区，`/admin/reports?tab=runs` 定位运行队列，`?userId=`、`?sourceId=`、`?channelId=`、`?feedbackId=`、`?templateId=`、`?entityId=` 打开对应真实抽屉。
- 本轮真实 ID 手测样例：`customer@qa.lawsaw.local` 用户详情、`QA Seed Source` 来源详情、`执法案例` 频道详情、`Smoke test` 反馈回复、`民法典` 知识实体详情；报告模板因当前环境无现存模板，已通过真实 API 创建临时模板验证后删除清理。
- `/api/v1/report-subscriptions` 订阅链路已由真实 API 正负对照覆盖：未登录 `401`、admin `200`、basic_user `403`、跨租户 tenant_admin 空列表/detail `404`/authz deny。
- `report_subscription` ReBAC owner tuple 与 `report_subscriptions.create/update/trigger` audit log 已在 DB RLS context 下查询确认。
- `/zh/reports` 已渲染真实 `SubscriptionPanel`，Chromium 截图显示订阅名 `Codex verified subscription ...`，无 unauthorized/forbidden 文案泄漏。
- `/api/v1/sources` list/detail 已按 role tier 裁剪字段；basic_user 只能看到 name/url 级信息，admin 可见 full payload。
- P0-P3 手测矩阵已覆盖 `/zh/dashboard`、`/zh/reports`、`/zh/sources`、`/zh/admin` denied redirect、订阅 list/detail/authz/source redaction API，未发现剩余 P0-P3 失败。
- CRUD 手测矩阵已逐项覆盖 create/read/update/delete 或等价 lifecycle cleanup：source admin patch、subscription trigger、channel policy create/read/update/delete、banner archive、category reorder/delete、feedback optimistic update、article pin upsert/delete、API key revoke/delete、user display name restore、auth relation create/check/delete、AI governance policy/prompt/experiment 读写均返回预期状态码。

---

## 6. 完成闭环与当前边界

### 6.1 AI governance persistence 已接入

`crates/law-eye-api/src/routes/admin_ai_governance.rs` 已移除旧空响应路径，11 个 `/admin/ai/*` handler 均有 migration 078/080 表级读写或聚合逻辑。当前边界是：`ai_content_flags` 与 `ai_token_usage_events` 的 migration 078 字段少于前端响应模型，因此 handler 会从 `model_output` / governance event 字段映射出前端需要的语义字段；feed experiment 的 `config` 与 `rollback_variant` 已通过 080 新迁移真实持久化。这属于真实持久化映射，不是伪造数据。

### 6.2 Admin detail/new/runs routes 已退出占位页

`apps/web/src/app/[locale]/admin/**/page.tsx` 下不再存在 `AdminPlaceholderPage` 使用点。detail/new/runs/templates 路由现在保留可访问 URL，同时由目标页面自身根据 query 参数恢复可见抽屉、创建表单或运行队列位置，避免只完成 URL 跳转却没有功能状态。

### 6.3 API 最新源码已由本轮验证覆盖

本轮新增的 AI governance route、080 feed experiment metadata migration 与用户列表 roles enrichment 均已进入重建后的 `lawsaw-api` image；`GET /health`、migration 80 schema check、AI governance 登录态 API smoke 和真实浏览器页面均已复验通过。最终交付不再依赖旧 compose image 截图。

### 6.4 报表订阅与 source ReBAC 已进入可验收状态

订阅路径现在是“permission gate → owner relation → owner-aware RLS → audit log → UI panel”的垂直切片，不再是 basic tier 下的同租户可见列表。source 路径则保留 `sources:read` 作为兼容 baseline，同时在资源级 authz 中按 role tier 要求 granular read permission，并在 API response 层做字段裁剪，避免客户端拿到超过其 tier 的 source config/health/internal metadata。

---

## 7. 建议后续优先级

1. **P1** — 将本轮 Playwright deep-link 与 `/report-subscriptions`/source ReBAC 正负对照固化为 repo-local 可重复脚本/CI smoke，继续降低人工验收成本。
2. **P2** — 继续增强 AI governance 编辑 UI（prompt publish、budget config、experiment authoring），当前读写 API 与持久化底座已完成。
3. **P2** — 如后续产品需要分页外资源深链路，优先补齐更多按 ID fetch 的页面级兜底，保持 URL 可分享性。

---

## 8. 当前交付判断

本轮 0425 收尾任务可进入 review-ready：主质量门禁、真实浏览器证据、重建后的 API/Web image、migration 082 schema、AI governance persistence、admin detail route 去占位、query 参数恢复可见 UI 状态、报表订阅 owner ReBAC/RLS/audit、source role-tier 字段裁剪、reading-history SQL 修复、channel access policy FK 漂移修复、basic_user 降级 UX、2026-05-05 P0-P3 手测矩阵与逐模块 CRUD 矩阵均已形成闭环。下一轮建议聚焦把 `.tmp/0425-manual-matrix/manual-matrix.mjs` / `.tmp/0425-crud-matrix/crud-matrix.mjs` 提炼为 repo-local CI smoke、更多分页外资源深链路兜底，以及 AI governance 编辑 UI 增强。
