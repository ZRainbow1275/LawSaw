# LawSaw（法眼 / Law Eye）深度审计报告（v2.3）

## 修复任务清单（v2.4 / 2026-02-03）

> 来源：`prompts/audit/01_comprehensive_audit.md`（scorched-earth 静态扫描增量）

### CRITICAL（必须修复）
- [x] [SEC-301] Enterprise Vault 状态/Unseal key 不得落盘在仓库目录 ✅ 已将默认落盘迁移到用户 state 目录（脚本兼容 Windows Git Bash）
- [x] [OPS-301] Postgres 容器非 root 运行 ✅ 引入 `postgres-init` chown + `postgres` 用户运行（compose 依赖顺序已补齐）
- [x] [OPS-302] 增加 `/health/live` 与 `/health/ready` 端点（K8s 探针） ✅ `/health` 保持为 readiness；`/health/live` 不依赖外部服务，`/health/ready` 依赖 postgres/redis 并带 2s timeout - `crates/law-eye-api/src/routes/health.rs`
- [x] [SEC-302] 前端 HTML 渲染安全加固（DOMPurify URI scheme policy + 媒体/链接属性白名单再收紧） ✅ 禁止未知 URI scheme（仅允许 http/https/mailto/tel）；移除 video/audio/source；对 a/img 做二次校验并强制 `_blank` 外链 `rel=noopener noreferrer` - `apps/web/src/components/article/article-content.tsx`
- [x] [OPS-303] Compose init 容器 root 运行需隔离（禁网/最小 capabilities/只读 rootfs/no-new-privileges）✅ `postgres-init/redis-init/minio-init` 已设置 `network_mode: none`、`cap_drop: ALL` + `cap_add: CHOWN`、`read_only: true`、`tmpfs: /tmp`、`no-new-privileges` - `docker-compose.yml`
- [x] [OPS-304] `start-stack.sh` root init 容器需隔离（禁网/最小 capabilities/只读 rootfs/no-new-privileges）✅ root `docker run` 预热卷增加 `--network none --read-only --cap-drop ALL --cap-add CHOWN --security-opt no-new-privileges --tmpfs /tmp` - `scripts/no-dockerhub/start-stack.sh`
- [x] [SEC-304] Postgres 启动链最小权限（禁止暴露 superuser、移除默认口令、预置扩展避免迁移需要超权）✅ `POSTGRES_PASSWORD` 改为强制非默认；`POSTGRES_USER` 以 NOSUPERUSER 创建/收敛；bootstrap 以本地 superuser 预置 `uuid-ossp/pgcrypto/vector`；迁移改为校验扩展存在（不再 CREATE EXTENSION）；`start-stack.sh` 新增隔离的 postgres 卷 chown 预热 - `Dockerfile.postgres-pgvector`、`scripts/no-dockerhub/start-stack.sh`、`crates/law-eye-db/migrations/001_initial.sql`、`crates/law-eye-db/migrations/002_vectors.sql`

### HIGH（高优先级）
- [x] [REL-301] 移除生产代码路径中的 `unwrap/expect/panic!`（保留 tests；错误转为结构化响应） ✅ signal handler/header/regex/client 初始化等改为可恢复/可传播错误；crawler fetcher/spider 初始化返回 Result；worker 构造链路改为 Result - `crates/law-eye-api/src/main.rs`、`crates/law-eye-api/src/middleware/request_id.rs`、`crates/law-eye-api/src/routes/auth.rs`、`crates/law-eye-crawler/src/rss.rs`、`crates/law-eye-crawler/src/spider.rs`、`crates/law-eye-crawler/src/pipeline.rs`、`crates/law-eye-worker/src/main.rs`、`crates/law-eye-mcp/src/main.rs`
- [x] [SEC-303] API 输入校验基线：写接口启用严格 Schema Validation（拒绝未知字段 + 约束校验 + 统一 4xx） ✅ 引入 `ApiJson/ApiQuery` 将 JSON/Query 解析失败统一映射为结构化 4xx（含错误码）；为请求/查询结构体开启 `deny_unknown_fields`；补齐关键字段约束校验（例如 users.update）- `crates/law-eye-api/src/error.rs`、`crates/law-eye-api/src/main.rs`、`crates/law-eye-api/src/auth.rs`、`crates/law-eye-api/src/routes/*.rs`
- [x] [SUP-301] n8n 镜像禁止使用 `:latest`（固定版本/摘要，支持 env override）✅ `image` 改为 `${N8N_IMAGE:-docker.n8n.io/n8nio/n8n:2.4.7}` - `docker-compose.yml`
- [x] [SUP-302] `start-stack.sh` 禁止回退到 `minio/*:latest`（仅允许固定版本或本地构建）✅ 移除 `quay.io/minio/minio:latest` 与 `minio/minio:latest` 回退分支 - `scripts/no-dockerhub/start-stack.sh`
- [x] [DOC-304] 回填综合审计报告与当前修复状态一致（移除已修复误报 + 更新日期/分数/OPS 勾选）✅ 已同步关键误报（.env/unseal/health/schema/image pinning）并更新日期/分数 - `prompts/audit/01_comprehensive_audit.md`
- [x] [SUP-303] Compose 外部镜像 digest 全固定（禁止漂移），同时保留 env override ✅ 固定 `alpine/minio/vault/caddy/n8n` digest；并通过 `MINIO_IMAGE/VAULT_IMAGE/CADDY_IMAGE/N8N_IMAGE` 支持覆盖 - `docker-compose.yml`、`docker-compose.enterprise.yml`
- [x] [SUP-304] Dockerfile 基础镜像 digest 全固定（devcontainers base/rust/node）✅ 固定 `mcr.microsoft.com/devcontainers/{base,rust,javascript-node}` digest（避免 tag 漂移）- `Dockerfile.api`、`Dockerfile.worker`、`Dockerfile.web`、`Dockerfile.redis`、`Dockerfile.postgres-pgvector`
- [x] [DOC-305] 文档/方案中禁止 `:latest`（替换为固定版本或明确“勿用 latest”）✅ `n8n` 文档示例已从 `:latest` 改为固定版本+digest - `docs/plans/*`
- [x] [SUP-305] `start-stack.sh` 内联 Dockerfile 基础镜像 digest 固定（避免本地构建供应链漂移）✅ `FROM mcr.microsoft.com/devcontainers/base:ubuntu` 改为 `tag@sha256` 固定 - `scripts/no-dockerhub/start-stack.sh`
- [x] [SUP-306] `start-stack.sh` MinIO 本地构建禁止“下载失败回退 latest”，并对下载产物做 SHA256 校验（固定版本）✅ 固定 `MINIO_VERSION` 且强制校验 `MINIO_SHA256`，移除 `dl.min.io/.../minio`（latest）回退 - `scripts/no-dockerhub/start-stack.sh`
- [x] [CODE-306] Rust `cargo clippy -- -D warnings` 清零（保证严格门禁可用）✅ 修复 `collapsible_if`/`useless_asref` 等 clippy 报警并通过全 workspace clippy - `crates/law-eye-common/src/config.rs`、`crates/law-eye-common/src/egress.rs`
- [x] [PERF-307] 异步启动链中存在阻塞文件 IO（Vault TLS 证书/密钥使用 `std::fs::read`）→ 可能阻塞 Tokio runtime 线程 ✅ 已改为 `tokio::fs::read(...).await`（走 Tokio blocking pool），保持错误语义一致；避免在 async 路径内阻塞 runtime worker 线程 - `crates/law-eye-common/src/config.rs`、`crates/law-eye-common/src/vault.rs`
- [x] [API-103] 列表接口缺少分页（`GET /api/v1/sources`）→ 可能返回无界数组（OOM/延迟抖动） ✅ 增加 `limit/offset`（default=100, max=1000）并返回 `data/total/limit/offset`；新增 `/api/v1/sources/stats`（total/active_count/error_count）避免前端为统计拉全量列表；同步前端 hooks/页面与 OpenAPI。验证：`cargo test --workspace` ✅、`pnpm -C apps/web test` ✅ - `crates/law-eye-core/src/source.rs`、`crates/law-eye-api/src/routes/sources.rs`、`crates/law-eye-api/src/openapi.rs`、`apps/web/src/hooks/use-sources.ts`、`apps/web/src/lib/api/types.ts`、`apps/web/src/app/sources/page.tsx`、`apps/web/src/app/page.tsx`、`apps/web/src/app/analytics/page.tsx`、`apps/web/src/components/dashboard/stats-cards.tsx`
- [x] [API-104] 列表接口缺少分页（`GET /api/v1/apikeys`）→ 可能返回无界数组（OOM/延迟抖动） ✅ 增加 `limit/offset`（default=100, max=1000）并返回 `keys/total/limit/offset`；同步 OpenAPI 与前端类型断言（settings 页面继续只消费 `keys`，但契约已包含分页元数据）。验证：`cargo test --workspace` ✅、`pnpm -C apps/web test` ✅ - `crates/law-eye-core/src/apikey.rs`、`crates/law-eye-api/src/routes/apikeys.rs`、`apps/web/src/lib/api/types.ts`、`apps/web/src/app/settings/page.tsx`
- [x] [DOC-307] 文档/审计报告存在“误导性示例密钥/过期勾选项”（如默认弱口令、`sk-` 示例、以及综合审计中仍残留未勾选的已修复项）✅ 已清理默认弱口令/疑似密钥格式示例（如 `law_eye:law_eye`、`sk-*`、`minioadmin`），并回填综合审计中“镜像 digest 未固定/Blocking I/O”等已修复项为 ✅ - `.env.example`、`docs/plans/2025-01-17-phase1-mvp-implementation.md`、`docs/plans/2025-01-17-phase2-ai-enhancement.md`、`prompts/audit/01_comprehensive_audit.md`

**审计日期**：2026-01-26  
**审计对象**：Rust（Axum）后端 + Next.js（React）前端 + Docker 运行栈（PostgreSQL/Redis/n8n）  
**审计目标**：面向大型企业 10+ 年商用（安全、可靠、可演进、可运维、可审计、可合规）  
**审计基线**：Git `4df6814`（截至 v2.2：任务已闭环；v2.3：启动第二轮改善）  
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

### 1.2 阻止“企业级上线”的关键缺陷（🔴，现已全部修复 ✅）
1) **安全边界失效**：✅ 已通过 `/api/v1/*` 默认鉴权 + 权限授权（SEC-102），并补齐登录/注册限流（SEC-103）与 CSRF 策略（SEC-104）。  
2) **敏感信息泄露风险**：✅ API 启动日志已对 DB/Redis URL 进行脱敏（SEC-101）。  
3) **API 契约不一致**：✅ 已补齐缺失路由/参数并落地前端运行时契约校验（API-101、CONSIST-101）。  
4) **可运维性缺口**：✅ worker 已在抓取成功/失败时更新 `sources.last_fetch/last_error`（`crates/law-eye-core/src/source.rs`、`crates/law-eye-worker/src/main.rs`）。  

### 1.3 不属于“一次代码修复即可完成”的企业能力缺口（⚠️ 需配套基础设施）
KMS/Secrets、全链路 TLS/mTLS、租户隔离（tenant_id + RLS/物理隔离）、审计日志不可篡改（hash 链/append-only/WORM）、发布体系（CI/CD/灰度/回滚）、对象存储等 —— 需要代码 + 基础设施联合落地，本报告给出可执行方案与落地路线。

---

## 2. 40 项审查（逐项结论 + 证据 + 方案）

> 记号：✅ 已满足（可上线前提的部分满足） / ⚠️ 部分满足（需补齐） / ❌ 缺失（需设计 + 实现）

### 2.1 前端功能设计实现（重中之重）— ✅/⚠️
- 证据：Playwright 实测注册/登录/数据看板/文章列表/详情/搜索可跑通。
- 风险：错误边界（Next `error.tsx`）与空态/异常态覆盖不足；部分交互存在“只能按 Enter 才触发”的呆瓜体验点（搜索）。
- 方案：补齐全局 `error.tsx`/`not-found.tsx`/关键页面 `loading.tsx`；统一表单交互（按钮 submit + Enter 双通道）。

### 2.2 后端连通设计 — ✅
- 证据：`/health` 200；worker 抓取并入库成功。
- 风险：剩余风险主要来自“企业基础设施项”（TLS/mTLS、KMS、租户隔离、CI/CD 等），需与部署侧联合落地（见 Phase B）。
- 方案：保持 `/api/v1/*` 默认鉴权策略，并继续补齐 metrics/trace/log correlation 等可观测能力。

### 2.3 路由与导航设计 — ✅
- 证据：前端 Sidebar 导航覆盖主要模块；后端 API 路由版本化：`crates/law-eye-api/src/routes/mod.rs`。

### 2.4 移动端适配 — ⚠️
- 证据：Playwright 以 iPhone 13 视口截图验证可用。
- 风险：尚未做系统化断点审计（表格/弹窗/侧边栏/文章阅读器）。
- 方案：补齐移动端 E2E 关键路径 + CSS 断点回归（至少 Dashboard/Articles/Reader）。

### 2.5 离线支持与 PWA — ✅
- 证据：已新增 `manifest` + `service worker` 并在生产环境自动注册；离线场景提供兜底页（见 PWA-101）。
- 方案：维持“静态资源 cache-first、导航 network-first、`/api/*` 默认不缓存”的策略；对企业场景可引入更细粒度缓存白名单与容量控制。

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
- 现状：✅ API 启动日志已脱敏（SEC-101），关键路由默认鉴权（SEC-102）。
- 风险：生产仍需统一日志格式（JSON）、Trace/RequestId 贯通与告警/备份演练（见 2.7）。
- 方案：生产默认 JSON 日志 + 结构化字段（request_id/user_id/route/latency）并接入集中日志平台。

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

### 2.15 API 设计完备性/一致性（认证、授权、格式、错误码）— ⚠️
- 现状：✅ `/api/v1/*` 默认鉴权与授权已闭环（SEC-102），并补齐关键契约缺口（API-101）与前端运行时契约校验（CONSIST-101）。
- 风险：错误响应仍未统一为单一 envelope（部分路由返回 `StatusCode + Json(ErrorResponse)`）；错误码表/对外文档仍需沉淀。
- 方案：在不破坏现有前端的前提下，先统一 `ErrorResponse` + 规范化 `code` 集合，再逐步引入可选 envelope（新版本 API）。

### 2.16 错误处理与日志 — ✅/⚠️
- 现状：✅ 已完成日志脱敏（SEC-101），并维持 `x-request-id` 回传（见 `crates/law-eye-api/src/middleware/request_id.rs`）。
- 风险：错误响应体仍未统一携带 `request_id`；部分错误码仍偏“字符串拼装”。
- 方案：抽象统一错误构造器（附带 request_id/trace id），并补齐错误码表与告警分级。

### 2.17 业务逻辑完整性 — ⚠️
- 风险：文章状态、发布/归档权限、统计口径（high_risk_count）仍有 TODO。

### 2.18 国际化/本地化 — ⚠️
- 现状：产品以中文为主可接受；但缺少 i18n 框架与 locale 策略（企业出海/多语言需求会阻断）。

### 2.19 代码可维护性 — ⚠️
- 现状：✅ 工作区已收敛为可追溯提交（OPS-101），关键 API 已加入前端运行时契约校验（CONSIST-101）。
- 风险：仍缺少系统化自动化测试与回归套件（尤其是端到端与安全回归）。
- 方案：补齐 Playwright E2E（关键用户流）与 API 契约测试，纳入 CI 阶段门禁。

### 2.20 身份颗粒度对齐（登录/注册等）— ✅/⚠️
- 证据：注册后自动登录；`/api/v1/auth/me` 可用。
- 风险：前端 auth store 使用 localStorage 持久化用户对象（PII）（见 FE-101）。

### 2.21 并发异步消息队列 — ✅/⚠️
- 现状：✅ 队列已具备 `reserve/ack`、可见性超时重投、延迟队列重试、DLQ 与 done-key（幂等）能力（`crates/law-eye-queue/src/lib.rs`）。
- 风险：仍需补齐队列监控指标（inflight/delayed/dlq 长度）与告警阈值；关键任务的幂等策略需明确规范（按业务键/对象版本）。
- 方案：补齐 metrics 与运维面板；为关键任务定义幂等键策略并在 API 入队层强制执行。

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

### CRITICAL（回归与端到端）

- [x] [DEV-401] Web Dev 端口可配置（避免 8849 冲突）✅ `pnpm dev` 读取 `WEB_PORT/PORT`（默认 8849），并透传额外参数 - `apps/web/package.json`、`apps/web/scripts/next-dev.mjs`
- [x] [OPS-401] 无 DockerHub 环境可重复启动全栈（用于联调/E2E），且不重复构建镜像/不误杀进程 ✅ 新增 `scripts/no-dockerhub/start-stack.sh`/`stop-stack.sh`：本地构建并复用 `lawsaw-postgres-pgvector:local`、`lawsaw-redis:local`（无 DockerHub 依赖），按 `--name` 隔离容器/数据卷/进程 PID；自动选择空闲端口；停止时仅按记录 PID/容器名精确回收（不误杀其他进程） - `scripts/no-dockerhub/*`、`apps/web/scripts/next-dev.mjs`、`crates/law-eye-common/src/config.rs`、`.env.example`
- [x] [E2E-401] 固化 Playwright E2E 测试套件（注册/登录/文章/搜索/信息源抓取等关键用户流），纳入门禁并提供可复现运行方式 ✅ 修复 Playwright strict mode 下的 selector 歧义（“添加/搜索/标题”等多元素匹配），并对 Next Dev 首次编译/首访页面增加显式等待（URL/heading 超时）提升稳定性；验证：`bash scripts/no-dockerhub/e2e.sh` 通过 - `apps/web/e2e/lawsaw.e2e.spec.ts`、`scripts/no-dockerhub/e2e.sh`
- [x] [A11Y-402] Header 全局搜索可访问性去歧义 ✅ 为输入框/按钮补齐明确 aria-label（避免与页面级搜索冲突），读屏/自动化选择器更稳定 - `apps/web/src/components/layout/header.tsx`
- [x] [E2E-402] 增加未登录访问受保护页面应重定向到 `/login` 的 E2E 回归 ✅ 覆盖 `ProtectedRoute` 客户端跳转逻辑，防止鉴权回归导致“未登录可见敏感页/空白页卡死” - `apps/web/e2e/lawsaw.e2e.spec.ts`
- [x] [DEV-403] 运行 `next dev/build` 不应改写被 Git 跟踪文件 ✅ 已验证 Next 16.1.6 不会改写 `apps/web/next-env.d.ts`/`apps/web/tsconfig.json`（保留 Next 默认生成的 route types import；删除会被 Next 自动写回）。验证：`pnpm -C apps/web build` 后 `git status --porcelain` 仍保持干净 - `apps/web/next-env.d.ts`、`apps/web/tsconfig.json`
- [x] [E2E-403] 增加移动端抽屉导航 E2E：汉堡按钮打开、遮罩/ESC 关闭、跳转自动收起、打开时锁滚动 ✅ 覆盖移动端抽屉导航交互（open/ESC/遮罩/跳转/锁滚动），并修复 no-dockerhub 启动时 Next rewrites 环境传递，确保 `/health` 与 `/api/v1/*` 代理稳定可用。验证：`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e403-check` 通过 - `apps/web/e2e/lawsaw.e2e.spec.ts`、`apps/web/src/stores/sidebar-store.ts`、`apps/web/src/components/layout/sidebar.tsx`、`scripts/no-dockerhub/start-stack.sh`
- [x] [E2E-404] E2E 增加 console/pageerror 门禁：发现真实前端错误立即修复或建立最小白名单（禁止吞错上线） ✅ 默认拦截 `pageerror` 与 `console.error`；对白名单仅放行浏览器对 401 的通用资源报错（避免未登录会话检查产生噪音）。验证：`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e404-check` 通过 - `apps/web/e2e/lawsaw.e2e.spec.ts`

### ENTERPRISE（企业基础设施，必须跑通）

> 目标：让“TLS/mTLS、KMS/Secrets、多租户、加密、审计不可篡改、CI/CD、对象存储”等能力在本仓库内 **真实可运行**（非 mock），并提供可验证证据。

- [x] [TLS-301] 统一入口 HTTPS/TLS ✅ 已通过 Caddy gateway 对 Web/API 统一 TLS 终止（TLS1.2/1.3）+ HTTP→HTTPS 重定向 + HSTS/安全响应头；验证：`curl --cacert tmp/enterprise/pki/ca.crt -I https://localhost/health` 200（含 HSTS），并用 chrome-devtools 实测可访问 `https://localhost/login` - `docker-compose.enterprise.yml`、`infra/caddy/*`、`scripts/enterprise/*`
- [x] [MTLS-301] 内部服务 mTLS ✅ 已实现 gateway → api 的 mTLS：新增 `api-mtls` 侧车（Caddy）对内要求客户端证书并转发至 `api:3001`；gateway 以 mTLS 方式连接并校验服务端证书（CA trust_pool + SNI），并强制上游 Host 匹配避免 421。验证：`docker run --rm --network lawsaw_law-eye-network -v /mnt/d/Desktop/LawSaw/tmp/enterprise/pki:/pki:ro curlimages/curl:8.6.0 --cacert /pki/ca.crt https://api-mtls:3443/health` 返回 `tlsv13 alert certificate required`；加上 `--cert/--key` 后返回 200；外部 `curl --cacert tmp/enterprise/pki/ca.crt https://localhost/health` 200 - `docker-compose.enterprise.yml`、`infra/caddy/*`、`scripts/enterprise/*`
- [x] [SECRETS-301] 集中 KMS/Secrets ✅ 已引入 Vault（TLS + cert auth + 最小权限 policy），API/worker 启动时从 Vault KV v2 拉取 `database_url/redis_url/openai_*`（不再在 compose env 明文配置）；并提供轮换/吊销脚本：`vault-rotate.sh`（轮换 Postgres 密码→patch Vault→重启 api/worker）、`vault-revoke.sh`（吊销 api/worker cert 映射）与初始化脚本 `vault-init-enterprise.sh`。实测：rotate 后 api/worker 正常重启；revoke 后 api 启动失败，重新 init 可恢复；同时修复 Web 生产构建不再硬编码 `NEXT_PUBLIC_API_URL=http://localhost:3001`，企业网关下 API 请求回归同源（cookie session 可用） - `docker-compose.enterprise.yml`、`crates/law-eye-common/src/config.rs`、`scripts/enterprise/vault-*`、`Dockerfile.web`、`.dockerignore`
- [x] [TENANT-301] 多租户隔离（逻辑隔离 + RLS）✅ 新增 `tenants` 表与各业务表 `tenant_id` 字段并启用 Postgres RLS；API/worker 以事务级 `set_config('app.tenant_id', ...)` 绑定租户上下文；并通过 DB session `SET ROLE law_eye_app`（NOBYPASSRLS）强制启用 RLS（避免 superuser 静默绕过）。Playwright 实测：alpha/beta 两租户信息源完全隔离；beta 触发抓取后仅 beta 租户的 `sources.last_fetch/last_error` 更新，alpha 不受影响 - `crates/law-eye-db/migrations/*`、`crates/law-eye-core/src/*`、`crates/law-eye-api/src/*`、`crates/law-eye-worker/src/main.rs`、`apps/web/src/*`
- [x] [ENC-301] 敏感字段加密/脱敏 ✅ `feedbacks.content/contact_email` 使用 Vault Transit 加密后落库（DB 存储 `vault:v1:*` 密文；新增 `feedbacks.encryption_version` 标记并对旧明文数据做“读时回填加密”）；API 运行时解密返回明文；admin 列表接口 `/api/v1/feedbacks` 默认对 email 脱敏并对 content 返回预览（减少敏感暴露面）。联调证据：UI 提交反馈后 DB 中 `content/contact_email` 为 `vault:v1` 前缀密文且 `encryption_version=1`，API `GET /api/v1/feedbacks/my` 返回明文，`GET /api/v1/feedbacks` 返回脱敏 email（如 `b***t@example.com`） - `crates/law-eye-common/src/{config.rs,vault.rs}`、`crates/law-eye-core/src/feedback.rs`、`crates/law-eye-db/migrations/008_feedbacks_encryption.sql`、`crates/law-eye-api/src/{main.rs,state.rs,routes/feedbacks.rs}`、`docker-compose.enterprise.yml`、`scripts/enterprise/vault-init*.sh`
- [x] [AUDIT-301] 审计日志不可篡改 ✅ `audit_logs` 新增 `seq/prev_hash/hash` 并通过 `BEFORE INSERT` 触发器自动串联 per-tenant hash 链；同时通过触发器硬禁止 `UPDATE/DELETE` 实现 append-only；提供验证脚本可全量校验链一致性；并补齐 Sources/Articles/Feedback 写操作审计（含 actor、IP、User-Agent） - `crates/law-eye-db/migrations/009_audit_logs_tamper_proof.sql`、`crates/law-eye-core/src/audit.rs`、`crates/law-eye-db/src/models.rs`、`crates/law-eye-api/src/routes/{sources,articles,feedbacks}.rs`、`scripts/enterprise/audit-verify.sql`
- [x] [CI-301] 可靠发布（CI 门禁）：补齐 GitHub Actions CI（cargo test/clippy、pnpm test/build、依赖漏洞扫描、格式化检查），并固化可重复构建产物（SBOM/锁定文件） ✅ 已补齐 Rust `--locked` + RustSec audit、Web Biome check + pnpm audit、SBOM SPDX 工件上传；并修复前端依赖漏洞（Next >= 15.5.10） - `.github/workflows/*`、`Cargo.lock`、`apps/web/pnpm-lock.yaml`
- [x] [OBJ-301] 对象存储 + 元数据表 ✅ 已引入 MinIO（S3）并新增 `objects` 元数据表（tenant_id + RLS）；实现“用户头像上传 → 对象存储 → 生成可访问 URL → 前端展示”闭环：`POST /api/v1/users/{id}/avatar`（multipart，PNG/JPEG/WEBP，≤1MiB，owner/admin 鉴权，事务内写 `objects` + 更新 `users.avatar_url=/api/v1/objects/{id}` + 追加审计 `users.avatar.upload`），`GET /api/v1/objects/{id}`（owner/admin 鉴权，返回二进制并 `Cache-Control: private`）。前端 `/settings` 增加头像选择/预览/上传，并在 Header 展示（`resolveApiUrl` 解析相对路径）。E2E 验证：启动 MinIO（支持 `MINIO_API_PORT/MINIO_CONSOLE_PORT` 覆写端口避免冲突）→ 注册/登录 → 上传头像 → `GET /api/v1/objects/{id}` 200（无 cookie 401；其他用户 403）；DB 校验 `objects` 记录与 `audit_logs.users.avatar.upload` 同步写入 ✅ - `docker-compose.enterprise.yml`、`crates/law-eye-db/migrations/*`、`crates/law-eye-api/src/routes/*`、`apps/web/src/app/settings/*`

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

- [x] [FE-BUILD-101] Next.js 生产构建失败：已将 `/settings` 中 `useSearchParams()` 逻辑下沉到 `SettingsContent`，并在 page 默认导出增加 `<Suspense>` 边界以满足 CSR bailout 要求；`pnpm -C apps/web build` 现可通过且 `/settings` 成功 prerender（Route 表中标记为静态）✅ 验证：`pnpm -C apps/web build` ✅ - `apps/web/src/app/settings/page.tsx`

- [x] [FE-MOBILE-001] 移动端导航“呆瓜体验”：Sidebar 固定占位（`fixed h-screen`）+ MainContent 固定左边距（`ml-[280px]`）导致移动端内容被挤压/不可用；需要实现抽屉式侧边栏 + 顶部汉堡按钮 + 遮罩点击关闭 + 路由切换自动收起 + 禁止背景滚动 ✅ 已实现移动端抽屉式侧边栏（汉堡按钮打开、遮罩/ESC 关闭、路由切换自动收起、打开时锁定 body 滚动），并将 `<md` 视口主内容左边距归零（不再被挤压）。Playwright（iPhone 13）实测：打开抽屉后 `document.body.style.overflow === "hidden"`，点击遮罩区域可关闭，点击导航项后自动收起 - `apps/web/src/components/layout/sidebar.tsx`、`apps/web/src/components/layout/header.tsx`、`apps/web/src/components/layout/main-content.tsx`、`apps/web/src/stores/sidebar-store.ts`
- [x] [FE-AUTH-001] 鉴权会话检查重复/噪音：`AuthProvider` 已在全局做 `/api/v1/auth/me`，但 `useAuth()` 仍在 mount 时再次请求，导致多余网络请求与潜在 401 噪音（尤其 login/register/header 挂载时）；需收敛为单一来源（AuthProvider）并保留可显式 refresh 的入口 ✅ 已移除 `useAuth()` 的 mount 期会话检查，改为由 `AuthProvider` 统一调用 `useAuth().refreshSession()`；并在 `useAuth()` 暴露 `refreshSession` 显式入口，登录/注册复用同一授权信息拉取逻辑。Playwright 实测（清空 performance entries 后刷新）：`/api/v1/auth/me` resource 计数为 1（不再重复）- `apps/web/src/hooks/use-auth.ts`、`apps/web/src/components/providers/auth-provider.tsx`
- [x] [FE-SWIPE-001] 移动端“左滑操作”失真：`SwipeableCard` 将 Tailwind class（如 `bg-blue-500`）写入 `style.backgroundColor`，背景层始终透明，用户无法感知滑动；需修复背景渲染并用 Playwright iPhone 视口验证滑动/点击操作闭环 ✅ 已将背景层从 `style.backgroundColor=bg-*` 改为渲染 Tailwind `bg-*` class + motion opacity（不再透明），并补齐左侧操作按钮的 `bgColor` 应用（左右一致）。Playwright（iPhone 13）实测：背景层 `bg-primary-500` 的 computed `backgroundColor` 为 `rgb(255, 107, 53)`（不再是无效字符串导致透明）- `apps/web/src/components/ui/swipeable-card.tsx`
- [x] [FE-ART-001] `资讯列表` 页存在空壳“筛选”按钮（无 onClick/无策略），违背“拒绝空壳交付”；需落地真实筛选（至少 status/收藏/排序其一）并与 `GET /api/v1/articles` 参数对齐，且 Playwright 实测可用 ✅ 已在 `/articles` 落地“状态”筛选面板（pending/processing/published/archived/rejected），点击即触发真实过滤并重置分页；Playwright（iPhone 13）实测：点击“已归档”后产生请求 `GET /api/v1/articles?limit=20&offset=0&status=archived` - `apps/web/src/app/articles/page.tsx`、`apps/web/src/hooks/use-articles.ts`
- [x] [FE-HEADER-001] 顶部 Header 搜索仅支持 Enter（缺少显式提交按钮/移动端自适应），属于典型呆瓜交互；需补齐可点击搜索按钮、键盘/读屏可访问，并与移动端抽屉导航按钮共存 ✅ 已在搜索框内新增显式 submit 按钮（`aria-label="搜索"`，空输入禁用），并保持与移动端汉堡按钮共存。Playwright（iPhone 13）实测：输入 `Trump` 点击按钮跳转 `/search?q=Trump` - `apps/web/src/components/layout/header.tsx`

### HIGH（高优先级）
- [x] [AUTHZ-101] 权限检查禁止吞错：将 `has_permission(...).await.unwrap_or(false)` 全量替换为“失败即 500”并保留 403 仅用于真实权限不足（避免 DB 故障被误判为 403；可配合 `request_id` 排障）✅ 验证：`cargo test -p law-eye-api` ✅、`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `crates/law-eye-api/src/routes/ai.rs`、`crates/law-eye-api/src/routes/articles.rs`、`crates/law-eye-api/src/routes/categories.rs`、`crates/law-eye-api/src/routes/feedbacks.rs`、`crates/law-eye-api/src/routes/search.rs`、`crates/law-eye-api/src/routes/sources.rs`、`crates/law-eye-api/src/routes/users.rs`
- [x] [SEC-105] 生产环境 API 错误响应不泄露内部细节（DB/Config/HTTP/Internal），用 `request_id` 关联日志排障 ✅ `AppError` 对内部错误在 `PRODUCTION` 下统一返回 “Internal server error”；同时 `RequestIdLayer` 对所有 **JSON 5xx** 的错误响应做兜底脱敏（仅在存在 `error/message/code/details` 等错误字段时生效，避免污染 `/health` 等非错误 envelope）。新增 `TraceLayer` 将 `request_id` 写入请求 span，配合内部错误 `error!` 日志实现可追踪排障。验证：`cargo test -p law-eye-api` ✅ - `crates/law-eye-api/src/error.rs`、`crates/law-eye-api/src/middleware/request_id.rs`、`crates/law-eye-api/src/main.rs`
- [x] [RES-101] 前端 `ApiClient` 缺少超时与取消：网络抖动时请求可无限挂起（影响 UX/资源回收）✅ 引入 `AbortController` + 可配置超时（`NEXT_PUBLIC_API_TIMEOUT_MS`，<=0 表示禁用；默认 15000ms）；超时/取消返回明确 `AbortError` 信息。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `apps/web/src/lib/api/client.ts`
- [x] [PERF-101] 前端 `ApiClient` 对 GET 也默认加 `Content-Type: application/json` 导致每次请求触发 CORS 预检（延迟/负载上升）✅ 改为仅在 **请求包含 body** 且未显式指定时才设置 `Content-Type: application/json`；同时默认补齐 `Accept: application/json`。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `apps/web/src/lib/api/client.ts`
- [x] [OPS-102] `/health` 做真实依赖探测（Postgres/Redis）并在失败时返回 503（避免“假健康”误导运维）✅ `SELECT 1` + `PING`（2s timeout）探测依赖，失败即 `503 Service Unavailable`；同时为队列抽象补齐 `TaskQueue::ping()` 供健康检查复用。验证：`cargo test -p law-eye-queue -p law-eye-api` ✅、`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `crates/law-eye-api/src/routes/health.rs`、`crates/law-eye-queue/src/lib.rs`
- [x] [OBS-102] 前端可获取 `x-request-id`（CORS expose + allow）并在 `ApiClient` 兜底从错误体读取 `request_id` ✅ 后端 CORS 已 `expose_headers(x-request-id)` 且允许请求头 `x-request-id`；前端 `ApiClient` 在 header 不可读/缺失时，会从 JSON 错误体的 `request_id` 兜底提取并拼入错误信息；验证：`cargo test -p law-eye-api` ✅、`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `crates/law-eye-api/src/main.rs`、`apps/web/src/lib/api/client.ts`
- [x] [OBS-101] 错误响应体统一包含 request_id（便于排障）✅ 已在 `RequestIdLayer` 对 **JSON 错误响应** 注入 `request_id` 字段（保留 `x-request-id` header），并对传入的 `x-request-id` 做 trim + 长度上限（<=128）防御；验证：`cargo test -p law-eye-api` ✅ - `crates/law-eye-api/src/middleware/request_id.rs`
- [x] [SEARCH-302] Search 页面 AI 问答在 AI 未配置时无明确提示且仍可点击：已在 Search 页接入 `/api/v1/ai/available` 做可用性探测，当 `available=false` 时禁用 “AI 问答” Tab 并展示清晰提示；同时为 AI 问答请求增加 toast 错误反馈（避免 503 无感）。Playwright 实测：`GET /api/v1/ai/available` 返回 `{available:false}` 且 AI Tab 为 disabled，页面展示“AI 服务未启用...”提示（截图：`C:\\Users\\HP\\Downloads\\search302-ai-disabled-2026-01-26T02-21-34-654Z.png`）。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `apps/web/src/app/search/page.tsx`、`apps/web/src/hooks/use-search.ts`
- [x] [SEARCH-303] Search 关键词搜索缺少分页且短查询/错误被误导为“未找到” ✅ Search 页已接入 `offset` 分页（URL `page` 同步、上一页/下一页、结果区间 `from-to/total`），并区分“未输入/少于 3 字符未触发/请求失败/无结果”状态；`useSearch` 统一 `trim()` 且将 `offset` 纳入 `queryKey`，避免缓存串页。Playwright 实测：短查询提示“至少 3 个字符”且不发请求（截图：`C:\\Users\\HP\\Downloads\\search303-short-query-2026-01-26T08-34-16-046Z.png`）；分页下一页命中 `offset=10` 且显示 `11-15/15`（截图：`C:\\Users\\HP\\Downloads\\search303-pagination-page2-2026-01-26T08-34-32-989Z.png`）；故障演练：停止 `law-eye-api` 后搜索展示“搜索失败 + 重试”，恢复后点击重试成功出结果（截图：`C:\\Users\\HP\\Downloads\\search303-error-api-down-2026-01-26T16-54-43-064Z-2026-01-26T08-54-50-230Z.png`、`C:\\Users\\HP\\Downloads\\search303-retry-success-2026-01-26T16-55-37-453Z-2026-01-26T08-55-43-920Z.png`）。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅、`pnpm -C apps/web build` ✅ - `apps/web/src/app/search/page.tsx`、`apps/web/src/hooks/use-search.ts`
- [x] [SEC-301] 前端 localStorage 加密工具硬编码密钥/盐且容易造成“安全错觉” ✅ 已移除硬编码 `ENCRYPTION_KEY`/`salt`，改为 per-device 生成非导出 `CryptoKey`（IndexedDB 持久化）进行 AES-GCM；加密失败自动降级为 JSON，并在实现内明确“仅降低静态读取 localStorage 风险，不能防御 XSS”。同时补齐 `safeJsonStringify`、base64 编解码分块与 SSR guard（避免 server 侧误用崩溃）。Playwright 冒烟：`/login` 正常渲染（截图：`C:\\Users\\HP\\Downloads\\sec301-smoke-login-2026-01-26T17-09-03-446Z-2026-01-26T09-09-10-738Z.png`）。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅、`pnpm -C apps/web build` ✅ - `apps/web/src/lib/crypto.ts`
- [x] [ANALYTICS-401] 统计分析页风险/情感/状态分布依赖前端拉取前 N 条文章聚合（样本口径，可能误导决策且性能差）✅ 后端新增 `GET /api/v1/articles/analytics-summary`（SQL FILTER 全量聚合 status/risk/sentiment），前端 Analytics 页面改用该接口并移除“拉取 1000 条再聚合”；Playwright 实测断言该接口返回 200 且 UI 渲染与返回体一致。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅、`docker build -f Dockerfile.api .` ✅ - `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/articles.rs`、`crates/law-eye-api/src/openapi.rs`、`apps/web/src/hooks/use-articles.ts`、`apps/web/src/app/analytics/page.tsx`、`apps/web/src/lib/api/types.ts`
- [x] [SEC-201] 前端缺少基础安全响应头（`X-Content-Type-Options`/`Referrer-Policy`/`Permissions-Policy`/`X-Frame-Options`/`CSP frame-ancestors`）✅ 已在 Next `headers()` 全局下发（不影响 SW/manifest 的缓存头），降低 MIME Sniffing 与 Clickjacking 风险；Playwright 实测 `/login` 响应头包含 `X-Frame-Options=DENY`、`Content-Security-Policy=frame-ancestors 'none';`、`X-Content-Type-Options=nosniff`。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅ - `apps/web/next.config.mjs`
- [x] [SEARCH-301] 关键词搜索相关度为假数据且总数不准确：后端 `GET /api/v1/search` 由“全量 `score=1.0` + `total=results.len`”改为 **Postgres 全文检索 `ts_rank` 归一化得分（0~1）+ `COUNT(*) OVER()` 真实 total**；前端搜索结果标题与右侧按钮改为真实跳转文章详情 `/articles/{id}`（避免空壳交互），相关度显示不再恒 100%。Playwright 实测：`q=Trump` 返回 `total=15` 且 `score` 不同（如 1 / 0.918... / 0.734...），UI 展示“15 条结果”，点击首条可跳转 `/articles/1952d459-c652-4d72-ac9e-d9bb4913df90` 并加载正文（截图：`C:\\Users\\HP\\Downloads\\search301-trump-results-2026-01-26T01-57-20-689Z.png`、`C:\\Users\\HP\\Downloads\\search301-article-detail-2026-01-26T01-57-34-628Z.png`）。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅、`docker build -f Dockerfile.api -t lawsaw-api:search301 .` ✅ - `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/search.rs`、`apps/web/src/app/search/page.tsx`
- [x] [FE-DASH-301] Dashboard「板块概览」错误使用 `category.sort_order` 冒充“资讯分布数量”（属于假数据/误导）✅ 已新增后端 `GET /api/v1/articles/category-counts` 输出真实按 `category_id` 聚合计数（`NULL`=未分类），前端用该接口替换 sort_order 展示；统计不可用时显示 `—`（不伪造 0）。Playwright 实测：Dashboard 显示“按采集总量统计：79 条（含未分类 79 条）”，未分类=79、各分类=0（截图：`C:\\Users\\HP\\Downloads\\dash301-category-overview.png-2026-01-26T00-19-18-778Z.png`）- `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/articles.rs`、`crates/law-eye-api/src/openapi.rs`、`apps/web/src/hooks/use-articles.ts`、`apps/web/src/components/dashboard/category-overview.tsx`、`apps/web/src/lib/api/types.ts`
- [x] [ANALYTICS-301] 统计分析页「分类统计」缺少“未分类”分桶且口径依赖前端聚合（可能与 total 不一致）✅ 已改用后端 `GET /api/v1/articles/category-counts`：新增“未分类”（`category_id=null`）分桶并避免前端聚合误差；加载时显示 skeleton，失败时显示 `—`（不伪造）。Playwright 实测：Analytics 分类统计显示 未分类=79（截图：`C:\\Users\\HP\\Downloads\\analytics301-category-stats.png-2026-01-26T00-23-28-427Z.png`）- `apps/web/src/app/analytics/page.tsx`、`apps/web/src/hooks/use-articles.ts`、`crates/law-eye-api/src/routes/articles.rs`
- [x] [AI-RISK-301] 风险评分缺失/阈值不一致导致误导 ✅ 统一风险口径：新增 `getArticleRiskLevel`（0-25/50/75/76+）并在 ArticleCard/Category/Data/Analytics 统一使用；`risk_score=null` 不再伪装为低风险/0%，统一展示为“未评估”；Analytics 风险分布补齐“未评估/严重”分桶。Playwright 实测：Dashboard/Analytics/Data 均展示“未评估”（截图：`C:\\Users\\HP\\Downloads\\risk301-dashboard.png-2026-01-25T23-15-59-382Z.png`、`C:\\Users\\HP\\Downloads\\risk301-analytics.png-2026-01-25T23-16-15-437Z.png`、`C:\\Users\\HP\\Downloads\\risk301-data.png-2026-01-25T23-16-29-365Z.png`）- `apps/web/src/lib/api/types.ts`、`apps/web/src/components/article/article-card.tsx`、`apps/web/src/app/category/[slug]/page.tsx`、`apps/web/src/app/data/page.tsx`、`apps/web/src/app/analytics/page.tsx`
- [x] [AI-SENT-301] 情感字段缺失导致统计误导 ✅ 将 `sentiment=null` 归类为“未分析”（不再计入 `neutral`），并在统计页新增“未分析”分桶；占比按已加载样本计算（避免 total 与样本不一致）。Playwright 实测：Analytics “情感分析”显示 未分析=79、中性=0（截图：`C:\\Users\\HP\\Downloads\\sent301-analytics.png-2026-01-25T23-21-27-376Z.png`）- `apps/web/src/lib/api/types.ts`、`apps/web/src/app/analytics/page.tsx`
- [x] [DATA-101] 信息源 last_fetch/last_error 未更新（运维失真） ✅ worker 在 ingest 成功/失败后调用 `SourceService::update_last_fetch` 回写 sources 表（成功清空 last_error，失败记录错误）；docker 实测：触发 RSS 抓取后 `sources.last_fetch` 更新；构造 spider 配置解析失败后 `last_error` 写入 - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-core/src/source.rs`
- [x] [API-102] OpenAPI/Swagger 未实际暴露（虽有 utoipa 注解） ✅ 暴露 `/api-docs/openapi.json` 与 `/api-docs/swagger-ui/`；补齐 articles/sources/categories/health 的 `#[utoipa::path]` 注解并统一标记 `security(("session" = []))`；因项目使用 axum `0.8`，将 `utoipa-swagger-ui` 升级到 `v9` 以消除 axum `0.7` 不兼容；docker 实测：`GET /api-docs/openapi.json` 返回 200 且 `content-type: application/json`，Playwright 实测 swagger-ui 页面可加载并展示全部 endpoints - `Cargo.toml`、`crates/law-eye-api/src/openapi.rs`、`crates/law-eye-api/src/routes/openapi.rs`、`crates/law-eye-api/src/routes/*`
- [x] [FE-101] 前端 auth store 将用户对象持久化到 localStorage（PII 风险） ✅ 移除 zustand `persist`，不再持久化 `user`；并在 `AuthProvider` 启动时主动清理历史 key `law-eye-auth`；Playwright 实测：页面加载后 `localStorage.getItem(\"law-eye-auth\") === null`，且手动写入后刷新会被清理 - `apps/web/src/stores/auth-store.ts`、`apps/web/src/components/providers/auth-provider.tsx`
- [x] [BIZ-101] ArticleStats high_risk_count 为 TODO/固定 0（统计口径缺失） ✅ 在 `ArticleService::get_stats` 增加 `risk_score > 70` 的统计并透传到 `/api/v1/articles/stats`（`high_risk_count`）；docker `api:3001` 实测：将 1 条文章 `risk_score=80` 后，stats 返回 `high_risk_count: 1`（验证后已恢复为 NULL）- `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/articles.rs`
- [x] [QUEUE-101] 队列任务缺少 DLQ/超时/退避重试/幂等键 ✅ 已实现 retryable 消息（`uuid` 幂等 id）、`reserve/ack`（`queue:*:processing + queue:*:inflight` 追踪）、指数退避 `queue:*:delayed`、超过 `max_retries` 后进入 `queue:*:dlq`、`queue:*:done:<id>` 幂等跳过；并对 poison payload（非法 JSON/BOM/前后空白/换行）做容错：自动入 DLQ 且不崩溃 worker。docker 实测：`Unknown source type` 连续失败 3 次后进入 `queue:ingest:dlq`，且出现 `Moved 1 delayed tasks back` / `Re-queued 1 stuck tasks back` / `Failed to deserialize reserved task ... (moving to DLQ)` 日志 - `crates/law-eye-queue/src/lib.rs`、`crates/law-eye-worker/src/main.rs`、`crates/law-eye-api/src/routes/sources.rs`、`crates/law-eye-api/src/routes/ai.rs`
- [x] [AI-202] AI 状态接口返回不完整且“完成口径”错误 ✅ `GET /api/v1/ai/status/{article_id}` 现已按 `articles.category_id` 查询 `categories` 返回 `category`（name），并将 `ai_processed` 口径改为 `ai_processed_at IS NOT NULL`（由 worker Full 任务写入）。编译验证：`cargo test -p law-eye-api` ✅ - `crates/law-eye-api/src/routes/ai.rs`
- [x] [FE-SETTINGS-201] Settings 页面存在“模拟保存/硬编码系统信息/未接入后端”的假实现 ✅ 已移除 `setTimeout` 模拟保存：Profile/Notifications/Appearance 通过 `PATCH /api/v1/users/{id}` 将 `display_name + preferences`（notifications/appearance）真实落库，并通过 `GET /api/v1/users/{id}` 回填偏好；API Keys tab 接入 `/api/v1/apikeys` 的 list/create/revoke/delete，创建时仅展示一次 `raw_key` 并支持复制；System tab 改为真实 `/health` + `/api/v1/articles/stats`（不再硬编码版本/框架/AI 引擎）；Security tab 去除“可点击但无效”的假入口并明确标注未开放。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅、`cargo test -p law-eye-api` ✅ - `apps/web/src/app/settings/page.tsx`、`apps/web/src/lib/api/types.ts`、`crates/law-eye-api/src/routes/users.rs`
- [x] [FE-DASH-201] Dashboard 系统状态硬编码“全部正常”（虚假健康感/误导运维） ✅ 已改为从真实状态源渲染：Dashboard 通过 `/health`、`/api/v1/articles/stats`、`/api/v1/sources`、`/api/v1/ai/available` 实时计算并展示各子系统状态（ok/warn/error/loading）与整体 badge（不再固定“全部正常”）；后端补齐 `GET /api/v1/ai/available`（仅检测 API 侧 AI 配置，不做外部 LLM 探测）；前端补齐契约校验类型与断言。验证：`pnpm -C apps/web typecheck` ✅、`pnpm -C apps/web lint` ✅、`cargo test -p law-eye-api` ✅ - `apps/web/src/app/page.tsx`、`apps/web/src/lib/api/types.ts`、`crates/law-eye-api/src/routes/ai.rs`

- [x] [API-ERR-201] 统一 API 错误响应（body + OpenAPI）✅ routes 全量迁移为 `ApiResult` + `ApiError/AppError`（移除重复 `ErrorResponse`，4xx/5xx 统一携带 `code/request_id/details`）；补齐 OpenAPI `GET /api/v1/ai/available`；并修复 Core 的 `update_status/update/update_feedback` 将“记录不存在”正确映射为 404（避免误报 500）。验证：`pnpm -C apps/web test` ✅、`cargo test -p law-eye-api -p law-eye-core` ✅ - `crates/law-eye-api/src/error.rs`、`crates/law-eye-api/src/openapi.rs`、`crates/law-eye-api/src/routes/*.rs`、`crates/law-eye-core/src/{article,feedback,user}.rs`、`apps/web/package.json`

### HIGH（高优先级，第二轮改善）
- [x] [FE-ERR-301] 仪表盘关键卡片在 API 异常时显示 `0/空态`，存在“伪造业务数据”风险 ✅ 已改为错误态可视化（不展示 0）+ 一键重试（统计卡片/最新资讯/板块概览）- `apps/web/src/components/dashboard/{stats-cards,recent-articles,category-overview}.tsx`
- [x] [FE-ERR-302] 统计分析页在 sources/categories/trends 异常时展示 `0/空图`，易误导决策 ✅ 已改为 `—/错误态/重试`（含分类统计）并增加重试入口，避免将“错误”伪装成“真实 0” - `apps/web/src/app/analytics/page.tsx`
- [x] [FE-UX-303] 缺少全局 `error.tsx/not-found.tsx`（白屏/404 无反馈） ✅ 已补齐全局错误边界与 404 页面（可重试/返回首页/去搜索）- `apps/web/src/app/{error,not-found}.tsx`
- [x] [E2E-001] 关键用户流 E2E 回归（批判性审查）✅ Playwright 回归通过：注册/登录→Dashboard→文章列表/详情（收藏切换）→搜索（分页、短查询提示、API 故障时展示“搜索失败+重试”，恢复后可重试成功）→信息源（viewer 管理按钮 disabled，不触发 403）→反馈（提交后“我的反馈”即时可见）→数据管理（viewer 批量归档/发布/删除按钮显式 disabled，避免 403）。并修复：Search 结果摘要去除 HTML 标签、Data 批量操作按权限禁用+提示、Sources 创建表单移除未支持的 `api` 类型且后端校验 spider config/source_type - `apps/web/src/app/search/page.tsx`、`apps/web/src/app/data/page.tsx`、`apps/web/src/app/sources/page.tsx`、`apps/web/src/hooks/use-sources.ts`、`crates/law-eye-api/src/routes/sources.rs`

### HIGH（高优先级，第三轮改善）
- [x] [FE-CAT-401] Sidebar 板块/分类从后端动态加载 ✅ 使用 `GET /api/v1/categories` 渲染分类列表与“X 板块”数量，不再硬编码静态分类；支持 loading skeleton 与 error 重试；图标使用后端 `icon`（emoji）并按 `color` 渲染徽标（避免与 DB 不一致/假数据）- `apps/web/src/components/layout/sidebar.tsx`
- [x] [FE-SOURCE-401] Sources 添加信息源 spider 配置闭环 ✅ 前端新增 spider selector 配置输入（必填 list/title/link），并提交真实 `config`；后端对 `source_type` 与 spider config 做校验，阻止无效 spider 进入队列。实测：创建 spider source 后触发抓取，worker 日志出现 `Spidering page:` / `Spidered ... articles` / `Saved ... articles` - `apps/web/src/app/sources/page.tsx`、`apps/web/src/hooks/use-sources.ts`、`crates/law-eye-api/src/routes/sources.rs`
- [x] [DEV-401] Next Dev：配置 `allowedDevOrigins` ✅ 允许通过 `127.0.0.1`/`localhost` 访问 dev server，消除跨域告警并与未来版本要求对齐 - `apps/web/next.config.mjs`
- [x] [DEV-402] Loopback 访问：API baseUrl 自动对齐当前 host ✅ 当通过 `127.0.0.1`/`localhost` 打开前端时，API 请求自动切到同 host，避免 session cookie 域不一致导致登录态丢失（登录后回跳登录页/401）。实测：`http://127.0.0.1:8849/login` 登录后可进入 Dashboard - `apps/web/src/lib/api/client.ts`
- [x] [FE-SEARCH-402] Search 结果摘要断词/断句 ✅ 将 HTML 标签替换为空格并解码实体，避免 `</p><p>` 导致 `speechThe` 断词；同时剔除 `script/style` 内容。实测：`/search?q=Trump` 摘要段落间有空格 - `apps/web/src/app/search/page.tsx`

### MEDIUM（中优先级）
- [x] [FE-DATA-201] 数据管理页批量“归档/发布/删除”无真实实现（按钮无 onClick，且未接入后端 batch-status/delete）✅ 已接入后端：批量“归档/发布”调用 `POST /api/v1/articles/batch-status`，批量删除调用 `DELETE /api/v1/articles/{id}`（逐条并发）并新增删除确认弹窗；行内“操作”按钮改为可跳转详情（避免空壳）。Playwright 实测：发布后状态变更、删除后总数从 80→79（截图：`C:\\Users\\HP\\Downloads\\data-batch-actions-2026-01-25T20-31-09-326Z.png`）- `apps/web/src/app/data/page.tsx`、`apps/web/src/lib/api/types.ts`
- [x] [FE-NOTIF-101] Header 通知角标硬编码 `3`（无通知数据源，属于假数据）✅ 已移除硬编码角标，并将通知入口改为跳转真实“通知设置”Tab：`/settings?tab=notifications`（避免伪造未读数）；Playwright 实测：Header 不再展示假角标，点击铃铛直达通知设置（截图：`C:\\Users\\HP\\Downloads\\header-notif-settings-2026-01-25T20-16-51-835Z.png`）- `apps/web/src/components/layout/header.tsx`、`apps/web/src/app/settings/page.tsx`
- [x] [FE-BOOKMARK-201] 文章列表/滑动收藏为假实现：仅提示 Toast，未更新真实收藏状态（与详情页收藏不一致）✅ 已接入 `useReadingStore.bookmarks/toggleBookmark`：列表卡片展示真实收藏状态，点击/滑动收藏可切换并持久化到 `localStorage(lawsaw-reading)`；Playwright 实测：在 `/articles` 点击收藏后 `bookmarks` 写入文章 ID，UI 展示“已添加收藏/已取消收藏”（截图：`C:\\Users\\HP\\Downloads\\articles-bookmark-toggled-2026-01-25T20-07-31-279Z.png`）- `apps/web/src/app/articles/page.tsx`、`apps/web/src/stores/reading-store.ts`、`apps/web/src/components/article/article-card.tsx`、`apps/web/src/components/ui/swipeable-card.tsx`
- [x] [ANALYTICS-101] 统计分析页“近7天趋势”使用 `Math.random` 模拟数据（误导运营/决策）✅ 已新增 `GET /api/v1/articles/trends?days=7` 返回真实日趋势（包含 0 值日期），前端改为调用 `useArticleTrends(7)` 展示后端结果并移除随机数；Playwright 实测：`/analytics` 趋势日期/柱状图随真实数据变化（截图：`C:\\Users\\HP\\Downloads\\analytics-trend-real-2026-01-25T19-54-27-588Z.png`）- `crates/law-eye-core/src/article.rs`、`crates/law-eye-api/src/routes/articles.rs`、`crates/law-eye-api/src/openapi.rs`、`apps/web/src/app/analytics/page.tsx`、`apps/web/src/hooks/use-articles.ts`、`apps/web/src/lib/api/types.ts`
- [x] [PWA-101] 离线支持与 PWA（manifest + SW + 缓存策略）✅ 新增 `manifest`（`/manifest.webmanifest`）与 Service Worker（`/sw`），生产环境自动注册；缓存策略：静态资源 cache-first、导航请求 network-first + 离线兜底页、`/api/*` 默认不缓存；Chrome DevTools 实测：SW `activated` 且 `controller=true`，开启 Offline 后访问 `/login` 呈现“当前处于离线模式”离线页，恢复网络后正常渲染 - `apps/web/src/app/manifest.ts`、`apps/web/src/app/sw/route.ts`、`apps/web/src/app/layout.tsx`、`apps/web/src/components/providers/auth-provider.tsx`、`apps/web/next.config.mjs`
- [x] [CONSIST-101] 增加 API 契约校验（至少 schema 对齐/运行时断言）✅ 前端 `ApiClient` 支持按请求注入运行时断言（validator），并为关键响应实现 fail-fast 契约校验（带字段路径）；同时对齐前后端契约差异（`SemanticSearchResponse` 类型纠正、`DELETE /articles/{id}` 返回体建模、`User/Article` 字段可选性对齐）。Playwright 实测注册→登录→仪表盘→资讯列表可跑通，无契约校验报错 - `apps/web/src/lib/api/client.ts`、`apps/web/src/lib/api/types.ts`、`apps/web/src/hooks/{use-auth,use-articles,use-categories,use-sources,use-search}.ts`
- [x] [MCP-201] MCP 资源硬编码（mock）数据 ✅ 改为读取真实 Postgres：`laweye://categories` 使用 `CategoryService::list()`，`laweye://stats` 使用 `ArticleService::get_stats()` + SQL 统计 `categories/sources/users`；DB 失败返回 JSON-RPC `-32603`（不再伪造数据）。实测：连接 `law_eye` 库时 `categories_len=10`，`counts={categories:10,sources:5,users:14}`；连接 `postgres` 库（无表）时返回 `error.code=-32603` - `crates/law-eye-mcp/src/server.rs`
- [x] [AUTHZ-UI-101] 信息源管理页未按权限控制管理员操作（非管理员触发抓取/添加信息源会 403 且无提示）✅ 前端接入当前用户 roles/permissions 并对管理员操作做显式禁用；触发抓取/新增信息源增加 toast 成功/失败反馈；sources 列表加入轻量轮询以反映 worker 异步更新的 last_fetch/last_error。Playwright MCP 实测：viewer 账号按钮 disabled，不再产生 403；admin 账号触发抓取成功，worker 日志可见 `Saved ... articles from source ...` - `apps/web/src/stores/auth-store.ts`、`apps/web/src/components/providers/auth-provider.tsx`、`apps/web/src/hooks/use-auth.ts`、`apps/web/src/app/sources/page.tsx`、`apps/web/src/hooks/use-sources.ts`

### HIGH（第二轮改善）
- [x] [FE-KG-001] 知识图谱缺少“可视化画布 + 节点拖拽/缩放/平移”与对应 API 支撑（导致实体关系能力无法被验证/使用）✅ 已实现无限画布（节点拖拽、滚轮平移、Ctrl+滚轮缩放、空格拖拽平移）与实体列表/搜索/详情面板，并对接真实后端 `GET/POST /api/v1/knowledge/*`（top/search/entities/{id}/related/articles/backfill），无 mock 数据 - `apps/web/src/app/knowledge/page.tsx`、`apps/web/src/components/knowledge/{knowledge-canvas,entity-palette,entity-inspector}.tsx`、`apps/web/src/hooks/use-knowledge.ts`、`crates/law-eye-api/src/routes/knowledge.rs`
- [x] [FE-KG-002] 知识图谱画布交互缺陷（滚轮缩放失效/视图偶发重置/滚轮 preventDefault 报 passive 错误/触控无法平移缩放）✅ wheel 改为原生 `addEventListener({ passive: false })` 以确保可 `preventDefault`；初始化视图仅在 seed 首次加载时执行（ResizeObserver 仅更新尺寸，不再覆盖用户视图）；空格模式下节点拖拽让位于画布平移；拖拽/平移改为 `window pointermove/up/cancel` 监听（`setPointerCapture` 失败也可继续）；画布容器增加 `touch-action: none`（Tailwind：`touch-none`）以支持触屏单指拖拽平移/双指捏合缩放并避免页面滚动冲突，同时支持鼠标左键拖拽空白处平移。Playwright 实测：滚轮平移/ctrl+滚轮缩放/空格拖拽平移/左键空白处拖拽平移/节点拖拽/触屏单指平移/双指缩放/收起侧边栏后视图不重置 ✅ - `apps/web/src/components/knowledge/knowledge-canvas.tsx`
- [x] [OBS-101] 增加 Prometheus 指标采集与 `/metrics` 暴露（含生产环境访问保护）✅ 已安装 Prometheus recorder；新增 `/metrics`（非生产环境默认开放，生产环境需设置 `LAW_EYE__METRICS__TOKEN`，否则返回 404，且必须携带 `Authorization: Bearer <token>`）；新增 HTTP 请求计数/耗时指标：`http_requests_total`、`http_request_duration_seconds`（按 method/path/status 打标签，path 优先使用 MatchedPath 降低基数）- `crates/law-eye-api/src/main.rs`、`crates/law-eye-api/src/routes/mod.rs`、`crates/law-eye-api/src/state.rs`、`crates/law-eye-common/src/config.rs`、`.env.example`
- [x] [SEC-201] CORS/CSRF Origin allowlist 配置化（消除 `main.rs` 硬编码，支持多环境安全上线）✅ 新增 `server.allowed_origins` 配置（TOML + env 数组写法），并在 API 启动时规范化/去重（scheme://host[:port]，默认端口归一化）；生产环境若 allowlist 为空则 fail-fast 阻止误上线；CORS 与 CSRF 共用同一 allowlist（保持一致性）- `crates/law-eye-common/src/config.rs`、`config/default.toml`、`.env.example`、`crates/law-eye-api/src/main.rs`、`crates/law-eye-api/src/middleware/csrf.rs`
- [x] [SEC-202] API 增加 DoS 基础防护（请求超时 + 请求体大小上限）✅ 新增 `server.request_timeout_ms`（默认 30000ms，0 禁用）与 `server.max_body_bytes`（默认 1048576，0 禁用）；API 接入 `TimeoutLayer + HandleError`（超时 408/`REQUEST_TIMEOUT`，JSON，带 `request_id`）与 `DefaultBodyLimit`（超限 413，含 `x-request-id`）；生产环境若禁用会 warn。验证：`cargo test` ✅、`cargo clippy -- -D warnings` ✅、`pnpm -C apps/web test` ✅ - `crates/law-eye-common/src/config.rs`、`config/default.toml`、`crates/law-eye-api/src/main.rs`
- [x] [SEC-203] Web 依赖漏洞清零（pnpm audit）✅ 将 Next.js 升级至 `next@16.1.6` 并通过 `pnpm.overrides` 固定 `lodash@4.17.23`，验证：`pnpm -C apps/web audit` 输出 `No known vulnerabilities found` - `apps/web/package.json`、`apps/web/pnpm-lock.yaml`、`apps/web/tsconfig.json`、`apps/web/next-env.d.ts`
- [x] [OBS-102] 生产默认 JSON 结构化日志 + API 优雅停机 ✅ API/worker 在 `PRODUCTION` 下启用 tracing JSON（含 span 字段，便于集中检索 request_id）；API `axum::serve(...).with_graceful_shutdown(...)` 支持 SIGINT/SIGTERM 优雅停机；worker 同步支持 SIGINT/SIGTERM（退出循环前不崩溃）。验证：`cargo test` ✅、`cargo clippy -- -D warnings` ✅、`pnpm -C apps/web test` ✅ - `crates/law-eye-api/src/main.rs`、`crates/law-eye-worker/src/main.rs`

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

**报告生成时间**：2026-01-26  
**版本**：v2.2（本报告将随 Ralph Loop 修复持续更新）

---

## 修复任务清单（v2.6 / 2026-02-04）

> 来源：`prompts/audit/2.6audit.md`（42 维度逐项深度探查；问题总数口径：117 项）

### CRITICAL（P0，必须立即修复，22 项）
- [x] [SEC-C01] 审计日志覆盖不足（登录/登出、对象上传/下载等关键操作缺少审计落库） ✅ 已补齐 `auth.register/auth.login/auth.logout` 与 `objects.download` 审计落库（含 ip/user-agent）；用户头像上传审计已在 `ObjectService::upload_user_avatar` 内落库 - `crates/law-eye-api/src/routes/auth.rs`、`crates/law-eye-api/src/routes/objects.rs`、`crates/law-eye-core/src/object.rs`
- [x] [SEC-C02] 审计表 TRUNCATE 未阻止（需在 DB 侧硬阻断） ✅ 已在 DB 侧通过 `BEFORE TRUNCATE` 触发器硬阻断 - `crates/law-eye-db/migrations/*`
- [x] [SEC-C03] 路由级权限检查缺失（授权必须“默认拒绝 + 显式声明”，避免漏加） ✅ 新增 `RequirePermission` 默认拒绝守卫，并在路由装配层为所有受保护 router 显式声明权限策略（含 read/write），同时迁移补齐默认角色权限 - `crates/law-eye-api/src/middleware/auth_guard.rs`
- [x] [SEC-C04] 密码重置未实现（申请→发放 token→确认重置，全链路含风控与审计） ✅ 新增 `password_reset_tokens` 表与 `PasswordResetService`，补齐 `/password-reset/request|confirm`（防枚举、TTL、单次使用、审计）- `crates/law-eye-api/src/routes/auth.rs`、`crates/law-eye-core/src/password_reset.rs`、`crates/law-eye-db/migrations/*`
- [x] [SEC-C05] 前端表单验证不足（邮箱/密码复杂度/实时校验/确认密码等） ✅ 登录/注册已补齐邮箱正则、密码复杂度策略、确认密码、onBlur 实时提示与禁用提交 - `apps/web/src/components/auth/login-form.tsx`、`apps/web/src/components/auth/register-form.tsx`
- [x] [SEC-C06] Vault 单一 unseal key（需改为多份 shares + threshold，并避免密钥落盘到仓库） ✅ Vault init 改为 shares/threshold（默认 5/3，支持 env 覆盖），并确保 state 落盘不在仓库目录 - `scripts/enterprise/vault-init.sh`、`scripts/enterprise/vault-init-enterprise.sh`
- [x] [REL-C01] Worker 任务无超时（外部依赖/长任务必须可中断） ✅ ingest/ai/push 任务增加硬超时预算（小于 visibility timeout），超时走 retry/DLQ 并 ack reserved - `crates/law-eye-worker/src/main.rs`
- [x] [REL-C02] AI 429 无特殊处理（退避重试/预算/降级） ✅ LLM 网关对 rate_limit 失败输出 `AI_RATE_LIMITED retry_after_seconds=...`，队列侧识别并采用更长退避 + 可配置更大重试预算（避免因外部限流过早进 DLQ）- `crates/law-eye-ai/src/gateway.rs`、`crates/law-eye-queue/src/lib.rs`
- [x] [REL-C03] 队列 BRPOPLPUSH + ZADD 非原子（任务可能卡死/丢失语义） ✅ reserve 改为 Lua 原子 RPOPLPUSH+ZADD，并以 bounded polling 模拟 blocking pop；同时兼容 legacy payload - `crates/law-eye-queue/src/lib.rs`
- [x] [REL-C04] 延迟队列处理非原子（到期任务回迁存在竞态） ✅ delayed queue 回迁改为 Lua 原子批处理，避免 ZREM+RPUSH 分步导致丢任务 - `crates/law-eye-queue/src/lib.rs`
- [x] [REL-C05] 无熔断器（关键出站依赖需要隔离/快速失败/半开探测） ✅ 新增轻量 `CircuitBreaker`（Closed/Open/HalfOpen）并接入 LLM 网关；熔断打开时快速失败并带 `retry_after_seconds` 提示供队列延迟重试 - `crates/law-eye-common/src/circuit_breaker.rs`、`crates/law-eye-ai/src/gateway.rs`
- [x] [REL-C06] 无 CD 部署流程（自动发布/回滚/门禁） ✅ 增加 CD workflow（tag/workflow_dispatch 构建并推送 GHCR 镜像，避免 :latest 漂移），并补齐回滚/部署 Runbook - `.github/workflows/cd.yml`、`docs/runbooks/cd.md`
- [x] [PERF-C01] 前端未使用 Image 组件（图片优化缺失） ✅ 将头像与媒体缩略图从 `<img>` 迁移到 `next/image`；对 blob/data 与 http(s) 远程缩略图使用 `unoptimized + loader` 避免未配置域名导致运行时报错 - `apps/web/src/components/layout/header.tsx`、`apps/web/src/app/settings/page.tsx`、`apps/web/src/components/article/media-preview.tsx`
- [x] [PERF-C02] N+1 查询问题（随数据量指数放大） ✅ ingest 写入改为单次批量 upsert（替代逐条 exists+insert），并在 worker 内部去重 link，避免同批重复写入 - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-core/src/article.rs`
- [x] [PERF-C03] 文章逐条 INSERT（应批量写入/Upsert） ✅ 新增 `ArticleService::upsert_many`：`INSERT ... ON CONFLICT (tenant_id, link) DO UPDATE ... WHERE changed RETURNING id`，仅对插入/变更的文章返回 id 并触发后续 AI 任务 - `crates/law-eye-core/src/article.rs`、`crates/law-eye-worker/src/main.rs`
- [x] [PERF-C04] 全量读取对象到内存（大文件 OOM 风险；应流式传输） ✅ `ObjectService` 改为返回 S3 `ByteStream`；API 下载端点直接将其包装为 `axum::body::Body` 进行流式响应（避免 `.collect()`/Vec 全量驻留）- `crates/law-eye-core/src/object.rs`、`crates/law-eye-api/src/routes/objects.rs`
- [x] [DATA-C01] 批量操作无数量限制（DoS/锁表风险） ✅ `batch-status` 写接口增加硬上限（`MAX_BATCH_STATUS_IDS=200`），拒绝超量请求以避免锁表/长事务与内存放大 - `crates/law-eye-api/src/routes/articles.rs`
- [x] [DATA-C02] 状态同步/冲突解决缺失（ETag/If-Match/乐观并发/冲突 UI） ✅ articles 已实现 `ETag: "v{version}"` + 强制 `If-Match`（缺失 428 / 不匹配 409），前端写操作携带 `If-Match` 并在 409 时提示刷新重试 - `crates/law-eye-db/migrations/015_articles_version_soft_delete.sql`、`crates/law-eye-api/src/routes/articles.rs`、`apps/web/src/lib/api/client.ts`、`apps/web/src/app/data/page.tsx`、`apps/web/src/components/providers/auth-provider.tsx`
- [x] [DATA-C03] 无软删除机制（需一致化全表查询/索引/约束/恢复策略） ✅ 统一引入 `deleted_at` 软删除基线迁移，并在核心读/写路径默认过滤软删记录；对 objects 唯一索引改为 `WHERE deleted_at IS NULL` 以支持 key 复用与恢复 - `crates/law-eye-db/migrations/016_soft_delete_baseline.sql`、`crates/law-eye-core/src/category.rs`、`crates/law-eye-core/src/feedback.rs`、`crates/law-eye-core/src/knowledge.rs`、`crates/law-eye-core/src/rag.rs`、`crates/law-eye-worker/src/main.rs`
- [x] [DATA-C04] 补偿删除失败被忽略（对象存储/元数据一致性） ✅ objects 表增加 purge 补偿字段（attempt/backoff/error），软删后异步 purge，失败不再静默吞掉并自动重试 - `crates/law-eye-db/migrations/017_objects_purge_compensation.sql`、`crates/law-eye-common/src/config.rs`、`crates/law-eye-core/src/object.rs`、`crates/law-eye-api/src/main.rs`
- [x] [DEP-C01] 缺少 cargo-audit（供应链门禁） ✅ CI Rust job 已集成 `cargo install cargo-audit --locked` + `cargo audit --deny warnings` - `.github/workflows/ci.yml`
- [x] [I18N-C01] 国际化未实现（Locale 路由/文案/格式化/后端消息） ✅ Web 实现 `zh/en` locale 路由（middleware 重定向 + cookie 记忆 + SSR lang 对齐），新增翻译资源与 `formatDateTime/formatNumber`，并迁移认证/看板/离线页等关键文案；后端补充最小化 locale 解析与基于 `code` 的可翻译消息骨架 - `apps/web/src/middleware.ts`、`apps/web/src/app/layout.tsx`、`apps/web/src/lib/i18n.ts`、`apps/web/src/lib/i18n-client.ts`、`apps/web/src/app/sw/route.ts`、`crates/law-eye-common/src/i18n.rs`

---

## v2.6 非 P0 问题落实清单（P1/P2/P3）

> 来源：`prompts/audit/2.6audit.md`（42 维度表格中的 HIGH/MEDIUM/LOW 行，共 95 项）
> 目标：逐项核对“是否已被代码与测试消灭”，未消灭则修复后补证据并勾选。

### HIGH（P1，33 项）
- [x] [V26-H001] 无实时验证反馈（onBlur/onChange） ✅ 登录/注册表单已引入 `touched` 状态 + `onBlur` 标记；错误提示随输入实时更新，提交前统一校验并禁用提交 - `apps/web/src/components/auth/login-form.tsx`、`apps/web/src/components/auth/register-form.tsx`
- [x] [V26-H002] API Client 层无自动重试 ✅ `ApiClient` 为幂等方法（GET/HEAD/OPTIONS）提供默认重试（2 次，指数退避+抖动；仅对网络错误/超时/429/5xx/408），并在 QueryClient 禁用 retry 避免“双重重试”放大流量 - `apps/web/src/lib/api/client.ts`、`apps/web/src/lib/query-client.ts`
- [x] [V26-H003] 无防抖节流实现 ✅ 搜索页输入采用 400ms 防抖自动同步 `q` 与结果（`router.replace` 避免历史污染）；同时仍保留提交搜索，避免键入阶段请求风暴 - `apps/web/src/app/search/page.tsx`
- [x] [V26-H004] 无 Background Sync API ✅ Service Worker 增加 IndexedDB Outbox + `sync` 事件（`law-eye-outbox-sync`），离线写入可入队并在恢复网络后自动投递；同时在导航/激活阶段 opportunistic flush（兼容无 Sync 浏览器）- `apps/web/src/app/sw/route.ts`、`apps/web/src/app/feedback/page.tsx`
- [x] [V26-H005] 无推送通知 (Web Push) ✅ 增加 Web Push 订阅管理（vapid-public-key/subscribe/unsubscribe/test），Service Worker 支持 push 展示与点击跳转；设置页提供启用/禁用/测试；订阅落库并审计；订阅/投递端点做 SSRF 防护（仅 https，阻断内网） - `crates/law-eye-api/src/routes/push.rs`、`crates/law-eye-core/src/push.rs`、`crates/law-eye-db/migrations/018_web_push_subscriptions.sql`、`apps/web/src/app/settings/page.tsx`、`apps/web/src/app/sw/route.ts`、`.env.example`、`README.md`
- [x] [V26-H006] **无冲突解决 UI** - Last-write-wins 隐式策略 ✅ 增加全局并发冲突处理弹窗（409/412/428），提供软刷新（invalidate+router.refresh）/强制刷新/复制调试详情，并在 toast 中提供“处理冲突”入口 - `apps/web/src/components/providers/auth-provider.tsx`
- [x] [V26-H007] Worker 缺少 HTTP 健康端点 ✅ Worker 增加 `/health/live`（不依赖外部）与 `/health/ready`（Postgres+Redis ping + shutdown 感知，2s 超时）并兼容 `/health`；新增 `worker.health_*` 配置项可独立设置健康端口 - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-common/src/config.rs`、`config/default.toml`
- [x] [V26-H008] `law-eye-api/src/routes/articles.rs` | **1059** - 拆分查询/命令 ✅ 将 Articles 路由按 Query/Command 分组为 `articles::query` 与 `articles::command`（OpenAPI paths 同步），降低单文件认知复杂度并为后续分页/写入优化铺路 - `crates/law-eye-api/src/routes/articles.rs`、`crates/law-eye-api/src/openapi.rs`
- [x] [V26-H009] **chunks 逐条 INSERT** - `main.rs` | 875-903 ✅ `article_chunks` 写入改为 `QueryBuilder` 批量 upsert（200/批），避免每个 chunk 一次 SQL 往返；同时保留维度校验与软删除旧 chunk 的一致性事务 - `crates/law-eye-worker/src/main.rs`
- [x] [V26-H010] 仅使用 offset 分页 - 所有列表 API ✅ 全部列表接口新增 cursor(keyset) 分页：apikeys/articles/feedbacks/sources/users/search 支持 base64url 游标；响应返回 next_cursor（或 header `x-next-cursor`）且 cursor 模式下 offset 自动忽略 - `crates/law-eye-api/src/pagination.rs`、`crates/law-eye-api/src/routes/{apikeys,articles,feedbacks,sources,users,search}.rs`、`crates/law-eye-core/src/{article,source,user}.rs`
- [x] [V26-H011] 文章内容无长度限制 - 无 max_body_size 验证 ✅ Core 层对 title/content/summary 增加最大字节数校验（超限返回 Validation），Worker ingest 写入前对 title/content 做 UTF-8 边界安全截断以避免任务失败；API 侧全局 `DefaultBodyLimit` 仍保留作为第一道防线 - `crates/law-eye-core/src/article.rs`、`crates/law-eye-worker/src/main.rs`、`crates/law-eye-api/src/main.rs`
- [x] [V26-H012] 硬编码中文字符串 - 58个文件 ✅ 引入轻量 i18n（英文文案即 key）+ locale 路由基建（middleware/[locale]）；将前端中文硬编码统一迁移为 `t("...")`，中文集中到 `zh.json`；并复扫确认 `apps/web/src/**/*.ts(x)` 不含汉字硬编码 - `apps/web/src/lib/i18n.ts`、`apps/web/src/lib/i18n-client.ts`、`apps/web/src/middleware.ts`、`apps/web/src/app/{analytics,data,feedback,settings}/page.tsx`、`apps/web/src/messages/zh.json` (2.6audit.md:223)
- [x] [V26-H013] 无测试覆盖率工具 - 无 tarpaulin/istanbul ✅ CI 集成 Rust tarpaulin 覆盖率（lcov artifact）+ Web Vitest（Istanbul provider）覆盖率（coverage artifact）；本地新增 `pnpm -C apps/web coverage` 与 README 覆盖率指引 - `.github/workflows/ci.yml`、`apps/web/package.json`、`apps/web/vitest.config.ts`、`apps/web/src/lib/i18n.test.ts`、`README.md` (2.6audit.md:230)
- [x] [V26-H014] 邮箱验证 - 未实现 ✅ 增加 `email_verification_tokens`（RLS + 单次使用 + TTL）与 `users.email_verified_at`；实现 EmailVerificationService（生成/消费/校验 token）并新增 Auth API：`/api/v1/auth/email-verification/request|confirm`（避免账号枚举，非生产返回 debug_token）；补充 `.env.example` 与 README 指引 - `crates/law-eye-db/migrations/019_email_verification_tokens.sql`、`crates/law-eye-db/src/models.rs`、`crates/law-eye-core/src/email_verification.rs`、`crates/law-eye-api/src/state.rs`、`crates/law-eye-api/src/routes/auth.rs`、`crates/law-eye-api/src/openapi.rs`、`crates/law-eye-api/src/auth.rs`、`crates/law-eye-api/src/middleware/rate_limit.rs`、`.env.example`、`README.md` (2.6audit.md:241)
- [x] [V26-H015] DB 成功但 Redis 入队失败无回滚 ✅ 引入 DB outbox（`queue_outbox`）+ worker 周期 flush，Redis 故障时任务不丢/可重试 - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-db/migrations/020_queue_outbox.sql`、`crates/law-eye-core/src/article.rs` (2.6audit.md:262)
- [x] [V26-H016] **无蓝绿/金丝雀部署** ✅ 引入 Argo Rollouts 蓝绿/金丝雀发布模板 + 可执行部署工作流 - `infra/k8s/*`、`.github/workflows/deploy.yml`、`docs/runbooks/cd.md` (2.6audit.md:283)
- [x] [V26-H017] **无回滚机制** ✅ 补齐 Rollouts `undo/abort/promote` 操作手册与 GitHub Actions 一键控制 - `.github/workflows/deploy.yml`、`docs/runbooks/cd.md`、`infra/k8s/README.md` (2.6audit.md:284)
- [x] [V26-H018] API 层无幂等 key ✅ 新增 `Idempotency-Key` 中间件（持久化响应/冲突检测/TTL）并放行 CORS 头 - `crates/law-eye-api/src/middleware/idempotency.rs`、`crates/law-eye-db/migrations/021_idempotency_keys.sql`、`crates/law-eye-api/src/main.rs` (2.6audit.md:299)
- [x] [V26-H019] 无事件版本控制 ✅ 为审计/事件日志补齐 `event_version`（默认 1）以支持未来 schema 演进 - `crates/law-eye-db/migrations/022_audit_logs_event_version.sql`、`crates/law-eye-db/src/models.rs`、`crates/law-eye-core/src/audit.rs` (2.6audit.md:307)
- [x] [V26-H020] 前后端类型未同步 - 无 TypeScript 类型生成 ✅ 固化 OpenAPI JSON（`--dump-openapi` → `resource/openapi.v1.json`）并用 `openapi-typescript` 生成前端类型（`apps/web/src/lib/api/generated/openapi.ts`），CI 强制检查漂移 - `crates/law-eye-api/src/main.rs`、`resource/openapi.v1.json`、`apps/web/package.json`、`apps/web/src/lib/api/generated/openapi.ts`、`.github/workflows/ci.yml` (2.6audit.md:315)
- [x] [V26-H021] 无孤儿对象清理任务 ✅ Worker 增加对象“孤儿清理”任务：标记无引用对象（soft delete）、purge 软删除对象（S3/MinIO 删除+锁+重试）、以及清扫存储侧无 DB 记录对象 - `crates/law-eye-worker/src/main.rs`、`crates/law-eye-core/src/object.rs`、`crates/law-eye-db/migrations/023_objects_purge_state.sql`、`crates/law-eye-db/src/models.rs` (2.6audit.md:332)
- [ ] [V26-H022] **无 Range 请求支持** - - | - (2.6audit.md:341)
- [ ] [V26-H023] 无行级版本/乐观锁 - 并发更新无保护 (2.6audit.md:350)
- [ ] [V26-H024] **Root token 存文件** - `vault-init.sh` | 58 (2.6audit.md:375)
- [ ] [V26-H025] **PostgreSQL 无 TDE** - 磁盘数据明文 (2.6audit.md:395)
- [ ] [V26-H026] **MinIO 无 SSE** - 对象存储明文 (2.6audit.md:396)
- [ ] [V26-H027] 无专用权限审计 API - 依赖通用日志 (2.6audit.md:416)
- [ ] [V26-H028] **文件上传/下载未审计** - `ObjectService` | - (2.6audit.md:426)
- [ ] [V26-H029] **限流仅内存存储** - 多实例不共享 (2.6audit.md:435)
- [ ] [V26-H030] **AI 服务无降级** - 失败直接返回错误 (2.6audit.md:436)
- [ ] [V26-H031] **无 Webhook 支持** - 无出站事件通知 (2.6audit.md:445)
- [ ] [V26-H032] MCP 无认证 - `server.rs` 未验证 (2.6audit.md:446)
- [x] [V26-H033] 密码策略仅长度>=8 - 无复杂度 ✅ 注册密码策略已升级为严格复杂度校验（>=12、大小写/数字/符号、禁空白）并提供强度提示/检查列表 - `apps/web/src/components/auth/register-form.tsx`

### MEDIUM（P2，44 项）
- [x] [V26-M001] 无密码强度指示器 ✅ 注册表单已展示强度标签（弱/中/强）并列出校验项（长度/大小写/数字/符号）- `apps/web/src/components/auth/register-form.tsx`
- [x] [V26-M002] 无确认密码字段 ✅ 注册表单已补齐确认密码字段与一致性校验（含 aria-invalid 与错误提示）- `apps/web/src/components/auth/register-form.tsx`
- [ ] [V26-M003] 无请求去重机制 - `client.ts` | - (2.6audit.md:48)
- [ ] [V26-M004] 无通用面包屑组件 - 全局 (2.6audit.md:58)
- [ ] [V26-M005] 无长按手势支持 - 全局 | - (2.6audit.md:68)
- [ ] [V26-M006] 软键盘弹出无布局调整 - 全局 | - (2.6audit.md:69)
- [ ] [V26-M007] 无网络状态检测 UI - 全局 (2.6audit.md:81)
- [ ] [V26-M008] 无 IndexedDB 持久化 - 全局 (2.6audit.md:82)
- [ ] [V26-M009] 缺少 MinIO/S3 健康检查 - `health.rs` (2.6audit.md:104)
- [ ] [V26-M010] 缺少 AI 服务健康检查 - `health.rs` (2.6audit.md:105)
- [ ] [V26-M011] Spider 不抓取文章内容详情 - `spider.rs` | 96-97 (2.6audit.md:117)
- [ ] [V26-M012] `allowed_origins` 默认含多个 localhost - `config.rs` | 174-189 (2.6audit.md:124)
- [ ] [V26-M013] `law-eye-core/src/article.rs` | **787** - 拆分服务层 (2.6audit.md:136)
- [ ] [V26-M014] `law-eye-api/src/routes/knowledge.rs` | **680** - - (2.6audit.md:137)
- [ ] [V26-M015] 无查询结果缓存 - 全局 | - (2.6audit.md:149)
- [ ] [V26-M016] 无 AI 结果缓存 - 全局 | - (2.6audit.md:150)
- [ ] [V26-M017] npm audit 无 CI 集成 - package.json 无 audit 脚本 (2.6audit.md:173)
- [ ] [V26-M018] 无 ETag/Last-Modified 缓存头 - 全局 (2.6audit.md:194)
- [ ] [V26-M019] Worker 错误消息未脱敏 - `main.rs:492` (2.6audit.md:205)
- [ ] [V26-M020] 日期/数字格式化硬编码 - 无 Intl API (2.6audit.md:224)
- [ ] [V26-M021] 无圈复杂度检查 - 无 cognitive_complexity (2.6audit.md:231)
- [ ] [V26-M022] OAuth/SSO - 未实现 (2.6audit.md:242)
- [ ] [V26-M023] MFA 支持 - 未实现 (2.6audit.md:243)
- [ ] [V26-M024] 入队单独 RPUSH 无事务 - `lib.rs` | 78-93 (2.6audit.md:253)
- [ ] [V26-M025] AI Full 任务部分成功无法区分 - - (2.6audit.md:263)
- [ ] [V26-M026] Redis 无显式超时配置 - - (2.6audit.md:272)
- [ ] [V26-M027] HTTP 请求无自动重试 - - (2.6audit.md:273)
- [ ] [V26-M028] 无容器扫描 (Trivy) - - (2.6audit.md:285)
- [ ] [V26-M029] 数据库无 upsert 模式 - INSERT 而非 ON CONFLICT (2.6audit.md:300)
- [ ] [V26-M030] 无事件溯源 - 无 Event Sourcing (2.6audit.md:308)
- [ ] [V26-M031] 多消费者无顺序保证 - FIFO 仅单消费者 (2.6audit.md:309)
- [ ] [V26-M032] 无 API 契约测试 - - (2.6audit.md:316)
- [ ] [V26-M033] 无对象生命周期管理 - - | - (2.6audit.md:333)
- [ ] [V26-M034] 无预览缓存 - - | - (2.6audit.md:342)
- [ ] [V26-M035] 无自动密钥轮换调度 - - | - (2.6audit.md:376)
- [ ] [V26-M036] 无备份加密 - - (2.6audit.md:397)
- [ ] [V26-M037] 无日志保留策略 - - (2.6audit.md:410)
- [ ] [V26-M038] 无实时变更通知 - - (2.6audit.md:417)
- [ ] [V26-M039] 无定期审计报告 - - (2.6audit.md:418)
- [ ] [V26-M040] 审计需手动调用 - 非自动触发 | - (2.6audit.md:427)
- [ ] [V26-M041] 无事件总线 - 缺乏发布/订阅 (2.6audit.md:447)
- [ ] [V26-M042] CSRF 跳过逻辑 - 非 auth 路径 (2.6audit.md:461)
- [ ] [V26-M043] 动态 SQL 拼接 - `audit.rs` | 91-117 (2.6audit.md:467)
- [ ] [V26-M044] 无慢查询监控 - - | - (2.6audit.md:469)

### LOW（P3，18 项）
- [ ] [V26-L001] 无路由过渡动画 - 全局 (2.6audit.md:59)
- [ ] [V26-L002] 安全区域仅部分组件使用 - - | - (2.6audit.md:70)
- [ ] [V26-L003] Spider `delay_ms` 配置未使用 - `spider.rs` | 16 (2.6audit.md:115)
- [ ] [V26-L004] Push 限制10条无分页 - `main.rs` | 1000 (2.6audit.md:116)
- [ ] [V26-L005] AI `api_key` 为空不报错只禁用 - `main.rs` | 1124-1134 (2.6audit.md:125)
- [ ] [V26-L006] 无配置热重载支持 - 全局 | - (2.6audit.md:126)
- [ ] [V26-L007] `law-eye-common/src/config.rs` | **567** - 拆分结构体/加载逻辑 (2.6audit.md:138)
- [ ] [V26-L008] 部分图标缺少 `aria-hidden` - 多处 (2.6audit.md:157)
- [ ] [V26-L009] 缺少跳转到主内容链接 - `layout.tsx` (2.6audit.md:158)
- [ ] [V26-L010] metrics crate 版本旧 (0.21) - 最新 0.22+ (2.6audit.md:174)
- [ ] [V26-L011] lodash override 版本异常 - 4.17.23 非官方版本 (2.6audit.md:175)
- [ ] [V26-L012] sessions/roles 无 tenant_id - 全局共享 (2.6audit.md:186)
- [ ] [V26-L013] 部分函数缺少文档注释 - - (2.6audit.md:232)
- [ ] [V26-L014] 无循环依赖检测工具 - 建议 cargo-deny (2.6audit.md:324)
- [ ] [V26-L015] 无 DI 容器 - 构造函数注入 (2.6audit.md:325)
- [ ] [V26-L016] API 版本单一 - 仅 v1 (2.6audit.md:351)
- [ ] [V26-L017] SET ROLE 注入风险 - `lib.rs` | 52 (2.6audit.md:468)
- [ ] [V26-L018] 连接池无健康检查 - 无 test_before_acquire | - (2.6audit.md:470)
