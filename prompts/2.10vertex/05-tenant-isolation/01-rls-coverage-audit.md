# RLS 覆盖面审计报告

> 审计日期：2026-02-13
> 审计范围：`crates/law-eye-db/migrations/001_initial.sql` ~ `031_source_type_expand_and_seed.sql`
> 修复迁移：`032_rls_complete_coverage.sql`

---

## 1. 背景

LawSaw 是多租户 SaaS 平台，依赖 PostgreSQL Row Level Security (RLS) 实现租户数据隔离。
核心机制：
- 每个带 `tenant_id` 的表启用 `ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- RLS 策略表达式：`tenant_id::text = current_setting('app.tenant_id', true)`
- 应用层通过 `SET ROLE law_eye_app`（007_rls_enforcement.sql）确保 RLS 不被绕过

## 2. 审计方法

1. 遍历所有 `.sql` 迁移文件，提取所有 `CREATE TABLE` 语句
2. 标记每张表是否具有 `tenant_id` 列
3. 标记每张表是否已启用 `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
4. 标记每张表是否已创建 `_tenant_isolation` 策略

## 3. 全量表清单

### 3.1 已有 RLS 的表（22 张）— 无需修改

| 表名 | 迁移文件 | RLS 来源 |
|------|---------|---------|
| sources | 001 | 006_tenants.sql |
| articles | 001 | 006_tenants.sql |
| article_chunks | 002 | 006_tenants.sql |
| feedbacks | 005 | 006_tenants.sql |
| entities | 004 | 006_tenants.sql |
| entity_relations | 004 | 006_tenants.sql |
| article_entities | 004 | 006_tenants.sql |
| audit_logs | 003 | 006_tenants.sql |
| objects | 010 | 010_objects.sql |
| password_reset_tokens | 013 | 013_password_reset_tokens.sql |
| web_push_subscriptions | 018 | 018_web_push_subscriptions.sql |
| email_verification_tokens | 019 | 019_email_verification_tokens.sql |
| queue_outbox | 020 | 020_queue_outbox.sql |
| idempotency_keys | 021 | 021_idempotency_keys.sql |
| webhook_endpoints | 025 | 025_webhook_endpoints_events.sql |
| webhook_events | 025 | 025_webhook_endpoints_events.sql |
| oauth_identities | 026 | 026_auth_oauth_sso_mfa_totp.sql |
| oauth_state_tokens | 026 | 026_auth_oauth_sso_mfa_totp.sql |
| user_mfa_totp | 026 | 026_auth_oauth_sso_mfa_totp.sql |
| mfa_login_challenges | 026 | 026_auth_oauth_sso_mfa_totp.sql |
| domain_events | 029 | 029_domain_events.sql |
| crawl_logs | 030 | 030_crawler_enhancement.sql |

### 3.2 缺少 RLS 的表（6 张）— 需要修复

| 表名 | 迁移文件 | 有 tenant_id | 缺失原因 | 风险等级 |
|------|---------|-------------|---------|---------|
| **users** | 003 | 是 (006) | 006 仅对数据表启用 RLS，跳过了 users | **高** — 用户信息跨租户泄露 |
| **roles** | 003 | 是 (028) | 028 添加了 tenant_id 但忘记启用 RLS | **高** — 角色/权限跨租户可见 |
| **user_roles** | 003 | 是 (028) | 同上 | **高** — 用户角色映射跨租户泄露 |
| **api_keys** | 004 | **否** | 创建时仅有 user_id FK，未设计 tenant_id | **严重** — API 密钥完全无租户隔离 |
| **session_tenants** | 028 | 是 | 创建时未启用 RLS | **中** — 会话映射跨租户可见 |
| **sessions** | 003 | 否 | tower-sessions 框架表，无 tenant_id | **中** — 通过 session_tenants 间接隔离 |

### 3.3 不需要 RLS 的表（2 张）

| 表名 | 迁移文件 | 原因 |
|------|---------|------|
| **tenants** | 006 | 租户主表，必须全局可见（应用层控制访问） |
| **categories** | 001 | 全局共享分类数据，无 tenant_id，所有租户共用 |

## 4. 修复方案

### 4.1 users（直接 RLS）

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
```

**注意事项**：认证流程（登录/注册）中的查询需要在 `SET ROLE law_eye_app` 之前执行，
或使用超级用户角色。当前架构中认证查询在设置租户上下文之前完成，因此不受影响。

### 4.2 roles（直接 RLS）

```sql
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON roles
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
```

### 4.3 user_roles（直接 RLS）

```sql
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_roles_tenant_isolation ON user_roles
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
```

### 4.4 api_keys（添加 tenant_id + RLS）

这是最复杂的修复，需要：
1. 添加 `tenant_id` 列
2. 回填数据（通过 `user_id -> users.tenant_id`）
3. 设为 NOT NULL + DEFAULT
4. 添加外键约束
5. 启用 RLS

```sql
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE api_keys ak SET tenant_id = u.tenant_id FROM users u WHERE ak.user_id = u.id AND ak.tenant_id IS NULL;
UPDATE api_keys SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default') WHERE tenant_id IS NULL;
ALTER TABLE api_keys ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_keys ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
-- FK + RLS ...
```

**Rust 模型影响**：`ApiKey` struct 需要添加 `tenant_id: Uuid` 字段，
`CreateApiKey` 不需要（由数据库 DEFAULT 填充）。

### 4.5 session_tenants（直接 RLS）

```sql
ALTER TABLE session_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY session_tenants_tenant_isolation ON session_tenants
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
```

### 4.6 sessions（间接 RLS，通过 session_tenants JOIN）

```sql
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_tenant_isolation ON sessions
    USING (
        EXISTS (
            SELECT 1 FROM session_tenants st
            WHERE st.session_id = sessions.id
              AND st.tenant_id::text = current_setting('app.tenant_id', true)
        )
    );
```

**注意事项**：tower-sessions 框架直接管理 sessions 表的读写。INSERT 时不添加 WITH CHECK
约束，因为 session 创建发生在租户上下文建立之前，由应用层在创建 session 后插入
session_tenants 记录来建立关联。

## 5. 迁移文件

修复迁移位于：`crates/law-eye-db/migrations/032_rls_complete_coverage.sql`

特性：
- 幂等执行（`DROP POLICY IF EXISTS` + `DO $$ ... EXCEPTION ... END $$`）
- 与现有迁移风格一致
- 包含完整中文注释
- api_keys 的 tenant_id 回填通过 users 表的 tenant_id 推导
- 最后显式刷新 law_eye_app 角色权限

## 6. RLS 覆盖率

| 状态 | 修复前 | 修复后 |
|------|--------|--------|
| 已启用 RLS | 22/30 (73%) | 28/30 (93%) |
| 无需 RLS | 2/30 | 2/30 |
| **覆盖率** | **22/28 = 78.6%** | **28/28 = 100%** |

## 7. `with_tenant_tx` 使用覆盖面审计

`with_tenant_tx` 是核心的租户隔离事务包装函数（定义于 `crates/law-eye-core/src/tenant.rs:90`），
它在事务开始时通过 `set_config('app.tenant_id', ...)` 设置租户上下文，确保 RLS 策略生效。

### 7.1 已使用 `with_tenant_tx` 的服务模块（16 个）-- 合规

| 模块 | 文件 | 调用次数 |
|------|------|---------|
| ArticleService | `article/service.rs` | 22 |
| KnowledgeService | `knowledge.rs` | 13 |
| SourceService | `source.rs` | 10 |
| FeedbackService | `feedback.rs` | 7 |
| WebhookService | `webhook.rs` | 7 |
| PushService | `push.rs` | 6 |
| AuthMfaService | `auth_mfa.rs` | 6 |
| AuthOauthService | `auth_oauth.rs` | 5 |
| AuditService | `audit.rs` | 4 |
| RagService | `rag.rs` | 4 |
| CrawlLogService | `crawl_log.rs` | 3 |
| DomainEventService | `domain_event.rs` | 2 |
| EmailVerificationService | `email_verification.rs` | 2 |
| PasswordResetService | `password_reset.rs` | 2 |
| ObjectService | `object.rs` | 2 |
| IdempotencyMiddleware | `middleware/idempotency.rs` | (路由层) |

### 7.2 未使用 `with_tenant_tx` 的服务模块（4 个）-- 需关注

| 模块 | 文件 | 直接 pool 查询 | 风险评估 |
|------|------|--------------|---------|
| **ApiKeyService** | `apikey.rs` | 6 次 | **高** -- 所有查询直接使用 `self.pool`，无租户上下文。RLS 策略启用后，这些查询在 `SET ROLE law_eye_app` 下将被 RLS 过滤，但前提是上游中间件已设置 `app.tenant_id`。当前 `verify()` 方法用于 API 认证，可能在租户上下文建立之前调用。 |
| **UserService** | `user.rs` | 8 次 | **低** -- 直接 pool 查询主要用于认证流程（登录/注册/密码验证）。这些操作发生在租户上下文建立之前，需要跨租户查找用户。在 users 表启用 RLS 后，认证查询必须在 `SET ROLE` 之前或使用超级用户角色执行。 |
| **CategoryService** | `category.rs` | 3 次 | **无** -- categories 表无 tenant_id，是全局共享数据，不需要 RLS。 |
| **StatisticsService** | `statistics.rs` | 15 次 | **中** -- 所有统计查询直接使用 `self.pool`。查询中通过 SQL WHERE 子句手动过滤 `tenant_id`，但未使用 `with_tenant_tx` 设置 RLS 上下文。如果表启用了 RLS 且执行角色为 `law_eye_app`，这些查询将因 `app.tenant_id` 未设置而返回空结果。 |

### 7.3 关键风险点

1. **ApiKeyService.verify()** -- API Key 验证在认证中间件中调用，此时可能尚未设置租户上下文。
   启用 RLS 后需确保 `verify()` 在正确的连接上下文中运行。
   - 方案 A：认证查询在 `SET ROLE` 之前执行（使用超级用户连接）
   - 方案 B：将 `verify()` 改为接受 `tenant_id` 参数并使用 `with_tenant_tx`

2. **UserService 认证查询** -- `find_by_email`, `verify_password` 等方法需要跨租户查找用户。
   在 users 表启用 RLS 后，这些方法必须：
   - 使用独立的超级用户连接池（推荐），或
   - 在 `SET ROLE` 之前完成认证查询

3. **StatisticsService** -- 所有方法都直接使用 `self.pool`，虽然 SQL 中有 `WHERE tenant_id = $1` 条件，
   但在 RLS 启用后，如果 `app.tenant_id` 未设置，查询将返回空结果。
   - 需要将所有方法改为使用 `with_tenant_tx`，或确保调用方已设置租户上下文。

## 8. 后续建议

1. **[已完成] Rust 模型同步**：`ApiKey` struct 已添加 `tenant_id: Uuid` 字段
2. **ApiKeyService 改造**：将 `create/list_by_user/revoke/delete` 改为使用 `with_tenant_tx`；
   `verify()` 需特殊处理（可能需要超级用户连接或预设租户上下文）
3. **StatisticsService 改造**：所有方法改为使用 `with_tenant_tx`
4. **UserService 认证安全**：确保认证查询在 `SET ROLE` 之前执行，或使用独立连接池
5. **集成测试**：在 RLS 下执行 CRUD 验证所有表的租户隔离
6. **CI 守护**：未来新增表时，CI 中检查是否包含 RLS 策略
7. **认证流程验证**：确认 users 表的 RLS 不影响登录/注册流程
