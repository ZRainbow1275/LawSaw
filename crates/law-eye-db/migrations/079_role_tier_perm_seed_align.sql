-- 079_role_tier_perm_seed_align.sql
-- Defensive re-alignment of the 5 SPEC-01 tier role permissions across ALL tenants.
-- See prompts/0425/SPEC-01-REBAC-AUTHZ.md §2.2 (granular-suffix dropped) for the
-- canonical permission vector per tier.
--
-- This migration is idempotent: it forces every tenant's tier role to the SPEC
-- vector, regardless of whether 075 was applied, edited, or partially seeded.
-- Safe to re-run.
--
-- Tier vectors (must match auth.rs::ensure_tenant_roles_seeded and 075):
--   basic_user    → 11 perms
--   verified_user → 12 perms (basic + ai:use:summary)
--   premium_user  → 14 perms (verified + reports:export, ai:use:sentiment)
--   tenant_admin  → ["*"]
--   super_admin   → ["*"]
--
-- RLS: roles table has FORCE ROW LEVEL SECURITY (032) and policies require
-- app.tenant_id GUC. We loop per tenant, set local context, then UPSERT.

DO $$
DECLARE
    t_id UUID;
    tier RECORD;
BEGIN
    FOR t_id IN SELECT id FROM tenants LOOP
        PERFORM set_config('app.tenant_id', t_id::text, true);

        FOR tier IN
            SELECT * FROM (VALUES
                (
                    'basic_user',
                    '["articles:read","categories:read","sources:read","channels:read","reports:read","analytics:read","banners:read","knowledge:read","feedbacks:write","feedbacks:read","objects:read"]'::jsonb,
                    '普通用户（basic_user）'
                ),
                (
                    'verified_user',
                    '["articles:read","categories:read","sources:read","channels:read","reports:read","analytics:read","banners:read","knowledge:read","feedbacks:write","feedbacks:read","objects:read","ai:use:summary"]'::jsonb,
                    '认证用户（verified_user）'
                ),
                (
                    'premium_user',
                    '["articles:read","categories:read","sources:read","channels:read","reports:read","analytics:read","banners:read","knowledge:read","feedbacks:write","feedbacks:read","objects:read","ai:use:summary","reports:export","ai:use:sentiment"]'::jsonb,
                    '高级用户（premium_user）'
                ),
                (
                    'tenant_admin',
                    '["*"]'::jsonb,
                    '租户管理员（tenant_admin）'
                ),
                (
                    'super_admin',
                    '["*"]'::jsonb,
                    '超级管理员（super_admin）'
                )
            ) AS v(name, perms, description)
        LOOP
            -- INSERT new tier role if missing, otherwise force-update permissions to SPEC matrix.
            INSERT INTO roles (id, tenant_id, name, permissions, description, created_at)
            VALUES (gen_random_uuid(), t_id, tier.name, tier.perms, tier.description, NOW())
            ON CONFLICT (tenant_id, name)
            DO UPDATE SET
                permissions = EXCLUDED.permissions,
                description = EXCLUDED.description;
        END LOOP;
    END LOOP;

    PERFORM set_config('app.tenant_id', '', true);
END $$;
