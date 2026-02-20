-- 032_rls_complete_coverage.sql
-- [命题5] RLS 覆盖面补全：为所有租户隔离表补齐 Row Level Security 策略
--
-- 审计结论：
-- - 006_tenants.sql 对 8 张表启用了 RLS（sources, articles, article_chunks, feedbacks,
--   entities, entity_relations, article_entities, audit_logs）
-- - 后续迁移（010~030）对新增表逐一启用了 RLS（objects, password_reset_tokens,
--   web_push_subscriptions, email_verification_tokens, queue_outbox, idempotency_keys,
--   webhook_endpoints, webhook_events, oauth_identities, oauth_state_tokens,
--   user_mfa_totp, mfa_login_challenges, domain_events, crawl_logs）
--
-- 本迁移补全以下缺口：
-- 1. users          — 有 tenant_id，无 RLS
-- 2. roles          — 有 tenant_id（028），无 RLS
-- 3. user_roles     — 有 tenant_id（028），无 RLS
-- 4. api_keys       — 无 tenant_id，需先添加 tenant_id 再启用 RLS
-- 5. session_tenants — 有 tenant_id，无 RLS
-- 6. sessions       — 无 tenant_id，通过 session_tenants JOIN 实现 RLS
--
-- 不需要 RLS 的表：
-- - tenants：租户主表，全局可见
-- - categories：全局分类参考数据，无 tenant_id

-- =============================================================================
-- 1. users 表 — 启用 RLS
-- =============================================================================
-- users 表在 006_tenants.sql 中已添加 tenant_id，但未启用 RLS。
-- 注意：认证阶段（登录/注册）需要以超级用户或 BYPASSRLS 角色执行查询，
-- 否则需要在设置 SET ROLE 之前完成认证查询。

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation
    ON users
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 2. roles 表 — 启用 RLS
-- =============================================================================
-- roles 表在 028_tenant_scoped_roles_sessions.sql 中添加了 tenant_id（NOT NULL），
-- 但未启用 RLS。

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_tenant_isolation ON roles;
CREATE POLICY roles_tenant_isolation
    ON roles
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 3. user_roles 表 — 启用 RLS
-- =============================================================================
-- user_roles 表在 028_tenant_scoped_roles_sessions.sql 中添加了 tenant_id（NOT NULL），
-- 但未启用 RLS。

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_tenant_isolation ON user_roles;
CREATE POLICY user_roles_tenant_isolation
    ON user_roles
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 4. api_keys 表 — 添加 tenant_id + 启用 RLS
-- =============================================================================
-- api_keys 表在 004_knowledge_graph.sql 中创建，仅有 user_id FK，无 tenant_id。
-- 需先添加 tenant_id 列，再回填数据，最后启用 RLS。

-- 4a. 添加 tenant_id 列（可空，便于回填）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 4b. 回填：通过 user_id 从 users 表继承 tenant_id
UPDATE api_keys ak
SET tenant_id = u.tenant_id
FROM users u
WHERE ak.user_id = u.id
  AND ak.tenant_id IS NULL;

-- 4c. 无 user_id 的孤儿记录回填为 default 租户
UPDATE api_keys
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;

-- 4d. 设为 NOT NULL + 添加默认值
ALTER TABLE api_keys ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_keys
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;

-- 4e. 添加外键约束
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_tenant_id_fkey'
    ) THEN
        ALTER TABLE api_keys
            ADD CONSTRAINT api_keys_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4f. 添加复合唯一约束（tenant_id, id）以支持跨表 FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_tenant_id_id_key'
    ) THEN
        ALTER TABLE api_keys
            ADD CONSTRAINT api_keys_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
END $$;

-- 4g. 添加租户级 user FK（确保 api_key 的 user 属于同一租户）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_tenant_user_fkey'
    ) THEN
        ALTER TABLE api_keys
            ADD CONSTRAINT api_keys_tenant_user_fkey
            FOREIGN KEY (tenant_id, user_id)
            REFERENCES users(tenant_id, id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- 4h. 索引
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);

-- 4i. 启用 RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;
CREATE POLICY api_keys_tenant_isolation
    ON api_keys
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 5. session_tenants 表 — 启用 RLS
-- =============================================================================
-- session_tenants 在 028_tenant_scoped_roles_sessions.sql 中创建，有 tenant_id，
-- 但未启用 RLS。

ALTER TABLE session_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_tenants_tenant_isolation ON session_tenants;
CREATE POLICY session_tenants_tenant_isolation
    ON session_tenants
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 6. sessions 表 — 通过 session_tenants 实现间接 RLS
-- =============================================================================
-- sessions 表是 tower-sessions 框架管理的表，结构为 (id TEXT PK, data BYTEA, expiry_date).
-- 它没有 tenant_id 列，因为框架直接管理该表的读写。
-- 通过 session_tenants 桥接表实现 RLS：只能访问当前租户关联的 session。

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_tenant_isolation ON sessions;
CREATE POLICY sessions_tenant_isolation
    ON sessions
    USING (
        EXISTS (
            SELECT 1 FROM session_tenants st
            WHERE st.session_id = sessions.id
              AND st.tenant_id::text = current_setting('app.tenant_id', true)
        )
    );
-- sessions 的 WITH CHECK 策略：INSERT 时不强制检查（由应用层在创建 session 后
-- 立即插入 session_tenants 记录来建立关联）。
-- 如果需要更严格的控制，可以添加 WITH CHECK 子句，但这可能与 tower-sessions
-- 框架的自动创建行为冲突。

-- =============================================================================
-- 7. 验证 RLS 完整性：为 law_eye_app 角色授予新表权限
-- =============================================================================
-- 007_rls_enforcement.sql 中的 ALTER DEFAULT PRIVILEGES 已覆盖后续创建的表，
-- 但为确保万无一失，显式授权。

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;
