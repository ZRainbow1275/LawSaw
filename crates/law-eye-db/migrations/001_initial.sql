-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sources table
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rss', 'spider', 'api')),
    config JSONB NOT NULL DEFAULT '{}',
    schedule TEXT,
    priority INT NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_fetch TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id),
    sort_order INT NOT NULL DEFAULT 0,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default categories
INSERT INTO categories (slug, name, description, icon, color, sort_order) VALUES
('legislation',    '立法前沿', '法律法规、政策文件、立法动态',     '📜', '#3498DB', 1),
('regulation',     '监管动向', '监管机构公告、处罚决定、指导意见', '🏛️', '#9B59B6', 2),
('enforcement',    '执法案例', '行政执法、司法判例、典型案例',     '⚖️', '#E74C3C', 3),
('industry',       '业界资讯', '企业动态、行业报告、市场分析',     '🏢', '#F39C12', 4),
('compliance',     '合规前沿', '合规指南、最佳实践、合规工具',     '✅', '#27AE60', 5),
('data',           '数据动态', '数据保护、隐私政策、跨境传输',     '📊', '#1ABC9C', 6),
('security',       '安全前哨', '网络安全、漏洞预警、威胁情报',     '🛡️', '#E91E63', 7),
('academic',       '学术文章', '论文研究、学术观点、专家解读',     '📚', '#795548', 8),
('events',         '重大事件', '突发事件、重大新闻、热点追踪',     '🔥', '#FF5722', 9),
('international',  '国际视野', '国际法规、跨境动态、全球趋势',     '🌍', '#2196F3', 10);

-- Articles table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id),
    category_id UUID REFERENCES categories(id),
    title TEXT NOT NULL,
    link TEXT NOT NULL UNIQUE,
    content TEXT,
    summary TEXT,
    author TEXT,
    published_at TIMESTAMPTZ,
    risk_score INT CHECK (risk_score BETWEEN 0 AND 100),
    importance INT CHECK (importance BETWEEN 1 AND 5),
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    ai_metadata JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'published', 'archived', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_articles_category ON articles(category_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_created ON articles(created_at DESC);
CREATE INDEX idx_articles_source ON articles(source_id);
CREATE INDEX idx_sources_active ON sources(is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sources_updated_at
    BEFORE UPDATE ON sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
