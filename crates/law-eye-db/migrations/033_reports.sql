-- 033_reports.sql
-- 周报/报告生成功能：报告模板表 + 报告表
--
-- 目标：
-- - 创建 report_templates 表（Tera 模板存储）
-- - 创建 reports 表（报告元数据 + 状态机 + content JSONB）
-- - 为两张表启用 RLS 租户隔离
-- - 插入默认的法律合规周报模板

-- =============================================================================
-- 1. report_templates 表 — 报告模板
-- =============================================================================

CREATE TABLE IF NOT EXISTS report_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    -- 模板类型：weekly / monthly / quarterly / custom
    period_type     TEXT NOT NULL DEFAULT 'weekly'
                    CHECK (period_type IN ('weekly', 'monthly', 'quarterly', 'custom')),
    -- Tera 模板内容（HTML）
    template_body   TEXT NOT NULL,
    -- 内联 CSS 样式
    css_styles      TEXT,
    -- 页面设置（页面大小、边距等）
    page_config     JSONB NOT NULL DEFAULT '{"page_size": "A4", "margin_top": "20mm", "margin_bottom": "20mm", "margin_left": "15mm", "margin_right": "15mm", "orientation": "portrait"}',
    -- 章节定义（报告的章节结构配置）
    sections_config JSONB NOT NULL DEFAULT '[]',
    -- 是否为系统内置模板（内置模板不可被租户删除）
    is_builtin      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    version         BIGINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE report_templates IS '报告模板：存储 Tera HTML 模板、CSS 样式和页面配置';
COMMENT ON COLUMN report_templates.template_body IS 'Tera 模板内容，使用 Tera 语法渲染为 HTML';
COMMENT ON COLUMN report_templates.css_styles IS '内联 CSS 样式，嵌入 HTML <style> 标签';
COMMENT ON COLUMN report_templates.page_config IS '页面设置：纸张大小、边距、方向等';
COMMENT ON COLUMN report_templates.sections_config IS '章节结构配置 JSON 数组';

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant
    ON report_templates(tenant_id);

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant_period
    ON report_templates(tenant_id, period_type)
    WHERE is_active = true;

-- RLS
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY report_templates_tenant_isolation
    ON report_templates
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 2. reports 表 — 报告实例
-- =============================================================================

CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- 报告编号：RPT-YYYYMMDD-XXXX
    report_number   TEXT NOT NULL,
    title           TEXT NOT NULL,
    -- 关联模板（可选，允许自由报告）
    template_id     UUID REFERENCES report_templates(id) ON DELETE SET NULL,
    -- 报告作者
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 报告期间
    period_type     TEXT NOT NULL DEFAULT 'weekly'
                    CHECK (period_type IN ('weekly', 'monthly', 'quarterly', 'custom')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    -- 状态机
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'generating', 'review', 'approved', 'published', 'archived')),
    -- AI 生成的报告内容（JSONB）
    content         JSONB NOT NULL DEFAULT '{}',
    -- 导出文件路径（MinIO object keys）
    export_pdf_key  TEXT,
    export_docx_key TEXT,
    export_html_key TEXT,
    -- 报告统计摘要
    article_count   INT NOT NULL DEFAULT 0,
    -- AI 生成元数据
    ai_model        TEXT,
    ai_generated_at TIMESTAMPTZ,
    -- 乐观锁
    version         BIGINT NOT NULL DEFAULT 1,
    -- 审计时间戳
    published_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 业务约束
    CONSTRAINT reports_period_valid CHECK (period_end >= period_start)
);

COMMENT ON TABLE reports IS '法律合规报告实例：周报/月报/季报，包含 AI 生成内容和导出文件路径';
COMMENT ON COLUMN reports.report_number IS '报告编号，格式 RPT-YYYYMMDD-XXXX';
COMMENT ON COLUMN reports.content IS 'AI 生成的报告内容 JSONB，包含各章节数据';
COMMENT ON COLUMN reports.status IS '状态机：draft→generating→draft→review→approved→published→archived';

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_tenant_number
    ON reports(tenant_id, report_number);

CREATE INDEX IF NOT EXISTS idx_reports_tenant_status
    ON reports(tenant_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_tenant_period
    ON reports(tenant_id, period_start DESC, period_end DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_author
    ON reports(author_id)
    WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
CREATE POLICY reports_tenant_isolation
    ON reports
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 3. 插入默认周报模板（为所有现有租户）
-- =============================================================================

INSERT INTO report_templates (tenant_id, name, description, period_type, template_body, css_styles, page_config, sections_config, is_builtin)
SELECT
    t.id,
    '法律合规周报',
    '默认法律合规周报模板，包含本周要闻、法规动态、风险提示和数据统计',
    'weekly',
    -- Tera 模板内容
    '<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>{{ title }}</title>
<style>{{ css }}</style>
</head>
<body>
<div class="cover">
  <h1>{{ title }}</h1>
  <p class="subtitle">报告期间：{{ period_start }} ~ {{ period_end }}</p>
  <p class="meta">报告编号：{{ report_number }}</p>
  <p class="meta">生成日期：{{ generated_at }}</p>
</div>

<div class="toc">
  <h2>目录</h2>
  <ul>
    <li><a href="#overview">一、本周概览</a></li>
    <li><a href="#highlights">二、重点法规动态</a></li>
    <li><a href="#risk">三、风险提示</a></li>
    <li><a href="#statistics">四、数据统计</a></li>
    <li><a href="#calendar">五、合规日历</a></li>
  </ul>
</div>

<section id="overview">
  <h2>一、本周概览</h2>
  <div class="overview-stats">
    <div class="stat-card">
      <span class="stat-number">{{ overview.total_articles }}</span>
      <span class="stat-label">收录文章</span>
    </div>
    <div class="stat-card">
      <span class="stat-number">{{ overview.high_importance_count }}</span>
      <span class="stat-label">重要法规</span>
    </div>
    <div class="stat-card">
      <span class="stat-number">{{ overview.high_risk_count }}</span>
      <span class="stat-label">高风险预警</span>
    </div>
  </div>
  {% if overview.ai_summary %}
  <div class="ai-summary">
    <h3>AI 摘要</h3>
    <p>{{ overview.ai_summary }}</p>
  </div>
  {% endif %}
</section>

<section id="highlights">
  <h2>二、重点法规动态</h2>
  {% for article in highlights %}
  <div class="article-card">
    <h3>{{ article.title }}</h3>
    <div class="article-meta">
      <span class="tag">{{ article.domain_label }}</span>
      {% if article.issuer %}<span class="issuer">{{ article.issuer }}</span>{% endif %}
      <span class="date">{{ article.published_at }}</span>
    </div>
    {% if article.summary %}<p class="summary">{{ article.summary }}</p>{% endif %}
  </div>
  {% endfor %}
</section>

<section id="risk">
  <h2>三、风险提示</h2>
  {% for item in risk_items %}
  <div class="risk-card risk-{{ item.level }}">
    <h4>{{ item.title }}</h4>
    <p>{{ item.description }}</p>
    <span class="risk-level">风险等级：{{ item.level_label }}</span>
  </div>
  {% endfor %}
</section>

<section id="statistics">
  <h2>四、数据统计</h2>
  <div class="charts-container">
    {% for chart in charts %}
    <div class="chart-wrapper">
      <h4>{{ chart.title }}</h4>
      {{ chart.svg | safe }}
    </div>
    {% endfor %}
  </div>
</section>

<section id="calendar">
  <h2>五、合规日历</h2>
  {% if calendar_events | length > 0 %}
  <table class="calendar-table">
    <thead><tr><th>日期</th><th>事项</th><th>类型</th></tr></thead>
    <tbody>
    {% for event in calendar_events %}
    <tr>
      <td>{{ event.date }}</td>
      <td>{{ event.title }}</td>
      <td>{{ event.event_type }}</td>
    </tr>
    {% endfor %}
    </tbody>
  </table>
  {% else %}
  <p class="empty-hint">本期无重要合规日程</p>
  {% endif %}
</section>

<footer>
  <p>本报告由 LawSaw 法律资讯平台自动生成</p>
</footer>
</body>
</html>',
    -- CSS 样式
    '* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color: #333; line-height: 1.8; padding: 20mm 15mm; }
.cover { text-align: center; padding: 60px 0 40px; border-bottom: 2px solid #1a56db; margin-bottom: 30px; }
.cover h1 { font-size: 28px; color: #1a56db; margin-bottom: 16px; }
.cover .subtitle { font-size: 16px; color: #555; margin-bottom: 8px; }
.cover .meta { font-size: 13px; color: #888; }
.toc { margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 8px; }
.toc h2 { font-size: 18px; margin-bottom: 12px; color: #1a56db; }
.toc ul { list-style: none; padding-left: 0; }
.toc li { padding: 4px 0; }
.toc a { color: #1a56db; text-decoration: none; }
h2 { font-size: 20px; color: #1a56db; border-left: 4px solid #1a56db; padding-left: 12px; margin: 30px 0 16px; }
.overview-stats { display: flex; gap: 16px; margin: 16px 0; }
.stat-card { flex: 1; text-align: center; background: #f0f6ff; border-radius: 8px; padding: 16px; }
.stat-number { display: block; font-size: 32px; font-weight: bold; color: #1a56db; }
.stat-label { font-size: 13px; color: #666; }
.ai-summary { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
.article-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
.article-card h3 { font-size: 16px; margin-bottom: 8px; }
.article-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.tag { background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.issuer { color: #6b7280; font-size: 13px; }
.date { color: #9ca3af; font-size: 13px; }
.summary { color: #555; font-size: 14px; }
.risk-card { border-radius: 8px; padding: 16px; margin: 12px 0; }
.risk-high { background: #fef2f2; border-left: 4px solid #ef4444; }
.risk-medium { background: #fffbeb; border-left: 4px solid #f59e0b; }
.risk-low { background: #f0fdf4; border-left: 4px solid #22c55e; }
.risk-level { font-size: 12px; font-weight: bold; }
.charts-container { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
.chart-wrapper { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
.chart-wrapper h4 { margin-bottom: 8px; font-size: 14px; color: #374151; }
.calendar-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
.calendar-table th, .calendar-table td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
.calendar-table th { background: #f9fafb; font-weight: 600; }
.empty-hint { color: #9ca3af; font-style: italic; padding: 16px 0; }
footer { text-align: center; padding: 30px 0 10px; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; margin-top: 40px; }',
    -- 页面配置
    '{"page_size": "A4", "margin_top": "20mm", "margin_bottom": "20mm", "margin_left": "15mm", "margin_right": "15mm", "orientation": "portrait"}'::jsonb,
    -- 章节配置
    '[
      {"type": "cover", "title": "封面", "enabled": true},
      {"type": "toc", "title": "目录", "enabled": true},
      {"type": "text", "title": "本周概览", "key": "overview", "enabled": true},
      {"type": "articles", "title": "重点法规动态", "key": "highlights", "enabled": true, "max_items": 10},
      {"type": "risk", "title": "风险提示", "key": "risk_items", "enabled": true},
      {"type": "charts", "title": "数据统计", "key": "charts", "enabled": true},
      {"type": "calendar", "title": "合规日历", "key": "calendar_events", "enabled": true}
    ]'::jsonb,
    true
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM report_templates rt
    WHERE rt.tenant_id = t.id AND rt.name = '法律合规周报' AND rt.is_builtin = true
);
