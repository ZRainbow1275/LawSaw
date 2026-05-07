-- 081_report_subscription_rebac_owner_rls.sql
-- Align 0425 report subscription and source visibility permissions, then harden
-- report_subscriptions with owner-aware RLS and ReBAC owner tuples.

SET search_path TO public;

DO $$
DECLARE
    t_id UUID;
BEGIN
    FOR t_id IN SELECT id FROM tenants LOOP
        PERFORM set_config('app.tenant_id', t_id::text, true);

        UPDATE roles
        SET permissions = (
            SELECT jsonb_agg(DISTINCT permission ORDER BY permission)
            FROM (
                SELECT jsonb_array_elements_text(COALESCE(roles.permissions, '[]'::jsonb)) AS permission
                UNION ALL
                SELECT permission
                FROM (VALUES ('sources:read:name')) AS additions(permission)
            ) merged
        )
        WHERE tenant_id = t_id
          AND name IN ('basic_user', 'viewer')
          AND NOT (COALESCE(permissions, '[]'::jsonb) ? 'sources:read:name');

        UPDATE roles
        SET permissions = (
            SELECT jsonb_agg(DISTINCT permission ORDER BY permission)
            FROM (
                SELECT jsonb_array_elements_text(COALESCE(roles.permissions, '[]'::jsonb)) AS permission
                UNION ALL
                SELECT permission
                FROM (VALUES
                    ('sources:read:name'),
                    ('sources:read:meta'),
                    ('reports:subscribe')
                ) AS additions(permission)
            ) merged
        )
        WHERE tenant_id = t_id
          AND name IN ('verified_user', 'editor')
          AND (
              NOT (COALESCE(permissions, '[]'::jsonb) ? 'sources:read:meta')
              OR NOT (COALESCE(permissions, '[]'::jsonb) ? 'reports:subscribe')
          );

        UPDATE roles
        SET permissions = (
            SELECT jsonb_agg(DISTINCT permission ORDER BY permission)
            FROM (
                SELECT jsonb_array_elements_text(COALESCE(roles.permissions, '[]'::jsonb)) AS permission
                UNION ALL
                SELECT permission
                FROM (VALUES
                    ('sources:read:name'),
                    ('sources:read:meta'),
                    ('sources:read:full'),
                    ('reports:subscribe')
                ) AS additions(permission)
            ) merged
        )
        WHERE tenant_id = t_id
          AND name = 'premium_user'
          AND (
              NOT (COALESCE(permissions, '[]'::jsonb) ? 'sources:read:full')
              OR NOT (COALESCE(permissions, '[]'::jsonb) ? 'reports:subscribe')
          );
    END LOOP;

    PERFORM set_config('app.tenant_id', '', true);
END $$;

DO $$
DECLARE
    t_id UUID;
BEGIN
    FOR t_id IN SELECT id FROM tenants LOOP
        PERFORM set_config('app.tenant_id', t_id::text, true);

        INSERT INTO auth_relations (
            tenant_id,
            resource_type,
            resource_id,
            relation,
            subject_type,
            subject_id,
            subject_key,
            subject_relation,
            properties,
            created_by,
            updated_at
        )
        SELECT
            rs.tenant_id,
            'report_subscription',
            rs.id,
            'owner',
            'user',
            rs.user_id,
            rs.user_id::text,
            NULL,
            jsonb_build_object('backfilled_by', '081_report_subscription_rebac_owner_rls'),
            rs.user_id,
            NOW()
        FROM report_subscriptions rs
        WHERE rs.tenant_id = t_id
          AND rs.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM auth_relations ar
              WHERE ar.tenant_id = rs.tenant_id
                AND ar.resource_type = 'report_subscription'
                AND ar.resource_id = rs.id
                AND ar.relation = 'owner'
                AND ar.subject_type = 'user'
                AND ar.subject_key = rs.user_id::text
          );
    END LOOP;

    PERFORM set_config('app.tenant_id', '', true);
END $$;

DROP POLICY IF EXISTS report_subscriptions_tenant_isolation ON report_subscriptions;
DROP POLICY IF EXISTS report_subscriptions_owner_isolation ON report_subscriptions;
CREATE POLICY report_subscriptions_owner_isolation
    ON report_subscriptions
    USING (
        tenant_id::text = current_setting('app.tenant_id', true)
        AND user_id::text = current_setting('app.user_id', true)
    )
    WITH CHECK (
        tenant_id::text = current_setting('app.tenant_id', true)
        AND user_id::text = current_setting('app.user_id', true)
    );
