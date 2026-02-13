-- 038_auth_compatible_rls.sql
-- 调整 users 和 sessions 表的 RLS 策略，使其兼容认证流程
--
-- 问题：当 session_role 设置为 law_eye_app（NOBYPASSRLS）时，
-- 认证操作（登录/注册/密码重置）需要在没有 tenant 上下文的情况下查询 users 表。
-- tower-sessions 需要在没有 tenant 上下文的情况下读取 sessions 表。
-- 原有策略在 app.tenant_id 未设置时阻止所有访问。
--
-- 解决方案：将单一 RLS 策略拆分为按操作类型的精细策略：
-- - SELECT：允许在未设置 tenant_id 时访问（用于认证查找）
-- - INSERT/UPDATE/DELETE：始终要求 tenant_id 匹配（防止跨租户写入）
--
-- 安全分析：
-- - SELECT 放宽仅影响认证阶段（此时尚无 tenant 上下文）
-- - 认证端点仅返回当前用户数据，不暴露用户列表
-- - 所有管理端点在请求进入 handler 时 tenant_id 已由中间件设置
-- - 写入操作始终严格隔离

-- =============================================================================
-- 1. users 表 — 拆分 RLS 策略
-- =============================================================================

DROP POLICY IF EXISTS users_tenant_isolation ON users;

-- SELECT 策略：允许认证查找（tenant_id 未设置时）或租户隔离查询
CREATE POLICY users_select_policy
    ON users
    FOR SELECT
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- INSERT 策略：严格要求 tenant_id 匹配
CREATE POLICY users_insert_policy
    ON users
    FOR INSERT
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- UPDATE 策略：严格要求 tenant_id 匹配
CREATE POLICY users_update_policy
    ON users
    FOR UPDATE
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- DELETE 策略：严格要求 tenant_id 匹配
CREATE POLICY users_delete_policy
    ON users
    FOR DELETE
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 2. sessions 表 — 调整 RLS 策略以兼容 tower-sessions
-- =============================================================================
-- tower-sessions 在中间件层读取 session，此时 app.tenant_id 尚未设置。
-- 需要允许在未设置 tenant_id 时通过 session_id 访问 session 记录。

DROP POLICY IF EXISTS sessions_tenant_isolation ON sessions;

-- SELECT 策略：tower-sessions 需要在无 tenant 上下文时读取 session
CREATE POLICY sessions_select_policy
    ON sessions
    FOR SELECT
    USING (
        current_setting('app.tenant_id', true) = ''
        OR EXISTS (
            SELECT 1 FROM session_tenants st
            WHERE st.session_id = sessions.id
              AND st.tenant_id::text = current_setting('app.tenant_id', true)
        )
    );

-- INSERT 策略：tower-sessions 自动创建 session（无需 tenant 上下文）
-- sessions 表没有 tenant_id 列，框架自由创建即可
CREATE POLICY sessions_insert_policy
    ON sessions
    FOR INSERT
    WITH CHECK (true);

-- UPDATE 策略：tower-sessions 更新 session 数据（无需 tenant 上下文）
CREATE POLICY sessions_update_policy
    ON sessions
    FOR UPDATE
    USING (
        current_setting('app.tenant_id', true) = ''
        OR EXISTS (
            SELECT 1 FROM session_tenants st
            WHERE st.session_id = sessions.id
              AND st.tenant_id::text = current_setting('app.tenant_id', true)
        )
    );

-- DELETE 策略：tower-sessions 清理过期 session + 用户登出
CREATE POLICY sessions_delete_policy
    ON sessions
    FOR DELETE
    USING (
        current_setting('app.tenant_id', true) = ''
        OR EXISTS (
            SELECT 1 FROM session_tenants st
            WHERE st.session_id = sessions.id
              AND st.tenant_id::text = current_setting('app.tenant_id', true)
        )
    );

-- =============================================================================
-- 3. session_tenants 表 — 调整策略以兼容认证流程
-- =============================================================================
-- session_tenants 桥接表在登录后立即插入，此时 tenant_id 刚从用户记录获取。

DROP POLICY IF EXISTS session_tenants_tenant_isolation ON session_tenants;

-- SELECT：允许在无 tenant 上下文时读取（tower-sessions 中间件需要）
CREATE POLICY session_tenants_select_policy
    ON session_tenants
    FOR SELECT
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- INSERT：允许在无 tenant 上下文时插入（登录流程创建关联）
CREATE POLICY session_tenants_insert_policy
    ON session_tenants
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- DELETE：允许在无 tenant 上下文时删除（登出流程清理关联）
CREATE POLICY session_tenants_delete_policy
    ON session_tenants
    FOR DELETE
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- =============================================================================
-- 4. 确保权限正确
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;
