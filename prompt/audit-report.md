# LawSaw（法眼 / Law Eye）深度审计报告（v2.1）

**审计日期**：2026-01-25  
**审计对象**：Rust（Axum）后端 + Next.js（React）前端 + Docker 运行栈（PostgreSQL/Redis/n8n）  
**审计目标**：面向大型企业 10+ 年商用（安全、可靠、可演进、可运维、可审计、可合规）  
**审计基线**：Git `d4318a0`（已将工作区收敛为可追溯提交；见任务 OPS-101）  
**审计工具**：ACE-Tools（代码定位/关联分析）+ Playwright MCP（真实 UI 交互验证）+ Docker Compose（真实服务联调）

---

## 0. 审计方法（必须“先验证再判断”）

### 0.1 运行环境与服务拓扑
- 后端：`docker compose up -d --build` 启动 `postgres(5435) + redis(6380) + api(3001) + worker + n8n(5678)`
- 前端：`apps/web` 以 Next Dev 启动（端口 `8849`）

### 0.2 Playwright 实测（关键用户流）
已通过 Playwright 真实操作验证（非 mock）：
1) 注册 → 自动登录 → Dashboard 渲染统计与文章列表  
2) 文章列表 → 文章详情页渲染（摘要/作者/阅读设置/外链）  
3) 搜索页关键词检索返回结果  
4) 信息源列表渲染 + 触发抓取（并在 worker 日志确认抓取与入库成功）  

截图产物（本机下载目录）：
- `C:\\Users\\HP\\Downloads\\articles-page-2026-01-24T20-36-06-893Z.png`
- `C:\\Users\\HP\\Downloads\\dashboard-mobile-2026-01-24T20-38-24-415Z.png`

---

## 1. 执行摘要（结论先行）

### 1.1 已达到/接近可用的部分（✅）
- 前后端已真实联通：页面数据来自后端 API，注册/登录/浏览/搜索可跑通。
- 采集链路可跑通：RSS 抓取 → worker 入库成功（在 `docker logs law-eye-worker` 可见）。
- API 已做版本化路由：`/api/v1/*`（非 2025 报告所述的“缺少版本”）。

### 1.2 阻止“企业级上线”的关键缺陷（🔴）
1) **安全边界失效**：大量管理/写操作 API 当前未强制认证/授权（典型：`/api/v1/sources` 创建源、`/fetch` 触发抓取可匿名调用）。  
2) **敏感信息泄露风险**：API 启动日志直接打印 `Database URL` / `Redis URL`，可能包含密码与内网信息（生产事故级）。  
3) **API 契约不一致**：前端已调用的部分能力，后端缺失或参数不支持（如 `DELETE /api/v1/articles/{id}`、文章过滤参数）。  
4) **可运维性缺口**：信息源 `last_fetch/last_error` 未更新，导致监控与排障失真。  

### 1.3 不属于“一次代码修复即可完成”的企业能力缺口（⚠️ 需配套基础设施）
KMS/Secrets、全链路 TLS/mTLS、租户隔离（tenant_id + RLS/物理隔离）、审计日志不可篡改（hash 链/append-only/WORM）、发布体系（CI/CD/灰度/回滚）、对象存储等 —— 需要代码 + 基础设施联合落地，本报告给出可执行方案与落地路线。

---

## 2. 40 项审查（逐项结论 + 证据 + 方案）

> 记号：✅ 已满足（可上线前提的部分满足） / ⚠️ 部分满足（需补齐） / ❌ 缺失（需设计 + 实现）

### 2.1 前端功能设计实现（重中之重）— ✅/⚠️
- 证据：Playwright 实测注册/登录/数据看板/文章列表/详情/搜索可跑通。
- 风险：错误边界（Next `error.tsx`）与空态/异常态覆盖不足；部分交互存在“只能按 Enter 才触发”的呆瓜体验点（搜索）。
- 方案：补齐全局 `error.tsx`/`not-found.tsx`/关键页面 `loading.tsx`；统一表单交互（按钮 submit + Enter 双通道）。

### 2.2 后端连通设计 — ✅/⚠️
- 证据：`/health` 200；worker 抓取并入库成功。
- 风险：认证/授权未形成闭环，导致“连通但不安全”。
- 方案：将 `/api/v1/*` 默认纳入鉴权（除 `/auth/*`、`/health`、（可选）公开只读接口）。

### 2.3 路由与导航设计 — ✅
- 证据：前端 Sidebar 导航覆盖主要模块；后端 API 路由版本化：`crates/law-eye-api/src/routes/mod.rs`。

### 2.4 移动端适配 — ⚠️
- 证据：Playwright 以 iPhone 13 视口截图验证可用。
- 风险：尚未做系统化断点审计（表格/弹窗/侧边栏/文章阅读器）。
- 方案：补齐移动端 E2E 关键路径 + CSS 断点回归（至少 Dashboard/Articles/Reader）。

### 2.5 离线支持与 PWA — ❌
- 证据：`apps/web` 无 manifest/service worker；`apps/web/public` 为空。
- 方案：基于 Next App Router 增加 `manifest` + `service worker`（缓存策略：静态资源 cache-first，API stale-while-revalidate；敏感接口不缓存）。

### 2.6 状态同步与冲突解决 — ⚠️
- 证据：前端采用 React Query（缓存）+ Zustand（auth/阅读设置）。
- 风险：缺少乐观更新/并发冲突策略（ETag/版本号/If-Match）；后端缺少对象版本字段。
- 方案：后端为可变资源加 `version` 或 `updated_at` 并支持 `If-Unmodified-Since/If-Match`；前端在写操作启用冲突提示与重试。

### 2.7 运维功能 — ⚠️
- 证据：Docker Compose + healthcheck 已具备基础可用性。
- 风险：缺少指标（metrics）、告警、备份、可观测追踪（trace/log correlation）。
- 方案：Prometheus 指标端点 + 结构化日志 + request-id 全链路贯通；制定备份/演练流程（RPO/RTO）。

### 2.8 业务流完整 — ✅/⚠️
- 证据：采集→入库→前端展示已跑通。
- 风险：发布/归档/批处理/编辑等 CMS 能力不完整或无权限管控。

### 2.9 服务设置合理 — ⚠️
- 风险：API 启动日志打印敏感 URL（见任务 SEC-101）。
- 方案：日志脱敏与分级；生产默认 JSON 日志。

### 2.10 代码结构审查 — ✅/⚠️
- 证据：Rust workspace 多 crate；前端 feature 分层清晰。
- 风险：后端中间件（rate limit / auth guard）存在但未被路由使用（“写了但没接上”）。

### 2.11 性能 — ⚠️
- 风险：文章列表 count/分页/过滤未优化；缺少索引审计与慢查询观测。
- 方案：分页查询使用稳定排序字段 + 必要索引；增加查询超时与 tracing span。

### 2.12 可访问 — ⚠️
- 证据：注册表单 `label for/id` 已正确绑定（Playwright 抽查）。
- 风险：侧边栏键盘导航、焦点管理、对比度未系统验证。

### 2.13 依赖项健康度 — ⚠️
- 风险：缺少自动化依赖漏洞扫描（cargo audit / pnpm audit / GitHub Dependabot）。
- 方案：CI 接入（见 OPS-201）。

### 2.14 数据库设计 — ✅/⚠️
- 证据：`crates/law-eye-db/migrations/*` 存在；pgvector 已引入。
- 风险：租户隔离/字段加密/审计不可篡改未设计落地。

### 2.15 API 设计完备性/一致性（认证、授权、格式、错误码）— ⚠️/🔴
- 证据：`/api/v1/*` 路由存在；但各路由错误返回形态不一致（StatusCode / Json(ErrorResponse) 混用）。
- 风险：无统一错误码/trace id；安全边界未收口（见 SEC-102）。
- 方案：统一响应 envelope（`{ ok, data, error, request_id }`）+ 错误码表 + OpenAPI 暴露。

### 2.16 错误处理与日志 — 🔴/⚠️
- 证据：`crates/law-eye-api/src/main.rs` 打印 DB/Redis URL。
- 风险：敏感信息泄露；错误上下文缺 request_id。
- 方案：日志脱敏 + `x-request-id` 回传 + 错误响应携带 request_id。

### 2.17 业务逻辑完整性 — ⚠️
- 风险：文章状态、发布/归档权限、统计口径（high_risk_count）仍有 TODO。

### 2.18 国际化/本地化 — ⚠️
- 现状：产品以中文为主可接受；但缺少 i18n 框架与 locale 策略（企业出海/多语言需求会阻断）。

### 2.19 代码可维护性 — ⚠️
- 风险：缺少测试与契约校验；工作区存在大量未提交变更导致“不可追溯”（见 OPS-101）。

### 2.20 身份颗粒度对齐（登录/注册等）— ✅/⚠️
- 证据：注册后自动登录；`/api/v1/auth/me` 可用。
- 风险：前端 auth store 使用 localStorage 持久化用户对象（PII）（见 FE-101）。

### 2.21 并发异步消息队列 — ⚠️
- 证据：Redis 队列 + worker 拉取处理。
- 风险：缺少 DLQ、重试/退避、超时上限、幂等键（见 QUEUE-101/IDEMP-101）。

### 2.22 数据一致性完整性同步性 — ⚠️
- 风险：缺少乐观锁；批量操作未明确事务边界。

### 2.23 通讯延迟与同步链路 — ⚠️
- 风险：前端 API client 未做统一超时/取消；后端对外部抓取未统一超时策略。

### 2.24 可靠发布 — ❌
- 证据：当前无 CI/CD；无灰度/回滚机制；无迁移演练脚本。

### 2.25 数据同步幂等 — ⚠️
- 证据：重复抓取会“Saved 0 articles”（一定程度去重生效）。
- 风险：未显式幂等键/去重策略可配置；任务重复投递无全局去重。

### 2.26 顺序性与“同一对象的事件” — ⚠️
- 风险：缺少事件版本号/序列号；审计日志与业务变更未强绑定。

### 2.27 跨模块一致性 — ⚠️
- 风险：前端 types 与后端 models/response 可能漂移；缺少契约测试（见 CONSIST-101）。

### 2.28 结构化收缩（Feature flags/渐进发布）— ❌
- 方案：引入 feature flags（后端基于 config、前端基于 build-time + runtime flags）。

### 2.29 对象存储 + 元数据表 — ❌
- 方案：引入对象存储抽象（S3/MinIO）+ metadata 表（含 checksum、content-type、ACL、tenant_id）。

### 2.30 在线预览异步化 — ⚠️
- 现状：文章阅读器存在；通用文档/附件预览未实现。

### 2.31 版本管理 — ⚠️
- 证据：API 已有 `/api/v1`；但缺少弃用策略与兼容窗口声明。

### 2.32 全链路 HTTPS/TLS；内部服务 mTLS — ⚠️/❌
- 现状：本地 docker 为纯 HTTP。
- 方案：生产用反向代理终止 TLS；内部 mTLS 需 service mesh/sidecar（或 Rustls + 双向证书验证）。

### 2.33 秘钥与配置（KMS/Secrets）— ⚠️
- 现状：使用 env 变量；docker-compose 强制要求 `POSTGRES_PASSWORD`、`JWT_SECRET`（✅）。
- 缺口：无集中化 secrets（Vault/KMS）；无密钥轮换策略。

### 2.34 租户隔离 — ❌
- 方案：最少 tenant_id 逻辑隔离 + RLS；关键客户支持物理隔离（独立库/独立集群）。

### 2.35 数据加密（静态/字段）— ⚠️/❌
- 方案：静态加密（云盘/存储层）+ 字段级加密（KMS envelope）+ 脱敏展示。

### 2.36 审计日志不可篡改（append-only/hash 链/异地备份）— ❌
- 方案：审计表 append-only + hash 链字段（prev_hash/hash）+ 定期异地备份/WORM。

### 2.37 权限变更审计 — ⚠️
- 风险：角色分配虽存在，但缺少审计写入与可查询面。

### 2.38 操作审计（关键单据链路可还原）— ⚠️
- 方案：为关键资源引入“事件溯源式审计”或至少操作日志（who/when/what/why）。

### 2.39 可预测性与故障处理 — ⚠️
- 方案：外部依赖超时/重试/熔断；worker 失败重放；告警与演练。

### 2.40 集成与扩展（Gateway/Webhook/沙箱/权限边界）— ⚠️
- 现状：n8n 已集成雏形；API keys 已有基础。
- 缺口：Webhook 签名校验、沙箱租户、API Gateway 策略、配额与计费。

---

## 3. 关键事实修正（对 2025-01-19 旧报告的纠偏）

以下条目在本次“实际跑通 + 代码核查”后判定为**不成立/已具备**（将从任务清单中移除或标注为已完成）：
- `OPS-001`：Dockerfile.api / Dockerfile.worker **实际存在**（根目录已存在）。
- `DB-001`：`crates/law-eye-db/migrations/*` **实际存在**。
- `ARCH-003`：请求 ID **已实现并在 /health 响应头可见**（`x-request-id`）。
- `FE-003`：文章详情页 **已实现且 Playwright 实测可用**。
- `SEC-005`：docker-compose 中 `JWT_SECRET` **无默认值，缺失会直接报错**。

---

## 4. 修复任务清单（Ralph Loop 执行入口）

> 原则：按 CRITICAL → HIGH → MEDIUM → LOW 顺序；每个任务必须：修复 → 验证（本地/容器）→ 更新本报告勾选 → 提交。

### CRITICAL（必须修复）
- [x] [OPS-101] 工作区存在大量未提交变更，需收敛为可追溯提交（否则审计不可复现）- `git status` ✅ 已在 `7e9e604` 收敛并提交
- [x] [SEC-101] API 启动日志泄露敏感信息（DB/Redis URL）- `crates/law-eye-api/src/main.rs` ✅ 已对 URL password 进行脱敏（REDACTED）
- [x] [SEC-102] 管理/写接口未强制鉴权与授权（Sources/Articles/AI/Search 等） ✅ `/api/v1/*` 默认鉴权（仅 `/api/v1/auth/*` 例外），并按 `roles.permissions` 做授权（`articles:read/articles:publish/articles:write/sources:read/categories:read/*`）；已在 docker `api:3001` 实测：未登录 401，viewer 登录后写接口 403 - `crates/law-eye-api/src/routes/mod.rs`、`crates/law-eye-api/src/routes/{articles,categories,sources,ai,search}.rs`
- [x] [SEC-103] 登录/注册缺少 Rate Limit（代码存在但未接入） ✅ 已在 `/api/v1/auth/login`、`/api/v1/auth/register` 接入 `RateLimitLayer`，并确保 `ConnectInfo<SocketAddr>` 可用；docker `api:3001` 实测：登录 1 分钟第 6 次请求返回 429（含 `Retry-After` 与 `retry_after_seconds`），注册 1 小时第 4 次请求返回 429 - `crates/law-eye-api/src/routes/auth.rs`、`crates/law-eye-api/src/main.rs`、`crates/law-eye-api/src/middleware/rate_limit.rs`
- [x] [SEC-104] Cookie Session 模式缺少 CSRF 保护策略（除 SameSite 外） ✅ 新增 `CsrfLayer`：对非安全方法（POST/PATCH/DELETE 等）在“auth 路由”或“请求携带 Cookie”时校验 `Origin/Referer` 必须属于 allowlist；docker `api:3001` 实测：`/api/v1/auth/login` allowlist Origin→401（进入业务），evil Origin→403（CSRF 拦截）；`/api/v1/sources/1/fetch` 携带 Cookie+evil Origin→403 - `crates/law-eye-api/src/middleware/csrf.rs`、`crates/law-eye-api/src/main.rs`
- [x] [API-101] 前后端契约不一致：前端调用 DELETE/过滤参数，但后端缺失 ✅ 补齐 `GET /api/v1/articles` 的 `category_id/status` 过滤（含 total 计数），新增 `DELETE /api/v1/articles/{id}`（需 `articles:write`）；docker `api:3001` 实测：`category_id=00000000-0000-0000-0000-000000000000` 返回 `total=0`，`status=invalid` 返回 400，DELETE 路由存在且 viewer 返回 403 - `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/articles.rs`
- [x] [BIZ-201] 留言反馈功能“前端存在但后端缺失”（/api/v1/feedbacks* 404）✅ 已补齐 DB 表 + Core Service + API 路由 + OpenAPI，并在前端接入运行时契约校验，完成“提交→查询我的反馈”闭环。Playwright 实测：登录后进入 `/feedback`，选择“问题反馈”提交后在“我的反馈”列表立即可见（截图：`C:\\Users\\HP\\Downloads\\feedback-submitted-biz201-2026-01-25T15-04-09-648Z.png`）；并在 Postgres 验证 `feedbacks` 表成功写入 - `crates/law-eye-db/migrations/005_feedbacks.sql`、`crates/law-eye-db/src/models.rs`、`crates/law-eye-core/src/feedback.rs`、`crates/law-eye-api/src/routes/feedbacks.rs`、`crates/law-eye-api/src/routes/mod.rs`、`crates/law-eye-api/src/openapi.rs`、`apps/web/src/hooks/use-feedback.ts`、`apps/web/src/lib/api/types.ts`
- [x] [AUDIT-201] 权限变更审计已落地（谁给谁加/减了什么权限、何时生效）✅ 已在 `PATCH /api/v1/users/{id}/roles` 以事务方式完成“角色变更 + 审计写入”闭环：写入 `audit_logs`（`action=users.roles.update`，`resource=users`，`resource_id=目标用户`），记录 `old_value/new_value` 角色快照 + requested add/remove、actor（`user_id`）、IP/User-Agent；并修复 `INET` 字段写入/读取类型不匹配问题（插入用 `$7::inet`，读取用 `ip_address::text AS ip_address`）- `crates/law-eye-api/src/state.rs`、`crates/law-eye-api/src/routes/users.rs`、`crates/law-eye-core/src/user.rs`、`crates/law-eye-core/src/audit.rs`；docker 实测：对用户新增 `editor` 后，Postgres `audit_logs` 产生对应记录且 `old_value.roles -> new_value.roles` 正确
- [x] [AI-201] AI 队列任务类型不完整导致真实任务失败（会重试并最终进入 DLQ） ✅ 已实现 `AiTaskType::{Classify,Summarize,RiskAssess,ExtractTags,Embed,Full}` 全分支处理：Full 并行分类/摘要/风险/标签，写回 `articles.summary/risk_score/category_id/tags/keywords/ai_metadata/ai_processed_at`，并将 embedding 拆为独立 `Embed` 任务落地 `article_chunks`（先删旧 chunks 再分块插入 `embedding`）；同时移除错误的 `status='ai_processed'` 写入，改用 `ai_metadata.tasks.*` + `ai_processed_at` 作为处理语义；API 侧补齐“AI 未配置”时返回 503（避免入队后必然失败）。编译/单测：`cargo test -p law-eye-worker -p law-eye-api -p law-eye-ai -p law-eye-db` ✅ - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-ai/src/service.rs`、`crates/law-eye-db/src/models.rs`、`crates/law-eye-api/src/routes/ai.rs`

### HIGH（高优先级）
- [x] [DATA-101] 信息源 last_fetch/last_error 未更新（运维失真） ✅ worker 在 ingest 成功/失败后调用 `SourceService::update_last_fetch` 回写 sources 表（成功清空 last_error，失败记录错误）；docker 实测：触发 RSS 抓取后 `sources.last_fetch` 更新；构造 spider 配置解析失败后 `last_error` 写入 - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-core/src/source.rs`
- [x] [API-102] OpenAPI/Swagger 未实际暴露（虽有 utoipa 注解） ✅ 暴露 `/api-docs/openapi.json` 与 `/api-docs/swagger-ui/`；补齐 articles/sources/categories/health 的 `#[utoipa::path]` 注解并统一标记 `security(("session" = []))`；因项目使用 axum `0.8`，将 `utoipa-swagger-ui` 升级到 `v9` 以消除 axum `0.7` 不兼容；docker 实测：`GET /api-docs/openapi.json` 返回 200 且 `content-type: application/json`，Playwright 实测 swagger-ui 页面可加载并展示全部 endpoints - `Cargo.toml`、`crates/law-eye-api/src/openapi.rs`、`crates/law-eye-api/src/routes/openapi.rs`、`crates/law-eye-api/src/routes/*`
- [x] [FE-101] 前端 auth store 将用户对象持久化到 localStorage（PII 风险） ✅ 移除 zustand `persist`，不再持久化 `user`；并在 `AuthProvider` 启动时主动清理历史 key `law-eye-auth`；Playwright 实测：页面加载后 `localStorage.getItem(\"law-eye-auth\") === null`，且手动写入后刷新会被清理 - `apps/web/src/stores/auth-store.ts`、`apps/web/src/components/providers/auth-provider.tsx`
- [x] [BIZ-101] ArticleStats high_risk_count 为 TODO/固定 0（统计口径缺失） ✅ 在 `ArticleService::get_stats` 增加 `risk_score > 70` 的统计并透传到 `/api/v1/articles/stats`（`high_risk_count`）；docker `api:3001` 实测：将 1 条文章 `risk_score=80` 后，stats 返回 `high_risk_count: 1`（验证后已恢复为 NULL）- `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/articles.rs`
- [x] [QUEUE-101] 队列任务缺少 DLQ/超时/退避重试/幂等键 ✅ 已实现 retryable 消息（`uuid` 幂等 id）、`reserve/ack`（`queue:*:processing + queue:*:inflight` 追踪）、指数退避 `queue:*:delayed`、超过 `max_retries` 后进入 `queue:*:dlq`、`queue:*:done:<id>` 幂等跳过；并对 poison payload（非法 JSON/BOM/前后空白/换行）做容错：自动入 DLQ 且不崩溃 worker。docker 实测：`Unknown source type` 连续失败 3 次后进入 `queue:ingest:dlq`，且出现 `Moved 1 delayed tasks back` / `Re-queued 1 stuck tasks back` / `Failed to deserialize reserved task ... (moving to DLQ)` 日志 - `crates/law-eye-queue/src/lib.rs`、`crates/law-eye-worker/src/main.rs`、`crates/law-eye-api/src/routes/sources.rs`、`crates/law-eye-api/src/routes/ai.rs`
- [x] [AI-202] AI 状态接口返回不完整且“完成口径”错误 ✅ `GET /api/v1/ai/status/{article_id}` 现已按 `articles.category_id` 查询 `categories` 返回 `category`（name），并将 `ai_processed` 口径改为 `ai_processed_at IS NOT NULL`（由 worker Full 任务写入）。编译验证：`cargo test -p law-eye-api` ✅ - `crates/law-eye-api/src/routes/ai.rs`
- [ ] [FE-SETTINGS-201] Settings 页面存在“模拟保存/硬编码系统信息/未接入后端”的假实现 - `apps/web/src/app/settings/page.tsx` 现状：`handleSave` 使用 `setTimeout` 模拟保存；“系统信息”tab 写死版本/框架/AI 引擎；“API 密钥”tab 未接入但后端已实现 `/api/v1/apikeys`。方案：Profile/Notifications/Appearance 保存落到 `PATCH /api/v1/users/{id}` 的 `preferences`；API keys tab 接入真实 list/create/revoke/delete，并在创建时只显示一次 `raw_key`；System tab 用真实 `/health` +（必要时新增）后端 status endpoint 替换硬编码。  
- [ ] [FE-DASH-201] Dashboard 系统状态硬编码“全部正常”（虚假健康感/误导运维）- `apps/web/src/app/page.tsx` 现状：`systemServices` 常量写死“AI 服务在线/DB 正常/全部正常”。方案：改为从真实状态源渲染（最小：`/health` + `/api/v1/articles/stats`；推荐：新增 `/api/v1/system/status` 汇总 db/redis/queue/ai 配置状态并前端展示降级策略）。

### MEDIUM（中优先级）
- [x] [PWA-101] 离线支持与 PWA（manifest + SW + 缓存策略）✅ 新增 `manifest`（`/manifest.webmanifest`）与 Service Worker（`/sw`），生产环境自动注册；缓存策略：静态资源 cache-first、导航请求 network-first + 离线兜底页、`/api/*` 默认不缓存；Chrome DevTools 实测：SW `activated` 且 `controller=true`，开启 Offline 后访问 `/login` 呈现“当前处于离线模式”离线页，恢复网络后正常渲染 - `apps/web/src/app/manifest.ts`、`apps/web/src/app/sw/route.ts`、`apps/web/src/app/layout.tsx`、`apps/web/src/components/providers/auth-provider.tsx`、`apps/web/next.config.mjs`
- [x] [CONSIST-101] 增加 API 契约校验（至少 schema 对齐/运行时断言）✅ 前端 `ApiClient` 支持按请求注入运行时断言（validator），并为关键响应实现 fail-fast 契约校验（带字段路径）；同时对齐前后端契约差异（`SemanticSearchResponse` 类型纠正、`DELETE /articles/{id}` 返回体建模、`User/Article` 字段可选性对齐）。Playwright 实测注册→登录→仪表盘→资讯列表可跑通，无契约校验报错 - `apps/web/src/lib/api/client.ts`、`apps/web/src/lib/api/types.ts`、`apps/web/src/hooks/{use-auth,use-articles,use-categories,use-sources,use-search}.ts`
- [x] [MCP-201] MCP 资源硬编码（mock）数据 ✅ 改为读取真实 Postgres：`laweye://categories` 使用 `CategoryService::list()`，`laweye://stats` 使用 `ArticleService::get_stats()` + SQL 统计 `categories/sources/users`；DB 失败返回 JSON-RPC `-32603`（不再伪造数据）。实测：连接 `law_eye` 库时 `categories_len=10`，`counts={categories:10,sources:5,users:14}`；连接 `postgres` 库（无表）时返回 `error.code=-32603` - `crates/law-eye-mcp/src/server.rs`

### LOW（低优先级）
- [x] [FE-TOAST-101] Toast Store 暂停/恢复计时逻辑 ✅ 增加计时器状态（remaining/startedAt/timeoutId）并实现 `pauseToast/resumeToast`，同时在 `removeToast/clearAll/超量淘汰` 时清理 timer；UI 在 hover/focus 时暂停、离开时恢复。Playwright 实测：5s toast 先等待 3s → hover 4s 仍存在 → 移开后约 2s 消失 - `apps/web/src/stores/toast-store.ts`、`apps/web/src/components/ui/toast.tsx`

---

## 5. 建议落地路线（面向 10 年商用）

### Phase A（本次专项修复，代码内可闭环）
1) 安全边界收口（鉴权/授权、rate limit、CSRF、日志脱敏）  
2) API 契约与可运维性（articles CRUD/过滤/删除、source last_fetch、OpenAPI）  
3) 队列可靠性（重试/退避/DLQ/幂等）  

### Phase B（需要基础设施支持）
1) TLS/mTLS（反向代理 + 内部 mTLS/mesh）  
2) Secrets/KMS（Vault/KMS + 密钥轮换）  
3) 多租户（tenant_id + RLS）与合规模型（字段加密/脱敏）  
4) 不可篡改审计（hash 链 + WORM + 异地备份）  
5) CI/CD（可重复构建、灰度、回滚、审计留痕）  

---

**报告生成时间**：2026-01-25  
**版本**：v2.1（本报告将随 Ralph Loop 修复持续更新）
