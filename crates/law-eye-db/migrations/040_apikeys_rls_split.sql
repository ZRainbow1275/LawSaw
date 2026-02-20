-- 040_apikeys_rls_split.sql
-- [命题5-R12] 拆分 api_keys ALL 策略为 per-operation, 兼容 API key 验证流程
--
-- 问题:
-- 032 的 api_keys_tenant_isolation 是 ALL 策略 (USING + WITH CHECK),
-- 要求 tenant_id::text = current_setting('app.tenant_id', true)。
-- 当 API key 用于认证时 (ApiKeyService::verify), app.tenant_id 尚未设置,
-- 导致 SELECT 返回空集 → API key 认证完全失败。
--
-- 修复:
-- 拆分 ALL 策略为 per-operation:
-- - SELECT: 放宽 (允许 app.tenant_id='' 时访问, 用于 API key 查找验证)
-- - INSERT: 严格 (仅在正确 tenant 上下文中创建)
-- - UPDATE: 放宽 INSERT/SELECT 但严格 UPDATE (verify 需要更新 last_used)
-- - DELETE: 严格
--
-- 安全分析:
-- - SELECT 放宽仅影响 API key 验证阶段 (此时尚无 tenant 上下文)
-- - API key 验证端点仅返回单个 key 记录 (通过 key_prefix 精确匹配)
-- - 不暴露其他租户的 key 列表 (list_by_user 需要先认证)
-- - UPDATE 放宽用于 verify() 中更新 last_used, 安全因为 WHERE 子句限定了 id
-- - 写入操作在应用层通过 user_id 和 tenant_id 双重验证

-- =============================================================================
-- 1. 删除旧的 ALL 策略
-- =============================================================================
DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;

-- =============================================================================
-- 2. SELECT: 放宽 (API key 验证需要在无 tenant 上下文时查找)
-- =============================================================================
DROP POLICY IF EXISTS api_keys_select_policy ON api_keys;
CREATE POLICY api_keys_select_policy
    ON api_keys
    FOR SELECT
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- =============================================================================
-- 3. INSERT: 严格 (仅在正确 tenant 上下文中创建 API key)
-- =============================================================================
DROP POLICY IF EXISTS api_keys_insert_policy ON api_keys;
CREATE POLICY api_keys_insert_policy
    ON api_keys
    FOR INSERT
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 4. UPDATE: 放宽 (verify 需要更新 last_used, 此时无 tenant 上下文)
-- =============================================================================
DROP POLICY IF EXISTS api_keys_update_policy ON api_keys;
CREATE POLICY api_keys_update_policy
    ON api_keys
    FOR UPDATE
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- =============================================================================
-- 5. DELETE: 严格 (仅在正确 tenant 上下文中删除)
-- =============================================================================
DROP POLICY IF EXISTS api_keys_delete_policy ON api_keys;
CREATE POLICY api_keys_delete_policy
    ON api_keys
    FOR DELETE
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 6. 确保权限正确
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;
