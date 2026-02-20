-- Migration 031: Expand sources.type CHECK constraint for government site adapters
-- and seed the 17 pre-configured government data sources.

-- Step 1: Drop the restrictive CHECK constraint that only allows ('rss', 'spider', 'api').
-- The adapter registry validates types at runtime, so we use a permissive pattern.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;

-- Re-add with all known adapter types (including government profiles)
ALTER TABLE sources ADD CONSTRAINT sources_type_check
    CHECK (type IN (
        'rss', 'spider', 'api',
        'npc_gov', 'flk_npc', 'moj_gov', 'csrc_gov', 'cbirc_gov',
        'cac_gov', 'pbc_gov', 'court_gov', 'samr_gov', 'miit_gov',
        'shanghai_rd', 'beijing_rd', 'guangdong_rd',
        'gdpr_tracker', 'china_isc', 'china_cba', 'cnvd'
    ));

-- Step 2: Seed the 17 government data sources for the default tenant.
-- Uses ON CONFLICT to be idempotent (safe to re-run).
DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'default';
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Default tenant not found, skipping source seeding';
        RETURN;
    END IF;

    -- Set tenant context for RLS
    PERFORM set_config('app.tenant_id', v_tenant_id::text, true);

    -- ==================== Batch 3: Core Sources (10) ====================

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '全国人大网', 'http://www.npc.gov.cn/npc/c2/c183/flfg_list.shtml', 'npc_gov', '{}', '0 0 6 * * *', 10, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '国家法律法规数据库', 'https://flk.npc.gov.cn/index.html', 'flk_npc', '{}', '0 0 7 * * *', 10, true, 'dynamic', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '司法部', 'http://www.moj.gov.cn/pub/sfbgw/zcjd/zcjdzcfg/', 'moj_gov', '{}', '0 0 6 * * *', 9, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '中国证监会', 'http://www.csrc.gov.cn/csrc/c100028/common_list.shtml', 'csrc_gov', '{}', '0 0 8 * * *', 8, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '国家金融监管总局', 'https://www.cbirc.gov.cn/cn/view/pages/zhengcefagui/zhengcefagui.html', 'cbirc_gov', '{}', '0 0 8 * * *', 8, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '国家互联网信息办公室', 'http://www.cac.gov.cn/zcfg.htm', 'cac_gov', '{}', '0 0 7 * * *', 8, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '中国人民银行', 'http://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/index.html', 'pbc_gov', '{}', '0 0 6 * * *', 9, true, 'static', 'gbk')
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '最高人民法院', 'https://www.court.gov.cn/fabu/sfjs/', 'court_gov', '{}', '0 0 7 * * *', 9, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '市场监管总局', 'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/', 'samr_gov', '{}', '0 0 8 * * *', 7, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '工业和信息化部', 'https://www.miit.gov.cn/zwgk/zcwj/index.html', 'miit_gov', '{}', '0 0 8 * * *', 7, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    -- ==================== Extended Sources (7) ====================

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '上海市人大常委会', 'http://www.spcsc.sh.cn/n1939/n2440/n3334/index.html', 'shanghai_rd', '{}', '0 0 9 * * 1', 6, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '北京市人大常委会', 'http://www.bjrd.gov.cn/zyfb/dfxfg/', 'beijing_rd', '{}', '0 0 9 * * 1', 6, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '广东省人大常委会', 'http://www.rd.gd.cn/rdlf/flfg/', 'guangdong_rd', '{}', '0 0 9 * * 1', 6, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, 'GDPR Enforcement Tracker', 'https://www.enforcementtracker.com/', 'gdpr_tracker', '{}', '0 0 10 * * 3', 5, true, 'dynamic', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '中国互联网协会', 'https://www.isc.org.cn/zxzx/xhdt/', 'china_isc', '{}', '0 0 9 * * 2,5', 5, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, '中国银行业协会', 'https://www.china-cba.net/Index/show/catid/14.html', 'china_cba', '{}', '0 0 9 * * 2,5', 5, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO sources (tenant_id, name, url, type, config, schedule, priority, is_active, render_mode, encoding)
    VALUES (v_tenant_id, 'CNVD漏洞库', 'https://www.cnvd.org.cn/flaw/list.htm', 'cnvd', '{}', '0 0 10 * * *', 5, true, 'static', NULL)
    ON CONFLICT (tenant_id, url) WHERE deleted_at IS NULL DO NOTHING;

END $$;
