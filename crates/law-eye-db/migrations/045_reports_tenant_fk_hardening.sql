-- 045_reports_tenant_fk_hardening.sql
-- 强化 reports 与 users/report_templates 的租户级一致性约束
--
-- 目标:
-- 1) 把 reports.author_id/template_id 从单列 FK 升级为复合 FK (tenant_id, *)
-- 2) 为 report_templates 增加租户内唯一模板名
-- 3) 修复历史脏数据并在关键冲突时阻断迁移

-- ---------------------------------------------------------------------------
-- 0) 预备约束：确保复合 FK 可引用
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_tenant_id_id_key'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'report_templates_tenant_id_id_key'
          AND conrelid = 'report_templates'::regclass
    ) THEN
        ALTER TABLE report_templates
            ADD CONSTRAINT report_templates_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1) 模板名租户唯一：先处理历史重复，再上唯一约束
-- ---------------------------------------------------------------------------

WITH ranked_templates AS (
    SELECT
        id,
        tenant_id,
        name,
        ROW_NUMBER() OVER (
            PARTITION BY tenant_id, name
            ORDER BY is_builtin DESC, created_at ASC, id ASC
        ) AS rn
    FROM report_templates
)
UPDATE report_templates rt
SET
    name = CONCAT(rt.name, ' #', ranked_templates.rn),
    updated_at = NOW()
FROM ranked_templates
WHERE rt.id = ranked_templates.id
  AND ranked_templates.rn > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'report_templates_tenant_name_key'
          AND conrelid = 'report_templates'::regclass
    ) THEN
        ALTER TABLE report_templates
            ADD CONSTRAINT report_templates_tenant_name_key UNIQUE (tenant_id, name);
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) 历史数据修复：template 可置空，author 严格阻断
-- ---------------------------------------------------------------------------

UPDATE reports r
SET
    template_id = NULL,
    updated_at = NOW()
WHERE template_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM report_templates rt
      WHERE rt.id = r.template_id
        AND rt.tenant_id = r.tenant_id
  );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM reports r
        LEFT JOIN users u
          ON u.id = r.author_id
         AND u.tenant_id = r.tenant_id
        WHERE u.id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Migration 045 aborted: reports.author_id contains cross-tenant or missing users';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3) 外键升级：单列 FK -> 复合 FK
-- ---------------------------------------------------------------------------

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_template_id_fkey;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_author_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reports_template_tenant_fkey'
          AND conrelid = 'reports'::regclass
    ) THEN
        ALTER TABLE reports
            ADD CONSTRAINT reports_template_tenant_fkey
            FOREIGN KEY (tenant_id, template_id)
            REFERENCES report_templates(tenant_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reports_author_tenant_fkey'
          AND conrelid = 'reports'::regclass
    ) THEN
        ALTER TABLE reports
            ADD CONSTRAINT reports_author_tenant_fkey
            FOREIGN KEY (tenant_id, author_id)
            REFERENCES users(tenant_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4) 访问路径索引（避免复合 FK 后回归）
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_reports_tenant_author
    ON reports(tenant_id, author_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_tenant_template
    ON reports(tenant_id, template_id)
    WHERE deleted_at IS NULL
      AND template_id IS NOT NULL;
