-- [REPORTS-FK-045] Verify reports tenant-scoped composite foreign keys.
--
-- Usage:
--   psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -f scripts/enterprise/reports-tenant-fk-verify.sql
--
-- This script validates:
--   1) Cross-tenant template reference is rejected.
--   2) Cross-tenant author reference is rejected.
--   3) A same-tenant report insert remains valid.
--
-- It runs in a transaction and rolls back all inserted fixtures.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    tenant_a UUID := gen_random_uuid();
    tenant_b UUID := gen_random_uuid();
    user_a UUID := gen_random_uuid();
    user_b UUID := gen_random_uuid();
    template_a UUID := gen_random_uuid();
    template_b UUID := gen_random_uuid();
    report_ok UUID := gen_random_uuid();
    slug_a TEXT := 'fk-check-a-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
    slug_b TEXT := 'fk-check-b-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
BEGIN
    INSERT INTO tenants (id, slug, name)
    VALUES
      (tenant_a, slug_a, 'FK Check Tenant A'),
      (tenant_b, slug_b, 'FK Check Tenant B');

    INSERT INTO users (id, tenant_id, email, password_hash, display_name)
    VALUES
      (user_a, tenant_a, slug_a || '@example.com', 'argon2-placeholder', 'FK Check User A'),
      (user_b, tenant_b, slug_b || '@example.com', 'argon2-placeholder', 'FK Check User B');

    INSERT INTO report_templates (
        id,
        tenant_id,
        name,
        description,
        period_type,
        template_body,
        css_styles,
        page_config,
        sections_config,
        is_builtin,
        is_active
    )
    VALUES
      (
        template_a,
        tenant_a,
        'FK Check Template A',
        'FK validation template',
        'weekly',
        '<html><body>{{ title }}</body></html>',
        '',
        '{"page_size":"A4","orientation":"portrait"}'::jsonb,
        '[]'::jsonb,
        false,
        true
      ),
      (
        template_b,
        tenant_b,
        'FK Check Template B',
        'FK validation template',
        'weekly',
        '<html><body>{{ title }}</body></html>',
        '',
        '{"page_size":"A4","orientation":"portrait"}'::jsonb,
        '[]'::jsonb,
        false,
        true
      );

    -- Baseline (same tenant) should pass.
    INSERT INTO reports (
        id,
        tenant_id,
        report_number,
        title,
        template_id,
        author_id,
        period_type,
        period_start,
        period_end,
        content
    )
    VALUES (
        report_ok,
        tenant_a,
        'RPT-FK-OK',
        'FK baseline',
        template_a,
        user_a,
        'weekly',
        CURRENT_DATE,
        CURRENT_DATE,
        '{}'::jsonb
    );

    -- Cross-tenant template must fail.
    BEGIN
        INSERT INTO reports (
            tenant_id,
            report_number,
            title,
            template_id,
            author_id,
            period_type,
            period_start,
            period_end,
            content
        )
        VALUES (
            tenant_a,
            'RPT-FK-CROSS-TEMPLATE',
            'Cross-tenant template should fail',
            template_b,
            user_a,
            'weekly',
            CURRENT_DATE,
            CURRENT_DATE,
            '{}'::jsonb
        );
        RAISE EXCEPTION 'REPORTS_FK_045_FAILED: cross-tenant template insert unexpectedly succeeded';
    EXCEPTION
        WHEN foreign_key_violation THEN
            NULL;
    END;

    -- Cross-tenant author must fail.
    BEGIN
        INSERT INTO reports (
            tenant_id,
            report_number,
            title,
            template_id,
            author_id,
            period_type,
            period_start,
            period_end,
            content
        )
        VALUES (
            tenant_a,
            'RPT-FK-CROSS-AUTHOR',
            'Cross-tenant author should fail',
            template_a,
            user_b,
            'weekly',
            CURRENT_DATE,
            CURRENT_DATE,
            '{}'::jsonb
        );
        RAISE EXCEPTION 'REPORTS_FK_045_FAILED: cross-tenant author insert unexpectedly succeeded';
    EXCEPTION
        WHEN foreign_key_violation THEN
            NULL;
    END;
END
$$;

ROLLBACK;

SELECT 'REPORTS_FK_045_OK' AS result;
