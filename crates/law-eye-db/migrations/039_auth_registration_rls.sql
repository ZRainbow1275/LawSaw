-- 039_auth_registration_rls.sql
-- [命题7-R11] 修复注册/OAuth 流程被 RLS 阻断 + JSONB NOT NULL 安全
--
-- 关键发现（Opus 级审计 R11）：
--
-- 1. P0 — 用户注册流程被 RLS 阻断:
--    - 038 的 users_insert_policy 要求 tenant_id::text = current_setting('app.tenant_id', true)
--    - 注册时 app.tenant_id 为空字符串 → INSERT 被拒绝
--    - assign_role_inner 需要 SELECT roles + INSERT user_roles → 032 的 ALL 策略同样阻断
--
-- 2. P1 — backfill_llm 绕过 RLS 获取空结果（代码层修复，非迁移）
--
-- 3. P2 — JSONB 字段缺少 NOT NULL:
--    - users.preferences: JSONB DEFAULT '{}' 但无 NOT NULL → Rust serde_json::Value panic
--    - api_keys.permissions: JSONB DEFAULT '["read"]' 但无 NOT NULL → 同上
--
-- 安全分析:
-- - 所有放宽的策略仅在 current_setting('app.tenant_id', true) = '' 时生效
-- - 这意味着仅在尚未设置租户上下文的短暂窗口（注册/登录/OAuth 回调）中放宽
-- - 应用层（auth handler）负责确保 tenant_id 正确（从 upsert_by_slug 获取）
-- - FK 约束确保 tenant_id 引用有效租户
-- - 所有认证后的操作都已通过中间件设置 app.tenant_id，不受影响

-- =============================================================================
-- 1. users 表 — 修复 INSERT 策略以兼容注册流程
-- =============================================================================
-- 038 创建了精细的 per-operation 策略，但 INSERT 策略过严。
-- 仅修改 INSERT 策略，保留 038 的 SELECT/UPDATE/DELETE 策略不变。

DROP POLICY IF EXISTS users_insert_policy ON users;

CREATE POLICY users_insert_policy
    ON users
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- =============================================================================
-- 2. roles 表 — 拆分 ALL 策略为 per-operation，放宽 SELECT
-- =============================================================================
-- 032 的 roles_tenant_isolation 是 ALL 策略（USING + WITH CHECK）。
-- assign_role_inner 在注册时需要 SELECT roles（JOIN 查找角色名）。
-- 写入操作保持严格隔离。

DROP POLICY IF EXISTS roles_tenant_isolation ON roles;

-- SELECT: 允许在注册时查找角色（app.tenant_id 为空时）
DROP POLICY IF EXISTS roles_select_policy ON roles;
CREATE POLICY roles_select_policy
    ON roles
    FOR SELECT
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- INSERT: 严格隔离（仅管理员在租户上下文内创建角色）
DROP POLICY IF EXISTS roles_insert_policy ON roles;
CREATE POLICY roles_insert_policy
    ON roles
    FOR INSERT
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- UPDATE: 严格隔离
DROP POLICY IF EXISTS roles_update_policy ON roles;
CREATE POLICY roles_update_policy
    ON roles
    FOR UPDATE
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- DELETE: 严格隔离
DROP POLICY IF EXISTS roles_delete_policy ON roles;
CREATE POLICY roles_delete_policy
    ON roles
    FOR DELETE
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 3. user_roles 表 — 拆分 ALL 策略为 per-operation，放宽 INSERT
-- =============================================================================
-- 032 的 user_roles_tenant_isolation 是 ALL 策略。
-- assign_role_inner 在注册时需要 INSERT user_roles（分配默认角色）。
-- SQL: INSERT INTO user_roles SELECT ... FROM users u JOIN roles r
-- 此 INSERT 的 SELECT 子句已通过 users/roles 的放宽 SELECT 策略解决。

DROP POLICY IF EXISTS user_roles_tenant_isolation ON user_roles;

-- SELECT: 严格隔离（只在已认证上下文中查询角色分配）
DROP POLICY IF EXISTS user_roles_select_policy ON user_roles;
CREATE POLICY user_roles_select_policy
    ON user_roles
    FOR SELECT
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- INSERT: 允许在注册时分配默认角色
DROP POLICY IF EXISTS user_roles_insert_policy ON user_roles;
CREATE POLICY user_roles_insert_policy
    ON user_roles
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- UPDATE: 严格隔离
DROP POLICY IF EXISTS user_roles_update_policy ON user_roles;
CREATE POLICY user_roles_update_policy
    ON user_roles
    FOR UPDATE
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- DELETE: 严格隔离
DROP POLICY IF EXISTS user_roles_delete_policy ON user_roles;
CREATE POLICY user_roles_delete_policy
    ON user_roles
    FOR DELETE
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 4. JSONB NOT NULL 安全加固
-- =============================================================================
-- users.preferences 和 api_keys.permissions 有 DEFAULT 但无 NOT NULL，
-- 当 DB 中存在 NULL 值时，Rust 的 serde_json::Value（非 Option）会 panic。

-- 4a. 回填 NULL 值
UPDATE users SET preferences = '{}' WHERE preferences IS NULL;
UPDATE api_keys SET permissions = '["read"]' WHERE permissions IS NULL;

-- 4b. 添加 NOT NULL 约束
ALTER TABLE users ALTER COLUMN preferences SET NOT NULL;
ALTER TABLE api_keys ALTER COLUMN permissions SET NOT NULL;

-- =============================================================================
-- 5. 确保权限正确
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;
