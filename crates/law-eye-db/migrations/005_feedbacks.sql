-- 005_feedbacks.sql

CREATE TABLE feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL
        CHECK (type IN ('source_suggestion', 'bug_report', 'feature_request', 'other')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    contact_email TEXT,
    source_url TEXT,
    source_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected')),
    admin_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedbacks_user ON feedbacks(user_id);
CREATE INDEX idx_feedbacks_status ON feedbacks(status);
CREATE INDEX idx_feedbacks_created ON feedbacks(created_at DESC);

CREATE TRIGGER update_feedbacks_updated_at
    BEFORE UPDATE ON feedbacks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

