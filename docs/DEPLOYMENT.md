# LawSaw — Deployment Guide

本指南覆盖 LawSaw 在生产/预发环境的端到端部署流程，包括基础设施依赖、环境变量、迁移执行、服务启动、健康检查、多租户隔离、任务队列、备份与安全。所有内容基于仓库当前实装，**不包含未落地的特性**。

## 1. System Requirements

### 1.1 PostgreSQL

- **版本**：PostgreSQL 16+（官方 image 推荐 `pgvector/pgvector:pg16`）
- **必需扩展**（在 fresh DB 上由 migration `001_initial.sql` 创建）：
  - `pgvector`（语义检索，cosine `<=>` 算子）
  - `pg_trgm`（模糊匹配）
  - `pgcrypto`（`gen_random_uuid()`）
  - `uuid-ossp`（备用 UUID 生成）
- **角色**：迁移 `007_rls_enforcement.sql` + `038_auth_compatible_rls.sql` 创建 `law_eye_app` 应用角色（运行时通过 `LAW_EYE__DATABASE__SESSION_ROLE=law_eye_app` 启用），该角色受 RLS 强制约束；`law_eye` owner 角色用于 DDL/迁移
- **pgvector image 注意**：使用 `pgvector/pgvector:pg16` 时，应用迁移会把 `law_eye` 角色降权（迁移 007 内部调整 owner+grants），需确保 docker-compose 的 `POSTGRES_USER` 与 `LAW_EYE__DATABASE__URL` 主用户对齐

### 1.2 Redis

- **版本**：Redis 7+（cluster 不强制；单实例足以承载 cache + task queue）
- **用途**：双重职责
  - `CacheService`（`law-eye-common/src/cache.rs`）—— 业务缓存
  - `TaskQueue`（`law-eye-queue/src/lib.rs`）—— 任务队列 + DLQ（dead letter queue）
- 两者**共享同一个 Redis URL**，通过不同 key namespace 隔离

### 1.3 S3-Compatible Object Storage

- **支持后端**：MinIO（推荐 self-host）/ AWS S3 / 任何 S3 API 兼容服务
- **桶**：单租户单桶足够；多租户在 object_key 前缀里 hash（`{tenant_id}/...`）
- **SSE**：建议生产开启（`LAW_EYE__OBJECT_STORAGE__SSE_ENABLED=true`，AES256）
- **未配置时**：API 拒绝 objects 上传/下载相关 endpoint，但其他业务能力正常工作

### 1.4 LLM Gateway（可选）

- **OpenAI 兼容 API**：默认 SiliconFlow（`https://api.siliconflow.cn/v1`），可切换为 OpenAI 官方
- **使用场景**：文章 AI 处理（embedding / chat completion / rerank）、知识图谱、报告生成
- **未配置时**：rule-based 降级（health check 标记 `degraded` reason="rule-based fallback"）

### 1.5 浏览器渲染（可选，仅爬虫需要）

- **Browserless**（headless Chrome）—— 用于 JS 动态渲染页面
- 通过 `docker compose --profile crawler up` 启动，或指向外部实例
- 不影响 API + Worker 主流程

## 2. Environment Variables

`.env.example` 是单一真实来源（52 个非注释 env vars）。下面按职能分组。

### 2.1 数据库连接

| 变量 | 说明 |
|---|---|
| `LAW_EYE__DATABASE__URL` | PostgreSQL 连接字符串 |
| `LAW_EYE__DATABASE__MAX_CONNECTIONS` | 连接池上限（默认 10） |
| `LAW_EYE__DATABASE__SESSION_ROLE` | 应用角色（生产必填 `law_eye_app`） |
| `POSTGRES_PASSWORD` | docker-compose 启动 PG 时使用 |

### 2.2 Redis

| 变量 | 说明 |
|---|---|
| `LAW_EYE__REDIS__URL` | Redis 连接 URL |
| `LAW_EYE__REDIS__POOL_WAIT_TIMEOUT_MS` | 池等待超时 |
| `LAW_EYE__REDIS__POOL_CREATE_TIMEOUT_MS` | 创建超时 |
| `LAW_EYE__REDIS__POOL_RECYCLE_TIMEOUT_MS` | 回收超时 |
| `REDIS_PASSWORD` | docker-compose 启动 Redis 时使用 |

### 2.3 对象存储

| 变量 | 说明 |
|---|---|
| `LAW_EYE__OBJECT_STORAGE__ENABLED` | 总开关 |
| `LAW_EYE__OBJECT_STORAGE__ENDPOINT` | S3 endpoint URL |
| `LAW_EYE__OBJECT_STORAGE__REGION` | 区域 |
| `LAW_EYE__OBJECT_STORAGE__BUCKET` | 桶名 |
| `LAW_EYE__OBJECT_STORAGE__ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` | 访问凭据 |
| `LAW_EYE__OBJECT_STORAGE__FORCE_PATH_STYLE` | MinIO 必须 `true` |
| `LAW_EYE__OBJECT_STORAGE__SSE_ENABLED` | 服务端加密 |
| `LAW_EYE__OBJECT_STORAGE__PURGE_*` | 软删后异步清理参数 |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | docker-compose 启动 MinIO 时使用 |

### 2.4 认证 / OAuth / MFA / Web Push

| 变量 | 说明 |
|---|---|
| `LAW_EYE__AUTH__PASSWORD_RESET_TTL_SECONDS` | 重置 token TTL |
| `LAW_EYE__AUTH__EMAIL_VERIFICATION_TTL_SECONDS` | 邮箱验证 token TTL |
| `WEB_PUSH_VAPID_PUBLIC_KEY` / `PRIVATE_KEY` / `SUBJECT` | Web Push 推送的 VAPID 配置 |
| `PRODUCTION` | 生产模式（启用 secure cookie） |

注意：MFA TOTP secret 与 OAuth refresh token 在 DB 内通过 `SensitiveStringCipher` 加密，不通过 env 暴露明文。

### 2.5 AI Gateway

| 变量 | 说明 |
|---|---|
| `LAW_EYE__AI__API_KEY` | LLM provider API key |
| `LAW_EYE__AI__BASE_URL` | OpenAI 兼容 endpoint |
| `LAW_EYE__AI__MODEL` | chat 模型 |
| `LAW_EYE__AI__EMBEDDING_MODEL` | embedding 模型 |
| `LAW_EYE__AI__EMBEDDING_VECTOR_DIM` | 向量维度（必须与 DB schema 一致：1024 for bge-m3） |
| `LAW_EYE__AI__EMBEDDING_DIMENSION_STRATEGY` | `strict`（生产）/ `pad_or_truncate`（联调） |
| `LAW_EYE__AI__RERANK_*` | 独立 rerank endpoint 配置 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | 备用：legacy 路径仍读这两个 env，作为 LlmGateway 的 fallback |

### 2.6 监控 / Metrics

| 变量 | 说明 |
|---|---|
| `LAW_EYE__METRICS__TOKEN` | `/metrics` Bearer token（生产必填，未填则返 404） |
| `LAW_EYE__WORKER__HEALTH_ENABLED` / `HOST` / `PORT` | Worker health endpoint 配置 |
| `LAW_EYE__WORKER__HEALTH_CHECK_TIMEOUT_MS` | health probe 超时 |
| `RUST_LOG` | tracing 日志级别 |

### 2.7 Feature Flags / 安全

| 变量 | 说明 |
|---|---|
| `LAW_EYE__CONFIG_RELOAD__ENABLED` | 配置热重载开关 |
| `LAW_EYE__CONFIG_RELOAD__INTERVAL_SECONDS` | 热重载轮询间隔 |
| `LAW_EYE__ENCRYPTION__FEEDBACKS__*` | feedbacks 表字段加密（含 backfill 配置） |
| `LAW_EYE__SECRETS__VAULT__ENABLED` | Vault 集成（企业模式） |
| `LAW_EYE__SECURITY__ALLOW_INTERNAL_WEBHOOK_URLS` | 是否允许 webhook 投递到内网 URL（默认拒绝防 SSRF） |
| `LAW_EYE__RATE_LIMIT__*` | login / register / password-reset / email-verify / api 五类限流 |

### 2.8 Spider / Crawler

| 变量 | 说明 |
|---|---|
| `LAW_EYE__SPIDER__HTTP_MAX_RETRIES` | HTTP 重试次数 |
| `LAW_EYE__SPIDER__HTTP_RETRY_BASE_DELAY_MS` | 重试基础退避 |
| `LAW_EYE__SPIDER__HTTP_RETRY_MAX_DELAY_MS` | 重试最大退避 |
| `LAW_EYE__BROWSERLESS__URL` / `TOKEN` / `TIMEOUT_MS` | Browserless 动态渲染 |
| `LAW_EYE__PUSH__PREVIEW_LIMIT` | 推送预览条数 |

### 2.9 MCP（Model Context Protocol）

| 变量 | 说明 |
|---|---|
| `LAW_EYE_MCP_AUTH_TOKEN` | MCP server 鉴权（必须与 client initialize 的 auth_token 一致） |

完整列表请直接查阅仓库根 `.env.example`。

## 3. Database Migrations

### 3.1 数量与顺序

仓库当前 **73 个 SQL 迁移**（`001_initial.sql` 到 `074_tenant_exports.sql`），顺序敏感，必须严格按文件名升序应用。

### 3.2 推荐：sqlx CLI

```bash
# 安装 sqlx-cli（一次性）
cargo install sqlx-cli --no-default-features --features postgres,rustls

# 应用所有迁移
sqlx migrate run --source crates/law-eye-db/migrations \
  --database-url "$LAW_EYE__DATABASE__URL"

# dry-run 检查
sqlx migrate info --source crates/law-eye-db/migrations \
  --database-url "$LAW_EYE__DATABASE__URL"
```

### 3.3 备选：psql 直接顺序执行

```bash
for f in crates/law-eye-db/migrations/*.sql; do
  echo "Applying $f"
  psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

### 3.4 已知特性

- **Fresh-DB bootstrap 时间**：约 69s（参考 b5-routes Phase F.8 实测）
- **Idempotency**：所有迁移用 `IF NOT EXISTS` / `IF EXISTS` 写法，可重复运行
- **Search path**：每个迁移开头 `SET search_path TO public;`
- **app.tenant_id 默认值**：多张表 (`articles` / `categories` / `feedbacks` / `objects` / `ai_usage_events` / ...) 在 `tenant_id` 列上设了 `DEFAULT current_setting('app.tenant_id')::uuid`；插入时无需显式 bind，但**必须先 SET LOCAL app.tenant_id**

### 3.5 RLS

- 凡含 `tenant_id` 的业务表都启 `ENABLE + FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy（USING + WITH CHECK）
- Policy 表达式：`tenant_id::text = current_setting('app.tenant_id', true)`
- 应用通过 `law_eye_core::tenant::with_tenant_tx(pool, tenant_id, |tx| ...)` 包裹，事务级 `set_config('app.tenant_id', $1, true)` 后自动 commit

## 4. Service Startup

### 4.1 API（`crates/law-eye-api`）

```bash
cargo run --release --bin law-eye-api
```

监听 `LAW_EYE__SERVER__HOST:LAW_EYE__SERVER__PORT`（默认 `0.0.0.0:3001`）。

### 4.2 Worker（`crates/law-eye-worker`）

```bash
cargo run --release --bin law-eye-worker
```

消费 7 个 Redis 队列（详见 §7）。Worker 监听独立 health port（默认 `3002`）。

### 4.3 前端（`apps/web`）

```bash
cd apps/web
pnpm install
pnpm typecheck   # 必须 EXIT 0
pnpm build
pnpm start
```

Next.js 15 / React 19，端口默认 `8849`。

### 4.4 docker-compose（推荐本地）

仓库提供 `scripts/no-dockerhub/start-stack.sh`，自动在 user state 目录生成 `secrets.env` 后 up 整个 stack（PG + Redis + MinIO + API + Worker + Web）。生产环境建议拆分到 K8s 或托管 PaaS。

## 5. Health Checks & Observability

### 5.1 Health Endpoints

| 路径 | 用途 | 鉴权 |
|---|---|---|
| `GET /health` 或 `/health/ready` | k8s readiness probe（postgres + redis ping） | 公开 |
| `GET /health/live` | k8s liveness probe（无外部依赖） | 公开 |
| `GET /health/full` 或 `/api/v1/health/full` | 完整 5 子系统聚合：database / redis / task_queue / object_store / ai_gateway | 公开 |
| `GET /health/slow-queries` | pg_stat_statements 慢查询报告 | 生产需 metrics_token |

`/health/full` 输出 shape：

```json
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "database":     { "status": "ok", "latency_ms": 3 },
    "redis":        { "status": "ok" | "not_configured", "latency_ms": 1 },
    "task_queue":   { "status": "ok", "depths": { "queue:ingest": 0, ... } },
    "object_store": { "status": "ok" | "not_configured", "latency_ms": 12 },
    "ai_gateway":   { "status": "ok" | "skipped", "reason": "no API key" }
  },
  "version": "<cargo_pkg_version>",
  "checked_at": "2026-04-25T08:00:00Z"
}
```

整体状态判定：
- `down` —— database 失败（HTTP 503）
- `degraded` —— 任一非 critical 子系统失败
- `ok` —— 全 critical OK，非 critical 失败/未配置项不影响

### 5.2 Metrics Endpoints

| 路径 | 内容 | 鉴权 |
|---|---|---|
| `GET /metrics` | Prometheus process metrics（http_requests_total / duration histograms） | 生产需 `LAW_EYE__METRICS__TOKEN` Bearer |
| `GET /api/v1/admin/system/metrics` | 业务级 KPI（active_users 7d / articles_ingested_24h / reports_generated_7d / ai_tokens_consumed_24h / storage_used_mb / queue_depths / error_rate_5min） | tenant_admin + `tenants:manage` |

两个 endpoint **互补**：Prometheus 抓 `/metrics`，运营 dashboard 调 `/admin/system/metrics`。

### 5.3 推荐 Prometheus + Grafana 监控

- 抓取 `/metrics` 周期 30s
- 关键告警：
  - `http_requests_total{status=~"5.."}` 增速 > 1/s
  - `/health/full` 连续 3 次 `down`
  - queue_depths.queue_ai > 1000（积压）
  - error_rate_5min > 0.05

## 6. Multi-Tenancy & RLS

### 6.1 设计原则

- **每个请求绑定一个 tenant**：`AuthSession.user.tenant_id` 来自 session table
- **DB 层强制隔离**：所有 `tenant_id` 列加 RLS policy，应用层无法绕过
- **跨租户操作仅限 super_admin**：通过 `super_tenants` 路由（gate=`ROLE_TIER_SUPER_ADMIN` + `tenants:manage` 权限）

### 6.2 编程模式

```rust
use law_eye_core::with_tenant_tx;

// 业务请求里，自动从 AuthSession 拿 tenant_id
with_tenant_tx(&pool, user.tenant_id, |tx| {
    Box::pin(async move {
        // SELECT / INSERT / UPDATE / DELETE 自动受 RLS 过滤
        sqlx::query("SELECT * FROM articles WHERE ...")
            .fetch_all(tx.as_mut()).await?;
        Ok(())
    })
}).await?;
```

### 6.3 Super-admin 跨租户

`crates/law-eye-api/src/routes/super_tenants.rs` 实装的 5 个 endpoint：
- `GET /api/v1/super/tenants` — 列出全部租户
- `GET /api/v1/super/tenants/:id` — 单租户详情 + usage snapshot
- `POST /api/v1/super/tenants` — 创建租户
- `PATCH /api/v1/super/tenants/:id` — 更新 quota / feature flags / 状态
- `DELETE /api/v1/super/tenants/:id` — 软删（要求 `X-Confirm-Delete: yes` header）

加上 Phase F.7 的 4 个子路由（users / suspend / reset-pw / export）。

## 7. Task Queue

### 7.1 队列清单（`crates/law-eye-worker/src/main.rs:50-56`）

| 队列名 | 任务类型 | Visibility timeout | Task budget |
|---|---|---|---|
| `queue:ingest` | 普通爬取 (`IngestTask`) | 10 min | 8 min |
| `queue:ingest:priority` | 高优爬取 | 10 min | 8 min |
| `queue:ai` | 文章 AI 处理 (`AiTask`) | 20 min | 10 min |
| `queue:push` | Web Push 推送 (`PushTask`) | 5 min | 1 min |
| `queue:report-export` | 报告导出 PDF/HTML/DOCX | 15 min | 10 min |
| `queue:report` | 报告 AI 生成 | 20 min | 15 min |
| `queue:tenant_export` | 超管租户导出 (`ExportTenantTask`) | 30 min | 25 min |

### 7.2 DLQ（Dead Letter Queue）

每个队列有对应 `<queue>:dlq`。任务超过 `max_retries`（默认 5）后落 DLQ。

- `LAW_EYE__WORKER__DLQ_REPLAY_ENABLED=true` 启用自动重放（每个维护周期最多 20 条/队列）
- 维护周期：`MAINTENANCE_INTERVAL_SECS = 15s`

### 7.3 Visibility Timeout 与重试

- 任务被 reserve 后，可见性窗口内未 ACK 自动重新可见（防止 worker crash 丢任务）
- 失败重试用指数退避：5s → 10s → 20s → 40s → cap 60s

### 7.4 入队 API

各业务 service 通过 `state.task_queue.enqueue_retryable(QUEUE_*, task)` 入队；ordering 任务用 `enqueue_retryable_with_ordering` 带 `ordering_key` + `ordering_seq`。

## 8. Backups & Tenant Export

### 8.1 全库备份

- **每日 `pg_dump`**：建议 `pg_dump -Fc` 自定义格式 + S3 异地存储 + 7 天滚动保留
- **PITR**：开启 `wal_level=replica` + `archive_mode=on`，`pg_basebackup` 周备 + WAL 增量

### 8.2 租户级导出

`POST /api/v1/super/tenants/:id/export`（super_admin only）异步导出单租户全量数据：

1. API 层往 `tenant_exports` 表插行 `status='queued'`，入队 `queue:tenant_export`
2. Worker 消费 `ExportTenantTask`：
   - 翻 `tenant_exports.status='running'` + `started_at=NOW()`
   - 6 张表 tenant-scoped 聚合（articles / categories / sources / channels / users / audit_logs 90d 滑动窗口）
   - **PII 红线**：users 表只导白名单字段（id / email / display_name / avatar_url / is_active / last_login / created_at / updated_at），**绝不导** `password_hash` / mfa_secret / oauth_token / api_keys
   - JSON 序列化 + gzip 压缩
   - 上传到 S3 `{tenant_id}/{export_id}.json.gz`，`OBJECT_KIND_TENANT_EXPORT`
   - 翻 `tenant_exports.status='completed'` + `download_url` + `size_bytes`
3. 失败/超时分支翻 `status='failed'` + 截断 1024 字符的 `error_message`

### 8.3 历史查询

`GET /api/v1/super/tenants/:id/exports`（Phase F.8）列出该租户的所有导出记录。

## 9. Security

### 9.1 Sessions

- 表：`sessions`（全局会话）+ `session_tenants`（多租户绑定）
- Cookie：HTTP-only，生产 `secure=true`（由 `PRODUCTION=true` 触发）

### 9.2 ReBAC（Relationship-Based Access Control）

- **关系存储**：`auth_relations` 表（subject / object / relation 三元组）
- **授权服务**：`AuthzService`（`crates/law-eye-core/src/authz.rs`）
- **决策端点**：`POST /api/v1/authz/check`
- **频道访问控制**：`channel_access_policies` 与 `auth_relations` 联动

### 9.3 多因素 / OAuth / API Keys

- **MFA TOTP**：`mfa_totp_*` 表，TOTP secret 用 `SensitiveStringCipher` 加密（AES-256-GCM）
- **OAuth identities**：`oauth_identities` 表，refresh token 同样加密落库
- **API keys**：`api_keys` 表，API key hash + prefix 索引（明文仅创建时返回一次）

### 9.4 RLS Force-Enabled

凡 tenant 数据表均 `ALTER TABLE ... FORCE ROW LEVEL SECURITY`，**owner 角色也受 RLS 约束**，杜绝 owner bypass 风险。

### 9.5 Egress 控制

- Webhook 投递：默认拒绝内网/loopback URL（除非 `LAW_EYE__SECURITY__ALLOW_INTERNAL_WEBHOOK_URLS=true`）
- Source 爬取：同样的 SSRF 防御（`law_eye_common::egress::validate_outbound_url`）

### 9.6 速率限制

5 类基于客户端 IP 的限流（详见 §2.7）。Redis 异常时可配 fail-open / fail-closed 策略。

## 10. Production Readiness Checklist

部署前对照 `docs/RELEASE-CHECKLIST.md` 逐项确认。重点：

1. `cargo check -p law-eye-api && cargo check -p law-eye-worker` 双 0/0
2. `pnpm typecheck` EXIT 0
3. `sqlx migrate run` dry-run 验证
4. DB 备份恢复演练
5. `/health/full` 全 subsystem `ok`
6. 抽检 `/api/v1/admin/system/metrics` 业务 KPI 合理
