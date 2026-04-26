-- 069_categories_admin_columns.sql
-- Phase E.5: extend `categories` for admin CRUD + reorder.
--
-- Notes:
--   * `deleted_at` already exists (added in 016_soft_delete_baseline.sql).
--   * `slug` already has a UNIQUE index from 001_initial.sql; we keep global
--     uniqueness instead of introducing tenant_id (a much larger restructuring
--     out of scope for E.5).
--   * `visibility_tier` defaults to 'verified' to match the most common case;
--     basic-tier-visible slugs are still controlled by
--     `BASIC_VISIBLE_CATEGORY_SLUGS` in `law-eye-core::role_tier`.

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS visibility_tier TEXT NOT NULL DEFAULT 'verified';

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE categories
    DROP CONSTRAINT IF EXISTS categories_visibility_tier_check;

ALTER TABLE categories
    ADD CONSTRAINT categories_visibility_tier_check
    CHECK (visibility_tier IN ('basic', 'verified', 'premium'));

-- Backfill canonical default tiers for the seeded slugs so the existing
-- frontend behaviour (3 basic categories, the rest verified+) stays stable.
UPDATE categories SET visibility_tier = 'basic'
    WHERE slug IN ('legislation', 'regulation', 'enforcement')
      AND visibility_tier <> 'basic';

UPDATE categories SET visibility_tier = 'premium'
    WHERE slug IN (
        'regulation-antitrust',
        'regulation-data-compliance',
        'regulation-cybersecurity',
        'enforcement-mediation',
        'policy-tech',
        'policy-culture',
        'policy-education',
        'international',
        'international-trade',
        'international-investment',
        'international-sanctions',
        'international-disputes'
    )
      AND visibility_tier <> 'premium';

-- Lightweight trigger to keep updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION categories_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categories_set_updated_at ON categories;
CREATE TRIGGER trg_categories_set_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION categories_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_categories_parent_sort
    ON categories(parent_id, sort_order)
    WHERE deleted_at IS NULL;
