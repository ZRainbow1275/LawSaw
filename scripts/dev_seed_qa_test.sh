#!/usr/bin/env bash
# dev_seed_qa_test.sh — Seed channels, articles, banners for the qa-test tenant.
#
# Idempotent: re-running this script is safe. Conflicts on existing rows are
# silently ignored (ON CONFLICT DO NOTHING).
#
# Source tenant: 38ae8043-1aa6-4157-8b59-28307245419c (1952 articles)
# Target tenant: c56cf182-f1fc-4363-b729-58b9030d21dd (qa-test)
#
# Usage:
#   bash scripts/dev_seed_qa_test.sh
#
# Requires the lawsaw-postgres-1 container to be running.

set -euo pipefail

CONTAINER="${CONTAINER:-lawsaw-postgres-1}"
DB="${DB:-law_eye}"
PG_USER="${PG_USER:-postgres}"

QA_TENANT="c56cf182-f1fc-4363-b729-58b9030d21dd"
SRC_TENANT="38ae8043-1aa6-4157-8b59-28307245419c"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[error] container ${CONTAINER} not running" >&2
  exit 1
fi

echo "[seed] tenant=${QA_TENANT}"

docker exec -i "${CONTAINER}" psql -U "${PG_USER}" -d "${DB}" -v ON_ERROR_STOP=1 \
  -v qa_tenant="${QA_TENANT}" -v src_tenant="${SRC_TENANT}" <<'SQL'
\set qa_tenant_lit '\'' :qa_tenant '\''
\set src_tenant_lit '\'' :src_tenant '\''

BEGIN;

-- 1) Seed a synthetic source for qa-test (articles require source_id in same tenant).
INSERT INTO sources (id, tenant_id, name, url, type, is_active, render_mode, health_status)
VALUES (
  '11111111-1111-4111-8111-111111111111'::uuid,
  :qa_tenant_lit::uuid,
  'QA Seed Source',
  'https://qa.lawsaw.local/seed',
  'rss',
  true,
  'static',
  'healthy'
)
ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

-- 2) Seed 3 channels for qa-test (linked to global categories).
WITH cat AS (
  SELECT slug, id FROM categories WHERE slug IN ('legislation','regulation','enforcement')
)
INSERT INTO channels (tenant_id, slug, name, description, linked_category_id, visibility, is_active)
SELECT :qa_tenant_lit::uuid, c.slug, c.name, c.description, c.cat_id, 'public', true
FROM (
  VALUES
    ('legislation', '立法前沿',  '立法动态与法律法规更新',                (SELECT id FROM cat WHERE slug='legislation')),
    ('regulation',  '监管动向',  '监管机构政策与合规要求',                (SELECT id FROM cat WHERE slug='regulation')),
    ('enforcement', '执法案例',  '行政处罚、司法裁判与执法实务',           (SELECT id FROM cat WHERE slug='enforcement'))
) AS c(slug, name, description, cat_id)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 3) Copy ~50 published articles from the populated tenant.
--    Generate fresh UUIDs, replace tenant_id and source_id, prefix link to avoid
--    cross-tenant dedupe and to keep this script idempotent
--    (idx_articles_tenant_link_unique on (tenant_id, link)).
--
--    Round-robin reassign category_id across the basic-tier-visible slugs
--    (legislation / regulation / enforcement) so basic_user sees feed content
--    after RBAC tier filtering (see law-eye-core/src/role_tier.rs).
WITH cat_basic AS (
  SELECT id, slug, ROW_NUMBER() OVER (ORDER BY slug) - 1 AS pos
  FROM categories
  WHERE slug IN ('legislation','regulation','enforcement')
),
src AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY published_at DESC NULLS LAST, id) - 1 AS rn,
    title, content, summary, author, published_at, risk_score, importance,
    sentiment, ai_metadata, tags, keywords,
    domain_root, domain_sub, authority_level, issuer, doc_number,
    effective_date, region_code, source_ref,
    link
  FROM articles
  WHERE tenant_id = :src_tenant_lit::uuid
    AND status = 'published'
    AND deleted_at IS NULL
  ORDER BY published_at DESC NULLS LAST, id
  LIMIT 50
)
INSERT INTO articles (
  id, tenant_id, source_id, category_id, title, link, content, summary,
  author, published_at, risk_score, importance, sentiment, ai_metadata,
  status, tags, keywords, domain_root, domain_sub, authority_level, issuer,
  doc_number, effective_date, region_code, source_ref
)
SELECT
  gen_random_uuid(),
  :qa_tenant_lit::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  (SELECT id FROM cat_basic WHERE pos = (src.rn % 3)),
  src.title,
  'https://qa-seed.lawsaw.local/' || md5(src.link),
  src.content,
  src.summary,
  src.author,
  src.published_at,
  src.risk_score,
  src.importance,
  src.sentiment,
  src.ai_metadata,
  'published',
  src.tags,
  src.keywords,
  src.domain_root,
  src.domain_sub,
  src.authority_level,
  src.issuer,
  src.doc_number,
  src.effective_date,
  src.region_code,
  src.source_ref
FROM src
ON CONFLICT (tenant_id, link) DO NOTHING;

-- 3b) For idempotent re-runs against pre-existing rows, ensure category_id of
--     qa-seeded articles is in the basic-visible set (round-robin by id ordering).
WITH cat_basic AS (
  SELECT id, slug, ROW_NUMBER() OVER (ORDER BY slug) - 1 AS pos
  FROM categories
  WHERE slug IN ('legislation','regulation','enforcement')
),
ranked AS (
  SELECT a.id,
         (ROW_NUMBER() OVER (ORDER BY a.published_at DESC NULLS LAST, a.id) - 1) % 3 AS pos
  FROM articles a
  WHERE a.tenant_id = :qa_tenant_lit::uuid
    AND a.source_id = '11111111-1111-4111-8111-111111111111'::uuid
    AND a.deleted_at IS NULL
)
UPDATE articles a
SET category_id = cb.id
FROM ranked r
JOIN cat_basic cb ON cb.pos = r.pos
WHERE a.id = r.id
  AND (a.category_id IS DISTINCT FROM cb.id);

-- 4) Seed 2 banners.
INSERT INTO banners (id, tenant_id, title, body, priority, status, starts_at, ends_at)
VALUES
  (
    '22222222-2222-4222-8222-222222222221'::uuid,
    :qa_tenant_lit::uuid,
    'QA 测试环境欢迎横幅',
    '欢迎使用 LawSaw QA 测试租户。此环境数据为种子数据，可用于功能验证。',
    100,
    'active',
    now() - interval '1 day',
    now() + interval '90 days'
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    :qa_tenant_lit::uuid,
    '法律法规更新公告',
    '近期已收录立法、监管与执法案例样本，欢迎在频道页与个性化Feed中查看。',
    200,
    'active',
    now() - interval '1 day',
    now() + interval '90 days'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

\echo '--- post-seed counts ---'
SELECT 'channels'  AS k, COUNT(*) FROM channels WHERE tenant_id = :qa_tenant_lit::uuid
UNION ALL SELECT 'articles', COUNT(*) FROM articles WHERE tenant_id = :qa_tenant_lit::uuid AND deleted_at IS NULL
UNION ALL SELECT 'banners',  COUNT(*) FROM banners  WHERE tenant_id = :qa_tenant_lit::uuid
UNION ALL SELECT 'sources',  COUNT(*) FROM sources  WHERE tenant_id = :qa_tenant_lit::uuid AND deleted_at IS NULL;
SQL

echo "[seed] done"
