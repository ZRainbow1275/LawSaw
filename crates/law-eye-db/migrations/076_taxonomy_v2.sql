-- 076_taxonomy_v2.sql
-- SPEC-05 Content Taxonomy v2: subcategories + article_categories + tags + article_tags.
--
-- Notes:
--   * `categories` is currently a global (non-tenant-scoped) table; subcategories are
--     tenant-scoped per SPEC §5.1 and reference `categories.id` (legacy id linkage).
--     A `parent_code` column also stores `categories.slug` for SPEC §1.2 code-based lookups.
--   * `articles` already carries tenant_id with composite UNIQUE (tenant_id, id); the
--     article_categories / article_tags tables therefore use composite FKs to inherit
--     tenant alignment, mirroring the pattern from 006_tenants.sql §Articles.
--   * RLS pattern matches 032_rls_complete_coverage.sql: USING + WITH CHECK on
--     `app.tenant_id` GUC. For pure article-derived tables we keep RLS disabled and rely
--     on FK + the parent articles RLS — see comments inline.

-- =============================================================================
-- 1. subcategories
-- =============================================================================

CREATE TABLE IF NOT EXISTS subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    parent_code TEXT NOT NULL,            -- categories.slug at creation; denormalized for fast filter
    code TEXT NOT NULL,
    name_zh TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    icon_key TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, parent_code, code)
);

ALTER TABLE subcategories
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true)::uuid;

ALTER TABLE subcategories
    ADD CONSTRAINT subcategories_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_subcategories_parent
    ON subcategories(parent_code, tenant_id)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_subcategories_tenant_id
    ON subcategories(tenant_id);

DROP TRIGGER IF EXISTS update_subcategories_updated_at ON subcategories;
CREATE TRIGGER update_subcategories_updated_at
    BEFORE UPDATE ON subcategories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subcategories_tenant_isolation ON subcategories;
CREATE POLICY subcategories_tenant_isolation
    ON subcategories
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 2. article_categories — many-to-many article ↔ category (+ optional subcategory)
-- =============================================================================

CREATE TABLE IF NOT EXISTS article_categories (
    tenant_id UUID NOT NULL,
    article_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    category_code TEXT NOT NULL,           -- categories.slug at write time; SPEC §4.1
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0
        CHECK (confidence >= 0.0 AND confidence <= 1.0),
    source TEXT NOT NULL CHECK (source IN ('ai', 'editor', 'rule')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, article_id, category_id)
);

ALTER TABLE article_categories
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true)::uuid;

-- Composite FK: ensure article_categories.tenant_id matches articles.tenant_id.
ALTER TABLE article_categories
    ADD CONSTRAINT article_categories_article_tenant_fkey
    FOREIGN KEY (tenant_id, article_id)
    REFERENCES articles(tenant_id, id)
    ON DELETE CASCADE;

-- Allow multiple subcategory mappings under the same article+category.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_article_categories_full
    ON article_categories (
        article_id,
        category_id,
        COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- At most one primary mapping per article (SPEC §4.2).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_article_categories_primary
    ON article_categories(article_id)
    WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_article_categories_code
    ON article_categories(tenant_id, category_code);

CREATE INDEX IF NOT EXISTS idx_article_categories_subcategory
    ON article_categories(subcategory_id)
    WHERE subcategory_id IS NOT NULL;

ALTER TABLE article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS article_categories_tenant_isolation ON article_categories;
CREATE POLICY article_categories_tenant_isolation
    ON article_categories
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 3. tags — tenant-scoped tag dictionary (SPEC §3)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai-extracted', 'editor', 'user')),
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    usage_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

ALTER TABLE tags
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true)::uuid;

ALTER TABLE tags
    ADD CONSTRAINT tags_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_tags_tenant_usage
    ON tags(tenant_id, usage_count DESC);

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tags_tenant_isolation ON tags;
CREATE POLICY tags_tenant_isolation
    ON tags
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 4. article_tags — article ↔ tag (SPEC §3, §4)
-- =============================================================================

CREATE TABLE IF NOT EXISTS article_tags (
    tenant_id UUID NOT NULL,
    article_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0
        CHECK (confidence >= 0.0 AND confidence <= 1.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, article_id, tag_id)
);

ALTER TABLE article_tags
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true)::uuid;

ALTER TABLE article_tags
    ADD CONSTRAINT article_tags_article_tenant_fkey
    FOREIGN KEY (tenant_id, article_id)
    REFERENCES articles(tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE article_tags
    ADD CONSTRAINT article_tags_tag_tenant_fkey
    FOREIGN KEY (tenant_id, tag_id)
    REFERENCES tags(tenant_id, id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_article_tags_tag
    ON article_tags(tenant_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_article_tags_article
    ON article_tags(article_id);

ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS article_tags_tenant_isolation ON article_tags;
CREATE POLICY article_tags_tenant_isolation
    ON article_tags
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 5. Categories seed — SPEC-05 §1.2 13 first-level categories (idempotent UPSERT)
-- =============================================================================
--
-- The categories table is global (shared across tenants) per 001_initial.sql.
-- We use ON CONFLICT(slug) so re-running this migration is safe and updates
-- existing rows in-place. visibility_tier is honoured via 069 column.
-- icon names follow lucide kebab-case convention (matches 063_category_icons_no_emoji).

INSERT INTO categories (slug, name, description, icon, color, sort_order, visibility_tier)
VALUES
    ('legislation',    '立法动态', '全国/地方人大、国务院新颁立法',           'scroll-text',   '#7c3aed', 1,  'basic'),
    ('regulation',     '监管动态', '部委规章、监管文件、行业指引',             'building-2',    '#3b82f6', 2,  'basic'),
    ('enforcement',    '执法案例', '行政处罚、合规检查、执法案例',             'scale',         '#f59e0b', 3,  'basic'),
    ('judicial',       '司法案例', '最高法/各级法院判例、指导性案例',           'gavel',         '#a855f7', 4,  'verified'),
    ('industry',       '行业合规', '行业专项合规、行业自律',                   'briefcase',     '#06b6d4', 5,  'verified'),
    ('compliance',     '合规风控', '企业合规、风控、内控',                     'shield-check',  '#10b981', 6,  'verified'),
    ('data',           '数据合规', '数据保护、个保法、跨境传输',               'bar-chart-3',   '#3b82f6', 7,  'premium'),
    ('security',       '网络安全', '网络安全法、关基保护、漏洞管理',           'shield',        '#f43f5e', 8,  'premium'),
    ('antitrust',      '反垄断',   '反垄断、反不正当竞争、经营者集中',         'lock',          '#f97316', 9,  'premium'),
    ('ip',             '知识产权', '专利、商标、版权、商业秘密',               'lightbulb',     '#eab308', 10, 'premium'),
    ('labor',          '劳动用工', '劳动法、用工合规、社保',                   'users',         '#14b8a6', 11, 'premium'),
    ('finance',        '金融监管', '金融、证券、保险、支付监管',               'banknote',      '#22c55e', 12, 'premium'),
    ('international',  '国际动态', '跨境合规、国际制裁、国际条约',             'globe-2',       '#6366f1', 13, 'premium')
ON CONFLICT (slug) DO UPDATE SET
    name            = EXCLUDED.name,
    description     = EXCLUDED.description,
    icon            = EXCLUDED.icon,
    color           = EXCLUDED.color,
    sort_order      = EXCLUDED.sort_order,
    visibility_tier = EXCLUDED.visibility_tier,
    deleted_at      = NULL,
    updated_at      = NOW();

-- =============================================================================
-- 6. Subcategories seed — sample tree under at least 3 first-level categories
--    (legislation/regulation/enforcement, all basic-tier) per task PRD.
-- =============================================================================
--
-- Subcategories are tenant-scoped, so we INSERT once per tenant. The CROSS JOIN
-- with `tenants` makes the seed idempotent across new tenants too.
-- ON CONFLICT (tenant_id, parent_code, code) keeps re-runs safe.

INSERT INTO subcategories
    (tenant_id, parent_category_id, parent_code, code, name_zh, name_en, description, icon_key, sort_order)
SELECT
    t.id,
    c.id,
    c.slug,
    sub.code,
    sub.name_zh,
    sub.name_en,
    sub.description,
    sub.icon_key,
    sub.sort_order
FROM tenants t
CROSS JOIN (
    VALUES
        -- legislation children (SPEC-05 §1.3)
        ('legislation',  'npc',                    '全国人大',           'NPC',                     '全国人民代表大会及其常委会发布的法律', 'landmark',  1),
        ('legislation',  'state-council',          '国务院',             'State Council',           '国务院发布的行政法规',                 'building',  2),
        ('legislation',  'local-pc',               '地方人大',           'Local PC',                '省/市级人民代表大会发布的地方性法规',  'map-pin',   3),
        ('legislation',  'consultation',           '法律修订征求意见',   'Consultation',            '法律修订草案及征求意见稿',             'message-square', 4),
        -- regulation children (SPEC-05 §1.3)
        ('regulation',   'cac',                    '网信办',             'CAC',                     '国家互联网信息办公室',                  'globe',      1),
        ('regulation',   'samr',                   '国家市场监督管理总局', 'SAMR',                  '国家市场监督管理总局',                   'briefcase',  2),
        ('regulation',   'cbirc-csrc',             '银保监会/证监会',    'CBIRC/CSRC',              '银保监会与证券监督管理委员会',          'banknote',   3),
        ('regulation',   'miit',                   '工信部',             'MIIT',                    '工业和信息化部',                        'cpu',        4),
        ('regulation',   'mps',                    '公安部',             'MPS',                     '公安部',                                 'shield',     5),
        ('regulation',   'customs',                '海关总署',           'GACC',                    '海关总署',                              'package',    6),
        -- enforcement children (basic-tier)
        ('enforcement',  'admin-penalty',          '行政处罚',           'Administrative Penalty',  '行政机关对违法行为的处罚决定',           'gavel',     1),
        ('enforcement',  'compliance-inspection',  '合规检查',           'Compliance Inspection',   '日常合规检查与专项检查',                 'clipboard-check', 2),
        ('enforcement',  'criminal-case',          '刑事案件',           'Criminal Case',           '涉及法律违规的刑事案件',                 'alert-triangle', 3)
) AS sub(parent_slug, code, name_zh, name_en, description, icon_key, sort_order)
JOIN categories c ON c.slug = sub.parent_slug AND c.deleted_at IS NULL
ON CONFLICT (tenant_id, parent_code, code) DO UPDATE SET
    name_zh     = EXCLUDED.name_zh,
    name_en     = EXCLUDED.name_en,
    description = EXCLUDED.description,
    icon_key    = EXCLUDED.icon_key,
    sort_order  = EXCLUDED.sort_order,
    is_active   = TRUE,
    updated_at  = NOW();
