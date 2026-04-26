-- 073_tenants_suspension.sql
-- Phase F.7: super-admin tenant suspension columns.
--
-- `suspended_at` records when status flipped to 'suspended'.
-- `suspended_until` is optional; when set, an out-of-band reaper / login guard
-- compares to NOW() to auto-resume the tenant.
-- Both nullable: only populated while status='suspended'.
--
-- The async tenant_exports job tracking table lives in migration 074.

SET search_path TO public;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_suspended_until
    ON tenants(suspended_until)
    WHERE suspended_until IS NOT NULL;
