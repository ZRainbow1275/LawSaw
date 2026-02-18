-- 047_session_tenants_tenant_fk_hardening.sql
-- 强化 session_tenants 与 users 的租户一致性约束
--
-- 目标:
-- 1) 修复历史异常会话映射（跨租户/悬空 user_id）
-- 2) 将 session_tenants.user_id 外键升级为复合 FK (tenant_id, user_id)
-- 3) 补充租户 + 用户组合索引，避免查询与约束回归

-- ---------------------------------------------------------------------------
-- 0) 预备约束：确保复合 FK 可引用
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    ALTER TABLE users
        ADD CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 1) 历史数据清理：对非法 user_id 关系降级为 NULL
-- ---------------------------------------------------------------------------
-- session_tenants.user_id 允许为空，遇到租户不一致或悬空用户时，
-- 将 user_id 清空比阻断迁移更安全，避免线上停机。

UPDATE session_tenants st
SET
    user_id = NULL,
    updated_at = NOW()
WHERE st.user_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = st.user_id
        AND u.tenant_id = st.tenant_id
  );

-- ---------------------------------------------------------------------------
-- 2) 外键升级：单列 user_id FK -> 复合 (tenant_id, user_id) FK
-- ---------------------------------------------------------------------------

ALTER TABLE session_tenants DROP CONSTRAINT IF EXISTS session_tenants_user_id_fkey;

DO $$
BEGIN
    ALTER TABLE session_tenants
        ADD CONSTRAINT session_tenants_user_tenant_fkey
        FOREIGN KEY (tenant_id, user_id)
        REFERENCES users(tenant_id, id)
        ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 3) 访问路径索引：租户 + 用户
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_session_tenants_tenant_user
    ON session_tenants(tenant_id, user_id)
    WHERE user_id IS NOT NULL;
