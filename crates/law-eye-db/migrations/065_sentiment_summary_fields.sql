-- 065_sentiment_summary_fields.sql
-- Phase E (AI Integration): persist structured sentiment + tiered summary outputs.
--
-- The legacy `articles.sentiment TEXT` column stays as the canonical label. We add:
--   * sentiment_score / sentiment_rationale / sentiment_aspect — populated by Sentiment task
--     (SPEC-03 §1.3, prompt research/01 §2.3).
--   * summary_one_sentence / summary_three_sentences / summary_key_points — populated by the
--     three-tier Summarizer (SPEC-03 §1.5).
--
-- All columns are NULL-able and have no defaults beyond an empty JSONB array for key points so
-- existing rows remain unaffected until the worker backfills them.

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS sentiment_score DOUBLE PRECISION
        CHECK (sentiment_score IS NULL OR (sentiment_score >= 0.0 AND sentiment_score <= 1.0)),
    ADD COLUMN IF NOT EXISTS sentiment_rationale TEXT,
    ADD COLUMN IF NOT EXISTS sentiment_aspect TEXT
        CHECK (
            sentiment_aspect IS NULL OR sentiment_aspect IN (
                'compliance',
                'penalty',
                'litigation',
                'policy_change',
                'industry_trend',
                'regulatory_impact',
                'company_reputation',
                'policy_direction',
                'other'
            )
        ),
    ADD COLUMN IF NOT EXISTS summary_one_sentence TEXT,
    ADD COLUMN IF NOT EXISTS summary_three_sentences TEXT,
    ADD COLUMN IF NOT EXISTS summary_key_points JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Optional headline keywords list (SEO + search hint), used by Summarizer tier-1 output.
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS headline_keywords JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN articles.sentiment_score IS 'AI sentiment confidence/intensity in [0,1]; pairs with articles.sentiment label.';
COMMENT ON COLUMN articles.sentiment_rationale IS 'Short Chinese rationale (≤2 sentences) explaining the sentiment label.';
COMMENT ON COLUMN articles.sentiment_aspect IS 'Sentiment aspect bucket (penalty / litigation / compliance / policy_change / industry_trend / regulatory_impact / company_reputation / policy_direction / other).';
COMMENT ON COLUMN articles.summary_one_sentence IS '一句话摘要（≤50 字），由 Summarizer tier-1 输出。';
COMMENT ON COLUMN articles.summary_three_sentences IS '三句话摘要（80-200 字，事件/背景/影响），Summarizer tier-2 输出。';
COMMENT ON COLUMN articles.summary_key_points IS '关键点 JSON 数组（3-5 条要点），Summarizer tier-3 输出。';
COMMENT ON COLUMN articles.headline_keywords IS 'AI 提取的标题关键词 JSON 数组（2-5 项），用于搜索建议与 SEO。';
